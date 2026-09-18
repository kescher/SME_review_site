/* Google Docs output.
 *
 * Each reviewer gets one document. Answers are appended as they submit, so the
 * doc doubles as the record of what has already been completed: every
 * transcript writes a "ref <caseId>/<transcriptId>" marker that `submittedRefs`
 * reads back on sign-in to restore progress across devices.
 */

import { CONFIG } from '../../config.js';
import { api, apiJson } from './http.js';
import { findDocByName, moveToFolder, shareWith } from './drive.js';

const DOCS = 'https://docs.googleapis.com/v1/documents';

/** Non-fatal problems filing the doc, surfaced once after sign-in. */
export const filingWarnings = [];

export const docTitle = ({ name, email }) =>
  CONFIG.DOC_TITLE.replace('{name}', name || email).replace('{email}', email);

/** Find the reviewer's doc or create, file and share a new one. */
export async function ensureDoc(profile) {
  const title = docTitle(profile);

  const existing = await findDocByName(title);
  if (existing) return { docId: existing, created: false };

  const doc = await apiJson(DOCS, 'POST', { title });
  const docId = doc.documentId;

  // Filing is best-effort: if the reviewer has not been given Editor access to
  // the responses folder, the move fails, but their answers must still be
  // recorded. The doc stays in their own Drive and can be collected later.
  try {
    await moveToFolder(docId, CONFIG.RESPONSES_FOLDER_ID);
  } catch (err) {
    console.warn('Could not move the answer doc into the responses folder.', err);
    filingWarnings.push(
      'Your review document could not be filed in the study folder — check ' +
      'with the study administrator that you have edit access to it. Your ' +
      'answers are still being saved.');
  }

  try {
    await shareWith(docId, CONFIG.ADMIN_EMAIL);
  } catch (err) {
    console.warn('Could not share the answer doc with the administrator.', err);
  }

  // No domain in the header: a reviewer may cover more than one, and each
  // submission names its own.
  await appendBlocks(docId, [
    { type: 'h1', text: title },
    { type: 'p',  text: profile.email },
    { type: 'p',  text: `Started ${new Date().toLocaleString()}` },
  ]);

  return { docId, created: true };
}

/** Flat text of the document, used to work out what is already submitted. */
export async function readDocText(docId) {
  const doc = await api(`${DOCS}/${docId}`);
  let out = '';
  for (const element of doc.body?.content || []) {
    for (const run of element.paragraph?.elements || []) {
      out += run.textRun?.content || '';
    }
  }
  return out;
}

export async function submittedRefs(docId) {
  const text = await readDocText(docId);
  return new Set([...text.matchAll(/\bref\s+(\S+\/\S+)/g)].map(m => m[1]));
}

/* -- appending ------------------------------------------------------------ */

const NAMED_STYLE = { h1: 'HEADING_1', h2: 'HEADING_2', h3: 'HEADING_3', p: 'NORMAL_TEXT' };

/**
 * blocks: [{ type: 'h1'|'h2'|'h3'|'p', text }] or [{ type: 'html', html }]
 * Everything is flattened to one insertText plus styling requests so the whole
 * submission lands atomically.
 */
export async function appendBlocks(docId, blocks) {
  const doc = await api(`${DOCS}/${docId}?fields=body.content.endIndex`);
  const content = doc.body?.content || [];
  const at = Math.max(1, (content[content.length - 1]?.endIndex ?? 2) - 1);

  const built = build(blocks);
  if (!built.text) return;

  const requests = [{ insertText: { location: { index: at }, text: built.text } }];

  for (const run of built.runs) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: at + run.start, endIndex: at + run.end },
        textStyle: run.style,
        fields: Object.keys(run.style).join(','),
      },
    });
  }
  for (const para of built.paras) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: at + para.start, endIndex: at + para.end },
        paragraphStyle: { namedStyleType: NAMED_STYLE[para.style] || 'NORMAL_TEXT' },
        fields: 'namedStyleType',
      },
    });
  }
  for (const list of built.lists) {
    requests.push({
      createParagraphBullets: {
        range: { startIndex: at + list.start, endIndex: at + list.end },
        bulletPreset: list.ordered
          ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
          : 'BULLET_DISC_CIRCLE_SQUARE',
      },
    });
  }

  await apiJson(`${DOCS}/${docId}:batchUpdate`, 'POST', { requests });
}

/* -- HTML -> Docs conversion ---------------------------------------------- */

export function build(blocks) {
  const out = { text: '', runs: [], paras: [], lists: [] };

  const pushPara = (str, style) => {
    const start = out.text.length;
    out.text += `${str}\n`;
    out.paras.push({ start, end: out.text.length, style });
    return start;
  };

  for (const block of blocks) {
    if (block.type === 'html') {
      writeHtml(block.html, out);
    } else {
      pushPara(block.text ?? '', block.type);
    }
  }
  return out;
}

/** Walk a contenteditable fragment, emitting text plus bold/italic ranges. */
function writeHtml(html, out) {
  const root = document.createElement('div');
  root.innerHTML = html || '';

  let line = '';
  let openRuns = [];

  const flush = (listKind) => {
    const start = out.text.length;
    out.text += `${line}\n`;
    out.paras.push({ start, end: out.text.length, style: 'p' });
    if (listKind) out.lists.push({ start, end: out.text.length, ordered: listKind === 'ol' });
    for (const run of openRuns) {
      out.runs.push({ start: start + run.start, end: start + run.end, style: run.style });
    }
    line = '';
    openRuns = [];
  };

  const marks = node => {
    const style = {};
    for (let n = node; n && n !== root; n = n.parentNode) {
      const tag = n.nodeName;
      if (tag === 'B' || tag === 'STRONG') style.bold = true;
      if (tag === 'I' || tag === 'EM') style.italic = true;
      if (tag === 'U') style.underline = true;
    }
    return style;
  };

  const walk = (node, listKind) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue.replace(/\s+/g, ' ');
        if (!text) continue;
        const style = marks(child);
        const start = line.length;
        line += text;
        if (Object.keys(style).length) openRuns.push({ start, end: line.length, style });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.nodeName;
      if (tag === 'BR') { flush(listKind); continue; }
      if (tag === 'UL' || tag === 'OL') { if (line.trim()) flush(listKind); walk(child, tag.toLowerCase()); continue; }
      if (tag === 'LI') { walk(child, listKind); flush(listKind); continue; }
      if (tag === 'P' || tag === 'DIV') {
        if (line.trim()) flush(listKind);
        walk(child, listKind);
        if (line.trim()) flush(listKind);
        continue;
      }
      walk(child, listKind);
    }
  };

  walk(root, null);
  if (line.trim()) flush(null);
  if (!out.text.endsWith('\n')) out.text += '\n';
}
