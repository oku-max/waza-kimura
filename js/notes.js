// ═══ WAZA KIMURA — Notes tab v50.30 ═══

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
function _save() { try { localStorage.setItem(NOTES_KEY, JSON.stringify(_data)); } catch {} }

let _data = _load();
let _activeId = null;
let _recentIds = [];

// ── lookup ──
function _findNote(id) {
  for (const cat of _data) {
    const n = cat.notes.find(n => n.id === id);
    if (n) return { note: n, cat };
  }
  return null;
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
function _blockHTML(block, idx, noteId) {
  const del = `<button class="n-block-del" title="削除"
    onclick="event.stopPropagation();window._notesBlockDel('${noteId}',${idx})">✕</button>`;
  const editable = (cls) =>
    `<div class="${cls} n-editable" contenteditable="true"
          data-idx="${idx}" data-note-id="${noteId}"
          onblur="window._notesBlockSave(this)"
          onkeydown="window._notesBlockKeydown(this,event)"
     >${_esc(block.content)}</div>`;

  switch (block.type) {
    case 'h2':    return `<div class="n-block-wrap">${editable('n-b-h2')}${del}</div>`;
    case 'text':  return `<div class="n-block-wrap">${editable('n-b-text')}${del}</div>`;
    case 'quote': return `<div class="n-block-wrap">${editable('n-b-quote')}${del}</div>`;
    case 'video': return `<div class="n-block-wrap n-block-wrap-card">
      <div class="n-b-video">
        <div class="n-bv-hdr">
          <div class="n-bv-icon">▶</div>
          <div class="n-bv-ttl">${_esc(block.title || '')}</div>
          <div class="n-bv-dur">${_esc(block.duration || '')}</div>
        </div>
        <div class="n-bv-body">
          <div class="n-bv-thumb">🎥</div>
          <div class="n-bv-note">
            <div class="n-bv-ch">${_esc(block.channel || '')}</div>
            ${block.memo ? `<div class="n-bv-memo">${_esc(block.memo)}</div>` : ''}
          </div>
        </div>
      </div>${del}</div>`;
    case 'image': return `<div class="n-block-wrap n-block-wrap-card">
      <div class="n-b-image">
        <img src="${_esc(block.src)}" alt="${_esc(block.caption || '')}" class="n-b-img">
        ${block.caption ? `<div class="n-b-img-caption">${_esc(block.caption)}</div>` : ''}
      </div>${del}</div>`;
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

window._notesAddTextBlock = function(noteId) {
  const r = _findNote(noteId);
  if (!r) return;
  r.note.blocks.push({ type: 'text', content: '' });
  r.note.updatedAt = Date.now();
  _save();
  _renderNote(noteId);
  setTimeout(() => {
    const all = document.querySelectorAll(`[data-note-id="${noteId}"][contenteditable]`);
    all[all.length - 1]?.focus();
  }, 40);
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
    <div id="n-blocks-${id}">${note.blocks.map((b, i) => _blockHTML(b, i, id)).join('')}</div>
    <div class="n-note-actions">
      <button class="n-add-inline" onclick="window._notesAddTextBlock('${id}')">＋ テキスト</button>
      <button class="n-add-inline" onclick="window._notesAddVideoBlock?.('${id}')">📹 動画</button>
      <button class="n-add-inline" onclick="window._notesAddImageBlock?.('${id}')">📸 画像</button>
      <button class="n-add-inline" onclick="window.uniOpenForNote?.('${id}')">📚 ライブラリ</button>
    </div>
  `;
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

window._notesAddVideoBlock = function(noteId) { _showVideoAddSheet(noteId); };
window._notesAddImageBlock = function(noteId) { _showImageAddSheet(noteId); };

function _showVideoAddSheet(noteId) {
  _removeSheet();
  const overlay = document.createElement('div');
  overlay.id = 'n-sheet-overlay';
  overlay.className = 'n-sheet-overlay';
  overlay.dataset.mode = 'video-add';
  overlay.dataset.noteId = noteId;
  overlay.innerHTML = `
    <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
      <div class="n-sheet-hdr"><span class="n-sheet-title">📹 動画を追加</span></div>
      <div class="n-sheet-body">
        <label class="n-sheet-lbl">YouTube URL</label>
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

window._notesVideoConfirm = function() {
  const overlay = document.getElementById('n-sheet-overlay');
  if (!overlay) return;
  const noteId = overlay.dataset.noteId;
  const url = document.getElementById('n-block-video-url')?.value.trim();
  if (!url) { document.getElementById('n-block-video-url')?.focus(); return; }
  const videoId = _extractYtId(url) || url;
  const title = document.getElementById('n-block-video-title')?.value.trim() || '';
  const r = _findNote(noteId);
  if (!r) return;
  r.note.blocks.push({ type: 'video', videoId, title, channel: '', duration: '' });
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
  r.note.blocks.push({ type: 'image', src, caption });
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
window.notesAddVideo = function({ id: videoId, title, channel, duration }) {
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
      h += `<div class="nvps-note-item" onclick="window._notesVpAddConfirm('${n.id}','${_esc(videoId)}','${_esc(title)}','${_esc(channel)}','${_esc(duration)}')">
        <span class="n-note-dot ${dotCls}" style="width:8px;height:8px"></span>
        <span class="nvps-note-name">${_esc(n.name)}</span>
        <span class="n-s-badge ${statusCls}" style="font-size:10px">${statusLbl}</span>
      </div>`;
    }
  }
  list.innerHTML = h;
  sheet.classList.add('vis');
};

window._notesVpSheetClose = function() {
  document.getElementById('notesVpSheet')?.classList.remove('vis');
};

window._notesVpAddConfirm = function(noteId, videoId, title, channel, duration) {
  const r = _findNote(noteId);
  if (!r) return;
  const note = r.note;
  if (!note.blocks.some(b => b.type === 'video' && b.videoId === videoId)) {
    note.blocks.push({ type: 'video', videoId, title, channel, duration, memo: '' });
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
    note.blocks.push({ type: 'video', videoId, title: v.title || '', channel: v.channel || v.ch || '', duration: v.duration || '', memo: '' });
    note.updatedAt = Date.now();
    _save();
  }
  window.toast?.(`📓「${note.name}」に「${v.title || videoId}」を追加しました`);
  if (_activeId === noteId) _renderNote(noteId);
};

// ── init ──
export function renderNotes() {
  if (!_activeId) {
    for (const cat of _data) {
      if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
    }
  }
  _renderSb();
  if (_activeId) _renderNote(_activeId);
  _renderRecent();
}
