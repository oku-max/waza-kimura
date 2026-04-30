// ═══ WAZA KIMURA — オンボーディングツアー ═══
const OB_KEY        = 'wk_ob_done';
const HINT_KEY      = 'wk_hint_ts';
const HINT_INTERVAL = 3 * 60 * 60 * 1000; // 3時間
const PAD           = 10;

// ── Library ツアー ──
const LIBRARY_STEPS = [
  {
    target: '#auth-btn',
    title:  'まずGoogleでログインする',
    body:   '<b>ログインは最初に必ずやること。</b><br>ログインしないとデータがブラウザ内にしか保存されず、タブを閉じると消えてしまいます。右上の「Googleでログイン」をタップしてください。',
  },
  {
    target: '#yt-import-btn',
    title:  '動画を追加する',
    body:   '右上の <b>「＋ 動画を追加」</b> から動画をインポートできます。<br><br>📺 <b>YouTube</b>（プレイリスト一括対応）<br>🎬 <b>Vimeo</b><br>💾 <b>Google Drive</b>',
  },
  {
    targets: ['#lvt-card', '#lvt-org'],
    title:   '表示を切り替える',
    body:    '<b>📋 カードビュー</b>：サムネイル付きでざっと眺めるのに最適。<br><br><b>📊 テーブルビュー</b>：習得度・タグ・メモを一覧で管理したいときに。',
  },
  {
    target:     '#filterSidebar',
    target2:    '#filter-toggle-btn',
    beforeStep: () => window.closeFilterOverlay?.(),
    title:      'フィルターとタグで絞り込む',
    body:       'この左サイドバーからチャンネル・プレイリスト・タグ・習得度など複数条件で絞り込めます。<br><br>タグは自分で自由に作成・編集できます。',
  },
  {
    target:        '.card',
    target_empty:  '#yt-import-btn',
    body_empty:    'まず <b>「＋ 動画を追加」</b> から動画を取り込んでください。<br><br>取り込んだ後、カードをクリックすると <b>Vパネル</b> が開いて再生できます。タイムスタンプのコピーや連続再生にも対応しています。',
    title:         '動画を再生する（Vパネル）',
    body:          '動画カードをクリックすると <b>Vパネル</b> が開いて再生できます。<br><br>タイムスタンプのコピーや、プレイリスト内の連続再生にも対応しています。',
  },
  {
    target:  '#tnav-notes',
    target2: '#mnav-notes',
    title:   'Notesで練習メモをとる',
    body:    '<b>「≡ Notes」タブ</b>では自由にテキストメモを書けます。<br><br>道場でのメモや練習の気づきをざっくり書き留める場所として使ってください。',
  },
  {
    target:  '#tnav-search',
    target2: '#mnav-search',
    title:   'SearchでさらにYouTube動画を探す',
    body:    '<b>「○ Search」タブ</b>では YouTube の動画をキーワードで検索し、気になった動画をそのままライブラリに追加できます。',
  },
  {
    targets: ['#fb-tab-btn', '#ob-help-btn'],
    title:   'お困りのときは右上へ',
    body:    '<b>「?」ボタン</b>：操作でお困りのときはこのボタンからいつでもツアーを再表示できます。<br><br><b>「フィードバック」ボタン</b>：ご意見・ご質問・改善のアイデアがあればお気軽にどうぞ。テスト期間中、皆さんのフィードバックがとても参考になります。',
  },
];

// ── Search ツアー ──
const SEARCH_STEPS = [
  {
    target: '#yt-sr-input',
    title:  'YouTubeで柔術動画を検索',
    body:   'キーワードを入力して <b>YouTube の動画を直接検索</b>できます。<br><br>気に入った動画は「＋ ライブラリに追加」ボタンでそのまま保存できます。',
  },
  {
    targets: ['#yt-sr-tab-video', '#yt-sr-tab-playlist'],
    title:   '動画 or プレイリストで取り込む',
    body:    '<b>動画</b>：1本ずつ選んで追加。<br><br><b>プレイリスト</b>：チャンネルのシリーズをまとめて一括取り込み。体系的に学びたいときに便利です。',
  },
];

// ── Notes ツアー ──
const NOTES_STEPS = [
  {
    title: 'Notesで練習を記録する',
    body:  'Notesでは、<b>テキスト・動画・画像</b>を自由に組み合わせた練習ノートを作れます。<br><br>道場でのメモ、技の研究、スパーの振り返りなど、何でも一か所に書き留めておけます。',
    visual: `<div class="vis-overview"><div class="vis-ov-sb"><div class="vis-ov-sb-hdr"></div><div class="vis-ov-sb-item on"></div><div class="vis-ov-sb-item"></div><div class="vis-ov-sb-item"></div></div><div class="vis-ov-main"><div class="vis-ov-title"></div><div class="vis-ov-text" style="width:90%"></div><div class="vis-ov-text" style="width:75%"></div><div class="vis-ov-video"><div class="vis-ov-play">▶</div><div class="vis-ov-vtitle"></div></div><div class="vis-ov-img">🖼</div></div></div>`,
  },
  {
    title: 'テキストで自由にメモ',
    body:  '気づいたことをそのまま書き留めておけます。<br><br><b>見出し・箇条書き・太字</b>などリッチテキストで整理することもできます。',
    visual: `<div class="vis-text"><div class="vis-text-h"></div><div class="vis-text-line" style="width:95%"></div><div class="vis-text-line" style="width:80%"></div><div style="height:8px"></div><div class="vis-text-bullet"><div class="vis-text-dot"></div><div class="vis-text-bline" style="width:70%"></div></div><div class="vis-text-bullet"><div class="vis-text-dot"></div><div class="vis-text-bline" style="width:55%"></div></div><div class="vis-text-bullet"><div class="vis-text-dot"></div><div class="vis-text-bline" style="width:80%"></div></div><div style="height:4px"></div><div style="height:8px;background:var(--surface3,#333);border-radius:3px;width:45%;display:inline-block"></div><span class="vis-text-cursor"></span></div>`,
  },
  {
    title: '動画を挿入してメモ',
    body:  '<b>ライブラリに保存済みの動画</b>をそのままノートに埋め込めます。YouTube URLを貼り付けて追加することも可能。<br><br>動画を見ながら気づいたことをその場でメモできます。',
    visual: `<div class="vis-video-wrap"><div class="vis-player"><div class="vis-play-btn"><div class="vis-play-icon"></div></div></div><div class="vis-src-row"><div class="vis-src-chip lib">📚 ライブラリから</div><div class="vis-src-chip yt">▶ YouTube URL</div></div></div>`,
  },
  {
    title: '画像も一緒に保存',
    body:  '写真や図をノートに貼り付けて保存できます。<br><br>スクリーンショットや道場でのメモ写真をそのまま貼り付けるだけでOKです。',
    visual: `<div class="vis-image"><div class="vis-img-card" style="width:130px;height:100px;background:linear-gradient(135deg,#2a3a2a,#1a4a2a);font-size:28px">🥋</div><div class="vis-img-card" style="width:80px;height:60px;background:linear-gradient(135deg,#2a2a3a,#1a2a4a);font-size:20px">📸</div><div class="vis-img-paste">画像をペーストまたはドロップ</div></div>`,
  },
  {
    title: 'カラムで並べて整理',
    body:  'ノート内をカラム（列）に分割して、<b>左に動画・右にメモ</b>といったレイアウトで整理できます。<br><br>複数の技を並べて比較する使い方にも便利です。',
    visual: `<div class="vis-col-wrap"><div class="vis-col-left"><div class="vis-col-tag video">▶ 動画</div><div class="vis-col-player"><div class="vis-col-pbtn"><div class="vis-col-pico"></div></div></div></div><div class="vis-col-divider"></div><div class="vis-col-right"><div class="vis-col-tag memo">📝 メモ</div><div class="vis-col-hdr"></div><div class="vis-col-line" style="width:95%"></div><div class="vis-col-line" style="width:80%"></div><div class="vis-col-line" style="width:65%"></div><div class="vis-col-line" style="width:88%;margin-top:3px"></div><div class="vis-col-line" style="width:72%"></div></div></div>`,
  },
];

let _overlay, _svgRect, _card;
let _current     = -1;
let _activeSteps = LIBRARY_STEPS;
let _injected    = false;

// ── Public API ──

export function initOnboarding() {
  _inject();
  if (!localStorage.getItem(OB_KEY)) {
    setTimeout(_showStart, 900);
  } else {
    const lastTs = parseInt(localStorage.getItem(HINT_KEY) || '0', 10);
    if (Date.now() - lastTs >= HINT_INTERVAL) {
      setTimeout(_showHint, 1200);
    }
  }
}

export function startOnboarding() {
  _hideStart();
  _activeSteps = LIBRARY_STEPS;
  _showOverlay();
  _goto(0);
}

export function startSearchOnboarding() {
  _activeSteps = SEARCH_STEPS;
  _showOverlay();
  _goto(0);
}

export function startNotesOnboarding() {
  _hideStart();
  _activeSteps = NOTES_STEPS;
  _showOverlay();
  _goto(0);
}

// ── Hint banner (2回目以降・3時間ごと) ──

function _showHint() {
  document.getElementById('ob-hint').style.display = 'flex';
  ['#fb-tab-btn', '#ob-help-btn'].forEach(sel => {
    document.querySelector(sel)?.classList.add('ob-hint-glow');
  });
  localStorage.setItem(HINT_KEY, String(Date.now()));
}

function _hideHint() {
  document.getElementById('ob-hint').style.display = 'none';
  ['#fb-tab-btn', '#ob-help-btn'].forEach(sel => {
    document.querySelector(sel)?.classList.remove('ob-hint-glow');
  });
}

// ── Start screen ──

function _showStart() {
  document.getElementById('ob-start').style.display = 'flex';
}
function _hideStart() {
  document.getElementById('ob-start').style.display = 'none';
}

// ── Overlay ──

function _showOverlay() {
  _overlay.style.pointerEvents = 'all';
  _overlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function _hideOverlay() {
  _overlay.style.pointerEvents = 'none';
  _overlay.style.display = 'none';
  document.body.style.overflow = '';
  _svgRect.setAttribute('width', 0);
  _svgRect.setAttribute('height', 0);
  _current = -1;
}

// ── Step navigation ──

function _goto(idx) {
  _current = idx;
  const steps = _activeSteps;
  const step  = steps[idx];

  step.beforeStep?.();

  let r = null;
  let useEmpty = false;
  if (step.targets) {
    r = _unionRect(step.targets);
  } else {
    let el = _visibleEl(step.target);
    if (!el && step.target2) el = _visibleEl(step.target2);
    if (!el && step.target_empty) {
      el = _visibleEl(step.target_empty);
      useEmpty = true;
    }
    r = el ? el.getBoundingClientRect() : null;
  }

  document.getElementById('ob-step-label').textContent = `STEP ${idx + 1} / ${steps.length}`;
  document.getElementById('ob-title').textContent       = step.title;
  document.getElementById('ob-body').innerHTML =
    (useEmpty || !r) && step.body_empty ? step.body_empty : step.body;
  document.getElementById('ob-next-btn').textContent   = idx === steps.length - 1 ? '完了 ✓' : '次へ →';
  document.getElementById('ob-prev-btn').style.display = idx === 0 ? 'none' : '';

  document.getElementById('ob-dots').innerHTML = steps.map((_, i) =>
    `<span class="ob-dot${i === idx ? ' ob-dot-on' : ''}"></span>`
  ).join('');

  const visEl = document.getElementById('ob-visual');
  if (step.visual) {
    visEl.style.display = '';
    visEl.innerHTML = step.visual;
  } else {
    visEl.style.display = 'none';
    visEl.innerHTML = '';
  }

  const zr = _zoomRect(r);
  if (zr && zr.width > 0 && zr.height > 0) {
    _svgRect.setAttribute('rx', 8); _svgRect.setAttribute('ry', 8);
    _svgRect.setAttribute('x',      zr.left   - PAD);
    _svgRect.setAttribute('y',      zr.top    - PAD);
    _svgRect.setAttribute('width',  zr.width  + PAD * 2);
    _svgRect.setAttribute('height', zr.height + PAD * 2);
    _placeCard(zr);
  } else {
    _svgRect.setAttribute('width', 0);
    _svgRect.setAttribute('height', 0);
    _centerCard(step.visual ? 400 : 310);
  }
}

// ── body zoom 補正（zoom != 1 のとき getBoundingClientRect は視覚座標を返すが
//    SVG/card の座標はローカル座標系なので zoom で割る必要がある） ──
function _getZoom() {
  return parseFloat(document.body.style.zoom) || 1;
}

function _zoomRect(r) {
  if (!r) return null;
  const z = _getZoom();
  if (z === 1) return r;
  return {
    left:   r.left   / z,
    top:    r.top    / z,
    right:  r.right  / z,
    bottom: r.bottom / z,
    width:  r.width  / z,
    height: r.height / z,
  };
}

// ── 要素の可視チェック ──
function _visibleEl(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return (r.width > 0 && r.height > 0) ? el : null;
}

// ── 複数要素の union bounding rect ──
function _unionRect(selectors) {
  const rects = selectors
    .map(s => document.querySelector(s)?.getBoundingClientRect())
    .filter(r => r && r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const left   = Math.min(...rects.map(r => r.left));
  const top    = Math.min(...rects.map(r => r.top));
  const right  = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// ── カード配置（純粋に画面スペースで判断） ──
function _placeCard(r) {
  const z   = _getZoom();
  const vw  = window.innerWidth  / z;
  const vh  = window.innerHeight / z;
  const GAP = 14;
  const CW  = Math.min(310, vw - 24);
  const CH  = 260;

  _card.style.width = CW + 'px';

  const spaceBelow = vh - r.bottom - GAP;
  const spaceAbove = r.top - GAP;
  const spaceRight = vw - r.right - GAP;

  let top, left;

  if (spaceRight >= CW && r.height >= CH * 0.5) {
    left = r.right + GAP;
    top  = r.top + (r.height / 2) - (CH / 2);
  } else if (spaceBelow >= CH) {
    top  = r.bottom + GAP;
    left = r.left + r.width / 2 - CW / 2;
  } else if (spaceAbove >= CH) {
    top  = r.top - CH - GAP;
    left = r.left + r.width / 2 - CW / 2;
  } else {
    _centerCard();
    return;
  }

  top  = Math.max(8, Math.min(top,  vh - CH - 8));
  left = Math.max(8, Math.min(left, vw - CW - 8));

  _card.style.top  = top  + 'px';
  _card.style.left = left + 'px';
}

function _centerCard(cw = 310) {
  const z  = _getZoom();
  const vw = window.innerWidth  / z;
  const vh = window.innerHeight / z;
  const CW = Math.min(cw, vw - 24);
  _card.style.width = CW + 'px';
  requestAnimationFrame(() => {
    const CH = _card.offsetHeight || 260;
    _card.style.top  = Math.max(8, (vh - CH) / 2) + 'px';
    _card.style.left = Math.max(8, (vw - CW) / 2) + 'px';
  });
}

// ── DOM 注入 ──

function _inject() {
  if (_injected) return;
  _injected = true;

  // スタート画面（Library ツアー専用）
  const startEl = document.createElement('div');
  startEl.id = 'ob-start';
  startEl.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:9601',
    'background:rgba(0,0,0,.85)', 'align-items:center', 'justify-content:center',
  ].join(';');
  startEl.innerHTML = `
    <div style="background:var(--surface,#1e1e1e);border:1.5px solid var(--accent,#e05a00);
                border-radius:16px;padding:32px 28px;width:min(380px,92vw);text-align:center;
                box-shadow:0 8px 40px rgba(0,0,0,.7);">
      <div style="font-size:22px;font-weight:900;margin-bottom:8px;">🥋 はじめに</div>
      <p style="font-size:14px;color:var(--text2,#aaa);line-height:1.6;margin-bottom:22px;">
        WAZA KIMURAの基本的な使い方を<br>${LIBRARY_STEPS.length}ステップで紹介します（約2分）
      </p>
      <div style="text-align:left;margin-bottom:22px;">
        ${LIBRARY_STEPS.map((s, i) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;color:var(--text,#ddd);">
            <span style="min-width:22px;height:22px;border-radius:50%;background:var(--accent,#e05a00);
                         color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;
                         justify-content:center;">${i + 1}</span>
            <span>${s.title}</span>
          </div>`).join('')}
      </div>
      <button id="ob-start-btn" style="width:100%;padding:12px;border-radius:8px;
              background:var(--accent,#e05a00);color:#fff;font-size:15px;font-weight:800;
              border:none;cursor:pointer;margin-bottom:10px;">ツアーをはじめる</button>
      <button id="ob-dismiss-btn" style="background:none;border:none;color:var(--text3,#666);
              font-size:13px;cursor:pointer;text-decoration:underline;">スキップして使い始める</button>
    </div>`;
  document.body.appendChild(startEl);

  // ヒントバナー（2回目以降・3時間ごと）
  const hintEl = document.createElement('div');
  hintEl.id = 'ob-hint';
  hintEl.style.cssText = [
    'display:none', 'position:fixed', 'bottom:80px', 'right:12px', 'z-index:9500',
    'background:var(--surface,#1e1e1e)', 'border:1.5px solid var(--accent,#e05a00)',
    'border-radius:12px', 'padding:14px 16px', 'max-width:min(280px,calc(100vw - 24px))',
    'box-shadow:0 4px 24px rgba(0,0,0,.6)', 'flex-direction:column', 'gap:8px',
  ].join(';');
  hintEl.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
      <div style="font-size:13px;font-weight:800;color:var(--text,#fff);">💬 テスト期間中のお願い</div>
      <button id="ob-hint-close" style="background:none;border:none;color:var(--text3,#666);font-size:18px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;">×</button>
    </div>
    <p style="font-size:12px;color:var(--text2,#bbb);line-height:1.65;margin:0;">
      操作でお困りのときは <b style="color:var(--text,#fff);">「?」</b> ボタンからツアーを再表示できます。<br>
      ご意見・改善点は <b style="color:var(--text,#fff);">「フィードバック」</b> ボタンへお気軽にどうぞ。
    </p>`;
  document.body.appendChild(hintEl);

  // ツアーオーバーレイ
  const ov = document.createElement('div');
  ov.id = 'ob-overlay';
  ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:9600;pointer-events:none;';

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const defs = document.createElementNS(svgNS, 'defs');
  const mask = document.createElementNS(svgNS, 'mask');
  mask.id = 'ob-mask';
  const maskBg = document.createElementNS(svgNS, 'rect');
  maskBg.setAttribute('width', '100%'); maskBg.setAttribute('height', '100%');
  maskBg.setAttribute('fill', 'white');
  const spotRect = document.createElementNS(svgNS, 'rect');
  spotRect.id = 'ob-spot'; spotRect.setAttribute('fill', 'black');
  spotRect.setAttribute('x', 0); spotRect.setAttribute('y', 0);
  spotRect.setAttribute('width', 0); spotRect.setAttribute('height', 0);
  mask.appendChild(maskBg); mask.appendChild(spotRect);
  defs.appendChild(mask);
  const bgRect = document.createElementNS(svgNS, 'rect');
  bgRect.setAttribute('width', '100%'); bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', 'rgba(0,0,0,0.72)');
  bgRect.setAttribute('mask', 'url(#ob-mask)');
  svg.appendChild(defs); svg.appendChild(bgRect);
  ov.appendChild(svg);

  const card = document.createElement('div');
  card.id = 'ob-card';
  card.style.cssText = [
    'position:absolute', 'z-index:3', 'pointer-events:auto',
    'background:var(--surface,#1e1e1e)',
    'border:1.5px solid var(--accent,#e05a00)',
    'border-radius:12px', 'overflow:hidden',
    'width:310px', 'max-width:calc(100vw - 20px)',
    'box-shadow:0 8px 32px rgba(0,0,0,.7)',
    'box-sizing:border-box',
  ].join(';');
  card.innerHTML = `
    <div id="ob-visual" style="display:none;width:100%;height:180px;
         background:var(--surface2,#2a2a2a);border-bottom:1px solid var(--border,#3a3a3a);
         position:relative;overflow:hidden;"></div>
    <div style="padding:20px;">
      <div id="ob-step-label" style="font-size:11px;color:var(--accent,#e05a00);font-weight:700;
           letter-spacing:1px;margin-bottom:8px;"></div>
      <div id="ob-title" style="font-size:15px;font-weight:800;margin-bottom:8px;
           color:var(--text,#fff);"></div>
      <div id="ob-body" style="font-size:13px;color:var(--text2,#bbb);line-height:1.65;
           margin-bottom:16px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div id="ob-dots" style="display:flex;gap:5px;"></div>
        <div style="display:flex;gap:6px;">
          <button id="ob-prev-btn" style="padding:6px 12px;border-radius:6px;background:#333;
                  border:none;color:var(--text2,#ccc);font-size:13px;cursor:pointer;">← 戻る</button>
          <button id="ob-skip-btn" style="padding:6px 12px;border-radius:6px;background:none;
                  border:1px solid var(--border,#444);color:var(--text3,#888);font-size:13px;
                  cursor:pointer;">スキップ</button>
          <button id="ob-next-btn" style="padding:6px 16px;border-radius:6px;
                  background:var(--accent,#e05a00);border:none;color:#fff;font-size:13px;
                  font-weight:700;cursor:pointer;">次へ →</button>
        </div>
      </div>
    </div>`;
  ov.appendChild(card);
  document.body.appendChild(ov);

  const style = document.createElement('style');
  style.textContent = `
    .ob-dot { display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--border,#444); }
    .ob-dot-on { background:var(--accent,#e05a00) !important; }
    .ob-hint-glow { animation:ob-glow 1.4s ease-in-out infinite alternate !important; }
    @keyframes ob-glow { from { box-shadow:0 0 0 2px var(--accent,#e05a00); } to { box-shadow:0 0 0 6px rgba(224,90,0,.35); } }
    .vis-overview { display:flex;width:100%;height:100%; }
    .vis-ov-sb { width:90px;background:var(--surface,#1e1e1e);border-right:1px solid var(--border,#3a3a3a);padding:8px 6px;flex-shrink:0; }
    .vis-ov-sb-hdr { height:8px;background:var(--accent,#e05a00);border-radius:3px;margin-bottom:8px;width:60%; }
    .vis-ov-sb-item { height:7px;background:var(--surface3,#333);border-radius:3px;margin-bottom:5px; }
    .vis-ov-sb-item.on { background:var(--text3,#666); }
    .vis-ov-main { flex:1;padding:10px 12px; }
    .vis-ov-title { height:11px;background:var(--text3,#666);border-radius:3px;margin-bottom:10px;width:55%; }
    .vis-ov-text { height:7px;background:var(--surface3,#333);border-radius:3px;margin-bottom:5px; }
    .vis-ov-video { height:32px;background:var(--surface,#1e1e1e);border:1px solid var(--border,#3a3a3a);border-radius:5px;margin:8px 0;display:flex;align-items:center;gap:6px;padding:0 8px; }
    .vis-ov-play { width:18px;height:18px;background:#1a1a1a;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;flex-shrink:0; }
    .vis-ov-vtitle { height:6px;background:var(--surface3,#333);border-radius:2px;flex:1; }
    .vis-ov-img { height:36px;background:var(--surface,#1e1e1e);border:1px solid var(--border,#3a3a3a);border-radius:5px;margin-top:6px;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text3,#666); }
    .vis-text { padding:16px 20px;width:100%; }
    .vis-text-h { height:12px;background:var(--text3,#666);border-radius:3px;width:40%;margin-bottom:10px; }
    .vis-text-line { height:8px;background:var(--surface3,#333);border-radius:3px;margin-bottom:6px; }
    .vis-text-cursor { display:inline-block;width:2px;height:13px;background:var(--accent,#e05a00);border-radius:1px;animation:ob-blink .9s step-end infinite;vertical-align:middle;margin-left:2px; }
    @keyframes ob-blink { 50% { opacity:0; } }
    .vis-text-bullet { display:flex;align-items:center;gap:6px;margin-bottom:5px; }
    .vis-text-dot { width:5px;height:5px;border-radius:50%;background:var(--accent,#e05a00);flex-shrink:0; }
    .vis-text-bline { height:7px;background:var(--surface3,#333);border-radius:3px;flex:1; }
    .vis-video-wrap { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px; }
    .vis-player { width:200px;height:112px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.5); }
    .vis-play-btn { width:32px;height:32px;background:rgba(255,255,255,.9);border-radius:50%;display:flex;align-items:center;justify-content:center; }
    .vis-play-icon { width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:14px solid #000;margin-left:3px; }
    .vis-src-row { display:flex;gap:6px; }
    .vis-src-chip { padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1.5px solid; }
    .vis-src-chip.lib { background:rgba(212,160,23,.15);color:var(--accent,#e05a00);border-color:var(--accent,#e05a00); }
    .vis-src-chip.yt { background:rgba(255,0,0,.12);color:#ff4444;border-color:#ff4444; }
    .vis-image { width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;position:relative; }
    .vis-img-card { border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center; }
    .vis-img-paste { font-size:10px;color:var(--text3,#666);position:absolute;bottom:8px;right:10px; }
    .vis-col-wrap { display:flex;gap:0;padding:14px;width:100%;height:100%;align-items:stretch; }
    .vis-col-left { flex:1;background:#0d0d0d;border:1px solid var(--border,#3a3a3a);border-radius:8px 0 0 8px;display:flex;flex-direction:column;overflow:hidden; }
    .vis-col-tag { font-size:9px;font-weight:700;padding:4px 8px;letter-spacing:.5px; }
    .vis-col-tag.video { color:var(--accent,#e05a00);background:rgba(212,160,23,.12); }
    .vis-col-tag.memo { color:var(--text3,#666);background:var(--surface2,#2a2a2a); }
    .vis-col-player { flex:1;background:#000;display:flex;align-items:center;justify-content:center; }
    .vis-col-pbtn { width:28px;height:28px;background:rgba(255,255,255,.85);border-radius:50%;display:flex;align-items:center;justify-content:center; }
    .vis-col-pico { width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:12px solid #000;margin-left:2px; }
    .vis-col-divider { width:3px;background:var(--accent,#e05a00);opacity:.5;flex-shrink:0; }
    .vis-col-right { flex:2;background:var(--surface,#1e1e1e);border:1px solid var(--border,#3a3a3a);border-left:none;border-radius:0 8px 8px 0;padding:8px 10px;display:flex;flex-direction:column;gap:5px; }
    .vis-col-line { height:6px;background:var(--surface3,#333);border-radius:3px; }
    .vis-col-hdr { height:9px;background:var(--text3,#666);border-radius:3px;width:55%;margin-bottom:4px; }
  `;
  document.head.appendChild(style);

  _overlay = ov;
  _svgRect = spotRect;
  _card    = card;

  document.getElementById('ob-hint-close').addEventListener('click', _hideHint);
  document.getElementById('ob-start-btn').addEventListener('click', startOnboarding);
  document.getElementById('ob-dismiss-btn').addEventListener('click', () => {
    _hideStart();
    localStorage.setItem(OB_KEY, '1');
  });
  document.getElementById('ob-prev-btn').addEventListener('click', () => {
    if (_current > 0) _goto(_current - 1);
  });
  document.getElementById('ob-skip-btn').addEventListener('click', () => {
    _hideOverlay();
    localStorage.setItem(OB_KEY, '1');
  });
  document.getElementById('ob-next-btn').addEventListener('click', () => {
    if (_current < _activeSteps.length - 1) {
      _goto(_current + 1);
    } else {
      _hideOverlay();
      localStorage.setItem(OB_KEY, '1');
    }
  });
}
