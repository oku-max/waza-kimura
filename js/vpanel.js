// ═══ WAZA KIMURA — 動画パネル（VPanel） v52.482 ═══
// YouTube iFrame Player API対応版
// モバイル用(#vpanel)・PC用(#vp-panel)両対応

// ── YT.Player管理 ──
let _ytPlayer = null;       // 現在アクティブなYT.Playerインスタンス
let _ytPlayerReady = false; // プレイヤーが操作可能な状態か
let _ytApiLoaded = false;   // YouTube iFrame API読み込み済みか
// GDrive用（OAuth + <video>タグ方式 → currentTime完全制御）
let _gdVideoEl = null;  // 再生中の<video>要素
let _gdFileId  = null;  // 再生中のfileId
let _gdPauseTimer = null;           // コントロール非表示タイマー
let _gdContainerClick = null;       // container click handler（蓄積防止用）
let _gdIntendedTime = null;         // 連続seek時の目標時刻（debounce用）
let _gdSeekTimer = null;            // seekデバウンスタイマー
let _gdStallTimer = null;           // waiting状態スタック回復タイマー
// Vimeo Player API
let _vmPlayer  = null;
let _vmCurTime = 0;
let _vmDuration = 0;
// 再生速度（連続再生時に引き継ぎ）
let _vpPlaybackRate = 1;
function _loadVimeoApi() {
  return new Promise((resolve) => {
    if (window.Vimeo && window.Vimeo.Player) return resolve();
    if (document.getElementById('vm-iframe-api-script')) {
      const t = setInterval(() => { if (window.Vimeo?.Player) { clearInterval(t); resolve(); } }, 50);
      return;
    }
    const s = document.createElement('script');
    s.id = 'vm-iframe-api-script';
    s.src = 'https://player.vimeo.com/api/player.js';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

// ── 連続再生・シャッフル状態 ──
let _vpRepeat  = 'off'; // 'off' | 'list' | 'one'
let _vpShuffle = false;
let _vpCurrentPlat = null; // 現在再生中のプラットフォーム（YT→YT再利用判定用）

// ── フィードバックキャプチャ（AI修正検出） ──
let _vpTagSnapshot = null;  // { id, tb, cat, pos, tags } — openVPanel時にAI動画のタグをスナップショット

function _snapshotTags(v) {
  if (!v || !v.ai) return;  // AI未タグ動画はスキップ
  _vpTagSnapshot = {
    id:   v.id,
    ts:   Date.now(),
    tb:   [...(v.tb   || [])],
    cat:  [...(v.cat  || [])],
    pos:  [...(v.pos  || [])],
    tags: [...(v.tags || [])]
  };
}

function _captureTagFeedback(id) {
  if (!_vpTagSnapshot || _vpTagSnapshot.id !== id) return;
  const v = (window.videos || []).find(v => v.id === id);
  if (!v || !v.ai) return;

  const snap = _vpTagSnapshot;
  const cur = {
    tb:   [...(v.tb   || [])],
    cat:  [...(v.cat  || [])],
    pos:  [...(v.pos  || [])],
    tags: [...(v.tags || [])]
  };

  // 差分を検出
  const diff = {};
  let hasDiff = false;
  for (const key of ['tb', 'cat', 'pos', 'tags']) {
    const added   = cur[key].filter(x => !snap[key].includes(x));
    const removed = snap[key].filter(x => !cur[key].includes(x));
    if (added.length || removed.length) {
      diff[key] = {};
      if (added.length)   diff[key].added   = added;
      if (removed.length) diff[key].removed = removed;
      hasDiff = true;
    }
  }
  if (!hasDiff) return;

  // localStorage に FIFO 保存 (最大50件)
  const FEEDBACK_KEY = 'waza_tag_feedback';
  const MAX_ENTRIES  = 50;
  let entries = [];
  try { entries = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); } catch(e) { entries = []; }
  entries.push({
    id:    v.id,
    title: v.title || '',
    ts:    Date.now(),
    ai:    v.ai || '',
    snap,
    cur,
    diff
  });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(entries)); } catch(e) {}

  // スナップショットを更新（同セッション内で再度変更した場合は新しいベースラインから検出）
  _vpTagSnapshot = { id: v.id, ts: Date.now(), tb: cur.tb, cat: cur.cat, pos: cur.pos, tags: cur.tags };
}

function _clearTagSnapshot() {
  _vpTagSnapshot = null;
}

// ── Escape キーで全 DD を閉じる（VPanel / SR VP 共通） ──
// SR VP では iframe が focus を奪うため Escape が届かない場合があるが、
// 通常の VPanel や DD 内 input フォーカス中は有効。
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.vp-dd').forEach(dd => {
    if (dd.style.display !== 'none') dd.style.display = 'none';
  });
}, true);

// ── ドロップダウン外クリックで閉じる（グローバル） ──
document.addEventListener('click', (e) => {
  const opened = document.querySelectorAll('.vp-dd');
  opened.forEach(dd => {
    if (dd.style.display === 'none' || !dd.style.display) return;
    if (dd.contains(e.target)) return;
    // トリガー（同じwrap内の要素 or onclick属性に関連する要素）クリックは無視
    const wrap = dd.closest('.vp-dd-wrap');
    if (wrap && wrap.contains(e.target)) return;
    dd.style.display = 'none';
  });
}, true);

// YouTube iFrame API: アプリ起動時にプリロード (初回 vpanel 開閉のネットワーク待機を排除)
function _loadYTApi() {
  if (_ytApiLoaded || document.getElementById('yt-iframe-api-script')) return;
  _ytApiLoaded = true;
  const tag = document.createElement('script');
  tag.id = 'yt-iframe-api-script';
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.async = true;
  document.head.appendChild(tag);
}
// プリロード削除: オンデマンドで _initYTPlayer 内から呼ぶ
// （プリロードすると API が即座に使え、panel hidden 時に YT.Player が同期実行され低解像度になる。
//   オンデマンドなら API ロード中に panel が開き、正しいサイズで初期化される）

// YouTube iFrame APIの準備完了コールバック（グローバル必須）
window.onYouTubeIframeAPIReady = function() {
  if (window._pendingYTInit) {
    window._pendingYTInit();
    window._pendingYTInit = null;
  }
};

// YT.Player を初期化する (YT.Player にサイズ決定を任せる従来方式)
// containerId: iframe を入れる div の id
function _initYTPlayer(containerId, ytId, autoplay, onReady, extraVars = {}) {
  // 既存プレイヤーを破棄
  if (_ytPlayer) {
    try { _ytPlayer.destroy(); } catch(e) {}
    _ytPlayer = null;
    _ytPlayerReady = false;
  }

  const doInit = () => {
    _ytPlayer = new YT.Player(containerId, {
      videoId: ytId,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        ...extraVars,
      },
      events: {
        onReady: (e) => {
          _ytPlayerReady = true;
          if (_vpPlaybackRate !== 1) { try { _ytPlayer.setPlaybackRate(_vpPlaybackRate); } catch(e2) {} }
          // autoplay:1 がブラウザにブロックされた場合の明示フォールバック
          if (autoplay) { try { _ytPlayer.playVideo(); } catch(e2) {} }
          _startTimeDisplay();
          if (onReady) onReady(e);
        },
        onStateChange: (e) => {
          if (e.data === 1) { _startTimeDisplay(); }
          else {
            _stopTimeDisplay(); _updateTimeDisplay();
            if (e.data === 0) _vpHandleEnded();
          }
        },
        onError: (e) => { console.warn('YT player error:', e.data); },
      },
    });
  };

  if (window.YT && window.YT.Player) {
    doInit();
  } else {
    _loadYTApi();
    window._pendingYTInit = doInit;
  }
}

// 現在の再生位置（秒）を取得
function _getCurrentTime() {
  // Search VP が開いている場合は SR プレイヤーを優先
  if (window._srYtGetCurrentTime) return window._srYtGetCurrentTime();
  if (_gdVideoEl) {
    if (_gdIntendedTime !== null) return _gdIntendedTime;
    const t = _gdVideoEl.currentTime;
    return isNaN(t) ? null : Math.floor(t);
  }
  if (_vmPlayer) return Math.floor(_vmCurTime);
  if (!_ytPlayer || !_ytPlayerReady) return null;
  try { return Math.floor(_ytPlayer.getCurrentTime()); } catch(e) { return null; }
}

// 指定秒数にシーク
function _seekTo(sec) {
  // Search VP が開いている場合は SR プレイヤーを優先
  if (window._srYtSeekTo) { window._srYtSeekTo(sec); return; }
  if (_gdVideoEl) {
    clearTimeout(_gdSeekTimer);
    _gdIntendedTime = sec;
    _gdSeekTimer = setTimeout(() => {
      if (!_gdVideoEl || _gdIntendedTime === null) return;
      const wasPlaying = !_gdVideoEl.paused;
      if (wasPlaying) _gdVideoEl.pause(); // 既存downloadをabortしてから
      _gdVideoEl.currentTime = _gdIntendedTime;
      _gdIntendedTime = null;
      if (wasPlaying) _gdVideoEl.play().catch(() => {});
    }, 120);
    return;
  }
  if (_vmPlayer) {
    try { _vmPlayer.setCurrentTime(sec).then(() => _vmPlayer.play().catch(()=>{})).catch(()=>{}); } catch(e) {}
    _vmCurTime = sec;
    return;
  }
  if (!_ytPlayer || !_ytPlayerReady) return;
  try { _ytPlayer.seekTo(sec, true); _ytPlayer.playVideo(); } catch(e) {}
}

// 秒数を mm:ss 形式に変換
function _formatTime(sec) {
  if (sec == null || isNaN(sec)) return '?:??';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// ── タイトルバー時間表示 ──
let _timeDisplayTimer = null;
let _mirrorProgressTimer = null;

function _startTimeDisplay() {
  _stopTimeDisplay();
  _timeDisplayTimer = setInterval(_updateTimeDisplay, 500);
  _updateTimeDisplay();
}

function _stopTimeDisplay() {
  if (_timeDisplayTimer) { clearInterval(_timeDisplayTimer); _timeDisplayTimer = null; }
}

function _updateTimeDisplay() {
  const el = document.getElementById('vp-title-time');
  if (!el) return;
  if (_gdVideoEl) {
    const cur = Math.floor(_gdVideoEl.currentTime || 0);
    const dur = Math.floor(_gdVideoEl.duration   || 0);
    el.innerHTML = dur > 0
      ? `${_formatTime(cur)}<span style="font-size:9px;color:var(--text3)"> / ${_formatTime(dur)}</span>`
      : _formatTime(cur);
    return;
  }
  if (_vmPlayer) {
    const cur = _vmCurTime, dur = _vmDuration;
    if (dur > 0) {
      el.innerHTML = `${_formatTime(Math.floor(cur))}<span style="font-size:9px;color:var(--text3)"> / ${_formatTime(Math.floor(dur))}</span>`;
    } else {
      el.textContent = _formatTime(Math.floor(cur));
    }
    return;
  }
  if (!_ytPlayer || !_ytPlayerReady) return;
  try {
    const cur = _ytPlayer.getCurrentTime?.() ?? 0;
    const dur = _ytPlayer.getDuration?.() ?? 0;
    if (dur > 0) {
      el.innerHTML = `${_formatTime(Math.floor(cur))}<span style="font-size:9px;color:var(--text3)"> / ${_formatTime(Math.floor(dur))}</span>`;
    }
  } catch(e) {}
}

// ── 動画終了時ハンドラ ──
function _vpHandleEnded() {
  _stopTimeDisplay(); _updateTimeDisplay();
  if (_vpRepeat === 'one') {
    // 1本ループ: 先頭にシークして再生
    if (_gdVideoEl) { _gdVideoEl.currentTime = 0; _gdVideoEl.play().catch(()=>{}); }
    else if (_ytPlayer && _ytPlayerReady) { try { _ytPlayer.seekTo(0, true); _ytPlayer.playVideo(); } catch(e) {} }
    return;
  }
  if (_vpRepeat === 'list' || _vpShuffle) {
    const raw = window._noteVidList || window._vpFilteredList || window.filteredVideos || window.videos || [];
    const list = window._noteVidList ? raw : _vplSort(raw);
    if (list.length <= 1) return;
    if (_vpShuffle) {
      const cur = window.openVPanelId;
      const others = list.filter(v => v.id !== cur);
      const next = others[Math.floor(Math.random() * others.length)];
      if (next) openVPanel(next.id);
    } else {
      vpNav(1);
    }
  }
}

// ── リピート/シャッフルトグル ──
export function vpCycleRepeat() {
  _vpRepeat = _vpRepeat === 'off' ? 'list' : _vpRepeat === 'list' ? 'one' : 'off';
  _refreshRepeatBtn();
}
export function vpToggleShuffle() {
  _vpShuffle = !_vpShuffle;
  _refreshShuffleBtn();
}
window.vpCycleRepeat  = vpCycleRepeat;
window.vpToggleShuffle = vpToggleShuffle;

function _refreshRepeatBtn() {
  document.querySelectorAll('.vp-repeat-btn').forEach(btn => {
    btn.dataset.state = _vpRepeat;
    if (_vpRepeat === 'off')  { btn.style.background='var(--surface2)'; btn.style.borderColor='var(--border)'; btn.style.color='var(--text3)'; }
    if (_vpRepeat === 'list') { btn.style.background='#111'; btn.style.borderColor='#111'; btn.style.color='#fff'; }
    if (_vpRepeat === 'one')  { btn.style.background='#2563eb'; btn.style.borderColor='#2563eb'; btn.style.color='#fff'; }
    const badge = btn.querySelector('.vp-repeat-badge');
    if (badge) badge.style.display = _vpRepeat === 'one' ? 'inline-block' : 'none';
  });
}
function _refreshShuffleBtn() {
  document.querySelectorAll('.vp-shuffle-btn').forEach(btn => {
    if (_vpShuffle) { btn.style.background='#111'; btn.style.borderColor='#111'; btn.style.color='#fff'; }
    else { btn.style.background='var(--surface2)'; btn.style.borderColor='var(--border)'; btn.style.color='var(--text3)'; }
  });
}

function _repeatBtnStyle() {
  if (_vpRepeat === 'list') return 'background:#111;border-color:#111;color:#fff';
  if (_vpRepeat === 'one')  return 'background:#2563eb;border-color:#2563eb;color:#fff';
  return 'background:var(--surface2);border-color:var(--border);color:var(--text3)';
}
function _shuffleBtnStyle() {
  return _vpShuffle ? 'background:#111;border-color:#111;color:#fff' : 'background:var(--surface2);border-color:var(--border);color:var(--text3)';
}

function _repeatSVG() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
}
function _shuffleSVG() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 3 21 6 17 9"/><path d="M2 19H5C9 19 15 6 21 6"/><polyline points="17 15 21 18 17 21"/><path d="M2 5H5C9 5 15 18 21 18"/></svg>`;
}

// ── スキップボタンHTML ──
function _skipBtnsHTML() {
  const minus = [
    {sec:-60, label:'1m',  icon:'◀'},
    {sec:-30, label:'30s', icon:'◀'},
    {sec:-10, label:'10s', icon:'◀'},
    {sec: -3, label:'3s',  icon:'◀'},
  ];
  const plus = [
    {sec:  3, label:'3s',  icon:'▶'},
    {sec: 10, label:'10s', icon:'▶'},
    {sec: 30, label:'30s', icon:'▶'},
    {sec: 60, label:'1m',  icon:'▶'},
  ];
  const sep = '<div class="ab-skip-sep"></div>';
  const left  = minus.map(b => `<button onclick="vpSkip(${b.sec})" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">${b.icon}</span>${b.label}</button>`).join('');
  const right = plus.map(b  => `<button onclick="vpSkip(${b.sec})" class="ab-skip-btn ab-skip-plus">${b.label}<span class="ab-skip-arrow">${b.icon}</span></button>`).join('');
  const timer = `<span id="vp-title-time" style="flex-shrink:0;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap;margin-right:2px"></span>`;
  return `<div class="ab-skip-bar">${timer}${left}${sep}${right}</div>`;
}

export function vpSkip(sec) {
  const cur = _getCurrentTime();
  if (cur == null) { window.toast?.('動画を再生してからスキップしてください'); return; }
  _seekTo(Math.max(0, cur + sec));
}

// ── AB ループ ──
const _ab = { a: null, b: null, loop: false, timer: null, setMode: null }; // setMode: 'a'|'b'|null

function _loopSVG() {
  const col = _ab.loop ? '#fff' : 'var(--text)';
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
}

// ── ループセクションのアクティブフィールド（'start'|'end'）
let _abActiveField = 'start';

function _loopSectionHTML() {
  const isExpanded = _ab.setMode === 'loop';
  const aLabel = _ab.a != null ? _formatTime(Math.floor(_ab.a)) : '--:--';
  const bLabel = _ab.b != null ? _formatTime(Math.floor(_ab.b)) : '--:--';
  const hasA = _ab.a != null;
  const hasB = _ab.b != null;
  const hasConflict = hasA && hasB && _ab.a >= _ab.b;
  const loopIconSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

  // 折りたたみ状態
  const statusText = _ab.loop
    ? `<span onclick="vpAbToggleLoop()" class="ab-status-on" title="タップでループOFF">🔁 ON &nbsp;${aLabel} → ${bLabel} ✕</span>`
    : (hasA || hasB)
      ? `<span class="ab-status-text">${aLabel} → ${bLabel}</span>`
      : `<span class="ab-status-text">未設定</span>`;
  const expandLabel = isExpanded ? '∧ 閉じる' : (_ab.loop ? '編集 ∨' : '設定する ∨');

  // 時間が両方設定済みならON/OFFボタンを表示
  const canToggle = hasA && hasB;
  const toggleBtn = canToggle
    ? `<button onclick="vpAbToggleLoop()" class="ab-toggle-btn ${_ab.loop ? 'ab-toggle-btn--on' : 'ab-toggle-btn--off'}">${_ab.loop ? 'OFF' : 'ON'}</button>`
    : '';

  const collapsedRow = `<div class="ab-collapse-row">
    <span class="vp-lbl" style="display:flex;align-items:center;gap:5px;margin-bottom:0;">${loopIconSVG}ループ再生</span>
    ${statusText}
    ${toggleBtn}
    <button onclick="vpAbToggleExpand()" class="ab-expand-btn">${expandLabel}</button>
  </div>`;

  if (!isExpanded) {
    return `<div id="vp-loop-section" class="ab-section">${collapsedRow}</div>`;
  }

  // 展開状態
  const startClass = `ab-time ${hasA ? 'ab-time--set' : 'ab-time--unset'}`;
  const endClass = `ab-time ${hasConflict ? 'ab-time--error' : hasB ? 'ab-time--set' : 'ab-time--unset'}`;
  const loopToggleClass = `ab-loop-toggle ${_ab.loop ? 'ab-loop-toggle--on' : 'ab-loop-toggle--off'}`;
  const loopToggleSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${_ab.loop ? '#fff' : 'var(--text)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

  // タブエディタ（開始/終了共通）
  const isStart = _abActiveField === 'start';
  const curVal = isStart ? (_ab.a ?? 0) : (_ab.b ?? _ab.a ?? 0);
  const tabStart = `<div onclick="vpAbSwitchField('start')" class="ab-tab ${isStart ? 'ab-tab--active' : 'ab-tab--inactive'}">▶ 開始</div>`;
  const tabEnd   = `<div onclick="vpAbSwitchField('end')" class="ab-tab ${!isStart ? 'ab-tab--active' : 'ab-tab--inactive'}">⏹ 終了</div>`;

  const adjBtns = [-10,-5,-3,-1,1,3,5,10].map(d =>
    `<button onclick="vpAbAdjField(${d})" class="ab-adj-btn">${d>0?'+':''}${d}s</button>`
  ).join('');

  return `<div id="vp-loop-section" class="ab-section">
    ${collapsedRow}
    <div class="ab-editor-body">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <button onclick="vpAbSwitchField('start')" class="${startClass}">開始: ${aLabel}</button>
        <span style="font-size:10px;color:var(--accent);">↔</span>
        <button onclick="vpAbSwitchField('end')" class="${endClass}">終了: ${bLabel}</button>
        <button onclick="vpAbToggleLoop()" class="${loopToggleClass}" title="ループON/OFF">${loopToggleSVG}</button>
        <span style="flex:1;"></span>
        <button onclick="vpAbReset()" class="ab-clear-btn">✕ クリア</button>
      </div>
      <div id="vp-ab-editor" class="ab-editor">
        <div style="display:flex;border-bottom:0.5px solid var(--border);">${tabStart}${tabEnd}</div>
        <div style="padding:8px 10px;">
          <div id="vp-ab-time-disp" class="ab-time-disp">${_formatTime(Math.floor(curVal))}</div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:3px;"><span>0:00</span><span id="vp-ab-sl-dur">—</span></div>
          <input type="range" id="vp-ab-sl" min="0" max="600" value="${Math.floor(curVal)}" step="1"
            style="width:75%;height:4px;cursor:pointer;display:block;accent-color:var(--accent);outline:none;touch-action:none;margin-bottom:6px;">
          <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">
            <span style="font-size:9px;color:var(--text3);width:100%;margin-bottom:2px;">微調整</span>
            ${adjBtns}
            <button onclick="vpAbSetCurrentField()" class="ab-current-btn">現在地</button>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button onclick="vpAbSaveLoop()" class="ab-save-btn">✔ 保存</button>
      </div>
    </div>
  </div>`;
}

// 後方互換（_abBarHTMLを呼んでいる箇所のため）
function _abBarHTML() {
  return _loopSectionHTML();
}

function _abRefresh(id) {
  // ABバーを再描画
  const html = _abBarHTML();
  // Search VP が開いている場合はそちらを優先
  const abArea = window._srVpOpen
    ? document.getElementById('yt-sr-vp-ab-area')
    : document.getElementById('vpanel-ab-area');
  if (abArea) abArea.innerHTML = html;
  // 展開中ならスライダーをバインド
  if (_ab.setMode === 'loop') _abBindLoopSlider();
  // ブックマーク追加ボタンの文言・動作をAB状態に応じて更新
  const vid = id || window.openVPanelId;
  const bmAddBtn = document.getElementById('vp-bm-add-btn-' + vid);
  if (bmAddBtn) {
    const hasAB = _ab.a != null && _ab.b != null && _ab.loop;
    bmAddBtn.textContent = hasAB ? '＋ ループ区間をブックマーク' : '＋ 現在位置でブックマーク';
    bmAddBtn.setAttribute('onclick', hasAB ? "vpAddAbBm('" + vid + "')" : "vpAddBm('" + vid + "')");
    bmAddBtn.style.border = hasAB ? '1px solid var(--accent)' : '1px solid var(--border)';
    bmAddBtn.style.color = hasAB ? 'var(--accent)' : 'var(--text2)';
    bmAddBtn.style.fontWeight = hasAB ? '600' : '';
  }
}

export function vpAbSet(point) {
  const cur = _getCurrentTime();
  if (cur == null) { window.toast?.('動画を再生してください'); return; }
  _ab[point] = cur;
  _abRefresh();
}

// A/Bボタンタップ → クイック設定パネルを開く
export function vpAbOpenPanel(pt) {
  if (_ab.setMode === pt) {
    // 同じボタンを再タップ → 閉じる
    _ab.setMode = null;
    _abCloseQuickPanel();
    _abRefresh();
    return;
  }
  _ab.setMode = pt;
  _abRefresh();
  _abOpenQuickPanel(pt, window.openVPanelId);
}

function _abCloseQuickPanel() {
  ['vp-ab-quick-panel','vp-pc-ab-quick-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

// ── ループエディタのスライダーバインド ──
function _abBindLoopSlider() {
  const sl = document.getElementById('vp-ab-sl');
  if (!sl) return;
  // 総秒数をmaxにセット
  try {
    const dur = _ytPlayer?.getDuration?.();
    if (dur && dur > 0) {
      sl.max = Math.floor(dur);
      const durEl = document.getElementById('vp-ab-sl-dur');
      if (durEl) durEl.textContent = _formatTime(Math.floor(dur));
    }
  } catch(e) {}

  function applyVal(v) {
    const max = parseInt(sl.max) || 600;
    v = Math.max(0, Math.min(max, v));
    sl.value = v;
    // 即時確定
    if (_abActiveField === 'start') _ab.a = v;
    else _ab.b = v;
    // 表示更新
    const disp = document.getElementById('vp-ab-time-disp');
    if (disp) disp.textContent = _formatTime(Math.floor(v));
    // ヘッダーチップも更新
    _abUpdateChips();
  }
  sl.addEventListener('input',  () => applyVal(parseInt(sl.value)));
  sl.addEventListener('change', () => applyVal(parseInt(sl.value)));
}

// ヘッダーチップ（開始/終了ボタン）のテキスト更新
function _abUpdateChips() {
  const aLabel = _ab.a != null ? _formatTime(Math.floor(_ab.a)) : '--:--';
  const bLabel = _ab.b != null ? _formatTime(Math.floor(_ab.b)) : '--:--';
  // ループセクションを再描画（軽量）
  const sec = document.getElementById('vp-loop-section');
  if (sec) {
    const abArea = window._srVpOpen
      ? document.getElementById('yt-sr-vp-ab-area')
      : document.getElementById('vpanel-ab-area');
    if (abArea) abArea.innerHTML = _loopSectionHTML();
    _abBindLoopSlider();
    // BM追加ボタンも更新
    const vid = window.openVPanelId;
    const bmAddBtn = document.getElementById('vp-bm-add-btn-' + vid);
    if (bmAddBtn) {
      const hasAB = _ab.a != null && _ab.b != null;
      bmAddBtn.textContent = hasAB ? '＋ ループ区間をブックマーク' : '＋ 現在位置でブックマーク';
      bmAddBtn.setAttribute('onclick', hasAB ? "vpAddAbBm('" + vid + "')" : "vpAddBm('" + vid + "')");
      bmAddBtn.style.border = hasAB ? '1px solid var(--accent)' : '1px solid var(--border)';
      bmAddBtn.style.color = hasAB ? 'var(--accent)' : 'var(--text2)';
      bmAddBtn.style.fontWeight = hasAB ? '600' : '';
    }
  }
}

// タブ切替（開始/終了）
export function vpAbSwitchField(field) {
  _abActiveField = field;
  const abArea = window._srVpOpen
    ? document.getElementById('yt-sr-vp-ab-area')
    : document.getElementById('vpanel-ab-area');
  if (abArea) abArea.innerHTML = _loopSectionHTML();
  _abBindLoopSlider();
}

// 展開/折りたたみトグル
export function vpAbToggleExpand() {
  _ab.setMode = _ab.setMode === 'loop' ? null : 'loop';
  _abActiveField = 'start';
  _abRefresh();
}

// ±ボタンで即時確定
export function vpAbAdjField(delta) {
  const cur = _abActiveField === 'start' ? (_ab.a ?? 0) : (_ab.b ?? _ab.a ?? 0);
  const sl = document.getElementById('vp-ab-sl');
  const max = sl ? parseInt(sl.max) || 600 : 600;
  const nv = Math.max(0, Math.min(max, cur + delta));
  if (_abActiveField === 'start') _ab.a = nv; else _ab.b = nv;
  const disp = document.getElementById('vp-ab-time-disp');
  if (disp) disp.textContent = _formatTime(Math.floor(nv));
  if (sl) sl.value = nv;
  _abUpdateChips();
}

// 現在地ボタンで即時確定
export function vpAbSetCurrentField() {
  const cur = _getCurrentTime();
  if (cur == null) { window.toast?.('動画を再生してください'); return; }
  if (_abActiveField === 'start') _ab.a = cur; else _ab.b = cur;
  const disp = document.getElementById('vp-ab-time-disp');
  if (disp) disp.textContent = _formatTime(Math.floor(cur));
  const sl = document.getElementById('vp-ab-sl');
  if (sl) sl.value = cur;
  _abUpdateChips();
}

// 保存ボタン → ループONにして折りたたむ
export function vpAbSaveLoop() {
  if (_ab.a == null && _ab.b == null) { window.toast?.('開始・終了を設定してください'); return; }
  if (_ab.a != null && _ab.b != null && _ab.a >= _ab.b) { window.toast?.('⚠ 開始が終了より後になっています'); return; }
  // ループ開始
  if (_ab.a != null && _ab.b != null) {
    _ab.loop = true;
    clearInterval(_ab.timer);
    _seekTo(_ab.a);
    _ab.timer = setInterval(() => {
      if (!_ab.loop || _ab.a == null || _ab.b == null) return;
      const cur = _getCurrentTime();
      if (cur != null && cur >= _ab.b) _seekTo(_ab.a);
    }, 200);
  }
  _ab.setMode = null; // 折りたたむ
  _abRefresh();
  window.toast?.('🔁 ループを開始しました');
}

// 後方互換：旧関数名をそのまま維持
export function vpAbClosePanel() { vpAbToggleExpand(); }
export function vpAbQpAdj(delta) { vpAbAdjField(delta); }
export function vpAbQpSetCurrent() { vpAbSetCurrentField(); }
export function vpAbQpSet() { vpAbSaveLoop(); }
export function vpAbQpClear() {
  if (_abActiveField === 'start') _ab.a = null; else _ab.b = null;
  if (_ab.loop) { _ab.loop = false; clearInterval(_ab.timer); _ab.timer = null; }
  _abRefresh();
}

export function vpAbToggleLoop() {
  if (_ab.a == null || _ab.b == null) { window.toast?.('開始・終了を両方設定してください'); return; }
  if (_ab.a >= _ab.b) { window.toast?.('⚠ 開始が終了より後になっています'); return; }
  _ab.loop = !_ab.loop;
  if (_ab.loop) {
    _seekTo(_ab.a);
    clearInterval(_ab.timer);
    _ab.timer = setInterval(() => {
      if (!_ab.loop || _ab.a == null || _ab.b == null) return;
      const cur = _getCurrentTime();
      if (cur != null && cur >= _ab.b) _seekTo(_ab.a);
    }, 200);
  } else {
    clearInterval(_ab.timer);
    _ab.timer = null;
  }
  _abRefresh();
}

export function vpAbReset() {
  _ab.a = null; _ab.b = null; _ab.loop = false; _ab.setMode = null;
  clearInterval(_ab.timer); _ab.timer = null;
  _abRefresh();
}

export function vpAbSaveAsBm() {
  vpAbAddBm();
}

// ＋BMボタン → ラベル入力欄を展開
export function vpAbAddBm() {
  const row = document.getElementById('vp-ab-add-bm-row');
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'block' : 'none';
  if (row.style.display === 'block') {
    const inp = document.getElementById('vp-ab-bm-label');
    if (inp) {
      inp.placeholder = 'ブックマーク名（空欄でも可）';
    }
  }
}

export function vpAbConfirmAddBm() {
  const id = window.openVPanelId;
  if (!id) return;
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;
  const labelEl = document.getElementById('vp-ab-bm-label');
  const noteEl  = document.getElementById('vp-ab-bm-note');
  const label = labelEl ? labelEl.value.trim() : '';
  const note  = noteEl  ? noteEl.value.trim()  : '';
  const hasA = _ab.a != null, hasB = _ab.b != null;
  const t = hasA ? _ab.a : (_getCurrentTime() ?? 0);
  const e = (hasA && hasB) ? _ab.b : null;
  if (!v.bookmarks) v.bookmarks = [];
  v.bookmarks.push({ time: t, endTime: e, label, note });
  v.bookmarks.sort((a, b) => a.time - b.time);
  if (labelEl) labelEl.value = '';
  if (noteEl)  noteEl.value  = '';
  const row = document.getElementById('vp-ab-add-bm-row');
  if (row) row.style.display = 'none';
  // 追加後のインデックスを特定
  const addedIdx = v.bookmarks.findIndex(b => b.time === t && b.label === label);
  _refreshBmList(id, addedIdx >= 0 ? addedIdx : v.bookmarks.length - 1);
  window.debounceSave?.();
  window.toast?.('🔖 ブックマークを追加しました');
}

export function vpAbCancelAddBm() {
  const row = document.getElementById('vp-ab-add-bm-row');
  if (row) row.style.display = 'none';
}

// ── ブックマーク関連 ──
function _getBookmarks(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return [];
  return v.bookmarks || [];
}

function _bookmarkListHTML(id) {
  const bms = _getBookmarks(id);
  if (!bms.length) return '<div style="font-size:11px;color:var(--text3);padding:4px 0">まだブックマークがありません</div>';

  return bms.map((bm, i) => {
    const hasEnd = bm.endTime != null;
    const timeLabel = hasEnd
      ? `${_formatTime(bm.time)} → ${_formatTime(bm.endTime)}`
      : _formatTime(bm.time);
    const isExpanded = window._vpBmExpanded?.[id] === i;

    // ±ボタン（field付き）
    const fineButtons = (field) => [-10,-5,-3,-1,1,3,5,10].map(d =>
      `<button onclick="vpAdjustBmField('${id}',${i},'${field}',${d})" style="${_adjBtnStyle()}">${d>0?'+':''}${d}s</button>`
    ).join('');

    // 開始から+Xsボタン（終了フィールドのみ）
    const fromStartBtns = [3,5,10,30].map(d =>
      `<button onclick="vpSetBmEndFromStart('${id}',${i},${d})" style="${_adjBtnStyle('var(--surface2)','var(--accent)')}">+${d}s</button>`
    ).join('');

    // アクティブフィールド（デフォルトは開始）
    const activeField = (window._vpBmActiveField?.[id+'-'+i]) || 'start';
    const startActive = activeField === 'start';
    const endActive   = activeField === 'end';

    // タブ式統合エディタ（ループ再生と同じUI）
    const curVal = startActive ? bm.time : (hasEnd ? bm.endTime : bm.time);
    const adjBtnsStart = [-10,-5,-3,-1,1,3,5,10].map(d =>
      `<button onclick="vpAdjustBmField('${id}',${i},'start',${d})" style="${_adjBtnStyle()}">${d>0?'+':''}${d}s</button>`
    ).join('');
    const adjBtnsEnd = [-10,-5,-3,-1,1,3,5,10].map(d =>
      `<button onclick="vpAdjustBmField('${id}',${i},'end',${d})" style="${_adjBtnStyle()}">${d>0?'+':''}${d}s</button>`
    ).join('');

    const tabStyleStart = startActive
      ? 'flex:1;text-align:center;font-size:11px;font-weight:600;padding:6px 4px;cursor:pointer;border-right:0.5px solid var(--border);background:var(--accent);color:var(--on-accent);'
      : 'flex:1;text-align:center;font-size:11px;font-weight:500;padding:6px 4px;cursor:pointer;border-right:0.5px solid var(--border);color:var(--text2);background:var(--surface2);';
    const tabStyleEnd = endActive
      ? 'flex:1;text-align:center;font-size:11px;font-weight:600;padding:6px 4px;cursor:pointer;background:var(--accent);color:var(--on-accent);'
      : 'flex:1;text-align:center;font-size:11px;font-weight:500;padding:6px 4px;cursor:pointer;color:var(--text2);background:var(--surface2);';

    const editorHTML = isExpanded ? `
      <div style="padding:8px 0 2px">
        <input id="vp-bm-lbl-${id}-${i}" type="text" value="${(bm.label||'').replace(/"/g,'&quot;')}" placeholder="ブックマーク名（空欄でも可）"
          style="width:100%;font-size:11px;padding:4px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;outline:none;min-width:0;box-sizing:border-box;margin-bottom:5px;">
        <input id="vp-bm-note-${id}-${i}" type="text" value="${(bm.note||'').replace(/"/g,'&quot;')}" placeholder="コメント（空欄でも可）"
          style="width:100%;font-size:11px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;outline:none;min-width:0;box-sizing:border-box;margin-bottom:8px;">

        <!-- タブ式エディタ -->
        <div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:6px;background:var(--surface);">
          <div style="display:flex;border-bottom:0.5px solid var(--border);">
            <div onclick="vpBmActivateField('${id}',${i},'start')" style="${tabStyleStart}">▶ 開始</div>
            <div onclick="vpBmActivateField('${id}',${i},'end')" style="${tabStyleEnd}">⏹ 終了</div>
          </div>
          <div style="padding:8px 10px;">
            <div style="font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:var(--text);text-align:center;margin:2px 0 6px;">
              ${startActive ? _formatTime(bm.time) : (hasEnd ? _formatTime(bm.endTime) : '——')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:3px;"><span>0:00</span><span id="vp-bm-sl-dur-${id}-${i}">—</span></div>
            <input type="range" class="vp-bm-sl" id="vp-sl-${startActive?'start':'end'}-${id}-${i}"
              data-vid="${id}" data-idx="${i}" data-field="${startActive?'start':'end'}"
              min="0" max="600" value="${curVal}" step="1"
              style="width:75%;height:4px;cursor:pointer;display:block;accent-color:var(--accent);outline:none;touch-action:none;margin-bottom:6px;">
            <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:9px;color:var(--text3);width:100%;margin-bottom:2px;">微調整</span>
              ${startActive ? adjBtnsStart : adjBtnsEnd}
              <button onclick="vpSetBmFieldToCurrent('${id}',${i},'${startActive?'start':'end'}')" style="${_adjBtnStyle('var(--accent)','#fff')}">現在地</button>
            </div>
            ${endActive ? `<div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin-top:5px;">
              <span style="font-size:9px;color:var(--text3);flex-shrink:0;">開始から:</span>
              ${fromStartBtns}
              ${hasEnd ? `<button onclick="vpClearBmEnd('${id}',${i})" style="font-size:9px;padding:2px 7px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-family:inherit;margin-left:auto;">終了を削除</button>` : ''}
            </div>` : ''}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;">
          <div style="display:flex;gap:5px;">
            <button onclick="vpBmReset('${id}',${i})" style="${_adjBtnStyle()}">↺ リセット</button>
            <button onclick="vpDeleteBm('${id}',${i})" style="${_adjBtnStyle('var(--surface2)','var(--danger,var(--red,#c84040))')}">🗑 削除</button>
          </div>
          <div style="display:flex;gap:5px;">
            <button onclick="vpBmClose('${id}',${i})" style="${_adjBtnStyle()}">閉じる</button>
            <button onclick="vpBmSave('${id}',${i})" style="${_adjBtnStyle('var(--text)','#fff')}">✔ 保存</button>
          </div>
        </div>
      </div>` : '';

    // 編集中: アクセントカラー背景＋左ボーダー強調、非編集中: グレーアウト
    const rowStyle = isExpanded
      ? 'border-bottom:1px solid var(--border);padding:6px 8px;background:var(--accent-bg,#fdf6e8);border-left:3px solid var(--accent);margin:2px 0;border-radius:4px'
      : 'border-bottom:1px solid var(--border);padding:6px 8px;';
    return `<div data-bm-idx="${i}" style="${rowStyle}">
      <div style="display:flex;align-items:center;gap:5px">
        <button onclick="vpBmTimeClick('${id}',${i},${bm.time}${hasEnd ? ',' + bm.endTime : ''})" style="flex-shrink:0;padding:2px 8px;border-radius:5px;border:1.5px solid ${hasEnd ? 'var(--accent)' : 'var(--accent)'};background:${hasEnd ? 'var(--surface)' : 'transparent'};color:var(--accent);font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap" title="${hasEnd ? 'AB再生開始' : 'ここから再生'}">${timeLabel}</button>
        <span style="flex:1;font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="vpBmTimeClick('${id}',${i},${bm.time}${hasEnd ? ',' + bm.endTime : ''})">${bm.label || '（ラベルなし）'}</span>
        <button onclick="${isExpanded ? `vpBmSave('${id}',${i})` : `vpBmToggleEdit('${id}',${i})`}" style="padding:2px 7px;border-radius:5px;border:1px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'};background:${isExpanded ? 'var(--accent)' : 'transparent'};color:${isExpanded ? '#fff' : 'var(--text3)'};font-size:9px;font-weight:${isExpanded ? '600' : 'normal'};cursor:pointer;font-family:inherit">${isExpanded ? '✔ 保存' : '編集'}</button>
      </div>
      ${bm.note && !isExpanded ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">💬 ${bm.note}</div>` : ''}
      ${editorHTML}
    </div>`;
  }).join('');
}

function _adjBtnStyle(bg, color) {
  bg = bg || 'var(--surface2)';
  color = color || 'var(--text2)';
  return `padding:2px 7px;border-radius:5px;border:1px solid var(--border);background:${bg};color:${color};font-size:10px;font-weight:600;cursor:pointer;font-family:inherit`;
}

function _chapterSectionHTML(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  const isYt = !!(v?.ytId);
  if (!v?.ytChapters?.length) {
    if (!isYt) return '';
    return `
    <div class="vp-row" id="vp-chapters-${id}">
      <span class="vp-lbl">📑 チャプター</span>
      <button onclick="vpRefetchChapters('${id}')" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer">再取得</button>
    </div>`;
  }
  const items = v.ytChapters.map(ch => {
    const tot = ch.t, h = Math.floor(tot/3600), m = Math.floor((tot%3600)/60), s = tot%60;
    const time = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`;
    return `<div onclick="vpChapterClick(${ch.t})" style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-size:11px;font-weight:600;color:var(--accent);font-family:'DM Mono',monospace;white-space:nowrap;flex-shrink:0">${time}</span>
      <span style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ch.label}</span>
    </div>`;
  }).join('');
  return `
    <div class="vp-row" id="vp-chapters-${id}">
      <span class="vp-lbl" style="margin-bottom:4px">📑 チャプター</span>
      <div style="width:100%;max-height:180px;overflow-y:auto">${items}</div>
    </div>`;
}

async function _doFetchChapters(id, token) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;
  const btn = document.querySelector(`#vp-chapters-${id} button`);
  if (btn) { btn.textContent = '取得中...'; btn.disabled = true; }
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${v.ytId}&maxResults=1`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (data.error) { window.toast?.('⚠️ 取得エラー: ' + data.error.message); if (btn) { btn.textContent = '再取得'; btn.disabled = false; } return; }
    const desc = data.items?.[0]?.snippet?.description || '';
    const chapters = window.parseYtTimestamps ? window.parseYtTimestamps(desc) : [];
    v.ytChapters = chapters;
    await window.saveUserData?.();
    const sec = document.getElementById(`vp-chapters-${id}`);
    if (sec) sec.outerHTML = _chapterSectionHTML(id);
    window.toast?.(chapters.length ? `📑 ${chapters.length}件のチャプターを取得しました` : 'チャプターが見つかりませんでした');
  } catch(e) { window.toast?.('⚠️ 取得エラー: ' + e.message); if (btn) { btn.textContent = '再取得'; btn.disabled = false; } }
}

export function vpRefetchChapters(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v?.ytId) return;
  if (window._ytToken) {
    _doFetchChapters(id, window._ytToken);
    return;
  }
  // トークンがない場合は認証してから実行
  const tc = google.accounts.oauth2.initTokenClient({
    client_id: '502684957551-bal1rfuj3vanhu1j6p452bsvc6gmcp7u.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    callback: async (resp) => {
      if (resp.error) { window.toast?.('⚠️ 認証エラー: ' + resp.error); return; }
      window._ytToken = resp.access_token;
      await _doFetchChapters(id, resp.access_token);
    }
  });
  tc.requestAccessToken();
}
window.vpRefetchChapters = vpRefetchChapters;

export function vpChapterClick(sec) { _seekTo(sec); }
window.vpChapterClick = vpChapterClick;

function _bookmarkSectionHTML(id) {
  const hasAB = _ab.a != null && _ab.b != null && _ab.loop;
  const bmBtnLabel = hasAB ? '＋ ループ区間をブックマーク' : '＋ 現在位置でブックマーク';
  const bmBtnOnclick = hasAB ? `vpAddAbBm('${id}')` : `vpAddBm('${id}')`;
  const bmBtnStyle = hasAB
    ? 'font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;font-weight:600;'
    : 'font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;';
  return `
    <div class="vp-row" id="vp-bm-section-${id}">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:4px">
        <span class="vp-lbl" style="margin-bottom:0">🔖 ブックマーク</span>
        <button onclick="${bmBtnOnclick}" id="vp-bm-add-btn-${id}" style="${bmBtnStyle}">${bmBtnLabel}</button>
      </div>
      <div style="width:100%">
        <div id="vp-bm-list-${id}">${_bookmarkListHTML(id)}</div>
      </div>
    </div>`;
}

// ブックマークのラベルをインライン編集
export function vpEditBm(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const bm = v.bookmarks[idx];
  const dispEl = document.getElementById(`vp-bm-label-disp-${id}-${idx}`);
  if (!dispEl) return;
  const inp = document.createElement('input');
  inp.value = bm.label || '';
  inp.style.cssText = 'flex:1;font-size:11px;padding:2px 6px;border:1.5px solid var(--accent);border-radius:5px;background:var(--surface);color:var(--text);font-family:inherit;min-width:0;width:100%';
  inp.placeholder = 'ラベルを入力...';
  dispEl.replaceWith(inp);
  inp.focus({ preventScroll: true }); inp.select();
  const commit = () => {
    bm.label = inp.value.trim();
    window.debounceSave?.();
    _refreshBmList(id);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); _refreshBmList(id); }
  });
}

export function vpSaveBmLabel(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const inp = document.getElementById(`vp-bm-label-edit-${id}-${idx}`);
  if (inp) v.bookmarks[idx].label = inp.value.trim();
  window.debounceSave?.();
  _refreshBmList(id);
}

// 時間編集パネルの開閉
export function vpTogBmTimeEditor(id, idx) {
  const el = document.getElementById(`vp-bm-time-editor-${id}-${idx}`);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── ブックマーク時間編集（新仕様）──

// パース補助: "m:ss" or "ss" → 秒数
function _parseBmTime(val) {
  val = val.trim();
  if (!val) return null;
  if (val.includes(':')) {
    const parts = val.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

// アクティブフィールド管理（start / end）
const _bmActiveField = {};
export function vpSetActiveBmField(id, idx, field) {
  _bmActiveField[`${id}-${idx}`] = field;
}

// ±秒で指定フィールドを調整
export function vpAdjustBmField(id, idx, field, delta) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const bm = v.bookmarks[idx];
  if (field === 'start') {
    bm.time = Math.max(0, bm.time + delta);
  } else {
    const base = bm.endTime != null ? bm.endTime : bm.time;
    bm.endTime = Math.max(0, base + delta);
  }
  _refreshBmList(id);
  window.debounceSave?.();
}

// 後方互換: 旧vpAdjustBmTime は start フィールドを操作
export function vpAdjustBmTime(id, idx, delta) {
  vpAdjustBmField(id, idx, 'start', delta);
}

// 現在地を指定フィールドにセット
export function vpSetBmFieldToCurrent(id, idx, field) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const cur = _getCurrentTime();
  if (cur == null) { window.toast?.('動画を再生中に操作してください'); return; }
  if (field === 'start') {
    v.bookmarks[idx].time = cur;
    v.bookmarks.sort((a, b) => a.time - b.time);
  } else {
    v.bookmarks[idx].endTime = cur;
  }
  window.debounceSave?.();
  _refreshBmList(id);
  window.toast?.(`🔖 ${field === 'start' ? '開始' : '終了'}を ${_formatTime(cur)} に更新しました`);
}

// 後方互換
export function vpSetBmTimeToCurrent(id, idx) {
  vpSetBmFieldToCurrent(id, idx, 'start');
}

// 直接入力で指定フィールドを確定
export function vpSetBmTimeFromInput(id, idx, field) {
  field = field || 'start';
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const inpId = field === 'start'
    ? `vp-bm-time-inp-${id}-${idx}`
    : `vp-bm-end-inp-${id}-${idx}`;
  const inp = document.getElementById(inpId);
  if (!inp) return;
  if (field === 'end' && inp.value.trim() === '') {
    // 空なら終了時間を削除
    delete v.bookmarks[idx].endTime;
    window.debounceSave?.();
    _refreshBmList(id);
    window.toast?.('終了時間を削除しました');
    return;
  }
  const sec = _parseBmTime(inp.value);
  if (sec == null || sec < 0) { window.toast?.('正しい時間を入力してください（例: 1:30 または 90）'); return; }
  if (field === 'start') {
    v.bookmarks[idx].time = sec;
    v.bookmarks.sort((a, b) => a.time - b.time);
  } else {
    v.bookmarks[idx].endTime = sec;
  }
  window.debounceSave?.();
  _refreshBmList(id);
  window.toast?.(`🔖 ${field === 'start' ? '開始' : '終了'}を ${_formatTime(sec)} に設定しました`);
}

// 開始時間 + delta秒 を終了時間にセット
export function vpSetBmEndFromStart(id, idx, delta) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  v.bookmarks[idx].endTime = v.bookmarks[idx].time + delta;
  window.debounceSave?.();
  _refreshBmList(id);
  window.toast?.(`終了を ${_formatTime(v.bookmarks[idx].endTime)} にセットしました`);
}

// 終了時間を削除（通常BMに戻す）
export function vpClearBmEnd(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  delete v.bookmarks[idx].endTime;
  window.debounceSave?.();
  _refreshBmList(id);
  window.toast?.('終了時間を削除しました');
}

export function vpAddBm(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;
  const time = _getCurrentTime();
  if (time == null) { window.toast?.('動画を再生中にブックマークしてください'); return; }
  if (!v.bookmarks) v.bookmarks = [];
  v.bookmarks.push({ time, label: '', note: '' });
  v.bookmarks.sort((a, b) => a.time - b.time);
  _refreshBmList(id);
  window.debounceSave?.();
  window.toast?.('🔖 ' + _formatTime(time) + ' を記録しました');
}

export function vpAddAbBm(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;
  if (_ab.a == null || _ab.b == null) { window.toast?.('A点・B点をセットしてください'); return; }
  if (!v.bookmarks) v.bookmarks = [];
  v.bookmarks.push({ time: _ab.a, endTime: _ab.b, label: '', note: '' });
  v.bookmarks.sort((a, b) => a.time - b.time);
  _refreshBmList(id);
  window.debounceSave?.();
  window.toast?.('🔖 ' + _formatTime(_ab.a) + ' → ' + _formatTime(_ab.b) + ' を記録しました');
}

export function vpDeleteBm(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks) return;
  v.bookmarks.splice(idx, 1);
  _refreshBmList(id);
  window.debounceSave?.();
}

export function vpSeekBm(id, time) {
  _seekTo(time);
}

// ブックマークの時間をAB再生のA点またはB点にセット
export function vpAbSetFromBm(time, point) {
  _ab[point] = time;
  _abRefresh();
  window.toast?.(`${point.toUpperCase()}点を ${_formatTime(time)} にセットしました`);
}

function _refreshBmList(id, flashIdx) {
  // Search VP が開いている場合はそのコンテナ内を優先検索
  let el = null;
  if (window._srVpOpen) {
    const srScroll = document.getElementById('yt-sr-vp-scroll');
    if (srScroll) el = srScroll.querySelector('#vp-bm-list-' + id);
  }
  if (!el) el = document.getElementById('vp-bm-list-' + id);
  if (el) {
    // スクロール位置を保持（innerHTML置換でジャンプしないように）
    const _scrollWrap = document.getElementById('vpanel-edit-wrap');
    const _savedScroll = _scrollWrap ? _scrollWrap.scrollTop : 0;
    el.innerHTML = _bookmarkListHTML(id);
    if (_scrollWrap && flashIdx == null) _scrollWrap.scrollTop = _savedScroll;
    // スライダーのmax値をプレイヤーから取得
    try {
      const dur = _ytPlayer?.getDuration?.();
      if (dur && dur > 0) {
        el.querySelectorAll('.vp-bm-sl').forEach(sl => { sl.max = Math.floor(dur); });
      }
    } catch(e) {}
    // スライダーのイベントをバインド
    el.querySelectorAll('.vp-bm-sl').forEach(sl => {
      sl.addEventListener('input', _onBmSliderInput);
      sl.addEventListener('change', _onBmSliderInput);
    });
    // フラッシュアニメーション（新規追加・保存後）
    if (flashIdx != null) {
      const items = el.querySelectorAll('[data-bm-idx]');
      const target = el.querySelector(`[data-bm-idx="${flashIdx}"]`);
      if (target) {
        target.style.transition = 'none';
        target.style.outline = '3px solid var(--accent,#c8831a)';
        target.style.outlineOffset = '2px';
        target.style.boxShadow = '0 0 0 6px rgba(200,131,26,0.35)';
        target.style.borderRadius = '6px';
        setTimeout(() => {
          target.style.transition = 'outline 1.2s, box-shadow 1.2s';
          target.style.outline = '3px solid transparent';
          target.style.boxShadow = 'none';
        }, 400);
        // スクロールして見えるように
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
      }
    }
  }
}

function _onBmSliderInput(e) {
  const sl = e.target;
  const vid = sl.dataset.vid, idx = parseInt(sl.dataset.idx), field = sl.dataset.field;
  const val = parseInt(sl.value);
  const v = (window.videos||[]).find(v => v.id === vid);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  // 初回操作前にスナップショットを保存（なければ）
  const snapKey = vid + '-' + idx;
  if (!window._vpBmSnapshot) window._vpBmSnapshot = {};
  if (!window._vpBmSnapshot[snapKey]) {
    window._vpBmSnapshot[snapKey] = JSON.parse(JSON.stringify(v.bookmarks[idx]));
  }
  if (field === 'start') v.bookmarks[idx].time = val;
  else v.bookmarks[idx].endTime = val;
  // 新タブUI: スライダーの近くにある大きな時間表示を更新
  // data-bm-idx行の中のDM Mono 20px要素を探す
  const row = sl.closest('[data-bm-idx]');
  if (row) {
    // 新UIの時間表示（font-size:20px のDM Mono div）
    const timeDisp = row.querySelector('div[style*="font-size:20px"]');
    if (timeDisp) timeDisp.textContent = _formatTime(val);
    // 旧UI対応（念のため）
    const oldDisp = document.getElementById(`vp-tf-disp-${field}-${vid}-${idx}`);
    if (oldDisp) oldDisp.textContent = _formatTime(val);
    // ブックマーク行の時間バッジも更新
    const timeBadge = row.querySelector('button[style*="DM Mono"], button[style*="font-family"]');
    if (timeBadge) {
      const bm = v.bookmarks[idx];
      const hasEnd = bm.endTime != null;
      const tl = hasEnd ? `${_formatTime(bm.time)} → ${_formatTime(bm.endTime)}` : _formatTime(bm.time);
      timeBadge.textContent = tl;
    }
  }
}

// BMタイムスタンプタップの挙動
export function vpBmTimeClick(id, idx, startTime, endTime) {
  if (endTime != null) {
    // AB BM → A/B同時セット＋ループ開始
    _ab.a = startTime; _ab.b = endTime;
    _ab.loop = false;
    clearInterval(_ab.timer); _ab.timer = null;
    vpAbToggleLoop();
  } else {
    // 通常BM → ABリセット＋再生
    _ab.a = null; _ab.b = null; _ab.loop = false; _ab.setMode = null;
    clearInterval(_ab.timer); _ab.timer = null;
    _abCloseQuickPanel();
    _seekTo(startTime);
    _abRefresh(id);
  }
}

// 編集パネルのトグル
export function vpBmToggleEdit(id, idx) {
  if (!window._vpBmExpanded) window._vpBmExpanded = {};
  const vid = id;
  if (window._vpBmExpanded[vid] === idx) {
    delete window._vpBmExpanded[vid];
  } else {
    window._vpBmExpanded[vid] = idx;
    // 編集開始時にスナップショットを保存
    const v = (window.videos||[]).find(v => v.id === id);
    if (v && v.bookmarks && v.bookmarks[idx]) {
      if (!window._vpBmSnapshot) window._vpBmSnapshot = {};
      window._vpBmSnapshot[id+'-'+idx] = JSON.parse(JSON.stringify(v.bookmarks[idx]));
    }
  }
  _refreshBmList(id);
}

// フィールドアクティブ化（アコーディオン切り替え）
export function vpBmActivateField(id, idx, field) {
  if (!window._vpBmActiveField) window._vpBmActiveField = {};
  const key = id + '-' + idx;
  // 同じフィールドをタップしたらトグル（閉じる）→ 開始に戻す
  if (window._vpBmActiveField[key] === field) {
    window._vpBmActiveField[key] = field === 'start' ? 'end' : 'start';
  } else {
    window._vpBmActiveField[key] = field;
  }
  _refreshBmList(id);
}

// 保存
export function vpBmSave(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const lbl = document.getElementById(`vp-bm-lbl-${id}-${idx}`);
  const nte = document.getElementById(`vp-bm-note-${id}-${idx}`);
  if (lbl) v.bookmarks[idx].label = lbl.value.trim();
  if (nte) v.bookmarks[idx].note  = nte.value.trim();
  v.bookmarks.sort((a, b) => a.time - b.time);
  // 保存後のインデックス（ソート後の位置）を特定
  const savedTime = v.bookmarks[idx]?.time;
  const newIdx = savedTime != null ? v.bookmarks.findIndex(b => b.time === savedTime) : idx;
  if (!window._vpBmExpanded) window._vpBmExpanded = {};
  delete window._vpBmExpanded[id];
  if (window._vpBmSnapshot) delete window._vpBmSnapshot[id+'-'+idx];
  window.debounceSave?.();
  _refreshBmList(id, newIdx);
  window.toast?.('🔖 保存しました');
}

// 閉じる（変更を破棄）
export function vpBmClose(id, idx) {
  if (!window._vpBmExpanded) window._vpBmExpanded = {};
  delete window._vpBmExpanded[id];
  if (window._vpBmActiveField) delete window._vpBmActiveField[id+'-'+idx];
  if (window._vpBmSnapshot) delete window._vpBmSnapshot[id+'-'+idx];
  _refreshBmList(id);
}

// リセット（スナップショットから元の値に戻す）
export function vpBmReset(id, idx) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v || !v.bookmarks || !v.bookmarks[idx]) return;
  const snap = window._vpBmSnapshot?.[id+'-'+idx];
  if (snap) {
    v.bookmarks[idx] = JSON.parse(JSON.stringify(snap));
  }
  _refreshBmList(id);
}

// ── VPanel オープン/クローズ（モバイル用） ──
export function vpNav(dir) {
  const cur = window.openVPanelId;
  if (!cur) return;
  const raw = window._noteVidList || window._vpFilteredList || window.filteredVideos || window.videos || [];
  const list = window._noteVidList ? raw : _vplSort(raw);
  const idx = list.findIndex(v => v.id === cur);
  if (idx < 0) return;
  const next = list[(idx + dir + list.length) % list.length];
  if (next) openVPanel(next.id);
}

export function openVPanel(id) {
  const menu = document.getElementById('org-col-menu');
  if (menu) menu.remove();
  // Notesタブで再生中のインライン動画があれば一時停止
  window._notesPauseAllInlineVideos?.();
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;
  // カード要素がなければ（Organizeタブ等）ビデオオブジェクトから算出
  const card = document.getElementById('card-' + id);
  let emb, ext, plat;
  if (card) {
    emb  = card.dataset.emb;
    ext  = card.dataset.ext;
    plat = card.dataset.plat;
  } else {
    const isYT = v.pt === 'youtube';
    const isGD = v.pt === 'gdrive';
    const isX  = v.pt === 'x';
    const ytId = v.ytId || (isYT ? v.id : '');
    const gdId = isGD ? (v.id || '').replace('gd-', '') : '';
    const vmId = (!isYT && !isGD && !isX) ? (v.id || '').replace('yt-', '') : '';
    const xId  = isX ? (v.xTweetId || (v.id || '').replace('x-', '')) : '';
    plat = isYT ? 'yt' : isGD ? 'gd' : isX ? 'x' : 'vm';
    emb  = isYT ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
         : isGD ? `https://drive.google.com/file/d/${gdId}/preview`
         : isX  ? `https://platform.twitter.com/embed/Tweet.html?id=${xId}&lang=ja&theme=light&dnt=true&frame=false&hideCard=false&hideThread=false`
         : `https://player.vimeo.com/video/${vmId}?${v.vmHash ? `h=${v.vmHash}&` : ''}autoplay=1`;
    ext  = isYT ? `https://www.youtube.com/watch?v=${ytId}`
         : isGD ? `https://drive.google.com/file/d/${gdId}/view`
         : isX  ? `https://x.com/${v.xUser || 'i'}/status/${xId}`
         : `https://vimeo.com/${vmId}${v.vmHash ? '/' + v.vmHash : ''}`;
  }

  // Androidバックボタン対応: パネルを開いた時にhistory entryを追加
  // 既にVPanelが開いている（J/Kで切替）場合はreplaceStateで上書き
  if (window.openVPanelId && history.state?.vpanel) {
    history.replaceState({ vpanel: id }, '');
  } else {
    history.pushState({ vpanel: id }, '');
  }
  window.openVPanelId = id;
  _snapshotTags(v);  // AI動画のタグ状態をスナップショット（フィードバック検出用）
  v.lastPlayed = Date.now();
  v.playCount = (v.playCount || 0) + 1;
  window.debounceSave?.();
  const panel    = document.getElementById('vpanel');
  const editArea = document.getElementById('vpanel-edit-area');

  const autoplayEl = document.getElementById('setting-autoplay');
  const autoplay   = autoplayEl ? autoplayEl.checked : true;

  // 再生速度を保存（次の動画に引き継ぐ）
  if (_ytPlayer && _ytPlayerReady)  { try { const r = _ytPlayer.getPlaybackRate(); if (isFinite(r) && r > 0) _vpPlaybackRate = r; } catch(e) {} }
  else if (_gdVideoEl)               { _vpPlaybackRate = _gdVideoEl.playbackRate || 1; }
  // Vimeo は playbackratechange イベントで _vpPlaybackRate をキャッシュ済み

  // YT→YT 遷移かどうか（プレイヤー再利用で autoplay を確実にするため）
  const isYTtoYT = plat === 'yt' && _vpCurrentPlat === 'yt' && _ytPlayer && _ytPlayerReady;
  _vpCurrentPlat = plat;

  // GDriveリセット — pause・タイマー・clickハンドラをすべて解除してから参照を切る
  if (_gdVideoEl) { try { _gdVideoEl.pause(); } catch(e) {} }
  clearTimeout(_gdPauseTimer); _gdPauseTimer = null;
  clearTimeout(_gdSeekTimer); _gdSeekTimer = null; _gdIntendedTime = null;
  clearTimeout(_gdStallTimer); _gdStallTimer = null;
  const _gdResetContainer = document.getElementById('vpanel-iframe-container');
  if (_gdContainerClick && _gdResetContainer) { _gdResetContainer.removeEventListener('click', _gdContainerClick); }
  _gdContainerClick = null;
  _gdVideoEl = null; _gdFileId = null;
  const iframeContainer = document.getElementById('vpanel-iframe-container');
  // YT→YT の場合はプレイヤーを破棄しない（再利用して autoplay を保持する）
  if (iframeContainer && !isYTtoYT) {
    iframeContainer.innerHTML = '<div id="vpanel-yt-player"></div>';
  }

  // タイトル+時間表示+☰リストボタンを左カラム（動画の下）に表示
  const titleEl = document.getElementById('vpanel-title-area');
  if (titleEl) {
    const chName = v.channel || v.ch || '';
    const navBtn = "flex-shrink:0;width:26px;height:26px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1";
    const iconBtn = "flex-shrink:0;width:26px;height:26px;border-radius:6px;border:1.5px solid;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s,border-color .15s,color .15s;position:relative";
    const mirrorActive = window._vpMirrored;
    const mirrorBtn = `flex-shrink:0;width:30px;height:26px;border-radius:6px;border:1.5px solid ${mirrorActive ? 'var(--accent)' : 'var(--border)'};background:${mirrorActive ? 'rgba(229,196,122,.15)' : 'var(--surface2)'};color:${mirrorActive ? 'var(--accent)' : 'var(--text2)'};font-size:9px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-family:Georgia,serif;letter-spacing:-1px`;
    const repeatStyle = _repeatBtnStyle();
    const shuffleStyle = _shuffleBtnStyle();
    const ctrlSep = '<div style="width:1px;background:var(--border);align-self:stretch;flex-shrink:0;margin:3px 0"></div>';
    const srchSvg = `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
    const chHtml = chName ? `<div style="flex:1;min-width:0;font-size:9px;font-weight:600;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1">${chName}</div>${ctrlSep}` : '<div style="flex:1"></div>';
    const pencilSvg = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
    const gdFileId = plat === 'gd' ? id.replace(/^gd-/, '') : '';
    const driveOpenBtn = gdFileId ? `<a href="https://drive.google.com/file/d/${gdFileId}/view" target="_blank" rel="noopener" title="GDriveで開いて再生→サムネイル生成" style="flex-shrink:0;display:flex;align-items:center;gap:2px;color:var(--accent);font-size:9px;font-weight:600;text-decoration:none;line-height:1;white-space:nowrap;opacity:.75;transition:opacity .15s" onmouseover="this.style.opacity='1';this.style.textDecoration='underline'" onmouseout="this.style.opacity='.75';this.style.textDecoration='none'">↗ GDrive</a>` : '';
    titleEl.innerHTML = `
      <div style="padding:7px 10px 6px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:5px">
        <button onclick="closeVPanel()" style="flex-shrink:0;height:26px;padding:0 9px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-family:inherit">←Back</button>
        <div style="flex:1;min-width:0">
          <div id="vp-title-text-${id}" style="font-size:11px;font-weight:700;color:var(--text);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${v.title}</div>
          ${chName ? `<div style="font-size:9px;font-weight:600;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${chName}</div>` : ''}
        </div>
        <span id="vp-title-time" style="flex-shrink:0;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap;align-self:center"></span>
        <button id="vp-more-btn" onclick="vpTogMoreMenu(event,'${id}')" title="その他のアクション" style="${navBtn};font-size:14px;letter-spacing:-1px">•••</button>
        <button id="vp-tut-btn" onclick="window.vpStartTutorial?.()" title="使い方" style="${navBtn}">?</button>
      </div>
      <div id="vpanel-ctrl-row2" style="display:flex;align-items:center;gap:4px;padding:5px 8px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none">
        <button onclick="vpNav(-1)" title="前の動画" class="ab-skip-btn">⏮</button>
        <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px"></div>
        <button onclick="vpSkip(-60)" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">◀</span>1m</button>
        <button onclick="vpSkip(-30)" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">◀</span>30s</button>
        <button onclick="vpSkip(-10)" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">◀</span>10s</button>
        <button onclick="vpSkip(-3)" class="ab-skip-btn ab-skip-minus"><span class="ab-skip-arrow">◀</span>3s</button>
        <button onclick="vpSkip(3)" class="ab-skip-btn ab-skip-plus">3s<span class="ab-skip-arrow">▶</span></button>
        <button onclick="vpSkip(10)" class="ab-skip-btn ab-skip-plus">10s<span class="ab-skip-arrow">▶</span></button>
        <button onclick="vpSkip(30)" class="ab-skip-btn ab-skip-plus">30s<span class="ab-skip-arrow">▶</span></button>
        <button onclick="vpSkip(60)" class="ab-skip-btn ab-skip-plus">1m<span class="ab-skip-arrow">▶</span></button>
        <div style="width:1px;height:20px;background:var(--border);flex-shrink:0;margin:0 2px"></div>
        <button onclick="vpNav(1)" title="次の動画" class="ab-skip-btn">⏭</button>
      </div>`;
  }



  // プレイヤー初期化（panel hidden — API 未ロード時は非同期で後から初期化される）
  if (plat === 'yt') {
    const ytId = _extractYtId(emb);
    if (ytId) {
      if (isYTtoYT) {
        // プレイヤー再利用: loadVideoById は autoplay が保証される
        try {
          if (isFinite(_vpPlaybackRate) && _vpPlaybackRate !== 1) _ytPlayer.setPlaybackRate(_vpPlaybackRate);
          _ytPlayer.loadVideoById(ytId, 0);
          _startTimeDisplay();
        } catch(e) {
          // 失敗時は通常フロー（新規作成）にフォールバック
          if (iframeContainer) iframeContainer.innerHTML = '<div id="vpanel-yt-player"></div>';
          _initYTPlayer('vpanel-yt-player', ytId, autoplay, () => {});
        }
      } else {
        _initYTPlayer('vpanel-yt-player', ytId, autoplay, () => {});
      }
    }
  } else if (plat === 'x') {
    if (iframeContainer) {
      iframeContainer.innerHTML = `<iframe src="${emb}" allowfullscreen allow="autoplay;encrypted-media" style="width:100%;height:100%;border:none;background:#fff"></iframe>`;
    }
  } else if (plat === 'gd') {
    const fileIdMatch = emb.match(/\/d\/([^/]+)\//);
    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    if (iframeContainer && fileId) {
      _playGDriveVideo(iframeContainer, fileId);
    }
  } else {
    if (iframeContainer) {
      const src = autoplay ? (emb.includes('?') ? emb + '&autoplay=1' : emb + '?autoplay=1') : emb;
      iframeContainer.innerHTML = `<iframe id="vpanel-vm-iframe" src="${src}" allowfullscreen allow="autoplay;encrypted-media" style="width:100%;height:100%;border:none"></iframe>`;
      _vmCurTime = 0; _vmDuration = 0;
      if (_vmPlayer) { try { _vmPlayer.destroy(); } catch(e) {} _vmPlayer = null; }
      _loadVimeoApi().then(() => {
        const ifr = document.getElementById('vpanel-vm-iframe');
        if (!ifr) return;
        try {
          _vmPlayer = new Vimeo.Player(ifr);
          _vmPlayer.getDuration().then(d => { _vmDuration = d || 0; }).catch(()=>{});
          _vmPlayer.on('timeupdate', (data) => { _vmCurTime = data.seconds || 0; });
          _vmPlayer.on('playbackratechange', (data) => { _vpPlaybackRate = data.playbackRate || 1; });
          _vmPlayer.on('ended', () => { _vpHandleEnded(); });
          _vmPlayer.on('loaded', () => {
            _vmPlayer.getDuration().then(d => { _vmDuration = d || 0; }).catch(()=>{});
            if (_vpPlaybackRate !== 1) _vmPlayer.setPlaybackRate(_vpPlaybackRate).catch(()=>{});
          });
          _startTimeDisplay();
        } catch(e) { console.warn('Vimeo player init error', e); }
      });
    }
  }

  // UI 全て同期レンダリング（panel hidden のまま — 1回の reflow に集約）
  const skipArea = document.getElementById('vpanel-skip-area');
  if (skipArea) skipArea.innerHTML = '';

  const abArea = document.getElementById('vpanel-ab-area');
  if (abArea) abArea.innerHTML = _abBarHTML();

  const bmContainer = document.getElementById('vpanel-bm-area');
  if (bmContainer) {
    const vid = window.openVPanelId || id;
    const vd = (window.videos||[]).find(vx => vx.id === vid);
    const _isOwner = window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com';
    const _canSummarize = _isOwner && (
      (vd?.pt === 'youtube' && vd?.ytId) ||
      (vd?.pt === 'gdrive')
    );
    const _sumBtn = _canSummarize
      ? `<button id="vp-aisum-${vid}" onclick="vpAiSummary('${vid}')" title="この動画をAIで要約しMemoに追記"
           style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--accent,#6c8cff);background:transparent;color:var(--accent,#6c8cff);cursor:pointer;vertical-align:middle">✨ AI要約</button>`
      : '';
    const _snapBtn = `<button id="vp-snap-now-btn-${vid}" onclick="vpMemoSnapNow('${vid}')" title="現在のフレームをスクショしてメモに挿入"
           style="margin-left:6px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">📸</button>`;
    bmContainer.innerHTML = _chapterSectionHTML(vid) + _bookmarkSectionHTML(vid)
      + `<div class="vp-row" id="vp-memo-row-${vid}" style="margin-top:8px">
          <span class="vp-lbl">Memo${_sumBtn}${_snapBtn}</span>
          ${_memoToolbarHTML(vid)}
          <div class="vp-memo" id="vp-memo-${vid}" contenteditable="true"
            onblur="vpSaveMemo('${vid}')"
            oninput="clearTimeout(this._t);this._t=setTimeout(()=>vpSaveMemo('${vid}'),800)"></div>
        </div>
        <div id="vp-snap-section-${vid}"></div>`;
    _initMemoEditor(vid, vd?.memo||'');
    if (window.initSnapshotSection) {
      window.initSnapshotSection(vid, document.getElementById('vp-snap-section-' + vid));
    }
  }

  editArea.innerHTML = buildDrawerHTML(id);
  _bindDrawerEvents(editArea, id);

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.querySelector('.main-area')?.classList.add('vpanel-main-blur');

  window.scrollTo(0, 1);
  setTimeout(() => _vpUpdateOrientation(), 80);
  // blur-area: パネル表示後に遅延描画（770件のDOM生成を初期表示からずらす）
  setTimeout(() => _renderBlurArea(id), 200);
}

// ── プレイリスト並べ替え状態 ──
let _vplSortKey = localStorage.getItem('wk_vplSortKey') || 'addedAt';
let _vplSortAsc = (() => { const v = localStorage.getItem('wk_vplSortAsc'); return v === null ? false : v === 'true'; })();

function _vplSort(list) {
  const key = _vplSortKey;
  const asc = _vplSortAsc;
  const sorted = [...list];
  sorted.sort((a, b) => {
    let va, vb;
    if (key === 'addedAt') {
      const ea = !a.addedAt, eb = !b.addedAt;
      if (ea && eb) return 0; if (ea) return 1; if (eb) return -1;
      va = a.addedAt; vb = b.addedAt;
    } else if (key === 'title') {
      va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase();
    } else if (key === 'status') {
      const ord = { '未着手': 0, '理解': 1, '把握': 1, '練習中': 2, '習得中': 2, 'マスター': 3 };
      va = ord[a.status] ?? 9; vb = ord[b.status] ?? 9;
    } else if (key === 'lastPlayed') {
      va = a.lastPlayed || 0; vb = b.lastPlayed || 0;
    } else if (key === 'duration') {
      va = a.duration || 0; vb = b.duration || 0;
    }
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
  return sorted;
}

window.vplSetSort = function(key) {
  _vplSortKey = key;
  localStorage.setItem('wk_vplSortKey', key);
  document.querySelectorAll('.vpl-sort-sel').forEach(s => { s.value = key; });
  _rerenderVpl();
};
window.vplToggleDir = function() {
  _vplSortAsc = !_vplSortAsc;
  localStorage.setItem('wk_vplSortAsc', _vplSortAsc);
  document.querySelectorAll('.vpl-sort-dir').forEach(b => { b.textContent = _vplSortAsc ? '↑' : '↓'; });
  _rerenderVpl();
};

function _rerenderVpl() {
  const id = window.openVPanelId;
  if (!id) return;
  _renderBlurArea(id);
  // ボトムシートが開いていれば再描画
  if (document.getElementById('vp-bs-sheet')?.classList.contains('open')) {
    window.vpOpenNextList();
  }
}

function _vplSortRow() {
  const dir = _vplSortAsc ? '↑' : '↓';
  return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:4px 10px">
    <select class="vpl-sort-sel" onchange="vplSetSort(this.value)" style="width:110px;font-size:10px;padding:3px 5px;border-radius:7px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;cursor:pointer">
      <option value="addedAt"${_vplSortKey==='addedAt'?' selected':''}>追加日</option>
      <option value="title"${_vplSortKey==='title'?' selected':''}>タイトル</option>
      <option value="status"${_vplSortKey==='status'?' selected':''}>習得度</option>
      <option value="lastPlayed"${_vplSortKey==='lastPlayed'?' selected':''}>最近再生した</option>
      <option value="duration"${_vplSortKey==='duration'?' selected':''}>再生時間</option>
    </select>
    <button class="vpl-sort-dir" onclick="vplToggleDir()" style="font-size:11px;padding:3px 7px;border-radius:7px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer" title="昇降順切替">${dir}</button>
  </div>`;
}

// ── blur-area: 次の動画リスト ──
function _renderBlurArea(id) {
  const area = document.getElementById('vpanel-blur-area');
  if (!area) return;

  // フィルター済み配列を優先、なければ全件
  const all = window._noteVidList || window._vpFilteredList || window.filteredVideos || window.videos || [];
  const idx = all.findIndex(v => v.id === id);
  if (idx < 0) { area.innerHTML = ''; return; }

  // _noteVidList は手動順を保持、それ以外はソート（最大20件）
  const _filtered = all.filter((_, i) => i !== idx);
  const candidates = (window._noteVidList ? _filtered : _vplSort(_filtered)).slice(0, 20);

  if (candidates.length === 0) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div style="padding:7px 10px 3px;font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--text3);text-transform:uppercase">次の動画</div>
    ${window._noteVidList ? '' : _vplSortRow()}
    ${candidates.map((rv) => {
      const ytId = _extractYtId(rv.emb || '');
      const gdId = (rv.id||'').replace(/^gd-/,'');
      const thumb = rv.thumb || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : rv.pt === 'gdrive' ? `https://drive.google.com/thumbnail?id=${gdId}&sz=w320` : '');
      return `<div onclick="openVPanel('${rv.id}')" style="display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:pointer;transition:background .12s;border-top:1px solid var(--border2)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <div style="width:64px;height:36px;border-radius:4px;overflow:hidden;flex-shrink:0;background:var(--surface3)">
          ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none'">` : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:600;color:var(--text);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${rv.title || '(タイトルなし)'}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:1px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${rv.channel || ''}</div>
        </div>
      </div>`;
    }).join('')}`;
}

// ── ☰ ボトムシート: 次の動画リスト（ポートレート用） ──
function _ensureBottomSheet() {
  if (document.getElementById('vp-bs-overlay')) return;
  const css = document.createElement('style');
  css.textContent = `
#vp-bs-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.45);opacity:0;transition:opacity .2s;pointer-events:none}
#vp-bs-overlay.open{opacity:1;pointer-events:auto}
#vp-bs-sheet{position:fixed;left:0;right:0;bottom:0;z-index:401;background:var(--surface);border-radius:16px 16px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.2);max-height:var(--zvh-60,60vh);transform:translateY(100%);transition:transform .25s ease;display:flex;flex-direction:column}
#vp-bs-sheet.open{transform:translateY(0)}
#vp-bs-handle{padding:10px 0 6px;text-align:center;cursor:grab;flex-shrink:0}
#vp-bs-handle::after{content:'';display:inline-block;width:36px;height:4px;border-radius:2px;background:var(--border)}
#vp-bs-hdr{padding:0 14px 8px;font-size:11px;font-weight:700;color:var(--text3);flex-shrink:0}
#vp-bs-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom,0)}
#vp-bs-list .bs-item{display:flex;gap:8px;align-items:center;padding:8px 14px;cursor:pointer;border-top:1px solid var(--border2);transition:background .12s}
#vp-bs-list .bs-item:hover{background:var(--surface2)}
#vp-bs-list .bs-item.now{background:var(--accent-bg,rgba(59,130,246,.08));border-left:3px solid var(--accent)}
#vp-bs-list .bs-thumb{width:56px;height:32px;border-radius:4px;overflow:hidden;flex-shrink:0;background:var(--surface3)}
#vp-bs-list .bs-thumb img{width:100%;height:100%;object-fit:cover;display:block}
#vp-bs-list .bs-info{flex:1;min-width:0}
#vp-bs-list .bs-title{font-size:11px;font-weight:600;color:var(--text);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#vp-bs-list .bs-ch{font-size:9px;color:var(--text3);margin-top:1px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}`;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend',
    `<div id="vp-bs-overlay" onclick="vpCloseNextList()"></div>
     <div id="vp-bs-sheet">
       <div id="vp-bs-handle"></div>
       <div id="vp-bs-hdr">次の動画</div>
       <div id="vp-bs-list"></div>
     </div>`);
}

window.vpOpenNextList = function () {
  _ensureBottomSheet();
  const id = window.openVPanelId;
  const all = window._noteVidList || window._vpFilteredList || window.filteredVideos || window.videos || [];
  const list = document.getElementById('vp-bs-list');
  if (!list) return;
  const hdr = document.getElementById('vp-bs-hdr');
  if (hdr) hdr.innerHTML = `次の動画${_vplSortRow()}`;
  const sorted = _vplSort(window._noteVidList ? all : all.slice(0, 30));
  const displayAll = sorted;
  list.innerHTML = displayAll.map(rv => {
    const isCur = rv.id === id;
    const ytId = _extractYtId(rv.emb || '');
    const _gdId2 = (rv.id||'').replace(/^gd-/,'');
    const thumb = rv.thumb || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : rv.pt === 'gdrive' ? `https://drive.google.com/thumbnail?id=${_gdId2}&sz=w320` : '');
    return `<div class="bs-item${isCur ? ' now' : ''}" onclick="${isCur ? '' : `openVPanel('${rv.id}');vpCloseNextList()`}">
      <div class="bs-thumb">${thumb ? `<img src="${thumb}" loading="lazy" onerror="this.style.display='none'">` : ''}</div>
      <div class="bs-info"><div class="bs-title">${rv.title || '(タイトルなし)'}</div><div class="bs-ch">${rv.channel || ''}</div></div>
    </div>`;
  }).join('');
  // 現在の動画までスクロール
  requestAnimationFrame(() => {
    const cur = list.querySelector('.now');
    if (cur) cur.scrollIntoView({ block: 'center' });
  });
  document.getElementById('vp-bs-overlay')?.classList.add('open');
  document.getElementById('vp-bs-sheet')?.classList.add('open');
};

window.vpCloseNextList = function () {
  document.getElementById('vp-bs-overlay')?.classList.remove('open');
  document.getElementById('vp-bs-sheet')?.classList.remove('open');
};

// ── タイトル編集 ──
window.vpEditTitle = function(id) {
  const v = (window.videos || []).find(v => v.id === id);
  if (!v) return;
  const titleEl = document.getElementById('vp-title-text-' + id);
  if (!titleEl) return;
  const cur = v.title || '';
  const input = document.createElement('input');
  input.type  = 'text';
  input.value = cur;
  input.style.cssText = 'flex:1;font-size:11px;font-weight:700;color:var(--text);line-height:1.35;border:none;border-bottom:1.5px solid var(--accent);outline:none;background:transparent;width:100%;padding:2px 0;font-family:inherit;';
  titleEl.replaceWith(input);
  input.focus({ preventScroll: true });
  input.select();
  const restore = (newTitle) => {
    const div = document.createElement('div');
    div.id = 'vp-title-text-' + id;
    div.style.cssText = 'flex:1;font-size:11px;font-weight:700;color:var(--text);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical';
    div.textContent = newTitle;
    input.replaceWith(div);
  };
  const save = () => {
    const val = input.value.trim();
    if (!val || val === cur) { restore(cur); return; }
    v.title = val;
    window.debounceSave?.();
    restore(val);
    // メイン画面カードのタイトルも即時反映
    const cardTitleEl = document.querySelector(`#card-${id} .card-title`);
    if (cardTitleEl) cardTitleEl.textContent = val;
    window.toast?.(`タイトルを変更しました`, 1500);
  };
  input.onblur  = save;
  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.onblur = null; restore(cur); }
  };
};

function _vpMirrorGetPos() {
  if (_ytPlayer && _ytPlayerReady) {
    try { return { cur: Math.floor(_ytPlayer.getCurrentTime() || 0), dur: Math.floor(_ytPlayer.getDuration() || 0) }; } catch(e) {}
  }
  if (_gdVideoEl) {
    return { cur: Math.floor(_gdVideoEl.currentTime || 0), dur: Math.floor(_gdVideoEl.duration || 0) };
  }
  if (_vmPlayer) {
    return { cur: Math.floor(_vmCurTime || 0), dur: Math.floor(_vmDuration || 0) };
  }
  return { cur: 0, dur: 0 };
}

function _vpMirrorSeek(ratio) {
  if (_ytPlayer && _ytPlayerReady) {
    const dur = _ytPlayer.getDuration?.() || 0;
    if (dur > 0) _ytPlayer.seekTo(ratio * dur, true);
  } else if (_gdVideoEl) {
    const dur = _gdVideoEl.duration || 0;
    if (dur > 0) _gdVideoEl.currentTime = ratio * dur;
  } else if (_vmPlayer) {
    if (_vmDuration > 0) _vmPlayer.setCurrentTime(ratio * _vmDuration).catch(() => {});
  }
}

function _vpMirrorProgressToggle(on) {
  let bar = document.getElementById('vp-mirror-progress');

  if (!on) {
    if (bar) bar.style.display = 'none';
    clearInterval(_mirrorProgressTimer);
    _mirrorProgressTimer = null;
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'vp-mirror-progress';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 10px;height:22px;background:var(--surface2);flex-shrink:0;border-top:1px solid var(--border)';
    bar.innerHTML = `
      <div id="vp-mirror-pb-track" style="flex:1;height:4px;background:rgba(255,255,255,.12);border-radius:2px;position:relative;cursor:pointer">
        <div id="vp-mirror-pb-fill" style="height:100%;width:0%;background:var(--accent);border-radius:2px"></div>
      </div>
      <span id="vp-mirror-pb-time" style="flex-shrink:0;font-size:9px;font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap">0:00 / 0:00</span>
    `;
    bar.querySelector('#vp-mirror-pb-track').addEventListener('click', e => {
      const rect = e.currentTarget.getBoundingClientRect();
      _vpMirrorSeek((e.clientX - rect.left) / rect.width);
    });
    document.getElementById('vpanel-iframe-container')?.insertAdjacentElement('afterend', bar);
  }

  bar.style.display = 'flex';
  clearInterval(_mirrorProgressTimer);
  _mirrorProgressTimer = setInterval(() => {
    const { cur, dur } = _vpMirrorGetPos();
    const fill = document.getElementById('vp-mirror-pb-fill');
    const time = document.getElementById('vp-mirror-pb-time');
    if (fill && dur > 0) fill.style.width = `${(cur / dur) * 100}%`;
    if (time) time.textContent = `${_formatTime(cur)} / ${_formatTime(dur)}`;
  }, 500);
}

window.vpToggleMirror = function () {
  window._vpMirrored = !window._vpMirrored;
  const on = window._vpMirrored;
  const container = document.getElementById('vpanel-iframe-container');
  const btn = document.getElementById('vp-mirror-btn');

  if (btn) {
    btn.style.borderColor = on ? 'var(--accent)' : '';
    btn.style.color      = on ? 'var(--accent)' : '';
    btn.style.background = on ? 'rgba(229,196,122,.15)' : '';
  }
  if (container) container.style.transform = on ? 'scaleX(-1)' : '';
  _vpMirrorProgressToggle(on);

  // YouTube: controls:0/1 で再初期化
  if (_ytPlayer && _ytPlayerReady) {
    const videoId = _ytPlayer.getVideoData?.()?.video_id;
    const savedTime = _ytPlayer.getCurrentTime?.() || 0;
    if (videoId) {
      _initYTPlayer('vpanel-yt-player', videoId, true,
        () => { try { _ytPlayer.seekTo(savedTime, true); } catch(e) {} },
        on ? { controls: 0 } : {}
      );
    }
  }

};

export function closeVPanel() {
  try {
    // ボトムシートを閉じる
    window.vpCloseNextList?.();
    _ab.loop = false; clearInterval(_ab.timer); _ab.timer = null; _ab.a = null; _ab.b = null;
    _stopTimeDisplay();
    clearInterval(_mirrorProgressTimer); _mirrorProgressTimer = null;
    _vpMirrorProgressToggle(false);
    window._vpMirrored = false;
    const _mc = document.getElementById('vpanel-iframe-container'); if (_mc) _mc.style.transform = '';
    if (_gdVideoEl) { try { _gdVideoEl.pause(); } catch(e) {} _gdVideoEl = null; }
    clearTimeout(_gdPauseTimer); _gdPauseTimer = null;
    const _gdCloseContainer = document.getElementById('vpanel-iframe-container');
    if (_gdContainerClick && _gdCloseContainer) { _gdCloseContainer.removeEventListener('click', _gdContainerClick); }
    _gdContainerClick = null;
    _gdFileId = null;
    if (_vmPlayer) { try { _vmPlayer.unload(); _vmPlayer.destroy(); } catch(e) {} _vmPlayer = null; }
    _vmCurTime = 0; _vmDuration = 0;
    if (window.openVPanelId) {
      try { vpSave(window.openVPanelId); } catch(e) {}
    }
    _clearTagSnapshot();  // フィードバックスナップショットをクリア
    if (window.cleanupSnapshots) { try { window.cleanupSnapshots(); } catch(e) {} }
    if (_ytPlayer) {
      try { _ytPlayer.destroy(); } catch(e) {}
      _ytPlayer = null;
      _ytPlayerReady = false;
    }
    _vpCurrentPlat = null;
    const iframeContainer = document.getElementById('vpanel-iframe-container');
    if (iframeContainer) iframeContainer.innerHTML = '<div id="vpanel-yt-player"></div>';
    const panel = document.getElementById('vpanel');
    if (panel) panel.classList.remove('open');
    const inner = document.getElementById('vpanelInner');
    if (inner) inner.classList.remove('is-portrait');
    document.body.style.overflow = '';
    window.openVPanelId = null;
    window._noteVidList = null;
    document.querySelector('.main-area')?.classList.remove('vpanel-main-blur');
    // pushStateで追加した履歴エントリを除去（Xボタン/Escape経由の場合のみ）
    // バックボタン経由（_backButtonClosing）またはジャンプ遷移（_vpJumpClosing）なら back()不要
    if (!window._backButtonClosing && !window._vpJumpClosing && history.state?.vpanel) {
      history.back();
    }
    window._vpJumpClosing = false;
  } catch(e) {
    console.error('closeVPanel error:', e);
    const panel = document.getElementById('vpanel');
    if (panel) panel.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function _vpAutoLandscapeRatio() {
  // スマホ横向きのみ（innerHeight>500 = タブレット以上は除外）
  if (window.innerHeight > 500) return;
  if (window.innerWidth <= window.innerHeight) return;
  const leftCol   = document.getElementById('vpanel-left-col');
  const titleArea = document.getElementById('vpanel-title-area');
  const skipArea  = document.getElementById('vpanel-skip-area');
  if (!leftCol) return;
  const titleH = titleArea ? titleArea.offsetHeight : 52;
  const skipH  = skipArea  ? skipArea.offsetHeight  : 30;
  const availH = window.innerHeight - titleH - skipH;
  leftCol.style.width = Math.max(160, availH * (16 / 9)) + 'px';
}

function _vpUpdateOrientation() {
  const inner = document.getElementById('vpanelInner');
  if (!inner) return;
  inner.classList.toggle('is-portrait', window.innerHeight > window.innerWidth);
  if (window.innerWidth > window.innerHeight) {
    setTimeout(_vpAutoLandscapeRatio, 50);
  }
}

window.addEventListener('resize', () => {
  const panel = document.getElementById('vpanel');
  if (panel && panel.classList.contains('open')) _vpUpdateOrientation();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    window.scrollTo(0, 1);
    setTimeout(() => {
      const panel = document.getElementById('vpanel');
      if (panel && panel.classList.contains('open')) _vpUpdateOrientation();
    }, 150);
  }, 100);
});

// ── Google Drive 再生（Vercelプロキシ /api/drive 経由ストリーミング）──
// <video>はAuthorizationヘッダーを送れないため、/api/drive がBearerトークン付きで転送
function _playGDriveVideo(container, fileId) {
  _gdFileId  = fileId;
  _gdVideoEl = null;

  const token = window.getDriveTokenIfAvailable?.();
  if (!token) { _showGDriveAuthUI(container, fileId); return; }
  _createGDriveVideoEl(container, fileId, token);
}

function _createGDriveVideoEl(container, fileId, token) {
  const src = `/api/drive?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`;
  const video = document.createElement('video');
  video.src         = src;
  video.controls    = true;
  video.autoplay    = true;
  // iOS Safari はJS propertyではなくHTML attributeで判定するため両方必要
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.style.cssText = 'width:100%;height:100%;background:#000';
  // 停止後1秒でコントロール非表示（スクショ用）、タップで再生復帰
  video.addEventListener('pause', () => {
    clearTimeout(_gdPauseTimer);
    _gdPauseTimer = setTimeout(() => { video.controls = false; }, 1000);
  });
  video.addEventListener('play', () => {
    clearTimeout(_gdPauseTimer);
    _gdPauseTimer = null;
    video.controls = true;
  });
  _gdContainerClick = () => {
    if (video.paused && !video.controls) {
      video.controls = true;
      video.play().catch(() => {});
    }
  };
  container.addEventListener('click', _gdContainerClick);
  video.addEventListener('ratechange', () => { _vpPlaybackRate = video.playbackRate || 1; });
  video.addEventListener('play',  () => {
    if (isFinite(_vpPlaybackRate) && _vpPlaybackRate !== 1 && video.playbackRate !== _vpPlaybackRate) video.playbackRate = _vpPlaybackRate;
    _startTimeDisplay();
    clearTimeout(_gdStallTimer); _gdStallTimer = null;
  });
  video.addEventListener('playing', () => { clearTimeout(_gdStallTimer); _gdStallTimer = null; });
  video.addEventListener('seeked',  () => { clearTimeout(_gdStallTimer); _gdStallTimer = null; });
  video.addEventListener('waiting', () => {
    clearTimeout(_gdStallTimer);
    _gdStallTimer = setTimeout(() => {
      if (!_gdVideoEl || _gdVideoEl.paused) return;
      // バッファ停止から回復: currentTimeを微小に動かしてRange再要求
      _gdVideoEl.currentTime = _gdVideoEl.currentTime;
    }, 3000);
  });
  video.addEventListener('pause', () => { _stopTimeDisplay(); _updateTimeDisplay(); });
  video.addEventListener('ended', () => { _vpHandleEnded(); });
  video.addEventListener('error', () => {
    console.error('GDrive video error:', video.error?.code, video.error?.message, src);
    _onGDriveVideoError(container, fileId);
  });
  _gdVideoEl = video;
  container.innerHTML = '';
  container.appendChild(video);
  // autoplay属性だけではブラウザにブロックされる場合があるため明示的に再生を試みる
  video.play().catch(() => {});
}

function _showGDriveAuthUI(container, fileId, onAuth) {
  container.innerHTML = `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#000;padding:20px;box-sizing:border-box">
      <div style="color:var(--text3);font-size:13px;text-align:center;line-height:1.6">Googleドライブの動画を再生するには認証が必要です</div>
      <button id="gd-auth-play-btn" style="padding:10px 28px;background:var(--accent);color:var(--on-accent);border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">
        Googleで認証して再生
      </button>
    </div>`;
  const btn = container.querySelector('#gd-auth-play-btn');
  if (btn) btn.onclick = async () => {
    btn.textContent = '認証中...';
    btn.disabled = true;
    const token = await window.ensureDriveToken?.();
    if (token) {
      if (onAuth) { onAuth(token); return; }
      _createGDriveVideoEl(container, fileId, token);
      return;
    }
    btn.textContent = '認証に失敗しました。再試行';
    btn.disabled = false;
  };
}
window._showGDriveAuthUI = _showGDriveAuthUI;

function _onGDriveVideoError(container, fileId) {
  _gdVideoEl = null;
  _stopTimeDisplay();
  container.innerHTML = `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#000;padding:20px;box-sizing:border-box">
      <div style="color:var(--red,#f66);font-size:13px;text-align:center">再生に失敗しました</div>
      <div style="color:var(--text3);font-size:11px;text-align:center;line-height:1.6">認証の期限切れか、ファイルへのアクセス権がない可能性があります</div>
      <button id="gd-retry-btn" style="padding:10px 28px;background:var(--accent);color:var(--on-accent);border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">再認証して再生</button>
      <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank"
         style="color:var(--text2);font-size:11px;text-decoration:underline">Driveで開く</a>
    </div>`;
  const btn = container.querySelector('#gd-retry-btn');
  if (btn) btn.onclick = async () => {
    btn.textContent = '認証中...';
    btn.disabled = true;
    window.clearDriveToken?.();
    const token = await window.ensureDriveToken?.();
    if (token) { _createGDriveVideoEl(container, fileId, token); return; }
    btn.textContent = '認証に失敗しました。再試行';
    btn.disabled = false;
  };
}

// emb URLからYouTube video IDを抽出
function _extractYtId(emb) {
  const m = emb.match(/embed\/([^?&]+)/);
  return m ? m[1] : null;
}

export function togPlayerByCard(el) {
  const card = el.closest('.card');
  if (!card) return;
  openVPanel(card.dataset.id);
}

export function togPlayer(id)    { openVPanel(id); }
export function _closePlayer(id) { closeVPanel(); }

export function togVpDrawer(id) {
  const drawer  = document.getElementById('drawer-' + id);
  const editBtn = document.getElementById('vedit-' + id);
  if (!drawer) return;
  const isOpen = drawer.classList.contains('show');
  if (isOpen) {
    drawer.classList.remove('show');
    if (editBtn) editBtn.classList.remove('open');
  } else {
    drawer.innerHTML = buildDrawerHTML(id);
    drawer.classList.add('show');
    if (editBtn) editBtn.classList.add('open');
    _bindDrawerEvents(drawer, id);
  }
}

function _bindDrawerEvents(container, id) {
  container.querySelectorAll('.vp-tags-rm').forEach(el => { el.onclick = function() { vpRemoveTechEl(this); }; });
  container.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function() { vpRemovePosEl(this);  }; });
}

export function buildDrawerHTML(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return '';

  return `
    ${window.vpCounterSectionHTML ? window.vpCounterSectionHTML(id, { fav: v.fav }) : ''}
    <div class="fsec">
      <div class="fsec-title">チャンネル・プレイリスト</div>
      <div class="vp-row">
        <span class="vp-lbl">チャンネル</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          ${v.channel ? `<span class="chip active" id="vp-ch-badge-${id}" onclick="vpJumpToChannel('${id}')" style="cursor:pointer" title="タップしてチャンネルに絞り込む">${v.channel}</span>` : ''}
          ${v.pt === 'gdrive' ? `<div class="chip" style="border-style:dashed" onclick="vpTogChannelDd('${id}')">${v.channel ? '✎ 変更' : '＋ チャンネルを選ぶ'}</div>` : ''}
        </div>
        ${v.pt === 'gdrive' ? `<div class="vp-dd" id="vp-dd-ch-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..."
            oninput="vpRenderChannelDdList('${id}',this.value)"
            onkeydown="if(event.key==='Enter'&&this.value.trim()){vpSetChannel('${id}',this.value.trim());event.preventDefault();}if(event.key==='Escape'){this.closest('.vp-dd').style.display='none';}">
          <div class="vp-dd-list" id="vp-dd-list-ch-${id}"></div>
        </div>` : ''}
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">プレイリスト</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="chip active" id="vp-pl-badge-${id}" onclick="vpJumpToPlaylist('${id}')" style="cursor:pointer" title="タップしてプレイリストに絞り込む">${v.pl||'未分類'}</span>
          <div class="chip" style="border-style:dashed" onclick="vpTogPlNameDd('${id}')">✎ 変更・検索</div>
        </div>
        <div class="vp-dd" id="vp-dd-plname-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..."
            oninput="vpRenderPlNameDdList('${id}',this.value)"
            onkeydown="if(event.key==='Enter'&&this.value.trim()){vpSetPlName('${id}',this.value.trim());event.preventDefault();}if(event.key==='Escape'){this.closest('.vp-dd').style.display='none';}">
          <div class="vp-dd-list" id="vp-dd-list-plname-${id}"></div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','move')">↪ 移動</button>
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','copy')">⧉ コピー</button>
          <button class="vp-pl-btn vp-pl-btn-del" onclick="vpRemoveFromPl('${id}')">✕ 削除</button>
        </div>
      </div>
    </div>
    </div>
    ${window.vpV4SectionHTML?.(id) || ''}

    <div style="padding:8px 0 0;display:flex;gap:8px">
      <button id="vp-notes-row-${id}" onclick="window.notesAddVideo?.('${id}')"
        style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);
               background:transparent;color:var(--accent);font-size:12px;
               font-weight:700;cursor:pointer">
        📓 Notes に追加
      </button>
      <button id="vp-ai-tag-btn"
        onclick="window.onAiTagBtn?.('${id}')"
        style="flex:1;padding:8px;border-radius:8px;border:1px dashed var(--border);
               background:transparent;color:var(--accent);font-size:12px;
               font-weight:700;cursor:pointer">
        🤖 AIタグ提案
      </button>
    </div>
    <div style="padding:6px 0 0;display:flex;gap:8px">
      <button onclick="if(confirm('アーカイブしますか？'))vpArchive('${id}')"
        style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);
               background:transparent;color:var(--text2);font-size:12px;
               font-weight:700;cursor:pointer">
        📦 アーカイブ
      </button>
      <button onclick="vpTagReset('${id}')"
        style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);
               background:transparent;color:var(--text2);font-size:12px;
               font-weight:700;cursor:pointer">
        🔄 タグリセット
      </button>
    </div>
    ${window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com'
      ? `<div style="padding:6px 0 0" id="vp-verify-wrap-${id}" class="verify-dot-ctrl">
          ${v.verified
            ? `<div style="text-align:center;font-size:11px;color:var(--green,#6bc490);font-weight:600;padding:6px 0">✓ 検証済み</div>`
            : `<button onclick="vpVerify('${id}')"
                style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);
                       background:transparent;color:var(--green,#6bc490);font-size:12px;
                       font-weight:700;cursor:pointer">
                ✓ 検証済みにする
              </button>`}
        </div>`
      : ''}
    <div id="vp-autosave-${id}" style="text-align:center;font-size:10px;color:var(--text3);opacity:0;transition:opacity .3s;padding:4px 0 8px;letter-spacing:.5px;">✓ 自動保存済み</div>
  `;
}

// ── VP edit functions ──
export function vpSet(id, field, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v[field] = val;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  autoSaveVp(id);
}

export function vpTog(id, field, val, el, cls) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const arr = v[field] || [];
  if (arr.includes(val)) { v[field] = arr.filter(x => x!==val); el.classList.remove(cls); }
  else { v[field] = [...arr, val]; el.classList.add(cls); }
  autoSaveVp(id);
}

export function vpAddTechVal(id, val) {
  if (!val) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if ((v.tags||[]).includes(val)) return;
  v.tags = [...(v.tags||[]), val];
  const container = document.getElementById('vp-tags-' + id);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'vp-chip on-tags vp-tags-rm';
  chip.textContent = val + ' ×';
  chip.dataset.id = id; chip.dataset.val = val;
  chip.onclick = function(){ vpRemoveTechEl(this); };
  container.appendChild(chip);
  autoSaveVp(id);
}

export function vpAddPosVal(id, val) {
  if (!val) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if ((v.pos||[]).includes(val)) return;
  v.pos = [...(v.pos||[]), val];
  const container = document.getElementById('vp-pos-' + id);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'vp-chip on-pos vp-pos-rm';
  chip.textContent = val + ' ×';
  chip.dataset.id = id; chip.dataset.val = val;
  chip.onclick = function(){ vpRemovePosEl(this); };
  container.appendChild(chip);
}

// ── Playlist operations ──
let _vpPlOp = null;

export function openVpPlaylistOp(id, mode) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  _vpPlOp = {id, mode};
  resetVpPlModal();
  const title = document.getElementById('vpPlOvTitle');
  const desc  = document.getElementById('vpPlOvDesc');
  const list  = document.getElementById('vpPlOvList');
  const inp   = document.getElementById('vpPlOvNew');
  title.textContent = mode==='move' ? '↪ プレイリストに移動' : '⧉ プレイリストにコピー';
  desc.textContent  = mode==='move' ? '現在：「' + v.pl + '」→ 移動先を選んでください' : '「' + v.pl + '」からコピーして追加';
  inp.value = '';
  const pls = [...new Set((window.videos||[]).filter(x => !x.archived).map(x => x.pl))]
    .filter(p => mode==='move' ? p!==v.pl : true).sort();
  list.innerHTML = '';
  if (!pls.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:4px">他のプレイリストがありません</div>';
  } else {
    pls.forEach(p => {
      const btn = document.createElement('button');
      btn.style.cssText = 'width:100%;text-align:left;padding:7px 10px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;';
      btn.textContent = p;
      btn.onmouseover = () => { btn.style.borderColor='var(--accent)'; btn.style.color='var(--accent)'; };
      btn.onmouseout  = () => { btn.style.borderColor='var(--border)';  btn.style.color='var(--text)'; };
      btn.onclick = () => vpPlOvConfirm(p);
      list.appendChild(btn);
    });
  }
  const ov = document.getElementById('vpPlOv');
  document.body.appendChild(ov);
  ov.classList.add('open');
}

export function vpPlOvConfirm(targetPl) {
  if (!_vpPlOp || !targetPl.trim()) return;
  const {id, mode} = _vpPlOp;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if (mode==='move') {
    const oldPl = v.pl;
    v.pl = targetPl.trim();
    updateVpPlBadge(id, v.pl);
    window.toast(`↪ 「${oldPl}」→「${v.pl}」に移動しました`);
  } else {
    const copy = JSON.parse(JSON.stringify(v));
    copy.id = v.id + '_copy_' + Date.now();
    copy.pl = targetPl.trim();
    window.videos.push(copy);
    window.toast(`⧉ 「${copy.pl}」にコピーしました`);
  }
  window.closeOv?.('vpPlOv');
  window.AF?.();
}

export function vpPlOvConfirmNew() {
  const val = document.getElementById('vpPlOvNew').value.trim();
  if (!val) { window.toast('プレイリスト名を入力してください'); return; }
  vpPlOvConfirm(val);
}

export function vpRemoveFromPl(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const old = v.pl;
  v.pl = '未分類';
  updateVpPlBadge(id, v.pl);
  window.toast(`✕ 「${old}」から削除（未分類に移動）`);
  window.AF?.();
}

export function updateVpPlBadge(id, newPl) {
  const badge = document.getElementById('vp-pl-badge-' + id);
  if (badge) badge.textContent = newPl;
}

export function vpRemovePosEl(el) {
  const id  = el.dataset.id;
  const val = el.dataset.val;
  const v   = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.pos = (v.pos||[]).filter(p => p!==val);
  el.remove();
  autoSaveVp(id);
}

// ── タグドロップダウン ──
const VP_TAG_OPTS_FALLBACK = {
  tb:   ['トップ','ボトム','スタンディング'],
  cat:  ['エスケープ・ディフェンス','ガード構築・エントリー','ガードリテンション','コントロール／プレッシャー','コンセプト・原理','スイープ','テイクダウン','バックテイク・バックアタック','パスガード','フィニッシュ'],
  pos:  ['インバーテッド','片襟片袖','Kガード','クローズドガード','サドル','スパイダーガード','スタンディング','SLX','タートル','ディープハーフ','デラヒーバ','ニーシールド','バタフライガード','ハーフガード','50/50','Xガード','ラッソーガード','ラペルガード','リバースデラヒーバ','ワームガード','その他'],
  tags: []
};
const VP_FIELD_MAP = { tb:'tb', cat:'cat', pos:'pos', tags:'tags' };

export function vpGetAllOpts(type) {
  const ts = window.tagSettings || [];
  const fromSettings = ts.find(t => t.key === type)?.presets || [];
  const fallback = VP_TAG_OPTS_FALLBACK[type] || [];
  const presets = fromSettings.length ? fromSettings : fallback;
  const fromVideos = (window.videos || []).flatMap(v => v[type] || []);
  return [...new Set([...presets, ...fromVideos])].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function vpTogDd(id, type) {
  document.querySelectorAll('.vp-dd').forEach(d => {
    if (!d.id.includes('-'+type+'-') || !d.id.includes(id)) d.style.display = 'none';
  });
  const dd = document.getElementById('vp-dd-'+type+'-'+id);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none' && dd.style.display !== '';
  if (isOpen) { dd.style.display = 'none'; return; }
  _vpOpenDd(dd);
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) { inp.value = ''; }
  vpRenderDdList(id, type, '');
}

export function vpRenderDdList(id, type, q) {
  const list  = document.getElementById('vp-dd-list-'+type+'-'+id);
  if (!list) return;
  const v       = (window.videos||[]).find(v => v.id===id);
  const field   = VP_FIELD_MAP[type];
  const current = v ? (v[field]||[]) : [];
  const all     = vpGetAllOpts(type);
  const ql      = q.toLowerCase();
  const filtered = all.filter(opt => !ql || opt.toLowerCase().includes(ql));
  const isNew   = q.trim() && !all.some(o => o.toLowerCase() === ql);
  list.innerHTML = filtered.map(opt => {
    const sel = current.includes(opt);
    return `<div class="vp-dd-item${sel?' selected':''}" onclick="vpDdSelect('${id}','${type}','${opt.replace(/'/g,"\\'")}',this)">${opt}</div>`;
  }).join('') + (isNew ? `<div class="vp-dd-new" onclick="vpDdAddNew('${id}','${type}','${q.trim().replace(/'/g,"\\'")}')">＋「${q.trim()}」を新規追加</div>` : '');
}

export function vpDdFilter(id, type, q) { vpRenderDdList(id, type, q); }

export function vpDdKey(id, type, e, inp) {
  if (e.key === 'Enter') {
    const q = inp.value.trim();
    if (!q) return;
    vpDdAddNew(id, type, q);
  } else if (e.key === 'Escape') {
    const dd = document.getElementById('vp-dd-'+type+'-'+id);
    if (dd) dd.style.display = 'none';
  }
}

export function vpDdSelect(id, type, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  const arr   = v[field] || [];
  if (arr.includes(val)) {
    v[field] = arr.filter(x => x !== val);
    el.classList.remove('selected');
  } else {
    v[field] = [...arr, val];
    el.classList.add('selected');
  }
  vpRefreshChips(id, type);
  window.debounceSave?.();
}

export function vpDdAddNew(id, type, val) {
  if (!val.trim()) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  if (!(v[field]||[]).includes(val)) {
    v[field] = [...(v[field]||[]), val];
    const opts = VP_TAG_OPTS[type];
    if (opts && !opts.includes(val)) opts.push(val);
  }
  vpRefreshChips(id, type);
  const dd = document.getElementById('vp-dd-'+type+'-'+id);
  if (dd) dd.style.display = 'none';
  window.debounceSave?.();
  window.toast('＋ 「'+val+'」を追加');
}

// ── Channel 単一値ドロップダウン ──
// サイドバーのopenSbPopupと同じフルハイト・フィックスドパネル方式で統一
function _vpOpenDd(dd) {
  // ── DD を画面中央縦・右寄せで表示 ──
  const wrap  = dd.closest('.vp-dd-wrap');
  const maxH  = Math.min(window.innerHeight * 0.585, 600);
  const ddRight = wrap
    ? Math.max(8, window.innerWidth - wrap.getBoundingClientRect().right)
    : 12;

  dd.style.position    = 'fixed';
  dd.style.top         = '50%';
  dd.style.transform   = 'translateY(-50%)';
  dd.style.bottom      = 'auto';
  dd.style.right       = ddRight + 'px';
  dd.style.left        = 'auto';
  dd.style.width       = 'min(360px, 92vw)';
  dd.style.maxHeight   = maxH + 'px';
  dd.style.zIndex      = '500';
  dd.style.display     = 'flex';
  dd.style.flexDirection = 'column';
  dd.style.overflow    = 'hidden';

  // ── 閉じる (×) ボタン ──
  // DD は position:fixed なので iframe 内クリックが届かず、外クリックで閉じられない。
  // VPanel・SR VP 共通で × ボタンを付け、常に離脱できるようにする。
  dd.querySelector('.vp-dd-x')?.remove();
  const xBtn = document.createElement('button');
  xBtn.className = 'vp-dd-x';
  xBtn.textContent = '✕';
  xBtn.style.cssText = [
    'position:absolute', 'top:7px', 'right:8px',
    'background:none', 'border:none',
    'color:var(--text3)', 'font-size:14px', 'line-height:1',
    'cursor:pointer', 'padding:3px 5px',
    'border-radius:4px', 'z-index:1', 'font-family:inherit',
  ].join(';');
  xBtn.onmouseenter = () => { xBtn.style.color = 'var(--text)'; xBtn.style.background = 'var(--surface2)'; };
  xBtn.onmouseleave = () => { xBtn.style.color = 'var(--text3)'; xBtn.style.background = 'none'; };
  xBtn.onclick = ev => { ev.stopPropagation(); dd.style.display = 'none'; };
  dd.appendChild(xBtn);
  // × ボタンと重ならないよう search input の右 padding を確保
  const searchInp = dd.querySelector('.vp-dd-search');
  if (searchInp) searchInp.style.paddingRight = '34px';

  // リスト部分を残り高さいっぱいに
  const list = dd.querySelector('.vp-dd-list');
  if (list) {
    list.style.flex      = '1';
    list.style.minHeight = '0';
    list.style.maxHeight = 'none';
    list.style.overflowY = 'auto';
  }
}
// vpanel-v4.js 等の非モジュールスクリプトから参照できるよう公開
window._vpOpenDd = _vpOpenDd;

export function vpTogChannelDd(id) {
  const dd = document.getElementById('vp-dd-ch-' + id);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none' && dd.style.display !== '';
  document.querySelectorAll('.vp-dd').forEach(d => d.style.display = 'none');
  if (isOpen) return;
  _vpOpenDd(dd);
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) inp.value = '';
  vpRenderChannelDdList(id, '');
}

function _getAlphaGroup(str) {
  if (!str) return '#';
  const c = str[0];
  const code = c.charCodeAt(0);
  // Hiragana
  if (code >= 0x3041 && code <= 0x3096) {
    const hGroups = [['あ','い','う','え','お'],['か','き','く','け','こ','が','ぎ','ぐ','げ','ご'],['さ','し','す','せ','そ','ざ','じ','ず','ぜ','ぞ'],['た','ち','つ','て','と','だ','ぢ','づ','で','ど'],['な','に','ぬ','ね','の'],['は','ひ','ふ','へ','ほ','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ'],['ま','み','む','め','も'],['や','ゆ','よ'],['ら','り','る','れ','ろ'],['わ','を','ん']];
    const labels = ['あ行','か行','さ行','た行','な行','は行','ま行','や行','ら行','わ行'];
    for (let i = 0; i < hGroups.length; i++) { if (hGroups[i].includes(c)) return labels[i]; }
  }
  // Katakana: convert to hiragana range
  if (code >= 0x30A1 && code <= 0x30F6) {
    const h = String.fromCharCode(code - 0x60);
    return _getAlphaGroup(h);
  }
  // A-Z
  if (/[A-Za-z]/.test(c)) return c.toUpperCase();
  // Other (kanji etc.)
  return c;
}

function _buildDdAlphaHTML(items, countMap, onclickFn) {
  const groups = {};
  items.forEach(item => {
    const g = _getAlphaGroup(item);
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  // Sort: A-Z first, then Japanese rows, then others
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const isAlphaA = /^[A-Z]$/.test(a), isAlphaB = /^[B-Z]$/.test(b);
    if (isAlphaA && !isAlphaB) return -1;
    if (!isAlphaA && isAlphaB) return 1;
    return a.localeCompare(b, 'ja');
  });
  return sortedKeys.map(g =>
    `<div class="vp-dd-alpha-hd">${g}</div>` +
    groups[g].map(item => {
      const cnt = countMap[item] || 0;
      return `<div class="vp-dd-item" onclick="${onclickFn(item)}">${item}<span class="vp-dd-cnt">${cnt}本</span></div>`;
    }).join('')
  ).join('');
}

export function vpRenderChannelDdList(id, q) {
  const list = document.getElementById('vp-dd-list-ch-' + id);
  if (!list) return;
  const v = (window.videos||[]).find(v => v.id === id);
  const isGdrive = v?.pt === 'gdrive';
  const videos = window.videos || [];
  const chMap = {};
  videos.forEach(vid => { if (vid.channel) chMap[vid.channel] = (chMap[vid.channel]||0) + 1; });
  const allChannels = Object.keys(chMap).sort((a,b) => a.localeCompare(b, 'ja'));

  if (q.trim()) {
    const ql = q.toLowerCase();
    const filtered = allChannels.filter(c => c.toLowerCase().includes(ql));
    const isNew = isGdrive && !allChannels.some(c => c.toLowerCase() === ql);
    list.innerHTML = filtered.map(c =>
      `<div class="vp-dd-item" onclick="vpSetChannel('${id}','${c.replace(/'/g,"\\'")}')">${c}<span class="vp-dd-cnt">${chMap[c]||0}本</span></div>`
    ).join('') + (isNew ? `<div class="vp-dd-new" onclick="vpSetChannel('${id}','${q.trim().replace(/'/g,"\\'")}')">＋「${q.trim()}」を新規追加</div>` : '');
    return;
  }

  // maxHeight は _vpOpenDd で設定済みのため上書きしない
  const recents = (window._recentChannels||[]).filter(c => chMap[c]).slice(0, 5);
  const recentHTML = recents.length ? `
    <div class="vp-dd-sec-hd">🕐 最近みた</div>
    ${recents.map(c => `<div class="vp-dd-item vp-dd-item-recent" onclick="vpSetChannel('${id}','${c.replace(/'/g,"\\'")}')">${c}<span class="vp-dd-cnt">${chMap[c]||0}本</span></div>`).join('')}
    <div class="vp-dd-sec-div"></div>
  ` : '';

  const alphaHTML = _buildDdAlphaHTML(allChannels, chMap, c => `vpSetChannel('${id}','${c.replace(/'/g,"\\'")}')`);
  const countSorted = [...allChannels].sort((a,b) => (chMap[b]||0)-(chMap[a]||0));
  const countHTML = countSorted.map(c =>
    `<div class="vp-dd-item" onclick="vpSetChannel('${id}','${c.replace(/'/g,"\\'")}')">${c}<span class="vp-dd-cnt">${chMap[c]||0}本</span></div>`
  ).join('');

  list.innerHTML = recentHTML +
    `<div class="vp-dd-sec-hd" style="padding-bottom:0">全チャンネル</div>
    <div class="vp-dd-subtabs">
      <div class="vp-dd-subtab on" onclick="vpDdSubtab(event,'vp-dd-sub-ch-alpha-${id}','vp-dd-sub-ch-count-${id}')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" onclick="vpDdSubtab(event,'vp-dd-sub-ch-count-${id}','vp-dd-sub-ch-alpha-${id}')">件数順</div>
    </div>
    <div class="vp-dd-subpanel on" id="vp-dd-sub-ch-alpha-${id}">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="vp-dd-sub-ch-count-${id}">${countHTML}</div>
    ${isGdrive ? `<div class="vp-dd-new" onclick="this.closest('.vp-dd').querySelector('.vp-dd-search').focus()">＋ 新規（検索欄に入力してEnter）</div>` : ''}`;
}

export function vpSetChannel(id, val) {
  const v = (window.videos||[]).find(v => v.id === id); if (!v) return;
  v.channel = val;
  // 最近みた履歴を更新
  if (!window._recentChannels) window._recentChannels = [];
  window._recentChannels = [val, ...window._recentChannels.filter(c => c !== val)].slice(0, 10);
  const badge = document.getElementById('vp-ch-badge-' + id);
  if (badge) { badge.textContent = val; }
  else {
    const chipsRow = document.querySelector(`#vp-dd-ch-${id}`)?.closest('.vp-dd-wrap')?.querySelector('div[style*="display:flex"]');
    if (chipsRow) {
      const chip = document.createElement('span');
      chip.className = 'chip active'; chip.id = 'vp-ch-badge-' + id;
      chip.textContent = val;
      chipsRow.insertBefore(chip, chipsRow.firstChild);
    }
  }
  const trigger = document.querySelector(`[onclick="vpTogChannelDd('${id}')"]`);
  if (trigger) trigger.textContent = '✎ 変更';
  const dd = document.getElementById('vp-dd-ch-' + id);
  if (dd) dd.style.display = 'none';
  window.debounceSave?.();
  window.toast?.('チャンネルを「' + val + '」に設定');
}

// ── Playlist 名前変更ドロップダウン ──
export function vpTogPlNameDd(id) {
  const dd = document.getElementById('vp-dd-plname-' + id);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none' && dd.style.display !== '';
  document.querySelectorAll('.vp-dd').forEach(d => d.style.display = 'none');
  if (isOpen) return;
  _vpOpenDd(dd);
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) inp.value = '';
  vpRenderPlNameDdList(id, '');
}

export function vpRenderPlNameDdList(id, q) {
  const list = document.getElementById('vp-dd-list-plname-' + id);
  if (!list) return;
  const videos = window.videos || [];
  const plMap = {};
  videos.forEach(vid => { if (vid.pl) plMap[vid.pl] = (plMap[vid.pl]||0) + 1; });
  const allPls = Object.keys(plMap).sort((a,b) => a.localeCompare(b, 'ja'));

  if (q.trim()) {
    const ql = q.toLowerCase();
    const filtered = allPls.filter(p => p.toLowerCase().includes(ql));
    const isNew = !allPls.some(p => p.toLowerCase() === ql);
    list.innerHTML = filtered.map(p =>
      `<div class="vp-dd-item" onclick="vpSetPlName('${id}','${p.replace(/'/g,"\\'")}')">${p}<span class="vp-dd-cnt">${plMap[p]||0}本</span></div>`
    ).join('') + (isNew ? `<div class="vp-dd-new" onclick="vpSetPlName('${id}','${q.trim().replace(/'/g,"\\'")}')">＋「${q.trim()}」を新規追加</div>` : '');
    return;
  }

  // maxHeight は _vpOpenDd で設定済みのため上書きしない
  const recents = (window._recentPlaylists||[]).filter(p => plMap[p]).slice(0, 5);
  const recentHTML = recents.length ? `
    <div class="vp-dd-sec-hd">🕐 最近みた</div>
    ${recents.map(p => `<div class="vp-dd-item vp-dd-item-recent" onclick="vpSetPlName('${id}','${p.replace(/'/g,"\\'")}')">${p}<span class="vp-dd-cnt">${plMap[p]||0}本</span></div>`).join('')}
    <div class="vp-dd-sec-div"></div>
  ` : '';

  const alphaHTML = _buildDdAlphaHTML(allPls, plMap, p => `vpSetPlName('${id}','${p.replace(/'/g,"\\'")}')`);
  const countSorted = [...allPls].sort((a,b) => (plMap[b]||0)-(plMap[a]||0));
  const countHTML = countSorted.map(p =>
    `<div class="vp-dd-item" onclick="vpSetPlName('${id}','${p.replace(/'/g,"\\'")}')">${p}<span class="vp-dd-cnt">${plMap[p]||0}本</span></div>`
  ).join('');

  list.innerHTML = recentHTML +
    `<div class="vp-dd-sec-hd" style="padding-bottom:0">全プレイリスト</div>
    <div class="vp-dd-subtabs">
      <div class="vp-dd-subtab on" onclick="vpDdSubtab(event,'vp-dd-sub-pl-alpha-${id}','vp-dd-sub-pl-count-${id}')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" onclick="vpDdSubtab(event,'vp-dd-sub-pl-count-${id}','vp-dd-sub-pl-alpha-${id}')">件数順</div>
    </div>
    <div class="vp-dd-subpanel on" id="vp-dd-sub-pl-alpha-${id}">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="vp-dd-sub-pl-count-${id}">${countHTML}</div>
    <div class="vp-dd-new" onclick="this.closest('.vp-dd').querySelector('.vp-dd-search').focus()">＋ 新規（検索欄に入力してEnter）</div>`;
}

export function vpSetPlName(id, val) {
  const v = (window.videos||[]).find(v => v.id === id); if (!v) return;
  v.pl = val;
  // 最近みた履歴を更新
  if (!window._recentPlaylists) window._recentPlaylists = [];
  window._recentPlaylists = [val, ...window._recentPlaylists.filter(p => p !== val)].slice(0, 10);
  const badge = document.getElementById('vp-pl-badge-' + id);
  if (badge) badge.textContent = val;
  const dd = document.getElementById('vp-dd-plname-' + id);
  if (dd) dd.style.display = 'none';
  window.AF?.(); window.debounceSave?.();
  window.toast?.('プレイリストを「' + val + '」に変更');
}

export function vpDdSubtab(event, showId, hideId) {
  const show = document.getElementById(showId);
  const hide = document.getElementById(hideId);
  if (show) show.classList.add('on');
  if (hide) hide.classList.remove('on');
  // Update tab styles
  const tabs = event.target.closest('.vp-dd-subtabs');
  if (tabs) {
    tabs.querySelectorAll('.vp-dd-subtab').forEach(t => t.classList.remove('on'));
    event.target.classList.add('on');
  }
}

// ── GDrive タイトル編集 ──
export function vpEditTitle(id) {
  const v = (window.videos||[]).find(v => v.id === id); if (!v) return;
  const area = document.getElementById('vpanel-title-area'); if (!area) return;
  const titleDiv = document.getElementById('vp-title-text-' + id); if (!titleDiv) return;
  const orig = v.title || '';
  titleDiv.style.display = 'none';
  const editBtn = document.getElementById('vp-title-edit-btn');
  if (editBtn) editBtn.style.display = 'none';
  const inp = document.createElement('input');
  inp.id = 'vp-title-inp-' + id;
  inp.value = orig;
  inp.style.cssText = 'flex:1;font-size:12px;font-weight:700;border:1.5px solid var(--accent);border-radius:6px;padding:3px 6px;outline:none;font-family:inherit;color:var(--text);background:var(--surface);min-width:0';
  const finish = (save) => {
    inp.onblur = null;
    if (save) {
      vpSaveTitle(id); // GDrive rename + toast + DOM cleanup を委譲
    } else {
      inp.remove();
      titleDiv.style.display = '';
      if (editBtn) editBtn.style.display = '';
      titleDiv.textContent = orig;
    }
  };
  inp.onblur = () => finish(true);
  inp.onkeydown = e => {
    if (e.key === 'Enter') { finish(true); }
    else if (e.key === 'Escape') { inp.onblur = null; finish(false); }
  };
  titleDiv.parentNode.insertBefore(inp, titleDiv);
  inp.focus({ preventScroll: true }); inp.select();
}

export async function vpSaveTitle(id) {
  const v = (window.videos||[]).find(v => v.id === id); if (!v) return;
  const inp = document.getElementById('vp-title-inp-' + id); if (!inp) return;
  const newTitle = inp.value.trim();
  if (!newTitle) { window.toast?.('タイトルを入力してください'); return; }
  // ローカル更新
  v.title = newTitle;
  window.debounceSave?.();
  window.AF?.();
  // タイトル表示を更新して編集モード終了
  const titleDiv = document.getElementById('vp-title-text-' + id);
  if (titleDiv) { titleDiv.textContent = newTitle; titleDiv.style.display = ''; }
  inp.remove();
  const editBtn = document.getElementById('vp-title-edit-btn');
  if (editBtn) editBtn.style.display = '';
  // タイトルバーも更新
  const panelTitle = document.querySelector('.vp-panel-title');
  if (panelTitle) panelTitle.textContent = newTitle;
  // GDrive API でファイル名を変更
  if (v.pt === 'gdrive') {
    const fileId = v.id.replace('gd-', '');
    try {
      await window.renameGdFile?.(fileId, newTitle);
      window.toast?.('✅ タイトルを変更しました（Drive上のファイル名も更新）');
    } catch(e) {
      console.warn('Drive rename failed:', e);
      window.toast?.('✅ タイトルを変更しました（Drive上のファイル名は未変更: ' + e.message + '）');
    }
  } else {
    window.toast?.('✅ タイトルを変更しました');
  }
}

export function vpRefreshChips(id, type) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field  = VP_FIELD_MAP[type];
  const clsMap = { tb:'on-tb', cat:'on-cat', pos:'on-pos', tags:'on-tags' };
  const container = document.getElementById('vp-'+type+'-'+id);
  if (!container) return;
  container.innerHTML = (v[field]||[]).map(val =>
    `<span class="vp-chip ${clsMap[type]}" onclick="vpRemoveTag('${id}','${type}','${val.replace(/'/g,"\\'")}',this)">${val} ×</span>`
  ).join('');
  const ddInp = document.querySelector('#vp-dd-'+type+'-'+id+' .vp-dd-search');
  vpRenderDdList(id, type, ddInp ? ddInp.value : '');
}

export function vpRemoveTag(id, type, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  v[field] = (v[field]||[]).filter(x => x !== val);
  el.remove();
  const ddInp = document.querySelector('#vp-dd-'+type+'-'+id+' .vp-dd-search');
  vpRenderDdList(id, type, ddInp ? ddInp.value : '');
  window.debounceSave?.();
}

document.addEventListener('click', function(e) {
  // 各DDごとに「そのDDのwrap内クリックか」を個別判定（グローバル .vp-dd-wrap チェックは誤り）
  document.querySelectorAll('.vp-dd').forEach(d => {
    if (d.style.display === 'none') return;
    if (d.contains(e.target)) return;                    // DD内クリック → 閉じない
    const wrap = d.closest('.vp-dd-wrap');
    if (wrap && wrap.contains(e.target)) return;         // 同じwrap内クリック → 閉じない
    const m = d.id.match(/^vp-dd-(\w+)-(.+)$/);
    if (m) vpRefreshChips(m[2], m[1]);
    d.style.display = 'none';
  });
});

export function vpRemoveTechEl(el) {
  const id  = el.dataset.id;
  const val = el.dataset.val;
  const v   = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.tags = (v.tags||[]).filter(t => t!==val);
  el.remove();
  autoSaveVp(id);
}

export function vpTogWatch(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.watched = !v.watched;
  el.className = 'chip' + (v.watched ? ' active' : '');
  el.textContent = v.watched ? '視聴済み' : '未視聴';
  autoSaveVp(id);
}

export function vpTogFav(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.fav = !v.fav;
  if (el) el.style.color = v.fav ? '#d4a017' : 'var(--text3)';
  autoSaveVp(id);
}

export function vpTogNext(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.next = !v.next;
  if (el) el.textContent = v.next ? '🎯' : '○';
  autoSaveVp(id);
}

export function vpTogDrill(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.drill = !v.drill;
  if (el) {
    const on  = `<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="#7c3aed"/><text x="17.5" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`;
    const off = `<svg width="29" height="16" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="none" stroke="#666" stroke-width="1.5"/><text x="17.5" y="14" text-anchor="middle" fill="#666" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`;
    el.innerHTML = v.drill ? on : off;
    el.style.opacity = v.drill ? '1' : '0.4';
  }
  autoSaveVp(id);
}

export function vpSetShare(id, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.shared = val;
  const row = document.getElementById('vp-share-' + id);
  if (row) row.querySelectorAll('.vp-chip').forEach((c, i) => {
    c.className = 'vp-chip' + (i === val ? ' on-s0' : '');
  });
  autoSaveVp(id);
}

// メモはリッチテキスト（HTML）として保存。
// vp-memo は contenteditable div（VPanel）または textarea（yt-search 等）の両方がある。
export function vpSaveMemo(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  if (el.isContentEditable) {
    const html = el.innerHTML.trim();
    // テキストもタイムスタンプも無ければ空に正規化（<br>だけ等を残さない）
    v.memo = (el.textContent.trim() === '' && !/ts-link/.test(html)) ? '' : html;
  } else {
    v.memo = el.value.trim(); // textarea（yt-search 等）
  }
  autoSaveVp(id);
}

// ── タイムスタンプリンク（スタイルは style.css の .ts-link） ──
function _fmtSec(sec) {
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  const p = n => String(n).padStart(2,'0');
  return h>0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
function _tsLinkHtml(sec, label) {
  return `<a class="ts-link" contenteditable="false" data-sec="${sec}">▶ ${label}</a>`;
}

// メモ文字列 → 表示用HTML。既存プレーンテキスト（[M:SS]含む）も互換変換する。
function _memoToHtml(memo) {
  if (!memo) return '';
  // すでにリッチHTML（タグを含む）ならそのまま使う
  if (/<(a|b|i|u|br|div|span|strong|em|p)\b[^>]*>/i.test(memo)) return memo;
  // プレーンテキスト → エスケープ + タイムスタンプリンク + 改行
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(memo)
    .replace(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g, (m,a,b,c) => {
      const sec = c!=null ? (+a*3600 + +b*60 + +c) : (+a*60 + +b);
      const label = c!=null ? `${a}:${b}:${c}` : `${a}:${b}`;
      return _tsLinkHtml(sec, label);
    })
    .replace(/\n/g, '<br>');
}

// メモ内の ts-link / snap-ref にクリックハンドラを再付与
function _bindTsLinks(container) {
  if (!container) return;
  container.querySelectorAll('a.ts-link').forEach(el => {
    const sec = parseInt(el.dataset.sec);
    if (isNaN(sec)) return;
    el.contentEditable = 'false';
    el.onclick = (e) => { e.preventDefault(); _seekTo(sec); };
  });
  // スナップショットサムネ → クリックで既存ライトボックス（フル画質）
  container.querySelectorAll('img.snap-ref').forEach(el => {
    el.contentEditable = 'false';
    const snapId = el.dataset.snapId;
    el.onclick = (e) => {
      e.preventDefault();
      if (snapId && window.snapOpenLightboxById) window.snapOpenLightboxById(snapId);
    };
  });
}

// ── スナップショットサムネ（メモ埋め込み用） ──
function _thumbHtml(snapId, sec, dataUrl, layout) {
  const base = 'border-radius:4px;cursor:pointer;border:1px solid #ddd';
  if (layout === 'block') {
    return `<img class="snap-ref" contenteditable="false" data-snap-id="${snapId}" data-sec="${sec}" src="${dataUrl}" style="${base};display:block;max-width:220px;width:100%;height:auto;margin:4px 0">`;
  }
  return `<img class="snap-ref" contenteditable="false" data-snap-id="${snapId}" data-sec="${sec}" src="${dataUrl}" style="${base};height:34px;width:56px;object-fit:cover;flex-shrink:0;margin-top:1px">`;
}

// AI要約テキスト（[M:SS]含む）+ スクショ → サムネ付きHTML
function _summaryToHtmlWithShots(summaryText, shotMap, layout) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const tsLinkify = str => esc(str).replace(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g, (m,x,y,z) => {
    const s2 = z!=null ? (+x*3600 + +y*60 + +z) : (+x*60 + +y);
    const lb = z!=null ? `${x}:${y}:${z}` : `${x}:${y}`;
    return _tsLinkHtml(s2, lb);
  });
  const out = [];
  for (const line of summaryText.split('\n')) {
    if (line.trim() === '') { out.push('<div><br></div>'); continue; }
    const tsMatch = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
    const lineHtml = tsLinkify(line);
    if (tsMatch) {
      const c = tsMatch[3];
      const sec = c!=null ? (+tsMatch[1]*3600 + +tsMatch[2]*60 + +c) : (+tsMatch[1]*60 + +tsMatch[2]);
      const shot = shotMap[sec];
      if (shot && layout === 'inline') {
        out.push(`<div style="display:flex;gap:6px;align-items:flex-start;margin:3px 0">${_thumbHtml(shot.snapId,sec,shot.thumbDataUrl,'inline')}<span style="flex:1">${lineHtml}</span></div>`);
        continue;
      }
      if (shot && layout === 'block') {
        out.push(`<div style="margin:3px 0">${lineHtml}${_thumbHtml(shot.snapId,sec,shot.thumbDataUrl,'block')}</div>`);
        continue;
      }
    }
    out.push(`<div>${lineHtml}</div>`);
  }
  return out.join('');
}

// ── Google Drive 動画の指定秒をキャプチャ ──
// 同一オリジン（/api/drive プロキシ）配信なので canvas キャプチャ可能
// 返り値: { fullBlob（スナップショット用・高画質）, thumbDataUrl（メモ埋め込み用・小型） }
async function _captureGdFrame(sec) {
  const video = _gdVideoEl;
  if (!video) return null;
  await new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; video.removeEventListener('seeked', fin); resolve(); };
    video.addEventListener('seeked', fin);
    try { video.currentTime = sec; } catch(e) { fin(); }
    setTimeout(fin, 2500); // seeked が来ない場合の保険
  });
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  try {
    const fc = document.createElement('canvas');
    const fs = Math.min(1, 1280 / Math.max(w, h));
    fc.width = Math.round(w*fs); fc.height = Math.round(h*fs);
    fc.getContext('2d').drawImage(video, 0, 0, fc.width, fc.height);
    const fullBlob = await new Promise(r => fc.toBlob(r, 'image/jpeg', 0.6));
    const tc = document.createElement('canvas');
    const ts = Math.min(1, 320 / Math.max(w, h));
    tc.width = Math.round(w*ts); tc.height = Math.round(h*ts);
    tc.getContext('2d').drawImage(video, 0, 0, tc.width, tc.height);
    const thumbDataUrl = tc.toDataURL('image/jpeg', 0.5);
    return { fullBlob, thumbDataUrl };
  } catch(e) { console.warn('[captureGdFrame]', e); return null; }
}

// ── AI要約オプションダイアログ（スクショ有無 + レイアウト） ──
// canShot=false（YouTube等）なら即「スクショなし」を返す
function _askSummaryOptions(canShot) {
  return new Promise(resolve => {
    if (!canShot) { resolve({ shot:false }); return; }
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px';
    const pick = (val) => { try { document.body.removeChild(ov); } catch(e){} resolve(val); };
    const btn = (id,bg,bc,col,label) => `<button id="${id}" style="display:block;width:100%;padding:11px;margin-bottom:8px;border:1px solid ${bc};background:${bg};color:${col};border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">${label}</button>`;
    ov.innerHTML = `<div style="background:#fff;border-radius:12px;padding:18px;max-width:300px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">✨ AI要約</div>
      <div style="font-size:12px;color:#666;margin-bottom:14px">各タイムスタンプのスクショをメモに入れますか？</div>
      ${btn('_so-inline','#eafaf0','#90c0a0','#2a8050','📸 スクショあり（行頭インライン）')}
      ${btn('_so-block','#eafaf0','#90c0a0','#2a8050','📸 スクショあり（大きめブロック）')}
      ${btn('_so-none','#fff','#ccc','#555','要約のみ（スクショなし）')}
      <button id="_so-cancel" style="display:block;width:100%;padding:8px;border:none;background:none;color:#999;font-size:12px;cursor:pointer">キャンセル</button>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#_so-inline').onclick = () => pick({ shot:true, layout:'inline' });
    ov.querySelector('#_so-block').onclick  = () => pick({ shot:true, layout:'block' });
    ov.querySelector('#_so-none').onclick   = () => pick({ shot:false });
    ov.querySelector('#_so-cancel').onclick = () => pick(null);
    ov.onclick = (e) => { if (e.target === ov) pick(null); };
  });
}

// メモ欄を初期化（HTML流し込み + リンクbind）
function _initMemoEditor(id, memo) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  try { el.innerHTML = _memoToHtml(memo||''); _bindTsLinks(el); }
  catch(e) { console.warn('[memoInit]', e); el.textContent = memo||''; }
}

// メモ欄ツールバー（書式 + 現在位置タイムスタンプ挿入）
const _MEMO_COLORS_TEXT = ['#e53935','#f57c00','#f1c40f','#388e3c','#1976d2','#7b1fa2','#e91e63'];
const _MEMO_COLORS_HL   = ['#fff176','#a5d6a7','#90caf9','#ffcc80','#f48fb1','#b2dfdb','#e1bee7'];

function _memoPalHTML(id, type, colors, resetCmd, resetArg) {
  const swatches = colors.map(c =>
    `<span onmousedown="event.preventDefault()"
      onclick="vpMemoColor('${id}','${type === 'text' ? 'fore' : 'hilite'}','${c}');vpMemoPalClose('${id}','${type}')"
      class="vp-memo-swatch" style="background:${c}"></span>`).join('');
  return `<div class="vp-memo-pal" id="vp-memo-pal-${type}-pop-${id}" style="display:none">
    <div class="vp-memo-pal-inner">
      ${swatches}
      <span onmousedown="event.preventDefault()"
        onclick="document.execCommand('${resetCmd}',false,'${resetArg}');vpSaveMemo('${id}');vpMemoPalClose('${id}','${type}')"
        class="vp-memo-swatch vp-memo-swatch-reset">✕</span>
    </div>
  </div>`;
}

const _MEMO_SIZES = [
  { size: 2, px: 9  },
  { size: 3, px: 12 },
  { size: 4, px: 15 },
  { size: 6, px: 20 },
];

function _memoToolbarHTML(id) {
  const btn = (cmd, label, extra='') =>
    `<button onmousedown="event.preventDefault()" onclick="vpMemoFmt('${id}','${cmd}')"
      class="vp-memo-tb-btn" ${extra}>${label}</button>`;

  const sizePicker = `
    <div class="vp-memo-pal-wrap" id="vp-memo-pal-size-${id}">
      <button onmousedown="event.preventDefault()" onclick="vpMemoPalToggle('${id}','size')"
        class="vp-memo-tb-btn vp-memo-pal-btn" title="文字サイズ"
        style="font-weight:700;font-size:13px;min-width:24px">A</button>
      <div class="vp-memo-pal" id="vp-memo-pal-size-pop-${id}" style="display:none">
        <div class="vp-memo-pal-inner" style="gap:4px">
          ${_MEMO_SIZES.map(s =>
            `<button onmousedown="event.preventDefault()"
              onclick="vpMemoSize('${id}',${s.size});vpMemoPalClose('${id}','size')"
              class="vp-memo-tb-btn" style="font-weight:700;font-size:${s.px}px;line-height:1;min-width:${s.px+8}px;padding:2px 4px">A</button>`
          ).join('')}
        </div>
      </div>
    </div>`;

  const textColorPicker = `
    <div class="vp-memo-pal-wrap" id="vp-memo-pal-text-${id}">
      <button onmousedown="event.preventDefault()" onclick="vpMemoPalToggle('${id}','text')"
        class="vp-memo-tb-btn vp-memo-pal-btn" title="文字色"
        style="font-weight:900;font-size:13px;min-width:24px;color:#e53935;text-shadow:0 0 0 #e53935">T</button>
      ${_memoPalHTML(id,'text',_MEMO_COLORS_TEXT,'foreColor','inherit')}
    </div>`;

  const hlPicker = `
    <div class="vp-memo-pal-wrap" id="vp-memo-pal-hl-${id}">
      <button onmousedown="event.preventDefault()" onclick="vpMemoPalToggle('${id}','hl')"
        class="vp-memo-tb-btn vp-memo-pal-btn" title="蛍光ペン"
        style="font-weight:900;font-size:13px;min-width:24px;background:#fffde7;color:#888;border-color:rgba(0,0,0,.10)">M</button>
      ${_memoPalHTML(id,'hl',_MEMO_COLORS_HL,'hiliteColor','transparent')}
    </div>`;

  return `<div class="vp-memo-toolbar">
    <div class="vp-memo-tb-row">
      ${btn('bold','<b>B</b>')}${btn('italic','<i>I</i>')}${btn('underline','<u>U</u>')}${btn('strikeThrough','<s style="font-size:10px">S</s>')}
      <span class="vp-memo-tb-sep"></span>
      ${sizePicker}
      <span class="vp-memo-tb-sep"></span>
      ${textColorPicker}${hlPicker}
      <span class="vp-memo-tb-sep"></span>
      <button onmousedown="event.preventDefault()" onclick="vpMemoResetColor('${id}')"
        class="vp-memo-tb-btn" title="すべての書式をリセット" style="font-size:10px;color:var(--text3)">✕</button>
      <span class="vp-memo-tb-sep"></span>
      <button onmousedown="event.preventDefault()" onclick="vpMemoInsertTs('${id}')"
        class="vp-memo-tb-btn" style="border-color:#a8c0f0;background:#e8f0ff;color:#2050c0;font-weight:700">📍</button>
    </div>
  </div>`;
}

window.vpMemoPalToggle = function(id, type) {
  const pop = document.getElementById(`vp-memo-pal-${type}-pop-${id}`);
  if (!pop) return;
  const isOpen = pop.style.display !== 'none';
  document.querySelectorAll('.vp-memo-pal').forEach(el => { el.style.display = 'none'; });
  if (!isOpen) pop.style.display = 'block';
};

window.vpMemoPalClose = function(id, type) {
  const pop = document.getElementById(`vp-memo-pal-${type}-pop-${id}`);
  if (pop) pop.style.display = 'none';
};

window.vpSeek = function(id, secs) { _seekTo(secs); };

// ── 検索VPanel（yt-search.js）等、後からbindできない場所向けのフック ──
window._vpMemoToolbarHTML = (id) => _memoToolbarHTML(id);
// メモHTML（ts-link に onclick をインライン付与。bind不要で動く静的版）
window._vpMemoToHtmlStatic = function(memo) {
  if (!memo) return '';
  const inj = sec => ` onclick="event.preventDefault();window.vpSeek&&window.vpSeek(null,${sec})"`;
  if (/<(a|b|i|u|br|div|span|strong|em|p)\b[^>]*>/i.test(memo)) {
    // 保存済みリッチHTML: data-sec を持つ ts-link に onclick を補う
    return memo.replace(/<a class="ts-link"([^>]*?)data-sec="(\d+)"([^>]*)>/g,
      (m, a, sec, b) => `<a class="ts-link"${a}data-sec="${sec}"${b}${inj(sec)}>`);
  }
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(memo)
    .replace(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g, (m,a,b,c) => {
      const sec = c!=null ? (+a*3600 + +b*60 + +c) : (+a*60 + +b);
      const lb = c!=null ? `${a}:${b}:${c}` : `${a}:${b}`;
      return `<a class="ts-link" contenteditable="false" data-sec="${sec}"${inj(sec)}>▶ ${lb}</a>`;
    })
    .replace(/\n/g, '<br>');
};

window.vpMemoSnapNow = async function(id) {
  const sec = _getCurrentTime();
  if (sec == null) { window.toast?.('動画を再生してからスクショしてください'); return; }
  const btn = document.getElementById(`vp-snap-now-btn-${id}`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const v = (window.videos||[]).find(x => x.id === id);
    const memoEl = document.getElementById('vp-memo-' + id);
    if (!memoEl) return;
    const label = _fmtSec(sec);
    const tsHtml = _tsLinkHtml(sec, label);

    if (_gdVideoEl && v?.pt === 'gdrive') {
      // GDrive: フレームキャプチャ → スナップ保存 → サムネ＋タイムスタンプをメモに挿入
      const cap = await _captureGdFrame(sec);
      if (cap?.fullBlob && window.snapAddBlob) {
        const snapId = await window.snapAddBlob(id, cap.fullBlob, sec, '');
        const thumbHtml = _thumbHtml(snapId, sec, cap.thumbDataUrl, 'inline');
        const rowHtml = `<div style="display:flex;gap:6px;align-items:flex-start;margin:3px 0">${thumbHtml}<span>${tsHtml}&nbsp;</span></div>`;
        memoEl.focus();
        document.execCommand('insertHTML', false, rowHtml);
        _bindTsLinks(memoEl);
        vpSaveMemo(id);
        // スナップセクション更新
        const snapSec = document.getElementById('vp-snap-section-' + id);
        if (snapSec && window.initSnapshotSection) window.initSnapshotSection(id, snapSec);
        window.toast?.('📸 スクショをメモに追加しました');
      } else {
        window.toast?.('⚠️ キャプチャに失敗しました');
      }
    } else {
      // YouTube / Vimeo: タイムスタンプリンクのみ挿入
      memoEl.focus();
      document.execCommand('insertHTML', false, `<span>${tsHtml}&nbsp;</span>`);
      _bindTsLinks(memoEl);
      vpSaveMemo(id);
      window.toast?.('📍 タイムスタンプを挿入しました');
    }
  } catch(e) {
    console.error('[vpMemoSnapNow]', e);
    window.toast?.('⚠️ エラーが発生しました');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📸'; }
  }
};

window.vpMemoFmt = function(id, cmd) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  el.focus();
  try { document.execCommand(cmd, false, null); } catch(e) {}
  vpSaveMemo(id);
};

window.vpMemoColor = function(id, type, color) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  el.focus();
  try {
    document.execCommand(type === 'hilite' ? 'hiliteColor' : 'foreColor', false, color);
  } catch(e) {}
  vpSaveMemo(id);
};

window.vpMemoResetColor = function(id) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  el.focus();
  try {
    document.execCommand('foreColor', false, 'inherit');
    document.execCommand('hiliteColor', false, 'transparent');
    document.execCommand('removeFormat', false, null);
  } catch(e) {}
  vpSaveMemo(id);
};

window.vpMemoSize = function(id, size) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  el.focus();
  try { document.execCommand('fontSize', false, String(size)); } catch(e) {}
  vpSaveMemo(id);
};

window.vpMemoInsertTs = function(id) {
  const sec = _getCurrentTime();
  if (sec == null) { window.toast?.('動画を再生してから挿入してください'); return; }
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  el.focus();
  const link = document.createElement('a');
  link.className = 'ts-link';
  link.dataset.sec = sec;
  link.contentEditable = 'false';
  link.textContent = `▶ ${_fmtSec(sec)}`;
  link.onclick = (e) => { e.preventDefault(); _seekTo(sec); };
  const sel = window.getSelection();
  if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const sp1 = document.createTextNode(' ');
    range.insertNode(sp1); range.setStartAfter(sp1);
    range.insertNode(link); range.setStartAfter(link);
    const sp2 = document.createTextNode(' ');
    range.insertNode(sp2); range.setStartAfter(sp2);
    range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  } else {
    el.appendChild(document.createTextNode(' '));
    el.appendChild(link);
    el.appendChild(document.createTextNode(' '));
  }
  vpSaveMemo(id);
};

// ── AI要約（Gemini / YouTube・Google Drive・オーナー限定）──
window.vpAiSummary = async function(id) {
  const v = (window.videos||[]).find(v => v.id===id);
  if (!v) return;

  const isYT = v.pt === 'youtube' && v.ytId;
  const isGD = v.pt === 'gdrive';
  if (!isYT && !isGD) { window.toast?.('YouTube または Google Drive の動画のみ対応しています'); return; }

  const user = window._firebaseCurrentUser?.();
  if (!user) { window.toast?.('ログインが必要です'); return; }

  // Google Drive の場合はアクセストークンが必要
  let gdAccessToken = null;
  if (isGD) {
    gdAccessToken = window.getDriveTokenIfAvailable?.();
    if (!gdAccessToken) {
      window.toast?.('Google Drive の認証が必要です。動画を一度再生してください。');
      return;
    }
  }

  const btn = document.getElementById('vp-aisum-' + id);
  const memoEl = document.getElementById('vp-memo-' + id);
  const origLabel = btn ? btn.textContent : '';

  // スクショオプションを先に確認（GDriveのみ撮影可。YouTubeはダイアログ無しで要約のみ）
  const opts = await _askSummaryOptions(isGD);
  if (!opts) return; // キャンセル

  if (btn) { btn.disabled = true; btn.textContent = '⏳ 要約中…'; btn.style.opacity = '0.6'; }

  try {
    const idToken = await user.getIdToken();

    // リクエストボディを platform 別に構築
    const reqBody = isYT
      ? { idToken, source: 'youtube', ytId: v.ytId, title: v.title||'', channel: v.ch||v.channel||'', playlist: v.pl||'' }
      : { idToken, source: 'gdrive', gdFileId: (v.id||'').replace(/^gd-/,''), accessToken: gdAccessToken, title: v.title||'', channel: v.ch||v.channel||'', playlist: v.pl||'' };

    // 要約生成は一時的に失敗しやすい（Geminiのレート/タイムアウト）ので最大2回試行
    let data = null, lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (btn) btn.textContent = attempt === 1 ? '⏳ 要約中…' : '⏳ 再試行中…';
      try {
        const res = await fetch('/api/ai-summary', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(reqBody),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.summary) { data = d; break; }
        lastErr = (d.error || ('HTTP ' + res.status)) + (d.detail ? ` (${d.detail})` : '');
        console.warn(`[aiSummary] 生成失敗 attempt ${attempt}/2:`, res.status, d);
      } catch (e) {
        lastErr = e.message;
        console.warn(`[aiSummary] 生成エラー attempt ${attempt}/2:`, e);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1800));
    }
    if (!data) {
      window.toast?.('要約失敗（2回試行）: ' + lastErr, 6000);
      console.error('[aiSummary] 最終的に生成失敗:', lastErr);
      return;
    }

    // スクショ撮影（opts.shot かつ GDrive動画）
    const shotMap = {};
    if (opts.shot && isGD && _gdVideoEl) {
      // 各タイムスタンプの秒数と解説テキストを収集（解説はスナップショットのメモに使う）
      const tsText = {};
      for (const line of data.summary.split('\n')) {
        const m = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)/);
        if (!m) continue;
        const c = m[3];
        const sec = c!=null ? (+m[1]*3600 + +m[2]*60 + +c) : (+m[1]*60 + +m[2]);
        const text = (m[4]||'').replace(/^[-・*\s]+/, '').trim();
        if (!(sec in tsText)) tsText[sec] = text;
      }
      const secs = Object.keys(tsText).map(Number).sort((a,b)=>a-b);

      const origTime = _gdVideoEl.currentTime;
      const wasPlaying = !_gdVideoEl.paused;
      try { _gdVideoEl.pause(); } catch(e) {}
      for (let i = 0; i < secs.length; i++) {
        if (btn) btn.textContent = `📸 ${i+1}/${secs.length}`;
        try {
          const cap = await _captureGdFrame(secs[i]);
          if (cap && cap.fullBlob && window.snapAddBlob) {
            // スナップショットのメモにタイムスタンプ解説を入れる
            const snapId = await window.snapAddBlob(id, cap.fullBlob, secs[i], tsText[secs[i]] || '');
            shotMap[secs[i]] = { snapId, thumbDataUrl: cap.thumbDataUrl };
          }
        } catch(e) { console.warn('[shot]', secs[i], e); }
      }
      // 撮影後、元の再生位置に戻す
      try { _gdVideoEl.currentTime = origTime; if (wasPlaying) _gdVideoEl.play().catch(()=>{}); } catch(e) {}
      if (btn) btn.textContent = '⏳ 整理中…';
    }

    // メモHTML生成（スクショありならサムネ付き、なければ従来通り）
    const stamp = new Date().toISOString().slice(0, 10);
    const header = `── ✨ AI要約 (${stamp}) ──`;
    const shotCount = Object.keys(shotMap).length;
    const summaryHtml = shotCount
      ? `<div style="font-size:11px;color:#7040c0;font-weight:700;margin-bottom:4px">${header}</div>` + _summaryToHtmlWithShots(data.summary, shotMap, opts.layout)
      : _memoToHtml(`${header}\n${data.summary}`);

    // 既存メモを壊さず先頭に追記（メモ欄はcontenteditable）
    if (memoEl) {
      const curHtml = memoEl.innerHTML.trim();
      memoEl.innerHTML = curHtml ? `${summaryHtml}<br><br>${curHtml}` : summaryHtml;
      _bindTsLinks(memoEl);
      v.memo = memoEl.innerHTML.trim();
    } else {
      const curHtml = (v.memo || '').trim();
      v.memo = curHtml ? `${summaryHtml}<br><br>${curHtml}` : summaryHtml;
    }

    // debounce経由ではなく直接保存（AI要約は明示的アクション）。
    // 保存は一時障害で失敗しうるので成否を確認し、失敗なら1回リトライ。
    if (window.saveUserData) {
      if (btn) btn.textContent = '⏳ 保存中…';
      let saved = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { saved = await window.saveUserData(); } catch(e) { console.warn('[aiSummary] save throw', e); saved = false; }
        if (saved) break;
        console.warn(`[aiSummary] 保存失敗 attempt ${attempt}/2`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
      }
      if (!saved) {
        window.toast?.('⚠️ 要約は表示されていますが保存に失敗しました。もう一度「✨AI要約」を押すか、メモを編集して保存してください', 7000);
        console.error('[aiSummary] 保存が2回とも失敗。v.memo はメモリ上にのみ存在');
        return; // 成功トーストは出さない
      }
    } else {
      autoSaveVp(id);
    }
    window.toast?.(shotCount ? `✨ 要約＋スクショ${shotCount}枚を追記しました` : '✨ AI要約をMemoに追記しました');
  } catch (e) {
    window.toast?.('要約エラー: ' + e.message);
    console.error('[aiSummary] 例外:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel || '✨ AI要約'; btn.style.opacity = '1'; }
  }
};

export function autoSaveVp(id) {
  _captureTagFeedback(id);  // AI修正差分を検出・記録
  window.debounceSave?.();
  const ind = document.getElementById('vp-autosave-' + id);
  if (ind) {
    ind.style.opacity = '1';
    clearTimeout(ind._t);
    ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 1200);
  }
}

export function vpSave(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const el = document.getElementById('vp-memo-' + id);
  if (el) {
    if (el.isContentEditable) {
      const html = el.innerHTML.trim();
      v.memo = (el.textContent.trim() === '' && !/ts-link/.test(html)) ? '' : html;
    } else {
      v.memo = el.value.trim();
    }
  }
  window.AF?.();
  window.debounceSave?.();
}

// ── PC Side Panel ──
let panelId = null;
let _panelDragging = false;
let _panelStartX = 0;
let _panelStartW = 0;

export function _openPanel(id, emb, ext, plat) {
  document.removeEventListener('click', _closePanelOutside);

  panelId = id;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  _snapshotTags(v);  // AI動画のタグ状態をスナップショット（フィードバック検出用）
  let panel = document.getElementById('vp-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'vp-panel';
    panel.className = 'vp-panel';
    document.body.appendChild(panel);
  }

  const autoplayEl = document.getElementById('setting-autoplay');
  const autoplay = autoplayEl ? autoplayEl.checked : true;

  // まずは動画領域とヘッダーだけ最小構築 → プレイヤー起動を最優先
  panel.innerHTML = `
    <div class="vp-panel-resizer" id="vpResizer"></div>
    <div class="vp-panel-video">
      <div id="vp-panel-yt-player"></div>
    </div>
    <div id="vp-panel-skip-${id}"></div>
    <div id="vp-panel-ab-${id}"></div>
    <div class="vp-panel-header">
      <div class="vp-panel-title">${v.title}</div>
      <div class="vp-panel-close" onclick="closePanel()">✕</div>
    </div>
    <div class="vp-panel-body" id="vp-panel-body-${id}"></div>
  `;

  // パネル表示 → コンテナが正しい 16:9 サイズを得る
  panel.classList.add('show');
  const ma = document.querySelector('.main-area');
  if (ma) { ma.classList.add('panel-open'); ma.style.marginRight = panel.offsetWidth + 'px'; }
  if (window.openPlayer) _closePlayer(window.openPlayer);
  window.openPlayer = id;

  // YT.Player 初期化（PC用）: この時点で placeholder div は CSS で 16:9 サイズ確定済
  if (plat === 'yt') {
    const ytId = _extractYtId(emb);
    if (ytId) {
      _initYTPlayer('vp-panel-yt-player', ytId, autoplay, () => {});
    }
  } else if (plat === 'x') {
    const host = document.getElementById('vp-panel-yt-player');
    if (host) host.outerHTML = `<iframe src="${emb}" allowfullscreen allow="autoplay;encrypted-media" style="background:#fff"></iframe>`;
  } else if (plat === 'gd') {
    const fileIdMatch = emb.match(/\/d\/([^/]+)\//);
    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    const playerDiv = document.getElementById('vp-panel-yt-player');
    if (playerDiv && fileId) _playGDriveVideo(playerDiv, fileId);
  } else {
    // Vimeo
    const src = autoplay ? (emb.includes('?') ? emb + '&autoplay=1' : emb + '?autoplay=1') : emb;
    const playerDiv = document.getElementById('vp-panel-yt-player');
    if (playerDiv) playerDiv.innerHTML = `<iframe src="${src}" allowfullscreen allow="autoplay;encrypted-media"></iframe>`;
  }

  _initPanelResizer(panel);
  panel.onclick = function(e) { e.stopPropagation(); };
  setTimeout(function() { document.addEventListener('click', _closePanelOutside); }, 0);

  // 周辺 UI (skip/AB/チャプター/ブックマーク/メモ/snapshot/drawer) は遅延構築
  // → プレイヤー iframe のネットワーク取得とレンダリングを邪魔しない
  setTimeout(() => {
    if (panelId !== id) return; // 切り替わっていたらスキップ
    const skip = document.getElementById('vp-panel-skip-' + id);
    if (skip) skip.outerHTML = _skipBtnsHTML().replace('class="vp-skip-row"', 'class="vp-skip-row" style="display:flex;gap:5px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--border)"');
    const ab = document.getElementById('vp-panel-ab-' + id);
    if (ab) ab.outerHTML = _abBarHTML();
    const body = document.getElementById('vp-panel-body-' + id);
    if (!body) return;
    body.innerHTML = `
      ${_chapterSectionHTML(id)}
      ${_bookmarkSectionHTML(id)}
      <div class="vp-row" style="margin-top:8px;padding:0 2px">
        <span class="vp-lbl">Memo${(window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com' && (v?.pt === 'youtube' && v?.ytId || v?.pt === 'gdrive'))
          ? `<button id="vp-aisum-${id}" onclick="vpAiSummary('${id}')" title="この動画をAIで要約しMemoに追記" style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--accent,#6c8cff);background:transparent;color:var(--accent,#6c8cff);cursor:pointer;vertical-align:middle">✨ AI要約</button>`
          : ''}</span>
        ${_memoToolbarHTML(id)}
        <div class="vp-memo" id="vp-memo-${id}" contenteditable="true"
          onblur="vpSaveMemo('${id}')"
          oninput="clearTimeout(this._t);this._t=setTimeout(()=>vpSaveMemo('${id}'),800)"></div>
      </div>
      <div id="vp-snap-section-${id}"></div>
      ${buildDrawerHTML(id)}
    `;
    _initMemoEditor(id, v?.memo||'');
    if (window.initSnapshotSection) {
      window.initSnapshotSection(id, document.getElementById('vp-snap-section-' + id));
    }
  }, 0);
}

function _initPanelResizer(panel) {
  const resizer = document.getElementById('vpResizer');
  if (!resizer) return;

  function startDrag(x) {
    _panelDragging = true;
    _panelStartX = x;
    _panelStartW = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    resizer.style.background = 'var(--accent)';
  }
  function doDrag(x) {
    if (!_panelDragging) return;
    const MIN_W = 280, MAX_W = Math.floor(window.innerWidth * 0.6);
    const newW = Math.max(MIN_W, Math.min(MAX_W, _panelStartW - (x - _panelStartX)));
    panel.style.width = newW + 'px';
    const ma = document.querySelector('.main-area');
    if (ma && ma.classList.contains('panel-open')) ma.style.marginRight = newW + 'px';
  }
  function endDrag() {
    if (!_panelDragging) return;
    _panelDragging = false;
    document.body.style.userSelect = '';
    resizer.style.background = '';
    document.removeEventListener('click', _closePanelOutside);
    setTimeout(function() { document.addEventListener('click', _closePanelOutside); }, 200);
  }

  resizer.addEventListener('mousedown', function(e) { e.stopPropagation(); e.preventDefault(); startDrag(e.clientX); });
  document.addEventListener('mousemove', function(e) { doDrag(e.clientX); });
  document.addEventListener('mouseup', endDrag);
  resizer.addEventListener('touchstart', function(e) { e.stopPropagation(); e.preventDefault(); startDrag(e.touches[0].clientX); }, {passive: false});
  document.addEventListener('touchmove', function(e) { if (_panelDragging) { e.preventDefault(); doDrag(e.touches[0].clientX); } }, {passive: false});
  document.addEventListener('touchend', endDrag);
}

export function _closePanelOutside() {
  document.removeEventListener('click', _closePanelOutside);
  closePanel();
}

export function closePanel() {
  document.removeEventListener('click', _closePanelOutside);
  try {
    // YTプレイヤーを停止
    if (_ytPlayer && _ytPlayerReady) {
      try { _ytPlayer.stopVideo(); } catch(e) {}
    }
    _clearTagSnapshot();  // フィードバックスナップショットをクリア
    if (window.cleanupSnapshots) { try { window.cleanupSnapshots(); } catch(e) {} }
    const panel = document.getElementById('vp-panel');
    if (panel) { panel.classList.remove('show'); }
    const ma2 = document.querySelector('.main-area');
    if (ma2) { ma2.classList.remove('panel-open'); ma2.style.marginRight = ''; }
    window.openPlayer = null;
    panelId = null;
  } catch(e) { console.warn('closePanel error:', e); }
}

// ── 検証済み ──
export function vpVerify(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.verified = Date.now();
  window.debounceSave?.();
  window.AF?.();
  // UIを即時更新
  const wrap = document.getElementById('vp-verify-wrap-' + id);
  if (wrap) wrap.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--green,#6bc490);font-weight:600;padding:6px 0">✓ 検証済み</div>';
  // カードのドットを更新
  const card = document.getElementById('card-' + id);
  if (card) {
    const dot = card.querySelector('.verify-dot');
    if (dot) { dot.className = 'verify-dot verified'; }
    else { card.insertAdjacentHTML('afterbegin', '<div class="verify-dot verified"></div>'); }
  }
  window.toast?.('✓ 検証済みに設定しました');
}
window.vpVerify = vpVerify;

// ── アーカイブ ──
export function vpArchive(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.archived = true;
  window.debounceSave?.();
  window.closeVPanel?.();
  window.AF?.();
  window.toastUndo?.('📦 アーカイブしました', () => { v.archived = false; window.AF?.(); window.debounceSave?.(); });
}
window.vpArchive = vpArchive;

// ── タグリセット（属性選択ポップアップ） ──
export function vpTagReset(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  document.getElementById('vp-tag-reset-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'vp-tag-reset-popup';
  popup.style.cssText = 'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)';

  const ts = window.tagSettings || [];
  const fields = ['tb','cat','pos','tags'];
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.2);min-width:260px;max-width:360px';

  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  let btnsHtml = '';
  fields.forEach((f, fi) => {
    const label = ts.find(t => t.key === f)?.label || f.toUpperCase();
    const count = (v[f]||[]).length;
    if (!count) return;
    const c = colors[fi % colors.length];
    btnsHtml += `<button data-field="${f}"
      style="padding:10px;border-radius:8px;border:2px solid ${c};background:${c}11;
        color:${c};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;width:100%">
      ${label}（${count}件）をリセット
    </button>`;
  });

  card.innerHTML = `
    <div style="font-size:14px;font-weight:800;margin-bottom:4px">🔄 タグリセット</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">リセットする属性を選んでください</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${btnsHtml}
      <button id="vp-tag-reset-all"
        style="padding:10px;border-radius:8px;border:2px solid var(--red,#ef4444);background:rgba(239,68,68,.08);
          color:var(--red,#ef4444);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;width:100%">
        ⚠ すべてのタグをリセット
      </button>
      <button onclick="document.getElementById('vp-tag-reset-popup').remove()"
        style="padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);
          color:var(--text3);font-size:12px;cursor:pointer;font-family:inherit;width:100%">キャンセル</button>
    </div>`;

  popup.appendChild(card);
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });

  // 個別リセット
  card.querySelectorAll('button[data-field]').forEach(btn => {
    btn.onclick = () => {
      const field = btn.dataset.field;
      const label = ts.find(t => t.key === field)?.label || field;
      const count = (v[field]||[]).length;
      const backup = [...(v[field]||[])];
      v[field] = [];
      autoSaveVp(id);
      window.vpRefreshChips?.(id, field);
      popup.remove();
      window.toastUndo?.(`🔄 ${label}をリセット（${count}件）`, () => { v[field] = backup; autoSaveVp(id); window.vpRefreshChips?.(id, field); });
    };
  });

  // 全リセット
  document.getElementById('vp-tag-reset-all').onclick = () => {
    const backup = {};
    fields.forEach(f => { backup[f] = [...(v[f]||[])]; });
    const total = fields.reduce((s, f) => s + (v[f]||[]).length, 0);
    fields.forEach(f => { v[f] = []; });
    autoSaveVp(id);
    fields.forEach(f => window.vpRefreshChips?.(id, f));
    popup.remove();
    window.toastUndo?.(`🔄 全タグをリセット（${total}件）`, () => { fields.forEach(f => { v[f] = backup[f]; }); autoSaveVp(id); fields.forEach(f => window.vpRefreshChips?.(id, f)); });
  };
}
window.vpTagReset = vpTagReset;

// ── キーボードショートカット（VPanel表示中のみ） ──
document.addEventListener('keydown', (e) => {
  // VPanelが開いていなければ無視
  if (!window.openVPanelId) return;
  // input/textarea/select にフォーカス中は無視
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  // contenteditable要素にフォーカス中も無視
  if (document.activeElement?.isContentEditable) return;

  const key = e.key;

  if (key === 'Escape') {
    e.preventDefault();
    closeVPanel();
    return;
  }

  if (key === 'f') {
    e.preventDefault();
    const id = window.openVPanelId;
    const el = document.getElementById('vp-fav-' + id);
    if (el) vpTogFav(id, el);
    return;
  }

  if (key === 'j' || key === 'k') {
    e.preventDefault();
    const list = window._vpFilteredList;
    if (!list || !list.length) return;
    const curId = window.openVPanelId;
    const idx = list.findIndex(v => v.id === curId);
    if (idx === -1) return;
    const nextIdx = key === 'j' ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    openVPanel(list[nextIdx].id);
    return;
  }
});


export function initVpanelState() {
  Object.defineProperty(window, 'openVPanelId', {
    get: () => _openVPanelId,
    set: v  => { _openVPanelId = v; },
    configurable: true
  });
}
let _openVPanelId = null;

// ── Search VP 統合: プライベート関数を window に公開 ──
window._vpLoopSectionHTML      = () => _loopSectionHTML();
window._vpBookmarkSectionHTML  = (id) => _bookmarkSectionHTML(id);
window._vpChapterSectionHTML   = (id) => _chapterSectionHTML(id);

// ── チャンネル/プレイリスト → ライブラリジャンプ ──
window.vpJumpToChannel = function(id) {
  const v = (window.videos||[]).find(x => x.id === id);
  if (!v || !v.channel) return;
  const name = v.channel;
  window.showConf?.('🔍 チャンネルを表示', `チャンネル「${name}」を表示しますか？`, () => {
    window._vpJumpClosing = true;
    window.closeVPanel?.();
    window.switchTab?.('home');
    const f = window.filters;
    if (f) { f.channel.clear(); f.channel.add(name); }
    if (window.orgFilters) { window.orgFilters.channel.clear(); window.orgFilters.channel.add(name); }
    window.buildChSrow?.(); window.buildFsChSrow?.();
    window._libViewMode === 'org' ? window.renderOrg?.() : window.AF?.();
  });
};

window.vpJumpToPlaylist = function(id) {
  const v = (window.videos||[]).find(x => x.id === id);
  if (!v) return;
  const name = v.pl;
  if (!name) return;
  window.showConf?.('🔍 プレイリストを表示', `プレイリスト「${name}」を表示しますか？`, () => {
    window._vpJumpClosing = true;
    window.closeVPanel?.();
    window.switchTab?.('home');
    const f = window.filters;
    if (f) { f.playlist.clear(); f.playlist.add(name); }
    if (window.orgFilters) { window.orgFilters.playlist.clear(); window.orgFilters.playlist.add(name); }
    window.buildPlSrow?.(); window.buildFsPlSrow?.();
    window._libViewMode === 'org' ? window.renderOrg?.() : window.AF?.();
  });
};

// ══════════════════════════════════════════════════════
// Vパネル → サーチ 遷移メニュー
// ══════════════════════════════════════════════════════
window.vpTogSearchMenu = function(e, id) {
  e.stopPropagation();
  const existing = document.getElementById('vp-search-menu');
  if (existing) { existing.remove(); return; }

  const v = (window.videos || []).find(x => x.id === id);
  if (!v) return;

  const btn = document.getElementById('vp-search-btn') || document.getElementById('vp-more-btn');
  if (!btn) return;

  const tags = [...new Set([...(v.tb||[]), ...(v.cat||[]), ...(v.pos||[]), ...(v.tags||[])])].filter(Boolean);
  const channel = v.channel || '';

  // ── メニュー要素を構築 ──
  const menu = document.createElement('div');
  menu.id = 'vp-search-menu';
  menu.className = 'vp-search-menu';

  // ── 内容を描画（layer: 'main' | 'tags'）──
  function renderMain() {
    menu.innerHTML = '';
    if (channel) {
      const ci = _menuItem(`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21 6.5c0-1.38-1.12-2.5-2.5-2.5h-13C4.12 4 3 5.12 3 6.5v11C3 18.88 4.12 20 5.5 20h13c1.38 0 2.5-1.12 2.5-2.5v-11zm-2.5 11h-13c-.28 0-.5-.22-.5-.5V9h14v8c0 .28-.22.5-.5.5zm-5.5-5l-4 3V9l4 3z"/></svg>`, 'このチャンネルを検索', channel);
      ci.onclick = () => { menu.remove(); _vpGoSearch(channel); };
      menu.appendChild(ci);
    }
    if (tags.length) {
      const ti = _menuItem(`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.37.86.58 1.41.58s1.05-.21 1.41-.58l7-7c.37-.36.59-.86.59-1.42 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>`, '関連技を検索', 'タグから選ぶ', true);
      ti.onclick = () => renderTags();
      menu.appendChild(ti);
    }
    _positionMenu(menu, btn);
  }

  function renderTags() {
    menu.innerHTML = '';
    // 戻るボタン
    const back = document.createElement('div');
    back.className = 'vp-smenu-back';
    back.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> 戻る`;
    back.onclick = renderMain;
    menu.appendChild(back);

    const div = document.createElement('div');
    div.className = 'vp-smenu-divider';
    menu.appendChild(div);

    tags.forEach(tag => {
      const row = document.createElement('div');
      row.className = 'vp-smenu-tag-row';
      row.innerHTML = `<span class="vp-smenu-tag-pill">${tag}</span>`;
      row.onclick = () => { menu.remove(); _vpGoSearch(tag); };
      menu.appendChild(row);
    });

    const div2 = document.createElement('div');
    div2.className = 'vp-smenu-divider';
    menu.appendChild(div2);

    const other = document.createElement('div');
    other.className = 'vp-smenu-other';
    other.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="flex-shrink:0;opacity:0.5"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><span>その他のキーワードで検索…</span>`;
    other.onclick = () => { menu.remove(); _vpGoSearchFree(); };
    menu.appendChild(other);

    _positionMenu(menu, btn);
  }

  renderMain();
  document.body.appendChild(menu);

  // 外クリックで閉じる
  const onOutside = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== btn) {
      menu.remove();
      document.removeEventListener('click', onOutside, true);
    }
  };
  setTimeout(() => document.addEventListener('click', onOutside, true), 0);
};

function _menuItem(iconHtml, label, sub, hasArrow = false) {
  const el = document.createElement('div');
  el.className = 'vp-smenu-item';
  el.innerHTML = `
    <div class="vp-smenu-icon">${iconHtml}</div>
    <div class="vp-smenu-texts">
      <div class="vp-smenu-label">${label}</div>
      ${sub ? `<div class="vp-smenu-sub">${sub}</div>` : ''}
    </div>
    ${hasArrow ? `<svg class="vp-smenu-arrow" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>` : ''}
  `;
  return el;
}

window.vpTogMoreMenu = function(e, id) {
  e.stopPropagation();
  const existing = document.getElementById('vp-more-menu');
  if (existing) { existing.remove(); return; }

  const btn = e.currentTarget || document.getElementById('vp-more-btn');
  if (!btn) return;

  const isGd = (id || '').startsWith('gd-');
  const gdFileId = isGd ? id.replace(/^gd-/, '') : '';

  const menu = document.createElement('div');
  menu.id = 'vp-more-menu';
  menu.className = 'vp-search-menu';
  menu.style.paddingTop = '34px';

  let onOutside;
  const closeMenu = () => {
    menu.remove();
    document.removeEventListener('click', onOutside, true);
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vp-more-close';
  closeBtn.textContent = '閉じる ✕';
  closeBtn.onclick = (ev) => { ev.stopPropagation(); closeMenu(); };
  menu.appendChild(closeBtn);

  const mkSvg = (path, w=14) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="currentColor">${path}</svg>`;
  const repeatSvg  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  const shuffleSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 3 21 6 17 9"/><path d="M2 19H5C9 19 15 6 21 6"/><polyline points="17 15 21 18 17 21"/><path d="M2 5H5C9 5 15 18 21 18"/></svg>`;
  const mirrorSvg  = `<span style="font-size:11px;font-weight:800;font-family:Georgia,serif;letter-spacing:-1px">R|Я</span>`;
  const listSvg    = mkSvg('<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>');
  const searchSvg  = mkSvg('<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>');
  const editSvg    = mkSvg('<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>');
  const driveSvg   = mkSvg('<path d="M7.71 3.5L1.15 15l3.43 5.5h15.84l3.43-5.5L18.29 3.5H7.71zm.71 9.5l3.58-6h4l3.58 6H8.42z"/>');

  const addDivider = () => { const d = document.createElement('div'); d.className = 'vp-smenu-divider'; menu.appendChild(d); };

  // ── 現在位置でブックマーク（最上部）──
  const bmSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
  const bmi = _menuItem(bmSvg, '現在位置でブックマーク', '再生中の時間を記録');
  bmi.onclick = () => { closeMenu(); vpAddBm(id); };
  menu.appendChild(bmi);
  addDivider();

  const animItem = (el) => {
    el.classList.remove('vp-smenu-anim');
    void el.offsetWidth;
    el.classList.add('vp-smenu-anim');
    setTimeout(() => el.classList.remove('vp-smenu-anim'), 450);
  };

  // ── リピート（3段階: off → list → one → off）──
  const repeatSub = _vpRepeat === 'off' ? 'オフ' : _vpRepeat === 'list' ? 'リスト全体' : 'この動画のみ';
  const ri = _menuItem(repeatSvg, 'リピート', repeatSub);
  if (_vpRepeat === 'list') ri.classList.add('vp-smenu-on-list');
  else if (_vpRepeat === 'one') ri.classList.add('vp-smenu-on');
  const riSub = ri.querySelector('.vp-smenu-sub');
  ri.onclick = () => {
    vpCycleRepeat();
    ri.classList.remove('vp-smenu-on', 'vp-smenu-on-list');
    if (_vpRepeat === 'list') { ri.classList.add('vp-smenu-on-list'); riSub.textContent = 'リスト全体'; }
    else if (_vpRepeat === 'one') { ri.classList.add('vp-smenu-on'); riSub.textContent = 'この動画のみ'; }
    else { riSub.textContent = 'オフ'; }
    animItem(ri);
  };
  menu.appendChild(ri);

  // ── シャッフル ──
  const si = _menuItem(shuffleSvg, 'シャッフル', _vpShuffle ? 'オン' : 'オフ');
  if (_vpShuffle) si.classList.add('vp-smenu-on');
  const siSub = si.querySelector('.vp-smenu-sub');
  si.onclick = () => {
    vpToggleShuffle();
    si.classList.toggle('vp-smenu-on', !!_vpShuffle);
    siSub.textContent = _vpShuffle ? 'オン' : 'オフ';
    animItem(si);
  };
  menu.appendChild(si);

  // ── リバース ──
  const mi = _menuItem(mirrorSvg, 'リバース', window._vpMirrored ? 'オン' : 'オフ');
  if (window._vpMirrored) mi.classList.add('vp-smenu-on');
  const miSub = mi.querySelector('.vp-smenu-sub');
  mi.onclick = () => {
    window.vpToggleMirror?.();
    const nowOn = !!window._vpMirrored;
    mi.classList.toggle('vp-smenu-on', nowOn);
    miSub.textContent = nowOn ? 'オン' : 'オフ';
    animItem(mi);
  };
  menu.appendChild(mi);

  addDivider();

  const li = _menuItem(listSvg, 'リスト表示', 'プレイリストを確認');
  li.onclick = () => { closeMenu(); (window._srVpListAction || window.vpOpenNextList)?.(); };
  menu.appendChild(li);

  const sci = _menuItem(searchSvg, 'YouTube検索', '関連動画を探す');
  sci.onclick = (ev) => { closeMenu(); window.vpTogSearchMenu?.(ev, id); };
  menu.appendChild(sci);

  addDivider();

  const ei = _menuItem(editSvg, 'タイトル編集', '名前を変更する');
  ei.onclick = () => { closeMenu(); vpEditTitle(id); };
  menu.appendChild(ei);

  if (gdFileId) {
    const di = _menuItem(driveSvg, 'Drive を開く', 'Google Drive で確認');
    di.onclick = () => { closeMenu(); window.open(`https://drive.google.com/file/d/${gdFileId}/view`, '_blank', 'noopener'); };
    menu.appendChild(di);
  }

  _positionMenu(menu, btn);

  onOutside = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== btn) closeMenu();
  };
  setTimeout(() => document.addEventListener('click', onOutside, true), 0);
};

function _positionMenu(menu, anchor) {
  menu.style.position = 'fixed';
  menu.style.zIndex   = '10005';  // #vpanel は fc-overlay open時にz-index:10000になる
  menu.style.visibility = 'hidden';
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const pad = 8;

  // 先にmax-heightを設定してからDOMに追加・計測（スマホ横長対応）
  const maxH = Math.floor(vh * 0.82) - pad;
  menu.style.maxHeight = maxH + 'px';
  menu.style.overflowY = 'auto';
  document.body.appendChild(menu);

  const r   = anchor.getBoundingClientRect();
  const mw  = menu.offsetWidth  || 220;
  const mh  = menu.offsetHeight || 100;

  // 左右（右端クリッピング防止）
  let left = r.right - mw;
  if (left + mw > vw - pad) left = vw - mw - pad;
  if (left < pad) left = pad;

  // 上下: まず上方向、入らなければ下方向、それでも溢れたら上端固定
  let top = r.top - mh - 6;
  if (top < pad) top = r.bottom + 6;
  if (top + mh > vh - pad) top = Math.max(pad, vh - mh - pad);

  menu.style.top  = top + 'px';
  menu.style.left = left + 'px';
  menu.style.visibility = '';
}

function _vpGoSearch(query) {
  if (typeof window.switchTab === 'function') window.switchTab('search');
  setTimeout(() => {
    if (typeof window.ytSrSetQuery === 'function') window.ytSrSetQuery(query);
  }, 80);
}

function _vpGoSearchFree() {
  if (typeof window.switchTab === 'function') window.switchTab('search');
  setTimeout(() => {
    const inp = document.getElementById('yt-sr-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }, 80);
}
