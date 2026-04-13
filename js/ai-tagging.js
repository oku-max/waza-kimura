// ═══ WAZA KIMURA — AI タグ提案 (4層タグ体系) ═══

const AI_TAG_ENDPOINT = '/api/ai-tag';

// ── プリセット判定ヘルパー ──
const KEY_LABELS = {
  tb:   'TOP/BOTTOM',
  cat:  'カテゴリー',
  pos:  'ポジション',
  tags: '#タグ',
};

function isPresetTag(key, val) {
  if (key === 'tb')  return ['トップ','ボトム','スタンディング'].includes(val);
  if (key === 'cat') return (window.CATEGORIES || []).some(c => c.name === val);
  if (key === 'pos') return (window.POSITIONS  || []).some(p => p.ja   === val);
  return false; // tags は常に「自由」扱い
}

// ── タグ提案を取得 ──
export async function fetchAiTags(video) {
  const ai = window.aiSettings || {};
  // tag-master の固定リストを backend に渡す
  const categories = (window.CATEGORIES || []).map(c => ({
    id: c.id, name: c.name, desc: c.desc || '', aliases: c.aliases || [],
  }));
  const positions = (window.POSITIONS || []).map(p => ({
    id: p.id, ja: p.ja, en: p.en || '', aliases: p.aliases || [],
  }));

  const res = await fetch(AI_TAG_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:        video.title || '',
      channel:      video.ch || video.channel || '',
      playlist:     video.pl || '',
      chapters:     (video.ytChapters || []).map(ch => ch.label),
      tbValues:     ['トップ','ボトム','スタンディング'],
      categories,
      positions,
      tagBlocklist:     ai.techBlocklist || [],
      bjjRules:         ai.bjjRules || [],
      flexibility:      ai.flexibility || 'standard',
      model:            ai.model || 'haiku',
      feedbackExamples: ai.feedbackExamples || [],
    }),
  });
  if (!res.ok) throw new Error('AI APIエラー: ' + res.status);
  const result = await res.json();
  console.log('[AI-Tag] API response for:', video.title, result);
  return result; // { tb, cat, pos, tags }
}

// ── VPanel 内に AI タグ提案パネルを表示 ──
export function showAiTagPanel(videoId, suggestions) {
  document.getElementById('ai-tag-panel')?.remove();

  const ai = window.aiSettings || {};
  const allowNew = ai.newTagProposal !== false;

  const total =
    (suggestions.tb?.length   || 0) +
    (suggestions.cat?.length  || 0) +
    (suggestions.pos?.length  || 0) +
    (suggestions.tags?.length || 0);

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

  const ORDER = ['tb','cat','pos','tags'];
  const rows = ORDER
    .filter(key => suggestions[key]?.length)
    .map(key => {
      const vals = suggestions[key];
      const filteredVals = (allowNew || key === 'tags') ? vals : vals.filter(v => isPresetTag(key, v));
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

      return `
        <div style="margin-bottom:14px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);
            letter-spacing:.8px;margin-bottom:6px">${KEY_LABELS[key]}</div>
          <div id="ai-chips-${key}" style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
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

// ── 選択されたタグを動画に適用 ──
function applyAiTags(videoId, panel) {
  const v = (window.videos || []).find(v => v.id === videoId);
  if (!v) { panel.remove(); return; }

  // 選択結果を新スキーマに集約
  const collected = { tb:[], cat:[], pos:[], tags:[] };
  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const k = cb.dataset.key;
    if (collected[k]) collected[k].push(cb.dataset.val);
  });

  const added = _applyNewTagsToVideo(v, collected);
  console.log('[AI-Tag] Applied to', v.title, '→', { tb: v.tb, cat: v.cat, pos: v.pos, tags: v.tags }, `(${added} added)`);

  // フィードバック例として自動蓄積 (max 10, FIFO)
  const ai = window.aiSettings || {};
  const example = {
    title:    v.title || '',
    channel:  v.ch || v.channel || '',
    playlist: v.pl || '',
    tags:     collected,
  };
  if (!ai.feedbackExamples) ai.feedbackExamples = [];
  ai.feedbackExamples.push(example);
  while (ai.feedbackExamples.length > 10) ai.feedbackExamples.shift();
  window.saveAiSettings?.();

  window.debounceSave?.();
  // VPanel 即時更新 (新4層 UI)
  window.vpRefreshV4?.(videoId);
  window.toast?.(`🤖 ${added}件のタグを追加しました`);
  panel.remove();
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

// ─── 4層タグを動画に適用 ───────────────────
// suggestions: { tb, cat, pos, tags } (新スキーマ)
function _applyNewTagsToVideo(v, sug) {
  if (!v) return 0;
  // tag-master UI の AI トグル設定
  let tm = {};
  try { tm = JSON.parse(localStorage.getItem('wk_tagMaster') || '{}'); } catch(e) {}
  const aiTog = (tm && tm.ai) || { tbAuto:true, catAuto:true, posAuto:true, tagAuto:false };

  let added = 0;

  // TB: tbLocked=true なら AI は上書きしない
  if (aiTog.tbAuto && !v.tbLocked && Array.isArray(sug.tb)) {
    if (!Array.isArray(v.tb)) v.tb = [];
    sug.tb.forEach(t => { if (!v.tb.includes(t)) { v.tb.push(t); added++; } });
  }
  if (aiTog.catAuto && Array.isArray(sug.cat)) {
    if (!Array.isArray(v.cat)) v.cat = [];
    sug.cat.forEach(c => { if (!v.cat.includes(c)) { v.cat.push(c); added++; } });
  }
  if (aiTog.posAuto && Array.isArray(sug.pos)) {
    if (!Array.isArray(v.pos)) v.pos = [];
    sug.pos.forEach(p => { if (!v.pos.includes(p)) { v.pos.push(p); added++; } });
  }
  // #Tag (default OFF)
  if (aiTog.tagAuto && Array.isArray(sug.tags)) {
    if (!Array.isArray(v.tags)) v.tags = [];
    sug.tags.forEach(t => { if (!v.tags.includes(t)) { v.tags.push(t); added++; } });
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

// ── 取り込み時の自動AIタグ付け (バルク) ──
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
      totalAdded += _applyNewTagsToVideo(video, suggestions);
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
