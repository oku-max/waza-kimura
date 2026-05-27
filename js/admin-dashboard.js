// ═══ WAZA KIMURA — AI管理ダッシュボード v52.480 ═══

const FEEDBACK_KEY   = 'waza_tag_feedback';
const TAGDICT_KEY    = 'waza_tag_dict';
const POSITIONS_KEY  = 'waza_positions';

const ALL_SUBS = ['corrections','categories','positions','feedback','tagmaster','aliasbuilder'];

// ── Admin sub-tab switching ──
export function switchAdminSub(sub) {
  ALL_SUBS.forEach(s => {
    const p = document.getElementById('admin-p-' + s);
    if (p) p.style.display = s === sub ? '' : 'none';
    const tab = document.querySelector(`.admin-stab[data-sub="${s}"]`);
    if (tab) {
      tab.style.color = s === sub ? 'var(--accent)' : 'var(--text3)';
      tab.style.borderBottomColor = s === sub ? 'var(--accent)' : 'transparent';
      tab.classList.toggle('active', s === sub);
    }
  });
  // aliasbuilder は全幅表示のため720px制限コンテナのpaddingを調整
  const adminInner = document.querySelector('#adminTab > div[style*="max-width:720px"]');
  if (adminInner) adminInner.style.paddingBottom = sub === 'aliasbuilder' ? '8px' : '';
  if (sub === 'corrections')  _renderCorrections();
  if (sub === 'categories')   _renderCategories();
  if (sub === 'positions')    _renderPositions();
  if (sub === 'feedback')     _renderFeedbackAdmin();
  if (sub === 'tagmaster')    _renderTagMaster();
  if (sub === 'aliasbuilder') _renderIframe('admin-p-aliasbuilder', '/alias-builder.html?v=6');
}
window.switchAdminSub = switchAdminSub;

// ── Firestore 双方向同期 ──
// 全設定データ（ルール/審査/ポジション/カテゴリ）を Firestore config/admin に保存し
// 端末をまたいで共有する。localStorage はキャッシュとして使い続ける。
let _adminSynced = false;

function _adminDocRef() {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return null;
  return firebase.firestore().collection('users').doc(uid).collection('data').doc('admin_config');
}

async function _syncFromFirestore() {
  if (_adminSynced) return;
  try {
    const ref = _adminDocRef();
    if (!ref) return;
    const doc = await ref.get();
    if (doc.exists) {
      const d = doc.data();
      if (Array.isArray(d.positions) && d.positions.length) localStorage.setItem(POSITIONS_KEY, JSON.stringify(d.positions));
      if (Array.isArray(d.tag_dict)  && d.tag_dict.length)  localStorage.setItem(TAGDICT_KEY,   JSON.stringify(d.tag_dict));
    }
    _adminSynced = true;
  } catch(e) { console.warn('[admin sync]', e.message); _adminSynced = true; }
}

function _pushToFirestore(field, data) {
  try {
    const ref = _adminDocRef();
    if (!ref) return;
    ref.set({ [field]: data }, { merge: true }).catch(e => console.warn('[admin push]', e.message));
  } catch(e) {}
}

// ── Main render (called from switchTab('admin')) ──
export async function renderAdminDashboard() {
  await _syncFromFirestore();
  _renderCorrections();
}
window.renderAdminDashboard = renderAdminDashboard;


// ═══ B: 修正履歴 ═══
function _renderCorrections() {
  const el = document.getElementById('admin-corrections-content');
  if (!el) return;

  const feedback = _getFeedback().slice().reverse(); // 新しい順
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  if (!feedback.length) {
    el.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;text-align:center;color:var(--text3);font-size:12px">
        <div style="font-size:24px;margin-bottom:8px">📝</div>
        修正履歴がまだありません。<br>VPanel で AI タグを編集すると、自動的に記録されます。
      </div>`;
    return;
  }

  // パターン検出
  const patterns = _detectPatterns(feedback);

  el.innerHTML = `
    ${patterns.length ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">🔍 検出パターン</div>
      ${patterns.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:var(--red);width:30px;text-align:center">${p.count}</div>
          <div style="font-size:12px;flex:1">${_esc(p.desc)}</div>
        </div>
      `).join('')}
    </div>` : ''}

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">修正履歴（直近${feedback.length}件）</div>
      ${feedback.map(f => {
        const date = new Date(f.ts);
        const timeStr = (date.getMonth()+1) + '/' + date.getDate() + ' ' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border2)">
          <div style="font-size:11px;color:var(--text3);width:65px;flex-shrink:0;font-family:'DM Mono',monospace">${timeStr}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.title)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
              ${Object.entries(f.diff).map(([field, d]) => {
                let html = `<span style="font-size:10px;font-weight:700;color:var(--text3);margin-right:2px">${field}:</span>`;
                if (d.removed) html += d.removed.map(r => `<span style="background:rgba(224,96,96,.15);color:var(--red);padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;text-decoration:line-through">${_esc(r)}</span>`).join('');
                if (d.removed && d.added) html += '<span style="font-size:11px;color:var(--text3);margin:0 3px">→</span>';
                if (d.added) html += d.added.map(a => `<span style="background:rgba(107,196,144,.15);color:var(--green);padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600">${_esc(a)}</span>`).join('');
                return html;
              }).join(' ')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <button onclick="clearTagFeedback()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text3);font-size:11px;padding:6px 14px;border-radius:16px;cursor:pointer;font-family:inherit;font-weight:600">🗑 履歴をクリア</button>
    </div>
  `;
}

// ─── (ルール管理UIは削除: Alias Builderに統合) ───

// ── Pattern detection ──
function _detectPatterns(feedback) {
  // 同じフィールドで同じ修正が複数回 → パターン
  const map = {};
  feedback.forEach(f => {
    if (!f.diff) return;
    Object.entries(f.diff).forEach(([field, d]) => {
      if (d.removed) d.removed.forEach(r => {
        const key = `remove:${field}:${r}`;
        if (!map[key]) map[key] = { key, field, action: 'remove', value: r, count: 0, desc: `${field} から「${r}」を削除（AIが誤って付与）` };
        map[key].count++;
      });
      if (d.added) d.added.forEach(a => {
        const key = `add:${field}:${a}`;
        if (!map[key]) map[key] = { key, field, action: 'add', value: a, count: 0, desc: `${field} に「${a}」を追加（AIが見落とし）` };
        map[key].count++;
      });
    });
  });
  return Object.values(map).filter(p => p.count >= 2).sort((a, b) => b.count - a.count);
}

// ── Data helpers ──
function _getFeedback() {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); } catch(e) { return []; }
}

// ── Global actions ──
export function clearTagFeedback() {
  if (!confirm('修正履歴をすべて削除しますか？')) return;
  localStorage.removeItem(FEEDBACK_KEY);
  _renderCorrections();
  window.toast?.('修正履歴をクリアしました');
}
window.clearTagFeedback = clearTagFeedback;

// ═══════════════════════════════════════════
// Step 5: タグ辞書管理
// ═══════════════════════════════════════════

// Default tag dictionary (i18n: ja/en)
const DEFAULT_TAG_DICT = [
  { id:'t1',  names:{ja:'パスガード',en:'Guard Pass'}, desc:'相手のガードを越えてトップを取る動作', aliases:{ja:['パスガ'],en:['passing']} },
  { id:'t2',  names:{ja:'フィニッシュ',en:'Submission'}, desc:'チョーク・関節技など相手を極めにいく動作', aliases:{ja:['極め','サブミッション'],en:['finish','sub']} },
  { id:'t3',  names:{ja:'スイープ',en:'Sweep'}, desc:'ボトムから相手をひっくり返す動作', aliases:{ja:[],en:['reversal']} },
  { id:'t4',  names:{ja:'テイクダウン',en:'Takedown'}, desc:'立ちから相手を倒す動作（投げ技含む）', aliases:{ja:['タックル'],en:['TD']} },
  { id:'t5',  names:{ja:'エスケープ・ディフェンス',en:'Escape / Defense'}, desc:'不利ポジションからの脱出と防御', aliases:{ja:['エスケープ','ディフェンス'],en:['escape','defense']} },
  { id:'t6',  names:{ja:'バックテイク・バックアタック',en:'Back Take / Back Attack'}, desc:'バックを取る／バックからの攻撃', aliases:{ja:['バックテイク'],en:['back take','back attack']} },
  { id:'t7',  names:{ja:'ガード構築・エントリー',en:'Guard Entry / Retention'}, desc:'ガードを取る・特定ガードの入り口', aliases:{ja:['ガード構築'],en:['guard pull','guard entry']} },
  { id:'t8',  names:{ja:'ガードリテンション',en:'Guard Retention'}, desc:'足を取られないボトムの守り', aliases:{ja:['リテンション'],en:['retention']} },
  { id:'t9',  names:{ja:'コントロール／プレッシャー',en:'Control / Pressure'}, desc:'トップポジションの維持・押さえ', aliases:{ja:['コントロール','プレッシャー'],en:['control','pressure']} },
  { id:'t10', names:{ja:'コンセプト・原理',en:'Concept / Principle'}, desc:'技ではない原則的な学び', aliases:{ja:['コンセプト','原理'],en:['concept','principle','theory']} },
];

function _getCategory() {
  try {
    const stored = localStorage.getItem(TAGDICT_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_TAG_DICT];
  } catch(e) { return [...DEFAULT_TAG_DICT]; }
}
function _saveCategory(dict) {
  try { localStorage.setItem(TAGDICT_KEY, JSON.stringify(dict)); } catch(e) {}
  _pushToFirestore('tag_dict', dict);
}

function _renderCategories() {
  const el = document.getElementById('admin-categories-content');
  if (!el) return;

  const dict = _getCategory();
  const videos = (window.videos || []).filter(v => !v.archived);
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Count usage of each tag in cat field
  const catCounts = {};
  videos.forEach(v => {
    (v.cat || []).forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
  });

  // tag-master.js の CATEGORIES から判定キーワードを引く
  const catRules = {};
  (window.CATEGORIES || []).forEach(c => { catRules[c.name] = c.aliases || []; });

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
        <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent)">${dict.length}</span>
        <span style="font-size:11px;color:var(--text3)">カテゴリ数</span>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 12px;gap:6px;flex:1;min-width:180px">
        <span>🔍</span>
        <input id="categories-search" type="text" placeholder="検索..." oninput="filterCategory()" style="background:none;border:none;outline:none;color:var(--text);font-size:12px;flex:1;font-family:inherit">
      </div>
      <button onclick="showAddCatForm()" style="background:var(--accent);color:var(--on-accent);border:none;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">+ カテゴリ追加</button>
    </div>

    <!-- Add tag form -->
    <div id="categories-add-form" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">日本語名</div>
          <input id="categories-new-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">English name</div>
          <input id="categories-new-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="hideAddCatForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
        <button onclick="addCategoryEntry()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
      </div>
    </div>

    <!-- Edit category form -->
    <div id="categories-edit-form" style="display:none;background:var(--surface);border:2px solid var(--accent);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:10px">カテゴリを編集</div>
      <input type="hidden" id="cat-edit-idx">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">日本語名</div>
          <input id="cat-edit-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">English name</div>
          <input id="cat-edit-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <div style="flex:1;min-width:160px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">JA エイリアス（カンマ区切り）</div>
          <input id="cat-edit-aliases-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:160px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">EN aliases (comma separated)</div>
          <input id="cat-edit-aliases-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="hideEditCatForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
        <button onclick="saveCategoryEdit()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">保存</button>
      </div>
    </div>

    <!-- Tag list -->
    <div id="categories-list" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:500px">
        <tr>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">名前</th>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">判定キーワード</th>
          <th style="padding:10px 8px;border-bottom:2px solid var(--border)"></th>
        </tr>
        ${dict.map((t, i) => {
          const keywords = catRules[t.names.ja] || [];
          return `
          <tr class="categories-row" data-search="${_esc((t.names.ja + ' ' + t.names.en + ' ' + keywords.join(' ')).toLowerCase())}">
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top;min-width:140px">
              <div style="font-weight:700;font-size:13px">${_esc(t.names.ja)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${_esc(t.names.en)}</div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              ${keywords.length
                ? keywords.map(k => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)">${_esc(k)}</span>`).join('')
                : `<span style="font-size:11px;color:var(--text3)">—</span>`}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;white-space:nowrap">
              <button onclick="editCategoryEntry(${i})" style="background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">編集</button>
            </td>
          </tr>`;
        }).join('')}
      </table>
    </div>
  `;
}

export function showAddCatForm() {
  const f = document.getElementById('categories-add-form');
  if (f) f.style.display = 'block';
}
window.showAddCatForm = showAddCatForm;

export function hideAddCatForm() {
  const f = document.getElementById('categories-add-form');
  if (f) f.style.display = 'none';
}
window.hideAddCatForm = hideAddCatForm;

export function addCategoryEntry() {
  const ja = document.getElementById('categories-new-ja')?.value.trim();
  const en = document.getElementById('categories-new-en')?.value.trim();
  if (!ja) { window.toast?.('日本語名を入力してください'); return; }
  const dict = _getCategory();
  dict.push({ id: 't' + Date.now(), names: { ja, en: en || ja }, aliases: { ja: [], en: [] } });
  _saveCategory(dict);
  window.syncCatsFromStorage?.();
  hideAddCatForm();
  _renderCategories();
  window.toast?.('カテゴリを追加しました');
}
window.addCategoryEntry = addCategoryEntry;

export function deleteCategoryEntry(idx) {
  const dict = _getCategory();
  dict.splice(idx, 1);
  _saveCategory(dict);
  window.syncCatsFromStorage?.();
  _renderCategories();
  window.toast?.('カテゴリを削除しました');
}
window.deleteCategoryEntry = deleteCategoryEntry;

export function editCategoryEntry(idx) {
  const dict = _getCategory();
  const t = dict[idx];
  if (!t) return;
  document.getElementById('cat-edit-idx').value = idx;
  document.getElementById('cat-edit-ja').value  = t.names.ja;
  document.getElementById('cat-edit-en').value  = t.names.en;
  document.getElementById('cat-edit-aliases-ja').value = (t.aliases?.ja||[]).join(', ');
  document.getElementById('cat-edit-aliases-en').value = (t.aliases?.en||[]).join(', ');
  hideAddCatForm();
  const f = document.getElementById('categories-edit-form');
  if (f) { f.style.display = 'block'; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
window.editCategoryEntry = editCategoryEntry;

export function hideEditCatForm() {
  const f = document.getElementById('categories-edit-form');
  if (f) f.style.display = 'none';
}
window.hideEditCatForm = hideEditCatForm;

export function saveCategoryEdit() {
  const idx     = parseInt(document.getElementById('cat-edit-idx')?.value);
  const ja      = document.getElementById('cat-edit-ja')?.value.trim();
  const en      = document.getElementById('cat-edit-en')?.value.trim();
  const aliasJa = (document.getElementById('cat-edit-aliases-ja')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const aliasEn = (document.getElementById('cat-edit-aliases-en')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  if (!ja) { window.toast?.('日本語名を入力してください'); return; }
  const dict = _getCategory();
  if (isNaN(idx) || idx < 0 || idx >= dict.length) return;
  dict[idx] = { ...dict[idx], names: { ja, en: en || ja }, aliases: { ja: aliasJa, en: aliasEn } };
  _saveCategory(dict);
  window.syncCatsFromStorage?.();
  hideEditCatForm();
  _renderCategories();
  window.toast?.('保存しました');
}
window.saveCategoryEdit = saveCategoryEdit;

export function filterCategory() {
  const q = (document.getElementById('categories-search')?.value || '').toLowerCase();
  document.querySelectorAll('.categories-row').forEach(row => {
    row.style.display = !q || row.dataset.search.includes(q) ? '' : 'none';
  });
}
window.filterCategory = filterCategory;


// ═══════════════════════════════════════════
// Step 6: ポジション管理
// ═══════════════════════════════════════════

const DEFAULT_POSITIONS = [
  // ── 数字・アルファベット ──
  { id:'p23', names:{ja:'50/50',en:'50/50'}, group:'leg', aliases:{ja:['フィフティフィフティ'],en:['fifty fifty']} },
  { id:'p16', names:{ja:'70/30ガード',en:'70/30 Guard'}, group:'guard', aliases:{ja:[],en:['70/30','seventy thirty']} },
  { id:'p11', names:{ja:'Kガード',en:'K Guard'}, group:'guard', aliases:{ja:[],en:['k guard','k-guard']} },
  { id:'p10', names:{ja:'SLX',en:'Single Leg X'}, group:'guard', aliases:{ja:['シングルレッグX','シングルレッグXガード'],en:['SLX','single leg X','single leg x guard']} },
  { id:'p9',  names:{ja:'Xガード',en:'X Guard'}, group:'guard', aliases:{ja:[],en:['x guard','x-guard']} },
  // ── あいうえお順 ──
  { id:'p15', names:{ja:'インバーテッド',en:'Inverted'}, group:'guard', aliases:{ja:['トルネードガード'],en:['inverted guard','tornado guard','tornado']} },
  { id:'p21', names:{ja:'オープンガード',en:'Open Guard'}, group:'guard', aliases:{ja:['手ぶらガード'],en:['open guard','no grip guard']} },
  { id:'p22', names:{ja:'オクトパスガード',en:'Octopus Guard'}, group:'guard', aliases:{ja:[],en:['octopus','octopus guard']} },
  { id:'p14', names:{ja:'片襟片袖',en:'Collar Sleeve'}, group:'guard', aliases:{ja:['片襟片袖ガード'],en:['collar sleeve','collar and sleeve']} },
  { id:'p1',  names:{ja:'クローズドガード',en:'Closed Guard'}, group:'guard', aliases:{ja:['フルガード'],en:['full guard','closed']} },
  { id:'p19', names:{ja:'クロスガード',en:'Cross Guard'}, group:'guard', aliases:{ja:[],en:['cross guard']} },
  { id:'p24', names:{ja:'サドル',en:'Saddle / Inside Sankaku'}, group:'leg', aliases:{ja:['内三角','411'],en:['411','inside sankaku','honeyhole','ashi garami']} },
  { id:'p17', names:{ja:'シッティングガード',en:'Sit-Up Guard'}, group:'guard', aliases:{ja:['シットアップガード'],en:['sit up guard','sitting guard','seated guard']} },
  { id:'p18', names:{ja:'シングルレッグガード',en:'Single Leg Guard'}, group:'guard', aliases:{ja:[],en:['single leg guard']} },
  { id:'p26', names:{ja:'スタンディング',en:'Standing'}, group:'stand', aliases:{ja:['立ち技'],en:['stand up','standing']} },
  { id:'p7',  names:{ja:'スパイダーガード',en:'Spider Guard'}, group:'guard', aliases:{ja:['インバーテッドスパイダー'],en:['spider','inverted spider']} },
  { id:'p27', names:{ja:'その他',en:'Other'}, group:'other', aliases:{ja:[],en:[]} },
  { id:'p25', names:{ja:'タートル',en:'Turtle'}, group:'top', aliases:{ja:['亀'],en:[]} },
  { id:'p3',  names:{ja:'ディープハーフ',en:'Deep Half Guard'}, group:'guard', aliases:{ja:[],en:['deep half']} },
  { id:'p5',  names:{ja:'デラヒーバ',en:'De La Riva'}, group:'guard', aliases:{ja:['DLR'],en:['DLR','de la riva']} },
  { id:'p13', names:{ja:'ニーシールド',en:'Knee Shield'}, group:'guard', aliases:{ja:['Zガード'],en:['Z guard','knee shield','z-guard']} },
  { id:'p2',  names:{ja:'ハーフガード',en:'Half Guard'}, group:'guard', aliases:{ja:['脇差し','アンダーフックハーフ','ロックダウン','シングルレッグハーフ'],en:['half','underhook half','lockdown','single leg half']} },
  { id:'p4',  names:{ja:'バタフライガード',en:'Butterfly Guard'}, group:'guard', aliases:{ja:['ハーフバタフライ'],en:['butterfly','half butterfly']} },
  { id:'p8',  names:{ja:'ラッソーガード',en:'Lasso Guard'}, group:'guard', aliases:{ja:['シャローラッソー'],en:['lasso','shallow lasso']} },
  { id:'p12', names:{ja:'ラペルガード',en:'Lapel Guard'}, group:'guard', aliases:{ja:['ワームガード','スクイッドガード','グッバーガード','ラペル系'],en:['lapel','worm guard','worm','squid guard','squid','gubber guard','gubber']} },
  { id:'p6',  names:{ja:'リバースデラヒーバ',en:'Reverse De La Riva'}, group:'guard', aliases:{ja:['RDLR','リバデラ'],en:['RDLR','reverse DLR']} },
  { id:'p20', names:{ja:'リバースハーフガード',en:'Reverse Half Guard'}, group:'guard', aliases:{ja:['リバースハーフ'],en:['reverse half','reverse half guard']} },
];

const POS_GROUPS = {
  guard:  { ja: 'ガード', en: 'Guard', color: 'var(--green)' },
  top:    { ja: 'トップ', en: 'Top', color: 'var(--blue)' },
  leg:    { ja: 'レッグ', en: 'Leg Entanglement', color: 'var(--purple)' },
  stand:  { ja: 'スタンド', en: 'Standing', color: 'var(--accent)' },
  other:  { ja: 'その他', en: 'Other', color: 'var(--text3)' },
};

function _getPositions() {
  try {
    const stored = localStorage.getItem(POSITIONS_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_POSITIONS];
  } catch(e) { return [...DEFAULT_POSITIONS]; }
}
function _savePositions(pos) {
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(pos)); } catch(e) {}
  _pushToFirestore('positions', pos);
}

let _posFilterGroup = null;

function _renderPositions() {
  const el = document.getElementById('admin-positions-content');
  if (!el) return;

  const positions = _getPositions();
  const videos = (window.videos || []).filter(v => !v.archived);
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Count usage
  const posCounts = {};
  videos.forEach(v => {
    (v.pos || []).forEach(p => { posCounts[p] = (posCounts[p] || 0) + 1; });
  });

  // Group counts
  const groupCounts = {};
  positions.forEach(p => { groupCounts[p.group] = (groupCounts[p.group] || 0) + 1; });

  const filtered = _posFilterGroup ? positions.filter(p => p.group === _posFilterGroup) : positions;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
        <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent)">${positions.length}</span>
        <span style="font-size:11px;color:var(--text3)">ポジション数</span>
      </div>
      ${Object.entries(POS_GROUPS).map(([g, info]) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
          <span style="font-size:16px;font-weight:700;font-family:'DM Mono',monospace;color:${info.color}">${groupCounts[g] || 0}</span>
          <span style="font-size:11px;color:var(--text3)">${info.ja}</span>
        </div>
      `).join('')}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 12px;gap:6px;flex:1;min-width:180px">
        <span>🔍</span>
        <input id="pos-search" type="text" placeholder="検索..." oninput="filterPositions()" style="background:none;border:none;outline:none;color:var(--text);font-size:12px;flex:1;font-family:inherit">
      </div>
      ${Object.entries(POS_GROUPS).map(([g, info]) => `
        <button onclick="filterPosGroup('${g}')" style="background:${_posFilterGroup===g?info.color+'22':'var(--surface)'};border:1px solid ${_posFilterGroup===g?info.color:'var(--border)'};color:${_posFilterGroup===g?info.color:'var(--text2)'};font-size:11px;padding:6px 12px;border-radius:20px;cursor:pointer;font-family:inherit;font-weight:600;white-space:nowrap">${info.ja}</button>
      `).join('')}
      ${_posFilterGroup ? `<button onclick="filterPosGroup(null)" style="background:var(--surface2);border:1px solid var(--border);color:var(--text3);font-size:11px;padding:6px 10px;border-radius:20px;cursor:pointer;font-family:inherit">× クリア</button>` : ''}
      <button onclick="showAddPosForm()" style="background:var(--accent);color:var(--on-accent);border:none;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">+ 追加</button>
    </div>

    <!-- Add position form -->
    <div id="pos-add-form" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">日本語名</div>
          <input id="pos-new-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">English name</div>
          <input id="pos-new-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">グループ</div>
          <select id="pos-new-group" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box">
            ${Object.entries(POS_GROUPS).map(([g, info]) => `<option value="${g}">${info.ja} / ${info.en}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="hideAddPosForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
        <button onclick="addPosition()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
      </div>
    </div>

    <!-- Edit position form -->
    <div id="pos-edit-form" style="display:none;background:var(--surface);border:2px solid var(--accent);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:10px">ポジションを編集</div>
      <input type="hidden" id="pos-edit-idx">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">日本語名</div>
          <input id="pos-edit-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">English name</div>
          <input id="pos-edit-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="min-width:100px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">グループ</div>
          <select id="pos-edit-group" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer;box-sizing:border-box">
            ${Object.entries(POS_GROUPS).map(([g, info]) => `<option value="${g}">${info.ja} / ${info.en}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <div style="flex:1;min-width:160px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">JA エイリアス（カンマ区切り）</div>
          <input id="pos-edit-aliases-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:160px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">EN aliases (comma separated)</div>
          <input id="pos-edit-aliases-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="hideEditPosForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
        <button onclick="savePositionEdit()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">保存</button>
      </div>
    </div>

    <!-- Position list -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:550px">
        <tr>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">名前</th>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">グループ</th>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">エイリアス</th>
          <th style="text-align:right;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">使用数</th>
          <th style="padding:10px 8px;border-bottom:2px solid var(--border)"></th>
        </tr>
        ${filtered.map((p, i) => {
          const cnt = posCounts[p.names.ja] || 0;
          const gi = POS_GROUPS[p.group] || POS_GROUPS.other;
          const realIdx = positions.indexOf(p);
          return `
          <tr class="pos-row" data-search="${_esc((p.names.ja + ' ' + p.names.en + ' ' + (p.aliases?.ja||[]).join(' ') + ' ' + (p.aliases?.en||[]).join(' ')).toLowerCase())}">
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              <div style="font-weight:700;font-size:13px">${_esc(p.names.ja)}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">${_esc(p.names.en)}</div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${gi.color}22;color:${gi.color}">${gi.ja}</span>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              ${(p.aliases?.ja||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">JA</span>${_esc(a)}</span>`).join('')}
              ${(p.aliases?.en||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">EN</span>${_esc(a)}</span>`).join('')}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--text2)">${cnt}</td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;white-space:nowrap">
              <button onclick="editPosition(${realIdx})" style="background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit;margin-right:4px">編集</button>
              <button onclick="deletePosition(${realIdx})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">削除</button>
            </td>
          </tr>`;
        }).join('')}
      </table>
    </div>
  `;
}

export function showAddPosForm() {
  const f = document.getElementById('pos-add-form');
  if (f) f.style.display = 'block';
}
window.showAddPosForm = showAddPosForm;

export function hideAddPosForm() {
  const f = document.getElementById('pos-add-form');
  if (f) f.style.display = 'none';
}
window.hideAddPosForm = hideAddPosForm;

export function addPosition() {
  const ja = document.getElementById('pos-new-ja')?.value.trim();
  const en = document.getElementById('pos-new-en')?.value.trim();
  const group = document.getElementById('pos-new-group')?.value || 'other';
  if (!ja) { window.toast?.('日本語名を入力してください'); return; }
  const positions = _getPositions();
  positions.push({ id: 'p' + Date.now(), names: { ja, en: en || ja }, group, aliases: { ja: [], en: [] } });
  _savePositions(positions);
  window.syncPositionsFromStorage?.();
  hideAddPosForm();
  _renderPositions();
  window.toast?.('ポジションを追加しました');
}
window.addPosition = addPosition;

export function deletePosition(idx) {
  const positions = _getPositions();
  positions.splice(idx, 1);
  _savePositions(positions);
  window.syncPositionsFromStorage?.();
  _renderPositions();
  window.toast?.('ポジションを削除しました');
}
window.deletePosition = deletePosition;

export function editPosition(idx) {
  const positions = _getPositions();
  const p = positions[idx];
  if (!p) return;
  document.getElementById('pos-edit-idx').value = idx;
  document.getElementById('pos-edit-ja').value  = p.names.ja;
  document.getElementById('pos-edit-en').value  = p.names.en;
  document.getElementById('pos-edit-group').value = p.group || 'other';
  document.getElementById('pos-edit-aliases-ja').value = (p.aliases?.ja||[]).join(', ');
  document.getElementById('pos-edit-aliases-en').value = (p.aliases?.en||[]).join(', ');
  hideAddPosForm();
  const f = document.getElementById('pos-edit-form');
  if (f) { f.style.display = 'block'; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
window.editPosition = editPosition;

export function hideEditPosForm() {
  const f = document.getElementById('pos-edit-form');
  if (f) f.style.display = 'none';
}
window.hideEditPosForm = hideEditPosForm;

export function savePositionEdit() {
  const idx     = parseInt(document.getElementById('pos-edit-idx')?.value);
  const ja      = document.getElementById('pos-edit-ja')?.value.trim();
  const en      = document.getElementById('pos-edit-en')?.value.trim();
  const group   = document.getElementById('pos-edit-group')?.value || 'other';
  const aliasJa = (document.getElementById('pos-edit-aliases-ja')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const aliasEn = (document.getElementById('pos-edit-aliases-en')?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  if (!ja) { window.toast?.('日本語名を入力してください'); return; }
  const positions = _getPositions();
  if (isNaN(idx) || idx < 0 || idx >= positions.length) return;
  positions[idx] = { ...positions[idx], names: { ja, en: en || ja }, group, aliases: { ja: aliasJa, en: aliasEn } };
  _savePositions(positions);
  window.syncPositionsFromStorage?.();
  hideEditPosForm();
  _renderPositions();
  window.toast?.('保存しました');
}
window.savePositionEdit = savePositionEdit;

export function filterPosGroup(group) {
  _posFilterGroup = _posFilterGroup === group ? null : group;
  _renderPositions();
}
window.filterPosGroup = filterPosGroup;

export function filterPositions() {
  const q = (document.getElementById('pos-search')?.value || '').toLowerCase();
  document.querySelectorAll('.pos-row').forEach(row => {
    row.style.display = !q || row.dataset.search.includes(q) ? '' : 'none';
  });
}
window.filterPositions = filterPositions;

// ── フィードバック閲覧（オーナー専用） ──
const _OWNER_FB = 'okujournal@gmail.com';
const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const TYPE_LABEL = { howto:'使い方', bug:'バグ', request:'要望', other:'その他' };
const TYPE_COLOR = { howto:'var(--blue)', bug:'var(--red)', request:'var(--green)', other:'var(--text3)' };
const PAGE_LABEL = { card:'カード', table:'テーブル', filter:'フィルター', vpanel:'Vパネル', settings:'設定', library:'Library', search:'Search', notes:'Notes', other:'その他' };

async function _renderFeedbackAdmin(targetEl) {
  const el = targetEl || document.getElementById('admin-p-feedback');
  if (!el) return;

  const email = window._firebaseCurrentUser?.()?.email;
  if (email !== _OWNER_FB) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">🔒 オーナーのみ閲覧できます</div>';
    return;
  }

  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">読み込み中...</div>';

  try {
    const snap = await firebase.firestore()
      .collection('feedback')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    if (snap.empty) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">フィードバックはまだありません</div>';
      return;
    }

    const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const rows = items.map((d, idx) => {
      const date = (() => {
        if (!d.createdAt) return '—';
        const jst = new Date(new Date(d.createdAt).getTime() + 9 * 60 * 60 * 1000);
        return String(jst.getUTCMonth()+1).padStart(2,'0') + '-' + String(jst.getUTCDate()).padStart(2,'0') + ' ' + String(jst.getUTCHours()).padStart(2,'0') + ':' + String(jst.getUTCMinutes()).padStart(2,'0');
      })();
      const typeLabel = TYPE_LABEL[d.type] || d.type || '—';
      const typeColor = TYPE_COLOR[d.type] || 'var(--text3)';
      const pageLabel = PAGE_LABEL[d.page] || d.page || '—';
      const preview = (d.text || '').slice(0, 50) + ((d.text || '').length > 50 ? '…' : '');
      const imgs = d.images || (d.imageData ? [d.imageData] : []);
      const imgCount = imgs.length;
      const hasMemo = !!d.adminMemo;

      return `
        <tr class="fb-adm-row" onclick="fbAdmToggle(${idx},this)">
          <td style="padding:7px 6px;white-space:nowrap">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${typeColor}22;color:${typeColor}">${_esc(typeLabel)}</span>
          </td>
          <td style="padding:7px 6px;white-space:nowrap">
            <span style="font-size:10px;color:var(--text3);background:var(--surface3);padding:2px 7px;border-radius:10px">${_esc(pageLabel)}</span>
          </td>
          <td style="padding:7px 6px;font-size:11px;color:var(--text3);white-space:nowrap;font-family:'DM Mono',monospace">${date}</td>
          <td style="padding:7px 6px;font-size:12px;color:var(--text);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${preview ? _esc(preview) : '<span style="color:var(--text3)">—</span>'}
          </td>
          <td style="padding:7px 4px;text-align:center;font-size:11px;color:var(--text3);white-space:nowrap">
            ${imgCount ? `🖼 ${imgCount}` : ''}
          </td>
          <td style="padding:7px 4px;text-align:center;font-size:11px">
            ${hasMemo ? '<span style="color:var(--accent)" title="メモあり">💬</span>' : ''}
          </td>
          <td style="padding:7px 6px;text-align:right" onclick="event.stopPropagation()">
            <button onclick="fbAdmDelete('${d.id}',${idx})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:10px;padding:3px 8px;border-radius:10px;cursor:pointer;font-family:inherit">削除</button>
          </td>
        </tr>
        <tr id="fb-adm-detail-${idx}" style="display:none">
          <td colspan="7" style="padding:0 0 6px 0">
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin:0 0 2px 0">
              ${d.text ? `<div style="font-size:12px;line-height:1.65;margin-bottom:10px;white-space:pre-wrap">${_esc(d.text)}</div>` : ''}
              ${imgCount ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
                ${imgs.map(src => `<img src="${src}" style="max-height:130px;max-width:180px;border-radius:6px;cursor:zoom-in;object-fit:cover" onclick="fbAdmLightbox(this.src)">`).join('')}
              </div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">from: ${_esc(d.email || '—')}</div>
              <div style="display:flex;gap:6px;align-items:flex-end">
                <textarea id="fb-memo-${idx}" placeholder="管理メモ（自分用）" rows="2"
                  style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);resize:vertical;font-family:inherit">${_esc(d.adminMemo || '')}</textarea>
                <button onclick="fbAdmSaveMemo('${d.id}',${idx})"
                  style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">保存</button>
              </div>
            </div>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:12px;color:var(--text3)">${items.length} 件</div>
        <button onclick="window.reloadFeedbackAdmin?.()" style="font-size:11px;padding:4px 12px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);cursor:pointer">↻ 更新</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:460px">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">種類</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">ページ</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">日時</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px">内容</th>
              <th style="padding:5px 4px;width:36px"></th>
              <th style="padding:5px 4px;width:24px"></th>
              <th style="padding:5px 6px;width:52px"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <style>
        .fb-adm-row { border-bottom:1px solid var(--border2); cursor:pointer; transition:background .1s; }
        .fb-adm-row:hover { background:var(--surface2); }
      </style>
      <div id="fb-img-lb" onclick="this.style.display='none'" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);align-items:center;justify-content:center;cursor:zoom-out">
        <img id="fb-img-lb-img" style="max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);pointer-events:none">
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;color:#f66;font-size:12px;">読み込みエラー: ${e.message}</div>`;
  }
}

window.reloadFeedbackAdmin = () => _renderFeedbackAdmin(document.getElementById('admin-inner-fb') || undefined);

window.fbAdmToggle = function(idx, row) {
  const detail = document.getElementById('fb-adm-detail-' + idx);
  if (!detail) return;
  const open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : '';
};

window.fbAdmDelete = async function(docId, idx) {
  if (!confirm('このフィードバックを削除しますか？')) return;
  try {
    await firebase.firestore().collection('feedback').doc(docId).delete();
    document.getElementById('fb-adm-detail-' + idx)?.remove();
    // find and remove the data row by looking for the row that triggered this
    const tbody = document.querySelector('#admin-p-feedback tbody');
    if (tbody) {
      // rebuild by reloading
      window.reloadFeedbackAdmin?.();
    }
  } catch(e) {
    alert('削除に失敗しました: ' + e.message);
  }
};

window.fbAdmLightbox = function(src) {
  const lb = document.getElementById('fb-img-lb');
  const img = document.getElementById('fb-img-lb-img');
  if (!lb || !img) return;
  img.src = src;
  lb.style.display = 'flex';
};

window.fbAdmSaveMemo = async function(docId, idx) {
  const memo = document.getElementById('fb-memo-' + idx)?.value || '';
  try {
    await firebase.firestore().collection('feedback').doc(docId).update({ adminMemo: memo });
    window.toast?.('💾 メモ保存');
  } catch(e) {
    alert('保存に失敗しました。Firestoreルールにdelete/updateを追加してください。');
  }
};


// ─── iframe ページ埋め込み（遅延ロード）────────────────────────
function _renderIframe(panelId, src) {
  const el = document.getElementById(panelId);
  if (!el) return;
  // 既に iframe が入っていたらスキップ（再レンダリング不要）
  if (el.querySelector('iframe')) return;
  el.innerHTML = `<iframe src="${src}" style="width:100%;height:calc(100vh - 120px);border:none;display:block"></iframe>`;
}

// ─── タグ全体図 ──────────────────────────────────────────────
function _renderTagMaster() {
  const el = document.getElementById('admin-p-tagmaster');
  if (!el) return;

  const CATS  = window.CATEGORIES  || [];
  const POS   = window.POSITIONS   || [];
  const TB_KW = window.TB_KEYWORDS || {};

  const CAT_META = {
    escape:    { tb:'BOT' }, entry:     { tb:'BOT' }, retention: { tb:'BOT' },
    control:   { tb:'TOP' }, concept:   { tb:'NEU' }, sweep:     { tb:'BOT' },
    takedown:  { tb:'STD' }, back:      { tb:'NEU' }, pass:      { tb:'TOP' },
    finish:    { tb:'NEU' },
  };
  const TB_CLR = { BOT:'#c94f1a', TOP:'#1a6fd4', STD:'#1a9e6e', NEU:'#8840cc' };
  const TB_BG  = { BOT:'rgba(217,79,26,.08)', TOP:'rgba(26,111,212,.08)', STD:'rgba(26,158,110,.08)', NEU:'rgba(136,64,204,.08)' };

  const kw = kws => kws.map(k => `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:#f0f2f8;border:1px solid #d0d6e8;color:#6b7590;margin:2px">${k}</span>`).join('');
  const chip = a => `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#f4f6fa;border:1px solid #d0d6e8;color:#4a5070;margin:2px;display:inline-block">${a}</span>`;
  const badge = tb => `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:${TB_BG[tb]||'#eee'};color:${TB_CLR[tb]||'#999'}">${tb}</span>`;

  // ── Layer 1: TB ──
  let html = `<div style="font-size:11px;color:#7a85a0;margin-bottom:16px">tag-master.js の内容をリアルタイムで表示。編集は Alias ビルダーから行う。</div>`;

  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 1 — TB キーワード</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">`;
  for (const [tb, kws] of Object.entries(TB_KW)) {
    const clr = tb==='トップ'?'#1a6fd4':tb==='ボトム'?'#c94f1a':'#1a9e6e';
    const bg  = tb==='トップ'?'rgba(26,111,212,.06)':tb==='ボトム'?'rgba(217,79,26,.06)':'rgba(26,158,110,.06)';
    html += `<div style="border-radius:10px;border:1px solid #d0d6e8;overflow:hidden">
      <div style="padding:8px 12px;background:${bg};font-weight:700;font-size:12px;color:${clr}">${tb}</div>
      <div style="padding:8px;display:flex;flex-wrap:wrap">${kw(kws)}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 2: Categories ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 2 — Category (${CATS.length}固定)</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:20px">`;
  for (const c of CATS) {
    const tb = CAT_META[c.id]?.tb || 'NEU';
    html += `<div style="border-radius:10px;border:1px solid #d0d6e8;padding:10px 12px;background:#fff">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-weight:700;font-size:12px">${c.name}</span>
        ${badge(tb)}
        <span style="font-size:10px;color:#9aa0b8;margin-left:auto">${(c.aliases||[]).length}語</span>
      </div>
      <div style="display:flex;flex-wrap:wrap">${(c.aliases||[]).map(chip).join('')}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 3: Positions ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 3 — Position (${POS.length}固定)</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin-bottom:20px">`;
  for (const p of POS) {
    html += `<div style="border-radius:8px;border:1px solid #d0d6e8;padding:8px 10px;background:#fff">
      <div style="font-weight:700;font-size:12px;color:#8840cc;margin-bottom:4px">${p.ja} <span style="font-size:10px;color:#9aa0b8;font-weight:400">${p.en}</span></div>
      <div style="display:flex;flex-wrap:wrap">${(p.aliases||[]).map(chip).join('')}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 4: Tags ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#1a2038">Layer 4 — #Tag（自由記入）</div>`;
  html += `<div style="font-size:11px;color:#7a85a0;background:#f4f6fa;border-radius:8px;padding:10px 14px">サイドバー非表示・AI自動抽出はデフォルト OFF。ドリル・その他などはここに格納。</div>`;

  el.innerHTML = html;
}
