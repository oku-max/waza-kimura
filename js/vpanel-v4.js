// ═══ WAZA KIMURA — VPanel タグ編集 ═══
// vpanel.js が呼び出す HTML ビルダー + チップ操作ハンドラ。
// タグ1〜4の枠（tag-registry.js）に入っているグループを並べ、その保存場所
// （v.tb / v.cat / v.pos / v.tags、新しいグループは v.tg[グループID]）を編集する。

(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  const _T   = (k, fb) => (window.t    ? window.t(k, fb) : fb);
  const _lTb  = v => (window.tTb  ? window.tTb(v)  : v);   // 表示のみ翻訳。データ値は日本語のまま
  const _lCat = v => (window.tCat ? window.tCat(v) : v);
  const _lPos = v => (window.tPos ? window.tPos(v) : v);
  function _findV(id) { return (window.videos || []).find(v => v.id === id); }
  function _tagVis(key) { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; }

  // ── タグ欄（段階2c）──
  // タグ1〜4の枠（tag-registry.js の slots）に入っているグループを、同じ作りで並べる。
  // 見せ方は選択肢の数で決める（displayMode: 少なければ並べて押す、多ければプルダウン）。
  // 以前はグループごとに作りが違った（タグ1・2は並べる、タグ3・4はプルダウン）。
  // できることは変えない: 新しい値を打ち込めるのはタグ4（tags）だけ（選択肢へ自動で足すのは段階4）。
  // 値は onclick の文字列に埋め込まず data 属性で渡す（' を含む値でボタンが壊れていた）。
  const FIELDS = ['tb', 'cat', 'pos', 'tags'];
  const _R = () => window.tagRegistry;
  const _ON_CLS = { tb: 'on-tb', cat: 'on-cat', pos: 'on-pos', tags: 'on-tags' };
  const _onCls = g => _ON_CLS[g.store] || 'on-tags';
  const _allowNew = g => g.store === 'tags';
  // 値の表示（組み込みの値だけ英語表示で訳す。データは日本語のまま）
  const _lbl = (g, v) => g.store === 'tb' ? _lTb(v) : g.store === 'cat' ? _lCat(v) : g.store === 'pos' ? _lPos(v) : String(v);

  // 枠に入っているグループ（マーク・習得も v52.876 から普通のタググループ＝store:'map'）
  function _slotGroups() {
    const R = _R();
    if (!R) return [];
    return R.slots().filter(g => g && (FIELDS.includes(g.store) || g.store === 'map'))
      .filter(g => !FIELDS.includes(g.store) || _tagVis(g.store));
  }
  function _group(gid) { return _R()?.group(gid) || null; }
  function _vals(v, g) { return _R().valuesOf(v, g.id); }
  // 動画にそのグループの値を1つ付ける／外す（そのグループの配列だけを触る。ほかは触らない）
  function _setVal(v, g, val, on) {
    let arr;
    if (FIELDS.includes(g.store)) {
      // 書くのは v.tb / v.cat / v.pos / v.tags（ほかの画面・検索・ウィザードが読む名前）
      if (!Array.isArray(v[g.store])) v[g.store] = [];
      arr = v[g.store];
      // v52.861〜862 が間違えて書いた先（v.tbNew / v.posNew）からも外す（読むときは両方を見るので）
      const sf = _R()?.strayFieldOf?.(g.store);
      if (!on && sf && Array.isArray(v[sf])) { const j = v[sf].indexOf(val); if (j >= 0) v[sf].splice(j, 1); }
    } else {
      if (!v.tg || typeof v.tg !== 'object' || Array.isArray(v.tg)) v.tg = {};
      if (!Array.isArray(v.tg[g.id])) v.tg[g.id] = [];
      arr = v.tg[g.id];
    }
    const i = arr.indexOf(val);
    if (on && i < 0) arr.push(val);
    if (!on && i >= 0) arr.splice(i, 1);
  }
  // 動画パネルとまとめて編集の両方から使う書き込みの入口（同じことを2か所に書かない）
  window.wkSetTagValue = function (v, gid, val, on) {
    const g = _group(gid);
    if (!v || !g || val == null || val === '') return false;
    _setVal(v, g, String(val), !!on);
    if (on) _autoAddOption(g, String(val), v);
    return true;
  };
  // 新しく打ち込んだ値は、選択肢にも足す（段階4）。
  // 「新しい」＝選択肢に無く、ほかのどの動画にも付いていない値。
  // 選択肢に無いのにほかの動画に付いている値（設定の「重複している可能性のあるタグ」に出るもの）は、勝手に足さない（設定で決める）。
  function _autoAddOption(g, val, v) {
    if (!(FIELDS.includes(g.store) || g.store === 'map')) return;
    if ((g.allOptions || g.options || []).includes(val)) return;   // 選択肢に出していないものも「選択肢にある」
    if ((window.videos || []).some(x => x !== v && _R().valuesOf(x, g.id).includes(val))) return;
    if (FIELDS.includes(g.store)) window.tagOptAdd?.(g.store, val);
    else _R().addOption(g.id, val);
  }

  // プルダウンの候補 = 選択肢 ＋ ほかの動画に付いている値（今までのタグ3・4と同じ）
  function _candidates(g) {
    const opts = g.options.slice();
    const seen = new Set(g.allOptions || opts);   // 選択肢に出していないもの（v52.878）は、ほかの動画に付いていても候補に出さない
    const extra = new Set();
    (window.videos || []).forEach(x => _R().valuesOf(x, g.id).forEach(t => { if (!seen.has(t)) extra.add(t); }));
    return opts.concat([...extra].sort((a, b) => String(a).localeCompare(String(b), 'ja')));
  }
  const _dAttr = (id, g, val) => `data-vid="${_esc(id)}" data-gid="${_esc(g.id)}"` + (val != null ? ` data-val="${_esc(val)}"` : '');

  function _rowHTML(v, g) {
    const id = v.id;
    const vals = _vals(v, g);
    const cls = _onCls(g);
    let inner;
    if (_R().displayMode(g.options.length) === 'chips') {
      // 並べて押す。選択肢に無いのに付いている値も出す（外せるように。黙って隠さない）
      const shown = g.options.concat(vals.filter(x => !g.options.includes(x)));
      inner = shown.map(t => {
        const on = vals.includes(t);
        return `<span class="vp-chip${on ? ' ' + cls : ''}" style="cursor:pointer" ${_dAttr(id, g, t)} onclick="vpV4Chip(this)">${_esc(_lbl(g, t))}</span>`;
      }).join('');
      if (_allowNew(g)) inner += _ddHTML(id, g);
    } else {
      // 付いている値を × 付きで並べ、プルダウンから足す
      inner = vals.map(t =>
        `<span class="vp-chip ${cls}" style="cursor:pointer" ${_dAttr(id, g, t)} onclick="vpV4Chip(this)">${_esc(_lbl(g, t))} ×</span>`
      ).join('') + _ddHTML(id, g);
    }
    return `<div class="vp-row"><span class="vp-lbl" data-user-text="1">${_esc(g.name)}</span><div class="vp-chips" id="vp-v4-${_esc(g.id)}-${id}">${inner}</div></div>`;
  }
  function _ddHTML(id, g) {
    const ph = _allowNew(g) ? _T('itag.dd.tech', 'テクニック検索・新規追加（Enterで追加）') : _T('itag.dd.filter', '絞り込み...');
    return `
      <div class="vp-dd-wrap" style="display:inline-block;position:relative">
        <span class="vp-chip" style="border-style:dashed;cursor:pointer" ${_dAttr(id, g)} onclick="vpV4OpenDd(this)" data-user-text="1">＋ ${_esc(g.name)}</span>
        <div class="vp-dd" id="vp-v4-dd-${_esc(g.id)}-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="${ph}" ${_dAttr(id, g)}
            oninput="vpV4DdFilter(this)" onkeydown="vpV4DdKey(event,this)">
          <div class="vp-dd-list" id="vp-v4-ddlist-${_esc(g.id)}-${id}"></div>
        </div>
      </div>`;
  }

  // ── HTML ビルダー (vpanel.js から呼ばれる) ──
  window.vpV4SectionHTML = function (id) {
    const v = _findV(id);
    if (!v) return '';
    if (!Array.isArray(v.tb))   v.tb   = [];
    if (!Array.isArray(v.cat))  v.cat  = [];
    if (!Array.isArray(v.pos))  v.pos  = [];
    if (!Array.isArray(v.tags)) v.tags = [];
    const gs = _slotGroups();
    if (!gs.length) return '';
    return `
    <div id="vp-tag-fsec-${id}" class="fsec">
      <div class="fsec-title">${_T('vp.tags','タグ')}</div>
      ${gs.map(g => _rowHTML(v, g)).join('')}
    </div>`;
  };

  // 並べたチップを押す: 付いていれば外す、付いていなければ付ける
  window.vpV4Chip = function (el) {
    const id = el.dataset.vid, g = _group(el.dataset.gid), val = el.dataset.val;
    const v = _findV(id); if (!v || !g || val == null) return;
    _setVal(v, g, val, !_vals(v, g).includes(val));
    _after(id);
  };

  // ── Position カスタム DD ──
  // ── ドロップダウンを開く共通処理 ──
  // これまでは dd が見つからないときも、vpanel.js の _vpOpenDd が未定義のときも
  // 黙って何も起きなかった。「押しても反応がない」と区別が付かないので、
  //  (1) _vpOpenDd が無ければ最低限の体裁で自前で開く（動く方を優先）
  //  (2) dd 自体が見つからないときだけ理由を出す
  function _vpV4Open(ddId, kind) {
    const dd = document.getElementById(ddId);
    if (!dd) {
      console.warn('[vpanel-v4] dropdown not found:', ddId);
      window.toast?.(`${kind}の一覧を開けませんでした（${ddId}）`, 3000);
      return null;
    }
    if (dd.style.display !== 'none' && dd.style.display !== '') { dd.style.display = 'none'; return null; }
    if (typeof window._vpOpenDd === 'function') { window._vpOpenDd(dd); return dd; }
    // フォールバック: _vpOpenDd が読み込まれていない場合でも開けるようにする
    console.warn('[vpanel-v4] _vpOpenDd is unavailable — using fallback');
    const wrap = dd.closest('.vp-dd-wrap');
    dd.style.position = 'fixed';
    dd.style.top = '50%';
    dd.style.transform = 'translateY(-50%)';
    dd.style.right = (wrap ? Math.max(8, window.innerWidth - wrap.getBoundingClientRect().right) : 12) + 'px';
    dd.style.left = 'auto';
    dd.style.width = 'min(360px, 92vw)';
    dd.style.maxHeight = Math.min(window.innerHeight * 0.585, 600) + 'px';
    dd.style.zIndex = '500';
    dd.style.display = 'flex';
    dd.style.flexDirection = 'column';
    dd.style.overflow = 'hidden';
    if (!dd.querySelector('.vp-dd-x')) {
      const x = document.createElement('button');
      x.className = 'vp-dd-x';
      x.textContent = '✕';
      x.style.cssText = 'position:absolute;top:7px;right:8px;background:none;border:none;' +
        'color:var(--text3);font-size:14px;line-height:1;cursor:pointer;padding:3px 5px;' +
        'border-radius:4px;z-index:1;font-family:inherit';
      x.onclick = ev => { ev.stopPropagation(); dd.style.display = 'none'; };
      dd.appendChild(x);
      const si = dd.querySelector('.vp-dd-search');
      if (si) si.style.paddingRight = '34px';
    }
    const list = dd.querySelector('.vp-dd-list');
    if (list) { list.style.flex = '1'; list.style.minHeight = '0'; list.style.maxHeight = 'none'; list.style.overflowY = 'auto'; }
    return dd;
  }

  // ── プルダウン ──
  window.vpV4OpenDd = function (el) {
    const id = el.dataset.vid, g = _group(el.dataset.gid); if (!g) return;
    const dd = _vpV4Open(`vp-v4-dd-${g.id}-${id}`, g.name);
    if (!dd) return;
    _renderDd(id, g, '');
    const inp = dd.querySelector('.vp-dd-search');
    if (inp) inp.value = '';
    // 検索欄には自動で focus しない（スマホでキーボードが勝手に開かないように）
  };
  function _renderDd(id, g, q) {
    const list = document.getElementById(`vp-v4-ddlist-${g.id}-${id}`);
    if (!list) return;
    const v = _findV(id);
    const has = v ? _vals(v, g) : [];
    const posDict = g.store === 'pos' ? new Map((window.POSITIONS || []).map(p => [p.ja, p.en || ''])) : null;
    const en = window.WK_LANG && window.WK_LANG() === 'en';
    const ql = q.trim().toLowerCase();
    const items = _candidates(g).filter(t => !has.includes(t)).filter(t => {
      if (!ql) return true;
      return String(t).toLowerCase().includes(ql) || (posDict && (posDict.get(t) || '').toLowerCase().includes(ql));
    });
    list.innerHTML = items.length
      ? items.map(t => {
          const sub = posDict ? (en ? '' : (posDict.get(t) || '')) : '';
          return `<div class="vp-dd-item" ${_dAttr(id, g, t)} onmousedown="vpV4DdPick(this)">${_esc(_lbl(g, t))}${sub ? `<span class="vp-dd-cnt">${_esc(sub)}</span>` : ''}</div>`;
        }).join('')
      : `<div style="padding:10px 12px;color:var(--text3);font-size:11px">${_T('itag.dd.none','候補なし')}</div>`;
  }
  window.vpV4DdFilter = function (inp) {
    const g = _group(inp.dataset.gid); if (g) _renderDd(inp.dataset.vid, g, inp.value);
  };
  window.vpV4DdPick = function (el) {
    const id = el.dataset.vid, g = _group(el.dataset.gid), val = el.dataset.val;
    const v = _findV(id); if (!v || !g || val == null) return;
    _setVal(v, g, val, true);
    const dd = document.getElementById(`vp-v4-dd-${g.id}-${id}`);
    if (dd) dd.style.display = 'none';
    _after(id);
  };
  // Enter: 新しい値を付ける（打ち込めるのはタグ4だけ。今までと同じ）／Escape: 閉じる
  window.vpV4DdKey = function (ev, inp) {
    const id = inp.dataset.vid, g = _group(inp.dataset.gid); if (!g) return;
    if (ev.key === 'Escape') {
      const dd = document.getElementById(`vp-v4-dd-${g.id}-${id}`);
      if (dd) dd.style.display = 'none';
      return;
    }
    if (ev.key !== 'Enter' || !_allowNew(g)) return;
    ev.preventDefault();
    const val = inp.value.trim();
    if (!val) return;
    const v = _findV(id); if (!v) return;
    _setVal(v, g, val, true);
    inp.value = '';
    _after(id);
  };

  function _after(id) {
    window.vpV4Rerender(id);
    _save(id);
    window.AF?.();
  }

  // タグ欄を丸ごと描き直す（外から呼ぶ入口。タグリセット等、パネルの外でデータを変えた後に使う）
  window.vpV4Rerender = function (id) {
    const sec = document.getElementById(`vp-tag-fsec-${id}`);
    if (sec) sec.outerHTML = window.vpV4SectionHTML(id);
  };

  function _save(id) {
    if (typeof window.autoSaveVp === 'function') window.autoSaveVp(id);
    else window.debounceSave?.();
  }
})();
