#!/usr/bin/env node
// ═══ タググループ名の取り出し方の検査 ═══
// 使い方: node tools/tag-label-check.mjs
//
// なぜ要るか:
//   タググループは4つ固定だが、名前も中身もユーザーが自由に決める。
//   ところが 2026-09-21 時点で、設定で名前を書き換えても画面の大半に反映されなかった。
//   tagSettings[i].label を読んでいたのは settings.js 自身と、data-tag-key を持つ
//   静的要素（applyTagLabels）だけで、動的に描画される16箇所が日本語を直書きしていた。
//   「一部の画面だけ古い名前が出る」という、CLAUDE.md に記録済みの故障パターンそのもの。
//
//   同じことが再発するのは「新しくタグを表示する場所を足したとき」なので、
//   取り出しが tagLabel() に集約されたままかを機械で見張る。
//
//   あわせて、AI分類器を消す作業で検索辞書（日英ブリッジ）を巻き込んで消していないかも見る。
//   辞書はタグ体系とは別物で、動画に1つもタグが無くても効く検索の土台（Notion 項目02）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// ── 1. 取り出しが1か所にあること ─────────────────────────
const settings = read('js/settings.js');
[['tagGroups', 'グループ一覧'], ['tagLabel', 'グループ名'], ['tagLabelShort', '短縮名'], ['tagVisible', '表示可否']]
  .forEach(([fn, what]) => {
    new RegExp(`export function ${fn}\\s*\\(`).test(settings)
      ? ok(`${what}の取り出しは ${fn}() に集約されている`)
      : fail(`${fn}() が settings.js から消えている（${what}の取り出し口）`);
  });

const html = read('index.html');
['tagGroups', 'tagLabel', 'tagLabelShort', 'tagVisible'].forEach(fn => {
  new RegExp(`window\\.${fn}\\s*=`).test(html)
    ? ok(`${fn}() が window に公開されている`)
    : fail(`window.${fn} が index.html で公開されていない`);
});

// ── 2. 画面がグループ名を直書きしていないこと ─────────────
// 旧デフォルト名。ユーザーが自由に決める以上、画面側がこれを書いてはいけない。
const BANNED = ['トップ/ボトム/スタンディング', 'トップ/ボトム/スタン'];
// 単独で現れたらアウトの語（他の意味でも使うので、クォートで囲まれた文字列だけを見る）
const BANNED_QUOTED = ['カテゴリ', 'ポジション', 'テクニック', 'TOP/BOTTOM'];
// 除外: 辞書そのもの / 翻訳表 / ノートのカテゴリ（別物） / AI分類器（項目01で消える）
const SKIP = new Set(['js/i18n.js', 'js/tag-master.js', 'js/notes.js', 'js/ai-tagging.js', 'js/admin-dashboard.js']);
const TARGETS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['index.html']);

let hits = [];
for (const f of TARGETS) {
  if (SKIP.has(f)) continue;
  const src = read(f);
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('<!--')) return; // コメントは見ない
    for (const b of BANNED) if (line.includes(b)) hits.push(`${f}:${i + 1}  ${b}`);
    for (const b of BANNED_QUOTED) {
      if (new RegExp(`['"\`]${b}['"\`]`).test(line)) hits.push(`${f}:${i + 1}  '${b}'`);
    }
  });
}
hits.length === 0
  ? ok('画面のコードにグループ名の直書きが無い')
  : fail(`グループ名の直書きが ${hits.length} 件残っている（tagLabel() を使うこと）\n      ` + hits.join('\n      '));

// ── 3. 検索辞書が消えていないこと（項目02の保険）────────────
const tm = read('js/tag-master.js');
[['POSITIONS', 'ポジション辞書'], ['CATEGORIES', 'カテゴリ辞書'], ['TECHNIQUE_BUILTIN', '技名辞書']]
  .forEach(([name, what]) => {
    new RegExp(`const ${name}\\s*=\\s*\\[`).test(tm)
      ? ok(`${what}（${name}）が残っている`)
      : fail(`${what}（${name}）が tag-master.js から消えている`);
  });
/function aliasNamesFor\(/.test(tm) && /window\.aliasNamesFor\s*=/.test(tm)
  ? ok('日英ブリッジ aliasNamesFor() が残って公開されている')
  : fail('aliasNamesFor() が消えている（「デラヒーバ」で英語タイトルが当たらなくなる）');
/aliasNamesFor/.test(read('js/organize.js'))
  ? ok('検索が aliasNamesFor() を呼んでいる')
  : fail('organize.js が aliasNamesFor() を呼んでいない（辞書が検索に効かない）');

// ── 4. ユーザーが付けた名前を翻訳しないこと（項目10）──────────
/\[data-user-text\]/.test(read('js/i18n.js'))
  ? ok('i18n がユーザーの付けた名前を翻訳対象から外している')
  : fail('i18n の除外条件に [data-user-text] が無い（改名した名前が訳される）');

console.log(ng === 0 ? '\n✅ タググループ名まわり: 問題なし' : `\n❌ 失敗 ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
