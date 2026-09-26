// ═══ 読み込みのたびの変換が、ユーザーのタグを消していないかの検査 ═══
// 使い方: node tools/tag-keep-check.mjs
//
// なぜ要るか:
//   firebase.js の _applyVideosData は、動画を読み込むたびに migrateAllVideos を通す。
//   その中の _remapOldCatNames は v52.842 まで、組み込みの CATEGORIES（10個）に無い
//   カテゴリの値を動画から捨てていた。タグはユーザー定義がすべて（v52.803〜）なので、
//   ユーザーが自分で足したカテゴリの値が、次の読み込み＋保存で黙って消える経路だった。
//   読み込みの変換は「旧名の付け替え」だけにし、ほかの値は1つも落とさない。
//   ブラウザ不要（tag-master.js を node の vm で動かす）。
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window:{}, localStorage:{ getItem(){ return null; }, setItem(){} }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/tag-master.js'), 'utf8'), ctx);
let fail = 0; const ck = (n, ok, d) => { console.log((ok ? '  ✓ ' : '  ✗ ') + n + (!ok && d ? '  → ' + d : '')); if (!ok) fail++; };
const mig = ctx.window.migrateAllVideos;
ck('migrateAllVideos がある', typeof mig === 'function');
const vids = [
  { id:'a', tb:['トップ'], cat:['アタック','自分のカテゴリ','パスガード'], pos:['自分のポジション'], tags:['自分のタグ'] },
  { id:'b', tb:['自分の上下'], cat:['ドリル練習'], pos:[], tags:[] },
  { id:'c', cat:['⭐ お気に入り'], tags:[] },
];
const out = mig(JSON.parse(JSON.stringify(vids)));
ck('★ 組み込みに無いカテゴリの値を消さない', JSON.stringify(out[0].cat) === JSON.stringify(['フィニッシュ','自分のカテゴリ','パスガード']), JSON.stringify(out[0].cat));
ck('★ カテゴリが全部自分の値でも消さない', JSON.stringify(out[1].cat) === JSON.stringify(['ドリル練習']), JSON.stringify(out[1].cat));
ck('絵文字入りの値も消さない', JSON.stringify(out[2].cat) === JSON.stringify(['⭐ お気に入り']), JSON.stringify(out[2].cat));
ck('旧名は付け替える（アタック→フィニッシュ）', out[0].cat.includes('フィニッシュ') && !out[0].cat.includes('アタック'));
ck('ほかのグループの値もそのまま', JSON.stringify([out[0].tb, out[0].pos, out[0].tags, out[1].tb]) === JSON.stringify([['トップ'],['自分のポジション'],['自分のタグ'],['自分の上下']]), JSON.stringify([out[0].tb, out[0].pos, out[0].tags, out[1].tb]));
console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ 問題なし');
process.exit(fail ? 1 : 0);
