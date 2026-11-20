// ═══ AI ボタンと、作成中の帯を1本にまとめる（v53.024・オーナー決定 mock-ai-menu.html） ═══
// 動画パネルのブックマークの見出しの「AI」を押すと、字幕生成・自動チャプター・要約が一言の説明つきで並び、
// 「実行」で始まる。実行は、今までのボタンを押したのと同じ関数を引数なしで呼ぶだけ
// （vpGenSubtitle(id) / vpGenChapters(id) / vpSumRangeOpen(id)）。中の流れは変えない。
//
// 字幕が無いと進めないもの（要約）は、字幕が無いと分かった時点で押せない（オーナー指示）。
// 字幕の有無は _vpAiKit.subsOf（vpanel.js）で、確かめられなかったときは「無い」と言わない。
//
// 作成中の帯（左下）は3つで1本（wkAiJobs）。1件なら今までの帯と同じ見た目、2件以上なら
// 「AI 2件 作成中」になり、押すと1件ずつの一覧が開く。各機能は自分の状態を set / clear で知らせるだけ。
// 状態は画面の中だけ（保存しない・動画のデータに書かない）。
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const ORDER = ['sub', 'chap', 'sum'];

  // ── 作成中の帯（1本） ──
  // job: { phase:'run'|'done'|'fail', title, label, start, go, onGo, dock }
  //   dock … 帯に出すか（窓が開いている間は出さない。数えるのは AI ボタンの件数）
  const jobs = {};
  let listOpen = false, clock = null;
  function render() {
    let dock = document.getElementById('vp-ai-dock');
    const ks = ORDER.filter(k => jobs[k] && jobs[k].dock);
    if (!ks.length) { dock?.remove(); listOpen = false; }
    else {
      if (!dock) { dock = document.createElement('div'); dock.id = 'vp-ai-dock'; dock.className = 'vp-ai-dock'; document.body.appendChild(dock); }
      const row = (k, solo) => {
        const j = jobs[k];
        const lead = j.phase === 'run' ? '<span class="vp-flow-spin"></span>' : j.phase === 'fail' ? '<span>⚠️</span>' : '<span>✔</span>';
        const el = j.phase === 'run' && j.start ? ` · <span class="vp-ai-el" data-k="${k}">${fmt(Date.now() - j.start)}</span>` : '';
        const sm = [j.label, j.title].filter(Boolean).join(' · ');
        return `<div class="vp-ai-row${solo ? ' solo' : ''}" data-ai-kind="${k}">${lead}<span class="vp-chap-chip-t"><b>${esc(j.head)}</b>${el}<small>${esc(sm)}</small></span>`
          + (j.go ? `<i data-go="${k}">${esc(j.go)}</i>` : '')
          + (j.phase !== 'run' ? `<button class="vp-ai-x" data-x="${k}" title="消す">✕</button>` : '') + '</div>';
      };
      if (ks.length === 1) dock.innerHTML = row(ks[0], true);
      else {
        const run = ks.filter(k => jobs[k].phase === 'run').length, fin = ks.length - run;
        // 英語表示で訳せるよう、1つの言い回しを1つの文字のかたまりにする（i18n の TEMPLATE_AUTO '#件 作成中' 等）
        const head = (run ? `<span>${run}件 作成中</span>` : '') + (run && fin ? ' · ' : '') + (fin ? `<span>${fin}件 完了</span>` : '');
        dock.innerHTML = `<div class="vp-ai-head" data-toggle>${run ? '<span class="vp-flow-spin"></span>' : '<span>✔</span>'}<span class="vp-chap-chip-t"><b>AI ${head}</b><small>${ks.map(k => `<span>${esc(jobs[k].name)}</span>`).join(' · ')}</small></span><i>${listOpen ? '閉じる' : '一覧'}</i></div>`
          + (listOpen ? `<div class="vp-ai-list">${ks.map(k => row(k, false)).join('')}</div>` : '');
      }
      dock.onclick = e => {
        const x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); clear(x.dataset.x); return; }
        if (e.target.closest('[data-toggle]')) { listOpen = !listOpen; render(); return; }
        const r = e.target.closest('[data-ai-kind]'); if (r) open(r.dataset.aiKind);
      };
    }
    // AI ボタンの件数（窓が開いていても数える）
    document.querySelectorAll('.vp-ai-btn').forEach(b => { b.innerHTML = window._wkAiBtnInner(); });
    const anyRun = ORDER.some(k => jobs[k] && jobs[k].phase === 'run' && jobs[k].start);
    if (anyRun && !clock) clock = setInterval(tick, 1000);
    if (!anyRun && clock) { clearInterval(clock); clock = null; }
    if (menuId) renderMenu();
  }
  function tick() {
    document.querySelectorAll('.vp-ai-el').forEach(e => { const j = jobs[e.dataset.k]; if (j && j.start) e.textContent = fmt(Date.now() - j.start); });
    document.querySelectorAll('.vp-ai-mel').forEach(e => { e.textContent = fmt(Date.now() - Number(e.dataset.start)); });
  }
  const NAME = { sub: '字幕生成', chap: '自動チャプター', sum: '要約' };
  function set(kind, o) {
    jobs[kind] = Object.assign({ name: NAME[kind], dock: true }, jobs[kind] && jobs[kind].phase === o.phase ? jobs[kind] : {}, o);
    clearTimeout(jobs[kind]._t);
    if (o.ttl) jobs[kind]._t = setTimeout(() => clear(kind), o.ttl);
    render();
  }
  function clear(kind) { if (!jobs[kind]) return; clearTimeout(jobs[kind]._t); delete jobs[kind]; render(); }
  function open(kind) {
    const j = jobs[kind]; if (!j) return;
    const f = j.onGo;
    if (j.phase !== 'run') clear(kind);
    f?.();
  }
  window.wkAiJobs = { set, clear, open, get: k => jobs[k] || null };

  // ── 字幕生成の帯（字幕生成は窓を持たないので、ここで帯に載せる。段階の言葉は今までのボタンの文字） ──
  // vpanel.js の vpGenSubtitle が、ボタンから呼ばれたとき（preset なし）だけ呼ぶ。
  window._wkAiSubStep = function (id, txt) {
    const v = (window.videos || []).find(x => x.id === id);
    const cur = jobs.sub;
    set('sub', { phase: 'run', head: '字幕を作成中', label: String(txt || '').replace(/^⏳\s*/, ''), title: v?.title || '', vid: id,
      start: cur && cur.phase === 'run' ? cur.start : Date.now(), go: '', onGo: null });
  };
  window._wkAiSubEnd = function (id, r) {
    if (!jobs.sub) return;   // 何も始めなかった（言語の選択・確認でやめた）
    const v = (window.videos || []).find(x => x.id === id);
    if (r && r.ok) set('sub', { phase: 'done', head: '字幕ができました', label: r.target || '', title: v?.title || '', go: '', ttl: 20000 });
    else if (r && r.skipped) clear('sub');
    else set('sub', { phase: 'fail', head: '字幕を作れませんでした', label: r?.error || '', title: v?.title || '', go: '' });
  };

  // ── AI のメニュー ──
  let menuId = null, menuEl = null, veil = null, subs = null, anchor = null;
  const mobile = () => window.matchMedia('(max-width: 768px)').matches;
  function close() {
    menuEl?.remove(); veil?.remove(); menuEl = veil = null; menuId = null; anchor = null;
    document.removeEventListener('mousedown', onOut, true); document.removeEventListener('keydown', onKey, true);
  }
  const onOut = e => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest?.('.vp-ai-btn')) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  window.vpAiMenu = function (id, btn) {
    if (menuId === id) { close(); return; }
    close();
    menuId = id; anchor = btn || document.getElementById('vp-ai-' + id); subs = { loading: true };
    menuEl = document.createElement('div'); menuEl.id = 'vp-ai-menu'; menuEl.className = 'vp-ai-menu' + (mobile() ? ' sheet' : '');
    if (mobile()) { veil = document.createElement('div'); veil.className = 'vp-ai-veil'; veil.onclick = close; document.body.appendChild(veil); }
    document.body.appendChild(menuEl);
    renderMenu();
    setTimeout(() => { document.addEventListener('mousedown', onOut, true); document.addEventListener('keydown', onKey, true); }, 0);
    const K = window._vpAiKit;
    (K ? K.subsOf(id) : Promise.resolve({ ok: false, why: 'error' })).then(r => { if (menuId === id) { subs = r; renderMenu(); } });
  };

  function renderMenu() {
    if (!menuEl || !menuId) return;
    const id = menuId, K = window._vpAiKit || {};
    const v = (window.videos || []).find(x => x.id === id);
    const isGd = v?.pt === 'gdrive';
    // 始められない理由（ログイン・Drive の認証）は、字幕の有無より先に言う
    const block = !window._firebaseCurrentUser?.() ? 'Googleにログインしてください'
      : (isGd && !window.getDriveTokenIfAvailable?.()) ? 'Google Drive の認証が必要です（動画の「Googleで認証して再生」を押してください）' : '';
    const has = subs && subs.ok ? subs.labels.length > 0 : null;   // true / false / null（まだ・確かめられない）
    const el = t => t ? `<span class="vp-ai-mel" data-start="${t}">${fmt(Date.now() - t)}</span>` : '';
    const rows = [];

    if (K.isOwner?.()) {
      const j = jobs.sub && jobs.sub.phase === 'run' && jobs.sub.vid === id ? jobs.sub : null;
      let st = '', cls = '';
      if (block) st = block;
      else if (subs?.loading) st = '字幕を確かめています…';
      else if (has) { st = `${subs.labels.join(' / ')} の字幕がすでに存在しています。再度作成する場合は上書きされます。`; cls = 'warn'; }
      else if (subs && !subs.ok && subs.why === 'error') st = '字幕の有無を確かめられませんでした';
      rows.push({ k: 'sub', ic: '💬', nm: '字幕生成', ds: '音声を文字起こしして字幕を作ります。', st, cls,
        btn: j ? `<button class="vp-ai-run busy" disabled><span class="vp-flow-spin"></span>${el(j.start)}</button>`
               : `<button class="vp-ai-run" data-run="sub" ${block || (jobs.sub && jobs.sub.phase === 'run') ? 'disabled' : ''}>実行</button>` });
    }
    {
      const cj = K.chapJob?.();
      const mine = cj && cj.id === id;
      const yt = K.ytChaps?.(id);
      let st = '';
      if (block) st = block;
      else {
        const parts = [];
        if (Array.isArray(yt) && yt.length) parts.push(`この動画にはYouTubeのチャプターが${yt.length}個あります（取り込めます）`);
        if (has === false) parts.push('字幕が無いので「字幕から検出」は選べません');
        st = parts.join('。');
      }
      const btn = mine && cj.phase === 'run' ? `<button class="vp-ai-run busy" data-run="chap"><span class="vp-flow-spin"></span>${el(cj.start)}</button>`
        : mine && cj.phase === 'ready' ? `<button class="vp-ai-run" data-run="chap">確認する</button>`
        : mine ? `<button class="vp-ai-run" data-run="chap">開く</button>`
        : `<button class="vp-ai-run" data-run="chap" ${block ? 'disabled' : ''}>実行</button>`;
      rows.push({ k: 'chap', ic: '📑', nm: '自動チャプター', ds: '話の区切りを見つけて、ブックマークにします。', st, cls: '', btn });
    }
    {
      const sj = window.vpSumRangeBusy?.();
      let st = '', cls = '', dis = false;
      if (block) { st = block; dis = true; }
      else if (subs?.loading) { st = '字幕を確かめています…'; dis = true; }
      else if (has === false) { st = '先に字幕生成が必要です'; cls = 'warn'; dis = true; }
      const btn = sj ? `<button class="vp-ai-run busy" data-run="sum"><span class="vp-flow-spin"></span>${el(sj.at)}</button>`
        : `<button class="vp-ai-run" data-run="sum" ${dis ? 'disabled' : ''}>実行</button>`;
      rows.push({ k: 'sum', ic: '✨', nm: '要約', ds: '選んだ部分の字幕を要約して、メモに入れます。', st, cls, btn });
    }

    menuEl.innerHTML = `<div class="vp-ai-mt"><b>AI</b><button class="vp-ai-mx" data-close title="閉じる">✕</button></div>`
      + rows.map(r => `<div class="vp-ai-it" data-k="${r.k}"><div class="vp-ai-ic">${r.ic}</div><div class="vp-ai-bd"><div class="vp-ai-nm">${r.nm}</div>`
        + `<div class="vp-ai-ds">${r.ds}</div>${r.st ? `<div class="vp-ai-st ${r.cls}">${esc(r.st)}</div>` : ''}</div>${r.btn}</div>`).join('');
    menuEl.querySelector('[data-close]').onclick = close;
    menuEl.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
      const k = b.dataset.run, vid = id;
      close();
      if (k === 'sub') window.vpGenSubtitle?.(vid);
      else if (k === 'chap') window.vpGenChapters?.(vid);
      else if (k === 'sum') { if (window.vpSumRangeBusy?.()) window.vpSumRangeShow?.(); else window.vpSumRangeOpen?.(vid); }
    });
    place();
  }
  function place() {
    if (!menuEl || menuEl.classList.contains('sheet')) return;
    const r = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 8;
    let top = r ? r.bottom + 6 : m;
    if (r && top + h > vh - m && r.top - 6 - h >= m) top = r.top - 6 - h;
    menuEl.style.top = Math.max(m, Math.min(top, vh - h - m)) + 'px';
    menuEl.style.left = Math.max(m, Math.min(r ? r.right - w : m, vw - w - m)) + 'px';
  }
  // 字幕生成の言語のメニューは、押したボタン（今は AI）の下に出す（vpanel.js の _askSubtitleLang が読む）
  window._wkAiAnchor = id => document.getElementById('vp-ai-' + id);
  window._wkAiMenuClose = close;
  window._wkAiMenuRefresh = () => renderMenu();
  // 動画パネルを作り直すとき、ボタンの中身（作成中の件数）を同じに出す
  window._wkAiBtnInner = () => { const n = ORDER.filter(k => jobs[k] && jobs[k].phase === 'run').length;
    return 'AI' + (n ? ` <span class="vp-flow-spin"></span><span class="vp-ai-n">${n}</span>` : ''); };
})();
