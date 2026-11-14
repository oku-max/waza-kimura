// ═══ ドリル（v52.989・オーナー決定 mock-drill.html: 区間の合わせ方 A「±ボタン」／回す画面は A「道場モード」と B「一覧のまま」の両方） ═══
// 動画の中の1区間を「ドリル」として保存し、あとで一覧から回す（ループ・回数で次へ・反転・スロー）。
//
// 作る（動画パネルの中）:
//   ・ブックマークの行の DRILL … その時刻〜次のブックマーク（終わりの時刻があればそこ）がそのまま区間
//   ・見出しの「DRILL ここから」→「■ ここまで」… 再生しながら2回押す。押す遅れを見込んで開始は2秒前
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
  // ドリルの印（v52.991・オーナー決定 mock-drill2.html の③D「文字だけ DRILL」。絵文字はやめた）
  const PILL = '<span class="drl-pill">DRILL</span>';
  window.WK_DRILL_PILL = PILL;

  // ───────── 保存 ─────────
  let S = { uid: null, items: {}, menus: {}, conf: {} };   // conf: 表示の設定（テーブルの列 cols）。端末をまたいで同じにする
  (function load() {
    try {
      const o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && typeof o === 'object') {
        S.uid = typeof o.uid === 'string' ? o.uid : null;
        S.items = o.items && typeof o.items === 'object' ? o.items : {};
        S.menus = o.menus && typeof o.menus === 'object' ? o.menus : {};
        S.conf = o.conf && typeof o.conf === 'object' ? o.conf : {};
      }
    } catch (e) {}
  })();
  function persist() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { console.warn('[drills] 端末に保存できません', e); } }
  const okDrill = (e, id) => e && typeof e === 'object' && e.id === id && (e.del === true ||
    (typeof e.vid === 'string' && isFinite(e.a) && isFinite(e.b) && Number(e.b) > Number(e.a)));
  const okMenu = (e, id) => e && typeof e === 'object' && e.id === id && (e.del === true || Array.isArray(e.ids));
  const okConf = (e, id) => e && typeof e === 'object' && e.id === id && id === 'cols' && Array.isArray(e.order) && Array.isArray(e.hide);
  const okOf = kind => kind === 'items' ? okDrill : kind === 'menus' ? okMenu : okConf;
  const KINDS = ['items', 'menus', 'conf'];
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
    if (foreign) { S.items = {}; S.menus = {}; S.conf = {}; }
    for (const kind of KINDS) {
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
    raw: () => ({ items: S.items, menus: S.menus, conf: S.conf }),
    importMerge(data) {
      if (!data || typeof data !== 'object') return;
      for (const kind of KINDS) {
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
  // この動画のこの時刻から始まるドリルがあるか（前の版の呼び方。今はブックマークの区間で数える wkDrillBmCount）
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
  // ブックマークの区間に入っているドリル（開始がその区間の中）
  function bmDrills(vid, i) {
    const bm = videoOf(vid)?.bookmarks?.[i]; if (!bm) return [];
    const a = toSec(bm.time), b = bmEnd(vid, i);
    return drills().filter(d => d.vid === vid && d.a >= a - 0.5 && d.a < b).sort((x, y) => x.a - y.a || (x.created || 0) - (y.created || 0));
  }
  window.wkDrillBmCount = (vid, i) => bmDrills(vid, i).length;
  window.wkDrillBmLabel = (vid, i) => { const n = bmDrills(vid, i).length; return PILL + (n ? `<b class="drl-bm-n">${n}</b>` : ''); };
  // 同じブックマーク区間から何本でも作れる（v52.991・オーナー決定 mock-drill2.html の②A「押すと小さなメニュー」）。
  // ドリルが無い区間は今までどおり押せばすぐ作る。ある区間は「その区間のドリル（▶ 回す・直す）」と「＋ この区間でもう1本」。
  // 2本目からの名前は2回押しと同じ決まり（ブックマークの名前 2、3 …）。
  window.wkDrillFromBm = function (vid, i, btn) {
    if (!guard(vid)) return;
    const bm = videoOf(vid).bookmarks?.[i]; if (!bm) return;
    const a = toSec(bm.time), base = bm.label || `${fmt(a)}〜`;
    const mk = () => openCard({ vid, title: numberedName(vid, base), a, b: bmEnd(vid, i), from: 'ブックマーク' });
    const ks = bmDrills(vid, i);
    if (!ks.length || !btn) return mk();
    document.getElementById('drl-bm-pop')?.remove();
    const pop = document.createElement('div'); pop.id = 'drl-bm-pop'; pop.className = 'drl-bm-pop';
    pop.innerHTML = `<div class="drl-bm-pop-h">この区間のドリル</div>${ks.map(d => `<div class="drl-bm-pop-r"><b data-user-text="1">${esc(d.title)}</b><small>${fmt(d.a)}–${fmt(d.b)}</small>
      <button data-run="${esc(d.id)}" title="回す">▶</button><button data-edit="${esc(d.id)}">直す</button></div>`).join('')}
      <button class="drl-bm-pop-new" data-new="1">＋ この区間でもう1本</button>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', off, true); };
    const off = e => { if (!e.target.closest('#drl-bm-pop')) close(); };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; close();
      if (b.dataset.new) mk();
      else if (b.dataset.run) window.wkDrillRun([b.dataset.run]);
      else if (b.dataset.edit) { const d = drill(b.dataset.edit); if (d) openCard({ vid: d.vid, id: d.id, title: d.title, a: d.a, b: d.b, mir: !!d.mir, sp: d.sp || 1, from: '一覧' }); }
    });
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
    openCard({ vid, title: trackName(vid, a), a, b, from: '2回押し' });
  }
  // 2回押しで作ったドリルの名前（v52.990・オーナー「デフォルトはトラック名。同じトラックからつくった場合は番号をふってく」）。
  // トラック＝開始の時刻が入っているブックマーク（チャプター）。無ければ動画の名前。
  // 同じ動画に同じ名前（または「名前 N」）のドリルがあれば、いちばん大きい番号の次を付ける（最初の1本は番号なし）。
  // 名前を付けるだけ。今あるドリルの名前は書き換えない。
  function trackName(vid, a) {
    const v = videoOf(vid);
    const bm = (v?.bookmarks || []).filter(x => toSec(x.time) <= a + 1).sort((x, y) => toSec(x.time) - toSec(y.time)).pop();
    return numberedName(vid, String(bm?.label || v?.title || '').trim() || `${fmt(a)}〜`);
  }
  function numberedName(vid, base0) {
    const base = String(base0).trim().slice(0, 110);
    const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: (\\d+))?$');
    let max = 0;
    for (const d of drills()) { if (d.vid !== vid) continue; const m = String(d.title).match(re); if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1); }
    return max ? `${base} ${max + 1}` : base;
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
    document.getElementById('drl-bm-pop')?.remove();
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
      el.innerHTML = `<div class="dr-tap"><span>${PILL} 開始 <b>${fmt(Math.max(0, TAP.t - 2))}</b>（押した2秒前）→ いま <b id="vp-drill-tapnow">${fmt(TAP.t)}</b></span>
        <button class="dr-tap-end" onclick="wkDrillTapEnd()">■ ここまで</button><button class="dr-x" onclick="wkDrillTapCancel()">やめる</button></div>`;
      const b = document.getElementById('vp-drill-tap-' + TAP.vid); if (b) b.innerHTML = '■ ここまで';
      return;
    }
    document.querySelectorAll('[id^="vp-drill-tap-"]').forEach(b => { b.innerHTML = PILL + ' ここから'; });
    if (!MK || MK.vid !== window.openVPanelId) { el.innerHTML = ''; return; }
    const edge = (k, lab) => `<div class="dr-edge"><span class="dr-k">${lab}</span><div class="dr-adj">
        <button onclick="wkDrillNudge('${k}',-1)">−1s</button><span class="dr-v" id="vp-drill-${k}">${fmt(MK[k])}</span><button onclick="wkDrillNudge('${k}',1)">+1s</button>
        <button class="dr-now" onclick="wkDrillSetNow('${k}')">今の位置</button></div></div>`;
    el.innerHTML = `<div class="dr-card">
      <div class="dr-card-hd">${PILL} ${MK.id ? 'ドリルの区間を直す' : 'ドリルを作る'}<span id="vp-drill-loops">🔁 ${MK.loops + 1}回目</span></div>
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
    toast(old ? 'ドリルを直しました' : 'ドリルに保存しました（Drill タブで一覧）');
    closeCard(true);
    refreshBmButtons();
  };
  function refreshBmButtons() {
    const vid = window.openVPanelId; if (!vid) return;
    const bms = videoOf(vid)?.bookmarks || [];
    document.querySelectorAll(`#vp-bm-list-${CSS.escape(vid)} [data-bm-idx]`).forEach(row => {
      const b = row.querySelector('.vp-bm-drill'), i = Number(row.dataset.bmIdx);
      if (b && bms[i]) { b.classList.toggle('on', bmDrills(vid, i).length > 0); b.innerHTML = window.wkDrillBmLabel(vid, i); }
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

  // ═════════ 一覧（Drill タブ）— ライブラリと同じ作り（v52.991・オーナー「ライブラリ機能と同じフィルタUI」「マスタードリルとカスタムドリル」） ═════════
  // 左の欄（≡ で開く .lib-sidebar）・上のバー（.results-header）・カード（.card-list）・テーブル（.org-table）・
  // リストの窓（.cv-picker-modal）・フィルターの窓（unified-filter.js の uniOpen(…,'drill')）を、ライブラリと同じ部品で使う。
  // マスタードリル＝全部のドリル。カスタムドリル＝メニュー（S.menus）。
  // 絞り込みの状態はドリル用に別に持つ（F・ST）。ライブラリの window.filters / orgFilters には触らない。画面の中だけ（保存しない）。
  const L = { list: 'master', q: '', sb: false, bulk: false, actId: null };
  let sel = new Set();
  const F = { platform: new Set(), channel: new Set(), playlist: new Set(), videoIds: new Set() };   // タグの集合は tagFilter が足す
  const ST = { never: false, week: false, mir: false };
  if (!['card', 'table'].includes(prefs.view)) prefs.view = 'card';
  const SORTS = [['menu', 'カスタムドリルの順'], ['last', '最後にやった日'], ['created', '作った日'], ['title', '名前'], ['n', '回数'], ['len', '長さ'], ['video', '元の動画']];
  const sortOf = () => { const k = L.list === 'master' ? (prefs.msort || 'last') : (prefs.csort || 'menu'); return SORTS.some(x => x[0] === k) && !(k === 'menu' && L.list === 'master') ? k : 'last'; };
  const ascOf = () => L.list === 'master' ? (prefs.masc ?? true) : (prefs.casc ?? true);
  const curMenu = () => (L.list !== 'master' && S.menus[L.list] && !S.menus[L.list].del) ? S.menus[L.list] : null;
  function scope() {
    const m = curMenu();
    if (!m) { if (L.list !== 'master') L.list = 'master'; return drills(); }
    return m.ids.map(id => drill(id)).filter(Boolean);
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
  const TF = () => window.tagFilter;
  const videoFiltersOn = () => ['platform', 'channel', 'playlist'].some(k => F[k].size) || (TF() ? TF().hasAny(F, 'lib') : false);
  function videoPass() {   // 元の動画の絞り込み（フィルターの窓と同じ判定）
    const tagOk = TF() ? TF().compile(F, 'lib') : () => true;
    return v => !!v && (!F.platform.size || F.platform.has(v.pt || v.src || 'youtube')) && (!F.channel.size || F.channel.has(v.channel || v.ch))
      && (!F.playlist.size || F.playlist.has(v.pl)) && tagOk(v);
  }
  const stateOk = d => { const last = lastDone(d);
    return (!ST.never || last == null) && (!ST.week || last == null || Date.now() - last >= 7 * 86400000) && (!ST.mir || d.mir); };
  function queryOk() {
    const q = L.q.trim(); if (!q) return () => true;
    const parse = window._parseQuery, match = window._matchQuery;
    if (parse && match) { const pq = parse(q); return (d, v) => match({ ...(v || {}), title: d.title + ' / ' + (v?.title || '') }, pq, null); }
    const ws = q.toLowerCase().split(/\s+/);
    return (d, v) => { const h = (d.title + ' ' + (v?.title || '')).toLowerCase(); return ws.every(w => h.includes(w)); };
  }
  function shown() {
    const vp = videoPass(), vf = videoFiltersOn(), qo = queryOk();
    let arr = scope().filter(d => { const v = videoOf(d.vid); return (vf ? vp(v) : true) && stateOk(d) && qo(d, v); });
    const k = sortOf(), asc = ascOf();
    if (k === 'menu') return asc ? arr : arr.reverse();
    const val = d => k === 'last' ? (lastDone(d) || 0) : k === 'created' ? (d.created || 0) : k === 'n' ? (Number(d.n) || 0)
      : k === 'len' ? d.b - d.a : k === 'title' ? String(d.title) : (videoOf(d.vid)?.title || '') + '\u0000' + String(d.a).padStart(8, '0');
    arr = arr.slice().sort((x, y) => { const a = val(x), b = val(y); const c = typeof a === 'string' ? a.localeCompare(b, 'ja') : a - b; return asc ? c : -c; });
    return arr;
  }
  const stateCount = () => (ST.never ? 1 : 0) + (ST.week ? 1 : 0) + (ST.mir ? 1 : 0);

  // フィルターの窓（unified-filter.js）が読む窓口。_ctx === 'drill' のときだけ使われる
  window._drillUni = {
    get f() { return F; },
    base() { const ids = new Set(scope().map(d => d.vid)); return (window.videos || []).filter(v => ids.has(v.id) && !v.archived); },
    refresh() { renderMain(); window.uniSyncBadges?.(); },
    clear() { resetFilters(); },
    stateCount,
    stateItems(ctxVideos) {
      const ok = new Set(ctxVideos(null).map(v => v.id)), qo = queryOk();
      const base = scope().filter(d => (videoFiltersOn() ? ok.has(d.vid) : true) && qo(d, videoOf(d.vid)));
      const cnt = f => base.filter(f).length, wk = d => { const l = lastDone(d); return l == null || Date.now() - l >= 7 * 86400000; };
      return [{ name: 'まだやっていない', cnt: cnt(d => lastDone(d) == null), sel: ST.never, key: '@d-never' },
        { name: '1週間以上やっていない', cnt: cnt(wk), sel: ST.week, key: '@d-week' },
        { name: '⇋ 反転', cnt: cnt(d => d.mir), sel: ST.mir, key: '@d-mir' }];
    },
    toggleState(k) { const m = { '@d-never': 'never', '@d-week': 'week', '@d-mir': 'mir' }[k]; if (m) ST[m] = !ST[m]; },
    statePills() { return [ST.never && ['@d-never', 'まだやっていない'], ST.week && ['@d-week', '1週間以上やっていない'], ST.mir && ['@d-mir', '⇋ 反転']].filter(Boolean); },
    hitLabel() { return shown().length + ' 本'; },
    colHtml() {
      const arr = shown();
      const rows = arr.slice(0, 50).map(d => { const v = videoOf(d.vid), th = thumbOf(v);
        return `<div class="uni-vc-row" onclick="uniClose();wkDrillRun(['${esc(d.id)}'])">
          <div class="uni-vc-thumb">${th ? `<img src="${esc(th)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:3px" onerror="this.remove()">` : ''}</div>
          <div class="uni-vc-info"><div class="uni-vc-title">${esc(d.title)}</div><div class="uni-vc-meta">${v ? esc(v.title) : '元の動画がありません'} · ${fmt(d.a)}–${fmt(d.b)}</div></div></div>`; }).join('');
      const notice = arr.length ? `<div class="uni-vc-notice uni-vc-notice-sm"><span>${arr.length}本</span></div>` : '<div class="uni-vc-notice">条件に一致するドリルがありません</div>';
      return `<div class="uni-col uni-col-vc"><div class="uni-col-hdr"><span>該当ドリル</span></div><div class="uni-col-body">${notice}${rows}</div></div>`;
    },
  };
  function resetFilters() {
    Object.keys(F).forEach(k => F[k].clear?.()); ST.never = ST.week = ST.mir = false; L.q = '';
    const inp = document.getElementById('drl-si'); if (inp) inp.value = '';
    renderMain(); window.uniSyncBadges?.();
  }
  window.wkDrillResetFilters = resetFilters;

  const SEG = (on) => `<button class="wk-seg-btn${on === 'card' ? ' lvt-active' : ''}" onclick="wkDrillView('card')" title="カード"><svg class="wk-ic" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="1"/><rect x="8" y="8" width="4.5" height="4.5" rx="1"/></svg><span class="hdr-lbl">カード</span></button><button class="wk-seg-btn${on === 'table' ? ' lvt-active' : ''}" onclick="wkDrillView('table')" title="テーブル"><svg class="wk-ic" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5"/><path d="M1.5 5.2h11M1.5 8.8h11M5.2 5.2v7.3"/></svg><span class="hdr-lbl">テーブル</span></button>`;
  const BULK_IC = `<svg class="wk-ic" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5"/><path d="M4.3 7.2l1.9 1.9 3.6-3.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const BADGE = id => `<span id="${id}" style="display:none;background:rgba(107,63,212,.1);color:var(--accent);font-size:10px;padding:1px 8px;border-radius:10px;margin-left:4px;font-weight:700">0</span>`;

  // ── テーブルの列（v52.992・オーナー「列設定」）: 表示する列と並び。S.conf.cols に1件で持つ（端末をまたいで同じ） ──
  const COLS = [['video', '元の動画'], ['range', '区間'], ['len', '長さ'], ['mir', '反転'], ['sp', '速度'], ['last', '最後にやった日'], ['n', '回数'], ['created', '作った日']];
  const COL_DEF_HIDE = ['created'];
  function colsConf() {
    const c = S.conf.cols, known = COLS.map(x => x[0]);
    const order = (c && Array.isArray(c.order) ? c.order.filter(k => known.includes(k)) : []).filter((k, i, a) => a.indexOf(k) === i);
    known.forEach(k => { if (!order.includes(k)) order.push(k); });   // 知らない・欠けた列は足す（列が消えることはない）
    const hide = c && Array.isArray(c.hide) ? c.hide.filter(k => known.includes(k)) : COL_DEF_HIDE.slice();
    return { order, hide };
  }
  const colLabel = k => (COLS.find(x => x[0] === k) || [k, k])[1];
  function putCols(order, hide) { put('conf', { id: 'cols', order: order.slice(), hide: hide.slice() }); }
  function colMenuHTML() {
    const { order, hide } = colsConf();
    return '<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">表示する列（⠿ をつかんで並べ替え）</div>'
      + order.map(k => `<div class="cv-colmenu-row" data-cv-sort="drillcols" data-cv-id="${k}">
        <div class="cv-drag-handle" title="つかんで並べ替え"></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;flex:1">
          <input type="checkbox" ${hide.includes(k) ? '' : 'checked'} onchange="wkDrillColVis('${k}',this.checked)" style="accent-color:var(--accent);width:14px;height:14px">
          <span>${esc(colLabel(k))}</span></label></div>`).join('');
  }
  // 下から出る窓（ライブラリの列設定 toggleOrgColMenu と同じ作り）
  function sheet(id, html) {
    let ov = document.getElementById(id);
    if (ov) { ov.remove(); return null; }
    ov = document.createElement('div'); ov.id = id;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:290;display:flex;align-items:flex-end;justify-content:center';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.innerHTML = `<div style="background:var(--surface);border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.5);margin-bottom:12px;width:calc(100% - 24px);max-width:480px" onclick="event.stopPropagation()">
      <div id="${id}-panel" style="padding:16px 14px 20px;max-height:70dvh;overflow-y:auto">${html}</div></div>`;
    document.body.appendChild(ov);
    return ov;
  }
  window.wkDrillColMenu = () => sheet('drl-col-menu', colMenuHTML());
  window.wkDrillColVis = (k, on) => {
    const { order, hide } = colsConf();
    const h = on ? hide.filter(x => x !== k) : [...new Set([...hide, k])];
    if (h.length >= order.length) { toast('列を全部隠すことはできません'); const p = document.getElementById('drl-col-menu-panel'); if (p) p.innerHTML = colMenuHTML(); return; }
    putCols(order, h);
  };
  // ドラッグの並べ替えは、ライブラリと同じエンジン（custom-view.js の _wkSortGroups）を使う。
  // エンジンは「同じ集合の並べ替え」のときだけ commit を呼ぶ。ここでも並びの入れ替えだけを書く（列もドリルも消さない）
  window._wkSortGroups = window._wkSortGroups || {};
  window._wkSortGroups.drillcols = {
    ids: () => colsConf().order,
    commit: (newIds) => { const { order, hide } = colsConf(); if (newIds.length === order.length && newIds.every(k => order.includes(k))) putCols(newIds, hide); },
    render: () => { const p = document.getElementById('drl-col-menu-panel'); if (p) p.innerHTML = colMenuHTML(); },
  };
  // ── カスタムドリルの中の手動の並べ替え（v52.992・オーナー「手動並び変え」）──
  // 並べ替えるのは menus[id].ids の並びだけ。ids() に出していない id（消したドリル等）は元の位置のまま（_cvFillVisibleSlots と同じ考え方）
  function menuReorder(m, curVis, newVis) {
    const order = m.ids.slice();
    if (curVis.length !== newVis.length || [...curVis].sort().join() !== [...newVis].sort().join() || new Set(newVis).size !== newVis.length) return;
    const want = new Set(newVis), slots = [];
    order.forEach((id, i) => { if (want.has(id)) slots.push(i); });
    if (slots.length !== newVis.length) return;
    slots.forEach((pos, k) => { order[pos] = newVis[k]; });
    if (order.join() === m.ids.join()) return;
    put('menus', { ...m, ids: order });
  }
  const menuIdsAlive = m => m.ids.filter((id, i, a) => drill(id) && a.indexOf(id) === i);
  function orderHTML() {
    const m = curMenu(); if (!m) return '';
    const ids = menuIdsAlive(m);
    return `<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px;letter-spacing:.5px"><span data-user-text="1">${esc(m.name)}</span> の順（⠿ をつかんで並べ替え）</div>`
      + (ids.length ? ids.map((id, i) => { const d = drill(id), v = videoOf(d.vid);
        return `<div class="cv-colmenu-row" data-cv-sort="drillorder" data-cv-id="${esc(id)}">
          <div class="cv-drag-handle" title="つかんで並べ替え"></div>
          <span class="drl-ord-no">${i + 1}</span>
          <span class="drl-ord-bd"><b data-user-text="1">${esc(d.title)}</b><small data-user-text="1">${v ? esc(v.title) : '元の動画がありません'} · ${fmt(d.a)}–${fmt(d.b)}</small></span></div>`; }).join('')
        : '<div style="padding:10px 0;font-size:12px;color:var(--text3)">このカスタムドリルは空です</div>');
  }
  window.wkDrillOrderMenu = () => { if (curMenu()) sheet('drl-order-menu', orderHTML()); };
  window._wkSortGroups.drillorder = {
    ids: () => { const m = curMenu(); return m ? menuIdsAlive(m) : []; },
    commit: (newIds) => { const m = curMenu(); if (!m) return; menuReorder(m, menuIdsAlive(m), newIds);
      if (L.list !== 'master') { prefs.csort = 'menu'; prefs.casc = true; savePrefs(); } },
    render: () => { const p = document.getElementById('drl-order-menu-panel'); if (p) p.innerHTML = orderHTML(); },
  };
  // テーブルの行でも、カスタムドリルの順（昇順）で出しているときは ⠿ で並べ替えられる。出している行だけを入れ替える
  window._wkSortGroups.drillrows = {
    ids: () => manualOn() ? shown().map(d => d.id) : [],
    commit: (newIds) => { const m = curMenu(); if (m && manualOn()) menuReorder(m, shown().map(d => d.id), newIds); },
    render: () => renderMain(),
  };
  const manualOn = () => !!curMenu() && sortOf() === 'menu' && ascOf();

  window.renderDrills = function () {
    const el = document.getElementById('drillsTab'); if (!el) return;
    scope();   // 消えたカスタムドリルを開いていたらマスターへ
    const m = curMenu();
    el.innerHTML = `
    <div id="drlSbOverlay" class="${L.sb ? 'vis' : ''}" onclick="wkDrillSb(false)"></div>
    <div class="lib-sidebar${L.sb ? ' open' : ''}" id="drlSidebar">
      <div class="lib-sb-hdr" style="display:flex;align-items:center;gap:8px">
        <span class="lib-sb-hdr-title">↻ Drill</span>
        <button onclick="wkDrillNewMenu()" style="display:block;margin-left:auto;padding:4px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">＋ カスタムドリル</button>
      </div>
      <div class="lib-sb-body">
        <div class="lib-sb-section">
          <span class="lib-sb-sec-title">リスト</span>
          <div class="lib-sb-cv-box" style="display:flex;gap:4px;align-items:stretch">
            <button class="lvt-inner-btn" onclick="wkDrillPicker()" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px">
              <span style="flex-shrink:0">${m ? '📌' : '🏠'}</span>
              <span style="flex:1;min-width:0;overflow:hidden"><span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;word-break:break-all;text-align:left;white-space:normal"${m ? ' data-user-text="1"' : ''}>${m ? esc(m.name) : 'マスタードリル'}</span></span>
              <span style="font-size:9px;opacity:.55;flex-shrink:0">▾</span>
            </button>
          </div>
          <span class="lib-sb-sec-title">ビュー</span>
          <div class="lib-sb-master-box"><div class="wk-seg wk-seg-full">${SEG(prefs.view)}</div></div>
        </div>
        <div class="fs-scroll" style="flex:1">
          <div style="padding:0 12px 8px">
            <span style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);display:block;padding:10px 2px 7px">フィルター</span>
            <div class="lib-sb-filter-box">
              <div style="padding:8px 10px 6px;border-bottom:1px solid var(--border2)">
                <div class="lib-sb-search"><span style="color:var(--text3)">🔍</span>
                  <input id="drl-si" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search..." value="${esc(L.q)}" oninput="wkDrillQ(this.value)" style="flex:1"></div>
              </div>
              <div class="fs-acc-sec"><div class="fs-acc-hdr" onclick="uniOpen('src','drill')"><span><span>チャンネル・プレイリスト</span> ${BADGE('drl-uni-src-badge')}</span></div></div>
              <div class="fs-acc-sec"><div class="fs-acc-hdr" onclick="uniOpen('tag','drill')"><span><span>タグ</span> ${BADGE('drl-uni-tag-badge')}</span></div></div>
              <div class="fs-acc-sec" style="border-bottom:none"><div class="fs-acc-hdr" onclick="uniOpen('state','drill')"><span><span>その他</span> ${BADGE('drl-uni-state-badge')}</span></div></div>
            </div>
          </div>
          <div style="border-top:1px solid var(--border2);padding:10px 22px 0">
            <button class="wk-bulk-btn" onclick="wkDrillBulk(!${L.bulk})" style="width:100%;justify-content:center">${BULK_IC}<span>一括編集</span></button>
          </div>
          <div style="padding:8px 22px 12px">
            <button onclick="wkDrillResetFilters()" class="tab-bar-btn" style="width:100%;font-family:inherit;font-size:11px;text-align:center;border-radius:20px">フィルターをリセット</button>
          </div>
        </div>
      </div>
    </div>
    <div class="lib-main" id="drlMain">
      <div class="results-header${L.bulk ? ' bulk-transform' : ''}" id="drl-results-header">
        <div class="toolbar-normal">
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
            <button class="lib-sb-toggle${L.sb ? ' sb-open' : ''}" onclick="wkDrillSb(!${L.sb})">≡</button>
            <span class="results-count" id="drl-rc" style="white-space:nowrap"></span>
            <div class="wk-seg hdr-lvt" style="margin-left:6px">${SEG(prefs.view)}</div>
            <span class="wk-vsep"></span><button class="wk-bulk-btn" onclick="wkDrillBulk(true)">${BULK_IC}<span class="hdr-full">一括編集</span><span class="hdr-short">一括</span></button>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            ${m ? `<button class="bulk-btn drl-tool-btn" onclick="wkDrillOrderMenu()" title="このカスタムドリルの順を、つかんで並べ替える">⇅<span class="drl-tl"> 並べ替え</span></button>` : ''}
            ${prefs.view === 'table' ? `<button class="bulk-btn org-col-vis-btn org-settings-btn drl-tool-btn" onclick="wkDrillColMenu()" title="表示する列"><svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="vertical-align:-1px;margin-right:3px"><rect x="0" y="1" width="3" height="11" rx="1" fill="currentColor"/><rect x="5" y="1" width="3" height="11" rx="1" fill="currentColor"/><rect x="10" y="1" width="3" height="11" rx="1" fill="currentColor"/></svg><span class="drl-tl">列設定</span></button>` : ''}
            <button class="drl-run-all" onclick="wkDrillRunShown()" title="今出ているドリルを順に回す">▶ 回す</button>
            <select onchange="wkDrillSortKey(this.value)" style="font-size:11px;padding:4px 6px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:inherit;cursor:pointer">
              ${SORTS.filter(x => x[0] !== 'menu' || m).map(([k, l]) => `<option value="${k}"${sortOf() === k ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
            <button class="sort-dir-btn" onclick="wkDrillSortDir()" style="font-size:12px;padding:4px 7px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer" title="昇降順切替">${ascOf() ? '↑' : '↓'}</button>
          </div>
        </div>
        <div class="bulk-inline${L.bulk ? ' active' : ''}">
          <span class="bulk-inline-count" id="drl-bulk-count">${sel.size}本選択</span>
          <button class="bbt" onclick="wkDrillSelAll(true)">全選択</button>
          <button class="bbt" onclick="wkDrillSelAll(false)">解除</button>
          <button class="bbt bulk-inline-edit${sel.size ? ' has-sel' : ''}" onclick="wkDrillToMenuPick()">カスタムドリルに入れる</button>
          ${m ? `<button class="bbt bulk-inline-edit${sel.size ? ' has-sel' : ''}" onclick="wkDrillOutOfMenu()">このカスタムドリルから外す</button>` : ''}
          <button class="bbt bulk-inline-edit${sel.size ? ' has-sel' : ''}" onclick="wkDrillDeleteSel()">削除</button>
          <button class="bbt bulk-inline-close" onclick="wkDrillBulk(false)">✕</button>
        </div>
      </div>
      <div id="drl-body" class="drl-body"></div>
    </div>`;
    renderMain();
    window.uniSyncBadges?.();
  };
  function renderMain() {
    const body = document.getElementById('drl-body'); if (!body) return;
    const arr = shown(), all = scope();
    const rc = document.getElementById('drl-rc');
    if (rc) rc.textContent = arr.length === all.length ? `${all.length}本` : `${arr.length} / ${all.length}本`;
    const bc = document.getElementById('drl-bulk-count'); if (bc) bc.textContent = `${sel.size}本選択`;
    document.querySelectorAll('#drillsTab .bulk-inline-edit').forEach(b => b.classList.toggle('has-sel', sel.size > 0));
    if (!arr.length) {
      body.innerHTML = !drills().length ? `<div class="drl-empty"><b>まだドリルがありません</b>
          動画パネルのブックマークの行の ${PILL} を押すと、そのチャプターがそのままドリルになります。<br>
          チャプターに無い所は、再生しながら見出しの「${PILL} ここから」を始まりと終わりで2回押します。</div>`
        : curMenu() && !all.length ? `<div class="drl-empty"><b>このカスタムドリルは空です</b>マスタードリルで「一括編集」から選んで「カスタムドリルに入れる」、またはカードの ⋯ から入れます。</div>`
        : `<div class="org-empty" style="display:block"><div style="font-size:28px;margin-bottom:8px">🔍</div><div>ドリルが見つかりませんでした</div></div>`;
      return;
    }
    if (prefs.view === 'table') {
      const { order, hide } = colsConf(), vis = order.filter(k => !hide.includes(k));
      const sk = sortOf(), asc = ascOf(), man = manualOn();
      const sortable = { title: 'title', video: 'video', len: 'len', last: 'last', n: 'n', created: 'created' };
      // 列幅（v52.993・オーナー「列幅変えれるように」）: 見出しの右端をドラッグ。ライブラリと同じ addResizeHandle を使い、
      // 幅はライブラリの列幅と同じくこの端末だけに覚える（prefs.colW。スマホと PC で画面の幅が違うため）
      const cw = prefs.colW && typeof prefs.colW === 'object' ? prefs.colW : {};
      // 表は列ごとに幅を決める（table-layout:fixed・ライブラリの表と同じ）。決めていない列は既定の幅
      const DEFW = { title: 200, video: 200, range: 100, len: 64, mir: 56, sp: 60, last: 124, n: 60, created: 100 };
      const wOf = k => { const w = Number(cw[k]); return w >= 40 && w <= 800 ? w : DEFW[k] || 100; };
      const ws = k => `width:${wOf(k)}px;overflow:hidden;text-overflow:ellipsis;`;
      const th = (k, l) => `<th class="org-th" data-col="${k}" style="${ws(k)}${sortable[k] ? 'cursor:pointer' : ''}"${sortable[k] ? ` onclick="if(event.target.closest('.rh')||Date.now()-(window._drlResizedAt||0)<400)return;wkDrillSortKey('${sortable[k]}',true)"` : ''}><span>${l}</span>${sortable[k] ? `<span class="org-sort-ind" style="margin-left:3px;font-size:9px;opacity:${sk === sortable[k] ? 1 : .4}">${sk === sortable[k] ? (asc ? '▲' : '▼') : '⇅'}</span>` : ''}</th>`;
      const cell0 = (k, d, v) => k === 'video' ? `<td class="org-td" data-col="video" style="font-size:11px;color:var(--text2)" data-user-text="1">${v ? esc(v.title) : '<span style="color:var(--danger)">元の動画がありません</span>'}</td>`
        : k === 'range' ? `<td class="org-td" data-col="range" style="font-size:11px;white-space:nowrap">${fmt(d.a)}–${fmt(d.b)}</td>`
        : k === 'len' ? `<td class="org-td" data-col="len" style="font-size:11px;white-space:nowrap;text-align:right">${fmt(d.b - d.a)}</td>`
        : k === 'mir' ? `<td class="org-td" data-col="mir" style="font-size:11px">${d.mir ? '<span class="drl-mir-b">⇋</span>' : '—'}</td>`
        : k === 'sp' ? `<td class="org-td" data-col="sp" style="font-size:11px">×${d.sp || 1}</td>`
        : k === 'last' ? `<td class="org-td" data-col="last" style="font-size:11px;white-space:nowrap">${ago(lastDone(d))}</td>`
        : k === 'n' ? `<td class="org-td" data-col="n" style="font-size:11px;text-align:right">${Number(d.n) || 0}</td>`
        : k === 'created' ? `<td class="org-td" data-col="created" style="font-size:11px;white-space:nowrap;color:var(--text3)">${d.created ? new Date(d.created).toISOString().slice(0, 10) : '—'}</td>` : '';
      const cell = (k, d, v) => cell0(k, d, v).replace('style="', `style="${ws(k)}`);
      const fixedW = (man ? 28 : 0) + (L.bulk ? 40 : 0) + 76 + 44;
      const tableW = fixedW + wOf('title') + vis.reduce((n, k) => n + wOf(k), 0);
      body.innerHTML = `<div class="org-table-wrap drl-table-wrap"><table class="org-table" style="table-layout:fixed;width:${tableW}px"><thead><tr>
        ${man ? '<th class="org-th" style="width:28px"></th>' : ''}${L.bulk ? '<th class="org-th" style="width:40px"></th>' : ''}<th class="org-th" style="width:76px"></th>
        ${th('title', 'ドリル')}${vis.map(k => th(k, colLabel(k))).join('')}<th class="org-th" style="width:44px"></th></tr></thead><tbody>
        ${arr.map(d => { const v = videoOf(d.vid), tn = thumbOf(v);
          return `<tr class="org-tr"${man ? ` data-cv-sort="drillrows" data-cv-id="${esc(d.id)}"` : ''}>
            ${man ? '<td class="org-td" style="padding:0 2px"><div class="cv-drag-handle" title="つかんで並べ替え"></div></td>' : ''}
            ${L.bulk ? `<td class="org-td" style="padding:6px"><input type="checkbox" ${sel.has(d.id) ? 'checked' : ''} onchange="wkDrillSel('${esc(d.id)}',this.checked)" style="accent-color:var(--accent);width:16px;height:16px"></td>` : ''}
            <td class="org-td" style="padding:6px 8px">${tn ? `<img class="org-thumb" src="${esc(tn)}" onclick="wkDrillRun(['${esc(d.id)}'])" onerror="this.style.background='var(--surface3)'">` : ''}</td>
            <td class="org-td" data-col="title" onclick="wkDrillRun(['${esc(d.id)}'])" style="${ws('title')}cursor:pointer"><div class="org-title-text" data-user-text="1">${esc(d.title)}</div></td>
            ${vis.map(k => cell(k, d, v)).join('')}
            <td class="org-td"><button class="ca-btn" onclick="wkDrillAct('${esc(d.id)}',this)">⋯</button></td>
          </tr>`; }).join('')}</tbody></table></div>`;
      const tbl = body.querySelector('.org-table');
      // ドラッグ中は表の幅を列幅の合計に合わせ直す（ほかの列が押されて縮まないように）
      const fitTable = () => { tbl.style.width = [...tbl.querySelectorAll('thead th')].reduce((n, x) => n + (parseFloat(x.style.width) || x.offsetWidth), 0) + 'px'; };
      if (window.addResizeHandle) body.querySelectorAll('.org-table th[data-col]').forEach(h => window.addResizeHandle(h, fitTable, () => {
        window._drlResizedAt = Date.now();   // 離した直後のクリックで並べ替えが動かないように
        const w = Math.round(h.offsetWidth), k = h.dataset.col;
        if (!(w >= 40)) return;
        prefs.colW = { ...(prefs.colW && typeof prefs.colW === 'object' ? prefs.colW : {}), [k]: Math.min(800, w) };
        savePrefs(); setTimeout(renderMain, 0);
      }));
      return;
    }
    body.innerHTML = `<div class="card-list">${arr.map(d => { const v = videoOf(d.vid), th = thumbOf(v), last = lastDone(d);
      const old = last != null && Date.now() - last > 7 * 86400000;
      return `<div class="card-wrap"><div class="card" data-id="${esc(d.id)}">
        <div class="card-sel-ov ${L.bulk ? 'vis' : ''}"><div class="sel-circle ${sel.has(d.id) ? 'chk' : ''}" onclick="event.stopPropagation();wkDrillSel('${esc(d.id)}',${!sel.has(d.id)})">${sel.has(d.id) ? '✓' : ''}</div></div>
        <div class="card-main"><div class="card-tcol"><div class="card-thumb" onclick="${L.bulk ? `wkDrillSel('${esc(d.id)}',${!sel.has(d.id)})` : `wkDrillRun(['${esc(d.id)}'])`}">
          ${th ? `<img src="${esc(th)}" onerror="this.style.display='none'">` : ''}
          <div class="play-ov"><div class="play-btn">▶</div></div>
          ${d.mir ? '<span class="drl-mir-badge">⇋ 反転</span>' : ''}
          <div class="dur-badge">${fmt(d.a)}–${fmt(d.b)} · ${fmt(d.b - d.a)}</div></div></div>
          <div class="card-body"><div class="card-title" data-user-text="1">${esc(d.title)}</div>
            <div class="drl-card-meta" data-user-text="1">${v ? esc(v.title) : '<span style="color:var(--danger)">元の動画がありません</span>'}</div>
            <div class="drl-card-meta${old ? ' drl-old' : ''}">${ago(last)} · 計${Number(d.n) || 0}回${d.sp && d.sp !== 1 ? ' · ×' + d.sp : ''}</div></div></div>
        <div class="card-actions"><button class="ca-btn" onclick="event.stopPropagation();wkDrillEdit('${esc(d.id)}')">区間を直す</button><button class="ca-btn" onclick="event.stopPropagation();wkDrillAct('${esc(d.id)}',this)">⋯</button></div>
      </div></div>`; }).join('')}</div>`;
    window.loadGdriveCardThumbs?.();
  }
  function refreshAll() {
    if (document.getElementById('drillsTab')?.classList.contains('active')) {
      if (document.getElementById('drl-body')) renderMain(); else window.renderDrills();
    }
    if (document.getElementById('drl-picker-overlay')?.style.display === 'flex') window.wkDrillPicker();
    { const p = document.getElementById('drl-col-menu-panel'); if (p && !document.body.classList.contains('cv-sorting')) p.innerHTML = colMenuHTML(); }
    { const p = document.getElementById('drl-order-menu-panel'); if (p && !document.body.classList.contains('cv-sorting')) p.innerHTML = orderHTML(); }
    if (RUN) renderRun();
  }
  window.wkDrillSb = on => { L.sb = !!on; window.renderDrills(); };
  window.wkDrillView = k => { prefs.view = k; savePrefs(); window.renderDrills(); };
  window.wkDrillQ = q => { L.q = q; renderMain(); };
  window.wkDrillSortKey = (k, fromHead) => {
    const master = L.list === 'master';
    if (fromHead && sortOf() === k) { if (master) prefs.masc = !ascOf(); else prefs.casc = !ascOf(); }
    else if (master) prefs.msort = k; else prefs.csort = k;
    savePrefs(); window.renderDrills();
  };
  window.wkDrillSortDir = () => { if (L.list === 'master') prefs.masc = !ascOf(); else prefs.casc = !ascOf(); savePrefs(); window.renderDrills(); };
  window.wkDrillBulk = on => { L.bulk = !!on; if (!on) sel.clear(); window.renderDrills(); };
  window.wkDrillSel = (id, on) => { on ? sel.add(id) : sel.delete(id); renderMain(); };
  window.wkDrillSelAll = on => { if (on) shown().forEach(d => sel.add(d.id)); else sel.clear(); renderMain(); };
  window.wkDrillSelIds = () => shown().map(d => d.id).filter(id => sel.has(id));
  window.wkDrillRunShown = () => window.wkDrillRun(shown().map(d => d.id));

  // ── リストの窓（ライブラリの cv-picker-modal と同じ作り） ──
  window.wkDrillPicker = function () {
    let ov = document.getElementById('drl-picker-overlay');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'drl-picker-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9100;display:flex;align-items:center;justify-content:center';
      ov.addEventListener('click', e => { if (e.target === ov) window.wkDrillPickerClose(); });
      document.body.appendChild(ov);
    }
    const isM = L.list === 'master';
    const items = menus().map(m => { const ids = m.ids.filter(id => drill(id)), on = L.list === m.id;
      return `<div class="cv-picker-item${on ? ' active' : ''}" onclick="wkDrillPick('${esc(m.id)}')">
        <span class="cv-picker-icon">📌</span>
        <span class="cv-picker-info"><span class="cv-picker-name" data-user-text="1">${esc(m.name)}</span><span class="cv-picker-meta">${ids.length}本 · ${fmt(lenOf(ids))}</span></span>
        <span class="cv-picker-check">${on ? '✓' : ''}</span>
        <button class="cv-picker-edit-btn" onclick="event.stopPropagation();wkDrillMenuEdit('${esc(m.id)}',this)">編集</button></div>`; }).join('');
    ov.innerHTML = `<div class="cv-picker-modal">
      <div class="cv-picker-header"><span style="font-size:14px;font-weight:700">リスト</span>
        <button onclick="wkDrillPickerClose()" style="border:none;background:var(--surface2);color:var(--text3);border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">✕</button></div>
      <div class="cv-picker-body">
        <div class="cv-picker-item${isM ? ' active' : ''}" onclick="wkDrillPick('master')"><span class="cv-picker-icon">🏠</span>
          <span class="cv-picker-info"><span class="cv-picker-name">マスタードリル</span><span class="cv-picker-meta">全部のドリル · ${drills().length}本</span></span>
          <span class="cv-picker-check">${isM ? '✓' : ''}</span></div>
        <div class="cv-picker-divider"></div>
        <div style="display:flex;align-items:center;gap:6px;padding:8px 16px 4px"><span style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.04em;flex:1">カスタムドリル</span></div>
        ${items || '<div style="padding:10px 16px;font-size:12px;color:var(--text3)">カスタムドリルがありません</div>'}
        <div class="cv-picker-item cv-picker-new" onclick="wkDrillPickerClose();wkDrillNewMenu()">
          <span class="cv-picker-icon" style="color:var(--accent);font-size:18px">＋</span>
          <span class="cv-picker-info"><span class="cv-picker-name" style="color:var(--accent)">新しいカスタムドリルを作成</span><span class="cv-picker-meta">空で作って、あとから入れる</span></span></div>
      </div></div>`;
    ov.style.display = 'flex';
  };
  window.wkDrillPickerClose = () => { const ov = document.getElementById('drl-picker-overlay'); if (ov) ov.style.display = 'none'; document.getElementById('drl-pop')?.remove(); };
  window.wkDrillPick = id => { L.list = id; sel.clear(); L.sb = false; window.wkDrillPickerClose(); window.renderDrills(); };
  // 小さなメニュー（リストの窓の「編集」と同じ cv-picker-edit-menu の形）
  function popMenu(btn, items, host) {
    document.getElementById('drl-pop')?.remove();
    const m = document.createElement('div'); m.id = 'drl-pop'; m.className = 'cv-picker-edit-menu';
    m.innerHTML = items.map(([k, l]) => `<button data-act="${k}">${l}</button>`).join('');
    (host || document.body).appendChild(m);
    if (!host) Object.assign(m.style, { position: 'fixed', zIndex: 9200 });
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + 'px';
    m.style.top = (r.bottom + 4 + mh > window.innerHeight - 8 ? Math.max(8, r.top - 4 - mh) : r.bottom + 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!e.target.closest('#drl-pop')) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
    return new Promise(res => m.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; e.stopPropagation(); m.remove(); res(b.dataset.act); }));
  }
  window.wkDrillMenuEdit = async function (mid, btn) {
    const act = await popMenu(btn, [['rename', '✏️ <span>名前を変える</span>'], ['del', '🗑 <span>削除</span>']], document.getElementById('drl-picker-overlay'));
    const m = S.menus[mid]; if (!m || m.del) return;
    if (act === 'rename') {
      const name = prompt(tr('カスタムドリルの名前'), m.name); if (name == null) return;
      const t = name.trim(); if (t && t !== m.name) put('menus', { ...m, name: t.slice(0, 80) });
    } else if (act === 'del') {
      if (!confirm(tr(`カスタムドリル「${m.name}」を削除しますか？`) + '\n' + tr('（中のドリルは消えません）'))) return;
      if (L.list === mid) L.list = 'master';
      put('menus', { id: mid, del: true }); toast('カスタムドリルを削除しました'); window.renderDrills();
    }
  };
  window.wkDrillAct = async function (id, btn) {
    const ms = menus();
    const act = await popMenu(btn, [['edit', '✂️ <span>区間を直す</span>'], ['rename', '✏️ <span>名前を変える</span>'],
      ...(ms.length ? [['menu', '📌 <span>カスタムドリルに入れる</span>']] : []), ...(curMenu() ? [['out', '↩ <span>このカスタムドリルから外す</span>']] : []), ['del', '🗑 <span>削除</span>']]);
    if (act === 'edit') window.wkDrillEdit(id);
    else if (act === 'rename') window.wkDrillRename(id);
    else if (act === 'menu') window.wkDrillToMenuPick(btn, [id]);   // 一括の選択（sel）は使わない・変えない
    else if (act === 'out') window.wkDrillOutOfMenu([id]);
    else if (act === 'del') window.wkDrillDelete(id);
  };
  window.wkDrillRename = function (id) {
    const d = drill(id); if (!d) return;
    const name = prompt(tr('ドリルの名前'), d.title); if (name == null) return;
    const t = name.trim(); if (!t || t === d.title) return;
    put('items', { ...d, title: t.slice(0, 120) });
  };
  window.wkDrillDelete = function (id) {
    const d = drill(id); if (!d) return;
    if (!confirm(tr(`ドリル「${d.title}」を削除しますか？`) + '\n' + tr('（動画とブックマークはそのまま残ります）'))) return;
    sel.delete(id);
    put('items', { id, del: true });
    toast('ドリルを削除しました');
  };
  window.wkDrillDeleteSel = function () {
    const ids = window.wkDrillSelIds(); if (!ids.length) return;
    if (!confirm(tr(`${ids.length}本のドリルを削除しますか？`) + '\n' + tr('（動画とブックマークはそのまま残ります）'))) return;
    ids.forEach(id => put('items', { id, del: true })); sel.clear(); toast(`${ids.length}本のドリルを削除しました`); renderMain();
  };
  // 選んだドリルをカスタムドリルに入れる（足すだけ・同じものは入れない）
  window.wkDrillToMenuPick = async function (btn, only) {
    const fromSel = !Array.isArray(only);
    const ids = (fromSel ? window.wkDrillSelIds() : only).filter(id => drill(id));
    if (!ids.length) { toast('先にドリルを選んでください'); return; }
    const ms = menus().filter(m => m.id !== L.list);
    const anchor = btn || document.querySelector('#drillsTab .bulk-inline-edit') || document.body;
    const act = await popMenu(anchor, [...ms.map(m => ['m:' + m.id, `📌 <span data-user-text="1">${esc(m.name)}</span>`]), ['new', '＋ <span>新しいカスタムドリルを作って入れる</span>']]);
    if (act === 'new') return window.wkDrillNewMenu(ids);
    if (!act) return;
    const m = S.menus[act.slice(2)]; if (!m || m.del) return;
    const add = ids.filter(id => !m.ids.includes(id));
    if (!add.length) { toast('もう入っています'); return; }
    put('menus', { ...m, ids: [...m.ids, ...add] });
    toast(`「${m.name}」に${add.length}本入れました`); if (fromSel) { sel.clear(); renderMain(); }
  };
  window.wkDrillToMenu = function (id, mid) {   // 1本だけ入れる（前の版の呼び方）
    const m = S.menus[mid]; if (!m || m.del || !mid) return;
    if (m.ids.includes(id)) { toast('もう入っています'); return; }
    put('menus', { ...m, ids: [...m.ids, id] });
    toast(`「${m.name}」に入れました`);
  };
  window.wkDrillOutOfMenu = function (only) {
    const m = curMenu(); if (!m) return;
    const ids = new Set(Array.isArray(only) ? only : window.wkDrillSelIds()); if (!ids.size) return;
    put('menus', { ...m, ids: m.ids.filter(id => !ids.has(id)) });   // ドリル自体は消さない
    toast(`${ids.size}本をこのカスタムドリルから外しました（ドリルは残ります）`); sel.clear(); renderMain();
  };
  window.wkDrillNewMenu = function (preIds) {
    const ids = Array.isArray(preIds) ? preIds : [];   // 空でも作れる（v52.990）
    const name = prompt(tr('カスタムドリルの名前'), `${tr('カスタムドリル')} ${menus().length + 1}`); if (name == null) return;
    const id = newId('dm');
    put('menus', { id, name: (name.trim() || `${tr('カスタムドリル')} ${menus().length + 1}`).slice(0, 80), ids, created: Date.now() });
    sel.clear(); L.bulk = false; L.list = id; window.renderDrills();
    toast(ids.length ? 'カスタムドリルを作りました' : '空のカスタムドリルを作りました（ドリルの ⋯ から入れられます）');
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
