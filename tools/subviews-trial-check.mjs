// ═══ ビュー（試験版）が何も書かないこと（v53.037）═══
// 使い方: node tools/subviews-trial-check.mjs
// オーナーが本物のデータで「リストの中のビュー（絞り込み＋グループ分け）」を試すための画面。読むだけで、
// ビューの一覧もドラッグの結果も画面の変数にだけ持つ。本物の index.html と firebase.js を偽のクラウドにつなぎ、
// 試して閉じた後に 動画・localStorage・クラウド が1文字も変わっていないことを見る。
// 動かしたときに本物のタグへ書くよう壊すと赤くなることを確認済み。SHOT=ディレクトリ で画面を撮る。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8291;
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




const cx = await newCtx();
await cx.addInitScript(s => { try { localStorage.setItem('wk_cv_shared', s); } catch (e) {} }, JSON.stringify(SHARED));
const pg = await open(cx);
await pg.waitForFunction(() => window.wkSubviewsTrial && (window.videos || []).length >= 4, null, { timeout: 30000 });
await pg.waitForTimeout(2500);
const snap = () => pg.evaluate(async () => ({ vids: JSON.stringify(window.videos), ls: JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])), cloud: await window.__fsAll() }));
await pg.waitForFunction(() => getComputedStyle(document.getElementById('svt-open-btn')).display !== 'none', null, { timeout: 8000 }).catch(() => {});
ck('オーナーのとき、入口のボタンが出る', await pg.evaluate(() => getComputedStyle(document.getElementById('svt-open-btn')).display !== 'none'));
const libW0 = await pg.evaluate(() => { const c = document.querySelector('#lib-card-host .card-wrap'); return c && c.offsetWidth; });
const before = await snap();
await pg.evaluate(() => document.getElementById('svt-open-btn').click());
ck('開くと試験版の画面が出る・「何も保存しません」', await pg.evaluate(() => !!document.getElementById('svt-root') && document.getElementById('svt-root').textContent.includes('何も保存しません')));
const cwChk = await pg.evaluate(w => ({ lib: w, cw: getComputedStyle(document.getElementById('svt-root')).getPropertyValue('--svt-cw').trim() }), libW0);
ck('カードの幅はライブラリのカードと同じ（開いた時点で測る）', !!cwChk.lib && cwChk.cw === cwChk.lib + 'px', cwChk);
const gks = await pg.evaluate(() => wkSubviewsTrial._groupers().map(g => g.key + ':' + g.kind));
ck('グループ分け: タグ・プレイリスト・チャンネル・カスタム列（セレクト・評価だけ）', gks.includes('pl:src') && gks.includes('ch:src') && gks.some(k => k.startsWith('tag:')) && gks.includes('cf:gc_phase1:one') && gks.includes('cf:gc_star1:one') && !gks.some(k => k.includes('gc_txt1')), gks);
// タグ1でまとめるビューを作る
const tbKey = await pg.evaluate(() => (wkSubviewsTrial._groupers().find(g => g.kind === 'tag' && g.sub === 'タグ1') || {}).key);
await pg.evaluate(k => { wkSubviewsTrial._new(); wkSubviewsTrial._en('タグ1別'); wkSubviewsTrial._eg(k); wkSubviewsTrial._es(); }, tbKey);
const cols = () => pg.evaluate(() => [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')].map(c => c.querySelector('.svt-tag').textContent + '=' + c.querySelectorAll('.svt-card').length));
if (process.env.SHOT) { await pg.screenshot({ path: process.env.SHOT + '/svt-pc.png' }); await pg.setViewportSize({ width: 390, height: 800 }); await pg.screenshot({ path: process.env.SHOT + '/svt-sp.png' }); await pg.setViewportSize({ width: 1400, height: 900 }); }
const c1 = await cols();
const cardW = await pg.evaluate(w => { const c = document.querySelector('#svt-root .svt-col:not(.svt-addcol) .svt-card'); return { trial: c && c.offsetWidth, lib: w }; }, libW0);
console.log('    幅', JSON.stringify(cardW));
ck('並んだカードの幅がライブラリのカードと同じ（±2px）', !!cardW.lib && Math.abs(cardW.trial - cardW.lib) <= 2, cardW);
ck('アーカイブを出さない・複数のタグは両方の列に出る・なしの列が先頭', c1[0].endsWith('なし=1') && c1.includes('ボトム=2') && c1.includes('スタンディング=1') && c1.includes('トップ=1'), c1);
await pg.evaluate(k => wkSubviewsTrial._move('v2', k, 'ボトム', 'トップ'), tbKey);
const c2 = await cols();
ck('動かすと画面の列は変わる（ボトム→トップ、スタンディングは残る）', c2.includes('ボトム=1') && c2.includes('トップ=2') && c2.includes('スタンディング=1'), c2);
ck('本物の動画のタグは変わらない', await pg.evaluate(() => JSON.stringify(window.videos.find(v => v.id === 'v2').tb) === JSON.stringify(['ボトム','スタンディング'])));
await pg.evaluate(() => wkSubviewsTrial._undo());
ck('取り消すと画面も戻る', JSON.stringify(await cols()) === JSON.stringify(c1), await cols());
await pg.evaluate(k => wkSubviewsTrial._move('v4', k, '\u0000none', 'ボトム'), tbKey);
// タグを選んでまとめる（タグ1の中から スタンディング・トップ だけを列にする）
await pg.evaluate(() => wkSubviewsTrial._reset());
// タググループを押すと、その下に中のタグが全部選ばれた状態で開く（「タグを選んでまとめる」のボタンは無い）
const ed0 = await pg.evaluate(k => { wkSubviewsTrial._new(); wkSubviewsTrial._en('選んだタグ'); wkSubviewsTrial._eg(k);
  const st = wkSubviewsTrial._state(); return { picks: st.editing.picks.map(p => p.v), hasOldBtn: document.getElementById('svt-ed').textContent.includes('タグを選んでまとめる'), open: !!document.querySelector('#svt-ed .svt-pick') }; }, tbKey);
ck('タググループを押すと、その下にそのグループのタグが全部選ばれた状態で開く・「タグを選んでまとめる」のボタンは無い', ed0.open && !ed0.hasOldBtn && ed0.picks.length === 3 && ['トップ','ボトム','スタンディング'].every(x => ed0.picks.includes(x)), ed0);
await pg.evaluate(() => { const st = wkSubviewsTrial._state(); st.editing.picks.map(p => p.v).forEach(v => wkSubviewsTrial._pv(v)); wkSubviewsTrial._pv('スタンディング'); wkSubviewsTrial._pv('トップ'); wkSubviewsTrial._es(); });
const p1 = await cols();
ck('タグを選んでまとめる: 選んだタグだけが選んだ順に列になる・その他 が先頭', JSON.stringify(p1) === JSON.stringify(['その他=2','スタンディング=1','トップ=1']), p1);
await pg.evaluate(() => wkSubviewsTrial._move('v2', 'pick', 'スタンディング', 'トップ'));
const p2 = await cols();
ck('選んだタグの列のあいだを動かすと画面だけ変わる', JSON.stringify(p2) === JSON.stringify(['その他=2','スタンディング=0','トップ=2']), p2);
ck('選んだタグで動かしても本物の動画のタグは変わらない', await pg.evaluate(() => JSON.stringify(window.videos.find(v => v.id === 'v2').tb) === JSON.stringify(['ボトム','スタンディング'])));
await pg.evaluate(() => wkSubviewsTrial._undo());
ck('取り消すと戻る', JSON.stringify(await cols()) === JSON.stringify(p1), await cols());
// Option（Alt）を押しながらのドラッグ＝両方に入れる／移動の直後の「両方に残す」
await pg.evaluate(() => wkSubviewsTrial._move('v2', 'pick', 'スタンディング', 'トップ', true));
const cp1 = await cols();
ck('Option を押しながら動かすと、元の列にも残ったまま先の列にも入る', JSON.stringify(cp1) === JSON.stringify(['その他=2','スタンディング=1','トップ=2']), cp1);
ck('両方に入れても本物の動画のタグは変わらない', await pg.evaluate(() => JSON.stringify(window.videos.find(v => v.id === 'v2').tb) === JSON.stringify(['ボトム','スタンディング'])));
await pg.evaluate(() => wkSubviewsTrial._undo());
ck('両方に入れたのも取り消せる', JSON.stringify(await cols()) === JSON.stringify(p1), await cols());
await pg.evaluate(() => wkSubviewsTrial._move('v2', 'pick', 'スタンディング', 'トップ'));
const kb = await pg.evaluate(() => [...document.querySelectorAll('#svt-toast button')].map(b => b.textContent));
ck('ふつうに動かした直後のお知らせに「両方に残す」と「取り消す」が出る', kb.includes('両方に残す') && kb.includes('取り消す'), kb);
await pg.evaluate(() => wkSubviewsTrial._tx());
const kb2 = await cols();
ck('「両方に残す」を押すと、元の列にも戻って両方に入る', JSON.stringify(kb2) === JSON.stringify(['その他=2','スタンディング=1','トップ=2']), kb2);
await pg.evaluate(() => wkSubviewsTrial._undo());
ck('その後の取り消しで、動かす前に戻る', JSON.stringify(await cols()) === JSON.stringify(p1), await cols());
// 本物のドラッグの出来事（dragstart → dragover → drop）で、Alt を押したときだけ両方に入る
const dnd = alt => pg.evaluate(alt => {
  const cols = [...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol)')];
  const from = cols.find(c => c.querySelector('.svt-tag').textContent === 'スタンディング'); const to = cols.find(c => c.querySelector('.svt-tag').textContent === 'トップ');
  const card = from.querySelector('.svt-card[draggable=true]'); const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, altKey: alt }));
  const copyLook = to.classList.contains('copy');
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, altKey: alt }));
  return copyLook; }, alt);
const look1 = await dnd(true);
ck('Alt を押したドラッグ中は落とす先に「＋ 追加」の見た目・落とすと両方に入る', look1 && JSON.stringify(await cols()) === JSON.stringify(['その他=2','スタンディング=1','トップ=2']), [look1, await cols()]);
await pg.evaluate(() => wkSubviewsTrial._undo());
const look2 = await dnd(false);
ck('何も押さないドラッグは移動', !look2 && JSON.stringify(await cols()) === JSON.stringify(['その他=2','スタンディング=0','トップ=2']), [look2, await cols()]);
await pg.evaluate(() => wkSubviewsTrial._undo());
await pg.evaluate(() => { wkSubviewsTrial._edit(); wkSubviewsTrial._pn(false); wkSubviewsTrial._es(); });
ck('「その他」を出さないこともできる', JSON.stringify(await cols()) === JSON.stringify(['スタンディング=1','トップ=1']), await cols());
// その場で新しいタグを足す（試験版: 選択肢・動画には書かない）
const opts0 = await pg.evaluate(k => JSON.stringify(window.tagRegistry.group(k.slice(4)).allOptions), tbKey);
await pg.evaluate(k => { wkSubviewsTrial._pick(wkSubviewsTrial._state().views.find(v => v.name === 'タグ1別').id); }, tbKey);
await pg.evaluate(() => { document.getElementById('svt-newcol').value = '膝立ち'; wkSubviewsTrial._addCol(); });
const n1 = await cols();
ck('タグでまとめた列に、その場で新しいタグの列を足せる（0本で出る）', n1.includes('膝立ち=0'), n1);
await pg.evaluate(k => wkSubviewsTrial._move('v4', k, '\u0000none', '膝立ち'), tbKey);
ck('足した列へ動かすと画面では付く', (await cols()).includes('膝立ち=1'), await cols());
ck('足したタグは本物の選択肢に入らない・動画にも付かない', await pg.evaluate(([k, o]) => JSON.stringify(window.tagRegistry.group(k.slice(4)).allOptions) === o && JSON.stringify(window.videos.find(v => v.id === 'v4').tb) === '[]', [tbKey, opts0]));
await pg.evaluate(() => wkSubviewsTrial._pick(wkSubviewsTrial._state().views.find(v => v.name === '選んだタグ').id));
await pg.evaluate(() => { document.getElementById('svt-newcol').value = '座り'; wkSubviewsTrial._addCol(); });
ck('選んだタグでまとめたビューでも、新しいタグの列を足すと選んだ列の最後に入る', JSON.stringify(await cols()) === JSON.stringify(['スタンディング=1','トップ=1','座り=0']), await cols());
await pg.evaluate(() => { wkSubviewsTrial._edit(); document.getElementById('svt-pnew').value = '後ろ重心'; wkSubviewsTrial._pnew(); wkSubviewsTrial._es(); });
ck('選ぶ画面でも新しいタグを足して選べる', (await cols()).includes('後ろ重心=0'), await cols());
// 新しいタググループ（試験版: tagRegistry に書かない）
const ng0 = await pg.evaluate(() => window.tagRegistry.groups().length);
await pg.evaluate(() => { wkSubviewsTrial._new(); wkSubviewsTrial._en('進捗');
  document.getElementById('svt-ngroup').value = '進捗'; wkSubviewsTrial._ng();
  document.getElementById('svt-pnew').value = '理解した'; wkSubviewsTrial._pnew();
  document.getElementById('svt-pnew').value = '使える'; wkSubviewsTrial._pnew(); wkSubviewsTrial._es(); });
const g1 = await cols();
ck('その場で新しいタググループを作り、そのタグを列にできる（最初は全部「進捗なし」）', JSON.stringify(g1) === JSON.stringify(['進捗なし=4','理解した=0','使える=0']), g1);
await pg.evaluate(() => { const g = wkSubviewsTrial._groupers().find(x => x.name === '進捗'); wkSubviewsTrial._move('v1', 'pick', '\u0000none', '使える'); });
ck('作ったグループの列へ動かせる', (await cols()).includes('使える=1'), await cols());
ck('作ったタググループは本物のタグの一覧に入らない', await pg.evaluate(n => window.tagRegistry.groups().length === n && !window.tagRegistry.groups().some(g => g.name === '進捗'), ng0));
if (process.env.SHOT) { await pg.evaluate(() => { document.getElementById('ob-start')?.remove(); document.querySelectorAll('.ob-overlay,#ob-overlay').forEach(e => e.remove()); const sb = document.getElementById('libSidebar'); if (sb) sb.style.display = 'none'; wkSubviewsTrial._edit(); }); await pg.screenshot({ path: process.env.SHOT + '/svt-pick.png' }); await pg.evaluate(() => wkSubviewsTrial._ec()); }
await pg.evaluate(() => { wkSubviewsTrial._new(); wkSubviewsTrial._eg('cf:gc_phase1'); wkSubviewsTrial._es(); });
await pg.evaluate(() => wkSubviewsTrial._move('v1', 'cf:gc_phase1', '学習中', '使えてる'));
await pg.evaluate(() => { wkSubviewsTrial._new(); wkSubviewsTrial._eg('pl'); wkSubviewsTrial._es(); });
ck('プレイリストは動かせない（ドラッグできるカードが無い）', await pg.evaluate(() => document.querySelectorAll('#svt-root .svt-card[draggable=true]').length === 0));
await pg.evaluate(() => wkSubviewsTrial._mode('board'));
await pg.evaluate(() => { window.filters.playlist.add('ラッソー対策集'); window.AF(); });
await pg.waitForTimeout(500);
const fc = await pg.evaluate(() => ({ sum: document.getElementById('svt-sum').textContent, n: new Set([...document.querySelectorAll('#svt-root .svt-col:not(.svt-addcol) .svt-card')].map(c => c.querySelector('.svt-tt').textContent)).size }));
ck('サイドバーと同じフィルター（window.filters＋AF）を掛けると、試験版もその場で描き直る', /（2本）/.test(fc.sum) && fc.n === 2, fc);
await pg.evaluate(() => { window.filters.playlist.clear(); window.AF(); });
await pg.waitForTimeout(500);
ck('フィルターを外すと元の本数に戻る', /（4本）/.test(await pg.evaluate(() => document.getElementById('svt-sum').textContent)));
await pg.evaluate(() => { wkSubviewsTrial.close(); document.body.style.zoom = '1.25'; });
await pg.waitForTimeout(400);
const zLib = await pg.evaluate(() => { const c = document.querySelector('#lib-card-host .card-wrap'); return c && c.getBoundingClientRect().width; });
await pg.evaluate(() => { document.getElementById('svt-open-btn').click(); wkSubviewsTrial._pick(wkSubviewsTrial._state().views.find(v => v.name === 'タグ1別').id); });
const zW = await pg.evaluate(w => { const c = document.querySelector('#svt-root .svt-col:not(.svt-addcol) .svt-card'); return { trial: c && c.getBoundingClientRect().width, lib: w }; }, zLib);
console.log('    幅(zoom 1.25)', JSON.stringify(zW));
ck('表示の大きさ（zoom）を変えていても、画面上の幅がライブラリのカードと同じ（±3px）', !!zW.lib && Math.abs(zW.trial - zW.lib) <= 3, zW);
await pg.evaluate(() => { document.body.style.zoom = ''; });
await pg.evaluate(() => wkSubviewsTrial._mode('table'));
ck('テーブル表示も出る', await pg.evaluate(() => document.querySelectorAll('#svt-root tr.gh').length >= 3));
ck('プレイリストでまとめたテーブルに「プレイリスト」の列が2本出ない', await pg.evaluate(() => [...document.querySelectorAll('#svt-root th')].filter(th => th.textContent === 'プレイリスト').length === 1));
const lay = await pg.evaluate(() => { const hdr = document.getElementById('lib-results-header'); const seg = document.getElementById('svt-seg');
  const libSeg = [...hdr.querySelectorAll('.hdr-lvt')].find(x => x.id !== 'svt-seg'); const rc = document.getElementById('rc'); const sb = document.getElementById('lib-sb-toggle-btn');
  const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.offsetWidth > 0;
  return { segInHdr: !!seg && hdr.contains(seg), segVis: vis(seg), libSegHidden: !vis(libSeg), rcVis: vis(rc), sbVis: vis(sb), rcLeft: rc && seg && rc.getBoundingClientRect().left < seg.getBoundingClientRect().left,
    cardListHidden: !vis(document.getElementById('cardList')), active: document.getElementById('svt-mt').classList.contains('lvt-active'),
    rcN: (rc.textContent.match(/(\d+)\s*本/) || [])[1], sumN: (document.getElementById('svt-sum').textContent.match(/（(\d+)本）/) || [])[1] }; });
ck('ライブラリの上の帯（≡・本数と時間）がそのまま出ていて、試験版の「カード｜テーブル」がその並びにある（ライブラリのは隠れる）', lay.segInHdr && lay.segVis && lay.libSegHidden && lay.rcVis && lay.sbVis && lay.rcLeft && lay.active && lay.cardListHidden, lay);
ck('上の本数（ライブラリの数え方）と試験版の本数が同じ', lay.rcN && lay.rcN === lay.sumN, lay);
await pg.evaluate(() => wkSubviewsTrial.close());
ck('閉じるとライブラリのカード一覧と「カード｜テーブル」が元どおり', await pg.evaluate(() => { const vis = el => !!el && getComputedStyle(el).display !== 'none';
  const libSeg = [...document.querySelectorAll('#lib-results-header .hdr-lvt')]; return !document.getElementById('svt-root') && !document.getElementById('svt-seg') && libSeg.length === 1 && vis(libSeg[0]) && vis(document.getElementById('cardList')); }));
await pg.waitForTimeout(3500);   // 保存の遅延（debounce）を待つ
const after = await snap();
ck('閉じた後: 動画のデータが1文字も変わっていない', before.vids === after.vids);
ck('閉じた後: localStorage が1文字も変わっていない', before.ls === after.ls, [before.ls.length, after.ls.length]);
ck('閉じた後: クラウドが1文字も変わっていない', before.cloud === after.cloud);
await reload(pg);
ck('再読み込みすると試したビューは残らない', await pg.evaluate(() => wkSubviewsTrial._state().views.length === 1 && wkSubviewsTrial._state().sim.size === 0));
console.log(fail ? `✗ ${fail}件` : '✓ 全部通過');
await cx.close(); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
