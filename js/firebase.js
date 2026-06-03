// ═══ WAZA KIMURA — Firebase・認証 v52.255 ═══
import { showToast } from './ui.js';

const firebaseConfig = {
  apiKey: "AIzaSyC1VafF24ys4XdTZe7lqIDAZjSmOUqM6Lw",
  authDomain: "waza-kimura.firebaseapp.com",
  projectId: "waza-kimura",
  storageBucket: "waza-kimura.firebasestorage.app",
  messagingSenderId: "502684957551",
  appId: "1:502684957551:web:0e16f0d37868851479869a"
};

firebase.initializeApp(firebaseConfig);
export const auth    = firebase.auth();
export const db      = firebase.firestore();
export const storage = firebase.storage();
// iOS Safari/WebKit で WebSocket が30秒ハングしてからlong-pollingにフォールバックする問題の対策。
// 最初からlong-pollingを使うことで、その30秒待ちを回避する。
db.settings({ experimentalForceLongPolling: true });

export let currentUser = null;
let _durFetchDone = false; // duration補完は初回ロード1回だけ

window._currentUserUid = () => currentUser?.uid;

auth.onAuthStateChanged(async (user) => {
  // ユーザーが変わったら必ず全リスナーを先に解除する（Firebase標準パターン）
  if (_notesUnsubscribe)  { _notesUnsubscribe();  _notesUnsubscribe  = null; }
  if (_videosUnsubscribe) { _videosUnsubscribe(); _videosUnsubscribe = null; }

  currentUser = user;
  if (window.__pmark && !window.__perf?.auth) window.__pmark('auth');
  updateAuthUI(user);
  if (user) {
    window._notesInitForUser?.();
    await loadUserData(user.uid);
    await loadUserSettings(user.uid);
    await loadNotes(user.uid);
    await loadTagMasterAliases(user.uid);
    await loadTagRules(user.uid);
  } else {
    window._notesClear?.();
  }
});

// ── Firestore リアルタイム同期 共通 ──
// Firestoreはネスト配列（Array<Array>）を禁止。保存前に配列→オブジェクト変換、読み込み後に逆変換する
function _packNested(v) {
  if (Array.isArray(v)) {
    const mapped = v.map(_packNested);
    return mapped.map(item => Array.isArray(item) ? { _s: item } : item);
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = _packNested(val);
    return o;
  }
  return v;
}
function _unpackNested(v) {
  if (Array.isArray(v)) {
    return v.map(item =>
      (item && typeof item === 'object' && '_s' in item && Object.keys(item).length === 1)
        ? _unpackNested(item._s)
        : _unpackNested(item)
    );
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = _unpackNested(val);
    return o;
  }
  return v;
}

let _notesUnsubscribe = null;
let _videosUnsubscribe = null;
let _videosLoadedAt = '';
// セッションID: このタブ/ページロードを一意に識別（メモリのみ、再起動で再生成）
const _sessionId = Math.random().toString(36).slice(2);

window._firebaseSaveNotes = async function(payload) {
  if (!currentUser) { console.warn('[notes] save skipped: not logged in'); return; }
  try {
    const uid = currentUser.uid;
    const updatedAt = new Date().toISOString();
    const folders = Array.isArray(payload) ? payload : (payload?.folders || []);
    const root    = Array.isArray(payload) ? []      : (payload?.root    || []);
    const safe     = _packNested(JSON.parse(JSON.stringify(folders)));
    const safeRoot = _packNested(JSON.parse(JSON.stringify(root)));
    await db.collection('users').doc(uid).collection('data').doc('notes').set({
      data: safe, root: safeRoot, updatedAt, savedBy: _sessionId
    });
    console.log('[notes] saved', folders.length, 'folders,', root.length, 'root notes');
  } catch(e) { console.error('[notes] save error:', e); showToast('⚠️ ノート保存失敗: ' + e.message, 5000); }
};

async function loadNotes(uid) {
  if (_notesUnsubscribe) { _notesUnsubscribe(); _notesUnsubscribe = null; }
  const docRef = db.collection('users').doc(uid).collection('data').doc('notes');

  _notesUnsubscribe = docRef.onSnapshot(async snap => {
    if (currentUser?.uid !== uid) return; // stale listener guard: 別ユーザーに切り替わっていたら無視
    const snapData = snap.data();
    if (!snap.exists) return;
    // フォルダが0件でもroot（フォルダ外）ノートがあれば読み込む
    if (!snapData?.data?.length && !snapData?.root?.length) return;
    if (snapData.savedBy === _sessionId) return;
    window._notesLoadFromRemote?.({
      folders: _unpackNested(snapData.data || []),
      root: snapData.root ? _unpackNested(snapData.root) : []
    });
  }, e => console.error('notes onSnapshot:', e));
}

// 手動同期：ヘッダーの同期ボタンから呼ばれる
window._notesSyncNow = async function() {
  if (!currentUser) return;
  // 未保存のローカル変更がある間は同期を拒否（上書き競合防止）
  if (window._notesHasPendingSave?.()) {
    showToast('⚠️ 保存中です。しばらくしてから再試行してください', 3000);
    return;
  }
  const icon = document.getElementById('nSyncIcon');
  const lbl  = document.getElementById('nSyncLbl');
  const btn  = document.getElementById('nSyncBtn');
  if (btn) btn.disabled = true;
  if (icon) icon.textContent = '⟳';
  if (lbl)  lbl.textContent  = '同期中…';
  try {
    const snap = await db.collection('users').doc(currentUser.uid).collection('data').doc('notes').get();
    // フォルダが0件でもroot（フォルダ外）ノートがあれば読み込む
    if (snap.exists && (snap.data()?.data?.length || snap.data()?.root?.length)) {
      const d = snap.data();
      window._notesLoadFromRemote?.({
        folders: _unpackNested(d.data || []),
        root: d.root ? _unpackNested(d.root) : []
      });
    }
  } catch(e) {
    console.error('[sync] manual sync failed:', e);
    showToast('⚠️ 同期に失敗しました: ' + e.message, 4000);
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.textContent = '✓';
    if (lbl)  lbl.textContent  = '完了';
    setTimeout(() => {
      if (icon) icon.textContent = '↕';
      if (lbl)  lbl.textContent  = '同期';
    }, 2000);
  }
};

export function updateAuthUI(user) {
  const signIn = () => {
    const p = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(p).catch(e => console.error('login error:', e));
  };
  // グローバルに公開（ドロップダウン内の未ログインボタンから呼ぶ）
  window._acctSignIn = signIn;

  const acctBtn      = document.getElementById('acct-btn');
  const menuUser     = document.getElementById('acct-menu-user');
  const menuLogin    = document.getElementById('acct-menu-login');
  const menuAddVideo = document.getElementById('acct-menu-add-video');
  const menuLogout   = document.getElementById('acct-menu-logout');
  const sep1         = document.getElementById('acct-sep1');
  const sep2         = document.getElementById('acct-sep2');
  const avatarText   = document.getElementById('acct-menu-avatar-text');
  const userName     = document.getElementById('acct-menu-user-name');
  const userEmail    = document.getElementById('acct-menu-user-email');

  if (user) {
    const initial = (user.displayName || user.email || '?')[0].toUpperCase();
    if (acctBtn) {
      acctBtn.textContent = initial;
      acctBtn.className   = 'acct-btn acct-btn-in';
      acctBtn.title       = user.displayName || user.email || '';
    }
    if (avatarText) avatarText.textContent = initial;
    if (userName)   userName.textContent   = user.displayName || '';
    if (userEmail)  userEmail.textContent  = user.email || '';
    if (menuUser)     menuUser.style.display     = '';
    if (menuLogin)    menuLogin.style.display     = 'none';
    if (menuAddVideo) menuAddVideo.style.display  = '';
    if (sep1)         sep1.style.display           = '';
    if (sep2)         sep2.style.display           = '';
    if (menuLogout) {
      menuLogout.style.display = '';
      menuLogout.onclick = () => { auth.signOut(); window.closeAcctMenu?.(); };
    }
  } else {
    if (acctBtn) {
      acctBtn.textContent = '👤';
      acctBtn.className   = 'acct-btn acct-btn-out';
      acctBtn.title       = 'ログイン';
    }
    if (menuUser)     menuUser.style.display     = 'none';
    if (menuLogin)    menuLogin.style.display      = '';
    if (menuAddVideo) menuAddVideo.style.display   = 'none';
    if (sep1)         sep1.style.display            = 'none';
    if (sep2)         sep2.style.display            = 'none';
    if (menuLogout)   menuLogout.style.display      = 'none';
    window._ytToken = null;
  }
  window.initOwnerSettings?.();
}

// 動画データをメモリに適用してマイグレーションを実行。再保存が必要なら true を返す
async function _applyVideosData(saved) {
  saved.forEach(sv => {
    const v = window.videos?.find(v => v.id === sv.id);
    if (v) Object.assign(v, sv);
    else if (window.videos) window.videos.push(sv);
  });
  if (window.migrateAllVideos && window.videos) window.videos = window.migrateAllVideos(window.videos);
  (window.videos || []).forEach(v => {
    if (v.status === '把握')   v.status = '理解';
    if (v.status === '習得中') v.status = '練習中';
  });
  // 管理者アカウントは自動バッチ再タグ付けをスキップ（手動操作時のみ実行）
  const _isAdminUser = window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com';
  if (!_isAdminUser && window.retagAllFromTitle && window.videos) window.retagAllFromTitle();
  const _oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let migratedAddedAt = 0;
  (window.videos || []).forEach(v => { if (!v.addedAt) { v.addedAt = _oneMonthAgo; migratedAddedAt++; } });
  if (migratedAddedAt > 0) console.log(`[migration] addedAt補完: ${migratedAddedAt}本`);
  return migratedAddedAt > 0;
}

export async function loadUserData(uid) {
  if (_videosUnsubscribe) { _videosUnsubscribe(); _videosUnsubscribe = null; }
  if (window.__pmark && !window.__perf?.data_first) window.__pmark('data_first');

  let loaded = false;
  let needsSave = false;
  // 1. Firebase Storage を優先
  try {
    const url = await storage.ref(`users/${uid}/videos.json`).getDownloadURL();
    // ブラウザ/CDNキャッシュを避けて常に最新を取得（保存直後の別端末反映のため）
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.ok) {
      const json = await resp.json();
      if (json.videos?.length) {
        needsSave = await _applyVideosData(json.videos);
        _videosLoadedAt = json.updatedAt || '';
        loaded = true;
      }
    }
  } catch (e) {
    if (e.code !== 'storage/object-not-found') console.warn('[loadUserData] Storage:', e.message);
  }

  // 2. Firestore にフォールバック（旧データの自動移行）
  if (!loaded) {
    try {
      const snap = await db.collection('users').doc(uid).collection('data').doc('videos').get();
      const data = snap.data();
      if (snap.exists && data?.videos?.length) {
        needsSave = await _applyVideosData(data.videos);
        _videosLoadedAt = data.updatedAt || '';
        loaded = true;
        needsSave = true;
        console.log('[migration] Firestore → Storage移行を開始');
      }
    } catch (e) {
      console.error('[loadUserData] Firestore:', e);
    }
  }

  if (!loaded) return;

  if (needsSave) await saveUserData();

  if (window.AF) window.AF();
  if (window.renderTagMasterUI) window.renderTagMasterUI();
  showToast('✅ データを読み込みました');
  if (!_durFetchDone) {
    _durFetchDone = true;
    window.fetchMissingGdDurations?.();
    window.fetchMissingVimeoDurations?.();
  }
}

export async function saveUserData() {
  if (!currentUser) {
    console.warn('[saveUserData] currentUser is null — save skipped. Videos in memory:', (window.videos||[]).length);
    showToast('⚠️ 未ログイン: データを保存できませんでした', 4000);
    return false;
  }
  try {
    const uid = currentUser.uid;
    const ref = storage.ref(`users/${uid}/videos.json`);

    // ── 競合チェック: サーバー上のタイムスタンプが自分がロードした時より新しければ上書きしない ──
    try {
      const meta = await ref.getMetadata();
      const serverUpdatedAt = meta.customMetadata?.updatedAt || '';
      if (serverUpdatedAt && _videosLoadedAt && serverUpdatedAt > _videosLoadedAt) {
        console.warn('[saveUserData] 競合検出 — サーバー:', serverUpdatedAt, '自分がロードした時刻:', _videosLoadedAt);
        showToast('⚠️ 別の端末で更新されています。ページを更新してから再操作してください', 7000);
        return false;
      }
    } catch (metaErr) {
      // ファイルが存在しない場合は無視して保存続行
      if (metaErr.code !== 'storage/object-not-found') console.warn('[saveUserData] メタデータ取得失敗:', metaErr.message);
    }

    const updatedAt = new Date().toISOString();
    _videosLoadedAt = updatedAt;
    const videos = (window.videos || []).filter(v => !v._srTemp);
    const blob = new Blob([JSON.stringify({ videos, updatedAt, savedBy: _sessionId })], { type: 'application/json' });
    await ref.put(blob, {
      contentType: 'application/json',
      cacheControl: 'no-cache, max-age=0',
      customMetadata: { updatedAt }, // 競合チェック用タイムスタンプをメタデータにも保存
    });
    showToast('💾 保存', 1500);
    return true;
  } catch (e) {
    console.error('[saveUserData] save failed:', e);
    showToast('⚠️ 保存に失敗しました: ' + e.message, 5000);
    return false;
  }
}

export async function saveUserSettings() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('data').doc('settings').set({
      tagSettings:       window.tagSettings       || [],
      aiSettings:        window.aiSettings        || {},
      savedSearches:     window.savedSearches     || [],
      filterPresets:     window.filterPresets     || [],
      orgColOrder:       window.orgColOrder       || [],
      orgColVisibility:  window.orgColVisibility  || {},
      filterColVis:      window.filterColVis      || {},
      // appearance はデバイスごと（localStorage管理）のため Firebase に保存しない
      tagGroups:         window.getTagGroups?.()  || [],
      customViews:       window._cvViews         || [],
      updatedAt: new Date().toISOString()
    });
  } catch (e) { console.error('saveUserSettings:', e); }
}

export async function loadUserSettings(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('data').doc('settings').get();
    if (snap.exists) {
      const data = snap.data();
      window.applyRemoteSettings?.(data);
      // 保存した検索条件を復元
      if (Array.isArray(data.savedSearches) && data.savedSearches.length) {
        window.loadSavedSearchesFromRemote?.(data.savedSearches);
      }
      if (Array.isArray(data.filterPresets) && data.filterPresets.length) {
        window.loadFilterPresetsFromRemote?.(data.filterPresets);
      }
      if (Array.isArray(data.orgColOrder) && data.orgColOrder.length) {
        // 廃止カラム除去 + 新規カラム補完
        const _DEAD = ['prio'];
        const _REQUIRED = ['fav','next','drill','tb','action','position','technique','counter','status','channel','playlist','addedAt','duration','memo'];
        let cleaned = data.orgColOrder.filter(c => !_DEAD.includes(c));
        for (const r of _REQUIRED) { if (!cleaned.includes(r)) {
          // 'status'はcounterの直後に挿入
          if (r === 'status') { const ci = cleaned.indexOf('counter'); ci >= 0 ? cleaned.splice(ci+1,0,r) : cleaned.push(r); }
          else cleaned.push(r);
        }}
        window.orgColOrder = cleaned;
        try { localStorage.setItem('wk_orgColOrder', JSON.stringify(cleaned)); } catch(e) {}
      }
      if (data.orgColVisibility && typeof data.orgColVisibility === 'object') {
        const vis = { ...data.orgColVisibility };
        delete vis.prio;
        // 新規カラムがなければデフォルトで表示
        if (vis.next === undefined) vis.next = true;
        if (vis.counter === undefined) vis.counter = true;
        if (vis.status === undefined) vis.status = true;
        window.orgColVisibility = { ...window.orgColVisibility, ...vis };
        try { localStorage.setItem('wk_orgColVisibility', JSON.stringify(window.orgColVisibility)); } catch(e) {}
      }
      if (Array.isArray(data.customViews) && data.customViews.length) {
        window._cvApplyLoadedViews?.(data.customViews);
      }
      // appearance はデバイスごと（localStorage管理）のため Firebase から復元しない
    }
  } catch (e) { console.error('loadUserSettings:', e); }
}

// テスト期間中の汚染データ消去用（ブラウザコンソールから実行）
window.resetMyNotes = async function() {
  if (!currentUser) { console.warn('ログインしてください'); return; }
  await db.collection('users').doc(currentUser.uid).collection('data').doc('notes').delete();
  window._notesClear?.();
  console.log('Notesをリセットしました');
};

export async function saveFeedback({ page, type, text, images, device, os }) {
  if (!currentUser) throw new Error('ログインが必要です');
  try {
    const doc = {
      uid:       currentUser.uid,
      email:     currentUser.email || null,
      page, type, text,
      device:    device || null,
      os:        os     || null,
      createdAt: new Date().toISOString(),
      version:   '52.24'
    };
    if (images && images.length) doc.images = images;
    await db.collection('feedback').add(doc);
  } catch (e) {
    console.error('saveFeedback:', e);
    throw e;
  }
}

// ── tag_master aliases を Firestore からロードして CATEGORIES に注入 ──
async function loadTagMasterAliases(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('data').doc('tag_master').get();
    if (!snap.exists) return;
    const aliasMap = snap.data().aliases || {};
    const cats = window.CATEGORIES;
    if (!Array.isArray(cats)) return;
    let changed = false;
    for (const cat of cats) {
      if (aliasMap[cat.id] !== undefined) {
        cat.aliases = aliasMap[cat.id];
        changed = true;
      }
    }
    if (changed) window.rebuildCategoryIndex?.();
    console.log('[tag_master] aliases loaded from Firestore');
  } catch(e) {
    console.warn('[tag_master] loadTagMasterAliases failed:', e);
  }
}

// ── tag_rules (反転ルール) を Firestore からロードして window.tagRules に注入 ──
async function loadTagRules(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('data').doc('tag_rules').get();
    if (!snap.exists) return;
    window.tagRules = snap.data();
    console.log('[tag_rules] loaded from Firestore');
  } catch(e) {
    console.warn('[tag_rules] load failed:', e);
  }
}
