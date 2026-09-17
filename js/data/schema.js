/* Builds the review plan for one signed-in reviewer.
 *
 * Two sources, selected by CONFIG.DATA_SOURCE:
 *   static — data/study.json, built by `node tools/build-study.mjs`
 *   sheets — the spreadsheet, read live through the Sheets API
 *
 * CONFIG.DEMO is separate: it reads the same data but skips the roster and
 * writes nothing to Google.
 */

import { CONFIG, COLUMNS, DOMAINS } from '../../config.js';
import { readTabs, col } from '../api/sheets.js';
import { indexPdfFolder } from '../api/drive.js';

export class NotOnRoster extends Error {}
export class NotConfigured extends Error {}

export const normDomain = s =>
  String(s ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export async function loadAssignment(profile) {
  const study = await loadStudy();

  // Demo mode skips the roster so the workflow can be previewed without an
  // account. It exposes nothing that data/study.json does not already serve.
  const me = CONFIG.DEMO
    ? demoReviewer(study)
    : study.reviewers.find(r => r.email.toLowerCase() === profile.email.toLowerCase());

  if (!me) {
    throw new NotOnRoster(
      `${profile.email} is not on the reviewer roster for this study.`);
  }

  const domain = normDomain(me.domain);
  const bucket = study.domains[domain];

  if (!bucket || !bucket.cases.length) {
    throw new NotConfigured(
      `No cases are configured for the "${DOMAINS[domain] || me.domain || domain}" ` +
      'domain yet.');
  }

  return {
    reviewer: {
      email: profile.email,
      name: me.name || profile.name,
      domain,
      domainLabel: bucket.label || DOMAINS[domain] || me.domain,
    },
    cases: bucket.cases.map(withRefs),
  };
}

/** Attach the stable "caseId/transcriptId" key used for drafts and progress. */
const withRefs = c => ({
  ...c,
  transcripts: c.transcripts
    .slice(0, CONFIG.TRANSCRIPTS_PER_CASE)
    .map((t, i) => ({ ...t, number: i + 1, ref: `${c.id}/${t.id}` })),
});

/* -- sources -------------------------------------------------------------- */

async function loadStudy() {
  if (CONFIG.DATA_SOURCE === 'sheets') return loadFromSheets();
  return loadStatic();
}

/** In demo mode, review the domain named by CONFIG.DEMO_DOMAIN, or the first. */
function demoReviewer(study) {
  const available = Object.keys(study.domains || {});
  const domain = available.includes(CONFIG.DEMO_DOMAIN)
    ? CONFIG.DEMO_DOMAIN
    : available[0];

  if (!domain) return null;
  // Only name and domain are read; the email comes from the signed-in profile.
  return { name: 'Demo Reviewer', domain };
}

async function loadStatic() {
  const res = await fetch(CONFIG.DATA_FILE, { cache: 'no-cache' });
  if (!res.ok) {
    throw new NotConfigured(
      `Could not load ${CONFIG.DATA_FILE} (HTTP ${res.status}). ` +
      'Run `node tools/build-study.mjs` and commit the result.');
  }
  return res.json();
}

/* -- live spreadsheet ----------------------------------------------------- */

async function loadFromSheets() {
  const tabs = [CONFIG.REVIEWERS_TAB, ...Object.values(CONFIG.DOMAIN_TABS)];
  const [tables, pdfIndex] = await Promise.all([
    readTabs(tabs),
    indexPdfFolder(),
  ]);

  const R = COLUMNS.reviewers;
  const reviewers = (tables[CONFIG.REVIEWERS_TAB] || []).map(r => ({
    email: col(r, R.email).toLowerCase(),
    name: col(r, R.name),
    domain: normDomain(col(r, R.domain)),
  })).filter(r => r.email);

  const domains = {};
  for (const [key, tab] of Object.entries(CONFIG.DOMAIN_TABS)) {
    const rows = tables[tab] || [];
    if (!rows.length) continue;
    domains[key] = { label: DOMAINS[key] || tab, tab, cases: groupCases(rows, pdfIndex) };
  }

  return { reviewers, domains };
}

function groupCases(rows, pdfIndex) {
  const T = COLUMNS.transcripts;
  const hasIds = rows.some(r => col(r, T.caseId));
  const groups = new Map();

  rows.forEach((row, i) => {
    const key = hasIds
      ? col(row, T.caseId)
      : `block-${Math.floor(i / CONFIG.TRANSCRIPTS_PER_CASE) + 1}`;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([id, group], i) => ({
    id: String(id),
    title: col(group[0], T.caseTitle) || `Case ${i + 1}`,
    instructions: group.map(r => col(r, T.instructions)).find(Boolean) || '',
    transcripts: group
      .slice()
      .sort((a, b) => num(col(a, T.order)) - num(col(b, T.order)))
      .map((row, j) => ({
        id: col(row, T.transcriptId) || `${id}-t${j + 1}`,
        pdfFileId: driveId(col(row, T.pdfFileId)),
        pdfName: col(row, T.pdfFileName),
        pdfPath: '',
        prompt: col(row, T.prompt),
        followup1: col(row, T.followup1),
        followup2: col(row, T.followup2),
        labels: col(row, T.labels),
      }))
      .map(t => ({
        ...t,
        pdfFileId: t.pdfFileId || resolveByName(t.pdfName, pdfIndex),
      })),
  }));
}

const driveId = raw => (String(raw ?? '').match(/[-\w]{25,}/) || [''])[0];

const resolveByName = (name, index) => {
  if (!name) return '';
  return index.get(name.toLowerCase())
      || index.get(name.replace(/\.pdf$/i, '').toLowerCase())
      || '';
};

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};
