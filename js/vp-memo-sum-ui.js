// ═══ メモの要約: 開閉・⋯（さらにくわしく／ドリルにする）（v53.001・オーナー決定 mock-memo-actions.html） ═══
// 決定: ① 呼び出しは行の右の「⋯」（A） ② くわしくはその行のすぐ下（X） ③ 見出しは最初は閉じている
//   ・✨要約 がメモに入れた見出し（.memo-sum-ch＝ブックマーク／.memo-sum-dh＝くわしく）と一番上の題（.memo-sum-t）の左の ▾ で開閉
//   ・見出し・行（.memo-sum-it）の右の ⋯ で「▶ ここから再生／🔍 さらにくわしく／DRILL ドリルにする」
//       さらにくわしく … 今の「✨ 要約」の窓を、範囲を入れた「時間を指定」で開く（vpSumRangeOpen の opts）。できたものはその行のすぐ下
//       ドリルにする   … 見出しはブックマークの行の DRILL と同じ（wkDrillFromBm）。行は 行の時刻〜次の行の時刻 で今のドリルのカード
//
// 【データ】このファイルはメモの中身（v.memo・メモ欄の DOM）を1文字も変えない。
//   ▾ と ⋯ は CSS の ::before / ::after で描き、開閉は「#vp-memo-ID > :nth-child(n) を隠す」<style> を作って効かせる。
//   メモ欄の要素にクラスや属性を付けないので、vpSaveMemo が保存する innerHTML に開閉の状態が混ざらない。
//   開閉の状態は画面の中だけ（WeakMap。開き直すと最初の形＝見出しは閉じている）。
//
// 【仕切り】（v53.002・オーナー決定 mock-memo-divider.html の ①「表示するときに今の仕切りから当てはめる」）
//   要約のブックマークの見出し（.memo-sum-ch）を、今の仕切り（v.bmDividers）ごとに紫の大見出しでまとめる。
//   大見出しはメモの外（メモ欄の上に重ねた層 .memo-dv-layer）に描き、場所はメモの要素に余白を足す <style> で空ける。
//   メモの文字には入れない＝前に作った要約にも付き、仕切りを動かす・名前を変えるとついてくる。
//   仕切りは最初は閉じている（v53.030 から。前は開いていた）。押すと中のブックマークをまとめて開閉。右の ⋯ で その仕切りの区間の さらにくわしく／ドリル。
//
// 【仕切りの開閉】（v53.030・オーナー決定 mock-memo-fold-auto.html）仕切りは最初は閉じている（後から入った要約の仕切りは開いて出る）。
//   帯の右の「すべて開く」で仕切りと中のブックマークを全部開く。全部開いていれば「すべて閉じる」（中のブックマークを閉じる・仕切りは開いたまま）。
// 【再生に合わせる】（v53.030）Memo の見出しの「▶ 再生に合わせる」（要約があるときだけ出る）。オンの間、再生中の所を開く。
//   右の ▾ で どこまで開くか（仕切りだけ／再生中のブックマークだけ／ブックマークごと）と、次へ移ったら前の所を閉じるか残すか。
//   閉じるのはオートで開いた所だけ（手で開いた所は閉じない）。再生中の所を手で閉じたら、次のブックマークへ移るまで開き直さない。
//   好みはこの端末だけ（localStorage wk_memoFollow）。開閉の状態は今までどおり画面の中だけ（メモに書かない・保存しない）。
// 【再生中】（v53.026）今の再生位置を含む行・見出しに、ブックマークの再生中と同じ色と左の線（nowSync）。閉じていれば見出し・仕切りに。自動で追いかける。
(() => {
  const OPEN = new WeakMap();   // 見出しの要素 → 開いているか
  const SEEN = new WeakSet();
  const NEWT = new WeakSet();   // 開いた後に入った要約の題（その仕切りは開いて出す）   // 最初に見た見出し（これより後に現れた見出し＝今入った要約・くわしく は開いて出す）
  let cur = null;               // { id, el, mo, style, layer, ro }
  const DV_OPEN = new WeakMap();  // 要約の題（.memo-sum-t）→ Map(仕切りのキー → 開いているか)。既定は開
  const BAR_H = 36;               // 仕切りの帯1本ぶんの高さ（すき間込み）
  const toS = t => typeof t === 'number' ? t : String(t ?? '').split(':').map(Number).reduce((p, q) => p * 60 + (q || 0), 0);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtT = s => window._vpSumKit?.fmtSec?.(Math.floor(s)) || String(Math.floor(s));
  const videoOf = () => (window.videos || []).find(x => x.id === cur?.id) || null;
  const durOf = v => window._vpDrillKit?.duration?.(cur.id) || Number(v?.duration) || 0;
  const dividers = v => (v?.bmDividers || []).map(d => ({ t: toS(d.time), label: String(d.label || '') })).filter(d => isFinite(d.t)).sort((a, b) => a.t - b.t);

  const kind = e => e.classList.contains('memo-sum-t') ? 'T' : e.classList.contains('memo-sum-ch') ? 'C'
    : e.classList.contains('memo-sum-dh') ? 'D' : e.classList.contains('memo-sum-it') ? 'I'
    : (e.classList.contains('memo-sum-pt') || e.classList.contains('memo-sum-ov')) ? 'P' : 'O';   // ov＝全体の要約（題の下・v53.022）。題と一緒に開閉   // P＝章の要点（見出しの下の1〜3文・v53.005）。見出しと一緒に開閉する
  const lvOf = e => Number(e.dataset?.lv) || 0;
  const isHead = k => k === 'T' || k === 'C' || k === 'D';
  const defOpen = k => k === 'T';   // 題は開いている・見出しは閉じている（オーナー決定 ③）
  const isOpen = (e, k) => OPEN.has(e) ? OPEN.get(e) : defOpen(k);
  const secOf = e => { const a = e.querySelector('a.ts-link[data-sec]'); const s = a ? parseInt(a.dataset.sec) : NaN; return isNaN(s) ? null : s; };

  // 見出しの範囲（その見出しが畳む要素）。T: 次の T・要約でない要素まで／C: 次の C・T まで／D(lv n): 一段深いもの・同じ深さの行
  function groupOf(kids, i) {
    const e = kids[i], k = kind(e), n = lvOf(e), out = [];
    for (let j = i + 1; j < kids.length; j++) {
      const x = kids[j], t = kind(x);
      if (k === 'T') { if (t === 'T' || t === 'O') break; }
      else if (k === 'C') { if (t !== 'I' && t !== 'D' && t !== 'P') break; }
      else if (!((t === 'I' && lvOf(x) >= n) || (t === 'D' && lvOf(x) > n))) break;
      out.push(j);
    }
    return out;
  }
  function itemsCount(kids, i, grp) {
    const k = kind(kids[i]), n = lvOf(kids[i]);
    return grp.filter(j => kind(kids[j]) === 'I' && (k === 'D' ? lvOf(kids[j]) === n : lvOf(kids[j]) === 0)).length;
  }

  function paint() {
    if (!cur || !cur.el.isConnected) return;
    const kids = [...cur.el.children], hid = new Set(), sel = `#${CSS.escape(cur.el.id)} > :nth-child`;
    let css = '';
    kids.forEach((e, i) => {
      const k = kind(e); if (!isHead(k)) return;
      if (!SEEN.has(e)) { SEEN.add(e); if (cur.ready && !OPEN.has(e)) OPEN.set(e, true); if (cur.ready && k === 'T') NEWT.add(e); }
      if (isOpen(e, k)) return;
      const grp = groupOf(kids, i); grp.forEach(j => hid.add(j));
      const n = itemsCount(kids, i, grp);
      css += `${sel}(${i + 1})::before{content:'▸'}`;
      const cnt = n ? (window.WK_LANG?.() === 'en' ? `${n} items` : `${n}件`) : '';
      css += `${sel}(${i + 1})::after{content:'${cnt}${k === 'C' ? '　⋯' : ''}'}`;
    });
    // ── 仕切り: 要約ごとに、ブックマークの見出しを今の仕切りでまとめる ──
    const v = videoOf(), D = dividers(v), dur = durOf(v), bars = [], indent = new Map();
    if (D.length) kids.forEach((e, ti) => {
      if (kind(e) !== 'T' || hid.has(ti) || !isOpen(e, 'T')) return;
      let end = ti + 1; while (end < kids.length && !['T', 'O'].includes(kind(kids[end]))) end++;   // この要約の範囲 (ti, end)
      const divOf = t => { let k = -1; D.forEach((d, i) => { if (d.t <= t + 0.5) k = i; }); return k; };
      let g = null; const groups = [];
      for (let j = ti + 1; j < end; j++) {
        if (kind(kids[j]) !== 'C') continue;
        const s = secOf(kids[j]), k = s == null ? (g ? g.k : -1) : divOf(s);
        if (!g || k !== g.k) { if (g) g.end = j - 1; g = { k, start: j }; groups.push(g); }
      }
      if (g) g.end = end - 1;
      const st = DV_OPEN.get(e) || new Map(); DV_OPEN.set(e, st);
      groups.filter(x => x.k >= 0).forEach(x => {
        const d = D[x.k], key = d.t + '|' + d.label, open = st.has(key) ? st.get(key) : NEWT.has(e);   // 最初は閉じている（v53.030）
        const cs = []; for (let j = x.start; j <= x.end; j++) if (kind(kids[j]) === 'C') cs.push(j);
        const allOpen = open && cs.every(j => isOpen(kids[j], 'C'));
        if (!open) for (let j = x.start; j <= x.end; j++) hid.add(j);
        else for (let j = x.start; j <= x.end; j++) indent.set(j, 14 + lvOf(kids[j]) * 14);
        bars.push({ T: e, key, open, allOpen, cs: cs.map(j => kids[j]), start: x.start, end: x.end, n: cs.length, label: d.label, a: d.t, b: x.k + 1 < D.length ? D[x.k + 1].t : (dur > d.t ? dur : null) });
      });
    });
    const hide = hid.size ? [...hid].map(j => `${sel}(${j + 1})`).join(',') + '{display:none!important}' : '';
    css += [...indent].map(([j, px]) => `${sel}(${j + 1}){margin-left:${px}px!important}`).join('');
    cur.style.textContent = css + hide;
    layoutBars(kids, hid, bars, css + hide, sel);
    cur.hid = hid; cur.ranges = null; renderFollow(); nowSync(true);
  }

  // 仕切りの帯を、メモの要素のすき間（余白を足して空ける）に重ねて描く。帯はメモの外の要素なので保存されない
  function layoutBars(kids, hid, bars, baseCss, sel) {
    const L = cur.layer; if (!L) return;
    if (!bars.length) { L.innerHTML = ''; return; }
    // 帯を置く相手: 区間の最初の見える要素（閉じた区間なら、その後ろの最初の見える要素）。無ければメモの最後
    const at = new Map(); let tail = [];
    bars.forEach(bar => { let j = bar.start; while (j < kids.length && hid.has(j)) j++; if (j < kids.length) { if (!at.has(j)) at.set(j, []); at.get(j).push(bar); } else tail.push(bar); });
    let css = baseCss;
    at.forEach((list, j) => { const mt = parseFloat(getComputedStyle(kids[j]).marginTop) || 0; css += `${sel}(${j + 1}){margin-top:${Math.max(mt, 10) + list.length * BAR_H}px!important}`; });
    if (tail.length) css += `#${CSS.escape(cur.el.id)}{padding-bottom:${tail.length * BAR_H + 10}px!important}`;
    cur.style.textContent = css;
    // 位置は画面上の座標の差で測る（層はメモ欄の親＝行に重ねている）
    const el = cur.el, cs = getComputedStyle(el), padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    // 設定の「表示の大きさ」（body.style.zoom）が 1 以外だと、画面上の座標は拡大された値になる。
    // 帯の top/left は拡大前の単位なので、層の見た目の高さ÷本来の高さで割り戻す（v53.003。割らないと下にずれて見出しに重なった）
    const base = L.getBoundingClientRect(), er = el.getBoundingClientRect();
    const k = (L.offsetHeight && base.height) ? base.height / L.offsetHeight : 1;
    const left = (er.left - base.left) / k + el.clientLeft + padL, width = el.clientWidth - padL - padR;
    const place = (list, bottom) => list.map((bar, n) => ({ bar, top: bottom - (list.length - n) * BAR_H }));
    const rows = [];
    at.forEach((list, j) => rows.push(...place(list, (kids[j].getBoundingClientRect().top - base.top) / k - 4)));
    if (tail.length) rows.push(...place(tail, (er.bottom - base.top) / k - el.clientTop - 6));
    cur.bars = rows.map(r => r.bar);
    const en = window.WK_LANG?.() === 'en';
    L.innerHTML = rows.map((r, i) => `<div class="memo-dv" data-i="${i}" style="top:${r.top}px;left:${left}px;width:${width}px">
      <button class="memo-dv-f" data-a="fold" aria-expanded="${r.bar.open}">${r.bar.open ? '▾' : '▸'}</button>
      <span class="memo-dv-n" data-a="fold">■ <span data-user-text="1">${esc(r.bar.label || '（名前なし）')}</span></span>
      ${r.bar.open ? '' : `<span class="memo-dv-c">${en ? r.bar.n + ' headings' : r.bar.n + '見出し'}</span>`}
      <button class="memo-dv-all" data-a="all">${r.bar.allOpen ? (en ? 'Close all' : 'すべて閉じる') : (en ? 'Open all' : 'すべて開く')}</button>
      <button class="memo-dv-m" data-a="menu" title="この仕切りの区間で">⋯</button></div>`).join('');
  }
  function onBar(ev) {
    const b = ev.target.closest('[data-a]'), row = ev.target.closest('.memo-dv'); if (!b || !row || !cur) return;
    const bar = cur.bars?.[+row.dataset.i]; if (!bar) return;
    ev.preventDefault();
    if (b.dataset.a === 'fold') {
      const st = DV_OPEN.get(bar.T); st.set(bar.key, !bar.open);
      AUTO_DV = AUTO_DV.filter(x => !(x.T === bar.T && x.key === bar.key));   // 手で触った仕切りは、オートが閉じない
      paint(); return;
    }
    if (b.dataset.a === 'all') {
      // すべて開く＝仕切りと中のブックマークを全部開く／すべて閉じる＝中のブックマークを閉じる（仕切りは開いたまま）
      const st = DV_OPEN.get(bar.T), open = !bar.allOpen;
      if (open) st.set(bar.key, true);
      AUTO_DV = AUTO_DV.filter(x => !(x.T === bar.T && x.key === bar.key));
      bar.cs.forEach(e => { OPEN.set(e, open); AUTO.delete(e); });
      paint(); return;
    }
    const v = videoOf(), dur = durOf(v), a = bar.a, z = bar.b ?? (dur > a + 1 ? dur : a + 60);
    const kids = [...cur.el.children], last = kids[bar.end];
    popMenu({ a, b: z }, b.getBoundingClientRect(), {
      play: () => window._vpDrillKit?.seek?.(a),
      more: () => window.vpSumRangeOpen?.(cur.id, { a, b: z, anchor: last, lv: 0, label: bar.label }),   // 仕切りの区間の最後に一段下げて入れる
      drill: () => window.wkDrillFromRange?.(cur.id, a, z, bar.label),
    });
  }

  // ── 再生中の所（v53.026・オーナー「要約でも、今再生中の部分がハイライト表示されるといい。ブックマークみたいに」）──
  // 決定: 見た目はブックマークの再生中（色と左の線）と同じ／自動で追いかける／閉じた見出し・仕切りは、その見出し・仕切りに色。
  // 範囲は ⋯ と同じ rangeOf（行＝その行の時刻〜次の行の時刻、見出し＝そのブックマークの区間）。くわしくの見出しは中の行のどれかが今なら。
  // 同じ区間の要約が2つあれば両方に付く（今の位置を含むものは全部）。
  // 【データ】印は別の <style>（#vp-memo-now-style）で「#vp-memo-ID > :nth-child(n)」に付けるだけ。メモの要素には何も付けない＝保存されない。
  let nowKey = '', lastUser = 0;
  function rangesOf(kids) {
    if (cur.ranges) return cur.ranges;
    const out = [];
    kids.forEach((e, i) => {
      const k = kind(e);
      if (k === 'C' || k === 'I') { const r = rangeOf({ e, k }); if (r) out.push({ i, a: r.a, b: r.b }); }
    });
    cur.ranges = out;
    return out;
  }
  function nowSync(force) {
    if (!cur || !cur.el.isConnected) return;
    const t = window._vpSumKit?.nowSec?.();
    const kids = [...cur.el.children];
    const hit = new Set();
    if (t != null && isFinite(t)) for (const r of rangesOf(kids)) if (t >= r.a - 0.25 && t < r.b - 0.25) hit.add(r.i);
    // くわしくの見出し（D）は、中の行のどれかが今なら今
    kids.forEach((e, i) => { if (kind(e) === 'D' && groupOf(kids, i).some(j => hit.has(j))) hit.add(i); });
    if (autoOpen(kids, hit)) { paint(); return; }   // 開いた所があれば描き直す（描き直しの中でもう一度ここへ来るが、今の所が同じなので何もしない）
    // 隠れている所は、それを閉じている見出し（見えているいちばん近いもの）に付け替える
    const hid = cur.hid || new Set(), show = new Set(), bars = new Set();
    hit.forEach(j => {
      if (!hid.has(j)) { show.add(j); return; }
      // 閉じた仕切り（紫の帯）の中なら、その仕切りに（帯は題が開いているときだけ出る）
      const bi = (cur.bars || []).findIndex(bar => !bar.open && j >= bar.start && j <= bar.end);
      if (bi >= 0) { bars.add(bi); return; }
      for (let i = j - 1; i >= 0; i--) {
        if (!isHead(kind(kids[i])) || hid.has(i)) continue;
        if (groupOf(kids, i).includes(j)) { show.add(i); return; }
      }
    });
    const key = [...show].sort((x, y) => x - y).join(',') + '|' + [...bars].join(',');
    if (!force && key === nowKey) return;
    const moved = key !== nowKey; nowKey = key;
    const sel = `#${CSS.escape(cur.el.id)} > :nth-child`;
    cur.nowStyle.textContent = [...show].map(j => `${sel}(${j + 1}){background:rgba(200,131,26,.13)!important;box-shadow:inset 3px 0 0 #c8831a!important;border-radius:4px}`
      + `${sel}(${j + 1}) a.ts-link{border-color:#c8831a!important;color:#c8831a!important}`).join('');
    cur.layer?.querySelectorAll('.memo-dv').forEach(d => d.classList.toggle('memo-dv-now', bars.has(+d.dataset.i)));
    if (moved && show.size) follow(kids, show);
  }
  // ── 再生に合わせて開く（v53.030）──
  // 今の所（再生位置を含むブックマークの見出し・くわしくの見出し）が変わったときだけ動く。
  // 同じ所にいる間は何もしない＝手で閉じた所は、次へ移るまで開き直さない。
  const PREF_KEY = 'wk_memoFollow', PREF_DEF = { on: false, scope: 'bm', leave: 'close' };
  const pref = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return { ...PREF_DEF, ...(p && typeof p === 'object' ? p : {}) }; } catch (_) { return { ...PREF_DEF }; } };
  const setPref = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {} };
  let AUTO = new Set(), AUTO_DV = [], autoCur = null;   // オートで開いた見出し・仕切り／前回の今の所
  function autoReset() { AUTO = new Set(); AUTO_DV = []; autoCur = null; }
  function autoOpen(kids, hit) {
    const P = pref(); if (!P.on || !cur.ready) return false;
    const now = [...hit].filter(j => { const k = kind(kids[j]); return k === 'C' || k === 'D'; }).map(j => kids[j]);
    if (autoCur && now.length === autoCur.length && now.every(e => autoCur.includes(e))) return false;
    autoCur = now;
    let changed = false;
    if (P.leave === 'close') {   // 前にオートで開いた所を閉じる（今また開くものは閉じない）
      AUTO.forEach(e => { if (!now.includes(e)) { OPEN.set(e, false); changed = true; } });
      AUTO_DV.forEach(({ T, key }) => { DV_OPEN.get(T)?.set(key, false); changed = true; });
    }
    const keep = new Set([...AUTO].filter(e => now.includes(e)));
    AUTO = keep; AUTO_DV = [];
    const openEl = e => { const k = kind(e); if (!isOpen(e, k)) { OPEN.set(e, true); AUTO.add(e); changed = true; } };
    now.forEach(e => {
      const j = kids.indexOf(e), k = kind(e);
      const bar = (cur.bars || []).find(b => j >= b.start && j <= b.end);
      if (bar) {
        if (!bar.open) { const st = DV_OPEN.get(bar.T); if (st && !AUTO_DV.some(x => x.T === bar.T && x.key === bar.key)) { st.set(bar.key, true); AUTO_DV.push({ T: bar.T, key: bar.key }); changed = true; } }
        else if (P.leave === 'close') { const st = DV_OPEN.get(bar.T); if (st && st.get(bar.key) === false && !AUTO_DV.some(x => x.T === bar.T && x.key === bar.key)) { st.set(bar.key, true); AUTO_DV.push({ T: bar.T, key: bar.key }); changed = true; } }   // 今閉じたばかりの今の仕切りは開き直す
      }
      if (P.scope === 'dv') return;
      if (k === 'C' && P.scope === 'all' && bar) bar.cs.forEach(openEl);
      else openEl(e);
    });
    return changed;
  }
  // Memo の見出しの「▶ 再生に合わせる」と ▾（要約があるときだけ）
  function renderFollow() {
    const box = cur && document.getElementById('vp-memo-follow-' + cur.id); if (!box) return;
    const has = !!cur.el.querySelector(':scope > .memo-sum-t'), P = pref(), en = window.WK_LANG?.() === 'en';
    const html = !has ? '' : `<button class="vp-memo-fol${P.on ? ' on' : ''}" data-f="toggle" title="${en ? 'Open the part being played' : '再生中の所を開く'}">▶ ${en ? 'Follow playback' : '再生に合わせる'}</button><button class="vp-memo-fol-opt" data-f="opt" title="${en ? 'How to open' : '開き方'}">▾</button>`;
    if (box.dataset.h === html) return;
    box.dataset.h = html; box.innerHTML = html;
    box.onclick = ev => {
      const b = ev.target.closest('[data-f]'); if (!b) return;
      ev.preventDefault(); ev.stopPropagation();
      if (b.dataset.f === 'toggle') { const p = pref(); p.on = !p.on; setPref(p); autoReset(); renderFollow(); nowSync(true); }
      else followMenu(b);
    };
  }
  function followMenu(btn) {
    const old = document.getElementById('memo-fol-pop'); if (old) { old.remove(); return; }
    const en = window.WK_LANG?.() === 'en', pop = document.createElement('div');
    pop.id = 'memo-fol-pop'; pop.className = 'memo-fol-pop';
    const draw = () => {
      const P = pref();
      const opt = (q, v, t, d) => `<button data-q="${q}" data-v="${v}" class="${P[q] === v ? 'on' : ''}">${t}${d ? `<small>${d}</small>` : ''}</button>`;
      pop.innerHTML = `<div class="mfp-q">${en ? 'What to open' : 'どこまで開くか'}</div><div class="mfp-list">`
        + opt('scope', 'dv', en ? 'Divider only' : '仕切りだけ', en ? 'Open the divider. Bookmarks stay closed.' : '再生中の仕切りを開く。中のブックマークは閉じたまま')
        + opt('scope', 'bm', en ? 'Current bookmark only' : '再生中のブックマークだけ', en ? 'Open just the bookmark being played.' : '再生中のブックマークを1つだけ開く')
        + opt('scope', 'all', en ? 'All bookmarks' : 'ブックマークごと', en ? 'Open the divider and every bookmark in it.' : '再生中の仕切りと、中のブックマークを全部開く')
        + `</div><div class="mfp-q">${en ? 'When playback moves on' : '再生が次へ移ったら'}</div><div class="mfp-seg">`
        + opt('leave', 'close', en ? 'Close the previous' : '前の所を閉じる') + opt('leave', 'keep', en ? 'Keep it open' : '開いたまま残す')
        + `</div><div class="mfp-n">${en ? 'Parts you opened yourself are never closed.' : '手で開いた所は、どちらでも閉じません。'}</div>`;
    };
    draw();
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    pop.addEventListener('click', e => {
      const b = e.target.closest('button[data-q]'); if (!b) return;
      const p = pref(); p[b.dataset.q] = b.dataset.v; setPref(p); draw();
      if (p.on) { autoReset(); nowSync(true); }
    });
    const off = e => { if (!e.target.closest('#memo-fol-pop') && e.target !== btn) { pop.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  }

  // 自動で追いかける: 今の所が見えなければ、メモを入れている欄をスクロールして見せる。
  // 打っている最中（メモに入力中）と、手でスクロールした直後（4秒）は動かさない。画面全体（window）は動かさない
  function follow(kids, show) {
    if (document.activeElement === cur.el || Date.now() - lastUser < 4000) return;
    const idx = [...show].sort((x, y) => x - y), target = kids[idx.find(j => kind(kids[j]) === 'I') ?? idx[0]];
    if (!target) return;
    let box = cur.el.parentElement;
    while (box && box !== document.body) { const o = getComputedStyle(box).overflowY; if ((o === 'auto' || o === 'scroll') && box.scrollHeight > box.clientHeight + 4) break; box = box.parentElement; }
    if (!box || box === document.body) return;
    const br = box.getBoundingClientRect(), tr = target.getBoundingClientRect();
    if (tr.top >= br.top + 8 && tr.bottom <= br.bottom - 8) return;   // もう見えている
    cur.following = true;
    box.scrollTop += tr.top - br.top - Math.min(120, box.clientHeight / 3);
    setTimeout(() => { if (cur) cur.following = false; }, 300);
  }
  // 手でスクロールしたら、しばらく追いかけない（どこでスクロールしても拾えるよう、捕まえる段階で見る。登録は1回だけ）
  ['wheel', 'touchmove'].forEach(ev => document.addEventListener(ev, () => { lastUser = Date.now(); }, { passive: true, capture: true }));
  window.wkMemoSumNow = () => nowSync(false);

  // 押した場所: 見出しの左の ▾（28px）／見出し・行の右の ⋯（28px）
  function zone(ev) {
    const host = cur?.el; if (!host) return null;
    let e = ev.target; while (e && e.parentElement !== host) e = e.parentElement;
    if (!e) return null;
    const k = kind(e), r = e.getBoundingClientRect(), x = ev.clientX;
    if (isHead(k) && x - r.left < 28) return { e, k, act: 'fold' };
    if ((k === 'C' || k === 'I') && r.right - x < 28) return { e, k, act: 'menu' };
    return null;
  }

  // 範囲: 見出し＝そのブックマークの区間（ドリルの bm と同じ決まり）／行＝その行の時刻〜次の行の時刻（無ければ次のブックマーク・動画の終わり）
  function rangeOf(z) {
    const id = cur.id, v = (window.videos || []).find(x => x.id === id); if (!v) return null;
    const a = secOf(z.e); if (a == null) return null;
    const toS = t => typeof t === 'number' ? t : String(t ?? '').split(':').map(Number).reduce((p, q) => p * 60 + (q || 0), 0);
    const bms = (v.bookmarks || []).map((b, i) => ({ i, t: toS(b.time), end: b.endTime != null ? toS(b.endTime) : null, label: b.label || '' })).sort((x, y) => x.t - y.t);
    const dur = window._vpDrillKit?.duration?.(id) || Number(v.duration) || 0;
    const nextBm = t => { const n = bms.find(b => b.t > t + 0.5); return n ? n.t : (dur > t + 1 ? dur : t + 60); };
    if (z.k === 'C') {
      const name = (z.e.textContent || '').replace(/^\s*\d+\s*/, '').replace(/▶\s*[\d:]+\s*$/, '').trim();
      const bm = bms.filter(b => Math.abs(b.t - a) < 1).sort((x, y) => (y.label === name) - (x.label === name))[0];
      const b = bm ? (bm.end != null && bm.end > bm.t ? bm.end : nextBm(bm.t)) : nextBm(a);
      return { a, b, bmIdx: bm ? bm.i : null, label: name, lv: 0 };
    }
    const n = lvOf(z.e); let b = null;
    for (let x = z.e.nextElementSibling; x; x = x.nextElementSibling) {
      const t = kind(x);
      if (t === 'I' && lvOf(x) === n) { const s = secOf(x); if (s != null && s > a) { b = s; break; } continue; }
      if (t === 'I' || (t === 'D' && lvOf(x) > n)) continue;
      break;
    }
    if (b == null) b = nextBm(a);
    const head = (() => { for (let x = z.e.previousElementSibling; x; x = x.previousElementSibling) { const t = kind(x); if (t === 'C' || t === 'T') return x; } return null; })();
    const txt = (z.e.textContent || '').replace(/^\s*▶\s*[\d:]+\s*/, '').trim();
    return { a, b, label: txt.length > 24 ? txt.slice(0, 24) + '…' : txt, lv: n, head };
  }

  function menu(z) {
    const r = rangeOf(z); if (!r) { window.toast?.('この行には時刻がありません'); return; }
    const id = cur.id;
    popMenu(r, z.e.getBoundingClientRect(), {
      play: () => z.e.querySelector('a.ts-link')?.click(),   // 行の ▶時刻 を押したのと同じ
      more: () => window.vpSumRangeOpen?.(id, { a: r.a, b: r.b, anchor: z.e, lv: r.lv, label: r.label }),
      drill: btn => {
        if (z.k === 'C' && r.bmIdx != null) window.wkDrillFromBm?.(id, r.bmIdx, btn && btn.isConnected ? btn : z.e);   // ブックマークの行の DRILL と同じ
        else window.wkDrillFromRange?.(id, r.a, r.b);
      },
    });
  }
  function popMenu(r, er, act) {
    document.getElementById('memo-act-pop')?.remove();
    const fmt = fmtT, pop = document.createElement('div');
    pop.id = 'memo-act-pop'; pop.className = 'memo-act-pop';
    pop.innerHTML = `<button data-a="play">▶ ここから再生<small>${fmt(r.a)}</small></button>
      <button data-a="more">🔍 さらにくわしく<small>${fmt(r.a)}–${fmt(r.b)}</small></button>
      <button data-a="drill"><span class="drl-pill">DRILL</span> ドリルにする<small>${fmt(r.a)}–${fmt(r.b)}</small></button>`;
    document.body.appendChild(pop);
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(er.right - w, window.innerWidth - w - 8)) + 'px';
    const top = er.top + Math.min(er.height, 28) + 2;
    pop.style.top = (top + h > window.innerHeight - 8 ? Math.max(8, er.top - h - 2) : top) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', off, true); };
    const off = e => { if (!e.target.closest('#memo-act-pop')) close(); };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    pop.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a; close();
      act[a]?.(b);
    });
  }

  function onDown(ev) { if (zone(ev)) ev.preventDefault(); }   // 押しても文字の入力に入らない（ts-link と同じ）
  function onClick(ev) {
    const z = zone(ev); if (!z) return;
    ev.preventDefault(); ev.stopPropagation();
    if (document.activeElement === cur.el) { try { cur.el.blur(); } catch (_) {} }
    if (z.act === 'fold') { OPEN.set(z.e, !isOpen(z.e, z.k)); AUTO.delete(z.e); paint(); }   // 手で触った所は、オートが閉じない
    else menu(z);
  }

  // 動画パネルがメモを描くたびに呼ぶ（vpanel.js の _initMemoEditor の直後）
  window.wkMemoSumUi = function (id) {
    const el = document.getElementById('vp-memo-' + id); if (!el || !el.isContentEditable) return;
    if (cur?.el === el) { paint(); return; }
    cur?.mo?.disconnect(); cur?.ro?.disconnect(); cur?.style?.remove(); cur?.layer?.remove(); cur?.nowStyle?.remove();
    document.getElementById('memo-act-pop')?.remove();
    const style = document.createElement('style'); style.id = 'vp-memo-fold-style';
    document.head.appendChild(style);
    // 仕切りの帯を重ねる層（メモ欄の外・同じ行の中。メモと一緒にスクロールする）
    const row = el.parentElement, layer = document.createElement('div');
    layer.className = 'memo-dv-layer';
    if (row && getComputedStyle(row).position === 'static') row.style.position = 'relative';
    row?.appendChild(layer);
    layer.addEventListener('click', onBar);
    const nowStyle = document.createElement('style'); nowStyle.id = 'vp-memo-now-style';
    document.head.appendChild(nowStyle);
    cur = { id, el, style, layer, nowStyle, ready: false };
    autoReset(); document.getElementById('memo-fol-pop')?.remove();
    nowKey = '';

    el.classList.add('vp-memo-sumui');
    el.addEventListener('mousedown', onDown, true);
    el.addEventListener('click', onClick, true);
    let raf = 0;
    cur.mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); });
    cur.mo.observe(el, { childList: true });
    // 文字を打つ・画像が読み込まれる・幅が変わると見出しの位置が動くので、帯を置き直す
    let lastH = -1, lastW = -1;
    cur.ro = new ResizeObserver(() => { if (el.offsetHeight === lastH && el.offsetWidth === lastW) return; lastH = el.offsetHeight; lastW = el.offsetWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); });
    cur.ro.observe(el);
    paint(); cur.ready = true;
  };
  // 全部開く／全部閉じる（検査・将来のボタン用）
  // 仕切りを直したとき（ブックマーク欄）に帯を描き直す
  window.wkMemoSumRepaint = () => { if (cur) paint(); };
  window.wkMemoSumFoldAll = function (open) {
    if (!cur) return;
    [...cur.el.children].forEach(e => { const k = kind(e); if (isHead(k) && k !== 'T') OPEN.set(e, !!open); });
    paint();
    (cur.bars || []).forEach(b => DV_OPEN.get(b.T)?.set(b.key, !!open));   // 仕切りも（v53.030 から最初は閉じている）
    paint();
  };
})();
