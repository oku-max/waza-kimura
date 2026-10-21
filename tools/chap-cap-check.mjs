#!/usr/bin/env node
// ═══ 自動チャプター: 件数を選び、動画全体にまんべんなく区切ること（v52.965〜966）═══
// 使い方: node tools/chap-cap-check.mjs
//
// なぜ要るか:
//   v52.965（オーナー「53分ある動画なのに、39分とか途中で止まっちゃってん」）: 件数の上限で、早い順に残して後ろを捨てていた。
//   v52.966（オーナー「多すぎる。ユーザーに決めさせろ」「頭から決めていくんじゃなくて、全体を見てまんべんなく」
//            「細かい／粗いは分かりにくいから数字にしろ。10、20、30」「最後の方が尻切れトンボにならないように」）:
//   選ぶのは件数（10・20・30）。AIには全体を見渡してその件数でまんべんなく、と頼む。
//   多く返ってきたら _chapThin が、いちばん詰まっている所から外して件数に合わせる（頭から切らない）。
//   それでも最後が動画の8割より手前なら、確認画面に知らせる。
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
  if (i < 0) throw new Error(name + ' が見つからない');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
};
const constLine = (src, name) => (src.match(new RegExp(`^const ${name}\\s*=.*$`, 'm')) || [''])[0];
const block = (start) => vp.slice(vp.indexOf(start), vp.indexOf('};', vp.indexOf(start)) + 2);
const env = [constLine(vp, 'CHAP_MIN_SEC'), constLine(vp, 'CHAP_MAX_COUNT'), constLine(vp, 'CHAP_LABEL_MAX'),
  block('const CHAP_GRAINS = {'), constLine(vp, 'CHAP_GRAIN_KEYS'), constLine(vp, 'CHAP_GRAIN_OLD'),
  ...['_chapGrainKey', '_chapGrain', '_chapMinSec', '_chapThin', '_chapSec', '_normalizeChapters'].map(n => grab(vp, n))].join('\n');
const M = new Function(env + '\nreturn { CHAP_GRAINS, CHAP_GRAIN_KEYS, _chapGrainKey, _chapGrain, _chapMinSec, _chapThin, _normalizeChapters };')();
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const D53 = 53 * 60 + 12;

console.log('── ① 選ぶのは件数（10・20・30）──');
ck('選べるのは 10件・20件・30件', JSON.stringify(M.CHAP_GRAIN_KEYS.map(k => M.CHAP_GRAINS[k].label)) === '["10件","20件","30件"]');
ck('既定は20件', M._chapGrainKey() === '20' && M._chapGrainKey('xx') === '20');
ck('前の版の呼び方（細かめ・ふつう・大きめ）は近い件数に読む', M._chapGrainKey('fine') === '30' && M._chapGrainKey('normal') === '20' && M._chapGrainKey('coarse') === '10');
ck('画面に 細かめ／ふつう／大きめ・「最大◯個」が残っていない', !/'細かめ'|'大きめ'|短めに区切る|ほどよく区切る|この動画なら最大/.test(vp));
ck('AIへは選んだ件数（count）を渡す', /const freeOpts = \{ count: grain\.count,/.test(vp));

console.log('── ② 多く返ってきても、頭から切らない（全体にまんべんなく減らす）──');
// 前半30分に50件・後半23分に10件（前半に偏った返し）→ 20件に
const items = [];
for (let i = 0; i < 50; i++) items.push({ start: fmt(i * 36), title: 'a' + i });
for (let i = 0; i < 10; i++) items.push({ start: fmt(1800 + i * 135), title: 'b' + i });
const g20 = M._chapGrain('20');
const kept = M._normalizeChapters(items, { duration: D53, minSec: M._chapMinSec(g20, D53), maxCount: g20.count });
const late = kept.filter(c => c.time >= 1800).length;
ck(`20件になる（${kept.length}件）`, kept.length === 20, kept.length);
ck(`最後まで残る（最後 ${fmt(kept.at(-1).time)}）`, kept.at(-1).time >= 50 * 60, kept.at(-1).time);
ck(`後半23分にも区切りが残る（${late}件）`, late >= 6, late);
const gaps = kept.map((c, i) => (i + 1 < kept.length ? kept[i + 1].time : D53) - c.time);
ck(`いちばん長い区切りが平均の3倍を超えない（最大 ${fmt(Math.max(...gaps))}・平均 ${fmt(Math.floor(D53 / 20))}）`, Math.max(...gaps) <= 3 * D53 / 20, gaps);
ck('先頭（0:00）は残す', kept[0].time === 0);
ck('少ないときは減らさない（12件 → 12件）', M._chapThin(kept.slice(0, 12), 20, D53).length === 12);

console.log('── ③ サーバー（_worker.js）──');
ck('件数（count）を受け取り、全体を見渡してまんべんなく配分するよう頼む', /const count = Number\(o\.count\) > 0/.test(wk)
   && /最初から最後までを見渡し、話の量に合わせて\$\{count\}件を全体にまんべんなく配分/.test(wk) && /後半を少なくしたり省いたりしない/.test(wk));
ck('前の版（count が無い）からの呼び出しは今までどおり', /: `- チャプターは最大\$\{maxCount\}件まで/.test(wk));
ck('動画（字幕）の最後まで区切る・返しの枠 32768', /動画（字幕）の最後まで区切る。途中で打ち切らない/.test(wk) && /mode === 'chapters'\) return \{ json: true, maxOutputTokens: 32768/.test(wk));

console.log('── ④ それでも途中で止まったら、黙って出さない ──');
ck('最後のチャプターが動画の8割より手前なら、確認画面に知らせる', /lastT < duration \* 0\.8 && !warn\) warn = `最後のチャプターが/.test(vp));
const i18n = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
ck('新しい文言は英語表示でも訳される', ['"チャプターの数"', '"件数を変えて検出し直せます"', '"件数"', '"動画全体にまんべんなく"', '動画全体にまんべんなく（平均 約', '最後のチャプターが ('].every(k => i18n.includes(k)));

console.log(ng ? `\n✗ ${ng}件の問題` : '\n✓ 自動チャプター: 件数を選び、動画全体にまんべんなく');
process.exit(ng ? 1 : 0);
