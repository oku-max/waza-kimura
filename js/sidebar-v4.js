// ═══ WAZA KIMURA — 4層タグ・新サイドバー (並列追加) ═══
// 旧サイドバーの下に4層フィルターセクションを追加。
// 新 filters.cat / filters.tags / filters.tbNew を追加して既存 filt() に AND で合流。
// 旧 UI は一切変更しない (A2-a+b 合併ステップ)。

(function () {
  'use strict';

  // ── 新フィルターキーを window.filters に追加 ──
  function _ensureFilters() {
    if (!window.filters) return false;
    if (!window.filters.cat)    window.filters.cat    = new Set();
    if (!window.filters.tags)   window.filters.tags   = new Set();
    if (!window.filters.tbNew)  window.filters.tbNew  = new Set();
    if (!window.filters.posNew) window.filters.posNew = new Set();
    return true;
  }

  // ── filt() を monkey-patch して新キーを AND 合流 ──
  let _patched = false;
  function _patchFilt() {
    if (_patched) return;
    if (!window.filt) return;
    const orig = window.filt;
    window.filt = function (list) {
      const base = orig(list);
      const f = window.filters || {};
      const hasTb   = f.tbNew  && f.tbNew.size;
      const hasCat  = f.cat    && f.cat.size;
      const hasPos  = f.posNew && f.posNew.size;
      const hasTags = f.tags   && f.tags.size;
      if (!hasTb && !hasCat && !hasPos && !hasTags) return base;
      return base.filter(v => {
        if (hasTb   && !(Array.isArray(v.tb)  && v.tb.some(t  => f.tbNew.has(t))))   return false;
        if (hasCat  && !(Array.isArray(v.cat) && v.cat.some(c => f.cat.has(c))))     return false;
        if (hasPos  && !(Array.isArray(v.pos) && v.pos.some(p => f.posNew.has(p))))  return false;
        if (hasTags && !(Array.isArray(v.tags)&& v.tags.some(t => f.tags.has(t))))   return false;
        return true;
      });
    };
    _patched = true;
  }

  // ── 件数カウント (新キー対応) ──
  function _cntContextNew(key, val) {
    const vs = window.videos || [];
    const f  = window.filters || {};
    return vs.filter(v => {
      if (v.archived) return false;
      // 既存の他キーも尊重 (簡易)
      if (key !== 'tbNew'  && f.tbNew?.size  && !(v.tb  || []).some(t => f.tbNew.has(t)))  return false;
      if (key !== 'cat'    && f.cat?.size    && !(v.cat || []).some(c => f.cat.has(c)))    return false;
      if (key !== 'posNew' && f.posNew?.size && !(v.pos || []).some(p => f.posNew.has(p))) return false;
      if (key !== 'tags'   && f.tags?.size   && !(v.tags|| []).some(t => f.tags.has(t)))   return false;
      // 値チェック
      if (key === 'tbNew')  return (v.tb  || []).includes(val);
      if (key === 'cat')    return (v.cat || []).includes(val);
      if (key === 'posNew') return (v.pos || []).includes(val);
      if (key === 'tags')   return (v.tags|| []).includes(val);
      return false;
    }).length;
  }

  // ── DOM インジェクト ──
  function _inject() {
    const host = document.getElementById('fs-accordion-area');
    if (!host) return;
    if (document.getElementById('fs-acc-v4')) return; // 既に注入済み

    const sec = document.createElement('div');
    sec.className = 'fs-acc-sec';
    sec.id = 'fs-acc-v4';
    sec.innerHTML = `
      <div class="fs-acc-hdr" onclick="(function(){
        var b=document.getElementById('fs-acc-body-v4');
        var a=document.getElementById('fs-acc-arr-v4');
        if(!b)return;
        var open=b.style.display!=='none';
        b.style.display=open?'none':'block';
        if(a)a.textContent=open?'▶':'▼';
      })()">
        <span>🆕 4層タグ <span style="color:var(--accent);font-size:9px">NEW</span></span>
        <span class="fs-acc-arrow" id="fs-acc-arr-v4">▼</span>
      </div>
      <div class="fs-acc-body" id="fs-acc-body-v4" style="display:block;padding:8px 12px 12px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);margin:4px 0 4px;letter-spacing:.5px">🧭 TB</div>
        <div id="fs-v4-tb" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);margin:6px 0 4px;letter-spacing:.5px">📂 カテゴリー</div>
        <div id="fs-v4-cat" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px"></div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);margin:6px 0 4px;letter-spacing:.5px">📍 ポジション</div>
        <div id="fs-v4-pos" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;max-height:160px;overflow-y:auto"></div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);margin:6px 0 4px;letter-spacing:.5px">🏷️ #タグ <span style="color:var(--text3);font-weight:400">(上位20)</span></div>
        <div id="fs-v4-tags" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto"></div>
      </div>
    `;
    // 最近みた動画の直後に挿入
    const recent = document.getElementById('fs-acc-recent');
    if (recent && recent.nextSibling) host.insertBefore(sec, recent.nextSibling);
    else host.insertBefore(sec, host.firstChild);
  }

  // ── チップ生成 ──
  function _mkChip(label, icon, active, cnt, onclick) {
    const el = document.createElement('div');
    el.className = 'chip' + (active ? ' active' : '');
    el.style.cssText = 'cursor:pointer;font-size:11px;padding:3px 8px';
    if (cnt === 0 && !active) el.style.opacity = '0.4';
    el.innerHTML = `${icon || ''}${label}${cnt ? ` <span style="font-size:9px;opacity:.7">${cnt}</span>` : ''}`;
    el.onclick = onclick;
    return el;
  }

  function _render() {
    if (!_ensureFilters()) return;
    const f = window.filters;

    // TB
    const tbHost = document.getElementById('fs-v4-tb');
    if (tbHost) {
      tbHost.innerHTML = '';
      const TB_ICO = { 'トップ':'🔼', 'ボトム':'🔽', 'スタンディング':'⏫' };
      (window.TB_VALUES || ['トップ','ボトム','スタンディング']).forEach(t => {
        const n = _cntContextNew('tbNew', t);
        tbHost.appendChild(_mkChip(t, TB_ICO[t] || '', f.tbNew.has(t), n, () => {
          f.tbNew.has(t) ? f.tbNew.delete(t) : f.tbNew.add(t);
          _render(); window.AF?.();
        }));
      });
    }

    // Category
    const catHost = document.getElementById('fs-v4-cat');
    if (catHost) {
      catHost.innerHTML = '';
      (window.CATEGORIES || []).forEach(c => {
        const n = _cntContextNew('cat', c.name);
        catHost.appendChild(_mkChip(c.name, '', f.cat.has(c.name), n, () => {
          f.cat.has(c.name) ? f.cat.delete(c.name) : f.cat.add(c.name);
          _render(); window.AF?.();
        }));
      });
    }

    // Position
    const posHost = document.getElementById('fs-v4-pos');
    if (posHost) {
      posHost.innerHTML = '';
      (window.POSITIONS || []).forEach(p => {
        const n = _cntContextNew('posNew', p.ja);
        if (n === 0 && !f.posNew.has(p.ja)) return; // 0件は隠す
        posHost.appendChild(_mkChip(p.ja, '', f.posNew.has(p.ja), n, () => {
          f.posNew.has(p.ja) ? f.posNew.delete(p.ja) : f.posNew.add(p.ja);
          _render(); window.AF?.();
        }));
      });
      if (!posHost.children.length) {
        posHost.innerHTML = '<div style="font-size:10px;color:var(--text3)">該当ポジションなし</div>';
      }
    }

    // #Tag
    const tagHost = document.getElementById('fs-v4-tags');
    if (tagHost) {
      tagHost.innerHTML = '';
      const m = new Map();
      (window.videos || []).forEach(v => {
        if (v.archived) return;
        (v.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1));
      });
      const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
      if (!sorted.length) {
        tagHost.innerHTML = '<div style="font-size:10px;color:var(--text3)">#タグなし</div>';
      } else {
        sorted.forEach(([t, cnt]) => {
          const n = _cntContextNew('tags', t);
          tagHost.appendChild(_mkChip('#' + t, '', f.tags.has(t), n, () => {
            f.tags.has(t) ? f.tags.delete(t) : f.tags.add(t);
            _render(); window.AF?.();
          }));
        });
      }
    }
  }

  // ── 初期化 ──
  function init() {
    _inject();
    _ensureFilters();
    // filt が後から import される可能性に備えて遅延 patch
    let tries = 0;
    const timer = setInterval(() => {
      if (window.filt) { _patchFilt(); _render(); clearInterval(timer); }
      if (++tries > 40) clearInterval(timer); // 4秒タイムアウト
    }, 100);
    // AF をラップ: orig 実行後、新キーで追加絞り込みして再レンダー + 件数更新
    if (window.AF && !window._v4AFPatched) {
      const origAF = window.AF;
      window.AF = function () {
        origAF.apply(this, arguments);
        const f = window.filters || {};
        const hasTb   = f.tbNew  && f.tbNew.size;
        const hasCat  = f.cat    && f.cat.size;
        const hasPos  = f.posNew && f.posNew.size;
        const hasTags = f.tags   && f.tags.size;
        if (hasTb || hasCat || hasPos || hasTags) {
          const base = window._vpFilteredList || [];
          const filtered = base.filter(v => {
            if (hasTb   && !(Array.isArray(v.tb)  && v.tb.some(t  => f.tbNew.has(t))))   return false;
            if (hasCat  && !(Array.isArray(v.cat) && v.cat.some(c => f.cat.has(c))))     return false;
            if (hasPos  && !(Array.isArray(v.pos) && v.pos.some(p => f.posNew.has(p))))  return false;
            if (hasTags && !(Array.isArray(v.tags)&& v.tags.some(t => f.tags.has(t))))   return false;
            return true;
          });
          window._vpFilteredList = filtered;
          window.renderCards?.(filtered, 'cardList');
          // 件数表示も上書き
          const rc = document.getElementById('rc'); if (rc) rc.textContent = filtered.length + ' 本 表示中';
          const rct = document.getElementById('rc-topbar'); if (rct) { rct.textContent = filtered.length + ' 件'; rct.style.display = 'inline'; }
          const fhn = document.getElementById('fov-hit-num'); if (fhn) fhn.textContent = filtered.length;
          const fhb = document.getElementById('fov-hit-badge'); if (fhb) fhb.textContent = filtered.length + ' 件';
        }
        _render();
      };
      window._v4AFPatched = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  window.renderSidebarV4 = _render;
})();
