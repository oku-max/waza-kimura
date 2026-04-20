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
    { lv:0, name:'0回',    short:'0回',    min:0,  max:0,        color:'#8a94a3' },
    { lv:1, name:'1-4回',  short:'1-4回',  min:1,  max:4,        color:'#1971c2' },
    { lv:2, name:'5-14回', short:'5-14回', min:5,  max:14,       color:'#e8590c' },
    { lv:3, name:'15回以上',short:'15回以上',min:15, max:Infinity, color:'#6b3fd4' }
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
  window.vpCounterSectionHTML = function (id, opts) {
    const v = _findV(id);
    if (!v) return '';
    const fav = (opts && 'fav' in opts) ? opts.fav : v.fav;
    const p = v.practice || 0;
    const lastP = v.lastPracticed ? window.vpCntFormatAgo(v.lastPracticed) : '—';
    const month = _countThisMonth(v.practiceLog);
    const st = _streak(v.practiceLog);
    const pColor = '#e8590c';
    const btnS = `width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:13px;font-weight:700;color:var(--text2);padding:0;font-family:inherit`;
    const btnP = `width:24px;height:24px;border-radius:50%;border:none;background:var(--accent);cursor:pointer;font-size:13px;font-weight:700;color:var(--on-accent);padding:0;font-family:inherit`;
    const subTitle = `font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px`;
    const next = v.next || false;
    const status = (()=>{ const s=v.status; return s==='把握'?'理解':s==='習得中'?'練習中':s||'未着手'; })();
    const sMap = { '未着手':'s0', '理解':'s1', '練習中':'s2', 'マスター':'s3' };
    const sLabels = ['未着手','理解','練習中','マスター'];
    const sNum    = {'未着手':'1.','理解':'2.','練習中':'3.','マスター':'4.'};
    const sIcons  = {'未着手':'📋','理解':'📖','練習中':'🔄','マスター':'⭐'};
    const statusChips = sLabels.map(s =>
      `<span class="vp-chip${status===s?' on-'+sMap[s]:''}" onclick="vpSetStatus('${id}','${s}',this)">${sNum[s]}${sIcons[s]} ${s}</span>`
    ).join('');
    // filterColVis による条件表示
    const _fcv      = window.filterColVis || {};
    const _showMark   = _fcv.mark   !== false;
    const _showStatus = _fcv.status !== false;
    const _showRank   = _fcv.rank   !== false;
    const favSec  = _showMark ? `
    <div style="flex:0 0 auto;padding-right:14px;border-right:1px solid var(--border)">
      <div style="${subTitle}">お気に入り</div>
      <span id="vp-fav-${id}" onclick="vpTogFav('${id}',this)" style="cursor:pointer;font-size:20px;color:${fav?'#d4a017':'var(--text3)'};font-weight:700" title="お気に入り">★</span>
    </div>
    <div style="flex:0 0 auto;padding-right:14px;${_showRank?'border-right:1px solid var(--border)':''}">
      <div style="${subTitle}">Next</div>
      <span id="vp-next-${id}" onclick="vpTogNext('${id}',this)" style="cursor:pointer;font-size:16px;font-weight:700" title="Next">${next?'🎯':'○'}</span>
    </div>` : '';
    const cntSec  = _showRank ? `
    <div style="flex:1;min-width:0">
      <div style="${subTitle}">カウンター</div>
      <div style="display:flex;align-items:center;gap:10px">
        <button onclick="vpCntDec('${id}','practice')" style="${btnS}">−</button>
        <span id="vp-cnt-p-${id}" style="font-size:18px;font-weight:800;color:${pColor};min-width:28px;text-align:center;font-variant-numeric:tabular-nums">${p}</span>
        <button onclick="vpCntInc('${id}','practice')" style="${btnP}">＋</button>
      </div>
      <div id="vp-cnt-p-sub-${id}" style="font-size:10px;color:var(--text3);margin-top:6px">最終: <b style="color:${pColor}">${lastP}</b>${month>0?` · 今月 ${month}回`:''}${st>1?` · 連続 ${st}日 🔥`:''}</div>
    </div>` : '';
    const statusSec = _showStatus ? `
  <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
    <div style="${subTitle}">習得度</div>
    <div class="vp-chips" id="vp-status-chips-${id}">${statusChips}</div>
  </div>` : '';
    const topRow = (favSec || cntSec) ? `<div style="display:flex;gap:14px;align-items:flex-start">${favSec}${cntSec}</div>` : '';
    if (!topRow && !statusSec) return `<div id="vp-cnt-sec-${id}"></div>`;
    return `
<div class="fsec" id="vp-cnt-sec-${id}">
  ${topRow}${statusSec}
</div>`;
  };

  // ── 内部: 再描画 ──
  function _rerender(id) {
    const v = _findV(id);
    if (!v) return;
    const pEl = document.getElementById('vp-cnt-p-' + id);
    const pSub = document.getElementById('vp-cnt-p-sub-' + id);
    if (pEl) pEl.textContent = v.practice || 0;
    if (pSub) {
      const lastP = v.lastPracticed ? window.vpCntFormatAgo(v.lastPracticed) : '—';
      const month = _countThisMonth(v.practiceLog);
      const st = _streak(v.practiceLog);
      pSub.innerHTML = `最終: <b style="color:#e8590c">${lastP}</b>${month>0?` · 今月 ${month}回`:''}${st>1?` · 連続 ${st}日 🔥`:''}`;
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

  // ── 習得度 設定 ──
  window.vpSetStatus = function (id, val, el) {
    const v = _findV(id);
    if (!v) return;
    v.status = val;
    const container = document.getElementById('vp-status-chips-' + id);
    if (container) {
      const sMap = { '未着手':'s0', '理解':'s1', '練習中':'s2', 'マスター':'s3' };
      container.querySelectorAll('.vp-chip').forEach(c => {
        c.className = 'vp-chip';
        const label = c.textContent.trim();
        if (label === val) c.classList.add('on-' + sMap[val]);
      });
    }
    _debouncedSave();
    window.toast?.(`習得度を「${val}」に設定しました`);
  };

  // 視聴カウント機能は廃止 (練習回数のみで管理)
  window.vpCntTrackView     = function () {};
  window.vpCntCancelView    = function () {};
  window.vpCntReportProgress = function () {};
  window.vpCntResetProgress  = function () {};
})();
