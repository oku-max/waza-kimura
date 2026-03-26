// ═══ WAZA KIMURA — 動画パネル（VPanel） v47.79 ═══
// YouTube iFrame Player API対応版
// モバイル用(#vpanel)・PC用(#vp-panel)両対応

// ── YT.Player管理 ──
let _ytPlayer = null;       // 現在アクティブなYT.Playerインスタンス
let _ytPlayerReady = false; // プレイヤーが操作可能な状態か
let _ytApiLoaded = false;   // YouTube iFrame API読み込み済みか
let _gdVideoEl = null;      // GDrive再生中の<video>要素への参照

// YouTube iFrame APIを非同期で読み込む（初回のみ）
function _loadYTApi() {
  if (_ytApiLoaded || document.getElementById('yt-iframe-api-script')) return;
  _ytApiLoaded = true;
  const tag = document.createElement('script');
  tag.id = 'yt-iframe-api-script';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

// YouTube iFrame APIの準備完了コールバック（グローバル必須）
window.onYouTubeIframeAPIReady = function() {
  // APIが準備できた後にプレイヤーが待機中なら初期化
  if (window._pendingYTInit) {
    window._pendingYTInit();
    window._pendingYTInit = null;
  }
};

// YT.Playerを初期化する
// containerId: iframeを入れるdivのid
// ytId: YouTubeのvideo ID
// autoplay: 自動再生するか
// onReady: 準備完了後のコールバック
function _initYTPlayer(containerId, ytId, autoplay, onReady) {
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
        playsinline: 1
      },
      events: {
        onReady: (e) => {
          _ytPlayerReady = true;
          _startTimeDisplay();
          if (onReady) onReady(e);
        },
        onStateChange: (e) => {
          if (e.data === 1) { _startTimeDisplay(); }
          else { _stopTimeDisplay(); _updateTimeDisplay(); }
        },
        onError: (e) => {
          console.warn('YT player error:', e.data);
        }
      }
    });
  };

  if (window.YT && window.YT.Player) {
    doInit();
  } else {
    // APIが未ロードなら読み込んでから初期化
    _loadYTApi();
    window._pendingYTInit = doInit;
  }
}

// 現在の再生位置（秒）を取得
function _getCurrentTime() {
  if (_gdVideoEl && !_gdVideoEl.error) {
    const t = _gdVideoEl.currentTime;
    return isNaN(t) ? null : Math.floor(t);
  }
  if (!_ytPlayer || !_ytPlayerReady) return null;
  try { return Math.floor(_ytPlayer.getCurrentTime()); } catch(e) { return null; }
}

// 指定秒数にシーク
function _seekTo(sec) {
  if (_gdVideoEl && !_gdVideoEl.error) {
    _gdVideoEl.currentTime = sec;
    return;
  }
  if (!_ytPlayer || !_ytPlayerReady) return;
  try { _ytPlayer.seekTo(sec, true); } catch(e) {}
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
  if (!_ytPlayer || !_ytPlayerReady) return;
  try {
    const cur = _ytPlayer.getCurrentTime?.() ?? 0;
    const dur = _ytPlayer.getDuration?.() ?? 0;
    if (dur > 0) {
      el.innerHTML = `${_formatTime(Math.floor(cur))}<span style="font-size:9px;color:var(--text3)"> / ${_formatTime(Math.floor(dur))}</span>`;
    }
  } catch(e) {}
}

// ── スキップボタンHTML ──
function _skipBtnsHTML() {
  const btns = [
    {sec:-60, label:'-1m'},
    {sec:-30, label:'-30s'},
    {sec:-10, label:'-10s'},
    {sec: -3, label:'-3s'},
    {sec:  3, label:'+3s'},
    {sec: 10, label:'+10s'},
    {sec: 30, label:'+30s'},
    {sec: 60, label:'+1m'},
  ];
  const btnStyle = 'flex:1;padding:3px 2px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:.3px;text-align:center';
  const sep = '<div style="width:2px;background:var(--border);height:20px;align-self:center;flex-shrink:0"></div>';
  const left  = btns.slice(0,4).map(b => `<button onclick="vpSkip(${b.sec})" style="${btnStyle}">${b.label}</button>`).join('');
  const right = btns.slice(4).map(b => `<button onclick="vpSkip(${b.sec})" style="${btnStyle}">${b.label}</button>`).join('');
  return `<div style="display:flex;gap:3px;padding:5px 10px;justify-content:center;align-items:center">${left}${sep}${right}</div>`;
}

export function vpSkip(sec) {
  const cur = _getCurrentTime();
  if (cur == null) { window.toast?.('動画を再生してからスキップしてください'); return; }
  _seekTo(Math.max(0, cur + sec));
}

// ── AB ループ ──
const _ab = { a: null, b: null, loop: false, timer: null, setMode: null }; // setMode: 'a'|'b'|null

function _abBtnStyle(active) {
  return `padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'var(--accent)' : 'var(--surface2)'};color:${active ? '#fff' : 'var(--text2)'};`;
}

function _abBtnStyleNew(isSet, isLoop) {
  if (isLoop) return 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border-radius:6px;border:1.5px solid var(--accent);background:rgba(var(--accent-rgb,200,131,26),.12);color:var(--accent);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
  if (isSet)  return 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border-radius:6px;border:1.5px solid var(--accent);background:var(--surface2);color:var(--accent);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
  return 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
}

function _loopBtnStyle() {
  const on = _ab.loop;
  return `width:28px;height:28px;border-radius:6px;border:1.5px solid var(--border);background:${on ? 'var(--text)' : 'var(--surface)'};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:all .12s`;
}

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
  const sectionBase = 'border-top:2px solid var(--border);border-bottom:2px solid var(--border);';

  // 折りたたみ状態
  const statusText = _ab.loop
    ? `<span onclick="vpAbToggleLoop()" style="font-size:10px;padding:1px 8px;border-radius:10px;background:#2e7bd6;color:#fff;font-weight:600;white-space:nowrap;cursor:pointer;" title="タップでループOFF">🔁 ON &nbsp;${aLabel} → ${bLabel} ✕</span>`
    : (hasA || hasB)
      ? `<span style="font-size:10px;color:var(--text3);">${aLabel} → ${bLabel}</span>`
      : `<span style="font-size:10px;color:var(--text3);">未設定</span>`;
  const expandLabel = isExpanded ? '∧ 閉じる' : (_ab.loop ? '編集 ∨' : '設定する ∨');

  // 時間が両方設定済みならON/OFFボタンを表示
  const canToggle = hasA && hasB;
  const toggleBtn = canToggle
    ? `<button onclick="vpAbToggleLoop()" style="font-size:10px;padding:2px 8px;border:1px solid ${_ab.loop ? '#2e7bd6' : 'var(--border)'};border-radius:12px;background:${_ab.loop ? '#2e7bd6' : 'var(--surface)'};color:${_ab.loop ? '#fff' : 'var(--text2)'};cursor:pointer;white-space:nowrap;flex-shrink:0;">${_ab.loop ? 'OFF' : 'ON'}</button>`
    : '';

  const collapsedRow = `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--surface2);">
    <span class="vp-lbl" style="display:flex;align-items:center;gap:5px;margin-bottom:0;">${loopIconSVG}ループ再生</span>
    ${statusText}
    ${toggleBtn}
    <button onclick="vpAbToggleExpand()" style="font-size:10px;padding:2px 10px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text2);cursor:pointer;white-space:nowrap;flex-shrink:0;">${expandLabel}</button>
  </div>`;

  if (!isExpanded) {
    return `<div id="vp-loop-section" style="${sectionBase}">${collapsedRow}</div>`;
  }

  // 展開状態
  const startStyle = hasA
    ? 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border:1.5px solid #2e7bd6;border-radius:6px;background:#fff;color:#2e7bd6;white-space:nowrap;flex-shrink:0;cursor:pointer;'
    : 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text2);white-space:nowrap;flex-shrink:0;cursor:pointer;';
  const endStyle = hasConflict
    ? 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border:1.5px solid #c84040;border-radius:6px;background:#fff;color:#c84040;white-space:nowrap;flex-shrink:0;cursor:pointer;'
    : hasB
      ? 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border:1.5px solid #2e7bd6;border-radius:6px;background:#fff;color:#2e7bd6;white-space:nowrap;flex-shrink:0;cursor:pointer;'
      : 'font-family:"DM Mono",monospace;font-size:13px;padding:3px 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text2);white-space:nowrap;flex-shrink:0;cursor:pointer;';
  const loopToggleStyle = `width:28px;height:26px;border-radius:6px;border:1.5px solid ${_ab.loop ? '#2e7bd6' : 'var(--border)'};background:${_ab.loop ? '#2e7bd6' : 'var(--surface)'};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;`;
  const loopToggleSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${_ab.loop ? '#fff' : 'var(--text)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

  // タブエディタ（開始/終了共通）
  const isStart = _abActiveField === 'start';
  const curVal = isStart ? (_ab.a ?? 0) : (_ab.b ?? _ab.a ?? 0);
  const tabStart = `<div onclick="vpAbSwitchField('start')" style="flex:1;text-align:center;font-size:11px;font-weight:${isStart?'600':'500'};padding:6px 4px;cursor:pointer;border-right:0.5px solid var(--border);${isStart?'background:#2e7bd6;color:#fff;':'color:var(--text2);background:var(--surface2);'}">▶ 開始</div>`;
  const tabEnd   = `<div onclick="vpAbSwitchField('end')" style="flex:1;text-align:center;font-size:11px;font-weight:${!isStart?'600':'500'};padding:6px 4px;cursor:pointer;${!isStart?'background:#2e7bd6;color:#fff;':'color:var(--text2);background:var(--surface2);'}">⏹ 終了</div>`;

  const adjBtns = [-10,-5,-3,-1,1,3,5,10].map(d =>
    `<button onclick="vpAbAdjField(${d})" style="font-size:10px;padding:3px 6px;border:0.5px solid var(--border);border-radius:5px;background:var(--surface);color:#2e7bd6;cursor:pointer;font-family:inherit;">${d>0?'+':''}${d}s</button>`
  ).join('');

  return `<div id="vp-loop-section" style="${sectionBase}">
    ${collapsedRow}
    <div style="padding:8px 12px 10px;background:var(--surface2);">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <button onclick="vpAbSwitchField('start')" style="${startStyle}">開始: ${aLabel}</button>
        <span style="font-size:10px;color:#2e7bd6;">↔</span>
        <button onclick="vpAbSwitchField('end')" style="${endStyle}">終了: ${bLabel}</button>
        <button onclick="vpAbToggleLoop()" style="${loopToggleStyle}" title="ループON/OFF">${loopToggleSVG}</button>
        <span style="flex:1;"></span>
        <button onclick="vpAbReset()" style="font-size:10px;color:var(--text3);background:transparent;border:none;cursor:pointer;">✕ クリア</button>
      </div>
      <div id="vp-ab-editor" style="border:1.5px solid #2e7bd6;border-radius:8px;overflow:hidden;background:var(--surface);">
        <div style="display:flex;border-bottom:0.5px solid var(--border);">${tabStart}${tabEnd}</div>
        <div style="padding:8px 10px;">
          <div id="vp-ab-time-disp" style="font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:var(--text);text-align:center;margin:2px 0 6px;">${_formatTime(Math.floor(curVal))}</div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:3px;"><span>0:00</span><span id="vp-ab-sl-dur">—</span></div>
          <input type="range" id="vp-ab-sl" min="0" max="600" value="${Math.floor(curVal)}" step="1"
            style="width:75%;height:4px;cursor:pointer;display:block;accent-color:#2e7bd6;outline:none;touch-action:none;margin-bottom:6px;">
          <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">
            <span style="font-size:9px;color:var(--text3);width:100%;margin-bottom:2px;">微調整</span>
            ${adjBtns}
            <button onclick="vpAbSetCurrentField()" style="font-size:10px;padding:3px 10px;border-radius:5px;border:none;background:#2e7bd6;color:#fff;font-weight:600;cursor:pointer;font-family:inherit;">現在地</button>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button onclick="vpAbSaveLoop()" style="font-size:11px;padding:5px 16px;border-radius:6px;border:none;background:#2e7bd6;color:#fff;font-weight:700;cursor:pointer;">✔ 保存</button>
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
  const abArea = document.getElementById('vpanel-ab-area');
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
    const abArea = document.getElementById('vpanel-ab-area');
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
  const abArea = document.getElementById('vpanel-ab-area');
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
      ? 'flex:1;text-align:center;font-size:11px;font-weight:600;padding:6px 4px;cursor:pointer;border-right:0.5px solid var(--border);background:var(--accent);color:#fff;'
      : 'flex:1;text-align:center;font-size:11px;font-weight:500;padding:6px 4px;cursor:pointer;border-right:0.5px solid var(--border);color:var(--text2);background:var(--surface2);';
    const tabStyleEnd = endActive
      ? 'flex:1;text-align:center;font-size:11px;font-weight:600;padding:6px 4px;cursor:pointer;background:var(--accent);color:#fff;'
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
            <button onclick="vpDeleteBm('${id}',${i})" style="${_adjBtnStyle('var(--surface2)','var(--danger,#c84040)')}">🗑 削除</button>
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
  inp.focus(); inp.select();
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
  const el = document.getElementById('vp-bm-list-' + id);
  if (el) {
    el.innerHTML = _bookmarkListHTML(id);
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
export function openVPanel(id) {
  const menu = document.getElementById('org-col-menu');
  if (menu) menu.remove();
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const emb  = card.dataset.emb;
  const ext  = card.dataset.ext;
  const plat = card.dataset.plat;
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;

  window.openVPanelId = id;
  v.lastPlayed = Date.now();
  v.playCount = (v.playCount || 0) + 1;
  window.debounceSave?.();
  const panel    = document.getElementById('vpanel');
  const editArea = document.getElementById('vpanel-edit-area');

  const autoplayEl = document.getElementById('setting-autoplay');
  const autoplay   = autoplayEl ? autoplayEl.checked : true;

  // iframeコンテナをリセット
  _gdVideoEl = null;
  const iframeContainer = document.getElementById('vpanel-iframe-container');
  if (iframeContainer) {
    iframeContainer.innerHTML = '<div id="vpanel-yt-player"></div>';
  }

  // タイトル+時間表示+✕ボタン（右端）を左カラム（動画の下）に表示
  const titleEl = document.getElementById('vpanel-title-area');
  if (titleEl) {
    titleEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px 5px 10px">
      <div style="flex:1;font-size:12px;font-weight:700;color:var(--text);line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${v.title}</div>
      <span id="vp-title-time" style="flex-shrink:0;font-size:10px;font-family:'DM Mono',monospace;color:var(--text3);white-space:nowrap"></span>
      <button onclick="closeVPanel()" style="flex-shrink:0;width:24px;height:24px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
    </div>`;
  }



  if (plat === 'yt') {
    const ytId = _extractYtId(emb);
    if (ytId) {
      _initYTPlayer('vpanel-yt-player', ytId, autoplay, () => {});
    }
  } else if (plat === 'gd') {
    // Google Drive: Drive APIで直接ストリーミング（<video>タグ）→ currentTime取得可能
    const fileIdMatch = emb.match(/\/d\/([^/]+)\//);
    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    if (iframeContainer && fileId) {
      _gdVideoEl = null;
      const cachedToken = window.getDriveTokenIfAvailable?.();
      if (cachedToken) {
        _playGDriveVideo(iframeContainer, fileId, cachedToken, autoplay);
      } else {
        _showGDriveAuthUI(iframeContainer, fileId, autoplay);
      }
    }
  } else {
    // Vimeo: 従来通りiframe
    if (iframeContainer) {
      const src = autoplay ? (emb.includes('?') ? emb + '&autoplay=1' : emb + '?autoplay=1') : emb;
      iframeContainer.innerHTML = `<iframe src="${src}" allowfullscreen allow="autoplay;encrypted-media" style="width:100%;height:100%;border:none"></iframe>`;
    }
  }

  // スキップボタンは動画の真下（左カラム）
  const skipArea = document.getElementById('vpanel-skip-area');
  if (skipArea) skipArea.innerHTML = _skipBtnsHTML();

  // ABバーは右カラムの一番上
  const abArea = document.getElementById('vpanel-ab-area');
  if (abArea) abArea.innerHTML = _abBarHTML();

  // ブックマークセクション
  const bmContainer = document.getElementById('vpanel-bm-area');
  if (bmContainer) {
    const vid = window.openVPanelId || id;
    const vd = (window.videos||[]).find(vx => vx.id === vid);
    bmContainer.innerHTML = _bookmarkSectionHTML(vid)
      + `<div class="vp-row" style="margin-top:8px">
          <span class="vp-lbl">Memo</span>
          <textarea class="vp-memo" id="vp-memo-${vid}" placeholder="" onblur="vpSaveMemo('${vid}')">${vd?.memo||''}</textarea>
        </div>`;
  }

  editArea.innerHTML = buildDrawerHTML(id);
  _bindDrawerEvents(editArea, id);

  // blur-area: 次の動画リスト（現在の動画の前1件＋以降）
  _renderBlurArea(id);

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.querySelector('.main-area')?.classList.add('vpanel-main-blur');

  window.scrollTo(0, 1);
  setTimeout(() => _vpUpdateOrientation(), 80);
}

// ── blur-area: 次の動画リスト ──
function _renderBlurArea(id) {
  const area = document.getElementById('vpanel-blur-area');
  if (!area) return;

  // フィルター済み配列を優先、なければ全件
  const all = window.filteredVideos || window.videos || [];
  const idx = all.findIndex(v => v.id === id);
  if (idx < 0) { area.innerHTML = ''; return; }

  // 現在の動画を除く全件（表示順のまま）
  const candidates = all.filter((_, i) => i !== idx);

  if (candidates.length === 0) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div style="padding:7px 10px 3px;font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--text3);text-transform:uppercase">次の動画</div>
    ${candidates.map((rv) => {
      const ytId = _extractYtId(rv.emb || '');
      const thumb = rv.thumb || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '');
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

export function closeVPanel() {
  try {
    _ab.loop = false; clearInterval(_ab.timer); _ab.timer = null; _ab.a = null; _ab.b = null;
    _stopTimeDisplay();
    if (window.openVPanelId) {
      try { vpSave(window.openVPanelId); } catch(e) {}
    }
    if (_ytPlayer && _ytPlayerReady) {
      try { _ytPlayer.stopVideo(); } catch(e) {}
    }
    const iframeContainer = document.getElementById('vpanel-iframe-container');
    if (iframeContainer) iframeContainer.innerHTML = '<div id="vpanel-yt-player"></div>';
    const panel = document.getElementById('vpanel');
    if (panel) panel.classList.remove('open');
    const inner = document.getElementById('vpanelInner');
    if (inner) inner.classList.remove('is-portrait');
    document.body.style.overflow = '';
    window.openVPanelId = null;
    document.querySelector('.main-area')?.classList.remove('vpanel-main-blur');
  } catch(e) {
    console.error('closeVPanel error:', e);
    const panel = document.getElementById('vpanel');
    if (panel) panel.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function _vpUpdateOrientation() {
  const inner = document.getElementById('vpanelInner');
  if (!inner) return;
  inner.classList.toggle('is-portrait', window.innerHeight > window.innerWidth);
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

// ── Google Drive 再生ヘルパー ──
function _playGDriveVideo(container, fileId, token, autoplay) {
  const src = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${token}`;
  container.innerHTML = `<video controls playsinline ${autoplay ? 'autoplay' : ''}
    style="width:100%;height:100%;background:#000"></video>`;
  _gdVideoEl = container.querySelector('video');
  _gdVideoEl.src = src;
  _gdVideoEl.addEventListener('error', () => window._onGDriveVideoError(_gdVideoEl, fileId));
}

function _showGDriveAuthUI(container, fileId, autoplay) {
  container.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000;padding:20px;box-sizing:border-box">
    <div style="color:#aaa;font-size:12px;text-align:center;line-height:1.6">Googleドライブの動画を再生するには認証が必要です</div>
    <button id="gd-auth-play-btn" style="padding:10px 24px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">
      Googleで認証して再生
    </button>
    <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank"
       style="color:#888;font-size:11px;text-decoration:underline;cursor:pointer">Driveで開く</a>
  </div>`;
  const btn = container.querySelector('#gd-auth-play-btn');
  if (btn) btn.onclick = async () => {
    btn.textContent = '認証中...';
    btn.disabled = true;
    const token = await window.ensureDriveToken?.();
    if (token) {
      _playGDriveVideo(container, fileId, token, autoplay);
    } else {
      btn.textContent = '認証に失敗しました。再試行';
      btn.disabled = false;
    }
  };
}

window._onGDriveVideoError = function(videoEl, fileId) {
  const container = videoEl.parentElement;
  if (!container) return;
  console.error('GDrive video error:', videoEl.error?.code, videoEl.error?.message, videoEl.src?.slice(0, 80));
  // トークンをクリアして再認証UIを表示（consent強制でスコープを確実に付与）
  window.clearDriveToken?.();
  container.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000;padding:20px;box-sizing:border-box">
    <div style="color:#f66;font-size:13px;text-align:center">再生に失敗しました</div>
    <div style="color:#888;font-size:11px;text-align:center;line-height:1.6">認証の有効期限が切れているか、ファイルへのアクセス権がない可能性があります</div>
    <button id="gd-retry-btn" style="padding:10px 24px;background:#1a73e8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">再認証して再生</button>
    <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank"
       style="color:#888;font-size:11px;text-decoration:underline">Driveで開く</a>
  </div>`;
  const btn = container.querySelector('#gd-retry-btn');
  if (btn) btn.onclick = async () => {
    btn.textContent = '認証中...'; btn.disabled = true;
    // initDriveAuth(true)でconsentを強制 → drive.readonlyスコープを確実に付与
    const ok = await window.initDriveAuth?.(true);
    const token = ok ? window.getDriveTokenIfAvailable?.() : null;
    if (token) { _playGDriveVideo(container, fileId, token, false); }
    else { btn.textContent = '認証に失敗しました。再試行'; btn.disabled = false; }
  };
};

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
  container.querySelectorAll('.vp-tech-rm').forEach(el => { el.onclick = function() { vpRemoveTechEl(this); }; });
  container.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function() { vpRemovePosEl(this);  }; });
}

export function buildDrawerHTML(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return '';

  const prioChips = [
    {v:'今すぐ',  l:'🔴 今すぐ',  c:'on-p1'},
    {v:'そのうち',l:'🟡 そのうち',c:'on-p2'},
    {v:'保留',    l:'⚪ 保留',    c:'on-p3'}
  ].map(o => `<span class="vp-chip${v.prio===o.v?' '+o.c:''}" onclick="vpSet('${id}','prio','${o.v}',this,'${o.c}')">${o.l}</span>`).join('');

  const progChips = [
    {v:'未着手',  l:'📋 未着手',  c:'on-s0'},
    {v:'練習中',  l:'🔵 練習中',  c:'on-s1'},
    {v:'マスター',l:'✅ マスター',c:'on-s2'}
  ].map(o => `<span class="vp-chip${v.status===o.v?' '+o.c:''}" onclick="vpSet('${id}','status','${o.v}',this,'${o.c}')">${o.l}</span>`).join('');

  const tbChips   = (v.tb||[]).map(t  => `<span class="vp-chip on-tb"   onclick="vpRemoveTag('${id}','tb','${t.replace(/'/g,"\\'")}',this)">${t} ×</span>`).join('');
  const acChips   = (v.ac||[]).map(a  => `<span class="vp-chip on-ac"   onclick="vpRemoveTag('${id}','ac','${a.replace(/'/g,"\\'")}',this)">${a} ×</span>`).join('');
  const posChips  = (v.pos||[]).map(p => `<span class="vp-chip on-pos"  onclick="vpRemoveTag('${id}','pos','${p.replace(/'/g,"\\'")}',this)">${p} ×</span>`).join('');
  const techChips = (v.tech||[]).map(t=> `<span class="vp-chip on-tech" onclick="vpRemoveTag('${id}','tech','${t.replace(/'/g,"\\'")}',this)">${t} ×</span>`).join('');

  return `
    <div class="vp-row">
      <span class="vp-lbl">Status</span>
      <div class="vp-chips">
        <span class="vp-chip${v.watched?' on-s1':''}" id="vp-watch-${id}" onclick="vpTogWatch('${id}',this)">${v.watched?'✅ 視聴済み':'👁 未視聴'}</span>
        <span class="vp-chip${v.fav?' on-fav-chip':''}" id="vp-fav-${id}" onclick="vpTogFav('${id}',this)">${v.fav?'⭐ Fav':'☆ Fav'}</span>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Progress</span>
      <div class="vp-chips" id="vp-prog-${id}">${progChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Priority</span>
      <div class="vp-chips" id="vp-prio-${id}">${prioChips}</div>
    </div>
    <div class="vp-row vp-row-tb">
      <span class="vp-lbl">${(window.tagSettings||[]).find(t=>t.key==='tb')?.label||'TOP/BOTTOM'}</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-tb-${id}">${tbChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','tb')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-tb-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','tb',this.value)" onkeydown="vpDdKey('${id}','tb',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-tb-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row vp-row-ac">
      <span class="vp-lbl">${(window.tagSettings||[]).find(t=>t.key==='ac')?.label||'Action'}</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-ac-${id}">${acChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','ac')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-ac-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','ac',this.value)" onkeydown="vpDdKey('${id}','ac',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-ac-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row vp-row-pos">
      <span class="vp-lbl">${(window.tagSettings||[]).find(t=>t.key==='pos')?.label||'Position'}</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-pos-${id}">${posChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','pos')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-pos-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','pos',this.value)" onkeydown="vpDdKey('${id}','pos',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-pos-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row vp-row-tech">
      <span class="vp-lbl">${(window.tagSettings||[]).find(t=>t.key==='tech')?.label||'Technique'}</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-tech-${id}">${techChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','tech')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-tech-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','tech',this.value)" onkeydown="vpDdKey('${id}','tech',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-tech-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Playlist</span>
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="vp-chip on-pl" id="vp-pl-badge-${id}" style="background:var(--surface2);border-color:var(--border);color:var(--text)">${v.pl||'未分類'}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','move')">↪ 移動</button>
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','copy')">⧉ コピー</button>
          <button class="vp-pl-btn vp-pl-btn-del" onclick="vpRemoveFromPl('${id}')">✕ 削除</button>
        </div>
      </div>
    </div>

    <div class="vp-row">
      <span class="vp-lbl">Share</span>
      <div class="vp-chips" id="vp-share-${id}">
        <span class="vp-chip${(v.shared||0)===0?' on-s0':''}" onclick="vpSetShare('${id}',0,this)">🔒 非公開</span>
        <span class="vp-chip${(v.shared||0)===1?' on-s1':''}" onclick="vpSetShare('${id}',1,this)">👥 フォロワー</span>
        <span class="vp-chip${(v.shared||0)===2?' on-s0':''}" onclick="vpSetShare('${id}',2,this)">🌐 全公開</span>
      </div>
    </div>
    <div style="padding:8px 16px 4px">
      <button id="vp-ai-tag-btn"
        onclick="window.onAiTagBtn?.('${id}')"
        style="width:100%;padding:10px;border-radius:10px;border:1.5px dashed var(--accent);
               background:var(--surface2);color:var(--accent);font-size:13px;
               font-weight:700;cursor:pointer;letter-spacing:.3px">
        🤖 AIタグ提案
      </button>
    </div>
    <div id="vp-autosave-${id}" style="text-align:center;font-size:10px;color:var(--text3);opacity:0;transition:opacity .3s;padding:4px 0 8px;letter-spacing:.5px;">✓ 自動保存済み</div>
  `;
}

// ── VP edit functions ──
export function vpSet(id, field, val, el, cls) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v[field] = val;
  el.parentElement.querySelectorAll('.vp-chip').forEach(c => {
    c.classList.remove('on-p1','on-p2','on-p3','on-s0','on-s1','on-s2');
  });
  el.classList.add(cls);
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
  if ((v.tech||[]).includes(val)) return;
  v.tech = [...(v.tech||[]), val];
  const container = document.getElementById('vp-tech-' + id);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'vp-chip on-tech vp-tech-rm';
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
const VP_TAG_OPTS = {
  tb:   ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'],
  ac:   ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル'],
  pos:  ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'],
  tech: []
};
const VP_FIELD_MAP = { tb:'tb', ac:'ac', pos:'pos', tech:'tech' };

export function vpGetAllOpts(type) {
  const base = VP_TAG_OPTS[type] || [];
  if (type === 'tech') return [...new Set([...base, ...(window.videos||[]).flatMap(v => v.tech||[])])].sort();
  if (type === 'pos')  return [...new Set([...base, ...(window.videos||[]).flatMap(v => v.pos||[])])].sort();
  return base;
}

export function vpTogDd(id, type) {
  document.querySelectorAll('.vp-dd').forEach(d => {
    if (!d.id.includes('-'+type+'-') || !d.id.includes(id)) d.style.display = 'none';
  });
  const dd = document.getElementById('vp-dd-'+type+'-'+id);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
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

export function vpRefreshChips(id, type) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field  = VP_FIELD_MAP[type];
  const clsMap = { tb:'on-tb', ac:'on-ac', pos:'on-pos', tech:'on-tech' };
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
  if (!e.target.closest('.vp-dd-wrap')) {
    // 開いているddを探してチップ更新してから閉じる
    document.querySelectorAll('.vp-dd').forEach(d => {
      if (d.style.display !== 'none') {
        // id="vp-dd-{type}-{videoId}" からtype/idを取得
        const m = d.id.match(/^vp-dd-(\w+)-(.+)$/);
        if (m) vpRefreshChips(m[2], m[1]);
        d.style.display = 'none';
      }
    });
  }
});

export function vpRemoveTechEl(el) {
  const id  = el.dataset.id;
  const val = el.dataset.val;
  const v   = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.tech = (v.tech||[]).filter(t => t!==val);
  el.remove();
  autoSaveVp(id);
}

export function vpTogWatch(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.watched = !v.watched;
  el.className = 'vp-chip' + (v.watched ? ' on-s1' : '');
  el.textContent = v.watched ? '✅ 視聴済み' : '👁 未視聴';
  autoSaveVp(id);
}

export function vpTogFav(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.fav = !v.fav;
  el.className = 'vp-chip' + (v.fav ? ' on-fav-chip' : '');
  el.textContent = v.fav ? '⭐ Fav' : '☆ Fav';
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

export function vpSaveMemo(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const memo = document.getElementById('vp-memo-' + id);
  if (memo) v.memo = memo.value.trim();
  autoSaveVp(id);
}

export function autoSaveVp(id) {
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
  const memo = document.getElementById('vp-memo-' + id);
  if (memo) v.memo = memo.value.trim();
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
  let panel = document.getElementById('vp-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'vp-panel';
    panel.className = 'vp-panel';
    document.body.appendChild(panel);
  }

  const autoplayEl = document.getElementById('setting-autoplay');
  const autoplay = autoplayEl ? autoplayEl.checked : true;

  panel.innerHTML = `
    <div class="vp-panel-resizer" id="vpResizer"></div>
    <div class="vp-panel-video">
      <div id="vp-panel-yt-player" style="width:100%;height:100%"></div>
    </div>
    ${_skipBtnsHTML().replace('class="vp-skip-row"', 'class="vp-skip-row" style="display:flex;gap:5px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--border)"')}
    ${_abBarHTML()}
    <div class="vp-panel-header">
      <div class="vp-panel-title">${v.title}</div>
      <div class="vp-panel-close" onclick="closePanel()">✕</div>
    </div>
    <div class="vp-panel-body">

      ${_bookmarkSectionHTML(id)}
      ${buildDrawerHTML(id)}
    </div>
  `;

  panel.classList.add('show');
  const ma = document.querySelector('.main-area');
  if (ma) { ma.classList.add('panel-open'); ma.style.marginRight = panel.offsetWidth + 'px'; }
  if (window.openPlayer) _closePlayer(window.openPlayer);
  window.openPlayer = id;

  // YT.Player初期化（PC用）
  if (plat === 'yt') {
    const ytId = _extractYtId(emb);
    if (ytId) {
      _initYTPlayer('vp-panel-yt-player', ytId, autoplay, () => {});
    }
  } else if (plat === 'gd') {
    // Google Drive: Drive APIで直接ストリーミング（<video>タグ）→ currentTime取得可能
    const fileIdMatch = emb.match(/\/d\/([^/]+)\//);
    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    const playerDiv = document.getElementById('vp-panel-yt-player');
    if (playerDiv && fileId) {
      _gdVideoEl = null;
      const cachedToken = window.getDriveTokenIfAvailable?.();
      if (cachedToken) {
        _playGDriveVideo(playerDiv, fileId, cachedToken, autoplay);
      } else {
        _showGDriveAuthUI(playerDiv, fileId, autoplay);
      }
    }
  } else {
    // Vimeo
    const src = autoplay ? (emb.includes('?') ? emb + '&autoplay=1' : emb + '?autoplay=1') : emb;
    const playerDiv = document.getElementById('vp-panel-yt-player');
    if (playerDiv) playerDiv.innerHTML = `<iframe src="${src}" allowfullscreen allow="autoplay;encrypted-media" style="width:100%;height:100%;border:none"></iframe>`;
  }

  _initPanelResizer(panel);
  panel.onclick = function(e) { e.stopPropagation(); };
  setTimeout(function() { document.addEventListener('click', _closePanelOutside); }, 0);
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
    const panel = document.getElementById('vp-panel');
    if (panel) { panel.classList.remove('show'); }
    const ma2 = document.querySelector('.main-area');
    if (ma2) { ma2.classList.remove('panel-open'); ma2.style.marginRight = ''; }
    window.openPlayer = null;
    panelId = null;
  } catch(e) { console.warn('closePanel error:', e); }
}

export function initVpanelState() {
  Object.defineProperty(window, 'openVPanelId', {
    get: () => _openVPanelId,
    set: v  => { _openVPanelId = v; },
    configurable: true
  });
}
let _openVPanelId = null;
