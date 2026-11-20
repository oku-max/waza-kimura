// ═══ 再読み込み・起動で、前回開いていたリストをすぐ開く／開くまではマスターを出さない（v53.018）═══
// 使い方: node tools/cv-boot-check.mjs
// オーナー「前の状態を復元するまでにマスター画面が出てるから下手にいじれちゃう。触ってる間にいつの間にかプレイリストが変わる」
// 決定 mock-startup-loading.html の 1 と 4: 1 = この端末の控えから、アプリの準備（列の並び等）が終わり動画の控えが出た直後に開く。
// 4 = 開くまではマスターを出さず「前回開いていたリスト「…」を開いています…」と設定の案内（Settings ＞ 外観設定 ＞ 起動時のリスト）。
// クラウドの返事を2.5秒・本体の読み込みを1.5秒遅らせて（本番に近い）、本物の index.html と firebase.js で踏む。
// v53.010（起動してすぐ開いた）でマスターの列が消えたので、その形も見る。
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
const PORT = 8266;
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 1500000).unref?.();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer(async (q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (globalThis.MODDELAY && p === '/js/firebase.js') await new Promise(res => setTimeout(res, globalThis.MODDELAY));
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const CLOUD = {};
async function mkCtx(){ const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
await ctx.exposeFunction('__fsAll', async () => { if (globalThis.SLOW) await new Promise(r => setTimeout(r, globalThis.SLOW)); return JSON.stringify(CLOUD); });
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


const see = pg => pg.evaluate(() => { const m = window._libViewMode; const tw = document.querySelector('.org-table-wrap');
  const ids = m === 'org' ? (tw && tw.style.display === 'none' ? [] : [...document.querySelectorAll('tr.org-tr[id^="org-row-"]')].map(e => e.id.slice(8))) : [...document.querySelectorAll('#cardList .card[id^="card-"]')].map(e => e.id.slice(5));
  return { cur: window._cvActiveViewId || 'master', name: document.getElementById('cv-list-name')?.textContent || '', boot: !!document.getElementById('cv-boot-loading'), n: ids.length }; });
const mk = async () => { const cx = await newCtx(); await cx.addInitScript(v => { if (!localStorage.getItem('wk_cv_views')) localStorage.setItem('wk_cv_views', v); }, JSON.stringify(VIEWS)); return open(cx); };

{ globalThis.SLOW = 0; globalThis.MODDELAY = 0;
  const A = await mk(); await A.evaluate(() => window._cvPickerSelect('DC')); await wait(1500);
  // 動画の控えを消す（初めて開く端末と同じ）・ほかの端末で DC の条件に合う動画が1本増えた
  await A.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('wk-video-cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  const vj = CLOUD['users/u1/videos.json']; vj.videos = [...vj.videos, { id:'vNEW', title:'new', channel:'C1', pl:'P1', tags:['T1'], addedAt:'2026-11-20' }]; vj.updatedAt = 'y2';
  globalThis.SLOW = 1500;
  await A.reload({ waitUntil: 'domcontentloaded' });
  const t0 = Date.now(); const log = []; let shot = false;
  for (const t of [300, 1000, 2000, 3500, 5000, 7000, 10000, 15000]) { while (Date.now() - t0 < t) await wait(30); const s = await see(A);
    log.push(`${t}ms:${s.boot ? '読込中' : s.cur}「${s.name}」${s.boot ? '' : s.n + '本'}`); }
  console.log('控え無し・前回=DC（クラウドで1本増えた）: ' + log.join(' / '));
  ck('★ 開くまでは読み込み中（マスターを出さない）・リスト名は前回のリスト', /^300ms:読込中「条件・カード」/.test(log[0]), log[0]);
  ck('★ 届いたら前回のリストが開き、ほかの端末で増えた1本も入る（5本）', log[log.length - 1].includes('DC「条件・カード」5本'), log[log.length - 1]);
  await A.context().close();
  CLOUD['users/u1/videos.json'].videos = CLOUD['users/u1/videos.json'].videos.filter(v => v.id !== 'vNEW');
}
for (const id of ['DT', 'DC']) {
  globalThis.SLOW = 0; globalThis.MODDELAY = 0;
  const A = await mk(); await A.evaluate(id => window._cvPickerSelect(id), id); await wait(1500);
  globalThis.SLOW = 2500; globalThis.MODDELAY = 1500;
  await A.reload({ waitUntil: 'domcontentloaded' });
  const t0 = Date.now(); const log = [];
  for (const t of [100, 300, 600, 1000, 1500, 2000, 3000, 5000, 9000, 16000]) { while (Date.now() - t0 < t) await wait(30); const s = await see(A); log.push(`${t}ms:${s.boot ? '読込中' : s.cur}「${s.name}」${s.boot ? '' : s.n + '本'}`); }
  console.log(`前回=${id}（控えあり）: ` + log.slice(0, 3).join(' / '));
  ck(`★ ${id}: 0.3秒までに前回のリストが正しい本数で開く`, log[1].startsWith(`300ms:${id}`) && log[1].endsWith(id === 'DT' ? '11本' : '4本'), log[1]);
  ck(`${id}: その後もずれない`, log[log.length - 1].endsWith(id === 'DT' ? '11本' : '4本'), log[log.length - 1]);
  await A.evaluate(() => window._cvClearSelection()); await wait(800); await A.evaluate(() => window._cvSetView('table')); await wait(800);
  const nc = await A.evaluate(() => window.orgColOrder.length); ck(`★ ${id}: マスターに戻っても標準の列が消えない（v53.010 の不具合）`, nc >= 9, nc);
  await A.context().close();
}
// 読み込み中に別のリストを選んだら、そちらのまま
{ globalThis.SLOW = 0; globalThis.MODDELAY = 0;
  const A = await mk(); await A.evaluate(() => window._cvPickerSelect('DT')); await wait(1500);
  globalThis.SLOW = 2500; globalThis.MODDELAY = 1500;
  await A.reload({ waitUntil: 'domcontentloaded' }); await wait(500);
  await A.evaluate(() => window._cvPickerSelect?.('SC')).catch(e => console.log('  (まだ選べない)', e.message.split('\n')[0]));
  await wait(15000); const s1 = await see(A); ck('読み込み中に別のリストを選んだら、そちらのまま（勝手に戻さない）', s1.cur === 'SC' && !s1.boot && s1.n === 8, JSON.stringify(s1)); await A.context().close(); }
// 設定がマスターなら読み込み中は出ない
{ globalThis.SLOW = 0; globalThis.MODDELAY = 0;
  const A = await mk(); await A.evaluate(() => { window._cvPickerSelect('DT'); localStorage.setItem('wk_cvStartup', JSON.stringify({ list: 'master', scope: 'device' })); }); await wait(1500);
  globalThis.SLOW = 2500; globalThis.MODDELAY = 1500;
  await A.reload({ waitUntil: 'domcontentloaded' }); await wait(300); const a = await see(A); await wait(8000);
  const s2 = await see(A); ck('起動時のリストの設定が「マスター」なら、読み込み中は出さずマスター', !a.boot && a.cur === 'master' && s2.cur === 'master', JSON.stringify([a, s2])); await A.context().close(); }
await b.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : "\n✓ 全部通過");
process.exit(fail ? 1 : 0);
