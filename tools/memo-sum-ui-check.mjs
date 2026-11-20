// ═══ メモの要約: 開閉・⋯（さらにくわしく／ドリルにする）（v53.001・オーナー決定 mock-memo-actions.html: A ⋯ / X すぐ下 / 見出しは閉じている） ═══
// 使い方: node tools/memo-sum-ui-check.mjs   （SHOT=ディレクトリ で画面を撮る）
// 本物の index.html で（AI の返事は偽物・字幕は窓口 _vpSumKit の差し替え）:
//   ① 開いた時点で、ブックマークの見出し（.memo-sum-ch）は閉じていて行が隠れる・題と手書きのメモは見える
//   ② ▾ で見出しを開閉・題の ▾ で要約全体を開閉。押してもメモの中身（DOM・v.memo）は1文字も変わらず、保存も呼ばない・入力に入らない
//   ③ 見出しの ⋯ →「ドリルにする」はブックマークの行の DRILL と同じ（wkDrillFromBm・同じブックマーク）
//   ④ 行の ⋯ →「ドリルにする」は 行の時刻〜次の行の時刻 で今のドリルのカード。動画のデータは変えない
//   ⑤ 行の ⋯ →「さらにくわしく」は今の ✨要約 の窓を「時刻を指定」・範囲入りで開き、AI に送るのはその範囲の字幕だけ。
//      できたものはその行のすぐ下（一段下げ・開いた状態）。前のメモの文字は1文字も変えない（入れた分を除くと元と同じ）
//   ⑥ 見出しの「さらにくわしく」はその見出しのすぐ下・くわしくの行からさらにくわしく（もう一段下）・くわしくの見出しも開閉できる
//   ⑦ 保存されたメモに開閉の印（クラス・display）が混ざらない
//   ⑧ スマホ幅（390px）で横にはみ出さず、⋯ のメニューが画面の中に出る
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8248;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
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
await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done','1'); localStorage.setItem('wk_hint_ts', String(Date.now())); });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|YT is not|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.accept().catch(() => {}));
let lastReq = null, aiDelay = 0;
await pg.route('**/api/ai-summary', async r => {
  lastReq = JSON.parse(r.request().postData() || '{}');
  if (aiDelay) await new Promise(x => setTimeout(x, aiDelay));
  const cs = lastReq.cues, n = Math.min(3, cs.length);
  const items = Array.from({ length: n }, (_, k) => { const t = Math.floor(cs[Math.floor(k * cs.length / n)].t);
    return { t: Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text: 'くわしい要点' + k, shot: false }; });
  const points = (lastReq.chapters || []).map((c, i) => ({ i: i + 1, text: `章の要点${i + 1}（${c.label}）。いちばん大事なこと。` }));
  const body = { items }; if (points.length) body.points = points; if (lastReq.overview) body.overview = '全体の要約。この部分のいちばん大事なこと。';
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: JSON.stringify(body) }) });
});
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 500) : '')); if (!ok) fail++; };
const SHOT = process.env.SHOT; const shot = async n => { if (SHOT) await pg.screenshot({ path: path.join(SHOT, n + '.png') }); };
const ID = 'AAAAAAAAAAA', M = '#vp-memo-' + ID;
await pg.evaluate((ID) => {
  const ts = s => `<a class="ts-link" contenteditable="false" data-sec="${s}">▶ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</a>`;
  const memo = '<div>前から書いてあるメモ</div>'
    + `<div class="memo-sum-t">✂️ 要約　前半<span class="memo-sum-rg">2:00–10:00 · 1か所 · 合計 8分</span></div>`
    + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">1</span>姿勢${ts(120)}</div>`
    + `<div class="memo-sum-it">${ts(130)}&nbsp;背中を丸める</div><div class="memo-sum-it">${ts(200)}&nbsp;肘を締める</div>`
    + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">2</span>腕の角度${ts(300)}</div>`
    + `<div class="memo-sum-it">${ts(320)}&nbsp;手首を返す</div><div class="memo-sum-it">${ts(400)}&nbsp;肘を床に</div><div class="memo-sum-it">${ts(500)}&nbsp;脇を開けない</div>`
    + '<div>手で書いたメモ</div>';
  window.videos.length = 0;
  window.videos.push({ id: ID, ytId: ID, pt:'youtube', title:'教則A', duration: 1200, tb:[], cat:[], pos:[], tags:[], memo,
    bookmarks:[{time:0,label:'イントロ'},{time:120,label:'姿勢'},{time:300,label:'腕の角度'},{time:600,label:'移行'},{time:900,label:'仕上げ'}] });
  window.__saves = 0; window.debounceSave = () => { window.__saves++; };
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  window.openVPanel(ID);
}, ID);
await pg.waitForSelector(M);
await pg.evaluate(() => { window._vpSumKit.cues = () => ({ cues: Array.from({ length: 240 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `${i * 5}秒の話` })), label: '日本語' }); });
await pg.waitForTimeout(300);
await pg.evaluate(() => { window.__saves = 0; });
const M0 = await pg.evaluate(() => window.videos[0].memo);
await pg.waitForTimeout(1200);   // パネルを開いた後の遅れて走る描き直しが済んでから
await pg.evaluate(() => { window.__saves = 0; });
// 画面を撮ると（SHOT）Playwright が見えない文字カーソルを隠すために空の style="" を残すことがあるので、比べるときは除く
const H0 = await pg.evaluate((M) => document.querySelector(M).innerHTML.replace(/ style=""/g, ''), M);
const st = () => pg.evaluate((M) => {
  const el = document.querySelector(M), vis = e => getComputedStyle(e).display !== 'none';
  return { rows: [...el.children].map(e => (vis(e) ? '' : '-') + (e.className.replace('memo-sum-', '') || 'p') + (e.dataset.lv ? e.dataset.lv : '') + ':' + e.textContent.replace(/\s+/g, '').slice(0, 8)),
    html: el.innerHTML.replace(/ style=""/g, ''), memo: window.videos[0].memo, saves: window.__saves, focus: document.activeElement === el,
    bm: JSON.stringify(window.videos[0].bookmarks) };
}, M);
// 子要素の端（左の ▾／右の ⋯）を押す
const press = async (idx, side) => { const b = await pg.evaluate(([M, i]) => { const e = document.querySelector(M).children[i]; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; }, [M, idx]);
  await pg.mouse.click(side === 'L' ? b.l + 10 : b.r - 8, b.t + 10); await pg.waitForTimeout(120); };
const idxOf = (txt, cls) => pg.evaluate(([M, txt, cls]) => [...document.querySelector(M).children].findIndex(e => e.classList.contains(cls) && e.textContent.includes(txt)), [M, txt, cls]);

console.log('── ① 開いた時点 ──');
let s = await st();
const pat = a => new RegExp('^' + a.map(x => x.replace(/[|]/g, '\\|')).join('[^|]*\\|') + '[^|]*$');
ck('① 見出しは閉じて行が隠れる・題と手書きは見える', pat(['p:前から', 't:✂️要約', 'ch:1姿勢', '-it:▶2:10', '-it:▶3:20', 'ch:2腕の', '-it:▶5:20', '-it:▶6:40', '-it:▶8:20', 'p:手で']).test(s.rows.join('|')), s.rows);
await shot('1-open');
console.log('── ② 開閉 ──');
await press(await idxOf('姿勢', 'memo-sum-ch'), 'L');
s = await st();
ck('② ▾ で見出し1を開く（見出し2は閉じたまま）', /^p.*\|ch:1.*\|it:▶2:10.*\|it:▶3:20.*\|ch:2.*\|-it:▶5:20/.test(s.rows.join('|')), s.rows);
ck('② メモの中身・v.memo は変わらず、保存も呼ばない・入力に入らない', s.html === H0 && s.memo === M0 && s.saves === 0 && !s.focus, { saves: s.saves, focus: s.focus, same: s.html === H0 });
await press(1, 'L');
s = await st();
ck('② 題の ▾ で要約全体が隠れる（手書きは見える）', pat(['p:前から', 't:✂️要約', '-ch:1姿勢', '-it:▶2:10', '-it:▶3:20', '-ch:2腕の', '-it:▶5:20', '-it:▶6:40', '-it:▶8:20', 'p:手で']).test(s.rows.join('|')), s.rows);
await press(1, 'L');
ck('② もう一度で元どおり（見出し1は開いたまま）', (await st()).rows[3].startsWith('it:▶2:10'));
console.log('── ③ 見出しのドリル ──');
await pg.evaluate(() => { const o = window.wkDrillFromBm; window.__fromBm = []; window.wkDrillFromBm = (...a) => { window.__fromBm.push([a[0], a[1]]); return o(...a); }; });
await press(await idxOf('腕の角度', 'memo-sum-ch'), 'R');
const menu = await pg.evaluate(() => [...document.querySelectorAll('#memo-act-pop button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
ck('③ 見出しの ⋯ でメニュー（再生・くわしく・ドリル。範囲はブックマークの区間 5:00–10:00）', menu.length === 3 && /ここから再生 ?5:00/.test(menu[0]) && /さらにくわしく ?5:00–10:00/.test(menu[1]) && /ドリルにする ?5:00–10:00/.test(menu[2]), menu);
await shot('3-menu');
await pg.click('#memo-act-pop button[data-a="drill"]');
await pg.waitForTimeout(300);
const card1 = await pg.evaluate(() => (document.getElementById('vp-drill-slot')?.textContent.replace(/\s+/g, ' ') || '') + document.querySelector('#vp-drill-slot input')?.value);
ck('③ ブックマークの行の DRILL と同じ（wkDrillFromBm・腕の角度 = 2番）・カードが出る', JSON.stringify(await pg.evaluate(() => window.__fromBm)) === JSON.stringify([['AAAAAAAAAAA', 2]]) && /5:00/.test(card1) && /10:00/.test(card1), card1.slice(0, 200));
await pg.evaluate(() => window.wkDrillCancel());
console.log('── ④ 行のドリル ──');
await press(await idxOf('腕の角度', 'memo-sum-ch'), 'L');
await press(await idxOf('手首を返す', 'memo-sum-it'), 'R');
await pg.click('#memo-act-pop button[data-a="drill"]');
await pg.waitForTimeout(300);
const card2 = await pg.evaluate(() => document.getElementById('vp-drill-slot')?.textContent.replace(/\s+/g, ' ') || '');
const nm2 = await pg.evaluate(() => document.querySelector('#vp-drill-slot input')?.value);
ck('④ 行の時刻〜次の行の時刻（5:20–6:40）・名前はトラック名', /開始5:20/.test(card2) && /終了6:40/.test(card2) && nm2 === '腕の角度', { card2: card2.slice(0, 80), nm2 });
await pg.evaluate(() => window.wkDrillCancel());
s = await st();
ck('④ 動画のデータ・メモは変わらない', s.memo === M0 && s.bm === JSON.stringify((await pg.evaluate(() => window.videos[0].bookmarks))) && s.saves === 0, { saves: s.saves });
console.log('── ⑤ 行のさらにくわしく ──');
await press(await idxOf('肘を床に', 'memo-sum-it'), 'R');
await pg.click('#memo-act-pop button[data-a="more"]');
await pg.waitForSelector('#vsr-ov');
const sheet = await pg.evaluate(() => ({ tab: document.querySelector('#vsr-ov [data-tab].on')?.textContent, a: document.getElementById('vsr-inA')?.value, b: document.getElementById('vsr-inB')?.value, sub: document.querySelector('#vsr-ov .sub')?.textContent }));
ck('⑤ 今の ✨要約 の窓が「時間を指定」・6:40–8:20 入りで開き、行のすぐ下に入れると書く', sheet.tab === '時間を指定' && sheet.a === '6:40' && sheet.b === '8:20' && /「肘を床に」のすぐ下/.test(sheet.sub), sheet);
await shot('5-sheet');
await pg.click('#vsr-ov [data-act="go"]');
await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 });
await pg.waitForTimeout(200);
s = await st();
ck('⑤ さらにくわしくでは全体の要約を頼まない（v53.022）', lastReq && lastReq.overview === false, lastReq && lastReq.overview);
ck('⑤ AI に送ったのはその範囲の字幕だけ', lastReq && lastReq.cues.length > 0 && lastReq.cues.every(c => c.t >= 399 && c.t < 500), lastReq && [lastReq.cues[0], lastReq.cues.at(-1)]);
const r5 = s.rows.join('|');
ck('⑤ その行のすぐ下に一段下げて入り、開いて見える', /it:▶6:40肘を[^|]*\|dh1:🔍くわしく肘を[^|]*\|it1:▶6:40[^|]*\|it1:[^|]*\|it1:[^|]*\|it:▶8:20/.test(r5), s.rows);
const strip = await pg.evaluate((M) => { const c = document.querySelector(M).cloneNode(true); c.querySelectorAll('[data-lv]').forEach(e => e.remove()); return c.innerHTML.replace(/ style=""/g, ''); }, M);
ck('⑤ 前のメモの文字は1文字も変えない（入れた分を除くと元と同じ）・保存は1回', strip === H0 && s.memo.replace(/ style=""/g, '') === s.html && s.saves === 1, { saves: s.saves, same: strip === H0 });
console.log('── ⑥ 見出し・くわしくのくわしく・開閉 ──');
await press(await idxOf('姿勢', 'memo-sum-ch'), 'R');
await pg.click('#memo-act-pop button[data-a="more"]'); await pg.waitForSelector('#vsr-ov');
ck('⑥ 見出しのくわしくは 2:00–5:00', await pg.evaluate(() => document.getElementById('vsr-inA')?.value + '-' + document.getElementById('vsr-inB')?.value) === '2:00-5:00');
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 }); await pg.waitForTimeout(200);
s = await st();
ck('⑥ 見出しのすぐ下（その見出しの行より前）に入る', /ch:1姿勢[^|]*\|dh1:🔍くわしく姿勢[^|]*\|it1:[^|]*\|it1:[^|]*\|it1:[^|]*\|it:▶2:10/.test(s.rows.join('|')), s.rows);
const lv1 = await pg.evaluate((M) => [...document.querySelector(M).children].findIndex(e => e.dataset.lv === '1' && e.classList.contains('memo-sum-it') && /7:10/.test(e.textContent)), M);
await press(lv1, 'R');
await pg.click('#memo-act-pop button[data-a="more"]'); await pg.waitForSelector('#vsr-ov');
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 }); await pg.waitForTimeout(200);
s = await st();
ck('⑥ くわしくの行から、もう一段下（lv2）がその行のすぐ下に入る', /it1:▶7:10[^|]*\|dh2:🔍くわしく[^|]*\|it2:[^|]*\|it2:[^|]*\|it2:[^|]*\|it1:▶7:45/.test(s.rows.join('|')), s.rows);
await shot('6-nested');
const dhIdx = await pg.evaluate((M) => [...document.querySelector(M).children].findIndex(e => e.classList.contains('memo-sum-dh') && /肘を床/.test(e.textContent)), M);
await press(dhIdx, 'L');
s = await st();
ck('⑥ くわしくの見出しを閉じると、その中（一段深いものも）が隠れる', /dh1:🔍くわしく肘を[^|]*\|-it1:[^|]*\|-it1:[^|]*\|-dh2:[^|]*\|-it2:[^|]*\|-it2:[^|]*\|-it2:[^|]*\|-it1:[^|]*\|it:▶8:20/.test(s.rows.join('|')), s.rows);
console.log('── ⑨ 仕切り（v53.002・mock-memo-divider.html の ①: 表示するときに今の仕切りから当てはめる）──');
await pg.evaluate(() => { window.__saves = 0; });
const H9 = await pg.evaluate((M) => document.querySelector(M).innerHTML.replace(/ style=""/g, ''), M);
const M9 = await pg.evaluate(() => window.videos[0].memo);
await pg.evaluate(() => { window.videos[0].bmDividers = [{ time: 120, label: '前半の型' }, { time: 300, label: '腕の使い方' }]; window.wkMemoSumRepaint(); });
await pg.waitForTimeout(300);
const dv = () => pg.evaluate((M) => {
  const el = document.querySelector(M), bars = [...document.querySelectorAll('.memo-dv')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.replace(/\s+/g, ''), top: r.top, bot: r.bottom, l: r.left, r: r.right }; });
  const kids = [...el.children].map(e => { const r = e.getBoundingClientRect(); return { k: e.className.replace('memo-sum-', '') + (e.dataset.lv || ''), tx: e.textContent.replace(/\s+/g, '').slice(0, 6), top: r.top, bot: r.bottom, l: r.left, vis: getComputedStyle(e).display !== 'none' }; });
  const er = el.getBoundingClientRect();
  return { bars, kids, er: { l: er.left, r: er.right }, html: el.innerHTML.replace(/ style=""/g, ''), memo: window.videos[0].memo, saves: window.__saves };
}, M);
let d9 = await dv();
ck('⑨ 仕切りは最初は閉じている（v53.030・オーナー決定 mock-memo-fold-auto.html）・帯に「1見出し」と「すべて開く」', d9.bars.length === 2 && d9.bars.every(b => /^▸/.test(b.t) && /1見出し/.test(b.t) && /すべて開く/.test(b.t)), d9.bars);
await pg.evaluate(() => document.querySelectorAll('.memo-dv .memo-dv-f').forEach(b => b.click())); await pg.waitForTimeout(200);
await pg.evaluate(() => [...document.querySelectorAll('.memo-dv .memo-dv-f')].filter(b => b.textContent === '▸').forEach(b => b.click())); await pg.waitForTimeout(200);
d9 = await dv();
ck('⑨ 仕切りの帯が2本（前半の型・腕の使い方）出る', d9.bars.length === 2 && /前半の型/.test(d9.bars[0].t) && /腕の使い方/.test(d9.bars[1].t), d9.bars);
const chTop = tx => d9.kids.find(k => k.k === 'ch' && k.tx.includes(tx));
const overlap = (b, list) => list.filter(k => k.vis && k.bot > b.top + 1 && k.top < b.bot - 1);
ck('⑨ 帯はそれぞれの最初のブックマークの見出しのすぐ上・メモの文字に重ならない', d9.bars[0].bot <= chTop('姿勢').top + 1 && d9.bars[1].bot <= chTop('腕の角度').top + 1 && d9.bars.every(b => !overlap(b, d9.kids).length), { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)) });
ck('⑨ 帯はメモ欄の中に収まる', d9.bars.every(b => b.l >= d9.er.l - 1 && b.r <= d9.er.r + 1), { bars: d9.bars, er: d9.er });
ck('⑨ 仕切りの中のブックマークの見出しは一段下げる', chTop('姿勢').l > d9.kids.find(k => k.k === 't').l + 10);
ck('⑨ メモの中身・v.memo は変わらず、保存も呼ばない', d9.html.replace(/ style=""/g, '') === H9 && d9.memo === M9 && d9.saves === 0, { saves: d9.saves, same: d9.html === H9 });
await shot('9-div');
await pg.evaluate(() => document.querySelector('.memo-dv[data-i="0"] .memo-dv-f').click()); await pg.waitForTimeout(200);
d9 = await dv();
const vis9 = d9.kids.filter(k => k.vis).map(k => k.k + ':' + k.tx).join('|');
ck('⑨ 仕切りを閉じると中のブックマーク（と行・くわしく）が隠れ、帯は残って「1見出し」', !/ch:1姿勢/.test(vis9) && /ch:2腕の角/.test(vis9) && d9.bars.length === 2 && /1見出し/.test(d9.bars[0].t) && d9.bars[0].bot <= chTop('腕の角度').top - 30, { vis9, bars: d9.bars });
ck('⑨ 閉じても重ならない', d9.bars.every(b => !overlap(b, d9.kids).length) && d9.bars[0].bot <= d9.bars[1].top + 1, d9.bars);
await pg.evaluate(() => document.querySelector('.memo-dv[data-i="0"] .memo-dv-f').click()); await pg.waitForTimeout(200);
await pg.evaluate(() => document.querySelector('.memo-dv[data-i="1"] .memo-dv-m').click());
const m9 = await pg.evaluate(() => [...document.querySelectorAll('#memo-act-pop button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
ck('⑨ 仕切りの ⋯ は仕切りの区間（5:00–20:00）で 再生・くわしく・ドリル', m9.length === 3 && /5:00–20:00/.test(m9[1]) && /5:00–20:00/.test(m9[2]), m9);
await pg.click('#memo-act-pop button[data-a="drill"]'); await pg.waitForTimeout(300);
const nm9 = await pg.evaluate(() => ({ n: document.querySelector('#vp-drill-slot input')?.value, t: document.getElementById('vp-drill-slot')?.textContent.replace(/\s+/g, '') }));
ck('⑨ 仕切りのドリルは仕切りの名前・区間で今のカード', nm9.n === '腕の使い方' && /開始5:00/.test(nm9.t) && /終了20:00/.test(nm9.t), nm9);
await pg.evaluate(() => window.wkDrillCancel());
await pg.evaluate(() => document.querySelector('.memo-dv[data-i="0"] .memo-dv-m').click());
await pg.click('#memo-act-pop button[data-a="more"]'); await pg.waitForSelector('#vsr-ov');
ck('⑨ 仕切りのくわしくは 2:00–5:00・「前半の型」のすぐ下と書く', await pg.evaluate(() => document.getElementById('vsr-inA')?.value + '-' + document.getElementById('vsr-inB')?.value + '|' + /「前半の型」/.test(document.querySelector('#vsr-ov .sub')?.textContent)) === '2:00-5:00|true');
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 }); await pg.waitForTimeout(300);
d9 = await dv();
const seq9 = d9.kids.map(k => k.k + ':' + k.tx).join('|');
ck('⑨ 仕切りのくわしくは、その仕切りの最後（次の仕切りの見出しの前）に一段下げて入る', /it:▶3:20肘[^|]*\|dh1:🔍くわしく[^|]*\|it1:[^|]*\|it1:[^|]*\|it1:[^|]*\|ch:2腕の角/.test(seq9), seq9);
await pg.evaluate(() => { window.videos[0].bmDividers = [{ time: 120, label: '前半の型' }, { time: 600, label: '腕の使い方' }]; window.wkMemoSumRepaint(); }); await pg.waitForTimeout(300);
d9 = await dv();
ck('⑨ 仕切りを動かすと帯もついてくる（腕の使い方を 10:00 へ → 帯は1本）', d9.bars.length === 1 && /前半の型/.test(d9.bars[0].t), d9.bars);
await pg.evaluate(() => { window.videos[0].bmDividers = [{ time: 120, label: '前半の型' }, { time: 300, label: '腕の使い方' }]; window.wkMemoSumRepaint(); });
console.log('── ⑪ 章の要点（v53.005・見出しの下に1〜3文、その後に写真と説明）──');
const H11 = await pg.evaluate((M) => document.querySelector(M).innerHTML.replace(/ style=""/g, ''), M);
await pg.evaluate((ID) => window.vpSumRangeOpen(ID), ID); await pg.waitForSelector('#vsr-ov');
await pg.click('#vsr-ov [data-tab="bm"]');
for (const k of ['1', '2']) { if (!(await pg.evaluate(k => document.querySelector(`#vsr-ov [data-bm="${k}"]`)?.classList.contains('on'), k))) await pg.click(`#vsr-ov [data-bm="${k}"]`); }
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 }); await pg.waitForTimeout(300);
ck('⑪ AI に章（範囲に入っているブックマーク）を名前と時刻で渡す', JSON.stringify(lastReq.chapters) === JSON.stringify([{ t: '2:00', label: '姿勢' }, { t: '5:00', label: '腕の角度' }]), lastReq.chapters);
const s11 = await pg.evaluate((M) => { const kids = [...document.querySelector(M).children]; const ti = kids.map(e => e.className).lastIndexOf('memo-sum-t');
  return kids.slice(ti).map(e => (getComputedStyle(e).display === 'none' ? '-' : '') + e.className.replace('memo-sum-', '') + ':' + e.textContent.replace(/\s+/g, '').slice(0, 12)); }, M);
ck('⑪ 題のすぐ下に全体の要約（v53.022）、見出しのすぐ下に章の要点、その後に行', /^t:[^|]*\|ov:全体の要約[^|]*\|ch:1姿勢[^|]*\|pt:章の要点1（姿勢）[^|]*\|(it:[^|]*\|)+ch:2腕の角度[^|]*\|pt:章の要点2（腕の角[^|]*\|it:/.test(s11.join('|')), s11);
const strip11 = await pg.evaluate((M) => { const c = document.querySelector(M).cloneNode(true); const kids = [...c.children]; const ti = kids.map(e => e.className).lastIndexOf('memo-sum-t'); kids.slice(ti).forEach(e => e.remove()); return c.innerHTML.replace(/ style=""/g, ''); }, M);
ck('⑪ 前のメモは1文字も変えない（最後に足すだけ）', strip11 === H11);
const ch11 = await pg.evaluate((M) => { const kids = [...document.querySelector(M).children]; const ti = kids.map(e => e.className).lastIndexOf('memo-sum-t'); return ti + kids.slice(ti).findIndex(e => e.classList.contains('memo-sum-ch')); }, M);
await press(ch11, 'L');
const s11b = await pg.evaluate(([M, i]) => { const kids = [...document.querySelector(M).children]; return getComputedStyle(kids[i + 1]).display; }, [M, ch11]);
ck('⑪ 見出しを閉じると章の要点も一緒に隠れる', s11b === 'none', s11b);
console.log('── ⑫ 閉じて続ける（v53.006・窓を隠して左下の帯に経過。v53.024 から帯は AI の帯 #vp-ai-dock の1本）──');
aiDelay = 1800;
const n12 = await pg.evaluate((M) => document.querySelectorAll(M + ' > .memo-sum-t').length, M);
await pg.evaluate((ID) => window.vpSumRangeOpen(ID), ID); await pg.waitForSelector('#vsr-ov');
await pg.click('#vsr-ov [data-tab="bm"]');
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForSelector('#vsr-ov [data-act="hide"]');
await pg.click('#vsr-ov [data-act="hide"]'); await pg.waitForTimeout(150);
let c12 = await pg.evaluate(() => ({ ov: getComputedStyle(document.getElementById('vsr-ov')).display, chip: document.querySelector('#vp-ai-dock [data-ai-kind="sum"]')?.textContent.replace(/\s+/g, ' ') || null }));
ck('⑫ 「閉じて続ける」で窓が隠れ、左下の帯に「要約を作成中」と経過', c12.ov === 'none' && /要約を作成中 · \d+:\d\d/.test(c12.chip || '') && /開く/.test(c12.chip), c12);
await pg.click('#vp-ai-dock [data-ai-kind="sum"]'); await pg.waitForTimeout(100);
c12 = await pg.evaluate(() => ({ ov: getComputedStyle(document.getElementById('vsr-ov')).display, chip: !!document.querySelector('#vp-ai-dock [data-ai-kind="sum"]') }));
ck('⑫ 帯を押すと窓に戻り、帯は消える', c12.ov !== 'none' && !c12.chip, c12);
await pg.click('#vsr-ov [data-act="hide"]');
await pg.waitForFunction(() => /入れました/.test(document.querySelector('#vp-ai-dock [data-ai-kind="sum"]')?.textContent || ''), null, { timeout: 8000 });
c12 = await pg.evaluate((M) => ({ ov: !!document.getElementById('vsr-ov'), n: document.querySelectorAll(M + ' > .memo-sum-t').length, chip: document.querySelector('#vp-ai-dock [data-ai-kind="sum"]')?.textContent.replace(/\s+/g, ' ') }), M);
ck('⑫ 隠している間に終わるとメモに入り、帯が「要約をメモに入れました・見る」になる', !c12.ov && c12.n === n12 + 1 && /見る/.test(c12.chip), { c12, n12 });
await pg.click('#vp-ai-dock [data-ai-kind="sum"]'); await pg.waitForTimeout(150);
ck('⑫ 「見る」で帯が消える', !(await pg.evaluate(() => !!document.querySelector('#vp-ai-dock [data-ai-kind="sum"]'))));
aiDelay = 0;
console.log('── ⑦ 保存の中身 ──');
const memoNow = await pg.evaluate(() => window.videos[0].memo);
ck('⑦ 保存されたメモに開閉の印・仕切りの帯が混ざらない', !/vp-memo-sumui|display\s*:\s*none|memo-act-pop|memo-dv|■ 前半の型|■ 腕の使い方/.test(memoNow), memoNow.slice(0, 200));
console.log('── ⑧ スマホ幅 ──');
await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
await pg.evaluate((M) => document.querySelector(M).scrollIntoView(), M);
await press(await idxOf('腕の角度', 'memo-sum-ch'), 'R');
const pm = await pg.evaluate(() => { const r = document.getElementById('memo-act-pop')?.getBoundingClientRect(); return r && { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
ck('⑧ ⋯ のメニューが画面の中に出る', pm && pm.l >= 0 && pm.r <= 390 && pm.t >= 0 && pm.b <= 844, pm);
await shot('8-sp');
ck('⑧ 横にはみ出さない', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await pg.evaluate(() => document.getElementById('memo-act-pop')?.remove()); await pg.waitForTimeout(300);
d9 = await dv();
ck('⑧ スマホ幅でも仕切りの帯がメモの文字に重ならず、メモ欄に収まる（後で足した要約にも帯が付く）', d9.bars.length >= 4 && d9.bars.every(b => b.bot - b.top > 20) && d9.bars.every(b => !overlap(b, d9.kids).length && b.l >= d9.er.l - 1 && b.r <= d9.er.r + 1), { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)) });
await shot('8-sp-div');
console.log('── ⑩ 表示の大きさ（body.style.zoom）を変えても帯がずれない（v53.003・オーナーの画面で帯が見出しに重なった）──');
for (const z of ['1.3', '0.85']) {
  await pg.evaluate((z) => { document.body.style.zoom = z; window.wkMemoSumRepaint(); }, z); await pg.waitForTimeout(400);
  d9 = await dv();
  ck(`⑩ zoom ${z}: 帯が見出しのすぐ上・メモの文字に重ならない・メモ欄に収まる`, d9.bars.length >= 4 && d9.bars.every(b => b.bot - b.top > 20 && !overlap(b, d9.kids).length && b.l >= d9.er.l - 2 && b.r <= d9.er.r + 2)
    && d9.bars[0].bot <= d9.kids.find(k => k.k === 'ch' && k.tx.includes('姿勢')).top + 2, { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)), er: d9.er });
  await shot('10-zoom-' + z);
}
await pg.evaluate(() => { document.body.style.zoom = ''; window.wkMemoSumRepaint(); });
console.log('── ⑬ 再生中の所に色・自動で追いかける（v53.026・オーナー「ブックマークみたいに」）──');
await pg.setViewportSize({ width: 1300, height: 700 }); await pg.waitForTimeout(200);
await pg.evaluate((ID) => {
  const ts = s => `<a class="ts-link" contenteditable="false" data-sec="${s}">▶ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</a>`;
  const one = (nm) => `<div class="memo-sum-t">✂️ 要約${nm}<span class="memo-sum-rg">2:00–10:00</span></div>`
    + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">1</span>姿勢${ts(120)}</div>`
    + `<div class="memo-sum-it">${ts(130)}&nbsp;背中を丸める${nm}</div><div class="memo-sum-it">${ts(200)}&nbsp;肘を締める${nm}</div>`
    + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">2</span>腕の角度${ts(300)}</div>`
    + `<div class="memo-sum-it">${ts(320)}&nbsp;手首を返す${nm}</div><div class="memo-sum-it">${ts(400)}&nbsp;肘を床に${nm}</div><div class="memo-sum-it">${ts(500)}&nbsp;脇を開けない${nm}</div>`;
  window.closeVPanel?.();
  window.videos[0].memo = '<div>前のメモ</div>' + one('A') + '<div>あいだ</div>'.repeat(80) + one('B');
  window.openVPanel(ID);
}, ID);
await pg.waitForSelector(M); await pg.waitForTimeout(800);
await pg.evaluate(() => { window.__T = 150; window._vpSumKit.nowSec = () => window.__T; window.wkMemoSumFoldAll(true); });
const memo13 = await pg.evaluate(() => window.videos[0].memo);
const lit = () => pg.evaluate((M) => [...document.querySelector(M).children].filter(e => /inset/.test(getComputedStyle(e).boxShadow) && getComputedStyle(e).display !== 'none').map(e => e.textContent.replace(/▶\s*[\d:]+/g, '').replace(/\s+/g, '').slice(0, 9)), M);
const at = async t => { await pg.evaluate(t => { window.__T = t; window.wkMemoSumNow(); }, t); await pg.waitForTimeout(80); return lit(); };
let L13 = await at(150);
ck('⑬ 2:30: 「姿勢」の見出しと「背中を丸める」の行に色（同じ区間の要約が2つなら両方）・ほかには付かない', JSON.stringify(L13.sort()) === JSON.stringify(['1姿勢', '1姿勢', '背中を丸めるA', '背中を丸めるB'].sort()), L13);
L13 = await at(420);
await pg.evaluate((M) => [...document.querySelector(M).children].find(e => e.textContent.includes('腕の角度'))?.scrollIntoView({ block: 'center' }), M); await shot('13-now');
ck('⑬ 7:00: 「腕の角度」と「肘を床に」に移る', JSON.stringify(L13.sort()) === JSON.stringify(['2腕の角度', '2腕の角度', '肘を床にA', '肘を床にB'].sort()), L13);
const tsCol = await pg.evaluate((M) => { const e = [...document.querySelector(M).children].find(e => e.textContent.includes('肘を床にA')); return getComputedStyle(e.querySelector('a.ts-link')).color; }, M);
ck('⑬ 見た目はブックマークの再生中と同じ（色・左の線・時刻のボタンの色 #c8831a）', /200, 131, 26/.test(tsCol), tsCol);
L13 = await at(700);
ck('⑬ 要約に無い所（11:40）では何にも付かない', L13.length === 0, L13);
// 閉じた見出し: 題（A）を閉じると、中が今のとき題に色
await at(420);
const tA = await idxOf('要約A', 'memo-sum-t');
await press(tA, 'L'); await pg.waitForTimeout(150);
L13 = await at(421);
ck('⑬ 閉じた見出しの中が今なら、その見出しに色（題 A は閉じて色・B は開いたまま行に色）', L13.some(x => x.startsWith('✂️要約A')) && L13.includes('肘を床にB') && !L13.includes('肘を床にA'), L13);
await press(tA, 'L'); await pg.waitForTimeout(150);
// 自動で追いかける: B の行が見えていない所から、時刻が動くと見える所までスクロールする
const vis = (txt) => pg.evaluate(([M, txt]) => { const e = [...document.querySelector(M).children].find(e => e.textContent.includes(txt)); const r = e.getBoundingClientRect(); let box = e.parentElement; while (box && box !== document.body) { const o = getComputedStyle(box).overflowY; if ((o === 'auto' || o === 'scroll') && box.scrollHeight > box.clientHeight + 4) break; box = box.parentElement; } const b0 = box && box !== document.body ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight }; const h = box?.querySelector?.('.vp-memo-stickyhead')?.getBoundingClientRect(); const top = h && h.bottom > b0.top && h.top < b0.bottom ? Math.max(b0.top, h.bottom) : b0.top; return r.top >= top - 1 && r.bottom <= b0.bottom + 1; }, [M, txt]);   // 上に残る MEMO の見出しの裏は「見えていない」（v53.032）
// 要約 A と B のあいだ（どちらの行も見えない所）までスクロールしておく
await pg.evaluate((M) => { document.activeElement?.blur?.(); const ks = [...document.querySelector(M).children].filter(e => e.textContent === 'あいだ'); ks[ks.length - 1].scrollIntoView({ block: 'end' }); }, M);
await pg.waitForTimeout(4200);   // 手でスクロールした直後（4秒）は追いかけない決まりなので待つ
const before13 = await vis('手首を返すA');
await at(330);
const after13 = await vis('手首を返すA');
ck('⑬ 自動で追いかける: 今の行が見えていなければ、メモの欄をスクロールして見せる', !before13 && after13, { before13, after13 });
// 今の行が、上に残る MEMO の見出しの裏に隠れているときも追いかける（v53.032・オーナー「メモの追従がおかしい」。
// 欄の上端で見ていたので、見出しの裏の行を「見えている」と判断して動かなかった）
await at(330); await pg.waitForTimeout(100);
await pg.evaluate((M) => { const el = document.querySelector(M), t = [...el.children].find(e => e.textContent.includes('肘を床にA')); let box = el.parentElement; while (box && box !== document.body) { const o = getComputedStyle(box).overflowY; if ((o === 'auto' || o === 'scroll') && box.scrollHeight > box.clientHeight + 4) break; box = box.parentElement; }
  const h = box.querySelector('.vp-memo-stickyhead').getBoundingClientRect(), r = t.getBoundingClientRect(); box.scrollTop += r.bottom - h.bottom - 4; }, M);   // 行の下の端だけが見出しのすぐ下にのぞく所（オーナーの画面と同じ）
await pg.waitForTimeout(4200);
const under0 = await vis('肘を床にA');
await at(410);
ck('⑬ 今の行が上に残る MEMO の見出しの裏に隠れていても、見える所までスクロールする', !under0 && await vis('肘を床にA'), { under0 });
await pg.evaluate((M) => { document.querySelector(M).focus({ preventScroll: true }); const ks = [...document.querySelector(M).children].filter(e => e.textContent === 'あいだ'); ks[ks.length - 1].scrollIntoView({ block: 'end' }); }, M);
await pg.waitForTimeout(4200);
const y0 = await pg.evaluate((M) => document.querySelector(M).getBoundingClientRect().top, M);
await at(410);
const y1 = await pg.evaluate((M) => document.querySelector(M).getBoundingClientRect().top, M);
ck('⑬ メモに入力中は動かさない（今の行が見えていなくても）', Math.abs(y1 - y0) < 2 && !(await vis('肘を床にA')), { y0, y1 });
await pg.evaluate((M) => document.querySelector(M).blur(), M);
await pg.waitForTimeout(700);
// 閉じた仕切り（紫の帯）の中が今なら、仕切りの文字に色（ブックマークの閉じた仕切りと同じ）
await pg.evaluate(() => { window.videos[0].bmDividers = [{ time: 0, label: '前半の型' }, { time: 300, label: '腕の使い方' }]; window.wkMemoSumRepaint(); });
await pg.waitForTimeout(200);
await pg.evaluate(() => { const d = [...document.querySelectorAll('.memo-dv')].find(x => x.textContent.includes('腕の使い方')); d.querySelector('.memo-dv-f').click(); });
await pg.waitForTimeout(200);
await at(415);
const dvNow = await pg.evaluate(() => [...document.querySelectorAll('.memo-dv.memo-dv-now')].map(d => d.textContent.replace(/\s+/g, ' ').trim()));
ck('⑬ 閉じた仕切りの中が今なら、その仕切りに色', dvNow.length >= 1 && dvNow.every(t => t.includes('腕の使い方')), dvNow);
await pg.evaluate(() => { [...document.querySelectorAll('.memo-dv')].filter(x => x.textContent.includes('腕の使い方') && x.querySelector('.memo-dv-f').textContent.includes('▸')).forEach(d => d.querySelector('.memo-dv-f').click()); delete window.videos[0].bmDividers; window.wkMemoSumRepaint(); });
ck('⑬ 色を付けてもメモの中身（保存される文字）は変わらない', await pg.evaluate(([M, m0]) => window.videos[0].memo.replace(/ style=""/g, '') === m0.replace(/ style=""/g, '') && !/c8831a|box-shadow/.test(document.querySelector(M).innerHTML), [M, memo13]));
console.log('── ⑭ 仕切りの「すべて開く」・再生に合わせて開く（v53.030・オーナー決定 mock-memo-fold-auto.html）──');
const open14 = async () => {
  await pg.evaluate((ID) => {
    const ts = s => `<a class="ts-link" contenteditable="false" data-sec="${s}">▶ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</a>`;
    window.closeVPanel?.();
    window.videos[0].memo = '<div>前のメモ</div><div class="memo-sum-t">✂️ 要約<span class="memo-sum-rg">2:00–15:00</span></div>'
      + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">1</span>姿勢${ts(120)}</div><div class="memo-sum-it">${ts(130)}&nbsp;背中を丸める</div>`
      + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">2</span>腕の角度${ts(300)}</div><div class="memo-sum-it">${ts(320)}&nbsp;手首を返す</div>`
      + `<div class="memo-sum-ch"><span class="memo-sum-no" contenteditable="false">3</span>移行${ts(600)}</div><div class="memo-sum-it">${ts(620)}&nbsp;足を戻す</div>`;
    window.videos[0].bmDividers = [{ time: 120, label: '前半' }, { time: 600, label: '後半' }];
    window.__T = 0; window.openVPanel(ID);
  }, ID);
  await pg.waitForSelector(M); await pg.waitForTimeout(500);
  await pg.evaluate(() => { window._vpSumKit.nowSec = () => window.__T; window.__saves = 0; });
};
const S14 = () => pg.evaluate((M) => {
  const el = document.querySelector(M), v = e => e && getComputedStyle(e).display !== 'none';
  const it = t => v([...el.children].find(e => e.textContent.includes(t)));
  return { 姿勢: it('背中を丸める'), 腕: it('手首を返す'), 移行: it('足を戻す'),
    bars: [...document.querySelectorAll('.memo-dv')].map(d => d.textContent.replace(/\s+/g, '')), memo: window.videos[0].memo, saves: window.__saves };
}, M);
const at14 = async t => { await pg.evaluate(t => { window.__T = t; window.wkMemoSumNow(); }, t); await pg.waitForTimeout(120); return S14(); };
const bar14 = (name, sel) => pg.evaluate(([n, sel]) => { [...document.querySelectorAll('.memo-dv')].find(d => d.textContent.includes(n)).querySelector(sel).click(); }, [name, sel]).then(() => pg.waitForTimeout(150));
await pg.evaluate(() => localStorage.removeItem('wk_memoFollow'));
await open14();
const memo14 = await pg.evaluate(() => window.videos[0].memo);
let s14 = await at14(150);
const fol = await pg.evaluate((ID) => document.getElementById('vp-memo-follow-' + ID)?.textContent.replace(/\s+/g, ''), ID);
ck('⑭ Memo の見出しに「▶ 再生に合わせる」と ▾（要約があるとき）・最初はオフで何も開かない', /再生に合わせる/.test(fol) && !(await pg.evaluate((ID) => document.querySelector(`#vp-memo-follow-${ID} .vp-memo-fol`).classList.contains('on'), ID)) && !s14.姿勢 && s14.bars.every(b => /^▸/.test(b)), { fol, s14 });
await bar14('前半', '.memo-dv-all'); s14 = await S14();
ck('⑭ 閉じた仕切りの「すべて開く」で仕切りと中のブックマークが全部開き、「すべて閉じる」になる', s14.姿勢 && s14.腕 && !s14.移行 && /^▾■前半すべて閉じる/.test(s14.bars[0]), s14);
await bar14('前半', '.memo-dv-all'); s14 = await S14();
ck('⑭ 「すべて閉じる」で中のブックマークが閉じ、仕切りは開いたまま「すべて開く」', !s14.姿勢 && !s14.腕 && /^▾■前半すべて開く/.test(s14.bars[0]), s14);
// オンにする（再生中のブックマークだけ・前の所を閉じる が既定）
await pg.evaluate((ID) => document.querySelector(`#vp-memo-follow-${ID} .vp-memo-fol`).click(), ID); await pg.waitForTimeout(150);
await open14(); s14 = await at14(150);
ck('⑭ オン（この端末に覚える）・再生中のブックマークだけ: 2:30 で「姿勢」だけ開く（仕切りも開く・後半は閉じたまま）', s14.姿勢 && !s14.腕 && !s14.移行 && /^▾■前半/.test(s14.bars[0]) && /^▸■後半/.test(s14.bars[1])
  && await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_memoFollow')).on === true), s14);
s14 = await at14(320);
ck('⑭ 5:20 に進むと「姿勢」を閉じ「腕の角度」を開く', !s14.姿勢 && s14.腕 && !s14.移行, s14);
await press(await idxOf('腕の角度', 'memo-sum-ch'), 'L'); s14 = await at14(330);
ck('⑭ 再生中の所を手で閉じたら、同じブックマークの間は開き直さない', !s14.腕, s14);
s14 = await at14(620);
ck('⑭ 次のブックマークへ移るとまたオートで開く（前の仕切りはオートで開いた分なので閉じる）', s14.移行 && /^▸■前半/.test(s14.bars[0]) && /^▾■後半/.test(s14.bars[1]), s14);
await bar14('前半', '.memo-dv-f'); await press(await idxOf('姿勢', 'memo-sum-ch'), 'L');
s14 = await at14(320); s14 = await at14(630);
ck('⑭ 手で開いた所（前半の仕切り・姿勢）は、オートが閉じない', s14.姿勢 && /^▾■前半/.test(s14.bars[0]) && !s14.腕 && s14.移行, s14);
// ▾ のメニューで「仕切りだけ」
await pg.evaluate((ID) => document.querySelector(`#vp-memo-follow-${ID} .vp-memo-fol-opt`).click(), ID); await pg.waitForTimeout(100);
const pop14 = await pg.evaluate(() => [...document.querySelectorAll('#memo-fol-pop button')].map(b => b.textContent.replace(/\s+/g, '')));
ck('⑭ ▾ で どこまで開くか（3つ）と 次へ移ったら（2つ）を選べる', ['仕切りだけ', '再生中のブックマークだけ', 'ブックマークごと', '前の所を閉じる', '開いたまま残す'].every(t => pop14.some(x => x.startsWith(t))), pop14);
await pg.evaluate(() => [...document.querySelectorAll('#memo-fol-pop button')].find(b => b.textContent.startsWith('仕切りだけ')).click());
await open14(); s14 = await at14(320);
ck('⑭ 仕切りだけ: 再生中の仕切りが開き、中のブックマークは閉じたまま', !s14.姿勢 && !s14.腕 && /^▾■前半/.test(s14.bars[0]) && /^▸■後半/.test(s14.bars[1]), s14);
await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('wk_memoFollow')); p.scope = 'all'; localStorage.setItem('wk_memoFollow', JSON.stringify(p)); });
await open14(); s14 = await at14(320);
ck('⑭ ブックマークごと: 再生中の仕切りの中のブックマークを全部開く', s14.姿勢 && s14.腕 && !s14.移行, s14);
await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('wk_memoFollow')); p.scope = 'bm'; p.leave = 'keep'; localStorage.setItem('wk_memoFollow', JSON.stringify(p)); });
await open14(); await at14(150); s14 = await at14(320);
ck('⑭ 開いたまま残す: 「姿勢」は開いたまま「腕の角度」も開く', s14.姿勢 && s14.腕, s14);
await pg.evaluate((ID) => document.querySelector(`#vp-memo-follow-${ID} .vp-memo-fol`).click(), ID); await pg.waitForTimeout(150);
s14 = await at14(620);
ck('⑭ オフにするとオートで開かない', !s14.移行, s14);
ck('⑭ メモの中身・v.memo は変わらず、保存も呼ばない', s14.memo === memo14 && s14.saves === 0 && !/memo-dv|vp-memo-fol|display\s*:\s*none/.test(s14.memo), { saves: s14.saves });
await pg.setViewportSize({ width: 390, height: 844 }); await open14(); await at14(150);
await pg.evaluate((ID) => { document.getElementById('vp-memo-follow-' + ID).scrollIntoView({ block: 'center' }); document.querySelector(`#vp-memo-follow-${ID} .vp-memo-fol-opt`).click(); }, ID); await pg.waitForTimeout(150);
const sp14 = await pg.evaluate((ID) => { const r = document.getElementById('memo-fol-pop').getBoundingClientRect(), h = document.getElementById('vp-memo-follow-' + ID).parentElement, f = document.getElementById('vp-memo-full-' + ID).getBoundingClientRect(), hr = h.getBoundingClientRect();
  return { pop: r.left >= 0 && r.right <= 390 && r.bottom <= 844, head: f.right <= hr.right + 1 && f.top - hr.top < 30, w: document.documentElement.scrollWidth <= innerWidth }; }, ID);
await shot('14-sp-pop');
ck('⑭ スマホ幅: 見出しが1行に収まり（⛶ も同じ行）・▾ のメニューが画面の中・横にはみ出さない', sp14.pop && sp14.head && sp14.w, sp14);
await pg.evaluate(() => document.getElementById('memo-fol-pop')?.remove());
await pg.evaluate(() => { localStorage.removeItem('wk_memoFollow'); delete window.videos[0].bmDividers; });
ck('ページのエラーが無い', errs.length === 0, errs);
console.log(fail ? `✗ ${fail} 件` : '✓ すべて通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
