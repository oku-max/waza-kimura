// ═══ リストの絞り込みが効くこと（足す・外す・リセット・切り替え）を、本物の画面でランダムに踏む（v53.008）═══
// 使い方: node tools/cv-filter-fuzz-check.mjs   （SEEDS=1,2,3 で回す回を変えられる）
// オーナー「リストの内容がただしくない」「フィルタリングが機能してねえんじゃねえのか」（2026-11-19）。
// テーブル表示のリストは orgFilters（テーブル用の絞り込み）で絞るのに、サイドパネルの絞り込みは
// window.filters にだけ書かれ、テーブル用へ写すのはマスターのときだけだった（index.html の AF の包み）。
// リストを開いたときに入ったテーブル用の絞り込みがそのまま残り、サイドパネルで外しても外れない
// （足した分は効く）。リロードでテーブル用が空に戻るので「リロードで直る」ように見えた。
// 見ること: リストを開く・マスター・カード⇔テーブル・サイドパネルで足す/外す・リセット・条件の編集（保存/✕）・
// 再読み込みをランダムに60手。毎手「画面に見えている絞り込み（サイドパネル＝window.filters と検索語）と
// リストの条件から計算した動画」と「実際に出ている動画」が同じか。違ったら、その1手と手順を出す。
// 修正前の版で SEED 1 が22手目で赤くなることを確認済み。
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
const PORT = 8263;
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 900000).unref?.();
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
  { id:'L1', label:'L1', saveMode:'dynamic', viewType:'table', videoIds:[], filterConditions:{ ch:['LG'], pl:['P1','P2','P3','P4'] }, columns:[], rowData:{} },
  { id:'L2', label:'L2', saveMode:'dynamic', viewType:'card', videoIds:[], filterConditions:{ pl:['P2','Q'] }, columns:[], rowData:{} },
  { id:'M1', label:'M1', saveMode:'static', viewType:'table', videoIds:['v1','v5','v9','x1'], columns:[], rowData:{} },
];
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  
  'users/u1/videos.json': { videos:[{id:'v1',title:'t1',channel:'LG',pl:'P1',addedAt:'2026-01-02'},{id:'v2',title:'t2',channel:'LG',pl:'P1',addedAt:'2026-01-03'},{id:'v3',title:'t3',channel:'LG',pl:'P1',addedAt:'2026-01-04'},{id:'v4',title:'t4',channel:'LG',pl:'P2',addedAt:'2026-01-05'},{id:'v5',title:'t5',channel:'LG',pl:'P2',addedAt:'2026-01-06'},{id:'v6',title:'t6',channel:'LG',pl:'P2',addedAt:'2026-01-07'},{id:'v7',title:'t7',channel:'LG',pl:'P2',addedAt:'2026-01-08'},{id:'v8',title:'t8',channel:'LG',pl:'P3',addedAt:'2026-01-09'},{id:'v9',title:'t9',channel:'LG',pl:'P3',addedAt:'2026-01-10'},{id:'v10',title:'t10',channel:'LG',pl:'P3',addedAt:'2026-01-11'},{id:'v11',title:'t11',channel:'LG',pl:'P3',addedAt:'2026-01-12'},{id:'v12',title:'t12',channel:'LG',pl:'P3',addedAt:'2026-01-13'},{id:'v13',title:'t13',channel:'LG',pl:'P4',addedAt:'2026-01-14'},{id:'v14',title:'t14',channel:'LG',pl:'P4',addedAt:'2026-01-15'},{id:'v15',title:'t15',channel:'LG',pl:'P4',addedAt:'2026-01-16'},{id:'v16',title:'t16',channel:'LG',pl:'P4',addedAt:'2026-01-17'},{id:'v17',title:'t17',channel:'LG',pl:'P4',addedAt:'2026-01-18'},{id:'v18',title:'t18',channel:'LG',pl:'P4',addedAt:'2026-01-19'},{id:'x0',title:'x0',channel:'Other',pl:'Q',addedAt:'2026-01-01'},{id:'x1',title:'x1',channel:'Other',pl:'Q',addedAt:'2026-01-01'},{id:'x2',title:'x2',channel:'Other',pl:'Q',addedAt:'2026-01-01'},{id:'x3',title:'x3',channel:'Other',pl:'Q',addedAt:'2026-01-01'}], updatedAt:'x' } };
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
let fails = 0;
for (const SEEDN of String(process.env.SEEDS || '1,2,3').split(',').map(Number)) { let rs = SEEDN; const rnd = n => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs % n; };
const A = await open(await newCtx());
const probe = () => A.evaluate(() => {
  const cur = window._cvActiveViewId; const mode = window._libViewMode;
  const shown = (mode === 'org' ? window.orgFilt(window.videos) : window.filt(window.videos)).map(v => v.id).sort();
  const lib = { pl: [...(window.filters.playlist||[])], ch: [...(window.filters.channel||[])] };
  const org = { pl: [...(window.orgFilters?.playlist||[])], ch: [...(window.orgFilters?.channel||[])] };
  const q = window.wkSearchWord ? window.wkSearchWord() : '';
  let base = cur ? window._cvResolveVideos(cur) : window.videos.filter(v => !v.archived);
  const parsed = window._parseQuery(q);
  const exp = base.filter(v => (!lib.pl.length || lib.pl.includes(v.pl)) && (!lib.ch.length || lib.ch.includes(v.channel)) && window._matchQuery(v, parsed, null)).map(v => v.id).sort();
  return { cur, mode, shown: shown.join(','), exp: exp.join(','), lib: JSON.stringify(lib), org: JSON.stringify(org), q };
});
const ACTS = [
  ['リストL1を開く', () => A.evaluate(() => window._cvPickerSelect('L1'))],
  ['リストL2を開く', () => A.evaluate(() => window._cvPickerSelect('L2'))],
  ['リストM1を開く', () => A.evaluate(() => window._cvPickerSelect('M1'))],
  ['マスター', () => A.evaluate(() => window._cvClearSelection())],
  ['カード表示', () => A.evaluate(() => window._libView('card'))],
  ['テーブル表示', () => A.evaluate(() => window._libView('org'))],
  ['サイドバーでP1', () => A.evaluate(() => { const s = window.filters.playlist; s.has('P1') ? s.delete('P1') : s.add('P1'); window.AF(); })],
  ['サイドバーでP3', () => A.evaluate(() => { const s = window.filters.playlist; s.has('P3') ? s.delete('P3') : s.add('P3'); window.AF(); })],
  ['リセット', () => A.evaluate(() => window.clearAll())],
  ['L1の条件を編集→P4を外して保存', () => A.evaluate(async () => { window.cvOpenConditionEditor('L1'); await new Promise(r => setTimeout(r, 300)); window.uniToggle('playlist','P4'); await new Promise(r => setTimeout(r, 700)); window._cvSaveDynamic(); })],
  ['L1の条件を編集→P4を足して保存', () => A.evaluate(async () => { window.cvOpenConditionEditor('L1'); await new Promise(r => setTimeout(r, 300)); const s = window.filters.playlist; if (!s.has('P4')) window.uniToggle('playlist','P4'); await new Promise(r => setTimeout(r, 700)); window._cvSaveDynamic(); })],
  ['L2の条件を編集→✕で閉じる', () => A.evaluate(async () => { window.cvOpenConditionEditor('L2'); await new Promise(r => setTimeout(r, 300)); window.uniToggle('playlist','P1'); await new Promise(r => setTimeout(r, 700)); window.uniClose(); })],
  ['再読み込み', async () => { await reload(A); }],
];
const hist = [];
for (let i = 0; i < 60; i++) {
  const [name, fn] = ACTS[rnd(ACTS.length)];
  hist.push(name); await fn(); await wait(900);
  const p = await probe();
  if (p.shown !== p.exp) { fails++; console.log(`SEED ${SEEDN} ✗ ${i + 1}手目「${name}」でずれた`); console.log('  手順:', hist.join(' → ')); console.log('  ', JSON.stringify(p)); break; }
  if (i === 59) console.log(`SEED ${SEEDN} ✓ 60手ずれなし`);
}
await A.context().close();
}
await b.close(); srv.close();
console.log(fails ? `\n✗ ${fails}件の失敗` : '\n✓ 全部通過');
process.exit(fails ? 1 : 0);
