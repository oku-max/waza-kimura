// ═══ WAZA KIMURA — タグ付けウィザード v52.441 ═══
// データソース: ユーザーの選択肢（window.tagPresets）。組み込みの一覧は読まない（v52.827）
(function () {
'use strict';

// チャンネルプロファイル学習（wk_ch_profiles）は v52.807 で廃止。
// Notion「タグシステム再考」項目14。保存済みの wk_ch_profiles は消さない（読まなくなるだけ）。

// 帰納学習（_history / _record / _induceRule / _acceptRule / wk_tw_skipped_rules）と
// ルール適用エンジン（waza_ai_rules）は v52.815 で廃止。
// 「このキーワードが入っていたらこのタグ」を覚えて次から勝手に付ける仕組みで、
// オーナーが不要と判断したキーワード推定そのものだった。
// 保存済みの wk_tw_skipped_rules / waza_ai_rules は消さない（読まなくなるだけ）。




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

// ── キュー管理 ──
var _queue=[], _qIdx=0, _previewOpen=false;

function _hasData(v) {
  var TF = window.tagFilter, R = window.tagRegistry;
  if (TF && R) return TF.groups().some(function(g){ return R.valuesOf(v, g.id).length > 0; });
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
    '.tw-glbl{font-size:11px;font-weight:700;color:var(--text3,#999);margin-bottom:6px;letter-spacing:.05em}',
    '.tw-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.tw-sel{width:100%;padding:7px 10px;border-radius:10px;margin-top:8px;',
    '  border:1.5px solid var(--border,#e0e0dc);background:var(--surface2,#f1f1ef);',
    '  color:var(--text,#111);font-size:12px;outline:none;font-family:inherit;cursor:pointer;}',
    '.tw-sel:focus{border-color:var(--accent,#111);}',
    '.tw-in{flex:1;padding:5px 10px;border-radius:20px;border:1.5px solid var(--border,#e0e0dc);background:var(--surface2,#f1f1ef);color:var(--text,#111);font-size:12px;outline:none;font-family:inherit}',
    '.tw-add{padding:5px 12px;border-radius:20px;background:var(--surface2,#f1f1ef);border:1.5px solid var(--border,#e0e0dc);color:var(--text3,#999);font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit}',
    '.tw-empty{font-size:11px;color:var(--text3,#999)}',
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
          '</div>',
        '</div>',
        // iframe
        '<iframe id="tw-iframe" src="" allow="autoplay" allowfullscreen style="display:none;width:100%;aspect-ratio:16/9;border:none;border-radius:8px"></iframe>',
        // タグ（タグ1〜4の枠のグループ。中身は _loadItem で並べる）
        '<div id="tw-groups" style="display:flex;flex-direction:column;gap:12px"></div>',
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
  var gbox = document.getElementById('tw-groups');
  gbox.addEventListener('click', _onGroupsClick);
  gbox.addEventListener('change', _onGroupsChange);
  gbox.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.classList.contains('tw-in')) { e.preventDefault(); _addFromInput(e.target.dataset.gid); } });
  document.getElementById('tw-play-btn').addEventListener('click', _togglePreview);
}

// ── タグの欄（段階3c-2）──
// タグ1〜4の枠に入っているグループを並べる（新しいタググループも出る）。マーク・習得は別の画面にある（段階5）。
// 候補はユーザーの選択肢。選択肢に無いのに動画に付いている値は、消さずに先頭に出す（押さなければそのまま残る）。
// 確定したとき、**変えた値だけ**を動画パネルと同じ入口（wkSetTagValue）で付け外しする。
// 以前は配列を丸ごと置き換えていた（タグ1は1つに絞られ、テクニックは × で外しても残った）。
var _FIELDS = ['tb', 'cat', 'pos', 'tags'];
var _orig = {}, _sel = {};   // グループID → 値の配列（読み込んだ時点／今の選択）
function _R() { return window.tagRegistry; }
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function _tagVis(key) { var ts = window.tagSettings || []; var s = ts.filter(function(t){ return t.key === key; })[0]; return s ? s.visible !== false : true; }
function _twGroups() {
  var R = _R(); if (!R) return [];
  return R.slots().filter(function(g){ return g && (_FIELDS.indexOf(g.store) >= 0 || g.store === 'map'); })
    .filter(function(g){ return _FIELDS.indexOf(g.store) < 0 || _tagVis(g.store); });
}
function _vals(v, g) { return _R().valuesOf(v, g.id).slice(); }
function _allowNew(g) { return g.store === 'tags'; }
// 候補: 選択肢（＋テクニックはほかの動画に付いている値）。今付いている値で選択肢に無いものは先頭
function _cands(g, cur) {
  var opts = (g.options || []).filter(Boolean).slice();
  if (_allowNew(g)) (window.videos || []).forEach(function(x){ _R().valuesOf(x, g.id).forEach(function(t){ if (t && opts.indexOf(t) < 0) opts.push(t); }); });
  var extra = cur.filter(function(x){ return opts.indexOf(x) < 0; });
  return extra.concat(opts);
}
function _renderGroups() {
  var box = document.getElementById('tw-groups'); if (!box) return;
  var gs = _twGroups();
  if (!gs.length) { box.innerHTML = '<div class="tw-empty">タグ1〜4に使うタググループがありません（タグ設定で選べます）</div>'; return; }
  box.innerHTML = gs.map(function(g){
    var sel = _sel[g.id] || [];
    var h = '<div><div class="tw-glbl" data-user-text="1">' + _esc(g.name) + '</div>';
    if (_allowNew(g)) {
      h += '<div class="tw-chips">' + sel.map(function(t){
        return '<span class="tw-chip tw-active" data-gid="' + _esc(g.id) + '" data-val="' + _esc(t) + '" data-act="rm" style="display:inline-flex;align-items:center;gap:3px;padding-right:7px">' + _esc(t) + '<span style="margin-left:2px;opacity:.5;font-size:11px;font-weight:700">×</span></span>';
      }).join('') + '</div>';
      var rest = _cands(g, sel).filter(function(t){ return sel.indexOf(t) < 0; }).sort(function(a, b){ return String(a).localeCompare(String(b), 'ja'); });
      h += '<select class="tw-sel" data-gid="' + _esc(g.id) + '"><option value="">— 既存タグから選択 —</option>' + rest.map(function(t){ return '<option value="' + _esc(t) + '">' + _esc(t) + '</option>'; }).join('') + '</select>';
      h += '<div style="display:flex;gap:6px;margin-top:8px"><input class="tw-in" data-gid="' + _esc(g.id) + '" type="text" placeholder="新しいタグを入力..."><button class="tw-add" data-act="add" data-gid="' + _esc(g.id) + '">追加</button></div>';
    } else {
      var c = _cands(g, sel);
      h += c.length
        ? '<div class="tw-chips">' + c.map(function(t){ return '<span class="tw-chip' + (sel.indexOf(t) >= 0 ? ' tw-active' : '') + '" data-gid="' + _esc(g.id) + '" data-val="' + _esc(t) + '" data-act="tog">' + _esc(t) + '</span>'; }).join('') + '</div>'
        : '<div class="tw-empty">選択肢がありません（タグ設定で足せます）</div>';
    }
    return h + '</div>';
  }).join('');
}
function _toggle(gid, val, on) {
  var a = _sel[gid] || (_sel[gid] = []);
  var i = a.indexOf(val);
  if (on && i < 0) a.push(val);
  if (!on && i >= 0) a.splice(i, 1);
  _renderGroups(); _updateDelta();
}
function _onGroupsClick(e) {
  var el = e.target.closest('[data-act]'); if (!el) return;
  var gid = el.dataset.gid, act = el.dataset.act;
  if (act === 'tog') _toggle(gid, el.dataset.val, (_sel[gid] || []).indexOf(el.dataset.val) < 0);
  else if (act === 'rm') _toggle(gid, el.dataset.val, false);
  else if (act === 'add') _addFromInput(gid);
}
function _onGroupsChange(e) {
  var s = e.target; if (!s.classList.contains('tw-sel') || !s.value) return;
  _toggle(s.dataset.gid, s.value, true);
}
function _addFromInput(gid) {
  var inp = document.querySelector('#tw-groups .tw-in[data-gid="' + (window.CSS && CSS.escape ? CSS.escape(gid) : gid) + '"]');
  var val = inp ? inp.value.trim() : '';
  if (val) _toggle(gid, val, true);
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

  // テキスト更新
  var elTitle = document.getElementById('tw-title');
  var elCh    = document.getElementById('tw-ch');
  var elPl    = document.getElementById('tw-pl');
  if (elTitle) elTitle.textContent = title;
  if (elCh)    elCh.textContent    = channel || '（不明）';
  if (elPl)  { elPl.textContent = pl ? '📋 ' + pl : ''; elPl.style.display = pl ? 'block' : 'none'; }

  // サムネイル・再生ボタン
  var elThumb   = document.getElementById('tw-thumb');
  var elPlayBtn = document.getElementById('tw-play-btn');
  if (elThumb)   { elThumb.src = _info.thumb || ''; elThumb.style.display = _info.thumb ? 'block' : 'none'; }
  if (elPlayBtn) elPlayBtn.style.display = _info.canPlay ? 'flex' : 'none';

  // タグ: 今付いている値を控えてから並べる（確定のとき、変えた分だけを書く）
  _orig = {}; _sel = {};
  _twGroups().forEach(function(g){ _orig[g.id] = _vals(v, g); _sel[g.id] = _orig[g.id].slice(); });
  _renderGroups();

  var memoEl = document.getElementById('tw-memo');
  if (memoEl) memoEl.value = v.memo || '';

  var deltaBox = document.getElementById('tw-delta-box');
  if (deltaBox) deltaBox.style.display = 'none';

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
  if (!deltaBox || !deltaContent) return;

  var removedItems=[], addedItems=[];
  Object.keys(_sel).forEach(function(gid){
    var o = _orig[gid] || [], s = _sel[gid] || [];
    o.forEach(function(t){ if (s.indexOf(t) < 0) removedItems.push(t); });
    s.forEach(function(t){ if (o.indexOf(t) < 0) addedItems.push(t); });
  });

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

  // 読み込んだときのグループで書く（開いている間に枠が変わっても、見ていた欄のとおりに）
  Object.keys(_sel).forEach(function(gid){
    var g = _R() && _R().group(gid); if (!g) return;
    var o = _orig[gid] || [], s = _sel[gid] || [];
    o.forEach(function(t){ if (s.indexOf(t) < 0) _write(v, g, t, false); });
    s.forEach(function(t){ if (o.indexOf(t) < 0) _write(v, g, t, true); });
  });
  var memoEl = document.getElementById('tw-memo');
  if (memoEl) { var m = memoEl.value.trim(); if (m) v.memo = m; else delete v.memo; }
  v.verified = Date.now();

  if (window.saveUserData) window.saveUserData();
  if (window.AF) window.AF();

  _next();
}

function _write(v, g, val, on) {
  if (window.wkSetTagValue) return window.wkSetTagValue(v, g.id, val, on);
  // vpanel-v4.js が無いときの控え（今の4つだけ。新しいグループは書かない）
  if (_FIELDS.indexOf(g.store) < 0) return false;
  if (!Array.isArray(v[g.store])) v[g.store] = [];
  var i = v[g.store].indexOf(val);
  if (on && i < 0) v[g.store].push(val);
  if (!on && i >= 0) v[g.store].splice(i, 1);
  return true;
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
  // admin-dashboard で更新された POSITIONS/CATEGORIES を確実に反映する
  if (window.syncPositionsFromStorage) window.syncPositionsFromStorage();
  if (window.syncCatsFromStorage)      window.syncCatsFromStorage();
  _queue = _buildQueue();
  _qIdx = 0;
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
  _loadItem();
}

// ── 公開API ──
window._twOpen  = _open;
window._twClose = _close;

})();
