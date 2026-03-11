// ═══ WAZA KIMURA — 一括編集（Bulk） ═══

export let bulkUndoStack = [];
export let activeBulkPicker = null;
let _bulkPlMode = null;

// ── Bulk VPanel ──
export function openBulkVPanel() {
  if (!window.selIds.size) { window.toast('動画を選択してください'); return; }
  const panel = document.getElementById('bulk-vpanel');
  const body  = document.getElementById('bulk-vpanel-body');
  const sub   = document.getElementById('bulk-vpanel-subtitle');
  if (!panel || !body) return;
  if (sub) sub.textContent = window.selIds.size + '本の動画を編集中';
  body.innerHTML = buildBulkDrawerHTML();
  body.querySelectorAll('.vp-tech-rm').forEach(el => { el.onclick = function(){ bvpRemoveTag('tech', this); }; });
  body.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function(){ bvpRemoveTag('pos',  this); }; });
  panel.classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeBulkVPanel() {
  const panel = document.getElementById('bulk-vpanel');
  if (panel) panel.classList.remove('show');
  document.body.style.overflow = '';
}

export function buildBulkDrawerHTML() {
  const TB_OPTS  = ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'];
  const AC_OPTS  = ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル'];
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const vids = window.videos || [];
  const POS_ALL  = [...new Set([...POS_BASE, ...vids.flatMap(v => v.pos||[])])].sort();
  const TECH_ALL = [...new Set(vids.flatMap(v => v.tech||[]))].sort();

  const selVids   = [...window.selIds].map(id => vids.find(v => v.id===id)).filter(Boolean);
  const commonPos  = POS_ALL.filter(p  => selVids.every(v => (v.pos||[]).includes(p)));
  const commonTech = TECH_ALL.filter(t => selVids.every(v => (v.tech||[]).includes(t)));

  const prioChips = ['今すぐ','そのうち','保留'].map((p, i) => {
    const cls   = ['on-p1','on-p2','on-p3'][i];
    const label = ['🔴 今すぐ','🟡 そのうち','⚪ 保留'][i];
    return `<span class="vp-chip" onclick="bvpSet('prio','${p}',this,'${cls}')">${label}</span>`;
  }).join('');

  const progChips = ['未着手','練習中','マスター'].map((s, i) => {
    const cls   = ['on-s0','on-s1','on-s2'][i];
    const label = ['📋 未着手','🔵 練習中','✅ マスター'][i];
    return `<span class="vp-chip" onclick="bvpSet('status','${s}',this,'${cls}')">${label}</span>`;
  }).join('');

  const tbChips   = TB_OPTS.map(t  => `<span class="vp-chip" onclick="bvpToggle('tb','${t}',this,'on-tb')">${t}</span>`).join('');
  const acChips   = AC_OPTS.map(a  => `<span class="vp-chip" onclick="bvpToggle('ac','${a}',this,'on-ac')">${a}</span>`).join('');
  const posChips  = commonPos.map(p  => `<span class="vp-chip on-pos vp-pos-rm" data-val="${p.replace(/"/g,'&quot;')}">${p} ×</span>`).join('');
  const techChips = commonTech.map(t => `<span class="vp-chip on-tech vp-tech-rm" data-val="${t.replace(/"/g,'&quot;')}">${t} ×</span>`).join('');

  return `
    <div class="vp-row">
      <span class="vp-lbl">Status</span>
      <div class="vp-chips">
        <span class="vp-chip" onclick="bvpToggleWatch(this)">👁 視聴済み</span>
        <span class="vp-chip" onclick="bvpToggleFav(this)">☆ Fav</span>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Progress</span>
      <div class="vp-chips" id="bvp-prog">${progChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Priority</span>
      <div class="vp-chips" id="bvp-prio">${prioChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">T / B</span>
      <div class="vp-chips" id="bvp-tb">${tbChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Action</span>
      <div class="vp-chips" id="bvp-ac">${acChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Position
        <span style="font-size:9px;font-weight:400;color:var(--text3);display:block;margin-top:2px">共通タグ表示・追加で全動画に一括追加</span>
      </span>
      <div class="vp-tech-wrap">
        <div class="vp-chips" id="bvp-pos">${posChips}</div>
        <div class="vp-tech-inp-row">
          <input class="vp-tech-inp" id="bvp-pos-inp" placeholder="ポジション名を入力..."
            oninput="bvpPosSuggest(this)" onfocus="bvpPosSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-pos-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpAddPos();event.preventDefault();}">
          <button class="vp-tech-add-btn" onclick="bvpAddPos()">＋</button>
        </div>
        <div class="vp-tech-suggest" id="bvp-pos-sug"></div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Technique
        <span style="font-size:9px;font-weight:400;color:var(--text3);display:block;margin-top:2px">共通タグ表示・追加で全動画に一括追加</span>
      </span>
      <div class="vp-tech-wrap">
        <div class="vp-chips" id="bvp-tech">${techChips}</div>
        <div class="vp-tech-inp-row">
          <input class="vp-tech-inp" id="bvp-tech-inp" placeholder="テクニック名を入力..."
            oninput="bvpTechSuggest(this)" onfocus="bvpTechSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-tech-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpAddTech();event.preventDefault();}">
          <button class="vp-tech-add-btn" onclick="bvpAddTech()">＋</button>
        </div>
        <div class="vp-tech-suggest" id="bvp-tech-sug"></div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Playlist</span>
      <div class="vp-chips">
        <span class="vp-chip" onclick="openBulkPlOp('move')">↪ 移動</span>
        <span class="vp-chip" onclick="openBulkPlOp('copy')">⧉ コピー</span>
        <span class="vp-chip" style="color:var(--red)" onclick="bulkPlRemove()">✕ 削除</span>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">その他</span>
      <div class="vp-chips">
        <span class="vp-chip" onclick="bulkDo('watched')">👁 視聴済みにする</span>
        <span class="vp-chip" onclick="bulkDo('unwatched')">👁 未視聴にする</span>
        <span class="vp-chip" onclick="bulkDo('fav-add')">★ Fav追加</span>
        <span class="vp-chip" onclick="bulkDo('fav-remove')">☆ Fav解除</span>
        <span class="vp-chip" style="color:var(--purple)" onclick="bulkDo('archive')">📦 Archive</span>
      </div>
    </div>
    <div style="height:40px"></div>
  `;
}

// ── BVP操作 ──
export function bvpSet(field, val, el, onClass) {
  bulkSnapshot();
  const ids = [...window.selIds];
  const f = field === 'prio' ? 'prio' : field === 'status' ? 'status' : field;
  ids.forEach(id => { const v = (window.videos||[]).find(v => v.id===id); if (v) v[f] = val; });
  const rowId = field === 'prio' ? 'bvp-prio' : 'bvp-prog';
  document.querySelectorAll('#' + rowId + ' .vp-chip').forEach(c =>
    ['on-p1','on-p2','on-p3','on-s0','on-s1','on-s2'].forEach(cl => c.classList.remove(cl))
  );
  el.classList.add(onClass);
  window.toast(window.selIds.size + '本に「' + val + '」を設定');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggle(field, val, el, onClass) {
  bulkSnapshot();
  const isOn = el.classList.contains(onClass);
  const ids  = [...window.selIds];
  ids.forEach(id => {
    const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
    const arr = v[field]||[];
    if (isOn) v[field] = arr.filter(x => x!==val);
    else if (!arr.includes(val)) v[field] = [...arr, val];
  });
  el.classList.toggle(onClass, !isOn);
  window.toast((isOn ? '削除: ' : '追加: ') + '「' + val + '」 → ' + window.selIds.size + '本');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggleWatch(el) {
  bulkSnapshot();
  const ids  = [...window.selIds];
  const vids = ids.map(id => (window.videos||[]).find(v => v.id===id)).filter(Boolean);
  const setTo = vids.filter(v => v.watched).length < vids.length / 2;
  vids.forEach(v => v.watched = setTo);
  el.textContent = setTo ? '✅ 視聴済み' : '👁 未視聴';
  el.classList.toggle('on-s1', setTo);
  window.toast(window.selIds.size + '本を' + (setTo ? '視聴済み' : '未視聴') + 'に設定');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggleFav(el) {
  bulkSnapshot();
  const ids  = [...window.selIds];
  const vids = ids.map(id => (window.videos||[]).find(v => v.id===id)).filter(Boolean);
  const setTo = vids.filter(v => v.fav).length < vids.length / 2;
  vids.forEach(v => v.fav = setTo);
  el.textContent = setTo ? '⭐ Fav' : '☆ Fav';
  el.classList.toggle('on-fav-chip', setTo);
  window.toast(window.selIds.size + '本をFav' + (setTo ? '追加' : '解除'));
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpRemoveTag(field, el) {
  bulkSnapshot();
  const val = el.dataset.val;
  const ids = [...window.selIds];
  ids.forEach(id => {
    const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
    v[field] = (v[field]||[]).filter(x => x!==val);
  });
  el.remove();
  window.toast(window.selIds.size + '本から「' + val + '」を削除');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpAddPos() {
  const inp = document.getElementById('bvp-pos-inp'); if (!inp) return;
  const val = inp.value.trim(); if (!val) return;
  bulkSnapshot();
  const ids = [...window.selIds]; let added = 0;
  ids.forEach(id => {
    const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
    if (!(v.pos||[]).includes(val)) { v.pos = [...(v.pos||[]), val]; added++; }
  });
  const row = document.getElementById('bvp-pos');
  if (row) {
    const chip = document.createElement('span');
    chip.className = 'vp-chip on-pos vp-pos-rm'; chip.dataset.val = val;
    chip.textContent = val + ' ×'; chip.onclick = function(){ bvpRemoveTag('pos', this); };
    row.appendChild(chip);
  }
  inp.value = '';
  const sug = document.getElementById('bvp-pos-sug'); if (sug) sug.innerHTML = '';
  window.toast(added + '本に「' + val + '」を追加');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpAddTech() {
  const inp = document.getElementById('bvp-tech-inp'); if (!inp) return;
  const val = inp.value.trim(); if (!val) return;
  bulkSnapshot();
  const ids = [...window.selIds]; let added = 0;
  ids.forEach(id => {
    const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
    if (!(v.tech||[]).includes(val)) { v.tech = [...(v.tech||[]), val]; added++; }
  });
  const row = document.getElementById('bvp-tech');
  if (row) {
    const chip = document.createElement('span');
    chip.className = 'vp-chip on-tech vp-tech-rm'; chip.dataset.val = val;
    chip.textContent = val + ' ×'; chip.onclick = function(){ bvpRemoveTag('tech', this); };
    row.appendChild(chip);
  }
  inp.value = '';
  const sug = document.getElementById('bvp-tech-sug'); if (sug) sug.innerHTML = '';
  window.toast(added + '本に「' + val + '」を追加');
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpPosSuggest(inp) {
  const q = inp.value.trim().toLowerCase();
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const all = [...new Set([...POS_BASE, ...(window.videos||[]).flatMap(v => v.pos||[])])].sort();
  const sug = document.getElementById('bvp-pos-sug'); if (!sug) return;
  const matches = q ? all.filter(p => p.toLowerCase().includes(q)) : all;
  sug.innerHTML = matches.slice(0,16).map(p =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-pos-inp').value='${p.replace(/'/g,"\\'")}';bvpAddPos()">${p}</span>`
  ).join('');
}

export function bvpTechSuggest(inp) {
  const q   = inp.value.trim().toLowerCase();
  const all = [...new Set((window.videos||[]).flatMap(v => v.tech||[]))].sort();
  const sug = document.getElementById('bvp-tech-sug'); if (!sug) return;
  const matches = q ? all.filter(t => t.toLowerCase().includes(q)) : all;
  sug.innerHTML = matches.slice(0,16).map(t =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-tech-inp').value='${t.replace(/'/g,"\\'")}';bvpAddTech()">${t}</span>`
  ).join('');
}

// ── enterBulk / exitBulk ──
export function enterBulk(ctx = 'home', preserveSel = false) {
  window.bulkMode = true; window.bulkCtx = ctx;
  if (!preserveSel) window.selIds.clear();
  bulkUndoStack = [];
  document.getElementById('bulkBar').classList.add('show');
  const sh = document.getElementById('sh'); if (sh) sh.style.display = 'none';
  const fsBtn = document.getElementById('fs-bulk-sel-btn');
  if (fsBtn) { fsBtn.textContent = '✕ 一括終了'; fsBtn.onclick = exitBulk; fsBtn.style.color = 'var(--accent)'; }
  if (ctx === 'organize') {
    const orgBtn = document.getElementById('org-bulk-btn'); if (orgBtn) orgBtn.style.display = 'none';
    if (!preserveSel) window.renderOrg?.();
  } else {
    window.AF?.();
  }
  window.buildBbPosRow?.();
  window.buildBbTechRow?.();
  updBulk();
}

export function bulkSnapshot() {
  bulkUndoStack.push((window.videos||[]).map(v => ({
    id: v.id, prio: v.prio, status: v.status, watched: v.watched, fav: v.fav,
    tb:  [...(v.tb||[])],  ac:  [...(v.ac||[])],
    pos: [...(v.pos||[])], tech:[...(v.tech||[])],
    pl: v.pl, archived: v.archived
  })));
}

export const BULK_PICKER_OPTS_BASE = {
  status: [{val:'watched',label:'視聴済み'},{val:'unwatched',label:'未視聴'},{val:'fav-add',label:'Fav 追加'},{val:'fav-remove',label:'Fav 解除'}],
  prio:   [{val:'今すぐ',label:'今すぐ'},{val:'そのうち',label:'そのうち'},{val:'保留',label:'保留'}],
  prog:   [{val:'未着手',label:'未着手'},{val:'練習中',label:'練習中'},{val:'マスター',label:'マスター'}],
  tb:     [{val:'トップ',label:'トップ'},{val:'ボトム',label:'ボトム'},{val:'スタンディング',label:'スタンディング'},{val:'バック',label:'バック'},{val:'ハーフ',label:'ハーフ'},{val:'ドリル',label:'ドリル'}],
  ac:     [{val:'エスケープ・ディフェンス',label:'エスケープ・ディフェンス'},{val:'パスガード',label:'パスガード'},{val:'アタック',label:'アタック'},{val:'スイープ',label:'スイープ'},{val:'リテンション',label:'リテンション'},{val:'コントロール',label:'コントロール'},{val:'テイクダウン',label:'テイクダウン'},{val:'フィニッシュ',label:'フィニッシュ'},{val:'ドリル',label:'ドリル'}]
};

export function getBulkPickerOpts(type) {
  if (type !== 'pos') return BULK_PICKER_OPTS_BASE[type] || [];
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const all = [...new Set([...POS_BASE, ...(window.videos||[]).flatMap(v => v.pos||[])])].sort();
  return all.map(p => ({val: p, label: p}));
}

export function bulkUndo() {
  if (!bulkUndoStack.length) { window.toast('元に戻す履歴がありません'); return; }
  const snap = bulkUndoStack.pop();
  snap.forEach(s => { const v = (window.videos||[]).find(v => v.id===s.id); if (v) Object.assign(v, s); });
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.();
  resetBulkPickers(); window.toast('↩ 元に戻しました'); window.debounceSave?.();
}

export function resetBulkPickers() {
  document.querySelectorAll('#bulkBar .bb-chip').forEach(b => {
    b.classList.remove('bb-on','bb-on-tb','bb-on-ac','bb-on-pos','bb-on-tech');
  });
  document.querySelectorAll('.bb-panel-chip').forEach(b => b.classList.remove('bb-on'));
  document.querySelectorAll('.bb-panel.open').forEach(p => p.classList.remove('open'));
  ['pos','tech'].forEach(type => {
    const prev = document.getElementById('bb-' + type + '-preview');
    const cnt  = document.getElementById('bb-' + type + '-count');
    if (prev) prev.innerHTML = ''; if (cnt) cnt.textContent = '';
  });
}

export function exitBulk() {
  window.bulkMode = false; window.selIds.clear(); resetBulkPickers();
  document.getElementById('bulkBar').classList.remove('show');
  document.getElementById('sh').style.display = '';
  closeBulkVPanel();
  const fsBtn = document.getElementById('fs-bulk-sel-btn');
  if (fsBtn) { fsBtn.textContent = '☑ 一括編集'; fsBtn.onclick = () => enterBulk(); fsBtn.style.color = 'var(--accent)'; }
  if (window.bulkCtx === 'organize') {
    const selAllCb = document.getElementById('org-sel-all'); if (selAllCb) selAllCb.checked = false;
    const orgBtn   = document.getElementById('org-bulk-btn'); if (orgBtn) orgBtn.style.display = '';
    window.renderOrg?.();
  } else {
    window.AF?.();
  }
}

export function togSel(id) {
  window.selIds.has(id) ? window.selIds.delete(id) : window.selIds.add(id);
  const c = document.getElementById(`sel-${id}`)?.querySelector('.sel-circle');
  if (c) { c.classList.toggle('chk', window.selIds.has(id)); c.textContent = window.selIds.has(id) ? '✓' : ''; }
  updBulk();
}

export function orgRowClick(event, id) {}

export function orgTogSel(id, cb) {
  if (cb.checked && !window.bulkMode) {
    window.selIds.add(id);
    enterBulk('organize', true);
    const rowCb = document.getElementById('org-cb-' + id); if (rowCb) rowCb.checked = true;
    const total = document.querySelectorAll('[id^="org-row-"]').length;
    const selAllCb = document.getElementById('org-sel-all');
    if (selAllCb) selAllCb.checked = window.selIds.size === total && total > 0;
    updBulk(); return;
  }
  cb.checked ? window.selIds.add(id) : window.selIds.delete(id);
  const total = document.querySelectorAll('[id^="org-row-"]').length;
  const selAllCb = document.getElementById('org-sel-all');
  if (selAllCb) selAllCb.checked = window.selIds.size === total && total > 0;
  updBulk();
}

export function orgTogSelAll(cb) {
  document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
    const id = tr.id.replace('org-row-', '');
    cb.checked ? window.selIds.add(id) : window.selIds.delete(id);
    const rowCb = tr.querySelector('input[type=checkbox]'); if (rowCb) rowCb.checked = cb.checked;
  });
  if (cb.checked && window.selIds.size > 0 && !window.bulkMode) {
    enterBulk('organize', true);
  } else if (!cb.checked) {
    window.selIds.clear(); updBulk();
  } else {
    updBulk();
  }
}

export function updBulk() {
  document.getElementById('bulkTit').textContent = window.selIds.size + '本を選択中';
  const btn = document.getElementById('bulk-sel-btn');
  if (btn) btn.textContent = window.bulkMode && window.selIds.size > 0 ? '☑ ' + window.selIds.size + ' 選択中' : '☑ Select';
  const editBtn = document.getElementById('bulk-edit-vpanel-btn');
  if (editBtn) {
    const has = window.selIds.size > 0;
    editBtn.style.opacity = has ? '1' : '0.4';
    editBtn.style.pointerEvents = has ? 'auto' : 'none';
  }
  if (window.bulkCtx === 'organize') {
    document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
      const id = tr.id.replace('org-row-', '');
      tr.style.background = window.selIds.has(id) ? 'var(--surface2)' : '';
    });
  }
}

export function selAll() {
  if (window.bulkCtx === 'organize') {
    document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
      const id = tr.id.replace('org-row-', '');
      window.selIds.add(id);
      const cb = tr.querySelector('input[type=checkbox]'); if (cb) cb.checked = true;
    });
    const selAllCb = document.getElementById('org-sel-all'); if (selAllCb) selAllCb.checked = true;
  } else {
    const f = window.filt(window.videos||[]); f.forEach(v => window.selIds.add(v.id)); window.AF?.();
  }
  updBulk();
}

export function selNone() {
  window.selIds.clear();
  if (window.bulkCtx === 'organize') {
    document.querySelectorAll('[id^="org-row-"] input[type=checkbox]').forEach(cb => cb.checked = false);
    const selAllCb = document.getElementById('org-sel-all'); if (selAllCb) selAllCb.checked = false;
    updBulk();
  } else {
    window.AF?.(); updBulk();
  }
}

export function bulkSetPrio(val) {
  bulkSnapshot();
  const ids = [...window.selIds];
  ids.forEach(id => { const v = (window.videos||[]).find(v => v.id===id); if (v) v.prio = val; });
  window.AF?.(); window.toast('✅ ' + ids.length + '本 → Priority: ' + val);
}

export function bulkSetProg(val) {
  bulkSnapshot();
  const ids = [...window.selIds];
  ids.forEach(id => { const v = (window.videos||[]).find(v => v.id===id); if (v) v.status = val; });
  window.AF?.(); window.toast('✅ ' + ids.length + '本 → Progress: ' + val);
}

export function bulkTogTag(field, val) {
  bulkSnapshot();
  const ids = [...window.selIds]; let added = 0, removed = 0;
  ids.forEach(id => {
    const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
    const arr = v[field]||[];
    if (arr.includes(val)) { v[field] = arr.filter(x => x!==val); removed++; }
    else { v[field] = [...arr, val]; added++; }
  });
  window.toast((added ? '＋' + added + '本に追加 ' : '') + (removed ? '−' + removed + '本から除去 ' : '') + val);
  window.AF?.();
}

// ── Bulk Playlist Operations ──
export function openBulkPlOp(mode) {
  if (!window.selIds.size) { window.toast('動画を選択してください'); return; }
  _bulkPlMode = mode;
  window._vpPlOp = {id: null, mode: mode};

  const title = document.getElementById('vpPlOvTitle');
  const desc  = document.getElementById('vpPlOvDesc');
  const list  = document.getElementById('vpPlOvList');
  const inp   = document.getElementById('vpPlOvNew');
  const count = window.selIds.size;

  title.textContent = mode === 'move' ? `↪ プレイリストに移動（${count}本）` : `⧉ プレイリストにコピー（${count}本）`;
  desc.textContent  = mode === 'move' ? '選択した動画を移動先プレイリストに移動します' : '選択した動画を別のプレイリストにコピーします';
  inp.value = '';

  const pls = [...new Set((window.videos||[]).filter(v => !v.archived).map(v => v.pl))].sort();
  list.innerHTML = '';
  pls.forEach(p => {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;text-align:left;padding:7px 10px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;margin-bottom:2px;';
    btn.textContent = p;
    btn.onmouseover = () => { btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; };
    btn.onmouseout  = () => { btn.style.borderColor = 'var(--border)';  btn.style.color = 'var(--text)'; };
    btn.onclick = () => bulkPlConfirm(p);
    list.appendChild(btn);
  });

  document.getElementById('vpPlOvNew').onkeydown = function(e) { if (e.key === 'Enter') bulkPlConfirmNew(); };
  document.querySelector('#vpPlOv .btn-save').onclick = () => { window.closeOv?.('vpPlOv'); };
  document.getElementById('vpPlOv').classList.add('open');
}

export function bulkPlConfirm(targetPl) {
  const ids  = [...window.selIds];
  const mode = _bulkPlMode;
  if (mode === 'move') {
    ids.forEach(id => { const v = (window.videos||[]).find(v => v.id===id); if (v) v.pl = targetPl; });
    window.closeOv?.('vpPlOv'); window.AF?.();
    window.toast(`↪ ${ids.length}本を「${targetPl}」に移動しました`);
  } else {
    const copies = ids.map(id => {
      const v = (window.videos||[]).find(v => v.id===id); if (!v) return null;
      const copy = JSON.parse(JSON.stringify(v));
      copy.id = v.id + '_copy_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      copy.pl = targetPl;
      return copy;
    }).filter(Boolean);
    copies.forEach(c => window.videos.push(c));
    window.closeOv?.('vpPlOv'); window.AF?.();
    window.toast(`⧉ ${copies.length}本を「${targetPl}」にコピーしました`);
  }
}

export function bulkPlConfirmNew() {
  const val = document.getElementById('vpPlOvNew').value.trim();
  if (!val) { window.toast('プレイリスト名を入力してください'); return; }
  bulkPlConfirm(val);
}

export function bulkPlRemove() {
  if (!window.selIds.size) { window.toast('動画を選択してください'); return; }
  const ids = [...window.selIds];
  window.showConf?.('✕ プレイリストから削除', `${ids.length}本を「未分類」に移動します。`, () => {
    ids.forEach(id => { const v = (window.videos||[]).find(v => v.id===id); if (v) v.pl = '未分類'; });
    window.AF?.();
    window.toast(`✕ ${ids.length}本を未分類に移動しました`);
  });
}

export function resetVpPlModal() {
  const inp = document.getElementById('vpPlOvNew');
  if (inp) inp.onkeydown = function(e) { if (e.key === 'Enter') window.vpPlOvConfirmNew?.(); };
}

export function bulkDo(type) {
  if (!window.selIds.size) { window.toast('動画を選択してください'); return; }
  const ids = [...window.selIds];
  const vids = window.videos || [];
  if (type === 'watched')    { ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.watched=true; });  window.AF?.(); window.toast('✅ '+ids.length+'本を視聴済みに'); }
  else if (type==='unwatched'){ ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.watched=false; }); window.AF?.(); window.toast('👁 '+ids.length+'本を未視聴に戻した'); }
  else if (type==='fav-add') { ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.fav=true; });    window.AF?.(); window.toast('⭐ '+ids.length+'本をお気に入りに追加'); }
  else if (type==='fav-remove'){ ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.fav=false; });  window.AF?.(); window.toast('☆ '+ids.length+'本のお気に入りを解除'); }
  else if (type==='archive') { ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.archived=true; }); window.AF?.(); window.toast('📦 '+ids.length+'本をアーカイブ'); }
  else if (type==='share')   { ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.shared=2; });    window.AF?.(); window.toast('🌐 '+ids.length+'本を全体公開にシェア'); }
  else if (type==='remove')  { window.showConf?.('📋 PL除外', ids.length+'本をプレイリストから除外します。', () => { ids.forEach(id => { const v=vids.find(v=>v.id===id); if(v) v.pl='（除外済）'; }); window.AF?.(); window.toast('✂ 除外しました'); }); }
}
