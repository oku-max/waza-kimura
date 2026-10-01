// ═══ 表の見出しの ⇅（v52.924） ═══
// 使い方: node tools/th-sort-check.mjs
//
// オーナー「ヘッダー名を押したときは今まで通りパネルが出てもいいが、上下の矢印を押したときは
// そのまま昇順・降順を変更できるように」。本物の index.html で見ること:
//   ① 標準の列（チャンネル）の ⇅ を押すと、メニューを開かずに昇順 → もう一度で降順。行の並びも変わる
//   ② 見出しの名前を押すと、今までどおりメニューが開く
//   ③ Title の ⇅ も同じ。名前を押せば Title のメニュー
//   ④ 並べ替えの処理が無い列（要約/メモ）には ⇅ を出さない（押しても何も起きないボタンを置かない）
//   ⑤ カスタム列の ⇅ も同じ（メニューを開かず、昇順 → 降順。行の並びも変わる）
//   ⑥ 動画のデータとリストの保存内容を変えない
//     ・旧画面（モーダル・テンプレート・一括削除）が戻っていない
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8207;
const LOC = process.argv[2] === 'en' ? 'en' : 'ja';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: LOC === 'en' ? 'en-US' : 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
// Firebase は読めないと index.html の本体（module）ごと止まるので、何もしない偽物を返す（ログインしていない状態）
const FB_STUB = `(function(){ if (window.firebase) return;
  const noop=()=>{}; const p=(v)=>Promise.resolve(v);
  const doc=()=>({ get:()=>p({exists:false,data:()=>({})}), set:()=>p(), update:()=>p(),
                   delete:()=>p(), collection, onSnapshot:()=>noop });
  function collection(){ return { doc, get:()=>p({empty:true,docs:[],forEach:noop}),
                                  where(){return this}, orderBy(){return this}, limit(){return this},
                                  onSnapshot:()=>noop }; }
  const auth=()=>({ onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return noop; },
                    signInWithPopup:()=>p({user:null}), signOut:()=>p(), currentUser:null });
  auth.GoogleAuthProvider=function(){ this.addScope=noop; this.setCustomParameters=noop; };
  const firestore=()=>({ collection, doc, settings:noop, batch:()=>({set:noop,update:noop,delete:noop,commit:()=>p()}),
                         enablePersistence:()=>p(), runTransaction:()=>p() });
  firestore.FieldValue={ arrayUnion:(...a)=>a, arrayRemove:(...a)=>a, serverTimestamp:()=>new Date(), delete:()=>null };
  window.firebase={ initializeApp:()=>({}), apps:[], auth, firestore,
                    storage:()=>({ ref:()=>({ put:()=>p(), getDownloadURL:()=>p('') }) }) };
 })();`;
await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status:200, contentType:'text/javascript', body: FB_STUB }));
await ctx.addInitScript(l => { localStorage.setItem('wk_lang', l); }, LOC);
const VIEWS = [{ id:'_a', label:'リストA', saveMode:'static', viewType:'table', videoIds:['v1','v2','v3'],
  columns:[{ id:'col201', type:'text', label:'メモX' }], rowData:{ v1:{ col201:'b' }, v2:{ col201:'c' }, v3:{ col201:'a' } } }];
await ctx.addInitScript(v => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now()));
  if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded','1'); localStorage.setItem('wk_cv_views', JSON.stringify(v)); } }, VIEWS);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); if (!ok) fail++; };
const wait = ms => pg.waitForTimeout(ms);
await pg.evaluate(() => {
  window.libSbClose?.();
  window.videos.length = 0;
  [['v1','Tb','chb'],['v2','Tc','chc'],['v3','Ta','cha']].forEach(([id,t,ch]) => window.videos.push({ id, pt:'youtube', title:t, ch, tb:[], cat:[], pos:[], tags:[], memo:'' }));
  window.__vsnap = JSON.stringify(window.videos);
  window._cvSetView('table');
});
await wait(700);
const st = () => pg.evaluate(() => ({ col: window.orgSortCol, asc: window.orgSortAsc,
  dd: !!(document.getElementById('org-col-filter-dd') || document.getElementById('org-title-menu-dd') || document.getElementById('cv-th-dd') || document.querySelector('.cv-th-dropdown')),
  order: [...document.querySelectorAll('#orgList tr.org-tr')].map(r => (r.textContent.match(/T[abc]/) || [''])[0]).join(','),
  ind: document.querySelector('#org-th-channel .org-sort-ind')?.textContent }));
const closeAll = async () => { await pg.mouse.click(700, 880); await wait(250); };

console.log('── 標準の列 ──');
let s0 = await st();
await pg.click('#org-th-channel .org-sort-ind'); await wait(300); let s1 = await st();
ck('① ⇅ を押すとメニューを開かずに昇順', s1.col === 'channel' && s1.asc === true && !s1.dd && s1.order === 'Ta,Tb,Tc' && s1.ind === '▲', [s0, s1]);
await pg.click('#org-th-channel .org-sort-ind'); await wait(300); let s2 = await st();
ck('① もう一度押すと降順', s2.col === 'channel' && s2.asc === false && !s2.dd && s2.order === 'Tc,Tb,Ta' && s2.ind === '▼', s2);
await pg.click('#org-th-channel span:not(.org-sort-ind):not(.org-filt-icon)'); await wait(300); let s3 = await st();
ck('② 見出しの名前を押すと、今までどおりメニューが開く（並びは変えない）', s3.dd && s3.col === 'channel' && s3.asc === false, s3);
await closeAll();
await pg.click('th[data-fixed="title"] .org-sort-ind'); await wait(300); let s4 = await st();
ck('③ Title の ⇅ もメニューを開かずに並べ替える', s4.col === 'title' && s4.asc === true && !s4.dd && s4.order === 'Ta,Tb,Tc', s4);
await pg.click('th[data-fixed="title"] span:not(.org-sort-ind)'); await wait(300); let s5 = await st();
ck('③ Title の名前を押すと Title のメニュー', s5.dd, s5);
await closeAll();
const memo = await pg.evaluate(() => { const th = document.getElementById('org-th-memo'); return th ? { has: true, ind: !!th.querySelector('.org-sort-ind') } : { has: false }; });
ck('④ 要約/メモの列には ⇅ を出さない', !memo.has || !memo.ind, memo);

console.log('── カスタム列 ──');
await pg.evaluate(() => window._cvPickerSelect('_a')); await wait(900);
await pg.evaluate(() => window._cvSetView('table')); await wait(700);
const cstat = () => pg.evaluate(() => { const th = document.querySelector('#orgTheadRow .cv-custom-th[data-col-id="col201"]');
  return { th: !!th, ind: th?.querySelector('.cv-sort-ind')?.textContent,
    dd: (() => { const d = document.getElementById('cv-th-dropdown'); return !!(d && d.style.display !== 'none' && d.getBoundingClientRect().width > 0); })(),
    order: [...document.querySelectorAll('#orgList tr.org-tr')].map(r => (r.textContent.match(/T[abc]/) || [''])[0]).join(',') }; });
await pg.click('th[data-fixed="title"] .org-sort-ind'); await wait(300);   // 先に Title の降順にしておく（③で昇順になっている）（カスタム列の昇順と並びが違うように）
let c0 = await cstat();
ck('カスタム列の見出しが出る', c0.th && !c0.dd && c0.order === 'Tc,Tb,Ta', c0);
await pg.click('#orgTheadRow .cv-custom-th[data-col-id="col201"] .cv-sort-ind'); await wait(400); let c1 = await cstat();
ck('⑤ カスタム列の ⇅ でメニューを開かずに昇順（値 a,b,c の順＝Ta,Tb,Tc）', c1.ind === '▲' && !c1.dd && c1.order === 'Ta,Tb,Tc', [c0, c1]);
await pg.click('#orgTheadRow .cv-custom-th[data-col-id="col201"] .cv-sort-ind'); await wait(400); let c2 = await cstat();
ck('⑤ もう一度で降順', c2.ind === '▼' && !c2.dd && c2.order === 'Tc,Tb,Ta', c2);
const _box = await pg.evaluate(() => { const th = document.querySelector('#orgTheadRow .cv-custom-th[data-col-id="col201"]'); const r = th.getBoundingClientRect(); const i = th.querySelector('.cv-sort-ind').getBoundingClientRect(); return { x: (r.left + i.left) / 2, y: i.top + i.height / 2 }; });
await pg.mouse.click(_box.x, _box.y); await wait(400); let c3 = await cstat();
ck('⑤ カスタム列も名前を押せば今までどおりメニュー', c3.dd && c3.ind === '▼', c3);
await closeAll();
const keep = await pg.evaluate(v => ({ vids: JSON.stringify(window.videos) === window.__vsnap, rd: JSON.stringify(JSON.parse(localStorage.getItem('wk_cv_views')).find(x => x.id === '_a').rowData) === JSON.stringify(v[0].rowData) }), VIEWS);
ck('⑥ 動画のデータとリストの値を変えない', keep.vids && keep.rd, keep);
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 表の見出しの ⇅: 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
