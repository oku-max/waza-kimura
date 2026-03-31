/**
 * snapshot-db.js — IndexedDB + Firebase Storage for snapshot image blobs
 * WAZA KIMURA BJJ Video Library
 *
 * IndexedDB = local cache, Firebase Storage = cloud (cross-device sync)
 */

const DB_NAME = 'waza-kimura-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbInstance = null;

// ── Firebase Storage helpers ──

function _getStorage() {
  try {
    return firebase.storage();
  } catch (_) {
    return null;
  }
}

function _getUid() {
  try {
    return firebase.auth().currentUser?.uid || null;
  } catch (_) {
    return null;
  }
}

function _storagePath(snapId) {
  const uid = _getUid();
  if (!uid) return null;
  return `snapshots/${uid}/${snapId}.jpg`;
}

/**
 * Upload blob to Firebase Storage.
 * Silently fails if not authenticated or storage unavailable.
 */
async function _uploadToCloud(snapId, blob) {
  const storage = _getStorage();
  const path = _storagePath(snapId);
  if (!storage || !path) return;

  try {
    const ref = storage.ref(path);
    await ref.put(blob, { contentType: 'image/jpeg' });
  } catch (err) {
    console.warn('[snapshot-db] Cloud upload failed:', snapId, err.message);
  }
}

/**
 * Download blob from Firebase Storage.
 * Returns null if not available.
 */
async function _downloadFromCloud(snapId) {
  const storage = _getStorage();
  const path = _storagePath(snapId);
  if (!storage || !path) return null;

  try {
    const ref = storage.ref(path);
    const url = await ref.getDownloadURL();
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch (err) {
    // File doesn't exist in cloud or network error
    return null;
  }
}

/**
 * Delete blob from Firebase Storage.
 */
async function _deleteFromCloud(snapId) {
  const storage = _getStorage();
  const path = _storagePath(snapId);
  if (!storage || !path) return;

  try {
    await storage.ref(path).delete();
  } catch (_) {
    // Ignore — file may not exist
  }
}

// ── IndexedDB ──

/**
 * Open (or reuse) the IndexedDB connection.
 * @returns {Promise<IDBDatabase>}
 */
export async function openSnapDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('videoId', 'videoId', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('[snapshot-db] Failed to open DB:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Insert or update a snapshot record.
 * Saves to IndexedDB (local cache) + Firebase Storage (cloud).
 */
export async function putSnapshot(id, videoId, blob, annotations = []) {
  try {
    const db = await openSnapDB();
    const record = { id, videoId, blob, annotations, updatedAt: Date.now() };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });

    // Upload to cloud in background (don't block UI)
    _uploadToCloud(id, blob);

    return record;
  } catch (err) {
    console.error('[snapshot-db] putSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve a single snapshot by id.
 * Tries IndexedDB first, falls back to Firebase Storage.
 * @returns {Promise<{id, videoId, blob, annotations, updatedAt}|null>}
 */
export async function getSnapshot(id) {
  try {
    const db = await openSnapDB();

    const local = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = (e) => reject(e.target.error);
    });

    if (local && local.blob) return local;

    // Fallback: download from cloud
    const blob = await _downloadFromCloud(id);
    if (blob) {
      const record = { id, videoId: local?.videoId || '', blob, annotations: local?.annotations || [], updatedAt: Date.now() };
      // Cache locally
      try {
        const tx2 = db.transaction(STORE_NAME, 'readwrite');
        tx2.objectStore(STORE_NAME).put(record);
      } catch (_) {}
      return record;
    }

    return local;
  } catch (err) {
    console.error('[snapshot-db] getSnapshot failed:', err);
    throw err;
  }
}

/**
 * Delete a single snapshot by id.
 * Deletes from both IndexedDB and Firebase Storage.
 */
export async function deleteSnapshot(id) {
  try {
    const db = await openSnapDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });

    // Delete from cloud in background
    _deleteFromCloud(id);
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve all snapshots for a given video.
 * For any snapshot refs missing locally, attempts cloud download.
 * @returns {Promise<Array<{id, videoId, blob, annotations, updatedAt}>>}
 */
export async function getSnapshotsByVideo(videoId) {
  try {
    const db = await openSnapDB();

    const localSnaps = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('videoId');
      const request = index.getAll(videoId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });

    return localSnaps.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
  } catch (err) {
    console.error('[snapshot-db] getSnapshotsByVideo failed:', err);
    throw err;
  }
}

/**
 * For snapshots that exist in Firestore refs but not in local IndexedDB,
 * download them from Firebase Storage and cache locally.
 * @param {string} videoId
 * @param {Array<{id, memo, order}>} refs - Firestore refs
 * @returns {Promise<Array<{id, videoId, blob, annotations, updatedAt}>>}
 */
export async function syncSnapshotsFromCloud(videoId, refs) {
  if (!refs || !refs.length) return [];

  const db = await openSnapDB();
  const localSnaps = await getSnapshotsByVideo(videoId);
  const localMap = new Map(localSnaps.map(s => [s.id, s]));

  const results = [];

  for (const ref of refs) {
    if (localMap.has(ref.id) && localMap.get(ref.id).blob) {
      results.push(localMap.get(ref.id));
      continue;
    }

    // Missing locally — download from cloud
    const blob = await _downloadFromCloud(ref.id);
    if (blob) {
      const record = { id: ref.id, videoId, blob, annotations: [], updatedAt: Date.now() };
      // Cache in IndexedDB
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
      } catch (_) {}
      results.push(record);
    }
  }

  return results;
}

/**
 * Delete all snapshots belonging to a video (cleanup on video removal).
 * Deletes from both IndexedDB and Firebase Storage.
 */
export async function deleteSnapshotsByVideo(videoId) {
  try {
    const snapshots = await getSnapshotsByVideo(videoId);
    if (snapshots.length === 0) return;

    const db = await openSnapDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const snap of snapshots) {
        store.delete(snap.id);
      }
      tx.oncomplete = () => resolve(snapshots.length);
      tx.onerror = (e) => reject(e.target.error);
    });

    // Delete from cloud in background
    for (const snap of snapshots) {
      _deleteFromCloud(snap.id);
    }
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshotsByVideo failed:', err);
    throw err;
  }
}
