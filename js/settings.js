// ═══ WAZA KIMURA — タグ設定 ═══

const DEFAULT_TAG_SETTINGS = [
  { key:'tb',   label:'トップ/ボトム/スタンディング', visible:true,  presets:['トップ','ボトム','スタンディング'] },
  { key:'cat',  label:'カテゴリ',   visible:true,  presets:[] },  // CATEGORIES から自動取得
  { key:'pos',  label:'ポジション',   visible:true,  presets:[] },  // POSITIONS から自動取得
  { key:'tags', label:'テクニック',  visible:true,  presets:[] },
];

export let tagSettings = DEFAULT_TAG_SETTINGS.map(d => ({ ...d, presets: [...d.presets] }));

// ── aiSettings ──
const DEFAULT_BJJ_RULES = [
  // ══ 最重要：推論指示 ══
  'タイトルに直接書かれていなくても、BJJの専門知識から因果関係を推論してタグを判定せよ',
  '例: "Berimbolo" → スイープ系の技でバックテイクに繋がる → cat:スイープ + cat:バックテイク・バックアタック',
  '例: "Knee Cut Pass" → トップからのパスガード → TB:トップ, cat:パスガード',
  '例: "Collar Sleeve to Omoplata" → ボトムのオープンガードからサブミッション → TB:ボトム, cat:フィニッシュ, pos:片襟片袖',
  // ── TB (トップ/ボトム/スタンディング) 判定 ──
  'ガード全般（クローズド、ハーフ、オープン、バタフライ、デラヒーバ等）を使う側 → TB=ボトム',
  'パスガード（ガードパス / pass / knee cut / torreando 等）はガードを越える側 → TB=トップ',
  'スイープ（sweep）はボトムから仕掛ける技 → TB=ボトム',
  'エスケープ（マウントエスケープ、サイドエスケープ等）は不利側 → TB=ボトム',
  'バックテイク・バックアタックの攻め側 → TB=トップ',
  'バックからのエスケープ（背中を取られた側の脱出） → TB=ボトム',
  'テイクダウン（takedown, single leg, double leg, 投げ技） → TB=スタンディング',
  'コントロール（マウント、サイドコントロール、ニーオンベリー等でのキープ・圧力） → TB=トップ',
  // ── カテゴリ判定（正式名のみ使用） ──
  'サブミッション（絞め・関節技）の仕掛け → cat=フィニッシュ',
  'サブミッションのディフェンス・脱出・不利ポジションからの逃げ → cat=エスケープ・ディフェンス',
  'スイープ（相手をひっくり返す技） → cat=スイープ',
  'パスガード（ガードを越える技） → cat=パスガード',
  'ガードリテンション（ガードを維持する技術・フレーム・ポジション回復） → cat=ガードリテンション',
  'テイクダウン（standing→ground） → cat=テイクダウン',
  'トップポジションの維持・圧力・キープ → cat=コントロール／プレッシャー',
  'バックを取る技・バックからの攻撃（チョーク含む） → cat=バックテイク・バックアタック',
  'ガードを取る動作・特定ガードへのエントリー → cat=ガード構築・エントリー',
  '原理・コンセプト・ドリル・理論解説 → cat=コンセプト・原理',
  // ── ポジション判定（正式名のみ使用） ──
  'closed guard / クローズドガード → pos=クローズドガード',
  'half guard / ハーフガード / underhook half → pos=ハーフガード',
  'deep half / ディープハーフ → pos=ディープハーフ',
  'butterfly guard / バタフライ → pos=バタフライガード',
  'X guard / エックスガード → pos=Xガード',
  'single leg X / SLX → pos=SLX',
  'De La Riva / DLR / デラヒーバ → pos=デラヒーバ',
  'Reverse De La Riva / RDLR → pos=リバースデラヒーバ',
  'spider guard / スパイダー → pos=スパイダーガード',
  'lasso guard / ラッソー → pos=ラッソーガード',
  'collar sleeve / 片襟片袖 → pos=片襟片袖',
  'K guard / Kガード → pos=Kガード',
  'worm guard / ワームガード / squid guard / gubber guard → pos=ラペルガード（ラペル系は全てラペルガードに統合）',
  'lapel guard / ラペルガード → pos=ラペルガード',
  'Z guard / knee shield / ニーシールド → pos=ニーシールド',
  '50/50 / fifty-fifty → pos=50/50',
  'saddle / 411 / honey hole / inside sankaku / ashi garami → pos=サドル',
  'turtle / 亀 → pos=タートル',
  'inverted guard / インバーテッド / tornado guard → pos=インバーテッド',
  'standing / スタンディング / 立ち技 → pos=スタンディング',
  '70/30 guard / 70/30ガード → pos=70/30ガード',
  'sit-up guard / sitting guard / シッティングガード → pos=シッティングガード',
  'single leg guard / シングルレッグガード → pos=シングルレッグガード（SLXとは別）',
  'cross guard / クロスガード → pos=クロスガード',
  'reverse half guard / リバースハーフ → pos=リバースハーフガード',
  'open guard / オープンガード → pos=オープンガード',
  'octopus guard / オクトパスガード → pos=オクトパスガード',
  // ── 複合判定 ──
  'タイトルに複数の技が含まれる場合、すべてのタグを配列に含める',
  'レッグロック系（ヒールフック、ニーバー、トーホールド等）→ cat=フィニッシュ、posは50/50 or サドル を検討',
  'ベリンボロ（berimbolo）→ cat=スイープ + cat=バックテイク・バックアタック, tags=ベリンボロ',
  'マウント・サイドコントロール・ニーオンベリー等のトップポジション名が出たら → それ自体はポジション名だがPOSITIONSリストにないので tags に入れる',
];

export let aiSettings = {
  enabled:               true,
  defaultMode:           'add',
  categories:            { tb: true, action: true, position: true, tags: true },
  autoTagOnImport:       false,
  fetchChaptersOnImport: true,
  bulkConfirm:           true,
  newTagProposal:        true,
  flexibility:           'standard',
  autoAddToPresets:      false,
  model:                 'haiku',
  bjjRulesAutoAdd:       false,
  bjjRules:              [...DEFAULT_BJJ_RULES],
  feedbackExamples:      [],
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
        const cats = p.categories;
        Object.assign(aiSettings, p);
        if (cats && typeof cats === 'object') aiSettings.categories = { ...aiSettings.categories, ...cats };
      }
    }
  } catch(e) {}
  // マイグレーション: 新フィールドが未保存の場合デフォルト値を補完
  if (!aiSettings.model) aiSettings.model = 'haiku';
  if (!Array.isArray(aiSettings.bjjRules)) aiSettings.bjjRules = [...DEFAULT_BJJ_RULES];
  if (!Array.isArray(aiSettings.feedbackExamples)) aiSettings.feedbackExamples = [];
  if (!Array.isArray(aiSettings.techBlocklist)) aiSettings.techBlocklist = [];
  window.tagSettings = tagSettings;
  window.aiSettings  = aiSettings;
}
loadTagSettings();

// ── クラウド設定を反映 ──
export function applyRemoteSettings(data) {
  if (data.tagSettings && Array.isArray(data.tagSettings) && data.tagSettings.length) {
    tagSettings = data.tagSettings;
    _migrateTagSettings();
    try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
    window.tagSettings = tagSettings;
  }
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
  _renderTagDisplaySettings();
  _renderFilterColSettings();
  _renderAiImportSettings();
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

// ═══ タグ表示設定（v5: 3行 + モーダル） ═══
function _renderTagDisplaySettings() {
  const el = document.getElementById('tag-display-settings'); if (!el) return;
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const tbTs  = tagSettings.find(t => t.key === 'tb');
  const catTs = tagSettings.find(t => t.key === 'cat');
  const posTs = tagSettings.find(t => t.key === 'pos');

  // TB: presets from tagSettings
  const tbCount = tbTs ? tbTs.presets.length : 3;
  // Cat/Pos: from admin-dashboard storage or defaults
  const cats = _getSettingsCategory();
  const positions = _getSettingsPositions();
  // Tags: from tagSettings
  const tagsTs = tagSettings.find(t => t.key === 'tags');
  const tagsCount = tagsTs ? tagsTs.presets.length : 0;

  const makeRow = (key, label, count) => `
    <div style="display:flex;align-items:center;gap:12px">
      <label class="settings-toggle">
        <input type="checkbox" ${tagSettings.find(t=>t.key===key)?.visible?'checked':''}
          onchange="tagSettings.find(t=>t.key==='${key}').visible=this.checked;saveTagSettings();applyTagVisibility()">
        <span class="settings-toggle-slider"></span>
      </label>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${_esc(label)}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${count} 項目</div>
      </div>
      <button onclick="openTagEditModal('${key}')"
        style="background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;font-weight:600;padding:5px 12px;border-radius:16px;cursor:pointer;font-family:inherit;white-space:nowrap">編集</button>
    </div>`;

  el.innerHTML = makeRow('tb', 'TBS', tbCount) + makeRow('cat', 'カテゴリ', cats.length) + makeRow('pos', 'ポジション', positions.length) + makeRow('tags', 'テクニック', tagsCount);
}

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
window.openTagEditModal = function(type) {
  const overlay = document.getElementById('tag-edit-overlay');
  const modal = document.getElementById('tag-edit-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';

  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let title = '', items = [], placeholder = '', hasSearch = false, hasDesc = false;

  if (type === 'tb') {
    title = 'TBS';
    const ts = tagSettings.find(t => t.key === 'tb');
    items = (ts?.presets || ['トップ','ボトム','スタンディング']).map((p,i) => ({ name: p, en: '', source: 'system', idx: i }));
    placeholder = '新しい項目を追加...';
  } else if (type === 'cat') {
    title = 'カテゴリ';
    hasSearch = true; hasDesc = true;
    const cats = _getSettingsCategory();
    // desc from tag-master.js CATEGORIES (stored in code) — fallback to empty
    const descMap = {
      'エスケープ・ディフェンス':'不利ポジションからの脱出と防御',
      'ガード構築・エントリー':'ガードを取る・特定ガードの入り口',
      'ガードリテンション':'足を取られないボトムの守り',
      'コントロール／プレッシャー':'トップポジションの維持・押さえ',
      'コンセプト・原理':'技ではない原則的な学び',
      'スイープ':'ボトムから相手をひっくり返す動作',
      'テイクダウン':'立ちから相手を倒す動作（投げ技含む）',
      'バックテイク・バックアタック':'バックを取る／バックからの攻撃',
      'パスガード':'相手のガードを越えてトップを取る動作',
      'フィニッシュ':'チョーク・関節技など相手を極めにいく動作',
    };
    items = cats.map(c => ({
      name: c.names?.ja || c.name || '',
      en: c.names?.en || '',
      desc: c.desc || descMap[c.names?.ja || c.name] || '',
      source: c.source || 'system',
      id: c.id
    }));
    // sort あいうえお
    items.sort((a,b) => {
      if (a.source !== b.source) return a.source === 'system' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ja');
    });
    placeholder = '新しいカテゴリを追加...';
  } else if (type === 'pos') {
    title = 'ポジション';
    hasSearch = true;
    const positions = _getSettingsPositions();
    items = positions.map(p => ({
      name: p.names?.ja || '',
      en: p.names?.en || '',
      source: p.source || 'system',
      id: p.id
    }));
    // sort: 数字→英字→あいうえお、カスタム末尾
    items.sort((a,b) => {
      if (a.source !== b.source) return a.source === 'system' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ja');
    });
    placeholder = '新しいポジションを追加...';
  } else if (type === 'tags') {
    _openTagsNewModal();
    return;
  }

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--border2);flex-shrink:0">
      <div style="font-size:14px;font-weight:800">${_esc(title)}</div>
      <button onclick="closeTagEditModal()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3);padding:2px 6px">✕</button>
    </div>`;

  if (hasSearch) {
    html += `<div style="padding:0 18px;border-bottom:1px solid var(--border2)">
      <input id="tag-modal-search" placeholder="検索..." oninput="_filterTagModal()"
        style="width:100%;background:none;border:none;outline:none;padding:10px 0;font-size:12px;color:var(--text);font-family:inherit">
    </div>`;
  }

  html += `<div id="tag-modal-list" style="overflow-y:auto;flex:1;padding:0">`;
  items.forEach((item, i) => {
    const isCustom = item.source === 'user';
    html += `<div class="tag-modal-item" data-name="${_esc(item.name)}" style="display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid var(--border2);${isCustom?'background:var(--surface2)':''}">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${_esc(item.name)}${isCustom?'<span style="font-size:9px;font-weight:600;color:var(--blue);background:#e8eef4;padding:1px 6px;border-radius:8px;margin-left:6px">カスタム</span>':''}</div>
        ${item.en ? `<div style="font-size:10px;color:var(--text3);margin-top:1px">${_esc(item.en)}</div>` : ''}
        ${hasDesc && item.desc ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;font-style:italic">${_esc(item.desc)}</div>` : ''}
      </div>
      <button onclick="_deleteTagFromModal('${type}','${_esc(item.id||item.name)}')" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:10px;padding:3px 10px;border-radius:12px;cursor:pointer;font-family:inherit;flex-shrink:0">削除</button>
    </div>`;
  });
  html += `</div>`;

  html += `<div style="padding:10px 18px;border-top:1px solid var(--border);flex-shrink:0">
    <div style="font-size:10px;color:var(--text3);line-height:1.5;margin-bottom:8px">※ ユーザーが追加した項目はAI自動判定の対象外です。手動でのタグ付けを推奨します。</div>
    <div style="display:flex;gap:8px">
      <input id="tag-modal-add-input" placeholder="${_esc(placeholder)}"
        style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text);font-family:inherit;outline:none">
      <button onclick="_addTagFromModal('${type}')"
        style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">追加</button>
    </div>
  </div>`;

  modal.innerHTML = html;
};

window.closeTagEditModal = function() {
  const overlay = document.getElementById('tag-edit-overlay');
  if (overlay) overlay.style.display = 'none';
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
  } else if (type === 'pos') {
    const positions = _getSettingsPositions();
    if (!positions.find(p => (p.names?.ja) === val)) {
      const newId = 'u_pos_' + Date.now();
      positions.push({ id: newId, names: { ja: val, en: '' }, group: 'other', aliases: { ja: [], en: [] }, source: 'user' });
      try { localStorage.setItem('waza_positions', JSON.stringify(positions)); } catch(e) {}
    }
    _syncWindowPositions();
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
    const filtered = cats.filter(c => (c.id || c.names?.ja || c.name) !== idOrName);
    try { localStorage.setItem('waza_tag_dict', JSON.stringify(filtered)); } catch(e) {}
    _syncWindowCats();
  } else if (type === 'pos') {
    const positions = _getSettingsPositions();
    const filtered = positions.filter(p => (p.id || p.names?.ja) !== idOrName);
    try { localStorage.setItem('waza_positions', JSON.stringify(filtered)); } catch(e) {}
    _syncWindowPositions();
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
function _renderAiImportSettings() {
  const el = document.getElementById('ai-settings-section'); if (!el) return;
  const s = aiSettings;
  const _esc = v => String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const toggleHtml = (prop, label, desc, extra='') => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">${label}</div>
        ${desc?`<div style="font-size:11px;color:var(--text3)">${desc}</div>`:''}
      </div>
      <label class="settings-toggle">
        <input type="checkbox" ${s[prop]?'checked':''} onchange="aiSettings.${prop}=this.checked;saveAiSettings();_renderAiImportSettings()" ${extra}>
        <span class="settings-toggle-slider"></span>
      </label>
    </div>`;

  const chipHtml = (key, label) => {
    const on = s.categories?.[key];
    return `<span onclick="aiSettings.categories.${key}=!aiSettings.categories.${key};saveAiSettings();_renderAiImportSettings()"
      style="padding:5px 12px;border-radius:20px;border:1.5px solid ${on?'var(--accent)':'var(--border)'};font-size:11px;font-weight:600;cursor:pointer;
      background:${on?'var(--accent)':'var(--surface2)'};color:${on?'#fff':'var(--text2)'}">${label}</span>`;
  };

  el.innerHTML = `
    ${toggleHtml('enabled', 'AIタグ機能', 'タイトルからカテゴリ・ポジションを自動判定')}
    <div style="opacity:${s.enabled?1:.4};pointer-events:${s.enabled?'auto':'none'};margin-top:14px;display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px">自動判定するタグ</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${chipHtml('tb','TBS')}${chipHtml('action','カテゴリ')}${chipHtml('position','ポジション')}${chipHtml('tags','テクニック')}
        </div>
      </div>
      ${toggleHtml('autoTagOnImport', '取込時に自動AI分析', 'YouTube取り込み後に自動でタグ付け')}
      ${toggleHtml('fetchChaptersOnImport', 'チャプター取得', 'YouTubeの説明文からタイムスタンプを解析')}
    </div>`;
}
// expose for inline onchange
window._renderAiImportSettings = _renderAiImportSettings;

export function renderTagSettingsList() {
  const el = document.getElementById('tag-settings-list'); if (!el) return;
  el.innerHTML = '';
  tagSettings.forEach(function(tag, i) {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);min-width:44px">属性${i+1}</div>
        <input id="ts-label-${i}" value="${tag.label}" style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;padding:5px 9px;font-size:13px;font-weight:700;color:var(--text);outline:none;font-family:inherit"
          onchange="tagSettings[${i}].label=this.value;saveTagSettings()">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer">
          <input type="checkbox" ${tag.visible?'checked':''} onchange="tagSettings[${i}].visible=this.checked;saveTagSettings();applyTagVisibility();renderTagVisibilityBtns()">
          表示
        </label>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:7px">候補値</div>
      <div id="ts-presets-${i}" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px"></div>
      <div style="display:flex;gap:6px">
        <input id="ts-new-${i}" placeholder="候補を追加..." style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;color:var(--text);outline:none;font-family:inherit"
          onkeydown="if(event.key==='Enter')addTagPreset(${i})">
        <button onclick="addTagPreset(${i})" style="padding:4px 12px;border-radius:6px;border:none;background:var(--accent);color:var(--on-accent);font-size:12px;cursor:pointer">＋</button>
      </div>
      ${tag.key === 'tags' ? `
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
          <button onclick="window._techCleanup(${i})"
            style="padding:5px 14px;border-radius:6px;border:1.5px solid var(--accent);background:var(--surface);
                   color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            🔧 重複整理
          </button>
          <button onclick="window._techBulkDelete(${i})"
            style="padding:5px 14px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);
                   color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            🗑️ 一括削除モード
          </button>
          <button onclick="window._tagSortMode()"
            style="padding:5px 14px;border-radius:6px;border:1.5px solid #f59e0b;background:#f59e0b11;
                   color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">
            🏷️ タグ仕分け
          </button>
        </div>` : ''}`;
    el.appendChild(card);
    renderTagPresets(i);
  });
}

export function renderTagPresets(i) {
  const el = document.getElementById('ts-presets-' + i); if (!el) return;
  el.innerHTML = '';
  if (tagSettings[i].presets.length) {
    // ソート済みインデックスで表示（内部配列は変更しない）
    const sorted = tagSettings[i].presets.map((p, pi) => ({ p, pi })).sort((a, b) => a.p.localeCompare(b.p, 'ja'));
    sorted.forEach(function({ p, pi }) {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:var(--surface2);border:1.5px solid var(--border);font-size:11px;color:var(--text2);cursor:pointer;';
      chip.title = 'クリックで名前を変更';
      const lbl = document.createElement('span');
      lbl.textContent = p;
      lbl.onclick = function() { startRenamePreset(i, pi, chip, lbl, p); };
      const del = document.createElement('span');
      del.textContent = '×';
      del.style.cssText = 'cursor:pointer;color:var(--text3);font-size:11px;margin-left:2px;';
      del.onclick = function(e) { e.stopPropagation(); removeTagPreset(i, pi); };
      chip.appendChild(lbl);
      chip.appendChild(del);
      el.appendChild(chip);
    });
  } else {
    const empty = document.createElement('span');
    empty.style.cssText = 'font-size:11px;color:var(--text3);';
    empty.textContent = '候補なし（自由入力のみ）';
    el.appendChild(empty);
  }
  const key = tagSettings[i].key;
  const existing = new Set(tagSettings[i].presets);
  const blocked = new Set(aiSettings.techBlocklist || []);
  const fromLibrary = [...new Set((window.videos||[]).flatMap(v => v[key]||[]))].filter(t => !existing.has(t) && !blocked.has(t)).sort((a, b) => a.localeCompare(b, 'ja'));
  if (!fromLibrary.length) return;
  const sep = document.createElement('div');
  sep.style.cssText = 'width:100%;margin:8px 0 5px;font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.04em;';
  sep.textContent = 'ライブラリ内の既存データ（タップで候補に追加）';
  el.appendChild(sep);
  fromLibrary.forEach(function(t) {
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:3px 4px 3px 8px;border-radius:12px;background:var(--surface);border:1.5px dashed var(--border);font-size:11px;color:var(--text3);';
    const addBtn = document.createElement('span');
    addBtn.textContent = '＋ ' + t;
    addBtn.style.cssText = 'cursor:pointer;';
    addBtn.onclick = function() {
      if (!tagSettings[i].presets.includes(t)) {
        tagSettings[i].presets.push(t);
        saveTagSettings();
        renderTagPresets(i);
      }
    };
    const blockBtn = document.createElement('span');
    blockBtn.textContent = '🚫';
    blockBtn.title = '禁止リストに追加';
    blockBtn.style.cssText = 'cursor:pointer;font-size:10px;padding:2px 4px;border-radius:8px;margin-left:2px;opacity:.5;';
    blockBtn.onmouseenter = function() { blockBtn.style.opacity = '1'; };
    blockBtn.onmouseleave = function() { blockBtn.style.opacity = '.5'; };
    blockBtn.onclick = function(e) {
      e.stopPropagation();
      if (!aiSettings.techBlocklist) aiSettings.techBlocklist = [];
      if (!aiSettings.techBlocklist.includes(t)) {
        aiSettings.techBlocklist.push(t);
        saveAiSettings();
      }
      // 動画からも削除
      (window.videos || []).forEach(function(v) {
        ['tb','cat','pos','tags'].forEach(function(f) {
          if (v[f]?.length) v[f] = v[f].filter(x => x !== t);
        });
      });
      window.debounceSave?.();
      renderTagPresets(i);
      window.toast?.('🚫 「' + t + '」を禁止リストに追加');
    };
    chip.appendChild(addBtn);
    chip.appendChild(blockBtn);
    el.appendChild(chip);
  });
}

export function startRenamePreset(i, pi, chip, lbl, oldVal) {
  const inp = document.createElement('input');
  inp.value = oldVal;
  inp.style.cssText = 'width:80px;background:var(--surface);border:1.5px solid var(--accent);border-radius:4px;padding:1px 5px;font-size:11px;color:var(--text);outline:none;font-family:inherit;';
  chip.replaceChild(inp, lbl);
  inp.focus(); inp.select();
  function commit() {
    const newVal = inp.value.trim();
    if (newVal && newVal !== oldVal) { renameTagPreset(i, pi, oldVal, newVal); }
    else { renderTagPresets(i); }
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { inp.blur(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); renderTagPresets(i); }
  });
}

export function renameTagPreset(i, pi, oldVal, newVal) {
  tagSettings[i].presets[pi] = newVal;
  saveTagSettings();
  const field = tagSettings[i].key;
  let count = 0;
  (window.videos||[]).forEach(function(v) {
    const arr = v[field] || [];
    const idx = arr.indexOf(oldVal);
    if (idx !== -1) { arr[idx] = newVal; count++; }
  });
  renderTagPresets(i);
  if (count > 0) { window.toast(`✅ "${oldVal}" → "${newVal}" に変更（${count}本の動画に反映）`); window.AF?.(); }
  else { window.toast(`✅ "${oldVal}" → "${newVal}" に変更`); }
}

export function addTagPreset(i) {
  const inp = document.getElementById('ts-new-' + i); if (!inp) return;
  const val = inp.value.trim(); if (!val) return;
  if (!tagSettings[i].presets.includes(val)) {
    tagSettings[i].presets.push(val);
    saveTagSettings();
    renderTagPresets(i);
  }
  inp.value = '';
}

export function removeTagPreset(i, pi) {
  tagSettings[i].presets.splice(pi, 1);
  saveTagSettings();
  renderTagPresets(i);
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

// ── AI設定UI ──
export function renderAiSettings() {
  const el = document.getElementById('ai-settings-section'); if (!el) return;
  const s = aiSettings;
  const catLabels = { tb: 'トップ/ボトム/スタンディング', action: 'カテゴリ', position: 'ポジション', tags: 'テクニック' };
  const row = (label, desc, checkbox) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">${label}</div>
        ${desc ? `<div style="font-size:11px;color:var(--text3)">${desc}</div>` : ''}
      </div>
      ${checkbox}
    </div>`;
  const toggle = (prop, extra='') =>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer">
      <input type="checkbox" ${s[prop]?'checked':''} onchange="aiSettings.${prop}=this.checked;saveAiSettings();renderAiSettings()" style="accent-color:var(--accent);width:14px;height:14px"${extra}> 有効
    </label>`;

  el.innerHTML = `
    ${row('AIタグ機能', '🤖 AIタグ提案ボタンの有効/無効', toggle('enabled'))}
    <div style="opacity:${s.enabled?1:.4};pointer-events:${s.enabled?'auto':'none'}">

      <!-- デフォルト適用モード -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">デフォルト適用モード</div>
        <div style="display:flex;gap:8px">
          ${['add','overwrite'].map(v => `
            <button onclick="aiSettings.defaultMode='${v}';saveAiSettings();renderAiSettings()"
              style="padding:6px 18px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;
                ${s.defaultMode===v?'background:var(--accent);color:var(--on-accent);border:none':'background:var(--surface2);color:var(--text);border:1.5px solid var(--border)'}">
              ${{add:'＋ 追加',overwrite:'上書き'}[v]}
            </button>`).join('')}
        </div>
      </div>

      <!-- 提案するカテゴリ -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">提案するカテゴリ</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${Object.entries(catLabels).map(([key, label]) => `
            <label style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;
              border:1.5px solid var(--border);background:var(--surface2);cursor:pointer;font-size:12px;font-weight:600">
              <input type="checkbox" ${s.categories[key]?'checked':''}
                onchange="aiSettings.categories['${key}']=this.checked;saveAiSettings()"
                style="accent-color:var(--accent);width:13px;height:13px"> ${label}
            </label>`).join('')}
        </div>
      </div>

      <!-- 提案の柔軟度 -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">提案の柔軟度</div>
        <div style="display:flex;gap:6px">
          ${['strict','standard','flexible'].map(v => `
            <button onclick="aiSettings.flexibility='${v}';saveAiSettings();renderAiSettings()"
              style="flex:1;padding:5px;border-radius:8px;border:1.5px solid var(--border);font-size:11px;cursor:pointer;font-family:inherit;
                background:${s.flexibility===v?'var(--accent)':'var(--surface2)'};
                color:${s.flexibility===v?'#fff':'var(--text2)'}">
              ${{strict:'がちがち',standard:'標準',flexible:'柔軟'}[v]}
            </button>`).join('')}
        </div>
      </div>

      <!-- YouTube取り込み時にチャプター取得 -->
      ${row('YouTube取り込み時にチャプターを取得', '動画説明文からタイムスタンプを解析してチャプター一覧を保存します', toggle('fetchChaptersOnImport'))}

      <!-- YouTube取り込み時に自動AI分析 -->
      ${row('YouTube取り込み時に自動AI分析', '取り込んだ動画にAIが自動でタグを追加します', toggle('autoTagOnImport'))}

      <!-- 新規タグ提案を許可 -->
      ${row('新規タグ提案を許可', 'プリセット外の新しいタグをAIが提案できます',
        `<label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" ${s.newTagProposal?'checked':''} onchange="aiSettings.newTagProposal=this.checked;saveAiSettings();renderAiSettings()" style="accent-color:var(--accent);width:14px;height:14px"> 有効
        </label>`)}

      ${s.newTagProposal ? row('承認時に自動でプリセットへ追加', '新規提案タグを承認した際にプリセットへ自動登録します', toggle('autoAddToPresets')) : ''}

      <!-- BJJ判定ルール自動追加 -->
      ${row('BJJ判定ルールの自動追加', 'AIタグ適用時に新しいパターンをBJJ判定ルールへ自動追加します', toggle('bjjRulesAutoAdd'))}

      <!-- 一括適用前の確認ダイアログ -->
      ${row('一括適用前の確認ダイアログ', '「○本に適用しますか？」の確認を表示します', toggle('bulkConfirm'))}

      <!-- D: AIモデル選択 -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">AIモデル</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Sonnetは高精度ですが1回あたり約3倍のコストがかかります（約0.3円/回 vs 0.1円/回）</div>
        <div style="display:flex;gap:6px">
          ${['haiku','sonnet'].map(v => `
            <button onclick="aiSettings.model='${v}';saveAiSettings();renderAiSettings()"
              style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);font-size:12px;cursor:pointer;font-family:inherit;font-weight:700;
                background:${s.model===v?'var(--accent)':'var(--surface2)'};
                color:${s.model===v?'#fff':'var(--text2)'}">
              ${{haiku:'⚡ Haiku（高速・低コスト）',sonnet:'🧠 Sonnet（高精度）'}[v]}
            </button>`).join('')}
        </div>
      </div>

      <!-- C: BJJ判定ルール -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <details id="bjj-rules-details">
          <summary style="font-size:12px;font-weight:600;cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:6px">
            <span style="transition:transform .2s" id="bjj-rules-arrow">▶</span>
            BJJ判定ルール（${(s.bjjRules||[]).length}件）
            <span style="font-size:10px;color:var(--text3);font-weight:400">— AIが従う推論ルールを確認・編集</span>
          </summary>
          <div style="margin-top:10px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
              AIはこのルールリストに従ってタグを判定します。追加・編集・削除が可能です。
            </div>
            <div id="bjj-rules-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
              ${(s.bjjRules||[]).map((r, i) => `
                <div style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;background:var(--surface2);border-radius:6px;font-size:11px;line-height:1.5">
                  <span style="color:var(--text3);font-weight:700;min-width:20px">${i+1}.</span>
                  <span id="bjj-rule-text-${i}" contenteditable="true"
                    onblur="window._bjjRuleEdit(${i},this.textContent)"
                    style="flex:1;color:var(--text);outline:none">${r}</span>
                  <button onclick="window._bjjRuleRemove(${i})"
                    style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0"
                    title="削除">✕</button>
                </div>`).join('')}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <input id="bjj-rule-new" placeholder="新しいルールを追加..."
                style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;
                       padding:6px 10px;font-size:12px;color:var(--text);outline:none;font-family:inherit"
                onkeydown="if(event.key==='Enter')window._bjjRuleAdd()">
              <button onclick="window._bjjRuleAdd()"
                style="padding:6px 14px;border-radius:6px;border:none;background:var(--accent);
                       color:#fff;font-size:12px;cursor:pointer;font-weight:700;white-space:nowrap">＋ 追加</button>
            </div>
            <div style="margin-top:8px;display:flex;gap:6px">
              <button onclick="window._bjjRulesReset()"
                style="padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);
                       color:var(--text3);font-size:11px;cursor:pointer;font-family:inherit">デフォルトに戻す</button>
            </div>
          </div>
        </details>
      </div>

      <!-- E: フィードバック学習 -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:12px;font-weight:600">学習データ（自動蓄積）</div>
            <div style="font-size:11px;color:var(--text3)">タグ適用時の結果をAIが次回以降の判定に活用します（最大10件）</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--accent)">${(s.feedbackExamples||[]).length}件</div>
        </div>
        ${(s.feedbackExamples||[]).length ? `
          <div style="margin-top:8px;display:flex;gap:6px">
            <button onclick="if(confirm('学習データをすべて削除しますか？')){aiSettings.feedbackExamples=[];saveAiSettings();renderAiSettings()}"
              style="padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);
                     color:var(--text3);font-size:11px;cursor:pointer;font-family:inherit">クリア</button>
          </div>` : ''}
      </div>

      <!-- 禁止リスト -->
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <details id="blocklist-details">
          <summary style="font-size:12px;font-weight:600;cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:6px">
            <span style="transition:transform .2s" id="blocklist-arrow">▶</span>
            🚫 禁止リスト（${(s.techBlocklist||[]).length}件）
            <span style="font-size:10px;color:var(--text3);font-weight:400">— AIが生成しないタグ</span>
          </summary>
          <div style="margin-top:10px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
              ここに登録されたタグはAIが提案しなくなります。仕分けモードや整理ツールから追加できます。
            </div>
            <div id="blocklist-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
              ${(s.techBlocklist||[]).length ? [...(s.techBlocklist||[])].sort((a, b) => a.localeCompare(b, 'ja')).map(t => {
                const idx = (s.techBlocklist||[]).indexOf(t);
                return `<span style="display:inline-flex;align-items:center;gap:0;padding:0;border-radius:12px;
                  background:#ef444411;border:1.5px solid #ef4444;font-size:11px;color:#ef4444;overflow:hidden">
                  <span onclick="window._blocklistMoveTo(${idx})"
                    style="cursor:pointer;padding:4px 6px;background:#3b82f6;color:#fff;font-size:10px;font-weight:700;
                           display:inline-flex;align-items:center" title="属性に移動">↩</span>
                  <span style="padding:3px 4px 3px 8px">${t}</span>
                  <span onclick="aiSettings.techBlocklist.splice(${idx},1);saveAiSettings();renderAiSettings()"
                    style="cursor:pointer;font-size:11px;padding:3px 6px 3px 2px" title="禁止解除">✕</span>
                </span>`;
              }).join('') : '<span style="font-size:11px;color:var(--text3)">なし</span>'}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <input id="blocklist-new" placeholder="タグ名を入力..."
                style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;
                       padding:6px 10px;font-size:12px;color:var(--text);outline:none;font-family:inherit"
                onkeydown="if(event.key==='Enter')window._blocklistAdd()">
              <button onclick="window._blocklistAdd()"
                style="padding:6px 14px;border-radius:6px;border:none;background:#ef4444;
                       color:#fff;font-size:12px;cursor:pointer;font-weight:700;white-space:nowrap">🚫 追加</button>
            </div>
            ${(s.techBlocklist||[]).length ? `
              <div style="margin-top:8px">
                <button onclick="if(confirm('禁止リストをすべてクリアしますか？')){aiSettings.techBlocklist=[];saveAiSettings();renderAiSettings()}"
                  style="padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);
                         color:var(--text3);font-size:11px;cursor:pointer;font-family:inherit">すべてクリア</button>
              </div>` : ''}
          </div>
        </details>
      </div>

      <!-- タグ仕分けモード -->
      <div style="padding:10px 0">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">🏷️ タグ仕分けモード</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
          動画内の未分類タグを1つずつ確認し、正しい属性に分類 or 禁止リストに追加できます
        </div>
        <button onclick="window._tagSortMode()"
          style="padding:10px 20px;border-radius:10px;border:2px solid var(--accent);background:var(--accent)11;
                 color:var(--accent);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;width:100%">
          🏷️ 仕分けを開始
        </button>
      </div>

    </div>`;

  // details toggle でアロー回転
  requestAnimationFrame(() => {
    [['bjj-rules-details','bjj-rules-arrow'],['blocklist-details','blocklist-arrow']].forEach(([detId,arrId]) => {
      const det = document.getElementById(detId);
      const arr = document.getElementById(arrId);
      if (det && arr) {
        det.addEventListener('toggle', () => { arr.style.transform = det.open ? 'rotate(90deg)' : ''; });
        if (det.open) arr.style.transform = 'rotate(90deg)';
      }
    });
  });
}

// ── 禁止リスト操作 ──
window._blocklistAdd = function() {
  const inp = document.getElementById('blocklist-new');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  if (!aiSettings.techBlocklist) aiSettings.techBlocklist = [];
  if (!aiSettings.techBlocklist.includes(val)) {
    aiSettings.techBlocklist.push(val);
    saveAiSettings();
    renderAiSettings();
    requestAnimationFrame(() => {
      const det = document.getElementById('blocklist-details');
      if (det) det.open = true;
    });
    window.toast?.(`🚫 "${val}" を禁止リストに追加`);
  }
  inp.value = '';
};

// 禁止リスト → 属性に移動（ポップアップで属性選択）
window._blocklistMoveTo = function(idx) {
  const tag = aiSettings.techBlocklist?.[idx];
  if (!tag) return;

  // 既存ポップアップを消す
  document.getElementById('blocklist-move-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'blocklist-move-popup';
  popup.style.cssText = 'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.2);min-width:260px;max-width:360px';
  card.innerHTML = `
    <div style="font-size:14px;font-weight:800;margin-bottom:4px">↩ 「${tag}」を移動</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">禁止リストから外し、選択した属性の候補に追加します</div>
    <div style="display:flex;flex-direction:column;gap:6px" id="blocklist-move-btns"></div>
    <button onclick="document.getElementById('blocklist-move-popup').remove()"
      style="margin-top:12px;width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border);
             background:var(--surface2);color:var(--text3);font-size:12px;cursor:pointer;font-family:inherit">キャンセル</button>`;
  popup.appendChild(card);
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });

  const btnContainer = card.querySelector('#blocklist-move-btns');
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
  tagSettings.forEach((ts, ti) => {
    const c = colors[ti % colors.length];
    const btn = document.createElement('button');
    btn.textContent = ts.label;
    btn.style.cssText = `padding:10px;border-radius:8px;border:2px solid ${c};background:${c}11;
      color:${c};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left`;
    btn.onclick = () => {
      // 禁止リストから削除
      aiSettings.techBlocklist.splice(idx, 1);
      // 属性プリセットに追加
      if (!ts.presets.includes(tag)) ts.presets.push(tag);
      saveAiSettings();
      saveTagSettings();
      popup.remove();
      renderAiSettings();
      renderTagSettingsList();
      requestAnimationFrame(() => {
        const det = document.getElementById('blocklist-details');
        if (det) det.open = true;
      });
      window.toast?.(`↩ 「${tag}」を ${ts.label} に移動`);
    };
    btnContainer.appendChild(btn);
  });

  // 「禁止解除のみ」ボタン
  const releaseBtn = document.createElement('button');
  releaseBtn.textContent = '禁止解除のみ（属性に追加しない）';
  releaseBtn.style.cssText = 'padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;cursor:pointer;font-family:inherit;text-align:left';
  releaseBtn.onclick = () => {
    aiSettings.techBlocklist.splice(idx, 1);
    saveAiSettings();
    popup.remove();
    renderAiSettings();
    requestAnimationFrame(() => {
      const det = document.getElementById('blocklist-details');
      if (det) det.open = true;
    });
    window.toast?.(`✅ 「${tag}」の禁止を解除`);
  };
  btnContainer.appendChild(releaseBtn);
};

export function setAiDefaultMode(mode) {
  aiSettings.defaultMode = mode;
  saveAiSettings();
  renderAiSettings();
}

// ── BJJルール操作 ──
window._bjjRuleAdd = function() {
  const inp = document.getElementById('bjj-rule-new');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  if (!aiSettings.bjjRules) aiSettings.bjjRules = [];
  aiSettings.bjjRules.push(val);
  saveAiSettings();
  renderAiSettings();
  // 追加後 details を開いた状態に復元
  requestAnimationFrame(() => {
    const det = document.getElementById('bjj-rules-details');
    if (det) det.open = true;
  });
};

window._bjjRuleRemove = function(i) {
  if (!aiSettings.bjjRules) return;
  aiSettings.bjjRules.splice(i, 1);
  saveAiSettings();
  renderAiSettings();
  requestAnimationFrame(() => {
    const det = document.getElementById('bjj-rules-details');
    if (det) det.open = true;
  });
};

window._bjjRuleEdit = function(i, text) {
  if (!aiSettings.bjjRules) return;
  const trimmed = text.trim();
  if (!trimmed) {
    // 空にした場合は削除
    aiSettings.bjjRules.splice(i, 1);
  } else {
    aiSettings.bjjRules[i] = trimmed;
  }
  saveAiSettings();
};

window._bjjRulesReset = function() {
  if (!confirm('BJJ判定ルールをデフォルトに戻しますか？カスタマイズした内容は失われます。')) return;
  aiSettings.bjjRules = [...DEFAULT_BJJ_RULES];
  saveAiSettings();
  renderAiSettings();
  requestAnimationFrame(() => {
    const det = document.getElementById('bjj-rules-details');
    if (det) det.open = true;
  });
};

// ════════════════════════════════════════════════════════
// テクニック整理ツール
// ════════════════════════════════════════════════════════

// ── ポジション・アクション関連キーワード（誤分類検出用） ──
const _POS_KEYWORDS = [
  'ガード','マウント','サイド','ハーフ','バック','タートル','亀','ニーオン',
  'デラヒーバ','DLR','ラッソ','スパイダー','バタフライ','Xガード','50/50',
  'オープン','クローズド','ニーシールド','スタンディング','standing',
];
const _AC_KEYWORDS = [
  'パスガード','パス','スイープ','sweep','エスケープ','escape','テイクダウン',
  'takedown','リテンション','retention','コントロール','control',
  'ディフェンス','defense',
];
// Technique に本来属するべきもの（削除対象から除外）
const _LEGIT_TECH_PATTERNS = [
  'RNC','ギロチン','アナコンダ','ダース','チョーク','絞め','アームバー',
  'キムラ','アメリカーナ','オモプラッタ','ヒールフック','ニーバー',
  'トーホールド','アンクルロック','カーフスライサー','ベリンボロ',
  'レッグドラッグ','スタックパス','スマッシュパス','ニーカット',
  'ダブルレッグ','シングルレッグ','バックテイク','ボウアンドアロー',
  'ノースサウス','ブルファイター','トレアンダー','バックステップ',
  'X-パス','ロック','アームロック','レッグロック','ラペル','ワーム',
];

function _analyzeTechTags(tagIdx) {
  const presets = tagSettings[tagIdx].presets;
  const videos  = window.videos || [];

  // 各タグの使用回数を集計
  const usageCount = {};
  presets.forEach(t => { usageCount[t] = 0; });
  videos.forEach(v => {
    (v.tags || []).forEach(t => { usageCount[t] = (usageCount[t] || 0) + 1; });
  });

  // 1. 重複グループ検出（部分文字列関係）
  const sorted = [...presets].sort((a, b) => a.length - b.length);
  const duplicateGroups = [];
  const inGroup = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (inGroup.has(sorted[i])) continue;
    const group = [sorted[i]];
    for (let j = i + 1; j < sorted.length; j++) {
      if (inGroup.has(sorted[j])) continue;
      if (sorted[j].includes(sorted[i]) || sorted[i].includes(sorted[j])) {
        group.push(sorted[j]);
        inGroup.add(sorted[j]);
      }
    }
    if (group.length > 1) {
      inGroup.add(sorted[i]);
      duplicateGroups.push(group);
    }
  }

  // 2. カテゴリ誤分類の検出
  const miscat = [];
  presets.forEach(t => {
    // 正当なテクニック名に該当するなら除外
    if (_LEGIT_TECH_PATTERNS.some(p => t.includes(p))) return;

    const tLower = t.toLowerCase();
    const isPos = _POS_KEYWORDS.some(k => tLower.includes(k.toLowerCase()));
    const isAc  = _AC_KEYWORDS.some(k => tLower.includes(k.toLowerCase()));

    if (isPos && !isAc) {
      miscat.push({ tag: t, suggestion: 'position', reason: 'ポジション名' });
    } else if (isAc && !isPos) {
      miscat.push({ tag: t, suggestion: 'action', reason: 'アクション名' });
    } else if (isPos && isAc) {
      miscat.push({ tag: t, suggestion: 'decompose', reason: 'ポジション＋アクションの複合' });
    }
  });

  // 3. 未使用タグ（動画で一度も使われていないプリセット）
  const unused = presets.filter(t => !usageCount[t]);

  return { duplicateGroups, miscat, unused, usageCount };
}

window._techCleanup = function(tagIdx) {
  document.getElementById('tech-cleanup-modal')?.remove();

  const analysis = _analyzeTechTags(tagIdx);
  const { duplicateGroups, miscat, unused, usageCount } = analysis;

  if (!duplicateGroups.length && !miscat.length && !unused.length) {
    window.toast?.('✅ 問題は検出されませんでした');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'tech-cleanup-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';

  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--surface);border-radius:16px;width:95%;max-width:640px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);max-height:85vh;overflow-y:auto';

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800">🔧 テクニック整理ツール</div>
      <button onclick="document.getElementById('tech-cleanup-modal').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);padding:4px 8px">✕</button>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:16px">
      チェックを入れた項目が削除されます。「統合先」がある場合、動画のタグは自動でリネームされます。
    </div>`;

  // ── 重複グループ ──
  if (duplicateGroups.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px;border-bottom:1.5px solid var(--accent);padding-bottom:4px">
      📋 重複グループ（${duplicateGroups.length}件）</div>`;
    duplicateGroups.forEach((group, gi) => {
      // 使用回数が最も多い or 最も長い名前を推奨として選択
      const best = group.reduce((a, b) => (usageCount[b] || 0) > (usageCount[a] || 0) ? b : (usageCount[b] === usageCount[a] && b.length > a.length ? b : a));
      html += `<div style="background:var(--surface2);border-radius:8px;padding:10px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:6px">グループ ${gi + 1} — 統合先を1つ選んでください</div>
        <div style="display:flex;flex-direction:column;gap:4px">`;
      group.forEach(t => {
        const isBest = t === best;
        html += `<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;${isBest ? 'font-weight:700;color:var(--text)' : 'color:var(--text2)'}">
          <input type="radio" name="dup-g${gi}" value="${_esc(t)}" ${isBest ? 'checked' : ''} style="accent-color:var(--accent)">
          ${_esc(t)} <span style="font-size:10px;color:var(--text3)">(${usageCount[t] || 0}本)</span>
        </label>`;
      });
      html += `</div></div>`;
    });
  }

  // ── カテゴリ誤分類 ──
  if (miscat.length) {
    html += `<div style="font-size:12px;font-weight:700;color:#f97316;margin:12px 0 8px;border-bottom:1.5px solid #f97316;padding-bottom:4px">
      ⚠️ カテゴリ誤分類の可能性（${miscat.length}件）</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:8px">
        これらはTechniqueではなく、Position・Actionの組み合わせで表現すべきタグです。<br>
        チェックを入れるとTechniqueから削除されます（動画からも外れます）。
      </div>`;
    miscat.forEach((m, mi) => {
      const reasonBadge = {
        position:  '→ Position',
        action:    '→ Action',
        decompose: '→ Position + Action に分解',
      }[m.suggestion] || '';
      html += `<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:12px">
        <input type="checkbox" data-miscat="${mi}" checked style="accent-color:#f97316;width:14px;height:14px">
        <span style="flex:1">${_esc(m.tag)}</span>
        <span style="font-size:10px;color:#f97316;font-weight:600">${m.reason} ${reasonBadge}</span>
        <span style="font-size:10px;color:var(--text3)">(${usageCount[m.tag] || 0}本)</span>
      </label>`;
    });
  }

  // ── 未使用タグ ──
  if (unused.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--text3);margin:12px 0 8px;border-bottom:1.5px solid var(--border);padding-bottom:4px">
      🗑️ 未使用タグ（${unused.length}件） — どの動画にも使われていません</div>`;
    html += `<label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:var(--text3);cursor:pointer">
      <input type="checkbox" id="unused-select-all" onchange="document.querySelectorAll('[data-unused]').forEach(c=>c.checked=this.checked)" checked> すべて選択
    </label>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">`;
    unused.forEach((t, ui) => {
      html += `<label style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;border:1.5px dashed var(--border);font-size:11px;color:var(--text3);cursor:pointer">
        <input type="checkbox" data-unused="${ui}" data-tag="${_esc(t)}" checked style="width:12px;height:12px"> ${_esc(t)}
      </label>`;
    });
    html += `</div>`;
  }

  html += `
    <div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1.5px solid var(--border)">
      <button id="tech-cleanup-apply"
        style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent);color:var(--on-accent);
               font-size:14px;font-weight:700;cursor:pointer">
        ✓ 整理を適用
      </button>
      <button onclick="document.getElementById('tech-cleanup-modal').remove()"
        style="padding:12px 20px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2);
               color:var(--text);font-size:14px;cursor:pointer">キャンセル</button>
    </div>`;

  sheet.innerHTML = html;
  modal.appendChild(sheet);
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // ── 適用ボタン ──
  document.getElementById('tech-cleanup-apply').onclick = function() {
    _applyTechCleanup(tagIdx, analysis);
  };
};

function _esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _applyTechCleanup(tagIdx, analysis) {
  const modal = document.getElementById('tech-cleanup-modal');
  if (!modal) return;

  const videos = window.videos || [];
  const presets = tagSettings[tagIdx].presets;
  const toRemove = new Set();
  const renameMap = {}; // oldTag → newTag
  let removeCount = 0, renameCount = 0;

  // 1. 重複グループ: 選択されなかったものを削除し、統合先にリネーム
  analysis.duplicateGroups.forEach((group, gi) => {
    const radios = modal.querySelectorAll(`input[name="dup-g${gi}"]`);
    let keep = '';
    radios.forEach(r => { if (r.checked) keep = r.value; });
    if (!keep) return;
    group.forEach(t => {
      if (t !== keep) {
        toRemove.add(t);
        renameMap[t] = keep;
      }
    });
  });

  // 2. カテゴリ誤分類: チェックされたものを削除
  analysis.miscat.forEach((m, mi) => {
    const cb = modal.querySelector(`input[data-miscat="${mi}"]`);
    if (cb?.checked) toRemove.add(m.tag);
  });

  // 3. 未使用タグ: チェックされたものを削除
  modal.querySelectorAll('input[data-unused]').forEach(cb => {
    if (cb.checked) toRemove.add(cb.dataset.tag);
  });

  if (!toRemove.size) {
    window.toast?.('変更対象がありません');
    return;
  }

  // プリセットから削除
  tagSettings[tagIdx].presets = presets.filter(t => !toRemove.has(t));

  // 動画のテクニックタグを更新
  videos.forEach(v => {
    if (!v.tags?.length) return;
    const newTags = [];
    v.tags.forEach(t => {
      if (toRemove.has(t)) {
        if (renameMap[t]) {
          if (!newTags.includes(renameMap[t])) { newTags.push(renameMap[t]); renameCount++; }
        }
        removeCount++;
      } else {
        if (!newTags.includes(t)) newTags.push(t);
      }
    });
    v.tags = newTags;
  });

  // 削除されたタグ（リネーム先があるもの以外）を禁止リストに追加
  const blockedTags = [...toRemove].filter(t => !renameMap[t]);
  if (blockedTags.length) {
    if (!aiSettings.techBlocklist) aiSettings.techBlocklist = [];
    blockedTags.forEach(t => {
      if (!aiSettings.techBlocklist.includes(t)) aiSettings.techBlocklist.push(t);
    });
    saveAiSettings();
  }

  saveTagSettings();
  window.debounceSave?.();

  modal.remove();
  renderTagSettingsList();
  const blockNote = blockedTags.length ? `, ${blockedTags.length}件禁止リスト追加` : '';
  window.toast?.(`🔧 ${toRemove.size}件削除, ${renameCount}件リネーム（${removeCount}箇所の動画タグを更新${blockNote}）`);
}

// ── 一括削除モード ──
window._techBulkDelete = function(tagIdx) {
  const presets = tagSettings[tagIdx].presets;
  if (!presets.length) { window.toast?.('候補が空です'); return; }

  document.getElementById('tech-cleanup-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tech-cleanup-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';

  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--surface);border-radius:16px;width:95%;max-width:640px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2);max-height:85vh;overflow-y:auto';

  const videos = window.videos || [];
  const usageCount = {};
  presets.forEach(t => { usageCount[t] = 0; });
  videos.forEach(v => (v.tags || []).forEach(t => { usageCount[t] = (usageCount[t] || 0) + 1; }));

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800">🗑️ 一括削除モード</div>
      <button onclick="document.getElementById('tech-cleanup-modal').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);padding:4px 8px">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button onclick="document.querySelectorAll('#bulk-del-list input').forEach(c=>c.checked=true)"
        style="padding:4px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;cursor:pointer;font-family:inherit">全選択</button>
      <button onclick="document.querySelectorAll('#bulk-del-list input').forEach(c=>c.checked=false)"
        style="padding:4px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;cursor:pointer;font-family:inherit">全解除</button>
      <button onclick="document.querySelectorAll('#bulk-del-list input').forEach(c=>{if(c.dataset.cnt==='0')c.checked=true;else c.checked=false})"
        style="padding:4px 12px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:11px;cursor:pointer;font-family:inherit">未使用のみ選択</button>
    </div>
    <div id="bulk-del-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px">`;

  presets.forEach(t => {
    const cnt = usageCount[t] || 0;
    html += `<label style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;
      border:1.5px solid var(--border);font-size:11px;color:var(--text2);cursor:pointer;background:var(--surface2)">
      <input type="checkbox" data-tag="${_esc(t)}" data-cnt="${cnt}" style="width:12px;height:12px">
      ${_esc(t)} <span style="font-size:9px;color:var(--text3)">${cnt}</span>
    </label>`;
  });

  html += `</div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;color:var(--text2);cursor:pointer">
      <input type="checkbox" id="bulk-del-block" checked style="accent-color:#ef4444;width:14px;height:14px">
      削除したタグを禁止リストにも追加（AIが再生成しなくなります）
    </label>
    <div style="display:flex;gap:8px">
      <button id="bulk-del-apply"
        style="flex:1;padding:12px;border-radius:10px;border:none;background:#ef4444;color:#fff;
               font-size:14px;font-weight:700;cursor:pointer">
        🗑️ 選択したタグを削除
      </button>
      <button onclick="document.getElementById('tech-cleanup-modal').remove()"
        style="padding:12px 20px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2);
               color:var(--text);font-size:14px;cursor:pointer">キャンセル</button>
    </div>`;

  sheet.innerHTML = html;
  modal.appendChild(sheet);
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  document.getElementById('bulk-del-apply').onclick = function() {
    const toDel = new Set();
    modal.querySelectorAll('#bulk-del-list input:checked').forEach(cb => toDel.add(cb.dataset.tag));
    if (!toDel.size) { window.toast?.('選択されていません'); return; }
    if (!confirm(`${toDel.size}件のテクニックタグを削除します。動画からも削除されます。よろしいですか？`)) return;

    tagSettings[tagIdx].presets = tagSettings[tagIdx].presets.filter(t => !toDel.has(t));
    let vidCount = 0;
    videos.forEach(v => {
      if (!v.tags?.length) return;
      const before = v.tags.length;
      v.tags = v.tags.filter(t => !toDel.has(t));
      if (v.tags.length !== before) vidCount++;
    });

    // 禁止リストへの追加
    const addToBlock = modal.querySelector('#bulk-del-block')?.checked;
    if (addToBlock) {
      if (!aiSettings.techBlocklist) aiSettings.techBlocklist = [];
      toDel.forEach(t => {
        if (!aiSettings.techBlocklist.includes(t)) aiSettings.techBlocklist.push(t);
      });
      saveAiSettings();
    }

    saveTagSettings();
    window.debounceSave?.();
    modal.remove();
    renderTagSettingsList();
    const blockNote = addToBlock ? `, 禁止リストに追加` : '';
    window.toast?.(`🗑️ ${toDel.size}件削除（${vidCount}本の動画から削除${blockNote}）`);
  };
};

// ════════════════════════════════════════════════════════
// タグ仕分けモード（Googleフォト風カードレビュー）
// ════════════════════════════════════════════════════════

function _collectUnclassifiedTags() {
  // 全属性のプリセットを収集
  const allPresets = new Map(); // tag → { key, idx }
  tagSettings.forEach((ts, idx) => {
    ts.presets.forEach(p => allPresets.set(p, { key: ts.key, idx }));
  });
  const blocklist = new Set(aiSettings.techBlocklist || []);

  // 動画データから全ユニークタグを収集（どの属性にも未登録のもの）
  const videos = window.videos || [];
  const unclassified = new Map(); // tag → { count, sources: Set<key> }

  ['tb', 'cat', 'pos', 'tags'].forEach(field => {
    videos.forEach(v => {
      (v[field] || []).forEach(tag => {
        if (allPresets.has(tag)) return; // 既にプリセットに登録済み
        if (blocklist.has(tag)) return;  // 既に禁止リスト
        if (!unclassified.has(tag)) {
          unclassified.set(tag, { count: 0, sources: new Set() });
        }
        const entry = unclassified.get(tag);
        entry.count++;
        entry.sources.add(field);
      });
    });
  });

  // countで降順ソート
  return [...unclassified.entries()]
    .map(([tag, info]) => ({ tag, count: info.count, sources: [...info.sources] }))
    .sort((a, b) => b.count - a.count);
}

window._tagSortMode = function() {
  document.getElementById('tech-cleanup-modal')?.remove();

  const items = _collectUnclassifiedTags();
  if (!items.length) {
    window.toast?.('✅ 未分類のタグはありません');
    return;
  }

  let currentIdx = 0;
  const results = []; // { tag, action: 'assign'|'block'|'skip', targetKey?, targetIdx? }

  const modal = document.createElement('div');
  modal.id = 'tech-cleanup-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';

  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--surface);border-radius:16px;width:95%;max-width:480px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.2)';

  modal.appendChild(sheet);
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) _finishSort(); });

  function _renderCard() {
    if (currentIdx >= items.length) { _finishSort(); return; }
    const item = items[currentIdx];
    const sourceLabels = item.sources.map(s => ({ tb:'TB', cat:'CAT', pos:'POS', tags:'TAGS' }[s] || s)).join(', ');

    // 属性ボタンを生成
    const attrBtns = tagSettings.map((ts, i) => {
      const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
      const c = colors[i % colors.length];
      return `<button data-action="assign" data-idx="${i}"
        style="flex:1;padding:12px 4px;border-radius:10px;border:2px solid ${c};background:${c}11;
               color:${c};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;min-width:0;
               transition:all .15s">
        ${ts.label}
      </button>`;
    }).join('');

    sheet.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:13px;font-weight:800;color:var(--text3)">
          🏷️ タグ仕分け <span style="font-weight:400">${currentIdx + 1} / ${items.length}</span>
        </div>
        <button onclick="document.getElementById('tech-cleanup-modal')?._finishSort?.()"
          style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3);padding:4px 8px">✕</button>
      </div>

      <!-- プログレスバー -->
      <div style="width:100%;height:4px;background:var(--surface2);border-radius:2px;margin-bottom:20px;overflow:hidden">
        <div style="width:${(currentIdx / items.length) * 100}%;height:100%;background:var(--accent);border-radius:2px;transition:width .2s"></div>
      </div>

      <!-- タグカード -->
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:28px;font-weight:800;color:var(--text);margin-bottom:8px">${_esc(item.tag)}</div>
        <div style="font-size:12px;color:var(--text3)">
          ${item.count}本の動画で使用 ・ 現在: ${sourceLabels}
        </div>
      </div>

      <!-- このタグはどの属性？ -->
      <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;text-align:center">
        どの属性に分類しますか？
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px">
        ${attrBtns}
      </div>

      <div style="display:flex;gap:8px">
        <button data-action="block"
          style="flex:1;padding:10px;border-radius:10px;border:2px solid #ef4444;background:#ef444411;
                 color:#ef4444;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
          🚫 禁止リスト
        </button>
        <button data-action="skip"
          style="flex:1;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2);
                 color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
          ⏭️ スキップ
        </button>
      </div>

      <!-- 結果サマリ（小さく） -->
      <div style="margin-top:16px;font-size:10px;color:var(--text3);text-align:center">
        ${results.filter(r => r.action === 'assign').length}件分類 ・
        ${results.filter(r => r.action === 'block').length}件禁止 ・
        ${results.filter(r => r.action === 'skip').length}件スキップ
      </div>`;

    // ボタンイベント
    sheet.querySelectorAll('button[data-action="assign"]').forEach(btn => {
      btn.onmouseenter = () => { btn.style.transform = 'scale(1.05)'; };
      btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        results.push({ tag: item.tag, action: 'assign', targetKey: tagSettings[idx].key, targetIdx: idx });
        currentIdx++;
        _renderCard();
      };
    });
    sheet.querySelector('button[data-action="block"]').onclick = () => {
      results.push({ tag: item.tag, action: 'block' });
      currentIdx++;
      _renderCard();
    };
    sheet.querySelector('button[data-action="skip"]').onclick = () => {
      results.push({ tag: item.tag, action: 'skip' });
      currentIdx++;
      _renderCard();
    };
  }

  function _finishSort() {
    const assigned = results.filter(r => r.action === 'assign');
    const blocked  = results.filter(r => r.action === 'block');

    if (!assigned.length && !blocked.length) {
      modal.remove();
      return;
    }

    // 確認画面を表示
    let summaryHtml = `
      <div style="font-size:15px;font-weight:800;margin-bottom:16px">📊 仕分け結果</div>`;

    if (assigned.length) {
      const byTarget = {};
      assigned.forEach(r => {
        const label = tagSettings[r.targetIdx].label;
        if (!byTarget[label]) byTarget[label] = [];
        byTarget[label].push(r.tag);
      });
      summaryHtml += `<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px">✅ 分類 (${assigned.length}件)</div>`;
      Object.entries(byTarget).forEach(([label, tags]) => {
        summaryHtml += `<div style="margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;color:var(--text2)">${label}:</span>
          <span style="font-size:11px;color:var(--text3)">${tags.join(', ')}</span>
        </div>`;
      });
    }

    if (blocked.length) {
      summaryHtml += `<div style="font-size:12px;font-weight:700;color:#ef4444;margin:8px 0">🚫 禁止リスト (${blocked.length}件)</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${blocked.map(r => r.tag).join(', ')}</div>`;
    }

    summaryHtml += `
      <div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1.5px solid var(--border)">
        <button id="sort-apply-btn"
          style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent);color:var(--on-accent);
                 font-size:14px;font-weight:700;cursor:pointer">✓ 適用</button>
        <button onclick="document.getElementById('tech-cleanup-modal').remove()"
          style="padding:12px 20px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface2);
                 color:var(--text);font-size:14px;cursor:pointer">キャンセル</button>
      </div>`;

    sheet.innerHTML = summaryHtml;

    document.getElementById('sort-apply-btn').onclick = () => {
      // 分類を適用: プリセットに追加
      assigned.forEach(r => {
        if (!tagSettings[r.targetIdx].presets.includes(r.tag)) {
          tagSettings[r.targetIdx].presets.push(r.tag);
        }
      });

      // 禁止リストに追加
      blocked.forEach(r => {
        if (!aiSettings.techBlocklist.includes(r.tag)) {
          aiSettings.techBlocklist.push(r.tag);
        }
      });

      // 禁止リストに入ったタグは全動画から削除
      if (blocked.length) {
        const blockSet = new Set(blocked.map(r => r.tag));
        (window.videos || []).forEach(v => {
          ['tb', 'cat', 'pos', 'tags'].forEach(field => {
            if (v[field]?.length) v[field] = v[field].filter(t => !blockSet.has(t));
          });
        });
      }

      // 分類先が異なる属性の場合、旧属性から移動
      assigned.forEach(r => {
        const targetField = r.targetKey;
        const FIELD_MAP = { tb: 'tb', cat: 'cat', pos: 'pos', tags: 'tags' };
        (window.videos || []).forEach(v => {
          // 全フィールドをチェック、targetField以外にあれば移動
          Object.values(FIELD_MAP).forEach(field => {
            if (field === targetField) return;
            const arr = v[field];
            if (!arr) return;
            const idx = arr.indexOf(r.tag);
            if (idx !== -1) {
              arr.splice(idx, 1);
              if (!v[targetField]) v[targetField] = [];
              if (!v[targetField].includes(r.tag)) v[targetField].push(r.tag);
            }
          });
        });
      });

      saveTagSettings();
      saveAiSettings();
      window.debounceSave?.();
      modal.remove();
      renderTagSettingsList();
      window.toast?.(`🏷️ ${assigned.length}件分類, ${blocked.length}件禁止リスト追加`);
    };
  }

  modal._finishSort = _finishSort;
  _renderCard();
};

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
