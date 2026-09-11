// 動画の本数の内訳（video-audit）が実際のブラウザで正しく数えられるかを見る。
//
// なぜ必要か: 「動画が減った」の相談は、実データが減ったのか絞り込みで隠れているのかが
// 画面から区別できないことが原因だった。その区別を出す表示なので、数え方が狂うと
// かえって誤解を生む。数字が合うことを実行して確かめる。
//
// アプリ本体は Firebase SDK（外部）を通してモジュールを読むため、この環境では index.html ごと
// 動かせない。organize.js は import を持たない独立モジュールなので、必要な DOM とグローバルだけを
// 置いた最小ページに organize.js と video-audit.js を読み込んで、本物の renderOrg を実行して数える。
//
// 使い方: node tools/video-audit-smoke.mjs
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
const PORT = 8139;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
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

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
// ── 最小ページ（本物の organize.js / video-audit.js を読む）──
const BARE = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>va</title></head><body>
<div class="org-count-bar"><span id="oc"></span></div>
<span id="rc"></span>
<div id="cardList"></div>
<input id="si-org" type="text">
<input id="si" type="text">
<select id="org-sort-sel"><option value="added-desc">added-desc</option></select>
<div id="org-empty" style="display:none"></div>
<div class="org-table-wrap"><table class="org-table"><thead><tr><th>Title</th></tr></thead><tbody id="orgList"></tbody></table></div>
<script>
  // renderOrg が参照する最小限のグローバル（本物の挙動に合わせた素通しの実装）
  window.videos = [];
  window.normStatus = s => s || '';
  window.vpCntRank  = n => ({ lv: 0 });
  window.AF = () => {};
  window.debounceSave = () => {};
  window.wkFmtDur = s => '';
  // カード表示側(AF)が呼ぶもの。描画自体はこのテストの対象ではないので素通しにする。
  window.renderCards = () => {};
  window.filters = { tb:new Set(), action:new Set(), position:new Set(), playlist:new Set(),
    status:new Set(), tags:new Set(), platform:new Set(), channel:new Set(), prio:new Set() };
<\/script>
<script src="/js/video-audit.js"><\/script>
<script type="module" src="/js/organize.js"><\/script>
<script type="module">
  import { AF } from '/js/filter.js';
  window.AF = AF;
<\/script>
</body></html>`;
await ctx.route(new RegExp(`^http://localhost:${PORT}/__bare$`), r =>
  r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BARE }));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });

await page.goto(`http://localhost:${PORT}/__bare`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(800);

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// 100本のうち 7本をアーカイブ、残りのうち 20本だけがタイトル検索に当たる形にする
const stats = await page.evaluate(() => {
  const vs = [];
  for (let i = 0; i < 100; i++) {
    vs.push({ id: 'va' + i, title: (i < 20 ? 'ヒットする動画 ' : 'その他 ') + i,
              pt:'yt', duration: 300, tb:[], cat:[], pos:[], tags:[], addedAt:'2026-01-01',
              archived: i >= 93 });
  }
  window.videos = vs;
  const si = document.getElementById('si-org'); if (si) si.value = 'ヒットする動画';
  window.renderOrg?.();
  const s = window.wkVideoStats();
  const oc = document.getElementById('oc');
  return { s, ocText: oc ? oc.textContent : '' };
});
check('全体の本数', stats.s.total === 100, JSON.stringify(stats.s));
check('アーカイブ本数', stats.s.archived === 7, JSON.stringify(stats.s));
check('画面に出ている本数', stats.s.shown === 20, JSON.stringify(stats.s));
check('絞り込みで隠れている本数', stats.s.filtered === 73, JSON.stringify(stats.s));
check('カウンタに非表示の件数が出る', /非表示\s*80本/.test(stats.ocText.replace(/\s+/g,' ')), stats.ocText);

// カード表示の件数（#rc）もタップで内訳が開けるか
const card = await page.evaluate(() => {
  const si = document.getElementById('si-org'); if (si) si.value = '';
  const si2 = document.getElementById('si');    if (si2) si2.value = '';
  window._libViewMode = 'card';
  try { window.AF(); } catch (e) { return { throw: String(e) }; }
  const rc = document.getElementById('rc');
  const before = !!document.getElementById('wk-va-ov');
  rc?.click();
  const ov = document.getElementById('wk-va-ov');
  const shown = window.wkVideoStats().shown;
  if (ov) ov.remove();
  return { text: rc ? rc.textContent : '', opened: !before && !!ov, shown };
});
check('カード表示の件数が出る', /93\s*本\s*表示中/.test(card.text || ''), JSON.stringify(card).slice(0, 200));
check('カード表示の件数タップで内訳が開く', card.opened === true, JSON.stringify(card).slice(0, 200));
check('カード表示でも表示中の本数を数えられる', card.shown === 93, JSON.stringify(card).slice(0, 200));

// 内訳ダイアログが開いて、数字が入っているか
const dlg = await page.evaluate(() => {
  try { window.wkVideoAuditOpen(); } catch (e) { return { throw: String(e) }; }
  const ov = document.getElementById('wk-va-ov');
  return { open: !!ov, text: ov ? ov.innerText.replace(/\s+/g, ' ') : '' };
});
check('内訳ダイアログが開く', dlg.open === true, JSON.stringify(dlg).slice(0, 200));
check('内訳に全体の本数が出る', /100 本/.test(dlg.text), dlg.text.slice(0, 300));
check('内訳にアーカイブが出る', /7 本/.test(dlg.text), dlg.text.slice(0, 300));

// 本数の記録と減少検知（localStorage の新規キーだけを使う）
const log = await page.evaluate(() => {
  localStorage.removeItem('wk_videoCountLog');
  const a = window.wkLogVideoCount(1950, '読込');
  const b = window.wkLogVideoCount(1887, '読込');
  const c = window.wkLogVideoCount(1886, '読込');
  return { a, b, c, len: JSON.parse(localStorage.getItem('wk_videoCountLog') || '[]').length };
});
check('初回は警告を出さない', log.a === null, JSON.stringify(log.a));
check('大きく減ったら検知する', log.b && log.b.diff === 63, JSON.stringify(log.b));
check('1本の差では警告しない', log.c === null, JSON.stringify(log.c));
check('記録が残る', log.len === 3, String(log.len));

// 減少の警告バナーが出せるか
const warn = await page.evaluate(() => {
  window.wkVideoCountWarn({ prev: 1950, now: 1887, diff: 63 });
  const b = document.getElementById('wk-va-warn');
  return b ? b.innerText.replace(/\s+/g, ' ') : '';
});
check('減少の警告が出る', /1950/.test(warn) && /1887/.test(warn), warn.slice(0, 200));

// 一覧から消えた動画（リスト・ノート・再生位置に ID だけ残っているもの）を見つけられるか
const miss = await page.evaluate(() => {
  window.videos = [{ id: 'yt-aaa', title: 'ある動画' }];
  window._cvViews = [{ id: 'v1', label: 'マイリスト', videoIds: ['yt-aaa', 'yt-bbb'] }];
  window._notesGetData = () => ([{ notes: [{ name: 'ノートA', blocks: [
    { type: 'video', videoId: 'yt-ccc', title: '消えた動画C' },
    { type: 'col', cols: [[{ type: 'video', videoId: 'yt-ddd', title: '消えた動画D' }]] },
  ] }] }]);
  window._notesGetRoot = () => [];
  localStorage.setItem('wk_playhead', JSON.stringify({ enabled: true, pos: { 'yt-eee': { t: 30, at: '2026-09-01' } } }));
  const found = window.wkFindMissingVideos();
  return { ids: found.map(f => f.id).sort(), titles: found.filter(f => f.title).map(f => f.title).sort() };
});
check('消えた動画のIDを集められる',
  JSON.stringify(miss.ids) === JSON.stringify(['yt-bbb', 'yt-ccc', 'yt-ddd', 'yt-eee']), JSON.stringify(miss));
check('ノートに残ったタイトルを拾える',
  JSON.stringify(miss.titles) === JSON.stringify(['消えた動画C', '消えた動画D']), JSON.stringify(miss));
check('一覧にある動画は消えた扱いにしない', !miss.ids.includes('yt-aaa'), JSON.stringify(miss));

await page.waitForTimeout(300);
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
console.log('\n✓ 本数の内訳テスト通過');
