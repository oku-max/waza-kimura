// ═══ WAZA KIMURA — 経過日数の表示 ═══
// 旧「練習/視聴 カウンター」（動画ごとの v.practice・practiceLog・lastPracticed を数える
// パネルのステッパー・カードのバッジ・表の「カウント」列・進捗ランク／最終カウント日の絞り込み）は
// v52.890 で廃止した（オーナー「古い、使ってない」）。数えるのはカスタム列の「± カウンター」。
// 保存済みの v.practice / practiceLog / lastPracticed は消さない（読まない・書かないだけ）。
// ここに残すのは、カスタム列のカウンターが使う「最後に数えた日」の書き方だけ。
(function () {
  'use strict';
  window.vpCntFormatAgo = function (ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const d = Math.floor(diff / 86400000);
    if (d <= 0) return '今日';
    if (d === 1) return '昨日';
    if (d < 7) return d + 'd前';
    if (d < 30) return Math.floor(d / 7) + 'w前';
    if (d < 365) return Math.floor(d / 30) + 'mo前';
    return Math.floor(d / 365) + 'y前';
  };
})();
