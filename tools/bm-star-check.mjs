// ═══ ブックマークの星（v52.981・オーナー決定 mock-bm-star.html の B「右（編集の前）」） ═══
// 使い方: node tools/bm-star-check.mjs
// 本物の index.html で:
//   ① 各行の右・「編集」の前に ☆。押すと ★（v.bookmarks[i].star = true・行が色づく・保存が呼ばれる）、もう一度押すと star の欄を消す
//   ② 見出しの「★だけ表示」: 星が1つも無ければ出さない／押すと星の行だけ・星の無い区切りの仕切りは出さず、星のある区切りは閉じていても開いて出す
//      仕切りの右に ★N／全部外すと「★を付けたブックマークはありません」（押している間はボタンを消さない）／表示の状態は動画のデータに書かない
//   ③ 編集中に星を押してから「閉じる」（取り消し）でも星は残る
//   ④ ノートの埋め込みプレーヤー・フローチャートが4項目だけで書き直しても、星と自動チャプターの印（auto）を引き継ぐ（wkBmKeepExtra）
//   ⑤ 自動チャプターの「自動の◯件だけ入れ替える」でも、★を付けた自動チャプターは消さない（全部入れ替えは今までどおり消す）
//   ⑥ 時刻を押すとジャンプ・題名と ⌄ は説明の開閉（説明の無いものは何もしない）（v52.986）
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8234;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'ja-JP' });
let googleCalls = 0;
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => { if (/googleapis\.com\/youtube/.test(r.request().url())) googleCalls++; r.abort(); });
const FB_STUB = `(function(){ if (window.firebase) return;
  const noop=()=>{}; const p=(v)=>Promise.resolve(v);
  const doc=()=>({ get:()=>p({exists:false,data:()=>({})}), set:()=>p(), update:()=>p(), delete:()=>p(), collection, onSnapshot:()=>noop });
  function collection(){ return { doc, get:()=>p({empty:true,docs:[],forEach:noop}), where(){return this}, orderBy(){return this}, limit(){return this}, onSnapshot:()=>noop }; }
  const auth=()=>({ onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return noop; }, signInWithPopup:()=>p({user:null}), signOut:()=>p(), currentUser:null });
  auth.GoogleAuthProvider=function(){ this.addScope=noop; this.setCustomParameters=noop; };
  const firestore=()=>({ collection, doc, settings:noop, batch:()=>({set:noop,update:noop,delete:noop,commit:()=>p()}), enablePersistence:()=>p(), runTransaction:()=>p() });
  firestore.FieldValue={ arrayUnion:(...a)=>a, arrayRemove:(...a)=>a, serverTimestamp:()=>new Date(), delete:()=>null };
  window.firebase={ initializeApp:()=>({}), apps:[], auth, firestore, storage:()=>({ ref:()=>({ put:()=>p(), getDownloadURL:()=>p('') }) }) };
 })();`;
await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status:200, contentType:'text/javascript', body: FB_STUB }));
await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now())); });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
pg.on('dialog', d => d.accept().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });

let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
await pg.evaluate(() => {
  window.videos.length = 0;
  window.videos.push({ id:'AAAAAAAAAAA', ytId:'AAAAAAAAAAA', pt:'youtube', title:'教則A', duration: 1800, tb:[], cat:[], pos:[], tags:[],
    bookmarks:[{time:0,label:'イントロ',note:''},{time:60,label:'姿勢',note:'右手で襟',auto:'chapter'},{time:200,label:'腕の角度',note:''},{time:900,label:'仕上げ',note:''}],
    bmDividers:[{time:60,label:'前半'},{time:900,label:'後半'}] });
  window.__saves = 0; window.debounceSave = () => { window.__saves++; };
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  window.openVPanel('AAAAAAAAAAA');
});
await pg.waitForSelector('#vp-bm-list-AAAAAAAAAAA');
await pg.evaluate(() => window.vpDivFoldAll('AAAAAAAAAAA'));
const S = () => pg.evaluate(() => {
  const el = document.getElementById('vp-bm-list-AAAAAAAAAAA'), v = window.videos[0];
  const flt = el.querySelector('.vp-bm-starflt');
  return { rows: [...el.querySelectorAll('[data-bm-idx]')].map(r => ({ i: +r.dataset.bmIdx, star: r.querySelector('.vp-bm-star')?.textContent, starred: r.classList.contains('starred'),
      w: Math.round(r.querySelector('.vp-bm-star')?.getBoundingClientRect().width || 0),
      order: [...r.querySelector('div').children].map(c => c.className.includes('vp-bm-star') ? 'STAR' : /編集|保存/.test(c.textContent) ? 'EDIT' : '').filter(Boolean).join('>') })),
    divs: [...el.querySelectorAll('.vp-bm-div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()),
    flt: flt ? [...flt.querySelectorAll('button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent).join('|') : null,
    stars: v.bookmarks.map(b => b.star === true ? 'T' : ('star' in b ? String(b.star) : 0)).join(''), saves: window.__saves,
    empty: /この数の星が付いたブックマークはありません/.test(el.textContent) };
});
const fltClick = label => pg.evaluate(l => [...document.querySelectorAll('#vp-bm-list-AAAAAAAAAAA .vp-bm-starflt button')].find(b => b.textContent === l)?.click(), label);
console.log('── ① 星は1〜3（v52.985・mock-bm-star-level.html の A「押すたびに増える」）──');
let s = await S();
ck('① 各行の右・「編集」の前に ☆ がある', s.rows.length === 4 && s.rows.every(r => r.star === '☆' && r.order === 'STAR>EDIT'), s.rows);
ck('② 星が1つも無ければ絞り込みの行は出さない', s.flt === null, s.flt);
await pg.evaluate(() => { window.__saves = 0; });
await pg.click('[data-bm-idx="2"] .vp-bm-star');
s = await S();
ck('① 押すと ★（star:1）・行が色づき・保存が呼ばれる', s.rows.find(r => r.i === 2).star === '★' && s.rows.find(r => r.i === 2).starred && s.stars === '0010' && s.saves === 1, s);
await pg.click('[data-bm-idx="2"] .vp-bm-star'); await pg.click('[data-bm-idx="2"] .vp-bm-star'); s = await S();
ck('① 押すたびに増える: ★★ → ★★★（star:3）', s.rows.find(r => r.i === 2).star === '★★★' && s.stars === '0030', s);
ck('① 星の数を変えても星のボタンの幅は同じ（題名の幅が動かない）', new Set(s.rows.map(r => r.w)).size === 1, s.rows.map(r => r.w));
ck('② 星が付くと絞り込みの行が出る（すべて／★1以上／★2以上／★3）・仕切りに ★1', s.flt === '*すべて|★1以上|★2以上|★3' && s.divs.some(d => /前半/.test(d) && /★1/.test(d)), s);
await pg.click('[data-bm-idx="2"] .vp-bm-star'); s = await S();
ck('① ★★★ の次は外れ、star の欄も消える', s.stars === '0000' && s.rows.find(r => r.i === 2).star === '☆', s.stars);
const legacy = await pg.evaluate(() => { const v = window.videos[0]; v.bookmarks[1].star = true; window.vpBmStar('AAAAAAAAAAA', 1); return v.bookmarks[1].star; });
await pg.evaluate(() => { const b = window.videos[0].bookmarks[1]; b.star = true; window.vpDivFoldAll('AAAAAAAAAAA'); window.vpDivFoldAll('AAAAAAAAAAA'); });
s = await S();
ck('① 前の版の star:true は ★1 として出し、押すと ★★（star:2）になる', legacy === 2 && s.rows.find(r => r.i === 1)?.star === '★', { legacy, s });
await pg.evaluate(() => { delete window.videos[0].bookmarks[1].star; });

console.log('── ② 絞り込み ──');
await pg.evaluate(() => { const b = window.videos[0].bookmarks; b[1].star = 1; b[2].star = 2; b[3].star = 3; window.vpDivFoldAll('AAAAAAAAAAA'); });
s = await S();
if (!s.divs.every(d => /▶/.test(d))) { await pg.evaluate(() => window.vpDivFoldAll('AAAAAAAAAAA')); }
await fltClick('★2以上'); s = await S();
ck('② ★2以上: その数以上の行だけ・閉じた区切りでも開いて出す', JSON.stringify(s.rows.map(r => r.i)) === '[2,3]' && /\*★2以上/.test(s.flt), s);
await fltClick('★3'); s = await S();
ck('② ★3: ★★★ の行だけ・その行の無い区切りの仕切りは出さない', JSON.stringify(s.rows.map(r => r.i)) === '[3]' && s.divs.length === 1 && /後半/.test(s.divs[0]), s);
await pg.evaluate(() => { const b = window.videos[0].bookmarks; delete b[3].star; window.vpBmStarMin('AAAAAAAAAAA', 3); }); s = await S();
ck('② 当てはまる行が無ければ「この数の星が付いたブックマークはありません」・絞り込みの行は残す', s.empty && s.flt && /\*★3/.test(s.flt), s);
await fltClick('すべて'); s = await S();
ck('② 「すべて」で元に戻る', /\*すべて/.test(s.flt) && !s.empty, s);
const keys = await pg.evaluate(() => JSON.stringify(window.videos[0]));
ck('② 絞り込みの状態は動画のデータに書かない', !/starMin|staronly|starOnly/i.test(keys));
await pg.evaluate(() => { const b = window.videos[0].bookmarks; delete b[1].star; delete b[2].star; window.vpBmStarMin('AAAAAAAAAAA', 0); });

console.log('── ②-2 狭いスマホ（360px）──');
await pg.setViewportSize({ width: 360, height: 780 });
await pg.evaluate(() => { const b = window.videos[0].bookmarks; b[0].star = 3; b[1].label = 'とても長い題名のブックマークで画面の幅をこえるかどうかを確かめる'; window.openVPanel('AAAAAAAAAAA'); });
await pg.waitForTimeout(400);
const nw = await pg.evaluate(() => {
  const el = document.getElementById('vp-bm-list-AAAAAAAAAAA'), r = el.getBoundingClientRect();
  const over = [...el.querySelectorAll('[data-bm-idx] > div:first-child')].some(row => { const b = row.getBoundingClientRect(); return b.right > r.right + 1 || row.scrollWidth > row.clientWidth + 1; });
  const st = el.querySelector('[data-bm-idx="0"] .vp-bm-star').getBoundingClientRect(), ed = [...el.querySelectorAll('[data-bm-idx="0"] button')].find(b => /編集/.test(b.textContent)).getBoundingClientRect();
  const edBtns = [...el.querySelectorAll('[data-bm-idx] button')].filter(b => /編集/.test(b.textContent));
  const edOneLine = edBtns.every(b => b.getBoundingClientRect().height < 24);
  return { over, edOneLine, starW: Math.round(st.width), starInside: st.right <= ed.left + 1, docW: document.documentElement.scrollWidth };
});
ck('②-2 360px でも行が横にはみ出さない・★★★ と「編集」が重ならない・ページが横に広がらない', !nw.over && nw.starInside && nw.docW <= 360, nw);
ck('②-2 題名が長くても「編集」は1行のまま（つぶれて「編／集」と割れない）', nw.edOneLine, nw);
await pg.setViewportSize({ width: 1300, height: 900 });
await pg.evaluate(() => { const b = window.videos[0].bookmarks; delete b[0].star; b[1].label = '姿勢'; window.openVPanel('AAAAAAAAAAA'); });
await pg.waitForTimeout(300);

console.log('── ③ 編集中 ──');
await pg.evaluate(() => { window.vpDivFoldAll('AAAAAAAAAAA'); });
await pg.evaluate(() => window.vpBmToggleEdit('AAAAAAAAAAA', 3));
await pg.click('[data-bm-idx="3"] .vp-bm-star');
await pg.evaluate(() => window.vpBmClose('AAAAAAAAAAA', 3));
s = await S();
ck('③ 編集中に星を押して「閉じる」でも星は残る', s.stars === '0001', s.stars);

console.log('── ④ ノート・フローチャートの書き直し ──');
const k = await pg.evaluate(() => {
  const old = [{time:0,label:'a',note:'',star:true},{time:60,label:'b',note:'x',auto:'chapter',star:true,endTime:90},{time:120,label:'c',note:''}];
  const fresh = [{time:0,label:'a',note:''},{time:60,label:'b',note:'y'},{time:130,label:'c',note:''},{time:200,label:'d',note:''}];
  return window.wkBmKeepExtra(old, fresh);
});
ck('④ 同じブックマークの星・auto を引き継ぐ・書き直した欄（note）は新しい値・外した終わり（endTime）は戻さない',
  k[0].star === true && k[1].star === true && k[1].auto === 'chapter' && k[1].note === 'y' && !('endTime' in k[1]) && !k[2].star && !k[3].star, k);
const src = await pg.evaluate(async () => [await (await fetch('/js/notes.js')).text(), await (await fetch('/js/flowchart.js')).text()]);
ck('④ ノート（_nBviSyncBmsToLib）とフローチャート（_syncBmsToLib）が wkBmKeepExtra を通して書く', src.every(t => /wkBmKeepExtra\(v\.bookmarks, fresh\)/.test(t)));

console.log('── ⑤ 自動チャプターの入れ替え ──');
const r5 = await pg.evaluate(async () => {
  const v = window.videos[0];
  v.bookmarks = [{time:0,label:'手',note:''},{time:60,label:'自動・星',note:'',auto:'chapter',star:true},{time:300,label:'自動',note:'',auto:'chapter'}];
  const of = window.fetch.bind(window);
  window.fetch = (u, o) => String(u).startsWith('/api/ai-summary')
    ? Promise.resolve(new Response(JSON.stringify({ summary: JSON.stringify({ items: [{title:'新A',start:'0:30'},{title:'新B',start:'10:00'}] }), costUsd: 0 }), { status: 200 }))
    : of(u, o);
  await window.vpGenChapters('AAAAAAAAAAA', { via: 'list', input: { text: '0:30 新A\n10:00 新B' }, replaceAuto: true, silent: true });
  const a = v.bookmarks.map(b => b.label).join(',');
  v.bookmarks = [{time:0,label:'手',note:''},{time:60,label:'自動・星',note:'',auto:'chapter',star:true}];
  await window.vpGenChapters('AAAAAAAAAAA', { via: 'list', input: { text: '0:30 新A' }, replaceAll: true, silent: true });
  window.fetch = of;
  return { auto: a, all: v.bookmarks.map(b => b.label).join(',') };
});
ck('⑤ 「自動だけ入れ替える」で★の自動チャプターは残り、★の無い自動は消える', r5.auto === '手,新A,自動・星,新B', r5);
ck('⑤ 「全部入れ替える」は今までどおり★も含めて全部消す', !/手|自動・星/.test(r5.all) && /新A/.test(r5.all), r5);
console.log('── ⑥ 押したときの動き（v52.986・オーナー「時間を押すとジャンプ／タイトルとアコーディオンボタンで開閉」）──');
await pg.evaluate(() => {
  const v = window.videos[0];
  v.bookmarks = [{time:0,label:'説明なし',note:''},{time:60,label:'説明あり',note:'右手で襟を深く持つ'}];
  v.bmDividers = [];
  window.__jumps = [];
  const orig = window.vpBmTimeClick;
  window.vpBmTimeClick = (...a) => { window.__jumps.push(a[2]); };
  window.openVPanel('AAAAAAAAAAA');
});
await pg.waitForSelector('[data-bm-idx="1"] .vp-bm-ttl');
const noteShown = () => pg.evaluate(() => !!document.querySelector('[data-bm-idx="1"] .vp-bm-note'));
await pg.click('[data-bm-idx="1"] .vp-bm-ttl');
const t1 = { open: await noteShown(), jumps: await pg.evaluate(() => window.__jumps.length) };
ck('⑥ 題名を押すと説明が開く（ジャンプしない）', t1.open && t1.jumps === 0, t1);
await pg.click('[data-bm-idx="1"] .vp-bm-ttl');
ck('⑥ もう一度題名を押すと閉じる', !(await noteShown()));
await pg.click('[data-bm-idx="1"] .vp-bm-note-tog');
ck('⑥ ⌄ でも開く', await noteShown());
await pg.click('[data-bm-idx="0"] .vp-bm-ttl');
ck('⑥ 説明の無いブックマークは、題名を押しても何もしない（ジャンプもしない）', await pg.evaluate(() => window.__jumps.length) === 0);
await pg.click('[data-bm-idx="1"] .vp-bm-tbtn');
ck('⑥ 左の時刻を押すとその時刻へジャンプ', JSON.stringify(await pg.evaluate(() => window.__jumps)) === '[60]', await pg.evaluate(() => window.__jumps));
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ ブックマークの星');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
