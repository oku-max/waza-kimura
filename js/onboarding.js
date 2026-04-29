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
    target: '.lib-view-bar',
    pos:    'below',
    title:  '表示を切り替える',
    body:   '<b>📋 カードビュー</b>：サムネイル付きでざっと眺めるのに最適。<br><br><b>📊 テーブルビュー</b>：習得度・タグ・メモを一覧で管理したいときに。',
  },
  {
    target:     '#filter-toggle-btn',
    pos:        'below',
    title:      'フィルターとタグで絞り込む',
    body:       '<b>「☰ フィルター」</b>からチャンネル・プレイリスト・タグ・習得度など複数条件で絞り込めます。<br><br>タグは自分で自由に作成・編集できます。',
    beforeStep: () => window.closeFilterOverlay?.(),
  },
  {
    target:     '.card',
    pos:        'right',
    title:      '動画を再生する（Vパネル）',
    body:       '動画カードをクリックすると <b>Vパネル</b> が開いて再生できます。<br><br>タイムスタンプのコピーや、プレイリスト内の連続再生にも対応しています。',
    body_empty: '動画を追加すると、カードをクリックするだけで <b>Vパネル</b> が開いて再生できます。<br><br>タイムスタンプのコピーや、プレイリスト内の連続再生にも対応しています。',
  },
  {
    target: '#tnav-notes',
    pos:    'below',
    title:  'Notesで練習メモをとる',
    body:   '<b>「≡ Notes」タブ</b>では自由にテキストメモを書けます。<br><br>道場でのメモや練習の気づきをざっくり書き留める場所として使ってください。',
  },
];

let _overlay, _svgRect, _card, _arrow;
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
  // JS直接変更: インラインスタイルはCSS classより優先されるため
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

  // beforeStep コールバック（フィルターを閉じるなど）
  step.beforeStep?.();

  const el = document.querySelector(step.target);
  const r  = el ? el.getBoundingClientRect() : null;
  const visible = r && r.width > 0 && r.height > 0;

  document.getElementById('ob-step-label').textContent = `STEP ${idx} / ${STEPS.length - 1}`;
  document.getElementById('ob-title').textContent       = step.title;
  // 動画未追加など要素がない場合は body_empty を使う
  document.getElementById('ob-body').innerHTML =
    (!el && step.body_empty) ? step.body_empty : step.body;
  document.getElementById('ob-next-btn').textContent   = idx === STEPS.length - 1 ? '完了 ✓' : '次へ →';
  document.getElementById('ob-prev-btn').style.display = idx === 0 ? 'none' : '';

  // ドット更新
  document.getElementById('ob-dots').innerHTML = STEPS.map((_, i) =>
    `<span class="ob-dot${i === idx ? ' ob-dot-on' : ''}"></span>`
  ).join('');

  if (visible) {
    // スポットライト
    _svgRect.setAttribute('rx', 8); _svgRect.setAttribute('ry', 8);
    _svgRect.setAttribute('x',      r.left   - PAD);
    _svgRect.setAttribute('y',      r.top    - PAD);
    _svgRect.setAttribute('width',  r.width  + PAD * 2);
    _svgRect.setAttribute('height', r.height + PAD * 2);
    _positionCard(r, step.pos);
  } else {
    // 要素が不可視 or 未存在 → スポットライトなし、カードを画面中央に
    _svgRect.setAttribute('width', 0);
    _svgRect.setAttribute('height', 0);
    _centerCard();
  }
}

function _positionCard(r, pos) {
  const CARD_W = 310, GAP = 16, AW = 9;
  const vw = window.innerWidth, vh = window.innerHeight;

  // リセット
  _card.style.top = _card.style.left = _card.style.bottom = _card.style.right = '';
  _arrow.style.cssText = 'position:absolute;width:0;height:0;border:9px solid transparent;';

  const cx = r.left + r.width / 2;

  if (pos === 'below' || pos === 'below-left' || pos === 'below-right') {
    const top = Math.min(r.bottom + GAP, vh - 260);
    _card.style.top = top + 'px';

    let left;
    if (pos === 'below-left') {
      left = Math.max(8, Math.min(r.right - CARD_W, vw - CARD_W - 8));
    } else {
      left = Math.max(8, Math.min(r.left, vw - CARD_W - 8));
    }
    _card.style.left = left + 'px';

    _arrow.style.borderBottomColor = 'var(--accent, #e05a00)';
    _arrow.style.top  = (top - AW * 2 + 1) + 'px';
    _arrow.style.left = (cx - AW) + 'px';

  } else if (pos === 'right') {
    const spaceRight = vw - r.right - GAP;
    if (spaceRight >= CARD_W) {
      const top = Math.max(8, Math.min(r.top, vh - 300));
      _card.style.top  = top + 'px';
      _card.style.left = (r.right + GAP) + 'px';
      _arrow.style.borderRightColor = 'var(--accent, #e05a00)';
      _arrow.style.top  = (r.top + r.height / 2 - AW) + 'px';
      _arrow.style.left = (r.right + GAP - AW * 2 + 1) + 'px';
    } else {
      // 右に収まらない → 下に fallback
      _positionCard(r, 'below');
    }
  }
}

function _centerCard() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const CARD_W = 310;
  _card.style.top  = Math.max(8, (vh - 280) / 2) + 'px';
  _card.style.left = Math.max(8, (vw - CARD_W) / 2) + 'px';
  _arrow.style.cssText = 'position:absolute;width:0;height:0;border:9px solid transparent;';
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
        WAZA KIMURAの基本的な使い方を<br>6ステップで紹介します（約2分）
      </p>
      <div style="text-align:left;margin-bottom:22px;">
        ${STEPS.map((s, i) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13px;color:var(--text,#ddd);">
            <span style="min-width:22px;height:22px;border-radius:50%;background:var(--accent,#e05a00);
                         color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;
                         justify-content:center;">${i}</span>
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
  ov.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:9600', 'pointer-events:none',
  ].join(';');

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

  // 矢印
  const arrow = document.createElement('div');
  arrow.id = 'ob-arrow';
  arrow.style.cssText = 'position:absolute;width:0;height:0;border:9px solid transparent;pointer-events:none;z-index:2;';
  ov.appendChild(arrow);

  // ツールチップカード（明示的に pointer-events:auto）
  const card = document.createElement('div');
  card.id = 'ob-card';
  card.style.cssText = [
    'position:absolute', 'z-index:3', 'pointer-events:auto',
    'background:var(--surface,#1e1e1e)',
    'border:1.5px solid var(--accent,#e05a00)',
    'border-radius:12px', 'padding:20px',
    'width:310px', 'max-width:calc(100vw - 20px)',
    'box-shadow:0 8px 32px rgba(0,0,0,.7)',
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

  // スタイル（ドット用のみ）
  const style = document.createElement('style');
  style.textContent = `
    .ob-dot { display:inline-block;width:7px;height:7px;border-radius:50%;
              background:var(--border,#444); }
    .ob-dot-on { background:var(--accent,#e05a00) !important; }
  `;
  document.head.appendChild(style);

  // 参照キャッシュ
  _overlay = ov;
  _svgRect = spotRect;
  _card    = card;
  _arrow   = arrow;

  // イベント（addEventListener で確実に）
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
