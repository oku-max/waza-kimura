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
// tag-templates.js はテンプレート名の一覧（見本の名前）であって、画面が出すグループ名ではない。
// グループ名はユーザーが付けるもの、テンプレ名は「ポジション入れますか」の見本の名前で、別物。
const SKIP = new Set(['js/i18n.js', 'js/tag-master.js', 'js/notes.js', 'js/ai-tagging.js',
                      'js/admin-dashboard.js', 'js/tag-templates.js']);
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
[['POSITIONS', 'ポジション辞書'], ['CATEGORIES', 'カテゴリ辞書'], ['SEARCH_DICT', '検索辞書']]
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

// ── 3b. テンプレートが消えていないこと（項目04の保険）────────
const tt = read('js/tag-templates.js');
/function tagTemplates\(/.test(tt) && /window\.tagTemplates\s*=/.test(tt)
  ? ok('テンプレート tagTemplates() が残って公開されている')
  : fail('tagTemplates() が消えている（テンプレートから選択肢を入れられなくなる）');
/\.slice\(\)/.test(tt)
  ? ok('テンプレートはコピーで渡している')
  : fail('tag-templates.js に slice() が無い（参照渡しだとユーザー操作でテンプレが削れる）');
// v52.812（案A）で、テンプレートは「押したら丸ごと入る」のをやめた。
// 中身を見せて、入れるものを選ばせてから足す（_tmTplApply）。
/_tmTplApply/.test(settings)
  ? ok('設定画面がテンプレートを適用できる')
  : fail('_tmTplApply() が settings.js から消えている（テンプレートから選択肢を入れられない）');
/_tmPickVal/.test(settings) && /_tmTplPeek/.test(settings)
  ? ok('★ テンプレートは中身を見て選んでから入れる')
  : fail('中身を見る(_tmTplPeek)／選ぶ(_tmPickVal)が無い。中身を見ずに丸ごと入る作りに戻っている');
/function tagTemplateRename\(/.test(tt) && /function tagTemplateDelete\(/.test(tt) && /function tagTemplateCreate\(/.test(tt)
  ? ok('★ テンプレートそのものを編集できる（名前・削除・新規）')
  : fail('tag-templates.js に編集の入口が無い');
/function getTagTemplatesRaw\(/.test(tt) && /function applyRemoteTagTemplates\(/.test(tt)
  ? ok('編集したテンプレートがクラウドと行き来する')
  : fail('テンプレートの同期口（getTagTemplatesRaw / applyRemoteTagTemplates）が無い');

// ── 3c. 検索辞書を育てる経路（項目16）────────────────────────
// 2026-09-25 までは alias-builder.html が「別名を足す唯一の経路」だった。
// だが別名（tag_master.aliases）は v52.821 で検索から切り離され、
// タグ候補も v52.828 でユーザーの選択肢から作るようになり、誰も読まなくなった。
// いま辞書を育てる場所は js/tag-master.js の SEARCH_DICT に行を足すこと。
// Aliasビルダーは v52.832 で画面ごと削除した（検査もここで直す）。
const tmSrc = read('js/tag-master.js');
/const SEARCH_DICT = \[/.test(tmSrc)
  ? ok('検索辞書 SEARCH_DICT が残っている（辞書を育てる場所）')
  : fail('SEARCH_DICT が消えている');
fs.existsSync(path.join(ROOT, 'alias-builder.html'))
  ? fail('alias-builder.html が復活している（別名は検索に使わない。SEARCH_DICT に行を足す）')
  : ok('Aliasビルダーは消えたまま（別名で検索が広がる経路が戻っていない）');

// ── 4. ユーザーが付けた名前を翻訳しないこと（項目10）──────────
/\[data-user-text\]/.test(read('js/i18n.js'))
  ? ok('i18n がユーザーの付けた名前を翻訳対象から外している')
  : fail('i18n の除外条件に [data-user-text] が無い（改名した名前が訳される）');

console.log(ng === 0 ? '\n✅ タググループ名まわり: 問題なし' : `\n❌ 失敗 ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
