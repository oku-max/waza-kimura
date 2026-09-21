// ═══ WAZA KIMURA — タググループのテンプレート ═══
// Notion「タグシステム再考」項目04。
//
// 考え方:
//   タググループは4つ固定だが、名前も中身もユーザーが決める（項目03）。
//   ここにあるのは「押したら選択肢に入る」見本であって、システムが押し付けるものではない。
//
// 大事な決まり:
//   テンプレートは必ず「コピー」として渡す。参照にしない。
//   こちらがテンプレの中身を後から変えても、ユーザーが既に入れた選択肢は動かない。
//   （CLAUDE.md のデータ安全ルール「非空→空の上書き禁止」とも同じ向き）
(function () {
  'use strict';

  // 出典が tag-master.js の辞書にあるものは、そこから読む（同じ一覧を二重に持たない）。
  // 読むのは値だけで、辞書そのものは検索用として別に残る（項目02）。
  const TEMPLATES = [
    {
      id: 'pos',
      name: 'ポジション',
      desc: 'クローズド、デラヒーバ、ハーフ…',
      values: () => (window.POSITIONS || []).map(p => p.ja).filter(Boolean)
    },
    {
      id: 'cat',
      name: '動作の種類',
      desc: 'パスガード、スイープ、フィニッシュ…',
      values: () => (window.CATEGORIES || []).map(c => c.name).filter(Boolean)
    },
    {
      id: 'tb',
      name: '上下',
      desc: 'トップ / ボトム / スタンディング',
      values: () => (window.TB_VALUES || []).slice()
    },
    {
      id: 'practice',
      name: '練習ステータス',
      desc: '自由に作っていいことの見本',
      values: () => ['要復習', '試合で使う', 'できた']
    }
  ];

  // テンプレート一覧（表示用）。values は毎回新しい配列を返す。
  function tagTemplates() {
    return TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      values: t.values().slice()   // ← コピー。呼び出し側が書き換えても元に影響しない
    }));
  }

  // 1つ取り出す。無ければ null。
  function tagTemplate(id) {
    return tagTemplates().find(t => t.id === id) || null;
  }

  window.tagTemplates = tagTemplates;
  window.tagTemplate  = tagTemplate;
})();
