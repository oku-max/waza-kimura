// ランダムに1本 を実ブラウザで触る。
// 使い方: node tools/random-smoke.mjs   終了コード: 0 = 通過 / 1 = 失敗
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
async function loadChromium() {
  const { execSync } = await import('child_process');
  const cands = ['playwright'];
  try { cands.push(path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')); } catch {}
  for (const c of cands) { try { return (await import(c)).chromium; } catch {} }
  console.error('playwright が見つかりません'); process.exit(2);
}
const chromium = await loadChromium();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8147;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json' };
const IGNORE = /firebase|gstatic|googleapis|accounts\.google|net::ERR|Failed to load resource/i;

const HARNESS = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/random-pick.css">
</head><body>
<div class="topbar"><div class="tb-row-logo"><div class="tb-logo">WAZA KIMURA</div>
  <button id="acct-btn">H</button></div></div>
<script>window.openVPanel = id => { window.__played = id; };<\/script>
<script type="module">
  import { openRandom, pool } from '/js/random-pick.js';
  window.openRandomPick = openRandom; window.__pool = pool; window.__ready = true;
<\/script>
</body></html>`;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') { r.writeHead(200, {'Content-Type':'text/html'}); return r.end(HARNESS); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));
const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 860 } });
ctx.setDefaultTimeout(8000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil:'domcontentloaded', timeout:20000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });

const old = new Date(Date.now() - 400 * 86400000).toISOString();
const recent = new Date(Date.now() - 10 * 86400000).toISOString();
await page.evaluate(([old, recent]) => {
  const D = n => Date.now() - n * 86400000;
  window.videos = [
    // lastPlayed は数値（js/vpanel.js が Date.now() を入れる）
    { id:'a', title:'未再生・古い', pos:['デラヒーバ'], cat:[], tb:[], tags:[], playCount:0, addedAt:old },
    { id:'b', title:'未再生・新しい', pos:[], cat:['パスガード'], tb:[], tags:[], playCount:0, addedAt:recent },
    { id:'c', title:'400日前に見たきり', pos:[], cat:['パスガード'], tb:[], tags:[], playCount:5, addedAt:old, lastPlayed:D(400) },
    { id:'d', title:'最近見た', pos:[], cat:[], tb:[], tags:[], playCount:2, addedAt:recent, lastPlayed:D(10), fav:true },
    { id:'e', title:'アーカイブ済み', pos:[], cat:[], tb:[], tags:[], playCount:0, addedAt:old, archived:true },
    { id:'f', title:'Drill', pos:[], cat:[], tb:[], tags:[], playCount:1, addedAt:recent, lastPlayed:D(10), drill:true },
    { id:'g', title:'120日前に見たきり', pos:[], cat:[], tb:[], tags:[], playCount:1, addedAt:old, lastPlayed:D(120) }
  ];
  window.filteredVideos = window.videos.filter(v => v.id === 'b' || v.id === 'c');
}, [old, recent]);

const checks = [];
const check = (n, ok, d) => { checks.push({n, ok, d}); console.log((ok?'  ✓ ':'  ✗ ')+n+(ok||!d?'':'  → '+d)); };

check('ヘッダーにボタンが出る', await page.locator('#rnd-btn').isVisible());
check('記号が単色SVG', await page.locator('#rnd-btn svg').count() === 1);

const setScope = async v => {
  await page.locator('#rnd-range').click();
  await page.waitForTimeout(200);
  await page.locator(`[data-rnd-scope="${v}"]`).click();
  await page.locator('#rnd-cfg-done').click();
  await page.waitForTimeout(200);
};
await page.locator('#rnd-btn').click();
await page.waitForTimeout(300);
check('開く', await page.locator('#rnd-modal.open').count() === 1);
check('1本出る', await page.locator('.rnd-pick').count() === 1);

await setScope('all');
check('すべて＝アーカイブを除く6本', await page.evaluate(() => window.__pool().length) === 6,
  String(await page.evaluate(() => window.__pool().length)));
await setScope('unplayed');
check('まだ見ていない＝2本', await page.evaluate(() => window.__pool().length) === 2);
await setScope('old');
// 未再生（a,b）は「まだ見ていない」の担当なので、こちらには入れない。
// 半年以上あいているのは c（400日）だけ。g（120日）と d/f（10日）は入らない。
check('しばらく見ていない・半年＝1本（未再生は含めない）',
  await page.evaluate(() => window.__pool().length) === 1,
  String(await page.evaluate(() => window.__pool().length)));
// 期間を3ヶ月に変えると g も入る
await page.locator('#rnd-range').click();
await page.waitForTimeout(200);
check('期間の選択肢が出る', await page.locator('#rnd-olddays.on').count() === 1);
await page.locator('[data-rnd-old="90"]').click();
await page.locator('#rnd-cfg-done').click();
await page.waitForTimeout(200);
check('3ヶ月に変えると2本', await page.evaluate(() => window.__pool().length) === 2,
  String(await page.evaluate(() => window.__pool().length)));
check('範囲に期間が出る',
  ((await page.locator('.rnd-range-v').textContent()) || '').includes('3ヶ月'));
await page.locator('#rnd-range').click();
await page.waitForTimeout(150);
await page.locator('[data-rnd-old="180"]').click();
await page.locator('#rnd-cfg-done').click();
await page.waitForTimeout(150);
await setScope('view');
check('いま画面に出ている＝2本', await page.evaluate(() => window.__pool().length) === 2);
await setScope('fav');
check('お気に入り＝1本', await page.evaluate(() => window.__pool().length) === 1);
await setScope('drill');
check('Drill＝1本', await page.evaluate(() => window.__pool().length) === 1);

// タグで絞る
await page.locator('#rnd-range').click();
await page.waitForTimeout(200);
await page.locator('[data-rnd-scope="all"]').click();
await page.locator('#rnd-tagq').fill('パスガード');
await page.waitForTimeout(200);
await page.locator('[data-rnd-tag="パスガード"]').click();
await page.locator('#rnd-cfg-done').click();
await page.waitForTimeout(250);
check('タグで絞れる', await page.evaluate(() => window.__pool().length) === 2,
  String(await page.evaluate(() => window.__pool().length)));
check('範囲が画面に出る',
  ((await page.locator('.rnd-range-v').textContent()) || '').includes('パスガード'));

// 引き直し・再生
await page.locator('#rnd-again').click();
await page.waitForTimeout(200);
check('引き直せる', await page.locator('.rnd-pick').count() === 1);
await page.locator('#rnd-play').click();
await page.waitForTimeout(250);
check('見るで再生に渡す', ['b','c'].includes(await page.evaluate(() => window.__played)));
check('再生で閉じる', await page.locator('#rnd-modal.open').count() === 0);

// 該当なし
await page.locator('#rnd-btn').click();
await page.waitForTimeout(200);
await page.locator('#rnd-range').click();
await page.waitForTimeout(200);
await page.locator('[data-rnd-scope="fav"]').click();
await page.locator('#rnd-cfg-done').click();
await page.waitForTimeout(250);
check('該当なしでも落ちずに案内を出す', await page.locator('.rnd-none').count() === 1);

// 設定が残る
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
check('設定がこの端末に残る',
  (await page.evaluate(() => window._rndGetCfg())).scope === 'fav');
check('動画のデータに書き込まない',
  await page.evaluate(() => !localStorage.getItem('wk_cv_views') && !localStorage.getItem('waza_videos')));

const unexpected = errs.filter(e => !IGNORE.test(e));
console.log('');
if (unexpected.length) { console.log('✗ JSエラー:'); unexpected.forEach(e => console.log('   '+e)); }
else console.log('✓ 想定外のJSエラーなし');
const failed = checks.filter(c => !c.ok).length;
console.log('');
console.log(failed || unexpected.length
  ? `✗ 失敗 ${failed}件 / エラー ${unexpected.length}件`
  : `✓ ランダム スモークテスト通過（${checks.length}項目）`);
await browser.close(); srv.close();
process.exit(failed || unexpected.length ? 1 : 0);
