#!/usr/bin/env node
// ═══ 検索辞書の検査（表は1枚だけ） ═══
// 使い方: node tools/search-dict-check.mjs
//
// なぜ要るか:
//   オーナーの方針:「表記の揺れと、それの別言語。必要なのはそれぐらい」。
//   2026-09-24 まで、検索は4か所の別々の表を引いていた（ポジション別名・カテゴリ別名・
//   カテゴリterms・技名辞書）。1か所直すたびに隣の表に同じものが残り、同じ不具合が3回出た:
//     ・「ロングステップ」→ カテゴリ「パスガード」の別名117語に化けて 2824本中1725本
//     ・「ロックダウン」→ 親のハーフガードの動画が全部
//     ・「パスガード」→ terms の "pass" で、pass を含む動画が全部
//   そこで表を1枚（SEARCH_DICT）にした。この検査は「1枚のままか」「1行が同じものだけか」を見る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

global.window = {};
global.document = { getElementById: () => null, querySelectorAll: () => [] };
await import(path.join(ROOT, 'js/tag-master.js'));
const { SEARCH_DICT: DICT, POSITIONS: POS, CATEGORIES: CATS, _normTag: norm, aliasNamesFor } = window;

const tmSrc  = fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8');
const orgSrc = fs.readFileSync(path.join(ROOT, 'js/organize.js'), 'utf8');
const q = new Function('window',
  orgSrc.slice(orgSrc.indexOf('export function _parseQuery'), orgSrc.indexOf('// アドバンスドサーチ状態'))
        .replace(/^export /gm, '') + '\nreturn { _parseQuery, _matchQuery };')(window);

// ── ① 検索が引く表は1枚だけ ──
console.log('■ ① 検索が引く表は SEARCH_DICT の1枚だけ');
{
  const _fnStart = tmSrc.indexOf('function aliasNamesFor(q)');
  const body = tmSrc.slice(_fnStart, tmSrc.indexOf('\n}', _fnStart));
  const leaks = ['POSITION_INDEX', 'CATEGORY_INDEX', 'aliases', 'terms'].filter(k => body.includes(k));
  leaks.length
    ? fail(`aliasNamesFor が SEARCH_DICT 以外を読んでいる（${leaks.join(' / ')}）`)
    : ok('aliasNamesFor は SEARCH_DICT だけを引いている');
  /findPosition|findCategory|\.aliases/.test(orgSrc.slice(orgSrc.indexOf('export function _matchQueryField'), orgSrc.indexOf('export function _matchFieldSpecific')))
    ? fail('検索の判定がタグの層（ポジション/カテゴリの表）を読んでいる')
    : ok('検索の判定はタグの層の表を読んでいない');
  DICT.length >= 150 ? ok(`辞書は ${DICT.length} 行`) : fail(`辞書が ${DICT.length} 行しかない（150行以上を維持する）`);
}

// ── ② 1行の中は「同じもの」だけ ──
console.log('■ ② 1行の中に、別の行のものが混ざっていないこと');
{
  const head = new Map(DICT.map(r => [norm(r[0]), r[0]]));
  let mixed = 0;
  for (const row of DICT) {
    for (const w of row.slice(1)) {
      const owner = head.get(norm(w));
      if (owner && owner !== row[0]) { fail(`「${row[0]}」の行に、別の行の代表表記「${w}」が入っている`); mixed++; }
    }
  }
  if (!mixed) ok('どの行も、他の行のものを自分の別表記にしていない');
}

// ── ③ 1語の持ち主が1行に決まること ──
console.log('■ ③ 語の持ち主が1行に決まること');
{
  const owner = new Map();
  let dup = 0;
  for (const row of DICT) for (const w of row) {
    const k = norm(w);
    if (!k) continue;
    if (owner.has(k) && owner.get(k) !== row[0]) { fail(`「${w}」が「${owner.get(k)}」と「${row[0]}」の両方にある`); dup++; }
    else owner.set(k, row[0]);
  }
  if (!dup) ok(`${owner.size} 語すべて、持ち主が1行に決まっている`);
}

// ── ④ 効かない語・広すぎる語を置いていないこと ──
console.log('■ ④ 引いても効かない語・広すぎる語が無いこと');
{
  // 「スイープ」「エスケープ」のように、語そのものが広いが実在する言葉がある。
  // これは広さでは判定できないので、その行だけ中身を固定して、増えたら赤くする。
  // （タグ体系のカテゴリ一覧とは関係ない。辞書はタグの層から独立している）
  const BROAD_OK = {
    'スイープ':           ['sweep','sweeps'],
    'テイクダウン':       ['takedown','takedowns'],
    'エスケープ':         ['escape','escapes'],
    'サブミッション':     ['submission','submissions','サブミ'],
    'ガードリテンション': ['guard retention','retention','リテンション'],
    'パスガード':         ['guard pass','guard passing','ガードパス'],
  };
  const TOO_BROAD = ['pass','passing','guard','sweep','choke','submission','escape','defense','control',
                     'pressure','position','takedown','throw','finish','concept','entry','retention',
                     'パス','ガード','スイープ','チョーク','絞め','極め','エスケープ','コントロール'];
  let bad = 0, catSeen = 0;
  for (const row of DICT) {
    const [head, ...rest] = row;
    if (norm(head).length < 2) { fail(`代表表記「${head}」が正規化後1文字（この行は引けない）`); bad++; }
    if (rest.length === 0)     { fail(`「${head}」の行に別表記が無い（辞書に置く意味がない）`); bad++; }
    if (!row.some(x => /^[\x20-\x7E]+$/.test(x))) { fail(`「${head}」の行に英字表記が無い（別言語に届かない）`); bad++; }

    if (BROAD_OK[head]) {   // 広いが実在する言葉: 中身が変わっていないか
      catSeen++;
      if (rest.join('|') !== BROAD_OK[head].join('|')) {
        fail(`「${head}」の行が変わった: ${rest.join(' / ')}（想定: ${BROAD_OK[head].join(' / ')}）`);
        bad++;
      }
      continue;             // 語自体が広いので、下の「広すぎる語」判定はしない
    }
    for (const w of rest) {
      if (TOO_BROAD.includes(String(w).toLowerCase().trim())) { fail(`「${head}」に広すぎる語「${w}」`); bad++; }
    }
  }
  if (catSeen !== Object.keys(BROAD_OK).length) { fail(`広い言葉の行が ${catSeen}/${Object.keys(BROAD_OK).length} しかない（消したなら検査も直す）`); bad++; }
  if (!bad) ok('代表表記が引けること・英字表記があること・広すぎる語が無いこと、すべて満たしている');
}

// ── ⑤ 核になる語が、ちゃんと引けること ──
// 辞書はタグ体系と独立（タグはユーザーが自由に作るものになった）。
// だから「画面の選択肢と一致しているか」ではなく「BJJの言葉として引けるか」を見る。
console.log('■ ⑤ 核になる語が引けること');
{
  const CORE = ['デラヒーバ','リバースデラヒーバ','ハーフガード','クローズドガード','バタフライガード',
                'スパイダーガード','ラッソーガード','Xガード','SLX','サドル','タートル',
                'マウント','サイドコントロール','バックコントロール','ニーオンベリー',
                'パスガード','ニーカット','レッグドラッグ','トレアドール','ロングステップ',
                'スイープ','シザースイープ','ベリンボロ','アームバー','三角絞め','キムラ',
                'ギロチン','リアネイキドチョーク','ヒールフック','ニーバー','アンクルロック',
                'エスケープ','ヒップエスケープ','引き込み','シングルレッグタックル','ダブルレッグ','内股'];
  const miss = CORE.filter(w => !aliasNamesFor(w).length);
  miss.length ? fail(`核になる語が引けない: ${miss.join(' / ')}`)
              : ok(`核になる語 ${CORE.length} 語すべて引ける`);
  // 日→英・英→日が両方向で効くこと
  const both = [['デラヒーバ','de la riva'], ['ニーカット','knee cut'], ['三角絞め','triangle choke'], ['引き込み','guard pull']];
  const ngBoth = both.filter(([ja,en]) =>
    !aliasNamesFor(ja).some(x => String(x).toLowerCase() === en) ||
    !aliasNamesFor(en).some(x => x === ja));
  ngBoth.length ? fail(`日英が片道になっている: ${ngBoth.map(x => x[0]).join(' / ')}`)
                : ok('日→英・英→日の両方向で引ける');
}

// ── ⑥ 実際の検索が、関連へ広がらないこと ──
console.log('■ ⑥ 実物の検索で確かめる');
{
  const V = [
    { id:'ロングステップ(日)', title:'ロングステップパスのやり方', tags:[], pos:[], cat:['パスガード'], memo:'' },
    { id:'ロングステップ(英)', title:'Long Step Pass',            tags:[], pos:[], cat:[], memo:'' },
    { id:'スマッシュパス',     title:'Smash Pass Basics',          tags:[], pos:[], cat:['パスガード'], memo:'' },
    { id:'デラヒーバ(英)',     title:'De La Riva Guard Sweep',     tags:[], pos:['デラヒーバ'], cat:[], memo:'' },
    { id:'ロックダウン',       title:'ロックダウンの使い方',        tags:[], pos:['ハーフガード'], cat:[], memo:'' },
    { id:'ただのハーフ',       title:'ハーフガードの基本',          tags:[], pos:['ハーフガード'], cat:[], memo:'' },
    { id:'無関係な pass',      title:'Pass the Bar Exam',          tags:[], pos:[], cat:[], memo:'' },
  ];
  const expect = (word, want) => {
    const got = V.filter(v => q._matchQuery(v, q._parseQuery(word), null)).map(v => v.id).sort();
    got.join(',') === [...want].sort().join(',')
      ? ok(`「${word}」→ ${got.join(' / ') || '(0件)'}`)
      : fail(`「${word}」→ ${got.join(' / ') || '(0件)'}（想定: ${[...want].join(' / ') || '(0件)'}）`);
  };
  expect('ロングステップ', ['ロングステップ(日)', 'ロングステップ(英)']);  // 日英は届く
  expect('long step',     ['ロングステップ(日)', 'ロングステップ(英)']);
  expect('デラヒーバ',     ['デラヒーバ(英)']);                            // タグ経由でも英語タイトルに届く
  expect('ロックダウン',   ['ロックダウン']);                              // 親のハーフは出ない
  expect('パスガード',     ['ロングステップ(日)', 'スマッシュパス']);       // タグが付いたものだけ。"pass" だけの動画は出ない

  // 分類のキーワードを後から足されても（Firestore 由来）化けないこと
  const cat = CATS.find(c => c.id === 'pass');
  if (cat) {
    cat.aliases = ['ロングステップ', 'スマッシュパス', 'smash', 'drag'];
    window.rebuildCategoryIndex?.();
    window.rebuildSearchIndex?.();
    const got = V.filter(v => q._matchQuery(v, q._parseQuery('ロングステップ'), null)).map(v => v.id);
    got.includes('スマッシュパス')
      ? fail('分類キーワードを足すと「ロングステップ」がカテゴリに化ける')
      : ok('分類キーワードを後から足しても、検索は化けない');
  }
}

console.log(ng ? `\n✗ ${ng} 件の問題` : '\n✓ 全部通過');
process.exit(ng ? 1 : 0);
