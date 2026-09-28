// ═══ タグ設定画面の検査（段階3b・v52.860 で作り直し） ═══
// 使い方: node tools/tag-settings-check.mjs
//
// なぜ要るか:
//   2026-09-21、タグ設定に足した機能が丸ごと画面に出ていなかった。
//   検査用のHTMLに**自分で器を作って**いたせいで最後まで気づけなかった
//   （CLAUDE.md「作ったのに画面に出ていない」）。だからこの検査は本物の index.html を開く。
//
//   v52.860 で旧画面（4行＋モーダル・テンプレート・一括削除）を
//   js/tag-settings-ui.js の新しい画面に置き換えた。見るのはその約束ごと:
//     ・「使用中のタグ」にタグ1〜4の4行、「未使用のタググループ」は畳んで出る
//     ・使う場所を変えると入れ替わる（2つのグループが同じ枠に入らない）
//     ・名前・選択肢の追加・削除・「選択肢に無いタグ」を選択肢に入れる・検索の対象・
//       ほかからコピー・初期値に戻す・空いた枠に入れる・新しく作る・非表示の再表示
//     ・マーク／習得は使う場所を選べる（段階5）が、選択肢は固定
//     ・行の左の ⠿ をドラッグしてタグ1〜4を並べ替えられる
//     ・★ どの操作も**動画のデータを変えない**（選択肢から外しても、動画のタグは残る）
//     ・旧画面（モーダル・テンプレート・一括削除）が戻っていない
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
setTimeout(() => { console.log('⏱ 90秒で打ち切り'); process.exit(3); }, 90000).unref?.();
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium = (await import(c)).chromium; break; } catch {} }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8193;
const LOC = process.argv[2] === 'en' ? 'en' : 'ja';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(PORT, r));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 420, height: 1400 }, locale: LOC === 'en' ? 'en-US' : 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
// Firebase は読めないと index.html の本体（module）ごと止まるので、何もしない偽物を返す（ログインしていない状態）
const FB_STUB = `(function(){ if (window.firebase) return;
  const noop=()=>{}; const p=(v)=>Promise.resolve(v);
  const doc=()=>({ get:()=>p({exists:false,data:()=>({})}), set:()=>p(), update:()=>p(),
                   delete:()=>p(), collection, onSnapshot:()=>noop });
  function collection(){ return { doc, get:()=>p({empty:true,docs:[],forEach:noop}),
                                  where(){return this}, orderBy(){return this}, limit(){return this},
                                  onSnapshot:()=>noop }; }
  const auth=()=>({ onAuthStateChanged:(cb)=>{ setTimeout(()=>cb(null),0); return noop; },
                    signInWithPopup:()=>p({user:null}), signOut:()=>p(), currentUser:null });
  auth.GoogleAuthProvider=function(){ this.addScope=noop; this.setCustomParameters=noop; };
  const firestore=()=>({ collection, doc, settings:noop, batch:()=>({set:noop,update:noop,delete:noop,commit:()=>p()}),
                         enablePersistence:()=>p(), runTransaction:()=>p() });
  firestore.FieldValue={ arrayUnion:(...a)=>a, arrayRemove:(...a)=>a, serverTimestamp:()=>new Date(), delete:()=>null };
  window.firebase={ initializeApp:()=>({}), apps:[], auth, firestore,
                    storage:()=>({ ref:()=>({ put:()=>p(), getDownloadURL:()=>p('') }) }) };
 })();`;
await ctx.route(/gstatic\.com\/firebasejs/i, r => r.fulfill({ status:200, contentType:'text/javascript', body: FB_STUB }));
await ctx.addInitScript(l => { localStorage.setItem('wk_lang', l); }, LOC);
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (d !== undefined && !ok ? '  → ' + JSON.stringify(d).slice(0, 300) : '')); if (!ok) fail++; };
const ev = (fn, arg) => pg.evaluate(fn, arg);
console.log(`── 表示言語: ${LOC} ──`);

// ── 準備: 動画と選択肢・旧テンプレート1つ ──
await ev(() => {
  const mk = (i, tb, cat, pos, tags) => ({ id:'t'+i, ytId:'abcdefghij'+i, pt:'youtube', title:'V'+i, tb, cat, pos, tags, status:'未着手', fav:false, watched:false, archived:false, memo:'' });
  window.videos.length = 0;
  window.videos.push(mk(1,['トップ'],['パスガード'],['ハーフガード'],['キムラ']), mk(2,['ボトム'],[],['ハーフガード'],[]),
                     mk(3,['トップ'],['スイープ'],['クローズドガード'],['ニーカット']), mk(4,[],[],[],['キムラ']));
  const ts = window.tagSettings;
  const set = (k, a, l) => { const t = ts.find(x => x.key === k); t.presets.length = 0; a.forEach(x => t.presets.push(x)); t.label = l; t.visible = true; };
  set('tb',['トップ','ボトム'],'トップ/ボトム'); set('cat',['パスガード','スイープ'],'カテゴリ');
  set('pos',['ハーフガード','クローズドガード'],'ポジション'); set('tags',['キムラ'],'テクニック');
  window.tagRegistry.reconcile({ seeded:true, list:[{ id:'u1', name:'練習メニュー', values:['打ち込み','スパー','キムラ'] }] });
  window.__markSlot = JSON.stringify(window.tagRegistry.slots().map(g => g && g.id));   // 初めての reconcile でマークがタグ4に入る（オーナー決定 2026-09-28）
  window.tagRegistry.setSlot('f_tags', 3);   // この検査は テクニック＝タグ4 の並びで見る（マークは未使用へ）
  window.__vsnap = JSON.stringify(window.videos);
  document.querySelectorAll('[id^="ob-"]').forEach(e => e.remove());
  window.switchTab('settings'); window.renderSettings?.();
});
await pg.waitForTimeout(300);

const Q = '#tag-display-settings ';
const click = (sel) => ev(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, Q + sel);
const change = (id, val) => ev(([id, val]) => { const e = document.getElementById(id); if (!e) return false; e.value = val; e.dispatchEvent(new Event('change', { bubbles:true })); return true; }, [id, val]);
const slots = () => ev(() => window.tagRegistry.slots().map(g => g && g.id));
const tick = () => pg.waitForTimeout(150);
// 行を開く（すでに開いていれば何もしない。未使用の中にあれば先に未使用を開く）
const rowState = (key) => ev(s => { const e = document.querySelector(s); return e ? (e.querySelector('.ts-car')?.textContent === '▲' ? 'open' : 'closed') : 'none'; }, `${Q}[data-act="exp"][data-key="${key}"]`);
const expand = async (key) => {
  if (await rowState(key) === 'none') { await click('[data-act="unopen"]'); await tick(); }
  if (await rowState(key) === 'closed') { await click(`[data-act="exp"][data-key="${key}"]`); await tick(); }
  return await rowState(key) === 'open'; };

console.log('\n── 画面の形 ──');
const shape = await ev(s => { const el = document.querySelector(s); return { rows: el ? el.querySelectorAll('.ts-row').length : -1,
  unused: !!el?.querySelector('[data-act="unopen"]'), text: el?.textContent || '' }; }, '#tag-display-settings');
ck('描画先 #tag-display-settings が index.html にあり、中身が描かれる', shape.rows >= 4, shape.rows);
ck('未使用のタググループは畳んで出る', shape.unused);
ck('初めての一覧の整えで、マークがタグ4に入る（いたテクニックは未使用へ）', await ev(() => window.__markSlot) === '["f_tb","f_cat","f_pos","mark"]', await ev(() => window.__markSlot));
ck('今の枠はタグ1〜4が 上下/カテゴリ/ポジション/テクニック', JSON.stringify(await slots()) === '["f_tb","f_cat","f_pos","f_tags"]', await slots());

console.log('\n── 使う場所・名前 ──');
await expand('f_tags'); await change('ts-slot-f_tags', '0'); await tick();
ck('★ テクニックをタグ1へ → 入れ替わる（同じ枠に2つ入らない）', JSON.stringify(await slots()) === '["f_tags","f_cat","f_pos","f_tb"]', await slots());
await expand('f_tags'); await change('ts-name-f_tags', '技'); await tick();
ck('名前の変更は tagSettings に入る（一覧に名前を複製しない）', await ev(() => window.tagSettings.find(t => t.key === 'tags').label === '技' && window.tagRegistry.raw().groups?.find?.(g => g.id === 'f_tags')?.name === undefined));

console.log('\n── 選択肢 ──');
await expand('f_tags');
await ev(() => { document.getElementById('ts-add-f_tags').value = 'スパー'; });
await click('[data-act="addopt"][data-gid="f_tags"]'); await tick();
ck('選択肢を足せる', await ev(() => window.tagPresets('tags').includes('スパー')));
ck('ほかのグループにもある名前は知らせる', await ev(s => !!document.querySelector(s), Q + '.ts-warn'));
ck('「選択肢に無いタグ」に動画にだけある値（ニーカット）が出る', await ev(s => !!document.querySelector(s), `${Q}[data-act="keep"][data-v="ニーカット"]`));
await click('[data-act="keep"][data-v="ニーカット"]'); await tick();
ck('「選択肢に入れる」で選択肢に入る', await ev(() => window.tagPresets('tags').includes('ニーカット')));
await click('[data-act="rmopt"][data-v="キムラ"]'); await tick();
ck('× はすぐ消さず、確認を出す', await ev(() => window.tagPresets('tags').includes('キムラ')) && await ev(s => !!document.querySelector(s), Q + '.ts-confirm'));
await click('[data-act="rmoptok"]'); await tick();
const rm = await ev(() => ({ opts: window.tagPresets('tags'), inVideos: window.videos.filter(v => (v.tags || []).includes('キムラ')).length }));
ck('★ 確認後、選択肢からだけ外れる（動画のタグ「キムラ」は2本とも残る）', !rm.opts.includes('キムラ') && rm.inVideos === 2, rm);

console.log('\n── 検索・コピー・初期値 ──');
const s0 = await ev(() => window.tagRegistry.group('f_tags').search);
await click('[data-act="search"][data-gid="f_tags"]'); await tick();
const s1 = await ev(() => window.tagRegistry.group('f_tags').search);
await click('[data-act="search"][data-gid="f_tags"]'); await tick();
ck('検索の対象にする を切り替えられる', s0 !== s1 && s0 === await ev(() => window.tagRegistry.group('f_tags').search), [s0, s1]);
await click('[data-act="copy"][data-gid="f_tags"]'); await tick();
await click('[data-act="copyfrom"][data-gid="t_u1"]'); await tick();
await click('[data-act="copydo"]'); await tick();
ck('ほかのグループ（練習メニュー）から選択肢をコピーできる', await ev(() => ['打ち込み','スパー'].every(x => window.tagPresets('tags').includes(x))), await ev(() => window.tagPresets('tags')));
await expand('f_tb');
await ev(() => { window.tagOptAdd('tb', '自分の値'); window.renameTagGroup('tb', '上下'); window.renderTagShelf(); });
await click('[data-act="defone"][data-gid="f_tb"]'); await tick();
const df = await ev(() => ({ label: window.tagSettings.find(t => t.key === 'tb').label, opts: window.tagPresets('tb') }));
ck('初期値に戻す: 名前が戻り、足りない既定値が入り、自分で足した値は残る',
  /^(トップ\/ボトム|Top\/Bottom)$/.test(df.label) && df.opts.includes('スタンディング') && df.opts.includes('自分の値'), df);

console.log('\n── 空いた枠・新しいグループ ──');
await change('ts-slot-f_tb', '-1'); await tick();
const free = (await slots()).indexOf(null);
ck('未使用にすると枠が空く', free >= 0, await slots());
await expand('slot' + free); await click('[data-act="fillslot"][data-gid="t_u1"]'); await tick();
ck('空いた枠に未使用のグループ（練習メニュー）を入れられる', (await slots())[free] === 't_u1', await slots());
await expand('t_u1');
await ev(() => { const i = document.getElementById('ts-add-t_u1'); i.value = 'ドリル'; i.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); });
await tick();
ck('新しいグループの選択肢は一覧（registry）に入る', await ev(() => window.tagRegistry.group('t_u1').options.includes('ドリル')));
await change('ts-slot-t_u1', '-1'); await tick();
const free2 = (await slots()).indexOf(null);
await expand('slot' + free2); await click('[data-act="newgroup"]'); await tick();
ck('空いた枠から新しく作れる', /^n_/.test((await slots())[free2] || ''), await slots());

console.log('\n── 非表示・マーク／習得 ──');
await ev(() => { window.tagSettings.find(t => t.key === 'pos').visible = false; window.renderTagShelf(); });
const badge = await ev(s => document.querySelector(s)?.textContent || '', `${Q}[data-act="exp"][data-key="f_pos"]`);
await expand('f_pos'); await click('[data-act="show"]'); await tick();
ck('非表示のグループは「非表示中」と出て、「表示する」で戻る', /非表示中|hidden/i.test(badge) && await ev(() => window.tagSettings.find(t => t.key === 'pos').visible === true), badge);
await expand('mark');
const mk = await ev(q => ({ disabled: document.getElementById('ts-slot-mark')?.disabled, x: document.querySelectorAll(q + '[data-act="rmopt"][data-gid="mark"]').length,
  add: !!document.getElementById('ts-add-mark'), edit: document.querySelectorAll(q + '[data-act="edit"][data-gid="mark"]').length }), Q);
ck('マーク: 普通のタググループ（v52.876）。使う場所を選べ、選択肢も足す・外す・名前を変えられる', mk.disabled === false && mk.x === 3 && mk.add && mk.edit === 3, mk);
ck('マーク: 選択肢が固定という説明が出ない', !(await ev(q => [...document.querySelectorAll(q + '.ts-hint')].some(e => /固定|fixed/i.test(e.textContent)), Q)));

console.log('\n── ドラッグで並べ替え（タグ1〜4の行）──');
{
  await ev(() => { document.querySelectorAll('#tag-display-settings [data-act="exp"]').forEach(() => {}); window.renderTagShelf(); });
  const before = await slots();
  const gb = await pg.locator(Q + '[data-grip="0"]').boundingBox();
  const rb = await pg.locator(Q + '.ts-slot[data-k="2"]').boundingBox();
  ck('行の左につかむ所（⠿）がある（4行とも）', await ev(q => document.querySelectorAll(q + '.ts-slot [data-grip]').length, Q) === 4);
  if (gb && rb) {
    const x = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = rb.y + rb.height / 2;
    await pg.mouse.move(x, y0); await pg.mouse.down();
    for (let i = 1; i <= 10; i++) { await pg.mouse.move(x, y0 + (y1 - y0) * i / 10); await pg.waitForTimeout(15); }
    await pg.mouse.up(); await tick(300);
  }
  const after = await slots();
  const want = before.slice(); const [m] = want.splice(0, 1); want.splice(2, 0, m);
  ck('★ タグ1の行をタグ3の位置へドラッグすると、その順番になる（間の行が1つずつ上がる）', JSON.stringify(after) === JSON.stringify(want), { before, after });
  ck('並びは一覧に保存される（端末の控え）', await ev(w => JSON.stringify(JSON.parse(localStorage.getItem('wk_tagRegistry')).slots) === w, JSON.stringify(want)));
}

console.log('\n── データ ──');
ck('★★ ここまでの操作で動画のデータは1文字も変わっていない', await ev(() => JSON.stringify(window.videos) === window.__vsnap));
ck('画面を触っている間にエラーが出ていない', errs.length === 0, errs);

console.log('\n── 旧画面が戻っていない ──');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const set = fs.readFileSync(path.join(ROOT, 'js/settings.js'), 'utf8');
ck('旧モーダルの器 #tag-edit-overlay が無い', !idx.includes('tag-edit-overlay'));
ck('旧モーダル・テンプレート適用・一括削除の関数が無い', !/openTagEditModal|_tmTplApply|_bulkTagDelete|_openBulkTagDelete/.test(set));
ck('一覧は tag-settings-ui.js が描く（settings.js は呼ぶだけ）', /renderTagShelf/.test(set) && idx.includes('js/tag-settings-ui.js'));

await b.close(); srv.close();
console.log(fail ? `\n❌ ${fail}件 失敗` : '\n✅ タグ設定画面: 問題なし');
process.exit(fail ? 1 : 0);
