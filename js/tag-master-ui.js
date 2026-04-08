// ═══ WAZA KIMURA — タグマスタ管理 UI ═══
// 4層タグ体系 (TB / Category / Position / #Tag) の Settings 画面実装
// データソース: js/tag-master.js (TB_VALUES / CATEGORIES / POSITIONS)
// 永続化     : localStorage 'wk_tagMaster' + (将来) Firestore

(function () {
  'use strict';

  const LS_KEY = 'wk_tagMaster';

  // ─── 状態 ─────────────────────────────────────
  // ユーザー編集を localStorage で覆う構造。デフォルトは tag-master.js から
  let state = {
    categories: null, // null なら CATEGORIES そのまま
    ai: {
      tbAuto: true,
      catAuto: true,
      posAuto: true,
      tagAuto: false,         // #タグ自動抽出は OFF
      newPosSuggest: false,
      variantMerge: true,
      confidence: 'standard', // 'careful' | 'standard' | 'aggressive'
    },
  };

  function load() {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p && typeof p === 'object') state = Object.assign(state, p);
      }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function getCategories() {
    return state.categories || window.CATEGORIES || [];
  }

  // ─── 集計 ─────────────────────────────────────
  function countTB(value) {
    const vs = window.videos || [];
    return vs.filter(v => Array.isArray(v.tb) && v.tb.includes(value)).length;
  }
  function countCat(name) {
    const vs = window.videos || [];
    return vs.filter(v => Array.isArray(v.cat) && v.cat.includes(name)).length;
  }
  function countPos(ja) {
    const vs = window.videos || [];
    return vs.filter(v => Array.isArray(v.pos) && v.pos.includes(ja)).length;
  }
  function allTags() {
    const vs = window.videos || [];
    const m = new Map();
    vs.forEach(v => (v.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  // ─── レンダリング ──────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function render() {
    const root = document.getElementById('tag-master-ui');
    if (!root) return;

    const cats = getCategories();
    const positions = window.POSITIONS || [];
    const tags = allTags();
    const a = state.ai;

    root.innerHTML = `
      <div class="tm-card">
        <div class="tm-h">🧭 TB <span class="tm-pill">起点・3値固定</span></div>
        <div class="tm-tb-grid">
          <div class="tm-tb tm-top"><div class="tm-tb-t">🔼 トップ</div><div class="tm-tb-n">${countTB('トップ')}本</div></div>
          <div class="tm-tb tm-bot"><div class="tm-tb-t">🔽 ボトム</div><div class="tm-tb-n">${countTB('ボトム')}本</div></div>
          <div class="tm-tb tm-std"><div class="tm-tb-t">⏫ スタンディング</div><div class="tm-tb-n">${countTB('スタンディング')}本</div></div>
        </div>
        <div class="tm-warn">🔒 動画カードで TB を手動変更すると AI 再解析時に上書きされません</div>
      </div>

      <div class="tm-card">
        <div class="tm-h">📂 カテゴリー <span class="tm-pill">${cats.length}個</span></div>
        <div class="tm-warn tm-warn-y">⚠️ AI は <b>説明文</b> を読んで分類します。rename 時は説明文も見直してください。</div>
        ${cats.map((c, i) => `
          <div class="tm-row">
            <div class="tm-num">${i + 1}</div>
            <div class="tm-info">
              <div class="tm-name">${esc(c.name)}</div>
              <div class="tm-desc">${esc(c.desc)}</div>
            </div>
            <div class="tm-stat">${countCat(c.name)}本</div>
            <button class="tm-icn" data-tm-action="edit-cat" data-i="${i}" title="編集">✎</button>
          </div>
        `).join('')}
      </div>

      <div class="tm-card">
        <div class="tm-h">📍 ポジション <span class="tm-pill">${positions.length}個・ボトム系</span></div>
        <div class="tm-flow">
          ${positions.map(p => `
            <span class="tm-chip" title="${esc((p.aliases || []).join(' / '))}">
              ${esc(p.ja)} <span class="tm-alias">${esc(p.en)}</span>
              <span class="tm-cnt">${countPos(p.ja)}</span>
            </span>
          `).join('')}
        </div>
        <div class="tm-warn tm-warn-i">🔍 表記ゆれ対策: <code>デラヒーバ = De La Riva = DLR = ｄｌｒ</code> 等すべて同一視</div>
      </div>

      <div class="tm-card">
        <div class="tm-h">🤖 AI タグ補助</div>
        <div class="tm-sub">▼ 自動判定（取込時に AI が分類）</div>
        ${toggleRow('tbAuto',  '🧭 TB（トップ／ボトム／スタンディング）', '', a.tbAuto)}
        ${toggleRow('catAuto', '📂 カテゴリー（' + cats.length + '個）', '', a.catAuto)}
        ${toggleRow('posAuto', '📍 ポジション（' + positions.length + '個）', '', a.posAuto)}
        ${toggleRow('tagAuto', '🏷️ #タグ自動抽出 <span style="color:var(--red,#c33);font-size:10px">推奨OFF</span>',
          '#タグは本来ユーザー自由欄。ONにすると AI が技名・キーワードを候補へ追加します。', a.tagAuto)}

        <div class="tm-sub" style="margin-top:14px">▼ メンテナンス</div>
        ${toggleRow('newPosSuggest', '新ポジションの追加提案', 'プリセット21個にない新ガードを発見したら提案。', a.newPosSuggest)}
        ${toggleRow('variantMerge',  '表記ゆれの統合提案', '重複タグ・ポジションを定期検知して統合提案。', a.variantMerge)}

        <div class="tm-slider">
          <div class="tm-sl-lab">AI の慎重さ <span class="tm-sl-sub">どれくらい自信があるときタグ付けするか</span></div>
          <div class="tm-seg">
            <button data-tm-action="ai-conf" data-v="careful"    class="${a.confidence==='careful'?'on':''}"><b>慎重</b><br><span>確信があるものだけ</span></button>
            <button data-tm-action="ai-conf" data-v="standard"   class="${a.confidence==='standard'?'on':''}"><b>標準</b><br><span>バランス重視</span></button>
            <button data-tm-action="ai-conf" data-v="aggressive" class="${a.confidence==='aggressive'?'on':''}"><b>積極的</b><br><span>迷ったら付ける</span></button>
          </div>
          <div class="tm-hint">💡 迷ったら<b>標準</b>でOK。あとから変えられます。</div>
        </div>
      </div>

      <div class="tm-card">
        <div class="tm-h">🏷️ #タグ一覧 <span class="tm-pill">${tags.length}件</span></div>
        <div class="tm-desc-top">サイドバー非表示。動画カード表示とキーワード検索でヒット。</div>
        <div class="tm-flow">
          ${tags.length === 0
            ? '<div style="color:var(--text3);font-size:11px">まだ #タグはありません</div>'
            : tags.slice(0, 80).map(([t, n]) => `<span class="tm-chip tm-chip-tag">#${esc(t)} <span class="tm-cnt">${n}</span></span>`).join('')}
          ${tags.length > 80 ? `<span style="color:var(--text3);font-size:11px;align-self:center">…他 ${tags.length - 80} 件</span>` : ''}
        </div>
      </div>
    `;
  }

  function toggleRow(key, title, desc, on) {
    return `
      <div class="tm-tg">
        <div class="tm-tg-i">
          <div class="tm-tg-t">${title}</div>
          ${desc ? `<div class="tm-tg-d">${desc}</div>` : ''}
        </div>
        <label class="tm-sw">
          <input type="checkbox" data-tm-action="ai-toggle" data-k="${key}" ${on ? 'checked' : ''}>
          <span class="tm-sw-s"></span>
        </label>
      </div>
    `;
  }

  // ─── イベント ──────────────────────────────────
  function onClick(e) {
    const t = e.target.closest('[data-tm-action]');
    if (!t) return;
    const act = t.getAttribute('data-tm-action');

    if (act === 'ai-conf') {
      state.ai.confidence = t.getAttribute('data-v');
      save(); render();
    } else if (act === 'edit-cat') {
      const i = +t.getAttribute('data-i');
      editCategory(i);
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.getAttribute && t.getAttribute('data-tm-action') === 'ai-toggle') {
      const k = t.getAttribute('data-k');
      state.ai[k] = t.checked;
      save();
    }
  }

  function editCategory(i) {
    const cats = getCategories().slice();
    const c = cats[i]; if (!c) return;
    const name = prompt('カテゴリー名:', c.name);
    if (name == null) return;
    const desc = prompt('AI 分類用の説明文:\n(AI はこの文を読んで動画を振り分けます)', c.desc);
    if (desc == null) return;
    cats[i] = Object.assign({}, c, { name: name.trim() || c.name, desc: desc.trim() || c.desc });
    state.categories = cats;
    save(); render();
  }

  // ─── スタイル注入 ──────────────────────────────
  function injectStyle() {
    if (document.getElementById('tm-style')) return;
    const css = `
      #tag-master-ui{font-size:12px}
      #tag-master-ui .tm-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px}
      #tag-master-ui .tm-h{font-size:13px;font-weight:800;margin-bottom:10px;display:flex;align-items:center;gap:8px}
      #tag-master-ui .tm-pill{font-size:10px;font-weight:600;color:var(--text3);background:var(--surface2);padding:2px 8px;border-radius:10px}
      #tag-master-ui .tm-warn{margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(255,180,0,.08);border:1px solid rgba(255,180,0,.25);font-size:11px;color:var(--text2)}
      #tag-master-ui .tm-warn-y{background:rgba(255,180,0,.1)}
      #tag-master-ui .tm-warn-i{background:rgba(80,160,255,.08);border-color:rgba(80,160,255,.25)}
      #tag-master-ui .tm-tb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      #tag-master-ui .tm-tb{padding:14px 8px;border-radius:8px;text-align:center;border:1px solid var(--border)}
      #tag-master-ui .tm-tb-t{font-size:12px;font-weight:700;margin-bottom:4px}
      #tag-master-ui .tm-tb-n{font-size:11px;color:var(--text3)}
      #tag-master-ui .tm-top{background:rgba(80,160,255,.08)}
      #tag-master-ui .tm-bot{background:rgba(140,80,255,.08)}
      #tag-master-ui .tm-std{background:rgba(80,200,140,.08)}
      #tag-master-ui .tm-row{display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border)}
      #tag-master-ui .tm-row:last-child{border-bottom:none}
      #tag-master-ui .tm-num{width:22px;height:22px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3);flex-shrink:0}
      #tag-master-ui .tm-info{flex:1;min-width:0}
      #tag-master-ui .tm-name{font-weight:600}
      #tag-master-ui .tm-desc{font-size:10px;color:var(--text3);margin-top:2px}
      #tag-master-ui .tm-stat{font-size:10px;color:var(--text3);min-width:36px;text-align:right}
      #tag-master-ui .tm-icn{background:none;border:none;cursor:pointer;font-size:14px;color:var(--text2);padding:4px}
      #tag-master-ui .tm-flow{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      #tag-master-ui .tm-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid var(--border);border-radius:14px;background:var(--surface2);font-size:11px}
      #tag-master-ui .tm-chip-tag{background:rgba(255,200,80,.08);border-color:rgba(255,200,80,.3)}
      #tag-master-ui .tm-alias{font-size:9px;color:var(--text3)}
      #tag-master-ui .tm-cnt{font-size:9px;color:var(--text3);background:var(--surface);padding:1px 5px;border-radius:8px}
      #tag-master-ui .tm-sub{font-size:10px;font-weight:700;color:var(--text2);margin:4px 0 6px;letter-spacing:.5px}
      #tag-master-ui .tm-tg{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}
      #tag-master-ui .tm-tg:last-of-type{border-bottom:none}
      #tag-master-ui .tm-tg-i{flex:1;min-width:0}
      #tag-master-ui .tm-tg-t{font-weight:600}
      #tag-master-ui .tm-tg-d{font-size:10px;color:var(--text3);margin-top:2px}
      #tag-master-ui .tm-sw{position:relative;display:inline-block;width:36px;height:20px;flex-shrink:0}
      #tag-master-ui .tm-sw input{display:none}
      #tag-master-ui .tm-sw-s{position:absolute;inset:0;background:var(--surface2);border-radius:10px;border:1px solid var(--border);cursor:pointer;transition:.2s}
      #tag-master-ui .tm-sw-s::before{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.2s}
      #tag-master-ui .tm-sw input:checked + .tm-sw-s{background:var(--accent);border-color:var(--accent)}
      #tag-master-ui .tm-sw input:checked + .tm-sw-s::before{transform:translateX(16px)}
      #tag-master-ui .tm-slider{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
      #tag-master-ui .tm-sl-lab{font-weight:600;margin-bottom:8px}
      #tag-master-ui .tm-sl-sub{font-weight:400;color:var(--text3);font-size:10px;margin-left:6px}
      #tag-master-ui .tm-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      #tag-master-ui .tm-seg button{padding:8px 4px;border:1px solid var(--border);background:var(--surface2);border-radius:6px;color:var(--text2);cursor:pointer;font-size:11px;line-height:1.4}
      #tag-master-ui .tm-seg button span{font-size:9px;color:var(--text3);font-weight:400}
      #tag-master-ui .tm-seg button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
      #tag-master-ui .tm-seg button.on span{color:rgba(255,255,255,.85)}
      #tag-master-ui .tm-hint{font-size:10px;color:var(--text3);margin-top:8px;line-height:1.5}
      #tag-master-ui .tm-desc-top{font-size:11px;color:var(--text3);margin-bottom:8px}
    `;
    const s = document.createElement('style');
    s.id = 'tm-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ─── 起動 ──────────────────────────────────────
  function init() {
    injectStyle();
    load();
    const root = document.getElementById('tag-master-ui');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 外部からの再描画フック
  window.renderTagMasterUI = render;
  window.tagMasterState = () => state;
})();
