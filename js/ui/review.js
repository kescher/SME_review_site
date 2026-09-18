/* The review screen: transcript on the left, rubric and questions on the right. */

import { CONFIG } from '../../config.js';
import { el, toast, debounce, escapeHtml, fmtTime } from '../util.js';
import { state, getAnswers, saveAnswers, isSubmitted, submitAnswers } from '../data/store.js';
import { topbar, rail } from './components.js';
import { createPdfViewer } from './pdfviewer.js';
import { createEditor, isEmpty } from './editor.js';

export function renderReview({ theCase, index, onDone, onSignOut, onNavigate }) {
  const transcript = theCase.transcripts[index];
  const saved = getAnswers(transcript.ref);
  const answers = {};
  const editors = {};

  const viewer = createPdfViewer(transcript);

  /* -- rubric strip ------------------------------------------------------ */
  // The source document calls these Prompt/Task, Follow-up 1 and Follow-up 2;
  // reviewers see them as the turns they correspond to.
  const rubricCols = [
    ['Turn 1 Rubric', transcript.prompt],
    ['Turn 2 Rubric', transcript.followup1],
    ['Turn 3 Rubric', transcript.followup2],
  ].filter(([, cell]) => cell && (cell.text || typeof cell === 'string'));

  const toggle = el('button', { class: 'link', onclick: () => {
    rubric.classList.toggle('collapsed');
    toggle.textContent = rubric.classList.contains('collapsed') ? 'Show' : 'Hide';
  } }, 'Hide');

  const rubric = el('div', { class: 'rubric' }, [
    el('div', { class: 'rtitle' }, ['Rubric', toggle]),
    el('div', { class: 'rgrid' }, rubricCols.map(([head, cell]) =>
      el('div', { class: 'rcol' }, [el('h4', {}, head), ...rubricBody(cell)]))),
    transcript.labels
      ? el('div', { class: 'labels', html: `Our labels: <span>${escapeHtml(transcript.labels)}</span>` })
      : null,
  ]);

  /* -- questions --------------------------------------------------------- */
  const saveNote = el('div', { class: 'save' }, savedLabel(saved));

  const persist = debounce(() => {
    saveAnswers(transcript.ref, answers);
    saveNote.textContent = 'Draft saved';
    saveNote.classList.add('ok');
  }, 600);

  const fields = CONFIG.QUESTIONS.map(q => {
    answers[q.id] = saved[q.id] || '';

    const editor = createEditor({
      value: answers[q.id],
      placeholder: 'Type your answer…',
      onChange: html => {
        answers[q.id] = html;
        persist();
        refreshSubmit();
      },
    });
    editors[q.id] = editor;

    return el('div', { class: 'field' }, [
      el('label', {}, [q.label, q.required ? el('span', { class: 'req' }, '*') : null]),
      q.help ? el('div', { class: 'help' }, q.help) : null,
      editor.element,
    ]);
  });

  /* -- footer ------------------------------------------------------------ */
  const back = el('button', {
    class: 'btn ghost',
    disabled: index === 0,
    onclick: () => onNavigate(index - 1),
  }, '← Previous');

  const last = index === theCase.transcripts.length - 1;
  const submit = el('button', { class: 'btn', onclick: send },
    last ? 'Submit & finish case' : 'Submit & next');

  function refreshSubmit() {
    const missing = CONFIG.QUESTIONS
      .filter(q => q.required && isEmpty(answers[q.id]));
    submit.disabled = missing.length > 0;
    submit.title = missing.length
      ? `Still to answer: ${missing.map(q => q.label).join(' · ')}`
      : '';
  }

  async function send() {
    persist.flush();
    submit.disabled = true;
    submit.textContent = 'Submitting…';
    try {
      await submitAnswers(theCase, transcript, answers);
      toast('Answers saved to your review document.', 'good');
      onDone(index);
    } catch (err) {
      console.error(err);
      toast(`Could not save your answers: ${err.message}`, 'bad');
      submit.textContent = last ? 'Submit & finish case' : 'Submit & next';
      refreshSubmit();
    }
  }

  const foot = el('div', { class: 'qfoot' }, [saveNote, back, submit]);

  const heading = el('div', { class: 'qhead' }, [
    el('strong', {}, `Transcript ${transcript.number} of ${theCase.transcripts.length}`),
    isSubmitted(transcript.ref)
      ? ' · submitted — your answers are shown below; resubmitting appends a new entry'
      : '',
  ]);

  const questionPane = el('div', { class: 'pane-q' }, [
    rubric,
    el('div', { class: 'qbody' }, [heading, ...fields]),
    foot,
  ]);

  const gutter = el('div', { class: 'gutter' });
  makeResizable(gutter, questionPane);

  refreshSubmit();

  const root = el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: theCase.title, onSignOut }),
    rail(theCase, index),
    el('div', { class: 'split' }, [viewer.element, gutter, questionPane]),
  ]);

  root.__destroy = () => viewer.destroy();
  return root;
}

/** Drag the divider to give either pane more room. */
function makeResizable(gutter, pane) {
  let dragging = false;

  const move = e => {
    if (!dragging) return;
    const width = Math.min(Math.max(window.innerWidth - e.clientX, 340), window.innerWidth * 0.7);
    pane.style.setProperty('--qwidth', `${width}px`);
    pane.style.flexBasis = `${width}px`;
  };

  const stop = () => {
    dragging = false;
    gutter.classList.remove('dragging');
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);
  };

  gutter.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    gutter.classList.add('dragging');
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  });
}

/** A rubric cell is {noUpl, yesUpl, text}; older data may be a plain string. */
function rubricBody(cell) {
  if (typeof cell === 'string') return [el('div', { class: 'rbody' }, cell)];

  const side = (label, items, kind) => items.length
    ? el('div', { class: `rside ${kind}` }, [
        el('div', { class: 'rlabel' }, label),
        el('ul', {}, items.map(i => el('li', {}, i))),
      ])
    : null;

  const parts = [
    side('No UPL', cell.noUpl || [], 'no'),
    side('Yes UPL', cell.yesUpl || [], 'yes'),
  ].filter(Boolean);

  return parts.length ? parts : [el('div', { class: 'rbody' }, cell.text || '')];
}

/** What the footer says about previously stored answers. */
function savedLabel(saved) {
  if (saved._submittedAt) return `Submitted ${fmtTime(new Date(saved._submittedAt))}`;
  if (saved._at) return 'Draft restored';
  return '';
}
