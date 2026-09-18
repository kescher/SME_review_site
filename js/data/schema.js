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

/**
 * Validate the reviewer against the roster and return the whole study, so the
 * chooser can offer every area. The domain itself is picked afterwards.
 */
export async function loadReviewer(profile) {
  const study = await loadStudy();

  // Demo mode skips the roster so the workflow can be previewed without an
  // account. It exposes nothing that data/study.json does not already serve.
  const me = CONFIG.DEMO
    ? { name: 'Demo Reviewer', domain: CONFIG.DEMO_DOMAIN }
    : study.reviewers.find(r => r.email.toLowerCase() === profile.email.toLowerCase());

  if (!me) {
    throw new NotOnRoster(
      `${profile.email} is not on the reviewer roster for this study.`);
  }

  const domains = Object.entries(study.domains || {})
    .filter(([, d]) => d.cases?.length)
    .map(([key, d]) => ({
      key,
      label: d.label || DOMAINS[key] || key,
      cases: d.cases.length,
      transcripts: d.cases.reduce((n, c) => n + c.transcripts.length, 0),
    }));

  if (!domains.length) {
    throw new NotConfigured('No cases are configured for any domain yet.');
  }

  // A domain on the roster is a default for the chooser, not a restriction.
  const suggested = normDomain(me.domain || '');

  return {
    study,
    reviewer: { email: profile.email, name: me.name || profile.name },
    domains,
    suggested: domains.some(d => d.key === suggested) ? suggested : '',
  };
}

/** The cases for one domain, with progress keys attached. */
export function casesFor(study, domainKey) {
  const bucket = study.domains?.[domainKey];
  if (!bucket) return [];
  return bucket.cases.map(c => withRefs(c, domainKey));
}

export const labelFor = (study, domainKey) =>
  study.domains?.[domainKey]?.label || DOMAINS[domainKey] || domainKey;

/**
 * Attach the progress key used for drafts and for the marker written into the
 * answer document. Domain-qualified, because case ids repeat across domains
 * (every domain has a "case-1") and a reviewer may cover more than one.
 */
const withRefs = (c, domain) => ({
  ...c,
  domain,
  transcripts: c.transcripts
    .slice(0, CONFIG.TRANSCRIPTS_PER_CASE)
    .map((t, i) => ({ ...t, number: i + 1, ref: `${domain}/${c.id}/${t.id}` })),
});

/* -- sources -------------------------------------------------------------- */

async function loadStudy() {
  if (CONFIG.DATA_SOURCE === 'sheets') return loadFromSheets();
  return loadStatic();
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
  if (!CONFIG.SCOPES.includes('spreadsheets')) {
    throw new NotConfigured(
      "DATA_SOURCE is 'sheets', but CONFIG.SCOPES no longer requests " +
      "spreadsheets.readonly (and drive.readonly for Drive-hosted PDFs). " +
      'Add them back, or use the default static source.');
  }

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
