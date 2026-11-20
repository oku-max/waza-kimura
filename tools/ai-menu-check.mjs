// ═══ AI ボタン（v53.022・オーナー決定 mock-ai-menu.html） ═══
// 使い方: node tools/ai-menu-check.mjs
// 動画パネルの「📑 自動チャプター」「✨ 要約」「💬 字幕生成」を、ブックマークの見出しの「AI」1つにまとめた。本物の index.html で:
//   ① AI ボタンがあり、前の3つのボタンは無い
//   ② 字幕生成 → 自動チャプター → 要約 の順・一言の説明。字幕が無い動画では、字幕が無いと進めない要約は押せない（オーナー指示）
//   ③ 字幕がある動画: 字幕生成に「〜の字幕がすでに存在しています。再度作成する場合は上書きされます。」・要約は押せる
//   ④ 字幕の有無を確かめられないときは「無い」と言わない（v52.988 の教訓）・ログインしていなければログインを案内・オーナーでなければ字幕生成の行は無い
//   ⑤ 実行は今までのボタンと同じ（字幕生成は今までの言語のメニューが AI ボタンのそばに出る）。字幕生成は窓が無いので、すぐ帯に出る
//   ⑥ 作成中の帯は1本。2件以上は「AI 2件 作成中」で、押すと1件ずつの一覧。行を押すとその窓に戻る
//   ⑦ 動画のデータを書かない
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8297;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const DESC = { AAAAAAAAAAA: '0:00 Intro\n1:30 Grip\n3:05 Sweep\n', BBBBBBBBBBB: 'no chapters here' };
let apiCalls = [];
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/api/yt-videos') {
    const ids = new URL(q.url, 'http://x').searchParams.get('ids') || ''; apiCalls.push(ids);
    if (ids === 'CCCCCCCCCCC') { r.writeHead(500); return r.end('{}'); }
    const items = ids.split(',').filter(id => DESC[id] != null).map(id => ({ id, title: id, channel: '', thumb: '', duration: '', desc: DESC[id] }));
    r.writeHead(200, {'Content-Type':'application/json'}); return r.end(JSON.stringify({ items })); }
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
  const SRT='1\\n00:00:01,000 --> 00:00:04,000\\nこんにちは\\n\\n2\\n00:00:05,000 --> 00:00:09,000\\nグリップの話\\n';
  const doc=(id)=>({ get:()=>p(String(id||'').startsWith('ytsub_') && window.__ytSubs ? {exists:true,data:()=>({tracks:{ja:{srt:SRT}}})} : {exists:false,data:()=>({})}), set:()=>p(), update:()=>p(), delete:()=>p(), collection, onSnapshot:()=>noop });
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
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
await pg.evaluate(() => {
  window.videos.length = 0;
  window.videos.push({ id:'AAAAAAAAAAA', ytId:'AAAAAAAAAAA', pt:'youtube', title:'教則A', duration: 1200, tb:[], cat:[], pos:[], tags:[], memo:'<div>前のメモ</div>',
    bookmarks:[{time:0,label:'イントロ',note:''},{time:120,label:'姿勢',note:''},{time:300,label:'腕',note:''}] });
  window.__me = { uid:'u1', email:'okujournal@gmail.com', getIdToken: async () => 'tok' };
  window._firebaseCurrentUser = () => window.__me;
  window.debounceSave = () => {};
  const orig = window.fetch.bind(window);
  // AI・字幕のサーバーは返さずに止めておく（作成中の帯を見るため）。YouTube のチャプターの下見は通す
  window.fetch = (u, o) => (String(u).startsWith('/api/') && !String(u).startsWith('/api/yt-videos')) ? new Promise(() => {}) : orig(u, o);
  window.__snap = JSON.stringify(window.videos);
});
const ID = 'AAAAAAAAAAA';
const openMenu = async () => { await pg.evaluate(() => window._wkAiMenuClose?.()); await pg.click('#vp-ai-' + ID); await pg.waitForSelector('#vp-ai-menu .vp-ai-it');
  for (let i = 0; i < 40; i++) { if (!await pg.evaluate(() => /確かめています/.test(document.getElementById('vp-ai-menu')?.textContent || ''))) break; await pg.waitForTimeout(100); } };
const menu = () => pg.evaluate(() => [...document.querySelectorAll('#vp-ai-menu .vp-ai-it')].map(r => ({ k: r.dataset.k,
  dis: !!r.querySelector('.vp-ai-run')?.disabled, btn: r.querySelector('.vp-ai-run')?.textContent.trim(), st: r.querySelector('.vp-ai-st')?.textContent || '' })));
const dock = () => pg.evaluate(() => document.getElementById('vp-ai-dock')?.textContent.replace(/\s+/g, ' ') || '');

await pg.evaluate(id => window.openVPanel(id), ID); await pg.waitForSelector('#vp-ai-' + ID); await pg.waitForTimeout(400);
console.log('── ① ボタン ──');
const b1 = await pg.evaluate(id => ({ ai: document.getElementById('vp-ai-' + id)?.textContent.trim(), inBm: !!document.querySelector(`#vp-bm-section-${id} #vp-ai-${id}`),
  old: ['vp-chapgen-', 'vp-sumrange-', 'vp-subgen-'].filter(p => document.getElementById(p + id)) }), ID);
ck('① ブックマークの見出しに「AI」・前の「📑 自動チャプター」「✨ 要約」「💬 字幕生成」は無い', b1.ai === 'AI' && b1.inBm && !b1.old.length, b1);

console.log('── ② 並び・説明・字幕が無いとき ──');
await openMenu();
let m = await menu();
ck('② 字幕生成 → 自動チャプター → 要約 の順・それぞれに一言の説明', m.map(r => r.k).join() === 'sub,chap,sum'
  && await pg.evaluate(() => [...document.querySelectorAll('#vp-ai-menu .vp-ai-ds')].every(e => e.textContent.trim().length > 5)), m);
const sum0 = m.find(r => r.k === 'sum'), chap0 = m.find(r => r.k === 'chap'), sub0 = m.find(r => r.k === 'sub');
ck('② 字幕が無い: 要約は押せず「先に字幕生成が必要です」', sum0.dis && /先に字幕生成が必要です/.test(sum0.st), sum0);
ck('② 字幕が無い: 自動チャプターは押せる（YouTube の取得・一括入力は字幕が要らない）・「字幕から検出は選べません」と書く', !chap0.dis && /字幕から検出」は選べません/.test(chap0.st), chap0);
ck('② 字幕が無い: 字幕生成は押せる・上書きの注意は出ない', !sub0.dis && !/上書き/.test(sub0.st), sub0);

console.log('── ③ 字幕があるとき ──');
await pg.evaluate(() => { window.__ytSubs = true; });
await openMenu(); m = await menu();
const sub1 = m.find(r => r.k === 'sub'), sum1 = m.find(r => r.k === 'sum'), chap1 = m.find(r => r.k === 'chap');
ck('③ 字幕がある: 字幕生成に「日本語 の字幕がすでに存在しています。再度作成する場合は上書きされます。」', !sub1.dis && /日本語 の字幕がすでに存在しています。再度作成する場合は上書きされます。/.test(sub1.st), sub1);
ck('③ 字幕がある: 要約は押せる・状態の行は出さない（説明と同じことを2回言わない）', !sum1.dis && !sum1.st, sum1);
ck('③ 字幕がある: 自動チャプターに「選べません」は出ない', !/選べません/.test(chap1.st), chap1);

console.log('── ④ 確かめられないとき・ログインしていないとき・オーナーでないとき ──');
await pg.evaluate(() => { window.__subsSave = window._vpAiKit.subsOf; window._vpAiKit.subsOf = async () => ({ ok: false, why: 'error' }); });
await openMenu(); m = await menu();
ck('④ 字幕の有無を確かめられない: 「無い」と言わず要約は押せる', !m.find(r => r.k === 'sum').dis && !/必要です/.test(m.find(r => r.k === 'sum').st) && /確かめられませんでした/.test(m.find(r => r.k === 'sub').st), m);
await pg.evaluate(() => { window._vpAiKit.subsOf = window.__subsSave; window.__meSave = window.__me; window.__me = null; });
await openMenu(); m = await menu();
ck('④ ログインしていない: どれも押せず「Googleにログインしてください」（字幕が無いとは言わない）', m.every(r => r.dis && /ログイン/.test(r.st) && !/字幕生成が必要/.test(r.st)), m);
await pg.evaluate(() => { window.__me = { uid:'u1', email:'someone@example.com', getIdToken: async () => 'tok' }; });
await openMenu(); m = await menu();
ck('④ オーナーでない: 字幕生成の行は無い（今までどおり）', m.map(r => r.k).join() === 'chap,sum', m);
await pg.evaluate(() => { window.__me = window.__meSave; window.__ytSubs = false; });
await pg.evaluate(() => window._wkAiMenuClose?.());

console.log('── ⑤ 実行は今までのボタンと同じ・帯は1本 ──');
await openMenu();
await pg.click('#vp-ai-menu [data-run="sub"]');
await pg.waitForSelector('#vp-subgen-menu');
const pos = await pg.evaluate(id => { const a = document.getElementById('vp-ai-' + id).getBoundingClientRect(), m = document.getElementById('vp-subgen-menu').getBoundingClientRect();
  return { near: Math.abs(m.top - a.bottom) < 20 || Math.abs(a.top - m.bottom) < 20, langs: document.getElementById('vp-subgen-menu').textContent.replace(/\s+/g, ' ') }; }, ID);
ck('⑤ 字幕生成: 今までと同じ言語のメニュー（日本語／原語のまま）が AI ボタンのそばに出る', pos.near && /日本語/.test(pos.langs) && /原語のまま/.test(pos.langs), pos);
await pg.click('#vp-subgen-menu .vp-subgen-item[data-lang="ja"]');
await pg.waitForFunction(() => /字幕を作成中/.test(document.getElementById('vp-ai-dock')?.textContent || ''), null, { timeout: 8000 });
let d = await dock();
ck('⑤ 字幕生成は窓が無いので、すぐ左下の AI の帯に「字幕を作成中・経過・段階・動画名」', /字幕を作成中 · \d:\d\d/.test(d) && /教則A/.test(d) && /確認中|YouTube/.test(d), d);
ck('⑤ AI ボタンに作成中の件数', /AI\s*1/.test(await pg.evaluate(id => document.getElementById('vp-ai-' + id).textContent, ID)));
await openMenu(); m = await menu();
ck('⑤ 作成中の字幕生成は押せない（経過が出る）', m.find(r => r.k === 'sub').dis && /\d:\d\d/.test(m.find(r => r.k === 'sub').btn), m);
// 要約も始めて、閉じて続ける → 帯は「AI 2件 作成中」の1本
await pg.evaluate(() => { const kit = window._vpSumKit; kit.cues = () => ({ cues: Array.from({ length: 60 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: i + '秒' })), label: '日本語' });
  window._vpAiKit.subsOf = async () => ({ ok: true, labels: ['日本語'] }); });
await openMenu();
await pg.click('#vp-ai-menu [data-run="sum"]'); await pg.waitForSelector('#vsr-ov [data-act="go"]');
await pg.click('#vsr-ov [data-tab="bm"]').catch(() => {});
await pg.click('#vsr-ov [data-act="go"]'); await pg.waitForSelector('#vsr-ov [data-act="hide"]');
await pg.click('#vsr-ov [data-act="hide"]'); await pg.waitForTimeout(300);
d = await dock();
const n = await pg.evaluate(() => ({ docks: document.querySelectorAll('#vp-ai-dock').length, rows: document.querySelectorAll('#vp-ai-dock [data-ai-kind]').length, old: ['vsr-chip', 'vp-chap-chip'].filter(x => document.getElementById(x)) }));
ck('⑥ 2件になると帯は1本の「AI 2件 作成中」（別々の帯は出さない）', /AI 2件 作成中/.test(d) && n.docks === 1 && n.rows === 0 && !n.old.length, { d, n });
await pg.click('#vp-ai-dock [data-toggle]'); await pg.waitForTimeout(100);
const rows = await pg.evaluate(() => [...document.querySelectorAll('#vp-ai-dock [data-ai-kind]')].map(r => r.dataset.aiKind + ':' + r.textContent.replace(/\s+/g, ' ')));
ck('⑥ 押すと一覧が開き、1件ずつ（字幕生成・要約）が出る', rows.length === 2 && /^sub:.*字幕を作成中/.test(rows[0]) && /^sum:.*要約を作成中.*開く/.test(rows[1]), rows);
await pg.click('#vp-ai-dock [data-ai-kind="sum"]'); await pg.waitForTimeout(150);
const back = await pg.evaluate(() => ({ ov: getComputedStyle(document.getElementById('vsr-ov')).display, d: document.getElementById('vp-ai-dock')?.textContent.replace(/\s+/g, ' ') || '' }));
ck('⑥ 要約の行を押すと要約の窓に戻り、帯は字幕生成の1件だけになる', back.ov !== 'none' && /字幕を作成中/.test(back.d) && !/要約/.test(back.d), back);
const diff = await pg.evaluate(() => { const a = JSON.parse(window.__snap)[0], b = window.videos[0]; return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])); });
console.log('    変わった欄:', JSON.stringify(diff));
ck('⑦ メニュー・帯を使っても動画のデータ（ブックマーク・メモ・タグ等）を書かない（パネルを開いた記録は別）', diff.every(k => /^(lastPlayed|lastViewed|playCount|views|lastOpened|watched|lastWatched)/.test(k)), diff);
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ AI ボタン: 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
