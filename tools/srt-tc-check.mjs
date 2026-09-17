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

// ── 3. 書式が「別の壊れ方」をした時に、黙って保存されないこと ──
// 今回の書式を直しただけでは、次に違う崩れ方をした時にまた素通りする。
// 通し番号と読み取れたキュー数の食い違いで、崩れ方に依らず捕まえる。
const cst2 = (n) => (wsrc.match(new RegExp(`^const ${n}\\s*=\\s*.*$`, 'm')) || [])[0];
const need = ['SRT_MS_COLON', 'SRT_IDX_LINE', 'SRT_TC_STRICT'].map(cst2);
const fns  = ['_srtFixMs', '_srtSec', '_srtCues', '_srtUnreadableTc'].map(n => grab(wsrc, n));
if (need.some(x => !x) || fns.some(x => !x)) {
  fail('_worker.js に _srtUnreadableTc 一式が無い（崩れ方に依らない検知が消えている）');
} else {
  const g = await import('data:text/javascript;base64,' + Buffer.from(
    [...need, ...fns, 'export {_srtUnreadableTc,_srtCues};'].join('\n')).toString('base64'));
  const good = s => `00:${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')},000`
                  + ` --> 00:${String(Math.floor((s+3)/60)).padStart(2,'0')}:${String((s+3)%60).padStart(2,'0')},000`;
  const head = Array.from({length:30},(_,i)=>`${i+1}\n${good(i*3)}\n本文${i}\n`).join('\n');
  const tail = (f) => Array.from({length:30},(_,i)=>`${i+31}\n${f(i+30)}\n本文${i+30}\n`).join('\n');
  const stop = (srt) => { const c = g._srtCues(srt).length; const r = g._srtUnreadableTc(srt, c);
                          return r.lost > Math.max(3, r.maxIdx * 0.1); };
  const whole = head + tail(i => good(i*3));
  stop(whole) ? fail('まともなSRTを止めてしまう（誤検知）') : ok('まともなSRTは通す');
  for (const [label, f] of [
    ['矢印が全角',        (i) => good(i*3).replace('-->', 'ー>')],
    ['秒が1桁',           (i) => `00:0${i%6}:${i%10},00 --> 00:0${i%6}:${(i%10)+1},00`],
    ['時刻行が消える',     ()  => '（時刻なし）'],
  ]) {
    stop(head + tail(f)) ? ok(`別の崩れ方（${label}）でも保存を止める`)
                         : fail(`別の崩れ方（${label}）が素通りする`);
  }
  const fixedNow = head + tail(i => `${String(Math.floor(i*3/60)).padStart(2,'0')}:`
    + `${String((i*3)%60).padStart(2,'0')}:${String(i).padStart(3,'0')} --> `
    + `${String(Math.floor((i*3+3)/60)).padStart(2,'0')}:${String((i*3+3)%60).padStart(2,'0')}:000`);
  stop(fixedNow) ? fail('今回の書式（MM:SS:mmm）を止めてしまう。読めるようにしたのだから通すべき')
                 : ok('今回の書式（MM:SS:mmm）は読めるので通す');
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 崩れた時刻は読める／別の崩れ方は黙って保存されない');
process.exit(ng ? 1 : 0);
