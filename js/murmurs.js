// ═══ WAZA KIMURA — Journal（Murmurs）v52.697 ═══
//
// 気になったことをその場でメモする。あとから読み返したり、育てたりできる。
//
// ── データ経路（CLAUDE.md ルール1のため明記）──
//  書き込み: Firestore users/{uid}/data/murmurs（新規doc・このファイルのみが触る）
//            localStorage 'wk_murmurs' / 'wk_murmur_tpls' / 'wk_murmur_pos'（新規キー）
//  読み取り: window.videos（サジェスト用・読むだけ）
//            window.POSITIONS / CATEGORIES / TECHNIQUE_BUILTIN（語彙・読むだけ）
//  既存の videos / notes / settings / カスタムビュー / タグマスターには一切書き込まない。

// ─────────────────────────────── state
let _data  = [];     // 記録の配列（新しい順）
let _tpls  = [];     // 自作テンプレート
let _ready = false;  // クラウドの状態を確実に把握できたか（把握前は保存しない）
let _allowEmptySave = false; // ユーザーが明示的に全部消したときだけ空保存を許す
let _editingId = null;
let _editTags = new Set();   // 編集中のタグ（保存するとこれがそのまま入る）
let _editDropped = new Set(); // 編集中に手で外したタグ（本文から再検出しても戻さない）
let _deriveFrom = null;
let _rmTags = new Set();   // 検出されたが手で外したタグ
let _addTags = new Set();  // 手で足したタグ
let _resurfId = null;

const LS_DATA = 'wk_murmurs';
const LS_TPLS = 'wk_murmur_tpls';
const LS_POS  = 'wk_murmur_pos';   // 端末ごとの見た目設定（クラウド同期しない）
const LS_REM  = 'wk_murmur_remind'; // 端末ごとのリマインド設定（クラウド同期しない）

const PRESET_TPLS = [
  { k:'p_practice', nm:'今日の練習したこと', preset:true, pinned:true,
    body:'やったこと：\n効いた：\n効かなかった：\n次に試す：' },
  { k:'p_daily',    nm:'今日の記録', preset:true, pinned:true,
    body:'今日どうだった：\n覚えておきたいこと：' },
  { k:'p_video',    nm:'動画を見て', preset:true, pinned:true,
    body:'気になったところ：\n次の練習で試すこと：' },
  { k:'p_problem',  nm:'課題', preset:true, pinned:false,
    body:'うまくいかないこと：\n原因かもしれないこと：' },
  { k:'p_try',      nm:'試したい', preset:true, pinned:false,
    body:'試したいこと：\nどの場面で：' },
  { k:'p_win',      nm:'うまくいった', preset:true, pinned:false,
    body:'うまくいったこと：\nなぜ効いたと思うか：' }
];
const PIN_MAX = 3;

const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const _uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const _t   = (k, fb) => (window.t ? window.t(k, fb) : fb);
const $m   = s => document.querySelector(s);
const $$m  = s => [...document.querySelectorAll(s)];

// ─────────────────────────────── 保存
let _saveTimer = null;

function _saveLocal() {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(_data));
    localStorage.setItem(LS_TPLS, JSON.stringify(_tpls));
  } catch (e) { console.warn('[murmurs] local save failed:', e); }
}

function _save() {
  _saveLocal();                       // ローカルは即時（オフラインでも消えないように）
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flushNow, 500);
}

function _flushNow() {
  clearTimeout(_saveTimer);
  _saveTimer = null;
  // クラウドの状態を把握できていないうちは絶対に書かない（空上書き事故の防止）
  if (!_ready) { console.warn('[murmurs] save skipped: cloud state unknown'); return; }
  // 非空 → 空 の上書きは、ユーザーが明示的に消したときだけ許す
  if (!_data.length && !_allowEmptySave) {
    console.warn('[murmurs] empty save skipped');
    return;
  }
  _allowEmptySave = false;
  window._firebaseSaveMurmurs?.({ data: _data, tpls: _tpls });
}

const _flush = () => { if (_saveTimer) _flushNow(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flush(); });
window.addEventListener('pagehide', _flush);
window.addEventListener('beforeunload', _flush);

window._murmursHasPendingSave = () => !!_saveTimer;
window._murmursGetData = () => _data;   // バックアップ用に公開
window._murmursGetTpls = () => _tpls;

// ── ライフサイクル（firebase.js から呼ばれる）──
window._murmursInitForUser = function () {
  clearTimeout(_saveTimer); _saveTimer = null;
  _ready = false; _allowEmptySave = false;
  _loadLocal();            // クラウドが来るまではローカルキャッシュを見せる
  renderMurmurs();
};

// ログアウト時。ここで保存を起こしてはいけない（v52.541 の教訓）
window._murmursClear = function () {
  clearTimeout(_saveTimer); _saveTimer = null;   // 残留タイマーを先に殺す
  _ready = false; _allowEmptySave = false;
  _data = []; _tpls = [];
  _editingId = null;
  renderMurmurs();
};

window._murmursLoadFromRemote = function (payload) {
  if (_saveTimer) return;   // ローカルに未送信の変更があるなら上書きしない
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const tpls = Array.isArray(payload?.tpls) ? payload.tpls : [];
  // リモートが空でローカルに中身があるときは採用しない（消失防止）
  if (!data.length && _data.length) { _ready = true; return; }
  _data = data;
  _tpls = tpls;
  _ready = true;
  _saveLocal();
  renderMurmurs();
  setTimeout(() => window._murmursMaybeRemind?.(), 1200);
};

// クラウドにまだ doc が無い（初回利用）と確定したときに呼ばれる
window._murmursMarkReady = function () {
  _ready = true;
  setTimeout(() => window._murmursMaybeRemind?.(), 1200);
  // ローカルにだけ中身があるなら、それをクラウドへ上げる
  if (_data.length) _save();
};

function _loadLocal() {
  try {
    const d = localStorage.getItem(LS_DATA);
    _data = d ? JSON.parse(d) : [];
    const t = localStorage.getItem(LS_TPLS);
    _tpls = t ? JSON.parse(t) : [];
  } catch (e) { _data = []; _tpls = []; }
  if (!Array.isArray(_data)) _data = [];
  if (!Array.isArray(_tpls)) _tpls = [];
}

// ─────────────────────────────── 語彙（tag-master.js から組み立てる）
let _vocab = null;
function _buildVocab() {
  const out = [];
  const push = (label, kind, terms) => {
    const set = new Set([label, ...(terms || [])].filter(Boolean).map(s => String(s).toLowerCase()));
    if (label) out.push({ label, kind, terms: [...set] });
  };
  (window.POSITIONS || []).forEach(p => {
    if (p.ja === 'その他') return;
    push(p.ja, 'pos', [p.en, ...(p.aliases || [])]);
  });
  (window.CATEGORIES || []).forEach(c => push(c.name, 'cat', [...(c.aliases || []), ...(c.terms || [])]));
  (window.TECHNIQUE_BUILTIN || []).forEach(t => push(t.ja, 'tech', t.terms));
  // ユーザーが動画に付けた #タグも語彙に入れる
  const seen = new Set(out.map(v => v.label));
  (window.videos || []).forEach(v => {
    (v.tags || []).forEach(tg => {
      if (tg && !seen.has(tg)) { seen.add(tg); push(tg, 'tag', []); }
    });
  });
  return out;
}
const _getVocab = () => (_vocab ||= _buildVocab());

// 画面に出すタグ一覧。層（ポジション/カテゴリ/技/#タグ）で分けず、
// 「実際に動画に付いている語」を件数つきの1本のリストにする。
// 手持ちが0本の語は出さない（辞書を見せても選ぶ意味がないため）。
let _tagIdx = null;
function _tagIndex() {
  if (_tagIdx) return _tagIdx;
  const count = new Map();
  (window.videos || []).forEach(v => {
    if (v.archived) return;
    new Set(_videoTags(v)).forEach(t => { if (t) count.set(t, (count.get(t) || 0) + 1); });
  });
  _tagIdx = [...count.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ja'));
  return _tagIdx;
}
const _tagCount = l => _tagIndex().find(x => x.label === l)?.n ?? 0;
window._murmursResetVocab = () => { _vocab = null; _tagIdx = null; };  // 動画やタグが増えたら呼ぶ

// 本文から語彙を検出。長い語を優先し、それに含まれる短い語は落とす
// （「シザースイープ」を拾ったら「スイープ」は出さない）
export function detectTags(text) {
  if (!text) return [];
  const low = String(text).toLowerCase();
  const hits = _getVocab().filter(v => v.terms.some(term => term.length >= 2 && low.includes(term)));
  return hits.filter(h => !hits.some(o =>
    o !== h && o.label.length > h.label.length && o.label.includes(h.label)));
}

// ─────────────────────────────── サジェスト
// その名前がついた動画を全部出す。攻め／守りといった中身での選り分けはしない。
function _videoTags(v) {
  return [...(v.pos || []), ...(v.cat || []), ...(v.tb || []), ...(v.tags || [])];
}
// 埋もれ度 — 再生していない × 追加が古い ほど高い
function _buried(v) {
  const pc = v.playCount || 0;
  const base = pc === 0 ? 1000 : pc <= 1 ? 400 : 0;
  const t = Date.parse(v.addedAt || '') || Date.now();
  const days = Math.max(0, (Date.now() - t) / 86400000);
  return base + Math.min(days, 1095);
}
export function matchVideos(tags) {
  if (!tags || !tags.length) return [];
  const vocab = _getVocab();
  const terms = tags.flatMap(t => {
    const v = vocab.find(x => x.label === t);
    return v ? v.terms : [String(t).toLowerCase()];
  }).filter(s => s.length >= 2);

  return (window.videos || [])
    .filter(v => !v.archived)
    .filter(v => {
      const vt = _videoTags(v);
      if (tags.some(t => vt.includes(t))) return true;
      const title = String(v.title || '').toLowerCase();
      return terms.some(s => title.includes(s));
    })
    .sort((a, b) => _buried(b) - _buried(a));
}

// どこから来た動画か。連番タイトルだけでは何の教則か分からないため。
function _srcLine(v) {
  const ch = v.channel || v.ch || '';
  const pl = v.pl || '';
  if (!ch && !pl) return '';
  return `<span class="mm-rel-src">${
    ch ? `<span class="mm-rel-ch">${_esc(ch)}</span>` : ''}${
    ch && pl ? '<span class="mm-rel-sep">·</span>' : ''}${
    pl ? `<span class="mm-rel-pl">${_esc(pl)}</span>` : ''}</span>`;
}

function _buriedLabel(v) {
  const pc = v.playCount || 0;
  const t = Date.parse(v.addedAt || '');
  let when = '';
  if (t) {
    const mo = Math.floor((Date.now() - t) / 2592000000);
    when = mo >= 12 ? `${Math.floor(mo / 12)}年${mo % 12 ? (mo % 12) + 'ヶ月' : ''}前に追加`
         : mo >= 1  ? `${mo}ヶ月前に追加` : '今月追加';
  }
  return (pc === 0 ? '◇ 未再生' : `▷ ${pc}回`) + (when ? ' · ' + when : '');
}

// ─────────────────────────────── テンプレート
function _allTpls() { return [...PRESET_TPLS, ..._tpls]; }
function _pinned() {
  const pinKeys = _tpls.filter(t => t.pinned).map(t => t.k);
  const presetPins = PRESET_TPLS.filter(t => t.pinned && !_tpls.some(u => u.k === t.k));
  const overrides = _tpls.filter(t => t.pinned);
  // 自作の★を優先し、残り枠をプリセットの★で埋める
  return [...overrides, ...presetPins].slice(0, PIN_MAX);
}

// ─────────────────────────────── 日付
function _fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return sameYear ? md : `${String(d.getFullYear()).slice(2)}/${md}`;
}

// ─────────────────────────────── リマインド（アプリ内のみ）
// 通知APIは使わない。アプリを開いたときに、条件が揃っていれば上部に1本出すだけ。
//   ・設定がON
//   ・指定した時刻を過ぎている
//   ・今日まだ書いていない
//   ・今日まだ出していない（「今はいい」を押したらその日は出さない）
const REM_DEFAULT = { on: true, hour: 19, everyDays: 1, lastShown: '', lastSnoozed: '' };
const _rem = { ...REM_DEFAULT };
try { Object.assign(_rem, JSON.parse(localStorage.getItem(LS_REM) || '{}')); } catch (e) {}
function _saveRem() { try { localStorage.setItem(LS_REM, JSON.stringify(_rem)); } catch (e) {} }
window._murmursGetRemind = () => ({ ..._rem });
// 他のタブで設定を変えた場合や、外から設定したい場合の入口。
// localStorage を直接書いても読み込み済みの _rem には届かないため。
window._murmursSetRemind = function (o) {
  Object.assign(_rem, o || {});
  _saveRem();
  return { ..._rem };
};
window.addEventListener('storage', e => {
  if (e.key !== LS_REM || !e.newValue) return;
  try { Object.assign(_rem, JSON.parse(e.newValue)); } catch (err) {}
});

const _today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const _wroteToday = () => _data.some(m => {
  const t = new Date(m.ts);
  const n = new Date();
  return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
});

function _remDue() {
  if (!_rem.on) return false;
  const today = _today();
  if (_rem.lastShown === today || _rem.lastSnoozed === today) return false;
  if (new Date().getHours() < (_rem.hour ?? 19)) return false;
  if (_wroteToday()) return false;
  // 「◯日おき」: 前回出した日から間隔が空いているか
  const every = Math.max(1, _rem.everyDays || 1);
  if (every > 1 && _rem.lastShown) {
    const prev = new Date(_rem.lastShown);
    if (!isNaN(prev) && (Date.now() - prev.getTime()) / 86400000 < every) return false;
  }
  return true;
}

window._murmursMaybeRemind = function () {
  if (!_remDue()) return;
  const el = document.getElementById('mm-remind');
  if (el) return;                       // すでに出ている
  _rem.lastShown = _today(); _saveRem();

  const past = _data.length ? _data[Math.floor(Math.random() * _data.length)] : null;
  const bar = document.createElement('div');
  bar.id = 'mm-remind';
  bar.innerHTML = `
    <div class="mm-rm-main">
      <p class="mm-rm-q">今日、気になったことはありますか</p>
      ${past ? `<button class="mm-rm-past" id="mm-rm-past">
          <span class="mm-rm-past-l">${_esc(_agoLabel(past.ts))}のあなた</span>
          <span class="mm-rm-past-b">${_esc(String(past.body).split('\n')[0])}</span>
        </button>` : ''}
    </div>
    <div class="mm-rm-acts">
      <button class="mm-rm-ghost" id="mm-rm-later">今はいい</button>
      <button class="mm-rm-go" id="mm-rm-write">書く</button>
    </div>
    <button class="mm-rm-x" id="mm-rm-close" aria-label="閉じる">✕</button>`;
  const host = document.querySelector('.topbar');
  if (host && host.parentElement) host.parentElement.insertBefore(bar, host.nextSibling);
  else document.body.appendChild(bar);

  const close = () => bar.remove();
  document.getElementById('mm-rm-close').onclick = close;
  document.getElementById('mm-rm-later').onclick = () => {
    _rem.lastSnoozed = _today(); _saveRem(); close();
  };
  document.getElementById('mm-rm-write').onclick = () => { close(); openComposer(); };
  const pb = document.getElementById('mm-rm-past');
  if (pb && past) pb.onclick = () => {
    close();
    _resurfId = past.id;
    window.switchTab?.('murmurs');
    setTimeout(() => _flashRow(past.id, true), 200);
  };
};

function _agoLabel(ts) {
  const days = Math.floor((Date.now() - Date.parse(ts)) / 86400000);
  if (days >= 365) return `${Math.floor(days / 365)}年前`;
  if (days >= 30)  return `${Math.floor(days / 30)}ヶ月前`;
  if (days >= 1)   return `${days}日前`;
  return '今日';
}

// ─────────────────────────────── UI: 常駐ボタン
// 書くボタンの記号。絵文字だと環境で色付きになって他のUIから浮くため、
// 単色の SVG にする。currentColor なので周りの文字色にそのまま従う。
const ICON_JOURNAL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/>' +
  '<path d="M8 7h8M8 11h6"/></svg>';
window._murmursIcon = ICON_JOURNAL;   // 動画パネル側からも同じ記号を使う

// 書くボタンの置き場所
//   off    … 出さない（N キーだけ）
//   header … ヘッダー右端（アカウントボタンの隣）
//   br/bl/tr/tl … 画面の四隅に浮かせる
const POS_OPTS = [
  ['header','ヘッダー右端'],['br','右下'],['bl','左下'],
  ['tr','右上'],['tl','左上'],['off','出さない']
];
function _ensureFab() {
  let b = document.getElementById('mm-fab');
  if (!b) {
    b = document.createElement('button');
    b.id = 'mm-fab';
    b.type = 'button';
    b.title = 'Journal に書く（N）';
    b.setAttribute('aria-label', 'Journal に書く');
    b.innerHTML = ICON_JOURNAL;
    b.onclick = () => openComposer();
  }
  _placeFab(window._murmursGetPos(), b);
}
function _placeFab(pos, b) {
  b = b || document.getElementById('mm-fab');
  if (!b) return;
  document.body.dataset.mmPos = pos;
  const slot = document.querySelector('.tb-row-logo');
  const parent = (pos === 'header' && slot) ? slot : document.body;
  if (b.parentElement !== parent) parent.appendChild(b);
  // ヘッダーではアカウントボタンの手前に置く
  if (parent === slot) {
    const acct = document.getElementById('acct-btn');
    if (acct && acct.previousElementSibling !== b) slot.insertBefore(b, acct);
  }
  window._rndEnsureBtn?.();   // ランダムボタンを Journal ボタンの左に並べ直す
}
window._murmursSetPos = function (pos) {
  try { localStorage.setItem(LS_POS, pos); } catch (e) {}
  _placeFab(pos);
  $$m('[data-mm-pos-btn]').forEach(x =>
    x.setAttribute('aria-pressed', String(x.dataset.mmPosBtn === pos)));
};
window._murmursGetPos = () => localStorage.getItem(LS_POS) || 'header';

// ─────────────────────────────── UI: コンポーザ
function _ensureComposer() {
  if (document.getElementById('mm-composer')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="mm-scrim"></div>
    <div id="mm-composer" role="dialog" aria-label="Journal に書く">
      <div class="mm-cp-hd">
        <h2 id="mm-cp-title">Journal</h2>
        <span class="mm-cp-sub" id="mm-cp-sub"></span>
        <button class="mm-x" id="mm-cp-close" aria-label="閉じる">✕</button>
      </div>
      <div id="mm-cp-quote"><span class="mm-q-h">ここから育てる</span><span id="mm-cp-quote-body"></span></div>
      <textarea id="mm-cp-text" placeholder="気になることをメモ"></textarea>
      <div class="mm-cp-tpl" id="mm-cp-tpl"></div>
      <div class="mm-cp-det" id="mm-cp-det"></div>
      <div class="mm-cp-ft">
        <span class="mm-hint">⌘ + Enter</span>
        <button class="mm-lnk" id="mm-cp-all">すべて見る</button>
        <button class="mm-btn-go" id="mm-cp-post" disabled>書く</button>
      </div>
    </div>`;
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

  const txt = $m('#mm-cp-text');
  txt.addEventListener('input', () => {
    $m('#mm-cp-post').disabled = !txt.value.trim();
    _renderDetect();
  });
  txt.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); _post(); }
  });
  $m('#mm-cp-close').onclick = closeComposer;
  $m('#mm-scrim').onclick = closeComposer;
  $m('#mm-cp-post').onclick = _post;
  $m('#mm-cp-all').onclick = () => { closeComposer(); window.switchTab?.('murmurs'); };
}

export function openComposer(fromId) {
  _ensureFab(); _ensureComposer();
  _resetComposer();
  if (fromId) {
    const src = _data.find(m => m.id === fromId);
    if (src) {
      _deriveFrom = fromId;
      $m('#mm-cp-quote-body').textContent = src.body;
      $m('#mm-cp-quote').classList.add('on');
      $m('#mm-cp-title').textContent = '⑂ ここから育てる';
      $m('#mm-cp-sub').textContent = 'タグは引き継がれます';
      (src.tags || []).forEach(t => _addTags.add(t));
    }
  }
  _renderQuickTpl();
  _renderDetect();
  $m('#mm-composer').classList.add('open');
  $m('#mm-scrim').classList.add('open');
  setTimeout(() => $m('#mm-cp-text')?.focus(), 30);
}

export function closeComposer() {
  $m('#mm-composer')?.classList.remove('open');
  $m('#mm-scrim')?.classList.remove('open');
  _deriveFrom = null;
  const q = $m('#mm-cp-quote'); if (q) q.classList.remove('on');
  const t = $m('#mm-cp-title'); if (t) t.textContent = 'Journal';
  const s = $m('#mm-cp-sub');   if (s) s.textContent = '';
}

function _resetComposer() {
  const txt = $m('#mm-cp-text');
  if (txt) txt.value = '';
  _rmTags.clear(); _addTags.clear(); _deriveFrom = null;
  const p = $m('#mm-cp-post'); if (p) p.disabled = true;
}

function _liveTags() {
  const txt = $m('#mm-cp-text');
  const auto = detectTags(txt ? txt.value : '').map(v => v.label).filter(l => !_rmTags.has(l));
  return [...new Set([...auto, ..._addTags])];
}

function _renderQuickTpl() {
  const el = $m('#mm-cp-tpl'); if (!el) return;
  el.innerHTML = _pinned().map(t =>
      `<button class="mm-tplbtn" data-mm-tpl="${_esc(t.k)}">${_esc(t.nm)}</button>`).join('') +
    `<button class="mm-tplbtn more" id="mm-tpl-more">…テンプレ一覧</button>`;
  $$m('[data-mm-tpl]').forEach(b => b.onclick = () => _applyTpl(b.dataset.mmTpl));
  $m('#mm-tpl-more').onclick = () => window._murmursOpenTplList();
}

function _applyTpl(k) {
  const t = _allTpls().find(x => x.k === k); if (!t) return;
  const txt = $m('#mm-cp-text');
  txt.value = t.body;
  txt.focus();
  txt.setSelectionRange(txt.value.length, txt.value.length);
  $m('#mm-cp-post').disabled = !txt.value.trim();
  _renderDetect();
}

// 検出チップ。本数を添えて「広い言葉かどうか」をその場で見せる
function _detChip(label, manual) {
  const n = _tagCount(label);
  const broad = n > 200;
  return `<span class="mm-det-chip${manual ? ' manual' : ''}${broad ? ' broad' : ''}"${
    broad ? ' title="広い言葉です。外すか、もっと具体的な言葉に替えられます"' : ''}>#${_esc(label)}<span class="mm-chip-n">${n}</span><button class="mm-det-x" data-mm-${manual ? 'unadd' : 'drop'}="${_esc(label)}" aria-label="外す">×</button></span>`;
}

function _renderDetect() {
  const el = $m('#mm-cp-det'); if (!el) return;
  const txt = $m('#mm-cp-text');
  const auto = detectTags(txt ? txt.value : '').filter(v => !_rmTags.has(v.label));
  const tags = _liveTags();
  const vids = matchVideos(tags);

  if (!tags.length) {
    el.innerHTML = (txt && txt.value.trim())
      ? `<span class="mm-det-idle">技やポジションの名前を書くと、関連動画が出ます</span>
         <button class="mm-det-add" id="mm-det-add">＋ タグ</button>`
      : '';
  } else {
    el.innerHTML =
      `<span class="mm-det-lbl">検出</span>` +
      auto.map(v => _detChip(v.label, false)).join('') +
      [..._addTags].map(l => _detChip(l, true)).join('') +
      `<button class="mm-det-add" id="mm-det-add">＋</button>` +
      (vids.length ? `<button class="mm-det-vids" id="mm-det-vids">▸ 関連動画 ${vids.length}本</button>` : '');
  }
  $$m('#mm-cp-det [data-mm-drop]').forEach(b => b.onclick = () => { _rmTags.add(b.dataset.mmDrop); _renderDetect(); });
  $$m('#mm-cp-det [data-mm-unadd]').forEach(b => b.onclick = () => { _addTags.delete(b.dataset.mmUnadd); _renderDetect(); });
  const add = $m('#mm-det-add'); if (add) add.onclick = () => window._murmursOpenTagPicker();
  const dv = $m('#mm-det-vids'); if (dv) dv.onclick = () => window._murmursShowRelated(_liveTags());
}

function _post() {
  const txt = $m('#mm-cp-text');
  const body = (txt ? txt.value : '').trim();
  if (!body) return;
  const tags = _liveTags();
  const rec = {
    id: _uid(),
    ts: new Date().toISOString(),
    body, tags, star: false,
    updatedAt: Date.now()
  };
  if (_deriveFrom) rec.from = _deriveFrom;
  const wasDerive = !!_deriveFrom;
  _data.unshift(rec);
  _save();
  _resetComposer();
  closeComposer();
  renderMurmurs();
  const n = matchVideos(tags).length;
  window.toast?.(wasDerive ? '⑂ 育てました'
                : (n ? `書きました — 関連動画 ${n}本` : '書きました'));
}

// ─────────────────────────────── キーボード
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = document.activeElement;
  const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  if (e.key === 'Escape') {
    if ($m('#mm-composer')?.classList.contains('open')) { closeComposer(); return; }
    if ($m('#mm-modal')?.classList.contains('open')) { window._murmursCloseModal(); return; }
    if (_editingId) { _editingId = null; renderMurmurs(); }
    return;
  }
  if (typing) return;
  if (e.key !== 'n' && e.key !== 'N') return;
  // 他のオーバーレイが開いているときは邪魔しない
  if (document.querySelector('#fc-overlay.open, #vpanel.show, .n-sheet-overlay, #vp-panel.show')) return;
  if (window.openVPanelId) return;
  e.preventDefault();
  openComposer();
});

// ─────────────────────────────── 一覧
export function renderMurmurs() {
  _ensureFab(); _ensureComposer(); _ensureModal();
  const root = document.getElementById('murmursTab');
  if (!root) return;

  const ordered = [..._data].sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0));
  const pinned = ordered.filter(m => m.star).length;

  root.innerHTML = `
    <div class="mm-wrap">
      <div class="mm-hd">
        <h2>Journal</h2>
        <span class="mm-sub"><span class="mm-num">${_data.length}</span> 件</span>
        <span class="mm-spacer"></span>
        <button class="mm-ghost mm-ghost-ic" id="mm-btn-new">${ICON_JOURNAL}書く</button>
        <button class="mm-ghost" id="mm-btn-random">🎲 ランダムに1件</button>
        <button class="mm-ghost" id="mm-btn-tpl">⊞ テンプレート</button>
        <button class="mm-ghost" id="mm-btn-pos">⚙ 設定</button>
      </div>
      ${_data.length ? _resurfHTML() : ''}
      <div id="mm-list">${
        _data.length
          ? (pinned ? `<div class="mm-sec">★ 固定 <span class="mm-num">${pinned}</span></div>` : '') +
            ordered.slice(0, pinned).map(_rowHTML).join('') +
            (pinned ? `<div class="mm-sec plain">すべて</div>` : '') +
            ordered.slice(pinned).map(_rowHTML).join('')
          : `<div class="mm-empty">
               <p class="mm-empty-t">まだ何もありません</p>
               <p class="mm-empty-d">練習で気づいたこと、うまくいったこと、気になった技。<br>
                  ひとことでも残しておくと、あとで読み返せます。</p>
               <button class="mm-btn-go" id="mm-empty-new">最初のひとことを書く</button>
             </div>`
      }</div>
    </div>`;

  $m('#mm-btn-new').onclick = () => openComposer();
  $m('#mm-btn-random').onclick = _randomResurf;
  $m('#mm-btn-tpl').onclick = () => window._murmursOpenTplList();
  $m('#mm-btn-pos').onclick = () => window._murmursOpenPosSetting();
  const en = $m('#mm-empty-new'); if (en) en.onclick = () => openComposer();
  _bindRows();
  _bindResurf();
}

function _rowHTML(m) {
  const parent = m.from ? _data.find(x => x.id === m.from) : null;
  const kids = _data.filter(x => x.from === m.id).length;
  const isEd = _editingId === m.id;
  const vids = matchVideos(m.tags || []);
  return `
  <div class="mm-row${m.star ? ' starred' : ''}" data-mm-row="${_esc(m.id)}">
    <div class="mm-date">${_esc(_fmtDate(m.ts))}</div>
    <div class="mm-main">
      ${parent ? `
        <button class="mm-from" data-mm-jump="${_esc(parent.id)}" title="元の記録へ">
          ↳ <span class="mm-f-d">${_esc(_fmtDate(parent.ts))}</span>
          <span class="mm-f-b">${_esc(String(parent.body).split('\n')[0])}</span>
          <span class="mm-f-g">から育てた</span>
        </button>` : ''}
      ${isEd ? `
        <textarea class="mm-edit" data-mm-ed="${_esc(m.id)}" rows="4">${_esc(m.body)}</textarea>
        <div class="mm-edit-tags" id="mm-edit-tags">${_editTagsHTML()}</div>
        <div class="mm-edit-ft">
          <span class="mm-hint">⌘ + Enter で保存 / Esc で取消</span>
          <button class="mm-ghost" data-mm-cancel="${_esc(m.id)}">やめる</button>
          <button class="mm-btn-go" data-mm-save="${_esc(m.id)}">保存</button>
        </div>`
      : `<div class="mm-body">${_esc(m.body)}</div>`}
      <div class="mm-meta">
        ${(m.tags || []).map(t =>
          `<button class="mm-tag" data-mm-edittag="${_esc(m.id)}" title="タグを編集">#${_esc(t)}</button>`).join('')}
        ${!(m.tags || []).length && !isEd
          ? `<button class="mm-tag add" data-mm-edittag="${_esc(m.id)}" title="タグを付ける">＋ タグ</button>` : ''}
        ${vids.length ? `<button class="mm-vids" data-mm-rel="${_esc(m.id)}">▸ 関連動画 ${vids.length}本</button>` : ''}
        ${kids ? `<button class="mm-kids" data-mm-kids="${_esc(m.id)}">⑂ ${kids}件に育った</button>` : ''}
      </div>
    </div>
    <div class="mm-acts">
      <button class="mm-ic${m.star ? ' on' : ''}" data-mm-star="${_esc(m.id)}"
              title="${m.star ? '固定を外す' : 'トップに固定'}">${m.star ? '★' : '☆'}</button>
      <button class="mm-ic" data-mm-edit="${_esc(m.id)}" title="編集">✎</button>
      <button class="mm-ic" data-mm-derive="${_esc(m.id)}" title="ここから育てる">⑂</button>
      <button class="mm-ic" data-mm-note="${_esc(m.id)}" title="ノートにする">📓</button>
      <button class="mm-ic" data-mm-del="${_esc(m.id)}" title="削除">🗑</button>
    </div>
  </div>`;
}

function _bindRows() {
  $$m('#mm-list [data-mm-star]').forEach(b => b.onclick = () => {
    const m = _data.find(x => x.id === b.dataset.mmStar); if (!m) return;
    m.star = !m.star; m.updatedAt = Date.now();
    _save(); renderMurmurs();
    window.toast?.(m.star ? '★ トップに固定しました' : '固定を外しました');
    if (m.star) _flashRow(m.id);
  });
  $$m('#mm-list [data-mm-edit]').forEach(b => b.onclick = () => _startEdit(b.dataset.mmEdit));
  $$m('#mm-list [data-mm-edittag]').forEach(b => b.onclick = () => _startEdit(b.dataset.mmEdittag, true));
  $$m('#mm-list [data-mm-save]').forEach(b => b.onclick = () => _saveEdit(b.dataset.mmSave));
  $$m('#mm-list [data-mm-cancel]').forEach(b => b.onclick = () => { _editingId = null; renderMurmurs(); });
  _bindEditTags();
  $$m('#mm-list [data-mm-ed]').forEach(ta => {
    ta.onkeydown = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); _saveEdit(ta.dataset.mmEd); }
    };
    ta.oninput = () => {
      detectTags(ta.value).forEach(v => { if (!_editDropped.has(v.label)) _editTags.add(v.label); });
      const box = $m('#mm-edit-tags');
      if (box) { box.innerHTML = _editTagsHTML(); _bindEditTags(); }
    };
  });
  $$m('#mm-list [data-mm-derive]').forEach(b => b.onclick = () => openComposer(b.dataset.mmDerive));
  $$m('#mm-list [data-mm-note]').forEach(b => b.onclick = () => _toNote(b.dataset.mmNote));
  $$m('#mm-list [data-mm-jump]').forEach(b => b.onclick = () => _flashRow(b.dataset.mmJump, true));
  $$m('#mm-list [data-mm-kids]').forEach(b => b.onclick = () => {
    const kid = _data.find(x => x.from === b.dataset.mmKids);
    if (kid) _flashRow(kid.id, true);
  });
  $$m('#mm-list [data-mm-rel]').forEach(b => b.onclick = () => {
    const m = _data.find(x => x.id === b.dataset.mmRel);
    if (m) window._murmursShowRelated(m.tags || []);
  });
  $$m('#mm-list [data-mm-del]').forEach(b => b.onclick = () => _del(b.dataset.mmDel));
}

function _startEdit(id, focusTags) {
  const m = _data.find(x => x.id === id); if (!m) return;
  _editingId = id;
  _editTags = new Set(m.tags || []);
  _editDropped = new Set();
  renderMurmurs();
  if (focusTags) { $m('#mm-edit-tags')?.scrollIntoView({ block:'center' }); return; }
  const ta = $m(`[data-mm-ed="${CSS.escape(id)}"]`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function _editTagsHTML() {
  return `<span class="mm-et-lbl">タグ</span>` +
    [..._editTags].map(t =>
      `<span class="mm-et-chip">#${_esc(t)}<span class="mm-chip-n">${_tagCount(t)}</span><button class="mm-et-x" data-mm-etdrop="${_esc(t)}" aria-label="外す">×</button></span>`).join('') +
    `<button class="mm-et-add" id="mm-et-add">＋ 追加</button>` +
    (_editTags.size ? '' : `<span class="mm-et-none">なし</span>`);
}

function _bindEditTags() {
  $$m('#mm-edit-tags [data-mm-etdrop]').forEach(b => b.onclick = () => {
    const t = b.dataset.mmEtdrop;
    _editTags.delete(t); _editDropped.add(t);
    const box = $m('#mm-edit-tags');
    if (box) { box.innerHTML = _editTagsHTML(); _bindEditTags(); }
  });
  const add = $m('#mm-et-add');
  if (add) add.onclick = () => window._murmursOpenTagPicker('edit');
}

function _saveEdit(id) {
  const ta = $m(`[data-mm-ed="${CSS.escape(id)}"]`); if (!ta) return;
  const v = ta.value.trim();
  if (!v) { window.toast?.('本文が空です'); return; }
  const m = _data.find(x => x.id === id); if (!m) return;
  m.body = v;
  m.tags = [..._editTags];   // 画面に出ているタグがそのまま保存される
  m.updatedAt = Date.now();
  _editingId = null;
  _save(); renderMurmurs();
  window.toast?.('保存しました');
}

function _del(id) {
  const idx = _data.findIndex(x => x.id === id);
  if (idx < 0) return;
  const [removed] = _data.splice(idx, 1);
  // 子から親への参照が迷子にならないようにする
  const orphans = _data.filter(x => x.from === id);
  orphans.forEach(x => { delete x.from; });
  if (!_data.length) _allowEmptySave = true;  // 明示的に全部消した場合のみ空保存を許可
  _save(); renderMurmurs();
  window.toastUndo?.('🗑 削除しました', () => {
    _data.splice(idx, 0, removed);
    orphans.forEach(x => { x.from = id; });
    _allowEmptySave = false;
    _save(); renderMurmurs();
  });
}

function _flashRow(id, scroll) {
  const el = $m(`[data-mm-row="${CSS.escape(id)}"]`);
  if (!el) return;
  if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// メモをノートに育てる。同じタグの過去のメモも一緒に渡す。
function _toNote(id) {
  const m = _data.find(x => x.id === id); if (!m) return;
  const tags = m.tags || [];
  const related = tags.length
    ? _data.filter(x => x.id !== id && (x.tags || []).some(t => tags.includes(t)))
           .slice(0, 8).map(x => x.body)
    : [];
  if (!window.openNoteTemplatePicker) { window.toast?.('テンプレートを読み込めませんでした'); return; }
  window.openNoteTemplatePicker({ body: m.body, tags, related });
}

// ─────────────────────────────── 見返し
function _resurfPick() {
  if (!_data.length) return null;
  // 「1ヶ月前の今日」に近いものがあればそれ、無ければランダム
  const target = Date.now() - 30 * 86400000;
  const near = _data.filter(m => Math.abs(Date.parse(m.ts) - target) < 3 * 86400000);
  const pool = near.length ? near : _data;
  return pool[Math.floor(Math.random() * pool.length)];
}
function _resurfHTML() {
  if (!_resurfId || !_data.some(m => m.id === _resurfId)) {
    const p = _resurfPick();
    _resurfId = p ? p.id : null;
  }
  const m = _data.find(x => x.id === _resurfId);
  if (!m) return '';
  const days = Math.floor((Date.now() - Date.parse(m.ts)) / 86400000);
  const lbl = days >= 25 && days <= 35 ? '1ヶ月前の今日'
            : days >= 360 ? `${Math.floor(days / 365)}年前`
            : days >= 25 ? `${Math.floor(days / 30)}ヶ月前`
            : `${days}日前`;
  return `
    <div class="mm-resurf">
      <div class="mm-rf-lbl">${_esc(lbl)}のあなた</div>
      <div class="mm-rf-body">${_esc(m.body)}</div>
      <div class="mm-rf-acts">
        <button class="mm-ghost" id="mm-rf-derive">⑂ ここから育てる</button>
        <button class="mm-ghost" id="mm-rf-note">📓 ノートにする</button>
        <button class="mm-ghost" id="mm-rf-jump">元の場所へ</button>
        <button class="mm-ghost" id="mm-rf-next">別のを見る</button>
      </div>
    </div>`;
}
function _bindResurf() {
  const d = $m('#mm-rf-derive'); if (d) d.onclick = () => openComposer(_resurfId);
  const nb = $m('#mm-rf-note'); if (nb) nb.onclick = () => _toNote(_resurfId);
  const j = $m('#mm-rf-jump');   if (j) j.onclick = () => _flashRow(_resurfId, true);
  const n = $m('#mm-rf-next');   if (n) n.onclick = _randomResurf;
}
function _randomResurf() {
  if (!_data.length) return;
  const p = _resurfPick();
  _resurfId = p ? p.id : null;
  renderMurmurs();
}

// ─────────────────────────────── モーダル
function _ensureModal() {
  if (document.getElementById('mm-modal')) return;
  const d = document.createElement('div');
  d.id = 'mm-modal';
  d.innerHTML = `
    <div class="mm-mcard" role="dialog" aria-label="Journal">
      <div class="mm-mhd"><h2 id="mm-mh"></h2><button class="mm-x" id="mm-mx" aria-label="閉じる">✕</button></div>
      <div class="mm-mbd" id="mm-mbd"></div>
      <div class="mm-mft" id="mm-mft"></div>
    </div>`;
  document.body.appendChild(d);
  d.onclick = e => { if (e.target === d) window._murmursCloseModal(); };
  $m('#mm-mx').onclick = () => window._murmursCloseModal();
}
function _openModal(title, bodyHTML, footHTML) {
  _ensureModal();
  $m('#mm-mh').textContent = title;
  $m('#mm-mbd').innerHTML = bodyHTML;
  $m('#mm-mft').innerHTML = footHTML || '';
  $m('#mm-modal').classList.add('open');
}
window._murmursCloseModal = () => $m('#mm-modal')?.classList.remove('open');

// ── 関連動画 ──
const REL_PAGE = 60;
let _relShown = REL_PAGE, _relTags = [];

window._murmursShowRelated = function (tags) {
  _relTags = tags; _relShown = REL_PAGE;
  _paintRelated();
};

function _paintRelated() {
  const tags = _relTags;
  const vids = matchVideos(tags);
  const shown = vids.slice(0, _relShown);
  const rest = vids.length - shown.length;
  _openModal(
    `${tags.map(t => '#' + t).join(' ')} — ${vids.length}本`,
    vids.length
      ? `<p class="mm-note">この名前がついた動画です。まだ見ていないものが上です。${
           vids.length > REL_PAGE ? '<br>多すぎるときは、もっと具体的な言葉のタグに替えると絞れます。' : ''}</p>
         <div class="mm-rel">${shown.map(v => `
           <button class="mm-rel-row${(v.playCount || 0) === 0 ? ' buried' : ''}" data-mm-play="${_esc(v.id)}">
             <span class="mm-rel-th">${v.thumb ? `<img src="${_esc(v.thumb)}" alt="" loading="lazy">` : ''}</span>
             <span class="mm-rel-main">
               <span class="mm-rel-t">${_esc(v.title || '(タイトルなし)')}</span>
               ${_srcLine(v)}
               <span class="mm-rel-m">${_esc(_buriedLabel(v))}</span>
             </span>
           </button>`).join('')}</div>` +
         (rest > 0 ? `<button class="mm-more" id="mm-rel-more">さらに見る（残り ${rest}本）</button>` : '')
      : `<p class="mm-note">この名前の動画はまだありません。</p>`
  );
  $$m('#mm-mbd [data-mm-play]').forEach(b => b.onclick = () => {
    window._murmursCloseModal();
    closeComposer();
    window.openVPanel?.(b.dataset.mmPlay);
  });
  const more = $m('#mm-rel-more');
  if (more) more.onclick = () => { _relShown += REL_PAGE; _paintRelated(); };
}

// ── タグを足す ──
window._murmursOpenTagPicker = function (mode) {
  const isEdit = mode === 'edit';
  const cur = () => new Set(isEdit ? _editTags : _liveTags());

  const rows = q => {
    const sel = cur();
    const query = (q || '').trim().toLowerCase();
    let list = _tagIndex();
    if (query) list = list.filter(x => x.label.toLowerCase().includes(query));
    const exact = query && _tagIndex().some(x => x.label.toLowerCase() === query);
    const head = (query && !exact)
      ? `<button class="mm-newtag" data-mm-newtag="${_esc(q.trim())}">
           ＋「${_esc(q.trim())}」をタグにする
           <span class="mm-nt-note">手持ちの動画にない言葉でも残せます</span>
         </button>` : '';
    if (!list.length && !head)
      return `<p class="mm-note">動画に付いているタグがまだありません。上の欄に書けば、そのまま新しいタグにできます。</p>`;
    return head + `<div class="mm-tagwrap">${list.slice(0, 300).map(x =>
      `<button class="mm-chip" data-mm-addtag="${_esc(x.label)}" aria-pressed="${sel.has(x.label)}"
       >#${_esc(x.label)}<span class="mm-chip-n">${x.n}</span></button>`).join('')}</div>` +
      (list.length > 300 ? `<p class="mm-note-s">ほか ${list.length - 300} 件。絞り込んでください。</p>` : '');
  };

  _openModal('タグ',
    `<input class="mm-fld mm-tagq" id="mm-tagq" type="text" autocomplete="off"
            placeholder="書いて検索、そのまま新しいタグにもできます">
     <p class="mm-note-s">数字はその言葉が付いている動画の本数です。多いものほど広い言葉になります。</p>
     <div id="mm-tagrows">${rows('')}</div>`,
    `<button class="mm-btn-go" id="mm-tag-done">完了</button>`);
  $m('#mm-tag-done').onclick = () => window._murmursCloseModal();

  const q = $m('#mm-tagq');
  const repaint = () => { $m('#mm-tagrows').innerHTML = rows(q.value); bindRows(); };
  const commit = label => {
    const l = String(label).trim(); if (!l) return;
    const sel = cur();
    if (isEdit) {
      if (sel.has(l)) { _editTags.delete(l); _editDropped.add(l); }
      else { _editTags.add(l); _editDropped.delete(l); }
      const box = $m('#mm-edit-tags');
      if (box) { box.innerHTML = _editTagsHTML(); _bindEditTags(); }
    } else {
      if (sel.has(l)) { _addTags.delete(l); _rmTags.add(l); }
      else { _addTags.add(l); _rmTags.delete(l); }
      _renderDetect();
    }
  };
  function bindRows() {
    $$m('#mm-tagrows [data-mm-addtag]').forEach(b => b.onclick = () => { commit(b.dataset.mmAddtag); repaint(); });
    const nt = $m('#mm-tagrows [data-mm-newtag]');
    if (nt) nt.onclick = () => { commit(nt.dataset.mmNewtag); q.value = ''; repaint(); q.focus(); };
  }
  bindRows();
  q.oninput = repaint;
  q.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const l = q.value.trim(); if (!l) return;
    commit(l); q.value = ''; repaint(); q.focus();
  };
  setTimeout(() => q.focus(), 40);
};

// ── テンプレート一覧 ──
window._murmursOpenTplList = function () {
  const card = t => `
    <div class="mm-tpl-row">
      <button class="mm-tpl-hit" data-mm-pick="${_esc(t.k)}">
        <span class="mm-tpl-nm">${_esc(t.nm)}${t.preset ? '' : ' <span class="mm-badge">自作</span>'}</span>
        <span class="mm-tpl-ds">${_esc(t.body ? t.body.split('\n').filter(Boolean).join(' / ') : '本文なし')}</span>
      </button>
      <span class="mm-tpl-acts">
        <button class="mm-ic${t.pinned ? ' on' : ''}" data-mm-pin="${_esc(t.k)}"
                title="${t.pinned ? 'ボタンから外す' : 'ボタンに出す'}">${t.pinned ? '★' : '☆'}</button>
        ${t.preset
          ? `<button class="mm-ic" data-mm-dup="${_esc(t.k)}" title="複製して編集">⧉</button>`
          : `<button class="mm-ic" data-mm-tedit="${_esc(t.k)}" title="編集">✎</button>
             <button class="mm-ic" data-mm-tdel="${_esc(t.k)}" title="削除">🗑</button>`}
      </span>
    </div>`;
  const presets = _allTpls().filter(t => t.preset);
  const mine    = _allTpls().filter(t => !t.preset);
  _openModal('テンプレート',
    `<p class="mm-note">押すと本文に入ります。埋めなくても投稿できます。<br>
       <span class="mm-note-s">★ を付けたものが入力欄のボタンになります（${PIN_MAX}つまで）</span></p>
     <p class="mm-sec2">プリセット</p>
     <div class="mm-tpl-list">${presets.map(card).join('')}</div>
     <p class="mm-sec2">自分のテンプレート</p>
     <div class="mm-tpl-list">${mine.map(card).join('')}
       <button class="mm-tpl-new" id="mm-tpl-new">＋ 新しく作る</button>
     </div>`);

  $$m('#mm-mbd [data-mm-pick]').forEach(b => b.onclick = () => {
    window._murmursCloseModal();
    if (!$m('#mm-composer')?.classList.contains('open')) openComposer();
    setTimeout(() => _applyTpl(b.dataset.mmPick), 40);
  });
  $$m('#mm-mbd [data-mm-pin]').forEach(b => b.onclick = () => _togglePin(b.dataset.mmPin));
  $$m('#mm-mbd [data-mm-dup]').forEach(b => b.onclick = () => {
    const s = _allTpls().find(x => x.k === b.dataset.mmDup);
    _openTplEditor({ nm: s.nm + ' のコピー', body: s.body });
  });
  $$m('#mm-mbd [data-mm-tedit]').forEach(b => b.onclick = () =>
    _openTplEditor(_tpls.find(x => x.k === b.dataset.mmTedit)));
  $$m('#mm-mbd [data-mm-tdel]').forEach(b => b.onclick = () => {
    _tpls = _tpls.filter(x => x.k !== b.dataset.mmTdel);
    _save(); _renderQuickTpl(); window._murmursOpenTplList();
    window.toast?.('削除しました');
  });
  $m('#mm-tpl-new').onclick = () => {
    const txt = $m('#mm-cp-text');
    _openTplEditor({ nm: '', body: txt ? txt.value.trim() : '' });
  };
};

function _togglePin(k) {
  const preset = PRESET_TPLS.find(x => x.k === k);
  let t = _tpls.find(x => x.k === k);
  if (!t && preset) {
    // プリセットの★状態を変えるときは、上書き用のコピーを持つ
    t = { ...preset, preset: true };
    _tpls.push(t);
  }
  if (!t) return;
  if (!t.pinned && _pinned().length >= PIN_MAX) {
    window.toast?.(`ボタンは${PIN_MAX}つまで。どれかの ★ を外してください`);
    return;
  }
  t.pinned = !t.pinned;
  _save(); _renderQuickTpl(); window._murmursOpenTplList();
}

let _tplEditing = null;
function _openTplEditor(src) {
  _tplEditing = (src && src.k && !src.preset) ? src : null;
  _openModal(_tplEditing ? 'テンプレートを編集' : '新しいテンプレート',
    `<label class="mm-fl" for="mm-t-nm">名前</label>
     <input class="mm-fld" id="mm-t-nm" type="text" placeholder="例：今日の練習したこと" value="${_esc(src?.nm || '')}">
     <label class="mm-fl" for="mm-t-body">本文</label>
     <textarea class="mm-fld" id="mm-t-body" rows="6" placeholder="効いた：&#10;効かなかった：&#10;次に試す：">${_esc(src?.body || '')}</textarea>
     <p class="mm-note-s">押したときに本文へ入る文字です。質問を並べるだけで十分。</p>`,
    `<button class="mm-ghost" id="mm-t-cancel">やめる</button>
     <button class="mm-btn-go" id="mm-t-save">保存</button>`);
  $m('#mm-t-cancel').onclick = () => window._murmursOpenTplList();
  $m('#mm-t-save').onclick = () => {
    const nm = $m('#mm-t-nm').value.trim();
    const body = $m('#mm-t-body').value;
    if (!nm) { window.toast?.('名前を入れてください'); $m('#mm-t-nm').focus(); return; }
    if (_tplEditing) { _tplEditing.nm = nm; _tplEditing.body = body; }
    else _tpls.push({ k: 'u' + _uid(), nm, body, pinned: false, preset: false });
    _save(); _renderQuickTpl();
    window._murmursOpenTplList();
    window.toast?.(_tplEditing ? '更新しました' : 'テンプレートを作りました');
  };
  setTimeout(() => $m('#mm-t-nm')?.focus(), 40);
}

// ── 表示設定（この端末だけ）──
window._murmursOpenPosSetting = function () {
  const cur = window._murmursGetPos();
  const hours = [7, 12, 17, 19, 21, 23];
  const spans = [[1, '毎日'], [2, '2日おき'], [3, '3日おき'], [7, '週に1回']];
  _openModal('Journal の設定',
    `<p class="mm-sec2">書くボタンの置き場所</p>
     <div class="mm-tagwrap">${POS_OPTS.map(([v, nm]) =>
       `<button class="mm-chip" data-mm-pos-btn="${v}" aria-pressed="${cur === v}">${nm}</button>`).join('')}</div>
     <p class="mm-note-s" style="margin-bottom:20px">「出さない」にしても、N キーでいつでも開けます。<br>
        動画を見ているあいだは、どの設定でも画面には浮かべず、動画パネルの ＋ から書きます。</p>

     <p class="mm-sec2">声をかける</p>
     <div class="mm-tagwrap">
       <button class="mm-chip" data-mm-rem-on="1" aria-pressed="${_rem.on}">かける</button>
       <button class="mm-chip" data-mm-rem-on="0" aria-pressed="${!_rem.on}">かけない</button>
     </div>
     <div id="mm-rem-detail" class="mm-sub${_rem.on ? ' on' : ''}">
       <p class="mm-sec2">頻度</p>
       <div class="mm-tagwrap">${spans.map(([d, nm]) =>
         `<button class="mm-chip" data-mm-rem-every="${d}" aria-pressed="${(_rem.everyDays||1) === d}">${nm}</button>`).join('')}</div>
       <p class="mm-sec2">この時刻より後に開いたとき</p>
       <div class="mm-tagwrap">${hours.map(h =>
         `<button class="mm-chip" data-mm-rem-hour="${h}" aria-pressed="${(_rem.hour ?? 19) === h}">${h}時</button>`).join('')}</div>
     </div>
     <p class="mm-note-s">アプリを開いたときに画面の上へ1本出るだけです。通知は使いません。<br>
        その日にもう書いていれば出ません。「今はいい」を押すとその日は出ません。</p>`);

  $$m('#mm-mbd [data-mm-rem-on]').forEach(b => b.onclick = () => {
    _rem.on = b.dataset.mmRemOn === '1'; _saveRem();
    $$m('#mm-mbd [data-mm-rem-on]').forEach(x =>
      x.setAttribute('aria-pressed', String((x.dataset.mmRemOn === '1') === _rem.on)));
    $m('#mm-rem-detail').classList.toggle('on', _rem.on);
  });
  $$m('#mm-mbd [data-mm-rem-every]').forEach(b => b.onclick = () => {
    _rem.everyDays = Number(b.dataset.mmRemEvery); _saveRem();
    $$m('#mm-mbd [data-mm-rem-every]').forEach(x =>
      x.setAttribute('aria-pressed', String(Number(x.dataset.mmRemEvery) === _rem.everyDays)));
  });
  $$m('#mm-mbd [data-mm-rem-hour]').forEach(b => b.onclick = () => {
    _rem.hour = Number(b.dataset.mmRemHour); _saveRem();
    $$m('#mm-mbd [data-mm-rem-hour]').forEach(x =>
      x.setAttribute('aria-pressed', String(Number(x.dataset.mmRemHour) === _rem.hour)));
  });
  $$m('#mm-mbd [data-mm-pos-btn]').forEach(b => b.onclick = () => {
    window._murmursSetPos(b.dataset.mmPosBtn);
    window.toast?.('表示を変えました');
  });
};

// 初期化：ログイン前でもローカルキャッシュを見せる
_loadLocal();
