// ═══ WAZA KIMURA — フィルターオーバーレイ & サイドバー ═══

// ── サイドバー開閉 ──
export function toggleSidebar() {
  const shell = document.getElementById('appShell');
  const btn   = document.getElementById('sidebar-toggle-btn');
  if (!shell || !btn) return;
  const collapsed = shell.classList.toggle('sidebar-collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
  btn.style.left  = collapsed ? '0' : '220px';
}

export function syncSidebarChipStates() {
  const filters = window.filters || {};
  ['未着手','練習中','マスター'].forEach(v => {
    const el  = document.getElementById('fs-stat-' + v);  if (el)  el.classList.toggle('active', filters.status?.has(v));
    const el2 = document.getElementById('fov-stat-' + v); if (el2) el2.classList.toggle('active', filters.status?.has(v));
  });
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el  = document.getElementById('fs-prio-' + v);  if (el)  el.classList.toggle('active', filters.prio?.has(v));
    const el2 = document.getElementById('fov-prio-' + v); if (el2) el2.classList.toggle('active', filters.prio?.has(v));
  });
}

// ── フィルターオーバーレイ開閉 ──
export function openFilterOverlay() {
  const ov = document.getElementById('filter-overlay');
  if (!ov) return;
  ov.classList.add('show');
  document.body.style.overflow = 'hidden';
  syncFilterOvRows();
  try { window.renderFilterPresets?.(); } catch(e) {}
}
export function toggleFilterOverlay() { openFilterOverlay(); }

export function closeFilterOverlay() {
  const ov = document.getElementById('filter-overlay');
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

export function syncFilterOvRows() {
  const filters = window.filters || {};
  // T/B
  window.buildSrow?.('fov-srow-tb', window.TB_TAGS, 'tb', false);
  // Action
  window.buildSrow?.('fov-srow-ac', window.AC_TAGS, 'action', true);
  // Position
  (function() {
    const row = document.getElementById('fov-srow-pos'); if (!row) return;
    row.innerHTML = '';
    row.appendChild(mkChip('すべて', filters.position?.size === 0, function() { filters.position?.clear(); syncFilterOvRows(); window.AF?.(); }));
    [...(filters.position||[])].forEach(function(p) {
      const el = document.createElement('div'); el.className = 'chip active'; el.style.flexShrink = '0';
      el.textContent = p + ' ×'; el.onclick = function() { filters.position?.delete(p); syncFilterOvRows(); window.AF?.(); }; row.appendChild(el);
    });
    const btn = document.createElement('div'); btn.className = 'chip'; btn.style.cssText = 'border-style:dashed;flex-shrink:0';
    btn.textContent = '＋ ポジションを選ぶ'; btn.onclick = function() { closeFilterOverlay(); window.openPos?.(); }; row.appendChild(btn);
  })();
  // Playlist
  (function() {
    const row = document.getElementById('fov-srow-pl'); if (!row) return;
    row.innerHTML = '';
    row.appendChild(mkChip('すべて', filters.playlist?.size === 0, function() { filters.playlist?.clear(); syncFilterOvRows(); window.AF?.(); }));
    [...(filters.playlist||[])].forEach(function(p) {
      const el = document.createElement('div'); el.className = 'chip active'; el.style.flexShrink = '0';
      el.textContent = p + ' ×'; el.onclick = function() { filters.playlist?.delete(p); syncFilterOvRows(); window.AF?.(); }; row.appendChild(el);
    });
    const btn = document.createElement('div'); btn.className = 'chip'; btn.style.cssText = 'border-style:dashed;flex-shrink:0';
    btn.textContent = '＋ プレイリストを選ぶ'; btn.onclick = function() { closeFilterOverlay(); window.openPL?.(); }; row.appendChild(btn);
  })();
  // Technique
  (function() {
    const row = document.getElementById('fov-srow-tech'); if (!row) return;
    row.innerHTML = '';
    row.appendChild(mkChip('すべて', filters.tech?.size === 0, function() { filters.tech?.clear(); syncFilterOvRows(); window.AF?.(); }));
    [...(filters.tech||[])].forEach(function(t) {
      const el = document.createElement('div'); el.className = 'chip active'; el.style.flexShrink = '0';
      el.textContent = t + ' ×'; el.onclick = function() { filters.tech?.delete(t); syncFilterOvRows(); window.AF?.(); }; row.appendChild(el);
    });
    const btn = document.createElement('div'); btn.className = 'chip'; btn.style.cssText = 'border-style:dashed;flex-shrink:0';
    btn.textContent = '＋ テクニックを選ぶ'; btn.onclick = function() { closeFilterOverlay(); window.openTF?.(); }; row.appendChild(btn);
  })();
  // Channel
  (function() {
    const row = document.getElementById('fov-srow-ch'); if (!row) return;
    row.innerHTML = '';
    row.appendChild(mkChip('すべて', filters.channel?.size === 0, function() { filters.channel?.clear(); syncFilterOvRows(); window.AF?.(); }));
    [...(filters.channel||[])].forEach(function(ch) {
      const el = document.createElement('div'); el.className = 'chip active'; el.style.flexShrink = '0';
      el.textContent = ch + ' ×'; el.onclick = function() { filters.channel?.delete(ch); syncFilterOvRows(); window.AF?.(); }; row.appendChild(el);
    });
    const btn = document.createElement('div'); btn.className = 'chip'; btn.style.cssText = 'border-style:dashed;flex-shrink:0';
    btn.textContent = '＋ チャンネルを選ぶ'; btn.onclick = function() { closeFilterOverlay(); window.openChPicker?.(); }; row.appendChild(btn);
  })();
  // Status / Fav 同期
  ['fov-stat-未着手','fov-stat-練習中','fov-stat-マスター'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', filters.status?.has(id.replace('fov-stat-','')));
  });
  ['fov-prio-今すぐ','fov-prio-そのうち','fov-prio-保留'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', filters.prio?.has(id.replace('fov-prio-','')));
  });
  const favEl = document.getElementById('fov-chip-fav');     if (favEl) favEl.classList.toggle('active', window.favOnly);
  const unwEl = document.getElementById('fov-chip-unw');     if (unwEl) unwEl.classList.toggle('active', window.unwOnly);
  const watEl = document.getElementById('fov-chip-watched'); if (watEl) watEl.classList.toggle('active', window.watchedOnly);
}

export function countForFilter(key, val) {
  try {
    const vids = window.videos || [];
    if (key === 'tb')       return vids.filter(v => !v.archived && (v.tb||[]).includes(val)).length;
    if (key === 'action')   return vids.filter(v => !v.archived && (v.ac||[]).includes(val)).length;
    if (key === 'position') return vids.filter(v => !v.archived && (v.pos||[]).includes(val)).length;
    if (key === 'tech')     return vids.filter(v => !v.archived && (v.tech||[]).includes(val)).length;
    if (key === 'playlist') return vids.filter(v => !v.archived && v.pl === val).length;
    if (key === 'channel')  return vids.filter(v => !v.archived && v.ch === val).length;
    if (key === 'status')   return vids.filter(v => !v.archived && v.status === val).length;
    if (key === 'prio')     return vids.filter(v => !v.archived && v.prio === val).length;
  } catch(e) { return 0; }
  return 0;
}

export function buildFovRows() {
  const vids = window.videos || [];
  buildFovHscroll('fov-srow-tb', window.TB_TAGS||[], 'tb', 'fov-all-tb');
  buildFovHscroll('fov-srow-ac', window.AC_TAGS||[], 'action', 'fov-all-ac');
  buildFovPickerRow('fov-srow-pos',  'position', 'fov-all-pos', () => {
    const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
    return [...new Set([...POS_BASE, ...vids.flatMap(v => v.pos||[])])].sort();
  });
  buildFovPickerRow('fov-srow-pl',   'playlist', 'fov-all-pl',  () => [...new Set(vids.map(v => v.pl).filter(Boolean))].sort());
  buildFovPickerRow('fov-srow-tech', 'tech',     'fov-all-tech',() => [...new Set(vids.flatMap(v => v.tech||[]))].sort());
  buildFovPickerRow('fov-srow-ch',   'channel',  'fov-all-ch',  () => [...new Set(vids.map(v => v.ch).filter(Boolean))].sort());
}

export function buildFovHscroll(rowId, tags, filterKey, allChipId) {
  const row     = document.getElementById(rowId); if (!row) return;
  const allChip = document.getElementById(allChipId);
  const filters = window.filters || {};
  const vids    = window.videos  || [];
  row.innerHTML = '';
  tags.forEach(tag => {
    const cnt = filterKey === 'tb'
      ? vids.filter(v => !v.archived && (v.tb||[]).includes(tag)).length
      : vids.filter(v => !v.archived && (v.ac||[]).includes(tag)).length;
    const el = document.createElement('div');
    el.className = 'chip' + (filters[filterKey]?.has(tag) ? ' active' : '');
    el.style.flexShrink = '0';
    el.textContent = tag + (cnt ? ' ' + cnt : '');
    el.onclick = () => {
      filters[filterKey]?.has(tag) ? filters[filterKey].delete(tag) : filters[filterKey]?.add(tag);
      el.classList.toggle('active', filters[filterKey]?.has(tag));
      if (allChip) allChip.classList.toggle('inactive', filters[filterKey]?.size > 0);
      window.AF?.();
    };
    row.appendChild(el);
  });
  if (allChip) allChip.classList.toggle('inactive', filters[filterKey]?.size > 0);
}

export function buildFovPickerRow(rowId, filterKey, allChipId, getAll) {
  const row     = document.getElementById(rowId); if (!row) return;
  const allChip = document.getElementById(allChipId);
  const filters = window.filters || {};
  const vids    = window.videos  || [];
  row.innerHTML = '';
  const allItems = getAll();
  allItems.forEach(val => {
    const cnt = filterKey === 'playlist' ? vids.filter(v => !v.archived && v.pl === val).length
              : filterKey === 'channel'  ? vids.filter(v => !v.archived && v.ch === val).length
              : filterKey === 'tech'     ? vids.filter(v => !v.archived && (v.tech||[]).includes(val)).length
              :                            vids.filter(v => !v.archived && (v.pos||[]).includes(val)).length;
    const el = document.createElement('div');
    el.className = 'chip' + (filters[filterKey]?.has(val) ? ' active' : '');
    el.style.flexShrink = '0';
    el.textContent = val + (cnt ? ' ' + cnt : '');
    el.onclick = () => {
      filters[filterKey]?.has(val) ? filters[filterKey].delete(val) : filters[filterKey]?.add(val);
      el.classList.toggle('active', filters[filterKey]?.has(val));
      if (allChip) allChip.classList.toggle('inactive', filters[filterKey]?.size > 0);
      window.AF?.();
    };
    row.appendChild(el);
  });
  if (allChip) allChip.classList.toggle('inactive', filters[filterKey]?.size > 0);
}

export function syncFovChips() {
  const filters = window.filters || {};
  const favChip = document.getElementById('fov-chip-fav');     if (favChip) favChip.classList.toggle('active', window.favOnly);
  const unwChip = document.getElementById('fov-chip-unw');     if (unwChip) unwChip.classList.toggle('active', window.unwOnly);
  const watChip = document.getElementById('fov-chip-watched'); if (watChip) watChip.classList.toggle('active', window.watchedOnly);
  ['未着手','練習中','マスター'].forEach(v => {
    const el = document.getElementById('fov-stat-' + v); if (el) el.classList.toggle('active', filters.status?.has(v));
  });
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el = document.getElementById('fov-prio-' + v); if (el) el.classList.toggle('active', filters.prio?.has(v));
  });
}

export function clearFovField(fieldKey) {
  const filters  = window.filters || {};
  const keyMap   = {tb:'tb', action:'action', pos:'position', playlist:'playlist', tech:'tech', ch:'channel'};
  const allMap   = {tb:'fov-all-tb', action:'fov-all-ac', pos:'fov-all-pos', playlist:'fov-all-pl', tech:'fov-all-tech', ch:'fov-all-ch'};
  const rowMap   = {tb:'fov-srow-tb', action:'fov-srow-ac', pos:'fov-srow-pos', playlist:'fov-srow-pl', tech:'fov-srow-tech', ch:'fov-srow-ch'};
  const fk = keyMap[fieldKey];
  if (fk && filters[fk]) filters[fk].clear();
  const allChip = document.getElementById(allMap[fieldKey]); if (allChip) allChip.classList.remove('inactive');
  const row = document.getElementById(rowMap[fieldKey]); if (row) row.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
  window.AF?.();
}

// ── フィルターピッカー（サイドバー：Position/Playlist/Technique/Channel）──
const FS_PICKER_FIELDS = {
  pos:  { label:'Position',  filterKey:'position', getAll: () => {
    const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
    return [...new Set([...POS_BASE, ...(window.videos||[]).flatMap(v => v.pos||[])])].sort();
  }},
  pl:   { label:'Playlist',  filterKey:'playlist', getAll: () => [...new Set((window.videos||[]).map(v => v.pl).filter(Boolean))].sort() },
  tech: { label:'Technique', filterKey:'tech',     getAll: () => [...new Set((window.videos||[]).flatMap(v => v.tech||[]))].sort() },
  ch:   { label:'Channel',   filterKey:'channel',  getAll: () => [...new Set((window.videos||[]).map(v => v.ch).filter(Boolean))].sort() },
};

export function toggleFsPicker(type) {
  const panel = document.getElementById('fs-picker-' + type); if (!panel) return;
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.fs-picker-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) { populateFsPicker(type); panel.classList.add('open'); }
}

export function populateFsPicker(type) {
  const panel = document.getElementById('fs-picker-' + type);
  const field = FS_PICKER_FIELDS[type];
  if (!panel || !field) return;
  const all     = field.getAll();
  const key     = field.filterKey;
  const filters = window.filters || {};
  const sel     = filters[key] || new Set();
  panel.innerHTML = all.map(v => {
    const isSel = sel.has(v);
    return `<span class="fs-picker-chip${isSel?' sel':''}" onmousedown="event.preventDefault();fsPick('${type}','${v.replace(/'/g,"\\'")}',this)">${v}</span>`;
  }).join('');
}

export function fsPick(type, val, el) {
  const field   = FS_PICKER_FIELDS[type]; if (!field) return;
  const key     = field.filterKey;
  const filters = window.filters || {};
  if (!filters[key]) filters[key] = new Set();
  const isSel = filters[key].has(val);
  if (isSel) { filters[key].delete(val); el.classList.remove('sel'); }
  else        { filters[key].add(val);    el.classList.add('sel'); }
  const allChip = document.getElementById('fs-all-' + type);
  if (allChip) allChip.classList.toggle('active', filters[key].size === 0);
  renderFsSelTags(type);
  window.AF?.();
}

export function renderFsSelTags(type) {
  const field   = FS_PICKER_FIELDS[type]; if (!field) return;
  const key     = field.filterKey;
  const filters = window.filters || {};
  const container = document.getElementById('fs-sel-' + type); if (!container) return;
  const sel = filters[key] || new Set();
  container.innerHTML = [...sel].map(v =>
    `<span class="fs-sel-tag" onclick="fsPick('${type}','${v.replace(/'/g,"\\'")}',document.querySelector('.fs-picker-chip[data-val=\\"${v.replace(/"/g,'&quot;')}\\"]')||{classList:{has:()=>true,remove:()=>{},add:()=>{}},dataset:{}})">${v} ×</span>`
  ).join('');
}

export function clearFsField(fieldKey) {
  const filters    = window.filters || {};
  const filterKeys = { tb:'tb', action:'action', pos:'position', playlist:'playlist', tech:'tech', ch:'channel' };
  const pickerTypes = { tb:null, action:null, pos:'pos', playlist:'pl', tech:'tech', ch:'ch' };
  if (filters[filterKeys[fieldKey]]) filters[filterKeys[fieldKey]].clear();
  document.querySelectorAll(`[onclick*="togF('${fieldKey}"]`).forEach(el => el.classList.remove('active'));
  const allChip = document.getElementById('fs-all-' + fieldKey); if (allChip) allChip.classList.add('active');
  const pType = pickerTypes[fieldKey];
  if (pType) { renderFsSelTags(pType); populateFsPicker(pType); }
  window.AF?.();
}

// ピッカー外クリックで閉じる
document.addEventListener('mousedown', function(e) {
  if (!e.target.closest('.fs-picker-panel') && !e.target.closest('[id$="-picker-btn"]')) {
    document.querySelectorAll('.fs-picker-panel.open').forEach(p => p.classList.remove('open'));
  }
}, true);

// ── 保存した検索条件 ──
let savedSearches = JSON.parse(localStorage.getItem('wk-saved-searches') || '[]');

export function saveCurrentSearch() {
  const filters = window.filters || {};
  const state = {
    favOnly: window.favOnly, unwOnly: window.unwOnly, watchedOnly: window.watchedOnly,
    filters: Object.fromEntries(Object.entries(filters).map(([k,v]) => [k, [...v]])),
    query: (document.getElementById('si')||{}).value || (document.getElementById('si-lib-pc')||{}).value || ''
  };
  const hasFilter = state.favOnly || state.unwOnly || state.watchedOnly ||
    Object.values(state.filters).some(a => a.length > 0) || state.query;
  if (!hasFilter) { window.toast('フィルターが設定されていません'); return; }
  const name = prompt('検索条件の名前を入力してください:');
  if (!name) return;
  savedSearches.unshift({ name, state, createdAt: Date.now() });
  if (savedSearches.length > 20) savedSearches = savedSearches.slice(0, 20);
  localStorage.setItem('wk-saved-searches', JSON.stringify(savedSearches));
  renderSavedSearches();
  window.toast('💾 「' + name + '」を保存しました');
}

export function applySavedSearch(idx) {
  const ss = savedSearches[idx]; if (!ss) return;
  window.clearAll?.();
  const s = ss.state;
  window.favOnly = s.favOnly; window.unwOnly = s.unwOnly; window.watchedOnly = s.watchedOnly || false;
  const filters = window.filters || {};
  Object.entries(s.filters||{}).forEach(([k,v]) => { filters[k] = new Set(v); });
  const si   = document.getElementById('si');        if (si)   si.value   = s.query || '';
  const siPc = document.getElementById('si-lib-pc'); if (siPc) siPc.value = s.query || '';
  window.AF?.(); renderSavedSearches();
  window.toast('🔍 「' + ss.name + '」を適用しました');
}

export function deleteSavedSearch(idx, e) {
  e.stopPropagation();
  savedSearches.splice(idx, 1);
  localStorage.setItem('wk-saved-searches', JSON.stringify(savedSearches));
  renderSavedSearches();
}

export function renderSavedSearches() {
  const list = document.getElementById('fs-saved-list'); if (!list) return;
  if (!savedSearches.length) {
    list.innerHTML = '<div style="font-size:10px;color:var(--text3)">保存した検索条件はありません</div>';
    return;
  }
  list.innerHTML = savedSearches.map((ss, i) => `
    <div onclick="applySavedSearch(${i})" style="display:flex;align-items:center;justify-content:space-between;
      padding:5px 8px;border-radius:6px;cursor:pointer;background:var(--surface2);font-size:11px;font-weight:500">
      <span>${ss.name}</span>
      <span onclick="deleteSavedSearch(${i},event)" style="color:var(--text3);font-size:10px;padding:2px 4px">✕</span>
    </div>
  `).join('');
}

setTimeout(renderSavedSearches, 500);

// ── アコーディオン ──
export function toggleAcc(key) {
  const body  = document.getElementById('fs-acc-body-' + key);
  const arrow = document.getElementById('fs-acc-arr-' + key);
  if (!body) return;
  const open = body.style.display === 'none' || body.style.display === '';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', open);
  if (open) {
    if (key === 'pl')    renderAccChips('pl');
    if (key === 'ch')    renderAccChips('ch');
    if (key === 'saved') window.renderFilterPresets?.();
  }
}

export function renderAccChips(type) {
  const container = document.getElementById('fs-acc-' + type + '-chips'); if (!container) return;
  const searchEl  = document.getElementById('acc-' + type + '-search');
  const q         = searchEl ? searchEl.value.toLowerCase() : '';
  const vids      = window.videos || [];
  const filters   = window.filters || {};

  let items, filterKey, countFn;
  if (type === 'pl') {
    items = [...new Set(vids.map(v => v.pl).filter(Boolean))].sort();
    filterKey = 'playlist';
    countFn = v => vids.filter(x => !x.archived && x.pl === v).length;
  } else {
    items = [...new Set(vids.map(v => v.ch).filter(Boolean))].sort();
    filterKey = 'channel';
    countFn = v => vids.filter(x => !x.archived && x.ch === v).length;
  }

  const filtered = q ? items.filter(v => v.toLowerCase().includes(q)) : items;
  container.innerHTML = '';
  if (!filtered.length) {
    container.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:4px 0">項目がありません</div>';
    return;
  }

  filtered.forEach(val => {
    const cnt   = countFn(val);
    const isSel = (filters[filterKey] || new Set()).has(val);
    const el    = document.createElement('div');
    el.className = 'chip' + (isSel ? ' active' : '');
    el.style.cssText = 'font-size:10.5px;cursor:pointer;';
    el.textContent = val + (cnt ? ' ' + cnt : '');
    el.onclick = () => {
      if (!filters[filterKey]) filters[filterKey] = new Set();
      isSel ? filters[filterKey].delete(val) : filters[filterKey].add(val);
      renderAccChips(type); window.AF?.();
    };
    container.appendChild(el);
  });
}

export function filterAccChips(type) { renderAccChips(type); }

export function showFsBulkBtn(show) {
  // 常時表示のため何もしない
}

// ── mkChip ユーティリティ（filter-overlay内で使用）──
export function mkChip(label, isActive, onClick) {
  const el = document.createElement('div');
  el.className = 'chip' + (isActive ? ' active' : '');
  el.style.flexShrink = '0';
  el.textContent = label;
  el.onclick = onClick;
  return el;
}
