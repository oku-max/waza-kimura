// ═══ WAZA KIMURA — Google Drive 取り込み ═══

const VIDEO_MIMES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska',
  'video/webm','video/mpeg','video/x-ms-wmv','video/3gpp','video/x-m4v',
  'video/x-flv','video/ogg',
]);

let _token      = null;
let _scannedTree = null;

// ── 認証 ──
export async function initDriveAuth() {
  try {
    window.toast?.('Google Drive に接続中...');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
    provider.setCustomParameters({ prompt: 'consent', access_type: 'online' });
    const user = firebase.auth().currentUser;
    const result = user
      ? await user.reauthenticateWithPopup(provider)
      : await firebase.auth().signInWithPopup(provider);
    const cred = firebase.auth.GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) throw new Error('accessToken not returned');
    _token = cred.accessToken;
    _setAuthUI(true);
    return true;
  } catch(e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
    console.error('Drive auth error:', e.code, e.message);
    window.toast?.('認証に失敗: ' + (e.code || e.message));
    return false;
  }
}

function _setAuthUI(authed) {
  const btn    = document.getElementById('gd-auth-btn');
  const status = document.getElementById('gd-auth-status');
  if (btn)    btn.style.display    = authed ? 'none' : '';
  if (status) { status.textContent = authed ? '✅ 接続済み' : ''; }
}

// ── Drive API ──
async function driveGet(url) {
  if (!_token) throw new Error('not authenticated');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${_token}` } });
  if (res.status === 401) { _token = null; _setAuthUI(false); throw new Error('token expired'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function listFolder(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const data = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&orderBy=name&pageSize=1000`
  );
  return data.files || [];
}

async function getFolderName(folderId) {
  const data = await driveGet(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`);
  return data.name || folderId;
}

async function scanFolder(folderId, folderName, depth) {
  const files   = await listFolder(folderId);
  const videos  = [];
  const folders = [];
  for (const f of files) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      if (depth < 3) folders.push(await scanFolder(f.id, f.name, depth + 1));
    } else if (VIDEO_MIMES.has(f.mimeType)) {
      videos.push({ id: f.id, name: f.name });
    }
  }
  return { id: folderId, name: folderName, videos, folders };
}

// ── ユーティリティ ──
function parseFolderUrl(input) {
  const m = (input || '').match(/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test((input || '').trim())) return input.trim();
  return null;
}

function cleanTitle(filename, stripSuffix) {
  let t = filename.replace(/\.[^.]+$/, '');   // 拡張子
  t = t.replace(/^\d+\.\s*/, '');             // 先頭番号 "1. "
  if (stripSuffix?.trim()) {
    const idx = t.indexOf(stripSuffix.trim());
    if (idx > 0) t = t.slice(0, idx).trim();
  }
  return t.trim();
}

function isQRFile(filename) {
  return filename.includes('クイックレビュー') || filename.toLowerCase().includes('quick review');
}

function detectCommonSuffix(names) {
  const titles = names.map(n => n.replace(/\.[^.]+$/, '').replace(/^\d+\.\s*/, ''));
  if (titles.length < 3) return '';
  const ref = titles[0];
  for (let len = Math.min(ref.length, 50); len >= 8; len--) {
    for (let s = Math.max(0, ref.length - len); s < ref.length - len + 1; s++) {
      const sub = ref.slice(s, s + len).trim();
      if (sub && titles.every(t => t.includes(sub))) return sub;
    }
  }
  return '';
}

function flattenTree(tree, stripSuffix) {
  const result = [];
  function walk(node) {
    for (const v of node.videos) {
      result.push({
        id:         v.id,
        rawName:    v.name,
        title:      cleanTitle(v.name, stripSuffix),
        folderName: node.name,
        isQR:       isQRFile(v.name),
      });
    }
    for (const sub of node.folders) walk(sub);
  }
  walk(tree);
  return result;
}

// ── UI: タブ切り替え ──
export function switchImportTab(tab) {
  const isYt = tab === 'yt';
  document.getElementById('yt-import-body').style.display = isYt ? '' : 'none';
  document.getElementById('gd-import-body').style.display = isYt ? 'none' : '';
  const tabYt = document.getElementById('tab-yt');
  const tabGd = document.getElementById('tab-gd');
  tabYt.style.background = isYt ? 'var(--text)' : 'var(--surface2)';
  tabYt.style.color      = isYt ? '#fff' : 'var(--text2)';
  tabGd.style.background = isYt ? 'var(--surface2)' : 'var(--text)';
  tabGd.style.color      = isYt ? 'var(--text2)' : '#fff';
}

// ── UI: フォルダスキャン ──
export async function gdScanFolder() {
  if (!_token) {
    const ok = await initDriveAuth();
    if (!ok) return;
  }
  const folderId = parseFolderUrl(document.getElementById('gd-folder-url')?.value);
  if (!folderId) { window.toast?.('フォルダURLを入力してください'); return; }

  const btn = document.getElementById('gd-scan-btn');
  if (btn) { btn.textContent = 'スキャン中...'; btn.disabled = true; }

  try {
    const folderName = await getFolderName(folderId);
    _scannedTree = await scanFolder(folderId, folderName, 0);

    // 全ファイル名収集 → サフィックス自動検出
    const allNames = [];
    function collect(node) { node.videos.forEach(v => allNames.push(v.name)); node.folders.forEach(collect); }
    collect(_scannedTree);
    const detected = detectCommonSuffix(allNames);
    const suffixEl = document.getElementById('gd-strip-suffix');
    if (suffixEl && !suffixEl.value) suffixEl.value = detected;

    document.getElementById('gd-stage2-title').textContent = folderName;
    document.getElementById('gd-stage1').style.display = 'none';
    document.getElementById('gd-stage2').style.display = '';
    gdRenderFileList();
  } catch(e) {
    console.error('scan error:', e);
    window.toast?.('スキャンに失敗しました: ' + e.message);
  } finally {
    if (btn) { btn.textContent = 'スキャン →'; btn.disabled = false; }
  }
}

// ── UI: ファイルリスト描画 ──
export function gdRenderFileList() {
  if (!_scannedTree) return;
  const stripSuffix = document.getElementById('gd-strip-suffix')?.value || '';
  const hideQR      = document.getElementById('gd-hide-qr')?.checked;
  const flat        = flattenTree(_scannedTree, stripSuffix);

  // フォルダごとにグループ化
  const groups = new Map();
  for (const item of flat) {
    if (hideQR && item.isQR) continue;
    if (!groups.has(item.folderName)) groups.set(item.folderName, []);
    groups.get(item.folderName).push(item);
  }

  let html = '';
  const isRootOnly = _scannedTree.folders.length === 0;
  for (const [folder, items] of groups) {
    html += `<div style="margin-bottom:10px">`;
    if (!isRootOnly) {
      html += `<div style="font-size:10px;font-weight:700;color:var(--text3);padding:4px 0 3px;letter-spacing:.04em">📁 ${folder}</div>`;
    }
    for (const item of items) {
      const newId = 'gd-' + item.id;
      const done  = (window.videos || []).some(v => v.id === newId);
      html += `<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:6px;cursor:pointer;${done ? 'opacity:.45' : ''}">
        <input type="checkbox" class="gd-vid-cb"
          data-id="${item.id}"
          data-title="${item.title.replace(/"/g, '&quot;')}"
          data-folder="${item.folderName.replace(/"/g, '&quot;')}"
          data-isqr="${item.isQR}"
          ${done ? 'disabled checked' : 'checked'}
          style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0"
          onchange="gdUpdateCount()">
        ${item.isQR ? '<span style="font-size:9px;background:#f0ad4e22;color:#f0ad4e;border:1px solid #f0ad4e55;border-radius:4px;padding:1px 4px;flex-shrink:0">QR</span>' : ''}
        <span style="font-size:12px;color:var(--text);line-height:1.3">${item.title}</span>
        ${done ? '<span style="font-size:9px;color:var(--text3);margin-left:auto;flex-shrink:0">取込済</span>' : ''}
      </label>`;
    }
    html += `</div>`;
  }
  const container = document.getElementById('gd-file-list');
  if (container) container.innerHTML = html || '<div style="font-size:12px;color:var(--text3);padding:12px">動画ファイルが見つかりませんでした</div>';
  gdUpdateCount();
}

export function gdUpdateCount() {
  const all     = document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled])');
  const checked = document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled]):checked');
  const el = document.getElementById('gd-sel-count');
  if (el) el.textContent = `${checked.length} / ${all.length} 本選択`;
}

export function gdSelAll()  { document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled])').forEach(c => { c.checked = true;  }); gdUpdateCount(); }
export function gdSelNone() { document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled])').forEach(c => { c.checked = false; }); gdUpdateCount(); }

export function gdBackToStage1() {
  document.getElementById('gd-stage1').style.display = '';
  document.getElementById('gd-stage2').style.display = 'none';
}

// ── 取り込み実行 ──
export async function gdImport() {
  const checks = document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled]):checked');
  if (!checks.length) { window.toast?.('動画を選択してください'); return; }

  const channel  = (document.getElementById('gd-channel')?.value || '').trim();
  const playlist = _scannedTree?.name || '';

  document.getElementById('yt-import-ov')?.classList.remove('open');

  let added = 0;
  const newIds = [];
  checks.forEach(cb => {
    const fileId = cb.dataset.id;
    const newId  = 'gd-' + fileId;
    if ((window.videos || []).find(v => v.id === newId)) return;
    window.videos = window.videos || [];
    window.videos.push({
      id:       newId,
      pt:       'gdrive',
      title:    cb.dataset.title,
      channel:  channel,
      ch:       channel,
      pl:       cb.dataset.folder || playlist,
      thumb:    `https://drive.google.com/thumbnail?id=${fileId}&sz=w320-h180`,
      addedAt:  new Date().toISOString().slice(0, 10),
      watched:  false, fav: false, status: '未着手',
      prio:     'そのうち', shared: 0, archived: false, memo: '', ai: '',
      isQR:     cb.dataset.isqr === 'true',
      tb: [], ac: [], pos: [], tech: [],
    });
    newIds.push(newId);
    added++;
  });

  if (window.AF) window.AF();
  await window.saveUserData?.();
  window.toast?.(`✅ ${added}本の動画を追加しました`);

  if (window.aiSettings?.autoTagOnImport && newIds.length) {
    window.autoTagNewVideos?.(newIds);
  }
}
