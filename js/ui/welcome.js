/* The project overview, shown once before the first case.
 *
 * Content follows assets/project_overview.pdf, which reviewers can still
 * download from the link at the foot of the page. */

import { el } from '../util.js';
import { state } from '../data/store.js';
import { topbar } from './components.js';

const OVERVIEW_PDF = 'assets/project_overview.pdf';

export function renderWelcome({ onStart, onSignOut }) {
  const domain = state.reviewer?.domainLabel || 'your domain';
  const cases = state.cases.length;
  const transcripts = state.cases.reduce((n, c) => n + c.transcripts.length, 0);

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: 'Project overview', onSignOut, overview: false }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'kicker' }, `${domain} · ${cases} cases · ${transcripts} transcripts`),
        el('h2', {}, 'Thank you for reviewing our study materials'),
        el('p', { class: 'sub' },
          'Please read this page before you begin. It explains what the project ' +
          'is for and what we are asking of you.'),

        el('div', { class: 'card prose' }, [
          ...about(),
          ...asks(),
          ...note(),
          methodology(),
        ]),

        el('p', { class: 'note center' }, [
          'You can revisit this page at any time from the link in the header, or ',
          el('a', { href: OVERVIEW_PDF, target: '_blank', rel: 'noopener' },
            'download it as a PDF'),
          '.',
        ]),

        el('div', { class: 'actions' }, [
          el('button', { class: 'btn lg', onclick: onStart }, 'Begin the review'),
        ]),
      ]),
    ]),
  ]);
}

function about() {
  return [
    el('h3', {}, 'What we are studying'),
    el('p', {}, 'Our project examines how popular LLMs respond when users ask ' +
      'about their legal situations. We believe frontier AI labs have quietly ' +
      'lifted guardrails that discouraged chatbots from dispensing legal ' +
      'advice. Such a change would be troubling, since these systems are not ' +
      'held to the standards of competence and ethical behaviour enforced by ' +
      'the legal profession.'),
    el('p', {}, 'To determine whether LLMs are now performing tasks that have ' +
      'historically required bar admission, we operationalise the boundary ' +
      'around legal practice using Unauthorized Practice of Law (UPL) case law. ' +
      'A law student on our team has collected and briefed 80 UPL cases — the ' +
      'facts, the legal reasoning, the outcomes, and the harms to the people ' +
      'who received improper advice. We draw from five high-stakes domains ' +
      'where outcomes are difficult to reverse.'),
    el('p', { class: 'pull' },
      'Your expertise is vital to our project — are we adequately representing ' +
      'your domain?'),
  ];
}

function asks() {
  const steps = [
    {
      title: 'Read the Prompt Components and Rubric for each case in your ' +
             'domain, and tell us whether you agree with how the rubric was ' +
             'applied to the transcripts',
      body: [
        el('p', {}, 'The case overview page shows the prompt components — the ' +
          'facts, the jurisdiction and the three requests. The rubric appears ' +
          'beside every transcript.'),
        el('ul', {}, [
          el('li', {}, [
            'Please give us feedback on the prompts or rubrics where they could ' +
            'better capture the judicial reasoning or your experience in this ' +
            'domain. The first question beside each transcript is the place ' +
            'for it. ',
            el('span', { class: 'muted' },
              'Any changes you suggest to the prompts will change our inputs ' +
              'into the chatbot models.'),
          ]),
          el('li', {}, 'We include five sample transcripts for each case, ' +
            'selected at random from our set of chatbot models, so that you can ' +
            'see some variation in model behaviour. Have we adequately ' +
            'characterised whether the chatbot in each transcript has engaged ' +
            'in UPL?'),
        ]),
      ],
    },
    {
      title: 'Review the quality of the legal service and advice in the chat ' +
             'transcripts',
      body: [
        el('p', {}, 'What is useful in these transcripts? What is troubling? ' +
          'We are interested in two things:'),
        el('ul', {}, [
          el('li', {}, [
            el('strong', {}, 'The quality of the legal information or advice. '),
            'Does the model get the law right in this domain?',
          ]),
          el('li', {}, [
            el('strong', {}, 'The quality of the “legal service”. '),
            'What aspects of the transcripts could be improved in this ' +
            'situation, and what aspects could be useful to someone in it?',
          ]),
        ]),
        patterns(),
        el('p', {}, 'Please also include any other observations — what should ' +
          'we know about that we have not asked for yet?'),
      ],
    },
  ];

  return [
    el('h3', {}, 'What we are asking you to do'),
    el('p', { class: 'sub-intro' },
      'As a subject matter expert, we would appreciate your help with the ' +
      'following.'),
    el('ol', { class: 'steps' }, steps.map(s =>
      el('li', { class: 'step' }, [el('h4', {}, s.title), ...s.body]))),
  ];
}

/** Patterns we have already noticed, offered as a prompt rather than a checklist. */
function patterns() {
  const list = (items) => el('ul', {}, items.map(i => el('li', {}, i)));

  return el('div', { class: 'patterns' }, [
    el('div', { class: 'pat bad' }, [
      el('div', { class: 'patlabel' }, 'Harmful patterns we have observed'),
      list([
        'Insufficient interviewing — giving advice without surfacing the ' +
        'relevant facts first, such as failing to ask about past deportations ' +
        'before recommending an I-130 filing.',
        'No jurisdiction established, or the wrong one inferred.',
        'Failures of analysis.',
        'Failure to cite the correct case law or other authorities.',
      ]),
    ]),
    el('div', { class: 'pat good' }, [
      el('div', { class: 'patlabel' }, 'Useful recommendations we have observed'),
      list([
        'Directing the user to consult an expert.',
        'Resources or links connecting them to aid organisations.',
        'Eliciting additional information before answering.',
      ]),
    ]),
  ]);
}

function note() {
  return [
    el('h3', {}, 'A note on personal details'),
    el('p', {}, 'We will anonymise personal details from the cases during our ' +
      'final data collection phase and in any future publications. They appear ' +
      'here so you can trace prompt information back to the case it came from.'),
  ];
}

/** Optional in the source document, so it stays folded away by default. */
function methodology() {
  return el('details', { class: 'more' }, [
    el('summary', {}, 'How we built the benchmark and the rubrics'),

    el('h4', {}, 'Composing the benchmark'),
    el('p', {}, 'We collected 80 cases where UPL was found and wrote one set of ' +
      'three queries per case, issued in sequence to build a multi-turn ' +
      'conversation. Throughout, we emulate the person who received the ' +
      'improper legal advice — our project imagines them now asking an LLM ' +
      'instead.'),
    el('ul', {}, [
      el('li', {}, [el('strong', {}, 'Facts. '),
        'A description of the person’s initial legal troubles, told from ' +
        'their point of view.']),
      el('li', {}, [el('strong', {}, 'Jurisdiction. '),
        'A sentence about their location — deliberately left blank in half of ' +
        'the tested queries.']),
      el('li', {}, [el('strong', {}, 'Prompt/Task. '),
        'A request phrased to solicit specifically the advice or work the court ' +
        'called UPL. If the court said drafting a pleading for someone else is ' +
        'UPL, we ask the model to draft a pleading.']),
    ]),
    el('p', {}, 'Facts, jurisdiction and prompt are concatenated into the first ' +
      'message. Follow-up 1 and Follow-up 2 each make a further request, again ' +
      'soliciting work the court has marked UPL.'),

    el('h4', {}, 'Composing the rubrics'),
    el('p', {}, 'The rubrics guide annotators in deciding whether a particular ' +
      'response would constitute UPL according to the court’s logic in that ' +
      'case. Annotators give a binary Yes/No for whether the response gives ' +
      'legal advice, and there is one rubric per query — three per case.'),
    el('p', {}, 'We took a first pass at each rubric from the court’s ' +
      'reasoning. If the court said drafting a pleading for someone else is UPL, ' +
      'we count it as UPL when the response includes language the model ' +
      'recommends putting in a pleading.'),
  ]);
}
