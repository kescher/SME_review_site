/* Drive: locate transcript PDFs and file the finished answer doc. */

import { CONFIG } from '../../config.js';
import { api, apiJson } from './http.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';

/** Map of lowercased file name -> file id for the configured PDF folder. */
export async function indexPdfFolder() {
  if (!CONFIG.PDF_FOLDER_ID) return new Map();

  const index = new Map();
  let pageToken = '';
  do {
    const q = encodeURIComponent(
      `'${CONFIG.PDF_FOLDER_ID}' in parents and trashed = false`);
    const page = await api(
      `${FILES}?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${pageToken}` : ''));

    for (const f of page.files || []) {
      index.set(f.name.toLowerCase(), f.id);
      index.set(f.name.replace(/\.pdf$/i, '').toLowerCase(), f.id);
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  return index;
}

/** Download a PDF as an ArrayBuffer for the viewer. */
export async function fetchPdf(fileId) {
  const res = await api(
    `${FILES}/${fileId}?alt=media&supportsAllDrives=true`, { raw: true });
  return res.arrayBuffer();
}

/** Find this reviewer's existing answer doc, if they have one. */
export async function findDocByName(name) {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and ` +
    `mimeType = 'application/vnd.google-apps.document' and trashed = false`);
  const res = await api(
    `${FILES}?q=${q}&fields=files(id,name)&pageSize=10` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return res.files?.[0]?.id || null;
}

/** Move a newly created doc into the shared responses folder. */
export async function moveToFolder(fileId, folderId) {
  if (!folderId) return;
  await apiJson(
    `${FILES}/${fileId}?addParents=${folderId}&removeParents=root` +
    `&supportsAllDrives=true&fields=id`, 'PATCH', {});
}

/** Give the study administrator write access to a reviewer's doc. */
export async function shareWith(fileId, email) {
  if (!email) return;
  await apiJson(
    `${FILES}/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
    'POST',
    { role: 'writer', type: 'user', emailAddress: email });
}
