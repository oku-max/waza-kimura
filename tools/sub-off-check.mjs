// 字幕をOFFにしたら画面から消えるか — 「消し忘れ」を作る書き方が復活していないか見る。
//
// なぜ必要か（v52.739 で直した不具合）:
//   字幕の描画は「前回描いた内容」と比べて、同じなら描き換えない作りになっている。
//   その「前回」を '' でリセットしていたため、OFF にしたときに
//     リセット('') → 今回描くべき内容('') → 同じなので描き換えない
//   となり、最後に出ていた字幕が画面に残り続けた。
//   '' は「字幕なしを描いた」という意味の値なので、「次は必ず描き直す」の合図には使えない。
//   合図は null でなければならない。
//
// この間違いはブラウザを立ち上げても、字幕ファイルのあるDrive動画を再生しないと踏めない。
// 静的に見ておけば、同じ書き方が戻ってきた時にここで止まる。
//
// 使い方: node tools/sub-off-check.mjs
// 終了コード: 0 = 問題なし / 1 = あり

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js', 'vpanel.js'), 'utf8');

const problems = [];
const lines = src.split('\n');

// 対象: 直前に描いた内容を覚えている変数
const VARS = ['_gdSubLastHtml', '_ytSubLastHtml'];

for (const v of VARS) {
  // 1) 宣言時の初期値は null であること
  const decl = lines.findIndex(l => new RegExp(`^\\s*let\\s+${v}\\b`).test(l));
  if (decl < 0) { problems.push(`${v} の宣言が見つかりません（名前を変えたならこの検査も直すこと）`); continue; }
  if (!/=\s*null/.test(lines[decl])) {
    problems.push(`${v}: 宣言の初期値が null ではありません（${decl + 1}行目）\n    ${lines[decl].trim()}`);
  }

  // 2) '' や "" でリセットしていないこと（描き換え判定と同じ値なのでOFFで消えなくなる）
  lines.forEach((l, i) => {
    if (new RegExp(`${v}\\s*=\\s*(''|"")`).test(l)) {
      problems.push(`${v}: '' でリセットしています（${i + 1}行目）。null にしてください\n    ${l.trim()}`);
    }
  });

  // 3) 「同じなら描かない」判定がちゃんと残っていること（判定ごと消すのも直し方としては誤り）
  const hasGuard = lines.some(l => new RegExp(`!==\\s*${v}`).test(l));
  if (!hasGuard) problems.push(`${v}: 再描画を避ける比較が見当たりません（作りが変わったなら検査も更新すること）`);
}

if (problems.length) {
  console.log('✗ 字幕OFFで消えなくなる書き方が見つかりました:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('✓ 字幕の「前回描いた内容」の扱いは問題なし（OFFで消える）');
