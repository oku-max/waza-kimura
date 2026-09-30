// ═══ WAZA KIMURA — フィルターオーバーレイ & サイドバー ═══
import { _syncChipsToState } from './filter.js';

// ── ドロップダウン外クリックで全DD閉じる（フィルター・VPanel・GDrive共通）──
document.addEventListener('click', function(e) {
  // 各DDごとに個別判定（グローバル .vp-dd-wrap チェックは他のwrap内クリックでも閉じなくなるため誤り）
  document.querySelectorAll('.vp-dd').forEach(dd => {
    if (dd.style.display === 'none') return;
    if (dd.contains(e.target)) return;
    const wrap = dd.closest('.vp-dd-wrap');
    if (wrap && wrap.contains(e.target)) return;
    dd.style.display = 'none';
  });
});

// ── ユーティリティ ──
export function mkChip(label, isActive, onClick) {
  const el = document.createElement('div');
  el.className = 'chip' + (isActive ? ' active' : '');
  el.style.flexShrink = '0';
  el.textContent = label;
  el.onclick = onClick;
  return el;
}

// ── サイドバー開閉 ──
export function toggleSidebar() {
  const shell = document.getElementById('appShell');
  const btn   = document.getElementById('sidebar-toggle-btn');
  if (!shell || !btn) return;
  const collapsed = shell.classList.toggle('sidebar-collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
  btn.style.left  = collapsed ? '0' : '220px';
  // --sbw を更新 → CSS left:var(--sbw) が organizeTab を自動追随
  requestAnimationFrame(() => {
    const sb  = document.getElementById('filterSidebar');
    const res = document.getElementById('sbResizer');
    const w   = collapsed ? 0 : ((sb?.offsetWidth || 0) + (res?.offsetWidth || 0));
    document.documentElement.style.setProperty('--sbw', w + 'px');
  });
}

export function syncSidebarChipStates() {
  const f = window.filters || {};
  ['今すぐ','そのうち','保留'].forEach(v => {
    const el  = document.getElementById('fs-prio-' + v);  if (el)  el.classList.toggle('active', f.prio?.has(v));
  });
}

// ── 絞り込みを開く ──
// 統合フィルターパネル（uniOpen）を開く。
// 旧オーバーレイ（#filter-overlay・行ビルダー・保存した検索の一覧）は v52.873 で削除（役目が終わっていた）。
export function openFilterOverlay() {
  if (window.uniOpen) {
    // 現在のビューモードに合わせて書き込み先を選ぶ。
    // テーブル(org)モードで lib 文脈に書くと orgFilters を読むテーブルに反映されず、
    // カードだけタグが効く不整合になっていた。
    const ctx = (window._libViewMode === 'org') ? 'org' : 'lib';
    window.uniOpen('src', ctx);
    return;
  }
  window.toast?.('絞り込みを読み込めませんでした。再読み込みしてください');
}

export function toggleFilterOverlay() { openFilterOverlay(); }


// ── アルファベット/あいうえお グループ化ヘルパー ──
function _fovGetAlphaGroup(str) {
  if (!str) return '#';
  const c = str[0];
  const code = c.charCodeAt(0);
  if (code >= 0x3041 && code <= 0x3096) {
    const hGroups = [['あ','い','う','え','お'],['か','き','く','け','こ','が','ぎ','ぐ','げ','ご'],['さ','し','す','せ','そ','ざ','じ','ず','ぜ','ぞ'],['た','ち','つ','て','と','だ','ぢ','づ','で','ど'],['な','に','ぬ','ね','の'],['は','ひ','ふ','へ','ほ','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ'],['ま','み','む','め','も'],['や','ゆ','よ'],['ら','り','る','れ','ろ'],['わ','を','ん']];
    const labels = ['あ行','か行','さ行','た行','な行','は行','ま行','や行','ら行','わ行'];
    for (let i = 0; i < hGroups.length; i++) { if (hGroups[i].includes(c)) return labels[i]; }
  }
  if (code >= 0x30A1 && code <= 0x30F6) return _fovGetAlphaGroup(String.fromCharCode(code - 0x60));
  if (/[A-Za-z]/.test(c)) return c.toUpperCase();
  return c;
}

// 旧・サイドバーのフィルターピッカー（toggleFsPicker / fsPick / clearFsField ほか）は v52.846 で削除。
// 器（fs-picker-* / fs-sel-* / fs-all-*）が画面に無く、呼び出し元も無かった。

// ── 保存した検索条件（廃止・カスタムビューに統合 v52.594）──
// 一覧・適用・名前の変更などの画面は v52.873 で削除（表示先が旧オーバーレイの中だけだった）。
// 端末に残っている旧データの掃除だけは続ける。
try { localStorage.removeItem('wk-saved-searches'); } catch(e) {}

// 「現在の絞り込みを保存」はカスタムビュー作成（動的条件）に一本化。統合フィルターから呼ばれる
export function saveCurrentSearch() {
  if (window._cvCreateFromCurrentFilter) return window._cvCreateFromCurrentFilter();
}
export function saveCurrentSearchFromInput(_inputId, _isOrg = false) {
  if (window._cvCreateFromCurrentFilter) return window._cvCreateFromCurrentFilter();
}

// ── アコーディオン ──
export function toggleAcc(key) {
  const body  = document.getElementById('fs-acc-body-' + key);
  const arrow = document.getElementById('fs-acc-arr-' + key);
  if (!body) return;
  const open = body.style.display === 'none' || body.style.display === '';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.classList.toggle('open', open);
  if (open) {
    if (key === 'src')    buildSidebarFovRows();
    if (key === 'recent') renderRecentSidebar();
  }
}

// 旧・サイドバーのタグ/チャンネルのポップアップ（openSbPopup / #sb-filter-popup）は v52.846 で削除。
// 開くボタン（fs-acc-tb/cat/pos/tags）が display:none のまま、表示する経路が無かった。

export function showFsBulkBtn(show) {
  // 常時表示のため何もしない
}


export function buildSidebarFovRows() {
  const f = window.filters || {};
  const srcEl = document.getElementById('fs-acc-src-chips');
  if (srcEl) {
    srcEl.innerHTML = '';
    // ファセット: platform以外のフィルターを適用した動画でカウント
    const ctxVids = _sbContextVideos('platform', f);
    [['youtube','YouTube'],['vimeo','Vimeo'],['gdrive','GDrive'],['x','X']].forEach(([val, label]) => {
      const cnt = ctxVids.filter(v => (v.pt || v.src || 'youtube') === val).length;
      const chip = document.createElement('div');
      chip.className = 'chip' + (f.platform?.has(val) ? ' active' : '');
      chip.textContent = label + (cnt ? ' ' + cnt : '');
      chip.style.opacity = (!f.platform?.has(val) && cnt === 0) ? '0.35' : '';
      chip.onclick = () => {
        f.platform?.has(val) ? f.platform.delete(val) : f.platform?.add(val);
        buildSidebarFovRows(); window.AF?.();
      };
      srcEl.appendChild(chip);
    });
  }
}

// ── 最近みた動画 ──
const _RECENT_KEY = 'wk_recent_views';

export function trackRecentView(id) {
  const vid = (window.videos||[]).find(v => v.id === id);
  if (!vid) return;
  let recents = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
  recents = recents.filter(r => r.id !== id);
  recents.unshift({ id, title: vid.title||'', channel: vid.channel||'', ytId: vid.ytId||'' });
  recents = recents.slice(0, 15);
  localStorage.setItem(_RECENT_KEY, JSON.stringify(recents));
  renderRecentSidebar();
  // 動画再生時にチャンネル/プレイリストの「最近」リストにも追加
  const ch = vid.channel || vid.ch;
  if (ch) _addRecentFilter('channel', ch);
  if (vid.pl) _addRecentFilter('playlist', vid.pl);
}

export function renderRecentSidebar() {
  const recents = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
  const emptyHTML = '<div style="font-size:10px;color:var(--text3);padding:8px 14px">まだ視聴した動画はありません</div>';
  const listHTML = recents.length ? recents.map(v => {
    const _gdId = (v.id||'').startsWith('gd-') ? (v.id).replace('gd-', '') : '';
    const thumb = v.ytId
      ? `<img src="https://i.ytimg.com/vi/${v.ytId}/mqdefault.jpg" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
      : _gdId
      ? `<img src="https://drive.google.com/thumbnail?id=${_gdId}&sz=w320" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
      : '';
    return `<div onclick="window.openVPanel?.('${v.id}')" style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="width:44px;min-width:44px;height:28px;background:var(--surface3);border-radius:4px;overflow:hidden;flex-shrink:0">${thumb}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.channel||''}</div>
      </div>
    </div>`;
  }).join('') : emptyHTML;
  ['fs-recent-list', 'org-fs-recent-list'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = listHTML;
  });
}

// ── サイドバー インライン ピッカー (Channel / Playlist) ──

// ── 最近選んだフィルター項目（localStorage 永続化、最大15件）──
const _RF_STORE = { channel: 'wk_recent_filter_ch', playlist: 'wk_recent_filter_pl' };
function _getRecentFilters(filterKey) {
  const key = _RF_STORE[filterKey];
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}
function _addRecentFilter(filterKey, val) {
  const key = _RF_STORE[filterKey];
  if (!key) return;
  const updated = [val, ..._getRecentFilters(filterKey).filter(v => v !== val)].slice(0, 15);
  localStorage.setItem(key, JSON.stringify(updated));
}

// コンテキスト（lib / org / 外部登録）から filter/af 取得。
// 外部（ランダムに1本など）はこのピッカーをそのまま使い回せるように、
// window._sbExtCtx['<名前>'] = { f, af } を登録して ctx 名を渡す。
// f はここで読み書きされる Set 入りオブジェクト、af は選択が変わった直後の後処理。
function _getSbCtx(containerId) {
  const el  = document.getElementById(containerId);
  const ctx = el?.dataset.sbCtx;
  if (ctx === 'org') return { f: window.orgFilters || {}, af: () => window.renderOrg?.() };
  const ext = ctx && window._sbExtCtx?.[ctx];
  if (ext) return { f: ext.f || {}, af: ext.af || (() => {}) };
  return { f: window.filters || {}, af: () => window.AF?.() };
}

// 指定キー以外の全フィルターを適用した動画セットを返す（ファセット検索用）
function _sbContextVideos(filterKey, f) {
  // タグの条件は tag-filter.js で1回だけ組み立てる（filterKey がタグの呼び名ならそのグループだけ外す）
  const _tagOk = window.tagFilter
    ? window.tagFilter.compile(f || {}, 'lib', { except: window.tagFilter.gidForKey(filterKey, 'org') })
    : () => true;
  return (window.videos || []).filter(v => {
    if (v.archived) return false;
    if (filterKey !== 'platform'  && f?.platform?.size  && !f.platform.has(v.pt || v.src || 'youtube'))                   return false;
    if (filterKey !== 'channel'   && f?.channel?.size   && !f.channel.has(v.channel || v.ch))                             return false;
    if (filterKey !== 'playlist'  && f?.playlist?.size  && !f.playlist.has(v.pl))                                         return false;
    if (!_tagOk(v)) return false;
    if (filterKey !== 'prio'      && f?.prio?.size      && !f.prio.has(v.prio))                                           return false;
    // org固有フィルター（Library側では該当Setが空なので無影響）
    if (filterKey !== 'memo'         && f?.memo?.size         && !f.memo.has(v.memo ? 'あり' : 'なし'))                  return false;
    if (filterKey !== 'addedAtFilter'&& f?.addedAtFilter?.size) {
      const _d = v.addedAt ? new Date(v.addedAt) : null;
      const _ym = _d ? `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}` : '不明';
      if (!f.addedAtFilter.has(_ym)) return false;
    }
    if (filterKey !== 'durationFilter' && f?.durationFilter?.size) {
      const _s = v.duration || 0;
      const _bk = !_s ? '不明' : _s < 300 ? '〜5分' : _s < 900 ? '5〜15分' : _s < 1800 ? '15〜30分' : '30分以上';
      if (!f.durationFilter.has(_bk)) return false;
    }
    return true;
  });
}

function _sbPickerCountMap(filterKey, f) {
  const m = {};
  _sbContextVideos(filterKey, f).forEach(v => {
    const k = filterKey === 'channel' ? (v.channel || v.ch) : v.pl;
    if (k) m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function _sbPickerRenderList(containerId, filterKey, q) {
  const listEl = document.getElementById(containerId + '-list');
  if (!listEl) return;
  const { f } = _getSbCtx(containerId);
  const countMap = _sbPickerCountMap(filterKey, f);
  // 選択済み項目はゼロ件でも必ず含める（解除できるように）
  const selected = [...(f[filterKey] || [])];
  selected.forEach(v => { if (!(v in countMap)) countMap[v] = 0; });
  const allItems = Object.keys(countMap).sort((a, b) => a.localeCompare(b, 'ja'));

  // 件数を出すときに効いている条件（_sbContextVideos と同じもの）がほかにあるか。
  // タグはどの呼び名で入っていても数える（以前は古い呼び名だけ見ていて、絞っているのに「全チャンネル」と出ていた）
  const hasOtherFilter = ['platform','channel','playlist','prio','memo','addedAtFilter','durationFilter']
    .some(k => k !== filterKey && f?.[k]?.size > 0) || !!window.tagFilter?.hasAny(f, 'lib');
  const secLabel = filterKey === 'channel'
    ? (hasOtherFilter ? `絞り込み結果のチャンネル (${allItems.length}件)` : '全チャンネル')
    : (hasOtherFilter ? `絞り込み結果のプレイリスト (${allItems.length}件)` : '全プレイリスト');

  const mkItem = v => {
    const sel = f[filterKey]?.has(v);
    return `<div class="vp-dd-item${sel ? ' selected' : ''}" onclick="sbPickerInlineToggle('${containerId}','${filterKey}','${v.replace(/'/g,"\\'")}')">${v}<span class="vp-dd-cnt">${countMap[v] || 0}本</span></div>`;
  };

  if (q.trim()) {
    const ql = q.toLowerCase();
    listEl.innerHTML = allItems.filter(v => v.toLowerCase().includes(ql)).map(mkItem).join('');
    return;
  }

  const groups = {};
  allItems.forEach(item => {
    const g = _fovGetAlphaGroup(item);
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ia = /^[A-Z]$/.test(a), ib = /^[A-Z]$/.test(b);
    if (ia && !ib) return -1; if (!ia && ib) return 1;
    return a.localeCompare(b, 'ja');
  });
  const alphaHTML = sortedKeys.map(g =>
    `<div class="vp-dd-alpha-hd">${g}</div>` + groups[g].map(mkItem).join('')
  ).join('');
  const countHTML = [...allItems].sort((a, b) => (countMap[b] || 0) - (countMap[a] || 0)).map(mkItem).join('');

  // 最近タブ
  const recentList = _getRecentFilters(filterKey)
    .filter(v => (v in countMap) || f[filterKey]?.has(v)).slice(0, 15);
  const hasRecents = recentList.length > 0;
  const defTab = hasRecents ? 'recent' : 'alpha';
  const recentPanelHTML = hasRecents
    ? recentList.map(mkItem).join('')
    : `<div style="font-size:10px;color:var(--text3);padding:14px 12px;text-align:center">最近選んだものはありません</div>`;

  const p = containerId;
  listEl.innerHTML =
    `<div class="vp-dd-sec-hd" style="padding-bottom:0">${secLabel}</div>
    <div class="vp-dd-subtabs">
      <div class="vp-dd-subtab${defTab==='recent'?' on':''}" id="${p}-ttab-recent" onclick="sbPickerInlineTabSwitch('${p}','recent')">🕐 最近</div>
      <div class="vp-dd-subtab${defTab==='alpha'?' on':''}"  id="${p}-ttab-alpha"  onclick="sbPickerInlineTabSwitch('${p}','alpha')">ABC / あいうえお順</div>
      <div class="vp-dd-subtab" id="${p}-ttab-count" onclick="sbPickerInlineTabSwitch('${p}','count')">件数順</div>
    </div>
    <div class="vp-dd-subpanel${defTab==='recent'?' on':''}" id="${p}-tab-recent">${recentPanelHTML}</div>
    <div class="vp-dd-subpanel${defTab==='alpha'?' on':''}"  id="${p}-tab-alpha">${alphaHTML}</div>
    <div class="vp-dd-subpanel" id="${p}-tab-count">${countHTML}</div>`;
}

export function buildSbPickerInline(containerId, filterKey, ctx='lib') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.sbCtx = ctx;
  el.innerHTML = `
    <input class="vp-dd-search" id="${containerId}-search" placeholder="検索..."
      oninput="sbPickerInlineFilter('${containerId}','${filterKey}',this.value)">
    <div id="${containerId}-list"></div>`;
  _sbPickerRenderList(containerId, filterKey, '');
}

export function sbPickerInlineFilter(containerId, filterKey, q) {
  _sbPickerRenderList(containerId, filterKey, q);
}

export function sbPickerInlineToggle(containerId, filterKey, val) {
  const { f, af } = _getSbCtx(containerId);
  if (!f[filterKey]) f[filterKey] = new Set();
  if (!f[filterKey].has(val)) {
    f[filterKey].add(val);
    _addRecentFilter(filterKey, val);
  } else {
    f[filterKey].delete(val);
  }
  const q = document.getElementById(containerId + '-search')?.value || '';
  _sbPickerRenderList(containerId, filterKey, q);
  af();
}

export function sbPickerInlineTabSwitch(containerId, tab) {
  ['recent','alpha','count'].forEach(t => {
    document.getElementById(`${containerId}-tab-${t}`)?.classList.toggle('on', t === tab);
    document.getElementById(`${containerId}-ttab-${t}`)?.classList.toggle('on', t === tab);
  });
}


// フィルタークリア後に、開いているサイドバーの項目を再描画（ctx照合）
export function refreshOpenSbAccordions(ctx='lib') {
  if (ctx === 'lib' && document.getElementById('fs-acc-body-src')?.style.display !== 'none') buildSidebarFovRows();
  if (ctx === 'org' && document.getElementById('org-fs-acc-body-src')?.style.display !== 'none') buildOrgSbSrcChips();
}

export function buildOrgSbSrcChips() {
  const el = document.getElementById('org-fs-acc-src-chips');
  if (!el) return;
  const f = window.orgFilters || {};
  el.innerHTML = '';
  const ctxVids = _sbContextVideos('platform', f);
  [['youtube','YouTube'],['vimeo','Vimeo'],['gdrive','GDrive'],['x','X']].forEach(([val, label]) => {
    const cnt = ctxVids.filter(v => v.pt === val).length;
    const chip = document.createElement('div');
    chip.className = 'chip' + (f.platform?.has(val) ? ' active' : '');
    chip.textContent = label + (cnt ? ' ' + cnt : '');
    chip.style.opacity = (!f.platform?.has(val) && cnt === 0) ? '0.35' : '';
    chip.onclick = () => {
      f.platform?.has(val) ? f.platform.delete(val) : f.platform?.add(val);
      buildOrgSbSrcChips(); window.renderOrg?.();
    };
    el.appendChild(chip);
  });
}

// ═══ 統合ポップアップ: Source | Channel | Playlist (3カラム) ═══
function _sbmInject() {
  if (document.getElementById('sbm-popup')) return;
  const css = `<style id="sbm-css">
#sbm-bd{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:100000}
#sbm-bd.open{display:block}
#sbm-popup{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(960px,calc(100vw - 16px));height:min(600px,calc(var(--zvh-100,100vh) - 16px));max-height:calc(var(--zvh-100,100vh) - 16px);background:var(--surface);color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,.5);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:none;flex-direction:column;z-index:100001}
#sbm-popup.open{display:flex}
#sbm-popup .sbm-hdr{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--surface2)}
#sbm-popup .sbm-hdr h2{margin:0;font-size:13px;font-weight:700;color:var(--text)}
#sbm-popup .sbm-x{cursor:pointer;font-size:16px;color:var(--text3);padding:2px 6px;border-radius:4px;line-height:1}
#sbm-popup .sbm-x:hover{background:var(--border);color:var(--text)}
#sbm-popup .sbm-search{padding:8px 14px;border-bottom:1px solid var(--border)}
#sbm-popup .sbm-search input{width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface2);color:var(--text);font-family:inherit;box-sizing:border-box}
#sbm-popup .sbm-search input:focus{outline:none;border-color:var(--accent)}
#sbm-popup .sbm-cols{flex:1;display:flex;overflow:hidden;min-height:0}
#sbm-popup .sbm-col{flex:1;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border)}
#sbm-popup .sbm-col.narrow{flex:0 0 140px}
#sbm-popup .sbm-col:last-child{border-right:none}
#sbm-popup .sbm-col-hdr{padding:8px 12px 6px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;letter-spacing:.3px;flex-shrink:0}
#sbm-popup .sbm-col-hdr select{font-size:10px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--surface);color:var(--text2);font-family:inherit}
#sbm-popup .sbm-col-body{flex:1;overflow-y:auto;min-height:0;padding:2px 0}
#sbm-popup .sbm-row{padding:7px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:12px;border-left:3px solid transparent;color:var(--text)}
#sbm-popup .sbm-row:hover{background:var(--surface2)}
#sbm-popup .sbm-row.on{background:rgba(107,63,212,.14);border-left-color:var(--accent);color:var(--accent);font-weight:700}
#sbm-popup .sbm-row .sbm-cnt{font-size:11px;color:var(--text3)}
#sbm-popup .sbm-row.on .sbm-cnt{color:var(--accent)}
#sbm-popup .sbm-ftr{border-top:1px solid var(--border);padding:8px 14px;background:var(--surface2);display:flex;gap:8px;align-items:center;min-height:44px;flex-wrap:wrap}
#sbm-popup .sbm-ftr .sbm-lbl{font-size:10px;color:var(--text3);font-weight:700;margin-right:4px}
#sbm-popup .sbm-pill{background:var(--accent);color:var(--on-accent);padding:2px 9px;border-radius:10px;font-size:10px;cursor:pointer;font-weight:700}
#sbm-popup .sbm-pill:after{content:" ×";opacity:.7}
#sbm-popup .sbm-sp{flex:1}
#sbm-popup .sbm-hit{font-size:12px;color:var(--accent);font-weight:700}
#sbm-popup .sbm-clr{font-size:10px;color:var(--text3);cursor:pointer;text-decoration:underline;margin-right:6px}
#sbm-popup .sbm-apply{background:var(--accent);color:var(--on-accent);border:none;padding:6px 16px;border-radius:6px;font-weight:700;font-size:11px;cursor:pointer;font-family:inherit}
#sbm-popup .sbm-apply:hover{filter:brightness(1.1)}
</style>`;
  document.head.insertAdjacentHTML('beforeend', css);
  document.body.insertAdjacentHTML('beforeend', `
<div id="sbm-bd" onclick="sbmClose()"></div>
<div id="sbm-popup" role="dialog" aria-modal="true">
  <div class="sbm-hdr"><h2>ソース・チャンネル・プレイリスト</h2><div class="sbm-x" onclick="sbmClose()">✕</div></div>
  <div class="sbm-search"><input id="sbm-q" placeholder="🔍 検索..." oninput="sbmRender()"></div>
  <div class="sbm-cols">
    <div class="sbm-col narrow"><div class="sbm-col-hdr"><span>Source</span></div><div class="sbm-col-body" id="sbm-col-src"></div></div>
    <div class="sbm-col"><div class="sbm-col-hdr"><span>Channel</span><select id="sbm-sort-ch" onchange="sbmRender()"><option value="recent">最近</option><option value="abc">あいうえ順</option><option value="cnt" selected>件数順</option></select></div><div class="sbm-col-body" id="sbm-col-ch"></div></div>
    <div class="sbm-col"><div class="sbm-col-hdr"><span>Playlist</span><select id="sbm-sort-pl" onchange="sbmRender()"><option value="recent">最近</option><option value="abc">あいうえ順</option><option value="cnt" selected>件数順</option></select></div><div class="sbm-col-body" id="sbm-col-pl"></div></div>
  </div>
  <div class="sbm-ftr">
    <span class="sbm-lbl">選択中:</span>
    <div id="sbm-pills" style="display:flex;gap:5px;flex-wrap:wrap"></div>
    <span class="sbm-sp"></span>
    <span class="sbm-clr" onclick="sbmClear()">クリア</span>
    <span class="sbm-hit" id="sbm-hit">0 件</span>
    <button class="sbm-apply" onclick="sbmClose()">適用</button>
  </div>
</div>`);
}

function _sbmEsc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

window.sbmOpen = function () {
  _sbmInject();
  document.getElementById('sbm-bd').classList.add('open');
  document.getElementById('sbm-popup').classList.add('open');
  window.sbmRender();
};
window.sbmClose = function () {
  document.getElementById('sbm-bd')?.classList.remove('open');
  document.getElementById('sbm-popup')?.classList.remove('open');
};
window.sbmClear = function () {
  const f = window.filters; if (!f) return;
  f.platform?.clear(); f.channel?.clear(); f.playlist?.clear();
  window.sbmRender(); window.AF?.(); window.buildSidebarFovRows?.();
};
window.sbmToggle = function (key, val) {
  const f = window.filters; if (!f) return;
  if (!f[key]) f[key] = new Set();
  f[key].has(val) ? f[key].delete(val) : f[key].add(val);
  window.sbmRender(); window.AF?.(); window.buildSidebarFovRows?.();
};
window.sbmRender = function () {
  const f = window.filters; if (!f) return;
  const qInp = document.getElementById('sbm-q');
  const q = (qInp?.value || '').trim().toLowerCase();

  // スクロール位置を保存（innerHTML置換でリセットされるのを防ぐ）
  const _chEl = document.getElementById('sbm-col-ch');
  const _plEl = document.getElementById('sbm-col-pl');
  const _chScroll = _chEl?.scrollTop ?? 0;
  const _plScroll = _plEl?.scrollTop ?? 0;

  // ── Source 列 ──
  const srcCtx = _sbContextVideos('platform', f);
  let srcArr = [['youtube','YouTube'],['vimeo','Vimeo'],['gdrive','GDrive'],['x','X']]
    .map(([v,l]) => ({ val:v, label:l, cnt:srcCtx.filter(x => (x.pt||x.src||'youtube')===v).length, sel:f.platform?.has(v) }))
    .filter(r => r.sel || r.cnt > 0);
  if (q) srcArr = srcArr.filter(r => r.label.toLowerCase().includes(q));
  const srcEl = document.getElementById('sbm-col-src');
  if (srcEl) srcEl.innerHTML = srcArr.length ? srcArr.map(r =>
    `<div class="sbm-row${r.sel?' on':''}" onclick="sbmToggle('platform','${_sbmEsc(r.val)}')"><span>${_sbmEsc(r.label)}</span><span class="sbm-cnt">${r.cnt}</span></div>`
  ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';

  // ── Channel 列 ──
  const chCtx = _sbContextVideos('channel', f);
  const chMap = {};
  chCtx.forEach(v => { const k = v.channel || v.ch; if (k) chMap[k] = (chMap[k]||0)+1; });
  [...(f.channel||[])].forEach(v => { if (!(v in chMap)) chMap[v] = 0; });
  const chSort = document.getElementById('sbm-sort-ch')?.value || 'cnt';
  let chArr = Object.entries(chMap).map(([n,c]) => ({ name:n, cnt:c, sel:f.channel?.has(n) }))
    .filter(r => r.sel || r.cnt > 0);
  if (q) chArr = chArr.filter(r => r.name.toLowerCase().includes(q));
  if (chSort === 'recent') {
    const _chRec = _getRecentFilters('channel');
    chArr.sort((a,b) => { const ai=_chRec.indexOf(a.name), bi=_chRec.indexOf(b.name); return (ai<0?9999:ai)-(bi<0?9999:bi); });
  } else {
    chArr.sort((a,b) => chSort==='abc' ? a.name.localeCompare(b.name,'ja') : b.cnt-a.cnt);
  }
  const chEl = document.getElementById('sbm-col-ch');
  if (chEl) chEl.innerHTML = chArr.length ? chArr.map(r =>
    `<div class="sbm-row${r.sel?' on':''}" onclick="sbmToggle('channel','${_sbmEsc(r.name).replace(/'/g,'&#39;')}')"><span>${_sbmEsc(r.name)}</span><span class="sbm-cnt">${r.cnt}本</span></div>`
  ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';

  // ── Playlist 列 ──
  const plCtx = _sbContextVideos('playlist', f);
  const plMap = {};
  plCtx.forEach(v => { if (v.pl) plMap[v.pl] = (plMap[v.pl]||0)+1; });
  [...(f.playlist||[])].forEach(v => { if (!(v in plMap)) plMap[v] = 0; });
  const plSort = document.getElementById('sbm-sort-pl')?.value || 'cnt';
  let plArr = Object.entries(plMap).map(([n,c]) => ({ name:n, cnt:c, sel:f.playlist?.has(n) }))
    .filter(r => r.sel || r.cnt > 0);
  if (q) plArr = plArr.filter(r => r.name.toLowerCase().includes(q));
  if (plSort === 'recent') {
    const _plRec = _getRecentFilters('playlist');
    plArr.sort((a,b) => { const ai=_plRec.indexOf(a.name), bi=_plRec.indexOf(b.name); return (ai<0?9999:ai)-(bi<0?9999:bi); });
  } else {
    plArr.sort((a,b) => plSort==='abc' ? a.name.localeCompare(b.name,'ja') : b.cnt-a.cnt);
  }
  const plEl = document.getElementById('sbm-col-pl');
  if (plEl) plEl.innerHTML = plArr.length ? plArr.map(r =>
    `<div class="sbm-row${r.sel?' on':''}" onclick="sbmToggle('playlist','${_sbmEsc(r.name).replace(/'/g,'&#39;')}')"><span>${_sbmEsc(r.name)}</span><span class="sbm-cnt">${r.cnt}本</span></div>`
  ).join('') : '<div style="padding:14px;color:var(--text3);font-size:11px">該当なし</div>';

  // スクロール位置を復元
  if (_chEl && _chScroll) _chEl.scrollTop = _chScroll;
  if (_plEl && _plScroll) _plEl.scrollTop = _plScroll;

  // ── Pills ──
  const all = [
    ...[...(f.platform||[])].map(v => ['platform', v]),
    ...[...(f.channel||[])].map(v => ['channel', v]),
    ...[...(f.playlist||[])].map(v => ['playlist', v])
  ];
  const pillsEl = document.getElementById('sbm-pills');
  if (pillsEl) pillsEl.innerHTML = all.length
    ? all.map(([k,v]) => `<span class="sbm-pill" onclick="sbmToggle('${k}','${_sbmEsc(v).replace(/'/g,'&#39;')}')">${_sbmEsc(v)}</span>`).join('')
    : '<span style="color:var(--text3);font-size:11px">なし</span>';

  // ── Hit ──
  const hitEl = document.getElementById('sbm-hit');
  if (hitEl) hitEl.textContent = (window.filtered?.length || 0) + ' 件';
};
