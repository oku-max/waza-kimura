/**
 * snapshot-db.js — IndexedDB wrapper for snapshot image blobs
 * WAZA KIMURA BJJ Video Library
 */

const DB_NAME = 'waza-kimura-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbInstance = null;

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
 */
export async function putSnapshot(id, videoId, blob, annotations = []) {
  try {
    const db = await openSnapDB();
    const record = { id, videoId, blob, annotations, updatedAt: Date.now() };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[snapshot-db] putSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve a single snapshot by id.
 * @returns {Promise<{id, videoId, blob, annotations, updatedAt}|null>}
 */
export async function getSnapshot(id) {
  try {
    const db = await openSnapDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[snapshot-db] getSnapshot failed:', err);
    throw err;
  }
}

/**
 * Delete a single snapshot by id.
 */
export async function deleteSnapshot(id) {
  try {
    const db = await openSnapDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshot failed:', err);
    throw err;
  }
}

/**
 * Retrieve all snapshots for a given video, sorted by id.
 * @returns {Promise<Array<{id, videoId, blob, annotations, updatedAt}>>}
 */
export async function getSnapshotsByVideo(videoId) {
  try {
    const db = await openSnapDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('videoId');
      const request = index.getAll(videoId);
      request.onsuccess = () => {
        const results = request.result || [];
        results.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
        resolve(results);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[snapshot-db] getSnapshotsByVideo failed:', err);
    throw err;
  }
}

/**
 * Delete all snapshots belonging to a video (cleanup on video removal).
 */
export async function deleteSnapshotsByVideo(videoId) {
  try {
    const snapshots = await getSnapshotsByVideo(videoId);
    if (snapshots.length === 0) return;

    const db = await openSnapDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const snap of snapshots) {
        store.delete(snap.id);
      }
      tx.oncomplete = () => resolve(snapshots.length);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('[snapshot-db] deleteSnapshotsByVideo failed:', err);
    throw err;
  }
}
