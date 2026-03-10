// ═══ WAZA KIMURA — UI共通 ═══

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
