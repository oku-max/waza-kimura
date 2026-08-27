// ═══ WAZA KIMURA — ランダムに1本（Random Pick）v52.703 ═══
//
// 埋もれた動画と出会うための入口。ヘッダーの Journal ボタンの隣に置く。
//
// ── データ経路（CLAUDE.md ルール1のため明記）──
//  書き込み: localStorage 'wk_rndCfg'（新規キー・この端末の設定のみ）
//           プレイリスト選択は既存のピッカー(buildSbPickerInline)をそのまま使うため、
//           そのピッカーが持つ「最近選んだ項目」(wk_recent_filter_pl・端末ローカル・
//           追記のみ) が絞り込み側と同じように更新される。
//  読み取り: window.videos / window.filteredVideos / window._cvResolveVideos（読むだけ）
//  既存のデータには一切書き込まない。再生は既存の openVPanel に渡すだけ。

const LS_CFG = 'wk_rndCfg';

// 母集団の選び方
const SCOPES = [
  ['all',     'すべて',           'アーカイブ以外の全部から'],
  ['unplayed','まだ見ていない',   '一度も再生していないものだけ'],
  ['old',     'しばらく見ていない','一度見たきり間が空いているもの'],
  ['view',    'いま画面に出ている','絞り込み中のリストから'],
  ['pl',      'プレイリスト',     '📋 選んだプレイリストから'],  // 説明は選択中の名前に差し替える
  ['cv',      'カスタムリスト',   '📑 自分で作ったリストから'],  // 同上
  ['fav',     'お気に入り',       '⭐ を付けたものから'],
  ['next',    'Next',             '🎯 Next に入れたものから'],
  ['drill',   'Drill',            '🟣 Drill に入れたものから']
];

const _cfg = { scope: 'unplayed', tag: '', oldDays: 180, pls: [], cvId: '' };
const OLD_DAYS = [[90,'3ヶ月'],[180,'半年'],[365,'1年'],[730,'2年']];
try {
  const raw = localStorage.getItem(LS_CFG);
  if (raw) Object.assign(_cfg, JSON.parse(raw));
} catch (e) {}
// 旧形式（pl: 単一名）の設定を引き継ぐ。消さずに読むだけ。
if (!Array.isArray(_cfg.pls)) _cfg.pls = [];
if (!_cfg.pls.length && typeof _cfg.pl === 'string' && _cfg.pl) _cfg.pls = [_cfg.pl];
function _saveCfg() {
  try { localStorage.setItem(LS_CFG, JSON.stringify(_cfg)); } catch (e) {}
}

const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $r  = s => document.querySelector(s);
const $$r = s => [...document.querySelectorAll(s)];

const ICON_DICE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
  '<circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/>' +
  '<circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/>' +
  '<circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>';

const _tagsOf = v => [...(v.pos || []), ...(v.cat || []), ...(v.tb || []), ...(v.tags || [])];

// プレイリスト名（既存データの v.pl をそのまま読むだけ。書き込みはしない）
const _plOf = v => String(v && v.pl || '').trim();

// カスタムリスト（js/custom-view.js が読み取り専用で出している一覧・中身）
const _cvLists = () => (window._cvListSummaries?.() || []);
const _cvName  = id => _cvLists().find(x => x.id === id)?.label || '';

// 最終再生からの日数。実データの項目は lastPlayed（Date.now() の数値・
// js/vpanel.js が再生時に入れる）。一度も再生していないものは対象外にして、
// 「まだ見ていない」と役割が重ならないようにする。
function _daysSincePlay(v) {
  const t = Number(v.lastPlayed) || 0;
  if (!t) return null;                       // 再生記録なし
  return (Date.now() - t) / 86400000;
}

export function pool() {
  const base = (_cfg.scope === 'view')
    ? (window.filteredVideos || window.videos || [])
    : (window.videos || []);
  let list = base.filter(v => v && !v.archived);
  switch (_cfg.scope) {
    case 'unplayed': list = list.filter(v => !(v.playCount > 0) && !v.watched); break;
    case 'old': {
      const d = _cfg.oldDays || 180;
      list = list.filter(v => { const n = _daysSincePlay(v); return n !== null && n > d; });
      break;
    }
    case 'fav':      list = list.filter(v => v.fav); break;
    case 'next':     list = list.filter(v => v.next); break;
    case 'drill':    list = list.filter(v => v.drill); break;
    case 'pl': {
      const set = new Set(_cfg.pls || []);
      list = set.size ? list.filter(v => set.has(_plOf(v))) : [];
      break;
    }
    case 'cv': {
      const vids = _cfg.cvId ? window._cvResolveVideos?.(_cfg.cvId) : null;
      list = (vids || []).filter(v => v && !v.archived);
      break;
    }
  }
  if (_cfg.tag) list = list.filter(v => _tagsOf(v).includes(_cfg.tag));
  return list;
}

// 直前と同じものを続けて出さない
let _lastId = null;
function _pick() {
  const list = pool();
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let v, guard = 0;
  do { v = list[Math.floor(Math.random() * list.length)]; } while (v.id === _lastId && ++guard < 8);
  _lastId = v.id;
  return v;
}

// ── ボタン（ヘッダーの Journal ボタンの隣）──
function _ensureBtn() {
  let b = document.getElementById('rnd-btn');
  if (!b) {
    b = document.createElement('button');
    b.id = 'rnd-btn';
    b.type = 'button';
    b.title = 'ランダムに1本';
    b.setAttribute('aria-label', 'ランダムに1本');
    b.innerHTML = ICON_DICE;
    b.onclick = () => openRandom();
  }
  const slot = document.querySelector('.tb-row-logo');
  if (!slot) return;
  const mm = document.getElementById('mm-fab');
  // Journal ボタンがヘッダーに居るならその左、居なければアカウントボタンの左
  const anchor = (mm && mm.parentElement === slot) ? mm : document.getElementById('acct-btn');
  if (anchor && anchor.previousElementSibling !== b) slot.insertBefore(b, anchor);
}
window._rndEnsureBtn = _ensureBtn;

// ── 表示 ──
function _ensureModal() {
  if (document.getElementById('rnd-modal')) return;
  const d = document.createElement('div');
  d.id = 'rnd-modal';
  d.innerHTML = `
    <div class="rnd-card" role="dialog" aria-label="ランダムに1本">
      <div class="rnd-hd"><h2 id="rnd-h">ランダムに1本</h2>
        <button class="rnd-x" id="rnd-x" aria-label="閉じる">✕</button></div>
      <div class="rnd-bd" id="rnd-bd"></div>
      <div class="rnd-ft" id="rnd-ft"></div>
    </div>`;
  document.body.appendChild(d);
  d.onclick = e => { if (e.target === d) _close(); };
  $r('#rnd-x').onclick = _close;
}
const _close = () => $r('#rnd-modal')?.classList.remove('open');
window._rndClose = _close;

function _fmtDur(sec) {
  const s = Number(sec) || 0;
  if (!s) return '';
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
           : `${m}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
}
function _meta(v) {
  const pc = v.playCount || 0;
  const t = Date.parse(v.addedAt || '');
  let when = '';
  if (t) {
    const mo = Math.floor((Date.now() - t) / 2592000000);
    when = mo >= 12 ? `${Math.floor(mo/12)}年${mo%12 ? (mo%12)+'ヶ月' : ''}前に追加`
         : mo >= 1  ? `${mo}ヶ月前に追加` : '今月追加';
  }
  const lp = Number(v.lastPlayed) || 0;
  let last = '';
  if (lp) {
    const d = Math.floor((Date.now() - lp) / 86400000);
    last = d >= 365 ? ` · 最後に見たのは${Math.floor(d/365)}年前`
         : d >= 30  ? ` · 最後に見たのは${Math.floor(d/30)}ヶ月前`
         : d >= 1   ? ` · 最後に見たのは${d}日前` : ' · 今日見た';
  }
  return (pc === 0 ? '◇ 未再生' : `▷ ${pc}回`) + (when ? ' · ' + when : '') + last;
}

// どこから来た動画か（チャンネル名・プレイリスト名）
function _srcHTML(v) {
  const ch = v.channel || v.ch || '';
  const pl = v.pl || '';
  if (!ch && !pl) return '';
  return `<p class="rnd-src">${
    ch ? `<span class="rnd-ch">${_esc(ch)}</span>` : ''}${
    ch && pl ? '<span class="rnd-sep">·</span>' : ''}${
    pl ? `<span class="rnd-pl">${_esc(pl)}</span>` : ''}</p>`;
}

export function openRandom() {
  _ensureModal();
  _render();
  $r('#rnd-modal').classList.add('open');
}

function _render() {
  const list = pool();
  const v = _pick();
  const scopeName = SCOPES.find(s => s[0] === _cfg.scope)?.[1] || 'すべて';
  const oldNm = OLD_DAYS.find(o => o[0] === (_cfg.oldDays || 180))?.[1] || '半年';
  const pls = _cfg.pls || [];
  const plLabel = pls.length > 1 ? `${_esc(pls[0])} +${pls.length - 1}` : _esc(pls[0] || '');
  const scopeLabel =
      _cfg.scope === 'pl' ? (pls.length ? `${_esc(scopeName)} · ${plLabel}` : 'プレイリスト（未選択）')
    : _cfg.scope === 'cv' ? (_cvName(_cfg.cvId) ? `${_esc(scopeName)} · ${_esc(_cvName(_cfg.cvId))}`
                                                : 'カスタムリスト（未選択）')
    : `${_esc(scopeName)}${_cfg.scope === 'old' ? `（${_esc(oldNm)}以上）` : ''}`;
  const range = scopeLabel + `${_cfg.tag ? ` · #${_esc(_cfg.tag)}` : ''}`;

  $r('#rnd-h').textContent = 'ランダムに1本';
  $r('#rnd-bd').innerHTML = `
    <button class="rnd-range" id="rnd-range">
      <span class="rnd-range-l">範囲</span>
      <span class="rnd-range-v">${range}</span>
      <span class="rnd-range-n">${list.length}本</span>
    </button>
    ${v ? `
      <div class="rnd-pick">
        <div class="rnd-th">${v.thumb ? `<img src="${_esc(v.thumb)}" alt="" loading="lazy">` : ''}</div>
        <p class="rnd-t">${_esc(v.title || '(タイトルなし)')}</p>
        ${_srcHTML(v)}
        <p class="rnd-m">${v.duration ? `<span class="rnd-dur">${_esc(_fmtDur(v.duration))}</span> · ` : ''}${_esc(_meta(v))}</p>
      </div>`
    : `<p class="rnd-none">${
        _cfg.scope === 'pl' && !pls.length ? 'プレイリストを選んでください。'
      : _cfg.scope === 'pl'                ? 'このプレイリストに動画がありません。別のプレイリストを選んでください。'
      : _cfg.scope === 'cv' && !_cfg.cvId  ? 'カスタムリストを選んでください。'
      : _cfg.scope === 'cv'                ? 'このカスタムリストに動画がありません。別のリストを選んでください。'
      : 'この範囲に動画がありません。範囲を変えてください。'}</p>`}`;

  $r('#rnd-ft').innerHTML = v
    ? `<button class="rnd-ghost" id="rnd-again">引き直す</button>
       <button class="rnd-go" id="rnd-play">見る</button>`
    : `<button class="rnd-ghost" id="rnd-again">引き直す</button>`;

  $r('#rnd-range').onclick = _openCfg;
  const again = $r('#rnd-again'); if (again) again.onclick = _render;
  const play  = $r('#rnd-play');
  if (play) play.onclick = () => { _close(); window.openVPanel?.(v.id); };
}

// ── 範囲の設定 ──
function _openCfg() {
  const tags = new Set();
  (window.videos || []).forEach(x => { if (!x.archived) _tagsOf(x).forEach(t => t && tags.add(t)); });
  const tagList = [...tags].sort((a, b) => a.localeCompare(b, 'ja'));

  $r('#rnd-h').textContent = 'ランダムの範囲';
  $r('#rnd-bd').innerHTML = `
    <p class="rnd-sec">どこから選ぶか</p>
    <div class="rnd-opts">${SCOPES.map(([v, nm, ds]) => {
      const isNav = v === 'pl' || v === 'cv';
      const pls   = _cfg.pls || [];
      const desc =
          v === 'pl' ? (pls.length ? `📋 ${pls.join('、')}` : '📋 選んでください')
        : v === 'cv' ? (_cvName(_cfg.cvId) ? `📑 ${_cvName(_cfg.cvId)}` : '📑 選んでください')
        : ds;
      return `
      <button class="rnd-opt${isNav ? ' rnd-opt-nav' : ''}" data-rnd-scope="${v}" aria-pressed="${_cfg.scope === v}">
        <span class="rnd-opt-n">${_esc(nm)}</span>
        <span class="rnd-opt-d">${_esc(desc)}</span>
      </button>`; }).join('')}</div>
    <div id="rnd-olddays" class="rnd-sub${_cfg.scope === 'old' ? ' on' : ''}">
      <p class="rnd-sec">どれくらい空いたら</p>
      <div class="rnd-tags">${OLD_DAYS.map(([d, nm]) =>
        `<button class="rnd-chip" data-rnd-old="${d}" aria-pressed="${(_cfg.oldDays||180) === d}">${nm}以上</button>`).join('')}</div>
    </div>
    <p class="rnd-sec">タグでさらに絞る（任意）</p>
    <input class="rnd-q" id="rnd-tagq" type="text" autocomplete="off" placeholder="タグを探す">
    <div class="rnd-tags" id="rnd-tags"></div>`;
  $r('#rnd-ft').innerHTML = `<button class="rnd-go" id="rnd-cfg-done">この範囲にする</button>`;

  const paintTags = q => {
    const query = (q || '').trim().toLowerCase();
    const list = query ? tagList.filter(t => t.toLowerCase().includes(query)) : tagList;
    $r('#rnd-tags').innerHTML =
      `<button class="rnd-chip" data-rnd-tag="" aria-pressed="${!_cfg.tag}">指定なし</button>` +
      list.slice(0, 200).map(t =>
        `<button class="rnd-chip" data-rnd-tag="${_esc(t)}" aria-pressed="${_cfg.tag === t}">#${_esc(t)}</button>`).join('');
    $$r('#rnd-tags [data-rnd-tag]').forEach(b => b.onclick = () => {
      _cfg.tag = b.dataset.rndTag; _saveCfg(); paintTags($r('#rnd-tagq').value);
    });
  };
  paintTags('');

  $$r('#rnd-bd [data-rnd-scope]').forEach(b => b.onclick = () => {
    // プレイリスト／カスタムリストは数が多いので、専用の選択画面を開く
    if (b.dataset.rndScope === 'pl') { _openPlPicker(); return; }
    if (b.dataset.rndScope === 'cv') { _openCvPicker(); return; }
    _cfg.scope = b.dataset.rndScope; _saveCfg();
    $$r('#rnd-bd [data-rnd-scope]').forEach(x =>
      x.setAttribute('aria-pressed', String(x.dataset.rndScope === _cfg.scope)));
    $r('#rnd-olddays').classList.toggle('on', _cfg.scope === 'old');
  });
  $$r('#rnd-bd [data-rnd-old]').forEach(b => b.onclick = () => {
    _cfg.oldDays = Number(b.dataset.rndOld); _saveCfg();
    $$r('#rnd-bd [data-rnd-old]').forEach(x =>
      x.setAttribute('aria-pressed', String(Number(x.dataset.rndOld) === _cfg.oldDays)));
  });
  $r('#rnd-tagq').oninput = e => paintTags(e.target.value);
  $r('#rnd-cfg-done').onclick = _render;
}

// ── プレイリストを選ぶ ──
// 絞り込み（サイドバー/整理画面）で使っているピッカーをそのまま使う。
// buildSbPickerInline は ctx 名で filter/af の置き場所を切り替えられるので、
// ランダム用の置き場所を window._sbExtCtx.rnd に用意して渡すだけ。
// → 検索・🕐最近・ABC/あいうえお順・件数順・「N本」表示すべて既存のまま。
const _plCtx = { playlist: new Set() };

function _openPlPicker() {
  _plCtx.playlist = new Set(_cfg.pls || []);
  window._sbExtCtx = window._sbExtCtx || {};
  window._sbExtCtx.rnd = {
    f: _plCtx,
    af: () => {                       // ピッカーで選択が変わるたびに呼ばれる
      _cfg.pls = [..._plCtx.playlist];
      if (_cfg.pls.length) _cfg.scope = 'pl';
      _saveCfg();
      _plFoot();
    }
  };

  $r('#rnd-h').textContent = 'プレイリストを選ぶ';
  $r('#rnd-bd').innerHTML = `<div id="rnd-plpick" class="rnd-pickhost"></div>`;
  $r('#rnd-ft').innerHTML = `
    <span class="rnd-ft-note" id="rnd-pl-note"></span>
    <button class="rnd-go" id="rnd-pl-done">決定</button>`;
  window.buildSbPickerInline?.('rnd-plpick', 'playlist', 'rnd');
  if (!$r('#rnd-plpick')?.children.length) {
    $r('#rnd-plpick').innerHTML = `<p class="rnd-hint">プレイリストがありません</p>`;
  }
  _plFoot();
  $r('#rnd-pl-done').onclick = _openCfg;
}

function _plFoot() {
  const el = $r('#rnd-pl-note');
  if (!el) return;
  const n = (_cfg.pls || []).length;
  el.textContent = n ? `${n}件選択中` : '選ばれていません';
}

// ── カスタムリストを選ぶ ──
// 一覧と中身は js/custom-view.js が出している読み取り専用の入口を使い、
// 行の見た目もリスト選択モーダルと同じ cv-picker-* をそのまま使う。
function _openCvPicker() {
  const lists = _cvLists();

  $r('#rnd-h').textContent = 'カスタムリストを選ぶ';
  $r('#rnd-bd').innerHTML = lists.length
    ? `<div class="rnd-pickhost">${lists.map(v => `
        <div class="cv-picker-item${_cfg.cvId === v.id ? ' active' : ''}" data-rnd-cv="${_esc(v.id)}">
          <span class="cv-picker-icon">${v.saveMode === 'dynamic' ? '🔄' : '📌'}</span>
          <span class="cv-picker-info">
            <span class="cv-picker-name">${_esc(v.label)}</span>
            <span class="cv-picker-meta">${v.saveMode === 'dynamic' ? '条件で自動選択' : '手動選択'} · ${v.count}本</span>
          </span>
          <span class="cv-picker-check">${_cfg.cvId === v.id ? '✓' : ''}</span>
        </div>`).join('')}</div>`
    : `<p class="rnd-hint">カスタムリストがありません</p>`;
  $r('#rnd-ft').innerHTML = `<button class="rnd-ghost" id="rnd-cv-back">← 範囲にもどる</button>`;

  $$r('#rnd-bd [data-rnd-cv]').forEach(el => el.onclick = () => {
    _cfg.cvId  = el.dataset.rndCv;
    _cfg.scope = 'cv';        // 選んだ時点で範囲もカスタムリストにする
    _saveCfg();
    _openCfg();               // 範囲画面へ戻る
  });
  $r('#rnd-cv-back').onclick = _openCfg;
}

window.openRandomPick = openRandom;
window._rndGetCfg = () => ({ ..._cfg });
window._rndPoolSize = () => pool().length;

// ヘッダーが組み上がってからボタンを差し込む
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', _ensureBtn);
else _ensureBtn();
