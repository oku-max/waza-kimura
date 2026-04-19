// ═══ WAZA KIMURA — YouTube Search タブ ═══
// /api/yt-search (Vercel serverless) を経由してYouTube Data API v3を呼び出す

import { showToast } from './ui.js';
import { currentUser, saveUserData } from './firebase.js';

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let _srMode       = 'video';   // 'video' | 'playlist'
let _srDuration   = 'any';     // 'any' | 'medium' | 'long'
let _srNextToken  = '';        // YouTube nextPageToken
let _srLoading    = false;
let _srItems      = [];        // 現在表示中の結果
let _srOpenItem   = null;      // VPanelで開いている検索結果
let _srCurrentIdx = -1;        // VPanelで開いているインデックス
const _addedSet   = new Set(); // 追加済みYouTube ID

// ── YT.Player（スキップ対応）──
let _srYtPlayer  = null;
let _srYtReady   = false;
let _srTimeTimer = null;
let _srOpenLibId = null; // 現在 VP に表示中のライブラリ動画 ID（null=未追加）

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
export function ytSrInit() {
  _addedSet.clear();
  (window.videos || []).forEach(v => { if (v.ytId) _addedSet.add(v.ytId); });
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
  const durRow = document.getElementById('yt-sr-dur-row');
  if (durRow) durRow.style.display = mode === 'playlist' ? 'none' : '';
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (q) ytSrSearch();
}

// ────────────────────────────────────────
// DURATION FILTER
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
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ────────────────────────────────────────
// RENDER（検索結果カード）
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

    return `<div class="yt-sr-card${isAdded?' added':''}" id="yt-sr-card-${ytId}" onclick="window.ytSrOpenVPanel(${i})">
  <div class="yt-sr-thumb">
    ${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<span style="font-size:32px;opacity:.4">🎥</span>`}
    ${badgeHtml}
  </div>
  <div class="yt-sr-info">
    <div class="yt-sr-title">${title}</div>
    <div class="yt-sr-ch">${ch}</div>
    <div class="yt-sr-meta">${isPlaylist ? '📋' : '▶'} ${date}</div>
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
// YT.PLAYER API（スキップ対応）
// ────────────────────────────────────────
function _srDoInitPlayer(ytId) {
  _srYtPlayer = new YT.Player('yt-sr-vp-player-div', {
    videoId: ytId,
    playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady: () => { _srYtReady = true; _srStartTimeDisplay(); },
      onStateChange: (e) => {
        if (e.data === 1) _srStartTimeDisplay();
        else { clearInterval(_srTimeTimer); _srUpdateTimeDisplay(); }
      }
    }
  });
}

function _srInitPlayer(ytId) {
  // 既存プレイヤーを破棄
  if (_srYtPlayer) { try { _srYtPlayer.destroy(); } catch(e) {} _srYtPlayer = null; }
  _srYtReady = false;
  clearInterval(_srTimeTimer);

  if (window.YT && window.YT.Player) {
    _srDoInitPlayer(ytId);
  } else {
    // API未ロード時: 既存の onYouTubeIframeAPIReady に連結して待機
    const origReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof origReady === 'function') origReady.call(this);
      _srDoInitPlayer(ytId);
    };
    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id  = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }
}

function _srGetCurrentTime() {
  if (!_srYtPlayer || !_srYtReady) return null;
  try { return Math.floor(_srYtPlayer.getCurrentTime()); } catch(e) { return null; }
}

function _srSeekTo(sec) {
  if (!_srYtPlayer || !_srYtReady) return;
  try { _srYtPlayer.seekTo(sec, true); } catch(e) {}
}

function _srFmt(sec) {
  if (sec == null || isNaN(sec)) return '?:??';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function _srStartTimeDisplay() {
  clearInterval(_srTimeTimer);
  _srTimeTimer = setInterval(_srUpdateTimeDisplay, 500);
  _srUpdateTimeDisplay();
}

function _srUpdateTimeDisplay() {
  const el = document.getElementById('yt-sr-vp-time');
  if (!el || !_srYtPlayer || !_srYtReady) return;
  try {
    const cur = Math.floor(_srYtPlayer.getCurrentTime() || 0);
    const dur = Math.floor(_srYtPlayer.getDuration() || 0);
    el.innerHTML = dur > 0
      ? `${_srFmt(cur)}<span style="font-size:9px;color:var(--text3)"> / ${_srFmt(dur)}</span>`
      : _srFmt(cur);
  } catch(e) {}
}

// スキップ（実VPanelの vpSkip と同仕様）
export function ytSrSkip(sec) {
  const cur = _srGetCurrentTime();
  if (cur == null) { showToast('動画を再生してからスキップしてください'); return; }
  _srSeekTo(Math.max(0, cur + sec));
}

// スキップバーHTML（実VPanelの _skipBtnsHTML と同仕様）
function _srSkipBtnsHTML() {
  const minus = [
    {sec:-60, label:'1m',  icon:'◀◀'},
    {sec:-30, label:'30s', icon:'◀'},
    {sec:-10, label:'10s', icon:'◀'},
    {sec: -3, label:'3s',  icon:'◀'},
  ];
  const plus = [
    {sec:  3, label:'3s',  icon:'▶'},
    {sec: 10, label:'10s', icon:'▶'},
    {sec: 30, label:'30s', icon:'▶'},
    {sec: 60, label:'1m',  icon:'▶▶'},
  ];
  const sep   = '<div class="ab-skip-sep"></div>';
  const left  = minus.map(b => `<button onclick="window.ytSrSkip(${b.sec})" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">${b.icon}</span>${b.label}</button>`).join('');
  const right = plus.map(b  => `<button onclick="window.ytSrSkip(${b.sec})" class="ab-skip-btn ab-skip-plus">${b.label}<span class="ab-skip-arrow">${b.icon}</span></button>`).join('');
  return `<div class="ab-skip-bar">${left}${sep}${right}</div>`;
}

// 検索結果リストHTML（動画下部のサイドリスト）
function _srResultsListHTML(currentIdx) {
  if (!_srItems.length) return '';
  const items = _srItems.map((item, i) => {
    const s     = item.snippet || {};
    const ytId  = item.id?.videoId || item.id?.playlistId || '';
    const thumb = s.thumbnails?.default?.url || '';
    const title = _esc(s.title || '');
    const ch    = _esc(s.channelTitle || '');
    const isAdded  = _addedSet.has(ytId);
    const isActive = i === currentIdx;
    return `<div class="yt-sr-vp-ritem${isActive ? ' active' : ''}${isAdded ? ' added' : ''}" onclick="window.ytSrOpenVPanel(${i})">
      <div class="yt-sr-vp-rthumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : '<span>🎥</span>'}</div>
      <div class="yt-sr-vp-rinfo">
        <div class="yt-sr-vp-rtitle">${title}</div>
        <div class="yt-sr-vp-rch">${ch}${isAdded ? ' <span class="yt-sr-vp-rbadge">✓</span>' : ''}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="yt-sr-vp-rlist">
    <div class="yt-sr-vp-rlist-hdr">検索結果</div>
    ${items}
  </div>`;
}

// ────────────────────────────────────────
// VPANEL OPEN / CLOSE
// ────────────────────────────────────────
export function ytSrOpenVPanel(idx) {
  const item = _srItems[idx];
  if (!item) return;
  ytSrCloseResultsList();  // ☰ ボトムシートを閉じる
  _srOpenItem   = item;
  _srCurrentIdx = idx;

  const s     = item.snippet || {};
  const ytId  = item.id?.videoId || '';
  const plId  = item.id?.playlistId || '';
  const id    = ytId || plId;
  const title = s.title || '';
  const ch    = s.channelTitle || '';
  const desc  = s.description || '';
  const date  = s.publishedAt
    ? new Date(s.publishedAt).toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })
    : '';
  const isAdded = _addedSet.has(id);

  // ライブラリエントリを特定
  const libId    = 'yt-' + id;
  const libEntry = isAdded ? (window.videos || []).find(v => v.ytId === id || v.id === libId) : null;
  _srOpenLibId   = libEntry?.id || null;

  // ── vpanel.js 統合フラグをセット ──
  window._srVpOpen            = true;
  window._srYtGetCurrentTime  = _srGetCurrentTime;
  window._srYtSeekTo          = _srSeekTo;
  if (_srOpenLibId) window.openVPanelId = _srOpenLibId;

  // 実 VPanel の AB エリアをクリア（#vp-ab-sl 等の ID 衝突を防ぐ）
  const realAbArea = document.getElementById('vpanel-ab-area');
  if (realAbArea) realAbArea.innerHTML = '';

  // AB ループ状態を初期化（前回の残骸をクリア）
  window.vpAbReset?.();

  // ── 左列: プレイヤー + タイトル(⏮/⏭) + スキップ + 検索結果リスト ──
  const navBtnStyle = 'flex-shrink:0;width:26px;height:24px;border-radius:6px;border:1.5px solid rgba(255,255,255,.3);background:transparent;color:rgba(255,255,255,.85);font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-family:inherit';
  const left = document.getElementById('yt-sr-vp-left');
  if (left) {
    left.innerHTML = `
      <button class="yt-sr-vp-back-btn" onclick="window.ytSrCloseVPanel()">← 戻る</button>
      <div class="yt-sr-vp-player">
        <div id="yt-sr-vp-player-div" style="width:100%;height:100%"></div>
      </div>
      <div class="yt-sr-vp-titlebar">
        <button style="${navBtnStyle}" onclick="window.ytSrOpenVPanel(${idx - 1})" ${idx === 0 ? 'disabled' : ''} title="前の結果">⏮</button>
        <div class="yt-sr-vp-title-text">${_esc(title)}</div>
        <span id="yt-sr-vp-time" style="flex-shrink:0;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap;padding-left:4px"></span>
        <button style="${navBtnStyle}" onclick="window.ytSrOpenVPanel(${idx + 1})" ${idx >= _srItems.length - 1 ? 'disabled' : ''} title="次の結果">⏭</button>
        <button style="${navBtnStyle}" onclick="window.ytSrOpenResultsList()" title="検索結果一覧">☰</button>
      </div>
      <div class="yt-sr-vp-ch-text">${_esc(ch)}</div>
      ${ytId ? `<div id="yt-sr-vp-skip-wrap">${_srSkipBtnsHTML()}</div>` : ''}
      ${_srResultsListHTML(idx)}
    `;

    // YT.Player 初期化（動画のみ。プレイリストはiframeフォールバック）
    if (ytId) {
      _srInitPlayer(ytId);
    } else if (plId) {
      const div = document.getElementById('yt-sr-vp-player-div');
      if (div) {
        div.innerHTML = `<iframe src="https://www.youtube.com/embed/videoseries?list=${plId}&autoplay=1&rel=0"
          allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"
          style="width:100%;height:100%;border:none;display:block"></iframe>`;
      }
    }
  }

  // ── 右列 CTA ──
  const cta = document.getElementById('yt-sr-vp-cta');
  if (cta) {
    if (isAdded && libEntry) {
      cta.innerHTML = `
        <button class="yt-sr-vp-add-btn" disabled>✓ ライブラリ登録済み</button>
        <button class="yt-sr-vp-lib-btn" onclick="window.ytSrOpenInLibrary('${libEntry.id}')">▶ ライブラリで開く →</button>
      `;
    } else {
      cta.innerHTML = `<button class="yt-sr-vp-add-btn" id="yt-sr-vp-add-btn" onclick="window.ytSrAddToLibrary()">＋ ライブラリに追加</button>`;
    }
  }

  // ── 右列スクロール: ABループ + BM + タグ + 動画情報 ──
  const scroll = document.getElementById('yt-sr-vp-scroll');
  if (scroll) {
    // AB ループセクション（実 VPanel と同一）
    const abHTML = window._vpLoopSectionHTML?.() || '';

    // BM エリア（常にレンダリング。ライブラリ外は空状態＋案内メッセージ）
    const bmId = libEntry?.id || null;
    const chapterHTML  = bmId ? (window._vpChapterSectionHTML?.(bmId)  || '') : '';
    const bookmarkHTML = bmId ? (window._vpBookmarkSectionHTML?.(bmId) || '') : '';
    const memoHTML = bmId
      ? `<div class="vp-row" style="margin-top:8px">
          <span class="vp-lbl">Memo</span>
          <textarea class="vp-memo" id="vp-memo-${bmId}" placeholder=""
            onblur="vpSaveMemo('${bmId}')">${_esc(libEntry.memo || '')}</textarea>
        </div>
        <div id="vp-snap-section-${bmId}"></div>`
      : '';
    const notAddedNote = bmId ? '' : `<div style="padding:10px 14px 4px;font-size:11px;color:var(--text3)">ライブラリに追加するとブックマーク・メモが使用できます</div>`;
    const bmAreaHTML = `<div id="yt-sr-vp-bm-area">${chapterHTML}${bookmarkHTML}${memoHTML}${notAddedNote}</div>`;

    // ドロワー（ライブラリ動画: フル表示 / 未追加: プレースホルダー）
    const drawerHTML = bmId
      ? `<div id="yt-sr-vp-edit-area">${window.buildDrawerHTML?.(bmId) || ''}</div>`
      : `<div id="yt-sr-vp-edit-area" style="padding:10px 16px;font-size:11px;color:var(--text3)">タグ・プレイリスト・習得度などはライブラリに追加後に使用できます</div>`;

    // YouTube 動画情報（全動画共通）
    const ytUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : `https://www.youtube.com/playlist?list=${plId}`;
    const infoHTML = `<div class="yt-sr-vp-info-section">
      <div class="yt-sr-vp-info-ttl">${_esc(title)}</div>
      <div class="yt-sr-vp-info-row"><span>📺</span><span>${_esc(ch)}</span></div>
      ${date ? `<div class="yt-sr-vp-info-row"><span>📅</span><span>${date}</span></div>` : ''}
      ${desc ? `<div class="yt-sr-vp-desc">${_esc(desc)}</div>` : ''}
      <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="yt-sr-vp-yt-link">▶ YouTubeで開く</a>
    </div>`;

    scroll.innerHTML = `
      <div id="yt-sr-vp-ab-area">${abHTML}</div>
      ${bmAreaHTML}
      ${drawerHTML}
      ${infoHTML}
    `;

    // ドロワーのタグ削除ハンドラをバインド（_bindDrawerEvents相当、ライブラリ動画のみ）
    if (bmId) {
      const editArea = scroll.querySelector('#yt-sr-vp-edit-area');
      if (editArea) {
        editArea.querySelectorAll('.vp-tags-rm').forEach(el => { el.onclick = function() { window.vpRemoveTechEl?.(this); }; });
        editArea.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function() { window.vpRemovePosEl?.(this);  }; });
      }
    }

    // スナップショットセクション初期化
    if (bmId && window.initSnapshotSection) {
      window.initSnapshotSection(bmId, document.getElementById('vp-snap-section-' + bmId));
    }
  }

  document.getElementById('yt-sr-vp-overlay')?.classList.add('open');
}

// ────────────────────────────────────────
// 検索結果ボトムシート（☰ ボタン）
// ────────────────────────────────────────
function _ensureSrBottomSheet() {
  let sheet = document.getElementById('yt-sr-results-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'yt-sr-results-sheet';
    sheet.className = 'yt-sr-results-sheet';
    sheet.innerHTML = `
      <div class="yt-sr-results-sheet-bd" onclick="window.ytSrCloseResultsList()"></div>
      <div class="yt-sr-results-sheet-panel">
        <div class="yt-sr-results-sheet-hdr">
          <span class="yt-sr-results-sheet-ttl">検索結果 (${_srItems.length}件)</span>
          <button class="yt-sr-results-sheet-close" onclick="window.ytSrCloseResultsList()">✕</button>
        </div>
        <div class="yt-sr-results-sheet-body" id="yt-sr-results-sheet-body"></div>
      </div>
    `;
    const inner = document.querySelector('.yt-sr-vp-inner') || document.getElementById('yt-sr-vp-overlay');
    if (inner) inner.appendChild(sheet);
  }
  return sheet;
}

export function ytSrOpenResultsList() {
  const sheet = _ensureSrBottomSheet();
  // ヘッダーの件数を更新
  const ttl = sheet.querySelector('.yt-sr-results-sheet-ttl');
  if (ttl) ttl.textContent = `検索結果 (${_srItems.length}件)`;
  // リストを描画
  const body = document.getElementById('yt-sr-results-sheet-body');
  if (body) body.innerHTML = _srResultsListHTML(_srCurrentIdx);
  sheet.classList.add('open');
  // 現在の動画にスクロール
  requestAnimationFrame(() => {
    const active = body?.querySelector('.yt-sr-vp-ritem.active');
    active?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export function ytSrCloseResultsList() {
  document.getElementById('yt-sr-results-sheet')?.classList.remove('open');
}

export function ytSrCloseVPanel() {
  ytSrCloseResultsList();
  document.getElementById('yt-sr-vp-overlay')?.classList.remove('open');

  // vpanel.js 統合フラグをクリア
  window._srVpOpen           = false;
  window._srYtGetCurrentTime = null;
  window._srYtSeekTo         = null;
  if (window.openVPanelId === _srOpenLibId) window.openVPanelId = null;
  _srOpenLibId = null;

  // AB ループタイマーを停止
  window.vpAbReset?.();

  // YT.Player を破棄
  if (_srYtPlayer) { try { _srYtPlayer.destroy(); } catch(e) {} _srYtPlayer = null; }
  _srYtReady = false;
  clearInterval(_srTimeTimer); _srTimeTimer = null;
  // 左列をクリア（動画停止）
  const left = document.getElementById('yt-sr-vp-left');
  if (left) left.innerHTML = '';
  _srOpenItem   = null;
  _srCurrentIdx = -1;
}

// ライブラリ内の動画を実VPanelで開く
export function ytSrOpenInLibrary(videoId) {
  ytSrCloseVPanel();
  requestAnimationFrame(() => window.openVPanel?.(videoId));
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
    pl:       isVideo ? '' : title,
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

  if (window.videos.find(v => v.ytId === id || v.id === newEntry.id)) {
    showToast('既にライブラリに追加済みです');
    _addedSet.add(id);
    _updateAddedUI(id);
    return;
  }

  window.videos.push(newEntry);
  _addedSet.add(id);
  window.AF?.();

  try {
    await saveUserData();
    showToast('✅ ライブラリに追加しました！');
  } catch (e) {
    showToast('⚠️ 保存に失敗しました: ' + e.message);
  }

  if (window.aiSettings?.autoTagOnImport) {
    window.autoTagNewVideos?.([newEntry.id]);
  }

  _updateAddedUI(id);

  // 追加後: VPanelが開いている場合のみ → 実VPanelへ移行
  // カードの＋ボタン（Quick Add）では VPanel は開いていないのでスキップ
  const isVPanelOpen = document.getElementById('yt-sr-vp-overlay')?.classList.contains('open');
  if (isVPanelOpen) {
    const entryId = newEntry.id;
    setTimeout(() => {
      ytSrCloseVPanel();
      requestAnimationFrame(() => window.openVPanel?.(entryId));
    }, 600);
  }
}

// もっと見る
export async function ytSrLoadMore() {
  if (_srLoading || !_srNextToken) return;
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (!q) return;

  _srLoading = true;
  const btn = document.querySelector('.yt-sr-load-more-btn');
  if (btn) { btn.textContent = '読み込み中...'; btn.disabled = true; }

  try {
    const data = await _callApi(q, _srMode, _srNextToken);
    _srItems = [..._srItems, ...(data.items || [])];
    _srNextToken = data.nextPageToken || '';
    _renderCards(_srItems);
    _updateHdr(_srItems.length);
  } catch (e) {
    const b = document.querySelector('.yt-sr-load-more-btn');
    if (b) { b.textContent = 'もっと見る ↓'; b.disabled = false; }
  } finally {
    _srLoading = false;
  }
}

// クイック追加（サムネイルの＋ボタン）
export async function ytSrQuickAdd(ytId, idx) {
  if (!currentUser) { showToast('⚠️ 先にGoogleでログインしてください'); return; }
  const item = _srItems[idx];
  if (!item) return;
  const prev = _srOpenItem;
  _srOpenItem = item;
  await ytSrAddToLibrary();
  _srOpenItem = prev;
}

// 追加済みUIを反映
function _updateAddedUI(ytId) {
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
