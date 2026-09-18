/* The page that introduces a case before its five transcripts.
 *
 * Reads as a narrative: what this set of transcripts is modelled on, then the
 * decision it comes from, then the inputs we actually gave the models. If the
 * source data carries free-text `instructions`, that is used verbatim instead. */

import { el, miniMarkdown, escapeHtml } from '../util.js';
import { state, caseComplete } from '../data/store.js';
import { topbar } from './components.js';
import { opinionButton } from './opinion.js';

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export function renderInstructions({ theCase, onStart, onSignOut }) {
  const position = state.cases.findIndex(c => c.id === theCase.id) + 1;
  const count = theCase.transcripts.length;
  const custom = theCase.instructions?.trim();

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: `Case ${position} of ${state.cases.length}`, onSignOut }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'kicker' },
          `Case ${position} of ${state.cases.length} · ${state.reviewer.domainLabel}`),
        el('h2', {}, theCase.title),

        custom ? null : overview(theCase, position, count),
        opinionLink(theCase),

        custom
          ? el('div', { class: 'card prose', html: miniMarkdown(custom) })
          : el('div', { class: 'card prose' }, composed(theCase)),

        el('div', { class: 'actions' }, [
          el('button', { class: 'btn lg', onclick: onStart },
            caseComplete(theCase) ? 'Review this case again' : `Start case ${position}`),
        ]),
      ]),
    ]),
  ]);
}

/** The broad framing, before any of the detail. */
function overview(theCase, position, count) {
  const ordinal = ORDINALS[position - 1] || `${position}th`;

  return el('div', { class: 'overview' }, [
    el('p', {}, [
      `The ${ordinal} set of transcripts contains `,
      el('strong', {}, `${count} conversation${count === 1 ? '' : 's'}`),
      ' modelled on ',
      theCase.citation
        ? el('span', { class: 'cite' }, theCase.citation)
        : theCase.title,
      '.',
    ]),
    el('p', { class: 'muted' },
      'Below is what that case was about, and what we gave the models as ' +
      'inputs.'),
  ]);
}

function composed(theCase) {
  const { brief = {}, scenario = {} } = theCase;
  const out = [];

  /* -- what the case is about -- */
  const briefRows = [
    ['Facts', brief.facts],
    ['Reasoning', brief.reasoning],
    ['Outcome', brief.outcome],
    ['Harms', brief.harms],
  ].filter(([, text]) => text);

  if (briefRows.length) {
    out.push(el('h3', {}, 'What the case is about'));
    out.push(el('p', { class: 'muted' },
      'Text prepared by a law student assistant.'));
    out.push(el('dl', { class: 'brief' }, briefRows.flatMap(([term, text]) => [
      el('dt', {}, term),
      el('dd', { html: escapeHtml(text) }),
    ])));
  }

  /* -- what we gave the models -- */
  if (scenario.facts || scenario.task) {
    out.push(el('h3', {}, 'What we provided to the models as inputs'));

    if (scenario.facts) {
      out.push(el('p', { class: 'muted' },
        'The opening message, written from the point of view of the person who ' +
        'received the improper advice:'));
      out.push(el('blockquote', { class: 'quote' }, [
        scenario.facts,
        scenario.jurisdiction ? el('span', { class: 'juris' }, ` ${scenario.jurisdiction}`) : null,
      ]));
    }

    const rubric = theCase.rubric || {};
    const turns = [
      ['Turn 1', scenario.task, rubric.prompt],
      ['Turn 2', scenario.followup1, rubric.followup1],
      ['Turn 3', scenario.followup2, rubric.followup2],
    ].filter(([, text]) => text);

    if (turns.length) {
      out.push(el('p', { class: 'muted' },
        'The three requests, issued in sequence, with the rubric we scored each ' +
        'one against. The same rubric is shown beside every transcript.'));
      out.push(rubricTable(turns));
    }
  }

  return out;
}

/** Each request paired with the rubric for that turn. */
function rubricTable(turns) {
  const bullets = items => (items && items.length)
    ? el('ul', {}, items.map(i => el('li', {}, i)))
    : el('span', { class: 'muted' }, '—');

  // Two header rows, so the two right-hand columns are unmistakably the rubric.
  const head = el('thead', {}, [
    el('tr', { class: 'grouprow' }, [
      el('td', {}),
      el('th', { scope: 'colgroup', colspan: '2', class: 'group' },
        'Rubric for this turn'),
    ]),
    el('tr', {}, [
      el('th', { scope: 'col' }, 'What we asked'),
      el('th', { scope: 'col', class: 'no' }, 'No UPL'),
      el('th', { scope: 'col', class: 'yes' }, 'Yes UPL'),
    ]),
  ]);

  const body = el('tbody', {}, turns.map(([label, text, cell]) =>
    el('tr', {}, [
      el('th', { scope: 'row' }, [
        el('div', { class: 'turnlabel' }, label),
        el('div', {}, text),
      ]),
      el('td', {}, bullets(cell?.noUpl)),
      el('td', {}, bullets(cell?.yesUpl)),
    ])));

  return el('div', { class: 'tablewrap' }, [
    el('table', { class: 'rubrictable' }, [head, body]),
  ]);
}

/** A prominent way into the decision itself. */
function opinionLink(theCase) {
  const button = opinionButton(theCase, {
    className: 'opinionlink',
    label: 'Read judicial opinion',
  });
  if (!button) return null;

  return el('div', { class: 'opinionbar' }, [
    button,
    el('span', { class: 'opinionhint' }, 'The full decision this case is drawn from'),
  ]);
}
