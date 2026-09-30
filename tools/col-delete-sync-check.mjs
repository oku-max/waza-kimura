// ═══ 完全に削除したカスタム列が戻ってこないこと（v52.896）═══
// 使い方: node tools/col-delete-sync-check.mjs
//
// なぜ要るか（2026-09-30 オーナー「削除したカスタム列がまた出現している」）:
//   削除の印を settings doc（cvShared.deleted）にだけ置いていた。settings は、削除より前から
//   開いたままの端末（別のタブ・アプリ・PC）も丸ごと .set で書くので、その端末が何か保存した瞬間に
//   印の無い古い中身でクラウドが上書きされ、列が戻る。同じスマホの別のタブなら localStorage の印も
//   上書きされるので、消した端末でも戻る。
//   印は別の doc（data/cvDeleted）に arrayUnion で足すだけにした。
//
// 本物の index.html と js/firebase.js を、クラウドの代わり（node 側の1つの入れ物）につないで動かす。
// 2つの端末（別のブラウザ）と、同じ端末の2つのタブを作って、実際の手順を踏む。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8252;
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 170000).unref?.();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const CLOUD = {};
async function mkCtx(){ const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
await ctx.exposeFunction('__fsAll', () => JSON.stringify(CLOUD));
await ctx.exposeFunction('__fsPut', (p, d) => { if (d === null) delete CLOUD[p]; else CLOUD[p] = JSON.parse(d); });
// 本物の Firestore と同じく、1回の書き込み（arrayUnion 等の合成も）を割り込み無しで行う
await ctx.exposeFunction('__fsSet', (p, dj, merge) => { const d = JSON.parse(dj); const cur = (merge && CLOUD[p]) || {}; const out = { ...cur };
  for (const [k, v] of Object.entries(d)) {
    if (v && v.__au) out[k] = [...new Set([...(cur[k]||[]), ...v.__au])];
    else if (v && v.__ar) out[k] = (cur[k]||[]).filter(x => !v.__ar.includes(x));
    else out[k] = v; }
  CLOUD[p] = out; });
return ctx; }
const T = [
  [{type:'tracker',label:'ドリルトラッカー',pastDays:4,futureDays:1},{type:'select',label:'メニュー',options:['A','B','C','D']},{type:'checkbox',label:'今週やった'}],
  [{type:'progress',label:'完成度'},{type:'number',label:'スパー回数',unit:'回'},{type:'select',label:'フェーズ',options:['学習中','反復中','使えてる']},{type:'text',label:'次のステップ'}],
  [{type:'stars',label:'評価'},{type:'checkbox',label:'見た'},{type:'stars',label:'レート'},{type:'tracker',label:'トラッカー'}],
];
let n = 100;
const VIEWS = T.map((cols, i) => ({ id:'_l'+i, label:'リスト'+i, saveMode:'static', viewType:'table', videoIds:['v1','v2'],
  columns: cols.map(c => ({ id:'col'+(n++), ...c })), rowData:{} }));
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  'users/u1/videos.json': { videos:[{id:'v1',title:'A',addedAt:'2026-01-01'},{id:'v2',title:'B',addedAt:'2026-01-02'}], updatedAt:'x' } };
const INIT = seed => {
  const K = '__fs';
  const all = async () => JSON.parse(await window.__fsAll());
  const put = async (p, d) => { await window.__fsPut(p, d === undefined ? null : JSON.stringify(d)); };
  window.__fsLog = [];
  const doc = p => ({
    get: async () => { const d = (await all())[p]; return { exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), metadata:{} }; },
    set: async (d, opt) => { await window.__fsSet(p, JSON.stringify(d), !!(opt && opt.merge)); },
    delete: async () => { await put(p, undefined); },
    onSnapshot: () => () => {},
    collection: c => col(p + '/' + c),
  });
  const col = p => ({ doc: id => doc(p + '/' + id), get: async () => ({ docs: [], empty: true, forEach(){} }), where: () => col(p), orderBy: () => col(p), limit: () => col(p) });
  const fsFn = () => ({ settings: () => {}, collection: c => col(c), doc: p => doc(p), enablePersistence: async () => {} });
  fsFn.FieldValue = { arrayUnion: (...a) => ({ __au: a }), arrayRemove: (...a) => ({ __ar: a }), serverTimestamp: () => 0, delete: () => null };
  const user = { uid:'u1', email:'okujournal@gmail.com', displayName:'H', getIdToken: async () => 't' };
  const authFn = () => ({ onAuthStateChanged: cb => { setTimeout(() => cb(user), 50); return () => {}; }, currentUser: user, setPersistence: async () => {},
    getRedirectResult: async () => ({}), signOut: async () => {} });
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; this.setCustomParameters = () => {}; };
  authFn.Auth = { Persistence: { LOCAL: 'local' } };
  const sref = p => ({ child: c => sref(p + '/' + c),
    getDownloadURL: async () => { const d = (await all())[p]; if (!d) { const e = new Error('nf'); e.code = 'storage/object-not-found'; throw e; } return 'data:application/json,' + encodeURIComponent(JSON.stringify(d)); },
    getMetadata: async () => ({ size: 1, customMetadata: {} }),
    put: async blob => { await put(p, JSON.parse(await blob.text())); return {}; } });
  window.firebase = { initializeApp: () => {}, auth: authFn, firestore: fsFn, storage: () => ({ ref: p => sref(p || '') }), apps: [] };
  localStorage.setItem('wk_lang','ja');
};

Object.assign(CLOUD, JSON.parse(JSON.stringify(SEED)));

let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d ? '  → ' + String(d).slice(0, 300) : '')); if (!ok) fail++; };
const reset = () => { for (const k of Object.keys(CLOUD)) delete CLOUD[k]; Object.assign(CLOUD, JSON.parse(JSON.stringify(SEED))); };
async function newCtx() { const ctx = await mkCtx(); await ctx.addInitScript(INIT, SEED); return ctx; }
async function open(ctx) { const pg = await ctx.newPage(); pg.on('dialog', d => d.accept());
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4500); return pg; }
const cols = pg => pg.evaluate(() => (window._cvSharedRaw?.()?.cols || []).map(c => c.label));
const delAll = pg => pg.evaluate(() => { (window._cvSharedRaw()?.cols || []).forEach(c => window._cvDeleteCol(c.id, true)); });
const reload = async pg => { await pg.reload({ waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4500); };
const cloudDel = () => (CLOUD['users/u1/data/cvDeleted']?.ids || []);

console.log('\n── 別の端末が、削除より前から開いたまま保存する ──');
reset();
{ const A = await open(await newCtx()), B = await open(await newCtx());
  ck('はじめは両方に11列', (await cols(A)).length === 11 && (await cols(B)).length === 11, JSON.stringify([await cols(A), await cols(B)]));
  await delAll(A); await A.waitForTimeout(1500);
  ck('削除の印が印の doc に11個', cloudDel().length === 11, JSON.stringify(cloudDel()));
  await B.evaluate(() => window.saveUserSettings()); await B.waitForTimeout(1000);
  ck('（前提）古い端末の保存で settings の印は消える', !(CLOUD['users/u1/data/settings']?.cvShared?.deleted || []).length);
  ck('★ 印の doc は古い端末の保存で減らない', cloudDel().length === 11, JSON.stringify(cloudDel()));
  await reload(A); ck('★ 消した端末: 再読み込みしても戻らない', (await cols(A)).length === 0, JSON.stringify(await cols(A)));
  await reload(B); ck('★ 古かった端末も: 再読み込みすると消える', (await cols(B)).length === 0, JSON.stringify(await cols(B)));
  await A.context().close(); await B.context().close(); }

console.log('\n── 同じスマホの別のタブ（localStorage も共有）──');
reset();
{ const ctx = await newCtx(); const A = await open(ctx), B = await open(ctx);
  await delAll(A); await A.waitForTimeout(1500);
  await B.evaluate(() => { window._cvSave(); window.saveUserSettings(); }); await B.waitForTimeout(1000);
  const localDel = await A.evaluate(() => (JSON.parse(localStorage.getItem('wk_cv_shared') || '{}').deleted || []).length);
  ck('（前提）古いタブの保存で、この端末の localStorage の印も消える', localDel === 0, localDel);
  await reload(A); ck('★ それでも再読み込みで戻らない', (await cols(A)).length === 0, JSON.stringify(await cols(A)));
  await ctx.close(); }

console.log('\n── 取り消し ──');
reset();
{ const A = await open(await newCtx());
  await A.evaluate(() => { const c = window._cvSharedRaw().cols.find(x => x.label === '評価'); window._cvDeleteCol(c.id, true); window.__cvLastDeleteUndo(); });
  await A.waitForTimeout(1500);
  ck('★ 取り消すと印の doc から外れる', cloudDel().length === 0, JSON.stringify(cloudDel()));
  await reload(A); ck('★ 取り消した列は再読み込みしても残る', (await cols(A)).includes('評価'), JSON.stringify(await cols(A)));
  await A.context().close(); }

console.log('\n── 前の版で消した印（この端末の localStorage にだけある）──');
reset();
{ const A = await open(await newCtx());
  await delAll(A); await A.waitForTimeout(1500);
  delete CLOUD['users/u1/data/cvDeleted'];   // 前の版は印の doc を書いていなかった
  await reload(A);
  ck('★ 読み込みのとき、手元の印を印の doc へ足す', cloudDel().length === 11, JSON.stringify(cloudDel()));
  ck('戻っていない', (await cols(A)).length === 0, JSON.stringify(await cols(A)));
  await A.context().close(); }

await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
