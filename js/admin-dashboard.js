// ═══ WAZA KIMURA — AI管理ダッシュボード v50.12 ═══
// Admin-only: 精度・修正履歴・ルール管理

const FEEDBACK_KEY   = 'waza_tag_feedback';
const RULES_KEY      = 'waza_ai_rules';
const TAGDICT_KEY    = 'waza_tag_dict';
const POSITIONS_KEY  = 'waza_positions';
const PROPOSALS_KEY  = 'waza_rule_proposals';

const ALL_SUBS = ['accuracy','corrections','rules','categories','positions','feedback','review'];

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
  if (sub === 'categories')  _renderCategories();
  if (sub === 'positions')   _renderPositions();
  if (sub === 'feedback')    _renderFeedbackAdmin();
  if (sub === 'review')      _renderReview();
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
      if (Array.isArray(d.ai_rules)       && d.ai_rules.length)       localStorage.setItem(RULES_KEY,      JSON.stringify(d.ai_rules));
      if (Array.isArray(d.rule_proposals) && d.rule_proposals.length) localStorage.setItem(PROPOSALS_KEY,  JSON.stringify(d.rule_proposals));
      if (Array.isArray(d.positions)      && d.positions.length)      localStorage.setItem(POSITIONS_KEY,  JSON.stringify(d.positions));
      if (Array.isArray(d.tag_dict)       && d.tag_dict.length)       localStorage.setItem(TAGDICT_KEY,    JSON.stringify(d.tag_dict));
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

    <!-- TB診断 -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:12px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">🔬 TB カバレッジ診断</div>
      <div id="tb-analysis-result" style="font-size:12px;color:var(--text3);margin-bottom:10px">未実行 — ログイン後に「診断実行」を押してください</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="window._analyzeTbCoverage()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📊 診断実行</button>
        <button onclick="window._showUntaggedTb()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text3);padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📋 未設定リスト</button>
        <button onclick="window._previewTbConflicts()" style="background:var(--surface2);border:1px solid var(--border);color:var(--red);padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">⚠ 競合プレビュー</button>
        <button onclick="window._fixTbConflicts()" style="background:var(--red);color:#fff;border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">🔧 競合修正</button>
      </div>
      <div id="tb-untagged-list" style="margin-top:10px;max-height:300px;overflow-y:auto;font-size:11px;font-family:'DM Mono',monospace;color:var(--text2);line-height:1.8;display:none"></div>
    </div>
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

  // 3種類に分類: グラウンドルール / ビルトイン / ユーザー定義
  const groundItems  = rules.map((r, i) => ({r, i})).filter(({r}) => r.source === 'グラウンドルール');
  const builtinItems = rules.map((r, i) => ({r, i})).filter(({r}) => r.source === 'ビルトイン');
  const userItems    = rules.map((r, i) => ({r, i})).filter(({r}) => r.source !== 'ビルトイン' && r.source !== 'グラウンドルール');

  const _fieldBadge = r => `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;
    background:${r.field==='cat'?'rgba(122,184,224,.15)':r.field==='pos'?'rgba(160,144,208,.15)':r.field==='tb'?'rgba(229,196,122,.15)':'rgba(107,196,144,.15)'};
    color:${r.field==='cat'?'var(--blue)':r.field==='pos'?'var(--purple)':r.field==='tb'?'var(--accent)':'var(--green)'}">${r.field}</span>`;

  // ビルトイン・ユーザー定義行（ルールタイプ対応）
  const _ruleRow = ({r, i}, isBuiltin) => {
    const t = r.type || 'keyword';
    const _al = a => a === 'add' ? '追加' : a === 'replace' ? '置換' : '削除';
    let descLine = '';
    if (t === 'keyword') {
      descLine = `タイトルに「<strong>${_esc(r.condition)}</strong>」→ ${r.field} を <strong>${_esc(_al(r.action))}</strong>: <strong style="color:var(--accent)">${_esc(r.value)}</strong>`;
    } else if (t === 'and') {
      descLine = `「<strong>${_esc(r.condition_a)}</strong>」かつ「<strong>${_esc(r.condition_b)}</strong>」→ ${r.field} を <strong>${_esc(_al(r.action))}</strong>: <strong style="color:var(--accent)">${_esc(r.value)}</strong>`;
    } else if (t === 'not') {
      descLine = `「<strong>${_esc(r.condition)}</strong>」あり「<strong>${_esc(r.not_condition)}</strong>」なし → ${r.field} を <strong>${_esc(_al(r.action))}</strong>: <strong style="color:var(--accent)">${_esc(r.value)}</strong>`;
    } else if (t === 'conflict') {
      descLine = `${r.field}「<strong style="color:var(--red)">${_esc(r.if_value)}</strong>」があるとき「<strong>${_esc(r.then_remove)}</strong>」を削除（競合解決）`;
    } else if (t === 'pos_implies') {
      descLine = `${r.if_field}「<strong>${_esc(r.if_value)}</strong>」→ ${r.then_field} を「<strong style="color:var(--accent)">${_esc(r.then_value)}</strong>」に設定`;
    } else if (t === 'default') {
      descLine = `${r.field} が未設定なら「<strong style="color:var(--accent)">${_esc(r.value)}</strong>」をデフォルト設定`;
    }
    const TYPE_BADGES = {
      keyword:    '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(229,196,122,.12);color:var(--accent)">キーワード</span>',
      and:        '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(64,160,112,.15);color:#40a070">AND</span>',
      not:        '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(224,96,96,.15);color:var(--red)">NOT</span>',
      conflict:   '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(200,80,200,.15);color:#c850c8">競合</span>',
      pos_implies:'<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(80,120,220,.15);color:#5078dc">継承</span>',
      default:    '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(160,160,160,.15);color:var(--text3)">デフォルト</span>',
    };
    const df = r.field || r.if_field || r.then_field || '—';
    const fieldBadge = `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;background:${df==='cat'?'rgba(122,184,224,.15)':df==='pos'?'rgba(160,144,208,.15)':df==='tb'?'rgba(229,196,122,.15)':'rgba(107,196,144,.15)'};color:${df==='cat'?'var(--blue)':df==='pos'?'var(--purple)':df==='tb'?'var(--accent)':'var(--green)'}">${df}</span>`;
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border2)">
      <div onclick="toggleRule(${i})" title="${r.enabled ? '無効化' : '有効化'}"
           style="width:36px;height:20px;border-radius:10px;background:${r.enabled?'var(--green)':'var(--surface3)'};cursor:pointer;position:relative;flex-shrink:0;margin-top:2px;transition:background .2s">
        <div style="position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:${r.enabled?'18px':'2px'};transition:left .2s"></div>
      </div>
      <div style="flex:1">
        <div style="font-size:12px;line-height:1.5">${descLine}</div>
        ${r.desc ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${_esc(r.desc)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;align-items:center">
          ${fieldBadge}
          ${TYPE_BADGES[t] || ''}
          ${r.source === 'グラウンドルール' ? '<span style="font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700;background:rgba(229,196,122,.2);color:var(--accent)">⭐ 大前提</span>' : ''}
          ${isBuiltin ? '<span style="font-size:10px;padding:2px 7px;border-radius:8px;font-weight:700;background:rgba(100,100,220,.12);color:#6464cc">🔧 ビルトイン</span>' : ''}
          ${r.proposed ? '<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;background:rgba(229,196,122,.15);color:var(--accent)">提案</span>' : ''}
          ${r.source && !isBuiltin && r.source !== 'グラウンドルール' ? `<span style="font-size:10px;color:var(--text3)">${_esc(r.source)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${r.source !== 'グラウンドルール' ? `<button onclick="promoteToGround(${i})" title="グラウンドルールに昇格" style="background:rgba(229,196,122,.15);border:1px solid var(--accent);color:var(--accent);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit;white-space:nowrap">⭐ 大前提へ</button>` : ''}
        ${!isBuiltin ? `<button onclick="editRule(${i})" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">編集</button>` : ''}
        ${!isBuiltin ? `<button onclick="deleteRule(${i})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">削除</button>` : ''}
      </div>
    </div>
  `;
  };

  el.innerHTML = `
    <!-- ⭐ グラウンドルール -->
    <div style="background:var(--surface);border:2px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${groundItems.length ? '10px' : '0'}">
        <div>
          <span style="font-size:13px;font-weight:700;color:var(--accent)">⭐ グラウンドルール</span>
          <span style="font-size:11px;color:var(--text3);margin-left:8px">— 他の全ルールより上位の大前提</span>
        </div>
        <button onclick="addGroundRule()" style="background:var(--accent);color:var(--on-accent);border:none;padding:5px 14px;border-radius:16px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ 追加</button>
      </div>
      ${groundItems.length ? groundItems.map(item => _ruleRow(item, false)).join('') : `
        <div style="margin-top:10px;padding:16px;text-align:center;color:var(--text3);font-size:12px;border-top:1px solid var(--border)">
          グラウンドルールはまだありません
        </div>
      `}
    </div>

    <!-- ルール一覧 -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">ルール一覧</div>
        <button onclick="toggleAddRuleForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:6px 14px;border-radius:16px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ ルール追加</button>
      </div>

      <!-- Add rule form (hidden by default) -->
      <div id="add-rule-form" style="display:none;background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">
        <div id="add-rule-mode-label" style="display:none;font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px;padding:4px 8px;background:rgba(229,196,122,.12);border-radius:6px">⭐ グラウンドルールとして追加</div>
        <!-- タイプ選択 -->
        <div style="margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">ルールタイプ</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button onclick="setRuleType('keyword')"     id="rt-keyword"     style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--accent);color:var(--on-accent);border:1px solid var(--accent)">キーワード</button>
            <button onclick="setRuleType('and')"         id="rt-and"         style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">AND条件</button>
            <button onclick="setRuleType('not')"         id="rt-not"         style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">NOT条件</button>
            <button onclick="setRuleType('conflict')"    id="rt-conflict"    style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">競合解決</button>
            <button onclick="setRuleType('pos_implies')" id="rt-pos_implies" style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">継承</button>
            <button onclick="setRuleType('default')"     id="rt-default"     style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">デフォルト</button>
          </div>
        </div>
        <!-- キーワード -->
        <div id="rfields-keyword">
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワード（タイトルに含む）</div>
            <input id="rule-condition" type="text" placeholder="例: kimura, 木村" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
              <select id="rule-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>
              <select id="rule-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="add">追加</option><option value="replace">置換</option><option value="remove">削除</option></select></div>
          </div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>
            <input id="rule-value" type="text" placeholder="例: フィニッシュ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
        </div>
        <!-- AND条件 -->
        <div id="rfields-and" style="display:none">
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワードA（必須）</div>
            <input id="rule-cond-a" type="text" placeholder="例: guard" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワードB（必須）</div>
            <input id="rule-cond-b" type="text" placeholder="例: sweep" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
              <select id="rule-and-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>
              <select id="rule-and-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="add">追加</option><option value="replace">置換</option><option value="remove">削除</option></select></div>
          </div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>
            <input id="rule-and-value" type="text" placeholder="例: スイープ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
        </div>
        <!-- NOT条件 -->
        <div id="rfields-not" style="display:none">
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワード（含む）</div>
            <input id="rule-not-cond" type="text" placeholder="例: guard" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">NOT キーワード（含まない）</div>
            <input id="rule-not-excl" type="text" placeholder="例: pass" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
              <select id="rule-not-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>
              <select id="rule-not-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="add">追加</option><option value="remove">削除</option></select></div>
          </div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>
            <input id="rule-not-value" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
        </div>
        <!-- 競合解決 -->
        <div id="rfields-conflict" style="display:none">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(200,80,200,.08);border-radius:6px">同一フィールドで共存できない値の競合を解決します（例: トップとボトムは同時に存在できない）</div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
            <select id="rule-cf-field" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
              <option value="tb">TB</option><option value="cat">カテゴリ</option><option value="pos">ポジション</option></select></div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">この値がある場合</div>
            <input id="rule-cf-ifval" type="text" placeholder="例: トップ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">この値を削除する</div>
            <input id="rule-cf-remove" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
        </div>
        <!-- 継承 (pos_implies) -->
        <div id="rfields-pos_implies" style="display:none">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(80,120,220,.08);border-radius:6px">あるフィールドの値が確定したとき、別のフィールドを自動設定します（例: ポジション → TB継承）</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">条件フィールド</div>
              <select id="rule-pi-iffield" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="pos">ポジション</option><option value="cat">カテゴリ</option><option value="tb">TB</option></select></div>
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">条件値</div>
              <input id="rule-pi-ifval" type="text" placeholder="例: スパイダーガード" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">設定フィールド</div>
              <select id="rule-pi-thenfield" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
                <option value="tb">TB</option><option value="pos">ポジション</option><option value="cat">カテゴリ</option></select></div>
            <div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">設定値</div>
              <input id="rule-pi-thenval" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
          </div>
        </div>
        <!-- デフォルト値 -->
        <div id="rfields-default" style="display:none">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(160,160,160,.08);border-radius:6px">全ルール適用後もフィールドが空なら、この値をデフォルトとして設定します</div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>
            <select id="rule-df-field" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">
              <option value="tb">TB</option><option value="cat">カテゴリ</option><option value="pos">ポジション</option></select></div>
          <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">デフォルト値</div>
            <input id="rule-df-value" type="text" placeholder="例: スタンディング" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
          <button onclick="toggleAddRuleForm()" style="background:var(--surface);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>
          <button onclick="saveNewRule()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">保存</button>
        </div>
      </div>

      ${builtinItems.length ? `
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 8px">
          <span style="font-size:11px;font-weight:700;color:#6464cc;letter-spacing:.03em">🔧 組み込みルール</span>
          <span style="font-size:10px;color:var(--text3)">${builtinItems.length}件 — ウィザード起動時に自動追加。トグルで個別に無効化できます。</span>
        </div>
        ${builtinItems.map(item => _ruleRow(item, true)).join('')}
      ` : ''}

      ${userItems.length ? `
        <div style="display:flex;align-items:center;gap:8px;margin:${builtinItems.length ? '14px' : '4px'} 0 8px">
          <span style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:.03em">📝 ユーザー定義ルール</span>
          <span style="font-size:10px;color:var(--text3)">${userItems.length}件</span>
        </div>
        ${userItems.map(item => _ruleRow(item, false)).join('')}
      ` : (!builtinItems.length ? `
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">
          <div style="font-size:24px;margin-bottom:8px">📐</div>
          ルールがまだありません。<br>タグ付けウィザードを一度開くと組み込みルールが追加されます。
        </div>
      ` : '')}
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
  _pushToFirestore('ai_rules', rules);
}

// ── Global actions ──
export function clearTagFeedback() {
  if (!confirm('修正履歴をすべて削除しますか？')) return;
  localStorage.removeItem(FEEDBACK_KEY);
  _renderCorrections();
  window.toast?.('修正履歴をクリアしました');
}
window.clearTagFeedback = clearTagFeedback;

export function setRuleType(type) {
  const types = ['keyword', 'and', 'not', 'conflict', 'pos_implies', 'default'];
  const form = document.getElementById('add-rule-form');
  if (form) form.dataset.ruleType = type;
  types.forEach(t => {
    const fields = document.getElementById('rfields-' + t);
    const btn    = document.getElementById('rt-' + t);
    if (fields) fields.style.display = t === type ? '' : 'none';
    if (btn) {
      btn.style.background   = t === type ? 'var(--accent)' : 'var(--surface)';
      btn.style.color        = t === type ? 'var(--on-accent)' : 'var(--text2)';
      btn.style.borderColor  = t === type ? 'var(--accent)' : 'var(--border)';
    }
  });
}
window.setRuleType = setRuleType;

export function toggleAddRuleForm() {
  const form = document.getElementById('add-rule-form');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) {
    setRuleType('keyword');
  } else {
    delete form.dataset.source;
    delete form.dataset.ruleType;
    const lbl = document.getElementById('add-rule-mode-label');
    if (lbl) lbl.style.display = 'none';
  }
}
window.toggleAddRuleForm = toggleAddRuleForm;

export function addGroundRule() {
  const form = document.getElementById('add-rule-form');
  if (!form) return;
  form.style.display = 'block';
  form.dataset.source = 'グラウンドルール';
  const lbl = document.getElementById('add-rule-mode-label');
  if (lbl) lbl.style.display = 'block';
  setRuleType('keyword');
  document.getElementById('rule-condition')?.focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.addGroundRule = addGroundRule;

export function promoteToGround(idx) {
  const rules = _getRules();
  if (!rules[idx]) return;
  rules[idx].source = 'グラウンドルール';
  _saveRules(rules);
  _renderRules();
  window.toast?.('⭐ グラウンドルールに移動しました');
}
window.promoteToGround = promoteToGround;

export function saveNewRule() {
  const form       = document.getElementById('add-rule-form');
  const editIdxStr = form?.dataset?.editIdx;
  const editIdx    = editIdxStr !== undefined ? parseInt(editIdxStr) : NaN;
  const ruleType   = form?.dataset?.ruleType || 'keyword';

  let data = null;
  const _v = id => document.getElementById(id)?.value.trim() || '';
  const _s = id => document.getElementById(id)?.value || '';

  if (ruleType === 'keyword') {
    const condition = _v('rule-condition'), field = _s('rule-field'), action = _s('rule-action'), value = _v('rule-value');
    if (!condition || !value) { window.toast?.('条件と値を入力してください'); return; }
    data = { type: 'keyword', condition, field, action, value };
  } else if (ruleType === 'and') {
    const condition_a = _v('rule-cond-a'), condition_b = _v('rule-cond-b'), field = _s('rule-and-field'), action = _s('rule-and-action'), value = _v('rule-and-value');
    if (!condition_a || !condition_b || !value) { window.toast?.('キーワードA・B・値を入力してください'); return; }
    data = { type: 'and', condition_a, condition_b, field, action, value };
  } else if (ruleType === 'not') {
    const condition = _v('rule-not-cond'), not_condition = _v('rule-not-excl'), field = _s('rule-not-field'), action = _s('rule-not-action'), value = _v('rule-not-value');
    if (!condition || !not_condition || !value) { window.toast?.('キーワード・NOTキーワード・値を入力してください'); return; }
    data = { type: 'not', condition, not_condition, field, action, value };
  } else if (ruleType === 'conflict') {
    const field = _s('rule-cf-field'), if_value = _v('rule-cf-ifval'), then_remove = _v('rule-cf-remove');
    if (!if_value || !then_remove) { window.toast?.('競合する値を両方入力してください'); return; }
    data = { type: 'conflict', field, if_value, then_remove };
  } else if (ruleType === 'pos_implies') {
    const if_field = _s('rule-pi-iffield'), if_value = _v('rule-pi-ifval'), then_field = _s('rule-pi-thenfield'), then_value = _v('rule-pi-thenval');
    if (!if_value || !then_value) { window.toast?.('条件値と設定値を入力してください'); return; }
    data = { type: 'pos_implies', if_field, if_value, then_field, then_value };
  } else if (ruleType === 'default') {
    const field = _s('rule-df-field'), value = _v('rule-df-value');
    if (!value) { window.toast?.('デフォルト値を入力してください'); return; }
    data = { type: 'default', field, value };
  }
  if (!data) return;

  const rules = _getRules();
  if (!isNaN(editIdx) && editIdx >= 0 && editIdx < rules.length) {
    rules[editIdx] = { ...rules[editIdx], ...data };
    if (form) delete form.dataset.editIdx;
  } else {
    const source = form?.dataset?.source || '手動';
    rules.push({ ...data, enabled: true, created: Date.now(), source });
  }
  _saveRules(rules);
  toggleAddRuleForm();
  _renderRules();
  window.toast?.(!isNaN(editIdx) && editIdx >= 0 ? 'ルールを更新しました' : 'ルールを追加しました');
}
window.saveNewRule = saveNewRule;

export function editRule(idx) {
  const rules = _getRules();
  const r = rules[idx];
  if (!r) return;
  const form = document.getElementById('add-rule-form');
  if (form) { form.style.display = 'block'; form.dataset.editIdx = idx; }
  const t = r.type || 'keyword';
  setRuleType(t);
  const _set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  if (t === 'keyword') {
    _set('rule-condition', r.condition); _set('rule-field', r.field || 'tb'); _set('rule-action', r.action || 'add'); _set('rule-value', r.value);
  } else if (t === 'and') {
    _set('rule-cond-a', r.condition_a); _set('rule-cond-b', r.condition_b); _set('rule-and-field', r.field || 'tb'); _set('rule-and-action', r.action || 'add'); _set('rule-and-value', r.value);
  } else if (t === 'not') {
    _set('rule-not-cond', r.condition); _set('rule-not-excl', r.not_condition); _set('rule-not-field', r.field || 'tb'); _set('rule-not-action', r.action || 'add'); _set('rule-not-value', r.value);
  } else if (t === 'conflict') {
    _set('rule-cf-field', r.field || 'tb'); _set('rule-cf-ifval', r.if_value); _set('rule-cf-remove', r.then_remove);
  } else if (t === 'pos_implies') {
    _set('rule-pi-iffield', r.if_field || 'pos'); _set('rule-pi-ifval', r.if_value); _set('rule-pi-thenfield', r.then_field || 'tb'); _set('rule-pi-thenval', r.then_value);
  } else if (t === 'default') {
    _set('rule-df-field', r.field || 'tb'); _set('rule-df-value', r.value);
  }
  form?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.editRule = editRule;

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
          <th style="text-align:left;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">エイリアス</th>
          <th style="text-align:right;padding:10px 8px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">使用数</th>
          <th style="padding:10px 8px;border-bottom:2px solid var(--border)"></th>
        </tr>
        ${dict.map((t, i) => {
          const cnt = catCounts[t.names.ja] || 0;
          return `
          <tr class="categories-row" data-search="${_esc((t.names.ja + ' ' + t.names.en + ' ' + (t.aliases?.ja||[]).join(' ') + ' ' + (t.aliases?.en||[]).join(' ')).toLowerCase())}">
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              <div style="font-weight:700;font-size:13px">${_esc(t.names.ja)}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:2px">${_esc(t.names.en)}</div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);vertical-align:top">
              ${(t.aliases?.ja||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">JA</span>${_esc(a)}</span>`).join('')}
              ${(t.aliases?.en||[]).map(a => `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;background:var(--surface2);color:var(--text2);margin:1px 2px;border:1px solid var(--border2)"><span style="font-size:9px;font-weight:700;color:var(--text3);margin-right:2px">EN</span>${_esc(a)}</span>`).join('')}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;font-family:'DM Mono',monospace;font-weight:600;color:var(--text2)">${cnt}</td>
            <td style="padding:10px 8px;border-bottom:1px solid var(--border2);text-align:right;white-space:nowrap">
              <button onclick="editCategoryEntry(${i})" style="background:none;border:1px solid var(--border);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit;margin-right:4px">編集</button>
              <button onclick="deleteCategoryEntry(${i})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:11px;padding:4px 10px;border-radius:14px;cursor:pointer;font-family:inherit">削除</button>
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

async function _renderFeedbackAdmin() {
  const el = document.getElementById('admin-p-feedback');
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

window.reloadFeedbackAdmin = () => _renderFeedbackAdmin();

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

// ═══════════════════════════════════════════════════════════════
// ルール審査テーブル — 「📋 審査」タブ
// HaikuのBJJタグ付け暗黙ルールをすべて明文化し、ユーザーが承認/却下
// ═══════════════════════════════════════════════════════════════

const _INITIAL_PROPOSALS = [
  // ── TB: トップシグナル ──
  { id:'_ip_tb01', field:'tb', condition:'pass',       value:'トップ', action:'add', rationale:'ガードを越える（pass）= 必ずトップ視点。パスガード側が対象' },
  { id:'_ip_tb02', field:'tb', condition:'passing',    value:'トップ', action:'add', rationale:'passの進行形。パスガード動作全般を指す英語表現' },
  { id:'_ip_tb03', field:'tb', condition:'パスガード',  value:'トップ', action:'add', rationale:'日本語で「パスガード」= ガードを通過する側 = トップ確定' },
  { id:'_ip_tb04', field:'tb', condition:'攻略',        value:'トップ', action:'add', rationale:'「〇〇ガード攻略」はトップ目線で相手ガードを崩す文脈' },
  { id:'_ip_tb05', field:'tb', condition:'突破',        value:'トップ', action:'add', rationale:'ガードを突破する = トップが相手ガードを越えていく動作' },
  { id:'_ip_tb06', field:'tb', condition:'dominate',   value:'トップ', action:'add', rationale:'相手を支配する = トップポジションの概念' },
  { id:'_ip_tb07', field:'tb', condition:'beat',       value:'トップ', action:'add', rationale:'「〇〇ガードを倒す/beat」= トップ側が相手ガードに勝つ表現' },
  { id:'_ip_tb08', field:'tb', condition:'制圧',        value:'トップ', action:'add', rationale:'トップから相手を押さえ込む・制圧する文脈' },
  { id:'_ip_tb09', field:'tb', condition:'崩し',        value:'トップ', action:'add', rationale:'ガードの崩し = トップがボトムの態勢を崩す動作' },
  { id:'_ip_tb10', field:'tb', condition:'対策',        value:'トップ', action:'add', rationale:'「〇〇ガード対策」= トップ側がボトムのガードに対応する視点' },
  { id:'_ip_tb11', field:'tb', condition:'pressure',   value:'トップ', action:'add', rationale:'プレッシャーをかけるのはトップ側の技術。ボトムは受ける側' },
  { id:'_ip_tb12', field:'tb', condition:'プレッシャー',value:'トップ', action:'add', rationale:'「プレッシャーパス」などトップ視点の技術用語' },
  { id:'_ip_tb13', field:'tb', condition:'mount',      value:'トップ', action:'add', rationale:'マウントは定義上トップポジション（相手の上に乗る）' },
  { id:'_ip_tb14', field:'tb', condition:'マウント',    value:'トップ', action:'add', rationale:'日本語マウントも同様。マウントを取る/維持する = トップ' },
  // ── TB: ボトムシグナル ──
  { id:'_ip_tb20', field:'tb', condition:'playing',    value:'ボトム', action:'add', rationale:'「playing guard」= ガードプレイヤー = ボトム側' },
  { id:'_ip_tb21', field:'tb', condition:'using',      value:'ボトム', action:'add', rationale:'「using guard」= ガードを使う = ボトム側が自分のガードを活用' },
  { id:'_ip_tb22', field:'tb', condition:'ガードから',  value:'ボトム', action:'add', rationale:'「ガードから〇〇する」= ボトムポジションからのアクション' },
  { id:'_ip_tb23', field:'tb', condition:'ガード構築',  value:'ボトム', action:'add', rationale:'ガードを作る = ボトム側の行動' },
  { id:'_ip_tb24', field:'tb', condition:'ガードプレイ',value:'ボトム', action:'add', rationale:'ガードプレイ = ボトム側の技術体系' },
  { id:'_ip_tb25', field:'tb', condition:'引き込み',    value:'ボトム', action:'add', rationale:'引き込み = 自分からボトムポジションを選択する' },
  { id:'_ip_tb26', field:'tb', condition:'retention',  value:'ボトム', action:'add', rationale:'guard retention = ボトム側がガードを維持する技術' },
  { id:'_ip_tb27', field:'tb', condition:'リテンション',value:'ボトム', action:'add', rationale:'日本語「リテンション」= ガードリテンション = ボトム側' },
  { id:'_ip_tb28', field:'tb', condition:'guard game', value:'ボトム', action:'add', rationale:'ガードゲーム全体 = ボトム側の戦略' },
  { id:'_ip_tb29', field:'tb', condition:'sweep',      value:'ボトム', action:'add', rationale:'スイープはボトムが行う動作（catでもスイープを付ける）' },
  { id:'_ip_tb30', field:'tb', condition:'スイープ',    value:'ボトム', action:'add', rationale:'日本語スイープも同様にボトム視点の動作' },
  // ── TB: スタンディング ──
  { id:'_ip_tb40', field:'tb', condition:'takedown',   value:'スタンディング', action:'add', rationale:'テイクダウン = 立ち技の文脈。トップ/ボトムはテイクダウン後に決まる' },
  { id:'_ip_tb41', field:'tb', condition:'テイクダウン',value:'スタンディング', action:'add', rationale:'日本語テイクダウン。立ちのシチュエーション' },
  { id:'_ip_tb42', field:'tb', condition:'wrestling',  value:'スタンディング', action:'add', rationale:'レスリング技術 = スタンディング／組み手の文脈' },
  { id:'_ip_tb43', field:'tb', condition:'レスリング',  value:'スタンディング', action:'add', rationale:'日本語レスリングも同様の立ち技文脈' },
  { id:'_ip_tb44', field:'tb', condition:'standup',    value:'スタンディング', action:'add', rationale:'standup = 立ちのポジションに戻る/立ち技全般' },
  // ── pos: ガードポジション ──
  { id:'_ip_ps01', field:'pos', condition:'spider',     value:'スパイダーガード',  action:'add', rationale:'spider guard の英語キーワード' },
  { id:'_ip_ps02', field:'pos', condition:'de la riva', value:'デラヒーバ',        action:'add', rationale:'de la riva guard の英語キーワード（スペース含む）' },
  { id:'_ip_ps03', field:'pos', condition:'dlr',        value:'デラヒーバ',        action:'add', rationale:'De La Riva の略称 DLR（大文字・小文字両対応）' },
  { id:'_ip_ps04', field:'pos', condition:'butterfly',  value:'バタフライガード',  action:'add', rationale:'butterfly guard の英語キーワード' },
  { id:'_ip_ps05', field:'pos', condition:'バタフライ',  value:'バタフライガード',  action:'add', rationale:'日本語バタフライ（バタフライガード/バタフライフック）' },
  { id:'_ip_ps06', field:'pos', condition:'half guard', value:'ハーフガード',      action:'add', rationale:'half guard の英語キーワード（スペース含む）' },
  { id:'_ip_ps07', field:'pos', condition:'ハーフガード',value:'ハーフガード',      action:'add', rationale:'日本語ハーフガード' },
  { id:'_ip_ps08', field:'pos', condition:'closed guard',value:'クローズドガード', action:'add', rationale:'closed guard の英語キーワード' },
  { id:'_ip_ps09', field:'pos', condition:'クローズドガード',value:'クローズドガード', action:'add', rationale:'日本語クローズドガード' },
  { id:'_ip_ps10', field:'pos', condition:'x guard',    value:'Xガード',           action:'add', rationale:'x guard の英語キーワード' },
  { id:'_ip_ps11', field:'pos', condition:'lasso',      value:'ラッソーガード',    action:'add', rationale:'lasso guard の英語キーワード' },
  { id:'_ip_ps12', field:'pos', condition:'rdlr',       value:'リバースデラヒーバ',action:'add', rationale:'Reverse De La Riva の略称 RDLR' },
  { id:'_ip_ps13', field:'pos', condition:'deep half',  value:'ディープハーフ',    action:'add', rationale:'deep half guard の英語キーワード' },
  { id:'_ip_ps14', field:'pos', condition:'saddle',     value:'サドル',            action:'add', rationale:'saddle（inside sankaku）の英語キーワード' },
  { id:'_ip_ps15', field:'pos', condition:'worm guard', value:'ラペルガード',      action:'add', rationale:'worm guard = ラペルを使ったガード系の総称' },
  { id:'_ip_ps16', field:'pos', condition:'turtle',     value:'タートル',          action:'add', rationale:'turtle position の英語キーワード' },
  { id:'_ip_ps17', field:'pos', condition:'タートル',    value:'タートル',          action:'add', rationale:'日本語タートル（亀）' },
  { id:'_ip_ps18', field:'pos', condition:'50/50',      value:'50/50',             action:'add', rationale:'50/50ガードは足関節のシチュエーション' },
  // ── cat: カテゴリ ──
  { id:'_ip_ct01', field:'cat', condition:'sweep',      value:'スイープ',                  action:'add', rationale:'sweep 技術 = カテゴリ「スイープ」' },
  { id:'_ip_ct02', field:'cat', condition:'スイープ',    value:'スイープ',                  action:'add', rationale:'日本語スイープ = カテゴリ「スイープ」' },
  { id:'_ip_ct03', field:'cat', condition:'submission', value:'フィニッシュ',               action:'add', rationale:'submission = サブミッション = フィニッシュカテゴリ' },
  { id:'_ip_ct04', field:'cat', condition:'finish',     value:'フィニッシュ',               action:'add', rationale:'finish の英語キーワード = フィニッシュカテゴリ' },
  { id:'_ip_ct05', field:'cat', condition:'フィニッシュ',value:'フィニッシュ',               action:'add', rationale:'日本語フィニッシュ = フィニッシュカテゴリ' },
  { id:'_ip_ct06', field:'cat', condition:'escape',     value:'エスケープ・ディフェンス',    action:'add', rationale:'escape 技術 = エスケープ・ディフェンスカテゴリ' },
  { id:'_ip_ct07', field:'cat', condition:'defense',    value:'エスケープ・ディフェンス',    action:'add', rationale:'defense 技術 = エスケープ・ディフェンスカテゴリ' },
  { id:'_ip_ct08', field:'cat', condition:'back take',  value:'バックテイク・バックアタック', action:'add', rationale:'back take = バックテイク・バックアタックカテゴリ' },
  { id:'_ip_ct09', field:'cat', condition:'バックテイク',value:'バックテイク・バックアタック', action:'add', rationale:'日本語バックテイク = バックテイク・バックアタックカテゴリ' },
  { id:'_ip_ct10', field:'cat', condition:'retention',  value:'ガードリテンション',          action:'add', rationale:'guard retention = ガードリテンションカテゴリ' },
  { id:'_ip_ct11', field:'cat', condition:'リテンション',value:'ガードリテンション',          action:'add', rationale:'日本語リテンション = ガードリテンションカテゴリ' },
  { id:'_ip_ct12', field:'cat', condition:'control',    value:'コントロール／プレッシャー',   action:'add', rationale:'control = コントロール／プレッシャーカテゴリ' },
  { id:'_ip_ct13', field:'cat', condition:'concept',    value:'コンセプト・原理',            action:'add', rationale:'concept/principle = コンセプト・原理カテゴリ' },
  { id:'_ip_ct14', field:'cat', condition:'コンセプト',  value:'コンセプト・原理',            action:'add', rationale:'日本語コンセプト = コンセプト・原理カテゴリ' },
  { id:'_ip_ct15', field:'cat', condition:'原理',        value:'コンセプト・原理',            action:'add', rationale:'日本語原理 = コンセプト・原理カテゴリ' },
  { id:'_ip_ct16', field:'cat', condition:'guard pull',  value:'ガード構築・エントリー',      action:'add', rationale:'guard pull = ガードへの引き込み・エントリーカテゴリ' },
  { id:'_ip_ct17', field:'cat', condition:'ガード引き込み',value:'ガード構築・エントリー',    action:'add', rationale:'日本語ガード引き込み = ガード構築・エントリーカテゴリ' },

  // ── TB追加: トップ（パスガード技術名）──
  { id:'_ip_tt01', field:'tb', condition:'guard pass',    value:'トップ', action:'add', rationale:'guard pass（2語）= ガードを越える = トップ' },
  { id:'_ip_tt02', field:'tb', condition:'torreando',     value:'トップ', action:'add', rationale:'トレアンドパス = トップのパスガード技術' },
  { id:'_ip_tt03', field:'tb', condition:'トレアンド',     value:'トップ', action:'add', rationale:'日本語トレアンド = トレアンドパス = トップ' },
  { id:'_ip_tt04', field:'tb', condition:'knee slice',    value:'トップ', action:'add', rationale:'ニースライスパス = トップのパスガード技術' },
  { id:'_ip_tt05', field:'tb', condition:'ニースライス',   value:'トップ', action:'add', rationale:'日本語ニースライス = トップのパスガード技術' },
  { id:'_ip_tt06', field:'tb', condition:'leg drag',      value:'トップ', action:'add', rationale:'レッグドラッグ = トップが足を引っ張ってパスする技術' },
  { id:'_ip_tt07', field:'tb', condition:'レッグドラッグ', value:'トップ', action:'add', rationale:'日本語レッグドラッグ = トップのパスガード技術' },
  { id:'_ip_tt08', field:'tb', condition:'over under',    value:'トップ', action:'add', rationale:'オーバーアンダーパス = トップのパスガード技術' },
  { id:'_ip_tt09', field:'tb', condition:'オーバーアンダー',value:'トップ', action:'add', rationale:'日本語オーバーアンダー = トップのパスガード技術' },
  { id:'_ip_tt10', field:'tb', condition:'double under',  value:'トップ', action:'add', rationale:'ダブルアンダーパス = トップのパスガード技術' },
  { id:'_ip_tt11', field:'tb', condition:'ダブルアンダー', value:'トップ', action:'add', rationale:'日本語ダブルアンダー = トップのパスガード技術' },
  { id:'_ip_tt12', field:'tb', condition:'stack',         value:'トップ', action:'add', rationale:'スタックパス = 相手を折り畳んでパスする = トップ' },
  { id:'_ip_tt13', field:'tb', condition:'スタック',       value:'トップ', action:'add', rationale:'日本語スタック = スタックパス = トップ' },
  { id:'_ip_tt14', field:'tb', condition:'smash pass',    value:'トップ', action:'add', rationale:'スマッシュパス = トップのパスガード技術' },
  { id:'_ip_tt15', field:'tb', condition:'cartwheel',     value:'トップ', action:'add', rationale:'カートホイールパス = トップのパスガード技術' },
  { id:'_ip_tt16', field:'tb', condition:'x-pass',        value:'トップ', action:'add', rationale:'X-pass = トップのパスガード技術' },
  { id:'_ip_tt17', field:'tb', condition:'destroy',       value:'トップ', action:'add', rationale:'「guard destroyer」= ガードを破壊する = トップ視点' },
  // ── TB追加: トップ（ポジション名）──
  { id:'_ip_tt20', field:'tb', condition:'side control',      value:'トップ', action:'add', rationale:'サイドコントロール = トップポジション' },
  { id:'_ip_tt21', field:'tb', condition:'サイドコントロール', value:'トップ', action:'add', rationale:'日本語サイドコントロール = トップポジション' },
  { id:'_ip_tt22', field:'tb', condition:'north south',       value:'トップ', action:'add', rationale:'ノースサウス = トップポジション（頭と足が逆方向）' },
  { id:'_ip_tt23', field:'tb', condition:'ノースサウス',       value:'トップ', action:'add', rationale:'日本語ノースサウス = トップポジション' },
  { id:'_ip_tt24', field:'tb', condition:'knee on belly',     value:'トップ', action:'add', rationale:'ニーオンベリー = トップポジション' },
  { id:'_ip_tt25', field:'tb', condition:'ニーオンベリー',     value:'トップ', action:'add', rationale:'日本語ニーオンベリー = トップポジション' },
  { id:'_ip_tt26', field:'tb', condition:'back mount',        value:'トップ', action:'add', rationale:'バックマウント = トップポジション（後ろから乗る）' },
  { id:'_ip_tt27', field:'tb', condition:'バックマウント',     value:'トップ', action:'add', rationale:'日本語バックマウント = トップポジション' },

  // ── TB追加: ボトム（ガードタイプ名 → ボトム確定）──
  { id:'_ip_bt01', field:'tb', condition:'spider',        value:'ボトム', action:'add', rationale:'スパイダーガード = ボトム側が使うガード' },
  { id:'_ip_bt02', field:'tb', condition:'スパイダー',     value:'ボトム', action:'add', rationale:'日本語スパイダー = ボトム側のガード' },
  { id:'_ip_bt03', field:'tb', condition:'de la riva',    value:'ボトム', action:'add', rationale:'デラヒーバガード = ボトム側のガード' },
  { id:'_ip_bt04', field:'tb', condition:'デラヒーバ',     value:'ボトム', action:'add', rationale:'日本語デラヒーバ = ボトム側のガード' },
  { id:'_ip_bt05', field:'tb', condition:'butterfly',     value:'ボトム', action:'add', rationale:'バタフライガード = ボトム側のガード' },
  { id:'_ip_bt06', field:'tb', condition:'バタフライ',     value:'ボトム', action:'add', rationale:'日本語バタフライ = ボトム側のガード' },
  { id:'_ip_bt07', field:'tb', condition:'half guard',    value:'ボトム', action:'add', rationale:'ハーフガード = ボトム側のガード（ハーフからのパスはトップが別に検出）' },
  { id:'_ip_bt08', field:'tb', condition:'ハーフガード',   value:'ボトム', action:'add', rationale:'日本語ハーフガード = ボトム側のガード' },
  { id:'_ip_bt09', field:'tb', condition:'closed guard',  value:'ボトム', action:'add', rationale:'クローズドガード = ボトム側のガード' },
  { id:'_ip_bt10', field:'tb', condition:'クローズドガード',value:'ボトム', action:'add', rationale:'日本語クローズドガード = ボトム側のガード' },
  { id:'_ip_bt11', field:'tb', condition:'x guard',       value:'ボトム', action:'add', rationale:'Xガード = ボトム側のガード' },
  { id:'_ip_bt12', field:'tb', condition:'xガード',        value:'ボトム', action:'add', rationale:'日本語Xガード = ボトム側のガード' },
  { id:'_ip_bt13', field:'tb', condition:'lasso',         value:'ボトム', action:'add', rationale:'ラッソーガード = ボトム側のガード' },
  { id:'_ip_bt14', field:'tb', condition:'ラッソー',       value:'ボトム', action:'add', rationale:'日本語ラッソー = ボトム側のガード' },
  { id:'_ip_bt15', field:'tb', condition:'deep half',     value:'ボトム', action:'add', rationale:'ディープハーフ = ボトム側のハーフガード発展型' },
  { id:'_ip_bt16', field:'tb', condition:'ディープハーフ', value:'ボトム', action:'add', rationale:'日本語ディープハーフ = ボトム側のガード' },
  { id:'_ip_bt17', field:'tb', condition:'open guard',    value:'ボトム', action:'add', rationale:'オープンガード = ボトム側のガード総称' },
  { id:'_ip_bt18', field:'tb', condition:'オープンガード', value:'ボトム', action:'add', rationale:'日本語オープンガード = ボトム側のガード' },
  { id:'_ip_bt19', field:'tb', condition:'worm guard',    value:'ボトム', action:'add', rationale:'ワームガード / ラペルガード = ボトム側' },
  { id:'_ip_bt20', field:'tb', condition:'ラペルガード',   value:'ボトム', action:'add', rationale:'日本語ラペルガード = ボトム側のガード' },
  // ── TB追加: ボトム（動作・概念）──
  { id:'_ip_bt25', field:'tb', condition:'guard pull',    value:'ボトム', action:'add', rationale:'ガード引き込み = 自分からボトムを選択する動作' },
  { id:'_ip_bt26', field:'tb', condition:'recovery',      value:'ボトム', action:'add', rationale:'ガードリカバリー = ボトムがガードを取り戻す動作' },
  { id:'_ip_bt27', field:'tb', condition:'リカバリー',     value:'ボトム', action:'add', rationale:'日本語リカバリー = ボトム側のガード回復動作' },
  { id:'_ip_bt28', field:'tb', condition:'frame',         value:'ボトム', action:'add', rationale:'フレーミング = ボトムが腕で距離を作る防御動作' },
  { id:'_ip_bt29', field:'tb', condition:'フレーム',       value:'ボトム', action:'add', rationale:'日本語フレーム = ボトム側の防御動作' },
  { id:'_ip_bt30', field:'tb', condition:'脱出',           value:'ボトム', action:'add', rationale:'ポジション脱出 = ボトムが不利なポジションから逃げる動作' },

  // ── TB追加: スタンディング（テイクダウン技術名）──
  { id:'_ip_st01', field:'tb', condition:'double leg',    value:'スタンディング', action:'add', rationale:'ダブルレッグタックル = 立ちのテイクダウン技術' },
  { id:'_ip_st02', field:'tb', condition:'ダブルレッグ',   value:'スタンディング', action:'add', rationale:'日本語ダブルレッグ = タックル = 立ち技' },
  { id:'_ip_st03', field:'tb', condition:'body lock',     value:'スタンディング', action:'add', rationale:'ボディロックタックル = 立ちのテイクダウン技術' },
  { id:'_ip_st04', field:'tb', condition:'ボディロック',   value:'スタンディング', action:'add', rationale:'日本語ボディロック = 立ちのテイクダウン技術' },
  { id:'_ip_st05', field:'tb', condition:'sprawl',        value:'スタンディング', action:'add', rationale:'スプロール = 立ちでタックルを切る防御動作' },
  { id:'_ip_st06', field:'tb', condition:'スプロール',     value:'スタンディング', action:'add', rationale:'日本語スプロール = 立ちのテイクダウン防御' },
  // ── TB追加: スタンディング（投げ・柔道）──
  { id:'_ip_st10', field:'tb', condition:'throw',         value:'スタンディング', action:'add', rationale:'投げ技 = 立ちのシチュエーション（柔道/レスリング）' },
  { id:'_ip_st11', field:'tb', condition:'投げ',           value:'スタンディング', action:'add', rationale:'日本語「投げ」= 立ち技の投げ全般' },
  { id:'_ip_st12', field:'tb', condition:'judo',          value:'スタンディング', action:'add', rationale:'柔道技術 = 立ちのシチュエーション' },
  { id:'_ip_st13', field:'tb', condition:'柔道',           value:'スタンディング', action:'add', rationale:'日本語柔道 = 立ち技文脈' },
  { id:'_ip_st14', field:'tb', condition:'uchimata',      value:'スタンディング', action:'add', rationale:'内股 = 柔道の立ち技' },
  { id:'_ip_st15', field:'tb', condition:'内股',           value:'スタンディング', action:'add', rationale:'日本語内股 = 柔道の立ち技' },
  { id:'_ip_st16', field:'tb', condition:'osoto',         value:'スタンディング', action:'add', rationale:'大外刈り = 柔道の立ち技' },
  { id:'_ip_st17', field:'tb', condition:'大外',           value:'スタンディング', action:'add', rationale:'日本語大外（刈り）= 柔道の立ち技' },
  { id:'_ip_st18', field:'tb', condition:'seoi',          value:'スタンディング', action:'add', rationale:'背負い投げ = 柔道の立ち技' },
  { id:'_ip_st19', field:'tb', condition:'背負い',         value:'スタンディング', action:'add', rationale:'日本語背負い（投げ）= 柔道の立ち技' },
  { id:'_ip_st20', field:'tb', condition:'hip throw',     value:'スタンディング', action:'add', rationale:'腰投げ = 柔道系立ち技' },
  // ── TB追加: スタンディング（立ち一般）──
  { id:'_ip_st25', field:'tb', condition:'grips',         value:'スタンディング', action:'add', rationale:'グリップ争い = 立ちのシチュエーション' },
  { id:'_ip_st26', field:'tb', condition:'グリップ',       value:'スタンディング', action:'add', rationale:'日本語グリップ = 立ちの組み手・グリップファイティング' },
  { id:'_ip_st27', field:'tb', condition:'組み手',         value:'スタンディング', action:'add', rationale:'組み手 = 柔道/BJJの立ちのグリップ争い' },
  { id:'_ip_st28', field:'tb', condition:'stand up',      value:'スタンディング', action:'add', rationale:'stand up = 立ち技に戻る/立ち姿勢（2語）' },
  { id:'_ip_st29', field:'tb', condition:'スタンドアップ', value:'スタンディング', action:'add', rationale:'日本語スタンドアップ = 立ち技全般' },
  { id:'_ip_st30', field:'tb', condition:'立ち技',         value:'スタンディング', action:'add', rationale:'日本語立ち技 = スタンディングのシチュエーション全般' },
];

function _getProposals() {
  try { return JSON.parse(localStorage.getItem(PROPOSALS_KEY) || '[]'); } catch(e) { return []; }
}
function _saveProposals(list) {
  try { localStorage.setItem(PROPOSALS_KEY, JSON.stringify(list)); } catch(e) {}
  _pushToFirestore('rule_proposals', list);
}
function _seedProposals() {
  let stored = _getProposals();

  // ── 復元: waza_ai_rules に source='ルール審査' のエントリがあれば承認済みに戻す ──
  const rules = _getRules();
  const approvedByRule = new Map(); // id → rule
  rules.forEach(r => {
    if (r.source === 'ルール審査' && r.id) approvedByRule.set(r.id, r);
  });
  if (approvedByRule.size > 0) {
    let changed = false;
    stored = stored.map(p => {
      if (p.status !== 'approved' && approvedByRule.has(p.id)) {
        changed = true;
        return { ...p, status: 'approved', approved_at: approvedByRule.get(p.id).created || Date.now() };
      }
      return p;
    });
    if (changed) _saveProposals(stored);
  }

  // ── 新規エントリを追加（未登録IDのみ）──
  const storedIds = new Set(stored.map(p => p.id));
  const toAdd = _INITIAL_PROPOSALS.filter(p => !storedIds.has(p.id));
  if (!toAdd.length) return;
  const merged = stored.concat(toAdd.map(p => {
    // 新規エントリでも承認済みルールと一致するなら承認状態で追加
    const matchedRule = rules.find(r => r.source === 'ルール審査' && r.condition === p.condition && r.field === p.field && r.value === p.value);
    return {
      ...p,
      status: matchedRule ? 'approved' : 'pending',
      approved_at: matchedRule ? (matchedRule.created || Date.now()) : undefined,
      user_note: '',
      created: Date.now()
    };
  }));
  _saveProposals(merged);
}

// ── ライブラリスキャン v2: 精度ベースの高品質候補検出 ──
// 「このトークンが出現する全動画中、このタグが付いている割合（精度）」を計算し、
// 精度が高いもの（= 概念語: escape, sweep, retention）のみ提案する。
// 個別具体的な技名（straight, arm, bar）は精度が低くなるため自動除外される。
function _scanLibraryForProposals() {
  const videos = (window.videos || []).filter(v => !v.archived);
  if (!videos.length) { window.toast?.('動画データが読み込まれていません'); return; }

  const rules     = _getRules().filter(r => r.enabled !== false);
  const proposals = _getProposals();

  // 却下済みは除外対象としない（再提案できる）
  const coveredConds = new Set([
    ...rules.map(r => (r.condition || '').toLowerCase()).filter(Boolean),
    ...proposals.filter(p => p.status !== 'rejected').map(p => (p.condition || '').toLowerCase()).filter(Boolean)
  ]);
  const usedIds = new Set(proposals.map(p => p.id));

  // トークン抽出（単語 + 英語バイグラム）
  function _tokens(title) {
    const parts = title.trim()
      .split(/[\s　\/・【】「」『』（）\(\)\[\]\|＝=＋\+]+/)
      .map(s => s.replace(/^[\-\_\.\,\!\?\~#]+|[\-\_\.\,\!\?\~#]+$/g, '').trim())
      .filter(s => s.length >= 2);
    const seen = new Set();
    const uniq = parts.filter(s => { const l = s.toLowerCase(); if (seen.has(l)) return false; seen.add(l); return true; });
    const bigrams = [];
    for (let i = 0; i < parts.length - 1; i++) {
      if (/^[a-zA-Z0-9]+$/.test(parts[i]) && /^[a-zA-Z0-9]+$/.test(parts[i+1])) {
        bigrams.push(parts[i].toLowerCase() + ' ' + parts[i+1].toLowerCase());
      }
    }
    return [...uniq, ...bigrams];
  }

  function _valid(tl) {
    return tl && tl.length >= 2 && tl.length <= 30 && !/^[\d\s\-\_\.]+$/.test(tl) && !coveredConds.has(tl);
  }

  // ── Step 1: 全タグ付き動画でトークン総出現数を集計（精度の分母）──
  const tokenTotal = new Map();
  videos.forEach(v => {
    if (!v.tb && !(v.pos && v.pos.length) && !(v.cat && v.cat.length)) return;
    const rawTitle = (v.title || v.name || '').trim();
    if (!rawTitle) return;
    const seen = new Set();
    _tokens(rawTitle).forEach(tok => {
      const tl = tok.toLowerCase();
      if (seen.has(tl) || !_valid(tl)) return;
      seen.add(tl);
      tokenTotal.set(tl, (tokenTotal.get(tl) || 0) + 1);
    });
  });

  // ── Step 2: (token, field, value) の共起カウント（精度の分子）──
  const candidateMap = new Map();
  function _addCandidate(tokOrig, field, value) {
    const tl = tokOrig.toLowerCase();
    if (!_valid(tl)) return;
    const key = field + ':' + value;
    if (!candidateMap.has(tl)) candidateMap.set(tl, new Map());
    const fvMap = candidateMap.get(tl);
    if (!fvMap.has(key)) fvMap.set(key, { field, value, count: 0, condOrig: tokOrig });
    fvMap.get(key).count++;
  }

  const TB_VALID = new Set(['トップ', 'ボトム', 'スタンディング']);
  videos.forEach(v => {
    const rawTitle = (v.title || v.name || '').trim();
    if (!rawTitle) return;
    const titleLow = rawTitle.toLowerCase();
    const tokens   = _tokens(rawTitle);

    const tbArr = Array.isArray(v.tb) ? v.tb : (v.tb ? [v.tb] : []);
    tbArr.forEach(tbVal => {
      if (!TB_VALID.has(tbVal)) return;
      const explained = rules.some(r => r.field === 'tb' && r.condition && titleLow.includes(r.condition.toLowerCase()));
      if (!explained) tokens.forEach(tok => _addCandidate(tok, 'tb', tbVal));
    });
    (v.pos || []).forEach(posVal => {
      if (!posVal) return;
      const explained = rules.some(r => r.field === 'pos' && r.condition && titleLow.includes(r.condition.toLowerCase()));
      if (!explained) tokens.forEach(tok => _addCandidate(tok, 'pos', posVal));
    });
    (v.cat || []).forEach(catVal => {
      if (!catVal) return;
      const explained = rules.some(r => r.field === 'cat' && r.condition && titleLow.includes(r.condition.toLowerCase()));
      if (!explained) tokens.forEach(tok => _addCandidate(tok, 'cat', catVal));
    });
  });

  // ── Step 3: 精度フィルタ ──
  // MIN_COUNT     : 最低4動画に出現（雑音除去）
  // MIN_PRECISION : 60%以上の出現でこのタグが付いている（技名を除外する核心）
  //   例: escape(15動画中13件=87%) → 提案 / straight(20動画中3件=15%) → スキップ
  // MAX_PER_FV    : 同一タグへの提案は上位3件に限定（爆発防止）
  const MIN_COUNT     = 4;
  const MIN_PRECISION = 0.60;
  const MAX_PER_FV    = 3;

  const byFV = new Map();
  candidateMap.forEach((fvMap, tl) => {
    const total = tokenTotal.get(tl) || 1;
    fvMap.forEach(({ field, value, count, condOrig }) => {
      if (count < MIN_COUNT) return;
      const precision = count / total;
      if (precision < MIN_PRECISION) return;
      const fvKey = field + ':' + value;
      if (!byFV.has(fvKey)) byFV.set(fvKey, []);
      byFV.get(fvKey).push({ tl, condOrig, count, precision, total });
    });
  });

  const newProps = [];
  byFV.forEach((items, fvKey) => {
    const sep   = fvKey.indexOf(':');
    const field = fvKey.slice(0, sep);
    const value = fvKey.slice(sep + 1);
    items.sort((a, b) => (b.precision * b.count) - (a.precision * a.count));
    items.slice(0, MAX_PER_FV).forEach(({ tl, condOrig, count, precision, total }) => {
      const safeId = tl.replace(/[^a-z0-9ぁ-ん一-龯ァ-ン]/g, '_').slice(0, 20);
      const id = '_sc_' + field + '_' + safeId + '_' + (value.slice(0, 4).replace(/[^a-z0-9ぁ-ん一-龯ァ-ン]/g, ''));
      if (usedIds.has(id)) return;
      usedIds.add(id);
      newProps.push({
        id, field, condition: condOrig, value, action: 'add',
        rationale: `${count}/${total}件の動画で出現し${Math.round(precision * 100)}%が「${value}」タグ付き`,
        status: 'pending', user_note: '', created: Date.now(), source: 'スキャン'
      });
    });
  });

  if (!newProps.length) {
    window.toast?.('高精度の新規候補は見つかりませんでした（既存ルール・提案がカバー済み）');
    return;
  }

  // 精度の高い順にソート
  newProps.sort((a, b) => {
    const pa = parseInt((a.rationale.match(/(\d+)%/) || ['0','0'])[1]);
    const pb = parseInt((b.rationale.match(/(\d+)%/) || ['0','0'])[1]);
    return pb - pa;
  });

  const merged = _getProposals().concat(newProps);
  _saveProposals(merged);
  _renderReview();
  window.toast?.(`🔍 ${newProps.length}件の高精度候補を追加しました`);
}
window._scanLibraryForProposals = _scanLibraryForProposals;

// ── TB カバレッジ診断 ──
window._analyzeTbCoverage = function() {
  const videos = (window.videos || []).filter(v => !v.archived);
  if (!videos.length) { window.toast?.('動画がありません（ログイン後に実行してください）'); return; }

  let top = 0, bot = 0, stand = 0, topBot = 0, empty = 0;
  videos.forEach(v => {
    const tb = Array.isArray(v.tb) ? v.tb : (v.tb ? [v.tb] : []);
    const hasTop = tb.includes('トップ'), hasBot = tb.includes('ボトム'), hasSt = tb.includes('スタンディング');
    if (hasTop) top++;
    if (hasBot) bot++;
    if (hasSt)  stand++;
    if (hasTop && hasBot) topBot++;
    if (!tb.length) empty++;
  });

  const total = videos.length;
  const covered = total - empty;
  const pct = total ? Math.round(covered / total * 100) : 0;

  const el = document.getElementById('tb-analysis-result');
  if (el) {
    el.innerHTML = [
      `全動画 <b>${total}</b> 本 → TB設定済 <b style="color:var(--green)">${covered}</b> 本 (<b>${pct}%</b>) / 未設定 <b style="color:var(--red)">${empty}</b> 本`,
      `トップ <b>${top}</b> / ボトム <b>${bot}</b> / スタンディング <b>${stand}</b>`,
      topBot ? `<span style="color:var(--red)">⚠ トップ+ボトム 両方タグ: ${topBot}本</span>` : '',
    ].filter(Boolean).join('<br>');
    el.style.color = 'var(--text2)';
  }
  window.toast?.(`📊 TB診断: ${covered}/${total}本 (${pct}%) カバー済`);
  return { total, covered, empty, top, bot, stand, topBot };
};

// 未設定動画のリスト + アルゴリズム推測を表示
window._showUntaggedTb = function() {
  const videos = (window.videos || []).filter(v => !v.archived);
  if (!videos.length) { window.toast?.('動画がありません'); return; }

  const container = document.getElementById('tb-untagged-list');
  if (!container) return;

  const autoTag = window.autoTagFromTitle;
  const untagged = videos.filter(v => {
    const tb = Array.isArray(v.tb) ? v.tb : (v.tb ? [v.tb] : []);
    return !tb.length;
  });

  if (!untagged.length) {
    container.textContent = '✓ 未設定の動画はありません';
    container.style.display = '';
    return;
  }

  // アルゴリズム推測を付けて表示
  const lines = untagged.slice(0, 200).map(v => {
    const title = (v.pl || v.title || '(no title)').substring(0, 80);
    const suggest = autoTag ? (autoTag((v.title||'') + ' ' + (v.pl||'')).tb.join('/') || '—') : '?';
    const color = suggest === '—' ? '#888' : suggest.includes('トップ') ? 'var(--accent)' : suggest.includes('スタンディング') ? 'var(--green)' : '#4fc3f7';
    return `<div style="padding:2px 0;border-bottom:1px solid var(--border2)"><span style="color:${color};font-weight:700">[${suggest}]</span> ${title}</div>`;
  });

  container.innerHTML = `<div style="margin-bottom:6px;color:var(--text3)">未設定 ${untagged.length}本 (先頭200件) — [ ] 内はアルゴリズム推測</div>` + lines.join('');
  container.style.display = '';
};

// ── TB競合プレビュー（実行前に何件修正されるか確認）──
window._previewTbConflicts = function() {
  const videos = (window.videos || []).filter(v => !v.archived);
  const norm = s => (s||'').toLowerCase().replace(/[\s\-_/・]/g,'');
  const TOP_WIN = ['pass','passing','パス','pasu','mount','マウント','sidecontrol','サイドコントロール','northsouth','ノースサウス','dominate','beat','攻略','突破','制圧','崩し','対策','torreando','legdrag','stack','kneeslice','smash','pressure'];
  const BOT_WIN = ['playing','fromguard','ガードから','guardpull','引き込み','closedguard','クローズドガード','butterflyguard','spiderguard','dlr','delariva','lasso','berimbolo','slx','kguard','deephalf'];

  let toTop = [], toBot = [], skip = [];
  videos.forEach(v => {
    const tb = Array.isArray(v.tb) ? v.tb : [];
    if (!tb.includes('トップ') || !tb.includes('ボトム')) return;
    const t = norm((v.pl||'') + ' ' + (v.title||''));
    const hasTop = TOP_WIN.some(kw => t.includes(kw));
    const hasBot = BOT_WIN.some(kw => t.includes(kw));
    const label = ((v.pl||'') + ' ' + (v.title||'')).substring(0,80).trim();
    if (hasTop && !hasBot)       toTop.push(label);
    else if (hasBot && !hasTop)  toBot.push(label);
    else                         skip.push(label);
  });

  const container = document.getElementById('tb-untagged-list');
  if (container) {
    container.innerHTML = [
      `<div style="margin-bottom:8px;color:var(--text2);font-weight:700">競合 ${toTop.length+toBot.length+skip.length}本の内訳（プレビュー）</div>`,
      `<div style="color:var(--accent);margin-bottom:4px">▶ トップのみに修正: ${toTop.length}本</div>`,
      ...toTop.slice(0,30).map(l=>`<div style="padding:1px 0;padding-left:10px;border-bottom:1px solid var(--border2)">${l}</div>`),
      `<div style="color:#4fc3f7;margin:8px 0 4px">▶ ボトムのみに修正: ${toBot.length}本</div>`,
      ...toBot.slice(0,30).map(l=>`<div style="padding:1px 0;padding-left:10px;border-bottom:1px solid var(--border2)">${l}</div>`),
      `<div style="color:#888;margin:8px 0 4px">▶ 判定不能（手動確認必要）: ${skip.length}本</div>`,
      ...skip.slice(0,20).map(l=>`<div style="padding:1px 0;padding-left:10px;border-bottom:1px solid var(--border2)">${l}</div>`),
    ].join('');
    container.style.display = '';
  }
  window.toast?.(`プレビュー: TOP修正${toTop.length}本, BOT修正${toBot.length}本, 不明${skip.length}本`);
};

// ── TB競合一括修正（確認後に実行）──
window._fixTbConflicts = function() {
  const videos = (window.videos || []).filter(v => !v.archived);
  const norm = s => (s||'').toLowerCase().replace(/[\s\-_/・]/g,'');
  const TOP_WIN = ['pass','passing','パス','pasu','mount','マウント','sidecontrol','サイドコントロール','northsouth','ノースサウス','dominate','beat','攻略','突破','制圧','崩し','対策','torreando','legdrag','stack','kneeslice','smash','pressure'];
  const BOT_WIN = ['playing','fromguard','ガードから','guardpull','引き込み','closedguard','クローズドガード','butterflyguard','spiderguard','dlr','delariva','lasso','berimbolo','slx','kguard','deephalf'];

  const conflicts = videos.filter(v => {
    const tb = Array.isArray(v.tb) ? v.tb : [];
    return tb.includes('トップ') && tb.includes('ボトム');
  });
  if (!conflicts.length) { window.toast?.('競合はありません'); return; }

  // プレビュー件数を計算
  let toTop = 0, toBot = 0, skip = 0;
  conflicts.forEach(v => {
    const t = norm((v.pl||'') + ' ' + (v.title||''));
    const hasTop = TOP_WIN.some(kw => t.includes(kw));
    const hasBot = BOT_WIN.some(kw => t.includes(kw));
    if (hasTop && !hasBot) toTop++;
    else if (hasBot && !hasTop) toBot++;
    else skip++;
  });

  if (!confirm(`TB競合 ${conflicts.length}本を修正します:\n・トップのみに: ${toTop}本\n・ボトムのみに: ${toBot}本\n・判定不能(スキップ): ${skip}本\n\n実行しますか？`)) return;

  let fixed = 0;
  conflicts.forEach(v => {
    const t = norm((v.pl||'') + ' ' + (v.title||''));
    const hasTop = TOP_WIN.some(kw => t.includes(kw));
    const hasBot = BOT_WIN.some(kw => t.includes(kw));
    if (hasTop && !hasBot)      { v.tb = (v.tb||[]).filter(x => x !== 'ボトム'); fixed++; }
    else if (hasBot && !hasTop) { v.tb = (v.tb||[]).filter(x => x !== 'トップ'); fixed++; }
  });

  if (fixed) { window.debounceSave?.(); window.AF?.(); }
  window.toast?.(`🔧 ${fixed}本の競合を修正しました（${skip}本はスキップ）`);
  window._analyzeTbCoverage();
};

// 未確認スキャン提案をクリア（承認/却下済みは残す）
window._clearScanProposals = function() {
  const proposals = _getProposals();
  const before = proposals.length;
  const kept = proposals.filter(p => !(p.source === 'スキャン' && p.status === 'pending'));
  if (kept.length === before) { window.toast?.('クリア対象の未確認スキャン候補がありません'); return; }
  if (!confirm(`未確認のスキャン候補 ${before - kept.length}件を削除します。承認・却下済みは残ります。よろしいですか？`)) return;
  _saveProposals(kept);
  _renderReview();
  window.toast?.(`🗑 ${before - kept.length}件の未確認スキャン候補を削除しました`);
};

function _renderReview() {
  const el = document.getElementById('admin-p-review');
  if (!el) return;
  _seedProposals();
  const proposals = _getProposals();
  const filter = el.dataset.filter || 'all';
  const _esc2 = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const pending  = proposals.filter(p => p.status === 'pending');
  const approved = proposals.filter(p => p.status === 'approved');
  const rejected = proposals.filter(p => p.status === 'rejected');
  const filtered = filter === 'pending' ? pending : filter === 'approved' ? approved : filter === 'rejected' ? rejected : proposals;

  const _fb = f => {
    const colors = { cat:['rgba(122,184,224,.15)','var(--blue)'], pos:['rgba(160,144,208,.15)','var(--purple)'], tb:['rgba(229,196,122,.15)','var(--accent)'] };
    const [bg,fg] = colors[f] || ['rgba(107,196,144,.15)','var(--green)'];
    return `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:${bg};color:${fg}">${f}</span>`;
  };
  const _REVIEW_TYPE_BADGES = {
    keyword:    `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(229,196,122,.12);color:var(--accent)">キーワード</span>`,
    and:        `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(64,160,112,.15);color:#40a070">AND</span>`,
    not:        `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(224,96,96,.15);color:var(--red)">NOT</span>`,
    conflict:   `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(200,80,200,.15);color:#c850c8">競合</span>`,
    pos_implies:`<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(80,120,220,.15);color:#5078dc">継承</span>`,
    default:    `<span style="font-size:10px;padding:2px 6px;border-radius:8px;font-weight:700;background:rgba(160,160,160,.15);color:var(--text3)">デフォルト</span>`,
  };
  const _pt = p => _REVIEW_TYPE_BADGES[p.type || 'keyword'] || _REVIEW_TYPE_BADGES.keyword;
  const _sb = s => s === 'approved'
    ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700;background:rgba(107,196,144,.2);color:var(--green)">✓ 承認</span>`
    : s === 'rejected'
    ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700;background:rgba(224,96,96,.15);color:var(--red)">✗ 却下</span>`
    : `<span style="font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700;background:rgba(160,160,160,.15);color:var(--text3)">未確認</span>`;

  el.innerHTML = `
    <!-- 統計カード（クリックでフィルター兼用） -->
    <div style="display:flex;gap:8px;margin-bottom:16px;align-items:stretch">
      ${[
        ['all',      proposals.length, '合計',   'var(--accent)'],
        ['pending',  pending.length,   '未確認', 'var(--text3)'],
        ['approved', approved.length,  '承認',   'var(--green)'],
        ['rejected', rejected.length,  '却下',   'var(--red)']
      ].map(([f, n, label, color]) => `
        <div id="rv-card-${f}" onclick="setReviewFilter('${f}')"
             style="flex:1;background:var(--surface);
                    border:${filter===f ? '2px solid '+color : '1px solid var(--border)'};
                    border-radius:8px;padding:10px 6px;text-align:center;cursor:pointer;transition:border .15s">
          <div class="rv-card-num" style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:${color}">${n}</div>
          <div class="rv-card-lbl" style="font-size:10px;margin-top:3px;font-weight:${filter===f ? '700' : '400'};color:${filter===f ? color : 'var(--text3)'}">${label}</div>
        </div>`).join('')}
      <div style="display:flex;flex-direction:column;gap:6px;justify-content:center;padding-left:4px">
        <button onclick="window._scanLibraryForProposals()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:6px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">🔍 スキャン</button>
        <button onclick="window._clearScanProposals()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text3);padding:6px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">🗑 クリア</button>
        <button onclick="addProposalRow()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ 追加</button>
      </div>
    </div>

    ${proposals.length === 0 ? `
      <div style="text-align:center;padding:40px;color:var(--text3);font-size:12px">
        <div style="font-size:32px;margin-bottom:12px">📋</div>
        提案がありません
      </div>
    ` : `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table style="width:100%;border-collapse:collapse;min-width:640px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);width:110px">条件</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);width:120px">キーワード</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border)">根拠</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);width:190px">私の判断と根拠</th>
            <th style="padding:8px 10px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);width:90px">今後のルール</th>
          </tr>
        </thead>
        <tbody>
          <tr id="rv-no-results" style="${filter !== 'all' && !filtered.length ? '' : 'display:none'}">
            <td colspan="5" style="text-align:center;padding:32px;color:var(--text3);font-size:12px">
              <div style="font-size:24px;margin-bottom:8px">📋</div>
              ${filter === 'pending' ? '未確認の提案はありません' : filter === 'approved' ? '承認済みのルールがありません' : filter === 'rejected' ? '却下済みはありません' : ''}
            </td>
          </tr>
          ${proposals.map(p => {
            const st = p.status || 'pending';
            const hidden = filter !== 'all' && st !== filter;
            return `
          <tr class="rv-row" data-status="${st}" style="${hidden ? 'display:none;' : ''}border-bottom:1px solid var(--border2)">
            <td style="padding:10px 10px;vertical-align:top">
              <div style="display:flex;flex-direction:column;gap:4px">
                ${_pt(p)}
                ${_fb(p.field)}
                <div style="font-size:13px;font-weight:700;color:var(--accent)">${_esc2(p.value)}</div>
                <div style="font-size:10px;color:var(--text3)">${p.action==='add'?'追加':'置換'}</div>
              </div>
            </td>
            <td style="padding:10px 10px;vertical-align:top">
              <code style="font-size:12px;color:var(--text);background:var(--surface2);padding:3px 7px;border-radius:5px;font-family:'DM Mono',monospace">${_esc2(p.condition)}</code>
            </td>
            <td style="padding:10px 10px;vertical-align:top;font-size:11px;color:var(--text2);line-height:1.6">${_esc2(p.rationale||'')}</td>
            <td style="padding:8px 10px;vertical-align:top">
              <div style="display:flex;flex-direction:column;gap:4px">
                <input type="text" value="${_esc2(p.user_note||'')}" placeholder="コメント（任意）"
                  onblur="saveProposalNote('${p.id}', this.value)"
                  style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box">
                <div style="display:flex;gap:4px">
                  ${p.status !== 'approved' ? `<button onclick="approveProposal('${p.id}')" style="flex:1;background:rgba(107,196,144,.2);border:1px solid var(--green);color:var(--green);padding:3px 6px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">✓ 承認</button>` : ''}
                  ${p.status !== 'rejected' ? `<button onclick="rejectProposal('${p.id}')" style="flex:1;background:rgba(224,96,96,.1);border:1px solid var(--red);color:var(--red);padding:3px 6px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">✗ 却下</button>` : ''}
                </div>
                ${p.status !== 'pending' ? `<button onclick="resetProposal('${p.id}')" style="background:none;border:1px solid var(--border);color:var(--text3);padding:2px 6px;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;width:100%">↩ 戻す</button>` : ''}
              </div>
            </td>
            <td style="padding:10px 10px;vertical-align:top">
              ${_sb(p.status)}
              ${p.approved_at ? `<div style="font-size:10px;color:var(--text3);margin-top:4px">${new Date(p.approved_at).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}</div>` : ''}
            </td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    `}
  `;
}

window.approveProposal = function(id) {
  const proposals = _getProposals();
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  p.status = 'approved';
  p.approved_at = Date.now();
  _saveProposals(proposals);
  // waza_ai_rules に追加（重複チェック）
  const rules = _getRules();
  const exists = rules.some(r => r.id === id || (r.condition === p.condition && r.field === p.field && r.value === p.value));
  if (!exists) {
    const desc = (p.user_note || p.rationale || '').trim();
    rules.push({ id, condition: p.condition, field: p.field, action: p.action || 'add', value: p.value, enabled: true, created: Date.now(), source: 'ルール審査', ...(desc ? { desc } : {}) });
    _saveRules(rules);
  }
  _renderReview();
  window.toast?.('✓ 承認 — ルールに追加しました');
};
window.approveProposal = window.approveProposal;

window.rejectProposal = function(id) {
  const proposals = _getProposals();
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  p.status = 'rejected';
  p.rejected_at = Date.now();
  _saveProposals(proposals);
  _renderReview();
  window.toast?.('✗ 却下しました');
};

window.resetProposal = function(id) {
  const proposals = _getProposals();
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  p.status = 'pending';
  delete p.approved_at;
  delete p.rejected_at;
  _saveProposals(proposals);
  _renderReview();
  window.toast?.('未確認に戻しました');
};

window.saveProposalNote = function(id, note) {
  const proposals = _getProposals();
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  p.user_note = note;
  _saveProposals(proposals);
};

window.setReviewFilter = function(f) {
  const el = document.getElementById('admin-p-review');
  if (!el) return;
  el.dataset.filter = f;

  // カードのアクティブ状態を更新（再描画なし）
  const COLORS = { all:'var(--accent)', pending:'var(--text3)', approved:'var(--green)', rejected:'var(--red)' };
  ['all','pending','approved','rejected'].forEach(key => {
    const card = document.getElementById('rv-card-' + key);
    if (!card) return;
    const active = key === f;
    const color  = COLORS[key];
    card.style.border = active ? '2px solid ' + color : '1px solid var(--border)';
    const lblEl = card.querySelector('.rv-card-lbl');
    if (lblEl) { lblEl.style.fontWeight = active ? '700' : '400'; lblEl.style.color = active ? color : 'var(--text3)'; }
  });

  // 行の show/hide（再描画なし — これが高速化の核心）
  let visibleCount = 0;
  document.querySelectorAll('#admin-p-review .rv-row').forEach(row => {
    const show = f === 'all' || (row.dataset.status || 'pending') === f;
    row.style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });

  // 「該当なし」行の表示制御
  const noResults = document.getElementById('rv-no-results');
  if (noResults) noResults.style.display = visibleCount === 0 && f !== 'all' ? '' : 'none';
};

window.addProposalRow = function() {
  const condition = prompt('キーワード（タイトルに含まれる文字列）:');
  if (!condition) return;
  const field = prompt('フィールド（tb / pos / cat）:', 'tb');
  if (!field || !['tb','pos','cat','tags'].includes(field.trim())) { window.toast?.('フィールドは tb / pos / cat / tags で入力してください'); return; }
  const value = prompt('値（例: トップ, スパイダーガード, フィニッシュ）:');
  if (!value) return;
  const rationale = prompt('根拠（なぜこのルール？）:', '') || '';
  const proposals = _getProposals();
  proposals.unshift({
    id: '_up_' + Date.now(),
    field: field.trim(),
    condition: condition.trim(),
    value: value.trim(),
    action: 'add',
    rationale,
    status: 'pending',
    user_note: '',
    created: Date.now(),
    source: '手動追加'
  });
  _saveProposals(proposals);
  _renderReview();
  window.toast?.('提案を追加しました');
};
