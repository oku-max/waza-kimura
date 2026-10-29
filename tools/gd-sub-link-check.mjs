#!/usr/bin/env node
// ═══ Drive の動画の名前を変えても、字幕を見失わないこと（v52.968）═══
// 使い方: node tools/gd-sub-link-check.mjs
//
// なぜ要るか（2026-10-29 オーナー「Googleドライブ動画のファイル名かえると字幕ファイル見失うの解決して」）:
//   字幕は「動画と同じフォルダの、動画名で始まる .srt/.vtt」を名前だけで探していた。タイトル編集は Drive の
//   ファイル名も変えるが字幕のファイル名は変えないので、短い名前（例「2」）にした瞬間に字幕が行方不明になった
//   （しかも .mp4 まで消えて「2」になっていた）。
//   いまは字幕ファイルに「どの動画のものか」の印（appProperties.wkVideo）を付け、印があれば名前に関係なく見つける。
//   名前で見つけたものには印を付ける・新しく作る字幕には最初から付ける・タイトル編集は名前を変える前に付ける。
//   すでに見失った字幕は、⚙ の字幕の欄の「同じフォルダの字幕ファイルから選ぶ」から結び直せる（印を付けるだけ）。
//   偽の Drive（名前・印・フォルダ）に対して本物の関数を動かす。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vp = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ck = (m, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + m + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); if (!ok) ng++; };
const grab = (name) => {
  const i = vp.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  if (i < 0) throw new Error(name + ' が見つからない');
  let d = 0;
  for (let k = vp.indexOf('{', i); k < vp.length; k++) {
    if (vp[k] === '{') d++; else if (vp[k] === '}') { d--; if (!d) return vp.slice(i, k + 1); }
  }
};
const constLine = (name) => (vp.match(new RegExp(`^const ${name}\\s*=.*$`, 'm')) || [''])[0];
const block = (start) => vp.slice(vp.indexOf(start), vp.indexOf('};', vp.indexOf(start)) + 2);

// 偽の Drive: id → {name, parents, appProperties}
let drive, patches;
const reset = (files) => { drive = new Map(files.map(f => [f.id, { parents: ['F'], appProperties: {}, ...f }])); patches = []; };
const apiGet = async (p) => {
  const m = /^files\/([^?]+)\?/.exec(p);
  if (m) { const f = drive.get(decodeURIComponent(m[1])); if (!f) throw new Error('404'); return { name: f.name, parents: f.parents }; }
  const q = decodeURIComponent(/q=([^&]+)/.exec(p)[1]);
  const par = /'([^']+)' in parents/.exec(q)[1];
  return { files: [...drive.values()].filter(f => f.parents.includes(par)).map(f => ({ id: f.id, name: f.name, appProperties: f.appProperties })) };
};
const fakeFetch = async (url, o) => {
  const id = decodeURIComponent(/files\/([^?]+)\?/.exec(url)[1]);
  const body = JSON.parse(o.body || '{}');
  patches.push({ id, body });
  const f = drive.get(id);
  if (body.appProperties) Object.assign(f.appProperties, body.appProperties);
  if (body.name) f.name = body.name;
  return { ok: true, json: async () => ({ id }) };
};
const env = [constLine('GD_SUB_EXT_RE'), constLine('GD_SUB_MAX'), constLine('GD_SUB_PROP'), constLine('_SUB_TAIL_MAX'), constLine('_SUB_STEM_MIN'),
  block('const SUB_LANGS = {'), block('const SUB_LANG_ALIAS = {'),
  ...['_gdSubNorm', '_gdSubStem', '_gdSubMatch', '_gdSubLabelOf', '_gdSubTag', '_gdFindSubtitleFiles', '_gdOrphanSubs'].map(grab)].join('\n');
const M = new Function('_driveApiGet', 'fetch', 'console', `const _gdSubLookup = new Map(); let _gdSubLastError = '';\n${env}\nreturn { _gdFindSubtitleFiles, _gdOrphanSubs, _gdSubLookup };`)(apiGet, fakeFetch, { warn() {}, log() {} });
const find = async (id) => { M._gdSubLookup.clear(); const r = await M._gdFindSubtitleFiles(id, 'tok'); await new Promise(r => setTimeout(r, 0)); return r.map(f => f.name).sort(); };

console.log('── ① 名前で見つけた字幕には印が付き、名前を変えても見失わない ──');
reset([{ id: 'V1', name: 'Closed Guard 04.mp4' }, { id: 'S1', name: 'Closed Guard 04.ja.srt' }, { id: 'S2', name: 'Closed Guard 04.en.srt' }]);
ck('名前で見つかる（2件）', JSON.stringify(await find('V1')) === '["Closed Guard 04.en.srt","Closed Guard 04.ja.srt"]');
ck('見つけた字幕に「V1 のもの」の印が付く', drive.get('S1').appProperties.wkVideo === 'V1' && drive.get('S2').appProperties.wkVideo === 'V1', patches);
drive.get('V1').name = '2.mp4';                                   // 動画の名前を短く変える
ck('動画を「2」に変えても、2件とも見つかる', (await find('V1')).length === 2);
ck('字幕のファイル名・中身は変えていない（変えたのは印だけ）', patches.every(p => Object.keys(p.body).join() === 'appProperties') && drive.get('S1').name === 'Closed Guard 04.ja.srt');

console.log('── ② ほかの動画の印が付いた字幕は、名前が合っても拾わない ──');
reset([{ id: 'V1', name: 'Pass.mp4' }, { id: 'V2', name: 'Pass 2.mp4' }, { id: 'S9', name: 'Pass 2.ja.srt', appProperties: { wkVideo: 'V2' } }]);
ck('V1 には V2 の字幕を出さない', (await find('V1')).length === 0, await find('V1'));
ck('V2 には出る', (await find('V2')).length === 1);

console.log('── ③ 見失った字幕を同じフォルダから選び直せる（どの動画のものでもない字幕だけ）──');
reset([
  { id: 'V1', name: '2.mp4' },                                     // 名前を変えて見失った動画
  { id: 'V3', name: 'Half Guard.mp4' },
  { id: 'O1', name: 'Closed Guard 04.ja.srt' },                    // 持ち主が分からない → 候補
  { id: 'H1', name: 'Half Guard.ja.srt' },                         // ほかの動画と名前が合う → 候補にしない
  { id: 'T1', name: 'X.ja.srt', appProperties: { wkVideo: 'V3' } },     // 印が今ある動画 → 候補にしない
  { id: 'T2', name: 'Y.ja.srt', appProperties: { wkVideo: 'GONE' } },   // 印の動画がもう無い → 候補
]);
const orph = (await M._gdOrphanSubs('V1', 'tok')).map(f => f.id).sort();
ck(`候補は O1・T2 だけ（${orph}）`, JSON.stringify(orph) === '["O1","T2"]', orph);

console.log('── ④ 作る・名前を変えるときの印（コード）──');
ck('新しく作る字幕に最初から印を付ける（3か所の保存すべて）', /if \(videoId\) meta\.appProperties = \{ \[GD_SUB_PROP\]: videoId \}/.test(vp)
   && (vp.match(/_driveUploadText\([^)]*videoId: (fileId|videoFileId) \}\)/g) || []).length === 3);
const save = grab('vpSaveTitle');
ck('タイトル編集は、名前を変える前に字幕へ印を付ける', save.indexOf('_gdSubTag(') > 0 && save.indexOf('_gdSubTag(') < save.indexOf('renameGdFile'));
ck('タイトル編集で .mp4 などの拡張子を消さない', /driveName = newTitle \+ ext/.test(save) && /renameGdFile\?\.\(fileId, driveName\)/.test(save));
ck('⚙ の字幕の欄に「同じフォルダの字幕ファイルから選ぶ」がある（字幕が無い Drive の動画）', /同じフォルダの字幕ファイルから選ぶ/.test(vp) && /window\.wkSubLinkOrphan = async function/.test(vp));

console.log(ng ? `\n✗ ${ng}件の問題` : '\n✓ Drive の動画の名前を変えても、字幕を見失わない');
process.exit(ng ? 1 : 0);
