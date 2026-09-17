/* The page that introduces a case before its five transcripts.
 *
 * If the source data carries free-text `instructions`, that is used. Otherwise
 * the page is composed from the case brief and prompt components parsed out of
 * the domain's UPLBench review document. */

import { el, miniMarkdown, escapeHtml } from '../util.js';
import { state, caseComplete } from '../data/store.js';
import { topbar } from './components.js';
import { opinionButton } from './opinion.js';

export function renderInstructions({ theCase, onStart, onSignOut }) {
  const position = state.cases.findIndex(c => c.id === theCase.id) + 1;
  const count = theCase.transcripts.length;

  const card = theCase.instructions?.trim()
    ? el('div', { class: 'card prose', html: miniMarkdown(theCase.instructions) })
    : el('div', { class: 'card prose' }, composed(theCase, count));

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: `Case ${position} of ${state.cases.length}`, onSignOut }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'kicker' },
          `Case ${position} of ${state.cases.length} · ${state.reviewer.domainLabel}`),
        el('h2', {}, theCase.title),
        theCase.citation ? el('p', { class: 'sub cite' }, theCase.citation) : null,

        card,

        el('div', { class: 'actions' }, [
          opinionButton(theCase, { label: 'Read the judicial opinion' }),
          el('button', { class: 'btn lg', onclick: onStart },
            caseComplete(theCase) ? 'Review this case again' : `Start case ${position}`),
        ]),
      ]),
    ]),
  ]);
}

function composed(theCase, count) {
  const { brief = {}, scenario = {} } = theCase;
  const out = [];

  out.push(el('p', {}, [
    'You will review ',
    el('strong', {}, `${count} conversation${count === 1 ? '' : 's'}`),
    ' in which a member of the public puts the situation below to an AI ' +
    'assistant. Each conversation runs to three turns, and the rubric for ' +
    'those turns is shown beside every transcript.',
  ]));

  out.push(el('p', {}, [
    'For each one, tell us whether our labels are right, and what you make of ' +
    'the advice and of the service as a whole. The transcripts are presented ' +
    'in a fixed order and are not identified by model.',
  ]));

  if (scenario.facts || scenario.task) {
    out.push(el('h3', {}, 'The situation put to the assistant'));
    if (scenario.facts) {
      out.push(el('blockquote', { class: 'quote' }, [
        scenario.facts,
        scenario.jurisdiction ? el('span', { class: 'juris' }, ` ${scenario.jurisdiction}`) : null,
      ]));
    }

    const turns = [
      ['Turn 1', scenario.task],
      ['Turn 2', scenario.followup1],
      ['Turn 3', scenario.followup2],
    ].filter(([, text]) => text);

    if (turns.length) {
      out.push(el('ol', { class: 'turns' }, turns.map(([label, text]) =>
        el('li', {}, [el('strong', {}, `${label}. `), text]))));
    }
  }

  const briefRows = [
    ['Facts', brief.facts],
    ['Reasoning', brief.reasoning],
    ['Outcome', brief.outcome],
    ['Harms', brief.harms],
  ].filter(([, text]) => text);

  if (briefRows.length) {
    out.push(el('h3', {}, 'Case brief'));
    out.push(el('p', { class: 'muted' },
      'Background on the decision this scenario is drawn from. It is context ' +
      'for your judgement, not a standard the assistant was asked to meet.'));
    out.push(el('dl', { class: 'brief' }, briefRows.flatMap(([term, text]) => [
      el('dt', {}, term),
      el('dd', { html: escapeHtml(text) }),
    ])));
  }

  return out;
}
