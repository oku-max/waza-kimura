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
    const POSS = window.POSITIONS || [];
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

    // Position row (現在選択中チップ + 追加ピッカー)
    const posChips = v.pos.map(p =>
      `<span class="vp-chip on-pos" style="cursor:pointer" onclick="vpV4RemovePos('${id}','${_esc(p)}',this)">${_esc(p)} ×</span>`
    ).join('');
    const posOpts = POSS.filter(p => !v.pos.includes(p.ja)).map(p =>
      `<option value="${_esc(p.ja)}">${_esc(p.ja)} (${_esc(p.en)})</option>`
    ).join('');
    const posPicker = `
      <select class="vp-chip" style="border-style:dashed;cursor:pointer" onchange="vpV4AddPos('${id}',this)">
        <option value="">＋ ポジション</option>
        ${posOpts}
      </select>`;

    // Tags row (検索・選択 + 自由入力)
    const tagChips = v.tags.map(t =>
      `<span class="vp-chip on-tags" style="cursor:pointer" onclick="vpV4RemoveTag('${id}','${_esc(t)}',this)">#${_esc(t)} ×</span>`
    ).join('');
    const tagInput = `<div class="vp-dd-wrap" style="display:inline-block;position:relative">
      <input class="vp-dd-search" id="vp-v4-tag-inp-${id}" placeholder="＋ #タグ検索・追加" style="width:160px;font-size:11px;border-radius:8px"
        oninput="vpV4TagSuggest('${id}',this)" onfocus="vpV4TagSuggest('${id}',this)"
        onkeydown="vpV4TagKey('${id}',event,this)">
      <div class="vp-dd" id="vp-v4-tag-sug-${id}" style="display:none;position:absolute;top:100%;left:0;width:220px;max-height:200px;overflow-y:auto;z-index:50;border-radius:8px"></div>
    </div>`;

    const showTb   = _tagVis('tb');
    const showCat  = _tagVis('cat');
    const showPos  = _tagVis('pos');
    const showTags = _tagVis('tags');
    if (!showTb && !showCat && !showPos && !showTags) return '';
    const tbRowHtml   = showTb   ? `<div class="vp-row"><span class="vp-lbl">トップ/ボトム/スタンディング</span><div class="vp-chips" id="vp-v4-tb-${id}">${tbRow}${lockBtn}</div></div>` : '';
    const catRowHtml  = showCat  ? `<div class="vp-row"><span class="vp-lbl">カテゴリー</span><div class="vp-chips" id="vp-v4-cat-${id}">${catRow}</div></div>` : '';
    const posRowHtml  = showPos  ? `<div class="vp-row"><span class="vp-lbl">ポジション</span><div class="vp-chips" id="vp-v4-pos-${id}">${posChips}${posPicker}</div></div>` : '';
    const tagsRowHtml = showTags ? `<div class="vp-row"><span class="vp-lbl">#タグ</span><div class="vp-chips" id="vp-v4-tags-${id}">${tagChips}${tagInput}</div></div>` : '';
    return `
    <div class="fsec" style="border:1px solid var(--accent);border-radius:8px;margin:6px;padding:6px">
      <div class="fsec-title" style="color:var(--accent)">タグ</div>
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

  // ── Position 追加/削除 ──
  window.vpV4AddPos = function (id, sel) {
    const val = sel.value;
    if (!val) return;
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.pos)) v.pos = [];
    if (!v.pos.includes(val)) v.pos.push(val);
    sel.value = '';
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

  // ── #Tag 検索サジェスト ──
  function _getAllTags() {
    return [...new Set((window.videos || []).flatMap(v => v.tags || []))].sort((a,b) => a.localeCompare(b,'ja'));
  }
  window.vpV4TagSuggest = function (id, inp) {
    const sug = document.getElementById('vp-v4-tag-sug-' + id);
    if (!sug) return;
    const q = (inp.value || '').trim().toLowerCase();
    const v = _findV(id);
    const existing = v?.tags || [];
    const all = _getAllTags().filter(t => !existing.includes(t));
    const filtered = q ? all.filter(t => t.toLowerCase().includes(q)) : all;
    if (!filtered.length) { sug.style.display = 'none'; return; }
    // SR VP: position:fixed でスクロールコンテナのクリップを回避 + スクロール追従
    if (window._srVpOpen) {
      const _updatePos = () => {
        const r = inp.getBoundingClientRect();
        sug.style.top  = (r.bottom + 2) + 'px';
        sug.style.left = r.left + 'px';
      };
      Object.assign(sug.style, {
        position: 'fixed',
        right: 'auto', bottom: 'auto',
        width: '220px', zIndex: '9500',
      });
      _updatePos();
      // スクロール追従 (重複登録防止)
      const _sc = document.querySelector('.yt-sr-vp-scroll');
      if (_sc && sug._srOnScroll) _sc.removeEventListener('scroll', sug._srOnScroll);
      if (_sc) {
        sug._srOnScroll = () => sug.style.display !== 'none' ? _updatePos() : (_sc.removeEventListener('scroll', sug._srOnScroll), sug._srOnScroll = null);
        _sc.addEventListener('scroll', sug._srOnScroll, { passive: true });
      }
    }
    sug.style.display = 'block';
    const _mkItem = t =>
      `<div class="vp-dd-item" style="padding:6px 10px;cursor:pointer;font-size:11px" onmousedown="vpV4TagPick('${id}','${_esc(t).replace(/'/g,"&#39;")}')">#${_esc(t)}</div>`;
    if (q) {
      // 検索中: フラット表示（既存動作）
      sug.innerHTML = filtered.map(_mkItem).join('');
    } else {
      // 未検索: グループ別表示 (案B)
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
      sug.innerHTML = parts.length ? parts.join('') : '';
    }
  };
  window.vpV4TagPick = function (id, val) {
    const v = _findV(id); if (!v) return;
    if (!Array.isArray(v.tags)) v.tags = [];
    if (!v.tags.includes(val)) v.tags.push(val);
    _rerenderRow(id, 'tags');
    _save(id);
    window.AF?.();
  };

  // ── #Tag 追加/削除 ──
  window.vpV4TagKey = function (id, ev, inp) {
    if (ev.key === 'Escape') {
      const sug = document.getElementById('vp-v4-tag-sug-' + id);
      if (sug) sug.style.display = 'none';
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
    // 全体再構築の方が単純
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
