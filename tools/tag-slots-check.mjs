// ═══ タグの枠を最大10まで使えること（v53.052）═══
// 使い方: node tools/tag-slots-check.mjs
// オーナー「現状タグって最大4件しか使えなかったと思うんだけど、これを最大10件にできますか？」。
// 一覧（js/tag-registry.js）の slots は 4〜10 個。5つ目以降は使っている所までしか持たない
// （使っていなければ今までと同じ4個の形＝前の版のアプリもそのまま読める）。
// 画面は枠から作るので付いてくる（フィルターの窓・カード・動画パネル等）。表の列キーは tag5〜tag10 を足した
// （tb/action/position/technique は変えない）。列キーは、その枠を使っているときだけ並びに足す。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8298;
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 1500000).unref?.();
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
  { id:'DT', label:'条件・表', saveMode:'dynamic', viewType:'table', videoIds:[], filterConditions:{ ch:['C1'] }, columns:[], rowData:{} },
  { id:'DC', label:'条件・カード', saveMode:'dynamic', viewType:'card', videoIds:[], filterConditions:{ pl:['P1','P2'], tech:['T1'] }, columns:[], rowData:{} },
  { id:'ST', label:'手動・表', saveMode:'static', viewType:'table', videoIds:['v1','v2','v3','v4','v6','v9','v12','v15','v24'], columns:[], rowData:{} },
  { id:'DW', label:'語で作ったリスト', saveMode:'dynamic', viewType:'table', videoIds:null, filterConditions:{}, searchQuery:'beta', columns:[], rowData:{} },
  { id:'DN', label:'条件なし', saveMode:'dynamic', viewType:'table', videoIds:null, filterConditions:null, columns:[], rowData:{} },
  { id:'DWC', label:'語・カード', saveMode:'dynamic', viewType:'card', videoIds:null, filterConditions:{ ch:['C2'] }, searchQuery:'alpha', columns:[], rowData:{} },
  { id:'SC', label:'手動・カード', saveMode:'static', viewType:'card', videoIds:['v2','v5','v8','v11','v14','v17','v20','v23'], columns:[], rowData:{} },
];
const VIDEOS = [{"id": "v1", "title": "vid1", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-02", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v2", "title": "vid2", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-03", "memo": "m"}, {"id": "v3", "title": "alpha vid3", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-04"}, {"id": "v4", "title": "beta vid4", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-05"}, {"id": "v5", "title": "vid5", "channel": "C2", "pl": "P3", "tb": [], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-06", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v6", "title": "alpha vid6", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-07"}, {"id": "v7", "title": "vid7", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-08", "memo": "m"}, {"id": "v8", "title": "beta vid8", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-09"}, {"id": "v9", "title": "alpha vid9", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-10", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v10", "title": "vid10", "channel": "C1", "pl": "P2", "tb": [], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-11"}, {"id": "v11", "title": "vid11", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-12"}, {"id": "v12", "title": "alpha beta vid12", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-13", "memo": "m"}, {"id": "v13", "title": "vid13", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-14", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v14", "title": "vid14", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-15"}, {"id": "v15", "title": "alpha vid15", "channel": "C2", "pl": "P1", "tb": [], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-16"}, {"id": "v16", "title": "beta vid16", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-17"}, {"id": "v17", "title": "vid17", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-18", "bookmarks": [{"time": 1, "label": "b"}], "memo": "m"}, {"id": "v18", "title": "alpha vid18", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-19"}, {"id": "v19", "title": "vid19", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-20"}, {"id": "v20", "title": "beta vid20", "channel": "C1", "pl": "P3", "tb": [], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-21"}, {"id": "v21", "title": "alpha vid21", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-22", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v22", "title": "vid22", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-23", "memo": "m"}, {"id": "v23", "title": "vid23", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-24"}, {"id": "v24", "title": "alpha beta vid24", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-25", "archived": true}];
const SEED = { 'users/u1/data/settings': { customViews: VIEWS, updatedAt:'2026-09-01' },
  
  'users/u1/videos.json': { videos:[{"id": "v1", "title": "vid1", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-02", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v2", "title": "vid2", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-03", "memo": "m"}, {"id": "v3", "title": "alpha vid3", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-04"}, {"id": "v4", "title": "beta vid4", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-05"}, {"id": "v5", "title": "vid5", "channel": "C2", "pl": "P3", "tb": [], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-06", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v6", "title": "alpha vid6", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-07"}, {"id": "v7", "title": "vid7", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-08", "memo": "m"}, {"id": "v8", "title": "beta vid8", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-09"}, {"id": "v9", "title": "alpha vid9", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-10", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v10", "title": "vid10", "channel": "C1", "pl": "P2", "tb": [], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-11"}, {"id": "v11", "title": "vid11", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-12"}, {"id": "v12", "title": "alpha beta vid12", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-13", "memo": "m"}, {"id": "v13", "title": "vid13", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-14", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v14", "title": "vid14", "channel": "C1", "pl": "P3", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-15"}, {"id": "v15", "title": "alpha vid15", "channel": "C2", "pl": "P1", "tb": [], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-16"}, {"id": "v16", "title": "beta vid16", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-17"}, {"id": "v17", "title": "vid17", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-18", "bookmarks": [{"time": 1, "label": "b"}], "memo": "m"}, {"id": "v18", "title": "alpha vid18", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-19"}, {"id": "v19", "title": "vid19", "channel": "C2", "pl": "P2", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-20"}, {"id": "v20", "title": "beta vid20", "channel": "C1", "pl": "P3", "tb": [], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-21"}, {"id": "v21", "title": "alpha vid21", "channel": "C2", "pl": "P1", "tb": ["ボトム"], "tags": [], "pt": "youtube", "watched": false, "addedAt": "2026-01-22", "bookmarks": [{"time": 1, "label": "b"}]}, {"id": "v22", "title": "vid22", "channel": "C1", "pl": "P2", "tb": ["トップ"], "tags": ["T1"], "pt": "youtube", "watched": true, "addedAt": "2026-01-23", "memo": "m"}, {"id": "v23", "title": "vid23", "channel": "C2", "pl": "P3", "tb": ["ボトム"], "tags": ["T2"], "pt": "youtube", "watched": false, "addedAt": "2026-01-24"}, {"id": "v24", "title": "alpha beta vid24", "channel": "C1", "pl": "P1", "tb": ["トップ"], "tags": [], "pt": "youtube", "watched": true, "addedAt": "2026-01-25", "archived": true}], updatedAt:'x' } };
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


const cx = await newCtx(); await cx.addInitScript(v => { if (!localStorage.getItem('wk_cv_views')) localStorage.setItem('wk_cv_views', v); }, JSON.stringify(VIEWS));
const A = await open(cx);
const J = JSON.stringify;
const ev = (f, a) => A.evaluate(f, a);
const regCloud = () => CLOUD['users/u1/data/tagRegistry']?.reg;
const strip = vs => vs.map(v => { const c = { ...v }; delete c.tg; return c; });
const vids0 = J(strip(await ev(() => window.videos)));

console.log('① 使っていなければ今までと同じ形');
ck('最大は10', await ev(() => window.tagRegistry.MAX_SLOTS === 10));
ck('枠は4つ・保存の形も4個', await ev(() => window.tagRegistry.slots().length === 4 && window.tagRegistry.raw().slots.length === 4));
await ev(() => window._libView('org')); await A.waitForTimeout(1200);
const order0 = await ev(() => JSON.stringify(window.orgColOrder));
ck('表の列の並びに tag5〜tag10 を足していない', !/tag(5|6|7|8|9|10)/.test(order0), order0);

console.log('② 設定の画面: 最後に「タグ5 未設定」の行が1つ・そこから足せる');
await ev(() => { window.switchTab('settings'); window.renderSettings?.(); }); await A.waitForTimeout(800);
const Q = '#tag-display-settings ';
let rows = await ev(q => [...document.querySelectorAll(q + '.ts-slot, ' + q + '.ts-slotnew')].map(r => ({ k: r.dataset.k, cls: r.className, num: r.querySelector('.ts-num')?.textContent, grip: !!r.querySelector('[data-grip]') })), Q);
ck('行は タグ1〜4 ＋ 足すための タグ5（つかむ所なし）', rows.length === 5 && rows[4].cls === 'ts-slotnew' && rows[4].num === 'タグ5' && !rows[4].grip && rows.slice(0, 4).every(r => r.grip), J(rows));
await ev(q => document.querySelector(q + '.ts-slotnew .ts-row').click(), Q); await A.waitForTimeout(300);
await ev(q => document.querySelector(q + '.ts-slotnew [data-act="newgroup"]').click(), Q); await A.waitForTimeout(600);
let reg = await ev(() => window.tagRegistry.raw());
const g5 = reg.slots[4];
ck('新しく作るとタグ5に入る（保存の形は5個）', reg.slots.length === 5 && !!g5 && reg.groups.find(g => g.id === g5)?.store === 'map', J(reg.slots));
await ev(id => { window.tagRegistry.setName(id, 'G5'); window.tagRegistry.addOption(id, 'x5'); }, g5); await A.waitForTimeout(800);
ck('クラウドにも5個で入る', regCloud()?.slots?.length === 5 && regCloud().slots[4] === g5, J(regCloud()?.slots));
ck('今の4つの枠は変わらない', J(regCloud().slots.slice(0, 4)) === J(reg.slots.slice(0, 4)));
await ev(() => window.renderTagShelf?.()); await A.waitForTimeout(300);
rows = await ev(q => [...document.querySelectorAll(q + '.ts-slot, ' + q + '.ts-slotnew')].map(r => ({ cls: r.className, num: r.querySelector('.ts-num')?.textContent })), Q);
ck('次は タグ6 の行が足すために出る', rows.length === 6 && rows[5].cls === 'ts-slotnew' && rows[5].num === 'タグ6' && rows[4].cls === 'ts-slot', J(rows));

console.log('③ タグ5 が画面に付いてくる');
await ev(id => { const vs = window.videos; window.wkSetTagValue(vs.find(v => v.id === 'v1'), id, 'x5', true); window.wkSetTagValue(vs.find(v => v.id === 'v3'), id, 'x5', true); }, g5);
await ev(() => { window.switchTab('library'); window.clearAll?.(); window._libView('org'); }); await A.waitForTimeout(1500);
const th = await ev(() => { const t = document.querySelector('#orgTheadRow th[data-col="tag5"]'); return t ? t.textContent : null; });
ck('表にタグ5の列（見出しはグループ名）', th != null && th.includes('G5'), String(th));
const cell = await ev(() => document.querySelector('#org-row-v1 td[data-col="tag5"]')?.textContent.trim());
ck('表のセルに付けたタグ', cell === 'x5', String(cell));
const order1 = await ev(() => window.orgColOrder);
ck('列の並び: tag5 だけを、手前のタグの列のすぐ後ろに足した（ほかは今までどおり）', J(order1.filter(c => c !== 'tag5')) === order0 && order1.indexOf('tag5') === order1.indexOf('technique') + 1 && !order1.includes('tag6'), J(order1));
await ev(() => window.uniOpen('tag', 'org')); await A.waitForTimeout(500);
const cols = await ev(() => [...document.querySelectorAll('#uni-popup .uni-col .uni-col-hdr span:first-child')].map(s => s.textContent));
ck('フィルターの窓に5つ目の列', cols.includes('G5'), J(cols));
await ev(id => { const r = [...document.querySelectorAll('#uni-popup .uni-row')].find(r => r.dataset.k === id && r.dataset.n === 'x5'); r && r.click(); }, g5); await A.waitForTimeout(500);
await ev(() => window.uniClose()); await A.waitForTimeout(1000);
const shown = await ev(() => [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(r => r.id.replace('org-row-', '')).sort());
ck('タグ5で絞り込める', J(shown) === J(['v1', 'v3']), J(shown));
await ev(() => window._libView('card')); await A.waitForTimeout(1200);
const card = await ev(() => ({ ids: [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(c => c.id.replace('card-', '')).sort(), txt: document.getElementById('card-v1')?.textContent || '' }));
ck('カードでも同じ動画・カードにタグ5のタグが出る', J(card.ids) === J(['v1', 'v3']) && card.txt.includes('x5'), J(card.ids));
await ev(() => window.clearAll?.()); await A.waitForTimeout(600);

console.log('④ 10 まで・それより多くは入らない・外すと詰まる');
const ids = await ev(() => { const out = []; for (let k = 5; k < 10; k++) out.push(window.tagRegistry.createGroup('G' + (k + 1), k)); return out; });
reg = await ev(() => window.tagRegistry.raw());
ck('タグ10 まで入る（保存の形は10個）', reg.slots.length === 10 && reg.slots.every(Boolean) && J(reg.slots.slice(5)) === J(ids), J(reg.slots));
const over = await ev(() => { const id = window.tagRegistry.createGroup('G11', 10); const r = window.tagRegistry.raw(); return { len: r.slots.length, slot: window.tagRegistry.group(id).slot, set: window.tagRegistry.setSlot(id, 10) }; });
ck('11個目の枠は無い（作ったグループは未使用に入る）', over.len === 10 && over.slot === -1, J(over));
await ev(() => { window.switchTab('settings'); window.renderSettings?.(); }); await A.waitForTimeout(700);
rows = await ev(q => [...document.querySelectorAll(q + '.ts-slot, ' + q + '.ts-slotnew')].map(r => r.className), Q);
ck('設定の画面は10行・足すための行は出ない', rows.length === 10 && rows.every(c => c === 'ts-slot'), J(rows));
ck('ドラッグで並べ替え（moveSlot）: タグ10 をタグ5へ', await ev(() => { const b = window.tagRegistry.raw().slots; window.tagRegistry.moveSlot(9, 4); const a = window.tagRegistry.raw().slots; return a.length === 10 && a[4] === b[9] && a[5] === b[4] && JSON.stringify(a.slice(0, 4)) === JSON.stringify(b.slice(0, 4)); }));
await ev(() => { window.switchTab('library'); window._libView('org'); }); await A.waitForTimeout(1500);
const ths = await ev(() => [...document.querySelectorAll('#orgTheadRow th[data-col]')].map(t => t.dataset.col).filter(c => /^tag\d+$/.test(c)));
ck('表にタグ5〜10の列が全部出る', J(ths.slice().sort()) === J(['tag10', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9']), J(ths));
const before = await ev(() => JSON.stringify(window.videos.find(v => v.id === 'v1').tg));
await ev(() => { const r = window.tagRegistry.raw().slots; for (let k = 9; k >= 4; k--) window.tagRegistry.setSlot(r[k], -1); }); await A.waitForTimeout(1200);
reg = await ev(() => window.tagRegistry.raw());
ck('5つ目以降を全部外すと、保存の形は4個に戻る（クラウドも）', reg.slots.length === 4 && regCloud()?.slots?.length === 4, J(regCloud()?.slots));
ck('外しても動画のタグは残る・グループも残る（未使用）', await ev(([b, id]) => JSON.stringify(window.videos.find(v => v.id === 'v1').tg) === b && window.tagRegistry.group(id).slot === -1, [before, g5]));
await ev(() => window.renderOrg()); await A.waitForTimeout(600);
ck('空いた枠の列は表に出ない', await ev(() => !document.querySelector('#orgTheadRow th[data-col="tag5"]')));
await ev(id => window.tagRegistry.setSlot(id, 4), g5); await A.waitForTimeout(1200);

console.log('⑤ もう1台・開き直し');
const cx2 = await newCtx(); const B = await open(cx2);
const bb = await B.evaluate(id => ({ slots: window.tagRegistry.raw().slots, name: window.tagRegistry.group(id)?.name, slot: window.tagRegistry.group(id)?.slot, v1: window.tagRegistry.valuesOf(window.videos.find(v => v.id === 'v1'), id) }), g5);
ck('もう1台でもタグ5に入っている', bb.slots.length === 5 && bb.slot === 4 && bb.name === 'G5', J(bb));
ck('前の版のアプリは5個以上の形を受け取らない（＝上書きもしない）', (r => !(Array.isArray(r.slots) && r.slots.length === 4))(regCloud()));
await reload(A);
ck('開き直してもタグ5のまま', await ev(id => window.tagRegistry.group(id)?.slot === 4, g5));

if (process.env.SHOT) { await ev(() => { window.switchTab('settings'); window.renderSettings?.(); document.getElementById('ob-start')?.remove(); }); await A.waitForTimeout(700); await A.locator('#tag-display-settings').screenshot({ path: process.env.SHOT }); }
console.log('⑥ データ');
ck('動画のタグ以外の欄を1文字も変えない', J(strip(await ev(() => window.videos))) === vids0);
ck('今の4つの名前と選択肢（tagSettings）に5つ目以降を書かない', await ev(() => window.tagSettings.length === 4));
console.log(fail ? `✗ ${fail} 件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
