// ═══ WAZA KIMURA — 4層タグ サイドバー (ポップアップ方式) ═══
// サイドバーには開くボタンのみ。本体は右側 3カラムポップアップ。
// ライトモード固定（サイドバー外なのでアプリのテーマに依らない）。

(function () {
  'use strict';

  // ── フィルター初期化 ──
  function _ensureFilters() {
    if (!window.filters) return false;
    if (!window.filters.cat)    window.filters.cat    = new Set();
    if (!window.filters.tags)   window.filters.tags   = new Set();
    if (!window.filters.tbNew)  window.filters.tbNew  = new Set();
    if (!window.filters.posNew) window.filters.posNew = new Set();
    return true;
  }

  // ── 件数カウント (他レイヤーのAND込み) ──
  function _cnt(key, val) {
    const vs = window.videos || [];
    const f  = window.filters || {};
    return vs.filter(v => {
      if (v.archived) return false;
      if (key !== 'tbNew'  && f.tbNew?.size  && !(v.tb  || []).some(t => f.tbNew.has(t)))  return false;
      if (key !== 'cat'    && f.cat?.size    && !(v.cat || []).some(c => f.cat.has(c)))    return false;
      if (key !== 'posNew' && f.posNew?.size && !(v.pos || []).some(p => f.posNew.has(p))) return false;
      if (key === 'tbNew')  return (v.tb  || []).includes(val);
      if (key === 'cat')    return (v.cat || []).includes(val);
      if (key === 'posNew') return (v.pos || []).includes(val);
      return false;
    }).length;
  }

  // ── 全レイヤーAND最終ヒット数 ──
  function _totalHit() {
    const vs = window.videos || [];
    const f  = window.filters || {};
    const hasTb = f.tbNew?.size, hasCat = f.cat?.size, hasPos = f.posNew?.size;
    if (!hasTb && !hasCat && !hasPos) return vs.filter(v => !v.archived).length;
    return vs.filter(v => {
      if (v.archived) return false;
      if (hasTb  && !(v.tb  || []).some(t => f.tbNew.has(t)))  return false;
      if (hasCat && !(v.cat || []).some(c => f.cat.has(c)))    return false;
      if (hasPos && !(v.pos || []).some(p => f.posNew.has(p))) return false;
      return true;
    }).length;
  }

  // ── サイドバーボタン注入 ──
  function _injectButton() {
    const host = document.getElementById('fs-accordion-area');
    if (!host) return;
    if (document.getElementById('fs-v4-open-btn-sec')) return;

    const sec = document.createElement('div');
    sec.className = 'fs-acc-sec';
    sec.id = 'fs-v4-open-btn-sec';
    sec.innerHTML = `
      <div id="fs-v4-open-btn" style="margin:8px 10px;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;user-select:none">
        <span>🆕 4層タグ</span>
        <span id="fs-v4-btn-badge" style="background:#6b3fd4;color:#fff;font-size:10px;padding:1px 7px;border-radius:10px;display:none">0</span>
      </div>
    `;
    host.appendChild(sec); // 末尾 → 既存セクションの下
    sec.querySelector('#fs-v4-open-btn').onclick = openPopup;
  }

  // ── ポップアップ DOM 注入 ──
  function _injectPopup() {
    if (document.getElementById('v4-popup')) return;
    const css = `
<style id="v4-popup-css">
#v4-bd{position:fixed;inset:0;background:rgba(20,25,35,.35);display:none;z-index:9998}
#v4-bd.open{display:block}
#v4-popup{position:fixed;top:0;left:260px;bottom:0;width:min(760px,calc(100vw - 280px));background:#fff;color:#1a1d23;box-shadow:2px 0 24px rgba(0,0,0,.18);border-right:1px solid #e3e5ea;display:none;flex-direction:column;z-index:9999;font:13px/1.5 -apple-system,"Hiragino Sans",sans-serif}
#v4-popup.open{display:flex}
#v4-popup .v4-hdr{padding:14px 18px;border-bottom:1px solid #e3e5ea;display:flex;align-items:center;justify-content:space-between}
#v4-popup .v4-hdr h2{margin:0;font-size:15px;font-weight:700;color:#1a1d23}
#v4-popup .v4-x{cursor:pointer;font-size:22px;color:#8a94a3;padding:2px 10px;border-radius:6px;line-height:1}
#v4-popup .v4-x:hover{background:#f1f2f5;color:#1a1d23}
#v4-popup .v4-search{padding:10px 18px;border-bottom:1px solid #e3e5ea}
#v4-popup .v4-search input{width:100%;padding:8px 12px;border:1px solid #e3e5ea;border-radius:8px;font-size:13px;background:#f6f7f9;color:#1a1d23}
#v4-popup .v4-search input:focus{outline:none;border-color:#6b3fd4;background:#fff}
#v4-popup .v4-cols{flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;overflow:hidden;min-height:0}
#v4-popup .v4-col{display:flex;flex-direction:column;border-right:1px solid #e3e5ea;min-height:0}
#v4-popup .v4-col:last-child{border-right:none}
#v4-popup .v4-col-hdr{padding:10px 14px 6px;font-size:11px;font-weight:700;color:#55606f;display:flex;justify-content:space-between;align-items:center;background:#f1f2f5;border-bottom:1px solid #e3e5ea}
#v4-popup .v4-col-hdr select{font-size:10px;border:1px solid #e3e5ea;border-radius:5px;padding:2px 4px;background:#fff;color:#55606f;cursor:pointer}
#v4-popup .v4-col-body{flex:1;overflow-y:auto;padding:4px 0}
#v4-popup .v4-row{padding:9px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:13px;border-left:3px solid transparent;color:#1a1d23}
#v4-popup .v4-row:hover{background:#f5f1ff}
#v4-popup .v4-row.on{background:#f5f1ff;border-left-color:#6b3fd4;font-weight:700;color:#6b3fd4}
#v4-popup .v4-row .v4-cnt{font-size:11px;color:#8a94a3;font-weight:500}
#v4-popup .v4-row.on .v4-cnt{color:#6b3fd4}
#v4-popup .v4-row.zero{opacity:.4}
#v4-popup .v4-ftr{border-top:1px solid #e3e5ea;padding:10px 18px;display:flex;align-items:center;gap:8px;background:#f1f2f5;flex-wrap:wrap;min-height:50px}
#v4-popup .v4-ftr .v4-lbl{font-size:11px;color:#8a94a3;font-weight:700;margin-right:4px}
#v4-popup .v4-pill{background:#6b3fd4;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;cursor:pointer;font-weight:700}
#v4-popup .v4-pill:after{content:" ×";opacity:.7}
#v4-popup .v4-sp{flex:1}
#v4-popup .v4-hit{font-size:12px;color:#6b3fd4;font-weight:700}
#v4-popup .v4-clr{font-size:11px;color:#8a94a3;cursor:pointer;text-decoration:underline;margin-right:8px}
#v4-popup .v4-apply{background:#6b3fd4;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer}
#v4-popup .v4-apply:hover{background:#5a2fc4}
@media (max-width:900px){#v4-popup{left:0;width:100vw}}
</style>`;
    document.head.insertAdjacentHTML('beforeend', css);
    const html = `
<div id="v4-bd" onclick="v4ClosePopup()"></div>
<div id="v4-popup" role="dialog" aria-modal="true">
  <div class="v4-hdr">
    <h2>🆕 4層タグで絞り込む</h2>
    <div class="v4-x" onclick="v4ClosePopup()">×</div>
  </div>
  <div class="v4-search"><input id="v4-q" placeholder="🔍 タグ名で検索..." oninput="v4Search(this.value)"></div>
  <div class="v4-cols">
    <div class="v4-col">
      <div class="v4-col-hdr"><span>🧭 T/B</span>
        <select onchange="v4SetSort('tb',this.value)"><option value="abc">ABC順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-tb"></div>
    </div>
    <div class="v4-col">
      <div class="v4-col-hdr"><span>📂 カテゴリ</span>
        <select onchange="v4SetSort('cat',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-cat"></div>
    </div>
    <div class="v4-col">
      <div class="v4-col-hdr"><span>📍 ポジション</span>
        <select onchange="v4SetSort('pos',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-pos"></div>
    </div>
  </div>
  <div class="v4-ftr">
    <span class="v4-lbl">選択中:</span>
    <div id="v4-pills" style="display:flex;gap:5px;flex-wrap:wrap"><span style="color:#8a94a3;font-size:11px">なし</span></div>
    <span class="v4-sp"></span>
    <span class="v4-clr" onclick="v4Clear()">クリア</span>
    <span class="v4-hit" id="v4-hit">0 件</span>
    <button class="v4-apply" onclick="v4ClosePopup()">適用</button>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── 状態 ──
  const _sort = { tb:'abc', cat:'abc', pos:'abc' };
  let _q = '';

  function _esc(s){return String(s==null?'':s).replace(/[&<>"'\\]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\':'\\\\'}[c]));}

  function _renderPopup() {
    if (!_ensureFilters()) return;
    const f = window.filters;

    // TB
    const TB_ICO = { 'トップ':'🔼', 'ボトム':'🔽', 'スタンディング':'⏫' };
    const tbList = (window.TB_VALUES || ['トップ','ボトム','スタンディング']).map(t => ({ name:t, cnt:_cnt('tbNew', t), icon:TB_ICO[t]||'', sel:f.tbNew.has(t) }));
    _fillCol('v4-col-tb', tbList, 'tb');

    // Category
    const catList = (window.CATEGORIES || []).map(c => ({ name:c.name, cnt:_cnt('cat', c.name), icon:'', sel:f.cat.has(c.name) }));
    _fillCol('v4-col-cat', catList, 'cat');

    // Position
    const posList = (window.POSITIONS || []).map(p => ({ name:p.ja, cnt:_cnt('posNew', p.ja), icon:'', sel:f.posNew.has(p.ja) }));
    _fillCol('v4-col-pos', posList, 'pos');

    // Selected pills
    const pills = document.getElementById('v4-pills');
    if (pills) {
      const all = [...[...f.tbNew].map(n=>['tb',n]), ...[...f.cat].map(n=>['cat',n]), ...[...f.posNew].map(n=>['pos',n])];
      if (!all.length) pills.innerHTML = '<span style="color:#8a94a3;font-size:11px">なし</span>';
      else pills.innerHTML = all.map(([k,n]) => `<span class="v4-pill" onclick="v4Toggle('${k}','${_esc(n)}')">${_esc(n)}</span>`).join('');
    }

    // Hit count
    const hit = document.getElementById('v4-hit');
    if (hit) hit.textContent = _totalHit() + ' 件';

    // Badge on sidebar button
    const badge = document.getElementById('fs-v4-btn-badge');
    const selCount = f.tbNew.size + f.cat.size + f.posNew.size;
    if (badge) {
      if (selCount) { badge.style.display = 'inline-block'; badge.textContent = selCount; }
      else badge.style.display = 'none';
    }
  }

  function _fillCol(hostId, list, key) {
    const host = document.getElementById(hostId);
    if (!host) return;
    let arr = list.slice();
    if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
    if (_sort[key] === 'abc') arr.sort((a,b) => a.name.localeCompare(b.name, 'ja'));
    else arr.sort((a,b) => b.cnt - a.cnt);
    if (!arr.length) { host.innerHTML = '<div style="padding:14px;color:#8a94a3;font-size:11px">該当なし</div>'; return; }
    host.innerHTML = arr.map(r =>
      `<div class="v4-row${r.sel?' on':''}${r.cnt===0&&!r.sel?' zero':''}" onclick="v4Toggle('${key}','${_esc(r.name)}')"><span>${r.icon}${_esc(r.name)}</span><span class="v4-cnt">${r.cnt}本</span></div>`
    ).join('');
  }

  // ── グローバル公開ハンドラ ──
  window.v4Toggle = function (key, name) {
    _ensureFilters();
    const map = { tb:'tbNew', cat:'cat', pos:'posNew' };
    const k = map[key]; if (!k) return;
    const s = window.filters[k];
    s.has(name) ? s.delete(name) : s.add(name);
    _renderPopup();
    window.AF?.();
  };
  window.v4Clear = function () {
    _ensureFilters();
    window.filters.tbNew.clear();
    window.filters.cat.clear();
    window.filters.posNew.clear();
    _renderPopup();
    window.AF?.();
  };
  window.v4SetSort = function (k, v) { _sort[k] = v; _renderPopup(); };
  window.v4Search  = function (v) { _q = (v || '').trim().toLowerCase(); _renderPopup(); };
  window.v4OpenPopup = openPopup;
  window.v4ClosePopup = closePopup;

  function openPopup() {
    _injectPopup();
    document.getElementById('v4-bd').classList.add('open');
    document.getElementById('v4-popup').classList.add('open');
    _renderPopup();
  }
  function closePopup() {
    const bd = document.getElementById('v4-bd'); if (bd) bd.classList.remove('open');
    const pp = document.getElementById('v4-popup'); if (pp) pp.classList.remove('open');
  }

  // ── AF ラップ (既存ロジック維持: 新キーで追加絞り込み) ──
  function _wrapAF() {
    if (window._v4AFPatched || !window.AF) return;
    const origAF = window.AF;
    window.AF = function () {
      origAF.apply(this, arguments);
      const f = window.filters || {};
      const hasTb = f.tbNew?.size, hasCat = f.cat?.size, hasPos = f.posNew?.size, hasTags = f.tags?.size;
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
        const rc = document.getElementById('rc'); if (rc) rc.textContent = filtered.length + ' 本 表示中';
        const rct = document.getElementById('rc-topbar'); if (rct) { rct.textContent = filtered.length + ' 件'; rct.style.display = 'inline'; }
        const fhn = document.getElementById('fov-hit-num'); if (fhn) fhn.textContent = filtered.length;
        const fhb = document.getElementById('fov-hit-badge'); if (fhb) fhb.textContent = filtered.length + ' 件';
      }
      _renderPopup();
    };
    window._v4AFPatched = true;
  }

  // ── 初期化 ──
  function init() {
    _injectButton();
    _ensureFilters();
    let tries = 0;
    const timer = setInterval(() => {
      if (window.AF) { _wrapAF(); clearInterval(timer); }
      if (++tries > 40) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

  window.renderSidebarV4 = _renderPopup;
})();
