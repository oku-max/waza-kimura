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
  // 列設定を開く → ほかのリストで作ったカスタム列が、チェックの外れた状態で並んでいる → チェックを入れる
  window.toggleOrgColMenu(); await new Promise(r => setTimeout(r, 200));
  const row = document.querySelector(`#org-col-menu-panel .cv-colmenu-row[data-cv-id="${gid}"]`);
  const box = row?.querySelector('input[type=checkbox]');
  const pickTxt = row ? row.textContent + (box.checked ? ' [checked]' : ' [unchecked]') : '';
  box.checked = true; box.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 600));
  document.getElementById('org-col-menu')?.remove();
  const th = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  const td = document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${gid}"]`);
  const on = td ? td.querySelectorAll('span,button').length : -1;
  return { pickTxt, th, tdHtml: td ? td.innerHTML.slice(0, 400) : null };
}, gid);
ck('★ 列設定に、ほかのリストで作ったカスタム列がチェックの外れた状態で並ぶ', /習得度/.test(r2.pickTxt) && /カスタム/.test(r2.pickTxt) && /\[unchecked\]/.test(r2.pickTxt), r2.pickTxt);
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
  const addBtn = !document.querySelector('#orgTheadRow .cv-custom-th button') && !/列を追加/.test(document.getElementById('orgTheadRow')?.textContent || '');
  window._cvUnifiedSetVis(gid, true); await new Promise(r => setTimeout(r, 800));
  const th = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  const td = !!document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${gid}"]`);
  window._cvSetCell('__master__', 'v3', gid, 2);
  // マスターで新しい列を作る → 必ず共有列
  window.toggleOrgColMenu(); await new Promise(r => setTimeout(r, 200));
  document.querySelector('#org-col-menu-panel .cv-newcol').click(); await new Promise(r => setTimeout(r, 100));
  const optHidden = !document.getElementById('cv-shared-opt') && !document.getElementById('cv-new-col-shared');
  document.querySelector('#cv-type-grid .cv-type-btn[data-type="checkbox"]').click();
  document.getElementById('cv-new-col-label').value = 'マスター専用チェック';
  const h2 = document.querySelector('#cv-add-col-modal h2').textContent;
  window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 800));
  const menuHasNew = /マスター専用チェック/.test(document.getElementById('org-col-menu-panel')?.textContent || '');
  document.getElementById('org-col-menu')?.remove();
  const raw = window._cvSharedRaw();
  return { addBtn, th, td, v3: window.videos[2].cf, optHidden, raw, h2, menuHasNew,
    masterThs: [...document.querySelectorAll('#orgTheadRow .cv-custom-th[data-col-id]')].map(e => e.dataset.colId) };
}, gid);
ck('★ 表の右端に「＋ 列を追加」は無い（入口は列設定だけ）', r5.addBtn);
ck('列設定の「＋ カスタム列を作る」で作る画面が開く（見出し「カスタム列を作る」）', r5.h2 === 'カスタム列を作る', r5.h2);
ck('作った列が、開いている列設定の一覧にすぐ出る', r5.menuHasNew);
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
  return { hasShared: /習得度2/.test(html) && /カスタム/.test(html) && !/共有/.test(html) && !/▲|▼/.test(html), same: [...before].sort().join() === [...after].sort().join(),
           moved: after[0] === vis[1], first: ths[0], order: window._cvSharedRaw().master.unifiedOrder.slice(0, 3) };
}, gid);
ck('マスターの列設定にカスタム列が出る（「共有」の言葉・▲▼ は無い）', r5b.hasShared);
ck('★ マスターで標準列を動かしても orgColOrder は同じ列の並べ替えのまま', r5b.same && r5b.moved, JSON.stringify(r5b));
ck('★ 共有列を先頭へ動かすと表の先頭に来る（並びは保存される）', r5b.first === 'cv:' + gid && r5b.order[0] === gid, JSON.stringify(r5b));

console.log('\n── 外しても値は消えない ──');
const r6 = await pg.evaluate(async (gid) => {
  window._cvPickerSelect('_b'); await new Promise(r => setTimeout(r, 600));
  const th = document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`);
  th.click(); await new Promise(r => setTimeout(r, 200));
  const items = [...document.querySelectorAll('#cv-th-dropdown button')].map(x => x.textContent.trim());
  document.body.click();
  window.toggleOrgColMenu(); await new Promise(r => setTimeout(r, 200));
  const box = document.querySelector(`#org-col-menu-panel .cv-colmenu-row[data-cv-id="${gid}"] input[type=checkbox]`);
  box.checked = false; box.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 600));
  document.getElementById('org-col-menu')?.remove();
  const b = JSON.parse(localStorage.getItem('wk_cv_views')).find(v => v.id === '_b');
  return { items, bCols: b.columns, th: !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${gid}"]`),
           v1: window.videos[0].cf?.[gid], v2: window.videos[1].cf?.[gid], still: window._cvSharedRaw().cols.some(c => c.id === gid) };
}, gid);
ck('見出しのメニューは 並べ替え・絞り込み・✎ だけ（削除・外す・この表に出さない・列名を変更 は無い）',
  r6.items.some(t => /昇順/.test(t)) && r6.items.some(t => /降順/.test(t)) && r6.items.some(t => /名前・選択肢を直す/.test(t)) &&
  !r6.items.some(t => /削除|外す|出さない|列名を変更|共有/.test(t)), JSON.stringify(r6.items));
ck('列設定でチェックを外すと、リストBの表から消える（参照は残して隠すだけ）', !r6.th && r6.bCols.some(c => c.id === gid && c.hidden), JSON.stringify(r6.bCols));
ck('★ 動画の値は残る', r6.v1 === 3 && r6.v2 === 4, JSON.stringify(r6));
ck('★ 共有列の定義も残る（他のリストとマスターで使っている）', r6.still);

console.log('\n── 列設定の見た目（v52.887）──');
const g1 = await pg.evaluate(async (gid) => {
  window._cvPickerSelect('_a'); await new Promise(r => setTimeout(r, 600));
  const btn = document.querySelector('.org-col-vis-btn')?.textContent.trim();
  const ths = [...document.querySelectorAll('#orgTheadRow th')].map(t => ({ col: t.dataset.col || t.dataset.colId, ic: !!t.querySelector('.cv-col-ic') }));
  window.toggleOrgColMenu(); await new Promise(r => setTimeout(r, 200));
  const panel = document.getElementById('org-col-menu-panel');
  const rows = [...panel.querySelectorAll('.cv-colmenu-row')].map(r => ({ id: r.dataset.cvId, ic: !!r.querySelector('.cv-col-ic'),
    badge: !!r.querySelector('.cv-cbadge'), type: r.querySelector('.cv-col-type')?.textContent || '', edit: !!r.querySelector('button.cv-col-edit') }));
  const arrows = /▲|▼/.test(panel.textContent);
  const create = panel.querySelector('.cv-newcol')?.textContent.trim();
  document.getElementById('org-col-menu')?.remove();
  return { btn, ths, rows, arrows, create };
}, gid);
ck('★ ボタンの名前が「列設定」', g1.btn === '列設定', g1.btn);
ck('表の見出しに種類のアイコンが付く（標準の列もカスタム列も）', g1.ths.filter(t => t.col).every(t => t.ic), JSON.stringify(g1.ths));
const cRow = g1.rows.find(r => r.id === gid), sRow = g1.rows.find(r => r.id === 'channel');
ck('★ カスタム列の行: アイコン・「カスタム」の印・種類名・✎', cRow && cRow.ic && cRow.badge && cRow.type === '評価' && cRow.edit, JSON.stringify(cRow));
ck('★ 最初からある列の行: アイコンだけ（印・種類名・✎ なし）', sRow && sRow.ic && !sRow.badge && !sRow.type && !sRow.edit, JSON.stringify(sRow));
ck('並べ替えの ▲▼ は無い（⠿ のドラッグだけ）', !g1.arrows);
ck('一番下に「＋ カスタム列を作る」', g1.create === '＋ カスタム列を作る', g1.create);

console.log('\n── ✎ カスタム列を直す ──');
const e1 = await pg.evaluate(async () => {
  window.cvOpenAddCol('_a'); await new Promise(r => setTimeout(r, 100));
  document.querySelector('#cv-type-grid .cv-type-btn[data-type="select"]').click();
  document.getElementById('cv-new-col-label').value = '段階X';
  window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 500));
  const id = window._cvSharedRaw().cols.find(c => c.label === '段階X').id;
  window._cvSetCell('_a', 'v1', id, 'A'); window._cvSetCell('_a', 'v2', id, 'B');
  window._cvOpenColEdit('_a', id); await new Promise(r => setTimeout(r, 100));
  const ov = document.getElementById('cv-col-edit');
  const title = ov.querySelector('h2').textContent;
  const inp = ov.querySelectorAll('#cv-ce-opts input')[0];
  inp.value = 'ガードA'; inp.dispatchEvent(new Event('input'));
  const lab = ov.querySelector('#cv-ce-label'); lab.value = '段階Y'; lab.dispatchEvent(new Event('input'));
  ov.querySelector('#cv-ce-save').click(); await new Promise(r => setTimeout(r, 500));
  const d = window._cvSharedRaw().cols.find(c => c.id === id);
  return { id, title, label: d.label, opts: d.options, v1: window.videos[0].cf[id], v2: window.videos[1].cf[id], closed: !document.getElementById('cv-col-edit') };
});
ck('✎ の画面の見出しは「カスタム列を直す」', e1.title === 'カスタム列を直す', e1.title);
ck('★ ✎ で選択肢 A→ガードA にすると入力済みの値も変わる', e1.v1 === 'ガードA' && e1.v2 === 'B' && JSON.stringify(e1.opts) === JSON.stringify(['ガードA','B','C']), JSON.stringify(e1));
ck('✎ で列名も変わる', e1.label === '段階Y' && e1.closed, JSON.stringify(e1));

console.log('\n── この列を非表示にする（値は消さない）──');
const h1 = await pg.evaluate(async (id) => {
  const before = JSON.stringify(window.videos.map(v => v.cf || null));
  window._cvOpenColEdit('_a', id); await new Promise(r => setTimeout(r, 100));
  const note = document.querySelector('#cv-col-edit .cv-col-danger')?.textContent || '';
  document.querySelector('#cv-ce-off').click(); await new Promise(r => setTimeout(r, 600));
  const thA = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${id}"]`);
  window.toggleOrgColMenu(); await new Promise(r => setTimeout(r, 200));
  const panel = document.getElementById('org-col-menu-panel');
  const inList = !!panel.querySelector(`.cv-colmenu-row[data-cv-id="${id}"]`);
  const offTxt = panel.querySelector('.cv-off')?.textContent || '';
  const after = JSON.stringify(window.videos.map(v => v.cf || null));
  const saved = JSON.parse(localStorage.getItem('wk_cv_shared')).cols.find(c => c.id === id);
  // 表示に戻す
  panel.querySelector('.cv-off-back').click(); await new Promise(r => setTimeout(r, 600));
  const back = !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${id}"]`);
  const backInList = !!document.querySelector(`#org-col-menu-panel .cv-colmenu-row[data-cv-id="${id}"]`);
  document.getElementById('org-col-menu')?.remove();
  return { note, thA, inList, offTxt, same: before === after, savedOff: saved.off, back, backInList };
}, e1.id);
ck('非表示の説明に「値は消えません」と本数が出る', /入力した値は消えません/.test(h1.note) && /本の動画に値あり/.test(h1.note), h1.note);
ck('★ 非表示にすると表から消える', !h1.thA);
ck('★ 列設定の一覧からも消え、一番下の「非表示の列」に出る', !h1.inList && /非表示の列（1）/.test(h1.offTxt) && /段階Y/.test(h1.offTxt), h1.offTxt);
ck('★ 非表示にしても動画の値は1文字も変わらない', h1.same);
ck('非表示は定義に残る（全端末に同期される）', h1.savedOff === true, h1.savedOff);
ck('★「表示する」で表にも一覧にも戻る', h1.back && h1.backInList, JSON.stringify(h1));

console.log('\n── 前の版の「リストだけの列」を読み込み時に自動でまとめる ──');
const a1 = await pg.evaluate(async () => {
  const views = window._cvGetViews();
  const b = views.find(v => v.id === '_b');
  b.columns.push({ id:'col901', type:'text', label:'自動まとめ' }); b.rowData.v1 = { ...(b.rowData.v1 || {}), col901:'元の値' };
  const a = views.find(v => v.id === '_a');
  a.columns.push({ id:'col902', type:'text', label:'自動まとめ' });
  window._cvSave();
  const n = window._cvAutoUnify();
  const n2 = window._cvAutoUnify();
  const lib = window._cvSharedRaw().cols.filter(c => c.label === '自動まとめ');
  const saved = JSON.parse(localStorage.getItem('wk_cv_views'));
  return { n, n2, lib: lib.map(c => c.id), aHas: saved.find(v => v.id === '_a').columns.some(c => c.id === lib[0]?.id && c.shared),
           bHas: saved.find(v => v.id === '_b').columns.some(c => c.id === lib[0]?.id && c.shared),
           v1: window.videos[0].cf[lib[0]?.id], kept: saved.find(v => v.id === '_b').rowData.v1.col901 };
});
ck('★ 同じ種類・同じ名前の列が1つのカスタム列になり、両方のリストに出る', a1.n >= 1 && a1.lib.length === 1 && a1.aHas && a1.bHas, JSON.stringify(a1));
ck('★ 値は動画に移り、元の値もリストに残る', a1.v1 === '元の値' && a1.kept === '元の値', JSON.stringify(a1));
ck('2回目は何もしない（1回きり）', a1.n2 === 0, a1.n2);

console.log('\n── この列を完全に削除する（値ごと・確認と取り消しつき v52.888）──');
const x1 = await pg.evaluate(async () => {
  // 2つのリストとマスターに出している列を作り、値を入れる
  window.cvOpenAddCol('_a'); await new Promise(r => setTimeout(r, 100));
  document.querySelector('#cv-type-grid .cv-type-btn[data-type="text"]').click();
  document.getElementById('cv-new-col-label').value = '消す列';
  window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 400));
  const id = window._cvSharedRaw().cols.find(c => c.label === '消す列').id;
  const b = window._cvGetViews().find(v => v.id === '_b'); b.columns.push({ id, shared: true }); window._cvApplyLoadedViews(window._cvGetViews());
  window._cvSetCell('_a', 'v1', id, 'あ'); window._cvSetCell('_a', 'v2', id, 'い');
  const other = window._cvSharedRaw().cols.find(c => c.label !== '消す列').id;
  const otherVals = JSON.stringify(window.videos.map(v => v.cf && v.cf[other]));
  // ✎ の画面から削除（確認は OK）
  window._cvOpenColEdit('_a', id); await new Promise(r => setTimeout(r, 100));
  const note = document.querySelector('#cv-col-edit .cv-col-danger')?.textContent || '';
  let asked = '';
  const _c = window.confirm; window.confirm = m => { asked = m; return true; };
  document.querySelector('#cv-ce-del').click(); await new Promise(r => setTimeout(r, 500));
  window.confirm = _c;
  const views = JSON.parse(localStorage.getItem('wk_cv_views'));
  const raw = window._cvSharedRaw();
  const r = { id, note, asked,
    inLib: raw.cols.some(c => c.id === id), tomb: raw.deleted.includes(id),
    inViews: views.some(v => (v.columns || []).some(c => c.id === id) || (v.unifiedOrder || []).includes(id)),
    th: !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${id}"]`),
    valBeforeFlush: window.videos[0].cf[id] };
  // 取り消し → 全部戻る
  window.__cvLastDeleteUndo(); await new Promise(r => setTimeout(r, 500));
  const raw2 = window._cvSharedRaw();
  r.undo = { inLib: raw2.cols.some(c => c.id === id), tomb: raw2.deleted.includes(id), v1: window.videos[0].cf[id],
    inA: window._cvGetViews().find(v => v.id === '_a').columns.some(c => c.id === id),
    inB: window._cvGetViews().find(v => v.id === '_b').columns.some(c => c.id === id),
    th: !!document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${id}"]`) };
  // もう一度削除して、値を消すところまで
  window._cvDeleteCol(id, true); await new Promise(r => setTimeout(r, 300));
  window._cvFlushDeletes();
  r.after = { v1: window.videos[0].cf[id], v2: window.videos[1].cf[id], has: window.videos.some(v => v.cf && id in v.cf),
    otherSame: JSON.stringify(window.videos.map(v => v.cf && v.cf[other])) === otherVals };
  // 写し(def)を持った参照が残っていても、復活しない
  const a = window._cvGetViews().find(v => v.id === '_a');
  a.columns.push({ id, shared: true, def: { type: 'text', label: '消す列' } });
  window._cvApplyLoadedViews(window._cvGetViews());
  r.noHeal = !window._cvSharedRaw().cols.some(c => c.id === id) && !window._cvGetViews().find(v => v.id === '_a').columns.some(c => c.id === id);
  // 別の端末から削除した印が届いた場合
  window._cvApplySharedRemote({ cols: [{ id: 'gc_rmdel', type: 'text', label: '別端末で消す' }], master: { columns: [], unifiedOrder: [] } });
  window._cvUnifiedSetVis('gc_rmdel', true);
  const had = window._cvGetViews().find(v => v.id === '_a').columns.some(c => c.id === 'gc_rmdel');
  window._cvApplySharedRemote({ cols: [], deleted: ['gc_rmdel'], master: { columns: [], unifiedOrder: [] } });
  r.remote = had && !window._cvSharedRaw().cols.some(c => c.id === 'gc_rmdel') && !window._cvGetViews().some(v => v.columns.some(c => c.id === 'gc_rmdel'));
  return r;
});
ck('✎ の画面に「完全に削除する」と、値も消えること・本数・取り消しの説明が出る', /完全に削除する/.test(x1.note) && /値（2 本）も消えます/.test(x1.note) && /取り消し/.test(x1.note), x1.note);
ck('★ 押すと本数つきで確かめる', /完全に削除しますか/.test(x1.asked) && /2本の動画に入っている値も消えます/.test(x1.asked), x1.asked);
ck('★ 定義・全リスト・マスターから消え、削除した印が残る', !x1.inLib && x1.tomb && !x1.inViews && !x1.th, JSON.stringify(x1));
ck('値は取り消しの時間が過ぎるまで消さない', x1.valBeforeFlush === 'あ', x1.valBeforeFlush);
ck('★ 取り消すと、定義・両方のリスト・値・表示が全部戻る', x1.undo.inLib && !x1.undo.tomb && x1.undo.v1 === 'あ' && x1.undo.inA && x1.undo.inB && x1.undo.th, JSON.stringify(x1.undo));
ck('★ 取り消しの時間が過ぎると、その列の値だけが動画から消える（ほかの列の値は1文字も変わらない）', x1.after.v1 === undefined && !x1.after.has && x1.after.otherSame, JSON.stringify(x1.after));
ck('★ 削除した列は、リストに残った写しから復活しない', x1.noHeal);
ck('★ 別の端末で削除した印が届くと、この端末からも消える', x1.remote);

console.log('\n── カウンター（−/数字/＋・押した日時も記録 v52.889）──');
const k1 = await pg.evaluate(async () => {
  window._cvPickerSelect('_a'); await new Promise(r => setTimeout(r, 500));
  window.cvOpenAddCol('_a'); await new Promise(r => setTimeout(r, 100));
  const btn = document.querySelector('#cv-type-grid .cv-type-btn[data-type="counter"]');
  const label = btn?.textContent || '';
  btn.click();
  document.getElementById('cv-new-col-label').value = 'スパーで使った回数';
  window.cvConfirmAddCol(); await new Promise(r => setTimeout(r, 500));
  const id = window._cvSharedRaw().cols.find(c => c.label === 'スパーで使った回数').id;
  const td = () => document.querySelector(`#org-row-v1 .cv-custom-td[data-col-id="${id}"]`);
  const other = JSON.stringify(window.videos.map(v => Object.fromEntries(Object.entries(v.cf || {}).filter(([k]) => k !== id))));
  td().querySelector('.cv-cnt-inc').click(); td().querySelector('.cv-cnt-inc').click(); td().querySelector('.cv-cnt-inc').click();
  const after3 = { n: window.videos[0].cf[id], log: window.videos[0].cfLog?.[id]?.length, shown: td().querySelector('.cv-cnt-n').textContent, ago: td().querySelector('.cv-cnt-ago')?.textContent || '' };
  td().querySelector('.cv-cnt-dec').click();
  const after2 = { n: window.videos[0].cf[id], log: window.videos[0].cfLog?.[id]?.length };
  // 0 から − は何もしない
  const td2 = document.querySelector(`#org-row-v2 .cv-custom-td[data-col-id="${id}"]`);
  td2.querySelector('.cv-cnt-dec').click();
  const zero = { n: window.videos[1].cf?.[id], log: window.videos[1].cfLog?.[id] };
  const icon = document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${id}"] .cv-col-ic`)?.textContent;
  const same = JSON.stringify(window.videos.map(v => Object.fromEntries(Object.entries(v.cf || {}).filter(([k]) => k !== id)))) === other;
  // 絞り込み（2以上）・並べ替え
  window._cvSetCell('_a', 'v3', id, 0);
  const view = window._cvGetViews().find(v => v.id === '_a');
  // 削除すると記録も消える
  window._cvDeleteCol(id, true); await new Promise(r => setTimeout(r, 200)); window._cvFlushDeletes();
  const gone = !('cfLog' in window.videos[0]) || !(id in (window.videos[0].cfLog || {}));
  return { label, after3, after2, zero, icon, same, gone };
});
ck('★ 種類に「カウンター」がある', /カウンター/.test(k1.label), k1.label);
ck('★ ＋3回で 3・日時も3つ記録・画面にも 3 と「今日」', k1.after3.n === 3 && k1.after3.log === 3 && k1.after3.shown === '3' && /今日/.test(k1.after3.ago), JSON.stringify(k1.after3));
ck('★ −で 2・最後の記録を1つ取り消す', k1.after2.n === 2 && k1.after2.log === 2, JSON.stringify(k1.after2));
ck('0 のときの − は何もしない（何も書かない）', k1.zero.n === undefined && k1.zero.log === undefined, JSON.stringify(k1.zero));
ck('見出しのアイコンは ±', k1.icon === '±', k1.icon);
ck('ほかの列の値は触らない', k1.same);
ck('カウンター列を完全に削除すると、日時の記録も消える', k1.gone);

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
ck('列は全部カスタム列なので、テンプレートにも「どの列か」だけが入る（v52.887）', Array.isArray(r10) && r10.length > 1 && r10.every(c => c.shared && c.sharedId && !c.type), JSON.stringify(r10));

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
  // 画面から: 見出し → ✎ 名前・選択肢を直す で1つ目の選択肢 A を「ガード」に書き換えて保存
  const th = document.querySelector(`#orgTheadRow .cv-custom-th[data-col-id="${sel}"]`);
  th.click(); await new Promise(r => setTimeout(r, 200));
  [...document.querySelectorAll('#cv-th-dropdown button')].find(b => /名前・選択肢を直す/.test(b.textContent)).click();
  await new Promise(r => setTimeout(r, 150));
  const inp = document.querySelector('#cv-col-edit #cv-ce-opts input');
  inp.value = 'ガード'; inp.dispatchEvent(new Event('input'));
  document.querySelector('#cv-ce-save').click();
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

console.log('\n── ② 既存の列をすべてカスタム列にまとめる（まとめ方の中身）──');
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
  return { plan, n, local, aCols, bCols, kadai, yatta, menu, num, kadaiVals: cf(kadai), yattaVals: cf(yatta), menuVals: cf(menu), numVals: cf(num),
    menuOpts: lib.find(c => c.id === menu)?.options, rowKept: before === after, sharedFrom: saved.find(v => v.id === '_b').sharedFrom?.length,
    again: window._cvUnifyAllCols(true) };
});
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
