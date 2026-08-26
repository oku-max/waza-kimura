// ═══ WAZA KIMURA — ランダムに1本（Random Pick）v52.703 ═══
//
// 埋もれた動画と出会うための入口。ヘッダーの Journal ボタンの隣に置く。
//
// ── データ経路（CLAUDE.md ルール1のため明記）──
//  書き込み: localStorage 'wk_rndCfg'（新規キー・この端末の設定のみ）
//  読み取り: window.videos / window.filteredVideos（読むだけ）
//  既存のデータには一切書き込まない。再生は既存の openVPanel に渡すだけ。

const LS_CFG = 'wk_rndCfg';

// 母集団の選び方
const SCOPES = [
  ['all',     'すべて',           'アーカイブ以外の全部から'],
  ['unplayed','まだ見ていない',   '一度も再生していないものだけ'],
  ['old',     'しばらく見ていない','一度見たきり間が空いているもの'],
  ['view',    'いま画面に出ている','絞り込み中のリストから'],
  ['pl',      'プレイリスト',     '📋 選んだプレイリストから'],  // 説明はその場で選択中の名前に差し替える
  ['fav',     'お気に入り',       '⭐ を付けたものから'],
  ['next',    'Next',             '🎯 Next に入れたものから'],
  ['drill',   'Drill',            '🟣 Drill に入れたものから']
];

const _cfg = { scope: 'unplayed', tag: '', oldDays: 180, pl: '' };
const OLD_DAYS = [[90,'3ヶ月'],[180,'半年'],[365,'1年'],[730,'2年']];
try {
  const raw = localStorage.getItem(LS_CFG);
  if (raw) Object.assign(_cfg, JSON.parse(raw));
} catch (e) {}
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

// 絞り込み側で最近選んだプレイリスト（js/filter-overlay.js が持つキーを読むだけ）
function _recentPls() {
  try { return JSON.parse(localStorage.getItem('wk_recent_filter_pl') || '[]'); }
  catch (e) { return []; }
}

// アーカイブ以外の動画から、プレイリスト名と本数を集める
function _playlists() {
  const m = new Map();
  (window.videos || []).forEach(v => {
    if (!v || v.archived) return;
    const nm = _plOf(v);
    if (!nm) return;
    m.set(nm, (m.get(nm) || 0) + 1);
  });
  return [...m.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

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
    case 'pl':       list = _cfg.pl ? list.filter(v => _plOf(v) === _cfg.pl) : []; break;
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
  const scopeLabel = (_cfg.scope === 'pl')
    ? (_cfg.pl ? `${_esc(scopeName)} · ${_esc(_cfg.pl)}` : 'プレイリスト（未選択）')
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
        _cfg.scope === 'pl' && !_cfg.pl ? 'プレイリストを選んでください。'
      : _cfg.scope === 'pl'             ? 'このプレイリストに動画がありません。別のプレイリストを選んでください。'
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
      const isPl = v === 'pl';
      const desc = isPl ? (_cfg.pl ? `📋 ${_cfg.pl}` : '📋 選んでください') : ds;
      return `
      <button class="rnd-opt${isPl ? ' rnd-opt-nav' : ''}" data-rnd-scope="${v}" aria-pressed="${_cfg.scope === v}">
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
    // プレイリストは数が多いので、その場ではなく専用の選択画面を開く
    if (b.dataset.rndScope === 'pl') { _openPlPicker(); return; }
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

// ── プレイリストを選ぶ（専用画面：一覧が長くても探しやすいように縦一列＋検索）──
function _openPlPicker() {
  const plList  = _playlists();
  const recents = _recentPls().filter(nm => plList.some(p => p.name === nm)).slice(0, 8);

  $r('#rnd-h').textContent = 'プレイリストを選ぶ';
  $r('#rnd-bd').innerHTML = `
    <div class="rnd-plq-wrap">
      <input class="rnd-q" id="rnd-plq" type="text" autocomplete="off"
             placeholder="プレイリストを探す" value="">
    </div>
    <div id="rnd-pls"></div>`;
  $r('#rnd-ft').innerHTML = `<button class="rnd-ghost" id="rnd-pl-back">← 範囲にもどる</button>`;

  const row = p => `
    <button class="rnd-pl-row" data-rnd-pl="${_esc(p.name)}" aria-pressed="${_cfg.pl === p.name}">
      <span class="rnd-pl-nm">${_esc(p.name)}</span>
      <span class="rnd-pl-n">${p.n}</span>
    </button>`;

  const paint = q => {
    const query = (q || '').trim().toLowerCase();
    const hit = query ? plList.filter(p => p.name.toLowerCase().includes(query)) : plList;
    const box = $r('#rnd-pls');
    if (!plList.length) { box.innerHTML = `<p class="rnd-hint">プレイリストがありません</p>`; return; }
    if (!hit.length)    { box.innerHTML = `<p class="rnd-hint">見つかりません</p>`; return; }
    const recentHTML = (!query && recents.length)
      ? `<p class="rnd-sec">最近選んだプレイリスト</p><div class="rnd-pl-list">${
          recents.map(nm => row(plList.find(p => p.name === nm))).join('')}</div>
         <p class="rnd-sec">すべてのプレイリスト</p>`
      : '';
    box.innerHTML = recentHTML + `<div class="rnd-pl-list">${hit.map(row).join('')}</div>`;
    $$r('#rnd-pls [data-rnd-pl]').forEach(b => b.onclick = () => {
      _cfg.pl = b.dataset.rndPl;
      _cfg.scope = 'pl';   // 選んだ時点で範囲もプレイリストにする
      _saveCfg();
      _openCfg();          // 範囲画面に戻る（選んだ内容が反映された状態）
    });
  };
  paint('');
  $r('#rnd-plq').oninput = e => paint(e.target.value);
  $r('#rnd-pl-back').onclick = _openCfg;
}

window.openRandomPick = openRandom;
window._rndGetCfg = () => ({ ..._cfg });
window._rndPoolSize = () => pool().length;

// ヘッダーが組み上がってからボタンを差し込む
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', _ensureBtn);
else _ensureBtn();
