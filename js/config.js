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
