// ═══ WAZA KIMURA — フィルターオーバーレイ & サイドバー ═══

// ── ドロップダウン外クリックで全DD閉じる（フィルター・VPanel・GDrive共通）──
document.addEventListener('click', function(e) {
  if (e.target.closest('.vp-dd') || e.target.closest('.vp-dd-trigger')) return;
  document.querySelectorAll('.vp-dd').forEach(dd => { dd.style.display = 'none'; });
});

// ── ユーティリティ ──
export function mkChip(label, isActive, onClick) {
  const el = document.createElement('div');
  el.className = 'chip' + (isActive ? ' active' : '');
  el.style.flexShrink = '0';
  el.textContent = label;
  el.onclick = onClick;
  return el;
}

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
  const f = window.filters || {};
  ['未着手','練習中','マスター'].forEach(v => {
    const el  = document.getElementById('fs-stat-' + v);  if (el)  el.classList.toggle('active', f.status?.has(v));
    const el2 = document.getElementById('fov-stat-' + v); if (el2) el2.classList.toggle('active', f.status?.has(v));
  });
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el  = document.getElementById('fs-prio-' + v);  if (el)  el.classList.toggle('active', f.prio?.has(v));
    const el2 = document.getElementById('fov-prio-' + v); if (el2) el2.classList.toggle('active', f.prio?.has(v));
  });
}

// ── フィルターオーバーレイ開閉 ──
export function openFilterOverlay() {
  const ov = document.getElementById('filter-overlay');
  if (!ov) return;
  ov.classList.add('show');
  document.body.style.overflow = 'hidden';
  try { buildFovRows(); } catch(e) {}
  syncFilterOvRows();
  try { window.renderFilterPresets?.(); } catch(e) {}
}

export function toggleFilterOverlay() { openFilterOverlay(); }

export function closeFilterOverlay() {
  const ov = document.getElementById('filter-overlay');
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

// ── アルファベット/あいうえお グループ化ヘルパー ──
function _fovGetAlphaGroup(str) {
  if (!str) return '#';
  const c = str[0];
  const code = c.charCodeAt(0);
  if (code >= 0x3041 && code <= 0x3096) {
    const hGroups = [['あ','い','う','え','お'],['か','き','く','け','こ','が','ぎ','ぐ','げ','ご'],['さ','し','す','せ','そ','ざ','じ','ず','ぜ','ぞ'],['た','ち','つ','て','と','だ','ぢ','づ','で','ど'],['な','に','ぬ','ね','の'],['は','ひ','ふ','へ','ほ','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ'],['ま','み','む','め','も'],['や','ゆ','よ'],['ら','り','る','れ','ろ'],['わ','を','ん']];
    const labels = ['あ行','か行','さ行','た行','な行','は行','ま行','や行','ら行','わ行'];
    for (let i = 0; i < hGroups.length; i++) { if (hGroups[i].includes(c)) return labels[i]; }
  }
  if (code >= 0x30A1 && code <= 0x30F6) return _fovGetAlphaGroup(String.fromCharCode(code - 0x60));
  if (/[A-Za-z]/.test(c)) return c.toUpperCase();
  return c;
}

// ── コンテキスト判定（org vs main）──
function _getCtx(rowId) {
  const el = document.getElementById(rowId);
  const isOrg = el?.dataset.ctx === 'org' || rowId.startsWith('org-');
  return {
    f: isOrg ? (window.orgFilters||{}) : (window.filters||{}),
    af() { isOrg ? window.renderOrg?.() : window.AF?.(); }
  };
}

// ── フィルターDD ヘルパー ──
function _fovDdUpdateChips(rowId, filterKey) {
  const { f } = _getCtx(rowId);
  const chipsEl = document.getElementById(rowId + '-chips');
  if (!chipsEl) return;
  const selected = [...(f[filterKey]||[])];
  const allActive = !selected.length;
  let html = `<div class="chip${allActive?' active':''}" style="flex-shrink:0" onclick="fovFilterClear('${rowId}','${filterKey}')">すべて</div>`;
  selected.forEach(v => {
    html += `<div class="chip active" style="flex-shrink:0">${v} <span style="cursor:pointer;opacity:.7" onclick="fovDdRemove('${rowId}','${filterKey}','${v.replace(/'/g,"\\'")}')" >×</span></div>`;
  });
  chipsEl.innerHTML = html;
}

export function buildFovDdRow(rowId, filterKey, items, placeholder, isOrg=false) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.dataset.ctx = isOrg ? 'org' : 'main';
  row.innerHTML = `
    <div class="vp-dd-wrap" style="gap:5px">
      <div id="${rowId}-chips" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center"></div>
      <div class="vp-dd-trigger" onclick="fovDdOpen('${rowId}')">＋ 追加</div>
      <div class="vp-dd fov-dd" id="${rowId}-dd" style="display:none" data-filterkey="${filterKey}">
        <input class="vp-dd-search" placeholder="${placeholder||'検索...'}"
          oninput="fovDdFilter('${rowId}','${filterKey}',this.value)"
          onkeydown="if(event.key==='Escape'){document.getElementById('${rowId}-dd').style.display='none';}">
        <div class="vp-dd-list" id="${rowId}-ddlist"></div>
      </div>
    </div>`;
  _fovDdUpdateChips(rowId, filterKey);
  _fovDdRenderList(rowId, filterKey, items, '');
}

function _fovDdRenderList(rowId, filterKey, items, q) {
  const listEl = document.getElementById(rowId + '-ddlist');
  if (!listEl) return;
  const { f } = _getCtx(rowId);
  const ql = q.toLowerCase();
  const filtered = ql ? items.filter(v => v.toLowerCase().includes(ql)) : items;
  listEl.innerHTML = filtered.map(v => {
    const cnt = window.countContextual ? window.countContextual(filterKey, v) : 0;
    const sel = f[filterKey]?.has(v);
    return `<div class="vp-dd-item${sel?' selected':''}" onclick="fovDdToggleItem('${rowId}','${filterKey}','${v.replace(/'/g,"\\'")}',this)">${v}${cnt ? `<span class="vp-dd-cnt">${cnt}</span>` : ''}</div>`;
  }).join('');
}

// ── チャンネル/プレイリスト 最近みた+2サブタブ DD ──
export function buildFovPickerDdRow(rowId, filterKey, label, isOrg=false) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.dataset.ctx = isOrg ? 'org' : 'main';
  row.innerHTML = `
    <div class="vp-dd-wrap" style="gap:5px">
      <div id="${rowId}-chips" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center"></div>
      <div class="vp-dd-trigger" onclick="fovPickerDdOpen('${rowId}','${filterKey}')">＋ ${label}</div>
      <div class="vp-dd fov-dd" id="${rowId}-dd" style="display:none">
        <input class="vp-dd-search" placeholder="検索..."
          oninput="fovPickerDdFilter('${rowId}','${filterKey}',this.value)"
          onkeydown="if(event.key==='Escape'){document.getElementById('${rowId}-dd').style.display='none';}">
        <div class="vp-dd-list" id="${rowId}-ddlist"></div>
      </div>
    </div>`;
  _fovDdUpdateChips(rowId, filterKey);
  _fovPickerDdRenderList(rowId, filterKey, '');
}

function _fovPickerCountMap(filterKey) {
  const videos = window.videos || [];
  const countMap = {};
  videos.forEach(v => {
    const key = filterKey === 'channel' ? v.channel : v.pl;
    if (key) countMap[key] = (countMap[key]||0) + 1;
  });
  return countMap;
}

function _fovPickerDdRenderList(rowId, filterKey, q) {
  const listEl = document.getElementById(rowId + '-ddlist');
  if (!listEl) return;
  const { f } = _getCtx(rowId);
  const countMap = _fovPickerCountMap(filterKey);
  const allItems = Object.keys(countMap).sort((a,b) => a.localeCompare(b, 'ja'));

  const mkItem = (v) => {
    const sel = f[filterKey]?.has(v);
    return `<div class="vp-dd-item${sel?' selected':''}" onclick="fovPickerDdToggle('${rowId}','${filterKey}','${v.replace(/'/g,"\\'")}')">${v}<span class="vp-dd-cnt">${countMap[v]||0}本</span></div>`;
  };

  if (q.trim()) {
    const ql = q.toLowerCase();
    listEl.innerHTML = allItems.filter(v => v.toLowerCase().includes(ql)).map(mkItem).join('');
    return;
  }

  // 最近タブ（localStorage + 選択済みは常に含む）
  const recentList = _getRecentFilters(filterKey)
    .filter(v => (v in countMap) || f[filterKey]?.has(v)).slice(0, 15);
  const hasRecents = recentList.length > 0;
  const defTab     = hasRecents ? 'recent' : 'alpha';
  const recentPanelHTML = hasRecents
    ? recentList.map(mkItem).join('')
    : `<div style="font-size:10px;color:var(--text3);padding:14px 12px;text-align:center">最近選んだものはありません</div>`;

  // Alpha tab
  const groups = {};
  allItems.forEach(item => {
    const g = _fovGetAlphaGroup(item);
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  const sortedKeys = Object.keys(groups).sort((a,b) => {
    const ia = /^[A-Z]$/.test(a), ib = /^[A-Z]$/.test(b);
    if (ia && !ib) return -1; if (!ia && ib) return 1;
    return a.localeCompare(b, 'ja');
  });
  const alphaHTML = sortedKeys.map(g =>
    `<div class="vp-dd-alpha-hd">${g}</div>` + groups[g].map(mkItem).join('')
  ).join('');

  // Count tab
  const countTabHTML = [...allItems].sort((a,b) => (countMap[b]||0)-(countMap[a]||0)).map(mkItem).join('');

  const p = rowId; // prefix
  listEl.innerHTML =
    `<div class="vp-dd-subtabs">
      <div class="vp-dd-subtab${defTab==='recent'?' on':''}" id="${p}-ttab-recent" onclick="fovPickerTab3('${p}','recent')">🕐 最近</div>
      <div class="vp-dd-subtab${defTab==='alpha'?' on':''}" id="${p}-ttab-alpha"  onclick="fovPickerTab3('${p}','alpha')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" id="${p}-ttab-count" onclick="fovPickerTab3('${p}','count')">件数順</div>
    </div>
    <div class="vp-dd-subpanel${defTab==='recent'?' on':''}" id="${p}-tab-recent">${recentPanelHTML}</div>
    <div class="vp-dd-subpanel${defTab==='alpha'?' on':''}"  id="${p}-tab-alpha">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="${p}-tab-count">${countTabHTML}</div>`;
}

export function fovPickerDdOpen(rowId, filterKey) {
  const dd = document.getElementById(rowId + '-dd');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  document.querySelectorAll('.fov-dd').forEach(d => d.style.display = 'none');
  if (isOpen) return;
  const rowEl = document.getElementById(rowId);
  if (rowEl) _positionFovDd(dd, rowEl);
  dd.style.display = 'block';
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) inp.value = '';
  _fovPickerDdRenderList(rowId, filterKey, '');
}

export function fovPickerDdToggle(rowId, filterKey, val) {
  const { f, af } = _getCtx(rowId);
  if (f[filterKey]?.has(val)) {
    f[filterKey].delete(val);
  } else {
    f[filterKey]?.add(val);
    _addRecentFilter(filterKey, val);
  }
  _fovDdUpdateChips(rowId, filterKey);
  _fovPickerDdRenderList(rowId, filterKey, document.querySelector(`#${rowId}-dd .vp-dd-search`)?.value || '');
  af();
}

export function fovPickerDdFilter(rowId, filterKey, q) {
  _fovPickerDdRenderList(rowId, filterKey, q);
}

export function fovPickerDdTab(rowId, filterKey, tab) {
  if (!window._fovPickerTab) window._fovPickerTab = {};
  window._fovPickerTab[rowId] = tab;
  _fovPickerDdRenderList(rowId, filterKey, document.querySelector(`#${rowId}-dd .vp-dd-search`)?.value || '');
}

function _positionFovDd(dd, rowEl) {
  const rect = rowEl.getBoundingClientRect();
  dd.style.left  = rect.left + 'px';
  dd.style.right = (window.innerWidth - rect.right) + 'px';
  dd.style.width = '';
  if (window.innerHeight - rect.bottom < 280) {
    dd.style.top    = 'auto';
    dd.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
  } else {
    dd.style.top    = (rect.bottom + 2) + 'px';
    dd.style.bottom = 'auto';
  }
}

export function fovDdOpen(rowId) {
  const dd = document.getElementById(rowId + '-dd');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  document.querySelectorAll('.fov-dd').forEach(d => d.style.display = 'none');
  if (isOpen) return;
  const rowEl = document.getElementById(rowId);
  if (rowEl) _positionFovDd(dd, rowEl);
  dd.style.display = 'block';
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) inp.value = '';
  // リストを必ず再描画（初期ロード時の空白対策）
  const fk = dd.dataset.filterkey;
  if (fk) fovDdFilter(rowId, fk, '');
}

export function fovDdFilter(rowId, filterKey, q) {
  const vids = window.videos || [];
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  let items = [];
  if (filterKey === 'tb') items = window.TB_TAGS || [];
  else if (filterKey === 'action') items = window.AC_TAGS || [];
  else if (filterKey === 'position') items = [...new Set([...POS_BASE, ...vids.flatMap(v => v.pos||[])])].sort();
  else if (filterKey === 'tech') items = [...new Set(vids.flatMap(v => v.tech||[]))].sort();
  _fovDdRenderList(rowId, filterKey, items, q);
}

export function fovDdToggleItem(rowId, filterKey, val, el) {
  const { f, af } = _getCtx(rowId);
  if (f[filterKey]?.has(val)) {
    f[filterKey].delete(val);
    el?.classList.remove('selected');
  } else {
    f[filterKey]?.add(val);
    el?.classList.add('selected');
  }
  _fovDdUpdateChips(rowId, filterKey);
  af();
}

export function fovDdRemove(rowId, filterKey, val) {
  const { f, af } = _getCtx(rowId);
  f[filterKey]?.delete(val);
  _fovDdUpdateChips(rowId, filterKey);
  const listEl = document.getElementById(rowId + '-ddlist');
  if (listEl) {
    listEl.querySelectorAll('.vp-dd-item').forEach(item => {
      if (item.childNodes[0]?.textContent?.trim() === val) item.classList.remove('selected');
    });
  }
  af();
}

export function fovFilterClear(rowId, filterKey) {
  const { f, af } = _getCtx(rowId);
  f[filterKey]?.clear();
  _fovDdUpdateChips(rowId, filterKey);
  document.querySelectorAll(`#${rowId}-ddlist .vp-dd-item`).forEach(el => el.classList.remove('selected'));
  af();
}

// ── フィルター行同期（オーバーレイ内）── isOrg=true でオーガナイズ用にも使用可
export function syncFilterOvRows(isOrg=false) {
  const p = isOrg ? 'org-fov' : 'fov';
  const f = isOrg ? (window.orgFilters||{}) : (window.filters||{});
  // TB/AC/POS/TECH/PL/CH: DDチップ更新（data-ctxはbuildFovRowsで設定済み）
  ['tb','ac','pos','tech','pl','ch'].forEach(k => {
    const fk = {tb:'tb',ac:'action',pos:'position',tech:'tech',pl:'playlist',ch:'channel'}[k];
    _fovDdUpdateChips(`${p}-srow-${k}`, fk);
  });
  // Status/Prio
  ['未着手','練習中','マスター'].forEach(v => {
    const el = document.getElementById(`${p}-stat-${v}`); if(el) el.classList.toggle('active', f.status?.has(v));
  });
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el = document.getElementById(`${p}-prio-${v}`); if(el) el.classList.toggle('active', f.prio?.has(v));
  });
  // Fav/Unw/Watched/Bm/Memo
  const favEl  = document.getElementById(`${p}-chip-fav`);     if(favEl)  favEl.classList.toggle('active',  (isOrg ? window.orgFavOnly      : window.favOnly)||false);
  const unwEl  = document.getElementById(`${p}-chip-unw`);     if(unwEl)  unwEl.classList.toggle('active',  (isOrg ? window.orgUnwOnly      : window.unwOnly)||false);
  const watEl  = document.getElementById(`${p}-chip-watched`); if(watEl)  watEl.classList.toggle('active',  (isOrg ? window.orgWatchedOnly  : window.watchedOnly)||false);
  const bmEl   = document.getElementById(`${p}-chip-bm`);      if(bmEl)   bmEl.classList.toggle('active',   (isOrg ? window.orgBmOnly       : window.bmOnly)||false);
  const memoEl = document.getElementById(`${p}-chip-memo`);    if(memoEl) memoEl.classList.toggle('active', (isOrg ? window.orgMemoOnly     : window.memoOnly)||false);
}

// ── カウントヘルパー ──
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

// ── 行ビルダー（フィルターオーバーレイ内）── isOrg=true でオーガナイズ用にも使用可
export function buildFovRows(isOrg=false) {
  const p    = isOrg ? 'org-fov' : 'fov';
  const f    = isOrg ? (window.orgFilters||{}) : (window.filters||{});
  const vids = window.videos || [];
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];

  // Source（固定2択）
  const srcRow = document.getElementById(`${p}-srow-src`);
  if (srcRow) {
    srcRow.innerHTML = '';
    [['youtube','YouTube'], ['gdrive','Google Drive']].forEach(([val, label]) => {
      const cnt = vids.filter(v => !v.archived && v.pt === val).length;
      const el = document.createElement('div');
      el.className = 'chip' + (f.platform?.has(val) ? ' active' : '');
      el.style.flexShrink = '0';
      el.textContent = `${label} ${cnt}`;
      el.onclick = () => {
        if (f.platform) f.platform.has(val) ? f.platform.delete(val) : f.platform.add(val);
        buildFovRows(isOrg);
        syncFilterOvRows(isOrg);
        isOrg ? window.renderOrg?.() : window.AF?.();
      };
      srcRow.appendChild(el);
    });
  }

  buildFovDdRow(`${p}-srow-tb`,   'tb',       window.TB_TAGS||[], 'TOP/BOTTOM検索...', isOrg);
  buildFovDdRow(`${p}-srow-ac`,   'action',   window.AC_TAGS||[], 'Action検索...', isOrg);
  buildFovDdRow(`${p}-srow-pos`,  'position', [...new Set([...POS_BASE, ...vids.flatMap(v => v.pos||[])])].sort(), 'Position検索...', isOrg);
  buildFovDdRow(`${p}-srow-tech`, 'tech',     [...new Set(vids.flatMap(v => v.tech||[]))].sort(), 'Technique検索...', isOrg);
  buildFovPickerDdRow(`${p}-srow-pl`, 'playlist', 'プレイリストを選ぶ', isOrg);
  buildFovPickerDdRow(`${p}-srow-ch`, 'channel',  'チャンネルを選ぶ', isOrg);
}

export function buildFovHscroll(rowId, tags, filterKey, allChipId) {
  const row     = document.getElementById(rowId); if (!row) return;
  const allChip = document.getElementById(allChipId);
  const filters = window.filters || {};
  row.innerHTML = '';
  tags.forEach(tag => {
    const cnt = window.countContextual
      ? window.countContextual(filterKey, tag)
      : ((window.videos||[]).filter(v => !v.archived && (filterKey==='tb' ? (v.tb||[]).includes(tag) : (v.ac||[]).includes(tag))).length);
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
  row.innerHTML = '';
  const allItems = getAll();
  allItems.forEach(val => {
    const cnt = window.countContextual
      ? window.countContextual(filterKey, val)
      : ((window.videos||[]).filter(v => !v.archived && (
          filterKey==='playlist' ? v.pl===val :
          filterKey==='channel'  ? v.ch===val :
          filterKey==='tech'     ? (v.tech||[]).includes(val) :
          (v.pos||[]).includes(val))).length);
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

// ── 状態同期 ──
export function syncFovChips() {
  const f = window.filters || {};
  const favChip = document.getElementById('fov-chip-fav');     if (favChip) favChip.classList.toggle('active', window.favOnly||false);
  const unwChip = document.getElementById('fov-chip-unw');     if (unwChip) unwChip.classList.toggle('active', window.unwOnly||false);
  const watChip = document.getElementById('fov-chip-watched'); if (watChip) watChip.classList.toggle('active', window.watchedOnly||false);
  ['未着手','練習中','マスター'].forEach(v => {
    const el = document.getElementById('fov-stat-' + v); if (el) el.classList.toggle('active', f.status?.has(v));
  });
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el = document.getElementById('fov-prio-' + v); if (el) el.classList.toggle('active', f.prio?.has(v));
  });
}

export function clearFovField(fieldKey) {
  const f = window.filters || {};
  const keyMap = {tb:'tb', action:'action', pos:'position', playlist:'playlist', tech:'tech', ch:'channel'};
  const allMap = {tb:'fov-all-tb', action:'fov-all-ac', pos:'fov-all-pos', playlist:'fov-all-pl', tech:'fov-all-tech', ch:'fov-all-ch'};
  const rowMap = {tb:'fov-srow-tb', action:'fov-srow-ac', pos:'fov-srow-pos', playlist:'fov-srow-pl', tech:'fov-srow-tech', ch:'fov-srow-ch'};
  const fk = keyMap[fieldKey];
  if (fk && f[fk]) f[fk].clear();
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
    return `<span class="fs-picker-chip${isSel?' sel':''}" onmousedown="event.preventDefault();fsPick('${type}','${v.replace(/'/g,"\\'")}'  ,this)">${v}</span>`;
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
window.savedSearches = savedSearches; // Firebase同期用に公開

function _persistSavedSearches() {
  localStorage.setItem('wk-saved-searches', JSON.stringify(savedSearches));
  window.savedSearches = savedSearches;
  window.saveUserSettings?.();   // Firebaseにも保存
}

// Firebase復元時に呼ばれる（firebase.js の loadUserSettings から）
export function loadSavedSearchesFromRemote(arr) {
  if (!Array.isArray(arr) || !arr.length) return;
  savedSearches = arr;
  window.savedSearches = savedSearches;
  localStorage.setItem('wk-saved-searches', JSON.stringify(savedSearches));
  renderSavedSearches();
}

export function saveCurrentSearch() {
  const f = window.filters || {};
  const state = {
    favOnly: window.favOnly, unwOnly: window.unwOnly, watchedOnly: window.watchedOnly,
    filters: Object.fromEntries(Object.entries(f).map(([k,v]) => [k, [...v]])),
    query: (document.getElementById('si')||{}).value || (document.getElementById('si-lib-pc')||{}).value || ''
  };
  const hasFilter = state.favOnly || state.unwOnly || state.watchedOnly ||
    Object.values(state.filters).some(a => a.length > 0) || state.query;
  if (!hasFilter) { window.toast?.('フィルターが設定されていません'); return; }
  const name = prompt('検索条件の名前を入力してください:');
  if (!name) return;
  savedSearches.unshift({ name, state, createdAt: Date.now() });
  if (savedSearches.length > 20) savedSearches = savedSearches.slice(0, 20);
  _persistSavedSearches();
  renderSavedSearches();
  window.toast?.('💾 「' + name + '」を保存しました');
}

export function applySavedSearch(idx) {
  const ss = savedSearches[idx]; if (!ss) return;
  window.clearAll?.();
  const s = ss.state;
  window.favOnly = s.favOnly; window.unwOnly = s.unwOnly; window.watchedOnly = s.watchedOnly || false;
  const f = window.filters || {};
  Object.entries(s.filters||{}).forEach(([k,v]) => { if (f[k]) { f[k].clear(); v.forEach(x => f[k].add(x)); } });
  const si   = document.getElementById('si');        if (si)   si.value   = s.query || '';
  const siPc = document.getElementById('si-lib-pc'); if (siPc) siPc.value = s.query || '';
  window.AF?.(); renderSavedSearches();
  window.toast?.('🔍 「' + ss.name + '」を適用しました');
}

export function applySavedSearchToOrg(idx) {
  const ss = savedSearches[idx]; if (!ss) return;
  const s = ss.state;
  const f = window.orgFilters || {};
  Object.entries(s.filters||{}).forEach(([k,v]) => { if (f[k]) { f[k].clear(); v.forEach(x => f[k].add(x)); } });
  if (s.favOnly  !== undefined) window.orgFavOnly  = s.favOnly;
  if (s.unwOnly  !== undefined) window.orgUnwOnly  = s.unwOnly;
  const si   = document.getElementById('si-org');    if (si)   si.value   = s.query || '';
  const siPc = document.getElementById('si-org-pc'); if (siPc) siPc.value = s.query || '';
  window.renderOrg?.();
  window.syncOrgFilterOvRows?.();
  renderSavedSearches();
  window.toast?.('🔍 「' + ss.name + '」をOrganizeに適用しました');
}

export function deleteSavedSearch(idx, e) {
  e.stopPropagation();
  savedSearches.splice(idx, 1);
  _persistSavedSearches();
  renderSavedSearches();
}

export function renderSavedSearches() {
  const makeHTML = (applyFn) => {
    if (!savedSearches.length) return '<div style="font-size:10px;color:var(--text3)">保存した検索条件はありません</div>';
    return savedSearches.map((ss, i) => `
      <div onclick="${applyFn}(${i})" style="display:flex;align-items:center;justify-content:space-between;
        padding:5px 8px;border-radius:6px;cursor:pointer;background:var(--surface2);font-size:11px;font-weight:500">
        <span>${ss.name}</span>
        <span onclick="deleteSavedSearch(${i},event)" style="color:var(--text3);font-size:10px;padding:2px 4px">✕</span>
      </div>
    `).join('');
  };
  const libList = document.getElementById('fs-saved-list');
  if (libList) libList.innerHTML = makeHTML('applySavedSearch');
  const orgList = document.getElementById('org-fs-saved-list');
  if (orgList) orgList.innerHTML = makeHTML('applySavedSearchToOrg');
}

// ── アコーディオン ──
export function toggleAcc(key) {
  const body  = document.getElementById('fs-acc-body-' + key);
  const arrow = document.getElementById('fs-acc-arr-' + key);
  if (!body) return;
  const open = body.style.display === 'none' || body.style.display === '';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', open);
  if (open) {
    if (key === 'saved')  window.renderFilterPresets?.();
    if (key === 'src')    buildSidebarFovRows();
    if (key === 'recent') renderRecentSidebar();
  }
}

// ── サイドバー フィルターポップアップ ──
function _sbPopupRender(key, ctx='lib') {
  const cId = 'sb-popup-inner';
  const body = document.getElementById('sb-popup-body');
  if (!body) return;
  body.innerHTML = `<div id="${cId}"></div>`;
  const vids = window.videos || [];
  if (key === 'ch')        buildSbPickerInline(cId, 'channel', ctx);
  else if (key === 'pl')   buildSbPickerInline(cId, 'playlist', ctx);
  else if (key === 'tb')   buildSbTagInline(cId, 'tb', window.TB_TAGS||[], ctx);
  else if (key === 'ac')   buildSbTagInline(cId, 'action', window.AC_TAGS||[], ctx);
  else if (key === 'pos')  buildSbTagInline(cId, 'position', [...new Set([..._SB_POS_BASE, ...vids.flatMap(v => v.pos||[])])].sort(), ctx);
  else if (key === 'tech') buildSbTagInline(cId, 'tech', [...new Set(vids.flatMap(v => v.tech||[]))].sort(), ctx);
}

const _SB_POPUP_LABELS = { ch:'Channel', pl:'Playlist', tb:'Top / Bottom', ac:'Action', pos:'Position', tech:'Technique' };

export function openSbPopup(key, triggerEl, ctx='lib') {
  const popup = document.getElementById('sb-filter-popup');
  if (!popup) return;
  // 同じキー＆同じctxなら閉じる
  if (popup.dataset.activeKey === key && popup.dataset.activeCtx === ctx && popup.style.display !== 'none') {
    closeSbPopup(); return;
  }
  popup.dataset.activeKey = key;
  popup.dataset.activeCtx = ctx;
  const titleEl = document.getElementById('sb-popup-title');
  if (titleEl) titleEl.textContent = _SB_POPUP_LABELS[key] || key;
  _sbPopupRender(key, ctx);

  // サイドバーの右端の右隣に配置
  const sidebar = document.getElementById('filterSidebar');
  const sRect = sidebar ? sidebar.getBoundingClientRect() : { right: 224 };
  const tRect = triggerEl.getBoundingClientRect();

  popup.style.display = 'block';
  popup.style.left   = (sRect.right + 4) + 'px';
  popup.style.right  = 'auto';
  popup.style.width  = '320px';

  let top = tRect.top;
  popup.style.top = top + 'px';
  const pRect = popup.getBoundingClientRect();
  if (pRect.bottom > window.innerHeight - 16) {
    top = Math.max(8, window.innerHeight - 16 - pRect.height);
    popup.style.top = top + 'px';
  }

  // アロー更新（lib/orgそれぞれのプレフィックスで更新）
  const prefix = ctx === 'org' ? 'org-fs-acc-arr-' : 'fs-acc-arr-';
  document.querySelectorAll('.fs-acc-arrow').forEach(a => a.classList.remove('open'));
  const arr = document.getElementById(prefix + key);
  if (arr) arr.classList.add('open');
}

export function closeSbPopup() {
  const popup = document.getElementById('sb-filter-popup');
  if (popup) { popup.style.display = 'none'; popup.dataset.activeKey = ''; popup.dataset.activeCtx = ''; }
  document.querySelectorAll('.fs-acc-arrow').forEach(a => a.classList.remove('open'));
}

// クリック外で閉じる
document.addEventListener('click', e => {
  const popup = document.getElementById('sb-filter-popup');
  if (!popup || popup.style.display === 'none') return;
  if (!popup.contains(e.target) && !e.target.closest('.fs-acc-hdr')) closeSbPopup();
}, true);

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
    countFn = v => window.countContextual ? window.countContextual('playlist', v) : vids.filter(x => !x.archived && x.pl === v).length;
  } else {
    items = [...new Set(vids.map(v => v.ch).filter(Boolean))].sort();
    filterKey = 'channel';
    countFn = v => window.countContextual ? window.countContextual('channel', v) : vids.filter(x => !x.archived && x.ch === v).length;
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

// ── サイドバー タグフィルターチップ ──
function _buildSbTagChips(elId, filterKey, items) {
  const el = document.getElementById(elId);
  if (!el) return;
  const f = window.filters || {};
  el.innerHTML = items.map(v => {
    const safe = v.replace(/'/g, "\\'");
    return `<div class="chip${f[filterKey]?.has(v) ? ' active' : ''}" style="font-size:10.5px" onclick="togF('${filterKey}','${safe}',this)">${v}</div>`;
  }).join('');
}

export function buildSidebarFovRows() {
  const f = window.filters || {};
  const srcEl = document.getElementById('fs-acc-src-chips');
  if (srcEl) {
    srcEl.innerHTML = '';
    // ファセット: platform以外のフィルターを適用した動画でカウント
    const ctxVids = _sbContextVideos('platform', f);
    [['youtube','YouTube'],['gdrive','GDrive']].forEach(([val, label]) => {
      const cnt = ctxVids.filter(v => v.pt === val).length;
      const chip = document.createElement('div');
      chip.className = 'chip' + (f.platform?.has(val) ? ' active' : '');
      chip.textContent = label + (cnt ? ' ' + cnt : '');
      chip.style.opacity = (!f.platform?.has(val) && cnt === 0) ? '0.35' : '';
      chip.onclick = () => {
        f.platform?.has(val) ? f.platform.delete(val) : f.platform?.add(val);
        buildSidebarFovRows(); window.AF?.();
      };
      srcEl.appendChild(chip);
    });
  }
}

// ── 最近みた動画 ──
const _RECENT_KEY = 'wk_recent_views';

export function trackRecentView(id) {
  const vid = (window.videos||[]).find(v => v.id === id);
  if (!vid) return;
  let recents = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
  recents = recents.filter(r => r.id !== id);
  recents.unshift({ id, title: vid.title||'', channel: vid.channel||'', ytId: vid.ytId||'' });
  recents = recents.slice(0, 10);
  localStorage.setItem(_RECENT_KEY, JSON.stringify(recents));
  renderRecentSidebar();
}

export function renderRecentSidebar() {
  const container = document.getElementById('fs-recent-list');
  if (!container) return;
  const recents = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
  if (!recents.length) {
    container.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:8px 14px">まだ視聴した動画はありません</div>';
    return;
  }
  container.innerHTML = recents.map(v => {
    const thumb = v.ytId
      ? `<img src="https://i.ytimg.com/vi/${v.ytId}/mqdefault.jpg" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
      : '';
    return `<div onclick="window.openVPanel?.('${v.id}')" style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:44px;min-width:44px;height:28px;background:var(--surface3);border-radius:4px;overflow:hidden;flex-shrink:0">${thumb}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.channel||''}</div>
      </div>
    </div>`;
  }).join('');
}

// ── サイドバー インライン ピッカー (Channel / Playlist / タグ) ──
const _SB_POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
const _sbTagItems  = {};

// ── 最近選んだフィルター項目（localStorage 永続化、最大15件）──
const _RF_STORE = { channel: 'wk_recent_filter_ch', playlist: 'wk_recent_filter_pl' };
function _getRecentFilters(filterKey) {
  const key = _RF_STORE[filterKey];
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}
function _addRecentFilter(filterKey, val) {
  const key = _RF_STORE[filterKey];
  if (!key) return;
  const updated = [val, ..._getRecentFilters(filterKey).filter(v => v !== val)].slice(0, 15);
  localStorage.setItem(key, JSON.stringify(updated));
}

// コンテキスト（lib / org）からfilter/af取得
function _getSbCtx(containerId) {
  const el = document.getElementById(containerId);
  const isOrg = el?.dataset.sbCtx === 'org';
  return {
    f:  isOrg ? (window.orgFilters || {}) : (window.filters || {}),
    af: isOrg ? () => window.renderOrg?.() : () => window.AF?.()
  };
}

// 指定キー以外の全フィルターを適用した動画セットを返す（ファセット検索用）
function _sbContextVideos(filterKey, f) {
  return (window.videos || []).filter(v => {
    if (v.archived) return false;
    if (filterKey !== 'platform'  && f?.platform?.size  && !f.platform.has(v.pt))                                         return false;
    if (filterKey !== 'channel'   && f?.channel?.size   && !f.channel.has(v.channel || v.ch))                             return false;
    if (filterKey !== 'playlist'  && f?.playlist?.size  && !f.playlist.has(v.pl))                                         return false;
    if (filterKey !== 'tb'        && f?.tb?.size        && !(v.tb  ||[]).some(t => f.tb.has(t)))                          return false;
    if (filterKey !== 'action'    && f?.action?.size    && !(v.ac  ||[]).some(a => f.action.has(a)))                      return false;
    if (filterKey !== 'position'  && f?.position?.size  && !(v.pos ||[]).some(p => f.position.has(p)))                    return false;
    if (filterKey !== 'tech'      && f?.tech?.size      && !(v.tech||[]).some(t => f.tech.has(t)))                        return false;
    return true;
  });
}

function _sbPickerCountMap(filterKey, f) {
  const m = {};
  _sbContextVideos(filterKey, f).forEach(v => {
    const k = filterKey === 'channel' ? (v.channel || v.ch) : v.pl;
    if (k) m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function _sbPickerRenderList(containerId, filterKey, q) {
  const listEl = document.getElementById(containerId + '-list');
  if (!listEl) return;
  const { f } = _getSbCtx(containerId);
  const countMap = _sbPickerCountMap(filterKey, f);
  // 選択済み項目はゼロ件でも必ず含める（解除できるように）
  const selected = [...(f[filterKey] || [])];
  selected.forEach(v => { if (!(v in countMap)) countMap[v] = 0; });
  const allItems = Object.keys(countMap).sort((a, b) => a.localeCompare(b, 'ja'));

  const hasOtherFilter = ['platform','channel','playlist','tb','action','position','tech']
    .some(k => k !== filterKey && f?.[k]?.size > 0);
  const secLabel = filterKey === 'channel'
    ? (hasOtherFilter ? `絞り込み結果のチャンネル (${allItems.length}件)` : '全チャンネル')
    : (hasOtherFilter ? `絞り込み結果のプレイリスト (${allItems.length}件)` : '全プレイリスト');

  const mkItem = v => {
    const sel = f[filterKey]?.has(v);
    return `<div class="vp-dd-item${sel ? ' selected' : ''}" onclick="sbPickerInlineToggle('${containerId}','${filterKey}','${v.replace(/'/g,"\\'")}')">${v}<span class="vp-dd-cnt">${countMap[v] || 0}本</span></div>`;
  };

  if (q.trim()) {
    const ql = q.toLowerCase();
    listEl.innerHTML = allItems.filter(v => v.toLowerCase().includes(ql)).map(mkItem).join('');
    return;
  }

  const groups = {};
  allItems.forEach(item => {
    const g = _fovGetAlphaGroup(item);
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ia = /^[A-Z]$/.test(a), ib = /^[A-Z]$/.test(b);
    if (ia && !ib) return -1; if (!ia && ib) return 1;
    return a.localeCompare(b, 'ja');
  });
  const alphaHTML = sortedKeys.map(g =>
    `<div class="vp-dd-alpha-hd">${g}</div>` + groups[g].map(mkItem).join('')
  ).join('');
  const countHTML = [...allItems].sort((a, b) => (countMap[b] || 0) - (countMap[a] || 0)).map(mkItem).join('');

  // 最近タブ
  const recentList = _getRecentFilters(filterKey)
    .filter(v => (v in countMap) || f[filterKey]?.has(v)).slice(0, 15);
  const hasRecents = recentList.length > 0;
  const defTab = hasRecents ? 'recent' : 'alpha';
  const recentPanelHTML = hasRecents
    ? recentList.map(mkItem).join('')
    : `<div style="font-size:10px;color:var(--text3);padding:14px 12px;text-align:center">最近選んだものはありません</div>`;

  const p = containerId;
  listEl.innerHTML =
    `<div class="vp-dd-sec-hd" style="padding-bottom:0">${secLabel}</div>
    <div class="vp-dd-subtabs">
      <div class="vp-dd-subtab${defTab==='recent'?' on':''}" id="${p}-ttab-recent" onclick="sbPickerInlineTabSwitch('${p}','recent')">🕐 最近</div>
      <div class="vp-dd-subtab${defTab==='alpha'?' on':''}"  id="${p}-ttab-alpha"  onclick="sbPickerInlineTabSwitch('${p}','alpha')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" id="${p}-ttab-count" onclick="sbPickerInlineTabSwitch('${p}','count')">件数順</div>
    </div>
    <div class="vp-dd-subpanel${defTab==='recent'?' on':''}" id="${p}-tab-recent">${recentPanelHTML}</div>
    <div class="vp-dd-subpanel${defTab==='alpha'?' on':''}"  id="${p}-tab-alpha">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="${p}-tab-count">${countHTML}</div>`;
}

export function buildSbPickerInline(containerId, filterKey, ctx='lib') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.sbCtx = ctx;
  el.innerHTML = `
    <input class="vp-dd-search" id="${containerId}-search" placeholder="検索..."
      oninput="sbPickerInlineFilter('${containerId}','${filterKey}',this.value)">
    <div id="${containerId}-list"></div>`;
  _sbPickerRenderList(containerId, filterKey, '');
}

export function sbPickerInlineFilter(containerId, filterKey, q) {
  _sbPickerRenderList(containerId, filterKey, q);
}

export function sbPickerInlineToggle(containerId, filterKey, val) {
  const { f, af } = _getSbCtx(containerId);
  if (!f[filterKey]) f[filterKey] = new Set();
  if (!f[filterKey].has(val)) {
    f[filterKey].add(val);
    _addRecentFilter(filterKey, val);
  } else {
    f[filterKey].delete(val);
  }
  const q = document.getElementById(containerId + '-search')?.value || '';
  _sbPickerRenderList(containerId, filterKey, q);
  af();
}

export function sbPickerInlineTabSwitch(containerId, tab) {
  ['recent','alpha','count'].forEach(t => {
    document.getElementById(`${containerId}-tab-${t}`)?.classList.toggle('on', t === tab);
    document.getElementById(`${containerId}-ttab-${t}`)?.classList.toggle('on', t === tab);
  });
}

export function fovPickerTab3(rowId, tab) {
  ['recent','alpha','count'].forEach(t => {
    document.getElementById(`${rowId}-tab-${t}`)?.classList.toggle('on', t === tab);
    document.getElementById(`${rowId}-ttab-${t}`)?.classList.toggle('on', t === tab);
  });
}

// ── サイドバー インライン タグリスト (TB / Action / Position / Technique) ──
// タグフィールド名（v のキー）とfilterKeyの対応
const _TAG_FIELD = { tb:'tb', action:'ac', position:'pos', tech:'tech' };

function _sbTagRenderList(containerId, filterKey, items, q) {
  const listEl = document.getElementById(containerId + '-list');
  if (!listEl) return;
  const { f } = _getSbCtx(containerId);

  // 他のフィルターを適用した動画セットから、このキーに存在する値のSetを作る
  const ctxVids = _sbContextVideos(filterKey, f);
  const field   = _TAG_FIELD[filterKey];
  const validSet = new Set();
  ctxVids.forEach(v => (v[field]||[]).forEach(t => validSet.add(t)));
  // 選択済み項目は文脈外でも表示（解除できるように）
  const selected = f[filterKey] || new Set();

  const ql = q.toLowerCase();
  const visible = items.filter(v =>
    (validSet.has(v) || selected.has(v)) && (!ql || v.toLowerCase().includes(ql))
  );

  if (!visible.length) {
    listEl.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:8px 12px">項目がありません</div>';
    return;
  }
  listEl.innerHTML = visible.map(v => {
    const sel = selected.has(v);
    return `<div class="vp-dd-item${sel ? ' selected' : ''}" onclick="sbTagInlineToggle('${containerId}','${filterKey}','${v.replace(/'/g,"\\'")}')">${v}</div>`;
  }).join('');
}

export function buildSbTagInline(containerId, filterKey, items, ctx='lib') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.sbCtx = ctx;
  _sbTagItems[containerId] = { filterKey, items };
  el.innerHTML = `
    <input class="vp-dd-search" id="${containerId}-search" placeholder="検索..."
      oninput="sbTagInlineFilter('${containerId}','${filterKey}',this.value)">
    <div id="${containerId}-list"></div>`;
  _sbTagRenderList(containerId, filterKey, items, '');
}

export function sbTagInlineFilter(containerId, filterKey, q) {
  const stored = _sbTagItems[containerId];
  if (stored) _sbTagRenderList(containerId, stored.filterKey, stored.items, q);
}

export function sbTagInlineToggle(containerId, filterKey, val) {
  const { f, af } = _getSbCtx(containerId);
  if (!f[filterKey]) f[filterKey] = new Set();
  f[filterKey].has(val) ? f[filterKey].delete(val) : f[filterKey].add(val);
  const stored = _sbTagItems[containerId];
  if (!stored) return;
  const q = document.getElementById(containerId + '-search')?.value || '';
  _sbTagRenderList(containerId, filterKey, stored.items, q);
  af();
}

// フィルタークリア後に開いているポップアップを再描画（ctx照合）
export function refreshOpenSbAccordions(ctx='lib') {
  const popup = document.getElementById('sb-filter-popup');
  if (popup && popup.style.display !== 'none'
      && popup.dataset.activeKey && popup.dataset.activeCtx === ctx) {
    _sbPopupRender(popup.dataset.activeKey, ctx);
  }
  if (ctx === 'lib' && document.getElementById('fs-acc-body-src')?.style.display !== 'none') buildSidebarFovRows();
  if (ctx === 'org' && document.getElementById('org-fs-acc-body-src')?.style.display !== 'none') buildOrgSbSrcChips();
}

export function buildOrgSbSrcChips() {
  const el = document.getElementById('org-fs-acc-src-chips');
  if (!el) return;
  const f = window.orgFilters || {};
  el.innerHTML = '';
  const ctxVids = _sbContextVideos('platform', f);
  [['youtube','YouTube'],['gdrive','GDrive']].forEach(([val, label]) => {
    const cnt = ctxVids.filter(v => v.pt === val).length;
    const chip = document.createElement('div');
    chip.className = 'chip' + (f.platform?.has(val) ? ' active' : '');
    chip.textContent = label + (cnt ? ' ' + cnt : '');
    chip.style.opacity = (!f.platform?.has(val) && cnt === 0) ? '0.35' : '';
    chip.onclick = () => {
      f.platform?.has(val) ? f.platform.delete(val) : f.platform?.add(val);
      buildOrgSbSrcChips(); window.renderOrg?.();
    };
    el.appendChild(chip);
  });
}
