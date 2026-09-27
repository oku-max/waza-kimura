// ═══ タグを消すとき、条件リストへの影響を知らせているかの検査 ═══
// 使い方: node tools/tag-cv-impact-check.mjs
//
// なぜ要るか（Notion 確認事項02・2026-09-23）:
//   カスタムリスト（条件）はタグの名前そのものを保存している。タグを動画から消す・
//   統合で名前を付け替えると、リストの条件は変わらないまま、リストが黙って0本になっていた。
//   タグを消す操作（動画から削除・一括削除）は、そのタグを条件に使っているリストがあれば、
//   実行前に知らせる。リストの条件は書き換えない。
//   v52.828: 重複整理（統合）と仕分けは画面ごと廃止した。条件を書き換える経路
//   （_cvRewriteTagInConditions）も一緒に消えている＝リストの条件を書き換える道はもう無い。
//
//   前半: 本物の index.html で、custom-view.js の関数そのものを確かめる
//   後半: 動画からタグを消す経路（v52.860 で旧画面と一緒に廃止。段階4で作り直すときに書き直す）
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 打ち切り'); process.exit(3); }, 120000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8251;
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d && !ok ? '  → ' + String(d).slice(0, 260) : '')); if (!ok) fail++; };

// ═══ 前半: custom-view.js の関数（本物の index.html）═══
{
  const ctx = await b.newContext({ locale: 'ja-JP' });
  await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
  const VIEWS = [
    { id:'L1', label:'デラヒーバ系', saveMode:'dynamic', columns:[], rowData:{}, filterConditions:{ pos:['デラヒーバ','ラッソー'], tech:['キムラ'] } },
    { id:'L2', label:'スイープ',     saveMode:'dynamic', columns:[], rowData:{}, filterConditions:{ pos:['デラヒーバ'], cat:['スイープ'] } },
    { id:'L3', label:'手動リスト',   saveMode:'static',  columns:[], rowData:{}, videoIds:['v1'] },
    { id:'L4', label:'アームバー',   saveMode:'dynamic', columns:[], rowData:{}, filterConditions:{ tech:['アームバー'] } } ];
  await ctx.addInitScript(v => localStorage.setItem('wk_cv_views', JSON.stringify(v)), VIEWS);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pg.waitForTimeout(2500);
  console.log('── 前半: どのリストが使っているかを調べる ──');
  const a = await pg.evaluate(() => ({
    pos:  window._cvListsUsingTags(['デラヒーバ'], ['pos']).map(l => l.id),
    tags: window._cvListsUsingTags(['デラヒーバ'], ['tags']).map(l => l.id),
    grp:  window._cvListsUsingTags(null, ['cat']).map(l => l.id),
    none: window._cvTagUsageNote(['使われていない値'], ['pos'], 'delete'),
    some: window._cvTagUsageNote(['デラヒーバ'], ['pos'], 'delete'),
    rewrite: typeof window._cvRewriteTagInConditions }));
  ck('★ そのタグを使っているリストだけが返る（L1・L2）', JSON.stringify(a.pos) === '["L1","L2"]', JSON.stringify(a.pos));
  ck('グループが違えば別物（技の条件には無い）', a.tags.length === 0, JSON.stringify(a.tags));
  ck('グループごと消すとき用（名前を指定しない）', JSON.stringify(a.grp) === '["L2"]', JSON.stringify(a.grp));
  ck('手動リストは対象外', !a.pos.includes('L3'));
  ck('★ どのリストも使っていなければ、知らせは空（確認文は今までどおり）', a.none === '', JSON.stringify(a.none));
  ck('★ 使っていれば、数とリスト名が出る', /カスタムリスト 2個/.test(a.some) && /デラヒーバ系/.test(a.some) && /スイープ/.test(a.some), a.some);
  ck('消すときは「条件は書き換えない」と明記', /書き換えません/.test(a.some), a.some);

  ck('★ リストの条件を書き換える関数はもう無い（統合の廃止と一緒に消した）', a.rewrite === 'undefined', a.rewrite);
  errs.length ? errs.forEach(e => { console.log('  ✗ ' + e); fail++; }) : console.log('  ✓ 前半 エラーなし');
  await ctx.close();
}

// ═══ 後半: 動画からタグを消す経路（静的）═══
// v52.860（段階3b）で旧画面の「動画から削除」「一括削除」を廃止し、
// 段階4（v52.866）で js/tag-ops.js に作り直した（先にバックアップ・取り消し・この知らせつき）。
{
  console.log('\n── 後半: 動画のタグを変える操作は、必ず知らせてから・条件は書き換えない ──');
  const src = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ck('旧画面の「動画から削除」「一括削除」は戻っていない（tag-ops.js に1本化）', !/_tagModalGhostDrop|_bulkTagDelete|_openBulkTagDelete/.test(src));
  ck('重複整理・仕分けは無い（統合でリストの条件を書き換える経路が残っていない）',
     !/_techCleanup|_tagSortMode|sort-apply-btn|_cvRewriteTagInConditions/.test(src), '');
  const cv = fs.readFileSync(path.join(ROOT, 'js/custom-view.js'), 'utf8');
  const ops = fs.readFileSync(path.join(ROOT, 'js/tag-ops.js'), 'utf8');
  ck('知らせを作る関数がある（グループID版は新しいタググループも見る）', /window\._cvListsUsingGroupValues = function/.test(cv) && /window\._cvListsUsingTags = function/.test(cv));
  ck('★ 動画のタグを変える操作は、実行前にその値を使うリストを調べて確かめに出す', /window\._cvListsUsingGroupValues\(op\.cvNames, gids\)/.test(ops) && /この値を条件に使っているカスタムリスト/.test(ops));
  ck('★ tag-ops.js はリストの条件を書き換えない（_views にも wk_cv_views にも触らない）', !/_views|wk_cv_views|filterConditions/.test(ops.replace(/\/\/.*$/gm, '')));
}
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
