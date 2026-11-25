import { OfflineRadioClip, RadioStation } from '../types';

const DB_NAME = 'keza-offline-radio-v1';
const STORE_NAME = 'radio_clips';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('stationId', 'stationId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listOfflineRadioClips(): Promise<OfflineRadioClip[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as OfflineRadioClip[]) || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getOfflineClipById(id: string): Promise<OfflineRadioClip | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve((req.result as OfflineRadioClip) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getOfflineClipByStationId(stationId: string): Promise<OfflineRadioClip | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const idx = tx.objectStore(STORE_NAME).index('stationId');
      const req = idx.getAll(stationId);
      req.onsuccess = () => {
        const list = (req.result as OfflineRadioClip[]) || [];
        list.sort((a, b) => b.createdAt - a.createdAt);
        resolve(list[0] || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveOfflineRadioClip(clip: OfflineRadioClip): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(clip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOfflineRadioClip(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearOfflineRadioVault(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function captureLiveStationForOffline(
  station: RadioStation,
  options: {
    maxBytes?: number;
    maxDurationMs?: number;
    signal?: AbortSignal;
    onProgress?: (bytes: number, elapsedSec: number) => void;
  } = {}
): Promise<OfflineRadioClip> {
  const maxBytes = options.maxBytes ?? 1_200_000;
  const maxDurationMs = options.maxDurationMs ?? 25_000;
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  const startedAt = Date.now();
  const timer = window.setTimeout(() => controller.abort(), maxDurationMs);

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let mimeType = 'audio/mpeg';

  try {
    const res = await fetch(station.streamUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Stream returned ${res.status}`);
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('audio')) {
      mimeType = contentType.split(';')[0].trim();
    }

    const reader = res.body?.getReader();
    if (!reader) {
      const arr = new Uint8Array(await res.arrayBuffer());
      chunks.push(arr.slice(0, maxBytes));
      totalBytes = chunks[0].byteLength;
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalBytes += value.byteLength;
        options.onProgress?.(totalBytes, Math.round((Date.now() - startedAt) / 1000));
        if (totalBytes >= maxBytes) {
          controller.abort();
          break;
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError' && totalBytes < 16_000) {
      throw err;
    }
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (totalBytes < 8_000) {
    throw new Error('Could not capture enough audio bytes from this broadcast.');
  }

  const blobParts: BlobPart[] = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  const blob = new Blob(blobParts, { type: mimeType });
  const elapsedSec = Math.max(8, Math.round((Date.now() - startedAt) / 1000));
  const clip: OfflineRadioClip = {
    id: `offline_${station.id}_${Date.now()}`,
    stationId: station.id,
    title: station.name,
    subtitle: `${station.country || 'Global'} · ${station.isMix ? 'Full Mix' : 'Live Broadcast Capture'}`,
    country: station.country || 'Global',
    tags: station.tags || [],
    mimeType,
    sizeBytes: blob.size,
    durationSec: station.durationSec || elapsedSec,
    createdAt: Date.now(),
    coverUrl: station.favicon,
    isMix: station.isMix,
    blob,
  };

  await saveOfflineRadioClip(clip);
  return clip;
}

export async function seedStarterOfflineRadioPack(stations: RadioStation[]): Promise<number> {
  const existing = await listOfflineRadioClips();
  if (existing.length >= 2) return 0;

  const mixCandidates = stations.filter((s) => s.isMix).slice(0, 2);
  const liveCandidates = stations.filter((s) => !s.isMix).slice(0, 2);
  const candidates = [...mixCandidates, ...liveCandidates].slice(0, 3);

  let saved = 0;
  for (const st of candidates) {
    const already = await getOfflineClipByStationId(st.id);
    if (already) continue;
    try {
      await captureLiveStationForOffline(st, {
        maxBytes: st.isMix ? 900_000 : 320_000,
        maxDurationMs: 7_500,
      });
      saved += 1;
    } catch {
      // Skip stations that fail quick background sync
    }
  }
  return saved;
}
