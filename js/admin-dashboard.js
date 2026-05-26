// ═══ WAZA KIMURA — AI管理ダッシュボード v50.12 ═══
// Admin-only: 精度・修正履歴・ルール管理

const FEEDBACK_KEY   = 'waza_tag_feedback';
const RULES_KEY      = 'waza_tag_rules';
const TAGDICT_KEY    = 'waza_tag_dict';
const POSITIONS_KEY  = 'waza_positions';
const PROPOSALS_KEY  = 'waza_rule_proposals';

let _activeInnerTab = 'tb'; // ルールタブ内の現在アクティブな内部タブ

const ALL_SUBS = ['accuracy','corrections','rules','categories','positions','feedback','review','tagmaster','aliasbuilder','tbtuner'];

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
  if (sub === 'corrections')  _renderCorrections();
  if (sub === 'rules')        _renderRules();
  if (sub === 'categories')   _renderCategories();
  if (sub === 'positions')    _renderPositions();
  if (sub === 'feedback')     _renderFeedbackAdmin();
  if (sub === 'tagmaster')    _renderTagMaster();
  if (sub === 'aliasbuilder') _renderIframe('admin-p-aliasbuilder', '/alias-builder.html');
  if (sub === 'tbtuner')      _renderIframe('admin-p-tbtuner', '/tb-tuner.html');
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

// 旧キー waza_ai_rules → 新キー waza_tag_rules へ一回限りのマイグレーション
(function _migrateRulesKey() {
  try {
    if (!localStorage.getItem('waza_tag_rules') && localStorage.getItem('waza_ai_rules')) {
      localStorage.setItem('waza_tag_rules', localStorage.getItem('waza_ai_rules'));
      localStorage.removeItem('waza_ai_rules');
    }
  } catch(e) {}
})();

async function _syncFromFirestore() {
  if (_adminSynced) return;
  try {
    const ref = _adminDocRef();
    if (!ref) return;
    const doc = await ref.get();
    if (doc.exists) {
      const d = doc.data();
      // tag_rules（新）または ai_rules（旧）どちらでも読む
      const rules = d.tag_rules || d.ai_rules;
      if (Array.isArray(rules) && rules.length) localStorage.setItem(RULES_KEY, JSON.stringify(rules));
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

  // ── field 別に分類 ──
  const byField = { tb: [], cat: [], pos: [], other: [] };
  [...builtinItems, ...userItems].forEach(item => {
    const f = item.r.field || item.r.if_field || item.r.then_field || 'other';
    const bucket = (f === 'tb' || f === 'cat' || f === 'pos') ? f : 'other';
    byField[bucket].push(item);
  });

  // ── TB エイリアス HTML ──
  const tbKw = window.TB_KEYWORDS || {};
  const tbAliasHtml = Object.entries(tbKw).map(([tbVal, kws]) =>
    `<div style="font-size:11px;color:var(--text3);margin:8px 0 4px;font-weight:600">${_esc(tbVal)}</div>` +
    `<div style="display:flex;flex-wrap:wrap;gap:4px">${kws.map(k =>
      `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--text3)">${_esc(k)}</span>`
    ).join('')}</div>`
  ).join('');

  // ── カテゴリ エイリアス HTML ──
  const catList = window.CATEGORIES || [];
  const catAliasHtml = catList.map(c => {
    const als = Array.isArray(c.aliases) ? c.aliases : [...(c.aliases?.ja||[]), ...(c.aliases?.en||[])];
    if (!als.length) return '';
    return `<div style="font-size:11px;color:var(--text3);margin:8px 0 4px;font-weight:600">${_esc(c.name)}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:4px">${als.map(k =>
        `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--text3)">${_esc(k)}</span>`
      ).join('')}</div>`;
  }).join('');

  // ── ポジション エイリアス HTML ──
  const allPositions = _getPositions();
  const posAliasHtml = allPositions.map(p => {
    const als = [...(p.aliases?.ja||[]), ...(p.aliases?.en||[])].filter(Boolean);
    if (!als.length) return '';
    return `<div style="font-size:11px;color:var(--text3);margin:8px 0 4px;font-weight:600">${_esc(p.names?.ja || p.name || '')}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:4px">${als.map(k =>
        `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--text3)">${_esc(k)}</span>`
      ).join('')}</div>`;
  }).join('');

  // ── alias fold helper ──
  const _aliasBox = (id, html) =>
    `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden">` +
      `<div onclick="toggleAdminInnerAlias('${id}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none">` +
        `<div><span style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">エイリアス</span>` +
        `<span style="font-size:11px;color:var(--text3);margin-left:6px">参照用 — キーワード検索に使用</span></div>` +
        `<span id="${id}-icon" style="font-size:11px;color:var(--text3)">▶ 表示</span>` +
      `</div>` +
      `<div id="${id}" style="display:none;padding:6px 14px 12px;border-top:1px solid var(--border2)">${html}</div>` +
    `</div>`;

  // ── rules section helper ──
  const _rulesBox = (label, color, items) => {
    const bui = items.filter(x => x.r.source === 'ビルトイン');
    const usr = items.filter(x => x.r.source !== 'ビルトイン');
    const inner = [
      bui.length ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 0 4px">` +
        `<span style="font-size:11px;font-weight:700;color:#6464cc">🔧 組み込み</span>` +
        `<span style="font-size:10px;color:var(--text3)">${bui.length}件</span></div>` +
        bui.map(x => _ruleRow(x, true)).join('') : '',
      usr.length ? `<div style="display:flex;align-items:center;gap:6px;padding:${bui.length?'10px':'6px'} 0 4px">` +
        `<span style="font-size:11px;font-weight:700;color:var(--text2)">📝 ユーザー定義</span>` +
        `<span style="font-size:10px;color:var(--text3)">${usr.length}件</span></div>` +
        usr.map(x => _ruleRow(x, false)).join('') : '',
    ].filter(Boolean).join('') ||
      `<div style="padding:14px 0;text-align:center;color:var(--text3);font-size:12px">ルールがまだありません</div>`;
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)">` +
        `<div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${color}">${label}</span>` +
        `<span style="font-size:11px;color:var(--text3);margin-left:6px">${items.length}件</span></div>` +
        `<button onclick="toggleAddRuleForm()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ ルール追加</button>` +
      `</div>` +
      `<div style="padding:4px 14px">${inner}</div>` +
    `</div>`;
  };

  // ── カテゴリ一覧 HTML ──
  const catItemsHtml = catList.length ? catList.map((c, i) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border2)">` +
      `<div style="flex:1;font-size:12px;font-weight:600">${_esc(c.name)}</div>` +
      `<button onclick="_deleteInnerCat(${i})" style="background:none;border:1px solid #f0c0c0;color:var(--red);font-size:11px;padding:3px 9px;border-radius:10px;cursor:pointer;font-family:inherit">削除</button>` +
    `</div>`
  ).join('') : `<div style="padding:12px 0;text-align:center;color:var(--text3);font-size:12px">カテゴリがまだありません</div>`;

  // ── ポジション一覧 HTML ──
  const posItemsHtml = allPositions.length ? allPositions.map((p, i) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border2)">` +
      `<div style="flex:1;font-size:12px;font-weight:600">${_esc(p.names?.ja || p.name || '')}</div>` +
      `<div style="font-size:10px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:2px 7px;flex-shrink:0">${_esc(p.group || '')}</div>` +
      `<button onclick="_deleteInnerPos(${i})" style="background:none;border:1px solid #f0c0c0;color:var(--red);font-size:11px;padding:3px 9px;border-radius:10px;cursor:pointer;font-family:inherit">削除</button>` +
    `</div>`
  ).join('') : `<div style="padding:12px 0;text-align:center;color:var(--text3);font-size:12px">ポジションがまだありません</div>`;

  // ── タブボタン style helper ──
  const _tbStyle = (active, color) =>
    `padding:9px 18px;border:none;background:none;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;` +
    `border-bottom:2px solid ${active ? color : 'transparent'};margin-bottom:-2px;` +
    `color:${active ? color : 'var(--text3)'};transition:color .15s,border-color .15s`;

  el.innerHTML =
    // ── ⭐ グラウンドルール ──
    `<div style="background:var(--surface);border:2px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:14px">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${groundItems.length ? '10px' : '0'}">` +
        `<div><span style="font-size:13px;font-weight:700;color:var(--accent)">⭐ グラウンドルール</span>` +
        `<span style="font-size:11px;color:var(--text3);margin-left:8px">— 他の全ルールより上位の大前提</span></div>` +
        `<button onclick="addGroundRule()" style="background:var(--accent);color:var(--on-accent);border:none;padding:5px 14px;border-radius:16px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ 追加</button>` +
      `</div>` +
      (groundItems.length ? groundItems.map(item => _ruleRow(item, false)).join('') :
        `<div style="margin-top:10px;padding:14px;text-align:center;color:var(--text3);font-size:12px;border-top:1px solid var(--border)">グラウンドルールはまだありません</div>`) +
    `</div>` +

    // ── 共有追加フォーム (全IDs保持) ──
    `<div id="add-rule-form" style="display:none;background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:12px">` +
      `<div id="add-rule-mode-label" style="display:none;font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px;padding:4px 8px;background:rgba(229,196,122,.12);border-radius:6px">⭐ グラウンドルールとして追加</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">ルールタイプ</div>` +
        `<div style="display:flex;flex-wrap:wrap;gap:5px">` +
          `<button onclick="setRuleType('keyword')"     id="rt-keyword"     style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--accent);color:var(--on-accent);border:1px solid var(--accent)">キーワード</button>` +
          `<button onclick="setRuleType('and')"         id="rt-and"         style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">AND条件</button>` +
          `<button onclick="setRuleType('not')"         id="rt-not"         style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">NOT条件</button>` +
          `<button onclick="setRuleType('conflict')"    id="rt-conflict"    style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">競合解決</button>` +
          `<button onclick="setRuleType('pos_implies')" id="rt-pos_implies" style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">継承</button>` +
          `<button onclick="setRuleType('default')"     id="rt-default"     style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;background:var(--surface);color:var(--text2);border:1px solid var(--border)">デフォルト</button>` +
        `</div></div>` +
      `<div id="rfields-keyword">` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワード（タイトルに含む）</div>` +
          `<input id="rule-condition" type="text" placeholder="例: kimura, 木村" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>` +
            `<select id="rule-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>` +
            `<select id="rule-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="add">追加</option><option value="replace">置換</option><option value="remove">削除</option></select></div></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>` +
          `<input id="rule-value" type="text" placeholder="例: フィニッシュ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
      `</div>` +
      `<div id="rfields-and" style="display:none">` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワードA（必須）</div>` +
          `<input id="rule-cond-a" type="text" placeholder="例: guard" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワードB（必須）</div>` +
          `<input id="rule-cond-b" type="text" placeholder="例: sweep" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>` +
            `<select id="rule-and-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>` +
            `<select id="rule-and-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="add">追加</option><option value="replace">置換</option><option value="remove">削除</option></select></div></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>` +
          `<input id="rule-and-value" type="text" placeholder="例: スイープ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
      `</div>` +
      `<div id="rfields-not" style="display:none">` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">キーワード（含む）</div>` +
          `<input id="rule-not-cond" type="text" placeholder="例: guard" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">NOT キーワード（含まない）</div>` +
          `<input id="rule-not-excl" type="text" placeholder="例: pass" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>` +
            `<select id="rule-not-field" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="cat">カテゴリ</option><option value="pos">ポジション</option><option value="tags">タグ</option><option value="tb">TB</option></select></div>` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">アクション</div>` +
            `<select id="rule-not-action" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="add">追加</option><option value="remove">削除</option></select></div></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">値</div>` +
          `<input id="rule-not-value" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
      `</div>` +
      `<div id="rfields-conflict" style="display:none">` +
        `<div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(200,80,200,.08);border-radius:6px">同一フィールドで共存できない値の競合を解決します（例: トップとボトムは同時に存在できない）</div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>` +
          `<select id="rule-cf-field" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
            `<option value="tb">TB</option><option value="cat">カテゴリ</option><option value="pos">ポジション</option></select></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">この値がある場合</div>` +
          `<input id="rule-cf-ifval" type="text" placeholder="例: トップ" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">この値を削除する</div>` +
          `<input id="rule-cf-remove" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
      `</div>` +
      `<div id="rfields-pos_implies" style="display:none">` +
        `<div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(80,120,220,.08);border-radius:6px">あるフィールドの値が確定したとき、別のフィールドを自動設定します（例: ポジション → TB継承）</div>` +
        `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">条件フィールド</div>` +
            `<select id="rule-pi-iffield" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="pos">ポジション</option><option value="cat">カテゴリ</option><option value="tb">TB</option></select></div>` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">条件値</div>` +
            `<input id="rule-pi-ifval" type="text" placeholder="例: スパイダーガード" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div></div>` +
        `<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">設定フィールド</div>` +
            `<select id="rule-pi-thenfield" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
              `<option value="tb">TB</option><option value="pos">ポジション</option><option value="cat">カテゴリ</option></select></div>` +
          `<div style="flex:1;min-width:100px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">設定値</div>` +
            `<input id="rule-pi-thenval" type="text" placeholder="例: ボトム" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div></div>` +
      `</div>` +
      `<div id="rfields-default" style="display:none">` +
        `<div style="font-size:11px;color:var(--text3);margin-bottom:8px;padding:6px 8px;background:rgba(160,160,160,.08);border-radius:6px">全ルール適用後もフィールドが空なら、この値をデフォルトとして設定します</div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">フィールド</div>` +
          `<select id="rule-df-field" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;cursor:pointer">` +
            `<option value="tb">TB</option><option value="cat">カテゴリ</option><option value="pos">ポジション</option></select></div>` +
        `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">デフォルト値</div>` +
          `<input id="rule-df-value" type="text" placeholder="例: スタンディング" style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box"></div>` +
      `</div>` +
      `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">` +
        `<button onclick="toggleAddRuleForm()" style="background:var(--surface);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:6px 14px;border-radius:14px;cursor:pointer;font-family:inherit">キャンセル</button>` +
        `<button onclick="saveNewRule()" style="background:var(--accent);color:var(--on-accent);border:none;padding:6px 14px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">保存</button>` +
      `</div>` +
    `</div>` +

    // ── 内部タブバー ──
    `<div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:0">` +
      `<button onclick="switchAdminInner('tb')"  id="admin-inner-tab-tb"  style="${_tbStyle(true, 'var(--accent)')}">TB</button>` +
      `<button onclick="switchAdminInner('cat')" id="admin-inner-tab-cat" style="${_tbStyle(false,'var(--blue)')}">カテゴリ</button>` +
      `<button onclick="switchAdminInner('pos')" id="admin-inner-tab-pos" style="${_tbStyle(false,'var(--purple)')}">ポジション</button>` +
      `<button onclick="switchAdminInner('fb')"  id="admin-inner-tab-fb"  style="${_tbStyle(false,'var(--green)')}">💬 フィードバック</button>` +
    `</div>` +

    // ── TB パネル ──
    `<div id="admin-inner-panel-tb" style="padding-top:14px">` +
      _aliasBox('alias-inner-tb', tbAliasHtml) +
      _rulesBox('TB ルール', 'var(--accent)', byField.tb) +
    `</div>` +

    // ── カテゴリ パネル ──
    `<div id="admin-inner-panel-cat" style="display:none;padding-top:14px">` +
      // カテゴリ一覧
      `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden">` +
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)">` +
          `<div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--blue)">カテゴリ一覧</span>` +
          `<span style="font-size:11px;color:var(--text3);margin-left:6px">${catList.length}件</span></div>` +
          `<button onclick="document.getElementById('inner-cat-add-form').style.display=document.getElementById('inner-cat-add-form').style.display==='none'?'block':'none'" ` +
            `style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ カテゴリ追加</button>` +
        `</div>` +
        `<div id="inner-cat-add-form" style="display:none;background:var(--surface2);border-bottom:1px solid var(--border);padding:10px 14px">` +
          `<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">カテゴリ名</div>` +
          `<input id="inner-cat-new-ja" type="text" placeholder="例: 足関節" ` +
            `style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px">` +
          `<div style="display:flex;gap:8px;justify-content:flex-end">` +
            `<button onclick="document.getElementById('inner-cat-add-form').style.display='none'" ` +
              `style="background:var(--surface);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:5px 12px;border-radius:12px;cursor:pointer;font-family:inherit">キャンセル</button>` +
            `<button onclick="_addInnerCat()" ` +
              `style="background:var(--accent);color:var(--on-accent);border:none;padding:5px 12px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>` +
          `</div>` +
        `</div>` +
        `<div style="padding:4px 14px">${catItemsHtml}</div>` +
      `</div>` +
      _aliasBox('alias-inner-cat', catAliasHtml) +
      _rulesBox('カテゴリ ルール', 'var(--blue)', byField.cat) +
    `</div>` +

    // ── ポジション パネル ──
    `<div id="admin-inner-panel-pos" style="display:none;padding-top:14px">` +
      // ポジション一覧
      `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden">` +
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)">` +
          `<div><span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--purple)">ポジション一覧</span>` +
          `<span style="font-size:11px;color:var(--text3);margin-left:6px">${allPositions.length}件</span></div>` +
          `<button onclick="document.getElementById('inner-pos-add-form').style.display=document.getElementById('inner-pos-add-form').style.display==='none'?'block':'none'" ` +
            `style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ ポジション追加</button>` +
        `</div>` +
        `<div id="inner-pos-add-form" style="display:none;background:var(--surface2);border-bottom:1px solid var(--border);padding:10px 14px">` +
          `<div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">ポジション名</div>` +
          `<input id="inner-pos-new-ja" type="text" placeholder="例: ラッソーガード" ` +
            `style="width:100%;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px">` +
          `<div style="display:flex;gap:8px;justify-content:flex-end">` +
            `<button onclick="document.getElementById('inner-pos-add-form').style.display='none'" ` +
              `style="background:var(--surface);border:1px solid var(--border);color:var(--text2);font-size:11px;padding:5px 12px;border-radius:12px;cursor:pointer;font-family:inherit">キャンセル</button>` +
            `<button onclick="_addInnerPos()" ` +
              `style="background:var(--accent);color:var(--on-accent);border:none;padding:5px 12px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">追加</button>` +
          `</div>` +
        `</div>` +
        `<div style="padding:4px 14px">${posItemsHtml}</div>` +
      `</div>` +
      _aliasBox('alias-inner-pos', posAliasHtml) +
      _rulesBox('ポジション ルール', 'var(--purple)', byField.pos) +
    `</div>` +

    // ── フィードバック パネル ──
    `<div id="admin-inner-fb" style="display:none;padding-top:14px">` +
      `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">読み込み中...</div>` +
    `</div>`;

  // 直前にアクティブだったタブを復元（add/delete 後の再描画で位置を保持）
  if (_activeInnerTab && _activeInnerTab !== 'tb') {
    switchAdminInner(_activeInnerTab);
  }
}

// ── 内部タブ切り替え ──
export function switchAdminInner(field) {
  _activeInnerTab = field;
  const panelIds = { tb: 'admin-inner-panel-tb', cat: 'admin-inner-panel-cat', pos: 'admin-inner-panel-pos', fb: 'admin-inner-fb' };
  const colors   = { tb: 'var(--accent)', cat: 'var(--blue)', pos: 'var(--purple)', fb: 'var(--green)' };
  Object.keys(panelIds).forEach(f => {
    const p = document.getElementById(panelIds[f]);
    if (p) p.style.display = f === field ? '' : 'none';
    const tab = document.getElementById('admin-inner-tab-' + f);
    if (tab) {
      tab.style.color = f === field ? colors[f] : 'var(--text3)';
      tab.style.borderBottomColor = f === field ? colors[f] : 'transparent';
    }
  });
  if (field === 'fb') _renderFeedbackAdmin(document.getElementById('admin-inner-fb'));
}
window.switchAdminInner = switchAdminInner;

export function toggleAdminInnerAlias(id) {
  const body = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (!body || !icon) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  icon.textContent = open ? '▶ 表示' : '▼ 隠す';
}
window.toggleAdminInnerAlias = toggleAdminInnerAlias;

export function _addInnerCat() {
  const ja = document.getElementById('inner-cat-new-ja')?.value.trim();
  if (!ja) { window.toast?.('名前を入力してください'); return; }
  const dict = _getCategory();
  dict.push({ id: 't' + Date.now(), names: { ja, en: ja }, aliases: { ja: [], en: [] } });
  _saveCategory(dict);
  window.syncCatsFromStorage?.();
  _activeInnerTab = 'cat';
  _renderRules();
  window.toast?.('カテゴリを追加しました');
}
window._addInnerCat = _addInnerCat;

export function _deleteInnerCat(idx) {
  if (!confirm('このカテゴリを削除しますか？')) return;
  const dict = _getCategory();
  dict.splice(idx, 1);
  _saveCategory(dict);
  window.syncCatsFromStorage?.();
  _activeInnerTab = 'cat';
  _renderRules();
  window.toast?.('カテゴリを削除しました');
}
window._deleteInnerCat = _deleteInnerCat;

export function _addInnerPos() {
  const ja = document.getElementById('inner-pos-new-ja')?.value.trim();
  if (!ja) { window.toast?.('名前を入力してください'); return; }
  const positions = _getPositions();
  positions.push({ id: 'p' + Date.now(), names: { ja, en: ja }, group: 'other', aliases: { ja: [], en: [] } });
  _savePositions(positions);
  window.syncPositionsFromStorage?.();
  _activeInnerTab = 'pos';
  _renderRules();
  window.toast?.('ポジションを追加しました');
}
window._addInnerPos = _addInnerPos;

export function _deleteInnerPos(idx) {
  if (!confirm('このポジションを削除しますか？')) return;
  const positions = _getPositions();
  positions.splice(idx, 1);
  _savePositions(positions);
  window.syncPositionsFromStorage?.();
  _activeInnerTab = 'pos';
  _renderRules();
  window.toast?.('ポジションを削除しました');
}
window._deleteInnerPos = _deleteInnerPos;

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
  _pushToFirestore('tag_rules', rules);
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
