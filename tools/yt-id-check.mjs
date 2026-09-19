#!/usr/bin/env node
// ═══ YouTube動画IDの取り出し方の検査 ═══
// 使い方: node tools/yt-id-check.mjs
//
// なぜ要るか:
//   追加のしかたによって、保存される中身が違う。
//     ・YouTube検索／プレイリスト取り込み → id と ytId の両方
//     ・URLを貼って追加（CSV取り込み含む）→ id だけ
//   2026-09-19、AI要約・字幕生成・自動チャプターの3つだけが v.ytId を直接見ていたため、
//   貼り付けで追加した動画ではボタンがまるごと消えていた。
//   動画IDは id に入っていて情報は揃っているのに、見る場所が1つずれていただけ。
//   ノートや整理の機能は昔から v.ytId || v.id で代用していて、AI系だけ取り残されていた。
//
//   同じことが再発するのは「新しくYouTube動画を扱う場所を足したとき」なので、
//   取り出し方が1か所に集約されていることを機械で見張る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vp   = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// 1. 取り出し方が1か所にあること
/function _vYtId\(v\) \{/.test(vp)
  ? ok('動画IDの取り出しは _vYtId() に集約されている')
  : fail('_vYtId() が無い（各所で別々に判定すると必ずずれる）');

// 2. 11文字の形に合うものだけを返すこと。
//    プレイリスト(yt-pl-…)やDriveのIDを動画IDとして扱わないため。
const fn = vp.slice(vp.indexOf('function _vYtId(v) {'), vp.indexOf('window._wkVYtId'));
(/YT_ID_RE\.test/.test(fn) && /isPlaylist/.test(fn))
  ? ok('11文字の形だけを返す／プレイリストは除く')
  : fail('形の確認かプレイリスト除外が無い');

// 3. vpanel.js のどこでも v.ytId を直接読まないこと（_vYtId の中だけ例外）
const outside = vp.replace(fn, '');
const raw = outside.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /\.ytId\b/.test(l) && !/^\s*\/\//.test(l) && !/ytId:/.test(l));
raw.length === 0
  ? ok('v.ytId を直接読んでいる場所は無い')
  : fail(`v.ytId を直接読んでいる: ${raw.map(([n]) => n + '行目').join(', ')}`);

// 4. URLを貼って追加する経路が ytId を入れること（入り口でも揃える）
/if \(yt\) return _attach\(\{ id: yt\[1\], ytId: yt\[1\], pt: 'youtube'/.test(html)
  ? ok('URLを貼って追加した動画にも ytId が入る')
  : fail('貼り付けで追加すると ytId が入らない（また同じことが起きる）');

// 5. AI系の3つが同じ判定で出ること。
//    片方だけ直すと「要約は出るのに字幕は出ない」のような分かりにくい形になる。
const gates = [
  ['自動チャプター', /const isGd = _cv\?\.pt === 'gdrive' \|\| !!_vYtId\(_cv\)/],
  ['AI要約',        /_canSummarize = _isOwner && \(!!_vYtId\(vd\) \|\| vd\?\.pt === 'gdrive'\)/],
  ['字幕生成',      /_subGenBtn = \(_isOwner && \(vd\?\.pt === 'gdrive' \|\| !!_vYtId\(vd\)\)\)/],
];
for (const [name, re] of gates) {
  re.test(vp) ? ok(`${name}のボタンは _vYtId() で判定している`)
              : fail(`${name}のボタンが別の判定を使っている`);
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ すべてのYouTube動画で、要約・字幕・チャプターが使える形になっている');
process.exit(ng ? 1 : 0);
