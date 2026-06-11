#!/usr/bin/env node
// ═══ i18n 未訳チェッカー ═══
// 使い方: node tools/i18n-check.mjs
//
// コードベース全体(index.html + js/*.js)から日本語文字列リテラルを抽出し、
// 本物の js/i18n.js（翻訳エンジン）に通して「英語モードで未訳になるもの」を列挙する。
// ブラウザ不要・スクショ不要。リリース前やUI文言追加後に1回実行すればよい。
//
// 出力の見方:
//   - 件数0 → 追加作業なし
//   - 出てきた文字列 → js/i18n.js の STATIC_AUTO に追加（テンプレート文は AUTO_PATTERNS へ）
//   - ユーザーデータ（タグ名・ノート名等）やコード片の誤検出は無視してよい
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JA = /[぀-ヿ一-鿿]/;

// ── 1. 最小DOMスタブで本物の i18n.js をロード ──
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => 'en', setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
globalThis.document = {
  documentElement: { lang: '' },
  readyState: 'loading',
  addEventListener() {},
  querySelectorAll: () => [],
  body: null,
};
// タグ分類マスタ（POSITIONS / TECHNIQUE_BUILTIN）をソースから正規表現で注入
function extractPositions(src) {
  const out = [];
  const re = /ja:\s*'([^']+)'\s*,\s*en:\s*'([^']*)'/g;
  let m; while ((m = re.exec(src))) out.push({ ja: m[1], en: m[2] });
  return out;
}
function extractTechniques(src) {
  const out = [];
  const re = /\{\s*ja:\s*'([^']+)'\s*,\s*terms:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src))) {
    const terms = [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]);
    out.push({ ja: m[1], terms });
  }
  return out;
}
const tagMasterSrc = fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8');
globalThis.POSITIONS = extractPositions(tagMasterSrc);
globalThis.TECHNIQUE_BUILTIN = extractTechniques(tagMasterSrc);

const i18nSrc = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
new Function(i18nSrc)();
const tryTranslate = globalThis._wkAutoI18n?.tryTranslate;
if (!tryTranslate) { console.error('i18n.js から tryTranslate を取得できません'); process.exit(1); }
globalThis._wkAutoI18n.rebuild();

// ── 2. 日本語文字列リテラルを全抽出（コメント/コード片は除外） ──
const litRe = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gs;
const codeTok = /\/\/|\/\*|\*\/|=>|\.\w+\(|window\.|document\.|function\b|return\b|const\b|let\b|==|!=|&&|\|\||;|\{|\}|<[a-zA-Z/]|style=|class=/;
function isUiPhrase(t) {
  if (!t || !JA.test(t) || t.length > 90) return false;
  if (t[0] === '#' || t[0] === '*' || t[0] === '/' || t[0] === ')' || t[0] === '?') return false;
  if (codeTok.test(t)) return false;
  if (/[a-zA-Z_]{3,}\.[a-zA-Z_]/.test(t)) return false;
  if (/→\s*(pos|cat|tags|TB)=/.test(t) || /→ (トップ|ボトム)/.test(t)) return false; // AIルール設定の説明
  if (t.startsWith('_b')) return false;
  if (/^[ぁ-んァ-ヴー]$/.test(t) || /^[ぁ-ん]行$/.test(t)) return false; // かな索引
  if ('をとにはがのでも、）」'.includes(t[0])) return false; // 補間で割れた断片
  return true;
}
const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
const phrases = new Map(); // phrase -> first file
for (const f of files) {
  if (f === 'js/i18n.js') continue; // 辞書自身は対象外
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m;
  while ((m = litRe.exec(src))) {
    const raw = (m[1] ?? m[2] ?? m[3]).replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!JA.test(raw)) continue;
    const templ = raw.replace(/\$\{[^}]*\}/g, '3'); // 補間は数値想定で代表値に
    for (const frag of templ.split(/<[^>]+>|\n/)) {
      const t = frag.trim().replace(/^[>"'\s]+|["'\s]+$/g, '').trim();
      if (isUiPhrase(t) && !phrases.has(t)) phrases.set(t, f);
    }
  }
}

// ── 3. エンジンに通して未訳を列挙 ──
const misses = [];
for (const [t, f] of phrases) {
  if (tryTranslate(t) == null) misses.push([t, f]);
}
misses.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
console.log(`抽出: ${phrases.size} 句 / 未訳: ${misses.length} 句`);
for (const [t, f] of misses) console.log(`  [${f}] ${t}`);
process.exit(misses.length > 0 ? 2 : 0);
