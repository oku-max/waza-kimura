// ═══ WAZA KIMURA — タグマスタ (4層タグ体系) ═══
// 4 layers: TB → Category → Position → #Tag
// TB     : 起点。AI 自動判定。トップ/ボトム/スタンディング (複数可)
// Cat    : 10 個固定 (ユーザー編集可)。AI が説明文を読んで分類
// Pos    : 21 個固定 (ボトム系のみ)。AI 自動判定
// #Tag   : 自由記入。サイドバー非表示。AI 自動抽出はデフォルト OFF

// ─── Layer 1: TB ─────────────────────────────────────
const TB_VALUES = ['トップ', 'ボトム', 'スタンディング'];

// ─── Layer 2: Category (10 fixed, user editable) ─────
// name : 表示名 / desc : AI が分類に使う説明文 / aliases : 検索ヒット用
const CATEGORIES = [
  { id: 'finish',     name: 'フィニッシュ',           desc: 'チョーク・関節技など相手を極めにいく動作', aliases: ['Submission','Finish','サブミッション','チョーク','アームロック','アームバー','キムラ','三角','三角絞め','オモプラッタ','ギロチン','腕十字','絞め'] },
  { id: 'pass',       name: 'パスガード',             desc: '相手のガードを越えてトップを取る動作',     aliases: ['Guard Pass','Passing','パス'] },
  { id: 'sweep',      name: 'スイープ',               desc: 'ボトムから相手をひっくり返す動作',         aliases: ['Sweep'] },
  { id: 'entry',      name: 'ガード構築・エントリー', desc: 'ガードを取る・特定ガードの入り口',         aliases: ['Guard Entry','Setup','エントリー','ガード構築'] },
  { id: 'retention',  name: 'ガードリテンション',     desc: '足を取られないボトムの守り',               aliases: ['Guard Retention','Retention','リテンション'] },
  { id: 'takedown',   name: 'テイクダウン',           desc: '立ちから相手を倒す動作（投げ技含む）',     aliases: ['Takedown','Throw','投げ'] },
  { id: 'back',       name: 'バックテイク・バックアタック', desc: 'バックを取る／バックからの攻撃',     aliases: ['Back Take','Back Attack','バックテイク','バックアタック','バック'] },
  { id: 'escape',     name: 'エスケープ・ディフェンス', desc: '不利ポジションからの脱出と防御',         aliases: ['Escape','Defense','ディフェンス','エスケープ'] },
  { id: 'control',    name: 'コントロール／プレッシャー', desc: 'トップポジションの維持・押さえ',       aliases: ['Control','Pressure','Top Control','コントロール','プレッシャー'] },
  { id: 'concept',    name: 'コンセプト・原理',       desc: '技ではない原則的な学び',                   aliases: ['Concept','Principle','理論','コンセプト'] },
];

// ─── Layer 3: Position (21 fixed, bottom-side) ───────
// ja : 日本語表示 / en : 英語名 / aliases : 検索ヒット用
const POSITIONS = [
  { id: 'closed',    ja: 'クローズドガード',     en: 'Closed Guard',   aliases: ['Closed','クロガ'] },
  { id: 'half',      ja: 'ハーフガード',         en: 'Half Guard',     aliases: ['Half','ハーフ'] },
  { id: 'deephalf',  ja: 'ディープハーフ',       en: 'Deep Half',      aliases: ['Deep Half Guard','ディープ'] },
  { id: 'kneeshield',ja: 'ニーシールド',         en: 'Z-Guard',        aliases: ['Z Guard','Knee Shield'] },
  { id: 'butterfly', ja: 'バタフライガード',     en: 'Butterfly',      aliases: ['Butterfly Guard','バタフラ'] },
  { id: 'spider',    ja: 'スパイダーガード',     en: 'Spider',         aliases: ['Spider Guard','スパイダ'] },
  { id: 'lasso',     ja: 'ラッソーガード',       en: 'Lasso',          aliases: ['Lasso Guard','ラッソ'] },
  { id: 'dlr',       ja: 'デラヒーバ',           en: 'De La Riva',     aliases: ['DLR','De La Riva Guard','デラヒバ'] },
  { id: 'rdlr',      ja: 'リバースデラヒーバ',   en: 'Reverse De La Riva', aliases: ['RDLR','Reverse DLR'] },
  { id: 'xguard',    ja: 'Xガード',              en: 'X-Guard',        aliases: ['X Guard','エックスガード'] },
  { id: 'slx',       ja: 'SLX',                  en: 'Single Leg X',   aliases: ['SLX','シングルレッグX','Single X'] },
  { id: 'kguard',    ja: 'Kガード',              en: 'K-Guard',        aliases: ['K Guard','ケーガード'] },
  { id: 'collar',    ja: '片襟片袖',             en: 'Collar Sleeve',  aliases: ['Collar Sleeve Guard','カラースリーブ'] },
  { id: 'worm',      ja: 'ワームガード',         en: 'Worm',           aliases: ['Worm Guard'] },
  { id: 'lapel',     ja: 'ラペルガード',         en: 'Lapel',          aliases: ['Lapel Guard'] },
  { id: 'fifty',     ja: '50/50',                en: '50-50',          aliases: ['50/50','5050','フィフティ'] },
  { id: 'saddle',    ja: 'サドル',               en: 'Saddle',         aliases: ['4-11','411','Honey Hole','インサイドサンカク','Inside Sankaku'] },
  { id: 'turtle',    ja: 'タートル',             en: 'Turtle',         aliases: ['Turtle Position','亀'] },
  { id: 'inverted',  ja: 'インバーテッド',       en: 'Inverted',       aliases: ['Inverted Guard'] },
  { id: 'standing',  ja: 'スタンディング',       en: 'Standing',       aliases: ['Stand Up','立ち'] },
  { id: 'other',     ja: 'その他',               en: 'Other',          aliases: ['Other'] },
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
    if (!Array.isArray(v.cat) || !v.cat.length) continue;
    const newCat = new Set();
    for (const c of v.cat) {
      const mapped = _AC_TO_CAT[c];
      if (mapped) newCat.add(mapped);
      else if (CATEGORIES.some(cat => cat.name === c)) newCat.add(c); // 既に新名ならそのまま
      // マッピングにもCATEGORIESにもない値は捨てる
    }
    v.cat = Array.from(newCat);
    // 旧フィールドクリーンアップ
    delete v.ac;
    delete v.tech;
  }
}

// ─── タイトルから自動タグ付け (ルールベース) ───────
// AI API を使わず、タイトル文字列だけでタグを推定する
// 取り込み直後に即座にタグが付くため、AI非同期タグ付けの補完として機能する
function autoTagFromTitle(title) {
  const result = { tb: [], cat: [], pos: [], tags: [] };
  if (!title) return result;

  const t = title;
  const tNorm = _norm(t);

  // ── TB 判定 ──
  const tbKeywords = {
    'トップ':       ['トップ','top','パス','pass','smash','スマッシュ','プレッシャー','pressure','コントロール','control','ニーオン','knee on'],
    'ボトム':       ['ボトム','bottom','ガード','guard','スイープ','sweep','リテンション','retention','ハーフ','half','デラヒーバ','dlr','ラッソ','lasso','スパイダー','spider','バタフライ','butterfly','xガード','x-guard','インバーテッド','inverted','ワーム','worm','ラペル','lapel','50/50','5050','サドル','saddle','ニーシールド','knee shield','kガード','k-guard','slx','ベリンボロ','berimbolo'],
    'スタンディング':['スタンディング','standing','テイクダウン','takedown','立ち技','投げ','throw','レスリング','wrestling','引き込み'],
  };
  for (const [tb, keywords] of Object.entries(tbKeywords)) {
    for (const kw of keywords) {
      if (_norm(kw) && tNorm.includes(_norm(kw))) {
        if (!result.tb.includes(tb)) result.tb.push(tb);
        break;
      }
    }
  }
  // スイープはボトム起点だが成功するとトップ
  if (tNorm.includes(_norm('スイープ')) || tNorm.includes('sweep')) {
    if (!result.tb.includes('ボトム')) result.tb.push('ボトム');
  }

  // ── Category 判定 ──
  for (const c of CATEGORIES) {
    const keys = [c.name, ...(c.aliases || [])];
    for (const k of keys) {
      const kn = _norm(k);
      if (kn && tNorm.includes(kn)) {
        if (!result.cat.includes(c.name)) result.cat.push(c.name);
        break;
      }
    }
  }

  // ── Position 判定 ──
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

  return result;
}

// ─── 既存動画の一括タイトルタグ付け ──────────────
// 未タグの動画にタイトルからルールベースタグを付与する (上書きはしない)
function retagAllFromTitle() {
  const videos = window.videos || [];
  let updated = 0;
  for (const v of videos) {
    if (!v.title) continue;
    const tags = autoTagFromTitle(v.title);
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
  window.toast?.(`🏷 ${updated}本のタグをタイトルから補完しました`);
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
