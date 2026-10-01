// ═══ WAZA KIMURA — 動画カード描画 v2 ═══

const BATCH_SIZE = 60;
let _pendingList = [];
let _pendingCid = '';
let _renderedCount = 0;
let _scrollObserver = null;

export function renderCards(list, cid) {
  const c = document.getElementById(cid);
  // 0本の表示はテーブル表示（#org-empty）と同じ中身・同じ置き場所（v52.921）。
  // 一覧の余白と段組みを外して、帯のすぐ下・幅いっぱいの中央に出す
  c.classList.toggle('is-empty', !list.length);
  if (!list.length) {
    c.innerHTML = '<div class="org-empty"><div style="font-size:28px;margin-bottom:8px">🔍</div><div>動画が見つかりませんでした</div></div>';
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
  // プレビュー（v52.896）: サムネの中で音なし再生。X は埋め込みで再生できないので出さない。
  // ボタンは文字だけ（▶ を付けない。長さのバッジの ▶ と2つ並んで分かりにくい。v52.903 オーナー）。
  // 置き場所はサムネの中ではなく真下（v52.904・オーナー決定 G②）。サムネを押すのは今までどおり動画パネル
  const pvBtn = isX ? '' : `<button class="card-pv-btn" id="pvb-${vid}" onclick="event.stopPropagation();wkCardPreview('${vid}')" title="プレビュー">プレビュー</button>`;
  const btnMemo = `<button class="ca-btn ${v.memo?'ca-memo-on':''}" onclick="event.stopPropagation();cardShowMemo('${vid}')" title="メモ">💬 メモ</button>`;
  return `<div class="card-wrap" id="wrap-${vid}"><div class="card" id="card-${vid}" data-id="${vid}" data-emb="${emb.replace(/"/g,'&quot;')}" data-ext="${ext.replace(/"/g,'&quot;')}" data-plat="${isYT?'yt':isGD?'gd':isX?'x':'vm'}">${vDot}<div class="card-sel-ov ${bulkMode?'vis':''}" id="sel-${vid}"><div class="sel-circle ${selIds.has(vid)?'chk':''}" onclick="event.stopPropagation();togSel('${vid}')">${selIds.has(vid)?'✓':''}</div></div><div class="card-main" id="cm-${vid}"><div class="card-tcol"><div class="card-thumb" id="thumb-${vid}" onclick="(window.bulkMode||false)?togSel('${vid}'):openVPanel('${vid}')"><img src="${thumb}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="width:100%;height:100%;display:none;align-items:center;justify-content:center;font-size:26px">▶️</div><div class="play-ov"><div class="play-btn">▶</div></div><div class="pb ${isYT?'pb-yt':isGD?'pb-gd':isX?'pb-x':'pb-vm'}">${isYT?'YT':isGD?'GD':isX?'𝕏':'Vimeo'}</div><div class="dur-badge">${_fmtDur(v.duration)}</div></div>${pvBtn}</div><div class="card-body"><div class="card-title" style="">${v.title}</div>${cardMeta}${aiDescLine}</div></div>${aiBar}${cntBadges}${v4badges}${memoPreview}<div class="card-actions">${btnMemo}<button class="ca-btn danger" onclick="event.stopPropagation();if(confirm('アーカイブしますか？'))archOne('${vid}')" title="アーカイブ">📦 アーカイブ</button></div></div></div>`;
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
  // enablejsapi / api=1: 見ていた位置を受け取るため（「開く（0:42 から）」）
  if (plat === 'yt') return emb + '&mute=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  if (plat === 'vm') return emb + '&muted=1&playsinline=1&api=1';
  return emb;   // Drive は自動再生・音なしを指定できない（▶ を押せば再生）
}
// サムネがこれより狭いときは、プレビュー中だけカードの幅いっぱいに広げる（スマホでは操作できないため）
const PV_WIDE_BELOW = 320;
// Drive の埋め込みの上の黒い帯のぶん、枠を高くする（実測 PC 約51px・スマホ 約60px。足りないと映像が切れ、
// 多いぶんは黒い余白になるだけなので、多めにとる）
const GD_HEAD = 64;
function _pvFitGd(card, thumb) {
  thumb.style.setProperty('height', Math.round(thumb.clientWidth * 9 / 16 + GD_HEAD) + 'px', 'important');
}
window.addEventListener('resize', () => {
  if (!_pvId) return;
  const card = document.getElementById('card-' + _pvId), thumb = document.getElementById('thumb-' + _pvId);
  if (card && thumb && card.classList.contains('pv-gd')) _pvFitGd(card, thumb);
});
// ── プレビュー中の［閉じる｜開く（0:42 から）］（v52.905・オーナー決定 H3 左右均等）──
// 見ていた位置: YouTube・Vimeo は埋め込みが知らせてくる位置、Drive の <video> は currentTime。
// 分からない（Drive の埋め込み等）ときは「開く」だけ（位置を出さない・頭からでなく前回の続きのまま）。
let _pvTime = null, _pvTick = null;
function _pvFmt(sec) {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
function _pvNow() {
  const v = _pvId && document.querySelector(`#pv-${CSS.escape(_pvId)} video`);
  if (v && isFinite(v.currentTime) && v.currentTime > 0) return v.currentTime;
  return _pvTime;
}
function _pvGoLabel() { const t = _pvNow(); return t >= 1 ? `開く（${_pvFmt(t)} から）` : '開く'; }
window.addEventListener('message', e => {
  if (!_pvId) return;
  const o = String(e.origin || '');
  if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)$/.test(o)) return;
  const f = document.querySelector(`#pv-${CSS.escape(_pvId)} iframe`);
  if (!f || e.source !== f.contentWindow) return;   // 今プレビューしている埋め込みからだけ受け取る
  let d = e.data; try { if (typeof d === 'string') d = JSON.parse(d); } catch (err) { return; }
  if (d?.info && typeof d.info.currentTime === 'number') _pvTime = d.info.currentTime;           // YouTube
  if (d?.event === 'timeupdate' && typeof d.data?.seconds === 'number') _pvTime = d.data.seconds; // Vimeo
  if (d?.event === 'ready' && o.includes('vimeo')) { try { f.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), o); } catch (err) {} }
});
function _pvListen(f) {
  if (!f) return;
  f.addEventListener('load', () => {
    try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'wkpv' }), 'https://www.youtube.com'); } catch (e) {}
    try { f.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), 'https://player.vimeo.com'); } catch (e) {}
  });
}
function _pvShowPair(vid) {
  const b = document.getElementById('pvb-' + vid);
  if (!b || document.getElementById('pvp-' + vid)) return;
  b.hidden = true;
  const pair = document.createElement('div');
  pair.className = 'card-pv-pair';
  pair.id = 'pvp-' + vid;
  pair.innerHTML = `<button class="card-pv-close2">閉じる</button><button class="card-pv-go">${_pvGoLabel()}</button>`;
  pair.onclick = e => e.stopPropagation();
  pair.querySelector('.card-pv-close2').onclick = e => { e.stopPropagation(); wkCardPreviewStop(); };
  pair.querySelector('.card-pv-go').onclick = e => {
    e.stopPropagation();
    const t = _pvNow();
    wkCardPreviewStop();
    if (window.vpOpenAt) window.vpOpenAt(vid, t || 0); else window.openVPanel?.(vid);
  };
  b.after(pair);
  clearInterval(_pvTick);
  _pvTick = setInterval(() => {
    const g = document.querySelector(`#pvp-${CSS.escape(vid)} .card-pv-go`);
    if (!g || _pvId !== vid) { clearInterval(_pvTick); return; }
    const l = _pvGoLabel(); if (g.textContent !== l) g.textContent = l;
  }, 500);
}
export function wkCardPreviewStop() {
  clearInterval(_pvTick); _pvTime = null;
  if (_pvId) {
    document.getElementById('pvp-' + _pvId)?.remove();
    const b0 = document.getElementById('pvb-' + _pvId); if (b0) b0.hidden = false;
    const layer = document.getElementById('pv-' + _pvId);
    const vEl = layer?.querySelector('video');
    if (vEl) { vEl.pause(); vEl.removeAttribute('src'); vEl.load(); }   // 読み込みも止める
    layer?.remove();
    const b = document.getElementById('pvb-' + _pvId); if (b) { b.classList.remove('on'); b.textContent = 'プレビュー'; }
    document.getElementById('card-' + _pvId)?.classList.remove('pv-wide', 'pv-gd');
    document.getElementById('thumb-' + _pvId)?.style.removeProperty('height');
  }
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
  if (thumb.clientWidth < PV_WIDE_BELOW) card.classList.add('pv-wide');
  layer.className = 'card-pv-layer';
  // Drive は、動画パネルと同じ経路（/api/drive 経由の <video>）で再生できるならそれを使う。
  // Drive の埋め込み（iframe）は上の黒い帯・再生前の拡大表示・自動再生なしを外から変えられない
  // （v52.898〜900 で3回外した）。<video> なら帯が無く、音なしで自動再生できる。
  // この端末に Drive の認証がまだ無ければ、動画パネルと同じ「Googleで認証して再生」を出す（v52.902）。
  // v52.901 は認証が無いと黙って埋め込みに戻していたので、スマホでは何も変わらなかった。
  const isGd = card.dataset.plat === 'gd';
  const gdToken = isGd ? window.getDriveTokenIfAvailable?.() : null;
  const gdFile = vid.replace(/^gd-/, '');
  const gdVideo = tk => `<video src="/api/drive?fileId=${encodeURIComponent(gdFile)}&token=${encodeURIComponent(tk)}" muted autoplay playsinline webkit-playsinline controls></video>`;
  layer.id = 'pv-' + vid;
  layer.onclick = e => e.stopPropagation();   // 重ねた上の操作で動画パネルを開かない
  const player = gdToken ? gdVideo(gdToken)
    : isGd ? `<div class="card-pv-auth"></div>`
    : `<iframe src="${url.replace(/"/g, '&quot;')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  layer.innerHTML = `${player}<button class="card-pv-close" title="プレビューを閉じる">✕</button>`;
  layer.querySelector('.card-pv-close').onclick = e => { e.stopPropagation(); wkCardPreviewStop(); };
  thumb.appendChild(layer);
  _pvId = vid;
  _pvListen(layer.querySelector('iframe'));
  _pvShowPair(vid);
  const authBox = layer.querySelector('.card-pv-auth');
  if (authBox && window._showGDriveAuthUI) {
    window._showGDriveAuthUI(authBox, gdFile, tk => {
      if (_pvId !== vid || !layer.isConnected) return;
      authBox.outerHTML = gdVideo(tk);
      _pvWatchGd();
    });
  } else if (authBox) {
    authBox.replaceWith(Object.assign(document.createElement('iframe'), { src: url, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullscreen: true }));
    card.classList.add('pv-gd'); _pvFitGd(card, thumb);
  }
  _pvWatchGd();
  // ログインの期限切れ等で <video> が読めなければ、埋め込みに切り替える（黙って黒いままにしない）
  function _pvWatchGd() { layer.querySelector('video')?.addEventListener('error', () => {
    if (_pvId !== vid || !layer.isConnected) return;
    card.classList.add('pv-gd'); _pvFitGd(card, thumb);
    layer.querySelector('video').replaceWith(Object.assign(document.createElement('iframe'), {
      src: url, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowFullscreen: true,
    }));
  }); }
  if (card.classList.contains('pv-wide')) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
window.wkCardPreview = wkCardPreview;
window.wkCardPreviewStop = wkCardPreviewStop;
