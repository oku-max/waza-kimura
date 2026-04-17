// ═══ WAZA KIMURA — UI共通 ═══

// Firebase経由のトースト（script[0]用）
export function showToast(msg, duration = 3000) {
  const existing = document.getElementById('wk-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'wk-toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:8px;z-index:9999;font-size:13px;opacity:1;transition:opacity 0.3s';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
}

// アプリ内トースト（#toastエレメント使用）
export function toast(msg) {
  const t = document.getElementById('toast');
  clearTimeout(t._tid);
  t.innerHTML = '';
  t.appendChild(document.createTextNode(msg));
  t.classList.add('show');
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}

// 取り消しボタン付きトースト
export function toastUndo(msg, undoFn) {
  const t = document.getElementById('toast');
  clearTimeout(t._tid);
  t.innerHTML = '';
  t.appendChild(document.createTextNode(msg));
  const btn = document.createElement('button');
  btn.textContent = '↩ 取り消し';
  btn.className = 'toast-undo-btn';
  btn.onclick = () => { clearTimeout(t._tid); t.classList.remove('show'); undoFn(); };
  t.appendChild(btn);
  t.classList.add('show');
  t._tid = setTimeout(() => t.classList.remove('show'), 5000);
}

// スクロールヘルパー
export function scr(id, dir) {
  const el = document.getElementById('srow-' + id);
  if (el) el.scrollLeft += dir * 160;
}

// タブ切り替え
export function switchTab(t) {
  if (window.openVPanelId) window.closeVPanel?.();
  if (document.getElementById('vp-panel')?.classList.contains('show')) window.closePanel?.();
  if (t === 'organize') {
    const ma = document.querySelector('.main-area');
    const orgTab = document.getElementById('organizeTab');
    if (ma && orgTab) {
      const zoom = parseFloat(document.body.style.zoom) || 1;
      orgTab.style.left = (ma.getBoundingClientRect().left / zoom) + 'px';
    }
  }
  ['home','community','organize','archive','settings','admin'].forEach(n => {
    const p  = document.getElementById(n + 'Tab');   if (p)  p.className  = 'tab-panel' + (t === n ? ' active' : '');
    const m  = document.getElementById('mnav-' + n); if (m)  m.className  = 'mn-i'      + (t === n ? ' active' : '');
    const tn = document.getElementById('tnav-' + n); if (tn) tn.className = 'tn-i'      + (t === n ? ' active' : '');
    const fn = document.getElementById('fnav-' + n); if (fn) fn.className = 'fs-nav-i'  + (t === n ? ' active' : '');
  });
  try {
    const libC = document.getElementById('fs-library-content');
    const orgC = document.getElementById('fs-organize-content');
    const settingsC = document.getElementById('fs-settings-content');
    if (t === 'organize') {
      if (orgC) orgC.style.display = '';
      if (libC) libC.style.display = 'none';
      setTimeout(() => window.adjustOrgTableHeight?.(), 100);
    } else if (t === 'settings' || t === 'admin') {
      if (orgC) orgC.style.display = 'none';
      if (libC) libC.style.display = 'none';
      if (settingsC) settingsC.style.display = t === 'settings' ? '' : 'none';
    } else {
      if (orgC) orgC.style.display = 'none';
      if (libC) libC.style.display = '';
      if (settingsC) settingsC.style.display = 'none';
    }
    window.showFsBulkBtn?.(t === 'home');
    window.showOrgFsBulkBtn?.(t === 'organize');
  } catch(e) { console.error('switchTab sidebar error:', e); }
  if (t === 'community') window.renderComm?.();
  if (t === 'organize')  window.renderOrg?.();
  if (t === 'archive')   window.renderArch?.();
  if (t === 'settings')  window.renderSettings?.();
  if (t === 'admin')     window.renderAdminDashboard?.();
  if (window.bulkMode) {
    const allowedTab = window.bulkCtx === 'organize' ? 'organize' : 'home';
    if (t !== allowedTab) window.exitBulk?.();
  }
}
