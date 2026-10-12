#!/usr/bin/env node
// ═══ アプリを切り替えて戻っても、はじめの画面にならないこと（v52.963）═══
// 使い方: node tools/resume-state-check.mjs
//
// なぜ要るか（2026-10-12 オーナー「アプリを切り替えただけで いちいち リセットされるのがめんどくさい」）:
//   スマホは裏に回したページを終わらせることがあり、戻ると最初から読み込み直す。
//   js/resume-state.js が裏に回る瞬間（pagehide / visibilitychange）に見ていた場所を
//   この端末の localStorage `wk_resume` に控え、読み込み直したときにそこへ戻す。
//   本物の index.html をスマホの幅で開き、「裏に回る → 読み込み直す」を実際に踏む。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8243;
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
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'ja-JP' });
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

await relaunch();
// ① ライブラリのスクロール位置（カード表示・テーブル表示の両方。スクロールしている要素を画面から探す）
const scroller = () => pg.evaluate(() => { const els = [...document.querySelectorAll('#homeTab [id], #fs-library-content [id], #fs-organize-content [id]')]
  .filter(el => el.offsetParent !== null && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 500);
  return els[0]?.id || null; });
for (const mode of ['card', 'org']) {
  await pg.evaluate(m => { localStorage.setItem('wk_masterViewType', m); window._libView?.(m); }, mode);
  await pg.waitForTimeout(800);
  const id = await scroller();
  if (!id) { ck(`① ${mode}: スクロールする要素が見つかる`, false, null); continue; }
  await pg.evaluate(id => { document.getElementById(id).scrollTop = 2000; }, id);
  const before = await pg.evaluate(id => document.getElementById(id).scrollTop, id);
  await hide(); await relaunch(); await pg.waitForTimeout(4500);   // 読み込みの後の表示の切り替えが済むまで
  const after = await pg.evaluate(id => document.getElementById(id)?.scrollTop, id);
  ck(`① ライブラリ（${mode === 'card' ? 'カード' : 'テーブル'}表示 #${id}）: 読み込み直しても、スクロールの位置がそのまま`, before > 1500 && Math.abs(after - before) < 10, { before, after });
}
await pg.evaluate(() => localStorage.setItem('wk_masterViewType', 'card'));

// ② 開いていた動画パネル
await pg.evaluate(() => window.openVPanel('v7')); await pg.waitForTimeout(400);
await hide(); await relaunch();
ck('② 開いていた動画パネルがそのまま開いている', await pg.evaluate(() => window.openVPanelId === 'v7' && document.getElementById('vpanel')?.classList.contains('open')),
   await pg.evaluate(() => window.openVPanelId));
await pg.evaluate(() => window.closeVPanel?.()); await pg.waitForTimeout(300);

// ③ タブ
await pg.evaluate(() => window.switchTab('murmurs')); await pg.waitForTimeout(300);
await hide(); await relaunch();
ck('③ 開いていたタブ（Journal）のまま', (await tab()) === 'murmurs', await tab());

// ④ YouTube検索の結果（もう一度 YouTube に問い合わせない）
await pg.evaluate(() => window.switchTab('search')); await pg.waitForTimeout(200);
await pg.fill('#yt-sr-input', 'ベリンボロ'); await pg.evaluate(() => window.ytSrSearch()); await pg.waitForTimeout(400);
const n0 = srCalls;
await hide(); await relaunch();
const sr = await pg.evaluate(() => ({ q: document.getElementById('yt-sr-input')?.value, cards: document.querySelectorAll('#yt-sr-cards-wrap .yt-sr-card').length }));
ck('④ YouTube検索: 検索語と結果がそのまま', (await tab()) === 'search' && sr.q === 'ベリンボロ' && sr.cards === ITEMS.length, sr);
ck('④ YouTube検索: 戻すときに YouTube へもう一度問い合わせない', srCalls === n0, { srCalls, n0 });

// ⑤ 戻している途中に画面を触ったら、そこでやめる
await pg.evaluate(() => window.switchTab('murmurs')); await pg.waitForTimeout(200);
await hide();
await pg.evaluate(() => sessionStorage.setItem('__delay', '2500'));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(300);
await pg.mouse.click(200, 400);
await ready(); await pg.waitForTimeout(1200);
ck('⑤ 戻している途中に触ったら、戻さない（操作を横取りしない）', (await tab()) === 'home', await tab());
await pg.evaluate(() => sessionStorage.removeItem('__delay'));

// ⑥ 共有から開いたときは戻さない
await pg.evaluate(() => window.switchTab('murmurs')); await pg.waitForTimeout(200);
await hide();
await relaunch(`http://localhost:${PORT}/?st_url=${encodeURIComponent('https://youtu.be/AAAAAAAAAAA')}`);
ck('⑥ 共有から開いたときは、元の場所へ戻さない', (await tab()) !== 'murmurs', await tab());

// ⑦ 控えるのは端末の wk_resume だけ（データ・クラウドに触らない）
const src = fs.readFileSync(path.join(ROOT, 'js/resume-state.js'), 'utf8');
const sets = [...src.matchAll(/localStorage\.(setItem|removeItem)\(\s*([^,)]+)/g)].map(m => m[2].trim());
ck('⑦ 書くのは localStorage の wk_resume だけ', sets.length > 0 && sets.every(k => k === 'KEY') && /const KEY = 'wk_resume'/.test(src)
   && !/firebase|saveUser|_save\(|\.videos\s*=|removeItem/.test(src.replace(/^\s*\/\/.*$/gm, '')), sets);

ck('⑧ ページのエラーなし', errs.length === 0, errs);
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の問題` : '\n✓ アプリを切り替えて戻っても、見ていた場所のまま');
process.exit(fail ? 1 : 0);
