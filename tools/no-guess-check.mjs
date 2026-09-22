#!/usr/bin/env node
// ═══ タグを推測していないことの検査 ═══
// 使い方: node tools/no-guess-check.mjs
//
// なぜ要るか:
//   2026-09-22、オーナーの画面に「🤖 自動判別 AIにおまかせ」が残っていた。
//   AI分類器（LLM）は v52.806 で消していたが、消えたのはそちらだけで、
//   タイトルのキーワードから当てる autoTagFromTitle() は tag-master.js に健在で、
//   取り込み経路9箇所から呼ばれていた。さらに firebase.js が**ログインのたびに**
//   retagAllFromTitle() を呼び、ユーザーの動画に推定タグを書き込んでいた。
//   「消したつもり」で消えていなかった典型。
//   オーナーの言葉:「キーワード推定は不完全だから不要」。
//
//   同じものが戻ってこないように、名前と経路を機械で見張る。
//   検索辞書（Notion 項目02）は別物なので、そちらが消えていないことも同時に見る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// コメントは見ない（「廃止した」と書いてあるのを検出してしまうため）
const strip = (src) => src
  .split('\n')
  .filter(l => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')); })
  .join('\n');

// ── 1. 推定エンジンが存在しないこと ──────────────────
console.log('── 推測する仕組みが残っていないか ──');
const GONE = [
  ['autoTagFromTitle',  'タイトルからタグを当てる関数'],
  ['retagAllFromTitle', '既存動画への一括推定タグ付け'],
  ['_detectCatFromText','テキストからカテゴリを当てる関数'],
  ['REVERSAL_TRIGGERS', 'TB判定の反転トリガー'],
];
const SRC = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
  .concat(['index.html', 'alias-builder.html', 'tag-master-view.html', 'dev-server.js']);
for (const [name, what] of GONE) {
  const hits = [];
  for (const f of SRC) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    strip(read(f)).split('\n').forEach((l, i) => { if (l.includes(name)) hits.push(`${f}:${i + 1}`); });
  }
  hits.length === 0
    ? ok(`${name}（${what}）が残っていない`)
    : fail(`${name} が ${hits.length}箇所 残っている → ${hits.slice(0, 6).join(' / ')}`);
}

// ── 2. 取り込み経路が勝手にタグを付けないこと ────────
console.log('\n── 取り込みが勝手にタグを付けないか ──');
const IMPORT_PATHS = ['js/yt-search.js', 'js/youtube.js', 'js/gdrive.js', 'js/gd-upload.js', 'js/video-audit.js'];
let dirty = [];
for (const f of IMPORT_PATHS) {
  const src = strip(read(f));
  if (/autoTagFromTitle|_suggestTags|guessTag/.test(src)) dirty.push(f);
}
dirty.length === 0
  ? ok('取り込み5経路が推定を呼んでいない')
  : fail(`推定を呼んでいる経路がある → ${dirty.join(' / ')}`);

// ログイン時に動画へ書き込まないこと
/retagAllFromTitle/.test(strip(read('js/firebase.js')))
  ? fail('firebase.js がログイン時に一括再タグ付けを呼んでいる（ユーザーの動画に書き込む）')
  : ok('★ ログイン時に動画へ推定タグを書き込まない');

// ── 3. 取り込み画面の選択肢が2つであること ──────────
console.log('\n── 取り込み画面の「タグの付け方」──');
const idx = read('index.html');
/data-mode="ai"/.test(idx)
  ? fail('「🤖 自動判別」ボタンが残っている')
  : ok('★ 「自動判別」の選択肢が無い');
const modes = [...idx.matchAll(/data-mode="(\w+)"/g)].map(m => m[1]);
const uniq = [...new Set(modes)].sort();
JSON.stringify(uniq) === JSON.stringify(['manual', 'none'])
  ? ok(`選択肢は2つだけ（${uniq.join(' / ')}）`)
  : fail(`選択肢が想定と違う → ${JSON.stringify(uniq)}`);
/let itagMode = 'none';/.test(idx)
  ? ok('★ 既定は「タグなし」（何も付けない）')
  : fail("既定モードが 'none' でない（黙ってタグが付く）");

// ── 4. 検索辞書は消えていないこと（Notion 項目02）────
console.log('\n── 検索辞書は別物。消えていないか ──');
const tm = read('js/tag-master.js');
for (const [name, what] of [['POSITIONS', 'ポジション辞書'], ['CATEGORIES', 'カテゴリ辞書'],
                            ['TECHNIQUE_BUILTIN', '技名辞書']]) {
  new RegExp(`const ${name}\\s*=\\s*\\[`).test(tm)
    ? ok(`${what}（${name}）が残っている`)
    : fail(`${what} を巻き込んで消している`);
}
for (const fn of ['findPosition', 'findCategory', 'aliasNamesFor', 'matchPosition', 'matchCategory']) {
  new RegExp(`window\\.${fn}\\s*=`).test(tm)
    ? ok(`${fn}() が公開されている`)
    : fail(`${fn}() が消えている（検索が効かなくなる）`);
}
/aliasNamesFor/.test(read('js/organize.js'))
  ? ok('検索が辞書を使っている')
  : fail('organize.js が辞書を使っていない');

console.log(ng === 0 ? '\n✅ タグを推測していない: 問題なし' : `\n❌ 失敗 ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
