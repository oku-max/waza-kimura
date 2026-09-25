// ═══ WAZA KIMURA — タグ設定 ═══

// タググループは 4 つ固定。名前も中身もユーザーが自由に決める。
// ここにある label はあくまで「まだ何も決めていない人の初期値」で、意味を持たせない。
// 選択肢は全部空から始める。組み込みの値は入れない（v52.827・タグはユーザー定義がすべて）。
// 既存ユーザーは localStorage 'wk_tagSettings' の値が優先されるので、この定数を変えても影響しない。
const DEFAULT_TAG_SETTINGS = [
  { key:'tb',   label:'タグ1', visible:true,  presets:[] },
  { key:'cat',  label:'タグ2', visible:true,  presets:[] },
  { key:'pos',  label:'タグ3', visible:true,  presets:[] },
  { key:'tags', label:'タグ4', visible:true,  presets:[] },
];

// グループ名の取り出しはこの 3 つに集約する。画面側が 'カテゴリ' 等を直接書かない。
// 直接フィールドを読む場所を増やさない（CLAUDE.md: 同じものを指す値が2つあるなら読む場所を1つにする）。
const _TAG_KEYS = ['tb', 'cat', 'pos', 'tags'];
const _TAG_FALLBACK = { tb:'タグ1', cat:'タグ2', pos:'タグ3', tags:'タグ4' };

// 4 つのグループを定義順で返す。画面はこれを回して描く。
export function tagGroups() {
  return _TAG_KEYS.map(k => tagSettings.find(t => t.key === k)).filter(Boolean);
}

// ユーザーが付けた名前。未設定なら初期値。
export function tagLabel(key) {
  const t = tagSettings.find(x => x.key === key);
  const l = t && t.label != null ? String(t.label).trim() : '';
  return l || _TAG_FALLBACK[key] || String(key);
}

// 狭い場所（サイドバーのタブ等）用。正式名は title 属性で出す前提で切り詰める。
export function tagLabelShort(key, max) {
  const l = tagLabel(key);
  const n = max || 6;
  return l.length > n ? l.slice(0, n) + '…' : l;
}

// そのグループを画面に出すか（既存の visible をそのまま使う）。
export function tagVisible(key) {
  const t = tagSettings.find(x => x.key === key);
  return t ? t.visible !== false : true;
}

// そのグループの選択肢。中身もユーザーのもの。画面は window.CATEGORIES 等を直接見ない。
export function tagPresets(key) {
  const t = tagSettings.find(x => x.key === key);
  if (!t) return [];
  if (!Array.isArray(t.presets)) t.presets = [];
  return t.presets;
}

// 選択肢の追加/削除。表示は tagPresets() を見るので、編集は必ずここを通す。
// （辞書 waza_tag_dict / waza_positions は別物。あちらは英語表記・別名を持つ検索用。）
function _presetAdd(key, name) {
  if (!name) return;
  const t = tagSettings.find(x => x.key === key);
  if (!t) return;
  if (!Array.isArray(t.presets)) t.presets = [];
  if (!t.presets.includes(name)) { t.presets.push(name); t.seeded = true; saveTagSettings(); }
}
function _presetRemove(key, name) {
  if (!name) return;
  const t = tagSettings.find(x => x.key === key);
  if (!t || !Array.isArray(t.presets)) return;
  const next = t.presets.filter(p => p !== name);
  // 自分で触ったグループには以後いっさい種を入れない（全部消して空にしても復活させない）
  if (next.length !== t.presets.length) { t.presets = next; t.seeded = true; saveTagSettings(); }
}

// 初回だけ、そのユーザーが自分の動画に付けてきた値を選択肢に入れる。
// 組み込みの一覧（TB_VALUES / CATEGORIES / POSITIONS）は入れない（v52.827・タグはユーザー定義がすべて）。
// 以前は組み込みの一覧を入れていた。v52.803 より前の設定には cat / pos の選択肢が保存されていないので、
// 何も入れないと、ログインした瞬間に今まで使っていた値が選べなくなる（v52.813 の「カテゴリ選べない」）。
// その人の動画に付いている値＝その人が決めた値なので、それだけを戻す。
// ・空 → 埋める、しかやらない。既にある選択肢は絶対に触らない
// ・一度入れたら（または自分で触ったら）seeded を立て、以後は入れない
//   （ユーザーが全部消して「空のまま」にしたいときに、勝手に復活させないため）
// tags（自由タグ）は _syncTagPresetsFromVideos が受け持つ。
const _SEEDABLE = new Set(['tb', 'cat', 'pos']);
function _sampleFor(key) {
  if (!_SEEDABLE.has(key)) return [];
  const set = new Set();
  (window.videos || []).forEach(v => { (Array.isArray(v?.[key]) ? v[key] : []).forEach(x => { if (x) set.add(x); }); });
  return [...set].sort((a, b) => String(a).localeCompare(String(b), 'ja'));
}
function _seedTagPresets() {
  let changed = false;
  for (const key of _TAG_KEYS) {
    const t = tagSettings.find(x => x.key === key);
    if (!t || t.seeded) continue;
    if (!Array.isArray(t.presets)) t.presets = [];
    if (t.presets.length === 0 && _SEEDABLE.has(key)) {
      const sample = _sampleFor(key);
      // 動画がまだ読めていない／まだ1本もタグが無いなら、印を付けずに次回へ回す。
      // ここで seeded を立ててしまうと、動画を読んだ後に二度と入らない（v52.813）。
      // 何も無いなら空のまま＝組み込みの値で埋めることはしない。
      if (!sample.length) continue;
      t.presets = sample;
    }
    t.seeded = true;
    changed = true;
  }
  return changed;
}

export let tagSettings = DEFAULT_TAG_SETTINGS.map(d => ({ ...d, presets: [...d.presets] }));


// AIタグ判定は v52.806 で廃止（Notion 項目01/13）。
// 残っているのはチャプター関連だけ（禁止リストは v52.828 で廃止。保存済みの値は残す）。
//   fetchChaptersOnImport / chapterGrain … チャプター機能のもの。タグとは無関係
//   techBlocklist … 旧「禁止リスト」。v52.828 で画面ごと廃止し、どこからも読まない・書かない。
//                    保存済みの中身は消さない（読み込んでそのまま保存し直すだけ＝データを消す変更にしない）。
//                    旧 #Tag モーダルも v52.833 で削除したので、参照はここ（読み込み）だけ
// 廃止したキー（enabled / defaultMode / categories / autoTagOnImport / newTagProposal /
// flexibility / model / bjjRules / feedbackExamples 等）は、ここから消すだけにする。
// 保存済みの値は消さない（読まなくなるだけ。データを消す変更にしない）。
export let aiSettings = {
  fetchChaptersOnImport: true,
  chapterGrain:          'normal',   // 自動チャプターの粒度 'fine' | 'normal' | 'coarse'
  techBlocklist:         [],
};

export function saveTagSettings() {
  try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
  applyTagLabels();
  window.saveUserSettings?.();
}

export function saveAiSettings() {
  try { localStorage.setItem('wk_aiSettings', JSON.stringify(aiSettings)); } catch(e) {}
  window.saveUserSettings?.();
}

function _migrateTagSettings() {
  DEFAULT_TAG_SETTINGS.forEach(def => {
    if (!tagSettings.find(t => t.key === def.key)) {
      tagSettings.unshift({ ...def, presets: [...def.presets] });
    }
  });
}

export function loadTagSettings() {
  try {
    const s = localStorage.getItem('wk_tagSettings');
    if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) tagSettings = p; }
  } catch(e) {}
  _migrateTagSettings();
  try {
    const a = localStorage.getItem('wk_aiSettings');
    if (a) {
      const p = JSON.parse(a);
      if (p && typeof p === 'object') {
        Object.assign(aiSettings, p);
      }
    }
  } catch(e) {}
  if (!Array.isArray(aiSettings.techBlocklist)) aiSettings.techBlocklist = [];
  // 選択肢の種入れ（空→埋めるだけ。既存の選択肢は触らない）
  if (_seedTagPresets()) {
    try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
  }
  window.tagSettings = tagSettings;
  window.aiSettings  = aiSettings;
}
loadTagSettings();

// ── クラウド設定を反映 ──
export function applyRemoteSettings(data) {
  if (data.tagSettings && Array.isArray(data.tagSettings) && data.tagSettings.length) {
    tagSettings = data.tagSettings;
    _migrateTagSettings();
    // v52.803 より前に保存された設定には cat / pos の選択肢が入っていない。
    // 当時の画面は辞書（CATEGORIES / POSITIONS）を直接読んでいたので、
    // presets に何も溜まっていなかった。ここで種を入れないと、ログインした
    // 瞬間に空のクラウド設定で上書きされ、選択肢が消えたように見える（v52.813）。
    // 種はその人の動画に付いている値（loadUserData が先に済んでいる）。
    //
    // 足すだけ・空のグループだけ・seeded の印があるものには触らない。
    // ＝ユーザーが意図して空にしたグループは空のまま（tag-seed-check）。
    _seedTagPresets();
    try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
    window.tagSettings = tagSettings;
  }
  // タグのテンプレート。形の合うものだけ入れる。null（＝クラウドにまだ無い）は
  // 何もしない＝こちらのローカルを空で上書きしない。
  if (data.tagTemplates) window.applyRemoteTagTemplates?.(data.tagTemplates);
  if (data.aiSettings && typeof data.aiSettings === 'object') {
    Object.assign(aiSettings, data.aiSettings);
    try { localStorage.setItem('wk_aiSettings', JSON.stringify(aiSettings)); } catch(e) {}
    window.aiSettings = aiSettings;
  }
  if (Array.isArray(data.tagGroups) && data.tagGroups.length) {
    _tagGroups = data.tagGroups;
    try { localStorage.setItem('wk_tagGroups', JSON.stringify(_tagGroups)); } catch(e) {}
  }
  if (data.filterColVis && typeof data.filterColVis === 'object') {
    Object.assign(filterColVis, data.filterColVis);
    try { localStorage.setItem('wk_filterColVis', JSON.stringify(filterColVis)); } catch(e) {}
    window.filterColVis = filterColVis;
    _renderFilterColSettings();
  }
  applyTagVisibility();
  applyTagLabels();
  if (document.getElementById('tag-settings-list')) renderSettings();
}

// ── タグカテゴリのラベルをDOM全体に反映 ──
export function applyTagLabels() {
  tagSettings.forEach(function(tag) {
    document.querySelectorAll('[data-tag-key="' + tag.key + '"]').forEach(function(el) {
      el.textContent = tag.label;
    });
  });
}

// ── 非表示カテゴリを body クラスで制御 ──
export function applyTagVisibility() {
  ['tb','cat','pos','tags'].forEach(key => {
    const ts = tagSettings.find(t => t.key === key);
    document.body.classList.toggle('hide-' + key, ts ? !ts.visible : false);
  });
}

export function renderSettings() {
  // #Tag の presets が空なら動画データから自動収集
  _syncTagPresetsFromVideos();
  // 起動時に動画がまだ無くて種が入らなかったグループを、ここで入れる（空→埋めるだけ）
  if (_seedTagPresets()) saveTagSettings();
  _renderTagDisplaySettings();
  _renderFilterColSettings();
  _renderAiImportSettings();
  window._cvSyncStartupUI?.(); // 起動リスト/範囲のセレクトを現在設定に同期
}

function _syncTagPresetsFromVideos() {
  const ts = tagSettings.find(t => t.key === 'tags');
  if (!ts || ts.presets.length > 0) return; // 既に登録済みならスキップ
  const videos = window.videos || [];
  const all = new Set();
  for (const v of videos) {
    if (Array.isArray(v.tags)) v.tags.forEach(t => { if (t) all.add(t); });
  }
  if (all.size > 0) {
    ts.presets = [...all].sort((a, b) => a.localeCompare(b, 'ja'));
    saveTagSettings();
    console.log(`[settings] #Tag presets に ${ts.presets.length} 件を動画データから収集`);
  }
}

// ═══ タグ設定（案A: 4行 + モーダル）═══
// 設定画面はグループ4行と整理メニューだけ。名前の変更も選択肢の編集も
// 行をタップして開くモーダルの中で完結する（Notion 項目03/04/11/12）。
function _renderTagDisplaySettings() {
  const el = document.getElementById('tag-display-settings'); if (!el) return;

  const row = (key) => {
    const g = tagSettings.find(t => t.key === key);
    const n = tagPresets(key).length;
    const on = g ? g.visible !== false : true;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid var(--border2)">
      <label class="settings-toggle" style="flex-shrink:0">
        <input type="checkbox" ${on?'checked':''} aria-label="表示の切り替え"
          onchange="tagSettings.find(t=>t.key==='${key}').visible=this.checked;saveTagSettings();applyTagVisibility();_renderTagDisplaySettings()">
        <span class="settings-toggle-slider"></span>
      </label>
      <button onclick="openTagEditModal('${key}')"
        style="flex:1;min-width:0;background:none;border:none;text-align:left;padding:10px 0;cursor:pointer;color:inherit;font-family:inherit">
        <div data-user-text="1" style="font-size:14px;font-weight:600;color:${on?'var(--text)':'var(--text3)'}">${_esc(tagLabel(key))}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${n}個${on?'':'・表示していない'}</div>
      </button>
      <button onclick="openTagEditModal('${key}')" aria-label="開く"
        style="background:none;border:none;color:var(--text3);font-size:17px;padding:10px 4px;cursor:pointer;font-family:inherit">›</button>
    </div>`;
  };

  const menu = (label, onclick, danger) => `
    <button onclick="${onclick}"
      style="width:100%;display:flex;align-items:center;gap:8px;background:none;border:none;border-bottom:1px solid var(--border2);
             padding:14px 0;cursor:pointer;font-family:inherit;text-align:left">
      <span style="flex:1;font-size:13px;color:${danger?'#ef4444':'var(--text)'}">${label}</span>
      <span style="color:${danger?'#ef4444':'var(--text3)'};font-size:15px">›</span>
    </button>`;

  // 「重複しているタグを整理」「タグを仕分ける」「禁止リスト」は v52.828 で廃止。
  // タグの種類が固定だった頃／AIがタグを付けていた頃の道具で、推測（名前の部分一致・
  // 組み込みのキーワード一覧）で判定していた。タグはユーザー定義がすべて（オーナー 2026-09-25）。
  el.innerHTML = _TAG_KEYS.map(row).join('')
    + `<div style="font-size:11px;color:var(--text3);margin:14px 0 4px">まとめて整理する</div>`
    + menu('タグを一括削除', "window._openBulkTagDelete()", true);
}
window._renderTagDisplaySettings = _renderTagDisplaySettings;

// ── タグデータ取得ヘルパー ──
// admin-dashboard.js の DEFAULT_TAG_DICT / DEFAULT_POSITIONS をフォールバックに使う
function _getSettingsCategory() {
  try {
    const stored = localStorage.getItem('waza_tag_dict');
    if (stored) { const p = JSON.parse(stored); if (p && p.length) return p; }
  } catch(e) {}
  // フォールバック: tag-master.js の CATEGORIES（常に存在）
  return (window.CATEGORIES || []).map(c => ({
    id: c.id, names: { ja: c.name, en: '' }, desc: c.desc || '', aliases: { ja: c.aliases || [], en: [] }, source: 'system'
  }));
}
function _getSettingsPositions() {
  try {
    const stored = localStorage.getItem('waza_positions');
    if (stored) { const p = JSON.parse(stored); if (p && p.length) return p; }
  } catch(e) {}
  // フォールバック: tag-master.js の POSITIONS（常に存在）
  return (window.POSITIONS || []).map(p => ({
    id: p.id, names: { ja: p.ja, en: p.en }, group: 'guard', aliases: { ja: p.aliases || [], en: [] }, source: 'system'
  }));
}

// ═══ タグ編集モーダル ═══
// ── タググループのモーダル（案A の主役）──
// 名前・選択肢・テンプレート・選択肢に無い値を、この1枚で完結させる。
// 英語表記や説明は辞書（tag-master.js）から引くだけで、一覧の中身は
// ユーザーの選択肢（tagPresets）が決める（Notion 項目03/15）。
function _tagDictInfo(key) {
  const m = new Map();
  if (key === 'pos') {
    _getSettingsPositions().forEach(p => {
      const ja = p.names?.ja; if (ja) m.set(ja, { en: p.names?.en || '', desc: '' });
    });
  } else if (key === 'cat') {
    _getSettingsCategory().forEach(c => {
      const ja = c.names?.ja || c.name; if (ja) m.set(ja, { en: c.names?.en || '', desc: c.desc || '' });
    });
  }
  return m;
}

// 畳んだ状態を覚えておく。モーダルは丸ごと描き直すのでモジュール側に持つ。
let _tmOpen = { opts: false, tpl: false, ghost: false };
let _tmQuery = '';
let _tmTplShow = null;   // 中身を開いているテンプレートの id
let _tmPicks   = [];     // そのテンプレートから入れると選んだ値
let _tmEditId  = null;   // テンプレートそのものを編集中の id（あるとモーダルが編集画面になる）

// モーダルの一時状態を初期に戻す（データには触らない）
function _tmReset() {
  _tmOpen = { opts: false, tpl: false, ghost: false };
  _tmQuery = ''; _tmTplShow = null; _tmPicks = []; _tmEditId = null;
}

window.openTagEditModal = function(key) {
  const overlay = document.getElementById('tag-edit-overlay');
  const modal   = document.getElementById('tag-edit-modal');
  if (!overlay || !modal) return;
  if (_TAG_KEYS.indexOf(key) < 0) return;
  overlay.style.display = 'flex';
  // 別のグループを開いたら、前のグループでの開閉・選択は持ち越さない
  if (key !== _tagModalKey) _tmReset();
  _tagModalKey = key;

  // テンプレートを編集しているあいだは、同じ器が編集画面になる（‹ で戻る）
  if (_tmEditId) { _renderTplEditor(modal, _tmEditId); return; }

  const info    = _tagDictInfo(key);
  const opts    = tagPresets(key);
  const videos  = window.videos || [];
  const have    = new Set(opts);
  // 禁止リストで隠すのはやめた（v52.828）。動画に付いている値は全部ここに出る。
  const ghosts  = [...new Set(videos.flatMap(v => v[key] || []))]
    .filter(t => t && !have.has(t))
    .map(t => ({ name: t, n: videos.filter(v => (v[key] || []).includes(t)).length }))
    .sort((a, b) => b.n - a.n);
  const tpls = (window.tagTemplates ? window.tagTemplates() : []);
  // まだ一度も編集していなければ、テンプレート名はこちらが用意した見本なので訳してよい。
  // 一度でも編集したら、その名前はユーザーのもの＝訳さない（CLAUDE.md の i18n ルール）。
  const _tplUserOwned = !!(window.getTagTemplatesRaw && window.getTagTemplatesRaw());

  // 絞り込みは打つたびに描き直さない（入力欄からフォーカスが飛ぶため）。
  // 全行を出しておいて、_tmFilter が表示を出し入れする。
  const q = (_tmQuery || '').toLowerCase();
  const sorted = [...opts].sort((a, b) => a.localeCompare(b, 'ja'));
  const hitCount = sorted.filter(o => !q || o.toLowerCase().includes(q)).length;

  // 畳んだ見出し。選択肢が58個あっても、開くまでは1行で済む。
  const head = (label, count, openKey) => {
    const on = _tmOpen[openKey];
    return `<button onclick="_tmToggle('${openKey}')"
      style="width:100%;box-sizing:border-box;display:flex;align-items:center;gap:8px;background:var(--surface2);
             border:1.5px solid ${on?'var(--accent)':'var(--border)'};border-radius:8px;padding:12px;cursor:pointer;
             text-align:left;font-family:inherit">
      <span style="flex:1;font-size:14px;color:var(--text)">${label}</span>
      ${count != null ? `<span style="font-size:13px;color:var(--text3)">${count}</span>` : ''}
      <span style="font-size:12px;color:var(--accent)">${on ? '▲' : '▼'}</span>
    </button>`;
  };

  let html = `
    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div data-user-text="1" style="flex:1;min-width:0;font-size:15px;font-weight:800">${_esc(tagLabel(key))}</div>
      <button onclick="closeTagEditModal()" aria-label="閉じる"
        style="background:none;border:none;font-size:19px;cursor:pointer;color:var(--text3);padding:6px 8px;font-family:inherit">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1;padding:14px;display:flex;flex-direction:column;gap:14px">

      <div>
        <label for="tm-name" style="display:block;font-size:11px;color:var(--text3);margin-bottom:6px">このグループの名前</label>
        <input id="tm-name" value="${_esc(tagLabel(key))}" data-user-text="1"
          onchange="renameTagGroup('${key}', this.value); openTagEditModal('${key}')"
          style="width:100%;box-sizing:border-box;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;
                 padding:11px 10px;font-size:15px;color:var(--text);font-family:inherit">
      </div>

      <div>${head('選択肢', opts.length + '個', 'opts')}`;

  if (_tmOpen.opts) {
    html += `<div style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <input id="tm-q" value="${_esc(_tmQuery)}" placeholder="絞り込み..." oninput="_tmFilter(this.value)"
        style="width:100%;box-sizing:border-box;background:var(--surface2);border:none;border-bottom:1px solid var(--border);
               padding:11px 12px;font-size:13px;color:var(--text);font-family:inherit">
      <div style="max-height:240px;overflow-y:auto;background:var(--surface)">`;
    sorted.forEach(o => {
      const en  = info.get(o)?.en || '';
      const hit = !q || o.toLowerCase().includes(q);
      html += `<div data-tm-opt="${_esc(o)}" style="display:flex;align-items:center;gap:8px;padding:0 4px 0 12px;
                 border-bottom:1px solid var(--border2);${hit ? '' : 'display:none'}">
        <span style="flex:1;min-width:0;font-size:13px;padding:12px 0" title="${_esc(en)}">${_esc(o)}</span>
        <button onclick="_tagModalRemove('${key}','${_esc(o)}')" aria-label="削除"
          style="background:none;border:none;color:var(--text3);font-size:16px;padding:12px 10px;cursor:pointer;font-family:inherit">×</button>
      </div>`;
    });
    html += `<div id="tm-none" style="padding:16px 12px;font-size:12px;color:var(--text3);${hitCount ? 'display:none' : ''}">${opts.length ? '見つかりません' : 'まだありません'}</div>`;
    html += `</div>
      <div style="display:flex;gap:7px;padding:10px;background:var(--surface2);border-top:1px solid var(--border)">
        <input id="tm-add" placeholder="選択肢を追加..." onkeydown="if(event.key==='Enter')_tagModalAdd('${key}')"
          style="flex:1;min-width:0;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;
                 padding:10px;font-size:13px;color:var(--text);font-family:inherit">
        <button onclick="_tagModalAdd('${key}')"
          style="padding:10px 16px;border-radius:8px;border:none;background:var(--accent);color:var(--on-accent);
                 font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
      </div>
    </div>`;
  }
  html += `</div>`;

  // ── テンプレートから追加 ──
  // 中身を見ずに押させない。開くと中身が全部出て、入れるものだけを選ぶ。
  // すでに選択肢にある値は「済」で選べない（押しても重複しない）。
  html += `<div>${head('テンプレートから追加', null, 'tpl')}`;
  if (_tmOpen.tpl) {
    html += `<div style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden">`;
    tpls.forEach(t => {
      const shown = _tmTplShow === t.id;
      const dup   = t.values.filter(v => have.has(v)).length;
      html += `<div style="background:var(--surface);border-bottom:1px solid var(--border2)">
        <div style="display:flex;align-items:center;gap:2px;padding:0 4px 0 12px">
          <button onclick="_tmTplPeek('${t.id}')"
            style="flex:1;min-width:0;background:none;border:none;text-align:left;padding:11px 0;cursor:pointer;color:inherit;font-family:inherit">
            <div ${_tplUserOwned ? 'data-user-text="1"' : ''} style="font-size:13px;color:var(--text)">${_esc(t.name)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${t.values.length}個${dup ? `・${dup}個はすでにある` : ''}</div>
          </button>
          <button onclick="_tmTplPeek('${t.id}')" aria-label="中身を見る"
            style="background:none;border:none;color:var(--accent);font-size:12px;padding:12px 8px;cursor:pointer;font-family:inherit">${shown ? '▲' : '▼'}</button>
          <button onclick="_tmTplEdit('${t.id}')" aria-label="このテンプレートを編集"
            style="background:none;border:none;color:var(--text3);font-size:14px;padding:12px 8px;cursor:pointer;font-family:inherit">✎</button>
        </div>`;
      if (shown) {
        html += `<div style="padding:0 12px 12px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">入れるものをタップで選べます</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">`;
        t.values.forEach((v, i) => {
          const has = have.has(v);
          const on  = !has && _tmPicks.includes(v);
          html += `<button onclick="_tmPickVal('${t.id}',${i})" ${has ? 'disabled' : ''}
            style="padding:7px 11px;border-radius:15px;font-family:inherit;font-size:12px;cursor:${has ? 'default' : 'pointer'};
                   border:1px solid ${has ? 'var(--border2)' : (on ? 'var(--accent)' : 'var(--border)')};
                   background:${on ? 'var(--accent)' : 'transparent'};
                   color:${has ? 'var(--text3)' : (on ? 'var(--on-accent)' : 'var(--text)')}">${has ? '済 ' : (on ? '✓ ' : '')}${_esc(v)}</button>`;
        });
        html += `</div>
          <button onclick="_tmTplApply('${key}','${t.id}')" ${_tmPicks.length ? '' : 'disabled'}
            style="margin-top:12px;width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:none;font-family:inherit;
                   font-size:13px;font-weight:700;cursor:${_tmPicks.length ? 'pointer' : 'default'};
                   background:${_tmPicks.length ? 'var(--accent)' : 'var(--surface2)'};
                   color:${_tmPicks.length ? 'var(--on-accent)' : 'var(--text3)'}">${
            _tmPicks.length ? `選んだ${_tmPicks.length}個を追加` : '入れるものを選んでください'}</button>
        </div>`;
      }
      html += `</div>`;
    });
    html += `<button onclick="_tmTplNew()"
      style="width:100%;box-sizing:border-box;background:var(--surface2);border:none;padding:12px;cursor:pointer;
             text-align:left;font-size:13px;color:var(--accent);font-family:inherit">＋ テンプレートを作る</button>`;
    html += `</div>`;
  }
  html += `</div>`;

  if (ghosts.length) {
    html += `<div>${head('選択肢に無い値', ghosts.length + '件', 'ghost')}`;
    if (_tmOpen.ghost) {
      html += `<div style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="padding:9px 12px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:11px;color:var(--text3)">
          ＋で選択肢に戻す / 🗑で動画から削除</div>
        <div style="max-height:200px;overflow-y:auto;background:var(--surface)">`;
      ghosts.forEach(g => {
        html += `<div style="display:flex;align-items:center;gap:4px;padding:0 4px 0 12px;border-bottom:1px solid var(--border2)">
          <span style="flex:1;min-width:0;font-size:13px;color:var(--text2);padding:11px 0">${_esc(g.name)}</span>
          <span style="font-size:11px;color:var(--text3)">${g.n}本</span>
          <button onclick="_tagModalGhostKeep('${key}','${_esc(g.name)}')" aria-label="選択肢に戻す"
            style="background:none;border:none;color:var(--accent);font-size:16px;padding:11px 8px;cursor:pointer;font-family:inherit">＋</button>
          <button onclick="_tagModalGhostDrop('${key}','${_esc(g.name)}',${g.n})" aria-label="動画から削除"
            style="background:none;border:none;color:#ef4444;font-size:13px;padding:11px 8px;cursor:pointer;font-family:inherit">🗑</button>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  modal.innerHTML = html;
};

// 開閉と絞り込み。絞り込みは打つたびに描き直すと入力欄から
// フォーカスが飛ぶので、行の出し入れだけをその場でやる。
window._tmToggle = function(k) {
  _tmOpen[k] = !_tmOpen[k];
  if (k === 'opts' && !_tmOpen.opts) _tmQuery = '';
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};
window._tmFilter = function(v) {
  _tmQuery = v || '';
  const q = _tmQuery.toLowerCase();
  const host = document.getElementById('tag-edit-modal');
  if (!host) return;
  let hit = 0;
  host.querySelectorAll('[data-tm-opt]').forEach(el => {
    const ok = !q || el.dataset.tmOpt.toLowerCase().includes(q);
    el.style.display = ok ? 'flex' : 'none';
    if (ok) hit++;
  });
  const none = document.getElementById('tm-none');
  if (none) none.style.display = hit ? 'none' : '';
};

let _tagModalKey = null;

// 選択肢の追加・削除の実体。
// 選択肢の正は tagSettings.presets（項目03）。辞書側（waza_tag_dict / waza_positions）は
// 英語表記や別名を持つ検索用で別物だが、名前がずれると混乱するので同じ名前を足し引きする。
function _addTagFromModalValue(key, v) {
  const ts = tagSettings.find(x => x.key === key);
  if (!ts) return;
  if (!Array.isArray(ts.presets)) ts.presets = [];
  if (!ts.presets.includes(v)) { ts.presets.push(v); ts.seeded = true; saveTagSettings(); }
  if (key === 'cat') {
    const cats = _getSettingsCategory();
    if (!cats.find(c => (c.names?.ja || c.name) === v)) {
      cats.push({ id: 'u_cat_' + Date.now(), names: { ja: v, en: '' }, desc: '', aliases: { ja: [], en: [] }, source: 'user' });
      try { localStorage.setItem('waza_tag_dict', JSON.stringify(cats)); } catch(e) {}
      _syncWindowCats();
    }
  } else if (key === 'pos') {
    const ps = _getSettingsPositions();
    if (!ps.find(p => p.names?.ja === v)) {
      ps.push({ id: 'u_pos_' + Date.now(), names: { ja: v, en: '' }, group: 'other', aliases: { ja: [], en: [] }, source: 'user' });
      try { localStorage.setItem('waza_positions', JSON.stringify(ps)); } catch(e) {}
      _syncWindowPositions();
    }
  }
}

function _removeTagFromModalValue(key, name) {
  const ts = tagSettings.find(x => x.key === key);
  if (ts && Array.isArray(ts.presets)) {
    const next = ts.presets.filter(p => p !== name);
    if (next.length !== ts.presets.length) { ts.presets = next; saveTagSettings(); }
  }
  if (key === 'cat') {
    const cats = _getSettingsCategory().filter(c => (c.names?.ja || c.name) !== name);
    try { localStorage.setItem('waza_tag_dict', JSON.stringify(cats)); } catch(e) {}
    _syncWindowCats();
  } else if (key === 'pos') {
    const ps = _getSettingsPositions().filter(p => p.names?.ja !== name);
    try { localStorage.setItem('waza_positions', JSON.stringify(ps)); } catch(e) {}
    _syncWindowPositions();
  }
}

// グループ名の変更。空にはできない（空だと見出しが消えて操作できなくなる）。
export function renameTagGroup(key, name) {
  const t = tagSettings.find(x => x.key === key);
  if (!t) return;
  const v = String(name == null ? '' : name).trim();
  if (!v) { window.toast?.('名前は空にできません'); return; }
  if (v === t.label) return;
  t.label = v;
  saveTagSettings();
  applyTagLabels();
  _renderTagDisplaySettings();
  window.toast?.(`グループ名を「${v}」にしました`);
}

// 整理メニュー。同じモーダルの器を使い回す。
function _openPanel(title, fill) {
  const overlay = document.getElementById('tag-edit-overlay');
  const modal   = document.getElementById('tag-edit-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="flex:1;font-size:15px;font-weight:800">${title}</div>
      <button onclick="closeTagEditModal()" aria-label="閉じる"
        style="background:none;border:none;font-size:19px;cursor:pointer;color:var(--text3);padding:6px 8px;font-family:inherit">✕</button>
    </div>
    <div id="tag-panel-body" style="overflow-y:auto;flex:1;padding:16px"></div>`;
  const body = document.getElementById('tag-panel-body');
  if (body) fill(body);
}
window._openBulkTagDelete = () => _openPanel('🗑 タグの一括削除', _renderBulkTagDeleteSection);



// 選択肢を足す。辞書側（cat/pos）にも同じ名前で足して食い違わせない。
window._tagModalAdd = function(key) {
  const inp = document.getElementById('tm-add');
  const v = (inp?.value || '').trim();
  if (!v) return;
  if (tagPresets(key).includes(v)) { window.toast?.('すでにあります'); return; }
  _addTagFromModalValue(key, v);
  openTagEditModal(key);
};

window._tagModalRemove = function(key, name) {
  _removeTagFromModalValue(key, name);
  openTagEditModal(key);
};

// ═══ テンプレートから追加 ═══
// 中身を見てから、入れるものを選んで足す。押しただけで丸ごと入ることはない。

// 中身を開く／閉じる。開いた時点で「まだ無い値」だけを選んだ状態にしておく。
window._tmTplPeek = function(id) {
  if (_tmTplShow === id) { _tmTplShow = null; _tmPicks = []; }
  else {
    const t = window.tagTemplate ? window.tagTemplate(id) : null;
    const have = new Set(tagPresets(_tagModalKey));
    _tmTplShow = id;
    _tmPicks = t ? t.values.filter(v => !have.has(v)) : [];
  }
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

// 値をタップで選ぶ／外す。すでに選択肢にある値は選べない（重複させない）。
window._tmPickVal = function(id, i) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t) return;
  const v = t.values[i];
  if (!v) return;
  if (tagPresets(_tagModalKey).includes(v)) return;   // 済は触らせない
  _tmPicks = _tmPicks.includes(v) ? _tmPicks.filter(x => x !== v) : _tmPicks.concat([v]);
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

// 選んだぶんだけ足す。既存の選択肢は1つも消さない（足すだけ）。
window._tmTplApply = function(key, id) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t || !_tmPicks.length) return;
  const ts = tagSettings.find(x => x.key === key);
  if (!ts) return;
  if (!Array.isArray(ts.presets)) ts.presets = [];
  const picks = _tmPicks.slice();
  let added = 0;
  picks.forEach(v => {
    if (!v || ts.presets.includes(v)) return;   // 念のためもう一度重複を見る
    ts.presets.push(v); added++;
  });
  if (added) { ts.seeded = true; saveTagSettings(); }
  _tmTplShow = null; _tmPicks = [];
  openTagEditModal(key);
  _renderTagDisplaySettings();
  window.toast?.(`「${t.name}」から ${added}件 を追加しました`);
};

// ═══ テンプレートそのものを編集 ═══
// 同じモーダルの器が編集画面になる。‹ で元のグループへ戻る。
function _renderTplEditor(modal, id) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t) { _tmEditId = null; return; }
  let html = `
    <div style="display:flex;align-items:center;gap:4px;padding:13px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
      <button onclick="_tmTplBack()" aria-label="戻る"
        style="background:none;border:none;color:var(--accent);font-size:20px;padding:6px 8px;cursor:pointer;font-family:inherit">‹</button>
      <div style="flex:1;font-size:15px;font-weight:800">テンプレートを編集</div>
    </div>
    <div style="overflow-y:auto;flex:1;padding:14px;display:flex;flex-direction:column;gap:14px">
      <div>
        <label for="tm-tpl-name" style="display:block;font-size:11px;color:var(--text3);margin-bottom:6px">テンプレートの名前</label>
        <input id="tm-tpl-name" value="${_esc(t.name)}" data-user-text="1"
          onchange="_tmTplRename('${t.id}', this.value)"
          style="width:100%;box-sizing:border-box;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;
                 padding:11px 10px;font-size:15px;color:var(--text);font-family:inherit">
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">中身 ${t.values.length}個</div>
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
          <div style="max-height:300px;overflow-y:auto;background:var(--surface)">`;
  t.values.forEach((v, i) => {
    html += `<div style="display:flex;align-items:center;gap:8px;padding:0 4px 0 12px;border-bottom:1px solid var(--border2)">
      <span style="flex:1;min-width:0;font-size:13px;padding:12px 0">${_esc(v)}</span>
      <button onclick="_tmTplDelVal('${t.id}',${i})" aria-label="削除"
        style="background:none;border:none;color:var(--text3);font-size:16px;padding:12px 10px;cursor:pointer;font-family:inherit">×</button>
    </div>`;
  });
  if (!t.values.length) html += `<div style="padding:16px 12px;font-size:12px;color:var(--text3)">まだありません</div>`;
  html += `</div>
          <div style="display:flex;gap:7px;padding:10px;background:var(--surface2);border-top:1px solid var(--border)">
            <input id="tm-tpl-add" placeholder="中身を追加..." onkeydown="if(event.key==='Enter')_tmTplAddVal('${t.id}')"
              style="flex:1;min-width:0;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;
                     padding:10px;font-size:13px;color:var(--text);font-family:inherit">
            <button onclick="_tmTplAddVal('${t.id}')"
              style="padding:10px 16px;border-radius:8px;border:none;background:var(--accent);color:var(--on-accent);
                     font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
          </div>
        </div>
      </div>
      <button onclick="_tmTplDelete('${t.id}')"
        style="align-self:flex-start;padding:9px 14px;border-radius:8px;border:1px solid #ef4444;background:none;
               color:#ef4444;font-size:12px;cursor:pointer;font-family:inherit">このテンプレートを削除</button>
    </div>`;
  modal.innerHTML = html;
}

window._tmTplEdit = function(id) { _tmEditId = id; if (_tagModalKey) openTagEditModal(_tagModalKey); };
window._tmTplBack = function() { _tmEditId = null; _tmTplShow = null; _tmPicks = []; if (_tagModalKey) openTagEditModal(_tagModalKey); };

window._tmTplNew = function() {
  if (!window.tagTemplateCreate) return;
  _tmEditId = window.tagTemplateCreate('新しいテンプレート');
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

window._tmTplRename = function(id, name) {
  const v = String(name == null ? '' : name).trim();
  if (!v) { window.toast?.('名前は空にできません'); }
  else if (window.tagTemplateRename?.(id, v)) window.toast?.(`テンプレート名を「${v}」にしました`);
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

window._tmTplAddVal = function(id) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t) return;
  const v = (document.getElementById('tm-tpl-add')?.value || '').trim();
  if (!v) return;
  if (t.values.includes(v)) { window.toast?.('すでにあります'); return; }
  window.tagTemplateSetValues?.(id, t.values.concat([v]));
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

window._tmTplDelVal = function(id, i) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t || !t.values[i]) return;
  window.tagTemplateSetValues?.(id, t.values.filter((x, k) => k !== i));
  if (_tagModalKey) openTagEditModal(_tagModalKey);
};

// テンプレートを消しても、すでに選択肢に入れたものは残る（見本を消すだけ）。
window._tmTplDelete = function(id) {
  const t = window.tagTemplate ? window.tagTemplate(id) : null;
  if (!t) return;
  if (!window.confirm(`テンプレート「${t.name}」を削除します。\n`
    + 'すでに選択肢に入れたものは消えません。\n\n続けますか？')) return;
  window.tagTemplateDelete?.(id);
  _tmEditId = null; _tmTplShow = null; _tmPicks = [];
  if (_tagModalKey) openTagEditModal(_tagModalKey);
  window.toast?.(`テンプレート「${t.name}」を削除しました`);
};

window._tagModalGhostKeep = function(key, name) {
  _addTagFromModalValue(key, name);
  openTagEditModal(key);
};

// 動画から消す。取り消せないので件数を見せて確認する（Notion 項目11）。
window._tagModalGhostDrop = function(key, name, n) {
  // この値を条件に使っているカスタムリストがあれば、確認文で知らせる（Notion 確認事項02）
  const cvNote = window._cvTagUsageNote?.([name], [key], 'delete') || '';
  if (!window.confirm(`「${name}」を動画 ${n}件 から削除します。\n`
    + 'この操作は取り消せません。全デバイスに反映されます。' + cvNote + '\n\n続けますか？')) return;
  let hit = 0;
  (window.videos || []).forEach(v => {
    if (v[key]?.length && v[key].includes(name)) { v[key] = v[key].filter(x => x !== name); hit++; }
  });
  window.debounceSave?.();
  window.AF?.();
  openTagEditModal(key);
  window.toast?.(`🗑 「${name}」を動画 ${hit}件 から削除しました`);
};

window.closeTagEditModal = function() {
  const overlay = document.getElementById('tag-edit-overlay');
  if (overlay) overlay.style.display = 'none';
  _tmReset();
  _tagModalKey = null;
};

window._filterTagModal = function() {
  const q = (document.getElementById('tag-modal-search')?.value || '').toLowerCase();
  document.querySelectorAll('.tag-modal-item').forEach(el => {
    const name = (el.dataset.name || '').toLowerCase();
    el.style.display = name.includes(q) ? '' : 'none';
  });
};

window._addTagFromModal = function(type) {
  const input = document.getElementById('tag-modal-add-input');
  const val = (input?.value || '').trim();
  if (!val) return;

  if (type === 'tb') {
    const ts = tagSettings.find(t => t.key === 'tb');
    if (ts && !ts.presets.includes(val)) {
      ts.presets.push(val);
      saveTagSettings();
    }
  } else if (type === 'cat') {
    const cats = _getSettingsCategory();
    if (!cats.find(c => (c.names?.ja || c.name) === val)) {
      const newId = 'u_cat_' + Date.now();
      cats.push({ id: newId, names: { ja: val, en: '' }, desc: '', aliases: { ja: [], en: [] }, source: 'user' });
      try { localStorage.setItem('waza_tag_dict', JSON.stringify(cats)); } catch(e) {}
    }
    _syncWindowCats();
    _presetAdd('cat', val);
  } else if (type === 'pos') {
    const positions = _getSettingsPositions();
    if (!positions.find(p => (p.names?.ja) === val)) {
      const newId = 'u_pos_' + Date.now();
      positions.push({ id: newId, names: { ja: val, en: '' }, group: 'other', aliases: { ja: [], en: [] }, source: 'user' });
      try { localStorage.setItem('waza_positions', JSON.stringify(positions)); } catch(e) {}
    }
    _syncWindowPositions();
    _presetAdd('pos', val);
  } else if (type === 'tags') {
    const ts = tagSettings.find(t => t.key === 'tags');
    if (ts && !ts.presets.includes(val)) {
      ts.presets.push(val);
      saveTagSettings();
    }
  }

  // Re-render modal and settings row
  openTagEditModal(type);
  _renderTagDisplaySettings();
  const newInput = document.getElementById('tag-modal-add-input');
  if (newInput) newInput.value = '';
};

window._deleteTagFromModal = function(type, idOrName) {
  if (type === 'tb') {
    const ts = tagSettings.find(t => t.key === 'tb');
    if (ts) {
      ts.presets = ts.presets.filter(p => p !== idOrName);
      saveTagSettings();
    }
  } else if (type === 'cat') {
    const cats = _getSettingsCategory();
    const gone = cats.find(c => (c.id || c.names?.ja || c.name) === idOrName);
    const filtered = cats.filter(c => (c.id || c.names?.ja || c.name) !== idOrName);
    try { localStorage.setItem('waza_tag_dict', JSON.stringify(filtered)); } catch(e) {}
    _syncWindowCats();
    _presetRemove('cat', gone ? (gone.names?.ja || gone.name) : idOrName);
  } else if (type === 'pos') {
    const positions = _getSettingsPositions();
    const goneP = positions.find(p => (p.id || p.names?.ja) === idOrName);
    const filtered = positions.filter(p => (p.id || p.names?.ja) !== idOrName);
    try { localStorage.setItem('waza_positions', JSON.stringify(filtered)); } catch(e) {}
    _syncWindowPositions();
    _presetRemove('pos', goneP ? goneP.names?.ja : idOrName);
  } else if (type === 'tags') {
    const ts = tagSettings.find(t => t.key === 'tags');
    if (ts) {
      ts.presets = ts.presets.filter(p => p !== idOrName);
      saveTagSettings();
    }
  }
  openTagEditModal(type);
  _renderTagDisplaySettings();
};

// ═══ 旧「テクニックの見出し」（tagGroups）═══
// タグ4の候補を「ガード系」などの見出しで分けて並べる機能。v52.833 で廃止（オーナー 2026-09-25）。
// 見出しを作る旧 #Tag モーダル（_openTagsNewModal）は呼び出し元が無く、画面から開けなかった。
// モーダルごと消し、候補の一覧も見出しで区切らずに並べる。
//
// ただし保存済みの中身は消さない。saveUserSettings は設定docを丸ごと .set するので、
// ここが空を返すと、クラウドの見出しが全デバイスから消える（非空→空の上書き）。
// 以前と同じく、クラウドから読んだもの（applyRemoteSettings）をそのまま返すだけ。
let _tagGroups = [];
window.getTagGroups = () => _tagGroups;

// ═══ AI取込設定（簡素化） ═══
// 取り込み・チャプターの設定。
// AIタグ判定は v52.806 で廃止したので（Notion 項目01/13）、ここはチャプター関連だけ。
// 以前は全体が「AIタグ機能」のトグルで囲われていて、タグを切るとチャプター設定まで
// 操作できなくなっていた。その囲いも外した。
function _renderAiImportSettings() {
  const el = document.getElementById('ai-settings-section'); if (!el) return;
  const s = aiSettings;

  const toggleHtml = (prop, label, desc) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">${label}</div>
        ${desc?`<div style="font-size:11px;color:var(--text3)">${desc}</div>`:''}
      </div>
      <label class="settings-toggle">
        <input type="checkbox" ${s[prop]?'checked':''} onchange="aiSettings.${prop}=this.checked;saveAiSettings();_renderAiImportSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>`;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      ${toggleHtml('fetchChaptersOnImport', 'チャプター取得', 'YouTubeの説明文からタイムスタンプを解析')}
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">自動チャプターの粒度</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Drive動画の「📑 自動チャプター」でどれくらい細かく区切るか</div>
        <div style="display:flex;gap:6px">
          ${[['fine','細かめ','1本の技ごと'],['normal','ふつう','標準'],['coarse','大きめ','章のかたまりで']].map(([v,label,desc])=>`
            <button onclick="aiSettings.chapterGrain='${v}';saveAiSettings();_renderAiImportSettings()"
              style="flex:1;padding:6px 4px;border-radius:8px;border:1.5px solid ${s.chapterGrain===v?'var(--accent)':'var(--border)'};
                     font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
                     background:${s.chapterGrain===v?'var(--accent)':'var(--surface2)'};color:${s.chapterGrain===v?'#fff':'var(--text2)'}">
              ${label}<div style="font-size:9.5px;font-weight:400;opacity:.85;margin-top:1px">${desc}</div>
            </button>`).join('')}
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:5px">貼り付けた一覧から作る時は、その通りに区切ります</div>
      </div>
    </div>`;
}
// expose for inline onchange
window._renderAiImportSettings = _renderAiImportSettings;

// 案A では選択肢の編集はモーダルの中だけ。この関数は呼び出し元が多いので、
// 設定画面を描き直す入口として残す（中身の重複表示は v52.812 で廃止）。
export function renderTagSettingsList() {
  _renderTagDisplaySettings();
}

// タグの一括削除（Notion 項目12）。
// AI自動タグ付けは廃止したが、既に動画に付いた値は残る。それを消すかどうかは
// ユーザーが決めること。システムが勝手に空にする経路は作らない（CLAUDE.md ルール1）。
//
// 安全のための決まり:
//   ・どのグループを消すか選ばせる。グループ名はユーザーが付けたものを使う
//   ・自分で付けた自由タグ（tags）は既定で外す
//   ・対象の本数を見せて確認する
//   ・実行前に必ずバックアップを書き出す
//   ・実行後も toastUndo で取り消せるようにする
function _renderBulkTagDeleteSection(parent) {
  const videos = window.videos || [];
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;';

  const head = document.createElement('div');
  head.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:2px';
  head.textContent = '🗑 タグの一括削除';
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:11px;color:var(--text3);margin-bottom:8px';
  desc.textContent = '選んだグループのタグを、全部の動画から外します。取り消せます。';
  card.appendChild(head); card.appendChild(desc);

  const rows = document.createElement('div');
  rows.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:8px';
  _TAG_KEYS.forEach(function(key) {
    const n = videos.filter(v => (v[key] || []).length).length;
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text2);cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.key = key;
    cb.disabled = n === 0;
    // tags は自分で付けた自由タグなので既定で外す
    cb.checked = false;
    const nm = document.createElement('span');
    nm.setAttribute('data-user-text', '1');
    nm.textContent = tagLabel(key);
    const cnt = document.createElement('span');
    cnt.style.cssText = 'color:var(--text3)';
    cnt.textContent = `（${n}本）`;
    lab.appendChild(cb); lab.appendChild(nm); lab.appendChild(cnt);
    if (key === 'tags') {
      const note = document.createElement('span');
      note.style.cssText = 'color:var(--text3);font-size:10px';
      note.textContent = '自分で付けたタグ';
      lab.appendChild(note);
    }
    rows.appendChild(lab);
  });
  card.appendChild(rows);

  const btn = document.createElement('button');
  btn.textContent = 'バックアップを書き出してから削除';
  btn.style.cssText = 'padding:5px 14px;border-radius:6px;border:1.5px solid #ef4444;background:var(--surface);color:#ef4444;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit';
  btn.onclick = function() { _bulkTagDelete(rows); };
  card.appendChild(btn);
  parent.appendChild(card);
}

async function _bulkTagDelete(rows) {
  const keys = [...rows.querySelectorAll('input[type=checkbox]')]
    .filter(cb => cb.checked).map(cb => cb.dataset.key);
  if (!keys.length) { window.toast?.('消すグループを選んでください'); return; }

  const videos = window.videos || [];
  const hit = videos.filter(v => keys.some(k => (v[k] || []).length));
  if (!hit.length) { window.toast?.('対象の動画がありません'); return; }
  const names = keys.map(k => tagLabel(k)).join('・');

  // 1) まずバックアップ。書き出せなければ削除しない。
  if (typeof window.wazaExportLight !== 'function') {
    window.alert('バックアップを書き出せないため中止します。');
    return;
  }
  // このグループに条件を持つカスタムリストがあれば知らせる（Notion 確認事項02）
  const cvNote = window._cvTagUsageNote?.(null, keys, 'delete') || '';
  if (!window.confirm(`「${names}」を動画 ${hit.length}本 から外します。` + cvNote + '\n\n'
    + 'まずバックアップのファイルを書き出します。\n続けますか？')) return;
  try { await window.wazaExportLight(); }
  catch (e) { window.alert('バックアップに失敗したので中止しました。\n' + e); return; }

  // 2) バックアップを取ったうえで、もう一度確認する
  if (!window.confirm(`バックアップを書き出しました。\n\n`
    + `「${names}」を動画 ${hit.length}本 から外します。\n`
    + '全デバイスに反映されます。続けますか？')) return;

  // 3) 取り消せるように、消す前の値を控える
  const undo = hit.map(v => ({ v, before: Object.fromEntries(keys.map(k => [k, [...(v[k] || [])]])) }));
  let removed = 0;
  hit.forEach(function(v) {
    keys.forEach(function(k) { removed += (v[k] || []).length; v[k] = []; });
  });
  window.debounceSave?.();
  window.AF?.();
  renderTagSettingsList();
  window.toastUndo
    ? window.toastUndo(`🗑 ${hit.length}本から ${removed}件 のタグを外しました`, function() {
        undo.forEach(({ v, before }) => { Object.keys(before).forEach(k => { v[k] = before[k]; }); });
        window.debounceSave?.();
        window.AF?.();
        renderTagSettingsList();
      })
    : window.toast?.(`🗑 ${hit.length}本から ${removed}件 のタグを外しました`);
}

export function renderTagVisibilityBtns() {
  const el = document.getElementById('tag-visibility-btns'); if (!el) return;
  el.innerHTML = '';
  tagSettings.forEach(function(tag, i) {
    const btn = document.createElement('button');
    btn.style.cssText = `padding:5px 14px;border-radius:20px;border:1.5px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;background:${tag.visible?'var(--text)':'var(--surface2)'};color:${tag.visible?'#fff':'var(--text2)'};`;
    btn.textContent = tag.label;
    btn.onclick = function() {
      tagSettings[i].visible = !tagSettings[i].visible;
      saveTagSettings();
      applyTagVisibility();
      renderTagVisibilityBtns();
      renderTagSettingsList();
    };
    el.appendChild(btn);
  });
}


// HTML に埋める文字の最小限のエスケープ（タグ設定のモーダル等で使う）
function _esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══ 外観設定（テーマ・フォントサイズ） ═══

let _appearanceSettings = { theme: 'auto', fontScale: 1 };
let _mediaListener = null;

export function loadAppearanceSettings() {
  try {
    const s = localStorage.getItem('wk_appearance');
    if (s) Object.assign(_appearanceSettings, JSON.parse(s));
  } catch(e) {}
  applyAppearance();
}

export function saveAppearanceSettings() {
  // テーマ・フォントサイズはデバイスごとに記憶（Firebase同期しない）
  try { localStorage.setItem('wk_appearance', JSON.stringify(_appearanceSettings)); } catch(e) {}
}

export function applyAppearance() {
  // Theme (auto / light / dark)
  const mode = _appearanceSettings.theme || 'auto';
  let isDark;
  if (mode === 'auto') {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // OS設定変更時にリアルタイム追従
    if (!_mediaListener) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      _mediaListener = () => { if (_appearanceSettings.theme === 'auto') applyAppearance(); };
      mq.addEventListener('change', _mediaListener);
    }
  } else {
    isDark = mode === 'dark';
  }

  // テーマ切替時のスムーズトランジション
  document.body.classList.add('theme-changing');
  document.body.classList.toggle('dark', isDark);
  requestAnimationFrame(() => {
    setTimeout(() => document.body.classList.remove('theme-changing'), 400);
  });

  // 3-way セレクタ同期
  ['auto','light','dark'].forEach(v => {
    const el = document.getElementById('theme-opt-' + v);
    if (el) el.classList.toggle('active', v === mode);
  });

  // Font scale (zoom approach — works with hardcoded px values)
  const scale = _appearanceSettings.fontScale || 1;
  document.body.style.zoom = scale;
  [35,38,40,46,50,55,60,65,70,80,85,90,100].forEach(function(n){
    document.documentElement.style.setProperty('--zvh-'+n, (n/scale).toFixed(4)+'vh');
  });
  const slider = document.getElementById('setting-fontscale');
  if (slider) slider.value = scale;
  const label = document.getElementById('font-scale-label');
  if (label) label.textContent = Math.round(scale * 100) + '%';
}

export function setTheme(mode) {
  _appearanceSettings.theme = mode;
  applyAppearance();
  saveAppearanceSettings();
}

// 後方互換
export function toggleTheme() {
  const modes = ['auto', 'light', 'dark'];
  const cur = modes.indexOf(_appearanceSettings.theme);
  setTheme(modes[(cur + 1) % 3]);
}

export function setFontScale(val) {
  const v = Math.max(0.8, Math.min(1.4, parseFloat(val) || 1));
  _appearanceSettings.fontScale = v;
  applyAppearance();
  saveAppearanceSettings();
}

export function adjustFontScale(delta) {
  const cur = _appearanceSettings.fontScale || 1;
  setFontScale(Math.round((cur + delta) * 100) / 100);
}

export function getAppearanceSettings() { return { ..._appearanceSettings }; }

export function applyRemoteAppearance(data) {
  if (data && data.appearance && typeof data.appearance === 'object') {
    Object.assign(_appearanceSettings, data.appearance);
    try { localStorage.setItem('wk_appearance', JSON.stringify(_appearanceSettings)); } catch(e) {}
    applyAppearance();
  }
}

// 初期読み込み
loadAppearanceSettings();

// ══ フィルターカラム表示設定 ══
export let filterColVis = { mark: true, status: true, rank: true };
(function _loadFilterColVis() {
  try {
    const s = localStorage.getItem('wk_filterColVis');
    if (s) Object.assign(filterColVis, JSON.parse(s));
  } catch(e) {}
  window.filterColVis = filterColVis;
})();

export function saveFilterColVis() {
  try { localStorage.setItem('wk_filterColVis', JSON.stringify(filterColVis)); } catch(e) {}
  window.filterColVis = filterColVis;
  window.saveUserSettings?.();
  // カードビューを即時再描画
  window.AF?.();
  // Organizeビューが開いていれば再描画
  if (document.getElementById('organizeTab')?.classList.contains('active')) {
    window.renderOrg?.();
    window.syncOrgColHeaders?.();
  }
}

function _renderFilterColSettings() {
  const el = document.getElementById('filter-col-settings'); if (!el) return;
  const items = [
    { key: 'mark',   label: 'マーク',   desc: 'お気に入り・ブックマーク・Next など' },
    { key: 'status', label: '習得',     desc: '習得度（手動設定: 未着手 / 理解 / 練習中 / マスター）' },
    { key: 'rank',   label: 'カウント', desc: '練習回数・最終カウント日' },
  ];
  el.innerHTML = items.map(item => `
    <div style="display:flex;align-items:center;gap:12px">
      <label class="settings-toggle">
        <input type="checkbox" ${filterColVis[item.key]!==false?'checked':''}
          onchange="filterColVis['${item.key}']=this.checked;saveFilterColVis()">
        <span class="settings-toggle-slider"></span>
      </label>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${item.label}</div>
        <div style="font-size:10px;color:var(--text3)">${item.desc}</div>
      </div>
    </div>`).join('');
}

// ══ window.CATEGORIES / window.POSITIONS 同期ヘルパー ══
// admin-dashboard や settings でカテゴリ/ポジションを追加・削除した後に呼ぶ。
// localStorage の保存形式（{names:{ja,en}}）を tag-master.js 互換形式に変換して
// window.CATEGORIES / window.POSITIONS を上書きする。

function _syncWindowCats() {
  try {
    const stored = localStorage.getItem('waza_tag_dict');
    if (stored) {
      const cats = JSON.parse(stored);
      if (Array.isArray(cats) && cats.length) {
        // カテゴリ名の日英表記は SEARCH_DICT（検索辞書の1枚）が持つので、ここでは扱わない。
        window.CATEGORIES = cats.map(c => ({
          id:      c.id || '',
          name:    c.names?.ja || c.name || '',
          desc:    c.desc || '',
          aliases: [
            ...(Array.isArray(c.aliases?.ja) ? c.aliases.ja : []),
            ...(Array.isArray(c.aliases?.en) ? c.aliases.en : []),
            ...(Array.isArray(c.aliases)     ? c.aliases    : []),
          ],
        }));
      }
    }
  } catch(e) {}
}

function _syncWindowPositions() {
  try {
    const stored = localStorage.getItem('waza_positions');
    if (stored) {
      const positions = JSON.parse(stored);
      if (Array.isArray(positions) && positions.length) {
        window.POSITIONS = positions.map(p => ({
          id:      p.id || '',
          ja:      p.names?.ja || p.ja || '',
          en:      p.names?.en || p.en || '',
          aliases: [
            ...(Array.isArray(p.aliases?.ja) ? p.aliases.ja : []),
            ...(Array.isArray(p.aliases?.en) ? p.aliases.en : []),
            ...(Array.isArray(p.aliases)     ? p.aliases    : []),
          ],
        }));
      }
    }
  } catch(e) {}
}

// 他モジュール（admin-dashboard.js 等）から呼べるよう公開
window.syncCatsFromStorage      = _syncWindowCats;
window.syncPositionsFromStorage = _syncWindowPositions;

// ページ読み込み時に localStorage からの差分を反映
_syncWindowCats();
_syncWindowPositions();
