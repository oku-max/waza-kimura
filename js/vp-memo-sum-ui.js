// ═══ メモの要約: 開閉・⋯（さらにくわしく／ドリルにする）（v53.001・オーナー決定 mock-memo-actions.html） ═══
// 決定: ① 呼び出しは行の右の「⋯」（A） ② くわしくはその行のすぐ下（X） ③ 見出しは最初は閉じている
//   ・✨要約 がメモに入れた見出し（.memo-sum-ch＝ブックマーク／.memo-sum-dh＝くわしく）と一番上の題（.memo-sum-t）の左の ▾ で開閉
//   ・見出し・行（.memo-sum-it）の右の ⋯ で「▶ ここから再生／🔍 さらにくわしく／DRILL ドリルにする」
//       さらにくわしく … 今の「✨ 要約」の窓を、範囲を入れた「時刻を指定」で開く（vpSumRangeOpen の opts）。できたものはその行のすぐ下
//       ドリルにする   … 見出しはブックマークの行の DRILL と同じ（wkDrillFromBm）。行は 行の時刻〜次の行の時刻 で今のドリルのカード
//
// 【データ】このファイルはメモの中身（v.memo・メモ欄の DOM）を1文字も変えない。
//   ▾ と ⋯ は CSS の ::before / ::after で描き、開閉は「#vp-memo-ID > :nth-child(n) を隠す」<style> を作って効かせる。
//   メモ欄の要素にクラスや属性を付けないので、vpSaveMemo が保存する innerHTML に開閉の状態が混ざらない。
//   開閉の状態は画面の中だけ（WeakMap。開き直すと最初の形＝見出しは閉じている）。
(() => {
  const OPEN = new WeakMap();   // 見出しの要素 → 開いているか
  const SEEN = new WeakSet();   // 最初に見た見出し（これより後に現れた見出し＝今入った要約・くわしく は開いて出す）
  let cur = null;               // { id, el, mo, style }

  const kind = e => e.classList.contains('memo-sum-t') ? 'T' : e.classList.contains('memo-sum-ch') ? 'C'
    : e.classList.contains('memo-sum-dh') ? 'D' : e.classList.contains('memo-sum-it') ? 'I' : 'O';
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
      else if (k === 'C') { if (t !== 'I' && t !== 'D') break; }
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
      if (!SEEN.has(e)) { SEEN.add(e); if (cur.ready && !OPEN.has(e)) OPEN.set(e, true); }
      if (isOpen(e, k)) return;
      const grp = groupOf(kids, i); grp.forEach(j => hid.add(j));
      const n = itemsCount(kids, i, grp);
      css += `${sel}(${i + 1})::before{content:'▸'}`;
      const cnt = n ? (window.WK_LANG?.() === 'en' ? `${n} items` : `${n}件`) : '';
      css += `${sel}(${i + 1})::after{content:'${cnt}${k === 'C' ? '　⋯' : ''}'}`;
    });
    if (hid.size) css += [...hid].map(j => `${sel}(${j + 1})`).join(',') + '{display:none!important}';
    cur.style.textContent = css;
  }

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
    document.getElementById('memo-act-pop')?.remove();
    const r = rangeOf(z); if (!r) { window.toast?.('この行には時刻がありません'); return; }
    const fmt = s => window._vpSumKit?.fmtSec?.(Math.floor(s)) || String(s);
    const id = cur.id, pop = document.createElement('div');
    pop.id = 'memo-act-pop'; pop.className = 'memo-act-pop';
    pop.innerHTML = `<button data-a="play">▶ ここから再生<small>${fmt(r.a)}</small></button>
      <button data-a="more">🔍 さらにくわしく<small>${fmt(r.a)}–${fmt(r.b)}</small></button>
      <button data-a="drill"><span class="drl-pill">DRILL</span> ドリルにする<small>${fmt(r.a)}–${fmt(r.b)}</small></button>`;
    document.body.appendChild(pop);
    const er = z.e.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(er.right - w, window.innerWidth - w - 8)) + 'px';
    const top = er.top + Math.min(er.height, 28) + 2;
    pop.style.top = (top + h > window.innerHeight - 8 ? Math.max(8, er.top - h - 2) : top) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', off, true); };
    const off = e => { if (!e.target.closest('#memo-act-pop')) close(); };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    pop.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a; close();
      if (a === 'play') z.e.querySelector('a.ts-link')?.click();   // 行の ▶時刻 を押したのと同じ
      else if (a === 'more') window.vpSumRangeOpen?.(id, { a: r.a, b: r.b, anchor: z.e, lv: r.lv, label: r.label });
      else if (a === 'drill') {
        if (z.k === 'C' && r.bmIdx != null) window.wkDrillFromBm?.(id, r.bmIdx, b.isConnected ? b : z.e);   // ブックマークの行の DRILL と同じ
        else window.wkDrillFromRange?.(id, r.a, r.b);
      }
    });
  }

  function onDown(ev) { if (zone(ev)) ev.preventDefault(); }   // 押しても文字の入力に入らない（ts-link と同じ）
  function onClick(ev) {
    const z = zone(ev); if (!z) return;
    ev.preventDefault(); ev.stopPropagation();
    if (document.activeElement === cur.el) { try { cur.el.blur(); } catch (_) {} }
    if (z.act === 'fold') { OPEN.set(z.e, !isOpen(z.e, z.k)); paint(); }
    else menu(z);
  }

  // 動画パネルがメモを描くたびに呼ぶ（vpanel.js の _initMemoEditor の直後）
  window.wkMemoSumUi = function (id) {
    const el = document.getElementById('vp-memo-' + id); if (!el || !el.isContentEditable) return;
    if (cur?.el === el) { paint(); return; }
    cur?.mo?.disconnect(); cur?.style?.remove();
    document.getElementById('memo-act-pop')?.remove();
    const style = document.createElement('style'); style.id = 'vp-memo-fold-style';
    document.head.appendChild(style);
    cur = { id, el, style, ready: false };
    el.classList.add('vp-memo-sumui');
    el.addEventListener('mousedown', onDown, true);
    el.addEventListener('click', onClick, true);
    let raf = 0;
    cur.mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); });
    cur.mo.observe(el, { childList: true });
    paint(); cur.ready = true;
  };
  // 全部開く／全部閉じる（検査・将来のボタン用）
  window.wkMemoSumFoldAll = function (open) {
    if (!cur) return;
    [...cur.el.children].forEach(e => { const k = kind(e); if (isHead(k) && k !== 'T') OPEN.set(e, !!open); });
    paint();
  };
})();
