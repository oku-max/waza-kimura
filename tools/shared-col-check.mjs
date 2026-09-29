// ═══ 共有列（マスター・複数リストで使うカスタム列）の検査 ═══
// 使い方: node tools/shared-col-check.mjs
//
// なぜ要るか（2026-09-29 オーナー要望）:
//   「マスターでもカスタム列を使えるようにする」「作った列をほかのリストでも使えるようにする」。
//   値は動画ごとに1つ（どのリスト・マスターで直しても同じ）＝動画の v.cf に置く。
//   既存の列は「共有列にする」を押したものだけ移す。移すときに元の値を消さない。
//
//   ここで見張る約束:
//   ・共有列にしても、リストの rowData（元の値）と元の列定義（sharedFrom）は残る
//   ・値は動画の v.cf に入り、別のリスト・マスターで同じ値が見える
//   ・どこかで直すと、他でも同じ値になる
//   ・リスト/マスターから「外す」は参照を外すだけ。動画の値は消えない
//   ・保存されるリストの列は参照だけ（type/label はトップに出ない）＋定義の写し(def)
//   ・定義が消えても、リストに残った写しから復元される
//   ・クラウドから来た定義は足し合わせ。空のマスターで手元のマスターを消さない
//   ・一度も共有列を作っていない端末は null を返す（クラウドを空で上書きしない）
//   ・マスターに足す列は必ず共有列。マスターの表に見出しとセルが出る
//
//   本物の index.html を起動して確かめる（器を自分で作らない）。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8243;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const VIEWS = [
  { id:'_a', label:'リストA', saveMode:'static', viewType:'table', videoIds:['v1','v2','v3'],
    columns:[{ id:'col101', type:'stars', label:'習得度' }, { id:'col102', type:'text', label:'メモA' }],
    rowData:{ v1:{ col101:3, col102:'x' }, v2:{ col101:0 }, gone:{ col101:5 } } },
  { id:'_b', label:'リストB', saveMode:'static', viewType:'table', videoIds:['v1','v2'], columns:[], rowData:{} },
];
// Firebase SDK は読めない（外部通信を止めている）ので、何もしない代わりを置く。
// これで本物の index.html のモジュール（表の描画 organize.js 等）が最後まで読み込まれる。
await ctx.addInitScript(() => {
  const q = () => ({ get: async () => ({ exists: false, data: () => ({}), docs: [] }), set: async () => {}, onSnapshot: () => () => {},
    collection: () => q(), doc: () => q(), where: () => q(), orderBy: () => q(), limit: () => q(), delete: async () => {} });
  const fsFn = () => ({ settings: () => {}, collection: () => q(), doc: () => q(), enablePersistence: async () => {} });
  fsFn.FieldValue = { arrayUnion: (...a) => a, arrayRemove: (...a) => a, serverTimestamp: () => 0, delete: () => null };
  const authFn = () => ({ onAuthStateChanged: () => () => {}, currentUser: null, setPersistence: async () => {},
    getRedirectResult: async () => ({}), signOut: async () => {} });
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; this.setCustomParameters = () => {}; };
  authFn.Auth = { Persistence: { LOCAL: 'local' } };
  window.firebase = { initializeApp: () => {}, auth: authFn, firestore: fsFn,
    storage: () => ({ ref: () => ({ child: () => ({}), getMetadata: async () => ({}), put: async () => {} }) }), apps: [] };
});
// 初回だけ入れる（再読み込みの検査で、保存された中身を上書きしないため）
await ctx.addInitScript(v => { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1');
  localStorage.setItem('wk_cv_views', JSON.stringify(v)); localStorage.setItem('wk_lang','ja'); }, VIEWS);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.accept());
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d && !ok ? '  → ' + String(d).slice(0, 300) : '')); if (!ok) fail++; };
const wait = ms => pg.waitForTimeout(ms);

await pg.evaluate(() => {
  window.videos = [ { id:'v1', title:'A', addedAt:'2026-01-01' }, { id:'v2', title:'B', addedAt:'2026-01-02' },
                    { id:'v3', title:'C', cf:{ keep:1 }, addedAt:'2026-01-03' } ];
  window.__vsaves = 0; window.debounceSave = () => { window.__vsaves++; };
});

console.log('\n── 共有列を1つも持たない端末 ──');
ck('★ cvShared は null（クラウドを空で上書きしない）', await pg.evaluate(() => window._cvSharedRaw() === null));
await pg.evaluate(() => window._cvSave());
ck('★ 保存しても共有列のローカル保存は作られない', await pg.evaluate(() => localStorage.getItem('wk_cv_shared') === null));

console.log('\n── リストAの「習得度」を共有列にする ──');
const r1 = await pg.evaluate(async () => {
  window._cvShareCol('_a', 'col101');
  await new Promise(r => setTimeout(r, 300));
  const saved = JSON.parse(localStorage.getItem('wk_cv_views')).find(v => v.id === '_a');
  const ref = saved.columns[0];
  return { ref, rowData: saved.rowData, sharedFrom: saved.sharedFrom, v1: window.videos[0].cf, v2: window.videos[1].cf,
           v3: window.videos[2].cf, saves: window.__vsaves, raw: window._cvSharedRaw() };
});
const gid = r1.ref.id;
ck('列が共有列の参照になる（id が gc_）', /^gc_/.test(gid) && r1.ref.shared === true, JSON.stringify(r1.ref));
ck('★ 保存される参照に type/label は出ない（定義は1か所）', r1.ref.type === undefined && r1.ref.label === undefined, JSON.stringify(r1.ref));
ck('参照には定義の写し(def)がある', r1.ref.def?.type === 'stars' && r1.ref.def?.label === '習得度', JSON.stringify(r1.ref));
ck('★ 空でない値が動画の v.cf に移る', r1.v1?.[gid] === 3, JSON.stringify(r1.v1));
ck('空の値(0)は写さない', !r1.v2 || r1.v2[gid] === undefined, JSON.stringify(r1.v2));
ck('★ 他の動画の v.cf は触らない', JSON.stringify(r1.v3) === JSON.stringify({ keep:1 }), JSON.stringify(r1.v3));
ck('★ 元の値は rowData に残る（消さない）', r1.rowData.v1.col101 === 3 && r1.rowData.gone.col101 === 5, JSON.stringify(r1.rowData));
ck('★ 元の列定義は sharedFrom に残る', r1.sharedFrom?.[0]?.col?.id === 'col101' && r1.sharedFrom[0].to === gid, JSON.stringify(r1.sharedFrom));
ck('動画データの保存が呼ばれる', r1.saves >= 1, r1.saves);
ck('共有列の定義が cvShared に入る', r1.raw?.cols?.some(c => c.id === gid && c.type === 'stars'), JSON.stringify(r1.raw));
ck('共有にしなかった列はそのまま', await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_cv_views'))[0].columns[1].type === 'text'));

console.log('\n── リストBに足すと、同じ値が見える ──');
const r2 = await pg.evaluate(async (gid) => {
  window._cvPickerSelect('_b'); await new Promise(r => setTimeout(r, 600));
  window.cvOpenAddCol('_b'); await new Promise(r => setTimeout(r, 100));
  const pick = document.getElementById('cv-shared-pick');
  const pickTxt = pick?.style.display !== 'none' ? pick.textContent : '';
  window._cvAddSharedCol('_b', gid); await new Promise(r => setTimeout(r, 600));
  const th = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  const td = document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${gid}"]`);
  const on = td ? td.querySelectorAll('span,button').length : -1;
  return { pickTxt, th, tdHtml: td ? td.innerHTML.slice(0, 400) : null };
}, gid);
ck('★「列を追加」に共有列の候補が出る', /習得度/.test(r2.pickTxt), r2.pickTxt);
ck('★ リストBの表に共有列の見出しが出る', r2.th);
ck('リストBの行にセルがある', !!r2.tdHtml, r2.tdHtml);

const r3 = await pg.evaluate(async (gid) => {
  window._cvSetCell('_b', 'v2', gid, 4);
  return { v2: window.videos[1].cf?.[gid], bRow: JSON.parse(localStorage.getItem('wk_cv_views')).find(v => v.id === '_b').rowData };
}, gid);
ck('★ リストBで直した値は動画に入る（どこでも同じ値）', r3.v2 === 4, JSON.stringify(r3));
ck('共有列の値はリストの rowData に書かない', !r3.bRow.v2 || r3.bRow.v2[gid] === undefined, JSON.stringify(r3.bRow));

console.log('\n── 列名を変えると全部に反映 ──');
const r4 = await pg.evaluate((gid) => {
  const views = window._cvGetViews();
  const colB = views.find(v => v.id === '_b').columns.find(c => c.id === gid);
  colB.label = '習得度2'; colB.options = undefined;
  window._cvSave();
  const colA = views.find(v => v.id === '_a').columns.find(c => c.id === gid);
  const savedA = JSON.parse(localStorage.getItem('wk_cv_views')).find(v => v.id === '_a').columns[0];
  return { a: colA.label, snap: savedA.def?.label };
}, gid);
ck('★ リストBで変えた列名がリストAでも同じ', r4.a === '習得度2', JSON.stringify(r4));
ck('リストAの写し(def)も新しい名前', r4.snap === '習得度2', JSON.stringify(r4));

console.log('\n── マスターで使う ──');
const r5 = await pg.evaluate(async (gid) => {
  window._cvClearSelection(); await new Promise(r => setTimeout(r, 300));
  window._libView?.('org'); await new Promise(r => setTimeout(r, 800));
  const addBtn = !!document.querySelector('#orgTheadRow .cv-custom-th button[onclick*="__master__"]');
  window._cvAddSharedCol('__master__', gid); await new Promise(r => setTimeout(r, 800));
  const th = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  const td = !!document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${gid}"]`);
  window._cvSetCell('__master__', 'v3', gid, 2);
  // マスターで新しい列を作る → 必ず共有列
  window.cvOpenAddCol('__master__'); await new Promise(r => setTimeout(r, 100));
  const optHidden = !document.getElementById('cv-shared-opt') && !document.getElementById('cv-new-col-shared');
  document.querySelector('#cv-type-grid .cv-type-btn[data-type="checkbox"]').click();
  document.getElementById('cv-new-col-label').value = 'マスター専用チェック';
  window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 800));
  const raw = window._cvSharedRaw();
  return { addBtn, th, td, v3: window.videos[2].cf, optHidden, raw,
    masterThs: [...document.querySelectorAll('#orgTheadRow .cv-custom-th[data-col-id]')].map(e => e.dataset.colId) };
}, gid);
ck('★ マスターの表に「＋ 列を追加」がある', r5.addBtn);
ck('★ マスターの表に共有列の見出しが出る', r5.th, JSON.stringify(r5.masterThs));
ck('★ マスターの行にセルが出る', r5.td);
ck('マスターで入れた値も動画に入る', r5.v3?.[gid] === 2 && r5.v3.keep === 1, JSON.stringify(r5.v3));
ck('「共有列にする」の選択は無い（新しい列は必ず共有列 v52.887）', r5.optHidden);
const mc = r5.raw.cols.find(c => c.label === 'マスター専用チェック');
ck('★ マスターで作った列は共有列の定義になる', !!mc && mc.type === 'checkbox', JSON.stringify(r5.raw.cols));
ck('マスターの列一覧に2列入る', r5.raw.master.columns.length === 2 && r5.masterThs.length === 2, JSON.stringify(r5.raw.master));

console.log('\n── マスターの列メニュー ──');
const r5b = await pg.evaluate(async (gid) => {
  const before = [...window.orgColOrder];
  const html = window._cvGetUnifiedMenuHTML() || '';
  // 標準列を1つ動かす → orgColOrder は同じ集合の並べ替えのまま
  const vis = before.filter(id => window.orgColVisibility[id] !== false);
  window.orgMoveColOverride(vis[1], -1); await new Promise(r => setTimeout(r, 300));
  const after = [...window.orgColOrder];
  // 共有列を先頭へ
  for (let i = 0; i < 20; i++) window._cvUnifiedMoveCol(gid, -1);
  await new Promise(r => setTimeout(r, 300));
  const ths = [...document.querySelectorAll('#orgTheadRow th[data-col]')].map(e => e.dataset.col);
  return { hasShared: /習得度2/.test(html) && /共有/.test(html), same: [...before].sort().join() === [...after].sort().join(),
           moved: after[0] === vis[1], first: ths[0], order: window._cvSharedRaw().master.unifiedOrder.slice(0, 3) };
}, gid);
ck('マスターの列メニューに共有列が出る', r5b.hasShared);
ck('★ マスターで標準列を動かしても orgColOrder は同じ列の並べ替えのまま', r5b.same && r5b.moved, JSON.stringify(r5b));
ck('★ 共有列を先頭へ動かすと表の先頭に来る（並びは保存される）', r5b.first === 'cv:' + gid && r5b.order[0] === gid, JSON.stringify(r5b));

console.log('\n── 外しても値は消えない ──');
const r6 = await pg.evaluate(async (gid) => {
  window._cvPickerSelect('_b'); await new Promise(r => setTimeout(r, 600));
  const th = document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  th.click(); await new Promise(r => setTimeout(r, 200));
  const btn = [...document.querySelectorAll('#cv-th-dropdown button')].find(x => /このリストから外す/.test(x.textContent));
  const hasDel = [...document.querySelectorAll('#cv-th-dropdown button')].some(x => /列を削除/.test(x.textContent));
  btn?.click(); await new Promise(r => setTimeout(r, 600));
  const b = JSON.parse(localStorage.getItem('wk_cv_views')).find(v => v.id === '_b');
  return { found: !!btn, hasDel, bCols: b.columns, v1: window.videos[0].cf?.[gid], v2: window.videos[1].cf?.[gid],
           still: window._cvSharedRaw().cols.some(c => c.id === gid) };
}, gid);
ck('共有列のメニューは「外す」（「削除」ではない）', r6.found && !r6.hasDel, JSON.stringify(r6));
ck('リストBから外れる', r6.bCols.length === 0, JSON.stringify(r6.bCols));
ck('★ 動画の値は残る', r6.v1 === 3 && r6.v2 === 4, JSON.stringify(r6));
ck('★ 共有列の定義も残る（他のリストとマスターで使っている）', r6.still);

console.log('\n── クラウドとのやりとり ──');
const r7 = await pg.evaluate((gid) => {
  const before = window._cvSharedRaw();
  window._cvApplySharedRemote({ cols: [{ id:'gc_remote1', type:'text', label:'他端末の列' }], master: { columns: [], unifiedOrder: [] } });
  const after = window._cvSharedRaw();
  const bad1 = window._cvApplySharedRemote(null);
  const bad2 = window._cvApplySharedRemote({ cols: 'x' });
  return { before: before.cols.length, after: after.cols.map(c => c.id), master: after.master.columns.length, bad1, bad2 };
}, gid);
ck('★ クラウドの定義は足し合わせ（手元の列も残る）', r7.after.includes('gc_remote1') && r7.after.includes(gid) && r7.after.length === r7.before + 1, JSON.stringify(r7));
ck('★ 空のマスターで手元のマスター列を消さない', r7.master === 2, JSON.stringify(r7));
ck('壊れた値は受け取らない', r7.bad1 === false && r7.bad2 === false);

console.log('\n── 定義が消えても写しから戻る ──');
const r8 = await pg.evaluate(async (gid) => {
  const raw = JSON.parse(localStorage.getItem('wk_cv_views'));
  // 定義が無い状態で読み込む（他端末の古い保存で消えた想定）
  localStorage.setItem('wk_cv_shared', JSON.stringify({ cols: [], master: { columns: [], unifiedOrder: [] } }));
  return raw.find(v => v.id === '_a').columns[0].def;
}, gid);
await pg.reload({ waitUntil: 'domcontentloaded' }); await wait(2500);
const r9 = await pg.evaluate((gid) => {
  const a = window._cvGetViews().find(v => v.id === '_a');
  const col = a.columns.find(c => c.id === gid);
  return { type: col?.type, label: col?.label, lib: (window._cvSharedRaw()?.cols || []).map(c => c.id) };
}, gid);
ck('★ リストAに残った写しから定義が復元される', r9.type === 'stars' && r9.label === '習得度2' && r9.lib.includes(gid), JSON.stringify({ r8, r9 }));

console.log('\n── テンプレートにしても同じ共有列を使う ──');
const r10 = await pg.evaluate((gid) => {
  const _p = window.prompt; window.prompt = () => 'テンプレA';
  window._cvSaveAsTemplate('_a');
  window.prompt = _p;
  const tpls = JSON.parse(localStorage.getItem('wk_cv_user_tpls') || '[]');
  return tpls[tpls.length - 1]?.columns;
}, gid);
ck('テンプレートには「どの共有列か」だけが入る', r10?.[0]?.shared === true && r10[0].sharedId === gid && !r10[0].type, JSON.stringify(r10));
ck('共有でない列はこれまで通り定義ごと入る', r10?.[1]?.type === 'text' && !r10[1].id, JSON.stringify(r10));

console.log('\n── ① 選択肢の名前を変えると、入力済みの値も変わる（タグと同じ）──');
const o1 = await pg.evaluate(async () => {
  window.videos = window.videos && window.videos.length ? window.videos : [];
  if (!window.videos.find(v => v.id === 'v1')) window.videos.push({ id:'v1', title:'A', addedAt:'2026-01-01' }, { id:'v2', title:'B', addedAt:'2026-01-02' }, { id:'v3', title:'C', addedAt:'2026-01-03' });
  window.__vsaves = 0; window.debounceSave = () => { window.__vsaves++; };
  window._cvPickerSelect('_a'); await new Promise(r => setTimeout(r, 600));
  const mk = async (type, label) => {
    window.cvOpenAddCol('_a'); await new Promise(r => setTimeout(r, 100));
    document.querySelector(`#cv-type-grid .cv-type-btn[data-type="${type}"]`).click();
    document.getElementById('cv-new-col-label').value = label;
    window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 500));
    return window._cvSharedRaw().cols.find(c => c.label === label).id;
  };
  const sel = await mk('select', 'フェーズ');
  const mul = await mk('multiselect', '技');
  window._cvSetCell('_a', 'v1', sel, 'A'); window._cvSetCell('_a', 'v2', sel, 'B'); window._cvSetCell('_a', 'v3', sel, 'C');
  window._cvSetCell('_a', 'v1', mul, ['A', 'B']);
  // 画面から: 見出しメニューで1つ目の選択肢 A を「ガード」に書き換えて保存
  const th = document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${sel}"]`);
  th.click(); await new Promise(r => setTimeout(r, 200));
  const inp = document.querySelector('#cv-th-dropdown input[type="text"]');
  inp.value = 'ガード'; inp.dispatchEvent(new Event('input'));
  [...document.querySelectorAll('#cv-th-dropdown button')].find(b => b.textContent === '保存').click();
  await new Promise(r => setTimeout(r, 600));
  const r1 = { v1: window.videos[0].cf[sel], v2: window.videos[1].cf[sel], opts: window._cvSharedRaw().cols.find(c => c.id === sel).options,
               cell: document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${sel}"]`)?.textContent || '' };
  // 取り消し
  document.querySelector('#toast .toast-undo-btn')?.click(); await new Promise(r => setTimeout(r, 500));
  const r2 = { v1: window.videos[0].cf[sel], opts: window._cvSharedRaw().cols.find(c => c.id === sel).options };
  // 入れ替え B↔C
  window._cvRenameOptions('_a', sel, ['A', 'C', 'B'], { B: 'C', C: 'B' }); await new Promise(r => setTimeout(r, 300));
  const r3 = { v2: window.videos[1].cf[sel], v3: window.videos[2].cf[sel] };
  // 取り消しの後にまた変えたセルは戻さない
  window._cvRenameOptions('_a', sel, ['Z', 'C', 'B'], { A: 'Z' }); await new Promise(r => setTimeout(r, 300));
  window._cvSetCell('_a', 'v1', sel, 'B');
  document.querySelector('#toast .toast-undo-btn')?.click(); await new Promise(r => setTimeout(r, 300));
  const r4 = { v1: window.videos[0].cf[sel] };
  // マルチセレクト: A を B にまとめる → 重ならない
  window._cvRenameOptions('_a', mul, ['B', 'C'], { A: 'B' }); await new Promise(r => setTimeout(r, 300));
  const r5 = { v1: window.videos[0].cf[mul] };
  // 選択肢を消しても値は残る
  window._cvRenameOptions('_a', sel, ['C'], {}); await new Promise(r => setTimeout(r, 300));
  const r6 = { v1: window.videos[0].cf[sel], v2: window.videos[1].cf[sel] };
  // リストだけの列（旧データ）も rowData で付け替わる
  const b = window._cvGetViews().find(v => v.id === '_b');
  b.columns.push({ id:'col201', type:'select', label:'段階', options:['A','B'] }); b.rowData.v1 = { col201: 'A' }; window._cvSave();
  window._cvRenameOptions('_b', 'col201', ['Q', 'B'], { A: 'Q' }); await new Promise(r => setTimeout(r, 300));
  const r7 = { v1: window._cvGetViews().find(v => v.id === '_b').rowData.v1.col201 };
  return { r1, r2, r3, r4, r5, r6, r7, saves: window.__vsaves };
});
ck('★ 画面で A→ガード にすると、A だった動画の値もガードになる', o1.r1.v1 === 'ガード' && o1.r1.v2 === 'B', JSON.stringify(o1.r1));
ck('選択肢の一覧もガードになる', JSON.stringify(o1.r1.opts) === JSON.stringify(['ガード','B','C']), JSON.stringify(o1.r1.opts));
ck('表のセルにもガードと出る', /ガード/.test(o1.r1.cell), o1.r1.cell);
ck('★ 取り消すと値も選択肢も元どおり', o1.r2.v1 === 'A' && JSON.stringify(o1.r2.opts) === JSON.stringify(['A','B','C']), JSON.stringify(o1.r2));
ck('★ 入れ替え（B↔C）が正しく入れ替わる', o1.r3.v2 === 'C' && o1.r3.v3 === 'B', JSON.stringify(o1.r3));
ck('★ 取り消しは、その後に変えたセルを戻さない', o1.r4.v1 === 'B', JSON.stringify(o1.r4));
ck('マルチセレクトでまとめても重ならない', JSON.stringify(o1.r5.v1) === JSON.stringify(['B']), JSON.stringify(o1.r5));
ck('★ 選択肢を消しても、入力済みの値は消えない', o1.r6.v1 === 'Z' || o1.r6.v1 === 'B', JSON.stringify(o1.r6));
ck('リストだけの列（旧データ）も付け替わる', o1.r7.v1 === 'Q', JSON.stringify(o1.r7));
ck('共有列の付け替えは動画の保存を呼ぶ', o1.saves >= 1, o1.saves);

console.log('\n── ② 既存の列をすべて共有列にまとめる ──');
const u1 = await pg.evaluate(async () => {
  const views = window._cvGetViews();
  const a = views.find(v => v.id === '_a'), b = views.find(v => v.id === '_b');
  a.columns.push({ id:'col401', type:'text', label:'課題' }, { id:'col402', type:'checkbox', label:'やった' }, { id:'col404', type:'multiselect', label:'メニュー', options:['X'] });
  a.rowData.v1 = { ...(a.rowData.v1 || {}), col401:'先', col402:false, col404:['X'] };
  a.rowData.v2 = { ...(a.rowData.v2 || {}), col401:'aのv2' };
  a.rowData.nope = { col401:'動画が無い' };
  b.columns.push({ id:'col501', type:'text', label:'課題 ' }, { id:'col502', type:'checkbox', label:'やった' }, { id:'col503', type:'text', label:'課題' },
                 { id:'col504', type:'multiselect', label:'メニュー', options:['Y'] }, { id:'col505', type:'number', label:'課題' });
  b.rowData.v1 = { ...(b.rowData.v1 || {}), col501:'後', col502:true, col504:['Y'], col505:0 };
  b.rowData.v3 = { col501:'bのv3' };
  window._cvSave();
  window.cvOpenAddCol('_b'); await new Promise(r => setTimeout(r, 100));
  const banner = document.getElementById('cv-shared-pick')?.textContent || '';
  window.cvCloseAddColModal();
  const plan = window._cvUnifyPlan();
  const before = JSON.stringify(views.map(v => v.rowData));
  const n = window._cvUnifyAllCols(true); await new Promise(r => setTimeout(r, 500));
  const saved = JSON.parse(localStorage.getItem('wk_cv_views'));
  const local = saved.flatMap(v => v.columns.filter(c => !c.shared).map(c => v.id + ':' + c.id));
  const aCols = saved.find(v => v.id === '_a').columns.map(c => c.id), bCols = saved.find(v => v.id === '_b').columns.map(c => c.id);
  const lib = window._cvSharedRaw().cols;
  const idOf = (t, l) => lib.find(c => c.type === t && c.label === l)?.id;
  const kadai = idOf('text', '課題'), yatta = idOf('checkbox', 'やった'), menu = idOf('multiselect', 'メニュー'), num = idOf('number', '課題');
  const cf = id => window.videos.map(v => v.cf && v.cf[id]);
  const after = JSON.stringify(saved.map(v => v.rowData));
  return { banner, plan, n, local, aCols, bCols, kadai, yatta, menu, num, kadaiVals: cf(kadai), yattaVals: cf(yatta), menuVals: cf(menu), numVals: cf(num),
    menuOpts: lib.find(c => c.id === menu)?.options, rowKept: before === after, sharedFrom: saved.find(v => v.id === '_b').sharedFrom?.length,
    again: window._cvUnifyAllCols(true) };
});
ck('「列を追加」に、まだ共有でない列の数とまとめるボタンが出る', /まだ共有列になっていない列が/.test(u1.banner), u1.banner);
ck('★ まとめた後、共有でない列は1つも残らない', u1.local.length === 0, JSON.stringify(u1.local));
ck('★ 同じ種類・同じ名前の列は1つの共有列になる（名前の前後の空白は無視）', !!u1.kadai && u1.aCols.includes(u1.kadai) && u1.bCols.includes(u1.kadai), JSON.stringify(u1));
ck('同じリストに同じ列が2つあっても1列にまとまる', u1.bCols.filter(x => x === u1.kadai).length === 1, JSON.stringify(u1.bCols));
ck('名前が同じでも種類が違えば別の列', !!u1.num && u1.num !== u1.kadai, JSON.stringify([u1.kadai, u1.num]));
ck('★ 食い違いは先のリストの値（v1 は A の「先」）', u1.kadaiVals[0] === '先', JSON.stringify(u1.kadaiVals));
ck('★ 片方にしか無い値も入る（v2=A・v3=B）', u1.kadaiVals[1] === 'aのv2' && u1.kadaiVals[2] === 'bのv3', JSON.stringify(u1.kadaiVals));
ck('チェックはどれかでオンならオン', u1.yattaVals[0] === true, JSON.stringify(u1.yattaVals));
ck('マルチセレクトは足し合わせ・選択肢も足し合わせ', JSON.stringify(u1.menuVals[0]) === JSON.stringify(['X','Y']) && JSON.stringify(u1.menuOpts) === JSON.stringify(['X','Y']), JSON.stringify([u1.menuVals, u1.menuOpts]));
ck('数値の 0 は値として残る', u1.numVals[0] === 0, JSON.stringify(u1.numVals));
ck('確かめる画面の中身: 食い違いと、動画が無い行を数えている', u1.plan.some(p => p.label === '課題' && p.type === 'text' && p.conflicts === 1 && p.missing === 1), JSON.stringify(u1.plan));
ck('★ 元の値は各リストの rowData にそのまま残る', u1.rowKept);
ck('元の列の定義は sharedFrom に残る', u1.sharedFrom >= 5, u1.sharedFrom);
ck('もう一度押しても何も起きない', u1.again === 0, u1.again);

console.log('\n── テンプレートから作ったリストも共有列（同じ列を二重に作らない）──');
const t1 = await pg.evaluate(async () => {
  const mkView = async name => {
    window.cvOpenNewModal?.(); await new Promise(r => setTimeout(r, 100));
    const el = document.getElementById('cv-new-name'); el.value = name;
    window.cvConfirm(); await new Promise(r => setTimeout(r, 400));
  };
  await mkView('ドリル1'); await mkView('ドリル2');
  const views = window._cvGetViews();
  const d1 = views.find(v => v.label === 'ドリル1'), d2 = views.find(v => v.label === 'ドリル2');
  return { c1: d1?.columns.map(c => c.id + ':' + !!c.shared), c2: d2?.columns.map(c => c.id + ':' + !!c.shared),
           lib: window._cvSharedRaw().cols.filter(c => ['ドリルトラッカー','メニュー','今週やった'].includes(c.label)).map(c => c.type + ':' + c.label) };
});
ck('★ テンプレートの列も共有列で作られる', t1.c1?.length === 3 && t1.c1.every(x => x.endsWith(':true')), JSON.stringify(t1));
ck('★ 同じテンプレートで2つ作っても同じ共有列を使う', JSON.stringify(t1.c1) === JSON.stringify(t1.c2), JSON.stringify(t1));
ck('名前が同じでも種類が違う列（メニュー: セレクト/マルチ）は別', t1.lib.includes('select:メニュー') && t1.lib.includes('multiselect:メニュー'), JSON.stringify(t1.lib));

console.log('\n── 最後までのエラー ──');
errs.length ? errs.forEach(e => { console.log('  ✗ ' + e); fail++; }) : console.log('  ✓ なし');
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
