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
// 無料の直接取得を必ず先に試すこと。成功すれば費用ゼロで、業者に何も渡さずに済む。
const h = wsrc.slice(wsrc.indexOf('async function handleYtTranscript'), wsrc.indexOf('async function _ytTrPoll'));
// 無料の直接取得は、キーが無いときだけ。
// 実測でWorkerのIPは拒否されると分かっている（LOGIN_REQUIRED / 429 / 同意ページ）。
// キーがあるのに毎回試すと、7回のリクエストと十数秒を毎回捨てることになる。
/env\.SUPADATA_API_KEY \? null : await _ytCapsFree\(/.test(h)
  ? ok('キーがあるときは無駄な直接取得をしない')
  : fail('キーがあっても毎回、取れないと分かっている経路を叩いている');
/diag\.push/.test(wsrc)
  ? ok('どこで失敗したかを残す（次に推測しないで済むように）')
  : fail('失敗の理由を残していない');
/ytErrNote/.test(src)
  ? ok('失敗した理由を結果パネルに出す（黙ってGeminiに落ちない）')
  : fail('失敗が画面に出ないままGeminiへ落ちる');
const gen = src.slice(src.indexOf('async function _ytGenSubtitle'), src.indexOf('setBtn(\'⏳ 保存中…\')'));
gen.includes('_ytFetchTranscript(')
  ? ok('YouTube側の字幕を土台にしている')
  : fail('YouTube側の字幕を使っていない');
/時刻は向こうの値をそのまま使う/.test(wsrc)
  ? ok('取れた時刻はそのまま使う（丸めも詰め直しもしない）')
  : fail('取れた時刻に手を入れている');
/_translateSrtText\(yt\.srt/.test(src)
  ? ok('本文だけ訳す（時刻は既存の「翻訳だけやり直す」と同じく動かさない）')
  : fail('YouTubeの字幕を訳すときに時刻を作り直している');

// 4.5 YouTube動画では、動画をAIに見せて字幕を作らないこと。
// AIは時刻を音から測らないので、出来上がる字幕は必ず後半ほどズレ、後から直せない。
// 読めない時刻の字幕を金を払って作るくらいなら、作らないほうがいい。
// （Drive動画は音声を取り出せるので音声認識で実測できる。あちらは対象外。）
const ytBody = src.slice(src.indexOf('async function _ytGenSubtitle'),
                         src.indexOf("await _ytSubStore(ytId, subLang, srt,"));
!/source: 'youtube'[\s\S]*mode: 'subtitle'|mode: 'subtitle'[\s\S]{0,400}source: 'youtube'/.test(ytBody)
  ? ok('YouTube動画を Gemini に見せて字幕を作る経路は無い')
  : fail('YouTube動画をGeminiに見せて字幕を作っている（必ずズレる字幕を金を払って作ることになる）');
/YouTube側に字幕が無いため、字幕を作れません/.test(src)
  ? ok('作れないときは作らず、理由を伝える')
  : fail('作れないときの案内が無い');
// YouTube動画をDriveに置くには落とすしかない。規約違反を勧める案内を復活させない。
!/Googleドライブに置け/.test(src)
  ? ok('YouTube動画をDriveに置くよう勧めていない')
  : fail('YouTube動画をDriveに置くよう勧めている（落とすしかなく、規約違反を促す）');

// 5. 時刻が正確な字幕では、ズレ補正の欄を出さないこと。
//    出番の無い操作を並べると「何か直さないといけないのか」と思わせる。
/const fromYt = !!gen && String\(gen\.via \|\| ''\)\.startsWith\('yt:'\);/.test(src)
  ? ok('時刻の出所で出し分けている')
  : fail('出所に関係なく同じものを出している');
/if \(fromYt\) \{/.test(src) && /html \+= sec\('ズレを直す（この動画のみ）'\) \+ offBody;/.test(src)
  ? ok('時刻が正確な字幕ではズレ補正の欄を出さない')
  : fail('時刻が正確な字幕にもズレ補正の欄を出している');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 直せないものを直せるふりをしていない');
process.exit(ng ? 1 : 0);
