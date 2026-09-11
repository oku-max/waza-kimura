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
        <div style="font-size:13px;font-weight:700;margin:14px 0 4px">読み込み・保存の記録（この端末）</div>
        ${hist}
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
