// ═══ タグ設定画面（案A）の検査 ═══
// 使い方: node tools/tag-settings-check.mjs
//
// なぜ要るか:
//   2026-09-21、タグ設定に足した機能が丸ごと画面に出ていなかった。
//   原因は描画先の取り違えで、検査用のHTMLに**自分で器を作って**いたせいで
//   最後まで気づけなかった（CLAUDE.md「作ったのに画面に出ていない」）。
//   同じことを繰り返さないため、この検査は器を index.html から切り出して使う。
//   自分で <div id="..."> を書かない。それがこの検査の肝。
//
//   見るのは案Aの約束ごと:
//     ・設定画面はグループ4行＋整理メニューだけ（下に重複カードが無い）
//     ・行をタップするとモーダルが開く
//     ・モーダルの中で 名前の変更／選択肢の追加・削除／テンプレート／
//       選択肢に無い値 が全部できる
//     ・テンプレートは「中身を見ずに押させない」。開くと中身が出て、
//       入れるものを選んでから足す。済（既にある値）は選べない。
//     ・テンプレートそのものを編集できる（名前・中身・削除・新規）
//     ・整理メニューから禁止リストと一括削除が開く
import http from 'http'; import fs from 'fs'; import path from 'path';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium=(await import(c)).chromium; break; } catch {} }
const ROOT='/home/user/waza-kimura', PORT=8193;
const idx = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
// 実物から「タグ設定の器」と「モーダルの器」をそのまま切り出して使う
const grab = (id) => {
  const i = idx.indexOf(`id="${id}"`);
  if (i < 0) throw new Error('index.html に #' + id + ' が無い');
  const s = idx.lastIndexOf('<div', i);
  let d = 0, j = s;
  while (j < idx.length) {
    if (idx.startsWith('<div', j)) d++;
    else if (idx.startsWith('</div>', j)) { d--; if (!d) return idx.slice(s, j+6); }
    j++;
  }
  throw new Error('閉じタグが見つからない: ' + id);
};
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/style.css"></head><body class="dark">
${grab('tag-display-settings')}
${grab('tag-edit-overlay')}
<script>
 window.__log=[]; window.toast=(m)=>window.__log.push(m);
 window.toastUndo=(m,fn)=>{window.__log.push(m); window.__undo=fn;};
 window.saveUserSettings=()=>{}; window.debounceSave=()=>window.__log.push('save'); window.AF=()=>{};
 window.wazaExportLight=async()=>{ window.__exported=(window.__exported||0)+1; };
 window.videos=[
  {id:'v1',title:'A',tb:['トップ'],cat:['パスガード'],pos:['クローズドガード'],tags:['自分のタグ']},
  {id:'v2',title:'B',tb:[],cat:[],pos:['幽霊ポジション'],tags:[]}];
<\/script>
<script src="/js/tag-master.js"><\/script><script src="/js/tag-templates.js"><\/script>
<script>
 // v52.820 から種入れは組み込みの一覧を入れない（タグはユーザー定義がすべて）。
 // この検査はモーダルの動きを見るものなので、「すでに選択肢を持っているユーザー」を用意する
 // （中身は、v52.813 までに種が入ったオーナーと同じ状態）。
 localStorage.setItem('wk_tagSettings', JSON.stringify([
  {key:'tb',label:'タグ1',visible:true,seeded:true,presets:['トップ','ボトム','スタンディング']},
  {key:'cat',label:'タグ2',visible:true,seeded:true,presets:(window.CATEGORIES||[]).map(c=>c.name)},
  {key:'pos',label:'タグ3',visible:true,seeded:true,presets:(window.POSITIONS||[]).map(p=>p.ja)},
  {key:'tags',label:'タグ4',visible:true,presets:[]}]));
<\/script>
<script type="module">
 import * as S from '/js/settings.js';
 ['tagLabel','tagPresets','renderTagSettingsList','renameTagGroup','applyTagVisibility','applyTagLabels','saveTagSettings'].forEach(n=>{ if(S[n]) window[n]=S[n]; });
 window.tagSettings=S.tagSettings; window.aiSettings=S.aiSettings;
 window.renderTagSettingsList(); window.__ready=true;
<\/script></body></html>`;
const MIME={'.js':'text/javascript','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);
 if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(HTML);}
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end('');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
const ctx=await b.newContext({viewport:{width:390,height:900}}); ctx.setDefaultTimeout(8000);
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERR: '+String(e).split('\n')[0]));
const IGN=/net::ERR|Failed to load resource|gstatic|googleapis|fonts/i;
pg.on('console',m=>{if(m.type()==='error'&&!IGN.test(m.text()))errs.push('CONSOLE: '+m.text().split('\n')[0]);});
await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>window.__ready===true).catch(()=>{});
await pg.waitForTimeout(300);
let fail=0; const ck=(n,ok,d)=>{console.log((ok?'  ✓ ':'  ✗ ')+n+(d&&!ok?'  → '+String(d).slice(0,200):'')); if(!ok)fail++;};
ck('読み込みエラーなし', errs.length===0, errs.join(' | '));

const list=await pg.evaluate(()=>{
  const el=document.getElementById('tag-display-settings');
  return { rows: el.querySelectorAll('button[onclick^="openTagEditModal"]').length,
           txt: el.textContent, toggles: el.querySelectorAll('input[type=checkbox]').length };
});
ck('グループ4行（開くボタンは行あたり2つ）', list.rows===8, JSON.stringify(list.rows));
ck('トグルが4つ', list.toggles===4, String(list.toggles));
ck('整理メニューが出る', /まとめて整理する/.test(list.txt)&&/禁止リスト/.test(list.txt)&&/一括削除/.test(list.txt), list.txt.slice(0,120));
ck('★ 下に重複カードが無い', !/候補値/.test(list.txt), list.txt.slice(0,200));

console.log('\n── モーダルを開く（既定では畳まれている）──');
const m=await pg.evaluate(async()=>{
  window.openTagEditModal('pos'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  return { open: getComputedStyle(document.getElementById('tag-edit-overlay')).display!=='none',
           name: document.getElementById('tm-name')?.value,
           rows: md.querySelectorAll('[data-tm-opt]').length,
           heads: md.querySelectorAll('button[onclick^="_tmToggle"]').length,
           txt: md.textContent };
});
ck('モーダルが開く', m.open===true, JSON.stringify(m.open));
ck('名前欄に現在の名前', !!m.name, String(m.name));
ck('★ 選択肢は畳まれている（行が出ていない）', m.rows===0, '行数 '+m.rows);
ck('畳んだ見出しが3つ（選択肢/テンプレートから追加/選択肢に無い値）', m.heads===3, String(m.heads));
ck('★ テンプレートの見出しが「テンプレートから追加」', /テンプレートから追加/.test(m.txt) && !/まとめて入れる/.test(m.txt), m.txt.slice(0,200));
ck('畳んだ状態でも件数が見える', /27個/.test(m.txt), m.txt.slice(0,160));

console.log('\n── 選択肢を開く ──');
const op=await pg.evaluate(async()=>{
  window._tmToggle('opts'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  const box=md.querySelector('[data-tm-opt]')?.parentElement;
  return { rows: md.querySelectorAll('[data-tm-opt]').length,
           hasQ: !!document.getElementById('tm-q'),
           hasAdd: !!document.getElementById('tm-add'),
           maxH: box ? getComputedStyle(box).maxHeight : null };
});
ck(`開くと選択肢が縦に並ぶ(${op.rows}行)`, op.rows===27, String(op.rows));
ck('絞り込み欄がある', op.hasQ===true);
ck('追加欄がある', op.hasAdd===true);
ck('★ 高さが止まる（壁にならない）', op.maxH==='240px', String(op.maxH));

console.log('\n── 絞り込む ──');
const fl=await pg.evaluate(async()=>{
  window._tmFilter('デラ'); await new Promise(r=>setTimeout(r,80));
  const all=[...document.querySelectorAll('[data-tm-opt]')];
  const vis=all.filter(e=>e.style.display!=='none');
  const focusKept=document.activeElement && document.activeElement.id==='tm-q';
  window._tmFilter(''); await new Promise(r=>setTimeout(r,80));
  const back=[...document.querySelectorAll('[data-tm-opt]')].filter(e=>e.style.display!=='none').length;
  return { hit: vis.length, names: vis.map(e=>e.dataset.tmOpt), back, focusKept };
});
ck(`絞り込める(${fl.hit}件)`, fl.hit>0 && fl.hit<27, JSON.stringify(fl.names));
ck('デラヒーバが残る', fl.names.some(n=>n.includes('デラ')), JSON.stringify(fl.names));
ck('★ 絞り込みで描き直さない（全行そのまま）', fl.back===27, String(fl.back));

console.log('\n── 選択肢に無い値 ──');
const gh=await pg.evaluate(async()=>{
  window._tmToggle('ghost'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  return { keep: md.querySelectorAll('button[onclick^="_tagModalGhostKeep"]').length, txt: md.textContent };
});
ck('★ 開くと選択肢に無い値が出る', gh.keep===1 && /幽霊ポジション/.test(gh.txt), gh.txt.slice(0,200));

console.log('\n── 触ってみる ──');
const act=await pg.evaluate(async()=>{
  const before=window.tagPresets('pos').length;
  document.getElementById('tm-add').value='テスト技';
  window._tagModalAdd('pos'); await new Promise(r=>setTimeout(r,120));
  const added=window.tagPresets('pos');
  window._tagModalRemove('pos','テスト技'); await new Promise(r=>setTimeout(r,120));
  const removed=window.tagPresets('pos');
  window.renameTagGroup('pos','私の分類'); await new Promise(r=>setTimeout(r,120));
  return { before, afterAdd: added.length, hasAdded: added.includes('テスト技'),
           afterDel: removed.length, label: window.tagLabel('pos'),
           rowTxt: document.getElementById('tag-display-settings').textContent };
});
ck('選択肢を追加できる', act.hasAdded && act.afterAdd===act.before+1, JSON.stringify(act));
ck('選択肢を削除できる', act.afterDel===act.before, JSON.stringify(act));
ck('★ 名前を変えられる', act.label==='私の分類', act.label);
ck('行の表示にも反映', /私の分類/.test(act.rowTxt), act.rowTxt.slice(0,120));

console.log('\n── テンプレートから追加（中身を見てから選ぶ）──');
const tp1=await pg.evaluate(async()=>{
  window._tmToggle('tpl'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  return { rows: md.querySelectorAll('button[onclick^="_tmTplPeek"]').length,
           chips: md.querySelectorAll('button[onclick^="_tmPickVal"]').length,
           hasNew: !!md.querySelector('button[onclick^="_tmTplNew"]'),
           txt: md.textContent };
});
ck('テンプレートが並ぶ（行あたり2つのボタン）', tp1.rows===8, String(tp1.rows));
ck('★ 開いただけでは中身は出ていない', tp1.chips===0, String(tp1.chips));
ck('「＋ テンプレートを作る」がある', tp1.hasNew===true);
ck('行に件数と「すでにある」数が出る', /27個・27個はすでにある/.test(tp1.txt), tp1.txt.slice(0,400));

const tp2=await pg.evaluate(async()=>{
  // 「ポジション」テンプレ（中身27個＝いまの選択肢と同じ）を開く
  window._tmTplPeek('pos'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  const chips=[...md.querySelectorAll('button[onclick^="_tmPickVal"]')];
  const before=window.tagPresets('pos').length;
  // 済はタップしても選べない
  chips[0].click(); await new Promise(r=>setTimeout(r,120));
  const after1=[...document.querySelectorAll('button[onclick^="_tmPickVal"]')];
  // 0個選択のまま追加を押しても何も起きない
  document.querySelector('button[onclick^="_tmTplApply"]')?.click(); await new Promise(r=>setTimeout(r,120));
  return { n: chips.length,
           done: chips.filter(b=>b.textContent.trim().startsWith('済')).length,
           disabled: chips.filter(b=>b.disabled).length,
           pickedAfterClick: after1.filter(b=>b.textContent.trim().startsWith('✓')).length,
           btn: document.querySelector('button[onclick^="_tmTplApply"]')?.textContent.trim(),
           before, afterApply: window.tagPresets('pos').length };
});
ck(`中身が全部出る(${tp2.n}個)`, tp2.n===27, String(tp2.n));
ck('★ すでにある値は「済」', tp2.done===27, String(tp2.done));
ck('★ 済は押せない（disabled）', tp2.disabled===27, String(tp2.disabled));
ck('★ 済をタップしても選ばれない', tp2.pickedAfterClick===0, String(tp2.pickedAfterClick));
ck('選ぶものが無いときのボタン文言', tp2.btn==='入れるものを選んでください', String(tp2.btn));
ck('★ 0個選択で押しても増えない', tp2.afterApply===tp2.before, `${tp2.before}→${tp2.afterApply}`);

const tp3=await pg.evaluate(async()=>{
  // 「練習ステータス」＝3個ともまだ無い → 開くと全部選ばれている
  window._tmTplPeek('practice'); await new Promise(r=>setTimeout(r,150));
  const picked=()=>[...document.querySelectorAll('button[onclick^="_tmPickVal"]')].filter(b=>b.textContent.trim().startsWith('✓')).length;
  const p0=picked();
  const btn0=document.querySelector('button[onclick^="_tmTplApply"]').textContent.trim();
  // 1個外す
  document.querySelectorAll('button[onclick^="_tmPickVal"]')[0].click(); await new Promise(r=>setTimeout(r,120));
  const p1=picked();
  const btn1=document.querySelector('button[onclick^="_tmTplApply"]').textContent.trim();
  const before=window.tagPresets('pos').slice();
  document.querySelector('button[onclick^="_tmTplApply"]').click(); await new Promise(r=>setTimeout(r,180));
  const after=window.tagPresets('pos').slice();
  return { p0, p1, btn0, btn1, before, after,
           kept: before.every(x=>after.includes(x)),
           hasDropped: after.includes('要復習'),
           hasPicked: after.includes('試合で使う') && after.includes('できた'),
           collapsed: document.querySelectorAll('button[onclick^="_tmPickVal"]').length===0,
           toast: window.__log[window.__log.length-1] };
});
ck('まだ無い値は最初から選ばれている', tp3.p0===3, String(tp3.p0));
ck('ボタンに実数が出る', tp3.btn0==='選んだ3個を追加', tp3.btn0);
ck('タップで外せる', tp3.p1===2 && tp3.btn1==='選んだ2個を追加', `${tp3.p1} / ${tp3.btn1}`);
ck('★ 選んだぶんだけ増える(+2)', tp3.after.length===tp3.before.length+2, `${tp3.before.length}→${tp3.after.length}`);
ck('★ 既存の選択肢が1つも消えない', tp3.kept===true);
ck('★ 外した値は入らない', tp3.hasDropped===false);
ck('選んだ値は入る', tp3.hasPicked===true);
ck('追加したら畳まれる', tp3.collapsed===true);
ck('件数を知らせる', /2件/.test(String(tp3.toast)), String(tp3.toast));

const tp4=await pg.evaluate(async()=>{
  // 入れた分は次に開くと「済」になっている
  window._tmTplPeek('practice'); await new Promise(r=>setTimeout(r,150));
  const chips=[...document.querySelectorAll('button[onclick^="_tmPickVal"]')];
  return { done: chips.filter(b=>b.textContent.trim().startsWith('済')).length };
});
ck('★ 入れた分は次から「済」', tp4.done===2, String(tp4.done));

console.log('\n── テンプレートそのものを編集する ──');
const ed=await pg.evaluate(async()=>{
  window._tmTplEdit('practice'); await new Promise(r=>setTimeout(r,150));
  const md=document.getElementById('tag-edit-modal');
  const nameInput=document.getElementById('tm-tpl-name');
  const r={ isEditor: /テンプレートを編集/.test(md.textContent),
            name: nameInput?.value,
            vals: md.querySelectorAll('button[onclick^="_tmTplDelVal"]').length,
            hasAdd: !!document.getElementById('tm-tpl-add'),
            hasDelete: !!md.querySelector('button[onclick^="_tmTplDelete"]') };
  // 名前を変える
  window._tmTplRename('practice','わたしの型'); await new Promise(r2=>setTimeout(r2,150));
  r.renamed = window.tagTemplate('practice')?.name;
  // 中身を足す
  document.getElementById('tm-tpl-add').value='新しい中身';
  window._tmTplAddVal('practice'); await new Promise(r2=>setTimeout(r2,150));
  r.afterAdd = window.tagTemplate('practice').values.length;
  r.hasNewVal = window.tagTemplate('practice').values.includes('新しい中身');
  // 中身を消す
  window._tmTplDelVal('practice', window.tagTemplate('practice').values.indexOf('新しい中身'));
  await new Promise(r2=>setTimeout(r2,150));
  r.afterDel = window.tagTemplate('practice').values.length;
  // 戻る
  window._tmTplBack(); await new Promise(r2=>setTimeout(r2,150));
  r.backToGroup = !!document.getElementById('tm-name');
  r.listName = document.getElementById('tag-edit-modal').textContent.includes('わたしの型');
  return r;
});
ck('✎で編集画面になる', ed.isEditor===true);
ck('名前欄に現在の名前', ed.name==='練習ステータス', String(ed.name));
ck('中身が並ぶ(3個)', ed.vals===3, String(ed.vals));
ck('中身を足す欄がある', ed.hasAdd===true);
ck('削除ボタンがある', ed.hasDelete===true);
ck('★ 名前を変えられる', ed.renamed==='わたしの型', String(ed.renamed));
ck('★ 中身を足せる', ed.afterAdd===4 && ed.hasNewVal, `${ed.afterAdd} / ${ed.hasNewVal}`);
ck('★ 中身を消せる', ed.afterDel===3, String(ed.afterDel));
ck('‹ で元のグループに戻る', ed.backToGroup===true);
ck('一覧にも新しい名前が出る', ed.listName===true);

const nw=await pg.evaluate(async()=>{
  const n0=window.tagTemplates().length;
  window._tmTplNew(); await new Promise(r=>setTimeout(r,180));
  const inEditor=/テンプレートを編集/.test(document.getElementById('tag-edit-modal').textContent);
  const n1=window.tagTemplates().length;
  const id=window.tagTemplates()[n1-1].id;
  window._tmTplBack(); await new Promise(r=>setTimeout(r,150));
  // 消す（confirm は素通しする）
  const oc=window.confirm; window.confirm=()=>true;
  const optsBefore=window.tagPresets('pos').length;
  window._tmTplDelete(id); await new Promise(r=>setTimeout(r,180));
  window.confirm=oc;
  return { n0, n1, n2: window.tagTemplates().length, inEditor,
           optsBefore, optsAfter: window.tagPresets('pos').length };
});
ck('★ テンプレートを新しく作れる', nw.n1===nw.n0+1, `${nw.n0}→${nw.n1}`);
ck('作ったらそのまま編集画面', nw.inEditor===true);
ck('★ テンプレートを消せる', nw.n2===nw.n0, `${nw.n1}→${nw.n2}`);
ck('★ テンプレートを消しても選択肢は残る', nw.optsAfter===nw.optsBefore, `${nw.optsBefore}→${nw.optsAfter}`);

const sv=await pg.evaluate(()=>{
  const raw=localStorage.getItem('wk_tagTemplates');
  const p=raw?JSON.parse(raw):null;
  // 全部消しても見本が復活しないこと
  window.tagTemplateSetValues && null;
  const ids=window.tagTemplates().map(t=>t.id);
  ids.forEach(id=>window.tagTemplateDelete(id));
  const empty=window.tagTemplates().length;
  const raw2=localStorage.getItem('wk_tagTemplates');
  return { saved: !!(p && Array.isArray(p.list)), empty,
           stillSeeded: !!(raw2 && JSON.parse(raw2).seeded),
           remote: typeof window.getTagTemplatesRaw==='function' && !!window.getTagTemplatesRaw() };
});
ck('編集した内容が保存されている', sv.saved===true);
ck('クラウドに渡す形になっている', sv.remote===true);
ck('★ 全部消したら空のまま（見本が勝手に戻らない）', sv.empty===0 && sv.stillSeeded===true, JSON.stringify(sv));

console.log('\n── 整理メニュー ──');
const pn=await pg.evaluate(async()=>{
  window._openBulkTagDelete(); await new Promise(r=>setTimeout(r,150));
  const a=document.getElementById('tag-edit-modal').textContent;
  window._openBlocklist(); await new Promise(r=>setTimeout(r,150));
  const b=document.getElementById('tag-edit-modal').textContent;
  return { bulk:/一括削除/.test(a)&&/バックアップ/.test(a), block:/禁止リスト/.test(b) };
});
ck('一括削除パネルが開く', pn.bulk===true, JSON.stringify(pn));
ck('禁止リストパネルが開く', pn.block===true, JSON.stringify(pn));

console.log('\n── 最後までのエラー ──');
errs.length ? errs.forEach(e=>{console.log('  ✗ '+e); fail++;}) : console.log('  ✓ なし');
console.log(fail?`\n✗ 問題 ${fail}件`:'\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail?1:0);
