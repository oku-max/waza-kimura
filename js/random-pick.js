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
  ['old',     'しばらく見ていない','半年以上再生していないもの'],
  ['view',    'いま画面に出ている','絞り込み中のリストから'],
  ['fav',     'お気に入り',       '⭐ を付けたものから'],
  ['next',    'Next',             '🎯 Next に入れたものから'],
  ['drill',   'Drill',            '🟣 Drill に入れたものから']
];

const _cfg = { scope: 'unplayed', tag: '' };
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

// 最終再生からの日数（記録が無ければ追加日で代用）
function _daysSincePlay(v) {
  const t = Date.parse(v.lastPlayedAt || '') || Date.parse(v.addedAt || '');
  if (!t) return Infinity;
  return (Date.now() - t) / 86400000;
}

export function pool() {
  const base = (_cfg.scope === 'view')
    ? (window.filteredVideos || window.videos || [])
    : (window.videos || []);
  let list = base.filter(v => v && !v.archived);
  switch (_cfg.scope) {
    case 'unplayed': list = list.filter(v => !(v.playCount > 0) && !v.watched); break;
    case 'old':      list = list.filter(v => _daysSincePlay(v) > 180); break;
    case 'fav':      list = list.filter(v => v.fav); break;
    case 'next':     list = list.filter(v => v.next); break;
    case 'drill':    list = list.filter(v => v.drill); break;
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
  return (pc === 0 ? '◇ 未再生' : `▷ ${pc}回`) + (when ? ' · ' + when : '');
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
  const range = `${_esc(scopeName)}${_cfg.tag ? ` · #${_esc(_cfg.tag)}` : ''}`;

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
        <p class="rnd-m">${v.duration ? `<span class="rnd-dur">${_esc(_fmtDur(v.duration))}</span> · ` : ''}${_esc(_meta(v))}</p>
      </div>`
    : `<p class="rnd-none">この範囲に動画がありません。範囲を変えてください。</p>`}`;

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
    <div class="rnd-opts">${SCOPES.map(([v, nm, ds]) => `
      <button class="rnd-opt" data-rnd-scope="${v}" aria-pressed="${_cfg.scope === v}">
        <span class="rnd-opt-n">${_esc(nm)}</span>
        <span class="rnd-opt-d">${_esc(ds)}</span>
      </button>`).join('')}</div>
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
    _cfg.scope = b.dataset.rndScope; _saveCfg();
    $$r('#rnd-bd [data-rnd-scope]').forEach(x =>
      x.setAttribute('aria-pressed', String(x.dataset.rndScope === _cfg.scope)));
  });
  $r('#rnd-tagq').oninput = e => paintTags(e.target.value);
  $r('#rnd-cfg-done').onclick = _render;
}

window.openRandomPick = openRandom;
window._rndGetCfg = () => ({ ..._cfg });
window._rndPoolSize = () => pool().length;

// ヘッダーが組み上がってからボタンを差し込む
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', _ensureBtn);
else _ensureBtn();
