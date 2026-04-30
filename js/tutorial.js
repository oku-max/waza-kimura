// tutorial.js — Vpanel ハイライトチュートリアル
// onboarding.js と同じ SVG マスク方式でスポットライト実現。
// body.style.zoom 補正・ビジュアルビューポート追従あり。

(function () {
  // ── 定数 ──────────────────────────────────────────────
  const PAD = 10;   // スポット余白（onboarding.js と同値）
  const GAP = 14;   // スポットとツールチップの隙間
  const CW  = 310;  // ツールチップ幅
  const CH  = 260;  // ツールチップ高さ見積もり

  // ── ステップ定義 ─────────────────────────────────────
  function buildSteps() {
    const vid = window.openVPanelId || '';
    return [
      { id: 'vpanel-title-area',    title: '動画ナビゲーション', desc: '⏮ ⏭ で前後の動画に移動。☰ で次の動画リストを表示できます。' },
      { id: 'vpanel-skip-area',     title: 'スキップボタン',    desc: 'ボタンを押すと指定秒数だけ早送り・巻き戻し。技の直前に素早く戻るときに便利です。' },
      { id: 'vpanel-ab-area',       title: 'A-B ループ',        desc: 'A・B で区間を指定して繰り返し再生。技の細かい動きをじっくり確認できます。' },
      { id: `vp-bm-section-${vid}`, title: 'ブックマーク',      desc: '重要シーンのタイムスタンプを記録。タップするとその場面に移動します。' },
      { id: `vp-memo-row-${vid}`,   title: 'メモ',              desc: '気づき・次に試すこと・ポイントを自分の言葉で書き留めましょう。' },
      { id: `vp-tag-fsec-${vid}`,   title: 'タグ・習得度',      desc: 'ポジション・技名でタグ付け。トップ/ボトム/カテゴリ/テクニックで整理できます。' },
      { id: `vp-notes-row-${vid}`,  title: 'Notes に追加',      desc: 'この動画をノートに紐づけて、気づきや課題をまとめて管理できます。' },
      { id: 'vp-ai-tag-btn',        title: 'AIタグ提案',        desc: 'AIが動画タイトルを分析してタグを自動提案。採用したいものだけ選んで適用できます。' },
    ];
  }

  // ── 状態 ─────────────────────────────────────────────
  let _cur   = 0;
  let _steps = [];

  // ── body.style.zoom 補正（onboarding.js と同じ） ─────
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

  // ── 公開 API ─────────────────────────────────────────
  window.vpStartTutorial = function () {
    _steps = buildSteps();
    const o = document.getElementById('vp-tut-overlay');
    if (!o) return;
    o.style.display      = 'block';
    o.style.pointerEvents = 'all';
    _cur = 0;
    _render();
  };

  window.vpEndTutorial = function () {
    const o = document.getElementById('vp-tut-overlay');
    if (!o) return;
    o.style.display       = 'none';
    o.style.pointerEvents = 'none';
    // スポットをリセット
    const spot = document.getElementById('vp-tut-spot');
    if (spot) { spot.setAttribute('width', 0); spot.setAttribute('height', 0); }
  };

  window.vpTutGo = function (d) {
    if (d > 0 && _cur === _steps.length - 1) { window.vpEndTutorial(); return; }
    _cur = Math.max(0, Math.min(_steps.length - 1, _cur + d));
    _render();
  };

  // ── 描画 ─────────────────────────────────────────────
  function _render() {
    const s  = _steps[_cur];
    const el = document.getElementById(s.id);

    // 要素が存在しない場合はそのステップをスキップ
    if (!el) { window.vpTutGo(1); return; }

    // スクロールアウト要素を即座に表示域に戻す
    el.scrollIntoView({ behavior: 'instant', block: 'nearest' });

    const r  = el.getBoundingClientRect();
    const zr = _zoomRect(r);

    // ── SVG スポット更新 ──
    const spot = document.getElementById('vp-tut-spot');
    if (spot && zr && zr.width > 0 && zr.height > 0) {
      spot.setAttribute('x',      zr.left   - PAD);
      spot.setAttribute('y',      zr.top    - PAD);
      spot.setAttribute('width',  zr.width  + PAD * 2);
      spot.setAttribute('height', zr.height + PAD * 2);
    } else if (spot) {
      spot.setAttribute('width', 0);
      spot.setAttribute('height', 0);
    }

    // ── ツールチップ配置（onboarding.js の _placeCard と同ロジック） ──
    const z  = _getZoom();
    const vw = window.innerWidth  / z;
    const vh = window.innerHeight / z;
    const cardW = Math.min(CW, vw - 24);
    const tip = document.getElementById('vp-tut-tip');
    tip.style.width = cardW + 'px';

    let top, left;
    if (zr && zr.width > 0) {
      const spaceBelow = vh - zr.bottom - GAP;
      const spaceAbove = zr.top - GAP;
      const spaceRight = vw - zr.right - GAP;

      if (spaceRight >= cardW && zr.height >= CH * 0.5) {
        left = zr.right + GAP;
        top  = zr.top + zr.height / 2 - CH / 2;
      } else if (spaceBelow >= CH) {
        top  = zr.bottom + GAP;
        left = zr.left + zr.width / 2 - cardW / 2;
      } else if (spaceAbove >= CH) {
        top  = zr.top - CH - GAP;
        left = zr.left + zr.width / 2 - cardW / 2;
      } else {
        // 中央配置フォールバック
        top  = (vh - CH) / 2;
        left = (vw - cardW) / 2;
      }
      top  = Math.max(8, Math.min(top,  vh - CH - 8));
      left = Math.max(8, Math.min(left, vw - cardW - 8));
    } else {
      top  = (vh - CH) / 2;
      left = (vw - cardW) / 2;
    }

    tip.style.top  = top  + 'px';
    tip.style.left = left + 'px';

    // ── テキスト更新 ──
    document.getElementById('vp-tut-step').textContent  = `ステップ ${_cur + 1} / ${_steps.length}`;
    document.getElementById('vp-tut-title').textContent = s.title;
    document.getElementById('vp-tut-desc').textContent  = s.desc;
    document.getElementById('vp-tut-dots').innerHTML    = _steps.map((_, i) =>
      `<div class="vp-tut-dot${i === _cur ? ' on' : ''}"></div>`).join('');
    document.getElementById('vp-tut-prev').style.visibility =
      _cur === 0 ? 'hidden' : 'visible';
    document.getElementById('vp-tut-next').textContent =
      _cur === _steps.length - 1 ? '完了 ✓' : '次へ →';
  }

  // ── リサイズ追従 ──────────────────────────────────────
  const _onResize = () => {
    if (document.getElementById('vp-tut-overlay')?.style.display !== 'none') _render();
  };
  window.addEventListener('resize', _onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _onResize);
    window.visualViewport.addEventListener('scroll', _onResize);
  }
})();
