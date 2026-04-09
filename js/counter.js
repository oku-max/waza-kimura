// ═══ WAZA KIMURA — 練習/視聴 カウンター (Step1: データ+vpanel UI) ═══
// Fields on video object:
//   practice: number      (手動 +/-)
//   practiceLog: number[] (timestamps, ms)
//   lastPracticed: number (ms)
//   views: number         (自動)
//   lastViewed: number    (ms)
(function () {
  'use strict';

  function _findV(id) { return (window.videos || []).find(v => v.id === id); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ── 経過日数フォーマット ──
  // ── 進捗ランク (練習回数から自動導出) ──
  const RANKS = [
    { lv:0, name:'🆕 未着手', short:'未着手', min:0,  max:0,  color:'#8a94a3' },
    { lv:1, name:'🔰 練習中', short:'練習中', min:1,  max:4,  color:'#1971c2' },
    { lv:2, name:'🥋 習得中', short:'習得中', min:5,  max:14, color:'#e8590c' },
    { lv:3, name:'⭐ マスター', short:'マスター', min:15, max:Infinity, color:'#6b3fd4' }
  ];
  window.RANK_DEFS = RANKS;
  window.vpCntRank = function (practice) {
    const p = practice || 0;
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (p >= RANKS[i].min) return RANKS[i];
    }
    return RANKS[0];
  };

  window.vpCntFormatAgo = function (ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const d = Math.floor(diff / 86400000);
    if (d <= 0) return '今日';
    if (d === 1) return '昨日';
    if (d < 7) return d + 'd前';
    if (d < 30) return Math.floor(d / 7) + 'w前';
    if (d < 365) return Math.floor(d / 30) + 'mo前';
    return Math.floor(d / 365) + 'y前';
  };

  // ── 同一日付けカウント (今月、連続日数) ──
  function _countThisMonth(log) {
    if (!Array.isArray(log)) return 0;
    const now = new Date();
    const ym = now.getFullYear() * 12 + now.getMonth();
    return log.filter(ts => {
      const d = new Date(ts);
      return d.getFullYear() * 12 + d.getMonth() === ym;
    }).length;
  }
  function _streak(log) {
    if (!Array.isArray(log) || !log.length) return 0;
    // ユニーク日 (YYYY-MM-DD) を降順に
    const days = [...new Set(log.map(ts => {
      const d = new Date(ts);
      return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    }))].sort().reverse();
    if (!days.length) return 0;
    const today = new Date();
    const todayKey = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();
    const yestKey  = (() => { const y = new Date(today); y.setDate(y.getDate()-1); return y.getFullYear()+'-'+y.getMonth()+'-'+y.getDate(); })();
    if (days[0] !== todayKey && days[0] !== yestKey) return 0;
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      const [y1,m1,d1] = days[i-1].split('-').map(Number);
      const [y2,m2,d2] = days[i].split('-').map(Number);
      const t1 = new Date(y1,m1,d1).getTime();
      const t2 = new Date(y2,m2,d2).getTime();
      if (t1 - t2 === 86400000) streak++;
      else break;
    }
    return streak;
  }

  // ── vpanel 内カウンターセクション HTML ──
  window.vpCounterSectionHTML = function (id) {
    const v = _findV(id);
    if (!v) return '';
    const p = v.practice || 0;
    const vw = v.views || 0;
    const lastP = v.lastPracticed ? window.vpCntFormatAgo(v.lastPracticed) : '—';
    const lastV = v.lastViewed ? window.vpCntFormatAgo(v.lastViewed) : '—';
    const month = _countThisMonth(v.practiceLog);
    const st = _streak(v.practiceLog);
    const pColor = '#e8590c', vColor = '#1971c2';
    const rank = window.vpCntRank(p);
    const next = RANKS[rank.lv + 1];
    const rbFill = next ? Math.min(100, Math.round((p - rank.min) / (next.min - rank.min) * 100)) : 100;
    const rbMsg = next
      ? `${p} / ${next.min} 回 — 次: <b style="color:${next.color}">${next.name}</b> まで あと <b>${next.min - p}</b> 回`
      : `${p} 回 — 最高ランク到達！ 🏆`;
    return `
<div class="fsec" id="vp-cnt-sec-${id}">
  <div class="fsec-title">🥋 カウンター</div>
  <div id="vp-cnt-rank-${id}" style="margin:6px 0 8px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <div style="font-size:13px;font-weight:800;color:${rank.color}">${rank.name} (LV.${rank.lv})</div>
      <div style="font-size:10px;color:var(--text3);font-weight:600">${next ? `次: ${next.name}` : '🏆 MAX'}</div>
    </div>
    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${rbFill}%;background:linear-gradient(90deg,${rank.color},${next?next.color:rank.color});border-radius:4px;transition:width .3s"></div>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:6px;text-align:center;font-weight:600">${rbMsg}</div>
  </div>
  <div style="display:flex;gap:10px;padding:6px 0">
    <div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
      <div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.4px;margin-bottom:6px">🥋 練習回数</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <button onclick="vpCntDec('${id}','practice')" style="width:32px;height:32px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);cursor:pointer;font-size:16px;font-weight:700;color:var(--text2);font-family:inherit">−</button>
        <div id="vp-cnt-p-${id}" style="font-size:22px;font-weight:800;color:${pColor};min-width:32px;text-align:center;font-variant-numeric:tabular-nums">${p}</div>
        <button onclick="vpCntInc('${id}','practice')" style="width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);cursor:pointer;font-size:16px;font-weight:700;color:#fff;font-family:inherit">+</button>
      </div>
      <div id="vp-cnt-p-sub-${id}" style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.4">
        最終: <b style="color:${pColor}">${lastP}</b>${month>0?` · 今月 ${month}回`:''}${st>1?` · 連続 ${st}日 🔥`:''}
      </div>
    </div>
    <div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">
      <div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.4px;margin-bottom:6px">👁 視聴回数</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;min-height:32px">
        <div id="vp-cnt-v-${id}" style="font-size:22px;font-weight:800;color:${vColor};font-variant-numeric:tabular-nums">${vw}</div>
      </div>
      <div id="vp-cnt-v-sub-${id}" style="font-size:10px;color:var(--text3);margin-top:6px">
        最終: <b style="color:${vColor}">${lastV}</b>
      </div>
    </div>
  </div>
</div>`;
  };

  // ── 内部: 再描画 ──
  function _rerender(id) {
    const v = _findV(id);
    if (!v) return;
    // ランクバー丸ごと置換
    const rb = document.getElementById('vp-cnt-rank-' + id);
    if (rb) {
      const p = v.practice || 0;
      const rank = window.vpCntRank(p);
      const next = RANKS[rank.lv + 1];
      const rbFill = next ? Math.min(100, Math.round((p - rank.min) / (next.min - rank.min) * 100)) : 100;
      const rbMsg = next
        ? `${p} / ${next.min} 回 — 次: <b style="color:${next.color}">${next.name}</b> まで あと <b>${next.min - p}</b> 回`
        : `${p} 回 — 最高ランク到達！ 🏆`;
      rb.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <div style="font-size:13px;font-weight:800;color:${rank.color}">${rank.name} (LV.${rank.lv})</div>
      <div style="font-size:10px;color:var(--text3);font-weight:600">${next ? `次: ${next.name}` : '🏆 MAX'}</div>
    </div>
    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${rbFill}%;background:linear-gradient(90deg,${rank.color},${next?next.color:rank.color});border-radius:4px;transition:width .3s"></div>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:6px;text-align:center;font-weight:600">${rbMsg}</div>`;
    }
    const pEl = document.getElementById('vp-cnt-p-' + id);
    const vEl = document.getElementById('vp-cnt-v-' + id);
    const pSub = document.getElementById('vp-cnt-p-sub-' + id);
    const vSub = document.getElementById('vp-cnt-v-sub-' + id);
    if (pEl) pEl.textContent = v.practice || 0;
    if (vEl) vEl.textContent = v.views || 0;
    if (pSub) {
      const lastP = v.lastPracticed ? window.vpCntFormatAgo(v.lastPracticed) : '—';
      const month = _countThisMonth(v.practiceLog);
      const st = _streak(v.practiceLog);
      pSub.innerHTML = `最終: <b style="color:#e8590c">${lastP}</b>${month>0?` · 今月 ${month}回`:''}${st>1?` · 連続 ${st}日 🔥`:''}`;
    }
    if (vSub) {
      const lastV = v.lastViewed ? window.vpCntFormatAgo(v.lastViewed) : '—';
      vSub.innerHTML = `最終: <b style="color:#1971c2">${lastV}</b>`;
    }
  }

  // ── 保存 (debounce) ──
  let _saveTimer = null;
  function _debouncedSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { window.saveUserData?.(); }, 1500);
  }

  // ── 練習 +/- ──
  window.vpCntInc = function (id, type) {
    const v = _findV(id);
    if (!v) return;
    if (type === 'practice') {
      v.practice = (v.practice || 0) + 1;
      v.practiceLog = Array.isArray(v.practiceLog) ? v.practiceLog : [];
      v.practiceLog.push(Date.now());
      v.lastPracticed = Date.now();
    }
    _rerender(id);
    _debouncedSave();
  };
  window.vpCntDec = function (id, type) {
    const v = _findV(id);
    if (!v) return;
    if (type === 'practice') {
      if (!v.practice || v.practice <= 0) return;
      v.practice -= 1;
      if (Array.isArray(v.practiceLog) && v.practiceLog.length) {
        v.practiceLog.pop();
        v.lastPracticed = v.practiceLog.length ? v.practiceLog[v.practiceLog.length - 1] : null;
      }
    }
    _rerender(id);
    _debouncedSave();
  };

  // ── 視聴自動カウント (openVPanel時に30秒タイマー) ──
  let _viewTimer = null;
  let _viewPendingId = null;
  window.vpCntTrackView = function (id) {
    // 前の保留をキャンセル
    if (_viewTimer) { clearTimeout(_viewTimer); _viewTimer = null; }
    _viewPendingId = id;
    _viewTimer = setTimeout(() => {
      const v = _findV(id);
      if (!v) return;
      v.views = (v.views || 0) + 1;
      v.lastViewed = Date.now();
      _rerender(id);
      _debouncedSave();
      _viewTimer = null;
      _viewPendingId = null;
    }, 30000); // 30秒以上パネルが開きっぱなしで+1
  };
  window.vpCntCancelView = function () {
    if (_viewTimer) { clearTimeout(_viewTimer); _viewTimer = null; _viewPendingId = null; }
  };
})();
