// ═══ WAZA KIMURA — 統合フィルターパネル (案E改) ═══
// state / src / tag の3グループを1つのポップアップに統合
(function () {
  'use strict';

  const MAIN = [
    { k: 'state', label: 'ステータス・優先度' },
    { k: 'src',   label: 'ソース・チャンネル・プレイリスト' },
    { k: 'tag',   label: 'タグ' }
  ];

  let _tab = 'state';
  let _q = '';
  const _sort = { ch:'cnt', pl:'cnt', tb:'abc', cat:'abc', pos:'abc', tags:'cnt' };

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ── ファセット用: excludeKey 以外の全フィルターを適用した動画 ──
  function _ctxVideos(excludeKey) {
    const f = window.filters || {};
    const fav = window.favOnly, unw = window.unwOnly, wat = window.watchedOnly;
    const bm = window.bmOnly, memo = window.memoOnly, img = window.imgOnly;
    return (window.videos || []).filter(v => {
      if (v.archived) return false;
      // state系 booleans
      if (excludeKey !== 'fav' && fav && !v.fav) return false;
      if (excludeKey !== 'unw' && unw && v.watched) return false;
      if (excludeKey !== 'wat' && wat && !v.watched) return false;
      if (excludeKey !== 'bm'  && bm  && !(v.bm || (v.bookmarks && v.bookmarks.length))) return false;
      if (excludeKey !== 'memo'&& memo&& !(v.memo && String(v.memo).trim())) return false;
      if (excludeKey !== 'img' && img && !(v.img || (v.images && v.images.length))) return false;
      // sets
      if (excludeKey !== 'platform' && f.platform?.size && !f.platform.has(v.pt || v.src || 'youtube')) return false;
      if (excludeKey !== 'channel'  && f.channel?.size  && !f.channel.has(v.channel || v.ch))           return false;
      if (excludeKey !== 'playlist' && f.playlist?.size && !f.playlist.has(v.pl))                       return false;
      if (excludeKey !== 'status'   && f.status?.size   && !f.status.has(v.status))                     return false;
      if (excludeKey !== 'prio'     && f.prio?.size     && !f.prio.has(v.prio))                         return false;
      if (excludeKey !== 'tbNew'    && f.tbNew?.size    && !(v.tb  ||[]).some(t => f.tbNew.has(t)))     return false;
      if (excludeKey !== 'cat'      && f.cat?.size      && !(v.cat ||[]).some(c => f.cat.has(c)))       return false;
      if (excludeKey !== 'posNew'   && f.posNew?.size   && !(v.pos ||[]).some(p => f.posNew.has(p)))    return false;
      if (excludeKey !== 'tags'     && f.tags?.size     && !(v.tags||[]).some(t => f.tags.has(t)))      return false;
      // 練習回数 / 最終練習日
      if (excludeKey !== 'prBucket' && window.prBucket) {
        const p = v.practice || 0;
        if (window.prBucket === '0'   && p !== 0) return false;
        if (window.prBucket === '1+'  && p < 1)   return false;
        if (window.prBucket === '3+'  && p < 3)   return false;
        if (window.prBucket === '5+'  && p < 5)   return false;
        if (window.prBucket === '10+' && p < 10)  return false;
      }
      if (excludeKey !== 'prDate' && window.prDate) {
        const lp = v.lastPracticed || 0;
        const days = lp ? (Date.now() - lp) / 86400000 : Infinity;
        if (window.prDate === 'week'  && !(lp && days <= 7))  return false;
        if (window.prDate === 'month' && !(lp && days <= 30)) return false;
        if (window.prDate === 'stale' && !(lp && days > 30))  return false;
        if (window.prDate === 'never' && lp)                  return false;
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
  function _badges() {
    const f = window.filters || {};
    const stateN = (f.status?.size || 0) + (f.prio?.size || 0)
      + (window.favOnly?1:0) + (window.unwOnly?1:0) + (window.watchedOnly?1:0)
      + (window.bmOnly?1:0) + (window.memoOnly?1:0) + (window.imgOnly?1:0)
      + (window.prBucket?1:0) + (window.prDate?1:0);
    const srcN = (f.platform?.size || 0) + (f.channel?.size || 0) + (f.playlist?.size || 0);
    const tagN = (f.tbNew?.size || 0) + (f.cat?.size || 0) + (f.posNew?.size || 0) + (f.tags?.size || 0);
    return { state: stateN, src: srcN, tag: tagN };
  }

  function _render() {
    const f = window.filters || {};
    const tabsEl = document.getElementById('uni-tabs');
    const bd = _badges();
    tabsEl.innerHTML = MAIN.map(m =>
      `<div class="uni-tab${_tab===m.k?' on':''}" onclick="uniSetTab('${m.k}')">${m.label}${bd[m.k]?`<span class="uni-bdg">${bd[m.k]}</span>`:''}</div>`
    ).join('');

    const content = document.getElementById('uni-content');

    if (_tab === 'state') {
      // ステータス: 擬似トグル項目
      const statusItems = [
        { name:'★ Fav',      cnt:_ctxVideos('fav').filter(v=>v.fav).length,                                           sel:!!window.favOnly,     key:'@fav' },
        { name:'Unseen',     cnt:_ctxVideos('unw').filter(v=>!v.watched).length,                                      sel:!!window.unwOnly,     key:'@unw' },
        { name:'視聴済み',    cnt:_ctxVideos('wat').filter(v=>v.watched).length,                                       sel:!!window.watchedOnly, key:'@wat' },
        { name:'🔖 BM',       cnt:_ctxVideos('bm').filter(v=>v.bm || (v.bookmarks && v.bookmarks.length)).length,      sel:!!window.bmOnly,      key:'@bm'  },
        { name:'💬 メモ',     cnt:_ctxVideos('memo').filter(v=>v.memo && String(v.memo).trim()).length,                sel:!!window.memoOnly,    key:'@memo'},
        { name:'🖼 画像あり', cnt:_ctxVideos('img').filter(v=>v.img || (v.images && v.images.length)).length,          sel:!!window.imgOnly,     key:'@img' }
      ];
      // 進捗 (f.status)
      const statusVals = ['未着手','練習中','マスター'];
      const statusCtx = _ctxVideos('status');
      const progItems = statusVals.map(n => ({ name:n, cnt:statusCtx.filter(v=>v.status===n).length, sel:!!f.status?.has(n) }));
      // 優先度 (f.prio)
      const prioVals = ['今すぐ','そのうち','保留'];
      const prioCtx = _ctxVideos('prio');
      const prioItems = prioVals.map(n => ({ name:n, cnt:prioCtx.filter(v=>v.prio===n).length, sel:!!f.prio?.has(n) }));

      // 「ステータス」列だけ個別キーを埋め込んだ特殊なrowを生成
      const mkStatusCol = () => {
        let arr = statusItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('${r.key}','')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col"><div class="uni-col-hdr"><span>ステータス</span></div><div class="uni-col-body">${rows}</div></div>`;
      };

      // 練習回数 (単一選択)
      const prBuckets = [
        { name:'未練習 (0)', k:'0'   },
        { name:'1回以上',    k:'1+'  },
        { name:'3回以上',    k:'3+'  },
        { name:'5回以上',    k:'5+'  },
        { name:'10回以上',   k:'10+' }
      ];
      const prCtx = _ctxVideos('prBucket');
      const prItems = prBuckets.map(b => {
        let c = 0;
        for (const v of prCtx) {
          const p = v.practice || 0;
          if (b.k === '0'   && p === 0) c++;
          else if (b.k === '1+'  && p >= 1)  c++;
          else if (b.k === '3+'  && p >= 3)  c++;
          else if (b.k === '5+'  && p >= 5)  c++;
          else if (b.k === '10+' && p >= 10) c++;
        }
        return { name:b.name, cnt:c, sel: window.prBucket === b.k, key:b.k };
      });
      const mkPrCol = () => {
        let arr = prItems.slice();
        if (_q) arr = arr.filter(r => r.name.toLowerCase().includes(_q));
        arr = arr.filter(r => r.sel || r.cnt > 0);
        const rows = arr.length ? arr.map(r =>
          `<div class="uni-row${r.sel?' on':''}" onclick="uniToggle('@prB','${r.key}')">
            <span>${_esc(r.name)}</span><span class="uni-cnt">${r.cnt}</span>
          </div>`
        ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';
        return `<div class="uni-col"><div class="uni-col-hdr"><span>🥋 練習回数</span></div><div class="uni-col-body">${rows}</div></div>`;
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
        return { name:b.name, cnt:c, sel: window.prDate === b.k, key:b.k };
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
        ${mkStatusCol()}
        ${_colHtml('進捗', 'progress', progItems, { filterKey:'status', sortable:false })}
        ${_colHtml('優先度', 'priority', prioItems, { filterKey:'prio', sortable:false })}
        ${mkPrCol()}
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
      // tag
      const TB  = window.TB_VALUES || ['トップ','ボトム','スタンディング'];
      const CAT = (window.CATEGORIES || []).map(c => c.name);
      const POS = (window.POSITIONS  || []).map(p => p.ja);
      const TAGS = _collectTags();

      const tbCtx = _ctxVideos('tbNew');
      const tbItems = TB.map(n => ({
        name:n, cnt: tbCtx.filter(v => (v.tb||[]).includes(n)).length, sel: !!f.tbNew?.has(n)
      }));
      const catCtx = _ctxVideos('cat');
      const catItems = CAT.map(n => ({
        name:n, cnt: catCtx.filter(v => (v.cat||[]).includes(n)).length, sel: !!f.cat?.has(n)
      }));
      const posCtx = _ctxVideos('posNew');
      const posItems = POS.map(n => ({
        name:n, cnt: posCtx.filter(v => (v.pos||[]).includes(n)).length, sel: !!f.posNew?.has(n)
      }));
      const tagsCtx = _ctxVideos('tags');
      const tagItems = TAGS.map(n => ({
        name:n, cnt: tagsCtx.filter(v => (v.tags||[]).includes(n)).length, sel: !!f.tags?.has(n)
      }));

      content.innerHTML = `<div class="uni-cols">
        ${_colHtml('T/B', 'tb', tbItems, { filterKey:'tbNew' })}
        ${_colHtml('カテゴリ', 'cat', catItems, { filterKey:'cat' })}
        ${_colHtml('ポジション', 'pos', posItems, { filterKey:'posNew' })}
        ${_colHtml('#タグ', 'tags', tagItems, { filterKey:'tags' })}
      </div>`;
    }

    // ── Pills ──
    const pills = [];
    if (window.favOnly)     pills.push(['@fav',     '★ Fav']);
    if (window.unwOnly)     pills.push(['@unw',     'Unseen']);
    if (window.watchedOnly) pills.push(['@wat',     '視聴済み']);
    if (window.bmOnly)      pills.push(['@bm',      '🔖 BM']);
    if (window.memoOnly)    pills.push(['@memo',    '💬 メモ']);
    if (window.imgOnly)     pills.push(['@img',     '🖼 画像あり']);
    if (window.prBucket) {
      const map = { '0':'未練習','1+':'🥋 1+','3+':'🥋 3+','5+':'🥋 5+','10+':'🥋 10+' };
      pills.push(['@prB', map[window.prBucket] || window.prBucket]);
    }
    if (window.prDate) {
      const map = { week:'今週練習',month:'今月練習',stale:'🗓 30日+',never:'未練習' };
      pills.push(['@prD', map[window.prDate] || window.prDate]);
    }
    [...(f.status||[])].forEach(v => pills.push(['status', v]));
    [...(f.prio  ||[])].forEach(v => pills.push(['prio',   v]));
    [...(f.platform||[])].forEach(v => pills.push(['platform', v]));
    [...(f.channel ||[])].forEach(v => pills.push(['channel',  v]));
    [...(f.playlist||[])].forEach(v => pills.push(['playlist', v]));
    [...(f.tbNew||[])].forEach(v => pills.push(['tbNew', v]));
    [...(f.cat  ||[])].forEach(v => pills.push(['cat',   v]));
    [...(f.posNew||[])].forEach(v => pills.push(['posNew', v]));
    [...(f.tags ||[])].forEach(v => pills.push(['tags',  v]));

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
    upd('uni-state-badge', bd.state);
    upd('uni-src-badge',   bd.src);
    upd('uni-tag-badge',   bd.tag);
    // 既存の v4 バッジにもタグ数を反映
    upd('fs-v4-btn-badge', bd.tag);
  }

  // ── グローバル公開 ──
  window.uniOpen = function (tab) {
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
    const f = window.filters || {};
    // 擬似ブール系
    if (key === '@fav')      { window.togFav?.();     _render(); return; }
    if (key === '@unw')      { window.togUnw?.();     _render(); return; }
    if (key === '@wat')      { window.togWatched?.(); _render(); return; }
    if (key === '@bm')       { window.togBm?.();      _render(); return; }
    if (key === '@memo')     { window.togMemo?.();    _render(); return; }
    if (key === '@img')      { window.togImg?.();     _render(); return; }
    if (key === '@prB')      { window.prBucket = (window.prBucket === val) ? null : val; window.AF?.(); window.buildSidebarFovRows?.(); _render(); return; }
    if (key === '@prD')      { window.prDate   = (window.prDate   === val) ? null : val; window.AF?.(); window.buildSidebarFovRows?.(); _render(); return; }
    // Set系
    if (!f[key]) f[key] = new Set();
    f[key].has(val) ? f[key].delete(val) : f[key].add(val);
    window.AF?.();
    window.buildSidebarFovRows?.();
    _render();
  };
  window.uniClearAll = function () {
    window.clearAll?.();
    _render();
  };
  window.uniSyncBadges = function () { _syncSidebarBadges(_badges()); };
})();
