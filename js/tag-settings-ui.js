// ═══ タグ設定の画面（段階3b。オーナー承認済みのモック「1画面」）═══
// タグ1〜4 の枠と「未使用のタググループ」を同じ形の行で並べ、押すとその場で開く。
// 開いた中で: 名前・使う場所（入れ替え）・選択肢（足す／外す／出さない）・重複している可能性のあるタグ・検索の対象・
// ほかから選択肢をコピー・初期値に戻す。
//
// 動画には触らない（マージ・削除・「動画からも外す」は段階4の js/tag-ops.js。先にバックアップと取り消しを付ける）。
// 選択肢は「選択肢に出さない」（残したまま、タグを付ける画面・絞り込みの候補に出さない）もできる（v52.878）。
// ほかのタググループにも同じ名前があることは知らせない（オーナー「知ったこっちゃない」v52.878）。
// 書き込み先: 今の4つ（tb/cat/pos/tags）の名前・選択肢・表示は tagSettings（settings.js の入口）、
//             それ以外（枠・検索の対象・マーク／習得／新しいグループの名前と選択肢）は一覧（tag-registry.js）。
// マーク・習得は v52.876 から普通のタググループ（選択肢も自由に足し引きできる）。
// 文言にユーザーのデータ（グループ名・値）を埋め込まない。別の要素に分ける（訳せるように・名前を訳さないように）。
(function () {
  'use strict';

  const FIELDS = ['tb', 'cat', 'pos', 'tags'];
  const R = () => window.tagRegistry;
  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _isField = g => FIELDS.includes(g.store);
  const _vis = g => { if (!_isField(g)) return true; const t = (window.tagSettings || []).find(x => x.key === g.store); return t ? t.visible !== false : true; };

  // 画面の状態（保存しない）
  const S = { exp: null, unOpen: false, confirm: null, copy: null, edit: null, dup: null };

  // ── 集計 ──
  // 重複している可能性のあるタグ: 選択肢に無いのに動画に付いている値（件数つき）。
  // 「ラッソー」が選択肢にあって「ラッソーガード」が動画にだけ付いている、のような別の書き方が多い。
  // 選択肢に出していないもの（allOptions）は選択肢にあるものとして数える。
  function _issues(g) {
    const opts = new Set(g.allOptions || g.options);
    const cnt = new Map();
    (window.videos || []).forEach(v => {
      if (v.archived) return;
      R().valuesOf(v, g.id).forEach(t => { if (t && !opts.has(t)) cnt.set(t, (cnt.get(t) || 0) + 1); });
    });
    const ghosts = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
    return { ghosts, n: ghosts.length };
  }

  // ── 描画 ──
  function render() {
    const el = document.getElementById('tag-display-settings');
    if (!el || !R()) return;
    _bind(el);
    const all = R().groups();
    const slots = R().slots();
    const ro = R().isReadOnly();
    let h = '';
    if (ro) h += `<div class="ts-warn">${_t('この一覧は新しい版のアプリで保存されています。この端末では変更できません。')}</div>`;
    // 動画のタグを変えた直前の操作（js/tag-ops.js）。あとからでも戻せる
    const last = window.wkTagOps && window.wkTagOps.lastUndo();
    if (last && !ro) h += `<div class="ts-warn">${_t('直前の操作:')} <span data-user-text="1">${_esc(last.title)}</span> <button class="ts-mini" data-act="undo">${_t('元に戻す')}</button></div>`;
    h += `<div class="ts-cap">${_t('使用中のタグ')}</div><div class="ts-card">`;
    // 行の左のつかむ所（⠿）を押したまま上下に動かすと、タグ1〜4の順番を並べ替えられる（_bindDrag）
    const grip = k => ro ? '' : `<span class="ts-grip" data-grip="${k}" title="${_t('ドラッグで並べ替え')}" aria-label="${_t('ドラッグで並べ替え')}">⠿</span>`;
    slots.forEach((g, k) => {
      h += `<div class="ts-slot" data-k="${k}">`;
      if (!g) {
        const key = 'slot' + k, open = S.exp === key;
        h += `<div class="ts-slotrow">${grip(k)}<button class="ts-row" data-act="exp" data-key="${key}"><span class="ts-num off">${_t('タグ' + (k + 1))}</span><span class="ts-unset">${_t('未設定')}</span><span class="ts-car">${open ? '▲' : '▼'}</span></button></div>`;
        if (open) h += `<div class="ts-panel">${_slotPicker(k, all)}</div>`;
      } else {
        h += _row(g, k, all, grip(k));
      }
      h += `</div>`;
    });
    h += `</div>`;
    const un = all.filter(g => g.slot < 0);
    h += `<button class="ts-cap ts-capbtn" data-act="unopen"><span>${_t('未使用のタググループ（' + un.length + '）')}</span><span class="ts-car">${S.unOpen ? '▲' : '▼'}</span></button>`;
    if (S.unOpen) {
      h += `<div class="ts-card">`;
      if (!un.length) h += `<div class="ts-empty">${_t('ありません')}</div>`;
      un.forEach(g => { h += _row(g, -1, all); });
      h += `</div><div class="ts-note">${_t('付けたタグは動画に残っています。使うときは、開いて「使う場所」を選びます。')}</div>`;
      const on = R().pref('unusedCondApply') !== false;
      h += `<button class="ts-acc ts-mt" data-act="unusedcond"${ro ? ' disabled' : ''}><span class="ts-grow">`
        + `<span class="ts-block">${_t('未使用のタググループの条件も、カスタムリストで効かせる')}</span>`
        + `<span class="ts-block ts-small">${_t(on ? 'カスタムリストの条件にあれば、未使用でも絞り込みに使います' : '未使用のタググループの条件は、カスタムリストで無視します（条件は消しません）')}</span></span>`
        + `<span class="ts-sw${on ? ' on' : ''}"><span></span></span></button>`;
    }
    el.innerHTML = h;
  }

  function _row(g, k, all, grip) {
    const open = S.exp === g.id;
    const iss = _issues(g);
    const hidden = !_vis(g);
    const n = g.options.length, nh = (g.hidden || []).length;
    let h = (grip ? `<div class="ts-slotrow">${grip}` : '') + `<button class="ts-row" data-act="exp" data-key="${_esc(g.id)}">`
      + (k >= 0 ? `<span class="ts-num">${_t('タグ' + (k + 1))}</span>` : `<span class="ts-num off">${_t('未使用')}</span>`)
      + `<span class="ts-name" data-user-text="1">${_esc(g.name)}</span>`
      + `<span class="ts-sub">${_t(n + '個')}${nh ? `<span>${_t('・' + nh + '個は出していない')}</span>` : ''}${g.search ? '' : `<span>${_t('・検索の対象外')}</span>`}${hidden ? `<span>${_t('・非表示中')}</span>` : ''}</span>`
      + `<span class="ts-car">${open ? '▲' : '▼'}</span></button>` + (grip ? `</div>` : '');
    if (open) h += `<div class="ts-panel">${_panel(g, k, all, iss)}</div>`;
    return h;
  }

  // 空いている枠: 入れるグループを選ぶ
  function _slotPicker(k, all) {
    const cands = all.filter(g => g.slot < 0);
    let h = `<div class="ts-p">${_t('タグ' + (k + 1) + 'に使うタググループを選んでください。')}</div><div class="ts-chips">`;
    cands.forEach(g => { h += `<button class="ts-chip" data-act="fillslot" data-gid="${_esc(g.id)}" data-k="${k}" data-user-text="1">${_esc(g.name)}</button>`; });
    h += `<button class="ts-chip ts-gold" data-act="newgroup" data-k="${k}">${_t('＋ 新しく作る')}</button></div>`;
    return h;
  }

  function _panel(g, k, all, iss) {
    const ro = R().isReadOnly();
    let h = '';
    // 名前と使う場所
    h += `<div class="ts-two"><div><label class="ts-lbl" for="ts-name-${_esc(g.id)}">${_t('タググループ名')}</label>`
      + `<input id="ts-name-${_esc(g.id)}" class="ts-inp" value="${_esc(g.name)}" data-user-text="1" data-chg="rename" data-gid="${_esc(g.id)}"${ro ? ' disabled' : ''}></div>`;
    h += `<div><label class="ts-lbl" for="ts-slot-${_esc(g.id)}">${_t('使う場所')}</label>`;
    {
      h += `<select id="ts-slot-${_esc(g.id)}" class="ts-sel" data-chg="slot" data-gid="${_esc(g.id)}"${ro ? ' disabled' : ''}>`
        + `<option value="-1"${k < 0 ? ' selected' : ''}>${_t('未使用')}</option>`;
      // 入れ替え相手の名前はユーザーのもの。訳させないよう、この行は画面側で言語に合わせて組み立てる
      const en = window.WK_LANG && window.WK_LANG() === 'en';
      R().slots().forEach((x, j) => {
        h += `<option value="${j}"${j === k ? ' selected' : ''} data-user-text="1">${en ? 'Tag ' : 'タグ'}${j + 1}${x && x.id !== g.id ? ' ⇄ ' + _esc(x.name) : ''}</option>`;
      });
      h += `</select>`;
    }
    h += `</div></div>`;
    if (!_vis(g)) {
      h += `<div class="ts-warn">${_t('このタググループは表示していません（今までの「表示しない」）。')} <button class="ts-mini" data-act="show" data-store="${g.store}">${_t('表示する')}</button></div>`;
    }

    // 選択肢
    h += `<div class="ts-lbl ts-mt">${_t('選択肢 ' + g.options.length + '個')}<span class="ts-right">${_t('名前を押すと変更・×で外す')}</span></div><div class="ts-optwrap">`;
    g.options.forEach(o => {
      const lbl = R().optionLabel(g, o);
      h += `<span class="ts-opt">` + (ro ? `<span data-user-text="1">${_esc(lbl)}</span>`
          : `<button class="ts-optname" data-act="edit" data-gid="${_esc(g.id)}" data-v="${_esc(o)}" data-user-text="1">${_esc(lbl)}</button>`)
        + (ro ? '' : `<button aria-label="×" data-act="rmopt" data-gid="${_esc(g.id)}" data-v="${_esc(o)}">×</button>`)
        + `</span>`;
    });
    if (!g.options.length) h += `<span class="ts-dim">${_t('まだありません')}</span>`;
    h += `</div>`;
    // 選択肢に出していないもの（消してはいない。「出す」で戻る）
    if ((g.hidden || []).length) {
      h += `<div class="ts-lbl ts-mt">${_t('選択肢に出していないもの ' + g.hidden.length + '個')}</div><div class="ts-optwrap">`;
      g.hidden.forEach(o => {
        h += `<span class="ts-opt ts-hid"><span data-user-text="1">${_esc(R().optionLabel(g, o))}</span>`
          + (ro ? '' : `<button class="ts-show" data-act="unhide" data-gid="${_esc(g.id)}" data-v="${_esc(o)}">${_t('出す')}</button>`) + `</span>`;
      });
      h += `</div>`;
    }
    if (!ro) {
      h += `<div class="ts-addrow"><input id="ts-add-${_esc(g.id)}" placeholder="${_t('選択肢を追加...')}" aria-label="${_t('選択肢を追加...')}" data-key="add" data-gid="${_esc(g.id)}">`
        + `<button class="ts-gold" data-act="addopt" data-gid="${_esc(g.id)}">${_t('追加')}</button></div>`;
    }
    if (S.edit && S.edit.gid === g.id) {
      const e = S.edit;
      h += `<div class="ts-confirm"><div><b data-user-text="1">${_esc(e.v)}</b> <span>${_t('（' + e.n + '本に付いています）')}</span></div>`
        + `<p>${_t('新しい名前を入れてください。選択肢にある名前にすると、その値にまとめます。付いている動画の値も変わります。')}</p>`
        + `<div class="ts-addrow"><input id="ts-edit-${_esc(g.id)}" value="${_esc(e.v)}" data-user-text="1" data-key="edit" data-gid="${_esc(g.id)}" list="ts-edit-dl-${_esc(g.id)}" aria-label="${_t('新しい名前')}">`
        + `<datalist id="ts-edit-dl-${_esc(g.id)}">${g.options.filter(x => x !== e.v).map(x => `<option value="${_esc(x)}">`).join('')}</datalist></div>`
        + `<div class="ts-two"><button class="ts-plain" data-act="editcancel">${_t('キャンセル')}</button>`
        + `<button class="ts-gold" data-act="editok" data-gid="${_esc(g.id)}">${_t('変更する')}</button></div></div>`;
    }
    if (S.confirm && S.confirm.gid === g.id) {
      const c = S.confirm;
      h += `<div class="ts-confirm"><div><b data-user-text="1">${_esc(c.v)}</b> <span>${_t('（' + c.n + '本に付いています）')}</span></div>`
        + `<p>${_t('「選択肢に出さない」は、消さずに残したまま、タグを付ける画面や絞り込みの候補に出さなくします。あとで戻せます。')}</p>`
        + `<p>${_t('「選択肢から消す」は、選択肢から消します。どちらも、付いている動画のタグはそのまま残ります。')}</p>`
        + `<button class="ts-gold" data-act="hideopt" data-gid="${_esc(g.id)}" data-v="${_esc(c.v)}">${_t('選択肢に出さない（消さない）')}</button>`
        + `<div class="ts-two"><button class="ts-plain" data-act="cancel">${_t('キャンセル')}</button>`
        + `<button class="ts-red" data-act="rmoptok" data-gid="${_esc(g.id)}" data-v="${_esc(c.v)}">${_t('選択肢から消す')}</button></div>`
        + (c.n ? `<button class="ts-redline" data-act="rmall" data-gid="${_esc(g.id)}" data-v="${_esc(c.v)}">${_t('動画からも外す（' + c.n + '本）')}</button>` : '')
        + `</div>`;
    }

    // 重複している可能性のあるタグ（押したときだけ出す。オーナー「いきなり羅列されても鬱陶しい」v52.878）
    if (iss.n) {
      const open = S.dup === g.id;
      h += `<button class="ts-acc ts-mt" data-act="dup" data-gid="${_esc(g.id)}"><span class="ts-grow">`
        + `<span class="ts-block">${_t('重複している可能性のあるタグを整理する（' + iss.n + '）')}</span></span><span class="ts-car">${open ? '▲' : '▼'}</span></button>`;
      if (open) {
        h += `<div class="ts-note">${_t('動画に付いているのに、選択肢に無いタグです。選択肢の別の書き方かもしれません。')}</div><div class="ts-issue">`;
        iss.ghosts.forEach(([v, n]) => {
          h += `<div class="ts-irow"><span><b data-user-text="1">${_esc(v)}</b> <small>${_t('（' + n + '本に付いています）')}</small></span>`
            + (ro ? '' : `<span class="ts-btns"><button class="ts-mini" data-act="keep" data-gid="${_esc(g.id)}" data-v="${_esc(v)}">${_t('選択肢に入れる')}</button>`
              + `<button class="ts-mini" data-act="edit" data-gid="${_esc(g.id)}" data-v="${_esc(v)}">${_t('まとめる')}</button>`
              + `<button class="ts-mini ts-danger" data-act="rmghost" data-gid="${_esc(g.id)}" data-v="${_esc(v)}">${_t('動画から外す')}</button></span>`) + `</div>`;
        });
        h += `</div>`;
      }
    }

    // 検索の対象
    h += `<button class="ts-acc ts-mt" data-act="search" data-gid="${_esc(g.id)}"${ro ? ' disabled' : ''}><span class="ts-grow">`
      + `<span class="ts-block">${_t('検索の対象にする')}</span>`
      + `<span class="ts-block ts-small">${_t(g.search ? 'このタググループのタグも、ワード検索の対象になります' : 'ワード検索の対象外です（絞り込みには使えます）')}</span></span>`
      + `<span class="ts-sw${g.search ? ' on' : ''}"><span></span></span></button>`;

    // そのほかの操作
    if (!ro) {
      h += `<div class="ts-ops">`;
      h += `<button class="ts-mini" data-act="copy" data-gid="${_esc(g.id)}">${_t('ほかから選択肢をコピー')}</button>`;
      if (g.def) h += `<button class="ts-mini" data-act="defone" data-gid="${_esc(g.id)}">${_t('初期値に戻す')}</button>`;
      h += `</div>`;
    }
    if (S.copy && S.copy.to === g.id) h += _copyBox(g, all);
    return h;
  }

  function _copyBox(T, all) {
    const c = S.copy;
    const srcs = all.filter(o => o.id !== T.id && o.options.length);
    let h = `<div class="ts-confirm"><p>${_t('どのタググループからコピーしますか？ 動画のタグには触りません。')}</p><div class="ts-chips">`;
    srcs.forEach(o => { h += `<button class="ts-chip${c.from === o.id ? ' on' : ''}" data-act="copyfrom" data-gid="${_esc(o.id)}" data-user-text="1">${_esc(o.name)}</button>`; });
    if (!srcs.length) h += `<span class="ts-dim">${_t('ありません')}</span>`;
    h += `</div>`;
    const F = c.from && all.find(o => o.id === c.from);
    if (F) {
      h += `<p>${_t('写すものを選んでください。')}</p><div class="ts-chips">`;
      F.options.forEach(v => {
        const has = T.options.includes(v), pk = c.picks.includes(v);
        h += `<button class="ts-chip${has ? ' has' : pk ? ' on' : ''}" data-act="copypick" data-v="${_esc(v)}"${has ? ' disabled' : ''}>`
          + (has ? `<span>${_t('追加済み')}</span> ` : pk ? '✓ ' : '') + `<span data-user-text="1">${_esc(v)}</span></button>`;
      });
      h += `</div>`;
    }
    h += `<div class="ts-two"><button class="ts-plain" data-act="copycancel">${_t('キャンセル')}</button>`
      + `<button class="ts-gold" data-act="copydo"${c.picks.length ? '' : ' disabled'}>${_t('選んだ' + c.picks.length + '個をコピー')}</button></div></div>`;
    return h;
  }

  // ── 書き込み（今の4つは tagSettings、それ以外は一覧）──
  const _group = id => R().group(id);
  function _addOpt(g, v) {
    if (_isField(g)) window.tagOptAdd?.(g.store, v);
    else R().addOption(g.id, v);
    R().setOptionHidden(g.id, v, false);   // 前に「出さない」にして消した名前を入れ直したときは、出す
  }
  function _removeOpt(g, v) {
    if (_isField(g)) window.tagOptRemove?.(g.store, v);
    else R().removeOption(g.id, v);
  }
  function _rename(g, v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) { window.toast?.(_t('名前は空にできません')); return; }
    if (_isField(g)) window.renameTagGroup?.(g.store, s);
    else R().setName(g.id, s);
  }
  function _countOn(g, v) { return (window.videos || []).filter(x => !x.archived && R().valuesOf(x, g.id).includes(v)).length; }
  function _after() { render(); window.AF?.(); }
  // 操作が済んだら（キャンセルでも）開いていた確認を閉じて描き直す
  function _op(p) { if (!p || !p.then) return; p.then(done => { if (done) { S.confirm = null; S.edit = null; } render(); }); }

  function _act(a, el) {
    const gid = el.dataset.gid, g = gid ? _group(gid) : null;
    switch (a) {
      case 'exp': S.exp = S.exp === el.dataset.key ? null : el.dataset.key; S.confirm = null; S.copy = null; S.edit = null; S.dup = null; return render();
      case 'unopen': S.unOpen = !S.unOpen; return render();
      case 'fillslot': R().setSlot(gid, +el.dataset.k); if (g && _isField(g)) window.tagSetVisible?.(g.store, true); S.exp = gid; return _after();
      case 'newgroup': { const id = R().createGroup('', +el.dataset.k); if (id) S.exp = id; return _after(); }
      case 'show': window.tagSetVisible?.(el.dataset.store, true); return _after();
      case 'rmopt': S.confirm = { gid, v: el.dataset.v, n: g ? _countOn(g, el.dataset.v) : 0 }; return render();
      case 'cancel': S.confirm = null; return render();
      case 'rmoptok': if (g) _removeOpt(g, el.dataset.v); S.confirm = null; return _after();
      // 選択肢に出さない／出す（一覧だけを変える。動画と tagSettings には触らない）
      case 'hideopt': R().setOptionHidden(gid, el.dataset.v, true); S.confirm = null; window.toast?.(_t('選択肢に出さないようにしました（消していません）')); return _after();
      case 'unhide': R().setOptionHidden(gid, el.dataset.v, false); return _after();
      case 'dup': S.dup = S.dup === gid ? null : gid; return render();
      // ── 動画のタグを変える操作（段階4。確かめ・バックアップ・取り消しは js/tag-ops.js が持つ）──
      case 'rmall': return _op(window.wkTagOps?.removeEverywhere(gid, el.dataset.v));
      case 'rmghost': return _op(window.wkTagOps?.removeGhost(gid, el.dataset.v));
      case 'edit': S.edit = { gid, v: el.dataset.v, n: g ? _countOn(g, el.dataset.v) : 0 }; S.confirm = null; render(); { const i = document.getElementById('ts-edit-' + gid); if (i) { i.focus(); i.select(); } } return;
      case 'editcancel': S.edit = null; return render();
      case 'editok': { const i = document.getElementById('ts-edit-' + gid); return _op(window.wkTagOps?.renameValue(gid, S.edit && S.edit.v, i ? i.value : '')); }
      case 'undo': window.wkTagOps?.undo(); return _after();
      case 'addopt': return _addFromInput(gid);
      case 'keep': if (g) _addOpt(g, el.dataset.v); window.toast?.(_t('選択肢に入れました')); return _after();
      case 'search': if (g) R().setSearch(gid, !g.search); return _after();
      case 'unusedcond': R().setPref('unusedCondApply', R().pref('unusedCondApply') === false); if (window._libViewMode === 'org') window.renderOrg?.(); return _after();
      case 'copy': S.copy = { to: gid, from: '', picks: [] }; return render();
      case 'copyfrom': { const F = _group(gid), T = _group(S.copy.to); S.copy.from = gid; S.copy.picks = F && T ? F.options.filter(v => !T.allOptions.includes(v)) : []; return render(); }
      case 'copypick': { const v = el.dataset.v, p = S.copy.picks; S.copy.picks = p.includes(v) ? p.filter(x => x !== v) : p.concat([v]); return render(); }
      case 'copycancel': S.copy = null; return render();
      case 'copydo': {
        const T = _group(S.copy.to); if (!T) return;
        const n = S.copy.picks.length;
        S.copy.picks.forEach(v => { if (!T.allOptions.includes(v)) _addOpt(T, v); });
        S.copy = null; window.toast?.(_t(n + '個をコピーしました')); return _after();
      }
      case 'defone': return _resetOne(g);
    }
  }

  function _addFromInput(gid) {
    const g = _group(gid); if (!g) return;
    const inp = document.getElementById('ts-add-' + gid);
    const v = (inp && inp.value || '').trim();
    if (!v) return;
    if (g.allOptions.includes(v)) {
      // 出していないものを打ったら、出す（二重には足さない）
      if (g.hidden.includes(v)) { R().setOptionHidden(gid, v, false); if (inp) inp.value = ''; _after(); }
      return;
    }
    _addOpt(g, v);
    _after();
    const again = document.getElementById('ts-add-' + gid); if (again) again.focus();
  }

  // 初期値に戻す（B: 足りない初期の選択肢を足し、名前を初期に戻す。自分で足した選択肢は残す）
  function _resetOne(g) {
    if (!g || !g.def) return;
    const d = R().DEFAULTS[g.def];
    const name = R().defaultName(g.def);
    if (_isField(g)) {
      if (d) d.vals.forEach(v => { if (!g.allOptions.includes(v)) window.tagOptAdd?.(g.store, v); });
      if (name && name !== g.name) window.renameTagGroup?.(g.store, name);
    } else if (name) {
      R().setName(g.id, name);
    }
    window.toast?.(_t('初期値に戻しました'));
    _after();
  }

  // ── ドラッグで並べ替え（タグ1〜4の行）──
  // 指でもマウスでも動くように pointer イベントで作る。つかむ所（⠿）だけが動かす入口で、
  // 行そのものを押したときは今までどおり開閉する（スクロールや開閉と取り違えない）。
  // 動かしている間は見た目だけ動かし、離したときに1回だけ一覧（moveSlot）へ書く。
  function _bindDrag(el) {
    let D = null;
    el.addEventListener('pointerdown', e => {
      const g = e.target.closest('[data-grip]');
      if (!g || !el.contains(g) || R().isReadOnly()) return;
      const box = g.closest('.ts-slot');
      const items = [...el.querySelectorAll('.ts-slot')];
      if (!box || items.length < 2) return;
      e.preventDefault();
      D = { from: +box.dataset.k, box, items, y0: e.clientY, to: +box.dataset.k,
            rects: items.map(x => x.getBoundingClientRect()), id: e.pointerId };
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      box.classList.add('ts-dragging');
    });
    el.addEventListener('pointermove', e => {
      if (!D || e.pointerId !== D.id) return;
      e.preventDefault();
      const dy = e.clientY - D.y0;
      D.box.style.transform = `translateY(${dy}px)`;
      const r = D.rects[D.from], mid = r.top + r.height / 2 + dy;
      // いまの位置 = 自分以外で、真ん中が自分の真ん中と同じか上にある行の数（相手の真ん中まで来たら入れ替わる）
      let to = 0;
      D.rects.forEach((q, i) => { if (i !== D.from && q.top + q.height / 2 <= mid) to++; });
      D.to = to;
      // 間の行をずらして、入る場所を見せる
      D.items.forEach((x, i) => {
        if (i === D.from) return;
        let s = 0;
        if (D.from < to && i > D.from && i <= to) s = -r.height;
        if (D.from > to && i >= to && i < D.from) s = r.height;
        x.style.transform = s ? `translateY(${s}px)` : '';
      });
    });
    const end = e => {
      if (!D || e.pointerId !== D.id) return;
      const { from, to, items, box } = D;
      D = null;
      items.forEach(x => { x.style.transform = ''; });
      box.classList.remove('ts-dragging');
      if (from === to) return;
      if (S.exp && /^slot\d$/.test(S.exp)) S.exp = null;   // 空いた枠の番号で開いていたものは閉じる（番号がずれるため）
      R().moveSlot(from, to);
      _after();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ── 入力のつなぎ（1回だけ。器ごとに1つ）──
  function _bind(el) {
    if (el.__tsBound) return;
    el.__tsBound = true;
    _bindDrag(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !el.contains(b) || b.disabled) return;
      e.preventDefault();
      _act(b.dataset.act, b);
    });
    el.addEventListener('change', e => {
      const t = e.target, g = t.dataset.gid && _group(t.dataset.gid);
      if (!g) return;
      if (t.dataset.chg === 'rename') { _rename(g, t.value); _after(); }
      if (t.dataset.chg === 'slot') {
        const k = +t.value;
        R().setSlot(g.id, k);
        if (k >= 0 && _isField(g)) window.tagSetVisible?.(g.store, true);   // 枠に入れたら見えるように
        _after();
      }
    });
    el.addEventListener('keydown', e => {
      const t = e.target;
      if (t.dataset.key === 'add' && e.key === 'Enter') { e.preventDefault(); _addFromInput(t.dataset.gid); }
      if (t.dataset.key === 'edit' && e.key === 'Enter') { e.preventDefault(); _op(window.wkTagOps?.renameValue(t.dataset.gid, S.edit && S.edit.v, t.value)); }
    });
    if (!document.getElementById('ts-style')) {
      const st = document.createElement('style'); st.id = 'ts-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
  }
  // 画面の文言（翻訳は i18n.js が表示で行う。ここでは日本語のまま返す）
  function _t(s) { return _esc(s); }

  const CSS = `
#tag-display-settings .ts-cap{font-size:12px;color:var(--text3);margin:4px 2px 6px}
#tag-display-settings .ts-capbtn{background:none;border:none;display:flex;width:100%;justify-content:space-between;padding:10px 2px 6px;font-family:inherit;cursor:pointer}
#tag-display-settings .ts-card{border-top:1px solid var(--border2)}
#tag-display-settings .ts-slot{position:relative;background:var(--surface);transition:transform .15s}
#tag-display-settings .ts-slot.ts-dragging{transition:none;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,.25);border-radius:8px}
#tag-display-settings .ts-slotrow{display:flex;align-items:center}
#tag-display-settings .ts-slotrow .ts-row{flex:1;min-width:0}
#tag-display-settings .ts-grip{flex-shrink:0;align-self:stretch;display:flex;align-items:center;padding:0 10px 0 2px;color:var(--text3);font-size:18px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;border-bottom:1px solid var(--border2)}
#tag-display-settings .ts-dragging .ts-grip{cursor:grabbing}
#tag-display-settings .ts-row{width:100%;display:flex;align-items:center;gap:10px;background:none;border:none;border-bottom:1px solid var(--border2);padding:13px 0;text-align:left;cursor:pointer;font-family:inherit;color:var(--text)}
#tag-display-settings .ts-num{font-size:11px;font-weight:700;padding:3px 8px;border-radius:10px;background:var(--accent);color:var(--on-accent);flex-shrink:0}
#tag-display-settings .ts-num.off{background:var(--surface3);color:var(--text3)}
#tag-display-settings .ts-name{font-size:15px;font-weight:600;min-width:0;overflow-wrap:anywhere}
#tag-display-settings .ts-unset{flex:1;color:var(--text3)}
#tag-display-settings .ts-sub{font-size:11px;color:var(--text3);flex:1;white-space:nowrap}
#tag-display-settings .ts-car{font-size:11px;color:var(--text3)}
#tag-display-settings .ts-panel{padding:10px 0 16px;border-bottom:1px solid var(--border2)}
#tag-display-settings .ts-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#tag-display-settings .ts-lbl{display:block;font-size:11px;color:var(--text3);margin-bottom:5px}
#tag-display-settings .ts-mt{margin-top:12px}
#tag-display-settings .ts-right{float:right}
#tag-display-settings .ts-inp,#tag-display-settings .ts-sel{width:100%;box-sizing:border-box;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:9px 8px;font-size:14px;color:var(--text);font-family:inherit}
#tag-display-settings .ts-optwrap,#tag-display-settings .ts-chips,#tag-display-settings .ts-ops{display:flex;flex-wrap:wrap;gap:6px}
#tag-display-settings .ts-ops{margin-top:12px}
#tag-display-settings .ts-opt{display:inline-flex;align-items:center;gap:2px;background:var(--surface2);border-radius:14px;padding:4px 4px 4px 11px;font-size:13px}
#tag-display-settings .ts-opt button{background:none;border:none;color:var(--text3);font-size:14px;padding:2px 6px;cursor:pointer}
#tag-display-settings .ts-hid{opacity:.6;padding-right:6px}
#tag-display-settings .ts-opt .ts-show{font-size:11px;color:var(--accent);font-weight:700;margin-left:4px}
#tag-display-settings .ts-addrow{display:flex;gap:6px;margin-top:8px}
#tag-display-settings .ts-addrow input{flex:1;min-width:0;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:9px 8px;font-size:14px;color:var(--text);font-family:inherit}
#tag-display-settings .ts-chip{padding:7px 12px;border-radius:16px;border:1px solid var(--border);background:none;font-size:13px;color:var(--text);cursor:pointer;font-family:inherit}
#tag-display-settings .ts-chip.on{border-color:var(--accent);color:var(--accent);font-weight:700}
#tag-display-settings .ts-chip.has{opacity:.45;cursor:default}
#tag-display-settings .ts-gold{border:1px solid #d4a73a;color:#b7791f;background:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
#tag-display-settings .ts-gold[disabled]{opacity:.4;cursor:default}
#tag-display-settings .ts-goldtxt{color:#b7791f}
#tag-display-settings .ts-mini{padding:7px 11px;border-radius:8px;border:1px solid var(--border);background:none;font-size:12px;color:var(--text);cursor:pointer;font-family:inherit}
#tag-display-settings .ts-plain{padding:10px;border-radius:8px;border:1px solid var(--border);background:none;color:var(--text);cursor:pointer;font-family:inherit}
#tag-display-settings .ts-redline{width:100%;margin-top:8px;padding:9px;border-radius:8px;border:1.5px solid #ef4444;background:transparent;color:#ef4444;font-weight:700;cursor:pointer;font-family:inherit}
#tag-display-settings .ts-optname{background:none;border:none;padding:0;color:inherit;font:inherit;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
#tag-display-settings .ts-btns{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
#tag-display-settings .ts-danger{color:#ef4444;border-color:#ef444466}
#tag-display-settings .ts-red{padding:10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-weight:700;cursor:pointer;font-family:inherit}
#tag-display-settings .ts-confirm{margin-top:10px;border:1px solid var(--border);border-radius:9px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
#tag-display-settings .ts-confirm p{margin:0;font-size:12px;color:var(--text2);line-height:1.6}
#tag-display-settings .ts-issue{border:1px solid rgba(229,196,122,.45);border-radius:9px;padding:2px 10px}
#tag-display-settings .ts-irow{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border2);font-size:13px;flex-wrap:wrap}
#tag-display-settings .ts-irow:last-child{border-bottom:none}
#tag-display-settings .ts-irow>span{flex:1;min-width:140px}
#tag-display-settings .ts-irow small{color:var(--text3);font-size:11px}
#tag-display-settings .ts-acc{width:100%;display:flex;align-items:center;gap:10px;background:none;border:1px solid var(--border);border-radius:9px;padding:10px 12px;text-align:left;cursor:pointer;font-family:inherit;color:var(--text)}
#tag-display-settings .ts-grow{flex:1}
#tag-display-settings .ts-block{display:block;font-size:13px}
#tag-display-settings .ts-small{font-size:11px;color:var(--text3);margin-top:2px}
#tag-display-settings .ts-sw{width:36px;height:20px;border-radius:10px;background:var(--surface3);position:relative;flex-shrink:0}
#tag-display-settings .ts-sw span{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
#tag-display-settings .ts-sw.on{background:var(--accent)}
#tag-display-settings .ts-sw.on span{left:18px}
#tag-display-settings .ts-warn{font-size:12px;color:#b7791f;background:rgba(229,196,122,.12);border-radius:8px;padding:8px 10px;margin-top:8px;line-height:1.6}
#tag-display-settings .ts-hint,#tag-display-settings .ts-note{font-size:11px;color:var(--text3);margin-top:6px;line-height:1.5}
#tag-display-settings .ts-p{font-size:12px;color:var(--text2)}
#tag-display-settings .ts-dim{font-size:12px;color:var(--text3)}
#tag-display-settings .ts-empty{font-size:12px;color:var(--text3);padding:12px 0}
@media (max-width:420px){#tag-display-settings .ts-two{grid-template-columns:1fr}}
`;

  window.renderTagShelf = render;
  // 一覧が変わったら（他の端末の変更を含む）、開いていれば描き直す
  window.addEventListener('wk-tagreg', () => { if (document.getElementById('tag-display-settings')) render(); });
})();
