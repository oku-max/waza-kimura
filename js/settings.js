// ═══ WAZA KIMURA — タグ設定 ═══

const DEFAULT_TAG_SETTINGS = [
  { key:'tb',   label:'TOP/BOTTOM', visible:true,  presets:['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'] },
  { key:'ac',   label:'Action',     visible:true,  presets:['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'] },
  { key:'pos',  label:'Position',   visible:true,  presets:['サイドコントロール','マウント','クローズドガード','ニーオン','ハーフガード','バタフライ','Xガード','デラヒーバ','バック','タートル','オープンガード','50/50','スタンディング','その他'] },
  { key:'tech', label:'Technique',  visible:true,  presets:[] },
];

export let tagSettings = DEFAULT_TAG_SETTINGS.map(d => ({ ...d, presets: [...d.presets] }));

// ── aiSettings ──
const DEFAULT_BJJ_RULES = [
  // ── TOP/BOTTOM 判定 ──
  'ガード全般（クローズド、ハーフ、オープン、バタフライ等）はTOP/BOTTOM=ボトム。ただし「パスガード」「ガードパス」「pass」はTOP/BOTTOM=トップ',
  'スイープ（sweep）はTOP/BOTTOM=ボトム（ボトムから仕掛ける技）',
  'マウントエスケープ・サイドエスケープ等「エスケープ」はTOP/BOTTOM=ボトム（不利ポジションから逃げる側）',
  'バックコントロール・バックテイクの攻め側はTOP/BOTTOM=バック',
  'テイクダウン（takedown, single leg, double leg）はTOP/BOTTOM=スタンディング',
  'ドリル動画（drill, 反復練習）はTOP/BOTTOM=ドリル, ACTION=ドリル',
  // ── ACTION 判定 ──
  'サブミッション（絞め・関節技）の仕掛けはACTION=フィニッシュ',
  'サブミッションのディフェンスや脱出はACTION=エスケープ・ディフェンス',
  'スイープ（相手をひっくり返す技）はACTION=スイープ',
  'パスガード（ガードを越える技）はACTION=パスガード',
  'ガードリテンション（ガードを維持する技術）はACTION=リテンション',
  'テイクダウン（standing→ground）はACTION=テイクダウン',
  'ポジションキープ・圧力維持はACTION=コントロール',
  // ── POSITION 判定 ──
  'closed guard / クローズドガード → POSITION=クローズドガード',
  'half guard / ハーフガード / underhook half → POSITION=ハーフガード',
  'deep half / ディープハーフ → POSITION=ハーフガード',
  'mount / マウント → POSITION=マウント',
  'side control / side mount / サイド / 袈裟固め → POSITION=サイドコントロール',
  'knee on belly / ニーオン → POSITION=ニーオン',
  'back control / back mount / バック → POSITION=バック',
  'turtle / 亀 / がめ → POSITION=タートル',
  'X guard / SLX / single leg X → POSITION=Xガード',
  'De La Riva / DLR / デラヒーバ → POSITION=デラヒーバ',
  'butterfly guard / バタフライ → POSITION=バタフライ',
  'spider guard / lasso / スパイダー / ラッソー → POSITION=スパイダー・ラッソー',
  '50/50 / fifty-fifty → POSITION=50/50',
  'standing / スタンディング / 立ち技 → POSITION=スタンディング',
  // ── 複合判定 ──
  'タイトルに複数の技が含まれる場合（例: チャプターごとに異なる技）、すべてのタグを配列に含める',
  'レッグロック系（ヒールフック、ニーバー等）で特にポジション記載がなければPOSITION=オープンガード or 50/50 を検討',
  'ベリンボロ（berimbolo）はACTION=スイープ or アタック、TECHNIQUE=ベリンボロ',
];

export let aiSettings = {
  enabled:               true,
  defaultMode:           'add',
  categories:            { tb: true, action: true, position: true, tech: true },
  autoTagOnImport:       false,
  fetchChaptersOnImport: true,
  bulkConfirm:           true,
  newTagProposal:        true,
  flexibility:           'standard',
  autoAddToPresets:      false,
  model:                 'haiku',
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
  ['tb','ac','pos','tech'].forEach(key => {
    const ts = tagSettings.find(t => t.key === key);
    document.body.classList.toggle('hide-' + key, ts ? !ts.visible : false);
  });
}

export function renderSettings() {
  renderTagSettingsList();
  renderTagVisibilityBtns();
  renderAiSettings();
}

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
        <button onclick="addTagPreset(${i})" style="padding:4px 12px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-size:12px;cursor:pointer">＋</button>
      </div>
      ${tag.key === 'tech' ? `
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
    tagSettings[i].presets.forEach(function(p, pi) {
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
        ['tb','ac','pos','tech'].forEach(function(f) {
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
  const catLabels = { tb: 'TOP/BOTTOM', action: 'ACTION', position: 'POSITION', tech: 'TECHNIQUE' };
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
                ${s.defaultMode===v?'background:var(--accent);color:#fff;border:none':'background:var(--surface2);color:var(--text);border:1.5px solid var(--border)'}">
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
                return `<span style="display:inline-flex;align-items:center;gap:2px;padding:3px 4px 3px 8px;border-radius:12px;
                  background:#ef444411;border:1.5px solid #ef4444;font-size:11px;color:#ef4444">
                  ${t}
                  <span onclick="window._blocklistMoveTo(${idx})"
                    style="cursor:pointer;font-size:10px;padding:1px 3px;border-radius:6px;opacity:.6" title="属性に移動">↩</span>
                  <span onclick="aiSettings.techBlocklist.splice(${idx},1);saveAiSettings();renderAiSettings()"
                    style="cursor:pointer;font-size:11px;padding:1px 3px" title="禁止解除">✕</span>
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
    (v.tech || []).forEach(t => { usageCount[t] = (usageCount[t] || 0) + 1; });
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
        style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent);color:#fff;
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
    if (!v.tech?.length) return;
    const newTech = [];
    v.tech.forEach(t => {
      if (toRemove.has(t)) {
        if (renameMap[t]) {
          if (!newTech.includes(renameMap[t])) { newTech.push(renameMap[t]); renameCount++; }
        }
        removeCount++;
      } else {
        if (!newTech.includes(t)) newTech.push(t);
      }
    });
    v.tech = newTech;
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
  videos.forEach(v => (v.tech || []).forEach(t => { usageCount[t] = (usageCount[t] || 0) + 1; }));

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
      if (!v.tech?.length) return;
      const before = v.tech.length;
      v.tech = v.tech.filter(t => !toDel.has(t));
      if (v.tech.length !== before) vidCount++;
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

  ['tb', 'ac', 'pos', 'tech'].forEach(field => {
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
    const sourceLabels = item.sources.map(s => ({ tb:'TB', ac:'AC', pos:'POS', tech:'TECH' }[s] || s)).join(', ');

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
          style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--accent);color:#fff;
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
          ['tb', 'ac', 'pos', 'tech'].forEach(field => {
            if (v[field]?.length) v[field] = v[field].filter(t => !blockSet.has(t));
          });
        });
      }

      // 分類先が異なる属性の場合、旧属性から移動
      assigned.forEach(r => {
        const targetField = r.targetKey;
        const FIELD_MAP = { tb: 'tb', ac: 'ac', pos: 'pos', tech: 'tech' };
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
