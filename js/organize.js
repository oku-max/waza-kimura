// organize.js — Organize tab functions as ES module

// ═══ Module-level state (exported + registered on window) ═══
export let orgFilters = {
  prio: new Set(), tb: new Set(), action: new Set(), position: new Set(),
  playlist: new Set(), status: new Set(), tech: new Set(),
  platform: new Set(), channel: new Set()
};
export let orgFavOnly = false, orgUnwOnly = false, orgWatchedOnly = false, orgBmOnly = false, orgMemoOnly = false;
const _ORG_DEFAULT_ORDER = ['fav', 'tb', 'action', 'position', 'technique', 'channel', 'prio', 'playlist', 'addedAt', 'duration', 'memo'];
const _ORG_DEFAULT_VIS   = {tb: true, action: true, position: true, technique: true, channel: true, prio: true, playlist: true, memo: true, addedAt: true, fav: true, duration: true};
function _loadOrgColPrefs() {
  try {
    const o = localStorage.getItem('wk_orgColOrder');
    const v = localStorage.getItem('wk_orgColVisibility');
    return {
      order: o ? JSON.parse(o) : [..._ORG_DEFAULT_ORDER],
      vis:   v ? JSON.parse(v) : {..._ORG_DEFAULT_VIS},
    };
  } catch(e) { return { order: [..._ORG_DEFAULT_ORDER], vis: {..._ORG_DEFAULT_VIS} }; }
}
const _orgPrefs = _loadOrgColPrefs();
export let orgColOrder = _orgPrefs.order;
export let orgColVisibility = _orgPrefs.vis;
function _saveOrgColPrefs() {
  try {
    localStorage.setItem('wk_orgColOrder', JSON.stringify(orgColOrder));
    localStorage.setItem('wk_orgColVisibility', JSON.stringify(orgColVisibility));
  } catch(e) {}
}
export const ORG_COL_LABELS = {tb:'トップ/ボトム', action:'Action', position:'Position', technique:'Technique', channel:'Channel', prio:'Priority', playlist:'Playlist', memo:'要約/メモ', addedAt:'追加日', fav:'★ Fav', duration:'長さ'};
export const ORG_COL_WIDTHS = {tb:'110px', action:'120px', position:'120px', technique:'120px', channel:'110px', prio:'120px', playlist:'120px', memo:'160px', addedAt:'90px', fav:'52px', duration:'64px'};
export let orgSortCol = null, orgSortAsc = true;
let _orgFixedLefts = {chk:0, thumb:40, ch:116, title:246};

// Register state on window so inline HTML handlers can access them
window.orgFilters = orgFilters;
Object.defineProperty(window, 'orgFavOnly',     {get: () => orgFavOnly,     set: v => { orgFavOnly = v; }});
Object.defineProperty(window, 'orgUnwOnly',     {get: () => orgUnwOnly,     set: v => { orgUnwOnly = v; }});
Object.defineProperty(window, 'orgWatchedOnly', {get: () => orgWatchedOnly, set: v => { orgWatchedOnly = v; }});
Object.defineProperty(window, 'orgBmOnly',      {get: () => orgBmOnly,      set: v => { orgBmOnly = v; }});
Object.defineProperty(window, 'orgMemoOnly',    {get: () => orgMemoOnly,    set: v => { orgMemoOnly = v; }});
Object.defineProperty(window, 'orgColOrder', {get: () => orgColOrder, set: v => { orgColOrder = v; }});
Object.defineProperty(window, 'orgColVisibility', {get: () => orgColVisibility, set: v => { orgColVisibility = v; }});
Object.defineProperty(window, 'orgSortCol', {get: () => orgSortCol, set: v => { orgSortCol = v; }});
Object.defineProperty(window, 'orgSortAsc', {get: () => orgSortAsc, set: v => { orgSortAsc = v; }});

// ═══ Fixed header initialization ═══

export function initOrgFixedHeaders() {
  const thead = document.getElementById('orgTheadRow');
  if (!thead) return;
  // 毎回再構築（guardなし）
  [...thead.querySelectorAll('th[data-fixed]')].forEach(el => el.remove());
  const fixedDefs = [
    {key:'chk',   w:40,  label:''},
    {key:'thumb', w:76,  label:''},
    {key:'title', w:180, label:'Title', sep:true, sortKey:'title'},
  ];
  let left = 0;
  fixedDefs.forEach(def => {
    const th = document.createElement('th');
    th.className = 'org-th org-col-fixed' + (def.sep?' org-col-sep':'');
    th.dataset.fixed = def.key;
    th.style.cssText = `position:sticky;top:0;left:${left}px;width:${def.w}px;min-width:${def.w}px;background:var(--surface);z-index:11;${def.sep?'border-right:2.5px solid var(--border)':''}`;
    if (def.sortKey) {
      th.style.cursor = 'pointer';
      th.title = 'クリックでソート';
      th.addEventListener('click', e => { if(e.target.closest('.rh')) return; orgSetSort(def.sortKey); });
      // ソートインジケーター
      const labelSpan = document.createElement('span');
      labelSpan.textContent = def.label;
      th.appendChild(labelSpan);
      const sortInd = document.createElement('span');
      sortInd.className = 'org-sort-ind';
      sortInd.dataset.sortCol = def.sortKey;
      sortInd.style.cssText = 'margin-left:3px;font-size:9px;opacity:.4;';
      sortInd.textContent = orgSortCol === def.sortKey ? (orgSortAsc ? '▲' : '▼') : '⇅';
      if (orgSortCol === def.sortKey) sortInd.style.opacity = '1';
      th.appendChild(sortInd);
    } else {
      th.textContent = def.label;
    }
    if (def.key === 'chk') {
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'org-sel-all';
      cb.onchange = function(){ orgTogSelAll(this); };
      cb.style.cssText = 'accent-color:var(--accent);cursor:pointer';
      th.appendChild(cb);
    }
    thead.appendChild(th);
    left += def.w;
  });
  _orgFixedLefts = {chk:0, thumb:40, title:116};
}

// ═══ Filter toggle functions ═══

export function togOrgF(type, val, el) {
  orgFilters[type].has(val) ? (orgFilters[type].delete(val), el.classList.remove('active')) : (orgFilters[type].add(val), el.classList.add('active'));
  renderOrg();
}

export function togOrgFav() {
  orgFavOnly = !orgFavOnly;
  ['org-fs-chip-fav2','org-fov-chip-fav'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgFavOnly); });
  renderOrg();
}

export function togOrgUnw() {
  orgUnwOnly = !orgUnwOnly;
  ['org-fs-chip-unw2','org-fov-chip-unw'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgUnwOnly); });
  renderOrg();
}

export function togOrgWatched() {
  orgWatchedOnly = !orgWatchedOnly;
  ['org-fov-chip-watched','org-fs-chip-watched'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgWatchedOnly); });
  renderOrg();
}

export function togOrgBm() {
  orgBmOnly = !orgBmOnly;
  ['org-fov-chip-bm','org-fs-chip-bm'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgBmOnly); });
  renderOrg();
}

export function togOrgMemo() {
  orgMemoOnly = !orgMemoOnly;
  ['org-fov-chip-memo','org-fs-chip-memo'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgMemoOnly); });
  renderOrg();
}

export function clearOrgFilters() {
  Object.keys(orgFilters).forEach(k => orgFilters[k].clear());
  orgFavOnly = false; orgUnwOnly = false; orgWatchedOnly = false; orgBmOnly = false; orgMemoOnly = false;
  const si = document.getElementById('si-org'); if(si) si.value = '';
  const siPc = document.getElementById('si-org-pc'); if(siPc) siPc.value = '';
  syncOrgFilterOvRows();
  document.querySelectorAll('[id^="org-fs-"]').forEach(el => el.classList.remove('active'));
  window.refreshOpenSbAccordions?.('org');
  renderOrg();
}

export function orgFilt(list) {
  const siEl = document.getElementById('si-org');
  const siPcEl = document.getElementById('si-org-pc');
  const q = ((siEl?siEl.value:'') || (siPcEl?siPcEl.value:'')).toLowerCase();
  return list.filter(v => {
    if (v.archived) return false;
    if (orgFavOnly     && !v.fav) return false;
    if (orgUnwOnly     && v.watched) return false;
    if (orgWatchedOnly && !v.watched) return false;
    if (orgBmOnly      && !(v.bookmarks && v.bookmarks.length > 0)) return false;
    if (orgMemoOnly    && !v.memo) return false;
    if (orgFilters.platform.size && !orgFilters.platform.has(v.pt)) return false;
    if (q && !v.title.toLowerCase().includes(q) && !(v.ch||'').toLowerCase().includes(q) && !(v.pl||'').toLowerCase().includes(q) && !(v.tech||[]).some(t=>t.toLowerCase().includes(q))) return false;
    if (orgFilters.playlist.size && !orgFilters.playlist.has(v.pl)) return false;
    if (orgFilters.prio.size && !orgFilters.prio.has(v.prio)) return false;
    if (orgFilters.status.size && !orgFilters.status.has(v.status)) return false;
    if (orgFilters.tb.size && !(v.tb||[]).some(t=>orgFilters.tb.has(t))) return false;
    if (orgFilters.action.size && !(v.ac||[]).some(a=>orgFilters.action.has(a))) return false;
    if (orgFilters.position.size && !(v.pos||[]).some(p=>orgFilters.position.has(p))) return false;
    if (orgFilters.tech.size && !(v.tech||[]).some(t=>orgFilters.tech.has(t))) return false;
    if (orgFilters.channel.size && !orgFilters.channel.has(v.ch)) return false;
    return true;
  });
}

// ═══ Filter overlay ═══

export function openOrgFilterOverlay() {
  const ov = document.getElementById('org-filter-overlay');
  if (!ov) return;
  ov.classList.add('show');
  document.body.style.overflow = 'hidden';
  buildOrgFovRows();
  syncOrgFilterOvRows();
  window.renderSavedSearches?.();
}

// ── フィルター行ビルド — filter-overlay.js の共有関数に委譲 ──
export function buildOrgFovRows() {
  window.buildFovRows?.(true);
}

export function closeOrgFilterOverlay() {
  const ov = document.getElementById('org-filter-overlay');
  if (ov) ov.classList.remove('show');
  document.body.style.overflow = '';
}

// フィルター行同期 — filter-overlay.js の共有関数に委譲
export function syncOrgFilterOvRows() {
  window.syncFilterOvRows?.(true);
}

// buildOrgSrow → buildSrow(汎用版)に統一
export function buildOrgSrow(rowId, tagList, filterKey, addable) {
  window.buildSrow?.(rowId, tagList, filterKey, addable, orgFilters, renderOrg);
}

// mkOrgChip → mkChip に統一
export function mkOrgChip(label, isActive, onClick) { return window.mkChip?.(label, isActive, onClick); }

export function showOrgFsBulkBtn(show) {
  // 常時表示のため何もしない
}

// Organizeタブ用サイドバーアコーディオン
export function toggleOrgAcc(key) {
  const body = document.getElementById('org-fs-acc-body-' + key);
  const arrow = document.getElementById('org-fs-acc-arr-' + key);
  if (!body) return;
  const open = body.style.display === 'none' || body.style.display === '';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', open);
  if (open) {
    if (key === 'recent') window.renderRecentSidebar?.();
    if (key === 'saved')  window.renderSavedSearches?.();
    if (key === 'src')    window.buildOrgSbSrcChips?.();
  }
}

export function renderOrgAccChips(type) {
  const container = document.getElementById('org-fs-acc-' + type + '-chips'); if (!container) return;
  const searchEl = document.getElementById('org-acc-' + type + '-search');
  const q = searchEl ? searchEl.value.toLowerCase() : '';
  const videos = window.videos || [];
  let items, filterKey, countFn;
  if (type === 'pl') {
    items = [...new Set(videos.map(v => v.pl).filter(Boolean))].sort();
    filterKey = 'playlist';
    countFn = v => videos.filter(x => !x.archived && x.pl === v).length;
  } else {
    items = [...new Set(videos.map(v => v.ch).filter(Boolean))].sort();
    filterKey = 'channel';
    countFn = v => videos.filter(x => !x.archived && x.ch === v).length;
  }
  const filtered = q ? items.filter(v => v.toLowerCase().includes(q)) : items;
  container.innerHTML = '';
  if (!filtered.length) { container.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:4px 0">項目がありません</div>'; return; }
  filtered.forEach(val => {
    const cnt = countFn(val);
    const isSel = (orgFilters[filterKey] || new Set()).has(val);
    const el = document.createElement('div');
    el.className = 'chip' + (isSel ? ' active' : '');
    el.style.cssText = 'font-size:10.5px;cursor:pointer;';
    el.textContent = val + (cnt ? ' ' + cnt : '');
    el.onclick = () => {
      if (!orgFilters[filterKey]) orgFilters[filterKey] = new Set();
      isSel ? orgFilters[filterKey].delete(val) : orgFilters[filterKey].add(val);
      renderOrgAccChips(type); renderOrg();
    };
    container.appendChild(el);
  });
}

export function filterOrgAccChips(type) { renderOrgAccChips(type); }

// ═══ Organize用ピッカー（Libraryのピッカーと独立）═══

export function openOrgPos(){document.getElementById('org-pos-s').value='';renderOrgPos();document.getElementById('orgPosOv').classList.add('open');}

export function renderOrgPos(){
  const q=document.getElementById('org-pos-s').value.toLowerCase();
  const POS_BASE=['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const videos = window.videos || [];
  const all=[...new Set([...POS_BASE,...videos.flatMap(v=>v.pos||[])])].sort();
  const matched=all.filter(p=>!q||p.toLowerCase().includes(q));
  document.getElementById('orgPosR').innerHTML=matched.map(p=>{
    const n=window.countByField?.('pos',p);
    return`<div class="tech-pill ${orgFilters.position.has(p)?'active':''}" onclick="togOrgPos('${p.replace(/'/g,"\'")}',this)">${p}${window.cntBadge?.(n)}</div>`;
  }).join('');
}

export function togOrgPos(p,el){orgFilters.position.has(p)?orgFilters.position.delete(p):orgFilters.position.add(p);el.classList.toggle('active');renderOrg();}

export function openOrgPL(){document.getElementById('org-pl-s').value='';renderOrgPL();document.getElementById('orgPLOv').classList.add('open');}

export function renderOrgPL(){
  const q=document.getElementById('org-pl-s').value.toLowerCase();
  const videos = window.videos || [];
  const pls=[...new Set(videos.filter(v=>!v.archived).map(v=>v.pl))];
  const filtered=pls.filter(p=>!q||p.toLowerCase().includes(q));
  document.getElementById('orgPLR').innerHTML=filtered.map(p=>{
    const n=window.countByPl?.(p);
    return`<div class="tech-pill ${orgFilters.playlist.has(p)?'active':''}" onclick="togOrgPL('${p.replace(/'/g,"\'")}',this)">${p}${window.cntBadge?.(n)}</div>`;
  }).join('');
}

export function togOrgPL(p,el){orgFilters.playlist.has(p)?orgFilters.playlist.delete(p):orgFilters.playlist.add(p);el.classList.toggle('active');renderOrg();}

export function openOrgTF(){document.getElementById('org-tf-s').value='';renderOrgTF();document.getElementById('orgTFOv').classList.add('open');}

export function renderOrgTF(){
  const q=document.getElementById('org-tf-s').value.toLowerCase();
  const videos = window.videos || [];
  const all=[...new Set([...(window.TECH || []),...videos.flatMap(v=>v.tech||[])])].sort();
  const matched=all.filter(t=>!q||t.toLowerCase().includes(q));
  document.getElementById('orgTFR').innerHTML=matched.map(t=>{
    const n=window.countByField?.('tech',t);
    return`<div class="tech-pill ${orgFilters.tech.has(t)?'active':''}" onclick="togOrgTech('${t.replace(/'/g,"\'")}',this)">${t}${window.cntBadge?.(n)}</div>`;
  }).join('');
}

export function togOrgTech(t,el){orgFilters.tech.has(t)?orgFilters.tech.delete(t):orgFilters.tech.add(t);el.classList.toggle('active');renderOrg();}

export function openOrgChPicker(){
  document.getElementById('org-ch-s').value='';renderOrgChPicker('');document.getElementById('orgChOv').classList.add('open');
}

export function renderOrgChPicker(q){
  const videos = window.videos || [];
  const channels=[...new Set(videos.filter(v=>!v.archived&&v.ch).map(v=>v.ch))].sort();
  const ql=(q||'').toLowerCase();
  const matched=channels.filter(c=>!ql||c.toLowerCase().includes(ql));
  document.getElementById('orgChR').innerHTML=matched.map(c=>{
    const n=window.countByCh?.(c);
    return`<div class="tech-pill ${orgFilters.channel.has(c)?'active':''}" onclick="togOrgCh('${c.replace(/'/g,"\'")}',this)">${c}${window.cntBadge?.(n)}</div>`;
  }).join('');
}

export function togOrgCh(c,el){orgFilters.channel.has(c)?orgFilters.channel.delete(c):orgFilters.channel.add(c);el.classList.toggle('active');renderOrg();}

export function closeOrgOv(id){
  document.getElementById(id).classList.remove('open');
  openOrgFilterOverlay();
}

// ═══ Layout / height ═══

export function adjustOrgTableHeight() {
  const orgTab = document.getElementById('organizeTab');
  if (!orgTab || !orgTab.classList.contains('active')) return;
  // position:fixed + flex:1 で高さは自動制御。wrap.style.heightをリセット
  const wrap = document.querySelector('.org-table-wrap');
  if (wrap) wrap.style.height = '';
  // leftもここで更新
  const ma = document.querySelector('.main-area');
  if (ma && orgTab) {
    const left = ma.getBoundingClientRect().left;
    orgTab.style.left = left + 'px';
  }
}

// ═══ Main render ═══

export function renderOrg() {
  initOrgFixedHeaders();
  const videos = window.videos || [];
  // Organize専用フィルターでリストを絞り込む
  let list = orgFilt(videos);

  const totalCount = list.length;
  const oc = document.getElementById('oc');
  if (oc) oc.textContent = totalCount + ' 本';

  // ソート
  const sortSel = document.getElementById('org-sort-sel');
  const sortVal = sortSel ? sortSel.value : 'added-desc';

  function orgSortFn(a, b) {
    if (!orgSortCol) return 0;
    let av, bv;
    if (orgSortCol === 'title')    { av = (a.title||'').toLowerCase(); bv = (b.title||'').toLowerCase(); }
    else if (orgSortCol === 'channel')   { av = (a.ch||'').toLowerCase(); bv = (b.ch||'').toLowerCase(); }
    else if (orgSortCol === 'playlist')  { av = (a.pl||'').toLowerCase(); bv = (b.pl||'').toLowerCase(); }
    else if (orgSortCol === 'prio')      { const o={'今すぐ':0,'そのうち':1,'保留':2}; av=o[a.prio]??2; bv=o[b.prio]??2; }
    else if (orgSortCol === 'addedAt')   { av = a.addedAt||''; bv = b.addedAt||''; }
    else if (orgSortCol === 'duration')  { av = a.duration||0; bv = b.duration||0; }
    else if (orgSortCol === 'fav')       { av = a.fav?0:1; bv = b.fav?0:1; }
    else if (orgSortCol === 'tb')        { av=(a.tb||[]).join(); bv=(b.tb||[]).join(); }
    else if (orgSortCol === 'action')    { av=(a.ac||[]).join(); bv=(b.ac||[]).join(); }
    else if (orgSortCol === 'position')  { av=(a.pos||[]).join(); bv=(b.pos||[]).join(); }
    else if (orgSortCol === 'technique') { av=(a.tech||[]).join(); bv=(b.tech||[]).join(); }
    else return 0;
    if (av < bv) return orgSortAsc ? -1 : 1;
    if (av > bv) return orgSortAsc ? 1 : -1;
    return 0;
  }

  const displayList = [...list].sort(orgSortFn);

  // 空状態
  const empty = document.getElementById('org-empty');
  const tableWrap = document.querySelector('.org-table-wrap');
  if (!displayList.length) {
    if (empty) empty.style.display = '';
    if (tableWrap) tableWrap.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (tableWrap) tableWrap.style.display = '';

  const selIds = window.selIds || new Set();
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  tbody.innerHTML = displayList.map(v => {
    // v.idは'yt-XXXXX'形式のため、YouTubeはv.ytId、VimeoはvideoId部分を使用
    const _ytId = v.ytId || (v.id||'').replace(/^yt-/,'');
    const _vmId = (v.id||'').replace(/^vm-/,'');
    const thumb = v.pt === 'youtube'
      ? `https://img.youtube.com/vi/${_ytId}/mqdefault.jpg`
      : `https://vumbnail.com/${_vmId}.jpg`;

    const prio = v.prio || '保留';
    const prioCols = {'今すぐ':['#fdecea','#ff5252'],'そのうち':['#e3f2fd','#42a5f5'],'保留':['#fff8e1','#f59e0b']};
    const [prioBg, prioColor] = prioCols[prio];

    const mkTagCell = (items, filterKey, colKey) => {
      const chips = items.map(t =>
        `<span class="org-tag-chip">${t}</span>`
      ).join('');
      return `<td class="org-td" style="overflow:hidden">
        <div class="org-tag-cell">${chips || '<span style="font-size:10px;color:var(--text3)">—</span>'}</div>
      </td>`;
    };
    const scrollCells = orgColOrder.filter(col => orgColVisibility[col] !== false).map(col => {
      if (col === 'tb')        return mkTagCell(v.tb||[], 'tb', 'tb');
      if (col === 'action')    return mkTagCell(v.ac||[], 'action', 'action');
      if (col === 'position')  return mkTagCell(v.pos||[], 'position', 'position');
      if (col === 'technique') return mkTagCell(v.tech||[], 'tech', 'technique');
      if (col === 'channel')   return `<td class="org-td" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.ch||'—'}</div></td>`;
      if (col === 'prio')      return `<td class="org-td" style="white-space:nowrap;overflow:hidden">
        <div class="org-judge">
          ${['今すぐ','そのうち','保留'].map(p => {
            const active = prio === p;
            const [bg2,col2] = prioCols[p];
            return `<button class="org-judge-btn" style="background:${active?bg2:'var(--surface2)'};border:1.5px solid ${active?col2:'var(--border)'};color:${active?col2:'var(--text3)'};font-weight:${active?800:500}" onclick="event.stopPropagation();setPrio('${v.id}','${p}')">${p}</button>`;
          }).join('')}
        </div></td>`;
      if (col === 'playlist')  return `<td class="org-td" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.pl||'—'}</div></td>`;
      if (col === 'memo')      return `<td class="org-td" style="overflow:hidden"><div class="org-memo-text">${v.memo||'<span style="color:var(--text3);font-size:10px">—</span>'}</div></td>`;
      if (col === 'fav')       return `<td class="org-td" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogFav('${v.id}')" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:4px;transition:transform .1s" title="${v.fav?'Favを外す':'Favに追加'}">${v.fav?'★':'☆'}</button></td>`;
      if (col === 'addedAt') {
        const d = v.addedAt ? new Date(v.addedAt) : null;
        const ds = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '—';
        return `<td class="org-td" style="font-size:10px;color:var(--text3);white-space:nowrap">${ds}</td>`;
      }
      if (col === 'duration') {
        const sec = v.duration || 0;
        const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
        return `<td class="org-td" style="font-size:11px;color:var(--text3);white-space:nowrap;text-align:right">${dur}</td>`;
      }
      return '';
    }).join('');

    return `<tr class="org-tr" id="org-row-${v.id}">
      <td class="org-td org-td-fixed org-td-fixed-chk" style="padding:6px 6px" id="org-chk-cell-${v.id}">
        <input type="checkbox" id="org-cb-${v.id}" ${selIds.has(v.id)?'checked':''} onchange="orgTogSel('${v.id}',this)" onclick="event.stopPropagation()" style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer">
      </td>
      <td class="org-td org-td-fixed org-td-fixed-thumb" style="padding:6px 8px">
        <img class="org-thumb" src="${thumb}" onerror="this.style.background='var(--surface3)'" onclick="openVPanel('${v.id}')">
      </td>
      <td class="org-td org-td-fixed org-td-fixed-title org-col-sep" onclick="openVPanel('${v.id}')">
        <div class="org-title-text">${v.title}</div>
      </td>
      ${scrollCells}
    </tr>`;
  }).join('');
  syncOrgColHeaders();
  requestAnimationFrame(adjustOrgTableHeight);
}

// ═══ Column headers sync ═══

export function syncOrgColHeaders() {
  const thead = document.querySelector('.org-table thead tr');
  if (!thead) return;
  [...thead.querySelectorAll('th[data-col]')].forEach(el => el.remove());
  const tagCols = {tb:'tb', action:'action', position:'position', technique:'tech'};
  orgColOrder.filter(col => orgColVisibility[col] !== false).forEach(col => {
    const th = document.createElement('th');
    th.className = 'org-th org-th-draggable';
    th.dataset.col = col;
    th.id = 'org-th-' + col;
    th.draggable = true;
    th.style.minWidth = ORG_COL_WIDTHS[col] || '120px';
    /* position:sticky はCSSクラス org-th で設定 - ここでrelativeを上書きしない */
    // ソート対応列の設定
    const sortableCols = ['channel','playlist','prio','addedAt','duration','fav','tb','action','position','technique'];
    if (tagCols[col]) {
      th.style.cursor = 'pointer';
      th.title = ORG_COL_LABELS[col] + 'フィルターを開く / クリックでソート';
      const fk = tagCols[col];
      const colKey = col;
      th.addEventListener('click', e => {
        if(e.target.closest('.rh')) return;
        if (e.target === th || e.target.tagName === 'SPAN') { orgSetSort(col); return; }
        openTagFilterFor(colKey, fk, th);
      });
    } else if (sortableCols.includes(col)) {
      th.style.cursor = 'pointer';
      th.title = 'クリックでソート';
      th.addEventListener('click', e => { if(e.target.closest('.rh')) return; orgSetSort(col); });
    }
    // ソートインジケーター
    const sortIndicator = document.createElement('span');
    sortIndicator.className = 'org-sort-ind';
    sortIndicator.dataset.sortCol = col;
    sortIndicator.style.cssText = 'margin-left:3px;font-size:9px;opacity:.4;';
    sortIndicator.textContent = orgSortCol === col ? (orgSortAsc ? '▲' : '▼') : '⇅';
    if (orgSortCol === col) sortIndicator.style.opacity = '1';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = ORG_COL_LABELS[col] || col;
    th.textContent = '';
    th.appendChild(labelSpan);
    th.appendChild(sortIndicator);
    thead.appendChild(th);
  });
  bindOrgDrag();
  initOrgResize();
}

// ─── Organizeテーブル: ソート ───
export function orgSetSort(col) {
  try {
    if (orgSortCol === col) {
      orgSortAsc = !orgSortAsc;
    } else {
      orgSortCol = col;
      orgSortAsc = true;
    }
    renderOrg();
  } catch(e) { console.error('orgSetSort error:', e); }
}

// ─── Organizeテーブル: Favトグル ───
export function orgTogFav(id) {
  try {
    const videos = window.videos || [];
    const v = videos.find(v => v.id === id);
    if (!v) return;
    v.fav = !v.fav;
    // ★ボタンだけ即時更新（再描画なしで高速）
    const tr = document.getElementById('org-row-' + id);
    if (tr) {
      const btn = tr.querySelector('[onclick*="orgTogFav"]');
      if (btn) {
        btn.textContent = v.fav ? '★' : '☆';
        btn.title = v.fav ? 'Favを外す' : 'Favに追加';
      }
    }
    window.debounceSave?.();
  } catch(e) { console.error('orgTogFav error:', e); }
}

// ─── Organizeテーブル: 列幅リサイズ（mouse + touch対応）───
export function initOrgResize() {
  try {
    const table = document.querySelector('.org-table');
    if (!table) return;

    // 既存のリサイズハンドルを削除
    table.querySelectorAll('.rh').forEach(el => el.remove());

    // スクロール列（data-col属性のth）にリサイズハンドルを追加
    table.querySelectorAll('th[data-col]').forEach(th => {
      addResizeHandle(th, col => {
        ORG_COL_WIDTHS[col] = th.offsetWidth + 'px';
      });
    });

    // 固定列titleにもリサイズハンドルを追加
    const titleTh = table.querySelector('th[data-fixed="title"]');
    if (titleTh) {
      addResizeHandle(titleTh, () => {
        // CSS変数で固定列幅を更新
        const w = titleTh.offsetWidth;
        titleTh.style.width = w + 'px';
        titleTh.style.minWidth = w + 'px';
        // tdも更新
        document.querySelectorAll('.org-td-fixed-title').forEach(td => {
          td.style.width = w + 'px';
          td.style.minWidth = w + 'px';
          td.style.maxWidth = w + 'px';
        });
      });
    }
  } catch(e) { console.error('initOrgResize error:', e); }
}

export function addResizeHandle(th, onResize) {
  const rh = document.createElement('div');
  rh.className = 'rh';
  th.appendChild(rh);

  let startX = 0, startW = 0, dragging = false;
  const col = th.dataset.col;

  function startDrag(x) {
    dragging = true;
    startX = x;
    startW = th.offsetWidth;
    document.body.style.userSelect = 'none';
    rh.style.background = 'var(--accent)';
    rh.style.opacity = '0.6';
  }
  function doDrag(x) {
    if (!dragging) return;
    const newW = Math.max(60, startW + (x - startX));
    th.style.width = newW + 'px';
    th.style.minWidth = newW + 'px';
    // 同列のtdも更新
    if (col) {
      const table = th.closest('table');
      if (table) {
        const colIdx = [...th.parentNode.children].indexOf(th);
        table.querySelectorAll('tbody tr').forEach(tr => {
          const td = tr.children[colIdx];
          if (td) { td.style.width = newW + 'px'; td.style.minWidth = newW + 'px'; }
        });
      }
    }
    if (onResize) onResize(col);
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    rh.style.background = '';
    rh.style.opacity = '';
  }

  rh.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); startDrag(e.clientX); });
  document.addEventListener('mousemove', e => doDrag(e.clientX));
  document.addEventListener('mouseup', endDrag);

  rh.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); startDrag(e.touches[0].clientX); }, {passive:false});
  document.addEventListener('touchmove', e => { if(dragging){ e.preventDefault(); doDrag(e.touches[0].clientX); } }, {passive:false});
  document.addEventListener('touchend', endDrag);
}

// ─── Organizeテーブル: 行選択 ───
export function orgTogSel(id, cb) {
  const selIds = window.selIds || new Set();
  const bulkMode = window.bulkMode || false;
  if (cb.checked && !bulkMode) {
    // 初回チェックで一括編集モードを自動起動（selIdsを保持）
    selIds.add(id); // 先に追加してからpreserveSel=trueで起動
    window.enterBulk?.('organize', true);
    const rowCb = document.getElementById('org-cb-' + id);
    if (rowCb) rowCb.checked = true;
    const total = document.querySelectorAll('[id^="org-row-"]').length;
    const selAllCb = document.getElementById('org-sel-all');
    if (selAllCb) selAllCb.checked = selIds.size === total && total > 0;
    window.updBulk?.();
    return;
  }
  cb.checked ? selIds.add(id) : selIds.delete(id);
  // 全選択チェックボックスの状態を更新
  const total = document.querySelectorAll('[id^="org-row-"]').length;
  const selAllCb = document.getElementById('org-sel-all');
  if (selAllCb) selAllCb.checked = selIds.size === total && total > 0;
  window.updBulk?.();
}

export function orgTogSelAll(cb) {
  const selIds = window.selIds || new Set();
  const bulkMode = window.bulkMode || false;
  document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
    const id = tr.id.replace('org-row-', '');
    cb.checked ? selIds.add(id) : selIds.delete(id);
    const rowCb = tr.querySelector('input[type=checkbox]');
    if (rowCb) rowCb.checked = cb.checked;
  });
  if (cb.checked && selIds.size > 0 && !bulkMode) {
    // preserveSel=true でselIdsを保持したままenterBulk
    window.enterBulk?.('organize', true);
  } else if (!cb.checked) {
    selIds.clear();
    window.updBulk?.();
  } else {
    window.updBulk?.();
  }
}

// ─── 列メニュー ───
export function toggleOrgColMenu() {
  let menu = document.getElementById('org-col-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.id = 'org-col-menu';
  menu.style.cssText = 'position:fixed;z-index:290;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:160px';
  // ⚙ボタンの位置を基準に表示
  const gear = document.querySelector('.org-settings-btn');
  const r = gear ? gear.getBoundingClientRect() : {left:10, bottom:40};
  menu.style.left = r.left + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.innerHTML = '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">表示する列</div>' +
    orgColOrder.map(col => `
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:4px 0">
        <input type="checkbox" ${orgColVisibility[col]!==false?'checked':''} onchange="orgColVisibility['${col}']=this.checked;_saveOrgColPrefs();renderOrg()" style="accent-color:var(--accent);width:14px;height:14px">
        ${ORG_COL_LABELS[col]||col}
      </label>`).join('');
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function h(e){
    if(!menu.contains(e.target)&&!e.target.closest('.org-settings-btn')){menu.remove();document.removeEventListener('click',h);}
  }, 100));
}

export function bindOrgDrag() {
  let dragSrc = null;
  document.querySelectorAll('.org-th-draggable').forEach(th => {
    th.ondragstart = e => {
      dragSrc = th.dataset.col;
      th.classList.add('org-th-dragging');
      e.dataTransfer.effectAllowed = 'move';
    };
    th.ondragend = () => {
      document.querySelectorAll('.org-th-draggable').forEach(el => {
        el.classList.remove('org-th-dragging', 'org-th-drag-over');
      });
    };
    th.ondragover = e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.org-th-draggable').forEach(el => el.classList.remove('org-th-drag-over'));
      if (th.dataset.col !== dragSrc) th.classList.add('org-th-drag-over');
    };
    th.ondrop = e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === th.dataset.col) return;
      const from = orgColOrder.indexOf(dragSrc);
      const to   = orgColOrder.indexOf(th.dataset.col);
      if (from < 0 || to < 0) return;
      orgColOrder.splice(from, 1);
      orgColOrder.splice(to, 0, dragSrc);
      _saveOrgColPrefs();
      renderOrg();
    };
  });
}

// ── 整理タブ タグ列クリックでフィルターを開く ──
export function openTagFilterFor(colKey, filterKey, thEl, highlightTag) {
  // Organize個別セルからは何もしない（VPanelからのみ編集）
  return;
}

// ═══ Register all exported functions on window for inline HTML handler access ═══
window._saveOrgColPrefs = _saveOrgColPrefs;
window.initOrgFixedHeaders = initOrgFixedHeaders;
window.togOrgF = togOrgF;
window.togOrgFav = togOrgFav;
window.togOrgUnw = togOrgUnw;
window.togOrgWatched = togOrgWatched;
window.togOrgBm = togOrgBm;
window.togOrgMemo = togOrgMemo;
window.buildOrgFovRows = buildOrgFovRows;
window.clearOrgFilters = clearOrgFilters;
window.orgFilt = orgFilt;
window.openOrgFilterOverlay = openOrgFilterOverlay;
window.closeOrgFilterOverlay = closeOrgFilterOverlay;
window.syncOrgFilterOvRows = syncOrgFilterOvRows;
window.buildOrgSrow = buildOrgSrow;
window.mkOrgChip = mkOrgChip;
window.showOrgFsBulkBtn = showOrgFsBulkBtn;
window.toggleOrgAcc = toggleOrgAcc;
window.renderOrgAccChips = renderOrgAccChips;
window.filterOrgAccChips = filterOrgAccChips;
window.openOrgPos = openOrgPos;
window.renderOrgPos = renderOrgPos;
window.togOrgPos = togOrgPos;
window.openOrgPL = openOrgPL;
window.renderOrgPL = renderOrgPL;
window.togOrgPL = togOrgPL;
window.openOrgTF = openOrgTF;
window.renderOrgTF = renderOrgTF;
window.togOrgTech = togOrgTech;
window.openOrgChPicker = openOrgChPicker;
window.renderOrgChPicker = renderOrgChPicker;
window.togOrgCh = togOrgCh;
window.closeOrgOv = closeOrgOv;
window.adjustOrgTableHeight = adjustOrgTableHeight;
window.renderOrg = renderOrg;
window.syncOrgColHeaders = syncOrgColHeaders;
window.orgSetSort = orgSetSort;
window.orgTogFav = orgTogFav;
window.initOrgResize = initOrgResize;
window.addResizeHandle = addResizeHandle;
window.orgTogSel = orgTogSel;
window.orgTogSelAll = orgTogSelAll;
window.toggleOrgColMenu = toggleOrgColMenu;
window.bindOrgDrag = bindOrgDrag;
window.openTagFilterFor = openTagFilterFor;
window.ORG_COL_LABELS = ORG_COL_LABELS;
window.ORG_COL_WIDTHS = ORG_COL_WIDTHS;
