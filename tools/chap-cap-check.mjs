#!/usr/bin/env node
// ═══ 自動チャプターが、動画の最後まで区切られること（v52.965）═══
// 使い方: node tools/chap-cap-check.mjs
//
// なぜ要るか（2026-10-21 オーナー「53分ある動画なのに、39分とか途中で止まっちゃってん。MAX60しかできないように設定しちゃってんの？」）:
//   件数の上限が粒度ごとの固定値（細かめ60・ふつう40・大きめ20）だった。AIには「最大60件」と頼み、
//   多く返っても _normalizeChapters が早い順に60件だけ残す（slice(0, maxCount)）ので、後ろが黙って消えた。
//   いまは上限を動画の長さから出す（_chapCap: 長さ ÷ 1つの最短の長さ。歯止め200）。
//   サーバーも80で頭打ちにしていたので200まで通し、AIの返しの枠を 16384 → 32768 に広げた。
//   それでも最後のチャプターが動画の8割より手前なら、確認画面に「後半が検出できていない可能性」と出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vp = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
const wk = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');
let ng = 0;
const ck = (m, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); if (!ok) ng++; };
const grab = (src, name) => {
  const i = src.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
};
const constLine = (src, name) => (src.match(new RegExp(`^const ${name}\\s*=.*$`, 'm')) || [''])[0];
const grainsBlock = vp.slice(vp.indexOf('const CHAP_GRAINS = {'), vp.indexOf('};', vp.indexOf('const CHAP_GRAINS = {')) + 2);
const env = [constLine(vp, 'CHAP_MIN_SEC'), constLine(vp, 'CHAP_MAX_COUNT'), constLine(vp, 'CHAP_LABEL_MAX'), constLine(vp, 'CHAP_CAP_MAX'),
  grainsBlock, grab(vp, '_chapSec'), grab(vp, '_chapCap'), grab(vp, '_normalizeChapters')].join('\n');
const M = new Function(env + '\nreturn { CHAP_GRAINS, _chapCap, _normalizeChapters };')();
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

console.log('── ① 上限は動画の長さから ──');
const D53 = 53 * 60 + 12;
ck('細かめ・53分12秒なら 127 件まで（固定の60ではない）', M._chapCap(M.CHAP_GRAINS.fine, D53) === 127, M._chapCap(M.CHAP_GRAINS.fine, D53));
ck('ふつう・53分12秒なら 70 件まで', M._chapCap(M.CHAP_GRAINS.normal, D53) === 70, M._chapCap(M.CHAP_GRAINS.normal, D53));
ck('長さが分からないときは今までの値（細かめ60）', M._chapCap(M.CHAP_GRAINS.fine, 0) === 60);
ck('とても長い動画でも 200 で止める（暴走の歯止め）', M._chapCap(M.CHAP_GRAINS.fine, 4 * 3600) === 200);

console.log('── ② 53分の動画に30秒おきの返し（106件）→ 最後まで残る ──');
const items = []; for (let t = 0; t < D53 - 30; t += 30) items.push({ start: fmt(t), title: 't' + t });
const kept = M._normalizeChapters(items, { duration: D53, minSec: 25, maxCount: M._chapCap(M.CHAP_GRAINS.fine, D53) });
ck(`106件すべて残る（${kept.length}件・最後 ${fmt(kept.at(-1).time)}）`, kept.length === items.length && kept.at(-1).time > 50 * 60, { n: kept.length, last: kept.at(-1)?.time });
const old = M._normalizeChapters(items, { duration: D53, minSec: 25, maxCount: 60 });
ck(`（前の固定60だと ${fmt(old.at(-1).time)} で止まる＝報告と同じ形）`, old.length === 60 && old.at(-1).time < 40 * 60, { last: old.at(-1)?.time });

console.log('── ③ 呼び出し側が固定値を使っていない ──');
ck('検出の呼び出しは全部 _chapCap(grain, duration)', !/maxCount:\s*grain\.maxCount/.test(vp) && (vp.match(/maxCount: _chapCap\(grain, duration\)/g) || []).length === 3);
ck('細かさを選ぶ画面の「最大◯個」も同じ関数から', /const capOf = g => _chapCap\(g, dur\);/.test(vp));

console.log('── ④ サーバー（_worker.js）──');
ck('サーバーは200まで通す（80で頭打ちにしない）', /Math\.min\(200, Number\(o\.maxCount\)/.test(wk) && !/Math\.min\(80, Number\(o\.maxCount\)/.test(wk));
ck('チャプターのAIの返しの枠は 32768', /mode === 'chapters'\) return \{ json: true, maxOutputTokens: 32768/.test(wk));
ck('AIに「最後まで区切る。途中で打ち切らない」と頼む', /動画（字幕）の最後まで区切る。途中で打ち切らない/.test(wk));

console.log('── ⑤ それでも途中で止まったら、黙って出さない ──');
ck('最後のチャプターが動画の8割より手前なら、確認画面に知らせる', /lastT < duration \* 0\.8 && !warn\) warn = `最後のチャプターが/.test(vp));
const i18n = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
ck('その知らせは英語表示でも訳される', /最後のチャプターが \(\[\\\\d:\]\+\) です/.test(i18n) || i18n.includes('最後のチャプターが ([\\d:]+) です'));

console.log(ng ? `\n✗ ${ng}件の問題` : '\n✓ 自動チャプターは動画の最後まで区切る');
process.exit(ng ? 1 : 0);
