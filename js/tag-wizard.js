// ═══ WAZA KIMURA — タグ付けウィザード v52.441 ═══
// データソース: tag-master.js (window.TB_VALUES / window.CATEGORIES / window.POSITIONS / window.autoTagFromTitle)
(function () {
'use strict';

// ── チャンネルプロファイル（学習補完）──
function _updateChannelProfile(channel, finalTags) {
  if (!channel) return;
  try {
    var profiles = JSON.parse(localStorage.getItem('wk_ch_profiles') || '{}');
    if (!profiles[channel]) profiles[channel] = {};
    var all = [].concat(finalTags.tb ? [finalTags.tb] : [], finalTags.pos||[], finalTags.cat||[], finalTags.tech||[]);
    all.forEach(function(tag){ profiles[channel][tag] = (profiles[channel][tag]||0) + 1; });
    localStorage.setItem('wk_ch_profiles', JSON.stringify(profiles));
  } catch(e) {}
}

function _getChannelSuggest(channel, n) {
  if (!channel) return [];
  try {
    var profiles = JSON.parse(localStorage.getItem('wk_ch_profiles') || '{}');
    var chData = profiles[channel] || {};
    return Object.keys(chData).sort(function(a,b){ return chData[b]-chData[a]; }).slice(0, n||5);
  } catch(e) { return []; }
}

// ── スキップ済みルール管理 ──
function _saveSkippedRule(rule) {
  try {
    var list = JSON.parse(localStorage.getItem('wk_tw_skipped_rules') || '[]');
    var key  = rule.keyword + '|||' + rule.tag;
    if (!list.includes(key)) { list.push(key); localStorage.setItem('wk_tw_skipped_rules', JSON.stringify(list)); }
  } catch(e) {}
}
function _isRuleSkipped(rule) {
  try {
    var list = JSON.parse(localStorage.getItem('wk_tw_skipped_rules') || '[]');
    return list.includes(rule.keyword + '|||' + rule.tag);
  } catch(e) { return false; }
}

// ── 組み込みルール定義（TB判定の文脈パターン）──
// Admin「ルール」タブに反映・編集可能。source='ビルトイン' / id='_b_xxx' で識別。
var _BUILTIN_RULES = [
  // ── TB: トップシグナル（ガードを攻略・崩す視点のキーワード）──
  { id:'_b_dominate', condition:'dominate', field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'Dominate [guard] → トップ（ガードを制圧する側）' },
  { id:'_b_passing',  condition:'passing',  field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'Passing [guard] → トップ（パスガード側）' },
  { id:'_b_beat',     condition:'beat',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'Beat [guard] → トップ（ガードを攻略する側）' },
  { id:'_b_攻略',     condition:'攻略',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'攻略 → トップ（ガードを崩す視点）' },
  { id:'_b_突破',     condition:'突破',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'突破 → トップ（突破する側）' },
  { id:'_b_制圧',     condition:'制圧',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'制圧 → トップ（制圧する側）' },
  { id:'_b_崩し',     condition:'崩し',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'崩し → トップ（ガードを崩す側）' },
  { id:'_b_対策',     condition:'対策',     field:'tb', action:'add', value:'トップ', enabled:true, source:'ビルトイン', desc:'対策 → トップ（ガード対策 = パス側）' },
  // ── TB: ボトムシグナル（ガードをプレーする・使う視点のキーワード）──
  { id:'_b_playing',    condition:'playing',    field:'tb', action:'add', value:'ボトム', enabled:true, source:'ビルトイン', desc:'Playing [guard] → ボトム（ガードプレイヤー側）' },
  { id:'_b_using',      condition:'using',      field:'tb', action:'add', value:'ボトム', enabled:true, source:'ビルトイン', desc:'Using [guard] → ボトム（ガードを使う側）' },
  { id:'_b_ガード構築',  condition:'ガード構築',  field:'tb', action:'add', value:'ボトム', enabled:true, source:'ビルトイン', desc:'ガード構築 → ボトム（ガードを張る側）' },
  { id:'_b_ガードから',  condition:'ガードから',  field:'tb', action:'add', value:'ボトム', enabled:true, source:'ビルトイン', desc:'ガードから〜 → ボトム（ガードから仕掛ける側）' },
  { id:'_b_ガードプレイ', condition:'ガードプレイ', field:'tb', action:'add', value:'ボトム', enabled:true, source:'ビルトイン', desc:'ガードプレイ → ボトム' },

  // ── Category: エスケープ・ディフェンス ──
  { id:'_b_cat_escape',    condition:'escape',    field:'cat', action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'escape → エスケープ・ディフェンス' },
  { id:'_b_cat_defense',   condition:'defense',   field:'cat', action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'defense → エスケープ・ディフェンス' },
  { id:'_b_cat_エスケープ', condition:'エスケープ', field:'cat', action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'エスケープ → エスケープ・ディフェンス' },
  { id:'_b_cat_ディフェンス',condition:'ディフェンス',field:'cat',action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'ディフェンス → エスケープ・ディフェンス' },
  { id:'_b_cat_脱出',       condition:'脱出',       field:'cat', action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'脱出 → エスケープ・ディフェンス' },
  { id:'_b_cat_サバイバル',  condition:'サバイバル',  field:'cat', action:'add', value:'エスケープ・ディフェンス', enabled:true, source:'ビルトイン', desc:'サバイバル → エスケープ・ディフェンス' },

  // ── Category: ガード構築・エントリー ──
  { id:'_b_cat_エントリー',  condition:'エントリー',  field:'cat', action:'add', value:'ガード構築・エントリー', enabled:true, source:'ビルトイン', desc:'エントリー → ガード構築・エントリー' },
  { id:'_b_cat_引き込み',    condition:'引き込み',    field:'cat', action:'add', value:'ガード構築・エントリー', enabled:true, source:'ビルトイン', desc:'引き込み → ガード構築・エントリー' },
  { id:'_b_cat_セットアップ', condition:'セットアップ', field:'cat', action:'add', value:'ガード構築・エントリー', enabled:true, source:'ビルトイン', desc:'セットアップ → ガード構築・エントリー' },
  { id:'_b_cat_入り方',      condition:'入り方',      field:'cat', action:'add', value:'ガード構築・エントリー', enabled:true, source:'ビルトイン', desc:'入り方 → ガード構築・エントリー' },

  // ── Category: ガードリテンション ──
  { id:'_b_cat_リテンション', condition:'リテンション', field:'cat', action:'add', value:'ガードリテンション', enabled:true, source:'ビルトイン', desc:'リテンション → ガードリテンション' },
  { id:'_b_cat_retention',   condition:'retention',   field:'cat', action:'add', value:'ガードリテンション', enabled:true, source:'ビルトイン', desc:'retention → ガードリテンション' },
  { id:'_b_cat_reguard',     condition:'reguard',     field:'cat', action:'add', value:'ガードリテンション', enabled:true, source:'ビルトイン', desc:'reguard → ガードリテンション' },
  { id:'_b_cat_リガード',     condition:'リガード',     field:'cat', action:'add', value:'ガードリテンション', enabled:true, source:'ビルトイン', desc:'リガード → ガードリテンション' },

  // ── Category: コントロール／プレッシャー ──
  { id:'_b_cat_control',     condition:'control',     field:'cat', action:'add', value:'コントロール／プレッシャー', enabled:true, source:'ビルトイン', desc:'control → コントロール／プレッシャー' },
  { id:'_b_cat_pressure',    condition:'pressure',    field:'cat', action:'add', value:'コントロール／プレッシャー', enabled:true, source:'ビルトイン', desc:'pressure → コントロール／プレッシャー' },
  { id:'_b_cat_コントロール', condition:'コントロール', field:'cat', action:'add', value:'コントロール／プレッシャー', enabled:true, source:'ビルトイン', desc:'コントロール → コントロール／プレッシャー' },
  { id:'_b_cat_プレッシャー', condition:'プレッシャー', field:'cat', action:'add', value:'コントロール／プレッシャー', enabled:true, source:'ビルトイン', desc:'プレッシャー → コントロール／プレッシャー' },
  { id:'_b_cat_抑え込み',    condition:'抑え込み',    field:'cat', action:'add', value:'コントロール／プレッシャー', enabled:true, source:'ビルトイン', desc:'抑え込み → コントロール／プレッシャー' },

  // ── Category: コンセプト・原理 ──
  { id:'_b_cat_concept',      condition:'concept',      field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'concept → コンセプト・原理' },
  { id:'_b_cat_コンセプト',   condition:'コンセプト',   field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'コンセプト → コンセプト・原理' },
  { id:'_b_cat_理論',         condition:'理論',         field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'理論 → コンセプト・原理' },
  { id:'_b_cat_theory',       condition:'theory',       field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'theory → コンセプト・原理' },
  { id:'_b_cat_原理',         condition:'原理',         field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'原理 → コンセプト・原理' },
  { id:'_b_cat_fundamentals', condition:'fundamentals', field:'cat', action:'add', value:'コンセプト・原理', enabled:true, source:'ビルトイン', desc:'fundamentals → コンセプト・原理' },

  // ── Category: スイープ ──
  { id:'_b_cat_sweep',   condition:'sweep',   field:'cat', action:'add', value:'スイープ', enabled:true, source:'ビルトイン', desc:'sweep → スイープ' },
  { id:'_b_cat_スイープ', condition:'スイープ', field:'cat', action:'add', value:'スイープ', enabled:true, source:'ビルトイン', desc:'スイープ → スイープ' },
  { id:'_b_cat_切り返し', condition:'切り返し', field:'cat', action:'add', value:'スイープ', enabled:true, source:'ビルトイン', desc:'切り返し → スイープ' },

  // ── Category: テイクダウン ──
  { id:'_b_cat_takedown',  condition:'takedown',  field:'cat', action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'takedown → テイクダウン' },
  { id:'_b_cat_テイクダウン',condition:'テイクダウン',field:'cat',action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'テイクダウン → テイクダウン' },
  { id:'_b_cat_タックル',   condition:'タックル',   field:'cat', action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'タックル → テイクダウン' },
  { id:'_b_cat_wrestling',  condition:'wrestling',  field:'cat', action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'wrestling → テイクダウン' },
  { id:'_b_cat_レスリング',  condition:'レスリング',  field:'cat', action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'レスリング → テイクダウン' },
  { id:'_b_cat_投げ',       condition:'投げ',       field:'cat', action:'add', value:'テイクダウン', enabled:true, source:'ビルトイン', desc:'投げ → テイクダウン' },

  // ── Category: バックテイク・バックアタック ──
  { id:'_b_cat_back_take',    condition:'back take',    field:'cat', action:'add', value:'バックテイク・バックアタック', enabled:true, source:'ビルトイン', desc:'back take → バックテイク・バックアタック' },
  { id:'_b_cat_back_attack',  condition:'back attack',  field:'cat', action:'add', value:'バックテイク・バックアタック', enabled:true, source:'ビルトイン', desc:'back attack → バックテイク・バックアタック' },
  { id:'_b_cat_バックテイク',  condition:'バックテイク',  field:'cat', action:'add', value:'バックテイク・バックアタック', enabled:true, source:'ビルトイン', desc:'バックテイク → バックテイク・バックアタック' },
  { id:'_b_cat_バックアタック',condition:'バックアタック',field:'cat', action:'add', value:'バックテイク・バックアタック', enabled:true, source:'ビルトイン', desc:'バックアタック → バックテイク・バックアタック' },

  // ── Category: パスガード ──
  { id:'_b_cat_guard_pass', condition:'guard pass', field:'cat', action:'add', value:'パスガード', enabled:true, source:'ビルトイン', desc:'guard pass → パスガード' },
  { id:'_b_cat_passing',    condition:'passing',    field:'cat', action:'add', value:'パスガード', enabled:true, source:'ビルトイン', desc:'passing → パスガード' },
  { id:'_b_cat_パスガード',  condition:'パスガード',  field:'cat', action:'add', value:'パスガード', enabled:true, source:'ビルトイン', desc:'パスガード → パスガード' },
  { id:'_b_cat_ニーカット',  condition:'ニーカット',  field:'cat', action:'add', value:'パスガード', enabled:true, source:'ビルトイン', desc:'ニーカット → パスガード' },
  { id:'_b_cat_torreando',  condition:'torreando',  field:'cat', action:'add', value:'パスガード', enabled:true, source:'ビルトイン', desc:'torreando → パスガード' },

  // ── Category: フィニッシュ ──
  { id:'_b_cat_submission',  condition:'submission',  field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'submission → フィニッシュ' },
  { id:'_b_cat_フィニッシュ', condition:'フィニッシュ', field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'フィニッシュ → フィニッシュ' },
  { id:'_b_cat_サブミッション',condition:'サブミッション',field:'cat',action:'add',value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'サブミッション → フィニッシュ' },
  { id:'_b_cat_チョーク',    condition:'チョーク',    field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'チョーク → フィニッシュ' },
  { id:'_b_cat_choke',      condition:'choke',      field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'choke → フィニッシュ' },
  { id:'_b_cat_armbar',     condition:'armbar',     field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'armbar → フィニッシュ' },
  { id:'_b_cat_腕十字',     condition:'腕十字',     field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'腕十字 → フィニッシュ' },
  { id:'_b_cat_キムラ',     condition:'キムラ',     field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'キムラ → フィニッシュ' },
  { id:'_b_cat_三角',       condition:'三角',       field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'三角 → フィニッシュ（三角絞め）' },
  { id:'_b_cat_triangle',   condition:'triangle',   field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'triangle → フィニッシュ' },
  { id:'_b_cat_ギロチン',   condition:'ギロチン',   field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'ギロチン → フィニッシュ' },
  { id:'_b_cat_guillotine', condition:'guillotine', field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'guillotine → フィニッシュ' },
  { id:'_b_cat_ヒールフック', condition:'ヒールフック', field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'ヒールフック → フィニッシュ' },
  { id:'_b_cat_heel_hook',  condition:'heel hook',  field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'heel hook → フィニッシュ' },
  { id:'_b_cat_ニーバー',   condition:'ニーバー',   field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'ニーバー → フィニッシュ' },
  { id:'_b_cat_knee_bar',   condition:'knee bar',   field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'knee bar → フィニッシュ' },
  { id:'_b_cat_オモプラッタ', condition:'オモプラッタ', field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'オモプラッタ → フィニッシュ' },
  { id:'_b_cat_足関節',     condition:'足関節',     field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'足関節 → フィニッシュ' },
  { id:'_b_cat_関節技',     condition:'関節技',     field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'関節技 → フィニッシュ' },
  { id:'_b_cat_絞め',       condition:'絞め',       field:'cat', action:'add', value:'フィニッシュ', enabled:true, source:'ビルトイン', desc:'絞め → フィニッシュ' },
];

// ── ビルトインルールを localStorage に追加（未登録分のみ、ユーザー変更済みは上書きしない）──
function _seedBuiltinRules() {
  try {
    var rules = JSON.parse(localStorage.getItem('waza_ai_rules') || '[]');
    var changed = false;
    _BUILTIN_RULES.forEach(function(br) {
      var exists = rules.some(function(r) { return r.id === br.id; });
      if (!exists) {
        rules.push(Object.assign({}, br, { created: Date.now() }));
        changed = true;
      }
    });
    if (changed) localStorage.setItem('waza_ai_rules', JSON.stringify(rules));
  } catch(e) {}
}

// ── 帰納エンジン ──
var _history = [];

function _record(title, channel, auto, final) {
  _history.push({title:title, channel:channel, auto:auto, final:final});
}

function _induceRule() {
  var corrections = _history.filter(function(h) {
    var autoAll  = [].concat(h.auto.tb?[h.auto.tb]:[], h.auto.pos||[], h.auto.cat||[], h.auto.tech||[]);
    var finalAll = [].concat(h.final.tb?[h.final.tb]:[], h.final.pos||[], h.final.cat||[], h.final.tech||[]);
    return finalAll.some(function(t){ return autoAll.indexOf(t) < 0; });
  });
  if (corrections.length < 2) return null;
  var cooc = {};
  corrections.forEach(function(h) {
    var autoAll  = [].concat(h.auto.tb?[h.auto.tb]:[], h.auto.pos||[], h.auto.cat||[], h.auto.tech||[]);
    var finalAll = [].concat(h.final.tb?[h.final.tb]:[], h.final.pos||[], h.final.cat||[], h.final.tech||[]);
    var added = finalAll.filter(function(t){ return autoAll.indexOf(t)<0; });
    var words = (h.title||'').toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(function(w){ return w.length>3; });
    words.forEach(function(w){ added.forEach(function(tag){ var k=w+'|||'+tag; cooc[k]=(cooc[k]||0)+1; }); });
  });
  var best=null, bestCount=1;
  Object.keys(cooc).forEach(function(k){ if(cooc[k]>bestCount){ bestCount=cooc[k]; best=k; } });
  if (!best) return null;
  var parts = best.split('|||');
  return {keyword:parts[0], tag:parts[1]};
}

// ── プラットフォーム別 embed 情報取得（vpanel.js と完全一致のロジック）──
function _getEmbedInfo(v) {
  if (!v) return { embedUrl:'', thumb:'', canPlay:false };
  var pt   = v.pt || '';
  var isYT = pt === 'youtube';
  var isGD = pt === 'gdrive';
  var isX  = pt === 'x';
  var ytId = v.ytId || (isYT ? v.id : '') || '';
  var gdId = isGD ? (v.id||'').replace('gd-', '') : '';
  var vmId = (!isYT && !isGD && !isX) ? (v.id||'').replace('yt-', '') : '';
  var embedUrl = isYT && ytId ? ('https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0')
               : isGD && gdId ? ('https://drive.google.com/file/d/' + gdId + '/preview')
               : (!isX && vmId) ? ('https://player.vimeo.com/video/' + vmId + '?' + (v.vmHash ? 'h=' + v.vmHash + '&' : '') + 'autoplay=1')
               : '';
  var thumb = v.thumb
    || (ytId ? 'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg' : '')
    || (gdId ? 'https://drive.google.com/thumbnail?id=' + gdId + '&sz=w320' : '');
  return { embedUrl:embedUrl, thumb:thumb, canPlay:!!embedUrl };
}

// ── 提案エンジン（タイトル＋プレイリスト＋チャンネルの3シグナルを統合）──
// 優先度: タイトル > プレイリスト > チャンネル学習
// 設計方針: プレイリスト = 文脈の器、タイトル = 器の中の精度向上
//   例) PL「デラヒーバ講座」→ pos=デラヒーバ, tb=ボトム が基底
//       + タイトルに「パス」→ tb=トップ に上書き
//       + タイトルに「スイープ」→ cat=スイープ を追加
// memo: ユーザーが書いたメモ（アルゴリズムへのヒント）も4番目のシグナルとして統合
function _suggest(title, channel, pl, memo) {
  var atf = window.autoTagFromTitle;
  // タイトルとプレイリストをそれぞれ解析
  var tBase  = atf ? atf(title || '') : {tb:[],cat:[],pos:[],tags:[]};
  var plBase = atf ? atf(pl    || '') : {tb:[],cat:[],pos:[],tags:[]};

  // ── TB: タイトル優先、なければプレイリストから補完 ──
  var tbArr = (tBase.tb && tBase.tb.length) ? tBase.tb : (plBase.tb || []);
  var tb    = tbArr.length ? tbArr[0] : null;

  // ── Pos: タイトル + プレイリストの union ──
  var posList = (tBase.pos || []).slice();
  (plBase.pos || []).forEach(function(p) { if (posList.indexOf(p) < 0) posList.push(p); });

  // ── window.POSITIONS でさらに追加マッチング（タイトル・プレイリスト両方） ──
  var tLower  = (title || '').toLowerCase();
  var plLower = (pl    || '').toLowerCase();
  (window.POSITIONS || []).forEach(function(p) {
    if (!p.ja || posList.indexOf(p.ja) >= 0) return;
    var keys = [p.ja, p.en].concat(p.aliases || []).filter(Boolean);
    var hit  = keys.some(function(k) {
      if (!k || k.length < 2) return false;
      var kl = k.toLowerCase();
      return tLower.indexOf(kl) >= 0 || plLower.indexOf(kl) >= 0;
    });
    if (hit) posList.push(p.ja);
  });

  // ── Admin管理ポジション（waza_positions）でさらに追加マッチング ──
  // window.POSITIONS はハードコード定数。Admin で追加したエイリアスはここで反映。
  try {
    var userPos = JSON.parse(localStorage.getItem('waza_positions') || '[]');
    userPos.forEach(function(p) {
      if (!p.names || !p.names.ja || posList.indexOf(p.names.ja) >= 0) return;
      var keys = [p.names.ja, p.names.en || '']
        .concat((p.aliases && p.aliases.ja) ? p.aliases.ja : [])
        .concat((p.aliases && p.aliases.en) ? p.aliases.en : [])
        .filter(Boolean);
      var hit = keys.some(function(k) {
        if (!k || k.length < 2) return false;
        var kl = k.toLowerCase();
        return tLower.indexOf(kl) >= 0 || plLower.indexOf(kl) >= 0;
      });
      if (hit) posList.push(p.names.ja);
    });
  } catch(e) {}

  // ── Cat: タイトル + プレイリストの union ──
  var cats = (tBase.cat || []).slice();
  (plBase.cat || []).forEach(function(c) { if (cats.indexOf(c) < 0) cats.push(c); });

  // ── Admin管理カテゴリ（waza_tag_dict）でさらに追加マッチング ──
  // window.CATEGORIES はハードコード定数。Admin で追加したエイリアスはここで反映。
  try {
    var userCats = JSON.parse(localStorage.getItem('waza_tag_dict') || '[]');
    userCats.forEach(function(c) {
      if (!c.names || !c.names.ja || cats.indexOf(c.names.ja) >= 0) return;
      var keys = [c.names.ja, c.names.en || '']
        .concat((c.aliases && c.aliases.ja) ? c.aliases.ja : [])
        .concat((c.aliases && c.aliases.en) ? c.aliases.en : [])
        .filter(Boolean);
      var hit = keys.some(function(k) {
        if (!k || k.length < 2) return false;
        var kl = k.toLowerCase();
        return tLower.indexOf(kl) >= 0 || plLower.indexOf(kl) >= 0;
      });
      if (hit) cats.push(c.names.ja);
    });
  } catch(e) {}

  // チャンネル学習で補完
  _getChannelSuggest(channel, 5).forEach(function(tag) {
    var inCat = (window.CATEGORIES||[]).some(function(c){ return c.name === tag; });
    if (inCat && cats.indexOf(tag) < 0) cats.push(tag);
  });

  var _result = { tb: tb, pos: posList, cat: cats, tech: tBase.tags||[] };
  return _applyRules(_result, title, pl, memo);
}

// ── ルール適用エンジン（waza_ai_rules を読んで提案結果に上乗せ）──
// Phase 1: keyword / and / not  — タイトルマッチング
// Phase 2: pos_implies          — タグ値からの継承
// Phase 3: conflict             — 競合する値を削除
// Phase 4: default              — 全フェーズ後も空なら補完
function _applyRules(result, title, pl, memo) {
  try {
    var rules    = JSON.parse(localStorage.getItem('waza_ai_rules') || '[]');
    var tLower   = (title || '').toLowerCase();
    var plLower  = (pl    || '').toLowerCase();
    var memLower = (memo  || '').toLowerCase();

    function _matches(str) {
      var s = (str || '').toLowerCase();
      return tLower.indexOf(s) >= 0 || plLower.indexOf(s) >= 0 || memLower.indexOf(s) >= 0;
    }
    function _applyFA(field, action, value) {
      if (field === 'tb') {
        if      (action === 'add'     && !result.tb) result.tb = value;
        else if (action === 'replace')               result.tb = value;
      } else if (field === 'pos') {
        if (!result.pos) result.pos = [];
        if      (action === 'add'     && result.pos.indexOf(value) < 0) result.pos.push(value);
        else if (action === 'replace') result.pos = [value];
        else if (action === 'remove')  result.pos = result.pos.filter(function(p){ return p !== value; });
      } else if (field === 'cat') {
        if (!result.cat) result.cat = [];
        if      (action === 'add'     && result.cat.indexOf(value) < 0) result.cat.push(value);
        else if (action === 'replace') result.cat = [value];
        else if (action === 'remove')  result.cat = result.cat.filter(function(c){ return c !== value; });
      } else if (field === 'tags') {
        if (!result.tech) result.tech = [];
        if      (action === 'add'     && result.tech.indexOf(value) < 0) result.tech.push(value);
        else if (action === 'remove')  result.tech = result.tech.filter(function(v){ return v !== value; });
      }
    }
    function _hasVal(field, value) {
      if (field === 'tb')   return result.tb === value;
      if (field === 'pos')  return (result.pos  || []).indexOf(value) >= 0;
      if (field === 'cat')  return (result.cat  || []).indexOf(value) >= 0;
      if (field === 'tags') return (result.tech || []).indexOf(value) >= 0;
      return false;
    }

    // Phase 1: keyword / and / not
    rules.forEach(function(r) {
      if (!r.enabled) return;
      var t = r.type || 'keyword';
      if (t === 'keyword') {
        if (!r.condition || !_matches(r.condition)) return;
        _applyFA(r.field, r.action, r.value);
      } else if (t === 'and') {
        if (!r.condition_a || !r.condition_b) return;
        if (!_matches(r.condition_a) || !_matches(r.condition_b)) return;
        _applyFA(r.field, r.action, r.value);
      } else if (t === 'not') {
        if (!r.condition || !_matches(r.condition)) return;
        if (r.not_condition && _matches(r.not_condition)) return;
        _applyFA(r.field, r.action, r.value);
      }
    });

    // Phase 2: pos_implies (derive from already-set tag values)
    rules.forEach(function(r) {
      if (!r.enabled || r.type !== 'pos_implies') return;
      if (!r.if_value || !r.then_value) return;
      if (!_hasVal(r.if_field, r.if_value)) return;
      _applyFA(r.then_field, 'add', r.then_value);
    });

    // Phase 3: conflict (remove contradicting values)
    rules.forEach(function(r) {
      if (!r.enabled || r.type !== 'conflict') return;
      if (!r.if_value || !r.then_remove) return;
      if (!_hasVal(r.field, r.if_value)) return;
      var f = r.field;
      if (f === 'tb' && result.tb === r.then_remove)   result.tb  = null;
      else if (f === 'pos')  result.pos  = (result.pos  || []).filter(function(v){ return v !== r.then_remove; });
      else if (f === 'cat')  result.cat  = (result.cat  || []).filter(function(v){ return v !== r.then_remove; });
      else if (f === 'tags') result.tech = (result.tech || []).filter(function(v){ return v !== r.then_remove; });
    });

    // Phase 4: default (fallback for empty fields)
    rules.forEach(function(r) {
      if (!r.enabled || r.type !== 'default') return;
      if (!r.value) return;
      var f = r.field;
      var empty = f === 'tb' ? !result.tb
                : f === 'pos'  ? !(result.pos  && result.pos.length)
                : f === 'cat'  ? !(result.cat  && result.cat.length)
                : f === 'tags' ? !(result.tech && result.tech.length)
                : false;
      if (empty) _applyFA(f, 'add', r.value);
    });

  } catch(e) {}
  return result;
}

// ── キュー管理 ──
var _queue=[], _qIdx=0, _autoTags=null, _pendingRule=null, _previewOpen=false;

function _hasData(v) {
  return (v.tb&&v.tb.length) || (v.pos&&v.pos.length) || (v.cat&&v.cat.length) || (v.tags&&v.tags.length);
}
function _buildQueue() {
  var vids = (window.videos||[]).filter(function(v){ return !v.archived; });
  // ① データあり・未確認（VPanelで入力済み） → まず確認してもらう
  var withData  = vids.filter(function(v){ return !v.verified && _hasData(v); });
  // ② データなし・未確認（完全未タグ）
  var noData    = vids.filter(function(v){ return !v.verified && !_hasData(v); });
  // ③ 確認済み（最後）
  var verified  = vids.filter(function(v){ return  v.verified; });
  return withData.concat(noData).concat(verified);
}

// ── DOM構築 ──
var _domInited = false;

function _ensureDOM() {
  if (_domInited) return;
  _domInited = true;

  var style = document.createElement('style');
  style.textContent = [
    '#tw-overlay *{box-sizing:border-box;}',
    '.tw-chip{padding:5px 11px;border-radius:20px;font-size:12px;font-weight:600;',
    '  cursor:pointer;border:1.5px solid var(--border,#e0e0dc);',
    '  background:var(--surface2,#f1f1ef);color:var(--text3,#999);transition:all .12s;user-select:none;}',
    '.tw-chip:hover{border-color:var(--accent,#111);color:var(--accent,#111);}',
    '.tw-chip.tw-active{background:var(--accent,#111);border-color:var(--accent,#111);color:var(--on-accent,#fff);}',
    '.tw-chip.tw-auto{border-color:#f4a26188;}',
    '.tw-chip.tw-active.tw-auto{background:#f4a261;border-color:#f4a261;color:#1a0800;}',
    '#tw-tech-select{width:100%;padding:7px 10px;border-radius:10px;',
    '  border:1.5px solid var(--border,#e0e0dc);background:var(--surface2,#f1f1ef);',
    '  color:var(--text,#111);font-size:12px;outline:none;font-family:inherit;cursor:pointer;}',
    '#tw-tech-select:focus{border-color:var(--accent,#111);}',
  ].join('\n');
  document.head.appendChild(style);

  var ov = document.createElement('div');
  ov.id = 'tw-overlay';
  ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
  ov.innerHTML = [
    '<div id="tw-modal" style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.2);border:1px solid var(--border,#e0e0dc)">',
      // ヘッダー
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border,#e0e0dc);flex-shrink:0">',
        '<span style="font-size:15px;font-weight:800;color:var(--text,#111);flex:1">🏷 タグ付けウィザード</span>',
        '<span id="tw-prog-num" style="font-size:11px;color:var(--text3,#999);white-space:nowrap"></span>',
        '<button id="tw-btn-close" style="background:none;border:none;color:var(--text3,#999);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>',
      '</div>',
      // プログレスバー
      '<div style="height:3px;background:var(--surface2,#f1f1ef);flex-shrink:0">',
        '<div id="tw-prog-fill" style="height:100%;background:var(--accent,#111);width:0%;transition:width .3s"></div>',
      '</div>',
      // 本体
      '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">',
        // 凡例
        '<div style="display:flex;gap:12px;font-size:11px;color:var(--text3,#999)">',
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f4a261;margin-right:4px;vertical-align:middle"></span>自動提案</span>',
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent,#111);margin-right:4px;vertical-align:middle"></span>手動選択</span>',
        '</div>',
        // 動画情報
        '<div style="display:flex;gap:10px;align-items:flex-start">',
          '<div id="tw-thumb-wrap" style="flex-shrink:0;position:relative;border-radius:8px;overflow:hidden;width:120px;height:68px;background:var(--surface2,#f1f1ef);cursor:default">',
            '<img id="tw-thumb" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:none">',
            '<div id="tw-play-btn" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,.35);cursor:pointer">',
              '<span style="width:32px;height:32px;background:rgba(255,255,255,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;padding-left:2px">▶</span>',
            '</div>',
          '</div>',
          '<div style="flex:1;min-width:0">',
            '<div style="display:flex;align-items:baseline;gap:5px;margin-bottom:2px;flex-wrap:wrap">',
              '<span style="font-size:10px;color:var(--text3,#999);font-weight:700;flex-shrink:0">CH</span>',
              '<span id="tw-ch" style="font-size:12px;color:var(--accent,#111);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px"></span>',
            '</div>',
            '<div id="tw-pl" style="display:none;font-size:10px;color:var(--text3,#999);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>',
            '<div id="tw-title" style="font-size:13px;font-weight:700;color:var(--text,#111);line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden"></div>',
            '<div id="tw-hint" style="margin-top:5px;font-size:11px;color:var(--text3,#999)"></div>',
          '</div>',
        '</div>',
        // iframe
        '<iframe id="tw-iframe" src="" allow="autoplay" allowfullscreen style="display:none;width:100%;aspect-ratio:16/9;border:none;border-radius:8px"></iframe>',
        // TB
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">トップ/ボトム</div>',
          '<div id="tw-tb-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // ポジション
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">ポジション</div>',
          '<div id="tw-pos-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // カテゴリ
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">カテゴリ</div>',
          '<div id="tw-cat-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // タグ（プルダウン + 自由入力）
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">#タグ</div>',
          '<div id="tw-tech-selected" style="display:flex;flex-wrap:wrap;gap:6px;min-height:4px;margin-bottom:8px"></div>',
          '<select id="tw-tech-select"><option value="">— 既存タグから選択 —</option></select>',
          '<div style="display:flex;gap:6px;margin-top:8px">',
            '<input id="tw-tech-input" type="text" placeholder="新しいタグを入力..." style="flex:1;padding:5px 10px;border-radius:20px;border:1.5px solid var(--border,#e0e0dc);background:var(--surface2,#f1f1ef);color:var(--text,#111);font-size:12px;outline:none;font-family:inherit">',
            '<button id="tw-btn-add-tech" style="padding:5px 12px;border-radius:20px;background:var(--surface2,#f1f1ef);border:1.5px solid var(--border,#e0e0dc);color:var(--text3,#999);font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit">追加</button>',
          '</div>',
        '</div>',
        // メモ（自由入力）
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">メモ</div>',
          '<textarea id="tw-memo" rows="2" placeholder="補足メモを自由に入力..." style="width:100%;padding:7px 10px;border-radius:10px;border:1.5px solid var(--border,#e0e0dc);background:var(--surface2,#f1f1ef);color:var(--text,#111);font-size:12px;outline:none;resize:vertical;font-family:inherit;box-sizing:border-box"></textarea>',
        '</div>',
        // デルタ
        '<div id="tw-delta-box" style="display:none;background:var(--surface2,#f1f1ef);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--text3,#999)">',
          '<div style="font-weight:700;margin-bottom:4px;color:var(--text2,#555)">変更内容</div>',
          '<div id="tw-delta-content" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // 帰納ルール提案
        '<div id="tw-induct-box" style="display:none;background:rgba(0,0,0,.04);border:1.5px solid var(--accent,#111);border-radius:10px;padding:10px 12px;font-size:12px">',
          '<div style="font-weight:700;color:var(--accent,#111);margin-bottom:6px">💡 学習ルール提案</div>',
          '<div id="tw-induct-text" style="color:var(--text2,#555);margin-bottom:8px"></div>',
          '<div style="display:flex;gap:8px">',
            '<button id="tw-btn-accept-rule" style="padding:5px 14px;border-radius:20px;background:var(--accent,#111);border:none;color:var(--on-accent,#fff);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">採用する</button>',
            '<button id="tw-btn-skip-rule"   style="padding:5px 14px;border-radius:20px;background:none;border:1.5px solid var(--border,#e0e0dc);color:var(--text3,#999);font-size:12px;cursor:pointer;font-family:inherit">スキップ</button>',
          '</div>',
        '</div>',
      '</div>',
      // フッター
      '<div style="display:flex;gap:8px;padding:10px 16px 14px;border-top:1px solid var(--border,#e0e0dc);flex-shrink:0">',
        '<button id="tw-btn-skip"    style="flex:1;padding:10px;border-radius:20px;background:none;border:1.5px solid var(--border,#e0e0dc);color:var(--text3,#999);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">スキップ</button>',
        '<button id="tw-btn-confirm" style="flex:2;padding:10px;border-radius:20px;background:var(--accent,#111);border:none;color:var(--on-accent,#fff);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">確定して次へ →</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(ov);

  // 全イベント登録（inline onclick 不使用）
  document.getElementById('tw-btn-close').addEventListener('click', _close);
  document.getElementById('tw-btn-skip').addEventListener('click', _next);
  document.getElementById('tw-btn-confirm').addEventListener('click', _confirm);
  document.getElementById('tw-btn-add-tech').addEventListener('click', _addTechFromInput);
  document.getElementById('tw-tech-input').addEventListener('keydown', function(e){ if(e.key==='Enter') _addTechFromInput(); });
  document.getElementById('tw-tech-select').addEventListener('change', function(){ _addTechFromSelect(this); });
  document.getElementById('tw-play-btn').addEventListener('click', _togglePreview);
  document.getElementById('tw-btn-accept-rule').addEventListener('click', _acceptRule);
  document.getElementById('tw-btn-skip-rule').addEventListener('click', function() {
    if (_pendingRule) _saveSkippedRule(_pendingRule);
    _next();
  });
}

// ── タグピル追加 ──
function _addTechPill(val, isAuto) {
  var container = document.getElementById('tw-tech-selected');
  if (!container || !val) return;
  var exists = Array.from(container.querySelectorAll('[data-val]')).some(function(p){ return p.dataset.val === val; });
  if (exists) return;
  var pill = document.createElement('span');
  pill.dataset.val = val;
  pill.className = 'tw-chip tw-active' + (isAuto ? ' tw-auto' : '');
  pill.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding-right:7px';
  pill.appendChild(document.createTextNode(val));
  var rm = document.createElement('span');
  rm.textContent = '×';
  rm.style.cssText = 'margin-left:2px;opacity:.5;cursor:pointer;font-size:11px;font-weight:700;line-height:1';
  rm.addEventListener('click', function(e){ e.stopPropagation(); container.removeChild(pill); _updateDelta(); });
  pill.appendChild(rm);
  container.appendChild(pill);
  _updateDelta();
}

function _addTechFromInput() {
  var input = document.getElementById('tw-tech-input');
  if (!input) return;
  var val = input.value.trim();
  if (!val) return;
  _addTechPill(val, false);
  input.value = '';
}

function _addTechFromSelect(sel) {
  var val = sel.value; sel.value = '';
  if (val) _addTechPill(val, false);
}

// ── チップ生成 ──
function _makeChip(val, isAuto, isActive, isSingle) {
  var chip = document.createElement('div');
  chip.className = 'tw-chip' + (isActive ? ' tw-active' : '') + (isAuto ? ' tw-auto' : '');
  chip.dataset.val = val;
  chip.textContent = val;
  chip.addEventListener('click', function(){
    if (isSingle) {
      Array.from(chip.parentNode.querySelectorAll('.tw-chip')).forEach(function(c){ c.classList.remove('tw-active'); });
      chip.classList.add('tw-active');
    } else {
      chip.classList.toggle('tw-active');
    }
    _updateDelta();
  });
  return chip;
}

function _fillChips(containerId, all, autoVals) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  var autoArr = autoVals.filter(function(v){ return v; });
  var rest = all.filter(function(v){ return autoArr.indexOf(v) < 0; });
  autoArr.concat(rest).forEach(function(val){
    container.appendChild(_makeChip(val, autoArr.indexOf(val)>=0, autoArr.indexOf(val)>=0, false));
  });
}

// 既存タグ（青/アクセント）＋自動提案（オレンジ）を事前選択してチップを描画
function _fillChipsWithExisting(containerId, all, existingVals, autoVals) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  var existArr = (existingVals||[]).filter(function(v){ return v; });
  var autoArr  = (autoVals||[]).filter(function(v){ return v; });
  // 一覧に存在しない既存タグも先頭に追加（管理外タグ対応）
  var extra = existArr.filter(function(v){ return all.indexOf(v)<0; });
  var ordered = extra.concat(
    all.filter(function(v){ return existArr.indexOf(v)>=0; }),  // 既存（リスト内）
    autoArr.filter(function(v){ return all.indexOf(v)>=0; }),   // 自動提案（リスト内）
    all.filter(function(v){ return existArr.indexOf(v)<0 && autoArr.indexOf(v)<0; }) // 残り
  );
  ordered.forEach(function(val){
    var isAuto   = autoArr.indexOf(val)>=0;
    var isActive = existArr.indexOf(val)>=0 || isAuto;
    container.appendChild(_makeChip(val, isAuto, isActive, false));
  });
}

// ── アイテム読み込み ──
function _loadItem() {
  if (_qIdx >= _queue.length) { _showDone(); return; }
  var v = _queue[_qIdx];
  var title   = v.title   || v.name || '';
  var channel = v.ch      || v.channel || '';
  var pl      = v.pl      || '';
  var memo    = v.memo    || '';
  var _info   = _getEmbedInfo(v);

  // プレイヤーリセット
  _previewOpen = false;
  var fr = document.getElementById('tw-iframe');
  if (fr) { fr.src = ''; fr.style.display = 'none'; }

  // ── 自動提案（タイトル＋プレイリスト＋チャンネル＋メモ）──
  // memo: ユーザーが前回書いたヒントをルールマッチングに活用
  _autoTags = _suggest(title, channel, pl, memo);

  // ヒント表示
  var hintArr = [];
  if (_autoTags.tb)                        hintArr.push('TB: ' + _autoTags.tb);
  if (_autoTags.pos && _autoTags.pos.length) hintArr.push(_autoTags.pos.join(', '));
  if (_autoTags.cat && _autoTags.cat.length) hintArr.push(_autoTags.cat.join(', '));

  // テキスト更新
  var elTitle = document.getElementById('tw-title');
  var elCh    = document.getElementById('tw-ch');
  var elPl    = document.getElementById('tw-pl');
  var elHint  = document.getElementById('tw-hint');
  if (elTitle) elTitle.textContent = title;
  if (elCh)    elCh.textContent    = channel || '（不明）';
  if (elPl)  { elPl.textContent = pl ? '📋 ' + pl : ''; elPl.style.display = pl ? 'block' : 'none'; }
  if (elHint)  elHint.textContent  = hintArr.length ? '検出: ' + hintArr.join(' / ') : '';

  // サムネイル・再生ボタン
  var elThumb   = document.getElementById('tw-thumb');
  var elPlayBtn = document.getElementById('tw-play-btn');
  if (elThumb)   { elThumb.src = _info.thumb || ''; elThumb.style.display = _info.thumb ? 'block' : 'none'; }
  if (elPlayBtn) elPlayBtn.style.display = _info.canPlay ? 'flex' : 'none';

  // TB chips（window.TB_VALUES を使用 / 既存 v.tb を事前選択）
  var tbValues    = window.TB_VALUES || [];
  var existingTb  = (v.tb && v.tb.length) ? v.tb[0] : null;
  var tbContainer = document.getElementById('tw-tb-chips');
  if (tbContainer) {
    tbContainer.innerHTML = '';
    tbValues.forEach(function(tb){
      var isExisting = tb === existingTb;
      var isAuto     = !isExisting && _autoTags.tb === tb;
      tbContainer.appendChild(_makeChip(tb, isAuto, isExisting || isAuto, true));
    });
  }

  // ポジション chips（window.POSITIONS を使用 / 既存 v.pos を事前選択）
  var allPos      = (window.POSITIONS||[]).map(function(p){ return p.ja; });
  var existingPos = v.pos || [];
  var autoPos     = (_autoTags.pos||[]).filter(function(p){ return existingPos.indexOf(p)<0; });
  _fillChipsWithExisting('tw-pos-chips', allPos, existingPos, autoPos);

  // カテゴリ chips（window.CATEGORIES を使用 / 既存 v.cat を事前選択）
  var allCat      = (window.CATEGORIES||[]).map(function(c){ return c.name; });
  var existingCat = v.cat || [];
  var autoCat     = (_autoTags.cat||[]).filter(function(c){ return existingCat.indexOf(c)<0; });
  _fillChipsWithExisting('tw-cat-chips', allCat, existingCat, autoCat);

  // #タグ プルダウン（既存動画の tags から収集）
  var existingTags = [];
  try {
    var tagSet = {};
    (window.videos||[]).forEach(function(v2){ (v2.tags||[]).forEach(function(t){ if(t) tagSet[t]=true; }); });
    existingTags = Object.keys(tagSet).sort();
  } catch(e) {}
  var techSelect = document.getElementById('tw-tech-select');
  if (techSelect) {
    techSelect.innerHTML = '<option value="">— 既存タグから選択 —</option>';
    existingTags.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      techSelect.appendChild(opt);
    });
    techSelect.value = '';
  }

  // 選択済みタグピルをリセット・自動提案をセット
  var techSel = document.getElementById('tw-tech-selected');
  if (techSel) techSel.innerHTML = '';
  (_autoTags.tech || []).forEach(function(t){ _addTechPill(t, true); });
  // 現在の v.tags も既選として表示（既存タグがある場合）
  (v.tags || []).forEach(function(t){ _addTechPill(t, false); });

  var techInput = document.getElementById('tw-tech-input');
  if (techInput) techInput.value = '';

  var memoEl = document.getElementById('tw-memo');
  if (memoEl) memoEl.value = v.memo || '';

  var deltaBox  = document.getElementById('tw-delta-box');
  var inductBox = document.getElementById('tw-induct-box');
  if (deltaBox)  deltaBox.style.display  = 'none';
  if (inductBox) inductBox.style.display = 'none';

  _updateProgress();
}

// ── 再生トグル（YouTube / Google Drive / Vimeo 対応）──
function _togglePreview() {
  var v = _queue[_qIdx];
  if (!v) return;
  var info = _getEmbedInfo(v);
  if (!info.canPlay) { if (window.toast) window.toast('再生できません'); return; }
  var fr = document.getElementById('tw-iframe');
  if (!fr) return;
  _previewOpen = !_previewOpen;
  fr.src           = _previewOpen ? info.embedUrl : '';
  fr.style.display = _previewOpen ? 'block' : 'none';
}

// ── デルタ更新 ──
function _updateDelta() {
  var deltaBox     = document.getElementById('tw-delta-box');
  var deltaContent = document.getElementById('tw-delta-content');
  if (!deltaBox || !deltaContent || !_autoTags) return;

  var removedItems=[], addedItems=[];
  [{id:'tw-tb-chips',  auto:_autoTags.tb?[_autoTags.tb]:[]},
   {id:'tw-pos-chips', auto:_autoTags.pos||[]},
   {id:'tw-cat-chips', auto:_autoTags.cat||[]}].forEach(function(g){
    var el = document.getElementById(g.id);
    if (!el) return;
    var activeSet = Array.from(el.querySelectorAll('.tw-chip.tw-active')).map(function(c){ return c.dataset.val; });
    g.auto.forEach(function(t){ if(activeSet.indexOf(t)<0) removedItems.push(t); });
    activeSet.forEach(function(t){ if(g.auto.indexOf(t)<0) addedItems.push(t); });
  });
  var techSel = document.getElementById('tw-tech-selected');
  if (techSel) {
    var autoTech   = _autoTags.tech||[];
    var activeTech = Array.from(techSel.querySelectorAll('[data-val]')).map(function(p){ return p.dataset.val; });
    autoTech.forEach(function(t)  { if(activeTech.indexOf(t)<0) removedItems.push(t); });
    activeTech.forEach(function(t){ if(autoTech.indexOf(t)<0)   addedItems.push(t); });
  }

  if (!removedItems.length && !addedItems.length) { deltaBox.style.display='none'; return; }
  deltaBox.style.display = 'block';
  deltaContent.innerHTML = '';
  removedItems.forEach(function(t){
    var s=document.createElement('span');
    s.style.cssText='padding:3px 8px;border-radius:12px;background:rgba(244,162,97,.15);color:#c07030;text-decoration:line-through;font-size:11px';
    s.textContent='−'+t; deltaContent.appendChild(s);
  });
  addedItems.forEach(function(t){
    var s=document.createElement('span');
    s.style.cssText='padding:3px 8px;border-radius:12px;background:rgba(40,167,69,.12);color:#2a7a3a;font-size:11px';
    s.textContent='+'+t; deltaContent.appendChild(s);
  });
}

// ── プログレス ──
function _updateProgress() {
  var progNum  = document.getElementById('tw-prog-num');
  var progFill = document.getElementById('tw-prog-fill');
  if (progNum)  progNum.textContent = (_qIdx+1)+' / '+_queue.length;
  if (progFill) progFill.style.width = ((_qIdx/Math.max(_queue.length,1))*100)+'%';
}

// ── 完了画面 ──
function _showDone() {
  var modal = document.getElementById('tw-modal');
  if (!modal) return;
  modal.innerHTML = [
    '<div style="padding:40px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">',
      '<div style="font-size:48px">🎉</div>',
      '<div style="font-size:18px;font-weight:800;color:var(--text,#111)">すべて完了！</div>',
      '<div style="font-size:13px;color:var(--text3,#999)">キューの動画をすべてタグ付けしました。</div>',
      '<button id="tw-done-close" style="margin-top:8px;padding:10px 28px;border-radius:20px;background:var(--accent,#111);border:none;color:var(--on-accent,#fff);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">閉じる</button>',
    '</div>',
  ].join('');
  document.getElementById('tw-done-close').addEventListener('click', _close);
}

// ── 確定処理 ──
function _confirm() {
  var v = _queue[_qIdx];
  if (!v) return;

  var tbContainer = document.getElementById('tw-tb-chips');
  var activeChip  = tbContainer ? tbContainer.querySelector('.tw-chip.tw-active') : null;
  var finalTb     = activeChip ? activeChip.dataset.val : null;

  function _getActive(id) {
    var el = document.getElementById(id);
    return el ? Array.from(el.querySelectorAll('.tw-chip.tw-active')).map(function(c){ return c.dataset.val; }) : [];
  }
  var finalPos  = _getActive('tw-pos-chips');
  var finalCat  = _getActive('tw-cat-chips');
  var techSel   = document.getElementById('tw-tech-selected');
  var finalTech = techSel ? Array.from(techSel.querySelectorAll('[data-val]')).map(function(p){ return p.dataset.val; }) : [];
  var final     = {tb:finalTb, pos:finalPos, cat:finalCat, tech:finalTech};

  v.tb       = finalTb ? [finalTb] : (v.tb||[]);
  v.pos      = finalPos;
  v.cat      = finalCat;
  v.tags     = finalTech.length ? Array.from(new Set((v.tags||[]).concat(finalTech))) : (v.tags||[]);
  var memoEl = document.getElementById('tw-memo');
  if (memoEl) { var m = memoEl.value.trim(); if (m) v.memo = m; else delete v.memo; }
  v.verified = Date.now();

  if (window.saveUserData) window.saveUserData();
  if (window.AF) window.AF();

  var title   = v.title || v.name || '';
  var channel = v.ch || v.channel || '';
  _record(title, channel, _autoTags, final);
  _updateChannelProfile(channel, final);

  var rule = _induceRule();
  // スキップ済みのルールは表示しない
  if (rule && _isRuleSkipped(rule)) rule = null;
  if (rule) {
    _pendingRule = rule;
    var inductBox  = document.getElementById('tw-induct-box');
    var inductText = document.getElementById('tw-induct-text');
    if (inductText) inductText.textContent = '"'+rule.keyword+'" というキーワードが含まれる動画には "'+rule.tag+'" タグが頻繁に追加されています。';
    if (inductBox)  inductBox.style.display = 'block';
    return;
  }
  _next();
}

// ── ルール採用（waza_ai_rules に保存 → 即座に _applyRules() で効く）──
function _acceptRule() {
  if (!_pendingRule) { _next(); return; }
  try {
    var rules = JSON.parse(localStorage.getItem('waza_ai_rules') || '[]');
    var tbVals = window.TB_VALUES || [];
    var field = _pendingRule.field
              || (tbVals.indexOf(_pendingRule.tag) >= 0 ? 'tb'
                : (window.POSITIONS||[]).some(function(p){ return p.ja === _pendingRule.tag; }) ? 'pos'
                : 'cat');
    rules.push({
      condition: _pendingRule.keyword,
      field: field,
      action: 'add',
      value: _pendingRule.tag,
      enabled: true,
      created: Date.now(),
      source: _pendingRule.source || '帰納学習'
    });
    localStorage.setItem('waza_ai_rules', JSON.stringify(rules));
  } catch(e) {}
  if (window.toast) window.toast('"' + _pendingRule.keyword + '" ルールを追加しました');
  _next();
}

// ── open / close / next ──
function _open() {
  // _showDone() が modal.innerHTML を上書きした場合、overlay ごと再構築する
  if (document.getElementById('tw-overlay') && !document.getElementById('tw-title')) {
    var _oldOv = document.getElementById('tw-overlay');
    if (_oldOv) _oldOv.parentNode.removeChild(_oldOv);
    _domInited = false;
  }
  _ensureDOM();
  // ビルトインルールを localStorage に追加（未登録分のみ）
  _seedBuiltinRules();
  // admin-dashboard で更新された POSITIONS/CATEGORIES を確実に反映する
  if (window.syncPositionsFromStorage) window.syncPositionsFromStorage();
  if (window.syncCatsFromStorage)      window.syncCatsFromStorage();
  _queue = _buildQueue();
  _qIdx = 0;
  _pendingRule = null;
  var ov = document.getElementById('tw-overlay');
  if (ov) { ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; }
  _loadItem();
}

function _close() {
  var ov = document.getElementById('tw-overlay');
  if (ov) ov.style.display = 'none';
  _previewOpen = false;
  var fr = document.getElementById('tw-iframe');
  if (fr) { fr.src=''; fr.style.display='none'; }
}

function _next() {
  _qIdx++;
  _pendingRule = null;
  var inductBox = document.getElementById('tw-induct-box');
  if (inductBox) inductBox.style.display = 'none';
  _loadItem();
}

// ── 公開API ──
window._twOpen  = _open;
window._twClose = _close;

})();
