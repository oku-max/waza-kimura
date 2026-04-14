// ═══ WAZA KIMURA — AI管理ダッシュボード v50.9 ═══
// Admin-only: 精度・修正履歴・ルール管理

const FEEDBACK_KEY  = 'waza_tag_feedback';
const RULES_KEY     = 'waza_ai_rules';
const TAGDICT_KEY   = 'waza_tag_dict';
const POSITIONS_KEY = 'waza_positions';

const ALL_SUBS = ['accuracy','corrections','rules','tagdict','positions'];

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
  if (sub === 'accuracy')    _renderAccuracy();
  if (sub === 'corrections') _renderCorrections();
  if (sub === 'rules')       _renderRules();
  if (sub === 'tagdict')     _renderTagDict();
  if (sub === 'positions')   _renderPositions();
}
window.switchAdminSub = switchAdminSub;

// ── Main render (called from switchTab('admin')) ──
export function renderAdminDashboard() {
  _renderAccuracy();
}
window.renderAdminDashboard = renderAdminDashboard;

// ═══ A: 精度ダッシュボード ═══
function _renderAccuracy() {
  const el = document.getElementById('admin-accuracy-content');
  if (!el) return;

  const videos = (window.videos || []).filter(v => !v.archived);
  const aiVideos = videos.filter(v => v.ai);
  const verified = videos.filter(v => v.verified);
  const feedback = _getFeedback();

  // 精度を計算（検証済み動画ベース）
  const stats = { total: verified.length, catMatch: 0, posMatch: 0, tagMatch: 0 };
  // フィードバックから修正率を算出
  const corrected = feedback.length;
  const corrRate = aiVideos.length > 0 ? Math.round(((aiVideos.length - corrected) / aiVideos.length) * 100) : 0;

  // カテゴリ別・ポジション別の修正頻度を集計
  const catCorrections = {};
  const posCorrections = {};
  feedback.forEach(f => {
    if (f.diff?.cat) {
      (f.diff.cat.removed || []).forEach(c => { catCorrections[c] = (catCorrections[c] || 0) + 1; });
      (f.diff.cat.added || []).forEach(c => { catCorrections[c] = (catCorrections[c] || 0) + 1; });
    }
    if (f.diff?.pos) {
      (f.diff.pos.removed || []).forEach(p => { posCorrections[p] = (posCorrections[p] || 0) + 1; });
      (f.diff.pos.added || []).forEach(p => { posCorrections[p] = (posCorrections[p] || 0) + 1; });
    }
  });

  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  el.innerHTML = `
    <!-- 全体スコア -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent)">${aiVideos.length}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">AI タグ済み</div>
      </div>
      <div style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;font-family:'DM Mono',monospace;color:var(--green)">${verified.length}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">検証済み</div>
      </div>
      <div style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;font-family:'DM Mono',monospace;color:${corrRate>=70?'var(--green)':corrRate>=50?'var(--accent)':'var(--red)'}">${corrRate}%</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">無修正率</div>
      </div>
      <div style="flex:1;min-width:100px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center">
        <div style="font-size:28px;font-weight:700;font-family:'DM Mono',monospace;color:var(--red)">${corrected}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">修正件数</div>
      </div>
    </div>

    <!-- カテゴリ別修正頻度 -->
    ${Object.keys(catCorrections).length ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">カテゴリ別修正頻度</div>
      ${Object.entries(catCorrections).sort((a,b) => b[1]-a[1]).map(([cat, cnt]) => {
        const maxCnt = Math.max(...Object.values(catCorrections));
        const pct = Math.round((cnt / maxCnt) * 100);
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border2)">
          <div style="font-size:12px;font-weight:600;width:180px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(cat)}</div>
          <div style="flex:1;height:8px;background:var(--surface3);border-radius:4px;overflow:hidden"><div style="height:100%;border-radius:4px;background:var(--red);width:${pct}%"></div></div>
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;width:30px;text-align:right">${cnt}</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- ポジション別修正頻度 -->
    ${Object.keys(posCorrections).length ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">ポジション別修正頻度</div>
      ${Object.entries(posCorrections).sort((a,b) => b[1]-a[1]).map(([pos, cnt]) => {
        const maxCnt = Math.max(...Object.values(posCorrections));
        const pct = Math.round((cnt / maxCnt) * 100);
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border2)">
          <div style="font-size:12px;font-weight:600;width:180px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(pos)}</div>
          <div style="flex:1;height:8px;background:var(--surface3);border-radius:4px;overflow:hidden"><div style="height:100%;border-radius:4px;background:var(--accent);width:${pct}%"></div></div>
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;width:30px;text-align:right">${cnt}</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${!Object.keys(catCorrections).length && !Object.keys(posCorrections).length ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;text-align:center;color:var(--text3);font-size:12px">
      <div style="font-size:24px;margin-bottom:8px">📊</div>
      修正データがまだありません。<br>AI タグを修正すると、ここに精度データが表示されます。
    </div>` : ''}
  `;
}

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
          <div onclick="proposeRuleFromPattern('${_esc(p.key)}')" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600;white-space:nowrap">→ ルール化</div>
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

// ═══ D: ルール管理 ═══
function _renderRules() {
  const el = document.getElementById('admin-rules-content');
  if (!el) return;

  const rules = _getRules();
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">ルール一覧</div>
        <button onclick="toggleAddRuleForm()" style="background:var(--accent);color:#1c1c1e;border:none;padding:6px 14px;border-radius:16px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ ルール追加</button>
      </div>

      <!-- Add rule form (hidden by default) -->
      <div id="add-rule-form" style="display:none;background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">条件（タイトルに含む文字列）</div>
          <input id="rule-condition" type="text" placeholder="例: kimura, 木村" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
          <select id="rule-field" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
            <option value="cat">カテゴリ</option>
            <option value="pos">ポジション</option>
            <option value="tags">タグ</option>
            <option value="tb">トップ/ボトム</option>
          </select>
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>
          <select id="rule-action" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
            <option value="add">追加する</option>
            <option value="replace">置換する</option>
            <option value="remove">削除する</option>
          </select>
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>
          <input id="rule-value" type="text" placeholder="例: フィニッシュ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
          <button onclick="toggleAddRuleForm()" style="background:var(--surface);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
          <button onclick="saveNewRule()" style="background:var(--accent);color:#1c1c1e;border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">保存</button>
        </div>
      </div>

      ${!rules.length ? `
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">
          <div style="font-size:24px;margin-bottom:8px">📐</div>
          ルールがまだありません。<br>修正パターンから自動提案されるか、手動で追加できます。
        </div>
      ` : rules.map((r, i) => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">
          <div onclick="toggleRule(${i})" style="width:36px;height:20px;border-radius:10px;background:${r.enabled?'var(--green)':'var(--surface3)'};cursor:pointer;position:relative;flex-shrink:0;margin-top:2px;transition:background .2s">
            <div style="position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:${r.enabled?'18px':'2px'};transition:left .2s"></div>
          </div>
          <div style="flex:1">
            <div style="font-size:12px;line-height:1.5">タイトルに「<strong>${_esc(r.condition)}</strong>」→ ${r.field} を <strong>${_esc(r.action === 'add' ? '追加' : r.action === 'replace' ? '置換' : '削除')}</strong>: ${_esc(r.value)}</div>
            <div style="display:flex;gap:6px;margin-top:4px">
              <span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;background:${r.field==='cat'?'rgba(122,184,224,.15)':r.field==='pos'?'rgba(160,144,208,.15)':r.field==='tb'?'rgba(229,196,122,.15)':'rgba(107,196,144,.15)'};color:${r.field==='cat'?'var(--blue)':r.field==='pos'?'var(--purple)':r.field==='tb'?'var(--accent)':'var(--green)'}">${r.field}</span>
              ${r.proposed ? '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;background:rgba(229,196,122,.15);color:var(--accent)">提案</span>' : ''}
              ${r.source ? `<span style="font-size:10px;color:var(--text3)">${_esc(r.source)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button onclick="deleteRule(${i})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">削除</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

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
function _getRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch(e) { return []; }
}
function _saveRules(rules) {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch(e) {}
}

// ── Global actions ──
export function clearTagFeedback() {
  if (!confirm('修正履歴をすべて削除しますか？')) return;
  localStorage.removeItem(FEEDBACK_KEY);
  _renderCorrections();
  window.toast?.('修正履歴をクリアしました');
}
window.clearTagFeedback = clearTagFeedback;

export function toggleAddRuleForm() {
  const form = document.getElementById('add-rule-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
window.toggleAddRuleForm = toggleAddRuleForm;

export function saveNewRule() {
  const condition = document.getElementById('rule-condition')?.value.trim();
  const field = document.getElementById('rule-field')?.value;
  const action = document.getElementById('rule-action')?.value;
  const value = document.getElementById('rule-value')?.value.trim();
  if (!condition || !value) { window.toast?.('条件と値を入力してください'); return; }
  const rules = _getRules();
  rules.push({ condition, field, action, value, enabled: true, created: Date.now(), source: '手動' });
  _saveRules(rules);
  toggleAddRuleForm();
  _renderRules();
  window.toast?.('ルールを追加しました');
}
window.saveNewRule = saveNewRule;

export function toggleRule(idx) {
  const rules = _getRules();
  if (rules[idx]) { rules[idx].enabled = !rules[idx].enabled; _saveRules(rules); _renderRules(); }
}
window.toggleRule = toggleRule;

export function deleteRule(idx) {
  const rules = _getRules();
  rules.splice(idx, 1);
  _saveRules(rules);
  _renderRules();
  window.toast?.('ルールを削除しました');
}
window.deleteRule = deleteRule;

export function proposeRuleFromPattern(key) {
  // key format: "action:field:value"
  const [action, field, ...rest] = key.split(':');
  const value = rest.join(':');
  const rules = _getRules();
  rules.push({
    condition: '',
    field,
    action,
    value,
    enabled: false,
    proposed: true,
    created: Date.now(),
    source: 'パターン検出'
  });
  _saveRules(rules);
  switchAdminSub('rules');
  window.toast?.('ルール提案を追加しました（条件を設定してください）');
}
window.proposeRuleFromPattern = proposeRuleFromPattern;

// ═══════════════════════════════════════════
// Step 5: タグ辞書管理
// ═══════════════════════════════════════════

// Default tag dictionary (i18n: ja/en)
const DEFAULT_TAG_DICT = [
  { id:'t1',  names:{ja:'パスガード',en:'Guard Pass'}, aliases:{ja:['パスガ'],en:['passing']} },
  { id:'t2',  names:{ja:'フィニッシュ',en:'Submission'}, aliases:{ja:['極め','サブミッション'],en:['finish','sub']} },
  { id:'t3',  names:{ja:'スイープ',en:'Sweep'}, aliases:{ja:[],en:['reversal']} },
  { id:'t4',  names:{ja:'テイクダウン',en:'Takedown'}, aliases:{ja:['タックル'],en:['TD']} },
  { id:'t5',  names:{ja:'エスケープ・ディフェンス',en:'Escape / Defense'}, aliases:{ja:['エスケープ','ディフェンス'],en:['escape','defense']} },
  { id:'t6',  names:{ja:'バックテイク・バックアタック',en:'Back Take / Back Attack'}, aliases:{ja:['バックテイク'],en:['back take','back attack']} },
  { id:'t7',  names:{ja:'ガード構築・エントリー',en:'Guard Entry / Retention'}, aliases:{ja:['ガード構築'],en:['guard pull','guard entry']} },
  { id:'t8',  names:{ja:'ガードリテンション',en:'Guard Retention'}, aliases:{ja:['リテンション'],en:['retention']} },
  { id:'t9',  names:{ja:'コントロール／プレッシャー',en:'Control / Pressure'}, aliases:{ja:['コントロール','プレッシャー'],en:['control','pressure']} },
  { id:'t10', names:{ja:'コンセプト・原理',en:'Concept / Principle'}, aliases:{ja:['コンセプト','原理'],en:['concept','principle','theory']} },
];

function _getTagDict() {
  try {
    const stored = localStorage.getItem(TAGDICT_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_TAG_DICT];
  } catch(e) { return [...DEFAULT_TAG_DICT]; }
}
function _saveTagDict(dict) {
  try { localStorage.setItem(TAGDICT_KEY, JSON.stringify(dict)); } catch(e) {}
}

function _renderTagDict() {
  const el = document.getElementById('admin-tagdict-content');
  if (!el) return;

  const dict = _getTagDict();
  const videos = (window.videos || []).filter(v => !v.archived);
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Count usage of each tag in cat field
  const catCounts = {};
  videos.forEach(v => {
    (v.cat || []).forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; });
  });

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
        <span style="font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:var(--accent)">${dict.length}</span>
        <span style="font-size:11px;color:var(--text3)">タグ数</span>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 12px;gap:6px;flex:1;min-width:180px">
        <span>🔍</span>
        <input id="tagdict-search" type="text" placeholder="検索..." oninput="filterTagDict()" style="background:none;border:none;outline:none;color:var(--text);font-size:12px;flex:1;font-family:inherit">
      </div>
      <button onclick="showAddTagForm()" style="background:var(--accent);color:#1c1c1e;border:none;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">+ タグ追加</button>
    </div>

    <!-- Add tag form -->
    <div id="tagdict-add-form" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">日本語名</div>
          <input id="tagdict-new-ja" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1;min-width:120px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">English name</div>
          <input id="tagdict-new-en" type="text" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button onclick="hideAddTagForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
        <button onclick="addTagDictEntry()" style="background:var(--accent);color:#1c1c1e;border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
      </div>
    </div>

    <!-- Tag list -->
    <div id="tagdict-list" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:500px">
        <tr>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">名前</th>
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">エイリアス</th>
          <th style="text-align:right;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">使用数</th>
          <th style="padding:10px 8px;border-bottom:2px solid var(--border);width:60px"></th>
        </tr>
        ${dict.map((t, i) => {
          const cnt = catCounts[t.names.ja] || 0;
          return `
          <tr class="tagdict-row" data-search="${_esc((t.names.ja + ' ' + t.names.en + ' ' + (t.aliases?.ja||[]).join(' ') + ' ' + (t.aliases?.en||[]).join(' ')).toLowerCase())}">
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              <div style="font-weight:700;font-size:13px">${_esc(t.names.ja)}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">${_esc(t.names.en)}</div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              ${(t.aliases?.ja||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">JA</span>${_esc(a)}</span>`).join('')}
              ${(t.aliases?.en||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">EN</span>${_esc(a)}</span>`).join('')}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--text2)">${cnt}</td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right">
              <button onclick="deleteTagDictEntry(${i})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">削除</button>
            </td>
          </tr>`;
        }).join('')}
      </table>
    </div>
  `;
}

export function showAddTagForm() {
  const f = document.getElementById('tagdict-add-form');
  if (f) f.style.display = 'block';
}
window.showAddTagForm = showAddTagForm;

export function hideAddTagForm() {
  const f = document.getElementById('tagdict-add-form');
  if (f) f.style.display = 'none';
}
window.hideAddTagForm = hideAddTagForm;

export function addTagDictEntry() {
  const ja = document.getElementById('tagdict-new-ja')?.value.trim();
  const en = document.getElementById('tagdict-new-en')?.value.trim();
  if (!ja) { window.toast?.('日本語名を入力してください'); return; }
  const dict = _getTagDict();
  dict.push({ id: 't' + Date.now(), names: { ja, en: en || ja }, aliases: { ja: [], en: [] } });
  _saveTagDict(dict);
  hideAddTagForm();
  _renderTagDict();
  window.toast?.('タグを追加しました');
}
window.addTagDictEntry = addTagDictEntry;

export function deleteTagDictEntry(idx) {
  const dict = _getTagDict();
  dict.splice(idx, 1);
  _saveTagDict(dict);
  _renderTagDict();
  window.toast?.('タグを削除しました');
}
window.deleteTagDictEntry = deleteTagDictEntry;

export function filterTagDict() {
  const q = (document.getElementById('tagdict-search')?.value || '').toLowerCase();
  document.querySelectorAll('.tagdict-row').forEach(row => {
    row.style.display = !q || row.dataset.search.includes(q) ? '' : 'none';
  });
}
window.filterTagDict = filterTagDict;


// ═══════════════════════════════════════════
// Step 6: ポジション管理
// ═══════════════════════════════════════════

const DEFAULT_POSITIONS = [
  { id:'p1',  names:{ja:'クローズドガード',en:'Closed Guard'}, group:'guard', aliases:{ja:[],en:['full guard']} },
  { id:'p2',  names:{ja:'ハーフガード',en:'Half Guard'}, group:'guard', aliases:{ja:[],en:[]} },
  { id:'p3',  names:{ja:'ディープハーフ',en:'Deep Half Guard'}, group:'guard', aliases:{ja:[],en:['deep half']} },
  { id:'p4',  names:{ja:'バタフライガード',en:'Butterfly Guard'}, group:'guard', aliases:{ja:[],en:['butterfly']} },
  { id:'p5',  names:{ja:'デラヒーバ',en:'De La Riva'}, group:'guard', aliases:{ja:['DLR'],en:['DLR']} },
  { id:'p6',  names:{ja:'リバースデラヒーバ',en:'Reverse De La Riva'}, group:'guard', aliases:{ja:['RDLR'],en:['RDLR','reverse DLR']} },
  { id:'p7',  names:{ja:'スパイダーガード',en:'Spider Guard'}, group:'guard', aliases:{ja:[],en:['spider']} },
  { id:'p8',  names:{ja:'ラッソーガード',en:'Lasso Guard'}, group:'guard', aliases:{ja:[],en:['lasso']} },
  { id:'p9',  names:{ja:'Xガード',en:'X Guard'}, group:'guard', aliases:{ja:[],en:[]} },
  { id:'p10', names:{ja:'SLX',en:'Single Leg X'}, group:'guard', aliases:{ja:['シングルレッグX'],en:['SLX','single leg X']} },
  { id:'p11', names:{ja:'Kガード',en:'K Guard'}, group:'guard', aliases:{ja:[],en:[]} },
  { id:'p12', names:{ja:'ワームガード',en:'Worm Guard'}, group:'guard', aliases:{ja:[],en:['worm']} },
  { id:'p13', names:{ja:'ラペルガード',en:'Lapel Guard'}, group:'guard', aliases:{ja:[],en:['lapel']} },
  { id:'p14', names:{ja:'ニーシールド',en:'Knee Shield'}, group:'guard', aliases:{ja:[],en:['Z guard','knee shield']} },
  { id:'p15', names:{ja:'片襟片袖',en:'Collar Sleeve'}, group:'guard', aliases:{ja:[],en:['collar sleeve']} },
  { id:'p16', names:{ja:'インバーテッド',en:'Inverted'}, group:'guard', aliases:{ja:[],en:['inverted guard']} },
  { id:'p17', names:{ja:'50/50',en:'50/50'}, group:'leg', aliases:{ja:['フィフティフィフティ'],en:['fifty fifty']} },
  { id:'p18', names:{ja:'サドル',en:'Saddle / Inside Sankaku'}, group:'leg', aliases:{ja:['内三角','411'],en:['411','inside sankaku','honeyhole']} },
  { id:'p19', names:{ja:'タートル',en:'Turtle'}, group:'top', aliases:{ja:['亀'],en:[]} },
  { id:'p20', names:{ja:'スタンディング',en:'Standing'}, group:'stand', aliases:{ja:['立ち技'],en:['stand up']} },
  { id:'p21', names:{ja:'その他',en:'Other'}, group:'other', aliases:{ja:[],en:[]} },
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
      <button onclick="showAddPosForm()" style="background:var(--accent);color:#1c1c1e;border:none;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">+ 追加</button>
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
        <button onclick="addPosition()" style="background:var(--accent);color:#1c1c1e;border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>
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
          <th style="padding:10px 8px;border-bottom:2px solid var(--border);width:60px"></th>
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
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right">
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
  hideAddPosForm();
  _renderPositions();
  window.toast?.('ポジションを追加しました');
}
window.addPosition = addPosition;

export function deletePosition(idx) {
  const positions = _getPositions();
  positions.splice(idx, 1);
  _savePositions(positions);
  _renderPositions();
  window.toast?.('ポジションを削除しました');
}
window.deletePosition = deletePosition;

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
