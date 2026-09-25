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
//   後半: 設定画面（settings.js）が、確認文に知らせを入れているか・選択を守るかを確かめる
//         （この起動では custom-view.js と設定モジュールを同時に動かせないので、
//           後半は custom-view 側の関数を記録係に差し替えて、呼ばれ方を見る）
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
const grab = (id) => { const i = idx.indexOf(`id="${id}"`); if (i < 0) throw new Error('index.html に #' + id + ' が無い');
  const s0 = idx.lastIndexOf('<div', i); let d = 0, j = s0;
  while (j < idx.length) { if (idx.startsWith('<div', j)) d++; else if (idx.startsWith('</div>', j)) { d--; if (!d) return idx.slice(s0, j + 6); } j++; }
  throw new Error('閉じタグが見つからない: ' + id); };
const SETTINGS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
${grab('tag-display-settings')}
${grab('tag-edit-overlay')}
<script>
 window.__log=[]; window.toast=(m)=>window.__log.push(m);
 window.saveUserSettings=()=>{}; window.debounceSave=()=>{}; window.AF=()=>{};
 window.__cvCalls=[];
 window.__cvLists=[];                      // _cvListsUsingTags が返すリスト（テストごとに差し替える）
 window._cvListsUsingTags=(names,fields)=>{ window.__cvCalls.push(['lists',names,fields]); return window.__cvLists; };
 window._cvUsageNoteFromLists=(lists,kind)=> lists&&lists.length ? '\\n\\n[CVNOTE:'+kind+':'+lists.length+']' : '';
 window._cvTagUsageNote=(names,fields,kind)=>{ window.__cvCalls.push(['note',names,fields,kind]); return window._cvUsageNoteFromLists(window.__cvLists,kind); };
<\/script>
<script src="/js/tag-master.js"><\/script><script src="/js/tag-templates.js"><\/script>
<script type="module">
 import * as S from '/js/settings.js';
 ['tagLabel','tagPresets','renderTagSettingsList','saveTagSettings','applyTagLabels'].forEach(n=>{ if(S[n]) window[n]=S[n]; });
 window.tagSettings=S.tagSettings; window.aiSettings=S.aiSettings; window.__ready=true;
<\/script></body></html>`;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/settings') { r.writeHead(200, {'Content-Type':'text/html'}); return r.end(SETTINGS_HTML); }
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

// ═══ 後半: 設定画面が知らせを入れているか ═══
{
  const ctx = await b.newContext();
  await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await pg.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => window.__ready === true).catch(() => {});
  await pg.waitForTimeout(300);

  console.log('\n── 後半: 動画から削除（🗑）──');
  const g = await pg.evaluate(async () => {
    window.videos = [{ id:'v1', pos:['幽霊'] }, { id:'v2', pos:['幽霊','デラヒーバ'] }];
    window.__cvLists = [{ id:'L1', label:'デラヒーバ系', hits:['幽霊'] }];
    let msg = ''; window.confirm = m => { msg = m; return false; };            // キャンセル
    window._tagModalGhostDrop('pos', '幽霊', 2);
    const afterCancel = JSON.stringify(window.videos);
    window.__cvLists = [];                                                     // どのリストも使っていない
    let msg2 = ''; window.confirm = m => { msg2 = m; return false; };
    window._tagModalGhostDrop('pos', '幽霊', 2);
    return { msg, msg2, afterCancel };
  });
  ck('★ 確認文に「リストが使っている」知らせが入る', /\[CVNOTE:delete:1\]/.test(g.msg), g.msg);
  ck('★ キャンセルすれば動画のタグは1つも消えない', g.afterCancel === JSON.stringify([{ id:'v1', pos:['幽霊'] }, { id:'v2', pos:['幽霊','デラヒーバ'] }]), g.afterCancel);
  ck('使っていなければ、確認文は今までどおり', !/CVNOTE/.test(g.msg2) && /動画 2件 から削除/.test(g.msg2), g.msg2);

  console.log('\n── 後半: 一括削除にも配線されているか（静的）──');
  const src = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
  const body = (start) => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, i + 4000); };
  const bulk = body('async function _bulkTagDelete');
  ck('一括削除: 最初の確認文に知らせを入れている', /_cvTagUsageNote\?\.\(null, keys, 'delete'\)/.test(bulk) && bulk.indexOf('_cvTagUsageNote') < bulk.indexOf('wazaExportLight()'), '');
  ck('重複整理・仕分けは無い（統合でリストの条件を書き換える経路が残っていない）',
     !/_techCleanup|_tagSortMode|sort-apply-btn|_cvRewriteTagInConditions/.test(src), '');

  errs.length ? errs.forEach(e => { console.log('  ✗ ' + e); fail++; }) : console.log('  ✓ 後半 エラーなし');
  await ctx.close();
}
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
