// カードのプレビュー（v52.896）を本物の js/cards.js で見る。
//
// 見ること:
//  ① YouTube/Vimeo/Drive のカードに「▶ プレビュー」が出て、X には出ない
//  ② 押すとサムネの中に音なし・自動再生の埋め込みが重なる（YouTube は mute=1）
//  ③ 同時に1本だけ（別のカードで押すと前のは消える）・✕ で閉じる
//  ④ サムネそのものを押すと、今までどおり動画パネル（openVPanel）が開く／プレビューのボタンでは開かない
//  ⑤ サムネ（img）と data-emb を書き換えない（動画パネル・サムネの読み込み直しがそれを読む）
//  ⑥ 動画のデータ（window.videos）を1文字も変えない
//  ⑦ まとめて選ぶモードでは開かない
//
// 使い方: node tools/card-preview-check.mjs   終了コード: 0 = 期待どおり / 1 = ずれあり
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function loadChromium() {
  const { execSync } = await import('child_process');
  const cands = ['playwright'];
  try { cands.push(path.join(execSync('npm root -g', { encoding:'utf8' }).trim(), 'playwright', 'index.mjs')); } catch {}
  for (const c of cands) { try { return (await import(c)).chromium; } catch {} }
  console.error('playwright が見つかりません。'); process.exit(2);
}
const chromium = await loadChromium();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8143;
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));
const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
// 外への読み込み（サムネ・埋め込み）は止める。見るのは組み立てだけ
await page.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 204, body: '' }));
const BARE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/css/style.css"></head><body>
<div id="cardList"></div>
<script>
  window.videos = [
    { id:'abcdefghijk', pt:'youtube', title:'yt1', tb:[], cat:[], pos:[], tags:[] },
    { id:'bbbbbbbbbbb', ytId:'bbbbbbbbbbb', pt:'youtube', title:'yt2', tb:[], cat:[], pos:[], tags:[] },
    { id:'gd-FILE1', pt:'gdrive', title:'gd', tb:[], cat:[], pos:[], tags:[] },
    { id:'12345', pt:'vimeo', title:'vm', tb:[], cat:[], pos:[], tags:[] },
    { id:'x-999', pt:'x', xTweetId:'999', title:'x', tb:[], cat:[], pos:[], tags:[] },
  ];
  window.opened = [];
  window.openVPanel = id => window.opened.push(id);
  window.togSel = () => {};
<\/script>
<script type="module">
  import { renderCards } from '/js/cards.js';
  window.__before = JSON.stringify(window.videos);
  renderCards(window.videos, 'cardList');
  window.__ready = true;
<\/script></body></html>`;
await page.route(`http://localhost:${PORT}/__bare`, r => r.fulfill({ status: 200, contentType: 'text/html', body: BARE }));
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://localhost:${PORT}/__bare`);
await page.waitForFunction(() => window.__ready);

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) bad++; };

// プラットフォームの判定は cards.js 自身に任せ、data-plat で引く
const plats = await page.$$eval('.card', cs => cs.map(c => ({ id: c.dataset.id, plat: c.dataset.plat, btn: !!c.querySelector('.card-pv-btn'), emb: c.dataset.emb, img: c.querySelector('.card-thumb > img')?.getAttribute('src') })));
const by = p => plats.find(x => x.plat === p);
console.log('① ボタンの有無');
for (const p of ['yt','gd','vm']) ok(by(p)?.btn, `${p} に ▶ プレビュー がある`);
ok(by('x') && !by('x').btn, 'x には無い');

console.log('② 押すと音なしの埋め込みが重なる');
const yt = plats.filter(x => x.plat === 'yt');
await page.click(`#card-${yt[0].id} .card-pv-btn`);
const src1 = await page.getAttribute(`#thumb-${yt[0].id} .card-pv-layer iframe`, 'src').catch(() => null);
ok(src1 && src1.includes('/embed/') && src1.includes('mute=1') && src1.includes('autoplay=1'), `YouTube: ${src1}`);
ok((await page.evaluate(() => window.opened.length)) === 0, 'プレビューのボタンでは動画パネルを開かない');

console.log('③ 同時に1本だけ・✕で閉じる');
await page.click(`#card-${yt[1].id} .card-pv-btn`);
ok(await page.$$eval('.card-pv-layer', l => l.length) === 1, '重なっているのは1本');
ok(!!(await page.$(`#thumb-${yt[1].id} .card-pv-layer`)), '後から押した方が出ている');
await page.click(`#thumb-${yt[1].id} .card-pv-close`);
ok(await page.$$eval('.card-pv-layer', l => l.length) === 0, '✕ で消える');
ok((await page.evaluate(() => window.opened.length)) === 0, '✕ でも動画パネルを開かない');
const vm = by('vm');
await page.click(`#card-${vm.id} .card-pv-btn`);
const src2 = await page.getAttribute(`#thumb-${vm.id} .card-pv-layer iframe`, 'src');
ok(src2.includes('player.vimeo.com') && src2.includes('muted=1'), `Vimeo: ${src2}`);
await page.evaluate(() => window.wkCardPreviewStop());

console.log('④ サムネそのものは今までどおり');
await page.click(`#thumb-${yt[0].id}`, { position: { x: 10, y: 10 } });
ok(JSON.stringify(await page.evaluate(() => window.opened)) === JSON.stringify([yt[0].id]), 'サムネを押すと openVPanel(そのID)');

console.log('⑤ サムネと data-emb を書き換えない');
const after = await page.$$eval('.card', cs => cs.map(c => ({ id: c.dataset.id, emb: c.dataset.emb, img: c.querySelector('.card-thumb > img')?.getAttribute('src') })));
ok(plats.every(p => { const a = after.find(x => x.id === p.id); return a.emb === p.emb && a.img === p.img; }), 'img と data-emb はそのまま');

console.log('⑥ 動画のデータを変えない');
ok(await page.evaluate(() => JSON.stringify(window.videos) === window.__before), 'window.videos は同じ（描画・プレビュー・閉じる・サムネを押す の後）');

console.log('⑦ まとめて選ぶモードでは開かない');
await page.evaluate(id => { window.bulkMode = true; window.wkCardPreview(id); }, yt[0].id);
ok(await page.$$eval('.card-pv-layer', l => l.length) === 0, 'bulkMode では重ねない');

ok(errs.length === 0, 'ページのエラーなし ' + (errs.join(' / ')));
await browser.close(); srv.close();
console.log(bad ? `\n✗ ${bad} 件ずれ` : '\n✓ すべて期待どおり');
process.exit(bad ? 1 : 0);
