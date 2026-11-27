// ═══ グルーピング（v53.048・本番）— リストの中で「分ける基準」を名前つきで持ち、列のあいだを動かして本物のタグを付け替える ═══
// オーナー決定（mock-cv-subviews.html → 試験版 v53.037〜047 → 「OK　これで実装しよ」）。
//
// 【データ経路】
//   グルーピングの一覧（名前・分ける基準・選んだタグ・「その他」を出すか）
//     localStorage wk_groupings = {uid, items:{[id]: entry}}  と  Firestore users/{uid}/data/groupings の items.{id}
//     entry = {id, list, name, gb, pg, picks:[{g,v}], showNone, created, at}／消したら {id, list, del:true, at}
//     ・リストの本体（_views・settings）・動画・タグの選択肢とは別の文書。書くのは変えた1件だけ（firebase.js _grpPush → update）
//     ・端末どうしは新しい方（at）を採る。クラウドを読み終えるまで書かない。ほかのアカウントの控えは送らない（ドリルと同じ決まり）
//     ・消すときも欄は消さない（del の印）。グルーピングを消しても、動画のタグは1文字も変わらない
//   この端末の好み（どのリストでどのグルーピングを開いていたか）: localStorage wk_groupingsPrefs（同期しない）
//   動画のタグ（ドラッグ・カードの ▾ で付け外し）: wkSetTagValue（動画パネルと同じ1か所）→ debounceSave（いつもの動画の保存）
//     カスタム列（セレクト・評価）: v.cf[列id]（表のセルと同じ）→ debounceSave
//     ・変えるのは押した動画の、そのグループの値だけ。ほかの動画・ほかのグループには触らない
//     ・取り消しは、今の値がこちらで付けた値のままのときだけ戻す（その後に別の画面で変えた値は消さない）
//   新しいタグ: タグの選択肢に足すだけ（今の4つ tagOptAdd／それ以外 tagRegistry.addOption）。動画には触らない
//   新しいタググループ: tagRegistry.createGroup（タグ設定の「新しく作る」と同じ。未使用のタググループに入る）
//   読む: window.filt(window.videos)（カード）／window.filteredVideos（テーブル）＝ふだんの絞り込みの結果。絞り込みはふだんのフィルターのまま
// 検査: tools/groupings-check.mjs
(function () {
  const LS = 'wk_groupings', PREF = 'wk_groupingsPrefs';
  const ALL = { id: 'all', name: 'すべて', gb: null };
  const S = { mode: 'board', closed: {}, editing: null, toast: null, more: {}, undo: [], openCard: null };
  const LIMIT = 60;
  // 「なし／その他」の列の印。画面の属性（onclick 等）に入るので、NUL（\u0000）は使わない（HTML が U+FFFD に置き換え、カードの ▾ と「なし」の列へのドラッグが効かなかった v53.049）
  const NONE = '__wk_none__';
  // 「非表示」の列（v53.051・オーナー「このグルーピングの中で表示させたくないものを非表示に。非表示の列から復活できるように」）。
  // 隠すのはそのグルーピングの中だけ: グルーピングの entry.hidden（動画idの配列）に足す／外すだけ。動画・タグ・リストには触らない
  const HID = '__wk_hidden__';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jsq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
  const tr = t => (window.WK_LANG?.() === 'en' && window._wkAutoI18n?.tryTranslate?.(t)) || t;
  const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const videoOf = id => (window.videos || []).find(v => v.id === id) || null;

  // ───────── 保存（ドリルと同じ形） ─────────
  let D = { uid: null, items: {} };
  try { const o = JSON.parse(localStorage.getItem(LS) || 'null');
    if (o && typeof o === 'object') { D.uid = typeof o.uid === 'string' ? o.uid : null; D.items = o.items && typeof o.items === 'object' ? o.items : {}; } } catch (e) {}
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(D)); } catch (e) { console.warn('[groupings] 端末に保存できません', e); } };
  const okEntry = (e, id) => !!e && typeof e === 'object' && e.id === id && typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id) &&
    (e.del === true || (typeof e.list === 'string' && typeof e.name === 'string' && (e.picks == null || Array.isArray(e.picks)) && (e.hidden == null || Array.isArray(e.hidden)) && (e.pgs == null || Array.isArray(e.pgs)) && (e.rpicks == null || Array.isArray(e.rpicks)) && (e.rOff == null || Array.isArray(e.rOff))));
  function put(entry) {
    entry.at = Math.max(Date.now(), (Number(D.items[entry.id]?.at) || 0) + 1);
    D.items[entry.id] = entry;
    if (!D.uid) D.uid = window._currentUserUid?.() || null;
    persist();
    window._grpPush?.(entry.id, entry);
  }
  // クラウドから受け取る（firebase.js）。新しい方を採る。first=true のときは手元の方が新しい分を送る候補として返す
  window._grpApplyRemote = function (cloud, uid, first) {
    const toPush = [];
    if (first && D.uid && uid && D.uid !== uid) D.items = {};   // ほかのアカウントの控えは送らない（クラウドで置き換える）
    const c = (cloud && cloud.items) || {};
    for (const id of Object.keys(c)) {
      if (!okEntry(c[id], id)) continue;
      const l = D.items[id];
      if (!l || Number(c[id].at) > Number(l.at)) D.items[id] = c[id];
    }
    if (first) for (const id of Object.keys(D.items)) {
      const l = D.items[id]; if (!okEntry(l, id)) continue;
      if (!c[id] || Number(l.at) > Number(c[id].at)) toPush.push({ id, entry: l });
    }
    if (uid) D.uid = uid;
    persist();
    if (first && (window.videos || []).length && window.tagRegistry) { try { repairFromHistory(); } catch (e) {} }
    if (isOpen()) draw();
    return toPush;
  };
  let P = { cur: {}, open: false };
  try { Object.assign(P, JSON.parse(localStorage.getItem(PREF) || '{}')); if (!P.cur || typeof P.cur !== 'object') P.cur = {}; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(P)); } catch (e) {} };

  const listKey = () => { try { return window._cvCurId?.() || 'master'; } catch (e) { return 'master'; } };
  const viewsOf = k => [ALL, ...Object.values(D.items).filter(e => e && !e.del && e.list === k).sort((a, b) => (a.created || 0) - (b.created || 0))];
  const VW = () => { const vs = viewsOf(listKey()); return vs.find(v => v.id === P.cur[listKey()]) || vs[0]; };

  // ───────── 分ける基準に使えるもの（今ある情報だけ） ─────────
  function sharedCols() {
    try { const o = JSON.parse(localStorage.getItem('wk_cv_shared') || 'null');
      const del = new Set(Array.isArray(o?.deleted) ? o.deleted : []);
      return (Array.isArray(o?.cols) ? o.cols : []).filter(c => c && c.id && !del.has(c.id) && !c.off);
    } catch (e) { return []; }
  }
  const optName = o => typeof o === 'string' ? o : (o && (o.label || o.name || o.value)) || '';
  const STARS = ['★★★★★', '★★★★', '★★★', '★★', '★'];
  let _gc = null;
  function groupers() {
    if (_gc) return _gc;
    const out = _gc = [];
    const TR = window.tagRegistry;
    if (TR) (TR.groups() || []).forEach(g => { if (!g) return;
      out.push({ key: 'tag:' + g.id, gid: g.id, kind: 'tag', name: g.name, sub: g.slot >= 0 ? ('タグ' + (g.slot + 1)) : '未使用',
        opts: (g.allOptions || []).slice(), read: v => TR.valuesOf(v, g.id) }); });
    out.push({ key: 'pl', kind: 'src', name: 'プレイリスト', read: v => v.pl ? [v.pl] : [] });
    out.push({ key: 'ch', kind: 'src', name: 'チャンネル', read: v => v.channel ? [v.channel] : [] });
    sharedCols().forEach(c => {
      if (c.type === 'select') out.push({ key: 'cf:' + c.id, col: c.id, kind: 'one', ctype: 'select', name: c.label || '（列）', sub: 'セレクト',
        opts: (c.options || []).map(optName).filter(Boolean), read: v => { const x = v.cf && v.cf[c.id]; return x ? [String(x)] : []; } });
      else if (c.type === 'stars') out.push({ key: 'cf:' + c.id, col: c.id, kind: 'one', ctype: 'stars', name: c.label || '（列）', sub: '評価',
        opts: STARS.slice(), read: v => { const n = Number(v.cf && v.cf[c.id]) || 0; return n > 0 ? ['★'.repeat(Math.min(5, n))] : []; } });
    });
    return out;
  }
  const GR0 = key => groupers().find(g => g.key === key) || null;
  // そのタググループの値の全部（選択肢＋どこかの動画に付いている値。絞り込みに関係なく）
  function groupValsAll(gkey) {
    const G = GR0(gkey); if (!G) return [];
    const seen = new Set(G.opts); const out = G.opts.slice();
    (window.videos || []).forEach(v => readG(v, G).forEach(x => { if (!seen.has(x)) { seen.add(x); out.push(x); } }));
    return out;
  }
  // 保存した後でタググループに増えたタグは、自動で列の最後に足す（v53.055・オーナー「なんで反映されてないんだよ」。
  // タグ設定で「リテンション」を足しても、グルーピングは作った時点の選んだタグ（picks）だけを列にしていた）。
  // 「外した」タグと「後から増えた」タグを分けるため、保存のときにその時点の全部の値を known に覚える。
  // known の無い前の版のグルーピングは、選んでいたタグ以外を全部「後から増えた」とみなす（前の版は作るとき全部 ✓ で始まる）
  // 使うタググループ（v53.057・オーナー決定 A「複数のタググループのタグを横に並べて列にする」）。
  // pgs = 使うタググループのキーの並び。前の版の pg（1つだけ）も読む
  const pgsOf = view => (view && Array.isArray(view.pgs) && view.pgs.length ? view.pgs : (view && view.pg ? [view.pg] : [])).filter(k => GR0(k));
  // タググループごとの色（v53.060・オーナー「複数のタググループが分かれて表示されるように。線で区切るとか色を分けるとか」）
  const GCOL = ['#d08a1c', '#3a7bd5', '#2d9d6a', '#b54fa8', '#d9534f', '#6a6ad0', '#1a9aa8', '#8a7a2a', '#c05a2a', '#5a7a9a'];
  const gColor = (view, gk) => { const i = pgsOf(view).indexOf(gk); return i < 0 ? '' : GCOL[i % GCOL.length]; };
  // 列の並びはタググループごとにまとめる（グループの順＝pgs、グループの中は選んだ順）
  const byGroup = (view, picks) => { const gks = pgsOf(view); return gks.flatMap(gk => picks.filter(p => p.g === gk)); };
  function withNewPicks(view) {
    const picks = (view && view.picks || []).filter(p => p && GR0(p.g));
    if (!view || view.gb !== 'pick') return picks;
    const extra = [];
    pgsOf(view).forEach(gk => {
      const kb = view.knownBy && Array.isArray(view.knownBy[gk]) ? view.knownBy[gk] : (gk === view.pg && Array.isArray(view.known) ? view.known : null);
      const mine = picks.filter(p => p.g === gk).map(p => p.v);
      const known = new Set(kb || mine); const have = new Set(mine);
      groupValsAll(gk).filter(x => !known.has(x) && !have.has(x)).forEach(v => extra.push({ g: gk, v }));
    });
    return byGroup(view, extra.length ? picks.concat(extra) : picks);
  }
  function pickGrouper(view) {
    const picks = view && view === S.editing ? byGroup(view, (view.picks || []).filter(p => p && GR0(p.g))) : withNewPicks(view);
    const dup = new Map(); picks.forEach(p => dup.set(p.v, (dup.get(p.v) || 0) + 1));
    const items = picks.map(p => ({ ...p, color: pgsOf(view).length > 1 ? gColor(view, p.g) : '', label: dup.get(p.v) > 1 ? `${p.v}（${GR0(p.g).name}）` : p.v }));
    return { key: 'pick', kind: 'pick', name: pgsOf(view).map(k => GR0(k).name).join('・') || 'タグ', items, opts: items.map(x => x.label), showNone: !view || view.showNone !== false };
  }
  const GR = key => key === 'pick' ? pickGrouper(S.editing && S.editing.gb === 'pick' ? S.editing : VW()) : GR0(key);
  const readG = (v, G) => (G.read(v) || []).map(String);
  function vals(v, g) {
    if (g.kind === 'pick') return g.items.filter(p => readG(v, GR0(p.g)).includes(p.v)).map(p => p.label);
    return readG(v, g);
  }
  const movable = g => g && g.kind !== 'src';
  function allVals(gkey) {
    const G = GR0(gkey); if (!G) return [];
    const seen = new Set(G.opts); const out = G.opts.slice();
    source().forEach(v => readG(v, G).forEach(x => { if (!seen.has(x)) { seen.add(x); out.push(x); } }));
    return out;
  }
  // 選んだタグがどれも付いていない動画の列はいつも「その他」（v53.061・オーナー「本来『その他』って表示されなきゃいけないんじゃないの？」。
  // 以前は全部のタグを選ぶと「◯◯なし」になり、長いグループ名だと見出しが切れていた）
  const noneName = () => 'その他';
  function source() {
    if (isOpen() && isTable() && Array.isArray(window.filteredVideos)) return window.filteredVideos;
    const all = Array.isArray(window.videos) ? window.videos : [];
    // カードの並びはライブラリの並べ替え（上の「追加日 ↓」）と同じ（v53.061。以前は並べ替えを掛けていなかった）
    try { const f = typeof window.filt === 'function' ? window.filt(all) : all.filter(v => !v.archived); return typeof window.sortVideos === 'function' ? window.sortVideos(f) : f; }
    catch (e) { return all.filter(v => !v.archived); }
  }
  const hiddenOf = V => new Set(Array.isArray(V && V.hidden) ? V.hidden : []);
  // ───────── 行（横軸・v53.067・オーナー決定 C「全部の列に貫く行＋列ごとに行で分けない」mock-grouping-grid.html） ─────────
  // entry.rg = 行に使うもの（'tag:ID' | 'pl' | 'ch' | 'cf:列id'）、rpicks = 行にする値、rKnown = 保存した時点の全部の値（後から増えたタグは行の最後に足す）、
  // rShowNone = どれも付いていない動画を「その他」の行に出すか、rOff = 行で分けない列（列の名前）、cellH = マスの高さ（カード何枚ぶん）
  const CELLH = [1, 1.5, 2, 3];
  const cellHOf = V => CELLH.includes(Number(V && V.cellH)) ? Number(V.cellH) : 2;
  // 開閉（v53.070・オーナー「列も行もヘッダーにアコーディオン。列全体・行全体・1つのマスだけを畳めるように」）。
  // この端末だけ（P.fold[グルーピングid] = {c:[列], r:[行], x:[[列,行]を JSON]}）。動画・グルーピングの保存データには書かない
  const FOLD_H = 38;
  const foldOf = id => { P.fold = P.fold && typeof P.fold === 'object' ? P.fold : {}; const f = P.fold[id]; return f && Array.isArray(f.c) && Array.isArray(f.r) && Array.isArray(f.x) ? f : { c: [], r: [], x: [] }; };
  const cellKey = (c, r) => JSON.stringify([c, r]);
  function rowG(V) {
    if (!V || !V.rg) return null; const G = GR0(V.rg); if (!G) return null;
    if (V.gb === V.rg || (V.gb === 'pick' && pgsOf(V).includes(V.rg))) return null;   // 列と同じものは行にしない
    return G;
  }
  function rowVals(V) {
    const G = rowG(V); if (!G) return [];
    const picks = (Array.isArray(V.rpicks) ? V.rpicks : []).map(String);
    if (V === S.editing || G.kind !== 'tag') return picks.slice();
    const known = new Set(Array.isArray(V.rKnown) ? V.rKnown : picks); const out = picks.slice();
    groupValsAll(G.key).forEach(x => { if (!known.has(x) && !out.includes(x)) out.push(x); });
    return out;
  }
  // 列＝ふだんの列（非表示の動画を除く）＋最後に「非表示」の列
  function colsH(list, g) {
    const hs = hiddenOf(VW());
    const cs = columns(list.filter(v => !hs.has(v.id)), g);
    cs.push({ key: HID, name: '非表示', ids: list.filter(v => hs.has(v.id)).map(v => v.id), hid: true });
    return cs;
  }
  function setHidden(vid, on, quiet) {
    const V = VW(); if (!V || V.id === 'all') return false;
    const cur = D.items[V.id]; if (!cur || cur.del) return false;
    const hs = hiddenOf(cur); if (hs.has(vid) === !!on) return false;
    on ? hs.add(vid) : hs.delete(vid);
    put({ ...cur, hidden: [...hs] });
    if (!quiet) {
      const t = (videoOf(vid) || {}).title || '';
      toast(on ? `「${t}」を非表示にしました` : `「${t}」を表示に戻しました`, () => {
        const W = D.items[V.id]; if (!W || W.del) return;
        const h2 = hiddenOf(W); if (h2.has(vid) !== !!on) return;   // その後に変えていたら戻さない
        on ? h2.delete(vid) : h2.add(vid); put({ ...W, hidden: [...h2] }); draw(); });
    }
    draw(); window.renderOrg && isTable() && rerenderTable();
    return true;
  }
  // 列ごとの並べ替え（v53.061・オーナー「カードビューの各列にソートボタン」）。この端末だけ（P.colSort[グルーピングid|列]）。
  // 何も選んでいなければライブラリの並べ替えのまま
  const CSORT = [['', '並べ替え: ライブラリと同じ'], ['addedAt:0', '追加日 新しい順'], ['addedAt:1', '追加日 古い順'], ['title:1', 'タイトル A→Z'], ['title:0', 'タイトル Z→A'],
    ['lastPlayed:0', '最近再生した順'], ['duration:1', '再生時間 短い順'], ['duration:0', '再生時間 長い順']];
  const csortOf = (vid, ck) => (P.colSort && P.colSort[vid + '|' + ck]) || '';
  function sortIds(ids, spec, byId) {
    if (!spec) return ids;
    const [k, a] = spec.split(':'); const asc = a === '1';
    const val = v => k === 'title' ? String(v.title || '').toLowerCase() : k === 'addedAt' ? (v.addedAt || '') : Number(v[k]) || 0;
    return ids.slice().sort((x, y) => { const A = byId.get(x), B = byId.get(y); if (!A || !B) return 0;
      if (k === 'addedAt') { if (!A.addedAt && !B.addedAt) return 0; if (!A.addedAt) return 1; if (!B.addedAt) return -1; }
      const va = val(A), vb = val(B); return va < vb ? (asc ? -1 : 1) : va > vb ? (asc ? 1 : -1) : 0; });
  }
  function columns(list, g) {
    if (g.kind === 'pick') {
      const cols = g.items.map((p, i) => ({ key: p.label, name: p.label, color: p.color, gstart: !!p.color && i > 0 && g.items[i - 1].g !== p.g, gfirst: !!p.color && (i === 0 || g.items[i - 1].g !== p.g), gname: p.color ? GR0(p.g).name : '', ids: list.filter(v => vals(v, g).includes(p.label)).map(v => v.id) }));
      if (g.showNone) cols.unshift({ key: NONE, name: noneName(g.items), ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
      return cols;
    }
    const seen = new Set(); const keys = [];
    (g.opts || []).forEach(o => { if (!seen.has(o)) { seen.add(o); keys.push(o); } });
    list.forEach(v => vals(v, g).forEach(x => { if (!seen.has(x)) { seen.add(x); keys.push(x); } }));
    const cols = keys.map(k => ({ key: k, name: k, ids: list.filter(v => vals(v, g).includes(k)).map(v => v.id) }));
    const shown = g.kind === 'src' ? cols.sort((a, b) => b.ids.length - a.ids.length) : cols.filter(c => c.ids.length || (g.opts || []).includes(c.key));
    if (g.kind !== 'src') shown.unshift({ key: NONE, name: 'その他', ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
    return shown;
  }

  // ───────── 本物に書く ─────────
  // G のグループの値を after にする（足りない分を付け、余分を外す）。書くのは押した動画のそのグループだけ
  function writeG(v, G, after, raw) {
    if (G.kind === 'tag') {
      const before = readG(v, G);
      before.filter(x => !after.includes(x)).forEach(x => window.wkSetTagValue?.(v, G.gid, x, false));
      after.filter(x => !before.includes(x)).forEach(x => window.wkSetTagValue?.(v, G.gid, x, true));
    } else if (G.kind === 'one') {
      if (!v.cf || typeof v.cf !== 'object') v.cf = {};
      if (raw !== undefined) { if (raw.has) v.cf[G.col] = raw.val; else delete v.cf[G.col]; return; }
      const x = after[0];
      v.cf[G.col] = G.ctype === 'stars' ? (x ? x.length : 0) : (x || '');
    }
  }
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  function commit() { window.debounceSave?.(); _gc = null; try { window.AF?.(); } catch (e) {} draw(); }
  // ops = [[G, after]]。書いて、取り消しの関数を返す（今の値が付けたときのままなら戻す）
  function change(vid, ops) {
    const v = videoOf(vid); if (!v) return null;
    const rec = ops.map(([G, after]) => ({ G, before: readG(v, G), after,
      raw: G.kind === 'one' ? { has: !!(v.cf && Object.prototype.hasOwnProperty.call(v.cf, G.col)), val: v.cf && v.cf[G.col] } : undefined }))
      .filter(r => !sameSet(r.before, r.after));
    if (!rec.length) return null;
    rec.forEach(r => writeG(v, r.G, r.after));
    commit();
    return () => {
      const w = videoOf(vid); if (!w) return;
      if (!rec.every(r => sameSet(readG(w, r.G), r.after))) { toast('その後に値が変わっているので、戻しませんでした'); return; }
      rec.slice().reverse().forEach(r => writeG(w, r.G, r.before, r.raw));
      commit();
    };
  }
  function pickChange(vid, g, offLabel, onLabel, copy) {
    const v = videoOf(vid); if (!v) return;
    const it = l => g.items.find(p => p.label === l);
    const cur = new Map();
    const get = G => cur.has(G.key) ? cur.get(G.key) : readG(v, G);
    if (offLabel && it(offLabel)) { const p = it(offLabel); const G = GR0(p.g); cur.set(G.key, get(G).filter(x => x !== p.v)); }
    if (onLabel && it(onLabel)) { const p = it(onLabel); const G = GR0(p.g); const a = get(G); cur.set(G.key, a.includes(p.v) ? a : [...a, p.v]); }
    const undo = change(vid, [...cur.entries()].map(([k, a]) => [GR0(k), a])); if (!undo) return;
    const keepBoth = (offLabel && onLabel && !copy) ? { label: `「${offLabel}」にも残す`, fn: () => {
        const p = it(offLabel); const G = GR0(p.g); const w = videoOf(vid); if (!w) return; const a = readG(w, G); if (a.includes(p.v)) return;
        const u = change(vid, [[G, [...a, p.v]]]); if (u) toast(`「${offLabel}」と「${onLabel}」の両方に入れました`, u); } } : null;
    toast(copy ? `「${onLabel}」にも追加しました` : onLabel ? `「${onLabel}」へ移動しました` : `「${offLabel}」から外しました`, undo, keepBoth);
  }
  function move(vid, gkey, from, to, copy) {
    if (from === to) return;
    if (gkey === 'pick') {
      const off = from === NONE ? null : from, on = to === NONE ? null : to;
      if (copy && !on) return;
      pickChange(vid, GR('pick'), copy ? null : off, on, copy); return; }
    const g = GR(gkey); const v = videoOf(vid); if (!g || !v || !movable(g)) return;
    const before = readG(v, g); let after;
    if (g.kind === 'tag') { after = copy ? before.slice() : before.filter(x => x !== from); if (to !== NONE && !after.includes(to)) after.push(to); }
    else after = to === NONE ? [] : [to];
    const undo = change(vid, [[g, after]]); if (!undo) return;
    toast(to === NONE ? `「${from}」から外しました` : copy ? `「${to}」にも追加しました` : `「${to}」へ移動しました`, undo);
  }
  // 縦×横: 列と行を一度に付け替える（取り消しは1回で両方）。copy＝元のタグも残す
  function opsFor(v, g, from, to, copy, cur) {
    const get = G => cur.has(G.key) ? cur.get(G.key) : readG(v, G);
    if (from === to) return;
    if (g.kind === 'pick') {
      const it = l => g.items.find(p => p.label === l);
      const off = copy || from === NONE ? null : from, on = to === NONE ? null : to;
      if (off && it(off)) { const p = it(off), G = GR0(p.g); cur.set(G.key, get(G).filter(x => x !== p.v)); }
      if (on && it(on)) { const p = it(on), G = GR0(p.g); const a = get(G); cur.set(G.key, a.includes(p.v) ? a : [...a, p.v]); }
      return;
    }
    if (!movable(g)) return;
    const before = get(g); let after;
    if (g.kind === 'tag') { after = copy ? before.slice() : before.filter(x => x !== from); if (to !== NONE && !after.includes(to)) after.push(to); }
    else after = to === NONE ? (copy ? before : []) : [to];
    cur.set(g.key, after);
  }
  function moveCell(vid, fc, fr, tc, tr, copy) {
    const v = videoOf(vid); if (!v) return;
    if (tc === HID) { if (fc !== HID) setHidden(vid, true); return; }
    let unhid = false;
    if (fc === HID) { setHidden(vid, false, true); unhid = true; copy = true; }
    const g = GR(VW().gb), R = S._R; if (!g) return;
    const cur = new Map();
    if (tc !== fc || unhid) opsFor(v, g, unhid ? NONE : fc, tc, copy, cur);
    if (R && tr != null && fr != null && tr !== fr) opsFor(v, R, fr, tr, copy, cur);
    if (R && tr != null && unhid && tr !== NONE) opsFor(v, R, NONE, tr, true, cur);
    const undo = cur.size ? change(vid, [...cur.entries()].map(([k, a]) => [GR0(k) || GR(k), a])) : null;
    if (!undo) { if (unhid) toast(`「${v.title || ''}」を表示に戻しました`); return; }
    const nm = x => x === NONE ? 'その他' : x;
    const where = (tr != null && R ? `「${nm(tc)}」×「${nm(tr)}」` : `「${nm(tc)}」`);
    toast(copy ? `${where}にも追加しました` : `${where}へ移動しました`, undo);
  }
  function toggle(vid, gkey, val) {
    const v = videoOf(vid); if (!v) return;
    if (gkey === 'pick') { const g = GR('pick'); const has = vals(v, g).includes(val); pickChange(vid, g, has ? val : null, has ? null : val); return; }
    const g = GR(gkey); if (!g) return;
    const before = readG(v, g); const has = before.includes(val);
    const after = g.kind === 'tag' ? (has ? before.filter(x => x !== val) : [...before, val]) : (has ? [] : [val]);
    const undo = change(vid, [[g, after]]); if (!undo) return;
    toast(has ? `「${val}」から外しました` : `「${val}」を付けました`, undo);
  }
  // 新しいタグ: タグの選択肢に足すだけ（動画には触らない）
  function addNewTag(gkey, name) {
    name = String(name || '').trim(); if (!name) return null;
    const G = GR0(gkey); if (!G || G.kind !== 'tag') return null;
    if (!G.opts.includes(name)) {
      const g = window.tagRegistry?.group?.(G.gid); if (!g) return null;
      if (['tb', 'cat', 'pos', 'tags'].includes(g.store)) window.tagOptAdd?.(g.store, name);
      else window.tagRegistry.addOption(G.gid, name);
      _gc = null;
      if (!GR0(gkey).opts.includes(name)) { toast('タグを足せませんでした'); return null; }
    }
    return name;
  }
  function addColumn() {
    const V = VW(); const inp = document.getElementById('svt-newcol'); const name = String(inp && inp.value || '').trim(); if (!name) return;
    const gks = pgsOf(V); if (V.gb !== 'pick' || !gks.length) return;
    const sg = document.getElementById('svt-newcol-g'); const gk = sg && gks.includes(sg.value) ? sg.value : gks[0];
    const v = addNewTag(gk, name); if (!v) return;
    const picks = withNewPicks(V).map(p => ({ ...p }));
    if (!picks.some(p => p.g === gk && p.v === v)) picks.push({ g: gk, v });
    put({ ...V, picks });
    toast(`タグ「${v}」を足しました`);
    draw(); setTimeout(() => document.getElementById('svt-newcol')?.focus(), 0);
  }

  // ───────── お知らせ・取り消し ─────────
  function toast(msg, undo, extra) {
    if (undo) S.undo.push(undo);
    if (S.undo.length > 30) S.undo.shift();
    S.toast = { msg, extra, undo }; clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; drawToast(); }, 6000); drawToast();
  }
  function drawToast() {
    const el = document.getElementById('svt-toast'); if (!el) return;
    el.innerHTML = S.toast ? `<div class="svt-toast"><span>${esc(S.toast.msg)}</span>${S.toast.extra ? `<button class="svt-tx" onclick="wkGroupings._tx()">${esc(S.toast.extra.label)}</button>` : ''}${S.toast.undo ? `<span class="svt-tsep"></span><button class="svt-tu" onclick="wkGroupings._tu()" title="この操作を元に戻す">↶ 元に戻す</button>` : ''}</div>` : '';
  }

  // ───────── 画面 ─────────
  const thumbOf = v => {
    const pt = v.pt || v.src || 'youtube';
    if (pt === 'youtube') return v.thumb || `https://img.youtube.com/vi/${v.ytId || v.id}/mqdefault.jpg`;
    if (pt === 'gdrive') return `https://drive.google.com/thumbnail?id=${String(v.id || '').replace('gd-', '')}&sz=w320`;
    return v.thumb && !String(v.thumb).includes('vumbnail.com') ? v.thumb : '';
  };
  const fmtDur = s => { s = Number(s) || 0; if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  // カードはライブラリのカードそのもの（window.cardHTML・v53.057・オーナー「通常とグルーピングで見え方が違う。同じにして。プレビューも」）。
  // グルーピングの操作（▾・非表示）は、カードの下の操作の列（メモ・アーカイブ）の上に1行足すだけ。
  // 同じ動画が2つの列に出るときは、2つ目からカードの中の id に __gN を付ける（ライブラリのプレビュー等は id で引くため）。
  // 押したカードの id をその時だけ本来の形に戻す（activate）ので、どの列のカードでもプレビュー・メモが効く。
  const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function card(v, g, colKey, copyN, cellId) {
    const mv = movable(g); const x = vals(v, g);
    const ok = cellId || colKey;
    const k = v.id + '|' + ok; const open = S.openCard === v.id && S._openColNow === ok && colKey !== HID;
    const R = cellId ? S._R : null; const rx = R ? readG(v, R) : [];
    let inner = typeof window.cardHTML === 'function' ? window.cardHTML(v) : `<div class="card-wrap"><div class="card"><div class="card-body"><div class="card-title">${esc(v.title || '')}</div></div><div class="card-actions"></div></div></div>`;
    if (copyN) inner = inner.replace(new RegExp('id="([A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*?)-' + reEsc(v.id) + '"', 'g'), (m, p) => `id="${p}-${v.id}__g${copyN}"`);
    // カードの ▾（v53.069・オーナー「カードのタグ選択で、行の選択肢も列と同様に」）: 列と行を同じ見せ方で並べる。
    // 見出し「列」「行」の下に、タググループごとの名前とタグ（列が複数のタググループならグループごと）
    const rOk = !!(R && movable(R));
    // ボタンの名前はタグの名前を並べず「列の編集」「列と行の編集」（v53.074・オーナー「いちいちタグ名を出さなくても『列と行の編集』でよくない？」）
    const lbl = rOk ? '列と行の編集' : '列の編集';
    const chip = (gk, o, on, cls) => `<button class="svt-o${cls || ''}${on ? ' on' : ''}" onclick="event.stopPropagation();wkGroupings._tg('${jsq(v.id)}','${jsq(gk)}','${jsq(o)}')">${on ? '✓ ' : ''}${esc(o)}</button>`;
    const grp = (name, color, chips) => `<div class="svt-mg"${color ? ` style="--gc:${color}"` : ''}><span class="svt-mgn">${color ? '<i class="svt-gdot"></i>' : ''}${esc(name)}</span><div class="svt-mgc">${chips}</div></div>`;
    let colPart = '';
    if (mv && open) {
      if (g.kind === 'pick') { const gksV = [...new Set(g.items.map(p => p.g))];
        colPart = gksV.map(gk => grp(GR0(gk).name, g.items.find(p => p.g === gk).color, g.items.filter(p => p.g === gk).map(p => chip(g.key, p.label, x.includes(p.label))).join(''))).join(''); }
      else colPart = grp(g.name, '', g.opts.map(o => chip(g.key, o, x.includes(o))).join(''));
    }
    const rowPart = mv && open && rOk ? grp(R.name, '', (R.kind === 'tag' ? groupValsAll(R.key) : R.opts).concat(rx).filter((y, i, a) => a.indexOf(y) === i).map(o => chip(R.key, o, rx.includes(o), ' svt-ro')).join('')) : '';
    const ctl = `<div class="svt-cardx">${mv && colKey !== HID ? `<button class="svt-sm" onclick="event.stopPropagation();wkGroupings._oc('${jsq(k)}')">${lbl} ▾</button>` : ''}<button class="svt-sm svt-hidebtn" onclick="event.stopPropagation();wkGroupings._hide('${jsq(v.id)}',${colKey === HID ? 'false' : 'true'})">${colKey === HID ? '表示に戻す' : '非表示'}</button></div>` +
      (mv && open ? `<div class="svt-mt svt-multi">${g.kind === 'one' ? '' : '<span class="svt-mhint">いくつでも選べます（下の「決定」を押すと、付けたタグのマスへ移ります）</span>'}<div class="svt-msec"><span class="svt-mh svt-mhc">列</span>${colPart}</div>${rowPart ? `<div class="svt-msec"><span class="svt-mh svt-mhr">行</span>${rowPart}</div>` : ''}<button class="svt-sm pri svt-mdone" onclick="event.stopPropagation();wkGroupings._oc('${jsq(k)}')">決定（閉じる）</button></div>` : '') +
      '';  // 「ほかの列にも: …」の1行は出さない（v53.081・オーナー「いらん」。付いているタグはすぐ上の札の並びに出ている）
    const at = inner.lastIndexOf('<div class="card-actions">');
    if (NEWUI) {
      // 試作（?grpui=new）: 「列と行の編集」「非表示」の段を無くし、メモ・アーカイブの並びの「⋯」から出す
      const more = `<button class="ca-btn svt-camore" data-svtpop onclick="event.stopPropagation();wkGroupings._cmo(this,'${jsq(k)}','${jsq(v.id)}',${mv && colKey !== HID ? 1 : 0},${colKey === HID ? 1 : 0},'${lbl}')">⋯</button>`;
      const ctl2 = ctl.replace(/^<div class="svt-cardx">[\s\S]*?<\/div>/, '');
      const tag = '<div class="card-actions">';
      inner = at >= 0 ? inner.slice(0, at) + ctl2 + tag + more + inner.slice(at + tag.length) : inner + ctl2;
    } else
    inner = at >= 0 ? inner.slice(0, at) + ctl + inner.slice(at) : inner + ctl;
    return `<div class="svt-card svt-lc" data-vid="${esc(v.id)}" data-copy="${copyN || 0}" data-canon="${copyN ? 0 : 1}" ${mv || colKey === HID ? `draggable="true" ondragstart="wkGroupings._ds(event,'${jsq(v.id)}','${jsq(colKey)}')"` : ''}>${inner}</div>`;
  }
  function renameIds(el, vid, n) {
    const tail = '-' + vid;
    [el, ...el.querySelectorAll('[id]')].forEach(e => { if (!e.id) return; const base = e.id.replace(/__g\d+$/, ''); if (!base.endsWith(tail)) return; e.id = n == null ? base : base + '__g' + n; });
  }
  // 押したカードを、その動画の「本来の id を持つカード」にする（プレビュー・メモ等が押したカードに効く）
  function activate(w) {
    if (!w || w.dataset.canon === '1') return;
    const vid = w.dataset.vid;
    const cur = [...document.querySelectorAll('#svt-root .svt-lc')].find(e => e.dataset.vid === vid && e.dataset.canon === '1');
    window.wkCardPreviewStop?.();
    if (cur) { renameIds(cur, vid, cur.dataset.copy); cur.dataset.canon = '0'; }
    renameIds(w, vid, null); w.dataset.canon = '1';
  }
  document.addEventListener('pointerdown', e => { const w = e.target && e.target.closest && e.target.closest('#svt-root .svt-lc'); if (w) activate(w); }, true);
  document.addEventListener('click', e => { const w = e.target && e.target.closest && e.target.closest('#svt-root .svt-lc'); if (w) activate(w); }, true);
  // 描き直してもスクロールの位置を変えない（v53.074・オーナー「タグを選択するたびに画面が微妙に上にスクロールする」。
  // カードの ▾ でタグを押すたびに全体を描き直していて、マスの中のスクロール位置と横の位置が先頭に戻っていた）
  // ── 試作の見た目（v53.079・?grpui=new のときだけ。オーナー「スッキリしない」「ボタンだらけ」「色付けが汚い」）。
  //    データには触らない（見た目と、今までと同じ関数を呼ぶメニューだけ）。?grpui=old で元に戻る（このタブの中だけ覚える）
  function hdNew(c, ci, folded, fold) {
    const gs = c.color && c.gfirst && c.gname ? ` data-g="${esc(c.gname)}"` : '';
    const cls = `svt-colh${folded ? ' svt-cfold' : ''}${c.gstart ? ' svt-gstart' : ''}${gs ? ' svt-gcap' : ''}`;
    if (folded) return `<div class="${cls}"${gs}>${fold}</div>`;
    return `<div class="${cls}"${gs}>${fold}<span class="svt-tag${c.none || c.hid ? ' none' : ''}">${esc(c.name)}</span><span class="n">${c.ids.length}</span>${c.sort ? '<span class="svt-son" title="並べ替えを変えています">⇅</span>' : ''}<button class="svt-cmore" data-svtpop title="並べ替え・行で分けない" onclick="event.stopPropagation();wkGroupings._cm(this,${ci})">⋯</button></div>`;
  }
  function popMenu(a, html) {
    closePop(); const m = document.createElement('div'); m.id = 'svt-pop'; m.innerHTML = html; document.body.appendChild(m);
    const k = (window.wkZoomK && window.wkZoomK()) || 1; const r = a.getBoundingClientRect();
    const W = innerWidth / k, H = innerHeight / k, mw = m.offsetWidth, mh = m.offsetHeight;
    let x = r.left / k, y = r.bottom / k + 4;
    if (x + mw > W - 8) x = Math.max(8, r.right / k - mw); if (x < 8) x = 8;
    if (y + mh > H - 8) y = Math.max(8, r.top / k - mh - 4);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    setTimeout(() => document.addEventListener('pointerdown', popOut, true), 0);
  }
  function popOut(e) { const m = document.getElementById('svt-pop'); if (m && !m.contains(e.target) && !(e.target.closest && e.target.closest('[data-svtpop]'))) closePop(); }
  function closePop() { const m = document.getElementById('svt-pop'); if (m) m.remove(); document.removeEventListener('pointerdown', popOut, true); }
  const pi = (label, js, on, cls) => `<button class="svt-pi${on ? ' on' : ''}${cls ? ' ' + cls : ''}" onclick="wkGroupings._pc();${js}">${label}${on ? '<span class="ck">✓</span>' : ''}</button>`;
  // プログラムで位置を写したときは、その結果の値を覚えておき、それで起きた scroll を「人の操作」と取り違えない
  function setSL(el, x) { el.scrollLeft = x; el._wkSet = el.scrollLeft; }
  function echo(el) { const w = el._wkSet; el._wkSet = null; return w != null && Math.abs(el.scrollLeft - w) < 1.5; }
  function drawBody() {
    const el = document.getElementById('svt-body'); if (!el) return;
    const bd0 = el.querySelector('.svt-board'); const left = bd0 ? bd0.scrollLeft : 0;
    const tops = {}; el.querySelectorAll('.svt-cell[data-ci]').forEach(c => { const l = c.querySelector('.svt-clist'); if (l && l.scrollTop) tops[c.dataset.ci + '.' + c.dataset.ri] = l.scrollTop; });
    const host = document.getElementById('lib-card-host'); const hostTop = host ? host.scrollTop : 0;
    drawBody0();
    const bd = el.querySelector('.svt-board');
    if (bd && left) { setSL(bd, left); const hs = document.getElementById('svt-colhs'); if (hs) hs.scrollLeft = bd.scrollLeft; const hb = document.getElementById('svt-hbar'); if (hb) setSL(hb, bd.scrollLeft); }
    el.querySelectorAll('.svt-cell[data-ci]').forEach(c => { const t = tops[c.dataset.ci + '.' + c.dataset.ri]; if (t) { const l = c.querySelector('.svt-clist'); if (l) l.scrollTop = t; } });
    if (host && host.scrollTop !== hostTop) host.scrollTop = hostTop;
  }
  function drawBody0() {
    const el = document.getElementById('svt-body'); if (!el) return;
    const V = VW(); const g = V.gb ? GR(V.gb) : null;
    if (!g) { el.innerHTML = ''; return; }
    const list = source();
    if (!list.length) { el.innerHTML = '<div class="svt-note">今のフィルターに当たる動画はありません。サイドバーやフィルターで条件を変えてください。</div>'; return; }
    const mv = movable(g);
    const byId = new Map(list.map(v => [v.id, v]));
    const cs = colsH(list, g);
    const seenN = new Map();   // 同じ動画の何枚目か（2枚目から id に __gN）
    cs.forEach(c => { const sp = csortOf(V.id, c.key); if (sp) c.ids = sortIds(c.ids, sp, byId); c.sort = sp; });
    const R = rowG(V);
    if (R) { drawGrid(el, V, g, R, cs, byId); return; }
    S._R = null; S._grid = null;
    // ▾ を開いている間は、そのカードを開いたときの列・位置に置いたままにする（v53.062・オーナー「その他の列の動画にタグを1個入れた瞬間に移動して、複数入れられない」）。
    // 閉じたら、付けたタグの列へ移る
    if (S.openCard && S.openFrozen) {
      const vid = S.openCard;
      cs.forEach(c => { if (c.hid) return; const at = S.openFrozen[c.key]; const i = c.ids.indexOf(vid);
        if (at == null && i >= 0) c.ids.splice(i, 1);
        else if (at != null && i < 0) c.ids.splice(Math.min(at, c.ids.length), 0, vid);
        else if (at != null && i >= 0 && i !== at) { c.ids.splice(i, 1); c.ids.splice(Math.min(at, c.ids.length), 0, vid); } });
    }
    S._lastCols = cs.map(c => ({ key: c.key, ids: c.ids })); S._hdCols = cs;
    // カードの ▾ は動画ごとに開く。付け外しでカードが別の列へ移っても閉じない（v53.055・オーナー「複数選択できるように」）
    if (S.openCard) { const here = cs.find(c => c.key === S.openCol && c.ids.includes(S.openCard)) || cs.find(c => !c.hid && c.ids.includes(S.openCard));
      S._openColNow = here ? here.key : null; if (here) S.openCol = here.key; }
    // 列の見出しは、カードの列とは別の帯に並べ、縦にスクロールしても上に残す（オーナー「ヘッダーは常に表示」）。横は列と一緒に動かす
    const fC = new Set(foldOf(V.id).c); S._colKeys = cs.map(c => c.key);
    const fb = (on, ci) => `<button class="svt-fold" title="${on ? 'この列を開く' : 'この列を畳む'}" aria-expanded="${!on}" onclick="event.stopPropagation();wkGroupings._fold('c',${ci})">${on ? '▸' : '▾'}</button>`;
    const hd = (c, ci) => NEWUI ? hdNew(c, ci, fC.has(c.key), fb(fC.has(c.key), ci)) : fC.has(c.key) ? `<div class="svt-colh svt-cfold${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''}>${fb(true, ci)}</div>` : `<div class="svt-colh${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''}>${fb(false, ci)}<span class="svt-tag${c.color ? ' svt-gtag' : ''}${c.none || c.hid ? ' none' : ''}${c.hid ? ' svt-hidtag' : ''}">${esc(c.name)}</span><span class="n">${c.ids.length}</span><select class="svt-csort${c.sort ? ' on' : ''}" title="この列の並べ替え" onchange="wkGroupings._csort('${jsq(c.key)}',this.value)">${CSORT.map(([v, l]) => `<option value="${v}"${v === c.sort ? ' selected' : ''}>${esc(v ? l : '⇅ ' + l.replace('並べ替え: ', ''))}</option>`).join('')}</select></div>`;
    el.innerHTML = `<div class="svt-colwrap"><div class="svt-colhs" id="svt-colhs"><div class="svt-colhs-in">${cs.map((c, ci) => hd(c, ci)).join('')}${g.kind === 'pick' ? `<div class="svt-colh svt-addh">${pgsOf(V).length > 1 ? `<select id="svt-newcol-g" title="足すタググループ">${pgsOf(V).map(k => `<option value="${esc(k)}">${esc(GR0(k).name)}</option>`).join('')}</select>` : ''}<input id="svt-newcol" type="text" placeholder="＋ 新しいタグ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._addCol()"><button class="svt-sm pri" onclick="wkGroupings._addCol()">足す</button></div>` : ''}</div></div>` +
      // 上の横スクロールバー（v53.066・オーナー「下の横移動のバーを、一番上の見出しの真下にも」）。見出しと一緒に上に残る。動かすと列も見出しも動く
      `<div class="svt-hbar" id="svt-hbar" onscroll="wkGroupings._hb(this)"><div id="svt-hbar-in"></div></div></div>` +
      `<div class="svt-board" onscroll="wkGroupings._bs(this)">` + cs.map((c, ci) => {
      if (fC.has(c.key)) return `<div class="svt-col svt-cfold${c.hid ? ' svt-hidcol' : ''}${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''} data-name="${esc(c.name)}" ${mv || c.hid ? `ondragover="wkGroupings._dov(event,this)" ondragleave="this.classList.remove('over','copy')" ondrop="wkGroupings._dp(event,'${jsq(g.key)}','${jsq(c.key)}')"` : ''}><button class="svt-fstrip" title="この列を開く" onclick="wkGroupings._fold('c',${ci})"><b>${esc(c.name)}</b><span>${c.ids.length}本</span></button></div>`;
      const n = S.more[c.key] || LIMIT;
      return `<div class="svt-col${c.hid ? ' svt-hidcol' : ''}${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''} data-name="${esc(c.name)}" ${mv || c.hid ? `ondragover="wkGroupings._dov(event,this)" ondragleave="this.classList.remove('over','copy')" ondrop="wkGroupings._dp(event,'${jsq(g.key)}','${jsq(c.key)}')"` : ''}>
        <div class="svt-cards">${c.ids.slice(0, n).map(id => { const cn = seenN.get(id) || 0; seenN.set(id, cn + 1); return card(byId.get(id), g, c.key, cn); }).join('')}</div>
        ${c.ids.length > n ? `<button class="svt-sm" style="width:100%;margin-top:6px" onclick="wkGroupings._mr('${jsq(c.key)}')">さらに ${c.ids.length - n} 本</button>` : ''}
      </div>`; }).join('') + (g.kind === 'pick' ? '<div class="svt-col svt-addcol svt-spacer" aria-hidden="true"></div>' : '') + `</div>` +   // 見出しの「＋ 新しいタグ」の下の空き。これが無いと列を右端まで横に動かしても見出しの入力欄まで届かない（v53.062）

      `<div class="svt-note">${mv ? 'カードを別の列へドラッグすると移動、<b>Option（Windows は Alt）を押しながら</b>ドラッグすると両方に入ります。スマホはカードの「' + esc(g.name) + ' ▾」で付け外し。動かすと動画のタグが変わります（直後のお知らせの「元に戻す」・上の「1つ戻す」・⌘Z / Ctrl+Z で戻せます）。' : 'チャンネル・プレイリストは動画を取り込んだ元なので、列のあいだを動かせません。'}</div>`;
    stickTops();
  }

  // 縦×横（行あり）。どのマスも同じ高さ（カード cellH 枚ぶん）で、中だけスクロール。本数はマスの上
  function drawGrid(el, V, g, R, cs, byId) {
    const mv = movable(g);
    const rv = rowVals(V); const rows = rv.slice(); if (V.rShowNone !== false) rows.push(NONE);
    const off = new Set(Array.isArray(V.rOff) ? V.rOff : []);
    const isOff = c => c.hid || off.has(c.key === NONE ? NONE : c.name);
    const rkeys = v => { const x = readG(v, R).filter(y => rv.includes(y)); return x.length ? x : [NONE]; };
    const cells = {};
    cs.forEach((c, ci) => {
      if (isOff(c)) { cells[ci + '.*'] = c.ids.slice(); return; }
      rows.forEach((r, ri) => { cells[ci + '.' + ri] = []; });
      c.ids.forEach(id => { const v = byId.get(id); if (!v) return; rkeys(v).forEach(r => { const ri = rows.indexOf(r); if (ri >= 0) cells[ci + '.' + ri].push(id); }); });
    });
    // ▾ を開いている間は、そのカードを開いたときのマス・位置に置いたまま（列だけのときと同じ。v53.062）
    if (S.openCard && S.openFrozenCells) { const vid = S.openCard;
      Object.keys(cells).forEach(k => { const a = cells[k], i = a.indexOf(vid), at = S.openFrozenCells[k];
        if (at == null && i >= 0) a.splice(i, 1); else if (at != null && i < 0) a.splice(Math.min(at, a.length), 0, vid);
        else if (at != null && i !== at) { a.splice(i, 1); a.splice(Math.min(at, a.length), 0, vid); } }); }
    S._R = R; S._grid = { cols: cs.map(c => c.key), rows, cells };
    if (S.openCard) { const here = (S.openCell && (cells[S.openCell] || []).includes(S.openCard)) ? S.openCell : Object.keys(cells).find(k => cells[k].includes(S.openCard));
      S._openColNow = here || null; if (here) S.openCell = here; }
    const seenN = new Map();
    const nm = x => x === NONE ? 'その他' : x;
    const uniq = a => new Set(a).size;
    const rowN = ri => uniq(Object.keys(cells).filter(k => k.endsWith('.' + ri)).flatMap(k => cells[k]));
    const hd = (c, ci) => NEWUI ? hdNew(c, ci, fC.has(c.key), fbtn(fC.has(c.key), `'c',${ci}`, 'この列')) : fC.has(c.key) ? `<div class="svt-colh svt-cfold${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''}>${fbtn(true, `'c',${ci}`, 'この列')}</div>` : `<div class="svt-colh${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''}>${fbtn(false, `'c',${ci}`, 'この列')}<span class="svt-tag${c.color ? ' svt-gtag' : ''}${c.none || c.hid ? ' none' : ''}${c.hid ? ' svt-hidtag' : ''}">${esc(c.name)}</span><span class="n">${c.ids.length}</span>${c.hid ? '' : `<button class="svt-roff${isOff(c) ? ' on' : ''}" title="この列だけ行で分けない／分ける" onclick="wkGroupings._roff(${ci})">${isOff(c) ? '行なし' : '行 ⇕'}</button>`}<select class="svt-csort${c.sort ? ' on' : ''}" title="この列の並べ替え" onchange="wkGroupings._csort('${jsq(c.key)}',this.value)">${CSORT.map(([v, l]) => `<option value="${v}"${v === c.sort ? ' selected' : ''}>${esc(v ? l : '⇅ ' + l.replace('並べ替え: ', ''))}</option>`).join('')}</select></div>`;
    const GAP = 8; S._hdCols = cs;
    const F = foldOf(V.id); const fC = new Set(F.c), fR = new Set(F.r), fX = new Set(F.x);
    const rFold = ri => fR.has(rows[ri]);
    // 行の中のマスを全部畳んだら、その行も細くする（v53.071・オーナー「これはアコーディオン閉じたとはいえない」）
    const rShrink = ri => rFold(ri) || cs.every(c => isOff(c) || fC.has(c.key) || fX.has(cellKey(c.key, rows[ri])));
    const rH = ri => rShrink(ri) ? FOLD_H + 'px' : 'var(--svt-cellh)';
    const nOpen = rows.filter((r, ri) => !rShrink(ri)).length, nF = rows.length - nOpen;
    const spanH = `calc(${nOpen} * var(--svt-cellh) + ${nF * FOLD_H + (rows.length - 1) * GAP}px)`;
    const fbtn = (on, call, what) => `<button class="svt-fold" title="${on ? what + 'を開く' : what + 'を畳む'}" aria-expanded="${!on}" onclick="event.stopPropagation();wkGroupings._fold(${call})">${on ? '▸' : '▾'}</button>`;
    const cell = (c, ci, ri) => { const id = ci + '.' + ri; const a = cells[id] || []; const n = S.more[id] || LIMIT;
      const span = ri === '*';
      const xf = !span && (rFold(ri) || fX.has(cellKey(c.key, rows[ri])));
      // 畳んだマスは細い帯だけ。その列の下のマスは詰めて上がる（v53.072・オーナー「だからこれじゃダメ」。
      // v53.071 は行の高さをそろえるために帯の下を空けていたので、畳んでも場所が空かなかった）。どの行かは帯の名前で分かる
      if (xf) return `<div class="svt-cell svt-xfold" data-ci="${ci}" data-ri="${ri}" style="height:${FOLD_H}px" ${mv || c.hid ? `ondragover="wkGroupings._dov(event,this)" ondragleave="this.classList.remove('over','copy')" ondrop="wkGroupings._dp2(event,${ci},'${ri}')"` : ''}>
        <div class="svt-xbar">${rFold(ri) ? '' : fbtn(true, `'x',${ci},${ri}`, 'このマス')}<span>${esc(nm(rows[ri]))}</span><b>${a.length}本</b></div></div>`;
      return `<div class="svt-cell${span ? ' svt-cspan' : ''}${a.length ? '' : ' svt-cempty'}" data-ci="${ci}" data-ri="${ri}" style="height:${span ? spanH : 'var(--svt-cellh)'}" ${mv || c.hid ? `ondragover="wkGroupings._dov(event,this)" ondragleave="this.classList.remove('over','copy')" ondrop="wkGroupings._dp2(event,${ci},'${ri}')"` : ''}>
        <div class="svt-ccnt">${span ? '' : fbtn(false, `'x',${ci},${ri}`, 'このマス')}<span>${span ? (c.hid ? '' : '行で分けない') : esc(nm(rows[ri]))}</span><b>${a.length}本</b></div>
        <div class="svt-clist"><div class="svt-cards">${a.slice(0, n).map(vid => { const cn = seenN.get(vid) || 0; seenN.set(vid, cn + 1); return card(byId.get(vid), g, c.key, cn, id); }).join('')}</div>${a.length > n ? `<button class="svt-sm" style="width:100%;margin-top:6px" onclick="wkGroupings._mr('${id}')">さらに ${a.length - n} 本</button>` : ''}</div></div>`; };
    el.innerHTML = `<div class="svt-colwrap"><div class="svt-colhs" id="svt-colhs"><div class="svt-colhs-in svt-gridh"><div class="svt-rsp"><span>行 <b>${esc(R.name)}</b></span></div>${cs.map((c, ci) => hd(c, ci)).join('')}${g.kind === 'pick' ? `<div class="svt-colh svt-addh">${pgsOf(V).length > 1 ? `<select id="svt-newcol-g" title="足すタググループ">${pgsOf(V).map(k => `<option value="${esc(k)}">${esc(GR0(k).name)}</option>`).join('')}</select>` : ''}<input id="svt-newcol" type="text" placeholder="＋ 新しいタグ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._addCol()"><button class="svt-sm pri" onclick="wkGroupings._addCol()">足す</button></div>` : ''}</div></div>` +
      `<div class="svt-hbar" id="svt-hbar" onscroll="wkGroupings._hb(this)"><div id="svt-hbar-in"></div></div></div>` +
      `<div class="svt-board svt-gridb" onscroll="wkGroupings._bs(this)">` +
      `<div class="svt-rlab">${rows.map((r, ri) => `<div class="svt-rh${r === NONE ? ' none' : ''}${rShrink(ri) ? ' svt-rfold' : ''}" style="height:${rH(ri)}"><span class="svt-rht">${fbtn(rFold(ri), `'r',${ri}`, 'この行')}<b>${esc(nm(r))}</b></span><span class="n">${rowN(ri)}本</span></div>`).join('')}</div>` +
      cs.map((c, ci) => fC.has(c.key) ? `<div class="svt-col svt-gcol svt-cfold${c.hid ? ' svt-hidcol' : ''}${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''} data-name="${esc(c.name)}"><button class="svt-fstrip" style="height:${spanH}" title="この列を開く" onclick="wkGroupings._fold('c',${ci})"><b>${esc(c.name)}</b><span>${c.ids.length}本</span></button></div>`
        : `<div class="svt-col svt-gcol${c.hid ? ' svt-hidcol' : ''}${c.gstart ? ' svt-gstart' : ''}"${c.color ? ` style="--gc:${c.color}"` : ''} data-name="${esc(c.name)}">${isOff(c) ? cell(c, ci, '*') : rows.map((r, ri) => cell(c, ci, ri)).join('')}</div>`).join('') +
      (g.kind === 'pick' ? '<div class="svt-col svt-addcol svt-spacer" aria-hidden="true"></div>' : '') + `</div>` +
      `<div class="svt-note">どのマスも同じ高さ（カード${cellHOf(V)}枚ぶん。「グルーピングを編集」で変えられます）で、中はマスごとにスクロールします。${mv ? 'カードを別のマスへドラッグすると、列と行の両方のタグが付け替わります。<b>Option（Windows は Alt）を押しながら</b>ドラッグすると、元のタグも残します。スマホはカードの「' + esc(g.name) + ' ▾」で付け外し。直後のお知らせの「元に戻す」・上の「1つ戻す」・⌘Z / Ctrl+Z で戻せます。' : 'チャンネル・プレイリストは動画を取り込んだ元なので、列のあいだを動かせません（行は動かせます）。'}</div>`;
    stickTops();
  }
  // 上に残す位置: ライブラリの上の帯（#lib-results-header・同じスクロールの中で上に残る）の下、その下にグルーピングの並び、その下に列の見出し
  function stickTops() {
    const root = document.getElementById('svt-root'); if (!root) return;
    if (!root.classList.contains('svt-tbl')) { const cw0 = libCardW(); if (cw0 && root.style.getPropertyValue('--svt-cw') !== cw0 + 'px') root.style.setProperty('--svt-cw', cw0 + 'px'); }
    const lh = document.getElementById('lib-results-header'); const host = document.getElementById('lib-card-host');
    const top = lh && host && host.contains(lh) && getComputedStyle(lh).position === 'sticky' ? lh.offsetHeight : 0;
    const head = root.querySelector('.svt-head');
    root.style.setProperty('--svt-top', top + 'px');
    root.style.setProperty('--svt-hh', (head ? head.offsetHeight : 0) + 'px');
    const bd = root.querySelector('.svt-board'), hs = document.getElementById('svt-colhs'); if (bd && hs) hs.scrollLeft = bd.scrollLeft;
    const hb = document.getElementById('svt-hbar'), hi = document.getElementById('svt-hbar-in');
    if (bd && bd.classList.contains('svt-gridb')) {
      // マスの中のスクロールバーの幅（OS で違う）。列の幅に足して、カードの幅をライブラリと同じにする
      const cl = bd.querySelector('.svt-cell:not(.svt-xfold) .svt-clist');
      const sb = cl ? Math.max(0, cl.offsetWidth - cl.clientWidth) : 0;
      if (root.style.getPropertyValue('--svt-sb') !== sb + 'px') root.style.setProperty('--svt-sb', sb + 'px');
      // マスの高さ＝カード cellH 枚ぶん。カードの高さは実物を測る（列の幅で変わる）
      const hs2 = [...bd.querySelectorAll('.svt-lc')].slice(0, 12).map(x => x.offsetHeight).filter(h => h > 60).sort((a, b) => a - b);
      const ch = hs2.length ? hs2[Math.floor(hs2.length / 2)] : (S._cardH || 380); S._cardH = ch;
      // マスは見える所の高さを超えない（v53.073・オーナー「ホイールで下にやっていくと、マスのスクロールバーが下に行って見えなくなる」。
      // 「行で分けない」列のマス（行の数ぶんの高さ）や「カード3枚」が画面より高いと、マスの中のスクロールバーの下の端が画面の外に出ていた）
      const k = (window.wkZoomK && window.wkZoomK()) || 1;
      const scH = host && /auto|scroll/.test(getComputedStyle(host).overflowY) ? host.clientHeight : innerHeight / k;
      const cw = root.querySelector('.svt-colwrap');
      const cap = Math.max(220, Math.floor(scH - top - (head ? head.offsetHeight : 0) - (cw ? cw.offsetHeight : 0) - 16));
      const want = Math.min(cap, Math.round(ch * cellHOf(VW()) + 8 * Math.max(0, Math.ceil(cellHOf(VW())) - 1) + 34)) + 'px';
      if (root.style.getPropertyValue('--svt-cellh') !== want) root.style.setProperty('--svt-cellh', want);
      if (root.style.getPropertyValue('--svt-cellmax') !== cap + 'px') root.style.setProperty('--svt-cellmax', cap + 'px');
    }
    if (bd && hb && hi) { hi.style.width = bd.scrollWidth + 'px'; hb.style.width = bd.clientWidth + 'px'; hb.classList.toggle('none', bd.scrollWidth <= bd.clientWidth + 1); if (Math.abs(hb.scrollLeft - bd.scrollLeft) >= 1) setSL(hb, bd.scrollLeft); }
  }
  // 「＋ 新しいタグ」は見出しの帯（上に残る）に入力欄として置く（v53.053・前は見出しがただの文字で、押しても何も起きなかった。入力欄は列の下にあった）

  function pickEd(d) {
    const gks = pgsOf(d); if (!gks.length) return '';
    const multi = gks.length > 1;
    const sel = byGroup(d, (d.picks || []).filter(p => gks.includes(p.g)));
    const src = source(); const cnt = (gk, x) => { const G = GR0(gk); return src.filter(v => readG(v, G).includes(x)).length; };
    // タググループごとに1つの枠（色の線・名前・選んだタグ・選んでいないタグ・新しいタグ）。列もこの順に、グループごとにまとまって並ぶ
    const block = (gk, gi) => { const G = GR0(gk); const mine = sel.filter(p => p.g === gk).map(p => p.v); const rest = allVals(gk).filter(x => !mine.includes(x)); const allV = new Set(groupValsAll(gk));
      const iid = gk === d.pg ? 'svt-pnew' : 'svt-pnew-' + gi; const cid = gi === 0 ? 'svt-chips' : 'svt-chips-' + gi;
      return `<div class="svt-pgrow" style="--gc:${multi ? gColor(d, gk) : 'var(--border)'}">
        <div class="svt-ph"><span class="svt-gname">${multi ? '<i class="svt-gdot"></i>' : ''}${esc(G.name)}</span>
          <span class="svt-phb">${multi && gi > 0 ? `<button class="svt-sm" title="このグループの列を前へ" onclick="wkGroupings._gup('${jsq(gk)}')">↑ 前へ</button>` : ''}<button class="svt-sm" onclick="wkGroupings._pall(true,'${jsq(gk)}')">全部選ぶ</button><button class="svt-sm" onclick="wkGroupings._pall(false,'${jsq(gk)}')">全部外す</button></span></div>
        <div class="svt-opts" id="${cid}">${mine.map((x, i) => `<span class="svt-o on svt-chip${allV.has(x) ? '' : ' svt-stale'}" data-i="${i}"${allV.has(x) ? '' : ' title="このタグは今はありません（名前を変えた・消した）。押すと列から外れます"'}><span class="svt-grip" title="ドラッグで順番を入れ替え" onpointerdown="wkGroupings._gd(event,${i},'${jsq(gk)}','${cid}')">⠿</span><button class="svt-cb" onclick="wkGroupings._pv('${jsq(x)}','${jsq(gk)}')">✓ ${esc(x)}${allV.has(x) ? `<small> ${cnt(gk, x)}</small>` : '<small>（今は無いタグ）</small>'}</button></span>`).join('')}${rest.map(x => `<button class="svt-o svt-off" onclick="wkGroupings._pv('${jsq(x)}','${jsq(gk)}')">${esc(x)}<small> ${cnt(gk, x)}</small></button>`).join('') || (mine.length ? '' : '<span class="svt-grp" style="margin:0">このタググループにはまだタグがありません。下で足してください。</span>')}</div>
        <div class="svt-opts"><input id="${iid}" class="svt-pnew-in" type="text" placeholder="＋ 新しいタグ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._pnew('${jsq(gk)}','${iid}')"><button class="svt-sm" onclick="wkGroupings._pnew('${jsq(gk)}','${iid}')">足す</button></div>
      </div>`; };
    return `<div class="setbox svt-pick">
      <div class="svt-grp" style="margin:0"><b>✓ が列になります</b>（⠿ をドラッグでグループの中の順を入れ替え・押すと付け外し・数はいまのフィルターでの本数）${multi ? '。列はグループごとにまとまって、この順に並びます' : ''}</div>
      ${gks.map(block).join('')}
      <label class="svt-grp" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${d.showNone !== false ? 'checked' : ''} onchange="wkGroupings._pn(this.checked)"> 選んだタグがどれも付いていない動画も列（「${esc(noneName(pickGrouper(d).items))}」）に出す</label>
    </div>`;
  }
  let _gdS = null;
  function gripDown(e, i, gk, cid) {
    e.preventDefault();
    const sel = '#' + (cid || 'svt-chips') + ' .svt-chip';
    const chips = [...document.querySelectorAll(sel)]; const me = chips[i]; if (!me) return;
    _gdS = { i, to: i, x: e.clientX, y: e.clientY, moved: false, gk };
    const mv = ev => {
      if (!_gdS) return;
      if (!_gdS.moved && Math.hypot(ev.clientX - _gdS.x, ev.clientY - _gdS.y) < 4) return;
      _gdS.moved = true; me.classList.add('dragging');
      const hit = document.elementFromPoint(ev.clientX, ev.clientY); const c = hit && hit.closest && hit.closest(sel);
      document.querySelectorAll(sel).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (c && c !== me) { const j = +c.dataset.i; const r = c.getBoundingClientRect(); const after = ev.clientX > r.left + r.width / 2;
        c.classList.add(after ? 'drop-after' : 'drop-before'); _gdS.to = after ? j + 1 : j; }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      const st = _gdS; _gdS = null; if (!st || !st.moved) { drawEd(); return; }
      reorderPick(st.i, st.to, st.gk);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  // グループの中で i 番目を to の前へ（ほかのグループの並びは変えない）
  function reorderPick(i, to, gk) {
    const d = S.editing; if (!d) return;
    // 行のタグ（v53.070・オーナー「行のタグもドラッグで並べ替えられるように」）
    if (gk === '__rows__') { const a = (d.rpicks || []).slice(); if (i < 0 || i >= a.length) return; const [x] = a.splice(i, 1); if (to > i) to--; a.splice(Math.max(0, Math.min(to, a.length)), 0, x); d.rpicks = a; drawEd(); return; }
    const gks = pgsOf(d); gk = gk || gks[0];
    const all = byGroup(d, (d.picks || []).filter(p => gks.includes(p.g)));
    const mine = all.filter(p => p.g === gk);
    if (i < 0 || i >= mine.length) return;
    const [x] = mine.splice(i, 1); if (to > i) to--; mine.splice(Math.max(0, Math.min(to, mine.length)), 0, x);
    d.picks = gks.flatMap(g => g === gk ? mine : all.filter(p => p.g === g)); drawEd();
  }


  // 行（横に並ぶ）の設定（v53.067・オーナー決定 案1「順番に選ぶ」）: ① 列 → ② 行 → ③ 行で分けない列 → マスの高さ。下に、できあがりの形の小さな図と一文
  function rowEd(d) {
    const gs = groupers(); const gks = d.gb === 'pick' ? pgsOf(d) : [];
    const cand = gs.filter(g => g.key !== d.gb && !gks.includes(g.key));
    const G = d.rg ? GR0(d.rg) : null;
    const gb = g => `<button class="svt-o${d.rg === g.key ? ' on' : ''}" onclick="wkGroupings._erg('${jsq(g.key)}')">${esc(g.name)}${g.sub ? `<small> ${esc(g.sub)}</small>` : ''}</button>`;
    const src = source(); const cnt = x => src.filter(v => readG(v, G).includes(x)).length;
    const sel = d.rpicks || [];
    let vals = G ? allVals(G.key) : [];
    if (G && G.kind === 'src') vals = vals.map(x => [x, cnt(x)]).sort((a, b) => b[1] - a[1]).slice(0, 40).map(x => x[0]);
    sel.forEach(x => { if (!vals.includes(x)) vals.push(x); });
    const cg = d.gb === 'pick' ? pickGrouper(d) : GR0(d.gb);
    const colNames = cg ? (cg.kind === 'pick' ? ((cg.showNone ? [NONE] : []).concat(cg.items.map(p => p.label))) : [NONE].concat(columns(src, cg).filter(c => !c.none).map(c => c.key))) : [];
    const off = new Set(d.rOff || []);
    const nm = x => x === NONE ? 'その他' : x;
    const rows = G ? sel.concat(d.rShowNone !== false ? [NONE] : []) : [];
    const ch = CELLH.includes(Number(d.cellH)) ? Number(d.cellH) : 2;
    // できあがりの形（列は5つ・行は4つまで）
    const mc = colNames.slice(0, 5), mr = rows.slice(0, 4);
    const mini = mc.length ? `<div class="svt-mini" style="grid-template-columns:${mr.length ? 'auto ' : ''}repeat(${mc.length},auto)">${mr.length ? '<i></i>' : ''}${mc.map(c => `<i class="mc">${esc(nm(c))}</i>`).join('')}${mr.length ? mr.map((r, ri) => `<i class="mr">${esc(nm(r))}</i>` + mc.map(c => off.has(c) ? (ri === 0 ? `<i class="moff" style="grid-row:span ${mr.length}">行なし</i>` : '') : '<i class="mx">…</i>').join('')).join('') : mc.map(() => '<i class="mx">…</i>').join('')}</div>` : '';
    const offL = colNames.filter(c => off.has(c)).map(nm);
    const sum = cg ? `列は <b class="sc">${esc(cg.name)}</b>（${cg.kind === 'pick' ? cg.items.length + '列' : '値ごと'}${colNames.includes(NONE) ? '＋その他' : ''}）${G ? `、行は <b class="sr">${esc(G.name)}</b>（${sel.length}行${d.rShowNone !== false ? '＋その他' : ''}）` : '、行なし'}。${G && offL.length ? `「${esc(offL.join('・'))}」は行で分けません。` : ''}マスの高さはカード${ch}枚ぶん。` : '';
    // 行の選び方は列とまったく同じ見せ方（v53.068・オーナー「行にも、列と同様にタグ・チャンネル・プレイリスト・カスタム列など同じ見せ方・同じビジュアルに」）。
    // 違うのは、行は1つのグループから選ぶことと、列で使っているタググループは選べない（灰色）ことだけ
    const used = g => g.key === d.gb || gks.includes(g.key);
    const rb = g => used(g) ? `<button class="svt-o svt-used" disabled title="列で使っています">${esc(g.name)}<small> 列で使用中</small></button>` : gb(g);
    const isTag = G && G.kind === 'tag';
    const rcol = 'var(--blue)';
    return { row: `<div class="svt-opts">
        <button class="svt-o${!d.rg ? ' on' : ''}" onclick="wkGroupings._erg('')">行なし</button>
        <div class="svt-grp">タグ（グループを押すと、その下に中のタグが開きます。行は1つのグループから選びます）</div>${gs.filter(g => g.kind === 'tag').map(rb).join('')}
        <input id="svt-rngroup" class="svt-ngin" type="text" placeholder="＋ 新しいタググループ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._rng()"><button class="svt-sm" onclick="wkGroupings._rng()">作る</button>
        <div class="svt-grp">チャンネル・プレイリスト</div>${gs.filter(g => g.kind === 'src').map(rb).join('')}
        ${gs.some(g => g.kind === 'one') ? `<div class="svt-grp">カスタム列（セレクト・評価）</div>${gs.filter(g => g.kind === 'one').map(rb).join('')}` : ''}
      </div>
      ${G ? `<div class="setbox svt-pick">
        <div class="svt-grp" style="margin:0"><b>✓ が行になります</b>（⠿ をドラッグで行の順を入れ替え・押すと付け外し・数はいまのフィルターでの本数）</div>
        <div class="svt-pgrow svt-rbox" style="--gc:${rcol}">
          <div class="svt-ph"><span class="svt-gname"><i class="svt-gdot"></i>${esc(G.name)}</span>
            <span class="svt-phb"><button class="svt-sm" onclick="wkGroupings._rall(true)">全部選ぶ</button><button class="svt-sm" onclick="wkGroupings._rall(false)">全部外す</button></span></div>
          <div class="svt-opts" id="svt-rchips">${sel.map((x, i) => `<span class="svt-o on svt-chip svt-rv" data-i="${i}"><span class="svt-grip" title="ドラッグで順番を入れ替え" onpointerdown="wkGroupings._gd(event,${i},'__rows__','svt-rchips')">⠿</span><button class="svt-cb" onclick="wkGroupings._rv('${jsq(x)}')">✓ ${esc(x)}<small> ${cnt(x)}</small></button></span>`).join('')}${vals.filter(x => !sel.includes(x)).map(x => `<button class="svt-o svt-off svt-rv" onclick="wkGroupings._rv('${jsq(x)}')">${esc(x)}<small> ${cnt(x)}</small></button>`).join('') || (sel.length ? '' : '<span class="svt-grp" style="margin:0">まだ値がありません</span>')}</div>
          ${isTag ? `<div class="svt-opts"><input id="svt-rnew" class="svt-pnew-in" type="text" placeholder="＋ 新しいタグ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._rnew()"><button class="svt-sm" onclick="wkGroupings._rnew()">足す</button></div>` : ''}
        </div>
        <label class="svt-grp" style="display:flex;gap:6px;align-items:center;cursor:pointer;margin:0"><input type="checkbox" ${d.rShowNone !== false ? 'checked' : ''} onchange="wkGroupings._rsn(this.checked)"> どれも付いていない動画も「その他」の行に出す</label>
      </div>
      <div class="setbox"><div class="svt-grp" style="margin:0"><b>行で分けない列</b>（その列だけ、行をまたいだ1つのマスにする。列の見出しの「行 ⇕」でも変えられます）</div>
        <div class="svt-opts" id="svt-roffs">${colNames.map(c => `<button class="svt-o${off.has(c) ? ' on' : ''}" onclick="wkGroupings._rofe('${jsq(c)}')">${off.has(c) ? '✓ ' : ''}${esc(nm(c))}</button>`).join('')}</div></div>` : ''}
`, look: `
      <div class="r"><div class="k">マスの高さ</div><div class="svt-opts" id="svt-cellh">${CELLH.map(h => `<button class="svt-o${ch === h ? ' on' : ''}" onclick="wkGroupings._ch(${h})">カード${h}枚</button>`).join('')}<span class="svt-grp" style="margin:0;width:auto">${G ? 'どの行も同じ高さ。中はマスごとにスクロールします' : '行を使うときのマスの高さです'}</span></div></div>
      ${cg ? `<div class="r"><div class="k">できあがり</div><div style="display:grid;gap:6px;min-width:0">${mini}<div class="svt-rsum">${sum}</div></div></div>` : ''}` };
  }
  function drawEd() {
    const el = document.getElementById('svt-ed'); if (!el) return;
    const d = S.editing; if (!d) { el.innerHTML = ''; return; }
    const gs = groupers();
    const gb = g => `<button class="svt-o${d.gb === g.key ? ' on' : ''}" onclick="wkGroupings._eg('${jsq(g.key)}')">${esc(g.name)}${g.sub ? `<small> ${esc(g.sub)}</small>` : ''}</button>`;
    const exists = !!D.items[d.id] && !D.items[d.id].del;
    // 項目ごとに枠で区切る（v53.068・オーナー「名前・列・行・コピーが仕切りなく入っているから何のことか分からない。はっきり区切って」）
    const sec = (cls, n, t, sub, body) => `<section class="svt-sec ${cls}"><div class="svt-sech">${n ? `<span class="svt-secn">${n}</span>` : ''}<b>${t}</b>${sub ? `<span class="svt-secd">${sub}</span>` : ''}</div><div class="svt-secb">${body}</div></section>`;
    const re = d.gb ? rowEd(d) : null;
    el.innerHTML = `<div class="svt-ed">
      ${sec('svt-sec-n', '', '名前', '', `<input id="svt-name" type="text" value="${esc(d.name)}" oninput="wkGroupings._en(this.value)">`)}
      ${sec('svt-sec-c', '1', '列（縦に並ぶ）', '何で左右に分けるか', `<div class="svt-opts">
        <button class="svt-o${!d.gb ? ' on' : ''}" onclick="wkGroupings._eg('')">分けない</button>
        <div class="svt-grp">タグ（グループを押すと、その下に中のタグが開きます。いくつでも選べます）</div>${gs.filter(g => g.kind === 'tag').map(g => `<button class="svt-o${d.gb === 'pick' && pgsOf(d).includes(g.key) ? ' on' : ''}" onclick="wkGroupings._eg('${jsq(g.key)}')">${esc(g.name)}<small> ${esc(g.sub)}</small></button>`).join('')}
        <input id="svt-ngroup" type="text" placeholder="＋ 新しいタググループ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._ng()"><button class="svt-sm" onclick="wkGroupings._ng()">作る</button>
        <div class="svt-grp">チャンネル・プレイリスト</div>${gs.filter(g => g.kind === 'src').map(gb).join('')}
        ${gs.some(g => g.kind === 'one') ? `<div class="svt-grp">カスタム列（セレクト・評価）</div>${gs.filter(g => g.kind === 'one').map(gb).join('')}` : ''}
      </div>${d.gb === 'pick' && pgsOf(d).length ? pickEd(d) : ''}`)}
      ${sec('svt-sec-r', '2', '行（横に並ぶ）', '列の中を、さらに上下に分ける。行はどの列にも通ります', re ? re.row : '<div class="svt-grp" style="margin:0">先に「1 列」を選ぶと、行を選べます</div>')}
      ${re ? sec('svt-sec-l', '3', '見た目', 'マスの高さと、できあがりの形', re.look) : ''}
      <div class="svt-grp" style="margin:0">絞り込みは、ふだんのフィルター（サイドパネル・フィルターの窓・検索語）をそのまま使います。グルーピングはこのリストに保存され、ほかの端末にも出ます。</div>
      ${exists ? sec('svt-sec-p', '', 'コピー', '保存してある内容を、このリスト・ほかのリストに写して新しいグルーピングを作ります（編集中の変更は入りません）', copyBox(d)) : ''}
      <div class="foot">${exists ? '<button class="svt-sm danger" onclick="wkGroupings._del()">このグルーピングを消す</button>' : ''}<span style="flex:1"></span><button class="svt-sm" onclick="wkGroupings._ec()">やめる</button><button class="svt-sm pri" onclick="wkGroupings._es()">保存</button></div>
    </div>`;
    fitEd();
  }
  // 編集の画面は上に残る見出しの中に開く。高さは見出しの下から画面の下（スマホは下のタブの上）まで、中だけスクロール（v53.055）
  function fitEd() {
    const el = document.getElementById('svt-ed'); if (!el || !el.firstElementChild) return;
    if (S.edOpenNew) { el.scrollTop = 0; S.edOpenNew = false; }
    const k = (window.wkZoomK && window.wkZoomK()) || 1;
    const nav = document.querySelector('.mobile-nav, #mobileNav, .mn-bar') || document.getElementById('mnav-admin')?.parentElement;
    const nr = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
    const bottom = nr && nr.height && nr.top > 0 && nr.top < innerHeight ? nr.top : innerHeight;
    const top = Math.max(0, el.getBoundingClientRect().top);
    el.style.maxHeight = Math.max(220, (bottom - top - 8) / k) + 'px';
  }
  // コピー（v53.065・オーナー「既存のグルーピング条件をコピーする機能」）。保存してあるグルーピングをそのまま写して、
  // このリスト／ほかのリスト（マスター含む）に新しいグルーピングとして足す。元のグルーピング・動画・タグには触らない
  function listOpts() {
    const cur = listKey();
    const vs = (window._cvViews || []).filter(v => v && v.id).map(v => [v.id, v.label || v.name || v.id]);
    return [[cur, 'このリスト'], ...(cur !== 'master' ? [['master', 'マスター']] : []), ...vs.filter(([id]) => id !== cur)];
  }
  function copyBox(d) {
    return `<div class="svt-copy"><span class="svt-grp" style="margin:0;width:auto">コピー先</span><select id="svt-copy-to" title="コピー先のリスト">${listOpts().map(([id, l]) => `<option value="${esc(id)}">${esc(l)}</option>`).join('')}</select><button class="svt-sm" onclick="wkGroupings._copy()">にコピーを作る</button></div>`;
  }
  function copyGrouping(id, toList) {
    const src = D.items[id]; if (!src || src.del) return null;
    const { at, ...rest } = JSON.parse(JSON.stringify(src));
    const names = new Set(viewsOf(toList).map(v => v.name));
    let name = rest.name + '（コピー）', n = 2; while (names.has(name)) name = rest.name + '（コピー' + (n++) + '）';
    const e = { ...rest, id: newId(), list: toList, name, created: Date.now() };
    if (toList !== src.list) delete e.hidden;   // 非表示はリストの中の動画に付けた印なので、ほかのリストには写さない
    put(e);
    return e;
  }
  function drawTabs() {
    const el = document.getElementById('svt-tabs'); if (!el) return;
    const vs = viewsOf(listKey()); const cur = VW();
    if (NEWUI) {
      // 試作（?grpui=new）: サイドパネルのリストと同じく、プルダウン1つと ✏️。「グルーピングを編集」の行は出さない
      el.innerHTML = `<div class="svt-pickw"><button class="svt-gpick" data-svtpop onclick="wkGroupings._pm(this)"><span class="svt-pic">${cur.gb ? '⊞' : '▦'}</span><b>${esc(cur.name)}</b><span class="svt-pcar">▾</span></button>` +
        (cur.id !== 'all' ? `<button class="svt-pen" title="グルーピングを編集" onclick="wkGroupings._edit()">✏️</button>` : '') +
        (S.undo.length ? `<button class="svt-sm" onclick="wkGroupings._undo()" title="⌘Z / Ctrl+Z">↶ 1つ戻す</button>` : '') + '</div>';
      const sum0 = document.getElementById('svt-sum'); if (sum0) sum0.innerHTML = '';
      return;
    }
    el.innerHTML = vs.map(v => `<button class="svt-vt${v.id === cur.id ? ' on' : ''}" onclick="wkGroupings._pick('${jsq(v.id)}')">${v.gb ? '⊞ ' : '▦ '}${esc(v.name)}</button>`).join('') +
      `<button class="svt-vt add" onclick="wkGroupings._new()">＋ グルーピング</button>`;
    const sum = document.getElementById('svt-sum');
    // 「分ける基準 ◯◯: …」の文は出さない（v53.059・オーナー「この文言はいらない」。列の見出しに同じことが出ている）
    if (sum) sum.innerHTML = 
      (cur.id !== 'all' ? `<button class="svt-sm" onclick="wkGroupings._edit()">✎ グルーピングを編集</button>` : '') +
      (S.undo.length ? `<button class="svt-sm" onclick="wkGroupings._undo()" title="⌘Z / Ctrl+Z">↶ 1つ戻す</button>` : '');
  }
  let _drawnKey = null;
  const drawKey = () => listKey() + '|' + (VW().id || '');
  function draw() {
    _drawnKey = drawKey();
    _gc = null; place();
    const host = document.getElementById('lib-card-host');
    // 「すべて」（分けない）のときは、ふだんのカード一覧をそのまま出す
    if (host) host.classList.toggle('svt-on', !!VW().gb && !isTable());
    drawTabs(); drawEd(); if (isTable()) { rerenderTable(); const b = document.getElementById('svt-body'); if (b && b.innerHTML) b.innerHTML = ''; } else drawBody(); drawToast(); stickTops(); tableExtras();
  }

  function css() {
    if (document.getElementById('svt-style')) return;
    const st = document.createElement('style'); st.id = 'svt-style';
    st.textContent = `
#lib-card-host.svt-on #cardList{display:none!important}
/* ── 試作の見た目（?grpui=new のときだけ・v53.079） ── */
#svt-root.svt-new .svt-head{padding:6px 16px;gap:0}
#svt-root.svt-new .svt-main{padding-top:0}
#svt-root.svt-new .svt-sum{display:none}
#svt-root.svt-new .svt-tabs{display:block;width:100%}
#svt-root .svt-pickw{display:flex;gap:8px;align-items:center;min-width:0}
#svt-root .svt-gpick{flex:0 1 380px;min-width:0;display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:16px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font:inherit;font-size:13px;cursor:pointer}
#svt-root .svt-gpick b{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
#svt-root .svt-pcar{color:var(--text3);font-size:11px}
.svt-pic{color:var(--text3);margin-right:6px}
#svt-root .svt-gpick .svt-pic{margin:0}
#svt-root .svt-pen{width:32px;height:32px;flex:0 0 32px;border-radius:50%;border:1px solid var(--border);background:var(--surface2);cursor:pointer;font-size:13px;padding:0}
#svt-pop{position:fixed;z-index:10050;min-width:220px;max-width:min(360px,calc(100vw - 16px));max-height:min(70vh,520px);overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.18);padding:6px;font-size:14px}
#svt-pop .svt-pi{display:flex;align-items:center;width:100%;text-align:left;padding:9px 12px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer}
#svt-pop .svt-pi:hover{background:var(--surface2)}
#svt-pop .svt-pi.on{font-weight:600;background:var(--surface2)}
#svt-pop .svt-pi .ck{margin-left:auto;padding-left:12px;color:var(--text3)}
#svt-pop .svt-pi.sub{color:var(--text2)}
#svt-pop .svt-psep{border-top:1px solid var(--border);margin:4px 2px}
#svt-pop .svt-ph2{font-size:11px;color:var(--text3);padding:6px 12px 2px}
#svt-root.svt-new .svt-colhs{padding-top:2px}
#svt-root.svt-new .svt-colhs:has(.svt-gcap){padding-top:14px}
#svt-root.svt-new .svt-colhs .svt-colh,#svt-root.svt-new .svt-colh[style*='--gc']{border-top:0;border-radius:0;padding:4px 4px 6px;gap:6px;flex-wrap:nowrap;align-items:center;position:relative}
#svt-root.svt-new .svt-colhs .svt-colh.svt-cfold{padding-top:4px}
#svt-root.svt-new .svt-colh.svt-gcap::after{content:attr(data-g);position:absolute;left:4px;top:-12px;font-size:10.5px;color:var(--text3);letter-spacing:.04em;white-space:nowrap}
#svt-root.svt-new .svt-colh .svt-tag{background:none;box-shadow:none;padding:0;border-radius:0;font-size:13px;font-weight:700;color:var(--text);flex:0 1 auto;max-width:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}
#svt-root.svt-new .svt-colh .svt-tag.none{color:var(--text3);font-weight:600}
#svt-root.svt-new .svt-colh .n{color:var(--text3);font-size:12px;flex:0 0 auto}
#svt-root.svt-new .svt-son{color:var(--accent);font-size:11px;flex:0 0 auto}
#svt-root.svt-new .svt-cmore{margin-left:auto;flex:0 0 auto;border:0;background:none;color:var(--text3);font-size:17px;line-height:1;padding:2px 6px;border-radius:6px;cursor:pointer;font-family:inherit}
#svt-root.svt-new .svt-cmore:hover{background:var(--surface2);color:var(--text)}
#svt-root.svt-new .svt-fold{border:0;background:none;color:var(--text3);width:16px;height:16px;font-size:10px}
#svt-root.svt-new .svt-gstart::before{border-left:1px solid var(--border)}
#svt-root.svt-new .svt-gtag{box-shadow:none}
/* 行の見出し（v53.080・オーナー「ブラウザではあってもいい、スマホではなくていい。各マスの上に行の名前が出ているから分かる」「縦書きは英語だと良くない」）:
   マウスの PC は横書きの細い見出し（▾ の下に名前）、指で触る端末（スマホ・タブレット）は出さない＝マスの上の帯の名前で読む */
#svt-root.svt-new .svt-rlab,#svt-root.svt-new .svt-rsp{flex-basis:120px}
#svt-root.svt-new .svt-rsp{font-size:0}
#svt-root.svt-new .svt-gridb{scroll-padding-left:130px}
#svt-root.svt-new .svt-rh{border-left:0;border-radius:8px;background:var(--surface2);padding:8px 6px;gap:4px}
#svt-root.svt-new .svt-rh.none{background:var(--surface2)}
#svt-root.svt-new .svt-rht{flex-direction:column;align-items:flex-start;gap:4px}
#svt-root.svt-new .svt-rh b{font-size:12.5px;line-height:1.35;color:var(--text);word-break:normal;overflow-wrap:anywhere}
#svt-root.svt-new .svt-rh .n{font-size:10.5px;color:var(--text3)}
@media (pointer:coarse){
 #svt-root.svt-new .svt-rlab,#svt-root.svt-new .svt-rsp{display:none}
 #svt-root.svt-new .svt-gridb{scroll-padding-left:0}
 #svt-root.svt-new .svt-ccnt span{color:var(--text2);font-weight:600;font-size:11.5px}
}
#svt-root.svt-new .svt-ccnt{background:none}
#svt-root.svt-new .svt-camore{flex:0 0 44px!important;order:9;font-size:16px;color:var(--text2);border-left:1px solid var(--border)!important;border-right:0!important}
@media (max-width:560px){
 #svt-root.svt-new .svt-colhs .svt-colh:not(.svt-cfold):not(.svt-addh){flex-wrap:nowrap}
 #svt-root.svt-new .svt-colhs .svt-colh:not(.svt-cfold) .svt-tag{flex:0 1 auto;white-space:nowrap}}
#svt-root{color:var(--text);font-size:13px}
#svt-root.svt-tbl #svt-body{display:none}
#svt-root{max-width:100%;min-width:0}
#svt-root .svt-head{padding:8px 16px 6px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
#svt-root .svt-head>*{min-width:0}
#svt-root .svt-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#svt-root .svt-tabs{flex:1;min-width:0;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
#svt-root .svt-vt{flex-shrink:0;font-size:12.5px;padding:6px 11px;border-radius:8px;border:none;background:none;color:var(--text2);white-space:nowrap;cursor:pointer;font-family:inherit}
#svt-root .svt-vt.on{background:var(--surface2);color:var(--text);font-weight:700}
#svt-root .svt-sum{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--text3)}
#svt-root .svt-sum:empty{display:none}
#svt-root .svt-sum b{color:var(--text)}
#svt-root .svt-sm{font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit}
#svt-root .svt-sm.pri{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#svt-root .svt-sm.danger{color:var(--red)}
#svt-root .svt-main{padding:10px 16px 0}
#svt-root .svt-main:has(#svt-body:empty){display:none}
#svt-root #svt-ed:empty{display:none}
#svt-root #svt-ed{overflow:auto;overscroll-behavior:contain}
#svt-root #svt-ed .svt-ed{margin-bottom:4px}
#svt-root #svt-ed .svt-ed .foot{position:sticky;bottom:-12px;background:var(--surface);margin:0 -12px -12px;padding:10px 12px 12px;z-index:1}
#svt-root .svt-ed{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px;display:grid;gap:12px;margin-bottom:10px}
#svt-root .svt-sec{--sc:var(--text3);border:1px solid var(--border);border-left:4px solid var(--sc);border-radius:10px;background:var(--surface);overflow:hidden}
#svt-root .svt-sech{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:color-mix(in srgb,var(--sc) 10%,var(--surface));border-bottom:1px solid var(--border)}
#svt-root .svt-sech b{font-size:13px;color:var(--text)}
#svt-root .svt-secn{width:20px;height:20px;border-radius:50%;background:var(--sc);color:#fff;font-size:11px;font-weight:700;display:inline-grid;place-items:center;flex:0 0 auto}
#svt-root .svt-secd{font-size:11px;color:var(--text3)}
#svt-root .svt-secb{padding:10px 12px;display:grid;gap:10px;min-width:0}
#svt-root .svt-sec-c{--sc:#d08a1c}
#svt-root .svt-sec-r{--sc:var(--blue)}
#svt-root .svt-sec-l{--sc:#2d9d6a}
#svt-root .svt-sec-p{--sc:#8a7ab0}
#svt-root .svt-sec-n{--sc:var(--text2)}
#svt-root .svt-ed .r{display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px;align-items:start}
#svt-root .svt-ed .k{font-size:11px;font-weight:700;color:var(--text3);padding-top:5px}
#svt-root .svt-ed input[type=text]{font-size:13px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);max-width:320px;font-family:inherit}
#svt-root .svt-ed .foot{display:flex;gap:8px;border-top:1px solid var(--border);padding-top:10px}
#svt-root .svt-opts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#svt-root .svt-grp{width:100%;font-size:10.5px;color:var(--text3);margin-top:4px}
#svt-root .svt-o{font-size:11.5px;padding:4px 10px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;font-family:inherit}
#svt-root .svt-o.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#svt-root .svt-o small{opacity:.7}
#svt-root .setbox{border:1px dashed var(--border);border-radius:9px;padding:10px;display:grid;gap:6px}
#svt-root .svt-addcol{border:1px dashed var(--border);background:var(--surface)}
#svt-root .svt-spacer{border:none;background:none;min-height:1px}
#svt-root .svt-addbox{display:grid;gap:6px;padding:0 2px 4px}
#svt-root .svt-addh{gap:4px}
#svt-root .svt-addh input{flex:1;min-width:0;font-size:12px;padding:3px 8px;border-radius:6px;border:1px dashed var(--border);background:var(--surface);color:var(--text);font-family:inherit}
#svt-root .svt-used{opacity:.45;cursor:not-allowed}
#svt-root .svt-addbox input,#svt-root #svt-pnew,#svt-root #svt-ngroup,#svt-root .svt-ngin,#svt-root .svt-pnew-in{font-size:12.5px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;min-width:0}
#svt-root .svt-ph{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}
#svt-root .svt-phb{display:flex;gap:6px}
#svt-root .svt-chip{display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 0}
#svt-root .svt-grip{cursor:grab;padding:4px 4px 4px 8px;touch-action:none;user-select:none;opacity:.7}
#svt-root .svt-cb{border:none;background:none;color:inherit;font:inherit;cursor:pointer;padding:4px 6px 4px 0}
#svt-root .svt-chip.dragging{opacity:.45}
#svt-root .svt-chip.drop-before{box-shadow:-3px 0 0 var(--gold)}
#svt-root .svt-chip.drop-after{box-shadow:3px 0 0 var(--gold)}
#svt-root .svt-off{opacity:.65}
#svt-root .svt-board{display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:8px;scroll-snap-type:x proximity}
#svt-root .svt-col{flex:0 0 calc(var(--svt-cw,250px) + 12px);border-radius:10px;padding:6px;scroll-snap-align:start}
#svt-root .svt-col.over{background:var(--gold-soft)}
#svt-root .svt-col.copy{outline:2px dashed var(--gold);outline-offset:-2px}
#svt-root .svt-col.over:not(.copy)::before{content:'ここへ移動（Option で両方に）';display:block;font-size:10.5px;color:var(--text3);padding:0 2px 6px}
#svt-root .svt-col.copy::before{content:'＋ ここにも追加';display:block;font-size:10.5px;color:var(--gold);padding:0 2px 6px}
#svt-root .svt-colh{display:flex;gap:6px;align-items:center;padding:2px 2px 8px}
#svt-root:not(.svt-tbl) .svt-head{position:sticky;top:var(--svt-top,0px);z-index:8;background:var(--bg)}
#svt-root .svt-colwrap{position:sticky;top:calc(var(--svt-top,0px) + var(--svt-hh,0px));z-index:7;background:var(--bg);margin:0 -16px;padding:0 16px}
#svt-root .svt-colhs{overflow:hidden;margin:0 -16px;padding:6px 16px 0}
#svt-root .svt-hbar{overflow-x:auto;overflow-y:hidden;height:14px;margin-bottom:2px}
#svt-root .svt-hbar.none{display:none}
#svt-root .svt-hbar > div{height:1px}
#svt-root .svt-colhs-in{display:flex;gap:12px}
#svt-root .svt-colhs .svt-colh{flex:0 0 calc(var(--svt-cw,250px) + 12px);padding:2px 8px 8px;box-sizing:border-box;min-width:0}

#svt-root .svt-tag{font-size:12px;padding:2px 8px;border-radius:5px;background:var(--blue-soft);color:var(--text);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#svt-root .svt-tag.none{background:var(--surface3)}
#svt-root .n{font-size:10.5px;color:var(--text3)}
#svt-root .svt-cards{display:grid;gap:8px}
#svt-root .svt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
#svt-root .svt-card[draggable=true]{cursor:grab}
#svt-root .svt-th{aspect-ratio:16/9;background:var(--surface3);position:relative;overflow:hidden;cursor:pointer}
#svt-root .svt-th img{width:100%;height:100%;object-fit:cover;display:block}
#svt-root .svt-th span{position:absolute;right:4px;bottom:4px;font-size:9.5px;background:rgba(0,0,0,.65);color:#fff;padding:0 4px;border-radius:3px}
#svt-root .svt-tt{padding:7px 8px 4px;font-size:11px;font-weight:700;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#svt-root .svt-mt{padding:0 8px 8px;font-size:10px;color:var(--text3);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#svt-root .svt-mt .svt-sm{margin-left:auto;font-size:10px;padding:2px 7px}
#svt-root .svt-also{padding-top:0}
#svt-root .svt-lc{background:none;border:none;border-radius:0;overflow:visible}
#svt-root .svt-lc .card-wrap{width:100%;max-width:none;margin:0}
#svt-root .svt-cardx{display:flex;gap:6px;justify-content:flex-end;align-items:center;padding:4px 8px}
#svt-root .svt-csort{margin-left:auto;max-width:120px;font-size:10.5px;padding:2px 4px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-family:inherit;cursor:pointer}
#svt-root .svt-csort.on{border-color:var(--accent);color:var(--text)}
#svt-root .svt-chip.svt-stale{opacity:.55;text-decoration:line-through}
#svt-root .svt-copy{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}
#svt-root .svt-copy .k{font-size:11px;font-weight:700;color:var(--text3);width:80px}
#svt-root .svt-copy select{font-size:12px;padding:4px 6px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);max-width:220px}
#svt-root .svt-pgrow{display:grid;gap:6px;border:1px solid var(--border);border-left:4px solid var(--gc);border-radius:8px;padding:8px 10px}
#svt-root .svt-gname{font-weight:700;font-size:12px;display:inline-flex;align-items:center;gap:6px}
#svt-root .svt-gdot{width:10px;height:10px;border-radius:50%;background:var(--gc);display:inline-block}
#svt-root .svt-colh[style*='--gc'] .svt-gtag{box-shadow:inset 0 -3px 0 var(--gc)}
#svt-root .svt-colh[style*='--gc']{border-top:3px solid var(--gc);border-radius:4px 4px 0 0;padding-top:6px}
#svt-root .svt-gstart{margin-left:14px;position:relative}
#svt-root .svt-colhs .svt-gstart::before,#svt-root .svt-board .svt-gstart::before{content:'';position:absolute;left:-14px;top:0;bottom:0;border-left:2px dashed var(--border)}
#svt-root .svt-gn{opacity:.6}
#svt-root .svt-addh select{font-size:11px;max-width:40%;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)}
#svt-root .svt-mdone{width:100%;margin:2px 0 0!important;padding:7px 10px!important;font-size:12px!important;font-weight:700}
#svt-root .svt-msec{box-sizing:border-box;min-width:0;width:100%;display:grid;gap:6px;border:1px solid var(--border);border-left:3px solid var(--sc,#d08a1c);border-radius:8px;padding:6px 8px;background:var(--surface)}
#svt-root .svt-msec:has(.svt-mhr){--sc:var(--blue)}
#svt-root .svt-mh{font-size:10.5px;font-weight:700;color:var(--sc,#d08a1c)}
#svt-root .svt-mg{display:grid;gap:4px}
#svt-root .svt-mgn{font-size:11px;font-weight:700;color:var(--text2);display:inline-flex;gap:5px;align-items:center}
#svt-root .svt-mgc{display:flex;flex-wrap:wrap;gap:5px}
#svt-root .svt-mhint{width:100%;font-size:10px;color:var(--text3)}
#svt-root .svt-multi .svt-sm{margin-left:auto}
#svt-root .svt-hidebtn{margin-left:0!important}
#svt-root .svt-mt .svt-sm+.svt-hidebtn{margin-left:4px!important}
#svt-root .svt-mt>span+.svt-hidebtn{margin-left:auto!important}
#svt-root .svt-hidcol{background:var(--surface2);opacity:.85}
.svt-tblhide{font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit}
#svt-root{--svt-cellh:760px}
#svt-root .svt-gridb{gap:10px;scroll-padding-left:106px}   /* 列の頭に吸い付くとき、左に残る行の見出しの右に止める（無いと最初の列が見出しの下に潜った） */
#svt-root .svt-gcol{padding:0;display:grid;gap:8px;align-content:start}
#svt-root .svt-rlab{flex:0 0 96px;position:sticky;left:0;z-index:3;background:var(--bg);display:grid;gap:8px;align-content:start}
#svt-root .svt-rh{border-left:3px solid var(--blue);background:var(--blue-soft);border-radius:0 8px 8px 0;padding:8px 8px;display:flex;flex-direction:column;gap:2px;font-size:12px;box-sizing:border-box;overflow:hidden;word-break:break-word}
#svt-root .svt-rh.none{border-left-color:var(--text3);background:var(--surface2)}
#svt-root .svt-rsp{flex:0 0 96px;position:sticky;left:0;z-index:2;background:var(--bg);font-size:10.5px;color:var(--text3);display:flex;align-items:flex-end;padding:2px 4px 8px;box-sizing:border-box}
#svt-root .svt-rsp b{color:var(--blue)}
#svt-root .svt-colhs .svt-colhs-in{gap:10px}
#svt-root .svt-gridb .svt-gstart{margin-left:12px}
#svt-root .svt-cell.svt-cspan{max-height:var(--svt-cellmax,none)}
#svt-root .svt-clist{overflow-x:hidden;scrollbar-gutter:stable}
/* スマホで、カードの上で指を横に滑らせてもボードが横に動くように（v53.076・オーナーの録画「スマホで横スクロールできない」）。
   ライブラリのカード（.card）は touch-action:pan-y（縦だけ）なので、グルーピングの中では横も通す */
#svt-root .svt-lc .card,#svt-root .svt-lc .card-v2{touch-action:pan-x pan-y}
#svt-root .svt-gridb .svt-gcol,#svt-root .svt-gridh .svt-colh:not(.svt-addh){flex-basis:calc(var(--svt-cw,250px) + 14px + var(--svt-sb,0px))}
@media (max-width:560px){#svt-root .svt-gridb .svt-gcol,#svt-root .svt-gridh .svt-colh:not(.svt-addh){flex-basis:min(82%,calc(var(--svt-cw,250px) + 14px + var(--svt-sb,0px)))}}
#svt-root .svt-cell .svt-lc,#svt-root .svt-cell .card-wrap,#svt-root .svt-cell .card{min-width:0;max-width:100%;box-sizing:border-box}
#svt-root .svt-cardx{min-width:0}
#svt-root .svt-cardx .svt-sm:not(.svt-hidebtn){flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
#svt-root .svt-cell{border:1px solid var(--border);border-radius:10px;background:var(--surface2);display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;min-height:0}
#svt-root .svt-cell.svt-cspan{border-style:dashed}
#svt-root .svt-cell.over{outline:2px solid var(--gold);outline-offset:-2px;background:var(--gold-soft)}
#svt-root .svt-cell.copy{outline-style:dashed}
#svt-root .svt-ccnt{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 8px;font-size:10.5px;color:var(--text3);border-bottom:1px solid var(--border);background:var(--surface);flex:0 0 auto}
#svt-root .svt-ccnt span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#svt-root .svt-ccnt b{font-size:11.5px;color:var(--text)}
#svt-root .svt-clist{flex:1 1 auto;min-height:0;overflow-y:auto;padding:6px;overscroll-behavior-y:contain;overscroll-behavior-x:auto}
#svt-root .svt-cell.svt-cempty .svt-clist::after{content:'0本';display:block;text-align:center;font-size:10.5px;color:var(--text3);padding:14px 0}
#svt-root .svt-roff{font-size:10px;padding:1px 6px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit}
#svt-root .svt-roff.on{background:var(--blue-soft);color:var(--blue);border-color:var(--blue)}
#svt-root .svt-rv.on{background:var(--blue);border-color:var(--blue);color:#fff}
#svt-root .svt-rhint{color:var(--blue)}
#svt-root .svt-kc{color:var(--gold)}
#svt-root .svt-kr{color:var(--blue)}
#svt-root .svt-mini{display:grid;gap:2px;font-size:10px;width:max-content;max-width:100%;overflow:hidden}
#svt-root .svt-mini i{font-style:normal;padding:2px 5px;border-radius:3px;background:var(--surface2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}
#svt-root .svt-mini .mc{background:var(--gold-soft);color:var(--gold);font-weight:700}
#svt-root .svt-mini .mr{background:var(--blue-soft);color:var(--blue);font-weight:700}
#svt-root .svt-mini .mx,#svt-root .svt-mini .moff{background:var(--surface3);color:var(--text3);text-align:center}
#svt-root .svt-mini .moff{display:grid;place-items:center}
#svt-root .svt-rsum{font-size:12px;color:var(--text2);background:var(--surface2);border-radius:8px;padding:6px 10px}
#svt-root .svt-rsum .sc{color:#d08a1c}#svt-root .svt-rsum .sr{color:var(--blue)}
@media (max-width:560px){#svt-root .svt-rlab,#svt-root .svt-rsp{flex-basis:72px}#svt-root .svt-gridb{scroll-padding-left:82px}}
#svt-root .svt-fold{flex:0 0 auto;width:22px;height:22px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);font-size:11px;line-height:1;cursor:pointer;display:inline-grid;place-items:center;padding:0;font-family:inherit}
#svt-root .svt-fold:hover{color:var(--text);border-color:var(--text3)}
#svt-root .svt-col.svt-cfold,#svt-root .svt-colhs .svt-colh.svt-cfold{flex:0 0 44px!important;padding-left:0;padding-right:0;justify-content:center}
#svt-root .svt-col.svt-cfold{padding:0}
#svt-root .svt-fstrip{width:44px;min-height:160px;border:1px dashed var(--border);border-radius:10px;background:var(--surface2);color:var(--text2);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0;font-family:inherit}
#svt-root .svt-fstrip b{writing-mode:vertical-rl;font-size:12px;color:var(--text);max-height:calc(100% - 40px);overflow:hidden;text-overflow:ellipsis}
#svt-root .svt-fstrip span{font-size:10px;writing-mode:vertical-rl}
#svt-root .svt-cell.svt-xfold{background:transparent;border:none;overflow:visible}
#svt-root .svt-xbar{flex:0 0 auto;height:${FOLD_H}px;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:0 8px;border:1px solid var(--border);border-radius:10px;background:var(--surface);font-size:10.5px;color:var(--text3)}
#svt-root .svt-xbar span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#svt-root .svt-xbar b{font-size:11.5px;color:var(--text)}
#svt-root .svt-xbar .svt-fold{width:18px;height:18px;font-size:10px}
#svt-root .svt-xfold.over .svt-xbar{outline:2px solid var(--gold);outline-offset:-2px;background:var(--gold-soft)}
#svt-root .svt-ccnt .svt-fold{width:18px;height:18px;font-size:10px}
#svt-root .svt-ccnt span{flex:1 1 auto;min-width:0}
#svt-root .svt-rht{display:flex;gap:6px;align-items:center;min-width:0}
#svt-root .svt-rfold{flex-direction:row;align-items:center;justify-content:space-between;padding-top:4px;padding-bottom:4px}
#svt-root .svt-rh b{min-width:0}
#svt-root .svt-rfold b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#svt-root .svt-rfold .svt-rht{flex:1 1 auto}
#svt-root .svt-rfold .n{white-space:nowrap;flex:0 0 auto}
#svt-root .svt-note{font-size:11.5px;color:var(--text3);padding:8px 2px 16px;line-height:1.6}
#svt-toast .svt-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));background:var(--accent);color:var(--on-accent);font-size:12px;padding:8px 14px;border-radius:8px;display:flex;gap:10px;align-items:center;width:max-content;max-width:calc(100% - 32px);z-index:9001}
#svt-toast .svt-tsep{width:1px;align-self:stretch;background:currentColor;opacity:.3;margin:0 2px}
#svt-toast .svt-toast button{border:none;background:none;color:inherit;font-size:12px;white-space:nowrap;cursor:pointer;font-family:inherit}
#svt-toast .svt-tu{opacity:.85}
#svt-toast .svt-tx{border:1px solid currentColor!important;border-radius:6px;padding:3px 9px;font-weight:700}
@media (max-width:560px){#svt-root .svt-col,#svt-root .svt-colhs .svt-colh{flex-basis:min(82%,calc(var(--svt-cw,250px) + 12px))}#svt-root .svt-ed .r{grid-template-columns:minmax(0,1fr)}}
/* スマホでは見出しの名前を1行目に1人で置く（v53.078・オーナーのスマホ「タグ読めない」。▾・名前・本数・行なし・並べ替えを1行に並べていたので、
   名前が「そ…」の1文字まで押しつぶされていた。行の見出しも ▾ が横に並んで名前が1文字ずつ折れていた） */
@media (max-width:560px){
#svt-root .svt-colhs .svt-colh:not(.svt-cfold):not(.svt-addh){flex-wrap:wrap;row-gap:5px}
#svt-root .svt-colhs .svt-colh:not(.svt-cfold) .svt-tag{flex:1 1 calc(100% - 76px);max-width:none;white-space:normal;word-break:break-word;line-height:1.35}
#svt-root .svt-colhs .svt-colh .svt-csort{margin-left:auto;max-width:150px}
#svt-root .svt-rht{flex-direction:column;align-items:flex-start;gap:4px}
#svt-root .svt-rh{padding:6px 6px}
}
`;
    document.head.appendChild(st);
  }

  // ライブラリのカード1枚の幅（v53.074・オーナー「カードのサイズが全然違う」）。
  // ライブラリの一覧は .card-list の格子（PC 4列・タブレット 3列）で、幅はサイドバーの開閉・画面の幅で変わる。
  // 以前は付けたときに1回だけ、しかも「#lib-card-host の中の最初の .card-wrap」を測っていたので、
  // 一覧が隠れているとグルーピング自身のカードを測ったり、その後の幅の変化を拾えなかった。
  // いまは描くたびに、一覧と同じクラスの見えない並び（高さ0）を一覧のすぐ前に置き、そこの1枚目の幅を測る＝ライブラリと同じ CSS で決まる幅
  function libCardW() {
    const host = document.getElementById('lib-card-host'), list = document.getElementById('cardList');
    if (!host || !list || !list.parentElement) return 0;
    const pr = document.createElement('div'); pr.className = list.className || 'card-list'; pr.setAttribute('aria-hidden', 'true');
    pr.style.cssText = 'visibility:hidden;height:0;min-height:0;padding-top:0;padding-bottom:0;margin:0;overflow:hidden;pointer-events:none';
    pr.innerHTML = '<div class="card-wrap"></div><div class="card-wrap"></div>';
    list.parentElement.insertBefore(pr, list);
    const w = pr.firstElementChild.getBoundingClientRect().width / (((window.wkZoomK && window.wkZoomK()) || 1));
    pr.remove();
    return w >= 120 ? Math.round(w * 100) / 100 : 0;
  }
  const NEWUI = (() => { try { const q = new URLSearchParams(location.search).get('grpui'); if (q) sessionStorage.setItem('wk_grpui', q); return (q || sessionStorage.getItem('wk_grpui')) === 'new'; } catch (e) { return false; } })();
  let _obs = null, _redrawT = null;
  const isOpen = () => !!document.getElementById('svt-root');
  const isTable = () => { const oh = document.getElementById('lib-org-host'); return !!oh && getComputedStyle(oh).display !== 'none'; };
  function open() {
    if (isOpen()) return;
    css();
    const host = document.getElementById('lib-card-host'); const list = document.getElementById('cardList');
    if (!host || !list) return;
    const cw = libCardW();
    const root = document.createElement('div'); root.id = 'svt-root'; if (NEWUI) root.classList.add('svt-new');
    if (cw) root.style.setProperty('--svt-cw', cw + 'px');
    root.innerHTML = `<div class="svt-head">
        <div class="svt-top"><div class="svt-tabs" id="svt-tabs"></div></div>
        <div class="svt-sum" id="svt-sum"></div>
        <div id="svt-ed"></div>
      </div>
      <div class="svt-main"><div id="svt-body"></div></div><div id="svt-toast"></div>`;
    host.insertBefore(root, list);
    // リストが変わった（＝分ける基準が変わった）ときは、待たずにその場で描く（v53.056）。
    // 見張りの呼び出しは画面に出る前に動くので、ふだんのカード一覧が一瞬見えることが無い。
    // 以前は 60ms 待っていたので、その間は前のリスト（マスター＝分けない）の形で #cardList が見えていた
    _obs = new MutationObserver(() => {
      if (isOpen() && drawKey() !== _drawnKey) { clearTimeout(_redrawT); draw(); return; }
      clearTimeout(_redrawT); _redrawT = setTimeout(() => { if (isOpen()) draw(); }, 60); });
    _obs.observe(list, { childList: true });
    const rc = document.getElementById('rc'); if (rc) _obs.observe(rc, { childList: true, characterData: true, subtree: true });
    const oh = document.getElementById('lib-org-host'); if (oh) _obs.observe(oh, { attributes: true, attributeFilter: ['style', 'class'] });
    window._orgRowGrouper = orgGrouper; window._orgGroupToggle = orgGroupToggle;
    watchTable();
    if (!_repaired && (window.videos || []).length && window.tagRegistry) { _repaired = true; try { repairFromHistory(); } catch (e) { console.warn('[groupings] 読み替えに失敗', e); } }
    draw();
  }
  function close(keepPref) {
    const wasTable = isTable();
    window._orgRowGrouper = null; window._orgGroupToggle = null;
    if (_tblObs) { _tblObs.disconnect(); _tblObs = null; }
    document.getElementById('svt-root')?.remove();
    if (wasTable) window.renderOrg?.();
    { const hr = document.getElementById('orgTheadRow'); hr?.querySelector('th.svt-hideth')?.remove(); document.querySelectorAll('#orgList td.svt-hidecell').forEach(x => x.remove()); }
    document.getElementById('lib-card-host')?.classList.remove('svt-on');
    if (_obs) { _obs.disconnect(); _obs = null; }
    S.toast = null; S.editing = null;
  }
  function onKey(e) {
    if (!isOpen() || !(e.metaKey || e.ctrlKey) || e.shiftKey || (e.key !== 'z' && e.key !== 'Z')) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!S.undo.length) return; e.preventDefault(); window.wkGroupings._undo();
  }
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { if (isOpen()) stickTops(); });
  // テーブルは本番の表（organize.js の renderOrg が _orgRowGrouper を見て、行のあいだにグループの見出しを挟む）
  function place() {
    const root = document.getElementById('svt-root'); if (!root) return;
    if (isTable()) {
      const oh = document.getElementById('lib-org-host'); const bar = oh.querySelector('.org-count-bar');
      if (root.parentElement !== oh) { if (bar && bar.parentElement === oh) bar.after(root); else oh.prepend(root); }
      root.classList.add('svt-tbl');
    } else {
      const host = document.getElementById('lib-card-host'), list = document.getElementById('cardList');
      if (host && list && root.nextElementSibling !== list) host.insertBefore(root, list);
      root.classList.remove('svt-tbl');
    }
  }
  function orgGrouper(list) {
    if (!isOpen() || !isTable()) return null;
    const V = VW(); const g = V.gb ? GR(V.gb) : null; if (!g) return null;
    // 非表示のグループは最初は畳んでおく（開けば行の右端の「表示に戻す」で戻せる）
    const op = (k, hid) => hid ? !!S.closed[V.id + '|' + k] : !S.closed[V.id + '|' + k];
    const R = rowG(V);
    if (!R) return colsH(list, g).map(c => ({ key: c.key, name: c.name, ids: c.ids, open: op(c.key, c.hid) }));
    // 行があるときは「列 › 行」の見出し（行で分けない列・非表示はその列だけ）。動画の入っていない組み合わせは出さない
    const rv = rowVals(V); const rows = rv.concat(V.rShowNone !== false ? [NONE] : []); const off = new Set(Array.isArray(V.rOff) ? V.rOff : []);
    const byId = new Map(list.map(v => [v.id, v])); const nm = x => x === NONE ? 'その他' : x; const out = [];
    // 2段（v53.075・オーナー「まず縦列で大きいアコーディオン、その下に横行ごとのアコーディオン」）: 列の見出し → その下に行の見出し
    colsH(list, g).forEach(c => {
      if (c.hid || off.has(c.key === NONE ? NONE : c.name)) { out.push({ key: c.key, name: c.name, ids: c.ids, open: op(c.key, c.hid) }); return; }
      const sub = [];
      rows.forEach(r => { const ids = c.ids.filter(id => { const x = readG(byId.get(id), R).filter(y => rv.includes(y)); return r === NONE ? !x.length : x.includes(r); });
        if (!ids.length) return; const k = c.key + ' › ' + r; sub.push({ key: k, name: nm(r), ids, open: op(k) }); });
      out.push({ key: c.key, name: nm(c.name), ids: c.ids, open: op(c.key), sub });
    });
    return out;
  }
  function orgGroupToggle(k) { const ck = VW().id + '|' + k; S.closed[ck] = !S.closed[ck]; window.renderOrg?.(); }
  // テーブルの右端に「非表示／表示に戻す」の列を足す（organize.js の表は変えず、描き終わった表に1列足すだけ。
  // リストのカスタム列（custom-view.js が後から足す）より右に来るように、描き終わりの変化を見てから足す）
  let _tblObs = null;
  function tableExtras() {
    const tb = document.getElementById('orgList'); const hr = document.getElementById('orgTheadRow'); if (!tb || !hr) return;
    const V = VW(); const on = isOpen() && isTable() && !!V.gb;
    const table = tb.closest('table');
    if (!on) {
      hr.querySelector('th.svt-hideth')?.remove(); tb.querySelectorAll('td.svt-hidecell').forEach(x => x.remove());
      if (table && table.dataset.svtW) { if (table.style.width === table.dataset.svtW) table.style.width = (parseFloat(table.style.width) - 84) + 'px'; delete table.dataset.svtW; }
      return;
    }
    const hs = hiddenOf(V);
    let th = hr.querySelector('th.svt-hideth');
    if (!th || th !== hr.lastElementChild) { th?.remove(); th = document.createElement('th'); th.className = 'org-th svt-hideth'; th.style.cssText = 'width:84px;min-width:84px;text-align:center'; th.textContent = '非表示'; hr.appendChild(th); }
    tb.querySelectorAll('tr.org-tr').forEach(tr => {
      const vid = tr.id.replace(/^org-row-/, ''); const hid = hs.has(vid);
      let td = tr.querySelector('td.svt-hidecell');
      if (td && td !== tr.lastElementChild) { td.remove(); td = null; }
      const html = `<button class="svt-tblhide" onclick="event.stopPropagation();wkGroupings._hide('${jsq(vid)}',${hid ? 'false' : 'true'})">${hid ? '表示に戻す' : '非表示'}</button>`;
      if (!td) { td = document.createElement('td'); td.className = 'org-td svt-hidecell'; td.style.cssText = 'width:84px;min-width:84px;text-align:center'; tr.appendChild(td); }
      if (td.innerHTML !== html) td.innerHTML = html;
    });
    if (table && table.style.width && table.style.width !== table.dataset.svtW) { const w = (parseFloat(table.style.width) + 84) + 'px'; table.style.width = w; table.dataset.svtW = w; }
  }
  function watchTable() {
    if (_tblObs) return;
    const tb = document.getElementById('orgList'); const hr = document.getElementById('orgTheadRow'); if (!tb || !hr) return;
    _tblObs = new MutationObserver(() => { _tblObs.takeRecords(); tableExtras(); _tblObs.takeRecords(); });
    _tblObs.observe(tb, { childList: true, subtree: true }); _tblObs.observe(hr, { childList: true });
  }
  let _rot = null;
  function rerenderTable() { if (!isTable()) return; clearTimeout(_rot); _rot = setTimeout(() => window.renderOrg?.(), 0); }

  // ── タグの名前を変えた・まとめたとき（設定の画面 → js/tag-ops.js）、グルーピングの選んだタグも新しい名前にする（v53.063・
  //    オーナー「設定画面で変更したタグ名がグルーピングのほうに反映されてない」）。動画のタグは tag-ops.js が変える。ここは各グルーピングの
  //    picks（列にするタグ）と knownBy/known（保存時に知っていた値）の名前を置き換えるだけ。消さない・空にしない。
  function renamePickIn(e, gk, from, to) {
    let ch = false;
    const picks = (e.picks || []).map(p => ({ ...p }));
    const hadTo = picks.some(p => p.g === gk && p.v === to);
    const out = [];
    picks.forEach(p => { if (p.g === gk && p.v === from) { ch = true; if (!hadTo && !out.some(q => q.g === gk && q.v === to)) out.push({ g: gk, v: to }); } else out.push(p); });
    const ren = arr => Array.isArray(arr) ? [...new Set(arr.map(x => x === from ? (ch = true, to) : x))] : arr;
    const kb = e.knownBy ? Object.fromEntries(Object.entries(e.knownBy).map(([k, a]) => [k, k === gk ? ren(a) : a])) : e.knownBy;
    const known = e.pg === gk ? ren(e.known) : e.known;
    let rp = e.rpicks, rk = e.rKnown;
    if (e.rg === gk) { rp = ren(e.rpicks); rk = ren(e.rKnown); }
    const ro = Array.isArray(e.rOff) && (pgsOf(e).includes(gk) || e.gb === gk) ? ren(e.rOff) : e.rOff;
    return ch ? { ...e, picks: out, knownBy: kb, known, ...(e.rpicks !== undefined ? { rpicks: rp } : {}), ...(e.rKnown !== undefined ? { rKnown: rk } : {}), ...(e.rOff !== undefined ? { rOff: ro } : {}) } : null;
  }
  window._grpRenameTag = (gid, from, to) => {
    const gk = 'tag:' + gid; const out = [];
    Object.values(D.items).forEach(e => { if (!e || e.del || !pgsOf(e).includes(gk) && e.pg !== gk && e.rg !== gk) return;
      const n = renamePickIn(e, gk, from, to); if (!n) return;
      const before = JSON.stringify(e); put(n); out.push({ id: e.id, before, after: JSON.stringify(D.items[e.id]) }); });
    if (out.length && isOpen()) draw();
    return out;
  };
  // 取り消し: その後にまたグルーピングを変えていたら戻さない
  window._grpRestoreTag = list => {
    (list || []).forEach(r => { const cur = D.items[r.id]; if (!cur || JSON.stringify(cur) !== r.after) return;
      const { at, ...b } = JSON.parse(r.before); put(b); });
    if (isOpen()) draw();
  };
  // この版より前に名前を変えた分の読み替え: この端末の「元に戻す」の控え（wk_tagOpsUndo・直近5件）にある名前の変更を、
  // 今はもう無いタグを選んでいるグルーピングにだけ当てる（無いタグ → 新しい名前。新しい名前が今あるときだけ）
  function repairFromHistory() {
    let recs = []; try { recs = JSON.parse(localStorage.getItem('wk_tagOpsUndo') || '[]'); } catch (e) {}
    if (!Array.isArray(recs) || !recs.length) return;
    const rens = recs.map(r => { if (r && r.ren) return r.ren; const m = r && typeof r.title === 'string' && r.title.match(/^「(.+)」を「(.+)」に(?:変更|まとめる)$/);
      return m && Array.isArray(r.gids) && r.gids[0] ? { gid: r.gids[0], from: m[1], to: m[2] } : null; }).filter(Boolean);
    if (!rens.length) return;
    Object.values(D.items).forEach(e => { if (!e || e.del || e.gb !== 'pick') return;
      rens.forEach(r => { const gk = 'tag:' + r.gid; if (!pgsOf(e).includes(gk)) return;
        const cur = D.items[e.id]; const vals = new Set(groupValsAll(gk));
        if (!(cur.picks || []).some(p => p.g === gk && p.v === r.from) || vals.has(r.from) || !vals.has(r.to)) return;
        const n = renamePickIn(cur, gk, r.from, r.to); if (n) put(n); }); });
  }
  let _repaired = false;
  let _dragV = null, _dragFrom = null, _dragRow = null;
  window.wkGroupings = {
    open, close: () => close(false),
    raw: () => ({ items: D.items }),
    // バックアップの復元は足し合わせ（新しい方を採る・今あるグルーピングは消さない）
    importMerge(data) {
      const c = (data && data.items) || {};
      for (const id of Object.keys(c)) {
        if (!okEntry(c[id], id)) continue;
        const l = D.items[id];
        if (!l || Number(c[id].at) > Number(l.at)) { D.items[id] = c[id]; window._grpPush?.(id, c[id]); }
      }
      persist(); if (isOpen()) draw();
    },
    list: () => Object.values(D.items).filter(e => e && !e.del),
    _pick: id => { P.cur[listKey()] = id; savePrefs(); S.editing = null; S.more = {}; S.openCard = null; S.openFrozen = null; draw(); },
    _new: () => { S.edOpenNew = true; S.editing = { id: newId(), name: '新しいグルーピング', gb: null, picks: [], showNone: true, isNew: true, rg: null, rpicks: [], rShowNone: true, rOff: [], cellH: 2 }; draw(); setTimeout(() => document.getElementById('svt-name')?.select(), 0); },
    _edit: () => { const v = VW(); if (v.id === 'all') return; S.edOpenNew = true; S.editing = { id: v.id, name: v.name, gb: v.gb, picks: withNewPicks(v).map(p => ({ ...p })), showNone: v.showNone !== false, pgs: pgsOf(v).slice(), pg: pgsOf(v).slice(-1)[0] || null,
      rg: v.rg || null, rpicks: rowG(v) ? rowVals(v) : (Array.isArray(v.rpicks) ? v.rpicks.slice() : []), rShowNone: v.rShowNone !== false, rOff: Array.isArray(v.rOff) ? v.rOff.slice() : [], cellH: cellHOf(v) }; draw(); },
    _pv: (x, gk) => { const d = S.editing; gk = gk || d.pg; d.picks = d.picks || []; const i = d.picks.findIndex(p => p.g === gk && p.v === x); i < 0 ? d.picks.push({ g: gk, v: x }) : d.picks.splice(i, 1); drawEd(); },
    _pn: on => { S.editing.showNone = on; },
    _pall: (on, gk) => { const d = S.editing; gk = gk || d.pg; if (!d || !gk) return; const mine = (d.picks || []).filter(p => p.g === gk).map(p => p.v);
      if (on) { const add = allVals(gk).filter(x => !mine.includes(x)).map(v => ({ g: gk, v })); d.picks = (d.picks || []).concat(add); }
      else d.picks = (d.picks || []).filter(p => p.g !== gk);
      drawEd(); },
    _csort: (ck, v) => { const id = VW().id; P.colSort = P.colSort || {}; if (v) P.colSort[id + '|' + ck] = v; else delete P.colSort[id + '|' + ck]; savePrefs(); drawBody(); },
    _gd: (e, i, gk, cid) => gripDown(e, i, gk, cid),
    _gup: gk => { const d = S.editing; const gks = pgsOf(d); const i = gks.indexOf(gk); if (i <= 0) return; gks.splice(i, 1); gks.splice(i - 1, 0, gk); d.pgs = gks; d.picks = byGroup(d, d.picks || []); drawEd(); },
    _mvpick: (i, to, gk) => reorderPick(i, to, gk),
    _pnew: (gk, iid) => { const d = S.editing; gk = gk || d.pg; iid = iid || 'svt-pnew'; const inp = document.getElementById(iid); const v = addNewTag(gk, inp && inp.value); if (!v) return;
      d.picks = d.picks || []; if (!d.picks.some(p => p.g === gk && p.v === v)) d.picks.push({ g: gk, v });
      toast(`タグ「${v}」を足しました`); drawEd(); setTimeout(() => document.getElementById(iid)?.focus(), 0); },
    _addCol: () => addColumn(),
    _ng: () => { const d = S.editing; const inp = document.getElementById('svt-ngroup'); const name = String(inp && inp.value || '').trim(); if (!name || !d) return;
      const ex = groupers().find(g => g.kind === 'tag' && g.name === name);
      if (ex) { window.wkGroupings._eg(ex.key); return; }
      const id = window.tagRegistry?.createGroup?.(name);
      if (!id) { toast('タググループを作れませんでした'); return; }
      _gc = null; if (d.gb !== 'pick') { d.picks = []; d.pgs = []; } d.gb = 'pick'; d.pgs = pgsOf(d).concat(['tag:' + id]); d.pg = 'tag:' + id;
      toast(`タググループ「${name}」を作りました（タグの設定の「未使用のタググループ」に入っています）`); drawEd(); setTimeout(() => document.getElementById('svt-pnew')?.focus(), 0); },
    _en: t => { if (S.editing) S.editing.name = t; },
    // タググループは押すたびに入れる／外す（いくつでも）。入れると中のタグが全部 ✓ で後ろに足される
    _eg: k => { const d = S.editing;
      if (k && k.startsWith('tag:')) {
        if (d.gb !== 'pick') { d.picks = []; d.pgs = []; }
        d.gb = 'pick'; const gks = pgsOf(d);
        if (gks.includes(k)) { d.pgs = gks.filter(x => x !== k); d.picks = (d.picks || []).filter(p => p.g !== k); d.pg = d.pgs.slice(-1)[0] || null; if (!d.pgs.length) d.gb = null; }
        else { d.pgs = gks.concat([k]); d.picks = (d.picks || []).filter(p => d.pgs.includes(p.g)).concat(allVals(k).map(v => ({ g: k, v }))); d.pg = k; if (d.rg === k) { d.rg = null; d.rpicks = []; } }
      }
      else { d.gb = k || null; d.pg = null; d.pgs = []; d.picks = []; if (k && d.rg === k) { d.rg = null; d.rpicks = []; } }
      drawEd(); },
    _ec: () => { S.editing = null; draw(); },
    _copy: () => { const d = S.editing; if (!d) return; const sel = document.getElementById('svt-copy-to'); const to = sel && sel.value || listKey();
      const e = copyGrouping(d.id, to); if (!e) return;
      if (to === listKey()) { P.cur[to] = e.id; savePrefs(); S.editing = null; draw(); toast(`「${e.name}」を作りました`); }
      else { const l = (listOpts().find(([id]) => id === to) || [, to])[1]; toast(`「${l}」に「${e.name}」を作りました`); } },
    _es: () => { const d = S.editing; if (!d) return;
      const name = (d.name || '').trim() || 'グルーピング';
      const prev = D.items[d.id];
      const gks = d.gb === 'pick' ? pgsOf(d) : [];
      const e = { id: d.id, list: prev && !prev.del ? prev.list : listKey(), name, gb: gks.length ? 'pick' : (d.gb === 'pick' ? null : d.gb || null),
        pg: gks[0] || null, pgs: gks,   // pg は前の版のアプリが読む（1つ目のグループ）
        picks: byGroup({ pgs: gks }, (d.picks || []).filter(p => gks.includes(p.g))).map(p => ({ g: p.g, v: p.v })),
        known: gks[0] ? groupValsAll(gks[0]) : [],   // 前の版の形（1つ目のグループ）
        knownBy: Object.fromEntries(gks.map(k => [k, groupValsAll(k)])),   // この時点の各グループの全部の値（後から増えたタグを見分ける）
        showNone: d.showNone !== false, created: prev && prev.created || Date.now() };
      // 行（v53.067）。列と同じもの・無くなったものは保存しない
      { const rg = d.rg && GR0(d.rg) && rowG({ ...e, rg: d.rg }) ? d.rg : null;
        if (rg) { e.rg = rg; e.rpicks = (d.rpicks || []).map(String); e.rShowNone = d.rShowNone !== false; e.rOff = (d.rOff || []).slice();
          if (GR0(rg).kind === 'tag') e.rKnown = groupValsAll(rg); }
        e.cellH = CELLH.includes(Number(d.cellH)) ? Number(d.cellH) : 2; }
      if (prev && !prev.del && Array.isArray(prev.hidden) && prev.hidden.length) e.hidden = prev.hidden.slice();   // 編集しても非表示は消さない
      put(e);
      P.cur[e.list] = e.id; savePrefs();
      S.editing = null; S.more = {}; draw(); },
    _del: () => { const d = S.editing; if (!d) return; const prev = D.items[d.id]; if (!prev || prev.del) return;
      const keep = JSON.parse(JSON.stringify(prev));
      put({ id: prev.id, list: prev.list, del: true });
      S.editing = null; draw();
      toast(`グルーピング「${keep.name}」を消しました（動画のタグはそのままです）`, () => { const { at, ...rest } = keep; put(rest); draw(); }); },
    _cl: k => { S.closed[k] = !S.closed[k]; drawBody(); },
    _mr: k => { S.more[k] = (S.more[k] || LIMIT) + LIMIT; drawBody(); },
    _oc: k => { const i = k.indexOf('|'); const vid = k.slice(0, i), col = k.slice(i + 1);
      if (S.openCard === vid && S._openColNow === col) { S.openCard = null; S.openFrozen = null; S.openFrozenCells = null; }
      else if (S._grid && /^\d+\.(\d+|\*)$/.test(col)) { S.openCard = vid; S.openCell = col; S.openFrozen = null; S.openFrozenCells = {};
        Object.entries(S._grid.cells).forEach(([k, a]) => { const j = a.indexOf(vid); if (j >= 0) S.openFrozenCells[k] = j; }); }
      else { S.openCard = vid; S.openCol = col; S.openFrozenCells = null; S.openFrozen = {}; (S._lastCols || []).forEach(c => { const j = c.ids.indexOf(vid); if (j >= 0) S.openFrozen[c.key] = j; }); }
      drawBody(); },
    _tg: (vid, gk, val) => toggle(vid, gk, val),
    _play: vid => { try { window.openVPanel?.(vid); } catch (e) {} },
    _fold: (kind, ci, ri) => { const V = VW(); if (!V || V.id === 'all') return;
      const keys = S._grid ? S._grid.cols : (S._colKeys || []); const rows = S._grid ? S._grid.rows : [];
      const F = foldOf(V.id); const key = kind === 'c' ? keys[ci] : kind === 'r' ? rows[ci] : cellKey(keys[ci], rows[ri]); if (key == null) return;
      const a = F[kind]; const i = a.indexOf(key); i < 0 ? a.push(key) : a.splice(i, 1);
      P.fold = P.fold || {}; P.fold[V.id] = F; savePrefs(); drawBody(); },
    // 列の板と上の横バーは互いに位置を写す。写したことで起きた scroll は無視する（v53.077・オーナー「スマホで横スクロールできない」。
    // スマホは位置が小数（70.5px 等）で、写した先の値が少しずれる→「動いた」と見て指で動かしている板へ書き戻し→指のスクロールが止められて元に戻っていた）
    _hb: el => { if (echo(el)) return; const bd = document.querySelector('#svt-root .svt-board'); if (bd && Math.abs(bd.scrollLeft - el.scrollLeft) >= 1) setSL(bd, el.scrollLeft); },
    // 板→バーはいつも写す（スナップで止まった位置にもついていく）。危ないのはバー→板だけなので、バーの側でだけ写された分を無視する
    _bs: el => { const h = document.getElementById('svt-colhs'); if (h) h.scrollLeft = el.scrollLeft; const t = document.getElementById('svt-hbar'); if (t && Math.abs(t.scrollLeft - el.scrollLeft) >= 1) setSL(t, el.scrollLeft); },
    _ds: (e, vid, from) => { _dragV = vid; _dragFrom = from;
      { const c = e.target && e.target.closest && e.target.closest('.svt-cell'); const ri = c && c.dataset.ri; _dragRow = S._grid && ri != null && ri !== '*' ? S._grid.rows[+ri] : null; } try { e.dataTransfer.setData('text/plain', vid); e.dataTransfer.effectAllowed = 'copyMove'; } catch (x) {} },
    _dov: (e, el) => { e.preventDefault(); const cp = !!e.altKey; el.classList.add('over'); el.classList.toggle('copy', cp); try { e.dataTransfer.dropEffect = cp ? 'copy' : 'move'; } catch (x) {} },
    _dp: (e, gk, to) => { e.preventDefault(); e.currentTarget.classList.remove('over', 'copy'); if (_dragV == null) return; const v = _dragV, f = _dragFrom; _dragV = null;
      if (f === to) return;
      if (to === HID) { setHidden(v, true); return; }                       // 非表示の列へ落とす＝隠す（タグは変えない）
      if (f === HID) { setHidden(v, false); if (to !== NONE && movable(GR(gk))) move(v, gk, NONE, to, true); return; }   // 非表示から出す＝戻す（先の列のタグを足すだけ。何も外さない）
      move(v, gk, f, to, !!e.altKey); },
    _hide: (vid, on) => setHidden(vid, !!on),
    _pc: () => closePop(),
    _pm: a => { if (document.getElementById('svt-pop')) return closePop(); const cur = VW();
      popMenu(a, viewsOf(listKey()).map(v => pi(`<span class="svt-pic">${v.gb ? '⊞' : '▦'}</span>${esc(v.name)}`, `wkGroupings._pick('${jsq(v.id)}')`, v.id === cur.id)).join('') +
        '<div class="svt-psep"></div>' + pi('＋ 新しいグルーピング', 'wkGroupings._new()', false, 'sub')); },
    _cm: (a, ci) => { if (document.getElementById('svt-pop')) return closePop(); const c = (S._hdCols || [])[ci]; if (!c) return;
      let h = '<div class="svt-ph2">並べ替え</div>' + CSORT.map(([v, l]) => pi(esc(v ? l : 'ライブラリと同じ'), `wkGroupings._csort('${jsq(c.key)}','${v}')`, (c.sort || '') === v)).join('');
      if (S._grid && !c.hid) { const off = (D.items[VW().id]?.rOff || []).includes(c.key); h += '<div class="svt-psep"></div>' + pi('この列は行で分けない', `wkGroupings._roff(${ci})`, off); }
      popMenu(a, h); },
    _cmo: (a, k, vid, mv, hid, lbl) => { if (document.getElementById('svt-pop')) return closePop();
      popMenu(a, (mv ? pi(esc(lbl), `wkGroupings._oc('${jsq(k)}')`) : '') + pi(hid ? '表示に戻す' : 'このグルーピングで非表示', `wkGroupings._hide('${jsq(vid)}',${hid ? 'false' : 'true'})`)); },
    _dp2: (e, ci, ri) => { e.preventDefault(); e.currentTarget.classList.remove('over', 'copy'); if (_dragV == null || !S._grid) return; const v = _dragV, f = _dragFrom, fr = _dragRow; _dragV = null;
      const tc = S._grid.cols[ci]; const tr = ri === '*' ? null : S._grid.rows[+ri]; if (tc == null) return;
      if (f === tc && (tr == null || fr == null || tr === fr)) return;
      moveCell(v, f, fr, tc, tr, !!e.altKey); },
    // 列の見出しの「行 ⇕」: この列だけ行で分けない／分ける（グルーピングの rOff に列の名前を足す・外す。動画には触らない）
    _roff: ci => { const V = VW(); const cur = D.items[V.id]; if (!cur || cur.del || !S._grid) return; const ck = S._grid.cols[ci]; if (ck == null || ck === HID) return;
      const nmk = ck === NONE ? NONE : ck; const a = Array.isArray(cur.rOff) ? cur.rOff.slice() : []; const i = a.indexOf(nmk); i < 0 ? a.push(nmk) : a.splice(i, 1);
      put({ ...cur, rOff: a }); draw(); },
    _erg: k => { const d = S.editing; if (!d) return; d.rg = k || null; d.rOff = []; d.rShowNone = true;
      const G = k ? GR0(k) : null; d.rpicks = !G ? [] : G.kind === 'src' ? allVals(k).map(x => [x, source().filter(v => readG(v, G).includes(x)).length]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]) : allVals(k);
      drawEd(); },
    // 行のタググループを新しく作る（列の「＋ 新しいタググループ」と同じ。tagRegistry.createGroup＝未使用のタググループに入る）
    _rng: () => { const d = S.editing; const inp = document.getElementById('svt-rngroup'); const name = String(inp && inp.value || '').trim(); if (!name || !d) return;
      const ex = groupers().find(g => g.kind === 'tag' && g.name === name);
      if (ex) { if (ex.key === d.gb || pgsOf(d).includes(ex.key)) { toast('そのタググループは列で使っています'); return; } window.wkGroupings._erg(ex.key); return; }
      const id = window.tagRegistry?.createGroup?.(name); if (!id) { toast('タググループを作れませんでした'); return; }
      _gc = null; d.rg = 'tag:' + id; d.rpicks = []; d.rOff = []; d.rShowNone = true;
      toast(`タググループ「${name}」を作りました（タグの設定の「未使用のタググループ」に入っています）`); drawEd(); setTimeout(() => document.getElementById('svt-rnew')?.focus(), 0); },
    // 行のタググループに新しいタグを足す（選択肢に足すだけ・動画には触らない）
    _rnew: () => { const d = S.editing; if (!d || !d.rg) return; const inp = document.getElementById('svt-rnew'); const v = addNewTag(d.rg, inp && inp.value); if (!v) return;
      d.rpicks = d.rpicks || []; if (!d.rpicks.includes(v)) d.rpicks.push(v);
      toast(`タグ「${v}」を足しました`); drawEd(); setTimeout(() => document.getElementById('svt-rnew')?.focus(), 0); },
    _rv: x => { const d = S.editing; if (!d) return; d.rpicks = d.rpicks || []; const i = d.rpicks.indexOf(x); i < 0 ? d.rpicks.push(x) : d.rpicks.splice(i, 1); drawEd(); },
    _rall: on => { const d = S.editing; if (!d || !d.rg) return; d.rpicks = on ? allVals(d.rg) : []; drawEd(); },
    _rsn: on => { if (S.editing) { S.editing.rShowNone = on; drawEd(); } },
    _rofe: x => { const d = S.editing; if (!d) return; d.rOff = d.rOff || []; const i = d.rOff.indexOf(x); i < 0 ? d.rOff.push(x) : d.rOff.splice(i, 1); drawEd(); },
    _ch: h => { if (S.editing) { S.editing.cellH = h; drawEd(); } },
    _tx: () => { const t = S.toast; if (t && t.extra) { const f = t.extra; t.extra = null; f.fn(); draw(); } },
    _undo: () => { const f = S.undo.pop(); S.toast = null; if (f) f(); draw(); },
    _tu: () => { const t = S.toast; if (!t || !t.undo) return; const i = S.undo.lastIndexOf(t.undo); if (i >= 0) S.undo.splice(i, 1); S.toast = null; t.undo(); draw(); },
    _move: move, _toggle: toggle, _state: () => ({ ...S, D, P }), _groupers: groupers,
  };

  // いつも出しておく（v53.049・オーナー「グルーピングのボタンはいらない。最初から出しときゃいい」）。
  // ライブラリの準備ができたら、カード一覧の上にグルーピングの並び（すべて・作ったもの・＋ グルーピング）を出す。描き直しで外れたら付け直す
  const tryOpen = () => {
    if (isOpen()) return;
    if (!document.getElementById('cardList') || !(window.videos || []).length || typeof window.filt !== 'function') return;
    open();
  };
  setInterval(tryOpen, 1000);
  // カード一覧が描かれたら、その場で付ける（v53.056）。1秒ごとの見回りだけだと、起動直後（前回のリストを開いた直後）の
  // 約1秒はグルーピングが付いておらず、グルーピングのあるリストでもふだんのカード一覧が見えていた
  { const cl0 = document.getElementById('cardList');
    if (cl0) new MutationObserver(tryOpen).observe(cl0, { childList: true }); }
})();
