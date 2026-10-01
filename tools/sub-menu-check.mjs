#!/usr/bin/env node
// ═══ 字幕の入口の検査（v52.915〜）═══
// 使い方: node tools/sub-menu-check.mjs
//
// なぜ要るか:
//   映像の右上に CC / ⚙ を重ねていたが、YouTube本体の CC / 設定が同じ場所に出るので
//   上下に2つ並び、どちらが何なのか分からない画面になっていた（オーナー指摘）。
//   入口は「動画の下のバーの ⚙ メニュー」1つに統一した。この検査は
//   ・映像の上にボタンを置く経路が戻っていないこと
//   ・⚙メニューから字幕を選べて、設定がポップアップで開くこと
//   ・字幕の名前が「日本語：WAZA KIMURA生成」の形で、略語（YT・アプリ）を使っていないこと
//   を見張る。
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = fs.readFileSync(path.join(ROOT, 'js/vpanel.js'), 'utf8');
let ng = 0;
const ok   = (m) => console.log('  ✓', m);
const fail = (m) => { ng++; console.log('  ✗', m); };

// ── ① 映像の上にボタンを置かない ──────────────────────────
const banned = ['_gdSubMountButton', '_ytSubMountButton', '_gdSubPaintButton',
                '_ytSubPaintButton', '_gdSubUiPoke', "wrap.id = 'vp-sub-ui'"];
const alive = banned.filter(n => src.includes(n));
alive.length === 0
  ? ok('映像の上に CC / ⚙ を置く経路は無い')
  : fail(`映像の上のボタンが戻っている: ${alive.join(', ')}`);

// ② 下のバーのボタンは ⚙（••• は何のことか分からない）
/id="vp-more-btn"[^>]*>\s*<svg/.test(src)
  ? ok('下のバーのボタンは ⚙ のアイコン')
  : fail('下のバーのボタンが ••• に戻っている');

// ③ 選択肢は1か所（_subChoices）から作る。Drive と YouTube で画面を分けない
/function _subChoices\(\)/.test(src)
  ? ok('字幕の選択肢は _subChoices() の1か所')
  : fail('_subChoices() が無い（画面ごとに一覧を組み立てている）');
// 設定パネルでは字幕を選ばせない（⚙メニューと二重になる・オーナー指摘 v52.916）
!/sec\('字幕（この動画）'\)/.test(src)
  ? ok('設定パネルに字幕の選択肢を出さない（二重に聞かない）')
  : fail('設定パネルにも字幕の選択肢が出ている（⚙メニューと二重）');

// ④ 名前は「日本語：WAZA KIMURA生成」の形。略語は使わない
/SUB_SRC_LABEL = \{ wk: 'WAZA KIMURA生成', yt: 'YouTube' \}/.test(src)
  ? ok('出所の名前は「WAZA KIMURA生成」「YouTube」')
  : fail('出所の名前が変わっている（略語に戻っていないか）');
/return c\.src \? `\$\{c\.name\}：\$\{SUB_SRC_LABEL\[c\.src\]\}` : c\.name;/.test(src)
  ? ok('「言語：出所」の形で名前を作る')
  : fail('名前の作り方が変わっている');
!/['"`]YT['"`]|＝アプリ|「アプリ」/.test(src.replace(/\/\/.*$/gm, ''))
  ? ok('「YT」「アプリ」という略語を画面に出していない')
  : fail('略語（YT・アプリ）が画面に戻っている');

// ⑤ 設定はメニューに展開せず、別のポップアップで開く
// 並び（v52.937・オーナー「アプリの字幕とYouTubeの字幕の間に見た目の設定を置け。
// YouTubeの字幕だと明らかに分かるように線を引け」）
(src.indexOf("grp.appendChild(cfg);") > 0
  && src.indexOf("grp.appendChild(cfg);") < src.indexOf("sep.className = 'vp-sub-sep'"))
  ? ok('見た目の調整は、アプリの字幕とYouTube本体の間にある')
  : fail('並びが違う（見た目の調整が YouTube の行より下にある）');
/sep\.innerHTML = '<i><\/i><span>ここから下は YouTube 本体<\/span><i><\/i>';/.test(src)
  ? ok('YouTube本体の字幕は線で区切る')
  : fail('区切りが無い（どこからYouTubeか分からない）');
// アプリの字幕の説明に「YouTube」を入れない（紛らわしい・オーナー指摘）
/const how = ai \? 'このアプリが作った字幕（時刻はAIの推測）' : 'このアプリが作った字幕';/.test(src)
  ? ok('アプリの字幕は「このアプリが作った字幕」と書く（YouTubeの語を混ぜない）')
  : fail('アプリの字幕の説明に材料の出どころが戻っている');
/vp-sub-cfg/.test(src) && /_gdSubOpenPanel\(anchor\)/.test(src)
  ? ok('設定は別のポップアップで開く（メニューに展開しない）')
  : fail('設定をメニューの中に展開している');
// 選ぶ行と設定を開く行は別物。同じ部品（_menuItem）で並べない
!/_menuItem\([^)]*'字幕の設定'/.test(src)
  ? ok('「選ぶ」行と「設定を開く」行を同じ形で並べていない')
  : fail('設定の行が選択肢と並列に見える形に戻っている');
/vp-sub-group/.test(src)
  ? ok('字幕のかたまりを枠で囲っている（どこからどこまでか分かる）')
  : fail('字幕の欄がメニューの他の項目と地続きになっている');
// 設定パネルは押した場所に出す（画面の右端に飛ばさない）
/_fitPopup\(pop, anchorEl, \{ anchorRight: true \}\)/.test(src)
  ? ok('設定パネルは ⚙ の位置に出る（画面の端に飛ばない）')
  : fail('設定パネルが押した場所と関係ない所に出る');

// ⑥ 選択肢は縦に1行ずつ（横に流すと「字幕なし」と言語が並んで見分けがつかない）
const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/\.vp-sub-pick \{[^}]*width: 100%/.test(css)
  ? ok('選択肢は1行に1つ（幅いっぱい）')
  : fail('選択肢が横に並んでいる');

// ⑦ 行の作りと CSS の名前が合っていること。
//    字幕が1つも無い状態では行そのものが出ないので、ここだけは静的に見る
//    （クラス名がずれると、見た目が崩れるのに画面は出てしまう）。
const rowCls = ['vp-sub-pick', 'mk', 'tx', 'nm', 'nt'];
const missing = rowCls.filter(c => !new RegExp(`['"\`][^'"\`]*\\b${c}\\b`).test(src));
const noCss   = rowCls.filter(c => !new RegExp(`\\.vp-sub-pick[^{]*\\.${c}\\b|\\.${c}\\b[^{]*\\{`).test(css) && c !== 'vp-sub-pick');
missing.length === 0
  ? ok('行の中身（印・名前・補足）がそろっている')
  : fail(`行の中身が欠けている: ${missing.join(', ')}`);
noCss.length === 0
  ? ok('行のCSSが index.html にある')
  : fail(`CSSが無いクラス: ${noCss.join(', ')}`);


// ── ⑧ YouTube自身の字幕（v52.918・オーナー報告）──────────────
// 「字幕なし」と出ているのに、実際には YouTube の字幕が出ていた。
// 原因は、生成字幕が1つも無い動画で字幕の処理ごと降りていたこと。
// この経路はブラウザで YouTube のプレイヤーを動かさないと再現できないので、
// 戻りやすい4か所を名指しで見張る。
!/^\s*if \(!list\.length\) return;$/m.test(src)
  ? ok('生成字幕が無くても降りない（YouTube側の字幕を探す）')
  : fail('生成字幕が無いと降りてしまう（YouTube側の字幕が候補に出ない）');
/if \(!host && list\.length\) return;/.test(src)
  ? ok('自前の字幕を描く場所が要るのは、生成字幕があるときだけ')
  : fail('描く場所が無いだけで YouTube側の字幕まで諦めている');
/if \(!list\.length && \(!_ytCcPlayed \|\| _ytCcTries < 10\)\) return false;/.test(src)
  ? ok('再生前・探し始めの空配列を「字幕なし」と確定しない')
  : fail('モジュールが用意される前の空配列で「字幕なし」と確定している');
/if \(!_ytCcPlayed && st === 1\)/.test(src)
  ? ok('再生が始まったら探し直す（字幕モジュールは再生後に用意される）')
  : fail('再生開始で探し直していない');
// v52.936 で方針を変えた: 「出す」を押していないなら、YouTube側の字幕も消す。
// 以前は「勝手に消さない」だったが、「字幕なし」なのに YouTube の字幕だけ残り、
// いちばん分からない状態になっていた（オーナー「中途半端」）。
/if \(_ytCcWanted\) return;/.test(src)
  ? ok('「出す」を押したものは、こちらの処理で消さない')
  : fail('出した字幕がすぐ消される');
/function _ytSubAdoptCc\(\)/.test(src) && /_ytSubAdoptCc\(\);\s+\/\//.test(src)
  ? ok('YouTube側で出ている字幕を⚙の表示に映す')
  : fail('画面に出ている字幕と⚙の●がずれる');
/（自動生成）/.test(src) && /YouTubeが自動で作った字幕/.test(src) && /動画に元から付いている字幕/.test(src)
  ? ok('自動生成か、元から付いている字幕かを区別して出す')
  : fail('自動生成かどうかが分からない');
/function _subSearchingYt\(\)/.test(src) && /YouTube側の字幕を探しています/.test(src)
  ? ok('探している間は「字幕がありません」と言い切らない')
  : fail('見つける前に「字幕がありません」と言っている');

// ── 実際に本物の index.html を開いて確かめる ──────────────
const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
const { chromium } = await import(path.join(g, 'playwright', 'index.mjs'));
const PORT = 8233;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(''); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(PORT, r));

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
// 日本語表示で見る（英語表示だと自動翻訳が走り、行の名前が後から変わる）
const ctx = await b.newContext({ viewport: { width: 900, height: 900 }, locale: 'ja-JP' });
await ctx.route(new RegExp(`^https?://(?!localhost:${PORT})`), r => r.abort());
// Firebase が読めないと index.html の本体（module）ごと止まるので、何もしない偽物を返す
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
await ctx.addInitScript(() => { try { localStorage.setItem('wk_lang', 'ja'); } catch (e) {} });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => { const s = String(e); if (!/firebase|gstatic/i.test(s)) errs.push(s.split('\n')[0]); });
pg.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/firebase|gstatic|net::ERR|Failed to load resource/i.test(t)) errs.push(t.split('\n')[0]); });
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(2500);

const r1 = await pg.evaluate(() => {
  const btn = document.createElement('button');
  btn.id = 'vp-more-btn';
  btn.style.cssText = 'position:fixed;top:500px;right:40px;width:30px;height:26px';
  document.body.appendChild(btn);
  btn.onclick = (e) => window.vpTogMoreMenu(e, 'test-video-id');
  btn.click();
  const menu = document.getElementById('vp-more-menu');
  return {
    opened: !!menu,
    labels: [...(menu?.querySelectorAll('.vp-smenu-label') || [])].map(e => e.textContent),
    none:   menu?.querySelector('.vp-sub-none')?.textContent || '',
    cfg:    !!menu?.querySelector('.vp-sub-cfg'),
    head:   menu?.querySelector('.vp-sub-head .t')?.textContent || '',
    group:  !!menu?.querySelector('.vp-sub-group'),
    sync:   typeof window.wkSubMenuSync,
    pick:   typeof window.wkSubPick,
  };
});
r1.opened ? ok('⚙メニューが開く') : fail('⚙メニューが開かない');
r1.head === '字幕' ? ok('字幕の枠に「字幕」の見出しがある') : fail('見出しが無い: ' + JSON.stringify(r1.head));
r1.cfg ? ok('メニューに「字幕の見た目を調整」の行がある') : fail('設定を開く行が無い');
r1.group ? ok('字幕のかたまりが1つの枠になっている') : fail('字幕の枠が描かれていない');
r1.none.includes('字幕はありません') || r1.none.includes('探しています')
  ? ok('字幕が無い動画では状態を書く（空欄にしない）')
  : fail('字幕が無いときの案内が出ない: ' + JSON.stringify(r1.none));

// ⑨ YouTube自身の字幕は、本家のCCボタンと同じことを1行でできること（v52.928）。
//    埋め込みの中のCCボタンは別ドメインで押せない。字幕モジュール（getOption/setOption）は
//    公開されていない機能で、オーナーの画面では一度も返事をしなかった。
//    公式にあるのは読み込み時の cc_load_policy だけなので、そこを使う。
/window\.wkYtCcToggle = function/.test(src)
  ? ok('YouTubeの字幕を出す／消す入口がある')
  : fail('YouTubeの字幕を出せない');
/cc_load_policy: _ytCcWanted \? 1 : 0/.test(src)
  ? ok('公式のパラメータ（cc_load_policy）で出す')
  : fail('公開されていないAPI頼みに戻っている');
/\{ try \{ _ytPlayer\.seekTo\(sec, true\); \} catch \(e\) \{\} \}/.test(src)
  ? ok('作り直したあと、見ていた位置に戻す')
  : fail('位置が頭に戻ってしまう');
// destroy() は iframe ごと消す（公式リファレンス）。置き場所の div を入れ直さないと
// new YT.Player が置き場所を見つけられず、映像ごと消える（v52.932 で踏んだ）。
/if \(host\) host\.innerHTML = `<div id="\$\{divId\}"><\/div>`;/.test(src)
  ? ok('作り直す前に、置き場所の div を入れ直す')
  : fail('div を入れ直していない（押すと映像ごと消える）');
(src.match(/_ytReinit\(/g) || []).length >= 3
  ? ok('プレイヤーの作り直しは1か所（リバースも同じ道を通る）')
  : fail('作り直しが別々に書かれている（片方だけ壊れる）');
/if \(_ytCcWanted\) return;/.test(src)
  ? ok('出した字幕を、こちらの処理が勝手に消さない')
  : fail('出してもすぐ消される');
// 出るのは常に1つだけ・もう一度押したら消す（v52.936・オーナー
// 「『字幕なし』を押してもYouTubeの字幕が出てる」「中途半端」）
/if \(c\.key === 'off'\) continue;/.test(src)
  ? ok('「字幕なし」の行は置かない（同じ行をもう一度押せば消える）')
  : fail('「字幕なし」の行が戻っている');
/const next = on \? 'off' : \(key \|\| 'off'\);/.test(src)
  ? ok('出ている字幕をもう一度押すと消える')
  : fail('もう一度押しても消えない');
/if \(_ytCcWanted\) _ytCcSetWanted\(false\);/.test(src)
  ? ok('こちらの字幕を出すとき、YouTube側の字幕は消す')
  : fail('両方出る（重なる）');
/if \(on\) \{\s*\n\s*if \(_gdSubTracks\.length\) _gdSubSelect\(-1, true\);/.test(src)
  ? ok('YouTubeの字幕を出すとき、こちらの字幕は消す')
  : fail('両方出る（重なる）');
/  if \(_ytCcCurCode\(\)\) _ytCcSet\(null\);\n\}/.test(src)
  ? ok('どれも出していないときは YouTube 側の字幕も消す')
  : fail('「字幕なし」なのに YouTube の字幕が残る');
!/wkYtCcToggle[\s\S]{0,500}confirm\(/.test(src)
  ? ok('押したら出すだけ（確認ダイアログを出さない）')
  : fail('確認ダイアログが戻っている');
!/wkSubShowYt|_subCanImportYt/.test(src)
  ? ok('サーバー経由の「取り込む」は無い（オーナー: ややこしい）')
  : fail('取り込みが戻っている');

// ⑩ 保存してある字幕は「このアプリの字幕」と呼ぶ（v52.931）。
//    中身の元がYouTubeの字幕でも、ファイルを持ち画面に描いているのはこちら。
//    v52.923 でこれを「YouTube」と呼び替え、オーナーに「嘘じゃん」と言われた。
//    「YouTubeの字幕」と名乗ってよいのは、YouTube自身が描くもの（CCを出す行）だけ。
!/YouTubeの字幕をそのまま表示/.test(src)
  ? ok('保存した字幕を「YouTubeの字幕」と名乗らない')
  : fail('アプリの字幕を「YouTubeの字幕」だと言っている');
/src: 'wk',\s*\n\s*note: _subGenNote\(s\.track\),/.test(src)
  ? ok('保存した字幕は WAZA KIMURA のもの・由来は説明の行に書く')
  : fail('保存した字幕の呼び方が変わっている');
r1.sync === 'function' ? ok('後から字幕が見つかったら描き直せる（wkSubMenuSync）') : fail('wkSubMenuSync が生えていない');
r1.pick === 'function' ? ok('選択の入口は wkSubPick の1か所')                  : fail('wkSubPick が生えていない');

const r2 = await pg.evaluate(() => {
  const it = document.querySelector('#vp-more-menu .vp-sub-cfg');
  if (!it) return { err: '行が無い' };
  const btn = document.getElementById('vp-more-btn').getBoundingClientRect();
  it.click();
  const pop = document.getElementById('vp-sub-opts');
  const r = pop?.getBoundingClientRect();
  return { pop: !!pop, menu: !!document.getElementById('vp-more-menu'),
           // 押したボタンの右端に合っているか（画面の右端ではない）
           nearBtn: r ? Math.abs(r.right - btn.right) < 24 : false,
           dup: (pop?.textContent || '').includes('字幕（この動画）') };
});
r2.pop  ? ok('「字幕の設定」で別のポップアップが開く') : fail('ポップアップが開かない: ' + JSON.stringify(r2));
!r2.menu ? ok('ポップアップを開くときメニューは閉じる')  : fail('メニューが開いたまま重なっている');
r2.nearBtn ? ok('ポップアップは ⚙ の位置に出る') : fail('ポップアップが押した場所から離れて出る');
!r2.dup ? ok('ポップアップに字幕の選択肢は出ない') : fail('ポップアップにも字幕の選択肢が出ている');

errs.length === 0 ? ok('JSエラーなし') : fail('JSエラー: ' + errs.join(' / '));

await b.close(); srv.close();
console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 字幕の入口は ⚙ メニュー1つ');
process.exit(ng ? 1 : 0);
