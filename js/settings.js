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
  const out = l || _TAG_FALLBACK[key] || String(key);
  // まだ自分で名前を決めていない初期値（「タグ1」〜「タグ4」）だけは、英語表示で Tag 1〜4 と出す（段階6）。
  // グループ名はユーザーのものなので画面の自動翻訳は掛からない（data-user-text）。初期値のときだけここで言い換える。
  // 表示だけ。保存している名前は変えない
  const m = /^タグ([1-4])$/.exec(out);
  if (m && window.WK_LANG && window.WK_LANG() === 'en') return 'Tag ' + m[1];
  return out;
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
// v52.860（段階3b）: 新しいタグ設定の画面（js/tag-settings-ui.js）に置き換えた。
// 旧「4行＋モーダル」は廃止。タグ1〜4の枠と未使用のタググループを1画面で扱う。
function _renderTagDisplaySettings() {
  window.renderTagShelf?.();
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

// ═══ 旧タグ設定のモーダル・テンプレート・一括削除 ═══
// v52.860（段階3b）で廃止。新しい画面（js/tag-settings-ui.js）に置き換えた。
// 保存済みのテンプレート（wk_tagTemplates）は消さない（一覧が未使用のタググループに移す・バックアップに入る）。
// 「選択肢に無い値を動画から消す」「一括削除」は、段階4で先にバックアップと取り消しを付けてから作り直す。

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

// 新しいタグ設定の画面（js/tag-settings-ui.js・段階3b）から呼ぶ入口。今の4つ（tb/cat/pos/tags）は
// 名前と選択肢の正が tagSettings なので、書き込みはここを通す（動画には触らない）。
window.tagOptAdd    = (key, v) => { const s = String(v == null ? '' : v).trim(); if (_TAG_KEYS.includes(key) && s) _addTagFromModalValue(key, s); };
window.tagOptRemove = (key, v) => { if (_TAG_KEYS.includes(key)) _removeTagFromModalValue(key, v); };
window.tagSetVisible = (key, on) => {
  const t = tagSettings.find(x => x.key === key); if (!t) return;
  if ((t.visible !== false) === !!on) return;
  t.visible = !!on; saveTagSettings(); applyTagVisibility();
};

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
