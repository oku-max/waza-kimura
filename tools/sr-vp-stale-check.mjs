#!/usr/bin/env node
// ═══ 検索VPを閉じた後に、同じIDの“見えない複製”が残らないかの検査 ═══
// 使い方: node tools/sr-vp-stale-check.mjs
//
// なぜ要るか（2026-09-23「ブックマーク編集ボタンが効かない」）:
//   YouTube検索のVP（#yt-sr-vp-overlay）は、右列に実VPanelと同じIDで
//   ブックマーク・メモを作る（#vp-bm-list-<id>, #vp-memo-<id>）。
//   閉じるときに左列しか空にしていなかったので、右列が見えないまま残った。
//   このオーバーレイは index.html で #vpanel より前にあるため、同じ動画を
//   ライブラリで開くと getElementById が見えない方を掴む。
//     ・編集ボタン → 見えない方が開く（画面は何も変わらない）
//     ・＋ブックマーク → 見えない方に描かれる（押しても増えないように見えて、何度も押される）
//     ・メモ → 見えない方に読み込まれ、保存も見えない方から読む
//   状態（_vpBmExpanded）は正しく変わるので、ログを見ても分からない。
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// ── 静的: ytSrCloseVPanel が右列を空にしていること ──
const ys = fs.readFileSync(path.join(ROOT, 'js/yt-search.js'), 'utf8');
const i0 = ys.indexOf('export function ytSrCloseVPanel(');
let body = null;
if (i0 >= 0) { let d = 0; for (let k = ys.indexOf('{', i0); k < ys.length; k++) {
  if (ys[k] === '{') d++; else if (ys[k] === '}') { d--; if (!d) { body = ys.slice(i0, k + 1); break; } } } }
if (!body) fail('ytSrCloseVPanel が見つからない');
else {
  /getElementById\('yt-sr-vp-scroll'\)/.test(body) && /srScroll\.innerHTML\s*=\s*''/.test(body)
    ? ok('閉じるときに右列（#yt-sr-vp-scroll）も空にする')
    : fail('閉じても右列が残る（実VPanelと同じIDが2つになり、編集ボタン・メモが見えない方に効く）');
  // 空にする前に打ちかけのメモを確定させる。ただし入力が無ければ書かない。
  /memoEl\s*&&\s*memoEl\._t/.test(body) && body.indexOf('vpSaveMemo') < body.indexOf("srScroll.innerHTML = ''")
    ? ok('空にする前に、入力のあったメモだけ保存する')
    : fail('右列を空にする前のメモ確定が無い／入力が無くても保存している');
}

// ── 実行: 見えない複製があると編集が画面に出ず、無ければ出ること ──
const { execSync } = await import('node:child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g', { encoding:'utf8' }).trim(), 'playwright', 'index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
if (!chromium) { console.log('  - playwright が無いので実行部分は省略'); }
else {
  const PORT = 8154;
  const page = (stale) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="yt-sr-vp-overlay" style="display:none"><div id="yt-sr-vp-scroll">${stale ? '<div id="vp-bm-list-V1"></div>' : ''}</div></div>
<div id="vpanel"><div id="vp-bm-list-V1"></div></div>
<script>window.videos=[{id:'V1',title:'t',bookmarks:[{time:250,label:''},{time:250,label:''},{time:250,label:''}]}];window.toast=()=>{};<\/script>
<script type="module">import * as M from '/js/vpanel.js'; Object.assign(window, M);
 // 最初の描画（開いたときと同じ中身）を見える方に入れる
 M.vpBmToggleEdit('V1',0); M.vpBmToggleEdit('V1',0);
 const first=document.getElementById('vp-bm-list-V1');
 document.querySelector('#vpanel #vp-bm-list-V1').innerHTML=first.innerHTML;
 window.__ready=true;<\/script></body></html>`;
  const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/stale' || p === '/clean') { r.writeHead(200, { 'Content-Type':'text/html' }); return r.end(page(p === '/stale')); }
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(''); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/plain' }); r.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(PORT, r));
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const ctx = await b.newContext({ viewport: { width: 700, height: 800 }, hasTouch: true, isMobile: true });
  ctx.setDefaultTimeout(6000);
  await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
  const run = async (kind) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', e => console.log('  PAGEERR', String(e).split('\n')[0]));
    await pg.goto(`http://localhost:${PORT}/${kind}`);
    await pg.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
    await pg.locator('#vpanel #vp-bm-list-V1 button', { hasText: '編集' }).nth(1).tap();
    await pg.waitForTimeout(200);
    const shown = await pg.locator('#vpanel #vp-bm-list-V1 button', { hasText: '保存' }).count();
    await pg.close();
    return shown;
  };
  (await run('stale')) === 0
    ? ok('（前提の確認）見えない複製があると、編集を押しても画面は変わらない')
    : fail('（前提の確認）複製があっても編集が出た＝この検査が症状を再現できていない');
  (await run('clean')) > 0
    ? ok('複製が無ければ、編集を押すとその行の編集欄が出る')
    : fail('複製が無くても編集欄が出ない');
  await b.close(); srv.close();
}

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 検索VPを閉じても見えない複製は残らず、編集ボタンは見える方に効く');
process.exit(ng ? 1 : 0);
