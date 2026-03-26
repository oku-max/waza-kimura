// ═══ WAZA KIMURA — タグ設定 ═══

export let tagSettings = [
  { key:'ac',   label:'Action',    visible:true,  presets:['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'] },
  { key:'pos',  label:'Position',  visible:true,  presets:['サイドコントロール','マウント','クローズドガード','ニーオン','ハーフガード','バタフライ','Xガード','デラヒーバ','バック','タートル','オープンガード','50/50','スタンディング','その他'] },
  { key:'tech', label:'Technique', visible:true,  presets:[] }
];

export function saveTagSettings() {
  try { localStorage.setItem('wk_tagSettings', JSON.stringify(tagSettings)); } catch(e) {}
}

export function loadTagSettings() {
  try {
    const s = localStorage.getItem('wk_tagSettings');
    if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) tagSettings = p; }
  } catch(e) {}
}
loadTagSettings();

export function renderSettings() {
  renderTagSettingsList();
  renderTagVisibilityBtns();
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
