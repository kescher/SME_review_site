/* Bootstrap and hash router. */

import { CONFIG } from '../config.js';
import { $, el, clear, toast } from './util.js';
import * as auth from './auth.js';
import { loadReviewer, NotOnRoster, NotConfigured } from './data/schema.js';
import {
  state, attachDoc, nextStop, caseComplete, allComplete, reset,
  welcomeSeen, markWelcomeSeen, finalSubmitted,
  selectDomain, hasDomain, storedDomain,
} from './data/store.js';
import { renderLogin } from './ui/login.js';
import { renderWelcome } from './ui/welcome.js';
import { renderFinal } from './ui/final.js';
import { renderDomain } from './ui/domain.js';
import { renderInstructions } from './ui/instructions.js';
import { renderReview } from './ui/review.js';
import { renderDone } from './ui/done.js';

const root = $('#app');
let loginError = '';
let mounted = null;

/* `?demo=1` previews the flow without signing in, if the deployment allows it. */
const params = new URLSearchParams(location.search);
if (CONFIG.ALLOW_DEMO && params.get('demo') === '1') {
  CONFIG.DEMO = true;
  // ?domain=personal_injury previews another domain without editing config.
  if (params.get('domain')) CONFIG.DEMO_DOMAIN = params.get('domain');
}

/* -- rendering ------------------------------------------------------------ */

function mount(node) {
  mounted?.__destroy?.();
  clear(root);
  root.append(node);
  mounted = node;
}

function busy(message) {
  mount(el('div', { class: 'boot' }, [el('div', { class: 'spinner' }), el('p', {}, message)]));
}

const go = hash => { location.hash = hash; };

/* -- session -------------------------------------------------------------- */

async function startSession() {
  // Two phases, reported separately: the study data is a static file and never
  // touches Google, so a Google error here is always the document step.
  busy('Loading your assignment…');
  try {
    const { study, reviewer, domains, suggested } = await loadReviewer(auth.profile);
    state.study = study;
    state.reviewer = reviewer;
    state.domains = domains;
    state.suggested = suggested;
  } catch (err) {
    return failSession(err, 'Could not load the study data.');
  }

  busy('Opening your review document…');
  try {
    await attachDoc();
  } catch (err) {
    return failSession(err, 'Could not open your review document in Google.');
  }

  // Restore a previous choice; otherwise the chooser is the first screen.
  selectDomain(storedDomain());

  loginError = '';
  route(true);
}

function failSession(err, prefix) {
  console.error(err);

  loginError = (err instanceof NotOnRoster || err instanceof NotConfigured)
    ? err.message
    : `${prefix} ${err.message || err}`;

  // Keep the granted consent: these failures are nearly always configuration,
  // and the reviewer should be able to retry with one click.
  auth.signOut({ revoke: false });
  reset();
  render();
}

async function signIn() {
  try {
    await auth.signIn();
    await startSession();
  } catch (err) {
    console.error(err);
    loginError = err.message || 'Sign-in failed.';
    render();
  }
}

function signOut() {
  auth.signOut();
  reset();
  loginError = '';
  go('#/');
  render();
}

/* -- routing -------------------------------------------------------------- */

function parseHash() {
  const [, screen, caseId, idx] = (location.hash || '').split('/');
  return { screen: screen || '', caseId: caseId ? decodeURIComponent(caseId) : '', index: Number(idx) };
}

/** Send the reviewer to wherever they left off. */
function resume() {
  // Area of expertise first, then the project overview, then the cases.
  if (!hasDomain()) return go('#/domain');
  if (!welcomeSeen()) return go('#/welcome');

  const stop = nextStop();
  if (!stop) return go(finalSubmitted() ? '#/done' : '#/final');

  go(stop.fresh
    ? `#/instructions/${encodeURIComponent(stop.caseId)}`
    : `#/review/${encodeURIComponent(stop.caseId)}/${stop.index}`);
}

/** Where the overview's "Begin the review" button leads. */
function firstStop() {
  if (!hasDomain()) return '#/domain';
  const stop = nextStop();
  if (!stop) return finalSubmitted() ? '#/done' : '#/final';
  return stop.fresh
    ? `#/instructions/${encodeURIComponent(stop.caseId)}`
    : `#/review/${encodeURIComponent(stop.caseId)}/${stop.index}`;
}

function render() {
  if (!auth.isSignedIn() || !state.reviewer) {
    return mount(renderLogin({ error: loginError, onSignIn: signIn }));
  }
  route();
}

function route(replaceIfEmpty = false) {
  const { screen, caseId, index } = parseHash();

  if (!screen || (replaceIfEmpty && screen === '')) return resume();

  if (screen === 'domain') {
    return mount(renderDomain({
      onSignOut: signOut,
      onChosen: () => go(welcomeSeen() ? firstStop() : '#/welcome'),
    }));
  }

  // Every other screen needs a domain.
  if (!hasDomain()) return resume();

  if (screen === 'welcome') {
    return mount(renderWelcome({
      onSignOut: signOut,
      onStart: () => { markWelcomeSeen(); go(firstStop()); },
    }));
  }

  if (screen === 'final') {
    return mount(renderFinal({ onSignOut: signOut, onDone: () => go('#/done') }));
  }

  if (screen === 'done') {
    return mount(renderDone({ onSignOut: signOut, onRestart: () => go('#/') }));
  }

  const theCase = state.cases.find(c => c.id === caseId);
  if (!theCase) return resume();

  if (screen === 'instructions') {
    return mount(renderInstructions({
      theCase,
      onSignOut: signOut,
      onStart: () => {
        const first = theCase.transcripts.findIndex(t => !state.submitted.has(t.ref));
        go(`#/review/${encodeURIComponent(theCase.id)}/${first < 0 ? 0 : first}`);
      },
    }));
  }

  if (screen === 'review') {
    const i = Number.isInteger(index) && index >= 0 && index < theCase.transcripts.length ? index : 0;
    return mount(renderReview({
      theCase,
      index: i,
      onSignOut: signOut,
      onNavigate: next => go(`#/review/${encodeURIComponent(theCase.id)}/${next}`),
      onDone: finished => advance(theCase, finished),
    }));
  }

  resume();
}

/** After a submission: next transcript, next case's instructions, or finish. */
function advance(theCase, finishedIndex) {
  const next = finishedIndex + 1;
  if (next < theCase.transcripts.length) {
    return go(`#/review/${encodeURIComponent(theCase.id)}/${next}`);
  }
  if (allComplete()) return go(finalSubmitted() ? '#/done' : '#/final');

  const position = state.cases.findIndex(c => c.id === theCase.id);
  const upcoming = state.cases.slice(position + 1).find(c => !caseComplete(c))
                || state.cases.find(c => !caseComplete(c));

  if (!upcoming) return go(finalSubmitted() ? '#/done' : '#/final');
  go(`#/instructions/${encodeURIComponent(upcoming.id)}`);
}

window.addEventListener('hashchange', () => {
  if (auth.isSignedIn() && state.reviewer) route();
});

/* -- boot ----------------------------------------------------------------- */

(async function boot() {
  try {
    await auth.init();
  } catch (err) {
    console.error(err);
    loginError = err.message;
  }

  if (auth.isSignedIn()) await startSession();
  else render();
})().catch(err => {
  console.error(err);
  toast(String(err.message || err), 'bad');
});
