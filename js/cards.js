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
  if (window.__pmark && !window.__perf?.cards) window.__pmark('cards');
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
              : isGD ? `https://drive.google.com/thumbnail?id=${gdId}&sz=w320`
              : isX  ? (v.thumb || '')
              : (v.thumb && !v.thumb.includes('vumbnail.com') ? v.thumb : '');
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
  const vid   = v.id;
  const bulkMode = window.bulkMode || false;
  const selIds   = window.selIds   || new Set();
  // マーク（★・Next・ドリル）と習得の専用ボタンは v52.876 で廃止（普通のタグになった。タグ1〜4の枠に入れればバッジで出る）
  // カウントの表示を切り替える設定（フィルター設定）は v52.882 で廃止。常に出す
  const showRank   = true;
  const _memoForPreview = v.memo
    ? v.memo.replace(/<img[^>]*>/gi, '').replace(/<div[^>]*>\s*<\/div>/gi, '').trim()
    : '';
  const memoPreview = _memoForPreview ? `<div class="card-memo-preview" onclick="event.stopPropagation();cardShowMemo('${vid}')">${_memoForPreview}</div>` : '';
  const aiBar = v.ai ? `<div class="ai-bar"><span style="font-size:12px">✨</span><div class="ai-bar-text">${v.ai}</div></div>` : '';
  // 🆕 4層タグバッジ (新スキーマ: tb/cat/pos/tags)
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _tsV = key => { const ts = window.tagSettings || []; const s = ts.find(t => t.key === key); return s ? s.visible !== false : true; };
  // タグ1 も付いている値をそのまま出す。以前は組み込みの3つ（トップ/ボトム/スタンディング）以外を
  // 黙って隠していたので、ユーザーが自分で足した値がカードに出なかった（v52.827）。
  // タグ1〜4の枠の順に並べる（段階2d。枠を入れ替えるとカードも付いてくる）。
  // 見た目は保存場所ごと（今の4つは今までどおり。新しいタググループは #なしの淡い色）。
  const _BADGE = {
    tb:   t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(140,80,255,.14);color:var(--text);font-weight:700">${_esc(t)}</span>`,
    cat:  t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(80,160,255,.14);color:var(--text)">📂${_esc(t)}</span>`,
    pos:  t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(80,200,140,.14);color:var(--text)">📍${_esc(t)}</span>`,
    tags: t => `<span style="padding:2px 7px;border-radius:10px;background:rgba(255,200,80,.14);color:var(--text2)">#${_esc(t)}</span>`,
    map:  t => `<span style="padding:2px 7px;border-radius:10px;background:var(--surface2);color:var(--text2)">${_esc(t)}</span>`,
  };
  const _R = window.tagRegistry;
  const _slotInfo = _R ? _R.slotInfo() : ['tb','cat','pos','tags'].map(f => ({ id: 'f_' + f, store: f }));
  const _badgeHtml = _slotInfo.map(s => {
    if (!s || !_BADGE[s.store]) return '';          // 空の枠は出さない
    if (s.store !== 'map' && !_tsV(s.store)) return '';
    let vals = _R ? _R.valuesOf(v, s.id) : (Array.isArray(v[s.store]) ? v[s.store] : []);
    if (s.store === 'tags') vals = vals.slice(0, 8);
    return vals.map(_BADGE[s.store]).join('');
  }).join('');
  const v4badges = _badgeHtml ? `
    <div class="v4-badges" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px 4px;font-size:10px;border-top:1px solid var(--border)">
      ${_badgeHtml}
    </div>` : '';
  const chName = v.channel ? `<div class="card-ch">${v.channel}</div>` : '';
  const plName = v.pl ? `<div class="card-pl">📋 ${v.pl}</div>` : '';
  const cardMeta = (chName || plName) ? `<div class="card-meta">${chName}${plName}</div>` : '';
  // 旧「💬 一言解説」の表示は廃止（2026-09-20）。AI要約をやめたので更新されない。
  // データ（v.aiDesc）は消していないので、出したくなれば1行で戻せる。
  const aiDescLine = '';
  // 練習回数のバッジは v52.890 で廃止（古いカウンター。数えるのはカスタム列の「± カウンター」）
  const cntBadges = '';
  const vDot = v.verified ? '<div class="verify-dot verified"></div>'
             : v.ai       ? '<div class="verify-dot ai-unverified"></div>' : '';
  // プレビュー（v52.896）: サムネの中で音なし再生。X は埋め込みで再生できないので出さない
  const pvBtn = isX ? '' : `<button class="card-pv-btn" onclick="event.stopPropagation();wkCardPreview('${vid}')" title="プレビュー">▶ プレビュー</button>`;
  const btnMemo = `<button class="ca-btn ${v.memo?'ca-memo-on':''}" onclick="event.stopPropagation();cardShowMemo('${vid}')" title="メモ">💬 メモ</button>`;
  return `<div class="card-wrap" id="wrap-${vid}"><div class="card" id="card-${vid}" data-id="${vid}" data-emb="${emb.replace(/"/g,'&quot;')}" data-ext="${ext.replace(/"/g,'&quot;')}" data-plat="${isYT?'yt':isGD?'gd':isX?'x':'vm'}">${vDot}<div class="card-sel-ov ${bulkMode?'vis':''}" id="sel-${vid}"><div class="sel-circle ${selIds.has(vid)?'chk':''}" onclick="event.stopPropagation();togSel('${vid}')">${selIds.has(vid)?'✓':''}</div></div><div class="card-main" id="cm-${vid}"><div class="card-thumb" id="thumb-${vid}" onclick="(window.bulkMode||false)?togSel('${vid}'):openVPanel('${vid}')"><img src="${thumb}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="width:100%;height:100%;display:none;align-items:center;justify-content:center;font-size:26px">▶️</div><div class="play-ov"><div class="play-btn">▶</div></div><div class="pb ${isYT?'pb-yt':isGD?'pb-gd':isX?'pb-x':'pb-vm'}">${isYT?'YT':isGD?'GD':isX?'𝕏':'Vimeo'}</div><div class="dur-badge">${_fmtDur(v.duration)}</div>${pvBtn}</div><div class="card-body"><div class="card-title" style="">${v.title}</div>${cardMeta}${aiDescLine}</div></div>${aiBar}${cntBadges}${v4badges}${memoPreview}<div class="card-actions">${btnMemo}<button class="ca-btn danger" onclick="event.stopPropagation();if(confirm('アーカイブしますか？'))archOne('${vid}')" title="アーカイブ">📦 アーカイブ</button></div></div></div>`;
}


// ═══ カードのプレビュー（v52.896） ═══
// サムネの上に音なしの埋め込みを重ねるだけ。サムネ（img）や data-emb は触らない
// （動画パネル・サムネの読み込み直しがそれを読むため）。データには一切書かない。
// 同時に1本だけ。一覧を描き直すと重ねたものごと消えるので、それで閉じたことにする。
let _pvId = null;
function _pvUrl(card) {
  const emb = card.dataset.emb || '';
  const plat = card.dataset.plat;
  if (!emb || plat === 'x') return '';
  if (plat === 'yt') return emb + '&mute=1&playsinline=1';
  if (plat === 'vm') return emb + '&muted=1&playsinline=1';
  return emb;   // Drive は自動再生・音なしを指定できない（▶ を押せば再生）
}
export function wkCardPreviewStop() {
  if (_pvId) document.getElementById('pv-' + _pvId)?.remove();
  _pvId = null;
}
export function wkCardPreview(vid) {
  if (window.bulkMode) return;
  const same = _pvId === vid;
  wkCardPreviewStop();
  if (same) return;
  const card  = document.getElementById('card-' + vid);
  const thumb = document.getElementById('thumb-' + vid);
  const url = card && _pvUrl(card);
  if (!thumb || !url) return;
  const layer = document.createElement('div');
  layer.className = 'card-pv-layer';
  layer.id = 'pv-' + vid;
  layer.onclick = e => e.stopPropagation();   // 重ねた上の操作で動画パネルを開かない
  layer.innerHTML = `<iframe src="${url.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><button class="card-pv-close" title="プレビューを閉じる">✕</button>`;
  layer.querySelector('.card-pv-close').onclick = e => { e.stopPropagation(); wkCardPreviewStop(); };
  thumb.appendChild(layer);
  _pvId = vid;
}
window.wkCardPreview = wkCardPreview;
window.wkCardPreviewStop = wkCardPreviewStop;
