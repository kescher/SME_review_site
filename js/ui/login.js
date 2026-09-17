import { CONFIG } from '../../config.js';
import { el } from '../util.js';

const GOOGLE_G = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>
<path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.4z"/>
<path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.8-6.1z"/>
<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.3 0-11.7-3.7-13.6-9.2l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
</svg>`;

export function renderLogin({ error, onSignIn }) {
  const misconfigured = !CONFIG.DEMO && !CONFIG.CLIENT_ID;

  const button = el('button', { class: 'gbtn', onclick: go, disabled: misconfigured }, [
    el('span', { html: GOOGLE_G }),
    CONFIG.DEMO ? 'Continue in demo mode' : 'Sign in with Google',
  ]);

  async function go() {
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      await onSignIn();
    } finally {
      button.disabled = false;
      button.textContent = CONFIG.DEMO ? 'Continue in demo mode' : 'Sign in with Google';
    }
  }

  return el('div', { class: 'login' }, [
    el('div', { class: 'card' }, [
      el('div', { class: 'mark' }, '⚖️'),
      el('h2', {}, 'SME Review Platform'),
      el('p', { class: 'sub' }, 'Subject-matter expert review of AI legal assistance'),

      error ? el('div', { class: 'alert bad' }, error) : null,

      misconfigured
        ? el('div', { class: 'alert bad' },
            'This deployment has no Google client ID configured, so sign-in ' +
            'cannot work yet. See SETUP.md, step 7.')
        : null,

      CONFIG.DEMO
        ? el('div', { class: 'alert warn' },
            'Demo mode: the real review flow, with no sign-in. Your answers stay ' +
            'in this browser and nothing is written to Google.')
        : null,

      button,

      el('p', { class: 'note' },
        CONFIG.DEMO
          ? 'Drop the ?demo=1 from the address to sign in as yourself.'
          : 'Sign in with the Google account you were invited with. Your answers ' +
            'are written to a Google Doc owned by you — this site has no server ' +
            'and stores nothing itself.'),
    ]),
  ]);
}
