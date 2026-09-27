#!/usr/bin/env node
// ═══ 保存場所の名前と、動画の項目名の取り違えを見張る検査 ═══
// 使い方: node tools/tag-store-field-check.mjs
//
// なぜ必要か（2026-09-27）:
// タググループの「保存場所」は tb / cat / pos / tags と呼ぶが、動画に実際に入っている
// 項目名は tbNew / cat / posNew / tags で、tb と pos だけ名前が違う。
// js/tag-registry.js の valuesOf が v[g.store]（= v.tb / v.pos）を読んでいたため:
//   ・タグ1（トップ/ボトム）やポジションで絞り込むと **必ず0本**（値が読めないので全部外れる）
//   ・動画パネルで付けたタグ1・ポジションが v.tb / v.pos に書かれ、カード・表・絞り込みの
//     どこからも読まれない（付けたのに消えたように見える）
// CLAUDE.md「同じものを指す値が2つあるなら、読む場所を1つにする」そのもの。
// 取り出し・書き込みは tagRegistry.fieldOfStore / readField に集約し、ここで固定する。
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

const win = {
  localStorage: { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); } },
  tagSettings: ['tb', 'cat', 'pos', 'tags'].map(k => ({ key: k, label: k, visible: true, presets: [] })),
  STATUS_CANON: ['未着手', '理解', '練習中', 'マスター'],
  WK_LANG: () => 'ja',
};
win.window = win;
win.tagLabel = k => k; win.tagPresets = () => [];
vm.createContext(win);
vm.runInContext(read('js/tag-registry.js'), win);
vm.runInContext(read('js/tag-filter.js'), win);
const R = win.tagRegistry, TF = win.tagFilter;

// 今の形で保存されている動画（タグ1は tbNew・ポジションは posNew）
const V = { id:'v1', title:'02-Quick1.', tbNew:['トップ'], cat:['フィニッシュ'], posNew:['マウント'], tags:['ギロチン'] };

console.log('■ ① 保存場所の名前 → 動画の項目名');
ck('tb → tbNew',   R.fieldOfStore('tb')   === 'tbNew',  R.fieldOfStore('tb'));
ck('pos → posNew', R.fieldOfStore('pos')  === 'posNew', R.fieldOfStore('pos'));
ck('cat はそのまま',  R.fieldOfStore('cat')  === 'cat');
ck('tags はそのまま', R.fieldOfStore('tags') === 'tags');

console.log('■ ② valuesOf が、今の形の動画から値を読めること');
for (const [store, want] of [['tb','トップ'],['cat','フィニッシュ'],['pos','マウント'],['tags','ギロチン']]) {
  const gid = TF.gidOfField(store);
  const got = R.valuesOf(V, gid);
  ck(`${store} → ${want}`, got.includes(want), `${store}: ${JSON.stringify(got)}（0件ならその絞り込みは必ず0本になる）`);
}

console.log('■ ③ 絞り込みが当たること（これが落ちると画面が「0本」になる）');
for (const [libKey, val] of [['tbNew','トップ'],['cat','フィニッシュ'],['posNew','マウント'],['tags','ギロチン']]) {
  const f = {}; f[libKey] = new Set([val]);
  ck(`${libKey}=${val} で当たる`, TF.compile(f, 'lib')(V), 'この条件で全動画が外れる');
}

console.log('■ ④ ワード検索の本文に、タグ1・ポジションの値が入ること');
const txt = R.searchTagText(V);
ck('タグ1・ポジションが検索の本文に入る', txt.includes('トップ') && txt.includes('マウント'), txt);

console.log('■ ⑤ 昔の名前（v.tb / v.pos）に入っている分も読む（消さない・書き戻さない）');
const OLD = { id:'v2', tb:['ボトム'], pos:['ハーフガード'] };
ck('v.tb の値も読める',  R.valuesOf(OLD, TF.gidOfField('tb')).includes('ボトム'));
ck('v.pos の値も読める', R.valuesOf(OLD, TF.gidOfField('pos')).includes('ハーフガード'));
const BOTH = { id:'v3', tbNew:['トップ'], tb:['ボトム'] };
const both = R.valuesOf(BOTH, TF.gidOfField('tb'));
ck('両方あれば両方読む（どちらも捨てない）', both.includes('トップ') && both.includes('ボトム'), JSON.stringify(both));
ck('読むだけで動画を書き換えない', JSON.stringify(OLD) === JSON.stringify({ id:'v2', tb:['ボトム'], pos:['ハーフガード'] }), JSON.stringify(OLD));

console.log('■ ⑥ 書き込みも、動画の項目名へ書くこと（js/vpanel-v4.js）');
{
  const src = read('js/vpanel-v4.js');
  ck('v[g.store] に直接書いていない', !/Array\.isArray\(v\[g\.store\]\)/.test(src),
     'v[g.store] に書くと v.tb / v.pos に入り、どの画面からも読まれない');
  ck('fieldOfStore を通している', /fieldOfStore/.test(src));
}

console.log('■ ⑦ 動画の項目を、保存場所の名前で直接読んでいるところが無いこと');
{
  const bad = [];
  for (const f of ['js/cards.js', 'js/tag-registry.js', 'js/vpanel-v4.js', 'js/tag-filter.js']) {
    read(f).split('\n').forEach((ln, i) => {
      if (/\bv\[\s*(?:g|s)\.store\s*\]/.test(ln)) bad.push(`${f}:${i + 1} ${ln.trim().slice(0, 80)}`);
    });
  }
  ck('v[g.store] / v[s.store] で直接読んでいない', bad.length === 0, bad.join('\n      → '));
}

console.log('■ ⑧ 対応表が1枚だけであること（js/tag-filter.js の FIELD_KEYS）');
{
  const dup = [];
  for (const f of ['js/tag-registry.js', 'js/cards.js', 'js/vpanel-v4.js', 'js/filter.js', 'js/organize.js', 'js/unified-filter.js']) {
    read(f).split('\n').forEach((ln, i) => {
      if (/tb\s*:\s*['"]tbNew['"]|pos\s*:\s*['"]posNew['"]/.test(ln)) dup.push(`${f}:${i + 1} ${ln.trim().slice(0, 80)}`);
    });
  }
  ck('同じ対応表を他所に書いていない', dup.length === 0, dup.join('\n      → '));
  ck('tag-registry は tag-filter に聞いている', /videoFieldOf/.test(read('js/tag-registry.js')));
  ck('tag-filter が対応表を持っている', /function videoFieldOf/.test(read('js/tag-filter.js')));
}

console.log(fail ? `\n✗ ${fail} 件` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
