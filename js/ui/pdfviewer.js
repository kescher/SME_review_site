/* Transcript pane: a continuous-scroll PDF.js viewer with page and zoom
 * controls. In demo mode the same pane renders the bundled HTML transcript so
 * the workflow can be tried without any Drive access. */

import { el, clear } from '../util.js';
import { fetchPdf } from '../api/drive.js';

const PDFJS_VERSION = '4.6.82';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let pdfjs = null;

async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(`${CDN}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.mjs`;
  return pdfjs;
}

export function createPdfViewer(transcript) {
  const scroll = el('div', { class: 'pdfscroll' });

  const pageBox = el('input', { class: 'pagebox', value: '1', 'aria-label': 'Page number' });
  const pageTotal = el('span', {}, 'of –');
  const prev = tbtn('‹', 'Previous page', () => goTo(current - 1));
  const next = tbtn('›', 'Next page', () => goTo(current + 1));
  const zoomOut = tbtn('−', 'Zoom out', () => setZoom(zoomIndex - 1));
  const zoomIn = tbtn('+', 'Zoom in', () => setZoom(zoomIndex + 1));
  const zoomLabel = el('span', { style: 'min-width:46px;text-align:center' }, '100%');
  const fit = tbtn('⤢', 'Fit width', fitWidth);

  const tools = el('div', { class: 'pdftools' }, [
    el('span', {}, 'Page'), prev, pageBox, next, pageTotal,
    el('div', { class: 'sep' }),
    zoomOut, zoomLabel, zoomIn, fit,
    el('div', { class: 'spacer' }),
    // For a transcript, deliberately not the file name: it carries the model,
    // which would bias the reviewer. The model is still recorded in the answer
    // document. Other documents pass their own label.
    el('span', { style: 'font-size:12px;opacity:.8' },
      transcript.viewerLabel || `Transcript ${transcript.number}`),
  ]);

  const element = el('div', { class: 'pane-pdf' }, [tools, scroll]);

  let doc = null;
  let canvases = [];
  let current = 1;
  let zoomIndex = 3;
  let renderToken = 0;

  function tbtn(label, title, onclick) {
    return el('button', { class: 'tbtn', title, onclick }, label);
  }

  function message(text) {
    clear(scroll);
    scroll.append(el('div', { class: 'pdfmsg' }, text));
  }

  /* -- demo transcript --------------------------------------------------- */
  if (!transcript.pdfFileId && transcript.demoHtml) {
    [prev, next, zoomOut, zoomIn, fit].forEach(b => { b.disabled = true; });
    pageBox.disabled = true;
    pageTotal.textContent = 'of 1';
    clear(scroll);
    scroll.append(el('div', {
      class: 'pdfpage',
      style: 'max-width:820px;padding:44px 52px;text-align:left;font-size:14.5px;line-height:1.6',
      html: transcript.demoHtml,
    }));
    return { element, destroy() {} };
  }

  if (!transcript.pdfFileId && !transcript.pdfPath) {
    message(`No PDF is linked for transcript "${transcript.id}". ` +
            'Check the PDF column in the spreadsheet, then re-run ' +
            '`node tools/build-study.mjs`.');
    return { element, destroy() {} };
  }

  /* -- real PDF ---------------------------------------------------------- */
  message('Loading transcript…');

  (async () => {
    try {
      const lib = await loadPdfjs();
      // A PDF bundled by the puller needs no Google call; otherwise fetch it
      // from Drive as the signed-in reviewer.
      const data = transcript.pdfPath
        ? await (await fetch(transcript.pdfPath, { cache: 'no-cache' })).arrayBuffer()
        : await fetchPdf(transcript.pdfFileId);
      doc = await lib.getDocument({ data }).promise;

      pageTotal.textContent = `of ${doc.numPages}`;
      clear(scroll);
      canvases = Array.from({ length: doc.numPages }, (_, i) =>
        el('canvas', { class: 'pdfpage', 'data-page': i + 1 }));
      scroll.append(...canvases);

      await fitWidth();
      scroll.addEventListener('scroll', trackPage, { passive: true });
    } catch (err) {
      console.error(err);
      message(`Could not open the transcript PDF. ${err.message || ''}`);
    }
  })();

  async function renderAll() {
    if (!doc) return;
    const token = ++renderToken;
    const scale = ZOOMS[zoomIndex] * (window.devicePixelRatio || 1);
    zoomLabel.textContent = `${Math.round(ZOOMS[zoomIndex] * 100)}%`;

    for (let n = 1; n <= doc.numPages; n++) {
      if (token !== renderToken) return; // a newer zoom superseded this pass
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = canvases[n - 1];
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  }

  async function fitWidth() {
    if (!doc) return;
    const page = await doc.getPage(1);
    const natural = page.getViewport({ scale: 1 }).width;
    const target = (scroll.clientWidth - 48) / natural;
    zoomIndex = ZOOMS.reduce(
      (best, z, i) => (Math.abs(z - target) < Math.abs(ZOOMS[best] - target) ? i : best), 0);
    await renderAll();
  }

  function setZoom(i) {
    const clamped = Math.max(0, Math.min(ZOOMS.length - 1, i));
    if (clamped === zoomIndex) return;
    zoomIndex = clamped;
    renderAll();
  }

  function goTo(n) {
    if (!doc) return;
    const target = Math.max(1, Math.min(doc.numPages, n));
    canvases[target - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    current = target;
    pageBox.value = String(target);
  }

  function trackPage() {
    const top = scroll.scrollTop;
    let visible = 1;
    canvases.forEach((c, i) => { if (c.offsetTop - scroll.offsetTop <= top + 60) visible = i + 1; });
    if (visible !== current) {
      current = visible;
      if (document.activeElement !== pageBox) pageBox.value = String(visible);
    }
  }

  pageBox.addEventListener('change', () => goTo(parseInt(pageBox.value, 10) || 1));

  return {
    element,
    destroy() { renderToken++; scroll.removeEventListener('scroll', trackPage); },
  };
}
