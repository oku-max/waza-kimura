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
const cols = pg => pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')].map(c => c.querySelector('.svt-tag').textContent + '=' + c.querySelectorAll('.svt-card').length));
const cloudVideos = () => (CLOUD['users/u1/videos.json'] || {}).videos || [];

const cx = await newCtx();
await cx.addInitScript(s => { try { localStorage.setItem('wk_cv_shared', s); } catch (e) {} }, JSON.stringify(SHARED));
const pg = await open(cx); _cx0 = pg;
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
await pg.waitForTimeout(2500);
ck('入口のボタンが誰にでも出る（オーナー専用ではない）・名前は「グルーピング」', await pg.evaluate(() => { const b = document.getElementById('svt-open-btn'); return !!b && getComputedStyle(b).display !== 'none' && b.textContent.includes('グルーピング') && !b.textContent.includes('試験'); }));
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const plainBefore = await pg.evaluate(() => document.getElementById('orgList').innerHTML);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(500);
const settingsBefore = JSON.stringify(CLOUD['users/u1/data/settings']);
await pg.evaluate(() => document.getElementById('svt-open-btn').click());
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
ck('列: タグ1なし・ボトム・トップ・スタンディング（アーカイブは出さない）', c1.includes('タグ1なし=1') && c1.includes('ボトム=2') && c1.includes('スタンディング=1') && c1.includes('トップ=1'), c1);
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
  const f = cs.find(c => c.querySelector('.svt-tag').textContent === from), t = cs.find(c => c.querySelector('.svt-tag').textContent === to);
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
// ⑤ 新しいタグ: 選択肢に足すだけ（動画には触らない）
const vidsBefore = await pg.evaluate(() => JSON.stringify(window.videos));
await pg.evaluate(() => { document.getElementById('svt-newcol').value = '膝立ち'; wkGroupings._addCol(); });
ck('列に「膝立ち」（0本）が足され、タグ1の選択肢に入る・動画は変わらない', (await cols(pg)).includes('膝立ち=0') && await pg.evaluate(k => window.tagRegistry.group(k.slice(4)).allOptions.includes('膝立ち'), tbKey) && vidsBefore === await pg.evaluate(() => JSON.stringify(window.videos)), await cols(pg));
ck('グルーピングの選んだタグにも入って保存される', await pg.evaluate(id => wkGroupings.list().find(e => e.id === id).picks.some(p => p.v === '膝立ち'), g1.id));
await pg.evaluate(() => wkGroupings._move('v4', 'pick', '\u0000none', '膝立ち'));
ck('足した列へ動かすとそのタグが付く', JSON.stringify(await vtb(pg, 'v4')) === '["膝立ち"]', await vtb(pg, 'v4'));
// ⑥ 新しいタググループ（tagRegistry.createGroup）
const ng0 = await pg.evaluate(() => window.tagRegistry.groups().length);
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('進捗');
  document.getElementById('svt-ngroup').value = '進捗'; wkGroupings._ng();
  document.getElementById('svt-pnew').value = '理解した'; wkGroupings._pnew();
  document.getElementById('svt-pnew').value = '使える'; wkGroupings._pnew(); wkGroupings._es(); });
const ngid = await pg.evaluate(() => (window.tagRegistry.groups().find(g => g.name === '進捗') || {}).id);
ck('新しいタググループが本物のタグの一覧に入る（未使用）・選択肢も入る', await pg.evaluate(([n, id]) => window.tagRegistry.groups().length === n + 1 && JSON.stringify(window.tagRegistry.group(id).allOptions) === '["理解した","使える"]' && window.tagRegistry.group(id).slot < 0, [ng0, ngid]));
ck('列: 進捗なし=4・理解した=0・使える=0', JSON.stringify(await cols(pg)) === JSON.stringify(['進捗なし=4', '理解した=0', '使える=0']), await cols(pg));
await pg.evaluate(() => wkGroupings._move('v1', 'pick', '\u0000none', '使える'));
ck('作ったグループへ動かすと v.tg[グループid] に入る', await pg.evaluate(id => JSON.stringify((window.videos.find(v => v.id === 'v1').tg || {})[id]), ngid) === '["使える"]');
// ⑦ カスタム列（セレクト・評価）
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('フェーズ'); wkGroupings._eg('cf:gc_phase1'); wkGroupings._es(); });
await pg.evaluate(() => wkGroupings._move('v1', 'cf:gc_phase1', '学習中', '使えてる'));
ck('セレクトの列へ動かすと v.cf の値が変わる', await pg.evaluate(() => window.videos.find(v => v.id === 'v1').cf.gc_phase1) === '使えてる');
await pg.evaluate(() => wkGroupings._undo());
ck('取り消すと元の値', await pg.evaluate(() => window.videos.find(v => v.id === 'v1').cf.gc_phase1) === '学習中');
await pg.evaluate(() => { wkGroupings._new(); wkGroupings._en('優先度'); wkGroupings._eg('cf:gc_star1'); wkGroupings._es(); });
await pg.evaluate(() => wkGroupings._move('v3', 'cf:gc_star1', '\u0000none', '★★★★★'));
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
const ids1 = Object.keys(CLOUD[GDOC].items).sort();
ck('クラウドの文書には items と savedBy/updatedAt だけ', JSON.stringify(Object.keys(CLOUD[GDOC]).sort()) === JSON.stringify(['items', 'savedBy', 'updatedAt']), Object.keys(CLOUD[GDOC]));
// ⑨ テーブルは本番の表に見出しの行
await pg.evaluate(id => wkGroupings._pick(id), g1.id);
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const tb = await pg.evaluate(() => ({ hd: document.querySelectorAll('#orgList tr.org-group-hd').length, rows: document.querySelectorAll('#orgList tr.org-tr').length, inOrg: document.getElementById('lib-org-host').contains(document.getElementById('svt-root')) }));
ck('テーブルは本番の表にグループの見出しの行が入る', tb.hd >= 3 && tb.rows >= 4 && tb.inOrg, tb);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(500);
// ⑩ 2台目: 開くと同じグルーピングが出る・作ると1台目に届く
const cx2 = await newCtx(); const pg2 = await open(cx2);
await pg2.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
ck('2台目にも同じグルーピングが届く', await until(() => pg2.evaluate(n => wkGroupings.list().filter(e => !e.del).length === n, ids1.length)), await pg2.evaluate(() => wkGroupings.list().map(e => e.name)));
await pg2.waitForTimeout(1500);
await pg2.evaluate(() => { wkGroupings.open(); wkGroupings._new(); wkGroupings._en('2台目で作った'); wkGroupings._eg('ch'); wkGroupings._es(); });
ck('2台目で作ると、開いたままの1台目に届く（再読み込みなし）', await until(() => pg.evaluate(() => wkGroupings.list().some(e => e.name === '2台目で作った')), 8000));
ck('2台目が書いても1台目の分は残る', await until(async () => ids1.every(id => CLOUD[GDOC].items[id]) && Object.keys(CLOUD[GDOC].items).length === ids1.length + 1));
// ⑪ 再読み込み: 開いていた状態・選んでいたグルーピングが戻る
await reload(pg);
await pg.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
ck('再読み込みしても開いたまま・同じグルーピング', await until(() => pg.evaluate(id => !!document.getElementById('svt-root') && document.querySelector('#svt-tabs .svt-vt.on')?.textContent.includes('タグ1別'), g1.id), 8000));
ck('再読み込みしても動かした結果は残る（v4 膝立ち）', JSON.stringify(await vtb(pg, 'v4')) === '["膝立ち"]');
// ⑫ クラウドを読めない端末は書かない／ほかのアカウントの控えは送らない
const cx3 = await newCtx();
await cx3.addInitScript(() => { window.__grpFail = true; });
const pg3 = await open(cx3);
await pg3.waitForFunction(() => window.wkGroupings && (window.videos || []).length >= 4, null, { timeout: 30000 });
await pg3.evaluate(() => { wkGroupings.open(); wkGroupings._new(); wkGroupings._en('読めない端末'); wkGroupings._es(); });
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
// ⑭ 閉じた後のふつうの表は、開く前と1文字も同じ
await pg.evaluate(() => wkGroupings.close());
await pg.evaluate(() => window._cvSetView('table')); await pg.waitForTimeout(700);
const plainAfter = await pg.evaluate(() => document.getElementById('orgList').innerHTML);
await pg.evaluate(() => window._cvSetView('card')); await pg.waitForTimeout(300);
const norm = h => h.replace(/膝立ち/g, '');
ck('閉じた後のふつうの表には見出しの行が残らない', !plainAfter.includes('org-group-hd'), plainAfter.length);
ck('閉じると次に開いたとき閉じたまま（この端末の好み）', await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_groupingsPrefs')).open === false));
console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await cx2.close(); await cx.close(); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
