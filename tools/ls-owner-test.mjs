// localStorage の持ち主判定（js/config.js の wkLs*）を実際に動かして確かめる。
//
// なぜ必要か: ここを書き間違えると
//   (a) 既存ユーザーの端末で急にキャッシュが読めなくなる（体感の劣化）
//   (b) 逆に別アカウントのデータが混ざったまま（直したい不具合が直っていない）
// のどちらかを静かに起こす。どちらも画面を見ただけでは気づけない。
//
// 使い方: node tools/ls-owner-test.mjs
// 終了コード: 0 = 全て期待どおり / 1 = 失敗あり

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');

// js/config.js を、毎回まっさらな localStorage の上で読み込む
function boot(initial = {}) {
  const store = new Map(Object.entries(initial));
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    console: { warn() {}, error() {}, log() {} },
  };
  win.window = win;
  // config.js は window.* にぶら下げるだけの素のスクリプト
  new Function('window', 'localStorage', 'console', 'document', 'Headers', 'fetch', SRC)(
    win, win.localStorage, win.console, {}, class {}, () => {});
  return { win, store };
}

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); fail++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: 期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}`); };

console.log('\n【既存ユーザーの端末】印が無い状態から始まる — 今までどおり動くこと');
t('初回ログインで自分の印が押される', () => {
  const { win, store } = boot({ wk_cv_views: '[A のリスト]' });
  eq(win.wkLsClaim('uid-A'), true, '自分の端末と判定');
  eq(store.get('wk_ls_owner'), 'uid-A', '印');
  eq(win._wkLsForeign, false, 'よそ者フラグ');
});
t('印を押しても既存のキーは消えない・書き換わらない', () => {
  const { win, store } = boot({ wk_cv_views: '[A のリスト]', wk_tagGroups: '[A のグループ]' });
  win.wkLsClaim('uid-A');
  eq(store.get('wk_cv_views'), '[A のリスト]', 'wk_cv_views');
  eq(store.get('wk_tagGroups'), '[A のグループ]', 'wk_tagGroups');
});
t('持ち主は今までどおり読める', () => {
  const { win } = boot({ wk_cv_views: '[A のリスト]' });
  win.wkLsClaim('uid-A');
  eq(win.wkLsGet('wk_cv_views'), '[A のリスト]', '読み取り');
});
t('持ち主は今までどおり書ける', () => {
  const { win, store } = boot({});
  win.wkLsClaim('uid-A');
  eq(win.wkLsSet('wk_cv_views', '[新しい]'), true, '書き込み成功');
  eq(store.get('wk_cv_views'), '[新しい]', '保存された');
});
t('同じ人が2回目にログインしても印は変わらない', () => {
  const { win, store } = boot({});
  win.wkLsClaim('uid-A');
  eq(win.wkLsClaim('uid-A'), true, '2回目');
  eq(store.get('wk_ls_owner'), 'uid-A', '印');
});

console.log('\n【共用端末】A の端末で B がログインする — 混ざらないこと');
t('B は「よそ者」と判定される', () => {
  const { win } = boot({ wk_ls_owner: 'uid-A', wk_cv_views: '[A のリスト]' });
  eq(win.wkLsClaim('uid-B'), false, 'よそ者判定');
  eq(win._wkLsForeign, true, 'フラグ');
});
t('B は A のリストを読めない（クラウドへ持ち込まれない）', () => {
  const { win } = boot({ wk_ls_owner: 'uid-A', wk_cv_views: '[A のリスト]' });
  win.wkLsClaim('uid-B');
  eq(win.wkLsGet('wk_cv_views'), null, '読み取り');
});
t('B は A のタググループ・設定も読めない', () => {
  const { win } = boot({ wk_ls_owner: 'uid-A', wk_tagGroups: '[A]', wk_tagSettings: '[A]', wk_filterPresets: '[A]' });
  win.wkLsClaim('uid-B');
  for (const k of ['wk_tagGroups', 'wk_tagSettings', 'wk_filterPresets']) eq(win.wkLsGet(k), null, k);
});
t('B が操作しても A のキャッシュは壊れない', () => {
  const { win, store } = boot({ wk_ls_owner: 'uid-A', wk_cv_views: '[A のリスト]' });
  win.wkLsClaim('uid-B');
  eq(win.wkLsSet('wk_cv_views', '[B のリスト]'), false, '書き込みは拒否');
  eq(store.get('wk_cv_views'), '[A のリスト]', 'A のデータは無傷');
});
t('B の印で A の印が上書きされない', () => {
  const { win, store } = boot({ wk_ls_owner: 'uid-A' });
  win.wkLsClaim('uid-B');
  eq(store.get('wk_ls_owner'), 'uid-A', '印は A のまま');
});
t('A が戻ってくれば元どおり読み書きできる', () => {
  const { win, store } = boot({ wk_ls_owner: 'uid-A', wk_cv_views: '[A のリスト]' });
  win.wkLsClaim('uid-B');
  eq(win.wkLsGet('wk_cv_views'), null, 'B のとき');
  eq(win.wkLsClaim('uid-A'), true, 'A に戻る');
  eq(win.wkLsGet('wk_cv_views'), '[A のリスト]', 'A のとき');
  eq(win.wkLsSet('wk_cv_views', '[A 更新]'), true, '書ける');
  eq(store.get('wk_cv_views'), '[A 更新]', '保存された');
});

console.log('\n【端の場合】');
t('新品のブラウザで B が最初にログイン → B の端末になる', () => {
  const { win, store } = boot({});
  eq(win.wkLsClaim('uid-B'), true, '判定');
  eq(store.get('wk_ls_owner'), 'uid-B', '印');
});
t('ログアウト（uid なし）ではよそ者判定をしない', () => {
  const { win } = boot({ wk_ls_owner: 'uid-A' });
  win.wkLsClaim('uid-B');
  eq(win._wkLsForeign, true, 'B のとき');
  eq(win.wkLsClaim(null), true, 'ログアウト');
  eq(win._wkLsForeign, false, 'フラグが戻る');
});
t('localStorage が使えない環境でも落ちない', () => {
  const win = { console: { warn() {}, error() {} } };
  win.window = win;
  const ls = { getItem(){ throw new Error('disabled'); }, setItem(){ throw new Error('disabled'); } };
  new Function('window', 'localStorage', 'console', 'document', 'Headers', 'fetch', SRC)(
    win, ls, win.console, {}, class {}, () => {});
  eq(win.wkLsOwner(), '', 'owner');
  eq(win.wkLsClaim('uid-A'), true, 'claim');
  eq(win.wkLsSet('k', 'v'), false, 'set');
  eq(win.wkLsGet('k'), null, 'get');
});
t('ログイン前（判定前）は今までどおり読める', () => {
  const { win } = boot({ wk_cv_views: '[A のリスト]' });
  eq(win._wkLsForeign, false, '初期値');
  eq(win.wkLsGet('wk_cv_views'), '[A のリスト]', '読み取り');
});

console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
