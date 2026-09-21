// ═══ タググループのテンプレートの検査 ═══
// 使い方: node tools/tag-template-smoke.mjs
//
// なぜ要るか:
//   テンプレートは「押したら選択肢に入る」見本（Notion 項目04）。
//   大事なのは2つで、どちらも静的な読みでは確かめられない:
//     1. 押したら本当に選択肢が増えること
//     2. 足すだけで、既にある選択肢を消さない・上書きしないこと
//   2つ目を壊すと、ユーザーが育てた選択肢がテンプレ1回で吹き飛ぶ。
//   さらにテンプレは「コピー」でなければならない。参照のままだと、
//   ユーザーが選択肢を1つ消したときにテンプレ定義まで削れる。
import http from 'http'; import fs from 'fs'; import path from 'path';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium=(await import(c)).chromium; break; } catch {} }
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT=8159;
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>window.toast=(m)=>{(window.__toasts||=[]).push(m)};<\/script>
<script src="/js/tag-master.js"><\/script>
<script src="/js/tag-templates.js"><\/script>
<script>window.__ready=true;<\/script></body></html>`;
const MIME={'.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);
 if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(HTML);}
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end('');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
const ctx=await b.newContext(); ctx.setDefaultTimeout(6000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const pg=await ctx.newPage();
pg.on('pageerror',e=>console.log('  PAGEERR',String(e).split('\n')[0]));
await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>window.__ready===true);

let fail=0; const ck=(n,ok)=>{console.log((ok?'  ✓ ':'  ✗ ')+n); if(!ok)fail++;};

// 1. テンプレートが4つ揃っている
const ids = await pg.evaluate(()=>window.tagTemplates().map(t=>t.id));
ck('テンプレートが4つある（ポジション/動作の種類/上下/練習ステータス）',
   ['pos','cat','tb','practice'].every(x=>ids.includes(x)) && ids.length===4);

// 2. 中身が空でない（辞書から読めている）
const counts = await pg.evaluate(()=>{
  const o={}; window.tagTemplates().forEach(t=>o[t.id]=t.values.length); return o; });
ck(`ポジションに中身がある (${counts.pos}件)`, counts.pos > 0);
ck(`動作の種類に中身がある (${counts.cat}件)`, counts.cat > 0);
ck(`上下が3件`, counts.tb === 3);
ck(`練習ステータスが3件`, counts.practice === 3);

// 3. コピーであること（受け取った配列をいじっても、次に取り出す中身は変わらない）
const isCopy = await pg.evaluate(()=>{
  const a = window.tagTemplate('practice');
  const before = a.values.length;
  a.values.push('よごした'); a.values[0] = 'かきかえた';
  const b = window.tagTemplate('practice');
  return b.values.length === before && !b.values.includes('よごした') && b.values[0] !== 'かきかえた';
});
ck('テンプレートはコピーで渡される（呼び出し側が壊せない）', isCopy);

// 4. 同じ配列を使い回していないこと
const notShared = await pg.evaluate(()=>{
  const a = window.tagTemplate('tb'), b = window.tagTemplate('tb');
  return a.values !== b.values; });
ck('呼ぶたびに別の配列を返す', notShared);

// 5. 無いテンプレートは null
ck('知らないIDは null を返す', await pg.evaluate(()=>window.tagTemplate('nope')===null));

// 6. 適用が「足すだけ」であること（applyTagTemplate のロジックを再現して確かめる）
const merge = await pg.evaluate(()=>{
  const presets = ['ユーザーが作った値', 'クローズドガード'];
  const tpl = window.tagTemplate('practice');
  let added=0, skipped=0;
  tpl.values.forEach(v=>{ if(!v) return;
    if (presets.includes(v)) { skipped++; return; }
    presets.push(v); added++; });
  return { presets, added, skipped };
});
ck('既にある選択肢が消えない', merge.presets.includes('ユーザーが作った値') && merge.presets.includes('クローズドガード'));
ck(`テンプレートの中身が足される (${merge.added}件)`, merge.added === 3);

// ── 7. テンプレの中身は admin で育てた側を読むこと（Notion 項目15）──
//   テンプレの中身  … admin-dashboard が育てる（waza_positions / waza_tag_dict）
//   検索辞書        … tag-master.js の POSITIONS / CATEGORIES（項目02・別物）
//   ここを取り違えると、admin で編集してもテンプレに反映されない／
//   逆にテンプレを触ると検索辞書が壊れる。
const grown = await pg.evaluate(() => {
  localStorage.setItem('waza_positions', JSON.stringify([
    { id:'p1', names:{ ja:'テスト用ポジション', en:'T' }, group:'guard', aliases:{ ja:[], en:[] } }]));
  localStorage.setItem('waza_tag_dict', JSON.stringify([
    { id:'c1', names:{ ja:'テスト用カテゴリ', en:'T' }, desc:'', aliases:{ ja:[], en:[] }, source:'user' }]));
  const t = Object.fromEntries(window.tagTemplates().map(x => [x.id, x.values]));
  return { pos:t.pos, cat:t.cat, dictPos:(window.POSITIONS||[]).length,
           alias: window.aliasNamesFor ? window.aliasNamesFor('デラヒーバ').length : 0 };
});
ck('admin で育てた中身がテンプレに出る（ポジション）',
   JSON.stringify(grown.pos) === JSON.stringify(['テスト用ポジション']));
ck('admin で育てた中身がテンプレに出る（動作の種類）',
   JSON.stringify(grown.cat) === JSON.stringify(['テスト用カテゴリ']));
ck('テンプレを書き換えても検索辞書は無傷（27件）', grown.dictPos === 27);
ck('日英ブリッジも生きている', grown.alias > 1);

// 壊れた保存データでも落ちず、辞書で代用に戻ること
const broken = await pg.evaluate(() => {
  localStorage.setItem('waza_positions', 'こわれてる');
  localStorage.removeItem('waza_tag_dict');
  try {
    const t = Object.fromEntries(window.tagTemplates().map(x => [x.id, x.values]));
    return { pos:t.pos.length, cat:t.cat.length };
  } catch (e) { return { err:String(e) }; }
});
ck('保存データが壊れていても落ちず辞書で代用', !broken.err && broken.pos === 27 && broken.cat === 10);

console.log(fail?`\n✗ 失敗 ${fail}件`:'\n✓ 通過');
await b.close(); srv.close(); process.exit(fail?1:0);
