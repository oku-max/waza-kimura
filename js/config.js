// ═══ WAZA KIMURA — 定数定義 ═══
// 旧タグ定数(TB_TAGS/AC_TAGS/POS_TAGS/TECH)は削除済み
// 全てのタグ定義は tag-master.js (TB_VALUES/CATEGORIES/POSITIONS) に一本化

// ── 習得度(status)の正準化・順序（一元管理 v52.559）──
// 正準値: 未着手 / 理解 / 練習中 / マスター
// 旧表記の互換: 把握→理解, 習得中→練習中（保存データに残っていても表示・並び・絞り込みで吸収）
// 新しい習得度ロジックを書くときは必ずこの2つを使う（各ファイルでの再定義は禁止）。
window.STATUS_CANON = ['未着手', '理解', '練習中', 'マスター'];
window.normStatus = function (s) {
  if (s === '把握') return '理解';
  if (s === '習得中') return '練習中';
  return s || '未着手';
};
// 並び順用ランク。旧表記キーも同値で持たせ、生データ混在に耐える。
const _STATUS_ORDER = { '未着手': 0, '理解': 1, '把握': 1, '練習中': 2, '習得中': 2, 'マスター': 3 };
window.statusRank = function (s) { return _STATUS_ORDER[s] ?? 0; };
