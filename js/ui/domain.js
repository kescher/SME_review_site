/* Choosing an area of expertise, immediately after signing in.
 *
 * Any reviewer may pick any area — the roster is an allowlist, and a domain
 * listed there is only a default. The choice is remembered and can be changed
 * from the header, so someone who finishes one area can take on another. */

import { el } from '../util.js';
import { state, selectDomain, progressByDomain, storedDomain } from '../data/store.js';
import { topbar } from './components.js';

export function renderDomain({ onChosen, onSignOut }) {
  const progress = progressByDomain();
  // What they have actually chosen, versus what is merely highlighted.
  const chosen = state.reviewer?.domain || storedDomain() || '';
  const highlight = chosen || state.suggested;

  const cards = state.domains.map(d => {
    const done = progress[d.key] || 0;
    const complete = done >= d.transcripts;

    return el('button', {
      class: `domaincard${d.key === highlight ? ' current' : ''}`,
      onclick: () => { if (selectDomain(d.key)) onChosen(); },
    }, [
      el('div', { class: 'dname' }, d.label),
      el('div', { class: 'dmeta' },
        `${d.cases} case${d.cases === 1 ? '' : 's'} · ` +
        `${d.transcripts} transcript${d.transcripts === 1 ? '' : 's'}`),

      done > 0
        ? el('div', { class: `dprogress${complete ? ' done' : ''}` },
            complete ? 'Completed' : `${done} of ${d.transcripts} reviewed`)
        : null,

      d.key === state.suggested
        ? el('div', { class: 'dsuggested' }, 'Assigned to you')
        : null,
    ]);
  });

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: 'Area of expertise', onSignOut, overview: false, domain: false }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('h2', {}, state.reviewer?.domain
          ? 'Switch area of expertise'
          : 'Choose your area of expertise'),
        el('p', { class: 'sub' },
          'Pick the area you are best placed to judge. You can come back and ' +
          'change this at any time — your progress in each area is kept ' +
          'separately.'),

        el('div', { class: 'domaingrid' }, cards),

        state.suggested
          ? el('p', { class: 'note center' },
              `The roster lists you for ${label(state.suggested)} — pick another ` +
              'if it suits your expertise better.')
          : null,
      ]),
    ]),
  ]);
}

const label = key => state.domains.find(d => d.key === key)?.label || key;
