#!/usr/bin/env node
// ═══ テーブルのタイトル列の幅を、読み込み直しても覚えていること（v52.963）═══
// 使い方: node tools/title-width-check.mjs
//
// なぜ要るか（2026-10-12 オーナー「タイトルも幅を変更したら保存するように」）:
//   ほかの列の幅は organize.js の ORG_COL_WIDTHS（localStorage wk_orgColWidths・この端末だけ）に保存していたが、
//   タイトル列だけはドラッグで見た目を変えるだけで保存しておらず、描き直すたびに 180 に戻っていた
//   （180 が見出し・行・表の幅の計算の5か所に直書きだった）。
//   いまは同じ控えの title に入れ、5か所とも window.orgTitleW() から読む。
//   本物の index.html で、境目をドラッグ → 読み込み直す を、マスターとリストの両方で踏む。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8247;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
let srCalls = 0;
const ITEMS = Array.from({ length: 6 }, (_, i) => ({ videoId: 'SRCH0000' + i + 'xx', title: '検索結果' + i, ch: 'ch', thumb: '', duration: 'PT5M', publishedAt: '2026-01-0' + (i + 1) }));
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/api/yt-search') { srCalls++; r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify({ items: ITEMS, nextPageToken: '' })); }
  if (p.startsWith('/api/')) { r.writeHead(200, {'Content-Type':'application/json'}); return r.end('{}'); }
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
// 動画は「クラウド（端末の控え）から届く」の代わりに、読み込みのたびに 300 本を入れる。
// sessionStorage の __delay があれば届くのを遅らせる（その間に画面を触る検査用）
await ctx.addInitScript(() => {
  const delay = Number(sessionStorage.getItem('__delay') || 0);
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (!Array.isArray(window.videos) || typeof window.switchTab !== 'function' || Date.now() - t0 < delay) return;
    clearInterval(iv);
    if (window.videos.length) return;
    for (let i = 0; i < 300; i++) window.videos.push({ id: 'v' + i, title: '動画' + i, pt: 'youtube', ytId: 'AAAAAAAAA' + (i % 10) + 'x', tb: [], cat: [], pos: [], tags: [], bookmarks: [] });
    window.AF?.(); if (window._libViewMode === 'org') window.renderOrg?.();   // 端末の控えから出すときと同じ（firebase.js）
  }, 50);
});
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not|YT\b/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const ready = () => pg.waitForFunction(() => typeof window.switchTab === 'function' && (window.videos || []).length >= 300, null, { timeout: 15000 });
const hide = () => pg.evaluate(() => window.dispatchEvent(new Event('pagehide')));   // 裏に回る
const relaunch = async (url) => { await pg.goto(url || `http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await ready(); await pg.waitForTimeout(1500); };
const tab = () => pg.evaluate(() => ['home','community','settings','admin','search','notes','murmurs'].find(t => document.getElementById(t + 'Tab')?.classList.contains('active')));


const drag = (sel, dx) => pg.evaluate(({ sel, dx }) => {
  const th = document.querySelector(sel); const h = th?.querySelector('.rh');
  if (!h) return null;
  const r = h.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + dx, clientY: y }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + dx, clientY: y }));
  return th.offsetWidth;
}, { sel, dx });
const TITLE = '.org-table th[data-fixed="title"]';
const widths = () => pg.evaluate(() => ({
  th: document.querySelector('.org-table th[data-fixed="title"]')?.offsetWidth || null,
  td: document.querySelector('.org-table .org-td-fixed-title')?.offsetWidth || null,
  ch: document.querySelector('.org-table th[data-col="channel"]')?.offsetWidth || null }));
const openList = async () => { await pg.evaluate(() => { window._cvApplyLoadedViews(JSON.parse(localStorage.getItem('wk_cv_views'))); window._cvPickerSelect('cv_1'); }); await pg.waitForTimeout(800); };
const near = (a, b) => a && b && Math.abs(a - b) <= 4;

await relaunch();
await pg.evaluate(() => localStorage.setItem('wk_cv_views', JSON.stringify([{ id: 'cv_1', label: 'テスト', mode: 'manual', videoIds: ['v1', 'v2', 'v3'], viewType: 'table' }])));
await pg.evaluate(() => { localStorage.setItem('wk_masterViewType', 'org'); window._libView('org'); }); await pg.waitForTimeout(800);
const w0 = await widths();
ck('⓪ 何もしていなければ今までどおり 180', near(w0.th, 180), w0);

// ① マスターで広げる → 読み込み直す
await drag(TITLE, 120); await pg.waitForTimeout(200);
const w1 = await widths();
ck('① 広げると見出しと行が同じ幅になる', w1.th > 260 && near(w1.th, w1.td), w1);
ck('① 広げた幅が控えに書かれる', await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_orgColWidths') || '{}').title) === w1.th + 'px',
   await pg.evaluate(() => localStorage.getItem('wk_orgColWidths')));
await relaunch(); await pg.evaluate(() => window._libView('org')); await pg.waitForTimeout(800);
const w2 = await widths();
ck('① 読み込み直しても、見出し・行とも同じ幅', near(w2.th, w1.th) && near(w2.td, w1.th), { w1, w2 });
ck('① ほかの列の幅は変わらない', near(w2.ch, w0.ch), { w0: w0.ch, w2: w2.ch });

// ② リストを開いて狭める → 読み込み直す
await openList();
ck('② リストを開いている', (await pg.evaluate(() => window._cvActiveViewId)) === 'cv_1');
await drag(TITLE, -60); await pg.waitForTimeout(200);
// リストの表は、離した直後だけブラウザが表の余りを配って数px広く見えることがある（ほかの列も同じ・以前から）。
// 比べるのは「控えに書いた幅」と「読み込み直した幅」
const saved3 = parseInt(await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_orgColWidths') || '{}').title), 10);
await relaunch(); await openList();
const w4 = await widths();
ck('② リストで狭めた幅も、読み込み直して同じ（見出し・行とも）', saved3 < w1.th - 30 && near(w4.th, saved3) && near(w4.td, saved3), { saved3, w4 });

// ③ 壊れた値が入っていても 180 で出す（表が崩れない）
await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('wk_orgColWidths') || '{}'); o.title = 'abc'; localStorage.setItem('wk_orgColWidths', JSON.stringify(o)); });
await relaunch(); await pg.evaluate(() => window._cvClearSelection?.()); await pg.evaluate(() => window._libView('org')); await pg.waitForTimeout(800);
ck('③ 控えの値が壊れていたら 180', near((await widths()).th, 180), await widths());

ck('④ 動画のデータは変わらない', await pg.evaluate(() => window.videos.every(v => !('title' in v && typeof v.title !== 'string'))));
ck('⑤ ページのエラーなし', errs.length === 0, errs);
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の問題` : '\n✓ タイトル列の幅: 読み込み直しても同じ');
process.exit(fail ? 1 : 0);
