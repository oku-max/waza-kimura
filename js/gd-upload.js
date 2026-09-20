/* ══════════════════════════════════════════════════════════════════════
   端末の動画を Google Drive にアップロードして取り込む

   Googleフォトの動画は「リンクとして登録」できない。
   Photos Library API の読み取りスコープは2025年3月で廃止され、後継の
   Picker API が返す URL は60分で失効し、セッションが切れると選んだ
   アイテム自体に二度とアクセスできなくなる。つまり恒久URLが作れない。
   → 取り込み時に実体を Drive にコピーしてしまえば、あとは既存の
     gdrive 動画（pt:'gdrive' / id:'gd-<fileId>'）と完全に同じ扱いになる。

   入口は「カメラロールから」と「ファイルから」の2つに分けてある。
   accept="video/*" と書くと Android は写真アプリ中心の画面を出す。そこからだと
   端末に実体が無い古い動画は Googleフォト がクラウドから落とそうとして失敗する。
   accept を外すとファイル一覧の画面になり、端末のファイルを直接渡せる。
   どちらが開くかは OS の判断なので、賭けずにユーザーに選ばせる。

   端末側での画質変換はしない。元のファイルをそのままコピーする。
   代わりに、Driveがどれだけ増えるか・空きが足りるかを押す前に出す。

   ── データ層への影響 ──
   ・window.videos に push するだけ。既存要素の書き換え・削除は一切しない。
   ・同じ id が既にあれば push しない（重複登録の防止）。
   ・保存は既存の saveUserData() を通す（未読込時の上書き防止ガードはそちらが持つ）。
   ・localStorage には一切書かない。
   ・Drive 側は「新規ファイルの作成」だけ。既存ファイルの更新・削除はしない。
   ══════════════════════════════════════════════════════════════════════ */

import { ensureDriveToken } from './gdrive.js';

const GD_FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── 状態 ──
let _items   = [];          // { file, title, size, duration, phase, prog, note, fileId }
let _dest    = null;        // { id, name } アップロード先フォルダ（毎回選ぶ）
let _running = false;
let _abort   = false;
let _curXhr  = null;        // 実行中のアップロード（中止用）
let _quota   = null;        // { limit, usage } / { failed:true } / null=未取得

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
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|avi|mkv|webm|wmv|flv|mpg|mpeg|3gp|ogv|ts|m2ts)$/i;
function _stripExt(name) { return String(name || '').replace(VIDEO_EXT_RE, ''); }
function _ext(name) { const m = String(name || '').match(VIDEO_EXT_RE); return m ? m[0] : ''; }
// 画面で直した名前を、ライブラリのタイトルにもDrive上のファイル名にも使う。
// 直した名前が空なら元のファイル名に戻す（名前が消えた動画を作らない）。
function _nameOf(it) {
  const t = String(it.title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
  return t || _stripExt(it.file.name);
}
function _driveName(it) { return _nameOf(it) + _ext(it.file.name); }
// ファイル一覧からは何でも選べてしまう。種類が空で来る端末があるので拡張子でも見る。
function _isVideo(f) {
  return String(f?.type || '').startsWith('video/') || VIDEO_EXT_RE.test(f?.name || '');
}
function _el(id) { return document.getElementById(id); }

// ════════════════════════════════════════════════════════════
// 画面
// ════════════════════════════════════════════════════════════
export async function gduOpen() {
  // 実行中に開き直したときに設定画面へ戻すと、進行中の処理が見えなくなる
  if (_running) { _showStage('run'); _renderRun(); return; }
  _abort = false;
  _items = [];
  _dest  = null;
  _quota = null;
  _showStage('setup');
  _render();
  // 空き容量は認証が要るので、取れてから描き直す
  _loadQuota();
}

function _showStage(stage) {
  const map = { setup: 'gdu-setup', run: 'gdu-run', fp: 'gdu-folderpick' };
  for (const [k, id] of Object.entries(map)) {
    const el = _el(id);
    if (el) el.style.display = (k === stage) ? 'flex' : 'none';
  }
}

// kind: 'media' … 写真アプリの画面（カメラロール）/ 'files' … ファイル一覧の画面
export function gduPick(kind) {
  if (_running) {
    window.toast?.('⚠️ 取り込み中です。中止してからもう一度選んでください');
    return;
  }
  let inp = _el('gdu-file-input');
  if (!inp) { window.toast?.('⚠️ ファイル選択を開けませんでした。ページを更新してください'); return; }
  // 前回の選択が途中で中断されると（Googleフォトの準備を止めたときなど）、
  // ブラウザが「選択中」のまま固まって .click() を無視することがある。
  // 要素ごと作り直すとその状態が切れる。onchange は属性なので複製に引き継がれる。
  const fresh = inp.cloneNode(true);
  fresh.value = '';
  // accept が「メディア」だと写真アプリの画面になる。外すとファイル一覧の画面になる。
  if (kind === 'files') fresh.removeAttribute('accept');
  else                  fresh.setAttribute('accept', 'video/*');
  inp.replaceWith(fresh);
  inp = fresh;
  try {
    inp.click();
  } catch (e) {
    console.error('[gdu] file input click failed', e);
    window.toast?.('⚠️ ファイル選択を開けませんでした。ページを更新してください');
  }
}

export async function gduFilesChosen(inputEl) {
  const files = [...(inputEl?.files || [])];
  inputEl.value = '';                     // 同じファイルを選び直せるように毎回クリア
  if (!files.length) return;

  const skipped = [];
  for (const f of files) {
    if (!_isVideo(f)) { skipped.push(f.name); continue; }
    // 同じ名前＋同じサイズは二重選択とみなす（連打での二重アップロードを防ぐ）
    if (_items.some(it => it.file.name === f.name && it.size === f.size)) continue;
    _items.push({
      file: f, title: _stripExt(f.name), size: f.size,
      duration: 0, phase: 'wait', prog: 0, note: '', fileId: '',
    });
  }
  if (skipped.length) {
    window.toast?.(`⚠️ 動画ではないので外しました: ${skipped.slice(0, 3).join(' / ')}`, 6000);
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

function _render() {
  _renderList();
  _renderDest();
  _renderQuota();
  _renderFoot();
}

function _renderList() {
  const box = _el('gdu-list');
  if (!box) return;
  const hint = _el('gdu-namehint');
  if (hint) hint.style.display = _items.length ? '' : 'none';
  if (!_items.length) {
    box.innerHTML = `<div class="gdp-empty">まだ動画を選んでいません</div>`;
    return;
  }
  // 尺は選んだ後から入ってくる。そのたびに作り直すと、名前を打っている途中で
  // 入力欄が作り直されて文字が飛ぶ。行数が同じなら中身だけ書き換える。
  const rows = box.querySelectorAll('.gdp-row');
  if (rows.length === _items.length) {
    _items.forEach((it, i) => {
      const m = rows[i].querySelector('.meta');
      if (m) m.textContent = _metaOf(it);
    });
    return;
  }
  box.innerHTML = _items.map((it, i) => {
    return `<div class="gdp-row" style="cursor:default">
      <span class="ico">🎬</span>
      <input class="nm gdu-nm" type="text" value="${_esc(it.title)}"
             title="${_esc(it.file.name)}" aria-label="動画のタイトル"
             oninput="gduRename(${i}, this)">
      <span class="meta">${_metaOf(it)}</span>
      <button class="gdp-x" onclick="gduRemove(${i})" aria-label="削除">×</button>
    </div>`;
  }).join('');
}

function _metaOf(it) {
  return `${_mb2(it.size)}${it.duration ? ' ・ ' + _hhmm(it.duration) : ''}`;
}

// 名前を直す。中身を持っているのは _items なので、描き直しても消えない。
export function gduRename(idx, el) {
  const it = _items[idx];
  if (!it || _running) return;
  it.title = String(el?.value || '');
}

function _renderDest() {
  const el = _el('gdu-dest');
  if (!el) return;
  el.textContent = _dest ? _dest.name : '未選択';
  el.style.color = _dest ? 'var(--text)' : 'var(--text3)';
}

// ── Driveの空き容量 ──────────────────────────────────────
// 知らないうちに容量が増えていた、が起きないように、押す前に出す。
// 取れなくても取り込みは止めない（分かっていないことを正直に出すだけ）。
async function _loadQuota() {
  try {
    const token = await ensureDriveToken();
    if (!token) { _quota = { failed: true }; _renderQuota(); return; }
    const data = await _driveGet(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota', token);
    const q = data?.storageQuota || {};
    _quota = { limit: q.limit != null ? Number(q.limit) : null, usage: Number(q.usage) || 0 };
  } catch (e) {
    console.warn('[gdu] quota', e);
    _quota = { failed: true };
  }
  _renderQuota();
}

// 今回ふえる分。変換しないので、選んだファイルの合計そのまま。
function _addBytes() { return _items.reduce((n, it) => n + (it.size || 0), 0); }

// 空きが足りないか。容量が分からないときは false（止める根拠がない）。
function _noRoom() {
  if (!_quota || _quota.failed || _quota.limit == null) return false;
  return _addBytes() > _quota.limit - _quota.usage;
}

function _renderQuota() {
  const box = _el('gdu-quota');
  if (!box) return;
  const add = _addBytes();

  const head = !_items.length ? '' :
    `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
       <span style="font-size:11px;font-weight:700;color:var(--text2)">今回ふえる分</span>
       <span style="font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums">+${_mb2(add)}</span>
     </div>`;

  const own = `<div style="font-size:10.5px;color:var(--text3);line-height:1.55">
      保存先はあなた自身のGoogleドライブです。いつでもご自身で削除できます。</div>`;

  if (!_quota) {
    box.innerHTML = head + `<div style="font-size:11px;color:var(--text3)">空き容量を確認しています...</div>` + own;
    return;
  }
  if (_quota.failed) {
    box.innerHTML = head
      + `<div style="font-size:11px;color:var(--text3);line-height:1.55">Googleドライブの空き容量を確認できませんでした。取り込みは続けられますが、空きが足りないと途中で失敗することがあります。</div>`
      + own;
    return;
  }
  if (_quota.limit == null) {
    box.innerHTML = head
      + `<div style="font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums">Googleドライブ 使用中 ${_mb2(_quota.usage)}（上限なし）</div>`
      + own;
    return;
  }

  const free  = _quota.limit - _quota.usage;
  const over  = add > free;
  const usedW = Math.min(100, _quota.usage / _quota.limit * 100);
  // 増える分が少量でも見えるように、最低限の幅は確保する
  const addW  = Math.min(100 - usedW, add > 0 ? Math.max(add / _quota.limit * 100, 1.5) : 0);
  const addBg = over ? 'var(--red)' : 'var(--green)';

  let msg = '';
  if (over) {
    msg = `<div style="font-size:11.5px;font-weight:700;color:var(--red);line-height:1.5">空きが ${_mb2(add - free)} 足りません。ファイルを減らすか、Googleドライブを整理してください。</div>`;
  } else if (add > 0 && (free - add) / _quota.limit < 0.1) {
    msg = `<div style="font-size:11.5px;font-weight:700;color:var(--gold);line-height:1.5">取り込むと残りが ${_mb2(free - add)} になります。</div>`;
  }

  box.innerHTML = head
    + `<div style="height:10px;border-radius:6px;overflow:hidden;background:var(--surface3);display:flex">
         <div style="width:${usedW.toFixed(2)}%;background:var(--text3)"></div>
         <div style="width:${addW.toFixed(2)}%;background:${addBg}"></div>
       </div>`
    + `<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums">
         <span>使用中 ${_mb2(_quota.usage)}</span>
         <span>空き ${_mb2(free)} / ${_mb2(_quota.limit)}</span>
       </div>`
    + msg + own;
}

function _renderFoot() {
  const btn = _el('gdu-start');
  if (!btn) return;
  const noRoom = _noRoom();
  btn.disabled = !(_items.length > 0 && !!_dest && !_running) || noRoom;
  btn.textContent = noRoom ? '空きが足りません'
    : _items.length ? `${_items.length}本をアップロードして登録`
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
  if (!_quota) _loadQuota();
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

  // ここから先で何が起きても必ず _running を解除する。
  // 解除し損ねると、全ボタンが _running を見ているため画面ごと操作不能になる。
  let registered = 0;
  let fatal = '';
  try {
    registered = await _runImport();
  } catch (e) {
    fatal = String(e?.message || e).slice(0, 160);
    console.error('[gdu] 取り込みが中断されました', e);
  } finally {
    _running = false;
    _curXhr  = null;
  }
  _renderRun(registered, fatal);
}

// 実処理。例外は呼び出し側の finally で受けるので、ここでは投げっぱなしでよい。
async function _runImport() {
  const token = await ensureDriveToken();
  if (!token) {
    window.toast?.('⚠️ Googleドライブに接続できませんでした');
    _showStage('setup');
    _render();
    return 0;
  }

  const channel  = (_el('gdu-channel')?.value  || '').trim();
  // 空欄なら保存先フォルダ名。Drive取り込みも「フォルダ名＝プレイリスト」で揃えている。
  const playlist = (_el('gdu-playlist')?.value || '').trim() || (_dest?.name || '');

  const added = [];
  for (const it of _items) {
    if (_abort) { it.phase = 'wait'; it.note = '中止しました'; continue; }
    try {
      // 変換はしない。元のファイルをそのまま上げる。
      it.phase = 'up'; it.prog = 0; _renderRun();
      const res  = await _upload(it.file, _driveName(it), _dest.id, token, (p) => _tick(it, p));
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
    const title = _nameOf(it);
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
  return registered;
}

// パネルを閉じても裏で走り続ける。閉じる側がそれを伝えられるように外に出す。
export function gduIsRunning() { return _running; }

export async function gduAbort() {
  _abort = true;
  window.toast?.('中止しています...');
  try { _curXhr?.abort(); } catch (e) {}
  // アップロードが応答しないことがある。待ち続けると進捗画面から出られず
  // 全ボタンが無効なままになるので、少し待って必ず操作できる状態に戻す。
  setTimeout(() => {
    if (!_running) return;
    _running = false;
    _curXhr  = null;
    _renderRun(0, '中止しました');
  }, 3000);
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

function _renderRun(registered, fatal) {
  const box = _el('gdu-runlist');
  if (box) {
    box.innerHTML = _items.map(it => {
      const pct = Math.round((it.prog || 0) * 100);
      let label = '待機中', color = 'var(--text3)';
      if (it.phase === 'up')    { label = `アップロード中 ${pct}%`; color = 'var(--accent)'; }
      if (it.phase === 'done')  { label = '完了';                 color = 'var(--green)'; }
      if (it.phase === 'error') { label = '失敗';                 color = 'var(--red, #c33)'; }
      const bar = (it.phase === 'up')
        ? `<div style="height:3px;background:var(--surface2);border-radius:2px;overflow:hidden;margin-top:4px">
             <div style="height:100%;width:${pct}%;background:var(--accent);transition:width .2s"></div>
           </div>` : '';
      const note = it.note
        ? `<div style="font-size:10.5px;color:var(--text3);margin-top:2px;line-height:1.4">${_esc(it.note)}</div>` : '';
      return `<div style="padding:8px 4px;border-bottom:1px solid var(--border2)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="flex:1;font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(_nameOf(it))}</span>
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
      sum.textContent = 'アップロードの間はこの画面を開いたままにしてください';
    } else if (fatal) {
      // 原因を画面に出す。出さないと「押しても何も起きない」としか分からない。
      sum.textContent = `取り込みを中断しました: ${fatal}`;
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
  // Drive取り込みタブも同じ仕掛けを使う。別々に書いていたせいで、
  // 引用符入りの名前で壊れる直しが片方にしか当たっていなかった。
  gdch: { input: 'gd-channel',  dd: 'gd-ch-dd', search: 'gd-ch-search', list: 'gd-ch-ddlist',
          empty: 'チャンネルなし',
          pick: (v) => v.ch || v.channel,
          after: () => window.gdOptsSummary?.() },
  gdpl: { input: 'gd-playlist', dd: 'gd-pl-dd', search: 'gd-pl-search', list: 'gd-pl-ddlist',
          empty: 'プレイリストなし',
          pick: (v) => v.pl,
          after: () => window.gdOptsSummary?.() },
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
  c.after?.();
}

// ════════════════════════════════════════════════════════════
// window 公開（HTMLのonclickから呼ぶ）
// ════════════════════════════════════════════════════════════
window.gduOpen         = gduOpen;
window.gduPick         = gduPick;
window.gduFilesChosen  = gduFilesChosen;
window.gduRemove       = gduRemove;
window.gduRename       = gduRename;
window.gduOpenFolder   = gduOpenFolder;
window.gduCancelFolder = gduCancelFolder;
window.gduFolderEnter  = gduFolderEnter;
window.gduFolderUp     = gduFolderUp;
window.gduFolderJump   = gduFolderJump;
window.gduChooseFolder = gduChooseFolder;
window.gduNewFolder    = gduNewFolder;
window.gduStart        = gduStart;
window.gduAbort        = gduAbort;
window.gduIsRunning    = gduIsRunning;
window.gduBackToSetup  = gduBackToSetup;
window.gduDdOpen       = gduDdOpen;
window.gduDdFilter     = gduDdFilter;
window.gduDdSelect     = gduDdSelect;
