// ブックマークの仕切り（v52.952）が、データを安全な結果にすること。
// 仕切りは v.bmDividers（ブックマークとは別の列）に {time, label, auto?} で入り、
// 「time 以降の最初のブックマークの直前」に文字だけの行として出る。
// 何を見るか:
//   ① 正しい位置に出る・時刻ボタンが無い・形の崩れた仕切りがあっても落ちない
//   ② ブックマークを足しても仕切りの位置がずれない（時刻で覚えている）
//   ③ 足す・名前を変える・↑↓・ドラッグ・消すが仕切りの列だけを変える。v.bookmarks は1文字も変わらない
//   ④ 空の文字・取り消しでは何も書かない。形の崩れた仕切りは消さない
//   ⑤ 手で直した仕切りは auto が外れる（次の自動チャプターで消えない）
//   ⑥ 自動チャプター: AIの返した区切りをチャプターの頭に合わせる・少ない動画には入れない
//   ⑦ 確認画面に仕切りが出る・× で外せる・文字を直せる・外したチャプターの上には残らない・チェックを外せば入らない
//   ⑧ 書き込み: 前に自動で入れた仕切りだけを置き換え、手の仕切りは残す。新しい仕切りが無ければ何も触らない
//   ⑨ チャプターが全部入っていても、仕切りだけは入れられる
//   ⑩ 後からAIで入れる（v52.953）: 編集中に「🤖 AIで仕切りを入れる」が出る（6本未満は押せない・通信しない）／
//      送るのはブックマークの名前・補足・時刻だけ／返しの番号を行の頭に合わせる／確かめる画面で × と文字直しが効く／
//      入れるのは仕切りの列だけ・自動の仕切りだけ置き換え・ブックマークは1文字も変えない／見つからなければ何も書かない／キャンセルなら何も書かない
// 使い方: node tools/bm-divider-check.mjs
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
const pw = await import(path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs'));
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'), PORT=8147;
let html=fs.readFileSync(ROOT+'/index.html','utf8').replace(/<script\b[\s\S]*?<\/script>/g,'');
html=html.replace('</body>',`<script type="module">
import * as vp from './js/vpanel.js'; import * as se from './js/snapshot-editor.js';
window.vpSaveMemo=vp.vpSaveMemo; window.initSnapshotSection=se.initSnapshotSection; window.toast=m=>console.log('TOAST',m);
window.__saves=0; window.debounceSave=()=>{window.__saves++}; window.__vp=vp; window.__ready=true;
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
page.on('pageerror',e=>errs.push(String(e).split('\n')[0])); page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,150))});
await page.goto(`http://localhost:${PORT}/`); await page.waitForFunction(()=>window.__ready,null,{timeout:15000});

const C=[]; const ck=(n,ok,extra)=>{C.push([n,!!ok]); if(!ok&&extra!==undefined)console.log('   ', JSON.stringify(extra));};

await page.evaluate(()=>{
  window.__BM=[{time:0,label:'イントロ',note:''},{time:100,label:'姿勢',note:''},{time:245,label:'グリップ',note:''},
    {time:1205,label:'デラヒーバ',note:'',auto:'chapter'},{time:1420,label:'ベリンボロ',note:''},{time:2290,label:'ニーカット対処',note:''}];
  window.videos=[{id:'dv1',title:'t',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',
    bookmarks:JSON.parse(JSON.stringify(window.__BM)),
    bmDividers:[{time:100,label:'クローズドガード',auto:true},{time:1205,label:'デラヒーバ編'},'壊れた値',{time:'x',label:'時刻なし'}]}];
  window.__vp._openPanel('dv1','https://www.youtube.com/embed/x',null,'youtube');
});
await page.waitForSelector('#vp-bm-list-dv1',{timeout:8000}); await page.waitForTimeout(400);
const order=()=>page.evaluate(()=>[...document.querySelectorAll('#vp-bm-list-dv1 > *')].map(e=>
  e.classList.contains('vp-bm-div')?('|'+(e.querySelector('.vp-bm-div-t')?.childNodes[0]?.textContent||'')):e.hasAttribute('data-bm-idx')?(e.textContent.match(/\d+:\d\d/)||[''])[0]:null).filter(Boolean));
const data=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.videos[0])));
const bmSame=async()=>{const v=await data(); return JSON.stringify(v.bookmarks)===await page.evaluate(()=>JSON.stringify(window.__BM));};

// ⑪ 仕切りで開閉（v52.956）: 最初は閉じていて、仕切りより前のブックマークだけが出る
let o=await order();
const fold=()=>page.evaluate(()=>({btn:document.querySelector('[data-div-foldall="dv1"]')?.textContent, hidden:document.querySelector('[data-div-foldall="dv1"]')?.hidden,
  n:[...document.querySelectorAll('#vp-bm-list-dv1 .vp-bm-div-n')].map(e=>(e.textContent.match(/(\d+)件/)||[])[0]), saved:JSON.stringify(window.videos[0])}));
let f0=await fold();
ck('⑪ 最初は区切りが閉じていて、最初の仕切りより前のブックマークと仕切りだけが出る・仕切りに中の本数',
  JSON.stringify(o)===JSON.stringify(['0:00','|クローズドガード','|デラヒーバ編']) && JSON.stringify(f0.n)==='["2件","3件"]', {o,f0});
ck('⑪ 見出しに「仕切りを全部開く」が出る（説明の一括ボタンと同じ形）', f0.btn==='仕切りを全部開く' && !f0.hidden, f0);
await page.evaluate(()=>window.vpDivFold('dv1',0)); o=await order();
ck('⑪ 仕切りを押すと、その区切りだけが開く', JSON.stringify(o)===JSON.stringify(['0:00','|クローズドガード','1:40','4:05','|デラヒーバ編']), o);
await page.evaluate(()=>window.vpDivFold('dv1',0)); o=await order();
ck('⑪ もう一度押すと閉じる', JSON.stringify(o)===JSON.stringify(['0:00','|クローズドガード','|デラヒーバ編']), o);
await page.evaluate(()=>window.vpDivFoldAll('dv1')); let f1=await fold();
ck('⑪ 一括ボタンで全部開き、表示が「仕切りを全部閉じる」に変わる', f1.btn==='仕切りを全部閉じる', f1);
ck('⑪ 開閉の状態を動画のデータに書かない', f1.saved===f0.saved && !/open|fold/i.test(f1.saved));
o=await order();
ck('① 仕切りが「その時刻以降の最初のブックマーク」の直前に出る',
  JSON.stringify(o)===JSON.stringify(['0:00','|クローズドガード','1:40','4:05','|デラヒーバ編','20:05','23:40','38:10']), o);
ck('① 仕切りの行に時刻ボタンが無い（押しても飛ばない）', await page.evaluate(()=>[...document.querySelectorAll('#vp-bm-list-dv1 .vp-bm-div')].every(d=>!d.querySelector('button'))));
ck('① 見出しに「✎ 仕切り」が出る', await page.evaluate(()=>{const x=document.querySelector('[data-div-edit="dv1"]');return x&&!x.hidden&&x.textContent.includes('仕切り')}));

// ② ブックマークを足しても仕切りは動かない（時刻で覚えている）
await page.evaluate(()=>{const v=window.videos[0]; v.bookmarks.push({time:1300,label:'追加',note:''}); v.bookmarks.sort((a,b)=>a.time-b.time); window.__BM=JSON.parse(JSON.stringify(v.bookmarks)); window.vpBmNoteAll&&0;});
await page.evaluate(()=>window.vpDivEditToggle('dv1')); await page.evaluate(()=>window.vpDivEditToggle('dv1'));
o=await order();
ck('② ブックマークを足しても仕切りの位置がずれない', JSON.stringify(o)===JSON.stringify(['0:00','|クローズドガード','1:40','4:05','|デラヒーバ編','20:05','21:40','23:40','38:10']), o);

// ③④⑤ 編集
await page.evaluate(()=>window.vpDivEditToggle('dv1'));
const slots=await page.evaluate(()=>document.querySelectorAll('#vp-bm-list-dv1 .vp-bm-div-slot').length);
ck('③ 編集中は行の間に「＋ ここに仕切り」が出る（ブックマーク7本＋末尾＝8）', slots===8, slots);
const s0=await page.evaluate(()=>window.__saves);
// 空で確定 → 何も書かない
await page.evaluate(()=>window.vpDivAdd('dv1',4)); await page.waitForTimeout(50);
await page.evaluate(()=>{const el=document.getElementById('vp-div-in-dv1'); el.value='   '; el.blur();});
let v=await data();
ck('④ 空の文字で確定しても仕切りを作らない・保存しない', v.bmDividers.length===4 && await page.evaluate(()=>window.__saves)===s0, v.bmDividers);
// Escape で取り消し
await page.evaluate(()=>window.vpDivAdd('dv1',4)); await page.waitForTimeout(50);
await page.evaluate(()=>{const el=document.getElementById('vp-div-in-dv1'); el.value='取り消す'; el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
v=await data(); ck('④ Escape で取り消すと何も書かない', v.bmDividers.length===4, v.bmDividers);
// 足す（番号5＝23:40 の前）
await page.evaluate(()=>window.vpDivAdd('dv1',5)); await page.waitForTimeout(50);
await page.evaluate(()=>{const el=document.getElementById('vp-div-in-dv1'); el.value=' ベリンボロ編 '; el.blur();});
v=await data();
const nd=v.bmDividers.find(d=>d&&d.label==='ベリンボロ編');
ck('③ 足した仕切りは、その下のブックマークの時刻で入る（auto は付かない）', nd && nd.time===1420 && !nd.auto, v.bmDividers);
ck('④ 形の崩れた仕切りは消さずに残す', v.bmDividers.includes('壊れた値') && v.bmDividers.some(d=>d&&d.label==='時刻なし'));
// 名前を変える（auto の付いた クローズドガード）
let di=await page.evaluate(()=>window.videos[0].bmDividers.findIndex(d=>d&&d.label==='クローズドガード'));
await page.evaluate(i=>window.vpDivRename('dv1',i),di); await page.waitForTimeout(50);
await page.evaluate(()=>{const el=document.getElementById('vp-div-in-dv1'); el.value='クローズドガード編'; el.blur();});
v=await data(); let cg=v.bmDividers.find(d=>d&&d.label==='クローズドガード編');
ck('⑤ 名前を変えると auto が外れる（次の自動チャプターで消えない）', cg && !cg.auto && cg.time===100, v.bmDividers);
// ↓ で1つ下へ（1:40 の前 → 4:05 の前）
di=await page.evaluate(()=>window.videos[0].bmDividers.findIndex(d=>d&&d.label==='クローズドガード編'));
await page.evaluate(i=>window.vpDivMove('dv1',i,1),di);
v=await data(); cg=v.bmDividers.find(d=>d&&d.label==='クローズドガード編');
ck('③ ↓ で1つ下のブックマークの前へ動く', cg && cg.time===245, cg);
di=await page.evaluate(()=>window.videos[0].bmDividers.findIndex(d=>d&&d.label==='クローズドガード編'));
await page.evaluate(i=>{window.vpDivMove('dv1',i,-1);},di);
di=await page.evaluate(()=>window.videos[0].bmDividers.findIndex(d=>d&&d.label==='クローズドガード編'));
await page.evaluate(i=>{window.vpDivMove('dv1',i,-1);window.vpDivMove('dv1',window.videos[0].bmDividers.findIndex(d=>d&&d.label==='クローズドガード編'),-1);},di);
v=await data(); cg=v.bmDividers.find(d=>d&&d.label==='クローズドガード編');
ck('③ ↑ で上へ動き、先頭より上には行かない', cg && cg.time===0, cg);
// ドラッグ: デラヒーバ編 を 38:10 の前へ
await page.waitForTimeout(100);
const h=page.locator('#vp-bm-list-dv1 .vp-bm-div', {hasText:'デラヒーバ編'}).locator('.vp-bm-div-handle');
const hb=await h.boundingBox(); const tgt=await page.locator('#vp-bm-list-dv1 [data-bm-idx="6"]').boundingBox();
await page.mouse.move(hb.x+4,hb.y+6); await page.mouse.down(); await page.mouse.move(tgt.x+80,tgt.y+3,{steps:10}); await page.mouse.up();
await page.waitForTimeout(100);
v=await data(); const dh=v.bmDividers.find(d=>d&&d.label==='デラヒーバ編');
ck('③ ⠿ のドラッグで、落とした隙間のすぐ下のブックマークの前へ動く', dh && dh.time===2290, dh);
// 消す
di=await page.evaluate(()=>window.videos[0].bmDividers.findIndex(d=>d&&d.label==='ベリンボロ編'));
await page.evaluate(i=>window.vpDivDelete('dv1',i),di);
v=await data();
ck('③ × で消すと、その仕切りだけが消える', !v.bmDividers.some(d=>d&&d.label==='ベリンボロ編') && v.bmDividers.length===4, v.bmDividers);
ck('③ どの操作でも v.bookmarks は1文字も変わらない', await bmSame());
ck('③ 編集中の状態を動画のデータに書かない', !JSON.stringify(v).match(/editing|draft|rename/));
const fe=await page.evaluate(()=>({hidden:document.querySelector('[data-div-foldall="dv1"]')?.hidden, folds:document.querySelectorAll('#vp-bm-list-dv1 .vp-bm-div-fold').length}));
ck('⑪ 編集中は全部開いていて（開閉の見出しにならない）、一括ボタンは隠れる', fe.hidden===true && fe.folds===0, fe);
await page.evaluate(()=>window.vpDivEditToggle('dv1'));
await page.evaluate(()=>{ window._vpDivOpen={}; const v=window.videos[0]; v.bookmarks.push({time:2400,label:'足したブックマーク',note:''}); v.bookmarks.sort((a,b)=>a.time-b.time);
  window.__BM=JSON.parse(JSON.stringify(v.bookmarks)); window.__vp._chapDivTest; });
const fl=await page.evaluate(()=>{ const v=window.videos[0]; const i=v.bookmarks.findIndex(b=>b.label==='足したブックマーク'); window.__vp._chapDivTest.refresh('dv1', i);
  return [...document.querySelectorAll('#vp-bm-list-dv1 [data-bm-idx]')].map(e=>e.textContent).join('|'); });
ck('⑪ 足したばかりのブックマークは、閉じた区切りに隠れない（その区切りを開く）', /足したブックマーク/.test(fl), fl);


// ⑥ AIの区切りをチャプターの頭に合わせる
const sec=await page.evaluate(()=>{
  const T=window.__vp._chapDivTest;
  const ch=[0,100,245,450,612,828,1040,1205].map((t,i)=>({time:t,label:'c'+i}));
  return {
    a:T.sections([{start:'1:45',title:'第1章 クローズドガード'},{start:'20:00',title:'デラヒーバ'},{start:'20:10',title:'重複'},{start:'40:00',title:'遠すぎ'},{start:'5:00',title:''}],ch),
    few:T.sections([{start:'1:40',title:'x'}],ch.slice(0,5)),
    bad:T.sections(null,ch),
  };
});
ck('⑥ 区切りは一番近いチャプターの頭に合わせ、番号の飾りを落とす・同じチャプターへの2本目・遠いもの・空の名前は落とす',
  JSON.stringify(sec.a)===JSON.stringify([{at:1,label:'クローズドガード'},{at:7,label:'デラヒーバ'}]), sec.a);
ck('⑥ チャプターが6本未満なら仕切りを入れない・返しが無くても落ちない', sec.few.length===0 && sec.bad.length===0, sec);

// ⑦ 確認画面
const chaps=[0,100,245,450,612,828,1040,1205].map((t,i)=>({time:t,label:'チャプター'+i,note:''}));
await page.evaluate(c=>{window.__rv=window.__vp._chapDivTest.review(c,{note:'字幕から検出',autoCount:0,handCount:0,divs:[{at:1,label:'クローズドガード'},{at:4,label:'スイープ'},{at:7,label:'デラヒーバ'}]});},chaps);
await page.waitForSelector('#vp-chap-rv-bg');
const rv0=await page.evaluate(()=>({rows:[...document.querySelectorAll('#vp-chap-rv-bg .vp-chap-divrow .vp-chap-divt')].map(e=>e.textContent),lbl:document.getElementById('vp-chap-divs-lbl')?.firstChild?.textContent}));
ck('⑦ 確認画面に仕切りが出て、本数がチェックの横に出る', JSON.stringify(rv0.rows)==='["クローズドガード","スイープ","デラヒーバ"]' && rv0.lbl.includes('3本'), rv0);
await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('#vp-chap-rv-bg .vp-chap-divrow')];
  rows[0].querySelector('.vp-chap-divt').textContent='クローズドガード編';   // 文字を直す
  rows[2].querySelector('.vp-chap-divx').click();                            // デラヒーバを外す
  document.querySelector('#vp-chap-rv-bg .vp-chap-ck[data-i="4"]').click();  // スイープの付いたチャプターを外す
  document.getElementById('vp-chap-ok').click();
});
let sel=await page.evaluate(()=>window.__rv);
ck('⑦ 直した文字で入り、× で外したものは入らず、外したチャプターの仕切りは次の選ばれたチャプターへ移る',
  JSON.stringify(sel.divs)===JSON.stringify([{time:100,label:'クローズドガード編'},{time:828,label:'スイープ'}]), sel.divs);
await page.evaluate(c=>{window.__rv=window.__vp._chapDivTest.review(c,{note:'',autoCount:0,handCount:0,divs:[{at:1,label:'A'}]});},chaps);
await page.waitForSelector('#vp-chap-rv-bg');
await page.evaluate(()=>{document.getElementById('vp-chap-divs').click(); document.getElementById('vp-chap-ok').click();});
sel=await page.evaluate(()=>window.__rv);
ck('⑦ 「仕切りを入れる」のチェックを外すと仕切りは入らない', Array.isArray(sel.divs) && sel.divs.length===0, sel.divs);
await page.evaluate(c=>{window.__rv=window.__vp._chapDivTest.review(c,{note:'',autoCount:0,handCount:0});},chaps);
await page.waitForSelector('#vp-chap-rv-bg');
const noDiv=await page.evaluate(()=>!document.getElementById('vp-chap-divs') && !document.querySelector('.vp-chap-divrow'));
await page.evaluate(()=>document.getElementById('vp-chap-cancel').click());
ck('⑦ 仕切りが無ければ、確認画面は今までどおり（チェックも行も出ない）', noDiv);

// ⑧⑨ 書き込み
const ap=await page.evaluate(()=>{
  const T=window.__vp._chapDivTest;
  const mk=()=>({id:'ap1',bookmarks:[{time:0,label:'a',note:'',auto:'chapter'},{time:100,label:'b',note:'',auto:'chapter'},{time:500,label:'手',note:''}],
    bmDividers:[{time:0,label:'前の自動',auto:true},{time:100,label:'手の仕切り'},'壊れた値']});
  window.videos=[mk()];
  const ch=[{time:0,label:'a'},{time:100,label:'b'},{time:300,label:'c'}];
  const r1=T.apply('ap1',{chaps:ch,divs:[{time:100,label:'手と同じ位置'},{time:300,label:'新しい自動'}]},0);
  const v1=JSON.parse(JSON.stringify(window.videos[0]));
  window.videos=[mk()];
  const r2=T.apply('ap1',{chaps:ch,divs:[]},0);
  const v2=JSON.parse(JSON.stringify(window.videos[0]));
  window.videos=[mk()];
  const r3=T.apply('ap1',{chaps:[{time:0,label:'a'},{time:100,label:'b'}],divs:[{time:100,label:'x'},{time:0,label:'仕切りだけ'}]},0);
  const v3=JSON.parse(JSON.stringify(window.videos[0]));
  return {r1,v1,r2,v2,r3,v3,bm0:JSON.stringify(mk().bookmarks)};
});
ck('⑧ 前に自動で入れた仕切りだけを置き換え、手の仕切り・形の崩れたものは残す・手と同じ位置には足さない',
  JSON.stringify(ap.v1.bmDividers)===JSON.stringify(['壊れた値',{time:100,label:'手の仕切り'},{time:300,label:'新しい自動',auto:true}]) && ap.r1.divs===1, ap.v1.bmDividers);
ck('⑧ 新しい仕切りが無ければ、仕切りの列には何も触らない（空で上書きしない）',
  JSON.stringify(ap.v2.bmDividers)===JSON.stringify([{time:0,label:'前の自動',auto:true},{time:100,label:'手の仕切り'},'壊れた値']) && ap.r2.divs===0, ap.v2.bmDividers);
ck('⑨ チャプターが全部入っていても、仕切りだけは入れられる（チャプターは二重に足さない）',
  ap.r3.added===0 && ap.r3.divs===1 && JSON.stringify(ap.v3.bookmarks)===ap.bm0, ap);

// ⑩ 後からAIで入れる
const idx=await page.evaluate(()=>window.__vp._chapDivTest.indexed([{at:2,title:'1. A'},{at:2,title:'重複'},{at:0,title:'範囲外'},{at:9,title:'範囲外'},{at:5,title:''},{at:4,title:'B'}],6));
ck('⑩ 返しの番号（1から）を行の番号へ・範囲外・同じ番号の2本目・空の見出しは落とす', JSON.stringify(idx)===JSON.stringify([{at:1,label:'A'},{at:3,label:'B'}]), idx);
await page.evaluate(()=>{
  window.__fetches=[]; window.__reply={sections:[{at:2,title:'クローズドガード'},{at:4,title:'スイープ'},{at:7,title:'デラヒーバ'}]};
  window.fetch=async(u,o)=>{window.__fetches.push(JSON.parse(o.body)); return {ok:true,status:200,json:async()=>({summary:JSON.stringify(window.__reply),costUsd:0.002})};};
  window._firebaseCurrentUser=()=>({getIdToken:async()=>'tok'});
  window.__BM2=[0,100,245,450,612,1205,1420].map((t,i)=>({time:t,label:'ブックマーク'+i,note:i===2?'補足':''}));
  window.videos=[{id:'ai1',title:'教則',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',bookmarks:JSON.parse(JSON.stringify(window.__BM2)),
    bmDividers:[{time:0,label:'前の自動',auto:true},{time:1420,label:'手の仕切り'}]},
   {id:'ai2',title:'短い',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',bookmarks:[{time:0,label:'a'},{time:9,label:'b'}]}];
  window.__vp._openPanel('ai2','https://www.youtube.com/embed/x',null,'youtube');
});
await page.waitForSelector('#vp-bm-list-ai2'); await page.evaluate(()=>window.vpDivEditToggle('ai2'));
const short=await page.evaluate(async()=>{const b=document.getElementById('vp-divai-ai2'); await window.vpDivAuto('ai2'); return {disabled:b?.disabled, fetches:window.__fetches.length};});
ck('⑩ ブックマークが6本未満ならボタンは押せず、通信もしない', short.disabled===true && short.fetches===0, short);
await page.evaluate(()=>window.__vp._openPanel('ai1','https://www.youtube.com/embed/x',null,'youtube'));
await page.waitForSelector('#vp-bm-list-ai1'); await page.evaluate(()=>{ if(!document.getElementById('vp-divai-ai1')) window.vpDivEditToggle('ai1'); });
const barOk=await page.evaluate(()=>{const b=document.getElementById('vp-divai-ai1'); return !!b && !b.disabled;});
ck('⑩ 「✎ 仕切り」の編集中に「🤖 AIで仕切りを入れる」が出る', barOk);
// キャンセル
await page.evaluate(()=>{window.__p=window.vpDivAuto('ai1');}); await page.waitForSelector('#vp-divai-bg');
await page.evaluate(()=>document.getElementById('vp-divai-cancel').click()); await page.evaluate(()=>window.__p);
let av=await page.evaluate(()=>JSON.parse(JSON.stringify(window.videos[0])));
ck('⑩ キャンセルなら何も書かない', JSON.stringify(av.bmDividers)===JSON.stringify([{time:0,label:'前の自動',auto:true},{time:1420,label:'手の仕切り'}]), av.bmDividers);
const sent=await page.evaluate(()=>window.__fetches[0]);
ck('⑩ 送るのはブックマークの名前・補足・時刻だけ（source:bmlist）',
  sent.source==='bmlist' && sent.mode==='chapters' && sent.items.length===7 && JSON.stringify(sent.items[2])===JSON.stringify({t:245,label:'ブックマーク2',note:'補足'}) && !('transcript' in sent), sent);
// 入れる（スイープを × で外し、クローズドガードの文字を直す。デラヒーバは手の仕切りと同じ位置）
await page.evaluate(()=>{window.__p=window.vpDivAuto('ai1');}); await page.waitForSelector('#vp-divai-bg');
const dlgRows=await page.evaluate(()=>[...document.querySelectorAll('#vp-divai-bg .vp-divai-t')].map(e=>e.textContent));
await page.evaluate(()=>{const r=[...document.querySelectorAll('#vp-divai-bg .vp-divai-row')];
  r[0].querySelector('.vp-divai-t').textContent='クローズドガード編'; r[1].querySelector('.vp-divai-x').click(); document.getElementById('vp-divai-ok').click();});
await page.evaluate(()=>window.__p);
av=await page.evaluate(()=>JSON.parse(JSON.stringify(window.videos[0])));
ck('⑩ 確かめる画面に、見つかった仕切りが行の上に並ぶ', JSON.stringify(dlgRows)==='["クローズドガード","スイープ","デラヒーバ"]', dlgRows);
ck('⑩ 直した文字で入り、× で外したもの・手の仕切りと同じ位置のものは入らず、前の自動の仕切りは置き換わる',
  JSON.stringify(av.bmDividers)===JSON.stringify([{time:100,label:'クローズドガード編',auto:true},{time:1420,label:'手の仕切り'}]), av.bmDividers);
ck('⑩ ブックマークは1文字も変わらない', JSON.stringify(av.bookmarks)===await page.evaluate(()=>JSON.stringify(window.__BM2)));
// 見つからない
await page.evaluate(()=>{window.__reply={sections:[]};}); await page.evaluate(()=>window.vpDivAuto('ai1'));
const av2=await page.evaluate(()=>JSON.parse(JSON.stringify(window.videos[0])));
ck('⑩ 見つからなければ確かめる画面を出さず、仕切りには何も書かない', JSON.stringify(av2.bmDividers)===JSON.stringify(av.bmDividers) && !(await page.$('#vp-divai-bg')), av2.bmDividers);

// ⑫ 仕切りの右側に 範囲 · 長さ · 件数（v52.957・mock-bm-fold-time.html の B）／再生中のハイライト（①）
await page.evaluate(()=>{
  window.videos=[{id:'tm1',title:'t',pt:'youtube',ytId:'dQw4w9WgXcQ',memo:'',duration:7395,
    bookmarks:[{time:0,label:'イントロ'},{time:95,label:'a'},{time:300,label:'b'},{time:1720,label:'c'},{time:2629,label:'d'},{time:4020,label:'e'}],
    bmDividers:[{time:95,label:'基本'},{time:1720,label:'脆弱性'},{time:4020,label:'動作'}]}];
  window._vpDivOpen={};
  window.__vp._openPanel('tm1','https://www.youtube.com/embed/x',null,'youtube');
  window.openVPanelId='tm1';   // 本番は openVPanel がここで入れる（検査は下の _openPanel を直接呼ぶため）
});
await page.waitForSelector('#vp-bm-list-tm1'); await page.waitForTimeout(300);
const meta=await page.evaluate(()=>[...document.querySelectorAll('#vp-bm-list-tm1 .vp-bm-div-n')].map(e=>e.textContent.replace(/\s+/g,' ').trim()));
ck('⑫ 仕切りの右に「範囲 · 長さ · 件数」（分で数える・最後の区切りは動画の終わりまで）',
  JSON.stringify(meta)===JSON.stringify(['1:35–28:40 · 27分 · 2件','28:40–67:00 · 38分 · 2件','67:00–123:15 · 56分 · 1件']), meta);
await page.evaluate(()=>{ window.videos[0].duration=0; window.__vp._chapDivTest.refresh('tm1'); });
const meta2=await page.evaluate(()=>[...document.querySelectorAll('#vp-bm-list-tm1 .vp-bm-div-n')].map(e=>e.textContent.replace(/\s+/g,' ').trim()).pop());
ck('⑫ 動画の長さが分からなければ、最後の区切りは終わりと長さを書かない', meta2==='67:00– · 1件', meta2);
// 再生中: 閉じた区切りの中なら仕切りに印、開けば行に印
const hl=async t=>{ await page.evaluate(t=>{ window._srYtGetCurrentTime=()=>t; window.__vp._chapDivTest.nowSync(true); },t);
  return page.evaluate(()=>({rows:[...document.querySelectorAll('#vp-bm-list-tm1 .vp-bm-now')].map(e=>e.textContent.match(/\d+:\d\d/)?.[0]),
    div:[...document.querySelectorAll('#vp-bm-list-tm1 .vp-bm-div-now .vp-bm-div-t')].map(e=>e.childNodes[0].textContent),
    tag:!!document.querySelector('#vp-bm-list-tm1 .vp-bm-div-now .vp-bm-div-nowtag')})); };
let h1=await hl(2700);
ck('⑫ 閉じた区切りの中を再生中なら、その仕切りに印（文字の色・「再生中」）が付く', JSON.stringify(h1.div)==='["脆弱性"]' && h1.tag && h1.rows.length===0, h1);
await page.evaluate(()=>window.vpDivFold('tm1',1));
let h2=await hl(2700);
ck('⑫ 区切りを開くと、再生中のチャプターの行に印が付く（その時刻を過ぎた最後のブックマーク）', JSON.stringify(h2.rows)==='["43:49"]' && JSON.stringify(h2.div)==='["脆弱性"]', h2);
let h3=await hl(30);
ck('⑫ 再生位置が動くと印も移る（最初の仕切りより前なら行だけ）', JSON.stringify(h3.rows)==='["0:00"]' && h3.div.length===0, h3);
const keep=await page.evaluate(()=>JSON.stringify(window.videos[0]));
ck('⑫ 印は画面の中だけで、動画のデータに書かない', !/now/i.test(keep), keep.slice(0,200));
await page.evaluate(()=>{ delete window._srYtGetCurrentTime; });

const bad=errs.filter(e=>/Error/.test(e)); let f=0;
for(const [n,ok] of C){console.log((ok?'✓ ':'✗ ')+n);if(!ok)f++}
if(bad.length)console.log('✗ JSエラー',bad);
await b.close(); srv.close();
if(f||bad.length)process.exit(1);
console.log('\n✓ ブックマークの仕切り 通過');process.exit(0);
