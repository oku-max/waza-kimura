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
// タグ分類マスタ（POSITIONS）と検索辞書（SEARCH_DICT）をソースから注入
function extractPositions(src) {
  const out = [];
  const re = /ja:\s*'([^']+)'\s*,\s*en:\s*'([^']*)'/g;
  let m; while ((m = re.exec(src))) out.push({ ja: m[1], en: m[2] });
  return out;
}
// 検索辞書（SEARCH_DICT）は1行＝同じものの別表記。i18n はこの1枚から訳を作る。
function extractSearchDict(src) {
  const body = src.slice(src.indexOf('const SEARCH_DICT = ['), src.indexOf('window.SEARCH_DICT'));
  return body.split('\n')
    .filter(l => /^\s*\[/.test(l))
    .map(l => [...l.matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]));
}
const tagMasterSrc = fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8');
globalThis.POSITIONS = extractPositions(tagMasterSrc);
globalThis.SEARCH_DICT = extractSearchDict(tagMasterSrc);

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
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 検索辞書（js/tag-master.js）の terms / aliases は「同じものの別の言い方」を並べた
  // 検索用データで、画面には出ない（画面に出るのは見出しの ja / name / en の方）。
  // ここを未訳として数えると、本当に訳し忘れたUI文言が埋もれるので中身を空にして読む。
  // 検索辞書（SEARCH_DICT）の行と、タグの層の別名は「同じものの別の言い方」を並べた
  // 検索用データで、画面には出ない。未訳として数えると本物のUI文言が埋もれるので外す。
  if (f === 'js/tag-master.js') {
    src = src.replace(/(aliases):\s*\[[^\]]*\]/g, '$1: []');
    // 半角カナ→全角カナの変換テーブル（_HK_* / _FK_*）は文字の対応表で、画面には出ない
    src = src.replace(/^const _(HK|FK)_[A-Z] = '[^']*';$/gm, '');
    src = src.slice(0, src.indexOf('const SEARCH_DICT = [')) + src.slice(src.indexOf('window.SEARCH_DICT'));
  }
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
