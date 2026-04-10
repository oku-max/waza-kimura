// ═══ WAZA KIMURA — 統合フィルターパネル (案E改) ═══
// state / src / tag の3グループを1つのポップアップに統合
(function () {
  'use strict';

  const MAIN = [
    { k: 'state', label: '進捗 & マーク' },
    { k: 'src',   label: 'ソース・チャンネル・プレイリスト' },
    { k: 'tag',   label: 'タグ' }
  ];

  let _tab = 'state';
  let _q = '';
  let _ctx = 'lib'; // 'lib' or 'org'
  const _sort = { ch:'cnt', pl:'cnt', tb:'abc', cat:'abc', pos:'abc', tags:'cnt' };

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
    // tag filter keys: lib uses tbNew/cat/posNew/tags, org uses tb/action/position/tech
    const tkTb   = isOrg ? 'tb'       : 'tbNew';
    const tkCat  = isOrg ? 'action'   : 'cat';
    const tkPos  = isOrg ? 'position' : 'posNew';
    const tkTags = isOrg ? 'tech'     : 'tags';
    return (window.videos || []).filter(v => {
      if (v.archived) return false;
      if (excludeKey !== 'fav' && fav && !v.fav) return false;
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
      if (excludeKey !== 'cat'  && f[tkCat]?.size  && !(isOrg ? (v.ac||[]) : (v.cat||[])).some(c => f[tkCat].has(c))) return false;
      if (excludeKey !== 'pos'  && f[tkPos]?.size  && !(v.pos ||[]).some(p => f[tkPos].has(p)))        return false;
      if (excludeKey !== 'tags' && f[tkTags]?.size && !(isOrg ? (v.tech||[]) : (v.tags||[])).some(t => f[tkTags].has(t))) return false;
      const prRank = isOrg ? window.orgPrRank : window.prRank;
      const prDate = isOrg ? window.orgPrDate : window.prDate;
      if (excludeKey !== 'prRank' && prRank != null && window.vpCntRank) {
        if (String(window.vpCntRank(v.practice).lv) !== String(prRank)) return false;
      }
      if (excludeKey !== 'prDate' && prDate) {
        const lp = v.lastPracticed || 0;
        const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
        if (prDate === 'week'  && !(lp && days <= 7))  return false;
        if (prDate === 'month' && !(lp && days <= 30)) return false;
        if (prDate === 'stale' && !(lp && days > 30))  return false;
        if (prDate === 'never' && lp)                  return false;
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
#uni-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1080px,calc(100vw - 16px));height:min(600px,calc(100svh - 16px));max-height:calc(100svh - 16px);background:var(--surface);color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:none;flex-direction:column;z-index:100001}
#uni-popup.open{display:flex}
#uni-popup .uni-topbar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-bottom:1px solid var(--border);flex-shrink:0}
#uni-popup .uni-tabs{display:flex;gap:3px;flex:0 0 auto}
#uni-popup .uni-tab{padding:7px 14px;font-size:12px;font-weight:700;color:var(--text2);cursor:pointer;border-radius:6px;background:var(--surface);border:1px solid var(--border);white-space:nowrap;font-family:inherit}
#uni-popup .uni-tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
#uni-popup .uni-tab .uni-bdg{display:inline-block;background:var(--accent);color:#fff;font-size:9px;padding:0 5px;border-radius:6px;margin-left:4px;font-weight:700}
#uni-popup .uni-tab.on .uni-bdg{background:rgba(255,255,255,.3);color:#fff}
#uni-popup .uni-search{flex:1;min-width:0}
#uni-popup .uni-search input{width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text);font-family:inherit;box-sizing:border-box}
#uni-popup .uni-x{color:var(--text3);cursor:pointer;font-size:18px;padding:0 8px;line-height:1}
#uni-popup .uni-x:hover{color:var(--text)}
#uni-popup .uni-cols{flex:1;display:flex;overflow:hidden;min-height:0}
#uni-popup .uni-col{flex:1;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border)}
#uni-popup .uni-col:last-child{border-right:none}
#uni-popup .uni-col.narrow{flex:0 0 140px}
#uni-popup .uni-col-hdr{padding:8px 12px 6px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;letter-spacing:.3px;flex-shrink:0}
#uni-popup .uni-col-hdr select{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--surface);color:var(--text2);font-family:inherit}
#uni-popup .uni-col-body{flex:1;overflow-y:auto;padding:2px 0;min-height:0}
#uni-popup .uni-row{padding:7px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:12px;border-left:3px solid transparent;color:var(--text)}
#uni-popup .uni-row:hover{background:var(--surface2)}
#uni-popup .uni-row.on{background:rgba(107,63,212,.14);border-left-color:var(--accent);color:var(--accent);font-weight:700}
#uni-popup .uni-row .uni-cnt{min-width:22px;height:20px;padding:0 8px;border-radius:10px;background:rgba(107,63,212,.1);color:var(--accent);font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
#uni-popup .uni-row.on .uni-cnt{background:var(--accent);color:#fff}
#uni-popup .uni-ftr{border-top:1px solid var(--border);padding:8px 14px;background:var(--surface2);display:flex;gap:8px;align-items:center;min-height:44px;flex-wrap:wrap;flex-shrink:0}
#uni-popup .uni-lbl{font-size:10px;color:var(--text3);font-weight:700;margin-right:4px}
#uni-popup .uni-pill{background:var(--accent);color:#fff;padding:2px 9px;border-radius:10px;font-size:10px;cursor:pointer;font-weight:700}
#uni-popup .uni-pill:after{content:" ×";opacity:.7}
#uni-popup .uni-sp{flex:1}
#uni-popup .uni-hit{font-size:12px;color:var(--accent);font-weight:700}
#uni-popup .uni-clr{font-size:10px;color:var(--text3);cursor:pointer;text-decoration:underline;margin-right:6px}
#uni-popup .uni-apply{background:var(--accent);color:#fff;border:none;padding:6px 16px;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;font-family:inherit}
#uni-popup .uni-apply:hover{filter:brightness(1.1)}
</style>`;
    document.head.insertAdjacentHTML('beforeend', css);
    document.body.insertAdjacentHTML('beforeend', `
<div id="uni-bd" onclick="uniClose()"></div>
<div id="uni-popup" role="dialog" aria-modal="true">
  <div class="uni-topbar">
    <div class="uni-tabs" id="uni-tabs"></div>
    <div class="uni-search"><input id="uni-q" placeholder="🔍 検索..." oninput="uniSearch(this.value)"></div>
    <div class="uni-x" onclick="uniClose()">✕</div>
  </div>
  <div id="uni-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0"></div>
  <div class="uni-ftr">
    <span class="uni-lbl">選択中:</span>
    <div id="uni-pills" style="display:flex;gap:5px;flex-wrap:wrap"></div>
    <span class="uni-sp"></span>
    <span class="uni-clr" onclick="uniClearAll()">クリア</span>
    <span class="uni-hit" id="uni-hit">0 件</span>
    <button class="uni-apply" onclick="uniClose()">適用</button>
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
    if (opts.sortable !== false) {
      const sortMode = _sort[listKey] || 'abc';
      if (sortMode === 'abc') arr.sort((a,b) => a.name.localeCompare(b.name,'ja'));
      else                     arr.sort((a,b) => b.cnt - a.cnt);
    }
    const rows = arr.length ? arr.map(r =>
      `<div class="uni-row${r.sel ? ' on' : ''}" onclick="uniToggle('${opts.filterKey}','${_esc(r.name).replace(/'/g,'&#39;')}')">
        <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
      </div>`
    ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
    const sortSel = opts.sortable === false ? '' :
      `<select onchange="uniSetSort('${listKey}',this.value)">
        <option value="abc"${(_sort[listKey]||'abc')==='abc'?' selected':''}>あいうえ順</option>
        <option value="cnt"${(_sort[listKey]||'abc')==='cnt'?' selected':''}>件数順</option>
      </select>`;
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
      + ((isOrg ? window.orgBmOnly : window.bmOnly) ? 1 : 0)
      + ((isOrg ? window.orgMemoOnly : window.memoOnly) ? 1 : 0)
      + ((isOrg ? window.orgImgOnly : window.imgOnly) ? 1 : 0)
      + ((isOrg ? window.orgPrRank : window.prRank) != null ? 1 : 0)
      + ((isOrg ? window.orgPrDate : window.prDate) ? 1 : 0);
    const srcN = (f.platform?.size || 0) + (f.channel?.size || 0) + (f.playlist?.size || 0);
    const tkTb = isOrg ? 'tb' : 'tbNew', tkCat = isOrg ? 'action' : 'cat', tkPos = isOrg ? 'position' : 'posNew', tkTags = isOrg ? 'tech' : 'tags';
    const tagN = (f[tkTb]?.size || 0) + (f[tkCat]?.size || 0) + (f[tkPos]?.size || 0) + (f[tkTags]?.size || 0);
    return { state: stateN, src: srcN, tag: tagN };
  }

  function _render() {
    const isOrg = _ctx === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const tabsEl = document.getElementById('uni-tabs');
    const bd = _badges();
    tabsEl.innerHTML = MAIN.map(m =>
      `<div class="uni-tab${_tab===m.k?' on':''}" onclick="uniSetTab('${m.k}')">${m.label}${bd[m.k]?`<span class="uni-bdg">${bd[m.k]}</span>`:''}</div>`
    ).join('');

    const content = document.getElementById('uni-content');

    if (_tab === 'state') {
      // マーク: Fav / BM / メモ / 画像
      const markItems = [
        { name:'★ Fav',       cnt:_ctxVideos('fav').filter(v=>v.fav).length,                                           sel:!!(isOrg ? window.orgFavOnly : window.favOnly),  key:'@fav' },
        { name:'🔖 ブックマーク', cnt:_ctxVideos('bm').filter(v=>v.bm || (v.bookmarks && v.bookmarks.length)).length,    sel:!!(isOrg ? window.orgBmOnly : window.bmOnly),   key:'@bm'  },
        { name:'💬 メモあり', cnt:_ctxVideos('memo').filter(v=>v.memo && String(v.memo).trim()).length,                 sel:!!(isOrg ? window.orgMemoOnly : window.memoOnly), key:'@memo'},
        { name:'🖼 画像あり', cnt:_ctxVideos('img').filter(v=>v.img || (v.snapshots && v.snapshots.length)).length,     sel:!!(isOrg ? window.orgImgOnly : window.imgOnly),  key:'@img' }
      ];
      const mkMarkCol = () => {
        let arr = markItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('${r.key}','')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col"><div class="uni-col-hdr"><span>マーク</span></div><div class="uni-col-body">${rows}</div></div>`;
      };

      // 進捗ランク (自動導出)
      const RANKS = window.RANK_DEFS || [];
      const rankCtx = _ctxVideos('prRank');
      const rankItems = RANKS.map(r => {
        const label = r.max === Infinity ? `${r.name} (${r.min}+)` : (r.min === r.max ? `${r.name} (${r.min}回)` : `${r.name} (${r.min}-${r.max})`);
        return {
          name: label,
          cnt: rankCtx.filter(v => window.vpCntRank(v.practice).lv === r.lv).length,
          sel: (isOrg ? window.orgPrRank : window.prRank) === String(r.lv),
          key: String(r.lv)
        };
      });
      const mkRankCol = () => {
        let arr = rankItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('@rank','${r.key}')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col"><div class="uni-col-hdr"><span>🥋 進捗ランク (自動)</span></div><div class="uni-col-body">${rows}</div></div>`;
      };

      // 最終練習日 (単一選択)
      const pdBuckets = [
        { name:'今週 (7日以内)',  k:'week'  },
        { name:'今月 (30日以内)', k:'month' },
        { name:'しばらく練習してない (30日+)', k:'stale' },
        { name:'未練習',          k:'never' }
      ];
      const pdCtx = _ctxVideos('prDate');
      const pdItems = pdBuckets.map(b => {
        let c = 0;
        for (const v of pdCtx) {
          const lp = v.lastPracticed || 0;
          const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
          if (b.k === 'week'  && lp && days <= 7)  c++;
          else if (b.k === 'month' && lp && days <= 30) c++;
          else if (b.k === 'stale' && lp && days > 30)  c++;
          else if (b.k === 'never' && !lp)              c++;
        }
        return { name:b.name, cnt:c, sel: (isOrg ? window.orgPrDate : window.prDate) === b.k, key:b.k };
      });
      const mkPdCol = () => {
        let arr = pdItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('@prD','${r.key}')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col"><div class="uni-col-hdr"><span>🗓 最終練習日</span></div><div class="uni-col-body">${rows}</div></div>`;
      };

      content.innerHTML = `<div class="uni-cols">
        ${mkMarkCol()}
        ${mkRankCol()}
        ${mkPdCol()}
      </div>`;
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
    }

    else {
      // tag — lib: tbNew/cat/posNew/tags, org: tb/action/position/tech
      const TB  = window.TB_VALUES || ['トップ','ボトム','スタンディング'];
      const tkTb = isOrg ? 'tb' : 'tbNew', tkCat = isOrg ? 'action' : 'cat', tkPos = isOrg ? 'position' : 'posNew', tkTags = isOrg ? 'tech' : 'tags';

      const tbCtx = _ctxVideos('tb');
      const tbItems = TB.map(n => ({
        name:n, cnt: tbCtx.filter(v => (v.tb||[]).includes(n)).length, sel: !!f[tkTb]?.has(n)
      }));

      const catLabel = isOrg ? 'Action' : 'カテゴリ';
      const catSrc   = isOrg ? (window.AC_TAGS || []) : (window.CATEGORIES || []).map(c => c.name);
      const catCtx = _ctxVideos('cat');
      const catItems = catSrc.map(n => ({
        name:n, cnt: catCtx.filter(v => (isOrg ? (v.ac||[]) : (v.cat||[])).includes(n)).length, sel: !!f[tkCat]?.has(n)
      }));

      const posLabel = isOrg ? 'Position' : 'ポジション';
      const posSrc   = isOrg ? [...new Set((window.videos||[]).flatMap(v => v.pos||[]))].sort() : (window.POSITIONS || []).map(p => p.ja);
      const posCtx = _ctxVideos('pos');
      const posItems = posSrc.map(n => ({
        name:n, cnt: posCtx.filter(v => (v.pos||[]).includes(n)).length, sel: !!f[tkPos]?.has(n)
      }));

      const tagsLabel = isOrg ? 'Technique' : '#タグ';
      const tagsSrc   = isOrg ? [...new Set((window.videos||[]).flatMap(v => v.tech||[]))].sort() : _collectTags();
      const tagsCtx = _ctxVideos('tags');
      const tagItems = tagsSrc.map(n => ({
        name:n, cnt: tagsCtx.filter(v => (isOrg ? (v.tech||[]) : (v.tags||[])).includes(n)).length, sel: !!f[tkTags]?.has(n)
      }));

      content.innerHTML = `<div class="uni-cols">
        ${_colHtml('T/B', 'tb', tbItems, { filterKey: tkTb })}
        ${_colHtml(catLabel, 'cat', catItems, { filterKey: tkCat })}
        ${_colHtml(posLabel, 'pos', posItems, { filterKey: tkPos })}
        ${_colHtml(tagsLabel, 'tags', tagItems, { filterKey: tkTags })}
      </div>`;
    }

    // ── Pills ──
    const pills = [];
    const _fav  = isOrg ? window.orgFavOnly  : window.favOnly;
    const _bm   = isOrg ? window.orgBmOnly   : window.bmOnly;
    const _memo = isOrg ? window.orgMemoOnly : window.memoOnly;
    const _img  = isOrg ? window.orgImgOnly  : window.imgOnly;
    const _prR  = isOrg ? window.orgPrRank   : window.prRank;
    const _prD  = isOrg ? window.orgPrDate   : window.prDate;
    if (_fav)  pills.push(['@fav',  '★ Fav']);
    if (_bm)   pills.push(['@bm',   '🔖 ブックマーク']);
    if (_memo) pills.push(['@memo', '💬 メモ']);
    if (_img)  pills.push(['@img',  '🖼 画像あり']);
    if (_prR != null && window.RANK_DEFS) {
      const r = window.RANK_DEFS[Number(_prR)];
      if (r) pills.push(['@rank', r.name]);
    }
    if (_prD) {
      const map = { week:'今週練習',month:'今月練習',stale:'🗓 30日+',never:'未練習' };
      pills.push(['@prD', map[_prD] || _prD]);
    }
    const tkTbP = isOrg ? 'tb' : 'tbNew', tkCatP = isOrg ? 'action' : 'cat', tkPosP = isOrg ? 'position' : 'posNew', tkTagsP = isOrg ? 'tech' : 'tags';
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
  window.uniOpen = function (tab, ctx) {
    _ctx = ctx || 'lib';
    _inject();
    if (tab && MAIN.some(m => m.k === tab)) _tab = tab;
    document.getElementById('uni-bd').classList.add('open');
    document.getElementById('uni-popup').classList.add('open');
    _render();
  };
  window.uniClose = function () {
    document.getElementById('uni-bd')?.classList.remove('open');
    document.getElementById('uni-popup')?.classList.remove('open');
  };
  window.uniSetTab = function (t) { _tab = t; _render(); };
  window.uniSetSort = function (k, v) { _sort[k] = v; _render(); };
  window.uniSearch = function (v) { _q = (v||'').trim().toLowerCase(); _render(); };
  window.uniToggle = function (key, val) {
    const isOrg = _ctx === 'org';
    const f = isOrg ? (window.orgFilters || {}) : (window.filters || {});
    const refresh = isOrg ? () => window.renderOrg?.() : () => { window.AF?.(); window.buildSidebarFovRows?.(); };
    // 擬似ブール系
    if (key === '@fav')  { isOrg ? window.togOrgFav?.()     : window.togFav?.();     _render(); return; }
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
    _render();
  };
  window.uniSyncBadges = function () { _syncSidebarBadges(_badges()); };
})();
