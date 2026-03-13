// ═══ WAZA KIMURA — 動画パネル（VPanel） ═══

// ── VPanel オープン/クローズ ──
export function openVPanel(id) {
  const menu = document.getElementById('org-col-menu');
  if (menu) menu.remove();
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const emb  = card.dataset.emb;
  const ext  = card.dataset.ext;
  const plat = card.dataset.plat;
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return;

  if (window.innerWidth >= 1200) {
    _openPanel(id, emb, ext, plat);
    return;
  }

  window.openVPanelId = id;
  const panel    = document.getElementById('vpanel');
  const iframe   = document.getElementById('vpanel-iframe');
  const editArea = document.getElementById('vpanel-edit-area');

  const autoplayEl = document.getElementById('setting-autoplay');
  const autoplay   = autoplayEl ? autoplayEl.checked : true;
  let embedSrc = emb;
  if (autoplay) {
    embedSrc = emb.includes('?') ? emb + '&autoplay=1' : emb + '?autoplay=1';
  }
  iframe.src = embedSrc;
  editArea.innerHTML = buildDrawerHTML(id);
  editArea.querySelectorAll('.vp-tech-rm').forEach(el => { el.onclick = function() { vpRemoveTechEl(this); }; });
  editArea.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function() { vpRemovePosEl(this);  }; });

  const titleEl = document.getElementById('vpanel-title');
  if (titleEl) titleEl.textContent = v.title;

  const extBtn = document.getElementById('vpanel-ext-btn');
  if (extBtn) {
    extBtn.textContent = plat === 'yt' ? '📱 YouTubeで開く' : '🎥 Vimeoで開く';
    extBtn.onclick = () => window.open(ext, '_blank');
  }

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeVPanel() {
  try {
    const panel  = document.getElementById('vpanel');
    const iframe = document.getElementById('vpanel-iframe');
    if (window.openVPanelId) {
      try { vpSave(window.openVPanelId); } catch(e) { console.error('vpSave error:', e); }
    }
    if (iframe) iframe.src = '';
    if (panel)  panel.classList.remove('open');
    document.body.style.overflow = '';
    window.openVPanelId = null;
  } catch(e) {
    console.error('closeVPanel error:', e);
    const panel = document.getElementById('vpanel');
    if (panel) panel.classList.remove('open');
    document.body.style.overflow = '';
  }
}

export function togPlayerByCard(el) {
  const card = el.closest('.card');
  if (!card) return;
  openVPanel(card.dataset.id);
}

export function togPlayer(id)    { openVPanel(id); }
export function _closePlayer(id) { closeVPanel(); }

export function togVpDrawer(id) {
  const drawer  = document.getElementById('drawer-' + id);
  const editBtn = document.getElementById('vedit-' + id);
  if (!drawer) return;
  const isOpen = drawer.classList.contains('show');
  if (isOpen) {
    drawer.classList.remove('show');
    editBtn.classList.remove('open');
  } else {
    drawer.innerHTML = buildDrawerHTML(id);
    drawer.classList.add('show');
    editBtn.classList.add('open');
    drawer.querySelectorAll('.vp-tech-rm').forEach(el => { el.onclick = function(){ vpRemoveTechEl(this); }; });
    drawer.querySelectorAll('.vp-pos-rm').forEach(el  => { el.onclick = function(){ vpRemovePosEl(this);  }; });
  }
}

export function buildDrawerHTML(id) {
  const v = (window.videos||[]).find(v => v.id === id);
  if (!v) return '';

  const prioChips = [
    {v:'今すぐ',  l:'🔴 今すぐ',  c:'on-p1'},
    {v:'そのうち',l:'🟡 そのうち',c:'on-p2'},
    {v:'保留',    l:'⚪ 保留',    c:'on-p3'}
  ].map(o => `<span class="vp-chip${v.prio===o.v?' '+o.c:''}" onclick="vpSet('${id}','prio','${o.v}',this,'${o.c}')">${o.l}</span>`).join('');

  const progChips = [
    {v:'未着手',  l:'📋 未着手',  c:'on-s0'},
    {v:'練習中',  l:'🔵 練習中',  c:'on-s1'},
    {v:'マスター',l:'✅ マスター',c:'on-s2'}
  ].map(o => `<span class="vp-chip${v.status===o.v?' '+o.c:''}" onclick="vpSet('${id}','status','${o.v}',this,'${o.c}')">${o.l}</span>`).join('');

  const tbChips   = (v.tb||[]).map(t  => `<span class="vp-chip on-tb"   onclick="vpRemoveTag('${id}','tb','${t.replace(/'/g,"\\'")}',this)">${t} ×</span>`).join('');
  const acChips   = (v.ac||[]).map(a  => `<span class="vp-chip on-ac"   onclick="vpRemoveTag('${id}','ac','${a.replace(/'/g,"\\'")}',this)">${a} ×</span>`).join('');
  const posChips  = (v.pos||[]).map(p => `<span class="vp-chip on-pos"  onclick="vpRemoveTag('${id}','pos','${p.replace(/'/g,"\\'")}',this)">${p} ×</span>`).join('');
  const techChips = (v.tech||[]).map(t=> `<span class="vp-chip on-tech" onclick="vpRemoveTag('${id}','tech','${t.replace(/'/g,"\\'")}',this)">${t} ×</span>`).join('');

  return `
    <div class="vp-row">
      <span class="vp-lbl">Status</span>
      <div class="vp-chips">
        <span class="vp-chip${v.watched?' on-s1':''}" id="vp-watch-${id}" onclick="vpTogWatch('${id}',this)">${v.watched?'✅ 視聴済み':'👁 未視聴'}</span>
        <span class="vp-chip${v.fav?' on-fav-chip':''}" id="vp-fav-${id}" onclick="vpTogFav('${id}',this)">${v.fav?'⭐ Fav':'☆ Fav'}</span>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Progress</span>
      <div class="vp-chips" id="vp-prog-${id}">${progChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Priority</span>
      <div class="vp-chips" id="vp-prio-${id}">${prioChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">T / B</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-tb-${id}">${tbChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','tb')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-tb-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','tb',this.value)" onkeydown="vpDdKey('${id}','tb',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-tb-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Action</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-ac-${id}">${acChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','ac')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-ac-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','ac',this.value)" onkeydown="vpDdKey('${id}','ac',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-ac-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Position</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-pos-${id}">${posChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','pos')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-pos-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','pos',this.value)" onkeydown="vpDdKey('${id}','pos',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-pos-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Technique</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="vp-tech-${id}">${techChips}</div>
        <div class="vp-dd-trigger" onclick="vpTogDd('${id}','tech')">＋ 追加</div>
        <div class="vp-dd" id="vp-dd-tech-${id}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..." oninput="vpDdFilter('${id}','tech',this.value)" onkeydown="vpDdKey('${id}','tech',event,this)">
          <div class="vp-dd-list" id="vp-dd-list-tech-${id}"></div>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Playlist</span>
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="vp-chip on-pl" id="vp-pl-badge-${id}" style="background:var(--surface2);border-color:var(--border);color:var(--text)">${v.pl||'未分類'}</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','move')">↪ 移動</button>
          <button class="vp-pl-btn" onclick="openVpPlaylistOp('${id}','copy')">⧉ コピー</button>
          <button class="vp-pl-btn vp-pl-btn-del" onclick="vpRemoveFromPl('${id}')">✕ 削除</button>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Memo</span>
      <textarea class="vp-memo" id="vp-memo-${id}" placeholder="ポイント、気づきなど..." onblur="vpSaveMemo('${id}')">${v.memo||''}</textarea>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Share</span>
      <div class="vp-chips" id="vp-share-${id}">
        <span class="vp-chip${(v.shared||0)===0?' on-s0':''}" onclick="vpSetShare('${id}',0,this)">🔒 非公開</span>
        <span class="vp-chip${(v.shared||0)===1?' on-s1':''}" onclick="vpSetShare('${id}',1,this)">👥 フォロワー</span>
        <span class="vp-chip${(v.shared||0)===2?' on-s0':''}" onclick="vpSetShare('${id}',2,this)">🌐 全公開</span>
      </div>
    </div>
    <div id="vp-autosave-${id}" style="text-align:center;font-size:10px;color:var(--text3);opacity:0;transition:opacity .3s;padding:4px 0 8px;letter-spacing:.5px;">✓ 自動保存済み</div>
  `;
}

// ── VP edit functions ──
export function vpSet(id, field, val, el, cls) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v[field] = val;
  el.parentElement.querySelectorAll('.vp-chip').forEach(c => {
    c.classList.remove('on-p1','on-p2','on-p3','on-s0','on-s1','on-s2');
  });
  el.classList.add(cls);
  autoSaveVp(id);
}

export function vpTog(id, field, val, el, cls) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const arr = v[field] || [];
  if (arr.includes(val)) { v[field] = arr.filter(x => x!==val); el.classList.remove(cls); }
  else { v[field] = [...arr, val]; el.classList.add(cls); }
  autoSaveVp(id);
}

export function vpAddTechVal(id, val) {
  if (!val) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if ((v.tech||[]).includes(val)) return;
  v.tech = [...(v.tech||[]), val];
  const container = document.getElementById('vp-tech-' + id);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'vp-chip on-tech vp-tech-rm';
  chip.textContent = val + ' ×';
  chip.dataset.id = id; chip.dataset.val = val;
  chip.onclick = function(){ vpRemoveTechEl(this); };
  container.appendChild(chip);
  autoSaveVp(id);
}

export function vpAddPosVal(id, val) {
  if (!val) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if ((v.pos||[]).includes(val)) return;
  v.pos = [...(v.pos||[]), val];
  const container = document.getElementById('vp-pos-' + id);
  if (!container) return;
  const chip = document.createElement('span');
  chip.className = 'vp-chip on-pos vp-pos-rm';
  chip.textContent = val + ' ×';
  chip.dataset.id = id; chip.dataset.val = val;
  chip.onclick = function(){ vpRemovePosEl(this); };
  container.appendChild(chip);
}

// ── Playlist operations ──
let _vpPlOp = null;

export function openVpPlaylistOp(id, mode) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  _vpPlOp = {id, mode};
  resetVpPlModal();
  const title = document.getElementById('vpPlOvTitle');
  const desc  = document.getElementById('vpPlOvDesc');
  const list  = document.getElementById('vpPlOvList');
  const inp   = document.getElementById('vpPlOvNew');
  title.textContent = mode==='move' ? '↪ プレイリストに移動' : '⧉ プレイリストにコピー';
  desc.textContent  = mode==='move' ? '現在：「' + v.pl + '」→ 移動先を選んでください' : '「' + v.pl + '」からコピーして追加';
  inp.value = '';
  const pls = [...new Set((window.videos||[]).filter(x => !x.archived).map(x => x.pl))]
    .filter(p => mode==='move' ? p!==v.pl : true).sort();
  list.innerHTML = '';
  if (!pls.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:4px">他のプレイリストがありません</div>';
  } else {
    pls.forEach(p => {
      const btn = document.createElement('button');
      btn.style.cssText = 'width:100%;text-align:left;padding:7px 10px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;';
      btn.textContent = p;
      btn.onmouseover = () => { btn.style.borderColor='var(--accent)'; btn.style.color='var(--accent)'; };
      btn.onmouseout  = () => { btn.style.borderColor='var(--border)';  btn.style.color='var(--text)'; };
      btn.onclick = () => vpPlOvConfirm(p);
      list.appendChild(btn);
    });
  }
  const ov = document.getElementById('vpPlOv');
  document.body.appendChild(ov);
  ov.classList.add('open');
}

export function vpPlOvConfirm(targetPl) {
  if (!_vpPlOp || !targetPl.trim()) return;
  const {id, mode} = _vpPlOp;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  if (mode==='move') {
    const oldPl = v.pl;
    v.pl = targetPl.trim();
    updateVpPlBadge(id, v.pl);
    window.toast(`↪ 「${oldPl}」→「${v.pl}」に移動しました`);
  } else {
    const copy = JSON.parse(JSON.stringify(v));
    copy.id = v.id + '_copy_' + Date.now();
    copy.pl = targetPl.trim();
    window.videos.push(copy);
    window.toast(`⧉ 「${copy.pl}」にコピーしました`);
  }
  window.closeOv?.('vpPlOv');
  window.AF?.();
}

export function vpPlOvConfirmNew() {
  const val = document.getElementById('vpPlOvNew').value.trim();
  if (!val) { window.toast('プレイリスト名を入力してください'); return; }
  vpPlOvConfirm(val);
}

export function vpRemoveFromPl(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const old = v.pl;
  v.pl = '未分類';
  updateVpPlBadge(id, v.pl);
  window.toast(`✕ 「${old}」から削除（未分類に移動）`);
  window.AF?.();
}

export function updateVpPlBadge(id, newPl) {
  const badge = document.getElementById('vp-pl-badge-' + id);
  if (badge) badge.textContent = newPl;
}

export function vpRemovePosEl(el) {
  const id  = el.dataset.id;
  const val = el.dataset.val;
  const v   = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.pos = (v.pos||[]).filter(p => p!==val);
  el.remove();
  autoSaveVp(id);
}

// ── タグドロップダウン ──
const VP_TAG_OPTS = {
  tb:   ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'],
  ac:   ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル'],
  pos:  ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'],
  tech: []
};
const VP_FIELD_MAP = { tb:'tb', ac:'ac', pos:'pos', tech:'tech' };

export function vpGetAllOpts(type) {
  const base = VP_TAG_OPTS[type] || [];
  if (type === 'tech') return [...new Set([...base, ...(window.videos||[]).flatMap(v => v.tech||[])])].sort();
  if (type === 'pos')  return [...new Set([...base, ...(window.videos||[]).flatMap(v => v.pos||[])])].sort();
  return base;
}

export function vpTogDd(id, type) {
  document.querySelectorAll('.vp-dd').forEach(d => {
    if (!d.id.includes('-'+type+'-') || !d.id.includes(id)) d.style.display = 'none';
  });
  const dd = document.getElementById('vp-dd-'+type+'-'+id);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) { inp.value = ''; inp.focus(); }
  vpRenderDdList(id, type, '');
}

export function vpRenderDdList(id, type, q) {
  const list  = document.getElementById('vp-dd-list-'+type+'-'+id);
  if (!list) return;
  const v       = (window.videos||[]).find(v => v.id===id);
  const field   = VP_FIELD_MAP[type];
  const current = v ? (v[field]||[]) : [];
  const all     = vpGetAllOpts(type);
  const ql      = q.toLowerCase();
  const filtered = all.filter(opt => !ql || opt.toLowerCase().includes(ql));
  const isNew   = q.trim() && !all.some(o => o.toLowerCase() === ql);
  list.innerHTML = filtered.map(opt => {
    const sel = current.includes(opt);
    return `<div class="vp-dd-item${sel?' selected':''}" onclick="vpDdSelect('${id}','${type}','${opt.replace(/'/g,"\\'")}',this)">${opt}</div>`;
  }).join('') + (isNew ? `<div class="vp-dd-new" onclick="vpDdAddNew('${id}','${type}','${q.trim().replace(/'/g,"\\'")}')">＋「${q.trim()}」を新規追加</div>` : '');
}

export function vpDdFilter(id, type, q) { vpRenderDdList(id, type, q); }

export function vpDdKey(id, type, e, inp) {
  if (e.key === 'Enter') {
    const q = inp.value.trim();
    if (!q) return;
    vpDdAddNew(id, type, q);
  } else if (e.key === 'Escape') {
    const dd = document.getElementById('vp-dd-'+type+'-'+id);
    if (dd) dd.style.display = 'none';
  }
}

export function vpDdSelect(id, type, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  const arr   = v[field] || [];
  if (arr.includes(val)) {
    v[field] = arr.filter(x => x !== val);
    el.classList.remove('selected');
  } else {
    v[field] = [...arr, val];
    el.classList.add('selected');
  }
  vpRefreshChips(id, type);
  window.debounceSave?.();
}

export function vpDdAddNew(id, type, val) {
  if (!val.trim()) return;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  if (!(v[field]||[]).includes(val)) {
    v[field] = [...(v[field]||[]), val];
    const opts = VP_TAG_OPTS[type];
    if (opts && !opts.includes(val)) opts.push(val);
  }
  vpRefreshChips(id, type);
  const dd = document.getElementById('vp-dd-'+type+'-'+id);
  if (dd) dd.style.display = 'none';
  window.debounceSave?.();
  window.toast('＋ 「'+val+'」を追加');
}

export function vpRefreshChips(id, type) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field  = VP_FIELD_MAP[type];
  const clsMap = { tb:'on-tb', ac:'on-ac', pos:'on-pos', tech:'on-tech' };
  const container = document.getElementById('vp-'+type+'-'+id);
  if (!container) return;
  container.innerHTML = (v[field]||[]).map(val =>
    `<span class="vp-chip ${clsMap[type]}" onclick="vpRemoveTag('${id}','${type}','${val.replace(/'/g,"\\'")}',this)">${val} ×</span>`
  ).join('');
  const ddInp = document.querySelector('#vp-dd-'+type+'-'+id+' .vp-dd-search');
  vpRenderDdList(id, type, ddInp ? ddInp.value : '');
}

export function vpRemoveTag(id, type, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const field = VP_FIELD_MAP[type];
  v[field] = (v[field]||[]).filter(x => x !== val);
  el.remove();
  const ddInp = document.querySelector('#vp-dd-'+type+'-'+id+' .vp-dd-search');
  vpRenderDdList(id, type, ddInp ? ddInp.value : '');
  window.debounceSave?.();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.vp-dd-wrap')) {
    document.querySelectorAll('.vp-dd').forEach(d => d.style.display = 'none');
  }
});

export function vpRemoveTechEl(el) {
  const id  = el.dataset.id;
  const val = el.dataset.val;
  const v   = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.tech = (v.tech||[]).filter(t => t!==val);
  el.remove();
  autoSaveVp(id);
}

export function vpTogWatch(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.watched = !v.watched;
  el.className = 'vp-chip' + (v.watched ? ' on-s1' : '');
  el.textContent = v.watched ? '✅ 視聴済み' : '👁 未視聴';
  autoSaveVp(id);
}

export function vpTogFav(id, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.fav = !v.fav;
  el.className = 'vp-chip' + (v.fav ? ' on-fav-chip' : '');
  el.textContent = v.fav ? '⭐ Fav' : '☆ Fav';
  autoSaveVp(id);
}

export function vpSetShare(id, val, el) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  v.shared = val;
  const row = document.getElementById('vp-share-' + id);
  if (row) row.querySelectorAll('.vp-chip').forEach((c, i) => {
    c.className = 'vp-chip' + (i === val ? ' on-s0' : '');
  });
  autoSaveVp(id);
}

export function vpSaveMemo(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const memo = document.getElementById('vp-memo-' + id);
  if (memo) v.memo = memo.value.trim();
  autoSaveVp(id);
}

export function autoSaveVp(id) {
  window.debounceSave?.();
  const ind = document.getElementById('vp-autosave-' + id);
  if (ind) {
    ind.style.opacity = '1';
    clearTimeout(ind._t);
    ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 1200);
  }
}

export function vpSave(id) {
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  const memo = document.getElementById('vp-memo-' + id);
  if (memo) v.memo = memo.value.trim();
  window.AF?.();
  window.debounceSave?.();
}

// ── PC Side Panel ──
let panelId = null;
let _panelDragging = false;
let _panelStartX = 0;
let _panelStartW = 0;

export function _openPanel(id, emb, ext, plat) {
  // ★ Fix 1: 前回のクリックリスナーを必ずクリアしてから開く
  document.removeEventListener('click', _closePanelOutside);

  panelId = id;
  const v = (window.videos||[]).find(v => v.id===id); if (!v) return;
  let panel = document.getElementById('vp-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'vp-panel';
    panel.className = 'vp-panel';
    document.body.appendChild(panel);
  }
  panel.innerHTML = `
    <div class="vp-panel-resizer" id="vpResizer"></div>
    <div class="vp-panel-video"><iframe src="${emb}" allowfullscreen allow="autoplay;encrypted-media"></iframe></div>
    <div class="vp-panel-header">
      <div class="vp-panel-title">${v.title}</div>
      <div class="vp-panel-close" onclick="closePanel()">✕</div>
    </div>
    <div class="vp-panel-body">
      <button class="vp-ext-btn" onclick="window.open('${ext}','_blank')">${plat==='yt'?'📱 YouTubeで開く':'🎥 Vimeoで開く'}</button>
      ${buildDrawerHTML(id)}
    </div>
  `;
  panel.classList.add('show');
  const ma = document.querySelector('.main-area');
  if (ma) { ma.classList.add('panel-open'); ma.style.marginRight = panel.offsetWidth + 'px'; }
  if (window.openPlayer) _closePlayer(window.openPlayer);
  window.openPlayer = id;

  // ★ Fix 2: リサイザーのドラッグ処理を登録
  _initPanelResizer(panel);

  panel.onclick = function(e) { e.stopPropagation(); };
  setTimeout(function() { document.addEventListener('click', _closePanelOutside); }, 0);
}

function _initPanelResizer(panel) {
  const resizer = document.getElementById('vpResizer');
  if (!resizer) return;

  function startDrag(x) {
    _panelDragging = true;
    _panelStartX = x;
    _panelStartW = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    resizer.style.background = 'var(--accent)';
  }
  function doDrag(x) {
    if (!_panelDragging) return;
    const MIN_W = 280, MAX_W = Math.floor(window.innerWidth * 0.6);
    const newW = Math.max(MIN_W, Math.min(MAX_W, _panelStartW - (x - _panelStartX)));
    panel.style.width = newW + 'px';
    const ma = document.querySelector('.main-area');
    if (ma && ma.classList.contains('panel-open')) ma.style.marginRight = newW + 'px';
  }
  function endDrag() {
    if (!_panelDragging) return;
    _panelDragging = false;
    document.body.style.userSelect = '';
    resizer.style.background = '';
  }

  resizer.addEventListener('mousedown', function(e) {
    e.stopPropagation(); e.preventDefault();
    startDrag(e.clientX);
  });
  document.addEventListener('mousemove', function(e) { doDrag(e.clientX); });
  document.addEventListener('mouseup', endDrag);

  resizer.addEventListener('touchstart', function(e) {
    e.stopPropagation(); e.preventDefault();
    startDrag(e.touches[0].clientX);
  }, {passive: false});
  document.addEventListener('touchmove', function(e) {
    if (_panelDragging) { e.preventDefault(); doDrag(e.touches[0].clientX); }
  }, {passive: false});
  document.addEventListener('touchend', endDrag);
}

export function _closePanelOutside() {
  document.removeEventListener('click', _closePanelOutside);
  closePanel();
}

export function closePanel() {
  document.removeEventListener('click', _closePanelOutside);
  try {
    const panel = document.getElementById('vp-panel');
    if (panel) { const iframe = panel.querySelector('iframe'); if (iframe) iframe.src = ''; panel.classList.remove('show'); }
    const ma2 = document.querySelector('.main-area');
    if (ma2) { ma2.classList.remove('panel-open'); ma2.style.marginRight = ''; }
    window.openPlayer = null;
    panelId = null;
  } catch(e) { console.warn('closePanel error:', e); }
}

// ── vpanel 外部公開用の状態変数 ──
export function initVpanelState() {
  Object.defineProperty(window, 'openVPanelId', {
    get: () => _openVPanelId,
    set: v  => { _openVPanelId = v; },
    configurable: true
  });
}
let _openVPanelId = null;
