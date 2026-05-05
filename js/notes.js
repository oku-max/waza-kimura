// ═══ WAZA KIMURA — Notes tab v52.79 ═══
import { getSnapshot, putSnapshot, pendingUploads } from './snapshot-db.js';
window._getSnapshot = getSnapshot;

let _saveFsTimer = null;
function _save() {
  clearTimeout(_saveFsTimer);
  _saveFsTimer = setTimeout(() => {
    if (typeof window._firebaseSaveNotes !== 'function') {
      console.error('[notes] _firebaseSaveNotes undefined — save skipped');
      return;
    }
    window._firebaseSaveNotes({ folders: _data, root: _root });
  }, 500);
}

// ページ離脱・バックグラウンド移行時に未送信の変更を即時Firestore保存
const _flushNotes = () => {
  if (_saveFsTimer) {
    clearTimeout(_saveFsTimer);
    _saveFsTimer = null;
    window._firebaseSaveNotes?.({ folders: _data, root: _root });
  }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushNotes(); });
window.addEventListener('pagehide', _flushNotes);
window.addEventListener('beforeunload', _flushNotes);

// ログイン後にauth側から呼ばれる
window._notesInitForUser = function() {
  clearTimeout(_saveFsTimer);
  _saveFsTimer = null;
  _data = [];
  _root = [];
  _activeId = null;
  window.renderNotes?.();
};

// ログアウト時に呼ばれる
window._notesClear = function() {
  clearTimeout(_saveFsTimer); // 残留タイマーを必ずキャンセル
  _saveFsTimer = null;
  _data = [];
  _root = [];
  _activeId = null;
  window.renderNotes?.();
};

window._notesGetData = () => _data;

window._notesLoadFromRemote = function(payload) {
  // ローカルに未保存の変更がある間はリモートの上書きをスキップ（競合防止）
  if (_saveFsTimer) return;
  // 旧フォーマット（配列）と新フォーマット（{ folders, root }）に両対応
  const folders = Array.isArray(payload) ? payload : (payload?.folders || []);
  const root    = Array.isArray(payload) ? []      : (payload?.root    || []);
  if (!folders.length && !root.length) return;
  try {
    _data = folders;
    _root = root;
    if (_activeId) _renderNote(_activeId);
    window.renderNotes?.();
    // ヘッダー同期ボタンのステータスを更新
    const icon = document.getElementById('nSyncIcon');
    const lbl  = document.getElementById('nSyncLbl');
    if (icon) icon.textContent = '✓';
    if (lbl)  lbl.textContent  = '完了';
    setTimeout(() => {
      if (icon) icon.textContent = '↕';
      if (lbl)  lbl.textContent  = '同期';
    }, 2000);
    window.toast?.('📓 ノートを同期しました');
  } catch(e) {
    window.toast?.('⚠️ 同期エラー: ' + e.message);
    console.error('[notes] sync error:', e);
  }
};

let _data = [];   // フォルダ配列
let _root = [];   // フォルダなしノート配列
let _activeId = null;
let _recentIds = [];
let _dragSrcNoteId = null;
let _dragSrcIdx = null;
let _dragSrcEndIdx = null;
let _dragSrcSlot = null; // {colIdx, slot, bIdx} — colスロット内から drag中のとき
let _statusFilter = null; // null=全て, 'new'/'wip'/'done'/'review'
let _sbDragNoteId = null; // サイドバーノート並び替え用
let _sbDragCatId  = null;

// ── inline video player state (AB repeat / bookmarks / memo) ──
const _nBviYtP = {};   // key → YT.Player
const _nBviVmP = {};   // key → Vimeo.Player
const _nBviVmT = {};   // key → current vimeo time
const _nBviGdV = {};   // key → <video> element
const _nBviTmr = {};   // key → setInterval id
const _nBviAb  = {};   // key → {a,b,looping,activeTab,abOpen,bmOpen,editBm}

function _nBviKey(noteId, idx) { return noteId + '-' + idx; }

function _nBviGetAb(k) {
  if (!_nBviAb[k]) _nBviAb[k] = { a: null, b: null, looping: false, activeTab: 'a', abOpen: false, bmOpen: true, editBm: null };
  return _nBviAb[k];
}

function _nBviFmt(t) {
  if (t == null) return '--:--';
  t = Math.max(0, t);
  return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
}

function _nBviCurTime(k) {
  if (_nBviVmP[k]) return _nBviVmT[k] || 0;
  if (_nBviGdV[k]) return _nBviGdV[k].currentTime || 0;
  return _nBviYtP[k]?.getCurrentTime?.() || 0;
}

function _nBviSeekTo(k, sec) {
  const yt = _nBviYtP[k];
  if (yt?.seekTo) { yt.seekTo(sec, true); yt.playVideo?.(); return; }
  const vm = _nBviVmP[k];
  if (vm) { vm.setCurrentTime(sec).then(() => vm.play().catch(() => {})).catch(() => {}); return; }
  const gd = _nBviGdV[k];
  if (gd) { gd.currentTime = sec; gd.play().catch(() => {}); }
}

function _nBviGetLibV(noteId, idx) {
  const r = _findNote(noteId);
  const b = r?.note?.blocks?.[idx];
  if (!b?.videoId) return null;
  return (window.videos || []).find(v => v.id === b.videoId || v.ytId === b.videoId) || null;
}

function _nBviSyncBmsToLib(k, noteId, idx) {
  const v = _nBviGetLibV(noteId, idx);
  if (!v) return;
  const bms = _nBviGetAb(k).bookmarks || [];
  v.bookmarks = bms.map(b => {
    const o = { time: b.a ?? 0, label: b.label || '', note: b.note || '' };
    if (b.b != null) o.endTime = b.b;
    return o;
  });
  window.debounceSave?.();
}

function _nBviRefreshBm(k, noteId, idx) {
  const st = _nBviGetAb(k);
  const list = document.getElementById('n-bvi-bm-list-' + k);
  if (list) {
    const bms = st.bookmarks || [];
    list.innerHTML = bms.length
      ? bms.map((bm, i) => _nBviBmItemHTML(k, noteId, idx, bm, i)).join('')
      : '<div style="color:var(--text3);font-size:11px;padding:4px 0">ブックマークなし</div>';
  }
  const lbl = document.getElementById('n-bvi-bm-lbl-' + k);
  if (lbl) lbl.textContent = `📌 ブックマーク${(st.bookmarks || []).length ? ' (' + st.bookmarks.length + ')' : ''}`;
}

function _nBviBmItemHTML(k, noteId, idx, bm, i) {
  const eb = _nBviAb[k]?.editBm;
  if (eb?.idx === i) return _nBviBmEditHTML(k, noteId, idx, bm, i);
  return `<div class="bm-item">
    <span class="bm-chip" onclick="window._nbviSeekBm('${k}',${i})">${_nBviFmt(bm.a)}${bm.b != null ? ' → ' + _nBviFmt(bm.b) : ''}</span>
    <span class="bm-item-label">${_esc(bm.label || '（ラベルなし）')}</span>
    <button class="bm-edit-btn" onclick="window._nbviBmEdit('${k}','${noteId}',${idx},${i})">編集</button>
    <button class="bm-del-btn" onclick="window._nbviDelBm('${k}','${noteId}',${idx},${i})">×</button>
  </div>`;
}

function _nBviBmEditHTML(k, noteId, idx, bm, i) {
  const eb = _nBviAb[k].editBm;
  const field = eb?.field || 'start';
  const curVal = field === 'start' ? (bm.a || 0) : (bm.b ?? bm.a ?? 0);
  const hasEnd = bm.b != null;
  const timeDisp = field === 'start' ? _nBviFmt(bm.a) : (hasEnd ? _nBviFmt(bm.b) : '——');
  const sp = e => `event.stopPropagation();${e}`;
  const adjBtn = s => `<button onclick="${sp(`window._nbviBmMicro('${k}','${noteId}',${idx},${i},${s})`)}" style="font-size:9px;padding:2px 5px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer">${s > 0 ? '+' : ''}${s}s</button>`;
  const tabS = field === 'start' ? 'background:var(--accent,#2563eb);color:#fff;font-weight:600' : 'background:var(--surface2);color:var(--text2)';
  const tabE = field === 'end'   ? 'background:var(--accent,#2563eb);color:#fff;font-weight:600' : 'background:var(--surface2);color:var(--text2)';
  return `<div class="bm-item" style="display:block;padding:8px;background:var(--accent-bg,#fdf6e8);border-left:3px solid var(--accent,#2563eb);border-radius:4px;margin:2px 0">
    <input id="n-bvi-bm-lbl-in-${k}-${i}" type="text" value="${_esc(bm.label || '')}" placeholder="ブックマーク名"
      style="width:100%;font-size:11px;padding:4px 8px;border:1.5px solid var(--accent,#2563eb);border-radius:6px;background:var(--surface);color:var(--text);margin-bottom:5px;box-sizing:border-box"
      onclick="${sp('')}" onmousedown="${sp('')}">
    <input id="n-bvi-bm-note-${k}-${i}" type="text" value="${_esc(bm.note || '')}" placeholder="コメント（任意）"
      style="width:100%;font-size:11px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);margin-bottom:8px;box-sizing:border-box"
      onclick="${sp('')}" onmousedown="${sp('')}">
    <div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:6px">
      <div style="display:flex;border-bottom:0.5px solid var(--border)">
        <div onclick="${sp(`window._nbviBmTab('${k}','${noteId}',${idx},${i},'start')`)}" style="flex:1;text-align:center;font-size:11px;padding:6px 4px;cursor:pointer;${tabS}">▶ 開始</div>
        <div onclick="${sp(`window._nbviBmTab('${k}','${noteId}',${idx},${i},'end')`)}" style="flex:1;text-align:center;font-size:11px;padding:6px 4px;cursor:pointer;${tabE}">■ 終了</div>
      </div>
      <div style="padding:8px 10px">
        <div id="n-bvi-bm-tdisp-${k}-${i}" style="font-size:20px;font-weight:500;text-align:center;margin:2px 0 6px;font-family:monospace">${timeDisp}</div>
        <input type="range" id="n-bvi-bm-sl-${k}-${i}" min="0" max="600" value="${curVal}" step="1"
          style="width:100%;margin-bottom:6px;accent-color:var(--accent,#2563eb)"
          oninput="${sp(`window._nbviBmSlider('${k}','${noteId}',${idx},${i},this.value)`)}"
          onclick="${sp('')}" onmousedown="${sp('')}">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${[-10,-5,-3,-1,1,3,5,10].map(s => adjBtn(s)).join('')}
          <button onclick="${sp(`window._nbviBmCur('${k}','${noteId}',${idx},${i})`)}" style="font-size:9px;padding:2px 5px;border-radius:5px;border:1px solid var(--border);background:var(--accent,#2563eb);color:#fff;cursor:pointer">現在地</button>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between">
      <div style="display:flex;gap:5px">
        <button onclick="${sp(`window._nbviBmEditReset('${k}','${noteId}',${idx},${i})`)}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer">↺ リセット</button>
        <button onclick="${sp(`window._nbviDelBm('${k}','${noteId}',${idx},${i})`)}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--danger,#dc2626);cursor:pointer">🗑 削除</button>
      </div>
      <div style="display:flex;gap:5px">
        <button onclick="${sp(`window._nbviBmEditClose('${k}')`)}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer">閉じる</button>
        <button onclick="${sp(`window._nbviBmEditSave('${k}','${noteId}',${idx},${i})`)}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--text);background:var(--text);color:#fff;cursor:pointer;font-weight:600">✔ 保存</button>
      </div>
    </div>
  </div>`;
}

function _nBviAbBodyHTML(k, st) {
  return `<div class="ab-body">
    <div class="ab-times-row">
      <span class="ab-pt-lbl">開始:</span><span class="ab-t" id="n-bvi-ab-a-${k}">${_nBviFmt(st.a)}</span>
      <span class="ab-arrow">↔</span>
      <span class="ab-pt-lbl">終了:</span><span class="ab-t" id="n-bvi-ab-b-${k}">${_nBviFmt(st.b)}</span>
      <button class="ab-clear-btn" onclick="window._nbviClearAb('${k}')">× クリア</button>
    </div>
    <div class="ab-pt-tabs">
      <button class="ab-pt-tab${st.activeTab === 'a' ? ' on' : ''}" id="n-bvi-tab-a-${k}" onclick="window._nbviSetAbTab('${k}','a')">▶ 開始</button>
      <button class="ab-pt-tab${st.activeTab === 'b' ? ' on' : ''}" id="n-bvi-tab-b-${k}" onclick="window._nbviSetAbTab('${k}','b')">■ 終了</button>
    </div>
    <div class="ab-time-display" id="n-bvi-ab-disp-${k}">${_nBviFmt(st.activeTab === 'a' ? st.a : st.b)}</div>
    <div class="ab-slider-outer">
      <span style="font-size:9px;color:#888;font-family:monospace;min-width:26px">0:00</span>
      <input type="range" class="ab-slider" id="n-bvi-ab-sl-${k}" min="0" max="300" value="${st.activeTab === 'a' ? (st.a || 0) : (st.b || 0)}" oninput="window._nbviSlider('${k}',this.value)">
      <span id="n-bvi-ab-dur-${k}" style="font-size:9px;color:#888;font-family:monospace;min-width:30px;text-align:right">--:--</span>
    </div>
    <div class="ab-micro-row">
      <span class="ab-micro-lbl">微調整</span>
      ${[-10,-5,-3,-1,1,3,5,10].map(s => `<button class="ab-micro-btn" onclick="window._nbviMicro('${k}',${s})">${s > 0 ? '+' : ''}${s}s</button>`).join('')}
      <button class="ab-micro-btn cur" onclick="window._nbviMicro('${k}',null)">現在地</button>
    </div>
    <div class="ab-save-row"><button class="ab-save-btn" onclick="window._nbviSaveAb('${k}')">✓ ブックマークに保存</button></div>
  </div>`;
}

function _nBviLoadVimeoApi(cb) {
  if (window.Vimeo?.Player) return cb();
  if (document.getElementById('vm-iframe-api-script')) {
    const t = setInterval(() => { if (window.Vimeo?.Player) { clearInterval(t); cb(); } }, 50);
    return;
  }
  const s = document.createElement('script');
  s.id = 'vm-iframe-api-script';
  s.src = 'https://player.vimeo.com/api/player.js';
  s.onload = () => cb();
  document.head.appendChild(s);
}

// ── lookup ──
function _findNote(id) {
  const rootNote = _root.find(n => n.id === id);
  if (rootNote) return { note: rootNote, cat: null };
  for (const cat of _data) {
    const n = cat.notes.find(n => n.id === id);
    if (n) return { note: n, cat };
  }
  return null;
}

// ── 挿入ヘルパー: _notesInsertAfterIdx が設定されていれば指定位置に挿入、なければ末尾に追加 ──
function _blocksInsertOrPush(blocks, block) {
  if (window._notesInsertAfterIdx != null) {
    blocks.splice(window._notesInsertAfterIdx + 1, 0, block);
    window._notesInsertAfterIdx = null;
  } else {
    blocks.push(block);
  }
}

function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── status helpers ──
const STATUS_LABEL = { wip:'学習中', done:'習得', new:'新規', review:'要復習' };
const STATUS_CLS   = { wip:'n-s-wip', done:'n-s-done', new:'n-s-new', review:'n-s-review' };
const STATUS_DOT   = { wip:'n-dot-wip', done:'n-dot-done', new:'n-dot-new', review:'n-dot-review' };

// ── context menu ──
let _ctxNoteId = null;

function _closeCtx() {
  document.getElementById('n-ctx-menu')?.remove();
  _ctxNoteId = null;
}

window._notesCtxMenu = function(noteId, e) {
  e.stopPropagation();
  _closeCtx();
  _ctxNoteId = noteId;

  const menu = document.createElement('div');
  menu.id = 'n-ctx-menu';
  menu.className = 'n-ctx-menu';
  menu.innerHTML = `
    <div class="n-ctx-item" onclick="window._notesRename('${noteId}')">✎ 名前変更</div>
    <div class="n-ctx-item" onclick="window._notesMoveNote('${noteId}')">📂 移動</div>
    <div class="n-ctx-item n-ctx-danger" onclick="window._notesDelete('${noteId}')">🗑 削除</div>
  `;

  // position: fixed relative to viewport so sidebar overflow:hidden doesn't clip
  const cx = e.clientX || e.touches?.[0]?.clientX || window.innerWidth / 2;
  const cy = e.clientY || e.touches?.[0]?.clientY || 100;
  menu.style.position = 'fixed';
  menu.style.top  = Math.min(cy + 4, window.innerHeight - 120) + 'px';
  menu.style.left = Math.min(Math.max(4, cx - 100), window.innerWidth - 144) + 'px';

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', _closeCtx, { once: true }), 0);
};

// ── move between folders ──
window._notesMoveNote = function(noteId) {
  _closeCtx();
  const r = _findNote(noteId);
  if (!r) return;
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'move';
  overlay.dataset.noteId = noteId;
  const options = `<option value="">（フォルダなし）</option>` +
    _data.map(c => {
      const isCurrent = r.cat && r.cat.id === c.id;
      return `<option value="${c.id}"${isCurrent ? ' selected' : ''}>${_esc(c.icon + ' ' + c.name)}</option>`;
    }).join('');
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">📂 ノートを移動</span></div>
      <div class="n-sheet-body">
        <label class="n-sheet-lbl">移動先フォルダ</label>
        <select id="n-move-dest" class="n-sheet-select">${options}</select>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesMoveConfirm()">移動する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  document.addEventListener('keydown', _sheetEscHandler);
};

window._notesMoveConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay || overlay.dataset.mode !== 'move') return;
  const noteId   = overlay.dataset.noteId;
  const destCatId = document.getElementById('n-move-dest')?.value;
  const r = _findNote(noteId);
  if (!r) return;
  // 移動元から削除
  if (r.cat) { r.cat.notes = r.cat.notes.filter(n => n.id !== noteId); }
  else        { _root = _root.filter(n => n.id !== noteId); }
  // 移動先へ追加
  if (destCatId) {
    const dest = _data.find(c => c.id === destCatId);
    if (dest) dest.notes.push(r.note); else _root.push(r.note);
  } else {
    _root.push(r.note);
  }
  r.note.updatedAt = Date.now();
  _save();
  window._notesSheetClose();
  _renderSb();
  window.toast?.(`📂「${r.note.name}」を移動しました`);
};

// ── rename ──
window._notesRename = function(noteId) {
  _closeCtx();
  const r = _findNote(noteId);
  if (!r) return;
  _showCreateSheet({ mode: 'rename', noteId, currentName: r.note.name });
};

// ── block add ──
function _extractYtId(url) {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function _extractPlaylistId(url) {
  const m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── VPanelスナップ参照ブロック用キャッシュ ──
const _snapBlobCache = new Map(); // snapId → object URL

async function _loadRefSnap(snapId, el) {
  if (_snapBlobCache.has(snapId)) {
    el.innerHTML = `<img src="${_snapBlobCache.get(snapId)}" class="n-b-img">`;
    return;
  }
  try {
    const snap = await getSnapshot(snapId);
    if (snap?.blob) {
      const url = URL.createObjectURL(snap.blob);
      _snapBlobCache.set(snapId, url);
      el.innerHTML = `<img src="${url}" class="n-b-img">`;
    } else {
      el.innerHTML = `<span style="color:var(--text3);font-size:11px">画像を取得できませんでした</span>`;
    }
  } catch {
    el.innerHTML = `<span style="color:var(--text3);font-size:11px">読み込みエラー</span>`;
  }
}

function _hydrateRefSnaps() {
  document.querySelectorAll('.n-ref-snap-load[data-ref-snap-id]').forEach(el => {
    _loadRefSnap(el.dataset.refSnapId, el);
  });
}

// platformフィールドがない旧ブロック: 数字のみ→vimeo、それ以外→youtube
function _blockPlatform(block) {
  if (block.platform) return block.platform;
  return /^\d+$/.test(block.videoId || '') ? 'vimeo' : 'youtube';
}

function _blockThumbUrl(block) {
  const platform = _blockPlatform(block);
  if (platform === 'vimeo') {
    return block.thumb || `https://vumbnail.com/${block.videoId}.jpg`;
  }
  if (platform === 'gdrive') {
    const gdId = (block.videoId || '').startsWith('gd-') ? block.videoId.slice(3) : block.videoId;
    return block.thumb || `https://drive.google.com/thumbnail?id=${gdId}&sz=w320`;
  }
  if (platform === 'x') return block.thumb || null;
  // youtube playlist
  if (block.isPlaylist) return block.thumb || null;
  // youtube (default)
  const ytId = block.ytId || block.videoId || '';
  return block.thumb || (ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null);
}

window._notesImgFileChange = function(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    window._notesImgDataUrl = e.target.result;
    const preview = document.getElementById('n-block-img-preview');
    if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
    const lbl = document.getElementById('n-img-drop-label');
    if (lbl) lbl.textContent = '✓ ' + file.name;
  };
  reader.readAsDataURL(file);
};

// ── category create ──
function _showCatCreateSheet() {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'cat-create';
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr">
        <span class="n-sheet-title">📂 新しいカテゴリを作成</span>
      </div>
      <div class="n-sheet-body">
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div style="flex-shrink:0">
            <label class="n-sheet-lbl">アイコン</label>
            <input id="n-cat-icon" class="n-sheet-input"
                   type="text" value="📂" maxlength="2"
                   style="width:56px;text-align:center;font-size:20px;padding:6px 4px">
          </div>
          <div style="flex:1">
            <label class="n-sheet-lbl">カテゴリ名</label>
            <input id="n-cat-name" class="n-sheet-input" type="text"
                   placeholder="例：スタンディング"
                   onkeydown="if(event.key==='Enter') window._notesCatConfirm()">
          </div>
        </div>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesCatConfirm()">作成する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  setTimeout(() => document.getElementById('n-cat-name')?.focus(), 80);
}

window.notesCatNew = function() { _showCatCreateSheet(); };

window._notesCatConfirm = function() {
  const name = document.getElementById('n-cat-name')?.value.trim();
  if (!name) { document.getElementById('n-cat-name')?.focus(); return; }
  const icon = document.getElementById('n-cat-icon')?.value.trim() || '📂';
  _data.push({ id: _uid(), icon, name, notes: [] });
  _save();
  window._notesSheetClose();
  _renderSb();
  window.toast?.(`📂「${name}」を作成しました`);
};

// ── category context menu ──
window._notesCatCtx = function(catId, e) {
  document.getElementById('n-ctx-menu')?.remove();
  const cat = _data.find(c => c.id === catId);
  if (!cat) return;
  const idx = _data.indexOf(cat);
  const isFirst = idx === 0;
  const isLast  = idx === _data.length - 1;

  const menu = document.createElement('div');
  menu.id = 'n-ctx-menu';
  menu.className = 'n-ctx-menu';
  menu.innerHTML = `
    <div class="n-ctx-item" onclick="window._notesCatRename('${catId}')">✎ 名前変更</div>
    <div class="n-ctx-item${isFirst ? ' n-ctx-disabled' : ''}" onclick="${isFirst ? '' : `window._notesCatMove('${catId}',-1)`}">↑ 上に移動</div>
    <div class="n-ctx-item${isLast  ? ' n-ctx-disabled' : ''}" onclick="${isLast  ? '' : `window._notesCatMove('${catId}',1)`}">↓ 下に移動</div>
    <div class="n-ctx-item n-ctx-danger" onclick="window._notesCatDelete('${catId}')">🗑 削除</div>
  `;

  const cx = e.clientX || e.touches?.[0]?.clientX || window.innerWidth / 2;
  const cy = e.clientY || e.touches?.[0]?.clientY || 100;
  menu.style.position = 'fixed';
  menu.style.top  = Math.min(cy + 4, window.innerHeight - 160) + 'px';
  menu.style.left = Math.min(Math.max(4, cx - 100), window.innerWidth - 144) + 'px';
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
};

window._notesCatRename = function(catId) {
  document.getElementById('n-ctx-menu')?.remove();
  const cat = _data.find(c => c.id === catId);
  if (!cat) return;
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'cat-rename';
  overlay.dataset.catId = catId;
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">✎ フォルダを編集</span></div>
      <div class="n-sheet-body">
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div style="flex-shrink:0">
            <label class="n-sheet-lbl">アイコン</label>
            <input id="n-cat-icon" class="n-sheet-input"
                   type="text" value="${_esc(cat.icon)}" maxlength="2"
                   style="width:56px;text-align:center;font-size:20px;padding:6px 4px">
          </div>
          <div style="flex:1">
            <label class="n-sheet-lbl">フォルダ名</label>
            <input id="n-cat-name" class="n-sheet-input" type="text"
                   value="${_esc(cat.name)}"
                   onkeydown="if(event.key==='Enter') window._notesCatRenameConfirm()">
          </div>
        </div>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesCatRenameConfirm()">変更する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  setTimeout(() => document.getElementById('n-cat-name')?.focus(), 80);
  document.addEventListener('keydown', _sheetEscHandler);
};

window._notesCatRenameConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay || overlay.dataset.mode !== 'cat-rename') return;
  const catId = overlay.dataset.catId;
  const cat = _data.find(c => c.id === catId);
  if (!cat) return;
  const name = document.getElementById('n-cat-name')?.value.trim();
  if (!name) { document.getElementById('n-cat-name')?.focus(); return; }
  cat.name = name;
  cat.icon = document.getElementById('n-cat-icon')?.value.trim() || cat.icon;
  _save();
  window._notesSheetClose();
  _renderSb();
  window.toast?.(`📂「${name}」に変更しました`);
};

window._notesCatMove = function(catId, dir) {
  document.getElementById('n-ctx-menu')?.remove();
  const idx = _data.findIndex(c => c.id === catId);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _data.length) return;
  [_data[idx], _data[newIdx]] = [_data[newIdx], _data[idx]];
  _save();
  _renderSb();
};

window._notesCatDelete = function(catId) {
  document.getElementById('n-ctx-menu')?.remove();
  const cat = _data.find(c => c.id === catId);
  if (!cat) return;
  const noteCount = cat.notes.length;
  const msg = noteCount > 0
    ? `「${cat.name}」とその中のノート ${noteCount} 件を削除しますか？`
    : `「${cat.name}」を削除しますか？`;
  _showDeleteConfirmCat(catId, msg);
};

function _showDeleteConfirmCat(catId, msg) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'cat-delete';
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">🗑 フォルダを削除</span></div>
      <div class="n-sheet-body">
        <p style="font-size:13px;color:var(--text2);margin:0">${_esc(msg)}</p>
        <p style="font-size:11px;color:var(--red);margin:8px 0 0">この操作は取り消せません</p>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-danger" onclick="window._notesCatDeleteConfirm('${catId}')">削除する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
}

window._notesCatDeleteConfirm = function(catId) {
  const cat = _data.find(c => c.id === catId);
  if (!cat) return;
  const name = cat.name;
  // clean up active / recent refs
  if (cat.notes.some(n => n.id === _activeId)) {
    _activeId = null;
    for (const c of _data) {
      if (c.id === catId) continue;
      if (c.notes.length) { _activeId = c.notes[0].id; break; }
    }
  }
  _recentIds = _recentIds.filter(id => !cat.notes.some(n => n.id === id));
  _data = _data.filter(c => c.id !== catId);
  _save();
  window._notesSheetClose();
  _renderSb();
  if (_activeId) _renderNote(_activeId);
  else document.getElementById('notesContent').innerHTML = '';
  _renderRecent();
  window.toast?.(`🗑「${name}」を削除しました`);
};

// ── delete ──
window._notesDelete = function(noteId) {
  _closeCtx();
  const r = _findNote(noteId);
  if (!r) return;
  _showDeleteConfirm(noteId, r.note.name);
};

function _showDeleteConfirm(noteId, name) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.innerHTML = `
    <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr">
        <span class="n-sheet-title">🗑 ノートを削除</span>
      </div>
      <div class="n-sheet-body">
        <p class="n-sheet-msg">「<b>${_esc(name)}</b>」を削除しますか？<br>この操作は元に戻せません。</p>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-danger" onclick="window._notesDeleteConfirm('${noteId}')">削除する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
}

window._notesDeleteConfirm = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  const name = r.note.name;
  if (r.cat) {
    r.cat.notes = r.cat.notes.filter(n => n.id !== noteId);
  } else {
    _root = _root.filter(n => n.id !== noteId);
  }
  _save();

  // update active selection
  if (_activeId === noteId) {
    _activeId = null;
    if (_root.length) { _activeId = _root[0].id; }
    else {
      for (const cat of _data) {
        if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
      }
    }
  }
  _recentIds = _recentIds.filter(id => id !== noteId);

  window._notesSheetClose();
  _renderSb();
  if (_activeId) _renderNote(_activeId); else document.getElementById('notesContent').innerHTML = '';
  _renderRecent();
  window.toast?.(`🗑「${name}」を削除しました`);
};

// ── create / rename sheet ──
function _showCreateSheet({ mode = 'create', catId = null, noteId = null, currentName = '' } = {}) {
  _removeSheet();
  const isRename = mode === 'rename';
  const title = isRename ? '✎ ノートを名前変更' : '📓 新しいノートを作成';

  const catOptions = `<option value=""${!catId ? ' selected' : ''}>（フォルダなし）</option>` +
    _data.map(c =>
      `<option value="${c.id}"${c.id === catId ? ' selected' : ''}>${_esc(c.icon + ' ' + c.name)}</option>`
    ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr">
        <span class="n-sheet-title">${title}</span>
      </div>
      <div class="n-sheet-body">
        <label class="n-sheet-lbl">ノート名</label>
        <input id="n-sheet-name" class="n-sheet-input" type="text"
               placeholder="例：バックチョーク" value="${_esc(currentName)}"
               onkeydown="if(event.key==='Enter') window._notesSheetConfirm()">
        ${!isRename ? `
        <label class="n-sheet-lbl" style="margin-top:12px">カテゴリ</label>
        <select id="n-sheet-cat" class="n-sheet-select">${catOptions}</select>
        <label class="n-sheet-lbl" style="margin-top:12px">習得度</label>
        <select id="n-sheet-status" class="n-sheet-select">
          <option value="new">新規</option>
          <option value="wip">学習中</option>
          <option value="done">習得</option>
          <option value="review">要復習</option>
        </select>
        ` : `<input type="hidden" id="n-sheet-note-id" value="${noteId || ''}">`}
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesSheetConfirm()">
          ${isRename ? '変更する' : '作成する'}
        </button>
      </div>
    </div>
  `;
  overlay.dataset.mode = mode;
  overlay.dataset.noteId = noteId || '';
  overlay.dataset.catId = catId || '';
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  setTimeout(() => document.getElementById('n-sheet-name')?.focus(), 80);
  document.addEventListener('keydown', _sheetEscHandler);
}

function _removeSheet() {
  document.getElementById('n-sheet-overlay')?.remove();
  document.removeEventListener('keydown', _sheetEscHandler);
}

function _sheetEscHandler(e) {
  if (e.key === 'Escape') window._notesSheetClose();
}

window._notesSheetClose = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  overlay.classList.remove('vis');
  window._notesInsertAfterIdx = null;
  setTimeout(_removeSheet, 200);
};

window._notesSheetConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const mode = overlay.dataset.mode;
  const name = document.getElementById('n-sheet-name')?.value.trim();
  if (!name) { document.getElementById('n-sheet-name')?.focus(); return; }

  if (mode === 'rename') {
    const noteId = overlay.dataset.noteId;
    const r = _findNote(noteId);
    if (r) {
      r.note.name = name;
      r.note.updatedAt = Date.now();
      _save();
      window._notesSheetClose();
      _renderSb();
      if (_activeId === noteId) _renderNote(noteId);
      _renderRecent();
      window.toast?.(`✎ 「${name}」に名前を変更しました`);
    }
  } else {
    const catId = document.getElementById('n-sheet-cat')?.value;
    const initStatus = document.getElementById('n-sheet-status')?.value || 'new';
    const newNote = {
      id: _uid(), name, status: initStatus, tags: [],
      updatedAt: Date.now(),
      blocks: []
    };
    if (catId) {
      const cat = _data.find(c => c.id === catId);
      if (cat) cat.notes.push(newNote); else _root.push(newNote);
    } else {
      _root.push(newNote);
    }
    _save();
    window._notesSheetClose();
    _activeId = newNote.id;
    _recentIds = [newNote.id, ..._recentIds].slice(0, 3);
    _renderSb();
    _renderNote(newNote.id);
    _renderRecent();
    _closeSb();
    window.toast?.(`📓「${name}」を作成しました`);
  }
};

// ── sidebar ──
// ── サイドバーノート並び替え DnD ──
window._notesSbDragStart = function(e, noteId, catId) {
  _sbDragNoteId = noteId;
  _sbDragCatId  = catId;
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
  e.currentTarget.classList.add('n-sb-dragging');
};
window._notesSbDragOver = function(e, noteId) {
  if (!_sbDragNoteId || _sbDragNoteId === noteId) return;
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.n-note-item.n-sb-drag-over').forEach(el => el.classList.remove('n-sb-drag-over'));
  e.currentTarget.classList.add('n-sb-drag-over');
};
window._notesSbDragLeave = function(e) {
  e.currentTarget.classList.remove('n-sb-drag-over');
};
window._notesSbDrop = function(e, targetNoteId, targetCatId) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.n-note-item').forEach(el => el.classList.remove('n-sb-drag-over', 'n-sb-dragging'));
  const srcNoteId = _sbDragNoteId;
  const srcCatId  = _sbDragCatId;
  _sbDragNoteId = null; _sbDragCatId = null;
  if (!srcNoteId || srcNoteId === targetNoteId || srcCatId !== targetCatId) return;
  const cat = _data.find(c => c.id === srcCatId);
  if (!cat) return;
  const fromIdx = cat.notes.findIndex(n => n.id === srcNoteId);
  const toIdx   = cat.notes.findIndex(n => n.id === targetNoteId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [note] = cat.notes.splice(fromIdx, 1);
  cat.notes.splice(toIdx, 0, note);
  _save();
  _renderSb();
};
window._notesSbDragEnd = function() {
  document.querySelectorAll('.n-note-item').forEach(el => el.classList.remove('n-sb-drag-over', 'n-sb-dragging'));
  _sbDragNoteId = null; _sbDragCatId = null;
};

function _renderSb() {
  const tree = document.getElementById('notesSbTree');
  if (!tree) return;

  // status filter tabs
  const tabs = [
    { k: null,     label: '全て' },
    { k: 'new',    label: '新規' },
    { k: 'wip',    label: '学習中' },
    { k: 'done',   label: '習得' },
    { k: 'review', label: '要復習' }
  ];
  let h = `<div class="n-status-tabs">` +
    tabs.map(t => `<button class="n-status-tab${_statusFilter === t.k ? ' active' : ''}"
      onclick="window._notesSetFilter(${t.k === null ? 'null' : `'${t.k}'`})">${t.label}</button>`).join('') +
    `</div>`;

  // フォルダなしノートをリスト上部に表示
  const visRoot = _statusFilter ? _root.filter(n => n.status === _statusFilter) : _root;
  if (visRoot.length > 0) {
    h += `<div class="n-root-notes">` +
      visRoot.map(n => `
        <div class="n-note-item${n.id === _activeId ? ' active' : ''}"
             onclick="window._notesOpenNote('${n.id}',event)">
          <span class="n-note-dot ${STATUS_DOT[n.status] || ''}"></span>
          <span class="n-note-name">${_esc(n.name)}</span>
          <button class="n-note-more" title="オプション"
                  onclick="window._notesCtxMenu('${n.id}',event)">⋯</button>
        </div>`).join('') +
      `</div>`;
  }

  for (const cat of _data) {
    const visNotes = _statusFilter ? cat.notes.filter(n => n.status === _statusFilter) : cat.notes;
    if (_statusFilter && visNotes.length === 0) continue;
    const isOpen = visNotes.some(n => n.id === _activeId) || cat.notes.length === 0 || !_statusFilter;
    h += `<div class="n-cat${isOpen ? ' open' : ''}" id="n-cat-${cat.id}">
      <div class="n-cat-hdr" onclick="window._notesTogCat('${cat.id}',event)">
        <span class="n-cat-arrow">▶</span>
        <span class="n-cat-icon">${cat.icon}</span>
        <span class="n-cat-name">${_esc(cat.name)}</span>
        <span class="n-cat-cnt">${visNotes.length}</span>
        <button class="n-cat-add" title="このカテゴリにノートを追加"
                onclick="event.stopPropagation();window.notesNew('${cat.id}')">＋</button>
        <button class="n-cat-more" title="フォルダオプション"
                onclick="event.stopPropagation();window._notesCatCtx('${cat.id}',event)">⋯</button>
      </div>
      <div class="n-cat-notes">
        ${visNotes.map(n => `
          <div class="n-note-item${n.id === _activeId ? ' active' : ''}"
               draggable="true"
               ondragstart="window._notesSbDragStart(event,'${n.id}','${cat.id}')"
               ondragover="window._notesSbDragOver(event,'${n.id}')"
               ondragleave="window._notesSbDragLeave(event)"
               ondrop="window._notesSbDrop(event,'${n.id}','${cat.id}')"
               ondragend="window._notesSbDragEnd()"
               onclick="window._notesOpenNote('${n.id}',event)">
            <span class="n-note-dot ${STATUS_DOT[n.status] || ''}"></span>
            <span class="n-note-name">${_esc(n.name)}</span>
            <button class="n-note-more" title="オプション"
                    onclick="window._notesCtxMenu('${n.id}',event)">⋯</button>
          </div>`).join('')}
      </div>
    </div>`;
  }
  h += `<div class="n-add-cat" onclick="window.notesCatNew()">＋ カテゴリを追加</div>`;
  tree.innerHTML = h;
}

window._notesSetFilter = function(s) {
  _statusFilter = s;
  _renderSb();
};

const STATUS_CYCLE = ['new', 'wip', 'done', 'review'];
window._notesTogStatus = function(id) {
  const r = _findNote(id);
  if (!r) return;
  const cur = r.note.status || 'new';
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
  r.note.status = next;
  r.note.updatedAt = Date.now();
  _save();
  _renderSb();
  _renderNote(id);
  window.toast?.(`習得度: ${STATUS_LABEL[next]}`);
};

// ── recent chips (mobile) ──
function _renderRecent() {
  const el = document.getElementById('notesRecent');
  if (!el || !_recentIds.length) { if (el) el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = '<span class="n-recent-lbl">最近:</span>' +
    _recentIds.map(id => {
      const r = _findNote(id);
      if (!r) return '';
      return `<span class="n-recent-chip${id === _activeId ? ' active' : ''}"
                    onclick="window._notesOpenNote('${id}',event)">${_esc(r.note.name)}</span>`;
    }).join('');
}

// ── block rendering ──
function _blockHTML(block, idx, noteId, total) {
  const del = `<button class="n-block-del" title="削除"
    onclick="event.stopPropagation();window._notesBlockDel('${noteId}',${idx})">✕</button>`;
  const upBtn = idx > 0
    ? `<button class="n-block-move n-block-up" title="上へ" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},-1)">↑</button>`
    : `<button class="n-block-move n-block-up" style="visibility:hidden" tabindex="-1">↑</button>`;
  const dnBtn = idx < total - 1
    ? `<button class="n-block-move n-block-dn" title="下へ" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},1)">↓</button>`
    : `<button class="n-block-move n-block-dn" style="visibility:hidden" tabindex="-1">↓</button>`;
  const drag = `<div class="n-drag-handle" draggable="true" title="ドラッグして並び替え"
    ondragstart="window._notesDragStart(event,'${noteId}',${idx})">⠿</div>`;
  const wrapAttrs = `data-note-id="${noteId}" data-idx="${idx}"`;
  const editable = (cls) =>
    `<div class="${cls} n-editable" contenteditable="true"
          data-idx="${idx}" data-note-id="${noteId}"
          onblur="window._notesBlockSave(this)"
          onkeydown="window._notesBlockKeydown(this,event)"
     >${block.richText ? block.content : _esc(block.content).replace(/\n/g, '<br>')}</div>`;

  switch (block.type) {
    case 'h2':    return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-h2')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'text':  return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-text')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'quote': return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-quote')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'video': {
      // carousel blocks are grouped by _renderBlocks — only inline reaches here
      const thumbUrl = _blockThumbUrl(block);
      const thumbEl = thumbUrl
        ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:18px',textContent:'🎥'}))">`
        : `<span style="font-size:18px">🎥</span>`;
      const modeBtn = `<button class="n-bvi-mode-btn" title="カードに切替"
        onclick="event.stopPropagation();window._notesVidToggleMode('${noteId}',${idx})">🎠</button>`;
      return `<div class="n-block-wrap n-block-wrap-card" id="n-vid-wrap-${noteId}-${idx}" ${wrapAttrs}>
        <div class="n-b-video-inline">
          <div class="n-bvi-header" onclick="window._notesVidTogglePlayer('${noteId}',${idx})">
            <div class="n-bvi-thumb">${thumbEl}
              <div class="n-bvi-play-badge"><div class="n-bvi-play-icon">▶</div></div>
            </div>
            <div class="n-bvi-info">
              <div class="n-bvi-ttl">${_esc(block.title || block.videoId || '')}</div>
              <div class="n-bvi-ch">${_esc(block.channel || '')}</div>
              <div class="n-bvi-hint">▶ タップして展開再生</div>
            </div>
            ${modeBtn}
          </div>
          <div class="n-bvi-player" id="n-bvi-player-${noteId}-${idx}"></div>
        </div>${drag}${upBtn}${dnBtn}${del}</div>`;
    }
    case 'image': {
      if (block.refSnapId) {
        const srcVid = (window.videos || []).find(v => v.id === block.refVideoId);
        const caption = `📎 ${_esc(srcVid?.title || block.refVideoId || 'VPanelより')}`;
        return `<div class="n-block-wrap n-block-wrap-card" ${wrapAttrs}>
          <div class="n-b-image">
            <div class="n-ref-snap-load" data-ref-snap-id="${_esc(block.refSnapId)}">
              <span style="color:var(--text3);font-size:11px">📷 読み込み中…</span>
            </div>
            <div class="n-b-img-caption">${caption}</div>
          </div>${drag}${upBtn}${dnBtn}${del}</div>`;
      }
      if (block.snapId) {
        return `<div class="n-block-wrap n-block-wrap-snap n-block-wrap-card" data-snap-id="${_esc(block.snapId)}" data-note-id="${noteId}" data-idx="${idx}" ${wrapAttrs}>
          <div id="n-snap-${_esc(block.snapId)}" class="n-snap-section"></div>${drag}${upBtn}${dnBtn}${del}</div>`;
      }
      // legacy: data URL stored directly
      return `<div class="n-block-wrap n-block-wrap-card" ${wrapAttrs}>
        <div class="n-b-image">
          <img src="${_esc(block.src)}" alt="${_esc(block.caption || '')}" class="n-b-img">
          ${block.caption ? `<div class="n-b-img-caption">${_esc(block.caption)}</div>` : ''}
        </div>${drag}${upBtn}${dnBtn}${del}</div>`;
    }
    case 'map': {
      const nodeCount = (block.nodes||[]).length;
      const edgeCount = (block.edges||[]).length;
      return `<div class="n-block-wrap n-block-wrap-card" ${wrapAttrs}>
        <div class="n-b-map" onclick="window._notesOpenMap('${noteId}',${idx})">
          <div class="n-b-map-icon">🗺</div>
          <div class="n-b-map-info">
            <div class="n-b-map-name">${_esc(block.name||'マップ')}</div>
            <div class="n-b-map-meta">${nodeCount}ノード · ${edgeCount}接続</div>
          </div>
          <div class="n-b-map-open">編集 →</div>
        </div>${drag}${upBtn}${dnBtn}${del}</div>`;
    }
    default: return '';
  }
}

// ── inline block editing ──
const _RICH_TAGS = /^(b|strong|i|em|u|s|strike|span|br|font)$/i;
function _sanitizeRichHtml(html) {
  // Strip any tags that aren't safe inline formatting
  return html.replace(/<\/?([a-z][a-z0-9]*)[^>]*>/gi, (match, tag) =>
    _RICH_TAGS.test(tag) ? match : ''
  ).replace(/<br\s*\/?>/gi, '\n');
}

window._notesBlockSave = function(el) {
  // カラム内ブロックの保存
  if (el.dataset.colIdx !== undefined && el.dataset.colIdx !== '') {
    const noteId = el.dataset.noteId;
    const colIdx = parseInt(el.dataset.colIdx);
    const slot = parseInt(el.dataset.colSlot);
    const bIdx = parseInt(el.dataset.colBidx);
    const r = _findNote(noteId);
    if (!r) return;
    const colBlock = r.note.blocks[colIdx];
    if (!colBlock || colBlock.type !== 'col') return;
    const block = colBlock.cols[slot]?.[bIdx];
    if (!block) return;
    const html = el.innerHTML;
    const hasRich = /<(b|strong|i|em|u|s|strike|span|font)[^>]*>/i.test(html);
    if (hasRich) { block.content = _sanitizeRichHtml(html); block.richText = true; }
    else { block.content = el.innerText.replace(/\n{3,}/g, '\n\n').trim(); delete block.richText; }
    r.note.updatedAt = Date.now();
    _save();
    return;
  }
  const noteId = el.dataset.noteId;
  const idx = parseInt(el.dataset.idx);
  const r = _findNote(noteId);
  if (!r) return;
  const block = r.note.blocks[idx];
  if (!block) return;

  const html = el.innerHTML;
  const hasRich = /<(b|strong|i|em|u|s|strike|span|font)[^>]*>/i.test(html);

  if (hasRich) {
    const clean = _sanitizeRichHtml(html);
    if (clean === block.content && block.richText) return;
    block.content = clean;
    block.richText = true;
  } else {
    const text = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
    if (text === block.content && !block.richText) return;
    block.content = text;
    delete block.richText;
  }
  r.note.updatedAt = Date.now();
  _save();
};

const _isTouchDevice = () => 'ontouchstart' in window;

window._notesBlockKeydown = function(el, e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertLineBreak');
    setTimeout(() => window._notesBlockSave(el), 0);
  }
};

window._notesBlockDel = function(noteId, idx) {
  const r = _findNote(noteId);
  if (!r) return;
  if (r.note.blocks.length <= 1) return; // keep at least one block
  r.note.blocks.splice(idx, 1);
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesBlockMove = function(noteId, idx, dir) {
  const r = _findNote(noteId);
  if (!r) return;
  const blocks = r.note.blocks;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= blocks.length) return;
  [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesInsertTextAt = function(noteId, afterIdx) {
  const r = _findNote(noteId);
  if (!r) return;
  r.note.blocks.splice(afterIdx + 1, 0, { type: 'text', content: '' });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
  setTimeout(() => {
    document.querySelector(`[data-note-id="${noteId}"][data-idx="${afterIdx + 1}"]`)?.focus();
  }, 40);
};

window._notesInsertVideoAt = function(noteId, afterIdx) {
  window._notesInsertAfterIdx = afterIdx;
  window._notesShowVidPicker?.(noteId);
};

window._notesInsertImageAt = function(noteId, afterIdx) {
  window._notesInsertAfterIdx = afterIdx;
  window._notesAddImageBlock?.(noteId);
};

window._notesDragStart = function(e, noteId, idx, endIdx) {
  _dragSrcNoteId = noteId;
  _dragSrcIdx = idx;
  _dragSrcEndIdx = endIdx ?? idx;
  _dragSrcSlot = null;
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest?.('.n-block-wrap')?.classList.add('n-dragging');
};

window._notesColDragStart = function(e, noteId, colIdx, slot, bIdx) {
  _dragSrcNoteId = noteId;
  _dragSrcIdx = null;
  _dragSrcEndIdx = null;
  _dragSrcSlot = { colIdx, slot, bIdx };
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
  e.target.closest?.('.n-col-block-wrap')?.classList.add('n-col-dragging');
};

// contenteditable がdragover/dropを横取りするためドキュメントレベルで処理
(function _initNotesDnd() {
  let _dndOverWrap = null;
  let _dndOverSlot = null;

  function _clearHighlights() {
    _dndOverWrap?.classList.remove('n-drag-over');
    _dndOverWrap = null;
    _dndOverSlot?.classList.remove('n-col-slot-over');
    _dndOverSlot = null;
  }

  document.addEventListener('dragover', function(e) {
    if (_dragSrcNoteId == null) return;
    e.preventDefault();
    // colスロット内 → スロットをハイライト（ただしコラム→コラム外はwrapを優先）
    const slotEl = _dragSrcSlot == null
      ? e.target.closest?.('.n-col-slot[data-note-id]')  // top→col
      : null; // col→top では slot ではなく wrap を見る
    const wrapEl = e.target.closest?.('.n-block-wrap[data-note-id]');

    if (slotEl && slotEl !== _dndOverSlot) {
      _clearHighlights();
      _dndOverSlot = slotEl;
      slotEl.classList.add('n-col-slot-over');
    } else if (!slotEl && wrapEl && wrapEl !== _dndOverWrap) {
      _clearHighlights();
      _dndOverWrap = wrapEl;
      wrapEl.classList.add('n-drag-over');
    } else if (!slotEl && !wrapEl) {
      _clearHighlights();
    }
  });

  document.addEventListener('drop', function(e) {
    if (_dragSrcNoteId == null) return;
    e.preventDefault();
    document.querySelectorAll('.n-block-wrap').forEach(el => el.classList.remove('n-drag-over', 'n-dragging'));
    document.querySelectorAll('.n-col-slot').forEach(el => el.classList.remove('n-col-slot-over'));
    document.querySelectorAll('.n-col-block-wrap').forEach(el => el.classList.remove('n-col-dragging'));
    _dndOverWrap = null; _dndOverSlot = null;

    const srcNoteId = _dragSrcNoteId;
    const srcSlot   = _dragSrcSlot;
    const srcIdx    = _dragSrcIdx;
    const srcEndIdx = _dragSrcEndIdx;
    _dragSrcNoteId = null; _dragSrcIdx = null; _dragSrcEndIdx = null; _dragSrcSlot = null;

    const r = _findNote(srcNoteId);
    if (!r) return;

    const slotEl = e.target.closest?.('.n-col-slot[data-note-id]');
    const wrapEl = e.target.closest?.('.n-block-wrap[data-note-id]');

    if (slotEl && slotEl.dataset.noteId === srcNoteId && srcSlot == null) {
      // ── top → col ──
      const dstColIdx = parseInt(slotEl.dataset.colIdx);
      const dstSlot   = parseInt(slotEl.dataset.slot);
      const count     = (srcEndIdx ?? srcIdx) - srcIdx + 1;
      const toMove    = r.note.blocks.slice(srcIdx, srcIdx + count);
      if (toMove.some(mb => mb.type === 'col')) return; // col内にcolは不可
      r.note.blocks.splice(srcIdx, count);
      const adjustedColIdx = dstColIdx > srcIdx ? dstColIdx - count : dstColIdx;
      const dstColBlock = r.note.blocks[adjustedColIdx];
      if (!dstColBlock || dstColBlock.type !== 'col') return;
      if (!dstColBlock.cols[dstSlot]) dstColBlock.cols[dstSlot] = [];
      dstColBlock.cols[dstSlot].push(...toMove);

    } else if (wrapEl && wrapEl.dataset.noteId === srcNoteId && srcSlot != null) {
      // ── col → top ──
      const dst        = parseInt(wrapEl.dataset.idx);
      const srcColBlock = r.note.blocks[srcSlot.colIdx];
      if (!srcColBlock || srcColBlock.type !== 'col') return;
      const [moved] = srcColBlock.cols[srcSlot.slot].splice(srcSlot.bIdx, 1);
      // colIdx 以降の top-level index は変わらない（colブロック自体は残る）
      const insertAt = dst > srcSlot.colIdx ? dst : dst;
      r.note.blocks.splice(insertAt, 0, moved);

    } else if (wrapEl && wrapEl.dataset.noteId === srcNoteId && srcSlot == null) {
      // ── top → top（既存）──
      const dst   = parseInt(wrapEl.dataset.idx);
      const count = (srcEndIdx ?? srcIdx) - srcIdx + 1;
      if (isNaN(dst) || srcIdx === dst) return;
      const moved = r.note.blocks.splice(srcIdx, count);
      const insertAt = dst > srcIdx ? dst - count : dst;
      r.note.blocks.splice(insertAt, 0, ...moved);

    } else {
      return;
    }

    r.note.updatedAt = Date.now();
    _save();
    _renderNote(srcNoteId);
  });

  document.addEventListener('dragend', function() {
    document.querySelectorAll('.n-block-wrap').forEach(el => el.classList.remove('n-drag-over', 'n-dragging'));
    document.querySelectorAll('.n-col-slot').forEach(el => el.classList.remove('n-col-slot-over'));
    document.querySelectorAll('.n-col-block-wrap').forEach(el => el.classList.remove('n-col-dragging'));
    _dndOverWrap = null; _dndOverSlot = null;
    _dragSrcNoteId = null; _dragSrcIdx = null; _dragSrcEndIdx = null; _dragSrcSlot = null;
  });
})();

// Touch drag-and-drop for mobile
(function _initNotesTouchDnd() {
  let _src = null;
  let _overWrap = null;

  document.addEventListener('touchstart', function(e) {
    const handle = e.target.closest('.n-drag-handle');
    if (!handle) return;
    const wrap = handle.closest('.n-block-wrap[data-note-id]');
    if (!wrap) return;
    _src = {
      noteId: wrap.dataset.noteId,
      idx: parseInt(wrap.dataset.idx),
      endIdx: parseInt(wrap.dataset.idxEnd ?? wrap.dataset.idx)
    };
    wrap.classList.add('n-dragging');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (!_src) return;
    e.preventDefault();
    const t = e.touches[0];
    const dragging = document.querySelector('.n-block-wrap.n-dragging');
    if (dragging) dragging.style.visibility = 'hidden';
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (dragging) dragging.style.visibility = '';
    const wrap = el?.closest('.n-block-wrap[data-note-id]');
    if (wrap === _overWrap) return;
    _overWrap?.classList.remove('n-drag-over');
    _overWrap = wrap || null;
    wrap?.classList.add('n-drag-over');
  }, { passive: false });

  document.addEventListener('touchend', function() {
    if (!_src) return;
    document.querySelectorAll('.n-block-wrap').forEach(el => el.classList.remove('n-drag-over', 'n-dragging'));
    const wrap = _overWrap;
    _overWrap = null;
    const { noteId: srcNoteId, idx: src, endIdx: srcEnd } = _src;
    _src = null;
    if (!wrap) return;
    const targetNoteId = wrap.dataset.noteId;
    const dst = parseInt(wrap.dataset.idx);
    if (targetNoteId !== srcNoteId || isNaN(dst) || src === dst) return;
    const r = _findNote(targetNoteId);
    if (!r) return;
    const blocks = r.note.blocks;
    const count = srcEnd - src + 1;
    const moved = blocks.splice(src, count);
    const insertAt = dst > src ? dst - count : dst;
    blocks.splice(insertAt, 0, ...moved);
    r.note.updatedAt = Date.now();
    _save();
    _renderNote(targetNoteId);
  });
})();

window._notesSave = function(noteId) {
  const btn = document.getElementById('n-save-btn-' + noteId);
  if (btn) { btn.textContent = '✅ 保存済み'; btn.disabled = true; setTimeout(() => { if (btn) { btn.textContent = '💾 保存'; btn.disabled = false; } }, 2000); }
  window._firebaseSaveNotes?.(_data);
};

window._notesHeaderSave = function() {
  const lbl = document.getElementById('nHeaderSaveLbl');
  const btn = document.getElementById('nHeaderSaveBtn');
  if (btn) btn.disabled = true;
  if (lbl) lbl.textContent = '保存中…';
  window._firebaseSaveNotes?.(_data);
  setTimeout(() => {
    if (lbl) lbl.textContent = '完了';
    setTimeout(() => { if (lbl) lbl.textContent = '保存'; if (btn) btn.disabled = false; }, 1500);
  }, 600);
};

window._notesAddTextBlock = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, { type: 'text', content: '' });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
  setTimeout(() => {
    const all = document.querySelectorAll(`[data-note-id="${noteId}"][contenteditable]`);
    all[all.length - 1]?.focus();
  }, 40);
};

// ── carousel & inline helpers ──
const STATUS_COLOR = { 'マスター':'#22c55e', '練習中':'#f59e0b', '理解':'#3b82f6' };

function _renderCarouselGroup(group, noteId) {
  const firstIdx = group[0].idx;
  const lastIdx  = group[group.length - 1].idx;
  const cards = group.map(({ block: b, idx }, gi) => {
    const thumbSrc = _blockThumbUrl(b);
    const thumbEl = thumbSrc
      ? `<img src="${thumbSrc}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:22px',textContent:'🎥'}))">`
      : `<span style="font-size:22px">🎥</span>`;
    const v = (window.videos || []).find(x => x.id === b.videoId);
    const status = v?.status || b.status || '';
    const sColor = STATUS_COLOR[status] || '';
    const badge = sColor ? `<span class="n-vc-badge" style="color:${sColor};background:${sColor}22">${_esc(status)}</span>` : '';
    const prevTitle = gi === 0 ? 'カルーセルから外して上へ' : '左へ';
    const nextTitle = gi === group.length - 1 ? 'カルーセルから外して下へ' : '右へ';
    const prevBtn = `<button class="n-vc-prev" title="${prevTitle}" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},-1)">←</button>`;
    const nextBtn = `<button class="n-vc-next" title="${nextTitle}" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},1)">→</button>`;
    const cardDrag = `<div class="n-vc-drag" draggable="true" title="ドラッグして移動"
      ondragstart="event.stopPropagation();window._notesDragStart(event,'${noteId}',${idx},${idx})">⠿</div>`;
    return `<div class="n-vc-card" onclick="window._notesOpenVPanel?.('${_esc(noteId)}','${_esc(b.videoId)}')">
      <div class="n-vc-thumb">${thumbEl}</div>
      <div class="n-vc-info">
        <div class="n-vc-ttl">${_esc(b.title || b.videoId || '')}</div>
        <div class="n-vc-ch">${_esc(b.channel || v?.channel || v?.ch || '')}</div>
        ${badge}
      </div>
      ${prevBtn}${nextBtn}${cardDrag}
      <button class="n-vc-del" title="削除"
        onclick="event.stopPropagation();window._notesBlockDel('${noteId}',${idx})">✕</button>
      <button class="n-vc-mode" title="インラインに切替"
        onclick="event.stopPropagation();window._notesVidToggleMode('${noteId}',${idx})">📺</button>
    </div>`;
  }).join('');
  const groupDrag = `<div class="n-drag-handle" draggable="true" title="ドラッグして並び替え"
    ondragstart="window._notesDragStart(event,'${noteId}',${firstIdx},${lastIdx})">⠿</div>`;
  return `<div class="n-block-wrap n-block-wrap-carousel" data-note-id="${noteId}" data-idx="${firstIdx}" data-idx-end="${lastIdx}">
    <div class="n-vc-scroll">${cards}</div>${groupDrag}
  </div>`;
}

function _insertStrip(noteId, afterIdx) {
  return `<div class="n-ins-strip">
    <div class="n-ins-line"></div>
    <button class="n-ins-btn" onclick="window._notesInsertTextAt('${noteId}',${afterIdx})">テキスト</button>
    <button class="n-ins-btn" onclick="window._notesInsertVideoAt('${noteId}',${afterIdx})">動画</button>
    <button class="n-ins-btn" onclick="window._notesInsertImageAt('${noteId}',${afterIdx})">画像</button>
    <button class="n-ins-btn" onclick="window._notesInsertColAt('${noteId}',${afterIdx})">カラム</button>
    <div class="n-ins-line"></div>
  </div>`;
}

function _renderBlocks(blocks, noteId) {
  const parts = [];
  const total = blocks.length;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'col') {
      parts.push(_renderColBlock(b, i, noteId));
      if (i < blocks.length - 1) parts.push(_insertStrip(noteId, i));
      i++;
    } else if (b.type === 'video' && b.viewMode !== 'inline') {
      const group = [];
      while (i < blocks.length && blocks[i].type === 'video' && blocks[i].viewMode !== 'inline') {
        group.push({ block: blocks[i], idx: i });
        i++;
      }
      parts.push(_renderCarouselGroup(group, noteId));
      if (i < blocks.length) parts.push(_insertStrip(noteId, i - 1));
    } else {
      parts.push(_blockHTML(b, i, noteId, total));
      if (i < blocks.length - 1) parts.push(_insertStrip(noteId, i));
      i++;
    }
  }
  return parts.join('');
}

function _renderColBlock(b, idx, noteId) {
  const ratio = b.ratio || [50, 50];
  const cols = b.cols || [[], []];
  const gridCols = ratio.map(r => `${r}fr`).join(' ');
  const ratioKey = ratio.join('-');
  const presets = [[[50,50],'1:1'],[[33,67],'1:2'],[[67,33],'2:1'],[[25,75],'1:3'],[[75,25],'3:1']];
  const ratioHTML = presets.map(([r, label]) => {
    const [l, rv] = r;
    return `<button class="n-col-ratio-btn${r.join('-') === ratioKey ? ' active' : ''}"
      onclick="window._notesColRatio('${noteId}',${idx},'${r.join('-')}')">
      <span class="n-col-ratio-bar"><span style="flex:${l}"></span><span style="flex:${rv}"></span></span>${label}</button>`;
  }).join('');
  const slotsHTML = [0, 1].map(slot => {
    const slotBlocks = cols[slot] || [];
    const blocksHTML = slotBlocks.map((sb, bIdx) => _colBlockHTML(sb, bIdx, noteId, idx, slot)).join('');
    return `<div class="n-col-slot" data-note-id="${noteId}" data-col-idx="${idx}" data-slot="${slot}">
      ${blocksHTML}
      <div class="n-col-slot-add">
        <button onclick="window._notesColAddText('${noteId}',${idx},${slot})">＋ テキスト</button>
        <button onclick="window._notesColAddVid('${noteId}',${idx},${slot})">＋ 動画</button>
        <button onclick="window._notesColAddImg('${noteId}',${idx},${slot})">＋ 画像</button>
        <button onclick="window._notesColAddMap('${noteId}',${idx},${slot})">＋ Map</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="n-block-wrap n-block-col" data-note-id="${noteId}" data-idx="${idx}">
    <div class="n-col-toolbar">
      <div class="n-col-ratios">${ratioHTML}</div>
      <button class="n-col-del" onclick="window._notesBlockDel('${noteId}',${idx})" title="カラムを削除">✕</button>
    </div>
    <div class="n-col-grid" style="grid-template-columns:${gridCols}">${slotsHTML}</div>
  </div>`;
}

function _colBlockHTML(b, bIdx, noteId, colIdx, slot) {
  const del = `<button class="n-cb-del" onclick="event.stopPropagation();window._notesColDelBlock('${noteId}',${colIdx},${slot},${bIdx})" title="削除">✕</button>`;
  const drag = `<div class="n-col-drag-handle" draggable="true" title="ドラッグして移動"
    ondragstart="window._notesColDragStart(event,'${noteId}',${colIdx},${slot},${bIdx})">⠿</div>`;
  const type = b.type || 'text';

  if (type === 'video') {
    const thumbUrl = _blockThumbUrl(b);
    const thumbEl = thumbUrl
      ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:18px',textContent:'🎥'}))">`
      : `<span style="font-size:18px">🎥</span>`;
    return `<div class="n-col-block-wrap">
      ${drag}
      <div class="n-b-video-inline">
        <div class="n-bvi-header" onclick="window._notesColVidToggle('${noteId}',${colIdx},${slot},${bIdx})">
          <div class="n-bvi-thumb">${thumbEl}<div class="n-bvi-play-badge"><div class="n-bvi-play-icon">▶</div></div></div>
          <div class="n-bvi-info">
            <div class="n-bvi-ttl">${_esc(b.title || b.videoId || '')}</div>
            <div class="n-bvi-ch">${_esc(b.channel || '')}</div>
          </div>
        </div>
        <div class="n-bvi-player" id="n-col-player-${noteId}-${colIdx}-${slot}-${bIdx}"></div>
      </div>${del}
    </div>`;
  }

  if (type === 'image' && b.snapId) {
    return `<div class="n-col-block-wrap">
      ${drag}
      <div id="n-snap-${_esc(b.snapId)}" class="n-snap-section"></div>${del}
    </div>`;
  }

  if (type === 'map') {
    const nodeCount = (b.nodes || []).length;
    const edgeCount = (b.edges || []).length;
    return `<div class="n-col-block-wrap">
      ${drag}
      <div class="n-b-map" onclick="window._notesColOpenMap('${noteId}',${colIdx},${slot},${bIdx})">
        <div class="n-b-map-icon">🗺</div>
        <div class="n-b-map-info">
          <div class="n-b-map-name">${_esc(b.name || 'マップ')}</div>
          <div class="n-b-map-meta">${nodeCount}ノード · ${edgeCount}接続</div>
        </div>
        <div class="n-b-map-open">編集 →</div>
      </div>${del}
    </div>`;
  }

  const tag = type === 'h2' ? 'h2' : type === 'quote' ? 'blockquote' : 'div';
  const cls = `n-b-${type} n-editable`;
  const placeholder = type === 'h2' ? '見出し' : type === 'quote' ? '引用' : 'テキストを入力…';
  const content = b.richText ? (b.content || '') : _esc(b.content || '').replace(/\n/g, '<br>');
  return `<div class="n-col-block-wrap">
    ${drag}
    <${tag} class="${cls}" contenteditable="true" placeholder="${placeholder}"
      data-note-id="${noteId}" data-col-idx="${colIdx}" data-col-slot="${slot}" data-col-bidx="${bIdx}"
      onblur="window._notesBlockSave(this)">${content}</${tag}>
    ${del}
  </div>`;
}

window._notesOpenVPanel = function(noteId, videoId) {
  const r = _findNote(noteId);
  if (!r) { window.openVPanel?.(videoId); return; }
  const vids = (window.videos || []);
  const noteVids = r.note.blocks
    .filter(b => b.type === 'video' && b.videoId)
    .map(b => vids.find(v => v.id === b.videoId))
    .filter(Boolean);
  window._noteVidList = noteVids.length > 1 ? noteVids : null;
  window.openVPanel?.(videoId);
};

window._notesAddColBlock = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, {
    type: 'col', ratio: [50, 50],
    cols: [[{ type: 'text', content: '' }], [{ type: 'text', content: '' }]],
  });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesColRatio = function(noteId, idx, ratioStr) {
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b || b.type !== 'col') return;
  b.ratio = ratioStr.split('-').map(Number);
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesColAddText = function(noteId, idx, slot) {
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b || b.type !== 'col') return;
  if (!b.cols[slot]) b.cols[slot] = [];
  b.cols[slot].push({ type: 'text', content: '' });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
  setTimeout(() => {
    const all = document.querySelectorAll(`[data-col-idx="${idx}"][data-col-slot="${slot}"][contenteditable]`);
    all[all.length - 1]?.focus();
  }, 40);
};

window._notesColDelBlock = function(noteId, idx, slot, bIdx) {
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b || b.type !== 'col') return;
  b.cols[slot].splice(bIdx, 1);
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesInsertColAt = function(noteId, afterIdx) {
  window._notesInsertAfterIdx = afterIdx;
  window._notesAddColBlock(noteId);
};

window._notesColAddVid = function(noteId, idx, slot) {
  window._notesColContext = { noteId, colIdx: idx, slot };
  window._notesShowVidPicker?.(noteId);
};

window._notesColAddImg = function(noteId, idx, slot) {
  const r = _findNote(noteId);
  if (!r) return;
  const colBlock = r.note.blocks[idx];
  if (!colBlock || colBlock.type !== 'col') return;
  const snapId = 'note_' + noteId + '_' + Date.now().toString(36);
  if (!colBlock.cols[slot]) colBlock.cols[slot] = [];
  colBlock.cols[slot].push({ type: 'image', snapId, refs: [] });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
  setTimeout(() => _initNoteSnapForCol(noteId, snapId, idx, slot), 50);
};

window._notesColAddMap = function(noteId, idx, slot) {
  const r = _findNote(noteId);
  if (!r) return;
  const colBlock = r.note.blocks[idx];
  if (!colBlock || colBlock.type !== 'col') return;
  if (!colBlock.cols[slot]) colBlock.cols[slot] = [];
  colBlock.cols[slot].push({ type: 'map', name: 'マップ', nodes: [], edges: [], abState: {} });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesColVidToggle = function(noteId, colIdx, slot, bIdx) {
  const playerId = `n-col-player-${noteId}-${colIdx}-${slot}-${bIdx}`;
  const player = document.getElementById(playerId);
  if (!player) return;
  const isOpen = player.classList.contains('open');
  document.querySelectorAll('.n-bvi-player.open').forEach(p => { p.classList.remove('open'); p.innerHTML = ''; });
  if (isOpen) return;
  const r = _findNote(noteId);
  if (!r) return;
  const colBlock = r.note.blocks[colIdx];
  if (!colBlock || colBlock.type !== 'col') return;
  const b = (colBlock.cols[slot] || [])[bIdx];
  if (!b?.videoId) return;
  const platform = b.platform || 'youtube';
  const iframe = document.createElement('iframe');
  if (platform === 'gdrive') {
    const fileId = b.videoId.startsWith('gd-') ? b.videoId.slice(3) : b.videoId;
    iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
  } else if (platform === 'vimeo') {
    const hash = b.vmHash ? `h=${b.vmHash}&` : '';
    iframe.src = `https://player.vimeo.com/video/${b.videoId}?${hash}autoplay=1`;
  } else {
    iframe.src = `https://www.youtube.com/embed/${b.ytId || b.videoId}?autoplay=1&rel=0`;
  }
  iframe.allow = 'autoplay; encrypted-media; fullscreen';
  iframe.allowFullscreen = true;
  player.innerHTML = '';
  player.appendChild(iframe);
  player.classList.add('open');
};

window._notesVidToggleMode = function(noteId, idx) {
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b || b.type !== 'video') return;
  b.viewMode = (b.viewMode === 'inline') ? 'carousel' : 'inline';
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

function _nBviClose(k) {
  if (_nBviTmr[k]) { clearInterval(_nBviTmr[k]); delete _nBviTmr[k]; }
  if (_nBviYtP[k]) { try { _nBviYtP[k].destroy(); } catch(e) {} delete _nBviYtP[k]; }
  if (_nBviVmP[k]) { try { _nBviVmP[k].destroy(); } catch(e) {} delete _nBviVmP[k]; delete _nBviVmT[k]; }
  if (_nBviGdV[k]) { try { _nBviGdV[k].pause(); } catch(e) {} delete _nBviGdV[k]; }
}

function _nBviStartTimer(k) {
  if (_nBviTmr[k]) return;
  _nBviTmr[k] = setInterval(() => {
    const t = _nBviCurTime(k);
    const sl = document.getElementById('n-bvi-ab-sl-' + k);
    if (sl) sl.value = t;
    const st = _nBviGetAb(k);
    const disp = document.getElementById('n-bvi-ab-disp-' + k);
    if (disp) disp.textContent = _nBviFmt(st.activeTab === 'a' ? (st.a ?? t) : (st.b ?? t));
    if (st.looping && st.a != null && st.b != null && t >= st.b) _nBviSeekTo(k, st.a);
  }, 200);
}

window._notesVidTogglePlayer = function(noteId, idx) {
  const k = _nBviKey(noteId, idx);
  const playerId = 'n-bvi-player-' + noteId + '-' + idx;
  const playerEl = document.getElementById(playerId);
  if (!playerEl) return;
  const isOpen = playerEl.classList.contains('open');
  // close all open players
  document.querySelectorAll('.n-bvi-player.open').forEach(p => {
    const m = p.id.match(/^n-bvi-player-(.+)-(\d+)$/);
    if (m) _nBviClose(_nBviKey(m[1], +m[2]));
    p.classList.remove('open');
    p.innerHTML = '';
  });
  if (isOpen) return;

  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b?.videoId) return;
  const platform = b.platform || 'youtube';
  const widthPct = b.vidWidth || 100;

  // init bookmarks from library video
  const libV = _nBviGetLibV(noteId, idx);
  const st = _nBviGetAb(k);
  if (libV?.bookmarks?.length && !(st.bookmarks || []).length) {
    st.bookmarks = (libV.bookmarks || []).map(bm => {
      const o = { a: bm.time ?? bm.a ?? 0, label: bm.label || '', note: bm.note || '' };
      const end = bm.endTime ?? bm.b;
      if (end != null) o.b = end;
      return o;
    });
  }
  if (!st.bookmarks) st.bookmarks = [];

  // build container
  playerEl.innerHTML = '';
  const vidWrap = document.createElement('div');
  vidWrap.id = 'n-bvi-vid-' + k;
  vidWrap.style.cssText = 'width:100%;aspect-ratio:16/9;background:#000;position:relative';
  playerEl.appendChild(vidWrap);

  // ctrl row
  const ctrlRow = document.createElement('div');
  ctrlRow.className = 'n-bvi-ctrl';
  ctrlRow.innerHTML = `<span>📺 再生中</span>
    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)">
      幅 <input type="range" min="30" max="100" step="5" value="${widthPct}"
        style="width:80px" oninput="window._notesVidResize('${noteId}',${idx},+this.value)">
      <span id="n-bvi-w-${noteId}-${idx}">${widthPct}%</span>
    </label>
    <button onclick="window._notesVidTogglePlayer('${noteId}',${idx})">▲ 閉じる</button>`;
  playerEl.appendChild(ctrlRow);

  const isApiPlatform = (platform === 'youtube' && !b.isPlaylist) || platform === 'vimeo';

  // AB section (YT/Vimeo only)
  if (isApiPlatform) {
    const abSec = document.createElement('div');
    abSec.className = 'ab-section';
    const statusBadge = st.a != null && st.b != null
      ? `<span class="ab-status-badge active">${_nBviFmt(st.a)}〜${_nBviFmt(st.b)}</span>`
      : `<span class="ab-status-badge">未設定</span>`;
    abSec.innerHTML = `<div class="ab-hdr" onclick="window._nbviTogAb('${k}')">
      <span class="ab-hdr-label">🔁 ループ再生</span>${statusBadge}
      <span class="ab-toggle">${st.abOpen ? '∧' : '∨'}</span>
    </div>${st.abOpen ? _nBviAbBodyHTML(k, st) : ''}`;
    playerEl.appendChild(abSec);
  }

  // bookmark section
  const bmSec = document.createElement('div');
  bmSec.className = 'bm-section';
  const bms = st.bookmarks;
  const bmOpen = st.bmOpen !== false;
  const bmList = bms.length
    ? bms.map((bm, i) => _nBviBmItemHTML(k, noteId, idx, bm, i)).join('')
    : '<div style="color:var(--text3);font-size:11px;padding:4px 0">ブックマークなし</div>';
  bmSec.innerHTML = `<div class="bm-hdr" onclick="window._nbviTogBm('${k}')">
    <span class="bm-hdr-label" id="n-bvi-bm-lbl-${k}">📌 ブックマーク${bms.length ? ' (' + bms.length + ')' : ''}</span>
    <button class="bm-add-btn" onclick="event.stopPropagation();window._nbviAddBmNow('${k}','${noteId}',${idx})">＋ 現在位置</button>
    <span class="bm-toggle">${bmOpen ? '∧' : '∨'}</span>
  </div>
  ${bmOpen ? `<div class="bm-list" id="n-bvi-bm-list-${k}">${bmList}</div>` : ''}`;
  playerEl.appendChild(bmSec);

  // memo section
  const memo = libV?.memo || '';
  const memoSec = document.createElement('div');
  memoSec.style.cssText = 'padding:6px 8px;border-top:1px solid var(--border)';
  memoSec.innerHTML = `<div style="font-size:10px;color:var(--text3);margin-bottom:3px">📝 メモ（VPanel共有）</div>
    <textarea id="n-bvi-memo-${k}" rows="3"
      style="width:100%;font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);resize:vertical;box-sizing:border-box;font-family:inherit"
      onchange="window._nbviSaveMemo('${k}','${noteId}',${idx})"
    >${_esc(memo)}</textarea>`;
  playerEl.appendChild(memoSec);

  // apply width
  const wrap = document.getElementById('n-vid-wrap-' + noteId + '-' + idx);
  if (wrap) wrap.style.maxWidth = widthPct + '%';
  playerEl.classList.add('open');

  // init player
  if (platform === 'youtube') {
    if (b.isPlaylist) {
      // プレイリスト: iframe embed（videoseries）
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/videoseries?list=${b.videoId}&autoplay=1&rel=0`;
      iframe.allow = 'autoplay; encrypted-media; fullscreen';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'border:none;display:block;width:100%;height:100%';
      vidWrap.appendChild(iframe);
    } else {
    const ytId = b.ytId || b.videoId;
    const doInit = () => {
      if (!document.getElementById('n-bvi-vid-' + k)) return;
      _nBviYtP[k] = new YT.Player('n-bvi-vid-' + k, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1, autoplay: 1, playsinline: 1 },
        events: {
          onReady: e => {
            const dur = e.target.getDuration();
            const sl = document.getElementById('n-bvi-ab-dur-' + k);
            if (sl) document.getElementById('n-bvi-ab-dur-' + k).textContent = _nBviFmt(dur);
            const abSl = document.getElementById('n-bvi-ab-sl-' + k);
            if (abSl && dur > 0) abSl.max = Math.ceil(dur);
            _nBviStartTimer(k);
          }
        }
      });
    };
    if (window.YT && window.YT.Player) { doInit(); }
    else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = window._pendingYTInit;
      window._pendingYTInit = function() { if (prev) prev(); doInit(); };
    }
    } // end !isPlaylist
  } else if (platform === 'vimeo') {
    const hash = b.vmHash ? `?h=${b.vmHash}` : '';
    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${b.videoId}${hash}`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'border:none;display:block;width:100%;height:100%';
    vidWrap.appendChild(iframe);
    _nBviLoadVimeoApi(() => {
      try {
        const vm = new Vimeo.Player(iframe);
        _nBviVmP[k] = vm;
        _nBviVmT[k] = 0;
        vm.on('timeupdate', d => { _nBviVmT[k] = d.seconds || 0; });
        vm.getDuration().then(dur => {
          const sl = document.getElementById('n-bvi-ab-sl-' + k);
          if (sl && dur > 0) sl.max = Math.ceil(dur);
          const lbl = document.getElementById('n-bvi-ab-dur-' + k);
          if (lbl) lbl.textContent = _nBviFmt(dur);
        }).catch(() => {});
        vm.play().catch(() => {});
        _nBviStartTimer(k);
      } catch(e) { console.warn('Vimeo notes player:', e); }
    });
  } else if (platform === 'gdrive') {
    const fileId = b.videoId.startsWith('gd-') ? b.videoId.slice(3) : b.videoId;
    const token = window.getDriveTokenIfAvailable?.();
    if (token) {
      const video = document.createElement('video');
      video.src = `/api/drive?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`;
      video.controls = true; video.playsinline = true; video.autoplay = true;
      video.style.cssText = 'width:100%;height:100%;background:#000';
      _nBviGdV[k] = video;
      vidWrap.appendChild(video);
      _nBviStartTimer(k);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
      iframe.allow = 'autoplay; encrypted-media; fullscreen';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'border:none;display:block;width:100%;height:100%';
      vidWrap.appendChild(iframe);
    }
  } else {
    // x / unknown — fallback iframe
    const iframe = document.createElement('iframe');
    iframe.src = b.url || '';
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'border:none;display:block;width:100%;height:100%';
    vidWrap.appendChild(iframe);
  }
};

// ── inline video AB/BM/Memo callbacks ──
window._nbviTogAb = function(k) {
  const st = _nBviGetAb(k);
  st.abOpen = !st.abOpen;
  const sep = k.lastIndexOf('-'); const noteId = k.slice(0, sep); const idx = +k.slice(sep + 1);
  const playerEl = document.getElementById('n-bvi-player-' + noteId + '-' + idx);
  const abSec = playerEl?.querySelector('.ab-section');
  if (!abSec) return;
  const toggle = abSec.querySelector('.ab-toggle');
  if (toggle) toggle.textContent = st.abOpen ? '∧' : '∨';
  const body = abSec.querySelector('.ab-body');
  if (st.abOpen) { if (!body) abSec.insertAdjacentHTML('beforeend', _nBviAbBodyHTML(k, st)); }
  else { body?.remove(); }
};
window._nbviSetAbTab = function(k, tab) {
  const st = _nBviGetAb(k); st.activeTab = tab;
  ['a','b'].forEach(t => document.getElementById('n-bvi-tab-' + t + '-' + k)?.classList.toggle('on', t === tab));
  const sl = document.getElementById('n-bvi-ab-sl-' + k);
  if (sl) sl.value = tab === 'a' ? (st.a || 0) : (st.b || 0);
  const disp = document.getElementById('n-bvi-ab-disp-' + k);
  if (disp) disp.textContent = _nBviFmt(tab === 'a' ? st.a : st.b);
};
window._nbviSlider = function(k, val) {
  const t = parseFloat(val); const st = _nBviGetAb(k);
  if (st.activeTab === 'a') st.a = t; else st.b = t;
  const disp = document.getElementById('n-bvi-ab-disp-' + k);
  if (disp) disp.textContent = _nBviFmt(t);
  const ea = document.getElementById('n-bvi-ab-a-' + k); if (ea) ea.textContent = _nBviFmt(st.a);
  const eb = document.getElementById('n-bvi-ab-b-' + k); if (eb) eb.textContent = _nBviFmt(st.b);
  _nBviSeekTo(k, t);
};
window._nbviMicro = function(k, secs) {
  const st = _nBviGetAb(k);
  const base = secs === null ? _nBviCurTime(k) : Math.max(0, (st.activeTab === 'a' ? (st.a ?? 0) : (st.b ?? 0)) + secs);
  if (st.activeTab === 'a') st.a = base; else st.b = base;
  const sl = document.getElementById('n-bvi-ab-sl-' + k); if (sl) sl.value = base;
  _nBviSeekTo(k, base);
  const disp = document.getElementById('n-bvi-ab-disp-' + k); if (disp) disp.textContent = _nBviFmt(base);
  const ea = document.getElementById('n-bvi-ab-a-' + k); if (ea) ea.textContent = _nBviFmt(st.a);
  const eb = document.getElementById('n-bvi-ab-b-' + k); if (eb) eb.textContent = _nBviFmt(st.b);
};
window._nbviClearAb = function(k) {
  const st = _nBviGetAb(k); st.a = null; st.b = null; st.looping = false;
  const ea = document.getElementById('n-bvi-ab-a-' + k); if (ea) ea.textContent = '--:--';
  const eb = document.getElementById('n-bvi-ab-b-' + k); if (eb) eb.textContent = '--:--';
  const badge = document.querySelector('.ab-section .ab-status-badge');
  if (badge) { badge.className = 'ab-status-badge'; badge.textContent = '未設定'; }
};
window._nbviSaveAb = function(k) {
  const st = _nBviGetAb(k);
  if (st.a == null || st.b == null) { window.toast?.('開始と終了を設定してください'); return; }
  if (!st.bookmarks) st.bookmarks = [];
  st.bookmarks.push({ a: st.a, b: st.b, label: '', note: '' });
  // parse noteId/idx from k
  const sep = k.lastIndexOf('-'); const noteId = k.slice(0, sep); const idx = +k.slice(sep + 1);
  _nBviSyncBmsToLib(k, noteId, idx);
  _nBviRefreshBm(k, noteId, idx);
  window.toast?.('📌 ブックマークに保存しました');
};
window._nbviTogBm = function(k) {
  const st = _nBviGetAb(k); st.bmOpen = !(st.bmOpen !== false);
  const toggle = document.querySelector(`#n-bvi-bm-lbl-${k}`)?.closest('.bm-section')?.querySelector('.bm-toggle');
  if (toggle) toggle.textContent = st.bmOpen ? '∧' : '∨';
  const sep = k.lastIndexOf('-'); const noteId = k.slice(0, sep); const idx = +k.slice(sep + 1);
  let list = document.getElementById('n-bvi-bm-list-' + k);
  if (st.bmOpen) {
    if (!list) {
      list = document.createElement('div'); list.className = 'bm-list'; list.id = 'n-bvi-bm-list-' + k;
      document.getElementById('n-bvi-bm-lbl-' + k)?.closest('.bm-section')?.appendChild(list);
    }
    _nBviRefreshBm(k, noteId, idx);
  } else { list?.remove(); }
};
window._nbviAddBmNow = function(k, noteId, idx) {
  const st = _nBviGetAb(k); if (!st.bookmarks) st.bookmarks = [];
  st.bookmarks.push({ a: _nBviCurTime(k), label: '', note: '' });
  _nBviSyncBmsToLib(k, noteId, idx);
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviSeekBm = function(k, i) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  _nBviSeekTo(k, bm.a);
  if (bm.b != null) { st.a = bm.a; st.b = bm.b; st.looping = true; }
};
window._nbviDelBm = function(k, noteId, idx, i) {
  const st = _nBviGetAb(k); if (!st.bookmarks) return;
  st.bookmarks.splice(i, 1); st.editBm = null;
  _nBviSyncBmsToLib(k, noteId, idx);
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviBmEdit = function(k, noteId, idx, i) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  st.editBm = { idx: i, field: 'start', origA: bm.a, origB: bm.b };
  _nBviRefreshBm(k, noteId, idx);
  setTimeout(() => {
    const sl = document.getElementById('n-bvi-bm-sl-' + k + '-' + i); if (!sl) return;
    if (_nBviYtP[k]?.getDuration) { const d = _nBviYtP[k].getDuration(); if (d > 0) sl.max = Math.ceil(d); }
    else if (_nBviGdV[k]) { const d = _nBviGdV[k].duration; if (d > 0) sl.max = Math.ceil(d); }
    else if (_nBviVmP[k]) _nBviVmP[k].getDuration().then(d => { if (sl && d > 0) sl.max = Math.ceil(d); }).catch(() => {});
    document.getElementById('n-bvi-bm-lbl-in-' + k + '-' + i)?.focus();
  }, 50);
};
window._nbviBmEditClose = function(k) {
  const st = _nBviGetAb(k); st.editBm = null;
  const sep = k.lastIndexOf('-'); const noteId = k.slice(0, sep); const idx = +k.slice(sep + 1);
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviBmEditSave = function(k, noteId, idx, i) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  const lbl = document.getElementById('n-bvi-bm-lbl-in-' + k + '-' + i);
  const note = document.getElementById('n-bvi-bm-note-' + k + '-' + i);
  if (lbl) bm.label = lbl.value.trim();
  if (note) bm.note = note.value.trim();
  st.editBm = null;
  _nBviSyncBmsToLib(k, noteId, idx);
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviBmTab = function(k, noteId, idx, i, field) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  if (field === 'end' && bm.b == null) bm.b = bm.a;
  st.editBm.field = field;
  _nBviRefreshBm(k, noteId, idx);
  setTimeout(() => {
    const sl = document.getElementById('n-bvi-bm-sl-' + k + '-' + i);
    if (sl) sl.value = field === 'start' ? (bm.a || 0) : (bm.b ?? 0);
  }, 30);
};
window._nbviBmSlider = function(k, noteId, idx, i, val) {
  const t = parseFloat(val); const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  const field = st.editBm?.field || 'start';
  if (field === 'start') bm.a = t; else bm.b = t;
  const disp = document.getElementById('n-bvi-bm-tdisp-' + k + '-' + i); if (disp) disp.textContent = _nBviFmt(t);
  _nBviSeekTo(k, t);
};
window._nbviBmMicro = function(k, noteId, idx, i, secs) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  const field = st.editBm?.field || 'start';
  const cur = field === 'start' ? (bm.a || 0) : (bm.b ?? bm.a ?? 0);
  const t = Math.max(0, cur + secs);
  if (field === 'start') bm.a = t; else bm.b = t;
  _nBviSeekTo(k, t);
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviBmCur = function(k, noteId, idx, i) {
  const t = _nBviCurTime(k); const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm) return;
  const field = st.editBm?.field || 'start';
  if (field === 'start') bm.a = t; else bm.b = t;
  _nBviSeekTo(k, t); _nBviRefreshBm(k, noteId, idx);
};
window._nbviBmEditReset = function(k, noteId, idx, i) {
  const st = _nBviGetAb(k); const bm = (st.bookmarks || [])[i]; if (!bm || !st.editBm) return;
  bm.a = st.editBm.origA; bm.b = st.editBm.origB;
  _nBviRefreshBm(k, noteId, idx);
};
window._nbviSaveMemo = function(k, noteId, idx) {
  const ta = document.getElementById('n-bvi-memo-' + k); if (!ta) return;
  const v = _nBviGetLibV(noteId, idx); if (!v) return;
  v.memo = ta.value;
  window.debounceSave?.();
};

window._notesVidResize = function(noteId, idx, pct) {
  const wrap = document.getElementById(`n-vid-wrap-${noteId}-${idx}`);
  if (wrap) wrap.style.maxWidth = pct + '%';
  const label = document.getElementById(`n-bvi-w-${noteId}-${idx}`);
  if (label) label.textContent = pct + '%';
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (b) { b.vidWidth = pct; r.note.updatedAt = Date.now(); _save(); }
};

// ── note content ──
function _renderNote(id) {
  const r = _findNote(id);
  if (!r) return;
  const { note, cat } = r;

  const bc = document.getElementById('notesBreadcrumb');
  if (bc) bc.innerHTML = cat ? `Notes › ${_esc(cat.name)} › <b>${_esc(note.name)}</b>` : `Notes › <b>${_esc(note.name)}</b>`;

  const content = document.getElementById('notesContent');
  if (!content) return;

  const tagsHTML = (note.tags || []).map(t => `<span class="n-chip">${_esc(t)}</span>`).join('');
  const statusHTML = `<span class="n-s-badge ${STATUS_CLS[note.status] || ''}" style="cursor:pointer" title="クリックで習得度を変更" onclick="window._notesTogStatus('${note.id}')">${STATUS_LABEL[note.status] || ''}</span>`;

  content.innerHTML = `
    <div class="n-page-title">${_esc(note.name)}</div>
    <div class="n-tag-row">${tagsHTML}${statusHTML}</div>
    <div id="n-blocks-${id}">${_renderBlocks(note.blocks, id)}</div>
    <div class="n-note-actions">
      <button class="n-add-inline" onclick="window._notesAddTextBlock('${id}')">＋ テキスト</button>
      <button class="n-add-inline n-add-video-btn" onclick="window._notesShowVidPicker?.('${id}')">＋ 動画を追加</button>
      <button class="n-add-inline" onclick="window._notesAddImageBlock?.('${id}')">📸 画像</button>
      <button class="n-add-inline" onclick="window._notesAddColBlock('${id}')">⊞ カラム</button>
      <button class="n-add-inline" onclick="window._notesAddMapBlock('${id}')">🗺 Map</button>
      <button class="n-add-inline" id="n-save-btn-${id}" onclick="window._notesSave('${id}')">💾 保存</button>
    </div>
  `;

  // スナップショットブロックを初期化（DOM描画後）
  note.blocks.forEach((b, idx) => {
    if (b.type === 'image' && b.snapId) {
      _initNoteSnap(id, b.snapId, b, idx);
    }
    if (b.type === 'col' && b.cols) {
      b.cols.forEach((slotBlocks, slot) => {
        slotBlocks?.forEach(ib => {
          if (ib.type === 'image' && ib.snapId) {
            _initNoteSnapForCol(id, ib.snapId, idx, slot);
          }
        });
      });
    }
  });
  // VPanel参照スナップを非同期ロード
  _hydrateRefSnaps();
}

// ── public actions ──
window._notesTogCat = function(id, e) {
  if (e.target.closest('.n-note-item') || e.target.closest('.n-cat-add') || e.target.closest('.n-cat-more')) return;
  document.getElementById('n-cat-' + id)?.classList.toggle('open');
};

window._notesOpenNote = function(id, e) {
  if (e && e.target.closest('.n-note-more')) return;
  if (e) e.stopPropagation();
  _activeId = id;
  _recentIds = [id, ..._recentIds.filter(x => x !== id)].slice(0, 3);
  _renderSb();
  _renderNote(id);
  _renderRecent();
  _closeSb();
};

window.notesOpenSb = function() {
  document.getElementById('notesSidebar')?.classList.add('open');
  document.getElementById('notesSbOverlay')?.classList.add('vis');
};

function _closeSb() {
  document.getElementById('notesSidebar')?.classList.remove('open');
  document.getElementById('notesSbOverlay')?.classList.remove('vis');
}
window._notesCloseSb = _closeSb;

// ── 動画追加ピッカー ──
function _modePick(vm) {
  return `<label class="n-sheet-lbl">表示スタイル</label>
    <div class="n-vm-pick" id="n-vm-pick" style="margin-bottom:16px">
      <button class="n-vm-btn${vm==='carousel'?' sel':''}" data-vm="carousel" onclick="window._notesVmPick('carousel')">🎠 カード</button>
      <button class="n-vm-btn${vm==='inline'?' sel':''}" data-vm="inline" onclick="window._notesVmPick('inline')">📺 インライン</button>
    </div>`;
}

function _notesVidPickerRenderPick(overlay) {
  const vm = overlay.dataset.viewMode || 'carousel';
  overlay.innerHTML = `<div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
    <div class="n-sheet-hdr"><span class="n-sheet-title">＋ 動画を追加</span></div>
    <div class="n-sheet-body">
      ${_modePick(vm)}
      <label class="n-sheet-lbl">追加方法を選択</label>
      <div class="n-src-list">
        <button class="n-src-btn" onclick="window._notesPickLib()">
          <span class="n-src-icon">🔍</span>
          <div class="n-src-info">
            <div class="n-src-ttl">ライブラリから選ぶ</div>
            <div class="n-src-sub">フィルターで絞り込んで選択</div>
          </div>
          <span class="n-src-arr">›</span>
        </button>
        <button class="n-src-btn" onclick="window._notesPickUrl()">
          <span class="n-src-icon">🔗</span>
          <div class="n-src-info">
            <div class="n-src-ttl">URLで追加</div>
            <div class="n-src-sub">YouTube・URL直接入力</div>
          </div>
          <span class="n-src-arr">›</span>
        </button>
      </div>
    </div>
    <div class="n-sheet-btns">
      <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
    </div>
  </div>`;
}

function _notesVidPickerRenderUrl(overlay) {
  const vm = overlay.dataset.viewMode || 'carousel';
  overlay.innerHTML = `<div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
    <div class="n-sheet-hdr">
      <button class="n-sheet-back" onclick="window._notesPickerBack()">‹</button>
      <span class="n-sheet-title">🔗 URLで追加</span>
    </div>
    <div class="n-sheet-body">
      ${_modePick(vm)}
      <label class="n-sheet-lbl">YouTube URL</label>
      <input id="n-block-video-url" class="n-sheet-input" type="text"
             placeholder="https://www.youtube.com/watch?v=..."
             style="margin-bottom:10px"
             oninput="window._notesUrlAutoFetch(this.value)"
             onkeydown="if(event.key==='Enter') window._notesVideoConfirm()">
      <label class="n-sheet-lbl">
        タイトル
        <span id="n-url-fetch-status" style="font-size:10px;color:var(--accent);margin-left:6px"></span>
      </label>
      <input id="n-block-video-title" class="n-sheet-input" type="text"
             placeholder="URLを入力すると自動取得"
             onkeydown="if(event.key==='Enter') window._notesVideoConfirm()">
    </div>
    <div class="n-sheet-btns">
      <button class="n-btn n-btn-ghost" onclick="window._notesPickerBack()">戻る</button>
      <button class="n-btn n-btn-primary" onclick="window._notesVideoConfirm()">追加する</button>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('n-block-video-url')?.focus(), 80);
}

window._notesShowVidPicker = function(noteId) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.noteId = noteId;
  overlay.dataset.viewMode = 'carousel';
  _notesVidPickerRenderPick(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) window._notesSheetClose(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
};

window._notesVmPick = function(vm) {
  const overlay = document.getElementById('n-sheet-overlay');
  if (overlay) overlay.dataset.viewMode = vm;
  document.querySelectorAll('#n-vm-pick .n-vm-btn').forEach(b => b.classList.toggle('sel', b.dataset.vm === vm));
};

window._notesPickLib = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const noteId   = overlay.dataset.noteId;
  const viewMode = overlay.dataset.viewMode || 'carousel';
  window._noteModeViewMode = viewMode;
  window._notesSheetClose();
  window.uniOpenForNote?.(noteId);
};

window._notesPickUrl = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  _notesVidPickerRenderUrl(overlay);
};

window._notesPickerBack = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  _notesVidPickerRenderPick(overlay);
};

let _ytFetchTimer = null;
window._notesUrlAutoFetch = function(url) {
  clearTimeout(_ytFetchTimer);
  const status = document.getElementById('n-url-fetch-status');
  const ytId = _extractYtId(url);
  const listId = _extractPlaylistId(url);
  if (!ytId && !listId) { if (status) status.textContent = ''; return; }
  if (status) status.textContent = '取得中…';
  _ytFetchTimer = setTimeout(async () => {
    try {
      const oembedUrl = ytId
        ? `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`
        : `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${listId}&format=json`;
      const res = await fetch(oembedUrl);
      if (!res.ok) { if (status) status.textContent = ''; return; }
      const data = await res.json();
      const titleEl = document.getElementById('n-block-video-title');
      if (titleEl) {
        titleEl.value = data.title || '';
        titleEl.dataset.channel = data.author_name || '';
        titleEl.dataset.thumb = data.thumbnail_url || '';
      }
      if (status) status.textContent = '✓ 自動取得';
    } catch { if (status) status.textContent = ''; }
  }, 700);
};

window._notesGetAddedVideoIds = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return new Set();
  return new Set(r.note.blocks.filter(b => b.type === 'video').map(b => b.videoId));
};

window._notesVideoConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const noteId   = overlay.dataset.noteId;
  const viewMode = overlay.dataset.viewMode || 'carousel';
  const url = document.getElementById('n-block-video-url')?.value.trim();
  if (!url) { document.getElementById('n-block-video-url')?.focus(); return; }
  const videoId = _extractYtId(url) || url;
  const title   = document.getElementById('n-block-video-title')?.value.trim() || '';
  const channel = document.getElementById('n-block-video-title')?.dataset.channel || '';

  // フローチャートMap用インターセプト
  const _fcCb = window._notesFcVideoCallback;
  if (_fcCb) {
    window._notesFcVideoCallback = null;
    _fcCb({ videoId, title, channel, platform: 'youtube' });
    window._notesSheetClose();
    return;
  }

  // カラムスロットへの挿入
  const ctx = window._notesColContext;
  window._notesColContext = null;
  if (ctx) {
    const r2 = _findNote(ctx.noteId);
    if (!r2) return;
    const colBlock = r2.note.blocks[ctx.colIdx];
    if (!colBlock || colBlock.type !== 'col') return;
    if (!colBlock.cols[ctx.slot]) colBlock.cols[ctx.slot] = [];
    colBlock.cols[ctx.slot].push({ type: 'video', videoId, title, channel, duration: '', viewMode: 'inline' });
    r2.note.updatedAt = Date.now();
    _save();
    window._notesSheetClose();
    _renderNote(ctx.noteId);
    return;
  }

  const r = _findNote(noteId);
  if (!r) return;
  const added = r.note.blocks.some(b => b.type === 'video' && b.videoId === videoId);
  if (added) { window.toast?.('この動画はすでに追加されています'); return; }
  _blocksInsertOrPush(r.note.blocks, { type: 'video', videoId, title, channel, duration: '', viewMode });
  r.note.updatedAt = Date.now();
  _save();
  window._notesSheetClose();
  _renderNote(noteId);
};

window._notesAddVideoBlock = function(noteId) { window._notesShowVidPicker(noteId); };

window._notesAddMapBlock = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, { type: 'map', name: 'マップ', nodes: [], edges: [], abState: {} });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

window._notesOpenMap = function(noteId, idx) {
  const r = _findNote(noteId);
  if (!r) return;
  const block = r.note.blocks[idx];
  if (!block || block.type !== 'map') return;
  if (!window.fcOpenEditor) return;
  window.fcOpenEditor(block, function(updated) {
    block.name    = updated.name;
    block.nodes   = updated.nodes;
    block.edges   = updated.edges;
    block.abState = updated.abState;
    r.note.updatedAt = Date.now();
    // デバウンス経由だと失われることがあるため直接保存
    window._firebaseSaveNotes?.(_data);
    if (!document.getElementById('fc-overlay')?.classList.contains('open')) {
      _renderNote(noteId);
    }
  });
};
window._notesColOpenMap = function(noteId, colIdx, slot, bIdx) {
  const r = _findNote(noteId);
  if (!r) return;
  const colBlock = r.note.blocks[colIdx];
  if (!colBlock || colBlock.type !== 'col') return;
  const block = (colBlock.cols[slot] || [])[bIdx];
  if (!block || block.type !== 'map') return;
  if (!window.fcOpenEditor) return;
  window.fcOpenEditor(block, function(updated) {
    block.name    = updated.name;
    block.nodes   = updated.nodes;
    block.edges   = updated.edges;
    block.abState = updated.abState;
    r.note.updatedAt = Date.now();
    window._firebaseSaveNotes?.(_data);
    if (!document.getElementById('fc-overlay')?.classList.contains('open')) {
      _renderNote(noteId);
    }
  });
};
window._notesAddImageBlock = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  const snapId = 'note_' + noteId + '_' + Date.now().toString(36);
  _blocksInsertOrPush(r.note.blocks, { type: 'image', snapId, refs: [] });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
};

function _notesSnapAddPicker(noteId, targetSnapId) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.innerHTML = `
    <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">📸 画像を追加</span></div>
      <div class="n-src-list">
        <button class="n-src-btn" id="n-src-new-btn">
          <span class="n-src-icon">📷</span>
          <div class="n-src-info">
            <div class="n-src-ttl">新しく撮影・貼り付け</div>
            <div class="n-src-sub">スナップショットエディタで新規作成</div>
          </div>
          <span class="n-src-arr">›</span>
        </button>
        <button class="n-src-btn" id="n-src-lib-btn">
          <span class="n-src-icon">🎬</span>
          <div class="n-src-info">
            <div class="n-src-ttl">動画のスナップから選ぶ</div>
            <div class="n-src-sub">VPanelに登録済みの画像をインポート</div>
          </div>
          <span class="n-src-arr">›</span>
        </button>
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  overlay.querySelector('#n-src-new-btn').addEventListener('click', () => {
    _removeSheet();
    window.triggerSnapFileInput?.();
  });
  overlay.querySelector('#n-src-lib-btn').addEventListener('click', () => {
    window._notesImgFromLib(noteId, targetSnapId);
  });
}

window._notesImgFromLib = async function(noteId, targetSnapId) {
  const r = _findNote(noteId);
  if (!r) return;
  const videoBs = r.note.blocks.filter(b => b.type === 'video' && b.videoId);
  const hasSnaps = videoBs.some(b => {
    const v = (window.videos || []).find(x => x.id === b.videoId);
    return (v?.snapshots?.length || 0) > 0;
  });
  if (!hasSnaps) {
    window.toast?.('VPanelにスナップショットが登録されている動画がありません');
    return;
  }
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.noteId = noteId;
  overlay.innerHTML = `
    <div class="n-sheet" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr">
        <button class="n-sheet-back" onclick="window._notesSheetClose()">‹</button>
        <span class="n-sheet-title">🎬 スナップを選ぶ</span>
      </div>
      <div class="n-sheet-body" id="n-snap-picker-body" style="overflow-y:auto;flex:1"></div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));

  const body = document.getElementById('n-snap-picker-body');
  if (!body) return;

  for (const b of videoBs) {
    const v = (window.videos || []).find(x => x.id === b.videoId);
    const refs = v?.snapshots || [];
    if (!refs.length) continue;

    const hdr = document.createElement('div');
    hdr.className = 'n-snap-picker-hdr';
    hdr.textContent = b.title || b.videoId || '';
    body.appendChild(hdr);

    const grid = document.createElement('div');
    grid.className = 'n-snap-picker-grid';
    body.appendChild(grid);

    for (const ref of refs) {
      const card = document.createElement('div');
      card.className = 'n-snap-picker-card';
      card.title = ref.memo || '';
      card.onclick = () => window._notesAddSnapToBlock(noteId, targetSnapId, ref.id);
      card.innerHTML = `<span class="n-snap-picker-ph">📷</span>`;
      grid.appendChild(card);

      (async () => {
        try {
          const snap = await getSnapshot(ref.id);
          if (snap?.blob) {
            let url = _snapBlobCache.get(ref.id);
            if (!url) { url = URL.createObjectURL(snap.blob); _snapBlobCache.set(ref.id, url); }
            card.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">`;
          }
        } catch {}
      })();
    }
  }
};

window._notesAddSnapToBlock = async function(noteId, targetSnapId, refSnapId) {
  const r = _findNote(noteId);
  if (!r) return;
  _removeSheet();
  window.toast?.('📷 読み込み中…');
  try {
    const snap = await getSnapshot(refSnapId);
    if (!snap?.blob) { window.toast?.('スナップの取得に失敗しました'); return; }
    const newSnapId = 'note_' + noteId + '_' + Date.now().toString(36);
    await putSnapshot(newSnapId, targetSnapId, snap.blob, snap.annotations || []);
    const block = r.note.blocks.find(b => b.snapId === targetSnapId);
    if (!block) { window.toast?.('スナップブロックが見つかりません'); return; }
    block.refs = block.refs || [];
    block.refs.push({ id: newSnapId, memo: '', order: block.refs.length });
    r.note.updatedAt = Date.now();
    _save();
    _renderNote(noteId);
    window.toast?.('📷 スナップを追加しました');
  } catch(e) { console.error('_notesAddSnapToBlock:', e); window.toast?.('エラーが発生しました'); }
};

function _initNoteSnap(noteId, snapId, block, blockIdx) {
  window._noteSnapVideos = window._noteSnapVideos || {};
  window._noteSnapVideos[snapId] = { id: snapId, snapshots: block.refs || [] };

  window._onSnapSync = async (sid, refs) => {
    if (sid !== snapId) return;
    const r2 = _findNote(noteId);
    if (!r2) return;
    const b = r2.note.blocks[blockIdx];
    if (b && b.snapId === snapId) {
      b.refs = refs;
      r2.note.updatedAt = Date.now();
      // 画像のFirestoreアップロードが完了してからノートを保存する（クロスデバイス同期のレースコンディション対策）
      if (pendingUploads.size > 0) await Promise.allSettled([...pendingUploads]);
      _save();
    }
  };

  const container = document.getElementById('n-snap-' + snapId);
  if (container && window.initSnapshotSection) {
    window.initSnapshotSection(snapId, container, {
      onAddClick: () => _notesSnapAddPicker(noteId, snapId)
    });
  }
}

function _initNoteSnapForCol(noteId, snapId, colIdx, slot) {
  window._noteSnapVideos = window._noteSnapVideos || {};
  window._noteSnapVideos[snapId] = { id: snapId, snapshots: [] };
  window._onSnapSync = async (sid, refs) => {
    if (sid !== snapId) return;
    const r2 = _findNote(noteId);
    if (!r2) return;
    const colBlock = r2.note.blocks[colIdx];
    if (!colBlock || colBlock.type !== 'col') return;
    const ib = (colBlock.cols[slot] || []).find(b => b.snapId === snapId);
    if (ib) {
      ib.refs = refs; r2.note.updatedAt = Date.now();
      if (pendingUploads.size > 0) await Promise.allSettled([...pendingUploads]);
      _save();
    }
  };
  const container = document.getElementById('n-snap-' + snapId);
  if (container && window.initSnapshotSection) {
    window.initSnapshotSection(snapId, container, { onAddClick: () => _notesSnapAddPicker(noteId, snapId) });
  }
}

function _showVideoAddSheet(noteId) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'video-add';
  overlay.dataset.noteId = noteId;
  overlay.dataset.viewMode = 'carousel';
  overlay.innerHTML = `
    <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">📹 動画を追加</span></div>
      <div class="n-sheet-body">
        <label class="n-sheet-lbl" style="margin-bottom:6px">表示スタイル</label>
        <div class="n-vm-pick" id="n-vm-pick">
          <button class="n-vm-btn sel" data-vm="carousel" onclick="window._notesVmPick('carousel')">🎠 カード</button>
          <button class="n-vm-btn"     data-vm="inline"   onclick="window._notesVmPick('inline')">📺 インライン</button>
        </div>
        <label class="n-sheet-lbl" style="margin-top:12px">YouTube URL</label>
        <input id="n-block-video-url" class="n-sheet-input" type="text"
               placeholder="https://www.youtube.com/watch?v=..."
               style="margin-bottom:10px"
               onkeydown="if(event.key==='Enter') window._notesVideoConfirm()">
        <label class="n-sheet-lbl">タイトル（省略可）</label>
        <input id="n-block-video-title" class="n-sheet-input" type="text" placeholder="動画タイトル"
               onkeydown="if(event.key==='Enter') window._notesVideoConfirm()">
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesVideoConfirm()">追加する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
  setTimeout(() => document.getElementById('n-block-video-url')?.focus(), 80);
}

window._notesVmPick = function(vm) {
  const overlay = document.getElementById('n-sheet-overlay');
  if (overlay) overlay.dataset.viewMode = vm;
  document.querySelectorAll('#n-vm-pick .n-vm-btn').forEach(b => b.classList.toggle('sel', b.dataset.vm === vm));
};

window._notesVideoConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const noteId   = overlay.dataset.noteId;
  const viewMode = overlay.dataset.viewMode || 'carousel';
  const url = document.getElementById('n-block-video-url')?.value.trim();
  if (!url) { document.getElementById('n-block-video-url')?.focus(); return; }
  const ytId   = _extractYtId(url);
  const listId = _extractPlaylistId(url);
  const isPlaylist = !ytId && !!listId;
  const videoId = ytId || listId || url;
  const title   = document.getElementById('n-block-video-title')?.value.trim() || '';
  const channel = document.getElementById('n-block-video-title')?.dataset.channel || '';
  const thumb   = document.getElementById('n-block-video-title')?.dataset.thumb || '';

  const block = { type: 'video', videoId, title, channel, duration: '', viewMode };
  if (isPlaylist) { block.isPlaylist = true; if (thumb) block.thumb = thumb; }

  const ctx = window._notesColContext;
  window._notesColContext = null;
  if (ctx) {
    const r2 = _findNote(ctx.noteId);
    if (!r2) return;
    const colBlock = r2.note.blocks[ctx.colIdx];
    if (!colBlock || colBlock.type !== 'col') return;
    if (!colBlock.cols[ctx.slot]) colBlock.cols[ctx.slot] = [];
    colBlock.cols[ctx.slot].push({ ...block, viewMode: 'inline' });
    r2.note.updatedAt = Date.now();
    _save();
    window._notesSheetClose();
    _renderNote(ctx.noteId);
    return;
  }

  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, block);
  r.note.updatedAt = Date.now();
  _save();
  window._notesSheetClose();
  _renderNote(noteId);
};

function _showImageAddSheet(noteId) {
  _removeSheet();
  window._notesImgDataUrl = null;
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'image-add';
  overlay.dataset.noteId = noteId;
  overlay.innerHTML = `
    <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">📸 画像を追加</span></div>
      <div class="n-sheet-body">
        <div class="n-img-drop" id="n-img-drop" onclick="document.getElementById('n-block-img-file').click()">
          <input type="file" id="n-block-img-file" accept="image/*" style="display:none"
                 onchange="window._notesImgFileChange(this)">
          <div id="n-img-drop-label">📸 クリックして画像を選択</div>
          <img id="n-block-img-preview" style="display:none;max-width:100%;border-radius:6px;margin-top:8px">
        </div>
        <label class="n-sheet-lbl" style="margin-top:10px">キャプション（省略可）</label>
        <input id="n-block-img-caption" class="n-sheet-input" type="text" placeholder="画像の説明"
               onkeydown="if(event.key==='Enter') window._notesImageConfirm()">
      </div>
      <div class="n-sheet-btns">
        <button class="n-btn n-btn-ghost" onclick="window._notesSheetClose()">キャンセル</button>
        <button class="n-btn n-btn-primary" onclick="window._notesImageConfirm()">追加する</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', window._notesSheetClose);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('vis'));
}

window._notesImageConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const noteId = overlay.dataset.noteId;
  const src = window._notesImgDataUrl || '';
  if (!src) { document.getElementById('n-block-img-file')?.click(); return; }
  const caption = document.getElementById('n-block-img-caption')?.value.trim() || '';
  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, { type: 'image', src, caption });
  r.note.updatedAt = Date.now();
  _save();
  window._notesImgDataUrl = null;
  window._notesSheetClose();
  _renderNote(noteId);
};

// called from "+ New" button and category "+" buttons
window.notesNew = function(catId = null) {
  _showCreateSheet({ mode: 'create', catId: catId || null });
};

// ── VPanel integration ──
window.notesAddVideo = function(arg) {
  const videoId = typeof arg === 'string' ? arg : arg?.id;
  if (!videoId) return;
  const sheet = document.getElementById('notesVpSheet');
  if (!sheet) return;
  const list = document.getElementById('notesVpSheetList');
  if (!list) return;
  const noteItemHTML = (n) => {
    const dotCls = STATUS_DOT[n.status] || '';
    const statusLbl = STATUS_LABEL[n.status] || '';
    const statusCls = STATUS_CLS[n.status] || '';
    return `<div class="nvps-note-item" onclick="window._notesVpAddConfirm('${n.id}','${_esc(videoId)}')">
      <span class="n-note-dot ${dotCls}" style="width:8px;height:8px"></span>
      <span class="nvps-note-name">${_esc(n.name)}</span>
      <span class="n-s-badge ${statusCls}" style="font-size:10px">${statusLbl}</span>
    </div>`;
  };
  let h = '';
  if (_root.length) {
    h += `<div class="nvps-cat-lbl">📄 フォルダなし</div>`;
    for (const n of _root) h += noteItemHTML(n);
  }
  for (const cat of _data) {
    h += `<div class="nvps-cat-lbl">${cat.icon} ${_esc(cat.name)}</div>`;
    for (const n of cat.notes) h += noteItemHTML(n);
  }
  list.innerHTML = h;
  document.body.appendChild(sheet); // DOM末尾に移動して確実にVPanel上に表示
  sheet.classList.add('vis');
};

window._notesVpSheetClose = function() {
  document.getElementById('notesVpSheet')?.classList.remove('vis');
};

window._notesVpAddConfirm = function(noteId, videoId) {
  const r = _findNote(noteId);
  if (!r) return;
  const note = r.note;
  if (!note.blocks.some(b => b.type === 'video' && b.videoId === videoId)) {
    const v = (window.videos || []).find(x => x.id === videoId);
    const title = v?.title || '';
    const channel = v?.ch || '';
    const duration = v?.duration || '';
    const platform = v ? (v.pt || v.src || 'youtube') : 'youtube';
    const isYT = platform === 'youtube';
    note.blocks.push({
      type: 'video', videoId, title, channel, duration, memo: '', viewMode: 'carousel',
      platform,
      ytId: (isYT && v?.ytId) ? v.ytId : undefined,
      vmHash: v?.vmHash || undefined,
      thumb: isYT ? undefined : (v?.thumb || (platform === 'vimeo' ? `https://vumbnail.com/${videoId}.jpg` : undefined)),
    });
    note.updatedAt = Date.now();
    _save();
  }
  window._notesVpSheetClose();
  window.toast?.(`📓「${note.name}」に追加しました`);
  if (_activeId === noteId) _renderNote(noteId);
};

// ── フィルターオーバーレイからノートに動画を追加 ──
window._notesGetName = function(noteId) {
  const r = _findNote(noteId);
  return r?.note?.name || noteId;
};

window._notesAddFromLib = function(videoId, noteId) {
  // フローチャートMap用インターセプト
  const _fcCb = window._notesFcVideoCallback;
  if (_fcCb) {
    window._notesFcVideoCallback = null;
    const v2 = (window.videos || []).find(x => x.id === videoId);
    if (v2) {
      const platform2 = v2.pt || v2.src || 'youtube';
      const ytId2 = v2.ytId || (platform2 === 'youtube' ? v2.id : null);
      _fcCb({ videoId, platform: platform2, ytId: ytId2||undefined, vmHash: v2.vmHash||undefined, title: v2.title||'', channel: v2.channel||v2.ch||'', duration: v2.duration||'', bookmarks: v2.bookmarks||[] });
    }
    return;
  }

  const r = _findNote(noteId);
  if (!r) return;
  const note = r.note;
  const v = (window.videos || []).find(x => x.id === videoId);
  if (!v) return;
  const platform = v.pt || v.src || 'youtube';
  const ytId = v.ytId || (platform === 'youtube' ? v.id : null);
  const viewMode = window._noteModeViewMode || 'carousel';
  const vidBlock = {
    type: 'video', videoId, platform, viewMode,
    ytId: ytId || undefined,
    vmHash: v.vmHash || undefined,
    thumb: ytId ? undefined
         : v.thumb || (platform === 'vimeo' ? `https://vumbnail.com/${v.id}.jpg` : undefined),
    title: v.title || '', channel: v.channel || v.ch || '', duration: v.duration || '', memo: ''
  };
  const ctx = window._notesColContext;
  window._notesColContext = null;
  if (ctx && ctx.noteId === noteId) {
    const colBlock = note.blocks[ctx.colIdx];
    if (colBlock && colBlock.type === 'col') {
      if (!colBlock.cols[ctx.slot]) colBlock.cols[ctx.slot] = [];
      colBlock.cols[ctx.slot].push(vidBlock);
      note.updatedAt = Date.now();
      _save();
      window.toast?.(`📓「${note.name}」に「${v.title || videoId}」を追加しました`);
      if (_activeId === noteId) _renderNote(noteId);
      return;
    }
  }
  const alreadyInCol = note.blocks.some(b =>
    b.type === 'col' && b.cols?.some(sl => sl?.some(sb => sb.videoId === videoId))
  );
  if (!alreadyInCol && !note.blocks.some(b => b.type === 'video' && b.videoId === videoId)) {
    note.blocks.push(vidBlock);
    note.updatedAt = Date.now();
    _save();
  }
  window.toast?.(`📓「${note.name}」に「${v.title || videoId}」を追加しました`);
  if (_activeId === noteId) _renderNote(noteId);
};

// ── テキスト書式ツールバー ──
function _setupFormatBar() {
  if (document.getElementById('n-fmt-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'n-fmt-bar';
  bar.className = 'n-fmt-bar';
  bar.innerHTML = `
    <button class="n-fmt-btn" data-cmd="bold"          title="太字 (Ctrl+B)"><b>B</b></button>
    <button class="n-fmt-btn" data-cmd="italic"        title="斜体 (Ctrl+I)"><i>I</i></button>
    <button class="n-fmt-btn" data-cmd="underline"     title="下線 (Ctrl+U)"><u>U</u></button>
    <button class="n-fmt-btn" data-cmd="strikeThrough" title="取り消し線"><s>S</s></button>
    <div class="n-fmt-sep"></div>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="1" title="最小" style="font-size:9px">A</button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="2" title="小" style="font-size:11px">A</button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="3" title="標準" style="font-size:13px">A</button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="5" title="大" style="font-size:16px">A</button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="7" title="最大" style="font-size:20px">A</button>
    <div class="n-fmt-sep"></div>
    <button class="n-fmt-btn n-fmt-marker-trigger" title="マーカー">🌟</button>
    <button class="n-fmt-btn" data-cmd="removeFormat"                    title="書式クリア">✕</button>
  `;
  // マーカー色パレット（フローティングバー用）
  const palette = document.createElement('div');
  palette.className = 'n-fmt-palette';
  palette.id = 'nFmtPalette';
  const colors = [
    { val: '#fff176', label: '黄' },
    { val: '#f48fb1', label: 'ピンク' },
    { val: '#a5d6a7', label: '緑' },
    { val: '#90caf9', label: '青' },
    { val: '#ffcc80', label: 'オレンジ' },
    { val: '#ce93d8', label: '紫' },
  ];
  palette.innerHTML = colors.map(c =>
    `<button class="n-fmt-palette-dot" data-cmd="hiliteColor" data-val="${c.val}" title="${c.label}" style="background:${c.val}"></button>`
  ).join('') + `<button class="n-fmt-palette-dot n-fmt-palette-clear" data-cmd="removeFormat" title="クリア">✕</button>`;
  bar.appendChild(palette);

  // パレット開閉
  bar.querySelector('.n-fmt-marker-trigger').addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    palette.classList.toggle('vis');
  });
  bar.querySelector('.n-fmt-marker-trigger').addEventListener('touchend', e => {
    e.preventDefault(); e.stopPropagation();
    palette.classList.toggle('vis');
  });
  // パレット内ボタンクリック
  palette.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const dot = e.target.closest('[data-cmd]');
    if (!dot) return;
    _applyFmtCmd(dot.dataset.cmd, dot.dataset.val);
    palette.classList.remove('vis');
  });
  palette.addEventListener('touchend', e => {
    e.preventDefault(); e.stopPropagation();
    const dot = e.target.closest('[data-cmd]');
    if (!dot) return;
    _applyFmtCmd(dot.dataset.cmd, dot.dataset.val);
    palette.classList.remove('vis');
  });

  bar.addEventListener('mousedown', e => {
    e.preventDefault();
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    _applyFmtCmd(btn.dataset.cmd, btn.dataset.val);
  });
  bar.addEventListener('touchstart', e => {
    e.preventDefault();
  }, { passive: false });
  bar.addEventListener('touchend', e => {
    e.preventDefault();
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    _applyFmtCmd(btn.dataset.cmd, btn.dataset.val);
  });
  document.body.appendChild(bar);

  // モバイル: topbar 内の書式ボタンをワイヤーアップ
  const topbarFmt = document.getElementById('nTopbarFmt');
  if (topbarFmt) {
    topbarFmt.addEventListener('touchstart', e => {
      e.preventDefault(); // blur・selection クリア防止
    }, { passive: false });
    topbarFmt.addEventListener('touchend', e => {
      e.preventDefault();
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      // Android では tap で selection が消えるため保存済み range を復元
      _applyFmtCmd(btn.dataset.cmd, btn.dataset.val);
    });
    // マウス操作（デスクトップ兼用）
    topbarFmt.addEventListener('mousedown', e => {
      e.preventDefault();
      const btn = e.target.closest('[data-cmd]');
      if (!btn) return;
      _applyFmtCmd(btn.dataset.cmd, btn.dataset.val);
    });

    // topbar マーカー色パレット
    const tbPalette = document.getElementById('nTopbarPalette');
    const tbMarkerBtn = topbarFmt.querySelector('.n-topbar-marker-trigger');
    if (tbPalette && tbMarkerBtn) {
      const tColors = [
        { val: '#fff176', label: '黄' },
        { val: '#f48fb1', label: 'ピンク' },
        { val: '#a5d6a7', label: '緑' },
        { val: '#90caf9', label: '青' },
        { val: '#ffcc80', label: 'オレンジ' },
        { val: '#ce93d8', label: '紫' },
      ];
      tbPalette.innerHTML = tColors.map(c =>
        `<button class="n-fmt-palette-dot" data-cmd="hiliteColor" data-val="${c.val}" title="${c.label}" style="background:${c.val}"></button>`
      ).join('') + `<button class="n-fmt-palette-dot n-fmt-palette-clear" data-cmd="removeFormat" title="クリア">✕</button>`;
      const toggleTbPalette = e => { e.preventDefault(); e.stopPropagation(); tbPalette.classList.toggle('vis'); };
      tbMarkerBtn.addEventListener('mousedown', toggleTbPalette);
      tbMarkerBtn.addEventListener('touchend', toggleTbPalette);
      const handleTbPalettePick = e => {
        e.preventDefault(); e.stopPropagation();
        const dot = e.target.closest('[data-cmd]');
        if (!dot) return;
        _applyFmtCmd(dot.dataset.cmd, dot.dataset.val);
        tbPalette.classList.remove('vis');
      };
      tbPalette.addEventListener('mousedown', handleTbPalettePick);
      tbPalette.addEventListener('touchend', handleTbPalettePick);
    }
  }

  // selectionchange で常に range を保存（Android用）
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const node = sel.anchorNode;
      const editable = (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('.n-editable');
      if (editable) {
        _savedFmtRange = sel.getRangeAt(0).cloneRange();
        _savedFmtEl = editable;
      }
    }
    _onSelectionChange();
  });
  // Android: selectionchange alone is unreliable after finger lift — touchend is the reliable trigger
  document.addEventListener('touchend', () => {
    clearTimeout(_fmtDebounce);
    _fmtDebounce = setTimeout(_checkFmtBar, 200);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('n-fmt-bar')?.classList.remove('vis');
      document.getElementById('nFmtPalette')?.classList.remove('vis');
      document.getElementById('nTopbarPalette')?.classList.remove('vis');
    }
  });
  // パレットを外クリックで閉じる
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('.n-fmt-palette, .n-fmt-marker-trigger, .n-topbar-palette, .n-topbar-marker-trigger')) {
      document.getElementById('nFmtPalette')?.classList.remove('vis');
      document.getElementById('nTopbarPalette')?.classList.remove('vis');
    }
  });
}

let _savedFmtRange = null;
let _savedFmtEl = null;
function _applyFmtCmd(cmd, val) {
  // 全画面トグル (選択不要)
  if (cmd === 'fullscreen') {
    const main = document.querySelector('.notes-main');
    if (!main) return;
    const on = main.classList.toggle('n-fullscreen');
    const btn = document.querySelector('[data-cmd="fullscreen"]');
    if (btn) btn.textContent = on ? '⤡' : '⤢';
    // フルスクリーン時はtopbarを常時表示
    const tb = document.querySelector('.notes-topbar');
    if (tb && on) tb.classList.remove('n-tb-hidden', 'n-tb-floating');
    return;
  }
  // 保存済み range を復元してから execCommand
  if (_savedFmtRange && _savedFmtEl) {
    _savedFmtEl.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedFmtRange);
  }
  if (cmd === 'createLink') {
    const url = window.prompt('リンクURL', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
  } else if (cmd === 'code') {
    const text = window.getSelection()?.toString() || '';
    document.execCommand('insertHTML', false, `<code>${text || '\u200B'}</code>`);
  } else {
    document.execCommand(cmd, false, val || null);
  }
  setTimeout(() => {
    if (cmd !== 'undo' && cmd !== 'redo') {
      const el = _savedFmtEl || document.querySelector('.n-editable:focus');
      if (el) window._notesBlockSave(el);
    }
    _updateTopbarFmt();
    _updateFmtBar();
  }, 0);
}

let _fmtDebounce = null;
function _checkFmtBar() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    document.getElementById('n-fmt-bar')?.classList.remove('vis');
    return;
  }
  const node = sel.anchorNode;
  if (!node) return;
  const editable = node.nodeType === 3 ? node.parentElement?.closest('.n-editable') : node.closest?.('.n-editable');
  if (!editable) {
    document.getElementById('n-fmt-bar')?.classList.remove('vis');
    return;
  }
  _positionFmtBar(sel);
  _updateFmtBar();
}
function _onSelectionChange() {
  clearTimeout(_fmtDebounce);
  _fmtDebounce = setTimeout(_checkFmtBar, 150);
}

function _positionFmtBar(sel) {
  const bar = document.getElementById('n-fmt-bar');
  if (!bar) return;
  bar.classList.add('vis');
  const bw = bar.offsetWidth || 260;
  const bh = bar.offsetHeight || 36;
  const margin = 8;

  // Get selection bounding rect (fall back to saved range for Android)
  let rect = null;
  try {
    const range = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : _savedFmtRange;
    if (range) rect = range.getBoundingClientRect();
  } catch (e) {}
  if (!rect || (rect.width === 0 && rect.height === 0)) rect = null;

  bar.style.transform = '';

  // Horizontal: centered on selection, clamped to screen
  if (rect) {
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
    bar.style.left = left + 'px';
  } else {
    bar.style.left = Math.max(margin, window.innerWidth / 2 - bw / 2) + 'px';
  }

  if (_isTouchDevice()) {
    // Mobile: place BELOW the selection so we don't overlap the text.
    // The OS native bar (cut/copy/paste) appears ABOVE the selection handles,
    // so placing our bar below avoids collision with both text and OS bar.
    if (rect) {
      // 48px clearance for selection handles below the text
      const below = rect.bottom + 48;
      const above = rect.top - bh - 8;
      if (below + bh + margin <= window.innerHeight) {
        bar.style.top = below + 'px';
      } else if (above >= margin) {
        // Not enough room below — go above, accepting possible OS toolbar overlap
        bar.style.top = above + 'px';
      } else {
        bar.style.top = margin + 'px';
      }
    } else {
      bar.style.top = '72px';
    }
  } else {
    if (rect) {
      let top = rect.top > bh + 12 ? rect.top - bh - 8 : rect.bottom + 8;
      top = Math.max(margin, Math.min(top, window.innerHeight - bh - margin));
      bar.style.top = top + 'px';
    } else {
      bar.style.top = margin + 'px';
    }
  }
}

function _updateTopbarFmt() {
  const toolbar = document.getElementById('nTopbarFmt');
  if (!toolbar) return;
  ['bold','italic','underline','strikeThrough'].forEach(cmd => {
    const btn = toolbar.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

function _updateFmtBar() {
  const bar = document.getElementById('n-fmt-bar');
  if (!bar) return;
  ['bold','italic','underline','strikeThrough'].forEach(cmd => {
    const btn = bar.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

// ── topbar scroll-aware ──
function _setupTopbarScroll() {
  if (window._notesScrollSetup) return;
  window._notesScrollSetup = true;
  let _lastY = 0;
  let _ticking = false;
  window.addEventListener('scroll', () => {
    if (!document.getElementById('notesTab')?.classList.contains('active')) return;
    if (_ticking) return;
    _ticking = true;
    requestAnimationFrame(() => {
      const tb = document.querySelector('.notes-topbar');
      if (tb) {
        const y = window.scrollY;
        // フルスクリーン中は常時表示
        if (document.querySelector('.notes-main.n-fullscreen')) {
          tb.classList.remove('n-tb-hidden', 'n-tb-floating');
          _lastY = y;
          _ticking = false;
          return;
        }
        const delta = y - _lastY;
        if (y < 10) {
          tb.classList.remove('n-tb-hidden', 'n-tb-floating');
        } else if (delta < 0) {
          tb.classList.remove('n-tb-hidden');
          tb.classList.add('n-tb-floating');
        } else if (delta > 2) {
          tb.classList.add('n-tb-hidden');
          tb.classList.remove('n-tb-floating');
        }
        _lastY = y;
      }
      _ticking = false;
    });
  }, { passive: true });
}

// ── init ──
export function renderNotes() {
  _setupFormatBar();
  _setupTopbarScroll();
  // タブ切り替え時は常にサイドバー表示・未選択状態をデフォルトにする
  _activeId = null;
  _renderSb();
  const bc = document.getElementById('notesBreadcrumb');
  if (bc) bc.innerHTML = '';
  const content = document.getElementById('notesContent');
  if (content) content.innerHTML = '';
  // モバイルはサイドバーを自動で開く
  if (window.innerWidth < 768) {
    document.getElementById('notesSidebar')?.classList.add('open');
    document.getElementById('notesSbOverlay')?.classList.add('vis');
  }
  _renderRecent();
}
