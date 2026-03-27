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
    const imp = document.getElementById('yt-import-btn');
    if (imp) imp.style.display = 'flex';
  } else {
    if (btn)   { btn.textContent   = 'Googleでログイン'; btn.onclick   = signIn; }
    if (fsBtn) { fsBtn.textContent = 'Googleでログイン'; fsBtn.onclick = signIn; }
    if (avatar)   avatar.style.display   = 'none';
    if (fsAvatar) fsAvatar.style.display = 'none';
    const imp = document.getElementById('yt-import-btn');
    if (imp) imp.style.display = 'none';
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
        if (window.AF) window.AF();
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
      tagSettings:    window.tagSettings    || [],
      aiSettings:     window.aiSettings     || {},
      savedSearches:  window.savedSearches  || [],
      filterPresets:  window.filterPresets  || [],
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
    }
  } catch (e) { console.error('loadUserSettings:', e); }
}
