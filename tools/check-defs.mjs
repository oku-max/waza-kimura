// 「消したのに、まだ使われている」定義を検出する。
//
// 推測で入れた検査ではない。同じ失敗を3回している:
//   v52.605  まとめて5関数を消した（_aiPrompt 他）
//   v52.630  範囲置換で壊れた行を作りビルドが止まった
//   v52.646  _translateLines を差し替えた際に _subFileName を巻き込んで消した
// いずれも「範囲を指定してソースを丸ごと差し替える」編集で、意図しない行まで
// 消えたのが原因。node --check も wrangler dry-run も通る（未定義の参照は
// 実行時にしか現れない）ので、この検査がないとユーザーが踏むまで気づけない。
//
//   node tools/check-defs.mjs          … 未コミットの変更を対象
//   node tools/check-defs.mjs HEAD~1   … 指定コミットとの差分を対象
//
// 方針: 静的解析でスコープまで見ようとすると誤検出だらけになって使い物に
// ならない（実際に一度失敗した）。見たいのは「消えたかどうか」だけなので、
// 差分で消えた宣言だけを取り出し、それがまだ参照されているかを見る。

import { execSync } from 'child_process';

const base = process.argv[2] || '';
const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const diff = sh(`git diff ${base} -- '*.js' '*.html'`);
if (!diff.trim()) { console.log('✓ 変更なし'); process.exit(0); }

// 差分から「消えた行にあった宣言」と「足された行にあった宣言」を集める
// 対象は「モジュール全体で共有される定義」だけに絞る。
// 関数の中のローカル変数（const off = ... など）まで拾うと誤検出だらけになり、
// 狼少年の検査は無いより悪い。この規約のコードでは共有ヘルパーは _ で始まるか、
// function 宣言か、window への代入のいずれか。
const DECL = [
  [/^(?:async\s+)?function\s*\*?\s*(\w+)\s*\(/, true],   // function x() … 常に対象
  [/^class\s+(\w+)/,                                true],
  [/^window\.(\w+)\s*=/,                           true],
  [/^(?:const|let|var)\s+(\w+)\s*[=;]/,            false],  // const x = … _ 始まりのみ
];
const declOf = (line) => {
  const t = line.trim();
  for (const [re, always] of DECL) {
    const m = t.match(re);
    if (m && (always || m[1].startsWith('_'))) return m[1];
  }
  return null;
};

const removed = new Map();   // name -> ファイル
const added   = new Set();
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) { file = line.slice(6); continue; }
  if (line.startsWith('-') && !line.startsWith('---')) {
    const n = declOf(line.slice(1)); if (n) removed.set(n, file);
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    const n = declOf(line.slice(1)); if (n) added.add(n);
  }
}

// 移動しただけ（消して同じ名前を足した）なら問題なし
for (const n of added) removed.delete(n);
if (!removed.size) { console.log('✓ 消えた宣言なし'); process.exit(0); }

// 消えた名前が、いまのソースでまだ使われていないか
const files = sh(`git ls-files '*.js' '*.html'`).trim().split('\n').filter(Boolean);
const bodies = files.map(f => ({ f, t: sh(`cat ${JSON.stringify(f)}`) }));

const problems = [];
for (const [name, from] of removed) {
  const re = new RegExp(`(^|[^\\w.$'"])${name}\\s*[(.\\[]`, 'm');
  const hits = bodies.filter(b => re.test(b.t)).map(b => b.f);
  if (hits.length) problems.push({ name, from, hits });
}

if (problems.length) {
  console.error('✗ 消したのに、まだ使われている定義:');
  for (const p of problems) {
    console.error(`  ${p.name}  （${p.from} から消滅 / 参照: ${p.hits.join(', ')}）`);
  }
  console.error('\n編集で意図せず巻き込んで消していないか確認すること。');
  process.exit(1);
}
console.log(`✓ 消えた宣言 ${removed.size}件 — いずれも参照されていない`);
