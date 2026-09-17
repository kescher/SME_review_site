/* The closing page: one last open question after every transcript is done. */

import { CONFIG } from '../../config.js';
import { el, toast, debounce } from '../util.js';
import {
  state, counts, getDraft, saveDraft, submitFinal, finalSubmitted, FINAL_REF,
} from '../data/store.js';
import { topbar } from './components.js';
import { createEditor, isEmpty } from './editor.js';

export function renderFinal({ onDone, onSignOut }) {
  const { total } = counts();
  const draft = getDraft(FINAL_REF);
  const answers = {};

  const saveNote = el('div', { class: 'save' }, draft._at ? 'Draft restored' : '');

  const persist = debounce(() => {
    saveDraft(FINAL_REF, answers);
    saveNote.textContent = 'Draft saved';
    saveNote.classList.add('ok');
  }, 600);

  const fields = CONFIG.FINAL_QUESTIONS.map(q => {
    answers[q.id] = draft[q.id] || '';

    const editor = createEditor({
      value: answers[q.id],
      placeholder: 'Type your answer…',
      onChange: html => { answers[q.id] = html; persist(); refresh(); },
    });

    return el('div', { class: 'field' }, [
      el('label', {}, [q.label, q.required ? el('span', { class: 'req' }, '*') : null]),
      q.help ? el('div', { class: 'help' }, q.help) : null,
      editor.element,
    ]);
  });

  const submit = el('button', { class: 'btn lg', onclick: send }, 'Finish and submit');
  const skip = el('button', {
    class: 'btn ghost',
    onclick: () => { if (confirm('Finish without adding anything?')) send(); },
  }, 'Nothing to add');

  function refresh() {
    const missing = CONFIG.FINAL_QUESTIONS.filter(q => q.required && isEmpty(answers[q.id]));
    submit.disabled = missing.length > 0;
    const blank = CONFIG.FINAL_QUESTIONS.every(q => isEmpty(answers[q.id]));
    skip.style.display = blank ? '' : 'none';
  }

  async function send() {
    persist.flush();
    submit.disabled = true;
    submit.textContent = 'Submitting…';
    try {
      await submitFinal(answers);
      toast('Thank you — your review is complete.', 'good');
      onDone();
    } catch (err) {
      console.error(err);
      toast(`Could not save your answers: ${err.message}`, 'bad');
      submit.textContent = 'Finish and submit';
      refresh();
    }
  }

  refresh();

  return el('div', { class: 'app', style: 'flex:1' }, [
    topbar({ crumb: 'Last question', onSignOut }),
    el('div', { class: 'page' }, [
      el('div', { class: 'wrap' }, [
        el('div', { class: 'kicker' },
          `${state.reviewer.domainLabel} · ${total} of ${total} transcripts reviewed`),
        el('h2', {}, 'One last question'),
        el('p', { class: 'sub' },
          'That is every transcript — thank you. Before you finish, this page is ' +
          'yours for anything the questions so far did not cover.'),

        finalSubmitted()
          ? el('div', { class: 'alert warn' },
              'You have already submitted this page. Submitting again appends a ' +
              'second set of remarks to your document.')
          : null,

        el('div', { class: 'card qbody' }, fields),

        el('div', { class: 'actions' }, [saveNote, skip, submit]),
      ]),
    ]),
  ]);
}
