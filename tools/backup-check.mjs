// バックアップの「書き出したのに戻せない項目」を見つける。
//
// なぜ必要か: notes はエクスポートには入っていたのに wazaImport が復元しておらず、
// 「復元したのにノートだけ消えている」状態を長く放置していた。静的検査でも
// ブラウザのスモークテストでも拾えない（どちらもエラーにならないため）。
// エクスポートのキーと、インポートが参照しているキーを突き合わせて検出する。
//
// 使い方: node tools/backup-check.mjs
// 終了コード: 0 = 対応漏れなし / 1 = あり

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 意図的に「保管のみ・復元しない」もの。増やす時は理由をコメントに残すこと。
const EXPORT_ONLY = {
  version:    'ファイル形式のバージョン',
  exportedAt: '書き出した日時',
  type:       'light / full の別',
  tagMaster:  'クライアントから書き戻す経路が無い（管理画面の管轄）',
  tagRules:   '同上',
};

const body = (name, kind) => {
  const re = new RegExp(`${kind}\\s+${name}\\b`);
  const i  = src.search(re);
  if (i < 0) throw new Error(`${name} が見つかりません`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(`${name} の範囲を取れません`);
};

const exportBody = body('_wazaCollectLightData', 'async function');

// window.xxx = async function 形式のものはこちらで取る
function assignedBody(name) {
  const i = src.indexOf(`window.${name} = async function`);
  if (i < 0) throw new Error(`${name} が見つかりません`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(`${name} の範囲を取れません`);
}
const imp = assignedBody('wazaImport');
const full = assignedBody('wazaExportFull');

// エクスポートの return オブジェクトの直下キーだけを拾う（ネストは深さで除外）
const keys = [];
{
  const r = exportBody.indexOf('return {');
  let d = 0;
  for (let k = exportBody.indexOf('{', r); k < exportBody.length; k++) {
    const c = exportBody[k];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') { d--; if (!d) break; }
    else if (d === 1 && /[a-zA-Z_]/.test(c)) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/.exec(exportBody.slice(k));
      if (m) { keys.push(m[1]); k += m[0].length - 1; }
    }
  }
}
// wazaExportFull が足すキーも対象にする
for (const m of full.matchAll(/\.\.\.data,\s*type:[^,]+,\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)) keys.push(m[1]);
for (const k of Object.keys(EXPORT_ONLY)) if (!keys.includes(k)) keys.push(k);

// 確認ダイアログも data.xxx を読む（件数表示のため）。そこだけで参照されていても
// 「復元している」ことにはならないので、実際の復元処理が始まる位置から後だけを見る。
const gate = imp.indexOf('if (!confirmed) return;');
if (gate < 0) { console.error('確認ダイアログの位置が特定できません（wazaImport の構造が変わった？）'); process.exit(2); }
const restore = imp.slice(gate);

// wazaImport は data をまるごと別の関数へ渡すことがある（applyRemoteSettings など）。
// その場合は渡した先の本文も「復元しているコード」として一緒に見る。
let reach = restore;
for (const m of restore.matchAll(/window\.([a-zA-Z_][a-zA-Z0-9_]*)\?\.\(data\)/g)) {
  const fn = m[1];
  let found = false;
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const i = s.search(new RegExp(`function ${fn}\\s*\\(`));
    if (i < 0) continue;
    let d = 0;
    for (let k = s.indexOf('{', i); k < s.length; k++) {
      if (s[k] === '{') d++;
      else if (s[k] === '}') { d--; if (!d) { reach += '\n' + s.slice(i, k + 1); found = true; break; } }
    }
    if (found) { console.log(`（${fn}() に data を丸ごと渡しているので js/${f} の中身も見ます）`); break; }
  }
  if (!found) console.log(`⚠️ ${fn}() の実体が見つからないため、その先は確認できていません`);
}

const missing = [];
for (const k of keys) {
  if (EXPORT_ONLY[k]) continue;
  if (new RegExp(`data(?:\\?)?\\.${k}\\b`).test(reach)) continue;
  missing.push(k);
}

console.log(`書き出す項目: ${keys.length}件`);
for (const k of keys) {
  const mark = EXPORT_ONLY[k] ? '－' : (missing.includes(k) ? '✗' : '✓');
  const note = EXPORT_ONLY[k] ? `（保管のみ: ${EXPORT_ONLY[k]}）` : (missing.includes(k) ? ' ← 復元されない' : '');
  console.log(`  ${mark} ${k}${note}`);
}
if (missing.length) {
  console.log(`\n✗ 書き出しているのに復元しない項目が ${missing.length}件: ${missing.join(', ')}`);
  console.log('  復元処理を足すか、意図的なら EXPORT_ONLY に理由付きで登録してください。');
  process.exit(1);
}
console.log('\n✓ 書き出した項目はすべて復元される（または保管のみと明示されている）');
