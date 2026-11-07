// ═══ 自動チャプターが1つの窓で進み、閉じても続きが分かること（v52.955・オーナー決定 mock-chap-flow.html の A） ═══
// 使い方: node tools/chap-flow-check.mjs
// 以前は作り方（ボタンの下）・細かさ（真ん中）・字幕の言語（字幕ボタンの下）が別々の場所に出ていた。
// 本物の index.html で:
//   ① 押すと真ん中に窓が1つ出て、作り方 → 細かさ が同じ窓・同じ位置・同じ大きさで進む（別の窓を出さない）
//   ② 勝手に「おすすめ」を付けない
//   ③ 「← 戻る」で作り方に戻れる
//   ④ 字幕が無い動画: 字幕生成が聞く「何語で作るか」も同じ窓の中に出る（字幕ボタンの下に出ない）。答えると作成中の表示
//   ⑤ 「閉じて続ける」→ 左下の帯と 📑 ボタンに経過が出る・パネルを開き直しても消えない・帯を押すと窓が戻る
//   ⑥ 「作成をやめる」→ 窓も帯も消え、ボタンが元に戻る・何も書かない
//   ⑦ 隠している間に終わったら、帯が「確認する」に変わり、勝手にブックマークへ入れない・押すと確認画面・追加で書き、窓と帯が消える
//   ⑧ 確認画面の × は隠すだけ（作った結果を捨てない）
//   ⑨ 一括処理（preset）は窓を出さない（今までどおり）
//   ⑩ 作業中にもう一度押しても、新しく始めずに今の窓を開く
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8212;
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
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });

let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
await pg.evaluate(() => {
  window.videos.length = 0;
  window.videos.push({ id:'AAAAAAAAAAA', ytId:'AAAAAAAAAAA', pt:'youtube', title:'教則A', duration: 3660, tb:[], cat:[], pos:[], tags:[], bookmarks:[] });
  window.videos.push({ id:'BBBBBBBBBBB', ytId:'BBBBBBBBBBB', pt:'youtube', title:'教則B', duration: 3660, tb:[], cat:[], pos:[], tags:[], bookmarks:[] });
  window._firebaseCurrentUser = () => ({ uid:'u1', getIdToken: async () => 'tok' });
  // AIの呼び出しだけ差し替える。delay ミリ秒待ってから、貼り付けた一覧を読んだ結果を返す。hang なら返さない
  const orig = window.fetch.bind(window);
  window.__ai = { delay: 50, hang: false, calls: [] };
  window.fetch = (u, o) => {
    // 字幕づくりの途中を見るときは、AI・字幕のサーバー呼び出しを返さずに止めておく（YouTubeのチャプターの下見は除く）
    if (window.__ai.hang && String(u).startsWith('/api/') && !String(u).startsWith('/api/yt-videos')) { window.__ai.calls.push(String(u)); return new Promise(() => {}); }
    if (String(u).startsWith('/api/ai-summary')) {
      const body = JSON.parse(o?.body || '{}'); window.__ai.calls.push(body.source || body.mode);
      if (window.__ai.hang || body.source !== 'chapterlist') return new Promise(() => {});
      const items = [{ title:'イントロ', start:'0:00' }, { title:'グリップ', start:'1:30' }, { title:'スイープ', start:'3:05' }];
      return new Promise(r => setTimeout(() => r(new Response(JSON.stringify({ summary: JSON.stringify({ items }), costUsd: 0 }), { status: 200 })), window.__ai.delay));
    }
    return orig(u, o);
  };
});
await pg.evaluate(() => window.openVPanel('AAAAAAAAAAA'));
await pg.waitForSelector('#vp-chapgen-AAAAAAAAAAA');
await pg.waitForTimeout(600);
const st = () => pg.evaluate(() => {
  const w = document.getElementById('vp-flow-win'); const box = w?.querySelector('.vp-flow-box'); const r = box?.getBoundingClientRect();
  return { win: !!w, visible: !!w && w.style.display !== 'none', rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
    opts: [...document.querySelectorAll('#vp-flow-win .vp-flow-opt')].map(b => b.textContent.replace(/\s+/g, ' ').trim()),
    crumbs: document.querySelector('#vp-flow-win .vp-flow-crumbs')?.textContent || '',
    body: document.querySelector('#vp-flow-win .vp-flow-body')?.textContent.replace(/\s+/g, ' ') || '',
    outside: ['vp-chapgen-menu','vp-subgen-menu'].filter(x => document.getElementById(x)).concat(
      ['vp-chap-grain-bg','vp-chap-in-bg','vp-chap-rv-bg'].filter(x => { const e = document.getElementById(x); return e && !e.closest('#vp-flow-win'); })),
    chip: document.getElementById('vp-chap-chip')?.textContent.replace(/\s+/g, ' ') || '',
    btn: document.getElementById('vp-chapgen-AAAAAAAAAAA')?.textContent.replace(/\s+/g, ' ').trim() || '',
    bms: (window.videos.find(v => v.id === 'AAAAAAAAAAA')?.bookmarks || []).length };
});
const until = async (fn, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const r = await st(); if (fn(r)) return r; await pg.waitForTimeout(100); } return st(); };

// ①②
await pg.click('#vp-chapgen-AAAAAAAAAAA');
let s1 = await until(r => r.opts.length >= 3);
ck('① 押すと真ん中に窓が1つ出て、作り方の選択肢がその中に並ぶ（ボタンの下のメニューは出ない）', s1.win && s1.visible && s1.opts.length === 3 && !s1.outside.length && /作り方/.test(s1.crumbs), s1);
ck('② 「おすすめ」を付けない', !s1.opts.some(t => /おすすめ/.test(t)), s1.opts);
ck('④ 字幕が無い動画では、字幕から検出の説明に「先に字幕を作ってから」と出る', s1.opts.some(t => /字幕から検出/.test(t) && /先に字幕を作ってから/.test(t)), s1.opts);
await pg.click('#vp-flow-win .vp-flow-opt[data-v="sub"]');
let s2 = await until(r => /細かめ/.test(r.body));
ck('① 細かさが同じ窓・同じ位置・同じ大きさで出る（別の窓を出さない）', s2.visible && JSON.stringify(s2.rect) === JSON.stringify(s1.rect) && !s2.outside.length && /細かさ/.test(s2.crumbs) && /字幕の言語/.test(s2.crumbs), { s1: s1.rect, s2: s2.rect, out: s2.outside, c: s2.crumbs });
// ③
await pg.click('#vp-chap-grain-back');
let s3 = await until(r => r.opts.length >= 3);
ck('③ 「← 戻る」で作り方に戻る', s3.opts.length === 3 && JSON.stringify(s3.rect) === JSON.stringify(s1.rect), s3);
// ④ 字幕の言語も同じ窓
await pg.evaluate(() => { window.__ai.hang = true; });
await pg.click('#vp-flow-win .vp-flow-opt[data-v="sub"]');
await until(r => /細かめ/.test(r.body));
await pg.click('#vp-flow-win .vp-chap-grain-opt[data-g="normal"]');
let s4 = await until(r => r.opts.some(t => /原語のまま/.test(t)));
ck('④ 字幕の言語が同じ窓・同じ位置に出る（字幕ボタンの下のメニューは出ない）', s4.opts.some(t => /日本語/.test(t)) && s4.opts.some(t => /原語のまま/.test(t)) && !s4.outside.length && JSON.stringify(s4.rect) === JSON.stringify(s1.rect) && /字幕がまだありません/.test(await pg.evaluate(() => document.querySelector('#vp-flow-win .vp-flow-note')?.textContent || '')), s4);
await pg.click('#vp-flow-win .vp-flow-opt[data-v="ja"]');
let s5 = await until(r => /字幕を作っています/.test(r.body) || /閉じて続ける/.test(r.body), 8000);
ck('④ 答えると、同じ窓が作成中の表示（経過・閉じて続ける・作成をやめる）になる', /閉じて続ける/.test(s5.body) && /作成をやめる/.test(s5.body) && /経過/.test(s5.body) && /作成中/.test(s5.crumbs), s5);
// ⑤ 閉じて続ける
await pg.click('#vp-flow-win [data-hide]');
let s6 = await until(r => r.chip);
ck('⑤ 閉じると窓は隠れ、左下の帯に「チャプター作成中・経過・動画名」が出る', !s6.visible && /チャプター作成中/.test(s6.chip) && /教則A/.test(s6.chip) && /\d:\d\d/.test(s6.chip), s6);
ck('⑤ 📑 ボタンに「⏳ 作成中 m:ss」が出る', /作成中 \d:\d\d/.test(s6.btn), s6.btn);
await pg.evaluate(() => window.closeVPanel?.()); await pg.waitForTimeout(200);
await pg.evaluate(() => window.openVPanel('AAAAAAAAAAA')); await pg.waitForTimeout(500);
let s7 = await st();
ck('⑤ パネルを閉じて開き直しても、帯もボタンの「作成中」も消えない', /チャプター作成中/.test(s7.chip) && /作成中/.test(s7.btn), s7);
// ⑩ もう一度押しても新しく始めない
await pg.click('#vp-chapgen-AAAAAAAAAAA');
let s8 = await until(r => r.visible);
ck('⑩ 作業中に 📑 を押すと、新しく始めずに今の窓（作成中）が開く・帯は消える', s8.visible && /閉じて続ける/.test(s8.body) && !s8.chip, s8);
// ⑥ やめる
await pg.click('#vp-flow-win [data-stop]');
let s9 = await until(r => !r.win);
ck('⑥ 「作成をやめる」で窓も帯も消え、ボタンが元に戻る・何も書かない', !s9.win && !s9.chip && /自動チャプター/.test(s9.btn) && s9.bms === 0, s9);
await pg.waitForTimeout(300);

// ⑦ 隠している間に終わる → 帯が「確認する」→ 押すと確認画面 → 追加
await pg.evaluate(() => { window.__ai.hang = false; window.__ai.delay = 1500; });
await pg.click('#vp-chapgen-AAAAAAAAAAA');
await until(r => r.opts.length >= 3);
await pg.click('#vp-flow-win .vp-flow-opt[data-v="list"]');
await until(r => /自分で一括入力/.test(r.body));
await pg.fill('#vp-chap-in-text', '0:00 イントロ\n1:30 グリップ\n3:05 スイープ');
await pg.click('#vp-chap-in-ok');
await until(r => /閉じて続ける/.test(r.body));
await pg.click('#vp-flow-win [data-hide]');
let r1 = await until(r => /できました/.test(r.chip), 8000);
ck('⑦ 隠している間に終わると、帯が「チャプターができました・確認する」に変わる・ボタンも「できました」', /確認する/.test(r1.chip) && /できました/.test(r1.btn) && !r1.visible, r1);
ck('⑦ 確認するまでブックマークには入れない', r1.bms === 0, r1.bms);
await pg.click('#vp-chap-chip');
let r2 = await until(r => /イントロ/.test(r.body) && /グリップ/.test(r.body));
ck('⑦ 帯を押すと、同じ窓で確認画面が開く', r2.visible && !r2.outside.length && /確認/.test(r2.crumbs) && !r2.chip, r2);
// ⑧ × は隠すだけ
await pg.click('#vp-flow-win .vp-flow-x');
let r3 = await until(r => /確認する/.test(r.chip));
ck('⑧ 確認画面の × は隠すだけ（帯が「確認する」・結果は残る）', !r3.visible && r3.win && r3.bms === 0, r3);
await pg.click('#vp-chap-chip');
await until(r => r.visible && /イントロ/.test(r.body));
await pg.click('#vp-chap-ok');
let r4 = await until(r => !r.win);
ck('⑦ 追加すると書き込まれ、窓・帯が消え、ボタンが元に戻る', r4.bms === 3 && !r4.chip && /自動チャプター/.test(r4.btn), r4);

// ⑨ 一括処理は窓を出さない
await pg.evaluate(() => { window.__ai.delay = 50; });
const pr = await pg.evaluate(async () => {
  let sawWin = false; const mo = new MutationObserver(() => { if (document.getElementById('vp-flow-win')) sawWin = true; });
  mo.observe(document.body, { childList: true });
  const r = await window.vpGenChapters('BBBBBBBBBBB', { via: 'list', input: { text: '0:00 a\n1:30 b' }, silent: true });
  mo.disconnect();
  return { ok: r.ok, sawWin, chip: !!document.getElementById('vp-chap-chip'), bms: window.videos.find(v => v.id === 'BBBBBBBBBBB').bookmarks.length };
});
ck('⑨ 一括処理（preset）は窓も帯も出さずに今までどおり書く', pr.ok && !pr.sawWin && !pr.chip && pr.bms === 3, pr);
ck('JSエラーなし', errs.length === 0, errs);
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 自動チャプターの窓: 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
