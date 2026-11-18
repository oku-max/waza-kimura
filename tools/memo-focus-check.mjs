// ═══ メモを大きく（v53.000・オーナー決定 mock-memo-full.html の B「動画を残してメモを大きく」） ═══
// 使い方: node tools/memo-focus-check.mjs   （SHOT=ディレクトリ で画面を撮る）
// 本物の index.html で:
//   ① Memo の見出しに ⛶ がある。押すと #vpanelInner に vp-memo-focus。横長では動画の列が約4割・ブックマーク・タグ・スナップショットが隠れ、メモは同じ要素のまま大きく出る
//   ② 押しても閉じても、動画のデータ（v.memo・v.bookmarks）を書き換えず、保存も呼ばない。大きくした状態で書いた文字は今までどおり v.memo に入る
//   ③ 「閉じる」で元に戻る（動画の列の幅・ブックマークが元どおり）
//   ④ 縦長（スマホ）: 動画は画面の3割以下で残り、スキップの列が隠れ、メモが画面の半分以上
//   ⑤ 別の動画を開く・パネルを閉じると、大きくした状態を持ち越さない
//   ⑥ 動画のプレーヤー（iframe の器）は動かさない（同じ要素・同じ親）
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
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.accept().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const SHOT = process.env.SHOT; const shot = async n => { if (SHOT) await pg.screenshot({ path: path.join(SHOT, n + '.png') }); };
const MEMO = '<div class="memo-h">ハーフからのスイープ</div>' + '膝を内側に入れてから下の脚でフックを作る。<br>'.repeat(40);
await pg.evaluate((MEMO) => {
  window.videos.length = 0;
  const bm = [{time:0,label:'イントロ'},{time:60,label:'姿勢'},{time:200,label:'腕'}];
  window.videos.push({ id:'AAAAAAAAAAA', ytId:'AAAAAAAAAAA', pt:'youtube', title:'教則A', duration:1800, tb:[],cat:[],pos:[],tags:[], memo: MEMO, bookmarks: bm });
  window.videos.push({ id:'BBBBBBBBBBB', ytId:'BBBBBBBBBBB', pt:'youtube', title:'教則B', duration:1800, tb:[],cat:[],pos:[],tags:[], memo: 'B', bookmarks: [] });
  window.__saves = 0; window.debounceSave = () => { window.__saves++; };
  window.openVPanel('AAAAAAAAAAA');
}, MEMO);
await pg.waitForSelector('#vp-memo-full-AAAAAAAAAAA');
await pg.waitForTimeout(400);
const S = () => pg.evaluate(() => {
  const inner = document.getElementById('vpanelInner'), left = document.getElementById('vpanel-left-col');
  const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  const memo = document.getElementById('vp-memo-AAAAAAAAAAA'), ifr = document.getElementById('vpanel-iframe-container');
  const v = window.videos[0];
  return { on: inner.classList.contains('vp-memo-focus'), leftPct: Math.round(left.getBoundingClientRect().width / inner.getBoundingClientRect().width * 100),
    leftInline: left.style.width, bm: vis(document.getElementById('vp-bm-section-AAAAAAAAAAA')), edit: vis(document.getElementById('vpanel-edit-area')),
    skip: vis(document.getElementById('vpanel-skip-area')) || vis(document.getElementById('vpanel-ctrl-row2')), memoVis: vis(memo), memoH: Math.round(memo?.getBoundingClientRect().height || 0),
    vidH: Math.round(ifr.getBoundingClientRect().height), winH: innerHeight, btn: document.getElementById('vp-memo-full-' + window.openVPanelId)?.textContent,
    memoSame: memo === window.__memoEl, ifrSame: ifr === window.__ifr && ifr.parentElement === window.__ifrParent,
    memoLen: (v.memo || '').length, bmN: v.bookmarks.length, saves: window.__saves };
});
await pg.evaluate(() => { window.__memoEl = document.getElementById('vp-memo-AAAAAAAAAAA'); window.__ifr = document.getElementById('vpanel-iframe-container'); window.__ifrParent = window.__ifr.parentElement; });
console.log('── ① 横長（PC 1400×900）──');
let s0 = await S();
ck('① Memo の見出しに ⛶', s0.btn === '⛶' && !s0.on && s0.bm, s0);
await shot('pc-before');
await pg.click('#vp-memo-full-AAAAAAAAAAA');
let s = await S();
ck('① 押すと vp-memo-focus・動画の列が約4割', s.on && s.leftPct >= 38 && s.leftPct <= 42, s);
ck('① ブックマーク・タグの欄が隠れ、メモは同じ要素のまま見える', !s.bm && !s.edit && s.memoVis && s.memoSame && s.memoH > s0.memoH * 0.9, s);
ck('① ボタンは「閉じる」', s.btn === '閉じる', s.btn);
ck('⑥ 動画の器は動かさない', s.ifrSame, s);
ck('② 開いただけでは保存しない・データを変えない', s.saves === s0.saves && s.memoLen === s0.memoLen && s.bmN === 3, s);
await shot('pc-focus');
await pg.click('#vp-memo-AAAAAAAAAAA'); await pg.keyboard.press('End'); await pg.keyboard.type('追記');
await pg.evaluate(() => window.vpSaveMemo('AAAAAAAAAAA'));
s = await S();
ck('② 大きくした状態で書いた文字は v.memo に入る', s.saves >= 1 && await pg.evaluate(() => window.videos[0].memo.includes('追記')), s);
await pg.click('#vp-memo-full-AAAAAAAAAAA');
s = await S();
ck('③ 閉じると元どおり（幅・ブックマーク）', !s.on && s.leftInline === s0.leftInline && s.leftPct === s0.leftPct && s.bm && s.btn === '⛶', { s, s0 });
console.log('── ⑤ 持ち越さない ──');
await pg.click('#vp-memo-full-AAAAAAAAAAA');
await pg.evaluate(() => window.openVPanel('BBBBBBBBBBB'));
await pg.waitForSelector('#vp-memo-full-BBBBBBBBBBB');
s = await S();
ck('⑤ 別の動画を開くと元の形', !s.on && s.btn === '⛶' && s.leftInline === s0.leftInline, s);
await pg.click('#vp-memo-full-BBBBBBBBBBB');
await pg.evaluate(() => window.closeVPanel());
ck('⑤ パネルを閉じると元の形', !(await pg.evaluate(() => document.getElementById('vpanelInner').classList.contains('vp-memo-focus'))));
console.log('── ④ 縦長（スマホ 390×844）──');
await pg.setViewportSize({ width: 390, height: 844 });
await pg.evaluate(() => window.openVPanel('AAAAAAAAAAA'));
await pg.waitForSelector('#vp-memo-full-AAAAAAAAAAA'); await pg.waitForTimeout(300);
await pg.evaluate(() => { window.__memoEl = document.getElementById('vp-memo-AAAAAAAAAAA'); window.__ifr = document.getElementById('vpanel-iframe-container'); window.__ifrParent = window.__ifr.parentElement; });
await shot('sp-before');
await pg.evaluate(() => window.vpMemoFocusToggle());
await pg.waitForTimeout(200);
s = await S();
ck('④ 動画は画面の3割以下で残る・スキップが隠れる', s.on && s.vidH > 50 && s.vidH <= s.winH * 0.31 && !s.skip, s);
ck('④ メモが画面の半分以上', s.memoVis && s.memoH >= s.winH * 0.5, s);
ck('④ 横にはみ出さない', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('vpanelInner').scrollWidth <= innerWidth + 1));
await shot('sp-focus');
console.log('── タブレット縦（820×1180）──');
await pg.setViewportSize({ width: 820, height: 1180 }); await pg.waitForTimeout(300);
s = await S();
ck('④ タブレット縦でも動画は3割以下', s.on && s.vidH <= s.winH * 0.31 && s.memoH >= s.winH * 0.5, s);
await shot('tab-focus');
ck('ページのエラーが無い', errs.length === 0, errs);
console.log(fail ? `✗ ${fail} 件` : '✓ すべて通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
