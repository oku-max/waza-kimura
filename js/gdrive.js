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
          fetchMissingGdDurations();
          fetchMissingGdThumbnails();
          window.loadGdriveCardThumbs?.();
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
          fetchMissingGdDurations();
          fetchMissingGdThumbnails();
          window.loadGdriveCardThumbs?.();
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

// ページ送りをする。1回の応答は最大1000件で、以前は1ページ目しか読んでいなかったため、
// 項目の多いフォルダでは後ろのファイル（フォルダの下に並ぶ単独ファイル等）が丸ごと落ちていた。
async function listFolder(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) {   // 上限2万件（万一の無限ループ防止）
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}`
      + `&fields=nextPageToken,files(id,name,mimeType,videoMediaMetadata,thumbnailLink,shortcutDetails)`
      + `&orderBy=name&pageSize=1000`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await driveGet(url);
    for (const f of (data.files || [])) out.push(f);
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

const GD_FOLDER_MIME = 'application/vnd.google-apps.folder';

// ショートカットは実体に置き換える。「共有アイテムをドライブに追加」で作られた項目は
// ショートカットになることがあり、mimeType が …apps.shortcut のため動画と認識できなかった。
function _gdResolveShortcut(f) {
  const t = f?.shortcutDetails;
  if (!t?.targetId) return f;
  return { ...f, id: t.targetId, mimeType: t.targetMimeType || f.mimeType };
}

// Drive の mimeType は当てにならないことがある（アップロード経路によっては
// application/octet-stream になる）。拡張子でも動画と認めて取りこぼさないようにする。
function _isVideoFile(f) {
  if (!f || f.mimeType === GD_FOLDER_MIME) return false;
  if (VIDEO_MIMES.has(f.mimeType)) return true;
  if (String(f.mimeType || '').startsWith('video/')) return true;
  return _VIDEO_EXT_RE.test(f.name || '');
}

async function getFolderName(folderId) {
  const data = await driveGet(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`);
  return data.name || folderId;
}

// ── MP4 mvhd ボックスから再生時間を抽出 ──
// MP4構造: [size:4][type:4][version:1][flags:3][payload...]
// version 0: creation_time(4), modification_time(4), timescale(4), duration(4)
// version 1: creation_time(8), modification_time(8), timescale(4), duration(8)
function _parseMp4Duration(buffer) {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);
  for (let i = 0; i < bytes.length - 28; i++) {
    if (bytes[i]!==0x6d || bytes[i+1]!==0x76 || bytes[i+2]!==0x68 || bytes[i+3]!==0x64) continue;
    const version = bytes[i + 4];
    if (version === 0) {
      const timescale = view.getUint32(i + 16, false);
      const duration  = view.getUint32(i + 20, false);
      if (timescale > 0 && duration > 0) return Math.round(duration / timescale);
    } else if (version === 1) {
      const timescale = view.getUint32(i + 24, false);
      const duration  = view.getUint32(i + 32, false); // 下位32bitのみ（〜1193時間で十分）
      if (timescale > 0 && duration > 0) return Math.round(duration / timescale);
    }
  }
  return 0;
}

// ── ファイル末尾→先頭の順で 128KB を取得し MP4 duration をパース ──
// moov ボックスが末尾にある場合（多くのレコーディング系アプリ）は末尾 128KB で取得できる
// web-optimized（fast-start）なら先頭 128KB に含まれる
async function _fetchDurationFromMp4(fileId) {
  const CHUNK = 524288; // 512KB（moovボックスが大きいファイルに対応）
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const hdrs = { Authorization: `Bearer ${_token}` };
  // ① 末尾 128KB
  try {
    const res = await fetch(url, { headers: { ...hdrs, Range: `bytes=-${CHUNK}` } });
    if (res.ok || res.status === 206) {
      const dur = _parseMp4Duration(await res.arrayBuffer());
      if (dur > 0) return dur;
    }
  } catch(e) { /* fall through */ }
  // ② 先頭 128KB
  try {
    const res = await fetch(url, { headers: { ...hdrs, Range: `bytes=0-${CHUNK - 1}` } });
    if (res.ok || res.status === 206) {
      return _parseMp4Duration(await res.arrayBuffer());
    }
  } catch(e) { /* fall through */ }
  return 0;
}

// ── 既存GDrive動画のduration補完（50件ずつbatch）──
export async function fetchMissingGdDurations() {
  // キャッシュからトークンを復元。なければ再接続を促して終了
  if (!_token) {
    const cached = _loadCachedToken();
    if (cached) { _token = cached; _setAuthUI(true); _scheduleRefresh(); }
    else { return; }
  }
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
        if (Number(dur) > 0 && idMap[data.id]) {
          idMap[data.id].duration = Math.round(Number(dur) / 1000);
          updated++;
        }
      });
    } catch(e) { /* batch error, continue */ }
  }
  // Drive API で取得できなかったものを MP4 バイナリ解析で補完
  const stillMissing = Object.entries(idMap).filter(([, v]) => !v.duration);
  let mp4Updated = 0;
  // 4件ずつ並列（128KB × 4 ≒ 512KB/バッチ）
  for (let i = 0; i < stillMissing.length; i += 4) {
    const batch = stillMissing.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map(([fileId, v]) => _fetchDurationFromMp4(fileId).then(dur => ({ dur, v })))
    );
    results.forEach(r => {
      if (r.status !== 'fulfilled' || !r.value?.dur) return;
      r.value.v.duration = r.value.dur;
      mp4Updated++;
      updated++;
    });
  }

  if (updated > 0) {
    window.debounceSave?.();
    const mp4Msg = mp4Updated > 0 ? `（うちMP4解析: ${mp4Updated}本）` : '';
    window.toast?.(`✅ ${updated}本のGDrive動画の長さを取得しました${mp4Msg}`);
    window.AF?.();
  }
}
window.fetchMissingGdDurations = fetchMissingGdDurations;

// ── GDriveサムネをDOMに直接差し込む（AF()後に呼ぶ）──
// Drive API の thumbnailLink は null になるケースが多いため使わない
// drive.google.com/thumbnail?id=X&sz=w320 を /api/thumb-proxy 経由で直接取得する
let _fetchMissingDone = false; // セッション内で1回だけ永続化補完を走らせるフラグ

window.loadGdriveCardThumbs = async function() {
  if (!_token) {
    const cached = _loadCachedToken();
    if (cached) { _token = cached; }
    else { return; }
  }

  // 初回のみ: 既取り込み済みで thumb が空／デフォルトのものを一括補完（永続化）
  if (!_fetchMissingDone) {
    _fetchMissingDone = true;
    fetchMissingGdThumbnails(); // バックグラウンドで実行（awaitしない）
  }

  // naturalWidth === 0 のカードのみ対象（表示できているものはスキップ）
  const toFetch = new Map();
  const _needsThumb = img => !img || img.naturalWidth === 0 || !img.src;
  const addImg = (img, vid) => {
    const fileId = vid.replace(/^gd-/, '');
    if (!fileId) return;
    if (!toFetch.has(fileId)) toFetch.set(fileId, []);
    toFetch.get(fileId).push({ img, vid });
  };

  document.querySelectorAll('.card[data-plat="gd"]').forEach(card => {
    const img = card.querySelector('.card-thumb > img');
    if (!_needsThumb(img)) return;
    addImg(img, card.id.replace('card-', ''));
  });
  document.querySelectorAll('.org-tr[id^="org-row-gd-"] img.org-thumb').forEach(img => {
    if (!_needsThumb(img)) return;
    const row = img.closest('.org-tr');
    if (row) addImg(img, row.id.replace('org-row-', ''));
  });
  // unified-filter や任意の場所の GDrive サムネ（data-gdid 属性で識別）
  document.querySelectorAll('img[data-gdid]').forEach(img => {
    if (!_needsThumb(img)) return;
    addImg(img, 'gd-' + img.dataset.gdid);
  });

  if (!toFetch.size) return;

  await Promise.allSettled([...toFetch.entries()].map(async ([fileId, targets]) => {
    try {
      // ① Drive API で hasThumbnail + thumbnailLink を同時取得
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=hasThumbnail,thumbnailLink`,
        { headers: { Authorization: `Bearer ${_token}` } }
      );
      if (!metaRes.ok) return;
      const meta = await metaRes.json();

      if (!meta.thumbnailLink) {
        if (meta.hasThumbnail) {
          // hasThumbnail=true なのに link=null → Workerプロキシでdrive.google.com/thumbnailを取得
          const directUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w320`;
          const pr = `/api/thumb-proxy?url=${encodeURIComponent(directUrl)}&token=${encodeURIComponent(_token)}`;
          try {
            const ir = await fetch(pr);
            if (ir.ok) {
              const ct = ir.headers.get('content-type') || '';
              if (ct.startsWith('image/')) {
                const blob = await ir.blob();
                if (blob.size > 500) {
                  const objUrl = URL.createObjectURL(blob);
                  targets.forEach(({ img }) => { img.style.display = ''; img.src = objUrl; });
                  const vid = targets[0]?.vid;
                  const vObj = (window.videos||[]).find(v => v.id===vid || v.id==='gd-'+fileId);
                  if (vObj) { vObj.thumb = directUrl; window.saveUserData?.(); }
                  return;
                }
              }
            }
          } catch(e) {}
        }
        // hasThumbnail=false → Driveで直接再生が必要（vpanelの↗GDriveボタン参照）
        return;
      }

      // ② thumbnailLink (lh3.googleusercontent.com) はCORSブロックのためproxy経由で取得
      const proxyUrl = `/api/thumb-proxy?url=${encodeURIComponent(meta.thumbnailLink)}&token=${encodeURIComponent(_token)}`;
      const imgRes = await fetch(proxyUrl);
      if (!imgRes.ok) return;
      const blob = await imgRes.blob();
      if (blob.size < 500) return;

      const objUrl = URL.createObjectURL(blob);
      targets.forEach(({ img }) => { img.style.display = ''; img.src = objUrl; });
    } catch(e) {}
  }));
};

async function scanFolder(folderId, folderName, depth) {
  const files   = await listFolder(folderId);
  const videos  = [];
  const folders = [];
  for (const raw of files) {
    const f = _gdResolveShortcut(raw);
    if (f.mimeType === GD_FOLDER_MIME) {
      if (depth < 3) folders.push(await scanFolder(f.id, f.name, depth + 1));
    } else if (_isVideoFile(f)) {
      const dur = f.videoMediaMetadata?.durationMillis;
      videos.push({ id: f.id, name: f.name, duration: dur ? Math.round(Number(dur) / 1000) : 0, thumbnailLink: f.thumbnailLink || '' });
    }
  }
  return { id: folderId, name: folderName, videos, folders };
}

// ── ユーティリティ ──
// 既知の動画/メディア拡張子のみ除去する。以前は /\.[^.]+$/ で「最後のドット以降」を
// 一律に切っていたため、"03.バタフライガードに対するスマッシュパス" のように
// 番号のあとにドット区切りの日本語タイトルが続き拡張子が無いファイルで、タイトル本体を
// 拡張子と誤認して丸ごと削除し「03」だけになる不具合があった。拡張子の白名簿方式に変更。
const _VIDEO_EXT_RE = /\.(mp4|m4v|mov|avi|mkv|webm|wmv|flv|mpe?g|3gp|3g2|ts|m2ts|mts|ogv|qt|vob)$/i;
function _stripVideoExt(name) { return String(name == null ? '' : name).replace(_VIDEO_EXT_RE, ''); }

function cleanTitle(filename, stripSuffix) {
  let t = _stripVideoExt(filename);   // 既知の動画拡張子のみ除去（先頭番号・ドット区切りタイトルは保持）
  const s = stripSuffix?.trim();
  if (s) {
    const idx = t.indexOf(s);
    if (idx === 0) {
      // 先頭にある共通文字列（DVDリップの通し番号など）は、それだけを取り除く。
      // 後ろは題名そのものなので残す。区切り記号が頭に残るのでそれも落とす。
      const rest = t.slice(s.length).replace(/^[\s_.\-–—:：]+/, '');
      if (rest) t = rest;   // 題名が丸ごと消える指定は無視する（無題を作らない）
    } else if (idx > 0) {
      // 途中〜末尾にある共通文字列は、そこから後ろをまとめて落とす
      //（「技名 - シリーズ名」の後半を捨てる従来の使い方）
      t = t.slice(0, idx);
    }
  }
  return t.trim();
}

function isQRFile(filename) {
  return filename.includes('クイックレビュー') || filename.toLowerCase().includes('quick review');
}

function detectCommonSuffix(names) {
  const titles = names.map(n => _stripVideoExt(n).replace(/^\d+\.\s*/, ''));
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

// 全ファイルの頭に付いている共通文字列（DVDリップの通し番号など）を探す。
// 上の detectCommonSuffix は末尾しか見ないため、
// 「4497857413218-05-25-Shoulder Walk」のような接頭辞は拾えなかった。
// 判定は cleanTitle が見る文字列（拡張子だけ落としたもの）と揃える。
// 揃えないと、返した文字列が題名の先頭に無く「途中一致＝以降を全部落とす」と
// 誤って扱われ、題名が消えてしまう。
function detectCommonPrefix(names) {
  const titles = names.map(n => _stripVideoExt(n));
  if (titles.length < 3) return '';
  const ref = titles[0];
  let len = 0;
  for (let i = 0; i < ref.length; i++) {
    if (!titles.every(t => t[i] === ref[i])) break;
    len = i + 1;
  }
  // 数字や単語の途中で切らない。共通部分の最後の区切り記号までに丸める。
  //（丸めないと「…3218-05」と「…3218-06」の共通部分が「…3218-0」になり、
  //   題名が「5-25-Shoulder Walk」のように数字の途中から始まってしまう）
  const m = ref.slice(0, len).match(/^.*[\s_.\-–—:：]/);
  len = m ? m[0].length : len;
  if (len < 8) return '';
  // 取り除いたあとに題名が残らない・短すぎるものは自動では出さない
  const ok = titles.every(t => t.slice(len).replace(/^[\s_.\-–—:：]+/, '').trim().length >= 3);
  return ok ? ref.slice(0, len) : '';
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
  _pick.clear();
  _stripTouched = false;
  const p = document.getElementById('gd-picker');
  if (p) p.style.display = '';
  window.itagMount?.('gdTagMount', { perVideo: false });
  await _browserRender();
}

// ── 選択状態（フォルダを移動しても保持する）──
// 移動のたびに消すと「単独ファイル数本＋フォルダ1つ」のような選び方ができない。
// key はDriveのfileId、値は取り込みに必要なぶんだけ。
const _pick = new Map();
const _folderCount = new Map();   // 走査済みフォルダの本数（分かったものだけ出す）
const _folderScan  = new Map();   // 走査済みフォルダの中身 [{id, folderName}]

// フォルダのチェック状態。走査していないフォルダは中身が分からないので 'none' 扱い。
// （一覧の描画で毎回走査すると、フォルダの数だけDriveを叩くことになり重すぎる）
function _folderState(id) {
  const list = _folderScan.get(id);
  if (list && list.length) {
    const n = list.filter(x => _pick.has(x.id)).length;
    return n === 0 ? 'none' : n === list.length ? 'all' : 'part';
  }
  // 走査していなくても、そのフォルダの下で選んだ動画があれば「半端」と分かる。
  // 選んだ時点の階層を覚えているので、Driveを叩き直さずに判定できる。
  for (const v of _pick.values()) if (v.ancestors?.includes(id)) return 'part';
  return 'none';
}
let   _stripTouched = false;      // 除去文字列を手で触ったか（触っていれば自動検出で上書きしない）

// 選んだ動画から共通文字列を検出して除去欄に入れる。
// 手で入れた値は尊重する（勝手に書き換えると、直したそばから戻されて操作不能になる）。
function _autoDetectStrip() {
  const el = document.getElementById('gd-strip-suffix');
  if (!el || _stripTouched) return;
  const names = [..._pick.values()].map(v => v.name);
  el.value = names.length >= 3
    ? (detectCommonSuffix(names) || detectCommonPrefix(names))
    : '';
}

function _gdEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function _folderItemHtml(f, isFav, state, count) {
  const star = isFav ? '★' : '☆';
  const starColor = isFav ? 'var(--gold)' : 'var(--text3)';
  const bg = isFav ? 'background:var(--gold-soft)' : '';
  return `<div class="gdp-row" data-kind="folder" data-id="${_gdEsc(f.id)}" tabindex="0" style="${bg}">
    <input type="checkbox" class="gdp-cb" data-kind="folder" data-id="${_gdEsc(f.id)}"
      ${state === 'all' ? 'checked' : ''}>
    <span class="ico">📁</span>
    <span class="nm">${_gdEsc(f.name)}</span>
    <span class="meta">${count != null ? count + '本' : ''}</span>
    <button class="gdp-x" data-fav="${_gdEsc(f.id)}" title="${isFav ? 'お気に入りから外す' : 'お気に入りに追加'}"
      style="color:${starColor};font-size:15px">${star}</button>
    <span class="chev">›</span>
  </div>`;
}

function _videoItemHtml(v) {
  const done = (window.videos || []).some(x => x.id === 'gd-' + v.id);
  const mins = v.duration ? `${Math.round(v.duration / 60)}分` : '';
  return `<div class="gdp-row${done ? ' done' : ''}" data-kind="video" data-id="${_gdEsc(v.id)}"
      tabindex="${done ? -1 : 0}">
    <input type="checkbox" class="gdp-cb" data-kind="video" data-id="${_gdEsc(v.id)}"
      ${done ? 'disabled' : ''} ${_pick.has(v.id) ? 'checked' : ''}>
    <span class="ico">🎬</span>
    <span class="nm">${_gdEsc(v.name)}</span>
    <span class="meta">${done ? '取込済' : mins}</span>
    <span class="chev"></span>
  </div>`;
}

// ── 選択の操作 ───────────────────────────────────────────
function _pickAdd(v, folderName, ancestors) {
  if ((window.videos || []).some(x => x.id === 'gd-' + v.id)) return;   // 取込済は入れない
  _pick.set(v.id, { id: v.id, name: v.name, duration: v.duration || 0,
                    thumbnailLink: v.thumbnailLink || '', folderName,
                    ancestors: ancestors || _curAncestors() });
}

// 今いる場所の祖先フォルダid（ルートから現在地まで）
function _curAncestors() {
  return [..._browserStack.map(x => x.id), _browserCurrentId];
}

export function gdClearPick() {
  _pick.clear();
  _browserRender();
  window.toast?.('選択を解除しました');
}

export function gdToggleDrawer() {
  const d = document.getElementById('gd-drawer');
  if (!d) return;
  const open = d.style.display === 'none';
  d.style.display = open ? '' : 'none';
  const b = document.getElementById('gd-drawer-btn');
  if (b) b.textContent = open ? '閉じる' : '内訳';
  if (open) gdRenderDrawer();
}

export function gdToggleOpts() {
  const body = document.getElementById('gd-optsbody');
  const hd   = document.getElementById('gd-optshd');
  if (!body || !hd) return;
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  hd.setAttribute('aria-expanded', String(open));
}

// 手入力を尊重するため、除去欄は「触ったら自動検出しない」に切り替える
export function gdStripTouched() { _stripTouched = true; gdRenderDrawer(); gdOptsSummary(); }

export function gdOptsSummary() {
  const any = ['gd-channel', 'gd-playlist', 'gd-strip-suffix']
    .some(id => (document.getElementById(id)?.value || '').trim());
  const el = document.getElementById('gd-optsum');
  if (el) el.textContent = any ? '変更あり' : '既定のまま';
}

// 内訳。取り込まれる「実際のタイトル」を出すので、除去文字列の効きもここで確認できる。
export function gdRenderDrawer() {
  const d = document.getElementById('gd-drawer');
  if (!d || d.style.display === 'none') return;
  const strip = document.getElementById('gd-strip-suffix')?.value || '';
  if (!_pick.size) { d.innerHTML = ''; return; }
  d.innerHTML = [..._pick.values()].map(v => `
    <div class="gdp-drow">
      <span style="color:var(--text3);flex-shrink:0">📁 ${_gdEsc(v.folderName)} /</span>
      <span class="n">${_gdEsc(cleanTitle(v.name, strip))}</span>
      <button class="gdp-x" data-unpick="${_gdEsc(v.id)}" title="選択から外す">×</button>
    </div>`).join('');
  d.querySelectorAll('[data-unpick]').forEach(b =>
    b.addEventListener('click', () => { _pick.delete(b.dataset.unpick); _browserRender(); }));
}

function _renderSelBar() {
  const n = _pick.size;
  const bar = document.getElementById('gd-selbar');
  const btn = document.getElementById('gd-import-btn');
  if (bar) bar.style.display = n ? '' : 'none';
  if (!n) {
    const d = document.getElementById('gd-drawer');
    if (d) d.style.display = 'none';
    const db = document.getElementById('gd-drawer-btn');
    if (db) db.textContent = '内訳';
    if (btn) { btn.disabled = true; btn.textContent = '取り込む'; }
    return;
  }
  _autoDetectStrip();
  const mins = Math.round([..._pick.values()].reduce((s, v) => s + (v.duration || 0), 0) / 60);
  const cnt = document.getElementById('gd-selcount');
  const sub = document.getElementById('gd-selsub');
  if (cnt) cnt.textContent = `選択中 ${n}本`;
  if (sub) sub.textContent = mins >= 60 ? `合計 ${Math.floor(mins / 60)}時間${mins % 60}分` : `合計 ${mins}分`;
  if (btn) { btn.disabled = false; btn.textContent = `${n}本を取り込む`; }
  gdRenderDrawer();
}

// フォルダ丸ごとの選択。中身はここで初めて走査する（一覧の描画では走査しない）。
async function _togglePickFolder(f) {
  const cb = document.querySelector(`.gdp-cb[data-kind="folder"][data-id="${CSS.escape(f.id)}"]`);
  if (cb) { cb.disabled = true; }
  try {
    const tree = await scanFolder(f.id, f.name, 0);
    const list = [];
    (function walk(node) {
      node.videos.forEach(v => list.push({ v, folderName: node.name }));
      node.folders.forEach(walk);
    })(tree);
    _folderCount.set(f.id, list.length);
    const usable = list.filter(x => !(window.videos || []).some(y => y.id === 'gd-' + x.v.id));
    // 取り込み可能なものだけ覚える。取込済みを含めると永遠に'all'にならない
    _folderScan.set(f.id, usable.map(x => ({ id: x.v.id, folderName: x.folderName })));
    const allOn = usable.length > 0 && usable.every(x => _pick.has(x.v.id));
    if (allOn) usable.forEach(x => _pick.delete(x.v.id));
    else       usable.forEach(x => _pickAdd(x.v, x.folderName, _curAncestors().concat(f.id)));
    if (!usable.length) window.toast?.('このフォルダに取り込める動画がありません');
  } catch (e) {
    console.error('folder pick error:', e);
    window.toast?.('フォルダの読み込みに失敗しました');
  } finally {
    if (cb) cb.disabled = false;
    _browserRender();
  }
}

async function _browserRender() {
  const listEl  = document.getElementById('gd-browser-list');
  const crumbEl = document.getElementById('gd-crumbs');
  const upBtn   = document.getElementById('gd-up');

  // パンくず（ルート → 現在地）
  if (crumbEl) {
    const crumbs = [..._browserStack, { id: _browserCurrentId, name: _browserCurrentName }];
    crumbEl.innerHTML = crumbs.map((c, i) =>
      `${i ? '<span class="gdp-sep">›</span>' : ''}<button class="gdp-crumb" data-jump="${i}"
        ${i === crumbs.length - 1 ? 'aria-current="page"' : ''}>${_gdEsc(c.name)}</button>`).join('');
    crumbEl.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.jump);
      if (i >= _browserStack.length) return;          // 現在地は押しても何もしない
      gdBrowserJump(i);
    }));
  }
  if (upBtn) upBtn.disabled = _browserStack.length === 0;

  if (listEl) listEl.innerHTML = '<div class="gdp-empty">読み込み中...</div>';
  _renderSelBar();

  try {
    // ショートカットを実体に直してから振り分ける。スキャンと同じ判定にしておかないと、
    // 一覧に出ないのに取り込まれる（逆も）といった食い違いが起きる。
    const files   = (await listFolder(_browserCurrentId)).map(_gdResolveShortcut);
    const folders = files.filter(f => f.mimeType === GD_FOLDER_MIME);
    const videos  = files.filter(_isVideoFile).map(f => ({
      id: f.id, name: f.name,
      duration: f.videoMediaMetadata?.durationMillis
        ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000) : 0,
      thumbnailLink: f.thumbnailLink || '',
    }));

    const favs   = _loadFavs();
    const favIds = new Set(favs.map(f => f.id));
    let html = '';

    if (_browserStack.length === 0 && favs.length > 0) {
      html += `<div class="gdp-grouphd" style="color:var(--gold)">★ お気に入り</div>`;
      html += favs.map(f => _folderItemHtml(f, true, _folderState(f.id), _folderCount.get(f.id))).join('');
      html += `<div class="gdp-grouphd">全フォルダ</div>`;
    }

    if (!folders.length && !videos.length) {
      html += '<div class="gdp-empty">このフォルダは空です</div>';
    } else {
      html += folders.map(f => _folderItemHtml(f, favIds.has(f.id), _folderState(f.id), _folderCount.get(f.id))).join('');
      if (videos.length) {
        if (folders.length) html += '<div class="gdp-grouphd">このフォルダの動画</div>';
        html += videos.map(_videoItemHtml).join('');
      }
    }
    if (listEl) {
      listEl.innerHTML = html;
      // 一部だけ選んだフォルダは「半端な状態」で見せる（属性では表現できない）
      listEl.querySelectorAll('.gdp-cb[data-kind="folder"]').forEach(cb => {
        if (_folderState(cb.dataset.id) === 'part') cb.indeterminate = true;
      });
      _bindRows(listEl, folders, videos);
    }
  } catch(e) {
    console.error('browse error:', e);
    if (listEl) listEl.innerHTML = '<div class="gdp-empty" style="color:#e74c3c">読み込みに失敗しました</div>';
  }
}

function _bindRows(listEl, folders, videos) {
  const byId = new Map([...folders, ...videos].map(x => [x.id, x]));

  listEl.querySelectorAll('.gdp-row').forEach(row => {
    const kind = row.dataset.kind, id = row.dataset.id;
    const item = byId.get(id) || { id, name: row.querySelector('.nm')?.textContent || '' };
    const cb   = row.querySelector('.gdp-cb');

    if (kind === 'folder') {
      // 行＝中に入る、チェック＝中身を丸ごと選ぶ
      const enter = () => gdBrowserEnter(item.id, item.name);
      row.addEventListener('click', e => {
        if (e.target.closest('.gdp-cb') || e.target.closest('[data-fav]')) return;
        enter();
      });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
      });
      cb?.addEventListener('click', e => { e.stopPropagation(); _togglePickFolder(item); });
      row.querySelector('[data-fav]')?.addEventListener('click', e => {
        e.stopPropagation();
        gdFavToggle(item.id, item.name);
      });
    } else {
      if (cb?.disabled) return;                       // 取込済
      const flip = () => {
        if (_pick.has(id)) _pick.delete(id);
        else _pickAdd(item, _browserCurrentName);
        _browserRender();
      };
      row.addEventListener('click', e => { if (!e.target.closest('.gdp-cb')) flip(); });
      cb?.addEventListener('click', e => { e.stopPropagation(); flip(); });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      });
    }
  });
}

export function gdBrowserEnter(folderId, folderName) {
  _browserStack.push({ id: _browserCurrentId, name: _browserCurrentName });
  _browserCurrentId   = folderId;
  _browserCurrentName = folderName;
  _browserRender();
}

export function gdUp() {
  if (!_browserStack.length) return;
  const prev = _browserStack.pop();
  _browserCurrentId   = prev.id;
  _browserCurrentName = prev.name;
  _browserRender();
}

export function gdBrowserJump(index) {
  const target = _browserStack[index];
  if (!target) return;
  _browserStack       = _browserStack.slice(0, index);
  _browserCurrentId   = target.id;
  _browserCurrentName = target.name;
  _browserRender();
}

// 選んだものを取り込む。ここから先は従来と同じ経路を通す
// （選択の見た目だけ変えて、登録処理そのものは作り変えない）。
export function gdDoImport() {
  if (!_pick.size) return;
  // フォルダごとにまとめると、プレイリスト名がフォルダ単位で入る（従来と同じ挙動）
  const byFolder = new Map();
  for (const v of _pick.values()) {
    if (!byFolder.has(v.folderName)) byFolder.set(v.folderName, []);
    byFolder.get(v.folderName).push(v);
  }
  _scannedTree = {
    id: 'picked', name: _browserCurrentName, videos: [],
    folders: [...byFolder].map(([name, vids]) => ({ id: 'g-' + name, name, videos: vids, folders: [] })),
  };
  gdRenderFileList();          // 隠し領域に従来どおりのチェックボックスを展開する
  gdImport();                  // 実際の登録は既存の処理をそのまま使う
  _pick.clear();
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
      ...(window.itagGetTagsFor
        ? window.itagGetTagsFor(newId, cb.dataset.title, cb.dataset.folder || playlist, channel)
        : (window.autoTagFromTitle ? window.autoTagFromTitle(cb.dataset.title) : { tb: [], cat: [], pos: [], tags: [] })),
    };
    window.videos.push(v);
    newIds.push(newId);
    added++;
    const tl = cb.dataset.thumb;
    if (tl) v.thumb = tl; // thumbnailLinkを直接保存（Firebase不要）
    else thumbJobs.push({ video: v, fileId }); // null→後でトリガー
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


// ── 既存GDrive動画のサムネイル補完（Firebase不要・thumbnailLink直接保存）──
export async function fetchMissingGdThumbnails() {
  if (!_token) {
    const cached = _loadCachedToken();
    if (cached) { _token = cached; } else { return; }
  }
  // v.thumbが空・firebasestorage・lh3（期限切れ）のものが対象
  const missing = (window.videos || []).filter(v =>
    v.pt === 'gdrive' && v.id &&
    (!v.thumb || v.thumb.includes('firebasestorage') || v.thumb.includes('lh3.googleusercontent.com'))
  );
  if (!missing.length) return;

  let done = 0;

  for (let i = 0; i < missing.length; i += 10) {
    const batch = missing.slice(i, i + 10);
    await Promise.allSettled(batch.map(async (v) => {
      const fileId = v.id.replace(/^gd-/, '');
      try {
        const data = await driveGet(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`);
        if (data.thumbnailLink) {
          v.thumb = `https://drive.google.com/thumbnail?id=${fileId}&sz=w320`;
          done++;
        }
      } catch(e) { /* skip */ }
    }));
  }

  if (done > 0) {
    await window.saveUserData?.();
    window.AF?.();
  }

  // thumbnailLink=null → Googleにサムネなし。できることはない
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
