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
  const _prevUid = currentUser?.uid || null;
  const _newUid = user?.uid || null;
  // ユーザーが変わったら必ず全リスナーを先に解除する（Firebase標準パターン）
  if (_notesUnsubscribe)  { _notesUnsubscribe();  _notesUnsubscribe  = null; }
  if (_videosUnsubscribe) { _videosUnsubscribe(); _videosUnsubscribe = null; }

  // ユーザーが実際に変わった/ログアウトしたときだけ保存を一旦ロック。
  // （同一ユーザーのトークン更新では再ロード中も保存ロックの警告を出さない）
  if (_newUid !== _prevUid) {
    _videosReady = false;
    _settingsReady = false;
  }
  currentUser = user;
  if (window.__pmark && !window.__perf?.auth) window.__pmark('auth');
  updateAuthUI(user);
  if (user) {
    window._notesInitForUser?.();
    await loadUserData(user.uid);
    await loadCvStartup(user.uid);   // 起動設定(list/scope/共有直近ビュー)を settings より先に読む
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
// ── 保存ガード用フラグ（v52.558）──
// クラウドの状態を「確実に把握できた」ときだけ true。読み込み失敗時は false のままにして、
// 空/部分データでクラウドを上書きする事故（cf. v52.541 カスタムビュー消失）を防ぐ。
let _videosReady = false;   // loadUserData がクラウドの動画状態を確定できた
let _settingsReady = false; // loadUserSettings がクラウドの設定状態を確定できた
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
    // 旧表記が保存データに残っていれば正準値へ書き換え（status未設定のものは触らない）
    if (v.status === '把握' || v.status === '習得中') v.status = window.normStatus(v.status);
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
  let storageKnown = false; // Storageの状態を確実に把握できた（ファイル読込成功 or 不在を確認）
  // 1. Firebase Storage を優先
  try {
    const url = await storage.ref(`users/${uid}/videos.json`).getDownloadURL();
    // ブラウザ/CDNキャッシュを避けて常に最新を取得（保存直後の別端末反映のため）
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.ok) {
      storageKnown = true; // ファイルを読み込めた（中身が空でも状態は確定）
      const json = await resp.json();
      if (json.videos?.length) {
        needsSave = await _applyVideosData(json.videos);
        _videosLoadedAt = json.updatedAt || '';
        loaded = true;
      }
    }
  } catch (e) {
    if (e.code === 'storage/object-not-found') {
      storageKnown = true; // ファイル不在を確認 = 新規/空ユーザー（状態は確定）
    } else {
      console.warn('[loadUserData] Storage:', e.message); // 実際の読込失敗 → 状態未確定
    }
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

  // 保存ロック解除の判定: クラウド状態を確実に把握できたときだけ保存を許可する。
  //   - 非空データを読み込めた → 当然OK
  //   - Storageを読めた/不在を確認できた（新規・空ユーザー） → OK（_videosLoadedAtは空のまま）
  //   - それ以外（ネットワーク/権限エラーで未確定） → ロックのまま（空上書き防止）
  if (loaded || storageKnown) _videosReady = true;

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
  // クラウドの動画状態を読めていない（読込失敗等）ときは保存しない。
  // メモリが空のままクラウドの非空データを上書きする事故を防ぐ。
  if (!_videosReady) {
    console.warn('[saveUserData] not ready (load incomplete) — save skipped to avoid overwriting cloud data');
    showToast('⚠️ データ読込が未完了のため保存を見送りました。ページを更新してください', 5000);
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

// ═══ カスタムビュー: プレイリスト単位の別ドキュメント同期 ═══════════════════════
// 背景: 全カスタムプレイリストを settings ドキュメント1件の customViews 配列に .set() で
//   丸ごと保存していたため、(1) Firestore 1MiB 上限を超えると保存が全拒否され以降同期停止、
//   (2) 複数端末が同時に配列全体を上書きすると片方の追加が消える（last-write-wins のクロバー）。
//   → プレイリストごとに data/cv_<id> ドキュメントへ分離し、変更されたものだけ書く。
//   本実装は「追加のみ・非破壊」: 旧 customViews 配列と saveUserSettings はそのまま残すので、
//   新経路が失敗（バグ/ルール拒否）しても従来動作にフォールバックし、既存データを壊さない。
const CV_DOC_PREFIX = 'cv_';
const CV_INDEX_DOC  = 'cv_index';
let _cvLastSynced = {};   // id -> 直近クラウドと一致した内容のJSON署名。差分のあるビューだけ書く基準。
let _cvMigrated   = false; // cv_index.migrated: 移行完了後は旧 customViews 配列を読まない（削除の復活防止）

const _dataDoc    = (uid, name) => db.collection('users').doc(uid).collection('data').doc(name);
const _cvViewRef  = (uid, id)   => _dataDoc(uid, CV_DOC_PREFIX + id);
const _cvIndexRef = (uid)       => _dataDoc(uid, CV_INDEX_DOC);

// 変更されたビューだけを各ドキュメントへ保存（他プレイリストには触れない＝多端末クロバー防止）
window._cvSyncRemote = async function(force) {
  if (!currentUser) return;
  // 通常保存はロード完了(_settingsReady)まで待つ（空/部分上書き防止）。
  // 移行シードは _cvLoadAndMerge 直後＝クラウド状態を確定済みで呼ぶため force で通す。
  if (!_settingsReady && !force) { console.warn('[cvSync] settings未確定のためスキップ（空/部分上書き防止）'); return; }
  const uid = currentUser.uid;
  const views = window._cvViews || [];
  const ids = [];
  let wrote = 0, failed = 0;
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    if (!v || !v.id) continue;
    ids.push(v.id);
    const sig = JSON.stringify({ v, order: i });   // 内容＋並び順の署名
    if (_cvLastSynced[v.id] === sig) continue;      // 変化なし→書かない（他端末の更新を stale 上書きしない）
    try {
      const packed = _packNested(JSON.parse(JSON.stringify(v)));
      await _cvViewRef(uid, v.id).set({
        view: packed, order: i,
        updatedAt: new Date().toISOString(), savedBy: _sessionId
      });
      _cvLastSynced[v.id] = sig;
      wrote++;
    } catch (e) { failed++; console.error('[cvSync] 保存失敗', v.id, e); }
  }
  // idインデックスは arrayUnion のみ（union は多端末でも消えない）。削除は _cvDeleteRemote 側で arrayRemove。
  // 何か書いたときだけ更新（不変時の無駄な書き込みを避ける。arrayUnion は冪等なので全idを渡してよい）。
  if (wrote && ids.length) {
    try {
      await _cvIndexRef(uid).set({
        ids: firebase.firestore.FieldValue.arrayUnion(...ids),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.error('[cvSync] index更新失敗', e); }
  }
  if (wrote) console.log(`[cvSync] ${wrote}件のプレイリストを個別保存${failed ? ` / ${failed}件失敗` : ''}`);
  if (failed) showToast('⚠️ 一部プレイリストの保存に失敗しました', 5000);
};

// 明示削除時だけ該当ドキュメントを削除（配列差分による自動削除はしない＝誤消去防止）
window._cvDeleteRemote = async function(id) {
  if (!currentUser || !id) return;
  const uid = currentUser.uid;
  try {
    await _cvViewRef(uid, id).delete();
    await _cvIndexRef(uid).set({ ids: firebase.firestore.FieldValue.arrayRemove(id) }, { merge: true });
    delete _cvLastSynced[id];
    console.log('[cvDelete] 個別プレイリスト削除', id);
  } catch (e) { console.error('[cvDelete] 削除同期失敗', id, e); showToast('⚠️ プレイリスト削除の同期に失敗しました', 5000); }
};

// 新形式(プレイリスト単位ドキュメント)＋旧形式(settings.customViews)を安全にマージして返す。
// 優先度: per-doc(最新) > legacy配列 > localStorage(クラウドが全空のときの自己修復のみ)。
async function _cvLoadAndMerge(uid, legacyArr) {
  const legacy = Array.isArray(legacyArr) ? legacyArr : [];
  let idx = null;
  try { const s = await _cvIndexRef(uid).get(); if (s.exists) idx = s.data(); } catch (e) { console.error('[cvLoad] index読込失敗', e); }
  _cvMigrated = !!(idx && idx.migrated);
  const cvIds = (idx && Array.isArray(idx.ids)) ? idx.ids.filter(x => x) : [];

  // per-doc を並列取得
  const perDoc = new Map();  // id -> {v, order}
  if (cvIds.length) {
    const snaps = await Promise.all(cvIds.map(id => _cvViewRef(uid, id).get().catch(() => null)));
    snaps.forEach(s => {
      if (s && s.exists) {
        const d = s.data();
        const v = _unpackNested(d.view);
        if (v && v.id) perDoc.set(v.id, { v, order: typeof d.order === 'number' ? d.order : 9999 });
      }
    });
  }

  // クラウドが完全に空のときだけ localStorage/メモリから自己修復（誤消去からの復旧。cf v52.541）
  const cloudEmpty = !perDoc.size && !legacy.length;
  let baseLocal = [];
  if (cloudEmpty) {
    baseLocal = window._cvViews || [];
    if (!baseLocal.length) { try { baseLocal = JSON.parse(localStorage.getItem('wk_cv_views') || '[]') || []; } catch (e) {} }
  }

  // マージ（優先度 低→高 で上書き）: local < legacy < perDoc。どの層のビューも失わない。
  const map = new Map();  // id -> {v, order}
  baseLocal.forEach((v, i) => { if (v && v.id) map.set(v.id, { v, order: i }); });
  if (!_cvMigrated) legacy.forEach((v, i) => { if (v && v.id) map.set(v.id, { v, order: i }); });
  perDoc.forEach((e, id) => map.set(id, e));

  const merged = [...map.values()].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)).map(e => e.v);

  // 差分基準を初期化: per-doc に既にあり並び順も一致するものは「同期済み」とし、
  // legacy/local 由来（per-doc に無い or 並び順ずれ）は未記録＝次の同期で per-doc へ書き込まれる。
  _cvLastSynced = {};
  merged.forEach((v, i) => {
    const p = perDoc.get(v.id);
    if (p && p.order === i) _cvLastSynced[v.id] = JSON.stringify({ v, order: i });
  });

  const needSeed = merged.some(v => !perDoc.has(v.id));
  return { merged, needSeed, hadLegacy: legacy.length > 0, idxExists: !!idx };
}

export async function saveUserSettings() {
  if (!currentUser) return;
  // クラウドの設定を読めていないうちは保存しない（空配列で全置換して消す事故を防ぐ）。
  if (!_settingsReady) {
    console.warn('[saveUserSettings] not ready (settings not loaded) — save skipped');
    return;
  }
  const payload = {
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
  };
  // ── 見える化: 設定ドキュメントのサイズを計測（Firestoreは1ドキュメント=1MiB上限）──
  // カスタムプレイリスト等が積み上がって上限を超えると .set() が失敗し、以降の同期が止まる。
  // 原因を実データで確定できるよう、サイズと上限接近を常にログし、超過見込みは警告する。
  const LIMIT = 1048576; // 1 MiB
  let sizeBytes = 0;
  try {
    sizeBytes = new Blob([JSON.stringify(payload)]).size;
    const cvBytes = new Blob([JSON.stringify(payload.customViews)]).size;
    const kb = (sizeBytes / 1024).toFixed(0);
    console.log(`[saveUserSettings] settings doc size: ${kb}KB (customViews ${(cvBytes/1024).toFixed(0)}KB, ${payload.customViews.length}件) / 上限1024KB`);
    if (sizeBytes >= LIMIT) {
      console.error(`[saveUserSettings] ⚠️ 1MiB上限超過 (${kb}KB)。この保存はFirestoreに拒否され、同期が止まります。`);
      showToast(`⚠️ プレイリスト設定が容量上限(1MB)を超えています(${kb}KB)。これ以上の変更は他デバイスに同期されません`, 8000);
    } else if (sizeBytes >= LIMIT * 0.85) {
      console.warn(`[saveUserSettings] 容量上限に接近 (${kb}KB / 1024KB)`);
      showToast(`⚠️ プレイリスト設定の容量が上限に接近しています(${kb}KB / 1024KB)`, 5000);
    }
  } catch (e) { console.warn('[saveUserSettings] size measure failed:', e); }
  try {
    await db.collection('users').doc(currentUser.uid).collection('data').doc('settings').set(payload);
  } catch (e) {
    console.error('saveUserSettings:', e, `(size ${(sizeBytes/1024).toFixed(0)}KB)`);
    // 動画本体の保存(saveUserData)と同様、失敗をユーザーに必ず知らせる（従来は無音で握りつぶしていた）
    showToast('⚠️ 設定/プレイリストの保存に失敗しました: ' + (e?.message || e), 6000);
  }
}

// ── カスタムビュー起動設定（小さな専用ドキュメント）──
// 起動時に表示するリスト(list)・記憶範囲(scope)・共有スコープ時の直近ビュー(lastView)を
// data/cvStartup に保存。数十バイトの軽量ドキュメントなので、共有スコープでビュー切替の
// たびに書いても安価（大きな settings ドキュメントは汚さない・肥大化させない）。
export async function saveCvStartup(cfg) {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('data').doc('cvStartup').set({
      list:     (cfg && cfg.list)  || 'last',
      scope:    (cfg && cfg.scope) || 'device',
      lastView: (cfg && typeof cfg.lastView === 'string') ? cfg.lastView : '',
      updatedAt: new Date().toISOString()
    });
  } catch (e) { console.warn('saveCvStartup:', e); }
}
window.saveCvStartup = saveCvStartup;

export async function loadCvStartup(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('data').doc('cvStartup').get();
    if (snap.exists) window._applyCvStartup?.(snap.data());
  } catch (e) { console.warn('loadCvStartup:', e); }
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
      // カスタムビュー: 新形式(プレイリスト単位ドキュメント)＋旧形式(customViews配列)を安全マージ。
      // 新経路で例外が出ても旧形式にフォールバックし、既存データを失わない（非破壊）。
      try {
        const { merged, needSeed, hadLegacy, idxExists } = await _cvLoadAndMerge(uid, data.customViews);
        window._cvApplyLoadedViews?.(merged);
        // legacy/local 由来（per-doc に未在）を per-doc へ書き戻し（移行シード。追加のみで既存を壊さない）
        if (needSeed && merged.length) {
          console.warn('[cvLoad] per-docへ移行シード:', merged.length, '件');
          await window._cvSyncRemote?.(true);  // force: ロード直後の確定状態でシード
        }
        // 移行完了フラグ: legacy を全て per-doc に写せたら以後 legacy を読まない（削除の復活防止）。
        // シード失敗（未記録が残る）なら設定しない＝次回も legacy を読んでフォールバック。
        if (!_cvMigrated && (hadLegacy || idxExists)) {
          const allSynced = merged.every(v => _cvLastSynced[v.id] !== undefined);
          if (allSynced || !needSeed) {
            try { await _cvIndexRef(uid).set({ migrated: true, updatedAt: new Date().toISOString() }, { merge: true }); _cvMigrated = true; }
            catch (e) { console.error('[cvLoad] migratedフラグ設定失敗', e); }
          }
        }
      } catch (e) {
        console.error('[cvLoad] マージ失敗、旧形式にフォールバック', e);
        const remoteCV = Array.isArray(data.customViews) ? data.customViews : [];
        if (remoteCV.length) window._cvApplyLoadedViews?.(remoteCV);
        else {
          // クラウドが空。ローカルにビューが残っていれば自己修復（空→非空の一方向のみ）
          let localCV = window._cvViews || [];
          if (!localCV.length) { try { localCV = JSON.parse(localStorage.getItem('wk_cv_views') || '[]') || []; } catch(e2) { localCV = []; } }
          if (localCV.length) { window._cvApplyLoadedViews?.(localCV); window._cvSave?.(); }
        }
      }
      // appearance はデバイスごと（localStorage管理）のため Firebase から復元しない
    }
    // ここまで来た = 読み込みが成功した（設定docが無い新規ユーザーでも例外は出ない）。
    // これ以降の saveUserSettings を許可する。読込が throw した場合は false のまま＝保存ロック。
    _settingsReady = true;
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
