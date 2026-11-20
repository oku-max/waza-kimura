// ═══ 動画パネルの上の並び・Journal の動画リンク（v53.025） ═══
// 使い方: node tools/vp-head-journal-check.mjs
// オーナー「AIボタンは一番右」「ドリルボタンを動画のプレイヤーの方に。歯車の右、リストの左」
//        「動画プレイヤーからつぶやきを作った時、その動画のリンクを入れよう。作成を押した瞬間の秒数」。本物の index.html で:
//   ① ブックマークの見出しの AI は「DRILL ここから」の右（1行目の右端。「＋ 現在位置でブックマーク」は幅で2行目に回るのでその前）
//   ② プレイヤーの上の ⚙ → DRILL → ☰。押すと見出しの「DRILL ここから」と同じ（2回押しでドリルのカード）。1回目の後は ■ で色が付く
//   ③ 動画パネルの Journal から書くと、記録に ref = { vid, t（押した瞬間の秒）, title } が付く・✕ で外せる・ほかから開いたときは付かない・動画のデータは変えない
//   ④ 記録の 🎬 を押すと、その動画をその位置から開く
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 120000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8298;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d !== undefined ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// SHOT=ディレクトリ を付けると、途中の画面を撮る（目で確かめる用）
const shot = async (pg, name) => { if (process.env.SHOT) await pg.screenshot({ path: path.join(process.env.SHOT, name + '.png'), fullPage: false }); };

// 偽の YouTube: 時刻だけ進む。window.__yt に作ったプレーヤーを並べる
const FAKE_YT = () => {
  window.__yt = [];
  function Player(el, opts) {
    const st = { t: Number(opts?.playerVars?.start) || 0, playing: false, rate: 1, vid: opts?.videoId, dead: false, el };
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (node) { const f = document.createElement('iframe'); f.dataset.fakeYt = '1'; node.replaceWith ? node.appendChild(f) : 0; }
    let last = performance.now();
    const iv = setInterval(() => { const n = performance.now(); if (st.playing && !st.dead) st.t += (n - last) / 1000 * st.rate; last = n; }, 50);
    const api = {
      __st: st,
      getCurrentTime: () => st.t, seekTo: (t) => { st.t = t; }, playVideo: () => { st.playing = true; opts?.events?.onStateChange?.({ data: 1 }); },
      pauseVideo: () => { st.playing = false; opts?.events?.onStateChange?.({ data: 2 }); },
      getPlayerState: () => st.playing ? 1 : 2, setPlaybackRate: r => { st.rate = r; }, getPlaybackRate: () => st.rate,
      getAvailablePlaybackRates: () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], getDuration: () => Number((window.videos || []).find(v => v.id === st.vid)?.duration) || 1800,
      getVideoData: () => ({ video_id: st.vid }), destroy: () => { st.dead = true; clearInterval(iv); },
      loadVideoById: o => { st.vid = o.videoId || o; st.t = o.startSeconds || 0; },
    };
    const px = new Proxy(api, { get: (o, k) => k in o ? o[k] : (() => undefined) });
    window.__yt.push(px);
    setTimeout(() => { opts?.events?.onReady?.({ target: px }); if (opts?.playerVars?.autoplay) px.playVideo(); }, 30);
    return px;
  }
  window.YT = { Player, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
};

{
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, locale: 'ja-JP' });
  await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
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
  await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FB_STUB }));
  await ctx.addInitScript(() => { localStorage.setItem('wk_ob_done', '1'); localStorage.setItem('wk_hint_ts', String(Date.now())); });
  await ctx.addInitScript(FAKE_YT);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic|google is not/i.test(s)) errs.push(s.split('\n')[0]); });
  let promptAns = [];
  pg.on('dialog', d => { if (d.type() === 'prompt') d.accept(promptAns.length ? promptAns.shift() : undefined).catch(() => {}); else d.accept().catch(() => {}); });
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pg.waitForFunction(() => window.openVPanel && window.wkDrillTap && window.videos && window.openMurmurComposer);
  await pg.evaluate(() => {
    window.videos.length = 0;
    window.videos.push({ id: 'AAAAAAAAAAA', ytId: 'AAAAAAAAAAA', pt: 'youtube', title: '教則A', duration: 1800, tb: [], cat: [], pos: [], tags: [], bookmarks: [{ time: 0, label: 'イントロ', note: '' }] });
    window.__saves = 0; window.debounceSave = () => { window.__saves++; }; window.saveUserData = window.debounceSave;
    window.openVPanel('AAAAAAAAAAA');
    window.__snapV = JSON.stringify(window.videos);
  });
  await pg.waitForSelector('#vp-bm-list-AAAAAAAAAAA');
  await pg.waitForFunction(() => window._vpDrillKit.now() != null);
  const setT = t => pg.evaluate(t => { window.__yt.filter(p => !p.__st.dead).forEach(p => { p.__st.t = t; }); }, t);

  if (process.env.SHOT) { await setT(162.7); await pg.screenshot({ path: process.env.SHOT + '/top.png', clip: { x: 0, y: 0, width: 1300, height: 600 } }); }
  console.log('── ① AI ボタンはブックマークの見出しの一番右 ──');
  // 「＋ 現在位置でブックマーク」は幅が足りないと2行目に回るので、AI はその前（「DRILL ここから」の右＝1行目の右端）
  const ids = await pg.evaluate(() => [...document.querySelector('#vp-bm-section-AAAAAAAAAAA > div > span:last-child').children].map(e => e.id).filter(Boolean));
  const ia = ids.indexOf('vp-ai-AAAAAAAAAAA');
  ck('① AI は「DRILL ここから」のすぐ右・その後ろは「＋ 現在位置でブックマーク」だけ', ids[ia - 1] === 'vp-drill-tap-AAAAAAAAAAA' && ids[ia + 1] === 'vp-bm-add-btn-AAAAAAAAAAA' && ia === ids.length - 2, ids);
  for (const w of [1300, 390]) {
    await pg.setViewportSize({ width: w, height: 900 }); await wait(200);
    const r = await pg.evaluate(() => { const a = document.getElementById('vp-ai-AAAAAAAAAAA').getBoundingClientRect(), d = document.getElementById('vp-drill-tap-AAAAAAAAAAA').getBoundingClientRect(); return { sameRow: Math.abs(a.top - d.top) < 4, right: a.left > d.left }; });
    ck(`① 幅 ${w}px: AI は「DRILL ここから」と同じ行の右`, r.sameRow && r.right, r);
  }
  await pg.setViewportSize({ width: 1300, height: 900 }); await wait(200);

  console.log('── ② プレイヤーの ⚙ と ☰ の間に DRILL ──');
  const order = await pg.evaluate(() => { const g = document.getElementById('vp-more-btn'); return [...g.parentElement.children].map(e => e.id).filter(Boolean); });
  const gi = order.indexOf('vp-more-btn');
  ck('② 並びが ⚙ → DRILL → ☰（リスト）', order[gi + 1] === 'vp-drill-hd-AAAAAAAAAAA' && order[gi + 2] === 'vp-list-btn', order);
  await setT(100);
  await pg.click('#vp-drill-hd-AAAAAAAAAAA'); await wait(300);
  const s1 = await pg.evaluate(() => ({ hd: document.getElementById('vp-drill-hd-AAAAAAAAAAA').className + '|' + document.getElementById('vp-drill-hd-AAAAAAAAAAA').textContent,
    tap: document.getElementById('vp-drill-tap-AAAAAAAAAAA')?.textContent, slot: document.getElementById('vp-drill-slot')?.textContent || '' }));
  ck('② 1回目: 見出しの「DRILL ここから」を押したのと同じ（見出しは「■ ここまで」・下に開始の時刻）・上の DRILL は ■ で色が付く', /\bon\b/.test(s1.hd) && /■/.test(s1.hd) && /ここまで/.test(s1.tap) && /1:38/.test(s1.slot), s1);
  await setT(130);
  await pg.click('#vp-drill-hd-AAAAAAAAAAA'); await wait(400);
  const s2 = await pg.evaluate(() => ({ hd: document.getElementById('vp-drill-hd-AAAAAAAAAAA').className + '|' + document.getElementById('vp-drill-hd-AAAAAAAAAAA').textContent,
    tap: document.getElementById('vp-drill-tap-AAAAAAAAAAA')?.textContent, slot: document.getElementById('vp-drill-slot')?.textContent.replace(/\s+/g, ' ') || '', name: [...document.querySelectorAll('#vp-drill-slot input')].map(i => i.value).join('|') }));
  ck('② 2回目: ドリルのカードが開く（1:38〜2:10・名前はトラック名）・上の DRILL は元に戻る', !/\bon\b/.test(s2.hd) && /DRILL/.test(s2.hd) && /ここから/.test(s2.tap) && /イントロ/.test(s2.name) && /1:38/.test(s2.slot) && /2:10/.test(s2.slot), s2);
  await pg.evaluate(() => window.wkDrillCancel?.()); 

  console.log('── ③ 動画パネルから Journal に書くと、その動画と押した瞬間の位置が付く ──');
  await setT(162.7);
  await pg.click('#vp-journal-btn'); await pg.waitForSelector('#mm-composer.open');
  await setT(400);   // 押した後に動画が進んでも、押した瞬間の位置のまま
  if (process.env.SHOT) { await wait(700); await pg.screenshot({ path: process.env.SHOT + '/composer.png' }); }
  const c1 = await pg.evaluate(() => document.getElementById('mm-cp-vref')?.textContent.replace(/\s+/g, ' ') || '');
  ck('③ 書く画面に「🎬 教則A 2:42 ✕」（押した瞬間の位置）', /教則A/.test(c1) && /2:42/.test(c1) && /✕/.test(c1), c1);
  await pg.fill('#mm-cp-text', '膝の向きを試す'); await pg.click('#mm-cp-post'); await wait(300);
  const rec = await pg.evaluate(() => window._murmursGetData()[0]);
  ck('③ 書いた記録に ref = { vid, t: 162, title }（本文・タグはいつもどおり）', rec && rec.body === '膝の向きを試す' && rec.ref && rec.ref.vid === 'AAAAAAAAAAA' && rec.ref.t === 162 && rec.ref.title === '教則A', rec);
  ck('③ 動画のデータは変えない', await pg.evaluate(() => JSON.stringify(window.videos.map(v => ({ ...v, lastPlayed: 0, playCount: 0 }))) === JSON.stringify(JSON.parse(window.__snapV).map(v => ({ ...v, lastPlayed: 0, playCount: 0 })))));
  // ✕ で外せる
  await pg.click('#vp-journal-btn'); await pg.waitForSelector('#mm-composer.open');
  await pg.click('#mm-cp-vref .mm-vref-x');
  await pg.fill('#mm-cp-text', 'リンクなし'); await pg.click('#mm-cp-post'); await wait(300);
  const rec2 = await pg.evaluate(() => window._murmursGetData()[0]);
  ck('③ ✕ で外すと動画を付けない', rec2.body === 'リンクなし' && !rec2.ref, rec2);
  // 動画パネル以外から開いたときは付かない
  await pg.evaluate(() => window.openMurmurComposer()); await pg.waitForSelector('#mm-composer.open');
  ck('③ 動画パネル以外から開いたときは付かない', await pg.evaluate(() => !document.getElementById('mm-cp-vref').classList.contains('on')));
  await pg.evaluate(() => document.getElementById('mm-cp-close').click());

  console.log('── ④ 記録の 🎬 を押すと、その位置から開く ──');
  await pg.evaluate(() => { window.closeVPanel?.(); window.switchTab?.('murmurs'); });
  await wait(500);
  const link = await pg.evaluate(() => document.querySelector('[data-mm-vref]')?.textContent.replace(/\s+/g, ' ') || '');
  ck('④ 一覧の記録に「🎬 教則A 2:42」', /🎬 教則A 2:42/.test(link), link);
  await pg.evaluate(() => { window.__openAt = null; const o = window.vpOpenAt; window.vpOpenAt = (id, t) => { window.__openAt = [id, t]; return o(id, t); }; });
  await pg.click('[data-mm-vref]'); await wait(500);
  ck('④ 押すとその動画を 162 秒から開く', await pg.evaluate(() => JSON.stringify(window.__openAt) === '["AAAAAAAAAAA",162]' && window.openVPanelId === 'AAAAAAAAAAA'), await pg.evaluate(() => window.__openAt));
  ck('JSエラーなし', errs.length === 0, errs);
  await ctx.close();
}
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 見出しの AI・プレイヤーの DRILL・Journal の動画リンク: 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
