// ═══ 絞り込みが正しく効くこと（マスター・リスト × カード・テーブル × 絞り込みの種類 × 操作）（v53.008〜009）═══
// 使い方: node tools/cv-filter-fuzz-check.mjs   （SEEDS=1,2,3 で回す回を変えられる。STEPS=50 で手数）
// オーナー「リストの内容がただしくない」「フィルタリングが正しく機能してるのかどうか調べろよ」（2026-11-19）。
// 本物の index.html と firebase.js を偽のクラウドにつなぎ、次の操作をランダムに踏む:
//   リスト（条件・表／条件・カード／手動・表／手動・カード）を開く・マスターへ戻る・カード／テーブルのボタン・
//   サイドパネルでチャンネル／プレイリスト／タグ1／タグ4・未視聴だけ・ブックマークあり・メモあり・
//   検索（alpha・-alpha・消す）・フィルターをリセット・列の見出しの ▾（プレイリスト）・再読み込み
// 検査の側で「掛けているつもりの絞り込み」を持ち（リストを離れて戻る・再読み込みは v52.959 の決まりどおり
// そのリスト・マスターの分に戻る）、毎手、①アプリに掛かっている絞り込み ②画面に並んでいる動画
// （カードの並び・テーブルの行）が、つもりの絞り込みとリストの条件から独立に計算したものと同じかを見る。
// 違ったら、その1手と手順を出す。
// この検査で見つけて直したもの（どれも修正前の版で赤くなることを確認済み）:
//   v53.008 テーブル表示のリストで、サイドパネルで外した絞り込みがテーブルに残る
//   v53.009 起動して最初にカード／テーブルのボタンを押すと、サイドパネルの絞り込みが消える
//   v53.009 列の ▾ で絞った後にサイドパネルを触ると、▾ の絞り込みが消える
//   v53.009 再読み込みのたびに、マスターで覚えた絞り込みが空で上書きされ全端末に送られる
//   v53.009 検索語を消しても消したことが記録されず、開き直すと消した語が戻る
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8263;
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

// ── 独立した期待値（アプリの関数を使わない）──
const VMAP = new Map(VIDEOS.map(v => [v.id, v]));
const base = ctx => {
  const all = VIDEOS.filter(v => !v.archived);
  if (ctx === 'master') return all;
  const vw = VIEWS.find(x => x.id === ctx);
  if (vw.saveMode === 'static') return all.filter(v => vw.videoIds.includes(v.id));
  const fc = vw.filterConditions || {};
  const wq = (vw.searchQuery || '').toLowerCase();   // 語で作ったリストは、その語もリストの定義（一覧の本数もこれで数える）
  return all.filter(v => (!fc.ch || fc.ch.includes(v.channel)) && (!fc.pl || fc.pl.includes(v.pl)) && (!fc.tech || (v.tags||[]).some(t => fc.tech.includes(t))) && (!wq || v.title.toLowerCase().includes(wq)));
};
const empty = () => ({ ch: [], pl: [], tb: [], tags: [], unw: false, bm: false, memo: false, q: '' });
const apply = (list, m) => list.filter(v => {
  if (m.ch.length && !m.ch.includes(v.channel)) return false;
  if (m.pl.length && !m.pl.includes(v.pl)) return false;
  if (m.tb.length && !(v.tb||[]).some(x => m.tb.includes(x))) return false;
  if (m.tags.length && !(v.tags||[]).some(x => m.tags.includes(x))) return false;
  if (m.unw && v.watched) return false;
  if (m.bm && !(v.bookmarks && v.bookmarks.length)) return false;
  if (m.memo && !v.memo) return false;
  for (const w of m.q.split(/\s+/).filter(Boolean)) {
    const t = v.title.toLowerCase();
    if (w.startsWith('-')) { if (t.includes(w.slice(1))) return false; } else if (!t.includes(w)) return false;
  }
  return true;
});
const tog = (arr, x) => arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x];

let fails = 0;
for (const SEEDN of String(process.env.SEEDS || '1,2,3').split(',').map(Number)) {
let rs = SEEDN; const rnd = n => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs % n; };
const hist = [];
const VIEWS0 = JSON.stringify(VIEWS);
Object.keys(CLOUD).forEach(k => delete CLOUD[k]); Object.assign(CLOUD, JSON.parse(JSON.stringify(SEED))); VIEWS.splice(0, VIEWS.length, ...JSON.parse(VIEWS0));
const A = await open(await newCtx());
let ctx = 'master', mode = 'card', model = empty(); const mem = {};
const shownDom = () => A.evaluate(() => {
  const m = window._libViewMode;
  const tw = document.querySelector('.org-table-wrap');
  const ids = m === 'org' ? (tw && tw.style.display === 'none' ? [] : [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(e => e.id.slice(8)))
                          : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(e => e.id.slice(5));
  return { m, ids: ids.sort(), cur: window._cvActiveViewId || 'master' };
});
const leave = () => { mem[ctx] = JSON.parse(JSON.stringify(model)); };
const enter = c => { ctx = c; model = mem[c] ? JSON.parse(JSON.stringify(mem[c])) : empty();
  if (!mem[c] && c !== 'master') { const vw = VIEWS.find(x => x.id === c); if (vw.saveMode === 'dynamic' && vw.searchQuery) model.q = vw.searchQuery; }
  if (c !== 'master') mode = (VIEWS.find(x => x.id === c).viewType === 'card') ? 'card' : 'table'; };
const sidebarSet = (key, val) => A.evaluate(([key, val]) => {
  const f = window.filters; const TF = window.tagFilter; const s = key === 'tb' ? TF.setFor(f, TF.gidForKey('tbNew', 'lib'), 'lib') : key === 'tags' ? TF.setFor(f, TF.gidForKey('tags', 'lib'), 'lib') : f[key];
  s.has(val) ? s.delete(val) : s.add(val); window.AF(); }, [key, val]);
const colSet = (key, val) => A.evaluate(async ([key, val]) => {
  const th = document.getElementById('org-th-' + key); window.openOrgColFilter(key, th); await new Promise(r => setTimeout(r, 200));
  const dd = document.getElementById('org-col-filter-dd');
  const row = dd && [...dd.querySelectorAll('label, div')].find(e => e.querySelector('input[type=checkbox]') && e.textContent.includes(val));
  if (!row) { window.closeOrgColFilter?.(); return 'skip'; }
  const cb = row.querySelector('input[type=checkbox]'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change'));
  window.closeOrgColFilter?.(); return 'ok'; }, [key, val]);
const search = q => A.evaluate(q => { window.wkSetSearchWord(q, { silent: true }); if (window._cvIsTableView?.()) window._cvApplySearch(q); else window.AF(); }, q);
const OPS = [
  ['開く:条件・表', async () => { leave(); await A.evaluate(() => window._cvPickerSelect('DT')); enter('DT'); }],
  ['開く:条件・カード', async () => { leave(); await A.evaluate(() => window._cvPickerSelect('DC')); enter('DC'); }],
  ['開く:手動・表', async () => { leave(); await A.evaluate(() => window._cvPickerSelect('ST')); enter('ST'); }],
  ['開く:語で作ったリスト', async () => { leave(); await A.evaluate(() => window._cvPickerSelect('DW')); enter('DW'); }],
  ['開く:手動・カード', async () => { leave(); await A.evaluate(() => window._cvPickerSelect('SC')); enter('SC'); }],
  ['マスター', async () => { leave(); await A.evaluate(() => window._cvClearSelection()); enter('master'); mode = await A.evaluate(() => window._libViewMode === 'org' ? 'table' : 'card'); }],
  ['カードボタン', async () => { await A.evaluate(() => window._cvSetView('card')); mode = 'card'; if (ctx !== 'master') { const vw = VIEWS.find(x => x.id === ctx); vw.viewType = 'card'; leave(); } }],
  ['テーブルボタン', async () => { await A.evaluate(() => window._cvSetView('table')); mode = 'table'; if (ctx !== 'master') { const vw = VIEWS.find(x => x.id === ctx); vw.viewType = 'table'; leave(); } }],
  ['サイド:チャンネルC2', async () => { await sidebarSet('channel', 'C2'); model.ch = tog(model.ch, 'C2'); }],
  ['サイド:プレイリストP1', async () => { await sidebarSet('playlist', 'P1'); model.pl = tog(model.pl, 'P1'); }],
  ['サイド:プレイリストP3', async () => { await sidebarSet('playlist', 'P3'); model.pl = tog(model.pl, 'P3'); }],
  ['サイド:タグ1トップ', async () => { await sidebarSet('tb', 'トップ'); model.tb = tog(model.tb, 'トップ'); }],
  ['サイド:タグ4 T2', async () => { await sidebarSet('tags', 'T2'); model.tags = tog(model.tags, 'T2'); }],
  ['未視聴だけ', async () => { await A.evaluate(() => window.togUnw()); model.unw = !model.unw; }],
  ['ブックマークあり', async () => { await A.evaluate(() => window.togBm()); model.bm = !model.bm; }],
  ['メモあり', async () => { await A.evaluate(() => window.togMemo()); model.memo = !model.memo; }],
  ['検索 alpha', async () => { await search('alpha'); model.q = 'alpha'; }],
  ['検索 -alpha', async () => { await search('-alpha'); model.q = '-alpha'; }],
  ['検索 消す', async () => { await search(''); model.q = ''; }],
  ['リセット', async () => { await A.evaluate(() => window.clearAll()); model = empty(); }],
  ['列の▾:プレイリストP2', async () => { if (mode !== 'table') return 'skip'; if (await colSet('playlist', 'P2') === 'skip') return 'skip'; model.pl = tog(model.pl, 'P2'); }],
  ['再読み込み', async () => { leave(); await reload(A); const c = await A.evaluate(() => window._cvActiveViewId || 'master'); enter(c); mode = await A.evaluate(() => window._libViewMode === 'org' ? 'table' : 'card'); }],
];
let bad = null;
const STEPS = Number(process.env.STEPS || 50);
for (let i = 0; i < STEPS && !bad; i++) {
  const [name, fn] = OPS[rnd(OPS.length)];
  const r = await fn(); if (r === 'skip') { i--; continue; }
  hist.push(name); await wait(700);
  const d = await shownDom();
  const exp = apply(base(ctx), model).map(v => v.id).sort();
  const ast = await A.evaluate(() => { const f = window.filters, TF = window.tagFilter;
    return { ch: [...f.channel].sort(), pl: [...f.playlist].sort(), tb: [...TF.selected(f, TF.gidForKey('tbNew', 'lib'), 'lib')].sort(), tags: [...TF.selected(f, TF.gidForKey('tags', 'lib'), 'lib')].sort(),
      unw: !!window.unwOnly, bm: !!window.bmOnly, memo: !!window.memoOnly, q: window.wkSearchWord() }; });
  const mst = { ch: [...model.ch].sort(), pl: [...model.pl].sort(), tb: [...model.tb].sort(), tags: [...model.tags].sort(), unw: model.unw, bm: model.bm, memo: model.memo, q: model.q };
  if (d.cur !== ctx) { bad = `開いているものが違う（期待 ${ctx}・実際 ${d.cur}）`; }
  else if (JSON.stringify(ast) !== JSON.stringify(mst)) { bad = `掛かっている絞り込みが違う  画面:${JSON.stringify(ast)}  つもり:${JSON.stringify(mst)}`; }
  else if (JSON.stringify(d.ids) !== JSON.stringify(exp)) {
    const extra = d.ids.filter(x => !exp.includes(x)), miss = exp.filter(x => !d.ids.includes(x));
    bad = `出ている動画が違う  余分:[${extra}] 足りない:[${miss}]  画面:${d.m} 掛けているつもり:${JSON.stringify(model)}`;
  }
  if (bad) { const dbg = await A.evaluate(() => { const f = window.filters, of = window.orgFilters; const pick = o => Object.fromEntries(Object.entries(o||{}).filter(([k,v]) => v instanceof Set && v.size).map(([k,v]) => [k,[...v]]));
      return { lib: pick(f), org: pick(of), unw: window.unwOnly, orgUnw: window.orgUnwOnly, bm: window.bmOnly, orgBm: window.orgBmOnly, cvIds: window._cvVideoIds ? [...window._cvVideoIds].sort() : null, cardIds: window._cvCardVideoIds ? [...window._cvCardVideoIds].sort() : null, q: window.wkSearchWord() }; });
    console.log('   DBG ' + JSON.stringify(dbg));
    console.log(`SEED ${SEEDN} ✗ ${hist.length}手目「${name}」 ${ctx}`); console.log('   ' + bad); console.log('   手順: ' + hist.join(' → ')); }
}
if (bad) fails++; else console.log(`SEED ${SEEDN} ✓ ${STEPS}手ずれなし`);
await A.context().close();
}
await b.close(); srv.close();
console.log(fails ? `\n✗ ${fails}件の失敗` : '\n✓ 全部通過');
process.exit(fails ? 1 : 0);
