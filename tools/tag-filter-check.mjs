#!/usr/bin/env node
// ═══ タグの絞り込み: 呼び名の読み替えが1か所（js/tag-filter.js）であることの検査（段階2a）═══
// 使い方: node tools/tag-filter-check.mjs
//
// 絞り込みの状態は場所ごとに呼び名が違う（ライブラリ tbNew/cat/posNew/tags、整理の表 tb/action/position/tags、
// カスタムリストの条件 tb/cat/pos/tech、URL tb/ac/pos/tech）。読み替え表が24か所に散っていて、
// 1か所古いだけで絞り込みが黙って効かなくなる不具合が7件あった。ここで見張ること:
//   ① 読み替えの規則（どの呼び名で入っていても同じグループとして読む／書くときはその場所の呼び名）
//   ② 判定（グループ同士は AND・グループの中は OR／件数用に1グループだけ外す／「(空白)」）
//   ③ 保存の形は変えない（カスタムリストの条件は tb/cat/pos/tech のまま＝古いタブと保存済みのリストが読める）
//   ④ 散っていた読み替え表・「新しい呼び名が空なら古い方」の形が戻っていない
//   ⑤ 7件の不具合の形が戻っていない
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
const J = x => JSON.stringify(x);
const S = (...a) => new Set(a);

// 本物の tag-registry.js と tag-filter.js を読む
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
const TF = win.tagFilter, R = win.tagRegistry;

console.log('── ① 読み替えの規則 ──');
ck('呼び名 → グループ（ライブラリ・整理・条件・URL のどれでも）',
  ['tbNew', 'tb'].every(k => TF.gidForKey(k, 'lib') === 'f_tb') &&
  ['cat', 'action', 'ac'].every(k => TF.gidForKey(k, k === 'ac' ? 'url' : 'org') === 'f_cat') &&
  ['posNew', 'position', 'pos'].every(k => TF.gidForKey(k, 'lib') === 'f_pos') &&
  ['tags', 'tech'].every(k => TF.gidForKey(k, 'fc') === 'f_tags'));
ck('タグでない呼び名はグループにならない（channel/playlist/status/prio/platform）',
  ['channel', 'playlist', 'status', 'prio', 'platform', 'mark', 'videoIds'].every(k => TF.gidForKey(k, 'lib') === null));
ck('書く呼び名: ライブラリ tbNew/cat/posNew/tags', J(['tb', 'cat', 'pos', 'tags'].map(f => TF.keyFor('f_' + f, 'lib'))) === J(['tbNew', 'cat', 'posNew', 'tags']));
ck('書く呼び名: 整理の表 tb/action/position/tags', J(['tb', 'cat', 'pos', 'tags'].map(f => TF.keyFor('f_' + f, 'org'))) === J(['tb', 'action', 'position', 'tags']));
ck('書く呼び名: カスタムリストの条件 tb/cat/pos/tech（保存済みの形のまま）', J(['tb', 'cat', 'pos', 'tags'].map(f => TF.keyFor('f_' + f, 'fc'))) === J(['tb', 'cat', 'pos', 'tech']));
ck('書く呼び名: URL tb/ac/pos/tech（今までの URL がそのまま読める）', J(['tb', 'cat', 'pos', 'tags'].map(f => TF.keyFor('f_' + f, 'url'))) === J(['tb', 'ac', 'pos', 'tech']));
{
  const f = { tbNew: S('A'), tb: S('B') };
  ck('★ 新旧どちらの呼び名に入っていても合わせて読む（以前は新しい方が空でないと古い方を無視）', J([...TF.selected(f, 'f_tb', 'lib')].sort()) === J(['A', 'B']));
  const arr = { tbNew: [], tb: ['X'] };
  ck('★ 空の配列が中身のある古い呼び名を隠さない（ノートの動画リストで起きていた）', J([...TF.selected(arr, 'f_tb', 'lib')]) === J(['X']));
  const g = { tbNew: S('A'), tb: S('B') };
  const set = TF.setFor(g, 'f_tb', 'lib');
  ck('書き込む前に、古い呼び名の分を今の呼び名へ寄せる（見えない条件を残さない）', set === g.tbNew && J([...g.tbNew].sort()) === J(['A', 'B']) && g.tb.size === 0);
  const o = { tb: S(), action: S(), position: S(), tags: S(), cat: S('C') };
  TF.normalize(o, 'org');
  ck('整理の表に紛れた cat は action へ寄せる', o.action.has('C') && o.cat.size === 0);
}

console.log('── ② 判定 ──');
{
  const v1 = { tb: ['トップ'], cat: ['パスガード'], pos: ['ハーフ'], tags: [] };
  const v2 = { tb: ['ボトム'], cat: [], pos: ['ハーフ'], tags: ['キムラ'] };
  const f = { tbNew: S('トップ', 'ボトム'), posNew: S('ハーフ'), cat: S(), tags: S() };
  ck('グループの中は OR（トップ・ボトムのどちらでも）', TF.match(v1, f, 'lib') && TF.match(v2, f, 'lib'));
  f.cat.add('パスガード');
  ck('グループ同士は AND（カテゴリも満たす動画だけ）', TF.match(v1, f, 'lib') && !TF.match(v2, f, 'lib'));
  ck('件数を数えるときは、そのグループだけ外せる', TF.match(v2, f, 'lib', { except: 'f_cat' }));
  ck('何も選んでいなければ全部通る', TF.match(v2, {}, 'lib') && TF.compile({ tbNew: S() }, 'lib')(v1));
  const blank = { tb: S('(空白)') };
  ck('整理の表の「(空白)」＝何も付いていない動画', TF.match({ tb: [] }, blank, 'org', { allowBlank: true }) && !TF.match(v1, blank, 'org', { allowBlank: true }));
  ck('「(空白)」はライブラリでは値として扱わない（allowBlank なし）', !TF.match({ tb: [] }, blank, 'org'));
  ck('判定は動画を書き換えない', J(v1) === J({ tb: ['トップ'], cat: ['パスガード'], pos: ['ハーフ'], tags: [] }));
  ck('hasAny: 古い呼び名だけに入っていても「絞り込み中」', TF.hasAny({ position: S('X') }, 'lib') && !TF.hasAny({ channel: S('x') }, 'lib'));
}

console.log('── ③ 保存の形 ──');
{
  const lib = { tbNew: S('A'), cat: S('B'), posNew: S(), tags: S('D'), channel: S('ch') };
  const fc = TF.toPlain(lib, 'lib', 'fc');
  ck('条件に書くときは tb/cat/pos/tech（空のグループは書かない・タグ以外は触らない）', J(fc) === J({ tb: ['A'], cat: ['B'], tech: ['D'] }), J(fc));
  const back = { tbNew: S('Z'), cat: S(), posNew: S(), tags: S() };
  TF.fromPlain({ tb: ['A'], pos: ['P'], tech: ['D'] }, back, 'fc', 'lib');
  ck('条件から戻すと編集画面の呼び名（tbNew/posNew/tags）に入り、前の選択は置き換わる', J([...back.tbNew]) === J(['A']) && J([...back.posNew]) === J(['P']) && J([...back.tags]) === J(['D']));
  const org = { tb: S(), action: S(), position: S(), tags: S() };
  TF.fromPlain({ tbNew: S('A'), cat: S('B'), posNew: S('C') }, org, 'lib', 'org');
  ck('★ ライブラリ → 整理の表（tbNew/cat/posNew が tb/action/position に届く）', org.tb.has('A') && org.action.has('B') && org.position.has('C'));
}
{
  // 新しいタググループ（store:'map'）はグループIDで書く
  R.reconcile({ seeded: true, list: [{ id: 'menu', name: 'M', values: ['A'] }] });
  ck('新しいタググループはグループIDの呼び名（URL は g_ を付ける）', TF.keyFor('t_menu', 'lib') === 't_menu' && TF.keyFor('t_menu', 'url') === 'g_t_menu' && TF.gidForKey('g_t_menu', 'url') === 't_menu');
  ck('新しいタググループの値は v.tg から読んで判定する', TF.match({ tg: { t_menu: ['A'] } }, { t_menu: S('A') }, 'lib') && !TF.match({}, { t_menu: S('A') }, 'lib'));
}

// ── ④⑤ コードの形 ──
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const live = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'tag-filter.js').map(f => 'js/' + f)];
const code = Object.fromEntries(live.map(f => [f, strip(read(f))]));
const grepAll = re => Object.entries(code).flatMap(([f, s]) => s.split('\n').map((l, i) => re.test(l) ? `${f}:${i + 1}: ${l.trim().slice(0, 90)}` : null).filter(Boolean));

console.log('── ④ 散っていた読み替えが戻っていない ──');
let hits = grepAll(/tbNew\?\.size\s*\?|posNew\?\.size\s*\?|\.tbNew\s*\|\|\s*\w+\.tb\b|\.posNew\s*\|\|/);
ck('「新しい呼び名が空なら古い方」の形が無い', hits.length === 0, hits.join('\n      → '));
hits = grepAll(/\[\s*['"]tbNew['"]\s*,\s*['"]tb['"]\s*\]|tb\s*:\s*['"]tbNew['"]\s*,\s*cat\s*:/);
ck('ライブラリ⇔整理の表の対応表を個別に持っていない', hits.length === 0, hits.join('\n      → '));
const filterJs = code['js/filter.js'];
ck('URL の対応表にタグを書かない（タグは tag-filter.js の url 呼び名）', !/_URL_SET_KEYS\s*=\s*\{[^}]*\b(tb|ac|pos|tech)\s*:/.test(filterJs));
ck('URL の書き出し・読み戻しが tag-filter.js を通る', /_TF\.keyFor\(g\.id, 'url'\)/.test(filterJs) && /_TF\.gidForKey\(param, 'url'\)/.test(filterJs));
for (const [f, re] of [
  ['js/filter.js', /window\.tagFilter\.compile\(window\.filters, 'lib'\)/],
  ['js/organize.js', /window\.tagFilter\.compile\(orgFilters, 'org', \{ allowBlank: true \}\)/],
  ['js/unified-filter.js', /_TF\(\)\.compile\(f, _sch\(\)/],
  ['js/custom-view.js', /window\.tagFilter\.compile\(fc, 'fc'\)/],
  ['js/filter-overlay.js', /window\.tagFilter\.compile\(f \|\| \{\}, 'lib'/],
  ['js/sidebar-v4.js', /_TF\(\)\.compile\(window\.filters \|\| \{\}, 'lib'\)/],
  ['js/notes.js', /TF\.compile\(filter, 'lib'\)/],
]) ck(`絞り込みの判定が tag-filter.js を通る: ${f}`, re.test(code[f]));
ck('サイドバーがカードを二度描きしない（本体と同じ条件で絞り直していない）', !/window\._vpFilteredList = filtered/.test(code['js/sidebar-v4.js']));

console.log('── ⑤ 7件の不具合の形 ──');
ck('1 詳細検索の「タグ」: 照合側が tech も受ける', /fields\.tags \|\| fields\.tech/.test(code['js/organize.js']));
const uf = code['js/unified-filter.js'];
ck('2 統合フィルターの検索語: 本物の検索（_matchQuery）で判定する', /window\._matchQuery\(v, parsed, null\)/.test(uf) && !/\.\.\.\(v\.tags \|\| \[\]\)\.map\(t => t\.toLowerCase\(\)\)/.test(uf));
ck('3 URL: タグ1〜3の選択も URL に残る（tag-filter.js の呼び名で書く）', /_TF\.selected\(window\.filters, g\.id, 'lib'\)/.test(filterJs));
ck('4 整理の表の件数: 整理の表の条件で数える', /countContextual\(filterKey, v, isOrg \? 'org' : 'lib'\)/.test(code['js/filter-overlay.js']) && /ctx === 'org' && window\.orgFilt/.test(filterJs));
ck('5 タグリセット: 存在しない vpRefreshChips を呼ばず、タグ欄を描き直す', !/vpRefreshChips\s*\?*\.?\(/.test(code['js/vpanel.js']) && /window\.vpV4Rerender\?\.\(id\)/.test(code['js/vpanel.js']) && /window\.vpV4Rerender\s*=/.test(code['js/vpanel-v4.js']));
ck('6 「ほかに絞り込み中か」: どの呼び名のタグも数える', /window\.tagFilter\?\.hasAny\(f, 'lib'\)/.test(code['js/filter-overlay.js']) && !/\['platform','channel','playlist','tb','action','position','tags'\]/.test(code['js/filter-overlay.js']));
ck('7 メモから作ったノートの動画リスト: タグ1〜4のどれでも探す（anyTag）', /anyTag: true/.test(code['js/note-templates.js']) && /function _vlIsAnyTag/.test(code['js/notes.js']));
ck('ノートの動画リストの「未視聴」: 存在しない v.unw を見ない', !/v\.unw\b/.test(code['js/notes.js']));
ck('tag-filter.js は index.html で一覧（tag-registry.js）の後に読まれる', read('index.html').indexOf('js/tag-registry.js') < read('index.html').indexOf('js/tag-filter.js'));

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ タグの絞り込みの読み替え: 問題なし');
process.exit(fail ? 1 : 0);
