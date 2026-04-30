// tutorial.js — Vpanel ハイライトチュートリアル
// getBoundingClientRect() はビジュアルビューポート基準。
// position:fixed のオーバーレイはブラウザズーム・フォントサイズ変更では自動一致するが、
// モバイルのピンチズーム時はレイアウト/ビジュアルビューポートがずれる。
// visualViewport.offsetLeft/Top でオーバーレイ位置を補正して常に一致させる。

(function () {
  // ── 定数 ──────────────────────────────────────────────
  const TW  = 280;   // ツールチップ幅
  const TH  = 240;   // ツールチップ高さ（max-height:45vh と合わせた上限見積もり）
  const GAP = 14;    // リングとツールチップの隙間
  const PAD = 8;     // 画面端マージン
  const P   = 6;     // リング余白

  // ── Visual Viewport ヘルパー ──────────────────────────
  // ブラウザズーム・フォントサイズ変更: getBoundingClientRect() が
  // CSS px 基準で補正済みの値を返すため追加処理不要。
  // ピンチズーム(モバイル): visualViewport.offsetLeft/Top で補正。
  const vv   = () => window.visualViewport;
  const vvW  = () => vv()?.width        ?? window.innerWidth;
  const vvH  = () => vv()?.height       ?? window.innerHeight;
  const vvOX = () => vv()?.offsetLeft   ?? 0;
  const vvOY = () => vv()?.offsetTop    ?? 0;

  // ── ステップ定義 ─────────────────────────────────────
  // openVPanel 完了時に video ID が window.openVPanelId に入る想定。
  // 動的 ID (bm/memo/tag/notes/ai) は tutStart() 時点で解決する。
  function buildSteps() {
    const vid = window.openVPanelId || '';
    return [
      { id: 'vpanel-title-area',    title: '動画ナビゲーション', desc: '⏮ ⏭ で前後の動画に移動。☰ で次の動画リストを表示できます。' },
      { id: 'vpanel-skip-area',     title: 'スキップボタン',    desc: 'ボタンを押すと指定秒数だけ早送り・巻き戻し。技の直前に素早く戻るときに便利です。' },
      { id: 'vpanel-ab-area',       title: 'A-B ループ',        desc: 'A・B で区間を指定して繰り返し再生。技の細かい動きをじっくり確認できます。' },
      { id: `vp-bm-section-${vid}`, title: 'ブックマーク',      desc: '重要シーンのタイムスタンプを記録。タップするとその場面に移動します。' },
      { id: `vp-memo-row-${vid}`,   title: 'メモ',             desc: '気づき・次に試すこと・ポイントを自分の言葉で書き留めましょう。' },
      { id: `vp-tag-fsec-${vid}`,   title: 'タグ・習得度',     desc: 'ポジション・技名でタグ付け。トップ/ボトム/カテゴリ/テクニックで整理できます。' },
      { id: `vp-notes-row-${vid}`,  title: 'Notes に追加',     desc: 'この動画をノートに紐づけて、気づきや課題をまとめて管理できます。' },
      { id: 'vp-ai-tag-btn',        title: 'AIタグ提案',       desc: 'AIが動画タイトルを分析してタグを自動提案。採用したいものだけ選んで適用できます。' },
    ];
  }

  // ── 状態 ─────────────────────────────────────────────
  let _cur   = 0;
  let _steps = [];

  // ── ピンチズーム判定 ─────────────────────────────────
  // デスクトップのブラウザズーム(Ctrl+/-)はピンチズームではない。
  // getBoundingClientRect() は常に CSS px 基準で zoom 補正済みのため
  // デスクトップでは CSS `position:fixed; inset:0` だけで完全一致する。
  // JS で overlay の left/top/width/height を上書きするとむしろズレる。
  // ピンチズーム(モバイル)だけ visualViewport.offset で補正する。
  function _isPinchZoomed() {
    const v = vv();
    if (!v) return false;
    return Math.abs(v.offsetLeft) > 1 || Math.abs(v.offsetTop) > 1;
  }

  // ── オーバーレイをビジュアルビューポートに同期 ──────
  function _syncOverlay() {
    const o = document.getElementById('vp-tut-overlay');
    if (!o) return;
    if (_isPinchZoomed()) {
      // モバイルのピンチズーム: overlay を visual viewport に追従
      o.style.left   = vvOX() + 'px';
      o.style.top    = vvOY() + 'px';
      o.style.width  = vvW()  + 'px';
      o.style.height = vvH()  + 'px';
    } else {
      // デスクトップ / 通常: CSS `position:fixed; inset:0` に完全に任せる
      o.style.left = o.style.top = o.style.width = o.style.height = '';
    }
  }

  // ── 公開 API ─────────────────────────────────────────
  window.vpStartTutorial = function () {
    _steps = buildSteps();
    const o = document.getElementById('vp-tut-overlay');
    if (!o) return;
    o.style.display = 'block';
    o.classList.add('active');
    _cur = 0;
    _render();
  };

  window.vpEndTutorial = function () {
    const o = document.getElementById('vp-tut-overlay');
    if (!o) return;
    o.style.display = 'none';
    o.classList.remove('active');
  };

  window.vpTutGo = function (d) {
    if (d > 0 && _cur === _steps.length - 1) { window.vpEndTutorial(); return; }
    _cur = Math.max(0, Math.min(_steps.length - 1, _cur + d));
    _render();
  };

  // ── 描画 ─────────────────────────────────────────────
  function _render() {
    _syncOverlay();

    const s  = _steps[_cur];
    const el = document.getElementById(s.id);

    // 要素が存在しない場合はそのステップをスキップ
    if (!el) { window.vpTutGo(1); return; }

    // スクロールアウト要素を即座に表示域に戻す（同期スクロール）
    el.scrollIntoView({ behavior: 'instant', block: 'nearest' });

    // 座標取得。getBoundingClientRect() は常に viewport 基準 CSS px。
    // ブラウザズーム(Ctrl+/-)でも自動補正済みなので追加処理不要。
    const r     = el.getBoundingClientRect();
    const pinch = _isPinchZoomed();
    // ピンチズーム時のみ overlay が vvOffset 分ずれるので補正、それ以外は 0
    const ox = pinch ? vvOX() : 0;
    const oy = pinch ? vvOY() : 0;
    const W  = pinch ? vvW()  : window.innerWidth;
    const H  = pinch ? vvH()  : window.innerHeight;

    // リング位置: overlay 内座標 = viewport座標 - overlay原点
    const ring = document.getElementById('vp-tut-ring');
    ring.style.left   = (r.left - ox - P)  + 'px';
    ring.style.top    = (r.top  - oy - P)  + 'px';
    ring.style.width  = (r.width  + P * 2) + 'px';
    ring.style.height = (r.height + P * 2) + 'px';

    // ツールチップ上下: 空きスペースが大きい方に配置
    const elTop    = r.top    - oy;
    const elBottom = r.bottom - oy;
    let ty;
    if      (H - elBottom >= TH + GAP) { ty = elBottom + GAP; }
    else if (elTop         >= TH + GAP) { ty = elTop - TH - GAP; }
    else { ty = (H - elBottom) >= elTop ? elBottom + GAP : elTop - TH - GAP; }
    ty = Math.max(PAD, Math.min(H - TH - PAD, ty));

    // ツールチップ左右: ターゲット中央揃え、viewport内に収める
    let tx = (r.left - ox) + r.width / 2 - TW / 2;
    tx = Math.max(PAD, Math.min(W - TW - PAD, tx));

    const tip = document.getElementById('vp-tut-tip');
    tip.style.left = tx + 'px';
    tip.style.top  = ty + 'px';

    // テキスト更新
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

  // ── リサイズ・ズーム・ピンチ追従 ────────────────────
  // resize: ブラウザズーム・フォントサイズ変更・画面回転すべてをカバー
  // visualViewport resize/scroll: モバイルのピンチズーム・キーボード出現をカバー
  const _onResize = () => {
    if (document.getElementById('vp-tut-overlay')?.style.display !== 'none') _render();
  };
  window.addEventListener('resize', _onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _onResize);
    window.visualViewport.addEventListener('scroll', _onResize);
  }
})();
