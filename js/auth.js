/* Google sign-in via Google Identity Services.
 *
 * The app is fully static, so it holds no secrets: the reviewer signs in with
 * their own Google account and every API call is made as that person. Real
 * access control therefore lives in Drive/Sheet sharing — the Reviewers tab is
 * an assignment roster and a friendly gate, not a security boundary.
 */

import { CONFIG } from '../config.js';
import { toast } from './util.js';

const KEY = 'sme.session';

let tokenClient = null;
let token = null;          // { access_token, expires_at }
export let profile = null; // { email, name, picture }

/* -- session persistence (survives reloads within the tab) ---------------- */

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, profile }));
  } catch { /* private browsing — in-memory only */ }
}

function restore() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.profile) return;

    // Demo mode has no token; live mode needs one that is still valid.
    if (CONFIG.DEMO) profile = saved.profile;
    else if (saved.token?.expires_at > Date.now() + 30_000) {
      token = saved.token;
      profile = saved.profile;
    }
  } catch { /* ignore corrupt state */ }
}

/* -- GIS bootstrap -------------------------------------------------------- */

function gisReady() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > 10_000) return reject(new Error('Google sign-in script failed to load.'));
      setTimeout(poll, 60);
    })();
  });
}

export async function init() {
  restore();
  if (CONFIG.DEMO) return;

  if (!CONFIG.CLIENT_ID) throw new Error('CONFIG.CLIENT_ID is not set — see SETUP.md.');

  await gisReady();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: () => {}, // replaced per-request below
  });
}

/** Ask Google for an access token. `prompt` of '' attempts a silent refresh. */
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = resp => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      token = {
        access_token: resp.access_token,
        expires_at: Date.now() + (Number(resp.expires_in) - 60) * 1000,
      };
      save();
      resolve(token);
    };
    try {
      tokenClient.requestAccessToken({ prompt });
    } catch (err) {
      reject(err);
    }
  });
}

/* -- public API ----------------------------------------------------------- */

export function isSignedIn() {
  return Boolean(CONFIG.DEMO ? profile : profile && token);
}

export async function getToken() {
  if (CONFIG.DEMO) return 'demo-token';
  if (token && token.expires_at > Date.now()) return token.access_token;
  // Silent refresh; Google falls back to a popup only if consent lapsed.
  await requestToken('');
  return token.access_token;
}

export async function signIn() {
  if (CONFIG.DEMO) {
    profile = { email: 'demo.reviewer@example.com', name: 'Demo Reviewer' };
    save();
    return profile;
  }
  await requestToken('consent');
  profile = await fetchProfile();
  save();
  return profile;
}

async function fetchProfile() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!res.ok) throw new Error('Could not read your Google profile.');
  const me = await res.json();
  return {
    email: (me.email || '').toLowerCase(),
    name: me.name || me.email,
    picture: me.picture,
  };
}

/**
 * `revoke: false` drops the local session but leaves the granted consent in
 * place, so a retry after a configuration error costs one click rather than a
 * full re-authorisation.
 */
export function signOut({ revoke = true } = {}) {
  if (revoke && !CONFIG.DEMO && token?.access_token && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(token.access_token, () => {}); } catch { /* noop */ }
  }
  token = null;
  profile = null;
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  if (revoke) toast('Signed out.');
}
