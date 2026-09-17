/* Authenticated fetch against the Google REST APIs. */

import { getToken } from '../auth.js';

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function describe(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch { /* non-JSON error body */ }

  if (res.status === 403) {
    return `Access denied by Google${detail ? `: ${detail}` : ''}. ` +
           'Check that this file has been shared with your account.';
  }
  if (res.status === 404) return `Not found${detail ? `: ${detail}` : ''}.`;
  return detail || `Google API error ${res.status}.`;
}

export async function api(url, opts = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new ApiError(await describe(res), res.status);
  return opts.raw ? res : res.json();
}

export const apiJson = (url, method, body) =>
  api(url, { method, body: JSON.stringify(body) });
