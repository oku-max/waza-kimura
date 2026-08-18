// 空状態（動画0本）の案内の出し分けを実際に動かして確認する。
//
// なぜ必要か: 新規ユーザーが最初に見る画面。ここを間違えると
//   (a) ログイン前なのに「動画を追加」ボタンが出る（押しても何も起きない）
//   (b) 1本でも動画があるのに案内が出続ける
// のどちらかになるが、自分のアカウントには動画が入っているので気づけない。
//
// 使い方: node tools/empty-state-test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
function boot(videos, loggedIn) {
  const win = { videos, console:{warn(){},error(){},log(){}},
    firebase: loggedIn ? { auth: () => ({ currentUser: { uid:'u' } }) } : { auth: () => ({ currentUser: null }) },
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}} };
  win.window = win;
  new Function('window','localStorage','console','document','Headers','fetch',SRC)(win,win.localStorage,win.console,{},class{},()=>{});
  return win;
}
let pass=0, fail=0;
const t=(n,f)=>{try{f();console.log('  ✅ '+n);pass++}catch(e){console.log('  ❌ '+n+'\n     '+e.message);fail++}};
const has=(s,sub,m)=>{ if(!s.includes(sub)) throw new Error(`${m}: "${sub}" が入っていない`); };
const not=(s,sub,m)=>{ if(s.includes(sub)) throw new Error(`${m}: "${sub}" が入ってしまっている`); };

t('未ログイン → ログインを促す', () => {
  const w = boot([], false); const h = w.wkEmptyStateHTML();
  has(h,'WAZA KIMURA へようこそ','見出し'); has(h,'_acctSignIn','ログインボタン');
  not(h,'openImportHub','追加ボタンは出さない');
});
t('ログイン済み・0本 → 追加を促す', () => {
  const w = boot([], true); const h = w.wkEmptyStateHTML();
  has(h,'最初の動画を追加しましょう','見出し'); has(h,'openImportHub','追加ボタン');
  not(h,'_acctSignIn','ログインボタンは出さない');
});
t('0本かどうかの判定', () => {
  if (boot([], true).wkLibraryIsEmpty() !== true) throw new Error('0本を空と判定していない');
  if (boot([{id:1}], true).wkLibraryIsEmpty() !== false) throw new Error('1本あるのに空と判定した');
  const w = boot(undefined, true);
  if (w.wkLibraryIsEmpty() !== true) throw new Error('videos 未定義で落ちる/判定が違う');
});
t('welcome.html への導線がある', () => {
  has(boot([], false).wkEmptyStateHTML(),'welcome.html','未ログイン');
  has(boot([], true).wkEmptyStateHTML(),'welcome.html','ログイン済み');
});
console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail?1:0);
