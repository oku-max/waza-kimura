// ═══ WAZA KIMURA — Google Drive 取り込み ═══

const VIDEO_MIMES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/x-matroska',
  'video/webm','video/mpeg','video/x-ms-wmv','video/3gpp','video/x-m4v',
  'video/x-flv','video/ogg',
]);

// drive: フォルダブラウジング・ファイル操作の両方に対応（drive.readonlyではroot一覧が空になる場合あり）
const GD_SCOPE   = 'https://www.googleapis.com/auth/drive';
const TOKEN_TTL  = 55 * 60 * 1000;   // 55分（Google上限60分）
const REFRESH_AT = 50 * 60 * 1000;   // 50分経過でプロアクティブ刷新
const CACHE_KEY  = 'gd_token_v4';    // v4: driveスコープ（強制再認証）
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
          fetchMissingGdDurations(); // 既存動画のduration補完
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
          fetchMissingGdDurations(); // 既存動画のduration補完
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
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,videoMediaMetadata,thumbnailLink)&orderBy=name&pageSize=1000`
  );
  return data.files || [];
}

async function getFolderName(folderId) {
  const data = await driveGet(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`);
  return data.name || folderId;
}

// ── 既存GDrive動画のduration補完（50件ずつbatch）──
export async function fetchMissingGdDurations() {
  const missing = (window.videos || []).filter(v =>
    v.pt === 'gdrive' && !v.duration && v.id
  );
  if (!missing.length) return;
  // IDマップ: fileId → videoオブジェクト
  const idMap = {};
  missing.forEach(v => { idMap[v.id.replace(/^gd-/, '')] = v; });
  const fileIds = Object.keys(idMap);
  // 50件ずつバッチ処理
  let updated = 0;
  for (let i = 0; i < fileIds.length; i += 50) {
    const batch = fileIds.slice(i, i + 50);
    // Drive v3 filesリストでIDを直接フィルタ
    const q = encodeURIComponent(batch.map(id => `'${id}' in parents or id='${id}'`).join(' or '));
    const ids = batch.join(',');
    try {
      // Drive v3 doesn't support multi-get; fetch individually but in parallel
      const results = await Promise.allSettled(
        batch.map(fileId => driveGet(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,videoMediaMetadata`
        ))
      );
      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const data = r.value;
        const dur = data.videoMediaMetadata?.durationMillis;
        if (dur && idMap[data.id]) {
          idMap[data.id].duration = Math.round(Number(dur) / 1000);
          updated++;
        }
      });
    } catch(e) { /* batch error, continue */ }
  }
  if (updated > 0) {
    window.debounceSave?.();
    window.toast?.(`✅ ${updated}本のGDrive動画の長さを取得しました`);
    window.AF?.();
  }
}
window.fetchMissingGdDurations = fetchMissingGdDurations;

async function scanFolder(folderId, folderName, depth) {
  const files   = await listFolder(folderId);
  const videos  = [];
  const folders = [];
  for (const f of files) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      if (depth < 3) folders.push(await scanFolder(f.id, f.name, depth + 1));
    } else if (VIDEO_MIMES.has(f.mimeType)) {
      const dur = f.videoMediaMetadata?.durationMillis;
      videos.push({ id: f.id, name: f.name, duration: dur ? Math.round(Number(dur) / 1000) : 0, thumbnailLink: f.thumbnailLink || '' });
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
  for (let len = Math.min(ref.length, 100); len >= 8; len--) {
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
        duration:   v.duration || 0,
        thumbnailLink: v.thumbnailLink || '',
      });
    }
    for (const sub of node.folders) walk(sub);
  }
  walk(tree);
  return result;
}

// ── UI: タブ切り替え ──
export function switchImportTab(tab) {
  const tabs = ['yt', 'gd', 'url'];
  const bodies = { yt: 'yt-import-body', gd: 'gd-import-body', url: 'url-import-body' };
  tabs.forEach(t => {
    const body = document.getElementById(bodies[t]);
    if (body) body.style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'var(--surface2)';
      btn.style.color      = t === tab ? 'var(--bg)' : 'var(--text2)';
      btn.style.borderColor = t === tab ? 'var(--accent)' : 'var(--border)';
    }
  });
  if (tab === 'gd') gdOpenBrowser();
  // YouTubeタブ選択時のみ認証→プレイリスト取得
  if (tab === 'yt') {
    const body = document.getElementById('yt-import-body');
    if (!body) return;
    // 未ログインならログイン案内を表示
    if (!window._firebaseCurrentUser?.()) {
      const stage1 = document.getElementById('yt-stage1');
      if (stage1) stage1.innerHTML = `
        <div style="text-align:center;padding:30px 10px">
          <div style="font-size:32px;margin-bottom:12px">🔒</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">Googleアカウントが必要です</div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:16px">YouTubeプレイリストの取り込みにはGoogleログインが必要です</div>
          <button onclick="document.getElementById('auth-btn')?.click()" style="padding:10px 24px;border-radius:8px;border:none;background:var(--accent);color:var(--bg);font-size:13px;font-weight:700;cursor:pointer">Googleでログイン</button>
        </div>`;
    } else if (window.importYouTubePlaylists) {
      // トークンが既にある場合のみ自動取得。無い場合はユーザー操作で再認証させる（ポップアップブロッカー回避）
      if (window._ytToken) {
        window.importYouTubePlaylists();
      } else {
        const list = document.getElementById('yt-pl-list');
        if (list) list.innerHTML = `<div style="text-align:center;padding:24px 12px">
          <div style="font-size:28px;margin-bottom:10px">📺</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">YouTubeに接続</div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:14px">プレイリストを取得するには認証が必要です</div>
          <button onclick="ytReauth()" style="padding:9px 22px;border-radius:8px;border:none;background:var(--accent);color:var(--bg);font-size:13px;font-weight:700;cursor:pointer">YouTubeに接続</button>
        </div>`;
      }
    }
  }
}

// ── カスタムフォルダブラウザ ──
let _browserStack = [];
let _browserCurrentId   = 'root';
let _browserCurrentName = 'My Drive';

// ── お気に入りフォルダ (localStorage) ──
const FAV_KEY = 'gd_fav_folders';
function _loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch(e) { return []; }
}
function _saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch(e) {}
}
export function gdFavToggle(folderId, folderName) {
  let favs = _loadFavs();
  const idx = favs.findIndex(f => f.id === folderId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift({ id: folderId, name: folderName });
  _saveFavs(favs);
  _browserRender();
}

export async function gdOpenBrowser() {
  if (!_token) {
    const ok = await initDriveAuth();
    if (!ok) return;
  }
  _browserStack       = [];
  _browserCurrentId   = 'root';
  _browserCurrentName = 'My Drive';
  document.getElementById('gd-stage-browser').style.display = '';
  document.getElementById('gd-stage2').style.display        = 'none';
  await _browserRender();
}

function _folderItemHtml(f, isFav) {
  const eid  = f.id.replace(/'/g,"\\'");
  const ename = f.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  const star = isFav ? '★' : '☆';
  const starColor = isFav ? 'var(--gold)' : 'var(--text3)';
  const bg   = isFav ? 'background:var(--gold-soft);border-color:var(--gold);' : '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--border);margin-bottom:5px;background:var(--surface2);${bg}">
    <span style="font-size:17px" onclick="gdBrowserEnter('${eid}','${ename}')">📁</span>
    <span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="gdBrowserEnter('${eid}','${ename}')">${f.name}</span>
    <button onclick="event.stopPropagation();gdFavToggle('${eid}','${ename}')"
      style="background:none;border:none;cursor:pointer;font-size:16px;color:${starColor};padding:2px 4px;line-height:1;flex-shrink:0"
      title="${isFav ? 'お気に入りから外す' : 'お気に入りに追加'}">${star}</button>
    <span style="color:var(--text3);font-size:14px;flex-shrink:0" onclick="gdBrowserEnter('${eid}','${ename}')">›</span>
  </div>`;
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
    const favs    = _loadFavs();
    const favIds  = new Set(favs.map(f => f.id));

    let html = '';

    // お気に入りセクション（ルート表示時のみ）
    if (_browserStack.length === 0 && favs.length > 0) {
      html += `<div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);padding:4px 0 6px;display:flex;align-items:center;gap:6px">★ お気に入り<span style="flex:1;height:1px;background:var(--border);display:block"></span></div>`;
      html += favs.map(f => _folderItemHtml(f, true)).join('');
      html += `<div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);padding:8px 0 6px;display:flex;align-items:center;gap:6px">全フォルダ<span style="flex:1;height:1px;background:var(--border);display:block"></span></div>`;
    }

    if (vCount > 0) {
      html += `<div style="font-size:11px;color:var(--accent);padding:4px 6px 8px;font-weight:600">🎬 このフォルダに動画 ${vCount} 本</div>`;
    }
    if (folders.length === 0 && vCount === 0) {
      html += '<div style="font-size:12px;color:var(--text3);padding:12px 4px">フォルダが空です</div>';
    } else {
      html += folders.map(f => _folderItemHtml(f, favIds.has(f.id))).join('');
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
  // プレイリスト名をフォルダ名でプリセット
  const plInp = document.getElementById('gd-playlist');
  if (plInp) plInp.value = _browserCurrentName;
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
    document.getElementById('gd-stage-browser').style.display = 'none';
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
          data-duration="${item.duration || 0}"
          data-thumb="${(item.thumbnailLink || '').replace(/"/g, '&quot;')}"
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

export function gdBackToBrowser() {
  document.getElementById('gd-stage2').style.display          = 'none';
  document.getElementById('gd-stage-browser').style.display   = '';
}

// ── サムネイルを Firebase Storage にアップロード ──
async function _uploadThumbToStorage(fileId, thumbnailLink) {
  if (!thumbnailLink || !firebase?.storage) return '';
  try {
    // lh3はCORSブロックするのでVercel APIプロキシ経由で取得
    const token = _token || '';
    const proxyUrl = `/api/thumb-proxy?url=${encodeURIComponent(thumbnailLink)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return '';
    const blob = await res.blob();
    const uid = firebase.auth().currentUser?.uid;
    if (!uid) return '';
    const path = `thumbnails/${uid}/gd-${fileId}.jpg`;
    const ref = firebase.storage().ref(path);
    await ref.put(blob, { contentType: blob.type || 'image/jpeg' });
    return await ref.getDownloadURL();
  } catch (e) {
    console.warn('Thumb upload failed:', fileId, e);
    return '';
  }
}

// ── 取り込み実行 ──
export async function gdImport() {
  const checks = document.querySelectorAll('#gd-file-list .gd-vid-cb:not([disabled]):checked');
  if (!checks.length) { window.toast?.('動画を選択してください'); return; }

  const channel  = (document.getElementById('gd-channel')?.value || '').trim();
  const playlist = (document.getElementById('gd-playlist')?.value || '').trim();

  document.getElementById('yt-import-ov')?.classList.remove('open');

  let added = 0;
  const newIds = [];
  const thumbJobs = []; // { video, fileId, thumbnailLink }
  checks.forEach(cb => {
    const fileId = cb.dataset.id;
    const newId  = 'gd-' + fileId;
    if ((window.videos || []).find(v => v.id === newId)) return;
    window.videos = window.videos || [];
    const v = {
      id:       newId,
      pt:       'gdrive',
      title:    cb.dataset.title,
      channel:  channel,
      ch:       channel,
      pl:       cb.dataset.folder || playlist,
      thumb:    '',
      addedAt:  new Date().toISOString().slice(0, 10),
      watched:  false, fav: false, status: '未着手',
      prio:     'そのうち', shared: 0, archived: false, memo: '', ai: '',
      isQR:     cb.dataset.isqr === 'true',
      duration: parseInt(cb.dataset.duration) || 0,
      tbLocked: false,
      ...(window.autoTagFromTitle ? window.autoTagFromTitle(cb.dataset.title) : { tb: [], cat: [], pos: [], tags: [] }),
    };
    window.videos.push(v);
    newIds.push(newId);
    added++;
    const tl = cb.dataset.thumb;
    if (tl) thumbJobs.push({ video: v, fileId, thumbnailLink: tl });
  });

  if (window.AF) window.AF();
  await window.saveUserData?.();
  window.toast?.(`✅ ${added}本の動画を追加しました`);

  if (window.aiSettings?.autoTagOnImport && newIds.length) {
    window.autoTagNewVideos?.(newIds);
  }

  // サムネイルをバックグラウンドでFirebase Storageにアップロード
  if (thumbJobs.length) {
    _uploadThumbsBatch(thumbJobs);
  }
}

async function _uploadThumbsBatch(jobs) {
  let done = 0;
  // 5件ずつ並列処理
  for (let i = 0; i < jobs.length; i += 5) {
    const batch = jobs.slice(i, i + 5);
    await Promise.allSettled(batch.map(async ({ video, fileId, thumbnailLink }) => {
      const url = await _uploadThumbToStorage(fileId, thumbnailLink);
      if (url) {
        video.thumb = url;
        done++;
      }
    }));
  }
  if (done > 0) {
    await window.saveUserData?.();
    window.AF?.();
    window.toast?.(`🖼 ${done}本のサムネイルを保存しました`);
  }
}

// ── 既存GDrive動画のサムネイル補完 ──
export async function fetchMissingGdThumbnails() {
  // Firebase Storage URL以外は「未設定」扱い（期限切れのDrive URLも含む）
  const _hasPermanentThumb = t => t && t.includes('firebasestorage.googleapis.com');
  const missing = (window.videos || []).filter(v =>
    v.pt === 'gdrive' && !_hasPermanentThumb(v.thumb) && v.id
  );
  if (!missing.length) { window.toast?.('サムネイル未設定のGDrive動画はありません'); return; }

  // Drive認証チェック — 未認証なら先にトークン取得を試みる
  let token = _token || await ensureDriveToken().catch(() => null);
  if (!token) {
    window.toast?.('⚠ Google Driveにログインしてください（＋動画を追加 → Google Drive）');
    return;
  }

  window.toast?.(`🖼 ${missing.length}本のサムネイルを取得中...`);
  let done = 0, fail = 0;
  for (let i = 0; i < missing.length; i += 5) {
    const batch = missing.slice(i, i + 5);
    await Promise.allSettled(batch.map(async (v) => {
      const fileId = v.id.replace(/^gd-/, '');
      try {
        const data = await driveGet(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`);
        if (data.thumbnailLink) {
          const url = await _uploadThumbToStorage(fileId, data.thumbnailLink);
          if (url) { v.thumb = url; done++; }
          else fail++;
        } else { fail++; }
      } catch (e) {
        fail++;
        if (fail <= 3) console.warn('Thumb fetch failed:', fileId, e.message);
      }
    }));
    // 途中経過（50件ごと）
    if ((i + 5) % 50 === 0 && i + 5 < missing.length) {
      window.toast?.(`🖼 処理中... ${done}件完了 / ${missing.length}件`);
    }
  }
  if (done > 0) {
    await window.saveUserData?.();
    window.AF?.();
  }
  window.toast?.(`🖼 ${done}/${missing.length}本のサムネイルを保存しました${fail ? ` (${fail}件失敗)` : ''}`);
}
window.fetchMissingGdThumbnails = fetchMissingGdThumbnails;

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

// ── GDrive チャンネル選択DD ──
export function gdChDdOpen() {
  const dd = document.getElementById('gd-ch-dd');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { dd.style.display = 'none'; return; }
  gdChDdFilter('');
  dd.style.display = 'block';
}

export function gdChDdFilter(q) {
  const listEl = document.getElementById('gd-ch-ddlist');
  if (!listEl) return;
  const chMap = {};
  (window.videos||[]).forEach(v => { if (v.channel) chMap[v.channel] = (chMap[v.channel]||0) + 1; });
  const channels = Object.keys(chMap).sort((a,b) => a.localeCompare(b, 'ja'));
  const ql = (q||'').trim().toLowerCase();
  const filtered = ql ? channels.filter(c => c.toLowerCase().includes(ql)) : channels;
  listEl.innerHTML = filtered.map(c =>
    `<div class="vp-dd-item" onclick="gdChSelect('${c.replace(/'/g,"\\'")}')">
      ${c}<span class="vp-dd-cnt">${chMap[c]}本</span>
    </div>`
  ).join('') || '<div style="padding:8px 12px;font-size:11px;color:var(--text3)">チャンネルなし</div>';
}

export function gdChSelect(val) {
  const inp = document.getElementById('gd-channel');
  if (inp) inp.value = val;
  const dd = document.getElementById('gd-ch-dd');
  if (dd) dd.style.display = 'none';
}
