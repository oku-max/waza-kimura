// 実際にブラウザでアプリを起動して、主要UIを触り、JSエラーが出ないかを見る。
//
// なぜ必要か: v52.684 で _cvPickerCountLabel が関数ローカルの T() を呼ぶようになり、
// リストが1件でもあるとピッカーの描画が丸ごと throw して「リスト切替ボタンが効かない」
// 状態になった。node --check も wrangler も静的検査は全部通る。実行しないと分からない。
//
// 使い方: node tools/smoke.mjs
// 終了コード: 0 = 想定外のエラーなし / 1 = あり
//
// Firebase SDK と Google フォントは外部なので取得できない前提。
// firebase 由来のエラーだけは既知として無視する（ログインが要る画面までは見ない）。

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// playwright はリポジトリに入れていないので、ローカル→グローバルの順に探す
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
const PORT = 8137;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

// 起動時点では未ログインなので、ローカルに保存されている想定のデータを撒いておく。
// リストが 0 件だとピッカーの行を作るループが回らず、今回のバグを踏めない。
const SEED = [
  { id:'_smoke1', label:'スモークA', saveMode:'manual', icon:'📁', videoIds:['a1','a2'], columns:[], rowData:{} },
  { id:'_smoke2', label:'スモークB', saveMode:'dynamic', icon:'📂', videoIds:[], columns:[], rowData:{} },
];

const IGNORE = /firebase|gstatic|googleapis|accounts\.google|gsi\/client|net::ERR|Failed to load resource/i;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const exe = process.env.PLAYWRIGHT_CHROMIUM
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
await ctx.addInitScript(seed => localStorage.setItem('wk_cv_views', JSON.stringify(seed)), SEED);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); };

// 1) 主要なグローバル関数が生えているか
const fns = await page.evaluate(() => Object.fromEntries(
  ['cvOpenViewPicker','_cvSetView','_cvPickerSelect','_closePicker','_cvClearSelection']
    .map(n => [n, typeof window[n]])));
for (const [n, t] of Object.entries(fns)) check(`window.${n}`, t === 'function', t);

// 2) リスト切替ピッカーが「中身つきで」開くか
//    ここが今回のバグ。throw すると overlay は出るが中身が空になる。
const picker = await page.evaluate(() => {
  try { window.cvOpenViewPicker(); } catch (e) { return { throw: String(e) }; }
  const ov = document.getElementById('cv-picker-overlay');
  return { display: ov ? getComputedStyle(ov).display : 'なし',
           items: ov ? ov.querySelectorAll('.cv-picker-item').length : 0 };
});
check('リスト切替ピッカーが開く', picker.display === 'flex', JSON.stringify(picker));
check('ピッカーに行が描画される', picker.items >= SEED.length + 1, `行数 ${picker.items}（期待 ${SEED.length + 1}以上）`);

// 3) リストを選んで閉じられるか
const sel = await page.evaluate(() => {
  try { window._cvPickerSelect('_smoke1'); } catch (e) { return { throw: String(e) }; }
  return { overlay: document.getElementById('cv-picker-overlay')?.style.display };
});
check('リストを選択できる', sel.overlay === 'none', JSON.stringify(sel));

// 4) マスターへ戻せるか
const back = await page.evaluate(() => {
  try { window._cvClearSelection(); } catch (e) { return String(e); }
  return 'ok';
});
check('マスターへ戻せる', back === 'ok', back);

// 5) カード / テーブル切替
for (const v of ['table', 'card']) {
  const r = await page.evaluate(vt => { try { window._cvSetView(vt); return 'ok'; } catch (e) { return String(e); } }, v);
  check(`ビュー切替 ${v}`, r === 'ok', r);
}

await page.waitForTimeout(400);
await browser.close();
srv.close();

const unexpected = [...new Set(errs)].filter(e => !IGNORE.test(e));
let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  → ' + c.detail}`);
  if (!c.ok) failed++;
}
console.log(unexpected.length ? `\n✗ 想定外のJSエラー ${unexpected.length}件:\n  ` + unexpected.join('\n  ')
                              : '\n✓ 想定外のJSエラーなし');
if (failed || unexpected.length) { console.log(`\n失敗 ${failed}件 / エラー ${unexpected.length}件`); process.exit(1); }
console.log('\n✓ スモークテスト通過');
