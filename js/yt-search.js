// ═══ WAZA KIMURA — YouTube Search タブ ═══
// /api/yt-search (Vercel serverless) を経由してYouTube Data API v3を呼び出す

import { showToast } from './ui.js';
import { currentUser, saveUserData } from './firebase.js';

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let _srMode       = 'video';       // 'video' | 'playlist'
let _srDuration   = 'any';         // 'any' | 'short' | 'medium' | 'long'（後方互換、UIからは廃止）
let _srNextToken  = '';            // YouTube nextPageToken
let _srLoading    = false;
let _srItems      = [];            // 現在表示中の結果
let _srSortKey    = 'publishedAt'; // 'publishedAt' | 'duration'
let _srSortDir    = 'desc';        // 'desc' | 'asc'
let _srOpenItem   = null;          // VPanelで開いている検索結果
let _srCurrentIdx = -1;            // VPanelで開いているインデックス
const _addedSet   = new Set();     // 追加済みYouTube ID
let _srHideAdded  = false;         // 未取込のみフラグ

// ── 検索履歴 ──
const _HIST_KEY = 'yt_sr_history_v1';
const _HIST_MAX = 15;
let _srHistory = [];
function _loadHistory() {
  try { _srHistory = JSON.parse(localStorage.getItem(_HIST_KEY) || '[]'); } catch { _srHistory = []; }
}
function _saveHistory() { localStorage.setItem(_HIST_KEY, JSON.stringify(_srHistory)); }
function _addToHistory(q) {
  if (!q) return;
  _srHistory = [q, ..._srHistory.filter(h => h !== q)].slice(0, _HIST_MAX);
  _saveHistory();
  _renderHistory();
}
function _renderHistory() {
  const el = document.getElementById('yt-sr-history-list');
  if (!el) return;
  if (!_srHistory.length) {
    el.innerHTML = '<div class="yt-sr-hist-empty">まだ検索していません</div>';
    return;
  }
  const chips = document.getElementById('yt-sr-history-chips');
  if (!chips) return;
  if (!_srHistory.length) { chips.style.display = 'none'; return; }
  chips.style.display = '';
  chips.innerHTML = '<span class="yt-sr-hist-label">🕐</span>' +
    _srHistory.map(q =>
      `<span class="yt-sr-hist-chip" data-q="${_esc(q)}">${_esc(q)}</span>`
    ).join('');
  chips.querySelectorAll('.yt-sr-hist-chip').forEach(chip => {
    chip.addEventListener('click', () => window.ytSrSetQuery(chip.dataset.q));
  });
}
window.ytSrSetQuery = function(q) {
  const inp = document.getElementById('yt-sr-input');
  if (inp) inp.value = q;
  window.ytSrSearch?.();
};

// ── YT.Player（スキップ対応）──
let _srYtPlayer  = null;
let _srYtReady   = false;
let _srTimeTimer = null;
let _srOpenLibId = null; // 現在 VP に表示中のライブラリ動画 ID（null=未追加）

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
let _srInitDone = false;
export function ytSrInit() {
  _addedSet.clear();
  (window.videos || []).forEach(v => { if (v.ytId) _addedSet.add(v.ytId); });
  if (_srItems.length > 0) _renderCards(_srItems);
  _loadHistory();
  _renderHistory();
  // ソートドロップダウンをページ外クリックで閉じる（1回だけ登録）
  if (!_srInitDone) {
    _srInitDone = true;
    document.addEventListener('click', e => {
      if (!e.target.closest('.yt-sr-sort-wrap')) {
        document.querySelectorAll('.yt-sr-sort-popover').forEach(p => p.classList.remove('show'));
        document.querySelectorAll('.yt-sr-sort-drop').forEach(b => b.classList.remove('open'));
      }
    }, true);
  }
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
  _addToHistory(q);

  try {
    const data = await _callApi(q, _srMode, '');
    _srItems = data.items || [];
    _srNextToken = data.nextPageToken || '';
    // ソートを初期値にリセット
    _srSortKey = 'publishedAt';
    _srSortDir = 'desc';
    const sel = document.getElementById('yt-sr-sort-sel');
    if (sel) sel.value = 'publishedAt';
    const dirBtn = document.getElementById('yt-sr-sort-dir');
    if (dirBtn) dirBtn.textContent = '↓';
    _renderCards(_sortedItems());
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
  // セグメントコントロール用 .on クラスを切替
  document.getElementById('yt-sr-tab-video')?.classList.toggle('on', mode === 'video');
  document.getElementById('yt-sr-tab-playlist')?.classList.toggle('on', mode === 'playlist');
  const q = document.getElementById('yt-sr-input')?.value?.trim();
  if (q) ytSrSearch();
}

// ────────────────────────────────────────
// DURATION FILTER
// ────────────────────────────────────────
export function ytSrSetDuration(d) {
  _srDuration = d;
  ['any', 'short', 'medium', 'long'].forEach(dur => {
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
  // 毎回最新ライブラリ状態で追加済みセットを再構築
  _addedSet.clear();
  (window.videos || []).forEach(v => { if (v.ytId) _addedSet.add(v.ytId); });

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

    const desc = isPlaylist && s.description
      ? `<div class="yt-sr-pl-desc">${_esc(s.description.slice(0, 80))}${s.description.length > 80 ? '…' : ''}</div>` : '';
    const metaLabel = isPlaylist ? '📋 プレイリスト' : `▶ ${date}`;
    return `<div class="yt-sr-card${isAdded?' added':''}${isPlaylist?' playlist':''}" id="yt-sr-card-${ytId}" onclick="window.ytSrOpenVPanel(${i})">
  <div class="yt-sr-thumb">
    ${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<span style="font-size:32px;opacity:.4">${isPlaylist?'📋':'🎥'}</span>`}
    ${badgeHtml}
  </div>
  <div class="yt-sr-info">
    <div class="yt-sr-title">${title}</div>
    <div class="yt-sr-ch">${ch}</div>
    ${desc}
    <div class="yt-sr-meta">${metaLabel}</div>
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

function _updateHdr(_count, _loading = false) {
  // yt-sr-hdr は廃止（ソートをフィルター行に統合）。何もしない。
}

// ISO 8601 duration → 秒数（例: "PT5M30S" → 330）
function _parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

function _sortedItems() {
  const items = [..._srItems];
  const dir = _srSortDir === 'desc' ? -1 : 1;
  if (_srSortKey === 'publishedAt') {
    items.sort((a, b) => {
      const da = a.snippet?.publishedAt || '';
      const db = b.snippet?.publishedAt || '';
      return da < db ? dir : da > db ? -dir : 0;
    });
  } else if (_srSortKey === 'duration') {
    items.sort((a, b) => {
      const da = _parseDuration(a.contentDetails?.duration);
      const db = _parseDuration(b.contentDetails?.duration);
      return (da - db) * dir;
    });
  }
  return items;
}

// ── ソートキー切替（selectのonchangeから呼ばれる）──
export function ytSrSetSortKey(key) {
  _srSortKey = key;
  // selectの表示を同期（JS経由で呼んだ場合）
  const sel = document.getElementById('yt-sr-sort-sel');
  if (sel && sel.value !== key) sel.value = key;
  if (_srItems.length) _renderCards(_sortedItems());
}
window.ytSrSetSortKey = ytSrSetSortKey;

// ── ソート方向切替（↓/↑）──
export function ytSrToggleSortDir() {
  _srSortDir = _srSortDir === 'desc' ? 'asc' : 'desc';
  const btn = document.getElementById('yt-sr-sort-dir');
  if (btn) btn.textContent = _srSortDir === 'desc' ? '↓' : '↑';
  if (_srItems.length) _renderCards(_sortedItems());
}
window.ytSrToggleSortDir = ytSrToggleSortDir;

// ── ドロップダウン開閉 ──
// overflow-x:auto の親にクリップされないよう position:fixed で配置する
export function ytSrToggleSortDrop() {
  const pop = document.getElementById('yt-sr-sort-popover');
  const btn = document.getElementById('yt-sr-sort-drop');
  if (!pop || !btn) return;
  const isOpen = pop.classList.contains('show');
  if (isOpen) {
    pop.classList.remove('show');
    btn.classList.remove('open');
  } else {
    const rect = btn.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 4) + 'px';
    pop.style.left = rect.left + 'px';
    pop.classList.add('show');
    btn.classList.add('open');
  }
}
window.ytSrToggleSortDrop = ytSrToggleSortDrop;

// 後方互換
export function ytSrSort(_key) { /* 廃止 — ytSrSetSortKey を使用 */ }
window.ytSrSort = ytSrSort;

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
// 非ライブラリ動画用ロックセクション
// ────────────────────────────────────────
function _srLockedSectionsHTML(isYt) {
  const sub  = 'font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px';
  const btnS = 'width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--surface);font-size:13px;font-weight:700;color:var(--text2);padding:0;font-family:inherit';
  const btnP = 'width:24px;height:24px;border-radius:50%;border:none;background:var(--accent);font-size:13px;font-weight:700;color:var(--on-accent);padding:0;font-family:inherit';

  // チャプター（YouTube動画のみ）
  const chapterHTML = isYt ? `
    <div class="vp-row">
      <span class="vp-lbl">📑 チャプター</span>
      <button disabled style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:default;font-family:inherit;opacity:.6">再取得</button>
    </div>` : '';

  // ブックマーク
  const bookmarkHTML = `
    <div class="vp-row">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:4px">
        <span class="vp-lbl" style="margin-bottom:0">🔖 ブックマーク</span>
        <button disabled style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:default;font-family:inherit;opacity:.6">＋ 現在位置でブックマーク</button>
      </div>
      <div style="font-size:11px;color:var(--text3);padding:4px 0">まだブックマークがありません</div>
    </div>`;

  // MEMO + SNAPSHOT
  const memoHTML = `
    <div class="vp-row" style="margin-top:8px">
      <span class="vp-lbl">Memo</span>
      <textarea class="vp-memo" disabled placeholder="ライブラリに追加後に記録できます" style="opacity:.5;cursor:not-allowed;resize:none"></textarea>
    </div>
    <div style="padding:10px 14px">
      <div style="${sub}">SNAPSHOT 0枚</div>
      <div style="width:64px;height:48px;border-radius:6px;border:1.5px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;opacity:.45">
        <span style="font-size:18px">📷</span>
        <span style="font-size:9px;color:var(--text3)">追加</span>
      </div>
    </div>`;

  // カウンター + 習得度（ロック: opacity + pointer-events:none）
  const counterHTML = `
    <div class="fsec" style="opacity:.45;pointer-events:none;user-select:none">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="flex:0 0 auto;padding-right:14px;border-right:1px solid var(--border)">
          <div style="${sub}">お気に入り</div>
          <span style="font-size:20px;color:var(--text3);font-weight:700">★</span>
        </div>
        <div style="flex:0 0 auto;padding-right:14px;border-right:1px solid var(--border)">
          <div style="${sub}">Next</div>
          <span style="font-size:16px;color:var(--text3);font-weight:700">○</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="${sub}">カウンター</div>
          <div style="display:flex;align-items:center;gap:10px">
            <button style="${btnS}" disabled>−</button>
            <span style="font-size:18px;font-weight:800;color:#e8590c;min-width:28px;text-align:center;font-variant-numeric:tabular-nums">0</span>
            <button style="${btnP}" disabled>＋</button>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:6px">最終: <b>—</b></div>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="${sub}">習得度</div>
        <div class="vp-chips">
          <span class="vp-chip on-s0">1.📋 未着手</span>
          <span class="vp-chip">2.📖 理解</span>
          <span class="vp-chip">3.🔄 練習中</span>
          <span class="vp-chip">4.⭐ マスター</span>
        </div>
      </div>
    </div>`;

  return {
    bm:     `<div id="yt-sr-vp-bm-area">${chapterHTML}${bookmarkHTML}${memoHTML}</div>`,
    drawer: `<div id="yt-sr-vp-edit-area">${counterHTML}</div>`
  };
}

// ────────────────────────────────────────
// tempEntry ヘルパー
// ────────────────────────────────────────
function _srRemoveTempEntry() {
  if (!window.videos) return;
  const idx = window.videos.findIndex(v => v._srTemp);
  if (idx !== -1) window.videos.splice(idx, 1);
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
  // ライブラリエントリを特定（_srTemp は除外）
  const libId    = 'yt-' + id;
  let libEntry   = (window.videos || []).find(v => !v._srTemp && (v.ytId === id || v.id === libId)) || null;
  const isAdded  = !!libEntry;

  // 既存 tempEntry をクリア（前の動画の残骸 or 同一動画の再オープン）
  _srRemoveTempEntry();

  // 非ライブラリ動画: tempEntry を作成して全 VP 機能を有効化
  if (!libEntry) {
    const tempEntry = {
      _srTemp:    true,
      id:         libId,
      ytId:       ytId || null,
      pt:         'youtube',
      title,
      src:        'youtube',
      url:        ytId
                    ? `https://www.youtube.com/watch?v=${ytId}`
                    : `https://www.youtube.com/playlist?list=${plId}`,
      thumb:      s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
      ch,
      channel:    ch,
      pl:         ytId ? '' : title,
      addedAt:    new Date().toISOString().slice(0, 10),
      duration:   0,
      ytChapters: [],
      watched:    false,
      fav:        false,
      status:     '未着手',
      prio:       'そのうち',
      shared:     0,
      archived:   false,
      memo:       '',
      ai:         '',
      tbLocked:   false,
      tb: [], cat: [], pos: [], tags: [],
    };
    window.videos = window.videos || [];
    window.videos.push(tempEntry);
    libEntry = tempEntry;
  }

  _srOpenLibId = libEntry.id;

  // ── vpanel.js 統合フラグをセット ──
  window._srVpOpen            = true;
  window._srYtGetCurrentTime  = _srGetCurrentTime;
  window._srYtSeekTo          = _srSeekTo;
  window.openVPanelId         = _srOpenLibId;

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

    // BM エリア + ドロワー（libEntry は常にセット済み: 実エントリ or tempEntry）
    const bmId         = libEntry.id;
    const chapterHTML  = window._vpChapterSectionHTML?.(bmId)  || '';
    const bookmarkHTML = window._vpBookmarkSectionHTML?.(bmId) || '';
    const memoHTML = `<div class="vp-row" style="margin-top:8px">
      <span class="vp-lbl">Memo</span>
      <textarea class="vp-memo" id="vp-memo-${bmId}" placeholder=""
        onblur="vpSaveMemo('${bmId}')">${_esc(libEntry.memo || '')}</textarea>
    </div>
    <div id="vp-snap-section-${bmId}"></div>`;
    const bmAreaHTML = `<div id="yt-sr-vp-bm-area">${chapterHTML}${bookmarkHTML}${memoHTML}</div>`;
    const drawerHTML = `<div id="yt-sr-vp-edit-area">${window.buildDrawerHTML?.(bmId) || ''}</div>`;

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

    // ドロワーのタグ削除ハンドラをバインド
    const editArea = scroll.querySelector('#yt-sr-vp-edit-area');
    if (editArea) {
      editArea.querySelectorAll('.vp-tags-rm').forEach(el => { el.onclick = function() { window.vpRemoveTechEl?.(this); }; });
      editArea.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function() { window.vpRemovePosEl?.(this);  }; });
    }

    // スナップショットセクション初期化（tempEntryは除外: Firebase Storage 孤立を防ぐ）
    if (!libEntry._srTemp && window.initSnapshotSection) {
      window.initSnapshotSection(bmId, document.getElementById('vp-snap-section-' + bmId));
    }
  }

  document.getElementById('yt-sr-vp-overlay')?.classList.add('open');
  setTimeout(() => _srUpdateOrientation(), 80);
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
  _srRemoveTempEntry();  // 未登録動画の一時エントリを除去
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
  document.querySelector('.yt-sr-vp-inner')?.classList.remove('is-portrait');
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

  const libId   = 'yt-' + id;
  const title   = s.title || '';
  const channel = s.channelTitle || '';
  const thumb   = s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '';
  const added   = s.publishedAt || '';
  const isVideo = !!ytId;

  window.videos = window.videos || [];

  // 重複チェック（_srTemp は除外）
  if (window.videos.find(v => !v._srTemp && (v.ytId === id || v.id === libId))) {
    showToast('既にライブラリに追加済みです');
    _addedSet.add(id);
    _updateAddedUI(id);
    return;
  }

  // tempEntry を in-place アップグレード（BM・memo・タグを保持）
  const tempEntry = window.videos.find(v => v._srTemp && v.id === libId);
  if (tempEntry) {
    delete tempEntry._srTemp;
    tempEntry.addedAt = new Date().toISOString().slice(0, 10);
    tempEntry.thumb   = thumb;
    tempEntry.ch      = channel;
    tempEntry.channel = channel;
    // autoTag が未適用ならタイトルから補完
    if (window.autoTagFromTitle && !tempEntry.tb?.length && !tempEntry.cat?.length) {
      const t = window.autoTagFromTitle(title);
      tempEntry.tb   = t.tb   || [];
      tempEntry.cat  = t.cat  || [];
      tempEntry.pos  = t.pos  || [];
      tempEntry.tags = t.tags || [];
    }
  } else {
    // フォールバック: tempEntry が見つからない場合は新規作成
    const newEntry = {
      id:       libId,
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
      addedAt:  new Date().toISOString().slice(0, 10),
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
    window.videos.push(newEntry);
  }

  _addedSet.add(id);
  window.AF?.();
  _updateAddedUI(id); // 即時UI反映（保存完了を待たない）

  try {
    await saveUserData();
    showToast('✅ ライブラリに追加しました！');
  } catch (e) {
    showToast('⚠️ 保存に失敗しました: ' + e.message);
  }

  if (window.aiSettings?.autoTagOnImport) {
    window.autoTagNewVideos?.([libId]);
  }

  // 追加後: VP が開いている場合 → CTA を登録済み表示に更新（VP は閉じない）
  const isVPanelOpen = document.getElementById('yt-sr-vp-overlay')?.classList.contains('open');
  if (isVPanelOpen) {
    const cta = document.getElementById('yt-sr-vp-cta');
    if (cta) {
      cta.innerHTML = `
        <button class="yt-sr-vp-add-btn" disabled>✓ ライブラリ登録済み</button>
        <button class="yt-sr-vp-lib-btn" onclick="window.ytSrOpenInLibrary('${libId}')">▶ ライブラリで開く →</button>
      `;
    }
    _srOpenLibId        = libId;
    window.openVPanelId = libId;
    // スナップショットセクション初期化（登録完了後に有効化）
    if (window.initSnapshotSection) {
      const snapSec = document.getElementById('vp-snap-section-' + libId);
      if (snapSec) window.initSnapshotSection(libId, snapSec);
    }
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
    _renderCards(_sortedItems());
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

// ────────────────────────────────────────
// VPanel 縦横判定 — Libraryタブと同じ基準
// ────────────────────────────────────────
function _srUpdateOrientation() {
  const inner = document.querySelector('.yt-sr-vp-inner');
  if (!inner) return;
  inner.classList.toggle('is-portrait', window.innerHeight > window.innerWidth);
}
window.addEventListener('resize', () => {
  const overlay = document.getElementById('yt-sr-vp-overlay');
  if (overlay?.classList.contains('open')) _srUpdateOrientation();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    const overlay = document.getElementById('yt-sr-vp-overlay');
    if (overlay?.classList.contains('open')) _srUpdateOrientation();
  }, 100);
});

// ────────────────────────────────────────
// 取り込み済み非表示トグル
// ────────────────────────────────────────
export function ytSrToggleHideAdded() {
  _srHideAdded = !_srHideAdded;
  document.getElementById('yt-sr-cards-wrap')?.classList.toggle('hide-added', _srHideAdded);
  document.getElementById('yt-sr-hide-added-btn')?.classList.toggle('active', _srHideAdded);
}
window.ytSrToggleHideAdded = ytSrToggleHideAdded;
