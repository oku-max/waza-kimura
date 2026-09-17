#!/usr/bin/env node
// ═══ 自動チャプターからの字幕生成の呼び方チェック ═══
// 使い方: node tools/chap-sub-check.mjs
//
// なぜ要るか:
//   vpGenSubtitle の第2引数 preset は「一括処理(bulk)の契約」で、
//   確認ダイアログを出さない／既存があれば飛ばす／既存の別言語から翻訳で
//   済ませる、という一括専用の挙動を持つ。
//   自動チャプターから字幕を作る時にこれを渡したところ、
//   「言語を聞かないだけ」のつもりが、ボタンを押した時とまったく違う結果に
//   なり、そこから連鎖して字幕そのものを壊した。
//   自動チャプター側は「ボタンを押すのと同じこと」だけをする薄い入口に徹する。
// 何を守るか:
//   1. vpGenChapters からの呼び出しは引数なし（preset を渡さない）
//   2. 字幕生成の本体には手を入れていない
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

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

// ── 1. 自動チャプターからの呼び出しは引数なし ──
const chap = grab('vpGenChapters');
if (!chap) fail('vpGenChapters が見つからない');
else {
  const calls = [...chap.matchAll(/vpGenSubtitle\s*\(([^)]*)\)/g)].map(m => m[1].trim());
  if (!calls.length) fail('vpGenChapters から vpGenSubtitle を呼んでいない（経路が変わったらこの検査を見直す）');
  else for (const args of calls) {
    args === 'id'
      ? ok('vpGenChapters → vpGenSubtitle(id)（ボタンを押したのと同じ処理）')
      : fail(`vpGenChapters → vpGenSubtitle(${args}) : preset を渡している。`
           + '一括処理用の挙動に差し替わり、押した時と違う結果になる');
  }
}

// ── 2. 依存は一方向であること ──
// 字幕生成の本体を過去のコミットと比較する検査も考えたが、字幕側の正当な修正
// （書式の正規化など）でも落ちてしまい、意味のある信号にならない。
// 守るべきは「チャプターが字幕を呼ぶ。字幕はチャプターを知らない」という向きなので、
// 字幕側にチャプターの都合が入り込んでいないかを見る。
for (const fn of ['vpGenSubtitle', '_ytGenSubtitle', '_asrGenerateAndSave', '_translateSrtText']) {
  const body = grab(fn);
  if (!body) { fail(`${fn} が見つからない`); continue; }
  const hits = ['vpGenChapters', 'chapOpts', '_chapGrain', 'チャプター']
    .filter(w => body.includes(w));
  hits.length
    ? fail(`${fn} にチャプターの都合が入り込んでいる（${hits.join(', ')}）。依存は一方向に保つ`)
    : ok(`${fn} はチャプターを知らない`);
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 自動チャプターは字幕生成を「押したのと同じ」に呼んでいる');
process.exit(ng ? 1 : 0);
