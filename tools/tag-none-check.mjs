// ═══ 各タグの「タグなし」で絞り込めること（v53.050）═══
// 使い方: node tools/tag-none-check.mjs
// オーナー「各タグに『タグなし』も選択できるようにして」。
// フィルターの窓のタグの列の先頭に「タグなし」（＝そのタググループに何も付いていない動画）。
// 値は整理の表の ▾ が前から使っている「(空白)」と同じ1つ（tagFilter.NONE）。画面では「タグなし」。
// 判定は tag-filter.js の _hit の1か所（カード・テーブル・リストの条件が同じ結果）。
// 動画・選択肢には書かない。リストの条件は「上書き保存」を押したときだけ書く。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8297;
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
// タグ2 は3本に1本だけ付ける（「タグなし」を2つのグループで重ねて確かめるため）
for (const arr of [VIDEOS, SEED['users/u1/videos.json'].videos]) arr.forEach((v, i) => { if (i % 3 === 0) v.cat = ['パスガード']; });
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
const NONE = await A.evaluate(() => window.tagFilter.NONE);
const live0 = VIDEOS.filter(v => !v.archived);
const noTb = live0.filter(v => !(v.tb || []).length).map(v => v.id).sort();
const noTags = live0.filter(v => !(v.cat || []).length).map(v => v.id).sort();
const J = JSON.stringify;
const rows = k => A.evaluate(k => [...document.querySelectorAll('#uni-popup .uni-row')].filter(r => r.dataset.k === k)
  .map(r => ({ n: r.dataset.n, t: r.querySelector('span')?.textContent, c: +r.querySelector('.uni-cnt')?.textContent, on: r.classList.contains('on') })), k);
const clickRow = (k, n) => A.evaluate(([k, n]) => { const r = [...document.querySelectorAll('#uni-popup .uni-row')].find(r => r.dataset.k === k && r.dataset.n === n); if (!r) return false; r.click(); return true; }, [k, n]);
const shownIds = async () => (await A.evaluate(() => { const m = window._libViewMode;
  return m === 'org' ? [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(r => r.id.replace('org-row-','')) : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(c => c.id.replace('card-','')); })).sort();
const same = (a, b) => J([...a].sort()) === J([...b].sort());
// 選択肢を用意する（検査の準備。ここから先で選択肢が変わらないことを見る）
await A.evaluate(() => { window.tagOptAdd('tb', 'トップ'); window.tagOptAdd('tb', 'ボトム'); window.tagOptAdd('cat', 'パスガード'); }); await A.waitForTimeout(500);
const vids0 = J(await A.evaluate(() => window.videos));
const opts0 = J(await A.evaluate(() => [window.tagSettings, localStorage.getItem('wk_tagRegistry')]));
const views0 = J(await views(A));

console.log('① マスター・カード: タグの列の先頭に「タグなし」');
await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(600);
let tb = await rows('tbNew'), tg = await rows('cat');
ck('タグ1の列の先頭が「タグなし」・本数は何も付いていない動画の数（' + noTb.length + '）', tb[0]?.n === NONE && tb[0]?.t === 'タグなし' && tb[0]?.c === noTb.length, J(tb));
ck('タグ2の列の先頭も「タグなし」（' + noTags.length + '）', tg[0]?.n === NONE && tg[0]?.t === 'タグなし' && tg[0]?.c === noTags.length, J(tg));
ck('件数順にしても先頭のまま', await A.evaluate(N => { window.uniSetSort('tb', 'cnt'); const r = [...document.querySelectorAll('#uni-popup .uni-row')].filter(r => r.dataset.k === 'tbNew'); window.uniSetSort('tb', 'abc'); return r[0]?.dataset.n === N; }, NONE));
ck('「タグなし」を押せる', await clickRow('tbNew', NONE)); await A.waitForTimeout(600);
tb = await rows('tbNew'); tg = await rows('cat');
ck('選ばれた印が付く・ほかのタグは列に残る', tb[0].on && tb.some(r => r.n === 'トップ') && tb.some(r => r.n === 'ボトム'), J(tb));
const both = noTb.filter(id => noTags.includes(id));
ck('ほかの列の本数は「タグなし」で絞った後の数（タグ2のタグなし ' + both.length + '）', tg[0].n === NONE && tg[0].c === both.length, J(tg));
const pills = await A.evaluate(() => [...document.querySelectorAll('#uni-pills .uni-pill')].map(p => ({ t: p.textContent, n: p.dataset.n })));
ck('選択中に「グループ名: タグなし」と出る（値そのものは出さない）', pills.length === 1 && pills[0].n === NONE && /: タグなし$/.test(pills[0].t) && !pills[0].t.includes('空白'), J(pills));
ck('件数が ' + noTb.length + ' 件', (await A.evaluate(() => document.getElementById('uni-hit')?.textContent || '')).startsWith(noTb.length + ' '));
await A.evaluate(() => window.uniClose()); await A.waitForTimeout(1200);
let got = await shownIds();
ck('カードに出るのはタグ1が無い動画だけ', same(got, noTb), `画面 ${got} ／ 期待 ${noTb}`);

console.log('② テーブルでも同じ動画');
await A.evaluate(() => window._libView('org')); await A.waitForTimeout(1500);
got = await shownIds();
ck('テーブルに出るのも同じ', same(got, noTb), `画面 ${got} ／ 期待 ${noTb}`);
await A.evaluate(() => window._libView('card')); await A.waitForTimeout(1500);
ck('カードに戻しても同じ', same(await shownIds(), noTb));

console.log('③ タグと一緒に選ぶ・ほかのグループと重ねる・外す');
await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(500);
await clickRow('tbNew', 'トップ'); await A.waitForTimeout(500);
await A.evaluate(() => window.uniClose()); await A.waitForTimeout(1000);
const top = live0.filter(v => (v.tb || []).includes('トップ')).map(v => v.id);
ck('「タグなし」＋「トップ」＝どちらかに当たる動画', same(await shownIds(), noTb.concat(top)), J(await shownIds()));
await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(500);
await clickRow('tbNew', 'トップ'); await A.waitForTimeout(400);
await clickRow('cat', NONE); await A.waitForTimeout(500);
await A.evaluate(() => window.uniClose()); await A.waitForTimeout(1000);
ck('タグ1のタグなし × タグ2のタグなし＝両方とも無い動画', same(await shownIds(), both), J(await shownIds()));
await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(500);
await clickRow('tbNew', NONE); await A.waitForTimeout(400); await clickRow('cat', NONE); await A.waitForTimeout(500);
await A.evaluate(() => window.uniClose()); await A.waitForTimeout(1000);
ck('外すと全部に戻る', same(await shownIds(), live0.map(v => v.id)), J(await shownIds()));

console.log('④ 条件で作ったリスト: 上書き保存すると条件に入り、開き直しても同じ');
await A.evaluate(() => window._cvPickerSelect('DT')); await A.waitForTimeout(1800);
await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(500);
await clickRow('tbNew', NONE); await A.waitForTimeout(600);
await A.evaluate(() => window.uniClose()); await A.waitForTimeout(1000);
const wantDT = live0.filter(v => v.channel === 'C1' && !(v.tb || []).length).map(v => v.id);
ck('リスト（チャンネル C1）×「タグなし」', same(await shownIds(), wantDT), `画面 ${await shownIds()} ／ 期待 ${wantDT}`);
ck('押しただけではリストの条件を書かない', J(get(await views(A), 'DT').fc) === J({ ch: ['C1'] }), J(get(await views(A), 'DT').fc));
await A.evaluate(() => window._cvDynSave()); await A.waitForTimeout(1500);
ck('上書き保存で条件に「タグなし」が入る', J(get(await views(A), 'DT').fc?.tb) === J([NONE]), J(get(await views(A), 'DT').fc));
await reload(A);
await A.evaluate(() => window._cvPickerSelect('DT')); await A.waitForTimeout(1800);
ck('開き直しても同じ動画', same(await shownIds(), wantDT), J(await shownIds()));
const dead = await A.evaluate(() => window._cvDeadConditionValues('DT'));
ck('「タグなし」を「どの動画にも無い値」（⚠）と数えない', Array.isArray(dead) && dead.length === 0, J(dead));
await A.evaluate(() => { const v = window._cvViews.find(x => x.id === 'DT'); v.__t = v.filterConditions.tb; v.filterConditions.tb = [window.tagFilter.NONE, '無いタグ']; });
const dead2 = await A.evaluate(() => { const r = window._cvDeadConditionValues('DT'); const v = window._cvViews.find(x => x.id === 'DT'); v.filterConditions.tb = v.__t; delete v.__t; return r; });
ck('本当に無いタグには今までどおり ⚠', dead2.length === 1 && dead2[0].value === '無いタグ', J(dead2));
if (process.env.SHOT) { await A.evaluate(() => window._cvPickerSelect('master')); await A.waitForTimeout(1200); await A.evaluate(() => window.uniOpen('tag', 'lib')); await A.waitForTimeout(500); await clickRow('tbNew', NONE); await A.waitForTimeout(600); await A.screenshot({ path: process.env.SHOT }); await clickRow('tbNew', NONE); await A.evaluate(() => window.uniClose()); await A.waitForTimeout(600); }

console.log('⑤ データ');
ck('動画のデータを1文字も変えない', J(await A.evaluate(() => window.videos)) === vids0);
ck('選択肢（タグの設定・一覧）を1文字も変えない', J(await A.evaluate(() => [window.tagSettings, localStorage.getItem('wk_tagRegistry')])) === opts0);
ck('ほかのリストの条件を変えない', J((await views(A)).filter(v => v.id !== 'DT')) === J(JSON.parse(views0).filter(v => v.id !== 'DT')));
console.log(fail ? `✗ ${fail} 件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
