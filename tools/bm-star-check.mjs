// ═══ ブックマークの星（v52.981・オーナー決定 mock-bm-star.html の B「右（編集の前）」） ═══
// 使い方: node tools/bm-star-check.mjs
// 本物の index.html で:
//   ① 各行の右・「編集」の前に ☆。押すと ★（v.bookmarks[i].star = true・行が色づく・保存が呼ばれる）、もう一度押すと star の欄を消す
//   ② 見出しの「★だけ表示」: 星が1つも無ければ出さない／押すと星の行だけ・星の無い区切りの仕切りは出さず、星のある区切りは閉じていても開いて出す
//      仕切りの右に ★N／全部外すと「★を付けたブックマークはありません」（押している間はボタンを消さない）／表示の状態は動画のデータに書かない
//   ③ 編集中に星を押してから「閉じる」（取り消し）でも星は残る
//   ④ ノートの埋め込みプレーヤー・フローチャートが4項目だけで書き直しても、星と自動チャプターの印（auto）を引き継ぐ（wkBmKeepExtra）
//   ⑤ 自動チャプターの「自動の◯件だけ入れ替える」でも、★を付けた自動チャプターは消さない（全部入れ替えは今までどおり消す）
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
  return { rows: [...el.querySelectorAll('[data-bm-idx]')].map(r => ({ i: +r.dataset.bmIdx, star: r.querySelector('.vp-bm-star')?.textContent, starred: r.classList.contains('starred'),
      order: [...r.querySelector('div').children].map(c => c.className.includes('vp-bm-star') ? 'STAR' : /編集|保存/.test(c.textContent) ? 'EDIT' : '').filter(Boolean).join('>') })),
    divs: [...el.querySelectorAll('.vp-bm-div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()),
    btn: (() => { const b = document.querySelector('[data-bm-staronly="AAAAAAAAAAA"]'); return b ? { hidden: b.hidden, on: b.classList.contains('on') } : null; })(),
    stars: v.bookmarks.map(b => b.star === true ? 1 : ('star' in b ? 'x' : 0)).join(''), saves: window.__saves,
    empty: /★を付けたブックマークはありません/.test(el.textContent) };
});
console.log('── ① ──');
let s = await S();
ck('① 各行の右・「編集」の前に ☆ がある', s.rows.length === 4 && s.rows.every(r => r.star === '☆' && r.order === 'STAR>EDIT'), s.rows);
ck('② 星が1つも無ければ「★だけ表示」は出さない', s.btn && s.btn.hidden === true, s.btn);
await pg.evaluate(() => { window.__saves = 0; });
await pg.click('[data-bm-idx="2"] .vp-bm-star');
s = await S();
ck('① 押すと ★ になり、行が色づき、データに star:true・保存が呼ばれる', s.rows.find(r => r.i === 2).star === '★' && s.rows.find(r => r.i === 2).starred && s.stars === '0010' && s.saves === 1, s);
ck('② 星が付くと「★だけ表示」が出る・仕切りに ★1', s.btn.hidden === false && s.divs.some(d => /前半/.test(d) && /★1/.test(d)) && !s.divs.some(d => /後半/.test(d) && /★/.test(d)), s);
await pg.click('[data-bm-idx="2"] .vp-bm-star'); s = await S();
ck('① もう一度押すと外れ、star の欄も消える', s.stars === '0000' && s.rows.find(r => r.i === 2).star === '☆', s.stars);

console.log('── ② ★だけ表示 ──');
await pg.click('[data-bm-idx="2"] .vp-bm-star');
await pg.evaluate(() => window.vpDivFoldAll('AAAAAAAAAAA'));   // 全部閉じる
await pg.click('[data-bm-staronly="AAAAAAAAAAA"]'); s = await S();
ck('② 押すと星の行だけ・閉じた区切りでも開いて出す・星の無い区切りの仕切りは出さない', JSON.stringify(s.rows.map(r => r.i)) === '[2]' && s.divs.length === 1 && /前半/.test(s.divs[0]) && s.btn.on, s);
await pg.click('[data-bm-idx="2"] .vp-bm-star'); s = await S();
ck('② 全部外すと「★を付けたブックマークはありません」・押している間はボタンを消さない', s.empty && s.btn.hidden === false && s.btn.on, s);
await pg.click('[data-bm-staronly="AAAAAAAAAAA"]'); s = await S();
ck('② もう一度押すと元に戻る・ボタンは隠れる', !s.btn.on && s.btn.hidden === true && s.divs.length === 2, s);
const keys = await pg.evaluate(() => JSON.stringify(window.videos[0]));
ck('② 「★だけ表示」の状態は動画のデータに書かない', !/staronly|starOnly/i.test(keys));

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
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ ブックマークの星');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
