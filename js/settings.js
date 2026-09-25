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
//                    ※ 呼び出し元の無い旧 #Tag モーダル（_openTagsNewModal）にだけ参照が残っている
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

// ═══ #Tag モーダル（新版: 2タブ / グループ管理） ═══

// ── 状態 ──
let _tagGroups = [];
let _tagAliasData = {};
let _tagsModalTab = 'list';
const _tagsOpenGroups = new Set(['unc']);
let _tagsDragItem = null;
let _tagsEditingTag = null;   // インライン編集中のタグ名
let _tagsEditingGrp = null;   // インライン編集中のグループID

// AI 割り当て提案（localStorage 永続化）— 形式: [{id, tag, group}]
let _aiAssignProposals = [];
let _aiGroupGenerating = false;
function _loadAiGroupProposals() {
  try {
    const s = localStorage.getItem('wk_aiAssignProposals');
    if (s) {
      const parsed = JSON.parse(s);
      // 新形式 {id, tag, group} のみ受け入れる
      _aiAssignProposals = Array.isArray(parsed) && (!parsed[0] || parsed[0].tag) ? parsed : [];
    }
  } catch(e) {}
}
function _saveAiGroupProposals() {
  try { localStorage.setItem('wk_aiAssignProposals', JSON.stringify(_aiAssignProposals)); } catch(e) {}
}

// ── データ永続化 ──
function _loadTagGroups() {
  try { const g = localStorage.getItem('wk_tagGroups'); if (g) _tagGroups = JSON.parse(g); } catch(e) { _tagGroups = []; }
  try { const a = localStorage.getItem('wk_tagAliases'); if (a) _tagAliasData = JSON.parse(a); } catch(e) { _tagAliasData = {}; }
}
function _saveTagGroups() {
  try { localStorage.setItem('wk_tagGroups', JSON.stringify(_tagGroups)); } catch(e) {}
  window.saveUserSettings?.();
}
function _saveTagAliases() {
  try { localStorage.setItem('wk_tagAliases', JSON.stringify(_tagAliasData)); } catch(e) {}
}
function _getTagAliasEntry(tagName) {
  if (!_tagAliasData[tagName]) _tagAliasData[tagName] = { aliases: [], aiSuggested: [] };
  return _tagAliasData[tagName];
}

// ── タグ収集（モーダル表示時にライブラリをスキャン） ──
function _getAllKnownTagsForModal() {
  const ts = tagSettings.find(t => t.key === 'tags');
  const presets = new Set(ts?.presets || []);
  const blocked = new Set(aiSettings.techBlocklist || []);
  const fromLib = new Set();
  (window.videos || []).forEach(v => { (v.tags||[]).forEach(t => { if (t && !blocked.has(t)) fromLib.add(t); }); });
  return { allTags: new Set([...presets, ...fromLib]), blocked };
}
function _getUncategorizedTags() {
  const { allTags } = _getAllKnownTagsForModal();
  const inGroup = new Set(_tagGroups.flatMap(g => g.techNames));
  return [...allTags].filter(t => !inGroup.has(t)).sort((a, b) => a.localeCompare(b, 'ja'));
}

// ── tagGroups を外部（Firebase）から読み書きできるよう公開 ──
window.getTagGroups = () => _tagGroups;

// ── エントリーポイント ──
function _openTagsNewModal() {
  _loadTagGroups();
  _loadAiGroupProposals();
  _tagsEditingTag = null;
  _tagsEditingGrp = null;
  _tagsModalTab = 'list';
  _renderTagsNewModal();
}

// ── メインレンダラー ──
function _renderTagsNewModal() {
  const modal = document.getElementById('tag-edit-modal');
  if (!modal) return;
  // スクロール位置を保持
  const _savedScroll = document.getElementById('tags-modal-body')?.scrollTop ?? 0;
  const _e = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const _js = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const t = _tagsModalTab;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 0;flex-shrink:0">
      <div style="font-size:14px;font-weight:800">テクニック</div>
      <button onclick="closeTagEditModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3);padding:2px 6px">✕</button>
    </div>
    <div style="display:flex;align-items:center;padding:0 18px;border-bottom:1px solid var(--border2);flex-shrink:0;margin-top:2px">
      <button onclick="_tagsSetTab('list')"
        style="flex:1;background:none;border:none;border-bottom:2px solid ${t==='list'?'var(--accent)':'transparent'};
               color:${t==='list'?'var(--text)':'var(--text3)'};font-size:12px;font-weight:${t==='list'?700:400};
               padding:10px 0;cursor:pointer;font-family:inherit">タグ一覧</button>
      <button onclick="_tagsSetTab('dict')"
        style="flex:1;background:none;border:none;border-bottom:2px solid ${t==='dict'?'var(--accent)':'transparent'};
               color:${t==='dict'?'var(--text)':'var(--text3)'};font-size:12px;font-weight:${t==='dict'?700:400};
               padding:10px 0;cursor:pointer;font-family:inherit;display:none">辞書</button>
    </div>
    <div id="tags-modal-body" style="overflow-y:auto;flex:1;padding:0"></div>
    ${t==='list'?`<div style="padding:10px 18px;border-top:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:6px">
        <input id="tags-add-grp-input" placeholder="グループ名を追加…"
          style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                 padding:7px 10px;font-size:12px;font-family:inherit;outline:none;color:var(--text)"
          onkeydown="if(event.key==='Enter')_addTagGroup()">
        <button onclick="_addTagGroup()"
          style="background:#1c1c1e;color:#fff;border:none;padding:7px 14px;border-radius:8px;
                 font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">追加</button>
      </div>
      <div style="display:flex;gap:6px">
        <input id="tags-add-tag-input" placeholder="タグを追加…"
          style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                 padding:7px 10px;font-size:12px;font-family:inherit;outline:none;color:var(--text)"
          onkeydown="if(event.key==='Enter')_addTagItem()">
        <button onclick="_addTagItem()"
          style="background:#1c1c1e;color:#fff;border:none;padding:7px 14px;border-radius:8px;
                 font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">追加</button>
      </div>
    </div>`:''}`;

  const body = document.getElementById('tags-modal-body');
  if (!body) return;
  if (t==='list') _renderTagsListBody(body, _e, _js);
  else _renderTagsDictBody(body, _e, _js);
  // スクロール位置を復元（レイアウト確定後に設定）
  if (_savedScroll > 0) requestAnimationFrame(() => { body.scrollTop = _savedScroll; });
}

function _renderTagsListBody(body, _e, _js) {
  const blocked = new Set(aiSettings.techBlocklist||[]);

  // グループ選択肢 HTML（全関数で共通利用）
  const grpOptions = gid =>
    `<option value="unc"${gid==='unc'?' selected':''}>未分類</option>` +
    _tagGroups.map(g => `<option value="${_e(g.id)}"${gid===g.id?' selected':''}>${_e(g.name)}</option>`).join('');

  let h = `<div style="padding:0 18px;border-bottom:1px solid var(--border2)">
    <input id="tags-list-search" placeholder="検索..." oninput="_filterTagsList()"
      style="width:100%;background:none;border:none;outline:none;padding:10px 0;font-size:12px;color:var(--text);font-family:inherit">
  </div>`;

  // ── 名前付きグループ（NGは除外） ──
  _tagGroups.forEach(g => {
    const open = _tagsOpenGroups.has(g.id);
    const visible = g.techNames.filter(n => !blocked.has(n));
    const grpEd = _tagsEditingGrp === g.id;
    h += `<div style="display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid var(--border2);cursor:pointer;user-select:none"
      onclick="${grpEd?'':'_tagsToggleGrp(\''+_js(g.id)+'\')'}" ondragover="event.preventDefault()" ondrop="_tagsDropOnGroup(event,'${_js(g.id)}')">
      <span style="font-size:10px;color:var(--text3);display:inline-block;transform:rotate(${open?90:0}deg);width:10px;text-align:center;flex-shrink:0">▶</span>
      ${grpEd
        ? `<input id="grp-ed-${_e(g.id)}" value="${_e(g.name)}"
             onclick="event.stopPropagation()"
             onkeydown="if(event.key==='Enter'){event.stopPropagation();_saveGrpName('${_js(g.id)}');}if(event.key==='Escape'){_tagsEditingGrp=null;_renderTagsNewModal();}"
             onblur="_saveGrpName('${_js(g.id)}')"
             style="flex:1;font-size:12px;font-weight:700;border:1.5px solid #1c1c1e;border-radius:5px;padding:2px 7px;outline:none;font-family:inherit;color:var(--text)">`
        : `<span style="flex:1;font-size:12px;font-weight:700">${_e(g.name)}</span>
           <button onclick="event.stopPropagation();_startEditGrp('${_js(g.id)}')"
             style="background:none;border:none;font-size:11px;color:var(--text3);cursor:pointer;padding:0 3px;opacity:.5">✏️</button>`}
      <span style="font-size:11px;color:var(--text3);margin-right:4px">${visible.length}件</span>
      <button onclick="event.stopPropagation();_deleteTagGroup('${_js(g.id)}')"
        style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;padding:2px 4px;opacity:.6">🗑</button>
    </div>`;
    if (open) visible.forEach(n => { h += _buildTagRow(n, g.id, grpOptions, _e, _js); });
  });

  // ── 未分類（NGは除外） ──
  const unc = _getUncategorizedTags().filter(n => !blocked.has(n));
  const uncOpen = _tagsOpenGroups.has('unc');
  const hasAssigns = _aiAssignProposals.length > 0;
  const showAiBtn  = unc.length > 0 && !hasAssigns && !_aiGroupGenerating && _tagGroups.length > 0;
  h += `<div style="padding:7px 16px 4px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;
    display:flex;align-items:center;gap:8px;border-top:1px solid var(--border)">
    <span style="flex:1;height:1px;background:var(--border2)"></span>
    未整理のタグ
    <span style="flex:1;height:1px;background:var(--border2)"></span>
  </div>`;
  h += `<div style="display:flex;align-items:center;gap:8px;padding:9px 16px;border-bottom:1px solid var(--border2);cursor:pointer;user-select:none"
    onclick="_tagsToggleGrp('unc')" ondragover="event.preventDefault()" ondrop="_tagsDropOnGroup(event,'unc')">
    <span style="font-size:10px;color:var(--text3);display:inline-block;transform:rotate(${uncOpen?90:0}deg);width:10px;text-align:center;flex-shrink:0">▶</span>
    <span style="flex:1;font-size:12px;font-weight:700;color:var(--text2)">未分類</span>
    <span style="font-size:11px;color:var(--text3);margin-right:4px">${unc.length}件</span>
    ${showAiBtn ? `<button onclick="event.stopPropagation();_requestAiGroupProposals()"
      style="background:#1c1c1e;color:#fff;border:none;border-radius:12px;
             padding:3px 10px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">
      🤖 AIで整理する</button>` : ''}
  </div>`;
  if (uncOpen) {
    if (_aiGroupGenerating) {
      h += `<div style="padding:20px 18px;text-align:center;background:var(--surface2)">
        <div style="font-size:11px;color:var(--text3)">⚙️ AIが分析中… 未分類 ${unc.length}件を解析しています</div>
      </div>`;
    } else if (hasAssigns) {
      h += `<div id="ai-assign-header" style="padding:8px 16px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;background:var(--surface2)">
        <span id="ai-assign-count" style="font-size:11px;color:var(--text3)">🤖 ${_aiAssignProposals.length}件の割り当て提案</span>
        <div style="display:flex;gap:6px">
          <button onclick="_adoptAllGroupProposals()"
            style="background:#1c1c1e;color:#fff;border:none;font-size:10px;font-weight:700;
                   padding:4px 12px;border-radius:8px;cursor:pointer;font-family:inherit">すべて採用</button>
          <button onclick="_dismissAllGroupProposals()"
            style="background:none;border:1px solid var(--border);color:var(--text3);font-size:10px;
                   padding:4px 10px;border-radius:8px;cursor:pointer;font-family:inherit">クリア</button>
        </div>
      </div>`;
      _aiAssignProposals.forEach(p => {
        h += `<div data-assign-id="${_e(p.id)}" style="display:flex;align-items:center;gap:8px;padding:9px 16px 9px 28px;border-bottom:1px solid var(--border2);background:var(--surface2)">
          <span style="flex:1;font-size:12px;font-weight:600">${_e(p.tag)}</span>
          <span style="font-size:10px;color:var(--text3)">→</span>
          <span style="font-size:11px;font-weight:700;color:var(--accent)">${_e(p.group)}</span>
          <button onclick="_adoptGroupProposal('${_js(p.id)}')"
            style="background:none;border:1.5px solid var(--accent);color:var(--accent);font-size:10px;font-weight:700;
                   padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">採用</button>
          <button onclick="_dismissGroupProposal('${_js(p.id)}')"
            style="background:none;border:1px solid var(--border);color:var(--text3);font-size:10px;
                   padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">スキップ</button>
        </div>`;
      });
    } else {
      unc.forEach(n => { h += _buildTagRow(n, 'unc', grpOptions, _e, _js); });
    }
  }

  // ── NGリスト（別セクション） ──
  const ngTags = [...blocked].sort((a,b) => a.localeCompare(b,'ja'));
  if (ngTags.length > 0) {
    const ngOpen = _tagsOpenGroups.has('ng');
    const ngTotalVc = ngTags.reduce((s, n) => s + _getVideoCount(n), 0);
    h += `<div style="display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid var(--border2);cursor:pointer;user-select:none;border-top:2px solid #ef444433"
      onclick="_tagsToggleGrp('ng')">
      <span style="font-size:10px;color:#ef4444;display:inline-block;transform:rotate(${ngOpen?90:0}deg);width:10px;text-align:center;flex-shrink:0">▶</span>
      <span style="flex:1;font-size:12px;font-weight:700;color:#ef4444">NGリスト</span>
      <span style="font-size:11px;color:#ef4444;margin-right:4px">${ngTags.length}件</span>
      ${ngTotalVc > 0 ? `<button onclick="event.stopPropagation();_stripAllNGFromVideos()"
        style="background:none;border:1.5px solid #ef4444;color:#ef4444;font-size:10px;
               font-weight:700;padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">
        全て取り除く</button>` : ''}
    </div>`;
    if (ngOpen) {
      h += `<div style="padding:8px 16px 9px;border-bottom:1px solid var(--border2);background:#ef44440a;
        font-size:11px;color:var(--text3);line-height:1.6">
        AIがこのタグを動画に自動追加することはありません。手動での追加はいつでもできます。
      </div>`;
      ngTags.forEach(n => { h += _buildNGRow(n, _e, _js); });
    }
  }

  body.innerHTML = h;
}

function _buildTagRow(name, gid, grpOptions, _e, _js) {
  const ind = gid !== 'unc';
  const isEd = _tagsEditingTag === name;
  return `<div data-tg-row="1" data-name="${_e(name)}" draggable="${isEd?'false':'true'}"
    ondragstart="${isEd?'':'_tagsDragStart(event,\''+_js(name)+'\')'}"
    ondragover="event.preventDefault()"
    ondrop="event.stopPropagation();_tagsDropOnGroup(event,'${_js(gid)}')"
    style="display:flex;align-items:center;gap:6px;padding:9px 16px;${ind?'padding-left:36px;background:var(--surface2);':''}border-bottom:1px solid var(--border2)">
    <span style="cursor:grab;color:var(--text3);font-size:11px;flex-shrink:0">⠿</span>
    ${isEd
      ? `<input id="tag-ed-input" value="${_e(name)}"
           onclick="event.stopPropagation()"
           onkeydown="if(event.key==='Enter')_saveTagName('${_js(name)}');if(event.key==='Escape'){_tagsEditingTag=null;_renderTagsNewModal();}"
           onblur="_saveTagName('${_js(name)}')"
           style="flex:1;font-size:12px;font-weight:600;border:1.5px solid #1c1c1e;border-radius:5px;padding:2px 7px;outline:none;font-family:inherit;color:var(--text)">`
      : `<span style="flex:1;font-size:12px;font-weight:600">${_e(name)}</span>
         <button onclick="event.stopPropagation();_startEditTag('${_js(name)}')"
           style="background:none;border:none;font-size:11px;color:var(--text3);cursor:pointer;padding:0 3px;opacity:.5">✏️</button>
         <select onchange="_moveTagToGroup('${_js(name)}',this.value)"
           style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                  font-size:10px;color:var(--text2);padding:3px 4px;cursor:pointer;
                  font-family:inherit;outline:none;max-width:90px;flex-shrink:0">
           ${grpOptions(gid)}
         </select>
         ${(()=>{ const vc=_getVideoCount(name); return `<span style="min-width:28px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:${vc?700:400};text-align:center;background:${vc?'#e8e8ed':'var(--surface2)'};color:${vc?'var(--text2)':'var(--text3)'};flex-shrink:0">${vc}</span>`; })()}
         <button onclick="_toggleTagNG('${_js(name)}')"
           style="background:none;border:1.5px solid var(--border);color:var(--text3);font-size:10px;
                  font-weight:700;padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">NG</button>`}
  </div>`;
}

function _buildNGRow(name, _e, _js) {
  const vc = _getVideoCount(name);
  return `<div data-tg-row="1" data-name="${_e(name)}"
    style="display:flex;align-items:center;gap:6px;padding:9px 16px;padding-left:28px;
           border-bottom:1px solid var(--border2);background:#ef444408">
    <span style="flex:1;font-size:12px;font-weight:600;color:var(--text3)">${_e(name)}</span>
    <span style="min-width:28px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:${vc?700:400};text-align:center;
      background:${vc?'#ef444420':'var(--surface2)'};color:${vc?'#ef4444':'var(--text3)'};flex-shrink:0">${vc}</span>
    ${vc > 0 ? `<button onclick="_stripTagFromVideos('${_js(name)}')"
      style="background:none;border:1.5px solid #ef444466;color:#ef4444;font-size:10px;
             font-weight:700;padding:2px 9px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">取り除く</button>` : ''}
    <button onclick="_toggleTagNG('${_js(name)}')"
      style="background:none;border:1.5px solid #ef4444;color:#ef4444;font-size:10px;
             font-weight:700;padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">解除</button>
  </div>`;
}

function _getVideoCount(tag) {
  return (window.videos || []).filter(v => Array.isArray(v.tags) && v.tags.includes(tag)).length;
}

window._stripTagFromVideos = name => {
  const affected = (window.videos || []).filter(v => Array.isArray(v.tags) && v.tags.includes(name));
  if (!affected.length) { window.toast?.('このタグを含む動画はありません'); return; }
  if (!confirm(`「${name}」を含む ${affected.length} 件の動画からタグを取り除きます。\nNGリストは変更されません。`)) return;
  affected.forEach(v => { v.tags = v.tags.filter(t => t !== name); });
  window.debounceSave?.();
  _renderTagsNewModal();
  window.toast?.(`「${name}」を ${affected.length} 件の動画から取り除きました`);
};

window._stripAllNGFromVideos = () => {
  const blocked = new Set(aiSettings.techBlocklist || []);
  const total = (window.videos || []).reduce((s, v) => s + ((v.tags||[]).some(t => blocked.has(t)) ? 1 : 0), 0);
  if (!total) { window.toast?.('取り除く動画がありません'); return; }
  if (!confirm(`NGリスト内のタグを含む全動画（${total}件）からタグを取り除きます。\nNGリストは変更されません。`)) return;
  (window.videos || []).forEach(v => {
    if (Array.isArray(v.tags)) v.tags = v.tags.filter(t => !blocked.has(t));
  });
  window.debounceSave?.();
  _renderTagsNewModal();
  window.toast?.(`${total}件の動画からNGタグを取り除きました`);
};

function _renderTagsDictBody(body, _e, _js) {
  const { allTags } = _getAllKnownTagsForModal();
  const sorted = [...allTags].sort((a,b) => a.localeCompare(b,'ja'));
  if (!sorted.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">タグがありません</div>`;
    return;
  }
  let h = '';
  sorted.forEach(name => {
    const entry = _getTagAliasEntry(name);
    const sid = 'ai_' + encodeURIComponent(name).replace(/%/g,'x');
    h += `<div style="padding:12px 18px;border-bottom:1px solid var(--border2)">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">${_e(name)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px">
        ${(entry.aliases||[]).length
          ? (entry.aliases||[]).map((a,i) => `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);font-size:11px">
              <span style="font-size:8px;font-weight:700;background:#1c1c1e;color:#fff;padding:1px 4px;border-radius:3px;line-height:1.4">AI</span>
              ${_e(a)}<span onclick="_removeTagAlias('${_js(name)}',${i})" style="cursor:pointer;color:var(--text3);margin-left:2px;padding:0 2px">✕</span>
            </span>`).join('')
          : `<span style="font-size:11px;color:var(--text3)">なし</span>`}
      </div>
      <div style="display:flex;gap:6px">
        <input id="${sid}" placeholder="別の呼び方を追加..."
          style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;
                 padding:6px 10px;font-size:11px;color:var(--text);font-family:inherit;outline:none"
          onkeydown="if(event.key==='Enter')_addTagAlias('${_js(name)}','${sid}')">
        <button onclick="_addTagAlias('${_js(name)}','${sid}')"
          style="background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;
                 padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit">追加</button>
      </div>
    </div>`;
  });
  body.innerHTML = h;
}

function _renderTagsAiBody(body, _e, _js) {
  // AIタブを開く前のタブで分岐（list → グルーピング提案、dict → 別名候補）
  if (_tagsPrevTab === 'list') {
    _renderTagsAiGroupBody(body, _e, _js);
  } else {
    _renderTagsAiAliasBody(body, _e, _js);
  }
}

function _getUncTagsForAi() {
  const { allTags, blocked } = _getAllKnownTagsForModal();
  return [...allTags].filter(t => {
    const inGroup = _tagGroups.some(g => g.techNames.includes(t));
    return !inGroup && !blocked.has(t);
  });
}

function _renderTagsAiGroupBody(body, _e, _js) {
  const proposals = _aiGroupProposals;
  if (_aiGroupGenerating) {
    const uncN = _getUncTagsForAi().length;
    body.innerHTML = `<div style="padding:28px 18px;text-align:center">
      <div style="font-size:20px;margin-bottom:8px">⚙️</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:4px">AIが分析中…</div>
      <div style="font-size:11px;color:var(--text3)">未分類 ${uncN}件を解析しています</div>
    </div>`;
    return;
  }
  if (!proposals.length) {
    const uncTags = _getUncTagsForAi();
    if (uncTags.length) {
      body.innerHTML = `<div style="padding:28px 18px;text-align:center">
        <div style="font-size:12px;color:var(--text3);margin-bottom:4px">未分類タグが <strong style="color:var(--text)">${uncTags.length}件</strong> あります</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:16px">AIがグルーピングを提案します</div>
        <button onclick="_requestAiGroupProposals()"
          style="background:#1c1c1e;color:#fff;border:none;border-radius:10px;
                 padding:10px 20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
          🤖 グルーピングを提案してもらう
        </button>
      </div>`;
    } else {
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">未分類タグがありません ✓</div>`;
    }
    return;
  }
  let h = `<div style="padding:10px 18px;border-bottom:1px solid var(--border2);display:flex;justify-content:flex-end">
    <button onclick="_adoptAllGroupProposals()"
      style="background:#1c1c1e;color:#fff;border:none;font-size:11px;font-weight:700;
             padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit">すべて採用</button>
  </div>`;
  proposals.forEach(p => {
    h += `<div style="padding:12px 18px;border-bottom:1px solid var(--border2)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700">${_e(p.name)}</span>
        <span style="font-size:10px;color:var(--text3)">${_e(p.desc||'')}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        ${(p.tags||[]).map(t => `<span style="padding:3px 8px;border-radius:6px;font-size:11px;background:var(--surface2);border:1px solid var(--border);color:var(--text2)">${_e(t)}</span>`).join('')}
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="_adoptGroupProposal('${_js(p.id)}')"
          style="flex:1;background:#1c1c1e;color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">採用してグループ作成</button>
        <button onclick="_dismissGroupProposal('${_js(p.id)}')"
          style="background:none;border:1px solid var(--border);color:var(--text3);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:inherit">却下</button>
      </div>
    </div>`;
  });
  body.innerHTML = h;
}

function _renderTagsAiAliasBody(body, _e, _js) {
  const pending = [];
  Object.entries(_tagAliasData).forEach(([tn,entry]) => {
    (entry.aiSuggested||[]).forEach(s => pending.push({tn, s}));
  });
  if (!pending.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">AI候補はありません</div>`;
    return;
  }
  let h = `<div style="padding:10px 18px;border-bottom:1px solid var(--border2);display:flex;justify-content:flex-end">
    <button onclick="_adoptAllAiSuggestions()"
      style="background:var(--accent);color:var(--on-accent);border:none;font-size:11px;font-weight:700;
             padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit">すべて採用</button>
  </div>`;
  pending.forEach(({tn, s}) => {
    h += `<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border2)">
      <span style="flex:1;font-size:12px"><b>${_e(tn)}</b> ← <span style="color:var(--text2)">${_e(s)}</span></span>
      <button onclick="_adoptAiSuggestion('${_js(tn)}','${_js(s)}')"
        style="background:none;border:1.5px solid var(--accent);color:var(--accent);font-size:10px;font-weight:700;
               padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit">採用</button>
      <button onclick="_dismissAiSuggestion('${_js(tn)}','${_js(s)}')"
        style="background:none;border:1.5px solid var(--border);color:var(--text3);font-size:10px;font-weight:700;
               padding:2px 10px;border-radius:12px;cursor:pointer;font-family:inherit">却下</button>
    </div>`;
  });
  body.innerHTML = h;
}

// ── Window-exposed handlers ──
window._tagsSetTab = s => {
  _tagsModalTab = s;
  _renderTagsNewModal();
};
window._tagsToggleGrp   = id => { _tagsOpenGroups.has(id) ? _tagsOpenGroups.delete(id) : _tagsOpenGroups.add(id); _renderTagsNewModal(); };
window._renderTagsNewModal = () => _renderTagsNewModal();

// タグ名インライン編集
window._startEditTag = name => {
  _tagsEditingTag = name; _tagsEditingGrp = null;
  _renderTagsNewModal();
  setTimeout(() => { const el = document.getElementById('tag-ed-input'); if (el) { el.focus(); el.select(); } }, 30);
};
window._saveTagName = oldName => {
  const el = document.getElementById('tag-ed-input');
  const newName = (el?.value || '').trim();
  _tagsEditingTag = null;
  if (!newName || newName === oldName) { _renderTagsNewModal(); return; }
  // presets で名前変更
  const ts = tagSettings.find(t => t.key === 'tags');
  if (ts) { const i = ts.presets.indexOf(oldName); if (i >= 0) ts.presets[i] = newName; saveTagSettings(); }
  // グループ内も変更
  _tagGroups.forEach(g => { const i = g.techNames.indexOf(oldName); if (i >= 0) g.techNames[i] = newName; });
  _saveTagGroups();
  // 動画データも変更
  let changed = false;
  (window.videos || []).forEach(v => {
    if (Array.isArray(v.tags)) { const i = v.tags.indexOf(oldName); if (i >= 0) { v.tags[i] = newName; changed = true; } }
  });
  if (changed) window.debounceSave?.();
  _renderTagsNewModal();
  window.toast?.(`「${oldName}」→「${newName}」に変更しました`);
};

// グループ名インライン編集
window._startEditGrp = gid => {
  _tagsEditingGrp = gid; _tagsEditingTag = null;
  _renderTagsNewModal();
  setTimeout(() => { const el = document.getElementById('grp-ed-' + gid); if (el) { el.focus(); el.select(); } }, 30);
};
window._saveGrpName = gid => {
  const el = document.getElementById('grp-ed-' + gid);
  const newName = (el?.value || '').trim();
  _tagsEditingGrp = null;
  if (!newName) { _renderTagsNewModal(); return; }
  const g = _tagGroups.find(x => x.id === gid);
  if (g && newName !== g.name) { const old = g.name; g.name = newName; _saveTagGroups(); window.toast?.(`「${old}」→「${newName}」に変更しました`); }
  _renderTagsNewModal();
};

// タグ追加（フッター入力欄から）
window._addTagItem = () => {
  const el = document.getElementById('tags-add-tag-input');
  const name = (el?.value||'').trim();
  if (!name) return;
  const ts = tagSettings.find(t => t.key === 'tags');
  if (!ts) return;
  if (!ts.presets.includes(name)) {
    ts.presets.push(name);
    saveTagSettings();
  }
  if (el) el.value = '';
  _renderTagsNewModal();
  window.toast?.(`「${name}」を追加しました`);
};

// AI 割り当て提案を生成（未分類タグ → 既存グループへのアサイン）
window._requestAiGroupProposals = async () => {
  const uncTags = _getUncTagsForAi();
  if (!uncTags.length) { window.toast?.('未分類タグがありません'); return; }
  if (!_tagGroups.length) { window.toast?.('先にグループを作成してください'); return; }
  _aiGroupGenerating = true;
  _tagsOpenGroups.add('unc');
  _renderTagsNewModal();
  try {
    const existingGroups = _tagGroups.map(g => ({ name: g.name }));
    const res = await fetch('/api/ai-group', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ tags: uncTags, existingGroups }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const validGroups = new Set(_tagGroups.map(g => g.name));
    _aiAssignProposals = (data.assignments||[])
      .filter(a => a.tag && a.group && validGroups.has(a.group))
      .map((a, i) => ({ id: 'ap' + Date.now() + '_' + i, tag: a.tag, group: a.group }));
    _saveAiGroupProposals();
    if (_aiAssignProposals.length) {
      window.toast?.(`🤖 ${_aiAssignProposals.length}件の割り当て提案が届きました`);
    } else {
      window.toast?.('適切な割り当て先が見つかりませんでした');
    }
  } catch(e) {
    console.error('ai-group error:', e);
    window.toast?.('AI提案の取得に失敗しました');
  } finally {
    _aiGroupGenerating = false;
    _renderTagsNewModal();
  }
};

window._adoptGroupProposal = id => {
  const p = _aiAssignProposals.find(x => x.id === id); if (!p) return;
  const tg = _tagGroups.find(g => g.name === p.group);
  if (tg && !tg.techNames.includes(p.tag)) {
    tg.techNames.push(p.tag);
    _tagsOpenGroups.add(tg.id);
  }
  _aiAssignProposals = _aiAssignProposals.filter(x => x.id !== id);
  _saveTagGroups(); _saveAiGroupProposals();
  // スクロールを維持するためDOM直接更新（フルレンダリングしない）
  document.querySelector(`[data-assign-id="${id}"]`)?.remove();
  const countEl = document.getElementById('ai-assign-count');
  if (countEl) countEl.textContent = `🤖 ${_aiAssignProposals.length}件の割り当て提案`;
  if (!_aiAssignProposals.length) _renderTagsNewModal(); // 全部終わったら再描画
  window.toast?.(`「${p.tag}」→「${p.group}」に追加しました`);
};
window._dismissGroupProposal = id => {
  _aiAssignProposals = _aiAssignProposals.filter(x => x.id !== id);
  _saveAiGroupProposals();
  // スクロールを維持するためDOM直接更新
  document.querySelector(`[data-assign-id="${id}"]`)?.remove();
  const countEl = document.getElementById('ai-assign-count');
  if (countEl) countEl.textContent = `🤖 ${_aiAssignProposals.length}件の割り当て提案`;
  if (!_aiAssignProposals.length) _renderTagsNewModal();
  window.toast?.('スキップしました');
};
window._adoptAllGroupProposals = () => {
  const n = _aiAssignProposals.length;
  [..._aiAssignProposals].forEach(p => {
    const tg = _tagGroups.find(g => g.name === p.group);
    if (tg && !tg.techNames.includes(p.tag)) {
      tg.techNames.push(p.tag);
      _tagsOpenGroups.add(tg.id);
    }
  });
  _aiAssignProposals = [];
  _saveTagGroups(); _saveAiGroupProposals();
  _renderTagsNewModal();
  window.toast?.(`${n}件のタグを割り当てました`);
};
window._dismissAllGroupProposals = () => {
  _aiAssignProposals = [];
  _saveAiGroupProposals(); _renderTagsNewModal();
  window.toast?.('提案をクリアしました');
};

window._filterTagsList = () => {
  const q = (document.getElementById('tags-list-search')?.value||'').toLowerCase();
  document.querySelectorAll('[data-tg-row="1"]').forEach(el => {
    el.style.display = (el.dataset.name||'').toLowerCase().includes(q) ? '' : 'none';
  });
};
window._addTagGroup = () => {
  const el = document.getElementById('tags-add-grp-input');
  const name = (el?.value || '').trim();
  if (!name) return;
  _tagGroups.push({ id: 'g' + Date.now(), name, techNames: [] });
  if (el) el.value = '';
  _saveTagGroups(); _renderTagsNewModal();
  window.toast?.(`グループ「${name}」を作成しました`);
};
window._deleteTagGroup = gid => {
  if (!confirm('このグループを削除しますか？（タグはすべて未分類に戻ります）')) return;
  _tagGroups = _tagGroups.filter(g => g.id !== gid);
  _saveTagGroups(); _renderTagsNewModal();
};
window._toggleTagNG = name => {
  if (!aiSettings.techBlocklist) aiSettings.techBlocklist = [];
  const i = aiSettings.techBlocklist.indexOf(name);
  if (i >= 0) {
    // 解除
    aiSettings.techBlocklist.splice(i, 1);
    saveAiSettings(); _renderTagsNewModal();
    window.toast?.(`「${name}」をNGから解除しました`);
  } else {
    // NG追加 — 動画に含まれていれば確認ダイアログ
    const affected = (window.videos || []).filter(v => Array.isArray(v.tags) && v.tags.includes(name));
    const doAdd = (removeFromVideos) => {
      if (removeFromVideos && affected.length) {
        affected.forEach(v => { v.tags = v.tags.filter(t => t !== name); });
        window.debounceSave?.();
        window.toast?.(`「${name}」をNGに追加し、${affected.length}件の動画から削除しました`);
      } else {
        window.toast?.(`「${name}」をNGに追加しました`);
      }
      aiSettings.techBlocklist.push(name);
      saveAiSettings(); _renderTagsNewModal();
    };
    if (affected.length > 0) {
      // インラインダイアログで確認
      const msg = `「${name}」をNGに追加します。\nこのタグを含む動画が ${affected.length} 件あります。\n動画からも削除しますか？`;
      const choice = confirm(msg);
      doAdd(choice);
    } else {
      doAdd(false);
    }
  }
};
window._tagsDragStart = (event, name) => {
  _tagsDragItem = name;
  event.dataTransfer.setData('text/plain', name);
  event.dataTransfer.effectAllowed = 'move';
};
window._tagsDropOnGroup = (event, gid) => {
  event.preventDefault();
  const name = _tagsDragItem || event.dataTransfer.getData('text/plain');
  if (!name) return;
  _tagGroups.forEach(g => { g.techNames = g.techNames.filter(t => t !== name); });
  if (gid !== 'unc') {
    const tg = _tagGroups.find(g => g.id === gid);
    if (tg && !tg.techNames.includes(name)) tg.techNames.push(name);
  }
  _tagsDragItem = null; _saveTagGroups(); _renderTagsNewModal();
};
window._moveTagToGroup = (name, gid) => {
  _tagGroups.forEach(g => { g.techNames = g.techNames.filter(t => t !== name); });
  if (gid !== 'unc') {
    const tg = _tagGroups.find(g => g.id === gid);
    if (tg && !tg.techNames.includes(name)) tg.techNames.push(name);
  }
  _saveTagGroups(); _renderTagsNewModal();
};
window._deleteTag = name => {
  // presets から削除
  const ts = tagSettings.find(t => t.key === 'tags');
  if (ts) { ts.presets = ts.presets.filter(p => p !== name); saveTagSettings(); }
  // グループからも削除
  _tagGroups.forEach(g => { g.techNames = g.techNames.filter(t => t !== name); });
  _saveTagGroups();
  // 動画データから削除（ライブラリスキャンで再登場しないよう）
  let changed = false;
  (window.videos || []).forEach(v => {
    if (Array.isArray(v.tags) && v.tags.includes(name)) {
      v.tags = v.tags.filter(t => t !== name);
      changed = true;
    }
  });
  if (changed) window.debounceSave?.();
  _renderTagsNewModal();
  _renderTagDisplaySettings();
};
window._addTagAlias = (tagName, inputId) => {
  const val = (document.getElementById(inputId)?.value||'').trim();
  if (!val) return;
  const e = _getTagAliasEntry(tagName);
  if (!e.aliases.includes(val)) { e.aliases.push(val); _saveTagAliases(); }
  _renderTagsNewModal();
};
window._removeTagAlias = (tagName, idx) => {
  const e = _getTagAliasEntry(tagName);
  e.aliases.splice(idx, 1); _saveTagAliases(); _renderTagsNewModal();
};
window._adoptAiSuggestion = (tagName, sug) => {
  const e = _getTagAliasEntry(tagName);
  if (!e.aliases.includes(sug)) e.aliases.push(sug);
  e.aiSuggested = (e.aiSuggested||[]).filter(s => s !== sug);
  _saveTagAliases(); _renderTagsNewModal();
  window.toast?.(`「${sug}」を${tagName}の別の呼び方として採用しました`);
};
window._dismissAiSuggestion = (tagName, sug) => {
  const e = _getTagAliasEntry(tagName);
  e.aiSuggested = (e.aiSuggested||[]).filter(s => s !== sug);
  _saveTagAliases(); _renderTagsNewModal();
  window.toast?.(`「${sug}」を却下しました`);
};
window._adoptAllAiSuggestions = () => {
  Object.entries(_tagAliasData).forEach(([tn, e]) => {
    (e.aiSuggested||[]).forEach(s => { if (!e.aliases.includes(s)) e.aliases.push(s); });
    e.aiSuggested = [];
  });
  _saveTagAliases(); _renderTagsNewModal();
  window.toast?.('すべての候補を採用しました');
};

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
