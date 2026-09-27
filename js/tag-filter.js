// ═══ タグの絞り込み: 呼び名の読み替えと判定を1か所に集める（段階2a）═══
//
// 絞り込みの状態は場所ごとに呼び名が違う（ライブラリ・整理の表・カスタムリストの条件・URL）。
// それぞれに読み替え表が書かれていて、1か所古いだけで絞り込みが黙って効かなくなっていた
// （URL に残らない・件数と結果が食い違う等）。読み替えはここだけに書く。
//
// 今の4つ（タグ1〜4 の tb/cat/pos/tags）は、保存済みのカスタムリストの条件・URL・古いタブが
// 読めるように、今までの呼び名のまま書く。新しいタググループ（store:'map'）はグループIDで書く。
// 読むときは、どの呼び名で入っていても同じグループとして読む。
//
// マーク（★Next ドリル）と習得は、今までどおり favOnly / status 等の別の仕組みで絞る（段階5で合わせる）。
(function () {
  'use strict';

  // グループ（保存場所）ごとの呼び名。
  //   lib: ライブラリ window.filters   org: 整理の表 orgFilters
  //   fc:  カスタムリストの条件 filterConditions   url: URL の ?xx=
  //   alias: 読むときに同じグループとみなす古い呼び名（書かない）
  // ※ ここにあるのは**絞り込みの状態**の呼び名。動画の項目名ではない。
  //   動画のタグは常に v.tb / v.cat / v.pos / v.tags（tbNew / posNew という項目は動画に無い）。
  //   v52.861 でこれを取り違え、動画パネルが v.tbNew / v.posNew に書いていた（v52.863 で戻した）。
  const FIELD_KEYS = {
    tb:   { lib: 'tbNew',  org: 'tb',       fc: 'tb',   url: 'tb',   alias: ['tb', 'tbNew'] },
    cat:  { lib: 'cat',    org: 'action',   fc: 'cat',  url: 'ac',   alias: ['action', 'cat'] },
    pos:  { lib: 'posNew', org: 'position', fc: 'pos',  url: 'pos',  alias: ['position', 'posNew', 'pos'] },
    tags: { lib: 'tags',   org: 'tags',     fc: 'tech', url: 'tech', alias: ['tags', 'tech'] },
  };
  const FIELDS = Object.keys(FIELD_KEYS);
  const SCHEMES = ['lib', 'org', 'fc', 'url'];

  const R = () => window.tagRegistry;
  // 中身の取り出し。Set でも配列でもよい（スナップショット・条件は配列）。
  // Set は「has と forEach と add を持つもの」で見分ける（型で判定すると、別の画面・検査の中で作った Set を見落とす）
  const _isSet = x => !!x && typeof x.has === 'function' && typeof x.forEach === 'function' && typeof x.add === 'function';
  const _vals = x => (Array.isArray(x) ? x : _isSet(x) ? [...x] : []);

  // 絞り込みに出せるグループ（今の4つと新しいタググループ）。枠に入っているものが先。
  function groups() {
    const reg = R();
    if (!reg) return FIELDS.map(f => ({ id: 'f_' + f, store: f, slot: FIELDS.indexOf(f), name: f, options: [] }));
    return reg.groups()
      .filter(g => FIELDS.includes(g.store) || g.store === 'map')
      .sort((a, b) => (a.slot < 0 ? 99 : a.slot) - (b.slot < 0 ? 99 : b.slot));
  }
  function _group(gid) { return groups().find(g => g.id === gid) || null; }
  // 保存場所（tb/cat/pos/tags）→ グループID
  function gidOfField(field) {
    const g = groups().find(x => x.store === field);
    return g ? g.id : ('f_' + field);
  }
  function fieldOf(gid) {
    const g = _group(gid);
    return g && FIELDS.includes(g.store) ? g.store : null;
  }

  // その場所で書くときの呼び名
  function keyFor(gid, scheme) {
    const f = fieldOf(gid);
    if (f) return FIELD_KEYS[f][scheme] || FIELD_KEYS[f].lib;
    return scheme === 'url' ? 'g_' + gid : gid;
  }
  // 読むときに見る呼び名（書く呼び名＋古い呼び名）
  function _readKeys(gid, scheme) {
    const f = fieldOf(gid);
    if (!f) return scheme === 'url' ? ['g_' + gid] : [gid];
    const k = FIELD_KEYS[f];
    return [k[scheme] || k.lib, ...k.alias.filter(a => a !== (k[scheme] || k.lib))];
  }
  // 呼び名 → グループID（知らない呼び名は null）
  function gidForKey(key, scheme) {
    for (const f of FIELDS) {
      const k = FIELD_KEYS[f];
      if (key === k[scheme] || k.alias.includes(key)) return gidOfField(f);
    }
    if (scheme === 'url' && typeof key === 'string' && key.startsWith('g_')) {
      const id = key.slice(2);
      return _group(id) ? id : null;
    }
    return _group(key) && !fieldOf(key) ? key : null;
  }

  // 選ばれている値（どの呼び名で入っていても合わせて返す。新しい Set）。
  // 中身は Set でも配列でもよい（スナップショット・条件は配列）。
  function selected(obj, gid, scheme) {
    const out = new Set();
    if (!obj) return out;
    _readKeys(gid, scheme).forEach(k => {
      const s = obj[k];
      if (!s) return;
      _vals(s).forEach(v => { if (v != null && v !== '') out.add(v); });
    });
    return out;
  }
  // 書き込む先の Set（無ければ作る）。古い呼び名に入っていた分はここへ寄せる。
  function setFor(obj, gid, scheme) {
    const key = keyFor(gid, scheme);
    if (!_isSet(obj[key])) obj[key] = new Set(_vals(obj[key]));
    _readKeys(gid, scheme).forEach(k => {
      if (k === key || !obj[k]) return;
      const s = obj[k];
      _vals(s).forEach(v => obj[key].add(v));
      if (_isSet(s)) s.clear(); else if (Array.isArray(s)) obj[k] = [];
    });
    return obj[key];
  }
  // 古い呼び名に入っている分を、その場所の呼び名へ寄せる（見えない条件を残さない）
  function normalize(obj, scheme) {
    if (!obj) return obj;
    groups().forEach(g => {
      const has = _readKeys(g.id, scheme).some(k => _vals(obj[k]).length);
      if (has) setFor(obj, g.id, scheme);
    });
    return obj;
  }

  // 動画が、そのグループの選択に当たるか（選択が無ければ true）。
  // allowBlank: 整理の表の「(空白)」＝そのグループに何も付いていない動画
  function _hit(v, gid, sel, allowBlank) {
    if (!sel.size) return true;
    const vals = R() ? R().valuesOf(v, gid) : (Array.isArray(v[fieldOf(gid)]) ? v[fieldOf(gid)] : []);
    if (!vals.length) return !!allowBlank && sel.has('(空白)');
    return vals.some(x => sel.has(x));
  }
  // すべてのタグの絞り込みに当たるかを判定する関数を作る（グループ同士は AND、グループの中は OR）。
  // 選択は作るときに1回だけ読む（動画ごとに組み立て直さない。3,000本×打鍵で重くなるため）。
  // except: 件数を数えるとき、そのグループだけ外す
  // opts.except … 見ないグループ（ID 1つ、または ID の配列）
  function compile(obj, scheme, opts) {
    const ex = opts && opts.except;
    const skip = new Set(ex == null ? [] : Array.isArray(ex) ? ex : [ex]);
    const allowBlank = !!(opts && opts.allowBlank);
    const active = groups()
      .filter(g => !skip.has(g.id))
      .map(g => ({ id: g.id, sel: selected(obj, g.id, scheme) }))
      .filter(x => x.sel.size);
    if (!active.length) return () => true;
    return v => active.every(x => _hit(v, x.id, x.sel, allowBlank));
  }
  function match(v, obj, scheme, opts) { return compile(obj, scheme, opts)(v); }
  function hasAny(obj, scheme) {
    return groups().some(g => selected(obj, g.id, scheme).size > 0);
  }
  // 動画がそのグループに持っている値（件数・候補づくり用。読むだけ）
  function valuesOf(v, gid) {
    if (R()) return R().valuesOf(v, gid);
    const f = fieldOf(gid);
    return f && Array.isArray(v[f]) ? v[f].slice() : [];
  }

  // 絞り込みの状態を配列だけの形にする（カスタムリストの条件・スナップショット用）
  // → { <その場所の呼び名>: [...] }（選択の無いグループは入れない）
  function toPlain(obj, fromScheme, toScheme) {
    const out = {};
    groups().forEach(g => {
      const s = selected(obj, g.id, fromScheme);
      if (s.size) out[keyFor(g.id, toScheme)] = [...s];
    });
    return out;
  }
  // 配列の形から、絞り込みの状態へ入れる（今の選択は置き換える。書くのはタグの分だけ）
  function fromPlain(plain, obj, fromScheme, toScheme) {
    groups().forEach(g => {
      const set = setFor(obj, g.id, toScheme);
      set.clear();
      selected(plain, g.id, fromScheme).forEach(v => set.add(v));
    });
    return obj;
  }
  function clear(obj, scheme) {
    groups().forEach(g => _readKeys(g.id, scheme).forEach(k => {
      if (_isSet(obj[k])) obj[k].clear(); else if (Array.isArray(obj[k])) obj[k] = [];
    }));
  }

  window.tagFilter = {
    FIELD_KEYS, FIELDS, SCHEMES,
    groups, gidOfField, fieldOf, keyFor, gidForKey,
    selected, setFor, normalize, compile, match, hasAny, valuesOf, toPlain, fromPlain, clear,
  };
})();
