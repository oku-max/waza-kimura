// ═══ タイトル編集で、字幕ファイルの名前も一緒に変わること（v52.976・オーナー決定 B） ═══
// 使い方: node tools/gd-sub-rename-check.mjs
// 2026-11-08 実物: 動画を「05」→「05 ダックアンダーからのフィニッシュ」に変えたら、字幕「05.srt」「05.ja.srt」が見つからなくなった
// （字幕は動画と同じ名前で探す。名前で突き合わせる決まり v52.721 は、動画名が長いとき字幕名に6文字以上を求める）。
// 本物の index.html と本物の renameGdFile を、偽の Drive（このページの fetch）につないで、タイトル編集を通す:
//   ① 動画の名前と一緒に、この動画の字幕（.srt / .ja.srt）の名前も新しい名前に変わる・変えた後も字幕として見つかる
//   ② Drive に書くのは名前だけ（中身・ほかの項目を送らない）・ほかの動画の字幕・後ろに別の文字がある字幕（05-part2）は触らない
//   ③ 同じ名前のファイルがすでにあれば、その字幕の名前は変えない（重ねない）・変えなかった件数を知らせる
//   ④ 動画の名前を変えられなかったら、字幕の名前も変えない
//   ⑤ 動画のデータの保存（debounceSave）は今までどおり1回・ブックマークに触らない
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
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
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
await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now())); localStorage.setItem('gd_token_v4', JSON.stringify({ token: 'gdtok', ts: Date.now() })); });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForFunction(() => Array.isArray(window.videos) && typeof window.renameGdFile === 'function');
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 500) : '')); if (!ok) fail++; };

// 偽の Drive。files: id → {name, parents}。書き込みは __writes に記録
const setup = (files, opts = {}) => pg.evaluate(([files, opts]) => {
  window.__fs = JSON.parse(JSON.stringify(files)); window.__writes = []; window.__saves = 0;
  window.debounceSave = () => { window.__saves++; };
  if (!window.__origFetch) window.__origFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    u = String(u);
    const m = /googleapis\.com\/drive\/v3\/files(\/([^?]+))?(\?(.*))?$/.exec(u);
    if (!m) return window.__origFetch(u, o);
    const method = (o && o.method) || 'GET';
    const id = m[2] && decodeURIComponent(m[2]);
    if (method === 'PATCH') {
      const body = JSON.parse(o.body || '{}'); window.__writes.push({ id, body });
      if (opts.failVideo && id === opts.failVideo) return new Response(JSON.stringify({ error: { message: 'denied' } }), { status: 403 });
      if (body.name) window.__fs[id].name = body.name;
      return new Response(JSON.stringify({ id, name: window.__fs[id].name }), { status: 200 });
    }
    if (id) { const f = window.__fs[id]; return f ? new Response(JSON.stringify({ id, ...f }), { status: 200 }) : new Response('{}', { status: 404 }); }
    const q = decodeURIComponent(new URLSearchParams(m[4]).get('q') || '');
    const par = (/'([^']+)' in parents/.exec(q) || [])[1];
    const nm = (/name='((?:[^'\\]|\\.)*)'/.exec(q) || [])[1];
    const list = Object.entries(window.__fs).filter(([, f]) => f.parents.includes(par) && (nm == null || f.name === nm.replace(/\\(.)/g, '$1'))).map(([id, f]) => ({ id, name: f.name }));
    return new Response(JSON.stringify({ files: list }), { status: 200 });
  };
  window.videos.length = 0;
  window.videos.push({ id: 'gd-V5', pt: 'gdrive', title: '05', tb: [], cat: [], pos: [], tags: [], bookmarks: [{ time: 10, label: 'a' }] });
}, [files, opts]);
const rename = (newTitle) => pg.evaluate(async (t) => {
  window.openVPanel('gd-V5');
  await new Promise(r => setTimeout(r, 300));
  window.__savesOpen = window.__saves; window.__saves = 0;
  document.getElementById('vp-title-inp-gd-V5')?.remove();
  const inp = document.createElement('input'); inp.id = 'vp-title-inp-gd-V5'; inp.value = t; document.body.appendChild(inp);
  await window.vpSaveTitle('gd-V5');
  await new Promise(r => setTimeout(r, 300));
  return { names: Object.fromEntries(Object.entries(window.__fs).map(([id, f]) => [id, f.name])), writes: window.__writes, saves: window.__saves, savesOpen: window.__savesOpen,
           toast: document.getElementById('toast')?.textContent || '', bms: window.videos[0].bookmarks.length };
}, newTitle);
const FILES = {
  V5:   { name: '05', parents: ['P'] },
  S5:   { name: '05.srt', parents: ['P'] },
  S5J:  { name: '05.ja.srt', parents: ['P'] },
  S5P:  { name: '05-part2.srt', parents: ['P'] },
  V6:   { name: '06.mp4', parents: ['P'] },
  S6:   { name: '06.srt', parents: ['P'] },
};

console.log('── ① ② ⑤ ──');
await setup(FILES);
let r = await rename('05 ダックアンダーからのフィニッシュ');
ck('① 動画の名前が変わる', r.names.V5 === '05 ダックアンダーからのフィニッシュ', r.names);
ck('① 字幕の名前も新しい名前に変わる（.srt / .ja.srt）', r.names.S5 === '05 ダックアンダーからのフィニッシュ.srt' && r.names.S5J === '05 ダックアンダーからのフィニッシュ.ja.srt', r.names);
ck('② 後ろに別の文字がある字幕（05-part2）・ほかの動画の字幕（06.srt）・ほかの動画は触らない', r.names.S5P === '05-part2.srt' && r.names.S6 === '06.srt' && r.names.V6 === '06.mp4', r.names);
ck('② Drive に書くのは名前だけ', r.writes.length === 3 && r.writes.every(w => JSON.stringify(Object.keys(w.body)) === '["name"]'), r.writes);
ck('① 知らせに字幕の件数が出る', /字幕2件の名前も変更/.test(r.toast), r.toast);
ck('⑤ 動画のデータの保存は1回・ブックマークに触らない', r.saves === 1 && r.bms === 1, r);

console.log('── ③ 同じ名前のファイルがある ──');
await setup({ ...FILES, X: { name: 'ABC.ja.srt', parents: ['P'] } });
r = await rename('ABC');
ck('③ 同じ名前（ABC.ja.srt）があれば、その字幕は変えない・もう片方は変える', r.names.S5J === '05.ja.srt' && r.names.S5 === 'ABC.srt' && r.names.X === 'ABC.ja.srt', r.names);
ck('③ 変えられなかった件数を知らせる', /字幕1件の名前も変更／字幕1件は名前を変えられませんでした/.test(r.toast), r.toast);

console.log('── ④ 動画の名前を変えられない ──');
await setup(FILES, { failVideo: 'V5' });
r = await rename('別の名前');
ck('④ 動画の名前を変えられなければ、字幕の名前も変えない', r.names.S5 === '05.srt' && r.names.S5J === '05.ja.srt' && r.writes.length === 1, r);
ck('④ その旨を知らせる', /未変更/.test(r.toast), r.toast);

ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ タイトル編集で字幕の名前も一緒に変わる');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
