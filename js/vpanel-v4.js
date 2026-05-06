// ═══ WAZA KIMURA — VPanel 4層タグ編集 (新スキーマ) ═══
// vpanel.js が呼び出す HTML ビルダー + チップ操作ハンドラ。
// 新フィールド v.tb / v.cat / v.pos / v.tags / v.tbLocked を直接編集。
// 旧 vp-tb/ac/pos/tech 系とは独立。

(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function _findV(id) { return (window.videos || []).find(v => v.id === id); }
  function _tagVis(key) { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; }

  // ── HTML ビルダー (vpanel.js から呼ばれる) ──
  window.vpV4SectionHTML = function (id) {
    const v = _findV(id);
    if (!v) return '';
    if (!Array.isArray(v.tb))   v.tb   = [];
    if (!Array.isArray(v.cat))  v.cat  = [];
    if (!Array.isArray(v.pos))  v.pos  = [];
    if (!Array.isArray(v.tags)) v.tags = [];

    const TB = window.TB_VALUES || ['トップ','ボトム','スタンディング'];
    const CATS = window.CATEGORIES || [];
    // TB row (3固定 + 🔒)
    const tbRow = TB.map(t => {
      const on = v.tb.includes(t);
      return `<span class="vp-chip${on?' on-tb':''}" style="cursor:pointer" onclick="vpV4ToggleTb('${id}','${t}',this)">${t}</span>`;
    }).join('');
    const lockBtn = `<span class="vp-chip" style="cursor:pointer;background:${v.tbLocked?'rgba(255,180,0,.2)':'var(--surface2)'};color:${v.tbLocked?'#c80':'var(--text3)'}" onclick="vpV4ToggleLock('${id}',this)" title="ロック中はAI再解析でTBが上書きされません">${v.tbLocked?'🔒 ロック中':'🔓 自動'}</span>`;

    // Category row (10固定 multi-select)
    const catRow = CATS.map(c => {
      const on = v.cat.includes(c.name);
      return `<span class="vp-chip${on?' on-cat':''}" style="cursor:pointer" title="${_esc(c.desc)}" onclick="vpV4ToggleCat('${id}','${_esc(c.name)}',this)">${_esc(c.name)}</span>`;
    }).join('');

    // Position row — カスタム DD（<select>を廃止してネイティブピッカーを回避）
    const posChips = v.pos.map(p =>
      `<span class="vp-chip on-pos" style="cursor:pointer" onclick="vpV4RemovePos('${id}','${_esc(p)}',this)">${_esc(p)} ×</span>`
    ).join('');
    const posPicker = `
      <div class="vp-dd-wrap" style="display:inline-block;position:relative">
        <span class="vp-chip" style="border-style:dashed;cursor:pointer" onclick="vpV4OpenPosDd('${id}',this)">＋ ポジション</span>
        <div class="vp-dd" id="vp-v4-pos-dd-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="絞り込み..."
            oninput="vpV4FilterPosDd('${id}',this.value)"
            onkeydown="if(event.key==='Escape'){this.closest('.vp-dd').style.display='none'}">
          <div class="vp-dd-list" id="vp-v4-pos-list-${id}"></div>
        </div>
      </div>`;

    // Tags row — カスタム DD（インライン input を廃止してモバイルキーボード誤起動を防止）
    const tagChips = v.tags.map(t =>
      `<span class="vp-chip on-tags" style="cursor:pointer" onclick="vpV4RemoveTag('${id}','${_esc(t)}',this)">${_esc(t)} ×</span>`
    ).join('');
    const tagInput = `
      <div class="vp-dd-wrap" style="display:inline-block;position:relative">
        <span class="vp-chip" style="border-style:dashed;cursor:pointer" onclick="vpV4OpenTagDd('${id}',this)">＋ テクニック</span>
        <div class="vp-dd" id="vp-v4-tag-dd-${id}" style="display:none">
          <input class="vp-dd-search" id="vp-v4-tag-inp-${id}" placeholder="テクニック検索・新規追加（Enterで追加）"
            oninput="vpV4TagFilter('${id}',this.value)"
            onkeydown="vpV4TagKey('${id}',event,this)">
          <div class="vp-dd-list" id="vp-v4-tag-sug-${id}"></div>
        </div>
      </div>`;

    const showTb   = _tagVis('tb');
    const showCat  = _tagVis('cat');
    const showPos  = _tagVis('pos');
    const showTags = _tagVis('tags');
    if (!showTb && !showCat && !showPos && !showTags) return '';
    const tbRowHtml   = showTb   ? `<div class="vp-row"><span class="vp-lbl">トップ/ボトム/スタンディング</span><div class="vp-chips" id="vp-v4-tb-${id}">${tbRow}${lockBtn}</div></div>` : '';
    const catRowHtml  = showCat  ? `<div class="vp-row"><span class="vp-lbl">カテゴリ</span><div class="vp-chips" id="vp-v4-cat-${id}">${catRow}</div></div>` : '';
    const posRowHtml  = showPos  ? `<div class="vp-row"><span class="vp-lbl">ポジション</span><div class="vp-chips" id="vp-v4-pos-${id}">${posChips}${posPicker}</div></div>` : '';
    const tagsRowHtml = showTags ? `<div class="vp-row"><span class="vp-lbl">テクニック</span><div class="vp-chips" id="vp-v4-tags-${id}">${tagChips}${tagInput}</div></div>` : '';
    return `
    <div id="vp-tag-fsec-${id}" class="fsec">
      <div class="fsec-title">タグ</div>
      ${tbRowHtml}${catRowHtml}${posRowHtml}${tagsRowHtml}
    </div>`;
  };

  // ── TB トグル + ロック ──
  window.vpV4ToggleTb = function (id, t, el) {
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.tb)) v.tb = [];
    const i = v.tb.indexOf(t);
    if (i >= 0) { v.tb.splice(i, 1); el.classList.remove('on-tb'); }
    else        { v.tb.push(t);     el.classList.add('on-tb'); }
    _save(id);
    window.AF?.();
  };
  window.vpV4ToggleLock = function (id, el) {
    const v = _findV(id); if (!v) return;
    v.tbLocked = !v.tbLocked;
    el.style.background = v.tbLocked ? 'rgba(255,180,0,.2)' : 'var(--surface2)';
    el.style.color      = v.tbLocked ? '#c80' : 'var(--text3)';
    el.textContent      = v.tbLocked ? '🔒 ロック中' : '🔓 自動';
    _save(id);
    window.toast?.(v.tbLocked ? '🔒 TB をロックしました' : '🔓 TB ロック解除');
  };

  // ── Category トグル ──
  window.vpV4ToggleCat = function (id, name, el) {
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.cat)) v.cat = [];
    const i = v.cat.indexOf(name);
    if (i >= 0) { v.cat.splice(i, 1); el.classList.remove('on-cat'); }
    else        { v.cat.push(name);   el.classList.add('on-cat'); }
    _save(id);
    window.AF?.();
  };

  // ── Position カスタム DD ──
  window.vpV4OpenPosDd = function (id) {
    const dd = document.getElementById('vp-v4-pos-dd-' + id);
    if (!dd) return;
    if (dd.style.display !== 'none' && dd.style.display !== '') {
      dd.style.display = 'none'; return;
    }
    // vpanel.js の _vpOpenDd を共用（window._vpOpenDd として公開済み）
    window._vpOpenDd?.(dd);
    _vpV4RenderPosDd(id, '');
    const inp = dd.querySelector('.vp-dd-search');
    if (inp) { inp.value = ''; inp.focus(); }
  };

  function _vpV4RenderPosDd(id, q) {
    const list = document.getElementById('vp-v4-pos-list-' + id);
    if (!list) return;
    const v = _findV(id);
    const selected = v?.pos || [];
    const POSS = window.POSITIONS || [];
    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? POSS.filter(p => !selected.includes(p.ja) && (p.ja.includes(ql) || p.en.toLowerCase().includes(ql)))
      : POSS.filter(p => !selected.includes(p.ja));
    list.innerHTML = filtered.length
      ? filtered.map(p =>
          `<div class="vp-dd-item" onmousedown="vpV4PosPick('${id}','${_esc(p.ja)}')">${_esc(p.ja)}<span class="vp-dd-cnt">${_esc(p.en)}</span></div>`
        ).join('')
      : `<div style="padding:10px 12px;color:var(--text3);font-size:11px">候補なし</div>`;
  }

  window.vpV4FilterPosDd = function (id, q) { _vpV4RenderPosDd(id, q); };

  window.vpV4PosPick = function (id, val) {
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.pos)) v.pos = [];
    if (!v.pos.includes(val)) v.pos.push(val);
    const dd = document.getElementById('vp-v4-pos-dd-' + id);
    if (dd) dd.style.display = 'none';
    _rerenderRow(id, 'pos');
    _save(id);
    window.AF?.();
  };

  window.vpV4RemovePos = function (id, val) {
    const v = _findV(id); if (!v) return;
    v.pos = (v.pos || []).filter(p => p !== val);
    _rerenderRow(id, 'pos');
    _save(id);
    window.AF?.();
  };

  // ── #Tag カスタム DD ──
  function _getAllTags() {
    return [...new Set((window.videos || []).flatMap(v => v.tags || []))].sort((a,b) => a.localeCompare(b,'ja'));
  }

  // DD を開く（チップタップ時。キーボードは開かない）
  window.vpV4OpenTagDd = function (id) {
    const dd = document.getElementById('vp-v4-tag-dd-' + id);
    if (!dd) return;
    if (dd.style.display !== 'none' && dd.style.display !== '') {
      dd.style.display = 'none'; return;
    }
    window._vpOpenDd?.(dd);
    _vpV4RenderTagList(id, '');
    // search input には自動 focus しない（モバイルキーボード誤起動防止）
  };

  // リスト描画（q: 検索文字列）
  function _vpV4RenderTagList(id, q) {
    const list = document.getElementById('vp-v4-tag-sug-' + id);
    if (!list) return;
    const v = _findV(id);
    const existing = v?.tags || [];
    const all = _getAllTags().filter(t => !existing.includes(t));
    const ql = q.trim().toLowerCase();
    const filtered = ql ? all.filter(t => t.toLowerCase().includes(ql)) : all;
    const _mkItem = t =>
      `<div class="vp-dd-item" onmousedown="vpV4TagPick('${id}','${_esc(t).replace(/'/g,"&#39;")}')">${_esc(t)}</div>`;
    if (ql) {
      list.innerHTML = filtered.map(_mkItem).join('') ||
        `<div style="padding:10px 12px;color:var(--text3);font-size:11px">候補なし</div>`;
    } else {
      const _groups = window.getTagGroups ? window.getTagGroups() : [];
      const _inGrp  = new Set(_groups.flatMap(g => g.techNames || []));
      const parts   = [];
      _groups.forEach(g => {
        const members = filtered.filter(t => (g.techNames || []).includes(t));
        if (!members.length) return;
        parts.push(`<div class="tag-grp-hdr">${_esc(g.name)}</div>`);
        members.forEach(t => parts.push(_mkItem(t)));
      });
      const unc = filtered.filter(t => !_inGrp.has(t));
      if (unc.length) {
        parts.push(`<div class="tag-grp-hdr" style="font-style:italic">${_esc('未グループ')}</div>`);
        unc.forEach(t => parts.push(_mkItem(t)));
      }
      list.innerHTML = parts.length ? parts.join('') : '';
    }
  }

  // search input の oninput ハンドラ
  window.vpV4TagFilter = function (id, q) { _vpV4RenderTagList(id, q); };

  // 後方互換: SR VP など旧参照が残っている場合のフォールバック
  window.vpV4TagSuggest = function (id, inp) {
    _vpV4RenderTagList(id, inp?.value || '');
  };

  window.vpV4TagPick = function (id, val) {
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.tags)) v.tags = [];
    if (!v.tags.includes(val)) v.tags.push(val);
    const dd = document.getElementById('vp-v4-tag-dd-' + id);
    if (dd) dd.style.display = 'none';
    _rerenderRow(id, 'tags');
    _save(id);
    window.AF?.();
  };

  // ── #Tag 追加/削除 ──
  window.vpV4TagKey = function (id, ev, inp) {
    if (ev.key === 'Escape') {
      const dd = document.getElementById('vp-v4-tag-dd-' + id);
      if (dd) dd.style.display = 'none';
      return;
    }
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const val = inp.value.trim();
    if (!val) return;
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.tags)) v.tags = [];
    if (!v.tags.includes(val)) v.tags.push(val);
    inp.value = '';
    _rerenderRow(id, 'tags');
    _save(id);
    window.AF?.();
  };
  window.vpV4RemoveTag = function (id, val) {
    const v = _findV(id); if (!v) return;
    v.tags = (v.tags || []).filter(t => t !== val);
    _rerenderRow(id, 'tags');
    _save(id);
    window.AF?.();
  };

  function _rerenderRow(id, kind) {
    const host = document.getElementById(`vp-v4-${kind}-${id}`);
    if (!host) return;
    const sec = host.closest('.fsec');
    if (sec) sec.outerHTML = window.vpV4SectionHTML(id);
  }

  // 外部から 4層タグセクションを再描画する公開API
  window.vpRefreshV4 = function (id) {
    const host = document.getElementById(`vp-v4-tb-${id}`)
              || document.getElementById(`vp-v4-cat-${id}`)
              || document.getElementById(`vp-v4-pos-${id}`)
              || document.getElementById(`vp-v4-tags-${id}`);
    if (!host) return;
    const sec = host.closest('.fsec');
    if (sec) sec.outerHTML = window.vpV4SectionHTML(id);
  };

  function _save(id) {
    if (typeof window.autoSaveVp === 'function') window.autoSaveVp(id);
    else window.debounceSave?.();
  }
})();
