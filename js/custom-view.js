// ═══ WAZA KIMURA — カスタムビュー v52.266 ═══
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
let _editingViewId = null; // 条件再編集中のビューID
let _cvSelectedIds = new Set(); // static選択中の動画ID
let cvColOrder = [...CV_COL_DEFAULT];
let cvColVisibility = {tb:true,action:true,position:true,technique:true,counter:false,status:true,channel:true,playlist:true,memo:true,addedAt:true,fav:true,next:true,duration:true};
let _nextColId = 100;
let _selectedTplId = CV_TEMPLATES[0].id;

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    localStorage.setItem('wk_cv_col_prefs', JSON.stringify({ order: cvColOrder, vis: cvColVisibility }));
  } catch(e) {}
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
  // lib-view-bar の card/org ボタンを非アクティブに
  document.getElementById('lvt-card')?.classList.remove('lvt-active');
  document.getElementById('lvt-org')?.classList.remove('lvt-active');
  // card/org host を隠す
  const cardHost = document.getElementById('lib-card-host');
  const orgHost  = document.getElementById('lib-org-host');
  if (cardHost) cardHost.style.display = 'none';
  if (orgHost)  orgHost.style.display  = 'none';
  // cv-host を表示
  const cvHost = document.getElementById('cv-host');
  if (cvHost) cvHost.style.display = '';
  // actionbar 隠す
  document.getElementById('library-actionbar')?.style && (document.getElementById('library-actionbar').style.display = 'none');
  document.getElementById('organize-actionbar')?.style && (document.getElementById('organize-actionbar').style.display = 'none');
  _renderViewBar();
  const view = _views.find(v => v.id === id);
  if (view) _renderTable(view);
}

// ── テーブル描画 ──
function _renderTable(view) {
  const thead = document.getElementById('cv-table-head');
  const tbody = document.getElementById('cv-table-body');
  const toolbar = document.getElementById('cv-toolbar');
  if (!thead || !tbody) return;

  // ツールバー
  if (toolbar) {
    toolbar.style.display = '';
    const isDynamic = view.saveMode === 'dynamic';
    const modeLabel = isDynamic ? '🔄 動的' : '📌 個別選択';
    const condSummary = isDynamic && view.filterConditions ? _condSummary(view.filterConditions) : '';
    toolbar.innerHTML = `
      <button onclick="window.cvToggleColMenu(event)" title="表示する列を選択" class="cv-col-vis-btn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="vertical-align:-1px;margin-right:3px"><rect x="0" y="1" width="3" height="11" rx="1" fill="currentColor"/><rect x="5" y="1" width="3" height="11" rx="1" fill="currentColor"/><rect x="10" y="1" width="3" height="11" rx="1" fill="currentColor"/></svg>列
      </button>
      <span style="flex:1"></span>
      <span style="font-size:12px;font-weight:700;color:var(--text)">${_esc(view.label)}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:9px;background:var(--surface3);color:var(--text3)">${modeLabel}</span>
      ${condSummary ? `<span style="font-size:11px;color:var(--text3)">${_esc(condSummary)}</span>` : ''}
      <button class="cv-conditions-btn" onclick="window.cvOpenConditionEditor('${view.id}')">条件 ✎</button>
    `;
  }

  // ヘッダー
  let hh = '<tr>';
  hh += '<th style="width:36px;min-width:36px;position:sticky;left:0;z-index:11;background:var(--surface)"><div class="th-inner"></div></th>';
  hh += '<th style="width:56px;min-width:56px;position:sticky;left:36px;z-index:11;background:var(--surface)"><div class="th-inner"></div></th>';
  hh += '<th style="min-width:200px;max-width:280px;position:sticky;left:92px;z-index:11;background:var(--surface)"><div class="th-inner">タイトル</div></th>';
  view.columns.forEach(col => {
    hh += `<th data-col-id="${col.id}"><div class="th-inner" style="font-size:11px">${_esc(col.label)}</div></th>`;
  });
  cvColOrder.filter(k => cvColVisibility[k] !== false).forEach(k => {
    hh += `<th><div class="th-inner" style="font-size:10px;color:var(--text3)">${_esc(ORG_COL_LABELS[k])}</div></th>`;
  });
  hh += `<th><div class="th-inner"><button onclick="window.cvOpenAddCol('${view.id}')" style="font-size:11px;padding:3px 8px;border-radius:6px;border:1px dashed var(--border2);background:none;color:var(--text3);cursor:pointer;white-space:nowrap">＋ 列を追加</button></div></th>`;
  hh += '</tr>';
  thead.innerHTML = hh;

  // 動画リスト
  tbody.innerHTML = '';
  const videos = _getViewVideos(view);

  if (!videos.length) {
    tbody.innerHTML = `<tr><td colspan="20" style="padding:40px;text-align:center;color:var(--text3);font-size:13px">
      動画が選択されていません<br><span style="font-size:11px;display:block;margin-top:6px">条件ボタンで動画を追加してください</span>
    </td></tr>`;
    return;
  }

  videos.forEach(v => {
    if (!view.rowData[v.id]) view.rowData[v.id] = {};
    const rd = view.rowData[v.id];
    const tr = document.createElement('tr');
    tr.dataset.vid = v.id;

    // サムネイル
    const ytId = v.ytId || ((v.pt||'youtube') === 'youtube' ? v.id : null);
    const gdId = (v.pt === 'gdrive' || (v.id||'').startsWith('gd-')) ? (v.id||'').replace(/^gd-/,'') : null;
    let thumbHtml = '<span style="font-size:14px">▶</span>';
    if (ytId) thumbHtml = `<img src="https://i.ytimg.com/vi/${ytId}/default.jpg" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:3px" onerror="this.style.display='none'">`;
    else if (gdId) thumbHtml = `<img src="https://drive.google.com/thumbnail?id=${gdId}&sz=w80" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:3px" onerror="this.style.display='none'">`;

    tr.innerHTML = `
      <td style="position:sticky;left:0;background:var(--bg);z-index:5"><div style="display:flex;justify-content:center"><input type="checkbox" class="row-chk" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer"></div></td>
      <td style="position:sticky;left:36px;background:var(--bg);z-index:5"><div style="width:40px;height:28px;border-radius:4px;background:var(--surface3);display:flex;align-items:center;justify-content:center;overflow:hidden">${thumbHtml}</div></td>
      <td style="position:sticky;left:92px;background:var(--bg);z-index:5"><div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px" title="${_esc(v.title||'')}">${_esc(v.title||'')}</div></td>
    `;

    // カスタム列
    view.columns.forEach(col => {
      const td = document.createElement('td');
      td.dataset.vid = v.id;
      td.dataset.colId = col.id;
      _renderCell(td, col, rd[col.id], view);
      tr.appendChild(td);
    });

    // 標準列
    cvColOrder.filter(k => cvColVisibility[k] !== false).forEach(k => {
      const td = document.createElement('td');
      td.style.fontSize = '11px';
      td.innerHTML = _stdCell(v, k);
      tr.appendChild(td);
    });

    // 追加列プレースホルダー
    tr.appendChild(document.createElement('td'));
    tbody.appendChild(tr);
  });
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
  td.style.padding = '4px 8px';
  switch(col.type) {
    case 'checkbox':
      td.innerHTML = `<input type="checkbox" ${val ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer" onchange="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',this.checked)">`;
      break;
    case 'stars': {
      const n = parseInt(val)||0;
      td.innerHTML = [1,2,3,4,5].map(i => `<span onclick="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',${i===n?0:i})" style="cursor:pointer;font-size:15px;color:${i<=n?'#f59e0b':'var(--text3)'}">${i<=n?'★':'☆'}</span>`).join('');
      break;
    }
    case 'progress': {
      const pct = Math.max(0,Math.min(100,parseInt(val)||0));
      td.innerHTML = `<div style="display:flex;align-items:center;gap:6px;min-width:100px">
        <div style="flex:1;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px"></div>
        </div>
        <span style="font-size:10px;color:var(--text3);width:28px;text-align:right">${pct}%</span>
        <input type="range" min="0" max="100" value="${pct}" style="position:absolute;opacity:0;width:80px;cursor:pointer" oninput="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',+this.value);window._cvRerender('${view.id}')">
      </div>`;
      break;
    }
    case 'number': {
      const unit = col.unit ? ` <span style="font-size:10px;color:var(--text3)">${_esc(col.unit)}</span>` : '';
      td.innerHTML = `<span contenteditable="true" style="display:inline-block;min-width:40px;padding:2px 4px;border-radius:4px;border:1px solid transparent;font-size:12px" onblur="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',+this.textContent.replace(/[^0-9.]/g,''))" onfocus="this.parentNode.querySelector('span:last-child') && (this.style.borderColor='var(--accent)')" onblur="this.style.borderColor='transparent';window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',+this.textContent.replace(/[^0-9.]/g,''))">${val||0}</span>${unit}`;
      break;
    }
    case 'text':
      td.innerHTML = `<span contenteditable="true" style="display:inline-block;min-width:80px;max-width:200px;padding:2px 4px;border-radius:4px;border:1px solid transparent;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onblur="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',this.textContent.trim());this.style.borderColor='transparent'" onfocus="this.style.borderColor='var(--accent)'">${_esc(val||'')}</span>`;
      break;
    case 'select': {
      const opts = col.options || [];
      const cur = val || '';
      td.innerHTML = `<select style="font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:inherit;cursor:pointer" onchange="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',this.value)">
        <option value="">—</option>
        ${opts.map(o => `<option value="${_esc(o)}" ${o===cur?'selected':''}>${_esc(o)}</option>`).join('')}
      </select>`;
      break;
    }
    case 'date':
      td.innerHTML = `<input type="date" value="${_esc(val||'')}" style="font-size:11px;padding:2px 6px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:inherit;cursor:pointer" onchange="window._cvSetCell('${view.id}','${td.dataset.vid}','${col.id}',this.value)">`;
      break;
    case 'tracker': {
      const days = []; const today = new Date(); const entries = Array.isArray(val) ? val : [];
      for (let i = -(col.pastDays||4); i <= (col.futureDays||1); i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0,10);
        const done = entries.includes(ds);
        days.push(`<span onclick="window._cvToggleTracker('${view.id}','${td.dataset.vid}','${col.id}','${ds}')" title="${ds}" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:10px;background:${done?'var(--accent)':'var(--surface3)'};color:${done?'var(--on-accent)':'var(--text3)'};">${i===0?'●':'·'}</span>`);
      }
      td.innerHTML = `<div style="display:flex;gap:2px">${days.join('')}</div>`;
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
  _renderTable(view);
};

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
  // uni-popup を cv モードで開く（viewId = '__new__' で新規作成シグナル）
  _cvSelectedIds = new Set();
  window.uniOpenForCv('__new__');
};

// Unified Filter からのフック
window._cvGetAddedIds = function(viewId) {
  return _cvSelectedIds;
};
window._cvVideoClick = function(videoId) {
  if (_cvSelectedIds.has(videoId)) _cvSelectedIds.delete(videoId);
  else _cvSelectedIds.add(videoId);
};
window._cvApply = function() {
  // static 保存（適用ボタン）
  if (_editingViewId) {
    const view = _views.find(v => v.id === _editingViewId);
    if (view) { view.saveMode = 'static'; view.videoIds = [..._cvSelectedIds]; view.filterConditions = null; _save(); _renderTable(view); _renderViewBar(); }
    _editingViewId = null;
  } else {
    _goStep3(null, [..._cvSelectedIds], 'static');
  }
};
window._cvSaveDynamic = function() {
  // dynamic 保存（💾 ボタン）
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
  const cols = tpl.columns.map((c, i) => ({ id: 'col' + (++_nextColId), ...c }));
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
  // 既存のdynamic条件をフィルターに反映
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
    const cvHost = document.getElementById('cv-host');
    if (cvHost) cvHost.style.display = 'none';
    const toolbar = document.getElementById('cv-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    window._libView?.('card');
  }
  _renderViewBar();
};

// ── 列を追加 ──
window.cvOpenAddCol = function(viewId) {
  window.toast?.('列追加機能は近日対応予定です');
};

// ── III列メニュー ──
window.cvToggleColMenu = function(e) {
  e.stopPropagation();
  let menu = document.getElementById('cv-col-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.id = 'cv-col-menu';
  menu.style.cssText = 'position:fixed;z-index:9999;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:200px';
  const btn = e.currentTarget;
  const r = btn.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.innerHTML = '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">表示する列（↑↓で並替え）</div>' +
    cvColOrder.map((col, i) => `
      <div style="display:flex;align-items:center;gap:4px;padding:2px 0">
        <button onclick="window.cvMoveCol('${col}',-1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===0?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===0?'disabled':''}>▲</button>
        <button onclick="window.cvMoveCol('${col}',1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===cvColOrder.length-1?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===cvColOrder.length-1?'disabled':''}>▼</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;flex:1">
          <input type="checkbox" ${cvColVisibility[col]!==false?'checked':''} onchange="cvColVisibility['${col}']=this.checked;_save();window._cvRerenderCur()" style="accent-color:var(--accent);width:14px;height:14px">
          ${_esc(ORG_COL_LABELS[col]||col)}
        </label>
      </div>`).join('');
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function h(ev){
    if (!menu.contains(ev.target) && !ev.target.closest('[onclick*="cvToggleColMenu"]')) {
      menu.remove(); document.removeEventListener('click', h);
    }
  }), 100);
};
window.cvMoveCol = function(col, dir) {
  const i = cvColOrder.indexOf(col);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= cvColOrder.length) return;
  cvColOrder.splice(i, 1); cvColOrder.splice(j, 0, col);
  _save();
  const menu = document.getElementById('cv-col-menu'); if (menu) menu.remove();
  window._cvRerenderCur();
  setTimeout(() => { const btn = document.querySelector('[onclick*="cvToggleColMenu"]'); if (btn) window.cvToggleColMenu({currentTarget:btn, stopPropagation:()=>{}}); }, 50);
};
window._cvRerenderCur = function() {
  const view = _views.find(v => v.id === _curId); if (view) _renderTable(view);
};

// ── _libView フック: カスタムビュー表示中に card/org 切替時に cv-host を隠す ──
const _origLibView = window._libView;
window._libView = function(mode) {
  _curId = null;
  const cvHost = document.getElementById('cv-host');
  if (cvHost) cvHost.style.display = 'none';
  const toolbar = document.getElementById('cv-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  _renderViewBar();
  _origLibView?.(mode);
};

// ── 初期化 ──
function _init() {
  _load();
  _renderViewBar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
else _init();

// グローバル公開
window._cvSave = _save;

})();
