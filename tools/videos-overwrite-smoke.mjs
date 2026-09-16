// 「動画が古いデータで上書きされて消える」経路が塞がったかを、事故を再現して確かめる。
//
// 何が起きていたか:
//   起動時、Storage の videos.json が通信エラーで読めないと、コードは移行前の
//   Firestore data/videos（移行後は誰も書いていない古いスナップショット）へ落ちて
//   それを読み、さらに needsSave で Storage へ即書き戻していた。
//   つまり一度の通信失敗で、移行後に追加した動画が丸ごと（アーカイブ済みも含めて）消える。
//
// ここでは js/firebase.js だけを最小ページで動かし、Firebase SDK をスタブに差し替えて
// 4つの場面を実際に走らせ、put（Storageへの書き込み）が起きるかどうかを見る。
//
// 使い方: node tools/videos-overwrite-smoke.mjs
// 終了コード: 0 = 期待どおり / 1 = ずれあり

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function loadChromium() {
  const { execSync } = await import('child_process');
  const cands = ['playwright'];
  try { cands.push(path.join(execSync('npm root -g', { encoding:'utf8' }).trim(), 'playwright', 'index.mjs')); } catch {}
  for (const c of cands) { try { return (await import(c)).chromium; } catch {} }
  console.error('playwright が見つかりません。`npm i -g playwright` を実行してください。');
  process.exit(2);
}
const chromium = await loadChromium();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8141;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json' };

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

// scenario は URL のハッシュで渡す:
//   storage=fail | notfound | ok   … Storage 読み込みの結果
//   legacy=N                       … 古い Firestore data/videos に入っている本数
const BARE = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>ovw</title></head><body>
<div id="toast"></div>
<script>
  const q = new URLSearchParams(location.hash.slice(1));
  const S = { storage: q.get('storage') || 'ok', legacy: Number(q.get('legacy') || 0), stored: Number(q.get('stored') || 3) };
  window.__calls = { put: 0, putCount: null, meta: 0 };
  // 通信障害では getDownloadURL も getMetadata も一緒に失敗する。meta=fail でそれを再現する。
  window.__metaMode = q.get('meta') || 'ok';

  const mkVideos = (n, pre) => Array.from({ length: n }, (_, i) => ({ id: pre + i, title: pre + i, addedAt: '2026-01-01' }));
  const STORED = mkVideos(S.stored, 's');
  const LEGACY = mkVideos(S.legacy, 'L');
  const STORED_JSON = JSON.stringify({ videos: STORED, updatedAt: '2026-09-01T00:00:00.000Z' });

  const notFound = () => { const e = new Error('not found'); e.code = 'storage/object-not-found'; return e; };
  const netErr   = () => { const e = new Error('network'); e.code = 'storage/retry-limit-exceeded'; return e; };

  const storageRef = () => ({
    getDownloadURL: async () => {
      if (S.storage === 'notfound') throw notFound();
      if (S.storage === 'fail')     throw netErr();
      return 'blob-url';   // fetch は下で差し替える
    },
    getMetadata: async () => {
      window.__calls.meta++;
      if (window.__metaMode === 'fail')     throw netErr();
      // ファイルが無い場面では getMetadata も not-found になる（実挙動に合わせる）
      if (window.__metaMode === 'notfound' || S.storage === 'notfound') throw notFound();
      return { size: STORED_JSON.length, customMetadata: { updatedAt: '2026-09-01T00:00:00.000Z' } };
    },
    put: async (blob) => {
      window.__calls.put++;
      try { window.__calls.putCount = JSON.parse(await blob.text()).videos.length; } catch (e) {}
    },
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => (u === 'blob-url')
    ? new Response(STORED_JSON, { status: 200, headers: { 'Content-Type': 'application/json' } })
    : realFetch(u, o);

  const docRef = (name) => ({
    get: async () => (name === 'videos' && LEGACY.length)
      ? { exists: true, data: () => ({ videos: LEGACY, updatedAt: '2025-12-01T00:00:00.000Z' }) }
      : { exists: false, data: () => ({}) },
    set: async () => {}, update: async () => {}, delete: async () => {},
    onSnapshot: () => (() => {}), collection: colRef,
  });
  function colRef() { return { doc: docRef, get: async () => ({ docs: [], empty: true }), onSnapshot: () => (() => {}) }; }

  const fsFn = () => ({ settings: () => {}, collection: colRef, doc: docRef });
  fsFn.FieldValue = { arrayUnion: (...a) => a, arrayRemove: (...a) => a };
  const authFn = () => ({ onAuthStateChanged: cb => { window.__fireAuth = cb; }, currentUser: null });
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; };
  window.firebase = {
    initializeApp: () => {}, auth: authFn, firestore: fsFn,
    storage: () => ({ ref: storageRef }), apps: [],
  };
  window.videos = [];
  window.AF = () => {};
  window.showConf = (t, m, fn) => fn();
<\/script>
<script type="module">
  import { loadUserData, saveUserData } from '/js/firebase.js';
  window.T = { loadUserData, saveUserData };
  window.__ready = true;
<\/script>
</body></html>`;

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext();
await ctx.route(new RegExp(`^http://localhost:${PORT}/__bare`), r =>
  r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BARE }));

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });
const errs = [];

async function scenario(hash) {
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.goto(`http://localhost:${PORT}/__bare#${hash}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  return page;
}

// 1) 事故の再現: Storage が読めない + 古いFirestoreに5本ある
{
  const page = await scenario('storage=fail&legacy=5&stored=40');
  const r = await page.evaluate(async () => {
    await window.__fireAuth({ uid: 'u1', email: 'x@example.com' });
    return { n: (window.videos || []).length, put: window.__calls.put, putCount: window.__calls.putCount };
  });
  check('Storageが読めない時、古いFirestoreを読み込まない', r.n === 0, JSON.stringify(r));
  check('Storageが読めない時、Storageへ書き戻さない', r.put === 0, JSON.stringify(r));
  await page.close();
}

// 2) 正規の移行は生きている: Storageにファイルが無い + 古いFirestoreに5本
{
  const page = await scenario('storage=notfound&legacy=5');
  const r = await page.evaluate(async () => {
    await window.__fireAuth({ uid: 'u1', email: 'x@example.com' });
    return { n: (window.videos || []).length, put: window.__calls.put, putCount: window.__calls.putCount };
  });
  check('ファイルが無い時は従来どおり移行する', r.n === 5 && r.put === 1 && r.putCount === 5, JSON.stringify(r));
  await page.close();
}

// 3) 通常の読み書き
{
  const page = await scenario('storage=ok&stored=3');
  const r = await page.evaluate(async () => {
    await window.__fireAuth({ uid: 'u1', email: 'x@example.com' });
    const before = (window.videos || []).length;
    window.videos.push({ id: 'new1', title: '追加', addedAt: '2026-09-11' });
    const ok = await window.T.saveUserData();
    return { before, ok, put: window.__calls.put, putCount: window.__calls.putCount };
  });
  check('通常はStorageから読めて保存できる', r.before === 3 && r.ok === true && r.putCount === 4, JSON.stringify(r));
  await page.close();
}

// 4) サーバーの状態を確認できない時は保存しない
{
  const page = await scenario('storage=ok&stored=3');
  const r = await page.evaluate(async () => {
    await window.__fireAuth({ uid: 'u1', email: 'x@example.com' });
    const putBefore = window.__calls.put;
    window.__metaMode = 'fail';
    const ok = await window.T.saveUserData();
    return { ok, putBefore, put: window.__calls.put };
  });
  check('サーバー状態を確認できない時は保存しない', r.ok === false && r.put === r.putBefore, JSON.stringify(r));
  await page.close();
}

// 5) 事故の本体: 通信障害で Storage も metadata も読めない + 古いFirestoreに5本
//    旧コードはここで「古い5本を読み → 40本入りの videos.json へ上書き」していた。
{
  const page = await scenario('storage=fail&meta=fail&legacy=5&stored=40');
  const r = await page.evaluate(async () => {
    await window.__fireAuth({ uid: 'u1', email: 'x@example.com' });
    return { n: (window.videos || []).length, put: window.__calls.put, putCount: window.__calls.putCount };
  });
  check('通信障害時に古いデータで上書きしない（事故の本体）',
    r.n === 0 && r.put === 0, JSON.stringify(r));
  await page.close();
}

await browser.close();
srv.close();

const IGNORE = /net::ERR|Failed to load resource/i;
const unexpected = [...new Set(errs)].filter(e => !IGNORE.test(e));
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  → ' + c.detail}`);
  if (!c.ok) failed++;
}
console.log(unexpected.length ? `\n✗ 想定外のJSエラー ${unexpected.length}件:\n  ` + unexpected.join('\n  ')
                              : '\n✓ 想定外のJSエラーなし');
if (failed || unexpected.length) { console.log(`\n失敗 ${failed}件 / エラー ${unexpected.length}件`); process.exit(1); }
console.log('\n✓ 上書き事故の経路テスト通過');
