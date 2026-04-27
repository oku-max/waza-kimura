// ═══ WAZA KIMURA — 動画カード描画 v2 ═══

const BATCH_SIZE = 60;
let _pendingList = [];
let _pendingCid = '';
let _renderedCount = 0;
let _scrollObserver = null;

export function renderCards(list, cid) {
  const c = document.getElementById(cid);
  if (!list.length) {
    c.innerHTML = '<div class="empty"><div class="e">🔍</div><p>動画が見つかりませんでした</p></div>';
    _cleanupObserver();
    return;
  }
  // 最初のバッチだけ描画
  const first = list.slice(0, BATCH_SIZE);
  c.innerHTML = first.map(v => cardHTML(v)).join('');
  _renderedCount = first.length;
  _pendingList = list;
  _pendingCid = cid;

  // 残りがあればスクロール監視で追加読み込み
  _cleanupObserver();
  if (list.length > BATCH_SIZE) {
    const sentinel = document.createElement('div');
    sentinel.id = 'cards-sentinel';
    sentinel.style.height = '1px';
    c.appendChild(sentinel);
    _scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) _loadMore();
    }, { rootMargin: '400px' });
    _scrollObserver.observe(sentinel);
  }
}

function _loadMore() {
  const c = document.getElementById(_pendingCid);
  if (!c || _renderedCount >= _pendingList.length) { _cleanupObserver(); return; }
  const next = _pendingList.slice(_renderedCount, _renderedCount + BATCH_SIZE);
  const sentinel = document.getElementById('cards-sentinel');
  const frag = document.createDocumentFragment();
  const tmp = document.createElement('div');
  tmp.innerHTML = next.map(v => cardHTML(v)).join('');
  while (tmp.firstChild) frag.appendChild(tmp.firstChild);
  if (sentinel) c.insertBefore(frag, sentinel);
  else c.appendChild(frag);
  _renderedCount += next.length;
  if (_renderedCount >= _pendingList.length) _cleanupObserver();
}

function _cleanupObserver() {
  if (_scrollObserver) { _scrollObserver.disconnect(); _scrollObserver = null; }
  const s = document.getElementById('cards-sentinel');
  if (s) s.remove();
}

function _tsVisible(key) {
  const s = (window.tagSettings || []).find(t => t.key === key);
  return !s || s.visible;
}

function _fmtDur(secs) {
  if (!secs || secs <= 0) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `▶ ${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `▶ ${m}:${String(s).padStart(2,'0')}`;
}

export function cardHTML(v) {
  v.tb = v.tb || []; v.cat = v.cat || []; v.pos = v.pos || []; v.tags = v.tags || [];
  v.pt = v.pt || v.src || 'youtube';
  const isYT  = v.pt === 'youtube';
  const isGD  = v.pt === 'gdrive';
  const isX   = v.pt === 'x';
  const ytId  = v.ytId || (isYT ? v.id : '');
  const gdId  = isGD ? (v.id || '').replace('gd-', '') : '';
  const vmId  = (!isYT && !isGD && !isX) ? (v.id || '').replace('yt-', '') : '';
  const xId   = isX ? (v.xTweetId || (v.id || '').replace('x-', '')) : '';
  const thumb = isYT ? (v.thumb || `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`)
              : isGD ? (v.thumb || `https://drive.google.com/thumbnail?id=${gdId}&sz=w320`)
              : isX  ? (v.thumb || '')
              : (v.thumb || `https://vumbnail.com/${vmId}.jpg`);
  const emb   = isYT ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
              : isGD ? `https://drive.google.com/file/d/${gdId}/preview`
              : isX  ? `https://platform.twitter.com/embed/Tweet.html?id=${xId}&lang=ja&theme=light&dnt=true&frame=false&hideCard=false&hideThread=false`
              : `https://player.vimeo.com/video/${vmId}?${v.vmHash ? `h=${v.vmHash}&` : ''}autoplay=1`;
  const ext   = isYT ? `https://www.youtube.com/watch?v=${ytId}`
              : isGD ? `https://drive.google.com/file/d/${gdId}/view`
              : isX  ? `https://x.com/${v.xUser || 'i'}/status/${xId}`
              : `https://vimeo.com/${vmId}${v.vmHash ? '/' + v.vmHash : ''}`;
  const pc    = v.prio === '今すぐ' ? 'p1' : v.prio === 'そのうち' ? 'p2' : 'p3';
  const pe    = v.prio === '今すぐ' ? '🔴' : v.prio === 'そのうち' ? '🟡' : '⚪';
  const _st   = v.status==='把握'?'理解':v.status==='習得中'?'練習中':v.status||'未着手';
  const sc    = _st === '理解' ? 's1' : _st === '練習中' ? 's2' : _st === 'マスター' ? 's3' : 's0';
  const _sNum = {'未着手':'1.','理解':'2.','練習中':'3.','マスター':'4.'};
  const _sIco = {'未着手':'📋','理解':'📖','練習中':'🔄','マスター':'⭐'};
  const se    = (_sNum[_st]||'') + (_sIco[_st]||'') + ' ' + _st;
  const vid   = v.id;
  const bulkMode = window.bulkMode || false;
  const selIds   = window.selIds   || new Set();
  const _fcv      = window.filterColVis || {};
  const showMark   = _fcv.mark   !== false;
  const showStatus = _fcv.status !== false;
  const showRank   = _fcv.rank   !== false;
  const memoPreview = (showMark && v.memo) ? `<div class="card-memo-preview" onclick="event.stopPropagation();cardShowMemo('${vid}')">${v.memo}</div>` : '';
  const aiBar = v.ai ? `<div class="ai-bar"><span style="font-size:12px">✨</span><div class="ai-bar-text">${v.ai}</div></div>` : '';
  // 🆕 4層タグバッジ (新スキーマ: tb/cat/pos/tags)
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _tsV = key => { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; };
  const newTb   = _tsV('tb')   && Array.isArray(v.tb)   ? v.tb.filter(t => t==='トップ'||t==='ボトム'||t==='スタンディング') : [];
  const newCat  = _tsV('cat')  && Array.isArray(v.cat)  ? v.cat  : [];
  const newPos  = _tsV('pos')  && Array.isArray(v.pos)  ? v.pos  : [];
  const newTags = _tsV('tags') && Array.isArray(v.tags) ? v.tags : [];
  const lockIco = v.tbLocked ? '🔒' : '';
  const v4badges = (newTb.length || newCat.length || newPos.length || newTags.length) ? `
    <div class="v4-badges" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px 4px;font-size:10px;border-top:1px solid var(--border)">
      ${newTb.map(t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(140,80,255,.14);color:var(--text);font-weight:700;cursor:pointer" onclick="event.stopPropagation();toggleTbLock('${vid}');window.AF?.()" title="クリックでTBロック切替">${_esc(t)}${lockIco}</span>`).join('')}
      ${newCat.map(c => `<span style="padding:2px 7px;border-radius:10px;background:rgba(80,160,255,.14);color:var(--text)">📂${_esc(c)}</span>`).join('')}
      ${newPos.map(p => `<span style="padding:2px 7px;border-radius:10px;background:rgba(80,200,140,.14);color:var(--text)">📍${_esc(p)}</span>`).join('')}
      ${newTags.slice(0,8).map(t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(255,200,80,.14);color:var(--text2)">#${_esc(t)}</span>`).join('')}
    </div>` : '';
  const chName = v.channel ? `<div class="card-ch">${v.channel}</div>` : '';
  const plName = v.pl ? `<div class="card-pl">📋 ${v.pl}</div>` : '';
  const cardMeta = (chName || plName) ? `<div class="card-meta">${chName}${plName}</div>` : '';
  // カウンターバッジ (B案: 下段インライン)
  const _pc = v.practice || 0;
  const _ago = v.lastPracticed ? (window.vpCntFormatAgo?.( v.lastPracticed) || '') : '';
  const cntBadges = showRank ? `<div class="card-cnt" style="display:flex;gap:10px;padding:5px 10px 7px;font-size:10px;font-weight:700;align-items:center;line-height:1">
    <span style="display:inline-flex;align-items:center;gap:3px;color:${_pc>0?'#e8590c':'var(--text3)'};${_pc===0?'opacity:.55':''}">🥋 ${_pc||'未'}</span>
    <span style="margin-left:auto;font-size:9px;color:var(--text3);font-weight:600">${_ago||'—'}</span>
  </div>` : '';
  const vDot = v.verified ? '<div class="verify-dot verified"></div>'
             : v.ai       ? '<div class="verify-dot ai-unverified"></div>' : '';
  const btnFav  = showMark   ? `<button class="ca-btn" onclick="event.stopPropagation();qFav('${vid}');window.AF?.()" title="Fav" style="${v.fav?'color:#d4a017;border-color:#d4a017':''}">${v.fav?'★':'☆'} Fav</button>` : '';
  const btnNext = showMark   ? `<button class="ca-btn" onclick="event.stopPropagation();qNext('${vid}');window.AF?.()" title="Next" style="${v.next?'color:#e8590c;border-color:#e8590c':''}">${v.next?'🎯':'○'} Next</button>` : '';
  const btnStat = showStatus ? `<button class="ca-btn" onclick="event.stopPropagation();cardCycleProg('${vid}',this)" data-prog="${_st}">${se}</button>` : '';
  const btnMemo = showMark   ? `<button class="ca-btn ${v.memo?'ca-memo-on':''}" onclick="event.stopPropagation();cardShowMemo('${vid}')" title="メモ">💬 メモ</button>` : '';
  return `<div class="card-wrap" id="wrap-${vid}"><div class="card" id="card-${vid}" data-id="${vid}" data-emb="${emb.replace(/"/g,'&quot;')}" data-ext="${ext.replace(/"/g,'&quot;')}" data-plat="${isYT?'yt':isGD?'gd':isX?'x':'vm'}">${vDot}<div class="card-sel-ov ${bulkMode?'vis':''}" id="sel-${vid}"><div class="sel-circle ${selIds.has(vid)?'chk':''}" onclick="event.stopPropagation();togSel('${vid}')">${selIds.has(vid)?'✓':''}</div></div><div class="card-main" id="cm-${vid}"><div class="card-thumb" id="thumb-${vid}" onclick="(window.bulkMode||false)?togSel('${vid}'):openVPanel('${vid}')"><img src="${thumb}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="width:100%;height:100%;display:none;align-items:center;justify-content:center;font-size:26px">▶️</div><div class="play-ov"><div class="play-btn">▶</div></div><div class="pb ${isYT?'pb-yt':isGD?'pb-gd':isX?'pb-x':'pb-vm'}">${isYT?'YT':isGD?'GD':isX?'𝕏':'Vimeo'}</div><div class="dur-badge">${_fmtDur(v.duration)}</div></div><div class="card-body"><div class="card-title" style="">${v.title}</div>${cardMeta}</div></div>${aiBar}${cntBadges}${v4badges}${memoPreview}<div class="card-actions">${btnFav}${btnNext}${btnStat}${btnMemo}<button class="ca-btn danger" onclick="event.stopPropagation();archOne('${vid}')" title="アーカイブ">📦 アーカイブ</button></div></div></div>`;
}

