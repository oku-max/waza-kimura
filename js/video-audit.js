// ═══ WAZA KIMURA — 動画の本数の内訳（減って見えるときの見える化）═══
//
// 【なぜ必要か】
// 「動画がめちゃくちゃ減ってる」と気づいても、画面に出ているのは “絞り込んだ結果の本数” で、
// それが (a) データ自体が減った のか (b) アーカイブ/絞り込み/リスト範囲で隠れているだけ なのかが
// 区別できなかった。原因を推測で潰す前に、まず事実を画面に出す。
//
// 【データ安全方針】
// このファイルは読み取り専用。videos / settings / カスタムビュー / Firestore / Storage には一切書かない。
// 唯一の書き込みは localStorage の新規キー wk_videoCountLog（本数の履歴）だけで、
// 追記と上限トリムのみ。他のキーは読まない・消さない。失敗しても握りつぶしてアプリは通常動作。
(function () {
  'use strict';

  const LOG_KEY  = 'wk_videoCountLog';
  const LOG_MAX  = 40;        // 直近40件だけ残す（これ以上は古い順に捨てる。他キーには触れない）
  const DROP_ABS = 20;        // 前回より20本以上 かつ
  const DROP_PCT = 0.03;      //   3%以上 減っていたら警告を出す

  // ── 本数の履歴（この端末のみ。クラウドには送らない）──────────────
  function _logRead() {
    try {
      const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function _logWrite(arr) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-LOG_MAX))); } catch (e) {}
  }

  // 読み込み/保存のたびに本数を記録する。減っていたら { prev, now, diff } を返す。
  //   src: '読込' | '保存' など
  window.wkLogVideoCount = function (n, src) {
    const now = Number(n);
    if (!Number.isFinite(now) || now < 0) return null;
    const log  = _logRead();
    const last = log.length ? log[log.length - 1] : null;
    log.push({ n: now, src: String(src || ''), at: new Date().toISOString() });
    _logWrite(log);
    if (!last || !Number.isFinite(Number(last.n))) return null;
    const prev = Number(last.n);
    const diff = prev - now;
    if (diff >= DROP_ABS && diff >= prev * DROP_PCT) return { prev, now, diff, prevAt: last.at };
    return null;
  };

  window.wkVideoCountLog = function () { return _logRead(); };

  // ── いまの内訳を数える（読むだけ）──────────────────────────
  window.wkVideoStats = function () {
    const vids     = window.videos || [];
    const total    = vids.length;
    const archived = vids.filter(v => v && v.archived).length;
    const active   = total - archived;
    const scopeSet = window._cvVideoIds || window._cvCardVideoIds || null;
    const scoped   = scopeSet ? vids.filter(v => v && !v.archived && !scopeSet.has(v.id)).length : 0;
    let shown = null;
    try {
      if (typeof window.orgFilt === 'function') shown = window.orgFilt(vids).length;
    } catch (e) {}
    const filtered = (shown == null) ? null : Math.max(0, active - scoped - shown);
    return { total, archived, active, scoped, shown, filtered, scopeName: window._cvActiveViewName || '' };
  };

  // ── 「参照だけ残っている動画」をさがす ──────────────────────
  // 動画一覧から消えても、カスタムリストの videoIds・ノートの動画ブロック・
  // 続きから再生の記録には ID が残る。それを突き合わせれば「何が消えたか」が分かる。
  // 読むだけ。ここでは何も足さない・消さない。
  function _collectRefs() {
    const refs = new Map();   // id -> { id, title, from:Set }
    const add = (id, title, from) => {
      if (!id || typeof id !== 'string') return;
      const e = refs.get(id) || { id, title: '', from: new Set() };
      if (!e.title && title) e.title = String(title);
      e.from.add(from);
      refs.set(id, e);
    };

    // カスタムリスト（手動選択のみ ID を持つ）
    try {
      for (const v of (window._cvViews || [])) {
        for (const id of (v?.videoIds || [])) add(id, '', 'リスト: ' + (v.label || v.id));
      }
    } catch (e) {}

    // ノートの動画ブロック（タイトルも一緒に残っている）
    try {
      const walk = (blocks, noteName) => {
        for (const b of (blocks || [])) {
          if (!b) continue;
          if (b.type === 'video' && b.videoId) add(b.videoId, b.title, 'ノート: ' + noteName);
          else if (b.type === 'col' && Array.isArray(b.cols)) {
            for (const slot of b.cols) walk(slot, noteName);
          }
        }
      };
      const notes = [];
      for (const f of (window._notesGetData?.() || [])) for (const n of (f?.notes || [])) notes.push(n);
      for (const n of (window._notesGetRoot?.() || [])) notes.push(n);
      for (const n of notes) walk(n?.blocks, n?.name || '（無題）');
    } catch (e) {}

    // 続きから再生の記録（この端末）
    try {
      const ph = JSON.parse(localStorage.getItem('wk_playhead') || 'null');
      for (const id of Object.keys(ph?.pos || {})) add(id, '', '続きから再生の記録');
    } catch (e) {}

    return refs;
  }

  window.wkFindMissingVideos = function () {
    const have = new Set((window.videos || []).map(v => v && v.id));
    const out = [];
    for (const e of _collectRefs().values()) {
      if (have.has(e.id)) continue;
      out.push({ id: e.id, title: e.title, from: [...e.from].slice(0, 3) });
    }
    out.sort((a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0));
    return out;
  };

  // ── 消えた動画を一覧に戻す ────────────────────────────────
  // YouTube の動画は ID からタイトル・チャンネル・サムネを取り直せる。
  // 既にある動画には一切触らず、無いものを足すだけ（＝非破壊）。
  // メモやタグまでは戻らないので、そのことも画面に出す。
  window.wkRestoreMissingVideos = async function (list) {
    const have = new Set((window.videos || []).map(v => v && v.id));
    const miss = (list || window.wkFindMissingVideos()).filter(m => !have.has(m.id));
    if (!miss.length) { window.showToast?.('戻せる動画はありませんでした'); return { added: 0 }; }

    const meta = {};
    const ytIds = miss.filter(m => /^yt-[A-Za-z0-9_-]{5,}$/.test(m.id)).map(m => m.id.slice(3));
    for (let i = 0; i < ytIds.length; i += 50) {
      try {
        const res = await fetch('/api/yt-videos?ids=' + encodeURIComponent(ytIds.slice(i, i + 50).join(',')));
        if (!res.ok) continue;
        const data = await res.json();
        for (const v of (data.items || [])) meta['yt-' + v.id] = v;
      } catch (e) { console.warn('[restore] yt-videos', e); }
    }

    const today = new Date().toISOString().slice(0, 10);
    let added = 0, noTitle = 0;
    for (const m of miss) {
      const md    = meta[m.id] || {};
      const title = md.title || m.title || '';
      if (!title) noTitle++;
      const ytId  = m.id.startsWith('yt-') ? m.id.slice(3) : '';
      const tt = (window.autoTagFromTitle && title) ? window.autoTagFromTitle(title) : { tb: [], cat: [], pos: [], tags: [] };
      (window.videos = window.videos || []).push({
        id: m.id, ytId: ytId || undefined,
        pt: ytId ? 'youtube' : (m.id.startsWith('gd-') ? 'gdrive' : ''),
        title: title || ('（タイトル不明）' + m.id),
        src: ytId ? 'youtube' : '',
        url: ytId ? ('https://www.youtube.com/watch?v=' + ytId) : '',
        thumb: md.thumb || (ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : ''),
        ch: md.channel || '', channel: md.channel || '', pl: '',
        addedAt: today, duration: md.duration || 0,
        watched: false, fav: false, status: '未着手',
        prio: 'そのうち', shared: 0, archived: false, memo: '', ai: '',
        tbLocked: false, tb: tt.tb, cat: tt.cat, pos: tt.pos, tags: tt.tags,
      });
      added++;
    }
    window.AF?.();
    window.renderOrg?.();
    await window.saveUserData?.();
    window.showToast?.(`✅ ${added}本を一覧に戻しました${noTitle ? `（うち${noTitle}本はタイトル不明）` : ''}`, 6000);
    return { added, noTitle };
  };

  const _esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const _fmt = iso => {
    try {
      const d = new Date(iso);
      if (isNaN(d)) return '';
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (e) { return ''; }
  };

  function _row(label, value, note) {
    return `<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--border,#3a3a3a)">
      <span style="flex:1;font-size:13px">${_esc(label)}</span>
      <span style="font-size:14px;font-weight:700;white-space:nowrap">${_esc(value)}</span>
      ${note ? `<span style="font-size:11px;color:var(--text3,#999);white-space:nowrap">${_esc(note)}</span>` : ''}
    </div>`;
  }

  // ── 内訳ダイアログ ───────────────────────────────────
  window.wkVideoAuditOpen = function () {
    const s   = window.wkVideoStats();
    const log = _logRead().slice(-12).reverse();
    document.getElementById('wk-va-ov')?.remove();

    let rows = '';
    rows += _row('画面に出ている本数', (s.shown == null ? '—' : s.shown + ' 本'));
    if (s.filtered)  rows += _row('絞り込み・検索で隠れている', s.filtered + ' 本', '絞り込みを解除すると出ます');
    if (s.scoped)    rows += _row('いま開いているリストの範囲外', s.scoped + ' 本', s.scopeName || 'リストを閉じると出ます');
    if (s.archived)  rows += _row('アーカイブ済み（消えていません）', s.archived + ' 本', '設定＞アーカイブ');
    rows += _row('データにある全部の本数', s.total + ' 本', window._firebaseCurrentUser?.() ? 'ログイン中' : '未ログイン');

    // 一覧から消えたのに、リスト・ノート・再生位置に ID だけ残っているもの
    let missing = [];
    try { missing = window.wkFindMissingVideos(); } catch (e) {}
    let missBlock = '';
    if (missing.length) {
      const head = missing.slice(0, 20).map(m => `<div style="display:flex;gap:8px;padding:3px 0;font-size:12px;color:var(--text2,#bbb)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(m.title || m.id)}</span>
        <span style="color:var(--text3,#999);white-space:nowrap">${_esc((m.from && m.from[0]) || '')}</span>
      </div>`).join('');
      missBlock = `
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">一覧から消えた動画</div>
        <div style="font-size:12px;color:var(--text3,#999);margin-bottom:6px">リスト・ノート・再生位置の記録には残っているのに、動画一覧に無いものです。</div>
        ${_row('見つかった件数', missing.length + ' 本', missing.length > 20 ? '先頭20件を表示' : '')}
        ${head}
        <button type="button" id="wk-va-restore" style="width:100%;margin-top:10px;padding:10px;border-radius:9px;border:none;background:var(--accent,#6b3fd4);color:var(--on-accent,#fff);font-size:13px;font-weight:700;cursor:pointer">この${missing.length}本を一覧に戻す</button>
        <div style="font-size:11px;color:var(--text3,#999);margin-top:6px">タイトル・チャンネル・サムネは取り直せますが、メモやタグ・ブックマークまでは戻りません。</div>`;
    }

    let hist = '';
    if (log.length) {
      hist = log.map(e => `<div style="display:flex;gap:8px;padding:4px 0;font-size:12px;color:var(--text2,#bbb)">
        <span style="flex:1">${_esc(_fmt(e.at))}</span>
        <span style="color:var(--text3,#999)">${_esc(e.src || '')}</span>
        <span style="font-weight:700;min-width:62px;text-align:right">${_esc(e.n)} 本</span>
      </div>`).join('');
    } else {
      hist = `<div style="font-size:12px;color:var(--text3,#999);padding:4px 0">まだ記録がありません（次に読み込んだ時から残ります）</div>`;
    }

    const ov = document.createElement('div');
    ov.id = 'wk-va-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = `
      <div style="background:var(--surface,#222);color:var(--text,#eee);border:1px solid var(--border,#3a3a3a);border-radius:14px;max-width:440px;width:100%;max-height:82vh;overflow:auto;padding:16px 16px 12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="font-size:15px;font-weight:700;flex:1">動画の本数の内訳</div>
          <button type="button" id="wk-va-x" style="background:none;border:none;color:var(--text3,#999);font-size:20px;line-height:1;cursor:pointer;padding:2px 6px">×</button>
        </div>
        <div style="font-size:12px;color:var(--text3,#999);margin-bottom:8px">画面の本数は絞り込んだ結果です。減ったように見えるときは、ここでどこに行ったか確認できます。</div>
        ${rows}
        ${missBlock}
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">読み込み・保存の記録（この端末）</div>
        ${hist}
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">減った原因を調べる</div>
        <div style="font-size:12px;color:var(--text3,#999);margin-bottom:6px">クラウドにある本数と、移行前の古いデータの本数を読み比べます（読むだけ）。</div>
        <button type="button" id="wk-va-forensics" style="width:100%;padding:10px;border-radius:9px;border:1.5px solid var(--border,#3a3a3a);background:var(--surface2,#2c2c2c);color:var(--text,#eee);font-size:13px;cursor:pointer">クラウドの中身を調べる</button>
        <div id="wk-va-fx" style="font-size:12px;color:var(--text2,#bbb);margin-top:8px;white-space:pre-wrap;word-break:break-all"></div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button type="button" id="wk-va-arch" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid var(--border,#3a3a3a);background:var(--surface2,#2c2c2c);color:var(--text,#eee);font-size:13px;cursor:pointer">アーカイブを見る</button>
          <button type="button" id="wk-va-clear" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid var(--border,#3a3a3a);background:var(--surface2,#2c2c2c);color:var(--text,#eee);font-size:13px;cursor:pointer">絞り込みを解除</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#wk-va-x').onclick = close;
    ov.querySelector('#wk-va-arch').onclick = () => { close(); window.switchTab?.('archive'); };

    const fxBtn = ov.querySelector('#wk-va-forensics');
    const fxOut = ov.querySelector('#wk-va-fx');
    if (fxBtn) fxBtn.onclick = async () => {
      fxBtn.disabled = true; fxBtn.textContent = '調べています…';
      try {
        const r = await window.wkDataForensics();
        const lines = [];
        lines.push(`いま画面のデータ: ${r.now.count}本（出どころ: ${r.now.source}）`);
        if (r.now.addedAtMax) lines.push(`追加日の範囲: ${r.now.addedAtMin} 〜 ${r.now.addedAtMax}`);
        if (r.now.byMonth?.length) lines.push('月別: ' + r.now.byMonth.map(([m, n]) => `${m}:${n}`).join(' / '));
        lines.push(r.storage.error
          ? `クラウド(Storage): 読めません（${r.storage.error}）`
          : `クラウド(Storage): ${r.storage.count}本 / 最終保存 ${r.storage.updated || '不明'}`);
        lines.push(r.firestore.error ? `古いデータ(Firestore): 読めません（${r.firestore.error}）`
          : r.firestore.exists ? `古いデータ(Firestore): ${r.firestore.count}本 / ${r.firestore.updated}`
          : '古いデータ(Firestore): ありません');
        if (r.firestore.exists && r.storage.count != null) {
          lines.push(r.firestore.sameAsStorage
            ? '→ 中身は完全に一致（古いスナップショットで上書きされた証拠）'
            : `→ 古い方と一致するのは ${r.firestore.overlap}本`);
        }
        lines.push('');
        lines.push('判定: ' + r.verdict);
        fxOut.textContent = lines.join('\n');
        // 古い方にしか無い動画があるなら、その場で戻せるようにする
        if (r.firestore.exists && !r.firestore.sameAsStorage) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = '古いデータから、いま無い動画だけを戻す';
          b.style.cssText = 'width:100%;margin-top:10px;padding:10px;border-radius:9px;border:none;background:var(--accent,#6b3fd4);color:var(--on-accent,#fff);font-size:13px;font-weight:700;cursor:pointer';
          b.onclick = async () => {
            b.disabled = true; b.textContent = '戻しています…';
            try { await window.wkRestoreFromLegacyFirestore(); close(); }
            catch (e) { b.disabled = false; b.textContent = 'もう一度試す'; window.showToast?.('⚠️ ' + (e?.message || e), 6000); }
          };
          fxOut.appendChild(b);
        }
      } catch (e) {
        fxOut.textContent = '調べられませんでした: ' + (e?.message || e);
      }
      fxBtn.disabled = false; fxBtn.textContent = 'もう一度調べる';
    };
    const restoreBtn = ov.querySelector('#wk-va-restore');
    if (restoreBtn) restoreBtn.onclick = async () => {
      if (!window._firebaseCurrentUser?.()) { window.showToast?.('⚠️ ログインしてから実行してください', 5000); return; }
      if (!window.confirm(`${missing.length}本を動画一覧に戻します。\n\n既にある動画には触りません（足すだけ）。\nメモ・タグ・ブックマークまでは戻りません。\n\n実行しますか？`)) return;
      restoreBtn.disabled = true;
      restoreBtn.textContent = '戻しています…';
      try { await window.wkRestoreMissingVideos(missing); close(); }
      catch (e) {
        console.error('[restore]', e);
        restoreBtn.disabled = false;
        restoreBtn.textContent = 'もう一度試す';
        window.showToast?.('⚠️ 復元に失敗しました: ' + (e?.message || e), 6000);
      }
    };
    ov.querySelector('#wk-va-clear').onclick = () => {
      close();
      // 既存の解除経路だけを呼ぶ（ここで状態を直接いじらない）
      if (typeof window.clearOrgFilters === 'function') window.clearOrgFilters();
      else if (typeof window.clearAll === 'function') window.clearAll();
      window.AF?.();
    };
  };

  // ── 読み込み直後に「前回より減っている」ときの警告（表示だけ・保存はしない）──
  window.wkVideoCountWarn = function (drop) {
    if (!drop) return;
    document.getElementById('wk-va-warn')?.remove();
    const b = document.createElement('div');
    b.id = 'wk-va-warn';
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:96px;z-index:99999;background:#5a2d2d;color:#fff;border:1px solid #8a4444;border-radius:12px;padding:11px 13px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.35)';
    // 文言は1つのテキストノードにまとめる（i18nのテンプレ訳が効くように）
    b.innerHTML = `<div style="margin-bottom:8px"><div style="font-weight:700;margin-bottom:4px">⚠️ 読み込んだ動画が前回より${drop.diff}本少ないです（${drop.prev}本 → ${drop.now}本）</div><div>保存する前に内訳を確認してください。</div></div>
      <div style="display:flex;gap:8px">
        <button type="button" id="wk-va-warn-see" style="flex:1;padding:7px;border-radius:8px;border:1px solid #c88;background:transparent;color:#fff;font-size:12px;cursor:pointer">内訳を見る</button>
        <button type="button" id="wk-va-warn-x" style="padding:7px 12px;border-radius:8px;border:1px solid #c88;background:transparent;color:#fff;font-size:12px;cursor:pointer">閉じる</button>
      </div>`;
    document.body.appendChild(b);
    b.querySelector('#wk-va-warn-see').onclick = () => window.wkVideoAuditOpen();
    b.querySelector('#wk-va-warn-x').onclick   = () => b.remove();
  };
})();
