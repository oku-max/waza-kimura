// ═══ 自動チャプターの件数を自分で入れる（v52.979・オーナー決定 mock-chap-count.html の A「一覧の下に入力欄」・1〜100） ═══
// 使い方: node tools/chap-count-input-check.mjs
// 本物の index.html を、スマホの画面幅・Drive の動画・字幕から検出で通す（AI と Drive は偽物）:
//   ① 件数の画面の一覧（5〜60件）の下に「自分で決める」欄がある・範囲外（0・101・文字）は押せず知らせる
//   ② 「15」と入れて押すと AI に 15件（count:15）で頼む・平均の長さを出す
//   ③ 確認画面の「件数を変えて検出し直す」でも入れられる（今と同じ件数は押せない）・「7」で作り直すと count:7
//   ④ 追加すると 7件がブックマークに入り、保存が呼ばれる
//   ⑤ Enter でも作れる・一覧のボタンは今までどおりすぐ作る
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8233;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const DESC = { AAAAAAAAAAA: '0:00 Intro\n1:30 Grip\n3:05 Sweep\n', BBBBBBBBBBB: 'no chapters here' };
let apiCalls = [];
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/api/yt-videos') {
    const ids = new URL(q.url, 'http://x').searchParams.get('ids') || ''; apiCalls.push(ids);
    if (ids === 'CCCCCCCCCCC') { r.writeHead(500); return r.end('{}'); }
    const items = ids.split(',').filter(id => DESC[id] != null).map(id => ({ id, title: id, channel: '', thumb: '', duration: '', desc: DESC[id] }));
    r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify({ items })); }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
let googleCalls = 0;
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => { if (/googleapis\.com\/youtube/.test(r.request().url())) googleCalls++; r.abort(); });
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
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on("dialog", d => d.dismiss().catch(()=>{}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
await pg.waitForFunction(() => Array.isArray(window.videos));
await pg.evaluate(() => {
  window.videos.length = 0;
  window.videos.push({ id:'gd-FILE1', pt:'gdrive', title:'Drive教則', duration: 1800, tb:[], cat:[], pos:[], tags:[], bookmarks:[] });
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  window.getDriveTokenIfAvailable = () => 'gdtok';
  window.__saves = 0; window.debounceSave = () => { window.__saves++; };
  window.__ai = [];
  const of = window.fetch.bind(window);
  window.fetch = (u, o) => {
    u = String(u);
    if (u.startsWith('/api/ai-summary')) { const b = JSON.parse(o.body); window.__ai.push(b.chapOpts);
      const items = Array.from({length: 20}, (_, i) => ({ title: 'チャプター' + (i+1), start: `${Math.floor(i*90/60)}:${String(i*90%60).padStart(2,'0')}` }));
      return Promise.resolve(new Response(JSON.stringify({ summary: JSON.stringify({ items }), costUsd: 0 }), { status: 200 })); }
    if (u.includes('googleapis.com/drive')) { window.__gapi = (window.__gapi||[]).concat(u.replace(/.*drive\/v3\//,'').slice(0,60) + ' ' + ((o&&o.method)||'GET'));
      const body = /files\?q=/.test(u) ? { files: [{ id: 'SUB1', name: 'Drive教則.srt' }, { id: 'FILE1', name: 'Drive教則.mp4' }] } : { id: 'FILE1', name: 'Drive教則.mp4', parents: ['P'] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 })); }
    if (u.startsWith('/api/drive')) { let t = ''; for (let i = 0; i < 60; i++) { const a = i*30, f = s => `00:${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')},000`; t += `${i+1}\n${f(a)} --> ${f(a+29)}\n話${i+1}\n\n`; }
      return Promise.resolve(new Response(new TextEncoder().encode(t), { status: 200 })); }
    return of(u, o);
  };
});
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const open = async () => {
  await pg.evaluate(() => { window.__ai.length = 0; window.videos[0].bookmarks = []; window.__saves = 0; window.openVPanel('gd-FILE1'); });
  await pg.waitForSelector('#vp-chapgen-gd-FILE1'); await pg.waitForTimeout(400);
  await pg.click('#vp-chapgen-gd-FILE1');
  await pg.waitForSelector('#vp-flow-win .vp-flow-opt[data-v="sub"]', { timeout: 8000 });
  await pg.click('#vp-flow-win .vp-flow-opt[data-v="sub"]');
  await pg.waitForSelector('#vp-chap-grain-num', { timeout: 8000 });
};
const st = () => pg.evaluate(() => ({ dis: document.getElementById('vp-chap-grain-go')?.disabled, hint: document.getElementById('vp-chap-grain-hint')?.textContent,
  presets: [...document.querySelectorAll('.vp-chap-grain-opt')].map(b => b.dataset.g) }));

console.log('── ① ② ──');
await open();
let s0 = await st();
ck('① 一覧（5〜60件）はそのまま・その下に入力欄・最初は押せない', JSON.stringify(s0.presets) === '["5","10","20","30","40","50","60"]' && s0.dis === true && /1〜100件で入れられます/.test(s0.hint), s0);
for (const bad of ['0', '101', 'abc']) {
  await pg.fill('#vp-chap-grain-num', bad); const s1 = await st();
  ck(`① 範囲外「${bad}」は押せず、1〜100 で入れるよう知らせる`, s1.dis === true && /1〜100の数字で入れてください/.test(s1.hint), s1);
}
await pg.fill('#vp-chap-grain-num', '15'); let s2 = await st();
ck('② 15 は押せる・平均の長さ（30分の動画で 約2分）を出す', s2.dis === false && s2.hint === '動画全体にまんべんなく（平均 約2分ごと）', s2);
if (process.argv[2]) await pg.screenshot({ path: process.argv[2] + '/count-input.png' }).catch(() => {});
await pg.click('#vp-chap-grain-go');
await pg.waitForSelector('#vp-chap-ok', { timeout: 8000 });
let ai = await pg.evaluate(() => window.__ai.map(o => o.count));
ck('② AI に 15件で頼む', JSON.stringify(ai) === '[15]', ai);

console.log('── ③ ④ 確認画面で作り直す ──');
const r0 = await pg.evaluate(() => ({ v: document.getElementById('vp-chap-redo-num')?.value, dis: document.getElementById('vp-chap-redo-go')?.disabled }));
ck('③ 確認画面にも入力欄があり、今の件数（15）が入っていて、同じ件数では押せない', r0.v === '15' && r0.dis === true, r0);
await pg.fill('#vp-chap-redo-num', '7');
ck('③ 7 にすると押せる', await pg.evaluate(() => document.getElementById('vp-chap-redo-go').disabled) === false);
if (process.argv[2]) await pg.screenshot({ path: process.argv[2] + '/count-redo.png' }).catch(() => {});
await pg.click('#vp-chap-redo-go');
await pg.waitForFunction(() => window.__ai.length === 2, null, { timeout: 8000 });
await pg.waitForSelector('#vp-chap-ok', { timeout: 8000 });
ai = await pg.evaluate(() => window.__ai.map(o => o.count));
ck('③ 作り直すと AI に 7件で頼み直す', JSON.stringify(ai) === '[15,7]', ai);
await pg.click('#vp-chap-ok'); await pg.waitForTimeout(800);
let r1 = await pg.evaluate(() => ({ bms: window.videos[0].bookmarks.length, saves: window.__saves }));
ck('④ 7件がブックマークに入り、保存が呼ばれる', r1.bms === 7 && r1.saves >= 1, r1);

console.log('── ⑤ Enter・一覧のボタン ──');
await open();
await pg.fill('#vp-chap-grain-num', '3'); await pg.press('#vp-chap-grain-num', 'Enter');
await pg.waitForSelector('#vp-chap-ok', { timeout: 8000 });
ai = await pg.evaluate(() => window.__ai.map(o => o.count));
ck('⑤ Enter でも作れる（count:3）', JSON.stringify(ai) === '[3]', ai);
await pg.click('#vp-chap-cancel'); await pg.waitForTimeout(400);
await open();
await pg.click('#vp-flow-win .vp-chap-grain-opt[data-g="10"]');
await pg.waitForSelector('#vp-chap-ok', { timeout: 8000 });
ai = await pg.evaluate(() => window.__ai.map(o => o.count));
ck('⑤ 一覧のボタンは今までどおり押すとすぐ作る（count:10）', JSON.stringify(ai) === '[10]', ai);
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 自動チャプターの件数を自分で入れられる');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
