#!/usr/bin/env node
// ═══ 検索辞書を読める一覧にする ═══
// 使い方: node tools/search-dict-md.mjs        … docs/search-dict.md を作り直す
//         node tools/search-dict-md.mjs --check … 中身が辞書と合っているかだけ見る
//
// なぜ要るか: 辞書はコードの中にあって、オーナーが読む場所が無かった。
// 手で書いた一覧は必ず古くなって嘘になるので、辞書から作り直せるようにして、
// search-dict-check が「古いままか」を見張る。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = path.join(ROOT, 'docs/search-dict.md');

export function buildMarkdown() {
  const src  = fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8');
  const body = src.slice(src.indexOf('const SEARCH_DICT = ['), src.indexOf('window.SEARCH_DICT'));
  const ver  = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/WAZA KIMURA (v[\d.]+)/) || [,'?'])[1];
  const rowRe = /^\s*\[(.*)\],\s*$/;
  const secRe = /^\s*\/\/ ── (.+?) ──/;
  let n = 0, words = 0;
  const rows = [], out = [];
  const flush = () => {
    if (!rows.length) return;
    out.push('| # | 代表表記 | 同じものの別の書き方 |', '|---|---|---|', ...rows, '');
    rows.length = 0;
  };
  for (const line of body.split('\n')) {
    const sm = line.match(secRe);
    if (sm) { flush(); out.push('## ' + sm[1], ''); continue; }
    const rm = line.match(rowRe);
    if (!rm) continue;
    const ws = [...rm[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]);
    n++; words += ws.length;
    rows.push(`| ${n} | **${ws[0]}** | ${ws.slice(1).join(' / ')} |`);
  }
  flush();
  return [
    '# WAZA KIMURA 検索辞書', '',
    `${ver} 時点。検索が引く表はこれ1枚だけです（\`js/tag-master.js\` の \`SEARCH_DICT\`）。`, '',
    `**全 ${n} 行（書き方は延べ ${words} 通り）**`, '',
    '- **1行＝同じもの。** 先頭が代表表記、その後ろは同じものの別の書き方（日本語・英語・略称）',
    '- 打った語がこの行のどれかに一致すると、**同じ行の全部の書き方で**タイトル・チャンネル・プレイリスト・タグ・メモを探します',
    '- 別の技・上位/下位・分類のキーワードは入れていません（「ロングステップ」でデラヒーバは出ない）',
    '- 全角/半角・カタカナ/ひらがな・長音・区切り・英語の複数形は、辞書に書かなくても吸収されます',
    '',
    '> このファイルは `node tools/search-dict-md.mjs` で作り直します。手で書き換えない。', '',
    ...out,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = buildMarkdown();
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (cur === md) { console.log('✓ docs/search-dict.md は辞書と合っている'); process.exit(0); }
    console.log('✗ docs/search-dict.md が古い（node tools/search-dict-md.mjs で作り直す）');
    process.exit(1);
  }
  fs.writeFileSync(OUT, md);
  console.log(cur === md ? '変更なし' : '作り直した', '→ docs/search-dict.md');
}
