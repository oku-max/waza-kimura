// 「端末の動画をDriveへアップロードして取り込む」タブを、実ブラウザで通しで触る。
//
// なぜ必要か: 静的検査では「最後まで走るか」「空きが足りないときに止まるか」
// 「一度こけたあと操作不能にならないか」が一切分からない。
// 本物のファイル選択にファイルを流し込み、アップロード（偽のDriveに向ける）から
// videos への登録までを確認する。
//
// index.html を丸ごと開くと Firebase SDK（外部配信）が取れず初期化で止まるので、
// index.html から当該タブのマークアップだけを切り出した検証用ページを組み立てて開く。
// 入れ物（.overlay > .sheet）まで実物に合わせる。ここを省くとシートの高さ配分が
// 変わり、「下のボタンに届かない」類の崩れを取り逃がす（v52.743の不具合がそれ）。
//
// 使い方: node tools/gdu-smoke.mjs
// 終了コード: 0 = 通過 / 1 = 失敗

import http from 'http';
import fs from 'fs';
import os from 'os';
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
const GB   = 1024 * 1024 * 1024;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

// ── index.html から本物のマークアップを切り出す ──
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const si = indexHtml.indexOf('<div id="up-import-body"');
const ei = indexHtml.indexOf('</div><!-- /up-import-body -->');
if (si < 0 || ei < 0) {
  console.error('✗ index.html から up-import-body を切り出せませんでした（目印が変わった可能性）');
  process.exit(1);
}
const bodyHtml = indexHtml.slice(si, ei + '</div><!-- /up-import-body -->'.length)
  .replace('style="display:none"', '');

// sheet-handle は他のシートにもあるので、必ず取り込みオーバーレイの中から探す
const ovi = indexHtml.indexOf('id="yt-import-ov"');
const ti  = ovi < 0 ? -1 : indexHtml.indexOf('<div class="sheet-handle"></div>', ovi);
const tj  = ti  < 0 ? -1 : indexHtml.indexOf('<!-- YouTube UI -->', ti);
if (ti < 0 || tj < 0) {
  console.error('✗ index.html からタブ行を切り出せませんでした（目印が変わった可能性）');
  process.exit(1);
}
const headHtml = indexHtml.slice(ti, tj);

// 目印がずれて別の場所を拾っていないか。div の開閉が合わない＝拾い間違い。
for (const [name, frag] of [['タブ行', headHtml], ['本体', bodyHtml]]) {
  const open  = (frag.match(/<div[\s>]/g) || []).length;
  const close = (frag.match(/<\/div>/g) || []).length;
  if (open !== close || frag.length > 20000) {
    console.error(`✗ index.html から${name}を正しく切り出せませんでした（div ${open}/${close}, ${frag.length}文字）`);
    process.exit(1);
  }
}

const HARNESS = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/style.css">
<body>
<div class="overlay open" id="yt-import-ov">
  <div class="sheet">${headHtml}${bodyHtml}</div>
</div>
<script type="module">
  window.toast = (m) => { (window.__toasts ||= []).push(m); };
  window.switchImportTab = () => {};
  import('/js/gd-upload.js').then(() => { window.__ready = true; });
</script></body>`;

let uploadedBytes = 0;
let usedResumable = false;
let driveName     = '';   // 再開可能アップロードの開始時に送ったメタデータの name
let quotaMode     = 'ok';   // ok | full | nolimit | fail

const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  // 偽のアップロード先。流れてきたバイト数を数えて「そのまま上がった」ことを測る。
  if (p === '/__fake_session') {
    usedResumable = true;
    let n = 0;
    q.on('data', (c) => { n += c.length; });
    q.on('end', () => {
      uploadedBytes = n;
      r.writeHead(200, { 'Content-Type': 'application/json' });
      r.end(JSON.stringify({ id: 'FAKE_FILE_ID', name: 'test.mp4' }));
    });
    return;
  }
  if (p === '/' || p === '/harness.html') {
    r.writeHead(200, { 'Content-Type': 'text/html' });
    return r.end(HARNESS);
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

// テスト用の失敗 … 復帰の検査でわざと起こしているエラー（console に出るのが正しい）
const IGNORE = /net::ERR|Failed to load resource|テスト用の失敗/i;

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

// Drive のトークンは localStorage キャッシュから読まれるので、偽物を仕込めば認証画面は出ない
await ctx.addInitScript(() => {
  localStorage.setItem('gd_token_v4', JSON.stringify({ token: 'FAKE_TOKEN', ts: Date.now() }));
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'location, Location',
};
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), async (route) => {
  const req = route.request();
  const url = req.url();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });

  // 空き容量
  if (url.startsWith('https://www.googleapis.com/drive/v3/about')) {
    if (quotaMode === 'fail') return route.fulfill({ status: 500, headers: CORS, body: 'boom' });
    const q = quotaMode === 'nolimit' ? { usage: String(820 * GB) }
            : quotaMode === 'full'    ? { limit: String(15 * GB), usage: String(15 * GB - 1000) }
            :                           { limit: String(15 * GB), usage: String(2.6 * GB) };
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ storageQuota: q }) });
  }
  // フォルダ一覧
  if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ id: 'FOLDER_A', name: 'テストフォルダ' }] }) });
  }
  // 再開可能アップロードの開始
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')) {
    try { driveName = JSON.parse(route.request().postData() || '{}').name || ''; } catch {}
    return route.fulfill({ status: 200,
      headers: { ...CORS, location: `http://localhost:${PORT}/__fake_session`, 'content-type': 'application/json' },
      body: '{}' });
  }
  return route.abort();
});

const page = await ctx.newPage();
// gduPick を呼ぶ検査があるので、ファイル選択ダイアログは即座に閉じる
page.on('filechooser', (fc) => { fc.setFiles([]).catch(() => {}); });
const errors = [];
page.on('pageerror', e => { const m = String(e); if (!IGNORE.test(m)) errors.push('pageerror: ' + m); });
page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });

const fails = [];
const ok    = (label) => console.log('✓ ' + label);
const bad   = (label, d) => { const s = label + (d ? ' — ' + d : ''); fails.push(s); console.log('✗ ' + s); };
const check = (cond, label, d) => cond ? ok(label) : bad(label, d);

const seed = () => page.evaluate(() => {
  // ピッカーの候補元。v.ch しか無い動画も混ぜる（v.channel だけ見ると落ちる経路）
  window.videos = [
    { id:'x1', pt:'gdrive', ch:'Triforce',       pl:'ガードパス' },
    { id:'x2', pt:'gdrive', channel:'Triforce',  pl:'ガードパス' },
    { id:'x3', pt:'gdrive', ch:'Danaher "DLR"',  pl:'バックテイク' },
  ];
  window.__seeded = window.videos.length;
  window.__saved  = 0;
  window.saveUserData = async () => { window.__saved++; return true; };
  window.AF = () => {};
  window.fetchMissingGdThumbnails = () => {};
});

await page.goto(`http://localhost:${PORT}/harness.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true && typeof window.gduOpen === 'function',
  null, { timeout: 30000 });
ok('モジュールが読み込まれる');
await seed();

// 変換の道具を持ち込んでいないこと（持ち込むと重いし、やらないと決めた）
const mbGone = await page.evaluate(async () => {
  const r = await fetch('/js/vendor/mediabunny.min.js').catch(() => ({ ok: false }));
  return !r.ok;
});
check(mbGone, '変換ライブラリを同梱していない');

// ── 設定画面 ──
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(600);
check(await page.isVisible('#gdu-setup'), '設定画面が出る');
check((await page.textContent('#gdu-list'))?.includes('まだ動画を選んでいません'), '空のときの案内が出る');
check(await page.isDisabled('#gdu-start'), '未選択なら実行ボタンは押せない');

// ── 空き容量 ──
const quotaTxt = await page.textContent('#gdu-quota');
check(/使用中/.test(quotaTxt || ''), '空き容量を読んで出す', quotaTxt?.slice(0, 60));
check(/空き\s*12/.test(quotaTxt || ''), '空きの残量が出る', quotaTxt?.slice(0, 80));
check(/あなた自身のGoogleドライブ/.test(quotaTxt || ''), '自分のDriveだと明示する');
check((await page.locator('#gdu-quota div').count()) > 0, '容量バーが描かれる');

// ── 入口が2つあること ──
// カメラロール側は accept="video/*"（写真アプリの画面）、ファイル側は accept なし
// （ファイル一覧の画面）。どちらが開くかはOSの判断なので、指定だけを見る。
check(await page.locator('button[onclick*="gduPick(\'media\')"]').count() === 1, 'カメラロールの入口がある');
check(await page.locator('button[onclick*="gduPick(\'files\')"]').count() === 1, 'ファイルの入口がある');
await page.evaluate(() => window.gduPick('media'));
await page.waitForTimeout(250);
check(await page.getAttribute('#gdu-file-input', 'accept') === 'video/*',
  'カメラロール側はメディアとして開く', String(await page.getAttribute('#gdu-file-input', 'accept')));
await page.evaluate(() => window.gduPick('files'));
await page.waitForTimeout(250);
check((await page.getAttribute('#gdu-file-input', 'accept')) === null,
  'ファイル側は種類を絞らずに開く', String(await page.getAttribute('#gdu-file-input', 'accept')));

// ── フォルダピッカー ──
await page.evaluate(() => window.gduOpenFolder());
await page.waitForTimeout(800);
check(await page.isVisible('#gdu-folderpick'), 'フォルダピッカーが開く');
check((await page.textContent('#gdu-fp-list'))?.includes('テストフォルダ'), 'フォルダ一覧が描画される');
await page.evaluate(() => window.gduFolderEnter('FOLDER_A', 'テストフォルダ'));
await page.waitForTimeout(600);
check((await page.textContent('#gdu-fp-crumbs'))?.includes('テストフォルダ'), 'フォルダに入れる');
await page.click('#gdu-fp-choose');
await page.waitForTimeout(300);
check((await page.textContent('#gdu-dest'))?.includes('テストフォルダ'), '保存先が決まる');

// ── ファイルを選ぶ ──
// 中身は動画でなくてよい。変換しないので、選んだものがそのまま送られるだけ。
const srcBuf = Buffer.alloc(1_234_567, 7);
const tmp = path.join(os.tmpdir(), 'wk-gdu-test.mp4');
fs.writeFileSync(tmp, srcBuf);

await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(1200);
check((await page.inputValue('#gdu-list input.gdu-nm'))?.includes('wk-gdu-test'), '選んだファイルが一覧に出る');
check(/\+1\.2MB/.test(await page.textContent('#gdu-quota') || ''), 'ふえる分が出る',
  (await page.textContent('#gdu-quota'))?.slice(0, 60));
check(!(await page.isDisabled('#gdu-start')), '保存先とファイルが揃うと実行できる');

await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(600);
check(await page.locator('#gdu-list .gdp-row').count() === 1, '同じファイルは二重に選ばれない');

// 動画でないものは一覧に入れない
const notVideo = path.join(os.tmpdir(), 'wk-gdu-note.txt');
fs.writeFileSync(notVideo, 'これは動画ではありません');
await page.evaluate(() => { window.__toasts = []; });
await page.setInputFiles('#gdu-file-input', notVideo);
await page.waitForTimeout(600);
check(await page.locator('#gdu-list .gdp-row').count() === 1, '動画でないファイルは一覧に入らない');
check(/動画ではないので外しました/.test((await page.evaluate(() => (window.__toasts||[]).join('|')))),
  '外した理由を伝える');
try { fs.unlinkSync(notVideo); } catch {}

// ── 名前をその場で直せること ──
check(await page.locator('#gdu-list input.gdu-nm').count() === 1, 'タイトルは入力欄になっている');
check(await page.isVisible('#gdu-namehint'), '直せることを画面で伝える');
check(await page.inputValue('#gdu-list input.gdu-nm') === 'wk-gdu-test',
  '拡張子を外した名前が最初から入っている', await page.inputValue('#gdu-list input.gdu-nm'));
await page.fill('#gdu-list input.gdu-nm', '6/12 スパー 3R目');
await page.waitForTimeout(150);
// 一覧が描き直されても、打った名前が飛ばないこと。
// （尺は選んだ後から入ってきて描き直しが走るので、ここで消えると名前が打てない）
await page.setInputFiles('#gdu-file-input', tmp);   // 重複なので行数は変わらない＝描き直しの経路
await page.waitForTimeout(600);
check(await page.inputValue('#gdu-list input.gdu-nm') === '6/12 スパー 3R目',
  '描き直しても打った名前が残る', await page.inputValue('#gdu-list input.gdu-nm'));

// 崩れは数字では見えない。見たいときは GDU_SHOT=<出力先.png> を付けて走らせる。
if (process.env.GDU_SHOT) {
  await page.screenshot({ path: process.env.GDU_SHOT, fullPage: true });
  console.log('  （画面を書き出しました: ' + process.env.GDU_SHOT + '）');
}

// ── スマホ幅で操作しきれること ──
await page.evaluate(() => document.getElementById('gdu-optshd').click());   // 任意欄を開いて縦を伸ばす
await page.waitForTimeout(250);
const layout = await page.evaluate(() => {
  const btn = document.getElementById('gdu-start').getBoundingClientRect();
  const sc  = document.querySelector('.gdu-scroll');
  const before = sc ? sc.scrollTop : -1;
  if (sc) sc.scrollTop = 9999;
  return {
    btnVisible: btn.height > 0 && btn.top >= 0 && btn.bottom <= innerHeight,
    btnBottom: Math.round(btn.bottom), vh: innerHeight,
    hasScroller: !!sc, overflowY: sc ? getComputedStyle(sc).overflowY : null,
    overflows: sc ? sc.scrollHeight > sc.clientHeight + 1 : false,
    scrolled: sc ? sc.scrollTop > before : false,
  };
});
check(layout.hasScroller && layout.overflowY === 'auto', 'スクロール領域がある', String(layout.overflowY));
check(layout.btnVisible, '実行ボタンが画面内にある（下端で切れない）', `bottom=${layout.btnBottom} / vh=${layout.vh}`);
if (layout.overflows) check(layout.scrolled, '中身がはみ出したら実際にスクロールできる');

// ── 既存のチャンネル名／プレイリスト名を選べること ──
for (const [kind, inputId, ddId, listId, want] of [
  ['ch', 'gdu-channel',  'gdu-ch-dd', 'gdu-ch-ddlist', 'Triforce'],
  ['pl', 'gdu-playlist', 'gdu-pl-dd', 'gdu-pl-ddlist', 'ガードパス'],
]) {
  await page.evaluate((k) => window.gduDdOpen(k), kind);
  await page.waitForTimeout(300);
  check(await page.isVisible('#' + ddId), `${kind}: 既存の一覧が開く`);
  const clip = await page.evaluate((id) => {
    const d = document.getElementById(id).getBoundingClientRect();
    const sc = document.querySelector('.gdu-scroll').getBoundingClientRect();
    return Math.round(d.bottom - sc.bottom);
  }, ddId);
  check(clip <= 1, `${kind}: 一覧が見切れず全部見える`, `はみ出し ${clip}px`);
  const txt = await page.textContent('#' + listId);
  check((await page.locator(`#${listId} .vp-dd-item`).count()) === 2, `${kind}: 候補が重複なしで出る`);
  check(txt.includes(want), `${kind}: 既存の名前が出る`, txt?.slice(0, 60));
  if (kind === 'ch') check(/Triforce\s*2本/.test(txt), 'ch: v.ch と v.channel を両方数える', txt?.slice(0, 60));
  await page.locator(`#${listId} .vp-dd-item`).first().click();
  await page.waitForTimeout(250);
  check(!!(await page.inputValue('#' + inputId)), `${kind}: 選ぶと入力欄に入る`);
  check(!(await page.isVisible('#' + ddId)), `${kind}: 選ぶと閉じる`);
}
// 引用符を含む名前でも壊れないこと（onclick に値を埋め込んでいると壊れる）
await page.evaluate(() => window.gduDdOpen('ch'));
await page.waitForTimeout(250);
await page.fill('#gdu-ch-search', 'Danaher');
await page.waitForTimeout(250);
await page.locator('#gdu-ch-ddlist .vp-dd-item').first().click();
await page.waitForTimeout(250);
check(await page.inputValue('#gdu-channel') === 'Danaher "DLR"', '引用符入りの名前も選べる',
  await page.inputValue('#gdu-channel'));
await page.evaluate(() => { document.getElementById('gdu-channel').value = '';
                            document.getElementById('gdu-playlist').value = ''; });

// ── 通しで実行 ──
await page.evaluate(() => window.gduStart());
await page.waitForFunction(() => /登録しました/.test(document.getElementById('gdu-runsum')?.textContent || ''),
  null, { timeout: 60000 });
check((await page.textContent('#gdu-runsum'))?.trim() === '1本を登録しました', '1本が登録される',
  (await page.textContent('#gdu-runsum'))?.trim());

const reg = await page.evaluate(() => ({ n: window.videos.length, seeded: window.__seeded,
  v: window.videos[window.videos.length - 1], saved: window.__saved }));
check(reg.n === reg.seeded + 1,        'videos に1件だけ追加される', `n=${reg.n}（種 ${reg.seeded}）`);
check(reg.v?.id === 'gd-FAKE_FILE_ID', 'idが gd-<fileId> になる', reg.v?.id);
check(reg.v?.pt === 'gdrive',          'pt が gdrive になる', reg.v?.pt);
check(reg.v?.archived === false && reg.v?.status === '未着手', '既定値が入る');
check(reg.v?.title === '6/12 スパー 3R目', '直した名前がライブラリのタイトルになる', reg.v?.title);
check(driveName === '6/12 スパー 3R目.mp4', '直した名前がDrive上のファイル名にもなる（拡張子は残す）', driveName);
check(reg.v?.pl === 'テストフォルダ', 'プレイリスト名が空欄なら保存先フォルダ名が入る', reg.v?.pl);
check(reg.saved === 1,                 '保存が1回だけ呼ばれる', String(reg.saved));
check(usedResumable,                   '再開可能アップロードのセッションURLを使う');
console.log(`  （元 ${srcBuf.length}B → アップロード ${uploadedBytes}B）`);
check(uploadedBytes === srcBuf.length, '変換せず元のサイズのまま上がる',
  `${srcBuf.length} → ${uploadedBytes}`);

await page.evaluate(() => window.gduBackToSetup());
await page.waitForTimeout(300);
check(await page.isVisible('#gdu-setup'), '実行後に設定画面へ戻れる');
check((await page.textContent('#gdu-list'))?.includes('まだ動画を選んでいません'), '成功したファイルは一覧から消える');

// ── 空きが足りないとき: 押させない ──
quotaMode = 'full';
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(700);
await page.evaluate(() => window.gduOpenFolder());
await page.waitForTimeout(700);
await page.click('#gdu-fp-choose');
await page.waitForTimeout(300);
await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(1000);
check(await page.isDisabled('#gdu-start'), '空きが足りなければ実行させない');
check(/空きが.*足りません/.test(await page.textContent('#gdu-quota') || ''), '足りない理由を出す',
  (await page.textContent('#gdu-quota'))?.slice(0, 70));

// ── 容量が取れないとき: 止めない ──
quotaMode = 'fail';
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(700);
await page.evaluate(() => window.gduOpenFolder());
await page.waitForTimeout(700);
await page.click('#gdu-fp-choose');
await page.waitForTimeout(300);
await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(1000);
check(/確認できませんでした/.test(await page.textContent('#gdu-quota') || ''), '容量が取れないことを正直に出す');
check(!(await page.isDisabled('#gdu-start')), '容量が取れなくても取り込みは止めない');

// ── 上限のないアカウント ──
quotaMode = 'nolimit';
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(700);
check(/上限なし/.test(await page.textContent('#gdu-quota') || ''), '上限のないアカウントでも壊れない',
  (await page.textContent('#gdu-quota'))?.slice(0, 60));

// ── 途中で失敗しても操作不能にならないこと ──
// 以前は取り込み中フラグを解除し損ねる経路があり、一度こけると全ボタンが永久に無反応になった。
quotaMode = 'ok';
await seed();
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(700);
await page.evaluate(() => window.gduOpenFolder());
await page.waitForTimeout(700);
await page.click('#gdu-fp-choose');
await page.waitForTimeout(300);
await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(1000);
await page.evaluate(() => { window.saveUserData = async () => { throw new Error('テスト用の失敗'); }; });
await page.evaluate(() => window.gduStart());
await page.waitForFunction(() => /中断しました/.test(document.getElementById('gdu-runsum')?.textContent || ''),
  null, { timeout: 60000 });
check(/^取り込みを中断しました: /.test((await page.textContent('#gdu-runsum'))?.trim() || ''),
  '失敗した理由が画面に出る', (await page.textContent('#gdu-runsum'))?.trim());

await page.evaluate(() => window.gduBackToSetup());
await page.waitForTimeout(300);
check(await page.isVisible('#gdu-setup'), '失敗後でも設定画面に戻れる');
await page.evaluate(() => window.gduPick('files'));
await page.waitForTimeout(300);
check(await page.locator('#gdu-file-input').count() === 1, '失敗後でもファイル選択を開き直せる');

await page.evaluate(() => { document.getElementById('gdu-run').style.display = 'flex'; window.gduAbort(); });
await page.waitForTimeout(3600);
await page.evaluate(() => window.gduBackToSetup());
await page.waitForTimeout(300);
check(await page.isVisible('#gdu-setup'), '中止したあとも設定画面に戻れる');

try { fs.unlinkSync(tmp); } catch {}
await browser.close();
srv.close();

const uniq = [...new Set(errors)];
console.log(uniq.length ? '\n想定外のJSエラー:\n  ' + uniq.join('\n  ') : '\n✓ 想定外のJSエラーなし');

if (fails.length || uniq.length) {
  console.log('\n✗ 端末アップロードのスモークテスト失敗');
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('\n✓ 端末アップロードのスモークテスト通過');
