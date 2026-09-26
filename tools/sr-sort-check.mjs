#!/usr/bin/env node
// ═══ YouTube検索: 並べ替えた後に押した動画が、押した動画であるかの検査 ═══
// 使い方: node tools/sr-sort-check.mjs
//
// なぜ要るか（2026-09-26「ソートで並びが変わっても実際は変わってない」）:
//   カードの番号 i は並べ替えた後の順で振っていたのに、開く（ytSrOpenVPanel）・
//   ＋（ytSrQuickAdd）・次へ/前へ・結果リストは、並べ替え前の _srItems から同じ番号で引いていた。
//   見た目だけ並びが変わり、押すと別の動画が開く／＋で押していない動画がライブラリに入る。
//   番号で引くのは「画面に出している順」の _srView だけにする。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/yt-search.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

const grab = (name) => {
  const i = src.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
};

// 1) 番号で _srItems を引いている場所が無いこと
const bad = src.split('\n').map((l, i) => [i + 1, l])
  .filter(([, l]) => /_srItems\s*\[/.test(l) || /_srItems\.length\s*-\s*1/.test(l) || /_srItems\.map\(\s*\(\s*item\s*,\s*i\s*\)/.test(l));
bad.length === 0
  ? ok('番号で引く場所は _srItems（並べ替え前）を見ていない')
  : bad.forEach(([n, l]) => fail(`yt-search.js:${n} が並べ替え前の配列を番号で引いている: ${l.trim()}`));

// 2) 開く・＋ が _srView から引くこと
for (const fn of ['ytSrOpenVPanel', 'ytSrQuickAdd']) {
  const b = grab(fn);
  !b ? fail(`${fn} が見つからない`)
     : /_srView\s*\[\s*idx\s*\]/.test(b) ? ok(`${fn} は表示順（_srView）から引く`)
     : fail(`${fn} が表示順から引いていない（並べ替え後に別の動画になる）`);
}
// ＋ は番号がずれても押したカードの動画IDで確かめる（別の動画をライブラリに入れない）
/!==\s*ytId/.test(grab('ytSrQuickAdd') || '') ? ok('＋ は押したカードの動画IDと突き合わせる')
  : fail('＋ が動画IDを確かめずに追加している');

// 3) 描画はいつも並べ替えた順（タブに戻ったときに並びが元に戻らない）
const init = grab('ytSrInit') || '';
/_renderCards\(_srItems\)/.test(src) ? fail('_renderCards(_srItems) がある（並べ替えが解ける／番号がずれる）')
  : ok('描画はいつも _sortedItems() 経由');
/_renderCards\(_sortedItems\(\)\)/.test(init) || !/_renderCards/.test(init)
  ? ok('ytSrInit も並べ替えた順で描く') : fail('ytSrInit が並べ替えていない順で描く');

// 4) 実行: _sortedItems が返す順と _srView が同じであること（長さ順・日付順・関連度順）
const body = [grab('_parseDuration'), grab('_sortedItems')].join('\n');
const sim = new Function('items', 'key', 'dir', `
  let _srItems = items, _srSortKey = key, _srSortDir = dir, _srView = [];
  ${body}
  const shown = _sortedItems();
  return { shown: shown.map(x => x.id.videoId), view: _srView.map(x => x.id.videoId) };`);
const mk = (id, dur, at) => ({ id: { videoId: id }, snippet: { publishedAt: at }, contentDetails: { duration: dur } });
const items = [mk('A', 'PT6M56S', '2025-11-14'), mk('B', 'PT11S', '2025-10-04'), mk('C', 'PT4M31S', '2026-02-20')];
const cases = [['duration', 'desc', 'A,C,B'], ['duration', 'asc', 'B,C,A'], ['publishedAt', 'desc', 'C,A,B'], ['relevance', 'desc', 'A,B,C']];
for (const [k, d, want] of cases) {
  let r; try { r = sim(items, k, d); } catch (e) { fail(`${k}/${d}: 実行できない ${e.message}`); continue; }
  const got = r.shown.join(','), view = r.view.join(',');
  got === want && view === want ? ok(`${k}/${d}: 画面の順 ${got} ＝ 押したときに引く順 ${view}`)
                                : fail(`${k}/${d}: 画面 ${got}・引く順 ${view}（期待 ${want}）`);
}
if (items.map(x => x.id.videoId).join(',') === 'A,B,C') ok('取得した結果（関連度順）は並べ替えで壊れない');
else fail('並べ替えで取得順そのものが変わった（関連度順に戻せない）');

console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 並べ替えた後も、押した動画が開き・追加される');
process.exit(ng ? 1 : 0);
