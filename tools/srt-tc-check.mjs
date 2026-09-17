#!/usr/bin/env node
// ═══ タイムコード書式の受け入れチェック ═══
// 使い方: node tools/srt-tc-check.mjs
//
// なぜ要るか:
//   AIは時刻を「05:41:292」のようにミリ秒までコロンで区切って返すことがある。
//   SRT/VTT の規定は「,」か「.」なので、この行は時刻として読めず、そのまま
//   本文に混ざる。画面には「55 05:41:292 --> 05:55:762」が字幕として出た。
//   しかも先頭の数分だけ正しい書式で返るため、そこまでは普通に出て、
//   書式が変わった時点から「字幕が途中で切れた」ように見える。エラーは出ない。
// 何を守るか:
//   1. クライアントとサーバーの両方が MM:SS:mmm 形式を読めること
//   2. ミリ秒なしの HH:MM:SS を壊さないこと（3桁のときだけ直す）
//   3. 読み書きに関わる関数が正規化を通していること
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

const grab = (src, name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
};
const cst = (src, n) => (src.match(new RegExp(`^const ${n}\\s*=\\s*.*$`, 'm')) || [])[0];

// ── 1. 正規化そのもの ──
const wsrc = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');
const code = [cst(wsrc, 'SRT_MS_COLON'), grab(wsrc, '_srtFixMs'), 'export {_srtFixMs};'].join('\n');
if (!cst(wsrc, 'SRT_MS_COLON') || !grab(wsrc, '_srtFixMs')) {
  fail('_worker.js に _srtFixMs / SRT_MS_COLON が無い');
} else {
  const { _srtFixMs } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const cases = [
    ['05:41:292 --> 05:55:762', '05:41,292 --> 05:55,762', 'ミリ秒がコロン区切り'],
    ['00:08:57:022 --> 00:09:03:922', '00:08:57,022 --> 00:09:03,922', '時間付きでコロン区切り'],
    ['00:05:41,292 --> 00:05:55,762', '00:05:41,292 --> 00:05:55,762', '正しい書式は変えない'],
    ['00:05:41.292 --> 00:05:55.762', '00:05:41.292 --> 00:05:55.762', 'ピリオド区切りも変えない'],
    ['01:02:03 --> 01:02:09', '01:02:03 --> 01:02:09', 'ミリ秒なしの HH:MM:SS を壊さない'],
  ];
  for (const [inp, want, label] of cases) {
    const got = _srtFixMs(inp);
    got === want ? ok(`${label}`) : fail(`${label}: ${inp} → ${got}（期待 ${want}）`);
  }
}

// ── 2. 読み書きに関わる関数が正規化を通しているか ──
const targets = [
  ['_worker.js',    ['_srtCues']],
  ['js/vpanel.js',  ['_looksLikeSrt', '_srtToVtt', '_cleanSrt', '_parseVtt']],
];
for (const [file, fns] of targets) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const n of fns) {
    const body = grab(src, n);
    if (!body) { fail(`${file}: ${n} が見つからない`); continue; }
    body.includes('_srtFixMs')
      ? ok(`${file}: ${n} は正規化を通している`)
      : fail(`${file}: ${n} が正規化を通していない（崩れた時刻を本文にしてしまう）`);
  }
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 崩れた時刻の書式でも読める（字幕が途中で本文に化ける経路なし）');
process.exit(ng ? 1 : 0);
