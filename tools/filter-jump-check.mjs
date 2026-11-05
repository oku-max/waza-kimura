#!/usr/bin/env node
// ═══ カードのチップで絞ったとき、リセットしたはずの絞り込みが戻ってこないこと（v52.970）═══
// 使い方: node tools/filter-jump-check.mjs
//
// なぜ要るか（2026-11-05 オーナー「フィルターおかしくね？」・画面録画）:
//   カードのプレイリスト「Cole Abate _ Duck Under Pass」を押すと、関係ないチャンネル「ホベルチ・オダ」も
//   一緒に入って0本になった。前にチャンネルのチップを押すと、カード用（window.filters）と
//   テーブル用（orgFilters）の両方に入る。「フィルターをリセット」はカード用だけを消す。
//   チップはライブラリへ戻る（switchTab('home') → _libView('card')）が、_libView は同じカード表示のままでも
//   テーブル用の古い絞り込みでカード用を上書きしていたので、消したチャンネルが戻ってきた。
//   いまは、カード⇔テーブルを本当に切り替えたときだけ写す。
//   本物の index.html で、録画と同じ手順を踏み、切り替えで絞り込みが引き継がれることも見る。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8292;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const calls = [];
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/api/yt-search') {
    calls.push(new URL(q.url, 'http://x').searchParams.get('q'));
    r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify({ items: [], nextPageToken: '' })); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const FB_STUB = `(function(){ if (window.firebase) return;
  const noop=()=>{}; const p=(v)=>Promise.resolve(v);
  const doc=()=>({ get:()=>p({exists:false,data:()=>({})}), set:()=>p(), update:()=>p(), delete:()=>p(), collection, onSnapshot:()=>noop });
  function collection(){ return { doc, get:()=>p({empty:true,docs:[],forEach:noop}), where(){return this}, orderBy(){return this}, limit(){return this}, onSnapshot:()=>noop }; }
  const auth=()=>({ onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return noop; }, signInWithPopup:()=>p({user:null}), signOut:()=>p(), currentUser:null });
  auth.GoogleAuthProvider=function(){ this.addScope=noop; this.setCustomParameters=noop; };
  const firestore=()=>({ collection, doc, settings:noop, batch:()=>({set:noop,update:noop,delete:noop,commit:()=>p()}), enablePersistence:()=>p(), runTransaction:()=>p() });
  firestore.FieldValue={ arrayUnion:(...a)=>a, arrayRemove:(...a)=>a, serverTimestamp:()=>new Date(), delete:()=>null };
  window.firebase={ initializeApp:()=>({}), apps:[], auth, firestore, storage:()=>({ ref:()=>({ put:()=>p(), getDownloadURL:()=>p('') }) }) };
 })();`;
await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status:200, contentType:'text/javascript', body: FB_STUB }));
await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now())); });
await ctx.addInitScript(() => { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded','1');
  localStorage.setItem('x','1'); } });
const pg = await ctx.newPage(); const errs=[];
pg.on('pageerror', e => { const s=String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.accept().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForFunction(() => typeof window.AF === 'function' && window.filters && typeof window.vpJumpToPlaylist==='function', null, { timeout: 15000 });
await pg.evaluate(() => {
  const vs=[]; for(let i=0;i<9;i++) vs.push({id:'c'+i,title:'0'+i,channel:'Cole Abate',pl:'Cole Abate _ Duck Under Pass',pt:'gd',addedAt:'2026-01-0'+(i+1)});
  for(let i=0;i<5;i++) vs.push({id:'h'+i,title:'H'+i,channel:'ホベルチ・オダ',pl:'ホベルチ・オダ_オーバーアンダーパス',pt:'youtube',ytId:'abcdefghij'+i,addedAt:'2026-02-0'+(i+1)});
  window.videos.splice(0,window.videos.length,...vs); window.AF();
  window.showConf=(t,m,ok)=>ok();   // 「表示しますか？」で 実行 を押したのと同じ
});
const st = () => pg.evaluate(() => ({ ch:[...window.filters.channel], pl:[...window.filters.playlist],
  card: (window.filteredVideos||[]).length, table: window.orgFilt ? window.orgFilt(window.videos).length : -1 }));
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok ? '  → ' + JSON.stringify(d) : '')); if (!ok) fail++; };

await pg.evaluate(()=>window.vpJumpToChannel('h0')); await pg.waitForTimeout(200);
let r = await st(); ck('① チャンネルのチップで、そのチャンネルの5本', r.card === 5 && r.ch.join() === 'ホベルチ・オダ', r);
await pg.evaluate(()=>window.clearAll()); await pg.waitForTimeout(200);
r = await st(); ck('② フィルターをリセットで全部（14本）', r.card === 14 && !r.ch.length, r);
await pg.evaluate(()=>window.vpJumpToPlaylist('c1')); await pg.waitForTimeout(200);
r = await st(); ck('③ 次にプレイリストのチップ → そのプレイリストの9本（消したチャンネルが戻らない）', r.card === 9 && !r.ch.length && r.pl.join() === 'Cole Abate _ Duck Under Pass', r);
await pg.evaluate(()=>window._libView('org')); await pg.waitForTimeout(200);
r = await st(); ck('④ テーブルに切り替えても同じ9本', r.table === 9, r);
await pg.evaluate(()=>{ window.orgFilters.playlist.clear(); window.orgFilters.channel.add('ホベルチ・オダ'); });
await pg.evaluate(()=>window._libView('card')); await pg.waitForTimeout(200);
r = await st(); ck('⑤ テーブルで変えた絞り込みは、カードに戻ると引き継がれる（5本）', r.card === 5 && r.ch.join() === 'ホベルチ・オダ', r);
await pg.evaluate(()=>window.clearAll()); await pg.waitForTimeout(100);
await pg.evaluate(()=>window.switchTab('home')); await pg.waitForTimeout(200);
r = await st(); ck('⑥ リセット後にライブラリへ戻っても、テーブル用の古い絞り込みが戻らない（14本）', r.card === 14 && !r.ch.length, r);
if (errs.length) { console.log('  ✗ JSエラー', errs.slice(0,5)); fail++; }
await b.close(); srv.close();
if (fail) { console.log(`\n✗ ${fail} 件`); process.exit(1); }
console.log('\n✓ チップで絞ったとき、消した絞り込みが戻らない 通過'); process.exit(0);
