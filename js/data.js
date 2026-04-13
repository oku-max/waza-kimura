// ═══ WAZA KIMURA — データ操作 ═══

// ─── 自動保存（debounce: 3秒後にFirebase書き込み）───
let _autoSaveTimer = null;

export function debounceSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    try {
      // 保存前に旧↔新スキーマ同期
      if (window.syncVideoFields && window.videos) window.syncVideoFields(window.videos);
      if (window.saveUserData) {
        await window.saveUserData();
      }
    } catch(e) { console.error('debounceSave error:', e); }
  }, 3000);
}

export function qFav(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.fav = !v.fav;
  // Fav OFF → Next も自動OFF
  if (!v.fav && v.next) v.next = false;
  window.AF(); window.toast(v.fav ? '⭐ お気に入り追加' : 'お気に入り解除');
}

export function qNext(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.next = !v.next;
  // Next ON → Fav も自動ON
  if (v.next && !v.fav) v.fav = true;
  window.AF(); window.toast(v.next ? '🎯 Next に追加' : 'Next 解除');
}

export function qWatch(id) {
  const v = window.videos?.find(v => v.id === id);
  if (v) { v.watched = !v.watched; window.AF(); window.toast(v.watched ? '✅ 視聴済み' : '👁 未視聴に戻しました'); }
}

export function archOne(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.archived = true;
  window.AF();
  window.toastUndo('📦 アーカイブ', () => { v.archived = false; window.AF(); });
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
