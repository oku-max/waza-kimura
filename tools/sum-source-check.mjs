#!/usr/bin/env node
// ═══ 要約の素材チェック ═══
// 使い方: node tools/sum-source-check.mjs
//
// なぜ要るか:
//   AI要約は動画そのものを Gemini に送っていたが、2026-09-20 に字幕テキスト
//   だけを送る形へ変えた。理由は3つ:
//     ・コスト  映像は約15,500トークン/分、字幕は約700トークン/分（60分で $0.40 vs $0.02）
//     ・時刻    映像から書かせた時刻は音から測っていないのでズレるし後から直せない
//     ・画像    YouTubeはどのみちスクショを撮れないので、映像を送って得るものが小さい
//   映像を送る経路がうっかり戻ると、値段と時刻の両方が静かに悪化する。
//   気づけるように、送っているものと、字幕が無い時の案内を見張る。
// 何を守るか:
//   1. クライアントの要約は source:'transcript' で送る（youtube / gdrive で送らない）
//   2. Worker は mode:summary / desc を transcript 以外では受けない
//   3. 字幕が無いとき、ユーザーに「先に字幕を作る」ことを画面で伝える
//   4. 字幕づくりは vpGenSubtitle(id)＝ボタンを押したのと同じ呼び方にする
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vp   = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
const wk   = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

const grab = (src, name) => {
  const i = src.search(new RegExp(`(?:window\\.)?${name}\\s*=\\s*(?:async )?function\\(|(?:async )?function ${name}\\(`));
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
};

// ── 1. 要約が送っているもの ──
for (const fn of ['vpAiSummary', 'vpAiSummaryWithShot']) {
  const body = grab(vp, fn);
  if (!body) { fail(`${fn} が見つからない`); continue; }
  body.includes("source: 'transcript'")
    ? ok(`${fn} は字幕テキストを送っている`)
    : fail(`${fn} が source:'transcript' を送っていない`);
  /source:\s*'(youtube|gdrive)'/.test(body)
    ? fail(`${fn} が動画を送っている（source:'youtube' / 'gdrive'）。映像経路は廃止した`)
    : ok(`${fn} は動画を送っていない`);
}

// ── 2. Worker 側の受け口 ──
/mode === 'summary' \|\| mode === 'desc'/.test(wk) && wk.includes('要約は字幕から作ります')
  ? ok('Worker は summary / desc を transcript 以外で受けない')
  : fail('Worker が動画から要約を作れてしまう（mode:summary / desc の拒否が無い）');
wk.includes('_aiSummaryFromTranscript')
  ? ok('字幕テキストから要約する経路がある')
  : fail('_aiSummaryFromTranscript が無い');
/_aiPrompt\(ctx, sumOpts, range, durationSec, transcript\)/.test(wk)
  ? ok('要約プロンプトは字幕を根拠にしている')
  : fail('要約プロンプトが字幕を受け取っていない');

// ── 3. 字幕が無いときの案内 ──
{
  const body = grab(vp, '_askNeedSubtitle');
  if (!body) fail('_askNeedSubtitle（字幕が無いときの案内）が無い');
  else {
    ['要約は字幕から作ります', '字幕がありません', '字幕を作る'].every(w => body.includes(w))
      ? ok('字幕が無いとき「先に字幕を作る」ことを画面で伝えている')
      : fail('字幕が無いときの案内に、理由と次の一手が書かれていない');
  }
}

// ── 4. 字幕づくりの呼び方（preset を渡さない） ──
{
  const body = grab(vp, '_ensureTranscript');
  if (!body) fail('_ensureTranscript が無い');
  else {
    const calls = [...body.matchAll(/vpGenSubtitle\?\.\(([^)]*)\)|vpGenSubtitle\(([^)]*)\)/g)]
      .map(m => (m[1] ?? m[2] ?? '').trim());
    if (!calls.length) fail('_ensureTranscript から字幕生成を呼んでいない（経路が変わったらこの検査を見直す）');
    else for (const args of calls) {
      args === 'id'
        ? ok('字幕づくりは vpGenSubtitle(id)（ボタンを押したのと同じ処理）')
        : fail(`vpGenSubtitle(${args}) : preset を渡している。押した時と違う結果になる`);
    }
  }
}

// ── 5. 一括処理では聞かずに飛ばす ──
{
  const body = grab(vp, '_ensureTranscript');
  body && /opt\.silent/.test(body)
    ? ok('一括処理では字幕が無いものを黙って飛ばす（ダイアログを出さない）')
    : fail('一括処理でも字幕のダイアログが出てしまう');
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 要約は字幕から作っている／字幕が無いときは先に作るよう伝えている');
process.exit(ng ? 1 : 0);
