// 動画パネルのスキップの列で、両端の ⏮ ⏭（前/次の動画）がスマホでは以前（約19px）の2倍の40pxになること（v52.969・オーナー「スマホだとスキップボタンが狭い。2倍にして」）。
// PCでは今までどおり同じ幅。列が画面からはみ出さないこと。
// 使い方: node tools/skip-nav-check.mjs
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const pw = await import(path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs'));
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'), PORT=8147;
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
 try{window.__vp.openVPanel('bm1')}catch(e){console.error('OPEN '+e.message)}});
await page.waitForSelector('#vpanel-ctrl-row2 .ab-skip-vnav',{timeout:8000,state:'attached'}).catch(e=>{console.log(errs);throw e}); await page.waitForTimeout(400);
const m=()=>page.evaluate(()=>{const row=document.getElementById('vpanel-ctrl-row2');const nav=[...row.querySelectorAll('.ab-skip-vnav')].map(e=>e.getBoundingClientRect().width);const sk=[...row.querySelectorAll('.ab-skip-btn:not(.ab-skip-vnav)')].map(e=>e.getBoundingClientRect().width);return {nav,sk,over:row.scrollWidth-row.clientWidth,vw:innerWidth}});
const res={};
for(const w of [390,360,1280]){await page.setViewportSize({width:w,height:844});await page.waitForTimeout(200);res[w]=await m();}
const ratio=r=>Math.min(...r.nav)/Math.max(...r.sk); const navOk=r=>r.nav.every(w=>Math.abs(w-40)<1);
const C=[['⏮ ⏭ が2つとも ab-skip-vnav',res[390].nav.length===2],
 ['スマホ（390px）で ⏮⏭ が40px（以前の約19pxの2倍）',navOk(res[390])],
 ['スマホ（360px）でも40px',navOk(res[360])],
 ['390px で列が横にはみ出さない',res[390].over<=1],
 ['PC（1280px）は今までどおり同じ幅',Math.abs(ratio(res[1280])-1)<0.1]];
const bad=errs.filter(e=>/Error/.test(e)); let f=0;
for(const [n,ok] of C){console.log((ok?'✓ ':'✗ ')+n);if(!ok)f++}
if(bad.length)console.log('✗ JSエラー',bad);
await b.close(); srv.close();
if(f||bad.length){console.log(JSON.stringify(res));process.exit(1)}
console.log(JSON.stringify(res));
console.log('\n✓ 前/次の動画ボタンの幅 通過');process.exit(0);
