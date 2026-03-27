// ═══ WAZA KIMURA — Google Drive 取り込み ═══

const VIDEO_MIMES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska',
  'video/webm','video/mpeg','video/x-ms-wmv','video/3gpp','video/x-m4v',
  'video/x-flv','video/ogg',
]);

const GD_SCOPE   = 'https://www.googleapis.com/auth/drive';  // フォルダブラウズ＋ファイル編集の両方に必要
const TOKEN_TTL  = 55 * 60 * 1000;   // 55分（Google上限60分）
const REFRESH_AT = 50 * 60 * 1000;   // 50分経過でプロアクティブ刷新
const CACHE_KEY  = 'gd_token_v3';    // v3: drive scope（フォルダブラウズ対応）
const CLIENT_ID  = '502684957551-bal1rfuj3vanhu1j6p452bsvc6gmcp7u.apps.googleusercontent.com';

let _token        = null;
let _scannedTree  = null;
let _refreshTimer = null;

// ── トークンキャッシュ（localStorage: ブラウザ再起動後も有効、TTL内のみ使用）──
function _loadCachedToken() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && (Date.now() - cached.ts) < TOKEN_TTL) return cached.token;
  } catch(e) {}
  return null;
}

function _saveToken(token) {
  _token = token;
  try {
    sessionStorage.removeItem('gd_token'); // 旧キャッシュ削除
    localStorage.setItem(CACHE_KEY, JSON.stringify({ token, ts: Date.now() }));
  } catch(e) {}
  _scheduleRefresh();
}

// ── プロアクティブ刷新スケジューラ ──
function _scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(() => {
    _silentRefresh().catch(() => {/* バックグラウンド刷新失敗は無視 */});
  }, REFRESH_AT);
}

// ── GIS サイレント刷新（ポップアップなし）──
function _silentRefresh() {
  return new Promise((resolve, reject) => {
    const gis = window.google?.accounts?.oauth2;
    if (!gis) { reject(new Error('GIS not loaded')); return; }
    const client = gis.initTokenClient({
      client_id: CLIENT_ID,
      scope:     GD_SCOPE,
      prompt:    '',   // スコープ取得済みならUIなしで刷新
      callback:  (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'no token'));
        } else {
          _saveToken(resp.access_token);
          _setAuthUI(true);
          resolve(resp.access_token);
        }
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// ── 認証（Firebase Google Provider経由 — waza-kimura.firebaseapp.com リダイレクトを使用）──
// GISのinitTokenClientはJS origins設定が必要だがFirebaseは不要なのでこちらを採用
export function initDriveAuth(forceConsent = false) {
  return new Promise((resolve) => {
    const fbAuth = window.firebase?.auth?.();
    if (!fbAuth) {
      window.toast?.('Firebase未初期化');
      resolve(false);
      return;
    }
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.addScope(GD_SCOPE);
    // 常にconsentを要求してdrive.readonlyスコープを確実に付与させる
    provider.setCustomParameters({ prompt: 'consent' });

    fbAuth.signInWithPopup(provider)
      .then(result => {
        // Firebase v8: result.credential.accessToken または _tokenResponse.oauthAccessToken
        const token = result.credential?.accessToken
                   || result._tokenResponse?.oauthAccessToken
                   || null;
        if (token) {
          _saveToken(token);
          _setAuthUI(true);
          resolve(true);
        } else if (!forceConsent) {
          // トークンなし → consent強制で再試行
          initDriveAuth(true).then(resolve);
        } else {
          window.toast?.('Drive認証に失敗しました（トークン取得不可）');
          resolve(false);
        }
      })
      .catch(e => {
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
          resolve(false);
          return;
        }
        console.error('Drive auth error:', e);
        window.toast?.('Drive認証エラー: ' + (e.message || e.code || ''));
        resolve(false);
      });
  });
}

// ── トークン取得（再生時・スキャン時に使用）──
export async function ensureDriveToken() {
  if (_token) return _token;
  const cached = _loadCachedToken();
  if (cached) {
    _token = cached;
    _setAuthUI(true);
    _scheduleRefresh();
    return _token;
  }
  // キャッシュ切れ → GISサイレント刷新を先に試みる（ポップアップなし）
  try {
    const t = await _silentRefresh();
    if (t) return t;
  } catch(e) {
    // サイレント刷新失敗（初回 or スコープ未付与）→ Firebaseポップアップへ
  }
  const ok = await initDriveAuth();
  return ok ? _token : null;
}

// ── キャッシュのみ確認（認証ポップアップを出さない）──
export function getDriveTokenIfAvailable() {
  if (_token) return _token;
  const cached = _loadCachedToken();
  if (cached) { _token = cached; _setAuthUI(true); _scheduleRefresh(); return _token; }
  return null;
}

// ── トークンを破棄して再認証を促す ──
export function clearDriveToken() {
  _token = null;
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  try { localStorage.removeItem(CACHE_KEY); } catch(e) {}
  _setAuthUI(false);
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
  if (res.status === 401) {
    _token = null;
    try { sessionStorage.removeItem('gd_token'); } catch(e) {}
    _setAuthUI(false);
    throw new Error('token expired');
  }
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
function cleanTitle(filename, stripSuffix) {
  let t = filename.replace(/\.[^.]+$/, '');   // 拡張子のみ除去（先頭番号は保持）
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

// ── カスタムフォルダブラウザ ──
let _browserStack = [];
let _browserCurrentId   = 'root';
let _browserCurrentName = 'My Drive';

export async function gdOpenBrowser() {
  if (!_token) {
    const ok = await initDriveAuth();
    if (!ok) return;
  }
  _browserStack       = [];
  _browserCurrentId   = 'root';
  _browserCurrentName = 'My Drive';
  document.getElementById('gd-stage1').style.display          = 'none';
  document.getElementById('gd-stage-browser').style.display   = '';
  await _browserRender();
}

async function _browserRender() {
  const titleEl = document.getElementById('gd-browser-title');
  const listEl  = document.getElementById('gd-browser-list');
  const breadEl = document.getElementById('gd-browser-breadcrumb');
  const backBtn = document.getElementById('gd-browser-back');

  if (titleEl) titleEl.textContent = _browserCurrentName;
  if (backBtn) backBtn.style.visibility = _browserStack.length ? 'visible' : 'hidden';

  // パンくず
  if (breadEl) {
    const crumbs = [{ id: 'root', name: 'My Drive' }, ..._browserStack];
    breadEl.innerHTML = crumbs.map((c, i) =>
      `<span onclick="gdBrowserJump(${i})" style="cursor:pointer;color:var(--accent);text-decoration:underline">${c.name}</span>`
    ).join(' › ');
  }

  if (listEl) listEl.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:12px 4px">読み込み中...</div>';

  try {
    const files   = await listFolder(_browserCurrentId);
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const vCount  = files.filter(f => VIDEO_MIMES.has(f.mimeType)).length;

    let html = '';
    if (vCount > 0) {
      html += `<div style="font-size:11px;color:var(--accent);padding:4px 6px 8px;font-weight:600">🎬 このフォルダに動画 ${vCount} 本</div>`;
    }
    if (folders.length === 0 && vCount === 0) {
      html = '<div style="font-size:12px;color:var(--text3);padding:12px 4px">フォルダが空です</div>';
    } else {
      html += folders.map(f =>
        `<div onclick="gdBrowserEnter('${f.id.replace(/'/g,"\\'")}','${f.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}')"
          style="display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--border);margin-bottom:6px;background:var(--surface2)">
          <span style="font-size:18px">📁</span>
          <span style="font-size:13px;color:var(--text);flex:1">${f.name}</span>
          <span style="color:var(--text3);font-size:16px">›</span>
        </div>`
      ).join('');
    }
    if (listEl) listEl.innerHTML = html;
  } catch(e) {
    console.error('browse error:', e);
    if (listEl) listEl.innerHTML = '<div style="font-size:12px;color:#e74c3c;padding:12px 4px">読み込みに失敗しました</div>';
  }
}

export function gdBrowserEnter(folderId, folderName) {
  _browserStack.push({ id: _browserCurrentId, name: _browserCurrentName });
  _browserCurrentId   = folderId;
  _browserCurrentName = folderName;
  _browserRender();
}

export function gdBrowserBack() {
  if (!_browserStack.length) return;
  const prev = _browserStack.pop();
  _browserCurrentId   = prev.id;
  _browserCurrentName = prev.name;
  _browserRender();
}

export function gdBrowserJump(index) {
  const crumbs = [{ id: 'root', name: 'My Drive' }, ..._browserStack];
  const target = crumbs[index];
  _browserStack       = _browserStack.slice(0, index);
  _browserCurrentId   = target.id;
  _browserCurrentName = target.name;
  _browserRender();
}

export async function gdBrowserSelect() {
  document.getElementById('gd-stage-browser').style.display = 'none';
  await _scanAndShow(_browserCurrentId, _browserCurrentName);
}

// ── フォルダスキャンして一覧表示 ──
async function _scanAndShow(folderId, folderName) {
  const btn = document.getElementById('gd-scan-btn');
  if (btn) { btn.textContent = 'スキャン中...'; btn.disabled = true; }
  try {
    _scannedTree = await scanFolder(folderId, folderName, 0);
    // 全ファイル名収集 → サフィックス自動検出
    const allNames = [];
    function collect(node) { node.videos.forEach(v => allNames.push(v.name)); node.folders.forEach(collect); }
    collect(_scannedTree);
    const detected = detectCommonSuffix(allNames);
    const suffixEl = document.getElementById('gd-strip-suffix');
    if (suffixEl) suffixEl.value = detected;
    document.getElementById('gd-stage2-title').textContent = folderName;
    document.getElementById('gd-stage1').style.display = 'none';
    document.getElementById('gd-stage2').style.display = '';
    gdRenderFileList();
  } catch(e) {
    console.error('scan error:', e);
    window.toast?.('スキャンに失敗しました: ' + e.message);
  } finally {
    if (btn) { btn.textContent = '📁 フォルダを選択'; btn.disabled = false; }
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
  document.getElementById('gd-stage1').style.display          = '';
  document.getElementById('gd-stage2').style.display          = 'none';
  document.getElementById('gd-stage-browser').style.display   = 'none';
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

// ── Google Drive ファイルのタイトルを変更 ──
export async function renameGdFile(fileId, newName) {
  const token = await ensureDriveToken();
  if (!token) throw new Error('Drive token unavailable');
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive API error ${res.status}`);
  }
  return res.json();
}
