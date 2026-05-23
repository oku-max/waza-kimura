// ═══ WAZA KIMURA — カスタムビュー v52.385 ═══
(function () {
'use strict';

// ── 定数 ──
const ORG_COL_LABELS = {
  tb:'トップ/ボトム/スタン', action:'カテゴリ', position:'ポジション',
  technique:'テクニック', counter:'カウント', status:'習得', channel:'チャンネル',
  playlist:'プレイリスト', memo:'要約/メモ', addedAt:'追加日',
  fav:'お気に入り', next:'🎯 Next', drill:'ドリル', duration:'長さ'
};
const CV_COL_DEFAULT = ['fav','next','drill','tb','action','position','technique','counter','status','channel','playlist','addedAt','duration','memo'];

const SEL_COLORS = [
  { bg:'rgba(74,144,217,.25)',  text:'#70b0f0' },
  { bg:'rgba(224,144,0,.25)',   text:'#f0b830' },
  { bg:'rgba(76,175,80,.25)',   text:'#7ed680' },
  { bg:'rgba(224,90,0,.25)',    text:'#f07840' },
  { bg:'rgba(160,90,200,.25)',  text:'#c898f8' },
  { bg:'rgba(0,180,210,.25)',   text:'#60d8f8' },
];

const TYPE_DEFS = [
  { type:'checkbox',    icon:'☐', label:'チェックボックス' },
  { type:'select',      icon:'▾', label:'セレクト' },
  { type:'multiselect', icon:'≡', label:'マルチセレクト' },
  { type:'tracker',     icon:'●', label:'トラッカー' },
  { type:'text',        icon:'T', label:'テキスト' },
  { type:'number',      icon:'#', label:'数値' },
  { type:'progress',    icon:'%', label:'進捗バー' },
  { type:'stars',       icon:'★', label:'評価' },
];

const FILTERABLE_TYPES = new Set(['checkbox','select','multiselect','text','number','stars','progress','tracker']);

const CV_TEMPLATES = [
  { id:'drill', icon:'🏋️', label:'ドリル管理', desc:'練習頻度と進捗を追う',
    columns:[{type:'tracker',label:'ドリルトラッカー',pastDays:4,futureDays:1},{type:'select',label:'メニュー',options:['A','B','C','D']},{type:'checkbox',label:'今週やった'}] },
  { id:'game', icon:'🏆', label:'試合前チェック', desc:'試合に向けた技の準備状況',
    columns:[{type:'stars',label:'習得度'},{type:'progress',label:'完成度'},{type:'number',label:'練習回数',unit:'回'},{type:'text',label:'課題メモ'}] },
  { id:'simple', icon:'📝', label:'シンプルメモ', desc:'軽い記録とチェック管理',
    columns:[{type:'checkbox',label:'チェック'},{type:'stars',label:'優先度'},{type:'text',label:'メモ'}] },
  { id:'progress', icon:'📈', label:'進捗トラッカー', desc:'技の上達具合を数値で管理',
    columns:[{type:'progress',label:'完成度'},{type:'number',label:'スパー回数',unit:'回'},{type:'select',label:'フェーズ',options:['学習中','反復中','使えてる']},{type:'text',label:'次のステップ'}] },
];
const BLANK_TEMPLATE = { id:'blank', icon:'📄', label:'空白から始める', desc:'自分で列を追加', columns:[] };

// ── 状態 ──
let _views = [];
let _curId = null;
let _editingViewId = null;
let _cvSelectedIds = new Set();
let cvColOrder = [...CV_COL_DEFAULT];
let cvColVisibility = {tb:true,action:true,position:true,technique:true,counter:false,status:true,channel:true,playlist:true,memo:true,addedAt:true,fav:true,next:true,duration:true};
let _nextColId = 100;
let _selectedTplId = CV_TEMPLATES[0].id;

// add-col modal state
let _addColTargetViewId = null;
let _selectedType = null;
let _newColOptions = [];
let _newColPastDays = 3;
let _newColFutureDays = 1;
// edit-col modal state
let _editColMode = false;
let _editColId = null;

// sort state
let _cvSortColId = null, _cvSortAsc = true;
// quick-add state
let _cvQuickAddViewId = null;
// new view type selection state
let _selectedViewType = 'table';
let _selectedSelectionMode = 'manual';
let _cvSrchQ = '';
let _cvSavedOrgColOrder = null;
let _cvSavedOrgColVis = null;
let _cvSavedOrgSavePrefs = null;

// ビューごとの統合フィルタ状態スナップショット { [viewId | 'master']: snap }
const _viewFilterSnapshots = {};

function _saveCurrentFilterSnapshot() {
  if (!window._uniSnapshotFilters) return;
  const key = _curId || 'master';
  _viewFilterSnapshots[key] = window._uniSnapshotFilters();
}

function _restoreFilterSnapshot(key) {
  if (!window._uniRestoreFilters) return;
  const snap = _viewFilterSnapshots[key];
  // 初回訪問の条件ビューは保存済みfilterConditionsから復元
  if (!snap && key !== 'master') {
    const view = _views.find(v => v.id === key);
    if (view?.saveMode === 'dynamic' && view.filterConditions) {
      window._uniRestoreFilters(view.filterConditions);
      return;
    }
  }
  window._uniRestoreFilters(snap || {});
}

// filter state
const filterState = {}; // { [viewId]: { [colId]: filterData } }
let _filterCtx = null;
let _cvDragSrc = null;

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getOptionColor(options, value) {
  const idx = (options || []).indexOf(value);
  return SEL_COLORS[((idx % SEL_COLORS.length) + SEL_COLORS.length) % SEL_COLORS.length];
}

// ── Storage ──
// _nextColId を既存データの最大値に更新（セッション跨ぎの ID 重複防止）
function _syncNextColId() {
  _views.forEach(v => {
    (v.columns || []).forEach(c => {
      if (c.id && c.id.startsWith('col')) {
        const n = parseInt(c.id.slice(3));
        if (!isNaN(n) && n > _nextColId) _nextColId = n;
      }
    });
  });
}

function _load() {
  try {
    const raw = localStorage.getItem('wk_cv_views');
    if (raw) _views = JSON.parse(raw);
    _views.forEach(v => { if (!v.rowData) v.rowData = {}; });
    _syncNextColId();
    const prefs = localStorage.getItem('wk_cv_col_prefs');
    if (prefs) { const p = JSON.parse(prefs); cvColOrder = p.order || cvColOrder; cvColVisibility = p.vis || cvColVisibility; }
  } catch(e) { _views = []; }
}

function _save() {
  try {
    localStorage.setItem('wk_cv_views', JSON.stringify(_views));
  } catch(e) {}
  window.saveUserSettings?.();
}

// ── 標準列セル値 ──
function _stdCell(v, col) {
  const dash = '<span style="color:var(--text3)">—</span>';
  switch(col) {
    case 'tb':        return _esc((v.tb||[]).join('/')) || dash;
    case 'action':    return _esc((v.cat||[]).join('/')) || dash;
    case 'position':  return _esc((v.pos||[]).join('/')) || dash;
    case 'technique': return _esc((v.tags||[]).join('/')) || dash;
    case 'counter':   return dash;
    case 'status':    return v.status ? _esc(v.status) : dash;
    case 'channel':   return _esc(v.channel||v.ch||'') || dash;
    case 'playlist':  return _esc(v.pl||'') || dash;
    case 'memo':      { const m = v.memo || ''; return m ? `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;max-width:160px" title="${_esc(m)}">${_esc(m)}</span>` : dash; }
    case 'addedAt':   return v.addedAt ? _esc(String(v.addedAt).slice(0,10)) : dash;
    case 'duration':  { const s = typeof v.duration === 'number' ? v.duration : parseInt(v.duration)||0; if (!s) return dash; return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
    case 'fav':       return v.fav ? '⭐' : '<span style="color:var(--text3)">☆</span>';
    case 'next':      return v.next ? '🎯' : '';
    default: return '';
  }
}

// ── ビューバー描画 ──
function _renderViewBar() {
  const mainBtn   = document.getElementById('cv-main-btn');
  const badge     = document.getElementById('cv-selected-badge');
  const badgeText = document.getElementById('cv-badge-text');
  const groupBox  = document.getElementById('cv-group-box');
  const groupLbl  = document.getElementById('cv-group-lbl');
  if (!mainBtn || !badge) return;
  if (_curId) {
    const view = _views.find(v => v.id === _curId);
    if (view) {
      const icon = view.saveMode === 'dynamic' ? '🔄' : '📌';
      badgeText.textContent = icon + ' ' + view.label;
      badge.style.display = 'flex';
      mainBtn.style.display = 'none';
      groupBox?.classList.add('cv-active');
      groupLbl?.classList.add('cv-lbl-active');
      return;
    }
  }
  badge.style.display = 'none';
  mainBtn.style.display = '';
  groupBox?.classList.remove('cv-active');
  groupLbl?.classList.remove('cv-lbl-active');
}

// ── カスタムビュー選択モーダル ──
let _cvPickerEditMode = false;

window.cvOpenViewPicker = function() {
  let el = document.getElementById('cv-picker-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cv-picker-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:flex;align-items:center;justify-content:center';
    el.addEventListener('click', e => { if (e.target === el) _closePicker(); });
    document.body.appendChild(el);
  }
  el.innerHTML = _buildPickerHTML();
  el.style.display = 'flex';
};

function _buildPickerHTML() {
  const items = _views.map((v, idx) => {
    const icon = v.saveMode === 'dynamic' ? '🔄' : '📌';
    const modeLbl = v.saveMode === 'dynamic' ? '条件で自動選択' : '手動選択';
    const cnt = v.saveMode === 'dynamic'
      ? (v.filterConditions ? _applyConditions(v.filterConditions, window.videos || []).length : 0)
      : (v.videoIds || []).length;
    const isActive = v.id === _curId;

    if (_cvPickerEditMode) {
      const canUp   = idx > 0;
      const canDown = idx < _views.length - 1;
      return `<div class="cv-picker-item cv-picker-edit-row">
        <div class="cv-picker-arrows">
          <button class="cv-picker-arrow-btn" onclick="event.stopPropagation();window._cvMoveView('${v.id}',-1)" ${canUp ? '' : 'disabled'}>▲</button>
          <button class="cv-picker-arrow-btn" onclick="event.stopPropagation();window._cvMoveView('${v.id}',1)" ${canDown ? '' : 'disabled'}>▼</button>
        </div>
        <span class="cv-picker-icon">${icon}</span>
        <span class="cv-picker-info">
          <span class="cv-picker-name">${_esc(v.label)}</span>
          <span class="cv-picker-meta">${modeLbl} · ${cnt}本</span>
        </span>
        <button class="cv-picker-del-btn" onclick="event.stopPropagation();window._cvDeleteView('${v.id}')" title="削除">🗑</button>
      </div>`;
    }

    return `<div class="cv-picker-item${isActive ? ' active' : ''}" onclick="window._cvPickerSelect('${v.id}')">
      <span class="cv-picker-icon">${icon}</span>
      <span class="cv-picker-info">
        <span style="display:flex;align-items:center;gap:4px">
          <span class="cv-picker-name">${_esc(v.label)}</span>
          <button class="cv-picker-rename-btn" onclick="event.stopPropagation();window._cvRenameView('${v.id}')" title="名前を変更">✏️</button>
        </span>
        <span class="cv-picker-meta">${modeLbl} · ${cnt}本</span>
      </span>
      <span class="cv-picker-check">${isActive ? '✓' : ''}</span>
      <button class="cv-picker-edit-btn" onclick="event.stopPropagation();window._closePicker();window.cvOpenConditionEditor('${v.id}')">編集</button>
    </div>`;
  }).join('');

  const clearRow = _curId ? `
    <div class="cv-picker-divider"></div>
    <div class="cv-picker-item cv-picker-clear" onclick="window._cvClearSelection();window._closePicker()">
      <span class="cv-picker-icon" style="font-size:14px">✕</span>
      <span class="cv-picker-info"><span class="cv-picker-name" style="color:#e06060">選択を解除</span><span class="cv-picker-meta">ライブラリ全件に戻る</span></span>
    </div>` : '';

  const footer = _cvPickerEditMode ? '' : `
      <div class="cv-picker-divider"></div>
      ${clearRow}
      <div class="cv-picker-item cv-picker-new" onclick="window._closePicker();window.cvOpenNewModal()">
        <span class="cv-picker-icon" style="color:var(--accent);font-size:18px">＋</span>
        <span class="cv-picker-info"><span class="cv-picker-name" style="color:var(--accent)">新しいカスタムビューを作成</span><span class="cv-picker-meta">手動選択 / 条件で自動選択</span></span>
      </div>`;

  const editToggleBtn = _views.length > 0 ? `<button onclick="window._cvPickerToggleEdit()" class="cv-picker-organize-btn${_cvPickerEditMode ? ' active' : ''}">${_cvPickerEditMode ? '完了' : '整理'}</button>` : '';

  return `<div class="cv-picker-modal">
    <div class="cv-picker-header">
      <span style="font-size:14px;font-weight:700">カスタムビュー</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${editToggleBtn}
        <button onclick="window._closePicker()" style="border:none;background:var(--surface2);color:var(--text3);border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">✕</button>
      </div>
    </div>
    <div class="cv-picker-body">
      ${items || '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text3)">ビューがありません</div>'}
      ${footer}
    </div>
  </div>`;
}

window._cvEditCurrent = function() {
  if (_curId) window.cvOpenConditionEditor(_curId);
};

window._cvRenameView = function(id) {
  const view = _views.find(v => v.id === id);
  if (!view) return;
  const newName = prompt('カスタムビューの名前を変更', view.label);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  view.label = trimmed;
  _save();
  _renderViewBar();
  const el = document.getElementById('cv-picker-overlay');
  if (el && el.style.display !== 'none') el.innerHTML = _buildPickerHTML();
};

window._cvPickerSelect = function(id) {
  _closePicker();
  _showView(id);
};

window._cvClearSelection = function() {
  _saveCurrentFilterSnapshot();
  _curId = null;
  window._cvVideoIds = null;
  window._cvCardVideoIds = null;
  window._cvOnViewChange?.();
  _restoreFilterSnapshot('master');
  window._libView?.(window._libViewMode || 'card');
};

window._closePicker = function() {
  _cvPickerEditMode = false;
  const el = document.getElementById('cv-picker-overlay');
  if (el) el.style.display = 'none';
};

window._cvPickerToggleEdit = function() {
  _cvPickerEditMode = !_cvPickerEditMode;
  const el = document.getElementById('cv-picker-overlay');
  if (el && el.style.display !== 'none') el.innerHTML = _buildPickerHTML();
};

window._cvDeleteView = function(id) {
  const view = _views.find(v => v.id === id);
  if (!view) return;
  if (!confirm(`「${view.label}」を削除してよろしいですか？`)) return;
  _views = _views.filter(v => v.id !== id);
  if (_curId === id) {
    _curId = null;
    window._cvVideoIds = null;
    window._cvCardVideoIds = null;
    window._cvOnViewChange?.();
  }
  _save();
  _renderViewBar();
  const el = document.getElementById('cv-picker-overlay');
  if (el && el.style.display !== 'none') el.innerHTML = _buildPickerHTML();
};

window._cvMoveView = function(id, dir) {
  const idx = _views.findIndex(v => v.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _views.length) return;
  [_views[idx], _views[newIdx]] = [_views[newIdx], _views[idx]];
  _save();
  _renderViewBar();
  const el = document.getElementById('cv-picker-overlay');
  if (el && el.style.display !== 'none') el.innerHTML = _buildPickerHTML();
};

// ── ビュー切替 ──
function _showView(id) {
  _saveCurrentFilterSnapshot();
  _curId = id;
  _restoreFilterSnapshot(id);
  _renderViewBar();
  document.getElementById('lvt-card')?.classList.remove('lvt-active');
  document.getElementById('lvt-org')?.classList.remove('lvt-active');
  const view = _views.find(v => v.id === id);
  if (!view) return;

  // このビューの動画だけ見せるフィルター
  const viewVideos = _getViewVideos(view);
  const videoIds = viewVideos.map(v => v.id);
  window._cvVideoIds = new Set(videoIds);
  window._vpFilteredList = viewVideos.length ? viewVideos : null;

  if ((view.viewType || 'table') === 'card') {
    window._cvCardVideoIds = window._cvVideoIds;
    window._cvVideoIds = null;
    window._cvAfterRender = null;
    if (window._libViewMode === 'card') {
      window.AF?.();
    } else {
      window._cvInternalNav = true;
      window._libView?.('card');
    }
    document.getElementById('lvt-card')?.classList.remove('lvt-active');
    document.getElementById('lvt-org')?.classList.remove('lvt-active');
  } else {
    window._cvCardVideoIds = null;
    window._cvAfterRender = () => _addCvCols(view);
    const filterBtn = document.getElementById('org-filter-toggle-btn');
    if (filterBtn) {
      filterBtn.textContent = '☰ フィルター';
      filterBtn.onclick = () => window.openOrgFilterOverlay?.();
    }
    // 初回のみグローバル列設定をバックアップ
    if (_cvSavedOrgColOrder === null) {
      _cvSavedOrgColOrder = [...(window.orgColOrder || [])];
      _cvSavedOrgColVis   = {...(window.orgColVisibility || {})};
      _cvSavedOrgSavePrefs = window._saveOrgColPrefs;
    }
    // ビュー固有の列設定を適用
    window.orgColOrder      = view.colOrder ? [...view.colOrder] : [..._cvSavedOrgColOrder];
    window.orgColVisibility = view.colVis   ? {...view.colVis}   : {..._cvSavedOrgColVis};
    // _saveOrgColPrefs をビュー保存にオーバーライド
    window._saveOrgColPrefs = () => {
      view.colOrder = [...window.orgColOrder];
      view.colVis   = {...window.orgColVisibility};
      _save();
    };
    const siOrg = document.getElementById('si-org');
    if (siOrg) {
      siOrg.oninput = () => { _cvSrchQ = siOrg.value; _cvUpdateSearch(view); };
    }
    if (window._libViewMode === 'org') {
      _cvUpdateSearch(view);
    } else {
      _cvSrchQ = '';
      if (siOrg) siOrg.value = '';
      window._cvInternalNav = true;
      window._libView?.('org');
      document.getElementById('lvt-card')?.classList.remove('lvt-active');
      document.getElementById('lvt-org')?.classList.remove('lvt-active');
    }
  }
}

// ── テーブル再描画（列追加・削除・名前変更後）──
function _renderTable(view) {
  if (!view) return;
  _showView(view.id);
}

// ══════════════════════════════════════════════════════════
// ── 統合列順序エンジン（標準列＋カスタム列の混在配置）──
// ══════════════════════════════════════════════════════════

// カスタム列IDかどうか（標準列IDは固定セット）
const _STD_COL_IDS = new Set(['fav','next','drill','tb','action','position','technique','counter','status','channel','playlist','addedAt','duration','memo']);
const _isCustomColId = id => !_STD_COL_IDS.has(id);

// view.unifiedOrder を最新状態に同期
function _ensureUnifiedOrder(view) {
  if (!view.unifiedOrder || !view.unifiedOrder.length) {
    // 初回: 標準列(現在の順)→カスタム列 の順で初期化
    view.unifiedOrder = [
      ...(window.orgColOrder || []),
      ...(view.columns || []).filter(c => !c.hidden).map(c => c.id)
    ];
    _save();
    return;
  }
  const current = new Set(view.unifiedOrder);
  // 新しい標準列を末尾に追加
  (window.orgColOrder || []).forEach(id => {
    if (!current.has(id)) { view.unifiedOrder.push(id); current.add(id); }
  });
  // 新しいカスタム列を末尾に追加
  (view.columns || []).forEach(c => {
    if (!current.has(c.id)) { view.unifiedOrder.push(c.id); current.add(c.id); }
  });
  // 削除されたカスタム列を除去（標準列は非表示でも保持）
  const validCustom = new Set((view.columns || []).map(c => c.id));
  const validStd    = new Set(window.orgColOrder || []);
  view.unifiedOrder = view.unifiedOrder.filter(id =>
    _isCustomColId(id) ? validCustom.has(id) : validStd.has(id)
  );
  _save();
}

// orgColOrder を view.unifiedOrder の標準列部分に同期
function _syncStdColOrder(view) {
  const newStd = view.unifiedOrder.filter(id => !_isCustomColId(id));
  window.orgColOrder.length = 0;
  newStd.forEach(id => window.orgColOrder.push(id));
  view.colOrder = [...newStd];
  window._saveOrgColPrefs?.();
}

// TH / TD を view.unifiedOrder の順にDOM並べ替え
function _reorderAllCols(view) {
  if (!view?.unifiedOrder?.length) return;
  const order = view.unifiedOrder;

  // ─ TH 並べ替え ─
  const theadRow = document.getElementById('orgTheadRow');
  if (theadRow) {
    // アンカー: data-col-id を持たない .cv-custom-th（削除ボタン・追加ボタン）
    const anchor = [...theadRow.querySelectorAll('.cv-custom-th')]
      .find(th => !th.dataset.colId) || null;
    order.forEach(id => {
      const th = _isCustomColId(id)
        ? theadRow.querySelector(`.cv-custom-th[data-col-id="${id}"]`)
        : theadRow.querySelector(`th[data-col="${id}"]`);
      if (!th) return; // 非表示 or 未存在はスキップ
      anchor ? theadRow.insertBefore(th, anchor) : theadRow.appendChild(th);
    });
  }

  // ─ TD 並べ替え（各行）─
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  tbody.querySelectorAll('tr.org-tr').forEach(tr => {
    // アンカー: data-col-id を持たない .cv-custom-td（削除ボタン・空セル）
    const anchor = [...tr.querySelectorAll('.cv-custom-td')]
      .find(td => !td.dataset.colId) || null;
    order.forEach(id => {
      const td = _isCustomColId(id)
        ? tr.querySelector(`.cv-custom-td[data-col-id="${id}"]`)
        : tr.querySelector(`td[data-col="${id}"]`);
      if (!td) return;
      anchor ? tr.insertBefore(td, anchor) : tr.appendChild(td);
    });
  });
}

// ── カスタム列をorg-tableに追加 ──
// ヘッダーは毎回削除→再追加（syncOrgColHeadersの後に正しく末尾へ配置するため）
// セルはバッチ遅延追加があるため未追加行のみ処理
function _addCvCols(view) {
  if (!view || !view.columns) return;

  // カスタム列ヘッダー: 常に削除して再構築
  const theadRow = document.getElementById('orgTheadRow');
  if (theadRow) {
    theadRow.querySelectorAll('.cv-custom-th').forEach(el => el.remove());

    // 標準列のみの幅を計算（カスタム列削除後＝標準列のみの状態で計算）
    const table = theadRow.closest('table');
    const fixedW = 40 + 76 + 180;
    let scrollW = 0;
    theadRow.querySelectorAll('th[data-col]').forEach(th => {
      scrollW += th.offsetWidth || parseInt(th.style.width) || 120;
    });
    const baseW = fixedW + scrollW;

    view.columns.forEach(col => {
      const canFilter = FILTERABLE_TYPES.has(col.type);
      const filterActive = canFilter && hasActiveFilter(view.id, col.id);
      const th = document.createElement('th');
      th.className = 'cv-custom-th';
      th.dataset.colId = col.id;
      th.dataset.col = 'cv:' + col.id; // resize machinaryが th[data-col] を参照するため
      th.style.cssText = `width:${col.width||120}px;min-width:60px`;
      const isSortActive = _cvSortColId === col.id;
      const sortIndText = isSortActive ? (_cvSortAsc ? '▲' : '▼') : '⇅';
      th.innerHTML = `<div class="th-inner" style="font-size:11px;cursor:pointer">${_esc(col.label)}<span class="cv-sort-ind" style="font-size:9px;margin-left:4px;color:${isSortActive ? 'var(--accent)' : 'var(--text3)'};opacity:${isSortActive ? '1' : '0.5'}">${sortIndText}</span><button class="cv-th-menu-btn" data-col-id="${col.id}" title="列オプション" style="margin-left:auto">▾</button></div>`;
      th.addEventListener('click', e => {
        if (e.target.closest('.cv-th-menu-btn')) return;
        e.stopPropagation();
        openThDropdown(th, view, col);
      });
      th.querySelector('.cv-th-menu-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        openThDropdown(th, view, col);
      });
      th.addEventListener('dblclick', e => { e.stopPropagation(); e.preventDefault(); });
      // ドラッグ&ドロップで列順変更
      th.draggable = true;
      th.ondragstart = e => {
        _cvDragSrc = col.id;
        th.classList.add('org-th-dragging');
        e.dataTransfer.effectAllowed = 'move';
      };
      th.ondragend = () => {
        theadRow.querySelectorAll('.cv-custom-th').forEach(el => el.classList.remove('org-th-dragging', 'org-th-drag-over'));
      };
      th.ondragover = e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        theadRow.querySelectorAll('.cv-custom-th').forEach(el => el.classList.remove('org-th-drag-over'));
        if (col.id !== _cvDragSrc) th.classList.add('org-th-drag-over');
      };
      th.ondrop = e => {
        e.preventDefault();
        if (!_cvDragSrc || _cvDragSrc === col.id) return;
        const from = view.columns.findIndex(c => c.id === _cvDragSrc);
        if (from < 0) return;
        const [moved] = view.columns.splice(from, 1);
        // spliceで削除後にターゲットのインデックスを再取得（左→右ドラッグ時のズレ防止）
        const to = view.columns.findIndex(c => c.id === col.id);
        if (to < 0) { view.columns.splice(from, 0, moved); return; }
        view.columns.splice(to, 0, moved);
        _save();
        window._cvRerenderCur();
      };
      theadRow.appendChild(th);
      // リサイズハンドル（organize.js の addResizeHandle を再利用）
      window.addResizeHandle?.(th, () => {
        col.width = th.offsetWidth;
        _save();
        const tbl = theadRow.closest('table');
        if (!tbl) return;
        const fW = 40 + 76 + 180;
        let sW = 0;
        tbl.querySelectorAll('thead tr th[data-col]').forEach(t => sW += t.offsetWidth || parseInt(t.style.width) || 120);
        tbl.style.width = (fW + sW) + 'px';
      }, null);
    });
    // 手動モード専用: 削除列ヘッダー（addThより先に追加してaddThが常に最後）
    if (view.saveMode !== 'dynamic') {
      const delTh = document.createElement('th');
      delTh.className = 'cv-custom-th';
      delTh.style.cssText = 'width:40px;min-width:40px';
      delTh.innerHTML = `<div class="th-inner"></div>`;
      theadRow.appendChild(delTh);
    }
    // 「＋ 列を追加」ボタン（常に最後）
    const addTh = document.createElement('th');
    addTh.className = 'cv-custom-th';
    addTh.innerHTML = `<div class="th-inner"><button onclick="window.cvOpenAddCol('${view.id}')" style="font-size:11px;padding:3px 8px;border-radius:6px;border:1px dashed var(--border2);background:none;color:var(--text3);cursor:pointer;white-space:nowrap">＋ 列を追加</button></div>`;
    theadRow.appendChild(addTh);

    // テーブル幅を標準列＋カスタム列の合計に更新
    if (table) {
      const cvW = view.columns.length * 120 + 80; // 120px/列 + 80px for add button
      table.style.width = (baseW + cvW) + 'px';
    }
  }

  // 各行にカスタムセルを追加（バッチ遅延追加があるため未追加行のみ）
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  tbody.querySelectorAll('tr.org-tr').forEach(tr => {
    if (tr.querySelector('.cv-custom-td')) return;
    const vid = tr.id.replace('org-row-', '');
    if (!vid) return;
    if (!view.rowData[vid]) view.rowData[vid] = {};
    const rd = view.rowData[vid];
    view.columns.forEach(col => {
      const td = document.createElement('td');
      td.className = 'cv-custom-td org-td';
      td.dataset.vid = vid;
      td.dataset.colId = col.id;
      _renderCell(td, col, rd[col.id], view);
      tr.appendChild(td);
    });
    // 手動モード専用: 削除ボタン（emptyTdより先に追加）
    if (view.saveMode !== 'dynamic') {
      const delTd = document.createElement('td');
      delTd.className = 'cv-custom-td org-td';
      delTd.style.cssText = 'text-align:center;padding:0 4px;width:40px';
      delTd.innerHTML = `<button onclick="window._cvRemoveVideo('${view.id}','${_esc(vid)}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:4px 6px;border-radius:4px;line-height:1" title="リストから削除" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text3)'">✕</button>`;
      tr.appendChild(delTd);
    }
    const emptyTd = document.createElement('td');
    emptyTd.className = 'cv-custom-td';
    tr.appendChild(emptyTd);
  });

  _applyCvSort(view);
  _applyCustomFilters(view);
  // 統合順序を適用（標準列とカスタム列を混在配置）
  _ensureUnifiedOrder(view);
  _reorderAllCols(view);
}

function _getViewVideos(view) {
  const all = window.videos || [];
  if (view.saveMode === 'dynamic' && view.filterConditions) {
    return _applyConditions(view.filterConditions, all);
  }
  if (view.videoIds && view.videoIds.length) {
    return all.filter(v => view.videoIds.includes(v.id));
  }
  return [];
}

function _cvUpdateSearch(view) {
  const q = (_cvSrchQ || '').toLowerCase().trim();
  const videos = _getViewVideos(view);
  const filtered = q ? videos.filter(v => (v.title || '').toLowerCase().includes(q)) : videos;
  window._cvVideoIds = new Set(filtered.map(v => v.id));
  window._vpFilteredList = filtered.length ? filtered : null;
  window.renderOrg?.();
}

function _applyConditions(fc, all) {
  return all.filter(v => {
    if (!fc) return true;
    if (fc.tb   && fc.tb.length   && !(v.tb   ||[]).some(x => fc.tb.includes(x)))   return false;
    if (fc.cat  && fc.cat.length  && !(v.cat  ||[]).some(x => fc.cat.includes(x)))  return false;
    if (fc.pos  && fc.pos.length  && !(v.pos  ||[]).some(x => fc.pos.includes(x)))  return false;
    if (fc.ch   && fc.ch.length   && !fc.ch.includes(v.channel||v.ch||'')           ) return false;
    if (fc.tech && fc.tech.length && !(v.tags ||[]).some(x => fc.tech.includes(x))) return false;
    if (fc.pl   && fc.pl.length   && !fc.pl.includes(v.pl||''))                      return false;
    return true;
  });
}

function _condSummary(fc) {
  if (!fc) return '';
  const parts = [];
  if ((fc.tb  ||[]).length) parts.push(fc.tb.join('/'));
  if ((fc.cat ||[]).length) parts.push(fc.cat.join('/'));
  if ((fc.pos ||[]).length) parts.push(fc.pos.join('/'));
  if ((fc.ch  ||[]).length) parts.push(fc.ch.join('/'));
  if ((fc.tech||[]).length) parts.push(fc.tech.join('/'));
  if ((fc.pl  ||[]).length) parts.push(fc.pl.join('/'));
  return parts.length ? parts.join(' · ') : '条件なし（全件）';
}

// ── セルレンダリング ──
function _renderCell(td, col, val, view) {
  td.innerHTML = '';
  switch(col.type) {
    case 'checkbox': {
      td.style.width = '80px';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:center';
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = !!val;
      chk.style.cssText = 'accent-color:var(--accent);width:16px;height:16px;cursor:pointer';
      chk.addEventListener('change', () => window._cvSetCell(view.id, td.dataset.vid, col.id, chk.checked));
      wrap.appendChild(chk); td.appendChild(wrap);
      break;
    }
    case 'stars': {
      td.style.width = '100px';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:1px';
      let current = Number(val) || 0;
      const btns = [];
      for (let i = 1; i <= 5; i++) {
        const b = document.createElement('button');
        b.style.cssText = `background:none;border:none;cursor:pointer;font-size:16px;color:${i<=current?'#f0c040':'var(--text3)'};padding:0;line-height:1`;
        b.textContent = '★'; b.dataset.star = i; btns.push(b); wrap.appendChild(b);
      }
      function setStars(n, hover) {
        btns.forEach((b, idx) => { b.style.color = idx < n ? (hover ? '#f0c040' : '#f0c040') : 'var(--text3)'; });
      }
      btns.forEach((b, idx) => {
        b.addEventListener('mouseenter', () => setStars(idx+1, true));
        b.addEventListener('click', () => {
          const n = idx+1; current = current === n ? 0 : n;
          window._cvSetCell(view.id, td.dataset.vid, col.id, current);
          setStars(current, false);
        });
      });
      wrap.addEventListener('mouseleave', () => setStars(current, false));
      td.appendChild(wrap);
      break;
    }
    case 'progress': {
      td.style.width = '140px';
      const pct = Math.max(0, Math.min(100, Number(val)||0));
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:6px';
      const barWrap = document.createElement('div');
      barWrap.style.cssText = 'flex:1;height:8px;background:var(--surface3);border-radius:4px;overflow:visible;cursor:pointer;position:relative;border-radius:4px;flex-shrink:0;width:90px';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;border-radius:4px;background:var(--accent);width:${pct}%;pointer-events:none`;
      barWrap.appendChild(fill);
      const pctLabel = document.createElement('div');
      pctLabel.style.cssText = 'font-size:11px;color:var(--text2);min-width:30px;text-align:right;font-family:monospace';
      pctLabel.textContent = pct + '%';
      function updateProgress(e) {
        const rect = barWrap.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newPct = Math.round(ratio * 100);
        fill.style.width = newPct + '%'; pctLabel.textContent = newPct + '%';
        window._cvSetCell(view.id, td.dataset.vid, col.id, newPct);
      }
      let dragging = false;
      barWrap.addEventListener('mousedown', e => { dragging = true; updateProgress(e); e.preventDefault(); });
      document.addEventListener('mousemove', e => { if (dragging) updateProgress(e); });
      document.addEventListener('mouseup', () => { dragging = false; });
      wrap.appendChild(barWrap); wrap.appendChild(pctLabel); td.appendChild(wrap);
      break;
    }
    case 'number': {
      td.style.width = '90px';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:4px;justify-content:flex-end';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.value = val != null ? val : ''; inp.min = '0';
      inp.style.cssText = 'background:transparent;border:none;color:var(--text);font-size:12px;font-family:monospace;width:50px;text-align:right;outline:none;padding:2px 4px;border-radius:4px';
      inp.addEventListener('mouseenter', () => inp.style.background = 'var(--surface3)');
      inp.addEventListener('mouseleave', () => { if (document.activeElement !== inp) inp.style.background = 'transparent'; });
      inp.addEventListener('focus', () => inp.style.background = 'var(--surface2)');
      inp.addEventListener('blur', () => { inp.style.background = 'transparent'; window._cvSetCell(view.id, td.dataset.vid, col.id, inp.value === '' ? null : Number(inp.value)); });
      const unit = document.createElement('span');
      unit.style.cssText = 'color:var(--text3);font-size:11px'; unit.textContent = col.unit || '';
      wrap.appendChild(inp); wrap.appendChild(unit); td.appendChild(wrap);
      break;
    }
    case 'text': {
      const displayText = val || '';
      const div = document.createElement('div');
      div.className = 'org-memo-text';
      div.style.cssText = 'cursor:pointer;min-height:20px';
      div.innerHTML = displayText
        ? _esc(displayText).replace(/\n/g, '<br>')
        : '<span style="color:var(--text3);font-size:10px">—</span>';
      div.addEventListener('click', e => {
        e.stopPropagation();
        const curVal = td.dataset.cvVal || '';
        const ta = document.createElement('textarea');
        ta.className = 'org-inline-memo';
        ta.value = curVal;
        td.innerHTML = '';
        td.classList.add('org-td-editing');
        td.appendChild(ta);
        requestAnimationFrame(() => { ta.focus(); ta.style.height = Math.max(48, td.clientHeight - 4) + 'px'; });
        ta.addEventListener('keydown', e2 => {
          if (e2.key === 'Escape') { _renderCell(td, col, curVal, view); td.classList.remove('org-td-editing'); e2.preventDefault(); }
        });
        ta.addEventListener('blur', () => {
          const nv = ta.value;
          window._cvSetCell(view.id, td.dataset.vid, col.id, nv);
          _renderCell(td, col, nv, view);
          td.classList.remove('org-td-editing');
        });
      });
      td.dataset.cvVal = displayText; // 生の値を保持（HTML escapeせずに取得するため）
      td.appendChild(div);
      break;
    }
    case 'select': {
      td.style.width = '110px';
      const wrap = document.createElement('div');
      wrap.style.cursor = 'pointer';
      const opts = col.options || [];
      const cur = val || '';
      if (cur && opts.includes(cur)) {
        const color = getOptionColor(opts, cur);
        const pill = document.createElement('span');
        pill.style.cssText = `display:inline-flex;align-items:center;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:500;background:${color.bg};color:${color.text}`;
        pill.textContent = cur;
        wrap.appendChild(pill);
      } else {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--text3);font-size:12px';
        empty.textContent = '─ 選択'; wrap.appendChild(empty);
      }
      wrap.addEventListener('click', e => {
        e.stopPropagation();
        openSelectPopup(td, col, cur, view, newVal => {
          window._cvSetCell(view.id, td.dataset.vid, col.id, newVal);
          _renderCell(td, col, newVal, view);
        });
      });
      td.appendChild(wrap);
      break;
    }
    case 'multiselect': {
      td.style.width = '150px';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:3px;flex-wrap:nowrap;overflow:hidden;max-width:150px';
      const vals = Array.isArray(val) ? val : [];
      if (vals.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--text3);font-size:12px';
        empty.textContent = '─ 選択'; wrap.appendChild(empty);
      } else {
        vals.forEach(v => {
          const color = getOptionColor(col.options || [], v);
          const pill = document.createElement('span');
          pill.style.cssText = `display:inline-flex;align-items:center;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:500;flex-shrink:0;background:${color.bg};color:${color.text}`;
          pill.textContent = v; wrap.appendChild(pill);
        });
      }
      wrap.addEventListener('click', e => {
        e.stopPropagation();
        openMultiselectPopup(td, col, vals, view, newVals => {
          window._cvSetCell(view.id, td.dataset.vid, col.id, newVals);
          _renderCell(td, col, newVals, view);
        });
      });
      td.appendChild(wrap);
      break;
    }
    case 'date':
      td.innerHTML = `<input type="date" value="${_esc(val||'')}" style="font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:inherit;cursor:pointer" onchange="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',this.value)">`;
      break;
    case 'tracker': {
      const past = col.pastDays ?? 4;
      const future = col.futureDays ?? 1;
      const doneDates = Array.isArray(val) ? [...val] : [];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:0;align-items:flex-end';
      for (let i = -past; i <= future; i++) {
        if (i === 1) {
          const sep = document.createElement('div');
          sep.style.cssText = 'width:1px;height:20px;background:var(--border2);margin:0 3px;flex-shrink:0;align-self:center';
          wrap.appendChild(sep);
        }
        const d = new Date(); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0,10);
        const isToday = i === 0; const isFuture = i > 0;
        const isDone = doneDates.includes(ds);
        const mm = d.getMonth()+1; const dd2 = d.getDate();
        const dayWrap = document.createElement('div');
        dayWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;width:28px';
        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:9px;color:var(--text3);line-height:1';
        lbl.textContent = `${mm}/${dd2}`;
        const dot = document.createElement('div');
        dot.style.cssText = [
          'width:18px;height:18px;border-radius:50%;cursor:pointer;',
          'display:flex;align-items:center;justify-content:center;',
          'font-size:11px;font-weight:700;line-height:1;flex-shrink:0;',
          isDone
            ? `background:${isFuture ? 'rgba(74,144,217,.4)' : 'var(--accent)'};border:none;color:#fff;`
            : isToday
              ? 'background:transparent;border:2px solid var(--accent);color:transparent;'
              : isFuture
                ? 'background:transparent;border:1.5px dashed var(--text3);color:transparent;'
                : 'background:var(--surface3);border:1.5px solid var(--text3);color:transparent;'
        ].join('');
        dot.textContent = isDone ? '✓' : '';
        dot.addEventListener('click', () => {
          const idx = doneDates.indexOf(ds);
          if (idx >= 0) doneDates.splice(idx, 1); else doneDates.push(ds);
          window._cvSetCell(view.id, td.dataset.vid, col.id, [...doneDates]);
          _renderCell(td, col, [...doneDates], view);
        });
        dayWrap.appendChild(lbl); dayWrap.appendChild(dot); wrap.appendChild(dayWrap);
      }
      td.appendChild(wrap);
      break;
    }
    default:
      td.textContent = val != null ? String(val) : '';
  }
}

// ── セル更新 ──
window._cvSetCell = function(viewId, videoId, colId, val) {
  const view = _views.find(v => v.id === viewId);
  if (!view) return;
  if (!view.rowData[videoId]) view.rowData[videoId] = {};
  view.rowData[videoId][colId] = val;
  _save();
};
window._cvRemoveVideo = function(viewId, videoId) {
  if (!confirm('本当に削除してよろしいですか？')) return;
  const view = _views.find(v => v.id === viewId);
  if (!view) return;
  view.videoIds = (view.videoIds || []).filter(id => id !== videoId);
  _cvSelectedIds.delete(videoId);
  _save();
  _cvUpdateSearch(view);
  _renderViewBar();
};

window._cvRerender = function(viewId) {
  const view = _views.find(v => v.id === viewId);
  if (view) _renderTable(view);
};
window._cvToggleTracker = function(viewId, videoId, colId, dateStr) {
  const view = _views.find(v => v.id === viewId);
  if (!view) return;
  if (!view.rowData[videoId]) view.rowData[videoId] = {};
  let arr = Array.isArray(view.rowData[videoId][colId]) ? [...view.rowData[videoId][colId]] : [];
  if (arr.includes(dateStr)) arr = arr.filter(d => d !== dateStr);
  else arr.push(dateStr);
  view.rowData[videoId][colId] = arr;
  _save();
  // セル単体だけ再描画（テーブル全体の再レンダリング不要）
  const td = document.querySelector(`tr#org-row-${videoId} .cv-custom-td[data-col-id="${colId}"]`);
  if (td) _renderCell(td, view.columns.find(c => c.id === colId), arr, view);
};

// ── Select / Multiselect ポップアップ ──
function openSelectPopup(td, col, currentValue, view, callback) {
  const popup = document.getElementById('cv-popup');
  if (!popup) return;
  popup.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'cv-popup-title'; title.textContent = col.label;
  popup.appendChild(title);
  (col.options || []).forEach(opt => {
    const color = getOptionColor(col.options, opt);
    const item = document.createElement('div');
    item.className = 'cv-popup-item';
    const check = document.createElement('span');
    check.className = 'cv-popup-check'; check.textContent = currentValue === opt ? '✓' : '';
    const pill = document.createElement('span');
    pill.style.cssText = `display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;background:${color.bg};color:${color.text}`;
    pill.textContent = opt;
    item.appendChild(check); item.appendChild(pill);
    item.addEventListener('click', e => { e.stopPropagation(); callback(currentValue === opt ? null : opt); closePopup(); });
    popup.appendChild(item);
  });
  positionAndShowPopup(popup, td);
}

function openMultiselectPopup(td, col, currentValues, view, callback) {
  const popup = document.getElementById('cv-popup');
  if (!popup) return;
  popup.innerHTML = '';
  let selected = [...currentValues];
  const title = document.createElement('div');
  title.className = 'cv-popup-title'; title.textContent = col.label;
  popup.appendChild(title);
  const itemsWrap = document.createElement('div');
  popup.appendChild(itemsWrap);
  function refreshItems() {
    itemsWrap.innerHTML = '';
    (col.options || []).forEach(opt => {
      const color = getOptionColor(col.options, opt);
      const item = document.createElement('div');
      item.className = 'cv-popup-item';
      const check = document.createElement('span');
      check.className = 'cv-popup-check'; check.textContent = selected.includes(opt) ? '✓' : '';
      const pill = document.createElement('span');
      pill.style.cssText = `display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;background:${color.bg};color:${color.text}`;
      pill.textContent = opt;
      item.appendChild(check); item.appendChild(pill);
      item.addEventListener('click', e => {
        e.stopPropagation();
        const idx = selected.indexOf(opt);
        if (idx >= 0) selected.splice(idx, 1); else selected.push(opt);
        callback([...selected]); refreshItems();
      });
      itemsWrap.appendChild(item);
    });
  }
  refreshItems();
  const closeWrap = document.createElement('div');
  closeWrap.className = 'cv-popup-close';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 閉じる';
  closeBtn.addEventListener('click', e => { e.stopPropagation(); closePopup(); });
  closeWrap.appendChild(closeBtn);
  popup.appendChild(closeWrap);
  positionAndShowPopup(popup, td);
}

function positionAndShowPopup(popup, anchorEl) {
  popup.style.display = 'block';
  const rect = anchorEl.getBoundingClientRect();
  const winH = window.innerHeight, winW = window.innerWidth;
  const popH = popup.offsetHeight || 200;
  let top = rect.bottom + 4;
  if (top + popH > winH - 8) top = rect.top - popH - 4;
  if (top < 8) top = 8;
  let left = rect.left;
  const popW = popup.offsetWidth || 180;
  if (left + popW > winW - 8) left = winW - popW - 8;
  if (left < 8) left = 8;
  popup.style.top = top + 'px'; popup.style.left = left + 'px';
}

function closePopup() {
  const p = document.getElementById('cv-popup');
  if (p) p.style.display = 'none';
}

// ── TH ドロップダウン（ソート・再設定・フィルター・操作を統合） ──
let _openThDdCol = null, _openThDdViewId = null, _openThDdLastTime = 0;
// col はクロージャから直接渡される列オブジェクト（find/indexOf 不要、重複IDにも対応）
function openThDropdown(btn, view, col) {
  const dd = document.getElementById('cv-th-dropdown');
  if (!dd) return;
  if (!col || !col.type) return;
  const currentView = _views.find(v => v.id === view.id) || view;
  const _now = Date.now();
  const _isSameDd = (_openThDdCol === col && _openThDdViewId === currentView.id);
  const _timeDiff = _now - _openThDdLastTime;
  // 必ず先に既存ドロップダウンを閉じる（古い内容が残る問題を防ぐ）
  closeFilterPopup(); closePopup();
  closeThDropdown();
  // 同じ列を 350ms 以内に再タップ → トグルで閉じる
  if (_isSameDd && _timeDiff < 350) return;
  _openThDdLastTime = _now;
  _openThDdCol = col; _openThDdViewId = currentView.id;
  dd.innerHTML = '';
  dd.style.cssText = 'position:fixed;z-index:10000;background:var(--surface);border:1.5px solid var(--border2);border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.4);min-width:230px;max-width:270px;max-height:80vh;overflow-y:auto;padding:0';

  // ── ヘッダー ──
  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:8px 12px 6px;font-size:11px;font-weight:700;color:var(--text3);border-bottom:1px solid var(--border)';
  hdr.textContent = col.label;
  dd.appendChild(hdr);


  // ── 列の再設定（型によって表示を変える） ──
  if (col.type === 'select' || col.type === 'multiselect') {
    const sec = _mkSec('選択肢');
    let curOpts = [...(col.options || [])];
    const optList = document.createElement('div');
    function renderOpts() {
      optList.innerHTML = '';
      curOpts.forEach((opt, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px';
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = opt;
        inp.style.cssText = 'flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;padding:3px 6px;min-width:0;outline:none';
        inp.addEventListener('change', () => { curOpts[i] = inp.value; });
        const del = document.createElement('button'); del.textContent = '✕';
        del.style.cssText = 'background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:2px 4px;flex-shrink:0';
        del.addEventListener('click', e => { e.stopPropagation(); curOpts.splice(i, 1); renderOpts(); });
        row.appendChild(inp); row.appendChild(del); optList.appendChild(row);
      });
      const actRow = document.createElement('div');
      actRow.style.cssText = 'display:flex;gap:6px;margin-top:4px';
      const addBtn2 = document.createElement('button'); addBtn2.textContent = '＋ 追加';
      addBtn2.style.cssText = 'font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0';
      addBtn2.addEventListener('click', e => { e.stopPropagation(); curOpts.push(''); renderOpts(); setTimeout(() => { const ins = optList.querySelectorAll('input'); if (ins.length) ins[ins.length-1].focus(); }, 30); });
      const saveBtn = document.createElement('button'); saveBtn.textContent = '保存';
      saveBtn.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:5px;border:none;background:var(--accent);color:#fff;cursor:pointer;margin-left:auto';
      saveBtn.addEventListener('click', e => { e.stopPropagation(); col.options = curOpts.map(o => o.trim()).filter(Boolean); _save(); _renderTable(currentView); closeThDropdown(); });
      actRow.appendChild(addBtn2); actRow.appendChild(saveBtn); optList.appendChild(actRow);
    }
    renderOpts();
    sec.appendChild(optList);
    dd.appendChild(sec);
  } else if (col.type === 'tracker') {
    const sec = _mkSec('日数設定');
    let curPast = col.pastDays ?? 4, curFuture = col.futureDays ?? 1;
    const _btnS = 'width:24px;height:24px;border-radius:5px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0';
    const mkStp = (lbl, getV, setV) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
      const l = document.createElement('span');
      l.style.cssText = 'font-size:10px;color:var(--text3);font-weight:700;white-space:nowrap;min-width:22px';
      l.textContent = lbl;
      const dec = document.createElement('button'); dec.textContent = '−'; dec.style.cssText = _btnS;
      const valEl = document.createElement('span');
      valEl.style.cssText = 'font-size:14px;font-weight:700;color:var(--text);min-width:32px;text-align:center';
      valEl.textContent = getV() + '日';
      const inc = document.createElement('button'); inc.textContent = '＋'; inc.style.cssText = _btnS;
      dec.addEventListener('click', e => { e.stopPropagation(); if (getV() > 0) { setV(getV() - 1); valEl.textContent = getV() + '日'; } });
      inc.addEventListener('click', e => { e.stopPropagation(); if (getV() < 7) { setV(getV() + 1); valEl.textContent = getV() + '日'; } });
      row.appendChild(l); row.appendChild(dec); row.appendChild(valEl); row.appendChild(inc);
      return row;
    };
    sec.appendChild(mkStp('過去', () => curPast, v => { curPast = v; }));
    sec.appendChild(mkStp('未来', () => curFuture, v => { curFuture = v; }));
    const saveBtn = document.createElement('button'); saveBtn.textContent = '保存';
    saveBtn.style.cssText = 'font-size:11px;padding:3px 12px;border-radius:5px;border:none;background:var(--accent);color:#fff;cursor:pointer;margin-top:4px;display:block';
    saveBtn.addEventListener('click', e => { e.stopPropagation(); col.pastDays = curPast; col.futureDays = curFuture; _save(); _renderTable(currentView); closeThDropdown(); });
    sec.appendChild(saveBtn);
    dd.appendChild(sec);
  } else if (col.type === 'number') {
    const sec = _mkSec('単位');
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = col.unit || '';
    inp.placeholder = '例: 回、分、kg';
    inp.style.cssText = 'width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;padding:4px 8px;outline:none;margin-bottom:6px';
    const saveBtn = document.createElement('button'); saveBtn.textContent = '保存';
    saveBtn.style.cssText = 'font-size:11px;padding:3px 12px;border-radius:5px;border:none;background:var(--accent);color:#fff;cursor:pointer';
    saveBtn.addEventListener('click', e => { e.stopPropagation(); col.unit = inp.value.trim(); _save(); _renderTable(currentView); closeThDropdown(); });
    sec.appendChild(inp); sec.appendChild(saveBtn);
    dd.appendChild(sec);
  }

  // ── フィルター ──
  if (FILTERABLE_TYPES.has(col.type)) {
    const sec = _mkSec('フィルター');
    const f = getFilter(currentView.id, col.id) || {};
    _filterCtx = { view: currentView, col, btn };
    switch(col.type) {
      case 'checkbox':    buildChkFilterUI(sec, currentView, col, f);     break;
      case 'select':
      case 'multiselect': buildSelFilterUI(sec, currentView, col, f);     break;
      case 'text':        buildTextFilterUI(sec, currentView, col, f);    break;
      case 'number':      buildNumFilterUI(sec, currentView, col, f);     break;
      case 'stars':       buildStarsFilterUI(sec, currentView, col, f);   break;
      case 'progress':    buildProgressFilterUI(sec, currentView, col, f); break;
      case 'tracker':     buildTrackerFilterUI(sec, currentView, col, f);  break;
    }
    const clrBtn = document.createElement('button'); clrBtn.textContent = 'クリア';
    clrBtn.style.cssText = 'font-size:11px;color:var(--text3);background:none;border:none;cursor:pointer;padding:4px 0;display:block';
    clrBtn.addEventListener('click', e => { e.stopPropagation(); clearFilter(currentView.id, col.id); _applyCustomFilters(currentView); closeThDropdown(); });
    sec.appendChild(clrBtn);
    dd.appendChild(sec);
  }

  // ── 操作 ──
  const actSec = document.createElement('div');
  actSec.style.cssText = 'padding:4px 6px;border-top:1px solid var(--border)';
  const renameBtn = document.createElement('button');
  renameBtn.innerHTML = '📝 列名を変更';
  renameBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;background:none;border:none;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text)';
  renameBtn.addEventListener('click', () => { const n = prompt('新しい列名:', col.label); if (n && n.trim()) { col.label = n.trim(); _save(); _renderTable(currentView); } closeThDropdown(); });
  const delBtn = document.createElement('button');
  delBtn.innerHTML = '🗑 列を削除';
  delBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 8px;background:none;border:none;border-radius:6px;cursor:pointer;font-size:12px;color:#e53e3e';
  delBtn.addEventListener('click', () => {
    if (confirm(`列「${col.label}」を削除しますか？`)) { const idx = currentView.columns.indexOf(col); if (idx >= 0) currentView.columns.splice(idx, 1); Object.keys(currentView.rowData).forEach(vid => delete currentView.rowData[vid][col.id]); _save(); _renderTable(currentView); }
    closeThDropdown();
  });
  actSec.appendChild(renameBtn); actSec.appendChild(delBtn);
  dd.appendChild(actSec);

  // ── 位置決め ──
  dd.style.display = 'block';
  const rect = btn.getBoundingClientRect();
  const winW = window.innerWidth;
  let left = rect.left;
  if (left + 240 > winW - 8) left = winW - 240 - 8;
  if (left < 8) left = 8;
  dd.style.top = (rect.bottom + 4) + 'px'; dd.style.left = left + 'px';
}

function _mkSec(title) {
  const sec = document.createElement('div');
  sec.style.cssText = 'padding:8px 10px;border-top:1px solid var(--border)';
  if (title) {
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px';
    lbl.textContent = title; sec.appendChild(lbl);
  }
  return sec;
}

function closeThDropdown() {
  _openThDdCol = null; _openThDdViewId = null;
  const dd = document.getElementById('cv-th-dropdown');
  if (dd) dd.style.display = 'none';
  _filterCtx = null;
}

// ── 列を追加モーダル ──
window.cvOpenAddCol = function(viewId) { openAddColModal(viewId); };

function openAddColModal(viewId) {
  _addColTargetViewId = viewId;
  _selectedType = null;
  _newColOptions = ['A', 'B', 'C'];
  _newColPastDays = 3; _newColFutureDays = 1;
  const grid = document.getElementById('cv-type-grid');
  if (!grid) return;
  grid.innerHTML = '';
  TYPE_DEFS.forEach(def => {
    const btn = document.createElement('button');
    btn.className = 'cv-type-btn'; btn.dataset.type = def.type;
    btn.innerHTML = `<span class="cv-type-icon">${def.icon}</span>${def.label}`;
    btn.addEventListener('click', () => {
      _selectedType = def.type;
      grid.querySelectorAll('.cv-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === def.type));
      showColConfig(def.type);
    });
    grid.appendChild(btn);
  });
  const colConfig = document.getElementById('cv-col-config');
  if (colConfig) colConfig.style.display = 'none';
  const newLabel = document.getElementById('cv-new-col-label');
  if (newLabel) newLabel.value = '';
  const extraConfig = document.getElementById('cv-extra-config');
  if (extraConfig) extraConfig.innerHTML = '';
  const modal = document.getElementById('cv-add-col-modal');
  if (modal) modal.style.display = 'flex';
}

// ── 列を編集モーダル（ヘッダークリック） ──
function openColEditModal(view, colId) {
  const col = view.columns.find(c => c.id === colId);
  if (!col) return;
  _editColMode = true;
  _editColId = colId;
  _addColTargetViewId = view.id;
  _selectedType = col.type;

  // 型グリッドを構築（現在の型を選択済みに）
  const grid = document.getElementById('cv-type-grid');
  if (!grid) return;
  grid.innerHTML = '';
  TYPE_DEFS.forEach(def => {
    const btn = document.createElement('button');
    btn.className = 'cv-type-btn' + (def.type === col.type ? ' selected' : '');
    btn.dataset.type = def.type;
    btn.innerHTML = `<span class="cv-type-icon">${def.icon}</span>${def.label}`;
    btn.addEventListener('click', () => {
      _selectedType = def.type;
      grid.querySelectorAll('.cv-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === def.type));
      showColConfig(def.type);
    });
    grid.appendChild(btn);
  });

  // 設定フォームを表示（showColConfigはデフォルト値でリセットする）
  showColConfig(col.type);

  // 既存値で上書き
  const labelEl = document.getElementById('cv-new-col-label');
  if (labelEl) labelEl.value = col.label || '';
  if (col.type === 'select' || col.type === 'multiselect') {
    _newColOptions = [...(col.options || [])];
    _renderOptionsList();
  } else if (col.type === 'tracker') {
    _newColPastDays = col.pastDays ?? 3;
    _newColFutureDays = col.futureDays ?? 1;
    const _pv = document.getElementById('cv-past-days-val');
    const _fv = document.getElementById('cv-future-days-val');
    if (_pv) _pv.textContent = _newColPastDays;
    if (_fv) _fv.textContent = _newColFutureDays;
  } else if (col.type === 'number') {
    const unitEl = document.getElementById('cv-new-col-unit');
    if (unitEl) unitEl.value = col.unit || '';
  }

  const modal = document.getElementById('cv-add-col-modal');
  if (!modal) return;
  modal.querySelector('h2').textContent = '列を編集';
  modal.querySelector('.cv-btn-primary').textContent = '変更を保存';
  modal.style.display = 'flex';
}

function showColConfig(type) {
  const colConfig = document.getElementById('cv-col-config');
  if (colConfig) colConfig.style.display = 'block';
  const extra = document.getElementById('cv-extra-config');
  if (!extra) return;
  extra.innerHTML = '';
  if (type === 'select' || type === 'multiselect') {
    extra.innerHTML = `
      <div class="cv-modal-section">
        <div class="cv-modal-label">選択肢</div>
        <div class="cv-options-list" id="cv-options-list"></div>
        <button class="cv-add-option-btn" onclick="window._cvAddOptionRow()">＋ 選択肢を追加</button>
      </div>`;
    _newColOptions = ['A', 'B', 'C'];
    _renderOptionsList();
  } else if (type === 'tracker') {
    const _stepBtnS = 'width:28px;height:28px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:16px;cursor:pointer;font-family:inherit;line-height:1';
    extra.innerHTML = `
      <div class="cv-modal-section">
        <div class="cv-modal-label">過去◯日</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <button type="button" id="cv-past-dec" style="${_stepBtnS}">−</button>
          <span id="cv-past-days-val" style="font-size:16px;font-weight:700;color:var(--text);min-width:32px;text-align:center">3</span>
          <button type="button" id="cv-past-inc" style="${_stepBtnS}">＋</button>
        </div>
      </div>
      <div class="cv-modal-section" style="margin-top:10px">
        <div class="cv-modal-label">未来◯日</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <button type="button" id="cv-future-dec" style="${_stepBtnS}">−</button>
          <span id="cv-future-days-val" style="font-size:16px;font-weight:700;color:var(--text);min-width:32px;text-align:center">1</span>
          <button type="button" id="cv-future-inc" style="${_stepBtnS}">＋</button>
        </div>
      </div>`;
    _newColPastDays = 3; _newColFutureDays = 1;
    document.getElementById('cv-past-dec').addEventListener('click', () => {
      if (_newColPastDays > 0) { _newColPastDays--; document.getElementById('cv-past-days-val').textContent = _newColPastDays; }
    });
    document.getElementById('cv-past-inc').addEventListener('click', () => {
      if (_newColPastDays < 7) { _newColPastDays++; document.getElementById('cv-past-days-val').textContent = _newColPastDays; }
    });
    document.getElementById('cv-future-dec').addEventListener('click', () => {
      if (_newColFutureDays > 0) { _newColFutureDays--; document.getElementById('cv-future-days-val').textContent = _newColFutureDays; }
    });
    document.getElementById('cv-future-inc').addEventListener('click', () => {
      if (_newColFutureDays < 7) { _newColFutureDays++; document.getElementById('cv-future-days-val').textContent = _newColFutureDays; }
    });
  } else if (type === 'number') {
    extra.innerHTML = `
      <div class="cv-modal-section">
        <div class="cv-modal-label">単位</div>
        <input type="text" class="cv-modal-input" id="cv-new-col-unit" placeholder="例: 回、分、kg">
      </div>`;
  }
}

function _renderOptionsList() {
  const list = document.getElementById('cv-options-list');
  if (!list) return;
  list.innerHTML = '';
  _newColOptions.forEach((opt, idx) => {
    const row = document.createElement('div');
    row.className = 'cv-option-row';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = opt;
    inp.addEventListener('change', () => { _newColOptions[idx] = inp.value; });
    const del = document.createElement('button');
    del.className = 'cv-option-del'; del.textContent = '✕';
    del.addEventListener('click', () => { _newColOptions.splice(idx, 1); _renderOptionsList(); });
    row.appendChild(inp); row.appendChild(del); list.appendChild(row);
  });
}

window._cvAddOptionRow = function() {
  _newColOptions.push('');
  _renderOptionsList();
  const inputs = document.querySelectorAll('#cv-options-list input');
  if (inputs.length) inputs[inputs.length-1].focus();
};

window.cvCloseAddColModal = function() {
  const modal = document.getElementById('cv-add-col-modal');
  if (modal) {
    modal.style.display = 'none';
    const h2 = modal.querySelector('h2');
    const btn = modal.querySelector('.cv-btn-primary');
    if (h2) h2.textContent = '列を追加';
    if (btn) btn.textContent = '追加する';
  }
  _selectedType = null;
  _editColMode = false;
  _editColId = null;
};

window.cvConfirmAddCol = function() {
  if (!_selectedType) { alert('型を選択してください'); return; }
  const labelEl = document.getElementById('cv-new-col-label');
  const label = (labelEl ? labelEl.value.trim() : '') || TYPE_DEFS.find(d => d.type === _selectedType)?.label || '新しい列';

  // ── 編集モード ──
  if (_editColMode) {
    const view = _views.find(v => v.id === _addColTargetViewId);
    if (!view) return;
    const col = view.columns.find(c => c.id === _editColId);
    if (!col) return;
    col.label = label;
    if (col.type !== _selectedType) {
      col.type = _selectedType;
      Object.values(view.rowData).forEach(rd => { if (rd[_editColId] !== undefined) rd[_editColId] = null; });
    }
    if (_selectedType === 'select' || _selectedType === 'multiselect') {
      col.options = _newColOptions.filter(o => o.trim() !== '');
      delete col.pastDays; delete col.futureDays; delete col.unit;
    } else if (_selectedType === 'tracker') {
      col.pastDays = _newColPastDays; col.futureDays = _newColFutureDays;
      delete col.options; delete col.unit;
    } else if (_selectedType === 'number') {
      const unitEl = document.getElementById('cv-new-col-unit');
      col.unit = unitEl ? unitEl.value.trim() : '';
      delete col.options; delete col.pastDays; delete col.futureDays;
    } else {
      delete col.options; delete col.pastDays; delete col.futureDays; delete col.unit;
    }
    _save();
    _renderTable(view);
    window.cvCloseAddColModal();
    return;
  }

  // ── 追加モード ──
  const view = _views.find(v => v.id === _addColTargetViewId);
  if (!view) return;
  const newCol = { id: 'col' + (++_nextColId), type: _selectedType, label };
  if (_selectedType === 'select' || _selectedType === 'multiselect') {
    newCol.options = _newColOptions.filter(o => o.trim() !== '');
  } else if (_selectedType === 'tracker') {
    newCol.pastDays = _newColPastDays; newCol.futureDays = _newColFutureDays;
  } else if (_selectedType === 'number') {
    const unitEl = document.getElementById('cv-new-col-unit');
    newCol.unit = unitEl ? unitEl.value.trim() : '';
  }
  const all = window.videos || [];
  all.forEach(v => {
    if (!view.rowData[v.id]) view.rowData[v.id] = {};
    if (_selectedType === 'checkbox') view.rowData[v.id][newCol.id] = false;
    else if (_selectedType === 'multiselect') view.rowData[v.id][newCol.id] = [];
    else if (_selectedType === 'tracker') view.rowData[v.id][newCol.id] = [];
    else if (_selectedType === 'stars') view.rowData[v.id][newCol.id] = 0;
    else if (_selectedType === 'progress') view.rowData[v.id][newCol.id] = 0;
    else view.rowData[v.id][newCol.id] = null;
  });
  view.columns.push(newCol);
  _save();
  window.cvCloseAddColModal();
  _renderTable(view);
};

// ── フィルターシステム ──
function getFilter(viewId, colId) { return (filterState[viewId] || {})[colId] || null; }
function setFilter(viewId, colId, data) {
  if (!filterState[viewId]) filterState[viewId] = {};
  filterState[viewId][colId] = data;
}
function clearFilter(viewId, colId) { if (filterState[viewId]) delete filterState[viewId][colId]; }
function hasActiveFilter(viewId, colId) { const f = getFilter(viewId, colId); return !!(f && f.active); }

function _applyCustomFilters(view) {
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  const fs = filterState[view.id] || {};
  tbody.querySelectorAll('tr.org-tr').forEach(tr => {
    const vid = tr.id.replace('org-row-', '');
    if (!vid) { tr.style.display = ''; return; }
    let show = true;
    for (const col of view.columns) {
      const f = fs[col.id];
      if (!f || !f.active) continue;
      if (!passesFilter(col, f, (view.rowData[vid] || {})[col.id])) { show = false; break; }
    }
    tr.style.display = show ? '' : 'none';
  });
  view.columns.forEach(col => {
    const th = document.querySelector(`.cv-custom-th[data-col-id="${col.id}"]`);
    if (!th) return;
    const fb = th.querySelector('.cv-th-filter-btn');
    if (fb) fb.classList.toggle('active', hasActiveFilter(view.id, col.id));
  });
}

function passesFilter(col, f, value) {
  switch(col.type) {
    case 'checkbox':
      if (!f.active || f.value === 'all') return true;
      return f.value === 'on' ? value === true : value !== true;
    case 'select': {
      if (!f.active || !f.values || f.values.size === 0) return true;
      const v = (value == null || value === '') ? '__empty__' : value;
      return f.values.has(v);
    }
    case 'multiselect': {
      if (!f.active || !f.values || f.values.size === 0) return true;
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) return f.values.has('__empty__');
      return arr.some(v => f.values.has(v));
    }
    case 'text':
      if (!f.active || !f.text) return true;
      return (value || '').toLowerCase().includes(f.text.toLowerCase());
    case 'number': {
      if (!f.active || f.val === '' || f.val == null) return true;
      const n = Number(value);
      if (isNaN(n)) return false;
      if (f.op === '=')     return n === Number(f.val);
      if (f.op === '>=')    return n >= Number(f.val);
      if (f.op === '<=')    return n <= Number(f.val);
      if (f.op === 'range') return n >= Number(f.val) && n <= Number(f.val2);
      return true;
    }
    case 'stars':
      if (!f.active || f.minStars == null) return true;
      return (Number(value) || 0) >= f.minStars;
    case 'progress': {
      if (!f.active || f.val === '' || f.val == null) return true;
      const pct = Number(value) || 0;
      if (f.op === '>=')    return pct >= Number(f.val);
      if (f.op === '<=')    return pct <= Number(f.val);
      if (f.op === 'range') return pct >= Number(f.val) && pct <= Number(f.val2);
      return true;
    }
    case 'tracker': {
      if (!f.active || f.value === 'all') return true;
      const dates = Array.isArray(value) ? value : [];
      return f.value === 'done' ? dates.length > 0 : dates.length === 0;
    }
    default: return true;
  }
}

function openFilterPopup(btn, view, col) {
  closeFilterPopup(); closePopup(); closeThDropdown();
  const popup = document.getElementById('cv-filter-popup');
  if (!popup) return;
  popup.innerHTML = '';
  _filterCtx = { view, col, btn };
  const title = document.createElement('div');
  title.className = 'cv-popup-title'; title.textContent = 'フィルター: ' + col.label;
  popup.appendChild(title);
  const f = getFilter(view.id, col.id) || {};
  switch(col.type) {
    case 'checkbox':    buildChkFilterUI(popup, view, col, f);       break;
    case 'select':      buildSelFilterUI(popup, view, col, f);        break;
    case 'multiselect': buildSelFilterUI(popup, view, col, f);        break;
    case 'text':        buildTextFilterUI(popup, view, col, f);       break;
    case 'number':      buildNumFilterUI(popup, view, col, f);        break;
    case 'stars':       buildStarsFilterUI(popup, view, col, f);      break;
    case 'progress':    buildProgressFilterUI(popup, view, col, f);   break;
    case 'tracker':     buildTrackerFilterUI(popup, view, col, f);    break;
  }
  const sep = document.createElement('div');
  sep.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid var(--border)';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'cv-filter-clear-btn'; clearBtn.textContent = 'フィルターをクリア';
  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    clearFilter(view.id, col.id); _applyCustomFilters(view); closeFilterPopup();
  });
  sep.appendChild(clearBtn); popup.appendChild(sep);
  popup.style.display = 'block';
  _positionFilterPopup(btn);
}

function _positionFilterPopup(anchor) {
  const popup = document.getElementById('cv-filter-popup');
  if (!popup) return;
  const rect = anchor.getBoundingClientRect();
  const winH = window.innerHeight, winW = window.innerWidth;
  const popH = popup.offsetHeight || 200, popW = popup.offsetWidth || 200;
  let top = rect.bottom + 4;
  if (top + popH > winH - 8) top = rect.top - popH - 4;
  if (top < 8) top = 8;
  let left = rect.left;
  if (left + popW > winW - 8) left = winW - popW - 8;
  if (left < 8) left = 8;
  popup.style.top = top + 'px'; popup.style.left = left + 'px';
}

function closeFilterPopup() {
  const fp = document.getElementById('cv-filter-popup');
  if (fp) fp.style.display = 'none';
  _filterCtx = null;
}

function buildChkFilterUI(popup, view, col, f) {
  const cur = f.value || 'all';
  [{v:'all',l:'すべて'},{v:'on',l:'チェックあり ✓'},{v:'off',l:'チェックなし'}].forEach(opt => {
    const label = document.createElement('label');
    label.className = 'cv-filter-row';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'cv-fp-chk'; radio.value = opt.v;
    radio.className = 'cv-filter-chk'; radio.checked = cur === opt.v;
    radio.addEventListener('change', () => {
      setFilter(view.id, col.id, { active: opt.v !== 'all', value: opt.v });
      _applyCustomFilters(view);
    });
    label.appendChild(radio); label.appendChild(document.createTextNode(' ' + opt.l));
    popup.appendChild(label);
  });
}

function buildTrackerFilterUI(popup, view, col, f) {
  const cur = f.value || 'all';
  [{v:'all',l:'すべて'},{v:'done',l:'完了あり'},{v:'none',l:'完了なし'}].forEach(opt => {
    const label = document.createElement('label');
    label.className = 'cv-filter-row';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'cv-fp-trk'; radio.value = opt.v;
    radio.className = 'cv-filter-chk'; radio.checked = cur === opt.v;
    radio.addEventListener('change', () => {
      setFilter(view.id, col.id, { active: opt.v !== 'all', value: opt.v });
      _applyCustomFilters(view);
    });
    label.appendChild(radio); label.appendChild(document.createTextNode(' ' + opt.l));
    popup.appendChild(label);
  });
}

function buildSelFilterUI(popup, view, col, f) {
  const allOpts = [...(col.options || []), '__empty__'];
  const curSel = (f.active && f.values) ? f.values : new Set(allOpts);
  const masterLabel = document.createElement('label');
  masterLabel.className = 'cv-filter-row';
  const masterChk = document.createElement('input');
  masterChk.type = 'checkbox'; masterChk.className = 'cv-filter-chk';
  masterChk.checked = curSel.size >= allOpts.length;
  masterLabel.appendChild(masterChk); masterLabel.appendChild(document.createTextNode(' すべて'));
  popup.appendChild(masterLabel);
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--border);margin:3px 0'; popup.appendChild(divider);
  const rows = [];
  allOpts.forEach(opt => {
    const isEmpty = opt === '__empty__';
    const label = document.createElement('label');
    label.className = 'cv-filter-row';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'cv-filter-chk'; chk.checked = curSel.has(opt);
    const span = document.createElement('span');
    if (!isEmpty) {
      const c = getOptionColor(col.options || [], opt);
      span.style.cssText = `display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;background:${c.bg};color:${c.text}`;
      span.textContent = opt;
    } else {
      span.style.color = 'var(--text3)'; span.textContent = '(未設定)';
    }
    label.appendChild(chk); label.appendChild(span);
    popup.appendChild(label); rows.push({ chk, opt });
    chk.addEventListener('change', () => updateSel());
  });
  masterChk.addEventListener('change', () => { rows.forEach(r => { r.chk.checked = masterChk.checked; }); updateSel(); });
  function updateSel() {
    const vals = new Set(rows.filter(r => r.chk.checked).map(r => r.opt));
    masterChk.checked = vals.size >= allOpts.length;
    setFilter(view.id, col.id, { active: vals.size < allOpts.length, values: vals });
    _applyCustomFilters(view);
  }
}

function buildTextFilterUI(popup, view, col, f) {
  const input = document.createElement('input');
  input.type = 'text'; input.className = 'cv-filter-input';
  input.placeholder = 'キーワードで検索...'; input.value = f.text || '';
  input.addEventListener('input', () => {
    setFilter(view.id, col.id, { active: input.value.length > 0, text: input.value });
    _applyCustomFilters(view);
  });
  popup.appendChild(input);
  setTimeout(() => input.focus(), 50);
}

function buildNumFilterUI(popup, view, col, f) {
  const curOp = f.op || '>=', curVal = f.val ?? '', curVal2 = f.val2 ?? '';
  const opRow = document.createElement('div');
  opRow.className = 'cv-filter-number-row';
  const opSel = document.createElement('select');
  opSel.className = 'cv-filter-op-select';
  [{v:'>=',l:'以上 (≥)'},{v:'<=',l:'以下 (≤)'},{v:'=',l:'等しい (=)'},{v:'range',l:'範囲'}].forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.v; opt.textContent = o.l; opt.selected = curOp === o.v;
    opSel.appendChild(opt);
  });
  const valInput = document.createElement('input');
  valInput.type = 'number'; valInput.className = 'cv-filter-num-input';
  valInput.value = curVal; valInput.placeholder = '値';
  opRow.appendChild(opSel); opRow.appendChild(valInput);
  if (col.unit) { const u = document.createElement('span'); u.style.cssText = 'color:var(--text3);font-size:11px;white-space:nowrap'; u.textContent = col.unit; opRow.appendChild(u); }
  popup.appendChild(opRow);
  const rangeRow = document.createElement('div');
  rangeRow.className = 'cv-filter-number-row';
  rangeRow.style.display = curOp === 'range' ? 'flex' : 'none';
  const toLabel = document.createElement('span'); toLabel.style.cssText = 'color:var(--text3);font-size:11px;flex-shrink:0'; toLabel.textContent = '〜';
  const val2Input = document.createElement('input'); val2Input.type = 'number'; val2Input.className = 'cv-filter-num-input'; val2Input.value = curVal2; val2Input.placeholder = '上限';
  rangeRow.appendChild(toLabel); rangeRow.appendChild(val2Input);
  if (col.unit) { const u2 = document.createElement('span'); u2.style.cssText = 'color:var(--text3);font-size:11px;white-space:nowrap'; u2.textContent = col.unit; rangeRow.appendChild(u2); }
  popup.appendChild(rangeRow);
  function updateNum() {
    const op = opSel.value, val = valInput.value, val2 = val2Input.value;
    rangeRow.style.display = op === 'range' ? 'flex' : 'none';
    setFilter(view.id, col.id, { active: val !== '', op, val, val2 });
    _applyCustomFilters(view);
    if (_filterCtx?.btn) _positionFilterPopup(_filterCtx.btn);
  }
  opSel.addEventListener('change', updateNum);
  valInput.addEventListener('input', updateNum);
  val2Input.addEventListener('input', updateNum);
}

function buildStarsFilterUI(popup, view, col, f) {
  const curMin = f.active ? f.minStars : null;
  [{v:null,l:'すべて',stars:0},{v:1,l:'★1以上',stars:1},{v:2,l:'★2以上',stars:2},{v:3,l:'★3以上',stars:3},{v:4,l:'★4以上',stars:4},{v:5,l:'★5のみ',stars:5}].forEach(opt => {
    const label = document.createElement('label');
    label.className = 'cv-filter-row';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'cv-fp-stars'; radio.className = 'cv-filter-chk'; radio.checked = curMin === opt.v;
    const span = document.createElement('span');
    span.innerHTML = (opt.stars > 0 ? `<span style="color:#f0c040;font-size:12px">${'★'.repeat(opt.stars)}</span> ` : '') + opt.l;
    radio.addEventListener('change', () => { setFilter(view.id, col.id, { active: opt.v !== null, minStars: opt.v }); _applyCustomFilters(view); });
    label.appendChild(radio); label.appendChild(span); popup.appendChild(label);
  });
}

function buildProgressFilterUI(popup, view, col, f) {
  const curOp = f.op || '>=', curVal = f.val ?? '', curVal2 = f.val2 ?? '';
  const opRow = document.createElement('div'); opRow.className = 'cv-filter-number-row';
  const opSel = document.createElement('select'); opSel.className = 'cv-filter-op-select';
  [{v:'>=',l:'以上 (≥)'},{v:'<=',l:'以下 (≤)'},{v:'range',l:'範囲'}].forEach(o => {
    const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; opt.selected = curOp === o.v; opSel.appendChild(opt);
  });
  const valInput = document.createElement('input'); valInput.type = 'number'; valInput.className = 'cv-filter-num-input'; valInput.value = curVal; valInput.placeholder = '0〜100'; valInput.min = '0'; valInput.max = '100';
  const pct1 = document.createElement('span'); pct1.style.cssText = 'color:var(--text3);font-size:11px;flex-shrink:0'; pct1.textContent = '%';
  opRow.appendChild(opSel); opRow.appendChild(valInput); opRow.appendChild(pct1); popup.appendChild(opRow);
  const rangeRow = document.createElement('div'); rangeRow.className = 'cv-filter-number-row'; rangeRow.style.display = curOp === 'range' ? 'flex' : 'none';
  const toLabel = document.createElement('span'); toLabel.style.cssText = 'color:var(--text3);font-size:11px;flex-shrink:0'; toLabel.textContent = '〜';
  const val2Input = document.createElement('input'); val2Input.type = 'number'; val2Input.className = 'cv-filter-num-input'; val2Input.value = curVal2; val2Input.placeholder = '100'; val2Input.min = '0'; val2Input.max = '100';
  const pct2 = document.createElement('span'); pct2.style.cssText = 'color:var(--text3);font-size:11px;flex-shrink:0'; pct2.textContent = '%';
  rangeRow.appendChild(toLabel); rangeRow.appendChild(val2Input); rangeRow.appendChild(pct2); popup.appendChild(rangeRow);
  function updatePct() {
    const op = opSel.value, val = valInput.value, val2 = val2Input.value;
    rangeRow.style.display = op === 'range' ? 'flex' : 'none';
    setFilter(view.id, col.id, { active: val !== '', op, val, val2 });
    _applyCustomFilters(view);
    if (_filterCtx?.btn) _positionFilterPopup(_filterCtx.btn);
  }
  opSel.addEventListener('change', updatePct); valInput.addEventListener('input', updatePct); val2Input.addEventListener('input', updatePct);
}

// ── カスタム列ソート ──
function _applyCvSort(view) {
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  // sort indicator sync
  document.querySelectorAll('.cv-custom-th').forEach(th => {
    const ind = th.querySelector('.cv-sort-ind');
    if (!ind) return;
    const cid = th.dataset.colId;
    const on = cid === _cvSortColId;
    ind.textContent = on ? (_cvSortAsc ? '▲' : '▼') : '⇅';
    ind.style.color = on ? 'var(--accent)' : 'var(--text3)';
    ind.style.opacity = on ? '1' : '0.5';
  });
  if (!_cvSortColId) return;
  const col = view.columns.find(c => c.id === _cvSortColId);
  if (!col) return;
  const rows = [...tbody.querySelectorAll('tr.org-tr')];
  rows.sort((a, b) => {
    const va = a.id.replace('org-row-', '');
    const vb = b.id.replace('org-row-', '');
    let av = (view.rowData[va] || {})[_cvSortColId];
    let bv = (view.rowData[vb] || {})[_cvSortColId];
    if (col.type === 'number' || col.type === 'stars' || col.type === 'progress') {
      av = Number(av) || 0; bv = Number(bv) || 0;
    } else if (col.type === 'checkbox') {
      av = av ? 1 : 0; bv = bv ? 1 : 0;
    } else if (col.type === 'tracker') {
      av = Array.isArray(av) ? av.length : 0; bv = Array.isArray(bv) ? bv.length : 0;
    } else if (col.type === 'multiselect') {
      av = Array.isArray(av) ? av.join(',') : ''; bv = Array.isArray(bv) ? bv.join(',') : '';
    } else {
      av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase();
    }
    if (av < bv) return _cvSortAsc ? -1 : 1;
    if (av > bv) return _cvSortAsc ? 1 : -1;
    return 0;
  });
  rows.forEach(r => tbody.appendChild(r));
}

// ── クイック追加（タイトル検索・最近見た） ──
window.cvOpenQuickAdd = function(viewId) {
  _cvQuickAddViewId = viewId;
  const modal = document.getElementById('cv-quick-add-modal');
  if (!modal) return;
  const q = document.getElementById('cv-quick-add-q');
  if (q) { q.value = ''; q.oninput = () => _renderQuickAddList(q.value); }
  _renderQuickAddList('');
  modal.style.display = 'flex';
  setTimeout(() => q?.focus(), 80);
};

function _renderQuickAddList(query) {
  const list = document.getElementById('cv-quick-add-list');
  if (!list) return;
  const view = _views.find(v => v.id === _cvQuickAddViewId);
  if (!view) return;
  const all = window.videos || [];
  const inView = new Set(view.videoIds || []);
  let candidates;
  if (query.trim()) {
    const q2 = query.toLowerCase();
    candidates = all.filter(v => (v.title||'').toLowerCase().includes(q2) || (v.ch||v.channel||'').toLowerCase().includes(q2)).slice(0, 40);
  } else {
    candidates = [...all].filter(v => v.lastPlayed).sort((a, b) => (b.lastPlayed||0) - (a.lastPlayed||0)).slice(0, 15);
  }
  list.innerHTML = '';
  if (!candidates.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text3);font-size:12px;padding:16px 0;text-align:center';
    empty.textContent = '該当なし';
    list.appendChild(empty); return;
  }
  if (!query.trim()) {
    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px';
    hdr.textContent = '最近見た動画';
    list.appendChild(hdr);
  }
  candidates.forEach(v => {
    let isIn = inView.has(v.id);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)';
    const info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    title.textContent = v.title || '(無題)';
    const ch = document.createElement('div');
    ch.style.cssText = 'font-size:10px;color:var(--text3)';
    ch.textContent = v.ch || v.channel || '';
    info.appendChild(title); info.appendChild(ch);
    const btn2 = document.createElement('button');
    function _syncBtn() {
      btn2.textContent = isIn ? '✓' : '＋';
      btn2.style.cssText = `width:28px;height:28px;border-radius:50%;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;border:1.5px solid ${isIn?'var(--accent)':'var(--border)'};background:${isIn?'var(--accent)':'var(--surface2)'};color:${isIn?'#fff':'var(--text)'}`;
    }
    _syncBtn();
    btn2.addEventListener('click', () => {
      if (!view.videoIds) view.videoIds = [];
      if (isIn) { view.videoIds = view.videoIds.filter(id => id !== v.id); isIn = false; }
      else { view.videoIds.push(v.id); isIn = true; }
      _save(); _syncBtn();
    });
    row.appendChild(info); row.appendChild(btn2); list.appendChild(row);
  });
}

window.cvCloseQuickAdd = function() {
  const modal = document.getElementById('cv-quick-add-modal');
  if (modal) modal.style.display = 'none';
  const view = _views.find(v => v.id === _cvQuickAddViewId);
  if (view) {
    window._cvVideoIds = new Set(view.videoIds || []);
    window.renderOrg?.();
  }
  _cvQuickAddViewId = null;
};

// ── 新規ビューフロー ──
window._cvSelViewType = function(type) {
  _selectedViewType = type;
  const cardLbl = document.getElementById('cv-type-card-lbl');
  const tblLbl = document.getElementById('cv-type-table-lbl');
  if (!cardLbl || !tblLbl) return;
  cardLbl.style.borderColor = type === 'card' ? 'var(--accent)' : 'var(--border)';
  cardLbl.style.background = type === 'card' ? 'rgba(0,120,255,.08)' : '';
  tblLbl.style.borderColor = type === 'table' ? 'var(--accent)' : 'var(--border)';
  tblLbl.style.background = type === 'table' ? 'rgba(0,120,255,.08)' : '';
};

window._cvSelSelectionMode = function(mode) {
  _selectedSelectionMode = mode;
  const manualLbl = document.getElementById('cv-sel-manual-lbl');
  const condLbl = document.getElementById('cv-sel-condition-lbl');
  if (!manualLbl || !condLbl) return;
  manualLbl.style.borderColor = mode === 'manual' ? 'var(--accent)' : 'var(--border)';
  manualLbl.style.background = mode === 'manual' ? 'rgba(0,120,255,.08)' : '';
  condLbl.style.borderColor = mode === 'condition' ? 'var(--accent)' : 'var(--border)';
  condLbl.style.background = mode === 'condition' ? 'rgba(0,120,255,.08)' : '';
};

window.cvOpenNewModal = function() {
  document.getElementById('cv-new-name').value = '';
  _selectedTplId = CV_TEMPLATES[0].id;
  _cvSelectedIds = new Set();
  _editingViewId = null;
  _selectedViewType = 'table';
  _selectedSelectionMode = 'manual';
  window._cvSelViewType('table');
  window._cvSelSelectionMode('manual');
  const modal = document.getElementById('cv-new-modal');
  document.getElementById('cv-step1').style.display = '';
  document.getElementById('cv-step3').style.display = 'none';
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('cv-new-name').focus(), 50);
};

window.cvCloseModal = function() {
  document.getElementById('cv-new-modal').style.display = 'none';
  const sheet = document.getElementById('cv-src-sheet');
  sheet.classList.remove('vis');
  sheet.style.display = 'none';
  window.uniCloseForCv?.();
};

window.cvGoStep2 = function() {
  const name = document.getElementById('cv-new-name').value.trim();
  if (!name) {
    const inp = document.getElementById('cv-new-name');
    inp.focus(); inp.style.outline = '2px solid var(--red)';
    setTimeout(() => inp.style.outline = '', 1200);
    return;
  }
  _goStep3(null, null, _selectedSelectionMode === 'condition' ? 'dynamic' : 'static');
};

window.cvSrcClose = function() {
  const sheet = document.getElementById('cv-src-sheet');
  sheet.classList.remove('vis');
  setTimeout(() => { sheet.style.display = 'none'; document.getElementById('cv-new-modal').style.display = 'flex'; }, 200);
};

window.cvSrcPickLib = function() {
  const sheet = document.getElementById('cv-src-sheet');
  sheet.classList.remove('vis');
  setTimeout(() => { sheet.style.display = 'none'; }, 200);
  _cvSelectedIds = new Set();
  window.uniOpenForCv('__new__');
};

// Unified Filter からのフック
window._cvGetAddedIds = function(viewId) { return _cvSelectedIds; };
window._cvVideoClick = function(videoId) {
  if (_cvSelectedIds.has(videoId)) _cvSelectedIds.delete(videoId);
  else _cvSelectedIds.add(videoId);
  if (_editingViewId) {
    const view = _views.find(v => v.id === _editingViewId);
    if (view) { view.videoIds = [..._cvSelectedIds]; _save(); _cvUpdateSearch(view); _renderViewBar(); }
  }
};
window._cvApply = function() {
  if (_editingViewId) {
    const view = _views.find(v => v.id === _editingViewId);
    if (view) { view.saveMode = 'static'; view.videoIds = [..._cvSelectedIds]; view.filterConditions = null; _save(); _renderTable(view); _renderViewBar(); }
    _editingViewId = null;
    window.uniCloseForCv?.();
  } else {
    window.uniCloseForCv?.();
    _goStep3(null, [..._cvSelectedIds], 'static');
  }
};
window._cvSaveDynamic = function() {
  const fc = _getCurrentFilterConditions();
  if (_editingViewId) {
    const view = _views.find(v => v.id === _editingViewId);
    if (view) { view.saveMode = 'dynamic'; view.filterConditions = fc; view.videoIds = null; _save(); _renderTable(view); _renderViewBar(); }
    _editingViewId = null;
    window.uniCloseForCv?.();
  } else {
    window.uniCloseForCv?.();
    _goStep3(fc, null, 'dynamic');
  }
};

function _getCurrentFilterConditions() {
  const f = window.filters || {};
  const fc = {};
  if (f.tb       && f.tb.size)        fc.tb   = [...f.tb];
  if (f.cat      && f.cat.size)       fc.cat  = [...f.cat];
  if (f.posNew   && f.posNew.size)    fc.pos  = [...f.posNew];
  if (f.channel  && f.channel.size)   fc.ch   = [...f.channel];
  if (f.playlist && f.playlist.size)  fc.pl   = [...f.playlist];
  if (f.tags     && f.tags.size)      fc.tech = [...f.tags];
  return fc;
}

function _goStep3(filterConditions, videoIds, saveMode) {
  window._cvPendingFilterConditions = filterConditions;
  window._cvPendingVideoIds = videoIds;
  window._cvPendingSaveMode = saveMode;
  if (_selectedViewType === 'card') {
    _selectedTplId = 'blank';
    window.cvConfirm();
    return;
  }
  _renderTemplateGrid();
  document.getElementById('cv-step1').style.display = 'none';
  document.getElementById('cv-step3').style.display = '';
  document.getElementById('cv-new-modal').style.display = 'flex';
}

window.cvGoBackToLib = function() {
  document.getElementById('cv-step3').style.display = 'none';
  document.getElementById('cv-step1').style.display = '';
  document.getElementById('cv-new-modal').style.display = 'flex';
};

function _renderTemplateGrid() {
  const grid = document.getElementById('cv-template-grid');
  if (!grid) return;
  grid.innerHTML = '';
  [...CV_TEMPLATES, BLANK_TEMPLATE].forEach((tpl, i) => {
    const card = document.createElement('div');
    card.className = 'cv-template-card' + (tpl.id === _selectedTplId ? ' selected' : '') + (tpl.id === 'blank' ? ' blank' : '');
    card.dataset.tplId = tpl.id;
    card.innerHTML = `<span class="cv-tpl-icon">${tpl.icon}</span>
      <div><div class="cv-tpl-label">${_esc(tpl.label)}</div><div class="cv-tpl-desc">${_esc(tpl.desc)}</div></div>`;
    card.addEventListener('click', () => {
      _selectedTplId = tpl.id;
      grid.querySelectorAll('.cv-template-card').forEach(c => c.classList.toggle('selected', c.dataset.tplId === tpl.id));
    });
    grid.appendChild(card);
  });
}

window.cvConfirm = function() {
  const name = document.getElementById('cv-new-name').value.trim();
  if (!name) return;
  const tpl = [...CV_TEMPLATES, BLANK_TEMPLATE].find(t => t.id === _selectedTplId) || BLANK_TEMPLATE;
  const id = 'cv_' + Date.now();
  const cols = tpl.columns.map(c => ({ id: 'col' + (++_nextColId), ...c }));
  const view = {
    id, label: name,
    viewType: _selectedViewType,
    saveMode: window._cvPendingSaveMode || 'static',
    videoIds: window._cvPendingVideoIds || null,
    filterConditions: window._cvPendingFilterConditions || null,
    columns: cols,
    rowData: {}
  };
  _views.push(view);
  _save();
  window.cvCloseModal();
  _showView(id);
  window.cvOpenConditionEditor(id);
};

// ── 条件再編集 ──
window.cvOpenConditionEditor = function(viewId) {
  const view = _views.find(v => v.id === viewId);
  if (!view) return;
  _editingViewId = viewId;
  _cvSelectedIds = new Set(view.videoIds || []);
  window._cvSelectionMode = view.saveMode === 'dynamic' ? 'condition' : 'manual';
  const f = window.filters || {};
  // まず全フィルターをリセット
  ['tb','cat','posNew','channel','playlist','tags'].forEach(k => f[k]?.clear());
  window.favOnly = false; window.unwOnly = false; window.watchedOnly = false;
  if (view.saveMode === 'dynamic' && view.filterConditions) {
    // 条件モード: 保存済み条件を復元
    const fc = view.filterConditions;
    if (f.tb)       (fc.tb  ||[]).forEach(x => f.tb.add(x));
    if (f.cat)      (fc.cat ||[]).forEach(x => f.cat.add(x));
    if (f.posNew)   (fc.pos ||[]).forEach(x => f.posNew.add(x));
    if (f.channel)  (fc.ch  ||[]).forEach(x => f.channel.add(x));
    if (f.playlist) (fc.pl  ||[]).forEach(x => f.playlist.add(x));
    if (f.tags)     (fc.tech||[]).forEach(x => f.tags.add(x));
  }
  window.uniOpenForCv(viewId);
};

// ── ビュー削除 ──
window._cvDeleteView = function(viewId) {
  if (!confirm('このビューを削除しますか？')) return;
  _views = _views.filter(v => v.id !== viewId);
  _save();
  if (_curId === viewId) {
    _curId = null;
    window._cvVideoIds = null;
    window._cvCardVideoIds = null;
    window._cvAfterRender = null;
    document.querySelectorAll('#orgTheadRow .cv-custom-th').forEach(el => el.remove());
    window._libView?.('card');
  }
  _renderViewBar();
};

// ── III列メニュー ──
window.cvToggleColMenu = function(e) {
  e.stopPropagation();
  let menu = document.getElementById('cv-col-menu');
  if (menu) { menu.remove(); return; }
  const view = _views.find(v => v.id === _curId);
  if (!view || !view.columns?.length) return;
  const cols = view.columns;
  menu = document.createElement('div');
  menu.id = 'cv-col-menu';
  menu.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:200px';
  const btn = e.currentTarget;
  const r = btn.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.innerHTML = '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">カスタム列（↑↓で並替え）</div>' +
    cols.map((col, i) => `
      <div style="display:flex;align-items:center;gap:4px;padding:2px 0">
        <button onclick="window.cvMoveCol('${col.id}',-1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===0?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===0?'disabled':''}>▲</button>
        <button onclick="window.cvMoveCol('${col.id}',1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===cols.length-1?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===cols.length-1?'disabled':''}>▼</button>
        <span style="font-size:12px;flex:1">${_esc(col.label)}</span>
      </div>`).join('');
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function h(ev){
    if (!menu.contains(ev.target) && !ev.target.closest('[onclick*="cvToggleColMenu"]')) {
      menu.remove(); document.removeEventListener('click', h);
    }
  }), 100);
};
window.cvMoveCol = function(colId, dir) {
  const view = _views.find(v => v.id === _curId);
  if (!view) return;
  const i = view.columns.findIndex(c => c.id === colId);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= view.columns.length) return;
  const targetId = view.columns[j].id; // splice前に記録
  const [moved] = view.columns.splice(i, 1);
  view.columns.splice(j, 0, moved);
  // unifiedOrder も同期（隣接スワップ）
  if (view.unifiedOrder) {
    const ui = view.unifiedOrder.indexOf(colId);
    const uj = view.unifiedOrder.indexOf(targetId);
    if (ui >= 0 && uj >= 0) [view.unifiedOrder[ui], view.unifiedOrder[uj]] = [view.unifiedOrder[uj], view.unifiedOrder[ui]];
  }
  _save();
  document.querySelectorAll('.cv-custom-td').forEach(td => td.remove());
  _addCvCols(view);
  const panel = document.getElementById('org-col-menu-panel');
  if (panel) panel.innerHTML = window._buildOrgColMenuHTML?.() || '';
  else window.toggleOrgColMenu?.();
};

// 統合列メニューフック（_buildOrgColMenuHTML から呼ばれる）
// カスタムビュー中は標準列+カスタム列を一本のリストで表示
window._cvGetColMenuSection = function() { return null; }; // 統合メニューで置き換え済み

window._cvGetUnifiedMenuHTML = function() {
  if (!_curId) return null;
  const view = _views.find(v => v.id === _curId);
  if (!view) return null;
  _ensureUnifiedOrder(view);

  const stdVis = window.orgColVisibility || {};
  const order  = view.unifiedOrder;

  // 表示中の列（DOM上に存在する列）
  const visOrder = order.filter(id => {
    if (_isCustomColId(id)) {
      const col = view.columns.find(c => c.id === id);
      return col && !col.hidden;
    }
    return stdVis[id] !== false;
  });

  // 非表示の列
  const hiddenIds = order.filter(id => {
    if (_isCustomColId(id)) {
      const col = view.columns.find(c => c.id === id);
      return col && col.hidden;
    }
    return stdVis[id] === false;
  });

  const _btnS = `background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center`;
  const _cbS  = `accent-color:var(--accent);width:14px;height:14px`;

  let html = '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">表示する列（↑↓で並替え）</div>';

  visOrder.forEach((id, i) => {
    const isCv   = _isCustomColId(id);
    const label  = isCv ? (view.columns.find(c => c.id === id)?.label || id) : (ORG_COL_LABELS[id] || id);
    const badge  = isCv ? `<span style="font-size:8px;background:var(--accent);color:#fff;padding:1px 4px;border-radius:3px;margin-left:3px;vertical-align:middle;opacity:.9">カスタム</span>` : '';
    const disUp  = i === 0 ? 'disabled' : '';
    const disDown= i === visOrder.length - 1 ? 'disabled' : '';
    html += `
      <div style="display:flex;align-items:center;gap:4px;padding:2px 0">
        <button onclick="window._cvUnifiedMoveCol('${id}',-1)" style="${_btnS};opacity:${disUp?'.2':'1'}" ${disUp}>▲</button>
        <button onclick="window._cvUnifiedMoveCol('${id}',1)"  style="${_btnS};opacity:${disDown?'.2':'1'}" ${disDown}>▼</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" checked onchange="window._cvUnifiedSetVis('${id}',this.checked)" style="${_cbS}">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(label)}${badge}</span>
        </label>
      </div>`;
  });

  if (hiddenIds.length) {
    html += '<div style="height:1px;background:var(--border);margin:8px 0"></div>';
    html += '<div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px;opacity:.6">非表示の列</div>';
    hiddenIds.forEach(id => {
      const isCv  = _isCustomColId(id);
      const label = isCv ? (view.columns.find(c => c.id === id)?.label || id) : (ORG_COL_LABELS[id] || id);
      const badge = isCv ? `<span style="font-size:8px;background:var(--accent);color:#fff;padding:1px 4px;border-radius:3px;margin-left:3px;vertical-align:middle;opacity:.9">カスタム</span>` : '';
      html += `
        <div style="display:flex;align-items:center;gap:4px;padding:2px 0;opacity:.5">
          <span style="min-width:68px"></span>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;flex:1;min-width:0">
            <input type="checkbox" onchange="window._cvUnifiedSetVis('${id}',this.checked)" style="${_cbS}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(label)}${badge}</span>
          </label>
        </div>`;
    });
  }

  return html;
};

// 統合メニューから列を移動（表示中の列の中での前後移動）
window._cvUnifiedMoveCol = function(id, dir) {
  if (!_curId) return;
  const view = _views.find(v => v.id === _curId);
  if (!view) return;
  _ensureUnifiedOrder(view);

  const stdVis = window.orgColVisibility || {};
  const order  = view.unifiedOrder;

  // 表示中の列インデックスで移動
  const visIds = order.filter(oid => {
    if (_isCustomColId(oid)) { const c = view.columns.find(cc => cc.id === oid); return c && !c.hidden; }
    return stdVis[oid] !== false;
  });
  const visIdx = visIds.indexOf(id);
  if (visIdx < 0) return;
  const newVisIdx = visIdx + dir;
  if (newVisIdx < 0 || newVisIdx >= visIds.length) return;

  const targetId = visIds[newVisIdx];
  const i = order.indexOf(id);
  const j = order.indexOf(targetId);
  if (i < 0 || j < 0) return;
  [order[i], order[j]] = [order[j], order[i]];

  // 標準列の並び順も同期
  _syncStdColOrder(view);
  _save();
  _reorderAllCols(view);

  // モーダル内容を更新
  const panel = document.getElementById('org-col-menu-panel');
  if (panel) panel.innerHTML = window._cvGetUnifiedMenuHTML() || '';
};

// 統合メニューから列の表示/非表示を切替
window._cvUnifiedSetVis = function(id, visible) {
  if (!_curId) return;
  const view = _views.find(v => v.id === _curId);
  if (!view) return;

  if (_isCustomColId(id)) {
    const col = view.columns.find(c => c.id === id);
    if (!col) return;
    col.hidden = !visible;
    _save();
    window._cvRerenderCur?.();
  } else {
    window.orgColVisibility[id] = visible;
    view.colVis = { ...window.orgColVisibility };
    _save();
    window._saveOrgColPrefs?.();
    window._cvRerenderCur?.();
  }
};

// orgMoveCol のカスタムビュー文脈での上書き
window.orgMoveColOverride = function(col, dir) {
  if (!_curId) return false;
  const view = _views.find(v => v.id === _curId);
  if (!view) return false;
  _ensureUnifiedOrder(view);

  const order = view.unifiedOrder;
  const i = order.indexOf(col);
  if (i < 0) return false;
  const j = i + dir;
  if (j < 0 || j >= order.length) return false;
  [order[i], order[j]] = [order[j], order[i]];

  _syncStdColOrder(view);
  _save();
  _reorderAllCols(view);

  const panel = document.getElementById('org-col-menu-panel');
  if (panel) panel.innerHTML = window._cvGetUnifiedMenuHTML() || '';
  return true;
};

// ヘッダードラッグのカスタムビュー文脈での上書き
window.orgDragReorderOverride = function(fromCol, toCol) {
  if (!_curId) return false;
  const view = _views.find(v => v.id === _curId);
  if (!view) return false;
  _ensureUnifiedOrder(view);

  const order = view.unifiedOrder;
  const i = order.indexOf(fromCol);
  const j = order.indexOf(toCol);
  if (i < 0 || j < 0) return false;
  order.splice(i, 1);
  order.splice(j, 0, fromCol);

  _syncStdColOrder(view);
  _save();
  // ヘッダー再構築 → カスタム列再追加 → DOM並べ替え
  window.syncOrgColHeaders?.();
  window._cvAfterRender?.();
  return true;
};
window._cvRerenderCur = function() {
  const view = _views.find(v => v.id === _curId);
  if (!view) return;
  _renderTable(view);
};

// ── グローバルクリック閉じる ──
document.addEventListener('click', e => {
  const popup = document.getElementById('cv-popup');
  if (popup && popup.style.display !== 'none' && !popup.contains(e.target)) closePopup();
  const dd = document.getElementById('cv-th-dropdown');
  if (dd && dd.style.display !== 'none' && !dd.contains(e.target)) closeThDropdown();
  const fp = document.getElementById('cv-filter-popup');
  if (fp && fp.style.display !== 'none' && !fp.contains(e.target) && !e.target.closest('.cv-th-filter-btn')) closeFilterPopup();
});

// ── ビュー切り替え時のcvステートクリア ──
// index.html の _libView(mode==='card') から直接呼ばれる
window._cvOnViewChange = function() {
  _curId = null;
  _cvSrchQ = '';
  window._cvVideoIds = null;
  window._cvCardVideoIds = null;
  window._cvAfterRender = null;
  window._vpFilteredList = null;
  document.querySelectorAll('#orgTheadRow .cv-custom-th').forEach(el => el.remove());
  const filterBtn = document.getElementById('org-filter-toggle-btn');
  if (filterBtn) {
    filterBtn.textContent = '☰ フィルター';
    filterBtn.onclick = () => window.openOrgFilterOverlay?.();
  }
  // グローバル列設定を復元
  if (_cvSavedOrgColOrder !== null) {
    window.orgColOrder      = _cvSavedOrgColOrder;
    window.orgColVisibility = _cvSavedOrgColVis;
    _cvSavedOrgColOrder = null;
    _cvSavedOrgColVis   = null;
  }
  if (_cvSavedOrgSavePrefs !== null) {
    window._saveOrgColPrefs = _cvSavedOrgSavePrefs;
    _cvSavedOrgSavePrefs = null;
  }
  const siOrg = document.getElementById('si-org');
  if (siOrg) { siOrg.value = ''; siOrg.oninput = () => window.renderOrg?.(); }
  _renderViewBar();
};

// ── 初期化 ──
function _init() {
  _load();
  _renderViewBar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();

window._cvSave = _save;

// Firestore sync 用: saveUserSettings から参照
Object.defineProperty(window, '_cvViews', { get: () => _views, set: v => { _views = v; }, configurable: true });
window._cvApplyLoadedViews = function(views) {
  if (!Array.isArray(views)) return;
  _views = views;
  _views.forEach(v => { if (!v.rowData) v.rowData = {}; });
  _syncNextColId();
  _renderViewBar();
  // アクティブなテーブルビューがある場合、列ヘッダーを最新データで再構築（stale closure 対策）
  if (_curId) {
    const v = _views.find(v => v.id === _curId);
    if (v && (v.viewType || 'table') === 'table') {
      window._cvAfterRender = () => _addCvCols(v);
      window._cvAfterRender();
    }
  }
};

})();
