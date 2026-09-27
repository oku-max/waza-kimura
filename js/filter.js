// ═══ WAZA KIMURA — フィルター（Library） ═══
import { _parseQuery, _matchQuery } from './organize.js';

// ── URL ↔ フィルター状態の同期 ──
// タグ（tb/ac/pos/tech）は tag-filter.js が受け持つ。ここに書くとタグ1〜3の選択が URL に残らなかった
// （新しい呼び名 tbNew/cat/posNew を見ていなかったため）。
const _URL_SET_KEYS = {
  pl: 'playlist', ch: 'channel', pt: 'platform', prio: 'prio', st: 'status'
};
const _URL_BOOL_KEYS = { fav: 'favOnly', nxt: 'nextOnly', unw: 'unwOnly', wat: 'watchedOnly', bm: 'bmOnly', memo: 'memoOnly', img: 'imgOnly' };

let _urlSyncPaused = false;

export function _syncURL() {
  if (_urlSyncPaused) return;
  // カスタムビュー表示中は絞り込み状態を URL に載せない。
  // URL(?q= 等)は master 用の共有/復元機構。カスタムビューのワードやタグは view 側
  // (view.searchQuery / セッションスナップショット)で保持・復元されるため、ここで URL に
  // 書くと、リロードで master に戻った際に _restoreFromURL がワードを master へ復元してしまい
  // 「master に戻ったのに検索欄にワードが残る」不自然さの原因になる。CV 中は URL を空にする。
  if (window._cvActiveViewId || window._cvVideoIds || window._cvCardVideoIds) {
    history.replaceState(null, '', location.pathname);
    return;
  }
  const p = new URLSearchParams();
  // Set filters
  for (const [param, key] of Object.entries(_URL_SET_KEYS)) {
    const s = window.filters[key];
    if (s && s.size) p.set(param, [...s].map(v => encodeURIComponent(v)).join(','));
  }
  // タグ: どの呼び名で選ばれていても、URL の呼び名で書く
  const _TF = window.tagFilter;
  if (_TF) _TF.groups().forEach(g => {
    const s = _TF.selected(window.filters, g.id, 'lib');
    if (s.size) p.set(_TF.keyFor(g.id, 'url'), [...s].map(v => encodeURIComponent(v)).join(','));
  });
  // Boolean flags
  for (const [param, key] of Object.entries(_URL_BOOL_KEYS)) {
    if (window[key]) p.set(param, '1');
  }
  // Search text
  const q = window.wkSearchWord ? window.wkSearchWord() : '';   // 検索語は1か所から（js/search-word.js）
  if (q) p.set('q', q);
  const qs = p.toString();
  const url = location.pathname + (qs ? '?' + qs : '');
  history.replaceState(null, '', url);
}

export function _restoreFromURL() {
  const p = new URLSearchParams(location.search);
  if (!p.toString()) return; // no filter params — nothing to restore
  _urlSyncPaused = true;
  // Clear existing state
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  window.favOnly = false; window.nextOnly = false; window.drillOnly = false; window.unwOnly = false; window.watchedOnly = false;
  window.bmOnly = false; window.memoOnly = false; window.imgOnly = false;
  // Restore Set filters
  for (const [param, key] of Object.entries(_URL_SET_KEYS)) {
    const raw = p.get(param);
    if (raw) raw.split(',').forEach(v => window.filters[key].add(decodeURIComponent(v)));
  }
  // タグ: URL の呼び名から、ライブラリの呼び名（絞り込み本体が見ている方）へ入れる
  const _TF = window.tagFilter;
  if (_TF) for (const [param, raw] of p.entries()) {
    const gid = _TF.gidForKey(param, 'url');
    if (gid && raw) raw.split(',').forEach(v => _TF.setFor(window.filters, gid, 'lib').add(decodeURIComponent(v)));
  }
  // Restore booleans
  for (const [param, key] of Object.entries(_URL_BOOL_KEYS)) {
    if (p.get(param) === '1') window[key] = true;
  }
  // Restore search text
  const q = p.get('q') || '';
  window.wkSetSearchWord?.(q);   // 検索語は1か所から配る（js/search-word.js）
  // Sync UI chips to match restored state
  _syncChipsToState();
  window.syncFilterOvRows?.();
  window.buildSidebarFovRows?.();
  window.refreshOpenSbAccordions?.();
  _urlSyncPaused = false;
  window.AF?.();
}

export function _syncChipsToState() {
  // Platform chips
  ['chip-yt','m-chip-yt'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.filters.platform.has('youtube'));
  });
  ['chip-vimeo','m-chip-vimeo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.filters.platform.has('vimeo'));
  });
  // Boolean toggle chips
  const boolChips = {
    favOnly:     ['chip-fav','m-chip-fav','fs-chip-fav2','fov-chip-fav'],
    drillOnly:   ['fov-chip-drill'],
    unwOnly:     ['chip-unw','m-chip-unw','fs-chip-unw2','fov-chip-unw'],
    watchedOnly: ['chip-watched','fs-chip-watched','fov-chip-watched'],
    bmOnly:      ['fov-chip-bm','fs-chip-bm'],
    memoOnly:    ['fov-chip-memo','fs-chip-memo'],
    imgOnly:     ['fov-chip-img','fs-chip-img']
  };
  for (const [key, ids] of Object.entries(boolChips)) {
    ids.forEach(id => {
      const el = document.getElementById(id); if (el) el.classList.toggle('active', !!window[key]);
    });
  }
  // Search clear button
  const siClear = document.getElementById('si-clear');
  if (siClear) siClear.style.display = (window.wkSearchWord?.()) ? 'flex' : 'none';
}

// popstate は index.html の一元バックボタンハンドラに統合済み

// ── 基本フィルタートグル ──
export function togF(type, val, el) {
  window.filters[type].has(val)
    ? (window.filters[type].delete(val), el.classList.remove('active'))
    : (window.filters[type].add(val), el.classList.add('active'));
  window.AF();
}

export function togPlat(p) {
  window.filters.platform.has(p) ? window.filters.platform.delete(p) : window.filters.platform.add(p);
  const isYT = p === 'youtube';
  [isYT ? 'chip-yt' : 'chip-vimeo', isYT ? 'm-chip-yt' : 'm-chip-vimeo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', window.filters.platform.has(p));
  });
  window.AF();
}

export function togFav() {
  window.favOnly = !window.favOnly;
  ['chip-fav','m-chip-fav','fs-chip-fav2','fov-chip-fav'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.favOnly);
  });
  window.AF();
}

export function togNext() {
  window.nextOnly = !window.nextOnly;
  ['fov-chip-next'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.nextOnly);
  });
  window.AF();
}

export function togDrill() {
  window.drillOnly = !window.drillOnly;
  ['fov-chip-drill'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.drillOnly);
  });
  window.AF();
}

export function togUnw() {
  window.unwOnly = !window.unwOnly;
  ['chip-unw','m-chip-unw','fs-chip-unw2','fov-chip-unw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.unwOnly);
  });
  window.AF();
}

export function togWatched() {
  window.watchedOnly = !window.watchedOnly;
  ['chip-watched','fs-chip-watched','fov-chip-watched'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.watchedOnly);
  });
  window.AF();
}

export function togBm() {
  window.bmOnly = !window.bmOnly;
  ['fov-chip-bm','fs-chip-bm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.bmOnly);
  });
  window.AF();
}

export function togMemo() {
  window.memoOnly = !window.memoOnly;
  ['fov-chip-memo','fs-chip-memo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.memoOnly);
  });
  window.AF();
}

export function togImg() {
  window.imgOnly = !window.imgOnly;
  ['fov-chip-img','fs-chip-img'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.imgOnly);
  });
  window.AF();
}

export function clearAll() {
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  window.favOnly = false; window.nextOnly = false; window.drillOnly = false; window.unwOnly = false; window.watchedOnly = false;
  window.bmOnly = false; window.memoOnly = false; window.imgOnly = false;
  window.prRank = null; window.prDate = null;
  window.wkSetSearchWord?.('');   // 4つの入力欄をまとめて空にする（半分だけ残さない）
  window.syncFilterOvRows?.();
  document.querySelectorAll('[id^="fs-chip-"],[id^="chip-"],[id^="m-chip-"]').forEach(el => el.classList.remove('active'));
  window.buildSidebarFovRows?.();
  window.refreshOpenSbAccordions?.();
  window._clearOrgSearchForReset?.(); // _advSearch + si-org-pc + si-org をクリア
  window._cvClearFilters?.();         // カスタムビューの _cvSrchQ・列フィルターもリセット
  window.AF?.();
}

// ── フィルタープリセット ──
export let filterPresets = JSON.parse(localStorage.getItem('wk_filterPresets') || '[]');
export let orgFilterPresets = filterPresets; // エイリアス（後方互換）

export function saveFilterPresets() {
  localStorage.setItem('wk_filterPresets', JSON.stringify(filterPresets));
  window.saveUserSettings?.();   // Firebaseにも保存
}
export function saveOrgFilterPresets() {
  saveFilterPresets();
}

// Firebase復元時に呼ばれる — ローカルと統合（上書きしない）
export function loadFilterPresetsFromRemote(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    // Firebaseが空でもローカルにデータがあれば逆同期
    if (filterPresets.length > 0) window.saveUserSettings?.();
    return;
  }
  const localNames = new Set(filterPresets.map(p => p.name));
  let added = false;
  arr.forEach(p => {
    if (!localNames.has(p.name)) { filterPresets.push(p); added = true; }
  });
  if (added) {
    localStorage.setItem('wk_filterPresets', JSON.stringify(filterPresets));
    window.saveUserSettings?.(); // Firebaseにも最新を保存
  }
  window.renderFilterPresets?.();
}

export function saveFilterPreset() {
  const name = document.getElementById('fov-save-name').value.trim();
  if (!name) { window.toast('条件名を入力してください'); return; }
  const snapshot = {
    name,
    filters: Object.fromEntries(Object.entries(window.filters).map(([k,v]) => [k,[...v]])),
    favOnly: window.favOnly, unwOnly: window.unwOnly, watchedOnly: window.watchedOnly
  };
  const idx = filterPresets.findIndex(p => p.name === name);
  if (idx >= 0) filterPresets[idx] = snapshot; else filterPresets.push(snapshot);
  saveFilterPresets();
  document.getElementById('fov-save-name').value = '';
  renderFilterPresets();
  window.toast('🔖 「' + name + '」を保存しました');
}

export function saveOrgFilterPreset() {
  const name = document.getElementById('org-fov-save-name').value.trim();
  if (!name) { window.toast('条件名を入力してください'); return; }
  const snapshot = {
    name,
    filters: Object.fromEntries(Object.entries(window.orgFilters).map(([k,v]) => [k,[...v]])),
    favOnly: window.orgFavOnly, unwOnly: window.orgUnwOnly
  };
  const idx = orgFilterPresets.findIndex(p => p.name === name);
  if (idx >= 0) orgFilterPresets[idx] = snapshot; else orgFilterPresets.push(snapshot);
  saveOrgFilterPresets();
  document.getElementById('org-fov-save-name').value = '';
  renderOrgFilterPresets();
  window.toast('🔖 「' + name + '」を保存しました');
}

export function loadFilterPreset(idx) {
  const p = filterPresets[idx]; if (!p) return;
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  const fs = p.filters || {};
  Object.keys(fs).forEach(k => { if (window.filters[k]) fs[k].forEach(v => window.filters[k].add(v)); });
  window.tagFilter?.fromPlain(fs, window.filters, 'lib', 'lib');   // タグはどの呼び名で保存されていても入れる
  window.favOnly    = p.favOnly    || false;
  window.unwOnly    = p.unwOnly    || false;
  window.watchedOnly = p.watchedOnly || false;
  window.syncFilterOvRows?.();
  window.AF?.();
  window.closeFilterOverlay?.();
  window.toast('🔖 「' + p.name + '」を読み込みました');
}

export function deleteFilterPreset(idx) {
  const name = filterPresets[idx] ? filterPresets[idx].name : '';
  filterPresets.splice(idx, 1);
  saveFilterPresets();
  renderFilterPresets();
  window.toast('🗑 「' + name + '」を削除しました');
}

export function renderOrgFilterPresets() {
  renderFilterPresets();
}

export function loadOrgFilterPreset(idx) {
  const p = orgFilterPresets[idx]; if (!p) return;
  Object.keys(window.orgFilters).forEach(k => window.orgFilters[k].clear());
  const fs = p.filters || {};
  Object.keys(fs).forEach(k => { if (window.orgFilters[k]) fs[k].forEach(v => window.orgFilters[k].add(v)); });
  // タグはどの呼び名で保存されていても整理の表の呼び名で入れる（同じ名前で写すだけだと tbNew/cat/posNew が落ちていた）
  window.tagFilter?.fromPlain(fs, window.orgFilters, 'lib', 'org');
  window.orgFavOnly = p.favOnly || false;
  window.orgUnwOnly = p.unwOnly || false;
  window.syncOrgFilterOvRows?.();
  window.renderOrg?.();
  window.closeOrgFilterOverlay?.();
  window.toast('🔖 「' + p.name + '」を読み込みました');
}

export function deleteOrgFilterPreset(i) {
  deleteFilterPreset(i);
}

export function renderFilterPresets() {
  // オーバーレイのプリセットのみ管理。サイドバー(fs-saved-list, org-fs-saved-list)はrenderSavedSearchesが担当
  const makeHTML = (loadFn) => {
    if (!filterPresets.length) {
      return '<div style="font-size:10px;color:var(--text3);padding:4px 0">保存した検索条件はありません</div>';
    }
    return filterPresets.map(function(p, i) {
      const count = (window.videos||[]).filter(function(v) {
        if (v.archived) return false;
        if (p.favOnly && !v.fav) return false;
        if (p.unwOnly && v.watched) return false;
        if (p.watchedOnly && !v.watched) return false;
        const fs = p.filters || {};
        if (fs.platform && fs.platform.length && !fs.platform.includes(v.pt)) return false;
        if (fs.playlist && fs.playlist.length && !fs.playlist.includes(v.pl)) return false;
        if (fs.prio && fs.prio.length && !fs.prio.includes(v.prio)) return false;
        if (fs.status && fs.status.length && !fs.status.includes(v.status)) return false;
        if (window.tagFilter && !window.tagFilter.match(v, fs, 'lib')) return false;
        if (fs.channel && fs.channel.length && !fs.channel.includes(v.channel || v.ch)) return false;
        return true;
      }).length;
      const badge = '<span style="font-size:9px;background:var(--accent);color:var(--on-accent);border-radius:8px;padding:1px 6px;margin-left:5px;font-weight:700">'+count+'</span>';
      return '<div class="chip" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-bottom:3px;max-width:100%">'
        + '<span onclick="'+loadFn+'('+i+')" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">'+p.name+badge+'</span>'
        + '<span style="color:var(--text3);font-size:12px;flex-shrink:0;padding-left:4px" onclick="deleteFilterPreset('+i+')">×</span>'
        + '</div>';
    }).join('');
  };
  const libOv = document.getElementById('fov-preset-list');
  if (libOv) libOv.innerHTML = makeHTML('loadFilterPreset');
  const orgOv = document.getElementById('org-fov-preset-list');
  if (orgOv) orgOv.innerHTML = makeHTML('loadOrgFilterPreset');
}

export function resetFilters() { clearAll(); }

export function updateResetBtn() {
  const btn = document.getElementById('filter-reset-btn'); if (!btn) return;
  const active = Object.values(window.filters).some(s => s.size > 0) || window.favOnly || window.nextOnly || window.drillOnly || window.unwOnly || window.watchedOnly || window.bmOnly || window.memoOnly;
  btn.style.display = active ? 'inline-block' : 'none';
}

// ── フィルタリング本体 ──
export function filt(list) {
  // カード型カスタムビュー: IDでプールを絞るが、その後の全フィルターは通常通り適用
  if (window._cvCardVideoIds) list = list.filter(v => window._cvCardVideoIds.has(v.id));
  // 検索語は1か所から読む（js/search-word.js）。ビューごとに別の入力欄を見ると、
  // 同じ語で「テーブルには出るのにカードは0本」になる。
  const raw = window.wkSearchWord ? window.wkSearchWord() : '';
  const parsed = _parseQuery(raw);
  // タグの条件は tag-filter.js で1回だけ組み立てる（どの呼び名で入っていても同じグループとして読む）。
  // 古い呼び名に入っている分は先に今の呼び名へ寄せる（今の呼び名を直接読む箇所に、見えない条件を残さない）
  window.tagFilter?.normalize(window.filters, 'lib');
  const _tagOk = window.tagFilter ? window.tagFilter.compile(window.filters, 'lib') : () => true;
  return list.filter(v => {
    if (v.archived) return false;
    if (window.favOnly   && !v.fav)   return false;
    if (window.nextOnly  && !v.next)  return false;
    if (window.drillOnly && !v.drill) return false;
    if (window.unwOnly  && v.watched) return false;
    if (window.watchedOnly && !v.watched) return false;
    if (window.bmOnly && !(v.bookmarks && v.bookmarks.length > 0)) return false;
    if (window.memoOnly && !v.memo) return false;
    if (window.imgOnly && !(v.snapshots && v.snapshots.length > 0)) return false;
    // 進捗ランク (自動導出) フィルター
    if (window.prRank != null && window.vpCntRank) {
      if (String(window.vpCntRank(v.practice).lv) !== String(window.prRank)) return false;
    }
    if (window.prDate) {
      const lp = v.lastPracticed || 0;
      const now = Date.now();
      const days = lp ? (now - lp) / 86400000 : Infinity;
      if (window.prDate === 'week'  && !(lp && days <= 7))  return false;
      if (window.prDate === 'month' && !(lp && days <= 30)) return false;
      if (window.prDate === 'stale' && !(lp && days > 30))  return false;
      if (window.prDate === 'never' && lp)                  return false;
    }
    if (window.filters.platform.size && !window.filters.platform.has(v.pt)) return false;
    // ── 検索演算子 (-除外 / "完全一致" / field:値 / フレーズ) ──
    if (!_matchQuery(v, parsed, null)) return false;
    if (window.filters.playlist.size && !window.filters.playlist.has(v.pl)) return false;
    if (window.filters.prio.size && !window.filters.prio.has(v.prio)) return false;
    if (window.filters.status.size && !window.filters.status.has(v.status)) return false;
    if (!_tagOk(v)) return false;
    if (window.filters.channel.size && !window.filters.channel.has(v.channel || v.ch)) return false;
    if (window.filters.videoIds?.size && !window.filters.videoIds.has(v.id)) return false;
    if (window._uniVideoQ) {
      const hay = [(v.title||'').toLowerCase(), (v.channel||v.ch||'').toLowerCase()].join(' ');
      if (!hay.includes(window._uniVideoQ)) return false;
    }
    return true;
  });
}

// ── コンテキスト件数：現在のフィルター状態を考慮した件数 ──
// key以外のアクティブなフィルターを適用した上で、そのkeyにvalを追加したときの件数を返す
export function countContextual(key, val, ctx = 'lib') {
  const vids = window.videos || [];
  const TF = window.tagFilter;
  const gid = TF ? TF.gidForKey(key, 'org') : null;   // タグの呼び名なら、そのグループ
  const has = v => {
    if (gid) return TF.valuesOf(v, gid).includes(val);
    if (key === 'playlist') return v.pl === val;
    if (key === 'channel')  return (v.channel || v.ch) === val;
    if (key === 'status')   return v.status === val;
    if (key === 'prio')     return v.prio === val;
    if (key === 'platform') return v.pt === val;
    return false;
  };
  // 整理の表: 表そのものの絞り込み（orgFilt）から、この項目の条件だけを外して数える。
  // 以前はここでもライブラリの条件を読んでいて、整理の表の件数が合わなかった。
  if (ctx === 'org' && window.orgFilt && window.orgFilters) {
    const of = window.orgFilters;
    const saved = {};
    const keys = gid ? TF.FIELD_KEYS[TF.fieldOf(gid)]?.alias.concat(TF.keyFor(gid, 'org')) || [TF.keyFor(gid, 'org')] : [key];
    keys.forEach(k => { if (of[k] instanceof Set) { saved[k] = new Set(of[k]); of[k].clear(); } });
    let n = 0;
    try { n = window.orgFilt(vids).filter(has).length; }
    finally { Object.entries(saved).forEach(([k, s]) => { of[k].clear(); s.forEach(x => of[k].add(x)); }); }
    return n;
  }
  const f    = window.filters || {};
  const raw = window.wkSearchWord ? window.wkSearchWord() : '';
  const parsed = _parseQuery(raw);
  const _tagOk = TF ? TF.compile(f, 'lib', { except: gid }) : () => true;
  return vids.filter(v => {
    if (v.archived) return false;
    if (window.favOnly     && !v.fav)                                    return false;
    if (window.nextOnly    && !v.next)                                   return false;
    if (window.unwOnly     && v.watched)                                 return false;
    if (window.watchedOnly && !v.watched)                                return false;
    if (window.bmOnly      && !(v.bookmarks && v.bookmarks.length > 0)) return false;
    if (window.memoOnly    && !v.memo)                                   return false;
    if (window.imgOnly     && !(v.snapshots && v.snapshots.length > 0)) return false;
    if (!_matchQuery(v, parsed, null)) return false;
    // key以外のフィルターを適用
    if (key !== 'platform' && f.platform?.size && !f.platform.has(v.pt))                      return false;
    if (key !== 'playlist' && f.playlist?.size && !f.playlist.has(v.pl))                      return false;
    if (key !== 'prio'     && f.prio?.size     && !f.prio.has(v.prio))                        return false;
    if (key !== 'status'   && f.status?.size   && !f.status.has(v.status))                    return false;
    if (!_tagOk(v)) return false;
    if (key !== 'channel'  && f.channel?.size  && !f.channel.has(v.channel || v.ch))           return false;
    // このvalが該当するか
    return has(v);
  }).length;
}
export function cntBadge(n) {
  if (!n) return '';
  return `<span style="font-size:9px;background:var(--surface3);color:var(--text2);border-radius:8px;padding:1px 5px;margin-left:4px;font-weight:600">${n}</span>`;
}

// ── ソート ──
export function sortVideos(list) {
  const key = window.sortKey || 'addedAt';
  const asc = window.sortAsc !== false;
  const sorted = [...list];
  sorted.sort((a, b) => {
    let va, vb;
    if (key === 'addedAt') {
      const ea = !a.addedAt, eb = !b.addedAt;
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      va = a.addedAt;
      vb = b.addedAt;
    } else if (key === 'title') {
      va = (a.title || '').toLowerCase();
      vb = (b.title || '').toLowerCase();
    } else if (key === 'status') {
      va = window.statusRank(a.status);
      vb = window.statusRank(b.status);
    } else if (key === 'lastPlayed') {
      va = a.lastPlayed || 0;
      vb = b.lastPlayed || 0;
    } else if (key === 'duration') {
      va = a.duration || 0;
      vb = b.duration || 0;
    }
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
  return sorted;
}

// ── AF（Apply Filters）：全体再描画 ──
export function AF() {
  const f = sortVideos(filt(window.videos));
  window._vpFilteredList = f;
  window.renderCards(f, 'cardList');
  const total = (window.videos||[]).filter(v => !v.archived).length;
  // 件数はタップで内訳（絞り込み・アーカイブ・クラウドの中身）を開けるようにする。
  // 表記は従来どおりのテキストノードのまま残し、非表示ぶんは別spanで添える（i18nのテンプレ訳を壊さない）。
  const rc = document.getElementById('rc');
  if (rc) {
    const hidden = Math.max(0, (window.videos || []).length - f.length);
    rc.textContent = '';
    rc.style.cursor = 'pointer';
    rc.title = '本数の内訳を見る';
    const main = document.createElement('span');
    main.textContent = f.length + ' 本 表示中';
    rc.appendChild(main);
    if (hidden > 0) {
      const sub = document.createElement('span');
      sub.style.cssText = 'margin-left:6px;color:var(--text3);opacity:.85';
      sub.textContent = `／非表示 ${hidden}本 ⓘ`;
      rc.appendChild(sub);
    }
    rc.onclick = () => window.wkVideoAuditOpen?.();
  }
  const rct = document.getElementById('rc-topbar');
  if (rct) {
    const hasFilter = Object.values(window.filters).some(s => s.size > 0) || window.favOnly || window.unwOnly || window.watchedOnly || !!(window.wkSearchWord?.());
    rct.textContent = f.length + ' 件';
    rct.style.display = hasFilter ? 'inline' : 'none';
  }
  const fhn = document.getElementById('fov-hit-num'); if (fhn) fhn.textContent = f.length;
  const fhb = document.getElementById('fov-hit-badge'); if (fhb) fhb.textContent = f.length + ' 件';
  const tc = document.getElementById('totalCount'); if (tc) tc.textContent = total + ' videos';
  const sc = document.getElementById('snav-cnt'); if (sc) sc.textContent = total;
  if (window.bulkMode) window.updBulk?.();
  updateResetBtn();
  _syncURL();
}

