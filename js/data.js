// ═══ WAZA KIMURA — データ操作 ═══

// ─── 自動保存（debounce: 3秒後にFirebase書き込み）───
let _autoSaveTimer = null;

export function debounceSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      if (window.saveUserData) {
        await window.saveUserData();
      }
    } catch(e) { console.error('debounceSave error:', e); }
  }, 3000);
}

export function qFav(id) {
  const v = window.videos?.find(v => v.id === id);
  if (v) { v.fav = !v.fav; window.AF(); window.toast(v.fav ? '⭐ お気に入り追加' : 'お気に入り解除'); }
}

export function qWatch(id) {
  const v = window.videos?.find(v => v.id === id);
  if (v) { v.watched = !v.watched; window.AF(); window.toast(v.watched ? '✅ 視聴済み' : '👁 未視聴に戻しました'); }
}

export function archOne(id) {
  const v = window.videos?.find(v => v.id === id);
  if (v) { v.archived = true; window.AF(); window.toast('📦 アーカイブ'); }
}

export function setPrio(id, prio) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.prio = (v.prio === prio) ? '保留' : prio;
  debounceSave();
  if (window.renderOrg) window.renderOrg();
  const emoji = { '今すぐ': '🔴', 'そのうち': '🔵', '保留': '⬜' }[v.prio] || '';
  window.toast(emoji + ' Priority: ' + v.prio);
}
