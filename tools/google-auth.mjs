/* Minimal Google service-account auth. No npm dependencies: the JWT is signed
 * with node:crypto and exchanged for an access token directly. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(process.cwd(), 'tools', 'credentials.json'),
  path.join(os.homedir(), '.config', 'sme-review', 'credentials.json'),
].filter(Boolean);

export function loadKey(explicit) {
  const tried = explicit ? [explicit, ...CANDIDATES] : CANDIDATES;
  for (const file of tried) {
    if (fs.existsSync(file)) {
      const key = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (key.type !== 'service_account') {
        throw new Error(
          `${file} is not a service-account key (found type "${key.type}").`);
      }
      return { key, file };
    }
  }
  throw new Error(
    'No service-account key found. Looked in:\n  ' + tried.join('\n  ') +
    '\nSee SETUP.md for how to create one.');
}

const b64 = obj =>
  Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64url');

export async function getAccessToken(key, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key)
    .toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${body.error_description || body.error}`);
  }
  return body.access_token;
}

export function makeFetcher(token) {
  return async function get(url, { raw = false } = {}) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* html error */ }
      if (res.status === 403 || res.status === 404) {
        detail += '\n  → Share the file with the service account address shown above.';
      }
      throw new Error(`${res.status} ${url.split('?')[0]}\n  ${detail}`);
    }
    return raw ? res : res.json();
  };
}
