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

  // ── 件数カウント (全レイヤーAND、自身含む) ──
  function _cnt(key, val) {
    const vs = window.videos || [];
    const f  = window.filters || {};
    return vs.filter(v => {
      if (v.archived) return false;
      if (f.tbNew?.size  && !(v.tb  || []).some(t => f.tbNew.has(t)))  return false;
      if (f.cat?.size    && !(v.cat || []).some(c => f.cat.has(c)))    return false;
      if (f.posNew?.size && !(v.pos || []).some(p => f.posNew.has(p))) return false;
      if (f.tags?.size   && !(v.tags || []).some(t => f.tags.has(t)))  return false;
      if (key === 'tbNew')  return (v.tb   || []).includes(val);
      if (key === 'cat')    return (v.cat  || []).includes(val);
      if (key === 'posNew') return (v.pos  || []).includes(val);
      if (key === 'tags')   return (v.tags || []).includes(val);
      return false;
    }).length;
  }

  // ── 全動画から #タグ一覧を集約 ──
  function _collectTags() {
    const set = new Set();
    (window.videos || []).forEach(v => {
      if (v.archived) return;
      (v.tags || []).forEach(t => { if (t) set.add(t); });
    });
    return [...set];
  }

  // ── 全レイヤーAND最終ヒット数 ──
  function _totalHit() {
    const vs = window.videos || [];
    const f  = window.filters || {};
    const hasTb = f.tbNew?.size, hasCat = f.cat?.size, hasPos = f.posNew?.size, hasTags = f.tags?.size;
    if (!hasTb && !hasCat && !hasPos && !hasTags) return vs.filter(v => !v.archived).length;
    return vs.filter(v => {
      if (v.archived) return false;
      if (hasTb   && !(v.tb   || []).some(t => f.tbNew.has(t)))  return false;
      if (hasCat  && !(v.cat  || []).some(c => f.cat.has(c)))    return false;
      if (hasPos  && !(v.pos  || []).some(p => f.posNew.has(p))) return false;
      if (hasTags && !(v.tags || []).some(t => f.tags.has(t)))   return false;
      return true;
    }).length;
  }

  // ── ポップアップ DOM 注入 (アプリテーマ準拠) ──
  function _injectPopup() {
    if (document.getElementById('v4-popup')) return;
    const css = `
<style id="v4-popup-css">
#v4-bd{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:100000}
#v4-bd.open{display:block}
#v4-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(960px,calc(100vw - 40px));height:min(640px,calc(100vh - 60px));background:var(--surface);color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:none;flex-direction:column;z-index:100001}
#v4-popup.open{display:flex}
#v4-popup .v4-hdr{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--surface2)}
#v4-popup .v4-hdr h2{margin:0;font-size:13px;font-weight:700;color:var(--text)}
#v4-popup .v4-x{cursor:pointer;font-size:16px;color:var(--text3);padding:2px 6px;border-radius:4px;line-height:1}
#v4-popup .v4-x:hover{background:var(--border);color:var(--text)}
@media (max-width:560px){#v4-popup{width:calc(100vw - 16px);height:calc(100vh - 16px)}}
/* ── 共有ウィジェットスタイル (popup + inline) ── */
.v4-search{padding:8px 0}
.v4-search input{width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface2);color:var(--text);font-family:inherit;box-sizing:border-box}
.v4-search input:focus{outline:none;border-color:var(--accent)}
#v4-popup .v4-search{padding:8px 14px;border-bottom:1px solid var(--border)}
.v4-tabs{display:flex;gap:3px;overflow-x:auto;padding:0;background:transparent}
.v4-tabs::-webkit-scrollbar{display:none}
#v4-popup .v4-tabs{padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface2)}
.v4-tab{flex:1;min-width:64px;text-align:center;padding:6px 6px;border-radius:6px;font-size:11px;font-weight:700;color:var(--text2);cursor:pointer;background:var(--surface);border:1px solid var(--border);white-space:nowrap;font-family:inherit;box-sizing:border-box}
.v4-tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.v4-tab .v4-bdg{display:inline-block;background:rgba(255,255,255,.28);color:#fff;font-size:9px;padding:0 5px;border-radius:6px;margin-left:4px;font-weight:700}
.v4-tab:not(.on) .v4-bdg{background:var(--accent);color:#fff}
.v4-cols{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;min-height:0;border:1px solid var(--border);border-radius:8px;background:var(--surface);margin-top:6px}
.v4-cols::-webkit-scrollbar{display:none}
#v4-popup .v4-cols{flex:1;border:none;border-radius:0;margin-top:0}
.v4-col{flex:0 0 100%;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border);scroll-snap-align:start}
.v4-col:last-child{border-right:none}
@media (min-width:560px){.v4-col{flex:0 0 50%}}
@media (min-width:820px){.v4-col{flex:0 0 33.333%}}
@media (min-width:1080px){.v4-col{flex:0 0 25%}}
.v4-col-hdr{padding:8px 12px 6px;font-size:10px;font-weight:700;color:var(--text3);display:flex;justify-content:space-between;align-items:center;background:var(--surface2);border-bottom:1px solid var(--border);letter-spacing:.3px;flex-shrink:0}
.v4-col-hdr select{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--surface);color:var(--text2);cursor:pointer;font-family:inherit}
.v4-col-body{flex:1;overflow-y:auto;padding:2px 0;min-height:0}
.v4-row{padding:7px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:12px;border-left:3px solid transparent;color:var(--text)}
.v4-row:hover{background:var(--surface2)}
.v4-row.on{background:rgba(140,80,255,.14);border-left-color:var(--accent);font-weight:700;color:var(--accent)}
.v4-row .v4-cnt{font-size:11px;color:var(--text3);font-weight:500}
.v4-row.on .v4-cnt{color:var(--accent)}
.v4-row.zero{opacity:.4}
.v4-ftr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:34px;padding:8px 0 0}
#v4-popup .v4-ftr{border-top:1px solid var(--border);padding:8px 14px;background:var(--surface2);min-height:44px}
.v4-ftr .v4-lbl{font-size:10px;color:var(--text3);font-weight:700;margin-right:4px}
.v4-pill{background:var(--accent);color:#fff;padding:2px 9px;border-radius:10px;font-size:10px;cursor:pointer;font-weight:700}
.v4-pill:after{content:" ×";opacity:.7}
.v4-sp{flex:1}
.v4-hit{font-size:12px;color:var(--accent);font-weight:700}
.v4-clr{font-size:10px;color:var(--text3);cursor:pointer;text-decoration:underline;margin-right:6px}
.v4-apply{background:var(--accent);color:#fff;border:none;padding:6px 16px;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;font-family:inherit}
.v4-apply:hover{filter:brightness(1.1)}
</style>`;
    document.head.insertAdjacentHTML('beforeend', css);
    const html = `
<div id="v4-bd" onclick="v4ClosePopup()"></div>
<div id="v4-popup" role="dialog" aria-modal="true">
  <div class="v4-hdr">
    <h2>タグで絞り込む</h2>
    <div class="v4-x" onclick="v4ClosePopup()">✕</div>
  </div>
  <div class="v4-search"><input id="v4-q" placeholder="🔍 タグ名で検索..." oninput="v4Search(this.value)"></div>
  <div class="v4-tabs" id="v4-tabs"></div>
  <div class="v4-cols" id="v4-cols-track">
    <div class="v4-col">
      <div class="v4-col-hdr"><span>トップ/ボトム/スタンディング</span>
        <select onchange="v4SetSort('tb',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-tb"></div>
    </div>
    <div class="v4-col">
      <div class="v4-col-hdr"><span>カテゴリ</span>
        <select onchange="v4SetSort('cat',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-cat"></div>
    </div>
    <div class="v4-col">
      <div class="v4-col-hdr"><span>ポジション</span>
        <select onchange="v4SetSort('pos',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-pos"></div>
    </div>
    <div class="v4-col">
      <div class="v4-col-hdr"><span>#タグ</span>
        <select onchange="v4SetSort('tags',this.value)"><option value="abc">あいうえ順</option><option value="cnt">件数順</option></select>
      </div>
      <div class="v4-col-body" id="v4-col-tags"></div>
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
  const _sort = { tb:'abc', cat:'abc', pos:'abc', tags:'cnt' };
  let _q = '';
  let _activeTab = 0;
  const _COLS = [
    { key:'tb',   label:'トップ/ボトム/スタンディング', short:'T/B' },
    { key:'cat',  label:'カテゴリ',        short:'カテゴリ' },
    { key:'pos',  label:'ポジション',      short:'ポジション' },
    { key:'tags', label:'#タグ',          short:'#タグ' }
  ];

  function _esc(s){return String(s==null?'':s).replace(/[&<>"'\\]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\':'\\\\'}[c]));}

  // ── 共通レンダラ (popup と inline 両方で使用) ──
  function _renderInto(prefix) {
    if (!_ensureFilters()) return;
    const f = window.filters;
    const tabsEl  = document.getElementById(prefix + 'tabs');
    const trackEl = document.getElementById(prefix + 'cols-track');
    const pillsEl = document.getElementById(prefix + 'pills');
    const hitEl   = document.getElementById(prefix + 'hit');
    if (!tabsEl && !trackEl) return;

    // Tabs
    if (tabsEl) {
      const selSizes = { tb:f.tbNew.size, cat:f.cat.size, pos:f.posNew.size, tags:f.tags.size };
      tabsEl.innerHTML = _COLS.map((c,i) => {
        const n = selSizes[c.key];
        return `<div class="v4-tab${i===_activeTab?' on':''}" data-i="${i}">${c.short}${n?`<span class="v4-bdg">${n}</span>`:''}</div>`;
      }).join('');
      tabsEl.querySelectorAll('.v4-tab').forEach(t => t.onclick = () => {
        _activeTab = +t.dataset.i;
        const col = trackEl?.children[_activeTab];
        if (col) col.scrollIntoView({ behavior:'smooth', inline:'start', block:'nearest' });
        _renderAll();
      });
    }

    // Carousel cols
    if (trackEl) {
      const lists = {
        tb:   (window.TB_VALUES || ['トップ','ボトム','スタンディング']).map(t => ({ name:t,   cnt:_cnt('tbNew', t),   sel:f.tbNew.has(t) })),
        cat:  (window.CATEGORIES || []).map(c => ({ name:c.name, cnt:_cnt('cat', c.name), sel:f.cat.has(c.name) })),
        pos:  (window.POSITIONS  || []).map(p => ({ name:p.ja,   cnt:_cnt('posNew', p.ja), sel:f.posNew.has(p.ja) })),
        tags: _collectTags().map(t => ({ name:t, cnt:_cnt('tags', t), sel:f.tags.has(t) }))
      };
      trackEl.innerHTML = _COLS.map(c => {
        let arr = lists[c.key].slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        if (_sort[c.key] === 'abc') arr.sort((a,b) => a.name.localeCompare(b.name,'ja'));
        else arr.sort((a,b) => b.cnt - a.cnt);
        const rows = arr.length ? arr.map(r =>
          `<div class="v4-row${r.sel?' on':''}${r.cnt===0&&!r.sel?' zero':''}" data-k="${c.key}" data-n="${_esc(r.name)}"><span>${_esc(r.name)}</span><span class="v4-cnt">${r.cnt}本</span></div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="v4-col" data-k="${c.key}">
          <div class="v4-col-hdr"><span>${c.label}</span>
            <select data-sort="${c.key}">
              <option value="abc"${_sort[c.key]==='abc'?' selected':''}>あいうえ順</option>
              <option value="cnt"${_sort[c.key]==='cnt'?' selected':''}>件数順</option>
            </select>
          </div>
          <div class="v4-col-body">${rows}</div>
        </div>`;
      }).join('');
      trackEl.querySelectorAll('.v4-row').forEach(r => r.onclick = () => {
        window.v4Toggle(r.dataset.k, r.dataset.n);
      });
      trackEl.querySelectorAll('select[data-sort]').forEach(s => s.onchange = () => {
        _sort[s.dataset.sort] = s.value; _renderAll();
      });
    }

    // Pills
    if (pillsEl) {
      const all = [...[...f.tbNew].map(n=>['tb',n]), ...[...f.cat].map(n=>['cat',n]), ...[...f.posNew].map(n=>['pos',n]), ...[...f.tags].map(n=>['tags',n])];
      if (!all.length) pillsEl.innerHTML = '<span style="color:var(--text3);font-size:11px">なし</span>';
      else pillsEl.innerHTML = all.map(([k,n]) => `<span class="v4-pill" onclick="v4Toggle('${k}','${_esc(n)}')">${_esc(n)}</span>`).join('');
    }

    if (hitEl) hitEl.textContent = _totalHit() + ' 件';
  }

  function _renderAll() {
    _renderInto('v4-');     // popup
    _renderInto('v4i-');    // inline
    // Badge (sidebar + mobile filter overlay)
    if (!_ensureFilters()) return;
    const f = window.filters;
    const selCount = f.tbNew.size + f.cat.size + f.posNew.size + f.tags.size;
    ['fs-v4-btn-badge','fov-v4-badge'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      if (selCount) { b.style.display = 'inline-block'; b.textContent = selCount; }
      else b.style.display = 'none';
    });
  }
  const _renderPopup = _renderAll; // 後方互換


  // ── グローバル公開ハンドラ ──
  window.v4Toggle = function (key, name) {
    _ensureFilters();
    const map = { tb:'tbNew', cat:'cat', pos:'posNew', tags:'tags' };
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
    window.filters.tags.clear();
    _renderPopup();
    window.AF?.();
  };
  window.v4SetSort = function (k, v) { _sort[k] = v; _renderAll(); };
  window.v4Search  = function (v) { _q = (v || '').trim().toLowerCase(); _renderAll(); };
  window.v4OpenPopup = openPopup;
  window.v4ClosePopup = closePopup;

  // ── インライン展開 (フィルターオーバーレイ内) ──
  window.v4MountInline = function (hostId) {
    const host = document.getElementById(hostId);
    if (!host) return;
    if (host._v4Mounted) { _renderAll(); return; }
    host._v4Mounted = true;
    host.innerHTML = `
      <div class="v4-inline">
        <div class="v4-search"><input id="v4i-q" placeholder="🔍 タグ名で検索..." oninput="v4Search(this.value)"></div>
        <div class="v4-tabs" id="v4i-tabs"></div>
        <div class="v4-cols" id="v4i-cols-track" style="height:280px"></div>
        <div class="v4-ftr" style="border:none;background:transparent;padding:8px 0 0">
          <span class="v4-lbl">選択中:</span>
          <div id="v4i-pills" style="display:flex;gap:5px;flex-wrap:wrap"></div>
          <span class="v4-sp"></span>
          <span class="v4-clr" onclick="v4Clear()">クリア</span>
          <span class="v4-hit" id="v4i-hit">0 件</span>
        </div>
      </div>`;
    _renderAll();
    // スクロール追従
    const track = document.getElementById('v4i-cols-track');
    if (track && !track._v4Bound) {
      track._v4Bound = true;
      let t;
      track.addEventListener('scroll', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const cw = track.children[0]?.offsetWidth || 1;
          const i = Math.round(track.scrollLeft / cw);
          if (i !== _activeTab && i >= 0 && i < _COLS.length) {
            _activeTab = i;
            document.querySelectorAll('#v4i-tabs .v4-tab, #v4-tabs .v4-tab').forEach(el => {
              el.classList.toggle('on', +el.dataset.i === _activeTab);
            });
          }
        }, 80);
      });
    }
  };

  // 折りたたみトグル
  window.v4ToggleInline = function (btn) {
    const wrap = document.getElementById('fov-tag-wrap');
    if (!wrap) return;
    const body = document.getElementById('fov-tag-body');
    const arr  = document.getElementById('fov-tag-arr');
    const open = body.style.display !== 'none';
    if (open) {
      body.style.display = 'none';
      if (arr) arr.textContent = '▶';
    } else {
      body.style.display = 'block';
      if (arr) arr.textContent = '▼';
      window.v4MountInline('fov-tag-body');
      // 画面切れ防止: 展開後にスクロール
      setTimeout(() => {
        wrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }, 50);
    }
  };

  // スクロール追従: 横スクロール停止位置に応じてアクティブタブ更新
  function _bindScrollSync() {
    const track = document.getElementById('v4-cols-track');
    if (!track || track._v4Bound) return;
    track._v4Bound = true;
    let t;
    track.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const cw = track.children[0]?.offsetWidth || 1;
        const i = Math.round(track.scrollLeft / cw);
        if (i !== _activeTab && i >= 0 && i < _COLS.length) {
          _activeTab = i;
          document.querySelectorAll('#v4-tabs .v4-tab').forEach((t,idx) => t.classList.toggle('on', idx === _activeTab));
        }
      }, 80);
    });
  }

  function openPopup() {
    _injectPopup();
    document.getElementById('v4-bd').classList.add('open');
    document.getElementById('v4-popup').classList.add('open');
    _renderPopup();
    _bindScrollSync();
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
