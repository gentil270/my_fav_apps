import { DriveMediaFile } from '../types';
import { clearAccessToken, getAccessToken } from './googleAuth';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
export const KEZA_FOLDER_NAME = 'KEZA Global Stream';

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Your Google Drive session has expired. Please sign in again.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new DriveAuthExpiredError('Google Drive sign-in is required.');
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearAccessToken();
    throw new DriveAuthExpiredError();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let msg = `Google Drive request failed (${response.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        msg = parsed.error.message;
      }
    } catch {
      if (errText) msg = errText.slice(0, 180);
    }
    throw new Error(msg);
  }

  return response;
}

export type DriveFilterMode = 'all' | 'audio' | 'video' | 'backups' | 'folders';

export async function listDriveMediaFiles(options: {
  filter?: DriveFilterMode;
  query?: string;
  folderId?: string | null;
  pageToken?: string;
}): Promise<{ files: DriveMediaFile[]; nextPageToken?: string }> {
  const { filter = 'all', query = '', folderId = null, pageToken } = options;
  const clauses: string[] = ['trashed = false'];

  if (folderId) {
    clauses.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);
  } else if (filter === 'audio') {
    clauses.push(`mimeType contains 'audio/'`);
  } else if (filter === 'video') {
    clauses.push(`mimeType contains 'video/'`);
  } else if (filter === 'backups') {
    clauses.push(`(name contains 'KEZA' or name contains 'Umutuzo' or mimeType = 'application/json')`);
  } else if (filter === 'folders') {
    clauses.push(`mimeType = 'application/vnd.google-apps.folder'`);
  } else {
    clauses.push(
      `(mimeType contains 'audio/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder' or ((name contains 'KEZA' or name contains 'Umutuzo') and mimeType = 'application/json'))`
    );
  }

  if (query.trim()) {
    const escaped = query.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    clauses.push(`name contains '${escaped}'`);
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields:
      'nextPageToken,files(id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink,webViewLink,parents,ownedByMe,capabilities(canEdit,canDelete,canRename))',
    orderBy: 'folder,modifiedTime desc',
    pageSize: '40',
  });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const res = await driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`);
  const data = await res.json();
  return {
    files: Array.isArray(data.files) ? data.files : [],
    nextPageToken: data.nextPageToken,
  };
}

export async function fetchDriveMediaBlob(fileId: string): Promise<{ blob: Blob; mimeType: string }> {
  const res = await driveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`
  );
  const blob = await res.blob();
  return {
    blob,
    mimeType: blob.type || res.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function fetchDriveJsonFile<T = unknown>(fileId: string): Promise<T> {
  const res = await driveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`
  );
  return res.json();
}

export async function ensureKezaFolder(): Promise<DriveMediaFile> {
  const q = `name = '${KEZA_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    pageSize: '1',
  });
  const listRes = await driveFetch(`${DRIVE_API_BASE}/files?${params.toString()}`);
  const listData = await listRes.json();
  if (Array.isArray(listData.files) && listData.files.length > 0) {
    return listData.files[0];
  }

  const createRes = await driveFetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: KEZA_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Media library backups, playlists, and offline radio captures from KEZA Global Stream.',
    }),
  });
  return createRes.json();
}

export async function uploadBlobToDrive(options: {
  name: string;
  mimeType: string;
  content: Blob | string;
  folderId?: string;
  existingFileId?: string;
}): Promise<DriveMediaFile> {
  const { name, mimeType, content, folderId, existingFileId } = options;
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : content;

  const boundary = 'keza_drive_boundary_' + Math.random().toString(36).slice(2);
  const metadata: Record<string, unknown> = {
    name,
    mimeType,
  };
  if (!existingFileId && folderId) {
    metadata.parents = [folderId];
  }

  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--`;

  const multipartBody = new Blob([preamble, blob, epilogue], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const url = existingFileId
    ? `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canEdit,canDelete,canRename)`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canEdit,canDelete,canRename)`;

  const res = await driveFetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  return res.json();
}

export async function renameDriveFile(fileId: string, newName: string): Promise<DriveMediaFile> {
  const res = await driveFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    }
  );
  return res.json();
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
}
