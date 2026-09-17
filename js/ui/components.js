/* Shared chrome: the top bar and the progress rail. */

import { CONFIG } from '../../config.js';
import { el } from '../util.js';
import { state, counts } from '../data/store.js';
import { opinionButton } from './opinion.js';

export function topbar({ crumb, onSignOut, overview = true }) {
  return el('header', { class: 'topbar' }, [
    el('h1', {}, 'SME Review'),
    crumb ? el('span', { class: 'crumb' }, `— ${crumb}`) : null,
    CONFIG.DEMO ? el('span', { class: 'demo-chip' }, 'Demo data') : null,
    el('div', { class: 'spacer' }),
    el('div', { class: 'who' }, [
      overview ? el('a', { class: 'link', href: '#/welcome' }, 'Project overview') : null,
      state.reviewer ? `${state.reviewer.name} · ${state.reviewer.domainLabel}` : '',
      onSignOut ? el('button', { class: 'link', onclick: onSignOut }, 'Sign out') : null,
    ]),
  ]);
}

/** Pips for the current case plus an overall count. */
export function rail(theCase, currentIndex) {
  const { done, total } = counts();

  const pips = theCase.transcripts.map((t, i) => {
    const cls = state.submitted.has(t.ref) ? 'done' : (i === currentIndex ? 'current' : '');
    return el('div', { class: `pip ${cls}`, title: `Transcript ${i + 1}` });
  });

  const position = state.cases.findIndex(c => c.id === theCase.id) + 1;

  return el('div', { class: 'rail' }, [
    el('span', {}, `Case ${position} of ${state.cases.length}: ${theCase.title}`),
    el('div', { class: 'pips' }, pips),
    el('div', { class: 'spacer', style: 'flex:1' }),
    opinionButton(theCase, { class: 'railbtn', className: 'railbtn' }),
    el('span', {}, `${done} of ${total} transcripts reviewed`),
  ]);
}
