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
    (e.del === true || (typeof e.list === 'string' && typeof e.name === 'string' && (e.picks == null || Array.isArray(e.picks))));
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
  function pickGrouper(view) {
    const picks = (view && view.picks || []).filter(p => p && GR0(p.g));
    const dup = new Map(); picks.forEach(p => dup.set(p.v, (dup.get(p.v) || 0) + 1));
    const items = picks.map(p => ({ ...p, label: dup.get(p.v) > 1 ? `${p.v}（${GR0(p.g).name}）` : p.v }));
    return { key: 'pick', kind: 'pick', name: '選んだタグ', items, opts: items.map(x => x.label), showNone: !view || view.showNone !== false };
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
  function noneName(items) {
    const gs = [...new Set(items.map(p => p.g))];
    if (gs.length === 1) { const all = allVals(gs[0]); if (all.length && all.every(x => items.some(p => p.v === x))) return GR0(gs[0]).name + 'なし'; }
    return 'その他';
  }
  function source() {
    if (isOpen() && isTable() && Array.isArray(window.filteredVideos)) return window.filteredVideos;
    const all = Array.isArray(window.videos) ? window.videos : [];
    try { return typeof window.filt === 'function' ? window.filt(all) : all.filter(v => !v.archived); }
    catch (e) { return all.filter(v => !v.archived); }
  }
  function columns(list, g) {
    if (g.kind === 'pick') {
      const cols = g.items.map(p => ({ key: p.label, name: p.label, ids: list.filter(v => vals(v, g).includes(p.label)).map(v => v.id) }));
      if (g.showNone) cols.unshift({ key: '\u0000none', name: noneName(g.items), ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
      return cols;
    }
    const seen = new Set(); const keys = [];
    (g.opts || []).forEach(o => { if (!seen.has(o)) { seen.add(o); keys.push(o); } });
    list.forEach(v => vals(v, g).forEach(x => { if (!seen.has(x)) { seen.add(x); keys.push(x); } }));
    const cols = keys.map(k => ({ key: k, name: k, ids: list.filter(v => vals(v, g).includes(k)).map(v => v.id) }));
    const shown = g.kind === 'src' ? cols.sort((a, b) => b.ids.length - a.ids.length) : cols.filter(c => c.ids.length || (g.opts || []).includes(c.key));
    if (g.kind !== 'src') shown.unshift({ key: '\u0000none', name: g.name + 'なし', ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
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
      const off = from === '\u0000none' ? null : from, on = to === '\u0000none' ? null : to;
      if (copy && !on) return;
      pickChange(vid, GR('pick'), copy ? null : off, on, copy); return; }
    const g = GR(gkey); const v = videoOf(vid); if (!g || !v || !movable(g)) return;
    const before = readG(v, g); let after;
    if (g.kind === 'tag') { after = copy ? before.slice() : before.filter(x => x !== from); if (to !== '\u0000none' && !after.includes(to)) after.push(to); }
    else after = to === '\u0000none' ? [] : [to];
    const undo = change(vid, [[g, after]]); if (!undo) return;
    toast(to === '\u0000none' ? `「${from}」から外しました` : copy ? `「${to}」にも追加しました` : `「${to}」へ移動しました`, undo);
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
    if (V.gb !== 'pick' || !V.pg) return;
    const v = addNewTag(V.pg, name); if (!v) return;
    const picks = (V.picks || []).map(p => ({ ...p }));
    if (!picks.some(p => p.g === V.pg && p.v === v)) picks.push({ g: V.pg, v });
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
  function card(v, g, colKey) {
    const mv = movable(g); const th = thumbOf(v); const x = vals(v, g);
    const k = v.id + '|' + colKey; const open = S.openCard === k;
    return `<div class="svt-card" ${mv ? `draggable="true" ondragstart="wkGroupings._ds(event,'${jsq(v.id)}','${jsq(colKey)}')"` : ''}>
      <div class="svt-th" onclick="wkGroupings._play('${jsq(v.id)}')">${th ? `<img src="${esc(th)}" loading="lazy" alt="">` : ''}${v.duration ? `<span>${esc(fmtDur(v.duration))}</span>` : ''}</div>
      <div class="svt-tt">${esc(v.title || '')}</div>
      <div class="svt-mt"><span>${esc(v.channel || '')}</span>${mv ? `<button class="svt-sm" onclick="wkGroupings._oc('${jsq(k)}')">${esc(g.name)} ▾</button>` : ''}</div>
      ${mv && open ? `<div class="svt-mt">${g.opts.map(o => `<button class="svt-o${x.includes(o) ? ' on' : ''}" onclick="wkGroupings._tg('${jsq(v.id)}','${jsq(g.key)}','${jsq(o)}')">${esc(o)}</button>`).join('')}</div>` : ''}
      ${(g.kind === 'tag' || g.kind === 'pick') && x.length > 1 ? `<div class="svt-mt svt-also">ほかの列にも: ${esc(x.filter(y => y !== colKey).join('・'))}</div>` : ''}
    </div>`;
  }
  function drawBody() {
    const el = document.getElementById('svt-body'); if (!el) return;
    const V = VW(); const g = V.gb ? GR(V.gb) : null;
    if (!g) { el.innerHTML = ''; return; }
    const list = source();
    if (!list.length) { el.innerHTML = '<div class="svt-note">今のフィルターに当たる動画はありません。サイドバーやフィルターで条件を変えてください。</div>'; return; }
    const mv = movable(g);
    const byId = new Map(list.map(v => [v.id, v]));
    el.innerHTML = `<div class="svt-board">` + columns(list, g).map(c => {
      const n = S.more[c.key] || LIMIT;
      return `<div class="svt-col" ${mv ? `ondragover="wkGroupings._dov(event,this)" ondragleave="this.classList.remove('over','copy')" ondrop="wkGroupings._dp(event,'${jsq(g.key)}','${jsq(c.key)}')"` : ''}>
        <div class="svt-colh"><span class="svt-tag${c.none ? ' none' : ''}">${esc(c.name)}</span><span class="n">${c.ids.length}</span></div>
        <div class="svt-cards">${c.ids.slice(0, n).map(id => card(byId.get(id), g, c.key)).join('')}</div>
        ${c.ids.length > n ? `<button class="svt-sm" style="width:100%;margin-top:6px" onclick="wkGroupings._mr('${jsq(c.key)}')">さらに ${c.ids.length - n} 本</button>` : ''}
      </div>`; }).join('') + addColBox(g) + `</div>` +
      `<div class="svt-note">${mv ? 'カードを別の列へドラッグすると移動、<b>Option（Windows は Alt）を押しながら</b>ドラッグすると両方に入ります。スマホはカードの「' + esc(g.name) + ' ▾」で付け外し。動かすと動画のタグが変わります（直後のお知らせの「元に戻す」・上の「1つ戻す」・⌘Z / Ctrl+Z で戻せます）。' : 'チャンネル・プレイリストは動画を取り込んだ元なので、列のあいだを動かせません。'}</div>`;
  }
  function addColBox(g) {
    if (!g || g.kind !== 'pick') return '';
    return `<div class="svt-col svt-addcol"><div class="svt-colh"><span class="svt-tag none">＋ 新しいタグ</span></div>
      <div class="svt-addbox"><input id="svt-newcol" type="text" placeholder="タグの名前" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._addCol()"><button class="svt-sm pri" onclick="wkGroupings._addCol()">列を足す</button>
      <div class="svt-grp">タグの選択肢に足して、列にします。カードをドラッグすると、そのタグが付きます。</div></div></div>`;
  }
  function pickEd(d) {
    const G = GR0(d.pg); if (!G) return '';
    const all = allVals(d.pg);
    const sel = (d.picks || []).filter(p => p.g === d.pg).map(p => p.v);
    const rest = all.filter(x => !sel.includes(x));
    const src = source(); const cnt = x => src.filter(v => readG(v, G).includes(x)).length;
    return `<div class="setbox svt-pick">
      <div class="svt-ph"><span class="svt-grp" style="margin:0">「${esc(G.name)}」のタグ　<b>✓ が列になります</b>（⠿ をドラッグで列の順を入れ替え・押すと付け外し・数はいまのフィルターでの本数）</span>
        <span class="svt-phb"><button class="svt-sm" onclick="wkGroupings._pall(true)">全部選ぶ</button><button class="svt-sm" onclick="wkGroupings._pall(false)">全部外す</button></span></div>
      <div class="svt-opts" id="svt-chips">${sel.map((x, i) => `<span class="svt-o on svt-chip" data-i="${i}"><span class="svt-grip" title="ドラッグで順番を入れ替え" onpointerdown="wkGroupings._gd(event,${i})">⠿</span><button class="svt-cb" onclick="wkGroupings._pv('${jsq(x)}')">✓ ${esc(x)}<small> ${cnt(x)}</small></button></span>`).join('')}${rest.map(x => `<button class="svt-o svt-off" onclick="wkGroupings._pv('${jsq(x)}')">${esc(x)}<small> ${cnt(x)}</small></button>`).join('') || (sel.length ? '' : '<span class="svt-grp">このタググループにはまだタグがありません。下で足してください。</span>')}</div>
      <div class="svt-opts"><input id="svt-pnew" type="text" placeholder="＋ 新しいタグ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._pnew()"><button class="svt-sm" onclick="wkGroupings._pnew()">足す</button></div>
      <label class="svt-grp" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${d.showNone !== false ? 'checked' : ''} onchange="wkGroupings._pn(this.checked)"> 選んだタグがどれも付いていない動画も列（「${esc(noneName(pickGrouper(d).items))}」）に出す</label>
    </div>`;
  }
  let _gdS = null;
  function gripDown(e, i) {
    e.preventDefault();
    const chips = [...document.querySelectorAll('#svt-chips .svt-chip')]; const me = chips[i]; if (!me) return;
    _gdS = { i, to: i, x: e.clientX, y: e.clientY, moved: false };
    const mv = ev => {
      if (!_gdS) return;
      if (!_gdS.moved && Math.hypot(ev.clientX - _gdS.x, ev.clientY - _gdS.y) < 4) return;
      _gdS.moved = true; me.classList.add('dragging');
      const hit = document.elementFromPoint(ev.clientX, ev.clientY); const c = hit && hit.closest && hit.closest('#svt-chips .svt-chip');
      document.querySelectorAll('#svt-chips .svt-chip').forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (c && c !== me) { const j = +c.dataset.i; const r = c.getBoundingClientRect(); const after = ev.clientX > r.left + r.width / 2;
        c.classList.add(after ? 'drop-after' : 'drop-before'); _gdS.to = after ? j + 1 : j; }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      const st = _gdS; _gdS = null; if (!st || !st.moved) { drawEd(); return; }
      reorderPick(st.i, st.to);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  function reorderPick(i, to) {
    const d = S.editing; if (!d) return;
    const mine = d.picks.filter(p => p.g === d.pg); const others = d.picks.filter(p => p.g !== d.pg);
    if (i < 0 || i >= mine.length) return;
    const [x] = mine.splice(i, 1); if (to > i) to--; mine.splice(Math.max(0, Math.min(to, mine.length)), 0, x);
    d.picks = [...others, ...mine]; drawEd();
  }
  function drawEd() {
    const el = document.getElementById('svt-ed'); if (!el) return;
    const d = S.editing; if (!d) { el.innerHTML = ''; return; }
    const gs = groupers();
    const gb = g => `<button class="svt-o${d.gb === g.key ? ' on' : ''}" onclick="wkGroupings._eg('${jsq(g.key)}')">${esc(g.name)}${g.sub ? `<small> ${esc(g.sub)}</small>` : ''}</button>`;
    const exists = !!D.items[d.id] && !D.items[d.id].del;
    el.innerHTML = `<div class="svt-ed">
      <div class="r"><div class="k">名前</div><input id="svt-name" type="text" value="${esc(d.name)}" oninput="wkGroupings._en(this.value)"></div>
      <div class="r"><div class="k">分ける基準</div><div class="svt-opts">
        <button class="svt-o${!d.gb ? ' on' : ''}" onclick="wkGroupings._eg('')">分けない</button>
        <div class="svt-grp">タグ（グループを押すと、その下に中のタグが開きます）</div>${gs.filter(g => g.kind === 'tag').map(g => `<button class="svt-o${d.gb === 'pick' && d.pg === g.key ? ' on' : ''}" onclick="wkGroupings._eg('${jsq(g.key)}')">${esc(g.name)}<small> ${esc(g.sub)}</small></button>`).join('')}
        <input id="svt-ngroup" type="text" placeholder="＋ 新しいタググループ" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkGroupings._ng()"><button class="svt-sm" onclick="wkGroupings._ng()">作る</button>
        <div class="svt-grp">チャンネル・プレイリスト</div>${gs.filter(g => g.kind === 'src').map(gb).join('')}
        ${gs.some(g => g.kind === 'one') ? `<div class="svt-grp">カスタム列（セレクト・評価）</div>${gs.filter(g => g.kind === 'one').map(gb).join('')}` : ''}
      </div></div>
      ${d.gb === 'pick' && d.pg ? pickEd(d) : ''}
      <div class="svt-grp">絞り込みは、ふだんのフィルター（サイドパネル・フィルターの窓・検索語）をそのまま使います。グルーピングはこのリストに保存され、ほかの端末にも出ます。</div>
      <div class="foot">${exists ? '<button class="svt-sm danger" onclick="wkGroupings._del()">このグルーピングを消す</button>' : ''}<span style="flex:1"></span><button class="svt-sm" onclick="wkGroupings._ec()">やめる</button><button class="svt-sm pri" onclick="wkGroupings._es()">保存</button></div>
    </div>`;
  }
  function drawTabs() {
    const el = document.getElementById('svt-tabs'); if (!el) return;
    const vs = viewsOf(listKey()); const cur = VW();
    el.innerHTML = vs.map(v => `<button class="svt-vt${v.id === cur.id ? ' on' : ''}" onclick="wkGroupings._pick('${jsq(v.id)}')">${v.gb ? '⊞ ' : '▦ '}${esc(v.name)}</button>`).join('') +
      `<button class="svt-vt add" onclick="wkGroupings._new()">＋ グルーピング</button>`;
    const g = cur.gb ? GR(cur.gb) : null;
    const sum = document.getElementById('svt-sum');
    if (sum) sum.innerHTML = (g ? `<span>分ける基準 <b>${esc(g.kind === 'pick' ? (GR0(cur.pg) ? GR0(cur.pg).name + ': ' : '') + (g.opts.join('・') || 'まだ選んでいない') : g.name + (g.sub === '未使用' ? '（未使用のタグ）' : ''))}</b></span>` : '') +
      (cur.id !== 'all' ? `<button class="svt-sm" onclick="wkGroupings._edit()">✎ グルーピングを編集</button>` : '') +
      (S.undo.length ? `<button class="svt-sm" onclick="wkGroupings._undo()" title="⌘Z / Ctrl+Z">↶ 1つ戻す</button>` : '');
  }
  function draw() {
    _gc = null; place();
    const host = document.getElementById('lib-card-host');
    // 「すべて」（分けない）のときは、ふだんのカード一覧をそのまま出す
    if (host) host.classList.toggle('svt-on', !!VW().gb && !isTable());
    drawTabs(); drawEd(); if (isTable()) rerenderTable(); else drawBody(); drawToast();
  }

  function css() {
    if (document.getElementById('svt-style')) return;
    const st = document.createElement('style'); st.id = 'svt-style';
    st.textContent = `
#lib-card-host.svt-on #cardList{display:none!important}
#svt-root{color:var(--text);font-size:13px}
#svt-root.svt-tbl #svt-body{display:none}
#svt-root .svt-head{padding:8px 16px 6px;border-bottom:1px solid var(--border);display:grid;gap:6px}
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
#svt-root .svt-main:has(#svt-ed:empty):has(#svt-body:empty){display:none}
#svt-root .svt-ed{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;display:grid;gap:12px;margin-bottom:10px}
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
#svt-root .svt-addbox{display:grid;gap:6px;padding:0 2px 4px}
#svt-root .svt-addbox input,#svt-root #svt-pnew,#svt-root #svt-ngroup{font-size:12.5px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;min-width:0}
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
#svt-root .svt-col.over:not(.copy) .svt-colh::after{content:'${'ここへ移動（Option で両方に）'}';font-size:10.5px;color:var(--text3);margin-left:auto}
#svt-root .svt-col.copy .svt-colh::after{content:'＋ ここにも追加';font-size:10.5px;color:var(--gold);margin-left:auto}
#svt-root .svt-colh{display:flex;gap:6px;align-items:center;padding:2px 2px 8px}
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
#svt-root .svt-note{font-size:11.5px;color:var(--text3);padding:8px 2px 16px;line-height:1.6}
#svt-toast .svt-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));background:var(--accent);color:var(--on-accent);font-size:12px;padding:8px 14px;border-radius:8px;display:flex;gap:10px;align-items:center;width:max-content;max-width:calc(100% - 32px);z-index:9001}
#svt-toast .svt-tsep{width:1px;align-self:stretch;background:currentColor;opacity:.3;margin:0 2px}
#svt-toast .svt-toast button{border:none;background:none;color:inherit;font-size:12px;white-space:nowrap;cursor:pointer;font-family:inherit}
#svt-toast .svt-tu{opacity:.85}
#svt-toast .svt-tx{border:1px solid currentColor!important;border-radius:6px;padding:3px 9px;font-weight:700}
@media (max-width:560px){#svt-root .svt-col{flex-basis:min(82%,calc(var(--svt-cw,250px) + 12px))}#svt-root .svt-ed .r{grid-template-columns:minmax(0,1fr)}}
`;
    document.head.appendChild(st);
  }

  function libCardW() {
    const el = document.querySelector('#lib-card-host .card-wrap');
    const w = el && el.offsetWidth;
    if (w && w >= 160) return w;
    const host = document.getElementById('lib-card-host'); const hw = (host && host.offsetWidth) || window.innerWidth;
    if (window.innerWidth >= 1200) return Math.max(180, Math.floor((hw - 40 - 24) / 4));
    if (window.innerWidth >= 768) return Math.max(180, Math.floor((hw - 32 - 16) / 3));
    return 0;
  }
  let _obs = null, _redrawT = null;
  const isOpen = () => !!document.getElementById('svt-root');
  const isTable = () => { const oh = document.getElementById('lib-org-host'); return !!oh && getComputedStyle(oh).display !== 'none'; };
  function open() {
    if (isOpen()) return;
    css();
    const host = document.getElementById('lib-card-host'); const list = document.getElementById('cardList');
    if (!host || !list) return;
    const cw = libCardW();
    const root = document.createElement('div'); root.id = 'svt-root';
    if (cw) root.style.setProperty('--svt-cw', cw + 'px');
    root.innerHTML = `<div class="svt-head">
        <div class="svt-top"><div class="svt-tabs" id="svt-tabs"></div></div>
        <div class="svt-sum" id="svt-sum"></div>
      </div>
      <div class="svt-main"><div id="svt-ed"></div><div id="svt-body"></div></div><div id="svt-toast"></div>`;
    host.insertBefore(root, list);
    _obs = new MutationObserver(() => { clearTimeout(_redrawT); _redrawT = setTimeout(() => { if (isOpen()) draw(); }, 60); });
    _obs.observe(list, { childList: true });
    const rc = document.getElementById('rc'); if (rc) _obs.observe(rc, { childList: true, characterData: true, subtree: true });
    const oh = document.getElementById('lib-org-host'); if (oh) _obs.observe(oh, { attributes: true, attributeFilter: ['style', 'class'] });
    window._orgRowGrouper = orgGrouper; window._orgGroupToggle = orgGroupToggle;
    draw();
  }
  function close(keepPref) {
    const wasTable = isTable();
    window._orgRowGrouper = null; window._orgGroupToggle = null;
    document.getElementById('svt-root')?.remove();
    if (wasTable) window.renderOrg?.();
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
    return columns(list, g).map(c => ({ key: c.key, name: c.name, ids: c.ids, open: !S.closed[V.id + '|' + c.key] }));
  }
  function orgGroupToggle(k) { const ck = VW().id + '|' + k; S.closed[ck] = !S.closed[ck]; window.renderOrg?.(); }
  let _rot = null;
  function rerenderTable() { if (!isTable()) return; clearTimeout(_rot); _rot = setTimeout(() => window.renderOrg?.(), 0); }

  let _dragV = null, _dragFrom = null;
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
    _pick: id => { P.cur[listKey()] = id; savePrefs(); S.editing = null; S.more = {}; draw(); },
    _new: () => { S.editing = { id: newId(), name: '新しいグルーピング', gb: null, picks: [], showNone: true, isNew: true }; draw(); setTimeout(() => document.getElementById('svt-name')?.select(), 0); },
    _edit: () => { const v = VW(); if (v.id === 'all') return; S.editing = { id: v.id, name: v.name, gb: v.gb, picks: (v.picks || []).map(p => ({ ...p })), showNone: v.showNone !== false, pg: v.pg }; draw(); },
    _pv: x => { const d = S.editing; d.picks = d.picks || []; const i = d.picks.findIndex(p => p.g === d.pg && p.v === x); i < 0 ? d.picks.push({ g: d.pg, v: x }) : d.picks.splice(i, 1); drawEd(); },
    _pn: on => { S.editing.showNone = on; },
    _pall: on => { const d = S.editing; if (!d || !d.pg) return; const mine = (d.picks || []).filter(p => p.g === d.pg).map(p => p.v);
      d.picks = (d.picks || []).filter(p => p.g !== d.pg);
      if (on) d.picks.push(...[...mine, ...allVals(d.pg).filter(x => !mine.includes(x))].map(v => ({ g: d.pg, v })));
      drawEd(); },
    _gd: (e, i) => gripDown(e, i),
    _mvpick: (i, to) => reorderPick(i, to),
    _pnew: () => { const d = S.editing; const inp = document.getElementById('svt-pnew'); const v = addNewTag(d.pg, inp && inp.value); if (!v) return;
      d.picks = d.picks || []; if (!d.picks.some(p => p.g === d.pg && p.v === v)) d.picks.push({ g: d.pg, v });
      toast(`タグ「${v}」を足しました`); drawEd(); setTimeout(() => document.getElementById('svt-pnew')?.focus(), 0); },
    _addCol: () => addColumn(),
    _ng: () => { const d = S.editing; const inp = document.getElementById('svt-ngroup'); const name = String(inp && inp.value || '').trim(); if (!name || !d) return;
      const ex = groupers().find(g => g.kind === 'tag' && g.name === name);
      if (ex) { window.wkGroupings._eg(ex.key); return; }
      const id = window.tagRegistry?.createGroup?.(name);
      if (!id) { toast('タググループを作れませんでした'); return; }
      _gc = null; d.gb = 'pick'; d.pg = 'tag:' + id; d.picks = [];
      toast(`タググループ「${name}」を作りました（タグの設定の「未使用のタググループ」に入っています）`); drawEd(); setTimeout(() => document.getElementById('svt-pnew')?.focus(), 0); },
    _en: t => { if (S.editing) S.editing.name = t; },
    _eg: k => { const d = S.editing;
      if (k && k.startsWith('tag:')) { d.gb = 'pick'; d.pg = k; d.picks = allVals(k).map(v => ({ g: k, v })); }
      else { d.gb = k || null; d.pg = null; d.picks = []; }
      drawEd(); },
    _ec: () => { S.editing = null; draw(); },
    _es: () => { const d = S.editing; if (!d) return;
      const name = (d.name || '').trim() || 'グルーピング';
      const prev = D.items[d.id];
      const e = { id: d.id, list: prev && !prev.del ? prev.list : listKey(), name, gb: d.gb || null, pg: d.gb === 'pick' ? d.pg : null,
        picks: d.gb === 'pick' ? (d.picks || []).filter(p => p.g === d.pg).map(p => ({ g: p.g, v: p.v })) : [],
        showNone: d.showNone !== false, created: prev && prev.created || Date.now() };
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
    _oc: k => { S.openCard = S.openCard === k ? null : k; drawBody(); },
    _tg: (vid, gk, val) => toggle(vid, gk, val),
    _play: vid => { try { window.openVPanel?.(vid); } catch (e) {} },
    _ds: (e, vid, from) => { _dragV = vid; _dragFrom = from; try { e.dataTransfer.setData('text/plain', vid); e.dataTransfer.effectAllowed = 'copyMove'; } catch (x) {} },
    _dov: (e, el) => { e.preventDefault(); const cp = !!e.altKey; el.classList.add('over'); el.classList.toggle('copy', cp); try { e.dataTransfer.dropEffect = cp ? 'copy' : 'move'; } catch (x) {} },
    _dp: (e, gk, to) => { e.preventDefault(); e.currentTarget.classList.remove('over', 'copy'); if (_dragV == null) return; const v = _dragV, f = _dragFrom; _dragV = null; move(v, gk, f, to, !!e.altKey); },
    _tx: () => { const t = S.toast; if (t && t.extra) { const f = t.extra; t.extra = null; f.fn(); draw(); } },
    _undo: () => { const f = S.undo.pop(); S.toast = null; if (f) f(); draw(); },
    _tu: () => { const t = S.toast; if (!t || !t.undo) return; const i = S.undo.lastIndexOf(t.undo); if (i >= 0) S.undo.splice(i, 1); S.toast = null; t.undo(); draw(); },
    _move: move, _toggle: toggle, _state: () => ({ ...S, D, P }), _groupers: groupers,
  };

  // いつも出しておく（v53.049・オーナー「グルーピングのボタンはいらない。最初から出しときゃいい」）。
  // ライブラリの準備ができたら、カード一覧の上にグルーピングの並び（すべて・作ったもの・＋ グルーピング）を出す。描き直しで外れたら付け直す
  setInterval(() => {
    if (isOpen()) return;
    if (!document.getElementById('cardList') || !(window.videos || []).length || typeof window.filt !== 'function') return;
    open();
  }, 1000);
})();
