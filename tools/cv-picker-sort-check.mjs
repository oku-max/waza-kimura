// リストのピッカーの並べ替え（v52.948・オーナー「リスト名、編集日、動画数で降順、昇順」）。
// 本物の index.html を開いて見る:
//  ① リスト名・編集日・動画数 × 昇順/降順 で行が並び替わる
//  ② 並べ替えても _views の順番（手動の並び・全端末同期）は変わらない
//  ③ 行の 📋/📊（カード/テーブル切替）が出ていない（オーナー「もはや不要」）
//  ④ 編集日: 名前を変えたリストだけ updatedAt が付く。ほかのリストの updatedAt は変わらない
//  ⑤ 「整理」中は手動の並びで出す（▲▼と表示順がずれない）
//  ⑥ 右端の「編集」で小さなメニュー（v52.949・mock-cv-rename.html の A）: 名前を変える／条件を編集（動画を選び直す）。
//  ⑦ 「整理」中の ▲▼ は無い（ドラッグで並べ替える・v52.950）。新しいリストを作る画面に「ビューの種類」は無い
//     名前の横の ✏️ は無い。メニューの外を押すと閉じる。「条件を編集」は今までの「編集」と同じ画面を開く
// 使い方: node tools/cv-picker-sort-check.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function loadChromium() {
  const { execSync } = await import('child_process');
  const cands = ['playwright'];
  try { cands.push(path.join(execSync('npm root -g', { encoding:'utf8' }).trim(), 'playwright', 'index.mjs')); } catch {}
  for (const c of cands) { try { return (await import(c)).chromium; } catch {} }
  console.error('playwright が見つかりません'); process.exit(2);
}
const chromium = await loadChromium();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8163;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

const SEED = [
  { id:'cv_1700000002000', label:'Bリスト', saveMode:'manual', videoIds:['v1','v2','v3'], columns:[], rowData:{}, updatedAt: 1700000005000 },
  { id:'cv_1700000001000', label:'Aリスト', saveMode:'manual', videoIds:['v1'],           columns:[], rowData:{} },  // 編集日なし → 作った時刻
  { id:'cv_1700000003000', label:'Cリスト', saveMode:'manual', videoIds:['v1','v2'],      columns:[], rowData:{}, updatedAt: 1700000009000 },
];
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));
const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
await ctx.addInitScript(seed => { if (!sessionStorage.getItem('_seeded')) { localStorage.setItem('wk_cv_views', JSON.stringify(seed)); localStorage.removeItem('wk_cvPickerSort'); sessionStorage.setItem('_seeded','1'); } }, SEED);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { window.videos = ['v1','v2','v3'].map(id => ({ id, title: id })); });

let fail = 0;
const ok = (name, cond, detail) => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + (detail ?? '')}`); if (!cond) fail++; };
const names = () => page.evaluate(() => [...document.querySelectorAll('#cv-picker-overlay .cv-picker-item[onclick*="_cvPickerSelect"] .cv-picker-name')].map(e => e.textContent));
const viewsOrder = () => page.evaluate(() => (window._cvViews || []).map(v => v.label).join(','));

await page.evaluate(() => window.cvOpenViewPicker());
const before = await viewsOrder();
ok('既定は手動の並び', (await names()).join(',') === 'Bリスト,Aリスト,Cリスト', (await names()).join(','));
ok('③ 行に 📋/📊 の切替が無い', await page.evaluate(() => !/📋|📊/.test(document.getElementById('cv-picker-overlay').innerHTML)));
ok('並び順のメニューがある', await page.evaluate(() => !!document.querySelector('#cv-picker-overlay select.cv-picker-sort')));

const cases = [
  ['name','asc','Aリスト,Bリスト,Cリスト'], ['name','desc','Cリスト,Bリスト,Aリスト'],
  ['edited','asc','Aリスト,Bリスト,Cリスト'], ['edited','desc','Cリスト,Bリスト,Aリスト'],
  ['count','asc','Aリスト,Cリスト,Bリスト'], ['count','desc','Bリスト,Cリスト,Aリスト'],
];
for (const [k, d, want] of cases) {
  await page.evaluate(([k, d]) => window._cvPickerSetSort(k, d), [k, d]);
  const got = (await names()).join(',');
  ok(`① ${k} ${d} → ${want}`, got === want, got);
}
// 向きのボタン
await page.evaluate(() => window._cvPickerSetSort('count', 'desc'));
await page.click('#cv-picker-overlay .cv-picker-sort-dir');
ok('① 向きのボタンで昇順になる', (await names()).join(',') === 'Aリスト,Cリスト,Bリスト', (await names()).join(','));
ok('② _views の順番は変わらない', (await viewsOrder()) === before, await viewsOrder());

// ⑤ 整理中は手動の並び
await page.evaluate(() => window._cvPickerToggleEdit());
const editNames = await page.evaluate(() => [...document.querySelectorAll('#cv-picker-overlay .cv-picker-edit-row .cv-picker-name')].map(e => e.textContent).join(','));
ok('⑤ 整理中は手動の並び', editNames === 'Bリスト,Aリスト,Cリスト', editNames);
ok('⑦ 整理中に ▲▼ が無く、ドラッグのつまみはある', await page.evaluate(() =>
  !document.querySelector('#cv-picker-overlay .cv-picker-arrows') && document.querySelectorAll('#cv-picker-overlay .cv-drag-handle').length === 3));
await page.evaluate(() => window._cvPickerToggleEdit());
ok('⑦ 新しいリストの画面に「ビューの種類」が無い', await page.evaluate(() => {
  const m = document.getElementById('cv-new-modal');
  return !!m && !m.textContent.includes('ビューの種類') && !document.getElementById('cv-type-card-lbl');
}));

// ④ 編集日
const r4 = await page.evaluate(() => {
  const at = () => Object.fromEntries(window._cvViews.map(v => [v.label, v.updatedAt]));
  const b = at();
  window.prompt = () => 'Aリスト改';
  window._cvRenameView('cv_1700000001000');
  return { b, a: at() };
});
ok('④ 名前を変えたリストに updatedAt が付く', typeof r4.a['Aリスト改'] === 'number' && r4.a['Aリスト改'] > 1700000009000, JSON.stringify(r4.a));
ok('④ ほかのリストの updatedAt は変わらない', r4.a['Bリスト'] === r4.b['Bリスト'] && r4.a['Cリスト'] === r4.b['Cリスト'], JSON.stringify(r4));
await page.evaluate(() => { window._cvPickerSetSort('edited', 'desc'); });
ok('④ 編集日の降順で先頭に来る', (await names())[0] === 'Aリスト改', (await names()).join(','));
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('wk_cv_views')).map(v => v.label).join(','));
ok('② 保存された並びも手動のまま', kept === 'Bリスト,Aリスト改,Cリスト', kept);

// ⑥ 「編集」のメニュー
await page.evaluate(() => { window._cvPickerSetSort('manual'); });
ok('⑥ 名前の横の ✏️ が無い', await page.evaluate(() => !document.querySelector('#cv-picker-overlay .cv-picker-rename-btn')));
await page.click('#cv-picker-overlay .cv-picker-edit-btn >> nth=0');
const menu = await page.evaluate(() => [...document.querySelectorAll('#cv-picker-edit-menu button')].map(b => b.textContent.trim()));
ok('⑥ 「編集」でメニューが出る（名前を変える／動画を選び直す）', menu.join('|') === '✏️ 名前を変える|⚙️ 動画を選び直す', menu.join('|'));
await page.click('#cv-picker-overlay .cv-picker-header');
ok('⑥ 外を押すと閉じる', await page.evaluate(() => !document.getElementById('cv-picker-edit-menu')));
await page.click('#cv-picker-overlay .cv-picker-edit-btn >> nth=0');
await page.evaluate(() => { window.prompt = () => 'Bリスト新'; });
await page.click('#cv-picker-edit-menu button[data-act=rename]');
ok('⑥ 「名前を変える」で名前が変わる', (await names())[0] === 'Bリスト新', (await names()).join(','));
ok('⑥ メニューは閉じている', await page.evaluate(() => !document.getElementById('cv-picker-edit-menu')));
await page.evaluate(() => { window._cvEditOpened = null; const o = window.cvOpenConditionEditor; window.cvOpenConditionEditor = id => { window._cvEditOpened = id; }; });
await page.click('#cv-picker-overlay .cv-picker-edit-btn >> nth=0');
await page.click('#cv-picker-edit-menu button[data-act=edit]');
const r6 = await page.evaluate(() => ({ id: window._cvEditOpened, closed: document.getElementById('cv-picker-overlay').style.display === 'none' }));
ok('⑥ 「動画を選び直す」で今までの編集画面を開き、ピッカーを閉じる', r6.id === 'cv_1700000002000' && r6.closed, JSON.stringify(r6));

ok('JSエラーなし', !errs.filter(e => !/firebase|gstatic|googleapis|net::ERR/i.test(e)).length, errs.join(' / '));
await browser.close(); srv.close();
console.log(fail ? `\n✗ ${fail}件の失敗` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
