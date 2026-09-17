/* ══════════════════════════════════════════════════════════════════════
   端末の動画を Google Drive にアップロードして取り込む

   Googleフォトの動画は「リンクとして登録」できない。
   Photos Library API の読み取りスコープは2025年3月で廃止され、後継の
   Picker API が返す URL は60分で失効し、セッションが切れると選んだ
   アイテム自体に二度とアクセスできなくなる。つまり恒久URLが作れない。
   → 取り込み時に実体を Drive にコピーしてしまえば、あとは既存の
     gdrive 動画（pt:'gdrive' / id:'gd-<fileId>'）と完全に同じ扱いになる。

   スマホの選択画面からは Googleフォト／カメラロールの動画がそのまま選べるので、
   Photos 専用の連携は要らない。<input type="file" accept="video/*"> で足りる。

   ── データ層への影響 ──
   ・window.videos に push するだけ。既存要素の書き換え・削除は一切しない。
   ・同じ id が既にあれば push しない（重複登録の防止）。
   ・保存は既存の saveUserData() を通す（未読込時の上書き防止ガードはそちらが持つ）。
   ・localStorage は wk_gdu_quality（画質プリセットの記憶）のみ。他キーには触らない。
   ・Drive 側は「新規ファイルの作成」だけ。既存ファイルの更新・削除はしない。
   ══════════════════════════════════════════════════════════════════════ */

import { ensureDriveToken } from './gdrive.js';

const GD_FOLDER_MIME = 'application/vnd.google-apps.folder';
const Q_KEY = 'wk_gdu_quality';

// 画質プリセット。short = 短辺の上限px（0なら変換しない）、vb = 映像ビットレート(bps)
const PRESETS = {
  orig: { label: 'そのまま（変換しない）', short: 0,    vb: 0 },
  hi:   { label: '高画質 1080p',           short: 1080, vb: 4_000_000 },
  std:  { label: '標準 720p',              short: 720,  vb: 2_000_000 },
  low:  { label: '軽量 480p',              short: 480,  vb: 1_000_000 },
};
const AUDIO_BPS = 128_000;
const MAX_FPS   = 30;

// ── 状態 ──
let _items   = [];          // { file, title, size, duration, phase, prog, note, fileId }
let _dest    = null;        // { id, name } アップロード先フォルダ（毎回選ぶ）
let _quality = 'std';
let _running = false;
let _abort   = false;
let _curConv = null;        // 実行中の Conversion（中止用）
let _curXhr  = null;        // 実行中のアップロード（中止用）
let _mb      = null;        // mediabunny モジュール（遅延読込）
let _canEnc  = null;        // 変換できる環境か（null=未判定）

// フォルダピッカーの状態
let _fpStack = [];
let _fpId    = 'root';
let _fpName  = 'マイドライブ';

// ════════════════════════════════════════════════════════════
// ユーティリティ
// ════════════════════════════════════════════════════════════
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function _mb2(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  const m = bytes / (1024 * 1024);
  return m < 1000 ? m.toFixed(m < 10 ? 1 : 0) + 'MB' : (m / 1024).toFixed(1) + 'GB';
}
function _hhmm(sec) {
  if (!sec) return '';
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
           : `${m}:${String(r).padStart(2,'0')}`;
}
function _even(n) { return Math.max(2, Math.round(n / 2) * 2); }
function _stripExt(name) { return String(name || '').replace(/\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv|mpg|mpeg|3gp|ogv|ts|m2ts)$/i, ''); }
function _el(id) { return document.getElementById(id); }

// 変換後サイズの見積り。実際は素材次第で上下するので「目安」として出す。
function _estimate(item, qkey) {
  const p = PRESETS[qkey];
  if (!p || !p.vb) return item.size;
  if (!item.duration) return 0;                 // 尺が取れないと見積れない
  const est = (p.vb + AUDIO_BPS) * item.duration / 8;
  return Math.min(est, item.size);              // 元より大きくなるなら元のまま扱い
}

// ════════════════════════════════════════════════════════════
// mediabunny（変換エンジン）の遅延読込
// ════════════════════════════════════════════════════════════
async function _loadMB() {
  if (_mb) return _mb;
  _mb = await import('./vendor/mediabunny.min.js');
  return _mb;
}

// この端末で H.264 に変換できるか。できないなら圧縮UIを出さない（押せるのに失敗するのが一番困る）
async function _checkEncodable() {
  if (_canEnc !== null) return _canEnc;
  if (typeof window.VideoEncoder === 'undefined') { _canEnc = false; return false; }
  try {
    const MB = await _loadMB();
    _canEnc = await MB.canEncodeVideo('avc', { width: 1280, height: 720 });
  } catch (e) {
    console.warn('[gdu] encode check failed', e);
    _canEnc = false;
  }
  return _canEnc;
}

// ════════════════════════════════════════════════════════════
// 画面
// ════════════════════════════════════════════════════════════
export async function gduOpen() {
  // 実行中に開き直したときに設定画面へ戻すと、進行中の処理が見えなくなる
  if (_running) { _showStage('run'); _renderRun(); return; }
  _abort = false;
  _items = [];
  _dest  = null;
  try { const q = localStorage.getItem(Q_KEY); if (q && PRESETS[q]) _quality = q; } catch (e) {}
  _showStage('setup');
  _render();
  // 変換可否は非同期に判定して、決まってから画質欄を描き直す
  _checkEncodable().then(() => _renderQuality());
}

function _showStage(stage) {
  const map = { setup: 'gdu-setup', run: 'gdu-run', fp: 'gdu-folderpick' };
  for (const [k, id] of Object.entries(map)) {
    const el = _el(id);
    if (el) el.style.display = (k === stage) ? 'flex' : 'none';
  }
}

export function gduPick() {
  if (_running) return;
  _el('gdu-file-input')?.click();
}

export async function gduFilesChosen(inputEl) {
  const files = [...(inputEl?.files || [])];
  inputEl.value = '';                     // 同じファイルを選び直せるように毎回クリア
  if (!files.length) return;

  for (const f of files) {
    // 同じ名前＋同じサイズは二重選択とみなす（連打での二重アップロードを防ぐ）
    if (_items.some(it => it.file.name === f.name && it.size === f.size)) continue;
    _items.push({
      file: f, title: _stripExt(f.name), size: f.size,
      duration: 0, phase: 'wait', prog: 0, note: '', fileId: '',
    });
  }
  _render();

  // 尺はメタデータだけ読めば分かる。見積り表示に使う。
  for (const it of _items) {
    if (it.duration) continue;
    it.duration = await _readDuration(it.file);
    _render();
  }
}

function _readDuration(file) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (d) => { try { URL.revokeObjectURL(url); } catch (e) {} resolve(d); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration) : 0);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 15000);     // 読めない形式で永久に待たない
    v.src = url;
  });
}

export function gduRemove(idx) {
  if (_running) return;
  _items.splice(idx, 1);
  _render();
}

export function gduSetQ(key) {
  if (_running || !PRESETS[key]) return;
  _quality = key;
  try { localStorage.setItem(Q_KEY, key); } catch (e) {}
  _render();
}

function _render() {
  _renderList();
  _renderDest();
  _renderQuality();
  _renderFoot();
}

function _renderList() {
  const box = _el('gdu-list');
  if (!box) return;
  if (!_items.length) {
    box.innerHTML = `<div class="gdp-empty">まだ動画を選んでいません</div>`;
    return;
  }
  box.innerHTML = _items.map((it, i) => {
    const est = _estimate(it, _quality);
    const shrink = (_quality !== 'orig' && est && est < it.size)
      ? ` → <span style="color:var(--green);font-weight:700">${_mb2(est)}</span>` : '';
    const meta = `${_mb2(it.size)}${shrink}${it.duration ? ' ・ ' + _hhmm(it.duration) : ''}`;
    return `<div class="gdp-row" style="cursor:default">
      <span class="ico">🎬</span>
      <span class="nm" title="${_esc(it.file.name)}">${_esc(it.title)}</span>
      <span class="meta">${meta}</span>
      <button class="gdp-x" onclick="gduRemove(${i})" aria-label="削除">×</button>
    </div>`;
  }).join('');
}

function _renderDest() {
  const el = _el('gdu-dest');
  if (!el) return;
  el.textContent = _dest ? _dest.name : '未選択';
  el.style.color = _dest ? 'var(--text)' : 'var(--text3)';
}

function _renderQuality() {
  const box = _el('gdu-quality');
  if (!box) return;
  const total = _items.reduce((s, it) => s + it.size, 0);
  const rows = Object.entries(PRESETS).map(([k, p]) => {
    const disabled = (k !== 'orig' && _canEnc === false);
    const sum = _items.reduce((s, it) => s + (_estimate(it, k) || it.size), 0);
    const hint = _items.length ? `合計 約${_mb2(sum)}` : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:7px 4px;cursor:${disabled?'default':'pointer'};opacity:${disabled?.4:1}">
      <input type="radio" name="gdu-q" value="${k}" ${_quality===k?'checked':''} ${disabled?'disabled':''}
        onchange="gduSetQ('${k}')" style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0">
      <span style="flex:1;font-size:12.5px;color:var(--text)">${_esc(p.label)}</span>
      <span style="font-size:11px;color:var(--text3);font-variant-numeric:tabular-nums">${hint}</span>
    </label>`;
  }).join('');
  const warn = _canEnc === false
    ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.5">このブラウザは動画の変換に対応していないため、そのままアップロードします（iPhoneはiOS 26以降で対応）</div>`
    : `<div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.5">サイズは目安です。元の動画はそのまま端末に残ります</div>`;
  box.innerHTML = rows + warn;
  const t = _el('gdu-qsum');
  if (t) t.textContent = _items.length ? `元 約${_mb2(total)}` : '';
}

function _renderFoot() {
  const btn = _el('gdu-start');
  if (!btn) return;
  const ok = _items.length > 0 && !!_dest && !_running;
  btn.disabled = !ok;
  btn.textContent = _items.length
    ? `${_items.length}本をアップロードして登録`
    : 'アップロードして登録';
}

// ════════════════════════════════════════════════════════════
// フォルダピッカー（保存先を毎回選ぶ）
// ════════════════════════════════════════════════════════════
async function _driveGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function _listFolders(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='${GD_FOLDER_MIME}' and trashed=false`);
  const out = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}`
      + `&fields=nextPageToken,files(id,name)&orderBy=name&pageSize=1000`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = await _driveGet(url, token);
    for (const f of (data.files || [])) out.push(f);
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

export async function gduOpenFolder() {
  if (_running) return;
  const token = await ensureDriveToken();
  if (!token) { window.toast?.('⚠️ Googleドライブに接続できませんでした'); return; }
  _fpStack = [];
  _fpId    = 'root';
  _fpName  = 'マイドライブ';
  _showStage('fp');
  await _fpRender();
}

export function gduCancelFolder() {
  _showStage('setup');
  _render();
}

export async function gduFolderEnter(id, name) {
  _fpStack.push({ id: _fpId, name: _fpName });
  _fpId = id; _fpName = name;
  await _fpRender();
}

export async function gduFolderUp() {
  const prev = _fpStack.pop();
  if (!prev) return;
  _fpId = prev.id; _fpName = prev.name;
  await _fpRender();
}

export async function gduFolderJump(index) {
  if (index >= _fpStack.length) return;
  const target = _fpStack[index];
  _fpStack = _fpStack.slice(0, index);
  _fpId = target.id; _fpName = target.name;
  await _fpRender();
}

export function gduChooseFolder() {
  _dest = { id: _fpId, name: _fpName };
  _showStage('setup');
  _render();
}

export async function gduNewFolder() {
  const name = window.prompt('新しいフォルダの名前', 'WAZA KIMURA');
  if (!name || !name.trim()) return;
  const token = await ensureDriveToken();
  if (!token) { window.toast?.('⚠️ Googleドライブに接続できませんでした'); return; }
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: name.trim(), mimeType: GD_FOLDER_MIME, parents: [_fpId] }),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    const f = await res.json();
    window.toast?.('📁 フォルダを作成しました');
    await gduFolderEnter(f.id, f.name);
  } catch (e) {
    console.error('[gdu] mkdir', e);
    window.toast?.('⚠️ フォルダを作成できませんでした');
  }
}

async function _fpRender() {
  const list = _el('gdu-fp-list');
  const crumbs = _el('gdu-fp-crumbs');
  const up = _el('gdu-fp-up');
  if (up) up.disabled = _fpStack.length === 0;
  if (crumbs) {
    const parts = [..._fpStack, { id: _fpId, name: _fpName }];
    crumbs.innerHTML = parts.map((p, i) => {
      const cur = i === parts.length - 1;
      return (i ? `<span class="gdp-sep">›</span>` : '')
        + `<button class="gdp-crumb" ${cur ? 'aria-current="page"' : `onclick="gduFolderJump(${i})"`}>${_esc(p.name)}</button>`;
    }).join('');
  }
  if (!list) return;
  list.innerHTML = `<div class="gdp-empty">読み込み中...</div>`;
  try {
    const token = await ensureDriveToken();
    const folders = await _listFolders(_fpId, token);
    list.innerHTML = folders.length
      ? folders.map(f => `<div class="gdp-row" onclick="gduFolderEnter('${_esc(f.id)}',this.dataset.n)" data-n="${_esc(f.name)}">
          <span class="ico">📁</span><span class="nm">${_esc(f.name)}</span><span class="chev">›</span>
        </div>`).join('')
      : `<div class="gdp-empty">この中にフォルダはありません</div>`;
  } catch (e) {
    console.error('[gdu] listFolders', e);
    list.innerHTML = `<div class="gdp-empty">フォルダ一覧を取得できませんでした</div>`;
  }
}

// ════════════════════════════════════════════════════════════
// 変換
// ════════════════════════════════════════════════════════════
// 変換できない／しない場合は null を返し、呼び出し側は元のファイルをそのまま上げる。
// 「圧縮に失敗したから取り込めません」ではなく「圧縮せずに取り込む」の方が安全側。
async function _transcode(item, onProgress) {
  const preset = PRESETS[_quality];
  if (!preset || !preset.vb) return null;
  if (!(await _checkEncodable())) return null;

  const MB = await _loadMB();
  const input = new MB.Input({ source: new MB.BlobSource(item.file), formats: MB.ALL_FORMATS });

  const vt = await input.getPrimaryVideoTrack();
  if (!vt) return null;
  // iPhoneのHEVCなど、この端末でデコードできない素材がある。その場合は変換をあきらめる。
  if (!(await vt.canDecode())) { item.note = '変換に非対応の形式のためそのまま'; return null; }

  const dw = await vt.getDisplayWidth();
  const dh = await vt.getDisplayHeight();
  const short = Math.min(dw, dh);
  const scale = (short > preset.short) ? preset.short / short : 1;

  const videoOpts = {
    codec: 'avc',
    quality: new MB.Quality({ bitrate: preset.vb }),
    forceTranscode: true,
  };
  if (scale < 1) {
    videoOpts.width  = _even(dw * scale);
    videoOpts.height = _even(dh * scale);
    videoOpts.fit    = 'fill';   // 縦横比は自前で合わせてあるので letterbox は出ない
  }
  // 60fpsは30fpsに落とす。同じビットレートならコマあたりの画質が上がる。
  try {
    const m = await vt.computeFrameRateMetrics();
    if (m?.bestGuessFrameRate > MAX_FPS + 1) videoOpts.frameRate = MAX_FPS;
  } catch (e) { /* 取れなくても致命的ではない */ }

  const hadAudio = !!(await input.getPrimaryAudioTrack());

  const output = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new MB.BufferTarget(),
  });

  const conv = await MB.Conversion.init({
    input, output,
    video: videoOpts,
    audio: { codec: 'aac', quality: new MB.Quality({ bitrate: AUDIO_BPS }) },
    showWarnings: false,
  });

  if (!conv.isValid) {
    await conv.cancel().catch(() => {});
    item.note = '変換に非対応の形式のためそのまま';
    return null;
  }
  // 音声が落ちる構成なら変換しない。字幕生成が音声に依存しているので、
  // 黙って音を捨てるくらいなら容量を取る方がまし。
  if (hadAudio && !conv.utilizedTracks.some(t => t.isAudioTrack?.() || t.type === 'audio')) {
    await conv.cancel().catch(() => {});
    item.note = '音声を変換できないためそのまま';
    return null;
  }

  conv.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)));
  _curConv = conv;
  try {
    await conv.execute();
  } finally {
    _curConv = null;
  }
  if (_abort) return null;

  const buf = output.target.buffer;
  if (!buf) return null;
  const blob = new Blob([buf], { type: 'video/mp4' });
  // 変換した結果の方が大きいなら意味がない（既に十分小さい素材）
  if (blob.size >= item.size) { item.note = '元の方が小さいためそのまま'; return null; }
  return blob;
}

// ════════════════════════════════════════════════════════════
// アップロード
// ════════════════════════════════════════════════════════════
function _xhrPut(url, blob, mime, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(headers.method || 'PUT', url, true);
    for (const [k, v] of Object.entries(headers.set || {})) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      _curXhr = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText || '{}')); }
        catch (err) { reject(new Error('応答を解釈できませんでした')); }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${String(xhr.responseText || '').slice(0, 200)}`));
      }
    };
    xhr.onerror  = () => { _curXhr = null; reject(new Error('ネットワークエラー')); };
    xhr.onabort  = () => { _curXhr = null; reject(new Error('CANCELED')); };
    _curXhr = xhr;
    xhr.send(blob);
  });
}

async function _upload(blob, name, folderId, token, onProgress) {
  const mime = blob.type || 'video/mp4';
  const meta = { name, parents: [folderId], mimeType: mime };

  // ① 再開可能セッションを開く（大きいファイルはこちらが推奨されている）
  let sessionUrl = '';
  try {
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(blob.size),
        },
        body: JSON.stringify(meta),
      });
    if (res.ok) sessionUrl = res.headers.get('Location') || res.headers.get('location') || '';
    else console.warn('[gdu] resumable start failed', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.warn('[gdu] resumable start error', e);
  }

  // セッションURLが取れたらそこへPUT（このURL自体が認可を持つのでトークン切れの影響を受けない）
  if (sessionUrl) {
    return await _xhrPut(sessionUrl, blob, mime, { method: 'PUT', set: {} }, onProgress);
  }

  // ② 取れなければ multipart で一発送信（CORSでLocationが読めない環境の保険）
  const boundary = '----wk' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--\r\n`,
  ]);
  return await _xhrPut(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    body, `multipart/related; boundary=${boundary}`,
    { method: 'POST', set: { Authorization: `Bearer ${token}` } },
    onProgress);
}

// ════════════════════════════════════════════════════════════
// 実行
// ════════════════════════════════════════════════════════════
export async function gduStart() {
  if (_running || !_items.length || !_dest) return;

  // データが読めていないうちに登録すると、保存側のガードで弾かれてアップロードが無駄になる
  if (!Array.isArray(window.videos)) {
    window.toast?.('⚠️ データの読み込みが終わっていません。少し待ってからお試しください');
    return;
  }

  _running = true;
  _abort   = false;
  _showStage('run');
  _items.forEach(it => { it.phase = 'wait'; it.prog = 0; it.fileId = ''; });
  _renderRun();

  const token = await ensureDriveToken();
  if (!token) {
    _running = false;
    window.toast?.('⚠️ Googleドライブに接続できませんでした');
    _showStage('setup');
    _render();
    return;
  }

  const channel  = (_el('gdu-channel')?.value  || '').trim();
  const playlist = (_el('gdu-playlist')?.value || '').trim();

  const added = [];
  for (const it of _items) {
    if (_abort) { it.phase = 'wait'; it.note = '中止しました'; continue; }
    try {
      // ── 変換 ──
      let blob = null;
      if (PRESETS[_quality].vb) {
        it.phase = 'conv'; it.prog = 0; _renderRun();
        blob = await _transcode(it, (p) => _tick(it, p));
      }
      if (_abort) { it.phase = 'error'; it.note = '中止しました'; _renderRun(); break; }
      if (!blob) blob = it.file;

      // ── アップロード ──
      it.phase = 'up'; it.prog = 0; _renderRun();
      const name = _stripExt(it.file.name) + '.mp4';
      const res  = await _upload(blob, blob === it.file ? it.file.name : name, _dest.id, token,
        (p) => _tick(it, p));
      if (!res?.id) throw new Error('アップロード結果にファイルIDがありません');

      it.fileId = res.id;
      it.phase  = 'done';
      it.prog   = 1;
      _renderRun();
      added.push(it);
    } catch (e) {
      const msg = String(e?.message || e);
      it.phase = 'error';
      it.note  = (msg === 'CANCELED') ? '中止しました' : msg.slice(0, 120);
      console.error('[gdu] failed', it.file.name, e);
      _renderRun();
      if (msg === 'CANCELED') break;
    }
  }

  // ── ライブラリへ登録（push のみ。既存要素には触れない）──
  let registered = 0;
  for (const it of added) {
    const newId = 'gd-' + it.fileId;
    if (window.videos.some(v => v.id === newId)) continue;
    const title = it.title || _stripExt(it.file.name);
    window.videos.push({
      id:       newId,
      pt:       'gdrive',
      title,
      channel,
      ch:       channel,
      pl:       playlist,
      thumb:    '',
      addedAt:  new Date().toISOString().slice(0, 10),
      watched:  false, fav: false, status: '未着手',
      prio:     'そのうち', shared: 0, archived: false, memo: '', ai: '',
      isQR:     false,
      duration: it.duration || 0,
      tbLocked: false,
      ...(window.itagGetTagsFor
        ? window.itagGetTagsFor(newId, title, playlist, channel)
        : (window.autoTagFromTitle ? window.autoTagFromTitle(title) : { tb: [], cat: [], pos: [], tags: [] })),
    });
    registered++;
  }

  if (registered) {
    window.AF?.();
    const ok = await window.saveUserData?.();
    if (ok === false) {
      // Drive には上がっているので、動画自体は失われていない。保存だけが見送られた状態。
      window.toast?.('⚠️ Driveには保存されましたが、ライブラリへの保存は見送られました。ページを更新してください', 8000);
    }
    // サムネはGoogle側の生成待ちなので、少し置いてから既存の補完処理に拾わせる
    setTimeout(() => { window.fetchMissingGdThumbnails?.(); }, 20000);
  }

  _running = false;
  _renderRun(registered);
}

export async function gduAbort() {
  _abort = true;
  try { await _curConv?.cancel(); } catch (e) {}
  try { _curXhr?.abort(); } catch (e) {}
  window.toast?.('中止しています...');
}

export function gduBackToSetup() {
  if (_running) return;
  _items = _items.filter(it => it.phase !== 'done');   // 成功したものは一覧から外す
  _items.forEach(it => { it.phase = 'wait'; it.prog = 0; it.note = ''; });
  _showStage('setup');
  _render();
}

// 進捗コールバックは1秒に何十回も来る。1%動いたときだけ描き直す。
function _tick(item, p) {
  const v = Math.max(0, Math.min(1, p || 0));
  if (Math.floor(v * 100) === Math.floor((item.prog || 0) * 100)) { item.prog = v; return; }
  item.prog = v;
  _renderRun();
}

function _renderRun(registered) {
  const box = _el('gdu-runlist');
  if (box) {
    box.innerHTML = _items.map(it => {
      const pct = Math.round((it.prog || 0) * 100);
      let label = '待機中', color = 'var(--text3)';
      if (it.phase === 'conv')  { label = `変換中 ${pct}%`;       color = 'var(--accent)'; }
      if (it.phase === 'up')    { label = `アップロード中 ${pct}%`; color = 'var(--accent)'; }
      if (it.phase === 'done')  { label = '完了';                 color = 'var(--green)'; }
      if (it.phase === 'error') { label = '失敗';                 color = 'var(--red, #c33)'; }
      const bar = (it.phase === 'conv' || it.phase === 'up')
        ? `<div style="height:3px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:4px">
             <div style="height:100%;width:${pct}%;background:var(--accent);transition:width .2s"></div>
           </div>` : '';
      const note = it.note
        ? `<div style="font-size:10.5px;color:var(--text3);margin-top:2px;line-height:1.4">${_esc(it.note)}</div>` : '';
      return `<div style="padding:8px 4px;border-bottom:1px solid var(--border2)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="flex:1;font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(it.title)}</span>
          <span style="font-size:11px;font-weight:700;color:${color};flex-shrink:0">${label}</span>
        </div>${bar}${note}
      </div>`;
    }).join('');
  }

  const abortBtn = _el('gdu-abort');
  const doneBtn  = _el('gdu-runback');
  if (abortBtn) abortBtn.style.display = _running ? '' : 'none';
  if (doneBtn)  doneBtn.style.display  = _running ? 'none' : '';

  const sum = _el('gdu-runsum');
  if (sum) {
    if (_running) {
      sum.textContent = '変換とアップロードの間はこの画面を開いたままにしてください';
    } else if (registered != null) {
      const failed = _items.filter(it => it.phase === 'error').length;
      sum.textContent = failed
        ? `${registered}本を登録しました（${failed}本は失敗）`
        : `${registered}本を登録しました`;
    }
  }
}

// ════════════════════════════════════════════════════════════
// チャンネル名 / プレイリスト名を既存から選ぶ
// ════════════════════════════════════════════════════════════
const DD = {
  ch: { input: 'gdu-channel',  dd: 'gdu-ch-dd', search: 'gdu-ch-search', list: 'gdu-ch-ddlist',
        empty: 'チャンネルなし',
        // 他の画面と同じ読み方に揃える。v.channel だけ見ると、アプリ内で
        // チャンネルを変えた動画（v.ch しか入っていない）が候補に出ない。
        pick: (v) => v.ch || v.channel },
  pl: { input: 'gdu-playlist', dd: 'gdu-pl-dd', search: 'gdu-pl-search', list: 'gdu-pl-ddlist',
        empty: 'プレイリストなし',
        pick: (v) => v.pl },
};

export function gduDdOpen(kind) {
  const c = DD[kind];
  if (!c) return;
  // もう片方が開いていたら閉じる（重なって読めなくなる）
  for (const k of Object.keys(DD)) if (k !== kind) { const o = _el(DD[k].dd); if (o) o.style.display = 'none'; }
  const dd = _el(c.dd);
  if (!dd) return;
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
  gduDdFilter(kind, '');
  dd.style.display = 'block';
  // 設定欄は下の方にあるので、開いても画面外だと「押しても何も起きない」に見える。
  // scrollIntoView は最小限しか動かないことがあるので、自分ではみ出し分を送る。
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const sc = dd.closest('.gdu-scroll');
    if (sc) {
      const over = dd.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom;
      if (over > 0) sc.scrollTop += over + 8;
    } else {
      dd.scrollIntoView({ block: 'nearest' });
    }
    // タッチ端末では検索欄にフォーカスしない。キーボードが出て候補が隠れる。
    if (!window.matchMedia?.('(pointer: coarse)').matches) _el(c.search)?.focus();
  }));
}

export function gduDdFilter(kind, q) {
  const c = DD[kind];
  const listEl = c && _el(c.list);
  if (!listEl) return;
  const counts = {};
  for (const v of (window.videos || [])) {
    const name = c.pick(v);
    if (name) counts[name] = (counts[name] || 0) + 1;
  }
  const ql = String(q || '').trim().toLowerCase();
  const names = Object.keys(counts)
    .filter(n => !ql || n.toLowerCase().includes(ql))
    .sort((a, b) => a.localeCompare(b, 'ja'));

  listEl.innerHTML = names.length
    // 名前に引用符などが入っていても壊れないよう、onclick に値を埋め込まず data 属性で渡す
    ? names.map(n => `<div class="vp-dd-item" data-v="${_esc(n)}">${_esc(n)}<span class="vp-dd-cnt">${counts[n]}本</span></div>`).join('')
    : `<div style="padding:8px 12px;font-size:11px;color:var(--text3)">${c.empty}</div>`;

  if (!listEl.dataset.bound) {
    listEl.dataset.bound = '1';
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.vp-dd-item');
      if (row) gduDdSelect(kind, row.dataset.v);
    });
  }
}

export function gduDdSelect(kind, val) {
  const c = DD[kind];
  if (!c) return;
  const inp = _el(c.input);
  if (inp) inp.value = val;
  const dd = _el(c.dd);
  if (dd) dd.style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// window 公開（HTMLのonclickから呼ぶ）
// ════════════════════════════════════════════════════════════
window.gduOpen         = gduOpen;
window.gduPick         = gduPick;
window.gduFilesChosen  = gduFilesChosen;
window.gduRemove       = gduRemove;
window.gduSetQ         = gduSetQ;
window.gduOpenFolder   = gduOpenFolder;
window.gduCancelFolder = gduCancelFolder;
window.gduFolderEnter  = gduFolderEnter;
window.gduFolderUp     = gduFolderUp;
window.gduFolderJump   = gduFolderJump;
window.gduChooseFolder = gduChooseFolder;
window.gduNewFolder    = gduNewFolder;
window.gduStart        = gduStart;
window.gduAbort        = gduAbort;
window.gduBackToSetup  = gduBackToSetup;
window.gduDdOpen       = gduDdOpen;
window.gduDdFilter     = gduDdFilter;
window.gduDdSelect     = gduDdSelect;
