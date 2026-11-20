// ═══ 条件の編集画面で選んでいる途中の状態が、リストの「前回の絞り込み」に残らないこと（v53.007）═══
// 使い方: node tools/cv-edit-leak-check.mjs
// オーナー「リストの内容がただしくない」「ぜんぜんちがうだろうが」（2026-11-19）。
// 「Lachlan Giles _Guard Retention」は条件（チャンネル＋プレイリスト4つ）が 181件なのに、開くと
// 最初に選んだプレイリスト「01-02. 理論・基本」だけの 39本 が出ていた。
// 原因: 条件の編集画面はチップを押すたびに window.filters を変えて AF() を呼ぶ。v52.959 の
// 「リストごとの前回の絞り込みを覚える」がそれを拾い、編集中の途中の状態を、そのとき開いている
// リストの絞り込みとして覚えてクラウドへ送っていた。保存すれば上書きされたが、編集画面を開いたまま
// 再読み込み・アプリを閉じる、またはほかの端末で同じリストを開いていると、途中の状態が残って
// 条件の上に見えない絞り込みとして掛かり続けた（本番の版で、この検査の①が 3本 になるのを確認済み）。
// 見ること:
//   ① 編集画面で選んでいる途中に再読み込みしても、リストは条件どおりに出る（覚えない・クラウドに送らない）
//   ② ほかの端末で同じリストを開いていても、編集中の状態で絞られない
//   ③ 保存すれば新しい条件で出る／✕で閉じれば何も変わらない／編集の後もふつうに絞り込める（v53.020 から条件リストの分は覚えない）
//   ④ すでに途中の状態を覚えてしまったリストも、v53.020 からは開いた時点で条件どおり（覚えた分を使わない）
// 本物の index.html と js/firebase.js を、クラウドの代わり（node 側の入れ物）につないで踏む。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8262;
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
  { id:'_d1', label:'Lachlan', saveMode:'dynamic', viewType:'table', videoIds:[], filterConditions:{ ch:['LG'], pl:['P1','P2','P3','P4'] }, columns:[], rowData:{} },
  { id:'_c1', label:'カード型の条件', saveMode:'dynamic', viewType:'card', videoIds:[], filterConditions:{ pl:['P1'] }, columns:[], rowData:{} },
  { id:'_m1', label:'手動', saveMode:'static', viewType:'table', videoIds:['v1','v2'], columns:[], rowData:{} },
];
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  
  'users/u1/videos.json': { videos:[{id:'v1',title:'t1',channel:'LG',pl:'P1',addedAt:'2026-01-02'},{id:'v2',title:'t2',channel:'LG',pl:'P1',addedAt:'2026-01-03'},{id:'v3',title:'t3',channel:'LG',pl:'P1',addedAt:'2026-01-04'},{id:'v4',title:'t4',channel:'LG',pl:'P2',addedAt:'2026-01-05'},{id:'v5',title:'t5',channel:'LG',pl:'P2',addedAt:'2026-01-06'},{id:'v6',title:'t6',channel:'LG',pl:'P2',addedAt:'2026-01-07'},{id:'v7',title:'t7',channel:'LG',pl:'P2',addedAt:'2026-01-08'},{id:'v8',title:'t8',channel:'LG',pl:'P3',addedAt:'2026-01-09'},{id:'v9',title:'t9',channel:'LG',pl:'P3',addedAt:'2026-01-10'},{id:'v10',title:'t10',channel:'LG',pl:'P3',addedAt:'2026-01-11'},{id:'v11',title:'t11',channel:'LG',pl:'P3',addedAt:'2026-01-12'},{id:'v12',title:'t12',channel:'LG',pl:'P3',addedAt:'2026-01-13'},{id:'v13',title:'t13',channel:'LG',pl:'P4',addedAt:'2026-01-14'},{id:'v14',title:'t14',channel:'LG',pl:'P4',addedAt:'2026-01-15'},{id:'v15',title:'t15',channel:'LG',pl:'P4',addedAt:'2026-01-16'},{id:'v16',title:'t16',channel:'LG',pl:'P4',addedAt:'2026-01-17'},{id:'v17',title:'t17',channel:'LG',pl:'P4',addedAt:'2026-01-18'},{id:'v18',title:'t18',channel:'LG',pl:'P4',addedAt:'2026-01-19'},{id:'x1',title:'x',channel:'Other',pl:'Q',addedAt:'2026-01-01'}], updatedAt:'x' } };
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
const openList = async (pg, id) => { await pg.evaluate(id => id ? window._cvPickerSelect(id) : window._cvClearSelection(), id); await wait(1200); };
const shown = pg => pg.evaluate(() => { const l = window._libViewMode === 'org' ? window.orgFilt(window.videos) : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(e => ({ id: e.id.slice(5) }));
  return l.map(x => x.id).sort().join(','); });
const n = async pg => (await shown(pg)).split(',').filter(Boolean).length;
const snapPl = k => JSON.stringify(cvf()[k]?.snap?.playlist || []);
const ALL = 18;

console.log('── ① 編集画面を開いたまま再読み込み ──');
const A = await open(await newCtx());
await openList(A, '_d1');
ck('開くと条件どおり 18本', await n(A) === ALL, await n(A));
await A.evaluate(() => window.cvOpenConditionEditor('_d1')); await wait(600);
for (const p of ['P2','P3','P4']) { await A.evaluate(p => window.uniToggle('playlist', p), p); await wait(900); }
await wait(1200);
ck('★ 編集中の途中の状態をクラウドへ送らない', !cvf()._d1, JSON.stringify(cvf()._d1));
ck('★ この端末の控えにも入れない', !(await A.evaluate(() => (JSON.parse(localStorage.getItem('wk_cvFilterSnaps') || '{}'))._d1)), '');
await reload(A); await openList(A, '_d1');
ck('★ 再読み込みして開いても条件どおり 18本（以前は途中の状態の 3本）', await n(A) === ALL, await n(A));
ck('条件そのものは変わっていない', await A.evaluate(() => JSON.stringify(window._cvViews.find(v => v.id === '_d1').filterConditions.pl)) === '["P1","P2","P3","P4"]', '');

console.log('── ② ほかの端末で同じリストを開いている ──');
const B = await open(await newCtx());
await openList(B, '_d1');
await A.evaluate(() => window.cvOpenConditionEditor('_d1')); await wait(600);
for (const p of ['P2','P3']) { await A.evaluate(p => window.uniToggle('playlist', p), p); await wait(900); }
await wait(2000);
ck('★ A が編集している間、B の画面は条件どおりのまま', await n(B) === ALL, await n(B));

console.log('── ③ 保存・✕・ふつうの絞り込み ──');
await A.evaluate(() => window._cvSaveDynamic()); await wait(2500);
ck('保存すると新しい条件（P1・P4）で出る', await shown(A) === await A.evaluate(() => window.videos.filter(v => ['P1','P4'].includes(v.pl)).map(v => v.id).sort().join(',')), await shown(A));
await A.evaluate(() => window.cvOpenConditionEditor('_d1')); await wait(500);
await A.evaluate(() => window.uniToggle('playlist', 'P1')); await wait(1000);
await A.evaluate(() => window.uniClose()); await wait(1200);
ck('✕で閉じれば、出る動画も条件も変わらない', await n(A) === 9 && await A.evaluate(() => JSON.stringify(window._cvViews.find(v => v.id === '_d1').filterConditions.pl)) === '["P1","P4"]', await n(A));
// v53.020 から、条件で作ったリストは開くと条件そのものがフィルターになる。ふつうに絞り込んでも「変更あり」になるだけで、
// 前回の絞り込み（cvFilters）には覚えない（変えた内容がリストになるのは「上書き保存」を押したときだけ）
await A.evaluate(() => { window.filters.playlist.delete('P1'); window.AF(); }); await wait(1500);
ck('編集の後も、ふつうに絞り込める（P1 を外すと P4 だけ）', await n(A) === 6, await n(A));
ck('ふつうに絞り込んでも、条件で作ったリストの前回の絞り込みには覚えない（v53.020）', snapPl('_d1') !== '["P4"]', snapPl('_d1'));
ck('絞り込んだだけではリストの条件は変わらない', await A.evaluate(() => JSON.stringify(window._cvViews.find(v => v.id === '_d1').filterConditions.pl)) === '["P1","P4"]');

console.log('── ④ すでに途中の状態を覚えてしまったリスト ──');
CLOUD['users/u1/data/cvFilters'] = { snaps: { _d1: { snap: { playlist: ['P1'], channel: ['LG'] }, at: Date.now() + 1000 } } };
await A.evaluate(() => { window._cvViews.find(v => v.id === '_d1').filterConditions = { ch:['LG'], pl:['P1','P2','P3','P4'] }; window._cvSave(); localStorage.removeItem('wk_cvFilterSnaps'); });
await wait(1500); await reload(A); await openList(A, '_d1');
ck('★ 覚えてしまった途中の状態は使わず、開いた時点で条件どおり 18本（v53.020）', await n(A) === ALL, await n(A));
await A.evaluate(() => window.clearAll()); await wait(2000);
ck('★ フィルターをリセットすると全部の動画（条件より多い）', await n(A) > ALL, await n(A));
ck('★ リセットしただけではリストの条件は変わらない', await A.evaluate(() => JSON.stringify(window._cvViews.find(v => v.id === '_d1').filterConditions.pl)) === '["P1","P2","P3","P4"]');
await reload(B); await openList(B, '_d1');
ck('★ ほかの端末で開き直しても 18本', await n(B) === ALL, await n(B));

for (const p of [A, B]) await p.context().close();
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
