// ═══ WAZA KIMURA — Notes tab v51.00 ═══
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

// ページ離脱・バックグラウンド移行時に未送信の変更を即時Firestore保存
const _flushNotes = () => {
  if (_saveFsTimer) {
    clearTimeout(_saveFsTimer);
    _saveFsTimer = null;
    window._firebaseSaveNotes?.(_data);
  }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushNotes(); });
window.addEventListener('pagehide', _flushNotes);

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
let _statusFilter = null; // null=全て, 'new'/'wip'/'done'/'review'

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

  // position: fixed relative to viewport so sidebar overflow:hidden doesn't clip
  const cx = e.clientX || e.touches?.[0]?.clientX || window.innerWidth / 2;
  const cy = e.clientY || e.touches?.[0]?.clientY || 100;
  menu.style.position = 'fixed';
  menu.style.top  = Math.min(cy + 4, window.innerHeight - 120) + 'px';
  menu.style.left = Math.min(Math.max(4, cx - 100), window.innerWidth - 144) + 'px';

  document.body.appendChild(menu);
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
    const initStatus = document.getElementById('n-sheet-status')?.value || 'new';
    const newNote = {
      id: _uid(), name, status: initStatus, tags: [],
      updatedAt: Date.now(),
      blocks: []
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
  if (e.key === 'Enter' && !e.shiftKey && !_isTouchDevice()) {
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
      ? `<img src="${thumbSrc}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:22px',textContent:'🎥'}))">`
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
    return `<div class="n-vc-card" onclick="window._notesOpenVPanel?.('${_esc(noteId)}','${_esc(b.videoId)}')">
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
  const ratioHTML = presets.map(([r, label]) =>
    `<button class="n-col-ratio-btn${r.join('-') === ratioKey ? ' active' : ''}"
      onclick="window._notesColRatio('${noteId}',${idx},'${r.join('-')}')">${label}</button>`
  ).join('');
  const slotsHTML = [0, 1].map(slot => {
    const slotBlocks = cols[slot] || [];
    const blocksHTML = slotBlocks.map((sb, bIdx) => _colBlockHTML(sb, bIdx, noteId, idx, slot)).join('');
    return `<div class="n-col-slot">
      ${blocksHTML}
      <div class="n-col-slot-add">
        <button onclick="window._notesColAddText('${noteId}',${idx},${slot})">＋ テキスト</button>
        <button onclick="window._notesColAddVid('${noteId}',${idx},${slot})">＋ 動画</button>
        <button onclick="window._notesColAddImg('${noteId}',${idx},${slot})">＋ 画像</button>
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
  const type = b.type || 'text';

  if (type === 'video') {
    const thumbUrl = _blockThumbUrl(b);
    const thumbEl = thumbUrl
      ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:18px',textContent:'🎥'}))">`
      : `<span style="font-size:18px">🎥</span>`;
    return `<div class="n-col-block-wrap">
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
      <div id="n-snap-${_esc(b.snapId)}" class="n-snap-section"></div>${del}
    </div>`;
  }

  const tag = type === 'h2' ? 'h2' : type === 'quote' ? 'blockquote' : 'div';
  const cls = `n-b-${type} n-editable`;
  const placeholder = type === 'h2' ? '見出し' : type === 'quote' ? '引用' : 'テキストを入力…';
  const content = b.richText ? (b.content || '') : _esc(b.content || '').replace(/\n/g, '<br>');
  return `<div class="n-col-block-wrap">
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

function _initNoteSnapForCol(noteId, snapId, colIdx, slot) {
  window._noteSnapVideos = window._noteSnapVideos || {};
  window._noteSnapVideos[snapId] = { id: snapId, snapshots: [] };
  window._onSnapSync = (sid, refs) => {
    if (sid !== snapId) return;
    const r2 = _findNote(noteId);
    if (!r2) return;
    const colBlock = r2.note.blocks[colIdx];
    if (!colBlock || colBlock.type !== 'col') return;
    const ib = (colBlock.cols[slot] || []).find(b => b.snapId === snapId);
    if (ib) { ib.refs = refs; r2.note.updatedAt = Date.now(); _save(); }
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
  const videoId = _extractYtId(url) || url;
  const title = document.getElementById('n-block-video-title')?.value.trim() || '';
  const channel = document.getElementById('n-block-video-title')?.dataset.channel || '';

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
  _blocksInsertOrPush(r.note.blocks, { type: 'video', videoId, title, channel, duration: '', viewMode });
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
  if (!note.blocks.some(b => b.type === 'video' && b.videoId === videoId)) {
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
  if (!_activeId) {
    for (const cat of _data) {
      if (cat.notes.length) { _activeId = cat.notes[0].id; break; }
    }
  }
  _setupFormatBar();
  _setupTopbarScroll();
  _renderSb();
  if (_activeId) _renderNote(_activeId);
  _renderRecent();
}
