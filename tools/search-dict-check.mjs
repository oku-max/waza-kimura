#!/usr/bin/env node
// ═══ 検索辞書（日英ブリッジ）の検査 ═══
// 使い方: node tools/search-dict-check.mjs
//
// なぜ要るか:
//   オーナーの方針（2026-09-24）:「表記の揺れは拾ってほしい。関連や文脈で拾うのは要らない。
//   ロングステップと調べてデラヒーバやスマッシュが出てくるのは検討違い」。
//   辞書は今後も増やすので、増やすときに "関連技" が混ざったら赤くなるようにしておく。
//   ここが崩れると、検索が「意図していないものを出す道具」に変わる。
//
//   見るのは4つ:
//     ① 同義語だけか（見出し語が他の見出しの同義語に入っていない）
//     ② 語が1つの見出しにしか属していないか（曖昧＝どちらに広がるか読めない）
//     ③ 死に語が無いか（1文字・広すぎる一語・先に引かれる辞書との衝突）
//     ④ 実物の検索が本当に関連へ広がっていないか（_matchQuery を動かして確かめる）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// ── 実物を読み込む（ブラウザ無し） ──
global.window = {};
global.document = { getElementById: () => null, querySelectorAll: () => [] };
await import(path.join(ROOT, 'js/tag-master.js'));
const { TECHNIQUE_BUILTIN: TECH, POSITIONS: POS, CATEGORIES: CATS, _normTag: norm, aliasNamesFor } = window;

const orgSrc = fs.readFileSync(path.join(ROOT, 'js/organize.js'), 'utf8');
const slice  = orgSrc.slice(orgSrc.indexOf('export function _parseQuery'), orgSrc.indexOf('// アドバンスドサーチ状態'));
if (!slice) { console.log('✗ organize.js から検索判定を切り出せない'); process.exit(1); }
const q = new Function('window', slice.replace(/^export /gm, '') + '\nreturn { _parseQuery, _matchQuery };')(window);

console.log('■ 辞書の形');
TECH.length >= 100
  ? ok(`技名の見出しが ${TECH.length} 件ある`)
  : fail(`技名の見出しが ${TECH.length} 件しかない（100件以上を維持する）`);

// ① 同義語だけか: 見出し語が、別の見出しの terms に入っていたらそれは「関連技」
console.log('■ ① 同義語だけで、関連技を混ぜていないこと');
const headByKey = new Map();
for (const t of TECH) headByKey.set(norm(t.ja), t.ja);
let crossed = 0;
for (const t of TECH) {
  for (const term of t.terms || []) {
    const owner = headByKey.get(norm(term));
    if (owner && owner !== t.ja) {
      fail(`「${t.ja}」の同義語に別の技の見出し「${owner}」が入っている（関連技は入れない）`);
      crossed++;
    }
  }
}
if (!crossed) ok('どの見出しも、他の見出しを自分の同義語にしていない');

// ② 1つの語が2つの見出しに属していないこと
console.log('■ ② 語の持ち主が1つに決まること');
const owner = new Map();
let dup = 0;
for (const t of TECH) {
  for (const term of [t.ja, ...(t.terms || [])]) {
    const k = norm(term);
    if (!k) continue;
    if (owner.has(k) && owner.get(k) !== t.ja) {
      fail(`「${term}」が「${owner.get(k)}」と「${t.ja}」の両方に属している（どちらへ広がるか読めない）`);
      dup++;
    } else owner.set(k, t.ja);
  }
}
if (!dup) ok(`${owner.size} 語すべて、持ち主が1つに決まっている`);

// ③ 死に語が無いこと
console.log('■ ③ 引いても効かない語を置いていないこと');
let dead = 0;
for (const t of TECH) {
  for (const term of t.terms || []) {
    const k = norm(term);
    if (k.length < 2) { fail(`「${t.ja}」の「${term}」は正規化後1文字（_termHit が誤爆源として弾くので効かない）`); dead++; }
  }
  const hasEn = (t.terms || []).some(x => /^[\x20-\x7E]+$/.test(x));
  if (!hasEn) { fail(`「${t.ja}」に英語表記が無い（日英ブリッジにならない）`); dead++; }
}
// 広すぎる一語を単独で置いていないか
const TOO_BROAD = ['pass','passing','guard','sweep','choke','submission','escape','defense','defence',
                   'control','pressure','position','takedown','throw','finish','concept','entry','retention',
                   'パス','ガード','スイープ','チョーク','絞め','極め','エスケープ','コントロール'];
for (const t of TECH) {
  for (const term of t.terms || []) {
    if (TOO_BROAD.includes(String(term).toLowerCase().trim())) {
      fail(`「${t.ja}」に広すぎる一語「${term}」が入っている（関係ない動画を巻き込む）`); dead++;
    }
  }
}
// 先に引かれる辞書（POSITIONS → CATEGORIES → 技名）と衝突していないか
const earlier = new Map();
for (const p of POS)  for (const k of [p.id, p.ja, p.en, ...(p.aliases || [])]) if (k) earlier.set(norm(k), `ポジション「${p.ja}」`);
for (const c of CATS) for (const k of [c.id, c.name, ...(c.aliases || []), ...(c.terms || [])]) if (k) { const n = norm(k); if (!earlier.has(n)) earlier.set(n, `カテゴリ「${c.name}」`); }
// 見出し(ja)が衝突していたら、そのエントリは検索語からたどり着けない＝丸ごと死ぬ。
// terms の衝突は「その語で引いたとき別の辞書が勝つ」だけで、見出しから引いたときの
// 展開先としては生きている（例: 「バックコントロール」→ back control で英語タイトルに届く）。
let shadowed = 0;
for (const t of TECH) {
  const hitHead = earlier.get(norm(t.ja));
  if (hitHead) { fail(`見出し「${t.ja}」は ${hitHead} と同じキーに潰れる。このエントリは検索から一度も引かれない`); dead++; }
  for (const term of (t.terms || [])) if (earlier.get(norm(term))) shadowed++;
}
console.log(`  · 参考: ${shadowed} 語は ポジション/カテゴリ辞書が先に引かれる（展開先としては生きている）`);
if (!dead) ok('1文字の語・広すぎる一語・先に引かれる辞書との衝突は無い');

// ④ 実際の検索が関連へ広がっていないこと
console.log('■ ④ 実物の検索が「関連」へ広がっていないこと');
const V = [
  { id:'ロングステップ(日)', title:'ロングステップパスの基本',        tags:[], pos:[], cat:[], memo:'' },
  { id:'ロングステップ(英)', title:'Long Step Pass Fundamentals',      tags:[], pos:[], cat:[], memo:'' },
  { id:'デラヒーバ',         title:'De La Riva Guard Sweep',           tags:[], pos:['デラヒーバ'], cat:[], memo:'' },
  { id:'スマッシュパス',     title:'スマッシュパスの入り方',            tags:[], pos:[], cat:['パスガード'], memo:'' },
  { id:'ニーオンベリー',     title:'Knee on Belly Attacks',            tags:[], pos:[], cat:[], memo:'' },
  { id:'肩固め',             title:'Arm Triangle from Mount',          tags:[], pos:[], cat:[], memo:'' },
];
const hits = (word) => V.filter(v => q._matchQuery(v, q._parseQuery(word), null)).map(v => v.id);
const expect = (word, want) => {
  const got = hits(word).sort().join(',');
  const exp = [...want].sort().join(',');
  got === exp ? ok(`「${word}」→ ${got || '(0件)'}`)
              : fail(`「${word}」→ ${got || '(0件)'} （期待: ${exp || '(0件)'}）`);
};
// 表記の揺れ（日本語で打って英語タイトルを当てる）は拾う
expect('ロングステップ', ['ロングステップ(日)', 'ロングステップ(英)']);
expect('long step',     ['ロングステップ(日)', 'ロングステップ(英)']);
expect('ニーオンベリー', ['ニーオンベリー']);
expect('肩固め',         ['肩固め']);
// 関連（同じカテゴリの別の技）は拾わない
expect('スマッシュパス', ['スマッシュパス']);
expect('デラヒーバ',     ['デラヒーバ']);

// ⑤ 分類キーワード（カテゴリの別名）で検索が広がらないこと
// 2026-09-24、オーナーの棚で「ロングステップ」が 2824本中 1725本に当たった。
// Firestore から読み込まれたカテゴリ「パスガード」の別名117語に化け、その中の
// pass / smash / drag / stack / cut のような広い語が当たっていた。
// 別名は「この語はこのカテゴリに入る」という分類用の表で、同義語ではない。
// ログイン後に非同期で読み込まれるため、間に合う前は22件・後は1725件と結果が変わっていた。
console.log('■ ⑤ カテゴリの分類キーワードで検索が広がらないこと');
{
  const cat = (window.CATEGORIES || []).find(c => c.id === 'pass');
  if (!cat) fail('カテゴリ pass が見つからない');
  else {
    cat.aliases = ['ロングステップ', 'スマッシュパス', 'smash', 'drag', 'stack', 'cut', 'パス'];
    window.rebuildCategoryIndex?.();
    const names = aliasNamesFor('ロングステップ') || [];
    const leaked = names.filter(n => ['smash', 'drag', 'stack', 'cut', 'パス', 'スマッシュパス'].includes(String(n)));
    leaked.length
      ? fail(`別名に登録した技名で検索すると、カテゴリの別名(${leaked.join(' / ')})まで広がる`)
      : ok('別名に技名を登録しても、その語はカテゴリに化けない');
    const V2 = [
      { id:'語が入っている', title:'ロングステップパスのやり方', tags:[], pos:[], cat:['パスガード'], memo:'' },
      { id:'同じカテゴリの別の技', title:'Smash Pass Basics', tags:[], pos:[], cat:['パスガード'], memo:'' },
    ];
    const got = V2.filter(v => q._matchQuery(v, q._parseQuery('ロングステップ'), null)).map(v => v.id);
    (got.length === 1 && got[0] === '語が入っている')
      ? ok('「ロングステップ」で、同じカテゴリの別の技は出ない')
      : fail(`「ロングステップ」→ ${got.join(',') || '(0件)'}（期待: 語が入っているものだけ）`);
  }
}

console.log(ng ? `\n✗ ${ng} 件の問題` : '\n✓ 全部通過');
process.exit(ng ? 1 : 0);
