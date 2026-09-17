/* The judicial opinion behind a case, in an overlay.
 *
 * Reachable from the case page and from the progress rail, so it stays one
 * click away through all five transcripts. */

import { el } from '../util.js';
import { createPdfViewer } from './pdfviewer.js';

let openOverlay = null;

export function hasOpinion(theCase) {
  return Boolean(theCase?.opinionPath);
}

/** A button that opens the opinion, or nothing if the case has none. */
export function opinionButton(theCase, { className = 'btn ghost', label } = {}) {
  if (!hasOpinion(theCase)) return null;
  return el('button', {
    class: className,
    title: `Open the opinion in ${theCase.citation || theCase.title}`,
    onclick: () => openOpinion(theCase),
  }, label || 'Judicial opinion');
}

export function openOpinion(theCase) {
  if (!hasOpinion(theCase)) return;
  if (openOverlay) close();

  const restoreFocus = document.activeElement;

  const viewer = createPdfViewer({
    id: `${theCase.id}-opinion`,
    number: 0,
    pdfPath: theCase.opinionPath,
    pdfName: theCase.opinionName,
    viewerLabel: theCase.opinionName || 'Opinion',
  });

  const closeBtn = el('button', {
    class: 'ovclose', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close,
  }, '×');

  const panel = el('div', {
    class: 'ovpanel', role: 'dialog', 'aria-modal': 'true',
    'aria-label': `Judicial opinion: ${theCase.title}`,
    onclick: e => e.stopPropagation(),
  }, [
    el('div', { class: 'ovhead' }, [
      el('div', {}, [
        el('div', { class: 'ovtitle' }, theCase.title),
        theCase.citation ? el('div', { class: 'ovcite' }, theCase.citation) : null,
      ]),
      el('div', { class: 'spacer', style: 'flex:1' }),
      el('a', {
        class: 'ovlink', href: theCase.opinionPath, target: '_blank', rel: 'noopener',
      }, 'Open in new tab'),
      closeBtn,
    ]),
    viewer.element,
  ]);

  const backdrop = el('div', { class: 'overlay', onclick: close }, [panel]);

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    document.removeEventListener('keydown', onKey);
    viewer.destroy();
    backdrop.remove();
    openOverlay = null;
    if (restoreFocus?.isConnected) restoreFocus.focus();
  }

  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  closeBtn.focus();
  openOverlay = { close };
}
