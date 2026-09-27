// ═══ 動画のタグをまとめて変える操作の検査（段階4・js/tag-ops.js）═══
// 使い方: node tools/tag-ops-check.mjs
//
// なぜ要るか:
//   選択肢の削除（動画からも外す）・名前を変える／まとめる・選択肢に無い値を外す・ほかのグループから寄せる・
//   タグリセットは、**たくさんの動画のタグを一度に変える**。ここが壊れると、全デバイスのタグが消える。
//   以前のまとめて編集のタグリセットは、押すとすぐ外れ、確かめも取り消しも無かった。
//   本物の index.html を開き、約束ごとを「データが安全な結果になるか」で見る:
//     ・キャンセルなら1文字も変わらない
//     ・何本変わるか・その値を条件に使っているカスタムリスト（条件は書き換えない）を先に見せる
//     ・バックアップは既定でオン（1本だけのリセットはオフ）。保存できなかったら何もしない
//     ・取り消し（トースト／設定の「元に戻す」）で元どおり。操作の後にまた変えた動画は戻さない
//     ・控えが大きすぎたら localStorage に残さない（ほかのデータの場所を奪わない）。トーストの取り消しは使える
//     ・新しく打った値は選択肢に足す。ほかの動画にある値は勝手に足さない
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 120秒で打ち切り'); process.exit(3); }, 120000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8243;
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 420, height: 1400 }, locale: 'ja-JP', acceptDownloads: true });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
// Firebase は読めないと本体（module）ごと止まるので、何もしない偽物を返す（ログインしていない状態）
const FB_STUB = `(function(){ if (window.firebase) return; const noop=()=>{}; const p=v=>Promise.resolve(v);
  const doc=()=>({get:()=>p({exists:false,data:()=>({})}),set:()=>p(),update:()=>p(),delete:()=>p(),collection,onSnapshot:()=>noop});
  function collection(){ return {doc,get:()=>p({empty:true,docs:[],forEach:noop}),where(){return this},orderBy(){return this},limit(){return this},onSnapshot:()=>noop}; }
  const auth=()=>({onAuthStateChanged:cb=>{setTimeout(()=>cb(null),0);return noop;},signInWithPopup:()=>p({user:null}),signOut:()=>p(),currentUser:null});
  auth.GoogleAuthProvider=function(){this.addScope=noop;this.setCustomParameters=noop;};
  const firestore=()=>({collection,doc,settings:noop,batch:()=>({set:noop,update:noop,delete:noop,commit:()=>p()}),enablePersistence:()=>p(),runTransaction:()=>p()});
  firestore.FieldValue={arrayUnion:(...a)=>a,arrayRemove:(...a)=>a,serverTimestamp:()=>new Date(),delete:()=>null};
  window.firebase={initializeApp:()=>({}),apps:[],auth,firestore,storage:()=>({ref:()=>({put:()=>p(),getDownloadURL:()=>p('')})})}; })();`;
await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FB_STUB }));
const VIEW = [{ id:'_c1', label:'キムラ集', saveMode:'dynamic', icon:'🔄', columns:[], rowData:{}, filterConditions:{ tech:['キムラ'] }, searchQuery:'' }];
await ctx.addInitScript(v => { localStorage.setItem('wk_cv_views', JSON.stringify(v)); localStorage.setItem('wk_lang', 'ja'); }, VIEW);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
let downloads = 0; pg.on('download', () => downloads++);
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 400) : '')); if (!ok) fail++; };
const ev = (fn, a) => pg.evaluate(fn, a);
const tick = (ms = 200) => pg.waitForTimeout(ms);
const V = () => ev(() => JSON.stringify(window.videos.map(v => ({ id: v.id, tb: v.tb, tbNew: v.tbNew, cat: v.cat, pos: v.pos, tags: v.tags, tg: v.tg }))));
const opts = k => ev(k => window.tagPresets(k), k);
// 確かめる画面: ok / キャンセル、バックアップのチェック
const dlg = (ok, backup) => ev(async ([ok, backup]) => {
  await new Promise(r => setTimeout(r, 150));
  const d = document.getElementById('tagops-dlg'); if (!d) return null;
  const r = { text: d.textContent.replace(/\s+/g, ' '), bk: d.querySelector('#tagops-bk').checked };
  if (backup != null) d.querySelector('#tagops-bk').checked = backup;
  d.querySelector(ok ? '#tagops-ok' : '#tagops-no').click();
  await new Promise(r => setTimeout(r, 350));
  return r;
}, [ok, backup]);
const click = sel => ev(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
const Q = '#tag-display-settings ';

await ev(async () => {
  document.querySelectorAll('[id^="ob-"]').forEach(e => e.remove());
  const R = window.tagRegistry; const id = R.createGroup('練習', -1); R.addOption(id, '打ち込み'); window.__nid = id;
  const mk = (i, o) => Object.assign({ id: 't' + i, title: 'V' + i, tb: [], cat: [], pos: [], tags: [], archived: false }, o);
  window.videos.length = 0;
  window.videos.push(mk(1, { tb: ['トップ'], tags: ['キムラ', 'ニーカット'], pos: ['ハーフ'], tg: { [id]: ['打ち込み'] } }), mk(2, { tb: ['ボトム'], tbNew: ['トップ'], tags: ['キムラ'], cat: ['ハーフ'] }),
                     mk(3, { tags: ['幽霊'] }), mk(4, { tags: ['幽霊'], archived: true }));
  const ts = window.tagSettings; const set = (k, a, l) => { const t = ts.find(x => x.key === k); t.presets.length = 0; a.forEach(x => t.presets.push(x)); t.label = l; t.visible = true; };
  set('tb', ['トップ', 'ボトム'], '上下'); set('cat', ['ハーフ'], 'カテゴリ'); set('pos', ['ハーフ'], 'ポジション'); set('tags', ['キムラ', 'ニーカット', 'アームバー'], 'テクニック');
  localStorage.removeItem('wk_tagOpsUndo');
  window.switchTab('settings'); window.renderSettings?.(); await new Promise(r => setTimeout(r, 300));
  document.querySelector('#tag-display-settings [data-act="exp"][data-key="f_tags"]').click();
});
await tick();
const v0 = await V();

console.log('── 選択肢を動画からも外す ──');
await click(Q + '[data-act="rmopt"][data-v="キムラ"]'); await tick(100);
await click(Q + '[data-act="rmall"]');
let d = await dlg(false);
ck('何本変わるかと、その値を条件に使っているカスタムリストの名前を先に見せる', d && /2本の動画のタグが変わります/.test(d.text) && /キムラ集/.test(d.text), d);
ck('バックアップは既定でオン', d && d.bk === true);
ck('★ キャンセルなら1文字も変わらない', await V() === v0 && (await opts('tags')).includes('キムラ'));
await click(Q + '[data-act="rmall"]');
d = await dlg(true, true);
const after1 = JSON.parse(await V());
ck('先にバックアップを保存した', downloads === 1, downloads);
ck('付いている動画から外れ、選択肢からも外れる（ほかの値は無傷）', !after1.some(v => (v.tags || []).includes('キムラ')) && after1[0].tags.includes('ニーカット') && !(await opts('tags')).includes('キムラ'), after1);
ck('カスタムリストの条件は書き換えない', await ev(() => JSON.parse(localStorage.getItem('wk_cv_views'))[0].filterConditions.tech.includes('キムラ')));
await click('#toast .toast-undo-btn'); await tick();
ck('★ トーストの取り消しで元どおり（動画も選択肢も）', await V() === v0 && (await opts('tags')).includes('キムラ'));

console.log('── 名前を変える／まとめる ──');
await ev(() => { document.querySelector('#tag-display-settings [data-act="edit"][data-v="ニーカット"]').click(); });
await tick(100);
await ev(() => { document.getElementById('ts-edit-f_tags').value = 'ニースライス'; document.querySelector('#tag-display-settings [data-act="editok"]').click(); });
d = await dlg(true, false);
let cur = JSON.parse(await V());
ck('名前を変える: 選択肢と動画の値が変わる', cur[0].tags.includes('ニースライス') && !cur[0].tags.includes('ニーカット') && (await opts('tags')).includes('ニースライス'), cur[0]);
await ev(() => { document.querySelector('#tag-display-settings [data-act="edit"][data-v="幽霊"]').click(); });
await tick(100);
await ev(() => { const i = document.getElementById('ts-edit-f_tags'); i.value = 'キムラ'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
d = await dlg(true, false);
cur = JSON.parse(await V());
ck('まとめる: 選択肢に無い値を選択肢の値へ（アーカイブ済みの動画も）', d && /2本/.test(d.text) && cur[2].tags.join() === 'キムラ' && cur[3].tags.join() === 'キムラ', cur);

console.log('── あとから「元に戻す」 ──');
await ev(() => { window.wkSetTagValue(window.videos[2], 'f_tags', 'アームバー', true); window.renderTagShelf(); });
await click(Q + '[data-act="undo"]'); await tick();
cur = JSON.parse(await V());
ck('★ 操作の後にまた変えた動画は戻さない（後の変更を消さない）・変えていない動画は戻る',
  cur[2].tags.join() === 'キムラ,アームバー' && cur[3].tags.join() === '幽霊', cur.slice(2));

console.log('── ここに寄せる・選択肢に無い値を外す ──');
await ev(() => { document.querySelector('#tag-display-settings [data-act="exp"][data-key="f_pos"]').click(); });
await tick(100);
await click(Q + '[data-act="pull"][data-v="ハーフ"]');
d = await dlg(true, false);
cur = JSON.parse(await V());
ck('ここに寄せる: ほかのグループ（カテゴリ）から外してこのグループへ・カテゴリの選択肢からも外す',
  cur[1].pos.includes('ハーフ') && !cur[1].cat.includes('ハーフ') && !(await opts('cat')).includes('ハーフ'), cur[1]);
await ev(() => { window.videos[0].cat.push('迷子'); document.querySelector('#tag-display-settings [data-act="exp"][data-key="f_cat"]').click(); });
await tick(100);
await click(Q + '[data-act="rmghost"][data-v="迷子"]');
d = await dlg(true, false);
cur = JSON.parse(await V());
ck('選択肢に無い値を動画から外す（その値だけ）', !cur[0].cat.includes('迷子') && cur[0].tags.length > 0, cur[0]);

console.log('── バックアップが保存できなかったら何もしない ──');
const vB = await V();
await ev(() => { window.__exp = window.wazaExportLight; window.wazaExportLight = async () => false; });
await ev(() => { document.querySelector('#tag-display-settings [data-act="exp"][data-key="f_tags"]').click(); });
await tick(100);
await click(Q + '[data-act="rmopt"][data-v="アームバー"]'); await tick(100);
await click(Q + '[data-act="rmall"]');
d = await dlg(true, true);
ck('★ バックアップを頼んで保存できなかったら、動画は変えない', d && await V() === vB, d);
await ev(() => { window.wazaExportLight = window.__exp; });

console.log('── タグリセット（動画パネル・まとめて編集）──');
const vR = await V();
await ev(() => window.vpTagReset('t1')); await tick(100);
const rows = await ev(() => [...document.querySelectorAll('#vp-tag-reset-popup [data-reset]')].map(b => b.dataset.reset));
ck('新しいタググループも並ぶ', rows.includes(await ev(() => window.__nid)), rows);
await click('#vp-tag-reset-popup [data-reset="*"]');
d = await dlg(true);
ck('1本だけのリセットは、バックアップ既定オフ', d && d.bk === false, d);
cur = JSON.parse(await V());
ck('すべて外れる（その動画だけ）', !cur[0].tags.length && !cur[0].tb.length && cur[1].tags.length > 0, cur.slice(0, 2));
await click('#toast .toast-undo-btn'); await tick();
ck('取り消しで元どおり', await V() === vR);
await ev(() => { window.selIds = new Set(['t1', 't2']); window.bulkTagReset(); }); await tick(100);
await click('#vp-tag-reset-popup [data-reset="f_tb"]');
d = await dlg(true, false);
cur = JSON.parse(await V());
ck('★ まとめて編集のタグリセットに確かめがある（以前は押すとすぐ外れた）', d && /2本の動画のタグが変わります/.test(d.text), d);
ck('上下だけ外れる（v52.861〜862 で v.tbNew に入った値も）', !cur[0].tb.length && !cur[1].tb.length && !(cur[1].tbNew || []).length && cur[0].tags.length > 0, cur.slice(0, 2));
await click('#toast .toast-undo-btn'); await tick();
ck('取り消しで元どおり（v.tbNew も）', await V() === vR);
ck('まとめて編集・動画パネルのリセットは共通の入口（配列を丸ごと空にしない）',
  /wkTagOps\.openReset/.test(fs.readFileSync(path.join(ROOT, 'js/bulk.js'), 'utf8')) && /wkTagOps\.openReset/.test(fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8'))
  && !/v\[field\] = \[\]|v\[f\] = \[\]/.test(fs.readFileSync(path.join(ROOT, 'js/bulk.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8')));

console.log('── 新しく打った値 ──');
const add = await ev(() => { window.wkSetTagValue(window.videos[2], 'f_tags', '新技', true); window.wkSetTagValue(window.videos[0], 'f_tags', '幽霊', true); window.wkSetTagValue(window.videos[0], window.__nid, 'スパー', true);
  return { tags: window.tagPresets('tags'), map: window.tagRegistry.group(window.__nid).options }; });
ck('新しく打った値は選択肢に足す（今の4つ・新しいグループ）', add.tags.includes('新技') && add.map.includes('スパー'), add);
ck('ほかの動画に付いている値（要確認の値）は勝手に足さない', !add.tags.includes('幽霊'), add);

console.log('── 控えが大きすぎるとき ──');
const big = await ev(async () => {
  const long = 'あ'.repeat(60);
  for (let i = 0; i < 2500; i++) window.videos.push({ id: 'b' + i, title: 'B', tb: [], cat: [], pos: [], tags: ['大量'].concat(Array.from({ length: 8 }, (_, j) => long + j)) });
  const before = localStorage.getItem('wk_tagOpsUndo');
  const p = window.wkTagOps.removeGhost('f_tags', '大量');
  await new Promise(r => setTimeout(r, 150));
  const d = document.getElementById('tagops-dlg'); d.querySelector('#tagops-bk').checked = false; d.querySelector('#tagops-ok').click();
  await p;
  const after = localStorage.getItem('wk_tagOpsUndo') || '[]';
  const removed = !window.videos.some(v => (v.tags || []).includes('大量'));
  document.querySelector('#toast .toast-undo-btn').click();
  await new Promise(r => setTimeout(r, 100));
  return { len: after.length, removed, back: window.videos.filter(v => (v.tags || []).includes('大量')).length, kept: JSON.parse(after).some(r => /大量/.test(r.title)), sameAsBefore: before === after };
});
ck('★ 控えが上限を超えたら localStorage に残さない（ほかのデータの場所を奪わない）', big.len <= 300000 && !big.kept, big);
ck('それでもトーストの取り消しでは戻せる', big.removed && big.back === 2500, big);

ck('操作の間にエラーが出ていない', errs.length === 0, errs);
await b.close(); srv.close();
console.log(fail ? `\n❌ ${fail}件 失敗` : '\n✅ タグをまとめて変える操作: 問題なし');
process.exit(fail ? 1 : 0);
