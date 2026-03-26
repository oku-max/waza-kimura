// ═══ WAZA KIMURA — AI タグ提案 ═══

const AI_TAG_ENDPOINT = '/api/ai-tag';

const CATEGORY_KEYS = ['tb', 'action', 'position', 'tech'];
const LABELS = { tb: 'TOP/BOTTOM', action: 'ACTION', position: 'POSITION', tech: 'TECHNIQUE' };
const KEY_TO_FIELD = { tb: 'tb', action: 'ac', position: 'pos', tech: 'tech' };

// ── タグ提案を取得 ──
export async function fetchAiTags(video) {
  const res = await fetch(AI_TAG_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:    video.title || '',
      channel:  video.ch    || '',
      playlist: video.pl    || '',
    }),
  });
  if (!res.ok) throw new Error('AI APIエラー: ' + res.status);
  return res.json(); // { tb, action, position, tech }
}

// ── VPanel 内に AI タグ提案パネルを表示 ──
export function showAiTagPanel(videoId, suggestions) {
  document.getElementById('ai-tag-panel')?.remove();

  const video = (window.videos || []).find(v => v.id === videoId);
  if (!video) return;

  // 現在のタグ（カテゴリキー → 配列）
  const currentTags = {
    tb:       video.tb   || [],
    action:   video.ac   || [],
    position: video.pos  || [],
    tech:     video.tech || [],
  };

  // ── パネル外枠 ──
  const panel = document.createElement('div');
  panel.id = 'ai-tag-panel';
  panel.style.cssText = `
    position:fixed; inset:0; z-index:1100;
    display:flex; align-items:flex-end; justify-content:center;
    background:rgba(0,0,0,.45);
  `;

  const sheet = document.createElement('div');
  sheet.style.cssText = `
    background:var(--surface); border-radius:16px 16px 0 0;
    width:100%; max-width:560px; padding:20px 20px 32px;
    box-shadow:0 -4px 24px rgba(0,0,0,.15);
    max-height:85vh; overflow-y:auto;
  `;

  // ── 各カテゴリ行を生成 ──
  const buildRow = (key) => {
    const suggested = suggestions[key] || [];
    const current   = currentTags[key];

    const currentHTML = current.length
      ? `<div style="margin-bottom:6px">
           <span style="font-size:10px;color:var(--text3)">現在: </span>
           ${current.map(v => `
             <span style="display:inline-block;padding:3px 8px;border-radius:12px;
               background:var(--surface2);font-size:11px;color:var(--text2);
               margin:2px 3px 2px 0;border:1px solid var(--border)">${v}</span>
           `).join('')}
         </div>`
      : '';

    const chips = suggested.map(v => `
      <label style="display:inline-flex;align-items:center;gap:5px;
        padding:5px 10px;border-radius:20px;border:1.5px solid var(--accent);
        background:var(--surface2);cursor:pointer;font-size:12px;font-weight:600;
        color:var(--accent);user-select:none">
        <input type="checkbox" data-key="${key}" data-val="${v.replace(/"/g,'&quot;')}"
          checked style="accent-color:var(--accent);width:13px;height:13px"> ${v}
      </label>`).join('');

    const noSuggestion = !suggested.length
      ? `<span style="font-size:11px;color:var(--text3);font-style:italic">AIの提案なし</span>`
      : '';

    return `
      <div style="margin-bottom:16px" data-cat="${key}">
        <div style="font-size:10px;font-weight:800;color:var(--text3);
          letter-spacing:.8px;margin-bottom:6px">${LABELS[key]}</div>
        ${currentHTML}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
          ${chips}${noSuggestion}
        </div>
        <div style="display:flex;gap:6px">
          <input type="text" data-manual-key="${key}"
            placeholder="手動で追加..."
            style="flex:1;padding:6px 10px;border-radius:8px;
              border:1px solid var(--border);background:var(--surface2);
              color:var(--text);font-size:12px;"
            onkeydown="if(event.key==='Enter'){window._aiAddManual('${key}',this);event.preventDefault();}">
          <button onclick="window._aiAddManual('${key}',this.previousElementSibling)"
            style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border);
              background:var(--surface2);color:var(--text);font-size:13px;
              cursor:pointer;font-weight:700">＋</button>
        </div>
      </div>`;
  };

  sheet.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:800">🤖 AIタグ提案</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          チェックを外したタグは適用されません
        </div>
      </div>
      <button onclick="document.getElementById('ai-tag-panel').remove()"
        style="background:none;border:none;font-size:20px;cursor:pointer;
               color:var(--text3);padding:4px 8px">✕</button>
    </div>

    <!-- 適用モード切り替え -->
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;
      padding:10px 12px;border-radius:10px;background:var(--surface2)">
      <span style="font-size:12px;color:var(--text2);font-weight:600;flex-shrink:0">適用モード:</span>
      <button id="ai-mode-add"
        onclick="window._aiSetMode('add')"
        style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;
               cursor:pointer;background:var(--accent);color:#fff;border:none">
        ＋ 追加
      </button>
      <button id="ai-mode-overwrite"
        onclick="window._aiSetMode('overwrite')"
        style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;
               cursor:pointer;background:var(--surface);color:var(--text);
               border:1.5px solid var(--border)">
        上書き
      </button>
      <span id="ai-mode-desc"
        style="font-size:11px;color:var(--text3);margin-left:4px">
        既存タグに追加します
      </span>
    </div>

    <div id="ai-tag-rows">
      ${CATEGORY_KEYS.filter(k => window.aiSettings?.categories?.[k] !== false).map(k => buildRow(k)).join('')}
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="ai-tag-apply-btn"
        style="flex:1;padding:12px;border-radius:10px;border:none;
               background:var(--accent);color:#fff;font-size:14px;
               font-weight:700;cursor:pointer">
        ✓ 選択したタグを適用
      </button>
      <button onclick="document.getElementById('ai-tag-panel').remove()"
        style="padding:12px 18px;border-radius:10px;
               border:1.5px solid var(--border);background:var(--surface2);
               color:var(--text);font-size:14px;cursor:pointer">
        キャンセル
      </button>
    </div>`;

  panel.appendChild(sheet);
  document.body.appendChild(panel);
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

  // ── モード管理 ──
  let _mode = window.aiSettings?.defaultMode || 'add';

  // 設定のデフォルトモードを初期反映
  if (_mode === 'overwrite') {
    setTimeout(() => window._aiSetMode?.('overwrite'), 0);
  }
  window._aiSetMode = (mode) => {
    _mode = mode;
    const btnAdd = document.getElementById('ai-mode-add');
    const btnOw  = document.getElementById('ai-mode-overwrite');
    const desc   = document.getElementById('ai-mode-desc');
    if (mode === 'add') {
      btnAdd.style.cssText = 'padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;background:var(--accent);color:#fff;border:none';
      btnOw.style.cssText  = 'padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;background:var(--surface);color:var(--text);border:1.5px solid var(--border)';
      if (desc) desc.textContent = '既存タグに追加します';
    } else {
      btnAdd.style.cssText = 'padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;background:var(--surface);color:var(--text);border:1.5px solid var(--border)';
      btnOw.style.cssText  = 'padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;background:var(--accent);color:#fff;border:none';
      if (desc) desc.textContent = '既存タグを置き換えます';
    }
  };

  // ── 手動タグ追加 ──
  window._aiAddManual = (key, input) => {
    const val = (input.value || '').trim();
    if (!val) return;
    const chipsDiv = document.querySelector(`[data-cat="${key}"] div[style*="flex-wrap"]`);
    if (!chipsDiv) return;
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;border:1.5px solid var(--accent);background:var(--surface2);cursor:pointer;font-size:12px;font-weight:600;color:var(--accent);user-select:none';
    label.innerHTML = `<input type="checkbox" data-key="${key}" data-val="${val.replace(/"/g,'&quot;')}" checked style="accent-color:var(--accent);width:13px;height:13px"> ${val}`;
    chipsDiv.appendChild(label);
    input.value = '';
    input.focus();
  };

  // ── 適用ボタン ──
  document.getElementById('ai-tag-apply-btn').onclick = () => {
    applyAiTags(videoId, panel, _mode);
  };
}

// ── 選択されたタグを動画に適用 ──
function applyAiTags(videoId, panel, mode = 'add') {
  const videos = window.videos || [];
  const v = videos.find(v => v.id === videoId);
  if (!v) { panel.remove(); return; }

  // チェック済みタグをキーごとに収集
  const checkedByKey = {};
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const key = cb.dataset.key;
    const val = cb.dataset.val;
    if (!checkedByKey[key]) checkedByKey[key] = [];
    if (val && !checkedByKey[key].includes(val)) checkedByKey[key].push(val);
  });

  let added = 0;

  Object.entries(checkedByKey).forEach(([key, vals]) => {
    const field = KEY_TO_FIELD[key];
    if (!field) return;
    if (mode === 'overwrite') {
      v[field] = [...vals];
      added += vals.length;
    } else {
      if (!v[field]) v[field] = [];
      vals.forEach(val => {
        if (!v[field].includes(val)) { v[field].push(val); added++; }
      });
    }
  });

  window.debounceSave?.();
  window.vpRefreshChips?.();
  const modeLabel = mode === 'overwrite' ? '上書き' : '追加';
  window.toast?.(`🤖 ${added}件のタグを${modeLabel}しました`);
  panel.remove();
}

// ── VPanel の AI ボタンクリック処理 ──
export async function onAiTagBtn(videoId) {
  if (window.aiSettings?.enabled === false) {
    window.toast?.('AIタグ機能が無効になっています（Settings で有効化できます）');
    return;
  }
  const btn = document.getElementById('vp-ai-tag-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 分析中…'; }

  try {
    const videos = window.videos || [];
    const video  = videos.find(v => v.id === videoId);
    if (!video) throw new Error('動画が見つかりません');

    const suggestions = await fetchAiTags(video);
    showAiTagPanel(videoId, suggestions);
  } catch (e) {
    window.toast?.('❌ AI タグ取得に失敗しました: ' + e.message);
    console.error('onAiTagBtn error:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AIタグ提案'; }
  }
}

// ── 一括AI タグ適用（bulk.js から呼ばれる） ──
export async function bulkAiTagApply() {
  const ids = [...(window.selIds || new Set())];
  if (!ids.length) { window.toast?.('動画を選択してください'); return; }

  // 確認ダイアログ
  if (window.aiSettings?.bulkConfirm !== false) {
    const ok = window.confirm(`選択中の ${ids.length} 本にAIタグを自動追加します。よろしいですか？`);
    if (!ok) return;
  }

  const btn = document.getElementById('bulk-ai-btn');
  if (btn) { btn.style.pointerEvents = 'none'; btn.textContent = '⏳ 準備中...'; }

  const videos = window.videos || [];
  let done = 0, added = 0;
  const total = ids.length;

  for (const id of ids) {
    const video = videos.find(v => v.id === id);
    if (!video) { done++; continue; }

    if (btn) btn.textContent = `⏳ ${done + 1}/${total} 分析中...`;

    try {
      const res = await fetch(AI_TAG_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:    video.title || '',
          channel:  video.ch    || '',
          playlist: video.pl    || '',
        }),
      });
      if (!res.ok) throw new Error('API error ' + res.status);
      const tags = await res.json();

      // 追加モードで適用
      const append = (field, arr) => {
        if (!arr?.length) return;
        if (!video[field]) video[field] = [];
        arr.forEach(val => {
          if (!video[field].includes(val)) { video[field].push(val); added++; }
        });
      };
      append('tb',   tags.tb);
      append('ac',   tags.action);
      append('pos',  tags.position);
      append('tech', tags.tech);

    } catch (e) {
      console.error('bulkAiTag error:', video.title, e);
    }
    done++;
  }

  window.debounceSave?.();
  window.AF?.();
  if (window.bulkCtx === 'organize') window.renderOrg?.();
  window.toast?.(`🤖 ${total}本を分析、${added}件のタグを追加しました`);

  if (btn) { btn.style.pointerEvents = ''; btn.textContent = '🤖 AIタグ一括適用'; }
}

// ── YouTube取り込み後の自動AIタグ付け ──
export async function autoTagNewVideos(newIds) {
  if (!newIds?.length) return;
  const videos = window.videos || [];
  let added = 0;

  for (const id of newIds) {
    const video = videos.find(v => v.id === id);
    if (!video) continue;
    try {
      const res = await fetch(AI_TAG_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: video.title || '', channel: video.ch || '', playlist: video.pl || '' }),
      });
      if (!res.ok) continue;
      const tags = await res.json();
      const append = (field, arr) => {
        if (!arr?.length) return;
        if (!video[field]) video[field] = [];
        arr.forEach(val => { if (!video[field].includes(val)) { video[field].push(val); added++; } });
      };
      append('tb',   tags.tb);
      append('ac',   tags.action);
      append('pos',  tags.position);
      append('tech', tags.tech);
    } catch(e) { console.error('autoTagNewVideos:', e); }
  }

  if (added > 0) {
    window.debounceSave?.();
    window.AF?.();
    window.toast?.(`🤖 ${newIds.length}本にAIタグを自動追加しました（${added}件）`);
  }
}

// window 登録
window.onAiTagBtn      = onAiTagBtn;
window.bulkAiTagApply  = bulkAiTagApply;
window.autoTagNewVideos = autoTagNewVideos;
