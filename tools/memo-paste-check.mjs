// VPanel のメモ欄に、コピーした画像を直接貼れること／画像の行のメモが拡大表示のメモと同じになること。
//
// なぜ必要か: メモ欄に貼り付けの受け口が無く、貼った画像は原寸のままメモに入り（編集できない大きさ）、
// 同時にスナップショット欄にも入っていた（v52.844 で対応）。
// 見ること: ① 貼るとメモに小さいサムネが1枚入る（スナップショットも1枚だけ）
//           ② 行のメモに書いた文がスナップショットのメモ（拡大表示）へ写る
//           ③ 拡大表示で直した文がメモの行へ写り、保存される
//           ④ 既存のメモは消えない ／ ⑤ 文字の貼り付けは横取りしない
//           ⑥ サムネと点線の欄のすき間に書いた文字も写す ／ ⑦ 以前の版で欄の外に書いたメモは開いたとき取り込み、改行の後ろは触らない（v52.946）
// 使い方: node tools/memo-paste-check.mjs
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
await page.evaluate(()=>{window.videos=[{id:'pst1',title:'t',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'<div>既存のメモ</div><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" width="2000" height="1500">'}];
 window.__vp._openPanel('pst1','https://www.youtube.com/embed/x',null,'youtube');});
await page.waitForSelector('#vp-memo-pst1',{timeout:8000}); await page.waitForTimeout(800);
const r=await page.evaluate(async()=>{const el=document.getElementById('vp-memo-pst1');el.focus();
 const rg=document.createRange();rg.selectNodeContents(el);rg.collapse(false);getSelection().removeAllRanges();getSelection().addRange(rg);
 const oldImg=el.querySelector('img:not(.snap-ref)');const oldSz=oldImg&&[oldImg.getBoundingClientRect().width,oldImg.getBoundingClientRect().height];
 const c=document.createElement('canvas');c.width=1600;c.height=900;c.getContext('2d').fillRect(0,0,1600,900);
 const blob=await new Promise(res=>c.toBlob(res,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'s.png',{type:'image/png'}));
 let n=0;const o=window.snapAddBlob;window.snapAddBlob=async(...a)=>{n++;return o(...a)};
 const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});el.dispatchEvent(ev);
 for(let i=0;i<50&&!el.querySelector('img.snap-ref');i++)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,500));
 const img=el.querySelector('img.snap-ref');const v=window.videos[0];
 const cap=el.querySelector('.snap-cap'); const inCap=cap&&cap.contains(getSelection().anchorNode);
 // type into cap
 document.execCommand('insertText',false,'腕・脚ともに45度');
 await new Promise(r=>setTimeout(r,100));
 const snapMemo=(v.snapshots||[]).find(s=>s.id===img.dataset.snapId)?.memo;
 // edit in lightbox
 window.snapOpenLightboxById(img.dataset.snapId); await new Promise(r=>setTimeout(r,200));
 const lb=document.getElementById('snap-lb-memo'); const lbVal=lb.value;
 lb.value='膝は寝ないように'; lb.dispatchEvent(new Event('input'));
 const capAfter=cap.innerText.replace(/​/g,'');
 const memoHasNew=v.memo.includes('膝は寝ないように');
 const dt2=new DataTransfer();dt2.setData('text/plain','abc');const ev2=new ClipboardEvent('paste',{clipboardData:dt2,bubbles:true,cancelable:true});el.dispatchEvent(ev2);
 return {prevented:ev.defaultPrevented,refs:el.querySelectorAll('img.snap-ref').length,thumb:img&&[img.getBoundingClientRect().width,img.getBoundingClientRect().height],
  snapAdd:n,snapsTotal:(v.snapshots||[]).length,inCap,snapMemo,lbVal,capAfter,memoHasNew,keepsOld:v.memo.includes('既存のメモ'),oldSz,textPrevented:ev2.defaultPrevented,memoLen:v.memo.length}});
// ⑥ サムネと点線の欄のすき間に打つと、文字は欄の外に入る（オーナーの画面）。それも同じ画像のメモとして写す（v52.946）
// ⑦ 以前の版で欄の外に書いたメモは、拡大表示を開いたとき（拡大表示のメモが空なら）取り込む。改行の後ろの別のメモは触らない
const r2=await page.evaluate(async()=>{const el=document.getElementById('vp-memo-pst1');const v=window.videos[0];
 const img=el.querySelector('img.snap-ref');const id=img.dataset.snapId;const cap=el.querySelector('.snap-cap');
 cap.textContent='​';window.snapSetMemo(id,'');
 const gap=img.nextSibling;  // サムネと欄の間の &nbsp;
 el.focus();const rg=document.createRange();rg.setStart(gap,gap.textContent.length);rg.collapse(true);getSelection().removeAllRanges();getSelection().addRange(rg);
 document.execCommand('insertText',false,'すき間に書いた');await new Promise(r=>setTimeout(r,100));
 const inCap=cap.textContent.replace(/​/g,'');const snapGap=(v.snapshots||[]).find(s=>s.id===id)?.memo;
 // ⑦ 古いデータ: 欄の外に文字があり、スナップショットのメモは空
 cap.textContent='​';[...el.childNodes];window.snapSetMemo(id,'');
 const row=img.parentElement;[...row.childNodes].forEach(n=>{if(n.nodeType===3&&n!==gap&&row.contains(n)&&n.previousSibling===img)n.remove();});
 gap.textContent=' 古い説明';cap.after(document.createElement('br'),document.createTextNode('別のメモ'));
 document.getElementById('snap-lb')?.classList.remove('open');
 window.snapOpenLightboxById(id);await new Promise(r=>setTimeout(r,200));
 const lb=document.getElementById('snap-lb-memo');const lbOpen=lb.value;
 lb.value='直した';lb.dispatchEvent(new Event('input'));
 const rowTxt=row.innerText.replace(/​/g,'');
 return {inCap,snapGap,lbOpen,rowHasFix:rowTxt.includes('直した'),oldGone:!rowTxt.includes('古い説明'),otherKept:rowTxt.includes('別のメモ'),memoSaved:v.memo.includes('直した')&&v.memo.includes('別のメモ')}});
const C=[['① 貼った画像がメモに小さく入る',r.prevented&&r.refs===1&&r.thumb&&r.thumb[0]<=80],
 ['① スナップショットには1枚だけ',r.snapAdd===1&&r.snapsTotal===1],
 ['② 行のメモ → 拡大表示のメモ',r.snapMemo==='腕・脚ともに45度'&&r.lbVal==='腕・脚ともに45度'],
 ['③ 拡大表示のメモ → 行のメモ（保存も）',r.capAfter==='膝は寝ないように'&&r.memoHasNew],
 ['④ 既存のメモは消えない',r.keepsOld],
 ['⑥ サムネと欄のすき間に書いた文字も拡大表示のメモへ',r2.snapGap==='すき間に書いた'],
 ['⑦ 以前の版で欄の外に書いたメモは、開いたとき取り込む',r2.lbOpen==='古い説明'],
 ['⑦ 拡大表示で直すと行が置き換わり、改行の後ろの別のメモは残る',r2.rowHasFix&&r2.oldGone&&r2.otherKept&&r2.memoSaved],['⑤ 文字の貼り付けは横取りしない',r.textPrevented===false]];
const bad=errs.filter(e=>/Error/.test(e));
let f=0;for(const [n,ok] of C){console.log((ok?'✓ ':'✗ ')+n);if(!ok)f++}
if(bad.length)console.log('✗ JSエラー',bad);
await b.close(); srv.close();
if(f||bad.length){console.log(JSON.stringify(r));process.exit(1)}
console.log('\n✓ メモへの画像貼り付け 通過');process.exit(0);
