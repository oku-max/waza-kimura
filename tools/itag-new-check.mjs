#!/usr/bin/env node
// ═══ 動画を追加する画面で、どのタグにも新しい値を打ち込めること（v52.964）═══
// 使い方: node tools/itag-new-check.mjs
//
// なぜ要るか（2026-10-14 オーナー「動画を追加する時に新しいタグを作ることができない 既存からしか選べない」）:
//   動画パネル・まとめて編集は v52.947 でどのグループでも打ち込めるようにしたが、追加の画面（index.html の itag*）は
//   テクニック（tags）だけのままだった。並べて押す形のグループ（ブックマーク・TOP/BOTTOM）には「＋」自体が無かった。
//   いまは全グループに「＋ グループ名」。打った値は、実際に追加する瞬間（itagGetTagsFor）に、動画パネルと同じ決まり
//   （wkAddTagOptionIfNew → 選択肢に無く・どの動画にも無い値だけ）で選択肢にも足す。打っただけ・やめたときは足さない。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8251;
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


await relaunch();
await pg.evaluate(() => { window.itagMount('urlTagMount', { perVideo: false }); itagSetMode('manual'); });
await pg.waitForTimeout(200);
const groups = await pg.evaluate(() => _itagGroups().map(g => ({ id: g.id, name: g.name, store: g.store, mode: window.tagRegistry.displayMode((g.options || []).length), opts: (g.allOptions || g.options || []).slice() })));
const rows = await pg.evaluate(() => [...document.querySelectorAll('#utagFields .vp-row')].map(r => ({ name: r.querySelector('.vp-lbl')?.textContent, plus: [...r.querySelectorAll('.vp-chip')].some(c => c.textContent.trim().startsWith('＋')) })));
ck('① どのグループにも「＋ グループ名」がある（並べて押す形にも）', rows.length === groups.length && rows.length >= 3 && rows.every(r => r.plus), { rows, modes: groups.map(g => g.mode) });
ck('① 並べて押す形のグループが少なくとも1つある（検査の前提）', groups.some(g => g.mode === 'chips'), groups.map(g => g.mode));

const type = async (gid, text) => pg.evaluate(({ gid, text }) => {
  const wrap = [...document.querySelectorAll('#utagFields .vp-chip')].find(c => c.dataset.gid === gid && c.textContent.trim().startsWith('＋'));
  itagOpenDd(wrap);
  const inp = wrap.parentNode.querySelector('.vp-dd-search'); inp.value = text;
  itagDdKey({ key: 'Enter', preventDefault() {} }, inp);
  return [...document.querySelectorAll('#utagFields .vp-chip')].filter(c => c.dataset.gid === gid && c.dataset.val === text).map(c => c.className);
}, { gid, text });
const optsOf = gid => pg.evaluate(gid => { const g = window.tagRegistry.group(gid); return (g.allOptions || g.options || []).slice(); }, gid);

const chipG = groups.find(g => g.mode === 'chips');
const NEW1 = '新しいタグ' + Date.now() % 1000;
const on1 = await type(chipG.id, NEW1);
ck(`② 並べて押す形（${chipG.name}）に新しい値を打つと、選んだ状態で並ぶ`, on1.length === 1 && /on-/.test(on1[0]), on1);
ck('② 打っただけでは選択肢に足さない（追加をやめたら残らない）', !(await optsOf(chipG.id)).includes(NEW1));

const ddG = groups.find(g => g.id !== chipG.id);
const NEW2 = '別の新しい値';
await type(ddG.id, NEW2);
const got = await pg.evaluate(() => window.itagGetTagsFor('vid_new_1', 't', '', ''));
const flat = JSON.stringify(got);
ck('③ 追加するときの値に、打った2つが入る', flat.includes(NEW1) && flat.includes(NEW2), got);
ck(`③ 追加する瞬間に、打った値が選択肢に入る（${chipG.name}・${ddG.name}）`, (await optsOf(chipG.id)).includes(NEW1) && (await optsOf(ddG.id)).includes(NEW2),
   { a: await optsOf(chipG.id), b: await optsOf(ddG.id) });
const before = (await optsOf(chipG.id)).length;
await pg.evaluate(() => window.itagGetTagsFor('vid_new_2', 't', '', ''));
ck('③ 2本目以降で同じ値が二重に入らない', (await optsOf(chipG.id)).length === before);

// ④ 既にある値を名前で打つと、新しく作らずその値を選ぶ
await pg.evaluate(() => window.tagOptAdd?.('tb', 'トップ'));
const exist = await pg.evaluate(() => { const g = _itagGroups().find(x => (x.allOptions || x.options || []).length); return g && { id: g.id, opts: (g.allOptions || g.options).slice() }; });
ck('④ 既にある値を持つグループがある（検査の前提）', !!exist);
if (exist) {
  await pg.evaluate(() => { itagSetMode('none'); itagSetMode('manual'); });
  const n0 = (await optsOf(exist.id)).length;
  await type(exist.id, exist.opts[0]);
  ck('④ 既にある値を打つと、その値を選ぶ（選択肢は増えない）', (await pg.evaluate(gid => itagCurrent()[gid] || [], exist.id)).includes(exist.opts[0]) && (await optsOf(exist.id)).length === n0);
}

// ⑤ 新しいタググループ（ブックマークのような store:'map'）でも打てて、tg[ID] で渡り、選択肢に入る
const mapId = await pg.evaluate(() => window.tagRegistry.createGroup('ブックマーク', 3));
await pg.evaluate(() => { itagSetMode('none'); itagSetMode('manual'); });
const hasMapPlus = await pg.evaluate(id => [...document.querySelectorAll('#utagFields .vp-chip')].some(c => c.dataset.gid === id && c.textContent.trim().startsWith('＋')), mapId);
ck('⑤ 新しいタググループ（map）にも「＋」がある', !!mapId && hasMapPlus, { mapId });
if (mapId) {
  await type(mapId, '★★★★');
  const t5 = await pg.evaluate(() => window.itagGetTagsFor('vid_new_5', 't', '', ''));
  ck('⑤ map の値は tg[ID] で渡る', JSON.stringify(t5.tg?.[mapId]) === JSON.stringify(['★★★★']), t5);
  ck('⑤ map の選択肢にも入る', (await optsOf(mapId)).includes('★★★★'), await optsOf(mapId));
}

// ⑥ 「タグなし」なら何も渡さず、選択肢も変えない
await pg.evaluate(() => itagSetMode('none'));
const NEW3 = 'タグなしでは足さない';
const o3 = await pg.evaluate(() => window.itagGetTagsFor('vid_new_3', 't', '', ''));
ck('⑥ 「タグなし」では何も付けない', JSON.stringify(o3) === JSON.stringify({ tb: [], cat: [], pos: [], tags: [] }), o3);
ck('⑦ 動画のデータには触らない（追加の画面は値を渡すだけ）', await pg.evaluate(() => window.videos.every(v => !String(JSON.stringify(v)).includes('新しいタグ'))));
ck('⑧ ページのエラーなし', errs.length === 0, errs);
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の問題` : '\n✓ 動画を追加する画面: どのタグにも新しい値を打ち込める');
process.exit(fail ? 1 : 0);
