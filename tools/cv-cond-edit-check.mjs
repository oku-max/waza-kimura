// ═══ カスタムリスト（条件）の編集画面の検査 ═══
// 使い方: node tools/cv-cond-edit-check.mjs
//
// なぜ要るか（Notion 確認事項01・2026-09-23）:
//   条件で作ったカスタムリストを「編集」で開くと、保存してある上下・カテゴリ・
//   ポジションの条件が**選択状態に見えていなかった**。技（#タグ）だけは見えた。
//   保存済みの条件を旧キー tb / action / position に戻していたのに、
//   編集画面（統合フィルター・ライブラリ文脈）は tbNew / cat / posNew を読んでいたため。
//   見えないだけでなく、そのグループのチップを1つ押すと、見えていなかった
//   古い条件が黙って置き換わっていた。
//   さらに保存の順番が逆で（保存→表示切替→閉じる）、編集中の一時的な絞り込みが
//   閉じた後もリストやライブラリ全体の絞り込みに残っていた（再読み込みで消える）。
//
//   本物の index.html を起動して確かめる（器を自分で作らない）。
//   custom-view.js / unified-filter.js は Firebase 無しでも動く普通のスクリプト。
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8241;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
const COND = { tb:['ボトム'], pos:['デラヒーバ'], cat:['スイープ'], tech:['アームバー'] };
const VIEW = [{ id:'_t1', label:'テスト条件', saveMode:'dynamic', icon:'🔄', columns:[], rowData:{},
  filterConditions: COND, searchQuery:'' },
  // 03/04 用: 「消えた値」はどの動画にも無い。「外した値」は動画にはあるが選択肢に無い
  { id:'_t2', label:'消えたタグを含む条件', saveMode:'dynamic', icon:'🔄', columns:[], rowData:{},
  filterConditions: { pos:['消えた値','外した値','デラヒーバ'] }, searchQuery:'' }];
await ctx.addInitScript(v => { localStorage.setItem('wk_cv_views', JSON.stringify(v)); localStorage.setItem('wk_lang','ja'); }, VIEW);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d && !ok ? '  → ' + String(d).slice(0, 240) : '')); if (!ok) fail++; };

const setup = () => pg.evaluate(() => {
  window.videos = [
    { id:'v1', title:'A', tb:['ボトム'], pos:['デラヒーバ'], cat:['スイープ'], tags:['アームバー'] },
    { id:'v2', title:'B', tb:['トップ'], pos:['ハーフガード'], cat:['パスガード'], tags:[] },
    { id:'v3', title:'C', tb:['ボトム'], pos:['ラッソー'], cat:['スイープ'], tags:[] } ];
});
await setup();
ck('編集画面を開く関数がある', await pg.evaluate(() => typeof window.cvOpenConditionEditor === 'function'));

console.log('\n── 保存済みの条件で編集画面を開く ──');
const r1 = await pg.evaluate(async () => {
  window.cvOpenConditionEditor('_t1'); await new Promise(r => setTimeout(r, 400));
  window.uniSetTab?.('tag'); await new Promise(r => setTimeout(r, 400));
  const f = window.filters, arr = k => f[k] ? [...f[k]] : null;
  const on = [...document.querySelectorAll('#uni-popup .uni-row.on span:first-child')].map(e => e.textContent.trim());
  const pills = [...document.querySelectorAll('#uni-pills .uni-pill')].map(e => e.textContent.trim());
  return { tbNew: arr('tbNew'), cat: arr('cat'), posNew: arr('posNew'), tags: arr('tags'),
           oldPos: arr('position'), oldAct: arr('action'), on, pills };
});
ck('★ ポジション条件が編集画面のキーに戻る', JSON.stringify(r1.posNew) === '["デラヒーバ"]', JSON.stringify(r1));
ck('★ カテゴリ条件が戻る', JSON.stringify(r1.cat) === '["スイープ"]', JSON.stringify(r1.cat));
ck('★ 上下の条件が戻る', JSON.stringify(r1.tbNew) === '["ボトム"]', JSON.stringify(r1.tbNew));
ck('技の条件が戻る', JSON.stringify(r1.tags) === '["アームバー"]', JSON.stringify(r1.tags));
ck('旧キーには入れない（読む場所を1つにする）', (r1.oldPos || []).length === 0 && (r1.oldAct || []).length === 0, JSON.stringify([r1.oldPos, r1.oldAct]));
ck('★ 4つとも選択状態に見える', ['ボトム','デラヒーバ','スイープ','アームバー'].every(x => r1.on.includes(x)), JSON.stringify(r1.on));
ck('上の選択中ピルにも4つ出る', ['ボトム','デラヒーバ','スイープ','アームバー'].every(x => r1.pills.includes(x)), JSON.stringify(r1.pills));

console.log('\n── 何も触らずに保存 ──');
const r2 = await pg.evaluate(async () => {
  window._cvSaveDynamic(); await new Promise(r => setTimeout(r, 300));
  const v = JSON.parse(localStorage.getItem('wk_cv_views') || '[]').find(x => x.id === '_t1');
  return v && v.filterConditions;
});
ck('★ 条件がそのまま残る', JSON.stringify({tb:r2?.tb,pos:r2?.pos,cat:r2?.cat,tech:r2?.tech}) === JSON.stringify(COND), JSON.stringify(r2));

console.log('\n── ポジションを1つ足して保存 ──');
const r3 = await pg.evaluate(async () => {
  window.cvOpenConditionEditor('_t1'); await new Promise(r => setTimeout(r, 400));
  window.uniToggle('posNew', 'ラッソー'); await new Promise(r => setTimeout(r, 200));
  window._cvSaveDynamic(); await new Promise(r => setTimeout(r, 300));
  const v = JSON.parse(localStorage.getItem('wk_cv_views') || '[]').find(x => x.id === '_t1');
  return v && v.filterConditions;
});
ck('★ 足した値が入る', (r3?.pos || []).includes('ラッソー'), JSON.stringify(r3));
ck('★ 元のポジション条件が黙って消えない', (r3?.pos || []).includes('デラヒーバ'), JSON.stringify(r3?.pos));
ck('他のグループの条件もそのまま', JSON.stringify(r3?.cat) === '["スイープ"]' && JSON.stringify(r3?.tb) === '["ボトム"]', JSON.stringify(r3));

console.log('\n── 閉じたらライブラリの絞り込みに漏れない ──');
const r4 = await pg.evaluate(() => { const f = window.filters; return { posNew: [...(f.posNew||[])], cat: [...(f.cat||[])], tbNew: [...(f.tbNew||[])] }; });
ck('★ 編集を閉じたら条件はそのリストの絞り込みに残らない', !r4.posNew.length && !r4.cat.length && !r4.tbNew.length, JSON.stringify(r4));
const r5 = await pg.evaluate(async () => {
  window._cvClearSelection?.(); await new Promise(r => setTimeout(r, 300));   // ライブラリ全体へ戻る
  const f = window.filters; return { posNew: [...(f.posNew||[])], cat: [...(f.cat||[])], tbNew: [...(f.tbNew||[])], tags: [...(f.tags||[])] };
});
ck('★ ライブラリ全体に戻っても、編集した条件が混ざっていない', !r5.posNew.length && !r5.cat.length && !r5.tbNew.length && !r5.tags.length, JSON.stringify(r5));

console.log('\n── 03 候補はユーザーの選択肢から作る（タグがいつでも正）──');
// この起動方法では Firebase が読めず、設定モジュール（tagPresets を配る側）が動かない。
// 選択肢を配る関数だけをここで用意する。描画先の器は本物の index.html のまま。
const r6 = await pg.evaluate(async () => {
  window.videos = [
    // 上下の候補は他の条件（ポジション）で絞った後の件数で出るので、条件に合う v1・v4 に上下を持たせる。
    // v3 はテスト条件(_t1)の値（ボトム・ラッソー）を持たせ、_t1 に ⚠ が出ないようにする。
    { id:'v1', title:'A', tb:['寝'],     pos:['デラヒーバ'],        cat:['スイープ'], tags:['アームバー'] },
    { id:'v2', title:'B', tb:[],         pos:['テンプレ値'],        cat:[],          tags:[] },
    { id:'v3', title:'C', tb:['ボトム'], pos:['サイド','ラッソー'], cat:[],          tags:[] },
    { id:'v4', title:'D', tb:['立ち'],   pos:['外した値'],          cat:[],          tags:[] } ];
  const OPTS = { tb:['立ち','寝'], cat:['スイープ'], pos:['デラヒーバ','テンプレ値','ラッソー'], tags:[] };
  window.tagPresets = k => (OPTS[k] || []).slice();
  window.uniCloseForCv?.();
  window.cvOpenConditionEditor('_t2'); await new Promise(r => setTimeout(r, 400));
  window.uniSetTab?.('tag'); await new Promise(r => setTimeout(r, 400));
  const rows = [...document.querySelectorAll('#uni-popup .uni-row')].map(e => ({
    name: e.querySelector('span')?.textContent.trim(), on: e.classList.contains('on'),
    warn: e.querySelector('.uni-warn')?.textContent.trim() || '' }));
  window.uniCloseForCv?.(); await new Promise(r => setTimeout(r, 200));
  return rows;
});
const row = n => r6.find(x => x.name === n);
ck('★ テンプレートから入れた値（辞書に無い）が候補に出る', !!row('テンプレ値'), JSON.stringify(r6.map(x=>x.name)));
ck('★ 上下は自分の選択肢（立ち・寝）が出る', !!row('立ち') && !!row('寝'), JSON.stringify(r6.map(x=>x.name)));
ck('★ 辞書にあっても選択肢に無い値は出ない（サイド・ボトム・スタンディング）', !row('サイド') && !row('ボトム') && !row('スタンディング'), JSON.stringify(r6.map(x=>x.name)));

console.log('\n── 04 条件に残った、どの動画にも無い値 ──');
ck('★ どの動画にも無い値も、選択中として見える', row('消えた値')?.on === true, JSON.stringify(row('消えた値')));
ck('★ その値に「該当する動画なし」の印', /該当する動画なし/.test(row('消えた値')?.warn || ''), JSON.stringify(row('消えた値')));
ck('★ 選択肢から外した値も見えて「選択肢に無い」の印', row('外した値')?.on === true && /選択肢に無い/.test(row('外した値')?.warn || ''), JSON.stringify(row('外した値')));
ck('ふつうの値には印が付かない', row('デラヒーバ')?.on === true && !row('デラヒーバ')?.warn, JSON.stringify(row('デラヒーバ')));
const r7 = await pg.evaluate(async () => {
  const dead = window._cvDeadConditionValues('_t2');
  window.cvOpenViewPicker?.(); await new Promise(r => setTimeout(r, 300));
  const txt = [...document.querySelectorAll('.cv-picker-dead')].map(e => e.textContent.trim());
  window._closePicker?.();
  return { dead, txt };
});
ck('判定は「どの動画にも無い値」だけを返す', JSON.stringify(r7.dead) === JSON.stringify([{key:'pos',value:'消えた値'}]), JSON.stringify(r7.dead));
ck('★ リストの一覧にも ⚠ が出る', r7.txt.some(t => /該当する動画が無い条件/.test(t) && /消えた値/.test(t)), JSON.stringify(r7.txt));
ck('問題の無いリストには出ない', r7.txt.length === 1, JSON.stringify(r7.txt));

console.log('\n── 印の付いた値を外して保存できる ──');
const r8 = await pg.evaluate(async () => {
  window.cvOpenConditionEditor('_t2'); await new Promise(r => setTimeout(r, 400));
  window.uniToggle('posNew', '消えた値'); await new Promise(r => setTimeout(r, 200));
  window._cvSaveDynamic(); await new Promise(r => setTimeout(r, 300));
  const v = JSON.parse(localStorage.getItem('wk_cv_views') || '[]').find(x => x.id === '_t2');
  return v && v.filterConditions;
});
ck('★ 消えた値だけが外れ、他の条件は残る', JSON.stringify(r8?.pos) === JSON.stringify(['外した値','デラヒーバ']), JSON.stringify(r8));
ck('外した後は ⚠ が消える', (await pg.evaluate(() => window._cvDeadConditionValues('_t2'))).length === 0);

console.log('\n── 最後までのエラー ──');
errs.length ? errs.forEach(e => { console.log('  ✗ ' + e); fail++; }) : console.log('  ✓ なし');
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail ? 1 : 0);
