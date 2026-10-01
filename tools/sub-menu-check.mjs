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
// アプリの字幕（選択肢＋見た目の調整）は1枚のカードの中、YouTube本体はその外。
// 文言では区切らない（オーナー「こんな文言いらん。見た目だけで分かるように」）。
// オーナー指示（v52.940）: 「字幕設定のボタンを生成字幕の右端におけ。
// そしたら設定行不要になるだろうが」。
// ⚙ は字幕の行の右端。独立した設定の行は置かない。
// YouTube本体の行には ⚙ が付かないので、調整できる／できないが見た目で分かる。
// 字幕には番号（オーナー「わかりやすいように字幕に番号つけて」）
/<span class="mk">\$\{no\}<\/span>/.test(src) && /no\+\+;/.test(src)
  ? ok('字幕に番号が振られる')
  : fail('番号が無い');
/\.vp-sub-pick\.on \.mk \{[^}]*background: var\(--accent/s
  .test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  ? ok('出ている字幕は番号の丸が塗られる（選択の印を兼ねる）')
  : fail('どれが出ているか分からない');
/cog\.className = 'cog';/.test(src) && /row\.appendChild\(cog\);/.test(src)
  ? ok('⚙ は字幕の行の右端にある')
  : fail('⚙ が行の右端に無い');
/cog\.onclick = \(ev\) => \{[\s\S]{0,200}_gdSubOpenPanel\(anchor\);/.test(src)
  ? ok('行の ⚙ で見た目の設定が開く')
  : fail('⚙ を押しても設定が開かない');
!/vp-sub-cfg/.test(src) && !/vp-sub-cfg/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  ? ok('独立した「字幕の見た目を調整」の行は無い')
  : fail('設定の行が戻っている');
!/vp-sub-ytcc[\s\S]{0,400}className = 'cog'/.test(src)
  ? ok('YouTube本体の行には ⚙ を付けない')
  : fail('YouTube本体の行にも ⚙ が付いている');
/grp\.appendChild\(row\);\s*\n\s*\};/.test(src) && /if \(c\.src === 'yt'\) continue;/.test(src)
  ? ok('YouTube本体の行はカードの外（アプリの字幕のカードには入れない）')
  : fail('YouTube本体の行がアプリの字幕と同じカードに入っている');
// 字幕は全部に番号（オーナー「字幕には全部番号を付けろよ」）
/const mkYt = \(label, note, on, onClick\) => \{\s*\n\s*no\+\+;/.test(src)
  ? ok('YouTube本体の行にも通し番号を振る')
  : fail('YouTubeの行に番号が無い');
// 体言止め（オーナー「『YouTubeの字幕を出す』はおかしい。『YouTube字幕』でいい」）
// 判定はメニューを組み立てる関数の中だけを見る（トースト・コメントは別物）
const menuSrc = src.slice(src.indexOf('function _subMenuBlock'),
                          src.indexOf('function _escHtml'));
!/YouTubeの字幕を出す|YouTubeの字幕を消す/.test(menuSrc) && /mkYt\('YouTube字幕'/.test(menuSrc)
  ? ok('行の名前は「YouTube字幕」（体言止め）')
  : fail('行の名前が元に戻っている');
!/YouTube側で表示・見た目は変えられません/.test(src)
  ? ok('要らない説明文は出さない')
  : fail('説明文が戻っている');
!/ここから下は YouTube 本体/.test(src)
  ? ok('文言で区切っていない')
  : fail('区切りの文言が戻っている');
/\.vp-sub-mine \{/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))
  ? ok('カードのCSSが index.html にある')
  : fail('カードのCSSが無い');
// アプリの字幕の説明に「YouTube」を入れない（紛らわしい・オーナー指摘）
/const how = ai \? 'このアプリが作った字幕（時刻はAIの推測）' : 'このアプリが作った字幕';/.test(src)
  ? ok('アプリの字幕は「このアプリが作った字幕」と書く（YouTubeの語を混ぜない）')
  : fail('アプリの字幕の説明に材料の出どころが戻っている');
/_gdSubOpenPanel\(anchor\)/.test(src)
  ? ok('設定は別のポップアップで開く（メニューに展開しない）')
  : fail('設定をメニューの中に展開している');
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
// YouTubeの字幕は「何語か」と「自動生成か・元から入っているか」を出す
/note: auto \? '自動生成' : '元から入っている字幕',/.test(src)
  && /function _ytCcCurInfo\(\)/.test(src)
  ? ok('YouTubeの字幕は 言語 と 自動生成か を出す')
  : fail('何語か・自動生成かが分からない');
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
    cogs:   (menu?.querySelectorAll('.vp-sub-pick .cog') || []).length,
    rows:   (menu?.querySelectorAll('.vp-sub-pick') || []).length,
    head:   menu?.querySelector('.vp-sub-head .t')?.textContent || '',
    group:  !!menu?.querySelector('.vp-sub-group'),
    sync:   typeof window.wkSubMenuSync,
    pick:   typeof window.wkSubPick,
  };
});
r1.opened ? ok('⚙メニューが開く') : fail('⚙メニューが開かない');
r1.head === '字幕' ? ok('字幕の枠に「字幕」の見出しがある') : fail('見出しが無い: ' + JSON.stringify(r1.head));
!r1.cfg ? ok('独立した設定の行は描かれない') : fail('設定の行が描かれている');
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
  // 字幕が1本も無い動画では ⚙ の行自体が無い（その場合は押せることを見ない）
  const it = document.querySelector('#vp-more-menu .vp-sub-pick .cog');
  if (!it) return { skip: true };
  const btn = document.getElementById('vp-more-btn').getBoundingClientRect();
  it.click();
  const pop = document.getElementById('vp-sub-opts');
  const r = pop?.getBoundingClientRect();
  return { pop: !!pop, menu: !!document.getElementById('vp-more-menu'),
           // 押したボタンの右端に合っているか（画面の右端ではない）
           nearBtn: r ? Math.abs(r.right - btn.right) < 24 : false,
           dup: (pop?.textContent || '').includes('字幕（この動画）') };
});
if (r2.skip) {
  ok('字幕が無い動画では ⚙ の行も出ない（押すところが無い）');
} else {
  r2.pop  ? ok('行の ⚙ で別のポップアップが開く') : fail('ポップアップが開かない: ' + JSON.stringify(r2));
  !r2.menu ? ok('ポップアップを開くときメニューは閉じる')  : fail('メニューが開いたまま重なっている');
  r2.nearBtn ? ok('ポップアップは ⚙ の位置に出る') : fail('ポップアップが押した場所から離れて出る');
  !r2.dup ? ok('ポップアップに字幕の選択肢は出ない') : fail('ポップアップにも字幕の選択肢が出ている');
}

errs.length === 0 ? ok('JSエラーなし') : fail('JSエラー: ' + errs.join(' / '));

await b.close(); srv.close();
console.log(ng ? `\n✗ 失敗 ${ng}件` : '\n✓ 字幕の入口は ⚙ メニュー1つ');
process.exit(ng ? 1 : 0);
