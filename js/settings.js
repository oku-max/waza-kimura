// ═══ WAZA KIMURA — タグ設定 ═══

const DEFAULT_TAG_SETTINGS = [
  { key:'tb',   label:'TOP/BOTTOM', visible:true,  presets:['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'] },
  { key:'ac',   label:'Action',     visible:true,  presets:['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'] },
  { key:'pos',  label:'Position',   visible:true,  presets:['サイドコントロール','マウント','クローズドガード','ニーオン','ハーフガード','バタフライ','Xガード','デラヒーバ','バック','タートル','オープンガード','50/50','スタンディング','その他'] },
  { key:'tech', label:'Technique',  visible:true,  presets:[] }
];
export let tagSettings = DEFAULT_TAG_SETTINGS.map(d => ({...d, presets:[...d.presets]}));

export function saveTagSettings() {
  try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
  window.saveUserSettings?.();
}

export function loadTagSettings() {
  try {
    const s = localStorage.getItem('wk_tagSettings');
    if (s) {
      const p = JSON.parse(s);
      if (Array.isArray(p) && p.length) {
        tagSettings = p;
        // 旧データにtbエントリがなければマイグレーション追加
        DEFAULT_TAG_SETTINGS.forEach(def => {
          if (!tagSettings.find(t => t.key === def.key)) {
            tagSettings.unshift({...def, presets:[...def.presets]});
          }
        });
      }
    }
  } catch(e) {}
}
loadTagSettings();

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
          <input type="checkbox" ${tag.visible?'checked':''} onchange="tagSettings[${i}].visible=this.checked;saveTagSettings();renderTagVisibilityBtns()">
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
  const fieldMap = { ac:'ac', pos:'pos', tech:'tech' };
  const field = fieldMap[key];
  if (!field) return;
  const existing = new Set(tagSettings[i].presets);
  const fromLibrary = [...new Set((window.videos||[]).flatMap(v => v[field]||[]))].filter(t => !existing.has(t)).sort();
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

// ══════════════════════════════════════
// AI タグ設定
// ══════════════════════════════════════

export let aiSettings = {
  enabled:          true,
  defaultMode:      'add',
  categories:       { tb: true, action: true, position: true, tech: true },
  autoTagOnImport:  false,
  bulkConfirm:      true,
  newTagProposal:   true,       // 設定外タグを「新規追加」として提案
  flexibility:      'standard', // 'strict' | 'standard' | 'flexible'
  autoAddToPresets: false,      // 新規タグをpresetに自動登録
};

export function saveAiSettings() {
  try { localStorage.setItem('wk_aiSettings', JSON.stringify(aiSettings)); } catch(e) {}
  window.aiSettings = aiSettings;
  window.saveUserSettings?.();
}

export function loadAiSettings() {
  try {
    const s = localStorage.getItem('wk_aiSettings');
    if (s) {
      const p = JSON.parse(s);
      aiSettings = { ...aiSettings, ...p, categories: { ...aiSettings.categories, ...(p.categories || {}) } };
    }
  } catch(e) {}
  window.aiSettings = aiSettings;
}
loadAiSettings();

export function renderAiSettings() {
  const el = document.getElementById('ai-settings-container');
  if (!el) return;

  const s = aiSettings;
  const catLabels = { tb: 'TOP/BOTTOM', action: 'ACTION', position: 'POSITION', tech: 'TECHNIQUE' };

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">AIタグ機能</div>
        <div style="font-size:11px;color:var(--text3)">🤖 AIタグ提案ボタンの有効/無効</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-enabled" ${s.enabled ? 'checked' : ''}
          onchange="aiSettings.enabled=this.checked;saveAiSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>

    <div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">デフォルト適用モード</div>
      <div style="display:flex;gap:8px">
        <button id="ai-mode-btn-add" onclick="setAiDefaultMode('add')"
          style="padding:6px 18px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;
            ${s.defaultMode === 'add' ? 'background:var(--accent);color:#fff;border:none' : 'background:var(--surface2);color:var(--text);border:1.5px solid var(--border)'}">
          ＋ 追加
        </button>
        <button id="ai-mode-btn-overwrite" onclick="setAiDefaultMode('overwrite')"
          style="padding:6px 18px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;
            ${s.defaultMode === 'overwrite' ? 'background:var(--accent);color:#fff;border:none' : 'background:var(--surface2);color:var(--text);border:1.5px solid var(--border)'}">
          上書き
        </button>
      </div>
    </div>

    <div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">提案するカテゴリ</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${Object.entries(catLabels).map(([key, label]) => `
          <label style="display:flex;align-items:center;gap:6px;padding:6px 14px;
            border-radius:20px;border:1.5px solid var(--border);background:var(--surface2);
            cursor:pointer;font-size:12px;font-weight:600">
            <input type="checkbox" ${s.categories[key] ? 'checked' : ''}
              onchange="aiSettings.categories['${key}']=this.checked;saveAiSettings()"
              style="accent-color:var(--accent);width:13px;height:13px"> ${label}
          </label>`).join('')}
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">YouTube取り込み時に自動AI分析</div>
        <div style="font-size:11px;color:var(--text3)">取り込んだ動画にAIが自動でタグを追加します</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-auto-import" ${s.autoTagOnImport ? 'checked' : ''}
          onchange="aiSettings.autoTagOnImport=this.checked;saveAiSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">一括適用前の確認ダイアログ</div>
        <div style="font-size:11px;color:var(--text3)">「○本に適用しますか？」の確認を表示します</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-bulk-confirm" ${s.bulkConfirm ? 'checked' : ''}
          onchange="aiSettings.bulkConfirm=this.checked;saveAiSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">新規タグ提案</div>
        <div style="font-size:11px;color:var(--text3)">設定外の用語を「◯◯（新規追加）」として提案します</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-new-tag" ${s.newTagProposal ? 'checked' : ''}
          onchange="aiSettings.newTagProposal=this.checked;saveAiSettings();renderAiSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>

    ${s.newTagProposal ? `
    <div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">提案の柔軟性</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">新規タグをどれくらい積極的に提案するか</div>
      <div style="display:flex;gap:6px">
        ${[['strict','がちがち'],['standard','標準'],['flexible','柔軟']].map(([val, label]) => `
          <button onclick="aiSettings.flexibility='${val}';saveAiSettings();renderAiSettings()"
            style="flex:1;padding:7px 4px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;
              ${s.flexibility===val ? 'background:var(--accent);color:#fff;border:none' : 'background:var(--surface2);color:var(--text);border:1.5px solid var(--border)'}">
            ${label}
          </button>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:7px">
        ${{strict:'設定済みpresetのみ提案（新規なし）',standard:'タイトルに明確な用語があれば新規提案',flexible:'関連する用語・技術名を積極的に新規提案'}[s.flexibility]}
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:2px">新規タグをプリセットに自動登録</div>
        <div style="font-size:11px;color:var(--text3)">採用した新規タグをタグ管理のpresetにも追加</div>
      </div>
      <label class="settings-toggle">
        <input type="checkbox" id="ai-auto-presets" ${s.autoAddToPresets ? 'checked' : ''}
          onchange="aiSettings.autoAddToPresets=this.checked;saveAiSettings()">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
    ` : `<div style="padding-top:14px;font-size:11px;color:var(--text3)">新規タグ提案OFFのため、設定済みpresetのタグのみ提案します</div>`}
  `;
}

export function setAiDefaultMode(mode) {
  aiSettings.defaultMode = mode;
  saveAiSettings();
  renderAiSettings();
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
      renderTagVisibilityBtns();
      renderTagSettingsList();
    };
    el.appendChild(btn);
  });
}

// クラウドから読み込んだ設定を適用（デバイス間同期用）
export function applyRemoteSettings(data) {
  if (data.tagSettings && Array.isArray(data.tagSettings) && data.tagSettings.length) {
    tagSettings = data.tagSettings;
    window.tagSettings = tagSettings;
    try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
  }
  if (data.aiSettings && typeof data.aiSettings === 'object') {
    aiSettings = { ...aiSettings, ...data.aiSettings, categories: { ...aiSettings.categories, ...(data.aiSettings.categories || {}) } };
    window.aiSettings = aiSettings;
    try { localStorage.setItem('wk_aiSettings', JSON.stringify(aiSettings)); } catch(e) {}
  }
  // 設定画面が開いていれば再描画、フィルターも更新
  renderSettings();
  window.AF?.();
}
