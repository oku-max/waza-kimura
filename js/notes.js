// ═══ WAZA KIMURA — Notes tab v50.24 ═══

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

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── status helpers ──
const STATUS_LABEL = { wip:'学習中', done:'習得', new:'新規', review:'要復習' };
const STATUS_CLS   = { wip:'n-s-wip', done:'n-s-done', new:'n-s-new', review:'n-s-review' };
const STATUS_DOT   = { wip:'n-dot-wip', done:'n-dot-done', new:'n-dot-new', review:'n-dot-review' };

// ── sidebar ──
function _renderSb() {
  const tree = document.getElementById('notesSbTree');
  if (!tree) return;
  let h = '';
  for (const cat of _data) {
    const isOpen = cat.notes.some(n => n.id === _activeId);
    h += `<div class="n-cat${isOpen ? ' open' : ''}" id="n-cat-${cat.id}">
      <div class="n-cat-hdr" onclick="window._notesTogCat('${cat.id}',event)">
        <span class="n-cat-arrow">▶</span>
        <span class="n-cat-icon">${cat.icon}</span>
        <span class="n-cat-name">${_esc(cat.name)}</span>
        <span class="n-cat-cnt">${cat.notes.length}</span>
      </div>
      <div class="n-cat-notes">
        ${cat.notes.map(n => `
          <div class="n-note-item${n.id === _activeId ? ' active' : ''}"
               onclick="window._notesOpenNote('${n.id}',event)">
            <span class="n-note-dot ${STATUS_DOT[n.status] || ''}"></span>
            ${_esc(n.name)}
          </div>`).join('')}
      </div>
    </div>`;
  }
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
function _blockHTML(block) {
  switch (block.type) {
    case 'h2':    return `<div class="n-block"><div class="n-b-h2">${_esc(block.content)}</div></div>`;
    case 'text':  return `<div class="n-block"><div class="n-b-text">${_esc(block.content)}</div></div>`;
    case 'quote': return `<div class="n-block"><div class="n-b-quote">${_esc(block.content)}</div></div>`;
    case 'video': return `<div class="n-block" style="padding:0">
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
      </div>
    </div>`;
    default: return '';
  }
}

function _tagChipHTML(tag) {
  return `<span class="n-chip">${_esc(tag)}</span>`;
}

// ── note content ──
function _renderNote(id) {
  const r = _findNote(id);
  if (!r) return;
  const { note, cat } = r;

  const bc = document.getElementById('notesBreadcrumb');
  if (bc) bc.innerHTML = `Notes › ${_esc(cat.name)} › <b>${_esc(note.name)}</b>`;

  const content = document.getElementById('notesContent');
  if (!content) return;

  const tagsHTML = (note.tags || []).map(_tagChipHTML).join('');
  const statusHTML = `<span class="n-s-badge ${STATUS_CLS[note.status] || ''}">${STATUS_LABEL[note.status] || ''}</span>`;

  content.innerHTML = `
    <div class="n-page-title">${_esc(note.name)}</div>
    <div class="n-tag-row">${tagsHTML}${statusHTML}</div>
    <div id="n-blocks-${id}">
      ${note.blocks.map(_blockHTML).join('')}
    </div>
    <div class="n-add-block" onclick="window.toast?.('ブロック追加は今後対応予定です')">＋ ブロックを追加</div>
  `;
}

// ── public actions ──
window._notesTogCat = function(id, e) {
  if (e.target.closest('.n-note-item')) return;
  document.getElementById('n-cat-' + id)?.classList.toggle('open');
};

window._notesOpenNote = function(id, e) {
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

// ── VPanel integration: called from vpanel ──
window.notesAddVideo = function({ id: videoId, title, channel, duration }) {
  // Open note selector sheet
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

  // avoid duplicate
  const alreadyExists = note.blocks.some(b => b.type === 'video' && b.videoId === videoId);
  if (!alreadyExists) {
    note.blocks.push({ type: 'video', videoId, title, channel, duration, memo: '' });
    note.updatedAt = Date.now();
    _save();
  }

  window._notesVpSheetClose();
  window.toast?.(`📓「${note.name}」に追加しました`);

  // If notes tab is active, re-render
  if (_activeId === noteId) _renderNote(noteId);
};

// ── init ──
export function renderNotes() {
  if (!_activeId) {
    // pick first note
    for (const cat of _data) {
      if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
    }
  }
  _renderSb();
  _renderNote(_activeId);
  _renderRecent();
}
