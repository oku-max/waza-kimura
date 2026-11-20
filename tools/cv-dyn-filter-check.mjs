// ═══ 条件で作ったリスト＝保存した絞り込み（v53.020）═══
// 使い方: node tools/cv-dyn-filter-check.mjs
// オーナー「カスタムのプレイリストは、ある特定のフィルターの状態を保存してるだけ」「いつでもリセットして全表示に戻せるべき」
// 決定 1: 変えた内容がリストになるのは「上書き保存」を押したときだけ。
// 本物の index.html と firebase.js を偽のクラウドにつないで踏む:
//  開くと保存した条件がふつうのフィルターとして掛かる（範囲は全部の動画）／窓にほかのチャンネル・プレイリストも出て足せる／
//  リセットで全部／触っただけ・リセットしただけ・離れただけではリストの条件・クラウドを書かない／カード⇔テーブルで変更が消えない／
//  離れて戻ると保存した状態／元に戻す／上書き保存で条件が変わり・クラウドに届き・一覧の本数と画面が一致／取り消しで前の条件／
//  条件なしで上書きするときは確かめる（やめれば書かない）／語で作ったリストの語／再読み込みで保存した状態／
//  前回の絞り込み（cvFilters）を条件で作ったリストの分として書かない／マスターへ条件が漏れない／手で選んだリストは今までどおり
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8272;
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
let dialogAnswer = true; const dialogs = [];
A.removeAllListeners('dialog'); A.on('dialog', d => { dialogs.push(d.message()); dialogAnswer ? d.accept() : d.dismiss(); });
const W = ms => A.waitForTimeout(ms);
const liveV = () => VIDEOS.filter(v => !v.archived);
const ids = arr => arr.map(v => v.id).sort();
const shown = () => A.evaluate(() => { const m = window._libViewMode;
  return (m === 'org' ? [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(r => r.id.replace('org-row-',''))
    : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(c => c.id.replace('card-',''))).sort(); });
const st = () => A.evaluate(() => ({ ...window._cvDynState(), ch: [...(window.filters.channel||[])].sort(), pl: [...(window.filters.playlist||[])].sort(),
  q: window.wkSearchWord(), bar: getComputedStyle(document.getElementById('cv-dyn-bar')).display !== 'none' }));
const viewOf = id => A.evaluate(id => { const v = (window._cvViews||[]).find(x => x.id === id); return v && { fc: v.filterConditions, q: v.searchQuery }; }, id);
const lsViewOf = id => A.evaluate(id => { const v = JSON.parse(localStorage.getItem('wk_cv_views')||'[]').find(x => x.id === id); return v && { fc: v.filterConditions, q: v.searchQuery }; }, id);
const cloudHas = (id, pred) => Object.entries(CLOUD).some(([k, d]) => { const s = JSON.stringify(d); return s.includes(`"id":"${id}"`) && pred(s); });
const cloudSnap = () => JSON.stringify(Object.fromEntries(Object.entries(CLOUD).filter(([k]) => !/cvFilters|videos\.json/.test(k))));
const colNames = hdr => A.evaluate(h => { const col = [...document.querySelectorAll('#uni-popup .uni-col')].find(c => (c.querySelector('.uni-col-hdr')?.textContent || '').includes(h));
  return col ? [...col.querySelectorAll('.uni-row')].map(r => ({ n: r.dataset.n, on: r.classList.contains('on') })) : null; }, hdr);
const clickRow = (k, n) => A.evaluate(([k, n]) => { const r = [...document.querySelectorAll('#uni-popup .uni-row')].find(r => r.dataset.k === k && r.dataset.n === n); if (!r) return false; r.click(); return true; }, [k, n]);
const pickN = async label => { await A.evaluate(() => window.cvOpenViewPicker()); await W(500);
  const t = await A.evaluate(name => [...document.querySelectorAll('.cv-picker-info')].map(e => e.textContent.replace(/\s+/g,' ')).find(t => t.includes(name)), label);
  await A.evaluate(() => window._closePicker?.()); return Number((t || '').match(/(\d+)本/)?.[1]); };
const cvfWrites = () => JSON.stringify(CLOUD['users/u1/data/cvFilters'] || {});
const C1 = ids(liveV().filter(v => v.channel === 'C1'));
const C12 = ids(liveV());

// ① 開くと保存した条件がふつうのフィルターとして掛かる
await A.evaluate(() => window._cvPickerSelect('DT')); await W(1500);
const cvf0 = cvfWrites(), cloud0 = cloudSnap();
let s = await st();
ck('① 条件・表を開くと、チャンネル C1 がフィルターとして選ばれている', JSON.stringify(s.ch) === '["C1"]', JSON.stringify(s));
ck('① 画面は条件どおり（C1 の動画）', JSON.stringify(await shown()) === JSON.stringify(C1), JSON.stringify(await shown()));
ck('① 開いただけでは「変更あり」を出さない', !s.dirty && !s.bar, JSON.stringify(s));
// ② 窓にほかのチャンネルも出て、足せる
await A.evaluate(() => window.uniOpen('src', 'lib')); await W(500);
const chs = await colNames('Channel');
ck('② 窓の Channel に C1 と C2 の両方が出る（C1 は選ばれている）', chs && chs.length === 2 && chs.find(r => r.n === 'C1')?.on && chs.some(r => r.n === 'C2'), JSON.stringify(chs));
await clickRow('channel', 'C2'); await W(600);
ck('② C2 を足せる・窓に「このリストに上書き保存」が出る', await A.evaluate(() => getComputedStyle(document.getElementById('uni-cv-over-btn')).display !== 'none'));
await A.evaluate(() => window.uniClose()); await W(1200);
s = await st();
ck('② 画面は C1＋C2・「変更あり」が出る', JSON.stringify(await shown()) === JSON.stringify(C12) && s.dirty && s.bar, JSON.stringify(s));
ck('② 触っただけではリストの条件を書かない', JSON.stringify(await viewOf('DT')) === JSON.stringify({ fc: { ch: ['C1'] } }) || JSON.stringify((await viewOf('DT')).fc) === '{"ch":["C1"]}', JSON.stringify(await viewOf('DT')));
// ③ カード⇔テーブルで変更が消えない
await A.evaluate(() => window._cvSetView('card')); await W(1500);
s = await st();
ck('③ カードに切り替えても変更中のまま（C1＋C2）', JSON.stringify(s.ch) === '["C1","C2"]' && s.dirty && JSON.stringify(await shown()) === JSON.stringify(C12), JSON.stringify(s) + ' ' + (await shown()));
await A.evaluate(() => window._cvSetView('table')); await W(1500);
ck('③ テーブルに戻しても変更中のまま', JSON.stringify((await st()).ch) === '["C1","C2"]' && JSON.stringify(await shown()) === JSON.stringify(C12));
// ④ リセットで全部
await A.evaluate(() => window.clearAll()); await W(1200);
s = await st();
ck('④ リセットすると全部の動画（アーカイブ以外）', JSON.stringify(await shown()) === JSON.stringify(C12) && s.ch.length === 0 && s.dirty, JSON.stringify(s));
ck('④ リセットしただけではリストの条件を書かない', JSON.stringify((await viewOf('DT')).fc) === '{"ch":["C1"]}');
// ⑤ 元に戻す
await A.evaluate(() => window._cvDynRevert()); await W(1200);
s = await st();
ck('⑤ 元に戻すと保存した条件（C1）', JSON.stringify(s.ch) === '["C1"]' && !s.dirty && JSON.stringify(await shown()) === JSON.stringify(C1), JSON.stringify(s));
// ⑥ 離れて戻ると保存した状態
await A.evaluate(() => { window.filters.channel.add('C2'); window.AF(); }); await W(800);
await A.evaluate(() => window._cvClearSelection()); await W(1200);
const mst = await st();
ck('⑥ マスターへ移るとリストの条件が漏れない（C1 が残らない）', !mst.ch.includes('C1') && !mst.dyn, JSON.stringify(mst));
await A.evaluate(() => window._cvPickerSelect('DT')); await W(1500);
s = await st();
ck('⑥ 戻ると保存した状態（C1・変更なし）', JSON.stringify(s.ch) === '["C1"]' && !s.dirty, JSON.stringify(s));
{ const a = JSON.parse(cloud0), b2 = JSON.parse(cloudSnap()); const diff = [];
  const walk = (x, y, path) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => walk(x[k], y[k], path + '.' + k)); } else diff.push(path + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); };
  walk(a, b2, '');
  // カード⇔テーブルの切替が表示形式（viewType）を保存するのは前からの動き。条件・語・動画は書いていないこと
  const bad = diff.filter(d => !/viewType|updatedAt|\.at:|savedAt|ts:/.test(d));
  ck('⑥ ここまでクラウドのリストの条件・語を書いていない（表示形式の切替だけ）', bad.length === 0, diff.join(' | ')); }
ck('⑥ 前回の絞り込み（cvFilters）にこのリストの分を書いていない', !JSON.stringify(JSON.parse(cvfWrites() || '{}').snaps?.DT || null).includes('C2'), cvfWrites());
// ⑦ 上書き保存
await A.evaluate(() => { window.filters.channel.add('C2'); window.filters.playlist.add('P1'); window.AF(); }); await W(1000);
await A.evaluate(() => document.querySelector('#cv-dyn-bar button:last-child').click()); await W(1500);
const v7 = await viewOf('DT');
ck('⑦ 上書き保存で条件が C1＋C2・P1 になる', JSON.stringify(v7.fc) === JSON.stringify({ ch: ['C1','C2'], pl: ['P1'] }), JSON.stringify(v7));
ck('⑦ この端末の控えにも入る', JSON.stringify((await lsViewOf('DT')).fc) === JSON.stringify({ ch: ['C1','C2'], pl: ['P1'] }));
await W(2500);
ck('⑦ クラウドに届く', cloudHas('DT', t => t.includes('"pl":["P1"]')), Object.keys(CLOUD).join(','));
s = await st();
ck('⑦ 保存したら「変更あり」が消える', !s.dirty && !s.bar, JSON.stringify(s));
const want7 = ids(liveV().filter(v => v.pl === 'P1'));
ck('⑦ 画面と一覧の本数が一致', JSON.stringify(await shown()) === JSON.stringify(want7) && (await pickN('条件・表')) === want7.length, (await shown()) + ' / ' + (await pickN('条件・表')));
// ⑧ 取り消し
const undone = await A.evaluate(() => { const b = document.querySelector('#toast .toast-undo-btn'); if (!b) return false; b.click(); return true; }); await W(1500);
ck('⑧ トーストの取り消しで前の条件（C1）に戻る', undone && JSON.stringify((await viewOf('DT')).fc) === '{"ch":["C1"]}' && JSON.stringify((await st()).ch) === '["C1"]', JSON.stringify(await viewOf('DT')));
// ⑨ 条件なしで上書き: 確かめる・やめれば書かない
await A.evaluate(() => window.clearAll()); await W(1000);
dialogAnswer = false; dialogs.length = 0;
await A.evaluate(() => window._cvDynSave()); await W(800);
ck('⑨ 条件なしの上書きは確かめる・やめれば書かない', dialogs.some(m => m.includes('条件なし')) && JSON.stringify((await viewOf('DT')).fc) === '{"ch":["C1"]}', dialogs.join('|'));
dialogAnswer = true;
await A.evaluate(() => window._cvDynSave()); await W(1200);
ck('⑨ 確かめて保存すれば条件なし（全部）', JSON.stringify((await viewOf('DT')).fc) === '{}' && (await pickN('条件・表')) === C12.length);
await A.evaluate(() => document.querySelector('#toast .toast-undo-btn')?.click()); await W(1200);
ck('⑨ 取り消しで C1 に戻る', JSON.stringify((await viewOf('DT')).fc) === '{"ch":["C1"]}');
// ⑩ カードの条件リスト（プレイリスト＋タグ）
await A.evaluate(() => window._cvPickerSelect('DC')); await W(1500);
const wantDC = ids(liveV().filter(v => ['P1','P2'].includes(v.pl) && (v.tags||[]).includes('T1')));
s = await st();
ck('⑩ 条件・カードは P1/P2 と T1 がフィルターとして掛かり、画面は条件どおり', JSON.stringify(s.pl) === '["P1","P2"]' && JSON.stringify(await shown()) === JSON.stringify(wantDC) && !s.dirty, JSON.stringify(s) + ' ' + (await shown()) + ' want ' + wantDC);
ck('⑩ 一覧の本数と一致', (await pickN('条件・カード')) === wantDC.length);
// ⑪ 語で作ったリスト
await A.evaluate(() => window._cvPickerSelect('DW')); await W(1500);
s = await st();
const wantDW = ids(liveV().filter(v => v.title.includes('beta')));
ck('⑪ 語で作ったリストは語「beta」が入って開く', s.q === 'beta' && JSON.stringify(await shown()) === JSON.stringify(wantDW) && !s.dirty, JSON.stringify(s));
await A.evaluate(() => { window.wkSetSearchWord(''); window.AF(); }); await W(1000);
s = await st();
ck('⑪ 語を消すと全部・変更あり・リストの語は残る', s.dirty && JSON.stringify(await shown()) === JSON.stringify(C12) && (await viewOf('DW')).q === 'beta', JSON.stringify(s));
// ⑫ 変更中のまま再読み込み → 保存した状態
await A.evaluate(() => window._cvPickerSelect('DT')); await W(1200);
await A.evaluate(() => { window.filters.channel.add('C2'); window.AF(); }); await W(1200);
await A.reload({ waitUntil: 'domcontentloaded' }); await W(5500);
s = await st();
ck('⑫ 再読み込みすると保存した状態（C1）で開く', s.id === 'DT' && JSON.stringify(s.ch) === '["C1"]' && !s.dirty && JSON.stringify(await shown()) === JSON.stringify(C1), JSON.stringify(s));
ck('⑫ 前回の絞り込み（cvFilters）にこのリストの分を書いていない', !(JSON.parse(cvfWrites() || '{}').snaps || {}).DT, cvfWrites());
// ⑬ 手で選んだリストは今までどおり（リストの中だけで絞る）
await A.evaluate(() => window._cvPickerSelect('ST')); await W(1500);
await A.evaluate(() => window.uniOpen('src', 'lib')); await W(500);
const stPl = await colNames('Playlist');
const stIds = ['v1','v2','v3','v4','v6','v9','v12','v15'];
const wantPl = [...new Set(VIDEOS.filter(v => stIds.includes(v.id)).map(v => v.pl))].sort();
ck('⑬ 手で選んだリストの窓は、そのリストの動画のプレイリストだけ', JSON.stringify(stPl.map(r => r.n).sort()) === JSON.stringify(wantPl), JSON.stringify(stPl));
await A.evaluate(() => window.uniClose()); await W(500);
ck('⑬ 手で選んだリストには「変更あり」を出さない', !(await st()).dyn && !(await st()).bar);
console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await A.context().close(); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
