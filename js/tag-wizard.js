// ═══ WAZA KIMURA — タグ付けウィザード v52.428 ═══
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

// ── 提案エンジン（tag-master.js の autoTagFromTitle を使用）──
function _suggest(title, channel) {
  // window.autoTagFromTitle は tag-master.js で定義 → {tb:[], cat:[], pos:[], tags:[]}
  var base = window.autoTagFromTitle ? window.autoTagFromTitle(title) : {tb:[], cat:[], pos:[], tags:[]};

  // TB は配列だが wizard は単一選択 → 先頭を使う
  var tb = (base.tb && base.tb.length) ? base.tb[0] : null;

  // ポジション: autoTagFromTitle の結果 + window.POSITIONS（admin管理の最新リスト）でも追加マッチング
  // → tag-master.js の内部リストにない「サイドコントロール」等も検出できる
  var posList = (base.pos || []).slice();
  var tLower  = (title || '').toLowerCase();
  (window.POSITIONS || []).forEach(function(p) {
    if (!p.ja || posList.indexOf(p.ja) >= 0) return;
    var keys = [p.ja, p.en].concat(p.aliases || []).filter(Boolean);
    var hit  = keys.some(function(k) { return k && k.length >= 2 && tLower.indexOf(k.toLowerCase()) >= 0; });
    if (hit) posList.push(p.ja);
  });

  // カテゴリ: チャンネル学習で補完
  var cats = (base.cat || []).slice();
  _getChannelSuggest(channel, 5).forEach(function(tag) {
    var inCat = (window.CATEGORIES||[]).some(function(c){ return c.name === tag; });
    if (inCat && cats.indexOf(tag) < 0) cats.push(tag);
  });

  return { tb: tb, pos: posList, cat: cats, tech: base.tags||[] };
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
  document.getElementById('tw-btn-skip-rule').addEventListener('click', _next);
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
  var _info   = _getEmbedInfo(v);

  // プレイヤーリセット
  _previewOpen = false;
  var fr = document.getElementById('tw-iframe');
  if (fr) { fr.src = ''; fr.style.display = 'none'; }

  // ── 自動提案（tag-master.js の autoTagFromTitle を使用）──
  _autoTags = _suggest(title, channel);

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
  var tbValues    = window.TB_VALUES || ['トップ','ボトム','スタンディング'];
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
  v.verified = Date.now();

  if (window.saveUserData) window.saveUserData();
  if (window.AF) window.AF();

  var title   = v.title || v.name || '';
  var channel = v.ch || v.channel || '';
  _record(title, channel, _autoTags, final);
  _updateChannelProfile(channel, final);

  var rule = _induceRule();
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

// ── ルール採用 ──
function _acceptRule() {
  if (!_pendingRule) { _next(); return; }
  // 帰納ルールはチャンネルプロファイルに蓄積するのみ（CATEGORIES/POSITIONSへの追加は行わない）
  try {
    var saved = JSON.parse(localStorage.getItem('wk_tw_rules')||'[]');
    saved.push(_pendingRule);
    localStorage.setItem('wk_tw_rules', JSON.stringify(saved));
  } catch(e) {}
  if (window.toast) window.toast('"'+_pendingRule.keyword+'" パターンを記録しました');
  _next();
}

// ── open / close / next ──
function _open() {
  _ensureDOM();
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
