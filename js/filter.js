// ═══ WAZA KIMURA — フィルター（Library） ═══

// ── 基本フィルタートグル ──
export function togF(type, val, el) {
  window.filters[type].has(val)
    ? (window.filters[type].delete(val), el.classList.remove('active'))
    : (window.filters[type].add(val), el.classList.add('active'));
  window.AF();
}

export function togPlat(p) {
  window.filters.platform.has(p) ? window.filters.platform.delete(p) : window.filters.platform.add(p);
  const isYT = p === 'youtube';
  [isYT ? 'chip-yt' : 'chip-vimeo', isYT ? 'm-chip-yt' : 'm-chip-vimeo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', window.filters.platform.has(p));
  });
  window.AF();
}

export function togFav() {
  window.favOnly = !window.favOnly;
  ['chip-fav','m-chip-fav','fs-chip-fav2','fov-chip-fav'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.favOnly);
  });
  window.AF();
}

export function togUnw() {
  window.unwOnly = !window.unwOnly;
  ['chip-unw','m-chip-unw','fs-chip-unw2','fov-chip-unw'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.unwOnly);
  });
  window.AF();
}

export function togWatched() {
  window.watchedOnly = !window.watchedOnly;
  ['chip-watched','fs-chip-watched'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', window.watchedOnly);
  });
  window.AF();
}

export function clearAll() {
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  window.favOnly = false; window.unwOnly = false; window.watchedOnly = false;
  const si = document.getElementById('si'); if (si) si.value = '';
  const siPc = document.getElementById('si-pc'); if (siPc) siPc.value = '';
  window.syncFilterOvRows?.();
  document.querySelectorAll('[id^="fs-chip-"],[id^="chip-"],[id^="m-chip-"]').forEach(el => el.classList.remove('active'));
  window.renderTFC?.();
  window.AF?.();
}

// ── フィルタープリセット ──
export let filterPresets = JSON.parse(localStorage.getItem('wk_filterPresets') || '[]');
export let orgFilterPresets = filterPresets; // エイリアス（後方互換）

export function saveFilterPresets() {
  localStorage.setItem('wk_filterPresets', JSON.stringify(filterPresets));
}
export function saveOrgFilterPresets() {
  saveFilterPresets();
}

export function saveFilterPreset() {
  const name = document.getElementById('fov-save-name').value.trim();
  if (!name) { window.toast('条件名を入力してください'); return; }
  const snapshot = {
    name,
    filters: Object.fromEntries(Object.entries(window.filters).map(([k,v]) => [k,[...v]])),
    favOnly: window.favOnly, unwOnly: window.unwOnly, watchedOnly: window.watchedOnly
  };
  const idx = filterPresets.findIndex(p => p.name === name);
  if (idx >= 0) filterPresets[idx] = snapshot; else filterPresets.push(snapshot);
  saveFilterPresets();
  document.getElementById('fov-save-name').value = '';
  renderFilterPresets();
  window.toast('🔖 「' + name + '」を保存しました');
}

export function saveOrgFilterPreset() {
  const name = document.getElementById('org-fov-save-name').value.trim();
  if (!name) { window.toast('条件名を入力してください'); return; }
  const snapshot = {
    name,
    filters: Object.fromEntries(Object.entries(window.orgFilters).map(([k,v]) => [k,[...v]])),
    favOnly: window.orgFavOnly, unwOnly: window.orgUnwOnly
  };
  const idx = orgFilterPresets.findIndex(p => p.name === name);
  if (idx >= 0) orgFilterPresets[idx] = snapshot; else orgFilterPresets.push(snapshot);
  saveOrgFilterPresets();
  document.getElementById('org-fov-save-name').value = '';
  renderOrgFilterPresets();
  window.toast('🔖 「' + name + '」を保存しました');
}

export function loadFilterPreset(idx) {
  const p = filterPresets[idx]; if (!p) return;
  Object.keys(window.filters).forEach(k => window.filters[k].clear());
  const fs = p.filters || {};
  Object.keys(fs).forEach(k => { if (window.filters[k]) fs[k].forEach(v => window.filters[k].add(v)); });
  window.favOnly    = p.favOnly    || false;
  window.unwOnly    = p.unwOnly    || false;
  window.watchedOnly = p.watchedOnly || false;
  window.syncFilterOvRows?.();
  window.AF?.();
  window.closeFilterOverlay?.();
  window.toast('🔖 「' + p.name + '」を読み込みました');
}

export function deleteFilterPreset(idx) {
  const name = filterPresets[idx] ? filterPresets[idx].name : '';
  filterPresets.splice(idx, 1);
  saveFilterPresets();
  renderFilterPresets();
  window.toast('🗑 「' + name + '」を削除しました');
}

export function renderOrgFilterPresets() {
  renderFilterPresets();
}

export function loadOrgFilterPreset(idx) {
  const p = orgFilterPresets[idx]; if (!p) return;
  Object.keys(window.orgFilters).forEach(k => window.orgFilters[k].clear());
  const fs = p.filters || {};
  Object.keys(fs).forEach(k => { if (window.orgFilters[k]) fs[k].forEach(v => window.orgFilters[k].add(v)); });
  window.orgFavOnly = p.favOnly || false;
  window.orgUnwOnly = p.unwOnly || false;
  window.syncOrgFilterOvRows?.();
  window.renderOrg?.();
  window.closeOrgFilterOverlay?.();
  window.toast('🔖 「' + p.name + '」を読み込みました');
}

export function deleteOrgFilterPreset(i) {
  deleteFilterPreset(i);
}

export function renderFilterPresets() {
  const targets = ['fs-saved-list','org-fs-saved-list','fov-preset-list','org-fov-preset-list']
    .map(id => document.getElementById(id)).filter(Boolean);
  targets.forEach(function(list) {
    if (!filterPresets.length) {
      list.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:4px 0">保存した検索条件はありません</div>';
      return;
    }
    list.innerHTML = filterPresets.map(function(p, i) {
      const count = (window.videos||[]).filter(function(v) {
        if (v.archived) return false;
        if (p.favOnly && !v.fav) return false;
        if (p.unwOnly && v.watched) return false;
        if (p.watchedOnly && !v.watched) return false;
        const fs = p.filters || {};
        if (fs.platform && fs.platform.length && !fs.platform.includes(v.pt)) return false;
        if (fs.playlist && fs.playlist.length && !fs.playlist.includes(v.pl)) return false;
        if (fs.prio && fs.prio.length && !fs.prio.includes(v.prio)) return false;
        if (fs.status && fs.status.length && !fs.status.includes(v.status)) return false;
        if (fs.tb && fs.tb.length && !v.tb.some(t => fs.tb.includes(t))) return false;
        if (fs.action && fs.action.length && !v.ac.some(a => fs.action.includes(a))) return false;
        if (fs.position && fs.position.length && !v.pos.some(x => fs.position.includes(x))) return false;
        if (fs.tech && fs.tech.length && !v.tech.some(t => fs.tech.includes(t))) return false;
        if (fs.channel && fs.channel.length && !fs.channel.includes(v.ch)) return false;
        return true;
      }).length;
      const badge = '<span style="font-size:9px;background:var(--accent);color:#fff;border-radius:8px;padding:1px 6px;margin-left:5px;font-weight:700">'+count+'</span>';
      return '<div class="chip" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-bottom:3px;max-width:100%">'
        + '<span onclick="loadFilterPreset('+i+')" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">'+p.name+badge+'</span>'
        + '<span style="color:var(--text3);font-size:12px;flex-shrink:0;padding-left:4px" onclick="deleteFilterPreset('+i+')">×</span>'
        + '</div>';
    }).join('');
  });
}

export function resetFilters() { clearAll(); }

export function updateResetBtn() {
  const btn = document.getElementById('filter-reset-btn'); if (!btn) return;
  const active = Object.values(window.filters).some(s => s.size > 0) || window.favOnly || window.unwOnly || window.watchedOnly;
  btn.style.display = active ? 'inline-block' : 'none';
}

// ── フィルタリング本体 ──
export function filt(list) {
  const siEl   = document.getElementById('si');
  const siPcEl = document.getElementById('si-lib-pc');
  const q = ((siEl ? siEl.value : '') || (siPcEl ? siPcEl.value : '')).toLowerCase();
  return list.filter(v => {
    if (v.archived) return false;
    if (window.favOnly && !v.fav) return false;
    if (window.unwOnly && v.watched) return false;
    if (window.watchedOnly && !v.watched) return false;
    if (window.filters.platform.size && !window.filters.platform.has(v.pt)) return false;
    if (q && !v.title.toLowerCase().includes(q) && !v.ch.toLowerCase().includes(q) && !v.pl.toLowerCase().includes(q) && !v.tech.some(t => t.toLowerCase().includes(q))) return false;
    if (window.filters.playlist.size && !window.filters.playlist.has(v.pl)) return false;
    if (window.filters.prio.size && !window.filters.prio.has(v.prio)) return false;
    if (window.filters.status.size && !window.filters.status.has(v.status)) return false;
    if (window.filters.tb.size && !v.tb.some(t => window.filters.tb.has(t))) return false;
    if (window.filters.action.size && !v.ac.some(a => window.filters.action.has(a))) return false;
    if (window.filters.position.size && !v.pos.some(p => window.filters.position.has(p))) return false;
    if (window.filters.tech.size && !v.tech.some(t => window.filters.tech.has(t))) return false;
    if (window.filters.channel.size && !window.filters.channel.has(v.ch)) return false;
    return true;
  });
}

// ── カウントヘルパー ──
export function countByField(field, val) {
  return (window.videos||[]).filter(v => !v.archived && (v[field]||[]).includes(val)).length;
}
export function countByPl(pl) {
  return (window.videos||[]).filter(v => !v.archived && v.pl === pl).length;
}
export function countByCh(ch) {
  return (window.videos||[]).filter(v => !v.archived && v.ch === ch).length;
}
export function cntBadge(n) {
  if (!n) return '';
  return `<span style="font-size:9px;background:var(--surface3);color:var(--text3);border-radius:8px;padding:1px 5px;margin-left:4px;font-weight:600">${n}</span>`;
}

// ── AF（Apply Filters）：全体再描画 ──
export function AF() {
  const f = filt(window.videos);
  window.renderCards(f, 'cardList');
  const total = (window.videos||[]).filter(v => !v.archived).length;
  const rc = document.getElementById('rc'); if (rc) rc.textContent = f.length + ' 本 表示中';
  const rct = document.getElementById('rc-topbar');
  if (rct) {
    const hasFilter = Object.values(window.filters).some(s => s.size > 0) || window.favOnly || window.unwOnly || window.watchedOnly || document.getElementById('si').value.trim();
    rct.textContent = f.length + ' 件';
    rct.style.display = hasFilter ? 'inline' : 'none';
  }
  const fhn = document.getElementById('fov-hit-num'); if (fhn) fhn.textContent = f.length;
  const fhb = document.getElementById('fov-hit-badge'); if (fhb) fhb.textContent = f.length + ' 件';
  const tc = document.getElementById('totalCount'); if (tc) tc.textContent = total + ' videos';
  const sc = document.getElementById('snav-cnt'); if (sc) sc.textContent = total;
  window.buildSrcRow?.('srow-src');
  window.buildPrioRow?.('srow-prio');
  window.buildStatRow?.('srow-stat');
  window.buildPlSrow?.();
  window.buildTechSrow?.();
  window.buildFsTbSrow?.();
  window.buildFsAcSrow?.();
  window.buildFsPlSrow?.();
  window.buildFsTechSrow?.();
  window.buildFsPosSrow?.();
  renderTFC();
  window.addSwipe?.();
  if (window.bulkMode) window.updBulk?.();
  updateResetBtn();
}

export function updatePLC() { window.buildPlSrow?.(); }

export function renderTFC() {
  const el = document.getElementById('techFC');
  if (el) el.innerHTML = [...window.filters.tech].map(t => `<div class="chip active" style="flex-shrink:0" onclick="rmTF('${t}')">${t} ×</div>`).join('');
}
export function rmTF(t) { window.filters.tech.delete(t); renderTFC(); window.AF?.(); }

export function openTF() {
  document.getElementById('tfs').value = '';
  renderTF();
  document.getElementById('tfOv').classList.add('open');
}

export function renderTF() {
  const q = document.getElementById('tfs').value.trim();
  const ql = q.toLowerCase();
  const allTech = [...new Set([...(window.TECH||[]), ...(window.videos||[]).flatMap(v => v.tech||[])])].sort();
  const matched = allTech.filter(t => !ql || t.toLowerCase().includes(ql));
  const container = document.getElementById('tfR');
  container.innerHTML = '';
  matched.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tech-pill' + (window.filters.tech.has(t) ? ' active' : '');
    const n = countByField('tech', t);
    el.innerHTML = t + cntBadge(n);
    el.addEventListener('click', function() {
      window.filters.tech.has(t) ? window.filters.tech.delete(t) : window.filters.tech.add(t);
      el.classList.toggle('active');
      window.buildTechSrow?.(); window.buildFsTechSrow?.();
      try { window.buildFovRows?.(); } catch(e) {}
      renderTFC(); window.AF?.();
    });
    container.appendChild(el);
  });
  if (q && !allTech.some(t => t.toLowerCase() === ql)) {
    const el = document.createElement('div');
    el.className = 'tech-pill';
    el.style.cssText = 'border-style:dashed;color:var(--accent)';
    el.textContent = '＋ 「' + q + '」を追加';
    el.onclick = function() {
      window.filters.tech.add(q);
      window.buildTechSrow?.(); window.buildFsTechSrow?.();
      try { window.buildFovRows?.(); } catch(e) {}
      renderTFC(); window.AF?.();
      document.getElementById('tfs').value = ''; renderTF();
      window.closeOv?.('tfOv');
    };
    container.appendChild(el);
  }
  if (!matched.length && !q) container.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px">タグなし</div>';
}

export function openPL() {
  document.getElementById('pls').value = '';
  renderPL();
  document.getElementById('plOv').classList.add('open');
}

export function renderPL() {
  const q = document.getElementById('pls').value.toLowerCase();
  const pls = [...new Set((window.videos||[]).filter(v => !v.archived).map(v => v.pl))];
  const container = document.getElementById('plR');
  const filtered = pls.filter(p => !q || p.toLowerCase().includes(q));
  if (!filtered.length) { container.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px">該当なし</div>'; return; }
  container.innerHTML = '';
  filtered.forEach(p => {
    const el = document.createElement('div');
    el.className = 'tech-pill' + (window.filters.playlist.has(p) ? ' active' : '');
    const n = countByPl(p);
    el.innerHTML = p + cntBadge(n);
    el.addEventListener('click', function() {
      window.filters.playlist.has(p) ? window.filters.playlist.delete(p) : window.filters.playlist.add(p);
      el.classList.toggle('active');
      window.buildPlSrow?.(); try { window.buildFovRows?.(); } catch(e) {} window.AF?.();
    });
    container.appendChild(el);
  });
}
