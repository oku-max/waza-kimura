// ═══ 選択肢の種入れがユーザーのデータを壊さないかの検査 ═══
// 使い方: node tools/tag-seed-check.mjs
//
// なぜ要るか:
//   v52.803 で、タググループの選択肢をユーザーのもの（tagSettings.presets）にした。
//   空のままだと何を入れればいいか分からないので、初回だけサンプルを種として入れる。
//   ここは CLAUDE.md のルール1（非空→空の上書き禁止）に真正面からぶつかる場所で、
//   間違えるとユーザーが育てた選択肢やグループ名が起動のたびに書き換わる。
//
//   静的な読みでは確かめられない。実際に localStorage を用意して起動し、
//   3つの経路で「消えない・勝手に復活しない」ことを見る:
//     A. まっさら          → 種が入る
//     B. ユーザーが育てた後 → そのまま。空にしたグループが勝手に復活しない
//     C. 旧バージョンから   → 名前も既存の値も保たれ、空だったところだけ埋まる
//     D. ログインでクラウドの設定が降ってきた → 同じことがそこでも起きる
//
//   Bの「空にしたグループが復活しない」が一番大事。seeded を立てて再実行を止めている。
import http from 'http'; import fs from 'fs'; import path from 'path';
const { execSync } = await import('child_process');
let chromium;
for (const c of ['playwright', path.join(execSync('npm root -g',{encoding:'utf8'}).trim(),'playwright','index.mjs')]) {
  try { chromium=(await import(c)).chromium; break; } catch {} }
const ROOT='/home/user/waza-kimura', PORT=8182;
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>window.toast=()=>{};window.saveUserSettings=()=>{};window.videos=[];<\/script>
<script src="/js/tag-master.js"><\/script>
<script type="module">
 import * as S from '/js/settings.js';
 window.S=S; window.tagPresets=S.tagPresets; window.tagSettings=S.tagSettings; window.__ready=true;
<\/script></body></html>`;
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);
 if(p==='/'){r.writeHead(200,{'Content-Type':'text/html'});return r.end(HTML);}
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end('');}
 r.writeHead(200,{'Content-Type':'text/javascript'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(PORT,r));
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch(fs.existsSync(exe)?{executablePath:exe}:{});
let fail=0; const ck=(n,ok,d)=>{console.log((ok?'  ✓ ':'  ✗ ')+n+(d&&!ok?'  → '+String(d).slice(0,240):'')); if(!ok)fail++;};

async function boot(stored, remote) {
  const ctx=await b.newContext(); ctx.setDefaultTimeout(8000);
  await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`),r=>r.abort());
  if (stored) await ctx.addInitScript(v=>localStorage.setItem('wk_tagSettings',v), JSON.stringify(stored));
  const pg=await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForFunction(()=>window.__ready===true).catch(()=>{});
  // remote を渡したら「ログインしてクラウドの設定が降ってきた」状態を再現する
  if (remote) await pg.evaluate(r=>window.S.applyRemoteSettings({tagSettings:r}), remote);
  const out=await pg.evaluate(()=>({
    presets:['tb','cat','pos','tags'].map(k=>window.tagPresets(k)),
    seeded:window.tagSettings.map(t=>!!t.seeded),
    saved:JSON.parse(localStorage.getItem('wk_tagSettings')||'null'),
  }));
  await ctx.close(); out.errs=errs; return out;
}

console.log('── A. まっさらな状態（初回）──');
const a=await boot(null);
ck('エラーなし', a.errs.length===0, a.errs.join('|'));
ck(`種入れされる tb=${a.presets[0].length} cat=${a.presets[1].length} pos=${a.presets[2].length}`,
   a.presets[0].length===3&&a.presets[1].length===10&&a.presets[2].length===27, JSON.stringify(a.presets.map(p=>p.length)));
ck('seeded が保存される', a.seeded.every(Boolean)&&a.saved&&a.saved.every(t=>t.seeded===true), JSON.stringify(a.seeded));

console.log('\n── B. ユーザーが自分の選択肢を持っている（seeded済み）──');
const userStored=[
  {key:'tb',label:'自分のTB',visible:true,presets:['立ち','寝'],seeded:true},
  {key:'cat',label:'自分のCAT',visible:true,presets:['自分の値'],seeded:true},
  {key:'pos',label:'自分のPOS',visible:true,presets:[],seeded:true},
  {key:'tags',label:'自分のTAG',visible:true,presets:['技A'],seeded:true},
];
const bb=await boot(userStored);
ck('エラーなし', bb.errs.length===0, bb.errs.join('|'));
ck('ユーザーの選択肢がそのまま', JSON.stringify(bb.presets[0])===JSON.stringify(['立ち','寝'])&&JSON.stringify(bb.presets[1])===JSON.stringify(['自分の値']), JSON.stringify(bb.presets));
ck('★ 空にした選択肢が勝手に復活しない（pos=[]のまま）', bb.presets[2].length===0, JSON.stringify(bb.presets[2]));
ck('ユーザーのグループ名がそのまま', JSON.stringify(bb.saved.map(t=>t.label))===JSON.stringify(['自分のTB','自分のCAT','自分のPOS','自分のTAG']), JSON.stringify(bb.saved.map(t=>t.label)));

console.log('\n── C. 旧バージョンからの移行（seeded が無い・選択肢も空）──');
const oldStored=[
  {key:'tb',label:'トップ/ボトム/スタンディング',visible:true,presets:['トップ','ボトム','スタンディング']},
  {key:'cat',label:'カテゴリ',visible:true,presets:[]},
  {key:'pos',label:'ポジション',visible:true,presets:[]},
  {key:'tags',label:'テクニック',visible:true,presets:['アームバー']},
];
const c=await boot(oldStored);
ck('エラーなし', c.errs.length===0, c.errs.join('|'));
ck('旧ユーザーのグループ名が保たれる', JSON.stringify(c.saved.map(t=>t.label))===JSON.stringify(['トップ/ボトム/スタンディング','カテゴリ','ポジション','テクニック']), JSON.stringify(c.saved.map(t=>t.label)));
ck('空だった cat/pos に種が入る', c.presets[1].length===10&&c.presets[2].length===27, JSON.stringify(c.presets.map(p=>p.length)));
ck('既にあった tags の値は残る', c.presets[3].includes('アームバー'), JSON.stringify(c.presets[3]));
ck('既にあった tb の値も残る', JSON.stringify(c.presets[0])===JSON.stringify(['トップ','ボトム','スタンディング']), JSON.stringify(c.presets[0]));

console.log('\n── D. ログインでクラウドの旧設定が降ってくる（v52.813 の回帰）──');
// v52.803 より前は cat/pos の選択肢を保存していなかった（画面が辞書を直接読んでいた）。
// その設定がクラウドから降ってくると、起動時に入れた種ごと空で上書きされ、
// 取り込み画面のカテゴリ欄が丸ごと消えた。実際にオーナーの画面で起きた。
const remoteOld=[
  {key:'tb',label:'TOP/BOTTOM',visible:true,presets:['トップ','ボトム','スタンディング']},
  {key:'cat',label:'CATEGORY',visible:true,presets:[]},
  {key:'pos',label:'POSITION',visible:true,presets:[]},
  {key:'tags',label:'テクニック',visible:true,presets:[]},
];
const d=await boot(null, remoteOld);
ck('エラーなし', d.errs.length===0, d.errs.join('|'));
ck('★ クラウドの旧設定でも cat の選択肢が空にならない', d.presets[1].length===10, JSON.stringify(d.presets[1].length));
ck('★ pos も空にならない', d.presets[2].length===27, JSON.stringify(d.presets[2].length));
ck('クラウド側のグループ名は尊重される', JSON.stringify(d.saved.map(t=>t.label))===JSON.stringify(['TOP/BOTTOM','CATEGORY','POSITION','テクニック']), JSON.stringify(d.saved.map(t=>t.label)));
ck('クラウドに入っていた tb の値はそのまま', JSON.stringify(d.presets[0])===JSON.stringify(['トップ','ボトム','スタンディング']), JSON.stringify(d.presets[0]));

console.log('\n── E. クラウド側で「意図して空にした」グループは空のまま ──');
const remoteEmptied=[
  {key:'tb',label:'TB',visible:true,presets:['立ち'],seeded:true},
  {key:'cat',label:'CAT',visible:true,presets:[],seeded:true},
  {key:'pos',label:'POS',visible:true,presets:['デラヒーバ'],seeded:true},
  {key:'tags',label:'TAG',visible:true,presets:[],seeded:true},
];
const e=await boot(null, remoteEmptied);
ck('エラーなし', e.errs.length===0, e.errs.join('|'));
ck('★ 意図して空にした cat が勝手に復活しない', e.presets[1].length===0, JSON.stringify(e.presets[1]));
ck('★ 意図して空にした tags も復活しない', e.presets[3].length===0, JSON.stringify(e.presets[3]));
ck('育てた値はそのまま', JSON.stringify(e.presets[0])===JSON.stringify(['立ち'])&&JSON.stringify(e.presets[2])===JSON.stringify(['デラヒーバ']), JSON.stringify(e.presets));

console.log(fail?`\n✗ 問題 ${fail}件`:'\n✓ 問題なし');
await b.close(); srv.close(); process.exit(fail?1:0);
