// ═══ WAZA KIMURA — タグ設定 ═══

const DEFAULT_TAG_SETTINGS = [
  { key:'tb',   label:'TOP/BOTTOM', visible:true,  presets:['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'] },
  { key:'ac',   label:'Action',     visible:true,  presets:['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'] },
  { key:'pos',  label:'Position',   visible:true,  presets:['サイドコントロール','マウント','クローズドガード','ニーオン','ハーフガード','バタフライ','Xガード','デラヒーバ','バック','タートル','オープンガード','50/50','スタンディング','その他'] },
  { key:'tech', label:'Technique',  visible:true,  presets:[] },
];

export let tagSettings = DEFAULT_TAG_SETTINGS.map(d => ({ ...d, presets: [...d.presets] }));

// ── aiSettings ──
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
      </div>`;
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
  const fromLibrary = [...new Set((window.videos||[]).flatMap(v => v[key]||[]))].filter(t => !existing.has(t)).sort();
  if (!fromLibrary.length) return;
  const sep = document.createElement('div');
  sep.style.cssText = 'width:100%;margin:8px 0 5px;font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.04em;';
  sep.textContent = 'ライブラリ内の既存データ（タップで候補に追加）';
  el.appendChild(sep);
  fromLibrary.forEach(function(t) {
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:var(--surface);border:1.5px dashed var(--border);font-size:11px;color:var(--text3);cursor:pointer;';
    chip.textContent = '＋ ' + t;
    chip.onclick = function() {
      if (!tagSettings[i].presets.includes(t)) {
        tagSettings[i].presets.push(t);
        saveTagSettings();
        renderTagPresets(i);
      }
    };
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

    </div>`;
}

export function setAiDefaultMode(mode) {
  aiSettings.defaultMode = mode;
  saveAiSettings();
  renderAiSettings();
}
