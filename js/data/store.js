/* Application state: the review plan, saved answers and submission progress. */

import { CONFIG } from '../../config.js';
import { ensureDoc, appendBlocks, submittedRefs, filingWarnings } from '../api/docs.js';
import { casesFor, labelFor } from './schema.js';
import { fmtTime, toast } from '../util.js';

export const state = {
  study: null,      // the whole study, so the reviewer can switch domain
  domains: [],      // [{ key, label, cases, transcripts }]
  suggested: '',    // domain from the roster, offered as the default
  reviewer: null,   // { email, name, domain, domainLabel }
  cases: [],        // cases for the selected domain
  docId: null,
  submitted: new Set(), // "<domain>/<caseId>/<transcriptId>"
};

/* -- per-reviewer local storage ------------------------------------------- */

const key = (kind) => `sme.${kind}.${state.reviewer?.email || 'anon'}`;

function read(kind) {
  try { return JSON.parse(localStorage.getItem(key(kind)) || '{}'); }
  catch { return {}; }
}

function write(kind, value) {
  try { localStorage.setItem(key(kind), JSON.stringify(value)); }
  catch { /* storage unavailable — answers still submit, they just don't persist */ }
}

/* -- answers -------------------------------------------------------------- */

/**
 * Answers are kept after submission, not cleared, so going back to a transcript
 * shows what was written. They live in this browser only: a reviewer who moves
 * to another machine sees their progress (that comes from the document) but not
 * the text of answers already submitted.
 */
export const getAnswers = ref => read('answers')[ref] || {};

export function saveAnswers(ref, answers) {
  const all = read('answers');
  all[ref] = { ...all[ref], ...answers, _at: Date.now() };
  write('answers', all);
}

function markSubmitted(ref, answers) {
  const all = read('answers');
  all[ref] = { ...answers, _at: Date.now(), _submittedAt: Date.now() };
  write('answers', all);
}

/* -- project overview ----------------------------------------------------- */

export const welcomeSeen = () => read('flags').welcome === true;

export function markWelcomeSeen() {
  write('flags', { ...read('flags'), welcome: true });
}

/* -- domain selection ----------------------------------------------------- */

export const storedDomain = () => read('flags').domain || '';

export function selectDomain(domainKey) {
  const found = state.domains.find(d => d.key === domainKey);
  if (!found) return false;

  state.reviewer.domain = domainKey;
  state.reviewer.domainLabel = labelFor(state.study, domainKey);
  state.cases = casesFor(state.study, domainKey);

  write('flags', { ...read('flags'), domain: domainKey });
  return true;
}

export const hasDomain = () => Boolean(state.reviewer?.domain);

/** Submitted transcripts per domain, for the chooser. */
export function progressByDomain() {
  const out = {};
  for (const d of state.domains) {
    const prefix = `${d.key}/`;
    out[d.key] = [...state.submitted]
      .filter(ref => ref.startsWith(prefix) && ref !== finalRefFor(d.key)).length;
  }
  return out;
}

/* -- progress ------------------------------------------------------------- */

export async function attachDoc() {
  if (CONFIG.DEMO) {
    state.docId = 'demo-doc';
    state.submitted = new Set(read('flags').submitted || []);
    return;
  }
  const { docId } = await ensureDoc(state.reviewer);
  state.docId = docId;
  state.submitted = await submittedRefs(docId);

  for (const warning of filingWarnings.splice(0)) toast(warning, 'bad');
}

export const isSubmitted = ref => state.submitted.has(ref);

export const caseComplete = c => c.transcripts.every(t => isSubmitted(t.ref));

export const allComplete = () => state.cases.length > 0 && state.cases.every(caseComplete);

/** Transcripts submitted / available in the current domain. */
export function counts() {
  const total = state.cases.reduce((n, c) => n + c.transcripts.length, 0);
  const done = state.cases
    .flatMap(c => c.transcripts)
    .filter(t => isSubmitted(t.ref)).length;
  return { done, total };
}

/** First unfinished position in the current domain. */
export function nextStop() {
  for (const c of state.cases) {
    const index = c.transcripts.findIndex(t => !isSubmitted(t.ref));
    if (index >= 0) return { caseId: c.id, index, fresh: index === 0 };
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
    { type: 'h2', text: `${state.reviewer.domainLabel} — ${theCase.title} — Transcript ${transcript.number}` },
    { type: 'p',  text: `Submitted ${fmtTime()} · ref ${transcript.ref}` +
                        (provenance ? ` · ${provenance}` : '') },
  ];

  for (const q of CONFIG.QUESTIONS) {
    blocks.push({ type: 'h3', text: q.label });
    blocks.push({ type: 'html', html: answers[q.id] || '<p>(no answer)</p>' });
  }

  await append(blocks, transcript.ref);
  markSubmitted(transcript.ref, answers);
}

/** The closing page, submitted once per domain after every transcript is done. */
export async function submitFinal(answers) {
  const ref = finalRef();

  const blocks = [
    { type: 'h2', text: `${state.reviewer.domainLabel} — Closing remarks` },
    { type: 'p',  text: `Submitted ${fmtTime()} · ref ${ref}` },
  ];

  for (const q of CONFIG.FINAL_QUESTIONS) {
    blocks.push({ type: 'h3', text: q.label });
    blocks.push({ type: 'html', html: answers[q.id] || '<p>(no answer)</p>' });
  }

  await append(blocks, ref);
  markSubmitted(ref, answers);
}

async function append(blocks, ref) {
  if (CONFIG.DEMO) {
    const flags = read('flags');
    write('flags', {
      ...flags,
      submitted: [...new Set([...(flags.submitted || []), ref])],
    });
    console.info('[demo] would append to Google Doc:', blocks);
  } else {
    await appendBlocks(state.docId, blocks);
  }
  state.submitted.add(ref);
}

const finalRefFor = domainKey => `${domainKey}/closing/remarks`;
export const finalRef = () => finalRefFor(state.reviewer?.domain || 'unknown');
export const finalSubmitted = () => state.submitted.has(finalRef());

export function reset() {
  state.study = null;
  state.domains = [];
  state.suggested = '';
  state.reviewer = null;
  state.cases = [];
  state.docId = null;
  state.submitted = new Set();
}
