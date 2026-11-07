// ═══ ほかの端末が後から保存していても、この端末の変更が消えないこと（v52.972） ═══
// 使い方: node tools/video-merge-check.mjs   終了コード: 0 = 期待どおり / 1 = ずれあり
//
// オーナー「自動チャプター作成しても保存されない」「他の端末のリスト内容が最新として更新されたらなくなった」
// 「今開いている端末が一番最新だろう」。
// 以前は、ほかの端末が後から1回でも videos.json を保存していると、この端末の保存を全部止めていた
// （「別の端末で更新されています」のトースト1回だけ）。変更は画面の中だけに残り、再読み込みで消えた。
// いまは、クラウドの最新を読み直し、前に読んだ版との差で合わせて保存する。本物の js/firebase.js を偽のクラウドにつなぐ:
//   ① この端末で足したチャプター（a.bookmarks）が保存される・ほかの端末の変更（a の名前・b のタグ）も残る
//   ② ほかの端末で足した動画は残る・この端末で足した動画も残る
//   ③ ほかの端末で消した動画は、この端末で変えていなければ消える（戻さない）・変えていれば残す（消える側に倒さない）
//   ④ この端末で消した動画は戻さない
//   ⑤ 同じ項目を両方が変えたら、この端末（いま開いている方）が勝つ
//   ⑥ 開いている動画パネルが持つ動画の参照を切らない（同じ id は同じオブジェクトのまま中身だけ変わる）
//   ⑦ 合わせた後にもう一度保存しても、ほかの端末の変更を戻さない（基準が新しくなる）
//   ⑧ 最新を読めなければ書かない（ほかの端末の変更を潰さない）・変更は画面に残る
//   ⑨ 読み込み時の変換で変わった項目を「この端末で変えた」と取り違えない（ほかの端末のタグの変更を古い値で潰さない）
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8214;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

// 偽のクラウド: window.__server = { videos, at }。ほかの端末の保存は __otherSave(fn) で中身を変えて版を進める
const BARE = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>vm</title></head><body>
<div id="toast"></div>
<script>
  window.__server = { videos: [
    { id: 'a', title: 'A', addedAt: '2026-01-01', bookmarks: [] },
    { id: 'b', title: 'B', addedAt: '2026-01-01', tags: ['x'] },
    { id: 'c', title: 'C', addedAt: '2026-01-01' },
    { id: 'g', title: 'G', addedAt: '2026-01-01' },
    { id: 'k', title: 'K', addedAt: '2026-01-01', tb: ['トップ'] },
  ], at: '2026-11-01T00:00:00.000Z' };
  window.__puts = 0; window.__fetchFail = false;
  window.__otherSave = fn => { fn(window.__server.videos); window.__server.at = new Date(Date.parse(window.__server.at) + 60000).toISOString(); };
  const err = c => { const e = new Error(c); e.code = c; return e; };
  const storageRef = () => ({
    getDownloadURL: async () => 'blob-url',
    getMetadata: async () => ({ customMetadata: { updatedAt: window.__server.at } }),
    put: async (blob, meta) => { window.__puts++; const d = JSON.parse(await blob.text()); window.__server = { videos: d.videos, at: meta.customMetadata.updatedAt }; },
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (u !== 'blob-url') return realFetch(u, o);
    if (window.__fetchFail) throw new Error('offline');
    return new Response(JSON.stringify({ videos: window.__server.videos, updatedAt: window.__server.at }), { status: 200 });
  };
  const docRef = () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {}, update: async () => {}, delete: async () => {}, onSnapshot: () => (() => {}), collection: colRef });
  function colRef() { return { doc: docRef, get: async () => ({ docs: [], empty: true, forEach(){} }), onSnapshot: () => (() => {}), where(){return this}, orderBy(){return this}, limit(){return this} }; }
  const fsFn = () => ({ settings: () => {}, collection: colRef, doc: docRef });
  fsFn.FieldValue = { arrayUnion: (...a) => a, arrayRemove: (...a) => a };
  const authFn = () => ({ onAuthStateChanged: cb => { window.__fireAuth = cb; }, currentUser: null });
  authFn.GoogleAuthProvider = function () { this.addScope = () => {}; };
  window.firebase = { initializeApp: () => {}, auth: authFn, firestore: fsFn, storage: () => ({ ref: storageRef }), apps: [] };
  window.videos = [];
  window.AF = () => {};
  window.showConf = (t, m, fn) => fn();
  // 読み込み時の変換の代わり（本物の migrateAllVideos と同じく、読んだ値を書き換える）: タグ1の旧名を新名へ
  window.migrateAllVideos = arr => arr.map(v => { if (Array.isArray(v.tb)) v.tb = v.tb.map(x => x === 'トップ' ? 'トップポジション' : x); return v; });
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
const ctx = await browser.newContext();
await ctx.route(new RegExp(`^http://localhost:${PORT}/__bare`), r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BARE }));
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 500) : '')); if (!ok) fail++; };
const errs = [];
const pg = await ctx.newPage();
pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pg.goto(`http://localhost:${PORT}/__bare`, { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
await pg.evaluate(() => new Promise(res => { Promise.resolve(window.__fireAuth({ uid: 'u1', email: 'x@example.com' })).then(res); }));
await pg.waitForTimeout(300);

const r1 = await pg.evaluate(async () => {
  const loadedIds = window.videos.map(v => v.id).join(',');
  const aRef = window.videos.find(v => v.id === 'a');
  // ほかの端末が保存: a の名前・b のタグを変え、c と g を消し、d を足し、k のタグ1を変える
  window.__otherSave(vs => {
    vs.find(v => v.id === 'a').title = 'A（ほかの端末で改名）';
    vs.find(v => v.id === 'b').tags = ['y'];
    vs.find(v => v.id === 'k').tb = ['ボトム'];
    for (const id of ['c', 'g']) vs.splice(vs.findIndex(v => v.id === id), 1);
    vs.push({ id: 'd', title: 'D', addedAt: '2026-11-02' });
  });
  // この端末: a に自動チャプター、g を編集（ほかの端末では消された）、e を足す
  aRef.bookmarks = [{ time: 0, label: 'イントロ', auto: 'chapter' }, { time: 90, label: 'グリップ', auto: 'chapter' }];
  window.videos.find(v => v.id === 'g').memo = 'この端末で書いたメモ';
  window.videos.push({ id: 'e', title: 'E', addedAt: '2026-11-03' });
  const ok = await window.T.saveUserData();
  const S = id => window.__server.videos.find(v => v.id === id);
  return { loadedIds, ok, puts: window.__puts, ids: window.__server.videos.map(v => v.id).sort().join(','),
    a: S('a'), b: S('b'), g: S('g'), k: S('k'), sameRef: window.videos.find(v => v.id === 'a') === aRef,
    memA: { title: aRef.title, bm: aRef.bookmarks.length }, memIds: window.videos.map(v => v.id).sort().join(',') };
});
ck('読み込み（a,b,c,g,k）', r1.loadedIds === 'a,b,c,g,k', r1.loadedIds);
ck('① ほかの端末が後から保存していても、この端末の保存を止めない', r1.ok === true && r1.puts === 1, r1);
ck('① この端末で足したチャプターが保存される', r1.a?.bookmarks?.length === 2 && r1.a.bookmarks[1].label === 'グリップ', r1.a);
ck('① ほかの端末の変更（a の名前・b のタグ）も残る', r1.a?.title === 'A（ほかの端末で改名）' && JSON.stringify(r1.b?.tags) === '["y"]', { a: r1.a, b: r1.b });
ck('② ほかの端末で足した d・この端末で足した e が残る', /\bd\b/.test(r1.ids) && /\be\b/.test(r1.ids), r1.ids);
ck('③ ほかの端末で消した c（この端末で変えていない）は消える・g（この端末で書いた）は残す', !/\bc\b/.test(r1.ids) && r1.g?.memo === 'この端末で書いたメモ', r1.ids);
ck('⑨ 読み込み時の変換で変わった項目を「この端末で変えた」と取り違えない（k のタグ1はほかの端末の ボトム）', JSON.stringify(r1.k?.tb) === '["ボトム"]', r1.k);
ck('⑥ 画面の動画も合わせた中身になり、開いているパネルの参照（a）を切らない', r1.sameRef && r1.memA.title === 'A（ほかの端末で改名）' && r1.memA.bm === 2 && r1.memIds === r1.ids, r1);

const r2 = await pg.evaluate(async () => {
  // ⑤ 同じ項目を両方が変える → この端末が勝つ。④ この端末で消した b は戻さない
  window.__otherSave(vs => { vs.find(v => v.id === 'a').bookmarks = [{ time: 5, label: 'ほかの端末のブックマーク' }]; vs.find(v => v.id === 'b').title = 'B2'; });
  const a = window.videos.find(v => v.id === 'a');
  a.bookmarks = a.bookmarks.concat([{ time: 300, label: 'この端末で追加' }]);
  window.videos = window.videos.filter(v => v.id !== 'b'); window._wkDeleteIntent?.(1);
  const ok = await window.T.saveUserData();
  // ⑦ もう一度保存しても、ほかの端末の変更を戻さない
  window.__otherSave(vs => { vs.find(v => v.id === 'd').title = 'D2'; });
  const ok2 = await window.T.saveUserData();
  const S = id => window.__server.videos.find(v => v.id === id);
  return { ok, ok2, a: S('a'), b: S('b'), d: S('d'), puts: window.__puts };
});
ck('⑤ 同じ項目（a のブックマーク）を両方が変えたら、この端末の値', r2.ok && r2.a?.bookmarks?.length === 3 && r2.a.bookmarks[2].label === 'この端末で追加', r2.a);
ck('④ この端末で消した b は戻さない（ほかの端末が名前を変えていても）', !r2.b, r2.b);
ck('⑦ 合わせた後の保存でも、ほかの端末の変更（d の名前）を戻さない', r2.ok2 && r2.d?.title === 'D2', r2.d);

const r3 = await pg.evaluate(async () => {
  window.__otherSave(vs => { vs.find(v => v.id === 'd').title = 'D3'; });
  window.__fetchFail = true;
  const before = window.__puts;
  window.videos.find(v => v.id === 'a').title = 'この端末で改名';
  const ok = await window.T.saveUserData();
  window.__fetchFail = false;
  return { ok, wrote: window.__puts - before, d: window.__server.videos.find(v => v.id === 'd').title, mem: window.videos.find(v => v.id === 'a').title };
});
ck('⑧ 最新を読めなければ書かない（ほかの端末の D3 を潰さない）・変更は画面に残る', r3.ok === false && r3.wrote === 0 && r3.d === 'D3' && r3.mem === 'この端末で改名', r3);
const r4 = await pg.evaluate(async () => { const ok = await window.T.saveUserData(); const S = id => window.__server.videos.find(v => v.id === id); return { ok, a: S('a').title, d: S('d').title }; });
ck('⑧ 読めるようになったら、その変更も保存される（ほかの端末の変更も残る）', r4.ok && r4.a === 'この端末で改名' && r4.d === 'D3', r4);

const real = errs.filter(e => !/net::ERR|Failed to load/i.test(e));
ck('JSエラーなし', real.length === 0, real);
await browser.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件ずれ` : '\n✓ ほかの端末の保存と、この端末の変更を合わせて保存する');
process.exit(fail ? 1 : 0);
