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

  // 最近みた
  const recentKey = filterKey === 'channel' ? '_recentFovChannels' : '_recentFovPlaylists';
  const recents = (window[recentKey]||[]).filter(c => countMap[c]).slice(0, 5);
  const recentHTML = recents.length ? `
    <div class="vp-dd-sec-hd">🕐 最近みた</div>
    ${recents.map(mkItem).join('')}
    <div class="vp-dd-sec-div"></div>
  ` : '';

  // 2サブタブ
  if (!window._fovPickerTab) window._fovPickerTab = {};
  const activeTab = window._fovPickerTab[rowId] || 'alpha';

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

  const secLabel = filterKey === 'channel' ? '全チャンネル' : '全プレイリスト';
  listEl.innerHTML = recentHTML +
    `<div class="vp-dd-sec-hd" style="padding-bottom:0">${secLabel}</div>
    <div class="vp-dd-subtabs">
      <div class="vp-dd-subtab on" onclick="vpDdSubtab(event,'${rowId}-tab-alpha','${rowId}-tab-count')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" onclick="vpDdSubtab(event,'${rowId}-tab-count','${rowId}-tab-alpha')">件数順</div>
    </div>
    <div class="vp-dd-subpanel on" id="${rowId}-tab-alpha">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="${rowId}-tab-count">${countTabHTML}</div>`;
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
    const rk = filterKey === 'channel' ? '_recentFovChannels' : '_recentFovPlaylists';
    if (!window[rk]) window[rk] = [];
    window[rk] = [val, ...window[rk].filter(c => c !== val)].slice(0, 10);
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
