#!/usr/bin/env node
// ═══ 作った字幕がその場で表示されるかの検査 ═══
// 使い方: node tools/sub-show-check.mjs
//
// なぜ要るか:
//   どちらの経路も、字幕を保存したあとプレイヤーに載せ直すが、
//   その時に選ぶのは「端末が覚えている選択」だった。
//   覚えているのは“前に見ていたもの”なので 'off' や別の言語が入っていることがあり、
//   その場合は字幕を作った直後でも何も出ないまま終わる（作ったのに出ない）。
//   作った本人の意思のほうが新しいので、作った言語を選ぶ。
//   Drive側だけ先に直して YouTube側が抜けていた、という取りこぼしを防ぐ。
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

// 載せ直す関数が「作った言語」を受け取れること
for (const [fn, sig] of [['_gdAttachSubtitle', /function _gdAttachSubtitle\(video, fileId, token, want\)/],
                         ['_ytSubAttachInner', /function _ytSubAttachInner\(ytId, want\)/],
                         ['_ytSubRefreshNow',  /function _ytSubRefreshNow\(ytId, want\)/]]) {
  const body = grab(fn);
  if (!body) { fail(`${fn} が見つからない`); continue; }
  sig.test(body) ? ok(`${fn} は作った言語を受け取る`)
                 : fail(`${fn} が作った言語を受け取らない（記憶だけで選ぶと出ないことがある）`);
}

// 受け取った言語を実際に選んでいること
for (const [fn, mark] of [['_gdAttachSubtitle', '_gdSubSetPref'], ['_ytSubAttachInner', '_ytSubSetPref']]) {
  const body = grab(fn);
  if (!body) continue;
  (body.includes('want') && body.includes(mark))
    ? ok(`${fn} は作った字幕を選んで記憶も更新する`)
    : fail(`${fn} が作った字幕を選んでいない`);
}

// 生成の各経路が、作った言語を渡していること
const paths = [
  ['_ytGenSubtitle',     /_ytSubRefreshNow\(ytId,\s*subLang\)/,      'YouTube'],
  // Drive は言語コードではなく「作ったファイル名」で選ぶ（'orig' でも一意に決まる）
  ['vpGenSubtitle',      /_gdSubReload\(fileId, gdToken, target\)/,             'Drive(Gemini)'],
  ['_asrGenerateAndSave',/_gdSubReload\(fileId, gdToken, trTarget \|\| target\)/, 'Drive(音声認識)'],
];
for (const [fn, re, label] of paths) {
  const body = grab(fn);
  if (!body) { fail(`${fn} が見つからない`); continue; }
  re.test(body) ? ok(`${label}: 作った言語を渡して載せ直している`)
                : fail(`${label}: 作った言語を渡していない（作っても画面に出ないことがある）`);
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 作った字幕は、その場で選ばれた状態で表示される');
process.exit(ng ? 1 : 0);
