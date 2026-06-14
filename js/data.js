// ═══ WAZA KIMURA — データ操作 ═══

// ─── 自動保存（debounce + 直列化）───
// 連打しても (1) 600ms待ってまとめて1回、(2) 保存中はもう1回だけ予約して直列実行。
// これで saveUserData が並走して競合チェックをすり抜ける事故を防ぐ。
let _autoSaveTimer = null;
let _saveInFlight = false;
let _savePending = false;

async function _runSave() {
  if (_saveInFlight) { _savePending = true; return; } // 実行中なら末尾に1回だけ予約
  _saveInFlight = true;
  try {
    if (window.saveUserData) await window.saveUserData();
  } catch (e) {
    console.error('debounceSave error:', e);
  } finally {
    _saveInFlight = false;
    if (_savePending) { _savePending = false; _runSave(); } // 予約分を流す
  }
}

export function debounceSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(_runSave, 600);
}

export function qFav(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.fav = !v.fav;
  // Fav OFF → Next も自動OFF
  if (!v.fav && v.next) v.next = false;
  window.AF(); window.toast(v.fav ? '⭐ お気に入り追加' : 'お気に入り解除');
  debounceSave();
}

export function qNext(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.next = !v.next;
  // Next ON → Fav も自動ON
  if (v.next && !v.fav) v.fav = true;
  window.AF(); window.toast(v.next ? '🎯 Next に追加' : 'Next 解除');
  debounceSave();
}

export function qDrill(id) {
  const v = window.videos?.find(v => v.id === id);
  if (!v) return;
  v.drill = !v.drill;
  window.AF(); window.toast(v.drill ? '🟣 Drill に追加' : 'Drill 解除');
  debounceSave();
}

export function qWatch(id) {
  const v = window.videos?.find(v => v.id === id);
  if (v) { v.watched = !v.watched; window.AF(); window.toast(v.watched ? '✅ 視聴済み' : '👁 未視聴に戻しました'); debounceSave(); }
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
