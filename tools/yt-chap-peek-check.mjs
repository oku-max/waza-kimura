// ═══ 自動チャプターの「YouTubeのチャプターを取得」が、押す前に有無を知らせること（v52.929） ═══
// 使い方: node tools/yt-chap-peek-check.mjs
//
// オーナー「押してみないとあるかないか分からないのは嫌。無いなら押せない／出てこないように」
// 「自動チャプターを押さないと分からないのは違う。開いた瞬間に判断するべき」（v52.932）。
// 本物の index.html で:
//   ⓪ 動画パネルを開いただけで（何も押さずに）、ある動画は 📑 自動チャプター のボタンに「YouTube N」が出る。
//      無い動画・調べられなかった動画には出ない。メニューを開くときにもう一度調べに行かない
// 📑 自動チャプター を押して出てくるメニュー:
//   ① チャプターがある動画 → 「YouTubeのチャプターを取得（N個）」で押せる
//   ② 無い動画 → 灰色で押せない・「この動画にはYouTubeのチャプターがありません」
//   ③ 調べられなかった（サーバーの失敗・非公開で項目が返らない）→ 今までどおり押せる（数は出さない）
//   ④ 調べるのは自前のサーバー（/api/yt-videos）だけ。Googleのログイン（YouTubeの読み取りトークン）を求めない
//   ⑤ ①で選ぶと、調べたチャプターがそのまま確認ダイアログに出る（もう一度読みに行かない）
//   ⑥ メニューを開いて閉じるだけでは動画のデータを変えない
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8211;
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
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'ja-JP' });
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
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); if (!ok) fail++; };
await pg.evaluate(() => {
  window.videos.length = 0;
  ['AAAAAAAAAAA','BBBBBBBBBBB','CCCCCCCCCCC','DDDDDDDDDDD'].forEach(id => window.videos.push({ id, ytId: id, pt:'youtube', title:'V'+id[0], tb:[], cat:[], pos:[], tags:[], bookmarks:[] }));
  window.__vsnap = JSON.stringify(window.videos);
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  window.__tokAsked = 0;
  window.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => { window.__tokAsked++; } }) } } };
});
console.log('── 開いただけで分かる ──');
const openPanel = async (id) => {
  await pg.evaluate(id => window.openVPanel(id), id);
  let r = null;
  for (let i = 0; i < 25; i++) { await pg.waitForTimeout(200);
    r = await pg.evaluate(id => { const b = document.getElementById('vp-chapgen-' + id); return b ? { btn: true, badge: b.querySelector('.vp-ytchap-badge')?.textContent || '' } : null; }, id);
    if (r && r.badge) break; }
  return r;
};
const pa = await openPanel('AAAAAAAAAAA');
ck('⓪ ある動画: 開いただけでボタンに「YouTube 3」', pa?.btn && pa.badge === 'YouTube 3', pa);
const pb = await openPanel('BBBBBBBBBBB');
ck('⓪ 無い動画: 開いてもバッジは出ない', pb?.btn && !pb.badge, pb);
const pc = await openPanel('CCCCCCCCCCC');
ck('⓪ 調べられなかった動画: バッジは出ない', pc?.btn && !pc.badge, pc);
const callsAfterOpen = apiCalls.filter(x => x === 'AAAAAAAAAAA' || x === 'BBBBBBBBBBB').length;
await pg.evaluate(() => window.closeVPanel?.());
const panelDiff = await pg.evaluate(() => { const a = JSON.parse(window.__vsnap); return window.videos.some((v, i) => JSON.stringify(v.ytChapters) !== JSON.stringify(a[i].ytChapters) || JSON.stringify(v.bookmarks) !== JSON.stringify(a[i].bookmarks)); });
ck('⓪ 開いて調べるだけでは、動画のチャプター・ブックマークを書かない', !panelDiff);
await pg.evaluate(() => { window.__vsnap = JSON.stringify(window.videos); });   // ここからはメニューだけの差分を見る（パネルを開いた記録＝最後に再生・再生回数は別）
const openMenu = async (id) => {
  // v52.955〜 作り方の選択肢は、自動チャプターの窓（#vp-flow-win）の中に出る
  await pg.evaluate(id => { window.vpGenChapters(id); }, id);
  await pg.waitForSelector('#vp-flow-win .vp-flow-opt', { timeout: 8000 });
  return pg.evaluate(() => { const b = document.querySelector('#vp-flow-win .vp-flow-opt[data-v="yt"]');
    return b ? { has: true, disabled: b.disabled, text: b.textContent.replace(/\s+/g, ' ').trim() } : { has: false }; });
};
const closeMenu = async () => { await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); };

const a = await openMenu('AAAAAAAAAAA');
ck('① ある動画: 「YouTubeのチャプターを取得（3個）」で押せる', a.has && !a.disabled && /（3個）/.test(a.text), a);
await closeMenu();
const bb = await openMenu('BBBBBBBBBBB');
ck('② 無い動画: 押せない・「この動画にはYouTubeのチャプターがありません」', bb.has && bb.disabled && /この動画にはYouTubeのチャプターがありません/.test(bb.text), bb);
await closeMenu();
const c = await openMenu('CCCCCCCCCCC');
ck('③ サーバーが失敗: 今までどおり押せる（数は出さない）', c.has && !c.disabled && !/個）/.test(c.text) && !/ありません/.test(c.text), c);
await closeMenu();
const d = await openMenu('DDDDDDDDDDD');
ck('③ 項目が返らない（非公開など）: 今までどおり押せる', d.has && !d.disabled && !/個）/.test(d.text), d);
await closeMenu();
ck('⓪ 開いた時点で調べた動画は、メニューを開くときにもう一度調べない（ある・無い）',
   apiCalls.filter(x => x === 'AAAAAAAAAAA' || x === 'BBBBBBBBBBB').length === callsAfterOpen && callsAfterOpen === 2, { apiCalls, callsAfterOpen });
ck('④ 調べるのは /api/yt-videos だけ（Googleのログインを求めない・YouTube API を直接呼ばない）',
   apiCalls.length >= 3 && googleCalls === 0 && await pg.evaluate(() => window.__tokAsked) === 0, { apiCalls, googleCalls });
const keep = await pg.evaluate(() => JSON.stringify(window.videos) === window.__vsnap);
ck('⑥ メニューを開いて閉じるだけでは動画のデータを変えない', keep);

// ⑤ 選ぶと、調べたチャプターがそのまま確認ダイアログに出る
await pg.evaluate(() => { window.vpGenChapters('AAAAAAAAAAA'); });
await pg.waitForSelector('#vp-flow-win .vp-flow-opt[data-v="yt"]');
await pg.click('#vp-flow-win .vp-flow-opt[data-v="yt"]');
let rv = null;
for (let i = 0; i < 30 && !rv; i++) { await pg.waitForTimeout(200);
  rv = await pg.evaluate(() => { const bg = document.getElementById('vp-chap-rv-bg'); return bg ? bg.textContent.replace(/\s+/g, ' ') : null; }); }
ck('⑤ 選ぶと確認ダイアログに調べたチャプター（Intro / Grip / Sweep）が出る・Googleのログインを求めない',
   !!rv && /Intro/.test(rv) && /Grip/.test(rv) && /Sweep/.test(rv) && await pg.evaluate(() => window.__tokAsked) === 0 && googleCalls === 0, rv && rv.slice(0, 200));
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ YouTubeのチャプターの有無: 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
