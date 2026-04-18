// ═══ WAZA KIMURA — YouTube Search タブ ═══
// /api/yt-search (Vercel serverless) を経由してYouTube Data API v3を呼び出す

import { showToast } from './ui.js';
import { currentUser, saveUserData } from './firebase.js';

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let _srMode      = 'video';   // 'video' | 'playlist'
let _srDuration  = 'any';     // 'any' | 'medium' | 'long'
let _srNextToken = '';        // YouTube nextPageToken
let _srLoading   = false;
let _srItems     = [];        // 現在表示中の結果
let _srOpenItem  = null;      // VPanelで開いている検索結果
const _addedSet  = new Set(); // 追加済みYouTube ID

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
export function ytSrInit() {
  // 既にライブラリにある YouTube ID をセットに反映
  _addedSet.clear();
  (window.videos || []).forEach(v => { if (v.ytId) _addedSet.add(v.ytId); });
  // 検索結果を再レンダリング（追加済みバッジを反映）
  if (_srItems.length > 0) _renderCards(_srItems);
}

// ────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────
export async function ytSrSearch() {
  const input = document.getElementById('yt-sr-input');
  const q = input?.value?.trim();
  if (!q) { showToast('🔍 検索ワードを入力してください'); return; }

  _srNextToken = '';
  _srLoading   = true;
  _showLoading();

  try {
    const data = await _callApi(q, _srMode, '');
    _srItems = data.items || [];
    _srNextToken = data.nextPageToken || '';
    _renderCards(_srItems);
    _updateHdr(_srItems.length);
  } catch (e) {
    _showError(e.message);
  } finally {
    _srLoading = false;
  }
}

// キーボード Enter でも検索
export function ytSrKeydown(e) {
  if (e.key === 'Enter') ytSrSearch();
}

// ────────────────────────────────────────
// MODE (動画 / プレイリスト)
// ────────────────────────────────────────
export function ytSrSetMode(mode) {
  _srMode = mode;
  document.getElementById('yt-sr-tab-video')?.classList.toggle('active', mode === 'video');
  document.getElementById('yt-sr-tab-playlist')?.classList.toggle('active', mode === 'playlist');
  // プレイリストモードのときはdurationフィルタを非表示
  const durRow = document.getElementById('yt-sr-dur-row');
  if (durRow) durRow.style.display = mode === 'playlist' ? 'none' : '';
  // クエリがあれば再検索
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (q) ytSrSearch();
}

// ────────────────────────────────────────
// DURATION FILTER (動画長さ)
// ────────────────────────────────────────
export function ytSrSetDuration(d) {
  _srDuration = d;
  ['any', 'medium', 'long'].forEach(dur => {
    document.getElementById('yt-sr-dur-' + dur)?.classList.toggle('active', dur === d);
  });
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (q) ytSrSearch();
}

// ────────────────────────────────────────
// API呼び出し
// ────────────────────────────────────────
async function _callApi(q, type, pageToken) {
  const params = new URLSearchParams({ q, type, maxResults: '25' });
  if (pageToken) params.set('pageToken', pageToken);
  if (type === 'video' && _srDuration !== 'any') params.set('videoDuration', _srDuration);

  const res  = await fetch('/api/yt-search?' + params);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data;
}

// ────────────────────────────────────────
// RENDER
// ────────────────────────────────────────
function _renderCards(items) {
  const wrap = document.getElementById('yt-sr-cards-wrap');
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = `<div class="yt-sr-empty">
      <div class="yt-sr-empty-icon">🔍</div>
      <div class="yt-sr-empty-ttl">結果が見つかりませんでした</div>
      <div class="yt-sr-empty-sub">別のキーワードで試してください</div>
    </div>`;
    return;
  }

  // カード描画
  const cardsHtml = items.map((item, i) => {
    const isPlaylist = !!item.id?.playlistId;
    const ytId   = item.id?.videoId || item.id?.playlistId || '';
    const s      = item.snippet || {};
    const thumb  = s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '';
    const title  = _esc(s.title || '');
    const ch     = _esc(s.channelTitle || '');
    const date   = s.publishedAt ? new Date(s.publishedAt).toLocaleDateString('ja-JP', { year:'numeric', month:'short', day:'numeric' }) : '';
    const isAdded = _addedSet.has(ytId);

    const badgeHtml = isAdded
      ? `<div class="yt-sr-added-badge">✓ 追加済</div>`
      : `<button class="yt-sr-plus" onclick="event.stopPropagation();window.ytSrQuickAdd('${ytId}',${i})" title="ライブラリに追加">＋</button>`;

    const typeIcon = isPlaylist ? '📋' : '▶';

    return `<div class="yt-sr-card${isAdded?' added':''}" id="yt-sr-card-${ytId}" onclick="window.ytSrOpenVPanel(${i})">
  <div class="yt-sr-thumb">
    ${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<span style="font-size:32px;opacity:.4">🎥</span>`}
    ${badgeHtml}
  </div>
  <div class="yt-sr-info">
    <div class="yt-sr-title">${title}</div>
    <div class="yt-sr-ch">${ch}</div>
    <div class="yt-sr-meta">${typeIcon} ${date}</div>
    <button class="yt-sr-open-btn" onclick="event.stopPropagation();window.ytSrOpenVPanel(${i})">▶ Vパネルで見る</button>
  </div>
</div>`;
  }).join('');

  const loadMoreHtml = _srNextToken
    ? `<div class="yt-sr-load-more-wrap"><button class="yt-sr-load-more-btn" onclick="window.ytSrLoadMore()">もっと見る ↓</button></div>`
    : '';

  wrap.innerHTML = cardsHtml + loadMoreHtml;
}

function _showLoading() {
  const wrap = document.getElementById('yt-sr-cards-wrap');
  if (wrap) wrap.innerHTML = `<div class="yt-sr-loading">🔄 検索中...</div>`;
  _updateHdr(0, true);
}

function _showError(msg) {
  const wrap = document.getElementById('yt-sr-cards-wrap');
  if (wrap) wrap.innerHTML = `<div class="yt-sr-empty">
    <div class="yt-sr-empty-icon">⚠️</div>
    <div class="yt-sr-empty-ttl">検索できませんでした</div>
    <div class="yt-sr-empty-sub">${_esc(msg)}</div>
  </div>`;
  _updateHdr(0);
}

function _updateHdr(count, loading = false) {
  const hdr = document.getElementById('yt-sr-hdr');
  const cnt = document.getElementById('yt-sr-count');
  if (hdr) hdr.style.display = '';
  if (cnt) cnt.textContent = loading ? '検索中...' : `${count}件の検索結果`;
}

// ────────────────────────────────────────
// VPANEL OPEN / CLOSE
// ────────────────────────────────────────
export function ytSrOpenVPanel(idx) {
  const item = _srItems[idx];
  if (!item) return;
  _srOpenItem = item;

  const s       = item.snippet || {};
  const ytId    = item.id?.videoId || '';
  const plId    = item.id?.playlistId || '';
  const isAdded = _addedSet.has(ytId || plId);
  const title   = s.title || '';
  const ch      = s.channelTitle || '';
  const desc    = s.description || '';
  const date    = s.publishedAt ? new Date(s.publishedAt).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }) : '';

  // 左列: ← 戻る + iframe + タイトルバー + チャンネル
  const left = document.getElementById('yt-sr-vp-left');
  if (left) {
    const embedSrc = ytId
      ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
      : plId
        ? `https://www.youtube.com/embed/videoseries?list=${plId}&autoplay=1&rel=0`
        : '';
    left.innerHTML = `
      <button class="yt-sr-vp-back-btn" onclick="window.ytSrCloseVPanel()">← 戻る</button>
      <div class="yt-sr-vp-player">
        ${embedSrc ? `<iframe src="${embedSrc}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-size:12px">プレビュー不可</div>`}
      </div>
      <div class="yt-sr-vp-titlebar">
        <div class="yt-sr-vp-title-text">${_esc(title)}</div>
      </div>
      <div class="yt-sr-vp-ch-text">${_esc(ch)}</div>
    `;
  }

  // 右列CTA
  const cta = document.getElementById('yt-sr-vp-cta');
  if (cta) {
    cta.innerHTML = `<button class="yt-sr-vp-add-btn" id="yt-sr-vp-add-btn" onclick="window.ytSrAddToLibrary()" ${isAdded ? 'disabled' : ''}>
      ${isAdded ? '✓ ライブラリ登録済み' : '＋ ライブラリに追加'}
    </button>`;
  }

  // 右列スクロール: 動画情報
  const scroll = document.getElementById('yt-sr-vp-scroll');
  if (scroll) {
    const ytUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : `https://www.youtube.com/playlist?list=${plId}`;
    scroll.innerHTML = `
      <div class="yt-sr-vp-info-ttl">${_esc(title)}</div>
      <div class="yt-sr-vp-info-row">
        <span>📺</span><span>${_esc(ch)}</span>
      </div>
      ${date ? `<div class="yt-sr-vp-info-row"><span>📅</span><span>${date}</span></div>` : ''}
      ${desc ? `<div class="yt-sr-vp-desc">${_esc(desc)}</div>` : ''}
      <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="yt-sr-vp-yt-link">
        ▶ YouTubeで開く
      </a>
    `;
  }

  // オーバーレイを表示（position:fixed のためスクロール位置に依存しない）
  document.getElementById('yt-sr-vp-overlay')?.classList.add('open');
}

export function ytSrCloseVPanel() {
  const overlay = document.getElementById('yt-sr-vp-overlay');
  overlay?.classList.remove('open');
  // iframeを停止（src=""でプレイヤーを破棄）
  const left = document.getElementById('yt-sr-vp-left');
  const iframe = left?.querySelector('iframe');
  if (iframe) iframe.src = '';
  _srOpenItem = null;
}

// ────────────────────────────────────────
// ライブラリに追加
// ────────────────────────────────────────
export async function ytSrAddToLibrary() {
  if (!currentUser) {
    showToast('⚠️ 先にGoogleでログインしてください');
    return;
  }
  const item = _srOpenItem;
  if (!item) return;

  const s     = item.snippet || {};
  const ytId  = item.id?.videoId || '';
  const plId  = item.id?.playlistId || '';
  const id    = ytId || plId;
  if (!id) return;
  if (_addedSet.has(id)) { showToast('既にライブラリに追加済みです'); return; }

  const title   = s.title || '';
  const channel = s.channelTitle || '';
  const thumb   = s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '';
  const added   = s.publishedAt || '';
  const isVideo = !!ytId;

  const newEntry = {
    id:       'yt-' + id,
    ytId:     ytId || null,
    pt:       'youtube',
    title,
    src:      'youtube',
    url:      isVideo
                ? `https://www.youtube.com/watch?v=${ytId}`
                : `https://www.youtube.com/playlist?list=${plId}`,
    thumb,
    ch:       channel,
    channel,
    pl:       isVideo ? '' : title,  // プレイリスト名
    addedAt:  added,
    duration: 0,
    ytChapters: [],
    watched:  false,
    fav:      false,
    status:   '未着手',
    prio:     'そのうち',
    shared:   0,
    archived: false,
    memo:     '',
    ai:       '',
    tbLocked: false,
    tb: [], cat: [], pos: [], tags: [],
    ...(window.autoTagFromTitle ? (() => {
      const t = window.autoTagFromTitle(title);
      return { tb: t.tb, cat: t.cat, pos: t.pos, tags: t.tags };
    })() : {})
  };

  window.videos = window.videos || [];

  // 重複チェック
  if (window.videos.find(v => v.ytId === id || v.id === newEntry.id)) {
    showToast('既にライブラリに追加済みです');
    _addedSet.add(id);
    _updateAddedUI(id);
    return;
  }

  window.videos.push(newEntry);
  _addedSet.add(id);

  // ライブラリ再レンダリング
  window.AF?.();

  // Firestore保存
  try {
    await saveUserData();
    showToast('✅ ライブラリに追加しました！');
  } catch (e) {
    showToast('⚠️ 保存に失敗しました: ' + e.message);
  }

  // 自動AIタグ
  if (window.aiSettings?.autoTagOnImport) {
    window.autoTagNewVideos?.([newEntry.id]);
  }

  // UI更新
  _updateAddedUI(id);
}

// もっと見る（次ページ読み込み）
export async function ytSrLoadMore() {
  if (_srLoading || !_srNextToken) return;
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (!q) return;

  _srLoading = true;
  const btn = document.querySelector('.yt-sr-load-more-btn');
  if (btn) { btn.textContent = '読み込み中...'; btn.disabled = true; }

  try {
    const data = await _callApi(q, _srMode, _srNextToken);
    const newItems = data.items || [];
    _srItems = [..._srItems, ...newItems];
    _srNextToken = data.nextPageToken || '';
    _renderCards(_srItems);
    _updateHdr(_srItems.length);
  } catch (e) {
    const btn = document.querySelector('.yt-sr-load-more-btn');
    if (btn) { btn.textContent = 'もっと見る ↓'; btn.disabled = false; }
  } finally {
    _srLoading = false;
  }
}

// クイック追加（サムネイルの＋ボタン）
export async function ytSrQuickAdd(ytId, idx) {
  if (!currentUser) { showToast('⚠️ 先にGoogleでログインしてください'); return; }

  const item = _srItems[idx];
  if (!item) return;

  // VPanelを仮にセット
  const prev = _srOpenItem;
  _srOpenItem = item;
  await ytSrAddToLibrary();
  _srOpenItem = prev;
}

// 追加済みUIを反映
function _updateAddedUI(ytId) {
  // カードバッジ更新
  const card = document.getElementById('yt-sr-card-' + ytId);
  if (card) {
    card.classList.add('added');
    const plus = card.querySelector('.yt-sr-plus');
    if (plus) {
      const badge = document.createElement('div');
      badge.className = 'yt-sr-added-badge';
      badge.textContent = '✓ 追加済';
      plus.replaceWith(badge);
    }
  }
  // VPanel CTAボタン更新
  const btn = document.getElementById('yt-sr-vp-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = '✓ ライブラリ登録済み'; }
}

// ────────────────────────────────────────
// UTILS
// ────────────────────────────────────────
function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
