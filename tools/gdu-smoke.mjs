// 「端末の動画をDriveへアップロードして取り込む」タブを、実ブラウザで通しで触る。
//
// なぜ必要か: この機能は WebCodecs による実変換と Drive へのアップロードが本体で、
// 静的検査では「変換設定が実際に通るか」「進捗と登録が最後まで走るか」が一切分からない。
// mediabunny でテスト用のMP4をその場で作り、それを本物のファイル選択に流し込んで、
// 変換 → アップロード（偽のDriveに向ける）→ videos への登録 まで確認する。
//
// index.html を丸ごと開くと Firebase SDK（外部配信）が取れず初期化で止まるので、
// index.html から当該タブのマークアップだけを切り出した検証用ページを組み立てて開く。
// 切り出しに失敗する＝マークアップの目印が変わったということなので、それ自体が検知になる。
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
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

// ── index.html から本物のマークアップを切り出す ──
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const START = '<div id="up-import-body"';
const END   = '</div><!-- /up-import-body -->';
const si = indexHtml.indexOf(START);
const ei = indexHtml.indexOf(END);
if (si < 0 || ei < 0) {
  console.error('✗ index.html から up-import-body を切り出せませんでした（目印が変わった可能性）');
  process.exit(1);
}
const bodyHtml = indexHtml.slice(si, ei + END.length).replace('style="display:none"', '');

// タブ行も実物から切り出す。ここまで含めないと、シートの高さ配分が実機と変わって
// 「下のボタンに届かない」類のレイアウト崩れを取り逃がす（v52.743の不具合がそれ）。
// sheet-handle は他のシートにもあるので、必ず取り込みオーバーレイの中から探す
const TS = '<div class="sheet-handle"></div>';
const TE = '<!-- YouTube UI -->';
const ovi = indexHtml.indexOf('id="yt-import-ov"');
const ti = ovi < 0 ? -1 : indexHtml.indexOf(TS, ovi);
const tj = ti  < 0 ? -1 : indexHtml.indexOf(TE, ti);
if (ti < 0 || tj < 0) {
  console.error('✗ index.html からタブ行を切り出せませんでした（目印が変わった可能性）');
  process.exit(1);
}
const headHtml = indexHtml.slice(ti, tj);
// 目印がずれて別の場所を拾っていないか。div の開閉が合わない＝拾い間違い。
for (const [name, frag] of [['タブ行', headHtml], ['本体', bodyHtml]]) {
  const open = (frag.match(/<div[\s>]/g) || []).length;
  const close = (frag.match(/<\/div>/g) || []).length;
  if (open !== close || frag.length > 20000) {
    console.error(`✗ index.html から${name}を正しく切り出せませんでした（div ${open}/${close}, ${frag.length}文字）`);
    process.exit(1);
  }
}

// 実機と同じ入れ物に入れる。#yt-import-ov .sheet は overflow:hidden なので、
// タブ側が自前でスクロール領域を持っていないと操作不能になる。
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

const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  // 偽のアップロード先。実際に流れてきたバイト数を数えて、変換が効いたかを測る。
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

const IGNORE = /net::ERR|Failed to load resource/i;

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

// Drive のトークンは localStorage キャッシュから読まれるので、偽物を仕込めば認証画面は出ない
await ctx.addInitScript(() => {
  localStorage.setItem('gd_token_v4', JSON.stringify({ token: 'FAKE_TOKEN', ts: Date.now() }));
});

// 外部はすべて遮断。ただし Drive API だけは偽の応答を返す。
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

  if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ id: 'FOLDER_A', name: 'テストフォルダ' }] }) });
  }
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')) {
    return route.fulfill({ status: 200,
      headers: { ...CORS, location: `http://localhost:${PORT}/__fake_session`, 'content-type': 'application/json' },
      body: '{}' });
  }
  return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => { const m = String(e); if (!IGNORE.test(m)) errors.push('pageerror: ' + m); });
page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });

const fails = [];
const ok    = (label) => console.log('✓ ' + label);
const bad   = (label, d) => { const s = label + (d ? ' — ' + d : ''); fails.push(s); console.log('✗ ' + s); };
const check = (cond, label, d) => cond ? ok(label) : bad(label, d);

await page.goto(`http://localhost:${PORT}/harness.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true && typeof window.gduOpen === 'function',
  null, { timeout: 30000 });
ok('モジュールが読み込まれる');

await page.evaluate(() => {
  // ピッカーの候補元。v.ch しか無い動画も混ぜる（v.channel だけ見ると落ちる経路）
  window.videos = [
    { id:'x1', pt:'gdrive', ch:'Triforce',  pl:'ガードパス' },
    { id:'x2', pt:'gdrive', channel:'Triforce', pl:'ガードパス' },
    { id:'x3', pt:'gdrive', ch:'Danaher "DLR"', pl:'バックテイク' },
  ];
  window.__seeded = window.videos.length;
  window.__saved = 0;
  window.saveUserData = async () => { window.__saved++; return true; };
  window.AF = () => {};
  window.fetchMissingGdThumbnails = () => {};
});

// ── 設定画面 ──
await page.evaluate(() => window.gduOpen());
await page.waitForTimeout(400);
check(await page.isVisible('#gdu-setup'), '設定画面が出る');
check((await page.textContent('#gdu-list'))?.includes('まだ動画を選んでいません'), '空のときの案内が出る');
check(await page.isDisabled('#gdu-start'), '未選択なら実行ボタンは押せない');

const qCount = await page.locator('#gdu-quality input[type=radio]').count();
check(qCount === 4, '画質プリセットが4つ出る', `count=${qCount}`);

const canEnc = await page.evaluate(async () => {
  const MB = await import('/js/vendor/mediabunny.min.js');
  return await MB.canEncodeVideo('avc', { width: 1280, height: 720 });
});
console.log('  （この環境の H.264 エンコード可否: ' + canEnc + '）');

// ── フォルダピッカー ──
await page.evaluate(() => window.gduOpenFolder());
await page.waitForTimeout(800);
check(await page.isVisible('#gdu-folderpick'), 'フォルダピッカーが開く');
check((await page.textContent('#gdu-fp-list'))?.includes('テストフォルダ'), 'フォルダ一覧が描画される');
await page.evaluate(() => window.gduFolderEnter('FOLDER_A', 'テストフォルダ'));
await page.waitForTimeout(600);
check((await page.textContent('#gdu-fp-crumbs'))?.includes('テストフォルダ'), 'フォルダに入れる');
await page.click('#gdu-fp-choose');
await page.waitForTimeout(200);
check((await page.textContent('#gdu-dest'))?.includes('テストフォルダ'), '保存先が決まる');

// ── テスト用のMP4を作ってファイル選択に流し込む ──
// この環境で encode できる映像/音声コーデックを拾う。
// 素の headless Chromium は H.264 を持たないことがあるので、素材は使えるコーデックで作る。
const codecs = await page.evaluate(async () => {
  const MB = await import('/js/vendor/mediabunny.min.js');
  return {
    video: await MB.getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], { width: 1280, height: 720 }),
    audio: await MB.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 1, sampleRate: 48000 }),
  };
});
console.log(`  （素材に使うコーデック: video=${codecs.video} / audio=${codecs.audio}）`);
if (!codecs.video) {
  console.error('✗ この環境ではどの映像コーデックも encode できないため、テストを続けられません');
  process.exit(2);
}

const b64 = await page.evaluate(async ({ vcodec, acodec }) => {
  const MB = await import('/js/vendor/mediabunny.min.js');
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const c = canvas.getContext('2d');
  const out = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new MB.BufferTarget(),
  });
  const src = new MB.CanvasSource(canvas, { codec: vcodec, bitrate: new MB.Quality({ bitrate: 8_000_000 }) });
  out.addVideoTrack(src);

  // 音声も入れる。音声トラックの扱い（落ちたら変換をやめる判定）を実物で確かめたい。
  let asrc = null;
  if (acodec) {
    asrc = new MB.AudioBufferSource({ codec: acodec, bitrate: new MB.Quality({ bitrate: 128_000 }) });
    out.addAudioTrack(asrc);
  }

  await out.start();
  if (asrc) {
    const actx = new OfflineAudioContext(1, 48000 * 2, 48000);
    const buf = actx.createBuffer(1, 48000 * 2, 48000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.sin(i * 0.05) * 0.2;
    await asrc.add(buf);
  }
  for (let i = 0; i < 60; i++) {                     // 2秒 @30fps
    c.fillStyle = `hsl(${(i * 6) % 360},80%,50%)`;
    c.fillRect(0, 0, 1280, 720);
    c.fillStyle = '#000';
    c.fillRect((i * 19) % 1180, 280, 100, 100);      // 動きを入れて圧縮が効くか見る
    await src.add(i / 30, 1 / 30);
  }
  if (asrc) asrc.close();
  await out.finalize();
  const bytes = new Uint8Array(out.target.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, { vcodec: codecs.video, acodec: codecs.audio });
const srcBuf = Buffer.from(b64, 'base64');
check(srcBuf.length > 1000, 'テスト用MP4を生成できる', `${srcBuf.length}B`);
const tmp = path.join(os.tmpdir(), 'wk-gdu-test.mp4');
fs.writeFileSync(tmp, srcBuf);

await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(2000);
check((await page.textContent('#gdu-list'))?.includes('wk-gdu-test'), '選んだファイルが一覧に出る');
check(!(await page.isDisabled('#gdu-start')), '保存先とファイルが揃うと実行できる');

// 同じファイルをもう一度選んでも増えない
await page.setInputFiles('#gdu-file-input', tmp);
await page.waitForTimeout(800);
const rows = await page.locator('#gdu-list .gdp-row').count();
check(rows === 1, '同じファイルは二重に選ばれない', `rows=${rows}`);

// ── レイアウト（スマホ幅で操作しきれるか）──
// 中身が縦に伸びた状態で、実行ボタンに届くか・スクロールできるかを見る。
// v52.743 はここが崩れて「途中で進めない・スクロールも効かない」状態だった。
await page.evaluate(() => document.getElementById('gdu-optshd').click());   // 任意欄を開いて縦を伸ばす
await page.waitForTimeout(200);
const layout = await page.evaluate(() => {
  const btn = document.getElementById('gdu-start').getBoundingClientRect();
  const sc  = document.querySelector('.gdu-scroll');
  const before = sc ? sc.scrollTop : -1;
  if (sc) sc.scrollTop = 9999;
  return {
    btnVisible: btn.height > 0 && btn.top >= 0 && btn.bottom <= innerHeight,
    btnBottom: Math.round(btn.bottom), viewportH: innerHeight,
    hasScroller: !!sc,
    overflowY: sc ? getComputedStyle(sc).overflowY : null,
    overflows: sc ? sc.scrollHeight > sc.clientHeight + 1 : false,
    scrolled: sc ? sc.scrollTop > before : false,
  };
});
check(layout.hasScroller, 'スクロール領域がある');
check(layout.overflowY === 'auto', 'スクロール領域が auto になっている', String(layout.overflowY));
check(layout.btnVisible, '実行ボタンが画面内にある（下端で切れない）',
  `bottom=${layout.btnBottom} / viewport=${layout.viewportH}`);
if (layout.overflows) check(layout.scrolled, '中身がはみ出したときに実際にスクロールできる');

// ── 既存のチャンネル名／プレイリスト名を選べること ──
for (const [kind, inputId, ddId, listId, want] of [
  ['ch', 'gdu-channel',  'gdu-ch-dd', 'gdu-ch-ddlist', 'Triforce'],
  ['pl', 'gdu-playlist', 'gdu-pl-dd', 'gdu-pl-ddlist', 'ガードパス'],
]) {
  await page.evaluate((k) => window.gduDdOpen(k), kind);
  await page.waitForTimeout(250);
  check(await page.isVisible('#' + ddId), `${kind}: 既存の一覧が開く`);
  // スクロール領域からはみ出したままだと、下の候補を選べない
  const clip = await page.evaluate((id) => {
    const d = document.getElementById(id).getBoundingClientRect();
    const sc = document.querySelector('.gdu-scroll').getBoundingClientRect();
    return { over: Math.round(d.bottom - sc.bottom), h: Math.round(d.height) };
  }, ddId);
  check(clip.over <= 1, `${kind}: 一覧が見切れず全部見える`, `はみ出し ${clip.over}px / 高さ ${clip.h}px`);
  const rows = await page.locator(`#${listId} .vp-dd-item`).count();
  check(rows === 2, `${kind}: 候補が重複なしで出る`, `rows=${rows}`);
  // 「Triforce 2本」— v.ch と v.channel の両方を数えられているか
  const txt = await page.textContent('#' + listId);
  check(txt.includes(want), `${kind}: 既存の名前が出る`, txt?.slice(0, 60));
  if (kind === 'ch') check(/Triforce\s*2本/.test(txt), 'ch: v.ch と v.channel を両方数える', txt?.slice(0, 60));

  await page.locator(`#${listId} .vp-dd-item`).first().click();
  await page.waitForTimeout(200);
  const val = await page.inputValue('#' + inputId);
  check(!!val, `${kind}: 選ぶと入力欄に入る`, val);
  check(!(await page.isVisible('#' + ddId)), `${kind}: 選ぶと閉じる`);
}
// 引用符を含む名前でも壊れないこと（onclick に値を埋め込んでいると壊れる）
await page.evaluate(() => window.gduDdOpen('ch'));
await page.waitForTimeout(200);
await page.fill('#gdu-ch-search', 'Danaher');
await page.waitForTimeout(200);
await page.locator('#gdu-ch-ddlist .vp-dd-item').first().click();
await page.waitForTimeout(200);
check(await page.inputValue('#gdu-channel') === 'Danaher "DLR"', '引用符入りの名前も選べる',
  await page.inputValue('#gdu-channel'));
// 取り込み本体の検査に影響しないよう、入力は空に戻す
await page.evaluate(() => { document.getElementById('gdu-channel').value = '';
                            document.getElementById('gdu-playlist').value = ''; });

// 保存先フォルダの選択画面と進捗画面でも、下のボタンに届くこと
for (const [stage, fn, btnId, label] of [
  ['fp',  () => window.gduOpenFolder(),  'gdu-fp-choose', 'フォルダ選択画面'],
  ['run', () => { document.getElementById('gdu-folderpick').style.display = 'none';
                  document.getElementById('gdu-run').style.display = 'flex'; }, 'gdu-abort', '進捗画面'],
]) {
  await page.evaluate(fn);
  await page.waitForTimeout(500);
  const v = await page.evaluate((id) => { const b = document.getElementById(id).getBoundingClientRect();
    return { ok: b.height > 0 && b.top >= 0 && b.bottom <= innerHeight, bottom: Math.round(b.bottom), vh: innerHeight }; }, btnId);
  check(v.ok, `${label}のボタンが画面内にある`, `bottom=${v.bottom} / viewport=${v.vh}`);
}
// 設定画面に戻してから続ける
await page.evaluate(() => { document.getElementById('gdu-run').style.display = 'none';
                            document.getElementById('gdu-setup').style.display = 'flex'; });
await page.waitForTimeout(200);

// ── 軽量プリセットで通しで実行 ──
await page.evaluate(() => window.gduSetQ('low'));
await page.waitForTimeout(200);
await page.evaluate(() => window.gduStart());
await page.waitForFunction(() => /登録しました/.test(document.getElementById('gdu-runsum')?.textContent || ''),
  null, { timeout: 180000 });

const sum = (await page.textContent('#gdu-runsum'))?.trim();
check(sum === '1本を登録しました', '1本が登録される', sum);

const reg = await page.evaluate(() => ({ n: window.videos.length, seeded: window.__seeded,
  v: window.videos[window.videos.length - 1], saved: window.__saved }));
check(reg.n === reg.seeded + 1,        'videos に1件だけ追加される', `n=${reg.n} (種 ${reg.seeded})`);
check(reg.v?.id === 'gd-FAKE_FILE_ID', 'idが gd-<fileId> になる', reg.v?.id);
check(reg.v?.pt === 'gdrive',          'pt が gdrive になる', reg.v?.pt);
check(reg.v?.duration > 0,             '再生時間が入る', String(reg.v?.duration));
check(reg.v?.archived === false && reg.v?.status === '未着手', '既定値が入る');
check(reg.saved === 1,                 '保存が1回だけ呼ばれる', String(reg.saved));
check(usedResumable,                   '再開可能アップロードのセッションURLを使う');

console.log(`  （元 ${srcBuf.length}B → アップロード ${uploadedBytes}B）`);
if (canEnc) {
  check(uploadedBytes > 0 && uploadedBytes < srcBuf.length, '480pに変換されて小さくなる',
    `${srcBuf.length} → ${uploadedBytes}`);
} else {
  // H.264 を持たない環境（このheadless Chromiumなど）は、変換せず元のまま上げるのが正しい挙動
  check(uploadedBytes === srcBuf.length, 'H.264非対応の環境では変換せず元のまま上がる',
    `${srcBuf.length} → ${uploadedBytes}`);
}

// ── 変換設定そのものの検証 ──
// 本番は H.264 固定だが、この環境にH.264が無いときでも「gd-upload.js が組み立てるのと
// 同じ形のオプション」が mediabunny に通ることは確かめられる。縮小・フレームレート・
// 音声トラックの引き継ぎまで、実際に変換して結果を見る。
const conv = await page.evaluate(async ({ b64, vcodec, acodec }) => {
  const MB = await import('/js/vendor/mediabunny.min.js');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const file = new File([buf], 'src.mp4', { type: 'video/mp4' });

  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const vt = await input.getPrimaryVideoTrack();
  const dw = await vt.getDisplayWidth(), dh = await vt.getDisplayHeight();
  const short = Math.min(dw, dh);
  const scale = short > 480 ? 480 / short : 1;
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);

  const output = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new MB.BufferTarget(),
  });
  const c = await MB.Conversion.init({
    input, output,
    video: {
      codec: vcodec,
      quality: new MB.Quality({ bitrate: 1_000_000 }),
      forceTranscode: true,
      width: even(dw * scale), height: even(dh * scale), fit: 'fill',
      frameRate: 30,
    },
    audio: acodec ? { codec: acodec, quality: new MB.Quality({ bitrate: 128_000 }) } : undefined,
    showWarnings: false,
  });
  if (!c.isValid) return { valid: false, discarded: c.discardedTracks.map(d => d.reason) };
  let lastProgress = -1;
  c.onProgress = (p) => { lastProgress = p; };
  await c.execute();

  const outBlob = new Blob([output.target.buffer], { type: 'video/mp4' });
  const check = new MB.Input({ source: new MB.BlobSource(outBlob), formats: MB.ALL_FORMATS });
  const ov = await check.getPrimaryVideoTrack();
  return {
    valid: true,
    hadAudioIn:  !!(await input.getPrimaryAudioTrack()),
    keptAudio:   c.utilizedTracks.some(t => t.isAudioTrack?.() || t.type === 'audio'),
    w: await ov.getDisplayWidth(), h: await ov.getDisplayHeight(),
    inSize: file.size, outSize: outBlob.size,
    lastProgress,
  };
}, { b64, vcodec: codecs.video, acodec: codecs.audio });

check(conv.valid, '変換オプションの組み立てが通る', JSON.stringify(conv));
if (conv.valid) {
  check(conv.h === 480, '短辺が480pに縮む', `${conv.w}x${conv.h}`);
  check(conv.w % 2 === 0 && conv.h % 2 === 0, '縦横が偶数になる', `${conv.w}x${conv.h}`);
  check(conv.outSize < conv.inSize, '変換で小さくなる', `${conv.inSize} → ${conv.outSize}`);
  check(conv.lastProgress > 0, '進捗コールバックが呼ばれる', String(conv.lastProgress));
  if (conv.hadAudioIn) {
    // gd-upload.js はここが false なら「音声が落ちる」とみなして変換を中止する。
    // 判定式が誤っていると音のある動画が一切圧縮されなくなるので、実物で確かめる。
    check(conv.keptAudio, '音声トラックの引き継ぎ判定が効く');
  }
}

// ── 実行後 ──
await page.evaluate(() => window.gduBackToSetup());
await page.waitForTimeout(200);
check(await page.isVisible('#gdu-setup'), '実行後に設定画面へ戻れる');
check((await page.textContent('#gdu-list'))?.includes('まだ動画を選んでいません'), '成功したファイルは一覧から消える');

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
