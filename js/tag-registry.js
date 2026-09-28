// ═══ タググループの一覧（段階1: 土台。画面はまだ変えない）═══
//
// タグ1〜4 に何が入っているか、と、しまってあるもの（未使用のタググループ）を持つ。
// 動画のタグは今の保存場所のまま読む（書き写さない）:
//   store:'tb'|'cat'|'pos'|'tags' … v.tb / v.cat / v.pos / v.tags。名前と選択肢は tagSettings から読む
//   store:'map'                   … v.tg[グループid]（新しいタググループ・マーク・習得。書くのは wkSetTagValue と js/tag-ops.js だけ）
//   （v52.875 までのマーク store:'mark'（v.fav/next/drill）と習得 store:'status'（v.status）は、
//     読み込み時に store:'map' へ直す（_demote）。動画の値は migrateMarkStatus で v.tg へ写す。古い欄は消さない）
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
  // 動画のタグは v.tb / v.cat / v.pos / v.tags に入っている（保存場所の名前＝動画の項目名）。
  // 読み込みのたびの変換（tag-master.js migrateVideo）・タグ付けウィザード・取り込みもこの名前で書く。
  // tbNew / posNew はライブラリの絞り込み（window.filters）の呼び名で、動画の項目名ではない。
  // v52.861〜862 はこれを取り違え、動画パネルで付けたタグ1・ポジションを v.tbNew / v.posNew に書いていた
  // （その間、元から付いていた値はパネルで外せなかった）。その分も読むときに拾う（消さない・書き戻さない）。
  // 外すときは両方から外す（vpanel-v4.js）。
  const STRAY_FIELD = { tb: 'tbNew', pos: 'posNew' };
  const strayFieldOf = store => STRAY_FIELD[store] || null;
  function readField(v, store) {
    const out = [];
    const seen = new Set();
    for (const k of [store, strayFieldOf(store)]) {
      if (!k) continue;
      const a = v && v[k];
      if (!Array.isArray(a)) continue;
      for (const x of a) { if (x != null && x !== '' && !seen.has(x)) { seen.add(x); out.push(x); } }
    }
    return out;
  }
  // 初期のタググループ（「初期値に戻す」「初期設定に戻す」の基準。オーナー 2026-09-26 のモック）
  const DEFAULTS = {
    tb:  { ja: 'トップ/ボトム', en: 'Top/Bottom', vals: ['トップ', 'ボトム', 'スタンディング'] },
    pos: { ja: 'ポジション',    en: 'Position',   vals: ['クローズドガード', 'デラヒーバ', 'ハーフガード', 'スパイダー', 'ラッソー', 'バタフライ', 'Xガード', 'マウント', 'サイド', 'バック'] },
  };
  // マーク・習得を普通のタググループにしたとき（v52.876）の選択肢と、動画の値を写すときの対応。
  // 以前は専用の欄（v.fav / v.next / v.drill・v.status）に入っていて、選択肢は固定だった。
  // 「未着手」はタグにしない（習得のタグが付いていない＝未着手）。
  const MARK_VALUES = ['お気に入り', 'Next', 'ドリル'];
  const MARK_FROM = { fav: 'お気に入り', next: 'Next', drill: 'ドリル' };
  const STATUS_VALUES = ['理解', '練習中', 'マスター'];
  const OLD_STORE_VALUES = { mark: MARK_VALUES, status: STATUS_VALUES };
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
        // マーク・習得は普通のタググループ（v52.876〜）。値は v.tg.mark / v.tg.status
        { id: 'mark',   store: 'map', name: _en() ? DEFAULT_NAMES.mark.en : DEFAULT_NAMES.mark.ja,     opts: MARK_VALUES.slice(),   search: false },
        { id: 'status', store: 'map', name: _en() ? DEFAULT_NAMES.status.en : DEFAULT_NAMES.status.ja, opts: STATUS_VALUES.slice(), search: false },
      ],
      migratedTemplates: [],
    };
  }

  // ── マーク・習得を普通のタググループにする（v52.876）──
  // 専用の保存場所（store:'mark'/'status'）のグループを、ID はそのままで store:'map' にする。
  // 付けた名前・枠・検索の対象はそのまま。選択肢は今までの固定のもの（以後は自由に変えられる）。
  // 返り値: 変えたら true
  function _demote(r) {
    let changed = false;
    (r.groups || []).forEach(g => {
      const vals = OLD_STORE_VALUES[g.store];   // 前の版の専用の保存場所（mark / status）だけ
      if (!vals) return;
      const dn = DEFAULT_NAMES[g.store];
      g.name = (g.name && String(g.name).trim()) || (_en() ? dn.en : dn.ja);
      g.opts = vals.slice();
      g.store = 'map';
      g.search = g.search === true;
      delete g.def;
      changed = true;
    });
    return changed;
  }

  // 動画のマーク・習得を、普通のタグの置き場所（v.tg.mark / v.tg.status）へ写す（v52.876）。
  //   ・足すだけ。元の欄（v.fav / v.next / v.drill / v.status）は消さない・書き換えない
  //   ・写すのは、そのグループの値がまだ無い（v.tg.mark が無い）動画だけ。一度入れば二度と写さない
  //     （新しい画面で外したタグが、元の欄から復活しないように）
  //   ・写すものが無い動画には何も書かない（古い版の端末が後から★を付けても、次の読み込みで拾える）
  // 返り値: 写した動画の本数（0 なら何も変えていない）
  function migrateMarkStatus(videos) {
    let n = 0;
    (Array.isArray(videos) ? videos : []).forEach(v => {
      if (!v || typeof v !== 'object') return;
      if (v.tg != null && (typeof v.tg !== 'object' || Array.isArray(v.tg))) return;   // 形の違う tg には触らない
      const has = k => !!(v.tg && Array.isArray(v.tg[k]));
      const marks = Object.keys(MARK_FROM).filter(k => v[k] === true).map(k => MARK_FROM[k]);
      const st = typeof window.normStatus === 'function' ? window.normStatus(v.status) : v.status;
      let touched = false;
      if (marks.length && !has('mark')) { v.tg = v.tg || {}; v.tg.mark = marks; touched = true; }
      if (STATUS_VALUES.includes(st) && !has('status')) { v.tg = v.tg || {}; v.tg.status = [st]; touched = true; }
      if (touched) n++;
    });
    if (n) _searchCache = null;
    return n;
  }

  // ── 足りないものを足す（何度呼んでも同じ結果。消す・変えるはしない）──
  // 返り値: 足したものがあれば true（＝保存が要る）
  function reconcile(templatesRaw) {
    _ensure();
    if (_readOnly) return false;
    const r = _reg;
    let changed = _demote(r);
    const has = id => r.groups.some(g => g.id === id);
    const hasStore = st => r.groups.some(g => g.store === st);
    // 今の4つ・マーク・習得が無ければ、未使用として足す（枠には入れない）
    _fresh().groups.forEach(g => {
      if (FIELD_STORES.includes(g.store) ? (!hasStore(g.store) && !has(g.id)) : ((g.id === 'mark' || g.id === 'status') && !has(g.id))) {
        r.groups.push(_clone(g)); changed = true;
      }
    });
    if (!Array.isArray(r.migratedTemplates)) { r.migratedTemplates = []; changed = true; }
    // マークをタグ4に入れる（オーナー決定 2026-09-28。1回だけ）。いたグループは未使用へ（動画のタグは残る）。
    // 印（markSlot4）を一覧に残すので、あとで自分でマークを外しても二度と入れ直さない。
    // すでにどこかの枠にマークがあれば枠は触らず、印だけ付ける。
    if (!r.markSlot4) {
      if (r.slots.indexOf('mark') < 0 && r.groups.some(g => g.id === 'mark')) r.slots[3] = 'mark';
      r.markSlot4 = true;
      changed = true;
    }
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
    if (!_readOnly && _demote(_reg)) _cache();   // 前の版の控えにマーク・習得の専用の形が残っていたら、普通のグループにする
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
    if (!_readOnly) _demote(_reg);   // 前の版の端末が専用の形で書いていても、ここでは普通のグループとして持つ（保存は次の書き込みで）
    _cache();
    try { window.dispatchEvent(new CustomEvent('wk-tagreg')); } catch (e) {}
    return true;
  }

  // ── 編集（段階3a）──
  // どれも一覧そのもの（どの枠に何が入っているか・名前・選択肢・検索の対象）だけを変える。
  // 動画には触らない（動画を書き換える操作は段階4で、先にバックアップと取り消しを付けてから）。
  // 今の4つ（tb/cat/pos/tags）の名前と選択肢は tagSettings が正なので、ここでは変えない（settings.js 側）。
  // 変えたら端末の控えに書き、クラウドへ送り（saveTagRegistry）、画面に知らせる（wk-tagreg）。
  function _commit() {
    _searchCache = null;
    _cache();
    try { window.saveTagRegistry?.(); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('wk-tagreg')); } catch (e) {}
    return true;
  }
  const _g = id => _reg.groups.find(g => g.id === id) || null;
  function _editable() { _ensure(); return !_readOnly; }

  // 好み（一覧と一緒にクラウドへ。無ければ既定）。
  //   unusedCondApply … 未使用のタググループの条件も、カスタムリストで効かせるか（既定 true＝今までどおり）
  // 既定のままの人には何も書かない（読み込みのたびに書き込みを起こさない）。前の版のアプリは知らない項目をそのまま持ち回る
  const PREF_DEFAULTS = { unusedCondApply: true };
  function pref(name) {
    _ensure();
    const p = _reg.prefs && typeof _reg.prefs === 'object' ? _reg.prefs : {};
    return Object.prototype.hasOwnProperty.call(p, name) ? p[name] : PREF_DEFAULTS[name];
  }
  function setPref(name, val) {
    if (!_editable() || !Object.prototype.hasOwnProperty.call(PREF_DEFAULTS, name)) return false;
    if (pref(name) === val) return false;
    if (!_reg.prefs || typeof _reg.prefs !== 'object' || Array.isArray(_reg.prefs)) _reg.prefs = {};
    _reg.prefs[name] = val;
    return _commit();
  }

  // 枠の並びを変える（ドラッグで並べ替え）。from の枠の中身を to の位置へ動かし、間の枠を1つずつずらす。
  // 空いた枠も一緒に動く。どのグループが使用中かは変わらない（未使用のものは未使用のまま）
  function moveSlot(from, to) {
    if (!_editable()) return false;
    if (![from, to].every(k => Number.isInteger(k) && k >= 0 && k <= 3) || from === to) return false;
    const b = _reg.slots.slice();
    const [x] = b.splice(from, 1);
    b.splice(to, 0, x);
    _reg.slots = b;
    return _commit();
  }

  // 使う場所を変える。k = 0〜3（タグ1〜4）、-1 = 未使用。
  // 入れた枠に別のグループがいたら、入れ替える（元の枠へ。元が未使用なら、そちらが未使用になる）。
  function setSlot(id, k) {
    if (!_editable() || !_g(id)) return false;
    const b = _reg.slots.slice(), from = b.indexOf(id);
    if (k < 0 || k > 3) { if (from < 0) return false; b[from] = null; }
    else {
      if (from === k) return false;
      const prev = b[k];
      b[k] = id;
      if (from >= 0) b[from] = (prev && prev !== id) ? prev : null;
    }
    _reg.slots = b;
    return _commit();
  }
  function setSearch(id, on) {
    const g = _editable() && _g(id); if (!g) return false;
    if ((g.search !== false) === !!on) return false;
    g.search = !!on;
    return _commit();
  }
  // 名前（今の4つは tagSettings、ここでは マーク・習得・新しいグループだけ）。空の名前にはしない
  function setName(id, name) {
    const g = _editable() && _g(id); if (!g || FIELD_STORES.includes(g.store)) return false;
    const v = String(name == null ? '' : name).trim(); if (!v || v === g.name) return false;
    g.name = v;
    return _commit();
  }
  // 選択肢（新しいグループ・マーク・習得。今の4つは tagSettings）
  function addOption(id, val) {
    const g = _editable() && _g(id); if (!g || g.store !== 'map') return false;
    const v = String(val == null ? '' : val).trim(); if (!v) return false;
    g.opts = _strs(g.opts); if (g.opts.includes(v)) return false;
    g.opts.push(v);
    return _commit();
  }
  function removeOption(id, val) {
    const g = _editable() && _g(id); if (!g || g.store !== 'map') return false;
    const before = _strs(g.opts), after = before.filter(x => x !== val);
    if (after.length === before.length) return false;
    g.opts = after;
    return _commit();
  }
  // 新しいタググループを作る。k を渡せばその枠に入れる（いた方は未使用へ）。作った ID を返す
  function createGroup(name, k) {
    if (!_editable()) return null;
    const base = String(name == null ? '' : name).trim() || (_en() ? 'New tag group' : '新しいタググループ');
    let id; do { id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); } while (_g(id));
    _reg.groups.push({ id, store: 'map', name: base, opts: [], search: true });
    if (k >= 0 && k <= 3) _reg.slots[k] = id;
    _commit();
    return id;
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
    return _strs(g.opts);
  }
  // 値の表示名（値そのまま。v52.875 まではマークだけ値と表示が違った）
  function optionLabel(g, value) {
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
    if (FIELD_STORES.includes(g.store)) return readField(v, g.store);
    const m = v.tg && typeof v.tg === 'object' ? v.tg[g.id] : null;
    return Array.isArray(m) ? m.slice() : [];
  }

  // 枠（タグ1〜4）に入っているグループの ID と保存場所だけ（名前・選択肢は組み立てない）。
  // カードのように何千回も呼ぶ所で使う。空の枠は null。
  function slotInfo() {
    _ensure();
    return _reg.slots.map(id => { const g = id && _reg.groups.find(x => x.id === id); return g ? { id: g.id, store: g.store } : null; });
  }

  // ワード検索の対象にするグループのID（並びは一覧の順）。検索は動画1本×打鍵ごとに呼ぶので、
  // 名前や選択肢は組み立てずに、保存している形から直接読む（軽くしておく）。
  function searchIds() {
    _ensure();
    return _reg.groups.filter(g => g.search !== false).map(g => g.id);
  }
  // 検索用の文字
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
      if (FIELD_STORES.includes(g.store)) { for (const x of readField(v, g.store)) out.push(x); }
      else { const m = v.tg && typeof v.tg === 'object' ? v.tg[g.id] : null; if (Array.isArray(m)) for (const x of m) out.push(x); }
    }
    return out.join(' / ');
  }

  // 動画1本に付いているタグの値すべて（今の4つ＋新しいタググループ。マーク・習得も普通のグループとして含む）。
  // 「その名前が付いた動画」を探す画面（Journal の候補・動画パネルの検索メニュー）が使う。重複は1つにする
  function allTagValues(v) {
    _ensure();
    const out = [], seen = new Set();
    const add = x => { if (x != null && x !== '' && !seen.has(x)) { seen.add(x); out.push(x); } };
    for (const g of _reg.groups) {
      if (FIELD_STORES.includes(g.store)) readField(v, g.store).forEach(add);
      else if (g.store === 'map') { const m = v && v.tg && typeof v.tg === 'object' ? v.tg[g.id] : null; if (Array.isArray(m)) m.forEach(add); }
    }
    return out;
  }

  // 選択肢の見せ方（段階2c）: この数までは並べて押す。超えたらプルダウンから選ぶ。
  // 境目はここだけに置く（動画パネル・まとめて編集が同じ数を読む）。
  const CHIP_MAX = 8;
  function displayMode(optionCount) { return optionCount <= CHIP_MAX ? 'chips' : 'dropdown'; }

  window.tagRegistry = {
    groups, group, slots, slotInfo, valuesOf, allTagValues, optionLabel, searchIds, searchText, searchTagText, raw,
    strayFieldOf, readField,
    CHIP_MAX, displayMode, DEFAULTS, defaultName: store => { const d = DEFAULT_NAMES[store] || DEFAULTS[store]; return d ? (_en() ? d.en : d.ja) : ''; },
    migrateMarkStatus, MARK_VALUES, STATUS_VALUES,
    setSlot, moveSlot, setSearch, setName, addOption, removeOption, createGroup, isReadOnly, reconcile, applyRemote, pref, setPref,
    _valid, _fresh, LS_KEY,
  };
})();
