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

  // どこから中身を読むか（Notion 項目15）
  //
  //   テンプレの中身  … admin-dashboard で育てる（waza_positions / waza_tag_dict）
  //   検索辞書        … tag-master.js の POSITIONS / CATEGORIES（項目02・別物）
  //
  // この2つは同じ27ポジションから始まっているが、役割もスキーマも違う。
  //   テンプレ側: { id, names:{ja,en}, group, aliases:{ja,en} }
  //   辞書側:     { id, ja, en, aliases:[] }
  // テンプレは「ユーザーが選択肢に入れる見本」なので、育てる場所である
  // テンプレ側を先に読む。まだ何も育てていなければ辞書の名前で代用する。
  // 辞書そのものは検索用として手を触れない。
  function _fromStore(key, pick) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return null;
      const names = arr.map(pick).filter(Boolean);
      return names.length ? names : null;
    } catch (e) { return null; }
  }
  const TEMPLATES = [
    {
      id: 'pos',
      name: 'ポジション',
      desc: 'クローズド、デラヒーバ、ハーフ…',
      values: () => _fromStore('waza_positions', p => p && p.names && p.names.ja)
                  || (window.POSITIONS || []).map(p => p.ja).filter(Boolean)
    },
    {
      id: 'cat',
      name: '動作の種類',
      desc: 'パスガード、スイープ、フィニッシュ…',
      values: () => _fromStore('waza_tag_dict', c => c && ((c.names && c.names.ja) || c.name))
                  || (window.CATEGORIES || []).map(c => c.name).filter(Boolean)
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
