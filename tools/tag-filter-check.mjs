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
  ['js/custom-view.js', /window\.tagFilter\.compile\(fc, 'fc'(, \{ except: _skip \})?\)/],
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
// 段階4 からタグリセットは js/tag-ops.js（動画パネル・まとめて編集と共通）。描き直しもそこで行う
ck('5 タグリセット: 存在しない vpRefreshChips を呼ばず、タグ欄を描き直す', !/vpRefreshChips\s*\?*\.?\(/.test(code['js/vpanel.js']) && /window\.vpV4Rerender\?\.\(window\.openVPanelId\)/.test(fs.readFileSync(path.join(ROOT, 'js/tag-ops.js'), 'utf8')) && /window\.vpV4Rerender\s*=/.test(code['js/vpanel-v4.js']));
ck('6 「ほかに絞り込み中か」: どの呼び名のタグも数える', /window\.tagFilter\?\.hasAny\(f, 'lib'\)/.test(code['js/filter-overlay.js']) && !/\['platform','channel','playlist','tb','action','position','tags'\]/.test(code['js/filter-overlay.js']));
ck('7 メモから作ったノートの動画リスト: タグ1〜4のどれでも探す（anyTag）', /anyTag: true/.test(code['js/note-templates.js']) && /function _vlIsAnyTag/.test(code['js/notes.js']));
ck('ノートの動画リストの「未視聴」: 存在しない v.unw を見ない', !/v\.unw\b/.test(code['js/notes.js']));
ck('tag-filter.js は index.html で一覧（tag-registry.js）の後に読まれる', read('index.html').indexOf('js/tag-registry.js') < read('index.html').indexOf('js/tag-filter.js'));

console.log('── ⑥ 検索の対象（段階2b）──');
{
  const ids = R.searchIds();
  ck('既定では今の4つ（と旧テンプレートのグループ）が検索の対象・マークと習得は対象外',
    ['f_tb', 'f_cat', 'f_pos', 'f_tags'].every(i => ids.includes(i)) && !ids.includes('mark') && !ids.includes('status'), J(ids));
  const v = { tb: ['トップ'], cat: ['パスガード'], pos: [], tags: ['キムラ'], fav: true };
  ck('検索の文字は今の保存場所から読む', J(R.searchText(v, 'f_cat')) === J(['パスガード']));
  ck('マークは値ではなく表示名で探せる（対象にしたとき用）', J(R.searchText(v, 'mark')) === J(['⭐ お気に入り']));
  const raw = R.raw(); raw.groups.find(g => g.id === 'f_cat').search = false; R.applyRemote(raw);
  ck('「検索の対象にしない」にしたグループは外れる', !R.searchIds().includes('f_cat') && R.searchIds().includes('f_tb'));
  const org = code['js/organize.js'];
  ck('ワード検索の本文のタグは、検索の対象のグループだけから作る', /R\.searchTagText\(v\)/.test(org) && /tags:\s*_searchTagText\(v\)/.test(org));
  ck('searchTagText と searchIds/searchText の結果が同じ（速い方が別の答えを出さない）',
    [v, { tb: [], cat: ['x'], pos: ['p'], tags: [], tg: { t_menu: ['A'] }, status: '理解', next: true }].every(x =>
      R.searchTagText(x) === R.searchIds().flatMap(id => R.searchText(x, id)).join(' / ')));
  ck('ワード検索の本文にタグ1〜4を直接並べていない', !/tags:\s*\[\.\.\.\(v\.tb/.test(org));
}

console.log('── ⑦ 選択肢の見せ方（段階2c）──');
{
  ck('境目は一覧の1か所（8個まで並べる・9個からプルダウン）', R.CHIP_MAX === 8 && R.displayMode(8) === 'chips' && R.displayMode(9) === 'dropdown');
  const vp = code['js/vpanel-v4.js'], bk = code['js/bulk.js'];
  ck('動画パネルとまとめて編集が同じ境目を読む', /_R\(\)\.displayMode\(g\.options\.length\)/.test(vp) && /_TGR\.displayMode\(g\.options\.length\)/.test(bk));
  ck('どちらも タグ1〜4の枠（slots）から並べる', /R\.slots\(\)/.test(vp) && /_TGR\.slots\(\)/.test(bk));
  ck('タグのチップは値を onclick の文字列に埋め込まない（\x27 を含む値でボタンが壊れていた）', !/onclick="(vpV4|bvpTag)[A-Za-z]*\([^"]*\$\{/.test(vp + bk));
  // まとめて編集の「タグリセット」（bulkTagReset）は別の機能。段階4 で js/tag-ops.js に移した（tag-ops-check が見る）
  const apply = bk.slice(bk.indexOf('function _bvpApply'), bk.indexOf('export function bvpTagChip'));
  ck('書き込みの入口は1つ（まとめて編集の付け外しも wkSetTagValue を使う）', /window\.wkSetTagValue = function/.test(vp) && /window\.wkSetTagValue\(v, gid, val, on\)/.test(apply) && !/\.push\(|\.splice\(|\.filter\(/.test(apply.replace(/sel\.forEach/, '')));
  ck('新しい値を打ち込めるのはタグ4だけ（今までどおり。選択肢へ自動で足すのは段階4）', /_allowNew = g => g\.store === 'tags'/.test(vp) && /g\.store !== 'tags'\) return;/.test(bk));
  ck('まとめて編集の取り消しに新しいグループの値（v.tg）も入る', /s\.tg = JSON\.parse\(JSON\.stringify\(v\.tg\)\)/.test(bk) && /!\('tg' in s\)/.test(bk));
  ck('古いグループ別の部品が戻っていない', !/vpV4ToggleTb|vpV4ToggleCat|vpV4OpenPosDd|vpV4OpenTagDd|bvpToggleV4|bvpOpenPosDd|bvpOpenTagDd/.test(vp + bk));
}

console.log('── ⑧ 表示も枠から（段階2d）──');
{
  const cards = code['js/cards.js'], sb = code['js/sidebar-v4.js'], uf = code['js/unified-filter.js'];
  ck('カードのタグは枠の順（slotInfo）', /_R\.slotInfo\(\)/.test(cards) && !/newTb\.map|newCat\.map|newPos\.map/.test(cards));
  ck('サイドバーの列は枠から', /R\.slots\(\)/.test(sb) && !/_COL_KEYS/.test(sb));
  ck('統合フィルターのタグの列は枠から・見出しは付けた名前（T/B の決め打ちが無い）', /_R \? _R\.slots\(\) : \[\]/.test(uf) && !/_colHtml\('T\/B'/.test(uf));
  ck('統合フィルターの行・選択中は値を onclick の文字列に埋め込まない', /onclick="uniToggleEl\(this\)"/.test(uf) && !/uniToggle\('\$\{opts\.filterKey\}'/.test(uf) && !/uniToggle\('\$\{k\}'/.test(uf));
  ck('選択中の表示は、枠に無いグループの選択も出す（見えない条件にしない）', /_TF\(\)\.groups\(\)\.forEach\(g => \[\.\.\._TF\(\)\.selected\(f, g\.id, _sch\(\)\)\]/.test(uf));
  ck('一覧に slotInfo（名前・選択肢を組み立てない軽い読み出し）', typeof R.slotInfo === 'function' && J(R.slotInfo().map(x => x && x.store)) === J(['tb', 'cat', 'pos', 'tags']));
}

console.log('── ⑨ 整理の表・カスタムリストの表も枠から（段階3c）──');
{
  const org = code['js/organize.js'] || fs.readFileSync(path.join(ROOT, 'js/organize.js'), 'utf8');
  // 列キー tb/action/position/technique は「タグ1〜4の枠」。保存済みの列の並び・表示・幅を読めるよう、列キーは変えない
  ck('タグの列は枠のグループを読む（_orgSlotGroup）', /const g = R\.slots\(\)\[k\]/.test(org) && /_ORG_SLOT_COL = \{ tb:0, action:1, position:2, technique:3 \}/.test(org));
  ck('タグの列の中身・並べ替え・その場の編集で v.tb / v.cat / v.pos / v.tags を直接読まない',
    !/mkTagCell\(v\.(tb|cat|pos|tags)/.test(org) && !/orgSortCol === '(tb|action|position|technique)'/.test(org) && !/v\[field\]/.test(org.slice(org.indexOf('function _openTagPicker'), org.indexOf('function _openMemoEditor'))));
  ck('その場の編集の書き込みは wkSetTagValue（動画パネルと同じ入口）', /window\.wkSetTagValue\(v, g\.id, val, on\)/.test(org) && !/tb:\s*\{ field: 'tb'/.test(org));
  ck('列の絞り込みの呼び名は tag-filter.js が決める', /window\.tagFilter\.keyFor\(g\.id, 'org'\)/.test(org) && !/tb:\s*\{ filterKey: 'tb'/.test(org));
  ck('表示の判定は1つの関数（3か所に同じ判定を書かない）', (org.match(/_orgTagColShown\(col\)/g) || []).length >= 3 && !/_tsVis[23]?\('tb'\)/.test(org));
  ck('タグの値はエスケープして描く', !/org-tag-chip">\$\{t\}/.test(org));
}

console.log('── ⑩ タグ付けウィザード・取り込みのタグも枠から（段階3c-2）──');
{
  const tw = fs.readFileSync(path.join(ROOT, 'js/tag-wizard.js'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const it = idx.slice(idx.indexOf("let itagMode = 'none';"), idx.indexOf('// 旧API互換'));
  ck('ウィザードは枠のグループを並べる（4つの区画を決め打ちしない）', /R\.slots\(\)/.test(tw) && !/tw-tb-chips|tw-pos-chips|tw-cat-chips/.test(tw));
  ck('ウィザードの確定は変えた値だけ・書き込みは wkSetTagValue', /window\.wkSetTagValue\(v, g\.id, val, on\)/.test(tw) && !/v\.(tb|pos|cat|tags)\s*=\s*final/.test(tw));
  ck('取り込みのタグの欄は枠のグループを並べる', /R\.slots\(\)/.test(it) && !/_vpTagLabel\('tb'\)/.test(it));
  ck('取り込みの値は onclick の文字列に埋め込まない（\x27 を含む値で壊れていた）', !/onclick="itag\w*\([^"]*\$\{/.test(it));
  ck('新しいグループの値は tg[ID] で渡し、URL・YouTube の追加でも落とさない',
    /\(out\.tg \|\| \(out\.tg = \{\}\)\)\[gid\]/.test(it) && /\.\.\.\(tg\.tg \? \{ tg: tg\.tg \} : \{\}\)/.test(idx)
    && /\.\.\.\(t\.tg \? \{ tg: t\.tg \} : \{\}\)/.test(fs.readFileSync(path.join(ROOT, 'js/youtube.js'), 'utf8')));
}

console.log('── ⑪ 残りの場所（段階3c-3）──');
{
  const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const notes = rd('js/notes.js'), uf = rd('js/unified-filter.js');
  const edit = notes.slice(notes.indexOf('window._notesVlEdit'), notes.indexOf('window._notesVlSaveFilter'));
  ck('★ ノートの動画リストを編集で開くとき、新しいグループの条件も渡す（渡さないと保存で消える）', /snap\[g\.id\] = \[\.\.\._TF\.selected\(f, g\.id, 'lib'\)\]/.test(edit));
  ck('ノートの動画リストの条件の要約に、新しいグループの条件も出す', /_vlSummary[\s\S]{0,900}g\.store === 'map'/.test(notes));
  ck('統合フィルターのタグのタブは、枠に新しいグループ（段階5 からマーク・習得も）だけでも出る', /_R0\.slots\(\)\.some\(g => g && \(\['map', 'mark', 'status'\]\.includes\(g\.store\)/.test(uf));
  ck('Journal の候補・動画パネルの検索メニューは allTagValues（新しいグループも入る）',
    /tagRegistry\.allTagValues\(v\)/.test(rd('js/murmurs.js')) && /tagRegistry\.allTagValues\(v\)/.test(rd('js/vpanel.js')) && typeof R.allTagValues === 'function');
  const A = { id: 'x', tb: ['T'], tags: ['K', 'T'], tg: { zz: ['M'] } };
  ck('allTagValues は重複を1つにし、マーク・習得を含めない', J(R.allTagValues(Object.assign({ fav: true, status: '理解' }, A))) === J(['T', 'K']));
}

console.log('── ⑫ マーク・習得も枠に入れられる（段階5）──');
{
  const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const vp = rd('js/vpanel-v4.js'), uf = rd('js/unified-filter.js');
  ck('★ 動画パネルのマークは、今の ★/Next/ドリル のボタンと同じ処理を呼ぶ（連動を保つ）', /\{ fav: 'qFav', next: 'qNext', drill: 'qDrill' \}\[val\]/.test(vp));
  ck('習得は今の習得のボタンと同じ処理（1本に1つ・外す操作は無い）', /if \(on && v\.status !== val\) \{ if \(window\.vpSetStatus\) window\.vpSetStatus\(v\.id, val\)/.test(vp));
  ck('絞り込みの列は今までと同じ仕組み（@fav/@next/@drill・status）で絞る', /key: '@' \+ k/.test(uf) && /filterKey: 'status'/.test(uf));
  ck('マーク・習得は、名前の変更・削除・まとめる の対象にしない（tag-ops.js）', /const _editable = g => !!g && \(FIELDS\.includes\(g\.store\) \|\| g\.store === 'map'\)/.test(rd('js/tag-ops.js')));
}

console.log('── ⑬ 未使用のタググループの条件（設定で選べる）──');
{
  const cv = fs.readFileSync(path.join(ROOT, 'js/custom-view.js'), 'utf8');
  ck('既定は今までどおり効かせる（何も書かなくても true）', R.pref('unusedCondApply') === true);
  const V = { id: 'x', tb: ['トップ'], pos: [] };
  const f = { tb: ['トップ'], pos: ['ハーフ'] };
  ck('compile は見ないグループを配列で受ける', TF.compile(f, 'fc')(V) === false && TF.compile(f, 'fc', { except: [TF.gidOfField('pos')] })(V) === true);
  ck('★ カスタムリストは設定がオフのときだけ未使用のグループの条件を見ない・条件は書き換えない',
    /_R\.pref\('unusedCondApply'\) === false\) \? _R\.groups\(\)\.filter\(g => g\.slot < 0\)/.test(cv) && /compile\(fc, 'fc', \{ except: _skip \}\)/.test(cv));
}

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ タグの絞り込みの読み替え: 問題なし');
process.exit(fail ? 1 : 0);
