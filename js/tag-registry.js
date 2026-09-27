// ═══ タググループの一覧（段階1: 土台。画面はまだ変えない）═══
//
// タグ1〜4 に何が入っているか、と、しまってあるもの（未使用のタググループ）を持つ。
// 動画のタグは今の保存場所のまま読む（書き写さない）:
//   store:'tb'|'cat'|'pos'|'tags' … v.tb / v.cat / v.pos / v.tags。名前と選択肢は tagSettings から読む
//   store:'mark'                  … v.fav / v.next / v.drill（★とNextの連動は今のボタンの処理が持つ）
//   store:'status'                … v.status（1本に1つ。値は STATUS_CANON）
//   store:'map'                   … v.tg[グループid]（新しいタググループ。段階4まで書く経路は無い）
//
// 同じものを2か所に持たない: 今の4つの名前と選択肢は、ここには保存しない（tagSettings が正）。
// ここに保存するのは「どの枠に何が入っているか」「検索の対象か」と、
// tagSettings に居場所の無いもの（マーク・習得の名前、旧テンプレートから来たグループ）だけ。
//
// 足すだけ: この一覧は、グループを消さない・動画に触らない・tagSettings とテンプレートを書かない。
// 保存先: localStorage 'wk_tagRegistry'（この端末の控え）＋ Firestore data/tagRegistry（firebase.js）。
(function () {
  'use strict';

  const LS_KEY = 'wk_tagRegistry';
  const VERSION = 1;
  const FIELD_STORES = ['tb', 'cat', 'pos', 'tags'];
  // マークの選択肢。値は動画の項目名、表示は絵文字つき
  const MARK_OPTS = [
    { value: 'fav',   ja: '⭐ お気に入り', en: '⭐ Favorite' },
    { value: 'next',  ja: '🎯 Next',       en: '🎯 Next' },
    { value: 'drill', ja: '🟣 ドリル',     en: '🟣 Drill' },
  ];
  const DEFAULT_NAMES = {
    mark:   { ja: 'マーク', en: 'Marks' },
    status: { ja: '習得',   en: 'Progress' },
  };
  const _en = () => { try { return window.WK_LANG && window.WK_LANG() === 'en'; } catch (e) { return false; } };

  let _reg = null;        // いまの一覧（保存する形）
  let _searchCache = null; // 検索の対象のグループ（一覧が変わったら捨てる）
  let _readOnly = false;  // 自分より新しい形の一覧を受け取ったら、書き換えない

  // ── 形の検査。合わないものは受け取らない（壊れた値で上書きしない）──
  function _valid(r) {
    if (!r || typeof r !== 'object') return false;
    if (!Array.isArray(r.slots) || r.slots.length !== 4) return false;
    if (!Array.isArray(r.groups) || !r.groups.length) return false;
    const ids = new Set();
    for (const g of r.groups) {
      if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !g.id) return false;
      if (ids.has(g.id)) return false;
      ids.add(g.id);
    }
    return r.slots.every(s => s === null || ids.has(s));
  }
  const _clone = o => JSON.parse(JSON.stringify(o));
  const _strs = a => {
    const out = [];
    (Array.isArray(a) ? a : []).forEach(v => { const s = String(v == null ? '' : v).trim(); if (s && out.indexOf(s) < 0) out.push(s); });
    return out;
  };

  // ── まっさらから作る。いまの画面と同じ並び（タグ1〜4 = tb/cat/pos/tags）──
  function _fresh() {
    return {
      v: VERSION,
      slots: ['f_tb', 'f_cat', 'f_pos', 'f_tags'],
      groups: [
        { id: 'f_tb',   store: 'tb',   search: true, def: 'tb' },
        { id: 'f_cat',  store: 'cat',  search: true },
        { id: 'f_pos',  store: 'pos',  search: true, def: 'pos' },
        { id: 'f_tags', store: 'tags', search: true },
        { id: 'mark',   store: 'mark',   name: null, search: false, def: 'mark' },
        { id: 'status', store: 'status', name: null, search: false, def: 'status' },
      ],
      migratedTemplates: [],
    };
  }

  // ── 足りないものを足す（何度呼んでも同じ結果。消す・変えるはしない）──
  // 返り値: 足したものがあれば true（＝保存が要る）
  function reconcile(templatesRaw) {
    _ensure();
    if (_readOnly) return false;
    const r = _reg;
    let changed = false;
    const has = id => r.groups.some(g => g.id === id);
    const hasStore = st => r.groups.some(g => g.store === st);
    // 今の4つ・マーク・習得が無ければ、未使用として足す（枠には入れない）
    _fresh().groups.forEach(g => {
      if (FIELD_STORES.includes(g.store) || g.store === 'mark' || g.store === 'status') {
        if (!hasStore(g.store) && !has(g.id)) { r.groups.push(_clone(g)); changed = true; }
      }
    });
    if (!Array.isArray(r.migratedTemplates)) { r.migratedTemplates = []; changed = true; }
    // 編集したことのある旧テンプレートだけを、未使用のタググループにする（組み込みの見本は入れない）。
    // 一度移したものは印を付け、あとでテンプレートが消えても・グループを消しても二度と足さない。
    const list = templatesRaw && Array.isArray(templatesRaw.list) ? templatesRaw.list : [];
    list.forEach(t => {
      if (!t || typeof t !== 'object') return;
      const tid = String(t.id || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!tid || r.migratedTemplates.includes(tid)) return;
      let gid = 't_' + tid;
      while (has(gid)) gid += '_';
      const base = String(t.name || '').trim() || (_en() ? 'Template' : 'テンプレート');
      r.groups.push({
        id: gid, store: 'map',
        name: base + (_en() ? ' (old template)' : '（旧テンプレート）'),
        opts: _strs(t.values), search: true, from: 'template:' + tid,
      });
      r.migratedTemplates.push(tid);
      changed = true;
    });
    if (changed) { _searchCache = null; _cache(); }
    return changed;
  }

  // ── 読み込み ──
  function _loadCache() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (_valid(p)) return p;
    } catch (e) {}
    return null;
  }
  function _cache() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_reg)); } catch (e) {}
  }
  function _ensure() {
    if (_reg) return;
    const c = _loadCache();
    _reg = c || _fresh();
    _readOnly = !!(c && c.v > VERSION);
    if (!c) _cache();
  }

  // クラウドの一覧を受け取る。形が合わなければ何もしない（false）。
  // null は「クラウドにまだ無い」: この端末の控えは別の人のものかもしれないので使わず、まっさらから作る。
  function applyRemote(r) {
    _searchCache = null;
    if (r == null) {
      _reg = _fresh();
      _readOnly = false;
      _cache();
      return true;
    }
    if (!_valid(r)) return false;
    _reg = _clone(r);
    _readOnly = r.v > VERSION;
    _cache();
    return true;
  }

  // 保存する中身（クラウド・バックアップ用）。自分より新しい形なら書かないよう null を返す。
  function raw() { _ensure(); return _readOnly ? null : _clone(_reg); }
  function isReadOnly() { _ensure(); return _readOnly; }

  // ── 読む側（段階2から使う）──
  function _tsEntry(field) {
    const ts = window.tagSettings || [];
    return (Array.isArray(ts) ? ts : []).find(t => t && t.key === field) || null;
  }
  function groupName(g) {
    if (!g) return '';
    if (FIELD_STORES.includes(g.store)) return window.tagLabel ? window.tagLabel(g.store) : (_tsEntry(g.store)?.label || g.store);
    if (g.name) return g.name;
    const d = DEFAULT_NAMES[g.store];
    return d ? (_en() ? d.en : d.ja) : g.id;
  }
  // 選択肢の値（動画に入る値）
  function groupOptions(g) {
    if (!g) return [];
    if (FIELD_STORES.includes(g.store)) return (window.tagPresets ? window.tagPresets(g.store) : (_tsEntry(g.store)?.presets || [])).slice();
    if (g.store === 'mark') return MARK_OPTS.map(o => o.value);
    if (g.store === 'status') return (window.STATUS_CANON || []).slice();
    return _strs(g.opts);
  }
  // 値の表示名（マークだけ値と表示が違う）
  function optionLabel(g, value) {
    if (g && g.store === 'mark') { const o = MARK_OPTS.find(x => x.value === value); if (o) return _en() ? o.en : o.ja; }
    return String(value);
  }
  function _resolve(g) {
    if (!g) return null;
    const slot = _reg.slots.indexOf(g.id);
    return {
      id: g.id, store: g.store, def: g.def || null, search: g.search !== false,
      slot: slot >= 0 ? slot : -1,
      name: groupName(g), options: groupOptions(g),
    };
  }
  function groups() { _ensure(); return _reg.groups.map(_resolve); }
  function group(id) { _ensure(); return _resolve(_reg.groups.find(g => g.id === id)); }
  function slots() { _ensure(); return _reg.slots.map(id => (id ? group(id) : null)); }
  // 動画がそのグループに持っている値。読むだけ（配列は毎回新しい）。
  function valuesOf(v, id) {
    _ensure();
    const g = _reg.groups.find(x => x.id === id);
    if (!g || !v) return [];
    if (FIELD_STORES.includes(g.store)) return Array.isArray(v[g.store]) ? v[g.store].slice() : [];
    if (g.store === 'mark') return MARK_OPTS.filter(o => !!v[o.value]).map(o => o.value);
    if (g.store === 'status') return v.status ? [v.status] : [];
    const m = v.tg && typeof v.tg === 'object' ? v.tg[g.id] : null;
    return Array.isArray(m) ? m.slice() : [];
  }

  // ワード検索の対象にするグループのID（並びは一覧の順）。検索は動画1本×打鍵ごとに呼ぶので、
  // 名前や選択肢は組み立てずに、保存している形から直接読む（軽くしておく）。
  function searchIds() {
    _ensure();
    return _reg.groups.filter(g => g.search !== false).map(g => g.id);
  }
  // 検索用の文字（マークは値ではなく表示名で探せるように）
  function searchText(v, id) {
    const g = _reg.groups.find(x => x.id === id);
    return valuesOf(v, id).map(x => optionLabel(g, x));
  }
  // 動画1本の、検索の対象のタグをすべてつないだ文字。検索のたびに全動画で呼ばれるので、
  // 対象のグループは覚えておき（一覧が変わったときだけ作り直す）、値は保存場所から直接読む。
  function searchTagText(v) {
    if (!_searchCache) { _ensure(); _searchCache = _reg.groups.filter(g => g.search !== false); }
    const out = [];
    for (const g of _searchCache) {
      if (FIELD_STORES.includes(g.store)) { const a = v[g.store]; if (Array.isArray(a)) for (const x of a) out.push(x); }
      else if (g.store === 'mark') { for (const o of MARK_OPTS) if (v[o.value]) out.push(_en() ? o.en : o.ja); }
      else if (g.store === 'status') { if (v.status) out.push(v.status); }
      else { const m = v.tg && typeof v.tg === 'object' ? v.tg[g.id] : null; if (Array.isArray(m)) for (const x of m) out.push(x); }
    }
    return out.join(' / ');
  }

  // 選択肢の見せ方（段階2c）: この数までは並べて押す。超えたらプルダウンから選ぶ。
  // 境目はここだけに置く（動画パネル・まとめて編集が同じ数を読む）。
  const CHIP_MAX = 8;
  function displayMode(optionCount) { return optionCount <= CHIP_MAX ? 'chips' : 'dropdown'; }

  window.tagRegistry = {
    groups, group, slots, valuesOf, optionLabel, searchIds, searchText, searchTagText, raw,
    CHIP_MAX, displayMode, isReadOnly, reconcile, applyRemote,
    _valid, _fresh, LS_KEY,
  };
})();
