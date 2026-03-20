// ═══ WAZA KIMURA — 動画パネル（VPanel） v47.72 ═══
// YouTube iFrame Player API対応版
// モバイル用(#vpanel)・PC用(#vp-panel)両対応

// ── YT.Player管理 ──
let _ytPlayer = null;       // 現在アクティブなYT.Playerインスタンス
let _ytPlayerReady = false; // プレイヤーが操作可能な状態か
let _ytApiLoaded = false;   // YouTube iFrame API読み込み済みか

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
  if (!_ytPlayer || !_ytPlayerReady) return null;
  try { return Math.floor(_ytPlayer.getCurrentTime()); } catch(e) { return null; }
}

// 指定秒数にシーク
function _seekTo(sec) {
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
  if (isLoop) return 'font-family:"DM Mono",monospace;font-size:11px;padding:4px 8px;border-radius:6px;border:1.5px solid var(--accent);background:rgba(var(--accent-rgb,200,131,26),.12);color:var(--accent);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
  if (isSet)  return 'font-family:"DM Mono",monospace;font-size:11px;padding:4px 8px;border-radius:6px;border:1.5px solid var(--accent);background:var(--surface2);color:var(--accent);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
  return 'font-family:"DM Mono",monospace;font-size:11px;padding:4px 8px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s';
}

function _loopBtnStyle() {
  const on = _ab.loop;
  return `width:28px;height:28px;border-radius:6px;border:1.5px solid var(--border);background:${on ? 'var(--text)' : 'var(--surface)'};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:all .12s`;
}

function _loopSVG() {
  const col = _ab.loop ? '#fff' : 'var(--text)';
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
}

function _abBarHTML() {
  const aLabel = _ab.a != null ? _formatTime(Math.floor(_ab.a)) : '--:--';
  const bLabel = _ab.b != null ? _formatTime(Math.floor(_ab.b)) : '--:--';
  const hasConflict = _ab.a != null && _ab.b != null && _ab.a >= _ab.b;
  const btnBase = 'padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;';
  const btnA = _ab.a != null
    ? btnBase + 'border:1.5px solid var(--accent);background:var(--surface2);color:var(--accent);'
    : btnBase + 'border:1px solid var(--border);background:var(--surface2);color:var(--text2);';
  const btnB = _ab.b != null
    ? btnBase + (hasConflict ? 'border:1.5px solid var(--danger,#c84040);background:var(--surface2);color:var(--danger,#c84040);' : 'border:1.5px solid var(--accent);background:var(--surface2);color:var(--accent);')
    : btnBase + 'border:1px solid var(--border);background:var(--surface2);color:var(--text2);';
  const loopBtn = `padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;border:1px solid ${_ab.loop ? 'var(--accent)' : 'var(--border)'};background:${_ab.loop ? 'var(--accent)' : 'var(--surface2)'};color:${_ab.loop ? '#fff' : 'var(--text2)'};`;
  return `<div id="vp-ab-bar" style="display:flex;gap:5px;padding:5px 10px;align-items:center;border-top:1px solid var(--border2)">
    <button id="vp-ab-btn-a" onclick="vpAbOpenPanel('a')" style="${btnA}">A: ${aLabel}</button>
    <span style="font-size:9px;color:var(--text3);flex-shrink:0">↔</span>
    <button id="vp-ab-btn-b" onclick="vpAbOpenPanel('b')" style="${btnB}">B: ${bLabel}</button>
    <span style="flex:1"></span>
    <button onclick="vpAbToggleLoop()" style="${loopBtn}" title="ABループ">${_loopSVG()}</button>
    <button onclick="vpAbAddBm()" style="${btnBase}border:1px solid var(--border);background:var(--surface2);color:var(--text2);" title="ブックマークに追加">＋ブックマーク</button>
    <button onclick="vpAbReset()" style="${btnBase}border:1px solid var(--border);background:transparent;color:var(--text3);">✕</button>
  </div>
  <div id="vp-ab-quick-panel" style="display:none"></div>
  <div id="vp-ab-add-bm-row" style="display:none;padding:5px 10px 7px;border-top:1px solid var(--border2);background:var(--surface2)">
    <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">
      <input id="vp-ab-bm-label" type="text" placeholder="ブックマーク名（空欄でも可）" style="flex:1;font-size:11px;padding:4px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;outline:none;min-width:0">
    </div>
    <div style="display:flex;gap:5px;align-items:center">
      <input id="vp-ab-bm-note" type="text" placeholder="コメント（空欄でも可）" style="flex:1;font-size:11px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;outline:none;min-width:0">
      <button onclick="vpAbConfirmAddBm()" style="font-size:10px;padding:4px 10px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">追加</button>
      <button onclick="vpAbCancelAddBm()" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-family:inherit;flex-shrink:0">✕</button>
    </div>
  </div>`;
}

function _abRefresh(id) {
  // ABバーを再描画
  const html = _abBarHTML();
  const abArea = document.getElementById('vpanel-ab-area');
  if (abArea) abArea.innerHTML = html;
  // クイックパネルが開いていれば再バインド
  if (_ab.setMode) _abOpenQuickPanel(_ab.setMode, id);
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

function _abOpenQuickPanel(pt, videoId) {
  const panelId = 'vp-ab-quick-panel';
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const val = _ab[pt];
  const hasV = val != null;
  const color = pt === 'a' ? 'var(--accent)' : 'var(--accent)';
  const label = pt === 'a' ? 'A 点を設定' : 'B 点を設定';
  const initVal = hasV ? val : (_getCurrentTime() ?? 0);
  const TOTAL = 600; // 仮の総秒数（実際はプレイヤーから取得）

  panel.style.display = 'block';
  panel.innerHTML = `<div style="padding:8px 10px 10px;background:var(--surface2);border-top:1px solid var(--border2)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
      <span style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent)">${label}</span>
      <button onclick="vpAbClosePanel()" style="font-size:11px;background:none;border:none;cursor:pointer;color:var(--text3);padding:0 2px">✕</button>
    </div>
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:4px">
        <span>0:00</span><span id="vp-aqp-dur">合計</span>
      </div>
      <input type="range" id="vp-aqp-sl" min="0" max="${TOTAL}" value="${initVal}" step="1"
        style="width:100%;height:4px;cursor:pointer;display:block;accent-color:var(--accent);outline:none;touch-action:none">
    </div>
    <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <span style="font-size:9px;color:var(--text3);font-family:inherit;width:100%;margin-bottom:2px">微調整</span>
      ${[-10,-5,-3,-1,1,3,5,10].map(d => `<button onclick="vpAbQpAdj(${d})" style="font-size:10px;padding:3px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--accent);cursor:pointer;font-family:inherit">${d>0?'+':''}${d}s</button>`).join('')}
      <button onclick="vpAbQpSetCurrent()" style="font-size:10px;padding:3px 8px;border-radius:5px;border:none;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;font-family:inherit">現在地</button>
    </div>
    <div style="display:flex;gap:6px;justify-content:space-between">
      <button onclick="vpAbQpClear()" style="font-size:10px;padding:4px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-family:inherit;${hasV?'':'display:none'}">クリア</button>
      <button onclick="vpAbQpSet()" style="font-size:10px;padding:4px 12px;border-radius:5px;border:none;background:var(--text);color:#fff;font-weight:700;cursor:pointer;font-family:inherit;margin-left:auto">✔ セット</button>
    </div>
  </div>`;

  // スライダーバインド（touch-action:noneで確実に動作）
  const sl = panel.querySelector('#vp-aqp-sl');
  if (!sl) return;

  // 総秒数を取得してmaxをセット
  try {
    const dur = _ytPlayer?.getDuration?.();
    if (dur && dur > 0) {
      sl.max = Math.floor(dur);
      const durEl = panel.querySelector('#vp-aqp-dur');
      if (durEl) durEl.textContent = _formatTime(Math.floor(dur));
    }
  } catch(e) {}

  window._vpAbQpVal = initVal;
  window._vpAbQpPt  = pt;
  window._vpAbQpVid = videoId;

  function updateQpVal(v) {
    window._vpAbQpVal = Math.max(0, Math.min(parseInt(sl.max)||600, v));
    sl.value = window._vpAbQpVal;
    // ABバーのボタンテキストをリアルタイム更新
    const btn = document.getElementById(pt === 'a' ? 'vp-ab-btn-a' : 'vp-ab-btn-b');
    if (btn) btn.textContent = (pt === 'a' ? 'A: ' : 'B: ') + _formatTime(window._vpAbQpVal);
  }

  sl.addEventListener('input', () => updateQpVal(parseInt(sl.value)));
  sl.addEventListener('change', () => updateQpVal(parseInt(sl.value)));
  updateQpVal(initVal);
}

export function vpAbClosePanel() {
  _ab.setMode = null;
  _abCloseQuickPanel();
  _abRefresh();
}

export function vpAbQpAdj(delta) {
  if (window._vpAbQpVal == null) return;
  const sl = document.getElementById('vp-aqp-sl');
  const max = sl ? parseInt(sl.max)||600 : 600;
  window._vpAbQpVal = Math.max(0, Math.min(max, (window._vpAbQpVal||0) + delta));
  if (sl) sl.value = window._vpAbQpVal;
  const pt = window._vpAbQpPt;
  const btn = document.getElementById(pt === 'a' ? 'vp-ab-btn-a' : 'vp-ab-btn-b');
  if (btn) btn.textContent = (pt === 'a' ? 'A: ' : 'B: ') + _formatTime(window._vpAbQpVal);
}

export function vpAbQpSetCurrent() {
  const cur = _getCurrentTime();
  if (cur == null) return;
  window._vpAbQpVal = cur;
  const sl = document.getElementById('vp-aqp-sl');
  if (sl) sl.value = cur;
  const pt = window._vpAbQpPt;
  const btn = document.getElementById(pt === 'a' ? 'vp-ab-btn-a' : 'vp-ab-btn-b');
  if (btn) btn.textContent = (pt === 'a' ? 'A: ' : 'B: ') + _formatTime(cur);
}

export function vpAbQpSet() {
  const pt = window._vpAbQpPt;
  const val = window._vpAbQpVal;
  if (pt && val != null) _ab[pt] = val;
  _ab.setMode = null;
  _abCloseQuickPanel();
  _abRefresh();
}

export function vpAbQpClear() {
  const pt = window._vpAbQpPt;
  if (pt) _ab[pt] = null;
  _ab.setMode = null;
  _abCloseQuickPanel();
  _abRefresh();
}

export function vpAbToggleLoop() {
  if (_ab.a == null || _ab.b == null) { window.toast?.('A点とB点を両方設定してください'); return; }
  if (_ab.a >= _ab.b) { window.toast?.('⚠ A点がB点より後になっています'); return; }
  _ab.loop = !_ab.loop;
  if (_ab.loop) {
    _seekTo(_ab.a);
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
  _abCloseQuickPanel();
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

    const editorHTML = isExpanded ? `
      <div style="padding:8px 0 2px">
        <div style="display:flex;gap:5px;align-items:center;margin-bottom:5px">
          <input id="vp-bm-lbl-${id}-${i}" type="text" value="${(bm.label||'').replace(/"/g,'&quot;')}" placeholder="ブックマーク名（空欄でも可）"
            style="flex:1;font-size:11px;padding:4px 8px;border:1.5px solid var(--accent);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;outline:none;min-width:0">
        </div>

        <div style="display:flex;gap:5px;a