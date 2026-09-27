// ═══ 動画のタグを書き換える操作の核（段階4）═══
//
// 選択肢の削除（動画からも外す）・名前を変える／まとめる・選択肢に無い値を外す・ほかのグループから寄せる
// など、**たくさんの動画のタグを一度に変える操作**は、全部ここを通す。1つずつ書くと、どれか1つだけ
// 取り消しが無い・控えを取り忘れる、が起きるので、手順を1か所に固定する:
//   1. 変わる動画を数える（0本なら動画には触らない）
//   2. 確かめる: 何本変わるか・その値を条件に使っているカスタムリスト（条件は書き換えない）
//   3. 先にバックアップを保存する（既定でオン。wazaExportLight）
//   4. 変える前の値を控える（その操作で触るグループの欄だけ）
//   5. 変える。書き込みは動画パネルと同じ wkSetTagValue（そのグループの配列の、その値だけ）
//   6. 取り消しを出す（トースト＋設定画面の「直前の操作を元に戻す」）
// 取り消しは、操作の後にその動画のタグをまた変えていたら、その動画は戻さない（後の変更を消さない）。
// 空で上書きする経路は作らない。控えは localStorage（wk_tagOpsUndo）に直近5件だけ持つ（動画の同期には載せない）。
(function () {
  'use strict';

  const R = () => window.tagRegistry;
  const FIELDS = ['tb', 'cat', 'pos', 'tags'];
  const LS = 'wk_tagOpsUndo';
  const KEEP = 5;
  const _t = s => s;   // 表示は i18n.js が訳す（データは日本語のまま）
  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── 控え（そのグループの値が入っている欄だけ。v52.861〜862 の取り違えの欄も含める）──
  function _keys(g) {
    if (!FIELDS.includes(g.store)) return null;
    const sf = R().strayFieldOf ? R().strayFieldOf(g.store) : null;
    return sf ? [g.store, sf] : [g.store];
  }
  function _snap(v, gids) {
    const s = { id: v.id, f: {}, tg: {} };
    gids.forEach(gid => {
      const g = R().group(gid); if (!g) return;
      if (FIELDS.includes(g.store)) _keys(g).forEach(k => { s.f[k] = Array.isArray(v[k]) ? v[k].slice() : null; });
      else if (g.store === 'map') s.tg[gid] = (v.tg && typeof v.tg === 'object' && Array.isArray(v.tg[gid])) ? v.tg[gid].slice() : null;
    });
    return s;
  }
  function _restore(v, s) {
    Object.keys(s.f).forEach(k => { if (s.f[k] === null) delete v[k]; else v[k] = s.f[k].slice(); });
    Object.keys(s.tg).forEach(gid => {
      if (s.tg[gid] === null) { if (v.tg && typeof v.tg === 'object') delete v.tg[gid]; return; }
      if (!v.tg || typeof v.tg !== 'object' || Array.isArray(v.tg)) v.tg = {};
      v.tg[gid] = s.tg[gid].slice();
    });
  }
  const _same = (a, b) => JSON.stringify({ f: a.f, tg: a.tg }) === JSON.stringify({ f: b.f, tg: b.tg });

  // ── 選択肢（今の4つは tagSettings、ほかは一覧）──
  const _isField = g => FIELDS.includes(g.store);
  function optAdd(g, v) { if (_isField(g)) window.tagOptAdd?.(g.store, v); else R().addOption(g.id, v); }
  function optRemove(g, v) { if (_isField(g)) window.tagOptRemove?.(g.store, v); else R().removeOption(g.id, v); }
  // 選択肢を list の中身に戻す（取り消し用。足りないものを足し、無いものを外す）
  function _setOptions(gid, list) {
    const g = R().group(gid); if (!g || !Array.isArray(list)) return;
    g.options.filter(v => !list.includes(v)).forEach(v => optRemove(g, v));
    list.filter(v => !g.options.includes(v)).forEach(v => optAdd(g, v));
  }

  // ── 取り消しの記録 ──
  function _load() { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  // localStorage はほかのデータ（動画の控え・カスタムリスト等）と場所を分け合う。控えで場所を使い切ると
  // そちらの保存が失敗するので、上限を決めて古いものから捨てる。1件で上限を超えるなら残さない（トーストの取り消しだけ）
  const MAX_BYTES = 300000;
  function _store(list) {
    let a = list.slice(-KEEP), json = JSON.stringify(a);
    while (json.length > MAX_BYTES && a.length > 1) { a = a.slice(1); json = JSON.stringify(a); }
    if (json.length > MAX_BYTES) { a = []; json = '[]'; }
    try { localStorage.setItem(LS, json); } catch (e) { /* 入りきらなければ控えない（操作は済んでいる） */ }
    return a;
  }
  function lastUndo() { const a = _load(); return a.length ? a[a.length - 1] : null; }

  let _mem = null;   // 直前の操作（控えに入りきらなかったとき用）
  function undo(recId) {
    const list = _load();
    const i = recId ? list.findIndex(r => r.id === recId) : list.length - 1;
    const rec = i >= 0 ? list[i] : (_mem && (!recId || _mem.id === recId) ? _mem : null);
    if (!rec) { window.toast?.(_t('元に戻せる操作がありません')); return false; }
    const byId = new Map((window.videos || []).map(v => [v.id, v]));
    let done = 0, skipped = 0;
    rec.before.forEach((b, j) => {
      const v = byId.get(b.id); if (!v) { skipped++; return; }
      // 操作の後にまた変えていたら戻さない（後の変更を消さない）
      if (!_same(_snap(v, rec.gids), rec.after[j])) { skipped++; return; }
      _restore(v, b); done++;
    });
    (rec.opts || []).forEach(o => _setOptions(o.gid, o.before));
    if (i >= 0) { list.splice(i, 1); _store(list); }
    if (_mem && _mem.id === rec.id) _mem = null;
    _refresh();
    window.toast?.(skipped
      ? _t('元に戻しました（' + done + '本。その後に変えた' + skipped + '本はそのまま）')
      : _t('元に戻しました（' + done + '本）'));
    return true;
  }

  function _refresh() {
    window.debounceSave?.();
    window.AF?.();
    if (window._libViewMode === 'org') window.renderOrg?.();
    if (window.openVPanelId) window.vpV4Rerender?.(window.openVPanelId);
    window.renderTagShelf?.();
  }

  // ── 確かめる画面 ──
  function _confirm(o) {
    return new Promise(resolve => {
      document.getElementById('tagops-dlg')?.remove();
      const ov = document.createElement('div');
      ov.id = 'tagops-dlg';
      ov.style.cssText = 'position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);padding:16px';
      const lists = o.lists || [];
      ov.innerHTML = `<div style="background:var(--surface);color:var(--text);border-radius:12px;padding:18px;max-width:380px;width:100%;box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:13px;line-height:1.6">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px">${o.titleHTML}</div>
        <div style="margin-bottom:8px">${o.bodyHTML}</div>
        <div style="font-weight:700;margin-bottom:8px">${_t(o.n + '本の動画のタグが変わります')}</div>
        ${lists.length ? `<div style="background:var(--surface2);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12px">⚠ ${_t('この値を条件に使っているカスタムリスト')}: <span data-user-text="1">${_esc(lists.slice(0, 5).map(l => '「' + l.label + '」').join('、'))}</span>${lists.length > 5 ? ' …' : ''}<br>${_t('リストの条件は書き換えません。出てくる動画が変わることがあります。')}</div>` : ''}
        <label style="display:flex;gap:8px;align-items:center;margin:6px 0 12px;font-size:12px"><input type="checkbox" id="tagops-bk"${o.backup === false ? '' : ' checked'}> ${_t('先にバックアップを保存する（おすすめ）')}</label>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">${_t('あとから「元に戻す」でも戻せます。')}</div>
        <div style="display:flex;gap:8px"><button id="tagops-no" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);font-family:inherit;cursor:pointer">${_t('キャンセル')}</button>
        <button id="tagops-ok" style="flex:1;padding:9px;border-radius:8px;border:none;background:${o.danger ? 'var(--red,#ef4444)' : 'var(--accent)'};color:#fff;font-weight:700;font-family:inherit;cursor:pointer">${_esc(o.okLabel)}</button></div></div>`;
      document.body.appendChild(ov);
      const close = r => { ov.remove(); resolve(r); };
      ov.querySelector('#tagops-no').onclick = () => close(null);
      ov.addEventListener('click', e => { if (e.target === ov) close(null); });
      ov.querySelector('#tagops-ok').onclick = () => close({ backup: ov.querySelector('#tagops-bk').checked });
    });
  }

  // ── 実行 ──
  // op: { title, titleHTML, bodyHTML, okLabel, danger, gids:[触るグループ], targets:[動画], apply(v), cvNames, optsBefore:[gid...], optsChange() }
  async function run(op) {
    const targets = op.targets || [];
    const gids = op.gids || [];
    const optGids = op.optGids || [];
    if (!targets.length && !op.optsChange) return false;
    const lists = (window._cvListsUsingGroupValues && op.cvNames) ? window._cvListsUsingGroupValues(op.cvNames, gids) : [];
    const ans = await _confirm({ titleHTML: op.titleHTML || _esc(op.title), bodyHTML: op.bodyHTML || '', n: targets.length, lists, okLabel: op.okLabel || _t('実行'), danger: op.danger, backup: op.backupDefault !== false });
    if (!ans) return false;
    // バックアップを頼まれたのに保存できなかったら、操作はしない
    if (ans.backup && window.wazaExportLight) {
      let ok = false;
      try { ok = (await window.wazaExportLight()) !== false; } catch (e) { ok = false; }
      if (!ok) { window.toast?.(_t('バックアップを保存できなかったので、中止しました')); return false; }
    }
    const before = targets.map(v => _snap(v, gids));
    const optsBefore = optGids.map(gid => ({ gid, before: (R().group(gid)?.options || []).slice() }));
    targets.forEach(v => op.apply(v));
    if (op.optsChange) op.optsChange();
    const after = targets.map(v => _snap(v, gids));
    const rec = { id: 'u' + Date.now().toString(36), at: Date.now(), title: op.title, gids, before, after, opts: optsBefore };
    const list = _load(); list.push(rec);
    const kept = _store(list).some(r => r.id === rec.id);
    _mem = rec;   // 控えに入りきらなくても、トーストの取り消しでは戻せるように手元に持つ
    _refresh();
    window.toastUndo?.(_t(op.title + '（' + targets.length + '本）'), () => undo(rec.id));
    if (!kept) console.warn('[tag-ops] 控えが大きいので「元に戻す」には残しません（トーストの取り消しは使えます）');
    return true;
  }

  // ── 操作 ──
  const _all = () => (window.videos || []);
  const _has = (v, g, val) => R().valuesOf(v, g.id).includes(val);
  const _set = (v, g, val, on) => window.wkSetTagValue(v, g.id, val, on);
  const _q = s => '「<b data-user-text="1">' + _esc(s) + '</b>」';
  // 書き換えてよいのは今の4つと新しいタググループだけ（マーク・習得は★ボタン・習得の表示と結びついている）
  const _editable = g => !!g && (FIELDS.includes(g.store) || g.store === 'map');

  // 選択肢から外し、動画からも外す
  function removeEverywhere(gid, val) {
    const g = R().group(gid); if (!_editable(g) || !window.wkSetTagValue) return Promise.resolve(false);
    return run({
      title: '「' + val + '」を削除', titleHTML: _q(val) + ' ' + _t('を削除'),
      bodyHTML: _t('選択肢から外し、付いている動画からも外します。'),
      okLabel: _t('動画からも外す'), danger: true,
      gids: [gid], optGids: [gid], cvNames: [val],
      targets: _all().filter(v => _has(v, g, val)),
      apply: v => _set(v, g, val, false),
      optsChange: () => { if (g.options.includes(val)) optRemove(g, val); },
    });
  }
  // 名前を変える（to が選択肢にあれば、まとめる）
  function renameValue(gid, from, to) {
    const g = R().group(gid); to = String(to == null ? '' : to).trim();
    if (!_editable(g) || !to || to === from || !window.wkSetTagValue) return Promise.resolve(false);
    const merge = g.options.includes(to);
    return run({
      title: merge ? '「' + from + '」を「' + to + '」にまとめる' : '「' + from + '」を「' + to + '」に変更',
      titleHTML: _q(from) + ' → ' + _q(to),
      bodyHTML: merge ? _t('同じタググループにある値にまとめます。両方付いている動画は1つになります。') : _t('選択肢と、付いている動画の値を変えます。'),
      okLabel: merge ? _t('まとめる') : _t('名前を変える'),
      gids: [gid], optGids: [gid], cvNames: [from],
      targets: _all().filter(v => _has(v, g, from)),
      apply: v => { _set(v, g, to, true); _set(v, g, from, false); },
      optsChange: () => { if (!g.options.includes(to)) optAdd(g, to); if (g.options.includes(from)) optRemove(g, from); },
    });
  }
  // 選択肢に無い値を、動画から外す
  function removeGhost(gid, val) {
    const g = R().group(gid); if (!_editable(g) || !window.wkSetTagValue) return Promise.resolve(false);
    return run({
      title: '「' + val + '」を動画から外す', titleHTML: _q(val) + ' ' + _t('を動画から外す'),
      bodyHTML: _t('選択肢に無いのに付いている値を、動画から外します。'),
      okLabel: _t('動画から外す'), danger: true,
      gids: [gid], cvNames: [val],
      targets: _all().filter(v => _has(v, g, val)),
      apply: v => _set(v, g, val, false),
    });
  }
  // ほかのグループに付いている同じ値を、このグループに寄せる（ほかのグループの選択肢からも外す）
  function pullHere(gid, val, fromGids) {
    const g = R().group(gid); if (!_editable(g) || !window.wkSetTagValue) return Promise.resolve(false);
    const froms = (fromGids || []).map(id => R().group(id)).filter(f => _editable(f) && f.id !== gid);
    return run({
      title: '「' + val + '」を「' + g.name + '」に寄せる', titleHTML: _q(val) + ' → ' + _q(g.name),
      bodyHTML: _t('ほかのタググループに付いている同じ値を、このタググループに移します。') + '<br><span data-user-text="1">' + _esc(froms.map(x => x.name).join('・')) + '</span>',
      okLabel: _t('ここに寄せる'),
      gids: [gid].concat(froms.map(x => x.id)), optGids: [gid].concat(froms.map(x => x.id)), cvNames: [val],
      targets: _all().filter(v => froms.some(f => _has(v, f, val))),
      apply: v => { _set(v, g, val, true); froms.forEach(f => _set(v, f, val, false)); },
      optsChange: () => { if (!g.options.includes(val)) optAdd(g, val); froms.forEach(f => { if (f.options.includes(val)) optRemove(f, val); }); },
    });
  }

  // タグリセット（動画パネルの1本・まとめて編集の複数本、共通）。
  // グループごと、または全部のグループの値を外す。以前は今の4つだけで、まとめて編集の方は確かめも取り消しも無かった。
  function openReset(ids, opt) {
    opt = opt || {};
    const vids = (ids || []).map(id => _all().find(v => v.id === id)).filter(Boolean);
    if (!vids.length) { window.toast?.(_t('動画を選択してください')); return; }
    const gs = R().groups().filter(_editable).map(g => ({ g, n: vids.reduce((a, v) => a + R().valuesOf(v, g.id).length, 0) })).filter(x => x.n);
    document.getElementById('vp-tag-reset-popup')?.remove();
    const pop = document.createElement('div');
    pop.id = 'vp-tag-reset-popup';
    pop.style.cssText = 'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);padding:16px';
    const btn = (key, html, red) => `<button data-reset="${_esc(key)}" style="padding:10px;border-radius:8px;border:2px solid ${red ? 'var(--red,#ef4444)' : 'var(--border)'};background:${red ? 'rgba(239,68,68,.08)' : 'var(--surface2)'};color:${red ? 'var(--red,#ef4444)' : 'var(--text)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;width:100%">${html}</button>`;
    pop.innerHTML = `<div style="background:var(--surface);color:var(--text);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.2);min-width:260px;max-width:360px;width:100%">
      <div style="font-size:14px;font-weight:800;margin-bottom:4px">🔄 ${vids.length > 1 ? _t('一括タグリセット（' + vids.length + '本）') : _t('タグリセット')}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:14px">${gs.length ? _t('外すタググループを選んでください') : _t('外せるタグがありません')}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${gs.map(x => btn(x.g.id, `<span data-user-text="1">${_esc(x.g.name)}</span> <span>${_t('（' + x.n + '件）')}</span>`)).join('')}
        ${gs.length > 1 ? btn('*', _t('⚠ すべてのタグをリセット'), true) : ''}
        <button data-reset="" style="padding:8px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--text3);font-size:12px;cursor:pointer;font-family:inherit;width:100%">${_t('キャンセル')}</button>
      </div></div>`;
    document.body.appendChild(pop);
    pop.addEventListener('click', e => {
      if (e.target === pop) return pop.remove();
      const b = e.target.closest('[data-reset]'); if (!b) return;
      pop.remove();
      const key = b.dataset.reset; if (!key) return;
      const pick = key === '*' ? gs.map(x => x.g) : gs.filter(x => x.g.id === key).map(x => x.g);
      const title = key === '*' ? 'すべてのタグをリセット' : '「' + pick[0].name + '」をリセット';
      run({
        title, titleHTML: key === '*' ? _t('すべてのタグをリセット') : _q(pick[0].name) + ' ' + _t('をリセット'),
        bodyHTML: _t('選んだ動画から、このタグを外します。選択肢はそのままです。'),
        okLabel: _t('リセット'), danger: true, backupDefault: opt.backupDefault,
        gids: pick.map(g => g.id),
        cvNames: [...new Set(vids.flatMap(v => pick.flatMap(g => R().valuesOf(v, g.id))))],
        targets: vids.filter(v => pick.some(g => R().valuesOf(v, g.id).length)),
        apply: v => pick.forEach(g => R().valuesOf(v, g.id).forEach(val => _set(v, g, val, false))),
      });
    });
  }

  window.wkTagOps = { run, undo, lastUndo, removeEverywhere, renameValue, removeGhost, pullHere, openReset, _snap, _same };
})();
