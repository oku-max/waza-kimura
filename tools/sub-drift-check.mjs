#!/usr/bin/env node
// ═══ 進むほど増えるズレの補正（区間アンカー）の検査 ═══
// 使い方: node tools/sub-drift-check.mjs
//
// なぜ要るか:
//   AIに動画を見せて作った字幕は、時刻を音から測っていない。実測した1本では
//   キューの96%が隙間ゼロで前のキューに直結し、開始のミリ秒の95%が000だった。
//   AIは「もっともらしい長さ」を並べているだけで、実演中の無音を飲み込む。
//   1:07:57 の動画なのに字幕は 1:00:55 で終わっていた。
//   ズレは一定ではないので平行移動では直らない。点を置いて区間ごとに伸ばす。
//
//   この写像が壊れると、字幕の順序が入れ替わる・時刻が負になる・補正なしの
//   動画まで動く、という形で全部の動画に波及する。だから機械で確かめる。
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
const cst = (n) => (src.match(new RegExp(`^const ${n}\\s*=.*$`, 'm')) || [null])[0];

const need = [cst('SUB_SLOPE_MIN')];
const fns  = ['_subLineMap'].map(grab);
if (need.some(x => !x) || fns.some(x => !x)) {
  fail('_subLineMap 一式が js/vpanel.js に無い');
} else {
  const g = await import('data:text/javascript;base64,' + Buffer.from(
    [...need, ...fns, 'export {_subLineMap};'].join('\n')).toString('base64'));

  // 1) 点が無ければ何も変わらない（補正していない動画に触らない）
  const id = g._subLineMap([]);
  [0, 1.5, 100, 4000].every(t => Math.abs(id(t) - t) < 1e-9)
    ? ok('点が無ければ時刻は変わらない')
    : fail('点が無いのに時刻が動く（補正していない動画まで動く）');

  // 2) 置いた点はその通りに来る
  const m2 = g._subLineMap([[1800, 2000], [3600, 4000]]);
  (Math.abs(m2(1800) - 2000) < 0.01 && Math.abs(m2(3600) - 4000) < 0.01)
    ? ok('置いた点はその位置に来る')
    : fail(`置いた点に来ない（${m2(1800).toFixed(1)} / ${m2(3600).toFixed(1)}）`);

  // 3) 1点だけなら一定倍率（先も同じ傾きで伸びる）
  const m1 = g._subLineMap([[3655, 4077]]);
  const k = 4077 / 3655;
  (Math.abs(m1(1000) - 1000 * k) < 0.01 && Math.abs(m1(5000) - 5000 * k) < 0.01)
    ? ok('1点なら全体が一定倍率で伸びる')
    : fail('1点のとき倍率が一定にならない');

  // 4) 単調に増える（順序が入れ替わらない）＋ 先頭は0のまま
  let mono = true, prev = -1;
  for (let t = 0; t <= 5000; t += 1) { const v = m2(t); if (v < prev) mono = false; prev = v; }
  (mono && Math.abs(m2(0)) < 1e-9)
    ? ok('時刻は単調に増える／先頭は0のまま')
    : fail('時刻が前後する（字幕の順序が入れ替わる）');

  // 5) でたらめな点でも傾きが暴走しない
  const mBad = g._subLineMap([[10, 3000]]);
  (mBad(4000) - mBad(0)) / 4000 <= 5.0001
    ? ok('おかしな点を置いても傾きは頭打ちになる')
    : fail('傾きが暴走する');

  // 6) 逆写像で元に戻る（「いま出ている字幕」から本来の時刻を割り出す時に使う。
  //     ここがずれると、押すたびにアンカーが少しずつ間違った場所に置かれる）
  const a  = [[1800, 2008], [3655, 4070]];
  const fw = g._subLineMap(a);
  const iv = g._subLineMap(a.map(p => [p[1], p[0]]));
  [300, 1800, 2500, 3655, 4500].every(t => Math.abs(iv(fw(t)) - t) < 0.01)
    ? ok('逆写像で元の時刻に戻る')
    : fail('逆写像で元に戻らない（押すたびに点がずれる）');

  // 7) 実測したファイルの形（1:00:55 で終わる字幕を 1:07:57 の動画に合わせる）
  const m = g._subLineMap([[1800, 2008], [3655, 4070]]);
  const at = (t) => Math.round(m(t));
  (at(3655) === 4070 && at(1800) === 2008 && at(900) > 900 && at(900) < 1100)
    ? ok(`実測の形に合う（字幕30:00 → 実際 ${Math.floor(at(1800)/60)}:${String(at(1800)%60).padStart(2,'0')}）`)
    : fail('実測の形に合わない');
}

// 1クリックで合わせられること。
// 手で点を置く作業は、どれだけ丁寧に作っても面倒な作業でしかない。
// 動画の長さは聞かなくても分かる手がかりなので、まずそれ1つで合わせられること。
const auto = grab('wkSubDriftAuto');
const plan = grab('_ytDriftAutoPlan');
if (!auto || !plan) fail('1クリックで合わせる経路が無い（毎回手で点を置くことになる）');
else {
  /_srtLastEnd\(/.test(plan) && /_ytDurationOf\(/.test(plan)
    ? ok('字幕の最後と動画の長さから、足りない分を出す')
    : fail('足りない分の出し方が字幕と動画の長さに基づいていない');
  // 点があってもボタンは出し続けること。
  // 「合わせてあるなら出さない」にしていたせいで、効いていない点が1つ残っているだけで
  // ボタンが消え、画面からは理由が分からないまま直せなくなった（実際に起きた）。
  !/_ytAnchorsOf\(t\)\.length\) return null/.test(plan)
    ? ok('点がすでにあってもボタンは出る（押せば置き換わる）')
    : fail('点が1つでもあるとボタンが消える（直す手段が画面から無くなる）');
  /gap < 60 \|\| gap < dur \* 0\.05/.test(plan)
    ? ok('少しの差では出さない（末尾が無音で終わる動画は普通にある）')
    : fail('わずかな差でも出る');
  /confirm\(/.test(auto)
    ? ok('押す前に実際の数字を見せて確かめる')
    : fail('確認なしで補正が掛かる');
}

// 合わせる操作が2段階であること。
// 1回押し（＝いま出ている字幕を、いまの再生位置へ）はズレが数秒のときしか使えない。
// 7分ズレていると、画面の台詞が実際に聞こえるのは7分先で、そこまで進んだ時には
// 画面の字幕はとっくに別物になっている＝「聞こえた瞬間に押す」が不可能になる。
const mark = grab('wkSubDriftMark');
const here = grab('wkSubDriftHere');
if (!mark || !here) fail('①②の2段階になっていない（大きなズレでは押すタイミングが作れない）');
else {
  /_subMark\s*=\s*\{/.test(mark)
    ? ok('①は字幕の側を覚える')
    : fail('①が字幕を覚えていない');
  /_subMark\.t/.test(here) && !/_subHere\(\)/.test(here)
    ? ok('②は①で覚えた字幕を使う（そのとき画面に出ている字幕ではない）')
    : fail('②がそのとき画面に出ている字幕を見ている（大きなズレで間違った点が入る）');
  /_subMark = null/.test(here)
    ? ok('②のあと①は空になる（同じ点を二度入れない）')
    : fail('②のあとも①が残る');
}

// 点の置き場所が「字幕と同じ場所」であること。
// 端末ローカルに置くと、合わせた端末でしか直らない（v52.764 がそうだった）。
const save = grab('_ytSubAnchorSave');
if (!save) fail('_ytSubAnchorSave が無い（点が端末から出られない）');
else {
  /tracks:\s*\{\s*\[lang\]:\s*\{\s*anchors:/.test(save)
    ? ok('点は字幕と同じ場所(tracks.<言語>.anchors)に保存する')
    : fail('点の保存先が字幕と同じ場所ではない');
  /\{ merge: true \}/.test(save) && !/srt/.test(save)
    ? ok('書くのは点だけ。字幕本体(srt)には触れない')
    : fail('点の保存で字幕本体に触れている');
}

// 作り直したら古い点を必ず外すこと。
// merge:true は入れ子のマップを残すので、明示的に消さないと前の点が生き残り、
// 新しい字幕に古いズレ補正が掛かる。
const store = grab('_ytSubStore');
store && /anchors: null/.test(store)
  ? ok('字幕を作り直したら古い点は外れる')
  : fail('作り直しても古い点が残る（新しい字幕に前の補正が掛かる）');

// 見えない場所の状態が表示を変えないこと。
// 端末(localStorage)の点を読んでいると、画面に出ない状態が字幕の位置を動かす。
// v52.764〜765 の「ほぼ動かさない点」が残っている端末で、実際に詰んだ。
const of = grab('_ytAnchorsOf');
of && !/localStorage|SUB_ANCHOR_KEY|_subAnchorLegacy/.test(of)
  ? ok('点は字幕側だけを見る（端末に残った見えない点は読まない）')
  : fail('端末に残った点を読んでいる（画面に出ない状態が表示を変える）');
!/SUB_ANCHOR_KEY/.test(src)
  ? ok('端末ローカルの点の仕組みは残っていない')
  : fail('端末ローカルの点の仕組みが残っている');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 進むほど増えるズレの補正は、順序を壊さず表示だけに掛かる');
process.exit(ng ? 1 : 0);
