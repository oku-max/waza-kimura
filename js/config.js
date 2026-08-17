// ═══ WAZA KIMURA — 定数定義 ═══
// 旧タグ定数(TB_TAGS/AC_TAGS/POS_TAGS/TECH)は削除済み
// 全てのタグ定義は tag-master.js (TB_VALUES/CATEGORIES/POSITIONS) に一本化

// ── 習得度(status)の正準化・順序（一元管理 v52.559）──
// 正準値: 未着手 / 理解 / 練習中 / マスター
// 旧表記の互換: 把握→理解, 習得中→練習中（保存データに残っていても表示・並び・絞り込みで吸収）
// 新しい習得度ロジックを書くときは必ずこの2つを使う（各ファイルでの再定義は禁止）。
window.STATUS_CANON = ['未着手', '理解', '練習中', 'マスター'];
window.normStatus = function (s) {
  if (s === '把握') return '理解';
  if (s === '習得中') return '練習中';
  return s || '未着手';
};
// 並び順用ランク。旧表記キーも同値で持たせ、生データ混在に耐える。
const _STATUS_ORDER = { '未着手': 0, '理解': 1, '把握': 1, '練習中': 2, '習得中': 2, 'マスター': 3 };
window.statusRank = function (s) { return _STATUS_ORDER[s] ?? 0; };

// ═══ 空状態の案内（v52.694）═══════════════════════════════════
//
// 直したい問題:
//   動画を1本も登録していない人にも「🔍 動画が見つかりませんでした」と出ていた。
//   これは絞り込みの結果が0件のときの文言で、初めて開いた人には何の案内にもならない。
//   新規ユーザーは、何もない画面に放り出される。
//
// 分けて出す:
//   未ログイン        … まずログインしてもらう（しないとデータが端末内に閉じる）
//   ログイン済み・0本 … 最初の1本を入れる導線
//   絞り込みで0件     … 従来どおりの「見つかりませんでした」
//
// 文言は js/i18n.js の STATIC_AUTO に登録済み（英語モードでも表示される）。
window.wkLibraryIsEmpty = function () {
  return !(window.videos && window.videos.length);
};

window.wkEmptyStateHTML = function () {
  const loggedIn = !!(window.firebase && window.firebase.auth && window.firebase.auth().currentUser);

  if (!loggedIn) {
    return `<div class="wk-empty">
      <div class="wk-empty-icon">🥋</div>
      <div class="wk-empty-title">WAZA KIMURA へようこそ</div>
      <p class="wk-empty-lead">散らかった柔術動画を、技・ポジションで整理して探せるようにするアプリです。</p>
      <p class="wk-empty-note">まずログインしてください。ログインしないとデータがこの端末にしか残らず、タブを閉じると消えてしまいます。</p>
      <button class="wk-empty-btn" onclick="window._acctSignIn && window._acctSignIn()">Googleでログイン</button>
      <p class="wk-empty-sub"><a href="welcome.html">できることを見る</a></p>
    </div>`;
  }

  return `<div class="wk-empty">
    <div class="wk-empty-icon">＋</div>
    <div class="wk-empty-title">最初の動画を追加しましょう</div>
    <p class="wk-empty-lead">1本入れるところから始まります。3つのやり方があります。</p>
    <ul class="wk-empty-list">
      <li>動画のURLを貼り付ける（YouTube・Vimeo・Google Drive）</li>
      <li>YouTubeのプレイリストからまとめて選ぶ</li>
      <li>アプリの中でYouTubeを検索して追加する</li>
    </ul>
    <button class="wk-empty-btn" onclick="window.openImportHub && window.openImportHub()">＋ 動画を追加</button>
    <p class="wk-empty-sub"><a href="welcome.html">できることを見る</a></p>
  </div>`;
};

// ═══ この端末の localStorage は誰のものか（v52.693）═══════════════
//
// ── 直したい問題 ──────────────────────────────────────────────
// localStorage のキー（wk_cv_views / wk_tagGroups / wk_tagSettings 等）は
// uid で分かれておらず、ログアウトでも消していない。そのため
// 「Aさんのブラウザで Bさんが初めてログインする」と、
// Aさんのプレイリストや設定が Bさんのデータとしてクラウドに保存される。
//
// 家族の共用PC・道場の端末・人にデモを見せた端末で実際に起きる。
//
// ── なぜ今まで問題にならなかったか ──────────────────────────
// クラウドが空のとき localStorage から復元する処理は、v52.541 の
// カスタムビュー消失事故への対策として正しく入ったもの。
// ただし前提が「クラウドが空 = 復旧すべき既存ユーザー」だった。
// 公開後はこれが「クラウドが空 = 新規ユーザー」に反転する。
//
// ── 直し方（安全側・非破壊）────────────────────────────────
// キーの持ち主を1つの印（wk_ls_owner）で記録するだけにする。
//   印が無い     … 今までどおり。初回ログイン時に現uidで印を押す
//   印 == 自分   … 今までどおり。持ち主なので何も変わらない
//   印 != 自分   … 「よそ者」と判定し、
//                   (1) localStorage を読まない（クラウドへ持ち込まない）
//                   (2) localStorage に書かない（持ち主のキャッシュを壊さない）
//
// ★ 既存のキーは1つも消さない。名前も変えない。
//   非空→空の上書きもしない。印を1つ足すだけ。
//   現オーナーの端末には既に印が無いので、初回ログインで自分の印が付き、
//   以降の挙動は完全に今までどおりになる。
const WK_LS_OWNER_KEY = 'wk_ls_owner';

// よそ者のセッションか。ログイン前は false（＝今までどおり）。
window._wkLsForeign = false;

window.wkLsOwner = function () {
  try { return localStorage.getItem(WK_LS_OWNER_KEY) || ''; } catch (e) { return ''; }
};

// ログイン時に呼ぶ。戻り値 true = この端末のキャッシュを使ってよい。
window.wkLsClaim = function (uid) {
  if (!uid) { window._wkLsForeign = false; return true; }   // ログアウト時は判定しない
  const owner = window.wkLsOwner();
  if (!owner) {
    // まだ誰の印も無い＝この端末のデータはこの人のもの、とみなす。
    // （既存ユーザーの端末は必ずここを通るので、挙動は変わらない）
    try { localStorage.setItem(WK_LS_OWNER_KEY, uid); } catch (e) {}
    window._wkLsForeign = false;
    return true;
  }
  window._wkLsForeign = (owner !== uid);
  if (window._wkLsForeign) {
    console.warn('[wkLs] この端末の保存データは別のアカウントのものです。'
               + 'ローカルキャッシュは読み書きしません（データの混在を防ぐため）。');
  }
  return !window._wkLsForeign;
};

// クラウドに同期される設定を localStorage に書くときはこれを通す。
// よそ者のセッションでは書かない＝持ち主のキャッシュはそのまま残る。
window.wkLsSet = function (key, value) {
  if (window._wkLsForeign) return false;
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
};

// 同上の読み取り側。よそ者には null を返す（＝「保存が無い」と同じ扱い）。
window.wkLsGet = function (key) {
  if (window._wkLsForeign) return null;
  try { return localStorage.getItem(key); } catch (e) { return null; }
};

// ── /api/* 呼び出しに Firebase IDトークンを付ける（共通 v52.692）──
// なぜ: Worker 側で「誰の呼び出しか」を判別し、1人あたりの回数を数えるため。
//   これが無いと、当方のAPIキー（Anthropic/Gemini/AssemblyAI/YouTube）を
//   誰でも無制限に叩ける。詳しくは _worker.js の「認証と利用回数の制限」節。
//
// 使い方: fetch(...) を window.wkFetch(...) に置き換えるだけ。引数・戻り値は fetch と同じ。
//
// 未ログインのときは素の fetch と同じ動作をする（トークンを付けないだけ）。
// Worker 側も既定では未認証を通すので、この時点では体感の変化は無い。
// firebase SDK は index.html でこのファイルより先に読み込まれる。
// 何かの理由で読めていなくても、素の fetch にフォールバックして落ちないようにする。
window.wkIdToken = async function () {
  try {
    const u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
    if (!u) return '';
    return await u.getIdToken();   // 期限切れなら中で自動更新される
  } catch (e) {
    console.warn('[wkFetch] IDトークンを取得できませんでした:', e && e.message);
    return '';
  }
};

window.wkFetch = async function (url, opts) {
  opts = opts || {};
  const t = await window.wkIdToken();
  if (!t) return fetch(url, opts);
  const headers = new Headers(opts.headers || {});
  headers.set('Authorization', 'Bearer ' + t);
  return fetch(url, Object.assign({}, opts, { headers }));
};

// ── vp-dd 系ドロップダウンの開閉トグル（共通 v52.560）──
// 位置決め(_vpOpenDd)は従来どおり共有。開閉・他DDを閉じる・入力クリア/フォーカスの定型を集約。
// opts: { focus=false, clear=true, after(inp) }  戻り値: 開いたら true / 閉じたら false。
window.wkDdToggle = function (dd, opts) {
  opts = opts || {};
  if (!dd) return false;
  const isOpen = dd.style.display !== 'none' && dd.style.display !== '';
  if (isOpen) { dd.style.display = 'none'; return false; }
  document.querySelectorAll('.vp-dd').forEach(d => { if (d !== dd) d.style.display = 'none'; });
  window._vpOpenDd?.(dd);
  const inp = dd.querySelector('.vp-dd-search');
  if (inp && opts.clear !== false) inp.value = '';
  if (inp && opts.focus) inp.focus();
  if (typeof opts.after === 'function') opts.after(inp);
  return true;
};
