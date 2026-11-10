// 見本の部品（mock-sum-real.html が本物のアプリの中へ差し込む）。
// ・読むだけ: window.videos（ブックマーク・仕切り・長さ）、動画の <video>（再生位置・字幕の <track>）、
//   YouTube の字幕（Firestore users/{uid}/data/ytsub_{ytId} を get するだけ）。
// ・書かない: 動画のデータ・メモ・スナップショット・localStorage・Firestore に何も書かない。
// ・AI: 範囲の字幕の行だけを /api/ai-summary（source:'rangesum'）へ送り、項目（時刻・要点・写真を付けるか）を受け取る。
// ・写真: Drive の動画だけ。同じ動画を隠れた <video> でもう1本開き、その時刻の絵を撮る（保存しない）。
(() => {
  if (window.__msr) return; window.__msr = true;
  const CSS = `
.msr-fab{position:fixed;right:14px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:99990;padding:10px 14px;border-radius:22px;border:none;background:#2050c0;color:#fff;font:700 13px -apple-system,'Hiragino Sans',sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}
.msr-ov{position:fixed;inset:0;z-index:99991;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif}
.msr-sh{--s:var(--surface,#fff);--t:var(--text,#111);--t3:var(--text3,#70706c);--b:var(--border,#e0e0dc);--s2:var(--surface2,#f1f1ef);--sel:#2050c0;--selsoft:rgba(32,80,192,.10);--star:#d9a400;
  background:var(--s);color:var(--t);width:100%;max-width:620px;border-radius:14px 14px 0 0;max-height:90vh;display:flex;flex-direction:column}
.msr-sh button,.msr-sh input{font-family:inherit;color:inherit}
.msr-hd{padding:12px 14px 8px;border-bottom:1px solid var(--b)}
.msr-hd b{font-size:14px}.msr-hd .sub{font-size:11px;color:var(--t3);margin-top:2px;line-height:1.5}
.msr-tabs{display:flex;gap:4px;margin-top:10px}
.msr-tabs button{flex:1;font-size:11.5px;padding:7px 2px;border-radius:7px;border:1px solid var(--b);background:transparent;white-space:nowrap;cursor:pointer}
.msr-tabs button.on{background:var(--sel);border-color:var(--sel);color:#fff;font-weight:700}
.msr-bd{overflow-y:auto;padding:8px 14px;flex:1;min-height:0}
.msr-pick{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:9px 8px;border:1px solid var(--b);border-radius:8px;background:transparent;margin-bottom:6px;font-size:12.5px;cursor:pointer}
.msr-pick.on{border-color:var(--sel);background:var(--selsoft)}
.msr-pick .r{width:16px;height:16px;border-radius:50%;border:2px solid var(--t3);flex-shrink:0}
.msr-pick.on .r{border-color:var(--sel);background:radial-gradient(var(--sel) 45%,transparent 50%)}
.msr-pick .pn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msr-pick .pm{flex-shrink:0;font-size:10.5px;color:var(--t3)}
.msr-pick .st{color:var(--star);font-size:11px;letter-spacing:-2px;flex-shrink:0}
.msr-chips{display:flex;gap:5px;margin:4px 0 10px}
.msr-chips button{font-size:12px;padding:5px 12px;border-radius:7px;border:1px solid var(--b);background:transparent;cursor:pointer}
.msr-chips button.on{background:var(--star);border-color:var(--star);color:#1c1c1e;font-weight:700}
.msr-hint{font-size:11px;color:var(--t3);line-height:1.7;margin:4px 0 8px}
.msr-tm{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;margin:6px 0}
.msr-tm label{font-size:12px;font-weight:700}
.msr-tm .f{display:flex;gap:5px;align-items:center}
.msr-tm input{width:84px;font-size:15px;padding:6px 8px;border:1px solid var(--b);border-radius:7px;background:var(--s2);text-align:center}
.msr-tm input.bad{border-color:#d33}
.msr-nud{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:-2px 0 6px}
.msr-sb{font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid var(--b);background:transparent;white-space:nowrap;cursor:pointer}
.msr-nud .msr-sb{padding:6px 0;text-align:center}
.msr-bar{position:relative;height:26px;margin:10px 4px 2px;background:var(--s2);border-radius:6px}
.msr-bar .seg{position:absolute;top:0;bottom:0;background:var(--sel);opacity:.55;border-radius:4px}
.msr-bar .now{position:absolute;top:-3px;bottom:-3px;width:2px;background:#d33}
.msr-barlbl{display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin:0 4px 6px}
.msr-ft{border-top:1px solid var(--b);padding:10px 14px calc(14px + env(safe-area-inset-bottom))}
.msr-sum{font-size:12px;line-height:1.6;margin-bottom:8px}.msr-sum b{color:var(--sel)}
.msr-opt{display:flex;align-items:center;gap:5px;margin-bottom:7px;flex-wrap:wrap}
.msr-opt .ol{font-size:11.5px;font-weight:700;width:58px;flex-shrink:0}
.msr-opt button{font-size:12px;padding:5px 10px;border-radius:7px;border:1px solid var(--b);background:transparent;cursor:pointer}
.msr-opt button.on{background:var(--sel);border-color:var(--sel);color:#fff;font-weight:700}
.msr-opt input{width:52px;font-size:13px;padding:5px 6px;border:1px solid var(--b);border-radius:7px;background:var(--s2);text-align:center}
.msr-opt input.on{border-color:var(--sel);box-shadow:inset 0 0 0 1px var(--sel)}
.msr-opt .on2{font-size:10.5px;color:var(--t3);width:100%;padding-left:63px;margin-top:-2px}
.msr-go{width:100%;padding:11px;border-radius:9px;border:none;background:var(--sel);color:#fff !important;font-size:14px;font-weight:700;cursor:pointer}
.msr-go:disabled{opacity:.35;cursor:default}
.msr-cancel{width:100%;padding:8px;margin-top:6px;border:none;background:none;color:var(--t3) !important;font-size:12px;cursor:pointer}
.msr-warn{border:1px solid #d9a400;background:rgba(217,164,0,.10);border-radius:8px;padding:10px;font-size:12px;line-height:1.7;margin-bottom:8px}
.msr-busy{text-align:center;padding:26px 0;font-size:13px;color:var(--t3)}
.msr-res{font-size:12.5px;line-height:1.7;background:var(--selsoft);border-radius:8px;padding:8px 10px}
.msr-res .h{font-weight:700;color:var(--sel)}
.msr-res .it{display:flex;gap:7px;align-items:flex-start;margin:4px 0}
.msr-res .th{flex-shrink:0;width:96px;border-radius:5px;display:block;cursor:zoom-in}
.msr-res .ts{color:var(--sel);text-decoration:underline;cursor:pointer}
.msr-big{position:fixed;inset:0;z-index:99995;background:rgba(0,0,0,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;box-sizing:border-box;font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif}
.msr-big img{max-width:100%;max-height:68vh;border-radius:6px}
.msr-big .cap{max-width:760px;width:100%;color:#fff;font-size:15px;line-height:1.7;background:#26262a;border-radius:8px;padding:10px 14px;box-sizing:border-box}
.msr-big .cap .ct{color:#8fb0ff;font-weight:700;margin-right:6px}
.msr-big .x{position:absolute;top:10px;right:14px;color:#fff;font-size:13px;opacity:.75}
`;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  // ── 読むだけの道具 ──
  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const parse = str => { const z = String(str).trim().replace(/[０-９：]/g, c => c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(z)) return null; const p = z.split(':').map(Number); if (p.slice(1).some(x => x > 59)) return null;
    return p.reduce((a, b) => a * 60 + b, 0); };
  const toSec = t => typeof t === 'number' ? t : (parse(t) ?? (Number(t) || 0));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curVideo = () => (window.videos || []).find(v => v.id === window.openVPanelId) || null;
  const gdEl = () => [...document.querySelectorAll('video.wk-sub-video')].find(v => v.isConnected && /\/api\/drive/.test(v.currentSrc || v.src)) || null;
  const ytIdOf = v => { if (!v || v.isPlaylist) return ''; const RE = /^[A-Za-z0-9_-]{11}$/; if (v.ytId && RE.test(v.ytId)) return v.ytId;
    if (String(v.pt || '') !== 'youtube') return ''; const id = String(v.id || '').replace(/^yt-/, ''); return RE.test(id) ? id : ''; };
  // YouTube の再生位置: 埋め込みが親へ送ってくる infoDelivery を拾う（プレイヤーを触らない）
  let ytNow = null, ytDur = null;
  addEventListener('message', e => { if (!/youtube/.test(e.origin)) return; try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d?.info) { if (typeof d.info.currentTime === 'number') ytNow = d.info.currentTime; if (typeof d.info.duration === 'number' && d.info.duration > 0) ytDur = d.info.duration; } } catch (_) {} });
  const nowSec = () => { const g = gdEl(); if (g) return Math.floor(g.currentTime || 0); return ytNow != null ? Math.floor(ytNow) : 0; };
  const durOf = v => { const g = gdEl(); return Number(v?.duration) || (g && g.duration) || ytDur || 0; };

  // 字幕: Drive は <track> の中身（アプリが作った WebVTT）、YouTube は Firestore を読むだけ
  const TC = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
  const tcs = (h, m, s, ms) => (h ? parseInt(h) * 3600 : 0) + parseInt(m) * 60 + parseInt(s) + parseInt(ms.padEnd(3, '0')) / 1000;
  function parseCues(text) {
    const L = String(text).replace(/\r\n?/g, '\n').split('\n'), out = [];
    for (let i = 0; i < L.length; i++) { const m = L[i].match(TC); if (!m) continue; const body = [];
      for (let j = i + 1; j < L.length && L[j].trim() !== '' && !TC.test(L[j]); j++) body.push(L[j]);
      const t = body.join(' ').replace(/<[^>]+>/g, '').trim(); if (t) out.push({ start: tcs(m[1], m[2], m[3], m[4]), end: tcs(m[5], m[6], m[7], m[8]), text: t }); }
    return out;
  }
  const subCache = new Map();
  async function loadSubs(v) {
    if (subCache.has(v.id)) return subCache.get(v.id);
    let res = { cues: [], label: '' }; const dg = [];   // 何を探して何が見つかったか（画面に出す）
    const g = gdEl();
    dg.push('動画: pt=' + (v.pt || '?') + ' / video要素=' + document.querySelectorAll('video').length + '本 / Driveの再生=' + (g ? 'あり' : 'なし') + ' / iframe=' + [...document.querySelectorAll('iframe')].map(f => (f.src || '').replace(/^https?:\/\/([^/]+).*/, '$1')).join(',') );
    if (g) { const tr = [...g.querySelectorAll('track')]; dg.push('track=' + tr.length + '本 ' + tr.map(t => `[${t.label}/${t.srclang}/${(t.src || '').slice(0, 10)}]`).join(' '));
      dg.push('textTracks=' + [...g.textTracks].map(t => `[${t.label}/${t.mode}/cues:${t.cues ? t.cues.length : '-'}]`).join(' '));
      const pick = tr.find(t => /日本|ja/i.test(t.label + t.srclang)) || tr[0];
      if (pick?.src) { try { const txt = await (await fetch(pick.src)).text(); res = { cues: parseCues(txt), label: pick.label || '字幕' };
          dg.push('読んだ字幕: ' + txt.length + '文字 → ' + res.cues.length + 'キュー / 先頭: ' + JSON.stringify(txt.slice(0, 80))); }
        catch (e) { dg.push('字幕の読み込みに失敗: ' + (e.message || e)); } }
      if (!res.cues.length) { const tt = [...g.textTracks].find(t => t.cues && t.cues.length);   // 読めなければ、ブラウザが読み込み済みのキューを使う
        if (tt) { res = { cues: [...tt.cues].map(c => ({ start: c.startTime, end: c.endTime, text: String(c.text).replace(/<[^>]+>/g, '') })), label: tt.label || '字幕' }; dg.push('textTracks から ' + res.cues.length + 'キュー'); } } }
    else { const yt = ytIdOf(v), uid = window._firebaseCurrentUser?.()?.uid;
      dg.push('ytId=' + (yt || 'なし') + ' / ログイン=' + (uid ? 'あり' : 'なし') + ' / firestore=' + (window.firebase?.firestore ? 'あり' : 'なし'));
      if (yt && uid && window.firebase?.firestore) { try {
        const snap = await window.firebase.firestore().collection('users').doc(uid).collection('data').doc('ytsub_' + yt).get();
        const tr = snap.exists ? (snap.data()?.tracks || {}) : {}; const k = tr.ja?.srt ? 'ja' : Object.keys(tr).find(x => tr[x]?.srt);
        dg.push('字幕の置き場所: ' + (snap.exists ? 'あり' : 'なし') + ' / 言語=' + (Object.keys(tr).join(',') || 'なし'));
        if (k) { res = { cues: parseCues(tr[k].srt), label: k === 'ja' ? '日本語' : k }; dg.push('読んだ字幕(' + k + '): ' + tr[k].srt.length + '文字 → ' + res.cues.length + 'キュー / 先頭: ' + JSON.stringify(tr[k].srt.slice(0, 80))); }
      } catch (e) { dg.push('字幕の読み込みに失敗: ' + (e.message || e)); } } }
    res.diag = dg;
    if (res.cues.length) subCache.set(v.id, res);
    return res;
  }

  // ── 範囲 ──
  let mode = 'div', selDiv = null, selBm = null, starMin = 1, tA = null, tB = null, nItems = 0, nShots = 3, phase = 'pick', result = '', cancelTok = 0;
  const data = () => { const v = curVideo(); const dur = durOf(v);
    const bms = (v?.bookmarks || []).map((b, i) => ({ i, t: toSec(b.time), label: b.label || '', star: b.star === true ? 1 : (Number(b.star) || 0) })).sort((a, b) => a.t - b.t);
    const divs = (v?.bmDividers || []).map(d => ({ t: toSec(d.time), label: d.label || '' })).sort((a, b) => a.t - b.t);
    return { v, dur, bms, divs }; };
  const bmEnd = (D, k) => k + 1 < D.bms.length ? D.bms[k + 1].t : (D.dur || D.bms[k].t + 60);
  const divEnd = (D, k) => k + 1 < D.divs.length ? D.divs[k + 1].t : (D.dur || D.divs[k].t + 60);
  function curRanges(D) {
    if (mode === 'div') return selDiv == null || !D.divs[selDiv] ? [] : [{ a: D.divs[selDiv].t, b: divEnd(D, selDiv), label: D.divs[selDiv].label }];
    if (mode === 'bm') return selBm == null || !D.bms[selBm] ? [] : [{ a: D.bms[selBm].t, b: bmEnd(D, selBm), label: D.bms[selBm].label }];
    if (mode === 'star') return D.bms.map((b, k) => ({ b, k })).filter(x => x.b.star >= starMin).map(x => ({ a: x.b.t, b: bmEnd(D, x.k), label: x.b.label }));
    return tA != null && tB != null && tB > tA ? [{ a: tA, b: tB, label: '' }] : [];
  }

  // ── 画面 ──
  let ov = null;
  const fab = document.createElement('button'); fab.className = 'msr-fab'; fab.textContent = '✨ 部分を要約（見本）'; fab.style.display = 'none';
  document.body.appendChild(fab);
  setInterval(() => { fab.style.display = window.openVPanelId && !ov ? '' : 'none'; if (ov && mode === 'time' && phase === 'pick') { const n = ov.querySelector('.msr-bar .now'), D = data();
    if (n && D.dur) { n.style.left = (nowSec() / D.dur * 100) + '%'; ov.querySelector('.msr-nowlbl').textContent = '赤い線＝今の位置 ' + fmt(nowSec()); } } }, 500);
  fab.onclick = () => { phase = 'pick'; result = ''; const D = data(); if (selDiv == null && D.divs.length) selDiv = 0; if (!D.divs.length && mode === 'div') mode = D.bms.length ? 'bm' : 'time';
    ov = document.createElement('div'); ov.className = 'msr-ov'; ov.setAttribute('translate', 'no'); ov.innerHTML = '<div class="msr-sh"></div>'; document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov && phase !== 'busy') close(); }; render(); };
  const close = () => { cancelTok++; ov?.remove(); ov = null; };

  const TABS = [['div', '仕切り'], ['bm', 'ブックマーク'], ['star', '★の所'], ['time', '時刻を指定']];
  function render() {
    if (!ov) return; const D = data(), sh = ov.querySelector('.msr-sh'); const isGd = !!gdEl();
    let h = `<div class="msr-hd"><b>✨ 部分を要約（見本）</b><div class="sub">${esc(D.v?.title || '')}<br>範囲の字幕だけをAIに送って要約します（押すたびに少し料金がかかります）。メモには入れません。</div>
      <div class="msr-tabs">${TABS.map(([k, l]) => `<button class="${k === mode ? 'on' : ''}" data-tab="${k}" ${phase !== 'pick' ? 'disabled' : ''}>${l}</button>`).join('')}</div></div><div class="msr-bd">`;
    if (phase === 'busy') { sh.innerHTML = h + `<div class="msr-busy" id="msr-busy">準備しています…</div></div><div class="msr-ft"><button class="msr-cancel" data-act="stop">やめる</button></div>`; bind(); return; }
    if (phase === 'done') { sh.innerHTML = h + `<div class="msr-hint">メモにはこの形で入る想定です（見本なので入れていません）。時刻を押すとその位置へ飛びます。写真を押すと大きく出ます。</div>${result}</div>
      <div class="msr-ft"><button class="msr-go" data-act="back">範囲を選び直す</button><button class="msr-cancel" data-act="close">閉じる</button></div>`; bind(); return; }
    if (mode === 'div') { h += D.divs.length ? '<div class="msr-hint">仕切り1つ分（次の仕切りまで）を要約します。</div>' + D.divs.map((d, k) => `<button class="msr-pick ${selDiv === k ? 'on' : ''}" data-div="${k}"><span class="r"></span><span class="pn">${esc(d.label)}</span><span class="pm">${fmt(d.t)}–${fmt(divEnd(D, k))}</span></button>`).join('')
        : '<div class="msr-hint">この動画には仕切りがありません。</div>'; }
    else if (mode === 'bm') { h += D.bms.length ? '<div class="msr-hint">ブックマーク1つ分（次のブックマークまで）を要約します。</div>' + D.bms.map((b, k) => `<button class="msr-pick ${selBm === k ? 'on' : ''}" data-bm="${k}"><span class="r"></span><span class="pn">${fmt(b.t)}　${esc(b.label)}</span><span class="st">${b.star ? '★'.repeat(Math.min(3, b.star)) : ''}</span><span class="pm">〜${fmt(bmEnd(D, k))}</span></button>`).join('')
        : '<div class="msr-hint">この動画にはブックマークがありません。</div>'; }
    else if (mode === 'star') { h += '<div class="msr-hint">星の付いたブックマーク（次のブックマークまで）を、まとめて1つの要約にします。</div><div class="msr-chips">' + [[1, '★1以上'], [2, '★2以上'], [3, '★3']].map(([m, l]) => `<button class="${m === starMin ? 'on' : ''}" data-min="${m}">${l}</button>`).join('') + '</div>';
      const rs = curRanges(D); h += rs.length ? rs.map(r => `<div class="msr-pick on" style="cursor:default"><span class="pn">${fmt(r.a)}　${esc(r.label)}</span><span class="pm">〜${fmt(r.b)}</span></div>`).join('') : '<div class="msr-hint">この数の星が付いたブックマークはありません</div>'; }
    else { h += '<div class="msr-hint">数字で打つ（12:30 のように）か、動画を止めた所で「今の位置」を押します。±ボタンは入っている時刻から（空なら今の位置から）ずらします。</div>';
      const row = (k, lbl, val) => `<label>${lbl}</label><div class="f"><input id="msr-in${k}" inputmode="numeric" placeholder="0:00" value="${val == null ? '' : fmt(val)}"><button class="msr-sb" data-now="${k}">今の位置</button></div>
        <span></span><div class="msr-nud">${[[-60, '−1分'], [-30, '−30秒'], [-10, '−10秒'], [-5, '−5秒'], [5, '＋5秒'], [10, '＋10秒'], [30, '＋30秒'], [60, '＋1分']].map(([d, l]) => `<button class="msr-sb" data-nudge="${k}" data-d="${d}">${l}</button>`).join('')}</div>`;
      h += '<div class="msr-tm">' + row('A', '開始', tA) + row('B', '終了', tB) + '</div>';
      if (D.dur) h += `<div class="msr-bar">${curRanges(D).map(r => `<div class="seg" style="left:${r.a / D.dur * 100}%;width:${(r.b - r.a) / D.dur * 100}%"></div>`).join('')}<div class="now" style="left:${nowSec() / D.dur * 100}%"></div></div>
        <div class="msr-barlbl"><span>0:00</span><span class="msr-nowlbl">赤い線＝今の位置 ${fmt(nowSec())}</span><span>${fmt(D.dur)}</span></div>`;
      if (tA != null && tB != null && tB <= tA) h += '<div class="msr-hint" style="color:#c33">終了は開始より後にしてください</div>'; }
    h += '</div><div class="msr-ft">';
    const rs = curRanges(D), tot = rs.reduce((s, r) => s + r.b - r.a, 0);
    const auto = Math.max(1, Math.min(30, Math.round(tot / 60))), items = nItems || auto;
    h += rs.length ? `<div class="msr-sum">範囲: <b>${rs.length > 1 ? rs.length + 'か所・' : fmt(rs[0].a) + '–' + fmt(rs[0].b) + '・'}合計 ${tot < 60 ? Math.round(tot) + '秒' : Math.round(tot / 60) + '分'}</b></div>` : '<div class="msr-sum" style="color:var(--t3)">範囲を選んでください</div>';
    const cs = (key, cur, list) => list.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-${key}="${v}">${l}</button>`).join('');
    const custom = (id, cur, list) => `<input id="${id}" inputmode="numeric" placeholder="数" value="${list.some(x => x[0] === cur) ? '' : cur}" class="${list.some(x => x[0] === cur) ? '' : 'on'}">`;
    const IL = [[0, 'おまかせ'], [3, '3'], [5, '5'], [10, '10']], SL = [[0, 'なし'], [1, '1'], [3, '3'], [5, '5']];
    h += `<div class="msr-opt"><span class="ol">項目の数</span>${cs('ni', nItems, IL)}${custom('msr-ni', nItems, IL)}<span class="on2">${nItems ? items + '項目' : 'おまかせ＝約1分に1項目（この範囲なら ' + auto + '項目）'}・1〜30</span></div>`;
    if (!isGd) h += `<div class="msr-opt"><span class="ol">写真</span><span style="font-size:11.5px;color:var(--t3)">YouTubeの動画は画面を撮れないので、文章だけになります</span></div>`;
    else { const s2 = Math.min(nShots, items); h += `<div class="msr-opt"><span class="ol">写真</span>${cs('ns', nShots, SL)}${custom('msr-ns', nShots, SL)}<span class="on2">${!nShots ? '写真は入れません' : nShots > items ? `項目より多くは入れられないので ${s2}枚（1項目に1枚まで）` : `${s2}枚。どの項目に付けるかはAIが選ぶ`}</span></div>`; }
    h += `<button class="msr-go" data-act="go" ${rs.length ? '' : 'disabled'}>AIで要約する（見本）</button><button class="msr-cancel" data-act="close">キャンセル</button></div>`;
    sh.innerHTML = h; bind();
  }
  function bind() {
    const q = (s, f) => ov.querySelectorAll(s).forEach(f);
    q('[data-tab]', b => b.onclick = () => { mode = b.dataset.tab; render(); });
    q('[data-div]', b => b.onclick = () => { selDiv = +b.dataset.div; render(); });
    q('[data-bm]', b => b.onclick = () => { selBm = +b.dataset.bm; render(); });
    q('[data-min]', b => b.onclick = () => { starMin = +b.dataset.min; render(); });
    q('[data-ni]', b => b.onclick = () => { nItems = +b.dataset.ni; render(); });
    q('[data-ns]', b => b.onclick = () => { nShots = +b.dataset.ns; render(); });
    q('[data-now]', b => b.onclick = () => { if (b.dataset.now === 'A') tA = nowSec(); else tB = nowSec(); render(); });
    q('[data-nudge]', b => b.onclick = () => { const D = data(), d = +b.dataset.d, lim = x => Math.max(0, D.dur ? Math.min(D.dur, x) : x);
      if (b.dataset.nudge === 'A') tA = lim((tA ?? nowSec()) + d); else tB = lim((tB ?? nowSec()) + d); render(); });
    ['A', 'B'].forEach(k => { const el = ov.querySelector('#msr-in' + k); if (!el) return;
      el.onchange = () => { const s = el.value.trim(), v = s === '' ? null : parse(s), D = data(); if (s !== '' && (v == null || (D.dur && v > D.dur))) { el.classList.add('bad'); return; }
        if (k === 'A') tA = v; else tB = v; render(); }; el.onkeydown = e => { if (e.key === 'Enter') el.onchange(); }; });
    [['msr-ni', v => nItems = v], ['msr-ns', v => nShots = v]].forEach(([id, set]) => { const el = ov.querySelector('#' + id); if (!el) return;
      el.onchange = () => { const z = el.value.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), v = +z;
        if (!/^\d+$/.test(z) || v < 1 || v > 30) { el.style.borderColor = '#d33'; return; } set(v); render(); }; el.onkeydown = e => { if (e.key === 'Enter') el.onchange(); }; });
    q('[data-act]', b => b.onclick = () => { const a = b.dataset.act;
      if (a === 'close') close(); else if (a === 'stop') { cancelTok++; phase = 'pick'; render(); } else if (a === 'back') { phase = 'pick'; render(); } else if (a === 'go') run(); });
    q('.ts[data-t]', s => s.onclick = () => window.vpSeek?.(window.openVPanelId, +s.dataset.t));
    q('img.th', im => im.onclick = () => { const big = document.createElement('div'); big.className = 'msr-big'; big.setAttribute('translate', 'no'); big.innerHTML = `<span class="x">✕ 閉じる</span><img src="${im.src}">` + (im.dataset.txt ? `<div class="cap"><span class="ct">${fmt(+im.dataset.t)}</span>${esc(im.dataset.txt)}</div>` : ''); big.onclick = () => big.remove(); document.body.appendChild(big); });
  }

  // ── 見本の要約: 項目の時刻を範囲にならべ、その時刻の字幕を出す。写真はその時刻の絵 ──
  async function capFrames(times, setMsg, tok) {
    const g = gdEl(); if (!g) return {};
    const src = (g.currentSrc || g.src).replace(/#.*$/, '');
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.style.cssText = 'position:fixed;left:-9999px;width:320px;height:180px'; v.src = src; document.body.appendChild(v);
    const out = {};
    try {
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('動画を開けませんでした')); setTimeout(res, 15000); });
      let prev = null;
      for (let k = 0; k < times.length; k++) {
        if (tok !== cancelTok) break; setMsg(`写真を撮っています… ${k + 1}/${times.length}`);
        let t = times[k], cap = null;
        for (let n = 0; n < 3; n++) {
          await new Promise(r => { const f = () => { v.removeEventListener('seeked', f); r(); }; v.addEventListener('seeked', f); v.currentTime = t + n * 0.7; setTimeout(f, 4000); });
          await new Promise(r => v.requestVideoFrameCallback ? (v.requestVideoFrameCallback(() => r()), setTimeout(r, 700)) : setTimeout(r, 200));
          const w = v.videoWidth, h = v.videoHeight; if (!w) break;
          const c = document.createElement('canvas'), sc = Math.min(1, 480 / w); c.width = w * sc; c.height = h * sc; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          const s = document.createElement('canvas'); s.width = s.height = 16; s.getContext('2d').drawImage(v, 0, 0, 16, 16); const px = s.getContext('2d').getImageData(0, 0, 16, 16).data;
          const sig = []; for (let i = 0; i < px.length; i += 4) sig.push(px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114);
          cap = { url: c.toDataURL('image/jpeg', 0.7), sig };
          const diff = prev ? sig.reduce((a, x, i) => a + Math.abs(x - prev[i]), 0) / sig.length : 255;
          if (diff >= 5) break;   // 直前とほぼ同じ絵なら少しずらして撮り直す（前の版と同じ）
        }
        if (cap) { out[times[k]] = cap.url; prev = cap.sig; }
      }
    } catch (e) { out.__err = e.message || String(e); }
    v.removeAttribute('src'); v.load(); v.remove();
    return out;
  }
  async function run() {
    const D = data(), rs = curRanges(D); if (!rs.length) return;
    const tok = ++cancelTok; phase = 'busy'; render();
    const setMsg = m => { const el = ov?.querySelector('#msr-busy'); if (el) el.textContent = m; };
    setMsg('字幕を読んでいます…');
    const subs = await loadSubs(D.v); if (tok !== cancelTok) return;
    if (!subs.cues.length && String(D.v?.pt || '') === 'gdrive' && !gdEl()) { phase = 'done'; result = `<div class="msr-warn">Drive の動画がまだ再生されていません（Google の認証が切れているため）。<br>動画の所の「Googleで認証して再生」を押して、動画と字幕が出てから、もう一度押してください。</div>`; render(); return; }
    if (!subs.cues.length) { phase = 'done'; result = `<div class="msr-warn">この動画の字幕を読めませんでした。<br><span style="font-size:11px">下の「調べた結果」をスクリーンショットで送ってください。</span></div>
      <div style="font:11px/1.6 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;background:var(--s2);border-radius:6px;padding:8px">調べた結果\n${esc((subs.diag || []).join('\n'))}</div>`; render(); return; }
    const tot = rs.reduce((s, r) => s + r.b - r.a, 0);
    const inR = t => rs.some(r => t >= r.a - 1 && t < r.b);
    const cues = subs.cues.filter(c => inR(c.start)).map(c => ({ t: c.start, text: c.text }));
    if (!cues.length) { phase = 'done'; result = `<div class="msr-warn">この範囲に字幕の行がありません。</div>`; render(); return; }
    const isGd = !!gdEl(), wantShots = isGd ? nShots : 0;
    const lbl0 = rs.length === 1 && rs[0].label ? rs[0].label : (mode === 'star' ? `★${starMin === 3 ? 3 : starMin + '以上'}の所` : '');
    setMsg('AIが要約しています…（' + cues.length + '行の字幕を送っています）');
    let items = [], cost = null, err = '';
    try {
      const user = window._firebaseCurrentUser?.(); if (!user) throw new Error('ログインが必要です');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/ai-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, source: 'rangesum', cues, items: nItems, shots: wantShots, label: lbl0, title: D.v?.title || '', channel: D.v?.channel || '', playlist: D.v?.playlist || '' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ? (j.error + (j.detail ? ': ' + j.detail : '')) : 'HTTP ' + res.status);
      cost = j.costUsd;
      const txt = String(j.summary || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
      const obj = JSON.parse(txt);
      items = (obj.items || []).map(x => ({ t: parse(x.t), text: String(x.text || ''), shot: !!x.shot })).filter(x => x.t != null).sort((a, b) => a.t - b.t);
      if (!items.length) throw new Error('AIの返事に項目がありませんでした');
    } catch (e) { err = e.message || String(e); }
    if (tok !== cancelTok) return;
    if (err) { phase = 'done'; result = `<div class="msr-warn">AIの要約に失敗しました: ${esc(err)}</div>`; render(); return; }
    // 写真: AIが shot にした項目。数がずれていたら指定の枚数に合わせる（多ければ先から・足りなければ間をあけて足す）
    let shotIdx = items.map((x, k) => x.shot ? k : -1).filter(k => k >= 0);
    const want = Math.min(wantShots, items.length);
    if (shotIdx.length > want) shotIdx = shotIdx.slice(0, want);
    for (let k = 0; shotIdx.length < want && k < items.length * 2; k++) { const c = Math.floor(k * items.length / want) % items.length; if (!shotIdx.includes(c)) shotIdx.push(c); }
    const shotTimes = shotIdx.map(k => items[k].t);
    const pics = shotTimes.length ? await capFrames(shotTimes, setMsg, tok) : {}; if (tok !== cancelTok) return;
    const lbl = lbl0 ? '　' + esc(lbl0) : '';
    result = `<div class="msr-res"><div class="h">✂️ 要約 ${rs.map(r => fmt(r.a) + '–' + fmt(r.b)).join(', ')}${lbl}</div>` +
      items.map(x => `<div class="it">${pics[x.t] && shotTimes.includes(x.t) ? `<img class="th" src="${pics[x.t]}" alt="" data-t="${x.t}" data-txt="${esc(x.text)}">` : ''}<span>・<span class="ts" data-t="${x.t}">${fmt(x.t)}</span> ${esc(x.text)}</span></div>`).join('') + '</div>' +
      (pics.__err ? `<div class="msr-warn" style="margin-top:8px">写真を撮れませんでした: ${esc(pics.__err)}</div>` : '') +
      `<div class="msr-hint" style="margin-top:8px">AIが字幕（${esc(subs.label)}・${cues.length}行）から作った要約です。項目 ${items.length}個・写真 ${Object.keys(pics).filter(k => k !== '__err').length}枚${cost != null ? `・料金 約$${Number(cost).toFixed(4)}` : ''}。メモには入れていません。</div>`;
    phase = 'done'; render();
  }
})();
