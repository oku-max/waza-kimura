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
let lastReq = null;
await pg.route('**/api/ai-summary', async r => {
  lastReq = JSON.parse(r.request().postData() || '{}');
  const cs = lastReq.cues, n = Math.min(3, cs.length);
  const items = Array.from({ length: n }, (_, k) => { const t = Math.floor(cs[Math.floor(k * cs.length / n)].t);
    return { t: Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text: 'くわしい要点' + k, shot: false }; });
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: JSON.stringify({ items }) }) });
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
ck('⑤ 今の ✨要約 の窓が「時刻を指定」・6:40–8:20 入りで開き、行のすぐ下に入れると書く', sheet.tab === '時刻を指定' && sheet.a === '6:40' && sheet.b === '8:20' && /「肘を床に」のすぐ下/.test(sheet.sub), sheet);
await shot('5-sheet');
await pg.click('#vsr-ov [data-act="go"]');
await pg.waitForFunction(() => !document.getElementById('vsr-ov'), null, { timeout: 8000 });
await pg.waitForTimeout(200);
s = await st();
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
ck('⑨ 仕切りの帯が2本（前半の型・腕の使い方）出る', d9.bars.length === 2 && /前半の型/.test(d9.bars[0].t) && /腕の使い方/.test(d9.bars[1].t), d9.bars);
const chTop = tx => d9.kids.find(k => k.k === 'ch' && k.tx.includes(tx));
const overlap = (b, list) => list.filter(k => k.vis && k.bot > b.top + 1 && k.top < b.bot - 1);
ck('⑨ 帯はそれぞれの最初のブックマークの見出しのすぐ上・メモの文字に重ならない', d9.bars[0].bot <= chTop('姿勢').top + 1 && d9.bars[1].bot <= chTop('腕の角度').top + 1 && d9.bars.every(b => !overlap(b, d9.kids).length), { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)) });
ck('⑨ 帯はメモ欄の中に収まる', d9.bars.every(b => b.l >= d9.er.l - 1 && b.r <= d9.er.r + 1), { bars: d9.bars, er: d9.er });
ck('⑨ 仕切りの中のブックマークの見出しは一段下げる', chTop('姿勢').l > d9.kids.find(k => k.k === 't').l + 10);
ck('⑨ メモの中身・v.memo は変わらず、保存も呼ばない', d9.html === H9 && d9.memo === M9 && d9.saves === 0, { saves: d9.saves, same: d9.html === H9 });
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
ck('⑧ スマホ幅でも仕切りの帯がメモの文字に重ならず、メモ欄に収まる', d9.bars.length === 2 && d9.bars.every(b => b.bot - b.top > 20) && d9.bars.every(b => !overlap(b, d9.kids).length && b.l >= d9.er.l - 1 && b.r <= d9.er.r + 1), { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)) });
await shot('8-sp-div');
console.log('── ⑩ 表示の大きさ（body.style.zoom）を変えても帯がずれない（v53.003・オーナーの画面で帯が見出しに重なった）──');
for (const z of ['1.3', '0.85']) {
  await pg.evaluate((z) => { document.body.style.zoom = z; window.wkMemoSumRepaint(); }, z); await pg.waitForTimeout(400);
  d9 = await dv();
  ck(`⑩ zoom ${z}: 帯が見出しのすぐ上・メモの文字に重ならない・メモ欄に収まる`, d9.bars.length === 2 && d9.bars.every(b => b.bot - b.top > 20 && !overlap(b, d9.kids).length && b.l >= d9.er.l - 2 && b.r <= d9.er.r + 2)
    && d9.bars[0].bot <= d9.kids.find(k => k.k === 'ch' && k.tx.includes('姿勢')).top + 2, { bars: d9.bars, ov: d9.bars.map(b => overlap(b, d9.kids).map(k => k.tx)), er: d9.er });
  await shot('10-zoom-' + z);
}
await pg.evaluate(() => { document.body.style.zoom = ''; window.wkMemoSumRepaint(); });
ck('ページのエラーが無い', errs.length === 0, errs);
console.log(fail ? `✗ ${fail} 件` : '✓ すべて通過');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
