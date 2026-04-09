// ═══ WAZA KIMURA — VPanel 4層タグ編集 (新スキーマ) ═══
// vpanel.js が呼び出す HTML ビルダー + チップ操作ハンドラ。
// 新フィールド v.tb / v.cat / v.pos / v.tags / v.tbLocked を直接編集。
// 旧 vp-tb/ac/pos/tech 系とは独立。

(function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function _findV(id) { return (window.videos || []).find(v => v.id === id); }

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
      return `<span class="vp-chip${on?' on-ac':''}" style="cursor:pointer" title="${_esc(c.desc)}" onclick="vpV4ToggleCat('${id}','${_esc(c.name)}',this)">${_esc(c.name)}</span>`;
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

    // Tags row (自由入力)
    const tagChips = v.tags.map(t =>
      `<span class="vp-chip on-tech" style="cursor:pointer" onclick="vpV4RemoveTag('${id}','${_esc(t)}',this)">#${_esc(t)} ×</span>`
    ).join('');
    const tagInput = `<input class="vp-dd-search" placeholder="＋ #タグ追加 (Enter)" style="width:140px;font-size:11px" onkeydown="vpV4TagKey('${id}',event,this)">`;

    return `
    <div class="fsec" style="border:1px solid var(--accent);border-radius:8px;margin:6px;padding:6px">
      <div class="fsec-title" style="color:var(--accent)">タグ</div>

      <div class="vp-row">
        <span class="vp-lbl">トップ/ボトム/スタンディング</span>
        <div class="vp-chips" id="vp-v4-tb-${id}">${tbRow}${lockBtn}</div>
      </div>

      <div class="vp-row">
        <span class="vp-lbl">カテゴリー</span>
        <div class="vp-chips" id="vp-v4-cat-${id}">${catRow}</div>
      </div>

      <div class="vp-row">
        <span class="vp-lbl">ポジション</span>
        <div class="vp-chips" id="vp-v4-pos-${id}">${posChips}${posPicker}</div>
      </div>

      <div class="vp-row">
        <span class="vp-lbl">#タグ</span>
        <div class="vp-chips" id="vp-v4-tags-${id}">${tagChips}${tagInput}</div>
      </div>
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
    if (i >= 0) { v.cat.splice(i, 1); el.classList.remove('on-ac'); }
    else        { v.cat.push(name);   el.classList.add('on-ac'); }
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

  // ── #Tag 追加/削除 ──
  window.vpV4TagKey = function (id, ev, inp) {
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
