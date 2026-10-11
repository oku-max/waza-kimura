// 再生速度を自由に打ち込めること（v52.960・オーナー「再生速度の設定を任意の速度に自由に変えたい」）。
// ⚙メニューの「再生速度」に、決まったボタン（0.5〜2×）に加えて 打ち込む欄と − / ＋（0.05 ずつ）を置いた。
// 見ること:
//   ① 1.3 のような半端な速さを打つと、その速さになる（ボタンはどれも光らない・見出しに 1.3×）
//   ② − / ＋ は 0.05 ずつ。ボタンと同じ速さになればボタンが光る
//   ③ 範囲の外を打つと端に寄せ、そのことを書く（黙って変えない）
//   ④ YouTube は使える速さが決まっているので、一番近い速さにして、そのことと使える速さを書く。− / ＋ は一覧の隣の速さへ
// 使い方: node tools/rate-free-check.mjs
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const pw = await import(path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs'));
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'), PORT=8152;
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
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const page=await ctx.newPage(); const errs=[];
page.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await page.goto(`http://localhost:${PORT}/`); await page.waitForFunction(()=>window.__ready,null,{timeout:15000});
const C=[]; const ck=(n,ok,d)=>{C.push([n,!!ok]); if(!ok&&d!==undefined)console.log('   ',JSON.stringify(d));};
await page.evaluate(()=>{ window.videos=[{id:'r1',title:'t',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',bookmarks:[]}];
  window.__vp._openPanel('r1','https://www.youtube.com/embed/x',null,'youtube'); });
await page.waitForTimeout(400);
const openMenu=()=>page.evaluate(()=>{ document.getElementById('vp-more-menu')?.remove(); const btn=document.createElement('button'); document.body.appendChild(btn);
  window.vpTogMoreMenu({stopPropagation(){},currentTarget:btn},'r1'); });
const st=()=>page.evaluate(()=>{ const m=document.getElementById('vp-more-menu'); const item=m?.querySelector('.vp-rate-in')?.closest('.vp-smenu-item');
  return { sub:item?.querySelector('.vp-smenu-sub')?.textContent, on:[...(m?.querySelectorAll('.vp-rate-chip.on')||[])].map(c=>c.textContent),
    val:m?.querySelector('.vp-rate-in')?.value, note:m?.querySelector('.vp-rate-note')?.textContent||'', range:m?.querySelector('.vp-rate-range')?.textContent }; });
const type=async v=>{ await page.fill('#vp-more-menu .vp-rate-in', String(v)); await page.press('#vp-more-menu .vp-rate-in','Enter'); await page.waitForTimeout(50); };
const step=async d=>{ await page.click(`#vp-more-menu .vp-rate-step[data-d="${d}"]`); await page.waitForTimeout(50); };

await openMenu();
let s0=await st();
ck('⓪ ⚙メニューの再生速度に、打ち込む欄・− / ＋・範囲が出る', s0.val==='1' && s0.range==='0.25〜2×' && JSON.stringify(s0.on)==='["1×"]', s0);
await type(1.3); let s1=await st();
ck('① 1.3 を打つとその速さになる（ボタンは光らない・見出しに 1.3×）', s1.sub==='1.3×' && s1.on.length===0 && s1.note==='', s1);
await step('0.05'); let s2=await st();
ck('② ＋ で 0.05 速く（1.35×）', s2.sub==='1.35×' && s2.val==='1.35', s2);
await step('-0.05'); await step('-0.05'); let s3=await st();
ck('② − で 0.05 遅く。ボタンと同じ速さ（1.25×）になるとボタンが光る', s3.sub==='1.25×' && JSON.stringify(s3.on)==='["1.25×"]', s3);
await type(5); let s4=await st();
ck('③ 範囲の外（5）は端（2×）に寄せ、そのことを書く', s4.sub==='2×' && /0\.25〜2× なので、2×にしました/.test(s4.note), s4);
await page.click('#vp-more-menu .vp-rate-chip[data-rate="1"]'); let s5=await st();
ck('③ ボタンを押すと知らせは消える', s5.sub==='1×' && s5.note==='', s5);

// ④ YouTube（偽のプレイヤー。使える速さの一覧を返す）
await page.evaluate(()=>{ let rate=1; window.__ytSet=[]; window.__vp._rateTestSetYt({ getAvailablePlaybackRates:()=>[0.25,0.5,0.75,1,1.25,1.5,1.75,2],
  setPlaybackRate:r=>{ rate=r; window.__ytSet.push(r); }, getPlaybackRate:()=>rate }); });
await openMenu();
await type(1.3); let y1=await st(); const set1=await page.evaluate(()=>window.__ytSet.slice(-1)[0]);
ck('④ YouTube で 1.3 を打つと、一番近い 1.25× にして、そのことと使える速さを書く', set1===1.25 && y1.sub==='1.25×' && /YouTubeの動画は決まった速さしか使えないので、1\.25×にしました/.test(y1.note) && /1\.75/.test(y1.note), {y1,set1});
await step('0.05'); let y2=await st();
ck('④ YouTube の ＋ は一覧の隣の速さ（1.5×）へ進む（0.05 ずつだと同じ速さに寄って進まないため）', y2.sub==='1.5×', y2);
await step('-0.05'); let y3=await st();
ck('④ YouTube の − は一覧の隣の速さ（1.25×）へ戻る', y3.sub==='1.25×', y3);
await page.evaluate(()=>window.__vp._rateTestSetYt(null));

const bad=errs.filter(e=>/Error/.test(e)); let f=0;
for(const [n,ok] of C){console.log((ok?'✓ ':'✗ ')+n);if(!ok)f++}
if(bad.length)console.log('✗ JSエラー',bad);
await b.close(); srv.close();
if(f||bad.length)process.exit(1);
console.log('\n✓ 再生速度を自由に打ち込める 通過');process.exit(0);
