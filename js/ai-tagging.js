// ═══ WAZA KIMURA — AI タグ提案 ═══

const AI_TAG_ENDPOINT = '/api/ai-tag';

// ── プリセット判定ヘルパー ──
const KEY_TO_SETTING = { tb:'tb', action:'ac', position:'pos', tech:'tech' };
const PRESET_FALLBACK = { tb:['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'] };

function getPresets(key) {
  const sk = KEY_TO_SETTING[key];
  const ts = (window.tagSettings || []).find(s => s.key === sk);
  if (ts) return ts.presets || [];
  return PRESET_FALLBACK[sk] || [];
}

function isPresetTag(key, val) {
  return getPresets(key).includes(val);
}

// ── タグ提案を取得 ──
export async function fetchAiTags(video) {
  const ai = window.aiSettings || {};
  const presets = {
    tb:   getPresets('tb'),
    ac:   getPresets('action'),
    pos:  getPresets('position'),
    tech: getPresets('tech'),
  };
  const res = await fetch(AI_TAG_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:       video.title   || '',
      channel:     video.ch || video.channel || '',
      playlist:    video.pl      || '',
      flexibility: ai.flexibility || 'standard',
      presets,
      model:            ai.model || 'haiku',
      chapters:         (video.ytChapters || []).map(ch => ch.label),
      bjjRules:         ai.bjjRules || [],
      feedbackExamples: ai.feedbackExamples || [],
      techBlocklist:    ai.techBlocklist || [],
    }),
  });
  if (!res.ok) throw new Error('AI APIエラー: ' + res.status);
  return res.json(); // { tb, action, position, tech }
}

// ── VPanel 内に AI タグ提案パネルを表示 ──
export function showAiTagPanel(videoId, suggestions) {
  document.getElementById('ai-tag-panel')?.remove();

  const ai = window.aiSettings || {};
  const allowNew = ai.newTagProposal !== false;

  const total =
    (suggestions.tb?.length       || 0) +
    (suggestions.action?.length   || 0) +
    (suggestions.position?.length || 0) +
    (suggestions.tech?.length     || 0);

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
    animation: slideUp .2s ease;
    max-height:80vh; overflow-y:auto;
  `;

  if (total === 0) {
    sheet.innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:24px;margin-bottom:8px">🤖</div>
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">タグを判断できませんでした</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:20px">
          タイトルやチャンネル名から推定できなかった可能性があります
        </div>
        <button onclick="document.getElementById('ai-tag-panel').remove()"
          style="padding:10px 24px;border-radius:8px;border:1.5px solid var(--border);
                 background:var(--surface2);color:var(--text);font-size:13px;cursor:pointer">
          閉じる
        </button>
      </div>`;
    panel.appendChild(sheet);
    document.body.appendChild(panel);
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
    return;
  }

  const LABELS = {
    tb:       'TOP/BOTTOM',
    action:   'ACTION',
    position: 'POSITION',
    tech:     'TECHNIQUE',
  };

  const rows = Object.entries(suggestions)
    .filter(([, vals]) => vals?.length)
    .map(([key, vals]) => {
      // フィルタリング: newTagProposal=false のとき新規タグ除外
      const filteredVals = allowNew ? vals : vals.filter(v => isPresetTag(key, v));
      if (!filteredVals.length) return '';

      const chips = filteredVals.map(v => {
        const isPreset = isPresetTag(key, v);
        const chipStyle = isPreset
          ? `padding:5px 10px;border-radius:20px;border:1.5px solid var(--accent);
             background:var(--surface2);font-size:12px;font-weight:600;color:var(--accent);`
          : `padding:5px 10px;border-radius:20px;border:2px dashed #f97316;
             background:rgba(249,115,22,.08);font-size:12px;font-weight:600;color:#f97316;`;
        const badge = isPreset ? '' : `<span style="font-size:10px;background:#f97316;color:#fff;border-radius:8px;padding:1px 5px;margin-left:4px">新規</span>`;
        return `
          <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none;${chipStyle}">
            <input type="checkbox" data-key="${key}" data-val="${v.replace(/"/g,'&quot;')}" data-preset="${isPreset?'1':'0'}"
              checked style="accent-color:var(--accent);width:13px;height:13px">
            ${v}${badge}
          </label>`;
      }).join('');

      // 手動追加ボタン
      const manualId = `ai-manual-${key}`;
      const manualSection = `
        <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
          <input id="${manualId}" placeholder="手動追加..."
            style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;
                   padding:4px 8px;font-size:12px;color:var(--text);outline:none;font-family:inherit"
            onkeydown="if(event.key==='Enter')_aiAddManual('${key}')">
          <button onclick="_aiAddManual('${key}')"
            style="padding:4px 10px;border-radius:6px;border:none;background:var(--accent);
                   color:#fff;font-size:13px;cursor:pointer;font-weight:700">＋</button>
        </div>`;

      return `
        <div style="margin-bottom:14px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);
            letter-spacing:.8px;margin-bottom:6px">${LABELS[key]}</div>
          <div id="ai-chips-${key}" style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
          ${manualSection}
        </div>`;
    }).join('');

  sheet.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
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
    <div id="ai-tag-rows">${rows || '<div style="font-size:12px;color:var(--text3)">AIの提案なし</div>'}</div>
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
  document.getElementById('ai-tag-apply-btn').onclick = () => applyAiTags(videoId, panel);
}

// ── 手動追加 ──
window._aiAddManual = function(key) {
  const inp = document.getElementById('ai-manual-' + key);
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) {
    // 空欄のとき → プリセット候補をドロップダウン表示
    _showPresetPicker(key, inp);
    return;
  }
  inp.value = '';
  const container = document.getElementById('ai-chips-' + key);
  if (!container) return;
  const isPreset = isPresetTag(key, val);
  const chipStyle = isPreset
    ? `padding:5px 10px;border-radius:20px;border:1.5px solid var(--accent);
       background:var(--surface2);font-size:12px;font-weight:600;color:var(--accent);`
    : `padding:5px 10px;border-radius:20px;border:2px dashed #f97316;
       background:rgba(249,115,22,.08);font-size:12px;font-weight:600;color:#f97316;`;
  const badge = isPreset ? '' : `<span style="font-size:10px;background:#f97316;color:#fff;border-radius:8px;padding:1px 5px;margin-left:4px">新規</span>`;
  const label = document.createElement('label');
  label.style.cssText = `display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none;${chipStyle}`;
  label.innerHTML = `<input type="checkbox" data-key="${key}" data-val="${val.replace(/"/g,'&quot;')}" data-preset="${isPreset?'1':'0'}" checked style="accent-color:var(--accent);width:13px;height:13px">${val}${badge}`;
  container.appendChild(label);
};

function _showPresetPicker(key, inp) {
  document.getElementById('ai-preset-picker')?.remove();
  const presets = getPresets(key);
  if (!presets.length) return;
  const picker = document.createElement('div');
  picker.id = 'ai-preset-picker';
  picker.style.cssText = `position:absolute;background:var(--surface);border:1.5px solid var(--border);
    border-radius:10px;padding:6px;z-index:1200;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.2);
    display:flex;flex-wrap:wrap;gap:4px;max-width:280px`;
  presets.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.style.cssText = `padding:4px 10px;border-radius:14px;border:1.5px solid var(--accent);
      background:var(--surface2);color:var(--accent);font-size:11px;cursor:pointer;font-family:inherit`;
    btn.onclick = () => {
      inp.value = p;
      picker.remove();
      window._aiAddManual(key);
    };
    picker.appendChild(btn);
  });
  inp.parentNode.style.position = 'relative';
  inp.parentNode.appendChild(picker);
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!picker.contains(e.target) && e.target !== inp) { picker.remove(); document.removeEventListener('click', h); }
  }), 10);
}

// ── 選択されたタグを動画に適用 ──
function applyAiTags(videoId, panel) {
  const videos = window.videos || [];
  const v = videos.find(v => v.id === videoId);
  if (!v) { panel.remove(); return; }

  const ai = window.aiSettings || {};
  let added = 0;

  // 選択されたタグを収集 (新スキーマ変換用)
  const collected = { tb:[], action:[], position:[], tech:[] };
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    (collected[cb.dataset.key] ||= []).push(cb.dataset.val);
  });

  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const key  = cb.dataset.key;
    const val  = cb.dataset.val;
    const isNew = cb.dataset.preset === '0';

    if (key === 'tb') {
      // tbLocked でもユーザーが明示的に VPanel で選んだものは適用する (AI 再解析とは別経路)
      if (!v.tb) v.tb = []; if (!v.tb.includes(val)) { v.tb.push(val); added++; }
      if (isNew && ai.autoAddToPresets) _addToPresets('tb', val);
    } else if (key === 'action') {
      if (!v.ac) v.ac = []; if (!v.ac.includes(val)) { v.ac.push(val); added++; }
      if (isNew && ai.autoAddToPresets) _addToPresets('ac', val);
    } else if (key === 'position') {
      if (!v.pos) v.pos = []; if (!v.pos.includes(val)) { v.pos.push(val); added++; }
      if (isNew && ai.autoAddToPresets) _addToPresets('pos', val);
    } else if (key === 'tech') {
      if (!v.tech) v.tech = []; if (!v.tech.includes(val)) { v.tech.push(val); added++; }
      if (isNew && ai.autoAddToPresets) _addToPresets('tech', val);
    }
  });

  // 新スキーマ (cat/pos/tags) にも反映
  const newSug = _convertToNewSchema(collected);
  added += _applyNewTagsToVideo(v, newSug);

  // E: フィードバック例として自動蓄積（max 10, FIFO）
  const example = { title: v.title || '', channel: v.ch || v.channel || '', playlist: v.pl || '', tags: {} };
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const k = cb.dataset.key;
    if (!example.tags[k]) example.tags[k] = [];
    example.tags[k].push(cb.dataset.val);
  });
  if (!ai.feedbackExamples) ai.feedbackExamples = [];
  ai.feedbackExamples.push(example);
  while (ai.feedbackExamples.length > 10) ai.feedbackExamples.shift();
  window.saveAiSettings?.();

  window.debounceSave?.();
  // VPanel即時更新
  ['tb','ac','pos','tech'].forEach(type => window.vpRefreshChips?.(videoId, type));
  window.toast?.(`🤖 ${added}件のタグを追加しました`);
  panel.remove();
}

function _addToPresets(key, val) {
  const ts = (window.tagSettings || []).find(s => s.key === key);
  if (ts && !ts.presets.includes(val)) {
    ts.presets.push(val);
    window.saveTagSettings?.();
  }
}

// ── VPanel の AI ボタンクリック処理 ──
export async function onAiTagBtn(videoId) {
  const btn = document.getElementById('vp-ai-tag-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 分析中…'; }
  try {
    const video = (window.videos || []).find(v => v.id === videoId);
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

window.onAiTagBtn = onAiTagBtn;
window.fetchAiTags = fetchAiTags;

// ─── 4層タグ体系への変換 & 適用 ───────────────────
// 旧 suggestion 形式 { tb, action, position, tech } →
// 新 { tb:['トップ'...], cat:['フィニッシュ'...], pos:['デラヒーバ'...], tags:[...] }
// 変換はクライアント側で行う (バックエンド未対応のため)
function _convertToNewSchema(sug) {
  const out = { tb: [], cat: [], pos: [], tags: [] };

  // TB: 旧トップ/ボトム/スタンディングのみ採用 (バック/ハーフ/ドリルは破棄)
  if (Array.isArray(sug.tb)) {
    sug.tb.forEach(t => {
      if (t === 'トップ' || t === 'ボトム' || t === 'スタンディング') {
        if (!out.tb.includes(t)) out.tb.push(t);
      } else if (t === 'ハーフ') {
        if (!out.tb.includes('ボトム')) out.tb.push('ボトム');
      }
    });
  }

  // Category: action → 旧→新カテゴリー対応表 (tag-master.js の _AC_TO_CAT と同等)
  const AC2CAT = {
    'エスケープ・ディフェンス': 'エスケープ・ディフェンス',
    'パスガード':               'パスガード',
    'アタック':                 'フィニッシュ',
    'スイープ':                 'スイープ',
    'リテンション':             'ガードリテンション',
    'コントロール':             'コントロール／プレッシャー',
    'テイクダウン':             'テイクダウン',
    'フィニッシュ':             'フィニッシュ',
  };
  if (Array.isArray(sug.action)) {
    sug.action.forEach(a => {
      const c = AC2CAT[a];
      if (c && !out.cat.includes(c)) out.cat.push(c);
    });
  }

  // Position: 旧 position を正規化してプリセット21個にマッチ → ja 名で格納。マッチしないものは #タグへ
  if (Array.isArray(sug.position)) {
    sug.position.forEach(p => {
      const hit = window.findPosition && window.findPosition(p);
      if (hit) {
        if (!out.pos.includes(hit.ja)) out.pos.push(hit.ja);
      } else {
        if (!out.tags.includes(p)) out.tags.push(p);
      }
    });
  }

  // Tech: すべて #タグへ (自由欄)
  if (Array.isArray(sug.tech)) {
    sug.tech.forEach(t => { if (!out.tags.includes(t)) out.tags.push(t); });
  }

  return out;
}

// 4層タグを動画に適用 (tbLocked / tag-master AI toggle 対応)
function _applyNewTagsToVideo(v, newSug) {
  if (!v) return 0;
  // tag-master UI の AI トグル設定を読む
  let tm = {};
  try { tm = JSON.parse(localStorage.getItem('wk_tagMaster') || '{}'); } catch(e) {}
  const ai = (tm && tm.ai) || { tbAuto:true, catAuto:true, posAuto:true, tagAuto:false };

  let added = 0;

  // TB: tbLocked=true なら AI は上書きしない
  if (ai.tbAuto && !v.tbLocked && Array.isArray(newSug.tb)) {
    if (!Array.isArray(v.tb)) v.tb = [];
    newSug.tb.forEach(t => { if (!v.tb.includes(t)) { v.tb.push(t); added++; } });
  }
  // Category
  if (ai.catAuto && Array.isArray(newSug.cat)) {
    if (!Array.isArray(v.cat)) v.cat = [];
    newSug.cat.forEach(c => { if (!v.cat.includes(c)) { v.cat.push(c); added++; } });
  }
  // Position
  if (ai.posAuto && Array.isArray(newSug.pos)) {
    if (!Array.isArray(v.pos)) v.pos = [];
    newSug.pos.forEach(p => { if (!v.pos.includes(p)) { v.pos.push(p); added++; } });
  }
  // #Tag (default OFF)
  if (ai.tagAuto && Array.isArray(newSug.tags)) {
    if (!Array.isArray(v.tags)) v.tags = [];
    newSug.tags.forEach(t => { if (!v.tags.includes(t)) { v.tags.push(t); added++; } });
  }
  if (!('tbLocked' in v)) v.tbLocked = false;
  return added;
}

// ─── TB 手動ロック/アンロック ───────────────────
window.toggleTbLock = function(videoId) {
  const v = (window.videos || []).find(v => v.id === videoId);
  if (!v) return;
  v.tbLocked = !v.tbLocked;
  window.debounceSave?.();
  window.toast?.(v.tbLocked ? '🔒 TB を手動ロックしました' : '🔓 TB ロックを解除しました');
  return v.tbLocked;
};

// ── 取り込み時の自動AIタグ付け ──
async function _applyTagsDirect(videoId, suggestions) {
  const v = (window.videos || []).find(v => v.id === videoId);
  if (!v) return 0;
  const ai = window.aiSettings || {};
  const cats = ai.categories || {};
  let added = 0;

  // 旧スキーマ (tb/ac/pos/tech) への書き込み — 既存UIの後方互換
  if (cats.tb     !== false && Array.isArray(suggestions.tb))       suggestions.tb.forEach(t       => { if (!v.tb)   v.tb   = []; if (!v.tb.includes(t))   { v.tb.push(t);   added++; } });
  if (cats.action !== false && Array.isArray(suggestions.action))   suggestions.action.forEach(t   => { if (!v.ac)   v.ac   = []; if (!v.ac.includes(t))   { v.ac.push(t);   added++; } });
  if (cats.position !== false && Array.isArray(suggestions.position)) suggestions.position.forEach(t => { if (!v.pos)  v.pos  = []; if (!v.pos.includes(t))  { v.pos.push(t);  added++; } });
  if (cats.tech   !== false && Array.isArray(suggestions.tech))     suggestions.tech.forEach(t     => { if (!v.tech) v.tech = []; if (!v.tech.includes(t)) { v.tech.push(t); added++; } });

  // 新スキーマ (cat/tags/tbLocked) への書き込み — 4層体系
  const newSug = _convertToNewSchema(suggestions);
  added += _applyNewTagsToVideo(v, newSug);

  return added;
}

export async function autoTagNewVideos(ids) {
  if (!ids?.length) return;
  const videos = window.videos || [];
  let done = 0, totalAdded = 0, errors = 0;
  window.toast?.(`🤖 AIタグ付けを開始します (${ids.length}本)`);
  for (const id of ids) {
    const video = videos.find(v => v.id === id);
    if (!video) continue;
    try {
      const suggestions = await fetchAiTags(video);
      totalAdded += await _applyTagsDirect(id, suggestions);
    } catch (e) {
      console.warn('autoTag failed for', id, e);
      errors++;
    }
    done++;
    if (ids.length > 1) window.toast?.(`🤖 AIタグ付け中... ${done}/${ids.length}`);
  }
  if (totalAdded > 0) window.debounceSave?.();
  const errNote = errors ? ` (${errors}件失敗)` : '';
  window.toast?.(`🤖 AIタグ付け完了: ${totalAdded}件追加${errNote}`);
}
window.autoTagNewVideos = autoTagNewVideos;
