#!/usr/bin/env node
// ═══ 「どの条件が消しているか」が、実際の絞り込みと一致することの検査 ═══
// 使い方: node tools/why-hidden-check.mjs
//
// なぜ必要か（2026-09-27）:
// 「0本になる」と言われるたびに、私が手元のダミーで推測して外した。
// 件数の ⓘ（内訳）に「どの条件が何本消しているか」を名前で出すようにした
// （js/filter.js の wkWhyHidden）。その説明が実際の絞り込み（filt）とズレたら、
// いちばん困っているときに嘘をつくことになる。
// filt() と wkWhyHidden() は同じ条件の並び（_libConds）を使う。
// 本物の index.html をブラウザで開いて、本数と名指しが合うことを見る。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8159;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

async function loadChromium() {
  const { execSync } = await import('node:child_process');
  const cands = ['playwright'];
  try { cands.push(path.join(execSync('npm root -g', { encoding:'utf8' }).trim(), 'playwright', 'index.mjs')); } catch {}
  for (const c of cands) { try { return (await import(c)).chromium; } catch {} }
  console.error('playwright が見つかりません。`npm i -g playwright` を実行してください。');
  process.exit(2);
}

// ── 判定用 ──
let fail = 0;
const ck = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail !== undefined ? '\n      → ' + detail : ''));
  if (!ok) fail++;
};

const chromium = await loadChromium();
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

// Firebase SDK はこの環境では取れないので、読み込みが止まらないように最小の形だけ置く
const STUB = `(()=>{const P=v=>Promise.resolve(v);const snap={exists:false,data:()=>({}),docs:[],forEach(){}};
const d=()=>({get:()=>P(snap),set:()=>P(),update:()=>P(),delete:()=>P(),collection:()=>c(),onSnapshot:()=>()=>{}});
const c=()=>({doc:()=>d(),add:()=>P(d()),get:()=>P(snap),where(){return c()},orderBy(){return c()},limit(){return c()},onSnapshot:()=>()=>{}});
const fs=()=>({settings(){},enablePersistence:()=>P(),collection:()=>c(),doc:()=>d(),batch:()=>({set(){},update(){},delete(){},commit:()=>P()}),runTransaction:()=>P()});
fs.FieldValue={serverTimestamp:()=>null,delete:()=>null,arrayUnion:()=>null,arrayRemove:()=>null};fs.Timestamp={now:()=>({toDate:()=>new Date()})};
window.firebase={initializeApp(){},apps:[],auth:Object.assign(()=>({currentUser:null,onAuthStateChanged(cb){try{cb(null)}catch(e){}},signOut:()=>P(),signInWithPopup:()=>P({}),setPersistence:()=>P()}),{GoogleAuthProvider:function(){this.addScope=()=>{};this.setCustomParameters=()=>{}},Auth:{Persistence:{LOCAL:'local'}}}),firestore:fs,storage:()=>({ref:()=>({put:()=>P({}),getDownloadURL:()=>P(''),child:()=>({}),delete:()=>P()})})};})();`;

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
await ctx.addInitScript(STUB);
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

console.log('■ 「どの条件が消しているか」が実際と合うこと');
const r = await page.evaluate(() => {
  window.videos = [
    { id:'q1', title:'02-Quick1. パスガード',   pt:'yt', pl:'TF Quick', tb:['トップ'] },
    { id:'q2', title:'30-Quick5. ハーフガード', pt:'yt', pl:'TF Quick', tb:['ボトム'] },
    { id:'n1', title:'デラヒーバスイープ',      pt:'yt', pl:'別',       tb:['ボトム'], tg:{ mark:['お気に入り'] } },
    { id:'n2', title:'クロスチョーク',          pt:'yt', pl:'別',       tb:['トップ'] },
  ];
  const reset = () => {
    window.wkSetSearchWord?.('');
    window.unwOnly = window.watchedOnly = false;
    window.bmOnly = window.memoOnly = window.imgOnly = false;
    Object.values(window.filters).forEach(s => s.clear && s.clear());
  };
  const run = (label, setup, want) => {
    reset(); setup();
    const w = window.wkWhyHidden();
    const n = window.filt(window.videos).length;
    reset();
    return { label, want, top: w.rows[0]?.name || '(なし)', shown: w.shown, filt: n,
             sum: w.shown + w.rows.reduce((a, x) => a + x.n, 0), scope: w.scope };
  };
  return [
    run('ワード検索 -quick',   () => window.wkSetSearchWord('-quick'),            'ワード検索'),
    // マーク（お気に入り）は v52.876 から普通のタグ。タグとして名指しされる
    run('マーク=お気に入り',    () => { window.filters.mark = new Set(['お気に入り']); }, 'タグ'),
    run('タグ（タグ1=トップ）', () => { window.filters.tbNew = new Set(['トップ']); }, 'タグ'),
    run('プレイリスト',         () => { window.filters.playlist = new Set(['別']); },  'プレイリスト'),
    run('絞り込みなし',         () => {},                                          '(なし)'),
  ];
});
for (const x of r) {
  ck(`${x.label} → 出る ${x.shown}本（filt ${x.filt}本）/ 犯人「${x.top}」`,
     x.shown === x.filt && x.top === x.want && x.sum === x.scope,
     x.shown !== x.filt ? '内訳の本数が実際の絞り込みと違う'
     : x.top !== x.want ? `名指しが違う（想定「${x.want}」）`
     : '出る本数と消えた本数の合計が範囲と合わない');
}

await browser.close();
srv.close();
console.log(fail ? `\n✗ ${fail} 件` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
