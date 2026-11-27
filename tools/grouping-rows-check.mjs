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
const rchips = await pg.evaluate(() => [...document.querySelectorAll('#svt-rchips .svt-rv.on')].map(b => b.textContent.replace(/^✓ /, '').replace(/\s\d+$/, '')));
ck('行のタググループを押すと、中のタグが全部 ✓ で並ぶ', setEq(rchips, ['ボトム', 'トップ', 'スタンディング']), rchips);
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
ck('行の見出し: ボトム・トップ・スタンディング・その他', JSON.stringify(grid.rows) === JSON.stringify(['トップ', 'ボトム', 'スタンディング', 'その他']), grid.rows);
ck('どのマスも同じ高さ（カード1枚ぶん）', grid.n > 0 && grid.hs.length === 1 && grid.card > 0 && Math.abs(grid.hs[0] - grid.card - 34) <= 14, JSON.stringify(grid));
ck('マスの中だけスクロールする・本数がマスの上に出る', grid.ov === 'auto' && grid.cnt.every(t => /^\d+本$/.test(t)), JSON.stringify(grid));
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/rows-pc.png' });
const cellOf = (c, r) => pg.evaluate(([c, r]) => { const st = wkGroupings._state(); const ci = st._grid.cols.indexOf(c), ri = st._grid.rows.indexOf(r); const k = ci + '.' + ri; return (st._grid.cells[k] || null); }, [c, r]);
ck('v1（ラッソー・ボトム）は「ラッソー × ボトム」のマス', JSON.stringify(await cellOf('ラッソー', 'ボトム')) === '["v1"]', await cellOf('ラッソー', 'ボトム'));
// ③ 別のマスへドラッグ → 列と行のタグが一度に変わる・1回で両方戻る
const sel = (c, r) => pg.evaluate(([c, r]) => { const st = wkGroupings._state(); return `#svt-root .svt-cell[data-ci="${st._grid.cols.indexOf(c)}"][data-ri="${st._grid.rows.indexOf(r)}"]`; }, [c, r]);
const src = await sel('ラッソー', 'ボトム'), dst = await sel('スパイダー', 'トップ');
await pg.locator(src + ' .svt-lc').first().scrollIntoViewIfNeeded();
await pg.dragAndDrop(src + ' .svt-lc', dst); await pg.waitForTimeout(400);
ck('ドラッグで「スパイダー × トップ」へ: タグ4 と タグ1 が一度に変わる', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["スパイダー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["トップ"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
ck('お知らせ「「スパイダー」×「トップ」へ移動しました」', await pg.evaluate(() => document.getElementById('svt-toast').textContent.includes('「スパイダー」×「トップ」へ移動しました')));
ck('動画の保存に乗る', await until(() => { const v = cloudVideos().find(v => v.id === 'v1') || {}; return JSON.stringify(v.tb) === '["トップ"]' && JSON.stringify(v.tags) === '["スパイダー"]'; }, 8000));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ck('1回の取り消しで列と行の両方が戻る', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["ラッソー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["ボトム"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
// 同じ列の中で行だけ動かす
{ const d2 = await sel('ラッソー', 'スタンディング'); await pg.locator(d2).scrollIntoViewIfNeeded(); await pg.dragAndDrop(src + ' .svt-lc', d2); await pg.waitForTimeout(300); }
ck('同じ列で別の行へ: タグ1だけ変わる（タグ4は残る）', JSON.stringify(await vtb(pg, 'v1', 'tags')) === '["ラッソー"]' && JSON.stringify(await vtb(pg, 'v1')) === '["スタンディング"]', JSON.stringify([await vtb(pg, 'v1', 'tags'), await vtb(pg, 'v1')]));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
ck('（取り消し）', JSON.stringify(await vtb(pg, 'v1')) === '["ボトム"]');
// ④ カードの ▾ に行のタグも出る・押すと付く
await pg.locator(src + ' .svt-cardx .svt-sm').first().scrollIntoViewIfNeeded(); await pg.locator(src + ' .svt-cardx .svt-sm').first().click(); await pg.waitForTimeout(200);
ck('カードの ▾ を開くと行（タグ1）のタグも並ぶ', await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-ro')].map(b => b.textContent.replace('✓ ', '')).filter(t => ['トップ', 'ボトム', 'スタンディング'].includes(t)).length === 3));
await pg.locator('#svt-root .svt-ro', { hasText: 'トップ' }).first().click(); await pg.waitForTimeout(200);
ck('行のタグを押すと付く（開いている間は同じマスのまま）', setEq(await vtb(pg, 'v1'), ['ボトム', 'トップ']) && JSON.stringify(await cellOf('ラッソー', 'ボトム')).includes('v1'), JSON.stringify(await vtb(pg, 'v1')));
await pg.evaluate(() => wkGroupings._undo()); await pg.locator('#svt-root .svt-multi .svt-sm', { hasText: '閉じる' }).first().click().catch(() => {}); await pg.waitForTimeout(150);
// ⑤ 列の「行 ⇕」でその列だけ行で分けない（本物のクリック）
const lassoHd = pg.locator('#svt-colhs .svt-colh', { has: pg.locator('.svt-tag', { hasText: 'ラッソー' }) }).locator('.svt-roff');
await lassoHd.click(); await pg.waitForTimeout(300);
const span = await pg.evaluate(() => { const st = wkGroupings._state(); const ci = st._grid.cols.indexOf('ラッソー'); const el = document.querySelector(`#svt-root .svt-cell[data-ci="${ci}"][data-ri="*"]`); const one = document.querySelector('#svt-root .svt-cell:not(.svt-cspan)');
  return { has: !!el, h: el && el.getBoundingClientRect().height, one: one && one.getBoundingClientRect().height, n: document.querySelectorAll(`#svt-root .svt-cell[data-ci="${ci}"]`).length }; });
ck('「行 ⇕」を押すとその列は行をまたいだ1つのマス（行4つ分の高さ）', span.has && span.n === 1 && Math.abs(span.h - (span.one * 4 + 8 * 3)) <= 4, JSON.stringify(span));
ck('行で分けない列はグルーピングに保存される（rOff）・クラウドにも', await until(() => JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]?.rOff) === '["ラッソー"]'), JSON.stringify(CLOUD[GDOC]?.items?.[e1.id]?.rOff));
await lassoHd.click(); await pg.waitForTimeout(300);
// ⑥ マスの高さを編集で変える
await clickBtn('#svt-sum .svt-sm', 'グルーピングを編集');
ck('保存済みを編集で開くと「コピー」も別の枠', await pg.evaluate(() => { const c = document.querySelector('#svt-ed .svt-sec-p'); return !!c && c.querySelector('.svt-sech b').textContent === 'コピー' && !!c.querySelector('#svt-copy-to'); }));
ck('編集を開くと行の設定がそのまま出る', await pg.evaluate(() => document.querySelectorAll('#svt-rchips .svt-rv.on').length === 3 && document.querySelector('#svt-cellh .svt-o.on').textContent === 'カード1枚'));
await clickBtn('#svt-cellh .svt-o', 'カード3枚'); await clickBtn('#svt-ed .foot .svt-sm', '保存'); await pg.waitForTimeout(400);
const h3 = await pg.evaluate(() => { const c = document.querySelector('#svt-root .svt-cell:not(.svt-cspan)'); const lc = document.querySelector('#svt-root .svt-cell .svt-lc'); return { c: c.getBoundingClientRect().height, card: lc.getBoundingClientRect().height }; });
ck('カード3枚にするとマスがカード3枚ぶんの高さ', Math.abs(h3.c - (h3.card * 3 + 16 + 34)) <= 16, JSON.stringify(h3));
// ⑦ テーブルは「列 › 行」の見出し
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(800);
const th = await pg.evaluate(() => [...document.querySelectorAll('#orgList .org-group-hd')].map(t => t.textContent.trim()));
ck('テーブルは「列 › 行」の見出し（動画のある組み合わせだけ）', th.some(t => t.includes('ラッソー › ボトム')) && th.some(t => t.includes('スパイダー › トップ')), JSON.stringify(th));
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
// ⑪ 行の無いグルーピングは今までどおり（マスにしない）
await pg.evaluate(k => { wkGroupings._new(); wkGroupings._en('列だけ'); wkGroupings._eg(k); wkGroupings._es(); }, tbKey); await pg.waitForTimeout(400);
ck('行なしのグルーピングは今までどおりの列（マスにしない）', await pg.evaluate(() => !document.querySelector('#svt-root .svt-gridb') && document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)').length >= 3));

console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
