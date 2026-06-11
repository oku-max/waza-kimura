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
// aliases : タイトル・PL名・チャンネル名からの自動検出キーワード（検索にも使用）
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
  { id: 'inverted',  ja: 'インバーテッド',       en: 'Inverted Guard',      aliases: ['Inverted','トルネードガード','Tornado Guard','Tornado'] },
  { id: 'open',      ja: 'オープンガード',       en: 'Open Guard',          aliases: ['open guard','手ぶらガード','no grip guard'] },
  { id: 'octopus',   ja: 'オクトパスガード',     en: 'Octopus Guard',       aliases: ['Octopus','octopus guard'] },
  { id: 'collar',    ja: '片襟片袖',             en: 'Collar Sleeve',       aliases: ['Collar Sleeve Guard','カラースリーブ','collar and sleeve'] },
  { id: 'closed',    ja: 'クローズドガード',     en: 'Closed Guard',        aliases: ['Closed','クロガ','フルガード','full guard'] },
  { id: 'cross',     ja: 'クロスガード',         en: 'Cross Guard',         aliases: ['cross guard'] },
  { id: 'saddle',    ja: 'サドル',               en: 'Saddle',              aliases: ['411','4-11','Inside Sankaku','インサイドサンカク','Honey Hole','ashi garami'] },
  { id: 'situp',     ja: 'シッティングガード',   en: 'Sit-Up Guard',        aliases: ['シットアップガード','sit up guard','sitting guard','seated guard'] },
  { id: 'slguard',   ja: 'シングルレッグガード', en: 'Single Leg Guard',    aliases: ['single leg guard'] },
  { id: 'standing',  ja: 'スタンディング',       en: 'Standing',            aliases: ['Stand Up','立ち','立ち技'] },
  { id: 'spider',    ja: 'スパイダーガード',     en: 'Spider Guard',        aliases: ['Spider','スパイダ','インバーテッドスパイダー','inverted spider'] },
  { id: 'other',     ja: 'その他',               en: 'Other',               aliases: [] },
  { id: 'turtle',    ja: 'タートル',             en: 'Turtle',              aliases: ['Turtle Position','亀'] },
  { id: 'deephalf',  ja: 'ディープハーフ',       en: 'Deep Half Guard',     aliases: ['Deep Half Guard','Deep Half','ディープ'] },
  { id: 'dlr',       ja: 'デラヒーバ',           en: 'De La Riva',          aliases: ['DLR','De La Riva Guard','デラヒバ'] },
  { id: 'kneeshield',ja: 'ニーシールド',         en: 'Knee Shield',         aliases: ['Z Guard','Z-Guard','Zガード'] },
  { id: 'half',      ja: 'ハーフガード',         en: 'Half Guard',          aliases: ['Half','ハーフ','脇差し','アンダーフックハーフ','ロックダウン','シングルレッグハーフ','underhook half','lockdown','single leg half'] },
  { id: 'butterfly', ja: 'バタフライガード',     en: 'Butterfly Guard',     aliases: ['Butterfly','バタフラ','ハーフバタフライ','half butterfly'] },
  { id: 'lasso',     ja: 'ラッソーガード',       en: 'Lasso Guard',         aliases: ['Lasso','ラッソ','シャローラッソー','shallow lasso'] },
  { id: 'lapel',     ja: 'ラペルガード',         en: 'Lapel Guard',         aliases: ['Lapel','ワームガード','Worm Guard','Worm','スクイッドガード','Squid Guard','Squid','グッバーガード','Gubber Guard','Gubber','ラペル系'] },
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
function _norm(s) {
  if (s == null) return '';
  let v = String(s);
  // 全角英数 → 半角
  v = v.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // カタカナ → ひらがな
  v = v.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  v = v.toLowerCase();
  // 長音・区切りを除去
  v = v.replace(/[ー\-_/\s・,.、。]+/g, '');
  // 末尾「がーど / guard」を除去
  v = v.replace(/(がーど|がど|guard)$/i, '');
  return v;
}

// ── 全角→半角＋小文字化（ASCII語の単語境界マッチ用） ──
function _rawLower(s) {
  return String(s == null ? '' : s)
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
    return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])').test(rawLower);
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
    const keys = [c.id, c.name, ...(c.aliases || [])];
    for (const k of keys) {
      const n = _norm(k);
      if (n && !idx.has(n)) idx.set(n, c);
    }
  }
  return idx;
}
let CATEGORY_INDEX = _buildCategoryIndex();

// 任意の語からポジション/カテゴリーを引く (検索ヒット判定用)
function findPosition(q) { return POSITION_INDEX.get(_norm(q)) || null; }
function findCategory(q) { return CATEGORY_INDEX.get(_norm(q)) || null; }

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
    const newCat = new Set();
    for (const c of v.cat) {
      const mapped = _AC_TO_CAT[c];
      if (mapped) newCat.add(mapped);
      else if (CATEGORIES.some(cat => cat.name === c)) newCat.add(c);
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
  }

  return found;
}
window._detectTbFromText = _detectTbFromText;

// ── 組み込みBJJ語彙（カテゴリ判定用） ────────────────
// ※ CATEGORIES.aliases（Alias Builder でユーザーが承認した語）とは別系統の内蔵辞書。
//   ユーザー承認エイリアスの仕組みには触れない。ここはアプリ標準のBJJ文脈知識（EN/JA）。
const CATEGORY_BUILTIN_TERMS = {
  escape:    ['escape','escapes','escaping','defense','defence','defending','survival','エスケープ','ディフェンス','脱出','防御'],
  entry:     ['entry','entries','guard pull','pull guard','pulling guard','エントリー','引き込み','入り方'],
  retention: ['retention','retain','guard recovery','recover guard','リテンション','ガードリカバリー'],
  control:   ['pressure','pinning','maintaining mount','maintaining side','プレッシャー','抑え込み','コントロール'],
  concept:   ['concept','concepts','principle','principles','theory','mindset','コンセプト','原理','原則','理論','考え方'],
  sweep:     ['sweep','sweeps','sweeping','swept','スイープ'],
  takedown:  ['takedown','takedowns','take down','wrestling','judo','throw','throws','double leg','ankle pick','snap down','テイクダウン','タックル','投げ技'],
  back:      ['back take','back takes','backtake','taking the back','take the back','back attack','back control','back mount','バックテイク','バックアタック','バックコントロール','バック奪取'],
  pass:      ['pass','passes','passing','guard pass','パス','パスガード','ガードパス'],
  finish:    ['submission','submissions','finish','finishing','choke','chokes','strangle','strangles','サブミッション','フィニッシュ','絞め','絞め技','関節技','極め','チョーク'],
};

// ── 組み込みBJJテクニック辞書（#タグ自動抽出 + カテゴリ含意） ──
// ja: 付与する #タグ名 / terms: 検出語（EN/JA） / cat: 含意カテゴリ(id)
const TECHNIQUE_BUILTIN = [
  { ja: 'アームバー',          terms: ['armbar','arm bar','juji gatame','腕十字','アームバー'], cat: 'finish' },
  { ja: '三角絞め',            terms: ['triangle choke','triangle','三角絞め','三角締め','トライアングル'], cat: 'finish' },
  { ja: 'キムラ',              terms: ['kimura','キムラ'], cat: 'finish' },
  { ja: 'アメリカーナ',        terms: ['americana','アメリカーナ'], cat: 'finish' },
  { ja: 'ギロチン',            terms: ['guillotine','ギロチン'], cat: 'finish' },
  { ja: 'リアネイキドチョーク', terms: ['rear naked choke','rnc','裸絞め','裸絞','リアネイキド'], cat: 'finish' },
  { ja: 'ヒールフック',        terms: ['heel hook','heelhook','ヒールフック'], cat: 'finish' },
  { ja: 'ニーバー',            terms: ['kneebar','knee bar','ニーバー','膝十字'], cat: 'finish' },
  { ja: 'トーホールド',        terms: ['toe hold','toehold','トーホールド'], cat: 'finish' },
  { ja: 'アンクルロック',      terms: ['ankle lock','straight ankle','footlock','foot lock','アンクルロック','フットロック'], cat: 'finish' },
  { ja: 'ダース',              terms: ["darce","d'arce","ダース"], cat: 'finish' },
  { ja: 'アナコンダ',          terms: ['anaconda','アナコンダ'], cat: 'finish' },
  { ja: 'ノースサウスチョーク', terms: ['north south choke','ノースサウスチョーク'], cat: 'finish' },
  { ja: 'エゼキエル',          terms: ['ezekiel','ezequiel','エゼキエル','袖車'], cat: 'finish' },
  { ja: 'ボーアンドアロー',    terms: ['bow and arrow','ボーアンドアロー','弓矢絞め'], cat: 'finish' },
  { ja: 'クロスチョーク',      terms: ['cross choke','cross collar choke','クロスチョーク','十字絞め'], cat: 'finish' },
  { ja: 'ループチョーク',      terms: ['loop choke','ループチョーク'], cat: 'finish' },
  { ja: 'ペーパーカッター',    terms: ['paper cutter','ペーパーカッター'], cat: 'finish' },
  { ja: 'オモプラッタ',        terms: ['omoplata','オモプラッタ','オモプラータ'], cat: 'finish' },
  { ja: 'ツイスター',          terms: ['twister','ツイスター'], cat: 'finish' },
  { ja: 'ベリンボロ',          terms: ['berimbolo','ベリンボロ'], cat: 'back' },
  { ja: 'クラブライド',        terms: ['crab ride','クラブライド'], cat: 'back' },
  { ja: 'キスオブザドラゴン',  terms: ['kiss of the dragon','キスオブザドラゴン'], cat: 'back' },
  { ja: 'アームドラッグ',      terms: ['arm drag','armdrag','アームドラッグ'], cat: 'back' },
  { ja: 'レッグドラッグ',      terms: ['leg drag','legdrag','レッグドラッグ'], cat: 'pass' },
  { ja: 'トレアドール',        terms: ['toreando','torreando','toreada','bullfighter pass','トレアンド','トレアドール'], cat: 'pass' },
  { ja: 'ニーカット',          terms: ['knee cut','knee slice','knee slide','ニーカット','ニースライス'], cat: 'pass' },
  { ja: 'サンパウロパス',      terms: ['sao paulo pass','sao paulo','サンパウロパス'], cat: 'pass' },
  { ja: 'ボディロックパス',    terms: ['body lock pass','bodylock pass','ボディロックパス'], cat: 'pass' },
  { ja: 'スタックパス',        terms: ['stack pass','スタックパス'], cat: 'pass' },
  { ja: 'オーバーアンダー',    terms: ['over under pass','over-under pass','オーバーアンダーパス'], cat: 'pass' },
  { ja: 'シザースイープ',      terms: ['scissor sweep','シザースイープ'], cat: 'sweep' },
  { ja: 'ヒップバンプスイープ', terms: ['hip bump','ヒップバンプ'], cat: 'sweep' },
  { ja: 'フラワースイープ',    terms: ['flower sweep','pendulum sweep','フラワースイープ','ペンデュラムスイープ'], cat: 'sweep' },
  { ja: 'バタフライスイープ',  terms: ['butterfly sweep','バタフライスイープ'], cat: 'sweep' },
  { ja: 'シングルレッグ',      terms: ['single leg takedown','シングルレッグタックル'], cat: 'takedown' },
  { ja: 'ダブルレッグ',        terms: ['double leg takedown','ダブルレッグ','両足タックル'], cat: 'takedown' },
  { ja: '内股',                terms: ['uchi mata','uchimata','内股'], cat: 'takedown' },
  { ja: '背負投',              terms: ['seoi nage','seoinage','背負投','背負い投げ'], cat: 'takedown' },
  { ja: 'アンクルピック',      terms: ['ankle pick','アンクルピック'], cat: 'takedown' },
  { ja: 'スナップダウン',      terms: ['snap down','snapdown','スナップダウン'], cat: 'takedown' },
];
window.TECHNIQUE_BUILTIN = TECHNIQUE_BUILTIN;

// ── カテゴリ検出ロジック (1テキストに対して実行) ────
// text: タイトル / プレイリスト名 / チャンネル名 いずれでも可
// 複数カテゴリに同時ヒット可（TB と違い排他でない）
// ユーザー承認エイリアス + 組み込みBJJ語彙の両方で判定する
function _detectCatFromText(text) {
  if (!text) return [];
  const tNorm = _norm(text);
  const rawLower = _rawLower(text);
  const found = [];
  for (const c of CATEGORIES) {
    const keys = [c.name, ...(c.aliases || []), ...(CATEGORY_BUILTIN_TERMS[c.id] || [])];
    if (keys.some(k => _termHit(k, rawLower, tNorm))) {
      if (!found.includes(c.name)) found.push(c.name);
    }
  }
  return found;
}
window._detectCatFromText = _detectCatFromText;

function autoTagFromTitle(title, pl = '', channel = '') {
  const result = { tb: [], cat: [], pos: [], tags: [] };
  if (!title) return result;

  const tNorm = _norm(title);

  // ── 反転トリガー判定（REVERSAL_TRIGGERS + ユーザー設定の negationWords）──
  const userTagRules  = window.tagRules || {};
  const negWords      = [...REVERSAL_TRIGGERS, ...(userTagRules.negationWords || [])];
  const hasNegation   = negWords.some(w => w && tNorm.includes(_norm(w)));
  const catInverse    = userTagRules.categoryInverse || {};

  // ── TB 判定: タイトル → プレイリスト → チャンネルの順でフォールバック ──
  result.tb = _detectTbFromText(title);
  if (!result.tb.length && pl)      result.tb = _detectTbFromText(pl);
  if (!result.tb.length && channel) result.tb = _detectTbFromText(channel);

  const rawLower = _rawLower(title);

  // ── Category 判定: ユーザー承認エイリアス + 組み込みBJJ語彙 ──
  result.cat = _detectCatFromText(title);

  // ── テクニック判定: 組み込み辞書（#タグ付与 + カテゴリ含意） ──
  for (const tech of TECHNIQUE_BUILTIN) {
    if (tech.terms.some(t => _termHit(t, rawLower, tNorm))) {
      if (!result.tags.includes(tech.ja)) result.tags.push(tech.ja);
      const c = CATEGORIES.find(c => c.id === tech.cat);
      if (c && !result.cat.includes(c.name)) result.cat.push(c.name);
    }
  }
  // ── ユーザーが既に使っているテクニック名にもマッチ（表記の自動適応） ──
  const userVocab = new Set([
    ...((window.videos || []).flatMap(v => v.tags || [])),
    ...((window.getTagGroups?.() || []).flatMap(g => g.techNames || [])),
  ]);
  for (const name of userVocab) {
    if (name && !result.tags.includes(name) && _termHit(name, rawLower, tNorm)) result.tags.push(name);
  }

  // ── 反転ルール適用: 否定語が含まれていた場合、カテゴリを反転先に切り替え ──
  if (hasNegation && Object.keys(catInverse).length > 0) {
    result.cat = result.cat.map(catName => catInverse[catName] || catName);
    // 重複除去
    result.cat = [...new Set(result.cat)];
  }

  // ── Category → TB 推論 ──
  for (const catName of result.cat) {
    const cat = CATEGORIES.find(c => c.name === catName);
    if (cat?.tb && cat.tb !== '中立' && !result.tb.includes(cat.tb)) {
      result.tb.push(cat.tb);
    }
  }

  // ── Position 判定 (タイトルのみ; PLからのpos推測は誤検知リスクが高い) ──
  for (const p of POSITIONS) {
    const keys = [p.ja, p.en, ...(p.aliases || [])];
    if (keys.some(k => _termHit(k, rawLower, tNorm))) {
      if (!result.pos.includes(p.ja)) result.pos.push(p.ja);
    }
  }

  // テイクダウン文脈の 'single leg' はタックルでありガードではない
  if (result.cat.includes('テイクダウン') && !/guard|ガード/i.test(title)) {
    result.pos = result.pos.filter(p => p !== 'シングルレッグガード');
  }

  return result;
}

// ─── 既存動画の一括タイトルタグ付け ──────────────
// 未タグの動画にタイトルからルールベースタグを付与する (上書きはしない)
function retagAllFromTitle() {
  const videos = window.videos || [];
  let updated = 0;
  for (const v of videos) {
    if (!v.title) continue;
    // タイトル → プレイリスト → チャンネルの順でフォールバック
    const tags = autoTagFromTitle(v.title, v.pl || '', v.channel || '');
    if (!tags) continue;
    let changed = false;
    // TB: 空の場合のみ追加
    if ((!v.tb || !v.tb.length) && tags.tb && tags.tb.length) {
      v.tb = tags.tb; changed = true;
    }
    // Cat: 空の場合のみ追加
    if ((!v.cat || !v.cat.length) && tags.cat && tags.cat.length) {
      v.cat = tags.cat; changed = true;
    }
    // Pos: 空の場合のみ追加
    if ((!v.pos || !v.pos.length) && tags.pos && tags.pos.length) {
      v.pos = tags.pos; changed = true;
    }
    // #Tag: 空の場合のみ追加（組み込み技名辞書 + ユーザー語彙から）
    if ((!v.tags || !v.tags.length) && tags.tags && tags.tags.length) {
      v.tags = tags.tags; changed = true;
    }
    // tbLocked 確保
    if (!('tbLocked' in v)) { v.tbLocked = false; changed = true; }
    if (changed) updated++;
  }
  if (updated > 0) {
    window.debounceSave?.();
    window.AF?.();
  }
  console.log(`[retagAll] ${updated}/${videos.length} videos updated from title`);
  if (updated > 0) window.toast?.(`🏷 ${updated}本のタグをタイトルから補完しました`);
  return updated;
}

// ─── Tier 1c: 反転トリガー ────────────────────────
// トップ／ボトムが競合したとき、このワードが含まれていたら判定を反転する
// ユーザーが tb-tuner.html の UI から追加・削除できる
const REVERSAL_TRIGGERS = [
  '対策','防ぐ','防御','守る','止める','対処','防止',
  'カウンター','ディフェンス','defense','counter',
];

// ─── exports ──────────────────────────────────────
// Firestore からエイリアスをロード後に呼ぶ — インデックスを再構築する
window.rebuildCategoryIndex = function() { CATEGORY_INDEX = _buildCategoryIndex(); };

window.TB_VALUES          = TB_VALUES;
window.CATEGORIES         = CATEGORIES;
window.POSITIONS          = POSITIONS;
window.REVERSAL_TRIGGERS  = REVERSAL_TRIGGERS;
window._normTag           = _norm;
window.findPosition       = findPosition;
window.findCategory       = findCategory;
window.matchPosition      = matchPosition;
window.matchCategory      = matchCategory;
window.migrateVideo       = migrateVideo;
window.migrateAllVideos   = migrateAll;
window.autoTagFromTitle   = autoTagFromTitle;
window.retagAllFromTitle  = retagAllFromTitle;

// 旧スキーマ互換ブリッジは削除済み (v50)
// 全ての参照は新4層スキーマ (tb/cat/pos/tags) に統一
