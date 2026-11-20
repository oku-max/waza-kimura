#!/usr/bin/env node
// ═══ 自動チャプターと字幕生成の関係チェック（v53.022 から: チャプターは字幕を作らない） ═══
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

// ── 1. 自動チャプターは字幕を作らない（v53.022・オーナー「字幕がないと進めないものは、字幕がない時点では選べないようにする」）──
// 以前は字幕が無いまま「字幕から検出」を選ぶと、ここで vpGenSubtitle(id) を呼んでから検出へ進んでいた。
// いまは字幕が無ければ「字幕から検出」は選べず、字幕は AI のメニューの「字幕生成」から作る。
const chap = grab('vpGenChapters');
if (!chap) fail('vpGenChapters が見つからない');
else {
  /vpGenSubtitle\s*\(/.test(chap)
    ? fail('vpGenChapters が vpGenSubtitle を呼んでいる（字幕が無いときは「字幕から検出」を選べないはず）')
    : ok('vpGenChapters は字幕を作らない');
  /if \(via === 'sub' && !subs\.length\) return fail\(/.test(chap)
    ? ok('字幕が無いまま「字幕から検出」には進まない（念のための止め）')
    : fail('字幕が無いまま「字幕から検出」に進める');
}
{
  const src2 = grab('_askChapterSource') || '';
  const win = /hasSubs\s*\n?\s*\?\s*\{ v: 'sub'[^}]*\}\s*:\s*\{ v: 'sub'[^}]*disabled: true \}/.test(src2);
  const pop = /item\('sub', '字幕から検出', hasSubs \?[\s\S]*?, !hasSubs\)/.test(src2);
  win && pop ? ok('作り方の画面: 字幕が無ければ「字幕から検出」は押せない')
             : fail('作り方の画面: 字幕が無くても「字幕から検出」を押せる');
}

// ── 1.5 AI のメニューは薄い入口（v53.022）──
// 実行は、今までのボタンを押したのと同じ関数を、動画の id だけで呼ぶ（preset を渡さない）
{
  const ai = fs.readFileSync(path.join(ROOT, 'js/vp-ai.js'), 'utf8');
  [['vpGenSubtitle', /window\.vpGenSubtitle\?\.\(vid\)/], ['vpGenChapters', /window\.vpGenChapters\?\.\(vid\)/], ['vpSumRangeOpen', /window\.vpSumRangeOpen\?\.\(vid\)/]]
    .forEach(([fn, re]) => re.test(ai) ? ok(`AI → ${fn}(id)（ボタンを押したのと同じ処理）`) : fail(`AI から ${fn} を id だけで呼んでいない`));
}

// ── 2. 依存は一方向であること ──
// 字幕生成の本体を過去のコミットと比較する検査も考えたが、字幕側の正当な修正
// （書式の正規化など）でも落ちてしまい、意味のある信号にならない。
// 守るべきは「チャプターが字幕を呼ぶ。字幕はチャプターを知らない」という向きなので、
// 字幕側にチャプターの都合が入り込んでいないかを見る。
for (const fn of ['vpGenSubtitle', '_vpGenSubtitleBody', '_ytGenSubtitle', '_asrGenerateAndSave', '_translateSrtText', '_askSubtitleLang']) {
  const body = grab(fn);
  if (!body) { fail(`${fn} が見つからない`); continue; }
  const hits = ['vpGenChapters', 'chapOpts', '_chapGrain', 'チャプター']
    .filter(w => body.includes(w));
  hits.length
    ? fail(`${fn} にチャプターの都合が入り込んでいる（${hits.join(', ')}）。依存は一方向に保つ`)
    : ok(`${fn} はチャプターを知らない`);
}


// ── 既存のブックマークをどうするか（v52.944・オーナー
//    「すでにブックマークが入ってる時は、上書きか追加を選べるように」）──
// ここは消す操作なので、既定は必ず「追加」（消さない方）であること、
// 消すときは何件消えるか（手で作った分を含めて）を画面に出すことを見張る。
/let _chapMode = 'add';/.test(src)
  ? ok('既定は「追加する」（既存のブックマークを消さない）')
  : fail('既定が消す方になっている');
/if \(sel\.replaceAll\)\s+v\.bookmarks = \[\];\n\s*else if \(sel\.replaceAuto\)/.test(src)
  ? ok('消すのは選ばれたときだけ（追加では1件も消さない）')
  : fail('ブックマークを勝手に消している');
/all:\s+`いまの\$\{bmCount\}件を全部消してから入れます（手で作った\$\{handCount\}件も消えます）`/.test(src)
  ? ok('全部入れ替えは、消える件数を手で作った分まで出す')
  : fail('何件消えるか画面に出していない');
/replaceAll: !!preset\.replaceAll/.test(src)
  ? ok('一括処理では preset が明示したときだけ入れ替える')
  : fail('一括処理が勝手に入れ替える');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 自動チャプターは字幕を作らず、字幕が無ければ「字幕から検出」を選べない／AI は押したのと同じに呼ぶ');
process.exit(ng ? 1 : 0);
