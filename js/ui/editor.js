/* A small rich-text field: bold, italic, underline and lists.
 * Output is the contenteditable's innerHTML, converted to Docs formatting
 * on submit by js/api/docs.js. */

import { el } from '../util.js';

const TOOLS = [
  { cmd: 'bold',                      label: 'B', title: 'Bold (Ctrl/Cmd+B)',      style: 'font-weight:700' },
  { cmd: 'italic',                    label: 'I', title: 'Italic (Ctrl/Cmd+I)',    style: 'font-style:italic' },
  { cmd: 'underline',                 label: 'U', title: 'Underline (Ctrl/Cmd+U)', style: 'text-decoration:underline' },
  { cmd: 'insertUnorderedList',       label: '•', title: 'Bulleted list' },
  { cmd: 'insertOrderedList',         label: '1.', title: 'Numbered list' },
];

export function createEditor({ value = '', placeholder = '', onChange }) {
  const area = el('div', {
    class: 'rte-area',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'data-ph': placeholder,
  });
  area.innerHTML = value || '';

  const buttons = TOOLS.map(tool =>
    el('button', {
      type: 'button',
      title: tool.title,
      style: tool.style || '',
      // Keep focus in the text area so the command applies to the selection.
      onmousedown: e => e.preventDefault(),
      onclick: () => { document.execCommand(tool.cmd); area.focus(); sync(); },
    }, tool.label));

  const tools = el('div', { class: 'rte-tools' }, buttons);
  const wrap = el('div', { class: 'rte' }, [tools, area]);

  function sync() {
    TOOLS.forEach((tool, i) => {
      let on = false;
      try { on = document.queryCommandState(tool.cmd); } catch { /* unsupported */ }
      buttons[i].classList.toggle('on', on);
    });
    onChange?.(getValue());
  }

  area.addEventListener('input', sync);
  area.addEventListener('keyup', sync);
  area.addEventListener('mouseup', sync);
  area.addEventListener('blur', () => onChange?.(getValue()));

  // Strip styling from pasted content so answers stay consistent.
  area.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  function getValue() {
    const html = area.innerHTML.trim();
    return isEmpty(html) ? '' : html;
  }

  return { element: wrap, getValue, focus: () => area.focus() };
}

/** Browsers leave behind <br> and empty divs; treat those as no answer. */
export function isEmpty(html) {
  return !String(html ?? '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}
