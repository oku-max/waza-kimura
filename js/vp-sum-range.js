// ═══ 部分だけの要約（v52.987・オーナー決定 mock-sum-real.html / mock-sum-design.html） ═══
// 動画パネルのブックマークの見出しの「✨ 要約」から開く。
//   範囲: 仕切り・ブックマーク（どちらも何個でも選べる・隣り合うものはつなぐ）／★の所／時刻を指定
//   項目の数・写真の数: おまかせ（約1分に1項目）・5・10・20・自分で決める（1〜30）。何分ごとになるかを見せる
//   元は字幕だけ（/api/ai-summary source:'rangesum'）。範囲の字幕の行だけを送る。動画は送らない
//   写真は Drive の動画だけ。再生中の動画は動かさず、見えない <video> で撮る。YouTube は文章だけ
//   結果はメモの最後に足す（今のメモは消さない）。写真はスナップショットに入り、その写真のメモに解説文を入れる
//
// 【データ】書くのは2つだけ。どちらも「足すだけ」:
//   ・v.memo … メモ欄の最後に要約の HTML を足して、いつもの vpSaveMemo で保存（_vpSumKit.appendMemo）
//   ・スナップショット … window.snapAddBlob で写真を足す（メモ欄の 📸 と同じ道）
//   範囲・項目の数などの選び方は画面の中だけ（保存しない）。AI に送るのは範囲の字幕の文字だけ。
(() => {
  const K = () => window._vpSumKit || {};
  const fmt = s => (K().fmtSec ? K().fmtSec(Math.max(0, Math.floor(s))) : String(Math.floor(s)));
  const parse = str => { const z = String(str).trim().replace(/[０-９：]/g, c => c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(z)) return null; const p = z.split(':').map(Number); if (p.slice(1).some(x => x > 59)) return null;
    return p.reduce((a, b) => a * 60 + b, 0); };
  const toSec = t => typeof t === 'number' ? t : (parse(t) ?? (Number(t) || 0));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => String(v).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const every = s0 => { const s = s0 < 60 ? Math.max(5, Math.round(s0 / 5) * 5) : Math.round(s0 / 10) * 10; if (s < 60) return `約${s}秒`;
    const m = Math.floor(s / 60), r = s % 60; return r && s < 600 ? `約${m}分${r}秒` : `約${Math.round(s / 60)}分`; };
  const lenTxt = s => s < 60 ? Math.round(s) + '秒' : Math.round(s / 60) + '分';
  const ITEM_MAX = 30;

  // ── 状態（画面の中だけ。動画ごとに選び直す） ──
  let vid = null, mode = 'div', selDiv = new Set(), selBm = new Set(), starMin = 1, tA = null, tB = null;
  let nItems = 0, nShots = 5, ownI = '', ownS = '', phase = 'pick', cancelTok = 0, ov = null, nowTimer = null, noAuth = '';

  const data = () => {
    const v = (window.videos || []).find(x => x.id === vid) || null;
    const dur = Number(v?.duration) || K().gdDuration?.() || 0;
    const bms = (v?.bookmarks || []).map(b => ({ t: toSec(b.time), label: b.label || '', star: b.star === true ? 1 : (Number(b.star) || 0) })).sort((a, b) => a.t - b.t);
    const divs = (v?.bmDividers || []).map(d => ({ t: toSec(d.time), label: d.label || '' })).sort((a, b) => a.t - b.t);
    return { v, dur, bms, divs };
  };
  const endOf = (D, arr, k) => k + 1 < arr.length ? arr[k + 1].t : (D.dur || arr[k].t + 60);
  function ranges(D) {
    if (mode === 'div' || mode === 'bm') {   // 何個でも選べる。隣り合うものは1つの範囲につなぐ
      const arr = mode === 'div' ? D.divs : D.bms, sel = mode === 'div' ? selDiv : selBm, out = [];
      for (const k of [...sel].filter(k => arr[k]).sort((a, b) => a - b)) {
        const r = { a: arr[k].t, b: endOf(D, arr, k), labels: [arr[k].label].filter(Boolean) }, last = out[out.length - 1];
        if (last && r.a <= last.b) { last.b = Math.max(last.b, r.b); last.labels.push(...r.labels); } else out.push(r);
      }
      return out;
    }
    if (mode === 'star') return D.bms.map((b, k) => ({ b, k })).filter(x => x.b.star >= starMin).map(x => ({ a: x.b.t, b: endOf(D, D.bms, x.k), labels: [x.b.label] }));
    return tA != null && tB != null && tB > tA ? [{ a: tA, b: tB, labels: [] }] : [];
  }

  window.vpSumRangeOpen = function (id) {
    if (!window._vpSumKit) { window.toast?.('動画パネルを開き直してください'); return; }
    if (vid !== id) { vid = id; selDiv = new Set(); selBm = new Set(); tA = tB = null; }
    const D = data();
    if (!selDiv.size && !selBm.size) { if (D.divs.length) { mode = 'div'; selDiv.add(0); } else if (D.bms.length) { mode = 'bm'; selBm.add(0); } else mode = 'time'; }
    phase = 'pick';
    ov?.remove();
    ov = document.createElement('div'); ov.className = 'vsr-ov'; ov.id = 'vsr-ov'; ov.innerHTML = '<div class="vsr-sh" role="dialog" aria-label="要約"></div>';
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov && phase !== 'busy') close(); };
    clearInterval(nowTimer);
    nowTimer = setInterval(() => { if (!ov) return clearInterval(nowTimer); if (mode !== 'time' || phase !== 'pick') return;
      const n = ov.querySelector('.vsr-tl .now'), l = ov.querySelector('.vsr-nowlbl'), D2 = data(), s = K().nowSec?.();
      if (n && D2.dur && s != null) n.style.left = (s / D2.dur * 100) + '%'; if (l && s != null) l.textContent = '赤い線＝今の位置 ' + fmt(s); }, 500);
    render();
  };
  const close = () => { cancelTok++; clearInterval(nowTimer); ov?.remove(); ov = null; };

  const TABS = [['div', '仕切り'], ['bm', 'ブックマーク'], ['star', '★の所'], ['time', '時刻を指定']];
  function render() {
    if (!ov) return;
    const D = data(), sh = ov.querySelector('.vsr-sh'), isGd = !!K().isGdPlaying?.();
    let h = `<div class="vsr-hd"><b>✨ 要約</b><div class="sub">選んだ部分の字幕だけを AI に送って要約し、メモの最後に入れます。</div>
      <div class="vsr-tabs">${TABS.map(([k, l]) => `<button class="${k === mode ? 'on' : ''}" data-tab="${k}" ${phase !== 'pick' ? 'disabled' : ''}>${l}</button>`).join('')}</div></div><div class="vsr-bd">`;
    if (phase === 'busy') { sh.innerHTML = h + `<div class="vsr-busy" id="vsr-busy">準備しています…</div></div><div class="vsr-ft"><button class="vsr-cancel" data-act="stop">やめる（結果を受け取らない）</button></div>`; bind(); return; }
    // ログインしていない・Drive の認証が切れていると字幕を読めない。そのときは「字幕が無い」ではなく、ログインを案内する
    if (phase === 'noauth') { const gd = noAuth === 'drive';
      sh.innerHTML = h + `<div class="vsr-warn">${gd ? 'Google ドライブの認証が切れているため、動画も字幕も読み込めていません。Google にログインして動画を再生してから、もう一度「✨ 要約」を押してください。'
          : 'ログインしていないため、字幕を読めません。Google でログインしてから、もう一度「✨ 要約」を押してください。'}</div></div>
      <div class="vsr-ft">${gd && document.getElementById('gd-auth-play-btn') ? '<button class="vsr-go" data-act="gdauth">Google にログインして再生</button>' : ''}<button class="vsr-cancel" data-act="${gd && document.getElementById('gd-auth-play-btn') ? 'back' : 'close'}">${gd && document.getElementById('gd-auth-play-btn') ? '戻る' : '閉じる'}</button></div>`; bind(); return; }
    if (phase === 'nosub') { sh.innerHTML = h + `<div class="vsr-warn">この動画には字幕がありません。要約は字幕から作るので、先に「💬 字幕生成」で字幕を作ってください。</div></div>
      <div class="vsr-ft"><button class="vsr-go" data-act="mksub">💬 字幕生成を開く</button><button class="vsr-cancel" data-act="back">戻る</button></div>`; bind(); return; }
    const allRow = sel => `<div class="vsr-allrow"><span>${sel.size ? `${sel.size}個を選んでいます` : 'チェックで何個でも選べます'}</span><span><button data-all="1">全部選ぶ</button> <button data-all="0">全部外す</button></span></div>`;
    if (mode === 'div') h += D.divs.length ? allRow(selDiv) + D.divs.map((d, k) => `<button class="vsr-pick ${selDiv.has(k) ? 'on' : ''}" data-div="${k}"><span class="cb"></span><span class="pn">${esc(d.label)}</span><span class="pm">${fmt(d.t)}–${fmt(endOf(D, D.divs, k))}</span></button>`).join('')
      : '<div class="vsr-hint">この動画には仕切りがありません。</div>';
    else if (mode === 'bm') h += D.bms.length ? allRow(selBm) + D.bms.map((b, k) => `<button class="vsr-pick ${selBm.has(k) ? 'on' : ''}" data-bm="${k}"><span class="cb"></span><span class="pn">${fmt(b.t)}　${esc(b.label)}</span><span class="st">${b.star ? '★'.repeat(Math.min(3, b.star)) : ''}</span><span class="pm">〜${fmt(endOf(D, D.bms, k))}</span></button>`).join('')
      : '<div class="vsr-hint">この動画にはブックマークがありません。</div>';
    else if (mode === 'star') { h += '<div class="vsr-hint">星の付いたブックマーク（次のブックマークまで）を、まとめて1つの要約にします。</div><div class="vsr-chips">' + [[1, '★1以上'], [2, '★2以上'], [3, '★3']].map(([m, l]) => `<button class="${m === starMin ? 'on' : ''}" data-min="${m}">${l}</button>`).join('') + '</div>';
      const rs = ranges(D); h += rs.length ? rs.map(r => `<div class="vsr-pick on" style="cursor:default"><span class="pn">${fmt(r.a)}　${esc(r.labels[0] || '')}</span><span class="pm">〜${fmt(r.b)}</span></div>`).join('') : '<div class="vsr-hint">この数の星が付いたブックマークはありません</div>'; }
    else { h += '<div class="vsr-hint">数字で打つ（12:30 のように）か、動画を止めた所で「今の位置」を押します。±ボタンは入っている時刻から（空なら今の位置から）ずらします。</div>';
      const row = (k, lbl, val) => `<label>${lbl}</label><div class="f"><input id="vsr-in${k}" inputmode="numeric" placeholder="0:00" value="${val == null ? '' : fmt(val)}"><button class="vsr-sb" data-now="${k}">今の位置</button></div>
        <span></span><div class="vsr-nud">${[[-60, '−1分'], [-30, '−30秒'], [-10, '−10秒'], [-5, '−5秒'], [5, '＋5秒'], [10, '＋10秒'], [30, '＋30秒'], [60, '＋1分']].map(([d, l]) => `<button class="vsr-sb" data-nudge="${k}" data-d="${d}">${l}</button>`).join('')}</div>`;
      h += '<div class="vsr-tm">' + row('A', '開始', tA) + row('B', '終了', tB) + '</div>';
      if (tA != null && tB != null && tB <= tA) h += '<div class="vsr-hint" style="color:var(--red)">終了は開始より後にしてください</div>'; }
    h += '</div><div class="vsr-ft">';
    const rs = ranges(D), tot = rs.reduce((s, r) => s + r.b - r.a, 0);
    const auto = Math.max(1, Math.min(ITEM_MAX, Math.round(tot / 60))), items = nItems || auto, shots = isGd ? Math.min(nShots, items) : 0;
    h += rs.length ? `<div class="vsr-sum">範囲: <b>${rs.length > 1 ? `${rs.length}か所・` : `${fmt(rs[0].a)}–${fmt(rs[0].b)}・`}合計 ${lenTxt(tot)}</b></div>` : '<div class="vsr-sum" style="color:var(--text3)">範囲を選んでください</div>';
    // バー: 動画全体の上に、選んだ範囲・項目の位置（|）・写真の目安（📷）・時刻を指定のときは今の位置
    if (D.dur) {
      const posAt = x => { for (const r of rs) { if (x < r.b - r.a) return r.a + x; x -= r.b - r.a; } return null; };
      const ticks = rs.length ? Array.from({ length: items }, (_, k) => posAt(tot * (k + .5) / items)).filter(t => t != null) : [];
      const cams = shots && ticks.length ? Array.from({ length: shots }, (_, k) => ticks[Math.floor(k * ticks.length / shots)]) : [];
      const now = K().nowSec?.();
      h += `<div class="vsr-tl">${rs.map(r => `<div class="seg" style="left:${r.a / D.dur * 100}%;width:${(r.b - r.a) / D.dur * 100}%"></div>`).join('')}${ticks.map(t => `<div class="tick" style="left:${t / D.dur * 100}%"></div>`).join('')}${cams.map(t => `<div class="cam" style="left:${t / D.dur * 100}%">📷</div>`).join('')}${mode === 'time' && now != null ? `<div class="now" style="left:${now / D.dur * 100}%"></div>` : ''}</div>
        <div class="vsr-tll"><span>0:00</span>${mode === 'time' ? `<span class="vsr-nowlbl">赤い線＝今の位置 ${fmt(now || 0)}</span>` : ''}<span>動画全体 ${fmt(D.dur)}</span></div>`;
    }
    const per = n => rs.length ? every(tot / n) + 'ごと' : '—';
    const IL = [[0, 'おまかせ'], [5, '5'], [10, '10'], [20, '20']], SL = [[0, 'なし'], [5, '5'], [10, '10'], [20, '20']];   // 写真も項目と同じ数
    h += `<div class="vsr-grp">項目の数<span>${rs.length ? `${items}項目 · 選んだ ${lenTxt(tot)}を${every(tot / items)}ごと` : ''}</span></div>
      <div class="vsr-opts">${IL.map(([v, l]) => `<button class="vsr-o ${nItems === v && !ownI ? 'on' : ''}" data-ni="${v}"><b>${v ? `${l}項目` : l}</b><small>${v ? per(v) : (rs.length ? `${auto}項目 · ${per(auto)}` : '約1分ごと')}</small></button>`).join('')}</div>
      <div class="vsr-own">自分で決める <input id="vsr-ni" inputmode="numeric" placeholder="数" value="${esc(ownI)}" class="${ownI ? 'on' : ''}"> 項目 <span class="h">${ownI && nItems ? per(nItems) : `1〜${ITEM_MAX}`}</span></div>`;
    if (!isGd) h += `<div class="vsr-grp">写真の数</div><div class="vsr-hint" style="margin:0">YouTubeの動画は画面を撮れないので、文章だけになります</div>`;
    else { const sper = n => !n ? '写真なし' : n > items ? '項目より多くは不可' : rs.length ? every(tot / n) + 'に1枚' : '—';
      h += `<div class="vsr-grp">写真の数<span>${rs.length ? (shots ? `${shots}枚 · ${every(tot / shots)}に1枚` : '写真なし') : ''}</span></div>
      <div class="vsr-opts">${SL.map(([v, l]) => `<button class="vsr-o ${nShots === v && !ownS ? 'on' : ''}" data-ns="${v}" ${v > items ? 'disabled' : ''}><b>${v ? `${l}枚` : l}</b><small>${sper(v)}</small></button>`).join('')}</div>
      <div class="vsr-own">自分で決める <input id="vsr-ns" inputmode="numeric" placeholder="数" value="${esc(ownS)}" class="${ownS ? 'on' : ''}"> 枚 <span class="h">${ownS && nShots ? sper(nShots) : '項目の数まで'}</span></div>
      <div class="vsr-hint" style="margin:4px 0 0">どの項目に写真を付けるかは AI が選びます（バーの 📷 は目安の位置）。</div>`; }
    h += `<button class="vsr-go" data-act="go" ${rs.length ? '' : 'disabled'}>AIで要約してメモに入れる</button><button class="vsr-cancel" data-act="close">キャンセル</button></div>`;
    sh.innerHTML = h; bind();
  }

  function bind() {
    const q = (s, f) => ov.querySelectorAll(s).forEach(f);
    const keep = f => { const sh = ov.querySelector('.vsr-sh'), y = sh.scrollTop; f(); render(); ov.querySelector('.vsr-sh').scrollTop = y; };
    q('[data-tab]', b => b.onclick = () => keep(() => { mode = b.dataset.tab; }));
    q('[data-div]', b => b.onclick = () => keep(() => { const k = +b.dataset.div; selDiv.has(k) ? selDiv.delete(k) : selDiv.add(k); }));
    q('[data-bm]', b => b.onclick = () => keep(() => { const k = +b.dataset.bm; selBm.has(k) ? selBm.delete(k) : selBm.add(k); }));
    q('[data-all]', b => b.onclick = () => keep(() => { const D = data(), sel = mode === 'div' ? selDiv : selBm, arr = mode === 'div' ? D.divs : D.bms; if (+b.dataset.all) arr.forEach((_, k) => sel.add(k)); else sel.clear(); }));
    q('[data-min]', b => b.onclick = () => keep(() => { starMin = +b.dataset.min; }));
    q('[data-ni]', b => b.onclick = () => keep(() => { nItems = +b.dataset.ni; ownI = ''; }));
    q('[data-ns]', b => b.onclick = () => { if (b.disabled) return; keep(() => { nShots = +b.dataset.ns; ownS = ''; }); });
    q('[data-now]', b => b.onclick = () => keep(() => { const s = K().nowSec?.(); if (s == null) { window.toast?.('動画を再生してから押してください'); return; } if (b.dataset.now === 'A') tA = s; else tB = s; }));
    q('[data-nudge]', b => b.onclick = () => keep(() => { const D = data(), d = +b.dataset.d, lim = x => Math.max(0, D.dur ? Math.min(D.dur, x) : x), base = K().nowSec?.() || 0;
      if (b.dataset.nudge === 'A') tA = lim((tA ?? base) + d); else tB = lim((tB ?? base) + d); }));
    ['A', 'B'].forEach(k => { const el = ov.querySelector('#vsr-in' + k); if (!el) return;
      el.onchange = () => { const s = el.value.trim(), v = s === '' ? null : parse(s), D = data();
        if (s !== '' && (v == null || (D.dur && v > D.dur))) { el.classList.add('bad'); return; } keep(() => { if (k === 'A') tA = v; else tB = v; }); };
      el.onkeydown = e => { if (e.key === 'Enter') el.onchange(); }; });
    // 自分で決める: 打つそばから「何分ごと」とバーが変わる（範囲の外の数は赤くするだけで選ばない）
    [['vsr-ni', (v, s) => { ownI = s; nItems = v || 0; }], ['vsr-ns', (v, s) => { ownS = s; nShots = v || 5; }]].forEach(([id, set]) => {
      const el = ov.querySelector('#' + id); if (!el) return;
      el.oninput = () => { const s = el.value, z = num(s), v = +z;
        if (z === '') set(0, ''); else if (/^\d+$/.test(z) && v >= 1 && v <= ITEM_MAX) set(v, s); else { el.style.borderColor = 'var(--red)'; return; }
        const pos = el.selectionStart; keep(() => {}); const e2 = ov.querySelector('#' + id); if (e2) { e2.focus(); try { e2.setSelectionRange(pos, pos); } catch (_) {} } }; });
    q('[data-act]', b => b.onclick = () => { const a = b.dataset.act;
      if (a === 'close') close();
      else if (a === 'stop') { cancelTok++; phase = 'pick'; render(); window.toast?.('やめました（AIへの依頼は止まらないので、料金はかかることがあります）'); }
      else if (a === 'back') { phase = 'pick'; render(); }
      else if (a === 'gdauth') { const btn = document.getElementById('gd-auth-play-btn'); close(); btn?.click(); }   // 動画の所の「Googleで認証して再生」を押したのと同じ
      else if (a === 'mksub') { const id = vid; close(); window.vpGenSubtitle?.(id); }
      else if (a === 'go') run(); });
  }

  // ── 写真: 見えない <video> で項目の時刻の絵を撮り、スナップショットに入れる（その写真のメモ＝解説文） ──
  async function shoot(id, list, setMsg, tok) {
    const out = {}; if (!list.length || !window.snapAddBlob) return out;
    setMsg('写真の準備をしています…');
    const v = await K().openShotVideo?.(); if (!v) { out.__err = '動画を開けませんでした'; return out; }
    let prev = null;
    try {
      for (let k = 0; k < list.length; k++) {
        if (tok !== cancelTok) break;
        setMsg(`写真を撮っています… ${k + 1}/${list.length}`);
        const { t, text } = list[k];
        let cap = await K().capture(t, v);
        for (let n = 1; cap && prev && cap.sig && K().sigDiff(cap.sig, prev) < 5 && n <= 2; n++) { const c2 = await K().capture(t + 0.7 * n, v); if (!c2) break; cap = c2; }  // 直前とほぼ同じ絵なら少しずらす
        if (cap?.fullBlob) { const snapId = await window.snapAddBlob(id, cap.fullBlob, t, text); out[t] = { snapId, url: cap.thumbDataUrl }; prev = cap.sig || prev; }
      }
    } catch (e) { out.__err = e?.message || String(e); }
    try { v.removeAttribute('src'); v.load(); v.remove(); } catch (_) {}
    return out;
  }

  async function run() {
    const id = vid, D = data(), rs = ranges(D); if (!rs.length || !D.v) return;
    const sub = K().cues?.() || { cues: [] };
    if (!sub.cues.length) {
      // 字幕が読めない理由を先に見分ける: ログインしていない／Drive の動画が認証待ちで再生されていない／本当に字幕が無い
      if (!window._firebaseCurrentUser?.()) { noAuth = 'login'; phase = 'noauth'; render(); return; }
      if (String(D.v.pt || '') === 'gdrive' && !K().isGdPlaying?.()) { noAuth = 'drive'; phase = 'noauth'; render(); return; }
      phase = 'nosub'; render(); return;
    }
    const inR = t => rs.some(r => t >= r.a - 1 && t < r.b);
    const cues = sub.cues.filter(c => inR(c.start)).map(c => ({ t: c.start, text: c.text }));
    if (!cues.length) { window.toast?.('選んだ範囲に字幕の行がありません'); return; }
    const tok = ++cancelTok; phase = 'busy'; render();
    const setMsg = m => { const el = ov?.querySelector('#vsr-busy'); if (el) el.textContent = m; };
    const isGd = !!K().isGdPlaying?.(), wantShots = isGd ? nShots : 0;
    const names = rs.flatMap(r => r.labels).filter(Boolean).join('・');
    const label = mode === 'star' ? `★${starMin === 3 ? 3 : starMin + '以上'}の所` : (names.length > 60 ? names.slice(0, 60) + '…' : names);
    setMsg(`AIが要約しています…（字幕 ${cues.length}行）`);
    let items = [], err = '';
    try {
      const user = window._firebaseCurrentUser?.(); if (!user) throw new Error('ログインが必要です');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/ai-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, source: 'rangesum', cues, items: nItems, shots: wantShots, label, title: D.v.title || '', channel: D.v.channel || '', playlist: D.v.playlist || '' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ? (j.error + (j.detail ? ': ' + j.detail : '')) : 'HTTP ' + res.status);
      const obj = JSON.parse(String(j.summary || '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
      items = (obj.items || []).map(x => ({ t: parse(x.t), text: String(x.text || '').trim(), shot: !!x.shot })).filter(x => x.t != null && x.text).sort((a, b) => a.t - b.t);
      if (!items.length) throw new Error('AIの返事に項目がありませんでした');
    } catch (e) { err = e?.message || String(e); }
    if (tok !== cancelTok) return;
    if (err) { phase = 'pick'; render(); window.toast?.('⚠️ 要約に失敗しました: ' + err, 8000); return; }
    // 開いている動画が変わっていたら入れない（ほかの動画のメモに入れない）
    if (window.openVPanelId !== id || !document.getElementById('vp-memo-' + id)) { close(); window.toast?.('動画パネルを閉じたので、メモには入れませんでした', 7000); return; }
    // 写真: AI が shot にした項目。数がずれていたら指定の枚数に合わせる（多ければ先から・足りなければ間をあけて足す）
    const want = Math.min(wantShots, items.length);
    let idx = items.map((x, k) => x.shot ? k : -1).filter(k => k >= 0).slice(0, want);
    for (let k = 0; idx.length < want && k < items.length * 2; k++) { const c = Math.floor(k * items.length / want) % items.length; if (!idx.includes(c)) idx.push(c); }
    const pics = want ? await shoot(id, idx.sort((a, b) => a - b).map(k => items[k]), setMsg, tok) : {};
    if (tok !== cancelTok) return;
    if (window.openVPanelId !== id) { close(); window.toast?.('動画パネルを閉じたので、メモには入れませんでした', 7000); return; }
    // メモに入れる形: タイトル（大きく）→ チャプターごとの見出し（番号＋太い下線。2つ以上にまたがるときだけ）→ 項目
    const ts = s => K().tsLinkHtml(s);
    const chOf = t => { let c = null; for (const b of D.bms) { if (b.t <= t + 0.5) c = b; else break; } return c; };
    const chs = items.map(x => chOf(x.t)), many = new Set(chs.filter(Boolean)).size >= 2; let no = 0;
    const tot = rs.reduce((s, r) => s + r.b - r.a, 0);
    let html = `<div class="memo-sum-t">✂️ 要約${label ? '　' + esc(label) : ''}<span class="memo-sum-rg">${rs.map(r => fmt(r.a) + '–' + fmt(r.b)).join(', ')} · ${rs.length}か所 · 合計 ${lenTxt(tot)}</span></div>`;
    items.forEach((x, k) => {
      if (many && chs[k] && chs[k] !== chs[k - 1]) html += `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">${++no}</span>${esc(chs[k].label || '（名前なし）')}${ts(chs[k].t)}</div>`;
      const p = pics[x.t];
      html += p ? `<div class="memo-sum-it">${ts(x.t)}&nbsp;${K().thumbHtml(p.snapId, x.t, p.url)}&nbsp;<span class="snap-cap" data-snap-id="${p.snapId}">${esc(x.text)}</span></div>`
                : `<div class="memo-sum-it">${ts(x.t)}&nbsp;${esc(x.text)}</div>`;
    });
    const ok = K().appendMemo(id, html);
    close();
    const nPic = Object.keys(pics).filter(k => k !== '__err').length;
    if (!ok) { window.toast?.('メモ欄が見つかりませんでした（パネルを開き直してください）', 7000); return; }
    window.toast?.(`✂️ 要約をメモに入れました（${items.length}項目${nPic ? `・写真${nPic}枚` : ''}）` + (pics.__err ? ` ／写真を撮れませんでした: ${pics.__err}` : ''), 6000);
    [...(document.getElementById("vp-memo-" + id)?.querySelectorAll(".memo-sum-t") || [])].pop()?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }
})();
