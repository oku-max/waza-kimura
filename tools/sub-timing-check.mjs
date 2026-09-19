#!/usr/bin/env node
// ═══ 字幕の時刻の扱いの検査 ═══
// 使い方: node tools/sub-timing-check.mjs
//
// なぜ要るか:
//   YouTube動画は音声を取り出せないので、字幕はAIに動画を見せて作る。
//   AIは時刻を音から測っていない。実測した1本（1:07:58）では
//     ・キューの96%が隙間ゼロで前のキューの終わりに直結
//     ・開始のミリ秒の95%が000
//     ・字幕が無音として数えた時間は108秒だけ。実際に足りないのは423秒
//   つまり315秒ぶんの無音が、どこで起きたか分からないまま散っている。
//   無音は一定間隔で来ないので、全体をずらしても伸ばしても直らない。
//   時刻には情報が入っていない。無い情報は復元できない。
//
//   2026-09-19、それを認めずに補正を作り続けた（一定倍率・区間アンカー・
//   動画の長さに合わせる・つまみ）。どれも直らない。全部撤去した。
//   この検査は「直せるふりをする仕組み」が戻ってこないことを見張る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// 1. 時刻を伸縮する仕組みが無いこと
const banned = ['_subLineMap', '_subAnchorNorm', '_ytAnchorsOf', '_ytSubAnchorSave',
                '_subDriftOf', 'wkSubDriftSlide', 'wkSubDriftHere', 'SUB_ANCHOR_KEY'];
const alive = banned.filter(n => src.includes(n));
alive.length === 0
  ? ok('時刻を伸縮する仕組みは無い（無い情報は復元できない）')
  : fail(`伸縮の仕組みが戻っている: ${alive.join(', ')}`);

// 2. 再生側に掛かるのは平行移動だけであること
/for \(const t of _ytSubTracks\) t\.cues = _parseVtt\(_reflowVtt\(t\.rawVtt, o, off\)\);/.test(src)
  ? ok('再生側に掛かるのは平行移動(offset)だけ')
  : fail('再生側で時刻に何かを掛けている');
/^function _reflowVtt\(vtt, o, offset\) \{$/m.test(src)
  ? ok('_reflowVtt は平行移動しか受け取らない')
  : fail('_reflowVtt が時刻の写像を受け取れる形に戻っている');

// 3. 字幕そのものに時刻の補正を焼き込まないこと（YouTube側）
const store = src.slice(src.indexOf('async function _ytSubStore'), src.indexOf('const _ytSubLangLabel'));
!/anchors/.test(store)
  ? ok('保存する字幕に補正用の項目を持たせない')
  : fail('字幕に補正用の項目が残っている');

// 4. YouTube側の字幕（時刻が正確）を先に試すこと。
//    AIに動画を見せて作った時刻は後から直せない。直す方法は「最初から正しい時刻を得る」だけ。
const wsrc = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');
/case '\/api\/yt-transcript'/.test(wsrc) && /function handleYtTranscript/.test(wsrc)
  ? ok('YouTube側の字幕を取る経路がサーバーにある')
  : fail('YouTube側の字幕を取る経路が無い');
const gen = src.slice(src.indexOf('async function _ytGenSubtitle'), src.indexOf('setBtn(\'⏳ 保存中…\')'));
gen.indexOf('_ytFetchTranscript(') >= 0 && gen.indexOf('_ytFetchTranscript(') < gen.indexOf("source: 'youtube'")
  ? ok('Geminiに動画を見せる前に、YouTube側の字幕を試す')
  : fail('YouTube側の字幕より先にGeminiへ行っている（直せない時刻を先に作る）');
/時刻は向こうの値をそのまま使う/.test(wsrc)
  ? ok('取れた時刻はそのまま使う（丸めも詰め直しもしない）')
  : fail('取れた時刻に手を入れている');
// YouTube側で取れたら、そこで終わること。
// 素の else にすると、正確な時刻を作った直後にGeminiが走って上書きし、課金もされる。
/\} else if \(!srt\) \{/.test(gen)
  ? ok('YouTube側で取れたらGeminiへ落ちない（時刻を捨てて課金しない）')
  : fail('YouTube側で取れてもGeminiが走る（正確な時刻を捨てて課金する）');
/_translateSrtText\(yt\.srt/.test(src)
  ? ok('本文だけ訳す（時刻は既存の「翻訳だけやり直す」と同じく動かさない）')
  : fail('YouTubeの字幕を訳すときに時刻を作り直している');

// 5. 時刻がAIの推測であることを画面に出していること。
//    黙って出すと、読んだ人はその時刻を信じる。信じられる時刻ではない。
const notice = 'この字幕の時刻はAIの推測です。実際の発話位置とは合いません';
src.includes(notice)
  ? ok('時刻がAIの推測であることを⚙に出す')
  : fail('時刻がAIの推測であることを画面に出していない');
/YouTube側にも字幕が無い動画は、Googleドライブに置けば/.test(src)
  ? ok('正確な時刻が要るときの道を示す')
  : fail('正確に直す道を示していない');
// 出所で断り書きを出し分けること（YouTubeの字幕から作ったものに「AIの推測」と出さない）
/const fromYt = !!gen && String\(gen\.via \|\| ''\)\.startsWith\('yt:'\);/.test(src)
  ? ok('時刻の出所で断り書きを出し分ける')
  : fail('出所に関係なく同じ断り書きを出している');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 直せないものを直せるふりをしていない／時刻の出所を画面に出している');
process.exit(ng ? 1 : 0);
