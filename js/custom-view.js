// ═══ WAZA KIMURA — カスタムビュー v52.285 ═══
(function () {
'use strict';

// ── 定数 ──
const ORG_COL_LABELS = {
  tb:'トップ/ボトム/スタン', action:'カテゴリ', position:'ポジション',
  technique:'テクニック', counter:'カウント', status:'習得', channel:'チャンネル',
  playlist:'プレイリスト', memo:'要約/メモ', addedAt:'追加日',
  fav:'お気に入り', next:'🎯 Next', duration:'長さ'
};
const CV_COL_DEFAULT = ['fav','next','tb','action','position','technique','counter','status','channel','playlist','addedAt','duration','memo'];

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

const FILTERABLE_TYPES = new Set(['checkbox','select','multiselect','text','number','stars','progress']);

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
function _load() {
  try {
    const raw = localStorage.getItem('wk_cv_views');
    if (raw) _views = JSON.parse(raw);
    _views.forEach(v => { if (!v.rowData) v.rowData = {}; });
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
  const host = document.getElementById('cv-chips-host');
  if (!host) return;
  host.innerHTML = '';
  _views.forEach(view => {
    const btn = document.createElement('button');
    btn.className = 'cv-chip' + (view.id === _curId ? ' active' : '');
    btn.dataset.viewId = view.id;
    btn.innerHTML = `<span>${_esc(view.label)}</span><span class="cv-chip-del" onclick="event.stopPropagation();window._cvDeleteView('${view.id}')" title="削除">×</span>`;
    btn.addEventListener('click', () => _showView(view.id));
    host.appendChild(btn);
  });
}

// ── ビュー切替 ──
function _showView(id) {
  _curId = id;
  _renderViewBar();
  const view = _views.find(v => v.id === id);
  if (!view) return;

  // ツールバー更新
  const toolbar = document.getElementById('cv-toolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
    const isDynamic = view.saveMode === 'dynamic';
    const condSummary = isDynamic && view.filterConditions ? _condSummary(view.filterConditions) : '';
    toolbar.innerHTML = `
      <span style="font-size:12px;font-weight:700;color:var(--text)">${_esc(view.label)}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:9px;background:var(--surface3);color:var(--text3)">${isDynamic ? '🔄 動的' : '📌 個別選択'}</span>
      ${condSummary ? `<span style="font-size:11px;color:var(--text3)">${_esc(condSummary)}</span>` : ''}
      <button class="cv-conditions-btn" onclick="window.cvOpenConditionEditor('${view.id}')">条件 ✎</button>
    `;
  }

  // このビューの動画だけ見せるフィルター
  const videoIds = view.saveMode === 'dynamic' && view.filterConditions
    ? _applyConditions(view.filterConditions, window.videos || []).map(v => v.id)
    : (view.videoIds || []);
  window._cvVideoIds = new Set(videoIds);

  // renderOrg完了後にカスタム列を追加（バッチ追加も含め毎回呼ばれる）
  window._cvAfterRender = () => _addCvCols(view);

  // 既にorgビューにいる場合は直接renderOrgを呼ぶ（_libViewの副作用を避ける）
  if (window._libViewMode === 'org') {
    window.renderOrg?.();
  } else {
    window._cvInternalNav = true;
    window._libView?.('org');
  }
}

// ── テーブル再描画（列追加・削除・名前変更後）──
function _renderTable(view) {
  if (!view) return;
  _showView(view.id);
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
      th.style.cssText = 'width:120px;min-width:60px';
      th.innerHTML = `<div class="th-inner" style="font-size:11px">${_esc(col.label)}${
        canFilter ? `<button class="cv-th-filter-btn${filterActive ? ' active' : ''}" data-col-id="${col.id}" title="フィルター"><svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor"><path d="M0 0L9 0L5.5 4.5L5.5 9.5L3.5 9.5L3.5 4.5Z"/></svg></button>` : ''
      }<button class="cv-th-menu-btn" data-col-id="${col.id}" title="列オプション">▾</button></div>`;
      th.querySelector('.cv-th-filter-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        const fp = document.getElementById('cv-filter-popup');
        if (fp && fp.style.display !== 'none' && _filterCtx?.col.id === col.id) closeFilterPopup();
        else openFilterPopup(e.currentTarget, view, col);
      });
      th.querySelector('.cv-th-menu-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        openThDropdown(e.currentTarget, view, col.id);
      });
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
        const tbl = theadRow.closest('table');
        if (!tbl) return;
        const fW = 40 + 76 + 180;
        let sW = 0;
        tbl.querySelectorAll('thead tr th[data-col]').forEach(t => sW += t.offsetWidth || parseInt(t.style.width) || 120);
        tbl.style.width = (fW + sW) + 'px';
      }, null);
    });
    // 「＋ 列を追加」ボタン
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
    const emptyTd = document.createElement('td');
    emptyTd.className = 'cv-custom-td';
    tr.appendChild(emptyTd);
  });

  _applyCustomFilters(view);
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

// ── TH ドロップダウン ──
function openThDropdown(btn, view, colId) {
  const dd = document.getElementById('cv-th-dropdown');
  if (!dd) return;
  const col = view.columns.find(c => c.id === colId);
  if (!col) return;
  dd.innerHTML = '';
  const renameBtn = document.createElement('button');
  renameBtn.innerHTML = '📝 列名を変更';
  renameBtn.addEventListener('click', () => {
    const newLabel = prompt('新しい列名:', col.label);
    if (newLabel && newLabel.trim()) { col.label = newLabel.trim(); _save(); _renderTable(view); }
    closeThDropdown();
  });
  dd.appendChild(renameBtn);
  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.innerHTML = '🗑 列を削除';
  delBtn.addEventListener('click', () => {
    if (confirm(`列「${col.label}」を削除しますか？`)) {
      const idx = view.columns.findIndex(c => c.id === colId);
      if (idx >= 0) view.columns.splice(idx, 1);
      Object.keys(view.rowData).forEach(vid => delete view.rowData[vid][colId]);
      _save(); _renderTable(view);
    }
    closeThDropdown();
  });
  dd.appendChild(delBtn);
  dd.style.display = 'block';
  const rect = btn.getBoundingClientRect();
  const winW = window.innerWidth;
  let left = rect.left;
  if (left + 160 > winW - 8) left = winW - 160 - 8;
  dd.style.top = (rect.bottom + 4) + 'px'; dd.style.left = left + 'px';
}

function closeThDropdown() {
  const dd = document.getElementById('cv-th-dropdown');
  if (dd) dd.style.display = 'none';
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
    extra.innerHTML = `
      <div class="cv-modal-section">
        <div class="cv-modal-label">過去◯日</div>
        <div class="cv-days-group" id="cv-past-days-group">
          ${[0,1,2,3,5,7].map(n => `<button class="cv-days-btn${n===3?' selected':''}" data-days="${n}">${n}日</button>`).join('')}
        </div>
      </div>
      <div class="cv-modal-section" style="margin-top:10px">
        <div class="cv-modal-label">未来◯日</div>
        <div class="cv-days-group" id="cv-future-days-group">
          ${[0,1,2,3,5,7].map(n => `<button class="cv-days-btn${n===1?' selected':''}" data-days="${n}">${n}日</button>`).join('')}
        </div>
      </div>`;
    _newColPastDays = 3; _newColFutureDays = 1;
    document.getElementById('cv-past-days-group').querySelectorAll('.cv-days-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('cv-past-days-group').querySelectorAll('.cv-days-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); _newColPastDays = parseInt(btn.dataset.days);
      });
    });
    document.getElementById('cv-future-days-group').querySelectorAll('.cv-days-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('cv-future-days-group').querySelectorAll('.cv-days-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); _newColFutureDays = parseInt(btn.dataset.days);
      });
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
  if (modal) modal.style.display = 'none';
  _selectedType = null;
};

window.cvConfirmAddCol = function() {
  if (!_selectedType) { alert('型を選択してください'); return; }
  const labelEl = document.getElementById('cv-new-col-label');
  const label = (labelEl ? labelEl.value.trim() : '') || TYPE_DEFS.find(d => d.type === _selectedType)?.label || '新しい列';
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

// ── 新規ビューフロー ──
window.cvOpenNewModal = function() {
  document.getElementById('cv-new-name').value = '';
  _selectedTplId = CV_TEMPLATES[0].id;
  _cvSelectedIds = new Set();
  _editingViewId = null;
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
  document.getElementById('cv-new-modal').style.display = 'none';
  const sheet = document.getElementById('cv-src-sheet');
  sheet.style.display = '';
  requestAnimationFrame(() => sheet.classList.add('vis'));
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
  _renderTemplateGrid();
  document.getElementById('cv-step1').style.display = 'none';
  document.getElementById('cv-step3').style.display = '';
  document.getElementById('cv-new-modal').style.display = 'flex';
}

window.cvGoBackToLib = function() {
  document.getElementById('cv-new-modal').style.display = 'none';
  window.cvSrcPickLib();
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
};

// ── 条件再編集 ──
window.cvOpenConditionEditor = function(viewId) {
  const view = _views.find(v => v.id === viewId);
  if (!view) return;
  _editingViewId = viewId;
  _cvSelectedIds = new Set(view.videoIds || []);
  if (view.saveMode === 'dynamic' && view.filterConditions) {
    const fc = view.filterConditions;
    const f = window.filters || {};
    if (f.tb)       { f.tb.clear();       (fc.tb  ||[]).forEach(x => f.tb.add(x)); }
    if (f.cat)      { f.cat.clear();      (fc.cat ||[]).forEach(x => f.cat.add(x)); }
    if (f.posNew)   { f.posNew.clear();   (fc.pos ||[]).forEach(x => f.posNew.add(x)); }
    if (f.channel)  { f.channel.clear();  (fc.ch  ||[]).forEach(x => f.channel.add(x)); }
    if (f.playlist) { f.playlist.clear(); (fc.pl  ||[]).forEach(x => f.playlist.add(x)); }
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
  const [col] = view.columns.splice(i, 1);
  view.columns.splice(j, 0, col);
  _save();
  document.getElementById('org-col-menu')?.remove();
  window._cvRerenderCur();
  setTimeout(() => window.toggleOrgColMenu?.(), 50);
};

// 標準の列ボタンメニューにカスタム列セクションを提供するフック
window._cvGetColMenuSection = function() {
  const view = _views.find(v => v.id === _curId);
  if (!view || !view.columns?.length) return '';
  const cols = view.columns;
  return cols.map((col, i) => `
    <div style="display:flex;align-items:center;gap:4px;padding:2px 0">
      <button onclick="window.cvMoveCol('${col.id}',-1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===0?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===0?'disabled':''}>▲</button>
      <button onclick="window.cvMoveCol('${col.id}',1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===cols.length-1?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===cols.length-1?'disabled':''}>▼</button>
      <span style="font-size:12px;flex:1">${_esc(col.label)}</span>
    </div>`).join('');
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
  window._cvVideoIds = null;
  window._cvAfterRender = null;
  document.querySelectorAll('#orgTheadRow .cv-custom-th').forEach(el => el.remove());
  const toolbar = document.getElementById('cv-toolbar');
  if (toolbar) toolbar.style.display = 'none';
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
  _renderViewBar();
};

})();
