// organize.js — Organize tab functions as ES module

// ═══ Module-level state (exported + registered on window) ═══
export let orgFilters = {
  prio: new Set(), tb: new Set(), action: new Set(), position: new Set(),
  playlist: new Set(), status: new Set(), tech: new Set(),
  platform: new Set(), channel: new Set(),
  fav: new Set(), memo: new Set(), addedAtFilter: new Set(), durationFilter: new Set()
};
export let orgFavOnly = false, orgNextOnly = false, orgUnwOnly = false, orgWatchedOnly = false, orgBmOnly = false, orgMemoOnly = false, orgImgOnly = false;
export let orgPrRank = null, orgPrDate = null;
const _ORG_DEFAULT_ORDER = ['fav', 'next', 'tb', 'action', 'position', 'technique', 'counter', 'channel', 'playlist', 'addedAt', 'duration', 'memo'];
const _ORG_DEFAULT_VIS   = {tb: true, action: true, position: true, technique: true, counter: true, channel: true, playlist: true, memo: true, addedAt: true, fav: true, next: true, duration: true};
const _ORG_DEFAULT_WIDTHS = {tb:'110px', action:'120px', position:'120px', technique:'120px', counter:'100px', channel:'110px', playlist:'120px', memo:'160px', addedAt:'90px', fav:'52px', next:'52px', duration:'64px'};
function _loadOrgColPrefs() {
  try {
    const o = localStorage.getItem('wk_orgColOrder');
    const v = localStorage.getItem('wk_orgColVisibility');
    const w = localStorage.getItem('wk_orgColWidths');
    let order  = o ? JSON.parse(o) : [..._ORG_DEFAULT_ORDER];
    let vis    = v ? JSON.parse(v) : {..._ORG_DEFAULT_VIS};
    let widths = w ? {..._ORG_DEFAULT_WIDTHS, ...JSON.parse(w)} : {..._ORG_DEFAULT_WIDTHS};
    // マイグレーション v3: prio完全削除, counter/next追加
    const MIGRATE_VER = 'orgcol_v3';
    if (!localStorage.getItem(MIGRATE_VER)) {
      order = [..._ORG_DEFAULT_ORDER];
      vis   = {..._ORG_DEFAULT_VIS};
      // 古いバージョンフラグも削除
      try { localStorage.removeItem('orgcol_v2'); } catch(e) {}
      try {
        localStorage.setItem('wk_orgColOrder', JSON.stringify(order));
        localStorage.setItem('wk_orgColVisibility', JSON.stringify(vis));
        localStorage.setItem(MIGRATE_VER, '1');
      } catch(e) {}
    }
    // 万一prioが残っていたら強制除去
    if (order.includes('prio')) {
      order = order.filter(c => c !== 'prio');
      delete vis.prio;
      try { localStorage.setItem('wk_orgColOrder', JSON.stringify(order)); } catch(e) {}
    }
    return { order, vis, widths };
  } catch(e) { return { order: [..._ORG_DEFAULT_ORDER], vis: {..._ORG_DEFAULT_VIS}, widths: {..._ORG_DEFAULT_WIDTHS} }; }
}
const _orgPrefs = _loadOrgColPrefs();
export let orgColOrder = _orgPrefs.order;
export let orgColVisibility = _orgPrefs.vis;
function _saveOrgColPrefs() {
  try {
    localStorage.setItem('wk_orgColOrder', JSON.stringify(orgColOrder));
    localStorage.setItem('wk_orgColVisibility', JSON.stringify(orgColVisibility));
    localStorage.setItem('wk_orgColWidths', JSON.stringify(ORG_COL_WIDTHS));
  } catch(e) {}
  window.saveUserSettings?.();
}
export const ORG_COL_LABELS = {tb:'トップ/ボトム', action:'カテゴリ', position:'ポジション', technique:'タグ', counter:'カウンター', channel:'Channel', playlist:'Playlist', memo:'要約/メモ', addedAt:'追加日', fav:'★ Fav', next:'🎯 Next', duration:'長さ'};
export const ORG_COL_WIDTHS = _orgPrefs.widths;
export let orgSortCol = null, orgSortAsc = true;
let _orgFixedLefts = {chk:0, thumb:40, ch:116, title:246};

// Register state on window so inline HTML handlers can access them
window.orgFilters = orgFilters;
Object.defineProperty(window, 'orgFavOnly',     {get: () => orgFavOnly,     set: v => { orgFavOnly = v; }});
Object.defineProperty(window, 'orgUnwOnly',     {get: () => orgUnwOnly,     set: v => { orgUnwOnly = v; }});
Object.defineProperty(window, 'orgWatchedOnly', {get: () => orgWatchedOnly, set: v => { orgWatchedOnly = v; }});
Object.defineProperty(window, 'orgBmOnly',      {get: () => orgBmOnly,      set: v => { orgBmOnly = v; }});
Object.defineProperty(window, 'orgMemoOnly',    {get: () => orgMemoOnly,    set: v => { orgMemoOnly = v; }});
Object.defineProperty(window, 'orgImgOnly',     {get: () => orgImgOnly,     set: v => { orgImgOnly = v; }});
Object.defineProperty(window, 'orgPrRank',     {get: () => orgPrRank,     set: v => { orgPrRank = v; }});
Object.defineProperty(window, 'orgPrDate',     {get: () => orgPrDate,     set: v => { orgPrDate = v; }});
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

export function togOrgNext() {
  orgNextOnly = !orgNextOnly;
  ['org-fs-chip-next','org-fov-chip-next'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgNextOnly); });
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

export function togOrgImg() {
  orgImgOnly = !orgImgOnly;
  ['org-fov-chip-img','org-fs-chip-img'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgImgOnly); });
  renderOrg();
}

export function clearOrgFilters() {
  Object.keys(orgFilters).forEach(k => orgFilters[k].clear());
  orgFavOnly = false; orgNextOnly = false; orgUnwOnly = false; orgWatchedOnly = false; orgBmOnly = false; orgMemoOnly = false; orgImgOnly = false;
  orgPrRank = null; orgPrDate = null;
  const si = document.getElementById('si-org'); if(si) si.value = '';
  const siPc = document.getElementById('si-org-pc'); if(siPc) siPc.value = '';
  syncOrgFilterOvRows();
  document.querySelectorAll('[id^="org-fs-"]').forEach(el => el.classList.remove('active'));
  window.refreshOpenSbAccordions?.('org');
  renderOrg();
}

// (空白) 対応フィルターマッチ
function _matchFilt(filterSet, values) {
  if (!filterSet.size) return true;
  return values.length ? values.some(v => filterSet.has(v)) : filterSet.has('(空白)');
}

// ── 検索演算子パーサー ──
// 対応: -除外  "完全一致"  title:xxx  ch:xxx  pl:xxx  tech:xxx  memo:xxx
export function _parseQuery(raw) {
  const result = { includes: [], excludes: [], fields: {} };
  if (!raw) return result;
  // フィールド指定: title:xxx ch:xxx pl:xxx tech:xxx memo:xxx
  const fieldRe = /\b(title|ch|pl|tech|memo):(\S+)/gi;
  let cleaned = raw.replace(fieldRe, (_, f, val) => {
    if (!result.fields[f.toLowerCase()]) result.fields[f.toLowerCase()] = [];
    result.fields[f.toLowerCase()].push(val.toLowerCase());
    return '';
  });
  // "完全一致"
  const exactRe = /"([^"]+)"/g;
  cleaned = cleaned.replace(exactRe, (_, phrase) => {
    result.includes.push({ text: phrase.toLowerCase(), exact: true });
    return '';
  });
  // 残りをスペースで分割、-で始まるものは除外
  cleaned.trim().split(/\s+/).filter(Boolean).forEach(w => {
    if (w.startsWith('-') && w.length > 1) {
      result.excludes.push(w.slice(1).toLowerCase());
    } else {
      result.includes.push({ text: w.toLowerCase(), exact: false });
    }
  });
  return result;
}

export function _matchQueryField(v, text, exact, fields) {
  // fields: アドバンスドサーチで指定された検索対象 (null=全部)
  const fTitle = !fields || fields.title;
  const fCh    = !fields || fields.ch;
  const fPl    = !fields || fields.pl;
  const fTech  = !fields || fields.tech;
  const fMemo  = !fields || fields.memo;
  const title = (v.title||'').toLowerCase();
  const ch    = (v.channel||v.ch||'').toLowerCase();
  const pl    = (v.pl||'').toLowerCase();
  // 「タグ」フィールドは 4層タグ(tb/cat/pos/tags)
  const tagWords = [
    ...(v.tb   || []),
    ...(v.cat  || []),
    ...(v.pos  || []),
    ...(v.tags || [])
  ].map(t => String(t).toLowerCase());
  const memo  = (v.memo||'').toLowerCase();
  if ((fTitle && title.includes(text)) || (fCh && ch.includes(text))
      || (fPl && pl.includes(text)) || (fTech && tagWords.some(t => t.includes(text)))
      || (fMemo && memo.includes(text))) return true;

  // ── 日英バイリンガル検索 (デラヒーバ ↔ De La Riva ↔ DLR 等) ──
  // tag-master の _norm + alias インデックスを用いて pos/cat を全別名に展開してマッチ
  const norm = window._normTag;
  if (!fTech || !norm) return false;
  const nText = norm(text);
  if (!nText) return false;
  const aliasKeys = [];
  if (window.findPosition) {
    for (const p of (v.pos || [])) {
      const def = window.findPosition(p);
      if (def) aliasKeys.push(...[def.id, def.ja, def.en, ...(def.aliases || [])]);
    }
  }
  if (window.findCategory) {
    for (const c of (v.cat || [])) {
      const def = window.findCategory(c);
      if (def) aliasKeys.push(...[def.id, def.name, ...(def.aliases || [])]);
    }
  }
  return aliasKeys.some(k => {
    const nk = norm(k);
    return nk && nk.includes(nText);
  });
}

export function _matchFieldSpecific(v, field, values) {
  const map = {
    title: (v.title||'').toLowerCase(),
    ch: (v.channel||v.ch||'').toLowerCase(),
    pl: (v.pl||'').toLowerCase(),
    tech: (v.tags||[]).map(t => t.toLowerCase()).join(' '),
    memo: (v.memo||'').toLowerCase()
  };
  const target = map[field] || '';
  return values.every(val => target.includes(val));
}

// アドバンスドサーチ状態
let _advSearch = null; // { include, exclude, fields, durMin, durMax, dateFrom, dateTo, source, status }

export function orgFilt(list) {
  const siEl = document.getElementById('si-org');
  const siPcEl = document.getElementById('si-org-pc');
  const raw = ((siEl?siEl.value:'') || (siPcEl?siPcEl.value:'')).trim();
  const parsed = _parseQuery(raw);
  const adv = _advSearch;
  const advFields = adv?.fields || null;
  return list.filter(v => {
    if (v.archived) return false;
    if (orgFavOnly     && !v.fav) return false;
    if (orgNextOnly    && !v.next) return false;
    if (orgUnwOnly     && v.watched) return false;
    if (orgWatchedOnly && !v.watched) return false;
    if (orgBmOnly      && !(v.bookmarks && v.bookmarks.length > 0)) return false;
    if (orgMemoOnly    && !v.memo) return false;
    if (orgImgOnly     && !(v.snapshots && v.snapshots.length > 0)) return false;
    if (orgFilters.platform.size && !orgFilters.platform.has(v.pt)) return false;
    // ── 検索演算子 ──
    // includes: すべてマッチ必須 (AND)
    for (const inc of parsed.includes) {
      if (!_matchQueryField(v, inc.text, inc.exact, advFields)) return false;
    }
    // excludes: 1つでもマッチしたら除外
    for (const exc of parsed.excludes) {
      if (_matchQueryField(v, exc, false, null)) return false;
    }
    // フィールド指定: title:xxx など
    for (const [field, vals] of Object.entries(parsed.fields)) {
      if (!_matchFieldSpecific(v, field, vals)) return false;
    }
    // ── アドバンスドサーチ追加条件 ──
    if (adv) {
      if (adv.durMin != null) { const s = v.duration||0; if (s < adv.durMin * 60) return false; }
      if (adv.durMax != null) { const s = v.duration||0; if (s > adv.durMax * 60) return false; }
      if (adv.dateFrom) { if (!v.addedAt || v.addedAt < adv.dateFrom) return false; }
      if (adv.dateTo)   { if (!v.addedAt || v.addedAt > adv.dateTo + 'T23:59:59') return false; }
      if (adv.source)   { if (v.pt !== adv.source) return false; }
      if (adv.status === 'fav'     && !v.fav) return false;
      if (adv.status === 'unseen'  && v.watched) return false;
      if (adv.status === 'watched' && !v.watched) return false;
      if (adv.status === 'bm'      && !(v.bookmarks?.length)) return false;
      if (adv.status === 'memo'    && !v.memo) return false;
    }
    if (orgFilters.playlist.size && !_matchFilt(orgFilters.playlist, v.pl ? [v.pl] : [])) return false;
    if (orgFilters.prio.size && !orgFilters.prio.has(v.prio)) return false;
    if (orgFilters.status.size && !orgFilters.status.has(v.status)) return false;
    if (orgFilters.tb.size && !_matchFilt(orgFilters.tb, v.tb||[])) return false;
    if (orgFilters.action.size && !_matchFilt(orgFilters.action, v.cat||[])) return false;
    if (orgFilters.position.size && !_matchFilt(orgFilters.position, v.pos||[])) return false;
    if (orgFilters.tech.size && !_matchFilt(orgFilters.tech, v.tags||[])) return false;
    if (orgFilters.channel.size && !_matchFilt(orgFilters.channel, (v.channel||v.ch) ? [v.channel||v.ch] : [])) return false;
    // 練習ランク / 最終練習日
    if (orgPrRank != null && window.vpCntRank) {
      if (String(window.vpCntRank(v.practice).lv) !== String(orgPrRank)) return false;
    }
    if (orgPrDate) {
      const lp = v.lastPracticed || 0;
      const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
      if (orgPrDate === 'week'  && !(lp && days <= 7))  return false;
      if (orgPrDate === 'month' && !(lp && days <= 30)) return false;
      if (orgPrDate === 'stale' && !(lp && days > 30))  return false;
      if (orgPrDate === 'never' && lp)                  return false;
    }
    if (orgFilters.fav.size) {
      const favVal = v.fav ? '★ Fav' : '☆ 未Fav';
      if (!orgFilters.fav.has(favVal)) return false;
    }
    if (orgFilters.memo.size) {
      const memoVal = v.memo ? 'あり' : 'なし';
      if (!orgFilters.memo.has(memoVal)) return false;
    }
    if (orgFilters.addedAtFilter.size) {
      const ym = v.addedAt ? (() => { const d = new Date(v.addedAt); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })() : '不明';
      if (!orgFilters.addedAtFilter.has(ym)) return false;
    }
    if (orgFilters.durationFilter.size) {
      const s = v.duration || 0;
      const bucket = !s ? '不明' : s < 300 ? '〜5分' : s < 900 ? '5〜15分' : s < 1800 ? '15〜30分' : '30分以上';
      if (!orgFilters.durationFilter.has(bucket)) return false;
    }
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
  const all=[...new Set([...(window.TECH || []),...videos.flatMap(v=>v.tags||[])])].sort();
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
  _closeOrgInlineEditor(false);
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
    else if (orgSortCol === 'status')         { const o={'未着手':0,'練習中':1,'マスター':2}; av=o[a.status]??0; bv=o[b.status]??0; }
    else if (orgSortCol === 'lastPlayed')    { av=a.lastPlayed||0; bv=b.lastPlayed||0; }
    else if (orgSortCol === 'playCount')     { av=a.playCount||0; bv=b.playCount||0; }
    else if (orgSortCol === 'practice')      { av=a.practice||0; bv=b.practice||0; }
    else if (orgSortCol === 'views')         { av=a.views||0; bv=b.views||0; }
    else if (orgSortCol === 'lastPracticed') { av=a.lastPracticed||0; bv=b.lastPracticed||0; }
    else return 0;
    if (av < bv) return orgSortAsc ? -1 : 1;
    if (av > bv) return orgSortAsc ? 1 : -1;
    return 0;
  }

  const displayList = [...list].sort(orgSortFn);

  // Organizeタブのフィルター結果を「次の動画」リストに反映
  window.filteredVideos = displayList;

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
    const _gdId = (v.id||'').replace(/^gd-/,'');
    const thumb = v.pt === 'youtube'
      ? (v.thumb || `https://img.youtube.com/vi/${_ytId}/mqdefault.jpg`)
      : v.pt === 'gdrive'
      ? (v.thumb && !v.thumb.includes('drive.google.com/thumbnail') ? v.thumb : '')
      : v.pt === 'x'
      ? (v.thumb || '')
      : (v.thumb || `https://vumbnail.com/${_vmId}.jpg`);

    const prio = v.prio || '保留';
    const prioCols = {'今すぐ':['#fdecea','#ff5252'],'そのうち':['#e3f2fd','#42a5f5'],'保留':['#fff8e1','#f59e0b']};
    const [prioBg, prioColor] = prioCols[prio];

    const mkTagCell = (items, filterKey, colKey) => {
      const chips = items.map(t =>
        `<span class="org-tag-chip">${t}</span>`
      ).join('');
      return `<td class="org-td" data-col="${colKey}" style="overflow:hidden">
        <div class="org-tag-cell">${chips || '<span style="font-size:10px;color:var(--text3)">—</span>'}</div>
      </td>`;
    };
    const scrollCells = orgColOrder.filter(col => orgColVisibility[col] !== false).map(col => {
      if (col === 'tb')        return mkTagCell(v.tb||[], 'tb', 'tb');
      if (col === 'action')    return mkTagCell(v.cat||[], 'action', 'action');
      if (col === 'position')  return mkTagCell(v.pos||[], 'position', 'position');
      if (col === 'technique') return mkTagCell(v.tags||[], 'tech', 'technique');
      if (col === 'channel')   return `<td class="org-td" data-col="channel" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.ch||v.channel||'—'}</div></td>`;
      if (col === 'counter') {
        const pc = v.practice || 0;
        const ago = v.lastPracticed ? (window.vpCntFormatAgo?.(v.lastPracticed) || '') : '';
        return `<td class="org-td" data-col="counter" style="white-space:nowrap">
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700">
            <span style="color:${pc > 0 ? '#e8590c' : 'var(--text3)'};${pc === 0 ? 'opacity:.55' : ''}">🥋 ${pc || '未'}</span>
            <span style="font-size:9px;color:var(--text3);font-weight:600">${ago || '—'}</span>
          </div></td>`;
      }
      if (col === 'playlist')  return `<td class="org-td" data-col="playlist" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.pl||'—'}</div></td>`;
      if (col === 'memo')      return `<td class="org-td" data-col="memo" style="overflow:hidden"><div class="org-memo-text">${v.memo||'<span style="color:var(--text3);font-size:10px">—</span>'}</div></td>`;
      if (col === 'fav')       return `<td class="org-td" data-col="fav" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogFav('${v.id}')" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:4px;transition:transform .1s" title="${v.fav?'Favを外す':'Favに追加'}">${v.fav?'★':'☆'}</button></td>`;
      if (col === 'next')      return `<td class="org-td" data-col="next" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogNext('${v.id}')" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:4px;transition:transform .1s" title="${v.next?'Next解除':'Nextに追加'}">${v.next?'🎯':'○'}</button></td>`;
      if (col === 'addedAt') {
        const d = v.addedAt ? new Date(v.addedAt) : null;
        const ds = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '—';
        return `<td class="org-td" data-col="addedAt" style="font-size:10px;color:var(--text3);white-space:nowrap">${ds}</td>`;
      }
      if (col === 'duration') {
        const sec = v.duration || 0;
        const dur = sec ? `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}` : '—';
        return `<td class="org-td" data-col="duration" style="font-size:11px;color:var(--text3);white-space:nowrap;text-align:right">${dur}</td>`;
      }
      // 未知のカラム → 空セルを返してヘッダーとのずれを防ぐ
      return `<td class="org-td" data-col="${col}" style="font-size:10px;color:var(--text3)">—</td>`;
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
  _bindOrgInlineEdit();
  // フィルターアイコンを全列同期
  Object.keys(_colFilterConfig).forEach(c => _syncFiltIcon(c));
}

// ═══ Column headers sync ═══

export function syncOrgColHeaders() {
  const thead = document.querySelector('.org-table thead tr');
  if (!thead) return;
  [...thead.querySelectorAll('th[data-col]')].forEach(el => el.remove());
  orgColOrder.filter(col => orgColVisibility[col] !== false).forEach(col => {
    const th = document.createElement('th');
    th.className = 'org-th org-th-draggable';
    th.dataset.col = col;
    th.id = 'org-th-' + col;
    th.draggable = true;
    const cw = ORG_COL_WIDTHS[col] || '120px';
    th.style.width = cw;
    th.style.maxWidth = cw;
    th.style.minWidth = '0';
    /* position:sticky はCSSクラス org-th で設定 - ここでrelativeを上書きしない */
    // 全列: クリックで並替え＋フィルタードロップダウンを開く
    th.style.cursor = 'pointer';
    th.title = 'クリックでソート・フィルター';
    th.addEventListener('click', e => {
      if (e.target.closest('.rh')) return;
      openOrgColFilter(col, th);
    });
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
    // フィルターアクティブインジケーター
    const filtCfg = _colFilterConfig[col];
    if (filtCfg) {
      const hasActive = orgFilters[filtCfg.filterKey] && orgFilters[filtCfg.filterKey].size > 0;
      const filtIcon = document.createElement('span');
      filtIcon.className = 'org-filt-icon';
      filtIcon.textContent = '▾';
      filtIcon.style.cssText = `margin-left:2px;font-size:9px;opacity:${hasActive?'1':'0.4'};color:${hasActive?'var(--accent)':'var(--text3)'}`;
      th.appendChild(filtIcon);
    }
    thead.appendChild(th);
  });
  // テーブル幅を全列の合計に明示設定（width:max-contentによる列幅の再分配を防止）
  const table = thead.closest('table');
  if (table) {
    const fixedW = 40 + 76 + 180; // chk + thumb + title
    let scrollW = 0;
    thead.querySelectorAll('th[data-col]').forEach(th => {
      scrollW += th.offsetWidth || parseInt(th.style.width) || 120;
    });
    table.style.width = (fixedW + scrollW) + 'px';
  }
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

export function orgTogNext(id) {
  try {
    const v = (window.videos || []).find(v => v.id === id);
    if (!v) return;
    v.next = !v.next;
    // Next ON → Fav自動ON
    if (v.next && !v.fav) v.fav = true;
    // 🎯ボタン即時更新
    const tr = document.getElementById('org-row-' + id);
    if (tr) {
      const btn = tr.querySelector('[onclick*="orgTogNext"]');
      if (btn) {
        btn.textContent = v.next ? '🎯' : '○';
        btn.title = v.next ? 'Next解除' : 'Nextに追加';
      }
      // Fav自動ONの場合、Favボタンも更新
      if (v.next) {
        const favBtn = tr.querySelector('[onclick*="orgTogFav"]');
        if (favBtn) { favBtn.textContent = '★'; favBtn.title = 'Favを外す'; }
      }
    }
    window.debounceSave?.();
  } catch(e) { console.error('orgTogNext error:', e); }
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
      addResizeHandle(th, (col, w) => {
        ORG_COL_WIDTHS[col] = w + 'px';
      }, () => {
        _saveOrgColPrefs();
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

// ── 列リサイズ: グローバルステート（リスナー累積を防止）──
let _resizeDragging = false;
let _resizeStartX = 0;
let _resizeStartW = 0;
let _resizeTh = null;
let _resizeCol = null;
let _resizeOnResize = null;
let _resizeOnEnd = null;

function _resizeStart(th, col, x, onResize, onEnd) {
  _resizeDragging = true;
  _resizeTh = th;
  _resizeCol = col;
  _resizeStartX = x;
  _resizeStartW = th.offsetWidth;
  _resizeOnResize = onResize;
  _resizeOnEnd = onEnd;
  th.draggable = false; // ネイティブドラッグを無効化してmouseupを確実に受ける
  document.body.style.userSelect = 'none';
  const rh = th.querySelector('.rh');
  if (rh) { rh.style.background = 'var(--accent)'; rh.style.opacity = '0.6'; }
}

function _resizeMove(x) {
  if (!_resizeDragging || !_resizeTh) return;
  const newW = Math.max(20, _resizeStartW + (x - _resizeStartX));
  _resizeTh.style.width = newW + 'px';
  _resizeTh.style.maxWidth = newW + 'px';
  _resizeTh.style.minWidth = '0';
  if (_resizeCol) {
    const table = _resizeTh.closest('table');
    if (table) {
      const colIdx = [..._resizeTh.parentNode.children].indexOf(_resizeTh);
      table.querySelectorAll('tbody tr').forEach(tr => {
        const td = tr.children[colIdx];
        if (td) { td.style.width = newW + 'px'; td.style.maxWidth = newW + 'px'; td.style.minWidth = '0'; }
      });
    }
  }
  if (_resizeOnResize) _resizeOnResize(_resizeCol, newW);
}

function _resizeEnd() {
  if (!_resizeDragging) { return; }
  _resizeDragging = false;
  document.body.style.userSelect = '';
  if (_resizeTh) {
    const rh = _resizeTh.querySelector('.rh');
    if (rh) { rh.style.background = ''; rh.style.opacity = ''; }
    _resizeTh.draggable = true; // ドラッグを再有効化
  }
  if (_resizeOnEnd) _resizeOnEnd();
  // テーブル幅を再計算（列幅変更後にテーブル全体の幅を更新）
  if (_resizeTh) {
    const table = _resizeTh.closest('table');
    if (table) {
      const fixedW = 40 + 76 + 180;
      let scrollW = 0;
      table.querySelectorAll('th[data-col]').forEach(th => {
        scrollW += th.offsetWidth || parseInt(th.style.width) || 120;
      });
      table.style.width = (fixedW + scrollW) + 'px';
    }
  }
  _resizeTh = null;
  _resizeCol = null;
  _resizeOnResize = null;
  _resizeOnEnd = null;
}

// グローバルリスナー（1回だけ登録）
document.addEventListener('mousemove', e => _resizeMove(e.clientX));
document.addEventListener('mouseup', _resizeEnd);
document.addEventListener('touchmove', e => { if (_resizeDragging) { e.preventDefault(); _resizeMove(e.touches[0].clientX); } }, {passive: false});
document.addEventListener('touchend', _resizeEnd);

export function addResizeHandle(th, onResize, onEnd) {
  const rh = document.createElement('div');
  rh.className = 'rh';
  th.appendChild(rh);
  const col = th.dataset.col;
  rh.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); _resizeStart(th, col, e.clientX, onResize, onEnd); });
  rh.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); _resizeStart(th, col, e.touches[0].clientX, onResize, onEnd); }, {passive: false});
  rh.addEventListener('dragstart', e => e.preventDefault()); // ネイティブドラッグを完全に防止
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

// ── 整理タブ タグ列クリックでフィルターを開く（後方互換のため残す）──
export function openTagFilterFor(colKey, filterKey, thEl, highlightTag) { return; }

// ═══ Inline cell editing ═══

const _INLINE_COLS = {
  tb:        { field: 'tb',   type: 'tags', opts: () => window.TB_TAGS || [] },
  action:    { field: 'cat',  type: 'tags', opts: () => window.AC_TAGS || [] },
  position:  { field: 'pos',  type: 'tags', opts: () => [...new Set([...(window.POS_TAGS||[]), ...(window.videos||[]).flatMap(v=>v.pos||[])])].sort() },
  technique: { field: 'tags', type: 'tags', opts: () => [...new Set([...(window.TECH||[]), ...(window.videos||[]).flatMap(v=>v.tags||[])])].sort(), allowNew: true },
  memo:      { field: 'memo', type: 'text' },
};

let _orgInlineActive = null; // { videoId, col, td, origHTML, picker }

// タッチ ロングプレス用（名前付き関数で解除可能に）
let _lpTimer = null, _lpXY = null;
function _inlineTouchStart(e) {
  const td = e.target.closest('td.org-td[data-col]');
  if (!td || window.bulkMode) return;
  const t = e.touches[0];
  _lpXY = { x: t.clientX, y: t.clientY };
  _lpTimer = setTimeout(() => {
    _lpTimer = null;
    if (navigator.vibrate) navigator.vibrate(30);
    _handleInlineTrigger({ target: td, preventDefault(){}, stopPropagation(){} });
  }, 500);
}
function _inlineTouchMove(e) {
  if (!_lpTimer || !_lpXY) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - _lpXY.x, t.clientY - _lpXY.y) > 10) { clearTimeout(_lpTimer); _lpTimer = null; }
}
function _inlineTouchEnd() { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } }

function _bindOrgInlineEdit() {
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  // 重複防止: 古いリスナーを外してから再登録（removeEventListenerは同一関数参照なら安全）
  tbody.removeEventListener('dblclick', _handleInlineTrigger);
  tbody.removeEventListener('touchstart', _inlineTouchStart);
  tbody.removeEventListener('touchmove', _inlineTouchMove);
  tbody.removeEventListener('touchend', _inlineTouchEnd);

  tbody.addEventListener('dblclick', _handleInlineTrigger);
  tbody.addEventListener('touchstart', _inlineTouchStart, { passive: true });
  tbody.addEventListener('touchmove', _inlineTouchMove, { passive: true });
  tbody.addEventListener('touchend', _inlineTouchEnd);
}

function _handleInlineTrigger(e) {
  if (window.bulkMode) return;
  const td = e.target.closest ? e.target.closest('td.org-td[data-col]') : e.target;
  if (!td) return;
  const col = td.dataset.col;
  if (!_INLINE_COLS[col]) return;
  // ボタンやリンクの場合はスキップ
  if (e.target.closest && e.target.closest('button,a,input')) return;
  const tr = td.closest('tr.org-tr');
  if (!tr) return;
  const videoId = tr.id.replace('org-row-', '');
  e.preventDefault?.();
  e.stopPropagation?.();
  _openOrgInlineEditor(videoId, col, td);
}

function _openOrgInlineEditor(videoId, col, td) {
  // 既存エディタを閉じる（保存）
  _closeOrgInlineEditor(true);
  const v = (window.videos || []).find(x => x.id === videoId);
  if (!v) return;
  const cfg = _INLINE_COLS[col];
  const origHTML = td.innerHTML;
  td.classList.add('org-td-editing');

  _orgInlineActive = { videoId, col, td, origHTML, picker: null };

  if (cfg.type === 'tags') {
    _openTagPicker(v, cfg, col, td);
  } else {
    _openMemoEditor(v, td);
  }
}

function _openTagPicker(v, cfg, col, td) {
  const field = cfg.field;
  const current = v[field] || [];
  const allOpts = cfg.opts();
  // 既存に無いユーザータグも表示
  const extra = current.filter(t => !allOpts.includes(t));
  const fullOpts = [...extra, ...allOpts];

  const picker = document.createElement('div');
  picker.className = 'org-inline-picker';
  document.body.appendChild(picker);

  // 位置決め
  const rect = td.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  picker.style.left = Math.max(4, left) + 'px';
  picker.style.top = top + 'px';
  // 画面外補正
  requestAnimationFrame(() => {
    const pr = picker.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) picker.style.left = Math.max(4, window.innerWidth - pr.width - 8) + 'px';
    if (pr.bottom > window.innerHeight - 8) picker.style.top = (rect.top - pr.height - 4) + 'px';
  });

  _orgInlineActive.picker = picker;

  // 検索/新規入力（technique のみ）
  let searchBox = null;
  if (cfg.allowNew) {
    searchBox = document.createElement('input');
    searchBox.className = 'org-inline-search';
    searchBox.placeholder = '検索 / 新規追加...';
    picker.appendChild(searchBox);
  }

  // チップ表示エリア
  const chipsEl = document.createElement('div');
  chipsEl.className = 'org-inline-chips';
  picker.appendChild(chipsEl);

  // オプションリスト
  const listEl = document.createElement('div');
  listEl.className = 'org-inline-opts';
  picker.appendChild(listEl);

  const refreshChips = () => {
    const tags = v[field] || [];
    chipsEl.innerHTML = '';
    tags.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'org-inline-chip';
      chip.textContent = t;
      const x = document.createElement('span');
      x.textContent = ' ×';
      x.style.cursor = 'pointer';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        v[field] = (v[field] || []).filter(tag => tag !== t);
        refreshChips();
        renderOpts();
        _inlineSave(v, td, col);
      });
      chip.appendChild(x);
      chipsEl.appendChild(chip);
    });
    if (!tags.length) chipsEl.innerHTML = '<span style="font-size:10px;color:var(--text3)">タグ未設定</span>';
  };

  const renderOpts = (q) => {
    const ql = (q || '').toLowerCase();
    const filtered = ql ? fullOpts.filter(o => o.toLowerCase().includes(ql)) : fullOpts;
    listEl.innerHTML = '';
    if (!filtered.length && !ql) {
      listEl.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:6px;text-align:center">選択肢なし</div>';
      return;
    }
    filtered.forEach(opt => {
      const lbl = document.createElement('label');
      lbl.className = 'org-inline-opt';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (v[field] || []).includes(opt);
      cb.style.cssText = 'accent-color:var(--accent);width:13px;height:13px;flex-shrink:0;cursor:pointer';
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (!v[field]) v[field] = [];
          if (!v[field].includes(opt)) v[field].push(opt);
        } else {
          v[field] = (v[field] || []).filter(t => t !== opt);
        }
        refreshChips();
        _inlineSave(v, td, col);
      });
      const sp = document.createElement('span');
      sp.textContent = opt;
      sp.style.cssText = 'flex:1;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.appendChild(cb);
      lbl.appendChild(sp);
      listEl.appendChild(lbl);
    });
    // 新規追加ボタン（technique + 検索テキストが既存にない場合）
    if (cfg.allowNew && ql && !fullOpts.some(o => o.toLowerCase() === ql)) {
      const addBtn = document.createElement('div');
      addBtn.style.cssText = 'padding:5px 8px;font-size:11px;color:var(--accent);cursor:pointer;border-top:1px solid var(--border);margin-top:4px';
      addBtn.textContent = `＋「${q}」を追加`;
      addBtn.addEventListener('click', () => {
        if (!v[field]) v[field] = [];
        if (!v[field].includes(q)) v[field].push(q);
        if (!fullOpts.includes(q)) fullOpts.push(q);
        searchBox.value = '';
        refreshChips();
        renderOpts('');
        _inlineSave(v, td, col);
      });
      listEl.appendChild(addBtn);
    }
  };

  refreshChips();
  renderOpts('');
  if (searchBox) {
    searchBox.addEventListener('input', () => renderOpts(searchBox.value));
    searchBox.addEventListener('keydown', e => {
      if (e.key === 'Enter' && searchBox.value.trim()) {
        const newTag = searchBox.value.trim();
        if (!v[field]) v[field] = [];
        if (!v[field].includes(newTag)) v[field].push(newTag);
        if (!fullOpts.includes(newTag)) fullOpts.push(newTag);
        searchBox.value = '';
        refreshChips();
        renderOpts('');
        _inlineSave(v, td, col);
        e.preventDefault();
      }
      if (e.key === 'Escape') _closeOrgInlineEditor(false);
    });
    requestAnimationFrame(() => searchBox.focus());
  }

  // 外側クリックで閉じる
  setTimeout(() => {
    const handler = e => {
      if (picker.contains(e.target)) return;
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      _closeOrgInlineEditor(true);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    _orgInlineActive._outsideHandler = handler;
  }, 50);
}

function _openMemoEditor(v, td) {
  const origMemo = v.memo || '';
  td.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'org-inline-memo';
  ta.value = origMemo;
  td.appendChild(ta);
  requestAnimationFrame(() => {
    ta.focus();
    ta.style.height = Math.max(48, td.clientHeight - 8) + 'px';
  });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { _closeOrgInlineEditor(false); e.preventDefault(); }
  });
  ta.addEventListener('blur', () => {
    const newVal = ta.value.trim();
    if (newVal !== origMemo) {
      v.memo = newVal;
      window.debounceSave?.();
    }
    _closeOrgInlineEditor(false);
  });
}

function _inlineSave(v, td, col) {
  window.debounceSave?.();
  // セル内のチップ表示も更新
  _refreshCellDisplay(v, td, col);
}

function _refreshCellDisplay(v, td, col) {
  // renderOrg を呼ばずにセルだけ再描画
  const cfg = _INLINE_COLS[col];
  if (!cfg || cfg.type !== 'tags') return;
  const tags = v[cfg.field] || [];
  const inner = td.querySelector('.org-tag-cell');
  if (!inner) return;
  inner.innerHTML = tags.map(t => `<span class="org-tag-chip">${t}</span>`).join('')
    || '<span style="font-size:10px;color:var(--text3)">—</span>';
}

function _closeOrgInlineEditor(save) {
  if (!_orgInlineActive) return;
  const { td, origHTML, picker, col, videoId, _outsideHandler } = _orgInlineActive;
  // 外側ハンドラー解除
  if (_outsideHandler) {
    document.removeEventListener('mousedown', _outsideHandler);
    document.removeEventListener('touchstart', _outsideHandler);
  }
  // ピッカー削除
  if (picker) picker.remove();
  td.classList.remove('org-td-editing');

  const cfg = _INLINE_COLS[col];
  if (cfg?.type === 'tags') {
    // タグセルを最新値で再描画
    const v = (window.videos || []).find(x => x.id === videoId);
    if (v) {
      const tags = v[cfg.field] || [];
      td.innerHTML = `<div class="org-tag-cell">${tags.map(t => `<span class="org-tag-chip">${t}</span>`).join('') || '<span style="font-size:10px;color:var(--text3)">—</span>'}</div>`;
    }
  } else if (cfg?.type === 'text') {
    const v = (window.videos || []).find(x => x.id === videoId);
    if (v) {
      td.innerHTML = `<div class="org-memo-text">${v.memo || '<span style="color:var(--text3);font-size:10px">—</span>'}</div>`;
    }
  }

  _orgInlineActive = null;
}

// Esc でキャンセル
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _orgInlineActive) _closeOrgInlineEditor(false);
});

// ── 列フィルター設定 ──
const _BLANK = '(空白)';
const _colFilterConfig = {
  tb:             { filterKey: 'tb',             valueGetter: v => { const a = v.tb||[]; return a.length ? a : [_BLANK]; } },
  action:         { filterKey: 'action',         valueGetter: v => { const a = v.cat||[]; return a.length ? a : [_BLANK]; } },
  position:       { filterKey: 'position',       valueGetter: v => { const a = v.pos||[]; return a.length ? a : [_BLANK]; } },
  technique:      { filterKey: 'tech',           valueGetter: v => { const a = v.tags||[]; return a.length ? a : [_BLANK]; } },
  channel:        { filterKey: 'channel',        valueGetter: v => { const c = v.channel||v.ch; return c ? [c] : [_BLANK]; }, panel: true },
  prio:           { filterKey: 'prio',           valueGetter: v => [v.prio || '保留'] },
  playlist:       { filterKey: 'playlist',       valueGetter: v => v.pl ? [v.pl] : [_BLANK], panel: true },
  fav:            { filterKey: 'fav',            valueGetter: v => [v.fav ? '★ Fav' : '☆ 未Fav'] },
  memo:           { filterKey: 'memo',           valueGetter: v => [v.memo ? 'あり'  : 'なし']   },
  addedAt:        { filterKey: 'addedAtFilter',  valueGetter: v => {
    if (!v.addedAt) return ['不明'];
    const d = new Date(v.addedAt);
    return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`];
  }},
  duration:       { filterKey: 'durationFilter', valueGetter: v => {
    const s = v.duration || 0;
    return [!s ? '不明' : s < 300 ? '〜5分' : s < 900 ? '5〜15分' : s < 1800 ? '15〜30分' : '30分以上'];
  }},
};

// duration バケットの並び順
const _durOrder = ['〜5分','5〜15分','15〜30分','30分以上','不明'];

let _openColFilterEl  = null;
let _openColFilterCol = null;

export function closeOrgColFilter() {
  if (_openColFilterEl) { _openColFilterEl.remove(); _openColFilterEl = null; }
  _openColFilterCol = null;
}

export function openOrgColFilter(col, thEl) {
  // 同じ列を再クリック → 閉じる
  const isSame = (_openColFilterCol === col);
  closeOrgColFilter();
  if (isSame) return;
  _openColFilterCol = col;

  const cfg = _colFilterConfig[col];
  const filterKey = cfg ? cfg.filterKey : null;

  // この列以外のフィルターを適用した動画リストから値を集計（コンテキストフィルタ）
  let savedFilter;
  if (filterKey && orgFilters[filterKey]) {
    savedFilter = new Set(orgFilters[filterKey]);
    orgFilters[filterKey].clear();
  }
  const videos = orgFilt((window.videos || []).slice());
  if (filterKey && savedFilter) {
    orgFilters[filterKey] = savedFilter;
  }

  // 一意な値とカウントを集計
  const valueCounts = new Map();
  videos.forEach(v => {
    (cfg ? cfg.valueGetter(v) : []).forEach(val => {
      if (val != null && val !== '') valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
    });
  });
  // ソート（duration列はバケット順、それ以外はアルファベット順）
  const sortedVals = [...valueCounts.keys()].sort((a, b) => {
    if (col === 'duration') {
      return _durOrder.indexOf(a) - _durOrder.indexOf(b);
    }
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  });

  const filterSet = cfg ? (orgFilters[cfg.filterKey] || (orgFilters[cfg.filterKey] = new Set())) : new Set();
  const sortableCols = ['channel','playlist','prio','addedAt','duration','fav','tb','action','position','technique','memo'];

  // ─ ドロップダウン構築 ─
  const dd = document.createElement('div');
  dd.id = 'org-col-filter-dd';
  dd.style.cssText = 'position:fixed;z-index:500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:0 6px 28px rgba(0,0,0,.18);min-width:200px;max-width:360px;display:flex;flex-direction:column;gap:6px;font-size:12px';
  document.body.appendChild(dd);  // 先に追加して幅を取得

  // 位置決め: ヘッダー直下から始めてビューポート内に収める
  const rect = thEl.getBoundingClientRect();
  let left = rect.left;
  const ddW = dd.offsetWidth || 210;
  if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8;
  dd.style.left = Math.max(4, left) + 'px';
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  if (spaceBelow >= 250) {
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.bottom = 'auto';
    dd.style.maxHeight = spaceBelow + 'px';
  } else if (spaceAbove > spaceBelow) {
    dd.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    dd.style.top = 'auto';
    dd.style.maxHeight = spaceAbove + 'px';
  } else {
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.style.bottom = 'auto';
    dd.style.maxHeight = spaceBelow + 'px';
  }

  // ── ソートボタン ──
  if (sortableCols.includes(col)) {
    const sortRow = document.createElement('div');
    sortRow.style.cssText = 'display:flex;gap:6px;padding-bottom:6px;border-bottom:1px solid var(--border)';
    const mkSortBtn = (label, asc) => {
      const btn = document.createElement('button');
      btn.innerHTML = label;
      const isActive = orgSortCol === col && orgSortAsc === asc;
      btn.style.cssText = `flex:1;padding:5px 0;font-size:11px;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;transition:background .1s;background:${isActive?'var(--accent)':'var(--surface2)'};color:${isActive?'#fff':'var(--text2)'}`;
      btn.addEventListener('click', () => {
        orgSortCol = col; orgSortAsc = asc;
        renderOrg();
        closeOrgColFilter();
      });
      return btn;
    };
    sortRow.appendChild(mkSortBtn('▲ 昇順', true));
    sortRow.appendChild(mkSortBtn('▼ 降順', false));
    dd.appendChild(sortRow);
  }

  // ── フィルターセクション ──
  if (cfg && sortedVals.length > 0) {
    const isPanel = !!cfg.panel; // channel / playlist → パネル形式

    // 検索ボックス
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = '検索...';
    searchBox.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface2);color:var(--text);outline:none';
    dd.appendChild(searchBox);

    if (isPanel) {
      // ── パネル形式（Channel / Playlist）──
      // Library サイドバーと完全に同じ buildSbPickerInline を使用
      dd.removeChild(searchBox); // buildSbPickerInline が独自の検索ボックスを持つ
      const panelContainer = document.createElement('div');
      const panelId = '_org-col-picker-' + col;
      panelContainer.id = panelId;
      panelContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow-y:auto;min-height:0';
      dd.appendChild(panelContainer);

      // buildSbPickerInline を 'org' コンテキストで呼び出し
      // （orgFilters を使い、renderOrg を呼ぶ — Library サイドバーと完全に同じ関数）
      window.buildSbPickerInline(panelId, cfg.filterKey, 'org');
    } else {
      // ── チェックボックス形式（タグ系列） ──
      const filtLabel = document.createElement('div');
      filtLabel.style.cssText = 'font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.5px';
      filtLabel.textContent = 'フィルター';
      dd.appendChild(filtLabel);

      // 全選択 / クリアボタン行
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:5px';
      const mkBtn = (label) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'flex:1;padding:3px 0;font-size:10px;border:1.5px solid var(--border);border-radius:5px;background:var(--surface2);cursor:pointer;color:var(--text2)';
        return b;
      };
      const btnSelAll = mkBtn('全選択');
      const btnClear  = mkBtn('クリア');
      btnRow.appendChild(btnSelAll);
      btnRow.appendChild(btnClear);
      dd.appendChild(btnRow);

      // 値リスト
      const listEl = document.createElement('div');
      listEl.style.cssText = 'overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:1px;min-height:50px';
      dd.appendChild(listEl);

      const renderList = (q) => {
        const ql = (q || '').toLowerCase();
        const filtered = ql ? sortedVals.filter(v => v.toLowerCase().includes(ql)) : sortedVals;
        listEl.innerHTML = '';
        if (!filtered.length) {
          listEl.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:6px;text-align:center">該当なし</div>';
          return;
        }
        filtered.forEach(val => {
          const cnt = valueCounts.get(val) || 0;
          const lbl = document.createElement('label');
          lbl.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;padding:3px 5px;border-radius:5px';
          lbl.onmouseover = () => { lbl.style.background = 'var(--surface2)'; };
          lbl.onmouseout  = () => { lbl.style.background = ''; };
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = filterSet.has(val);
          cb.style.cssText = 'accent-color:var(--accent);width:13px;height:13px;flex-shrink:0;cursor:pointer';
          cb.addEventListener('change', () => {
            cb.checked ? filterSet.add(val) : filterSet.delete(val);
            renderOrg();
            _syncFiltIcon(col);
          });
          const txt = document.createElement('span');
          txt.style.cssText = 'flex:1;font-size:11px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all';
          txt.textContent = val;
          txt.title = val || '';
          const cntEl = document.createElement('span');
          cntEl.style.cssText = 'font-size:10px;color:var(--text3);flex-shrink:0';
          cntEl.textContent = cnt;
          lbl.appendChild(cb); lbl.appendChild(txt); lbl.appendChild(cntEl);
          listEl.appendChild(lbl);
        });
      };

      renderList('');
      searchBox.addEventListener('input', () => renderList(searchBox.value));

      btnSelAll.addEventListener('click', () => {
        sortedVals.forEach(v => filterSet.add(v));
        renderList(searchBox.value);
        renderOrg(); _syncFiltIcon(col);
      });
      btnClear.addEventListener('click', () => {
        filterSet.clear();
        renderList(searchBox.value);
        renderOrg(); _syncFiltIcon(col);
      });
    }

    requestAnimationFrame(() => searchBox.focus());
  }

  _openColFilterEl = dd;

  // 外側クリックで閉じる
  setTimeout(() => {
    const closeHandler = (e) => {
      if (_openColFilterEl && !_openColFilterEl.contains(e.target)) {
        closeOrgColFilter();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    document.addEventListener('mousedown', closeHandler);
  }, 50);
}

function _syncFiltIcon(col) {
  const th = document.getElementById('org-th-' + col);
  if (!th) return;
  const icon = th.querySelector('.org-filt-icon');
  if (!icon) return;
  const cfg = _colFilterConfig[col];
  const active = cfg && orgFilters[cfg.filterKey] && orgFilters[cfg.filterKey].size > 0;
  icon.style.color   = active ? 'var(--accent)' : 'var(--text3)';
  icon.style.opacity = active ? '1' : '0.4';
}

// ── 一括リネーム（プレイリスト名の部分文字列を置換）──
export function bulkRenamePl(from, to) {
  const videos = window.videos || [];
  let count = 0;
  videos.forEach(v => {
    if (v.pl && v.pl.includes(from)) {
      v.pl = v.pl.split(from).join(to);
      count++;
    }
  });
  if (count > 0) {
    window.debounceSave?.();
    if (window.AF) window.AF();
    window.showToast?.(`✅ ${count}本の動画のプレイリスト名を更新：「${from}」→「${to}」`);
  } else {
    window.showToast?.('該当する動画がありませんでした');
  }
  return count;
}

// ═══ Register all exported functions on window for inline HTML handler access ═══
window._saveOrgColPrefs = _saveOrgColPrefs;
window.initOrgFixedHeaders = initOrgFixedHeaders;
window.togOrgF = togOrgF;
window.togOrgFav = togOrgFav;
window.togOrgNext = togOrgNext;
window.togOrgUnw = togOrgUnw;
window.togOrgWatched = togOrgWatched;
window.togOrgBm = togOrgBm;
window.togOrgMemo = togOrgMemo;
window.togOrgImg = togOrgImg;
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
window.orgTogNext = orgTogNext;
window.initOrgResize = initOrgResize;
window.addResizeHandle = addResizeHandle;
window.orgTogSel = orgTogSel;
window.orgTogSelAll = orgTogSelAll;
window.toggleOrgColMenu = toggleOrgColMenu;
window.bindOrgDrag = bindOrgDrag;
window.openTagFilterFor = openTagFilterFor;
window.openOrgColFilter  = openOrgColFilter;
window.closeOrgColFilter = closeOrgColFilter;
window.bulkRenamePl      = bulkRenamePl;
window.ORG_COL_LABELS = ORG_COL_LABELS;
window.ORG_COL_WIDTHS = ORG_COL_WIDTHS;

// ═══ アドバンスドサーチ ═══
export function toggleAdvSearch() {
  const ov = document.getElementById('adv-search-overlay');
  if (!ov) return;
  const show = ov.style.display === 'none';
  ov.style.display = show ? '' : 'none';
  // ボタンのスタイル切替（Organize + Library 全ボタン）
  ['adv-search-btn-pc','adv-search-btn-mob','adv-search-btn-lib-pc','adv-search-btn-lib-mob'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (show) { btn.style.background='var(--accent)'; btn.style.color='#fff'; btn.style.borderColor='var(--accent)'; btn.textContent='▲ 詳細検索'; }
    else { btn.style.background='var(--surface)'; btn.style.color='var(--text2)'; btn.style.borderColor='var(--border)'; btn.textContent='🔎 詳細検索'; }
  });
  if (show) document.getElementById('adv-include')?.focus();
}

export function applyAdvSearch() {
  const inc = (document.getElementById('adv-include')?.value || '').trim();
  const exc = (document.getElementById('adv-exclude')?.value || '').trim();
  const durMin = document.getElementById('adv-dur-min')?.value;
  const durMax = document.getElementById('adv-dur-max')?.value;
  const dateFrom = document.getElementById('adv-date-from')?.value || '';
  const dateTo = document.getElementById('adv-date-to')?.value || '';
  const source = document.getElementById('adv-source')?.value || '';
  const status = document.getElementById('adv-status')?.value || '';
  const fields = {
    title: document.getElementById('adv-f-title')?.checked ?? true,
    ch:    document.getElementById('adv-f-ch')?.checked ?? true,
    pl:    document.getElementById('adv-f-pl')?.checked ?? true,
    tech:  document.getElementById('adv-f-tech')?.checked ?? true,
    memo:  document.getElementById('adv-f-memo')?.checked ?? false,
  };

  // 検索ボックスに演算子形式で反映
  let q = '';
  if (inc) q += inc;
  if (exc) exc.split(/\s+/).forEach(w => { if (w) q += ' -' + w; });
  // 検索ボックスに設定
  const siPc = document.getElementById('si-org-pc');
  const siMob = document.getElementById('si-org');
  if (siPc) siPc.value = q.trim();
  if (siMob) siMob.value = q.trim();

  // アドバンスド条件を設定
  _advSearch = {
    fields,
    durMin: durMin ? Number(durMin) : null,
    durMax: durMax ? Number(durMax) : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    source: source || null,
    status: status || null,
  };

  toggleAdvSearch();
  renderOrg();
  // Library タブにも検索ワードを反映
  const siLib = document.getElementById('si-lib-pc');
  const siLibMob = document.getElementById('si');
  if (siLib) siLib.value = q.trim();
  if (siLibMob) siLibMob.value = q.trim();
  window.AF?.();
}

export function clearAdvSearch() {
  ['adv-include','adv-exclude','adv-dur-min','adv-dur-max','adv-date-from','adv-date-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['adv-source','adv-status'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['adv-f-title','adv-f-ch','adv-f-pl','adv-f-tech'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = true;
  });
  const memoEl = document.getElementById('adv-f-memo'); if (memoEl) memoEl.checked = false;
  _advSearch = null;
  const siPc = document.getElementById('si-org-pc');
  const siMob = document.getElementById('si-org');
  if (siPc) siPc.value = '';
  if (siMob) siMob.value = '';
  // Library側もクリア
  const siLib = document.getElementById('si-lib-pc');
  const siLibMob = document.getElementById('si');
  if (siLib) siLib.value = '';
  if (siLibMob) siLibMob.value = '';
  renderOrg();
  window.AF?.();
}

export function saveAdvSearch() {
  applyAdvSearch();
  if (window.saveCurrentSearch) window.saveCurrentSearch();
}

window.toggleAdvSearch = toggleAdvSearch;
window.applyAdvSearch  = applyAdvSearch;
window.clearAdvSearch  = clearAdvSearch;
window.saveAdvSearch   = saveAdvSearch;
