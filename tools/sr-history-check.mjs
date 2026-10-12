#!/usr/bin/env node
// ═══ YouTube検索の履歴が画面に出ること（v52.962）═══
// 使い方: node tools/sr-history-check.mjs
//
// なぜ要るか（2026-10-12 オーナー「YouTube検索の履歴を残して」）:
//   履歴は検索のたびに localStorage（yt_sr_history_v1・最大15件）へ保存されていたのに、
//   描く関数 _renderHistory が先に index.html に無い #yt-sr-history-list を探して
//   黙って抜けていたので、一度も画面に出ていなかった（描けていない）。
//   本物の index.html を開き、保存済みの履歴が出る・押すとその語で検索する・
//   新しく検索した語が先頭に入る、を実際に踏む。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8231;
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
  localStorage.setItem('yt_sr_history_v1', JSON.stringify(['berimbolo', 'アームバー'])); } });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForFunction(() => typeof window.ytSrInit === 'function' && typeof window.switchTab === 'function', null, { timeout: 15000 });

let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const chips = () => pg.evaluate(() => { const el = document.getElementById('yt-sr-history-chips');
  return { shown: !!el && el.style.display !== 'none' && el.offsetHeight > 0, qs: [...(el?.querySelectorAll('.yt-sr-hist-chip') || [])].map(c => c.textContent) }; });

await pg.evaluate(() => window.switchTab('search'));
await pg.waitForTimeout(200);
let c = await chips();
ck('① 保存済みの履歴が、検索の画面に出る', c.shown && c.qs.join('|') === 'berimbolo|アームバー', c);

await pg.click('.yt-sr-hist-chip:has-text("アームバー")');
await pg.waitForTimeout(300);
ck('② 履歴を押すと、その語で検索する', calls.at(-1) === 'アームバー' && (await pg.inputValue('#yt-sr-input')) === 'アームバー', { calls });
c = await chips();
ck('③ 押した語が先頭に来る（同じ語は2つにならない）', c.qs.join('|') === 'アームバー|berimbolo', c);

await pg.fill('#yt-sr-input', 'knee cut');
await pg.evaluate(() => window.ytSrSearch());
await pg.waitForTimeout(300);
c = await chips();
const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('yt_sr_history_v1') || '[]'));
ck('④ 新しく検索した語が、画面と保存の両方の先頭に入る', c.qs[0] === 'knee cut' && saved.join('|') === 'knee cut|アームバー|berimbolo', { c, saved });

await pg.reload({ waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 15000 });
await pg.evaluate(() => window.switchTab('search'));
await pg.waitForTimeout(200);
c = await chips();
ck('⑤ 開き直しても残っている', c.shown && c.qs.join('|') === 'knee cut|アームバー|berimbolo', c);

ck('⑥ ページのエラーなし', errs.length === 0, errs);
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の問題` : '\n✓ YouTube検索の履歴: 出る・押せる・残る');
process.exit(fail ? 1 : 0);
