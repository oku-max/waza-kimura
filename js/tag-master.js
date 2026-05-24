// ═══ WAZA KIMURA — タグマスタ (4層タグ体系) ═══
// 4 layers: TB → Category → Position → #Tag
// TB     : 起点。AI 自動判定。トップ/ボトム/スタンディング (複数可)
// Cat    : 10 個固定 (ユーザー編集可)。AI が説明文を読んで分類
// Pos    : 21 個固定 (ボトム系のみ)。AI 自動判定
// #Tag   : 自由記入。サイドバー非表示。AI 自動抽出はデフォルト OFF

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
const CATEGORIES = [
  { id: 'escape', name: 'エスケープ・ディフェンス', desc: '不利ポジションからの脱出と防御',
    aliases: [
      'Escape','Defense','ディフェンス','エスケープ',
      'サバイバル','survival',
      '脱出','逃げ','逃げ方',
      'ダメージコントロール','damage control',
      'ブリッジ','bridge',            // マウントエスケープのブリッジ
      'アンパス','unpass',            // ガードリカバリー文脈
    ]},
  { id: 'entry', name: 'ガード構築・エントリー', desc: 'ガードを取る・特定ガードの入り口',
    aliases: [
      'Guard Entry','Setup','エントリー','ガード構築',
      '入り方','入り口','作り方','取り方',
      '引き込み',
      'セットアップ',
      'getting to guard','taking guard',
    ]},
  { id: 'retention', name: 'ガードリテンション', desc: '足を取られないボトムの守り',
    aliases: [
      'Guard Retention','Retention','リテンション',
      'リガード','reguard','re-guard',
      'ガードの守り','フレーミング','framing',
      '足を切られない','カットされない',
    ]},
  { id: 'control', name: 'コントロール／プレッシャー', desc: 'トップポジションの維持・押さえ',
    aliases: [
      'Control','Pressure','Top Control','コントロール','プレッシャー',
      'キープ','keep','維持',
      'ピン','pin','抑え込み','ホールドダウン','hold down',
      'ドミネート','dominate',
      'ウェイト','weight',
    ]},
  { id: 'concept', name: 'コンセプト・原理', desc: '技ではない原則的な学び',
    aliases: [
      'Concept','Principle','理論','コンセプト',
      'セオリー','theory',
      '原理','原則','考え方','哲学',
      '解説','入門','基礎','ファンダメンタル','fundamentals',
      'ストラテジー','strategy',
      'アプローチ','approach',
      'メカニクス','mechanics',
      'システム','system',           // 〜システムという名の教則
    ]},
  { id: 'sweep', name: 'スイープ', desc: 'ボトムから相手をひっくり返す動作',
    aliases: [
      'Sweep','スイープ',
      '切り返し','ひっくり返し',
      'リバーサル',                  // reversal = スイープの別表現
      'elevator','エレベーター',     // butterfly sweep の別名
      'scissor','シザー',            // シザースイープ
    ]},
  { id: 'takedown', name: 'テイクダウン', desc: '立ちから相手を倒す動作（投げ技含む）',
    aliases: [
      'Takedown','Throw','投げ','テイクダウン',
      'タックル',
      'レスリング','wrestling',
      'シングルレッグ','single leg',
      'ダブルレッグ','double leg',
      'アンクルピック','ankle pick',
      'ヒップスロー','hip throw','hip toss',
      'judo','柔道',
      '払い腰','大外刈','大内刈','足払い','内股','巴投げ',
      'trip','トリップ',
      'body lock takedown',
    ]},
  { id: 'back', name: 'バックテイク・バックアタック', desc: 'バックを取る／バックからの攻撃',
    aliases: [
      'Back Take','Back Attack','バックテイク','バックアタック','バック',
      'back mount','back control','バックマウント','バックコントロール',
      'シートベルト','seat belt',    // バックコントロールの基本グリップ
      'ボウアンドアロー','bow and arrow',
      'RNC','rear naked choke','リアネイキッドチョーク',
    ]},
  { id: 'pass', name: 'パスガード', desc: '相手のガードを越えてトップを取る動作',
    aliases: [
      'Guard Pass','Passing','パス','パスガード',
      'ニーカット','knee cut',
      'ニースライス','knee slice',
      'トレアンド','torreando','torando',
      'スタックパス','stack pass',
      'レッグドラッグ','leg drag',
      'プレッシャーパス','pressure pass',
      'スマッシュパス','smash pass',
    ]},
  { id: 'finish', name: 'フィニッシュ', desc: 'チョーク・関節技など相手を極めにいく動作',
    aliases: [
      // 総称
      'Submission','Finish','サブミッション','フィニッシュ',
      '極め','絞め技','関節技','タップ',
      // 腕系
      'アームバー','armbar','腕十字','腕ひしぎ',
      'アームロック','arm lock',
      'キムラ','kimura',
      'オモプラッタ','omoplata',
      'ウメプラタ',
      // チョーク系
      'チョーク','choke','絞め',
      '三角','三角絞め','triangle',
      'ギロチン','guillotine',
      'ダースチョーク','darce',
      'アナコンダ','anaconda',
      'クロックチョーク','clock choke',
      'ボウアンドアロー','bow and arrow',
      'ベースボールチョーク','baseball choke',
      'リアネイキッドチョーク','rear naked choke','RNC',
      'ノースサウスチョーク','north south choke',
      // 足関節系
      'ヒールフック','heel hook',
      'フットロック','foot lock',
      'アンクルロック','ankle lock',
      'ニーバー','knee bar',
      'トーホールド','toe hold',
      'ストレートフットロック','straight foot lock',
      'インサイドヒール','inside heel',
      'アウトサイドヒール','outside heel',
      '足関節','レッグロック','leg lock',
    ]},
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
const CATEGORY_INDEX = _buildCategoryIndex();

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
  const found = [];

  for (const [tb, keywords] of Object.entries(TB_KEYWORDS)) {
    for (const kw of keywords) {
      const kwn = _norm(kw);
      if (kwn && tNorm.includes(kwn)) {
        if (!found.includes(tb)) found.push(tb);
        break;
      }
    }
  }

  // rawGuardCheck: _norm('ガード')='' になる制約の回避
  if (/ガード|guard/i.test(text) && !found.includes('ボトム')) {
    found.push('ボトム');
  }

  // 競合解決
  if (found.includes('トップ') && found.includes('ボトム')) {
    const n = tNorm;
    const hasEscape = ['escape','エスケープ','ディフェンス','defense'].some(kw => { const kn = _norm(kw); return kn && n.includes(kn); });
    if (hasEscape) {
      return found.filter(t => t !== 'トップ'); // エスケープ → ボトム確定
    }
    const hasPass = ['pass','passing','パス','攻略','突破','制圧','崩し'].some(kw => n.includes(_norm(kw)));
    if (hasPass) {
      return found.filter(t => t !== 'ボトム'); // パスガード → トップ確定
    }
  }

  return found;
}
window._detectTbFromText = _detectTbFromText;

// ── カテゴリ検出ロジック (1テキストに対して実行) ────
// text: タイトル / プレイリスト名 / チャンネル名 いずれでも可
// 複数カテゴリに同時ヒット可（TB と違い排他でない）
function _detectCatFromText(text) {
  if (!text) return [];
  const n = _norm(text);
  const found = [];
  for (const c of CATEGORIES) {
    const keys = [c.name, ...(c.aliases || [])];
    for (const k of keys) {
      const kn = _norm(k);
      if (kn && n.includes(kn)) {
        if (!found.includes(c.name)) found.push(c.name);
        break;
      }
    }
  }
  return found;
}
window._detectCatFromText = _detectCatFromText;

function autoTagFromTitle(title, pl = '', channel = '') {
  const result = { tb: [], cat: [], pos: [], tags: [] };
  if (!title) return result;

  const tNorm = _norm(title);

  // ── TB 判定: タイトル → プレイリスト → チャンネルの順でフォールバック ──
  result.tb = _detectTbFromText(title);
  if (!result.tb.length && pl)      result.tb = _detectTbFromText(pl);
  if (!result.tb.length && channel) result.tb = _detectTbFromText(channel);

  // ── Category 判定: waza_ai_rules のみ（下の rules 適用セクションで処理）──
  // CATEGORIES.aliases はサーチ用途のみ。自動判定は waza_ai_rules に一本化。

  // ── Position 判定 (タイトルのみ; PLからのpos推測は誤検知リスクが高い) ──
  for (const p of POSITIONS) {
    const keys = [p.ja, p.en, ...(p.aliases || [])];
    for (const k of keys) {
      const kn = _norm(k);
      if (kn && kn.length >= 2 && tNorm.includes(kn)) {
        if (!result.pos.includes(p.ja)) result.pos.push(p.ja);
        break;
      }
    }
  }

  // ── waza_ai_rules を読んで上乗せ適用 ──
  // ルールタブで管理するルールが唯一の判断基準。
  // 動画取り込み時・AI判定ボタン時・どのタイミングでも必ずここを通す。
  try {
    const storedRules = JSON.parse(localStorage.getItem('waza_ai_rules') || '[]');
    if (storedRules.length) {
      const tL  = title.toLowerCase();
      const plL = (pl      || '').toLowerCase();
      const chL = (channel || '').toLowerCase();
      const _m  = s => { const sl = (s||'').toLowerCase(); return tL.includes(sl) || plL.includes(sl) || chL.includes(sl); };
      const _has = (field, val) => {
        if (field === 'tb')  return result.tb.includes(val);
        if (field === 'cat') return result.cat.includes(val);
        if (field === 'pos') return result.pos.includes(val);
        return false;
      };
      const _apply = (field, action, value) => {
        if (!field || !value) return;
        const arr = field === 'tb' ? result.tb : field === 'cat' ? result.cat : field === 'pos' ? result.pos : null;
        if (!arr) return;
        if      (action === 'add'     && !arr.includes(value)) arr.push(value);
        else if (action === 'replace')                         { arr.length = 0; arr.push(value); }
        else if (action === 'remove')                          { const idx = arr.indexOf(value); if (idx >= 0) arr.splice(idx, 1); }
      };

      // Phase 1: keyword / and / not
      storedRules.forEach(r => {
        if (!r.enabled) return;
        const t = r.type || 'keyword';
        let fires = false;
        if      (t === 'keyword') fires = !!(r.condition && _m(r.condition));
        else if (t === 'and')     fires = !!(r.condition_a && r.condition_b && _m(r.condition_a) && _m(r.condition_b));
        else if (t === 'not')     fires = !!(r.condition && _m(r.condition) && !(r.not_condition && _m(r.not_condition)));
        if (fires) _apply(r.field, r.action, r.value);
      });

      // Phase 2: pos_implies
      storedRules.forEach(r => {
        if (!r.enabled || r.type !== 'pos_implies') return;
        if (r.if_value && _has(r.if_field, r.if_value)) _apply(r.then_field, 'add', r.then_value);
      });

      // Phase 3: conflict
      storedRules.forEach(r => {
        if (!r.enabled || r.type !== 'conflict') return;
        if (r.if_value && _has(r.field, r.if_value)) _apply(r.field, 'remove', r.then_remove);
      });

      // Phase 4: default (フィールドが空のときのみ)
      storedRules.forEach(r => {
        if (!r.enabled || r.type !== 'default') return;
        const arr = r.field === 'tb' ? result.tb : r.field === 'cat' ? result.cat : r.field === 'pos' ? result.pos : null;
        if (arr && !arr.length && r.value) arr.push(r.value);
      });
    }
  } catch(e) { /* localStorage 読み取り失敗は無視 */ }

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

// ─── exports ──────────────────────────────────────
window.TB_VALUES      = TB_VALUES;
window.CATEGORIES     = CATEGORIES;
window.POSITIONS      = POSITIONS;
window._normTag       = _norm;
window.findPosition   = findPosition;
window.findCategory   = findCategory;
window.matchPosition  = matchPosition;
window.matchCategory  = matchCategory;
window.migrateVideo   = migrateVideo;
window.migrateAllVideos = migrateAll;
window.autoTagFromTitle = autoTagFromTitle;
window.retagAllFromTitle = retagAllFromTitle;

// 旧スキーマ互換ブリッジは削除済み (v50)
// 全ての参照は新4層スキーマ (tb/cat/pos/tags) に統一
