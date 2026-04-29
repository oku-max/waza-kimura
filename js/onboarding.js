// ═══ WAZA KIMURA — オンボーディングツアー ═══
const OB_KEY = 'wk_ob_done';
const PAD    = 10;

const STEPS = [
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
];

let _overlay, _svgRect, _card;
let _current = -1;
let _injected = false;

// ── Public API ──

export function initOnboarding() {
  _inject();
  if (!localStorage.getItem(OB_KEY)) {
    setTimeout(_showStart, 900);
  }
}

export function startOnboarding() {
  _hideStart();
  _showOverlay();
  _goto(0);
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
  const step = STEPS[idx];

  step.beforeStep?.();

  // targets 配列 → union rect、単一 target/target2 → 既存ロジック
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

  document.getElementById('ob-step-label').textContent = `STEP ${idx + 1} / ${STEPS.length}`;
  document.getElementById('ob-title').textContent       = step.title;
  document.getElementById('ob-body').innerHTML =
    (useEmpty && step.body_empty) ? step.body_empty : (!r && step.body_empty) ? step.body_empty : step.body;
  document.getElementById('ob-next-btn').textContent   = idx === STEPS.length - 1 ? '完了 ✓' : '次へ →';
  document.getElementById('ob-prev-btn').style.display = idx === 0 ? 'none' : '';

  document.getElementById('ob-dots').innerHTML = STEPS.map((_, i) =>
    `<span class="ob-dot${i === idx ? ' ob-dot-on' : ''}"></span>`
  ).join('');

  if (r && r.width > 0 && r.height > 0) {
    // スポットライト
    _svgRect.setAttribute('rx', 8); _svgRect.setAttribute('ry', 8);
    _svgRect.setAttribute('x',      r.left   - PAD);
    _svgRect.setAttribute('y',      r.top    - PAD);
    _svgRect.setAttribute('width',  r.width  + PAD * 2);
    _svgRect.setAttribute('height', r.height + PAD * 2);
    _placeCard(r);
  } else {
    // 要素不可視 → スポットライトなし・カードを画面中央に
    _svgRect.setAttribute('width', 0);
    _svgRect.setAttribute('height', 0);
    _centerCard();
  }
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
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;
  const GAP  = 14;
  const CW   = Math.min(310, vw - 24);  // モバイル対応: 画面幅 - マージン
  const CH   = 260;                      // カードのおよその高さ

  _card.style.width = CW + 'px';

  const spaceBelow = vh - r.bottom - GAP;
  const spaceAbove = r.top - GAP;
  const spaceRight = vw - r.right - GAP;
  const spaceLeft  = r.left - GAP;

  let top, left;

  if (spaceRight >= CW && r.height >= CH * 0.5) {
    // ── 右配置（サイドバーなど縦長要素） ──
    left = r.right + GAP;
    top  = r.top + (r.height / 2) - (CH / 2);
  } else if (spaceBelow >= CH) {
    // ── 下配置（一番よく使う） ──
    top  = r.bottom + GAP;
    // 要素の中心 or 画面中央、どちらか画面内に収まるほうを選ぶ
    const idealLeft = r.left + r.width / 2 - CW / 2;
    left = idealLeft;
  } else if (spaceAbove >= CH) {
    // ── 上配置 ──
    top  = r.top - CH - GAP;
    left = r.left + r.width / 2 - CW / 2;
  } else {
    // ── どこにも入らない → 画面中央 ──
    _centerCard();
    return;
  }

  // ビューポート内にクランプ
  top  = Math.max(8, Math.min(top,  vh - CH - 8));
  left = Math.max(8, Math.min(left, vw - CW - 8));

  _card.style.top  = top  + 'px';
  _card.style.left = left + 'px';
}

function _centerCard() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const CW = Math.min(310, vw - 24);
  _card.style.width = CW + 'px';
  _card.style.top  = Math.max(8, (vh - 260) / 2) + 'px';
  _card.style.left = Math.max(8, (vw - CW)  / 2) + 'px';
}

// ── DOM 注入 ──

function _inject() {
  if (_injected) return;
  _injected = true;

  // スタート画面
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
        WAZA KIMURAの基本的な使い方を<br>7ステップで紹介します（約2分）
      </p>
      <div style="text-align:left;margin-bottom:22px;">
        ${STEPS.map((s, i) => `
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

  // ツアーオーバーレイ
  const ov = document.createElement('div');
  ov.id = 'ob-overlay';
  ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:9600;pointer-events:none;';

  // SVG（表示専用・クリック透過）
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

  // ツールチップカード
  const card = document.createElement('div');
  card.id = 'ob-card';
  card.style.cssText = [
    'position:absolute', 'z-index:3', 'pointer-events:auto',
    'background:var(--surface,#1e1e1e)',
    'border:1.5px solid var(--accent,#e05a00)',
    'border-radius:12px', 'padding:20px',
    'width:310px', 'max-width:calc(100vw - 20px)',
    'box-shadow:0 8px 32px rgba(0,0,0,.7)',
    'box-sizing:border-box',
  ].join(';');
  card.innerHTML = `
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
    </div>`;
  ov.appendChild(card);
  document.body.appendChild(ov);

  // ドット用スタイル
  const style = document.createElement('style');
  style.textContent = `
    .ob-dot { display:inline-block;width:7px;height:7px;border-radius:50%;
              background:var(--border,#444); }
    .ob-dot-on { background:var(--accent,#e05a00) !important; }
  `;
  document.head.appendChild(style);

  _overlay = ov;
  _svgRect = spotRect;
  _card    = card;

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
    if (_current < STEPS.length - 1) {
      _goto(_current + 1);
    } else {
      _hideOverlay();
      localStorage.setItem(OB_KEY, '1');
    }
  });
}
