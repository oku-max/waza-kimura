// ═══ リストごとの絞り込み（検索語も含む）を、開き直しても・ほかの端末でも覚えていること（v52.959）═══
// 使い方: node tools/cv-filter-memory-check.mjs
// オーナー「カスタムビューのフィルターが毎回リセットされてる」「検索語も含む」「端末横断にすべき」。
// 以前は開いている間だけのメモ（_viewFilterSnapshots）にしか覚えず、開き直すたびに消えていた。
// 覚える場所は users/{uid}/data/cvFilters（リストの本体とは別の文書）と、この端末の控え wk_cvFilterSnaps。
// 見ること:
//   ① 絞り込みと検索語を変えると、そのリストの分だけクラウドに覚える（ほかのリストの分・リストの本体には触らない）
//   ② 開き直すと戻る（手で選んだリストでも。リストの本体 view.searchQuery には書かない）
//   ③ ほかの端末で同じリストを開くと戻る
//   ④ 何も覚えていないリストを開いて空のまま離れても、空を記録しない（ほかの端末の分を空で上書きしない）
//   ⑤ 開いたままのほかの端末に、変更が届く
//   ⑥ 消した（空にした）ことも覚える
//   ⑦ クラウドを読めなかった端末は、クラウドへ書かない
//   ⑧ マスターの検索語も覚える（以前はマスターに戻るたびに消していた）
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
const PORT = 8254;
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
// 本物と同じく、無い文書の update は not-found。'a.b' は入れ子の1つの欄だけを置き換える
await ctx.exposeFunction('__fsUpdate', (p, dj) => { if (!CLOUD[p]) return 'not-found'; const d = JSON.parse(dj); const out = JSON.parse(JSON.stringify(CLOUD[p]));
  for (const [k, v] of Object.entries(d)) { const ks = k.split('.'); let o = out; for (const x of ks.slice(0, -1)) { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; } o[ks[ks.length - 1]] = v; }
  CLOUD[p] = out; return ''; });
return ctx; }

const VIEWS = [
  { id:'_m1', label:'手動リスト', saveMode:'static', viewType:'table', videoIds:['v1','v2'], columns:[], rowData:{} },
  { id:'_d1', label:'条件リスト', saveMode:'dynamic', viewType:'card', videoIds:[], filterConditions:{ ch:['ChA'] }, columns:[], rowData:{} },
  { id:'_m2', label:'別のリスト', saveMode:'static', viewType:'table', videoIds:['v1'], columns:[], rowData:{} },
];
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  'users/u1/data/cvFilters': { snaps: { _d1: { snap: { _search: 'ほかの端末の語' }, at: 1700000000000 } } },
  'users/u1/videos.json': { videos:[{id:'v1',title:'A',channel:'ChA',addedAt:'2026-01-01'},{id:'v2',title:'B',channel:'ChB',addedAt:'2026-01-02'},{id:'v3',title:'C',channel:'ChA',addedAt:'2026-01-03'}], updatedAt:'x' } };
const INIT = seed => {
  const K = '__fs';
  const all = async () => JSON.parse(await window.__fsAll());
  const put = async (p, d) => { await window.__fsPut(p, d === undefined ? null : JSON.stringify(d)); };
  window.__fsLog = [];
  const doc = p => ({
    get: async () => { if (window.__cvfFail && /cvFilters$/.test(p)) throw new Error('読めない'); const d = (await all())[p]; return { exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), metadata:{} }; },
    set: async (d, opt) => { await window.__fsSet(p, JSON.stringify(d), !!(opt && opt.merge)); },
    update: async d => { const r = await window.__fsUpdate(p, JSON.stringify(d)); if (r === 'not-found') { const e = new Error('No document to update'); e.code = 'not-found'; throw e; } },
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


const cvf = () => CLOUD['users/u1/data/cvFilters']?.snaps || {};
const state = pg => pg.evaluate(() => ({ cur: (window._cvViews || []).length, q: window.wkSearchWord?.() || '', tb: [...(window.filters?.tbNew || [])] }));
const openList = async (pg, id) => { await pg.evaluate(id => id ? window._cvPickerSelect(id) : window._cvClearSelection(), id); await wait(900); };
const setF = async (pg, q, tb) => { await pg.evaluate(([q, tb]) => { window.wkSetSearchWord(q); const s = window.filters.tbNew; s.clear(); tb.forEach(x => s.add(x)); window.AF(); }, [q, tb]); await wait(1500); };
const viewDocs = () => JSON.stringify(Object.keys(CLOUD).filter(k => /\/data\/(cv_|settings)/.test(k)).sort().map(k => [k, CLOUD[k]]));

const A = await open(await newCtx());
await openList(A, '_m1');
const before = viewDocs();
await setF(A, 'グリップ', ['トップ']);
ck('① 検索語と絞り込みを、そのリストの分として覚える', cvf()._m1?.snap?._search === 'グリップ' && JSON.stringify(cvf()._m1?.snap?.tbNew) === '["トップ"]', JSON.stringify(cvf()._m1));
ck('① ほかのリストの分（_d1）には触らない', cvf()._d1?.snap?._search === 'ほかの端末の語' && cvf()._d1?.at === 1700000000000, JSON.stringify(cvf()._d1));
ck('① リストの本体（cv_* 文書・settings）に検索語を書かない', !/グリップ/.test(viewDocs()), viewDocs().slice(0, 300));
await openList(A, '_m2');
ck('④ 何も覚えていないリストを開いて空のまま離れても、空を記録しない', !('_m2' in cvf()), Object.keys(cvf()).join());
await openList(A, '_m1');
let s = await state(A);
ck('② リストを切り替えて戻ると戻る', s.q === 'グリップ' && JSON.stringify(s.tb) === '["トップ"]', JSON.stringify(s));
await reload(A); await openList(A, '_m1');
s = await state(A);
ck('② 開き直しても戻る（手で選んだリスト）', s.q === 'グリップ' && JSON.stringify(s.tb) === '["トップ"]', JSON.stringify(s));

const B = await open(await newCtx());
await openList(B, '_m1');
s = await state(B);
ck('③ ほかの端末で同じリストを開くと戻る', s.q === 'グリップ' && JSON.stringify(s.tb) === '["トップ"]', JSON.stringify(s));
await openList(B, '_d1');
s = await state(B);
ck('③ ほかの端末で覚えた条件リストの語も戻る', s.q === 'ほかの端末の語', JSON.stringify(s));
await openList(B, '_m1');
ck('③ ほかの端末で開いて離れるだけでは、同じ中身を記録し直さない（時刻が変わらない）', cvf()._d1?.at === 1700000000000, JSON.stringify(cvf()._d1).slice(0, 200));

console.log('\n── 開いたままのほかの端末に届く ──');
await setF(A, 'スイープ', []);
let got = false; for (let i = 0; i < 20 && !got; i++) { await wait(300); got = (await state(B)).q === 'スイープ'; }
ck('⑤ A で変えた語が、同じリストを開いたままの B に届く', got, JSON.stringify(await state(B)));
await setF(A, '', []);
ck('⑥ 検索語を消したことも覚える（空にした）', cvf()._m1?.snap?._search === '' && (cvf()._m1?.snap?.tbNew || []).length === 0, JSON.stringify(cvf()._m1));

console.log('\n── マスターの検索語 ──');
await openList(A, null);
await setF(A, 'マスターの語', []);
await openList(A, '_m2'); await openList(A, null);
ck('⑧ マスターに戻ると、マスターの検索語が戻る（以前は毎回消していた）', (await state(A)).q === 'マスターの語', JSON.stringify(await state(A)));

console.log('\n── クラウドを読めなかった端末 ──');
const C = await (async () => { const ctx = await mkCtx(); await ctx.addInitScript(INIT, SEED); await ctx.addInitScript(() => { window.__cvfFail = true; }); return open(ctx); })();
const snapBefore = JSON.stringify(cvf());
await openList(C, '_m1'); await setF(C, 'Cの語', ['ボトム']); await openList(C, '_m2');
ck('⑦ クラウドを読めなかった端末は、クラウドへ書かない', JSON.stringify(cvf()) === snapBefore, JSON.stringify(cvf()).slice(0, 300));

for (const p of [A, B, C]) await p.context().close();
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
