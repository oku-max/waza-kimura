// ═══ WAZA KIMURA — Notes tab v50.45 ═══
import { getSnapshot, putSnapshot } from './snapshot-db.js';

const NOTES_KEY = 'wk_notes_v1';

const DEFAULT_DATA = [
  {
    id: 'back', icon: '🔙', name: 'バックポジション',
    notes: [
      { id: 'back-choke', name: 'バックチョーク', status: 'wip', tags: ['バック','チョーク'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',    content: '🎯 核心ポイント' },
          { type: 'text',  content: 'シートベルトグリップを確立してから、ハーネスを作る。肘の角度と首の位置が重要。相手の顎が上がると首が取れる。反対の手でグリップを補助し、身体全体で絞める。' },
          { type: 'quote', content: '「顎を引かせない。脇の下からグリップを深くする」— 練習メモ 2025/04/15' },
          { type: 'h2',    content: '⚠️ 課題・弱点' },
          { type: 'text',  content: 'グリップが浅くなると外されやすい。特に相手が顎を引いてくるときの対処が弱点。' }
        ]
      },
      { id: 'seatbelt', name: 'シートベルト維持', status: 'done', tags: ['バック','グリップ'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',    content: '🎯 核心ポイント' },
          { type: 'text',  content: '上の腕を深く差して肘を相手の顎の下に入れる。下の腕は脇下から回して肩甲骨辺りで組む。' },
          { type: 'quote', content: '「ベルトは腰、上の腕は顎の下。2点で押さえる」' }
        ]
      }
    ]
  },
  {
    id: 'guard', icon: '🛡', name: 'ガードワーク',
    notes: [
      { id: 'knee-shield', name: 'ニーシールド基礎', status: 'done', tags: ['ガード','フレーム'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',   content: '🎯 核心ポイント' },
          { type: 'text', content: '膝を盾として使いスペースを確保する。前の足でヒップをコントロールし、後ろ足でガードを維持する。' }
        ]
      },
      { id: 'x-guard', name: 'Xガード展開', status: 'wip', tags: ['ガード','スイープ'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',   content: '🎯 核心ポイント' },
          { type: 'text', content: 'アンダーフックから入るXガード。両足で相手の体重を支えながらスイープに繋げる。' }
        ]
      },
      { id: 'butterfly', name: 'バタフライガード', status: 'new', tags: ['ガード','スイープ'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',   content: '🎯 核心ポイント' },
          { type: 'text', content: 'フックの位置と体重移動。両足フックで浮かせてからスイープ。' }
        ]
      }
    ]
  },
  {
    id: 'sub', icon: '✊', name: 'サブミッション',
    notes: [
      { id: 'triangle', name: '三角絞め', status: 'review', tags: ['クローズド','サブ'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',    content: '🎯 核心ポイント' },
          { type: 'text',  content: 'クローズドガードからのセットアップ。角度調整とヒップの使い方が課題。' },
          { type: 'quote', content: '「ヒップを45度に向ける。それだけで絞まりが変わる」' }
        ]
      },
      { id: 'armbar', name: '腕十字（ガードから）', status: 'wip', tags: ['クローズド','サブ'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',   content: '🎯 核心ポイント' },
          { type: 'text', content: 'クローズドガードから片腕を捕らえて回転。親指を上に向けてから絞める。' }
        ]
      }
    ]
  },
  {
    id: 'td', icon: '🤸', name: 'テイクダウン',
    notes: [
      { id: 'double-leg', name: 'ダブルレッグ', status: 'wip', tags: ['TD','レスリング'],
        updatedAt: Date.now(),
        blocks: [
          { type: 'h2',   content: '🎯 核心ポイント' },
          { type: 'text', content: 'シングルから繋げるパターン。レベルチェンジのタイミングが肝心。' }
        ]
      }
    ]
  }
];

// ── storage ──
function _load() {
  try { const r = localStorage.getItem(NOTES_KEY); return r ? JSON.parse(r) : DEFAULT_DATA; }
  catch { return DEFAULT_DATA; }
}

let _saveFsTimer = null;
function _save() {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(_data)); } catch {}
  // Firestoreへは2秒デバウンスで非同期保存（連続編集時にhammer防止）
  clearTimeout(_saveFsTimer);
  _saveFsTimer = setTimeout(() => window._firebaseSaveNotes?.(_data), 2000);
}

// ログイン後にFirestoreから呼ばれる
window._notesGetData = () => _data;
window._notesLoadFromRemote = function(remoteData, remoteAt) {
  if (!Array.isArray(remoteData) || !remoteData.length) return;
  _data = remoteData;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(_data));
    // remoteAtを記録しておくことで次のonSnapshot呼び出しを正しく判定できる
    if (remoteAt) localStorage.setItem('wk_notes_savedAt', remoteAt);
  } catch {}
  if (_activeId) _renderNote(_activeId);
  window.renderNotes?.();
  window.toast?.('📓 ノートを同期しました');
};

let _data = _load();
let _activeId = null;
let _recentIds = [];
let _dragSrcNoteId = null;
let _dragSrcIdx = null;

// ── lookup ──
function _findNote(id) {
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
    <div class="n-ctx-item n-ctx-danger" onclick="window._notesDelete('${noteId}')">🗑 削除</div>
  `;

  // position near click point, relative to sidebar
  const sb = document.getElementById('notesSidebar');
  const sbRect = sb.getBoundingClientRect();
  const cx = (e.clientX || e.touches?.[0]?.clientX || sbRect.right - 20);
  const cy = (e.clientY || e.touches?.[0]?.clientY || 100);
  menu.style.top  = Math.max(0, cy - sbRect.top + 4) + 'px';
  menu.style.left = Math.min(cx - sbRect.left - 100, sbRect.width - 140) + 'px';

  sb.appendChild(menu);
  setTimeout(() => document.addEventListener('click', _closeCtx, { once: true }), 0);
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
  r.cat.notes = r.cat.notes.filter(n => n.id !== noteId);
  _save();

  // update active selection
  if (_activeId === noteId) {
    _activeId = null;
    for (const cat of _data) {
      if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
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

  const catOptions = _data.map(c =>
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
}

function _removeSheet() {
  document.getElementById('n-sheet-overlay')?.remove();
}

window._notesSheetClose = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  overlay.classList.remove('vis');
  window._notesInsertAfterIdx = null; // キャンセル時にリセット
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
    const cat = _data.find(c => c.id === catId) || _data[0];
    const newNote = {
      id: _uid(), name, status: 'new', tags: [],
      updatedAt: Date.now(),
      blocks: [{ type: 'h2', content: '🎯 核心ポイント' }]
    };
    cat.notes.push(newNote);
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
function _renderSb() {
  const tree = document.getElementById('notesSbTree');
  if (!tree) return;
  let h = '';
  for (const cat of _data) {
    const isOpen = cat.notes.some(n => n.id === _activeId) || cat.notes.length === 0;
    h += `<div class="n-cat${isOpen ? ' open' : ''}" id="n-cat-${cat.id}">
      <div class="n-cat-hdr" onclick="window._notesTogCat('${cat.id}',event)">
        <span class="n-cat-arrow">▶</span>
        <span class="n-cat-icon">${cat.icon}</span>
        <span class="n-cat-name">${_esc(cat.name)}</span>
        <span class="n-cat-cnt">${cat.notes.length}</span>
        <button class="n-cat-add" title="このカテゴリにノートを追加"
                onclick="event.stopPropagation();window.notesNew('${cat.id}')">＋</button>
      </div>
      <div class="n-cat-notes">
        ${cat.notes.map(n => `
          <div class="n-note-item${n.id === _activeId ? ' active' : ''}"
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
     >${_esc(block.content)}</div>`;

  switch (block.type) {
    case 'h2':    return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-h2')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'text':  return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-text')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'quote': return `<div class="n-block-wrap" ${wrapAttrs}>${editable('n-b-quote')}${drag}${upBtn}${dnBtn}${del}</div>`;
    case 'video': {
      // carousel blocks are grouped by _renderBlocks — only inline reaches here
      const thumbUrl = _blockThumbUrl(block);
      const thumbEl = thumbUrl
        ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
        : `<span style="font-size:18px">🎥</span>`;
      const modeBtn = `<button class="n-bvi-mode-btn" title="カードに切替"
        onclick="event.stopPropagation();window._notesVidToggleMode('${noteId}',${idx})">🎠</button>`;
      return `<div class="n-block-wrap n-block-wrap-card" id="n-vid-wrap-${noteId}-${idx}">
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
        return `<div class="n-block-wrap n-block-wrap-snap" data-snap-id="${_esc(block.snapId)}" data-note-id="${noteId}" data-idx="${idx}" ${wrapAttrs}>
          <div id="n-snap-${_esc(block.snapId)}" class="n-snap-section"></div>${drag}${upBtn}${dnBtn}${del}</div>`;
      }
      // legacy: data URL stored directly
      return `<div class="n-block-wrap n-block-wrap-card" ${wrapAttrs}>
        <div class="n-b-image">
          <img src="${_esc(block.src)}" alt="${_esc(block.caption || '')}" class="n-b-img">
          ${block.caption ? `<div class="n-b-img-caption">${_esc(block.caption)}</div>` : ''}
        </div>${drag}${upBtn}${dnBtn}${del}</div>`;
    }
    default: return '';
  }
}

// ── inline block editing ──
window._notesBlockSave = function(el) {
  const noteId = el.dataset.noteId;
  const idx = parseInt(el.dataset.idx);
  const r = _findNote(noteId);
  if (!r) return;
  const content = el.innerText.replace(/\n{2,}/g, '\n').trim();
  if (content === r.note.blocks[idx]?.content) return;
  r.note.blocks[idx].content = content;
  r.note.updatedAt = Date.now();
  _save();
};

window._notesBlockKeydown = function(el, e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const noteId = el.dataset.noteId;
    const idx = parseInt(el.dataset.idx);
    // save current first
    window._notesBlockSave(el);
    const r = _findNote(noteId);
    if (!r) return;
    r.note.blocks.splice(idx + 1, 0, { type: 'text', content: '' });
    _save();
    _renderNote(noteId);
    setTimeout(() => {
      const next = document.querySelector(`[data-note-id="${noteId}"][data-idx="${idx + 1}"]`);
      next?.focus();
    }, 40);
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

window._notesDragStart = function(e, noteId, idx) {
  _dragSrcNoteId = noteId;
  _dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest?.('.n-block-wrap')?.classList.add('n-dragging');
};

// contenteditable がdragover/dropを横取りするためドキュメントレベルで処理
(function _initNotesDnd() {
  let _dndOverWrap = null;
  document.addEventListener('dragover', function(e) {
    if (_dragSrcNoteId == null) return;
    e.preventDefault();
    const wrap = e.target.closest?.('.n-block-wrap[data-note-id]');
    if (wrap === _dndOverWrap) return;
    _dndOverWrap?.classList.remove('n-drag-over');
    _dndOverWrap = wrap || null;
    wrap?.classList.add('n-drag-over');
  });
  document.addEventListener('drop', function(e) {
    if (_dragSrcNoteId == null) return;
    e.preventDefault();
    document.querySelectorAll('.n-block-wrap').forEach(el => el.classList.remove('n-drag-over', 'n-dragging'));
    _dndOverWrap = null;
    const wrap = e.target.closest?.('.n-block-wrap[data-note-id]');
    if (!wrap) { _dragSrcNoteId = null; return; }
    const targetNoteId = wrap.dataset.noteId;
    const dst = parseInt(wrap.dataset.idx);
    const src = _dragSrcIdx;
    const srcNoteId = _dragSrcNoteId;
    _dragSrcNoteId = null; _dragSrcIdx = null;
    if (targetNoteId !== srcNoteId || isNaN(dst) || src === dst) return;
    const r = _findNote(targetNoteId);
    if (!r) return;
    const blocks = r.note.blocks;
    const [moved] = blocks.splice(src, 1);
    blocks.splice(dst > src ? dst - 1 : dst, 0, moved);
    r.note.updatedAt = Date.now();
    _save();
    _renderNote(targetNoteId);
  });
  document.addEventListener('dragend', function() {
    document.querySelectorAll('.n-block-wrap').forEach(el => el.classList.remove('n-drag-over', 'n-dragging'));
    _dndOverWrap = null;
    _dragSrcNoteId = null; _dragSrcIdx = null;
  });
})();

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
  const cards = group.map(({ block: b, idx }, gi) => {
    const thumbSrc = _blockThumbUrl(b);
    const thumbEl = thumbSrc
      ? `<img src="${thumbSrc}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="font-size:22px">🎥</span>`;
    const v = (window.videos || []).find(x => x.id === b.videoId);
    const status = v?.status || b.status || '';
    const sColor = STATUS_COLOR[status] || '';
    const badge = sColor ? `<span class="n-vc-badge" style="color:${sColor};background:${sColor}22">${_esc(status)}</span>` : '';
    const prevBtn = gi > 0
      ? `<button class="n-vc-prev" title="左へ" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},-1)">←</button>`
      : '';
    const nextBtn = gi < group.length - 1
      ? `<button class="n-vc-next" title="右へ" onclick="event.stopPropagation();window._notesBlockMove('${noteId}',${idx},1)">→</button>`
      : '';
    return `<div class="n-vc-card" onclick="window.openVPanel?.('${_esc(b.videoId)}')">
      <div class="n-vc-thumb">${thumbEl}</div>
      <div class="n-vc-info">
        <div class="n-vc-ttl">${_esc(b.title || b.videoId || '')}</div>
        <div class="n-vc-ch">${_esc(b.channel || v?.channel || v?.ch || '')}</div>
        ${badge}
      </div>
      ${prevBtn}${nextBtn}
      <button class="n-vc-del" title="削除"
        onclick="event.stopPropagation();window._notesBlockDel('${noteId}',${idx})">✕</button>
      <button class="n-vc-mode" title="インラインに切替"
        onclick="event.stopPropagation();window._notesVidToggleMode('${noteId}',${idx})">📺</button>
    </div>`;
  }).join('');
  return `<div class="n-block-wrap n-block-wrap-carousel">
    <div class="n-vc-scroll">${cards}</div>
  </div>`;
}

function _insertStrip(noteId, afterIdx) {
  return `<div class="n-ins-strip">
    <div class="n-ins-line"></div>
    <button class="n-ins-btn" onclick="window._notesInsertTextAt('${noteId}',${afterIdx})">テキスト</button>
    <button class="n-ins-btn" onclick="window._notesInsertVideoAt('${noteId}',${afterIdx})">動画</button>
    <button class="n-ins-btn" onclick="window._notesInsertImageAt('${noteId}',${afterIdx})">画像</button>
    <div class="n-ins-line"></div>
  </div>`;
}

function _renderBlocks(blocks, noteId) {
  const parts = [];
  const total = blocks.length;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'video' && b.viewMode !== 'inline') {
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

window._notesVidTogglePlayer = function(noteId, idx) {
  const playerId = `n-bvi-player-${noteId}-${idx}`;
  const player = document.getElementById(playerId);
  if (!player) return;
  const isOpen = player.classList.contains('open');
  document.querySelectorAll('.n-bvi-player.open').forEach(p => {
    p.classList.remove('open');
    p.innerHTML = '';
  });
  if (isOpen) return;
  const r = _findNote(noteId);
  if (!r) return;
  const b = r.note.blocks[idx];
  if (!b?.videoId) return;
  const platform = b.platform || 'youtube';
  const iframe = document.createElement('iframe');
  if (platform === 'gdrive') {
    const fileId = b.videoId.startsWith('gd-') ? b.videoId.slice(3) : b.videoId;
    iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
  } else if (platform === 'vimeo') {
    const hash = b.vmHash ? `h=${b.vmHash}&` : '';
    iframe.src = `https://player.vimeo.com/video/${b.videoId}?${hash}autoplay=1`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
  } else {
    const ytId = b.ytId || b.videoId;
    iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
    iframe.allow = 'autoplay; encrypted-media; fullscreen';
  }
  iframe.allowFullscreen = true;
  player.innerHTML = '';
  player.appendChild(iframe);
  const widthPct = b.vidWidth || 100;
  const ctrl = document.createElement('div');
  ctrl.className = 'n-bvi-ctrl';
  ctrl.innerHTML = `<span>📺 インライン再生中</span>
    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text2)">
      幅 <input type="range" min="30" max="100" step="5" value="${widthPct}"
        style="width:80px" oninput="window._notesVidResize('${noteId}',${idx},+this.value)">
      <span id="n-bvi-w-${noteId}-${idx}">${widthPct}%</span>
    </label>
    <button onclick="window._notesVidTogglePlayer('${noteId}',${idx})">▲ 閉じる</button>`;
  player.appendChild(ctrl);
  // apply current width
  const wrap = document.getElementById(`n-vid-wrap-${noteId}-${idx}`);
  if (wrap) wrap.style.maxWidth = widthPct + '%';
  player.classList.add('open');
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
  if (bc) bc.innerHTML = `Notes › ${_esc(cat.name)} › <b>${_esc(note.name)}</b>`;

  const content = document.getElementById('notesContent');
  if (!content) return;

  const tagsHTML = (note.tags || []).map(t => `<span class="n-chip">${_esc(t)}</span>`).join('');
  const statusHTML = `<span class="n-s-badge ${STATUS_CLS[note.status] || ''}">${STATUS_LABEL[note.status] || ''}</span>`;

  content.innerHTML = `
    <div class="n-page-title">${_esc(note.name)}</div>
    <div class="n-tag-row">${tagsHTML}${statusHTML}</div>
    <div id="n-blocks-${id}">${_renderBlocks(note.blocks, id)}</div>
    <div class="n-note-actions">
      <button class="n-add-inline" onclick="window._notesAddTextBlock('${id}')">＋ テキスト</button>
      <button class="n-add-inline n-add-video-btn" onclick="window._notesShowVidPicker?.('${id}')">＋ 動画を追加</button>
      <button class="n-add-inline" onclick="window._notesAddImageBlock?.('${id}')">📸 画像</button>
    </div>
  `;

  // スナップショットブロックを初期化（DOM描画後）
  note.blocks.forEach((b, idx) => {
    if (b.type === 'image' && b.snapId) {
      _initNoteSnap(id, b.snapId, b, idx);
    }
  });
  // VPanel参照スナップを非同期ロード
  _hydrateRefSnaps();
}

// ── public actions ──
window._notesTogCat = function(id, e) {
  if (e.target.closest('.n-note-item') || e.target.closest('.n-cat-add')) return;
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
  if (!ytId) { if (status) status.textContent = ''; return; }
  if (status) status.textContent = '取得中…';
  _ytFetchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
      if (!res.ok) { if (status) status.textContent = ''; return; }
      const data = await res.json();
      const titleEl = document.getElementById('n-block-video-title');
      if (titleEl) { titleEl.value = data.title || ''; titleEl.dataset.channel = data.author_name || ''; }
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

  window._onSnapSync = (sid, refs) => {
    if (sid !== snapId) return;
    const r2 = _findNote(noteId);
    if (!r2) return;
    const b = r2.note.blocks[blockIdx];
    if (b && b.snapId === snapId) {
      b.refs = refs;
      r2.note.updatedAt = Date.now();
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
  const videoId = _extractYtId(url) || url;
  const title = document.getElementById('n-block-video-title')?.value.trim() || '';
  const r = _findNote(noteId);
  if (!r) return;
  _blocksInsertOrPush(r.note.blocks, { type: 'video', videoId, title, channel: '', duration: '', viewMode });
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
  _showCreateSheet({ mode: 'create', catId: catId || (_data[0]?.id || null) });
};

// ── VPanel integration ──
window.notesAddVideo = function(arg) {
  const videoId = typeof arg === 'string' ? arg : arg?.id;
  if (!videoId) return;
  const sheet = document.getElementById('notesVpSheet');
  if (!sheet) return;
  const list = document.getElementById('notesVpSheetList');
  if (!list) return;
  let h = '';
  for (const cat of _data) {
    h += `<div class="nvps-cat-lbl">${cat.icon} ${_esc(cat.name)}</div>`;
    for (const n of cat.notes) {
      const dotCls = STATUS_DOT[n.status] || '';
      const statusLbl = STATUS_LABEL[n.status] || '';
      const statusCls = STATUS_CLS[n.status] || '';
      h += `<div class="nvps-note-item" onclick="window._notesVpAddConfirm('${n.id}','${_esc(videoId)}')">
        <span class="n-note-dot ${dotCls}" style="width:8px;height:8px"></span>
        <span class="nvps-note-name">${_esc(n.name)}</span>
        <span class="n-s-badge ${statusCls}" style="font-size:10px">${statusLbl}</span>
      </div>`;
    }
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
  const r = _findNote(noteId);
  if (!r) return;
  const note = r.note;
  const v = (window.videos || []).find(x => x.id === videoId);
  if (!v) return;
  if (!note.blocks.some(b => b.type === 'video' && b.videoId === videoId)) {
    const viewMode = window._noteModeViewMode || 'carousel';
    const platform = v.pt || v.src || 'youtube';
    const ytId = v.ytId || (platform === 'youtube' ? v.id : null);
    note.blocks.push({
      type: 'video', videoId, platform, viewMode,
      ytId: ytId || undefined,
      vmHash: v.vmHash || undefined,
      thumb: ytId ? undefined
           : v.thumb || (platform === 'vimeo' ? `https://vumbnail.com/${v.id}.jpg` : undefined),
      title: v.title || '', channel: v.channel || v.ch || '', duration: v.duration || '', memo: ''
    });
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
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="2" title="小さく">A<sub>↓</sub></button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="3" title="標準">A</button>
    <button class="n-fmt-btn" data-cmd="fontSize" data-val="5" title="大きく">A<sup>↑</sup></button>
    <div class="n-fmt-sep"></div>
    <button class="n-fmt-btn" data-cmd="hiliteColor" data-val="#fff176" title="ハイライト">🌟</button>
    <button class="n-fmt-btn" data-cmd="removeFormat"                    title="書式クリア">✕</button>
  `;
  bar.addEventListener('mousedown', e => {
    e.preventDefault();
    const btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.val || null;
    document.execCommand(cmd, false, val);
    _updateFmtBar();
  });
  document.body.appendChild(bar);

  document.addEventListener('selectionchange', _onSelectionChange);
  document.addEventListener('keydown', e => {
    const bar = document.getElementById('n-fmt-bar');
    if (bar && e.key === 'Escape') bar.classList.remove('vis');
  });
}

let _fmtDebounce = null;
function _onSelectionChange() {
  clearTimeout(_fmtDebounce);
  _fmtDebounce = setTimeout(() => {
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
  }, 60);
}

function _positionFmtBar(sel) {
  const bar = document.getElementById('n-fmt-bar');
  if (!bar) return;
  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  bar.classList.add('vis');
  const bw = bar.offsetWidth || 280;
  const margin = 6;
  let left = rect.left + rect.width / 2 - bw / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - bw - margin));
  let top  = rect.top - bar.offsetHeight - 8 + window.scrollY;
  if (top < 0) top = rect.bottom + 8 + window.scrollY;
  bar.style.left = left + 'px';
  bar.style.top  = top  + 'px';
}

function _updateFmtBar() {
  const bar = document.getElementById('n-fmt-bar');
  if (!bar) return;
  ['bold','italic','underline','strikeThrough'].forEach(cmd => {
    const btn = bar.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

// ── init ──
export function renderNotes() {
  if (!_activeId) {
    for (const cat of _data) {
      if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
    }
  }
  _setupFormatBar();
  _renderSb();
  if (_activeId) _renderNote(_activeId);
  _renderRecent();
}
