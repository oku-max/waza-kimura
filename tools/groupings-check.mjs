// ═══ グルーピング（v53.048・js/cv-groupings.js）が、本物のタグを正しく書き・取り消せ・端末をまたいで安全に同期すること ═══
// 使い方: node tools/groupings-check.mjs
// 本物の index.html と firebase.js を偽のクラウドにつなぐ。見るもの:
//   ・列のあいだを動かすと、その動画のそのグループの値だけが変わり、いつもの動画の保存（videos.json）に乗る
//   ・取り消しは、今の値が付けたときのままのときだけ戻す（その後に変えた値は消さない）
//   ・新しいタグは選択肢に足すだけ・新しいタググループは tagRegistry に入る（動画には触らない）
//   ・グルーピングは data/groupings の items.{id} に1件ずつ書く（ほかの欄・リスト・設定に触らない）・消すのは del の印
//   ・2端末: 開いたままの端末に届く／クラウドを読めない端末は書かない／ほかのアカウントの控えは送らない
//   ・バックアップの復元は足し合わせ・閉じた後のふつうの表は開く前と1文字も同じ
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8293;
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
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
await pg.waitForTimeout(2500);
ck('入口のボタンは無く、グルーピングの並び（すべて・＋ グルーピング）が最初から出ている', await until(() => pg.evaluate(() => !document.getElementById('svt-open-btn') && !!document.getElementById('svt-root') && document.getElementById('svt-tabs').textContent.includes('すべて') && document.getElementById('svt-tabs').textContent.includes('＋ グルーピング') && !document.getElementById('svt-root').textContent.includes('閉じる'))));
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const plainBefore = await pg.evaluate(() => document.getElementById('orgList').innerHTML);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(500);
const settingsBefore = JSON.stringify(CLOUD['users/u1/data/settings']);
ck('開くと「試験版」「何も保存しません」の文字は無い', await pg.evaluate(() => { const t = document.getElementById('svt-root').textContent; return !t.includes('試験') && !t.includes('何も保存しません'); }));
ck('「すべて」（分けない）のときはふだんのカード一覧がそのまま出る', await pg.evaluate(() => getComputedStyle(document.getElementById('cardList')).display !== 'none'));
const tbKey = await pg.evaluate(() => (wkGroupings._groupers().find(g => g.kind === 'tag' && g.sub === 'タグ1') || {}).key);
// ① タグ1のグルーピングを作る → 保存される（端末・クラウドの items.{id} の1件）
await pg.evaluate(k => { wkGroupings._new(); wkGroupings._en('タグ1別'); wkGroupings._eg(k); wkGroupings._es(); }, tbKey);
const g1 = await pg.evaluate(() => wkGroupings.list().find(e => e.name === 'タグ1別'));
ck('保存したグルーピングはこのリスト（マスター）の分として端末に入る', !!g1 && g1.list === 'master' && g1.gb === 'pick' && g1.picks.length === 3, g1);
ck('クラウドの data/groupings の items.{id} に入る', await until(() => !!(CLOUD[GDOC] && CLOUD[GDOC].items && CLOUD[GDOC].items[g1.id])), CLOUD[GDOC]);
ck('リストの文書（settings）には書かない', JSON.stringify(CLOUD['users/u1/data/settings']) === settingsBefore);
const c1 = await cols(pg);
ck('列: タグ1なし・ボトム・トップ・スタンディング（アーカイブは出さない）', c1.includes('その他=1') && c1.includes('ボトム=2') && c1.includes('スタンディング=1') && c1.includes('トップ=1'), c1);
// ② 動かす → 本物のタグが変わる・保存に乗る
await pg.evaluate(k => wkGroupings._move('v2', 'pick', 'ボトム', 'トップ'));
ck('動かすと本物のタグが変わる（ボトム→トップ・スタンディングは残る）', setEq(await vtb(pg, 'v2'), ['スタンディング', 'トップ']), await vtb(pg, 'v2'));
ck('ほかの動画・ほかのグループの値は変わらない', JSON.stringify(await vtb(pg, 'v1')) === '["ボトム"]' && JSON.stringify(await vtb(pg, 'v2', 'tags')) === '[]');
ck('いつもの動画の保存に乗る（videos.json）', await until(() => setEq((cloudVideos().find(v => v.id === 'v2') || {}).tb, ['スタンディング', 'トップ']), 8000), (cloudVideos().find(v => v.id === 'v2') || {}).tb);
const kb = await pg.evaluate(() => ({ btns: [...document.querySelectorAll('#svt-toast button')].map(b => b.textContent), msg: document.getElementById('svt-toast').textContent, up: [...document.querySelectorAll('#svt-sum button')].some(b => b.textContent.includes('1つ戻す')) }));
ck('お知らせは「「トップ」へ移動しました」・「「ボトム」にも残す」と「↶ 元に戻す」・上に「↶ 1つ戻す」', kb.msg.includes('「トップ」へ移動しました') && JSON.stringify(kb.btns) === JSON.stringify(['「ボトム」にも残す', '↶ 元に戻す']) && kb.up, kb);
await pg.evaluate(() => wkGroupings._tx());
ck('「にも残す」で元のタグも付く', setEq(await vtb(pg, 'v2'), ['スタンディング', 'トップ', 'ボトム']), await vtb(pg, 'v2'));
await pg.evaluate(() => wkGroupings._tu());
ck('お知らせの「元に戻す」は「にも残す」だけを戻す', setEq(await vtb(pg, 'v2'), ['スタンディング', 'トップ']), await vtb(pg, 'v2'));
await pg.keyboard.press('Control+z'); await pg.waitForTimeout(150);
ck('Ctrl+Z で動かす前に戻る', setEq(await vtb(pg, 'v2'), ['ボトム', 'スタンディング']), await vtb(pg, 'v2'));
// ②b カードの ▾（スマホでの付け外し）を本物のクリックで。「なし」の列のカードでも開く（v53.049 まで NUL の印が属性の中で化けて開かなかった）
const tbName = await pg.evaluate(k => wkGroupings._groupers().find(g => g.key === k).name, tbKey);
const dd = await pg.evaluate(() => { const col = [...document.querySelectorAll('#svt-root .svt-col')].find(c => c.dataset.name === 'その他');
  const btn = col.querySelector('.svt-card .svt-cardx .svt-sm'); const label = btn.textContent; btn.click();
  const card = [...document.querySelectorAll('#svt-root .svt-col')].find(c => c.dataset.name === 'その他').querySelector('.svt-card');
  return { label, opts: [...card.querySelectorAll('.svt-o')].map(b => b.textContent) }; });
ck('カードの ▾ はタググループの名前（「選んだタグ」ではない）で、押すと選んだタグが並ぶ（「なし」の列のカードでも）', dd.label.startsWith(tbName) && !dd.label.includes('選んだタグ') && dd.opts.length === 3, dd);
await pg.evaluate(() => { const card = [...document.querySelectorAll('#svt-root .svt-col')].find(c => c.dataset.name === 'その他').querySelector('.svt-card'); [...card.querySelectorAll('.svt-o')].find(b => b.textContent === 'トップ').click(); });
ck('並んだタグを押すとそのタグが付く', JSON.stringify(await vtb(pg, 'v4')) === '["トップ"]', await vtb(pg, 'v4'));
await pg.evaluate(() => wkGroupings._undo());
ck('（取り消して元に）', JSON.stringify(await vtb(pg, 'v4')) === '[]', await vtb(pg, 'v4'));
// ②c 見出しは縦にスクロールしても上に残る
const sticky = await pg.evaluate(async () => { const host = document.getElementById('lib-card-host'); host.style.height = '400px'; host.scrollTop = 0; const sb = document.getElementById('svt-body'); sb.style.minHeight = '2500px'; await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 100));
  const before = document.getElementById('svt-colhs').getBoundingClientRect().top;
  host.scrollTop = 600; await new Promise(r => setTimeout(r, 150));
  const lh = document.getElementById('lib-results-header').getBoundingClientRect(), hd = document.querySelector('#svt-root .svt-head').getBoundingClientRect(), ch = document.getElementById('svt-colhs').getBoundingClientRect(), hr = host.getBoundingClientRect();
  const r = { sh: host.scrollHeight, chh: host.clientHeight, pv: (() => { let e = document.getElementById('svt-colhs'); const o = []; while (e) { const c = getComputedStyle(e); if (/auto|scroll/.test(c.overflowY)) o.push((e.id||e.className)+':'+e.scrollHeight+'/'+e.clientHeight); e = e.parentElement; } return o.join(','); })(), before, lhB: lh.bottom, hdT: hd.top, hdB: hd.bottom, chT: ch.top, hostT: hr.top, st: host.scrollTop };
  host.scrollTop = 0; host.style.height = ''; sb.style.minHeight = ''; return r; });
ck('縦にスクロールしても、グルーピングの並びと列の見出しが上に残る（ライブラリの上の帯の下・重ならない）', sticky.st > 100 && Math.abs(sticky.hdT - sticky.lhB) <= 2 && Math.abs(sticky.chT - sticky.hdB) <= 2 && sticky.chT >= sticky.hostT, JSON.stringify(sticky));
// ②c2 上の横スクロールバー（v53.066・オーナー「下の横移動のバーを、一番上の見出しの真下にも」）
const hbar = await pg.evaluate(async () => { const fr = () => new Promise(r => setTimeout(r, 120));
  const root = document.getElementById('svt-root'); root.style.width = '520px'; window.dispatchEvent(new Event('resize')); await fr(); await fr();
  const HB = () => document.getElementById('svt-hbar'), BD = () => document.querySelector('#svt-root .svt-board'), CH = () => document.getElementById('svt-colhs');
  if (!HB()) { root.style.width = ''; return { none: true }; }
  const r = { shown: getComputedStyle(HB()).display !== 'none' && HB().scrollWidth > HB().clientWidth, under: Math.abs(HB().getBoundingClientRect().top - CH().getBoundingClientRect().bottom) <= 3, wide: Math.abs(HB().scrollWidth - BD().scrollWidth) <= 2 };
  HB().scrollLeft = 300; await fr(); r.hb1 = HB().scrollLeft; r.toBoard = BD().scrollLeft; r.toHead = CH().scrollLeft;
  BD().scrollLeft = 0; await fr(); r.hb0 = HB().scrollLeft; BD().scrollLeft = 99999; await fr(); r.bdMax = BD().scrollLeft; r.fromBoard = HB().scrollLeft;
  const host = document.getElementById('lib-card-host'); host.style.height = '400px'; const sb = document.getElementById('svt-body'); sb.style.minHeight = '2500px'; host.scrollTop = 0; await fr();
  host.scrollTop = 600; await fr(); r.st = host.scrollTop; const hr = host.getBoundingClientRect(), t1 = HB().getBoundingClientRect().top; r.stick = host.scrollTop > 100 && Math.abs(t1 - CH().getBoundingClientRect().bottom) <= 3 && t1 >= hr.top && t1 < hr.top + 200;
  host.scrollTop = 0; host.style.height = ''; sb.style.minHeight = ''; BD().scrollLeft = 0; root.style.width = ''; window.dispatchEvent(new Event('resize')); await fr(); return r; });
ck('列の見出しの真下に横スクロールバーがあり、列の幅ぶん動かせる', hbar.shown && hbar.under && hbar.wide, hbar);
ck('上のバーを動かすと列と見出しが動き、列を動かすと上のバーもついてくる', hbar.toBoard > 0 && hbar.toBoard === hbar.hb1 && hbar.toHead === hbar.toBoard && hbar.hb0 === 0 && hbar.bdMax > 0 && hbar.fromBoard === hbar.bdMax, JSON.stringify(hbar));
ck('上のバーは縦にスクロールしても見出しと一緒に上に残る', hbar.stick, JSON.stringify(hbar));
// ②d 列ごとの並べ替え（v53.061・オーナー「カードビューの各列にソートボタン」）。「その他」の列も、ふだんの列も
ck('「なし」の列の名前は「その他」（グループ名＋なし ではない）', (await cols(pg))[0].startsWith('その他='), await cols(pg));
const order = col => pg.evaluate(col => [...document.querySelectorAll(`#svt-root .svt-col[data-name="${col}"] .svt-lc`)].map(w => w.querySelector('.card-title').textContent), col);
const hasSel = await pg.evaluate(() => document.querySelectorAll('#svt-colhs .svt-csort').length === document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)').length);
ck('どの列の見出しにも並べ替えがある', hasSel);
await pg.selectOption('#svt-colhs .svt-colh:has(.svt-tag:text-is("ボトム")) .svt-csort', 'title:1'); await pg.waitForTimeout(200);
const o1 = await order('ボトム');
await pg.selectOption('#svt-colhs .svt-colh:has(.svt-tag:text-is("ボトム")) .svt-csort', 'title:0'); await pg.waitForTimeout(200);
const o2 = await order('ボトム');
ck('列の並べ替え（タイトル A→Z / Z→A）でその列のカードの順が変わる', o1.length === 2 && JSON.stringify(o1) === JSON.stringify(o1.slice().sort()) && JSON.stringify(o2) === JSON.stringify(o1.slice().reverse()), [o1, o2]);
ck('並べ替えはこの端末の好みにだけ残る（動画・グルーピングの保存データには書かない）', await pg.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('wk_groupingsPrefs')).colSort).includes('title:0')) && !JSON.stringify(CLOUD[GDOC]).includes('title:0'));
await pg.selectOption('#svt-colhs .svt-colh:has(.svt-tag:text-is("ボトム")) .svt-csort', ''); await pg.waitForTimeout(200);
// ③ 取り消しの安全: その後に別の画面で変えたら戻さない
await pg.evaluate(() => wkGroupings._move('v2', 'pick', 'ボトム', 'トップ'));
await pg.evaluate(k => { const v = window.videos.find(x => x.id === 'v2'); window.wkSetTagValue(v, k.slice(4), 'ボトム', true); }, tbKey);   // ほかの画面で付け直した
const tbBeforeUndo = await vtb(pg, 'v2');
await pg.evaluate(() => wkGroupings._undo());
ck('その後に値が変わっていたら取り消しで上書きしない（今の値のまま・知らせる）', JSON.stringify(await vtb(pg, 'v2')) === JSON.stringify(tbBeforeUndo) && await pg.evaluate(() => document.getElementById('svt-toast').textContent.includes('戻しませんでした')), [tbBeforeUndo, await vtb(pg, 'v2')]);
await pg.evaluate(k => { const v = window.videos.find(x => x.id === 'v2'); window.wkSetTagValue(v, k.slice(4), 'トップ', false); }, tbKey);   // v2 を元（ボトム・スタンディング）に
ck('（元の値に戻した）', setEq(await vtb(pg, 'v2'), ['ボトム', 'スタンディング']), await vtb(pg, 'v2'));
// ④ 本物のドラッグ（Alt で両方）
const dnd = (from, to, alt) => pg.evaluate(([from, to, alt]) => {
  const cs = [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')];
  const f = cs.find(c => c.dataset.name === from), t = cs.find(c => c.dataset.name === to);
  const card = f.querySelector('.svt-card[draggable=true]'); const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, altKey: alt }));
  const look = t.classList.contains('copy');
  t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, altKey: alt })); return look; }, [from, to, alt]);
const look = await dnd('スタンディング', 'トップ', true);
ck('Alt を押したドラッグは両方に入る（元のタグを外さない）', look && setEq(await vtb(pg, 'v2'), ['ボトム', 'スタンディング', 'トップ']), await vtb(pg, 'v2'));
await pg.evaluate(() => wkGroupings._undo());
await dnd('スタンディング', 'トップ', false);
ck('ふつうのドラッグは移動', setEq(await vtb(pg, 'v2'), ['ボトム', 'トップ']), await vtb(pg, 'v2'));
await pg.evaluate(() => wkGroupings._undo());
ck('取り消すと元どおり', setEq(await vtb(pg, 'v2'), ['ボトム', 'スタンディング']), await vtb(pg, 'v2'));
// ⑤a 見出しの「＋ 新しいタグ」は本物の入力欄（v53.052 まではただの文字で、押しても何も起きなかった）。本物のクリック・キー入力で踏む
await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; const h = document.getElementById('svt-colhs'); const bd = document.querySelector('#svt-root .svt-board'); if (bd) bd.scrollLeft = 99999; if (h) h.scrollLeft = 99999; });
// 人と同じように、カードの列を横に右端まで動かす（見出しの帯は列に合わせて動く）。見出しの帯を直接動かさない
await pg.evaluate(async () => { const bd = document.querySelector('#svt-root .svt-board'); bd.scrollLeft = 0; await new Promise(r => setTimeout(r, 50)); });
await pg.setViewportSize({ width: 900, height: 900 }); await pg.waitForTimeout(300);
await pg.evaluate(async () => { const bd = document.querySelector('#svt-root .svt-board'); bd.scrollLeft = bd.scrollWidth; bd.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 100)); });
const ncVis = await pg.evaluate(() => { const e = document.getElementById('svt-newcol'); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return { ok: hit === e, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth }; });
ck('カードの列を右端まで横に動かすと、見出しの「＋ 新しいタグ」の欄が見えて押せる（v53.054〜061 は届かなかった）', ncVis.ok && ncVis.right <= ncVis.vw, ncVis);
await pg.setViewportSize({ width: 1400, height: 900 }); await pg.waitForTimeout(300);
const inHead = await pg.evaluate(() => { const i = document.getElementById('svt-newcol'); return !!i && !!i.closest('#svt-colhs') && i.placeholder.includes('新しいタグ'); });
ck('見出しの帯に「＋ 新しいタグ」の入力欄がある', inHead);
await pg.click('#svt-newcol'); await pg.keyboard.type('仮タグ'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
ck('見出しの欄を本物のクリックで押して打ち、Enter で列が足される', (await cols(pg)).includes('仮タグ=0') && await pg.evaluate(k => window.tagRegistry.group(k.slice(4)).allOptions.includes('仮タグ'), tbKey), await cols(pg));
// ⑤ 新しいタグ: 選択肢に足すだけ（動画には触らない）
const vidsBefore = await pg.evaluate(() => JSON.stringify(window.videos));
await pg.evaluate(() => { document.getElementById('svt-newcol').value = '膝立ち'; wkGroupings._addCol(); });
ck('列に「膝立ち」（0本）が足され、タグ1の選択肢に入る・動画は変わらない', (await cols(pg)).includes('膝立ち=0') && await pg.evaluate(k => window.tagRegistry.group(k.slice(4)).allOptions.includes('膝立ち'), tbKey) && vidsBefore === await pg.evaluate(() => JSON.stringify(window.videos)), await cols(pg));
ck('グルーピングの選んだタグにも入って保存される', await pg.evaluate(id => wkGroupings.list().find(e => e.id === id).picks.some(p => p.v === '膝立ち'), g1.id));
await pg.evaluate(() => wkGroupings._move('v4', 'pick', '__wk_none__', '膝立ち'));
ck('足した列へ動かすとそのタグが付く', JSON.stringify(await vtb(pg, 'v4')) === '["膝立ち"]', await vtb(pg, 'v4'));
// ⑥ 新しいタググループ（tagRegistry.createGroup）
const ng0 = await pg.evaluate(() => window.tagRegistry.groups().length);
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('進捗');
  document.getElementById('svt-ngroup').value = '進捗'; wkGroupings._ng();
  document.getElementById('svt-pnew').value = '理解した'; wkGroupings._pnew();
  document.getElementById('svt-pnew').value = '使える'; wkGroupings._pnew(); wkGroupings._es(); });
const ngid = await pg.evaluate(() => (window.tagRegistry.groups().find(g => g.name === '進捗') || {}).id);
ck('新しいタググループが本物のタグの一覧に入る（未使用）・選択肢も入る', await pg.evaluate(([n, id]) => window.tagRegistry.groups().length === n + 1 && JSON.stringify(window.tagRegistry.group(id).allOptions) === '["理解した","使える"]' && window.tagRegistry.group(id).slot < 0, [ng0, ngid]));
ck('列: 進捗なし=4・理解した=0・使える=0・最後に非表示=0', JSON.stringify(await cols(pg)) === JSON.stringify(['その他=4', '理解した=0', '使える=0', '非表示=0']), await cols(pg));
await pg.evaluate(() => wkGroupings._move('v1', 'pick', '__wk_none__', '使える'));
ck('作ったグループへ動かすと v.tg[グループid] に入る', await pg.evaluate(id => JSON.stringify((window.videos.find(v => v.id === 'v1').tg || {})[id]), ngid) === '["使える"]');
// ⑥b 保存した後でタグ設定にタグを足すと、グルーピングの列にも自動で出る（v53.055・オーナー「なんで反映されてないんだよ」）。外したタグは出さない
await pg.evaluate(id => window.tagRegistry.addOption(id, 'あとで足した'), ngid); await pg.waitForTimeout(200);
await pg.evaluate(() => window.AF()); await pg.waitForTimeout(300);
const nb1 = await cols(pg);
ck('タグ設定で足したタグが、グルーピングの列の最後に出る', JSON.stringify(nb1) === JSON.stringify(['その他=3', '理解した=0', '使える=1', 'あとで足した=0', '非表示=0']), nb1);
const dd2 = await pg.evaluate(() => { const b = () => document.querySelector('#svt-root .svt-card .svt-cardx .svt-sm:not(.svt-hidebtn)'); b().click(); if (!document.querySelector('#svt-root .svt-multi')) b().click(); return [...document.querySelectorAll('#svt-root .svt-card .svt-o')].map(x => x.textContent); });
ck('カードの ▾ にも出る', dd2.includes('あとで足した'), dd2);
await pg.evaluate(() => { wkGroupings._edit(); wkGroupings._pv('理解した'); wkGroupings._es(); });
await pg.evaluate(id => window.tagRegistry.addOption(id, 'さらに足した'), ngid); await pg.evaluate(() => window.AF()); await pg.waitForTimeout(300);
const nb2 = await cols(pg);
ck('編集で外したタグは出ないまま、そのあと足したタグは出る', !nb2.some(x => x.startsWith('理解した=')) && nb2.includes('さらに足した=0') && nb2.includes('あとで足した=0'), nb2);
await pg.evaluate(id => wkGroupings.importMerge({ items: { glegacy1: { id: 'glegacy1', list: 'master', name: '前の版', gb: 'pick', pg: 'tag:' + id, picks: [{ g: 'tag:' + id, v: '理解した' }, { g: 'tag:' + id, v: '使える' }], showNone: true, created: 5, at: 5 } } }), ngid);
await pg.evaluate(() => wkGroupings._pick('glegacy1')); await pg.waitForTimeout(300);
const nb3 = await cols(pg);
ck('前の版のグルーピング（known が無い）でも、後から増えたタグが出る（オーナーの「リテンション」の形）', ['理解した=0', '使える=1', 'あとで足した=0', 'さらに足した=0'].every(x => nb3.includes(x)), nb3);
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
// ⑥c 「その他」の列のカードに ▾ でタグを続けて付けても、閉じるまでは元の列に残る（v53.062・オーナー「1個目を入れた瞬間に移動して複数入れられない」）
await pg.evaluate(() => wkGroupings._pick(wkGroupings.list().find(e => e.name === '進捗').id)); await pg.waitForTimeout(300);
const ovid = await pg.evaluate(() => document.querySelector('#svt-root .svt-col[data-name="その他"] .svt-lc').dataset.vid);
await pg.evaluate(v => { document.querySelector(`#svt-root .svt-col[data-name="その他"] .svt-lc[data-vid="${v}"] .svt-cardx .svt-sm:not(.svt-hidebtn)`).click(); }, ovid); await pg.waitForTimeout(150);
const inOther = v => pg.evaluate(v => !!document.querySelector(`#svt-root .svt-col[data-name="その他"] .svt-lc[data-vid="${v}"]`), v);
await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-multi .svt-o')].find(b => b.textContent.includes('あとで足した')).click()); await pg.waitForTimeout(200);
ck('1つ目を付けてもカードは「その他」の列に残り、▾ も開いたまま', await inOther(ovid) && await pg.evaluate(() => !!document.querySelector('#svt-root .svt-col[data-name="その他"] .svt-multi')));
await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-multi .svt-o')].find(b => b.textContent.includes('使える')).click()); await pg.waitForTimeout(200);
ck('続けて2つ目も付けられる（まだ「その他」の列にある）', await inOther(ovid) && await pg.evaluate(([v, id]) => { const t = (window.videos.find(x => x.id === v).tg || {})[id] || []; return t.includes('あとで足した') && t.includes('使える'); }, [ovid, ngid]));
await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-multi .svt-sm')].find(b => b.textContent.includes('閉じる')).click()); await pg.waitForTimeout(200);
ck('「閉じる」を押すと、付けた2つの列へ移る（「その他」からは消える）', !(await inOther(ovid)) && await pg.evaluate(v => ['あとで足した', '使える'].every(n => !!document.querySelector(`#svt-root .svt-col[data-name="${n}"] .svt-lc[data-vid="${v}"]`)), ovid));
await pg.evaluate(() => { wkGroupings._undo(); wkGroupings._undo(); }); await pg.waitForTimeout(150);
// ⑥d タグの名前を変える（設定の画面 → tag-ops.js）と、グルーピングの選んだタグも新しい名前になる（v53.063・オーナー「設定画面で変更したタグ名がグルーピングに反映されてない」）
const rn0 = await pg.evaluate(id => wkGroupings.list().find(e => e.name === '進捗').picks.map(p => p.v), ngid);
const rnP = pg.evaluate(id => window.wkTagOps.renameValue(id, '使える', 'vs 使える'), ngid);
await pg.waitForSelector('#tagops-dlg #tagops-ok'); await pg.click('#tagops-dlg #tagops-ok'); await rnP; await pg.waitForTimeout(300);
const rn1 = await pg.evaluate(() => wkGroupings.list().find(e => e.name === '進捗').picks.map(p => p.v));
ck('名前を変えると、グルーピングの列のタグも新しい名前になる（同じ位置・ほかはそのまま）', JSON.stringify(rn1) === JSON.stringify(rn0.map(x => x === '使える' ? 'vs 使える' : x)), [rn0, rn1]);
ck('クラウドのグルーピングにも新しい名前', await until(() => (CLOUD[GDOC].items[Object.keys(CLOUD[GDOC].items).find(k => CLOUD[GDOC].items[k].name === '進捗')].picks || []).some(p => p.v === 'vs 使える')));
await pg.evaluate(() => wkGroupings._pick(wkGroupings.list().find(e => e.name === '進捗').id)); await pg.waitForTimeout(200);
ck('列の見出しも新しい名前で、動画もそこに入っている', (await cols(pg)).some(c => /^vs 使える=[1-9]/.test(c)), await cols(pg));
await pg.evaluate(() => document.querySelector('#toast .toast-undo-btn')?.click()); await pg.waitForTimeout(300);
ck('名前の変更を取り消すと、グルーピングの選んだタグも元の名前に戻る', JSON.stringify(await pg.evaluate(() => wkGroupings.list().find(e => e.name === '進捗').picks.map(p => p.v))) === JSON.stringify(rn0), await pg.evaluate(() => wkGroupings.list().find(e => e.name === '進捗').picks.map(p => p.v)));
// ⑦ カスタム列（セレクト・評価）
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('フェーズ'); wkGroupings._eg('cf:gc_phase1'); wkGroupings._es(); });
await pg.evaluate(() => wkGroupings._move('v1', 'cf:gc_phase1', '学習中', '使えてる'));
ck('セレクトの列へ動かすと v.cf の値が変わる', await pg.evaluate(() => window.videos.find(v => v.id === 'v1').cf.gc_phase1) === '使えてる');
await pg.evaluate(() => wkGroupings._undo());
ck('取り消すと元の値', await pg.evaluate(() => window.videos.find(v => v.id === 'v1').cf.gc_phase1) === '学習中');
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('優先度'); wkGroupings._eg('cf:gc_star1'); wkGroupings._es(); });
await pg.evaluate(() => wkGroupings._move('v3', 'cf:gc_star1', '__wk_none__', '★★★★★'));
ck('評価の列へ動かすと数（5）が入る', await pg.evaluate(() => window.videos.find(v => v.id === 'v3').cf.gc_star1) === 5);
await pg.evaluate(() => wkGroupings._undo());
ck('取り消すと評価の欄は元どおり（無かった）', await pg.evaluate(() => !('gc_star1' in window.videos.find(v => v.id === 'v3').cf)));
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._eg('pl'); wkGroupings._es(); });
ck('プレイリストは動かせない（ドラッグできるカードが無い）', await pg.evaluate(() => document.querySelectorAll('#svt-root .svt-card[draggable=true]').length === 0));
// ⑧ 消す → del の印・動画は変わらない・取り消せる
const vids2 = await pg.evaluate(() => JSON.stringify(window.videos));
const plId = await pg.evaluate(() => wkGroupings.list().find(e => e.gb === 'pl').id);
await pg.evaluate(() => { wkGroupings._edit(); wkGroupings._del(); });
ck('消すとクラウドには del の印（欄は消さない）・動画は1文字も変わらない', await until(() => CLOUD[GDOC].items[plId] && CLOUD[GDOC].items[plId].del === true) && vids2 === await pg.evaluate(() => JSON.stringify(window.videos)), CLOUD[GDOC].items[plId]);
await pg.evaluate(() => wkGroupings._tu());
ck('お知らせの「元に戻す」で戻る', await until(() => CLOUD[GDOC].items[plId] && !CLOUD[GDOC].items[plId].del && CLOUD[GDOC].items[plId].name));
let ids1 = Object.keys(CLOUD[GDOC].items).sort();
ck('クラウドの文書には items と savedBy/updatedAt だけ', JSON.stringify(Object.keys(CLOUD[GDOC]).sort()) === JSON.stringify(['items', 'savedBy', 'updatedAt']), Object.keys(CLOUD[GDOC]));
// ⑨ テーブルは本番の表に見出しの行
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const tb = await pg.evaluate(() => ({ hd: document.querySelectorAll('#orgList tr.org-group-hd').length, rows: document.querySelectorAll('#orgList tr.org-tr').length, inOrg: document.getElementById('lib-org-host').contains(document.getElementById('svt-root')) }));
ck('テーブルは本番の表にグループの見出しの行が入る', tb.hd >= 3 && tb.rows >= 4 && tb.inOrg, tb);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(500);
// ⑨b 非表示（v53.051）: カードの下段・テーブルの右端のボタン、「非表示」の列から戻す。隠すのはそのグルーピングの中だけ（動画・タグは変えない）
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(400);
const vH0 = await pg.evaluate(() => JSON.stringify(window.videos));
const hideBtn = await pg.evaluate(() => { const card = [...document.querySelectorAll('#svt-root .svt-col')].find(c => c.dataset.name === 'ボトム').querySelector('.svt-card'); const b = card.querySelector('.svt-hidebtn'); const t = card.querySelector('.card-title').textContent; const inLow = b && b.parentElement.classList.contains('svt-cardx'); b.click(); return { t, inLow, label: b.textContent }; });
const ch1 = await cols(pg);
ck('カードの下段に「非表示」・押すとその列から消えて最後の「非表示」の列に入る', hideBtn.inLow && hideBtn.label === '非表示' && ch1.includes('ボトム=1') && ch1[ch1.length - 1] === '非表示=1', [hideBtn, ch1]);
const hidVid = await pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-hidcol .svt-card')].map(c => c.querySelector('.svt-hidebtn').getAttribute('onclick').match(/_hide\('([^']+)'/)[1])[0]);
ck('非表示はこのグルーピングにだけ入る（端末・クラウド）・動画は1文字も変わらない', await until(() => (CLOUD[GDOC].items[g1.id].hidden || []).includes(hidVid)) && vH0 === await pg.evaluate(() => JSON.stringify(window.videos)) && await pg.evaluate(([id, v]) => wkGroupings.list().filter(e => e.id !== id).every(e => !(e.hidden || []).includes(v)), [g1.id, hidVid]));
await pg.evaluate(() => { wkGroupings._edit(); wkGroupings._es(); });
ck('グルーピングを編集して保存しても非表示は残る', await pg.evaluate(([id, v]) => (wkGroupings.list().find(e => e.id === id).hidden || []).includes(v), [g1.id, hidVid]));
await pg.evaluate(() => document.querySelector('#svt-root .svt-hidcol .svt-hidebtn').click());
const ch2 = await cols(pg);
ck('「非表示」の列のカードは「表示に戻す」で元の列に戻る', ch2.includes('ボトム=2') && ch2.includes('非表示=0'), ch2);
const dnd2 = (from, to) => pg.evaluate(([from, to]) => { const cs = [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')];
  const f = cs.find(c => c.dataset.name === from), t = cs.find(c => c.dataset.name === to); const card = f.querySelector('.svt-card[draggable=true]'); const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); return card.querySelector('.svt-hidebtn').getAttribute('onclick').match(/_hide\('([^']+)'/)[1]; }, [from, to]);
const dv = await dnd2('トップ', '非表示');
const tb0 = await vtb(pg, dv);
ck('「非表示」の列へドラッグしても隠れる（タグは変わらない）', (await cols(pg)).includes('非表示=1') && (await cols(pg)).includes('トップ=0'), await cols(pg));
await dnd2('非表示', 'スタンディング');
ck('「非表示」の列から別の列へドラッグすると戻り、その列のタグが足される（元のタグは外さない）', (await cols(pg)).includes('非表示=0') && setEq(await vtb(pg, dv), [...tb0, 'スタンディング']), [await cols(pg), await vtb(pg, dv)]);
await pg.evaluate(() => wkGroupings._undo()); await pg.evaluate(() => wkGroupings._undo());
ck('取り消すとタグも非表示も戻る（2回）', setEq(await vtb(pg, dv), tb0) && (await cols(pg)).includes('非表示=1'), [await cols(pg), await vtb(pg, dv)]);
await pg.evaluate(() => wkGroupings._undo());
ck('もう1回で非表示も戻る', (await cols(pg)).includes('非表示=0'), await cols(pg));
// テーブル: 右端の列
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(800);
const tbl = await pg.evaluate(() => { const hr = document.getElementById('orgTheadRow'); const rows = [...document.querySelectorAll('#orgList tr.org-tr')];
  return { lastTh: hr.lastElementChild.textContent, nTh: hr.children.length, rowsLast: rows.every(r => r.lastElementChild.classList.contains('svt-hidecell')), nTd: rows.map(r => r.children.length), hd: [...document.querySelectorAll('#orgList tr.org-group-hd')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }; });
ck('テーブルの右端の列が「非表示」・どの行も最後のセルにボタン・見出しとセルの数が同じ', tbl.lastTh === '非表示' && tbl.rowsLast && tbl.nTd.every(n => n === tbl.nTh) && tbl.hd.some(h => h.includes('非表示')), tbl);
await pg.evaluate(() => document.querySelector('#orgList tr.org-tr td.svt-hidecell button').click()); await pg.waitForTimeout(400);
const tbl2 = await pg.evaluate(() => ({ hd: [...document.querySelectorAll('#orgList tr.org-group-hd')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), last: document.getElementById('orgTheadRow').lastElementChild.textContent }));
ck('テーブルで「非表示」を押すと「非表示 1本」のグループ（最初は畳む）に入る・右端の列はそのまま', tbl2.hd.some(h => /非表示\s*1本/.test(h) && h.startsWith('▶')) && tbl2.last === '非表示', tbl2);
await pg.evaluate(() => [...document.querySelectorAll('#orgList tr.org-group-hd')].find(r => r.textContent.includes('非表示')).click()); await pg.waitForTimeout(300);
await pg.evaluate(() => { const b = [...document.querySelectorAll('#orgList td.svt-hidecell button')].find(x => x.textContent === '表示に戻す'); b.click(); }); await pg.waitForTimeout(400);
ck('開いて「表示に戻す」で戻る', await pg.evaluate(() => [...document.querySelectorAll('#orgList tr.org-group-hd')].some(r => /非表示\s*0本/.test(r.textContent))));
await pg.evaluate(() => wkGroupings._pick('all')); await pg.waitForTimeout(400);
ck('「すべて」にすると右端の列は無くなる', await pg.evaluate(() => !document.querySelector('#orgTheadRow th.svt-hideth') && !document.querySelector('#orgList td.svt-hidecell')));
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(400);
// ⑨c 絞り込みがその場で反映される（サイドバーと同じ window.filters＋AF・検索語・テーブルでも）
const nCards = () => pg.evaluate(() => new Set([...document.querySelectorAll('#svt-root .svt-col:not(.svt-hidcol) .svt-card')].map(c => c.querySelector('.card-title').textContent)).size);
const nAll = await nCards();
await pg.evaluate(() => { window.filters.playlist.add('ラッソー対策集'); window.AF(); }); await pg.waitForTimeout(400);
const nPl = await nCards();
ck('サイドバーと同じ絞り込み（プレイリスト）を掛けると、グルーピングの列もその場で絞られる', nPl === 2 && nAll > 2, [nAll, nPl]);
await pg.evaluate(() => { window.filters.playlist.clear(); window.AF(); }); await pg.waitForTimeout(400);
ck('外すと元に戻る', await nCards() === nAll, await nCards());
await pg.evaluate(() => { window.wkSetSearchWord('スパイダー'); window.AF(); }); await pg.waitForTimeout(400);
ck('検索語でもその場で絞られる', await nCards() === 1, await nCards());
await pg.evaluate(() => { window.wkSetSearchWord(''); window.AF(); }); await pg.waitForTimeout(400);
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const tRows = () => pg.evaluate(() => document.querySelectorAll('#orgList tr.org-tr').length);
const tr0 = await tRows();
await pg.evaluate(() => { window.filters.playlist.add('ラッソー対策集'); window.AF(); }); await pg.waitForTimeout(600);
const tr1 = await tRows();
ck('テーブルでも絞り込みがその場で反映される', tr1 < tr0 && tr1 >= 2, [tr0, tr1]);
await pg.evaluate(() => { window.filters.playlist.clear(); window.AF(); }); await pg.waitForTimeout(600);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(400);
ck('上の帯に「分ける基準 …」の文は出さない（v53.059・オーナー「この文言はいらない」）', await pg.evaluate(() => !document.getElementById('svt-sum').textContent.includes('分ける基準') && document.getElementById('svt-sum').textContent.includes('グルーピングを編集')));
// ⑨d ボタンを全部、本物のクリックで（下までスクロールした状態から）。押した結果が画面の見える所に出ることまで見る
// （v53.055・オーナー「効かないボタンばっかりじゃねえか」。「✎ グルーピングを編集」は見出しが上に残るので下からも押せるのに、
//   編集の画面は一覧の上に出ていたので、スクロールしていると画面の外に開いて何も起きないように見えた）
await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; });
await pg.setViewportSize({ width: 1400, height: 600 });
const scrollDown = () => pg.evaluate(async () => { const sb = document.getElementById('svt-body'); sb.style.minHeight = '2500px'; const h = document.getElementById('lib-card-host'); h.scrollTop = 1500; await new Promise(r => setTimeout(r, 150)); return h.scrollTop; });
const onScreen = sel => pg.evaluate(sel => { const e = document.querySelector(sel); if (!e) return 'ない'; const r = e.getBoundingClientRect(); if (!r.height) return '高さ0';
  const x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 20); if (y < 0 || y > innerHeight) return '画面の外 top=' + Math.round(r.top);
  const hit = document.elementFromPoint(x, y); return hit && e.contains(hit) ? 'ok' : '隠れている: ' + (hit && (hit.id || hit.className)) + ' rect=' + [r.left, r.top, r.width, r.height].map(Math.round) + ' vw=' + innerWidth; }, sel);
const realClick = async (sel, label) => { try { await pg.click(sel, { timeout: 3000 }); return true; } catch (e) { ck(label + ' を本物のクリックで押せる', false, String(e.message).split('\n')[0]); return false; } };
await scrollDown();
if (await realClick('#svt-sum button:has-text("グルーピングを編集")', '「✎ グルーピングを編集」')) {
  await pg.waitForTimeout(200);
  ck('下までスクロールしていても「✎ グルーピングを編集」で編集の画面が見える所に開く', await onScreen('#svt-ed .svt-ed') === 'ok', await onScreen('#svt-ed .svt-ed'));
  ck('編集の画面の「保存」が見える所にあり押せる', await onScreen('#svt-ed .foot .svt-sm.pri') === 'ok', await onScreen('#svt-ed .foot .svt-sm.pri'));
  await realClick('#svt-ed .foot .svt-sm:has-text("やめる")', '「やめる」');
  await pg.waitForTimeout(150);
  ck('「やめる」で閉じる', !(await pg.evaluate(() => !!document.querySelector('#svt-ed .svt-ed'))));
}
await scrollDown();
if (await realClick('#svt-tabs .svt-vt.add', '「＋ グルーピング」')) {
  await pg.waitForTimeout(200);
  ck('下までスクロールしていても「＋ グルーピング」で作る画面が見える所に開く', await onScreen('#svt-ed .svt-ed') === 'ok', await onScreen('#svt-ed .svt-ed'));
  await realClick('#svt-ed .foot .svt-sm:has-text("やめる")', '「やめる」');
}
await scrollDown();
if (await realClick('#svt-tabs .svt-vt:has-text("すべて")', 'タブ「すべて」')) { await pg.waitForTimeout(200); ck('タブ「すべて」で分けない表示になる', await pg.evaluate(() => getComputedStyle(document.getElementById('cardList')).display !== 'none')); }
await realClick('#svt-tabs .svt-vt:has-text("タグ1別")', 'タブ「タグ1別」'); await pg.waitForTimeout(300);
ck('タブ「タグ1別」で列が出る', await pg.evaluate(() => document.querySelectorAll('#svt-root .svt-col').length > 2));
for (const [w, h] of [[1400, 600], [390, 760]]) {
  await pg.setViewportSize({ width: w, height: h }); await pg.evaluate(() => { const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; });
  await scrollDown();
  if (!(await realClick('#svt-sum button:has-text("グルーピングを編集")', `${w}px「✎ グルーピングを編集」`))) continue;
  await pg.waitForTimeout(200);
  ck(`${w}px: 編集の画面が見える所に開く`, await onScreen('#svt-ed .svt-ed') === 'ok', await onScreen('#svt-ed .svt-ed'));
  for (const b of ['全部外す', '全部選ぶ']) { if (await realClick(`#svt-ed button:has-text("${b}")`, `${w}px「${b}」`)) await pg.waitForTimeout(100); }
  ck(`${w}px: 「全部外す」「全部選ぶ」が効く`, await pg.evaluate(() => wkGroupings._state().editing.picks.length >= 3));
  await pg.fill('#svt-pnew', 'クリック確認' + w);
  await realClick('#svt-ed button:has-text("足す")', `${w}px 編集の「足す」`); await pg.waitForTimeout(150);
  ck(`${w}px: 編集の「＋ 新しいタグ」の「足す」が効く`, await pg.evaluate(n => wkGroupings._state().editing.picks.some(p => p.v === n), 'クリック確認' + w));
  ck(`${w}px: 「保存」が見える所にある`, await onScreen('#svt-ed .foot .svt-sm.pri') === 'ok', await onScreen('#svt-ed .foot .svt-sm.pri'));
  await realClick('#svt-ed .foot .svt-sm.pri', `${w}px「保存」`); await pg.waitForTimeout(250);
  ck(`${w}px: 「保存」で閉じて列に入る`, !(await pg.evaluate(() => !!document.querySelector('#svt-ed .svt-ed'))) && (await cols(pg)).includes('クリック確認' + w + '=0'), await cols(pg));
}
// テーブルでも「✎ グルーピングを編集」が効く
await pg.setViewportSize({ width: 1400, height: 900 });
await pg.evaluate(() => { const sb = document.getElementById('svt-body'); sb.style.minHeight = ''; document.getElementById('lib-card-host').scrollTop = 0; });
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
await pg.evaluate(() => { const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; const ov = document.getElementById('libSbOverlay'); if (ov) ov.style.display = 'none'; });
if (await realClick('#svt-sum button:has-text("グルーピングを編集")', 'テーブルの「✎ グルーピングを編集」')) { await pg.waitForTimeout(200);
  ck('テーブルでも編集の画面が見える所に開く', await onScreen('#svt-ed .svt-ed') === 'ok', await onScreen('#svt-ed .svt-ed'));
  await realClick('#svt-ed .foot .svt-sm:has-text("やめる")', 'テーブルの「やめる」'); }
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(500);
await pg.setViewportSize({ width: 1400, height: 900 });
await pg.evaluate(() => { const sb = document.getElementById('svt-body'); sb.style.minHeight = ''; document.getElementById('lib-card-host').scrollTop = 0; });
const v2tb = await vtb(pg, 'v2');
if (await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-cardx .svt-sm:not(.svt-hidebtn)', 'カードの ▾')) {
  await pg.waitForTimeout(150);
  ck('カードの ▾ でタグが並ぶ', await onScreen('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-o') === 'ok');
  await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-o:has-text("トップ")', '▾ の中のタグ');
  await pg.waitForTimeout(150);
  ck('▾ の中のタグを押すと付く', (await vtb(pg, 'v2')).includes('トップ'), await vtb(pg, 'v2'));
}
// カードの ▾ は複数選べる（v53.055・オーナー「ここは複数選択できるようにして」）。押すたびにカードが別の列へ移っても開いたまま
await pg.evaluate(() => wkGroupings._undo()); await pg.waitForTimeout(150);   // 上の ▾ の確認で付けた「トップ」を戻す
const mv0 = await pg.evaluate(() => { const c = [...document.querySelectorAll('#svt-root .svt-col')].find(x => x.dataset.name === '膝立ち'); return c.querySelector('.svt-card .svt-hidebtn').getAttribute('onclick').match(/_hide\('([^']+)'/)[1]; });
const mtb0 = await vtb(pg, mv0);
await realClick('#svt-root .svt-col[data-name="膝立ち"] .svt-card .svt-cardx .svt-sm:not(.svt-hidebtn)', '「膝立ち」の列のカードの ▾'); await pg.waitForTimeout(150);
await realClick('#svt-root .svt-multi .svt-o:has-text("トップ")', '▾ の「トップ」'); await pg.waitForTimeout(200);
ck('1つ押しても ▾ は開いたまま（いくつでも選べます）', await pg.evaluate(() => !!document.querySelector('#svt-root .svt-multi') && document.querySelector('#svt-root .svt-multi').textContent.includes('いくつでも選べます')));
await realClick('#svt-root .svt-multi .svt-o:has-text("スタンディング")', '▾ の「スタンディング」'); await pg.waitForTimeout(200);
ck('続けて押すと両方付く（複数選択・元のタグも残る）', setEq(await vtb(pg, mv0), [...mtb0, 'トップ', 'スタンディング']), await vtb(pg, mv0));
ck('付いているタグに ✓', await pg.evaluate(() => document.querySelectorAll('#svt-root .svt-multi .svt-o.on').length) === mtb0.length + 2);
await realClick('#svt-root .svt-multi .svt-o:has-text("トップ")', '▾ の「トップ」をもう一度'); await pg.waitForTimeout(200);
ck('もう一度押すと外れる', setEq(await vtb(pg, mv0), [...mtb0, 'スタンディング']), await vtb(pg, mv0));
await realClick('#svt-root .svt-multi .svt-sm:has-text("閉じる")', '▾ の「閉じる」'); await pg.waitForTimeout(150);
ck('「閉じる」で閉じる', await pg.evaluate(() => !document.querySelector('#svt-root .svt-multi')));
await pg.evaluate(() => { wkGroupings._undo(); wkGroupings._undo(); wkGroupings._undo(); }); await pg.waitForTimeout(150);
ck('（取り消して元に）', setEq(await vtb(pg, mv0), mtb0), await vtb(pg, mv0));
await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-cardx .svt-sm:not(.svt-hidebtn)', 'カードの ▾'); await pg.waitForTimeout(100);
await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-o:has-text("トップ")', '▾ の中のタグ'); await pg.waitForTimeout(150);
if (await realClick('#svt-sum button:has-text("1つ戻す")', '「↶ 1つ戻す」')) { await pg.waitForTimeout(150); ck('「↶ 1つ戻す」で戻る', setEq(await vtb(pg, 'v2'), v2tb), await vtb(pg, 'v2')); }
const hidN = async () => +((await cols(pg)).find(x => x.startsWith('非表示=')) || '=0').split('=')[1];
const hid0 = await hidN();
if (await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-card .svt-hidebtn', 'カードの「非表示」')) { await pg.waitForTimeout(150);
  ck('カードの「非表示」で非表示の列に入る', await hidN() === hid0 + 1, await cols(pg));
  if (await realClick('#svt-toast .svt-tu', 'お知らせの「↶ 元に戻す」')) { await pg.waitForTimeout(150); ck('お知らせの「↶ 元に戻す」で戻る', await hidN() === hid0, await cols(pg)); } }
// ⑨e カードはライブラリと同じ（v53.057・オーナー「通常とグルーピングで見え方が違う。同じにして。プレビューも」）
await pg.evaluate(() => { document.getElementById('lib-card-host').scrollTop = 0; });
const lc = await pg.evaluate(() => { const w = document.querySelector('#svt-root .svt-col[data-name="ボトム"] .svt-lc'); return { wrap: !!w.querySelector('.card-wrap .card .card-thumb'), pv: !!w.querySelector('.card-pv-btn'), act: [...w.querySelectorAll('.card-actions button')].map(b => b.textContent.trim()).join('|'), title: !!w.querySelector('.card-title') }; });
ck('グルーピングのカードはライブラリのカードそのもの（サムネ・プレビュー・メモ／アーカイブ）', lc.wrap && lc.pv && lc.title && /メモ/.test(lc.act) && /アーカイブ/.test(lc.act), lc);
// v2 は「ボトム」と「スタンディング」の2つの列に出る。2つ目（スタンディング）の方のプレビューを本物のクリックで押す
const dupOk = await pg.evaluate(() => { const a = document.querySelector('#svt-root .svt-col[data-name="ボトム"] .svt-lc[data-vid="v2"]'), b = document.querySelector('#svt-root .svt-col[data-name="スタンディング"] .svt-lc[data-vid="v2"]'); return !!a && !!b && a.dataset.copy !== b.dataset.copy && document.querySelectorAll('[id="card-v2"]').length >= 1; });
ck('同じ動画が2つの列に出る（2つ目は id を変えて重ならない）', dupOk && await pg.evaluate(() => [...document.querySelectorAll('#svt-root [id="card-v2"]')].length === 1));
if (await realClick('#svt-root .svt-col[data-name="スタンディング"] .svt-lc[data-vid="v2"] .card-pv-btn', '2つ目の列のカードの「プレビュー」')) { await pg.waitForTimeout(300);
  ck('2つ目の列のカードでも、押したカードの中でプレビューが始まる', await pg.evaluate(() => !!document.querySelector('#svt-root .svt-col[data-name="スタンディング"] .svt-lc[data-vid="v2"] .card-pv-layer') && !document.querySelector('#svt-root .svt-col[data-name="ボトム"] .svt-lc[data-vid="v2"] .card-pv-layer')));
  await pg.evaluate(() => window.wkCardPreviewStop?.()); }
if (await realClick('#svt-root .svt-col[data-name="ボトム"] .svt-lc[data-vid="v2"] .card-pv-btn', '1つ目の列のカードの「プレビュー」')) { await pg.waitForTimeout(300);
  ck('もう一方の列のカードでもプレビューできる', await pg.evaluate(() => !!document.querySelector('#svt-root .svt-col[data-name="ボトム"] .svt-lc[data-vid="v2"] .card-pv-layer')));
  await pg.evaluate(() => window.wkCardPreviewStop?.()); }
// ⑨f 複数のタググループを同時に使う（v53.057・オーナー決定 A）
const mg = await pg.evaluate(([tk, nk]) => { wkGroupings._new(); wkGroupings._en('2グループ'); wkGroupings._eg(tk); wkGroupings._eg(nk);
  const ed = wkGroupings._state().editing; const on = [...document.querySelectorAll('#svt-ed .svt-o.on')].map(b => b.textContent); wkGroupings._es();
  const e = wkGroupings.list().find(x => x.name === '2グループ'); return { pgs: e.pgs, pg: e.pg, n: e.picks.length, groups: [...new Set(e.picks.map(p => p.g))], on }; }, [tbKey, 'tag:' + ngid]);
ck('編集でタググループを2つ押すと両方選ばれ、両方のタグが列の候補になる・保存される（pg は前の版用に1つ目）', mg.pgs.length === 2 && mg.pg === tbKey && mg.groups.length === 2, mg);
const mc = await cols(pg);
ck('2つのグループのタグが横に並んで列になる（「その他」が先頭）', mc[0].startsWith('その他=') && ['ボトム', 'トップ', '使える', 'あとで足した'].every(x => mc.some(c => c.startsWith(x + '='))), mc);
const sep = await pg.evaluate(() => { const hs = [...document.querySelectorAll('#svt-colhs .svt-colh')]; const colored = hs.filter(h => h.style.getPropertyValue('--gc')); const colors = [...new Set(colored.map(h => h.style.getPropertyValue('--gc')))]; return { colors: colors.length, starts: document.querySelectorAll('#svt-colhs .svt-gstart').length, boardStarts: document.querySelectorAll('#svt-root .svt-board .svt-col.svt-gstart').length,
  order: colored.map(h => h.style.getPropertyValue('--gc')) }; });
const contiguous = sep.order.every((c, i) => i === 0 || c === sep.order[i - 1] || !sep.order.slice(0, i).includes(c));
ck('2つのグループの列は色で分かれ、グループごとにまとまり、境目に区切りがある（見出しと列の両方）', sep.colors === 2 && sep.starts === 1 && sep.boardStarts === 1 && contiguous, sep);
await pg.evaluate(() => wkGroupings._edit());
const blk = await pg.evaluate(() => [...document.querySelectorAll('#svt-ed .svt-pgrow')].map(b => ({ name: b.querySelector('.svt-gname').textContent, gc: b.style.getPropertyValue('--gc'), chips: b.querySelectorAll('.svt-chip').length })));
ck('編集の画面はタググループごとの枠に分かれ、それぞれ色の線・名前・選んだタグを持つ', blk.length === 2 && blk.every(b => b.gc && b.chips > 0) && blk[0].gc !== blk[1].gc, blk);
await pg.evaluate(nk => wkGroupings._gup(nk), 'tag:' + ngid);
ck('「↑ 前へ」でグループの順を入れ替えられる', await pg.evaluate(nk => wkGroupings._state().editing.pgs[0] === nk && wkGroupings._state().editing.picks[0].g === nk, 'tag:' + ngid));
if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/multi-ed.png' });
await pg.evaluate(() => wkGroupings._ec());
const v1tb = await vtb(pg, 'v1'), v1tg = await pg.evaluate(id => JSON.stringify((window.videos.find(v => v.id === 'v1').tg || {})[id] || []), ngid);
await pg.evaluate(() => wkGroupings._move('v1', 'pick', 'ボトム', 'あとで足した'));
ck('グループをまたいで動かすと、元のグループのタグを外して先のグループのタグを付ける', !(await vtb(pg, 'v1')).includes('ボトム') && await pg.evaluate(id => (window.videos.find(v => v.id === 'v1').tg[id] || []).includes('あとで足した'), ngid), [await vtb(pg, 'v1')]);
await pg.evaluate(() => wkGroupings._undo());
ck('取り消すと両方元どおり', setEq(await vtb(pg, 'v1'), v1tb) && await pg.evaluate(id => JSON.stringify((window.videos.find(v => v.id === 'v1').tg || {})[id] || []), ngid) === v1tg);
await pg.evaluate(nk => { wkGroupings._edit(); wkGroupings._eg(nk); wkGroupings._es(); }, 'tag:' + ngid);
const mc2 = await cols(pg);
ck('編集でもう一度押すとそのグループは外れる', !mc2.some(c => c.startsWith('使える=')) && mc2.some(c => c.startsWith('ボトム=')), mc2);
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
await wait(800); ids1 = Object.keys(CLOUD[GDOC].items).sort();
// ⑨g コピー（v53.065・オーナー「既存のグルーピング条件をコピーする機能」）
const cpBefore = await pg.evaluate(id => JSON.stringify(wkGroupings.list().find(e => e.id === id)), g1.id);
await pg.evaluate(id => { wkGroupings._pick(id); wkGroupings._edit(); }, g1.id);
await pg.selectOption('#svt-copy-to', 'master'); await pg.click('#svt-ed button:has-text("にコピーを作る")'); await pg.waitForTimeout(300);
const cp = await pg.evaluate(id => { const src = wkGroupings.list().find(e => e.id === id); const c = wkGroupings.list().find(e => e.name === src.name + '（コピー）');
  return c && { same: JSON.stringify(c.picks) === JSON.stringify(src.picks) && JSON.stringify(c.pgs) === JSON.stringify(src.pgs) && c.gb === src.gb, list: c.list, cur: !!document.querySelector('#svt-tabs .svt-vt.on') && document.querySelector('#svt-tabs .svt-vt.on').textContent.includes('（コピー）'), id: c.id }; }, g1.id);
ck('「にコピーを作る」で同じ内容のグルーピングが「（コピー）」の名前で増え、それが開く', !!cp && cp.same && cp.list === 'master' && cp.cur, cp);
ck('元のグルーピングは1文字も変わらない', cpBefore === await pg.evaluate(id => JSON.stringify(wkGroupings.list().find(e => e.id === id)), g1.id));
ck('コピーもクラウドに1件として入る', await until(() => !!CLOUD[GDOC].items[cp && cp.id]));
await pg.evaluate(id => { wkGroupings._pick(id); wkGroupings._edit(); }, g1.id);
await pg.click('#svt-ed button:has-text("にコピーを作る")'); await pg.waitForTimeout(300);
ck('2回目は「（コピー2）」', await pg.evaluate(() => wkGroupings.list().some(e => /（コピー2）$/.test(e.name))));
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
await wait(800); ids1 = Object.keys(CLOUD[GDOC].items).sort();
// ⑩ 2台目: 開くと同じグルーピングが出る・作ると1台目に届く
const cx2 = await newCtx(); const pg2 = await open(cx2);
await pg2.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
ck('2台目にも同じグルーピングが届く', await until(() => pg2.evaluate(n => wkGroupings.list().filter(e => !e.del).length === n, ids1.length)), await pg2.evaluate(() => wkGroupings.list().map(e => e.name)));
await pg2.waitForTimeout(1500);
await pg2.evaluate(() => { wkGroupings._new(); wkGroupings._en('2台目で作った'); wkGroupings._eg('ch'); wkGroupings._es(); });
ck('2台目で作ると、開いたままの1台目に届く（再読み込みなし）', await until(() => pg.evaluate(() => wkGroupings.list().some(e => e.name === '2台目で作った')), 8000));
ck('2台目が書いても1台目の分は残る', await until(async () => ids1.every(id => CLOUD[GDOC].items[id]) && Object.keys(CLOUD[GDOC].items).length === ids1.length + 1));
// ⑪ 再読み込み: 開いていた状態・選んでいたグルーピングが戻る
await reload(pg);
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
ck('再読み込みしても同じグルーピングを選んだまま', await until(() => pg.evaluate(id => !!document.getElementById('svt-root') && document.querySelector('#svt-tabs .svt-vt.on')?.textContent.includes('タグ1別'), g1.id), 8000));
ck('再読み込みしても動かした結果は残る（v4 膝立ち）', JSON.stringify(await vtb(pg, 'v4')) === '["膝立ち"]');
// ⑪b この版より前に名前を変えた分: 「元に戻す」の控え（wk_tagOpsUndo）にある名前の変更から、今は無いタグを新しい名前に読み替える
await pg.evaluate(id => { const e = wkGroupings.list().find(x => x.name === '進捗');
  window.tagRegistry.addOption(id, '後で変えた名'); const v = window.videos.find(x => x.id === 'v3'); window.wkSetTagValue(v, id, '後で変えた名', true);
  const { at, ...rest } = e; wkGroupings.importMerge({ items: { [e.id]: { ...rest, picks: rest.picks.concat([{ g: 'tag:' + id, v: '昔の名' }]), knownBy: { ...(rest.knownBy || {}), ['tag:' + id]: (rest.knownBy && rest.knownBy['tag:' + id] || []).concat(['昔の名', '後で変えた名']) }, at: Date.now() + 1e6 } } });
  localStorage.setItem('wk_tagOpsUndo', JSON.stringify([{ id: 'uold', at: 1, title: '「昔の名」を「後で変えた名」に変更', gids: [id], before: [], after: [] }])); }, ngid);
await pg.waitForTimeout(500);
ck('（用意: 今は無い「昔の名」を選んでいる）', await pg.evaluate(() => wkGroupings.list().find(e => e.name === '進捗').picks.some(p => p.v === '昔の名')));
await reload(pg); await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 }); await pg.waitForTimeout(1500);
const rp = await pg.evaluate(() => wkGroupings.list().find(e => e.name === '進捗').picks.map(p => p.v));
ck('再読み込みすると、控えにある名前の変更で「昔の名」→「後で変えた名」に読み替わる（ほかの選んだタグは変わらない）', rp.includes('後で変えた名') && !rp.includes('昔の名') && rp.length >= 2, rp);
// ⑫ クラウドを読めない端末は書かない／ほかのアカウントの控えは送らない
const cx3 = await newCtx();
await cx3.addInitScript(() => { window.__grpFail = true; });
const pg3 = await open(cx3);
await pg3.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
await pg3.evaluate(() => { wkGroupings._new(); wkGroupings._en('読めない端末'); wkGroupings._es(); });
await wait(1500);
ck('クラウドを読めなかった端末は書かない', !Object.values(CLOUD[GDOC].items).some(e => e.name === '読めない端末'));
await cx3.close();
const cx4 = await newCtx();
await cx4.addInitScript(() => { try { localStorage.setItem('wk_groupings', JSON.stringify({ uid: 'other', items: { gzz: { id: 'gzz', list: 'master', name: 'ほかの人', gb: null, picks: [], at: 9e12 } } })); } catch (e) {} });
const pg4 = await open(cx4);
await pg4.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
await wait(1500);
ck('ほかのアカウントの控えは送らず、画面にも出さない', !CLOUD[GDOC].items.gzz && !(await pg4.evaluate(() => wkGroupings.list().some(e => e.id === 'gzz'))));
await cx4.close();
// ⑬ バックアップ: 書き出しに入り、復元は足し合わせ
const raw = await pg.evaluate(() => wkGroupings.raw());
ck('バックアップに入る', Object.keys(raw.items).length === ids1.length + 1);
await pg.evaluate(() => wkGroupings.importMerge({ items: { gbk1: { id: 'gbk1', list: 'master', name: '復元したもの', gb: null, picks: [], showNone: true, created: 1, at: 5 } } }));
ck('復元は足し合わせ（今あるものは消さない）', await pg.evaluate(n => wkGroupings.list().length === n + 2 && wkGroupings.list().some(e => e.name === '復元したもの'), ids1.length));
await pg.evaluate(() => wkGroupings.importMerge({ items: {} }));
ck('空の復元で何も消えない', await pg.evaluate(n => wkGroupings.list().length === n + 2, ids1.length));
// ⑭ 「すべて」のとき、ふだんの表とカードは開く前と同じ（見出しの行は入らない）
await pg.evaluate(() => wkGroupings._pick('all'));
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const plainAfter = await pg.evaluate(() => document.getElementById('orgList').innerHTML);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(300);
ck('「すべて」のときの表には見出しの行が入らない', !plainAfter.includes('org-group-hd'), plainAfter.length);
ck('「すべて」のときはふだんのカード一覧が出る', await pg.evaluate(() => getComputedStyle(document.getElementById('cardList')).display !== 'none' && !document.getElementById('lib-card-host').classList.contains('svt-on')));
console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await cx2.close(); await cx.close(); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
