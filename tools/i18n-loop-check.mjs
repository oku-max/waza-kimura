#!/usr/bin/env node
// ═══ 英語表示の自動翻訳が「同じ文字を書き続けて固まらない」ことの検査 ═══
// 使い方: node tools/i18n-loop-check.mjs
//
// 2026-09-27 に見つけた不具合（v52.847 で修正）:
//   辞書に '日本語':'日本語'（言語切替ボタンは英語表示でも「日本語」のまま見せる）がある。
//   自動翻訳は文字が変わるたびに呼ばれ（MutationObserver の characterData）、
//   訳を nodeValue に書く。同じ値を書いても「変わった」と通知が来るので、
//   それをまた訳して同じ値を書き…を無限に繰り返し、英語表示のページが固まっていた。
//   ヘッドレスの Chromium（英語設定）で開くと、読み込み直後から応答しなかった。
//
// ここでは本物の _translateTextNode を i18n.js から取り出し、
// 「書くたびに通知が来てもう一度呼ばれる」状況を作って、コード中の日本語の文言すべてで
// 書き込みが1回で止まることを見る。ブラウザ不要。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JA = /[぀-ヿ一-鿿]/;
let fail = 0;
const ck = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail ? '\n      → ' + detail : ''));
  if (!ok) fail++;
};

// ── 本物の翻訳エンジンを読む（i18n-check と同じ最小スタブ） ──
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => 'en', setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
globalThis.document = { documentElement: { lang: '' }, readyState: 'loading', addEventListener() {}, querySelectorAll: () => [], body: null };
const tagMasterSrc = fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8');
globalThis.POSITIONS = [...tagMasterSrc.matchAll(/ja:\s*'([^']+)'\s*,\s*en:\s*'([^']*)'/g)].map(m => ({ ja: m[1], en: m[2] }));
const i18nSrc = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
new Function(i18nSrc)();
const tryTranslate = globalThis._wkAutoI18n?.tryTranslate;
ck('翻訳エンジンを読み込めた', typeof tryTranslate === 'function');
if (!tryTranslate) process.exit(1);
globalThis._wkAutoI18n.rebuild();

// ── 本物の _translateTextNode を取り出す ──
const start = i18nSrc.indexOf('function _translateTextNode(node)');
ck('_translateTextNode が i18n.js にある', start >= 0);
if (start < 0) process.exit(1);
let depth = 0, end = -1;
for (let i = i18nSrc.indexOf('{', start); i < i18nSrc.length; i++) {
  if (i18nSrc[i] === '{') depth++;
  else if (i18nSrc[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const fnSrc = i18nSrc.slice(start, end);
const _JA_RE = JA;
const _skipNode = () => false;
const _translatePhrase = tryTranslate;
const translateTextNode = new Function('_JA_RE', '_skipNode', '_translatePhrase', fnSrc + '\nreturn _translateTextNode;')(_JA_RE, _skipNode, _translatePhrase);

// 書くたびに通知が来る文字ノード（MutationObserver の characterData と同じ動き）。
// 50回を超えたら「止まらない」と判断する。
function simulate(text) {
  let value = text, writes = 0, calls = 0;
  const node = { parentElement: {} };
  Object.defineProperty(node, 'nodeValue', {
    get: () => value,
    set: v => { value = v; writes++; if (writes <= 50) { calls++; translateTextNode(node); } },
  });
  translateTextNode(node);
  return { writes, value };
}

// ── 1. 今回の不具合そのもの ──
const r1 = simulate('日本語');
ck("「日本語」（訳しても同じ）で書き込みが止まる", r1.writes <= 1, `書き込み ${r1.writes}回`);
const r2 = simulate('言語: 日本語');
ck("「言語: 日本語」（訳に日本語が残る）で書き込みが止まる", r2.writes <= 1, `書き込み ${r2.writes}回 → ${r2.value}`);

// ── 2. 訳す仕組みが壊れていない（止めすぎていない） ──
const r3 = simulate('キャンセルしました');
ck('ふつうの文言は1回書いて英語になる', r3.writes === 1 && !JA.test(r3.value), `${r3.writes}回 → ${r3.value}`);
const r4 = simulate('  キャンセルしました  ');
ck('前後の空白は残して訳す', r4.value === '  Cancelled  ', JSON.stringify(r4.value));

// ── 3. コード中の日本語の文言すべてで、書き込みが1回で止まる ──
const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
const phrases = new Set();
const litRe = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(litRe)) {
    const t = m[1] ?? m[2];
    if (t && JA.test(t) && t.length <= 120) phrases.add(t);
  }
}
const loops = [];
for (const t of phrases) {
  const r = simulate(t);
  if (r.writes > 1) loops.push(`${JSON.stringify(t)} → 書き込み ${r.writes}回`);
}
ck(`コード中の日本語の文言 ${phrases.size}件すべてで、書き込みが1回で止まる`, loops.length === 0, loops.slice(0, 8).join('\n      → '));

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 英語表示の自動翻訳は同じ文字を書き続けない');
process.exit(fail ? 1 : 0);
