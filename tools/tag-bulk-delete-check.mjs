// ═══ タグ一括削除がデータを安全に扱うかの検査 ═══
// 使い方: node tools/tag-bulk-delete-check.mjs
//
// なぜ要るか:
//   この機能は「全動画のタグを空にする → Firestore → 全デバイスに波及」という、
//   CLAUDE.md ルール1 が名指しで禁じている形そのもの（非空→空の上書き）。
//   v52.541 でカスタムビューが全デバイスから消えたのと同じ経路にいる。
//   だからこそ、安全装置が全部効いていることを機械で見張る:
//     ・既定で全部オフ（押しただけでは何も消えない）
//     ・選んでいないグループは無傷
//     ・自分で付けた自由タグ(tags)を巻き込まない
//     ・実行前に必ずバックアップが走る
//     ・確認でキャンセルすれば1件も消えない
//     ・実行後も取り消せる
//   静的な読みでは1つも確かめられないので、実際に押して確かめる。
import http from 'http'; import fs from 'fs'; import path from 'path';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium=(await import(c)).chromium; break; } catch {} }
const ROOT='/home/user/waza-kimura', PORT=8188;
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="tag-settings-list"></div><div id="ai-settings-section"></div>
<script>
 window.__log=[]; window.toast=(m)=>window.__log.push(['toast',m]);
 window.toastUndo=(m,fn)=>{window.__log.push(['toastUndo',m]); window.__undo=fn;};
 window.saveUserSettings=()=>{}; window.debounceSave=()=>window.__log.push(['save']);
 window.AF=()=>window.__log.push(['AF']);
 window.__exported=0;
 window.wazaExportLight=async()=>{ window.__exported++; };
 window.videos=[
  {id:'v1',title:'A',tb:['トップ'],cat:['パスガード'],pos:['クローズドガード'],tags:['自分のタグ']},
  {id:'v2',title:'B',tb:[],cat:['スイープ'],pos:['デラヒーバ'],tags:['自分のタグ2']},
  {id:'v3',title:'C',tb:['ボトム'],cat:[],pos:[],tags:[]}
 ];
<\/script>
<script src="/js/tag-master.js"><\/script><script src="/js/tag-templates.js"><\/script>
<script type="module">
 import * as S from '/js/settings.js';
 ['tagLabel','tagPresets','renderTagSettingsList'].forEach(n=>window[n]=S[n]);
 window.tagSettings=S.tagSettings; window.__ready=true;
<\/script></body></html>`;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);
 if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(HTML);}
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end('');}
 r.writeHead(200,{'Content-Type':'text/javascript'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
const ctx=await b.newContext(); ctx.setDefaultTimeout(8000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>window.__ready===true).catch(()=>{});
await pg.evaluate(()=>window.renderTagSettingsList());
let fail=0; const ck=(n,ok,d)=>{console.log((ok?'  ✓ ':'  ✗ ')+n+(d&&!ok?'  → '+String(d).slice(0,220):'')); if(!ok)fail++;};
ck('エラーなし', errs.length===0, errs.join('|'));

const ui=await pg.evaluate(()=>{
  const h=document.getElementById('tag-settings-list');
  const cbs=[...h.querySelectorAll('input[type=checkbox][data-key]')];
  return { section:/タグの一括削除/.test(h.textContent), n:cbs.length,
           keys:cbs.map(c=>c.dataset.key), checked:cbs.map(c=>c.checked),
           disabled:cbs.map(c=>c.disabled),
           labels:cbs.map(c=>c.parentElement.textContent),
           userText:cbs.map(c=>!!c.parentElement.querySelector('[data-user-text]')) };
});
ck('一括削除UIが出る', ui.section, JSON.stringify(ui));
ck('4グループ分のチェックがある', ui.n===4, JSON.stringify(ui.keys));
ck('★ 既定で全部オフ（勝手に消さない）', ui.checked.every(c=>c===false), JSON.stringify(ui.checked));
ck('対象0件のグループは押せない', ui.disabled[0]===false, JSON.stringify(ui.disabled));
ck('★ グループ名はユーザーが付けたもので出る', ui.labels.some(l=>/タグ1/.test(l)), JSON.stringify(ui.labels));
ck('ユーザー名は翻訳対象外の印がある', ui.userText.every(Boolean), JSON.stringify(ui.userText));
ck('件数が出る', /（2本）/.test(ui.labels[1]||''), JSON.stringify(ui.labels));

console.log('\n── 何も選ばずに押す ──');
const none=await pg.evaluate(async()=>{ window.__log=[];
  const h=document.getElementById('tag-settings-list');
  [...h.querySelectorAll('button')].find(b=>/バックアップを書き出してから削除/.test(b.textContent)).click();
  await new Promise(r=>setTimeout(r,120));
  return { log:window.__log, exported:window.__exported, videos:JSON.stringify(window.videos) };
});
ck('何も起きない（案内だけ）', /選んでください/.test(JSON.stringify(none.log)), JSON.stringify(none.log));
ck('バックアップも走らない', none.exported===0, String(none.exported));

console.log('\n── 確認で「いいえ」を押す ──');
await pg.evaluate(()=>{ window.__confirmCalls=[]; window.confirm=(m)=>{window.__confirmCalls.push(m); return false;}; });
const cancel=await pg.evaluate(async()=>{ window.__log=[];
  const h=document.getElementById('tag-settings-list');
  h.querySelector('input[data-key="cat"]').checked=true;
  [...h.querySelectorAll('button')].find(b=>/バックアップを書き出してから削除/.test(b.textContent)).click();
  await new Promise(r=>setTimeout(r,150));
  return { confirms:window.__confirmCalls, exported:window.__exported,
           cat:window.videos.map(v=>v.cat) };
});
ck('★ キャンセルでタグが消えない', JSON.stringify(cancel.cat)===JSON.stringify([['パスガード'],['スイープ'],[]]), JSON.stringify(cancel.cat));
ck('確認文に本数が出る', /2本/.test(cancel.confirms[0]||''), JSON.stringify(cancel.confirms));
ck('確認文にユーザーの名前が出る', /タグ2/.test(cancel.confirms[0]||''), JSON.stringify(cancel.confirms));

console.log('\n── 承認して実行 ──');
await pg.evaluate(()=>{ window.__confirmCalls=[]; window.confirm=(m)=>{window.__confirmCalls.push(m); return true;}; });
const run=await pg.evaluate(async()=>{ window.__log=[];
  const h=document.getElementById('tag-settings-list');
  h.querySelector('input[data-key="cat"]').checked=true;
  [...h.querySelectorAll('button')].find(b=>/バックアップを書き出してから削除/.test(b.textContent)).click();
  await new Promise(r=>setTimeout(r,350));
  return { exported:window.__exported, confirms:window.__confirmCalls.length,
           cat:window.videos.map(v=>v.cat), pos:window.videos.map(v=>v.pos),
           tags:window.videos.map(v=>v.tags), tb:window.videos.map(v=>v.tb),
           log:window.__log, hasUndo: typeof window.__undo==='function' };
});
ck('★ 先にバックアップが走る', run.exported===1, String(run.exported));
ck('確認は2回（書き出し前と実行前）', run.confirms===2, String(run.confirms));
ck('選んだグループだけ消える(cat)', JSON.stringify(run.cat)===JSON.stringify([[],[],[]]), JSON.stringify(run.cat));
ck('★ 選んでいない pos は無傷', JSON.stringify(run.pos)===JSON.stringify([['クローズドガード'],['デラヒーバ'],[]]), JSON.stringify(run.pos));
ck('★ 自分で付けた tags は無傷', JSON.stringify(run.tags)===JSON.stringify([['自分のタグ'],['自分のタグ2'],[]]), JSON.stringify(run.tags));
ck('★ tb も無傷', JSON.stringify(run.tb)===JSON.stringify([['トップ'],[],['ボトム']]), JSON.stringify(run.tb));
ck('保存が呼ばれる', JSON.stringify(run.log).includes('save'), JSON.stringify(run.log));
ck('取り消しが用意される', run.hasUndo===true, String(run.hasUndo));

console.log('\n── 取り消す ──');
const undo=await pg.evaluate(async()=>{ window.__undo(); await new Promise(r=>setTimeout(r,120));
  return { cat:window.videos.map(v=>v.cat) }; });
ck('★ 取り消しで元に戻る', JSON.stringify(undo.cat)===JSON.stringify([['パスガード'],['スイープ'],[]]), JSON.stringify(undo.cat));

const late=errs.slice();
ck('最後までエラーなし', late.length===0, late.join('|'));
console.log(fail?`\n✗ 問題 ${fail}件`:'\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail?1:0);
