#!/usr/bin/env node
// ═══ 字幕生成の経路チェック ═══
// 使い方: node tools/sub-path-check.mjs
//
// なぜ要るか:
//   vpGenSubtitle の preset は「一括処理(bulk)の契約」で、
//   確認ダイアログを出さない／既存があれば飛ばす／既存の別言語から翻訳で済ませる
//   という一括専用の振る舞いを持つ。
//   自動チャプターから字幕を作る機能をこれに相乗りさせたため、
//   「言語を聞かないだけ」のつもりが、書き起こしをやり直すか既存を訳すかの選択まで
//   一括用に差し替わり、ユーザーがボタンを押した時と違う結果になっていた。
//
//   新しい入口を足す時は、既存の入口の挙動を変えないこと。
//   ここでは「一括専用の分岐が _subBulk() で囲われていること」を機械的に守る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// window.xxx = async function(...) 形式も拾う
const grab = (name) => {
  const i = src.search(new RegExp(`(?:window\\.)?${name}\\s*=\\s*(?:async )?function\\(|(?:async )?function ${name}\\(`));
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
};

// ── 1. 一括かどうかの判定が1箇所にある ──
/function _subBulk\(preset\)/.test(src)
  ? ok('_subBulk(preset) で一括判定を1箇所にまとめている')
  : fail('_subBulk が無い（preset の意味が呼び出し側ごとにばらける）');

// ── 2. 一括専用の分岐が素の preset で書かれていないか ──
// 一括だけの振る舞い＝確認を出さない・既存を飛ばす・既存から翻訳する。
// これらの判定に使う式が bare な preset に付いていたら、
// 「ボタンを押した時」まで巻き込んでいる。
const BULK_MARKS = [
  { re: /(?<!_subBulk\()\bpreset\s*\?\s*preset\.translate\s*!==\s*false/, what: '既存の別言語から翻訳するか' },
  { re: /if \(preset\)\s*\{\s*if \(preset\.existing/,                      what: '既存字幕があった時に飛ばすか' },
  { re: /if \(preset && preset\.existing !== 'replace'\)/,                 what: 'ASRの事前判定（飛ばす／翻訳で済ませる）' },
];
for (const { re, what } of BULK_MARKS) {
  re.test(src) ? fail(`${what}: 素の preset で分岐している（_subBulk で囲うこと）`)
               : ok(`${what}: _subBulk で囲われている`);
}

// ── 3. 自動チャプターからの呼び出しは「押した時と同じ」経路を使う ──
const chap = grab('vpGenChapters');
if (!chap) fail('vpGenChapters が見つからない');
else {
  const call = chap.match(/vpGenSubtitle\(id,\s*\{[\s\S]*?\}\)/);
  if (!call) fail('vpGenChapters から vpGenSubtitle を呼んでいない（経路が変わったら検査を見直す）');
  else if (!/interactive:\s*true/.test(call[0]))
    fail('自動チャプターからの字幕生成が interactive: true を渡していない（一括の挙動になる）');
  else if (/existing:/.test(call[0]))
    fail('自動チャプターからの呼び出しに existing: が残っている（一括用の指定）');
  else ok('自動チャプターからの字幕生成は interactive: true（押した時と同じ経路）');
}

// ── 4. 一括処理(bulk.js)は従来どおり preset のまま ──
const bulk = fs.readFileSync(path.join(ROOT, 'js/bulk.js'), 'utf8');
/vpGenSubtitle\?\.\([^)]*existing:/.test(bulk.replace(/\n/g, ' '))
  ? ok('一括処理は従来どおり existing: を渡している')
  : fail('一括処理の呼び出しが変わっている（既存字幕の扱いが変わっていないか確認）');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 字幕生成の経路は、入口が増えても押した時の挙動を変えていない');
process.exit(ng ? 1 : 0);
