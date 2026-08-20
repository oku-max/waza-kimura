// Journal（つぶやき）機能を実ブラウザで触って、壊れていないかを見る。
//
// 特に確認したいのは「データが安全な結果になるか」（CLAUDE.md ルール1）:
//   - クラウド未確定のうちは保存しない
//   - 非空 → 空 の上書きをしない
//   - ログアウトで保存が走らない
//
// 使い方: node tools/murmurs-smoke.mjs
// 終了コード: 0 = 全部通過 / 1 = 失敗あり

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
const PORT = 8138;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const IGNORE = /firebase|gstatic|googleapis|accounts\.google|gsi\/client|net::ERR|Failed to load resource/i;

// 検証用の最小ページ。
// murmurs.js は import を持たず window 越しにしか外と繋がらないので、
// Firebase SDK（外部・この環境では取得不可）抜きで本番のコードをそのまま動かせる。
const HARNESS = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/murmurs.css">
</head><body>
<div class="topbar"><div class="tb-row-logo"><div class="tb-logo">WAZA KIMURA</div>
  <button id="acct-btn">👤</button></div></div>
<div class="tab-panel active" id="murmursTab"></div>
<div class="vpanel" id="vpanel"><div class="vpanel-inner">video</div></div>
<div id="toast"></div>
<script src="/js/tag-master.js"><\/script>
<script>
  window.toast = m => { (window.__toasts ||= []).push(m); };
  window.toastUndo = (m, fn) => { (window.__toasts ||= []).push(m); window.__undo = fn; };
  window.videos = [];
<\/script>
<script type="module">
  import { renderMurmurs, openComposer } from '/js/murmurs.js';
  window.renderMurmurs = renderMurmurs;
  window.openMurmurComposer = openComposer;
  window.switchTab = () => renderMurmurs();
  renderMurmurs();
  window.__ready = true;
<\/script>
</body></html>`;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') {
    r.writeHead(200, { 'Content-Type': 'text/html' });
    return r.end(HARNESS);
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });

// 動画を撒く（サジェスト検証用）
await page.evaluate(() => {
  window.videos = [
    { id:'v1', title:'シザースイープを潰す3つの対処', pos:[], cat:['パスガード'], tb:[], tags:[], playCount:1, addedAt:'2026-02-01T00:00:00.000Z' },
    { id:'v2', title:'決まる条件', pos:['クローズドガード'], cat:['スイープ'], tb:[], tags:['シザースイープ'], playCount:0, addedAt:'2024-08-01T00:00:00.000Z' },
    { id:'v3', title:'デラヒーバ 崩しの原理', pos:['デラヒーバ'], cat:[], tb:[], tags:[], playCount:0, addedAt:'2024-01-01T00:00:00.000Z' },
    { id:'v4', title:'アームバー ディテール集', pos:[], cat:['フィニッシュ'], tb:[], tags:[], playCount:9, addedAt:'2026-07-01T00:00:00.000Z' },
  ];
  window._murmursResetVocab?.();
});

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

// ── タブが出る ──
await page.evaluate(() => window.renderMurmurs());
await page.waitForTimeout(300);
check('一覧が描画される', await page.locator('#murmursTab .mm-wrap').count() === 1);
check('空の案内が出る', await page.locator('#murmursTab .mm-empty').count() === 1);
check('常駐ボタンが出る', await page.locator('#mm-fab').isVisible());
check('記号が単色SVG（絵文字ではない）', await page.locator('#mm-fab svg').count() === 1);
check('ボタンに文字ラベルが無い',
  ((await page.locator('#mm-fab').textContent()) || '').trim() === '');

// ── N キーで開く ──
await page.locator('body').click({ position: { x: 550, y: 400 } });
await page.keyboard.press('n');
await page.waitForTimeout(250);
check('N キーでコンポーザが開く', await page.locator('#mm-composer.open').count() === 1);
check('入力欄の案内文が「気になることをメモ」',
  await page.locator('#mm-cp-text').getAttribute('placeholder') === '気になることをメモ');
check('見出し脇に説明文を置かない',
  ((await page.locator('#mm-cp-sub').textContent()) || '').trim() === '');

// ── 本文からタグ検出＋関連動画 ──
await page.locator('#mm-cp-text').fill('シザースイープ食らいまくった。腰が高いのかも');
await page.waitForTimeout(250);
const chips = await page.locator('#mm-cp-det .mm-det-chip').allTextContents();
check('本文からタグを検出する', chips.some(c => c.includes('シザースイープ')), chips.join(','));
check('「スイープ」は出さない（長い語を優先）',
  !chips.some(c => c.trim().replace(/[#×]/g,'') === 'スイープ'), chips.join(','));
const relLbl = await page.locator('#mm-det-vids').textContent().catch(() => '');
check('関連動画の本数が出る', /関連動画 2本/.test(relLbl || ''), relLbl);

// ── 関連動画は埋もれた順 ──
await page.locator('#mm-det-vids').click();
await page.waitForTimeout(250);
const relTitles = await page.locator('#mm-mbd .mm-rel-t').allTextContents();
check('未再生のものが先頭に来る', relTitles[0] === '決まる条件', relTitles.join(' / '));
await page.locator('#mm-mx').click();
await page.waitForTimeout(200);

// ── 投稿 ──
await page.locator('#mm-cp-post').click();
await page.waitForTimeout(400);
check('1件投稿できる', await page.locator('#mm-list .mm-row').count() === 1);
check('コンポーザが閉じる', await page.locator('#mm-composer.open').count() === 0);
check('localStorage に入る',
  JSON.parse(await page.evaluate(() => localStorage.getItem('wk_murmurs') || '[]')).length === 1);

// ── 派生 ──
await page.locator('#mm-list [data-mm-derive]').first().click();
await page.waitForTimeout(250);
check('引用が出る', await page.locator('#mm-cp-quote.on').count() === 1);
await page.locator('#mm-cp-text').fill('腰というより、膝の向きかもしれない');
await page.locator('#mm-cp-post').click();
await page.waitForTimeout(400);
check('派生が2件目として入る', await page.locator('#mm-list .mm-row').count() === 2);
check('親への参照が出る', await page.locator('#mm-list .mm-from').count() === 1);
check('親に「育った」が出る', await page.locator('#mm-list [data-mm-kids]').count() === 1);

// ── 編集 ──
await page.locator('#mm-list [data-mm-edit]').first().click();
await page.waitForTimeout(250);
await page.locator('#mm-list .mm-edit').fill('デラヒーバの足の入れ替えが遅い');
await page.locator('#mm-list [data-mm-save]').click();
await page.waitForTimeout(300);
const bodies = await page.locator('#mm-list .mm-body').allTextContents();
check('編集が反映される', bodies.some(b => b.includes('デラヒーバ')), bodies.join(' / '));
check('編集でタグを取り直す',
  (await page.locator('#mm-list .mm-tag').allTextContents()).some(t => t.includes('デラヒーバ')));

// ── タグ編集 ──
await page.locator('#mm-list [data-mm-edit]').first().click();
await page.waitForTimeout(250);
check('編集中にタグ欄が出る', await page.locator('#mm-edit-tags').count() === 1);
const etBefore = await page.locator('#mm-edit-tags .mm-et-chip').count();
check('既存のタグが編集欄に入る', etBefore >= 1, String(etBefore));
const droppedTag = (await page.locator('#mm-edit-tags .mm-et-chip').first().textContent() || '').replace(/[#×]/g,'').trim();
await page.locator('#mm-edit-tags [data-mm-etdrop]').first().click();
await page.waitForTimeout(200);
check('タグを外せる', await page.locator('#mm-edit-tags .mm-et-chip').count() === etBefore - 1);
await page.locator('#mm-et-add').click();
await page.waitForTimeout(250);
check('タグ選択が層で分かれていない', await page.locator('#mm-mbd .mm-sec2').count() === 0);
check('自由入力欄がある', await page.locator('#mm-tagq').count() === 1);
check('件数が出る', await page.locator('#mm-tagrows .mm-chip-n').count() >= 1);
// 自由入力: 辞書にも動画にも無い言葉を Enter で足せる
await page.locator('#mm-tagq').fill('道場のあの人の癖');
await page.waitForTimeout(200);
check('新規タグの作成候補が出る', await page.locator('[data-mm-newtag]').count() === 1);
await page.locator('#mm-tagq').press('Enter');
await page.waitForTimeout(250);
check('自由入力したタグが入る',
  (await page.locator('#mm-edit-tags .mm-et-chip').allTextContents()).some(t => t.includes('道場のあの人の癖')));
// 既存タグも選べる
await page.locator('#mm-tagq').fill('パスガード');
await page.waitForTimeout(200);
await page.locator('[data-mm-addtag="パスガード"]').click();
await page.waitForTimeout(200);
await page.locator('#mm-tag-done').click();
await page.waitForTimeout(250);
check('完了でタグ選択が閉じる', await page.locator('#mm-modal.open').count() === 0);
check('タグを足せる',
  (await page.locator('#mm-edit-tags .mm-et-chip').allTextContents()).some(t => t.includes('パスガード')));
await page.locator('#mm-list [data-mm-save]').click();
await page.waitForTimeout(300);
const savedTags = await page.locator('#mm-list .mm-row').first().locator('.mm-tag').allTextContents();
check('編集したタグが保存される', savedTags.some(t => t.includes('パスガード')), savedTags.join(','));
check('外したタグは戻らない（その行のみ）', !savedTags.some(t => t.includes(droppedTag)), droppedTag + ' / ' + savedTags.join(','));

// タグを直接押しても編集に入れる
await page.locator('#mm-list .mm-tag').first().click();
await page.waitForTimeout(250);
check('タグを押すと編集に入る', await page.locator('#mm-edit-tags').count() === 1);
await page.locator('#mm-list [data-mm-cancel]').click();
await page.waitForTimeout(250);

// ── ★ 固定 ──
await page.locator('#mm-list [data-mm-star]').last().click();
await page.waitForTimeout(300);
check('★ セクションが出る', await page.locator('#mm-list .mm-sec').count() === 2);
const firstCls = await page.locator('#mm-list .mm-row').first().getAttribute('class');
check('★ が先頭に来る', /\bstarred\b/.test(firstCls || ''), firstCls);

// ── テンプレート ──
await page.keyboard.press('Escape');
await page.locator('#mm-btn-tpl').click();
await page.waitForTimeout(250);
check('プリセットが6件出る', await page.locator('#mm-mbd .mm-tpl-row').count() === 6);
await page.locator('#mm-tpl-new').click();
await page.waitForTimeout(250);
await page.locator('#mm-t-nm').fill('試合前');
await page.locator('#mm-t-body').fill('狙う展開：\n避ける展開：');
await page.locator('#mm-t-save').click();
await page.waitForTimeout(300);
check('自作テンプレが増える', await page.locator('#mm-mbd .mm-tpl-row').count() === 7);
check('テンプレが保存される',
  JSON.parse(await page.evaluate(() => localStorage.getItem('wk_murmur_tpls') || '[]')).length === 1);

// ── 表示位置 ──
await page.keyboard.press('Escape');
await page.locator('#mm-btn-pos').click();
await page.waitForTimeout(250);
await page.locator('[data-mm-pos-btn="header"]').click();
await page.waitForTimeout(250);
check('ヘッダー右端に移せる',
  await page.evaluate(() => !!document.getElementById('mm-fab')?.closest('.tb-row-logo')));
await page.locator('[data-mm-pos-btn="off"]').click();
await page.waitForTimeout(250);
check('「出さない」でボタンが消える', !(await page.locator('#mm-fab').isVisible()));
await page.keyboard.press('Escape');
await page.keyboard.press('n');
await page.waitForTimeout(250);
check('非表示でも N キーで開ける', await page.locator('#mm-composer.open').count() === 1);
await page.keyboard.press('Escape');
await page.evaluate(() => window._murmursSetPos('br'));

// ── どの置き場所でも入力欄が画面内に出ること ──
// （header に位置指定が無く、開いてはいるが画面外にいた不具合を捕まえる）
for (const pos of ['header','br','bl','tr','tl','off']) {
  await page.evaluate(p => window._murmursSetPos(p), pos);
  await page.evaluate(() => window.openMurmurComposer());
  await page.waitForTimeout(200);
  const box = await page.locator('#mm-composer').boundingBox();
  const vp = page.viewportSize();
  const onScreen = !!box && box.x >= 0 && box.y >= 0
    && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1
    && box.width > 100 && box.height > 100;
  check(`入力欄が画面内に出る（${pos}）`, onScreen, box ? JSON.stringify(box) : 'なし');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
}

// ── ヘッダー配置では右端に寄っていること ──
await page.evaluate(() => window._murmursSetPos('header'));
await page.waitForTimeout(200);
const fabBox = await page.locator('#mm-fab').boundingBox();
const acctBox = await page.locator('#acct-btn').boundingBox();
check('ヘッダーではアカウントボタンの左隣に並ぶ',
  !!fabBox && !!acctBox && acctBox.x > fabBox.x && (acctBox.x - (fabBox.x + fabBox.width)) < 24,
  JSON.stringify({ fab: fabBox && Math.round(fabBox.x), acct: acctBox && Math.round(acctBox.x) }));
check('ヘッダーでは右端側にいる',
  !!fabBox && fabBox.x > page.viewportSize().width * 0.6, fabBox && String(Math.round(fabBox.x)));

// ── 動画を見ているあいだは浮かべない ──
await page.evaluate(() => window._murmursSetPos('br'));
await page.waitForTimeout(200);
check('通常は浮いている', await page.locator('#mm-fab').isVisible());
await page.evaluate(() => document.getElementById('vpanel').classList.add('open'));
await page.waitForTimeout(250);
check('動画パネル表示中は浮かべない', !(await page.locator('#mm-fab').isVisible()));
await page.evaluate(() => document.getElementById('vpanel').classList.remove('open'));
await page.waitForTimeout(250);
check('閉じたら戻る', await page.locator('#mm-fab').isVisible());

// ══ データ安全性 ══════════════════════════════════════
const saved = [];
await page.evaluate(() => {
  window.__saves = [];
  window._firebaseSaveMurmurs = p => { window.__saves.push(JSON.parse(JSON.stringify(p))); };
});

// クラウド未確定のうちは保存しない
await page.evaluate(() => window._murmursInitForUser?.());
await page.evaluate(() => window.openMurmurComposer());
await page.locator('#mm-cp-text').fill('クラウド未確定のテスト');
await page.locator('#mm-cp-post').click();
await page.waitForTimeout(900);
check('クラウド未確定なら Firestore に書かない',
  await page.evaluate(() => window.__saves.length) === 0);
check('その間もローカルには残る',
  JSON.parse(await page.evaluate(() => localStorage.getItem('wk_murmurs') || '[]')).length >= 1);

// 確定したら書く
await page.evaluate(() => window._murmursMarkReady?.());
await page.waitForTimeout(900);
check('確定後はローカル分をクラウドへ上げる',
  await page.evaluate(() => window.__saves.length) >= 1);

// リモートが空でもローカルを消さない
const beforeCnt = await page.evaluate(() => window._murmursGetData().length);
await page.evaluate(() => window._murmursLoadFromRemote?.({ data: [], tpls: [] }));
await page.waitForTimeout(300);
check('リモートが空でもローカルのつぶやきを消さない',
  await page.evaluate(() => window._murmursGetData().length) === beforeCnt);

// ログアウトで保存が走らない（v52.541 の再発防止）
await page.evaluate(() => { window.__saves = []; });
await page.evaluate(() => window._murmursClear?.());
await page.waitForTimeout(900);
check('ログアウトで Firestore に書き込まない',
  await page.evaluate(() => window.__saves.length) === 0);
check('ログアウトで画面が空になる',
  await page.evaluate(() => window._murmursGetData().length) === 0);

// 既存データに触っていない
check('カスタムビューのキーを触らない',
  await page.evaluate(() => localStorage.getItem('wk_cv_views')) === null);
check('タググループのキーを触らない',
  await page.evaluate(() => localStorage.getItem('wk_tagGroups')) === null);

// ── 結果 ──
console.log('');
for (const c of checks) console.log((c.ok ? '✓ ' : '✗ ') + c.name + (c.ok || !c.detail ? '' : '  → ' + c.detail));
const unexpected = errs.filter(e => !IGNORE.test(e));
console.log('');
if (unexpected.length) { console.log('✗ JSエラー:'); unexpected.forEach(e => console.log('   ' + e)); }
else console.log('✓ 想定外のJSエラーなし');

const failed = checks.filter(c => !c.ok).length;
console.log('');
console.log(failed || unexpected.length
  ? `✗ 失敗 ${failed}件 / エラー ${unexpected.length}件`
  : `✓ Journal スモークテスト通過（${checks.length}項目）`);

await browser.close();
srv.close();
process.exit(failed || unexpected.length ? 1 : 0);
