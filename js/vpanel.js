// ═══ WAZA KIMURA — 動画パネル（VPanel） v52.482 ═══
// YouTube iFrame Player API対応版
// モバイル用(#vpanel)・PC用(#vp-panel)両対応

// ── YT.Player管理 ──
let _ytPlayer = null;       // 現在アクティブなYT.Playerインスタンス
let _ytPlayerReady = false; // プレイヤーが操作可能な状態か
let _ytApiLoaded = false;   // YouTube iFrame API読み込み済みか
// GDrive用（OAuth + <video>タグ方式 → currentTime完全制御）
let _gdVideoEl = null;  // 再生中の<video>要素
let _gdContainer = null; // 再生中の<video>を入れたコンテナ。
                         // スマホは #vpanel-iframe-container、PCは #vp-panel-yt-player で
                         // idが違うため、決め打ちで引き直さず実際に使った要素を保持する。
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
  // 既定では非表示。三点リーダーメニューの「ループ再生」を押した時だけ表示する。
  // ループ動作中（_ab.loop）は OFF 操作を残すため常に表示。
  if (!window._vpLoopVisible && !_ab.loop) return '';
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

// 旧クイック設定パネルの後片付け。対象要素は現在のUIには無いが、
// ブックマーク再生時のリセット処理から呼ばれているため残す。
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
  // 自動チャプターはDrive動画のみ（Geminiに動画/字幕を読ませる経路がDrive前提のため）
  const isGd = ((window.videos||[]).find(v => v.id === id)?.pt) === 'gdrive';
  const chapBtn = isGd
    ? `<button onclick="vpGenChapters('${id}')" id="vp-chapgen-${id}" title="AIが動画を読み取ってチャプターごとにブックマークを作ります"
         style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">📑 自動チャプター</button>`
    : '';
  return `
    <div class="vp-row" id="vp-bm-section-${id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:5px;width:100%;margin-bottom:4px;flex-wrap:wrap">
        <span class="vp-lbl" style="margin-bottom:0">🔖 ブックマーク</span>
        <span style="display:flex;align-items:center;gap:5px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end">
          ${chapBtn}
          <button onclick="${bmBtnOnclick}" id="vp-bm-add-btn-${id}" style="${bmBtnStyle}">${bmBtnLabel}</button>
        </span>
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
    window._vpLoopVisible = true; // ループ起動に伴いループ再生UIを表示
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
  const _gdResetContainer = _gdContainer || document.getElementById('vpanel-iframe-container');
  if (_gdContainerClick && _gdResetContainer) { _gdResetContainer.removeEventListener('click', _gdContainerClick); }
  _gdContainerClick = null;
  _gdResetContainer?.querySelector('#vp-sub-ui')?.remove();
  _gdResetContainer?.querySelector('#vp-sub-overlay')?.remove();
  _gdSubRevoke();
  _gdVideoEl = null; _gdFileId = null; _gdContainer = null;
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
  window._vpLoopVisible = false; // 動画を開くたびにループ再生UIは非表示から始める
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
    const _ytShotBtn = (_canSummarize && vd?.pt === 'youtube' && navigator.mediaDevices?.getDisplayMedia)
      ? `<button id="vp-aisum-shot-${vid}" onclick="vpAiSummaryWithShot('${vid}')" title="AI要約＋スクショ（YouTubeタブを共有してください）"
           style="margin-left:4px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">✨📸</button>`
      : '';
    const _snapBtn = window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com'
      ? `<button id="vp-snap-now-btn-${vid}" onclick="vpMemoSnapNow('${vid}')" title="現在のフレームをスクショしてメモに挿入"
           style="margin-left:6px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">📸</button>`
      : '';
    const _descBtn = _canSummarize
      ? `<button id="vp-aidesc-btn-${vid}" onclick="vpAiDesc('${vid}')" title="AIが動画を見て一言解説を生成（カードにも表示）"
           style="margin-left:4px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">💬 一言</button>`
      : '';
    const _branchBtn = _canSummarize
      ? `<button id="vp-aibranch-btn-${vid}" onclick="vpAiBranch('${vid}')" title="分岐データを抽出しMemoに追記（プロトタイプ）"
           style="margin-left:4px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">🌳 分岐</button>`
      : '';
    // 字幕生成はDrive動画のみ（生成したSRTを動画と同じDriveフォルダに保存する方式のため）
    const _subGenBtn = (_isOwner && vd?.pt === 'gdrive')
      ? `<button id="vp-subgen-${vid}" onclick="vpGenSubtitle('${vid}')" title="AIが音声を文字起こしし、字幕(SRT)をDriveの同じフォルダに保存します"
           style="margin-left:4px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">💬 字幕生成</button>`
      : '';
    const _escD = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const _descLine = `<div id="vp-aidesc-${vid}" style="margin-top:6px;padding:6px 9px;border-radius:8px;background:var(--surface2);font-size:11.5px;line-height:1.55;color:var(--text2);${vd?.aiDesc?'':'display:none'}">💬 <span id="vp-aidesc-txt-${vid}">${_escD(vd?.aiDesc)}</span></div>`;
    bmContainer.innerHTML = _chapterSectionHTML(vid) + _bookmarkSectionHTML(vid)
      + _descLine
      + `<div class="vp-row" id="vp-memo-row-${vid}" style="margin-top:8px">
          <div class="vp-memo-stickyhead">
            <span class="vp-lbl">Memo${_sumBtn}${_ytShotBtn}${_snapBtn}${_descBtn}${_branchBtn}${_subGenBtn}</span>
            ${_memoToolbarHTML(vid)}
          </div>
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
      va = window.statusRank(a.status); vb = window.statusRank(b.status);
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
    window._vpLoopVisible = false; // ループ再生UIは既定で非表示に戻す
    _stopTimeDisplay();
    clearInterval(_mirrorProgressTimer); _mirrorProgressTimer = null;
    _vpMirrorProgressToggle(false);
    window._vpMirrored = false;
    const _mc = document.getElementById('vpanel-iframe-container'); if (_mc) _mc.style.transform = '';
    if (_gdVideoEl) { try { _gdVideoEl.pause(); } catch(e) {} _gdVideoEl = null; }
    clearTimeout(_gdPauseTimer); _gdPauseTimer = null;
    const _gdCloseContainer = _gdContainer || document.getElementById('vpanel-iframe-container');
    if (_gdContainerClick && _gdCloseContainer) { _gdCloseContainer.removeEventListener('click', _gdContainerClick); }
    _gdContainerClick = null;
    _gdCloseContainer?.querySelector('#vp-sub-ui')?.remove();
    _gdCloseContainer?.querySelector('#vp-sub-overlay')?.remove();
    _gdSubRevoke();
    _gdFileId = null; _gdContainer = null;
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
  if (_gdSubTracks.length) { _gdSubLastHtml = ''; _gdSubRenderCues(); }
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
  _gdFileId   = fileId;
  _gdVideoEl  = null;
  _gdContainer = container;

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
  video.classList.add('wk-sub-video');   // ::cue の指定に使う（コンテナidはPC/スマホで違う）
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
  // 字幕は再生を待たせずに後追いで載せる（見つからなければ何も起きない）
  _gdAttachSubtitle(video, fileId, token);
}


// ═══ 字幕オプション（整形 / 表示 / 生成）═══════════════════
// 保存はすべて localStorage のみ（端末ローカル）。Firestore同期対象には一切触れない。
// 整形と表示は「読み込んだSRTをVTTに変換する時」に適用するので、
// Drive上の元ファイルは一切書き換えない ＝ 何度でもやり直せる。
const SUB_OPTS_KEY   = 'wk_subOpts';
const SUB_OFFSET_KEY = 'wk_subOffsets';

// 字幕の言語表示名（ファイル名の .xx や生成言語の指定に使う）
const SUB_LANGS = { ja:'日本語', en:'English' };
const SUB_LANG_ALIAS = {
  jpn:'ja', jp:'ja', japanese:'ja', 日本語:'ja',
  eng:'en', english:'en', 英語:'en',
};

const SUB_OPTS_DEFAULT = {
  // 整形（生成済み・教材付属を問わずすべての字幕に効く）
  maxCharsJa: 20,   // 1行の最大文字数（日本語など全角）
  maxCharsEn: 42,   // 1行の最大文字数（英語など半角）
  maxLines:   2,    // 1つの字幕の最大行数
  wrapMode:   'balanced', // 折り返し方針 'strict'(文字数優先) | 'balanced' | 'natural'(区切り優先)
  minDur:     1.2,  // 最短表示秒
  maxDur:     7,    // 最長表示秒
  mergeShort: true, // 短すぎるキューを隣とくっつける
  // 表示
  fontScale:  1,        // 文字サイズ倍率
  bgOpacity:  0.72,     // 背景の濃さ
  position:   'bottom', // 'bottom' | 'top'
  // 生成（変更すると再生成が必要＝コストがかかる）
  genLang:     'ja',        // 出力言語。'orig' で話されている言語のまま
  genStyle:    'desu',      // 'desu'（ですます調）| 'dearu'（である調）
  genVerbatim: 'natural',   // 'verbatim'（逐語）| 'natural'（意訳して短く）
  genTerms:    'katakana',  // 'katakana' | 'english' | 'translate'
  genFillers:  'drop',      // 'drop' | 'keep'
  genOnScreen: false,       // 画面内の文字も拾うか
};

function subOpts() {
  try {
    const raw = JSON.parse(localStorage.getItem(SUB_OPTS_KEY) || '{}');
    return { ...SUB_OPTS_DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch(e) { return { ...SUB_OPTS_DEFAULT }; }
}
function _subOptsSave(o) {
  try { localStorage.setItem(SUB_OPTS_KEY, JSON.stringify(o)); } catch(e) {}
}

// 動画ごとのタイミング補正（秒）。fileId をキーに持つ小さな辞書。
function _subOffsets() {
  try { const v = JSON.parse(localStorage.getItem(SUB_OFFSET_KEY) || '{}'); return (v && typeof v === 'object') ? v : {}; }
  catch(e) { return {}; }
}
function _subOffsetGet(fileId) { return Number(_subOffsets()[fileId]) || 0; }
function _subOffsetSet(fileId, sec) {
  if (!fileId) return;
  const all = _subOffsets();
  if (!sec) delete all[fileId]; else all[fileId] = Math.round(sec * 10) / 10;
  // 際限なく増えないよう、古いものから間引く
  const keys = Object.keys(all);
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete all[k];
  try { localStorage.setItem(SUB_OFFSET_KEY, JSON.stringify(all)); } catch(e) {}
}

// ── WebVTT の解析・整形・再構築 ──────────────────────────
function _tc2sec(tc) {
  const p = String(tc).trim().split(':').map(x => parseFloat(x));
  if (p.length === 3) return (p[0] * 3600) + (p[1] * 60) + p[2];
  if (p.length === 2) return (p[0] * 60) + p[1];
  return p[0] || 0;
}
function _sec2tc(s) {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec.toFixed(3).padStart(6,'0')}`;
}

// キューの切り出しは空行区切りに依存しない。
// タイムコード行そのものを目印にする。
// （空行の無いSRTを空行区切りで解析すると、通し番号やタイムコードが
//   字幕テキストに混ざったまま巨大な1キューになる。実際にそれが起きた）
const VTT_TC_RE = /^\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})/;

function _parseVtt(vtt) {
  const lines = String(vtt).replace(/\r\n?/g, '\n').split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) if (VTT_TC_RE.test(lines[i])) marks.push(i);

  const cues = [];
  for (let k = 0; k < marks.length; k++) {
    const i = marks[k];
    const m = lines[i].match(VTT_TC_RE);
    if (!m) continue;
    // 次のタイムコード行までが本文。末尾に紛れる次キューの通し番号は落とす。
    const body = lines.slice(i + 1, k + 1 < marks.length ? marks[k + 1] : lines.length);
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    if (body.length && /^\d{1,5}$/.test(body[body.length - 1].trim())) body.pop();
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    const text = body.join('\n').trim();
    if (!text) continue;
    const start = _tc2sec(m[1].replace(',', '.'));
    const end   = _tc2sec(m[2].replace(',', '.'));
    if (!(end > start)) continue;   // 壊れた時間のキューは捨てる
    cues.push({ start, end, text });
  }
  return cues;
}

// 行頭に置かない文字 / 行末に置かない文字（日本語の禁則処理）
const JA_NO_START = '、。，．・？！」』）〕］｝〉》”’ゝゞーぁぃぅぇぉっゃゅょゎヵヶァィゥェォッャュョヮ';
const JA_NO_END   = '「『（〔［｛〈《“‘';

// 「いい区切り」の判定に使う。行を切ってよいのは、直前が句読点・閉じ括弧・助詞のとき。
const JA_BREAK_AFTER  = /[、。！？　」』）】]$/;
const JA_MULTI_AFTER  = /(?:から|まで|より|ので|のに|ため|けど|ように|こと)$/;
const JA_SINGLE_AFTER = /[はがをにへとでものや]$/;
const JA_HIRAGANA     = /[ぁ-ゖ]/;

// 上限文字数と「いい区切り」は同時に守れない（区切れる場所は文章側が決めるため、
// 区切りの無い区間が上限より長いと逃げ場がない）。どちらを優先するかを mode で選ぶ。
//   strict   … 上限を必ず守る。区切りが無ければ不自然でも切る
//   balanced … 上限内に区切りが無ければ 1.3倍までは超過を許す（既定）
//   natural  … 区切りが見つかるまで超過する。不自然な改行を作らない
function _wrapJa(t, max, mode) {
  const a = Array.from(t);
  const lines = [];
  let p = 0;

  const isGood = (i) => {
    if (i <= p || i >= a.length) return false;
    if (JA_NO_START.includes(a[i])) return false;   // 次の文字が行頭禁則なら切れない
    const head = a.slice(p, i).join('');
    if (JA_BREAK_AFTER.test(head)) return true;      // 句読点・閉じ括弧のあとは常に切れる
    if (JA_MULTI_AFTER.test(head)) return true;      // から/まで/ので/ように 等
    // 1文字の助詞は語の途中である可能性がある（「防御で|きる」の「で」など）。
    // 次が平仮名なら語が続いていると見て切らない。漢字・カタカナなら文節の境目とみなす。
    if (JA_SINGLE_AFTER.test(head) && !JA_HIRAGANA.test(a[i])) return true;
    return false;
  };
  const isSentenceEnd = (i) => /[。！？]$/.test(a.slice(p, i).join(''));

  while (p < a.length) {
    if (a.length - p <= max) { lines.push(a.slice(p).join('')); break; }

    const hardLimit = Math.min(p + max, a.length - 1);
    const minLen    = Math.max(3, Math.floor(max * 0.4));
    let cut = -1;

    // ① 上限内の文末（。！？）を最優先。ただし極端に短い行は作らない
    for (let i = hardLimit; i > p; i--) {
      if (isGood(i) && isSentenceEnd(i) && (i - p) >= minLen) { cut = i; break; }
    }
    // ② 上限内で最も後ろのいい区切り
    if (cut < 0) for (let i = hardLimit; i > p; i--) if (isGood(i)) { cut = i; break; }
    // ③ 上限内に無い場合、方針に応じて超過を許して探す
    if (cut < 0 && mode !== 'strict') {
      const tol = mode === 'natural' ? a.length - 1 : Math.min(a.length - 1, p + Math.ceil(max * 1.3));
      for (let i = hardLimit + 1; i <= tol; i++) if (isGood(i)) { cut = i; break; }
    }
    // ④ どこにも区切れる場所が無い → 禁則だけ守って強制的に切る
    if (cut < 0) {
      cut = p + max;
      while (cut < a.length && JA_NO_START.includes(a[cut])) cut++;
      if (cut - 1 > p && JA_NO_END.includes(a[cut - 1])) cut--;
      if (cut <= p) cut = p + max;
    }
    lines.push(a.slice(p, cut).join(''));
    p = cut;
  }
  // 1〜2文字だけの行は読みにくいので、超過を許す方針なら前の行にくっつける
  if (mode !== 'strict') {
    for (let i = 1; i < lines.length; i++) {
      if (Array.from(lines[i]).length > 2) continue;
      const merged = lines[i - 1] + lines[i];
      if (Array.from(merged).length <= Math.ceil(max * 1.3)) {
        lines[i - 1] = merged;
        lines.splice(i, 1);
        i--;
      }
    }
  }
  return lines.filter(x => x !== '');
}

function _wrapEn(t, max, mode) {
  const lines = [];
  let cur = '';
  for (const w of t.split(/\s+/)) {
    if (!w) continue;
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  // 単語1つが上限を超える場合。strict のみ単語を割って上限を守る。
  if (mode !== 'strict') return lines;
  const out = [];
  for (let l of lines) {
    while (l.length > max) { out.push(l.slice(0, max)); l = l.slice(max); }
    if (l) out.push(l);
  }
  return out;
}

function _wrapText(text, o) {
  const t = String(text).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!t) return [];
  const mode = o.wrapMode || 'balanced';
  return /[぀-ヿ一-鿿]/.test(t) ? _wrapJa(t, o.maxCharsJa, mode) : _wrapEn(t, o.maxCharsEn, mode);
}

// 行数が上限を超えたら、文字数比で時間を割ってキューを分割する
function _splitCue(cue, lines, o) {
  if (lines.length <= o.maxLines) return [{ start: cue.start, end: cue.end, text: lines.join('\n') }];
  const chunks = [];
  for (let i = 0; i < lines.length; i += o.maxLines) chunks.push(lines.slice(i, i + o.maxLines));
  const total = chunks.reduce((s, c) => s + c.join('').length, 0) || 1;
  const dur = Math.max(0.1, cue.end - cue.start);
  let t = cue.start;
  return chunks.map(c => {
    const d = dur * (c.join('').length / total);
    const out = { start: t, end: t + d, text: c.join('\n') };
    t += d;
    return out;
  });
}

// 短すぎて読めないキューを、隣が近ければ結合する
function _mergeShortCues(cues, o) {
  const res = [];
  for (const c of cues) {
    const prev = res[res.length - 1];
    if (prev) {
      const gap    = c.start - prev.end;
      const bothShort = (prev.end - prev.start) < o.minDur && (c.end - c.start) < o.minDur;
      if (bothShort && gap >= 0 && gap < 0.4) {
        const joined = _wrapText(prev.text + ' ' + c.text, o);
        if (joined.length <= o.maxLines) {
          prev.end = c.end; prev.text = joined.join('\n');
          continue;
        }
      }
    }
    res.push({ start: c.start, end: c.end, text: c.text });
  }
  return res;
}

function _serializeVtt(cues, position) {
  const setting = position === 'top' ? ' line:8%' : '';
  let out = 'WEBVTT\n\n';
  cues.forEach((c, i) => {
    out += `${i + 1}\n${_sec2tc(c.start)} --> ${_sec2tc(c.end)}${setting}\n${c.text}\n\n`;
  });
  return out;
}

// 元のVTTを設定どおりに作り直す。元ファイルには触らない。
function _reflowVtt(vtt, o, offset) {
  let cues = _parseVtt(vtt);
  if (!cues.length) return vtt;

  let out = [];
  for (const c of cues) {
    const lines = _wrapText(c.text, o);
    if (lines.length) out.push(..._splitCue(c, lines, o));
  }
  if (o.mergeShort) out = _mergeShortCues(out, o);

  for (let i = 0; i < out.length; i++) {
    const nextStart = out[i + 1] ? out[i + 1].start : Infinity;
    let end = out[i].end;
    if (end - out[i].start > o.maxDur) end = out[i].start + o.maxDur;
    if (end - out[i].start < o.minDur) end = Math.min(out[i].start + o.minDur, nextStart);
    out[i].end = Math.max(end, out[i].start + 0.2);
  }
  if (offset) {
    for (const c of out) { c.start = Math.max(0, c.start + offset); c.end = Math.max(0.2, c.end + offset); }
  }
  return _serializeVtt(out, o.position);
}

// 字幕は ::cue ではなく自前のオーバーレイで描く。
// ::cue はブラウザ実装差やOSの字幕設定に上書きされることがあり、
// 文字サイズ・背景の濃さが効かない環境がある（実際に効かなかった）。
// track は mode='hidden' にしてキューだけ生かし、描画は自分で行う。
let _gdSubCueHandler = null;   // cuechange ハンドラ（解除用）
let _gdSubLastHtml   = '';     // 無駄な再描画を避けるための直前の内容

function _gdSubOverlayEl(create) {
  const host = _gdContainer;
  if (!host) return null;
  let el = host.querySelector('#vp-sub-overlay');
  if (!el && create) {
    // div にすると `#vpanel-iframe-container > div` の !important 指定に
    // 巻き込まれて全画面に広がるので span を使う
    el = document.createElement('span');
    el.id = 'vp-sub-overlay';
    host.appendChild(el);
  }
  return el;
}

function _gdSubClamp(v, lo, hi, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

// 実際に描画する。設定はすべてインラインstyleで当てるので必ず反映される。
function _gdSubRenderCues() {
  const el = _gdSubOverlayEl(true);
  if (!el) return;
  const o     = subOpts();
  const scale = _gdSubClamp(o.fontScale, 0.3, 3, SUB_OPTS_DEFAULT.fontScale);
  const bg    = _gdSubClamp(o.bgOpacity, 0, 1, SUB_OPTS_DEFAULT.bgOpacity);
  // 画面サイズが変わっても比率を保つため、コンテナの高さから文字サイズを決める
  const h  = _gdContainer?.clientHeight || 0;
  const px = Math.max(9, Math.round((h > 0 ? h * 0.052 : 14) * scale));

  el.style.cssText = 'position:absolute;left:0;right:0;z-index:4;pointer-events:none;'
    + (o.position === 'top' ? 'top:5%;' : 'bottom:6%;')
    + 'display:flex;flex-direction:column;align-items:center;gap:2px;'
    + 'padding:0 4%;box-sizing:border-box;text-align:center;'
    + `font-size:${px}px;line-height:1.35;`;

  const t  = _gdSubTracks[_gdSubIndex];
  const tt = t && t.track && t.track.track;
  let html = '';
  if (_gdSubIndex >= 0 && tt) {
    const esc = x => String(x).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
    const lines = [];
    const cues = tt.activeCues || [];
    for (let i = 0; i < cues.length; i++) {
      for (const l of String(cues[i].text || '').split('\n')) if (l.trim()) lines.push(l);
    }
    html = lines.map(l =>
      `<span style="display:inline-block;background:rgba(0,0,0,${bg});color:#fff;`
      + `padding:0 .3em;border-radius:2px;text-shadow:0 1px 2px rgba(0,0,0,.85);`
      + `white-space:pre-wrap">${esc(l)}</span>`).join('');
  }
  if (html !== _gdSubLastHtml) { el.innerHTML = html; _gdSubLastHtml = html; }
}

// 選択中のトラックの cuechange を監視する
function _gdSubBindCueRender() {
  if (_gdSubCueHandler) {
    for (const t of _gdSubTracks) {
      const tt = t.track && t.track.track;
      if (tt) try { tt.removeEventListener('cuechange', _gdSubCueHandler); } catch(e) {}
    }
    _gdSubCueHandler = null;
  }
  const t  = _gdSubTracks[_gdSubIndex];
  const tt = t && t.track && t.track.track;
  if (!tt) return;
  _gdSubCueHandler = () => _gdSubRenderCues();
  tt.addEventListener('cuechange', _gdSubCueHandler);
}

// ── Google Drive 字幕（サイドカー .srt / .vtt を自動検出 → WebVTT で <track> 表示）──
// 前提: ブラウザの <video> は MP4 に埋め込まれた字幕トラックを Safari 以外まったく表示しない
// （Chromium は demuxer 段階で AVDISCARD_ALL、Gecko は MP4 の text track を生成しない）。
// また <track> が読めるのは WebVTT のみで SRT は不可。したがって
// 「動画と同じDriveフォルダに置いた字幕ファイルを取ってきて VTT に変換して載せる」方式を採る。
// 動画ファイル自体は一切変更しない（再エンコードもDrive上の更新もしない）。
const GD_SUB_LANG_KEY = 'wk_gdSubLang'; // 選択中の字幕（'off' | ラベル）。端末ローカルのみでクラウド同期しない
const GD_SUB_OLD_KEY  = 'wk_gdSubOn';   // v52.602 の ON/OFF キー（移行用）
const GD_SUB_EXT_RE   = /\.(srt|vtt)$/i;
const GD_SUB_MAX      = 6;              // 1動画あたり取得する字幕ファイルの上限
const _gdSubLookup    = new Map();      // 動画fileId -> 候補配列（セッション内キャッシュ）
let   _gdSubBlobUrls  = [];             // 生成した blob URL（解放用）
let   _gdSubTracks    = [];             // 現在の動画の字幕 [{label, track}]
let   _gdSubIndex     = -1;             // 表示中のインデックス（-1 = OFF）

// 保存されている選択（ラベル or 'off'）。未設定なら旧キーから移行
function _gdSubPref() {
  try {
    const v = localStorage.getItem(GD_SUB_LANG_KEY);
    if (v != null) return v;
    return localStorage.getItem(GD_SUB_OLD_KEY) === '0' ? 'off' : '';
  } catch(e) { return ''; }
}
function _gdSubSetPref(v) { try { localStorage.setItem(GD_SUB_LANG_KEY, v); } catch(e) {} }

function _gdSubRevoke() {
  if (_gdSubCueHandler) {
    for (const t of _gdSubTracks) {
      const tt = t.track && t.track.track;
      if (tt) try { tt.removeEventListener('cuechange', _gdSubCueHandler); } catch(e) {}
    }
    _gdSubCueHandler = null;
  }
  for (const u of _gdSubBlobUrls) { try { URL.revokeObjectURL(u); } catch(e) {} }
  _gdSubBlobUrls = [];
  _gdSubTracks   = [];
  _gdSubIndex    = -1;
  _gdSubLastHtml = '';
}

async function _driveApiGet(path, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  return res.json();
}

// ファイル名の突き合わせ用の正規化。
// 「01-01- Intro To The Instructional.mp4」と「01-01-_Intro_To_The_Instructional.ja.srt」のように
// 空白/アンダースコア/ハイフン/ドットの表記ゆれがあっても同じ動画の字幕とみなせるようにする。
function _gdSubNorm(s) {
  return String(s).toLowerCase().replace(/[\s　_.\-]+/g, '');
}

// 動画名を取り除いた「残り」から言語を判定する（残りが無ければ言語指定なし）
function _gdSubLabelOf(rem) {
  if (!rem) return { lang: '', label: '字幕' };
  const code = SUB_LANG_ALIAS[rem] || rem;
  if (SUB_LANGS[code]) return { lang: code, label: SUB_LANGS[code] };
  return { lang: rem, label: rem.toUpperCase() };
}

// 動画と同じフォルダから「動画名で始まる .srt / .vtt」をすべて探す
async function _gdFindSubtitleFiles(fileId, token) {
  if (_gdSubLookup.has(fileId)) return _gdSubLookup.get(fileId);
  let found = [];
  try {
    const meta   = await _driveApiGet(`files/${encodeURIComponent(fileId)}?fields=name,parents`, token);
    const parent = meta?.parents?.[0];
    const base   = String(meta?.name || '').replace(/\.[^.]+$/, '');
    if (parent && base) {
      const nbase = _gdSubNorm(base);
      const q     = `'${parent.replace(/'/g, "\\'")}' in parents and trashed=false`;
      const list  = await _driveApiGet(`files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`, token);
      for (const f of (list?.files || [])) {
        if (!GD_SUB_EXT_RE.test(f.name)) continue;
        const nname = _gdSubNorm(f.name.replace(GD_SUB_EXT_RE, ''));
        if (!nname.startsWith(nbase)) continue;
        const rem = nname.slice(nbase.length);
        // 残りが長い＝別動画の字幕を誤って拾っている可能性が高いので除外
        if (rem.length > 12) continue;
        found.push({ id: f.id, name: f.name, ...(_gdSubLabelOf(rem)) });
      }
      // 日本語 → 言語指定なし → その他 の順に並べる
      const rank = x => x.lang === 'ja' ? 0 : x.lang === '' ? 1 : 2;
      found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      found = found.slice(0, GD_SUB_MAX);
    }
  } catch(e) {
    console.warn('subtitle lookup failed:', e?.message || e);
  }
  _gdSubLookup.set(fileId, found);
  return found;
}

// UTF-8（BOM有無）優先、化けたら Shift_JIS を試す（Windows製SRTはCP932のことがある）
function _gdSubDecode(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (utf8.includes('\uFFFD')) {
    try {
      const sjis = new TextDecoder('shift_jis').decode(bytes);
      if (!sjis.includes('\uFFFD')) return sjis;
    } catch(e) {}
  }
  return utf8;
}

// SRT → WebVTT（ブラウザは WebVTT しか解釈しない）
function _srtToVtt(text) {
  let t = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/^WEBVTT/.test(t.trimStart())) return t;          // すでにVTTならそのまま
  t = t.replace(/(\d{1,2}:\d{2}(?::\d{2})?),(\d{1,3})/g, '$1.$2');   // 00:00:01,500 → 00:00:01.500
  // 時間桁が無い mm:ss.mmm 形式には 00: を補う（VTTはどちらも可だが揃えておく）
  t = t.replace(/^(\d{2}:\d{2}\.\d{1,3})\s*-->\s*(\d{2}:\d{2}\.\d{1,3})/gm, '00:$1 --> 00:$2');
  return 'WEBVTT\n\n' + t.trim() + '\n';
}

// ファイル名に言語表記が無い字幕は中身から日本語/英語を判定してラベルを補正する
function _gdSubRefineLabel(cand, vtt) {
  if (cand.lang) return;
  const body = vtt.replace(/^WEBVTT[\s\S]*?\n\n/, '');
  if (/[぀-ヿ一-鿿]/.test(body))       { cand.lang = 'ja'; cand.label = SUB_LANGS.ja; }
  else if (/[A-Za-z]{3,}/.test(body))  { cand.lang = 'en'; cand.label = SUB_LANGS.en; }
}

async function _gdAttachSubtitle(video, fileId, token) {
  const cands = await _gdFindSubtitleFiles(fileId, token);
  if (!cands.length) return;
  if (_gdVideoEl !== video || !video.isConnected) return;   // 待っている間に別動画へ切替済み

  // 候補をすべて取得（字幕ファイルは数十KB程度なので並列で取り切る）
  const loaded = await Promise.all(cands.map(async c => {
    try {
      // 字幕本文も動画と同じ同一オリジンプロキシ経由で取る（CORS・認証の追加対応が不要）
      const res = await fetch(`/api/drive?fileId=${encodeURIComponent(c.id)}&token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const vtt = _srtToVtt(_gdSubDecode(await res.arrayBuffer()));
      _gdSubRefineLabel(c, vtt);
      return { cand: c, vtt };
    } catch(e) {
      console.warn('subtitle fetch failed:', c.name, e?.message || e);
      return null;
    }
  }));
  if (_gdVideoEl !== video || !video.isConnected) return;

  _gdSubRevoke();
  const opts   = subOpts();
  const offset = _subOffsetGet(fileId);
  for (const item of loaded) {
    if (!item) continue;
    const url = URL.createObjectURL(new Blob([_reflowVtt(item.vtt, opts, offset)], { type: 'text/vtt' }));
    _gdSubBlobUrls.push(url);
    const track = document.createElement('track');
    track.kind    = 'subtitles';
    track.label   = item.cand.label;
    track.srclang = item.cand.lang || 'ja';
    track.src     = url;
    video.appendChild(track);
    // rawVtt を持っておくと、設定変更時に取得し直さず整形だけやり直せる
    _gdSubTracks.push({ id: item.cand.id, label: item.cand.label, name: item.cand.name, track, rawVtt: item.vtt, url });
  }
  _gdSubRenderCues();
  if (!_gdSubTracks.length) return;

  // 前回選んだ字幕を復元。見つからなければ先頭（＝日本語優先の並び順）
  const pref = _gdSubPref();
  let idx = pref === 'off' ? -1 : _gdSubTracks.findIndex(t => t.label === pref);
  if (pref !== 'off' && idx < 0) idx = 0;
  // track追加直後は textTracks が未反映のことがあるため次tickでモードを確定させる
  setTimeout(() => _gdSubSelect(idx), 0);
  _gdSubMountButton(video.parentElement);
}

// idx番目だけを表示。-1 で全OFF
function _gdSubSelect(idx) {
  _gdSubIndex = idx;
  _gdSubTracks.forEach((t, i) => {
    const tt = t.track.track;   // HTMLTrackElement.track → TextTrack
    // 'showing' にするとブラウザが自前で描画してしまい、見た目の制御が効かない。
    // 'hidden' はキューは有効で描画されないので、表示は _gdSubRenderCues が行う。
    if (tt) tt.mode = (i === idx) ? 'hidden' : 'disabled';
  });
  _gdSubSetPref(idx < 0 ? 'off' : (_gdSubTracks[idx]?.label || ''));
  _gdSubBindCueRender();
  _gdSubLastHtml = '';        // 切替時は必ず描き直す
  _gdSubRenderCues();
  _gdSubPaintButton();
}

function _gdSubPaintButton() {
  const btn = document.getElementById('vp-sub-btn');
  if (!btn) return;
  const on  = _gdSubIndex >= 0;
  const cur = _gdSubTracks[_gdSubIndex];
  // 字幕が1つだけなら言語名は出さず CC のみ（切替先が無いので情報にならない）
  btn.textContent = (on && _gdSubTracks.length > 1) ? `CC ${cur?.label || ''}` : 'CC';
  // 映像の上に重なるためテーマ変数を使わない。
  // ライトモードの --accent は #111（ほぼ黒）で、半透明の黒背景に乗せると読めなくなる。
  btn.style.background  = on ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.6)';
  btn.style.color       = on ? '#111'                  : 'rgba(255,255,255,.85)';
  btn.style.borderColor = on ? '#fff'                  : 'rgba(255,255,255,.5)';
  btn.title = (_gdSubTracks.length > 1
    ? `字幕を切替（${_gdSubTracks.map(t => t.label).join(' / ')}）`
    : `字幕: ${cur?.name || _gdSubTracks[0]?.name || ''}`);
}

function _gdSubMountButton(container) {
  if (!container) return;
  container.querySelector('#vp-sub-ui')?.remove();

  // div でラップすると `#vpanel-iframe-container > div` の !important 指定で
  // 全画面に広がりクリックを奪ってしまうため span を使う
  const wrap = document.createElement('span');
  wrap.id = 'vp-sub-ui';
  wrap.style.cssText = 'position:absolute;top:8px;right:8px;z-index:5;display:flex;gap:6px;align-items:center';
  const baseBtn = 'padding:3px 9px;border-radius:6px;font-family:inherit;font-size:11px;font-weight:700;'
    + 'line-height:1.6;cursor:pointer;border:1.5px solid;box-shadow:0 1px 6px rgba(0,0,0,.4)';

  const btn = document.createElement('button');
  btn.id    = 'vp-sub-btn';
  btn.type  = 'button';
  btn.style.cssText = baseBtn;
  // タップ＝ON/OFF・言語切替、長押し／右クリック＝調整パネル
  let lp = null, lpFired = false;
  const startLp = () => {
    clearTimeout(lp);
    lpFired = false;
    lp = setTimeout(() => { lpFired = true; _gdSubOpenPanel(btn); }, 500);
  };
  const cancelLp = () => { clearTimeout(lp); lp = null; };
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); startLp(); });
  btn.addEventListener('pointerup',    cancelLp);
  btn.addEventListener('pointerleave', cancelLp);
  btn.addEventListener('pointercancel',cancelLp);
  btn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); cancelLp(); _gdSubOpenPanel(btn); });
  btn.addEventListener('click', e => {
    e.stopPropagation();   // container の click（停止中タップで再生復帰）を発火させない
    if (lpFired) { lpFired = false; return; }   // 長押しでパネルを開いた直後は切替しない
    // OFF → 1つ目 → 2つ目 → … → OFF と巡回
    const next = _gdSubIndex + 1 >= _gdSubTracks.length ? -1 : _gdSubIndex + 1;
    _gdSubSelect(next);
  });
  // 右クリック/長押しは環境差が出るので、常に見える ⚙ を主導線にする
  const gear = document.createElement('button');
  gear.id    = 'vp-sub-gear';
  gear.type  = 'button';
  gear.textContent = '⚙';
  gear.title = '字幕の調整';
  gear.style.cssText = baseBtn + ';background:rgba(0,0,0,.6);color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.5)';
  gear.addEventListener('pointerdown', e => e.stopPropagation());
  gear.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); _gdSubOpenPanel(gear); });

  wrap.appendChild(btn);
  wrap.appendChild(gear);
  container.appendChild(wrap);
  _gdSubPaintButton();
}

// ── 字幕の自動生成（Gemini でSRTを作り、動画と同じDriveフォルダに保存）──
// 生成本体は既存の /api/ai-summary（mode:'subtitle'）を再利用する。
// 保存先は動画と同じフォルダの「動画名.ja.srt」/「動画名.srt」で、
// 上書きになる場合は必ず確認を取る（既存の字幕を黙って壊さない）。
function _looksLikeSrt(t) {
  return /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(String(t || ''));
}

// モデルがコードフェンスや前置きを付けてきた場合に本文だけ取り出す
function _cleanSrt(t) {
  let s = String(t || '').replace(/\r\n?/g, '\n').trim();
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  const i = s.search(/(^|\n)\d+\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/);
  if (i > 0) s = s.slice(i).trim();
  return s + '\n';
}

async function _driveUploadText(token, { name, parentId, text, existingId }) {
  const boundary = 'wkbnd' + Math.random().toString(36).slice(2);
  const meta = existingId ? {} : { name, parents: [parentId] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`, text, `\r\n`,
    `--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,name`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name`;
  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive保存に失敗 (${res.status}) ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

// 生成言語を選ぶ小メニュー。選択で resolve、外クリック/Escで null
function _subGenLangChoices() {
  const cur = subOpts().genLang;
  const list = [['ja', SUB_LANGS.ja], ['orig', '原語のまま']];
  // 設定画面で選んでいる言語を先頭に出す
  list.sort((a, b) => (b[0] === cur) - (a[0] === cur));
  return list;
}

function _askSubtitleLang(anchorEl) {
  return new Promise(resolve => {
    document.getElementById('vp-subgen-menu')?.remove();
    const r = anchorEl?.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'vp-subgen-menu';
    menu.style.cssText = 'position:fixed;z-index:10000;background:var(--surface,#222);border:1.5px solid var(--border,#444);'
      + 'border-radius:10px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.35);min-width:190px;'
      + 'top:0;left:0;visibility:hidden';
    const item = (code, label) =>
      `<button class="vp-subgen-item" data-lang="${code}"
         style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:7px;background:transparent;
                color:var(--text,#eee);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer">
         ${label}<div style="font-size:10px;font-weight:400;color:var(--text3,#999);margin-top:2px">${
           code === 'orig' ? '話されている言語で文字起こし' : `この言語に翻訳して字幕にする`}</div>
       </button>`;
    menu.innerHTML = _subGenLangChoices().map(([c, l]) => item(c, l)).join('');
    document.body.appendChild(menu);
    // 実寸が出てから位置を決める（項目数が増えても見切れない）
    _fitPopup(menu, anchorEl);
    menu.style.visibility = '';

    const done = val => {
      menu.remove();
      document.removeEventListener('mousedown', onOut, true);
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const onOut = e => { if (!menu.contains(e.target)) done(null); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    menu.querySelectorAll('.vp-subgen-item').forEach(b => {
      b.addEventListener('mouseenter', () => { b.style.background = 'var(--surface2,#333)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
      b.addEventListener('click', () => done(b.dataset.lang));
    });
    setTimeout(() => {
      document.addEventListener('mousedown', onOut, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  });
}

// 生成に関係する設定だけを抜き出してサーバへ渡す（整形・表示設定はクライアント側の話なので送らない）
function _subGenPayload() {
  const o = subOpts();
  return { style: o.genStyle, verbatim: o.genVerbatim, terms: o.genTerms,
           fillers: o.genFillers, onScreen: !!o.genOnScreen,
           maxChars: o.maxCharsJa, maxLines: o.maxLines };
}

// 実行前の概算コスト(USD)。Gemini のトークンレートから見積もる。
// 映像 258トークン/秒 @$0.30/1M、音声 32トークン/秒 @$1.00/1M、出力 @$2.50/1M。
// 実測は生成後に usageMetadata から返るので、これはあくまで事前の目安。
window.wkEstimateAiCost = function(seconds, mode) {
  const sec = Number(seconds) || 0;
  if (sec <= 0) return null;                       // 尺不明。呼び出し側で「不明」と表示する
  const inUsd = sec * ((258 * 0.30) + (32 * 1.00)) / 1e6;
  // 字幕は尺に比例して出力が伸びる。要約はほぼ一定＋思考トークン。
  const outUsd = mode === 'subtitle' ? sec * 11 * 2.50 / 1e6 : (900 + 2048) * 2.50 / 1e6;
  return inUsd + outUsd;
};

// preset を渡すと対話なしで実行する（一括処理用）。
//   preset = { subLang, silent:true, existing:'skip'|'replace' }
// 戻り値: { ok, skipped, error, cost, target }
window.vpGenSubtitle = async function(id, preset) {
  const silent = !!(preset && preset.silent);
  const fail = (msg) => { if (!silent) window.toast?.(msg); return { ok: false, error: msg }; };

  const v = (window.videos || []).find(x => x.id === id);
  if (!v || v.pt !== 'gdrive') return fail('Google Drive の動画のみ対応しています');

  const user = window._firebaseCurrentUser?.();
  if (!user) return fail('ログインが必要です');
  const gdToken = window.getDriveTokenIfAvailable?.();
  if (!gdToken) return fail('Google Drive の認証が必要です。動画を一度再生してください。');

  const btn = preset ? null : document.getElementById('vp-subgen-' + id);
  const subLang = preset ? preset.subLang : await _askSubtitleLang(btn);
  if (!subLang) return { ok: false, skipped: true };

  const fileId = (v.id || '').replace(/^gd-/, '');
  const orig   = btn ? btn.textContent : '';
  const setBtn = txt => { if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = txt; } };
  const endBtn = () => { if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = orig; } };

  try {
    // 1. 保存先（動画と同じフォルダ）と、同名ファイルの有無を先に確認する
    setBtn('⏳ 確認中…');
    const meta   = await _driveApiGet(`files/${encodeURIComponent(fileId)}?fields=name,parents`, gdToken);
    const parent = meta?.parents?.[0];
    const base   = String(meta?.name || '').replace(/\.[^.]+$/, '');
    if (!parent || !base) throw new Error('動画の保存先フォルダを取得できませんでした');
    const target = base + (subLang === 'ja' ? '.ja.srt' : '.srt');

    const q    = `'${parent.replace(/'/g, "\\'")}' in parents and trashed=false and name='${target.replace(/'/g, "\\'")}'`;
    const dup  = await _driveApiGet(`files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`, gdToken);
    const existing = dup?.files?.[0] || null;
    if (existing) {
      // 一括処理では既定で「作らない」。既存の字幕を黙って作り直さない安全側に倒す。
      if (preset) {
        if (preset.existing !== 'replace') { endBtn(); return { ok: false, skipped: true, target }; }
      } else if (!confirm(`「${target}」はすでにあります。\n上書きして作り直しますか？`)) {
        endBtn(); return { ok: false, skipped: true, target };
      }
    }

    // 2. 生成（動画をGeminiへ送るので長尺だと数分かかる）
    setBtn('⏳ 生成中…');
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai-summary', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        idToken, mode: 'subtitle', subLang, subOpts: _subGenPayload(), source: 'gdrive',
        gdFileId: fileId, accessToken: gdToken,
        title: v.title || '', channel: v.ch || v.channel || '', playlist: v.pl || '',
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.summary) {
      throw new Error((d.error || ('HTTP ' + res.status)) + (d.detail ? `（${d.detail}）` : ''));
    }
    const srt = _cleanSrt(d.summary);
    if (!_looksLikeSrt(srt)) throw new Error('SRT形式で返ってきませんでした。もう一度お試しください');
    // 実測トークンと概算コスト（内訳はコンソール、金額はトーストに出す）
    if (d.usage) console.log('[subtitle] tokens:', d.usage, '/ 概算 $', d.costUsd);
    const costStr = typeof d.costUsd === 'number' ? ` · $${d.costUsd.toFixed(3)}` : '';

    // 3. Driveへ保存（既存があればその中身だけ差し替え）
    setBtn('⏳ 保存中…');
    await _driveUploadText(gdToken, { name: target, parentId: parent, text: srt, existingId: existing?.id });

    // 4. 検出キャッシュを捨てて、再生中ならその場で載せ直す
    _gdSubLookup.delete(fileId);
    if (!silent) window.toast?.(`✅ 字幕を作成しました（${target}${costStr}）`);
    if (_gdVideoEl && _gdFileId === fileId) {
      document.getElementById('vp-sub-ui')?.remove();
      _gdSubRevoke();
      _gdVideoEl.querySelectorAll('track').forEach(t => t.remove());
      _gdAttachSubtitle(_gdVideoEl, fileId, gdToken);
    }
    return { ok: true, target, cost: typeof d.costUsd === 'number' ? d.costUsd : 0 };
  } catch (e) {
    console.warn('[subtitle] 生成失敗:', e);
    if (!silent) window.toast?.('⚠️ 字幕の生成に失敗: ' + (e?.message || e));
    return { ok: false, error: (e?.message || String(e)) };
  } finally {
    endBtn();
  }
};

// ── 自動チャプター（長尺Drive動画を読み取ってチャプターごとにブックマークを作る）──
// 1本に複数のテクニックが入っている教則を、話題の切り替わりで区切ってブックマーク化する。
// 検出の入り口は2つ:
//   sub   … Driveにある字幕(SRT/VTT)の文字起こしだけをAIに渡す。動画を送らないので速く安い。
//           おまけに検出時刻を字幕キューの頭にスナップできるので、発話の途中で切れない。
//   video … 字幕が無い動画向け。字幕生成と同じ経路で動画本体をGeminiに読ませる（遅い・高い）。
// 書き込みは必ず確認ダイアログを通す。既存のブックマークは消さず追加のみ（データ保護）。
const CHAP_MIN_SEC   = 45;    // これより短い間隔の区切りは落とす
const CHAP_MAX_COUNT = 40;    // 検出件数の上限
const CHAP_DUP_SEC   = 20;    // 既存の自動チャプターとこれ以内なら重複として足さない
const CHAP_SNAP_SEC  = 12;    // 字幕キュー頭へスナップする最大のズレ
const CHAP_TR_MAX    = 400000; // AIへ渡す文字起こしの上限（文字）

// チャプター用の時刻表記。_formatTime は 95:30 のように分が膨らむので、
// 1時間を超える動画では H:MM:SS にしてAIが誤読しないようにする。
function _chapFmt(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const z = n => String(n).padStart(2, '0');
  return h ? `${h}:${z(m)}:${z(ss)}` : `${m}:${z(ss)}`;
}

// "1:02:03" / "12:34" / "754"（秒だけ）を秒に。読めなければ null
function _chapSec(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.max(0, v);
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(?:(\d{1,3}):)?(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (m) {
    const ms = m[4] ? Number((m[4] + '00').slice(0, 3)) / 1000 : 0;
    return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + ms;
  }
  const n = parseFloat(s);
  return isFinite(n) ? Math.max(0, n) : null;
}

// VTT → 「[M:SS] 発話」形式の文字起こし。
// 1キュー1行だと長尺で無駄に大きくなるので、近接キューは1行にまとめる
// （時間の粒度が粗くなるぶんは、あとで実キューへスナップして取り戻す）。
function _vttToTranscript(vtt, maxChars) {
  const cues = _parseVtt(vtt);
  if (!cues.length) return { text: '', cues: [], clipped: false };
  const lines = [];
  let cur = null;
  for (const c of cues) {
    const t = String(c.text).replace(/<[^>]*>/g, '').replace(/\s*\n\s*/g, ' ').trim();
    if (!t) continue;
    if (cur && (c.start - cur.start) < 10 && (cur.text.length + t.length) < 140) {
      cur.text += ' ' + t;
    } else {
      cur = { start: c.start, text: t };
      lines.push(cur);
    }
  }
  let text = lines.map(l => `[${_chapFmt(l.start)}] ${l.text}`).join('\n');
  // ここで切ると後半のチャプターが出なくなるので、切ったことを呼び出し側へ伝える
  const clipped = text.length > maxChars;
  if (clipped) text = text.slice(0, maxChars);
  return { text, cues, clipped };
}

// AIの返しを掃除する。時刻順に並べ、近すぎる区切り・動画の終わり際は落とす。
function _normalizeChapters(items, opts) {
  const o = opts || {};
  const dur    = Number(o.duration) || 0;
  const minSec = Number(o.minSec) || CHAP_MIN_SEC;
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const t = _chapSec(it?.start ?? it?.time ?? it?.t);
    if (t == null) continue;
    // 終わり際の区切りは使いどころが無い（数秒しか中身が無いものはAIの取り違え）
    if (dur && t > dur - 5) continue;
    // 「1.」「第1章」のような通し番号はこちらで並べるので落とす
    const title = String(it?.title || '')
      .replace(/\s+/g, ' ').trim()
      .replace(/^(?:第?\s*[\d０-９]+\s*(?:章|話|本目)?)[.．、）)：:\-\s]+/, '')
      .trim();
    out.push({
      time:  Math.round(t),
      label: title.slice(0, 60),
      note:  String(it?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    });
  }
  out.sort((a, b) => a.time - b.time);
  const kept = [];
  for (const c of out) {
    if (kept.length && c.time - kept[kept.length - 1].time < minSec) continue;
    kept.push(c);
  }
  return kept.slice(0, CHAP_MAX_COUNT);
}

// 検出時刻を字幕キューの先頭へ寄せる（発話の途中から始まるチャプターを防ぐ）
function _snapChapters(chaps, cues) {
  if (!cues?.length) return chaps;
  for (const c of chaps) {
    let best = null;
    for (const q of cues) {
      if (q.start > c.time + 1.5) break;   // その時刻の直前に始まったキューを採る
      best = q;
    }
    if (best && Math.abs(best.start - c.time) <= CHAP_SNAP_SEC) c.time = Math.round(best.start);
  }
  chaps.sort((a, b) => a.time - b.time);
  return chaps;
}

// 検出の入り口を選ぶ小メニュー。選択で resolve、外クリック/Escで null
function _askChapterSource(anchorEl, subCount) {
  return new Promise(resolve => {
    document.getElementById('vp-chapgen-menu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'vp-chapgen-menu';
    menu.style.cssText = 'position:fixed;z-index:10000;background:var(--surface,#222);border:1.5px solid var(--border,#444);'
      + 'border-radius:10px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.35);min-width:230px;top:0;left:0;visibility:hidden';
    const item = (val, label, sub, disabled) =>
      `<button class="vp-chapgen-item" data-via="${val}" ${disabled ? 'disabled' : ''}
         style="display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:7px;background:transparent;
                color:var(--text,#eee);font-family:inherit;font-size:12px;font-weight:600;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? '.45' : '1'}">
         ${label}<div style="font-size:10px;font-weight:400;color:var(--text3,#999);margin-top:2px">${sub}</div>
       </button>`;
    menu.innerHTML =
      item('sub', '字幕から検出', subCount ? 'この動画の字幕を使います（速い・安い）' : '字幕が見つかりません', !subCount)
      + item('video', '動画から検出', 'AIが動画を視聴します（時間とコストがかかります）', false);
    document.body.appendChild(menu);
    _fitPopup(menu, anchorEl);
    menu.style.visibility = '';

    const done = val => {
      menu.remove();
      document.removeEventListener('mousedown', onOut, true);
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const onOut = e => { if (!menu.contains(e.target)) done(null); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    menu.querySelectorAll('.vp-chapgen-item').forEach(b => {
      if (b.disabled) return;
      b.addEventListener('mouseenter', () => { b.style.background = 'var(--surface2,#333)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
      b.addEventListener('click', () => done(b.dataset.via));
    });
    setTimeout(() => {
      document.addEventListener('mousedown', onOut, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  });
}

// 検出結果の確認ダイアログ。ここを通さずにブックマークへ書き込まない。
// resolve は { chaps, withEnd, replaceAuto } / キャンセルは null
function _chapReviewDialog(chaps, info) {
  return new Promise(resolve => {
    document.getElementById('vp-chap-rv-bg')?.remove();
    const autoCount = Number(info?.autoCount) || 0;
    const bg = document.createElement('div');
    bg.id = 'vp-chap-rv-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';

    const rows = chaps.map((c, i) => `
      <div style="display:flex;align-items:center;gap:7px;padding:5px 2px;border-bottom:0.5px solid var(--border,#444)">
        <input type="checkbox" class="vp-chap-ck" data-i="${i}" checked style="flex-shrink:0;accent-color:var(--accent);width:15px;height:15px;cursor:pointer">
        <button class="vp-chap-seek" data-t="${c.time}" title="ここから再生"
          style="flex-shrink:0;padding:2px 7px;border-radius:5px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);
                 font-size:11.5px;font-family:'DM Mono',monospace;cursor:pointer">${_chapFmt(c.time)}</button>
        <input type="text" class="vp-chap-title" data-i="${i}" value="${_escAttr(c.label || '')}" placeholder="タイトルを入力..."
          style="flex:1;min-width:0;font-size:11.5px;padding:4px 7px;border:1px solid var(--border,#444);border-radius:6px;
                 background:var(--surface,#222);color:var(--text,#eee);font-family:inherit;outline:none">
      </div>`).join('');

    bg.innerHTML = `
      <div style="background:var(--surface,#222);border:1.5px solid var(--border,#444);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);
                  width:100%;max-width:460px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:12px 14px 8px;border-bottom:0.5px solid var(--border,#444)">
          <div style="font-size:13px;font-weight:700;color:var(--text,#eee)">📑 自動チャプター</div>
          <div style="font-size:10.5px;color:var(--text3,#999);margin-top:3px">${_escAttr(info?.note || '')}</div>
          ${info?.warn ? `<div style="font-size:10.5px;color:var(--accent);margin-top:2px">⚠ ${_escAttr(info.warn)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;padding:7px 14px 0">
          <button id="vp-chap-all"  style="${_adjBtnStyle()}">すべて選択</button>
          <button id="vp-chap-none" style="${_adjBtnStyle()}">すべて解除</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:4px 14px 8px;min-height:60px">${rows}</div>
        <div style="padding:8px 14px;border-top:0.5px solid var(--border,#444);display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text2,#bbb);cursor:pointer">
            <input type="checkbox" id="vp-chap-end" checked style="accent-color:var(--accent);margin-top:1px;flex-shrink:0">
            <span>終了時間を入れる（次の開始まで）<div style="font-size:10px;color:var(--text3,#999)">1チャプターが区間になり、そのままループ再生できます</div></span>
          </label>
          ${autoCount ? `
          <label style="display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text2,#bbb);cursor:pointer">
            <input type="checkbox" id="vp-chap-rep" style="accent-color:var(--accent);margin-top:1px;flex-shrink:0">
            <span>前に自動で作ったチャプターを消して入れ替える<div style="font-size:10px;color:var(--text3,#999)">${autoCount}件を削除します。手で作ったブックマークは消えません</div></span>
          </label>` : ''}
        </div>
        <div style="padding:9px 14px 12px;display:flex;gap:7px;justify-content:flex-end">
          <button id="vp-chap-cancel" style="${_adjBtnStyle()};padding:6px 12px;font-size:11.5px">キャンセル</button>
          <button id="vp-chap-ok" style="${_adjBtnStyle('var(--accent)','#fff')};padding:6px 12px;font-size:11.5px">✔ ブックマークに追加</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const cks = () => Array.from(bg.querySelectorAll('.vp-chap-ck'));
    const paintOk = () => {
      const n = cks().filter(c => c.checked).length;
      const ok = bg.querySelector('#vp-chap-ok');
      ok.textContent = `✔ ブックマークに追加（${n}件）`;
      ok.disabled = !n;
      ok.style.opacity = n ? '1' : '.45';
    };
    const done = val => { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };

    bg.querySelectorAll('.vp-chap-seek').forEach(b =>
      b.addEventListener('click', () => _seekTo(Number(b.dataset.t) || 0)));
    cks().forEach(c => c.addEventListener('change', paintOk));
    bg.querySelector('#vp-chap-all').addEventListener('click',  () => { cks().forEach(c => { c.checked = true;  }); paintOk(); });
    bg.querySelector('#vp-chap-none').addEventListener('click', () => { cks().forEach(c => { c.checked = false; }); paintOk(); });
    bg.querySelector('#vp-chap-cancel').addEventListener('click', () => done(null));
    bg.addEventListener('mousedown', e => { if (e.target === bg) done(null); });
    bg.querySelector('#vp-chap-ok').addEventListener('click', () => {
      const titles = {};
      bg.querySelectorAll('.vp-chap-title').forEach(inp => { titles[inp.dataset.i] = inp.value.trim(); });
      const picked = cks().filter(c => c.checked).map(c => {
        const i = c.dataset.i;
        return { ...chaps[Number(i)], label: titles[i] ?? chaps[Number(i)].label };
      });
      if (!picked.length) return;
      done({
        chaps: picked,
        withEnd:     !!bg.querySelector('#vp-chap-end')?.checked,
        replaceAuto: !!bg.querySelector('#vp-chap-rep')?.checked,
      });
    });
    paintOk();
    document.addEventListener('keydown', onKey, true);
  });
}

// ブックマークへの反映。空では何も書かない・既存は消さない（置き換えは明示指定時のみ）。
function _applyChapters(id, sel, duration) {
  const v = (window.videos || []).find(x => x.id === id);
  if (!v || !sel?.chaps?.length) return 0;
  if (!Array.isArray(v.bookmarks)) v.bookmarks = [];

  // 明示的に指定された時だけ、この機能が作ったもの（auto:'chapter'）を消す。
  // 手で作ったブックマークには一切触らない。
  if (sel.replaceAuto) v.bookmarks = v.bookmarks.filter(b => b.auto !== 'chapter');

  // 再実行で同じ位置が二重にならないよう、近接する既存の自動チャプターは飛ばす
  const dup = t => v.bookmarks.some(b => b.auto === 'chapter' && Math.abs((b.time || 0) - t) <= CHAP_DUP_SEC);
  const list = sel.chaps.filter(c => !dup(c.time));
  if (!list.length) return 0;

  if (sel.withEnd) {
    const dur = Number(duration) || 0;
    for (let i = 0; i < list.length; i++) {
      const next = list[i + 1] ? list[i + 1].time : (dur || 0);
      if (next > list[i].time + 1) list[i].endTime = Math.round(next);
    }
  }
  for (const c of list) {
    const bm = { time: c.time, label: c.label || '', note: c.note || '', auto: 'chapter' };
    if (c.endTime != null) bm.endTime = c.endTime;
    v.bookmarks.push(bm);
  }
  v.bookmarks.sort((a, b) => a.time - b.time);
  window.debounceSave?.();
  _refreshBmList(id);
  return list.length;
}

// この動画の字幕本文（VTT）を1つ取る。再生中でメモリにあればそれを使う。
async function _chapGetVtt(fileId, gdToken, subs) {
  if (_gdFileId === fileId && _gdSubTracks.length) {
    const t = _gdSubTracks[_gdSubIndex >= 0 ? _gdSubIndex : 0] || _gdSubTracks[0];
    if (t?.rawVtt) return t.rawVtt;
  }
  const cand = subs?.[0];
  if (!cand) return '';
  // 動画本体と同じ同一オリジンプロキシ経由で取る（CORS・認証の追加対応が不要）
  const res = await fetch(`/api/drive?fileId=${encodeURIComponent(cand.id)}&token=${encodeURIComponent(gdToken)}`);
  if (!res.ok) throw new Error(`字幕の取得に失敗 (${res.status})`);
  return _srtToVtt(_gdSubDecode(await res.arrayBuffer()));
}

window.vpGenChapters = async function(id, preset) {
  const silent = !!(preset && preset.silent);
  const fail = (msg) => { if (!silent) window.toast?.(msg); return { ok: false, error: msg }; };

  const v = (window.videos || []).find(x => x.id === id);
  if (!v || v.pt !== 'gdrive') return fail('Google Drive の動画のみ対応しています');

  const user = window._firebaseCurrentUser?.();
  if (!user) return fail('ログインが必要です');
  const gdToken = window.getDriveTokenIfAvailable?.();
  if (!gdToken) return fail('Google Drive の認証が必要です。動画を一度再生してください。');

  const fileId = (v.id || '').replace(/^gd-/, '');
  const btn  = preset ? null : document.getElementById('vp-chapgen-' + id);
  const orig = btn ? btn.textContent : '';
  const setBtn = txt => { if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = txt; } };
  const endBtn = () => { if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = orig; } };

  try {
    // 1. 字幕があるか先に調べて、入り口を選ばせる
    setBtn('⏳ 確認中…');
    const subs = await _gdFindSubtitleFiles(fileId, gdToken).catch(() => []);
    endBtn();
    const via = preset ? (preset.via || (subs.length ? 'sub' : 'video')) : await _askChapterSource(btn, subs.length);
    if (!via) return { ok: false, skipped: true };

    // 2. 検出（字幕からはテキストだけ、動画からは既存の字幕生成と同じ経路）
    setBtn('⏳ 検出中…');
    const idToken  = await user.getIdToken();
    const chapOpts = { minSec: CHAP_MIN_SEC, maxCount: CHAP_MAX_COUNT };
    const common   = { idToken, mode: 'chapters', chapOpts,
                       title: v.title || '', channel: v.ch || v.channel || '', playlist: v.pl || '' };

    let payload, cues = [], clipped = false;
    if (via === 'sub') {
      if (!subs.length) throw new Error('字幕が見つかりません。先に「💬 字幕生成」で字幕を作ってください');
      const vtt = await _chapGetVtt(fileId, gdToken, subs);
      const tr  = _vttToTranscript(vtt, CHAP_TR_MAX);
      if (!tr.text) throw new Error('字幕を読み取れませんでした。先に「💬 字幕生成」で字幕を作ってください');
      cues    = tr.cues;
      clipped = tr.clipped;
      payload = { ...common, source: 'transcript', transcript: tr.text };
    } else {
      payload = { ...common, source: 'gdrive', gdFileId: fileId, accessToken: gdToken };
    }

    const res = await fetch('/api/ai-summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.summary) {
      throw new Error((d.error || ('HTTP ' + res.status)) + (d.detail ? `（${d.detail}）` : ''));
    }

    // 3. JSONを取り出して掃除する
    let parsed = null;
    try {
      parsed = JSON.parse(String(d.summary).replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim());
    } catch (e) {
      console.warn('[chapters] JSON parse 失敗:', String(d.summary).slice(0, 300));
      throw new Error('検出結果を読み取れませんでした。もう一度お試しください');
    }
    const duration = Number(v.duration) || (_gdFileId === fileId ? Number(_gdVideoEl?.duration) || 0 : 0);
    let chaps = _normalizeChapters(parsed?.items, { duration, minSec: CHAP_MIN_SEC });
    if (via === 'sub') chaps = _snapChapters(chaps, cues);
    if (!chaps.length) return fail('チャプターを検出できませんでした');

    if (d.usage) console.log('[chapters] tokens:', d.usage, '/ 概算 $', d.costUsd, '/ via:', d.via);
    const costStr = typeof d.costUsd === 'number' ? ` · $${d.costUsd.toFixed(3)}` : '';
    endBtn();

    // 4. 確認してから書き込む
    const autoCount = (v.bookmarks || []).filter(b => b.auto === 'chapter').length;
    const note = (via === 'sub' ? '字幕から検出' : '動画から検出') + costStr;
    const sel = preset
      ? { chaps, withEnd: preset.withEnd !== false, replaceAuto: !!preset.replaceAuto }
      : await _chapReviewDialog(chaps, {
          note, autoCount,
          warn: (clipped || d.clipped) ? '字幕が長いため後半は読み取れていません' : '',
        });
    if (!sel) return { ok: false, skipped: true };

    const added = _applyChapters(id, sel, duration);
    if (!added) return fail('追加できるチャプターがありませんでした');
    if (!silent) window.toast?.(`📑 ${added}件のチャプターをブックマークに追加しました`);
    return { ok: true, added, cost: typeof d.costUsd === 'number' ? d.costUsd : 0 };
  } catch (e) {
    console.warn('[chapters] 検出失敗:', e);
    if (!silent) window.toast?.('⚠️ チャプターの検出に失敗: ' + (e?.message || e));
    return { ok: false, error: (e?.message || String(e)) };
  } finally {
    endBtn();
  }
};


// 起動時に ::cue スタイルを当て、設定画面のホストがあれば描いておく
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.wkSubOptsRender?.(); });
} else {
  setTimeout(() => { window.wkSubOptsRender?.(); }, 0);
}

// ── 字幕設定パネル（設定画面と再生画面で同じ部品を使う）──────
// 設定変更 → 保存 → 再生中なら取得し直さず整形だけやり直して即反映。
function _gdSubReapply() {
  if (!_gdVideoEl || !_gdSubTracks.length) return;
  const video  = _gdVideoEl;
  const opts   = subOpts();
  const offset = _subOffsetGet(_gdFileId);
  const idx    = _gdSubIndex;
  const prev   = _gdSubTracks;

  // src の差し替えは再読み込みされないブラウザがあるため、<track> ごと作り直す
  for (const t of prev) { try { t.track.remove(); } catch(e) {} }
  for (const u of _gdSubBlobUrls) { try { URL.revokeObjectURL(u); } catch(e) {} }
  _gdSubBlobUrls = [];
  _gdSubTracks   = [];

  for (const t of prev) {
    if (!t.rawVtt) continue;
    const url = URL.createObjectURL(new Blob([_reflowVtt(t.rawVtt, opts, offset)], { type: 'text/vtt' }));
    _gdSubBlobUrls.push(url);
    const track = document.createElement('track');
    track.kind    = 'subtitles';
    track.label   = t.label;
    track.srclang = t.track.srclang || 'ja';
    track.src     = url;
    video.appendChild(track);
    _gdSubTracks.push({ id: t.id, label: t.label, name: t.name, track, rawVtt: t.rawVtt, url });
  }
  setTimeout(() => _gdSubSelect(Math.min(idx, _gdSubTracks.length - 1)), 0);
}

window.wkSubOptSet = function(key, value) {
  const o = subOpts();
  if (typeof SUB_OPTS_DEFAULT[key] === 'number')       value = Number(value);
  else if (typeof SUB_OPTS_DEFAULT[key] === 'boolean') value = !!value;
  o[key] = value;
  _subOptsSave(o);
  _gdSubRenderCues();
  // 生成設定(gen*)は次回の生成にだけ効くので整形はやり直さない
  if (!/^gen/.test(key)) _gdSubReapply();
  window.wkSubOptsRender();
};

window.wkSubOptsReset = function() {
  try { localStorage.removeItem(SUB_OPTS_KEY); } catch(e) {}
  _gdSubRenderCues();
  _gdSubReapply();
  window.wkSubOptsRender();
  window.toast?.('字幕設定を既定値に戻しました');
};

// 動画ごとのタイミング補正
window.wkSubOffsetNudge = function(delta) {
  if (!_gdFileId) return;
  const next = Math.round((_subOffsetGet(_gdFileId) + delta) * 10) / 10;
  _subOffsetSet(_gdFileId, next);
  _gdSubReapply();
  window.wkSubOptsRender();
};

const _escAttr = v => String(v).replace(/"/g, '&quot;');

function _subSeg(key, cur, choices) {
  return `<div style="display:flex;gap:4px;flex-wrap:wrap">` + choices.map(([v, label]) =>
    `<button type="button" onclick="wkSubOptSet('${key}',${typeof v === 'string' ? `'${v}'` : v})"
       style="padding:4px 10px;border-radius:7px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;
              border:1.5px solid ${String(cur) === String(v) ? 'var(--accent,#6c8cff)' : 'var(--border)'};
              background:transparent;color:${String(cur) === String(v) ? 'var(--accent,#6c8cff)' : 'var(--text2)'}"
     >${label}</button>`).join('') + `</div>`;
}

function _subRange(key, cur, min, max, step, fmt) {
  return `<div style="display:flex;align-items:center;gap:8px">
    <input type="range" min="${min}" max="${max}" step="${step}" value="${_escAttr(cur)}"
      oninput="this.nextElementSibling.textContent=this.value${fmt ? `+'${fmt}'` : ''}"
      onchange="wkSubOptSet('${key}',this.value)"
      style="flex:1;accent-color:var(--accent,#6c8cff);min-width:110px">
    <span style="flex-shrink:0;min-width:44px;text-align:right;font-family:'DM Mono',monospace;font-size:11px;color:var(--text2)">${_escAttr(cur)}${fmt || ''}</span>
  </div>`;
}

// 「効いていない」を推測で潰さないための表示。
// 実際に当たっているCSSと、字幕が表示状態かをそのまま出す。
function _subCueDiag() {
  const o  = subOpts();
  const el = _gdContainer && _gdContainer.querySelector('#vp-sub-overlay');
  const tt = _gdVideoEl && _gdVideoEl.textTracks;
  let active = 0, total = 0;
  if (tt) { total = tt.length; for (let i = 0; i < tt.length; i++) if (tt[i].mode !== 'disabled') active++; }
  return `<div style="font-size:9.5px;color:var(--text3);line-height:1.7;font-family:'DM Mono',monospace;
      background:var(--surface2);border-radius:6px;padding:5px 7px">
      設定値 背景 ${_gdSubClamp(o.bgOpacity, 0, 1, 0.72)} ／ 文字 ${_gdSubClamp(o.fontScale, 0.3, 3, 1)}倍<br>
      表示欄 ${el ? el.childElementCount : 0}行 ／ 動画 ${_gdVideoEl ? 'あり' : 'なし'}<br>
      字幕トラック ${total}本（有効 ${active}本）
    </div>`;
}

function _subRow(label, hint, control) {
  return `<div style="display:flex;flex-direction:column;gap:5px">
    <div><div style="font-size:12px;font-weight:600">${label}</div>
    ${hint ? `<div style="font-size:10.5px;color:var(--text3);margin-top:1px">${hint}</div>` : ''}</div>
    ${control}
  </div>`;
}

// scope: 'full'（設定画面・生成設定も出す）| 'player'（再生中・タイミング補正も出す）
function _subOptsHTML(scope) {
  const o   = subOpts();
  const sec = t => `<div style="font-size:10.5px;font-weight:700;color:var(--text3);letter-spacing:.06em;margin-top:4px">${t}</div>`;
  const langChoices = [['ja','日本語'],['orig','原語のまま']];

  let html = sec('一度に出す量')
    + _subRow('1行の最大文字数（日本語）', '長いほど1行に詰め込む', _subRange('maxCharsJa', o.maxCharsJa, 8, 40, 1, '字'))
    + _subRow('1行の最大文字数（英語）', '', _subRange('maxCharsEn', o.maxCharsEn, 20, 80, 1, '字'))
    + _subRow('最大行数', '超えたぶんは時間を分けて次の字幕に送る', _subSeg('maxLines', o.maxLines, [[1,'1行'],[2,'2行'],[3,'3行']]))
    + _subRow('表示バランス', '上限文字数と区切りの良さは同時に守れないため、どちらを優先するか選びます',
        _subSeg('wrapMode', o.wrapMode, [['strict','文字数優先'],['balanced','バランス'],['natural','区切り優先']]))
    + sec('表示時間')
    + _subRow('最短表示', '一瞬で消えるのを防ぐ', _subRange('minDur', o.minDur, 0.4, 3, 0.1, '秒'))
    + _subRow('最長表示', '出しっぱなしを防ぐ', _subRange('maxDur', o.maxDur, 2, 15, 0.5, '秒'))
    + _subRow('短い字幕をまとめる', '細切れの字幕を隣とくっつけて読みやすくする', _subSeg('mergeShort', o.mergeShort, [[true,'まとめる'],[false,'そのまま']]))
    + sec('見た目')
    + _subRow('文字サイズ', '', _subRange('fontScale', o.fontScale, 0.6, 2, 0.05, '倍'))
    + _subRow('背景の濃さ', '0で背景なし', _subRange('bgOpacity', o.bgOpacity, 0, 1, 0.02, ''))
    + _subRow('表示位置', '', _subSeg('position', o.position, [['bottom','画面下'],['top','画面上']]))
    + _subCueDiag();

  if (scope === 'player') {
    if (_gdSubTracks.length) {
      html += sec('この動画の字幕ファイル')
        + _gdSubTracks.map((t, i) => `<div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:11.5px;font-weight:600">${t.label}</div>
              <div style="font-size:10px;color:var(--text3);word-break:break-all">${String(t.name || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
            </div>
            <button type="button" onclick="wkSubDeleteFile(${i})" title="Driveのゴミ箱へ移動"
              style="flex-shrink:0;padding:4px 9px;border-radius:7px;border:1.5px solid var(--red,#ef4444);
                     background:transparent;color:var(--red,#ef4444);font-family:inherit;font-size:11px;
                     font-weight:700;cursor:pointer">🗑 ゴミ箱へ</button>
          </div>`).join('')
        + `<div style="font-size:10.5px;color:var(--text3)">動画本体は削除されません。Driveのゴミ箱から元に戻せます。</div>`;
    }
    const off = _subOffsetGet(_gdFileId);
    html += sec('タイミング補正（この動画のみ）')
      + `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${[-1,-0.5,-0.1].map(d => `<button type="button" onclick="wkSubOffsetNudge(${d})" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer">${d}s</button>`).join('')}
          <span style="min-width:56px;text-align:center;font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:${off ? 'var(--accent,#6c8cff)' : 'var(--text3)'}">${off > 0 ? '+' : ''}${off.toFixed(1)}s</span>
          ${[0.1,0.5,1].map(d => `<button type="button" onclick="wkSubOffsetNudge(${d})" style="padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:transparent;color:var(--text2);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer">+${d}s</button>`).join('')}
        </div>
        <div style="font-size:10.5px;color:var(--text3)">字幕が音より早いならマイナス、遅いならプラス</div>`;
  }

  if (scope === 'full') {
    html += sec('生成の設定（変更すると再生成が必要 ＝ コストがかかります）')
      + _subRow('出力言語', '「原語のまま」は話されている言語で文字起こし', _subSeg('genLang', o.genLang, langChoices))
      + _subRow('文体', '', _subSeg('genStyle', o.genStyle, [['desu','ですます調'],['dearu','である調']]))
      + _subRow('起こし方', '意訳のほうが字幕としては読みやすい', _subSeg('genVerbatim', o.genVerbatim, [['natural','意訳して短く'],['verbatim','逐語']]))
      + _subRow('専門用語', 'ガード/スイープ等の扱い', _subSeg('genTerms', o.genTerms, [['katakana','カタカナ'],['english','英語のまま'],['translate','訳す']]))
      + _subRow('フィラー', '「えーと」「you know」などを残すか', _subSeg('genFillers', o.genFillers, [['drop','落とす'],['keep','残す']]))
      + _subRow('画面内の文字', 'ホワイトボードやテロップも拾う（精度は落ちる場合あり）', _subSeg('genOnScreen', o.genOnScreen, [[false,'拾わない'],[true,'拾う']]));
  }

  html += `<div style="display:flex;justify-content:flex-end;padding-top:4px">
    <button type="button" onclick="wkSubOptsReset()" style="padding:4px 12px;border-radius:7px;border:1.5px solid var(--border);background:transparent;color:var(--text3);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer">既定値に戻す</button>
  </div>`;
  return `<div style="display:flex;flex-direction:column;gap:13px">${html}</div>`;
}

// 開いているパネル（設定画面・再生中ポップアップ）を描き直す
// 字幕ファイルをDriveのゴミ箱へ移す。
// 完全削除（files.delete）ではなく trashed:true にする。
// ユーザーの実データなので、取り返しがつく方向に倒す（Driveのゴミ箱から復元できる）。
// 対象は _gdSubTracks に載っている字幕ファイルだけで、動画本体には触れない。
window.wkSubDeleteFile = async function(idx) {
  const t = _gdSubTracks[idx];
  if (!t || !t.id) { window.toast?.('対象の字幕ファイルが特定できませんでした'); return; }

  const token = window.getDriveTokenIfAvailable?.();
  if (!token) { window.toast?.('Google Drive の認証が必要です。動画を一度再生してください。'); return; }

  if (!confirm(`「${t.name}」をDriveのゴミ箱に移動しますか？\n\n動画本体は削除されません。\nDriveのゴミ箱から元に戻せます。`)) return;

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(t.id)}?fields=id,trashed`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      }
    );
    if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 150)}`);
  } catch (e) {
    console.warn('[subtitle] 削除失敗:', e);
    window.toast?.('⚠️ 字幕の削除に失敗: ' + (e?.message || e));
    return;
  }

  // 表示中のトラックを外し、検出キャッシュも捨てる
  try { t.track.remove(); } catch(e) {}
  if (t.url) { try { URL.revokeObjectURL(t.url); } catch(e) {} }
  const ui = _gdSubBlobUrls.indexOf(t.url);
  if (ui >= 0) _gdSubBlobUrls.splice(ui, 1);
  _gdSubTracks.splice(idx, 1);
  if (_gdFileId) _gdSubLookup.delete(_gdFileId);

  if (!_gdSubTracks.length) {
    _gdSubIndex = -1;
    document.getElementById('vp-sub-ui')?.remove();
    window.wkSubOptsClose();
  } else {
    _gdSubSelect(Math.min(_gdSubIndex, _gdSubTracks.length - 1));
  }
  window.wkSubOptsRender();
  window.toast?.(`🗑 字幕をゴミ箱に移動しました（${t.name}）`);
};

window.wkSubOptsRender = function() {
  const host = document.getElementById('sub-opts-host');
  if (host) host.innerHTML = _subOptsHTML('full');
  const pop = document.getElementById('vp-sub-opts');
  if (pop) {
    const body = pop.querySelector('#vp-sub-opts-body');
    if (body) body.innerHTML = _subOptsHTML('player');
  }
};

// CCボタン長押し / 右クリックで出す調整パネル
// ポップアップを画面内に収める。
// 高さを決め打ちしていると項目数や画面サイズで見切れるので、
// DOMに入れたあと実寸を測ってから位置を決める。
// アンカーの下に入らなければ上に出し、どちらにも入らなければ縮めてスクロールさせる。
function _fitPopup(el, anchorEl, opts) {
  const o = opts || {};
  const gap = 6, margin = 8;
  const vh = window.innerHeight, vw = window.innerWidth;
  const r  = anchorEl?.getBoundingClientRect();

  let h = el.offsetHeight;
  const below = r ? (vh - r.bottom - gap - margin) : (vh - margin * 2);
  const above = r ? (r.top - gap - margin) : 0;

  let top;
  if (r && h <= below)      top = r.bottom + gap;          // 下に入る
  else if (r && h <= above) top = r.top - gap - h;         // 上に入る
  else {
    // どちらにも入らない: 広い側に出し、高さを詰めてスクロールさせる
    const space = Math.max(below, above, 140);
    el.style.maxHeight = space + 'px';
    el.style.overflowY = 'auto';
    h = Math.min(el.offsetHeight, space);
    top = (r && above > below) ? (r.top - gap - h) : (r ? r.bottom + gap : margin);
  }
  el.style.top = Math.max(margin, Math.min(top, vh - h - margin)) + 'px';

  if (o.alignRight) return;   // 右寄せ指定のものは横位置を触らない
  const w = el.offsetWidth;
  const left = r ? r.left : margin;
  el.style.left  = Math.max(margin, Math.min(left, vw - w - margin)) + 'px';
  el.style.right = 'auto';
}

// パネルと背景を必ずセットで閉じる
window.wkSubOptsClose = function() {
  document.getElementById('vp-sub-opts')?.remove();
  document.getElementById('vp-sub-opts-bg')?.remove();
};

function _gdSubOpenPanel(anchorEl) {
  window.wkSubOptsClose();

  // 外クリックで閉じるための当たり判定。透明にしておく。
  // 画面を暗くすると調整中に肝心の字幕の見え方が判断できなくなるため暗幕にはしない。
  const bg = document.createElement('div');
  bg.id = 'vp-sub-opts-bg';
  bg.style.cssText = 'position:fixed;inset:0;z-index:10000;background:transparent';
  bg.addEventListener('mousedown', e => { e.stopPropagation(); window.wkSubOptsClose(); });
  bg.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(bg);

  const pop = document.createElement('div');
  pop.id = 'vp-sub-opts';
  // 画面全体を暗くする代わりに、パネル自身で視認性を確保する（不透明な面色＋太枠＋強い影）。
  pop.style.cssText = 'position:fixed;z-index:10001;background:var(--surface,#222);border:2px solid var(--accent,#6c8cff);'
    + 'border-radius:12px;box-shadow:0 14px 48px rgba(0,0,0,.75);'
    + 'width:min(340px,calc(100vw - 24px));'
    + 'max-height:min(76vh,560px);overflow-y:auto;padding:0 14px 12px;'
    + 'top:0;right:12px;visibility:hidden';
  pop.innerHTML = `<div style="position:sticky;top:0;background:var(--surface,#222);padding:11px 0 9px;margin-bottom:2px;
        border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;z-index:1">
      <div style="font-size:12px;font-weight:700">字幕の調整</div>
      <button type="button" onclick="wkSubOptsClose()"
        style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:0 4px;line-height:1">✕</button>
    </div>
    <div id="vp-sub-opts-body">${_subOptsHTML('player')}</div>`;
  pop.addEventListener('click', e => e.stopPropagation());
  pop.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(pop);
  _fitPopup(pop, anchorEl, { alignRight: true });
  pop.style.visibility = '';

  const onKey = e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    window.wkSubOptsClose();
    document.removeEventListener('keydown', onKey, true);
  };
  document.addEventListener('keydown', onKey, true);
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
    ${window.vpCounterSectionHTML ? window.vpCounterSectionHTML(id, { fav: v.fav, hideTop: true }) : ''}
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
// 選択肢はハードコードせず、必ず正典(tag-master.js → window.*)から取得する。
const VP_FIELD_MAP = { tb:'tb', cat:'cat', pos:'pos', tags:'tags' };

// 正典(tag-master.js → window.POSITIONS/CATEGORIES/TB_VALUES)から選択肢を取得。
// テーブルビュー等と同じソースを見ることで、編集パネルの選択肢が食い違わないようにする。
function _vpCanonicalOpts(type) {
  if (type === 'pos') return (window.POSITIONS  || []).map(p => p.ja).filter(Boolean);
  if (type === 'cat') return (window.CATEGORIES || []).map(c => c.name).filter(Boolean);
  if (type === 'tb')  return [...(window.TB_VALUES || [])];
  return []; // tags は固定の正典なし（動画データ・設定から収集）
}

export function vpGetAllOpts(type) {
  const ts = window.tagSettings || [];
  const fromSettings = ts.find(t => t.key === type)?.presets || [];
  const base = _vpCanonicalOpts(type);
  const fromVideos = (window.videos || []).flatMap(v => v[type] || []);
  return [...new Set([...base, ...fromSettings, ...fromVideos])].sort((a, b) => a.localeCompare(b, 'ja'));
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
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')  // **強調** → 太字（AI要約の小見出し等）
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
  }).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');  // **強調** → 太字
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
// シーク後、新フレームが実際に描画されるまで待つ（seeked直後は前フレームのままのことが多い）
function _waitForPresentedFrame(video, timeoutMs = 700) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; resolve(); };
    if (typeof video.requestVideoFrameCallback === 'function') {
      try { video.requestVideoFrameCallback(() => fin()); } catch(e) { fin(); }
    } else {
      // 非対応環境: ダブルrAF + 小休止で代替
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fin, 90)));
    }
    setTimeout(fin, timeoutMs); // 保険（フレームコールバックが来ない場合）
  });
}

// フレームの簡易シグネチャ（16x16 グレースケール）。連続重複の検出に使う。
function _frameSignature(video) {
  try {
    const N = 16;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const sig = new Uint8Array(N * N);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      sig[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    }
    return sig;
  } catch (e) { return null; }
}
// 2フレームの平均輝度差（0–255）。小さいほど似ている。
function _sigDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

async function _captureGdFrame(sec, videoEl) {
  const video = videoEl || _gdVideoEl;
  if (!video) return null;
  await new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; video.removeEventListener('seeked', fin); resolve(); };
    video.addEventListener('seeked', fin);
    try { video.currentTime = sec; } catch(e) { fin(); }
    setTimeout(fin, 2500); // seeked が来ない場合の保険
  });
  // seeked 後、実フレームが描画されるまで待ってから撮影（重複・前フレーム取得を防止）
  await _waitForPresentedFrame(video);
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
    const sig = _frameSignature(video);
    return { fullBlob, thumbDataUrl, sig };
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
      <button onmousedown="event.preventDefault()" onclick="vpMemoUndo('${id}')"
        class="vp-memo-tb-btn" title="元に戻す" style="font-size:15px">↶</button>
      <button onmousedown="event.preventDefault()" onclick="vpMemoRedo('${id}')"
        class="vp-memo-tb-btn" title="やり直し" style="font-size:15px">↷</button>
      <span class="vp-memo-tb-sep"></span>
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
        class="vp-memo-tb-btn" title="タイムスタンプ" style="border-color:#a8c0f0;color:#2050c0;font-weight:700">📍</button>
      <span class="vp-memo-tb-sep"></span>
      <button onmousedown="event.preventDefault()" onclick="vpMemoClear('${id}')"
        class="vp-memo-tb-btn" title="メモを全て削除"
        style="border-color:#f0a8a8;color:#c02020">🗑</button>
      <span class="vp-memo-tb-sep"></span>
      <button onmousedown="event.preventDefault()" onclick="vpMemoHelp(event)"
        class="vp-memo-tb-btn" title="各ボタンの説明"
        style="font-weight:800;color:var(--accent)">?</button>
    </div>
  </div>`;
}

// メモ書式ツールバー各ボタンのヘルプポップアップ（三点メニュー風）
window.vpMemoHelp = function(e) {
  if (e) e.stopPropagation();
  const existing = document.getElementById('vp-memo-help-menu');
  if (existing) { existing.remove(); return; } // トグル
  const btn = (e && e.currentTarget) || null;

  const items = [
    { ic: '✨',                                                  label: 'AI要約',        sub: 'この動画をAIが解析し、要約をメモに自動で書き込む' },
    { ic: '📷',                                                  label: 'スナップショット', sub: '今の動画フレームを撮影してメモ・写真に追加する' },
    { ic: '<span style="font-size:15px">↶</span>',              label: '元に戻す',       sub: '直前の編集を取り消す' },
    { ic: '<span style="font-size:15px">↷</span>',              label: 'やり直し',       sub: '取り消した編集をやり直す' },
    { ic: '<b>B</b>',                                            label: '太字',          sub: '選択した文字を太字にする' },
    { ic: '<i>I</i>',                                            label: '斜体',          sub: '選択した文字を斜体にする' },
    { ic: '<u>U</u>',                                            label: '下線',          sub: '選択した文字に下線を引く' },
    { ic: '<s>S</s>',                                            label: '取り消し線',     sub: '選択した文字に取り消し線を引く' },
    { ic: '<b>A</b>',                                            label: '文字サイズ',     sub: '文字の大きさを4段階で変える' },
    { ic: '<b style="color:#e53935">T</b>',                      label: '文字色',         sub: '文字の色を変える' },
    { ic: '<b style="background:#fff176;color:#555;padding:0 3px;border-radius:2px">M</b>', label: '蛍光ペン', sub: '文字に蛍光ペン（ハイライト）を引く' },
    { ic: '✕',                                                   label: '書式リセット',   sub: '選択範囲の書式をすべて消す' },
    { ic: '📍',                                                  label: 'タイムスタンプ', sub: '今の再生位置を [分:秒] で挿入。タップで頭出し' },
    { ic: '🗑',                                                  label: 'メモを全て削除', sub: 'このメモの内容をすべて消す（確認あり）' },
  ];

  const menu = document.createElement('div');
  menu.id = 'vp-memo-help-menu';
  menu.className = 'vp-search-menu';
  menu.style.paddingTop = '34px';

  let onOutside;
  const closeMenu = () => { menu.remove(); document.removeEventListener('click', onOutside, true); };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vp-more-close';
  closeBtn.textContent = '閉じる ✕';
  closeBtn.onclick = (ev) => { ev.stopPropagation(); closeMenu(); };
  menu.appendChild(closeBtn);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.4px;padding:2px 10px 8px;text-transform:uppercase';
  title.textContent = 'メモ書式ボタンの説明';
  menu.appendChild(title);

  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'vp-smenu-item';
    row.style.cursor = 'default';
    row.innerHTML = `
      <div class="vp-smenu-icon" style="font-size:13px">${it.ic}</div>
      <div class="vp-smenu-texts">
        <div class="vp-smenu-label">${it.label}</div>
        <div class="vp-smenu-sub">${it.sub}</div>
      </div>`;
    menu.appendChild(row);
  }

  if (btn) _positionMenu(menu, btn);
  else { menu.style.position = 'fixed'; menu.style.left = '50%'; menu.style.top = '20%'; menu.style.transform = 'translateX(-50%)'; menu.style.zIndex = '10005'; document.body.appendChild(menu); }

  onOutside = (ev) => { if (!menu.contains(ev.target) && ev.target !== btn) closeMenu(); };
  setTimeout(() => document.addEventListener('click', onOutside, true), 0);
};

// メモ編集の元に戻す/やり直し（contenteditable のブラウザ標準履歴を利用）
window.vpMemoUndo = function(id) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el || !el.isContentEditable) return;
  el.focus();
  document.execCommand('undo');
  vpSaveMemo(id);
};
window.vpMemoRedo = function(id) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el || !el.isContentEditable) return;
  el.focus();
  document.execCommand('redo');
  vpSaveMemo(id);
};

// メモ本文を全削除（確認あり）。ユーザー明示操作のみ。
window.vpMemoClear = function(id) {
  const el = document.getElementById('vp-memo-' + id);
  if (!el) return;
  const isEmpty = el.isContentEditable
    ? (el.textContent.trim() === '' && !/ts-link/.test(el.innerHTML))
    : (el.value.trim() === '');
  if (isEmpty) return;
  if (!confirm('このメモを全て削除しますか？')) return;
  if (el.isContentEditable) el.innerHTML = '';
  else el.value = '';
  vpSaveMemo(id);
};

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
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')  // **強調** → 太字（AI要約の小見出し等）
    .replace(/\n/g, '<br>');
};

// 表示中のプレイヤー要素を返す。
// スマホは #vpanel-iframe-container、PCは #vp-panel-yt-player とidが違うため、
// 決め打ちで引くと片方のレイアウトで必ず外れる（字幕の見た目が効かない不具合の原因でもあった）。
// GDrive再生中は実際に使ったコンテナを、それ以外は表示されている方を選ぶ。
function _vpPlayerEl() {
  if (_gdContainer && _gdContainer.isConnected) return _gdContainer;
  for (const id of ['vpanel-iframe-container', 'vp-panel-yt-player']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) return el;
  }
  return null;
}

// 現在のタブ画面をキャプチャ（getDisplayMedia）→ 動画プレイヤー部分を自動クロップ
async function _captureScreenFrame() {
  // キャプチャ前に動画プレイヤーの位置を記録
  const playerEl = _vpPlayerEl();
  const playerRect = playerEl?.getBoundingClientRect();

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1, displaySurface: 'browser' },
    audio: false,
    selfBrowserSurface: 'include',
    preferCurrentTab: true
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => video.play().then(res).catch(rej);
      setTimeout(rej, 5000);
    });
    await new Promise(r => setTimeout(r, 120));

    const capW = video.videoWidth, capH = video.videoHeight;
    const fc = document.createElement('canvas');
    fc.width = capW; fc.height = capH;
    fc.getContext('2d').drawImage(video, 0, 0);

    // キャプチャ解像度とブラウザ座標系のスケール比を算出
    const scaleX = capW / window.innerWidth;
    const scaleY = capH / window.innerHeight;

    // 動画プレイヤー領域をクロップ
    let srcCanvas = fc;
    if (playerRect && playerRect.width > 10 && playerRect.height > 10) {
      const sx = Math.round(playerRect.left * scaleX);
      const sy = Math.round(playerRect.top  * scaleY);
      const sw = Math.round(playerRect.width  * scaleX);
      const sh = Math.round(playerRect.height * scaleY);
      const cc = document.createElement('canvas');
      cc.width = sw; cc.height = sh;
      cc.getContext('2d').drawImage(fc, sx, sy, sw, sh, 0, 0, sw, sh);
      srcCanvas = cc;
    }

    const fullBlob = await new Promise(r => srcCanvas.toBlob(r, 'image/jpeg', 0.9));

    // サムネ（幅320px以内に縮小）
    const tc = document.createElement('canvas');
    const scale = Math.min(1, 320 / srcCanvas.width);
    tc.width = Math.round(srcCanvas.width * scale);
    tc.height = Math.round(srcCanvas.height * scale);
    tc.getContext('2d').drawImage(srcCanvas, 0, 0, tc.width, tc.height);
    const thumbDataUrl = tc.toDataURL('image/jpeg', 0.75);

    return { fullBlob, thumbDataUrl };
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

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

    // GDriveは直接キャプチャ、それ以外はgetDisplayMedia（画面キャプチャ）
    let cap = null;
    if (_gdVideoEl && v?.pt === 'gdrive') {
      cap = await _captureGdFrame(sec);
    } else if (navigator.mediaDevices?.getDisplayMedia) {
      window.toast?.('「このタブ」または「このウィンドウ」を選択してください');
      cap = await _captureScreenFrame();
    }

    if (cap?.fullBlob && window.snapAddBlob) {
      const snapId = await window.snapAddBlob(id, cap.fullBlob, sec, '');
      const thumbHtml = _thumbHtml(snapId, sec, cap.thumbDataUrl, 'block');
      const rowHtml = `<div style="margin:4px 0">${tsHtml}&nbsp;${thumbHtml}</div>`;
      memoEl.focus();
      document.execCommand('insertHTML', false, rowHtml);
      _bindTsLinks(memoEl);
      vpSaveMemo(id);
      const snapSec = document.getElementById('vp-snap-section-' + id);
      if (snapSec && window.initSnapshotSection) window.initSnapshotSection(id, snapSec);
      window.toast?.('📸 スクショをメモに追加しました');
    } else {
      // キャプチャ不可（モバイル等）→ タイムスタンプのみ
      memoEl.focus();
      document.execCommand('insertHTML', false, `<span>${tsHtml}&nbsp;</span>`);
      _bindTsLinks(memoEl);
      vpSaveMemo(id);
      window.toast?.('📍 タイムスタンプを挿入しました（スクショ非対応環境）');
    }
  } catch(e) {
    if (e.name === 'NotAllowedError') {
      window.toast?.('キャンセルしました');
    } else {
      console.error('[vpMemoSnapNow]', e);
      window.toast?.('⚠️ キャプチャに失敗しました');
    }
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

// GDrive動画から指定秒のフレームを撮影しスナップショット登録。shotMap{sec:{snapId,thumbDataUrl}}を返す。
// 要約・分岐で共通利用（同じ撮影ロジックを2箇所に持たないため一本化）。btnがあれば進捗表示。
// 一括処理ではVPanelが開いていないため _gdVideoEl が無い。
// 撮影用に同じ /api/drive プロキシから隠しの <video> を作って渡す。
// （同一オリジン配信なので canvas が汚染されず、そのままキャプチャできる）
async function _makeOffscreenGdVideo(fileId, token) {
  const v = document.createElement('video');
  v.src = `/api/drive?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`;
  v.muted = true;
  v.preload = 'auto';
  v.setAttribute('playsinline', '');
  // 一部ブラウザはDOMに無い要素をデコードしないため、見えない形で入れておく
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  const ok = await new Promise(resolve => {
    let done = false;
    const fin = (val) => { if (done) return; done = true; resolve(val); };
    v.addEventListener('loadedmetadata', () => fin(true), { once: true });
    v.addEventListener('error', () => fin(false), { once: true });
    setTimeout(() => fin(false), 20000);   // 読み込めない動画で止まらないための保険
  });
  if (!ok || !v.videoWidth) { try { v.remove(); } catch(e) {} return null; }
  return v;
}

async function _vpCaptureGdShots(id, secs, tsText, btn, videoEl) {
  const shotMap = {};
  const vid = videoEl || _gdVideoEl;
  if (!vid || !secs.length || !window.snapAddBlob) return shotMap;
  const origTime = vid.currentTime;
  const wasPlaying = !vid.paused;
  try { vid.pause(); } catch(e) {}
  let prevSig = null;
  const DUP_THRESHOLD = 5; // 平均輝度差がこれ未満なら「直前とほぼ同じ画」とみなす
  for (let i = 0; i < secs.length; i++) {
    if (btn) btn.textContent = `📸 ${i+1}/${secs.length}`;
    try {
      let cap = await _captureGdFrame(secs[i], vid);
      let nudge = 0;
      while (cap && prevSig && _sigDiff(cap.sig, prevSig) < DUP_THRESHOLD && nudge < 2) {
        nudge++;
        const dur = vid.duration || (secs[i] + 3);
        const nx = Math.min(dur - 0.2, secs[i] + 0.7 * nudge);
        if (nx <= secs[i]) break;
        const c2 = await _captureGdFrame(nx, vid);
        if (!c2) break;
        cap = c2;
      }
      if (cap && cap.fullBlob) {
        const snapId = await window.snapAddBlob(id, cap.fullBlob, secs[i], (tsText && tsText[secs[i]]) || '');
        shotMap[secs[i]] = { snapId, thumbDataUrl: cap.thumbDataUrl };
        prevSig = cap.sig || prevSig;
      }
    } catch(e) { console.warn('[shot]', secs[i], e); }
  }
  try { vid.currentTime = origTime; if (wasPlaying) vid.play().catch(()=>{}); } catch(e) {}
  return shotMap;
}

// テキスト（[M:SS]含む）から秒→行末テキストの map を作る（撮影ラベル用）
function _vpCollectTsText(text) {
  const tsText = {};
  for (const line of String(text||'').split('\n')) {
    const m = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)/);
    if (!m) continue;
    const c = m[3];
    const sec = c!=null ? (+m[1]*3600 + +m[2]*60 + +c) : (+m[1]*60 + +m[2]);
    const t = (m[4]||'').replace(/^[-・*\s]+/, '').replace(/\*\*/g,'').trim();
    if (!(sec in tsText)) tsText[sec] = t;
  }
  return tsText;
}

// ── AI呼び出し共通ヘルパー（desc/branch 用。summaryは既存フローのまま）──
// 成功: 生成テキストを返す / 失敗: null（トースト表示済み）
async function _vpAiVideoCall(id, mode, btn, busyLabel) {
  const v = (window.videos||[]).find(v => v.id===id);
  if (!v) return null;
  const isYT = v.pt === 'youtube' && v.ytId;
  const isGD = v.pt === 'gdrive';
  if (!isYT && !isGD) { window.toast?.('YouTube または Google Drive の動画のみ対応しています'); return null; }
  const user = window._firebaseCurrentUser?.();
  if (!user) { window.toast?.('ログインが必要です'); return null; }
  let gdAccessToken = null;
  if (isGD) {
    gdAccessToken = window.getDriveTokenIfAvailable?.();
    if (!gdAccessToken) { window.toast?.('Google Drive の認証が必要です。動画を一度再生してください。'); return null; }
  }
  const origLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = busyLabel; btn.style.opacity = '0.6'; }
  try {
    const idToken = await user.getIdToken();
    const reqBody = isYT
      ? { idToken, mode, source: 'youtube', ytId: v.ytId, title: v.title||'', channel: v.ch||v.channel||'', playlist: v.pl||'' }
      : { idToken, mode, source: 'gdrive', gdFileId: (v.id||'').replace(/^gd-/,''), accessToken: gdAccessToken, title: v.title||'', channel: v.ch||v.channel||'', playlist: v.pl||'' };
    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('/api/ai-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.summary) return d.summary;
        lastErr = (d.error || ('HTTP ' + res.status)) + (d.detail ? ` (${d.detail})` : '');
      } catch (e) { lastErr = e.message; }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1800));
    }
    window.toast?.('⚠️ AI処理に失敗: ' + (lastErr || '原因不明'), 8000);
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel; btn.style.opacity = ''; }
  }
}

// 保存（一時障害に備えて1回リトライ）
async function _vpAiSave() {
  if (!window.saveUserData) return true;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let ok = false;
    try { ok = await window.saveUserData(); } catch(e) { ok = false; }
    if (ok) return true;
    if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
  }
  window.toast?.('⚠️ 保存に失敗しました。通信環境を確認してください', 7000);
  return false;
}

// ── AI一言解説（動画を開く前に内容が分かる1〜2文。カード・パネルに表示）──
window.vpAiDesc = async function(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const btn = document.getElementById('vp-aidesc-btn-' + id);
  const text = await _vpAiVideoCall(id, 'desc', btn, '⏳ 生成中…');
  if (!text) return;
  v.aiDesc = text.replace(/\s*\n\s*/g, ' ').trim();
  const line = document.getElementById('vp-aidesc-' + id);
  const txt  = document.getElementById('vp-aidesc-txt-' + id);
  if (txt) txt.textContent = v.aiDesc;
  if (line) line.style.display = '';
  await _vpAiSave();
  window.AF?.(); // カードの一言解説を即時反映
  window.toast?.('💬 一言解説を生成しました');
};

// ── AI分岐抽出（状況×相手の反応×技 → v.aiBranches に保存＋Memoにアウトライン追記）──
// 要約と同じく、GDrive動画では各分岐のタイムスタンプの写真も自動で埋め込む。
window.vpAiBranch = async function(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const isGD = v.pt === 'gdrive';
  const btn = document.getElementById('vp-aibranch-btn-' + id);

  // 写真の有無・レイアウトを先に確認（GDriveのみ撮影可）
  const opts = await _askSummaryOptions(isGD);
  if (!opts) return; // キャンセル

  const raw = await _vpAiVideoCall(id, 'branch', btn, '⏳ 抽出中…');
  if (!raw) return;
  let items = null;
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
    items = Array.isArray(parsed?.items) ? parsed.items : (Array.isArray(parsed) ? parsed : null);
  } catch(e) { console.warn('[aiBranch] JSON parse失敗:', e, raw.slice(0, 300)); }
  if (!items || !items.length) { window.toast?.('⚠️ 分岐データの解析に失敗しました', 6000); return; }

  // 動画ごとの構造化データとして保存（将来のマップ合成の素材。追記のみで安全）
  v.aiBranches = { items, at: new Date().toISOString().slice(0, 10) };

  // Memo用アウトライン（situationごとにグループ化。[M:SS]はts-link化される）
  const bySit = new Map();
  for (const it of items) {
    const sit = (it.situation || 'その他').trim();
    if (!bySit.has(sit)) bySit.set(sit, []);
    bySit.get(sit).push(it);
  }
  const lines = [`── 🌳 分岐（相手の状態→こちらの技） (${new Date().toISOString().slice(0,10)}) ──`];
  for (const [sit, arr] of bySit) {
    lines.push(`◾️${sit}`);
    for (const it of arr) {
      const ts   = it.timestamp ? `[${it.timestamp}] ` : '';
      const trig = (it.trigger || it.condition || '基本').trim();   // 分岐＝相手の状態（旧condition互換）
      const resp = (it.response || it.technique || '').trim();       // こちらの技（旧technique互換）
      // 手順は分岐に含めない方針。detailが来ても長い手順段落は載せない（短ければ括弧で付す）。
      const det  = (it.detail || '').trim();
      const shortDet = (det && det.length <= 24) ? `（${det}）` : '';
      lines.push(`- ${ts}相手：**${trig}** → ${resp}${shortDet}`);
    }
  }
  const outline = lines.join('\n');

  // 写真撮影（opts.shot かつ GDrive）→ 要約と同じサムネ埋め込み描画
  let shotMap = {};
  if (opts.shot && isGD && _gdVideoEl) {
    const tsText = _vpCollectTsText(outline);
    const secs = Object.keys(tsText).map(Number).sort((a,b)=>a-b);
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    shotMap = await _vpCaptureGdShots(id, secs, tsText, btn);
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = '🌳 分岐'; }
  }
  const html = Object.keys(shotMap).length
    ? _summaryToHtmlWithShots(outline, shotMap, opts.layout)
    : _memoToHtml(outline);
  const memoEl = document.getElementById('vp-memo-' + id);
  if (memoEl) {
    const cur = memoEl.innerHTML.trim();
    memoEl.innerHTML = cur ? `${html}<br><br>${cur}` : html;
    _bindTsLinks(memoEl);
    v.memo = memoEl.innerHTML.trim();
  } else {
    const cur = (v.memo || '').trim();
    v.memo = cur ? `${html}<br><br>${cur}` : html;
  }
  await _vpAiSave();
  window.toast?.(`🌳 分岐を${items.length}件抽出しました`);
};

// ── AI要約（Gemini / YouTube・Google Drive・オーナー限定）──
// preset を渡すと対話なしで実行する（一括処理用）。preset = { shot:false, silent:true }
// 戻り値: { ok, skipped, error, cost }
window.vpAiSummary = async function(id, preset) {
  const silent = !!(preset && preset.silent);
  const fail = (msg) => { if (!silent) window.toast?.(msg); return { ok: false, error: msg }; };

  const v = (window.videos||[]).find(v => v.id===id);
  if (!v) return fail('動画が見つかりません');

  const isYT = v.pt === 'youtube' && v.ytId;
  const isGD = v.pt === 'gdrive';
  if (!isYT && !isGD) return fail('YouTube または Google Drive の動画のみ対応しています');

  const user = window._firebaseCurrentUser?.();
  if (!user) return fail('ログインが必要です');

  // Google Drive の場合はアクセストークンが必要
  let gdAccessToken = null;
  if (isGD) {
    gdAccessToken = window.getDriveTokenIfAvailable?.();
    if (!gdAccessToken) return fail('Google Drive の認証が必要です。動画を一度再生してください。');
  }

  const btn = preset ? null : document.getElementById('vp-aisum-' + id);
  const memoEl = document.getElementById('vp-memo-' + id);
  const origLabel = btn ? btn.textContent : '';

  // スクショオプションを先に確認（GDriveのみ撮影可。YouTubeはダイアログ無しで要約のみ）
  const opts = preset || await _askSummaryOptions(isGD);
  if (!opts) return { ok: false, skipped: true }; // キャンセル

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
        if (res.ok && d.summary) {
          if (d.usage) console.log('[aiSummary] tokens:', d.usage, '/ 概算 $', d.costUsd);
          data = d; break;
        }
        lastErr = (d.error || ('HTTP ' + res.status)) + (d.detail ? ` (${d.detail})` : '');
        console.warn(`[aiSummary] 生成失敗 attempt ${attempt}/2:`, res.status, d);
      } catch (e) {
        lastErr = e.message;
        console.warn(`[aiSummary] 生成エラー attempt ${attempt}/2:`, e);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 1800));
    }
    if (!data) {
      const reason = lastErr || '原因不明';
      console.error('[aiSummary] 最終的に生成失敗:', lastErr);
      if (!silent) {
        window.toast?.('⚠️ AI要約に失敗: ' + reason, 9000);
        try { alert('⚠️ AI要約に失敗しました\n\n理由: ' + reason + '\n\n（動画が長い・非公開・年齢制限などで処理できない場合があります）'); } catch(e) {}
      }
      return { ok: false, error: reason };
    }

    // スクショ撮影（opts.shot かつ GDrive動画）— 分岐抽出と共通のヘルパーを使用
    let shotMap = {};
    if (opts.shot && isGD) {
      const tsText = _vpCollectTsText(data.summary);
      const secs = Object.keys(tsText).map(Number).sort((a,b)=>a-b);
      if (secs.length) {
        // 再生中ならその要素を使う。一括処理でVPanelが無い場合だけ隠し要素を作る。
        let offscreen = null;
        try {
          if (!_gdVideoEl) {
            offscreen = await _makeOffscreenGdVideo((v.id||'').replace(/^gd-/,''), gdAccessToken);
          }
          const useEl = _gdVideoEl || offscreen;
          if (useEl) {
            shotMap = await _vpCaptureGdShots(id, secs, tsText, btn, useEl);
          } else {
            console.warn('[aiSummary] スクショ用の動画を読み込めなかったため要約のみ保存します');
          }
        } finally {
          if (offscreen) { try { offscreen.pause(); offscreen.removeAttribute('src'); offscreen.load(); offscreen.remove(); } catch(e) {} }
        }
      }
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
        if (!silent) window.toast?.('⚠️ 要約は表示されていますが保存に失敗しました。もう一度「✨AI要約」を押すか、メモを編集して保存してください', 7000);
        console.error('[aiSummary] 保存が2回とも失敗。v.memo はメモリ上にのみ存在');
        return { ok: false, error: '保存に失敗しました' }; // 成功トーストは出さない
      }
    } else {
      autoSaveVp(id);
    }
    if (!silent) window.toast?.(shotCount ? `✨ 要約＋スクショ${shotCount}枚を追記しました` : '✨ AI要約をMemoに追記しました');
    return { ok: true, cost: typeof data.costUsd === 'number' ? data.costUsd : 0, shots: shotCount };
  } catch (e) {
    console.error('[aiSummary] 例外:', e);
    if (!silent) {
      window.toast?.('要約エラー: ' + e.message);
      try { alert('⚠️ AI要約エラー: ' + ((e && e.message) || e)); } catch(_) {}
    }
    return { ok: false, error: (e?.message || String(e)) };
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origLabel || '✨ AI要約'; btn.style.opacity = '1'; }
  }
};

// ── YouTube AI要約 + getDisplayMediaスクショ ──
window.vpAiSummaryWithShot = async function(id) {
  const v = (window.videos||[]).find(v => v.id===id);
  if (!v || v.pt !== 'youtube' || !v.ytId) { window.toast?.('YouTube動画のみ対応です'); return; }
  const user = window._firebaseCurrentUser?.();
  if (!user) { window.toast?.('ログインが必要です'); return; }

  const btn = document.getElementById('vp-aisum-shot-' + id);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; btn.style.opacity = '0.6'; }

  try {
    // 1. AI要約テキスト生成
    if (btn) btn.textContent = '⏳ 要約中…';
    const idToken = await user.getIdToken();
    const res = await fetch('/api/ai-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, source: 'youtube', ytId: v.ytId, title: v.title||'', channel: v.ch||v.channel||'', playlist: v.pl||'' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.summary) {
      const reason = (data.error || ('HTTP ' + res.status)) + (data.detail ? ` (${data.detail})` : '');
      console.error('[aiSummaryWithShot] 失敗:', res.status, data);
      window.toast?.('⚠️ AI要約に失敗: ' + reason, 9000);
      try { alert('⚠️ AI要約に失敗しました\n\n理由: ' + reason + '\n\n（動画が長い・非公開・年齢制限などで処理できない場合があります）'); } catch(e) {}
      return;
    }

    // 2. タイムスタンプ収集
    const tsText = {};
    for (const line of data.summary.split('\n')) {
      const m = line.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)/);
      if (!m) continue;
      const c = m[3];
      const sec = c!=null ? (+m[1]*3600 + +m[2]*60 + +c) : (+m[1]*60 + +m[2]);
      if (!(sec in tsText)) tsText[sec] = (m[4]||'').replace(/^[-・*\s]+/,'').trim();
    }
    const secs = Object.keys(tsText).map(Number).sort((a,b)=>a-b);

    // 3. getDisplayMedia でタブをキャプチャ（1回だけ許可を求める）
    if (btn) btn.textContent = '📸 画面共有…';
    window.toast?.('「このタブ」を選択してください（OKしてから撮影が始まります）');
    const playerEl = _vpPlayerEl();
    const playerRect = playerEl?.getBoundingClientRect();

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5, displaySurface: 'browser' },
      audio: false, selfBrowserSurface: 'include', preferCurrentTab: true
    });

    const capVideo = document.createElement('video');
    capVideo.srcObject = stream;
    capVideo.muted = true;
    await new Promise((res, rej) => { capVideo.onloadedmetadata = () => capVideo.play().then(res).catch(rej); setTimeout(rej, 5000); });

    // 4. 各タイムスタンプでシーク→待機→キャプチャ
    const shotMap = {};
    const origTime = _getCurrentTime() ?? 0;
    for (let i = 0; i < secs.length; i++) {
      if (btn) btn.textContent = `📸 ${i+1}/${secs.length}`;
      _seekTo(secs[i]);
      await new Promise(r => setTimeout(r, 700)); // 描画待ち

      const capW = capVideo.videoWidth, capH = capVideo.videoHeight;
      const scaleX = capW / window.innerWidth, scaleY = capH / window.innerHeight;
      const fc = document.createElement('canvas');
      fc.width = capW; fc.height = capH;
      fc.getContext('2d').drawImage(capVideo, 0, 0);

      let srcCanvas = fc;
      if (playerRect?.width > 10) {
        const sx = Math.round(playerRect.left * scaleX), sy = Math.round(playerRect.top * scaleY);
        const sw = Math.round(playerRect.width * scaleX), sh = Math.round(playerRect.height * scaleY);
        const cc = document.createElement('canvas');
        cc.width = sw; cc.height = sh;
        cc.getContext('2d').drawImage(fc, sx, sy, sw, sh, 0, 0, sw, sh);
        srcCanvas = cc;
      }
      const fullBlob = await new Promise(r => srcCanvas.toBlob(r, 'image/jpeg', 0.85));
      const tc = document.createElement('canvas');
      const sc = Math.min(1, 200 / srcCanvas.width);
      tc.width = Math.round(srcCanvas.width*sc); tc.height = Math.round(srcCanvas.height*sc);
      tc.getContext('2d').drawImage(srcCanvas, 0, 0, tc.width, tc.height);
      const thumbDataUrl = tc.toDataURL('image/jpeg', 0.7);

      if (fullBlob && window.snapAddBlob) {
        const snapId = await window.snapAddBlob(id, fullBlob, secs[i], tsText[secs[i]]||'');
        shotMap[secs[i]] = { snapId, thumbDataUrl };
      }
    }
    stream.getTracks().forEach(t => t.stop());
    _seekTo(origTime); // 元の位置に戻す

    // 5. メモに挿入
    if (btn) btn.textContent = '⏳ 整理中…';
    const stamp = new Date().toISOString().slice(0,10);
    const header = `── ✨ AI要約+📸 (${stamp}) ──`;
    const shotCount = Object.keys(shotMap).length;
    const summaryHtml = shotCount
      ? `<div style="font-size:11px;color:#7040c0;font-weight:700;margin-bottom:4px">${header}</div>` + _summaryToHtmlWithShots(data.summary, shotMap, 'block')
      : `<div style="font-size:11px;color:#7040c0;font-weight:700;margin-bottom:4px">${header}</div>` + _memoToHtml(data.summary);

    const memoEl = document.getElementById('vp-memo-' + id);
    if (memoEl) {
      const cur = memoEl.innerHTML.trim();
      memoEl.innerHTML = cur ? `${summaryHtml}<br><br>${cur}` : summaryHtml;
      _bindTsLinks(memoEl);
      v.memo = memoEl.innerHTML.trim();
    } else {
      v.memo = summaryHtml;
    }
    const snapSec = document.getElementById('vp-snap-section-' + id);
    if (snapSec && window.initSnapshotSection) window.initSnapshotSection(id, snapSec);
    autoSaveVp(id);
    window.toast?.(`✨ 要約＋スクショ${shotCount}枚を追記しました`);
  } catch(e) {
    if (e.name === 'NotAllowedError') window.toast?.('キャンセルしました');
    else {
      console.error('[aiSummaryWithShot]', e);
      window.toast?.('エラー: ' + e.message);
      try { alert('⚠️ AI要約エラー: ' + ((e && e.message) || e)); } catch(_) {}
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨📸'; btn.style.opacity = '1'; }
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
        <div class="vp-memo-stickyhead">
          <span class="vp-lbl">Memo${(window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com' && (v?.pt === 'youtube' && v?.ytId || v?.pt === 'gdrive'))
            ? `<button id="vp-aisum-${id}" onclick="vpAiSummary('${id}')" title="この動画をAIで要約しMemoに追記" style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--accent,#6c8cff);background:transparent;color:var(--accent,#6c8cff);cursor:pointer;vertical-align:middle">✨ AI要約</button>`
            : ''}${(window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com' && v?.pt === 'gdrive')
            ? `<button id="vp-subgen-${id}" onclick="vpGenSubtitle('${id}')" title="AIが音声を文字起こしし、字幕(SRT)をDriveの同じフォルダに保存します" style="margin-left:4px;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;vertical-align:middle">💬 字幕生成</button>`
            : ''}</span>
          ${_memoToolbarHTML(id)}
        </div>
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
    // お気に入りUIは三点メニューへ移設したのでパネル要素には依存せず直接トグル
    vpTogFav(id);
    window.toast?.((window.videos||[]).find(v=>v.id===id)?.fav ? '⭐ お気に入りに追加' : 'お気に入りを解除');
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
  const vObj = (window.videos || []).find(x => x.id === id) || {};

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
  const favSvg     = mkSvg('<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>');
  // NEXT / ドリル はアプリ本来のマーク（🎯 / 紫DRILLバッジ）に合わせ、オン/オフで切替
  const nextIcon   = (on) => on
    ? `<span style="font-size:16px;line-height:1">🎯</span>`
    : `<span style="font-size:15px;line-height:1;color:var(--text3)">○</span>`;
  const drillIcon  = (on) => on
    ? `<svg width="26" height="15" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="#7c3aed"/><text x="17.5" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`
    : `<svg width="26" height="15" viewBox="0 0 35 20" fill="none"><rect x="1" y="1" width="33" height="18" rx="9" fill="none" stroke="#666" stroke-width="1.5"/><text x="17.5" y="14" text-anchor="middle" fill="#666" font-size="9" font-weight="900" font-family="Arial Black,sans-serif" letter-spacing="0.8">DRILL</text></svg>`;
  const cntSvg     = mkSvg('<path d="M4 9h4v11H4zM10 4h4v16h-4zM16 13h4v7h-4z"/>');

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

  // ── ループ再生（A-B区間ループ）: 押した時だけ既存の場所にループ再生バーを表示 ──
  const loopMenuSub = _ab.loop ? '区間ループ中' : (window._vpLoopVisible ? '表示中' : 'オフ');
  const lpi = _menuItem(repeatSvg, 'ループ再生', loopMenuSub);
  if (_ab.loop || window._vpLoopVisible) lpi.classList.add('vp-smenu-on');
  const lpiSub = lpi.querySelector('.vp-smenu-sub');
  lpi.onclick = () => {
    // トグル表示。ただしループ動作中は OFF 操作を残すため隠さない。
    window._vpLoopVisible = !window._vpLoopVisible;
    if (!window._vpLoopVisible && _ab.loop) window._vpLoopVisible = true;
    _abRefresh(id);
    lpi.classList.toggle('vp-smenu-on', _ab.loop || window._vpLoopVisible);
    lpiSub.textContent = _ab.loop ? '区間ループ中' : (window._vpLoopVisible ? '表示中' : 'オフ');
    animItem(lpi);
  };
  menu.appendChild(lpi);

  addDivider();

  // ── お気に入り / NEXT / ドリル（トグル）＋ カウンター（ステッパー）──
  // 旧パネル下部の行を三点メニューへ移設。いずれもユーザー明示操作で v.* をトグル/増減し autoSaveVp。
  const _mkToggle = (icon, label, getOn, toggleFn) => {
    const iconFn = (typeof icon === 'function') ? icon : () => icon;
    const on0 = !!getOn();
    const it = _menuItem(iconFn(on0), label, on0 ? 'オン' : 'オフ');
    if (on0) it.classList.add('vp-smenu-on');
    const sub = it.querySelector('.vp-smenu-sub');
    const iconBox = it.querySelector('.vp-smenu-icon');
    it.onclick = () => {
      toggleFn();
      const on = !!getOn();
      it.classList.toggle('vp-smenu-on', on);
      sub.textContent = on ? 'オン' : 'オフ';
      if (iconBox) iconBox.innerHTML = iconFn(on);
      animItem(it);
    };
    menu.appendChild(it);
  };
  _mkToggle(favSvg,    'お気に入り', () => vObj.fav,   () => vpTogFav(id));
  _mkToggle(nextIcon,  'NEXT',      () => vObj.next,  () => vpTogNext(id));
  _mkToggle(drillIcon, 'ドリル',     () => vObj.drill, () => vpTogDrill(id));

  // カウンター（練習回数）: −/数字/＋。＋/−でメニューは閉じない。
  const cntBtnS = 'width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:15px;font-weight:700;color:var(--text2);padding:0;font-family:inherit;line-height:1;flex-shrink:0';
  const cntBtnP = 'width:26px;height:26px;border-radius:50%;border:none;background:var(--accent);cursor:pointer;font-size:15px;font-weight:700;color:var(--on-accent);padding:0;font-family:inherit;line-height:1;flex-shrink:0';
  const cntRow = document.createElement('div');
  cntRow.className = 'vp-smenu-item';
  cntRow.style.cursor = 'default';
  cntRow.innerHTML = `
    <div class="vp-smenu-icon">${cntSvg}</div>
    <div class="vp-smenu-texts"><div class="vp-smenu-label">カウンター</div></div>
    <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
      <button type="button" data-act="dec" style="${cntBtnS}">−</button>
      <span id="vp-cnt-p-${id}" style="font-size:16px;font-weight:800;color:#e8590c;min-width:22px;text-align:center;font-variant-numeric:tabular-nums">${vObj.practice || 0}</span>
      <button type="button" data-act="inc" style="${cntBtnP}">＋</button>
    </div>`;
  cntRow.querySelector('[data-act="dec"]').onclick = (ev) => { ev.stopPropagation(); window.vpCntDec?.(id, 'practice'); };
  cntRow.querySelector('[data-act="inc"]').onclick = (ev) => { ev.stopPropagation(); window.vpCntInc?.(id, 'practice'); };
  menu.appendChild(cntRow);

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
