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
//  ⑧ サムネが狭い（スマホ）ときはプレビュー中だけカード幅に広げ、閉じると戻る。広い（PC）ときは広げない
//  ⑨ Drive はログインしていれば動画パネルと同じ /api/drive の <video>（帯なし・音なしで自動再生）。していなければ埋め込みを、上の黒い帯を隠さず、枠を帯のぶん（64px）高くして帯も映像も全部見せる（PC・スマホとも）
//  ⑩ ボタンは見た目より広く押せる（ボタンの少し外を押してもプレビューになり、動画パネルは開かない）
//  ⑪ ボタンはサムネの中ではなく真下・サムネと同じ幅の低い帯（v52.904 オーナー決定 G②）。プレビュー中は［閉じる｜開く］左右均等（v52.905 H3）
//  ⑫ 「開く」は見ていた位置（今の埋め込みが知らせてきたものだけ）から動画パネルを開く
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

const labels = await page.$$eval('.card-pv-btn', bs => bs.map(b => b.textContent.trim()));
ok(labels.length && labels.every(t => t === 'プレビュー'), `ボタンは「プレビュー」の文字だけ（▶ を付けない。長さのバッジの ▶ と紛れる）: ${[...new Set(labels)].join(',')}`);
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

console.log('⑧ スマホではカード幅に広げる');
await page.evaluate(() => { window.bulkMode = false; window.opened = []; });
const w0 = await page.$eval(`#thumb-${yt[0].id}`, e => e.clientWidth);
await page.click(`#card-${yt[0].id} .card-pv-btn`);
const w1 = await page.$eval(`#thumb-${yt[0].id}`, e => e.clientWidth);
const cw = await page.$eval(`#card-${yt[0].id}`, e => e.clientWidth);
ok(w0 < 320 && w1 > w0 && w1 >= cw * 0.9, `サムネ ${w0}px → プレビュー中 ${w1}px（カード ${cw}px）`);
const h1 = await page.$eval(`#thumb-${yt[0].id}`, e => e.clientHeight);
ok(Math.abs(h1 - w1 * 9 / 16) <= 2, `16:9 で出る（高さ ${h1}px）`);
await page.click(`#thumb-${yt[0].id} .card-pv-close`);
ok(await page.$eval(`#thumb-${yt[0].id}`, e => e.clientWidth) === w0, '閉じると元の大きさ');
await page.setViewportSize({ width: 1400, height: 900 });
const wd = await page.$eval(`#thumb-${yt[0].id}`, e => e.clientWidth);
await page.click(`#card-${yt[0].id} .card-pv-btn`);
ok(!(await page.$eval(`#card-${yt[0].id}`, e => e.classList.contains('pv-wide'))) || wd < 320, `サムネが広い（${wd}px）ときは広げない`);
await page.evaluate(() => window.wkCardPreviewStop());
await page.setViewportSize({ width: 390, height: 900 });

console.log('⑨ Drive: ログインしていなければ埋め込みを、ずらさず枠を帯のぶん高くして出す（PC・スマホとも）');
const gd = by('gd');
async function gdCheck(pg, label) {
  const w0 = await pg.$eval(`#thumb-${gd.id}`, e => [e.clientWidth, e.clientHeight]);
  await pg.evaluate(id => window.wkCardPreview(id), gd.id);
  const r = await pg.$eval(`#thumb-${gd.id}`, t => { const f = t.querySelector('.card-pv-layer iframe'); return { w: t.clientWidth, h: t.clientHeight, top: getComputedStyle(f).top, fh: f.clientHeight }; });
  ok(parseFloat(r.top) === 0 && r.fh === r.h, `${label}: 埋め込みはずらさず枠いっぱい（top ${r.top}・枠 ${r.h}px／埋め込み ${r.fh}px）`);
  ok(Math.abs(r.h - (r.w * 9 / 16 + 64)) <= 2, `${label}: 枠の高さ ＝ 幅×9/16＋64（幅 ${r.w}px → 高さ ${r.h}px）`);
  await pg.evaluate(() => window.wkCardPreviewStop());
  const w1 = await pg.$eval(`#thumb-${gd.id}`, e => [e.clientWidth, e.clientHeight]);
  ok(w1[0] === w0[0] && w1[1] === w0[1], `${label}: 閉じると元の大きさ（${w1.join('×')}）`);
}
await page.setViewportSize({ width: 1400, height: 900 });
await gdCheck(page, 'PC');
await page.setViewportSize({ width: 390, height: 900 });
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  await mp.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 204, body: '' }));
  await mp.route(`http://localhost:${PORT}/__bare`, r => r.fulfill({ status: 200, contentType: 'text/html', body: BARE }));
  await mp.goto(`http://localhost:${PORT}/__bare`);
  await mp.waitForFunction(() => window.__ready);
  await gdCheck(mp, 'スマホ');
  await mctx.close();
}
// Drive にログインしているとき: 動画パネルと同じ /api/drive の <video>（帯が無い・音なしで自動再生）
{
  await page.evaluate(() => { window.getDriveTokenIfAvailable = () => 'TKN'; });
  const hang = () => {};   // 読み込み中のままにする（<video> の形だけを見る）
  await page.route('**/api/drive**', hang);
  await page.evaluate(id => window.wkCardPreview(id), gd.id);
  const r = await page.$eval(`#thumb-${gd.id}`, t => { const v = t.querySelector('.card-pv-layer video'); return v && { src: v.getAttribute('src'), muted: v.muted, auto: v.autoplay, pi: v.hasAttribute('playsinline'), iframe: !!t.querySelector('iframe'), w: t.clientWidth, h: t.clientHeight }; });
  ok(r && r.src === '/api/drive?fileId=FILE1&token=TKN' && r.muted && r.auto && r.pi && !r.iframe, `ログイン中の Drive は <video>（${r && r.src}・音なし・自動再生）`);
  ok(r && Math.abs(r.h - r.w * 9 / 16) <= 2, `<video> のときは 16:9 のまま（${r && r.w}×${r && r.h}）`);
  await page.evaluate(() => window.wkCardPreviewStop());
  ok(!(await page.$(`#thumb-${gd.id} video`)), '閉じると <video> も消える');
  await page.unroute('**/api/drive**', hang);
  // 期限切れ等で読めなければ埋め込みに切り替わる（テストでは外への読み込みを止めているので /api/drive は 404 → error）
  await page.evaluate(id => window.wkCardPreview(id), gd.id);
  await page.waitForFunction(id => document.querySelector(`#thumb-${id} .card-pv-layer iframe`), gd.id, { timeout: 5000 }).catch(() => {});
  ok(!!(await page.$(`#thumb-${gd.id} .card-pv-layer iframe`)) && !(await page.$(`#thumb-${gd.id} .card-pv-layer video`)), '<video> が読めなければ埋め込みに切り替わる');
  await page.evaluate(() => window.wkCardPreviewStop());
  await page.evaluate(() => { delete window.getDriveTokenIfAvailable; });
}
// Drive の認証がこの端末に無いとき: 動画パネルと同じ「Googleで認証して再生」を出し、認証できたら <video>（v52.902）
{
  const hang = () => {};
  await page.route('**/api/drive**', hang);
  await page.evaluate(() => {
    window._showGDriveAuthUI = (box, fileId, onAuth) => {
      box.innerHTML = `<button id="gd-auth-play-btn">Googleで認証して再生</button>`;
      box.querySelector('button').onclick = () => onAuth('TK2');
    };
  });
  await page.evaluate(id => window.wkCardPreview(id), gd.id);
  ok(!!(await page.$(`#thumb-${gd.id} #gd-auth-play-btn`)) && !(await page.$(`#thumb-${gd.id} iframe`)), '認証が無ければ「Googleで認証して再生」を出す（黙って埋め込みに戻さない）');
  await page.click(`#thumb-${gd.id} #gd-auth-play-btn`);
  const src = await page.$eval(`#thumb-${gd.id} .card-pv-layer video`, v => v.getAttribute('src')).catch(() => null);
  ok(src === '/api/drive?fileId=FILE1&token=TK2' && (await page.evaluate(() => window.opened.length)) === 0, `認証できたら <video>（${src}）・動画パネルは開かない`);
  await page.evaluate(() => window.wkCardPreviewStop());
  await page.evaluate(() => { delete window._showGDriveAuthUI; });
  await page.unroute('**/api/drive**', hang);
}
// YouTube は高くしない（帯が無い）
await page.click(`#card-${yt[0].id} .card-pv-btn`);
const yh = await page.$eval(`#thumb-${yt[0].id}`, t => [t.clientWidth, t.clientHeight]);
ok(Math.abs(yh[1] - yh[0] * 9 / 16) <= 2, `YouTube は 16:9 のまま（${yh.join('×')}）`);
await page.evaluate(() => window.wkCardPreviewStop());

console.log('⑩ ボタンの少し外を押してもプレビュー');
const bb = await page.$eval(`#card-${yt[1].id} .card-pv-btn`, b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; });
await page.mouse.click(bb.x, bb.y + 4);
ok(!!(await page.$(`#thumb-${yt[1].id} .card-pv-layer`)) && (await page.evaluate(() => window.opened.length)) === 0, 'ボタンの 4px 下を押してもプレビューになり、動画パネルは開かない');
await page.evaluate(() => window.wkCardPreviewStop());

console.log('⑪ 置き場所はサムネの真下（v52.904・G②）');
const place = await page.$eval(`#card-${yt[1].id}`, c => {
  const b = c.querySelector('.card-pv-btn'), t = c.querySelector('.card-thumb');
  const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect();
  return { inThumb: t.contains(b), below: rb.top >= rt.bottom - 1 && rb.top - rt.bottom < 12, sameW: Math.abs(rb.width - rt.width) <= 20, h: rb.height };
});
ok(!place.inThumb && place.below, 'ボタンはサムネの中ではなく、すぐ下');
ok(place.sameW && place.h <= 22, `サムネとほぼ同じ幅・低い帯（高さ ${Math.round(place.h)}px）`);
await page.click(`#card-${yt[1].id} .card-pv-btn`);
const pair = await page.$eval(`#card-${yt[1].id}`, c => {
  const p = c.querySelector('.card-pv-pair'); if (!p) return null;
  const [x, g] = p.querySelectorAll('button');
  return { btnHidden: c.querySelector('.card-pv-btn').hidden, close: x.textContent.trim(), go: g.textContent.trim(), wx: Math.round(x.getBoundingClientRect().width), wg: Math.round(g.getBoundingClientRect().width) };
});
ok(pair && pair.btnHidden && pair.close === '閉じる' && /^開く/.test(pair.go), `プレビュー中は［閉じる｜開く］に変わる（${pair && pair.close}｜${pair && pair.go}）`);
ok(pair && Math.abs(pair.wx - pair.wg) <= 1, `左右均等（${pair && pair.wx}px ｜ ${pair && pair.wg}px）`);
await page.click(`#card-${yt[1].id} .card-pv-close2`);
ok(!(await page.$(`#thumb-${yt[1].id} .card-pv-layer`)) && !(await page.$(`#card-${yt[1].id} .card-pv-pair`)) && !(await page.$eval(`#card-${yt[1].id} .card-pv-btn`, b => b.hidden)), '「閉じる」で止まり「プレビュー」に戻る');
await page.click(`#card-${yt[0].id} .card-pv-btn`);
await page.click(`#card-${yt[1].id} .card-pv-btn`);
ok(!(await page.$(`#card-${yt[0].id} .card-pv-pair`)) && !(await page.$eval(`#card-${yt[0].id} .card-pv-btn`, b => b.hidden)), '別のカードで押すと、前のカードは「プレビュー」に戻る');
await page.evaluate(() => window.wkCardPreviewStop());
ok((await page.evaluate(() => window.opened.length)) === 0, 'ボタンでは一度も動画パネルを開かない');

console.log('⑫ 「開く」で、見ていた位置から動画パネル（v52.905・H3）');
await page.evaluate(() => { window.openedAt = []; window.vpOpenAt = (id, t) => window.openedAt.push([id, t]); window.opened = []; });
await page.click(`#card-${yt[0].id} .card-pv-btn`);
// YouTube の埋め込みが知らせてくる位置の代わりに、同じ形の知らせをその埋め込みから送ったことにする
await page.evaluate(id => {
  const f = document.querySelector(`#thumb-${id} .card-pv-layer iframe`);
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.youtube.com', source: f.contentWindow, data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 42.6 } }) }));
}, yt[0].id);
await page.waitForTimeout(700);
ok((await page.textContent(`#card-${yt[0].id} .card-pv-go`)).trim() === '開く（0:42 から）', `ボタンに見ていた位置が出る（${(await page.textContent(`#card-${yt[0].id} .card-pv-go`)).trim()}）`);
// ほかから来た知らせ（今の埋め込み以外）は受け取らない
await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.youtube.com', source: window, data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 999 } }) })));
await page.waitForTimeout(600);
ok((await page.textContent(`#card-${yt[0].id} .card-pv-go`)).trim() === '開く（0:42 から）', 'ほかの窓から来た位置の知らせは受け取らない');
await page.click(`#card-${yt[0].id} .card-pv-go`);
const oa = await page.evaluate(() => window.openedAt);
ok(oa.length === 1 && oa[0][0] === yt[0].id && Math.floor(oa[0][1]) === 42 && !(await page.$('.card-pv-layer')), `「開く」でプレビューを閉じ、42秒から動画パネル（vpOpenAt(${oa[0] && oa[0].join(', ')})）`);
// 位置が分からない（始めたばかり）ときは「開く」だけ
await page.click(`#card-${yt[1].id} .card-pv-btn`);
ok((await page.textContent(`#card-${yt[1].id} .card-pv-go`)).trim() === '開く', '位置が分からないうちは「開く」だけ');
await page.evaluate(() => window.wkCardPreviewStop());
ok(await page.evaluate(() => JSON.stringify(window.videos) === window.__before), '動画のデータは変わらない（開く・閉じるの後も）');

ok(errs.length === 0, 'ページのエラーなし ' + (errs.join(' / ')));
await browser.close(); srv.close();
console.log(bad ? `\n✗ ${bad} 件ずれ` : '\n✓ すべて期待どおり');
process.exit(bad ? 1 : 0);
