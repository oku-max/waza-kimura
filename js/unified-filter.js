// ═══ WAZA KIMURA — 統合フィルターパネル (案E改) ═══
// state / src / tag の3グループを1つのポップアップに統合
(function () {
  'use strict';

  const MAIN = [
    { k: 'state', label: '習得' },
    { k: 'src',   label: 'プレイリスト' },
    { k: 'tag',   label: 'タグ' },
    { k: 'video', label: 'タイトル' }
  ];

  let _tab = 'state';
  let _q = '';
  const _queries = { state: '', src: '', tag: '', video: '' }; // タブごとに検索ワードを記憶
  let _ctx = 'lib'; // 'lib' or 'org'
  const _sort = { ch:'cnt', pl:'cnt', tb:'abc', cat:'abc', pos:'abc', tags:'grp' };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ── ファセット用: excludeKey 以外の全フィルターを適用した動画 ──
  // _ctx='org' 時は orgFilters / orgXxxOnly を参照する
  function _ctxVideos(excludeKey) {
    const isOrg = _ctx === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const fav  = isOrg ? window.orgFavOnly     : window.favOnly;
    const unw  = isOrg ? window.orgUnwOnly     : window.unwOnly;
    const wat  = isOrg ? window.orgWatchedOnly : window.watchedOnly;
    const bm   = isOrg ? window.orgBmOnly      : window.bmOnly;
    const memo = isOrg ? window.orgMemoOnly    : window.memoOnly;
    const img  = isOrg ? window.orgImgOnly     : window.imgOnly;
    const next = isOrg ? window.orgNextOnly   : window.nextOnly;
    // tag filter keys: lib uses tbNew/cat/posNew/tags, org uses tb/action/position/tags
    const tkTb   = isOrg ? 'tb'       : 'tbNew';
    const tkCat  = isOrg ? 'action'   : 'cat';
    const tkPos  = isOrg ? 'position' : 'posNew';
    const tkTags = isOrg ? 'tags'     : 'tags';
    return (window.videos || []).filter(v => {
      if (v.archived) return false;
      if (excludeKey !== 'fav'  && fav  && !v.fav) return false;
      if (excludeKey !== 'next'&& next && !v.next) return false;
      if (excludeKey !== 'unw' && unw && v.watched) return false;
      if (excludeKey !== 'wat' && wat && !v.watched) return false;
      if (excludeKey !== 'bm'  && bm  && !(v.bm || (v.bookmarks && v.bookmarks.length))) return false;
      if (excludeKey !== 'memo'&& memo&& !(v.memo && String(v.memo).trim())) return false;
      if (excludeKey !== 'img' && img && !(v.img || (v.images && v.images.length) || (v.snapshots && v.snapshots.length))) return false;
      if (excludeKey !== 'platform' && f.platform?.size && !f.platform.has(v.pt || v.src || 'youtube')) return false;
      if (excludeKey !== 'channel'  && f.channel?.size  && !f.channel.has(v.channel || v.ch))           return false;
      if (excludeKey !== 'playlist' && f.playlist?.size && !f.playlist.has(v.pl))                       return false;
      if (excludeKey !== 'status'   && f.status?.size   && !f.status.has(v.status))                     return false;
      if (excludeKey !== 'prio'     && f.prio?.size     && !f.prio.has(v.prio))                         return false;
      if (excludeKey !== 'tb'   && f[tkTb]?.size   && !(v.tb  ||[]).some(t => f[tkTb].has(t)))         return false;
      if (excludeKey !== 'cat'  && f[tkCat]?.size  && !(v.cat||[]).some(c => f[tkCat].has(c))) return false;
      if (excludeKey !== 'pos'  && f[tkPos]?.size  && !(v.pos ||[]).some(p => f[tkPos].has(p)))        return false;
      if (excludeKey !== 'tags' && f[tkTags]?.size && !(v.tags||[]).some(t => f[tkTags].has(t))) return false;
      const prRank = isOrg ? window.orgPrRank : window.prRank;
      const prDate = isOrg ? window.orgPrDate : window.prDate;
      if (excludeKey !== 'prRank' && prRank != null && window.vpCntRank) {
        if (String(window.vpCntRank(v.practice).lv) !== String(prRank)) return false;
      }
      if (excludeKey !== 'prDate' && prDate) {
        const lp = v.lastPracticed || 0;
        const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
        if (prDate === 'week'    && !(lp && days <= 7))   return false;
        if (prDate === 'month'   && !(lp && days <= 30))  return false;
        if (prDate === 'quarter' && !(lp && days <= 90))  return false;
        if (prDate === 'stale'   && !(lp && days > 90))   return false;
        if (prDate === 'never'   && lp)                   return false;
      }
      return true;
    });
  }

  function _collectTags() {
    const s = new Set();
    (window.videos || []).forEach(v => (v.tags || []).forEach(t => t && s.add(t)));
    return [...s].sort((a,b) => a.localeCompare(b,'ja'));
  }

  // ── DOM 注入 ──
  function _inject() {
    if (document.getElementById('uni-popup')) return;
    const css = `<style id="uni-css">
#uni-bd{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:100000}
#uni-bd.open{display:block}
#uni-popup{position:fixed;inset:32px;max-width:1080px;max-height:600px;margin:auto;background:var(--surface);color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:none;flex-direction:column;z-index:100001}
#uni-popup.open{display:flex}
#uni-popup .uni-topbar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-bottom:1px solid var(--border);flex-shrink:0}
#uni-popup .uni-tabs{display:flex;gap:3px;flex:1;min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch}
#uni-popup .uni-tab{padding:5px 10px;font-size:11px;font-weight:700;color:var(--text2);cursor:pointer;border-radius:6px;background:var(--surface);border:1px solid var(--border);white-space:nowrap;font-family:inherit}
#uni-popup .uni-tab.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
#uni-popup .uni-tab .uni-bdg{display:inline-block;background:var(--accent);color:var(--on-accent);font-size:9px;padding:0 5px;border-radius:6px;margin-left:4px;font-weight:700}
#uni-popup .uni-tab.on .uni-bdg{background:rgba(255,255,255,.3);color:#fff}
#uni-popup .uni-x{color:var(--text3);cursor:pointer;font-size:18px;padding:0 8px;line-height:1;flex-shrink:0}
#uni-popup .uni-x:hover{color:var(--text)}
#uni-popup .uni-searchbar{padding:6px 10px;background:var(--surface2);border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:6px}
#uni-popup .uni-searchbar input{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text);font-family:inherit;box-sizing:border-box}
#uni-popup .uni-cols{flex:1;display:flex;overflow-x:auto;overflow-y:hidden;min-height:0;-webkit-overflow-scrolling:touch}
#uni-popup .uni-col{flex:1 0 160px;display:flex;flex-direction:column;border-right:1px solid var(--border);min-height:0;overflow:hidden}
#uni-popup .uni-col:last-child{border-right:none}
#uni-popup .uni-col.narrow{flex:0 0 auto;width:clamp(100px,12vw,140px)}
#uni-popup .uni-col.wide{flex:1.5 0 240px}
#uni-popup .uni-col-hdr{padding:8px 12px 6px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;letter-spacing:.3px;flex-shrink:0}
#uni-popup .uni-col-hdr select{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--surface);color:var(--text2);font-family:inherit}
#uni-popup .uni-col-body{flex:1;overflow-y:auto;padding:2px 0;min-height:0}
#uni-popup .uni-row{padding:7px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:12px;border-left:3px solid transparent;color:var(--text)}
#uni-popup .uni-row:hover{background:var(--surface2)}
#uni-popup .uni-row.on{background:rgba(107,63,212,.14);border-left-color:var(--accent);color:var(--accent);font-weight:700}
#uni-popup .uni-row .uni-cnt{min-width:22px;height:20px;padding:0 8px;border-radius:10px;background:rgba(107,63,212,.1);color:var(--accent);font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
#uni-popup .uni-row.on .uni-cnt{background:var(--accent);color:var(--on-accent)}
#uni-popup .uni-ftr{border-top:1px solid var(--border);padding:8px 14px;background:var(--surface2);display:flex;gap:8px;align-items:center;min-height:44px;flex-wrap:wrap;flex-shrink:0}
#uni-popup .uni-lbl{font-size:10px;color:var(--text3);font-weight:700;margin-right:4px}
#uni-popup .uni-pill{background:var(--accent);color:var(--on-accent);padding:2px 9px;border-radius:10px;font-size:10px;cursor:pointer;font-weight:700}
#uni-popup .uni-pill:after{content:" ×";opacity:.7}
#uni-popup .uni-sp{flex:1}
#uni-popup .uni-hit{font-size:12px;color:var(--accent);font-weight:700}
#uni-popup .uni-clr{font-size:11px;font-weight:700;color:#dc2626;cursor:pointer;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:6px;padding:4px 12px;margin-right:4px;font-family:inherit}
#uni-popup .uni-clr:hover{background:#fee2e2;border-color:#f87171}
#uni-popup .uni-apply{background:var(--accent);color:var(--on-accent);border:none;padding:6px 16px;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;font-family:inherit}
#uni-popup .uni-apply:hover{filter:brightness(1.1)}
/* 保存した検索条件 */
#uni-popup .uni-ss-item{padding:8px 12px;cursor:pointer;border-left:3px solid transparent;font-size:12px;display:flex;align-items:center;gap:8px;position:relative}
#uni-popup .uni-ss-item:hover{background:var(--surface2)}
#uni-popup .uni-ss-name{flex:1;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#uni-popup .uni-ss-cnt{font-size:10px;color:var(--text3);flex-shrink:0}
#uni-popup .uni-ss-dots{width:26px;height:26px;border-radius:6px;border:none;background:transparent;color:var(--text3);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;font-weight:700}
#uni-popup .uni-ss-dots:hover{background:var(--surface3);color:var(--text)}
#uni-popup .uni-ss-pop{display:none;position:absolute;right:8px;top:100%;z-index:60;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:160px;padding:6px 0;font-size:12px}
#uni-popup .uni-ss-pop.open{display:block}
#uni-popup .uni-ss-reorder{display:flex;gap:4px;padding:6px 14px}
#uni-popup .uni-ss-reorder button{flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:11px;cursor:pointer;font-weight:600;color:var(--text2);font-family:inherit}
#uni-popup .uni-ss-reorder button:hover{background:var(--surface2);border-color:var(--accent);color:var(--accent)}
#uni-popup .uni-ss-div{height:1px;background:var(--border);margin:4px 0}
#uni-popup .uni-ss-act{padding:7px 14px;display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--text);white-space:nowrap}
#uni-popup .uni-ss-act:hover{background:var(--surface2)}
#uni-popup .uni-ss-icon{font-size:12px;width:16px;text-align:center;flex-shrink:0;color:var(--text2)}
#uni-popup .uni-ss-del{color:#c44}
#uni-popup .uni-ss-del .uni-ss-icon{color:#c44}
#uni-popup .uni-ss-add{font-size:10px;color:var(--accent);cursor:pointer;font-weight:700}
/* 動画タブ */
#uni-popup .uni-tab-video{color:#16a34a;border-color:#a7f3d0;background:#f0fdf4}
#uni-popup .uni-tab-video.on{background:#16a34a;color:#fff;border-color:#16a34a}
#uni-popup .uni-vid-row{padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:center}
#uni-popup .uni-vid-row:hover{background:var(--surface2)}
#uni-popup .uni-vid-thumb{width:56px;height:36px;background:var(--surface3);border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(0,0,0,.25)}
#uni-popup .uni-vid-info{flex:1;min-width:0}
#uni-popup .uni-vid-title{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#uni-popup .uni-vid-meta{font-size:10px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 最近みた動画 */
#uni-popup .uni-rc-item{padding:6px 12px;cursor:pointer;border-left:3px solid transparent;font-size:11px;display:flex;align-items:center;gap:8px}
#uni-popup .uni-rc-item:hover{background:var(--surface2)}
#uni-popup .uni-rc-rank{font-size:10px;color:var(--text3);font-weight:700;width:18px;text-align:right;flex-shrink:0}
#uni-popup .uni-rc-thumb{width:48px;min-width:48px;height:32px;border-radius:4px;background:var(--surface3);flex-shrink:0;overflow:hidden;position:relative}
#uni-popup .uni-rc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
#uni-popup .uni-rc-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:12px;color:rgba(255,255,255,.9);text-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none}
#uni-popup .uni-rc-info{flex:1;min-width:0}
#uni-popup .uni-rc-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
#uni-popup .uni-rc-meta{font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 検索条件保存バー */
#uni-popup .uni-save-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid var(--border);background:var(--surface2);flex-shrink:0;flex-wrap:wrap}
#uni-popup .uni-save-lbl{font-size:11px;color:var(--text3);white-space:nowrap;flex-shrink:0}
#uni-popup .uni-save-input{flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;font-family:inherit;outline:none;color:var(--text)}
#uni-popup .uni-save-input::placeholder{color:var(--text3)}
#uni-popup .uni-save-input:focus{border-color:var(--accent)}
#uni-popup .uni-save-btn{flex-shrink:0;background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
#uni-popup .uni-save-btn:hover{filter:brightness(1.1)}
@media(max-width:480px){#uni-popup .uni-save-lbl{width:100%}}
/* uni-q フォーカス中（キーボード表示時）は保存バーを非表示 */
#uni-popup.uni-q-focus .uni-save-bar{display:none}
/* スクロールバー常時表示 — style.css の ::-webkit-scrollbar{display:none} を上書き */
#uni-popup .uni-col-body::-webkit-scrollbar{display:block;width:7px}
#uni-popup .uni-col-body::-webkit-scrollbar-track{background:#dddde5}
#uni-popup .uni-col-body::-webkit-scrollbar-thumb{background:#9090a8;border-radius:4px}
#uni-popup .uni-col-body::-webkit-scrollbar-thumb:hover{background:#6060a0}
#uni-popup .uni-cols::-webkit-scrollbar{display:block;height:7px}
#uni-popup .uni-cols::-webkit-scrollbar-track{background:#dddde5}
#uni-popup .uni-cols::-webkit-scrollbar-thumb{background:#9090a8;border-radius:4px}
#uni-popup .uni-cols::-webkit-scrollbar-thumb:hover{background:#6060a0}
#uni-popup .uni-col-body{scrollbar-width:thin;scrollbar-color:#9090a8 #dddde5}
#uni-popup .uni-cols{scrollbar-width:thin;scrollbar-color:#9090a8 #dddde5}
</style>`;
    document.head.insertAdjacentHTML('beforeend', css);
    // uni-q フォーカス時にクラスを付与→保存バーを非表示（キーボード出現時のレイアウト圧迫を防ぐ）
    document.addEventListener('focusin',  e => { if (e.target?.id === 'uni-q') document.getElementById('uni-popup')?.classList.add('uni-q-focus'); });
    document.addEventListener('focusout', e => { if (e.target?.id === 'uni-q') document.getElementById('uni-popup')?.classList.remove('uni-q-focus'); });
    document.body.insertAdjacentHTML('beforeend', `
<div id="uni-bd" onclick="uniClose()"></div>
<div id="uni-popup" role="dialog" aria-modal="true">
  <div class="uni-topbar">
    <div class="uni-tabs" id="uni-tabs"></div>
  </div>
  <div class="uni-searchbar"><input id="uni-q" placeholder="🔍 検索..." oninput="uniSearch(this.value)"><div class="uni-x" onclick="uniClose()">✕</div></div>
  <div id="uni-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0"></div>
  <div class="uni-ftr">
    <span class="uni-lbl">選択中:</span>
    <div id="uni-pills" style="display:flex;gap:5px;flex-wrap:wrap"></div>
    <span class="uni-sp"></span>
    <button class="uni-clr" onclick="uniClearAll()">リセット</button>
    <span class="uni-hit" id="uni-hit">0 件</span>
    <button class="uni-apply" onclick="uniClose()">適用</button>
  </div>
  <div class="uni-save-bar">
    <span class="uni-save-lbl">この条件を保存：</span>
    <input id="uni-save-name" class="uni-save-input" placeholder="リスト名を入力…"
      onkeydown="if(event.key==='Enter')uniSaveFromBar()">
    <button class="uni-save-btn" onclick="uniSaveFromBar()">💾 保存</button>
  </div>
</div>`);
  }

  // ── 列HTMLビルダー ──
  function _colHtml(title, listKey, items, opts) {
    opts = opts || {};
    let arr = items.slice();
    if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
    // ゼロ件は非表示。選択中は残す
    arr = arr.filter(r => r.sel || r.cnt > 0);
    const sortMode = (opts.sortable !== false) ? (_sort[listKey] || 'abc') : null;

    const _mkRow = r =>
      `<div class="uni-row${r.sel ? ' on' : ''}" onclick="uniToggle('${opts.filterKey}','${_esc(r.name).replace(/'/g,'&#39;')}')">` +
      `<span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span></div>`;

    let rows;
    if (sortMode === 'grp') {
      // グループ別表示 (案B)
      const _groups = window.getTagGroups ? window.getTagGroups() : [];
      const _inGrp  = new Set(_groups.flatMap(g => g.techNames || []));
      const parts   = [];
      _groups.forEach(g => {
        const members = arr.filter(r => (g.techNames || []).includes(r.name));
        if (!members.length) return;
        parts.push(`<div class="tag-grp-hdr">${_esc(g.name)}</div>`);
        members.forEach(r => parts.push(_mkRow(r)));
      });
      const unc = arr.filter(r => !_inGrp.has(r.name));
      if (unc.length) {
        parts.push(`<div class="tag-grp-hdr" style="font-style:italic">${_esc('未グループ')}</div>`);
        unc.forEach(r => parts.push(_mkRow(r)));
      }
      rows = parts.length ? parts.join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
    } else {
      if (sortMode === 'abc') arr.sort((a,b) => a.name.localeCompare(b.name,'ja'));
      else if (sortMode === 'cnt') arr.sort((a,b) => b.cnt - a.cnt);
      rows = arr.length ? arr.map(_mkRow).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
    }

    const sortSel = opts.sortable === false ? '' :
      `<select onchange="uniSetSort('${listKey}',this.value)">` +
      (listKey === 'tags' ? `<option value="grp"${sortMode==='grp'?' selected':''}>グループ別</option>` : '') +
      `<option value="abc"${sortMode==='abc'?' selected':''}>名前順</option>` +
      `<option value="cnt"${sortMode==='cnt'?' selected':''}>件数順</option>` +
      `</select>`;
    return `<div class="uni-col${opts.narrow ? ' narrow' : ''}">
      <div class="uni-col-hdr"><span>${title}</span>${sortSel}</div>
      <div class="uni-col-body">${rows}</div>
    </div>`;
  }

  // ── レンダリング ──
  function _badges(ctx) {
    const c = ctx || _ctx;
    const isOrg = c === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const stateN = ((isOrg ? window.orgFavOnly : window.favOnly) ? 1 : 0)
      + ((isOrg ? window.orgNextOnly : window.nextOnly) ? 1 : 0)
      + ((isOrg ? window.orgBmOnly : window.bmOnly) ? 1 : 0)
      + ((isOrg ? window.orgMemoOnly : window.memoOnly) ? 1 : 0)
      + ((isOrg ? window.orgImgOnly : window.imgOnly) ? 1 : 0)
      + ((isOrg ? window.orgPrRank : window.prRank) != null ? 1 : 0)
      + ((isOrg ? window.orgPrDate : window.prDate) ? 1 : 0);
    const srcN = (f.platform?.size || 0) + (f.channel?.size || 0) + (f.playlist?.size || 0);
    const tkTb = isOrg ? 'tb' : 'tbNew', tkCat = isOrg ? 'action' : 'cat', tkPos = isOrg ? 'position' : 'posNew', tkTags = isOrg ? 'tags' : 'tags';
    const tagN = (f[tkTb]?.size || 0) + (f[tkCat]?.size || 0) + (f[tkPos]?.size || 0) + (f[tkTags]?.size || 0);
    return { state: stateN, src: srcN, tag: tagN };
  }

  function _render() {
    const isOrg = _ctx === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const tabsEl = document.getElementById('uni-tabs');
    const bd = _badges();
    const _tsTabVis = key => { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; };
    const _tagTabVisible = _tsTabVis('tb') || _tsTabVis('cat') || _tsTabVis('pos') || _tsTabVis('tags');
    const _visibleMain = MAIN.filter(m => m.k !== 'tag' || _tagTabVisible);
    tabsEl.innerHTML = _visibleMain.map(m =>
      `<div class="uni-tab${_tab===m.k?' on':''}" onclick="uniSetTab('${m.k}')">${m.label}${bd[m.k]?`<span class="uni-bdg">${bd[m.k]}</span>`:''}</div>`
    ).join('');

    const content = document.getElementById('uni-content');
    // スクロール位置を保存（content.innerHTML置換でリセットされるのを防ぐ）
    const _savedColScrolls = [...content.querySelectorAll('.uni-col-body')].map(el => el.scrollTop);
    const _restoreColScrolls = () => {
      content.querySelectorAll('.uni-col-body').forEach((el, i) => {
        if (_savedColScrolls[i]) el.scrollTop = _savedColScrolls[i];
      });
    };

    if (_tab === 'state') {
      // ══ 1列目: マーク + 進捗ランク + 最終カウント日 (統合) ══
      const markItems = [
        { name:'★ Fav',       cnt:_ctxVideos('fav').filter(v=>v.fav).length,                                           sel:!!(isOrg ? window.orgFavOnly : window.favOnly),  key:'@fav' },
        { name:'▶ Next',      cnt:_ctxVideos('next').filter(v=>v.next).length,                                         sel:!!(isOrg ? window.orgNextOnly : window.nextOnly), key:'@next'},
        { name:'📌 ブックマーク', cnt:_ctxVideos('bm').filter(v=>v.bm || (v.bookmarks && v.bookmarks.length)).length,    sel:!!(isOrg ? window.orgBmOnly : window.bmOnly),   key:'@bm'  },
        { name:'💬 メモあり', cnt:_ctxVideos('memo').filter(v=>v.memo && String(v.memo).trim()).length,                 sel:!!(isOrg ? window.orgMemoOnly : window.memoOnly), key:'@memo'},
        { name:'🖼 画像あり', cnt:_ctxVideos('img').filter(v=>v.img || (v.snapshots && v.snapshots.length)).length,     sel:!!(isOrg ? window.orgImgOnly : window.imgOnly),  key:'@img' }
      ];

      const STATUS_MANUAL = ['未着手','理解','練習中','マスター'];
      const sCtx = _ctxVideos('status');
      const statusItems = STATUS_MANUAL.map(s => ({
        name: s, cnt: sCtx.filter(v => { const ns = v.status==='把握'?'理解':v.status==='習得中'?'練習中':v.status||'未着手'; return ns === s; }).length,
        sel: (isOrg ? window.orgFilters : window.filters)?.status?.has(s) || false,
        key: s
      }));

      const RANKS = window.RANK_DEFS || [];
      const rankCtx = _ctxVideos('prRank');
      const rankItems = RANKS.map(r => {
        return { name: r.name, cnt: rankCtx.filter(v => window.vpCntRank(v.practice).lv === r.lv).length, sel: (isOrg ? window.orgPrRank : window.prRank) === String(r.lv), key: String(r.lv) };
      });

      const pdBuckets = [
        { name:'今週 (7日以内)',  k:'week'  },
        { name:'今月 (30日以内)', k:'month' },
        { name:'3ヶ月以内',      k:'quarter' },
        { name:'それ以前',       k:'stale' },
        { name:'未カウント',     k:'never' }
      ];
      const pdCtx = _ctxVideos('prDate');
      const pdItems = pdBuckets.map(b => {
        let c = 0;
        for (const v of pdCtx) {
          const lp = v.lastPracticed || 0;
          const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
          if (b.k === 'week'    && lp && days <= 7)   c++;
          else if (b.k === 'month'   && lp && days <= 30)  c++;
          else if (b.k === 'quarter' && lp && days <= 90)  c++;
          else if (b.k === 'stale'   && lp && days > 90)   c++;
          else if (b.k === 'never'   && !lp)               c++;
        }
        return { name:b.name, cnt:c, sel: (isOrg ? window.orgPrDate : window.prDate) === b.k, key:b.k };
      });

      const mkCol1 = () => {
        const grpLabel = s => `<div style="padding:6px 12px 2px;font-size:9px;font-weight:800;color:var(--accent);letter-spacing:.5px">${s}</div>`;
        const divider = '<div style="height:1px;background:var(--border);margin:6px 0"></div>';
        let markArr = markItems.slice();
        if (_q) markArr = markArr.filter(r => r.name.toLowerCase().includes(_q));
        markArr = markArr.filter(r => r.sel || r.cnt > 0);
        const markRows = markArr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('${r.key}','')"><span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span></div>`
        ).join('');

        let statusArr = statusItems.slice();
        if (_q) statusArr = statusArr.filter(r => r.name.toLowerCase().includes(_q));
        statusArr = statusArr.filter(r => r.sel || r.cnt > 0);
        const statusRows = statusArr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('status','${r.key}')"><span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span></div>`
        ).join('');

        let rankArr = rankItems.slice();
        if (_q) rankArr = rankArr.filter(r => r.name.toLowerCase().includes(_q));
        rankArr = rankArr.filter(r => r.sel || r.cnt > 0);
        const rankRows = rankArr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('@rank','${r.key}')"><span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span></div>`
        ).join('');

        let pdArr = pdItems.slice();
        if (_q) pdArr = pdArr.filter(r => r.name.toLowerCase().includes(_q));
        pdArr = pdArr.filter(r => r.sel || r.cnt > 0);
        const pdRows = pdArr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('@prD','${r.key}')"><span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span></div>`
        ).join('');

        const colVis    = window.filterColVis || {};
        const showMark   = colVis.mark   !== false;
        const showStatus = colVis.status !== false;
        const showRank   = colVis.rank   !== false;

        const sections = [];
        if (showMark)   sections.push(`${grpLabel('マーク')}${markRows}`);
        if (showStatus) sections.push(`${grpLabel('習得度（手動）')}${statusRows}`);
        if (showRank) {
          sections.push(`${grpLabel('カウント（自動）')}${rankRows}`);
          sections.push(`${grpLabel('最終カウント日')}${pdRows}`);
        } else {
          sections.push(`${grpLabel('最終カウント日')}${pdRows}`);
        }

        const hdrParts = [showMark&&'マーク', showStatus&&'習得', showRank&&'カウント'].filter(Boolean);
        const colHdr   = hdrParts.length ? hdrParts.join('・') : '最終カウント日';

        return `<div class="uni-col">
          <div class="uni-col-hdr"><span>${colHdr}</span></div>
          <div class="uni-col-body">
            ${sections.join(divider)}
          </div>
        </div>`;
      };

      // ══ 2列目: 保存した検索条件 ══
      const mkCol2 = () => {
        const ss = window.savedSearches || [];
        const rows = ss.length ? ss.map((s, i) => {
          const cnt = _countSavedSearch(s);
          return `<div class="uni-ss-item" onclick="uniApplySaved(${i})">
            <span class="uni-ss-name">${_esc(s.name)}</span>
            <span class="uni-ss-cnt">${cnt}件</span>
            <button class="uni-ss-dots" onclick="uniSSMenu(${i},this,event)">···</button>
            <div class="uni-ss-pop" id="uni-ss-pop-${i}">
              <div class="uni-ss-reorder"><button onclick="uniSSMove(${i},-1,event)">↑ 上へ</button><button onclick="uniSSMove(${i},1,event)">↓ 下へ</button></div>
              <div class="uni-ss-div"></div>
              <div class="uni-ss-act" onclick="uniSSRename(${i},event)"><span class="uni-ss-icon">✏</span>名前を変更</div>
              <div class="uni-ss-act" onclick="uniSSEdit(${i},event)"><span class="uni-ss-icon">⚙</span>条件を編集</div>
              <div class="uni-ss-div"></div>
              <div class="uni-ss-act uni-ss-del" onclick="uniSSDel(${i},event)"><span class="uni-ss-icon">🗑</span>削除</div>
            </div>
          </div>`;
        }).join('') : '';
        const empty = !ss.length ? '<div style="padding:20px 12px;text-align:center;color:var(--text3);font-size:11px">検索条件を設定後「💾 保存」で追加</div>' : '';
        return `<div class="uni-col">
          <div class="uni-col-hdr"><span>保存した検索条件</span><span class="uni-ss-add" onclick="uniSSSave()">＋ 新規保存</span></div>
          <div class="uni-col-body">${rows}${empty}</div>
        </div>`;
      };

      // ══ 3列目: 最近みた動画 TOP 15 ══
      const mkCol3 = () => {
        const recents = JSON.parse(localStorage.getItem('wk_recent_views') || '[]').slice(0, 15);
        const rows = recents.length ? recents.map((v, i) => {
          const thumb = v.ytId
            ? `<img src="https://i.ytimg.com/vi/${v.ytId}/mqdefault.jpg" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
            : '';
          return `<div class="uni-rc-item" onclick="window.openVPanel?.('${v.id}');uniClose()">
            <span class="uni-rc-rank">${i+1}</span>
            <div class="uni-rc-thumb">${thumb}<span class="uni-rc-play">▶</span></div>
            <div class="uni-rc-info"><div class="uni-rc-title">${_esc(v.title)}</div><div class="uni-rc-meta">${_esc(v.channel||'')}</div></div>
          </div>`;
        }).join('') : '<div style="padding:20px 12px;text-align:center;color:var(--text3);font-size:11px">まだ視聴した動画はありません</div>';
        return `<div class="uni-col wide">
          <div class="uni-col-hdr"><span>最近みた動画 TOP 15</span></div>
          <div class="uni-col-body">${rows}</div>
        </div>`;
      };

      content.innerHTML = `<div class="uni-cols">${mkCol1()}${mkCol2()}${mkCol3()}</div>`;
      _restoreColScrolls();
    }

    else if (_tab === 'src') {
      // Source
      const srcCtx = _ctxVideos('platform');
      const srcItems = [['youtube','YouTube'],['vimeo','Vimeo'],['gdrive','GDrive'],['x','X']].map(([v,l]) => ({
        name: l,
        cnt: srcCtx.filter(x => (x.pt||x.src||'youtube') === v).length,
        sel: !!f.platform?.has(v),
        val: v
      }));
      // 特殊: platform は label と値が異なる
      const mkSrcCol = () => {
        let arr = srcItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('platform','${r.val}')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col narrow"><div class="uni-col-hdr"><span>Source</span></div><div class="uni-col-body">${rows}</div></div>`;
      };

      // Channel / Playlist
      const chCtx = _ctxVideos('channel');
      const chMap = {};
      chCtx.forEach(v => { const k = v.channel || v.ch; if (k) chMap[k] = (chMap[k]||0)+1; });
      [...(f.channel||[])].forEach(v => { if (!(v in chMap)) chMap[v] = 0; });
      const chItems = Object.entries(chMap).map(([n,c]) => ({ name:n, cnt:c, sel:f.channel?.has(n) }));

      const plCtx = _ctxVideos('playlist');
      const plMap = {};
      plCtx.forEach(v => { if (v.pl) plMap[v.pl] = (plMap[v.pl]||0)+1; });
      [...(f.playlist||[])].forEach(v => { if (!(v in plMap)) plMap[v] = 0; });
      const plItems = Object.entries(plMap).map(([n,c]) => ({ name:n, cnt:c, sel:f.playlist?.has(n) }));

      content.innerHTML = `<div class="uni-cols">
        ${mkSrcCol()}
        ${_colHtml('Channel', 'ch', chItems, { filterKey:'channel' })}
        ${_colHtml('Playlist', 'pl', plItems, { filterKey:'playlist' })}
      </div>`;
      _restoreColScrolls();
    }

    else if (_tab === 'video') {
      const vids = (window.videos || []).filter(v => {
        if (v.archived) return false;
        if (!_q) return true;
        return (v.title || '').toLowerCase().includes(_q)
          || (v.channel || v.ch || '').toLowerCase().includes(_q);
      });
      const rows = vids.length
        ? vids.map(v => {
            const ytId = v.ytId || ((v.pt || v.src || 'youtube') === 'youtube' ? v.id : null);
            const thumb = ytId
              ? `<img src="https://i.ytimg.com/vi/${ytId}/default.jpg" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:4px">`
              : '▶';
            return `<div class="uni-vid-row" onclick="window.openVPanel?.('${_esc(v.id)}');uniClose()">
              <div class="uni-vid-thumb">${thumb}</div>
              <div class="uni-vid-info">
                <div class="uni-vid-title">${_esc(v.title || '')}</div>
                <div class="uni-vid-meta">${_esc(v.channel || v.ch || '')} · ${_esc(v.pl || '')}</div>
              </div>
            </div>`;
          }).join('')
        : '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">一致する動画がありません</div>';
      content.innerHTML = `<div style="flex:1;overflow-y:auto">${rows}</div>`;
    }

    else {
      // tag — lib: tbNew/cat/posNew/tags, org: tb/action/position/tags
      const TB  = window.TB_VALUES || ['トップ','ボトム','スタンディング'];
      const tkTb = isOrg ? 'tb' : 'tbNew', tkCat = isOrg ? 'action' : 'cat', tkPos = isOrg ? 'position' : 'posNew', tkTags = isOrg ? 'tags' : 'tags';

      const tbCtx = _ctxVideos('tb');
      const tbItems = TB.map(n => ({
        name:n, cnt: tbCtx.filter(v => (v.tb||[]).includes(n)).length, sel: !!f[tkTb]?.has(n)
      }));

      const catLabel = isOrg ? 'Action' : 'カテゴリ';
      const catSrc   = (window.CATEGORIES || []).map(c => c.name);
      const catCtx = _ctxVideos('cat');
      const catItems = catSrc.map(n => ({
        name:n, cnt: catCtx.filter(v => (v.cat||[]).includes(n)).length, sel: !!f[tkCat]?.has(n)
      }));

      const posLabel = isOrg ? 'Position' : 'ポジション';
      const posSrc   = (window.POSITIONS || []).map(p => p.ja);
      const posCtx = _ctxVideos('pos');
      const posItems = posSrc.map(n => ({
        name:n, cnt: posCtx.filter(v => (v.pos||[]).includes(n)).length, sel: !!f[tkPos]?.has(n)
      }));

      const tagsLabel = isOrg ? 'Technique' : '#タグ';
      const tagsSrc   = [...new Set((window.videos||[]).flatMap(v => v.tags||[]))].sort();
      const tagsCtx = _ctxVideos('tags');
      const tagItems = tagsSrc.map(n => ({
        name:n, cnt: tagsCtx.filter(v => (v.tags||[]).includes(n)).length, sel: !!f[tkTags]?.has(n)
      }));

      const _tsV = key => { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; };
      const tagCols = [
        _tsV('tb')   && _colHtml('T/B',      'tb',   tbItems,  { filterKey: tkTb }),
        _tsV('cat')  && _colHtml(catLabel,   'cat',  catItems, { filterKey: tkCat }),
        _tsV('pos')  && _colHtml(posLabel,   'pos',  posItems, { filterKey: tkPos }),
        _tsV('tags') && _colHtml(tagsLabel,  'tags', tagItems, { filterKey: tkTags }),
      ].filter(Boolean).join('');
      content.innerHTML = `<div class="uni-cols">${tagCols}</div>`;
      _restoreColScrolls();
    }

    // ── Pills ──
    const pills = [];
    const _fav  = isOrg ? window.orgFavOnly  : window.favOnly;
    const _bm   = isOrg ? window.orgBmOnly   : window.bmOnly;
    const _memo = isOrg ? window.orgMemoOnly : window.memoOnly;
    const _img  = isOrg ? window.orgImgOnly  : window.imgOnly;
    const _prR  = isOrg ? window.orgPrRank   : window.prRank;
    const _prD  = isOrg ? window.orgPrDate   : window.prDate;
    const _next = isOrg ? window.orgNextOnly : window.nextOnly;
    if (_fav)  pills.push(['@fav',  '★ Fav']);
    if (_next) pills.push(['@next', '▶ Next']);
    if (_bm)   pills.push(['@bm',   '📌 ブックマーク']);
    if (_memo) pills.push(['@memo', '💬 メモ']);
    if (_img)  pills.push(['@img',  '🖼 画像あり']);
    if (_prR != null && window.RANK_DEFS) {
      const r = window.RANK_DEFS[Number(_prR)];
      if (r) pills.push(['@rank', r.name]);
    }
    if (_prD) {
      const map = { week:'今週',month:'今月',quarter:'3ヶ月以内',stale:'それ以前',never:'未カウント' };
      pills.push(['@prD', map[_prD] || _prD]);
    }
    const tkTbP = isOrg ? 'tb' : 'tbNew', tkCatP = isOrg ? 'action' : 'cat', tkPosP = isOrg ? 'position' : 'posNew', tkTagsP = isOrg ? 'tags' : 'tags';
    [...(f.platform||[])].forEach(v => pills.push(['platform', v]));
    [...(f.channel ||[])].forEach(v => pills.push(['channel',  v]));
    [...(f.playlist||[])].forEach(v => pills.push(['playlist', v]));
    [...(f[tkTbP]||[])].forEach(v => pills.push([tkTbP, v]));
    [...(f[tkCatP]||[])].forEach(v => pills.push([tkCatP, v]));
    [...(f[tkPosP]||[])].forEach(v => pills.push([tkPosP, v]));
    [...(f[tkTagsP]||[])].forEach(v => pills.push([tkTagsP, v]));

    const pillsEl = document.getElementById('uni-pills');
    pillsEl.innerHTML = pills.length
      ? pills.map(([k,v]) => `<span class="uni-pill" onclick="uniToggle('${k}','${_esc(String(v)).replace(/'/g,'&#39;')}')">${_esc(String(v))}</span>`).join('')
      : '<span style="color:var(--text3);font-size:11px">なし</span>';

    // Hit
    const hitEl = document.getElementById('uni-hit');
    if (hitEl) hitEl.textContent = _ctxVideos(null).length + ' 件';

    // Sidebar badge sync
    _syncSidebarBadges(bd);
  }

  function _syncSidebarBadges(bd) {
    const upd = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (n) { el.style.display = 'inline-block'; el.textContent = n; }
      else   { el.style.display = 'none'; }
    };
    // Library badges
    const libBd = _ctx === 'lib' ? bd : _badges('lib');
    upd('uni-state-badge', libBd.state);
    upd('uni-src-badge',   libBd.src);
    upd('uni-tag-badge',   libBd.tag);
    upd('fs-v4-btn-badge', libBd.tag);
    // Organize badges
    const orgBd = _ctx === 'org' ? bd : _badges('org');
    upd('org-uni-state-badge', orgBd.state);
    upd('org-uni-src-badge',   orgBd.src);
    upd('org-uni-tag-badge',   orgBd.tag);
  }

  // ── グローバル公開 ──
  const _phMap = { video:'🔍 動画タイトル・チャンネルを検索…', src:'🔍 チャンネル・プレイリストを検索', tag:'🔍 タグの検索' };
  function _syncSearchbar(t) {
    const sb  = document.querySelector('#uni-popup .uni-searchbar');
    const inp = document.getElementById('uni-q');
    if (sb)  sb.style.display = t === 'state' ? 'none' : '';
    if (inp) {
      inp.placeholder = _phMap[t] || '🔍 検索...';
      inp.value = _queries[t] || '';
    }
    _q = _queries[t] || '';
  }
  window.uniOpen = function (tab, ctx) {
    _ctx = ctx || 'lib';
    _inject();
    if (tab && MAIN.some(m => m.k === tab)) _tab = tab;
    document.getElementById('uni-bd').classList.add('open');
    document.getElementById('uni-popup').classList.add('open');
    _syncSearchbar(_tab);
    _render();
  };
  window.uniClose = function () {
    document.getElementById('uni-bd')?.classList.remove('open');
    document.getElementById('uni-popup')?.classList.remove('open');
    Object.keys(_queries).forEach(k => _queries[k] = '');
    _q = '';
    const inp = document.getElementById('uni-q');
    if (inp) inp.value = '';
  };
  window.uniSetTab = function (t) {
    _queries[_tab] = _q; // 現タブのクエリを保存
    _tab = t;
    _syncSearchbar(t);
    _render();
  };
  window.uniSetSort = function (k, v) { _sort[k] = v; _render(); };
  window.uniSearch = function (v) { _q = (v||'').trim().toLowerCase(); _queries[_tab] = _q; _render(); };
  window.uniToggle = function (key, val) {
    const isOrg = _ctx === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const refresh = isOrg ? () => window.renderOrg?.() : () => { window.AF?.(); window.buildSidebarFovRows?.(); };
    // 擬似ブール系
    if (key === '@fav')  { isOrg ? window.togOrgFav?.()     : window.togFav?.();     _render(); return; }
    if (key === '@next') { isOrg ? window.togOrgNext?.()    : window.togNext?.();    _render(); return; }
    if (key === '@unw')  { isOrg ? window.togOrgUnw?.()     : window.togUnw?.();     _render(); return; }
    if (key === '@wat')  { isOrg ? window.togOrgWatched?.() : window.togWatched?.(); _render(); return; }
    if (key === '@bm')   { isOrg ? window.togOrgBm?.()      : window.togBm?.();      _render(); return; }
    if (key === '@memo') { isOrg ? window.togOrgMemo?.()    : window.togMemo?.();    _render(); return; }
    if (key === '@img')  { isOrg ? window.togOrgImg?.()     : window.togImg?.();     _render(); return; }
    if (key === '@rank') {
      if (isOrg) { window.orgPrRank = (String(window.orgPrRank) === String(val)) ? null : String(val); }
      else       { window.prRank    = (String(window.prRank)    === String(val)) ? null : String(val); }
      refresh(); _render(); return;
    }
    if (key === '@prD') {
      if (isOrg) { window.orgPrDate = (window.orgPrDate === val) ? null : val; }
      else       { window.prDate    = (window.prDate    === val) ? null : val; }
      refresh(); _render(); return;
    }
    // Set系
    if (!f[key]) f[key] = new Set();
    f[key].has(val) ? f[key].delete(val) : f[key].add(val);
    refresh();
    _render();
  };
  window.uniClearAll = function () {
    _ctx === 'org' ? window.clearOrgFilters?.() : window.clearAll?.();
    Object.keys(_queries).forEach(k => _queries[k] = '');
    _q = '';
    const inp = document.getElementById('uni-q');
    if (inp) inp.value = '';
    _render();
  };
  window.uniSyncBadges = function () { _syncSidebarBadges(_badges()); };

  // ── 保存した検索条件: 件数概算 ──
  function _countSavedSearch(ss) {
    if (!ss || !ss.state) return 0;
    const s = ss.state;
    return (window.videos || []).filter(v => {
      if (v.archived) return false;
      if (s.favOnly && !v.fav) return false;
      if (s.unwOnly && v.watched) return false;
      if (s.watchedOnly && !v.watched) return false;
      const sf = s.filters || {};
      if (sf.channel?.length  && !sf.channel.includes(v.channel || v.ch)) return false;
      if (sf.playlist?.length && !sf.playlist.includes(v.pl)) return false;
      if (sf.platform?.length && !sf.platform.includes(v.pt || v.src || 'youtube')) return false;
      return true;
    }).length;
  }

  // ── 保存した検索条件: UI操作 ──
  function _closeSSMenus() {
    document.querySelectorAll('.uni-ss-pop.open').forEach(p => p.classList.remove('open'));
  }
  window.uniSSMenu = function (idx, btn, e) {
    e.stopPropagation();
    const pop = document.getElementById('uni-ss-pop-' + idx);
    const wasOpen = pop?.classList.contains('open');
    _closeSSMenus();
    if (!wasOpen && pop) pop.classList.add('open');
  };
  window.uniApplySaved = function (idx) {
    const isOrg = _ctx === 'org';
    if (isOrg) window.applySavedSearchToOrg?.(idx);
    else       window.applySavedSearch?.(idx);
    _render();
  };
  window.uniSSRename = function (idx, e) {
    e.stopPropagation(); _closeSSMenus();
    window.renameSavedSearch?.(idx, e);
    _render();
  };
  window.uniSSEdit = function (idx, e) {
    e.stopPropagation(); _closeSSMenus();
    window.editSavedSearch?.(idx, e);
    uniClose();
  };
  window.uniSSDel = function (idx, e) {
    e.stopPropagation(); _closeSSMenus();
    window.deleteSavedSearch?.(idx, e);
    _render();
  };
  window.uniSSMove = function (idx, dir, e) {
    e.stopPropagation(); _closeSSMenus();
    const ss = window.savedSearches;
    if (!ss) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ss.length) return;
    [ss[idx], ss[newIdx]] = [ss[newIdx], ss[idx]];
    localStorage.setItem('wk-saved-searches', JSON.stringify(ss));
    window.saveUserSettings?.();
    _render();
  };
  window.uniSSSave = function () {
    window.saveCurrentSearch?.();
    _render();
  };
  window.uniSaveFromBar = function () {
    window.saveCurrentSearchFromInput?.('uni-save-name', _ctx === 'org');
    _render();
  };

  // popoverを外クリックで閉じる
  document.addEventListener('click', () => _closeSSMenus());
})();
