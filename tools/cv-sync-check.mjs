// ═══ カスタムビューの編集が端末をまたいで届くこと（2026-10-06・オーナー「カスタムビューの編集って端末横断できてる？」）═══
// 使い方: node tools/cv-sync-check.mjs
// 本物の index.html と js/firebase.js を、クラウドの代わり（node 側の1つの入れ物）につないで、
// 2つの端末（別のブラウザ）を開いたまま、片方で変えたものがもう片方に再読み込みなしで届くかを見る。
// クラウドの代わりの onSnapshot は、doc が変わったら知らせる（本物と同じく最初の1回も知らせる）。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8253;
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

const VIEWS = [
  { id:'_m1', label:'手動リスト', saveMode:'static', viewType:'table', videoIds:['v1','v2'], columns:[], rowData:{} },
  { id:'_d1', label:'条件リスト', saveMode:'dynamic', viewType:'card', videoIds:[], filterConditions:{ ch:['ChA'] }, columns:[], rowData:{} },
  { id:'_m2', label:'別のリスト', saveMode:'static', viewType:'table', videoIds:['v1'], columns:[], rowData:{} },
];
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  'users/u1/videos.json': { videos:[{id:'v1',title:'A',channel:'ChA',addedAt:'2026-01-01'},{id:'v2',title:'B',channel:'ChB',addedAt:'2026-01-02'},{id:'v3',title:'C',channel:'ChA',addedAt:'2026-01-03'}], updatedAt:'x' } };
const INIT = seed => {
  const K = '__fs';
  const all = async () => JSON.parse(await window.__fsAll());
  const put = async (p, d) => { await window.__fsPut(p, d === undefined ? null : JSON.stringify(d)); };
  window.__fsLog = [];
  const doc = p => ({
    get: async () => { const d = (await all())[p]; return { exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), metadata:{} }; },
    set: async (d, opt) => { await window.__fsSet(p, JSON.stringify(d), !!(opt && opt.merge)); },
    delete: async () => { await put(p, undefined); },
    onSnapshot: (cb) => { let last, on = true;
      const tick = async () => { if (!on) return; const d = (await all())[p]; const j = JSON.stringify(d);
        if (j !== last) { last = j; try { cb({ exists: d !== undefined, data: () => d && JSON.parse(j), metadata: { hasPendingWrites: false } }); } catch (e) {} }
        setTimeout(tick, 300); };
      tick(); return () => { on = false; }; },
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
async function newCtx() { const ctx = await mkCtx(); await ctx.addInitScript(INIT, SEED); return ctx; }
async function open(ctx) { const pg = await ctx.newPage(); pg.on('dialog', d => d.accept());
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4500); return pg; }
const reload = async pg => { await pg.reload({ waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4500); };
const views = pg => pg.evaluate(() => (window._cvViews || []).map(v => ({ id: v.id, label: v.label, ids: v.videoIds, fc: v.filterConditions, vt: v.viewType })));
const get = (arr, id) => arr.find(v => v.id === id);
const wait = ms => new Promise(r => setTimeout(r, ms));
// 書いた後、相手の端末が見張り（onSnapshot）で拾うまで待つ。再読み込みはしない
const live = async (pg, fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn(await views(pg))) return true; await wait(250); } return false; };

const A = await open(await newCtx()), B = await open(await newCtx());
ck('はじめは両方に3つ', (await views(A)).length === 3 && (await views(B)).length === 3, JSON.stringify([await views(A), await views(B)]));
await wait(1500);

console.log('\n── A で変えたものが、開いたままの B に届くか（再読み込みなし）──');
await A.evaluate(() => { window.prompt = () => '手動リスト改'; window._cvRenameView('_m1'); });
ck('名前を変える', await live(B, a => get(a, '_m1')?.label === '手動リスト改'), JSON.stringify(get(await views(B), '_m1')));
await A.evaluate(() => { const v = window._cvViews.find(x => x.id === '_m1'); v.videoIds = ['v1','v2','v3']; window._cvSave(); });
ck('手動リストの動画を足す', await live(B, a => (get(a, '_m1')?.ids || []).length === 3), JSON.stringify(get(await views(B), '_m1')));
await A.evaluate(() => { const v = window._cvViews.find(x => x.id === '_d1'); v.filterConditions = { ch:['ChB'] }; window._cvSave(); });
ck('条件リストの条件を変える', await live(B, a => JSON.stringify(get(a, '_d1')?.fc) === '{"ch":["ChB"]}'), JSON.stringify(get(await views(B), '_d1')));
await A.evaluate(() => window._cvMoveView('_m2', -1));
ck('並び順（整理）', await live(B, a => a.map(v => v.id).join() === '_m1,_m2,_d1'), (await views(B)).map(v => v.id).join());
await A.evaluate(() => { window._cvViews.push({ id:'cv_1760000000000', label:'新しいリスト', saveMode:'static', viewType:'table', videoIds:['v2'], columns:[], rowData:{} }); window._cvSave(); });
ck('新しく作る', await live(B, a => !!get(a, 'cv_1760000000000')), (await views(B)).map(v => v.label).join());
await A.evaluate(() => window._cvDeleteView('cv_1760000000000'));
ck('★ 消す（v52.951 まで、開いたままの端末には届かなかった）', await live(B, a => !get(a, 'cv_1760000000000')), (await views(B)).map(v => v.label).join());
// 消した後に、開いたままだった端末が別のリストを保存しても、消したリストを書き戻さない
await B.evaluate(() => { window.prompt = () => '別のリスト2'; window._cvRenameView('_m2'); });
await wait(2000);
ck('★ 消したリストをクラウドに書き戻さない（v52.951 まで、消した端末でも復活した）',
  !CLOUD['users/u1/data/cv_cv_1760000000000'] && !(CLOUD['users/u1/data/cv_index']?.ids || []).includes('cv_1760000000000'),
  JSON.stringify(CLOUD['users/u1/data/cv_index']?.ids));
await reload(A);
ck('★ 消した端末で開き直しても戻らない', !get(await views(A), 'cv_1760000000000'), (await views(A)).map(v => v.label).join());

console.log('\n── 両方が開いたまま、別々のリストを順に変える ──');
await A.evaluate(() => { window.prompt = () => 'Aが変えた'; window._cvRenameView('_m1'); });
await wait(1500);
await B.evaluate(() => { window.prompt = () => 'Bが変えた'; window._cvRenameView('_m2'); });
await wait(3000);
const a1 = await views(A), b1 = await views(B);
ck('★ 互いの変更を消さない（A側）', get(a1, '_m1')?.label === 'Aが変えた' && get(a1, '_m2')?.label === 'Bが変えた', JSON.stringify(a1.map(v => v.label)));
ck('★ 互いの変更を消さない（B側）', get(b1, '_m1')?.label === 'Aが変えた' && get(b1, '_m2')?.label === 'Bが変えた', JSON.stringify(b1.map(v => v.label)));

console.log('\n── まだ一度も送れていないリストは、ほかの端末の変更で消さない ──');
await B.evaluate(() => { window._cvViews.push({ id:'cv_1760000000999', label:'オフラインで作った', saveMode:'static', viewType:'table', videoIds:[], columns:[], rowData:{} });
  try { localStorage.setItem('wk_cv_views', JSON.stringify(window._cvViews)); } catch (e) {} });   // クラウドへは送らない
await A.evaluate(() => { window.prompt = () => '条件リスト2'; window._cvRenameView('_d1'); });
ck('A の変更は届く', await live(B, a => get(a, '_d1')?.label === '条件リスト2'), JSON.stringify(await views(B)));
ck('★ 送れていないリストは残る', !!get(await views(B), 'cv_1760000000999'), (await views(B)).map(v => v.label).join());

console.log('\n── 再読み込みしても残る ──');
await reload(B);
const b2 = await views(B);
ck('B を開き直しても A の変更が出る', get(b2, '_m1')?.label === 'Aが変えた' && (get(b2, '_m1')?.ids || []).length === 3 && JSON.stringify(get(b2, '_d1')?.fc) === '{"ch":["ChB"]}', JSON.stringify(b2));

await A.context().close(); await B.context().close();
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
