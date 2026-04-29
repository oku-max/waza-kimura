// ═══ WAZA KIMURA — オンボーディングツアー ═══
const OB_KEY = 'wk_ob_done';
const PAD    = 10;

const STEPS = [
  {
    target: '#auth-btn',
    pos:    'below-left',
    title:  'まずGoogleでログインする',
    body:   '<b>ログインは最初に必ずやること。</b><br>ログインしないとデータがブラウザ内にしか保存されず、タブを閉じると消えてしまいます。右上の「Googleでログイン」をタップしてください。',
  },
  {
    target: '#yt-import-btn',
    pos:    'below-left',
    title:  '動画を追加する',
    body:   '右上の <b>「＋ 動画を追加」</b> から動画をインポートできます。<br><br>📺 <b>YouTube</b>（プレイリスト一括対応）<br>🎬 <b>Vimeo</b><br>💾 <b>Google Drive</b>',
  },
  {
    target: '#lvt-card',
    pos:    'below',
    title:  '表示を切り替える',
    body:   '<b>📋 カードビュー</b>：サムネイル付きでざっと眺めるのに最適。<br><br><b>📊 テーブルビュー</b>：習得度・タグ・メモを一覧で管理したいときに。',
  },
  {
    target: '#filter-toggle-btn',
    pos:    'below',
    title:  'フィルターとタグで絞り込む',
    body:   '<b>「☰ フィルター」</b>からチャンネル・プレイリスト・タグ・習得度など複数条件で絞り込めます。<br><br>タグは自分で自由に作成・編集できます。',
  },
  {
    target: '.card',
    pos:    'right',
    title:  '動画を再生する（Vパネル）',
    body:   '動画カードをクリックすると <b>Vパネル</b> が開いて再生できます。<br><br>タイムスタンプのコピーや、プレイリスト内の連続再生にも対応しています。',
  },
  {
    target: '#tnav-notes',
    pos:    'below',
    title:  'Notesで練習メモをとる',
    body:   '<b>「≡ Notes」タブ</b>では自由にテキストメモを書けます。<br><br>道場でのメモや練習の気づきをざっくり書き留める場所として使ってください。',
  },
];

// ── DOM refs (populated after inject) ──
let _overlay, _svg, _rect, _card, _arrow;
let _current = -1;

export function initOnboarding() {
  _inject();
  if (!localStorage.getItem(OB_KEY)) {
    setTimeout(showStartScreen, 900);
  }
}

export function startOnboarding() {
  hideStartScreen();
  _show();
  _goto(0);
}

// ── Start screen ──
function showStartScreen() {
  const el = document.getElementById('ob-start');
  if (el) el.style.display = 'flex';
}
function hideStartScreen() {
  const el = document.getElementById('ob-start');
  if (el) el.style.display = 'none';
}

// ── Tour ──
function _show() {
  _overlay.classList.add('ob-active');
  document.body.style.overflow = 'hidden';
}

function _hide() {
  _overlay.classList.remove('ob-active');
  document.body.style.overflow = '';
  _rect.setAttribute('x', 0); _rect.setAttribute('y', 0);
  _rect.setAttribute('width', 0); _rect.setAttribute('height', 0);
  _current = -1;
}

function _goto(idx) {
  _current = idx;
  const step = STEPS[idx];
  const el   = document.querySelector(step.target);

  document.getElementById('ob-step-label').textContent = `STEP ${idx} / ${STEPS.length - 1}`;
  document.getElementById('ob-title').textContent       = step.title;
  document.getElementById('ob-body').innerHTML          = step.body;
  document.getElementById('ob-next-btn').textContent    = idx === STEPS.length - 1 ? '完了 ✓' : '次へ →';
  document.getElementById('ob-prev-btn').style.display  = idx === 0 ? 'none' : '';

  // Dots
  document.getElementById('ob-dots').innerHTML = STEPS.map((_, i) =>
    `<div class="ob-dot${i === idx ? ' ob-dot-active' : ''}"></div>`
  ).join('');

  if (!el) return;
  const r = el.getBoundingClientRect();

  // Spotlight
  _rect.setAttribute('rx', 8); _rect.setAttribute('ry', 8);
  _rect.setAttribute('x',      r.left   - PAD);
  _rect.setAttribute('y',      r.top    - PAD);
  _rect.setAttribute('width',  r.width  + PAD * 2);
  _rect.setAttribute('height', r.height + PAD * 2);

  _positionCard(r, step.pos);
}

function _positionCard(r, pos) {
  const cw = 310, gap = 16, aw = 9;
  const vw = window.innerWidth, vh = window.innerHeight;
  _card.style.cssText = _card.style.cssText.replace(/top:[^;]+;|left:[^;]+;|bottom:[^;]+;|right:[^;]+;/g, '');

  // Reset arrow
  _arrow.className = 'ob-arrow';
  _arrow.style.cssText = '';

  const cx = r.left + r.width / 2;
  const cy = r.top  + r.height / 2;

  if (pos === 'below' || pos === 'below-left' || pos === 'below-right') {
    const top = r.bottom + gap;
    _card.style.top  = top + 'px';
    if (pos === 'below-left') {
      _card.style.left = Math.max(8, Math.min(r.right - cw, vw - cw - 8)) + 'px';
    } else {
      _card.style.left = Math.max(8, Math.min(r.left, vw - cw - 8)) + 'px';
    }
    _arrow.classList.add('ob-arrow-up');
    _arrow.style.top  = (top - aw * 2) + 'px';
    _arrow.style.left = (cx - aw) + 'px';

  } else if (pos === 'right') {
    const left = r.right + gap;
    if (left + cw < vw) {
      _card.style.top  = Math.max(8, Math.min(cy - 80, vh - 300)) + 'px';
      _card.style.left = left + 'px';
      _arrow.classList.add('ob-arrow-left');
      _arrow.style.top  = (cy - aw) + 'px';
      _arrow.style.left = (r.right + gap - aw * 2) + 'px';
    } else {
      // fallback: below
      _card.style.top  = (r.bottom + gap) + 'px';
      _card.style.left = Math.max(8, Math.min(r.left, vw - cw - 8)) + 'px';
      _arrow.classList.add('ob-arrow-up');
      _arrow.style.top  = (r.bottom + gap - aw * 2) + 'px';
      _arrow.style.left = (cx - aw) + 'px';
    }
  }
}

// ── Build DOM ──
function _inject() {
  // Start screen
  const startEl = document.createElement('div');
  startEl.id = 'ob-start';
  startEl.style.cssText = 'display:none;position:fixed;inset:0;z-index:9601;background:rgba(0,0,0,.88);align-items:center;justify-content:center;';
  startEl.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--accent);border-radius:16px;
                padding:32px 28px;width:min(380px,92vw);text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.7)">
      <div style="font-size:22px;font-weight:900;margin-bottom:8px">🥋 はじめに</div>
      <p style="font-size:14px;color:var(--text2,#aaa);line-height:1.6;margin-bottom:22px">
        WAZA KIMURAの基本的な使い方を<br>6ステップで紹介します（約2分）
      </p>
      <div style="text-align:left;margin-bottom:22px">
        ${STEPS.map((s,i) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:13px;color:var(--text,#ddd)">
            <div style="min-width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;
                        font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${i}</div>
            <span>${s.title}</span>
          </div>`).join('')}
      </div>
      <button onclick="window._obStart()" style="width:100%;padding:12px;border-radius:8px;background:var(--accent);
              color:var(--on-accent,#fff);font-size:15px;font-weight:800;border:none;cursor:pointer;margin-bottom:10px">
        ツアーをはじめる
      </button>
      <button onclick="window._obDismiss()" style="background:none;border:none;color:var(--text3,#666);
              font-size:13px;cursor:pointer;text-decoration:underline">
        スキップして使い始める
      </button>
    </div>`;
  document.body.appendChild(startEl);

  // Tour overlay
  const ov = document.createElement('div');
  ov.id = 'ob-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9600;pointer-events:none;';
  ov.innerHTML = `
    <svg id="ob-svg" style="position:absolute;inset:0;width:100%;height:100%;" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="ob-mask">
          <rect width="100%" height="100%" fill="white"/>
          <rect id="ob-rect" fill="black" x="0" y="0" width="0" height="0"/>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#ob-mask)"/>
    </svg>
    <div class="ob-arrow" id="ob-arrow" style="position:absolute;width:0;height:0;border:9px solid transparent;"></div>
    <div id="ob-card" style="position:absolute;background:var(--surface);border:1.5px solid var(--accent);
         border-radius:12px;padding:20px;width:310px;box-shadow:0 8px 32px rgba(0,0,0,.7);max-width:calc(100vw - 16px)">
      <div id="ob-step-label" style="font-size:11px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:8px"></div>
      <div id="ob-title"      style="font-size:15px;font-weight:800;margin-bottom:8px;color:var(--text,#fff)"></div>
      <div id="ob-body"       style="font-size:13px;color:var(--text2,#bbb);line-height:1.65;margin-bottom:16px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div id="ob-dots" style="display:flex;gap:5px"></div>
        <div style="display:flex;gap:8px">
          <button id="ob-prev-btn" onclick="window._obPrev()"
            style="padding:6px 12px;border-radius:6px;background:#333;border:none;color:var(--text2,#ccc);font-size:13px;cursor:pointer">← 戻る</button>
          <button onclick="window._obSkip()"
            style="padding:6px 12px;border-radius:6px;background:none;border:1px solid var(--border,#444);color:var(--text3,#888);font-size:13px;cursor:pointer">スキップ</button>
          <button id="ob-next-btn" onclick="window._obNext()"
            style="padding:6px 16px;border-radius:6px;background:var(--accent);border:none;color:var(--on-accent,#fff);font-size:13px;font-weight:700;cursor:pointer">次へ →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);

  // CSS for overlay active state + dots + arrow shapes
  const style = document.createElement('style');
  style.textContent = `
    #ob-overlay.ob-active { pointer-events: all; }
    .ob-dot { width:7px;height:7px;border-radius:50%;background:var(--border,#444); }
    .ob-dot-active { background:var(--accent) !important; }
    .ob-arrow-up    { border-bottom-color: var(--accent) !important; }
    .ob-arrow-down  { border-top-color:    var(--accent) !important; }
    .ob-arrow-left  { border-right-color:  var(--accent) !important; }
    .ob-arrow-right { border-left-color:   var(--accent) !important; }
  `;
  document.head.appendChild(style);

  _overlay = ov;
  _svg     = document.getElementById('ob-svg');
  _rect    = document.getElementById('ob-rect');
  _card    = document.getElementById('ob-card');
  _arrow   = document.getElementById('ob-arrow');

  // Global handlers called from inline onclick
  window._obStart   = startOnboarding;
  window._obDismiss = () => { hideStartScreen(); localStorage.setItem(OB_KEY, '1'); };
  window._obSkip    = () => { _hide(); localStorage.setItem(OB_KEY, '1'); };
  window._obPrev    = () => { if (_current > 0) _goto(_current - 1); };
  window._obNext    = () => {
    if (_current < STEPS.length - 1) _goto(_current + 1);
    else { _hide(); localStorage.setItem(OB_KEY, '1'); }
  };
}
