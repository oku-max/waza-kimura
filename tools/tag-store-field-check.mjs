#!/usr/bin/env node
// ═══ 動画のタグの項目名を取り違えていないかの検査 ═══
// 使い方: node tools/tag-store-field-check.mjs
//
// なぜ必要か（2026-09-27）:
//   動画のタグは v.tb / v.cat / v.pos / v.tags に入っている。読み込みのたびの変換
//   （tag-master.js migrateVideo）・タグ付けウィザード・取り込み・カード（段階2より前）も全部この名前。
//   一方 tbNew / posNew は**ライブラリの絞り込みの状態（window.filters）の呼び名**で、動画の項目名ではない。
//   v52.861 はこの2つを取り違え、「動画の項目名は tbNew / posNew」として
//     ・動画パネルで付けたタグ1・ポジションを v.tbNew / v.posNew に書き
//     ・元から v.tb / v.pos にある値は、パネルで押しても外れなくなった
//   （本番 v52.861〜862）。v52.863 で書き込み先を v.tb / v.pos に戻した。
//   その間に v.tbNew / v.posNew に入った値は、読むときに拾い（消さない・書き戻さない）、外すときは両方から外す。
//   CLAUDE.md「同じものを指す値が2つあるなら、読む場所を1つにする」。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const ck = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail !== undefined ? '\n      → ' + detail : ''));
  if (!ok) fail++;
};
// コメントは見ない
const strip = src => src.split('\n').filter(l => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*')); }).join('\n');

const win = {
  localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); } },
  tagSettings: ['tb', 'cat', 'pos', 'tags'].map(k => ({ key: k, label: k, visible: true, presets: [] })),
  STATUS_CANON: ['未着手', '理解', '練習中', 'マスター'],
  WK_LANG: () => 'ja', addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {},
};
win.window = win;
win.tagLabel = k => k; win.tagPresets = () => [];
vm.createContext(win);
vm.runInContext(read('js/tag-registry.js'), win);
vm.runInContext(read('js/tag-filter.js'), win);
vm.runInContext(read('js/vpanel-v4.js'), win);
const R = win.tagRegistry, TF = win.tagFilter;
const gid = s => TF.gidOfField(s);

console.log('■ ① 動画を書く側は、どこも v.tb / v.pos の名前で書いている（根拠）');
{
  const mig = read('js/tag-master.js');
  const body = mig.slice(mig.indexOf('function migrateVideo'), mig.indexOf('function migrateAll'));
  ck('読み込みのたびの変換（migrateVideo）が v.tb / v.pos を扱い、tbNew / posNew を知らない', /v\.tb\b/.test(body) && /v\.pos\b/.test(body) && !/tbNew|posNew/.test(body));
  ck('取り込み（URLから追加）は tb / pos の名前で新しい動画を作る', /tb: tg\.tb \|\| \[\]/.test(read('index.html')) && /pos: tg\.pos \|\| \[\]/.test(read('index.html')));
  ck('タグ付けウィザードは動画パネルと同じ入口（wkSetTagValue）で書く', /window\.wkSetTagValue\(v, g\.id, val, on\)/.test(read('js/tag-wizard.js')));
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['index.html'])) {
    strip(read(f)).split('\n').forEach((l, i) => { if (/\bv\.(tbNew|posNew)\s*=|\bv\.(tbNew|posNew)\.push/.test(l)) bad.push(`${f}:${i + 1}`); });
  }
  ck('どこも動画に v.tbNew / v.posNew を書かない', bad.length === 0, bad.join(' / '));
}

console.log('■ ② 読む: v.tb / v.pos から読める。絞り込みの呼び名 tbNew / posNew で当たる');
const V = { id: 'v1', tb: ['トップ'], cat: ['フィニッシュ'], pos: ['マウント'], tags: ['ギロチン'] };
for (const [store, want] of [['tb', 'トップ'], ['cat', 'フィニッシュ'], ['pos', 'マウント'], ['tags', 'ギロチン']])
  ck(`${store} → ${want}`, R.valuesOf(V, gid(store)).includes(want), JSON.stringify(R.valuesOf(V, gid(store))));
for (const [libKey, val] of [['tbNew', 'トップ'], ['cat', 'フィニッシュ'], ['posNew', 'マウント'], ['tags', 'ギロチン']]) {
  const f = {}; f[libKey] = new Set([val]);
  ck(`絞り込み ${libKey}=${val} で当たる（0本にならない）`, TF.compile(f, 'lib')(V));
}
ck('ワード検索の本文にタグ1・ポジションが入る', /トップ/.test(R.searchTagText(V)) && /マウント/.test(R.searchTagText(V)));

console.log('■ ③ v52.861〜862 が v.tbNew / v.posNew に書いた値も読む（消さない・書き戻さない）');
{
  const B = { id: 'v3', tb: ['ボトム'], tbNew: ['トップ'], pos: [], posNew: ['マウント'] };
  const snap = JSON.stringify(B);
  const t = R.valuesOf(B, gid('tb')), p = R.valuesOf(B, gid('pos'));
  ck('両方あれば両方読む', t.includes('トップ') && t.includes('ボトム') && p.includes('マウント'), JSON.stringify([t, p]));
  ck('読むだけで動画を書き換えない', JSON.stringify(B) === snap);
}

console.log('■ ④ 書く: 動画パネル（wkSetTagValue）は v.tb / v.pos に書き、外すときは両方から外す');
{
  const A = { id: 'a', tb: ['ボトム'], pos: [] };
  win.wkSetTagValue(A, gid('tb'), 'トップ', true);
  win.wkSetTagValue(A, gid('pos'), 'マウント', true);
  ck('付けると v.tb / v.pos に入る（v.tbNew / v.posNew を作らない）', A.tb.includes('トップ') && A.pos.includes('マウント') && !('tbNew' in A) && !('posNew' in A), JSON.stringify(A));
  win.wkSetTagValue(A, gid('tb'), 'ボトム', false);
  ck('元から付いていた値をパネルで外せる（v52.861〜862 では外れなかった）', !A.tb.includes('ボトム') && !R.valuesOf(A, gid('tb')).includes('ボトム'), JSON.stringify(A));
  const S = { id: 's', tb: [], tbNew: ['トップ'] };
  win.wkSetTagValue(S, gid('tb'), 'トップ', false);
  ck('間違えて v.tbNew に入った値も外せる', !R.valuesOf(S, gid('tb')).includes('トップ'), JSON.stringify(S));
  const K = { id: 'k', tb: ['トップ'], tbNew: ['ボトム'], cat: ['X'] };
  win.wkSetTagValue(K, gid('tb'), 'トップ', false);
  ck('外すのはその値だけ（ほかの値・ほかのグループは無傷）', JSON.stringify(K) === JSON.stringify({ id: 'k', tb: [], tbNew: ['ボトム'], cat: ['X'] }), JSON.stringify(K));
}

console.log('■ ⑤ 絞り込みの呼び名を、動画の項目名として使っていない');
{
  const bad = [];
  for (const f of ['js/tag-registry.js', 'js/tag-filter.js', 'js/vpanel-v4.js', 'js/cards.js', 'js/bulk.js', 'js/organize.js']) {
    strip(read(f)).split('\n').forEach((l, i) => { if (/videoFieldOf|fieldOfStore/.test(l)) bad.push(`${f}:${i + 1}`); });
  }
  ck('「絞り込みの呼び名 → 動画の項目名」の読み替えが無い', bad.length === 0, bad.join(' / '));
}

console.log(fail ? `\n✗ ${fail} 件` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
