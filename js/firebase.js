// ═══ WAZA KIMURA — Firebase・認証 ═══
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
export const auth = firebase.auth();
export const db   = firebase.firestore();

export let currentUser = null;
let _durFetchDone = false; // duration補完は初回ロード1回だけ

window._currentUserUid = () => currentUser?.uid;

auth.onAuthStateChanged(async (user) => {
  // ユーザーが変わったら必ず全リスナーを先に解除する（Firebase標準パターン）
  if (_notesUnsubscribe)  { _notesUnsubscribe();  _notesUnsubscribe  = null; }
  if (_videosUnsubscribe) { _videosUnsubscribe(); _videosUnsubscribe = null; }

  currentUser = user;
  updateAuthUI(user);
  if (user) {
    window._notesInitForUser?.();
    await loadUserData(user.uid);
    await loadUserSettings(user.uid);
    await loadNotes(user.uid);
  } else {
    window._notesClear?.();
  }
});

// ── Firestore リアルタイム同期 共通 ──
let _notesUnsubscribe = null;
let _videosUnsubscribe = null;
let _videosLoadedAt = '';
// セッションID: このタブ/ページロードを一意に識別（メモリのみ、再起動で再生成）
const _sessionId = Math.random().toString(36).slice(2);

window._firebaseSaveNotes = async function(data) {
  if (!currentUser) { console.warn('[notes] save skipped: not logged in'); return; }
  try {
    const uid = currentUser.uid;
    const updatedAt = new Date().toISOString();
    await db.collection('users').doc(uid).collection('data').doc('notes').set({
      data, updatedAt, savedBy: _sessionId
    });
    console.log('[notes] saved', data.length, 'notes');
  } catch(e) { console.error('[notes] save error:', e); showToast('⚠️ ノート保存失敗: ' + e.message, 5000); }
};

async function loadNotes(uid) {
  if (_notesUnsubscribe) { _notesUnsubscribe(); _notesUnsubscribe = null; }
  const docRef = db.collection('users').doc(uid).collection('data').doc('notes');

  _notesUnsubscribe = docRef.onSnapshot(async snap => {
    const sb = snap.data()?.savedBy || '(none)';
    console.log(`[notes sync] snapshot: savedBy=${sb} mySession=${_sessionId} same=${sb===_sessionId} exists=${snap.exists} len=${snap.data()?.data?.length||0}`);
    if (currentUser?.uid !== uid) return; // stale listener guard: 別ユーザーに切り替わっていたら無視
    if (!snap.exists || !snap.data()?.data?.length) return;
    if (snap.data().savedBy === _sessionId) return;
    window._notesLoadFromRemote?.(snap.data().data);
  }, e => console.error('notes onSnapshot:', e));
}

export function updateAuthUI(user) {
  const btn     = document.getElementById('auth-btn');
  const avatar  = document.getElementById('auth-avatar');
  const fsBtn   = document.getElementById('fs-auth-btn');
  const fsAvatar = document.getElementById('fs-auth-avatar');
  const signIn  = () => {
    const p = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(p).catch(e => console.error('login error:', e));
  };
  if (user) {
    if (btn)     { btn.textContent    = 'ログアウト';   btn.onclick    = () => auth.signOut(); }
    if (fsBtn)   { fsBtn.textContent  = 'ログアウト';   fsBtn.onclick  = () => auth.signOut(); }
    if (avatar)  { avatar.src  = user.photoURL || ''; avatar.style.display  = user.photoURL ? 'block' : 'none'; }
    if (fsAvatar){ fsAvatar.src = user.photoURL || ''; fsAvatar.style.display = user.photoURL ? 'block' : 'none'; }
  } else {
    if (btn)   { btn.textContent   = 'Googleでログイン'; btn.onclick   = signIn; }
    if (fsBtn) { fsBtn.textContent = 'Googleでログイン'; fsBtn.onclick = signIn; }
    if (avatar)   avatar.style.display   = 'none';
    if (fsAvatar) fsAvatar.style.display = 'none';
    window._ytToken = null;
  }
  window.initOwnerSettings?.();
}

export function loadUserData(uid) {
  if (_videosUnsubscribe) { _videosUnsubscribe(); _videosUnsubscribe = null; }
  const docRef = db.collection('users').doc(uid).collection('data').doc('videos');
  let _firstLoad = true;

  _videosUnsubscribe = docRef.onSnapshot(async snap => {
    if (!snap.exists) return;
    const data = snap.data();
    const saved = data?.videos;
    if (!saved || !saved.length) return;

    // 判定1: 自分のセッションの書き込み → スキップ
    if (data.savedBy === _sessionId) return;

    // 判定2: 別セッション → 自分のほうが新しければスキップ
    const remoteAt = data.updatedAt || '';
    if (!_firstLoad && remoteAt && _videosLoadedAt && remoteAt <= _videosLoadedAt) return;

    _videosLoadedAt = remoteAt;
    _firstLoad = false;

    // マージ
    saved.forEach(sv => {
      const v = window.videos?.find(v => v.id === sv.id);
      if (v) Object.assign(v, sv);
      else if (window.videos) window.videos.push(sv);
    });

    // ─── 4層タグ体系へのマイグレーション (冪等) ───
    if (window.migrateAllVideos && window.videos) {
      window.videos = window.migrateAllVideos(window.videos);
    }
    // ─── 習得度名称マイグレーション ───
    (window.videos || []).forEach(v => {
      if (v.status === '把握') v.status = '理解';
      if (v.status === '習得中') v.status = '練習中';
    });
    // 未タグ補完
    if (window.retagAllFromTitle && window.videos) window.retagAllFromTitle();
    // ─── addedAt 空動画を1ヶ月前で補完 ───
    const _oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let _migratedAddedAt = 0;
    (window.videos || []).forEach(v => { if (!v.addedAt) { v.addedAt = _oneMonthAgo; _migratedAddedAt++; } });
    if (_migratedAddedAt > 0) {
      console.log(`[migration] addedAt補完: ${_migratedAddedAt}本`);
      await saveUserData();
      return;
    }

    if (window.AF) window.AF();
    if (window.renderTagMasterUI) window.renderTagMasterUI();
    showToast('✅ データを読み込みました');
    // duration補完（初回ロードのみ）
    // GDrive: tokenがあれば即実行、なければfail-safe。Vimeo: 認証不要
    if (!_durFetchDone) {
      _durFetchDone = true;
      window.fetchMissingGdDurations?.();
      window.fetchMissingVimeoDurations?.();
    }
  }, e => console.error('loadUserData onSnapshot:', e));
}

export async function saveUserData() {
  if (!currentUser) {
    console.warn('[saveUserData] currentUser is null — save skipped. Videos in memory:', (window.videos||[]).length);
    showToast('⚠️ 未ログイン: データを保存できませんでした', 4000);
    return;
  }
  try {
    const updatedAt = new Date().toISOString();
    _videosLoadedAt = updatedAt;
    await db.collection('users').doc(currentUser.uid).collection('data').doc('videos').set({
      videos: (window.videos || []).filter(v => !v._srTemp),
      updatedAt,
      savedBy: _sessionId
    });
    showToast('💾 保存', 1500);
  } catch (e) {
    console.error('[saveUserData] save failed:', e);
    showToast('⚠️ 保存に失敗しました: ' + e.message, 5000);
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
        const _REQUIRED = ['fav','next','tb','action','position','technique','counter','status','channel','playlist','addedAt','duration','memo'];
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

export async function saveFeedback({ page, type, text, images }) {
  if (!currentUser) throw new Error('ログインが必要です');
  try {
    const doc = {
      uid:       currentUser.uid,
      email:     currentUser.email || null,
      page, type, text,
      createdAt: new Date().toISOString(),
      version:   '51.85'
    };
    if (images && images.length) doc.images = images;
    await db.collection('feedback').add(doc);
  } catch (e) {
    console.error('saveFeedback:', e);
    throw e;
  }
}
