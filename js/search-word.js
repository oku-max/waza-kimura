// ═══ ワード検索の語は1つ。読む場所を1か所にする ═══
//
// なぜ必要か（2026-09-27）:
// 画面の🔍欄は1つなのに、ビューごとに別の入力欄から語を読んでいた。
//   カード表示 (js/filter.js filt)      → si / si-lib-pc
//   テーブル表示 (js/organize.js orgFilt) → si-org / si-org-pc
//   カスタムリストの表 (js/custom-view.js) → _cvSrchQ（モジュール内の変数）
// 語を入れた経路によって、その3つのどれかにしか入らない。結果、同じリスト・同じ語で
// 「テーブルには出るのにカードは0本」になる。実測: 「-quick」を si-lib-pc にだけ入れた状態で
//   カード 2本 / テーブル 4本（テーブルは -quick を見ていない）。
// タグの呼び名を js/tag-filter.js に集めたのと同じ理由（v52.852）。読む場所が散ると、
// 1か所古いだけで絞り込みが黙って効かない。
//
// ここは画面の状態だけを扱う。localStorage / Firestore / 動画データには一切書かない。
(function () {
  'use strict';

  // 優先順に見る。どれかに語があればそれが「今の語」。
  const IDS = ['si-lib-pc', 'si', 'si-org-pc', 'si-org'];
  const _el = id => document.getElementById(id);

  // 今の検索語（読むだけ）
  function get() {
    for (const id of IDS) {
      const e = _el(id);
      const v = e && typeof e.value === 'string' ? e.value.trim() : '';
      if (v) return v;
    }
    return '';
  }

  // 検索語を入れる（画面の入力欄すべてと、カスタムリストの表に同じ語を配る）。
  // opts.silent = true のとき、カスタムリストの再描画を呼ばない（呼び出し元が描くとき）
  function set(q, opts) {
    const s = String(q == null ? '' : q).trim();
    for (const id of IDS) { const e = _el(id); if (e && e.value !== s) e.value = s; }
    // カスタムリストの表は自前の変数で持っているので、そこにも配る
    if (!(opts && opts.silent)) window._cvSetSearchQ?.(s);
    const c = _el('si-clear');
    if (c) c.style.display = s ? 'flex' : 'none';
    return s;
  }

  window.wkSearchWord    = get;
  window.wkSetSearchWord = set;
})();
