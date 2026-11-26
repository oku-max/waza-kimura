// ═══ 見え方（試験版）— リストの中で「まとめ方」を名前つきで持つ（v53.038・オーナー確認用。絞り込みはふだんのフィルター・まとめ方は「タグを選んでまとめる」も） ═══
// オーナー決定までの試し（モック mock-cv-subviews.html の本物版）。オーナーのときだけ、カード表示の上に「見え方（試験）」が出る。
//
// 【データ経路】読むだけ。どこにも書かない。
//   読む: window.filt(window.videos)（今カードに出ている動画＝開いているリスト・絞り込み・検索語の結果）
//         tagRegistry.groups()/valuesOf()（タグ）・v.pl / v.channel・localStorage wk_cv_shared（カスタム列の定義）・v.cf
//   書く: なし。見え方の一覧・ドラッグの結果は、この画面の変数（S）にだけ持つ。
//         動画オブジェクト・リスト（_views）・設定・localStorage・クラウドには触らない＝再読み込みで消える。
//   ドラッグ: 動画のタグを変えず、S.sim（動画id → まとめ方 → 値の配列）に「動かしたつもり」を持つだけ。
//   検査 tools/subviews-trial-check.mjs が、試して閉じた後に動画・localStorage・クラウドが1文字も変わっていないことを見る。
(function () {
  const S = {
    views: [{ id: 'all', name: 'すべて', gb: null, f: {} }],
    newTags: {},   // 試験版でその場で足したタグ（グループのキー → 値の配列）。画面の中だけ
    cur: 'all', mode: 'board', sim: new Map(), closed: {}, editing: null, toast: null, more: {},
  };
  const LIMIT = 60;           // 1列に最初に出す本数（3,000本でも固まらないように）
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jsq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // ── まとめ方に使えるもの（今ある情報だけ: タグ・プレイリスト・チャンネル・カスタム列のセレクト/評価）──
  function sharedCols() {
    try { const o = JSON.parse(localStorage.getItem('wk_cv_shared') || 'null'); // 読むだけ
      const del = new Set(Array.isArray(o?.deleted) ? o.deleted : []);
      return (Array.isArray(o?.cols) ? o.cols : []).filter(c => c && c.id && !del.has(c.id) && !c.off);
    } catch (e) { return []; }
  }
  const optName = o => typeof o === 'string' ? o : (o && (o.label || o.name || o.value)) || '';
  let _gc = null;   // 1回の描画の間だけ覚える（動画×選んだタグの数だけ組み立て直さない）
  function groupers() {
    if (_gc) return _gc;
    const out = _gc = [];
    const TR = window.tagRegistry;
    if (TR) (TR.groups() || []).forEach(g => { if (!g) return;
      out.push({ key: 'tag:' + g.id, kind: 'tag', name: g.name, sub: g.slot >= 0 ? ('タグ' + (g.slot + 1)) : '未使用',
        opts: [...(g.allOptions || []), ...(S.newTags['tag:' + g.id] || []).filter(x => !(g.allOptions || []).includes(x))], read: v => TR.valuesOf(v, g.id) }); });
    out.push({ key: 'pl', kind: 'src', name: 'プレイリスト', read: v => v.pl ? [v.pl] : [] });
    out.push({ key: 'ch', kind: 'src', name: 'チャンネル', read: v => v.channel ? [v.channel] : [] });
    sharedCols().forEach(c => {
      if (c.type === 'select') out.push({ key: 'cf:' + c.id, kind: 'one', name: c.label || '（列）', sub: 'セレクト',
        opts: (c.options || []).map(optName).filter(Boolean), read: v => { const x = v.cf && v.cf[c.id]; return x ? [String(x)] : []; } });
      else if (c.type === 'stars') out.push({ key: 'cf:' + c.id, kind: 'one', name: c.label || '（列）', sub: '評価',
        opts: ['★★★★★', '★★★★', '★★★', '★★', '★'], read: v => { const n = Number(v.cf && v.cf[c.id]) || 0; return n > 0 ? ['★'.repeat(Math.min(5, n))] : []; } });
    });
    return out;
  }
  const GR0 = key => groupers().find(g => g.key === key) || null;
  // 「タグを選んでまとめる」（オーナー: 1つのタググループにいろんな切り口の値を詰め込み、そのリストで列にしたい値だけを選ぶ）
  // picks = [{g:'tag:グループid', v:値}]。どのタググループの値でもよい。列は選んだ順。
  function pickGrouper(view) {
    const picks = (view && view.picks || []).filter(p => GR0(p.g));
    const dup = new Map(); picks.forEach(p => dup.set(p.v, (dup.get(p.v) || 0) + 1));
    const label = p => dup.get(p.v) > 1 ? `${p.v}（${GR0(p.g).name}）` : p.v;
    const items = picks.map(p => ({ ...p, label: label(p) }));
    return { key: 'pick', kind: 'pick', name: '選んだタグ', items, opts: items.map(x => x.label), showNone: !view || view.showNone !== false,
      read: () => [] };
  }
  const GR = key => key === 'pick' ? pickGrouper(S.editing && S.editing.gb === 'pick' ? S.editing : VW()) : GR0(key);
  // 試しに動かした分を先に見る（本物の値は読むだけ）
  function vals(v, g) {
    if (g.kind === 'pick') return g.items.filter(p => vals(v, GR0(p.g)).includes(p.v)).map(p => p.label);
    const m = S.sim.get(v.id);
    if (m && m.has(g.key)) return m.get(g.key).slice();
    return (g.read(v) || []).map(String);
  }
  const movable = g => g && g.kind !== 'src';

  function source() {
    const all = Array.isArray(window.videos) ? window.videos : [];
    try { return typeof window.filt === 'function' ? window.filt(all) : all.filter(v => !v.archived); }
    catch (e) { return all.filter(v => !v.archived); }
  }
  // 絞り込みはふだんのフィルター（source）だけ。見え方は名前とまとめ方だけを持つ（オーナー「フィルタは既存のパネルでよくないか」）
  function _unusedApplyF(list, f) {
    const ent = Object.entries(f || {}).filter(([, a]) => a && a.length);
    if (!ent.length) return list;
    const gs = ent.map(([k, a]) => [GR(k), a]).filter(([g]) => g);
    return list.filter(v => gs.every(([g, a]) => { const x = vals(v, g); return a.some(s => s === '\u0000none' ? !x.length : x.includes(s)); }));
  }
  function columns(list, g) {
    if (g.kind === 'pick') {
      const cols = g.items.map(p => ({ key: p.label, name: p.label, isNew: isNew(p.g, p.v), ids: list.filter(v => vals(v, g).includes(p.label)).map(v => v.id) }));
      if (g.showNone) cols.unshift({ key: '\u0000none', name: 'どれにも当てはまらない', ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
      return cols;
    }
    const seen = new Set(); const keys = [];
    (g.opts || []).forEach(o => { if (!seen.has(o)) { seen.add(o); keys.push(o); } });
    list.forEach(v => vals(v, g).forEach(x => { if (!seen.has(x)) { seen.add(x); keys.push(x); } }));   // 選択肢に無い値も落とさない
    const cols = keys.map(k => ({ key: k, name: k, isNew: isNew(g.key, k), ids: list.filter(v => vals(v, g).includes(k)).map(v => v.id) }));
    const shown = g.kind === 'src' ? cols.sort((a, b) => b.ids.length - a.ids.length) : cols.filter(c => c.ids.length || (g.opts || []).includes(c.key));
    if (g.kind !== 'src') shown.unshift({ key: '\u0000none', name: g.name + 'なし', ids: list.filter(v => !vals(v, g).length).map(v => v.id), none: true });
    return shown;
  }

  // ── その場で新しいタグを足す（オーナー「タグに関しては、新しいタグもリアルタイムで付け加えられるように」）──
  // 試験版では S.newTags にだけ持つ（選択肢・動画には書かない）。本番ではタグの選択肢に足す（tagRegistry / tagSettings）。
  const isNew = (gkey, x) => (S.newTags[gkey] || []).includes(x);
  function addNewTag(gkey, name) {
    name = String(name || '').trim(); if (!name) return null;
    const G = GR0(gkey); if (!G || G.kind !== 'tag') return null;
    _gc = null;
    if (!GR0(gkey).opts.includes(name)) { (S.newTags[gkey] = S.newTags[gkey] || []).push(name); _gc = null; }
    return name;
  }
  function addColumn() {
    const V = VW(); const inp = document.getElementById('svt-newcol'); const name = inp && inp.value;
    if (V.gb === 'pick') {
      const gk = (document.getElementById('svt-newcol-g') || {}).value || V.pg;
      const v = addNewTag(gk, name); if (!v) return;
      V.picks = V.picks || []; if (!V.picks.some(p => p.g === gk && p.v === v)) V.picks.push({ g: gk, v });
    } else if (V.gb && V.gb.startsWith('tag:')) { if (!addNewTag(V.gb, name)) return; }
    else return;
    toast(`列「${String(name).trim()}」を足しました（試験版: タグの選択肢には保存していません）`);
    draw(); setTimeout(() => document.getElementById('svt-newcol')?.focus(), 0);
  }

  // ── 試しに動かす（本物には書かない）──
  function simSet(vid, g, arr, before) {
    if (!S.sim.has(vid)) S.sim.set(vid, new Map());
    S.sim.get(vid).set(g.key, arr);
    const nm = x => x == null ? '' : x;
    toast(`試しに動かしました（本物のタグは変わっていません）: ${arr.join('・') || g.name + 'なし'}`, () => { S.sim.get(vid).set(g.key, before); });
  }
  // 選んだタグの列のあいだを動かす: 元の列のタグを外し、先の列のタグを付ける（グループが違ってもよい）
  function pickChange(vid, g, offLabel, onLabel) {
    const v = (window.videos || []).find(x => x.id === vid); if (!v) return;
    const it = l => g.items.find(p => p.label === l);
    const ops = [];
    if (offLabel && it(offLabel)) ops.push([it(offLabel), false]);
    if (onLabel && it(onLabel)) ops.push([it(onLabel), true]);
    if (!ops.length) return;
    const saved = [];
    ops.forEach(([p, on]) => { const G = GR0(p.g); const before = vals(v, G);
      const after = on ? (before.includes(p.v) ? before : [...before, p.v]) : before.filter(x => x !== p.v);
      saved.push([G, before]);
      if (!S.sim.has(vid)) S.sim.set(vid, new Map()); S.sim.get(vid).set(G.key, after); });
    toast(`試しに動かしました（本物のタグは変わっていません）: ${offLabel ? offLabel + ' → ' : ''}${onLabel || 'どれにも当てはまらない'}`,
      () => saved.slice().reverse().forEach(([G, b]) => S.sim.get(vid).set(G.key, b)));
    draw();
  }
  function move(vid, gkey, from, to) {
    if (gkey === 'pick') { if (from !== to) pickChange(vid, GR('pick'), from === '\u0000none' ? null : from, to === '\u0000none' ? null : to); return; }
    const g = GR(gkey); const v = (window.videos || []).find(x => x.id === vid); if (!g || !v || !movable(g) || from === to) return;
    const before = vals(v, g); let after;
    if (g.kind === 'tag') { after = before.filter(x => x !== from); if (to !== '\u0000none' && !after.includes(to)) after.push(to); }
    else after = to === '\u0000none' ? [] : [to];
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    simSet(vid, g, after, before); draw();
  }
  function toggle(vid, gkey, val) {
    if (gkey === 'pick') { const g = GR('pick'); const v = (window.videos || []).find(x => x.id === vid); if (!v) return;
      const has = vals(v, g).includes(val); pickChange(vid, g, has ? val : null, has ? null : val); return; }
    const g = GR(gkey); const v = (window.videos || []).find(x => x.id === vid); if (!g || !v) return;
    const before = vals(v, g);
    const after = g.kind === 'tag' ? (before.includes(val) ? before.filter(x => x !== val) : [...before, val]) : (before[0] === val ? [] : [val]);
    simSet(vid, g, after, before); draw();
  }
  function toast(msg, undo) {
    S.toast = { msg, undo }; clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; drawToast(); }, 5000); drawToast();
  }
  function drawToast() {
    const el = document.getElementById('svt-toast'); if (!el) return;
    el.innerHTML = S.toast ? `<div class="svt-toast">${esc(S.toast.msg)}${S.toast.undo ? '<button onclick="wkSubviewsTrial._undo()">取り消す</button>' : ''}</div>` : '';
  }

  // ── 画面 ──
  const thumbOf = v => {
    const pt = v.pt || v.src || 'youtube';
    if (pt === 'youtube') return v.thumb || `https://img.youtube.com/vi/${v.ytId || v.id}/mqdefault.jpg`;
    if (pt === 'gdrive') return `https://drive.google.com/thumbnail?id=${String(v.id || '').replace('gd-', '')}&sz=w320`;
    return v.thumb && !String(v.thumb).includes('vumbnail.com') ? v.thumb : '';
  };
  const fmtDur = s => { s = Number(s) || 0; if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const VW = () => S.views.find(v => v.id === S.cur) || S.views[0];

  function card(v, g, colKey) {
    const mv = movable(g); const th = thumbOf(v); const x = g ? vals(v, g) : [];
    const k = v.id + '|' + colKey; const open = S.openCard === k;
    return `<div class="svt-card" ${mv ? `draggable="true" ondragstart="wkSubviewsTrial._ds(event,'${jsq(v.id)}','${jsq(colKey)}')"` : ''}>
      <div class="svt-th">${th ? `<img src="${esc(th)}" loading="lazy" alt="">` : ''}${v.duration ? `<span>${esc(fmtDur(v.duration))}</span>` : ''}</div>
      <div class="svt-tt">${esc(v.title || '')}</div>
      <div class="svt-mt"><span>${esc(v.channel || '')}</span>${mv ? `<button class="svt-sm" onclick="wkSubviewsTrial._oc('${jsq(k)}')">${esc(g.name)} ▾</button>` : ''}</div>
      ${mv && open ? `<div class="svt-mt">${g.opts.map(o => `<button class="svt-o${x.includes(o) ? ' on' : ''}" onclick="wkSubviewsTrial._tg('${jsq(v.id)}','${jsq(g.key)}','${jsq(o)}')">${esc(o)}</button>`).join('')}</div>` : ''}
      ${g && (g.kind === 'tag' || g.kind === 'pick') && x.length > 1 ? `<div class="svt-mt svt-also">ほかの列にも: ${esc(x.filter(y => y !== colKey).join('・'))}</div>` : ''}
    </div>`;
  }
  function drawBody() {
    const el = document.getElementById('svt-body'); if (!el) return;
    const V = VW(); const g = V.gb ? GR(V.gb) : null;
    const list = source();
    if (!list.length) { el.innerHTML = '<div class="svt-note">今のフィルターに当たる動画はありません。閉じてフィルターを変えてください。</div>'; return; }
    if (S.mode === 'table') {
      const head = `<tr><th>タイトル</th><th>チャンネル</th><th>プレイリスト</th>${g ? `<th>${esc(g.name)}</th>` : ''}</tr>`;
      const tr = v => `<tr><td class="t">${esc(v.title || '')}</td><td>${esc(v.channel || '')}</td><td>${esc(v.pl || '')}</td>${g ? `<td>${esc(vals(v, g).join('・') || '—')}</td>` : ''}</tr>`;
      let rows = '';
      if (!g) rows = list.slice(0, 500).map(tr).join('');
      else columns(list, g).forEach(c => { const ck = V.id + '|' + c.key; const o = !S.closed[ck];
        rows += `<tr class="gh" onclick="wkSubviewsTrial._cl('${jsq(ck)}')"><td colspan="${g ? 4 : 3}">${o ? '▼' : '▶'} ${esc(c.name)} <span class="n">${c.ids.length}本</span></td></tr>` +
          (o ? c.ids.slice(0, 300).map(id => tr(list.find(v => v.id === id))).join('') : ''); });
      el.innerHTML = `<div class="svt-tw"><table>${head}${rows}</table></div>`;
      return;
    }
    if (!g) { el.innerHTML = `<div class="svt-flat">${list.slice(0, 200).map(v => card(v, null, '')).join('')}</div>` + (list.length > 200 ? `<div class="svt-note">最初の200本だけ出しています（試験版）。</div>` : ''); return; }
    const mv = movable(g);
    el.innerHTML = `<div class="svt-board">` + columns(list, g).map(c => {
      const n = S.more[c.key] || LIMIT;
      return `<div class="svt-col" ${mv ? `ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="wkSubviewsTrial._dp(event,'${jsq(g.key)}','${jsq(c.key)}')"` : ''}>
        <div class="svt-colh"><span class="svt-tag${c.none ? ' none' : ''}">${esc(c.name)}</span>${c.isNew ? '<span class="svt-new">新</span>' : ''}<span class="n">${c.ids.length}</span></div>
        <div class="svt-cards">${c.ids.slice(0, n).map(id => card(list.find(v => v.id === id), g, c.key)).join('')}</div>
        ${c.ids.length > n ? `<button class="svt-sm" style="width:100%;margin-top:6px" onclick="wkSubviewsTrial._mr('${jsq(c.key)}')">さらに ${c.ids.length - n} 本</button>` : ''}
      </div>`; }).join('') + addColBox(g) + `</div>` +
      `<div class="svt-note">${mv ? 'カードを別の列へドラッグ（スマホはカードの「' + esc(g.name) + ' ▾」）。<b>試験版なので、本物のタグは変わりません</b>（閉じる・再読み込みで元どおり）。' : 'プレイリスト・チャンネルは動画の出どころなので、列のあいだを動かせません。'}</div>`;
  }
  function addColBox(g) {
    if (!g || (g.kind !== 'tag' && g.kind !== 'pick')) return '';
    const V = VW(); const tags = groupers().filter(x => x.kind === 'tag');
    const sel = g.kind === 'pick' ? `<select id="svt-newcol-g" aria-label="どのタググループに足すか">${tags.map(t => `<option value="${esc(t.key)}"${t.key === (V.pg || (V.picks && V.picks[0] && V.picks[0].g)) ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : '';
    return `<div class="svt-col svt-addcol"><div class="svt-colh"><span class="svt-tag none">＋ 新しいタグ</span></div>
      <div class="svt-addbox">${sel}<input id="svt-newcol" type="text" placeholder="タグの名前" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkSubviewsTrial._addCol()"><button class="svt-sm pri" onclick="wkSubviewsTrial._addCol()">列を足す</button>
      <div class="svt-grp">足した列へカードをドラッグすると、そのタグが付きます（試験版なので保存しません）。</div></div></div>`;
  }
  function fLabel(f) {
    const p = Object.entries(f || {}).filter(([, a]) => a && a.length).map(([k, a]) => { const g = GR(k); return (g ? g.name : k) + ': ' + a.map(x => x === '\u0000none' ? 'なし' : x).join('・'); });
    return p.length ? p.join(' / ') : 'なし';
  }
  function pickEd(d, gs) {
    const tags = gs.filter(g => g.kind === 'tag');
    if (!d.pg || !tags.find(g => g.key === d.pg)) d.pg = (tags[0] || {}).key;
    const G = GR0(d.pg); if (!G) return '';
    const seen = new Set(G.opts); const extra = [];
    source().forEach(v => (G.read(v) || []).forEach(x => { x = String(x); if (!seen.has(x)) { seen.add(x); extra.push(x); } }));
    const all = [...G.opts, ...extra];
    const on = x => (d.picks || []).some(p => p.g === d.pg && p.v === x);
    const cnt = x => source().filter(v => vals(v, G).includes(x)).length;
    const pg = pickGrouper(d);
    return `<div class="setbox svt-pick">
      <div class="svt-grp" style="margin-top:0">① どのタグから選ぶか</div>
      <div class="svt-opts">${tags.map(g => `<button class="svt-o${g.key === d.pg ? ' on' : ''}" onclick="wkSubviewsTrial._pg('${jsq(g.key)}')">${esc(g.name)}<small> ${esc(g.sub)}</small></button>`).join('')}</div>
      <div class="svt-grp">② 列にしたいタグを押す（いまのフィルターでの本数）</div>
      <div class="svt-opts">${all.map(x => `<button class="svt-o${on(x) ? ' on' : ''}" onclick="wkSubviewsTrial._pv('${jsq(x)}')">${on(x) ? '✓ ' : ''}${esc(x)}<small> ${cnt(x)}</small></button>`).join('') || '<span class="svt-grp">このタググループには値がありません。</span>'}</div>
      <div class="svt-opts"><input id="svt-pnew" type="text" placeholder="＋ 新しいタグ（${esc(G.name)}に足す）" onkeydown="if(event.key==='Enter'&&!event.isComposing)wkSubviewsTrial._pnew()"><button class="svt-sm" onclick="wkSubviewsTrial._pnew()">足して選ぶ</button></div>
      <div class="svt-grp">③ 列になる順（選んだ順・✕で外す）</div>
      <div class="svt-opts">${pg.items.map((p, i) => `<span class="svt-o on">${i + 1}. ${esc(p.label)} <button class="svt-x" aria-label="外す" onclick="wkSubviewsTrial._px(${i})">✕</button></span>`).join('') || '<span class="svt-grp">まだ選んでいません。</span>'}</div>
      <label class="svt-grp" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${d.showNone !== false ? 'checked' : ''} onchange="wkSubviewsTrial._pn(this.checked)"> 選んだタグがどれも付いていない動画を「どれにも当てはまらない」の列に出す</label>
    </div>`;
  }
  function drawEd() {
    const el = document.getElementById('svt-ed'); if (!el) return;
    const d = S.editing; if (!d) { el.innerHTML = ''; return; }
    const gs = groupers();
    const gb = g => `<button class="svt-o${d.gb === g.key ? ' on' : ''}" onclick="wkSubviewsTrial._eg('${jsq(g.key)}')">${esc(g.name)}${g.sub ? `<small> ${esc(g.sub)}</small>` : ''}</button>`;
    el.innerHTML = `<div class="svt-ed">
      <div class="r"><div class="k">名前</div><input id="svt-name" type="text" value="${esc(d.name)}" oninput="wkSubviewsTrial._en(this.value)"></div>
      <div class="r"><div class="k">まとめ方</div><div class="svt-opts">
        <button class="svt-o${!d.gb ? ' on' : ''}" onclick="wkSubviewsTrial._eg('')">まとめない</button>
        <div class="svt-grp">タグ</div><button class="svt-o${d.gb === 'pick' ? ' on' : ''}" onclick="wkSubviewsTrial._eg('pick')">☑ タグを選んでまとめる</button>${gs.filter(g => g.kind === 'tag').map(g => gb(g)).join('')}
        <div class="svt-grp">動画の出どころ（動かせない）</div>${gs.filter(g => g.kind === 'src').map(gb).join('')}
        ${gs.some(g => g.kind === 'one') ? `<div class="svt-grp">カスタム列（セレクト・評価）</div>${gs.filter(g => g.kind === 'one').map(gb).join('')}` : ''}
      </div></div>
      ${d.gb === 'pick' ? pickEd(d, gs) : ''}
      <div class="svt-grp">絞り込みは、ふだんのフィルター（サイドパネル・フィルターの窓・検索語）をそのまま使います。</div>
      <div class="foot">${d.id !== 'all' && S.views.some(v => v.id === d.id) ? '<button class="svt-sm danger" onclick="wkSubviewsTrial._del()">この見え方を消す</button>' : ''}<span style="flex:1"></span><button class="svt-sm" onclick="wkSubviewsTrial._ec()">やめる</button><button class="svt-sm pri" onclick="wkSubviewsTrial._es()">決める</button></div>
    </div>`;
  }
  function drawTabs() {
    const el = document.getElementById('svt-tabs'); if (!el) return;
    el.innerHTML = S.views.map(v => `<button class="svt-vt${v.id === S.cur ? ' on' : ''}" onclick="wkSubviewsTrial._pick('${jsq(v.id)}')">${v.gb ? '⊞ ' : '▦ '}${esc(v.name)}</button>`).join('') +
      `<button class="svt-vt add" onclick="wkSubviewsTrial._new()">＋ 見え方</button>`;
    const V = VW(); const g = V.gb ? GR(V.gb) : null;
    document.getElementById('svt-sum').innerHTML = `<span>絞り込み <b>今のフィルターのまま（${source().length}本）</b></span><span>まとめ方 <b>${esc(!g ? 'まとめない' : g.kind === 'pick' ? '選んだタグ: ' + (g.opts.join('・') || 'まだ選んでいない') : g.name + (g.sub === '未使用' ? '（未使用のタグ）' : ''))}</b></span>` +
      (V.id !== 'all' ? `<button class="svt-sm" onclick="wkSubviewsTrial._edit()">✎ 見え方を編集</button>` : '') +
      (S.sim.size ? `<button class="svt-sm" onclick="wkSubviewsTrial._reset()">試しに動かした分を戻す</button>` : '');
    document.getElementById('svt-mc').className = S.mode === 'board' ? 'on' : '';
    document.getElementById('svt-mt').className = S.mode === 'table' ? 'on' : '';
  }
  function draw() { _gc = null; drawTabs(); drawEd(); drawBody(); drawToast(); }

  function css() {
    if (document.getElementById('svt-style')) return;
    const st = document.createElement('style'); st.id = 'svt-style';
    st.textContent = `
#svt-root{position:fixed;inset:0;z-index:9000;background:var(--bg);color:var(--text);display:flex;flex-direction:column;font-size:13px}
#svt-root .svt-head{padding:calc(10px + env(safe-area-inset-top,0px)) max(14px,env(safe-area-inset-right,0px)) 8px max(14px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--border);display:grid;gap:6px;background:var(--surface)}
#svt-root .svt-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#svt-root .svt-top h2{font-size:15px;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#svt-root .svt-trial{font-size:11px;color:var(--gold);background:var(--gold-soft);padding:3px 8px;border-radius:6px}
#svt-root .svt-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
#svt-root .svt-vt{flex-shrink:0;font-size:12.5px;padding:6px 11px;border-radius:8px;border:none;background:none;color:var(--text2);white-space:nowrap;cursor:pointer;font-family:inherit}
#svt-root .svt-vt.on{background:var(--surface2);color:var(--text);font-weight:700}
#svt-root .svt-sum{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--text3)}
#svt-root .svt-sum b{color:var(--text)}
#svt-root .svt-seg{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden}
#svt-root .svt-seg button{border:none;background:var(--surface);font-size:11.5px;padding:5px 10px;color:var(--text2);cursor:pointer;font-family:inherit}
#svt-root .svt-seg button.on{background:var(--accent);color:var(--on-accent)}
#svt-root .svt-sm{font-size:11px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit}
#svt-root .svt-sm.pri{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#svt-root .svt-sm.danger{color:var(--red)}
#svt-root .svt-main{flex:1;overflow:auto;padding:10px max(14px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px))}
#svt-root .svt-ed{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;display:grid;gap:12px;margin-bottom:10px}
#svt-root .svt-ed .r{display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px;align-items:start}
#svt-root .svt-ed .k{font-size:11px;font-weight:700;color:var(--text3);padding-top:5px}
#svt-root .svt-ed input,#svt-root .svt-ed select{font-size:13px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);max-width:320px;font-family:inherit}
#svt-root .svt-ed .foot{display:flex;gap:8px;border-top:1px solid var(--border);padding-top:10px}
#svt-root .svt-opts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#svt-root .svt-grp{width:100%;font-size:10.5px;color:var(--text3);margin-top:4px}
#svt-root .svt-o{font-size:11.5px;padding:4px 10px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer;font-family:inherit}
#svt-root .svt-o.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#svt-root .svt-o small{opacity:.7}
#svt-root .setbox{border:1px dashed var(--border);border-radius:9px;padding:10px;display:grid;gap:6px}
#svt-root .svt-addcol{border:1px dashed var(--border);background:var(--surface)}
#svt-root .svt-addbox{display:grid;gap:6px;padding:0 2px 4px}
#svt-root .svt-addbox input,#svt-root .svt-addbox select,#svt-root #svt-pnew{font-size:12.5px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;min-width:0}
#svt-root .svt-new{font-size:9.5px;padding:0 5px;border-radius:4px;background:var(--gold-soft);color:var(--gold)}
#svt-root .svt-x{border:none;background:none;color:inherit;font-size:11px;padding:0 0 0 4px;cursor:pointer}
#svt-root .svt-board{display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:8px;scroll-snap-type:x proximity}
#svt-root .svt-col{flex:0 0 250px;border-radius:10px;padding:6px;scroll-snap-align:start}
#svt-root .svt-col.over{background:var(--gold-soft)}
#svt-root .svt-colh{display:flex;gap:6px;align-items:center;padding:2px 2px 8px}
#svt-root .svt-tag{font-size:12px;padding:2px 8px;border-radius:5px;background:var(--blue-soft);color:var(--text);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#svt-root .svt-tag.none{background:var(--surface3)}
#svt-root .n{font-size:10.5px;color:var(--text3)}
#svt-root .svt-cards{display:grid;gap:8px}
#svt-root .svt-flat{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
#svt-root .svt-card{background:var(--surface);border:1px solid var(--border);border-radius:9px;overflow:hidden}
#svt-root .svt-card[draggable=true]{cursor:grab}
#svt-root .svt-th{aspect-ratio:16/9;background:var(--surface3);position:relative;overflow:hidden}
#svt-root .svt-th img{width:100%;height:100%;object-fit:cover;display:block}
#svt-root .svt-th span{position:absolute;right:4px;bottom:4px;font-size:9.5px;background:rgba(0,0,0,.65);color:#fff;padding:0 4px;border-radius:3px}
#svt-root .svt-tt{padding:7px 9px 4px;font-size:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#svt-root .svt-mt{padding:0 9px 8px;font-size:10px;color:var(--text3);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#svt-root .svt-mt .svt-sm{margin-left:auto;font-size:10px;padding:2px 7px}
#svt-root .svt-also{padding-top:0}
#svt-root .svt-note{font-size:11.5px;color:var(--text3);padding:8px 2px;line-height:1.6}
#svt-root .svt-tw{overflow-x:auto;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
#svt-root table{border-collapse:collapse;width:100%;min-width:520px;font-size:12px}
#svt-root th,#svt-root td{padding:6px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
#svt-root th{font-size:11px;color:var(--text3);background:var(--surface2)}
#svt-root td.t{white-space:normal;min-width:220px}
#svt-root tr.gh td{background:var(--surface2);font-weight:700;cursor:pointer}
#svt-root .svt-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));background:var(--accent);color:var(--on-accent);font-size:12px;padding:8px 14px;border-radius:8px;display:flex;gap:10px;align-items:center;width:max-content;max-width:calc(100% - 32px);z-index:9001}
#svt-root .svt-toast button{border:none;background:none;color:inherit;text-decoration:underline;font-size:12px;white-space:nowrap;cursor:pointer}
@media (max-width:560px){#svt-root .svt-top h2{flex-basis:100%}#svt-root .svt-col{flex-basis:82%}#svt-root .svt-ed .r{grid-template-columns:minmax(0,1fr)}}
`;
    document.head.appendChild(st);
  }

  function listName() {
    try { const id = window._cvCurId?.(); if (id) { const v = (window._cvViews || []).find(x => x.id === id); if (v) return v.label || v.name; } } catch (e) {}
    const el = document.querySelector('#cv-toolbar .cv-tb-name, #cv-toolbar b');
    return (el && el.textContent.trim()) || 'いま出ている動画';
  }
  function open() {
    css();
    let root = document.getElementById('svt-root');
    if (!root) { root = document.createElement('div'); root.id = 'svt-root'; document.body.appendChild(root); }
    root.innerHTML = `<div class="svt-head">
        <div class="svt-top"><h2>${esc(listName())}（${source().length}本）</h2><span class="svt-trial">試験版・何も保存しません</span>
          <div class="svt-seg"><button id="svt-mc" onclick="wkSubviewsTrial._mode('board')">カード</button><button id="svt-mt" onclick="wkSubviewsTrial._mode('table')">テーブル</button></div>
          <button class="svt-sm" onclick="wkSubviewsTrial.close()">閉じる</button></div>
        <div class="svt-tabs" id="svt-tabs"></div>
        <div class="svt-sum" id="svt-sum"></div>
      </div>
      <div class="svt-main"><div id="svt-ed"></div><div id="svt-body"></div></div><div id="svt-toast"></div>`;
    root.style.display = 'flex';
    draw();
  }
  function close() { const r = document.getElementById('svt-root'); if (r) r.remove(); S.toast = null; S.editing = null; }

  let _dragV = null, _dragFrom = null;
  window.wkSubviewsTrial = {
    open, close,
    _pick: id => { S.cur = id; S.editing = null; S.more = {}; draw(); },
    _new: () => { S.editing = { id: 'n' + Date.now(), name: '新しい見え方', gb: null, picks: [], showNone: true }; draw(); setTimeout(() => document.getElementById('svt-name')?.select(), 0); },
    _edit: () => { const v = VW(); S.editing = { id: v.id, name: v.name, gb: v.gb, picks: (v.picks || []).map(p => ({ ...p })), showNone: v.showNone !== false, pg: v.pg }; draw(); },
    _pg: k => { S.editing.pg = k; drawEd(); },
    _pv: x => { const d = S.editing; d.picks = d.picks || []; const i = d.picks.findIndex(p => p.g === d.pg && p.v === x); i < 0 ? d.picks.push({ g: d.pg, v: x }) : d.picks.splice(i, 1); drawEd(); },
    _px: i => { const d = S.editing; const items = pickGrouper(d).items; const it = items[i]; if (!it) return; d.picks = d.picks.filter(p => !(p.g === it.g && p.v === it.v)); drawEd(); },
    _pn: on => { S.editing.showNone = on; },
    _pnew: () => { const d = S.editing; const inp = document.getElementById('svt-pnew'); const v = addNewTag(d.pg, inp && inp.value); if (!v) return;
      d.picks = d.picks || []; if (!d.picks.some(p => p.g === d.pg && p.v === v)) d.picks.push({ g: d.pg, v }); drawEd(); setTimeout(() => document.getElementById('svt-pnew')?.focus(), 0); },
    _addCol: () => addColumn(),
    _en: t => { if (S.editing) S.editing.name = t; },
    _eg: k => { S.editing.gb = k || null; drawEd(); },
    _ec: () => { S.editing = null; draw(); },
    _es: () => { const d = S.editing; const name = (d.name || '').trim() || '見え方'; const ex = S.views.find(v => v.id === d.id);
      const keep = { name, gb: d.gb, picks: (d.picks || []).map(p => ({ ...p })), showNone: d.showNone !== false, pg: d.pg };
      if (ex) Object.assign(ex, keep); else S.views.push({ id: d.id, ...keep });
      S.cur = d.id; S.editing = null; S.more = {}; draw(); },
    _del: () => { const i = S.views.findIndex(v => v.id === S.editing.id); if (i > 0) S.views.splice(i, 1); S.cur = 'all'; S.editing = null; draw(); },
    _mode: m => { S.mode = m; draw(); },
    _cl: k => { S.closed[k] = !S.closed[k]; drawBody(); },
    _mr: k => { S.more[k] = (S.more[k] || LIMIT) + LIMIT; drawBody(); },
    _oc: k => { S.openCard = S.openCard === k ? null : k; drawBody(); },
    _tg: (vid, gk, val) => toggle(vid, gk, val),
    _ds: (e, vid, from) => { _dragV = vid; _dragFrom = from; try { e.dataTransfer.setData('text/plain', vid); } catch (x) {} },
    _dp: (e, gk, to) => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (_dragV == null) return; const v = _dragV, f = _dragFrom; _dragV = null; move(v, gk, f, to); },
    _undo: () => { if (S.toast && S.toast.undo) S.toast.undo(); S.toast = null; draw(); },
    _reset: () => { S.sim.clear(); draw(); },
    _move: move, _state: () => S, _groupers: groupers,
  };

  // 入口: オーナーのときだけ、カード表示の上（カード／テーブルの右）に出す
  function syncBtn() {
    const b = document.getElementById('svt-open-btn'); if (!b) return;
    const ok = typeof window.wkIsOwner === 'function' && window.wkIsOwner();
    b.style.display = ok ? '' : 'none';
  }
  setInterval(syncBtn, 2000);
  document.addEventListener('DOMContentLoaded', syncBtn);
})();
