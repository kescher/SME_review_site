/* Small shared helpers. */

export const $ = (sel, root = document) => root.querySelector(sel);

/** Build an element: el('div', {class:'x'}, [child, 'text']) */
export function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Header keys are compared loosely so "Case ID" matches "case_id". */
export const normKey = s => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '');

export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  const t = el('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}

export function debounce(fn, ms) {
  let id;
  const wrapped = (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(id); fn(...args); };
  return wrapped;
}

export function fmtTime(d = new Date()) {
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Minimal markdown for instruction text authored in a spreadsheet cell.
 *  Supports #/##/### headings, - and 1. lists, **bold**, *italic* and `code`.
 *  Consecutive lines join into one paragraph; a blank line starts a new one. */
export function miniMarkdown(src) {
  const out = [];
  let list = null;
  let para = [];

  const inline = s => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closePara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const close = () => { closePara(); closeList(); };

  for (const raw of String(src ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { close(); continue; }

    const head = line.match(/^(#{1,4})\s+(.*)$/);
    if (head) { close(); out.push(`<h3>${inline(head[2])}</h3>`); continue; }

    const bullet = line.match(/^[-*\u2022]\s+(.*)$/);
    if (bullet) {
      closePara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (num) {
      closePara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(num[1])}</li>`);
      continue;
    }

    closeList();
    para.push(line);
  }
  close();
  return out.join('');
}
