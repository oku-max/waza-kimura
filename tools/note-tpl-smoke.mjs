// ノートのテンプレートを実ブラウザで触る。
// いちばん確かめたいのは「既存のノートに一切触らないこと」（CLAUDE.md ルール1）。
// 使い方: node tools/note-tpl-smoke.mjs   終了コード: 0 = 通過 / 1 = 失敗
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
const PORT = 8149;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css' };
const IGNORE = /firebase|gstatic|googleapis|net::ERR|Failed to load resource/i;

// note-templates.js は import を持たず window 越しにしか外と繋がらないので、
// 本番の当該モジュールだけを載せて検証できる。
const HARNESS = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/note-templates.css">
</head><body>
<script>
  // notes.js の代わり: 追加だけを記録する最小の受け皿
  window.__notes = [
    { id:'keep1', name:'既存ノートA', status:'wip', tags:['x'], blocks:[{type:'text',content:'消えたら困る'}] },
    { id:'src1', name:'デラヒーバ研究', status:'wip', tags:['デラヒーバ'], blocks:[
      { type:'h2', content:'狙い' }, { type:'text', content:'足の入れ替えを速くする' },
      { type:'h2', content:'試すこと' }, { type:'text', content:'フックを早く外す' },
      { type:'vidlist', name:'関連動画', mode:'filter', filter:{ tags:['デラヒーバ'] }, ids:[], max:20 },
      { type:'video', videoId:'abc', platform:'youtube' },
      { type:'image', src:'data:image/png;base64,AAAA' }
    ]}
  ];
  window.__notesSnapshot = JSON.stringify(window.__notes);
  window._notesCreateNote = spec => {
    const id = 'n' + (window.__notes.length + 1);
    window.__notes.push({ id, ...JSON.parse(JSON.stringify(spec)) });
    return id;
  };
  window._notesOpenNote = id => { window.__opened = id; return true; };
  window._notesGetNote = id => {
    const n = window.__notes.find(x => x.id === id);
    return n ? JSON.parse(JSON.stringify(n)) : null;
  };
  window._notesActiveId = () => 'src1';
  window.toast = m => { (window.__toasts ||= []).push(m); };
  window.videos = [];
<\/script>
<script type="module">
  import { openTemplatePicker, buildNote } from '/js/note-templates.js';
  window.openNoteTemplatePicker = openTemplatePicker;
  window.__build = buildNote; window.__ready = true;
<\/script>
</body></html>`;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') { r.writeHead(200,{'Content-Type':'text/html'}); return r.end(HARNESS); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(''); }
  r.writeHead(200,{'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));
const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport:{ width:1000, height:900 } });
ctx.setDefaultTimeout(8000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil:'domcontentloaded', timeout:20000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout:15000 });

const checks = [];
const check = (n, ok, d) => { checks.push({n, ok, d}); console.log((ok?'  ✓ ':'  ✗ ')+n+(ok||!d?'':'  → '+d)); };

// ── 白紙から ──
await page.evaluate(() => window.openNoteTemplatePicker());
await page.waitForTimeout(250);
check('テンプレートが6件出る', await page.locator('#nt-bd [data-nt]').count() === 6,
  String(await page.locator('#nt-bd [data-nt]').count()));
await page.locator('[data-nt="goal"]').click();
await page.waitForTimeout(250);
check('プレビューが出る', await page.locator('#nt-make').count() === 1);
check('見出しが並ぶ', await page.locator('.nt-h2').count() >= 3);
check('動画リストの説明が出る', (await page.locator('#nt-bd').textContent()).includes('自動で並びます'));
await page.locator('#nt-back').click();
await page.waitForTimeout(200);
check('選び直せる', await page.locator('#nt-bd [data-nt]').count() === 6);

await page.locator('[data-nt="goal"]').click();
await page.locator('#nt-make').click();
await page.waitForTimeout(250);
check('ノートが1件増える', await page.evaluate(() => window.__notes.length) === 3,
  String(await page.evaluate(() => window.__notes.length)));
check('作ったノートを開く', await page.evaluate(() => window.__opened) === 'n3',
  await page.evaluate(() => window.__opened));
check('閉じる', await page.locator('#nt-modal.open').count() === 0);

// ── メモから育てる ──
await page.evaluate(() => window.openNoteTemplatePicker({
  body:'デラヒーバのスイープをできるようになりたい',
  tags:['デラヒーバ'],
  related:['足の入れ替えが遅い','入りかけたけど返された']
}));
await page.waitForTimeout(250);
check('元のメモを見せる', (await page.locator('.nt-q').textContent()).includes('デラヒーバ'));
await page.locator('[data-nt="goal"]').click();
await page.waitForTimeout(250);
const bd = await page.locator('#nt-bd').textContent();
check('本文を引き継ぐ', bd.includes('スイープをできるようになりたい'));
check('同じタグの過去メモを引き継ぐ', bd.includes('足の入れ替えが遅い'));
check('タグが動画リストの条件に入る', bd.includes('#デラヒーバ'));
await page.locator('#nt-make').click();
await page.waitForTimeout(250);
const made = await page.evaluate(() => window.__notes[window.__notes.length - 1]);
check('ノート名がメモの1行目になる', made.name === 'デラヒーバのスイープをできるようになりたい', made.name);
check('タグが入る', JSON.stringify(made.tags) === JSON.stringify(['デラヒーバ']));
check('状態が学習中', made.status === 'wip');
const vl = made.blocks.find(b => b.type === 'vidlist');
check('動画リストが条件つきで入る',
  !!vl && vl.mode === 'filter' && JSON.stringify(vl.filter.tags) === JSON.stringify(['デラヒーバ']),
  JSON.stringify(vl));
check('カスタムビューのブロックは作らない',
  !made.blocks.some(b => b.type === 'customview'));

// ── いちばん大事: 既存ノートに触っていない ──
check('既存ノートが元のまま',
  await page.evaluate(() => JSON.stringify(window.__notes[0]) === JSON.parse(window.__notesSnapshot).length
    ? false : JSON.stringify(window.__notes[0]) === JSON.stringify(JSON.parse(window.__notesSnapshot)[0])));
check('元の2件は残ったまま増えている', await page.evaluate(() => window.__notes.length) === 4,
  String(await page.evaluate(() => window.__notes.length)));
check('カスタムビューのキーを触らない',
  await page.evaluate(() => !localStorage.getItem('wk_cv_views')));

// ── 各テンプレートが壊れずに組める ──
for (const k of ['goal','counter','break','plan','diary','blank']) {
  const ok = await page.evaluate(k => {
    try {
      const before = window.__notes.length;
      window.openNoteTemplatePicker({ body:'テスト', tags:[], related:[] });
      return true;
    } catch (e) { return false; }
  }, k);
  await page.waitForTimeout(120);
  await page.locator(`[data-nt="${k}"]`).click();
  await page.waitForTimeout(150);
  const has = await page.locator('#nt-make').count() === 1;
  check(`${k} が組める`, ok && has);
  await page.locator('#nt-x').click();
  await page.waitForTimeout(100);
}

// ── ノートをテンプレートにする ──
const before = await page.evaluate(() => JSON.stringify(window.__notes));
await page.evaluate(() => window._noteTplSaveFrom('src1'));
await page.waitForTimeout(250);
check('テンプレート化の画面が出る', await page.locator('#nt-save-nm').count() === 1);
check('元の名前が入る', (await page.locator('#nt-save-nm').inputValue()) === 'デラヒーバ研究');
const keepTxt = await page.locator('#nt-bd').textContent();
check('残る見出しを見せる', keepTxt.includes('狙い') && keepTxt.includes('試すこと'));
check('持ち込まないものを数える', /2個は持ち込みません/.test(keepTxt), keepTxt.slice(0,0) || 'なし');
check('条件の選択肢が出る', await page.locator('[data-nt-cond]').count() === 2);
await page.locator('#nt-save-nm').fill('デラヒーバ型');
await page.locator('#nt-save-ok').click();
await page.waitForTimeout(250);
check('保存でノートは増えない', await page.evaluate(() => JSON.stringify(window.__notes)) === before);
check('自作テンプレが保存される',
  JSON.parse(await page.evaluate(() => localStorage.getItem('wk_note_tpls') || '[]')).length === 1);

// 自作テンプレから作る
await page.evaluate(() => window.openNoteTemplatePicker({ body:'新しい狙い', tags:['スイープ'], related:[] }));
await page.waitForTimeout(250);
check('一覧に自作テンプレが出る',
  (await page.locator('#nt-bd').textContent()).includes('デラヒーバ型'));
const uk = await page.evaluate(() => JSON.parse(localStorage.getItem('wk_note_tpls'))[0].k);
await page.locator(`[data-nt="${uk}"]`).click();
await page.waitForTimeout(250);
const pv = await page.locator('#nt-bd').textContent();
check('保存した見出しが復元される', pv.includes('狙い') && pv.includes('試すこと'));
check('中身は空欄（見出しだけを選んだため）', pv.includes('空欄のままで大丈夫です'));
await page.locator('#nt-make').click();
await page.waitForTimeout(250);
const fromMine = await page.evaluate(() => window.__notes[window.__notes.length - 1]);
check('自作テンプレからノートが作れる', fromMine.name === '新しい狙い', fromMine.name);
check('動画・画像は持ち込まれない',
  !fromMine.blocks.some(b => b.type === 'video' || b.type === 'image'));
check('動画リストの条件はメモのタグになる',
  JSON.stringify(fromMine.blocks.find(b => b.type === 'vidlist')?.filter?.tags) === JSON.stringify(['スイープ']));

// 削除
await page.evaluate(() => window.openNoteTemplatePicker());
await page.waitForTimeout(250);
await page.locator('[data-nt-del]').click();
await page.waitForTimeout(250);
check('自作テンプレを消せる',
  JSON.parse(await page.evaluate(() => localStorage.getItem('wk_note_tpls') || '[]')).length === 0);
check('プリセットは消えない', await page.locator('#nt-bd [data-nt]').count() === 6);

const unexpected = errs.filter(e => !IGNORE.test(e));
console.log('');
if (unexpected.length) { console.log('✗ JSエラー:'); unexpected.forEach(e => console.log('   '+e)); }
else console.log('✓ 想定外のJSエラーなし');
const failed = checks.filter(c => !c.ok).length;
console.log('');
console.log(failed || unexpected.length
  ? `✗ 失敗 ${failed}件 / エラー ${unexpected.length}件`
  : `✓ ノートテンプレート スモークテスト通過（${checks.length}項目）`);
await browser.close(); srv.close();
process.exit(failed || unexpected.length ? 1 : 0);
