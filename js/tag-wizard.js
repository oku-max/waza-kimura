// ═══ WAZA KIMURA — タグ付けウィザード v52.418 ═══
(function () {
'use strict';

// ── BJJ辞書 ──
var DICT = [
  // ポジション
  {en:['closed guard','full guard'], ja:'クローズドガード', type:'pos'},
  {en:['half guard','half-guard','z guard','z-guard','knee shield'], ja:'ハーフガード', type:'pos'},
  {en:['de la riva','dlr'], ja:'デラヒーバ', type:'pos'},
  {en:['reverse de la riva','rdlr','reverse dlr'], ja:'リバースデラヒーバ', type:'pos'},
  {en:['x guard','x-guard'], ja:'Xガード', type:'pos'},
  {en:['single leg x','slx','single x'], ja:'シングルレッグX', type:'pos'},
  {en:['butterfly','butterfly guard'], ja:'バタフライ', type:'pos'},
  {en:['spider guard','spider'], ja:'スパイダーガード', type:'pos'},
  {en:['lasso','lasso guard'], ja:'ラッソ', type:'pos'},
  {en:['mount','full mount','mounted'], ja:'マウント', type:'pos'},
  {en:['back control','back mount','rear mount','back take','take the back'], ja:'バックコントロール', type:'pos'},
  {en:['side control','side mount','kesa gatame'], ja:'サイドコントロール', type:'pos'},
  {en:['knee on belly','knee on stomach','kob'], ja:'ニーオンベリー', type:'pos'},
  {en:['turtle','turtle position'], ja:'タートル', type:'pos'},
  {en:['north south','north-south'], ja:'ノースサウス', type:'pos'},
  {en:['50/50','fifty fifty'], ja:'50/50', type:'pos'},
  {en:['ashi garami'], ja:'アシガラミ', type:'pos'},
  {en:['open guard'], ja:'オープンガード', type:'pos'},
  {en:['deep half','deep half guard'], ja:'ディープハーフ', type:'pos'},
  {en:['worm guard'], ja:'ワームガード', type:'pos'},

  // カテゴリ
  {en:['guard pass','guard passing','passing','pass the guard'], ja:'パス', type:'cat'},
  {en:['sweep','sweeping','sweeps'], ja:'スイープ', type:'cat'},
  {en:['choke','strangle','strangulation'], ja:'チョーク', type:'cat'},
  {en:['escape','escaping','escape from','escapes'], ja:'エスケープ', type:'cat'},
  {en:['takedown','take down','takedowns'], ja:'テイクダウン', type:'cat'},
  {en:['throw','judo throw','hip throw','osoto','uchi mata','seoi nage'], ja:'投げ技', type:'cat'},
  {en:['armlock','arm lock','armbar','arm bar'], ja:'アームロック', type:'cat'},
  {en:['leg lock','heel hook','kneebar','knee bar','toe hold','ankle lock'], ja:'レッグロック', type:'cat'},
  {en:['reversal','turnover','turnovers'], ja:'リバーサル', type:'cat'},
  {en:['defense','defensive','counter','prevent'], ja:'ディフェンス', type:'cat'},
  {en:['submission','tap','finish','finishing'], ja:'サブミッション', type:'cat'},
  {en:['retention','guard retention','retain guard'], ja:'リテンション', type:'cat'},
  {en:['recovery','recover','guard recovery'], ja:'リカバリー', type:'cat'},
  {en:['control','controlling','dominate','pressure'], ja:'コントロール', type:'cat'},
  {en:['entry','setup','set up','getting to'], ja:'セットアップ', type:'cat'},
  {en:['transition','transitions','linking'], ja:'トランジション', type:'cat'},
  {en:['drilling','drills'], ja:'ドリル', type:'cat'},

  // テクニック
  {en:['knee slice','knee cut','knee slice pass'], ja:'ニースライス', type:'tech'},
  {en:['torreando','toreando','bullfighter'], ja:'トレアンドパス', type:'tech'},
  {en:['leg drag'], ja:'レッグドラッグ', type:'tech'},
  {en:['berimbolo'], ja:'ベリンボロ', type:'tech'},
  {en:['triangle','triangle choke'], ja:'トライアングル', type:'tech'},
  {en:['arm triangle','side triangle'], ja:'アームトライアングル', type:'tech'},
  {en:['rear naked choke','rnc','mata leao'], ja:'リアネイキッドチョーク', type:'tech'},
  {en:['guillotine','arm-in guillotine'], ja:'ギロチン', type:'tech'},
  {en:["d'arce",'darce','darce choke'], ja:'ダースチョーク', type:'tech'},
  {en:['anaconda'], ja:'アナコンダ', type:'tech'},
  {en:['ezekiel'], ja:'イジキエル', type:'tech'},
  {en:['omoplata'], ja:'オモプラッタ', type:'tech'},
  {en:['wrist lock','wristlock'], ja:'リストロック', type:'tech'},
  {en:['rubber guard'], ja:'ラバーガード', type:'tech'},
  {en:['inside heel hook','inside heel'], ja:'インサイドヒールフック', type:'tech'},
  {en:['outside heel hook','outside heel'], ja:'アウトサイドヒールフック', type:'tech'},
  {en:['heel hook'], ja:'ヒールフック', type:'tech'},
  {en:['knee bar','kneebar'], ja:'ニーバー', type:'tech'},
  {en:['toe hold','toehold'], ja:'トーホールド', type:'tech'},
  {en:['butterfly sweep'], ja:'バタフライスイープ', type:'tech'},
  {en:['hip bump','hip bump sweep'], ja:'ヒップバンプスイープ', type:'tech'},
  {en:['scissor sweep','scissors sweep'], ja:'シザースイープ', type:'tech'},
  {en:['double under','double underhook pass'], ja:'ダブルアンダー', type:'tech'},
  {en:['single leg','single leg takedown'], ja:'シングルレッグ', type:'tech'},
  {en:['double leg','double leg takedown','blast double'], ja:'ダブルレッグ', type:'tech'},
  {en:['arm drag'], ja:'アームドラッグ', type:'tech'},
  {en:['collar drag'], ja:'カラードラッグ', type:'tech'},
  {en:['kimura'], ja:'キムラ', type:'tech'},
  {en:['americana'], ja:'アメリカーナ', type:'tech'},
  {en:['armbar','juji gatame'], ja:'アームバー', type:'tech'},
  {en:['bow and arrow','bow-and-arrow choke'], ja:'ボウアンドアロー', type:'tech'},
  {en:['clock choke'], ja:'クロックチョーク', type:'tech'},
  {en:['brabo','brabo choke'], ja:'ブラボーチョーク', type:'tech'},
  {en:['loop choke'], ja:'ループチョーク', type:'tech'},
  {en:['collar choke','lapel choke'], ja:'襟チョーク', type:'tech'},
  {en:['hip escape','shrimp','shrimping'], ja:'ヒップエスケープ', type:'tech'},
  {en:['bridge','upa','trap and roll'], ja:'ブリッジ', type:'tech'},
  {en:['lockdown'], ja:'ロックダウン', type:'tech'},
  {en:['dogfight'], ja:'ドッグファイト', type:'tech'},
  {en:['electric chair'], ja:'エレクトリックチェア', type:'tech'},
];

// TB推論キーワード
var TB_RULES = {
  'トップ':       ['guard pass','guard passing','passing the guard','from top','top control','on top','top game','top pressure','mount attack','from mount','back attack','attacking the back'],
  'ボトム':       ['sweep','sweeping','from guard','bottom game','guard retention','retain','guard recovery','mount escape','side control escape','escape','escaping','guard work','playing guard','open guard work'],
  'スタンディング':['takedown','take down','throw','wrestling','clinch','standing','on feet','judo','double leg','single leg takedown'],
};

// 起動時にlocalStorageの学習済みルールを読み込む
(function _loadSavedRules() {
  try {
    var saved = JSON.parse(localStorage.getItem('wk_tw_rules') || '[]');
    saved.forEach(function(r) {
      if (r.keyword && r.tag) DICT.push({en:[r.keyword], ja:r.tag, type:'cat'});
    });
  } catch(e) {}
})();

// ── チャンネルプロファイル ──
function _updateChannelProfile(channel, finalTags) {
  if (!channel) return;
  try {
    var profiles = JSON.parse(localStorage.getItem('wk_ch_profiles') || '{}');
    if (!profiles[channel]) profiles[channel] = {};
    var allTags = [].concat(
      finalTags.tb ? [finalTags.tb] : [],
      finalTags.pos || [],
      finalTags.cat || [],
      finalTags.tech || []
    );
    allTags.forEach(function(tag) {
      profiles[channel][tag] = (profiles[channel][tag] || 0) + 1;
    });
    localStorage.setItem('wk_ch_profiles', JSON.stringify(profiles));
  } catch(e) {}
}

function _getChannelSuggest(channel, n) {
  if (!channel) return [];
  try {
    var profiles = JSON.parse(localStorage.getItem('wk_ch_profiles') || '{}');
    var chData = profiles[channel] || {};
    return Object.keys(chData)
      .sort(function(a,b){ return chData[b] - chData[a]; })
      .slice(0, n || 5);
  } catch(e) { return []; }
}

// ── 帰納エンジン ──
var _history = [];

function _record(title, channel, auto, final) {
  _history.push({title: title, channel: channel, auto: auto, final: final});
}

function _induceRule() {
  // 修正があったエントリを収集
  var corrections = _history.filter(function(h) {
    var autoAll = [].concat(h.auto.tb ? [h.auto.tb] : [], h.auto.pos||[], h.auto.cat||[], h.auto.tech||[]);
    var finalAll = [].concat(h.final.tb ? [h.final.tb] : [], h.final.pos||[], h.final.cat||[], h.final.tech||[]);
    // 追加があるか
    return finalAll.some(function(t) { return autoAll.indexOf(t) < 0; });
  });
  if (corrections.length < 2) return null;

  // キーワード × 追加タグの共起カウント
  var cooc = {};
  corrections.forEach(function(h) {
    var autoAll = [].concat(h.auto.tb ? [h.auto.tb] : [], h.auto.pos||[], h.auto.cat||[], h.auto.tech||[]);
    var finalAll = [].concat(h.final.tb ? [h.final.tb] : [], h.final.pos||[], h.final.cat||[], h.final.tech||[]);
    var added = finalAll.filter(function(t) { return autoAll.indexOf(t) < 0; });
    var words = (h.title || '').toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(function(w){ return w.length > 3; });
    words.forEach(function(w) {
      added.forEach(function(tag) {
        var key = w + '|||' + tag;
        cooc[key] = (cooc[key] || 0) + 1;
      });
    });
  });

  // 2回以上出現するペアを探す
  var best = null, bestCount = 1;
  Object.keys(cooc).forEach(function(k) {
    if (cooc[k] > bestCount) { bestCount = cooc[k]; best = k; }
  });
  if (!best) return null;
  var parts = best.split('|||');
  return {keyword: parts[0], tag: parts[1]};
}

// ── 提案エンジン ──
function suggest(title, channel) {
  var lc = (title || '').toLowerCase();

  // TB スコアリング
  var tbScores = {};
  Object.keys(TB_RULES).forEach(function(tb) {
    var score = 0;
    TB_RULES[tb].forEach(function(kw) {
      if (lc.indexOf(kw) >= 0) score++;
    });
    tbScores[tb] = score;
  });
  var tbResult = null;
  var maxScore = 0;
  Object.keys(tbScores).forEach(function(tb) {
    if (tbScores[tb] > maxScore) { maxScore = tbScores[tb]; tbResult = tb; }
  });

  // pos / cat / tech マッチ
  var posSet = {}, catSet = {}, techSet = {};
  DICT.forEach(function(entry) {
    entry.en.forEach(function(kw) {
      if (lc.indexOf(kw.toLowerCase()) >= 0) {
        if (entry.type === 'pos') posSet[entry.ja] = true;
        else if (entry.type === 'cat') catSet[entry.ja] = true;
        else if (entry.type === 'tech') techSet[entry.ja] = true;
      }
    });
  });

  // チャンネルプロファイルで補完
  var chSuggest = _getChannelSuggest(channel, 5);
  var allPos = Object.keys(window.POSITIONS ? {} : {});
  var allCat = Object.keys(window.CATEGORIES ? {} : {});
  chSuggest.forEach(function(tag) {
    // 辞書にないものだけ補完（カテゴリとして追加）
    if (!posSet[tag] && !catSet[tag] && !techSet[tag]) {
      catSet[tag] = true;
    }
  });

  return {
    tb: tbResult,
    pos: Object.keys(posSet),
    cat: Object.keys(catSet),
    tech: Object.keys(techSet)
  };
}

// ── キュー管理 ──
var _queue = [];
var _qIdx = 0;
var _autoTags = null;
var _pendingRule = null;
var _previewOpen = false;

function _buildQueue() {
  var vids = (window.videos || []).filter(function(v) { return !v.archive; });
  // 未タグ優先 → 未verified → その他
  var untagged = vids.filter(function(v) {
    return (!v.tb || !v.tb.length) && (!v.pos || !v.pos.length) && (!v.cat || !v.cat.length);
  });
  var unverified = vids.filter(function(v) {
    return !v.verified && !((!v.tb || !v.tb.length) && (!v.pos || !v.pos.length) && (!v.cat || !v.cat.length));
  });
  var rest = vids.filter(function(v) {
    return v.verified;
  });
  return untagged.concat(unverified).concat(rest);
}

// ── DOM構築 ──
var _domInited = false;

function _ensureDOM() {
  if (_domInited) return;
  _domInited = true;

  // CSS注入
  var style = document.createElement('style');
  style.textContent = [
    '.tw-chip { padding:5px 11px; border-radius:20px; font-size:12px; font-weight:600;',
    '  cursor:pointer; border:1.5px solid var(--border,#2a2a4a);',
    '  background:var(--surface2,#1a1a2e); color:var(--text3,#aaa); transition:all .12s; user-select:none; }',
    '.tw-chip:hover { border-color:var(--accent,#4cc9f0); color:var(--accent,#4cc9f0); }',
    '.tw-chip.tw-active { background:var(--accent,#4cc9f0); border-color:var(--accent,#4cc9f0); color:var(--on-accent,#050d1a); }',
    '.tw-chip.tw-auto { border-color:#f4a26199; }',
    '.tw-chip.tw-active.tw-auto { background:#f4a261; border-color:#f4a261; color:#1a0800; }',
  ].join('\n');
  document.head.appendChild(style);

  // モーダルHTML
  var ov = document.createElement('div');
  ov.id = 'tw-overlay';
  ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
  ov.innerHTML = [
    '<div id="tw-modal" style="background:var(--surface1,#12122a);border-radius:16px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.7)">',
      // ヘッダー
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--border,#2a2a4a);flex-shrink:0">',
        '<span style="font-size:15px;font-weight:800;color:var(--text1,#eee);flex:1">🏷 タグ付けウィザード</span>',
        '<span id="tw-prog-num" style="font-size:11px;color:var(--text3,#aaa);white-space:nowrap"></span>',
        '<button onclick="window._twClose?.()" style="background:none;border:none;color:var(--text3,#aaa);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>',
      '</div>',
      // プログレスバー
      '<div style="height:3px;background:var(--surface2,#1a1a2e);flex-shrink:0"><div id="tw-prog-fill" style="height:100%;background:var(--accent,#4cc9f0);width:0%;transition:width .3s"></div></div>',
      // 本体
      '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">',
        // 凡例
        '<div style="display:flex;gap:12px;font-size:11px;color:var(--text3,#aaa)">',
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f4a261;margin-right:4px;vertical-align:middle"></span>辞書自動</span>',
          '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent,#4cc9f0);margin-right:4px;vertical-align:middle"></span>手動選択</span>',
        '</div>',
        // 動画情報
        '<div style="display:flex;gap:10px;align-items:flex-start">',
          '<div id="tw-thumb-wrap" style="flex-shrink:0;cursor:pointer;border-radius:8px;overflow:hidden;width:96px;height:54px;background:var(--surface2,#1a1a2e)" onclick="window._twTogglePreview?.()">',
            '<img id="tw-thumb" src="" alt="" style="width:100%;height:100%;object-fit:cover;display:block">',
          '</div>',
          '<div style="flex:1;min-width:0">',
            '<div id="tw-ch" style="font-size:11px;color:var(--accent,#4cc9f0);font-weight:700;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>',
            '<div id="tw-title" style="font-size:13px;font-weight:700;color:var(--text1,#eee);line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden"></div>',
            '<div id="tw-hint" style="margin-top:5px;font-size:11px;color:var(--text3,#aaa)"></div>',
          '</div>',
        '</div>',
        // iframe (YT埋め込み)
        '<iframe id="tw-iframe" src="" allow="autoplay" allowfullscreen style="display:none;width:100%;aspect-ratio:16/9;border:none;border-radius:8px"></iframe>',
        // TB
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#aaa);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">トップ/ボトム</div>',
          '<div id="tw-tb-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // ポジション
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#aaa);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">ポジション</div>',
          '<div id="tw-pos-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // カテゴリ
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#aaa);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">カテゴリ</div>',
          '<div id="tw-cat-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // テクニック
        '<div>',
          '<div style="font-size:11px;font-weight:700;color:var(--text3,#aaa);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">テクニック</div>',
          '<div id="tw-tech-chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
          '<div style="display:flex;gap:6px;margin-top:8px">',
            '<input id="tw-tech-input" type="text" placeholder="テクニックを追加..." style="flex:1;padding:5px 10px;border-radius:20px;border:1.5px solid var(--border,#2a2a4a);background:var(--surface2,#1a1a2e);color:var(--text1,#eee);font-size:12px;outline:none;font-family:inherit" onkeydown="if(event.key===\'Enter\')window._twAddTech?.()">',
            '<button onclick="window._twAddTech?.()" style="padding:5px 12px;border-radius:20px;background:var(--surface2,#1a1a2e);border:1.5px solid var(--border,#2a2a4a);color:var(--text3,#aaa);font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit">追加</button>',
          '</div>',
        '</div>',
        // デルタ表示
        '<div id="tw-delta-box" style="display:none;background:var(--surface2,#1a1a2e);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--text3,#aaa)">',
          '<div style="font-weight:700;margin-bottom:4px;color:var(--text2,#ccc)">変更内容</div>',
          '<div id="tw-delta-content" style="display:flex;flex-wrap:wrap;gap:6px"></div>',
        '</div>',
        // 帰納ルール提案
        '<div id="tw-induct-box" style="display:none;background:rgba(76,201,240,.08);border:1.5px solid var(--accent,#4cc9f0);border-radius:10px;padding:10px 12px;font-size:12px">',
          '<div style="font-weight:700;color:var(--accent,#4cc9f0);margin-bottom:6px">💡 学習ルール提案</div>',
          '<div id="tw-induct-text" style="color:var(--text2,#ccc);margin-bottom:8px"></div>',
          '<div style="display:flex;gap:8px">',
            '<button onclick="window._twAcceptRule?.()" style="padding:5px 14px;border-radius:20px;background:var(--accent,#4cc9f0);border:none;color:var(--on-accent,#050d1a);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">採用する</button>',
            '<button onclick="window._twSkipRule?.()" style="padding:5px 14px;border-radius:20px;background:none;border:1.5px solid var(--border,#2a2a4a);color:var(--text3,#aaa);font-size:12px;cursor:pointer;font-family:inherit">スキップ</button>',
          '</div>',
        '</div>',
      '</div>',
      // フッター
      '<div style="display:flex;gap:8px;padding:10px 16px 14px;border-top:1px solid var(--border,#2a2a4a);flex-shrink:0">',
        '<button onclick="window._twSkip?.()" style="flex:1;padding:10px;border-radius:20px;background:none;border:1.5px solid var(--border,#2a2a4a);color:var(--text3,#aaa);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">スキップ</button>',
        '<button onclick="window._twConfirm?.()" style="flex:2;padding:10px;border-radius:20px;background:var(--accent,#4cc9f0);border:none;color:var(--on-accent,#050d1a);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">確定して次へ →</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(ov);
}

// ── チップ生成 ──
function _makeChip(val, isAuto, isActive, isSingle) {
  var chip = document.createElement('div');
  chip.className = 'tw-chip' + (isActive ? ' tw-active' : '') + (isAuto ? ' tw-auto' : '');
  chip.dataset.val = val;
  chip.textContent = val;
  chip.addEventListener('click', function() {
    if (isSingle) {
      // 単一選択（TB）
      var parent = chip.parentNode;
      Array.from(parent.querySelectorAll('.tw-chip')).forEach(function(c) {
        c.classList.remove('tw-active');
      });
      chip.classList.toggle('tw-active');
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
  // autoValsを先頭に
  var autoArr = autoVals.filter(function(v) { return v; });
  var rest = all.filter(function(v) { return autoArr.indexOf(v) < 0; }).sort();
  var ordered = autoArr.concat(rest);
  ordered.forEach(function(val) {
    var isAuto = autoArr.indexOf(val) >= 0;
    var chip = _makeChip(val, isAuto, isAuto, false);
    container.appendChild(chip);
  });
}

// ── アイテム読み込み ──
function _loadItem() {
  if (_qIdx >= _queue.length) { _showDone(); return; }
  var v = _queue[_qIdx];
  var title = v.title || v.name || '';
  var channel = v.channel || v.ch || '';
  var pt = v.pt || v.platform || '';

  // プレイヤーリセット
  _previewOpen = false;
  var fr = document.getElementById('tw-iframe');
  if (fr) { fr.src = ''; fr.style.display = 'none'; }

  // 提案取得
  _autoTags = suggest(title, channel);

  // ヒント文字列生成（最初のマッチを3件まで）
  var hintParts = [];
  var lc = title.toLowerCase();
  DICT.forEach(function(entry) {
    if (hintParts.length >= 3) return;
    entry.en.forEach(function(kw) {
      if (hintParts.length >= 3) return;
      if (lc.indexOf(kw.toLowerCase()) >= 0) {
        hintParts.push('"' + kw + '" → ' + entry.ja);
      }
    });
  });

  // DOM更新
  var elTitle = document.getElementById('tw-title');
  var elCh = document.getElementById('tw-ch');
  var elHint = document.getElementById('tw-hint');
  var elThumb = document.getElementById('tw-thumb');
  var elThumbWrap = document.getElementById('tw-thumb-wrap');

  if (elTitle) elTitle.textContent = title;
  if (elCh) elCh.textContent = channel;
  if (elHint) elHint.textContent = hintParts.length ? '検出: ' + hintParts.join(' / ') : '';

  // サムネイル
  var ytId = v.ytId || v.id;
  if (elThumb) {
    if (pt === 'youtube' && ytId) {
      elThumb.src = 'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg';
      elThumb.style.display = 'block';
      if (elThumbWrap) elThumbWrap.style.cursor = 'pointer';
    } else {
      elThumb.src = '';
      elThumb.style.display = 'none';
      if (elThumbWrap) elThumbWrap.style.cursor = 'default';
    }
  }

  // TB chips
  var tbContainer = document.getElementById('tw-tb-chips');
  if (tbContainer) {
    tbContainer.innerHTML = '';
    ['トップ','ボトム','スタンディング'].forEach(function(tb) {
      var isAuto = _autoTags.tb === tb;
      var chip = _makeChip(tb, isAuto, isAuto, true);
      tbContainer.appendChild(chip);
    });
  }

  // ポジション chips
  var allPos = [];
  try {
    allPos = [...new Set([
      ...(window.POSITIONS||[]).map(function(p){ return p.ja || p.name || p; }),
      ...(window.videos||[]).flatMap(function(v2){ return v2.pos || []; })
    ])].filter(Boolean);
  } catch(e) { allPos = []; }
  _fillChips('tw-pos-chips', allPos, _autoTags.pos || []);

  // カテゴリ chips
  var allCat = [];
  try {
    allCat = [...new Set([
      ...(window.CATEGORIES||[]).map(function(c){ return c.name || c; }),
      ...(window.videos||[]).flatMap(function(v2){ return v2.cat || []; })
    ])].filter(Boolean);
  } catch(e) { allCat = []; }
  _fillChips('tw-cat-chips', allCat, _autoTags.cat || []);

  // テクニック chips
  var techFromDict = DICT.filter(function(e){ return e.type==='tech'; }).map(function(e){ return e.ja; });
  var allTech = [];
  try {
    allTech = [...new Set([
      ...techFromDict,
      ...(window.videos||[]).flatMap(function(v2){ return v2.tags || []; })
    ])].filter(Boolean);
  } catch(e) { allTech = techFromDict; }
  _fillChips('tw-tech-chips', allTech, _autoTags.tech || []);

  // テキスト入力クリア
  var techInput = document.getElementById('tw-tech-input');
  if (techInput) techInput.value = '';

  // デルタ・帰納をhide
  var deltaBox = document.getElementById('tw-delta-box');
  if (deltaBox) deltaBox.style.display = 'none';
  var inductBox = document.getElementById('tw-induct-box');
  if (inductBox) inductBox.style.display = 'none';

  _updateProgress();
}

// ── デルタ更新 ──
function _updateDelta() {
  var deltaBox = document.getElementById('tw-delta-box');
  var deltaContent = document.getElementById('tw-delta-content');
  if (!deltaBox || !deltaContent || !_autoTags) return;

  var groups = [
    {containerId:'tw-tb-chips',   autoVals: _autoTags.tb ? [_autoTags.tb] : []},
    {containerId:'tw-pos-chips',  autoVals: _autoTags.pos || []},
    {containerId:'tw-cat-chips',  autoVals: _autoTags.cat || []},
    {containerId:'tw-tech-chips', autoVals: _autoTags.tech || []},
  ];

  var removedItems = [];
  var addedItems = [];

  groups.forEach(function(g) {
    var container = document.getElementById(g.containerId);
    if (!container) return;
    var autoSet = g.autoVals;
    var activeSet = Array.from(container.querySelectorAll('.tw-chip.tw-active')).map(function(c){ return c.dataset.val; });
    autoSet.forEach(function(t) { if (activeSet.indexOf(t) < 0) removedItems.push(t); });
    activeSet.forEach(function(t) { if (autoSet.indexOf(t) < 0) addedItems.push(t); });
  });

  if (removedItems.length === 0 && addedItems.length === 0) {
    deltaBox.style.display = 'none';
    return;
  }

  deltaBox.style.display = 'block';
  deltaContent.innerHTML = '';
  removedItems.forEach(function(t) {
    var span = document.createElement('span');
    span.style.cssText = 'padding:3px 8px;border-radius:12px;background:rgba(244,162,97,.15);color:#f4a261;text-decoration:line-through;font-size:11px';
    span.textContent = '−' + t;
    deltaContent.appendChild(span);
  });
  addedItems.forEach(function(t) {
    var span = document.createElement('span');
    span.style.cssText = 'padding:3px 8px;border-radius:12px;background:rgba(76,217,100,.15);color:#4cd964;font-size:11px';
    span.textContent = '+' + t;
    deltaContent.appendChild(span);
  });
}

// ── プログレス更新 ──
function _updateProgress() {
  var progNum = document.getElementById('tw-prog-num');
  var progFill = document.getElementById('tw-prog-fill');
  if (progNum) progNum.textContent = (_qIdx + 1) + ' / ' + _queue.length;
  if (progFill) progFill.style.width = ((_qIdx / Math.max(_queue.length, 1)) * 100) + '%';
}

// ── 完了画面 ──
function _showDone() {
  var modal = document.getElementById('tw-modal');
  if (!modal) return;
  modal.innerHTML = [
    '<div style="padding:40px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px">',
      '<div style="font-size:48px">🎉</div>',
      '<div style="font-size:18px;font-weight:800;color:var(--text1,#eee)">すべて完了！</div>',
      '<div style="font-size:13px;color:var(--text3,#aaa)">キューの動画をすべてタグ付けしました。</div>',
      '<button onclick="window._twClose?.()" style="margin-top:8px;padding:10px 28px;border-radius:20px;background:var(--accent,#4cc9f0);border:none;color:var(--on-accent,#050d1a);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">閉じる</button>',
    '</div>',
  ].join('');
}

// ── 公開関数 ──
function _open() {
  _ensureDOM();
  _queue = _buildQueue();
  _qIdx = 0;
  _pendingRule = null;
  var ov = document.getElementById('tw-overlay');
  if (ov) {
    ov.style.display = 'flex';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';
  }
  _loadItem();
}

function _close() {
  var ov = document.getElementById('tw-overlay');
  if (ov) ov.style.display = 'none';
  // プレイヤーリセット
  _previewOpen = false;
  var fr = document.getElementById('tw-iframe');
  if (fr) { fr.src = ''; fr.style.display = 'none'; }
}

function _next() {
  _qIdx++;
  var inductBox = document.getElementById('tw-induct-box');
  if (inductBox) inductBox.style.display = 'none';
  _pendingRule = null;
  _loadItem();
}

// ── window公開 ──
window._twOpen = _open;
window._twClose = _close;

window._twTogglePreview = function() {
  var v = _queue[_qIdx];
  if (!v) return;
  var pt = v.pt || v.platform || '';
  if (pt !== 'youtube') return;
  var ytId = v.ytId || v.id;
  if (!ytId) return;
  var fr = document.getElementById('tw-iframe');
  if (!fr) return;
  _previewOpen = !_previewOpen;
  if (_previewOpen) {
    fr.src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1';
    fr.style.display = 'block';
  } else {
    fr.src = '';
    fr.style.display = 'none';
  }
};

window._twAddTech = function() {
  var input = document.getElementById('tw-tech-input');
  if (!input) return;
  var val = input.value.trim();
  if (!val) return;
  var container = document.getElementById('tw-tech-chips');
  if (!container) return;
  // 既存チップがあればactive化
  var existing = container.querySelector('[data-val="' + val + '"]');
  if (existing) {
    existing.classList.add('tw-active');
  } else {
    var chip = _makeChip(val, false, true, false);
    container.appendChild(chip);
  }
  input.value = '';
  _updateDelta();
};

window._twConfirm = function() {
  var v = _queue[_qIdx];
  if (!v) return;

  // final tags収集
  var tbContainer = document.getElementById('tw-tb-chips');
  var activeChip = tbContainer ? tbContainer.querySelector('.tw-chip.tw-active') : null;
  var finalTb = activeChip ? activeChip.dataset.val : null;

  function _getActive(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return [];
    return Array.from(el.querySelectorAll('.tw-chip.tw-active')).map(function(c){ return c.dataset.val; });
  }

  var finalPos = _getActive('tw-pos-chips');
  var finalCat = _getActive('tw-cat-chips');
  var finalTech = _getActive('tw-tech-chips');

  var final = {tb: finalTb, pos: finalPos, cat: finalCat, tech: finalTech};

  // 動画データ更新
  v.tb = finalTb ? [finalTb] : (v.tb || []);
  v.pos = finalPos;
  v.cat = finalCat;
  v.tags = [...new Set([...(v.tags || []), ...finalTech])];
  v.verified = true;

  // 保存・表示更新
  if (window.saveUserData) window.saveUserData();
  if (window.AF) window.AF();

  // チャンネルプロファイル更新
  _record(v.title || v.name || '', v.channel || v.ch || '', _autoTags, final);
  _updateChannelProfile(v.channel || v.ch || '', final);

  // 帰納チェック
  var rule = _induceRule();
  if (rule) {
    _pendingRule = rule;
    var inductBox = document.getElementById('tw-induct-box');
    var inductText = document.getElementById('tw-induct-text');
    if (inductText) inductText.textContent = '"' + rule.keyword + '" というキーワードが含まれる動画には "' + rule.tag + '" タグが頻繁に追加されています。辞書ルールとして採用しますか？';
    if (inductBox) inductBox.style.display = 'block';
    return; // まだ次へ進まない
  }

  _next();
};

window._twSkip = function() { _next(); };

window._twAcceptRule = function() {
  if (!_pendingRule) { _next(); return; }
  var rule = _pendingRule;
  // 辞書に追加
  DICT.push({en:[rule.keyword], ja:rule.tag, type:'cat'});
  // localStorageにも保存
  try {
    var saved = JSON.parse(localStorage.getItem('wk_tw_rules') || '[]');
    saved.push(rule);
    localStorage.setItem('wk_tw_rules', JSON.stringify(saved));
  } catch(e) {}
  if (window.toast) window.toast('"' + rule.keyword + '" → "' + rule.tag + '" をルールに追加しました');
  _next();
};

window._twSkipRule = function() { _next(); };

})();
