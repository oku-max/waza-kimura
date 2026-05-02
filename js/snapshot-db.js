/**
 * snapshot-db.js — IndexedDB (local cache) + Firestore subcollection (cloud sync)
 * WAZA KIMURA BJJ Video Library
 *
 * Each snapshot image is stored as base64 in Firestore:
 *   users/{uid}/snapshots/{snapId} → { videoId, data (base64), annotations, updatedAt }
 * IndexedDB stores the blob locally for fast access.
 */

const DB_NAME = 'waza-kimura-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbInstance = null;

// Firestoreアップロード完了を待つために外部から参照可能なPromiseセット
export const pendingUploads = new Set();

// ── Firestore helpers ──

function _getDb() {
  try {
    return firebase.firestore();
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

/** Get Firestore doc ref: users/{uid}/snapshots/{snapId} */
function _docRef(snapId) {
  const db = _getDb();
  const uid = _getUid();
  if (!db || !uid) return null;
  return db.collection('users').doc(uid).collection('snapshots').doc(snapId);
}

/** Convert Blob → base64 data URL string */
function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert base64 data URL → Blob */
function _base64ToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Upload snapshot to Firestore subcollection (background, non-blocking).
 */
async function _uploadToFirestore(snapId, videoId, blob, annotations = []) {
  const ref = _docRef(snapId);
  if (!ref) { console.warn('[snapshot-db] _uploadToFirestore: no ref (not logged in?)'); return; }

  try {
    const data = await _blobToBase64(blob);
    const sizeKB = Math.round(data.length / 1024);
    console.log(`[snapshot-db] Uploading ${snapId} to Firestore (${sizeKB}KB)...`);
    await ref.set({
      videoId,
      data,
      annotations: annotations || [],
      updatedAt: Date.now()
    });
    console.log(`[snapshot-db] Upload OK: ${snapId}`);
  } catch (err) {
    console.error('[snapshot-db] Firestore upload FAILED:', snapId, err.code, err.message);
  }
}

/**
 * Download snapshot from Firestore subcollection.
 * Returns { blob, annotations } or null.
 */
async function _downloadFromFirestore(snapId) {
  const ref = _docRef(snapId);
  if (!ref) { console.warn('[snapshot-db] _downloadFromFirestore: no ref (not logged in?)'); return null; }

  try {
    console.log(`[snapshot-db] Downloading ${snapId} from Firestore...`);
    const doc = await ref.get();
    if (!doc.exists) { console.log(`[snapshot-db] Not found in Firestore: ${snapId}`); return null; }
    const d = doc.data();
    if (!d.data) { console.log(`[snapshot-db] No data field in Firestore doc: ${snapId}`); return null; }
    const blob = _base64ToBlob(d.data);
    console.log(`[snapshot-db] Download OK: ${snapId}`);
    return { blob, annotations: d.annotations || [], videoId: d.videoId || '' };
  } catch (err) {
    console.error('[snapshot-db] Firestore download FAILED:', snapId, err.code, err.message);
    return null;
  }
}

/**
 * Delete snapshot from Firestore subcollection.
 */
async function _deleteFromFirestore(snapId) {
  const ref = _docRef(snapId);
  if (!ref) return;

  try {
    await ref.delete();
  } catch (_) {
    // Ignore — doc may not exist
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
 * Saves to IndexedDB (local cache) + Firestore subcollection (cloud).
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

    // Upload to Firestore in background (don't block UI)
    // pendingUploads でトラッキングし、呼び出し元がアップロード完了を待てるようにする
    const up = _uploadToFirestore(id, videoId, blob, annotations);
    pendingUploads.add(up);
    up.finally(() => pendingUploads.delete(up));

    return record;
  } catch (err) {
    console.error('[snapshot-db] putSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve a single snapshot by id.
 * Tries IndexedDB first, falls back to Firestore.
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

    // Fallback: download from Firestore
    const cloud = await _downloadFromFirestore(id);
    if (cloud) {
      const record = { id, videoId: cloud.videoId, blob: cloud.blob, annotations: cloud.annotations, updatedAt: Date.now() };
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
 * Deletes from both IndexedDB and Firestore.
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

    // Delete from Firestore in background
    _deleteFromFirestore(id);
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve all snapshots for a given video from local IndexedDB.
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
 * Sync snapshots: for refs in Firestore metadata but missing locally,
 * download from Firestore subcollection. For refs that exist locally,
 * ensure they're also uploaded to Firestore (background).
 * @param {string} videoId
 * @param {Array<{id, memo, order}>} refs - Firestore video doc refs
 * @returns {Promise<Array<{id, videoId, blob, annotations, updatedAt}>>}
 */
export async function syncSnapshotsFromCloud(videoId, refs) {
  if (!refs || !refs.length) return [];

  const db = await openSnapDB();
  const localSnaps = await getSnapshotsByVideo(videoId);
  const localMap = new Map(localSnaps.map(s => [s.id, s]));

  const results = [];

  for (const ref of refs) {
    const local = localMap.get(ref.id);

    if (local && local.blob) {
      results.push(local);
      // Ensure local blob is also in Firestore (background, no await)
      _uploadToFirestore(ref.id, videoId, local.blob, local.annotations || []);
      continue;
    }

    // Missing locally — download from Firestore subcollection
    const cloud = await _downloadFromFirestore(ref.id);
    if (cloud) {
      const record = { id: ref.id, videoId, blob: cloud.blob, annotations: cloud.annotations, updatedAt: Date.now() };
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
 * Delete all snapshots belonging to a video.
 * Deletes from both IndexedDB and Firestore.
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

    // Delete from Firestore in background
    for (const snap of snapshots) {
      _deleteFromFirestore(snap.id);
    }
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshotsByVideo failed:', err);
    throw err;
  }
}
