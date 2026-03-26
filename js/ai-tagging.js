// ═══ WAZA KIMURA — AI タグ提案 ═══

const AI_TAG_ENDPOINT = '/api/ai-tag';

// ── タグ提案を取得 ──
export async function fetchAiTags(video) {
  const res = await fetch(AI_TAG_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:    video.title    || '',
      channel:  video.ch       || '',
      playlist: video.pl       || '',
    }),
  });
  if (!res.ok) throw new Error('AI APIエラー: ' + res.status);
  return res.json(); // { tb, action, position, tech }
}

// ── VPanel 内に AI タグ提案パネルを表示 ──
export function showAiTagPanel(videoId, suggestions) {
  // 既存パネルを削除
  document.getElementById('ai-tag-panel')?.remove();

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
      const chips = vals.map(v => `
        <label style="display:inline-flex;align-items:center;gap:5px;
          padding:5px 10px;border-radius:20px;border:1.5px solid var(--accent);
          background:var(--surface2);cursor:pointer;font-size:12px;font-weight:600;
          color:var(--accent);user-select:none">
          <input type="checkbox" data-key="${key}" data-val="${v.replace(/"/g,'&quot;')}"
            checked style="accent-color:var(--accent);width:13px;height:13px">
          ${v}
        </label>`).join('');
      return `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);
            letter-spacing:.8px;margin-bottom:6px">${LABELS[key]}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
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
    <div id="ai-tag-rows">${rows}</div>
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

  // 背景クリックで閉じる
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

  // 適用ボタン
  document.getElementById('ai-tag-apply-btn').onclick = () => {
    applyAiTags(videoId, panel);
  };
}

// ── 選択されたタグを動画に適用 ──
function applyAiTags(videoId, panel) {
  const videos = window.videos || [];
  const v = videos.find(v => v.id === videoId);
  if (!v) { panel.remove(); return; }

  let added = 0;

  panel.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    const key = cb.dataset.key;
    const val = cb.dataset.val;

    if (key === 'tb') {
      if (!v.tb) v.tb = [];
      if (!v.tb.includes(val)) { v.tb.push(val); added++; }
    } else if (key === 'action') {
      if (!v.ac) v.ac = [];
      if (!v.ac.includes(val)) { v.ac.push(val); added++; }
    } else if (key === 'position') {
      if (!v.pos) v.pos = [];
      if (!v.pos.includes(val)) { v.pos.push(val); added++; }
    } else if (key === 'tech') {
      if (!v.tech) v.tech = [];
      if (!v.tech.includes(val)) { v.tech.push(val); added++; }
    }
  });

  window.debounceSave?.();
  window.vpRefreshChips?.();
  window.toast?.(`🤖 ${added}件のタグを追加しました`);
  panel.remove();
}

// ── VPanel の AI ボタンクリック処理 ──
export async function onAiTagBtn(videoId) {
  const btn = document.getElementById('vp-ai-tag-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 分析中…';
  }

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
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🤖 AIタグ提案';
    }
  }
}

// window 登録
window.onAiTagBtn = onAiTagBtn;
