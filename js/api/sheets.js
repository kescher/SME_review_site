/* Reads the configuration spreadsheet and turns each tab into objects. */

import { CONFIG } from '../../config.js';
import { api } from './http.js';
import { normKey } from '../util.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Fetch several tabs in one round trip. */
export async function readTabs(tabNames) {
  const qs = tabNames.map(t => `ranges=${encodeURIComponent(t)}`).join('&');
  const data = await api(
    `${BASE}/${CONFIG.SHEET_ID}/values:batchGet?${qs}&majorDimension=ROWS`);

  const out = {};
  (data.valueRanges || []).forEach((range, i) => {
    out[tabNames[i]] = toObjects(range.values || []);
  });
  return out;
}

/** First non-empty row is the header; blank rows are skipped. */
function toObjects(rows) {
  const headerIdx = rows.findIndex(r => r.some(c => String(c).trim()));
  if (headerIdx < 0) return [];

  const header = rows[headerIdx].map(normKey);
  return rows.slice(headerIdx + 1)
    .filter(r => r.some(c => String(c).trim()))
    .map(r => {
      const obj = {};
      header.forEach((key, i) => { if (key) obj[key] = String(r[i] ?? '').trim(); });
      return obj;
    });
}

/** Pull a value using the configured column name, tolerating header drift. */
export const col = (row, name) => row[normKey(name)] ?? '';
