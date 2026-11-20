// ═══ MEMO の見出しの上にすき間が無いこと（v53.031） ═══
// 使い方: node tools/memo-sticky-check.mjs
// オーナーの画面（タブレット縦）: スクロールすると、MEMO の見出しの上にメモの文字と枠の切れ端がはみ出て見えていた。
// 見出しは position:sticky; top:0 だが、スクロールする欄（#vpanel-edit-wrap）に上の余白（padding 10px）があり、
// sticky は余白の下で止まるので、そのすき間を流れていくメモが通って見えた。余白ぶん上（top:-10px）に止めて直した。
// 本物の index.html で、幅 901・390・1300 で欄をスクロールし、見出しの上端が欄の上端に付いているかを見る。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8312;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
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
await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now())); });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.accept().catch(() => {}));
let lastReq = null, aiDelay = 0;
await pg.route('**/api/ai-summary', async r => {
  lastReq = JSON.parse(r.request().postData() || '{}');
  if (aiDelay) await new Promise(x => setTimeout(x, aiDelay));
  const cs = lastReq.cues, n = Math.min(3, cs.length);
  const items = Array.from({ length: n }, (_, k) => { const t = Math.floor(cs[Math.floor(k * cs.length / n)].t);
    return { t: Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text: 'くわしい要点' + k, shot: false }; });
  const points = (lastReq.chapters || []).map((c, i) => ({ i: i + 1, text: `章の要点${i + 1}（${c.label}）。いちばん大事なこと。` }));
  const body = { items }; if (points.length) body.points = points; if (lastReq.overview) body.overview = '全体の要約。この部分のいちばん大事なこと。';
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: JSON.stringify(body) }) });
});
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 500) : '')); if (!ok) fail++; };
const SHOT = process.env.SHOT; const shot = async n => { if (SHOT) await pg.screenshot({ path: path.join(SHOT, n + '.png') }); };

const ID = 'AAAAAAAAAAA', M = '#vp-memo-' + ID;
await pg.evaluate((ID) => {
  const ts = s => '<a class="ts-link" contenteditable="false" data-sec="'+s+'">▶ '+Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+'</a>';
  let memo = '<div class="memo-sum-t">✂️ 要約<span class="memo-sum-rg">0:00–5:12</span></div><div class="memo-sum-ov">トップの人間が脚の層をパスしようとする動きと、ガード側が脚を戻してリカバリーする攻防を実演。</div>';
  for (let c = 0; c < 4; c++) { memo += '<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">'+(c+1)+'</span>章'+c+ts(c*70)+'</div>'; for (let k = 0; k < 4; k++) memo += '<div class="memo-sum-it">'+ts(c*70+k*15+5)+'&nbsp;行'+c+'-'+k+' 脚を押し下げ、腰が脚の上に乗るようにステップしてコントロールを得る。</div>'; }
  window.videos.length = 0;
  window.videos.push({ id: ID, ytId: ID, pt:'youtube', title:'01-06- Layers Of The Guard', duration: 312, tb:[], cat:[], pos:[], tags:[], memo, bookmarks:[{time:0,label:'a'},{time:70,label:'b'},{time:140,label:'c'},{time:210,label:'d'}] });
  window.debounceSave = () => {};
  window.openVPanel(ID);
}, ID);
await pg.waitForSelector(M); await pg.waitForTimeout(1000);
await pg.evaluate(() => window.wkMemoSumFoldAll && window.wkMemoSumFoldAll(true));
for (const [w, h] of [[901, 1000], [390, 844], [1300, 900]]) {
  await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(300);
  for (const y of [400, 800]) {
    const r = await pg.evaluate((y) => { const head = document.querySelector('.vp-memo-stickyhead'); let box = head.parentElement; while (box && box !== document.body) { const o = getComputedStyle(box).overflowY; if ((o === 'auto' || o === 'scroll') && box.scrollHeight > box.clientHeight + 4) break; box = box.parentElement; }
      if (!box || box === document.body) return null; box.scrollTop = y; const hr = head.getBoundingClientRect(), br = box.getBoundingClientRect(); return { gap: Math.round(hr.top - br.top - box.clientTop), pad: getComputedStyle(box).paddingTop, stuck: box.scrollTop > 0 }; }, y);
    if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/sticky-' + w + '-' + y + '.png' });
    ck(w + 'px・' + y + 'px スクロール: MEMO の見出しが欄の一番上に付き、上にすき間（流れていくメモが見える所）が無い', r && r.gap <= 0, r);
  }
}
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? '\n✗ ' + fail + '件ずれ' : '\n✓ MEMO の見出しの上にすき間が無い');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
