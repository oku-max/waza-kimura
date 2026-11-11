// ═══ 部分だけの要約（v52.987・オーナー決定 mock-sum-real.html / mock-sum-design.html） ═══
// 使い方: node tools/sum-range-check.mjs
// 本物の index.html で（AI の返事は偽物・字幕と写真は窓口 _vpSumKit の差し替え）:
//   ① ブックマークの見出しに「✨ 要約」がある
//   ② 仕切り・ブックマークを何個でも選べる。隣り合うものは1か所につなぐ・離れていれば2か所・全部外すと押せない
//   ③ 項目の数・写真の数のボタンに「何分ごと」を出す・自分で打つとその場で変わる・項目より多い写真は押せない・YouTube は文章だけ
//   ④ AI に送るのは選んだ範囲の字幕の行だけ。メモは最後に足すだけ（前のメモは1文字も変えない）・動画のほかの欄は変えない
//      タイトル（memo-sum-t）・チャプターをまたぐときだけ番号つきの見出し（memo-sum-ch）
//   ⑤ Drive の動画は写真を撮り、スナップショットに入れる（その写真のメモ＝解説文）・メモの行にも同じ文
//   ⑥ AI が失敗したら・字幕が無ければ・パネルを閉じていたら、メモに何も書かない
//   ⑦ ログインしていない・Drive の認証が切れているときは「字幕が無い」ではなく、ログインを案内する（v52.988）
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8267;
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
pg.on('dialog', d => d.accept().catch(() => {}));
let lastReq = null, aiMode = 'ok';
await pg.route('**/api/ai-summary', async r => {
  lastReq = JSON.parse(r.request().postData() || '{}');
  if (aiMode === 'fail') return r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'テストの失敗' }) });
  const n = lastReq.items || 4, cs = lastReq.cues;
  const items = Array.from({ length: n }, (_, k) => { const c = cs[Math.floor(k * cs.length / n)]; const t = Math.floor(c.t);
    return { t: Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), text: '要点' + k + 'は肘を締める', shot: k < (lastReq.shots || 0) }; });
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: JSON.stringify({ items }), costUsd: 0.001 }) });
});
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
await pg.evaluate(() => {
  window.videos.length = 0;
  window.videos.push({ id:'AAAAAAAAAAA', ytId:'AAAAAAAAAAA', pt:'youtube', title:'教則A', duration: 1200, tb:[], cat:[], pos:[], tags:[], memo:'<div>前から書いてあるメモ</div>',
    bookmarks:[{time:0,label:'イントロ',note:''},{time:120,label:'姿勢',note:'',star:2},{time:300,label:'腕の角度',note:''},{time:600,label:'移行',note:'',star:true},{time:900,label:'仕上げ',note:''}],
    bmDividers:[{time:0,label:'前半'},{time:300,label:'中盤'},{time:900,label:'後半'}] });
  window.__saves = 0; window.debounceSave = () => { window.__saves++; };
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  window.openVPanel('AAAAAAAAAAA');
});
await pg.waitForSelector('#vp-memo-AAAAAAAAAAA');
// 字幕は窓口の差し替え（YouTube の字幕は Firestore から来るため）。5秒ごとに1行
await pg.evaluate(() => { const kit = window._vpSumKit; window.__realCues = kit.cues;
  kit.cues = () => ({ cues: Array.from({ length: 240 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `${i * 5}秒の話` })), label: '日本語' }); });
const before = await pg.evaluate(() => { const v = JSON.parse(JSON.stringify(window.videos[0])); return v; });

console.log('── ① 入口 ──');
ck('① ブックマークの見出しに「✨ 要約」', await pg.evaluate(() => /✨ 要約/.test(document.getElementById('vp-sumrange-AAAAAAAAAAA')?.textContent || '')));
await pg.click('#vp-sumrange-AAAAAAAAAAA');
await pg.waitForSelector('.vsr-sh');
const S = () => pg.evaluate(() => ({ sum: document.querySelector('.vsr-sum')?.textContent.replace(/\s+/g, ' ').trim(), go: !document.querySelector('[data-act="go"]')?.disabled,
  grp: [...document.querySelectorAll('.vsr-grp span')].map(e => e.textContent), opts: [...document.querySelectorAll('.vsr-o')].map(b => (b.classList.contains('on') ? '*' : '') + (b.disabled ? '-' : '') + b.textContent.replace(/\s+/g, ' ').trim()),
  ticks: document.querySelectorAll('.vsr-tl .tick').length, segs: document.querySelectorAll('.vsr-tl .seg').length, text: document.querySelector('.vsr-sh')?.textContent || '' }));
console.log('── ② 複数選択 ──');
let s = await S();
ck('② 最初は最初の仕切りが選ばれている（0:00–5:00）', /0:00–5:00/.test(s.sum) && s.go, s.sum);
await pg.click('[data-div="1"]'); s = await S();
ck('② 隣り合う仕切りは1か所につなぐ（0:00–15:00・合計 15分）', /0:00–15:00/.test(s.sum) && /15分/.test(s.sum) && s.segs === 1, s);
await pg.click('[data-div="1"]'); await pg.click('[data-div="2"]'); s = await S();
ck('② 離れた仕切りは2か所（合計 10分）', /2か所/.test(s.sum) && /10分/.test(s.sum) && s.segs === 2, s);
await pg.click('[data-all="0"]'); s = await S();
ck('② 全部外すと押せない', !s.go, s.sum);
await pg.click('[data-tab="bm"]'); await pg.click('[data-bm="1"]'); await pg.click('[data-bm="2"]'); s = await S();
ck('② ブックマークも何個でも選べる（2:00–10:00 を1か所）', /2:00–10:00/.test(s.sum), s.sum);
console.log('── ③ 数の見え方 ──');
ck('③ ボタンの中に何分ごと（おまかせ＝8項目 · 約1分ごと／5項目＝約1分40秒ごと）', s.opts[0].includes('8項目') && /約1分ごと/.test(s.opts[0]) && /約1分40秒ごと/.test(s.opts[1]), s.opts);
ck('③ YouTube の動画は写真の数を選ばせない（文章だけ）', /文章だけになります/.test(s.text) && s.opts.length === 4, s.opts);
await pg.click('[data-ni="10"]'); s = await S();
ck('③ 10項目: 見出しの右に「10項目 · 選んだ 8分を約50秒ごと」・バーに印10本', /10項目/.test(s.grp[0]) && /約50秒ごと/.test(s.grp[0]) && s.ticks === 10, s);
await pg.fill('#vsr-ni', '４'); s = await S();
ck('③ 自分で打つ（全角でも）とその場で変わる（4項目 · 約2分ごと・印4本）', /4項目/.test(s.grp[0]) && /約2分ごと/.test(s.grp[0]) && s.ticks === 4, s);
await pg.fill('#vsr-ni', '99'); s = await S();
ck('③ 範囲の外（99）は選ばない（4項目のまま）', /4項目/.test(s.grp[0]), s.grp);
await pg.fill('#vsr-ni', ''); await pg.click('[data-ni="5"]');

console.log('── ④ 要約してメモに足す ──');
await pg.evaluate(() => { window.__saves = 0; });
await pg.click('[data-act="go"]');
await pg.waitForFunction(() => !document.querySelector('.vsr-ov'), null, { timeout: 10000 });
const after = await pg.evaluate(() => JSON.parse(JSON.stringify(window.videos[0])));
const memoEl = await pg.evaluate(() => { const el = document.getElementById('vp-memo-AAAAAAAAAAA');
  return { t: el.querySelectorAll('.memo-sum-t').length, ch: [...el.querySelectorAll('.memo-sum-ch')].map(e => e.textContent.replace(/\s+/g, ' ').trim()), it: el.querySelectorAll('.memo-sum-it').length, title: el.querySelector('.memo-sum-t')?.textContent }; });
ck('④ AI に送ったのは選んだ範囲（2:00–10:00）の字幕の行だけ', lastReq && lastReq.source === 'rangesum' && lastReq.cues.length > 0 && lastReq.cues.every(c => c.t >= 119 && c.t < 600) && lastReq.items === 5 && lastReq.shots === 0, lastReq && { n: lastReq.cues.length, a: lastReq.cues[0], z: lastReq.cues.at(-1), items: lastReq.items, shots: lastReq.shots });
ck('④ 前のメモはそのまま先頭に残り、後ろに足しただけ', after.memo.startsWith(before.memo) && after.memo.length > before.memo.length, after.memo.slice(0, 120));
ck('④ タイトル1つ・項目5つ・2つのブックマークにまたがるので番号つきの見出し2つ', memoEl.t === 1 && memoEl.it === 5 && memoEl.ch.length === 2 && /^1/.test(memoEl.ch[0]) && /姿勢/.test(memoEl.ch[0]) && /^2/.test(memoEl.ch[1]) && /腕の角度/.test(memoEl.ch[1]), memoEl);
ck('④ タイトルに名前と範囲（姿勢・腕の角度／2:00–10:00 · 1か所 · 合計 8分）', /姿勢・腕の角度/.test(memoEl.title) && /2:00–10:00 · 1か所 · 合計 8分/.test(memoEl.title), memoEl.title);
ck('④ 保存が呼ばれた', await pg.evaluate(() => window.__saves) >= 1);
const strip = v => { const o = { ...v }; delete o.memo; return JSON.stringify(o); };
ck('④ 動画のメモ以外の欄は1文字も変えない（ブックマーク・仕切り等）', strip(after) === strip(before));

console.log('── ⑤ Drive の動画は写真も ──');
const snaps = await pg.evaluate(async () => {
  const kit = window._vpSumKit; window.__snapCalls = [];
  kit.isGdPlaying = () => true; kit.openShotVideo = async () => document.createElement('video');
  kit.capture = async (t) => ({ fullBlob: new Blob(['x'], { type: 'image/jpeg' }), thumbDataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', sig: new Uint8Array(256).fill(t % 255) });
  window.snapAddBlob = async (id, blob, t, memo) => { window.__snapCalls.push({ id, t, memo }); return 'snap' + window.__snapCalls.length; };
  window.vpSumRangeOpen('AAAAAAAAAAA'); return true; });
await pg.waitForSelector('.vsr-sh');
s = await S();
ck('⑤ Drive では写真の数（なし／5／10／20）を出し、項目（5）より多いものは押せない', s.opts.length === 8 && s.opts.some(o => /^-.*10枚/.test(o)) && s.opts.some(o => /^\*5枚/.test(o)), s.opts);
await pg.click('[data-act="go"]');
await pg.waitForFunction(() => !document.querySelector('.vsr-ov'), null, { timeout: 10000 });
const sc = await pg.evaluate(() => ({ calls: window.__snapCalls, caps: [...document.querySelectorAll('#vp-memo-AAAAAAAAAAA .snap-cap')].map(e => ({ id: e.dataset.snapId, t: e.textContent })) }));
ck('⑤ 写真を5枚撮ってスナップショットに入れ、その写真のメモに解説文', sc.calls.length === 5 && sc.calls.every(c => c.id === 'AAAAAAAAAAA' && /要点\d+は肘を締める/.test(c.memo)), sc.calls);
ck('⑤ メモの行にも同じ解説文（写真のメモと同じ）', sc.caps.length === 5 && sc.caps.every((c, k) => c.t === sc.calls[k].memo && c.id === 'snap' + (k + 1)), sc.caps);

console.log('── ⑥ 書かないとき ──');
const m0 = await pg.evaluate(() => window.videos[0].memo);
aiMode = 'fail';
await pg.evaluate(() => { window._vpSumKit.isGdPlaying = () => false; window.vpSumRangeOpen('AAAAAAAAAAA'); });
await pg.click('[data-act="go"]'); await pg.waitForTimeout(800);
ck('⑥ AI が失敗したらメモは変えない（画面は選ぶところへ戻る）', await pg.evaluate(() => window.videos[0].memo) === m0 && await pg.$('.vsr-sh [data-act="go"]') !== null);
aiMode = 'ok';
await pg.evaluate(() => { window._vpSumKit.cues = () => ({ cues: [], label: '' }); });
await pg.click('[data-act="go"]'); await pg.waitForTimeout(300);
ck('⑥ 字幕が無ければ「字幕生成」を案内し、メモは変えない', /字幕がありません/.test((await S()).text) && await pg.evaluate(() => window.videos[0].memo) === m0);
await pg.click('[data-act="back"]');
await pg.evaluate(() => { window._vpSumKit.cues = () => ({ cues: Array.from({ length: 240 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: 'x' })), label: 'ja' }); });
await pg.route('**/api/ai-summary', async r => { await new Promise(x => setTimeout(x, 600)); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: JSON.stringify({ items: [{ t: '2:10', text: 'a', shot: false }] }) }) }); });
await pg.click('[data-act="go"]'); await pg.evaluate(() => { window.openVPanelId = 'ZZZ'; }); await pg.waitForTimeout(1200);
ck('⑥ 待っている間にパネルを閉じた（ほかの動画を開いた）ら、メモに入れない', await pg.evaluate(() => window.videos[0].memo) === m0);
console.log('── ⑦ ログインしていないときは「字幕が無い」と言わない ──');
await pg.evaluate(() => { window.openVPanelId = 'AAAAAAAAAAA'; document.querySelector('.vsr-ov')?.remove();
  const kit = window._vpSumKit; kit.cues = () => ({ cues: [], label: '' }); kit.isGdPlaying = () => false;
  window.videos[0].pt = 'gdrive';
  const b = document.createElement('button'); b.id = 'gd-auth-play-btn'; window.__authClicks = 0; b.onclick = () => { window.__authClicks++; }; document.body.appendChild(b);
  window.vpSumRangeOpen('AAAAAAAAAAA'); });
await pg.click('[data-act="go"]'); await pg.waitForTimeout(300);
let t7 = (await S()).text;
ck('⑦ Drive の認証が切れていると「Google にログイン」を案内し、「字幕がありません」とは言わない', /Google にログイン/.test(t7) && !/字幕がありません/.test(t7), t7.slice(0, 200));
await pg.click('[data-act="gdauth"]'); await pg.waitForTimeout(200);
ck('⑦ 「Google にログインして再生」は動画の所の「Googleで認証して再生」を押したのと同じ', await pg.evaluate(() => window.__authClicks) === 1 && !(await pg.$('.vsr-ov')));
await pg.evaluate(() => { window._firebaseCurrentUser = () => null; window.vpSumRangeOpen('AAAAAAAAAAA'); });
await pg.click('[data-act="go"]'); await pg.waitForTimeout(300); t7 = (await S()).text;
ck('⑦ アプリにログインしていないときも「ログインしてから」と案内し、「字幕がありません」とは言わない', /ログインしていないため/.test(t7) && !/字幕がありません/.test(t7), t7.slice(0, 200));
ck('⑦ どちらもメモは変えない', await pg.evaluate(() => window.videos[0].memo) === m0);
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 部分だけの要約');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
