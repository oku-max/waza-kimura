// ═══ タグの候補が「ユーザーの選択肢」から出ているかの検査 ═══
// 使い方: node tools/tag-source-check.mjs
//
// なぜ要るか:
//   タグはユーザー定義がすべて。固定の値は無い（オーナー 2026-09-25）。
//   ところが v52.826 まで、次の画面は組み込みの一覧（tag-master.js の TB_VALUES /
//   CATEGORIES / POSITIONS）を選択肢として読んでいた:
//     ・動画カード       … タグ1 はトップ/ボトム/スタンディング以外を黙って隠していた
//     ・整理モードの表    … 候補が組み込みの一覧。テンプレートから入れた値が出ない
//     ・動画パネル       … 組み込みの一覧を混ぜていたので、消した選択肢が戻ってきた
//     ・タグ付けウィザード … 候補が組み込みの一覧
//     ・選択肢の種入れ    … 空のグループに組み込みの一覧を流し込んでいた
//   組み込みの一覧は、日英の言い換えを引く検索用の辞書としてだけ残す。
//
//   静的な検査（ブラウザ不要）。名前が復活したら赤くなる。
import fs from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const read = f => fs.readFileSync(ROOT + f, 'utf8');
// コメントを除いたコード（// 行コメントと /* */）
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

let fail = 0;
const ck = (name, ok, detail) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '  → ' + detail : '')); if (!ok) fail++; };
const DICT = /\b(?:window\.)?(TB_VALUES|CATEGORIES|POSITIONS)\b/g;

console.log('── 候補を組み込みの一覧から作っていない ──');
for (const f of ['js/cards.js', 'js/organize.js', 'js/vpanel.js', 'js/tag-wizard.js']) {
  const hits = [...code(f).matchAll(DICT)].map(m => m[0]);
  ck(`${f} が組み込みの一覧を読んでいない`, hits.length === 0, [...new Set(hits)].join(', '));
}

console.log('\n── 選択肢の種入れ ──');
const st = code('js/settings.js');
const sample = (st.match(/function _sampleFor\([\s\S]*?\n\}/) || [''])[0];
ck('_sampleFor がある', !!sample);
ck('種は組み込みの一覧から作らない', sample && !DICT.test(sample), sample.slice(0, 200));
DICT.lastIndex = 0;
ck('種はそのユーザーの動画から作る', /window\.videos/.test(sample));
const tbDef = (st.match(/\{\s*key:'tb'[^}]*\}/) || [''])[0];
ck('タグ1 の初期の選択肢は空', /presets:\[\]/.test(tbDef), tbDef);
ck('自分で触ったグループには以後種を入れない（_presetAdd / _presetRemove が seeded を立てる）',
  /function _presetAdd[\s\S]*?seeded = true[\s\S]*?function _presetRemove[\s\S]*?seeded = true/.test(st));

console.log('\n── 動画に付いている値を黙って落とさない ──');
const tw = code('js/tag-wizard.js');
ck('ウィザード: 選択肢に無いタグ1 の値も出す', /tbValues\.indexOf\(existingTb\)\s*<\s*0\)\s*tbValues\.unshift\(existingTb\)/.test(tw));
ck('ウィザード: 選択肢に無いタグ2/3 の値も出す（_fillChipsWithExisting の extra）', /var extra = existArr\.filter/.test(tw));
ck('整理の表: 選択肢に無い値も先頭に出す', /const extra = current\.filter\(t => !allOpts\.includes\(t\)\)/.test(code('js/organize.js')));
ck('動画カード: タグ1 を組み込みの3つで絞らない', !/v\.tb\.filter\(/.test(code('js/cards.js')));

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
process.exit(fail ? 1 : 0);
