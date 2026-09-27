// organize.js — Organize tab functions as ES module

// ═══ Module-level state (exported + registered on window) ═══
export let orgFilters = {
  tb: new Set(), action: new Set(), position: new Set(),
  playlist: new Set(), status: new Set(), tags: new Set(),
  platform: new Set(), channel: new Set(),
  fav: new Set(), next: new Set(), counter: new Set(),
  memo: new Set(), addedAtFilter: new Set(), durationFilter: new Set()
};
export let orgFavOnly = false, orgNextOnly = false, orgUnwOnly = false, orgWatchedOnly = false, orgBmOnly = false, orgMemoOnly = false, orgImgOnly = false, orgDrillOnly = false;
export let orgMemoSearch = ''; export let orgChannelSearch = ''; export let orgPlaylistSearch = '';
export let orgPrRank = null, orgPrDate = null;
const _ORG_DEFAULT_ORDER = ['fav', 'next', 'drill', 'tb', 'action', 'position', 'technique', 'counter', 'status', 'channel', 'playlist', 'addedAt', 'duration', 'memo'];
const _ORG_DEFAULT_VIS   = {tb: true, action: true, position: true, technique: true, counter: true, status: true, channel: true, playlist: true, memo: true, addedAt: true, fav: true, next: true, drill: true, duration: true};
const _ORG_DEFAULT_WIDTHS = {tb:'110px', action:'120px', position:'120px', technique:'120px', counter:'100px', status:'90px', channel:'110px', playlist:'120px', memo:'160px', addedAt:'90px', fav:'52px', next:'52px', duration:'64px'};
function _loadOrgColPrefs() {
  try {
    const o = localStorage.getItem('wk_orgColOrder');
    const v = localStorage.getItem('wk_orgColVisibility');
    const w = localStorage.getItem('wk_orgColWidths');
    let order  = o ? JSON.parse(o) : [..._ORG_DEFAULT_ORDER];
    let vis    = v ? JSON.parse(v) : {..._ORG_DEFAULT_VIS};
    let widths = w ? {..._ORG_DEFAULT_WIDTHS, ...JSON.parse(w)} : {..._ORG_DEFAULT_WIDTHS};
    // マイグレーション v4: status列追加
    const MIGRATE_VER = 'orgcol_v4';
    if (!localStorage.getItem(MIGRATE_VER)) {
      order = [..._ORG_DEFAULT_ORDER];
      vis   = {..._ORG_DEFAULT_VIS};
      // 古いバージョンフラグも削除
      try { localStorage.removeItem('orgcol_v2'); localStorage.removeItem('orgcol_v3'); } catch(e) {}
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
  buildOrgTblSortOptions();
}

const _ORG_SORTABLE = new Set(['title','tb','action','position','technique','counter','status','channel','playlist','addedAt','fav','next','duration','lastPlayed']);
function _syncOrgTblSortUI() {
  const sel = document.getElementById('org-tbl-sort-key');
  const btn = document.getElementById('org-tbl-sort-dir');
  if (sel && orgSortCol && sel.querySelector(`option[value="${orgSortCol}"]`)) sel.value = orgSortCol;
  if (btn) btn.textContent = orgSortAsc ? '↑' : '↓';
}
export function buildOrgTblSortOptions() {
  const sel = document.getElementById('org-tbl-sort-key');
  if (!sel) return;
  const prev = orgSortCol || sel.value;
  const opts = [
    {key:'title', label:'タイトル'},
    ...orgColOrder.filter(col => orgColVisibility[col] !== false && _ORG_SORTABLE.has(col))
                  .map(col => ({key:col, label:orgColLabel(col)}))
  ];
  sel.innerHTML = opts.map(o => `<option value="${o.key}">${o.label}</option>`).join('');
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  _syncOrgTblSortUI();
}
window.buildOrgTblSortOptions = buildOrgTblSortOptions;
window.orgTblSortKey = function(val) { orgSortCol = val || null; orgSortAsc = true; _syncOrgTblSortUI(); renderOrg(); };
window.orgTblTogDir  = function() { orgSortAsc = !orgSortAsc; _syncOrgTblSortUI(); renderOrg(); };
// タグの列（段階3c）: 列キー tb/action/position/technique は「タグ1〜4の枠」を指す。
// 中身は枠に入っているグループ（設定で入れ替えれば列の中身も付いてくる）。
// 列キーは変えない。保存済みの列の並び・表示・幅（この端末・クラウド・カスタムリストごと）を
// そのまま読めるようにするため。見出しはグループの名前（ユーザーが付けた名前。ここに直接書かない）。
const _ORG_SLOT_COL = { tb:0, action:1, position:2, technique:3 };
const _ORG_FIELDS = ['tb', 'cat', 'pos', 'tags'];
const _orgEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _isOrgTagCol = col => Object.prototype.hasOwnProperty.call(_ORG_SLOT_COL, col);
// その列（枠）に入っているグループ。空いた枠と、マーク・習得（別の列がある。段階5で合わせる）は null
function _orgSlotGroup(col) {
  if (!_isOrgTagCol(col)) return null;
  const k = _ORG_SLOT_COL[col];
  const R = window.tagRegistry;
  if (!R) {
    const f = _ORG_FIELDS[k];
    return { id: 'f_' + f, store: f, name: window.tagLabel ? window.tagLabel(f) : col, options: window.tagPresets ? window.tagPresets(f) : [] };
  }
  const g = R.slots()[k];
  return g && (_ORG_FIELDS.includes(g.store) || g.store === 'map') ? g : null;
}
const _orgTagVals = (v, g) => (window.tagRegistry ? window.tagRegistry.valuesOf(v, g.id) : (v[g.store] || []));
// 列を出すか（タグの列: 枠が埋まっていて、そのグループが非表示でない。ほかの列は常に true）
function _orgTagColShown(col) {
  if (!_isOrgTagCol(col)) return true;
  const g = _orgSlotGroup(col);
  if (!g) return false;
  if (_ORG_FIELDS.includes(g.store)) {
    const s = (window.tagSettings || []).find(t => t.key === g.store);
    if (s && s.visible === false) return false;
  }
  return true;
}
export const ORG_COL_LABELS = {counter:'カウント', status:'習得', channel:'チャンネル', playlist:'プレイリスト', memo:'要約/メモ', addedAt:'追加日', fav:'お気に入り', next:'🎯 Next', drill:'ドリル', duration:'長さ'};
// 列見出しの取り出しは必ずこの関数を通す
export function orgColLabel(col) {
  if (_isOrgTagCol(col)) { const g = _orgSlotGroup(col); return g ? g.name : 'タグ' + (_ORG_SLOT_COL[col] + 1); }
  return ORG_COL_LABELS[col] || col;
}
export const ORG_COL_WIDTHS = _orgPrefs.widths;
export let orgSortCol = null, orgSortAsc = true;
let _orgFixedLefts = {chk:0, thumb:40, ch:116, title:246};
let _orgThumbVisible = localStorage.getItem('wk_orgThumbVis') !== '0';

// Register state on window so inline HTML handlers can access them
window.orgFilters = orgFilters;
Object.defineProperty(window, 'orgFavOnly',     {get: () => orgFavOnly,     set: v => { orgFavOnly = v; }});
Object.defineProperty(window, 'orgUnwOnly',     {get: () => orgUnwOnly,     set: v => { orgUnwOnly = v; }});
Object.defineProperty(window, 'orgWatchedOnly', {get: () => orgWatchedOnly, set: v => { orgWatchedOnly = v; }});
Object.defineProperty(window, 'orgBmOnly',      {get: () => orgBmOnly,      set: v => { orgBmOnly = v; }});
Object.defineProperty(window, 'orgMemoOnly',    {get: () => orgMemoOnly,    set: v => { orgMemoOnly = v; }});
Object.defineProperty(window, 'orgImgOnly',     {get: () => orgImgOnly,     set: v => { orgImgOnly = v; }});
Object.defineProperty(window, 'orgDrillOnly',   {get: () => orgDrillOnly,   set: v => { orgDrillOnly = v; }});
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
  const _bulkOrg = !!(window.bulkMode && window.bulkCtx === 'organize');
  const chkW   = _bulkOrg ? 40 : 0;
  const thumbW = _orgThumbVisible ? 76 : 0;
  const fixedDefs = [
    {key:'chk',   w:chkW,   label:''},
    {key:'thumb', w:thumbW, label:''},
    {key:'title', w:180, label:'Title', sep:true, sortKey:'title'},
  ];
  let left = 0;
  fixedDefs.forEach(def => {
    const th = document.createElement('th');
    th.className = 'org-th org-col-fixed' + (def.sep?' org-col-sep':'');
    th.dataset.fixed = def.key;
    th.style.cssText = `position:sticky;top:0;left:${left}px;width:${def.w}px;min-width:${def.w}px;background:var(--surface);z-index:11;${def.w===0?'display:none;':''}${def.sep?'border-right:2.5px solid var(--border)':''}`;
    if (def.sortKey) {
      th.style.cursor = 'pointer';
      th.title = 'クリックでメニュー';
      th.addEventListener('click', e => {
        if (e.target.closest('.rh')) return;
        if (def.key === 'title') { openOrgTitleMenu(th); }
        else { orgSetSort(def.sortKey); }
      });
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
    if (def.key === 'chk' && _bulkOrg) {
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'org-sel-all';
      cb.onchange = function(){ orgTogSelAll(this); };
      cb.style.cssText = 'accent-color:var(--accent);cursor:pointer';
      th.appendChild(cb);
    }
    thead.appendChild(th);
    left += def.w;
  });
  _orgFixedLefts = {chk:0, thumb:40, title: _orgThumbVisible ? 116 : 40};
}

export function toggleOrgThumb() {
  _orgThumbVisible = !_orgThumbVisible;
  localStorage.setItem('wk_orgThumbVis', _orgThumbVisible ? '1' : '0');
  renderOrg();
}

let _titleMenuEl = null;

function _closeTitleMenu() {
  if (_titleMenuEl) { _titleMenuEl.remove(); _titleMenuEl = null; }
}

function openOrgTitleMenu(thEl) {
  const isSame = !!_titleMenuEl;
  _closeTitleMenu();
  if (isSame) return;

  const dd = document.createElement('div');
  dd.id = 'org-title-menu-dd';
  dd.style.cssText = 'position:fixed;z-index:500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:0 6px 28px rgba(0,0,0,.18);min-width:180px;display:flex;flex-direction:column;gap:6px;font-size:12px';
  document.body.appendChild(dd);
  _titleMenuEl = dd;

  const rect = thEl.getBoundingClientRect();
  const z = parseFloat(document.body.style.zoom) || 1;
  let left = rect.left;
  const ddW = dd.offsetWidth || 180;
  if (left + ddW * z > window.innerWidth - 8) left = window.innerWidth - ddW * z - 8;
  dd.style.left = (Math.max(4, left) / z) + 'px';
  dd.style.top = ((rect.bottom + 4) / z) + 'px';

  // ソートボタン
  const sortRow = document.createElement('div');
  sortRow.style.cssText = 'display:flex;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--border)';
  const mkSortBtn = (label, asc) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    const isActive = orgSortCol === 'title' && orgSortAsc === asc;
    btn.style.cssText = `flex:1;padding:5px 0;font-size:11px;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;background:${isActive?'var(--accent)':'var(--surface2)'};color:${isActive?'#fff':'var(--text2)'}`;
    btn.addEventListener('click', () => {
      orgSortCol = 'title'; orgSortAsc = asc;
      _syncOrgTblSortUI(); renderOrg();
      _closeTitleMenu();
    });
    return btn;
  };
  sortRow.appendChild(mkSortBtn('昇順 ▲', true));
  sortRow.appendChild(mkSortBtn('降順 ▼', false));
  dd.appendChild(sortRow);

  // サムネイル切り替え
  const thumbBtn = document.createElement('button');
  thumbBtn.textContent = _orgThumbVisible ? 'サムネイルを非表示' : 'サムネイルを表示';
  thumbBtn.style.cssText = 'width:100%;padding:6px 8px;font-size:11px;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;background:var(--surface2);color:var(--text2);text-align:left';
  thumbBtn.addEventListener('click', () => { _closeTitleMenu(); toggleOrgThumb(); });
  dd.appendChild(thumbBtn);

  setTimeout(() => {
    const closeHandler = ev => {
      if (_titleMenuEl && !_titleMenuEl.contains(ev.target)) {
        _closeTitleMenu();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    document.addEventListener('mousedown', closeHandler);
  }, 50);
}
window.openOrgTitleMenu = openOrgTitleMenu;

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

export function togOrgDrill() {
  orgDrillOnly = !orgDrillOnly;
  ['org-fs-chip-drill','org-fov-chip-drill'].forEach(id => { const el=document.getElementById(id); if(el) el.classList.toggle('active', orgDrillOnly); });
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
  orgFavOnly = false; orgNextOnly = false; orgDrillOnly = false; orgUnwOnly = false; orgWatchedOnly = false; orgBmOnly = false; orgMemoOnly = false; orgImgOnly = false;
  orgMemoSearch = ''; orgChannelSearch = ''; orgPlaylistSearch = '';
  orgPrRank = null; orgPrDate = null;
  window.wkSetSearchWord?.('');   // 4つの入力欄をまとめて空にする（半分だけ残さない）
  syncOrgFilterOvRows();
  document.querySelectorAll('[id^="org-fs-"]').forEach(el => el.classList.remove('active'));
  window.refreshOpenSbAccordions?.('org');
  renderOrg();
  _updateOrgResetBtn();
}

// (空白) 対応フィルターマッチ
function _matchFilt(filterSet, values) {
  if (!filterSet.size) return true;
  return values.length ? values.some(v => filterSet.has(v)) : filterSet.has('(空白)');
}

// ── 検索演算子パーサー ──
// 対応: -除外  "完全一致"  title:xxx  ch:xxx  pl:xxx  tech:xxx  memo:xxx
// 記号の揺れ（v52.833）。日本語入力のまま打つと記号が全角になり、
// 除外や完全一致が黙って効かなくなっていた（「スイープ －デラヒーバ」で0件）。
// 語そのものは触らず、演算子として使う記号だけ半角に揃える。
//   ・マイナス: 全角／各種ハイフン（U+FF0D 2010 2011 2013 2014 2212）と長音「ー」「ｰ」を
//     **語頭のときだけ** - に直す。語頭の長音で始まる日本語は無いので、打ち間違いとみなす。
//     （v52.826 の正規化で語頭のーが消えるようになり、除外したい語が逆に出ていた）
//   ・引用符: 全角 ＂ ” “ 「 」 を " に
//   ・コロン: 全角 ： を : に（title：デラヒーバ が効くように）
const _OPS_MINUS = /^[\uFF0D\u2010\u2011\u2013\u2014\u2212\u30FC\uFF70]/;
function _normOps(raw) {
  return String(raw)
    .replace(/[\uFF02\u201C\u201D\u300C\u300D]/g, '"')
    .replace(/\uFF1A/g, ':')
    .split(/(\s+)/)
    .map(tok => (tok.length > 1 && _OPS_MINUS.test(tok)) ? '-' + tok.slice(1) : tok)
    .join('');
}

export function _parseQuery(rawInput) {
  const result = { includes: [], excludes: [], fields: {} };
  if (!rawInput) return result;
  const raw = _normOps(rawInput);
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
  const plain = [];
  cleaned.trim().split(/\s+/).filter(Boolean).forEach(w => {
    if (w.startsWith('-') && w.length > 1) {
      result.excludes.push(w.slice(1).toLowerCase());
    } else {
      const t = w.toLowerCase();
      plain.push(t);
      result.includes.push({ text: t, exact: false });
    }
  });
  // 「k guard」「de la riva」のような複数語は、まずフレーズ(そのままの並び)として照合する。
  if (plain.length >= 2) {
    result.phrase = plain.join(' ');
    // フレーズ全体が既知の技/ポジション/カテゴリー名なら、単語バラバラのAND検索はしない。
    // 「k guard」は "k"×"guard" に分解すると guard がほぼ全動画に当たって関係ない動画を大量に
    // 巻き込むため、スペース無しの「kguard」と同じ結果になるようフレーズだけで判定する。
    result.phraseOnly = !!(window.aliasNamesFor && window.aliasNamesFor(result.phrase).length);
  }
  return result;
}

// ── クエリ判定の入口 (ライブラリ/整理/カスタムビュー/件数カウント すべてここを通す) ──
// 素直な検索順: ①除外語 ②field:指定 ③"完全一致" ④フレーズ一致 ⑤全単語AND
export function _matchQuery(v, parsed, fields) {
  for (const exc of parsed.excludes) {
    if (_matchQueryField(v, exc, false, null)) return false;
  }
  for (const [field, vals] of Object.entries(parsed.fields)) {
    if (!_matchFieldSpecific(v, field, vals)) return false;
  }
  for (const inc of parsed.includes) {
    if (inc.exact && !_matchQueryField(v, inc.text, true, fields)) return false;
  }
  // フレーズがそのまま当たれば採用（「k guard」→ Kガード）
  if (parsed.phrase && _matchQueryField(v, parsed.phrase, false, fields)) return true;
  // 既知の技名フレーズは単語ANDに落とさない（「k guard」＝「kguard」）
  if (parsed.phraseOnly) return false;
  for (const inc of parsed.includes) {
    if (!inc.exact && !_matchQueryField(v, inc.text, false, fields)) return false;
  }
  return true;
}

// ── 動画1本ぶんの「照合用テキスト」をキャッシュする ──
// 打鍵のたびに2,800本×5項目を正規化し直すと重いので、元の文字列が変わったときだけ作り直す。
// 動画オブジェクト自体には何も書き込まない（保存経路に乗せないため WeakMap を使う）。
const _textCache = new WeakMap();
function _searchTagText(v) {
  const R = window.tagRegistry;
  if (!R) return [...(v.tb || []), ...(v.cat || []), ...(v.pos || []), ...(v.tags || [])].join(' / ');
  return R.searchTagText(v);
}
function _videoText(v) {
  const rawLower = window._rawLowerTag || (x => String(x || '').toLowerCase());
  const norm     = window._normTag     || (x => String(x || '').toLowerCase());
  const src = {
    title: v.title || '',
    ch:    v.channel || v.ch || '',
    pl:    v.pl || '',
    memo:  v.memo || '',
    // タグは「検索の対象にする」グループのものだけ（段階2b。一覧の search）。今の4つは既定で対象
    tags:  _searchTagText(v),
  };
  const got = _textCache.get(v);
  if (got && got.src.title === src.title && got.src.ch === src.ch && got.src.pl === src.pl
          && got.src.memo === src.memo && got.src.tags === src.tags) return got;
  const made = { src };
  for (const k of ['title', 'ch', 'pl', 'memo', 'tags']) {
    made[k] = { raw: rawLower(src[k]), norm: norm(src[k]) };
  }
  // 項目を絞らない検索（ふだんの検索）は、5項目を1本にまとめた方を見る。
  // 1語につき5回照合していたのを1回にするため（2,800本だと体感が変わる）。
  const joined = [src.title, src.ch, src.pl, src.tags, src.memo].join(' / ');
  made.all = { raw: rawLower(joined), norm: norm(joined) };
  _textCache.set(v, made);
  return made;
}
window._wkVideoText = _videoText;

// ── 1つの語が、1つの項目に入っているか ──
// 英語: 生テキストに「含む」かどうか（v52.826 より前と同じ。1文字の語だけ単語の区切りで見る）。
// 日本語: 正規化して部分一致（全角/半角・カタカナ/ひらがな・長音・中黒の違いを吸収）。
//   → 「ｽｲｰﾌﾟ」で「スイープ」、「ＤＬＲ」で「DLR」、「Heel Hook」で「Heel Hooks」に当たる。
//   辞書に書き方を並べて増やすのではなく、両側を同じ形に揃えて突き合わせる。
// 1文字の語だけ正規表現を使う（"k" が "ks" に当たらないように）。作り直さない（打鍵ごとに重い）
const _reCache = new Map();
function _oneCharRe(core) {
  let re = _reCache.get(core);
  if (re !== undefined) return re;
  re = new RegExp('(^|[^a-z0-9])' + core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
  if (_reCache.size > 400) _reCache.clear();
  _reCache.set(core, re);
  return re;
}

// 英語は「含む」で素直に照合する（v52.826 より前と同じ）。
//   v52.826 で一律「単語の区切りで一致」にしたら、オーナーのタイトル
//   「02-Quick1.」「30-Quick5.」のように語の直後に数字が来るものに当たらなくなり、
//   quick の除外が 2,823本中1本も効かなくなっていた（v52.860 で元に戻した）。
function _hitField(text, f) {
  if (!text || !f) return false;
  const t = String(text);
  if (/^[\x20-\x7E]+$/.test(t)) {
    const core = t.toLowerCase().trim();
    const bare = core.replace(/[\s\-_]+/g, '');
    if (!bare) return false;
    // 1文字("k","x")だけは単語の区切りで照合する（昔からこうだった）
    if (bare.length === 1) return _oneCharRe(core).test(f.raw);
    if (f.raw.includes(core)) return true;
    // 区切り無しで書かれた本文にも当てる（"de la riva" ↔ "delariva"）
    if (bare !== core && f.raw.includes(bare)) return true;
    const n = (window._normTag || (x => x))(core);
    return !!n && f.norm.includes(n);
  }
  const n = (window._normTag || (x => x))(t);
  return !!n && f.norm.includes(n);
}

export function _matchQueryField(v, text, exact, fields) {
  // fields: アドバンスドサーチで指定された検索対象 (null=全部)
  const T = _videoText(v);
  let use;
  if (!fields) use = [T.all];   // ふだんの検索: まとめた1本だけ見る
  else {
    use = [];
    if (fields.title) use.push(T.title);
    if (fields.ch)    use.push(T.ch);
    if (fields.pl)    use.push(T.pl);
    // 詳細検索のチェック欄は「tech」という名前で渡してくる（保存済みの詳細検索もそう）。
    // 以前は tags しか見ておらず、「タグ」にチェックしても外しても、タグを一切探していなかった。
    if (fields.tags || fields.tech) use.push(T.tags);
    if (fields.memo)  use.push(T.memo);
  }

  if (use.some(f => _hitField(text, f))) return true;

  // ── 検索語 → 同じものの別の書き方（SEARCH_DICT の1枚だけを引く）──
  // 動画タイトルは英語、検索語は日本語（またはその逆）が普通に起きるため、
  // 打った語と同じものを指す書き方でも本文を探す。関連や分類へは広げない。
  const names = window.aliasNamesFor ? window.aliasNamesFor(text) : null;
  if (names && names.length) {
    for (const nm of names) {
      if (nm && nm !== text && use.some(f => _hitField(nm, f))) return true;
    }
  }
  return false;
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
  if (window._cvVideoIds) list = list.filter(v => window._cvVideoIds.has(v.id));
  // 検索語は1か所から読む（js/search-word.js）。カードと同じ語を見る。
  const raw = window.wkSearchWord ? window.wkSearchWord() : '';
  const parsed = _parseQuery(raw);
  const adv = _advSearch;
  const advFields = adv?.fields || null;
  // タグの条件は tag-filter.js で1回だけ組み立てる（「(空白)」＝そのグループに何も付いていない動画も選べる）。
  // 古い呼び名に入っている分は先に今の呼び名へ寄せる（列フィルター等が今の呼び名を直接読むので、見えない条件を残さない）
  window.tagFilter?.normalize(orgFilters, 'org');
  const _tagOk = window.tagFilter
    ? window.tagFilter.compile(orgFilters, 'org', { allowBlank: true })
    : () => true;
  return list.filter(v => {
    if (v.archived) return false;
    if (orgFavOnly     && !v.fav) return false;
    if (orgNextOnly    && !v.next) return false;
    if (orgDrillOnly   && !v.drill) return false;
    if (orgUnwOnly     && v.watched) return false;
    if (orgWatchedOnly && !v.watched) return false;
    if (orgBmOnly      && !(v.bookmarks && v.bookmarks.length > 0)) return false;
    if (orgMemoOnly    && !v.memo) return false;
    if (orgImgOnly     && !(v.snapshots && v.snapshots.length > 0)) return false;
    if (orgFilters.platform.size && !orgFilters.platform.has(v.pt)) return false;
    // ── 検索演算子 (-除外 / "完全一致" / field:値 / フレーズ) ──
    if (!_matchQuery(v, parsed, advFields)) return false;
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
    if (orgFilters.next.size) {
      const nVal = v.next ? '🎯 Next' : '○ 未設定';
      if (!orgFilters.next.has(nVal)) return false;
    }
    if (orgFilters.counter.size) {
      const pc = v.practice || 0;
      const cVal = pc === 0 ? '未練習' : pc <= 3 ? '1〜3回' : pc <= 10 ? '4〜10回' : '11回以上';
      if (!orgFilters.counter.has(cVal)) return false;
    }
    if (orgFilters.status.size) { const _sn=window.normStatus(v.status); if(!orgFilters.status.has(_sn)) return false; }
    if (!_tagOk(v)) return false;
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
      const favVal = v.fav ? '★ お気に入り' : '☆ 未お気に入り';
      if (!orgFilters.fav.has(favVal)) return false;
    }
    if (orgFilters.memo.size) {
      const memoVal = v.memo ? 'あり' : 'なし';
      if (!orgFilters.memo.has(memoVal)) return false;
    }
    if (orgMemoSearch) {
      const q = orgMemoSearch.toLowerCase();
      if (!(v.memo || '').toLowerCase().includes(q)) return false;
    }
    if (orgChannelSearch) {
      if (!(v.channel || v.ch || '').toLowerCase().includes(orgChannelSearch.toLowerCase())) return false;
    }
    if (orgPlaylistSearch) {
      if (!(v.pl || '').toLowerCase().includes(orgPlaylistSearch.toLowerCase())) return false;
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
  // Organize タブでも統合フィルターパネルを使用
  if (window.uniOpen) { window.uniOpen('src', 'org'); return; }
  // fallback: 旧オーバーレイ
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

// ═══ Layout / height ═══

export function adjustOrgTableHeight() {
  const orgTab = document.getElementById('organizeTab');
  if (!orgTab || !orgTab.classList.contains('active')) return;
  // position:fixed + flex:1 で高さは自動制御。wrap.style.heightをリセット
  const wrap = document.querySelector('.org-table-wrap');
  if (wrap) wrap.style.height = '';
  // left は CSS left:var(--sbw) で管理するため、ここでは設定しない
  orgTab.style.left = '';  // 古い inline style があれば除去
}

function _updateOrgResetBtn() {
  const btn = document.getElementById('org-filter-reset-btn');
  if (!btn) return;
  const active = Object.values(orgFilters).some(s => s.size > 0)
    || orgFavOnly || orgNextOnly || orgDrillOnly || orgUnwOnly || orgWatchedOnly
    || orgBmOnly || orgMemoOnly || orgImgOnly || orgPrRank || orgPrDate;
  btn.style.display = active ? 'inline-block' : 'none';
}

// ═══ Main render ═══


// 絞り込んだ動画の合計時間。件数の隣に出す。
//   1時間未満 … 分だけ（「42分」）
//   1時間以上 … 時間と分（「3時間5分」／ちょうどなら「3時間」）
// duration は秒。長さが分からない動画（未取得・YouTubeの取得前など）は数えられないので、
// 混ざっているときは「+n本 不明」と添えて、出している合計が全部ではないことが分かるようにする。
// 0本のときや全部不明のときは何も出さない（「0分」は嘘になる）。
// カスタムビューのピッカーからも同じ書式で使う（custom-view.js は module ではないので window 経由）
function _orgTotalDurLabel(list) {
  let sec = 0, unknown = 0;
  for (const v of (list || [])) {
    const d = Number(v && v.duration);
    if (Number.isFinite(d) && d > 0) sec += d; else unknown++;
  }
  if (sec <= 0) return '';
  const min = Math.round(sec / 60);
  const body = min < 60
    ? `${min}分`
    : (min % 60 === 0 ? `${min / 60}時間` : `${Math.floor(min / 60)}時間${min % 60}分`);
  return ` · ${body}${unknown ? `（+${unknown}本 長さ不明）` : ''}`;
}
window._wkTotalDurLabel = _orgTotalDurLabel;

export function renderOrg() {
  _closeOrgInlineEditor(false);
  initOrgFixedHeaders();
  _updateOrgResetBtn();
  const videos = window.videos || [];
  // Organize専用フィルターでリストを絞り込む
  let list = orgFilt(videos);

  const totalCount = list.length;
  const oc = document.getElementById('oc');
  if (oc) {
    // 本数の表記は従来どおり（i18nのテンプレ訳がそのまま効くよう、テキストノードを分けて持つ）。
    // そのうえで「絞り込み・アーカイブで画面に出ていない本数」を隣に添える。
    // 画面の数字だけ見て「動画が減った」と誤解しないための表示で、データには触れない。
    const hidden = Math.max(0, (videos.length || 0) - totalCount);
    oc.textContent = '';
    oc.style.cursor = 'pointer';
    oc.title = '本数の内訳を見る';
    const main = document.createElement('span');
    main.textContent = totalCount + ' 本' + _orgTotalDurLabel(list);
    oc.appendChild(main);
    if (hidden > 0) {
      const sub = document.createElement('span');
      sub.style.cssText = 'margin-left:6px;color:var(--text3);opacity:.85';
      sub.textContent = `／非表示 ${hidden}本 ⓘ`;
      oc.appendChild(sub);
    }
    oc.onclick = () => window.wkVideoAuditOpen?.();
  }

  // ソート
  const sortSel = document.getElementById('org-sort-sel');
  const sortVal = sortSel ? sortSel.value : 'added-desc';

  function orgSortFn(a, b) {
    if (!orgSortCol) return 0;
    let av, bv;
    if (orgSortCol === 'title')    { av = (a.title||'').toLowerCase(); bv = (b.title||'').toLowerCase(); }
    else if (orgSortCol === 'channel')   { av = (a.ch||'').toLowerCase(); bv = (b.ch||'').toLowerCase(); }
    else if (orgSortCol === 'playlist')  { av = (a.pl||'').toLowerCase(); bv = (b.pl||'').toLowerCase(); }
    else if (orgSortCol === 'next')      { av=a.next?0:1; bv=b.next?0:1; }
    else if (orgSortCol === 'drill')     { av=a.drill?0:1; bv=b.drill?0:1; }
    else if (orgSortCol === 'counter')   { av=a.practice||0; bv=b.practice||0; }
    else if (orgSortCol === 'addedAt')   { av = a.addedAt||''; bv = b.addedAt||''; }
    else if (orgSortCol === 'duration')  { av = a.duration||0; bv = b.duration||0; }
    else if (orgSortCol === 'fav')       { av = a.fav?0:1; bv = b.fav?0:1; }
    else if (_isOrgTagCol(orgSortCol))  { const g = _orgSlotGroup(orgSortCol); av = g ? _orgTagVals(a, g).join() : ''; bv = g ? _orgTagVals(b, g).join() : ''; }
    else if (orgSortCol === 'status')         { av=window.statusRank(a.status); bv=window.statusRank(b.status); }
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
    window._cvAfterRender?.();
    return;
  }
  if (empty) empty.style.display = 'none';
  if (tableWrap) tableWrap.style.display = '';

  const selIds = window.selIds || new Set();
  const bulkOrg = !!(window.bulkMode && window.bulkCtx === 'organize');
  const _chkW   = bulkOrg ? 40 : 0;
  const _thumbW = _orgThumbVisible ? 76 : 0;
  const _titleL = _chkW + _thumbW;
  const tbody = document.getElementById('orgList');
  if (!tbody) return;

  // ── 行HTML生成関数 ──
  const _fcv = window.filterColVis || {};
  const _fcvFilter = col => {
    if (_fcv.mark   === false && (col === 'fav' || col === 'next')) return false;
    if (_fcv.status === false && col === 'status') return false;
    if (_fcv.rank   === false && col === 'counter') return false;
    if (!_orgTagColShown(col)) return false;   // タグの列: 空いた枠・非表示のグループは出さない
    return true;
  };
  const visCols = orgColOrder.filter(col => orgColVisibility[col] !== false && _fcvFilter(col));
  function _buildRowHTML(v) {
    const _ytId = v.ytId || (v.id||'').replace(/^yt-/,'');
    const _vmId = (v.id||'').replace(/^vm-/,'');
    const _gdId = (v.id||'').replace(/^gd-/,'');
    let thumb;
    if (v.pt === 'youtube') {
      thumb = v.thumb || `https://img.youtube.com/vi/${_ytId}/mqdefault.jpg`;
    } else if (v.pt === 'gdrive') {
      thumb = `https://drive.google.com/thumbnail?id=${_gdId}&sz=w320`;
    } else if (v.pt === 'x') {
      thumb = v.thumb || '';
    } else {
      thumb = (v.thumb && !v.thumb.includes('vumbnail.com')) ? v.thumb : '';
    }

    const mkTagCell = (items, filterKey, colKey) => {
      const chips = items.map(t => `<span class="org-tag-chip">${_orgEsc(t)}</span>`).join('');
      return `<td class="org-td" data-col="${colKey}" style="overflow:hidden">
        <div class="org-tag-cell">${chips || '<span style="font-size:10px;color:var(--text3)">—</span>'}</div></td>`;
    };
    const scrollCells = visCols.map(col => {
      if (_isOrgTagCol(col)) { const g = _orgSlotGroup(col); return mkTagCell(g ? _orgTagVals(v, g) : [], null, col); }
      if (col === 'status') {
        const sN = window.normStatus(v.status);
        return `<td class="org-td" data-col="status" style="white-space:nowrap">${_statusSpan(sN)}</td>`;
      }
      if (col === 'channel')   return `<td class="org-td" data-col="channel" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.ch||v.channel||'—'}</div></td>`;
      if (col === 'counter') {
        const pc = v.practice || 0;
        const ago = v.lastPracticed ? (window.vpCntFormatAgo?.(v.lastPracticed) || '') : '';
        return `<td class="org-td" data-col="counter" style="white-space:nowrap">
          <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700">
            <span style="color:${pc > 0 ? '#e8590c' : 'var(--text3)'};${pc === 0 ? 'opacity:.55' : ''}">${pc || '未'}</span>
            <span style="font-size:9px;color:var(--text3);font-weight:600">${ago || '—'}</span>
          </div></td>`;
      }
      if (col === 'playlist')  return `<td class="org-td" data-col="playlist" style="overflow:hidden"><div style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.pl||'—'}</div></td>`;
      if (col === 'memo')      return `<td class="org-td" data-col="memo" style="overflow:hidden"><div class="org-memo-text">${v.memo||'<span style="color:var(--text3);font-size:10px">—</span>'}</div></td>`;
      if (col === 'fav')       return `<td class="org-td" data-col="fav" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogFav('${v.id}')" class="${v.fav?'org-fav-on':'org-fav-off'}" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:4px;transition:transform .1s" title="${v.fav?'お気に入りを外す':'お気に入りに追加'}">${v.fav?'★':'☆'}</button></td>`;
      if (col === 'next')      return `<td class="org-td" data-col="next" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogNext('${v.id}')" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px 4px;border-radius:4px;transition:transform .1s" title="${v.next?'Next解除':'Nextに追加'}">${v.next?'🎯':'○'}</button></td>`;
      if (col === 'drill') { const _don=`<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="#7c3aed"/><text x="17.5" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`, _doff=`<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="none" stroke="#555" stroke-width="1.5"/><text x="17.5" y="14" text-anchor="middle" fill="#555" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`; return `<td class="org-td" data-col="drill" style="text-align:center;padding:4px"><button onclick="event.stopPropagation();orgTogDrill('${v.id}')" style="background:none;border:none;cursor:pointer;padding:2px;border-radius:4px;line-height:0;transition:opacity .15s;opacity:${v.drill?'1':'0.35'}" title="${v.drill?'Drill解除':'Drillに追加'}">${v.drill?_don:_doff}</button></td>`; }
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
      return `<td class="org-td" data-col="${col}" style="font-size:10px;color:var(--text3)">—</td>`;
    }).join('');

    return `<tr class="org-tr" id="org-row-${v.id}">
      <td class="org-td org-td-fixed org-td-fixed-chk" style="left:0;width:${_chkW}px;min-width:${_chkW}px;${bulkOrg?'padding:6px 6px':'display:none'}" id="org-chk-cell-${v.id}">
        ${bulkOrg ? `<input type="checkbox" id="org-cb-${v.id}" ${selIds.has(v.id)?'checked':''} onchange="orgTogSel('${v.id}',this)" onclick="event.stopPropagation()" style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer">` : ''}
      </td>
      <td class="org-td org-td-fixed org-td-fixed-thumb" style="left:${_chkW}px;width:${_thumbW}px;min-width:${_thumbW}px;${_orgThumbVisible?'padding:6px 8px':'display:none'}">
        ${_orgThumbVisible ? `<img class="org-thumb" src="${thumb}" onerror="this.style.background='var(--surface3)'" onclick="openVPanel('${v.id}')">` : ''}
      </td>
      <td class="org-td org-td-fixed org-td-fixed-title org-col-sep" style="left:${_titleL}px" onclick="openVPanel('${v.id}')">
        <div class="org-title-text">${v.title}</div>
      </td>
      ${scrollCells}
    </tr>`;
  }

  // ── バッチレンダリング: 最初の60行を即時描画、残りはスクロールで追加 ──
  const BATCH = 60;
  const firstBatch = displayList.slice(0, BATCH);
  tbody.innerHTML = firstBatch.map(v => _buildRowHTML(v)).join('');

  let _orgRendered = BATCH;
  if (displayList.length > BATCH) {
    // 前回のオブザーバーを破棄
    if (window._orgScrollObs) { window._orgScrollObs.disconnect(); window._orgScrollObs = null; }
    // センチネル行を挿入
    const sentinel = document.createElement('tr');
    sentinel.id = 'org-sentinel';
    sentinel.innerHTML = '<td colspan="99" style="height:1px;padding:0;border:none"></td>';
    tbody.appendChild(sentinel);

    window._orgScrollObs = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      const next = displayList.slice(_orgRendered, _orgRendered + BATCH);
      if (!next.length) { window._orgScrollObs.disconnect(); sentinel.remove(); return; }
      sentinel.remove();
      const frag = document.createDocumentFragment();
      const temp = document.createElement('tbody');
      temp.innerHTML = next.map(v => _buildRowHTML(v)).join('');
      while (temp.firstChild) frag.appendChild(temp.firstChild);
      tbody.appendChild(frag);
      _orgRendered += next.length;
      window._cvAfterRender?.();
      window.loadGdriveCardThumbs?.();
      if (_orgRendered < displayList.length) {
        tbody.appendChild(sentinel);
      } else {
        window._orgScrollObs.disconnect();
      }
    }, { root: document.querySelector('.org-table-wrap'), rootMargin: '200px' });
    window._orgScrollObs.observe(sentinel);
  }

  syncOrgColHeaders();
  requestAnimationFrame(adjustOrgTableHeight);
  _bindOrgInlineEdit();
  // フィルターアイコンを全列同期
  Object.keys(_colFilterConfig).concat(Object.keys(_ORG_SLOT_COL)).forEach(c => _syncFiltIcon(c));
  // GDriveサムネをproxy経由で差し込み（トークン取得後に備えて）
  window.loadGdriveCardThumbs?.();
  window._cvAfterRender?.();
}

// ═══ Column headers sync ═══

export function syncOrgColHeaders() {
  const thead = document.querySelector('.org-table thead tr');
  if (!thead) return;
  [...thead.querySelectorAll('th[data-col]')].forEach(el => el.remove());
  const _fcv2 = window.filterColVis || {};
  const _fcvFilter2 = col => {
    if (_fcv2.mark   === false && (col === 'fav' || col === 'next')) return false;
    if (_fcv2.status === false && col === 'status') return false;
    if (_fcv2.rank   === false && col === 'counter') return false;
    if (!_orgTagColShown(col)) return false;   // タグの列: 空いた枠・非表示のグループは出さない
    return true;
  };
  orgColOrder.filter(col => orgColVisibility[col] !== false && _fcvFilter2(col)).forEach(col => {
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
    labelSpan.textContent = orgColLabel(col);
    th.textContent = '';
    th.appendChild(labelSpan);
    th.appendChild(sortIndicator);
    // フィルターアクティブインジケーター
    const filtCfg = _colFilterCfg(col);
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
    const fixedW = (!!(window.bulkMode && window.bulkCtx === 'organize') ? 40 : 0) + (_orgThumbVisible ? 76 : 0) + 180; // chk + thumb + title
    let scrollW = 0;
    thead.querySelectorAll('th[data-col]').forEach(th => {
      scrollW += th.offsetWidth || parseInt(th.style.width) || 120;
    });
    table.style.width = (fixedW + scrollW) + 'px';
  }
  bindOrgDrag();
  initOrgResize();
  buildOrgTblSortOptions();
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
    _syncOrgTblSortUI();
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
        btn.className = v.fav ? 'org-fav-on' : 'org-fav-off';
        btn.title = v.fav ? 'お気に入りを外す' : 'お気に入りに追加';
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
        if (favBtn) { favBtn.textContent = '★'; favBtn.title = 'お気に入りを外す'; }
      }
    }
    window.debounceSave?.();
  } catch(e) { console.error('orgTogNext error:', e); }
}

export function orgTogDrill(id) {
  try {
    const v = (window.videos || []).find(v => v.id === id);
    if (!v) return;
    v.drill = !v.drill;
    const _don  = `<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="#7c3aed"/><text x="17.5" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`;
    const _doff = `<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="none" stroke="#555" stroke-width="1.5"/><text x="17.5" y="14" text-anchor="middle" fill="#555" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`;
    const tr = document.getElementById('org-row-' + id);
    if (tr) {
      const btn = tr.querySelector('[onclick*="orgTogDrill"]');
      if (btn) {
        btn.innerHTML = v.drill ? _don : _doff;
        btn.style.opacity = v.drill ? '1' : '0.35';
        btn.title = v.drill ? 'Drill解除' : 'Drillに追加';
      }
    }
    window.debounceSave?.();
  } catch(e) { console.error('orgTogDrill error:', e); }
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
document.addEventListener('touchcancel', _resizeEnd); // タッチキャンセル時もdraggable=trueを復元

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
// 列メニューに並ぶ標準列（フィルタ設定で丸ごと隠れている列は出さない）
function _orgMenuCols() {
  const _fcv3 = window.filterColVis || {};
  return orgColOrder.filter(col => {
    if (_fcv3.mark   === false && (col === 'fav' || col === 'next')) return false;
    if (_fcv3.status === false && col === 'status') return false;
    if (_fcv3.rank   === false && col === 'counter') return false;
    if (!_orgTagColShown(col)) return false;   // タグの列: 空いた枠・非表示のグループは出さない
    return true;
  });
}

function _buildOrgColMenuHTML() {
  // カスタムビュー統合メニューフック（標準+カスタム列を混在表示）
  const unified = window._cvGetUnifiedMenuHTML?.();
  if (unified != null) return unified;

  const _visibleOrgCols = _orgMenuCols();
  let html = '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">表示する列（ドラッグ / ↑↓で並替え）</div>' +
    _visibleOrgCols.map((col, i) => `
      <div class="cv-colmenu-row" data-cv-sort="orgcols" data-cv-id="${col}">
        <div class="cv-drag-handle" title="ドラッグして並べ替え"></div>
        <button onclick="orgMoveCol('${col}',-1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===0?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===0?'disabled':''}>▲</button>
        <button onclick="orgMoveCol('${col}',1)" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:14px;cursor:pointer;padding:4px 7px;opacity:${i===_visibleOrgCols.length-1?'.2':'1'};min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center" ${i===_visibleOrgCols.length-1?'disabled':''}>▼</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;flex:1">
          <input type="checkbox" ${orgColVisibility[col]!==false?'checked':''} onchange="orgColVisibility['${col}']=this.checked;_saveOrgColPrefs();renderOrg()" style="accent-color:var(--accent);width:14px;height:14px">
          <span data-user-text="1">${_orgEsc(orgColLabel(col))}</span>
        </label>
      </div>`).join('');
  const cvSection = window._cvGetColMenuSection?.();
  if (cvSection) {
    html += '<div style="height:1px;background:var(--border);margin:8px 0"></div>' +
      '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">カスタム列（↑↓で並替え）</div>' +
      cvSection;
  }
  return html;
}

export function toggleOrgColMenu() {
  let overlay = document.getElementById('org-col-menu');
  if (overlay) { overlay.remove(); return; }
  // ── ボトムシート（cv-src-sheetと同じパターン）──
  overlay = document.createElement('div');
  overlay.id = 'org-col-menu';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:290;display:flex;align-items:flex-end;justify-content:center';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  const outer = document.createElement('div');
  outer.style.cssText = 'background:var(--surface);border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.5);margin-bottom:12px;width:calc(100% - 24px);max-width:480px';
  outer.addEventListener('click', e => e.stopPropagation());
  const panel = document.createElement('div');
  panel.id = 'org-col-menu-panel';
  panel.style.cssText = 'padding:16px 14px 20px;max-height:70dvh;overflow-y:auto';
  panel.innerHTML = _buildOrgColMenuHTML();
  outer.appendChild(panel);
  overlay.appendChild(outer);
  document.body.appendChild(overlay);
}

// 列並べ替え: renderOrg()を呼ばずDOMだけ並べ替え（スクロールリセット防止）
function _reorderOrgCellsInPlace() {
  const tbody = document.getElementById('orgList');
  if (!tbody) return;
  const visCols = orgColOrder.filter(col => orgColVisibility[col] !== false);
  tbody.querySelectorAll('tr.org-tr').forEach(tr => {
    const cells = {};
    tr.querySelectorAll('td[data-col]').forEach(td => { cells[td.dataset.col] = td; });
    if (!Object.keys(cells).length) return;
    const anchor = tr.querySelector('.cv-custom-td') || null;
    visCols.forEach(col => {
      if (cells[col]) anchor ? tr.insertBefore(cells[col], anchor) : tr.appendChild(cells[col]);
    });
  });
}

// ── 列メニューのドラッグ&ドロップ並べ替え（エンジンは custom-view.js） ──
// 【データ経路】orgColOrder → _saveOrgColPrefs() → localStorage(wk_orgColOrder)
//   ＋ saveUserSettings() → Firestore → 全端末。
// 安全側の作り: メニューに並ぶ列（_orgMenuCols）の位置にだけ新しい並びを流し込む。
//   フィルタ設定で隠れている列の位置は動かさないので、orgColOrder は必ず
//   「元と同じ集合の並べ替え」になる。件数やidが合わなければ何も書き換えない。
//   （エンジン側でも「同じ集合の並べ替え」でなければ commit を呼ばない）
window._wkSortGroups = window._wkSortGroups || {};
window._wkSortGroups.orgcols = {
  ids: () => _orgMenuCols(),
  commit: (newVis) => {
    // 並べ替えでなければ書き換えない（ヘルパー未読込なら undefined ＝ 何もしない）
    if (!window._cvFillVisibleSlots?.(orgColOrder, _orgMenuCols(), newVis)) return;
    _saveOrgColPrefs();
    syncOrgColHeaders();
    _reorderOrgCellsInPlace();
    window._cvAfterRender?.();
  },
  render: () => {
    const panel = document.getElementById('org-col-menu-panel');
    if (panel) panel.innerHTML = _buildOrgColMenuHTML();
  }
};

export function orgMoveCol(col, dir) {
  if (window.orgMoveColOverride?.(col, dir)) return;
  const i = orgColOrder.indexOf(col);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= orgColOrder.length) return;
  orgColOrder.splice(i, 1);
  orgColOrder.splice(j, 0, col);
  _saveOrgColPrefs();
  syncOrgColHeaders();        // ヘッダーのみ再構築（cv-custom-thも一旦削除される）
  _reorderOrgCellsInPlace();  // 既存セルをDOMで並べ替え（スクロールなし）
  window._cvAfterRender?.(); // syncOrgColHeadersで消えたカスタム列ヘッダーを再追加
  // オーバーレイを閉じず中身だけ更新（削除→再生成するとiOS Safariでスクロールリセット）
  const panel = document.getElementById('org-col-menu-panel');
  if (panel) panel.innerHTML = _buildOrgColMenuHTML();
  else toggleOrgColMenu();
}

export function bindOrgDrag() {
  // 前回のドラッグで残った孤児ゴーストを必ず掃除（溜まり防止）
  document.getElementById('org-drag-ghost')?.remove();

  let dragSrc = null;
  // ── タッチ用 ── ゴーストは id='org-drag-ghost' でDOM管理し、変数スコープに依存しない
  let _touchSrc = null, _touchStartX = 0;
  function _touchStart(e) {
    const th = e.target.closest('.org-th-draggable');
    if (!th || e.target.closest('.rh')) return; // リサイズハンドルは除外
    _touchSrc = th.dataset.col;
    _touchStartX = e.touches[0].clientX;
    // 長押し判定: 300ms後にドラッグ開始
    th._dragTimer = setTimeout(() => {
      th.classList.add('org-th-dragging');
      // ゴーストを作成（既存があれば必ず除去してから1つだけ）
      document.getElementById('org-drag-ghost')?.remove();
      const ghost = th.cloneNode(true);
      ghost.id = 'org-drag-ghost';
      ghost.style.cssText = 'position:fixed;top:0;left:0;opacity:.7;pointer-events:none;z-index:9999;background:var(--surface2);padding:4px 8px;border-radius:4px;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      document.body.appendChild(ghost);
    }, 300);
  }
  function _touchMove(e) {
    if (!_touchSrc) return;
    const ghost = document.getElementById('org-drag-ghost');
    const t = e.touches[0];
    // 移動が少なければ何もしない（スクロールと区別）
    if (!ghost && Math.abs(t.clientX - _touchStartX) < 15) return;
    if (!ghost) return;
    e.preventDefault();
    ghost.style.left = (t.clientX - 30) + 'px';
    ghost.style.top = (t.clientY - 15) + 'px';
    // ドロップ先をハイライト
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el?.closest?.('.org-th-draggable');
    document.querySelectorAll('.org-th-draggable').forEach(h => h.classList.remove('org-th-drag-over'));
    if (target && target.dataset.col !== _touchSrc) target.classList.add('org-th-drag-over');
  }
  function _touchEnd(e) {
    const th = _touchSrc ? document.querySelector(`.org-th-draggable[data-col="${_touchSrc}"]`) : null;
    if (th?._dragTimer) clearTimeout(th._dragTimer);
    const ghost = document.getElementById('org-drag-ghost');
    if (_touchSrc && ghost) {
      // ドロップ先を特定
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const target = el?.closest?.('.org-th-draggable');
      if (target && target.dataset.col !== _touchSrc) {
        if (!window.orgDragReorderOverride?.(_touchSrc, target.dataset.col)) {
          const from = orgColOrder.indexOf(_touchSrc);
          const to   = orgColOrder.indexOf(target.dataset.col);
          if (from >= 0 && to >= 0) {
            orgColOrder.splice(from, 1);
            orgColOrder.splice(to, 0, _touchSrc);
            _saveOrgColPrefs();
            renderOrg();
          }
        }
      }
    }
    // ゴーストは常に削除（ドロップ有無・srcの有無に関わらず）
    ghost?.remove();
    document.querySelectorAll('.org-th-draggable').forEach(h => h.classList.remove('org-th-dragging', 'org-th-drag-over'));
    _touchSrc = null;
  }
  // thead への重複バインドを防止（ハンドラ蓄積 → ゴースト溜まりの根本原因）
  const thead = document.querySelector('.org-table thead');
  if (thead && !thead._orgDragBound) {
    thead._orgDragBound = true;
    thead.addEventListener('touchstart', _touchStart, { passive: true });
    thead.addEventListener('touchmove', _touchMove, { passive: false });
    thead.addEventListener('touchend', _touchEnd);
  }
  // ── デスクトップ: HTML5 Drag & Drop ──
  // dragSrc を window._orgDragSrc に持ち上げてリレンダリング時のリセットを防ぐ
  document.querySelectorAll('.org-th-draggable').forEach(th => {
    th.ondragstart = e => {
      window._orgDragSrc = th.dataset.col;
      th.classList.add('org-th-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', th.dataset.col);
    };
    th.ondragend = () => {
      window._orgDragSrc = null;
      document.querySelectorAll('.org-th-draggable').forEach(el => {
        el.classList.remove('org-th-dragging', 'org-th-drag-over');
      });
    };
    th.ondragover = e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.org-th-draggable').forEach(el => el.classList.remove('org-th-drag-over'));
      if (th.dataset.col !== window._orgDragSrc) th.classList.add('org-th-drag-over');
    };
    th.ondrop = e => {
      e.preventDefault();
      const src = window._orgDragSrc;
      if (!src || src === th.dataset.col) return;
      if (window.orgDragReorderOverride?.(src, th.dataset.col)) return;
      const from = orgColOrder.indexOf(src);
      const to   = orgColOrder.indexOf(th.dataset.col);
      if (from < 0 || to < 0) return;
      orgColOrder.splice(from, 1);
      orgColOrder.splice(to, 0, src);
      _saveOrgColPrefs();
      renderOrg();
    };
  });
}

// ── 整理タブ タグ列クリックでフィルターを開く（後方互換のため残す）──
export function openTagFilterFor(colKey, filterKey, thEl, highlightTag) { return; }

// ═══ Inline cell editing ═══

// タグの候補はユーザーの選択肢（tagPresets）から。組み込みの一覧（TB_VALUES 等）は読まない（v52.827）。
// その動画に付いているのに選択肢に無い値は、_openTagPicker が先頭に足すので外せる。
const _orgPresets = key => (window.tagPresets ? window.tagPresets(key) : []).filter(Boolean).slice();
const _INLINE_COLS = {
  memo:      { field: 'memo', type: 'text' },
  status:    { field: 'status', type: 'radio', opts: () => window.STATUS_CANON || [] },
};

// タグの列は枠のグループを編集する（段階3c）。候補は今までと同じ:
//   上下・カテゴリ … 選択肢だけ／ポジション・新しいグループ … 選択肢＋ほかの動画に付いている値／
//   テクニック … 選択肢＋ほかの動画に付いている値、新しい値を打ち込める
// 書き込みは動画パネルと同じ wkSetTagValue（そのグループの配列だけを触る）。
function _inlineCfg(col) {
  if (!_isOrgTagCol(col)) return _INLINE_COLS[col] || null;
  const g = _orgSlotGroup(col);
  if (!g) return null;
  const fromVideos = () => (window.videos || []).flatMap(x => _orgTagVals(x, g));
  const opts = (g.store === 'tb' || g.store === 'cat')
    ? () => (g.options || []).filter(Boolean).slice()
    : () => [...new Set([...(g.options || []), ...fromVideos()])].filter(Boolean).sort();
  return { group: g, type: 'tags', opts, allowNew: g.store === 'tags' };
}
function _inlineSet(v, g, val, on) {
  if (window.wkSetTagValue) return window.wkSetTagValue(v, g.id, val, on);
  // vpanel-v4.js が無いときの控え（今の4つだけ。新しいグループは書かない）
  if (!_ORG_FIELDS.includes(g.store)) return false;
  if (!Array.isArray(v[g.store])) v[g.store] = [];
  const i = v[g.store].indexOf(val);
  if (on && i < 0) v[g.store].push(val);
  if (!on && i >= 0) v[g.store].splice(i, 1);
  return true;
}
const _orgChipsHTML = tags => tags.map(t => `<span class="org-tag-chip">${_orgEsc(t)}</span>`).join('')
  || '<span style="font-size:10px;color:var(--text3)">—</span>';

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
  // ボタンやリンクの場合はスキップ
  if (e.target.closest && e.target.closest('button,a,input')) return;
  const tr = td.closest('tr.org-tr');
  if (!tr) return;
  const videoId = tr.id.replace('org-row-', '');
  e.preventDefault?.();
  e.stopPropagation?.();
  // counter列: ダブルクリック/ロングプレスで練習+1
  if (col === 'counter') {
    _orgBumpPractice(videoId, td);
    return;
  }
  if (!_inlineCfg(col)) return;
  _openOrgInlineEditor(videoId, col, td);
}

function _openOrgInlineEditor(videoId, col, td) {
  // 既存エディタを閉じる（保存）
  _closeOrgInlineEditor(true);
  const v = (window.videos || []).find(x => x.id === videoId);
  if (!v) return;
  const cfg = _inlineCfg(col);
  if (!cfg) return;
  const origHTML = td.innerHTML;
  td.classList.add('org-td-editing');

  _orgInlineActive = { videoId, col, td, origHTML, picker: null };

  if (cfg.type === 'tags') {
    _openTagPicker(v, cfg, col, td);
  } else if (cfg.type === 'radio') {
    _openRadioPicker(v, cfg, col, td);
  } else {
    _openMemoEditor(v, td);
  }
}

function _statusLabel(s) {
  const num = {'未着手':'1.','理解':'2.','練習中':'3.','マスター':'4.'};
  const ico = {'未着手':'📋','理解':'📖','練習中':'🔄','マスター':'⭐'};
  return (num[s]||'') + (ico[s]||'') + ' ' + (s||'未着手');
}
function _statusStyle(s) {
  if (s==='理解')   return 'background:rgba(47,158,68,.12);color:#2f9e44;border:1px solid rgba(47,158,68,.3)';
  if (s==='練習中')  return 'background:rgba(25,113,194,.12);color:#1971c2;border:1px solid rgba(25,113,194,.3)';
  if (s==='マスター') return 'background:rgba(107,63,212,.12);color:#6b3fd4;border:1px solid rgba(107,63,212,.3)';
  return 'background:var(--surface2);color:var(--text2);border:1px solid var(--border)';
}
function _statusSpan(s) {
  return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;display:inline-block;white-space:nowrap;${_statusStyle(s)}">${_statusLabel(s)}</span>`;
}

function _openRadioPicker(v, cfg, col, td) {
  const field = cfg.field;
  const opts = cfg.opts();

  const picker = document.createElement('div');
  picker.className = 'org-inline-picker';
  document.body.appendChild(picker);

  const rect = td.getBoundingClientRect();
  picker.style.left = Math.max(4, rect.left) + 'px';
  picker.style.top  = (rect.bottom + 4) + 'px';
  requestAnimationFrame(() => {
    const pr = picker.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8)  picker.style.left = Math.max(4, window.innerWidth - pr.width - 8) + 'px';
    if (pr.bottom > window.innerHeight - 8) picker.style.top = (rect.top - pr.height - 4) + 'px';
  });

  _orgInlineActive.picker = picker;

  const normV = window.normStatus(v[field]);
  opts.forEach(opt => {
    const btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;margin:2px 0;text-align:left;cursor:pointer;font-size:11px;padding:6px 10px;font-weight:700;font-family:inherit;border:none;border-radius:6px;background:' + (normV===opt ? 'var(--surface3)' : 'transparent');
    btn.textContent = _statusLabel(opt);
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      v[field] = opt;
      td.innerHTML = _statusSpan(opt);
      _inlineSave(v, td, col);
      _closeOrgInlineEditor(false);
    });
    picker.appendChild(btn);
  });

  // 外側クリックで閉じる（tag pickerと同じ50ms遅延パターン）
  setTimeout(() => {
    const handler = e => {
      if (picker.contains(e.target)) return;
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      _closeOrgInlineEditor(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    _orgInlineActive._outsideHandler = handler;
  }, 50);
}

function _openTagPicker(v, cfg, col, td) {
  const g = cfg.group;
  const cur = () => _orgTagVals(v, g);
  const current = cur();
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
    const tags = cur();
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
        _inlineSet(v, g, t, false);
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
    const _appendOpt = (opt) => {
      const lbl = document.createElement('label');
      lbl.className = 'org-inline-opt';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = cur().includes(opt);
      cb.style.cssText = 'accent-color:var(--accent);width:13px;height:13px;flex-shrink:0;cursor:pointer';
      cb.addEventListener('change', () => {
        _inlineSet(v, g, opt, cb.checked);
        refreshChips();
        _inlineSave(v, td, col);
      });
      const sp = document.createElement('span');
      sp.textContent = opt;
      sp.style.cssText = 'flex:1;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.appendChild(cb);
      lbl.appendChild(sp);
      listEl.appendChild(lbl);
    };
    // （旧テクニックの見出しは v52.833 で廃止。見出しで区切らずに並べる）
    filtered.forEach(_appendOpt);
    // 新規追加ボタン（technique + 検索テキストが既存にない場合）
    if (cfg.allowNew && ql && !fullOpts.some(o => o.toLowerCase() === ql)) {
      const addBtn = document.createElement('div');
      addBtn.style.cssText = 'padding:5px 8px;font-size:11px;color:var(--accent);cursor:pointer;border-top:1px solid var(--border);margin-top:4px';
      addBtn.textContent = `＋「${q}」を追加`;
      addBtn.addEventListener('click', () => {
        _inlineSet(v, g, q, true);
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
        _inlineSet(v, g, newTag, true);
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
  const cfg = _inlineCfg(col);
  if (!cfg || cfg.type !== 'tags') return;
  const inner = td.querySelector('.org-tag-cell');
  if (!inner) return;
  inner.innerHTML = _orgChipsHTML(_orgTagVals(v, cfg.group));
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

  const cfg = _inlineCfg(col);
  if (cfg?.type === 'tags') {
    // タグセルを最新値で再描画
    const v = (window.videos || []).find(x => x.id === videoId);
    if (v) td.innerHTML = `<div class="org-tag-cell">${_orgChipsHTML(_orgTagVals(v, cfg.group))}</div>`;
  } else if (cfg?.type === 'text') {
    const v = (window.videos || []).find(x => x.id === videoId);
    if (v) {
      td.innerHTML = `<div class="org-memo-text">${v.memo || '<span style="color:var(--text3);font-size:10px">—</span>'}</div>`;
    }
  } else if (cfg?.type === 'radio') {
    const v = (window.videos || []).find(x => x.id === videoId);
    if (v) {
      const sN = window.normStatus(v.status);
      td.innerHTML = _statusSpan(sN);
    }
  }

  _orgInlineActive = null;
}

// Esc でキャンセル
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _orgInlineActive) _closeOrgInlineEditor(false);
});

// ── Counter: 練習カウント+1 ──
function _orgBumpPractice(videoId, td) {
  const v = (window.videos || []).find(x => x.id === videoId);
  if (!v) return;
  v.practice = (v.practice || 0) + 1;
  v.lastPracticed = Date.now();
  // セルを即時更新
  const ago = window.vpCntFormatAgo?.(v.lastPracticed) || '';
  td.innerHTML = `<div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700">
    <span style="color:#e8590c">${v.practice}</span>
    <span style="font-size:9px;color:var(--text3);font-weight:600">${ago || '—'}</span>
  </div>`;
  // 短いフラッシュで視覚フィードバック
  td.style.transition = 'background .15s';
  td.style.background = 'rgba(232,89,12,.12)';
  setTimeout(() => { td.style.background = ''; }, 400);
  window.AF?.();
  window.toast?.(`🥋 練習 ${v.practice}回目を記録`);
}

// ── 列フィルター設定 ──
const _BLANK = '(空白)';
// タグの列は枠のグループで絞る。呼び名は tag-filter.js が決める（今の4つは tb/action/position/tags のまま）
function _colFilterCfg(col) {
  if (!_isOrgTagCol(col)) return _colFilterConfig[col] || null;
  const g = _orgSlotGroup(col);
  if (!g) return null;
  const key = window.tagFilter ? window.tagFilter.keyFor(g.id, 'org') : ({ tb:'tb', cat:'action', pos:'position', tags:'tags' }[g.store] || g.id);
  return { filterKey: key, valueGetter: v => { const a = _orgTagVals(v, g); return a.length ? a : [_BLANK]; } };
}
const _colFilterConfig = {
  channel:        { filterKey: 'channel',        valueGetter: v => { const c = v.channel||v.ch; return c ? [c] : [_BLANK]; }, panel: true },
  next:            { filterKey: 'next',            valueGetter: v => [v.next ? '🎯 Next' : '○ 未設定'], noSearch: true },
  counter:         { filterKey: 'counter',         valueGetter: v => {
    const pc = v.practice || 0;
    return [pc === 0 ? '未練習' : pc <= 3 ? '1〜3回' : pc <= 10 ? '4〜10回' : '11回以上'];
  }, noSearch: true },
  playlist:       { filterKey: 'playlist',       valueGetter: v => v.pl ? [v.pl] : [_BLANK], panel: true },
  fav:            { filterKey: 'fav',            valueGetter: v => [v.fav ? '★ お気に入り' : '☆ 未お気に入り'], noSearch: true },
  memo:           { filterKey: 'memo',           valueGetter: v => [v.memo ? 'あり'  : 'なし'], noSearch: true, memoTextSearch: true },
  addedAt:        { filterKey: 'addedAtFilter',  valueGetter: v => {
    if (!v.addedAt) return ['不明'];
    const d = new Date(v.addedAt);
    return [`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`];
  }},
  duration:       { filterKey: 'durationFilter', noSearch: true, valueGetter: v => {
    const s = v.duration || 0;
    return [!s ? '不明' : s < 300 ? '〜5分' : s < 900 ? '5〜15分' : s < 1800 ? '15〜30分' : '30分以上'];
  }},
  status:         { filterKey: 'status', noSearch: true, valueGetter: v => [window.normStatus(v.status)] },
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

  const cfg = _colFilterCfg(col);
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
  const sortableCols = ['channel','playlist','addedAt','duration','fav','next','counter','tb','action','position','technique','memo'];

  // ─ ドロップダウン構築 ─
  const dd = document.createElement('div');
  dd.id = 'org-col-filter-dd';
  dd.style.cssText = 'position:fixed;z-index:500;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:0 6px 28px rgba(0,0,0,.18);min-width:200px;max-width:360px;display:flex;flex-direction:column;gap:6px;font-size:12px';
  document.body.appendChild(dd);  // 先に追加して幅を取得

  // 位置決め: ヘッダー直下から始めてビューポート内に収める
  const rect = thEl.getBoundingClientRect();
  const z = parseFloat(document.body.style.zoom) || 1;
  let left = rect.left;
  const ddW = dd.offsetWidth || 210;
  if (left + ddW * z > window.innerWidth - 8) left = window.innerWidth - ddW * z - 8;
  dd.style.left = (Math.max(4, left) / z) + 'px';
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  if (spaceBelow >= 250) {
    dd.style.top = ((rect.bottom + 4) / z) + 'px';
    dd.style.bottom = 'auto';
    dd.style.maxHeight = (spaceBelow / z) + 'px';
  } else if (spaceAbove > spaceBelow) {
    dd.style.bottom = ((window.innerHeight - rect.top + 4) / z) + 'px';
    dd.style.top = 'auto';
    dd.style.maxHeight = (spaceAbove / z) + 'px';
  } else {
    dd.style.top = ((rect.bottom + 4) / z) + 'px';
    dd.style.bottom = 'auto';
    dd.style.maxHeight = (spaceBelow / z) + 'px';
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

  // ── メモ列: テキスト検索（ソート直後、フィルターの上）──
  if (cfg && cfg.memoTextSearch) {
    const memoWrap = document.createElement('div');
    memoWrap.style.cssText = 'padding-bottom:6px;border-bottom:1px solid var(--border)';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:4px';
    lbl.textContent = 'メモ内容で検索';
    memoWrap.appendChild(lbl);
    const memoInput = document.createElement('input');
    memoInput.type = 'text';
    memoInput.placeholder = 'キーワード...';
    memoInput.value = orgMemoSearch || '';
    memoInput.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface2);color:var(--text);outline:none';
    let _memoDebounce = null;
    memoInput.addEventListener('input', () => {
      clearTimeout(_memoDebounce);
      _memoDebounce = setTimeout(() => {
        orgMemoSearch = memoInput.value.trim();
        renderOrg(); _syncFiltIcon(col);
      }, 300);
    });
    memoWrap.appendChild(memoInput);
    dd.appendChild(memoWrap);
  }

  // ── チャンネル/プレイリスト: テキスト検索のみ ──
  if (col === 'channel' || col === 'playlist') {
    const _isC = col === 'channel';
    const _si = document.createElement('input');
    _si.type = 'text';
    _si.placeholder = _isC ? 'チャンネル名で検索...' : 'プレイリスト名で検索...';
    _si.value = (_isC ? orgChannelSearch : orgPlaylistSearch) || '';
    _si.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface2);color:var(--text);outline:none';
    let _deb = null;
    _si.addEventListener('input', () => {
      clearTimeout(_deb);
      _deb = setTimeout(() => {
        if (_isC) orgChannelSearch = _si.value.trim(); else orgPlaylistSearch = _si.value.trim();
        renderOrg(); _syncFiltIcon(col);
      }, 300);
    });
    dd.appendChild(_si);
    const _isTch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!_isTch) setTimeout(() => _si.focus(), 50);
  }
  // ── フィルターセクション ──
  if (cfg && sortedVals.length > 0 && col !== 'channel' && col !== 'playlist') {
    // 検索ボックス（選択肢が少ない列は非表示）
    let searchBox = null;
    if (!cfg.noSearch) {
      searchBox = document.createElement('input');
      searchBox.type = 'text';
      searchBox.placeholder = '検索...';
      searchBox.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface2);color:var(--text);outline:none';
      dd.appendChild(searchBox);
    }

    const isPanel = !!cfg.panel; // channel / playlist → パネル形式

    if (isPanel) {
      // ── パネル形式（Channel / Playlist）──
      if (searchBox) dd.removeChild(searchBox); // buildSbPickerInline が独自の検索ボックスを持つ
      const panelContainer = document.createElement('div');
      const panelId = '_org-col-picker-' + col;
      panelContainer.id = panelId;
      panelContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow-y:auto;min-height:0';
      dd.appendChild(panelContainer);
      window.buildSbPickerInline(panelId, cfg.filterKey, 'org');
    } else {
      // ── チェックボックス形式（タグ系列）──
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
        const _appendItem = (val) => {
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
        };
        // （旧テクニックの見出しは v52.833 で廃止。見出しで区切らずに並べる）
        filtered.forEach(_appendItem);
      };

      renderList('');
      if (searchBox) searchBox.addEventListener('input', () => renderList(searchBox.value));

      btnSelAll.addEventListener('click', () => {
        sortedVals.forEach(v => filterSet.add(v));
        renderList(searchBox ? searchBox.value : '');
        renderOrg(); _syncFiltIcon(col);
      });
      btnClear.addEventListener('click', () => {
        filterSet.clear();
        renderList(searchBox ? searchBox.value : '');
        renderOrg(); _syncFiltIcon(col);
      });
    }

    // スマホではキーボードが自動で立ち上がらないようにautofocusを抑制
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (searchBox && !isTouchDevice) requestAnimationFrame(() => searchBox.focus());
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
  const cfg = _colFilterCfg(col);
  let active = cfg && orgFilters[cfg.filterKey] && orgFilters[cfg.filterKey].size > 0;
  if (col === 'memo' && orgMemoSearch) active = true;
  if (col === 'channel' && orgChannelSearch) active = true;
  if (col === 'playlist' && orgPlaylistSearch) active = true;
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
window.toggleOrgThumb = toggleOrgThumb;
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
window.mkOrgChip = mkOrgChip;
window.showOrgFsBulkBtn = showOrgFsBulkBtn;
window.toggleOrgAcc = toggleOrgAcc;
window.renderOrgAccChips = renderOrgAccChips;
window.filterOrgAccChips = filterOrgAccChips;
window.adjustOrgTableHeight = adjustOrgTableHeight;
window.renderOrg = renderOrg;
window.syncOrgColHeaders = syncOrgColHeaders;
window.orgSetSort = orgSetSort;
window.orgTogFav = orgTogFav;
window.orgTogNext = orgTogNext;
window.orgTogDrill = orgTogDrill;
window.togOrgDrill = togOrgDrill;
window.initOrgResize = initOrgResize;
window.addResizeHandle = addResizeHandle;
window.orgTogSel = orgTogSel;
window.orgTogSelAll = orgTogSelAll;
window.toggleOrgColMenu = toggleOrgColMenu;
window._buildOrgColMenuHTML = _buildOrgColMenuHTML;
window.orgMoveCol = orgMoveCol;
window.bindOrgDrag = bindOrgDrag;
window.openTagFilterFor = openTagFilterFor;
window.openOrgColFilter  = openOrgColFilter;
window.closeOrgColFilter = closeOrgColFilter;
window.bulkRenamePl      = bulkRenamePl;
window.ORG_COL_LABELS = ORG_COL_LABELS;
window.orgColLabel    = orgColLabel;
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
  // 検索ボックスに設定（全部の入力欄とカスタムリストの表に同じ語を配る）
  window.wkSetSearchWord?.(q.trim());

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
  window._cvApplySearch?.(q.trim()); // カスタムビューのテーブルにも反映（描き直しもここ）
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
  window.wkSetSearchWord?.('');   // 4つの入力欄をまとめて空にする（js/search-word.js）
  window._cvApplySearch?.(''); // カスタムビューの検索もクリア
  renderOrg();
  window.AF?.();
}

export function saveAdvSearch() {
  applyAdvSearch();
  if (window.saveCurrentSearch) window.saveCurrentSearch();
}

window.toggleAdvSearch    = toggleAdvSearch;
window.applyAdvSearch     = applyAdvSearch;
window.clearAdvSearch     = clearAdvSearch;
window.saveAdvSearch      = saveAdvSearch;
// カスタムビューなど IIFE モジュール向けにクエリパーサーも公開
window._parseQuery        = _parseQuery;
window._matchQueryField   = _matchQueryField;
window._matchFieldSpecific = _matchFieldSpecific;
window._matchQuery        = _matchQuery;
// フィルターリセット用: _advSearch と si-org-pc をクリア（renderOrg/AF は呼ばない）
window._clearOrgSearchForReset = function() {
  _advSearch = null;
  window.wkSetSearchWord?.('', { silent: true });   // 4つの入力欄をまとめて空にする
};
