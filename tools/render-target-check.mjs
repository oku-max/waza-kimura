#!/usr/bin/env node
// ═══ 描画先のIDが本当に画面にあるかの検査 ═══
// 使い方: node tools/render-target-check.mjs
//
// なぜ要るか:
//   2026-09-21、タググループ名を変える入力欄・テンプレート・禁止リスト・一括削除を
//   renderTagSettingsList() に実装したが、その描画先 #tag-settings-list は
//   index.html に存在しなかった。関数は先頭の
//       const el = document.getElementById('tag-settings-list'); if (!el) return;
//   で黙って抜けるので、エラーも出ず、他の検査も通り、**機能だけが画面に出ない**。
//   ブラウザのスモークでも気づけなかった（検査用のHTMLに自分でその要素を作っていた）。
//
//   CLAUDE.md の4つの故障モード
//   「作られていない / 保存されていない / 読めていない / 描けていない」のうち
//   **描けていない** の典型。静的に潰せるので潰す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 判定の考え方:
//   ある id が getElementById 以外のどこにも出てこない＝誰もその要素を作っていない。
//   逆に、JSが動的に作る要素はテンプレートやCSSに必ず名前が出る（実測で確認）。
//     動的に作るもの: mm-fab 20件 / n-sheet-overlay 31件 / vp-sub-ui 7件
//     誰も作らないもの: tag-settings-list 0件 / tag-visibility-btns 0件
//   この差で切り分ける。曖昧なものは拾わない（狼少年の検査は無いより悪い）。
const files = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const sources = new Map(files.map(f => [f, fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')]));
const cssDir = path.join(ROOT, 'css');
const css = fs.existsSync(cssDir)
  ? fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))
      .map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
  : '';

let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// 「取れなければ黙って抜ける」形だけを見る:
//   const el = document.getElementById('xxx'); if (!el) return;
const PAT = /getElementById\(\s*['"]([\w-]+)['"]\s*\)\s*;?\s*if\s*\(\s*!\s*\w+\s*\)\s*return/g;
// 「その id が getElementById 以外に出てくるか」を数えるための素材
// コメントは「作っている」根拠にならない。
// （自分で書いた // 別の器（#tag-settings-list）に描く というコメントのせいで
//   器のIDを打ち間違えても見逃した。実際に一度やった）
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')          // /* ... */
  .replace(/(^|[^:'"\\`])\/\/[^\n]*/g, '$1');  // // ...（URLの // は残す）
const haystack = [html, css, ...[...sources.values()].map(stripComments)].join('\n')
  .replace(/getElementById\(\s*['"][\w-]+['"]\s*\)/g, '');

// 以前から画面に無いもの（この検査を作る前からの分）。
// どれも「その機能が永久に出ない」ことを意味するので、いずれ潰す対象。
// ここに足すのは、事情を書いたときだけ。黙って足さない。
const KNOWN = new Set([
  'bvp-pos-inp', 'bvp-tags-inp', 'bvp-pos-sug', 'bvp-tags-sug',  // 一括編集のポジ/タグ入力
  'org-fs-acc-src-chips',                                        // 整理のフィルター
  'tag-visibility-btns',                                         // 旧タグ表示切替
  'usm-input',                                                   // 絞り込みの入力
  'vp-ab-add-bm-row',                                            // VPanelのブックマーク行
  'yt-sr-history-list',                                          // YouTube検索の履歴
]);

const missing = [];
const known = [];
for (const [f, src] of sources) {
  for (const m of src.matchAll(PAT)) {
    const id = m[1];
    // 部分一致で取りこぼさないよう、前後が識別子の続きでないことを見る。
    // （これを includes でやると 'tag-settings-list-TYPO' が 'tag-settings-list' に
    //   当たってしまい、器のIDを打ち間違えても気づけない。実際に一度見逃した）
    const exact = new RegExp(`(^|[^\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`);
    if (exact.test(haystack)) continue;   // 誰かが作っている／CSSが知っている
    const line = src.slice(0, m.index).split('\n').length;
    (KNOWN.has(id) ? known : missing).push(`js/${f}:${line}  #${id}`);
  }
}

missing.length === 0
  ? ok(`新しく画面に無い描画先は増えていない（既知 ${known.length}件は据え置き）`)
  : fail(`描画先が画面に無い（＝その機能は永久に出ない） ${missing.length}件\n      ` + missing.join('\n      '));
if (known.length) {
  console.log('  ─ 以前から画面に無いもの（いずれ潰す）─');
  known.forEach(k => console.log('     ' + k));
}

console.log(ng === 0 ? '\n✅ 描画先: 問題なし' : `\n❌ 失敗 ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
