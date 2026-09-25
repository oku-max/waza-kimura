// ═══ まとめて編集パネルが開けるかの検査 ═══
// 使い方: node tools/bulk-drawer-smoke.mjs
//
// なぜ要るか:
//   v52.801（タググループ名の取り出しを tagLabel() に集約）で、bulk.js のパネルの見出しが
//   _e(...) を呼ぶようになったが、_e は bulk.js のどこにも無かった（settings.js の中の
//   ローカル関数と同じ名前だっただけ）。パネルを組み立てるたびに ReferenceError で止まり、
//   まとめて編集が開けなかった。v52.833 で旧 #Tag モーダルを消したとき、check-defs が
//   「_e が消えたのに bulk.js が使っている」と気付いて発覚した。
//   パネルの HTML を実際に組み立てて、例外が出ないことを見る。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8263;
const HTML = `<!DOCTYPE html><html><body><script>
 window.videos=[{id:'a',tb:['立ち'],cat:['パス'],pos:['デラヒーバ'],tags:['キムラ']},{id:'b',tb:[],tags:[]}];
 window.selIds=new Set(['a','b']);
 window.tagSettings=['tb','cat','pos','tags'].map(k=>({key:k,visible:true,presets:[]}));
 window.tagLabel=k=>({tb:'タグ1<b>',cat:'タグ2',pos:'タグ3',tags:'タグ4'})[k];
 window.normStatus=s=>s||'未着手'; window.STATUS_CANON=['未着手','理解','練習中','マスター'];
<\/script><script type="module">
 import * as B from '/js/bulk.js';
 try { const h=B.buildBulkDrawerHTML(); window.__r={ok:true,len:h.length,esc:h.includes('タグ1&lt;b&gt;')}; }
 catch(e){ window.__r={ok:false,err:String(e)}; }
<\/script></body></html>`;
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') { r.writeHead(200, {'Content-Type':'text/html'}); return r.end(HTML); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type':'text/javascript'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext(); await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const pg = await ctx.newPage();
await pg.goto(`http://localhost:${PORT}/`);
await pg.waitForFunction(() => window.__r, null, { timeout: 8000 }).catch(() => {});
const r = await pg.evaluate(() => window.__r);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d ? '  → ' + d : '')); if (!ok) fail++; };
ck('まとめて編集パネルが組み立てられる（例外なし）', r && r.ok, JSON.stringify(r));
ck('グループ名は HTML として埋め込まずにエスケープする', r && r.esc, JSON.stringify(r));
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
