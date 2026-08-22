// vpanel-v4.js の ＋テクニック / ＋ポジション を、_vpOpenDd が有る場合と
// 無い場合の両方で開けるか確かめる
import http from 'http'; import fs from 'fs'; import path from 'path';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium=(await import(c)).chromium; break; } catch {} }
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT=8153;
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/style.css"></head><body>
<div class="vp-row"><span class="vp-lbl">テクニック</span>
 <div class="vp-chips" id="row">
  <div class="vp-dd-wrap" style="display:inline-block;position:relative">
   <span class="vp-chip" id="btn-tag" style="border-style:dashed;cursor:pointer">＋ テクニック</span>
   <div class="vp-dd" id="vp-v4-tag-dd-V1" style="display:none">
     <input class="vp-dd-search" id="vp-v4-tag-inp-V1"><div class="vp-dd-list" id="vp-v4-tag-sug-V1"></div>
   </div></div>
  <div class="vp-dd-wrap" style="display:inline-block;position:relative">
   <span class="vp-chip" id="btn-pos" style="border-style:dashed;cursor:pointer">＋ ポジション</span>
   <div class="vp-dd" id="vp-v4-pos-dd-V1" style="display:none">
     <input class="vp-dd-search"><div class="vp-dd-list" id="vp-v4-pos-list-V1"></div>
   </div></div>
 </div></div>
<script>
 window.videos=[{id:'V1',title:'t',tb:[],cat:[],pos:[],tags:[]}];
 window.toast=(m)=>{(window.__toasts||=[]).push(m)};
 window.getTagGroups=()=>[];
<\/script>
<script src="/js/tag-master.js"><\/script>
<script src="/js/vpanel-v4.js"><\/script>
<script>
 document.getElementById('btn-tag').onclick=()=>window.vpV4OpenTagDd('V1');
 document.getElementById('btn-pos').onclick=()=>window.vpV4OpenPosDd('V1');
 window.__ready=true;
<\/script></body></html>`;
const MIME={'.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);
 if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(HTML);}
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end('');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
const ctx=await b.newContext({viewport:{width:1000,height:800}});
ctx.setDefaultTimeout(6000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const pg=await ctx.newPage();
pg.on('pageerror',e=>console.log('  PAGEERR',String(e).split('\n')[0]));
await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>window.__ready===true,null,{timeout:10000});
const vis=async id=>pg.evaluate(i=>{const e=document.getElementById(i);
  return !!e && e.style.display!=='none' && e.style.display!=='';},id);
let fail=0; const ck=(n,ok)=>{console.log((ok?'  ✓ ':'  ✗ ')+n); if(!ok)fail++;};
// _vpOpenDd が無い状態（＝これまで無反応だった条件）
ck('_vpOpenDd は未定義', await pg.evaluate(()=>typeof window._vpOpenDd)==='undefined');
await pg.locator('#btn-tag').click(); await pg.waitForTimeout(200);
ck('テクニック: 無くても開く', await vis('vp-v4-tag-dd-V1'));
ck('閉じるボタンが付く', await pg.locator('#vp-v4-tag-dd-V1 .vp-dd-x').count()===1);
await pg.locator('#btn-tag').click(); await pg.waitForTimeout(200);
ck('もう一度押すと閉じる', !(await vis('vp-v4-tag-dd-V1')));
await pg.locator('#btn-pos').click(); await pg.waitForTimeout(200);
ck('ポジション: 無くても開く', await vis('vp-v4-pos-dd-V1'));
// _vpOpenDd が有る状態
await pg.evaluate(()=>{window.__called=0;window._vpOpenDd=dd=>{window.__called++;dd.style.display='flex'};});
await pg.locator('#btn-pos').click(); await pg.waitForTimeout(150);
await pg.locator('#btn-pos').click(); await pg.waitForTimeout(200);
ck('有れば本来の処理を使う', await pg.evaluate(()=>window.__called)===1 && await vis('vp-v4-pos-dd-V1'));
// dd が無いケース
await pg.evaluate(()=>window.vpV4OpenTagDd('NOPE'));
await pg.waitForTimeout(150);
ck('見つからないときは理由を出す',
  (await pg.evaluate(()=>window.__toasts||[])).some(t=>String(t).includes('テクニック')));
console.log(fail?`\n✗ 失敗 ${fail}件`:'\n✓ 通過');
await b.close(); srv.close(); process.exit(fail?1:0);
