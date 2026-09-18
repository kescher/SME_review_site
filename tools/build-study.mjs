#!/usr/bin/env node
/* Build data/study.json from the transcripts/ folder.
 *
 *   node tools/build-study.mjs             # parse transcripts/, write study.json
 *   node tools/build-study.mjs --sheet     # also merge roster + gold labels
 *                                          # from the Google Sheet
 *   node tools/build-study.mjs --check     # report what parsed, write nothing
 *
 * Each domain folder holds one "UPLBench SME Review - <Domain>.md" describing
 * both cases (brief, prompt components, rubric, and the five sample
 * transcripts in order) alongside the transcript PDFs themselves. That document
 * is the source of truth; the spreadsheet supplies only the reviewer roster and
 * the gold labels, which the markdown does not carry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'transcripts');
const OPINIONS = path.join(ROOT, 'cases');
const OUT = path.join(ROOT, 'data', 'study.json');
const ROSTER = path.join(ROOT, 'reviewers.json');
const OVERRIDES = path.join(ROOT, 'opinions.json');

const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);

const DOMAIN_KEY = {
  'bankruptcy': 'bankruptcy',
  'immigration': 'immigration',
  'personal injury': 'personal_injury',
  'family law': 'family_law',
  'foreclosure': 'foreclosure',
};

/* -- markdown helpers ----------------------------------------------------- */

/** Rows of a pipe table as arrays of trimmed cells, separator row dropped. */
function parseTable(lines) {
  return lines
    .filter(l => l.trim().startsWith('|'))
    .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
    .filter(cells => !cells.every(c => /^-{2,}$/.test(c)));
}

/** The lines under "### <name>", up to the next heading. */
function section(block, name) {
  const lines = block.split('\n');
  const start = lines.findIndex(l => l.trim() === `### ${name}`);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,3}\s/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

/** A rubric cell is flattened prose: "No UPL: - a - b Yes UPL: - c". */
function parseRubricCell(cell) {
  const raw = String(cell || '').trim();
  if (!raw) return { noUpl: [], yesUpl: [], text: '' };

  const split = raw.split(/\bYes UPL:\s*/i);
  const noPart = (split[0] || '').replace(/^\s*No UPL:\s*/i, '');
  const yesPart = split.slice(1).join(' ');

  const bullets = s => s
    .split(/\s+-\s+/)
    .map(x => x.replace(/^[-\s]+/, '').trim())
    .filter(Boolean);

  const noUpl = bullets(noPart);
  const yesUpl = bullets(yesPart);

  // Keep the original too, so the UI can fall back if a cell does not follow
  // the No/Yes shape.
  return { noUpl, yesUpl, text: raw };
}

/* -- parsing one domain --------------------------------------------------- */

function parseDomain(folder) {
  const dir = path.join(SRC, folder);
  const doc = fs.readdirSync(dir).find(f => /^UPLBench SME Review.*\.md$/i.test(f));
  if (!doc) throw new Error(`No "UPLBench SME Review" markdown in ${folder}/`);

  const md = fs.readFileSync(path.join(dir, doc), 'utf8');
  const available = new Set(fs.readdirSync(dir));

  // Split on the CASE headings, keeping each heading with its block.
  const parts = md.split(/^##\s+CASE\s+(\d+)\s*:\s*(.+)$/gm);
  const cases = [];
  const warnings = [];

  for (let i = 1; i < parts.length; i += 3) {
    const number = Number(parts[i]);
    const citation = parts[i + 1].trim().replace(/\.$/, '');
    const block = parts[i + 2];

    const brief = parseTable(section(block, 'Case Brief'))[1] || [];
    const prompt = parseTable(section(block, 'Prompt Components'))[1] || [];
    const rubric = parseTable(section(block, 'Rubric'))[1] || [];

    const transcripts = section(block, 'Sample Transcripts')
      .map(l => l.match(/^\s*-\s*\[([^\]]*)\]\(([^)]+)\)\s*$/))
      .filter(Boolean)
      .map((m, j) => {
        const label = m[1];
        const file = decodeURIComponent(m[2]);
        const [model, note] = label.split(/\s+[—–-]\s+/);

        if (!available.has(file)) {
          warnings.push(`${folder}: case ${number} lists "${file}", which is not in the folder`);
        }

        return {
          id: slug(file.replace(/\.pdf$/i, '')),
          number: j + 1,
          // Blinded in the UI, recorded in the answer document.
          model: (model || '').trim(),
          condition: (note || '').trim(),
          pdfPath: `transcripts/${encode(folder)}/${encode(file)}`,
          pdfFileId: '',
          pdfName: file,
          labels: '',
          prompt: parseRubricCell(rubric[0]),
          followup1: parseRubricCell(rubric[1]),
          followup2: parseRubricCell(rubric[2]),
        };
      });

    if (transcripts.length !== 5) {
      warnings.push(`${folder}: case ${number} has ${transcripts.length} transcripts, expected 5`);
    }

    cases.push({
      id: `case-${number}`,
      number,
      title: shortTitle(citation),
      citation,
      brief: {
        facts: brief[0] || '',
        reasoning: brief[1] || '',
        outcome: brief[2] || '',
        harms: brief[3] || '',
      },
      scenario: {
        facts: prompt[0] || '',
        jurisdiction: prompt[1] || '',
        task: prompt[2] || '',
        followup1: prompt[3] || '',
        followup2: prompt[4] || '',
      },
      instructions: '',
      opinionPath: '',
      opinionName: '',
      // The same rubric applies to all five transcripts, so the case page can
      // show it beside the prompts.
      rubric: {
        prompt: parseRubricCell(rubric[0]),
        followup1: parseRubricCell(rubric[1]),
        followup2: parseRubricCell(rubric[2]),
      },
      transcripts,
    });
  }

  return { cases: cases.sort((a, b) => a.number - b.number), warnings };
}

/** "The Florida Bar v. Catarcio, 709 So. 2d 96 (Fla. 1998)" -> the case name. */
const shortTitle = citation => citation.split(/,\s*\d/)[0].trim();

const slug = s => s.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

/** Encode each path segment for use in a URL, keeping the separators. */
const encode = s => s.split('/').map(encodeURIComponent).join('/');

/* -- judicial opinions ---------------------------------------------------- */

/**
 * Every PDF under cases/, at any depth. The domain is taken from whichever
 * path component names one, so cases/<Domain>/x.pdf and cases/cases/<Domain>/
 * x.pdf and a flat cases/x.pdf all work.
 */
function indexOpinions() {
  if (!fs.existsSync(OPINIONS)) return [];

  const domainNames = new Set(Object.keys(DOMAIN_KEY));
  const found = [];

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.pdf$/i.test(entry.name)) continue;

      const rel = path.relative(OPINIONS, full);
      const parts = rel.split(path.sep).slice(0, -1);
      const folder = parts.find(part => domainNames.has(part.toLowerCase())) || '';

      found.push({
        file: entry.name,
        folder,
        rel,
        slug: slug(entry.name.replace(/\.pdf$/i, '')),
      });
    }
  };
  walk(OPINIONS);
  return found;
}

/**
 * Optional opinions.json at the project root, for files whose name cannot
 * identify the case — a download named after its docket number, say.
 * Keys are the case title or "<domain>/<case-id>"; values are paths under
 * cases/.
 */
function loadOverrides() {
  if (!fs.existsSync(OVERRIDES)) return new Map();
  const raw = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
  return new Map(Object.entries(raw)
    .filter(([k]) => !k.startsWith('_'))            // allow comment keys
    .map(([k, v]) => [k.toLowerCase(), v]));
}

/* Words too common to identify a case by. */
const STOP = new Set([
  'the', 'and', 'in', 're', 'of', 'v', 'vs', 'inc', 'co', 'corp', 'llc', 'ltd',
  'bar', 'assn', 'association', 'counsel', 'couns', 'disciplinary', 'committee',
  'comm', 'unauthorized', 'practice', 'law', 'state', 'ex', 'rel', 'opinion',
]);

const tokens = s => new Set(
  String(s).toLowerCase().split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP.has(t)));

/**
 * Match an opinion PDF to a case, first by name containment and then by
 * distinctive shared words, so "Disciplinary Counsel v. Hernandez.pdf" still
 * finds "Disciplinary Couns. v. Hernandez".
 */
function matchOpinion(theCase, opinions, folder) {
  const caseSlug = slug(theCase.title);
  const sameFolder = o => !o.folder || o.folder.toLowerCase() === folder.toLowerCase();
  const pool = opinions.filter(sameFolder);
  const search = pool.length ? pool : opinions;

  const direct = search.find(o => o.slug.includes(caseSlug) || caseSlug.includes(o.slug));
  if (direct) return direct;

  const want = tokens(theCase.title);
  if (!want.size) return null;

  const scored = search
    .map(o => {
      const have = tokens(o.file);
      let score = 0;
      for (const t of want) if (have.has(t)) score++;
      return { o, score };
    })
    // Two shared words normally, but a title like "Unauthorized Practice of
    // Law Comm. v. Prog" has only one distinctive word once boilerplate is
    // stripped, so require no more than the title actually offers.
    .filter(x => x.score >= Math.min(2, want.size))
    .sort((a, b) => b.score - a.score);

  // Ambiguous ties are left unmatched rather than guessed at.
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].o;
}

/* -- roster --------------------------------------------------------------- */

function localRoster() {
  if (!fs.existsSync(ROSTER)) return [];
  const list = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  return list
    .map(r => ({
      email: String(r.email || '').toLowerCase().trim(),
      name: String(r.name || '').trim(),
      domain: String(r.domain || '').toLowerCase().trim().replace(/[\s-]+/g, '_'),
    }))
    .filter(r => r.email);
}

/* -- main ----------------------------------------------------------------- */

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`No transcripts/ folder at ${SRC}`);

  const folders = fs.readdirSync(SRC, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const domains = {};
  const warnings = [];
  const opinions = indexOpinions();
  const overrides = loadOverrides();
  const usedOpinions = new Set();

  if (!opinions.length) {
    warnings.push('No cases/ folder (or no PDFs in it) — judicial opinions ' +
                  'will not be offered. Drop the opinion PDFs in cases/ and ' +
                  're-run.');
  }

  for (const folder of folders) {
    const key = DOMAIN_KEY[folder.toLowerCase()];
    if (!key) { warnings.push(`Skipped folder "${folder}" — not a known domain`); continue; }

    const { cases, warnings: w } = parseDomain(folder);
    warnings.push(...w);

    for (const c of cases) {
      const pinned = overrides.get(c.title.toLowerCase())
                  || overrides.get(`${key}/${c.id}`.toLowerCase());

      if (pinned) {
        // Accept the path written from the project root or from inside cases/.
        const candidates = [pinned, pinned.replace(/^cases[/\\]/, '')];
        const rel = candidates.find(r => fs.existsSync(path.join(OPINIONS, r)));

        if (!rel) {
          warnings.push(`opinions.json points "${c.title}" at ${pinned}, which does not exist`);
        } else {
          c.opinionPath = `cases/${encode(rel)}`;
          c.opinionName = path.basename(rel);
          usedOpinions.add(rel);
          continue;
        }
      }

      const hit = opinions.length ? matchOpinion(c, opinions, folder) : null;
      if (hit) {
        c.opinionPath = `cases/${encode(hit.rel)}`;
        c.opinionName = hit.file;
        usedOpinions.add(hit.rel);
      } else if (opinions.length) {
        warnings.push(`${folder}: no opinion PDF matched "${c.title}"`);
      }
    }

    domains[key] = { label: folder, folder, cases };
  }

  for (const o of opinions) {
    if (!usedOpinions.has(o.rel)) {
      warnings.push(`cases/${o.rel} did not match any case`);
    }
  }

  const study = {
    generatedAt: new Date().toISOString(),
    source: { kind: 'transcripts-folder' },
    reviewers: localRoster(),
    domains,
  };

  if (flag('sheet')) await mergeSheet(study, warnings);

  /* report */
  console.log(`Parsed ${Object.keys(domains).length} domains from transcripts/\n`);
  for (const [key, d] of Object.entries(domains)) {
    console.log(`  ${d.label}`);
    for (const c of d.cases) {
      const labelled = c.transcripts.filter(t => t.labels).length;
      console.log(`    case ${c.number}: ${c.title}`);
      console.log(`      ${c.transcripts.length} transcripts · ${labelled} with gold labels` +
                  ` · opinion: ${c.opinionName || 'none'}`);
    }
    void key;
  }
  console.log(`\n  ${study.reviewers.length} reviewers on the roster`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach(w => console.log(`  ! ${w}`));
  }

  if (flag('check')) { console.log('\n--check: nothing written.'); return; }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(study, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
}

/* -- optional: roster + gold labels from the spreadsheet ------------------ */

async function mergeSheet(study, warnings) {
  const { loadKey, getAccessToken, makeFetcher } = await import('./google-auth.mjs');
  const { key, file } = loadKey();
  console.log(`Sheet merge using ${file}\n  service account: ${key.client_email}\n`);

  const sheetId = readConfigValue('SHEET_ID');
  if (!sheetId) throw new Error('Set SHEET_ID in config.js first.');

  const token = await getAccessToken(key, [
    'https://www.googleapis.com/auth/spreadsheets.readonly']);
  const get = makeFetcher(token);

  const meta = await get(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`);
  const tabs = meta.sheets.map(s => s.properties.title);

  const ranges = tabs.map(t => `ranges=${encodeURIComponent(t)}`).join('&');
  const values = await get(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${ranges}`);

  const norm = s => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '');

  tabs.forEach((tab, i) => {
    const rows = values.valueRanges[i]?.values || [];
    if (!rows.length) return;

    if (norm(tab) === 'reviewers') {
      const head = rows[0].map(norm);
      study.reviewers = rows.slice(1)
        .map(r => Object.fromEntries(head.map((h, j) => [h, String(r[j] ?? '').trim()])))
        .filter(r => r.email)
        .map(r => ({
          email: r.email.toLowerCase(),
          name: r.name || '',
          domain: norm(r.domain).replace(/[\s-]+/g, '_'),
        }));
      return;
    }

    const key = DOMAIN_KEY[tab.toLowerCase()];
    if (!key || !study.domains[key]) return;
    applyLabels(study.domains[key], rows, norm, warnings, tab);
  });
}

/** Match spreadsheet rows to parsed transcripts and copy the gold labels over. */
function applyLabels(domain, rows, norm, warnings, tab) {
  const head = rows[0].map(norm);
  const objects = rows.slice(1)
    .map(r => Object.fromEntries(head.map((h, j) => [h, String(r[j] ?? '').trim()])))
    .filter(o => Object.values(o).some(Boolean));

  const labelKey = head.find(h => /label/.test(h));
  if (!labelKey) {
    warnings.push(`${tab}: no column whose name contains "label" — gold labels not merged`);
    return;
  }

  const all = domain.cases.flatMap(c => c.transcripts);

  for (const row of objects) {
    const value = row[labelKey];
    if (!value) continue;

    // Match on any cell that names the transcript's PDF or its model.
    const cells = Object.values(row).map(v => v.toLowerCase());
    const hit = all.find(t =>
      cells.some(c => c.includes(t.pdfName.toLowerCase().replace(/\.pdf$/, '')))
      || cells.some(c => t.model && c.includes(t.model.toLowerCase())));

    if (hit) hit.labels = value;
    else warnings.push(`${tab}: could not match a row to any transcript (labels "${value}")`);
  }
}

function readConfigValue(name) {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
    return src.match(new RegExp(`${name}:\\s*'([^']*)'`))?.[1] || '';
  } catch { return ''; }
}

main().catch(err => { console.error(`\n${err.message}\n`); process.exit(1); });
