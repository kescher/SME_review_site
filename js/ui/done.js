import { CONFIG } from '../../config.js';
import { el } from '../util.js';
import { state, counts } from '../data/store.js';
import { topbar } from './components.js';

export function renderDone({ onSignOut, onRestart }) {
  const { done, total } = counts();

  const rows = state.cases.map((c, i) => {
    const complete = c.transcripts.filter(t => state.submitted.has(t.ref)).length;
    return el('div', { class: 'row' }, [
      el('span', {}, `Case ${i + 1} — ${c.title}`),
      el('span', {}, `${complete} of ${c.transcripts.length} reviewed`),
    ]);
  });

  const docLink = state.docId && !CONFIG.DEMO
    ? el('p', { class: 'note' }, [
        'Your answers are in ',
        el('a', {
          href: `https://docs.google.com/document/d/${state.docId}/edit`,
          target: '_blank', rel: 'noopener',
        }, 'your review document'),
        '.',
      ])
    : null;

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: 'Complete', onSignOut }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'card done' }, [
          el('div', { class: 'tick' }, '✅'),
          el('h2', {}, 'All reviews submitted'),
          el('p', { class: 'sub' },
            `Thank you — you completed ${done} of ${total} transcripts.`),
          el('div', { class: 'summary' }, rows),
          el('button', { class: 'btn ghost', onclick: onRestart }, 'Back to the start'),
          docLink,
        ]),
      ]),
    ]),
  ]);
}
