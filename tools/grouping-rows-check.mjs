// ═══ グルーピングの行（横軸・v53.067・js/cv-groupings.js）。オーナー決定 C（全部の列に貫く行＋列ごとに行で分けない）・設定は案1・マスの高さ 1/1.5/2/3（既定2） ═══
// 使い方: node tools/grouping-rows-check.mjs
// 本物の index.html と firebase.js を偽のクラウドにつなぎ、編集画面を本物のクリックで操作する。見るもの:
//   ・行の設定がグルーピングの1件（data/groupings items.{id}）に入る（rg・rpicks・rShowNone・rOff・cellH）
//   ・どのマスも同じ高さ（カード N 枚ぶん）で中だけスクロール・本数がマスの上に出る
//   ・別のマスへドラッグすると列と行のタグが一度に変わり、1回の取り消しで両方戻る
//   ・列の「行 ⇕」でその列だけ行をまたいだ1つのマス・テーブルは「列 › 行」の見出し・タグの名前を変えると行も新しい名前
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8297;
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 300000).unref?.();
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


const VIDEOS = [
 {id:'v1',title:'デッドリフト対策',channel:'Lachlan',pl:'ラッソー対策集',tb:['ボトム'],tags:['ラッソー'],pt:'youtube',addedAt:'2026-01-02',cf:{gc_phase1:'学習中',gc_star1:3}},
 {id:'v2',title:'立ちあがる相手',channel:'Lachlan',pl:'ラッソー対策集',tb:['ボトム','スタンディング'],tags:[],pt:'youtube',addedAt:'2026-01-03'},
 {id:'v3',title:'スパイダーからのシザー',channel:'Keenan',pl:'スパイダー基礎',tb:['トップ'],tags:['スパイダー'],pt:'youtube',addedAt:'2026-01-04',cf:{gc_phase1:'反復中'}},
 {id:'v4',title:'ベリンボロ',channel:'Mikey',pl:'デラヒーバ',tb:[],tags:[],pt:'youtube',addedAt:'2026-01-05'},
 {id:'v5',title:'アーカイブ',channel:'Mikey',pl:'デラヒーバ',tb:['ボトム'],tags:[],pt:'youtube',addedAt:'2026-01-06',archived:true}];
const SHARED = { cols:[{id:'gc_phase1',type:'select',label:'フェーズ',options:['学習中','反復中','使えてる']},{id:'gc_star1',type:'stars',label:'優先度'},{id:'gc_txt1',type:'text',label:'メモ列'}], deleted:[], master:{columns:[],unifiedOrder:[]} };
const SEED = { 'users/u1/data/settings': { customViews: [], cvShared: SHARED, updatedAt:'2026-09-01' },
  'users/u1/videos.json': { videos: VIDEOS, updatedAt:'x' } };
const INIT = seed => {
  const K = '__fs';
  const all = async () => JSON.parse(await window.__fsAll());
  const put = async (p, d) => { await window.__fsPut(p, d === undefined ? null : JSON.stringify(d)); };
  window.__fsLog = [];
  const doc = p => ({
    get: async () => { if (window.__grpFail && /groupings$/.test(p)) throw new Error('読めない'); const d = (await all())[p]; return { exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), metadata:{} }; },
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





const W = '__wkG';  // 短く
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(250); } return false; };
const cloudDoc = async p => JSON.parse(await (await cx0()).evaluate(() => window.__fsAll()))[p];
let _cx0 = null; const cx0 = async () => _cx0;
const GDOC = 'users/u1/data/groupings';
const vtb = (pg, id, f = 'tb') => pg.evaluate(([id, f]) => (window.videos.find(v => v.id === id) || {})[f], [id, f]);
const setEq = (a, b) => Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
const cols = pg => pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')].map(c => c.dataset.name + '=' + c.querySelectorAll('.svt-card').length));

const cloudVideos = () => (CLOUD['users/u1/videos.json'] || {}).videos || [];
const cx = await newCtx();
await cx.addInitScript(s => { try { localStorage.setItem('wk_cv_shared', s); } catch (e) {} }, JSON.stringify(SHARED));
const pg = await open(cx); _cx0 = pg;
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4 && document.getElementById('svt-root'), null, { timeout: 30000 });
await pg.waitForTimeout(1500);
await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; });
const G = await pg.evaluate(() => { const gs = wkGroupings._groupers(); const f = s => gs.find(g => g.kind === 'tag' && g.sub === s); return { tb: f('タグ1'), tags: gs.find(g => g.key === 'tag:f_tags') }; });
const tbKey = G.tb.key, tagsKey = G.tags.key;
// 選んだ文字のボタンを本物のクリックで押す（画面の中に出ていること）
const clickBtn = async (sel, text) => { const loc = pg.locator(sel, { hasText: text }).first(); await loc.scrollIntoViewIfNeeded(); await loc.click(); await pg.waitForTimeout(120); };
// ① 編集画面（案1）: 列 → 行 → マスの高さ を本物のクリックで
await clickBtn('#svt-root .svt-vt', '＋ グルーピング');
await pg.fill('#svt-name', '技×上下');
await clickBtn('#svt-ed .svt-sec-c .svt-o', G.tags.name);
const edText = await pg.evaluate(() => document.getElementById('svt-ed').textContent);
const secs = await pg.evaluate(() => [...document.querySelectorAll('#svt-ed .svt-sec')].map(x => ({ t: x.querySelector('.svt-sech b').textContent, bl: getComputedStyle(x).borderLeftColor, bw: getComputedStyle(x).borderLeftWidth })));
ck('編集画面は項目ごとに枠で区切られ、見出し・色の線が付く（名前・列・行・見た目）（v53.068）', JSON.stringify(secs.map(x => x.t)) === JSON.stringify(['名前', '列（縦に並ぶ）', '行（横に並ぶ）', '見た目']) && new Set(secs.map(x => x.bl)).size === 4 && secs.every(x => x.bw === '4px'), JSON.stringify(secs));
ck('編集画面は「列（縦に並ぶ）」「行（横に並ぶ）」「マスの高さ」の順（案1）', edText.indexOf('列（縦に並ぶ）') >= 0 && edText.indexOf('列（縦に並ぶ）') < edText.indexOf('行（横に並ぶ）') && edText.indexOf('行（横に並ぶ）') < edText.indexOf('マスの高さ'), edText.slice(0, 200));
ck('行の候補で、列で使っているタググループは押せない（「列で使用中」）', await pg.evaluate(n => { const b = [...document.querySelectorAll('#svt-ed .svt-sec-r .svt-o')].find(b => b.textContent.startsWith(n)); return !!b && b.disabled && b.textContent.includes('列で使用中'); }, G.tags.name));
const same = await pg.evaluate(() => { const hs = sel => [...document.querySelectorAll(sel + ' .svt-secb > .svt-opts > .svt-grp')].map(x => x.textContent.split('（')[0]);
  return { c: hs('#svt-ed .svt-sec-c'), r: hs('#svt-ed .svt-sec-r'), ng: !!document.querySelector('#svt-ed .svt-sec-r #svt-rngroup') }; });
ck('行の選び方は列と同じ見せ方（タグ／チャンネル・プレイリスト／カスタム列の見出し・新しいタググループ）', JSON.stringify(same.c) === JSON.stringify(same.r) && same.r.length === 3 && same.ng, JSON.stringify(same));
ck('マスの高さの既定はカード2枚', await pg.evaluate(() => document.querySelector('#svt-cellh .svt-o.on')?.textContent === 'カード2枚'));
await clickBtn('#svt-ed .svt-sec-r .svt-o', G.tb.name);
ck('行のタグは列と同じ枠（グループ名・全部選ぶ／全部外す・＋ 新しいタグ）', await pg.evaluate(() => { const b = document.querySelector('#svt-ed .svt-sec-r .svt-pgrow'); return !!b && !!b.querySelector('.svt-gname') && !!b.querySelector('#svt-rnew') && b.textContent.includes('全部選ぶ'); }));
const rchips = await pg.evaluate(() => [...document.querySelectorAll('#svt-rchips .svt-rv.on')].map(b => b.textContent.replace(/^⠿?✓ /, '').replace(/\s\d+$/, '')));
ck('行のタググループを押すと、中のタグが全部 ✓ で並ぶ', setEq(rchips, ['ボトム', 'トップ', 'スタンディング']), rchips);
// 行のタグをドラッグで並べ替え（v53.070・本物のポインター）
{ await pg.locator('#svt-rchips').scrollIntoViewIfNeeded(); const g0 = await pg.locator('#svt-rchips .svt-chip[data-i="0"] .svt-grip').boundingBox(), c2 = await pg.locator('#svt-rchips .svt-chip[data-i="2"]').boundingBox();
  await pg.mouse.move(g0.x + g0.width / 2, g0.y + g0.height / 2); await pg.mouse.down(); await pg.mouse.move(g0.x + 30, g0.y + 4, { steps: 4 }); await pg.mouse.move(c2.x + c2.width - 4, c2.y + c2.height / 2, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(200); }
const rord = await pg.evaluate(() => wkGroupings._state().editing.rpicks.slice());
ck('行のタグは ⠿ のドラッグで並べ替えられる（1つ目を最後へ）', rord.length === 3 && rord[2] === rchips[0] && rord[0] === rchips[1], JSON.stringify([rchips, rord]));
await pg.fill('#svt-rnew', '寝'); await clickBtn('#svt-ed .svt-sec-r .svt-pgrow .svt-sm', '足す');
ck('行の「＋ 新しいタグ」で足すと ✓ で入る（選択肢に足すだけ）', await pg.evaluate(() => [...document.querySelectorAll('#svt-rchips .svt-rv.on')].some(b => b.textContent.includes('寝'))));
await clickBtn('#svt-rchips .svt-rv', '寝');
ck('できあがりの形の図と一文が出る', await pg.evaluate(() => !!document.querySelector('#svt-ed .svt-mini .mr') && document.querySelector('#svt-ed .svt-rsum').textContent.includes('行は')));
if (process.env.SHOT) { await pg.locator('#svt-ed').screenshot({ path: process.env.SHOT + '/rows-ed.png' }); }
await clickBtn('#svt-cellh .svt-o', 'カード1枚');
await clickBtn('#svt-ed .foot .svt-sm', '保存');
const e1 = await pg.evaluate(() => wkGroupings.list().find(e => e.name === '技×上下'));
ck('保存: 行の設定がグルーピングの1件に入る（rg・rpicks・rShowNone・cellH）', !!e1 && e1.rg === tbKey && setEq(e1.rpicks, ['ボトム', 'トップ', 'スタンディング']) && e1.rShowNone === true && e1.cellH === 1 && Array.isArray(e1.rKnown), JSON.stringify(e1));
ck('クラウドの data/groupings にも入る', await until(() => !!(CLOUD[GDOC]?.items?.[e1.id]?.rg === tbKey)), JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]));
// ② マス: どれも同じ高さ・中だけスクロール・本数
await pg.waitForTimeout(400);
const grid = await pg.evaluate(() => { const cs = [...document.querySelectorAll('#svt-root .svt-cell:not(.svt-cspan)')]; const hs = [...new Set(cs.map(c => Math.round(c.getBoundingClientRect().height)))];
  const lc = document.querySelector('#svt-root .svt-cell .svt-lc'); const st = wkGroupings._state();
  return { n: cs.length, hs, card: lc ? Math.round(lc.getBoundingClientRect().height) : 0, ov: cs.length ? getComputedStyle(cs[0].querySelector('.svt-clist')).overflowY : '', rows: [...document.querySelectorAll('#svt-root .svt-rh b')].map(b => b.textContent), cols: st._grid && st._grid.cols.length,
    cnt: cs.map(c => c.querySelector('.svt-ccnt b').textContent) }; });
ck('行の見出し: 並べ替えた順（ボトム・スタンディング・トップ）＋その他', JSON.stringify(grid.rows) === JSON.stringify(['ボトム', 'スタンディング', 'トップ', 'その他']), grid.rows);
ck('どのマスも同じ高さ（カード1枚ぶん）', grid.n > 0 && grid.hs.length === 1 && grid.card > 0 && Math.abs(grid.hs[0] - grid.card - 34) <= 14, JSON.stringify(grid));
ck('マスの中だけスクロールする・本数がマスの上に出る', grid.ov === 'auto' && grid.cnt.every(t => /^\d+本$/.test(t)), JSON.stringify(grid));
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/rows-pc.png' });
// ②b カードの幅はライブラリのカードと同じ（v53.074・オーナー「カードのサイズが全然違う」）。行あり・幅を変えたとき・行なしで比べる
const libW = async () => { await pg.evaluate(() => wkGroupings._pick('all')); await pg.waitForTimeout(500);
  return pg.evaluate(() => { const c = document.querySelector('#cardList .card-wrap'); return c ? Math.round(c.getBoundingClientRect().width * 10) / 10 : 0; }); };
const grpW = async (id, sel) => { await pg.evaluate(id => wkGroupings._pick(id), id); await pg.waitForTimeout(700);
  return pg.evaluate(sel => { const ws = [...document.querySelectorAll(sel)].map(c => Math.round(c.getBoundingClientRect().width * 10) / 10); return { ws: [...new Set(ws)], probes: document.querySelectorAll('#lib-card-host > .card-list:not(#cardList)').length }; }, sel); };
const CELLW = '#svt-root .svt-cell:not(.svt-xfold) .svt-lc .card-wrap';
for (const [w, why] of [[1400, '1400px'], [1250, '幅を変えた後（1250px）'], [1600, '1600px']]) {
  await pg.setViewportSize({ width: w, height: 900 }); await pg.waitForTimeout(500);
  const L = await libW(), Gw = await grpW(e1.id, CELLW);
  ck(`${why}: 行ありのマスのカードの幅がライブラリのカードと同じ（ライブラリ ${L}px）`, L > 100 && Gw.ws.length > 0 && Gw.ws.every(x => Math.abs(x - L) <= 1) && Gw.probes === 0, JSON.stringify({ L, Gw }));
}
await pg.setViewportSize({ width: 1400, height: 900 }); await pg.waitForTimeout(500);
{ const L = await libW(); await pg.evaluate(() => { const sb = document.getElementById('libSidebar'); if (sb) { sb.style.display = ''; sb.classList.add('open'); } window.dispatchEvent(new Event('resize')); }); await pg.waitForTimeout(400);
  const L2 = await libW(); const Gw = await grpW(e1.id, CELLW);
  ck('サイドバーを開いて一覧の幅が変わっても、グルーピングのカードの幅はライブラリと同じ', L2 > 100 && Gw.ws.every(x => Math.abs(x - L2) <= 1), JSON.stringify({ L, L2, Gw }));
  await pg.evaluate(() => { const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; window.dispatchEvent(new Event('resize')); }); await pg.waitForTimeout(400); }
await pg.evaluate(id => wkGroupings._pick(id), e1.id); await pg.waitForTimeout(600);

if (process.env.PROBE) console.log('PROBE', JSON.stringify(await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-clist')].filter(l => l.querySelector('.svt-lc')).map(l => { const lc = l.querySelector('.svt-lc'); const cw = lc.querySelector('.card-wrap'); const cd = lc.querySelector('.card');
  return { cl: l.clientWidth, sw: l.scrollWidth, lc: lc.offsetWidth, cw: cw && cw.offsetWidth, cd: cd && cd.offsetWidth, cdmin: cd && getComputedStyle(cd).minWidth, cwmin: cw && getComputedStyle(cw).minWidth, cwW: cw && getComputedStyle(cw).width }; }))));
const cellOf = (c, r) => pg.evaluate(([c, r]) => { const st = wkGroupings._state(); const ci = st._grid.cols.indexOf(c), ri = st._grid.rows.indexOf(r); const k = ci + '.' + ri; return (st._grid.cells[k] || null); }, [c, r]);
ck('v1（ラッソー・ボトム）は「ラッソー × ボトム」のマス', JSON.stringify(await cellOf('ラッソー', 'ボトム')) === '["v1"]', await cellOf('ラッソー', 'ボトム'));
// ③ 別のマスへドラッグ → 列と行のタグが一度に変わる・1回で両方戻る
const sel = (c, r) => pg.evaluate(([c, r]) => { const st = wkGroupings._state(); return `#svt-root .svt-cell[data-ci="${st._grid.cols.indexOf(c)}"][data-ri="${st._grid.rows.indexOf(r)}"]`; }, [c, r]);
const src = await sel('ラッソー', 'ボトム'), dst = await sel('スパイダー', 'スタンディング');
await pg.locator(src + ' .svt-lc').first().scrollIntoViewIfNeeded();
await pg.locator(dst).scrollIntoViewIfNeeded(); await pg.dragAndDrop(src + ' .svt-lc', dst); await pg.waitForTimeout(400);
ck('ドラッグで「スパイダー × スタンディング」へ: タグ4 と タグ1 が一度に変わる', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["スパイダー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["スタンディング"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
ck('お知らせ「「スパイダー」×「スタンディング」へ移動しました」', await pg.evaluate(() => document.getElementById('svt-toast').textContent.includes('「スパイダー」×「スタンディング」へ移動しました')));
ck('動画の保存に乗る', await until(() => { const v = cloudVideos().find(v => v.id === 'v1') || {}; return JSON.stringify(v.tb) === '["スタンディング"]' && JSON.stringify(v.tags) === '["スパイダー"]'; }, 8000));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ck('1回の取り消しで列と行の両方が戻る', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["ラッソー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["ボトム"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
// 同じ列の中で行だけ動かす
{ const d2 = await sel('ラッソー', 'スタンディング'); await pg.locator(src).scrollIntoViewIfNeeded(); await pg.locator(d2).scrollIntoViewIfNeeded(); await pg.dragAndDrop(src + ' .svt-lc', d2); await pg.waitForTimeout(300); }
ck('同じ列で別の行へ: タグ1だけ変わる（タグ4は残る）', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["ラッソー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["スタンディング"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ck('（取り消し）', JSON.stringify(await vtb(pg, 'v1')) === '["ボトム"]');
// ④ カードの ▾ に行のタグも出る・押すと付く
await pg.locator(src + ' .svt-cardx .svt-sm').first().scrollIntoViewIfNeeded(); if (process.env.SHOT) await pg.waitForTimeout(10); await pg.locator(src + ' .svt-cardx .svt-sm').first().click(); await pg.waitForTimeout(200);
if (process.env.SHOT) await pg.locator('#svt-root .svt-multi').first().screenshot({ path: process.env.SHOT + '/rows-menu.png' }).catch(() => {});
ck('カードの ▾ のボタンは「列と行の編集」（タグの名前を並べない・v53.074）', await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-cardx .svt-sm:not(.svt-hidebtn)')].every(b => b.textContent === '列と行の編集 ▾')));
ck('開くと「列」「行」の見出しの下に、それぞれグループ名とタグが同じ見せ方で並ぶ', await pg.evaluate(([c, r]) => { const m = document.querySelector('#svt-root .svt-multi'); if (!m) return false; const ss = [...m.querySelectorAll('.svt-msec')];
  return ss.length === 2 && ss[0].querySelector('.svt-mh').textContent === '列' && ss[1].querySelector('.svt-mh').textContent === '行' && ss[0].querySelector('.svt-mgn').textContent === c && ss[1].querySelector('.svt-mgn').textContent === r
    && ss.every(x => x.querySelectorAll('.svt-mgc .svt-o').length > 0) && getComputedStyle(ss[0].querySelector('.svt-mgc .svt-o')).borderRadius === getComputedStyle(ss[1].querySelector('.svt-mgc .svt-o')).borderRadius; }, [G.tags.name, G.tb.name]));
ck('▾ のメニューの一番下に「決定（閉じる）」が全部見えている（カードからはみ出さない）（v53.071）', await pg.evaluate(() => { const b = document.querySelector('#svt-root .svt-multi .svt-mdone'); const c = b && b.closest('.svt-lc'); if (!b || !c) return false; const r = b.getBoundingClientRect(), cr = c.getBoundingClientRect(); const m = b.closest('.svt-multi'); return r.width > 100 && r.left >= cr.left - 1 && r.right <= cr.right + 1 && m.lastElementChild === b && [...m.querySelectorAll('.svt-msec')].every(x => x.getBoundingClientRect().right <= cr.right + 1); }));
ck('カードの ▾ を開くと行（タグ1）のタグも並ぶ', await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-ro')].map(b => b.textContent.replace('✓ ', '')).filter(t => ['トップ', 'ボトム', 'スタンディング'].includes(t)).length === 3));
const sc0 = await pg.evaluate(s => { const l = document.querySelector(s + ' .svt-clist'); l.scrollTop = 99999; const bd = document.querySelector('#svt-root .svt-board'); bd.scrollLeft = 40; return { top: l.scrollTop, max: l.scrollHeight - l.clientHeight, left: bd.scrollLeft }; }, src);
await pg.locator('#svt-root .svt-ro', { hasText: 'トップ' }).first().click(); await pg.waitForTimeout(250);
const sc1 = await pg.evaluate(s => ({ top: document.querySelector(s + ' .svt-clist').scrollTop, left: document.querySelector('#svt-root .svt-board').scrollLeft }), src);
ck('▾ でタグを押してもマスの中のスクロール位置・横の位置が変わらない（上に戻らない）（v53.074）', sc0.top > 20 && Math.abs(sc1.top - sc0.top) <= 2 && Math.abs(sc1.left - sc0.left) <= 2, JSON.stringify({ sc0, sc1 }));
ck('行のタグを押すと付く（開いている間は同じマスのまま）', setEq(await vtb(pg, 'v1'), ['ボトム', 'トップ']) && JSON.stringify(await cellOf('ラッソー', 'ボトム')).includes('v1'), JSON.stringify(await vtb(pg, 'v1')));
await pg.evaluate(() => wkGroupings._undo()); await pg.locator('#svt-root .svt-multi .svt-sm', { hasText: '閉じる' }).first().click().catch(() => {}); await pg.waitForTimeout(150);
// ④b 開閉（v53.070・オーナー「列も行もヘッダーにアコーディオン。列全体・行全体・1つのマスだけを畳める」）。この端末だけ・データに書かない
{ await pg.waitForTimeout(3500); const atBefore = JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]); const vtags = () => JSON.stringify(cloudVideos().map(v => [v.id, v.tb, v.tags, v.tg, v.cf])); const vBefore = vtags();
  await pg.evaluate(() => { document.querySelector('#svt-root .svt-board').scrollLeft = 0; });
  const ov = await pg.evaluate(() => { const rl = document.querySelector('#svt-root .svt-rlab').getBoundingClientRect(); const c0 = document.querySelector('#svt-root .svt-gcol').getBoundingClientRect(); const h0 = document.querySelector('#svt-colhs .svt-colh').getBoundingClientRect(); const sp = document.querySelector('#svt-colhs .svt-rsp').getBoundingClientRect(); return { rl: rl.right, c0: c0.left, h0: h0.left, sp: sp.right }; });
  ck('左端で、最初の列は行の見出しの右から始まる（重ならない）・見出しの帯も同じ', ov.c0 >= ov.rl - 1 && ov.h0 >= ov.sp - 1 && Math.abs(ov.c0 - ov.h0) <= 3, JSON.stringify(ov));
  const colIdx = await pg.evaluate(() => wkGroupings._state()._grid.cols.indexOf('スパイダー'));
  await pg.locator('#svt-colhs .svt-colh', { has: pg.locator('.svt-tag', { hasText: 'スパイダー' }) }).locator('.svt-fold').click(); await pg.waitForTimeout(250);
  const cf = await pg.evaluate(ci => { const col = document.querySelectorAll('#svt-root .svt-gcol')[ci]; const hd = [...document.querySelectorAll('#svt-colhs .svt-colh')].filter(h => !h.classList.contains('svt-addh'))[ci];
    return { w: Math.round(col.getBoundingClientRect().width), cells: col.querySelectorAll('.svt-cell').length, strip: !!col.querySelector('.svt-fstrip'), hw: Math.round(hd.getBoundingClientRect().width) }; }, colIdx);
  ck('列の ▾ でその列全体を畳む（細い帯になり、見出しも同じ幅）', cf.w <= 50 && cf.cells === 0 && cf.strip && Math.abs(cf.hw - cf.w) <= 2, JSON.stringify(cf));
  await pg.locator('#svt-root .svt-gcol .svt-fstrip').first().click(); await pg.waitForTimeout(250);
  ck('畳んだ列の帯を押すと開く', await pg.evaluate(ci => document.querySelectorAll('#svt-root .svt-gcol')[ci].querySelectorAll('.svt-cell').length > 1, colIdx));
  await pg.locator('#svt-root .svt-rh', { hasText: 'スタンディング' }).locator('.svt-fold').click(); await pg.waitForTimeout(250);
  const rf = await pg.evaluate(() => { const st = wkGroupings._state(); const ri = st._grid.rows.indexOf('スタンディング'); const cs = [...document.querySelectorAll(`#svt-root .svt-cell[data-ri="${ri}"]`)]; const rh = [...document.querySelectorAll('#svt-root .svt-rh')][ri];
    const other = document.querySelector('#svt-root .svt-cell[data-ri="0"]:not(.svt-xfold)'); return { hs: [...new Set(cs.map(c => Math.round(c.getBoundingClientRect().height)))], rh: Math.round(rh.getBoundingClientRect().height), cards: cs.reduce((n, c) => n + c.querySelectorAll('.svt-lc').length, 0), other: other && Math.round(other.getBoundingClientRect().height) }; });
  if (process.env.SHOT) { await pg.evaluate(() => { document.querySelector('#svt-root .svt-board').scrollLeft = 0; }); await pg.waitForTimeout(150); await pg.screenshot({ path: process.env.SHOT + '/rows-fold.png' }); }
  ck('行の ▾ でその行全体を畳む（行のマスも見出しも細く・カードは出さない・ほかの行はそのまま）', rf.hs.length === 1 && rf.hs[0] <= 40 && Math.abs(rf.rh - rf.hs[0]) <= 2 && rf.cards === 0 && rf.other > 100, JSON.stringify(rf));
  await pg.locator('#svt-root .svt-rh', { hasText: 'スタンディング' }).locator('.svt-fold').click(); await pg.waitForTimeout(250);
  const xsel = await sel('ラッソー', 'ボトム');
  await pg.locator(xsel + ' .svt-ccnt .svt-fold').click(); await pg.waitForTimeout(250);
  const xf = await pg.evaluate(s => { const c = document.querySelector(s); const bar = c.querySelector('.svt-xbar'); const below = document.querySelector(`#svt-root .svt-cell[data-ci="${c.dataset.ci}"][data-ri="${+c.dataset.ri + 1}"]`);
    const other = [...document.querySelectorAll(`#svt-root .svt-cell[data-ri="${c.dataset.ri}"]`)].find(x => x !== c && !x.classList.contains('svt-xfold'));
    return { fold: c.classList.contains('svt-xfold'), cards: c.querySelectorAll('.svt-lc').length, cnt: bar && bar.querySelector('b').textContent, h: Math.round(c.getBoundingClientRect().height),
      gap: below ? Math.round(below.getBoundingClientRect().top - c.getBoundingClientRect().bottom) : -1, oh: other ? Math.round(other.getBoundingClientRect().height) : 0 }; }, xsel);
  ck('マスの ▾ でそのマスだけ畳む（細い帯だけ・本数は出たまま）・その列の下のマスが詰めて上がる（空きを残さない）（v53.072）', xf.fold && xf.cards === 0 && xf.cnt === '1本' && xf.h <= 40 && xf.gap >= 0 && xf.gap <= 12 && xf.oh > 100, JSON.stringify(xf));
  // 行の中のマスを全部畳むと、その行も細くなる
  const ri0 = await pg.evaluate(s => document.querySelector(s).dataset.ri, xsel);
  for (const ci of await pg.evaluate(ri => [...document.querySelectorAll(`#svt-root .svt-cell[data-ri="${ri}"]:not(.svt-xfold)`)].map(c => c.dataset.ci), ri0)) { await pg.locator(`#svt-root .svt-cell[data-ri="${ri0}"][data-ci="${ci}"] .svt-ccnt .svt-fold`).click(); await pg.waitForTimeout(150); }
  const allf = await pg.evaluate(ri => { const cs = [...document.querySelectorAll(`#svt-root .svt-cell[data-ri="${ri}"]`)]; const rh = [...document.querySelectorAll('#svt-root .svt-rh')][+ri]; return { hs: [...new Set(cs.map(c => Math.round(c.getBoundingClientRect().height)))], rh: Math.round(rh.getBoundingClientRect().height) }; }, ri0);
  ck('行の中のマスを全部畳むと、その行も細くなる（見出しも同じ高さ）', allf.hs.length === 1 && allf.hs[0] <= 40 && Math.abs(allf.rh - allf.hs[0]) <= 2, JSON.stringify(allf));
  for (const ci of await pg.evaluate(ri => [...document.querySelectorAll(`#svt-root .svt-cell[data-ri="${ri}"]`)].map(c => c.dataset.ci), ri0)) { if (await pg.evaluate(s => !!document.querySelector(s), xsel.replace(/data-ci="\d+"/, `data-ci="${ci}"`)) && xsel.includes(`data-ci="${ci}"`)) continue; await pg.locator(`#svt-root .svt-cell[data-ri="${ri0}"][data-ci="${ci}"] .svt-xbar .svt-fold`).click(); await pg.waitForTimeout(150); }
  if (process.env.SHOT) { await pg.evaluate(() => { document.querySelector('#svt-root .svt-board').scrollLeft = 0; }); await pg.screenshot({ path: process.env.SHOT + '/rows-xfold.png' }); }
  await reload(pg); await pg.waitForTimeout(1200); await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; });
  ck('開閉はこの端末に残る（再読み込みしても畳んだまま）', await until(() => pg.evaluate(s => !!document.querySelector(s + '.svt-xfold'), xsel)));
  await pg.locator(xsel + ' .svt-xbar .svt-fold').click(); await pg.waitForTimeout(250);
  ck('開閉はグルーピングの保存データにも動画にも書かない', JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]) === atBefore && vtags() === vBefore, (() => { const a = JSON.parse(atBefore), b = CLOUD[GDOC]?.items?.[e1.id] || {}; return JSON.stringify(Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => [k, a[k], b[k]])) + ' V:' + (vtags() === vBefore); })());
}
// ⑤ 列の「行 ⇕」でその列だけ行で分けない（本物のクリック）
const lassoHd = pg.locator('#svt-colhs .svt-colh', { has: pg.locator('.svt-tag', { hasText: 'ラッソー' }) }).locator('.svt-roff');
await lassoHd.click(); await pg.waitForTimeout(300);
const span = await pg.evaluate(() => { const st = wkGroupings._state(); const ci = st._grid.cols.indexOf('ラッソー'); const el = document.querySelector(`#svt-root .svt-cell[data-ci="${ci}"][data-ri="*"]`); const one = document.querySelector('#svt-root .svt-cell:not(.svt-cspan)');
  return { has: !!el, h: el && el.getBoundingClientRect().height, one: one && one.getBoundingClientRect().height, cap: parseFloat(getComputedStyle(document.getElementById('svt-root')).getPropertyValue('--svt-cellmax')), n: document.querySelectorAll(`#svt-root .svt-cell[data-ci="${ci}"]`).length }; });
ck('「行 ⇕」を押すとその列は行をまたいだ1つのマス（行4つ分の高さ・ただし見える所の高さまで）', span.has && span.n === 1 && Math.abs(span.h - Math.min(span.one * 4 + 8 * 3, span.cap)) <= 4, JSON.stringify(span));
ck('行で分けない列はグルーピングに保存される（rOff）・クラウドにも', await until(() => JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]?.rOff) === '["ラッソー"]'), JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]?.rOff));
await lassoHd.click(); await pg.waitForTimeout(300);
// ⑥ マスの高さを編集で変える
await clickBtn('#svt-sum .svt-sm', 'グルーピングを編集');
ck('保存済みを編集で開くと「コピー」も別の枠', await pg.evaluate(() => { const c = document.querySelector('#svt-ed .svt-sec-p'); return !!c && c.querySelector('.svt-sech b').textContent === 'コピー' && !!c.querySelector('#svt-copy-to'); }));
ck('編集を開くと行の設定がそのまま出る', await pg.evaluate(() => document.querySelectorAll('#svt-rchips .svt-rv.on').length === 3 && document.querySelector('#svt-cellh .svt-o.on').textContent === 'カード1枚'));
await clickBtn('#svt-cellh .svt-o', 'カード3枚'); await clickBtn('#svt-ed .foot .svt-sm', '保存'); await pg.waitForTimeout(400);
const h3 = await pg.evaluate(() => { const c = document.querySelector('#svt-root .svt-cell:not(.svt-cspan)'); const lc = document.querySelector('#svt-root .svt-cell .svt-lc'); const host = document.getElementById('lib-card-host');
  const cw = document.querySelector('#svt-root .svt-colwrap'); const cap = parseFloat(getComputedStyle(document.getElementById('svt-root')).getPropertyValue('--svt-cellmax'));
  return { c: c.getBoundingClientRect().height, card: lc.getBoundingClientRect().height, cap, room: host.getBoundingClientRect().bottom - cw.getBoundingClientRect().bottom }; });
ck('カード3枚にするとマスがカード3枚ぶんの高さ（ただし見える所の高さまで）', Math.abs(h3.c - Math.min(h3.card * 3 + 16 + 34, h3.cap)) <= 16, JSON.stringify(h3));
ck('マスは見える所（上に残る見出しの下から画面の下まで）より高くならない＝マスのスクロールバーが画面の外に出ない（v53.073）', h3.cap > 0 && h3.c <= h3.room + 2, JSON.stringify(h3));
// 「行で分けない」列のマスも見える所まで
await lassoHd.click(); await pg.waitForTimeout(400);
const sp3 = await pg.evaluate(() => { const c = document.querySelector('#svt-root .svt-cell.svt-cspan'); const host = document.getElementById('lib-card-host'); const cw = document.querySelector('#svt-root .svt-colwrap'); return { h: c ? c.getBoundingClientRect().height : -1, room: host.getBoundingClientRect().bottom - cw.getBoundingClientRect().bottom }; });
ck('「行で分けない」列のマス（行の数ぶんの高さ）も見える所より高くならない', sp3.h > 0 && sp3.h <= sp3.room + 2, JSON.stringify(sp3));
await lassoHd.click(); await pg.waitForTimeout(300);
// カードの ▾ のボタンの名前が長くても、マスの中に横スクロールが出ない
const wide = await pg.evaluate(() => { const b = document.querySelector('#svt-root .svt-cell .svt-cardx .svt-sm:not(.svt-hidebtn)'); b.textContent = '相手のポスチャー・リアクション・Position ／ 自分のポスチャー・グリップ・とても長い名前のタググループ ▾'; const l = b.closest('.svt-clist'); return { sw: l.scrollWidth, cw: l.clientWidth, ox: getComputedStyle(l).overflowX }; });
ck('カードの ▾ の名前が長くても、マスの中に横スクロールが出ない（はみ出す分は … で切る）（v53.073）', wide.sw <= wide.cw + 1 && wide.ox === 'hidden', JSON.stringify(wide));
await pg.evaluate(() => wkGroupings._state() && document.getElementById('svt-sum'));
// ⑦ テーブルは2段の見出し（v53.075・オーナー「まず縦列で大きいアコーディオン、その下に横行ごとのアコーディオン」）
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(800);
const tbl = () => pg.evaluate(() => [...document.querySelectorAll('#orgList > tr')].map(t => t.classList.contains('org-group-sub') ? 'S:' + t.querySelector('div').textContent.replace(/[▼▶]\s*/, '').replace(/\d+本$/, '').trim()
  : t.classList.contains('org-group-hd') ? 'C:' + t.querySelector('div').textContent.replace(/[▼▶]\s*/, '').replace(/\d+本$/, '').trim() : 'R:' + t.id.replace('org-row-', '')));
const t0 = await tbl();
const iL = t0.indexOf('C:ラッソー');
ck('テーブル: 列の見出し（大）の下に行の見出し（小）、その下に動画の行が並ぶ', iL >= 0 && t0[iL + 1] === 'S:ボトム' && t0[iL + 2] === 'R:v1' && !t0.some(x => x.includes('›')), JSON.stringify(t0));
await pg.locator('#orgList > tr').nth(iL + 1).click(); await pg.waitForTimeout(400);
const t1 = await tbl(); const i1 = t1.indexOf('C:ラッソー');
ck('テーブル: 行の見出しを押すとその行の動画だけ畳む（列の見出し・行の見出しは残る）', t1[i1 + 1] === 'S:ボトム' && t1[i1 + 2] !== 'R:v1', JSON.stringify(t1));
await pg.locator('#orgList > tr').nth(iL + 1).click(); await pg.waitForTimeout(300);
await pg.locator('#orgList > tr.org-group-hd:not(.org-group-sub)', { hasText: 'ラッソー' }).first().click(); await pg.waitForTimeout(400);
const t2 = await tbl(); const i2 = t2.indexOf('C:ラッソー');
ck('テーブル: 列の見出しを押すとその列ぜんぶ（行の見出しと動画）を畳む', i2 >= 0 && !(t2[i2 + 1] || '').startsWith('S:') && !t2.includes('R:v1'), JSON.stringify(t2));
await pg.locator('#orgList > tr.org-group-hd:not(.org-group-sub)', { hasText: 'ラッソー' }).first().click(); await pg.waitForTimeout(300);
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/rows-table.png' });
// 表を横に動かしても、見出しの文字（▼ 名前 本数）は左に残る（v53.076・オーナー「横スクロールで見出しも動いて最後は見えなくなる」）
for (const w of [1400, 390]) {
  await pg.setViewportSize({ width: w, height: 900 }); await pg.waitForTimeout(500);
  const hx = await pg.evaluate(async () => {
    const tb = document.getElementById('orgList'); let sc = tb; while (sc && !(sc.scrollWidth > sc.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowX))) sc = sc.parentElement;
    if (!sc) return { noScroll: true };
    const lab = () => [...tb.querySelectorAll('tr.org-group-hd > td > div')].map(d => Math.round(d.getBoundingClientRect().left));
    const sl = () => Math.round(sc.getBoundingClientRect().left);
    sc.scrollLeft = 0; await new Promise(r => setTimeout(r, 100)); const a = lab(), l0 = sl();
    sc.scrollLeft = 99999; await new Promise(r => setTimeout(r, 150)); const b = lab();
    const r = { sc: sc.id || sc.className, max: sc.scrollLeft, a, b, l0 }; sc.scrollLeft = 0; return r; });
  ck(`${w}px: 表を横に動かしても、列・行の見出しの文字は左に残る`, hx.noScroll || (hx.max > 0 && hx.b.length > 0 && hx.b.every((x, i) => x >= hx.l0 - 1 && x <= hx.a[i] + 2)), JSON.stringify(hx));
}
await pg.setViewportSize({ width: 1400, height: 900 }); await pg.waitForTimeout(300);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(600);
// ⑧ タグの名前を変えると行の名前も変わる
await pg.evaluate(gid => window._grpRenameTag(gid, 'スタンディング', '立ち'), tbKey.slice(4));
const e2 = await pg.evaluate(id => wkGroupings.list().find(e => e.id === id), e1.id);
ck('タグの名前を変えると行（rpicks・rKnown）も新しい名前', e2.rpicks.includes('立ち') && !e2.rpicks.includes('スタンディング') && e2.rKnown.includes('立ち'), JSON.stringify(e2));
// ⑨ 開き直しても同じ
await reload(pg); await pg.waitForTimeout(1500);
ck('再読み込みしても行のまま開く', await until(() => pg.evaluate(() => !!document.querySelector('#svt-root .svt-gridb') && document.querySelectorAll('#svt-root .svt-rh').length >= 4)));
// ⑩ 390px: ページが横にはみ出さない・行の見出しは左に残る
await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(600);
const sp = await pg.evaluate(async () => { const bd = document.querySelector('#svt-root .svt-board'); bd.scrollLeft = 300; await new Promise(r => setTimeout(r, 150));
  const rh = document.querySelector('#svt-root .svt-rh').getBoundingClientRect(), b = bd.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, rhL: rh.left, bL: b.left, sl: bd.scrollLeft }; });
if (process.env.SHOT) { await pg.evaluate(() => { document.querySelectorAll('#ob-overlay,#ob-start,.ob-overlay,[id^=ob-]').forEach(e => e.remove()); document.querySelector('#svt-root .svt-board').scrollLeft = 0; document.getElementById('svt-root').scrollIntoView(); }); await pg.waitForTimeout(200); await pg.screenshot({ path: process.env.SHOT + '/rows-sp.png' }); }
ck('スマホ幅: ページは横にはみ出さず、横に動かしても行の見出しは左に残る', sp.sw <= 392 && sp.sl > 0 && Math.abs(sp.rhL - sp.bL) <= 2, JSON.stringify(sp));
await pg.setViewportSize({ width: 1400, height: 900 });
// ⑩b スマホの指の横スワイプでボードが横に動く（v53.076・オーナーの録画「スマホで横スクロールできない」。動いてもすぐ最初の列へ戻っていた）
// v53.077: 画面の密度を Android の実機と同じ 2.625 にする（位置が小数になる。板と上の横バーが位置を写し合うとき、小数のずれを「動いた」と見て
// 指で動かしている板へ書き戻し、スワイプが止められていた。密度 1 では小数にならず、v53.076 の検査は通ってしまった）
{ const ctxM = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true, locale: 'ja-JP' });
  await ctxM.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
  for (const [n, f] of [['__fsAll', () => JSON.stringify(CLOUD)], ['__fsPut', (p, d) => { if (d === null) delete CLOUD[p]; else CLOUD[p] = JSON.parse(d); }],
    ['__fsSet', (p, dj, merge) => { const d = JSON.parse(dj); const cur = (merge && CLOUD[p]) || {}; CLOUD[p] = { ...cur, ...d }; }],
    ['__fsUpdate', (p, dj) => { if (!CLOUD[p]) return 'not-found'; const d = JSON.parse(dj); const out = JSON.parse(JSON.stringify(CLOUD[p])); for (const [k, v] of Object.entries(d)) { const ks = k.split('.'); let o = out; for (const x of ks.slice(0, -1)) { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; } o[ks[ks.length - 1]] = v; } CLOUD[p] = out; return ''; }]]) await ctxM.exposeFunction(n, f);
  await ctxM.addInitScript(INIT, SEED);
  const pm = await ctxM.newPage(); await pm.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await pm.waitForTimeout(4500);
  await pm.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4 && document.getElementById('svt-root'), null, { timeout: 30000 });
  await pm.evaluate(id => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; wkGroupings._pick(id); }, e1.id);
  await pm.waitForTimeout(800);
  const cdp = await ctxM.newCDPSession(pm);
  const swipe = async (sel) => { await pm.evaluate(() => { document.querySelector('#svt-root .svt-board').scrollLeft = 0; }); await pm.waitForTimeout(200);
    const bx = await pm.locator(sel).first().boundingBox(); if (!bx) return -1;
    // 本物の指と同じく、置いて・横に動かして・離す（synthesizeScrollGesture はこの環境では何も動かさなかった）
    { const x0 = Math.round(bx.x + bx.width / 2), y0 = Math.round(bx.y + Math.min(bx.height / 2, 60)); const pt = x => [{ x, y: y0 }];
      await pm.evaluate(() => { const bd = document.querySelector('#svt-root .svt-board'); window.__bdW = []; const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
        Object.defineProperty(bd, 'scrollLeft', { configurable: true, get() { return d.get.call(this); }, set(x) { window.__bdW.push([d.get.call(this), x]); d.set.call(this, x); } }); });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0) });
      for (let k = 1; k <= 16; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - k * 10.3, y: y0 }] }); await pm.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await pm.waitForTimeout(900);
    __writes.push(await pm.evaluate(() => { const w = window.__bdW; delete document.querySelector('#svt-root .svt-board').scrollLeft; return w; }));
    if (process.env.PROBE) console.log('PROBE', sel, JSON.stringify(await pm.evaluate(([x, y]) => { const bd = document.querySelector('#svt-root .svt-board'); let e = document.elementFromPoint(x, y); const chain = []; while (e && chain.length < 14) { const c = getComputedStyle(e); chain.push((e.id || e.className || e.tagName).toString().slice(0, 30) + ' ta=' + c.touchAction + ' ox=' + c.overflowX + ' ob=' + c.overscrollBehaviorX + ' dr=' + e.getAttribute('draggable')); e = e.parentElement; }
      return { sw: bd.scrollWidth, cw: bd.clientWidth, sl: bd.scrollLeft, host: (() => { const h = document.getElementById('lib-card-host'); return h.scrollLeft + '/' + h.scrollWidth + '/' + h.clientWidth; })(), win: scrollX, chain }; }, [Math.round(bx.x + bx.width / 2), Math.round(bx.y + Math.min(bx.height / 2, 60))])));
    return pm.evaluate(() => document.querySelector('#svt-root .svt-board').scrollLeft); };
  const __writes = [];
  const onCard = await swipe('#svt-root .svt-cell .svt-lc .card-title');
  const onHead = await swipe('#svt-root .svt-rh');
  ck('スマホ: マスのカードの上で指を横に滑らせるとボードが横に動き、そのまま止まる（最初の列へ戻らない）', onCard > 60, JSON.stringify({ onCard }));
  ck('スマホ: 行の見出しの上で指を横に滑らせてもボードが横に動く', onHead > 60, JSON.stringify({ onHead }));
  // 指で動かしている間、プログラムが板の位置を書き換えない（書き換えると実機ではスワイプが止められて戻る・v53.077）
  ck('スマホ: 指で動かしている間、プログラムが板の位置を書き換えない', __writes.every(w => w.length === 0), JSON.stringify(__writes).slice(0, 300));
  await ctxM.close(); }
// ⑪ 行の無いグルーピングは今までどおり（マスにしない）
await pg.evaluate(k => { wkGroupings._new(); wkGroupings._en('列だけ'); wkGroupings._eg(k); wkGroupings._es(); }, tbKey); await pg.waitForTimeout(400);
ck('行なしのグルーピングは今までどおりの列（マスにしない）', await pg.evaluate(() => !document.querySelector('#svt-root .svt-gridb') && document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)').length >= 3));
{ const id2 = await pg.evaluate(() => wkGroupings.list().find(e => e.name === '列だけ').id); const L = await libW(); const Gw = await grpW(id2, '#svt-root .svt-col:not(.svt-cfold) .svt-lc .card-wrap');
  ck('行なしのグルーピングでもカードの幅はライブラリと同じ', L > 100 && Gw.ws.length > 0 && Gw.ws.every(x => Math.abs(x - L) <= 1), JSON.stringify({ L, Gw })); }
await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; }); await pg.locator('#svt-colhs .svt-colh .svt-fold').first().click(); await pg.waitForTimeout(250);
ck('行なしのグルーピングでも列の ▾ で列を畳める', await pg.evaluate(() => { const c = document.querySelector('#svt-root .svt-col.svt-cfold'); return !!c && c.getBoundingClientRect().width <= 50 && !c.querySelector('.svt-lc'); }));

console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
