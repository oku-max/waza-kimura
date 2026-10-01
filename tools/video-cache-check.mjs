// ═══ この端末の動画の控え（v52.934）を、データを壊さないかの面から確かめる ═══
// 使い方: node tools/video-cache-check.mjs   終了コード: 0 = 期待どおり / 1 = ずれあり
//
// 起動のたびに 10MB 超の videos.json を落とし切るまで「0本」だった（オーナーの実測で約5秒）。
// 控え（IndexedDB）を先に出すようにした。見るのは「速くなったか」ではなく「データが安全な結果になるか」:
//   ① 初回（控えなし）は今までどおり読み、読んだものをそのまま控える
//   ② 2回目・同じ版: クラウドが届く前に控えが出る／その間は保存しない／届いても書かない
//   ③ 2回目・ほかの端末で更新された版（1本消えている）: 届いたらクラウドで丸ごと入れ替える。消えた動画を戻さない・書かない
//   ④ 控えを出している間に変更 → 同じ版が届いたら、その変更を保存する
//   ⑤ 控えを出している間に変更 → 違う版が届いたら、その変更は捨ててクラウドを出す（古い版で上書きしない）
//   ⑥ クラウドが読めない: 控えは出すが、何度保存しようとしても書かない
//   ⑦ クラウドにファイルが無い: 控えを出したままにしない（今までどおり空）
//   ⑧ ほかのアカウントの控えは出さない
//   ⑨ 保存したものと同じ中身が控えになる（次に同じ版として扱える）
// js/firebase.js だけを最小ページで動かし、Firebase SDK はスタブ（videos-overwrite-smoke と同じ作り）。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 120秒で打ち切り'); process.exit(3); }, 120000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8213;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

// hash: storage=ok|fail|notfound  ids=a,b,c  ver=…  delay=ms
const BARE = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>vc</title></head><body>
<div id="toast"></div>
<script>
  const q = new URLSearchParams(location.hash.slice(1));
  const S = { storage: q.get('storage') || 'ok', ids: (q.get('ids') || 'a,b,c').split(','), ver: q.get('ver') || 'V1', delay: Number(q.get('delay') || 0) };
  window.__calls = { put: 0, putIds: null, putText: null };
  window.__toasts = [];
  const STORED_JSON = JSON.stringify({ videos: S.ids.map(id => ({ id, title: 'T' + id, addedAt: '2026-01-01' })), updatedAt: S.ver });
  window.__metaAt = S.ver;
  const err = c => { const e = new Error(c); e.code = c; return e; };
  const storageRef = () => ({
    getDownloadURL: async () => {
      if (S.storage === 'notfound') throw err('storage/object-not-found');
      if (S.storage === 'fail') { await new Promise(r => setTimeout(r, S.delay)); throw err('storage/retry-limit-exceeded'); }
      return 'blob-url';
    },
    getMetadata: async () => {
      if (S.storage === 'notfound') throw err('storage/object-not-found');
      if (S.storage === 'fail') throw err('storage/retry-limit-exceeded');
      return { customMetadata: { updatedAt: window.__metaAt } };
    },
    put: async (blob, meta) => { window.__calls.put++; const t = await blob.text(); window.__calls.putText = t; window.__calls.putIds = JSON.parse(t).videos.map(v => v.id).join(','); window.__metaAt = meta.customMetadata.updatedAt; },
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (u !== 'blob-url') return realFetch(u, o);
    window.__cloudStarted = true;
    await new Promise(r => setTimeout(r, S.delay));
    window.__cloudArrived = true;
    return new Response(STORED_JSON, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const docRef = () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {}, update: async () => {}, delete: async () => {}, onSnapshot: () => (() => {}), collection: colRef });
  function colRef() { return { doc: docRef, get: async () => ({ docs: [], empty: true, forEach(){} }), onSnapshot: () => (() => {}), where(){return this}, orderBy(){return this}, limit(){return this} }; }
  const fsFn = () => ({ settings: () => {}, collection: colRef, doc: docRef });
  fsFn.FieldValue = { arrayUnion: (...a) => a, arrayRemove: (...a) => a };
  const authFn = () => ({ onAuthStateChanged: cb => { window.__fireAuth = cb; }, currentUser: null });
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; };
  window.firebase = { initializeApp: () => {}, auth: authFn, firestore: fsFn, storage: () => ({ ref: storageRef }), apps: [] };
  window.videos = [];
  window.__afCalls = [];
  window.AF = () => { window.__afCalls.push({ n: (window.videos || []).length, cloud: !!window.__cloudArrived }); };
  window.showConf = (t, m, fn) => fn();
<\/script>
<script type="module">
  import { saveUserData } from '/js/firebase.js';
  import * as ui from '/js/ui.js';
  window.T = { saveUserData };
  window.__ready = true;
<\/script>
</body></html>`;

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext();   // 同じ文脈＝同じ IndexedDB を、ページをまたいで使う
await ctx.route(new RegExp(`^http://localhost:${PORT}/__bare`), r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BARE }));
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const errs = [];
const open = async (hash) => {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await pg.goto(`http://localhost:${PORT}/__bare#${hash}`, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  return pg;
};
const login = (pg, uid = 'u1') => pg.evaluate(uid => { window.__authDone = false; Promise.resolve(window.__fireAuth({ uid, email: 'x@example.com' })).then(() => { window.__authDone = true; }); }, uid);
const waitAuth = pg => pg.waitForFunction(() => window.__authDone === true, null, { timeout: 15000 });
const st = pg => pg.evaluate(() => ({ ids: (window.videos || []).map(v => v.id).join(','), put: window.__calls.put, putIds: window.__calls.putIds, cloud: !!window.__cloudArrived, vc: window._wkVideoCacheState?.() }));
const readCache = pg => pg.evaluate(uid => new Promise(res => { const rq = indexedDB.open('wk-video-cache', 1); rq.onsuccess = () => { try { const g = rq.result.transaction('c', 'readonly').objectStore('c').get(uid); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); } }; rq.onerror = () => res(null); }), 'u1');

console.log('── ① 初回（控えなし）──');
{ const pg = await open('ids=a,b,c&ver=V1&delay=50'); await login(pg); await waitAuth(pg); await pg.waitForTimeout(800);
  const s = await st(pg); const c = await readCache(pg);
  ck('① 今までどおり読む（a,b,c）・書かない', s.ids === 'a,b,c' && s.put === 0, s);
  ck('① 読んだものをそのまま控える（版 V1）', c && c.updatedAt === 'V1' && JSON.parse(c.text).videos.length === 3, c && { at: c.updatedAt });
  await pg.close(); }

console.log('── ② 2回目・同じ版 ──');
{ const pg = await open('ids=a,b,c&ver=V1&delay=1500'); await login(pg);
  await pg.waitForTimeout(500); const early = await st(pg);
  ck('② クラウドが届く前に控えが出る（a,b,c）', !early.cloud && early.ids === 'a,b,c' && early.vc.shown, early);
  const saved = await pg.evaluate(() => window.T.saveUserData());
  ck('② その間は保存しない', saved === false && (await st(pg)).put === 0);
  await waitAuth(pg); await pg.waitForTimeout(200); const s = await st(pg);
  ck('②→④ 届いたら同じ中身のまま。待たせた保存は同じ中身で1回だけ書く（版の衝突なし）', s.ids === 'a,b,c' && s.put === 1 && s.putIds === 'a,b,c', s);
  await pg.waitForTimeout(800); await pg.close(); }

// ②で保存したので控えの版は新しくなっている。クラウド側（スタブ）はページごとに hash の版になるので、
// ここからは控えの版をそのまま使う
const curVer = async () => { const pg = await ctx.newPage(); await pg.goto(`http://localhost:${PORT}/__bare#ids=a`, { waitUntil: 'domcontentloaded' }); const c = await readCache(pg); await pg.close(); return c?.updatedAt; };
let V = await curVer();
ck('⑨ 保存したものと同じ中身・同じ版が控えになる', !!V && V !== 'V1', V);

console.log('── ② 同じ版・何もしない ──');
{ const pg = await open(`ids=a,b,c&ver=${encodeURIComponent(V)}&delay=1200`); await login(pg);
  await pg.waitForTimeout(400); const early = await st(pg);
  await waitAuth(pg); await pg.waitForTimeout(200); const s = await st(pg);
  ck('② 控えが先に出て、届いても書かない', early.ids === 'a,b,c' && !early.cloud && s.ids === 'a,b,c' && s.put === 0, { early, s });
  await pg.close(); }

console.log('── ③ ほかの端末で更新（b が消えた新しい版）──');
{ const pg = await open('ids=a,c&ver=V9&delay=1200'); await login(pg);
  await pg.waitForTimeout(400); const early = await st(pg);
  await waitAuth(pg); await pg.waitForTimeout(200); const s = await st(pg);
  ck('③ 先に控え（a,b,c）を出す', early.ids === 'a,b,c' && !early.cloud, early);
  ck('③ 届いたらクラウドで丸ごと入れ替える（a,c。消えた b を戻さない）・書かない', s.ids === 'a,c' && s.put === 0, s);
  await pg.waitForTimeout(800); const c = await readCache(pg);
  ck('③ 控えも新しい版になる', c?.updatedAt === 'V9' && JSON.parse(c.text).videos.map(v => v.id).join(',') === 'a,c', c?.updatedAt);
  await pg.close(); }

console.log('── ④ 控えの間に変更 → 同じ版 ──');
{ const pg = await open('ids=a,c&ver=V9&delay=1200'); await login(pg); await pg.waitForTimeout(400);
  await pg.evaluate(() => { window.videos.find(v => v.id === 'a').title = 'EDITED'; return window.T.saveUserData(); });
  await waitAuth(pg); await pg.waitForTimeout(200);
  const r = await pg.evaluate(() => ({ title: window.videos.find(v => v.id === 'a')?.title, put: window.__calls.put, text: window.__calls.putText }));
  ck('④ 届いたら、待たせていた変更を保存する', r.title === 'EDITED' && r.put === 1 && /EDITED/.test(r.text || ''), r);
  await pg.waitForTimeout(800); await pg.close(); }
V = await curVer();

console.log('── ⑤ 控えの間に変更 → 違う版 ──');
{ const pg = await open('ids=a,c,d&ver=V99&delay=1200'); await login(pg); await pg.waitForTimeout(400);
  const early = await st(pg);
  await pg.evaluate(() => { window.videos.find(v => v.id === 'c').title = 'STALE-EDIT'; return window.T.saveUserData(); });
  await waitAuth(pg); await pg.waitForTimeout(200);
  const r = await pg.evaluate(() => ({ ids: window.videos.map(v => v.id).join(','), title: window.videos.find(v => v.id === 'c')?.title, put: window.__calls.put }));
  ck('⑤ 古い版の上の変更は捨て、クラウド（a,c,d）を出す・書かない', early.ids === 'a,c' && r.ids === 'a,c,d' && r.title === 'Tc' && r.put === 0, { early, r });
  await pg.waitForTimeout(800); await pg.close(); }

console.log('── ⑥ クラウドが読めない ──');
{ const pg = await open('storage=fail&delay=800'); await login(pg); await pg.waitForTimeout(400);
  const early = await st(pg);
  await waitAuth(pg); await pg.waitForTimeout(200);
  const a1 = await pg.evaluate(() => window.T.saveUserData()); const a2 = await pg.evaluate(() => window.T.saveUserData());
  const s = await st(pg);
  ck('⑥ 控えは出す（a,c,d）が、何度保存しようとしても書かない', early.ids === 'a,c,d' && s.ids === 'a,c,d' && a1 === false && a2 === false && s.put === 0, { early, s });
  await pg.close(); }

console.log('── ⑦ クラウドにファイルが無い ──');
{ const pg = await open('storage=notfound'); await login(pg); await waitAuth(pg); await pg.waitForTimeout(200);
  const s = await st(pg);
  ck('⑦ 控えを出したままにしない（空）・書かない', s.ids === '' && s.put === 0, s);
  await pg.close(); }

console.log('── ⑧ ほかのアカウント ──');
{ const pg = await open('ids=x&ver=W1&delay=800'); await login(pg, 'u2'); await pg.waitForTimeout(300);
  const early = await st(pg); await waitAuth(pg); const s = await st(pg);
  ck('⑧ u1 の控えを u2 に出さない', early.ids === '' && s.ids === 'x', { early, s });
  await pg.close(); }

const real = errs.filter(e => !/net::ERR|Failed to load/i.test(e));
ck('JSエラーなし', real.length === 0, real);
await browser.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ 動画の控え: データは安全な結果になる');
process.exit(fail ? 1 : 0);
