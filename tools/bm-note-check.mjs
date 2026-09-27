// ブックマークの説明（note）が、題名の横の ⌄ で開閉でき、見出しの1つのボタンで全部を開閉できること。
// なぜ必要か: 説明の見た目の指定がスマホの「次の動画」シートを作る時にだけ読み込まれていて、
// PCでは効かず、題名より大きい素の文字で全文が出ていた（v52.849 で直した）。
// 使い方: node tools/bm-note-check.mjs
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const pw = await import(path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs'));
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'), PORT=8143;
let html=fs.readFileSync(ROOT+'/index.html','utf8').replace(/<script\b[\s\S]*?<\/script>/g,'');
html=html.replace('</body>',`<script type="module">
import * as vp from './js/vpanel.js'; import * as se from './js/snapshot-editor.js';
window.vpSaveMemo=vp.vpSaveMemo; window.initSnapshotSection=se.initSnapshotSection; window.toast=m=>console.log('TOAST',m);
window.debounceSave=()=>{}; window.__vp=vp; window.__ready=true;
</script></body>`);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(html)}
 const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('')}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f))});
await new Promise(r=>srv.listen(PORT,r));
const exe=process.env.PLAYWRIGHT_CHROMIUM||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await pw.chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
const ctx=await b.newContext({viewport:{width:1280,height:860}});
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const page=await ctx.newPage(); const errs=[];
page.on('pageerror',e=>errs.push(String(e).split('\n')[0])); page.on('console',m=>{if(m.type()==='error'||m.text().startsWith('TOAST'))errs.push(m.text().slice(0,150))});
await page.goto(`http://localhost:${PORT}/`); await page.waitForFunction(()=>window.__ready,null,{timeout:15000});
await page.evaluate(()=>{window.videos=[{id:'bm1',title:'t',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',bookmarks:[
 {time:0,label:'スマッシュパスの概念',note:'ブルドーザーのようなパスの概念からスマッシュパスの名称と意味を解説する。'},
 {time:77,label:'失敗するスマッシュパス',note:'相手に足を入られたり、スイープされるなど、うまくいかないスマッシュパスの例を挙げる。'},
 {time:195,label:'胸の寄せ方が大事',note:''},
 {time:226,label:'☆相手の腕フレームのつぶし方',note:'反対方向へ流してから体に沿ってプレッシャー'}]}];
 window.__vp._openPanel('bm1','https://www.youtube.com/embed/x',null,'youtube');});
await page.waitForSelector('#vp-bm-list-bm1',{timeout:8000}); await page.waitForTimeout(500);
const st=()=>page.evaluate(()=>({notes:document.querySelectorAll('#vp-bm-list-bm1 .vp-bm-note').length,togs:document.querySelectorAll('#vp-bm-list-bm1 .vp-bm-note-tog').length,btn:document.querySelector('[data-bm-alltog="bm1"]')?.textContent,hidden:document.querySelector('[data-bm-alltog="bm1"]')?.hidden,fs:(()=>{const n=document.querySelector('#vp-bm-list-bm1 .vp-bm-note');return n&&getComputedStyle(n).fontSize})()}));
const r0=await st();
await page.evaluate(()=>vpBmNoteToggle('bm1',1)); const r1=await st();
await page.evaluate(()=>vpBmNoteAll('bm1')); const r2=await st();
await page.evaluate(()=>vpBmNoteAll('bm1')); const r3=await st();
const saved=await page.evaluate(()=>JSON.stringify(window.videos[0].bookmarks));
const C=[['説明は最初は閉じていて、説明のある行にだけ ⌄ が出る',r0.notes===0&&r0.togs===3],
 ['⌄ で1行だけ開き、文字は小さい（11px。PCでも指定が効いている）',r1.notes===1&&r1.fs==='11px'],
 ['1つのボタンで全部開き、表示が「全部隠す」に変わる',r2.notes===3&&r2.btn==='説明を全部隠す'],
 ['もう一度押すと全部閉じ、「全部表示」に戻る',r3.notes===0&&r3.btn==='説明を全部表示'],
 ['開閉の状態を動画のデータに書かない',!saved.includes('open')]];
const bad=errs.filter(e=>/Error/.test(e)); let f=0;
for(const [n,ok] of C){console.log((ok?'✓ ':'✗ ')+n);if(!ok)f++}
if(bad.length)console.log('✗ JSエラー',bad);
await b.close(); srv.close();
if(f||bad.length){console.log(JSON.stringify(r));process.exit(1)}
console.log('\n✓ ブックマークの説明の開閉 通過');process.exit(0);
