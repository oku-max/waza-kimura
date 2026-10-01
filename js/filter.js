// ═══ WAZA KIMURA — フィルター（Library） ═══
import { _parseQuery, _matchQuery } from './organize.js';

// ── URL ↔ フィルター状態の同期 ──
// タグ（tb/ac/pos/tech）は tag-filter.js が受け持つ。ここに書くとタグ1〜3の選択が URL に残らなかった
// （新しい呼び名 tbNew/cat/posNew を見ていなかったため）。
// マーク・習得は v52.876 から普通のタググループ（URL では g_mark / g_status）。
// 以前の URL（fav=1 / nxt=1 / st=…）は読むときだけ受け取る（_restoreFromURL）。
const _URL_SET_KEYS = {
  pl: 'playlist', ch: 'channel', pt: 'platform', prio: 'prio'
};
const _URL_BOOL_KEYS = { unw: 'unwOnly', wat: 'watchedOnly', bm: 'bmOnly', memo: 'memoOnly', img: 'imgOnly' };

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
  window.unwOnly = false; window.watchedOnly = false;
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
  // 以前の URL のマーク・習得（fav=1 / nxt=1 / st=…）は、マーク・習得のタグの選択として入れる
  if (_TF) {
    if (p.get('fav') === '1') _TF.setFor(window.filters, 'mark', 'lib').add('お気に入り');
    if (p.get('nxt') === '1') _TF.setFor(window.filters, 'mark', 'lib').add('Next');
    const st = p.get('st');
    if (st) st.split(',').forEach(v => _TF.setFor(window.filters, 'status', 'lib').add(decodeURIComponent(v)));
  }
  // Restore search text
  const q = p.get('q') || '';
  window.wkSetSearchWord?.(q);   // 検索語は1か所から配る（js/search-word.js）
  // Sync UI chips to match restored state
  _syncChipsToState();
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
    unwOnly:     ['chip-unw','m-chip-unw','fs-chip-unw2'],
    watchedOnly: ['chip-watched','fs-chip-watched'],
    bmOnly:      ['fs-chip-bm'],
    memoOnly:    ['fs-chip-memo'],
    imgOnly:     ['fs-chip-img']
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




export function togUnw() {
  window.unwOnly = !window.unwOnly;
  ['chip-unw','m-chip-unw','fs-chip-unw2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.unwOnly);
  });
  window.AF();
}

export function togWatched() {
  window.watchedOnly = !window.watchedOnly;
  ['chip-watched','fs-chip-watched'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.watchedOnly);
  });
  window.AF();
}

export function togBm() {
  window.bmOnly = !window.bmOnly;
  ['fs-chip-bm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.bmOnly);
  });
  window.AF();
}

export function togMemo() {
  window.memoOnly = !window.memoOnly;
  ['fs-chip-memo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.memoOnly);
  });
  window.AF();
}

export function togImg() {
  window.imgOnly = !window.imgOnly;
  ['fs-chip-img'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.imgOnly);
  });
  window.AF();
}

export function clearAll() {
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  window.unwOnly = false; window.watchedOnly = false;
  window.bmOnly = false; window.memoOnly = false; window.imgOnly = false;
  window.prRank = null; window.prDate = null;
  window.wkSetSearchWord?.('');   // 4つの入力欄をまとめて空にする（半分だけ残さない）
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

// 保存した絞り込み（filterPresets）: 一覧・読み込み・削除の画面は v52.873 で削除（表示先が旧オーバーレイの中だけだった）。
// データは消さない。設定の保存（firebase.js）・バックアップがこの値を読むので、読み込みと同期はそのまま続ける
// （ここを消すと、次の設定の保存で空の配列を書いてしまう）。
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
}









export function resetFilters() { clearAll(); }

export function updateResetBtn() {
  const btn = document.getElementById('filter-reset-btn'); if (!btn) return;
  const active = Object.values(window.filters).some(s => s.size > 0) || window.unwOnly || window.watchedOnly || window.bmOnly || window.memoOnly;
  btn.style.display = active ? 'inline-block' : 'none';
}

// ── フィルタリング本体 ──
export function filt(list) {
  // カード型カスタムビュー: IDでプールを絞るが、その後の全フィルターは通常通り適用
  // 開いているリストの範囲は1か所から読む（js/custom-view.js の wkListScope）
  const _scope = window.wkListScope ? window.wkListScope() : (window._cvCardVideoIds || null);
  if (_scope) list = list.filter(v => _scope.has(v.id));
  // 検索語は1か所から読む（js/search-word.js）。ビューごとに別の入力欄を見ると、
  // 同じ語で「テーブルには出るのにカードは0本」になる。
  const raw = window.wkSearchWord ? window.wkSearchWord() : '';
  const parsed = _parseQuery(raw);
  // タグの条件は tag-filter.js で1回だけ組み立てる（どの呼び名で入っていても同じグループとして読む）。
  // 古い呼び名に入っている分は先に今の呼び名へ寄せる（今の呼び名を直接読む箇所に、見えない条件を残さない）
  window.tagFilter?.normalize(window.filters, 'lib');
  const _tagOk = window.tagFilter ? window.tagFilter.compile(window.filters, 'lib') : () => true;
  const conds = _libConds(parsed, _tagOk);
  return list.filter(v => conds.every(c => c.ok(v)));
}

// ── 絞り込みの条件を「名前つきの並び」で持つ ──
// filt() と「なぜ消えたか」の説明が、同じ並びの同じ判定を使う（片方だけ古くならないように）。
// 順番と判定の中身は、1つ前の filt() と同じ。
function _libConds(parsed, tagOk) {
  const F = () => window.filters;
  return [
    { name: 'アーカイブ済み',         ok: v => !v.archived },
    { name: '未視聴だけ',              ok: v => !(window.unwOnly   && v.watched) },
    { name: '視聴済みだけ',            ok: v => !(window.watchedOnly && !v.watched) },
    { name: 'ブックマークがあるものだけ', ok: v => !(window.bmOnly && !(v.bookmarks && v.bookmarks.length > 0)) },
    { name: 'メモがあるものだけ',      ok: v => !(window.memoOnly && !v.memo) },
    { name: '画像があるものだけ',      ok: v => !(window.imgOnly && !(v.snapshots && v.snapshots.length > 0)) },
    // 「進捗ランク」「練習した時期」（古い練習回数の絞り込み）は v52.890 で廃止。保存済みの状態が残っていても効かせない
    { name: 'ソース（YouTube/Drive等）', ok: v => !(F().platform.size && !F().platform.has(v.pt)) },
    { name: 'ワード検索',              ok: v => _matchQuery(v, parsed, null) },
    { name: 'プレイリスト',            ok: v => !(F().playlist.size && !F().playlist.has(v.pl)) },
    { name: '優先度',                  ok: v => !(F().prio.size && !F().prio.has(v.prio)) },
    { name: 'タグ',                    ok: v => tagOk(v) },
    { name: 'チャンネル',              ok: v => !(F().channel.size && !F().channel.has(v.channel || v.ch)) },
    { name: '動画の指定',              ok: v => !(F().videoIds?.size && !F().videoIds.has(v.id)) },
    { name: '絞り込み画面の検索', ok: v => {
        if (!window._uniVideoQ) return true;
        return [(v.title||'').toLowerCase(), (v.channel||v.ch||'').toLowerCase()].join(' ').includes(window._uniVideoQ);
      } },
  ];
}

// ── どの条件が何本消しているか（読むだけ。内訳ダイアログが使う）──
// 推測しないで済むように、画面がそのまま名前で答える。
// 1本につき「最初に外した条件」を1つ数える（filt() と同じ順番）。
window.wkWhyHidden = function () {
  const all = window.videos || [];
  let list = all;
  const sc = window.wkListScope ? window.wkListScope() : null;
  if (sc) list = list.filter(v => sc.has(v.id));
  const raw = window.wkSearchWord ? window.wkSearchWord() : '';
  const parsed = _parseQuery(raw);
  window.tagFilter?.normalize(window.filters, 'lib');
  const tagOk = window.tagFilter ? window.tagFilter.compile(window.filters, 'lib') : () => true;
  const conds = _libConds(parsed, tagOk);
  const cnt = new Map();
  let shown = 0;
  for (const v of list) {
    const c = conds.find(x => !x.ok(v));
    if (!c) { shown++; continue; }
    const e = cnt.get(c.name) || { name: c.name, n: 0, ex: [] };
    e.n++;
    if (e.ex.length < 2) e.ex.push(v.title || v.id);
    cnt.set(c.name, e);
  }
  return {
    word: raw,
    scope: list.length,
    shown,
    rows: [...cnt.values()].sort((a, b) => b.n - a.n),
  };
};

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
    // 本数の内訳（ⓘ）はオーナー（管理者）のときだけ開ける（v52.893）。ほかの人には本数だけ出す
    const _own = !!window.wkIsOwner?.();
    rc.style.cursor = _own ? 'pointer' : '';
    rc.title = _own ? '本数の内訳を見る' : '';
    const main = document.createElement('span');
    // 合計時間はテーブル表示と同じ書式（v52.910・オーナー「カード表示にも合計時間を」）。長さが分からなければ従来どおり
    const _dur = window._wkTotalDurLabel?.(f) || '';
    main.textContent = _dur ? f.length + ' 本' + _dur : f.length + ' 本 表示中';
    rc.appendChild(main);
    // 「／非表示 N本」は出さない（v52.894・オーナー「いらない」）。内訳はオーナーの ⓘ から
    if (_own) {
      const sub = document.createElement('span');
      sub.style.cssText = 'margin-left:6px;color:var(--text3);opacity:.85';
      sub.textContent = 'ⓘ';
      rc.appendChild(sub);
    }
    rc.onclick = _own ? () => window.wkVideoAuditOpen?.() : null;
  }
  const rct = document.getElementById('rc-topbar');
  if (rct) {
    const hasFilter = Object.values(window.filters).some(s => s.size > 0) || window.unwOnly || window.watchedOnly || !!(window.wkSearchWord?.());
    rct.textContent = f.length + ' 件';
    rct.style.display = hasFilter ? 'inline' : 'none';
  }
  const tc = document.getElementById('totalCount'); if (tc) tc.textContent = total + ' videos';
  const sc = document.getElementById('snav-cnt'); if (sc) sc.textContent = total;
  if (window.bulkMode) window.updBulk?.();
  updateResetBtn();
  _syncURL();
}

