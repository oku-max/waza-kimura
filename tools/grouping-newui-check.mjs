// ═══ グルーピングの新しい見た目（v53.083 から既定・js/cv-groupings.js の NEWUI）。オーナー「プルダウンになってねーじゃん」「色ださい」「25％狭く」「フォントのサイズ」 ═══
// 使い方: node tools/grouping-newui-check.mjs
// 本物の index.html と firebase.js を偽のクラウドにつなぎ、本物のクリックで見る:
//   ・選び方はプルダウン1つ＋✏️（タブの並びと「グルーピングを編集」の行は無い）・文字は列の名前と同じ 13px
//   ・プルダウンで別のグルーピングに切り替わる・列の見出しに色の線が無い・列の ⋯ の並べ替えが効く
//   ・カードの ⋯ の「このグルーピングで非表示」で隠れる（グルーピングの hidden に入るだけ）・「ほかの列にも」の行は無い
//   ・行の見出しは名前に合わせた幅の 75%（最大 90px）・指で触る端末では出さない
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
const PORT = 8393;
setTimeout(() => { console.log('⏱'); process.exit(3); }, 280000).unref?.();
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const CLOUD = {};
async function mkCtx(){ const ctx = await b.newContext(process.env.MOB ? { viewport: { width: +process.env.MOB, height: 860 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ja-JP' } : { viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
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


const ROWS=['袖グリップ','パンツグリップ','片襟片袖'], COLS=['vs スタンディング','vs 膝立ち','リテンション','その他の対応'];
const TT=['04-01. Family Two Half Lasso','07-12- Half Lasso','Lasso to Omoplata','Spider Lasso Sweep','ラッソーからの三角','Lasso Retention Basics','Knee Cut Defense','膝立ちへのラッソー','Standing Opponent Lasso','Pants Grip Off-balance'];
const VIDEOS = Array.from({length:24},(_,k)=>({id:'v'+k,title:TT[k%TT.length]+(k>=TT.length?' '+(k+1):''),channel:['Mikey Musumeci','Lachlan Giles','Keenan Cornelius'][k%3],pl:['Mikey Musumeci Lasso','07-08 組み手争い','ラッソー対策集'][k%3],tb:k%7===6?[]:[ROWS[k%3]],tags:k%5===4?[]:[COLS[k%4]],pos:['ハーフガード','ラッソーガード'],pt:'youtube',addedAt:'2026-01-'+String(k+1).padStart(2,'0')}));
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
const cx = await mkCtx(); await cx.addInitScript(INIT, SEED);
await cx.addInitScript(s => { try { localStorage.setItem('wk_cv_shared', s); } catch (e) {} }, JSON.stringify(SHARED));
const pg = await cx.newPage(); pg.on('dialog', d => d.accept());
await pg.goto(`http://localhost:${PORT}/${process.env.Q || ""}`, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4500);
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4 && document.getElementById('svt-root'), null, { timeout: 30000 });
await pg.waitForTimeout(1200);
const clean = () => pg.evaluate(() => { document.querySelectorAll('#ob-start,#ob-overlay,.ob-overlay').forEach(e=>e.remove()); });
await clean();
const G = await pg.evaluate(() => { const gs = wkGroupings._groupers(); return { tb: gs.find(g => g.kind === 'tag' && g.sub === 'タグ1').key, tags: gs.find(g => g.key === 'tag:f_tags').key, pos: (gs.find(g => g.kind === 'tag' && g.sub === 'タグ3')||{}).key }; });
await pg.evaluate(G => { for (const [n,c,r] of [['新しいグルーピング',G.tb,null],['相手のポスチャー・リアクション',G.tags,G.tb]]) { wkGroupings._new(); wkGroupings._en(n); wkGroupings._eg(c); if (r) wkGroupings._eg(G.pos); if (r) wkGroupings._erg(r); wkGroupings._es(); } }, G);
await pg.waitForTimeout(800);
await pg.evaluate(() => { const e = wkGroupings.list().find(e => e.name.startsWith('相手')); wkGroupings._pick(e.id); });
await pg.waitForTimeout(1000);


let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d ? '  → ' + String(d).slice(0, 300) : '')); if (!ok) fail++; };
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.setViewportSize({ width: 1400, height: 900 }); await pg.waitForTimeout(800);
await pg.evaluate(() => { const ov = document.getElementById('libSbOverlay'); if (ov && getComputedStyle(ov).display !== 'none') ov.click(); document.getElementById('svt-root').scrollIntoView(); });
const st = await pg.evaluate(() => { const f = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
  return { pick: !!document.querySelector('#svt-root .svt-gpick'), pen: !!document.querySelector('#svt-root .svt-pen'), tabs: document.querySelectorAll('#svt-root .svt-vt').length, editRow: /グルーピングを編集/.test(document.getElementById('svt-sum')?.textContent || ''),
    fp: f('#svt-root .svt-gpick b'), fc: f('#svt-colhs .svt-tag'), border: [...document.querySelectorAll('#svt-colhs .svt-colh')].map(h => getComputedStyle(h).borderTopWidth), also: document.querySelectorAll('#svt-root .svt-also').length,
    rlw: parseFloat(getComputedStyle(document.querySelector('#svt-root .svt-rlab')).width), cardx: document.querySelectorAll('#svt-root .svt-cardx').length, more: document.querySelectorAll('#svt-root .svt-camore').length }; });
ck('選び方はプルダウン1つ＋✏️（タブの並び・「グルーピングを編集」の行は無い）', st.pick && st.pen && st.tabs === 0 && !st.editRow, JSON.stringify(st));
ck('プルダウンの文字は列の名前と同じ大きさ（13px）', st.fp === 13 && st.fc === 13, JSON.stringify(st));
ck('列の見出しに色の線が無い', st.border.every(w => w === '0px'), JSON.stringify(st.border));
ck('カードは「列と行の編集」「非表示」の段が無く、メモ・アーカイブの並びに ⋯・「ほかの列にも」の行も無い', st.cardx === 0 && st.more > 0 && st.also === 0, JSON.stringify(st));
ck('行の見出しは 90px 以下（名前に合わせた幅の 75%）', st.rlw > 30 && st.rlw <= 90, st.rlw);
// プルダウンで切り替え
await pg.locator('#svt-root .svt-gpick').click(); await pg.waitForTimeout(200);
const items = await pg.evaluate(() => [...document.querySelectorAll('#svt-pop .svt-pi')].map(b => b.textContent));
await pg.locator('#svt-pop .svt-pi', { hasText: '新しいグルーピング' }).first().click(); await pg.waitForTimeout(500);
ck('プルダウンに すべて・作ったグルーピング・＋ 新しいグルーピング が並び、押すと切り替わる', items.some(t => t.includes('相手のポスチャー')) && items.some(t => t.includes('＋ 新しいグルーピング')) && await pg.evaluate(() => document.querySelector('#svt-root .svt-gpick b').textContent === '新しいグルーピング'), JSON.stringify(items));
await pg.locator('#svt-root .svt-gpick').click(); await pg.waitForTimeout(200); await pg.locator('#svt-pop .svt-pi', { hasText: '相手のポスチャー' }).first().click(); await pg.waitForTimeout(500);
// 列の ⋯ で並べ替え
await pg.locator('#svt-colhs .svt-cmore').first().click(); await pg.waitForTimeout(200);
await pg.locator('#svt-pop .svt-pi', { hasText: 'タイトル A→Z' }).first().click(); await pg.waitForTimeout(400);
ck('列の ⋯ から並べ替えを選ぶと効く（見出しに ⇅ の印）', await pg.evaluate(() => !!document.querySelector('#svt-colhs .svt-son')));
// カードの ⋯ で非表示
const vid = await pg.evaluate(() => document.querySelector('#svt-root .svt-lc[data-canon="1"]')?.dataset.vid);
const cm = pg.locator(`#svt-root .svt-lc[data-vid="${vid}"] .svt-camore`).first(); await cm.scrollIntoViewIfNeeded(); await cm.click(); await pg.waitForTimeout(200);
await pg.locator('#svt-pop .svt-pi', { hasText: 'このグルーピングで非表示' }).first().click(); await pg.waitForTimeout(500);
ck('カードの ⋯ の「このグルーピングで非表示」で、そのグルーピングの hidden に入る', await pg.evaluate(v => { const e = wkGroupings.list().find(x => x.name.startsWith('相手')); return (e.hidden || []).includes(v); }, vid), vid);
ck('ページのエラーが無い', errs.length === 0, errs.join(' / '));
await cx.close();
// 指で触る端末では行の見出しを出さない
{ const ctxM = await b.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, locale: 'ja-JP' });
  await ctxM.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
  for (const [n, f] of [['__fsAll', () => JSON.stringify(CLOUD)], ['__fsPut', (p, d) => { if (d === null) delete CLOUD[p]; else CLOUD[p] = JSON.parse(d); }], ['__fsSet', (p, dj, merge) => { const d = JSON.parse(dj); const cur = (merge && CLOUD[p]) || {}; CLOUD[p] = { ...cur, ...d }; }], ['__fsUpdate', (p, dj) => { if (!CLOUD[p]) return 'not-found'; const d = JSON.parse(dj); const out = JSON.parse(JSON.stringify(CLOUD[p])); for (const [k, v] of Object.entries(d)) { const ks = k.split('.'); let o = out; for (const x of ks.slice(0, -1)) { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; } o[ks[ks.length - 1]] = v; } CLOUD[p] = out; return ''; }]]) await ctxM.exposeFunction(n, f);
  await ctxM.addInitScript(INIT, SEED); const pm = await ctxM.newPage(); await pm.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await pm.waitForTimeout(4500);
  await pm.waitForFunction(() => window.wkGroupings && document.getElementById('svt-root'), null, { timeout: 30000 });
  await pm.evaluate(() => wkGroupings._pick(wkGroupings.list().find(x => x.name.startsWith('相手')).id)); await pm.waitForTimeout(800);
  const m = await pm.evaluate(() => ({ rlab: getComputedStyle(document.querySelector('#svt-root .svt-rlab')).display, sw: document.documentElement.scrollWidth }));
  ck('スマホ: 行の見出しは出さない・横にはみ出さない', m.rlab === 'none' && m.sw <= 392, JSON.stringify(m)); await ctxM.close(); }
console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
