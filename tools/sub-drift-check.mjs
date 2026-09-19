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
const fns  = ['_subLineMap', '_subAnchorNorm'].map(grab);
if (need.some(x => !x) || fns.some(x => !x)) {
  fail('_subLineMap 一式が js/vpanel.js に無い');
} else {
  const g = await import('data:text/javascript;base64,' + Buffer.from(
    [...need, ...fns, 'export {_subLineMap,_subAnchorNorm};'].join('\n')).toString('base64'));

  // 0) 保存の形（{t,r}）と、古い [t,r] の組のどちらも読めること
  const nrm = g._subAnchorNorm;
  if (!nrm) fail('_subAnchorNorm を取り出せない');
  else {
    const a1 = nrm([{ t: 3655, r: 4077 }]);
    const a2 = nrm([[3655, 4077]]);
    (a1.length === 1 && a1[0][0] === 3655 && a1[0][1] === 4077 && JSON.stringify(a1) === JSON.stringify(a2))
      ? ok('{t,r} でも [t,r] でも同じに読める')
      : fail('保存の形を読み戻せない');
  }

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

// 「字幕の最後 = 動画の最後」で自動に伸ばさないこと。
// v52.768〜770 でそれをやって外した。教則動画は末尾に無音（実演だけ・エンドカード）が
// 数分あるのが普通で、この前提だとそのぶん丸ごと伸ばしすぎる。
// 実測: 1:07:58 の動画で最後の約5分が無音だった。動画の長さは手がかりにならない。
!/_ytDurationOf\(/.test(src.slice(src.indexOf('function _ytDriftTail'), src.indexOf('window.wkSubDriftMark')))
  ? ok('動画の長さから自動で伸ばす経路は無い（末尾が無音の動画で伸ばしすぎる）')
  : fail('動画の長さを根拠に伸ばしている（末尾が無音だと外れる）');

// 動かしたらその場で画面が動くこと。英語が分からなくても、
// 声が始まる瞬間と重なるまで動かせば合わせられる形にしておく。
const slide = grab('wkSubDriftSlide');
if (!slide) fail('終盤のズレを動かせる経路が無い');
else {
  /_ytSubReapply\(\)/.test(slide) && /if \(!save\) return;/.test(slide)
    ? ok('動かしている間は画面だけ動く（離した時に保存する）')
    : fail('動かしても画面がすぐ動かない、または毎回保存してしまう');
  /_srtLastEnd\(t\.srt\)/.test(slide)
    ? ok('伸ばす量は「最後のキューを何秒うしろへ送るか」で決まる')
    : fail('伸ばす量の決め方が字幕の最後に基づいていない');
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
  // Firestoreは配列の要素に配列を置けない（Nested arrays are not supported）。
  // [[3655,4077]] で書いていた頃は set() ごと弾かれ、押しても補正が1つも入らなかった。
  /\{ t: p\[0\], r: p\[1\] \}/.test(save) && /anchors: wire/.test(save)
    ? ok('保存の形は{t,r}のオブジェクト（Firestoreは配列の中に配列を置けない）')
    : fail('点を配列の配列で保存している（Firestoreが書き込みごと弾く）');
  // 失敗はトーストだけだと消えてしまい「押したのに何も起きない」に見える
  // 失敗はトーストだけだと消えてしまい「押したのに何も起きない」に見える
  /_subDriftErr = String/.test((grab('wkSubDriftSlide') || '') + (grab('wkSubDriftHere') || ''))
    ? ok('保存に失敗したら画面に残す')
    : fail('保存の失敗が画面に残らない');
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
