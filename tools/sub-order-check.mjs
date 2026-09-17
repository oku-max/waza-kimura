#!/usr/bin/env node
// ═══ 字幕キューの時刻順チェック ═══
// 使い方: node tools/sub-order-check.mjs
//
// なぜ要るか:
//   YouTube側の描画は _ytSubCueAt の二分探索で「いま出すキュー」を選ぶ。
//   キューが1枚でも時刻順から外れていると探索が外れて null になり、
//   字幕は「選ばれているのに画面に何も出ない」状態になる。エラーも出ない。
//   実際に、訳を文単位で行う経路（_groupCuesBySentence）で並びが崩れ、
//   作った直後の日本語字幕が丸ごと出なくなった。
// 何を守るか:
//   1. _parseVtt は必ず時刻順に並べて返す（読み込み側の砦）
//   2. 二分探索が、崩れた入力でも _parseVtt を通せば正しく引ける
//   3. 訳したキューを書き出す前に _srtOrder を通している（書き出し側の砦）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// ── ソースから関数/定数を切り出して本物を動かす ──
const grabFn = (name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('見つかりません: ' + name);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error('閉じ括弧が見つかりません: ' + name);
};
const grabConst = (name) => {
  const m = src.match(new RegExp(`^const ${name} = .*$`, 'm'));
  if (!m) throw new Error('見つかりません: ' + name);
  return m[0];
};

const names = ['_parseVtt', '_tc2sec', '_ytSubCueAt', '_srtOrder'];
const code = [grabConst('VTT_TC_RE'), ...names.map(grabFn), `export {${names.join(',')}};`].join('\n');
const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

// ── 1. _parseVtt は時刻順に並べて返す ──
const tc = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
const shuffled = [[0, 3], [12, 15], [3, 6], [18, 21], [6, 9], [15, 18], [9, 12]];
let vtt = 'WEBVTT\n\n';
shuffled.forEach(([a, b], i) => { vtt += `${i + 1}\n${tc(a)} --> ${tc(b)}\n${a}s\n\n`; });

const cues = m._parseVtt(vtt);
if (cues.length !== shuffled.length) fail(`_parseVtt がキューを落としている (${cues.length}/${shuffled.length})`);
else ok(`崩れた並びのVTTでもキューを落とさない (${cues.length}枚)`);

const isSorted = cues.every((c, i) => i === 0 || cues[i - 1].start <= c.start);
isSorted ? ok('_parseVtt は時刻順に並べて返す')
         : fail('_parseVtt が時刻順に並べていない（描画の二分探索が外れる）');

// ── 2. 二分探索が正しく引けること ──
let miss = 0;
for (const [a] of shuffled) {
  const hit = m._ytSubCueAt(cues, a + 1);
  if (!hit || hit.text !== `${a}s`) miss++;
}
miss ? fail(`_ytSubCueAt が ${miss}箇所で字幕を引けない（画面に出ない）`)
     : ok('どの時刻でも正しいキューを引ける');

// 並べ替えを通していない入力では実際に外れる＝1.が効いていることの裏取り
const raw = shuffled.map(([a, b]) => ({ start: a, end: b, text: `${a}s` }));
const rawMiss = shuffled.filter(([a]) => {
  const hit = m._ytSubCueAt(raw, a + 1);
  return !hit || hit.text !== `${a}s`;
}).length;
rawMiss ? ok(`並べ替え無しでは ${rawMiss}箇所で引けない（だから _parseVtt で並べる）`)
        : fail('この検査自体が症状を再現できていない（テストの前提が壊れた）');

// ── 3. 訳したキューは書き出す前に _srtOrder を通す ──
// 文単位の訳を字幕へ割り振る経路（_recueOrKeep）の直後に並べ替えがあるか。
const recueCalls = [...src.matchAll(/_recueOrKeep\(/g)].length;
if (!recueCalls) fail('_recueOrKeep が見当たらない（経路が変わったらこの検査を見直す）');
else ok(`_recueOrKeep の呼び出し ${recueCalls}箇所`);

for (const fn of ['_translateSrtText', '_asrGenerateAndSave']) {
  const body = grabFn(fn);
  if (!body.includes('_recueOrKeep')) { ok(`${fn}: 訳の割り振りを行わない`); continue; }
  body.includes('_srtOrder')
    ? ok(`${fn}: 書き出す前に _srtOrder を通している`)
    : fail(`${fn}: _srtOrder を通していない（崩れた並びのSRTを保存しうる）`);
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 字幕キューは読み込み・書き出しの両方で時刻順（画面に出なくなる経路なし）');
process.exit(ng ? 1 : 0);
