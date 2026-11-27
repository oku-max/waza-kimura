// ═══ フィルターの窓の「除外」（v53.063）═══
// 使い方: node tools/filter-exclude-check.mjs
// オーナー「全選択の状態から1つ2つ選択したものだけを除外する、ということもクリックできるように」
// ・決定 mock-filter-exclude.html の B「押すたびに 選ぶ → 除外 → なし」。
// 除外は同じ選択の入れ物に「(除外)名前」という値で入れる（tagFilter.EX）。判定は tag-filter.js の setHit の1か所で、
// タグ・チャンネル・プレイリスト・Source、カード・テーブル・リストの条件・前回の絞り込みが同じ結果になる。
// 動画・選択肢には書かない。リストの条件は「上書き保存」を押したときだけ書く。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8299;
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
// タグが2つ付いた動画を1本混ぜる（片方でも除外に当たれば消えることを見る）
for (const arr of [VIDEOS, SEED['users/u1/videos.json'].videos]) arr.find(v => v.id === 'v2').tb = ['トップ', 'ボトム'];
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
const J = JSON.stringify, ev = (f, a) => A.evaluate(f, a);
const LV = VIDEOS.filter(v => !v.archived);
const ids = f => LV.filter(f).map(v => v.id).sort();
const same = (a, b) => J([...a].sort()) === J([...b].sort());
await ev(() => { window.tagOptAdd('tb', 'トップ'); window.tagOptAdd('tb', 'ボトム'); window.tagOptAdd('cat', 'パスガード'); document.getElementById('ob-start')?.remove(); }); await A.waitForTimeout(500);
const vids0 = J(await ev(() => window.videos)), opts0 = J(await ev(() => [window.tagSettings, localStorage.getItem('wk_tagRegistry')])), views0 = J(await views(A));
const row = (k, n) => ev(([k, n]) => { const r = [...document.querySelectorAll('#uni-popup .uni-row')].find(r => (r.dataset.k === k && r.dataset.n === n) || (k === 'platform' && (r.getAttribute('onclick') || '').includes("'" + n + "'")));
  return r ? { on: r.classList.contains('on'), ex: r.classList.contains('ex'), badge: !!r.querySelector('.uni-exb'), strike: getComputedStyle(r.querySelector('.uni-nm')).textDecorationLine } : null; }, [k, n]);
const click = (k, n) => ev(([k, n]) => { const r = [...document.querySelectorAll('#uni-popup .uni-row')].find(r => (r.dataset.k === k && r.dataset.n === n) || (k === 'platform' && (r.getAttribute('onclick') || '').includes("'" + n + "'"))); if (!r) return false; r.click(); return true; }, [k, n]).then(async r => { await A.waitForTimeout(450); return r; });
const pills = () => ev(() => [...document.querySelectorAll('#uni-pills .uni-pill')].map(p => ({ t: p.textContent, ex: p.classList.contains('ex') })));
const hit = () => ev(() => parseInt(document.getElementById('uni-hit')?.textContent || '-1', 10));
const shown = async () => (await ev(() => { const m = window._libViewMode;
  return m === 'org' ? [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(r => r.id.replace('org-row-','')) : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(c => c.id.replace('card-','')); })).sort();
const openW = async tab => { await ev(t => window.uniOpen(t, 'lib'), tab); await A.waitForTimeout(500); };
const closeW = async () => { await ev(() => window.uniClose()); await A.waitForTimeout(1100); };

console.log('① チャンネル: 押すたびに 選ぶ → 除外 → なし');
await openW('src');
await click('channel', 'C1');
let r = await row('channel', 'C1');
ck('1回目: 選ぶ（今までどおり）', r.on && !r.ex && await hit() === ids(v => v.channel === 'C1').length, J(r));
await click('channel', 'C1');
r = await row('channel', 'C1');
ck('2回目: 除外（赤・取り消し線・「除外」の印）', r.ex && !r.on && r.badge && /line-through/.test(r.strike), J(r));
let ps = await pills();
ck('選択中に赤で「− C1」', ps.length === 1 && ps[0].t === '− C1' && ps[0].ex, J(ps));
ck('件数は C1 以外の本数', await hit() === ids(v => v.channel !== 'C1').length, String(await hit()));
ck('入れ物には「(除外)C1」という値で入る', await ev(() => JSON.stringify([...window.filters.channel])) === J(['(除外)C1']));
await closeW();
ck('カードに出るのは C1 以外', same(await shown(), ids(v => v.channel !== 'C1')), J(await shown()));
await ev(() => window._libView('org')); await A.waitForTimeout(1500);
ck('テーブルでも同じ動画', same(await shown(), ids(v => v.channel !== 'C1')), J(await shown()));
await ev(() => window._libView('card')); await A.waitForTimeout(1500);
ck('カードに戻しても同じ', same(await shown(), ids(v => v.channel !== 'C1')));
await openW('src');
await click('channel', 'C1');
r = await row('channel', 'C1');
ck('3回目: なし（全部に戻る）', !r.on && !r.ex && (await pills()).length === 0 && await hit() === LV.length, J(r));

console.log('② プレイリスト・Source も同じ／列をまたいで重ねる');
await click('playlist', 'P2'); await click('playlist', 'P2');
await click('channel', 'C2');
ck('C2 を選び P2 を除外 ＝ C2 のうち P2 以外', await hit() === ids(v => v.channel === 'C2' && v.pl !== 'P2').length, String(await hit()));
await click('channel', 'C2'); await click('channel', 'C2'); await click('playlist', 'P2');
ck('外すと全部', await hit() === LV.length && (await pills()).length === 0);
await click('platform', 'youtube'); await click('platform', 'youtube');
ps = await pills();
ck('Source の除外: 0本・選択中は「− YouTube」', await hit() === 0 && ps[0]?.t === '− YouTube' && ps[0].ex, J(ps) + await hit());
await click('platform', 'youtube');

console.log('③ タグ: 2つ付いた動画・同じ列で選ぶと除外を一緒に・タグなしの除外');
await ev(() => window.uniSetTab('tag')); await A.waitForTimeout(400);
await click('tbNew', 'ボトム'); await click('tbNew', 'ボトム');
ck('ボトムを除外 ＝ ボトムが付いていない動画（タグなしも出る・トップとボトムの両方は消える）', await hit() === ids(v => !(v.tb || []).includes('ボトム')).length && !ids(v => !(v.tb || []).includes('ボトム')).includes('v2'), String(await hit()));
await click('tbNew', 'トップ');
ck('同じ列でトップを選ぶ ＝ トップがあり、ボトムが無い動画', await hit() === ids(v => (v.tb || []).includes('トップ') && !(v.tb || []).includes('ボトム')).length, String(await hit()));
r = await row('tbNew', 'ボトム'); const r2 = await row('tbNew', 'トップ');
if (process.env.SHOT) await A.screenshot({ path: process.env.SHOT });
ck('ボトムは除外・トップは選んだ印', r.ex && r2.on && !r2.ex, J([r, r2]));
await closeW();
ck('画面も同じ', same(await shown(), ids(v => (v.tb || []).includes('トップ') && !(v.tb || []).includes('ボトム'))), J(await shown()));
await openW('tag');
await click('tbNew', 'トップ'); await click('tbNew', 'トップ'); await click('tbNew', 'ボトム');
const NONE = await ev(() => window.tagFilter.NONE);
await click('tbNew', NONE); await click('tbNew', NONE);
ps = await pills();
ck('タグなしを除外 ＝ タグ1が付いている動画だけ・選択中は「− グループ名: タグなし」', await hit() === ids(v => (v.tb || []).length > 0).length && /^− .+: タグなし$/.test(ps[0]?.t || '') && ps[0].ex, J(ps) + await hit());

console.log('④ 選択中の × は外すだけ（除外 → 選ぶ に回らない）');
await ev(() => document.querySelector('#uni-pills .uni-pill').click()); await A.waitForTimeout(450);
ck('× で外れて全部に戻る', (await pills()).length === 0 && await hit() === LV.length && await ev(() => window.filters.tbNew.size === 0));
await closeW();

console.log('⑤ 条件で作ったリスト: 上書き保存で条件に入り、開き直しても同じ');
await ev(() => window._cvPickerSelect('DT')); await A.waitForTimeout(1800);
await openW('src');
await click('playlist', 'P2'); await click('playlist', 'P2');
await closeW();
const wantDT = ids(v => v.channel === 'C1' && v.pl !== 'P2');
ck('リスト（チャンネル C1）で P2 を除外', same(await shown(), wantDT), `画面 ${await shown()} ／ 期待 ${wantDT}`);
ck('押しただけではリストの条件を書かない', J(get(await views(A), 'DT').fc) === J({ ch: ['C1'] }), J(get(await views(A), 'DT').fc));
await ev(() => window._cvDynSave()); await A.waitForTimeout(1500);
ck('上書き保存で条件に除外が入る', J(get(await views(A), 'DT').fc?.pl) === J(['(除外)P2']) && J(get(await views(A), 'DT').fc?.ch) === J(['C1']), J(get(await views(A), 'DT').fc));
await reload(A);
await ev(() => { document.getElementById('ob-start')?.remove(); window._cvPickerSelect('DT'); }); await A.waitForTimeout(1800);
ck('開き直しても同じ動画', same(await shown(), wantDT), J(await shown()));
await openW('src');
r = await row('playlist', 'P2');
ck('窓を開くと P2 は除外の印のまま', r && r.ex, J(r));
await closeW();
await ev(() => { window._cvPickerSelect('master'); return null; }); await A.waitForTimeout(1200);

console.log('⑥ データ');
ck('動画のデータを1文字も変えない', J(await ev(() => window.videos)) === vids0);
ck('選択肢（タグの設定・一覧）を1文字も変えない', J(await ev(() => [window.tagSettings, localStorage.getItem('wk_tagRegistry')])) === opts0);
ck('ほかのリストの条件を変えない', J((await views(A)).filter(v => v.id !== 'DT')) === J(JSON.parse(views0).filter(v => v.id !== 'DT')));
console.log(fail ? `✗ ${fail} 件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
