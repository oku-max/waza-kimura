// ═══ WAZA KIMURA — タグマスタ (4層タグ体系) ═══
// 4 layers: TB → Category → Position → #Tag
// TB     : 起点。AI 自動判定。トップ/ボトム/スタンディング (複数可)
// Cat    : 10 個固定 (ユーザー編集可)。AI が説明文を読んで分類
// Pos    : 21 個固定 (ボトム系のみ)。AI 自動判定
// #Tag   : 自由記入。サイドバー非表示。
//          ルールベース抽出あり: TECHNIQUE_BUILTIN（組み込み技名辞書）+ ユーザー既存タグ語彙

// ─── Layer 1: TB ─────────────────────────────────────
const TB_VALUES = ['トップ', 'ボトム', 'スタンディング'];

// ─── Layer 2: Category (10 fixed, user editable) ─────
// ════════════════════════════════════════════════════
// name    : 表示名
// desc    : カテゴリの定義（何を指すか）
// aliases : 分類用の語彙。**検索には使わない**（v52.821。技名がカテゴリに化けて棚の6割に
//           当たっていたため）。terms も同じで、入れてよいのは**その名前の直訳と形違いだけ**。
//           別の言い方（reversal / throw / guard recovery / submission 等）は入れない。
//           検査 search-dict-check ⑦ が、増えたら赤くする。
//
// カテゴリ定義:
//   エスケープ・ディフェンス = 不利ポジションから逃げる・守る動作
//   ガード構築・エントリー   = 特定ガードへの入り方・作り方
//   ガードリテンション       = 足を切られないようにガードを保持する動作
//   コントロール／プレッシャー= トップからポジションを維持・支配する動作
//   コンセプト・原理         = 技そのものではなく考え方・理論・哲学
//   スイープ                 = ボトムから相手をひっくり返してトップを取る動作
//   テイクダウン             = 立ち技から相手を地面に連れ込む動作（投げ含む）
//   バックテイク・バックアタック = バックポジションを取る・バックから攻める動作
//   パスガード               = 相手のガードを越えてトップサイドを取る動作
//   フィニッシュ             = タップを取りにいく絞め技・関節技・極め技
// ════════════════════════════════════════════════════
// aliases はすべて Alias Builder でユーザーが承認したものだけを記載する
// Claude が直接書くことは禁止。Alias Builder → /api/alias/add 経由のみ
// terms : 検索用の英語表記（コード定数。Firestore の別名同期は aliases のみ上書きするため消えない）
//         英語タイトルの動画を日本語で検索したときに拾うために使う。
const CATEGORIES = [
  { id: 'escape',    name: 'エスケープ・ディフェンス',     tb: '中立',           desc: '不利ポジションからの脱出と防御',             aliases: [] },
  { id: 'entry',     name: 'ガード構築・エントリー',       tb: 'ボトム',         desc: 'ガードを取る・特定ガードの入り口',           aliases: [] },
  { id: 'retention', name: 'ガードリテンション',           tb: 'ボトム',         desc: '足を取られないボトムの守り',                 aliases: [] },
  { id: 'control',   name: 'コントロール／プレッシャー',   tb: '中立',           desc: 'トップポジションの維持・押さえ',             aliases: [] },
  { id: 'concept',   name: 'コンセプト・原理',             tb: '中立',           desc: '技ではない原則的な学び',                     aliases: [] },
  { id: 'sweep',     name: 'スイープ',                     tb: 'ボトム',         desc: 'ボトムから相手をひっくり返す動作',           aliases: [] },
  { id: 'takedown',  name: 'テイクダウン',                 tb: 'スタンディング', desc: '立ちから相手を倒す動作（投げ技含む）',       aliases: [] },
  { id: 'back',      name: 'バックテイク・バックアタック', tb: '中立',           desc: 'バックを取る／バックからの攻撃',             aliases: [] },
  { id: 'pass',      name: 'パスガード',                   tb: 'トップ',         desc: '相手のガードを越えてトップを取る動作',       aliases: [] },
  { id: 'finish',    name: 'フィニッシュ',                 tb: '中立',           desc: 'チョーク・関節技など相手を極めにいく動作',   aliases: [] },
];

// ─── Layer 3: Position (27 fixed) ────────────────────
// ja : 日本語表示 / en : 英語名 / aliases : 検索ヒット用
// ※ admin-dashboard.js の DEFAULT_POSITIONS と同期すること
const POSITIONS = [
  // ── 数字・アルファベット ──
  { id: 'fifty',     ja: '50/50',                en: '50/50',               aliases: ['5050','フィフティフィフティ','fifty fifty'] },
  { id: 'seventy',   ja: '70/30ガード',          en: '70/30 Guard',         aliases: ['70/30','seventy thirty'] },
  { id: 'kguard',    ja: 'Kガード',              en: 'K Guard',             aliases: ['K-Guard','ケーガード'] },
  { id: 'slx',       ja: 'SLX',                  en: 'Single Leg X',        aliases: ['シングルレッグX','シングルレッグXガード','Single X','single leg x guard'] },
  { id: 'xguard',    ja: 'Xガード',              en: 'X Guard',             aliases: ['X-Guard','エックスガード'] },
  // ── あいうえお順 ──
  { id: 'inverted',  ja: 'インバーテッド',       en: 'Inverted Guard',      aliases: ['Inverted','トルネードガード','Tornado Guard'] },
  { id: 'open',      ja: 'オープンガード',       en: 'Open Guard',          aliases: ['open guard','手ぶらガード','no grip guard'] },
  { id: 'octopus',   ja: 'オクトパスガード',     en: 'Octopus Guard',       aliases: ['Octopus','octopus guard'] },
  { id: 'collar',    ja: '片襟片袖',             en: 'Collar Sleeve',       aliases: ['Collar Sleeve Guard','カラースリーブ','collar and sleeve'] },
  { id: 'closed',    ja: 'クローズドガード',     en: 'Closed Guard',        aliases: ['Closed','クロガ','フルガード','full guard'] },
  { id: 'cross',     ja: 'クロスガード',         en: 'Cross Guard',         aliases: ['cross guard'] },
  { id: 'saddle',    ja: 'サドル',               en: 'Saddle',              aliases: ['411','4-11','Inside Sankaku','インサイドサンカク','Honey Hole'] },
  { id: 'situp',     ja: 'シッティングガード',   en: 'Sit-Up Guard',        aliases: ['シットアップガード','sit up guard','sitting guard','seated guard'] },
  { id: 'slguard',   ja: 'シングルレッグガード', en: 'Single Leg Guard',    aliases: ['single leg guard'] },
  { id: 'standing',  ja: 'スタンディング',       en: 'Standing',            aliases: ['Stand Up','立ち','立ち技'] },
  { id: 'spider',    ja: 'スパイダーガード',     en: 'Spider Guard',        aliases: ['Spider','スパイダ'] },
  { id: 'other',     ja: 'その他',               en: 'Other',               aliases: [] },
  { id: 'turtle',    ja: 'タートル',             en: 'Turtle',              aliases: ['Turtle Position','亀'] },
  { id: 'deephalf',  ja: 'ディープハーフ',       en: 'Deep Half Guard',     aliases: ['Deep Half Guard','Deep Half','ディープ'] },
  { id: 'dlr',       ja: 'デラヒーバ',           en: 'De La Riva',          aliases: ['DLR','De La Riva Guard','デラヒバ'] },
  { id: 'kneeshield',ja: 'ニーシールド',         en: 'Knee Shield',         aliases: ['Z Guard','Z-Guard','Zガード'] },
  { id: 'half',      ja: 'ハーフガード',         en: 'Half Guard',          aliases: ['Half','ハーフ'] },
  { id: 'butterfly', ja: 'バタフライガード',     en: 'Butterfly Guard',     aliases: ['Butterfly','バタフラ'] },
  { id: 'lasso',     ja: 'ラッソーガード',       en: 'Lasso Guard',         aliases: ['Lasso','ラッソ'] },
  { id: 'lapel',     ja: 'ラペルガード',         en: 'Lapel Guard',         aliases: ['Lapel'] },
  { id: 'rdlr',      ja: 'リバースデラヒーバ',   en: 'Reverse De La Riva',  aliases: ['RDLR','Reverse DLR','リバデラ'] },
  { id: 'revhalf',   ja: 'リバースハーフガード', en: 'Reverse Half Guard',  aliases: ['リバースハーフ','reverse half','reverse half guard'] },
];

// ─── 表記ゆれ正規化 ────────────────────────────────
// 同一視ルール:
//   ・大小文字
//   ・全角/半角 (英数字)
//   ・カタカナ/ひらがな
//   ・長音 (ー)
//   ・区切り記号 (空白・- _ / ・)
//   ・末尾「ガード」「Guard」
// 半角カナ → 全角カナ（ｽｲｰﾌﾟ ＝ スイープ）。濁点・半濁点の合字も1文字に直す。
const _HK_D = 'ｶﾞｷﾞｸﾞｹﾞｺﾞｻﾞｼﾞｽﾞｾﾞｿﾞﾀﾞﾁﾞﾂﾞﾃﾞﾄﾞﾊﾞﾋﾞﾌﾞﾍﾞﾎﾞﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟｳﾞ';
const _FK_D = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポヴ';
const _HK_S = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮｰ･';
const _FK_S = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョー・';
function _hankakuKana(v) {
  if (!/[\uFF61-\uFF9F]/.test(v)) return v;
  let out = '';
  for (let i = 0; i < v.length; i++) {
    const two = v.substr(i, 2);
    const d = _HK_D.indexOf(two);
    if (d >= 0 && d % 2 === 0) { out += _FK_D[d / 2]; i++; continue; }
    const k = _HK_S.indexOf(v[i]);
    out += (k >= 0) ? _FK_S[k] : v[i];
  }
  return out;
}
window._hankakuKanaTag = _hankakuKana;

function _norm(s) {
  if (s == null) return '';
  let v = _hankakuKana(String(s));
  // 全角英数 → 半角
  v = v.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // カタカナ → ひらがな
  v = v.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  v = v.toLowerCase();
  // 長音・区切りを除去
  v = v.replace(/[ー\-_/\s・,.、。]+/g, '');
  // 末尾「がーど / guard」を除去（"デラヒーバ"≡"デラヒーバガード" を同一視するため）。
  // ただし除去後が1文字に潰れる語（'Kガード'→'k' / 'Xガード'→'x'）は、_termHit が
  // 1文字キーを誤爆源として弾くため永久に一致しなくなる。その場合だけ除去しない。
  // （'ガード'単体は除去後が空文字になり、従来どおり空のまま＝rawGuardCheck が担当）
  const _core = v.replace(/(がーど|がど|guard)$/i, '');
  v = (_core.length === 1) ? v : _core;
  return v;
}

// ── 全角→半角＋小文字化（ASCII語の単語境界マッチ用） ──
function _rawLower(s) {
  return _hankakuKana(String(s == null ? '' : s))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}

// ── 語句マッチ共通ヘルパー ──────────────────────────
// ASCII語  : 単語境界つき正規表現（'pass' が 'compass' に当たらない）
// 日本語等 : _norm 正規化後の部分一致
// 正規化後1文字に縮退するキー（'kガード'→'k' 等）は誤爆源のため不採用
function _termHit(term, rawLower, tNorm) {
  if (!term) return false;
  if (/^[\x20-\x7E]+$/.test(term)) {
    const core = term.toLowerCase().trim();
    if (core.replace(/[\s\-_]+/g, '').length < 2) return false;
    const esc = core
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/[\s\-_]+/g, '[\\s\\-_]+');
    // 末尾の複数形（s / es）は同じ語として扱う。'heel hook' で "Heel Hooks"、'guillotine' で "guillotines" に当てるため。
    return new RegExp('(^|[^a-z0-9])' + esc + '(?:e?s)?($|[^a-z0-9])').test(rawLower);
  }
  const n = _norm(term);
  return n.length >= 2 && tNorm.includes(n);
}

// 正規化済みエイリアステーブルを構築
function _buildPositionIndex() {
  const idx = new Map(); // normKey → position
  for (const p of POSITIONS) {
    const keys = [p.id, p.ja, p.en, ...(p.aliases || [])];
    for (const k of keys) {
      const n = _norm(k);
      if (n && !idx.has(n)) idx.set(n, p);
    }
  }
  return idx;
}
const POSITION_INDEX = _buildPositionIndex();

function _buildCategoryIndex() {
  const idx = new Map();
  for (const c of CATEGORIES) {
    // aliases（ユーザー/AIが登録した「この語はこのカテゴリに入る」の分類キーワード）は
    // 索引に入れない。入れると「ロングステップ」のような技名がカテゴリ「パスガード」に化け、
    // そのカテゴリの別名全部(117語)に展開されて棚の6割に当たっていた（v52.821 で実測）。
    // 索引に置くのは、そのカテゴリ自身の名前と、その日英表記(terms)だけ。
    const keys = [c.id, c.name];
    for (const k of keys) {
      const n = _norm(k);
      if (n && !idx.has(n)) idx.set(n, c);
    }
  }
  return idx;
}
let CATEGORY_INDEX = _buildCategoryIndex();

// ── 検索辞書を引く索引（表は1枚だけ。SEARCH_DICT）──
let _SEARCH_INDEX = null;
function _buildSearchIndex() {
  const idx = new Map();
  for (const row of SEARCH_DICT) {
    for (const w of row) {
      const n = _norm(w);
      if (n && n.length >= 2 && !idx.has(n)) idx.set(n, row);
    }
  }
  return idx;
}
window.rebuildSearchIndex = function() { _SEARCH_INDEX = null; };

// 任意の語からポジション/カテゴリーを引く（タグの層の話。検索はここを見ない）
function findPosition(q) { return POSITION_INDEX.get(_norm(q)) || null; }
function findCategory(q) { return CATEGORY_INDEX.get(_norm(q)) || null; }

// ── 検索語 → 同じものの別の書き方（これが検索辞書の唯一の入口）──
// 「デラヒーバ」→ ['デラヒーバ','De La Riva','DLR','デラヒバ',…]
// 引くのは SEARCH_DICT だけ。ポジション/カテゴリの別名やユーザーの分類キーワードは見ない。
// （2026-09-24、そこを見ていたせいで「ロングステップ」が棚の6割に当たっていた）
function aliasNamesFor(q) {
  const n = _norm(q);
  if (!n) return [];
  if (!_SEARCH_INDEX) _SEARCH_INDEX = _buildSearchIndex();
  const row = _SEARCH_INDEX.get(n);
  return row ? row.slice() : [];
}

// 任意の語が任意のポジション/カテゴリーにマッチするか
function matchPosition(q, p) {
  const n = _norm(q);
  if (!n) return false;
  const keys = [p.id, p.ja, p.en, ...(p.aliases || [])].map(_norm);
  return keys.some(k => k && (k === n || k.includes(n) || n.includes(k)));
}
function matchCategory(q, c) {
  const n = _norm(q);
  if (!n) return false;
  const keys = [c.id, c.name, ...(c.aliases || [])].map(_norm);
  return keys.some(k => k && (k === n || k.includes(n) || n.includes(k)));
}

// ─── 既存データのマイグレーション ────────────────
// 既存 v: { tb:[], ac:[], pos:[], tech:[] } → 新 v: { tb:[], cat:[], pos:[], tags:[], tbLocked:false }
//
// TB の変換ルール:
//   トップ → トップ
//   ボトム → ボトム
//   スタンディング → スタンディング
//   バック   → 内容により判定 (ac に「エスケープ」含→ボトム, それ以外→トップ)
//   ハーフ   → ボトム + pos に「ハーフガード」追加
//   ドリル   → 空 (内容で判定; 自動判定にゆだねる)
//
// ac → cat: 旧 AC_TAGS から新カテゴリーへの対応
//   エスケープ・ディフェンス → エスケープ・ディフェンス
//   パスガード               → パスガード
//   アタック                 → フィニッシュ
//   スイープ                 → スイープ
//   リテンション             → ガードリテンション
//   コントロール             → コントロール／プレッシャー
//   テイクダウン             → テイクダウン
//   フィニッシュ             → フィニッシュ
//   ドリル                   → (空; #タグへ "#ドリル" を移送)
//   その他                   → (空)
const _AC_TO_CAT = {
  'エスケープ・ディフェンス': 'エスケープ・ディフェンス',
  'パスガード':               'パスガード',
  'アタック':                 'フィニッシュ',
  'スイープ':                 'スイープ',
  'リテンション':             'ガードリテンション',
  'コントロール':             'コントロール／プレッシャー',
  'テイクダウン':             'テイクダウン',
  'フィニッシュ':             'フィニッシュ',
};

function migrateVideo(v) {
  if (!v || typeof v !== 'object') return v;
  // 既に新形式のフィールドが1つでもあれば、残りを補完してスキップ（上書き防止）
  if (Array.isArray(v.cat) || Array.isArray(v.tags) || 'tbLocked' in v) {
    if (!Array.isArray(v.cat))  v.cat  = [];
    if (!Array.isArray(v.tags)) v.tags = [];
    if (!('tbLocked' in v))     v.tbLocked = false;
    // 旧フィールドが残っていれば必ず削除
    delete v.ac;
    delete v.tech;
    return v;
  }

  const oldTB   = Array.isArray(v.tb)   ? v.tb.slice()   : [];
  const oldAC   = Array.isArray(v.ac)   ? v.ac.slice()   : [];
  const oldPOS  = Array.isArray(v.pos)  ? v.pos.slice()  : [];
  const oldTECH = Array.isArray(v.tech) ? v.tech.slice() : [];

  // ── TB ──
  const newTB = new Set();
  for (const t of oldTB) {
    if (t === 'トップ' || t === 'ボトム' || t === 'スタンディング') newTB.add(t);
    else if (t === 'ハーフ') newTB.add('ボトム');
    else if (t === 'バック') {
      if (oldAC.includes('エスケープ・ディフェンス')) newTB.add('ボトム');
      else newTB.add('トップ');
    }
    // ドリル は無視 (自動判定にまかせる)
  }

  // ── Category ──
  const newCat = new Set();
  for (const a of oldAC) {
    const c = _AC_TO_CAT[a];
    if (c) newCat.add(c);
  }

  // ── Position ──
  const newPos = new Set(oldPOS);
  if (oldTB.includes('ハーフ')) newPos.add('ハーフガード');

  // ── #Tag ──
  // 旧 tech をすべて #タグへ移送 + 旧 ac の「ドリル/その他」も移送
  const newTags = new Set();
  for (const t of oldTECH) if (t) newTags.add(t);
  if (oldAC.includes('ドリル'))   newTags.add('ドリル');
  if (oldAC.includes('その他'))   newTags.add('その他');

  const result = {
    ...v,
    tb:       Array.from(newTB),
    cat:      Array.from(newCat),
    pos:      Array.from(newPos),
    tags:     Array.from(newTags),
    tbLocked: false,
  };
  // 旧フィールドを削除（Firebaseに残っている場合のクリーンアップ）
  delete result.ac;
  delete result.tech;
  return result;
}

function migrateAll(videos) {
  if (!Array.isArray(videos)) return videos;
  const result = videos.map(migrateVideo);
  // 全動画の旧カテゴリ名を新名に変換（migrateVideoでスキップされた既存データ向け）
  _remapOldCatNames(result);
  return result;
}

function _remapOldCatNames(videos) {
  if (!Array.isArray(videos)) return;
  for (const v of videos) {
    // 旧フィールドは無条件で削除
    delete v.ac;
    delete v.tech;
    if (!Array.isArray(v.cat) || !v.cat.length) continue;
    // 旧名（アタック→フィニッシュ 等）だけ付け替え、それ以外はそのまま残す。
    // 以前は組み込みの CATEGORIES に無い値を捨てていたので、ユーザーが自分で足した
    // カテゴリの値が、読み込みのたびに動画から消えていた（v52.843・タグはユーザー定義がすべて）。
    const newCat = new Set();
    for (const c of v.cat) {
      if (!c) continue;
      newCat.add(_AC_TO_CAT[c] || c);
    }
    v.cat = Array.from(newCat);
  }
}

// ─── タイトルから自動タグ付け (ルールベース) ───────
// ════════════════════════════════════════════════════
// AIのAPI呼び出しは一切なし。JavaScriptのみで完結する。
//
// TB 判定の優先チェーン:
//   1. タイトル  → 明示的なキーワードで判定
//   2. プレイリスト名 → タイトルで判定できない場合のフォールバック
//   3. チャンネル名   → 最終フォールバック
//
// TB 定義:
//   トップ       = 相手ガードの上にいる側。パスする・マウントを取る・コントロールする側
//   ボトム       = ガードをかける側。スイープ・エスケープ・ガードリテンションを行う側
//   スタンディング = 寝技に入る前の立ち技・テイクダウン局面
//
// 競合解決ルール (トップ+ボトム両方ヒット時):
//   優先①: escape/エスケープ/ディフェンス → ボトム確定
//           (例: マウントエスケープ = マウントされた下の人が逃げる動作)
//   優先②: pass/パス/攻略/突破 → トップ確定
//           (例: ガードパス = 上の人がガードを越える動作)
//   解決不能: 両方保持のまま (TB判定キューで手動解決)
//
// ⚠ 既知の制約:
//   _norm('ガード') = '' → 末尾 "guard/がど" 除去の副作用
//   → 裸の「ガード」「guard」は rawGuardCheck で別処理
// ════════════════════════════════════════════════════

// TB キーワード定義 (関数外に出して再利用可能にする)
const TB_KEYWORDS = {
  'トップ': [
    // ポジション名: 上の人が取るポジション
    'トップ','top',
    'mount','マウント',
    'side control','サイドコントロール','side mount',
    'north south','ノースサウス',
    'ニーオン','knee on',
    // バック系: バックを取る・コントロールする側
    'back take','back mount','back control','back attack',
    'バックテイク','バックマウント','バックコントロール','バックアタック',
    // パスガード系: ガードを越える動作
    'パス','pass','passing',
    'torreando','torando','leg drag','stack','knee slice','ニースライス',
    'guard break','guard breaker','guard opener','ガードブレイク',
    // コントロール・プレッシャー系
    'プレッシャー','pressure',
    'コントロール','control',
    'dominate',
    // 攻略・対策系: 相手ガードを崩す文脈
    '攻略','突破','制圧','崩し','対策',
    // その他トップ動作
    'smash','スマッシュ',
  ],
  'ボトム': [
    // 明示的なボトムワード
    'ボトム','bottom',
    // 注: 'ガード'/'guard' 単体は _norm で空文字になるため rawGuardCheck で処理
    // ガードシステム名 (特定ガードはボトムが使う)
    'デラヒーバ','dlr','de la riva',
    'ラッソ','lasso',
    'スパイダー','spider',
    'バタフライ','butterfly',
    'xガード','x-guard','x guard',
    'インバーテッド','inverted',
    'ワーム','worm',
    'ラペル','lapel',
    '50/50','5050',
    'サドル','saddle',
    'ニーシールド','knee shield',
    'kガード','k-guard','k guard',
    'slx',
    'ベリンボロ','berimbolo',
    'クローズドガード','closed guard',
    'ディープハーフ','deep half',
    'ハーフ','half',
    'オープンガード','open guard',
    'ガードリカバリー','guard recovery',
    'インサイドガード','inside guard',
    // ボトムの動作
    'スイープ','sweep',
    'エスケープ','escape',
    'リテンション','retention',
    '引き込み',
    'playing','from guard',
  ],
  'スタンディング': [
    'スタンディング','standing',
    'テイクダウン','takedown',
    '立ち技','投げ','throw',
    'レスリング','wrestling',
    'シングルレッグ','single leg',
    'ダブルレッグ','double leg',
    'アンクルピック','ankle pick',
    'ボディロック','body lock',
    'ヒップスロー','hip throw','hip toss',
    'タックル',
    'モータル','morote','片足','両足',
  ],
};
window.TB_KEYWORDS = TB_KEYWORDS;

// ── TB検出ロジック (1テキストに対して実行) ──────────
// text: タイトル / プレイリスト名 / チャンネル名 いずれでも可
function _detectTbFromText(text) {
  if (!text) return [];
  const tNorm = _norm(text);
  const rawLower = _rawLower(text);
  const found = [];

  for (const [tb, keywords] of Object.entries(TB_KEYWORDS)) {
    if (keywords.some(kw => _termHit(kw, rawLower, tNorm))) found.push(tb);
  }

  // rawGuardCheck: _norm('ガード')='' になる制約の回避
  if (/ガード|guard/i.test(text) && !found.includes('ボトム')) {
    found.push('ボトム');
  }

  // 競合解決
  if (found.includes('トップ') && found.includes('ボトム')) {
    const hasEscape = ['escape','エスケープ','ディフェンス','defense'].some(kw => _termHit(kw, rawLower, tNorm));
    if (hasEscape) {
      return found.filter(t => t !== 'トップ'); // エスケープ → ボトム確定
    }
    const hasPass = ['pass','passing','パス','攻略','突破','制圧','崩し'].some(kw => _termHit(kw, rawLower, tNorm));
    if (hasPass) {
      return found.filter(t => t !== 'ボトム'); // パスガード → トップ確定
    }
    // 上記いずれでもなく「ガード」が出てくる場合はガードを取っている側＝ボトム。
    // 例: 「Kガード 浅いマトリックスからバックテイク」は、バックテイクがトップ語彙に
    // 含まれるため従来 トップ+ボトム の矛盾になっていた。ガード文脈が明示され、かつ
    // パス/エスケープ文脈でないならボトムに寄せる。
    if (/ガード|guard/i.test(text)) {
      return found.filter(t => t !== 'トップ');
    }
  }

  return found;
}
window._detectTbFromText = _detectTbFromText;

// ── 組み込みBJJ語彙（カテゴリ判定用） ────────────────
// ※ CATEGORIES.aliases（Alias Builder でユーザーが承認した語）とは別系統の内蔵辞書。

// ══ 検索辞書（これ1枚だけ）══════════════════════════════
// 1行 ＝ 同じもの。1列目が代表表記で、2列目以降はその別の書き方（日本語・英語・略称）。
// 用途は1つだけ: 検索語を、同じものの別の書き方へ広げて本文を探す。
//
// **タグ体系とは独立**。タグはユーザーが自由に作るものになったので、この辞書は
// 「画面に出る選択肢の一覧」ではなく「BJJでそう呼ばれている言葉の一覧」である。
// ポジション/カテゴリの表（POSITIONS / CATEGORIES）はタグの層の話で、検索は見ない。
//
// 入れてよいもの : 表記の揺れ（デラヒーバ／デラヒバ）と、同じものの別言語（De La Riva／DLR）
// 入れてはいけないもの:
//   ・別の技（ハーフガードの行に「ロックダウン」を入れると、ロックダウンで親が全部出る）
//   ・上位/下位・「〜系」（パスガードの行に「スマッシュパス」）
//   ・分類のキーワード（そのカテゴリを指しうる言葉。pass / smash / drag …）
//   ・広い一語（pass / guard / sweep / choke …）
//   ・タグ体系のラベル（「コンセプト・原理」「コントロール／プレッシャー」等。技の名前ではない）
//
// 足すときは行を1本足す。ポジションやカテゴリの別名欄には足さない。
// 検査: node tools/search-dict-check.mjs
const SEARCH_DICT = [
  // ── ガード（下のポジション） ──
  ['クローズドガード','closed guard','closed','クロガ','フルガード','full guard'],
  ['オープンガード','open guard','オープン'],
  ['ハーフガード','half guard','half','ハーフ'],
  ['ディープハーフ','deep half guard','deep half','ディープ'],
  ['リバースハーフガード','reverse half guard','reverse half','リバースハーフ'],
  ['ハーフバタフライ','half butterfly','ハーフバタフライガード'],
  ['ニーシールド','knee shield','z guard','z-guard','Zガード','ニーシールドハーフ'],
  ['ロックダウン','lockdown','lock down'],
  ['アンダーフックハーフ','underhook half','脇差し'],
  ['シングルレッグハーフ','single leg half'],
  ['バタフライガード','butterfly guard','butterfly','バタフラ'],
  ['デラヒーバ','de la riva','dlr','de la riva guard','デラヒバ','デラヒーバガード'],
  ['リバースデラヒーバ','reverse de la riva','rdlr','reverse dlr','リバデラ'],
  ['デラヒーバX','de la riva x','dlx','デラエックス'],
  ['Xガード','x guard','x-guard','エックスガード'],
  ['SLX','single leg x','シングルレッグX','シングルレッグXガード','single x','ワンレッグX'],
  ['Kガード','k guard','k-guard','ケーガード'],
  ['50/50','50-50','5050','フィフティフィフティ','fifty fifty'],
  ['スパイダーガード','spider guard','spider','スパイダ'],
  ['インバーテッドスパイダー','inverted spider'],
  ['ラッソーガード','lasso guard','lasso','ラッソ'],
  ['シャローラッソー','shallow lasso'],
  ['片襟片袖','collar sleeve','collar and sleeve','collar sleeve guard','カラースリーブ'],
  ['ラペルガード','lapel guard','lapel','ラペル'],
  ['ワームガード','worm guard'],
  ['スクイッドガード','squid guard'],
  ['グッバーガード','gubber guard'],
  ['ラバーガード','rubber guard'],
  ['ミッションコントロール','mission control'],
  ['シッティングガード','seated guard','sitting guard','sit up guard','シットアップガード'],
  ['シングルレッグガード','single leg guard'],
  ['インバーテッド','inverted guard','inverted','トルネードガード','tornado guard'],
  ['オクトパスガード','octopus guard','octopus'],
  ['クォーターガード','quarter guard'],
  ['タートル','turtle','turtle position','亀','亀ポジション'],
  // ── 上のポジション・コントロール ──
  ['マウント','mount','full mount','マウントポジション','縦四方固め'],
  ['サイドコントロール','side control','side mount','サイドポジション','横四方固め'],
  ['ノースサウス','north south','north-south','ノースサウスポジション'],
  ['袈裟固め','kesa gatame','kesagatame','scarf hold','ケサガタメ'],
  ['ニーオンベリー','knee on belly','knee ride','kneeride','ニーオンザベリー','膝乗り'],
  ['バックコントロール','back control','back mount','rear mount','バックマウント'],
  ['ボディトライアングル','body triangle'],
  ['クルシフィックス','crucifix'],
  ['フロントヘッドロック','front headlock','front head lock'],
  ['クロスフェイス','cross face','crossface'],
  ['アンダーフック','underhook','under hook'],
  ['オーバーフック','overhook','over hook'],
  ['ヘッドクォーター','headquarters','head quarters','ヘッドクォーターズ','ヘッドクオーター'],
  // ── パスガード ──
  ['パスガード','guard pass','guard passing','ガードパス'],
  ['ニーカット','knee cut','knee slice','knee slide','knee through','cross knee','cross knee pass','ニースライス','ニースルー','クロスニー'],
  ['レッグドラッグ','leg drag','legdrag'],
  ['トレアドール','toreando','torreando','toreada','bullfighter pass','トレアンド','ブルファイターパス'],
  ['ロングステップ','long step','long step pass','longstep','ロングステップパス'],
  ['スマッシュパス','smash pass','スマッシュ'],
  ['スタックパス','stack pass','スタック'],
  ['ダブルアンダーパス','double under pass','double unders','ダブルアンダー'],
  ['オーバーアンダー','over under pass','over-under pass','オーバーアンダーパス'],
  ['ボディロックパス','body lock pass','bodylock pass'],
  ['サンパウロパス','sao paulo pass','sao paulo'],
  ['Xパス','x pass','x-pass','エックスパス'],
  ['レッグウィーブ','leg weave','leg weave pass'],
  ['フォールディングパス','folding pass'],
  ['バックステップ','back step','backstep'],
  ['フロートパス','float pass','floating pass','フローティングパス'],
  // ── スイープ・リバーサル ──
  ['スイープ','sweep','sweeps'],
  ['シザースイープ','scissor sweep'],
  ['ヒップバンプスイープ','hip bump','ヒップバンプ'],
  ['フラワースイープ','flower sweep','pendulum sweep','ペンデュラムスイープ'],
  ['バタフライスイープ','butterfly sweep','elevator sweep','エレベータースイープ'],
  ['トルネードスイープ','tornado sweep'],
  ['オーバーヘッドスイープ','overhead sweep','balloon sweep','バルーンスイープ'],
  ['マッスルスイープ','muscle sweep'],
  ['ジョンウェインスイープ','john wayne sweep','ジョンワインスイープ'],
  ['トライポッドスイープ','tripod sweep'],
  ['シックルスイープ','sickle sweep'],
  ['ウェイタースイープ','waiter sweep'],
  ['ベリンボロ','berimbolo'],
  ['リバースベリンボロ','reverse berimbolo'],
  ['クラブライド','crab ride'],
  ['キスオブザドラゴン','kiss of the dragon'],
  // ── 極め（絞め・関節） ──
  ['サブミッション','submission','submissions','サブミ'],
  ['アームバー','armbar','arm bar','juji gatame','腕十字'],
  ['三角絞め','triangle choke','triangle','三角締め','トライアングル'],
  ['リアトライアングル','rear triangle','back triangle','バックトライアングル'],
  ['サイドトライアングル','side triangle'],
  ['モノプラッタ','monoplata'],
  ['オモプラッタ','omoplata','オモプラータ'],
  ['キムラ','kimura','腕緘','腕がらみ'],
  ['アメリカーナ','americana'],
  ['肩固め','kata gatame','katagatame','arm triangle','head and arm choke','アームトライアングル'],
  ['ギロチン','guillotine'],
  ['アームインギロチン','arm in guillotine','arm-in guillotine'],
  ['ブラボーチョーク','bravo choke'],
  ['ダース','darce',"d'arce"],
  ['アナコンダ','anaconda'],
  ['ジャパニーズネクタイ','japanese necktie'],
  ['ペルビアンネクタイ','peruvian necktie'],
  ['リアネイキドチョーク','rear naked choke','rnc','mata leao','裸絞め','裸絞','リアネイキド','マタレオン'],
  ['ボーアンドアロー','bow and arrow','弓矢絞め'],
  ['クロスチョーク','cross choke','cross collar choke','十字絞め'],
  ['ループチョーク','loop choke'],
  ['エゼキエル','ezekiel','ezequiel','袖車'],
  ['ベースボールチョーク','baseball choke','baseball bat choke','ベースボールバットチョーク'],
  ['ペーパーカッター','paper cutter'],
  ['ノースサウスチョーク','north south choke'],
  ['ショートチョーク','short choke'],
  ['ラペルチョーク','lapel choke'],
  ['ゴゴプラッタ','gogoplata'],
  ['ツイスター','twister'],
  ['ネッククランク','neck crank','ネックロック'],
  ['リストロック','wrist lock','wristlock','手首関節'],
  ['バイセップスライサー','bicep slicer','biceps slicer','bicep crush','バイセップススライサー'],
  ['カーフスライサー','calf slicer','calf crush','カーフクラッシュ'],
  ['バナナスプリット','banana split'],
  ['エレクトリックチェア','electric chair'],
  // ── レッグロック（足関節） ──
  ['レッグロック','leg lock','leglock','足関節','アシカン'],
  ['ヒールフック','heel hook','heelhook'],
  ['インサイドヒールフック','inside heel hook','inside heelhook','インサイドヒール'],
  ['アウトサイドヒールフック','outside heel hook','outside heelhook','アウトサイドヒール'],
  ['ニーバー','kneebar','knee bar','膝十字'],
  ['トーホールド','toe hold','toehold'],
  ['アンクルロック','ankle lock','straight ankle','footlock','foot lock','achilles lock','フットロック','アキレス腱固め'],
  ['エスティマロック','estima lock','estima'],
  ['サドル','saddle','411','4-11','inside sankaku','インサイドサンカク','honey hole','ハニーホール'],
  ['アシガラミ','ashi garami','ashigarami','足絡み'],
  // ── エスケープ・ディフェンス ──
  ['エスケープ','escape','escapes'],
  ['エルボーエスケープ','elbow escape','knee elbow escape','エルボーニーエスケープ'],
  ['ヒップエスケープ','hip escape','shrimping','shrimp escape'],
  ['ブリッジアンドロール','bridge and roll','upa','ブリッジ＆ロール','ウパ'],
  ['グランビーロール','granby roll','granby','グランビー'],
  ['ヒッチハイカーエスケープ','hitchhiker escape'],
  ['テクニカルスタンドアップ','technical stand up','technical standup','テクニカルリフト'],
  ['ガードリテンション','guard retention','retention','リテンション'],
  ['ガードリカバリー','guard recovery'],
  ['フレーム','frame','framing','フレーミング'],
  ['スプロール','sprawl'],
  // ── テイクダウン・立ち技 ──
  ['テイクダウン','takedown','takedowns'],
  ['スタンディング','standing','stand up','立ち技'],
  ['引き込み','guard pull','pull guard','pulling guard','プルガード'],
  ['シングルレッグタックル','single leg takedown','single leg tackle','片足タックル'],
  ['ダブルレッグ','double leg takedown','両足タックル'],
  ['ハイクラッチ','high crotch'],
  ['ニーピック','knee pick'],
  ['アンクルピック','ankle pick'],
  ['アームドラッグ','arm drag','armdrag'],
  ['カラードラッグ','collar drag','襟ドラッグ'],
  ['スナップダウン','snap down','snapdown'],
  ['ダックアンダー','duck under','duckunder'],
  ['ロシアンタイ','russian tie','two on one'],
  ['スープレックス','suplex'],
  ['内股','uchi mata','uchimata'],
  ['大外刈り','osoto gari','osotogari','大外刈'],
  ['大内刈り','ouchi gari','ouchigari','大内刈'],
  ['小内刈り','kouchi gari','kouchigari','小内刈'],
  ['背負投','seoi nage','seoinage','背負い投げ'],
  ['一本背負い','ippon seoi nage','ippon seoinage','一本背負'],
  ['巴投げ','tomoe nage','tomoenage','巴投'],
  ['払腰','harai goshi','haraigoshi','払い腰'],
  ['体落','tai otoshi','taiotoshi','体落とし'],
  ['肩車','kata guruma','fireman carry',"fireman's carry",'ファイヤーマンズキャリー'],
  // ── そのほかよく使う言葉 ──
  ['バックテイク','back take','taking the back','バックを取る'],
  ['スクランブル','scramble'],
  ['グリップブレイク','grip break','grip breaking','グリップブレイキング'],
  ['ノーギ','no gi','nogi','no-gi','ノーギー'],
];
window.SEARCH_DICT = SEARCH_DICT;

// ─── キーワード推定は廃止（v52.814・Notion 項目01）───────
// タイトルやプレイリスト名から tb/cat/pos/tags を当てる仕組み
// （autoTagFromTitle / retagAllFromTitle / _detectCatFromText /
//   REVERSAL_TRIGGERS / tag_rules の否定語・反転マッピング）は、
// 当たらないものを当たったように見せるだけだったので全部消した。
// オーナーの言葉:「キーワード推定は不完全だから不要」。
//
// ここから下に残っているのは**検索辞書**（Notion 項目02）。別物。
//   findPosition / findCategory / aliasNamesFor / matchPosition /
//   matchCategory … 「デラヒーバ」で英語タイトルを当てるための橋。
//   動画に1つもタグが無くても効く。消さない（tag-label-check が見張る）。
//
// タグは、ユーザーが選ぶ。推測しない。

// ─── exports ──────────────────────────────────────
// Firestore からエイリアスをロード後に呼ぶ — インデックスを再構築する
window.rebuildCategoryIndex = function() { CATEGORY_INDEX = _buildCategoryIndex(); };

window.TB_VALUES          = TB_VALUES;
window.CATEGORIES         = CATEGORIES;
window.POSITIONS          = POSITIONS;
window._normTag           = _norm;
window._rawLowerTag       = _rawLower;
window._termHitTag        = _termHit;
window.findPosition       = findPosition;
window.findCategory       = findCategory;
window.aliasNamesFor      = aliasNamesFor;
window.matchPosition      = matchPosition;
window.matchCategory      = matchCategory;
window.migrateVideo       = migrateVideo;
window.migrateAllVideos   = migrateAll;

// 旧スキーマ互換ブリッジは削除済み (v50)
// 全ての参照は新4層スキーマ (tb/cat/pos/tags) に統一
