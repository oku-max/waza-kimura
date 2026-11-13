// ═══ ドリル（v52.989・オーナー決定 mock-drill.html: 端は A「±ボタン」／回す画面は A「道場」と B「一覧」の両方） ═══
// 使い方: node tools/drill-check.mjs
// 本物の index.html で（YouTube のプレーヤーは時刻だけ進む偽物に差し替える）:
//   ① ブックマークの行の 🏋️: その時刻〜次のブックマークがそのまま区間・名前はブックマークの題名
//   ② ループしたまま端を合わせる: 終わりに来たら開始へ戻る・±1秒・今の位置・開始は終了より前のまま
//   ③ 反転・速度はドリルが覚え、カードを閉じたら動画パネルの反転・速度を元に戻す
//   ④ 動画のデータ（v.bookmarks 等）を1文字も変えない・動画の保存を呼ばない
//   ⑤ 「🏋️ ここから」→「■ ここまで」の2回押し（開始は押した2秒前）・やめるなら何も保存しない
//   ⑥ Drill タブ: 一覧・並べ方・名前を変える・メニューを作る・削除（確認・印だけ残す）
//   ⑦ 回す: 道場モード（大きい3つのボタン）／一覧のまま、の切り替え・N回で次へ・やった +1（記録）・反転をドリルに覚える・終わる
//   ⑧ 同期（本物の firebase.js を偽のクラウドにつなぐ・2端末）: 書くのは変えた1件だけ（items.{id}）・ほかの端末に届く・
//      消した印が届いて復活しない・クラウドを読めない端末は書かない・ほかのアカウントの控えを送らない・バックアップに入り復元で戻る
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 170000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright', 'index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8261;
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

// ─────────────── 前半: 画面（ログインなし） ───────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
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
  await pg.waitForFunction(() => window.openVPanel && window.wkDrillFromBm && window.videos);
  const BMS = [{ time: 0, label: 'イントロ', note: '' }, { time: 60, label: 'デラヒーバフック', note: '膝の裏', star: 2 }, { time: 200, label: 'グリップ', note: '' }, { time: 900, label: '仕上げ', note: '', endTime: 960 }];
  await pg.evaluate(BMS => {
    window.videos.length = 0;
    window.videos.push({ id: 'AAAAAAAAAAA', ytId: 'AAAAAAAAAAA', pt: 'youtube', title: '教則A', duration: 1800, tb: [], cat: [], pos: [], tags: [], bookmarks: JSON.parse(JSON.stringify(BMS)) });
    window.videos.push({ id: 'BBBBBBBBBBB', ytId: 'BBBBBBBBBBB', pt: 'youtube', title: '教則B', duration: 600, tb: [], cat: [], pos: [], tags: [], bookmarks: [{ time: 30, label: 'エビ', note: '' }] });
    window.__saves = 0; window.__saveStacks = []; window.debounceSave = () => { window.__saves++; window.__saveStacks.push(new Error().stack.split('\n').slice(2,5).join(' | ')); }; window.saveUserData = window.debounceSave;
    window.openVPanel('AAAAAAAAAAA');
  }, BMS);
  await pg.waitForSelector('#vp-bm-list-AAAAAAAAAAA');
  await pg.waitForFunction(() => window._vpDrillKit.now() != null);
  await pg.evaluate(() => window.vpDivFoldAll?.('AAAAAAAAAAA'));
  const yt = () => pg.evaluate(() => { const p = window.__yt[window.__yt.length - 1]; return { t: p.__st.t, rate: p.__st.rate }; });
  const setT = t => pg.evaluate(t => { window.__yt.filter(p => !p.__st.dead).forEach(p => { p.__st.t = t; }); }, t);
  const store = () => pg.evaluate(() => JSON.parse(localStorage.getItem('wk_drills') || '{}'));
  const alive = s => Object.values(s.items || {}).filter(d => !d.del);

  console.log('── ① ブックマークの行の 🏋️ ──');
  let row = await pg.evaluate(() => [...document.querySelectorAll('#vp-bm-list-AAAAAAAAAAA [data-bm-idx="1"] > div > *')].map(c => c.className.includes('vp-bm-drill') ? 'DRILL' : c.className.includes('vp-bm-star') ? 'STAR' : /編集/.test(c.textContent) ? 'EDIT' : '').filter(Boolean).join('>'));
  ck('① 行の右に 🏋️・★・編集 の順で並ぶ', row === 'DRILL>STAR>EDIT', row);
  const noWrap = await pg.evaluate(() => [...document.querySelectorAll('#vp-bm-list-AAAAAAAAAAA [data-bm-idx]')].every(r => { const e = [...r.querySelectorAll('button')].find(x => /編集/.test(x.textContent)); return e && e.getBoundingClientRect().height < 26; }) && document.documentElement.scrollWidth <= 390);
  ck('① 390px でも「編集」が1行のまま・横にはみ出さない', noWrap);
  await pg.click('#vp-bm-list-AAAAAAAAAAA [data-bm-idx="1"] .vp-bm-drill');
  await wait(300);
  let card = await pg.evaluate(() => ({ name: document.getElementById('vp-drill-name')?.value, a: document.getElementById('vp-drill-a')?.textContent, b: document.getElementById('vp-drill-b')?.textContent }));
  ck('① その時刻〜次のブックマークが区間・名前はブックマークの題名', card.name === 'デラヒーバフック' && card.a === '1:00' && card.b === '3:20', card);
  ck('① カードの区間の頭へ飛ぶ', Math.abs((await yt()).t - 60) < 1.5, await yt());

  console.log('── ② ループしたまま端を合わせる ──');
  await setT(199.5); await wait(900);
  let y = await yt();
  ck('② 終わりに来たら開始へ戻る（ループ）', y.t >= 60 && y.t < 62, y);
  ck('② 何回目かを出す', /2回目/.test(await pg.textContent('#vp-drill-loops')));
  await pg.evaluate(() => { window.wkDrillNudge('b', 1); window.wkDrillNudge('a', -1); });
  card = await pg.evaluate(() => ({ a: document.getElementById('vp-drill-a')?.textContent, b: document.getElementById('vp-drill-b')?.textContent, len: document.getElementById('vp-drill-len')?.textContent }));
  ck('② ±1秒で端が動き、長さも変わる', card.a === '0:59' && card.b === '3:21' && /2:22/.test(card.len), card);
  await setT(120.4); await pg.evaluate(() => window.wkDrillSetNow('b'));
  ck('② 今の位置で終わりを決める', await pg.textContent('#vp-drill-b') === '2:00');
  await setT(150); await pg.evaluate(() => window.wkDrillSetNow('a'));
  ck('② 開始を終了より後にはできない', await pg.textContent('#vp-drill-a') === '0:59');
  await pg.evaluate(() => { for (let i = 0; i < 200; i++) window.wkDrillNudge('a', 1); });
  ck('② ±で詰めても開始は終了の1秒前まで', await pg.textContent('#vp-drill-a') === '1:59');
  await pg.evaluate(() => { for (let i = 0; i < 59; i++) window.wkDrillNudge('a', -1); });

  console.log('── ③ 反転・速度 ──');
  await pg.click('.dr-mir'); await pg.click('.dr-chip:has-text("×0.5")'); await wait(200);
  let vp = await pg.evaluate(() => ({ mir: !!window._vpMirrored, tr: document.getElementById('vpanel-iframe-container')?.style.transform }));
  ck('③ 反転を押すと動画パネルが反転する（いつものリバースと同じ）', vp.mir && /scaleX\(-1\)/.test(vp.tr), vp);
  await wait(300);
  ck('③ 速度 ×0.5 が効く', (await yt()).rate === 0.5, await yt());
  await pg.evaluate(() => document.getElementById('vp-drill-slot').scrollIntoView()); await shot(pg, '1-card');
  await pg.fill('#vp-drill-name', 'フックの出し入れ');
  await pg.click('.dr-save'); await wait(400);
  let s = await store(), s0;
  let d1 = alive(s)[0];
  ck('③ 保存したドリルが区間・名前・反転・速度を覚える', alive(s).length === 1 && d1.vid === 'AAAAAAAAAAA' && d1.a === 60 && d1.b === 120 && d1.mir === true && d1.sp === 0.5 && d1.title === 'フックの出し入れ', d1);
  vp = await pg.evaluate(() => ({ mir: !!window._vpMirrored, slot: document.getElementById('vp-drill-slot').innerHTML }));
  await wait(300);
  ck('③ 閉じたら動画パネルの反転・速度を元に戻す・カードが消える', !vp.mir && (await yt()).rate === 1 && vp.slot === '', { vp, yt: await yt() });
  ck('① 保存したブックマークの 🏋️ に印が付く', await pg.evaluate(() => document.querySelector('#vp-bm-list-AAAAAAAAAAA [data-bm-idx="1"] .vp-bm-drill').classList.contains('on')));

  console.log('── ④ 動画のデータに触らない ──');
  let vv = await pg.evaluate(() => ({ bms: window.videos[0].bookmarks, saves: window.__saveStacks.filter(x => !/openVPanel|closeVPanel/.test(x)).length }));
  ck('④ v.bookmarks は1文字も変わらない・動画の保存を呼ばない（パネルを開くときの保存は今までどおり）', JSON.stringify(vv.bms) === JSON.stringify(BMS) && vv.saves === 0, vv);

  console.log('── ⑤ 2回押し ──');
  await setT(300.6);
  await pg.click('#vp-drill-tap-AAAAAAAAAAA'); await wait(300);
  ck('⑤ 1回目で「■ ここまで」になる', /ここまで/.test(await pg.textContent('#vp-drill-tap-AAAAAAAAAAA')) && /ここまで/.test(await pg.textContent('#vp-drill-slot')));
  await setT(330.2);
  await pg.click('#vp-drill-slot .dr-tap-end'); await wait(300);
  card = await pg.evaluate(() => ({ a: document.getElementById('vp-drill-a')?.textContent, b: document.getElementById('vp-drill-b')?.textContent, name: document.getElementById('vp-drill-name')?.value }));
  ck('⑤ 開始は押した2秒前・終わりは2回目の位置・名前はトラック（開始が入っているブックマーク）の名前', card.a === '4:58' && card.b === '5:30' && card.name === 'グリップ', card);
  await pg.click('#vp-drill-slot .dr-x'); await wait(200);
  ck('⑤ やめると何も保存しない', alive(await store()).length === 1);
  // 同じトラックから作ると番号をふる（v52.990）。最初の1本は番号なし・今あるドリルの名前は書き換えない
  const tap2 = async (a, b) => { await setT(a); await pg.click('#vp-drill-tap-AAAAAAAAAAA'); await wait(250); await setT(b); await pg.click('#vp-drill-slot .dr-tap-end'); await wait(250);
    return pg.evaluate(() => document.getElementById('vp-drill-name')?.value); };
  let nm = await tap2(240, 260); await pg.click('.dr-save'); await wait(200);
  const n2 = await tap2(300.6, 330); await pg.click('.dr-save'); await wait(200);
  const n3 = await tap2(250, 280);
  ck('⑤ 同じトラックから作るたびに番号をふる（グリップ → グリップ 2 → グリップ 3）', nm === 'グリップ' && n2 === 'グリップ 2' && n3 === 'グリップ 3', [nm, n2, n3]);
  await pg.click('#vp-drill-slot .dr-x'); await wait(200);
  s0 = await store();
  ck('⑤ 番号を付けても、前のドリルの名前は書き換えない', alive(s0).filter(d => /^グリップ/.test(d.title)).map(d => d.title).sort().join('|') === 'グリップ|グリップ 2', alive(s0).map(d => d.title));
  for (const d of alive(s0).filter(d => /^グリップ/.test(d.title))) await pg.evaluate(id => window.wkDrillDelete(id), d.id);
  await wait(200);
  ck('⑤ 消した分は番号の数えに入らない', await tap2(300, 320) === 'グリップ');
  await pg.click('#vp-drill-slot .dr-x'); await wait(200);
  await pg.click('#vp-bm-list-AAAAAAAAAAA [data-bm-idx="3"] .vp-bm-drill'); await wait(200);
  ck('① 終わりの時刻があるブックマークはそこまで', await pg.textContent('#vp-drill-b') === '16:00');
  await pg.click('.dr-save'); await wait(200);
  await pg.evaluate(() => window.closeVPanel());
  await pg.evaluate(() => window.openVPanel('BBBBBBBBBBB')); await pg.waitForSelector('#vp-bm-list-BBBBBBBBBBB');
  await pg.waitForFunction(() => window._vpDrillKit.now() != null);
  await setT(12); await pg.click('#vp-drill-tap-BBBBBBBBBBB'); await wait(250); await setT(20); await pg.click('#vp-drill-slot .dr-tap-end'); await wait(250);
  ck('⑤ 開始より前にブックマークが無ければ、動画の名前', await pg.evaluate(() => document.getElementById('vp-drill-name')?.value) === '教則B');
  await pg.click('#vp-drill-slot .dr-x'); await wait(200);
  await pg.click('#vp-bm-list-BBBBBBBBBBB [data-bm-idx="0"] .vp-bm-drill'); await wait(200);
  ck('① 最後のブックマークは動画の終わりまで', await pg.textContent('#vp-drill-b') === '10:00');
  await pg.click('.dr-save'); await wait(200);
  await pg.evaluate(() => window.closeVPanel());

  console.log('── ⑥ Drill タブ ──');
  await pg.evaluate(() => window.switchTab('drills')); await wait(300);
  let names = await pg.$$eval('#drillsTab .drl-tt', a => a.map(x => x.textContent));
  ck('⑥ 一覧に3本', names.length === 3, names);
  await pg.evaluate(() => window.wkDrillSort('video')); await wait(100);
  names = await pg.$$eval('#drillsTab .drl-tt', a => a.map(x => x.textContent));
  ck('⑥ 動画ごと: 動画の名前の順・同じ動画は時刻の順', names.join('|') === 'フックの出し入れ|仕上げ|エビ', names);
  await pg.evaluate(() => window.wkDrillSort('old'));
  await pg.locator('#drillsTab .drl-more').first().click(); await wait(100);
  promptAns = ['新しい名前'];
  await pg.click('#drillsTab .drl-acts button:has-text("名前を変える")'); await wait(200);
  ck('⑥ 名前を変える', alive(await store()).some(d => d.title === '新しい名前'));
  promptAns = ['空のメニュー'];
  ck('④ 何も選んでいなければ「＋ 新しいメニュー」', /新しいメニュー/.test(await pg.textContent('#drillsTab .drl-menu-add')));
  await pg.click('#drillsTab .drl-menu-add'); await wait(200);
  const em = Object.values((await store()).menus).find(m => m.name === '空のメニュー');
  ck('④ 空のメニューを作れる（回すボタンは押せない）', em && em.ids.length === 0 && await pg.evaluate(() => [...document.querySelectorAll('#drillsTab .drl-menu-run')].find(b => /空のメニュー/.test(b.textContent))?.disabled === true), em);
  // （「名前を変える」で開いた1行目の操作の行がまだ開いている）
  await pg.selectOption('#drillsTab .drl-acts select', { label: '空のメニュー' }); await wait(200);
  ck('④ 空のメニューに、行の「メニューに入れる…」で足せる', Object.values((await store()).menus).find(m => m.name === '空のメニュー')?.ids.length === 1);
  await pg.locator('#drillsTab .drl-more').first().click(); await wait(100);
  await pg.locator('#drillsTab .drl-ck').nth(0).check(); await pg.locator('#drillsTab .drl-ck').nth(1).check(); await wait(100);
  await shot(pg, '2-list');
  ck('⑥ 選ぶと下に「▶ 回す」の帯', /2本を選択/.test(await pg.textContent('#drillsTab .drl-bar')));
  promptAns = ['朝のガード'];
  await pg.click('#drillsTab .drl-menu-add'); await wait(200);
  s = await store();
  const menu = Object.values(s.menus).find(m => !m.del && m.name === '朝のガード');
  ck('⑥ 選んだものでメニューを作る', menu && menu.name === '朝のガード' && menu.ids.length === 2, s.menus);
  ck('⑥ メニューが棚に出る', /朝のガード/.test(await pg.textContent('#drillsTab .drl-menus')));
  const delId = alive(s).find(d => !menu.ids.includes(d.id)).id;
  await pg.evaluate(id => window.wkDrillDelete(id), delId); await wait(200);
  s = await store();
  ck('⑥ 削除は確認のうえ、消した印（del）だけを残す', s.items[delId]?.del === true && alive(s).length === 2, s.items[delId]);
  vv = await pg.evaluate(() => ({ bms: window.videos[0].bookmarks, saves: window.__saveStacks.filter(x => !/openVPanel|closeVPanel/.test(x)).length, st: window.__saveStacks }));
  ck('④ ここまでの操作で動画のデータは変わらない', JSON.stringify(vv.bms) === JSON.stringify(BMS) && vv.saves === 0, vv);

  console.log('── ⑦ 回す ──');
  await pg.evaluate(() => { localStorage.setItem('wk_drillPrefs', JSON.stringify({ mode: 'A', adv: 'loops', n: 3, secs: 60, sort: 'old' })); });
  await pg.evaluate(() => location.reload()); await pg.waitForFunction(() => window.wkDrillRun && window.videos);
  await pg.evaluate(BMS => {
    window.videos.length = 0;
    window.videos.push({ id: 'AAAAAAAAAAA', ytId: 'AAAAAAAAAAA', pt: 'youtube', title: '教則A', duration: 1800, bookmarks: BMS });
    window.videos.push({ id: 'BBBBBBBBBBB', ytId: 'BBBBBBBBBBB', pt: 'youtube', title: '教則B', duration: 600, bookmarks: [] });
  }, BMS);
  s = await store();
  const m = Object.values(s.menus).find(x => !x.del && x.name === '朝のガード');
  await pg.evaluate(id => { window.switchTab('drills'); window.wkDrillRunMenu(id); }, m.id);
  await pg.waitForFunction(() => window.__yt.some(p => !p.__st.dead && p.__st.t > 0)); await wait(400);
  const run = () => pg.evaluate(() => ({ cls: document.getElementById('drill-run')?.className, title: document.querySelector('.drr-title')?.textContent, pos: document.querySelector('.drr-pos')?.textContent,
    mir: document.getElementById('drr-frame')?.classList.contains('mir'), bigs: document.querySelectorAll('.drr-bigs button').length, q: document.querySelectorAll('.drr-qi').length,
    yt: (() => { const p = window.__yt.filter(p => !p.__st.dead).pop(); return p && { t: p.__st.t, rate: p.__st.rate, vid: p.__st.vid }; })() }));
  let r = await run();
  const first = alive(s).find(d => d.id === m.ids[0]);
  ck('⑦ 全画面で開き、道場モードは大きい3つのボタン', /drr-A/.test(r.cls) && r.bigs === 3 && r.pos === '1/2' && r.title === first.title, r);
  ck('⑦ 区間の頭から・ドリルの速度と反転で始まる', Math.abs(r.yt.t - first.a) < 2 && r.yt.rate === (first.sp || 1) && r.mir === !!first.mir, { r, first });
  await shot(pg, '3-runA');
  for (let i = 0; i < 2; i++) { await setT(first.b - 0.1); await wait(600); }
  r = await run();
  ck('⑦ ループする（N回の途中は同じドリル・何回目かを出す）', r.pos === '1/2' && (await pg.textContent('#drr-loop')) === '3', { r, loop: await pg.textContent('#drr-loop') });
  await setT(first.b - 0.1); await wait(700);
  r = await run();
  const second = alive(s).find(d => d.id === m.ids[1]);
  ck('⑦ 3回で次のドリルへ（別の動画なら読み込み直す）', r.pos === '2/2' && r.title === second.title && r.yt?.vid === second.vid, r);
  await pg.click('.drr-bigs .did'); await wait(200);
  s = await store();
  const sd = s.items[second.id];
  ck('⑦ やった +1 で回数と記録（日時）が増える', sd.n === 1 && sd.log.length === 1 && Date.now() - sd.log[0] < 60000, sd);
  await pg.click('.drr-set .drr-mir'); await wait(200);
  s = await store();
  ck('⑦ 回す画面で反転を変えると、そのドリルに覚える', s.items[second.id].mir === !second.mir && (await run()).mir === !second.mir, s.items[second.id]);
  await pg.click('.drr-seg button:has-text("一覧")'); await wait(200);
  r = await run();
  ck('⑦ 一覧のまま に切り替えると今日の順番が並ぶ（再生はそのまま）', /drr-B/.test(r.cls) && r.q === 2 && r.yt?.vid === second.vid, r);
  await shot(pg, '4-runB');
  await pg.click('.drr-qi >> nth=0'); await wait(400);
  r = await run();
  ck('⑦ 一覧から押したドリルへ飛ぶ', r.pos === '1/2' && r.yt?.vid === first.vid, r);
  await pg.evaluate(() => window.wkDrillAdv('hand')); await setT(first.b - 0.1); await wait(700);
  ck('⑦ 「手で」なら終わりで頭に戻るだけ（次へ行かない）', (await run()).pos === '1/2');
  await pg.evaluate(() => window.wkDrillNext()); await wait(200); await pg.evaluate(() => window.wkDrillNext()); await wait(200);
  ck('⑦ 最後まで行くと「おつかれさま」と回数', /おつかれさま/.test(await pg.textContent('#drill-run')) && /1回/.test(await pg.textContent('#drill-run')));
  await pg.click('.drr-close'); await wait(200);
  ck('⑦ 終わると全画面を閉じ、プレーヤーを止める', await pg.evaluate(() => !document.getElementById('drill-run') && window.__yt.every(p => p.__st.dead || p.__st.el === 'vpanel-yt-player')));
  ck('⑦ 回す画面の好みはこの端末だけ', (await pg.evaluate(() => JSON.parse(localStorage.getItem('wk_drillPrefs')))).mode === 'B');
  vv = await pg.evaluate(() => window.videos[0].bookmarks);
  ck('④ 回しても動画のデータは変わらない', JSON.stringify(vv) === JSON.stringify(BMS), vv);
  ck('ページのエラーなし', errs.length === 0, errs);
  await ctx.close();
}

// ─────────────── 後半: 同期（本物の firebase.js・偽のクラウド・2端末） ───────────────
console.log('── ⑧ 同期 ──');
{
  const CLOUD = {};
  const DRILL_DOC = 'users/u1/data/drills';
  const OTHER = { 'users/u1/data/settings': { customViews: [], updatedAt: 'x' } };
  async function mkCtx(opt = {}) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ja-JP' });
    await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
    await ctx.exposeFunction('__fsAll', () => JSON.stringify(CLOUD));
    await ctx.exposeFunction('__fsSet', (p, dj, merge) => { const d = JSON.parse(dj); const cur = (merge && CLOUD[p]) || {};
      const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (merge && v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') ? deep(a[k], v) : v; return o; };
      CLOUD[p] = deep(cur, d); });
    await ctx.exposeFunction('__fsUpdate', (p, dj) => { if (!CLOUD[p]) return 'not-found'; const d = JSON.parse(dj); const out = JSON.parse(JSON.stringify(CLOUD[p]));
      for (const [k, v] of Object.entries(d)) { const ks = k.split('.'); let o = out; for (const x of ks.slice(0, -1)) { if (!o[x] || typeof o[x] !== 'object') o[x] = {}; o = o[x]; } o[ks[ks.length - 1]] = v; }
      CLOUD[p] = out; return ''; });
    await ctx.exposeFunction('__fsLog', (p, kind, dj) => { (globalThis.__LOG ||= []).push({ p, kind, d: JSON.parse(dj) }); });
    await ctx.addInitScript(([uid, failRead, local]) => {
      if (local) localStorage.setItem('wk_drills', local);
      const all = async () => JSON.parse(await window.__fsAll());
      const doc = p => ({
        get: async () => { if (failRead && /data\/drills$/.test(p)) throw new Error('読めない'); const d = (await all())[p]; return { exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), metadata: {} }; },
        set: async (d, o) => { await window.__fsLog(p, 'set', JSON.stringify(d)); await window.__fsSet(p, JSON.stringify(d), !!(o && o.merge)); },
        update: async d => { await window.__fsLog(p, 'update', JSON.stringify(d)); const r = await window.__fsUpdate(p, JSON.stringify(d)); if (r === 'not-found') { const e = new Error('No document to update'); e.code = 'not-found'; throw e; } },
        delete: async () => {},
        onSnapshot: cb => { let last, on = true; const tick = async () => { if (!on) return; const d = (await all())[p]; const j = JSON.stringify(d);
          if (j !== last) { last = j; try { cb({ exists: d !== undefined, data: () => d && JSON.parse(j), metadata: { hasPendingWrites: false } }); } catch (e) {} } setTimeout(tick, 300); };
          tick(); return () => { on = false; }; },
        collection: c => col(p + '/' + c),
      });
      const col = p => ({ doc: id => doc(p + '/' + id), get: async () => ({ docs: [], empty: true, forEach() {} }), where: () => col(p), orderBy: () => col(p), limit: () => col(p), onSnapshot: () => () => {} });
      const fsFn = () => ({ settings: () => {}, collection: c => col(c), doc: p => doc(p), enablePersistence: async () => {} });
      fsFn.FieldValue = { arrayUnion: (...a) => ({ __au: a }), arrayRemove: (...a) => ({ __ar: a }), serverTimestamp: () => 0, delete: () => null };
      const user = { uid, email: 'x@example.com', displayName: 'H', getIdToken: async () => 't' };
      const authFn = () => ({ onAuthStateChanged: cb => { setTimeout(() => cb(user), 50); return () => {}; }, currentUser: user, setPersistence: async () => {}, getRedirectResult: async () => ({}), signOut: async () => {} });
      authFn.GoogleAuthProvider = function () { this.addScope = () => {}; this.setCustomParameters = () => {}; };
      authFn.Auth = { Persistence: { LOCAL: 'local' } };
      const sref = p => ({ child: c => sref(p + '/' + c), getDownloadURL: async () => { const e = new Error('nf'); e.code = 'storage/object-not-found'; throw e; }, getMetadata: async () => ({ size: 1, customMetadata: {} }), put: async () => ({}) });
      window.firebase = { initializeApp: () => {}, auth: authFn, firestore: fsFn, storage: () => ({ ref: p => sref(p || '') }), apps: [] };
      localStorage.setItem('wk_lang', 'ja'); localStorage.setItem('wk_ob_done', '1');
    }, [opt.uid || 'u1', !!opt.failRead, opt.local || null]);
    const pg = await ctx.newPage(); pg.on('dialog', d => d.accept().catch(() => {}));
    await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await wait(3500);
    return { ctx, pg };
  }
  const put = (pg, d) => pg.evaluate(d => { const S = window.wkDrills.raw(); S.items[d.id] = d; }, d);   // （使わない）
  Object.assign(CLOUD, JSON.parse(JSON.stringify(OTHER)));
  // 既にクラウドにある1本（ほかの端末で作った）
  CLOUD[DRILL_DOC] = { items: { drOld: { id: 'drOld', vid: 'v9', title: 'クラウドの1本', a: 10, b: 20, at: 1700000000000, created: 1700000000000, log: [], n: 3 } }, menus: {} };
  const A = await mkCtx();
  const B = await mkCtx();
  const list = pg => pg.evaluate(() => window.wkDrills.list().map(d => d.title).sort());
  ck('⑧ 開くとクラウドのドリルが出る（両方の端末）', JSON.stringify(await list(A.pg)) === '["クラウドの1本"]' && JSON.stringify(await list(B.pg)) === '["クラウドの1本"]', [await list(A.pg), await list(B.pg)]);
  globalThis.__LOG = [];
  // A でドリルを作る（画面の保存と同じ道: wkDrillSave は動画パネルが要るので、同じ put を通す wkDrills.importMerge ではなく、カードを開いて保存する）
  await A.pg.evaluate(() => { window.videos.length = 0; window.videos.push({ id: 'AAAAAAAAAAA', ytId: 'AAAAAAAAAAA', pt: 'youtube', title: '教則A', duration: 1800, bookmarks: [{ time: 60, label: 'フック' }, { time: 120, label: '次' }] }); });
  await A.pg.addScriptTag({ content: '(' + FAKE_YT.toString() + ')()' });
  await A.pg.evaluate(() => window.openVPanel('AAAAAAAAAAA')); await A.pg.waitForFunction(() => window._vpDrillKit.now() != null, null, { timeout: 8000 });
  await A.pg.evaluate(() => window.wkDrillFromBm('AAAAAAAAAAA', 0)); await wait(200);
  await A.pg.evaluate(() => window.wkDrillSave()); await wait(800);
  const writes = (globalThis.__LOG || []).filter(x => x.p === DRILL_DOC);
  const newId = Object.keys(CLOUD[DRILL_DOC].items).find(k => k !== 'drOld');
  ck('⑧ 書くのは作った1本だけ（update で items.{id} の1つ）', writes.length === 1 && writes[0].kind === 'update' && Object.keys(writes[0].d).filter(k => k.startsWith('items.')).join() === 'items.' + newId, writes);
  ck('⑧ クラウドの前からある1本はそのまま', JSON.stringify(CLOUD[DRILL_DOC].items.drOld) === JSON.stringify({ id: 'drOld', vid: 'v9', title: 'クラウドの1本', a: 10, b: 20, at: 1700000000000, created: 1700000000000, log: [], n: 3 }));
  ck('⑧ ほかの文書（設定）には触らない', JSON.stringify(CLOUD['users/u1/data/settings']) === JSON.stringify(OTHER['users/u1/data/settings']) || !(globalThis.__LOG || []).some(x => x.p === 'users/u1/data/settings' && /drill/i.test(JSON.stringify(x.d))));
  let t0 = Date.now(), got = false;
  while (Date.now() - t0 < 5000) { if ((await list(B.pg)).includes('フック')) { got = true; break; } await wait(250); }
  ck('⑧ 開いたままのほかの端末に届く（再読み込みなし）', got, await list(B.pg));
  // B で消す → A に届き、A がその後に何か保存しても復活しない
  await B.pg.evaluate(id => window.wkDrillDelete(id), newId); await wait(600);
  ck('⑧ 消すのは欄を消さず、消した印を書く', CLOUD[DRILL_DOC].items[newId]?.del === true);
  t0 = Date.now(); got = false;
  while (Date.now() - t0 < 5000) { if (!(await list(A.pg)).includes('フック')) { got = true; break; } await wait(250); }
  ck('⑧ 消したことがほかの端末に届く', got, await list(A.pg));
  await A.pg.evaluate(() => window.wkDrillRename && 0);
  await A.pg.reload({ waitUntil: 'domcontentloaded' }); await wait(3500);
  ck('⑧ 開き直しても復活しない', !(await list(A.pg)).includes('フック') && CLOUD[DRILL_DOC].items[newId]?.del === true, await list(A.pg));
  // クラウドを読めない端末は書かない
  const before = JSON.stringify(CLOUD[DRILL_DOC]);
  const C = await mkCtx({ failRead: true, local: JSON.stringify({ uid: 'u1', items: { drLocal: { id: 'drLocal', vid: 'v1', title: '手元だけ', a: 1, b: 5, at: Date.now() } }, menus: {} }) });
  await wait(800);
  ck('⑧ クラウドを読めなかった端末は、クラウドへ書かない', JSON.stringify(CLOUD[DRILL_DOC]) === before);
  await C.ctx.close();
  // この端末にだけあった分（ログアウト中に作った）は、ログイン後に送る
  const D = await mkCtx({ local: JSON.stringify({ uid: null, items: { drOff: { id: 'drOff', vid: 'v1', title: 'ログアウト中に作った', a: 1, b: 5, at: Date.now() } }, menus: {} }) });
  await wait(800);
  ck('⑧ ログアウト中に作った分は、ログイン後にクラウドへ足す（ほかは消さない）', CLOUD[DRILL_DOC].items.drOff?.title === 'ログアウト中に作った' && CLOUD[DRILL_DOC].items.drOld && CLOUD[DRILL_DOC].items[newId]?.del === true);
  await D.ctx.close();
  // ほかのアカウントの控えは送らない
  const E = await mkCtx({ local: JSON.stringify({ uid: 'u2', items: { drU2: { id: 'drU2', vid: 'v1', title: 'ほかのアカウント', a: 1, b: 5, at: Date.now() } }, menus: {} }) });
  await wait(800);
  ck('⑧ ほかのアカウントの控えは、このアカウントのクラウドへ送らない・画面にも出さない', !CLOUD[DRILL_DOC].items.drU2 && !(await list(E.pg)).includes('ほかのアカウント'), await list(E.pg));
  // バックアップ
  const bk = await E.pg.evaluate(async () => (await window._wazaCollectLightData?.())?.drills || null).catch(() => null);
  const hasBk = bk ? !!bk.items?.drOld : await E.pg.evaluate(() => !!window.wkDrills.raw().items.drOld);
  ck('⑧ バックアップに入る（data/drills 相当）', hasBk);
  await E.pg.evaluate(() => window.wkDrills.importMerge({ items: { drBk: { id: 'drBk', vid: 'v1', title: '復元した1本', a: 1, b: 9, at: Date.now() } }, menus: {} })); await wait(500);
  ck('⑧ 復元は足し合わせ（今あるドリルは消さない）・クラウドへも足す', (await list(E.pg)).includes('復元した1本') && (await list(E.pg)).includes('クラウドの1本') && CLOUD[DRILL_DOC].items.drBk?.title === '復元した1本');
  await A.ctx.close(); await B.ctx.close(); await E.ctx.close();
}

await b.close(); srv.close();
console.log(fail ? `\n❌ ${fail}件 失敗` : '\n✅ ドリル: すべて通過');
process.exit(fail ? 1 : 0);
