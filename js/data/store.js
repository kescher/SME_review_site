/* Application state: the review plan, saved drafts and submission progress. */

import { CONFIG } from '../../config.js';
import { ensureDoc, appendBlocks, submittedRefs } from '../api/docs.js';
import { fmtTime } from '../util.js';

/** Draft key and doc marker for the closing page. */
export const FINAL_REF = 'closing/remarks';

export const state = {
  reviewer: null,   // { email, name, domain, domainLabel }
  cases: [],
  docId: null,
  submitted: new Set(), // "caseId/transcriptId"
};

/* -- drafts (per reviewer, this browser) ---------------------------------- */

const draftKey = () => `sme.drafts.${state.reviewer?.email || 'anon'}`;

function readDrafts() {
  try { return JSON.parse(localStorage.getItem(draftKey()) || '{}'); }
  catch { return {}; }
}

function writeDrafts(all) {
  try { localStorage.setItem(draftKey(), JSON.stringify(all)); }
  catch { /* storage unavailable — answers still submit, they just don't persist */ }
}

export const getDraft = ref => readDrafts()[ref] || {};

export function saveDraft(ref, answers) {
  const all = readDrafts();
  all[ref] = { ...answers, _at: Date.now() };
  writeDrafts(all);
}

export function clearDraft(ref) {
  const all = readDrafts();
  delete all[ref];
  writeDrafts(all);
}

/* -- project overview ----------------------------------------------------- */

const welcomeKey = () => `sme.welcome.${state.reviewer?.email || 'anon'}`;

export function welcomeSeen() {
  try { return localStorage.getItem(welcomeKey()) === '1'; }
  catch { return false; }
}

export function markWelcomeSeen() {
  try { localStorage.setItem(welcomeKey(), '1'); } catch { /* noop */ }
}

/* -- progress ------------------------------------------------------------- */

export async function attachDoc() {
  if (CONFIG.DEMO) {
    state.docId = 'demo-doc';
    state.submitted = new Set(readDrafts()._submitted || []);
    return;
  }
  const { docId } = await ensureDoc(state.reviewer, state.reviewer.domainLabel);
  state.docId = docId;
  state.submitted = await submittedRefs(docId);
}

export const isSubmitted = ref => state.submitted.has(ref);

export function caseComplete(c) {
  return c.transcripts.every(t => isSubmitted(t.ref));
}

export const allComplete = () => state.cases.every(caseComplete);

/** Total transcripts submitted / available, for the progress rail. */
export function counts() {
  const total = state.cases.reduce((n, c) => n + c.transcripts.length, 0);
  const done = [...state.submitted].filter(ref => ref !== FINAL_REF).length;
  return { done, total };
}

/** First unfinished position, used to resume where the reviewer left off. */
export function nextStop() {
  for (let ci = 0; ci < state.cases.length; ci++) {
    const c = state.cases[ci];
    const ti = c.transcripts.findIndex(t => !isSubmitted(t.ref));
    if (ti >= 0) return { caseId: c.id, index: ti, fresh: ti === 0 };
  }
  return null;
}

/* -- submission ----------------------------------------------------------- */

export async function submitAnswers(theCase, transcript, answers) {
  // The provenance line is for analysis, not for the reviewer: the model and
  // condition are never shown in the UI, only recorded here.
  const provenance = [transcript.model, transcript.condition]
    .filter(Boolean).join(' · ');

  const blocks = [
    { type: 'h2', text: `${theCase.title} — Transcript ${transcript.number}` },
    { type: 'p',  text: `Submitted ${fmtTime()} · ref ${transcript.ref}` +
                        (provenance ? ` · ${provenance}` : '') },
  ];

  for (const q of CONFIG.QUESTIONS) {
    blocks.push({ type: 'h3', text: q.label });
    blocks.push({ type: 'html', html: answers[q.id] || '<p>(no answer)</p>' });
  }

  if (CONFIG.DEMO) {
    const all = readDrafts();
    all._submitted = [...new Set([...(all._submitted || []), transcript.ref])];
    writeDrafts(all);
    console.info('[demo] would append to Google Doc:', blocks);
  } else {
    await appendBlocks(state.docId, blocks);
  }

  state.submitted.add(transcript.ref);
  clearDraft(transcript.ref);
}

/** The closing page, submitted once after every transcript is done. */
export async function submitFinal(answers) {
  const blocks = [
    { type: 'h2', text: 'Closing remarks' },
    { type: 'p',  text: `Submitted ${fmtTime()} · ref ${FINAL_REF}` },
  ];

  for (const q of CONFIG.FINAL_QUESTIONS) {
    blocks.push({ type: 'h3', text: q.label });
    blocks.push({ type: 'html', html: answers[q.id] || '<p>(no answer)</p>' });
  }

  if (CONFIG.DEMO) {
    const all = readDrafts();
    all._submitted = [...new Set([...(all._submitted || []), FINAL_REF])];
    writeDrafts(all);
    console.info('[demo] would append to Google Doc:', blocks);
  } else {
    await appendBlocks(state.docId, blocks);
  }

  state.submitted.add(FINAL_REF);
  clearDraft(FINAL_REF);
}

export const finalSubmitted = () => state.submitted.has(FINAL_REF);

export function reset() {
  state.reviewer = null;
  state.cases = [];
  state.docId = null;
  state.submitted = new Set();
}
