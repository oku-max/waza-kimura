// ═══ ドリル（v52.989・オーナー決定 mock-drill.html: 区間の合わせ方 A「±ボタン」／回す画面は A「道場モード」と B「一覧のまま」の両方） ═══
// 動画の中の1区間を「ドリル」として保存し、あとで一覧から回す（ループ・回数で次へ・反転・スロー）。
//
// 作る（動画パネルの中）:
//   ・ブックマークの行の 🏋️ … その時刻〜次のブックマーク（終わりの時刻があればそこ）がそのまま区間
//   ・見出しの「🏋️ ここから」→「■ ここまで」… 再生しながら2回押す。押す遅れを見込んで開始は2秒前
//   どちらも同じカードが出て、ループしたまま ±1秒・今の位置 で端を合わせる。反転・速度もドリルが覚える。
// 一覧（Drill タブ #drillsTab）: しばらくやっていない順／作った順／動画ごと。メニュー（ドリルの束）。
// 回す（全画面）: A 道場モード（大きい3つのボタン）／B 一覧のまま。自前の小さなプレーヤー（YouTube・Drive）。
//
// 【データ】書くのはドリルの文書だけ（localStorage `wk_drills` と Firestore `users/{uid}/data/drills`）。
//   動画（v.bookmarks 等）には1文字も書かない。ブックマークを直してもドリルの区間は動かない（時刻を写して持つ）。
//   1件ずつ {.., at} で持ち、端末どうしは at の新しい方を採る（足し合わせ）。消すのも {id, del:true, at}（欄を消さない）。
//   空の一覧でクラウドを上書きする経路は無い（書くのは変えた1件だけ）。
//   ほかのアカウントの控えは、そのアカウントのクラウドへ送らない（控えに uid を持つ）。
//   回す画面の好み（A/B・次へ の決め方）と一覧の並べ方はこの端末だけ（wk_drillPrefs）。
(() => {
  const LS = 'wk_drills', PREF = 'wk_drillPrefs', LOG_MAX = 300;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => { s = Math.max(0, Math.floor(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
  const toSec = t => { if (typeof t === 'number') return t; const p = String(t ?? '').split(':').map(Number); return p.some(isNaN) ? (Number(t) || 0) : p.reduce((a, b) => a * 60 + b, 0); };
  const toast = m => window.toast?.(m);
  // 確認・入力のダイアログは画面の自動翻訳が届かないので、英語表示ならここで訳す
  const tr = t => (window.WK_LANG?.() === 'en' && window._wkAutoI18n?.tryTranslate?.(t)) || t;
  const KIT = () => window._vpDrillKit;
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const videoOf = vid => (window.videos || []).find(v => v.id === vid) || null;

  // ───────── 保存 ─────────
  let S = { uid: null, items: {}, menus: {} };
  (function load() {
    try {
      const o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && typeof o === 'object') {
        S.uid = typeof o.uid === 'string' ? o.uid : null;
        S.items = o.items && typeof o.items === 'object' ? o.items : {};
        S.menus = o.menus && typeof o.menus === 'object' ? o.menus : {};
      }
    } catch (e) {}
  })();
  function persist() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { console.warn('[drills] 端末に保存できません', e); } }
  const okDrill = (e, id) => e && typeof e === 'object' && e.id === id && (e.del === true ||
    (typeof e.vid === 'string' && isFinite(e.a) && isFinite(e.b) && Number(e.b) > Number(e.a)));
  const okMenu = (e, id) => e && typeof e === 'object' && e.id === id && (e.del === true || Array.isArray(e.ids));
  const okOf = kind => kind === 'items' ? okDrill : okMenu;
  function put(kind, entry) {
    entry.at = Math.max(Date.now(), (Number(S[kind][entry.id]?.at) || 0) + 1);
    S[kind][entry.id] = entry;
    if (!S.uid) S.uid = window._currentUserUid?.() || null;
    persist();
    window._drillPush?.(kind, entry.id, entry);
    refreshAll();
  }
  // クラウドから受け取る（firebase.js）。新しい方を採る。first=true のときは、手元の方が新しい分を送る候補として返す
  window._drillApplyRemote = function (cloud, uid, first) {
    const toPush = [];
    // 別のアカウントの控えなら、そのアカウントの分はこのアカウントへ送らない（クラウドの方で置き換える）
    const foreign = first && S.uid && uid && S.uid !== uid;
    if (foreign) { S.items = {}; S.menus = {}; }
    for (const kind of ['items', 'menus']) {
      const c = (cloud && cloud[kind]) || {};
      for (const id of Object.keys(c)) {
        if (!okOf(kind)(c[id], id)) continue;
        const l = S[kind][id];
        if (!l || Number(c[id].at) > Number(l.at)) S[kind][id] = c[id];
      }
      if (first) for (const id of Object.keys(S[kind])) {
        const l = S[kind][id];
        if (!okOf(kind)(l, id)) continue;
        if (!c[id] || Number(l.at) > Number(c[id].at)) toPush.push({ kind, id, entry: l });
      }
    }
    if (uid) S.uid = uid;
    persist();
    refreshAll();
    return toPush;
  };
  const drills = () => Object.values(S.items).filter(d => d && !d.del);
  const menus = () => Object.values(S.menus).filter(m => m && !m.del).sort((a, b) => (a.created || 0) - (b.created || 0));
  const drill = id => { const d = S.items[id]; return d && !d.del ? d : null; };
  const lastDone = d => (Array.isArray(d.log) && d.log.length) ? Math.max(...d.log) : null;

  // バックアップ（index.html の書き出し・復元）。復元は足し合わせ（新しい方を採る・今あるドリルは消さない）
  window.wkDrills = {
    raw: () => ({ items: S.items, menus: S.menus }),
    importMerge(data) {
      if (!data || typeof data !== 'object') return;
      for (const kind of ['items', 'menus']) {
        const c = data[kind] || {};
        for (const id of Object.keys(c)) {
          if (!okOf(kind)(c[id], id)) continue;
          const l = S[kind][id];
          if (!l || Number(c[id].at) > Number(l.at)) { S[kind][id] = c[id]; window._drillPush?.(kind, id, c[id]); }
        }
      }
      persist(); refreshAll();
    },
    list: drills,
  };
  // この動画のこの時刻から始まるドリルがあるか（ブックマークの 🏋️ の色）
  window.wkDrillHas = (vid, t) => drills().some(d => d.vid === vid && Math.abs(d.a - t) < 2.5);

  let prefs = { mode: 'A', adv: 'loops', n: 5, secs: 60, sort: 'old' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} };

  // ═════════ 作る（動画パネル） ═════════
  let MK = null;    // {vid, id?, title, a, b, mir, sp, from, prevRate, prevMir, loops}
  let TAP = null;   // {vid, t}
  let timer = null;
  const slot = () => document.getElementById('vp-drill-slot');

  function bmEnd(vid, i) {
    const v = videoOf(vid), bms = v?.bookmarks || [], bm = bms[i];
    const t = toSec(bm.time);
    if (bm.endTime != null && toSec(bm.endTime) > t) return toSec(bm.endTime);
    const nx = bms.map(b => toSec(b.time)).filter(x => x > t).sort((x, y) => x - y)[0];
    if (nx != null) return nx;
    const dur = KIT()?.duration(vid) || 0;
    return dur > t + 1 ? dur : t + 30;
  }
  function guard(vid) {
    if (window._srVpOpen || !videoOf(vid)) { toast('ライブラリに追加した動画でドリルを作れます'); return false; }
    if (!KIT()) { toast('動画パネルを開き直してください'); return false; }
    return true;
  }
  window.wkDrillFromBm = function (vid, i) {
    if (!guard(vid)) return;
    const bm = videoOf(vid).bookmarks?.[i]; if (!bm) return;
    const a = toSec(bm.time);
    openCard({ vid, title: bm.label || `${fmt(a)}〜`, a, b: bmEnd(vid, i), from: 'ブックマーク' });
  };
  window.wkDrillTap = function (vid) {
    if (!guard(vid)) return;
    if (MK && MK.vid === vid) { slot()?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    const t = KIT().now();
    if (t == null) { toast('動画を再生してから押してください'); return; }
    if (TAP && TAP.vid === vid) return tapEnd();
    TAP = { vid, t };
    renderSlot(); startTimer();
  };
  function tapEnd() {
    const t = KIT().now();
    if (t == null || !TAP) return;
    const a = Math.max(0, TAP.t - 2), b = Math.max(t, a + 3), vid = TAP.vid;
    TAP = null;
    const near = (videoOf(vid)?.bookmarks || []).filter(x => toSec(x.time) <= a + 1).pop();
    openCard({ vid, title: near?.label ? `${near.label}（${fmt(a)}〜）` : `${fmt(a)}〜`, a, b, from: '2回押し' });
  }
  window.wkDrillTapEnd = tapEnd;
  window.wkDrillTapCancel = () => { TAP = null; renderSlot(); };

  function openCard(m) {
    closeCard(true);
    const k = KIT();
    MK = { mir: false, sp: 1, ...m, prevRate: k.getRate(), prevMir: k.mirrored(), loops: 0 };
    k.setRate(MK.sp); k.setMirror(MK.mir); k.seek(MK.a);
    renderSlot(); startTimer();
    slot()?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // restore: 開いている動画パネルの速度・反転を元に戻す（パネルが閉じた後なら何もしない）
  function closeCard(restore) {
    if (!MK) return;
    const k = KIT(), m = MK; MK = null;
    if (restore && k && window.openVPanelId === m.vid) { k.setRate(m.prevRate || 1); k.setMirror(m.prevMir); }
    renderSlot();
  }
  window.wkDrillCancel = () => closeCard(true);
  function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
      if (!MK && !TAP) { clearInterval(timer); timer = null; return; }
      const open = window.openVPanelId;
      if ((MK && MK.vid !== open) || (TAP && TAP.vid !== open)) {   // パネルを閉じた・別の動画にした
        if (MK) { KIT()?.setRate(MK.prevRate || 1); MK = null; }
        TAP = null; renderSlot(); return;
      }
      if (TAP) { const el = document.getElementById('vp-drill-tapnow'); if (el) el.textContent = fmt(KIT().now() ?? 0); return; }
      const t = KIT().now(); if (t == null) return;
      if (t >= MK.b || t < MK.a - 1.5) {
        if (t >= MK.b) MK.loops++;
        KIT().seek(MK.a);
        const el = document.getElementById('vp-drill-loops'); if (el) el.textContent = `🔁 ${MK.loops + 1}回目`;
      }
    }, 200);
  }
  function renderSlot() {
    const el = slot(); if (!el) return;
    if (TAP && TAP.vid === window.openVPanelId) {
      el.innerHTML = `<div class="dr-tap"><span>🏋️ 開始 <b>${fmt(Math.max(0, TAP.t - 2))}</b>（押した2秒前）→ いま <b id="vp-drill-tapnow">${fmt(TAP.t)}</b></span>
        <button class="dr-tap-end" onclick="wkDrillTapEnd()">■ ここまで</button><button class="dr-x" onclick="wkDrillTapCancel()">やめる</button></div>`;
      const b = document.getElementById('vp-drill-tap-' + TAP.vid); if (b) b.textContent = '■ ここまで';
      return;
    }
    document.querySelectorAll('[id^="vp-drill-tap-"]').forEach(b => { b.textContent = '🏋️ ここから'; });
    if (!MK || MK.vid !== window.openVPanelId) { el.innerHTML = ''; return; }
    const edge = (k, lab) => `<div class="dr-edge"><span class="dr-k">${lab}</span><div class="dr-adj">
        <button onclick="wkDrillNudge('${k}',-1)">−1s</button><span class="dr-v" id="vp-drill-${k}">${fmt(MK[k])}</span><button onclick="wkDrillNudge('${k}',1)">+1s</button>
        <button class="dr-now" onclick="wkDrillSetNow('${k}')">今の位置</button></div></div>`;
    el.innerHTML = `<div class="dr-card">
      <div class="dr-card-hd">🏋️ ${MK.id ? 'ドリルの区間を直す' : 'ドリルを作る'}<span id="vp-drill-loops">🔁 ${MK.loops + 1}回目</span></div>
      <input class="dr-name" id="vp-drill-name" value="${esc(MK.title)}" maxlength="120" placeholder="ドリルの名前" oninput="wkDrillName(this.value)">
      ${edge('a', '開始')}${edge('b', '終了')}
      <div class="dr-row">
        <button class="dr-mir${MK.mir ? ' on' : ''}" onclick="wkDrillMir()">⇋ 反転</button>
        ${[0.5, 0.75, 1].map(s => `<button class="dr-chip${MK.sp === s ? ' on' : ''}" onclick="wkDrillSp(${s})">×${s}</button>`).join('')}
      </div>
      <div class="dr-row">
        <button class="dr-x" onclick="wkDrillCancel()">やめる</button>
        <span class="dr-len" id="vp-drill-len">長さ ${fmt(MK.b - MK.a)}</span>
        <button class="dr-save" onclick="wkDrillSave()">${MK.id ? '保存' : 'ドリルに保存'}</button>
      </div>
    </div>`;
  }
  function syncEdge(k) {
    const ea = document.getElementById('vp-drill-a'), eb = document.getElementById('vp-drill-b'), ln = document.getElementById('vp-drill-len');
    if (ea) ea.textContent = fmt(MK.a); if (eb) eb.textContent = fmt(MK.b); if (ln) ln.textContent = '長さ ' + fmt(MK.b - MK.a);
    KIT().seek(k === 'a' ? MK.a : Math.max(MK.a, MK.b - 3));   // 終わりを動かしたら、終わりの3秒前から見せる
  }
  window.wkDrillNudge = function (k, d) {
    if (!MK) return;
    const dur = KIT().duration(MK.vid) || Infinity;
    MK[k] = Math.max(0, Math.min(dur, Math.round(MK[k]) + d));
    if (MK.b - MK.a < 1) { if (k === 'a') MK.a = MK.b - 1; else MK.b = MK.a + 1; }
    syncEdge(k);
  };
  window.wkDrillSetNow = function (k) {
    if (!MK) return;
    const t = KIT().now(); if (t == null) return;
    const v = Math.floor(t);
    if (k === 'a' ? v > MK.b - 1 : v < MK.a + 1) { toast('開始は終了より前にしてください'); return; }
    MK[k] = v; syncEdge(k);
  };
  window.wkDrillName = v => { if (MK) MK.title = v; };
  window.wkDrillMir = () => { if (!MK) return; MK.mir = !MK.mir; KIT().setMirror(MK.mir); renderSlot(); };
  window.wkDrillSp = s => { if (!MK) return; MK.sp = s; KIT().setRate(s); renderSlot(); };
  window.wkDrillSave = function () {
    if (!MK) return;
    const title = String(document.getElementById('vp-drill-name')?.value ?? MK.title).trim() || `${fmt(MK.a)}〜`;
    const old = MK.id ? drill(MK.id) : null;
    const d = old ? { ...old } : { id: newId('dr'), created: Date.now(), log: [], n: 0 };
    Object.assign(d, { vid: MK.vid, title: title.slice(0, 120), a: Math.round(MK.a * 10) / 10, b: Math.round(MK.b * 10) / 10, mir: !!MK.mir, sp: MK.sp });
    put('items', d);
    toast(old ? '🏋️ ドリルを直しました' : '🏋️ ドリルに保存しました（Drill タブで一覧）');
    closeCard(true);
    refreshBmButtons();
  };
  function refreshBmButtons() {
    const vid = window.openVPanelId; if (!vid) return;
    const bms = videoOf(vid)?.bookmarks || [];
    document.querySelectorAll(`#vp-bm-list-${CSS.escape(vid)} [data-bm-idx]`).forEach(row => {
      const b = row.querySelector('.vp-bm-drill'), bm = bms[Number(row.dataset.bmIdx)];
      if (b && bm) b.classList.toggle('on', window.wkDrillHas(vid, toSec(bm.time)));
    });
  }
  // 一覧の「区間を直す」: 動画パネルを開いて、同じカードで直す
  window.wkDrillEdit = function (id) {
    const d = drill(id); if (!d) return;
    if (!videoOf(d.vid)) { toast('元の動画がライブラリにありません'); return; }
    (window.vpOpenAt || window.openVPanel)?.(d.vid, d.a);
    let n = 0;
    const iv = setInterval(() => {
      if (++n > 40) { clearInterval(iv); return; }
      if (window.openVPanelId !== d.vid || !KIT()) return;
      clearInterval(iv);
      setTimeout(() => openCard({ vid: d.vid, id: d.id, title: d.title, a: d.a, b: d.b, mir: !!d.mir, sp: d.sp || 1, from: '一覧' }), 600);
    }, 150);
  };

  // ═════════ 一覧（Drill タブ） ═════════
  let sel = new Set(), openAct = null;
  function sorted() {
    const arr = drills();
    const vt = d => videoOf(d.vid)?.title || '';
    if (prefs.sort === 'new') return arr.sort((x, y) => (y.created || 0) - (x.created || 0));
    if (prefs.sort === 'video') return arr.sort((x, y) => vt(x).localeCompare(vt(y), 'ja') || x.a - y.a);
    return arr.sort((x, y) => (lastDone(x) ?? 0) - (lastDone(y) ?? 0) || (x.created || 0) - (y.created || 0));   // やっていない順（まだ＝いちばん上）
  }
  function ago(ts) {
    if (!ts) return 'まだやっていない';
    const days = Math.floor((Date.now() - ts) / 86400000);
    return days <= 0 ? '今日' : days === 1 ? '昨日' : `${days}日前`;
  }
  function thumbOf(v) {
    if (!v) return '';
    const yt = window._wkVYtId?.(v);
    if (yt) return v.thumb || `https://img.youtube.com/vi/${yt}/mqdefault.jpg`;
    if (v.pt === 'gdrive') return `https://drive.google.com/thumbnail?id=${encodeURIComponent(String(v.id).replace(/^gd-/, ''))}&sz=w320`;
    return v.thumb && !String(v.thumb).includes('vumbnail.com') ? v.thumb : '';
  }
  const lenOf = ids => ids.reduce((s, id) => { const d = drill(id); return s + (d ? d.b - d.a : 0); }, 0);

  window.renderDrills = function () {
    const el = document.getElementById('drillsTab'); if (!el) return;
    const all = sorted();
    sel = new Set([...sel].filter(id => drill(id)));
    const ms = menus();
    const row = d => {
      const v = videoOf(d.vid), th = thumbOf(v), last = lastDone(d);
      const old = last != null && Date.now() - last > 7 * 86400000;
      return `<div class="drl-row" data-id="${esc(d.id)}">
        <input type="checkbox" class="drl-ck" ${sel.has(d.id) ? 'checked' : ''} onchange="wkDrillSel('${esc(d.id)}',this.checked)" aria-label="選ぶ">
        <div class="drl-th" onclick="wkDrillRun(['${esc(d.id)}'])">${th ? `<img src="${esc(th)}" loading="lazy" alt="" onerror="this.remove()">` : ''}${d.mir ? '<em>⇋</em>' : ''}<b>${fmt(d.b - d.a)}</b></div>
        <div class="drl-bd">
          <div class="drl-tt">${esc(d.title)}</div>
          <div class="drl-mt">${v ? esc(v.title) : '<span class="drl-gone">元の動画がありません</span>'} · ${fmt(d.a)}–${fmt(d.b)}${d.sp && d.sp !== 1 ? ' · ×' + d.sp : ''}</div>
          <div class="drl-mt${old ? ' drl-old' : ''}">${ago(last)} · 計${Number(d.n) || 0}回</div>
        </div>
        <button class="drl-more" onclick="wkDrillAct('${esc(d.id)}')" aria-label="編集">⋯</button>
        <button class="drl-pl" onclick="wkDrillRun(['${esc(d.id)}'])" title="この1つを回す">▶</button>
      </div>${openAct === d.id ? `<div class="drl-acts">
        <button onclick="wkDrillEdit('${esc(d.id)}')">区間を直す</button>
        <button onclick="wkDrillRename('${esc(d.id)}')">名前を変える</button>
        ${ms.length ? `<select onchange="wkDrillToMenu('${esc(d.id)}',this.value);this.value=''"><option value="">メニューに入れる…</option>${ms.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select>` : ''}
        <button class="drl-del" onclick="wkDrillDelete('${esc(d.id)}')">削除</button>
      </div>` : ''}`;
    };
    el.innerHTML = `<div class="drl-wrap">
      <div class="drl-hd"><h2>🏋️ ドリル <small>${all.length}</small></h2></div>
      ${all.length ? '' : `<div class="drl-empty"><b>まだドリルがありません</b>
        動画パネルのブックマークの行の <b>🏋️</b> を押すと、そのチャプターがそのままドリルになります。<br>
        チャプターに無い所は、再生しながら見出しの <b>「🏋️ ここから」</b> を始まりと終わりで2回押します。</div>`}
      ${ms.length || all.length ? `<div class="drl-sec"><span class="drl-lbl">メニュー</span></div>
      <div class="drl-menus">
        ${ms.map(m => { const ids = m.ids.filter(id => drill(id)); return `<div class="drl-menu">
          <button class="drl-menu-run" onclick="wkDrillRunMenu('${esc(m.id)}')" ${ids.length ? '' : 'disabled'}><b>▶ ${esc(m.name)}</b><small>${ids.length}本 · ${fmt(lenOf(ids))}</small></button>
          <button class="drl-menu-ed" onclick="wkDrillMenuAct('${esc(m.id)}')" aria-label="メニューを編集">⋯</button></div>`; }).join('')}
        <button class="drl-menu drl-menu-add" onclick="wkDrillNewMenu()">＋ 選んだものでメニュー</button>
      </div>` : ''}
      ${all.length ? `<div class="drl-sec"><span class="drl-lbl">ドリル</span><span style="flex:1"></span>
        ${[['old', 'やっていない順'], ['new', '作った順'], ['video', '動画ごと']].map(([k, l]) => `<button class="drl-chip${prefs.sort === k ? ' on' : ''}" onclick="wkDrillSort('${k}')">${l}</button>`).join('')}</div>
      <div class="drl-list">${all.map(row).join('')}</div>` : ''}
      ${sel.size ? `<div class="drl-bar"><span>${sel.size}本を選択</span><button class="drl-bar-clr" onclick="wkDrillSelClear()">解除</button><button class="drl-bar-run" onclick="wkDrillRun(wkDrillSelIds())">▶ 回す</button></div>` : ''}
    </div>`;
  };
  function refreshAll() {
    if (document.getElementById('drillsTab')?.classList.contains('active')) window.renderDrills();
    if (RUN) renderRun();
  }
  window.wkDrillSel = (id, on) => { on ? sel.add(id) : sel.delete(id); window.renderDrills(); };
  window.wkDrillSelIds = () => sorted().map(d => d.id).filter(id => sel.has(id));
  window.wkDrillSelClear = () => { sel.clear(); window.renderDrills(); };
  window.wkDrillSort = k => { prefs.sort = k; savePrefs(); window.renderDrills(); };
  window.wkDrillAct = id => { openAct = openAct === id ? null : id; window.renderDrills(); };
  window.wkDrillRename = function (id) {
    const d = drill(id); if (!d) return;
    const name = prompt(tr('ドリルの名前'), d.title); if (name == null) return;
    const t = name.trim(); if (!t || t === d.title) return;
    put('items', { ...d, title: t.slice(0, 120) });
  };
  window.wkDrillDelete = function (id) {
    const d = drill(id); if (!d) return;
    if (!confirm(tr(`ドリル「${d.title}」を削除しますか？`) + '\n' + tr('（動画とブックマークはそのまま残ります）'))) return;
    openAct = null; sel.delete(id);
    put('items', { id, del: true });
    toast('ドリルを削除しました');
  };
  window.wkDrillToMenu = function (id, mid) {
    const m = S.menus[mid]; if (!m || m.del || !mid) return;
    if (m.ids.includes(id)) { toast('もう入っています'); return; }
    put('menus', { ...m, ids: [...m.ids, id] });
    toast(`「${m.name}」に入れました`);
  };
  window.wkDrillNewMenu = function () {
    const ids = window.wkDrillSelIds();
    if (!ids.length) { toast('先にドリルをチェックしてください'); return; }
    const name = prompt(tr('メニューの名前'), `${tr('メニュー')} ${menus().length + 1}`); if (name == null) return;
    put('menus', { id: newId('dm'), name: (name.trim() || `メニュー ${menus().length + 1}`).slice(0, 80), ids, created: Date.now() });
    sel.clear(); window.renderDrills();
    toast('メニューを作りました');
  };
  window.wkDrillMenuAct = function (mid) {
    const m = S.menus[mid]; if (!m || m.del) return;
    const ans = prompt(`${tr('メニュー')}「${m.name}」\n${tr('名前を変えるなら新しい名前を、削除するなら「削除」と入れてください。')}\n${tr('（中のドリルは消えません）')}`, m.name);
    if (ans == null) return;
    const t = ans.trim();
    if (t === '削除' || t.toLowerCase() === 'delete') { put('menus', { id: mid, del: true }); toast('メニューを削除しました'); return; }
    if (t && t !== m.name) put('menus', { ...m, name: t.slice(0, 80) });
  };
  window.wkDrillRunMenu = mid => { const m = S.menus[mid]; if (m && !m.del) window.wkDrillRun(m.ids.filter(id => drill(id))); };

  // ═════════ 回す（全画面） ═════════
  let RUN = null;   // {ids, i, reps, done, playedSec, started}
  const P = { kind: null, vid: null, yt: null, ytReady: false, video: null, playing: false, wake: null };
  let runTimer = null, lastTick = 0;

  window.wkDrillRun = function (ids) {
    ids = (ids || []).filter(id => drill(id));
    if (!ids.length) { toast('回せるドリルがありません'); return; }
    if (window.openVPanelId) window.closeVPanel?.();
    RUN = { ids, i: 0, reps: {}, done: false };
    sel.clear();
    let ov = document.getElementById('drill-run');
    if (!ov) { ov = document.createElement('div'); ov.id = 'drill-run'; document.body.appendChild(ov); }
    document.body.classList.add('drill-run-open');
    wakeOn();
    renderRun(true);
    loadCur();
    if (!runTimer) { lastTick = performance.now(); runTimer = setInterval(runTick, 200); }
  };
  window.wkDrillRunClose = function () {
    RUN = null;
    clearInterval(runTimer); runTimer = null;
    destroyPlayer();
    document.getElementById('drill-run')?.remove();
    document.body.classList.remove('drill-run-open');
    wakeOff();
    if (document.getElementById('drillsTab')?.classList.contains('active')) window.renderDrills();
  };
  const cur = () => RUN && drill(RUN.ids[RUN.i]);

  // ── 小さなプレーヤー（YouTube・Drive）。反転は枠ごと左右に反転（YouTube は操作部品を出さない＝鏡文字にならない） ──
  function destroyPlayer() {
    try { P.yt?.destroy(); } catch (e) {}
    try { P.video?.pause(); P.video?.removeAttribute('src'); P.video?.load(); } catch (e) {}
    Object.assign(P, { kind: null, vid: null, yt: null, ytReady: false, video: null, playing: false });
  }
  const box = () => document.getElementById('drr-player');
  function loadCur() {
    const d = cur(); if (!d) return;
    RUN.playedSec = 0; RUN.loops = 0;
    const v = videoOf(d.vid);
    const ytId = v ? window._wkVYtId?.(v) : '';
    if (P.vid === d.vid && ((P.kind === 'yt' && P.ytReady) || (P.kind === 'gd' && P.video))) { setRate(d.sp || 1); seek(d.a); play(); return; }
    destroyPlayer();
    const b = box(); if (!b) return;
    P.vid = d.vid;
    if (ytId) { P.kind = 'yt'; mountYt(b, ytId, d); return; }
    if (v && v.pt === 'gdrive') { P.kind = 'gd'; mountGd(b, String(v.id).replace(/^gd-/, ''), d); return; }
    P.kind = 'none';
    b.innerHTML = `<div class="drr-msg">${v ? 'この動画はここでは再生できません。' : '元の動画がライブラリにありません。'}
      ${v ? `<button onclick="wkDrillOpenInPanel()">動画パネルで開く（${fmt(d.a)}から）</button>` : ''}</div>`;
  }
  window.wkDrillOpenInPanel = () => { const d = cur(); if (!d) return; window.wkDrillRunClose(); (window.vpOpenAt || window.openVPanel)?.(d.vid, d.a); };
  function withYtApi(fn) {
    if (window.YT && window.YT.Player) return fn();
    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script'); tag.id = 'yt-iframe-api-script'; tag.src = 'https://www.youtube.com/iframe_api'; tag.async = true;
      document.head.appendChild(tag);
    }
    let n = 0; const iv = setInterval(() => { if (window.YT && window.YT.Player) { clearInterval(iv); fn(); } else if (++n > 75) { clearInterval(iv); const b = box(); if (b) b.innerHTML = '<div class="drr-msg">YouTube を読み込めませんでした</div>'; } }, 200);
  }
  function mountYt(b, ytId, d) {
    b.innerHTML = '<div id="drr-yt"></div>';
    const vid = d.vid;
    withYtApi(() => {
      if (!RUN || P.vid !== vid || !document.getElementById('drr-yt')) return;
      P.yt = new window.YT.Player('drr-yt', {
        videoId: ytId, width: '100%', height: '100%',
        playerVars: { start: Math.floor(d.a), autoplay: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: e => { P.ytReady = true; const c = cur(); if (!c) return; try { e.target.setPlaybackRate(c.sp || 1); e.target.seekTo(c.a, true); e.target.playVideo(); } catch (er) {} },
          onStateChange: e => { P.playing = e.data === 1; paintRun(); },
        },
      });
    });
  }
  function mountGd(b, fileId, d) {
    const token = window.getDriveTokenIfAvailable?.();
    if (!token) {
      b.innerHTML = '<div class="drr-auth"></div>';
      if (window._showGDriveAuthUI) window._showGDriveAuthUI(b.querySelector('.drr-auth'), fileId, () => { if (RUN && P.vid === d.vid) { P.vid = null; loadCur(); } });
      else b.innerHTML = '<div class="drr-msg">Googleにログインしてください</div>';
      return;
    }
    const v = document.createElement('video');
    v.src = `/api/drive?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}#t=${Math.floor(d.a)}`;
    v.autoplay = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.addEventListener('loadedmetadata', () => { const c = cur(); if (c) { v.playbackRate = c.sp || 1; if (Math.abs(v.currentTime - c.a) > 1.5) v.currentTime = c.a; } });
    v.addEventListener('play', () => { P.playing = true; paintRun(); });
    v.addEventListener('pause', () => { P.playing = false; paintRun(); });
    v.addEventListener('click', togglePlay);
    b.innerHTML = ''; b.appendChild(v); P.video = v;
    v.play().catch(() => {});
  }
  function now() {
    try {
      if (P.kind === 'yt' && P.ytReady) return P.yt.getCurrentTime();
      if (P.kind === 'gd' && P.video && P.video.readyState > 0) return P.video.currentTime;
    } catch (e) {}
    return null;
  }
  function seek(t) {
    try { if (P.kind === 'yt' && P.ytReady) P.yt.seekTo(t, true); if (P.kind === 'gd' && P.video) P.video.currentTime = t; } catch (e) {}
  }
  function play() { try { if (P.kind === 'yt' && P.ytReady) P.yt.playVideo(); if (P.kind === 'gd' && P.video) P.video.play().catch(() => {}); } catch (e) {} }
  function pause() { try { if (P.kind === 'yt' && P.ytReady) P.yt.pauseVideo(); if (P.kind === 'gd' && P.video) P.video.pause(); } catch (e) {} }
  function togglePlay() { P.playing ? pause() : play(); }
  function setRate(r) { try { if (P.kind === 'yt' && P.ytReady) P.yt.setPlaybackRate(r); if (P.kind === 'gd' && P.video) P.video.playbackRate = r; } catch (e) {} }
  async function wakeOn() { try { P.wake = await navigator.wakeLock?.request('screen'); } catch (e) { P.wake = null; } }
  function wakeOff() { try { P.wake?.release(); } catch (e) {} P.wake = null; }
  document.addEventListener('visibilitychange', () => { if (RUN && document.visibilityState === 'visible') wakeOn(); });

  function runTick() {
    const nowMs = performance.now(), dt = (nowMs - lastTick) / 1000; lastTick = nowMs;
    const d = cur(); if (!RUN || RUN.done || !d) return;
    if (P.playing) RUN.playedSec += dt;
    const t = now();
    if (t != null) {
      if (t >= d.b - 0.05) {
        RUN.loops++;
        if (prefs.adv === 'loops' && RUN.loops >= prefs.n) return next(true);
        seek(d.a);
      } else if (t < d.a - 1.5) seek(d.a);
    }
    if (prefs.adv === 'time' && RUN.playedSec >= prefs.secs) return next(true);
    paintRun();
  }
  function next(auto) {
    if (!RUN) return;
    if (RUN.i >= RUN.ids.length - 1) { RUN.done = true; pause(); renderRun(); return; }
    RUN.i++; renderRun(); loadCur();
    if (auto) toast('次のドリルへ');
  }
  window.wkDrillNext = () => next(false);
  window.wkDrillGo = i => { if (!RUN || i === RUN.i) return; RUN.i = i; RUN.done = false; renderRun(); loadCur(); };
  window.wkDrillRestart = () => { const d = cur(); if (d) { seek(d.a); play(); } };
  window.wkDrillToggle = togglePlay;
  window.wkDrillDid = function () {
    const d = cur(); if (!d) return;
    RUN.reps[d.id] = (RUN.reps[d.id] || 0) + 1;
    const log = [...(Array.isArray(d.log) ? d.log : []), Date.now()].slice(-LOG_MAX);
    put('items', { ...d, log, n: (Number(d.n) || 0) + 1 });
    toast(`✓ ${d.title}  +1`);
  };
  window.wkDrillRunMir = function () {
    const d = cur(); if (!d) return;
    put('items', { ...d, mir: !d.mir });   // そのドリルに覚える
    toast(!d.mir ? '⇋ 反転（このドリルに覚えました）' : '反転を外しました');
  };
  window.wkDrillRunSp = function (s) {
    const d = cur(); if (!d || d.sp === s) return;
    setRate(s); put('items', { ...d, sp: s });
  };
  window.wkDrillAdv = function (k) {
    if (prefs.adv === k) {   // もう一度押すと数を変える
      if (k === 'loops') { const L = [3, 5, 10, 20]; prefs.n = L[(L.indexOf(prefs.n) + 1) % L.length]; }
      if (k === 'time') { const L = [30, 60, 90, 120]; prefs.secs = L[(L.indexOf(prefs.secs) + 1) % L.length]; }
    }
    prefs.adv = k; savePrefs(); renderRun();
  };
  window.wkDrillMode = m => { prefs.mode = m; savePrefs(); renderRun(); };
  window.wkDrillAgain = () => { const ids = RUN?.ids; if (ids) { RUN = { ids, i: 0, reps: {}, done: false }; renderRun(); loadCur(); } };

  // 画面。プレーヤーの枠（#drr-player）は描き直さない（作り直すと再生が止まる）。まわりだけ描き直す
  function renderRun(first) {
    const ov = document.getElementById('drill-run'); if (!ov || !RUN) return;
    const d = cur(), mode = prefs.mode === 'B' ? 'B' : 'A';
    ov.className = 'drr drr-' + mode;
    if (first || !document.getElementById('drr-player')) {
      ov.innerHTML = `<div class="drr-in">
        <div class="drr-top" id="drr-top"></div>
        <div class="drr-stage"><div class="drr-mirtag" id="drr-mirtag">⇋ 反転中</div><div id="drr-frame" class="drr-frame"><div id="drr-player" class="drr-player"></div></div></div>
        <div class="drr-prog"><i id="drr-prog"></i></div>
        <div id="drr-body"></div></div>`;
    }
    const frame = document.getElementById('drr-frame');
    if (frame) frame.classList.toggle('mir', !!d?.mir);
    const mt = document.getElementById('drr-mirtag'); if (mt) mt.style.display = d?.mir ? '' : 'none';
    document.getElementById('drr-top').innerHTML = `<span class="drr-pos">${RUN.done ? '' : `${RUN.i + 1}/${RUN.ids.length}`}</span>
      <b class="drr-title">${RUN.done ? 'おつかれさま' : esc(d?.title || '')}</b>
      <span class="drr-seg"><button class="${mode === 'A' ? 'on' : ''}" onclick="wkDrillMode('A')">道場</button><button class="${mode === 'B' ? 'on' : ''}" onclick="wkDrillMode('B')">一覧</button></span>
      <button class="drr-close" onclick="wkDrillRunClose()">終わる</button>`;
    const body = document.getElementById('drr-body');
    const stage = ov.querySelector('.drr-stage');
    if (RUN.done) {
      if (stage) stage.style.display = 'none';
      body.innerHTML = `<div class="drr-done">${RUN.ids.map(id => { const x = drill(id); return x ? `<div>${esc(x.title)} — ${RUN.reps[id] || 0}回</div>` : ''; }).join('')}
        <div class="drr-done-btns"><button onclick="wkDrillAgain()">もう一周</button><button class="pri" onclick="wkDrillRunClose()">閉じる</button></div></div>`;
      return;
    }
    if (stage) stage.style.display = '';
    const nextD = drill(RUN.ids[RUN.i + 1]);
    const setRow = `<div class="drr-set">
      <button class="drr-mir${d?.mir ? ' on' : ''}" onclick="wkDrillRunMir()">⇋ 反転</button>
      ${[0.5, 0.75, 1].map(s => `<button class="${(d?.sp || 1) === s ? 'on' : ''}" onclick="wkDrillRunSp(${s})">×${s}</button>`).join('')}
      <span class="drr-br"></span><span class="drr-lab">次へ:</span>
      ${[['loops', `${prefs.n}回で`], ['time', `${prefs.secs}秒で`], ['hand', '手で']].map(([k, l]) => `<button class="${prefs.adv === k ? 'on' : ''}" onclick="wkDrillAdv('${k}')">${l}</button>`).join('')}
    </div>`;
    if (mode === 'A') {
      body.innerHTML = `<div class="drr-dots">${RUN.ids.map((_, i) => `<i class="${i < RUN.i ? 'done' : i === RUN.i ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="drr-cnt"><span>ループ <b id="drr-loop">1</b>${prefs.adv === 'loops' ? ` / ${prefs.n}` : ''}</span><span id="drr-left"></span><span>やった <b>${RUN.reps[d.id] || 0}</b></span></div>
        <div class="drr-bigs">
          <button onclick="wkDrillRestart()">↺<br>頭から</button>
          <button class="did" onclick="wkDrillDid()">✓ やった<small>+1回</small></button>
          <button onclick="wkDrillNext()">次へ →<small>${nextD ? esc(nextD.title) : 'おわり'}</small></button>
        </div>
        <div class="drr-ctl"><button id="drr-pp" onclick="wkDrillToggle()">❚❚</button></div>
        ${setRow}`;
    } else {
      body.innerHTML = `<div class="drr-ctl2">
          <button id="drr-pp" onclick="wkDrillToggle()">❚❚</button><button onclick="wkDrillRestart()">↺ 頭から</button>
          <span class="drr-sp"></span><span class="drr-l">ループ <b id="drr-loop">1</b>${prefs.adv === 'loops' ? '/' + prefs.n : ''} <span id="drr-left"></span></span>
          <button class="did" onclick="wkDrillDid()">✓ やった</button></div>
        ${setRow}
        <div class="drr-q">${RUN.ids.map((id, i) => { const x = drill(id); if (!x) return ''; const v = videoOf(x.vid);
          return `<div class="drr-qi${i === RUN.i ? ' cur' : i < RUN.i ? ' done' : ''}" onclick="wkDrillGo(${i})">
            <span class="no">${i < RUN.i ? '✓' : i + 1}</span><div class="bd">${esc(x.title)}<small>${v ? esc(v.title) : '元の動画がありません'} · ${fmt(x.b - x.a)}${x.mir ? ' · ⇋反転' : ''}</small></div>
            <span class="rp">${RUN.reps[id] || 0}回</span></div>`; }).join('')}</div>`;
    }
    paintRun();
  }
  function paintRun() {
    if (!RUN || RUN.done) return;
    const d = cur(); if (!d) return;
    const lp = document.getElementById('drr-loop'); if (lp) lp.textContent = (RUN.loops || 0) + 1;
    const pp = document.getElementById('drr-pp'); if (pp) pp.textContent = P.playing ? '❚❚ 止める' : '▶ 再生';
    const left = document.getElementById('drr-left');
    if (left) left.textContent = prefs.adv === 'time' ? `残り ${Math.max(0, Math.ceil(prefs.secs - (RUN.playedSec || 0)))}秒` : '';
    const t = now(), pg = document.getElementById('drr-prog');
    if (pg && t != null) pg.style.width = Math.max(0, Math.min(100, (t - d.a) / (d.b - d.a) * 100)) + '%';
  }
  document.addEventListener('keydown', e => { if (RUN && e.key === 'Escape') window.wkDrillRunClose(); });
})();
