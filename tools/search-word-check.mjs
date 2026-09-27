#!/usr/bin/env node
// ═══ ワード検索の語を、カードとテーブルが同じに読むことの検査 ═══
// 使い方: node tools/search-word-check.mjs
//
// なぜ必要か（2026-09-27）:
// 画面の🔍欄は1つなのに、ビューごとに別の入力欄から語を読んでいた。
//   カード   js/filter.js filt      → si / si-lib-pc
//   テーブル js/organize.js orgFilt → si-org / si-org-pc
//   リストの表 js/custom-view.js     → _cvSrchQ（モジュール内の変数）
// 語を入れた経路によってどれか1つにしか入らず、同じリスト・同じ語で
// 「テーブルには出るのにカードは0本」になっていた。
// 実測（直す前）: si-lib-pc にだけ「-quick」→ カード 2本 / テーブル 4本。
// 本物の index.html をブラウザで開いて、4通りの入れ方で両方が一致することを見る。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8151;
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

// ── ① 読む場所が1か所であること（静的に見る。ブラウザが無くても効く）──
let fail = 0;
const ck = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail !== undefined ? '\n      → ' + detail : ''));
  if (!ok) fail++;
};
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('■ ① 検索語を読む場所が js/search-word.js の1か所であること');
{
  const bad = [];
  for (const f of ['js/filter.js', 'js/organize.js', 'js/custom-view.js']) {
    read(f).split('\n').forEach((ln, i) => {
      if (/getElementById\(\s*['"](?:si|si-lib-pc|si-org|si-org-pc)['"]\s*\)(?:\s*\??\.)?\s*(?:\.)?value/.test(ln)
          && !/\.value\s*=/.test(ln)) bad.push(`${f}:${i + 1} ${ln.trim().slice(0, 90)}`);
    });
  }
  ck('絞り込みが入力欄から直接 value を読んでいない', bad.length === 0, bad.join('\n      → '));
  // 書く側も1か所。片方の欄にだけ入れる／片方だけ空にすると、また食い違う。
  const wbad = [];
  for (const f of ['js/filter.js', 'js/organize.js', 'js/custom-view.js', 'js/filter-overlay.js', 'js/unified-filter.js', 'index.html']) {
    read(f).split('\n').forEach((ln, i) => {
      if (/getElementById\(\s*['"](?:si|si-lib-pc|si-org|si-org-pc)['"]\s*\)/.test(ln) && /\.value\s*=[^=]/.test(ln))
        wbad.push(`${f}:${i + 1} ${ln.trim().slice(0, 90)}`);
      if (/\b(?:siOrg|siPc|siLib|siMob|siLibMob|siOrgPc|siLibPc|libSi|orgSi|_o1|_o2)\.value\s*=[^=]/.test(ln))
        wbad.push(`${f}:${i + 1} ${ln.trim().slice(0, 90)}`);
    });
  }
  ck('検索欄に直接 value を書き込んでいない（書くのも1か所）', wbad.length === 0, wbad.join('\n      → '));
  ck('js/search-word.js がある', fs.existsSync(path.join(ROOT, 'js/search-word.js')));
  ck('index.html が読み込んでいる', /src="js\/search-word\.js"/.test(read('index.html')));
  ck('filt が wkSearchWord を使う',   /wkSearchWord/.test(read('js/filter.js')));
  ck('orgFilt が wkSearchWord を使う', /wkSearchWord/.test(read('js/organize.js')));
  ck('リストの表も wkSearchWord を使う', /wkSearchWord/.test(read('js/custom-view.js')));
}

// ── ② 本物の画面で、カードとテーブルが同じ本数になること ──
console.log('■ ② カードとテーブルが、同じ語で同じ本数になること');
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
// カード型のカスタムリスト（3本が範囲・うち2本が Quick）
await ctx.addInitScript(v => localStorage.setItem('wk_cv_views', JSON.stringify(v)),
  [{ id:'_swc', label:'検査用リスト', saveMode:'manual', icon:'📁', viewType:'card',
     videoIds:['q1','q2','n1'], columns:[], rowData:{} },
   // リロード後の復元を再現するリスト（前回打った語が保存されている）
   { id:'_swq', label:'語が保存されたリスト', saveMode:'manual', icon:'📁', viewType:'card',
     videoIds:['q1','q2','n1'], searchQuery:'-quick', columns:[], rowData:{} }]);
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const res = await page.evaluate(() => {
  window.videos = [
    { id:'q1', title:'02-Quick1. パスガード',   pt:'yt' },
    { id:'q2', title:'30-Quick5. ハーフガード', pt:'yt' },
    { id:'n1', title:'デラヒーバスイープ',      pt:'yt' },
    { id:'n2', title:'クロスチョーク',          pt:'yt' },
  ];
  const IDS = ['si', 'si-lib-pc', 'si-org', 'si-org-pc'];
  const clear = () => IDS.forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const out = [];
  const ids = f => { try { return f(window.videos).map(v => v.id).sort(); } catch (e) { return ['err:' + e.message]; } };
  const measure = (how) => {
    const c = ids(window.filt), t = ids(window.orgFilt);
    out.push({ how, card: c.length, table: t.length,
               onlyTable: t.filter(x => !c.includes(x)), onlyCard: c.filter(x => !t.includes(x)) });
  };
  // 4通りの入れ方（どの入力欄に入っても、両方が同じに読むこと）
  for (const id of IDS) {
    clear();
    const e = document.getElementById(id);
    if (!e) { out.push({ how: id + '（欄が無い）', card: 'skip', table: 'skip' }); continue; }
    e.value = '-quick';
    measure(id + ' に -quick');
  }
  // 語を入れない状態は、どちらも全部出る
  clear();
  measure('（語なし）');
  // 入れた語が全部の欄に配られること
  clear();
  window.wkSetSearchWord?.('-quick');
  const got = IDS.filter(i => document.getElementById(i)).map(i => document.getElementById(i).value);
  out.push({ how: 'wkSetSearchWord で配る', card: got.join('|'), table: got.length });
  clear();
  return out;
});

for (const r of res) {
  if (r.how === 'wkSetSearchWord で配る') {
    ck(`入れた語が、画面にある入力欄 ${r.table} 個すべてに配られる`,
       r.table > 0 && r.card.split('|').every(x => x === '-quick'), r.card);
    continue;
  }
  if (r.card === 'skip') { ck(r.how, true); continue; }
  const d = [r.onlyTable?.length ? 'テーブルだけに出る: ' + r.onlyTable.join(',') : '',
             r.onlyCard?.length  ? 'カードだけに出る: '   + r.onlyCard.join(',')  : ''].filter(Boolean).join(' / ');
  ck(`${r.how} → カード ${r.card}本 / テーブル ${r.table}本`, !d, d);
}

// ── ③ リストを開いて打った語が、カード⇔テーブルの切替で消えないこと ──
// カード⇔テーブルの切替は _cvOnViewChange を通る。そこが検索語まで消していたため、
// 「打った直後は効くのに、テーブルに切り替えると全部出る／戻すと条件が消えている」になっていた。
console.log('■ ③ リストを開いて打った語が、ビューの切替で消えないこと');
const e2e = await page.evaluate(async () => {
  const wait = () => new Promise(r => setTimeout(r, 150));
  const log = [];
  const ids = f => { try { return f(window.videos).map(v => v.id).sort(); } catch (e) { return ['err']; } };
  const snap = (step) => {
    const c = ids(window.filt), t = ids(window.orgFilt);
    log.push({ step, word: window.wkSearchWord?.() || '', card: c.length, table: t.length,
               onlyTable: t.filter(x => !c.includes(x)), onlyCard: c.filter(x => !t.includes(x)) });
  };
  window._cvOpen?.('_swc') ?? window._cvSelectView?.('_swc');
  await wait();
  const box = document.getElementById('si-lib-pc');
  box.value = '-quick';
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(); snap('リストで -quick と打つ');
  window._libView?.('org');  await wait(); snap('テーブルに切替');
  window._libView?.('card'); await wait(); snap('カードに戻す');
  return log;
});
for (const r of e2e) {
  const d = [r.onlyTable?.length ? 'テーブルだけに出る: ' + r.onlyTable.join(',') : '',
             r.onlyCard?.length  ? 'カードだけに出る: '   + r.onlyCard.join(',')  : ''].filter(Boolean).join(' / ');
  ck(`${r.step} → 語「${r.word}」/ カード ${r.card}本 / テーブル ${r.table}本`,
     r.word === '-quick' && !d,
     r.word !== '-quick' ? '切替で検索語が消えている' : d);
}

// ── ④ 保存された検索語を復元して開いても、カードとテーブルが同じになること ──
// リストは検索語を保存する（view.searchQuery）。復元のとき window._uniVideoQ にも
// 同じ語を入れていた。_uniVideoQ は統合フィルターの「動画を探す」欄の別物で、
// 判定は「タイトル＋チャンネル名にその文字がそのまま含まれるか」だけ。演算子を解釈しない。
// そのため「-quick」を復元すると **どの動画にも当たらず全部消え**、しかも見ているのは
// カード表示だけなので「テーブルには出るのにカードは0本」になっていた。
// 保存された語はリロード後も復元されるので、ハードリロードしても 0本 のままだった。
console.log('■ ④ 保存された語を復元して開いても、カードとテーブルが同じになること');
const restored = await page.evaluate(async () => {
  const wait = () => new Promise(r => setTimeout(r, 250));
  window._cvClearSelection?.();
  await wait();
  window._cvPickerSelect?.('_swq', true);
  await wait();
  return {
    word: window.wkSearchWord?.() || '',
    uni: window._uniVideoQ || '',
    card:  (() => { try { return window.filt(window.videos).map(v => v.id).sort(); }    catch (e) { return ['err']; } })(),
    table: (() => { try { return window.orgFilt(window.videos).map(v => v.id).sort(); } catch (e) { return ['err']; } })(),
  };
});
{
  const onlyT = restored.table.filter(x => !restored.card.includes(x));
  const onlyC = restored.card.filter(x => !restored.table.includes(x));
  const d = [onlyT.length ? 'テーブルだけに出る: ' + onlyT.join(',') : '',
             onlyC.length ? 'カードだけに出る: '   + onlyC.join(',')  : ''].filter(Boolean).join(' / ');
  ck(`保存された「-quick」を復元 → 語「${restored.word}」/ カード ${restored.card.length}本 / テーブル ${restored.table.length}本`,
     restored.word === '-quick' && !d && restored.card.length > 0,
     restored.word !== '-quick' ? '検索語が復元されていない'
     : restored.card.length === 0 ? '全部消えている（演算子が文字列として照合されている）' : d);
}
ck('検索語を _uniVideoQ（別物の絞り込み）に入れていない', restored.uni === '',
   `_uniVideoQ = "${restored.uni}"。ここは演算子を解釈しないので、-除外 を入れると全部消える`);

await browser.close();
srv.close();
console.log(fail ? `\n✗ ${fail} 件` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
