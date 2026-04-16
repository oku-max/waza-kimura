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

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  updateAuthUI(user);
  if (user) {
    await loadUserData(user.uid);
    await loadUserSettings(user.uid);
  }
});

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
}

export async function loadUserData(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('data').doc('videos').get();
    if (snap.exists) {
      const saved = snap.data()?.videos;
      if (saved && saved.length) {
        saved.forEach(sv => {
          const v = window.videos?.find(v => v.id === sv.id);
          if (v) Object.assign(v, sv);
          else if (window.videos) window.videos.push(sv);
        });
        // ─── 4層タグ体系へのマイグレーション (冪等) ───
        if (window.migrateAllVideos && window.videos) {
          const before = window.videos.length;
          window.videos = window.migrateAllVideos(window.videos);
          console.log(`[tag-master] migrated ${before} videos to 4-layer schema`);
        }
        // ─── 習得度名称マイグレーション (把握→理解, 習得中→練習中) ───
        (window.videos || []).forEach(v => {
          if (v.status === '把握') v.status = '理解';
          if (v.status === '習得中') v.status = '練習中';
        });
        // 未タグの動画にタイトルからルールベースタグを補完
        if (window.retagAllFromTitle && window.videos) {
          window.retagAllFromTitle();
        }
        // マイグレーション結果をFirebaseに永続化（旧フィールド削除を保存）
        saveUserData();
        if (window.AF) window.AF();
        // Settings画面のタグ集計を再描画
        if (window.renderTagMasterUI) window.renderTagMasterUI();
        showToast('✅ データを読み込みました');
      }
    }
  } catch (e) { console.error('loadUserData:', e); }
}

export async function saveUserData() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).collection('data').doc('videos').set({
      videos: window.videos || [],
      updatedAt: new Date().toISOString()
    });
    showToast('💾 保存', 1500);
  } catch (e) { showToast('⚠️ 保存に失敗しました: ' + e.message); }
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
      appearance:        window.getAppearanceSettings?.() || {},
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
      if (data.appearance) {
        window.applyRemoteAppearance?.(data);
      }
    }
  } catch (e) { console.error('loadUserSettings:', e); }
}
