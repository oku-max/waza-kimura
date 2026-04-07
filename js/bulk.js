// ═══ WAZA KIMURA — Bulk操作 ═══

export function openBulkVPanel() {
  if (!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
  const panel = document.getElementById('bulk-vpanel');
  const body = document.getElementById('bulk-vpanel-body');
  const sub = document.getElementById('bulk-vpanel-subtitle');
  if (!panel || !body) return;
  if (sub) sub.textContent = window.selIds.size + '本の動画を編集中';
  body.innerHTML = buildBulkDrawerHTML();
  panel.classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeBulkVPanel() {
  const panel = document.getElementById('bulk-vpanel');
  if (panel) panel.classList.remove('show');
  document.body.style.overflow = '';
}

// 一括編集VPanel用のDrawerHTML（vパネルスタイル）
export function buildBulkDrawerHTML() {
  const ts = window.tagSettings || [];
  const TB_OPTS  = [...new Set([...(ts.find(t=>t.key==='tb')?.presets  || ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル']), ...(window.videos||[]).flatMap(v=>v.tb||[])])];
  const AC_OPTS  = [...new Set([...(ts.find(t=>t.key==='ac')?.presets  || ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル']), ...(window.videos||[]).flatMap(v=>v.ac||[])])];
  const POS_BASE = ts.find(t=>t.key==='pos')?.presets || ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const POS_ALL  = [...new Set([...POS_BASE,  ...(window.videos||[]).flatMap(v=>v.pos||[])])].sort();
  const TECH_ALL = [...new Set((window.videos||[]).flatMap(v=>v.tech||[]))].sort();

  const selVids = [...(window.selIds||new Set())].map(id=>(window.videos||[]).find(v=>v.id===id)).filter(Boolean);
  const common = (arr, field) => arr.filter(x => selVids.every(v => (v[field]||[]).includes(x)));
  const commonTb   = common(TB_OPTS,  'tb');
  const commonAc   = common(AC_OPTS,  'ac');
  const commonPos  = common(POS_ALL,  'pos');
  const commonTech = common(TECH_ALL, 'tech');
  const commonCh   = selVids.every(v=>(v.ch||v.channel||'')===(selVids[0]?.ch||selVids[0]?.channel||'')) ? (selVids[0]?.ch||selVids[0]?.channel||'未設定') : '（複数）';
  const commonPl   = selVids.every(v=>(v.pl||'')===(selVids[0]?.pl||'')) ? (selVids[0]?.pl||'未分類') : '（複数）';

  const prioChips = ['今すぐ','そのうち','保留'].map(p =>
    `<span class="chip" onclick="bvpSet('prio','${p}',this)">${p}</span>`
  ).join('');
  const progChips = ['未着手','練習中','マスター'].map(s =>
    `<span class="chip" onclick="bvpSet('status','${s}',this)">${s}</span>`
  ).join('');

  const sec = (label, content) =>
    `<div class="fsec">
      <div class="fsec-title">${label}</div>
      ${content}
    </div>`;

  const mkTagRow = (key, label, opts, commonTags) => {
    const onCls = {tb:'on-tb',ac:'on-ac',pos:'on-pos',tech:'on-tech'}[key];
    const chips = commonTags.map(v =>
      `<span class="vp-chip ${onCls}" onclick="bvpChipRm('${key}','${v.replace(/'/g,"\\'")}',this)" style="cursor:pointer">${v} ×</span>`
    ).join('');
    const rowCls = {tb:'vp-row-tb',ac:'vp-row-ac',pos:'vp-row-pos',tech:'vp-row-tech'}[key] || '';
    return `<div class="vp-row ${rowCls}">
      <span class="vp-lbl">${label}</span>
      <div class="vp-dd-wrap">
        <div class="vp-chips" id="bvp-${key}">${chips}</div>
        <div class="vp-dd-trigger" onclick="bvpTogDd('${key}')">＋ 追加</div>
        <div class="vp-dd" id="bvp-dd-${key}" style="display:none">
          <input class="vp-dd-search" placeholder="検索・新規追加..."
            oninput="bvpRenderDdList('${key}',this.value)"
            onkeydown="bvpDdKey('${key}',event,this)">
          <div class="vp-dd-list" id="bvp-dd-list-${key}"></div>
        </div>
      </div>
    </div>`;
  };

  return sec('ステータス・進捗・優先度', `
    <div class="vp-row">
      <span class="vp-lbl">Status</span>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        <span class="chip" onclick="bvpToggleWatch(this)">未視聴</span>
        <span class="chip" onclick="bvpToggleFav(this)">★ Fav</span>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Progress</span>
      <div style="display:flex;flex-wrap:wrap;gap:5px" id="bvp-prog">${progChips}</div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Priority</span>
      <div style="display:flex;flex-wrap:wrap;gap:5px" id="bvp-prio">${prioChips}</div>
    </div>`)
  + sec('チャンネル・プレイリスト', `
    <div class="vp-row">
      <span class="vp-lbl">Channel</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="chip active">${commonCh}</span>
          <div class="chip" style="border-style:dashed" onclick="bvpTogDd('ch')">✎ 変更</div>
        </div>
        <div class="vp-dd" id="bvp-dd-ch" style="display:none">
          <input class="vp-dd-search" id="bvp-ch-inp" placeholder="検索・新規追加..."
            oninput="bvpChSuggest(this)" onfocus="bvpChSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-ch-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpSetChannel();event.preventDefault();}">
          <div class="vp-dd-list" id="bvp-ch-sug"></div>
          <button class="vp-tech-add-btn" style="width:100%;margin-top:6px" onclick="bvpSetChannel()">✓ 変更する</button>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">Playlist</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="chip active">${commonPl}</span>
          <div class="chip" style="border-style:dashed" onclick="bvpTogDd('pl')">✎ 変更・検索</div>
        </div>
        <div class="vp-dd" id="bvp-dd-pl" style="display:none">
          <input class="vp-dd-search" id="bvp-pl-inp" placeholder="検索・新規追加..."
            oninput="bvpPlSuggest(this)" onfocus="bvpPlSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-pl-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpSetPlaylist();event.preventDefault();}">
          <div class="vp-dd-list" id="bvp-pl-sug"></div>
          <button class="vp-tech-add-btn" style="width:100%;margin-top:6px" onclick="bvpSetPlaylist()">✓ 変更する</button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="vp-pl-btn" onclick="openBulkPlOp('move')">↪ 移動</button>
          <button class="vp-pl-btn" onclick="openBulkPlOp('copy')">⧉ コピー</button>
          <button class="vp-pl-btn vp-pl-btn-del" onclick="bulkPlRemove()">✕ 削除</button>
        </div>
      </div>
    </div>`)
  + sec('ポジション・テクニック',
      mkTagRow('tb',   (ts.find(t=>t.key==='tb')?.label  ||'TOP/BOTTOM'), TB_OPTS,  commonTb)
    + mkTagRow('ac',   (ts.find(t=>t.key==='ac')?.label  ||'Action'),     AC_OPTS,  commonAc)
    + mkTagRow('pos',  (ts.find(t=>t.key==='pos')?.label ||'Position'),   POS_ALL,  commonPos)
    + mkTagRow('tech', (ts.find(t=>t.key==='tech')?.label||'Technique'),  TECH_ALL, commonTech))
  + `<div style="padding:8px 16px 4px">
      <button class="bvp-ai-btn" onclick="onBulkAiTagBtn(this)"
        style="width:100%;padding:10px;border-radius:10px;border:1.5px dashed var(--accent);
               background:var(--surface2);color:var(--accent);font-size:13px;
               font-weight:700;cursor:pointer;letter-spacing:.3px">
        🤖 AIタグ提案
      </button>
    </div>
    <div style="padding:4px 16px;display:flex;gap:8px">
      <button onclick="bulkDo('archive')"
        style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--purple,#8b5cf6);
               background:transparent;color:var(--purple,#8b5cf6);font-size:12px;
               font-weight:700;cursor:pointer">
        📦 アーカイブ
      </button>
      <button onclick="window.bulkTagReset()"
        style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--text3);
               background:transparent;color:var(--text3);font-size:12px;
               font-weight:700;cursor:pointer">
        🔄 タグリセット
      </button>
    </div>
    <div style="padding:4px 16px 20px">
      <button onclick="bulkDo('delete')"
        style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--red,#ef4444);
               background:transparent;color:var(--red,#ef4444);font-size:13px;
               font-weight:700;cursor:pointer;letter-spacing:.3px">
        🗑 選択した動画を削除
      </button>
    </div>`;
}

// ── BVP ドロップダウン制御（VPanelと同じ動的レンダリング） ──

function _bvpGetAllOpts(key) {
  const ts = window.tagSettings || [];
  const presets = ts.find(t => t.key === key)?.presets || [];
  const fromVideos = (window.videos || []).flatMap(v => v[key] || []);
  return [...new Set([...presets, ...fromVideos])].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function bvpTogDd(key) {
  document.querySelectorAll('.vp-dd').forEach(d => {
    if (d.id !== 'bvp-dd-' + key) d.style.display = 'none';
  });
  const dd = document.getElementById('bvp-dd-' + key);
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { dd.style.display = 'none'; return; }
  // サイドバーpopupと同じフルハイト・フィックスドパネル方式
  dd.style.position = 'fixed';
  dd.style.top = '12px';
  dd.style.bottom = '12px';
  dd.style.right = '12px';
  dd.style.left = 'auto';
  dd.style.width = 'min(360px, 92vw)';
  dd.style.maxHeight = 'none';
  dd.style.zIndex = '500';
  dd.style.display = 'flex';
  dd.style.flexDirection = 'column';
  dd.style.overflow = 'hidden';
  const list = dd.querySelector('.vp-dd-list') || dd.querySelector('#bvp-ch-sug') || dd.querySelector('#bvp-pl-sug') || dd.querySelector('[id^="bvp-dd-list-"]');
  if (list) {
    list.style.flex = '1';
    list.style.minHeight = '0';
    list.style.maxHeight = 'none';
    list.style.overflowY = 'auto';
  }
  const inp = dd.querySelector('.vp-dd-search');
  if (inp) { inp.value = ''; }
  if (key === 'ch') bvpChSuggest(inp);
  else if (key === 'pl') bvpPlSuggest(inp);
  else bvpRenderDdList(key, '');
  inp?.focus();
}

export function bvpRenderDdList(key, q) {
  const list = document.getElementById('bvp-dd-list-' + key);
  if (!list) return;
  const selVids = [...(window.selIds || new Set())].map(id => (window.videos || []).find(v => v.id === id)).filter(Boolean);
  const common = (arr) => arr.filter(x => selVids.every(v => (v[key] || []).includes(x)));
  const all = _bvpGetAllOpts(key);
  const current = common(all);
  const ql = q.toLowerCase();
  const filtered = all.filter(opt => !ql || opt.toLowerCase().includes(ql));
  const isNew = q.trim() && !all.some(o => o.toLowerCase() === ql);
  list.innerHTML = filtered.map(opt => {
    const sel = current.includes(opt);
    return `<div class="vp-dd-item${sel ? ' selected' : ''}" onclick="bvpDdToggle('${key}','${opt.replace(/'/g, "\\'")}',this)">${opt}</div>`;
  }).join('') + (isNew ? `<div class="vp-dd-new" onclick="bvpDdAddNew('${key}','${q.trim().replace(/'/g, "\\'")}')">＋「${q.trim()}」を新規追加</div>` : '');
}

export function bvpDdKey(key, e, inp) {
  if (e.key === 'Enter') {
    const q = inp.value.trim();
    if (!q) return;
    bvpDdAddNew(key, q);
  } else if (e.key === 'Escape') {
    const dd = document.getElementById('bvp-dd-' + key);
    if (dd) dd.style.display = 'none';
  }
}

export function bvpDdAddNew(key, val) {
  if (!val.trim()) return;
  const selVids = [...(window.selIds || new Set())].map(id => (window.videos || []).find(v => v.id === id)).filter(Boolean);
  if (!selVids.length) return;
  bulkSnapshot();
  selVids.forEach(v => {
    if (!v[key]) v[key] = [];
    if (!v[key].includes(val)) v[key].push(val);
  });
  _bvpRefreshChips(key, key, selVids);
  bvpRenderDdList(key, '');
  const inp = document.querySelector('#bvp-dd-' + key + ' .vp-dd-search');
  if (inp) inp.value = '';
  window.toastUndo?.((window.selIds || new Set()).size + '本に「' + val + '」を追加', bulkUndo);
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpDdFilter(key, q) { bvpRenderDdList(key, q); }

export function bvpDdToggle(key, val, el) {
  const fieldMap = {tb:'tb', ac:'ac', pos:'pos', tech:'tech'};
  const field = fieldMap[key]; if (!field) return;
  const selVids = [...(window.selIds||new Set())].map(id=>(window.videos||[]).find(v=>v.id===id)).filter(Boolean);
  if (!selVids.length) return;
  bulkSnapshot();
  const isSelected = el?.classList.contains('selected');
  selVids.forEach(v => {
    if (!v[field]) v[field] = [];
    if (isSelected) { v[field] = v[field].filter(t => t !== val); }
    else if (!v[field].includes(val)) { v[field].push(val); }
  });
  if (el) el.classList.toggle('selected', !isSelected);
  _bvpRefreshChips(key, field, selVids);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpChipRm(key, val) {
  const fieldMap = {tb:'tb', ac:'ac', pos:'pos', tech:'tech'};
  const field = fieldMap[key]; if (!field) return;
  const selVids = [...(window.selIds||new Set())].map(id=>(window.videos||[]).find(v=>v.id===id)).filter(Boolean);
  bulkSnapshot();
  selVids.forEach(v => { if (v[field]) v[field] = v[field].filter(t => t !== val); });
  _bvpRefreshChips(key, field, selVids);
  // ドロップダウンのselectedも外す
  document.querySelectorAll(`#bvp-dd-list-${key} .vp-dd-item`).forEach(item => {
    if (item.textContent === val) item.classList.remove('selected');
  });
  window.toastUndo?.((window.selIds||new Set()).size+'本から「'+val+'」を削除', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

function _bvpRefreshChips(key, field, selVids) {
  const onCls = {tb:'on-tb',ac:'on-ac',pos:'on-pos',tech:'on-tech'}[key];
  const common = selVids.length ? (selVids[0][field]||[]).filter(v => selVids.every(sv=>(sv[field]||[]).includes(v))) : [];
  const chipsEl = document.getElementById('bvp-' + key);
  if (!chipsEl) return;
  chipsEl.innerHTML = common.map(v =>
    `<span class="vp-chip ${onCls}" onclick="bvpChipRm('${key}','${v.replace(/'/g,"\\'")}',this)" style="cursor:pointer">${v} ×</span>`
  ).join('');
}

// ── 一括AIタグ提案（1件ずつ個別分析） ──
export async function onBulkAiTagBtn(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 分析中...'; }
  const selIds = [...(window.selIds||new Set())];
  await window.autoTagNewVideos?.(selIds);
  if (btn) { btn.disabled = false; btn.textContent = '🤖 AIタグ提案'; }
  // パネルを再描画して新しいタグを表示
  const body = document.getElementById('bulk-vpanel-body');
  if (body) body.innerHTML = buildBulkDrawerHTML();
}

// ── BVP操作関数 ──

export function bvpSet(field, val, el) {
  bulkSnapshot();
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  const fieldMap = { prio:'prio', status:'status' };
  const f = fieldMap[field] || field;
  ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) v[f]=val; });
  // チップ状態更新（chip active トグル — VPanelと同じ）
  const rowId = field==='prio' ? 'bvp-prio' : 'bvp-prog';
  document.querySelectorAll('#'+rowId+' .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  window.toastUndo?.((window.selIds||new Set()).size+'本に「'+val+'」を設定', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggle(field, val, el, onClass) {
  bulkSnapshot();
  const isOn = el.classList.contains(onClass);
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    const arr = v[field]||[];
    if(isOn) v[field]=arr.filter(x=>x!==val);
    else if(!arr.includes(val)) v[field]=[...arr,val];
  });
  el.classList.toggle(onClass, !isOn);
  window.toastUndo?.((isOn?'削除: ':'追加: ')+'「'+val+'」 → '+(window.selIds||new Set()).size+'本', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggleWatch(el) {
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  const watchedCount=vids.filter(v=>v.watched).length;
  const setTo = watchedCount < vids.length/2;
  vids.forEach(v=>v.watched=setTo);
  el.textContent = setTo ? '視聴済み' : '未視聴';
  el.classList.toggle('active', setTo);
  window.toastUndo?.((window.selIds||new Set()).size+'本を'+(setTo?'視聴済み':'未視聴')+'に設定', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggleFav(el) {
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  const favCount=vids.filter(v=>v.fav).length;
  const setTo = favCount < vids.length/2;
  vids.forEach(v=>v.fav=setTo);
  el.textContent = setTo ? '★ Fav' : '★ Fav';
  el.classList.toggle('active', setTo);
  el.classList.toggle('c-fav', setTo);
  window.toastUndo?.((window.selIds||new Set()).size+'本をFav'+(setTo?'追加':'解除'), bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpRemoveTag(field, el) {
  bulkSnapshot();
  const val = el.dataset.val;
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    v[field]=(v[field]||[]).filter(x=>x!==val);
  });
  el.remove();
  window.toast?.((window.selIds||new Set()).size+'本から「'+val+'」を削除');
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpAddPos() {
  const inp = document.getElementById('bvp-pos-inp');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  let added=0;
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    if(!(v.pos||[]).includes(val)){v.pos=[...(v.pos||[]),val];added++;}
  });
  // チップ追加
  const row = document.getElementById('bvp-pos');
  if(row) {
    const chip = document.createElement('span');
    chip.className='vp-chip on-pos vp-pos-rm'; chip.dataset.val=val;
    chip.textContent=val+' ×';
    chip.onclick=function(){bvpRemoveTag('pos',this);};
    row.appendChild(chip);
  }
  inp.value='';
  const sug=document.getElementById('bvp-pos-sug'); if(sug) sug.innerHTML='';
  window.toast?.(added+'本に「'+val+'」を追加');
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpAddTech() {
  const inp = document.getElementById('bvp-tech-inp');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  let added=0;
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    if(!(v.tech||[]).includes(val)){v.tech=[...(v.tech||[]),val];added++;}
  });
  const row = document.getElementById('bvp-tech');
  if(row) {
    const chip = document.createElement('span');
    chip.className='vp-chip on-tech vp-tech-rm'; chip.dataset.val=val;
    chip.textContent=val+' ×';
    chip.onclick=function(){bvpRemoveTag('tech',this);};
    row.appendChild(chip);
  }
  inp.value='';
  const sug=document.getElementById('bvp-tech-sug'); if(sug) sug.innerHTML='';
  window.toast?.(added+'本に「'+val+'」を追加');
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpPosSuggest(inp) {
  const q = inp.value.trim().toLowerCase();
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const videos = window.videos || [];
  const all = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  const sug = document.getElementById('bvp-pos-sug');
  if (!sug) return;
  const matches = q ? all.filter(p=>p.toLowerCase().includes(q)) : all;
  // mousedownを使うことでinputのblurより先にクリック処理を走らせる
  sug.innerHTML = matches.slice(0,16).map(p =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-pos-inp').value='${p.replace(/'/g,"\'")}';bvpAddPos()">${p}</span>`
  ).join('');
}

export function bvpTechSuggest(inp) {
  const q = inp.value.trim().toLowerCase();
  const videos = window.videos || [];
  const all = [...new Set(videos.flatMap(v=>v.tech||[]))].sort();
  const sug = document.getElementById('bvp-tech-sug');
  if (!sug) return;
  const matches = q ? all.filter(t=>t.toLowerCase().includes(q)) : all;
  sug.innerHTML = matches.slice(0,16).map(t =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-tech-inp').value='${t.replace(/'/g,"\'")}';bvpAddTech()">${t}</span>`
  ).join('');
}


function _bvpRenderList(field, inpId, sugId, setFn) {
  const inp = document.getElementById(inpId);
  const sug = document.getElementById(sugId);
  if (!sug) return;
  const q = (inp?.value || '').trim();
  const ql = q.toLowerCase();
  const videos = window.videos || [];
  const map = {};
  videos.forEach(v => {
    const k = v[field] || '';
    if (!k) return;
    map[k] = (map[k] || 0) + 1;
  });
  const all = Object.keys(map).sort((a, b) => map[b] - map[a]);
  const filtered = ql ? all.filter(k => k.toLowerCase().includes(ql)) : all;
  const exact = all.some(k => k.toLowerCase() === ql);
  const items = filtered.map(k =>
    `<div class="vp-dd-item" onmousedown="event.preventDefault();${setFn}('${k.replace(/'/g, "\\'")}')">${k}<span class="vp-dd-cnt">${map[k]}本</span></div>`
  );
  if (q && !exact) {
    items.unshift(`<div class="vp-dd-new" onmousedown="event.preventDefault();${setFn}('${q.replace(/'/g, "\\'")}')">＋「${q}」を新規追加</div>`);
  }
  if (!items.length) items.push(`<div style="padding:10px;color:var(--text3);font-size:11px;text-align:center">該当なし</div>`);
  sug.innerHTML = items.join('');
}

export function bvpChSuggest(inp) {
  _bvpRenderList('ch', 'bvp-ch-inp', 'bvp-ch-sug', 'bvpPickChannel');
}

export function bvpPickChannel(val) {
  const inp = document.getElementById('bvp-ch-inp');
  if (inp) inp.value = val;
  bvpSetChannel();
}

export function bvpSetChannel(valArg) {
  const inp = document.getElementById('bvp-ch-inp');
  const val = (valArg || inp?.value || '').trim();
  if (!val) return;
  bulkSnapshot();
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) { v.ch=val; v.channel=val; } });
  if (inp) inp.value = '';
  const sug = document.getElementById('bvp-ch-sug'); if(sug) sug.innerHTML='';
  const dd = document.getElementById('bvp-dd-ch'); if(dd) dd.style.display='none';
  window.toastUndo?.((window.selIds||new Set()).size+'本のチャンネルを「'+val+'」に設定', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpPlSuggest(inp) {
  _bvpRenderList('pl', 'bvp-pl-inp', 'bvp-pl-sug', 'bvpPickPlaylist');
}

export function bvpPickPlaylist(val) {
  const inp = document.getElementById('bvp-pl-inp');
  if (inp) inp.value = val;
  bvpSetPlaylist();
}

export function bvpSetPlaylist(valArg) {
  const inp = document.getElementById('bvp-pl-inp');
  const val = (valArg || inp?.value || '').trim();
  if (!val) return;
  bulkSnapshot();
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) v.pl=val; });
  if (inp) inp.value = '';
  const sug = document.getElementById('bvp-pl-sug'); if(sug) sug.innerHTML='';
  const dd = document.getElementById('bvp-dd-pl'); if(dd) dd.style.display='none';
  window.toastUndo?.((window.selIds||new Set()).size+'本のプレイリストを「'+val+'」に変更', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function enterBulk(ctx='home', preserveSel=false){
  window.bulkMode=true; window.bulkCtx=ctx;
  document.body.classList.add('bulk-mode');
  if(!preserveSel) (window.selIds||new Set()).clear();
  window.bulkUndoStack=[];
  document.getElementById('bulkBar').classList.add('show');
  const sh=document.getElementById('sh');if(sh)sh.style.display='none';
  // PCサイドバーの一括ボタンを「終了」に切り替え
  const fsBtn=document.getElementById('fs-bulk-sel-btn');
  if(fsBtn){fsBtn.textContent='✕ 一括キャンセル';fsBtn.onclick=exitBulk;fsBtn.style.color='';fsBtn.classList.add('bulk-active');}
  const orgFsBtn=document.getElementById('org-fs-bulk-sel-btn');
  if(orgFsBtn){orgFsBtn.textContent='✕ 一括キャンセル';orgFsBtn.onclick=exitBulk;orgFsBtn.classList.add('bulk-active');}
  const selBtn2=document.getElementById('bulk-sel-btn');
  if(selBtn2){selBtn2.textContent='✕ 一括キャンセル';selBtn2.classList.add('bulk-active');}
  if(ctx==='organize'){
    const orgBtn=document.getElementById('org-bulk-btn');if(orgBtn)orgBtn.style.display='none';
    if(!preserveSel) window.renderOrg?.();
  } else {
    window.AF?.();
  }
  buildBbPosRow();
  buildBbTechRow();
  updBulk();
}

export function bulkSnapshot(){
  const videos = window.videos || [];
  (window.bulkUndoStack||[]).push(videos.map(v=>({id:v.id,prio:v.prio,status:v.status,watched:v.watched,fav:v.fav,tb:[...(v.tb||[])],ac:[...(v.ac||[])],pos:[...(v.pos||[])],tech:[...(v.tech||[])],pl:v.pl,channel:v.channel,archived:v.archived})));
}

// ─── Bulk Picker ───
const BULK_PICKER_OPTS_BASE = {
  status: [{val:'watched',label:'視聴済み'},{val:'unwatched',label:'未視聴'},{val:'fav-add',label:'Fav 追加'},{val:'fav-remove',label:'Fav 解除'}],
  prio: [{val:'今すぐ',label:'今すぐ'},{val:'そのうち',label:'そのうち'},{val:'保留',label:'保留'}],
  prog: [{val:'未着手',label:'未着手'},{val:'練習中',label:'練習中'},{val:'マスター',label:'マスター'}],
  tb:   [{val:'トップ',label:'トップ'},{val:'ボトム',label:'ボトム'},{val:'スタンディング',label:'スタンディング'},{val:'バック',label:'バック'},{val:'ハーフ',label:'ハーフ'},{val:'ドリル',label:'ドリル'}],
  ac:   [{val:'エスケープ・ディフェンス',label:'エスケープ・ディフェンス'},{val:'パスガード',label:'パスガード'},{val:'アタック',label:'アタック'},{val:'スイープ',label:'スイープ'},{val:'リテンション',label:'リテンション'},{val:'コントロール',label:'コントロール'},{val:'テイクダウン',label:'テイクダウン'},{val:'フィニッシュ',label:'フィニッシュ'},{val:'ドリル',label:'ドリル'}]
};

export function getBulkPickerOpts(type) {
  if(type !== 'pos') return BULK_PICKER_OPTS_BASE[type] || [];
  // Positionはライブラリ既存データ＋固定リストを統合
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const videos = window.videos || [];
  const all = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  return all.map(p => ({val:p, label:p}));
}

let activeBulkPicker = null;
let _bulkPlMode = null; // 'move' or 'copy'

export function bulkUndo(){
  if(!(window.bulkUndoStack||[]).length){ window.toast?.('元に戻す履歴がありません'); return; }
  const snap=window.bulkUndoStack.pop();
  const videos = window.videos || [];
  snap.forEach(s=>{ const v=videos.find(v=>v.id===s.id); if(v)Object.assign(v,s); });
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.();
  resetBulkPickers();
  window.toast?.('↩ 元に戻しました');
  window.debounceSave?.();
}

export function resetBulkPickers(){
  document.querySelectorAll('#bulkBar .bb-chip').forEach(b => {
    b.classList.remove('bb-on','bb-on-tb','bb-on-ac','bb-on-pos','bb-on-tech');
  });
  // ポップアップパネル内チップもリセット
  document.querySelectorAll('.bb-panel-chip').forEach(b => b.classList.remove('bb-on'));
  document.querySelectorAll('.bb-panel.open').forEach(p => p.classList.remove('open'));
  // プレビュー/カウントをリセット
  ['pos','tech'].forEach(type => {
    const prev = document.getElementById('bb-' + type + '-preview');
    const cnt  = document.getElementById('bb-' + type + '-count');
    if (prev) prev.innerHTML = '';
    if (cnt)  cnt.textContent = '';
  });
}

export function exitBulk(){
  window.bulkMode=false; (window.selIds||new Set()).clear(); resetBulkPickers();
  document.body.classList.remove('bulk-mode');
  document.getElementById('bulkBar').classList.remove('show');
  const _sh=document.getElementById('sh');if(_sh)_sh.style.display='';
  closeBulkVPanel();
  // card-sel-ov の vis クラスと sel-circle を直接除去（AF再描画を待たずに即座に非表示）
  document.querySelectorAll('.card-sel-ov').forEach(el => { el.classList.remove('vis'); });
  document.querySelectorAll('.sel-circle').forEach(el => { el.classList.remove('chk'); el.textContent = ''; });
  // Selectボタンをリセット
  const selBtn=document.getElementById('bulk-sel-btn');
  if(selBtn){selBtn.textContent='☑ 一括編集';selBtn.classList.remove('active','bulk-active');}
  const orgSelBtn=document.getElementById('org-bulk-sel-btn');
  if(orgSelBtn){orgSelBtn.textContent='☑ 一括編集';orgSelBtn.classList.remove('active','bulk-active');}
  // PCサイドバーの一括ボタンを元に戻す
  const fsBtn=document.getElementById('fs-bulk-sel-btn');
  if(fsBtn){fsBtn.textContent='☑ 一括編集';fsBtn.onclick=()=>enterBulk();fsBtn.style.color='';fsBtn.classList.remove('bulk-active');}
  const orgFsBtn=document.getElementById('org-fs-bulk-sel-btn');
  if(orgFsBtn){orgFsBtn.textContent='☑ 一括編集';orgFsBtn.onclick=()=>enterBulk('organize');orgFsBtn.classList.remove('bulk-active');}
  if(window.bulkCtx==='organize'){
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=false;
    const orgBtn=document.getElementById('org-bulk-btn');if(orgBtn)orgBtn.style.display='';
    window.renderOrg?.();
  } else {
    window.AF?.();
  }
}

export function togSel(id){
  const selIds = window.selIds||new Set();
  selIds.has(id)?selIds.delete(id):selIds.add(id);
  const c=document.getElementById(`sel-${id}`)?.querySelector('.sel-circle');
  if(c){c.classList.toggle('chk',selIds.has(id));c.textContent=selIds.has(id)?'✓':'';}
  updBulk();
}

export function orgRowClick(event, id) {}

export function orgTogSel(id, cb) {
  if (cb.checked && !(window.bulkMode||false)) {
    // 初回チェックで一括編集モードを自動起動（selIdsを保持）
    (window.selIds||new Set()).add(id); // 先に追加してからpreserveSel=trueで起動
    enterBulk('organize', true);
    const rowCb = document.getElementById('org-cb-' + id);
    if (rowCb) rowCb.checked = true;
    const total = document.querySelectorAll('[id^="org-row-"]').length;
    const selAllCb = document.getElementById('org-sel-all');
    if (selAllCb) selAllCb.checked = (window.selIds||new Set()).size === total && total > 0;
    updBulk();
    return;
  }
  cb.checked ? (window.selIds||new Set()).add(id) : (window.selIds||new Set()).delete(id);
  // 全選択チェックボックスの状態を更新
  const total = document.querySelectorAll('[id^="org-row-"]').length;
  const selAllCb = document.getElementById('org-sel-all');
  if (selAllCb) selAllCb.checked = (window.selIds||new Set()).size === total && total > 0;
  updBulk();
}

export function orgTogSelAll(cb) {
  document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
    const id = tr.id.replace('org-row-', '');
    cb.checked ? (window.selIds||new Set()).add(id) : (window.selIds||new Set()).delete(id);
    const rowCb = tr.querySelector('input[type=checkbox]');
    if (rowCb) rowCb.checked = cb.checked;
  });
  if (cb.checked && (window.selIds||new Set()).size > 0 && !(window.bulkMode||false)) {
    // preserveSel=true でselIdsを保持したままenterBulk
    enterBulk('organize', true);
  } else if (!cb.checked) {
    (window.selIds||new Set()).clear();
    updBulk();
  } else {
    updBulk();
  }
}

export function updBulk(){
  document.getElementById('bulkTit').textContent=(window.selIds||new Set()).size+'本を選択中';
  const btn=document.getElementById('bulk-sel-btn');
  if(btn){if(window.bulkMode){btn.textContent='✕ 一括キャンセル';btn.classList.add('bulk-active');}else{btn.textContent='☑ 一括編集';btn.classList.remove('bulk-active');}}
  // 一括編集ボタンの有効/無効
  const editBtn=document.getElementById('bulk-edit-vpanel-btn');
  if(editBtn){
    const hasSelections=(window.selIds||new Set()).size>0;
    editBtn.style.opacity=hasSelections?'1':'0.4';
    editBtn.style.pointerEvents=hasSelections?'auto':'none';
  }
  // 整理タブ行のハイライト更新
  if(window.bulkCtx==='organize'){document.querySelectorAll('[id^="org-row-"]').forEach(tr=>{const id=tr.id.replace('org-row-','');tr.style.background=(window.selIds||new Set()).has(id)?'var(--surface2)':'';}); }
}

export function selAll(){
  if(window.bulkCtx==='organize'){
    // 整理タブ: 現在表示中の行を全選択
    document.querySelectorAll('[id^="org-row-"]').forEach(tr=>{
      const id=tr.id.replace('org-row-','');
      (window.selIds||new Set()).add(id);
      const cb=tr.querySelector('input[type=checkbox]');if(cb)cb.checked=true;
    });
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=true;
  } else {
    const f=filt(window.videos||[]);f.forEach(v=>(window.selIds||new Set()).add(v.id));window.AF?.();
  }
  updBulk();
}

export function selNone(){
  (window.selIds||new Set()).clear();
  if(window.bulkCtx==='organize'){
    document.querySelectorAll('[id^="org-row-"] input[type=checkbox]').forEach(cb=>cb.checked=false);
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=false;
    updBulk();
  } else {
    window.AF?.(); updBulk();
  }
}

export function bulkSetPrio(val){
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.prio=val;});
  window.AF?.(); window.toast?.('✅ '+ids.length+'本 → Priority: '+val);
}

export function bulkSetProg(val){
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.status=val;});
  window.AF?.(); window.toast?.('✅ '+ids.length+'本 → Progress: '+val);
}

export function bulkTogTag(field,val){
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  let added=0,removed=0;
  ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(!v)return;const arr=v[field]||[];if(arr.includes(val)){v[field]=arr.filter(x=>x!==val);removed++;}else{v[field]=[...arr,val];added++;}});
  window.toast?.((added?'＋'+added+'本に追加 ':'')+( removed?'−'+removed+'本から除去 ':'')+val);
  window.AF?.();
}

// ═══ BULK PLAYLIST OPERATIONS ═══

export function openBulkPlOp(mode) {
  if(!(window.selIds||new Set()).size){ window.toast?.('動画を選択してください'); return; }
  _bulkPlMode = mode;
  window._vpPlOp = {id: null, mode: mode}; // モーダルを再利用

  const title = document.getElementById('vpPlOvTitle');
  const desc  = document.getElementById('vpPlOvDesc');
  const list  = document.getElementById('vpPlOvList');
  const inp   = document.getElementById('vpPlOvNew');

  const count = (window.selIds||new Set()).size;
  title.textContent = mode==='move' ? `↪ プレイリストに移動（${count}本）` : `⧉ プレイリストにコピー（${count}本）`;
  desc.textContent  = mode==='move'
    ? '選択した動画を移動先プレイリストに移動します'
    : '選択した動画を別のプレイリストにコピーします';
  inp.value = '';

  // 既存プレイリスト一覧
  const videos = window.videos || [];
  const pls = [...new Set(videos.filter(v=>!v.archived).map(v=>v.pl))].sort();
  list.innerHTML = '';
  pls.forEach(p => {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;text-align:left;padding:7px 10px;border-radius:6px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;cursor:pointer;font-family:inherit;margin-bottom:2px;';
    btn.textContent = p;
    btn.onmouseover = ()=>{ btn.style.borderColor='var(--accent)'; btn.style.color='var(--accent)'; };
    btn.onmouseout  = ()=>{ btn.style.borderColor='var(--border)';  btn.style.color='var(--text)'; };
    btn.onclick = () => bulkPlConfirm(p);
    list.appendChild(btn);
  });

  // モーダルをbulk用に切り替える（vpPlOvConfirmをbulk用に上書き）
  document.getElementById('vpPlOvNew').onkeydown = function(e){
    if(e.key==='Enter') bulkPlConfirmNew();
  };
  document.querySelector('#vpPlOv .btn-save').onclick = ()=>{ window.closeOv?.('vpPlOv'); };
  document.getElementById('vpPlOv').classList.add('open');
}

export function bulkPlConfirm(targetPl) {
  const ids = [...(window.selIds||new Set())];
  const mode = _bulkPlMode;
  const videos = window.videos || [];
  bulkSnapshot();
  if(mode==='move'){
    ids.forEach(id=>{ const v=videos.find(v=>v.id===id); if(v) v.pl=targetPl; });
    window.closeOv?.('vpPlOv');
    window.AF?.(); window.debounceSave?.();
    window.toastUndo?.(`↪ ${ids.length}本を「${targetPl}」に移動しました`, bulkUndo);
  } else {
    const copies = ids.map(id=>{
      const v=videos.find(v=>v.id===id); if(!v) return null;
      const copy=JSON.parse(JSON.stringify(v));
      copy.id=v.id+'_copy_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      copy.pl=targetPl;
      return copy;
    }).filter(Boolean);
    copies.forEach(c=>videos.push(c));
    window.closeOv?.('vpPlOv');
    window.AF?.(); window.debounceSave?.();
    window.toastUndo?.(`⧉ ${copies.length}本を「${targetPl}」にコピーしました`, bulkUndo);
  }
}

export function bulkPlConfirmNew() {
  const val = document.getElementById('vpPlOvNew').value.trim();
  if(!val){ window.toast?.('プレイリスト名を入力してください'); return; }
  bulkPlConfirm(val);
}

export function bulkPlRemove() {
  if(!(window.selIds||new Set()).size){ window.toast?.('動画を選択してください'); return; }
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  window.showConf?.('✕ プレイリストから削除', `${ids.length}本を「未分類」に移動します。`, ()=>{
    bulkSnapshot();
    ids.forEach(id=>{ const v=videos.find(v=>v.id===id); if(v) v.pl='未分類'; });
    window.AF?.(); window.debounceSave?.();
    window.toastUndo?.(`✕ ${ids.length}本を未分類に移動しました`, bulkUndo);
  });
}

// 個別動画のvpPlOvConfirmNewをモーダル再利用に合わせてリセット
export function resetVpPlModal() {
  const inp = document.getElementById('vpPlOvNew');
  if(inp) inp.onkeydown = function(e){ if(e.key==='Enter') window.vpPlOvConfirmNew?.(); };
}

export function bulkDo(type){
  if(!(window.selIds||new Set()).size){ window.toast?.('動画を選択してください'); return; }
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  bulkSnapshot();
  if(type==='watched'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.watched=true;});window.AF?.();window.debounceSave?.();window.toastUndo?.('✅ '+ids.length+'本を視聴済みに', bulkUndo);}
  else if(type==='unwatched'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.watched=false;});window.AF?.();window.debounceSave?.();window.toastUndo?.('👁 '+ids.length+'本を未視聴に戻した', bulkUndo);}
  else if(type==='fav-add'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.fav=true;});window.AF?.();window.debounceSave?.();window.toastUndo?.('⭐ '+ids.length+'本をお気に入りに追加', bulkUndo);}
  else if(type==='fav-remove'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.fav=false;});window.AF?.();window.debounceSave?.();window.toastUndo?.('☆ '+ids.length+'本のお気に入りを解除', bulkUndo);}
  else if(type==='archive'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.archived=true;});window.AF?.();window.debounceSave?.();window.toastUndo?.('📦 '+ids.length+'本をアーカイブ', bulkUndo);}
  else if(type==='delete'){
    window.showConf?.('🗑 完全削除', ids.length+'本の動画を完全に削除します。この操作は元に戻せません。', async () => {
      window.videos = (window.videos||[]).filter(v => !ids.includes(v.id));
      window.selIds?.clear();
      closeBulkVPanel();
      exitBulk();
      window.AF?.(); window.renderOrg?.();
      await window.saveUserData?.();
      window.toast?.('🗑 '+ids.length+'本を削除しました');
    });
    return;
  }
  else if(type==='share'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.shared=2;});window.AF?.();window.debounceSave?.();window.toastUndo?.('🌐 '+ids.length+'本を全体公開にシェア', bulkUndo);}
  else if(type==='remove'){window.showConf?.('📋 PL除外',ids.length+'本をプレイリストから除外します。',()=>{ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.pl='（除外済）';});window.AF?.();window.debounceSave?.();window.toastUndo?.('✂ 除外しました', bulkUndo);});}
}

// ── 一括タグリセット ──
window.bulkTagReset = function() {
  if (!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
  const ids = [...(window.selIds||new Set())];
  const videos = window.videos || [];
  const ts = window.tagSettings || [];
  const fields = ['tb','ac','pos','tech'];
  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];

  document.getElementById('vp-tag-reset-popup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'vp-tag-reset-popup';
  popup.style.cssText = 'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.2);min-width:260px;max-width:360px';

  let btnsHtml = '';
  fields.forEach((f, fi) => {
    const label = ts.find(t => t.key === f)?.label || f.toUpperCase();
    let total = 0;
    ids.forEach(id => { const v = videos.find(v => v.id === id); total += (v?.[f]||[]).length; });
    if (!total) return;
    const c = colors[fi % colors.length];
    btnsHtml += `<button data-field="${f}"
      style="padding:10px;border-radius:8px;border:2px solid ${c};background:${c}11;
        color:${c};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;width:100%">
      ${label}をリセット（${ids.length}本, 計${total}件）
    </button>`;
  });

  card.innerHTML = `
    <div style="font-size:14px;font-weight:800;margin-bottom:4px">🔄 一括タグリセット（${ids.length}本）</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">リセットする属性を選んでください</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${btnsHtml}
      <button id="bulk-tag-reset-all"
        style="padding:10px;border-radius:8px;border:2px solid var(--red,#ef4444);background:rgba(239,68,68,.08);
          color:var(--red,#ef4444);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;width:100%">
        ⚠ すべてのタグをリセット
      </button>
      <button onclick="document.getElementById('vp-tag-reset-popup').remove()"
        style="padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);
          color:var(--text3);font-size:12px;cursor:pointer;font-family:inherit;width:100%">キャンセル</button>
    </div>`;

  popup.appendChild(card);
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });

  card.querySelectorAll('button[data-field]').forEach(btn => {
    btn.onclick = () => {
      const field = btn.dataset.field;
      const label = ts.find(t => t.key === field)?.label || field;
      let count = 0;
      ids.forEach(id => { const v = videos.find(v => v.id === id); if (v) { count += (v[field]||[]).length; v[field] = []; } });
      window.debounceSave?.(); window.AF?.();
      popup.remove();
      window.toast?.(`🔄 ${ids.length}本の${label}をリセット（${count}件削除）`);
    };
  });

  document.getElementById('bulk-tag-reset-all').onclick = () => {
    let count = 0;
    ids.forEach(id => {
      const v = videos.find(v => v.id === id); if (!v) return;
      fields.forEach(f => { count += (v[f]||[]).length; v[f] = []; });
    });
    window.debounceSave?.(); window.AF?.();
    popup.remove();
    window.toast?.(`🔄 ${ids.length}本の全タグをリセット（${count}件削除）`);
  };
};

// ── 整理タブ ──
// 判断ステータス管理（videoオブジェクトのjudge フィールドを使用）
// judge: undefined/'pending' = 未判断, 'watch' = 見る, 'skip' = 見ない, 'later' = 後で

// ─── Bulk Bar Chip functions (from index.html) ───

export function bulkChipDo(val) {
  try {
    if(!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
    bulkSnapshot();
    // 同グループの他チップのon状態をリセット
    document.querySelectorAll('#bb-status-row .bb-chip').forEach(b => b.classList.remove('bb-on'));
    // クリックされたチップをon
    const btn = document.querySelector(`#bb-status-row .bb-chip[data-val="${val}"]`);
    if (btn) btn.classList.add('bb-on');
    bulkDo(val);
  } catch(e) { console.error('bulkChipDo error:', e); }
}

// 単一選択（Priority/Progress: 選択したものだけon）
export function bulkChipSingle(type, val, el) {
  try {
    if(!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
    bulkSnapshot();
    const rowId = type === 'prio' ? 'bb-prio-row' : 'bb-prog-row';
    // 同グループリセット
    document.querySelectorAll(`#${rowId} .bb-chip`).forEach(b => b.classList.remove('bb-on'));
    el.classList.add('bb-on');
    const ids = [...(window.selIds||new Set())];
    const videos = window.videos || [];
    if (type === 'prio') {
      ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) v.prio=val; });
      window.toast?.('✅ '+ids.length+'本 → Priority: '+val);
      window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.();
    } else if (type === 'prog') {
      ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) v.status=val; });
      window.toast?.('✅ '+ids.length+'本 → Progress: '+val);
      window.AF?.();
    }
    window.debounceSave?.();
  } catch(e) { console.error('bulkChipSingle error:', e); }
}

// トグル選択（T/B, Action, Position, Technique: 複数選択可、押すと追加、もう一度で削除）
export function bulkChipToggle(type, val, el) {
  try {
    if(!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
    bulkSnapshot();
    const field = type === 'tb' ? 'tb' : type === 'ac' ? 'ac' : type === 'pos' ? 'pos' : 'tech';
    const isOn = el.classList.contains('bb-on');
    const onClass = 'bb-on-' + (field === 'tb' ? 'tb' : field === 'ac' ? 'ac' : field === 'pos' ? 'pos' : 'tech');
    const ids = [...(window.selIds||new Set())];
    const videos = window.videos || [];
    let added = 0, removed = 0;
    ids.forEach(id => {
      const v = videos.find(v=>v.id===id); if(!v) return;
      const arr = v[field] || [];
      if (isOn) {
        v[field] = arr.filter(x => x !== val); removed++;
      } else {
        if (!arr.includes(val)) { v[field] = [...arr, val]; added++; }
      }
    });
    if (isOn) {
      el.classList.remove('bb-on', onClass);
    } else {
      el.classList.add('bb-on', onClass);
    }
    const msg = isOn ? `−${removed} 本から "${val}" を削除` : `＋${added} 本に "${val}" を追加`;
    window.toast?.(msg);
    window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.();
    window.debounceSave?.();
  } catch(e) { console.error('bulkChipToggle error:', e); }
}

// Position行を動的生成
export function buildBbPosRow() {
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const videos = window.videos || [];
  const all = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  const panel = document.getElementById('bb-panel-pos');
  if (!panel) return;
  panel.innerHTML = all.map(p =>
    `<button class="bb-panel-chip" data-bulk-type="pos" data-val="${p}" onclick="bulkPanelToggle('pos','${p}',this)">${p}</button>`
  ).join('');
  updateBbPanelPreview('pos');
}

export function buildBbTechRow() {
  const videos = window.videos || [];
  const all = [...new Set(videos.flatMap(v=>v.tech||[]))].sort();
  const panel = document.getElementById('bb-panel-tech');
  if (!panel) return;
  if (!all.length) {
    panel.innerHTML = '<span style="font-size:10px;color:var(--text3)">テクニックタグがありません</span>';
    return;
  }
  panel.innerHTML = all.map(t =>
    `<button class="bb-panel-chip" data-bulk-type="tech" data-val="${t}" onclick="bulkPanelToggle('tech','${t}',this)">${t}</button>`
  ).join('');
  updateBbPanelPreview('tech');
}

export function toggleBbPanel(type) {
  const panel = document.getElementById('bb-panel-' + type);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.bb-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) panel.classList.add('open');
}

export function bulkPanelToggle(type, val, el) {
  try {
    if(!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
    bulkSnapshot();
    const field = type === 'pos' ? 'pos' : 'tech';
    const isOn = el.classList.contains('bb-on');
    const ids = [...(window.selIds||new Set())];
    const videos = window.videos || [];
    let added = 0, removed = 0;
    ids.forEach(id => {
      const v = videos.find(v=>v.id===id); if(!v) return;
      const arr = v[field] || [];
      if (isOn) { v[field] = arr.filter(x => x !== val); removed++; }
      else { if (!arr.includes(val)) { v[field] = [...arr, val]; added++; } }
    });
    el.classList.toggle('bb-on', !isOn);
    const msg = (added ? `＋${added}本 ` : '') + (removed ? `−${removed}本 ` : '') + `"${val}"`;
    window.toast?.(msg);
    updateBbPanelPreview(type);
    window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.();
    window.debounceSave?.();
  } catch(e) { console.error('bulkPanelToggle:', e); }
}

export function updateBbPanelPreview(type) {
  const preview = document.getElementById('bb-' + type + '-preview');
  const countEl = document.getElementById('bb-' + type + '-count');
  const panel = document.getElementById('bb-panel-' + type);
  if (!panel) return;
  const onChips = panel.querySelectorAll('.bb-panel-chip.bb-on');
  const vals = [...onChips].map(c => c.dataset.val);
  if (preview) preview.innerHTML = vals.map(v =>
    `<span style="font-size:10px;padding:2px 6px;background:var(--accent);color:#fff;border-radius:4px;">${v}</span>`
  ).join('');
  if (countEl) countEl.textContent = vals.length ? vals.length + '個選択' : '';
}

// ─── Window registrations ───
window.openBulkVPanel = openBulkVPanel;
window.closeBulkVPanel = closeBulkVPanel;
window.buildBulkDrawerHTML = buildBulkDrawerHTML;
window.bvpSet = bvpSet;
window.bvpToggle = bvpToggle;
window.bvpToggleWatch = bvpToggleWatch;
window.bvpToggleFav = bvpToggleFav;
window.bvpRemoveTag = bvpRemoveTag;
window.bvpAddPos = bvpAddPos;
window.bvpAddTech = bvpAddTech;
window.bvpPosSuggest = bvpPosSuggest;
window.bvpTechSuggest = bvpTechSuggest;
window.bvpChSuggest = bvpChSuggest;
window.bvpSetChannel = bvpSetChannel;
window.bvpPlSuggest = bvpPlSuggest;
window.bvpSetPlaylist = bvpSetPlaylist;
window.bvpPickChannel = bvpPickChannel;
window.bvpPickPlaylist = bvpPickPlaylist;
window.bvpTogDd = bvpTogDd;
window.bvpDdFilter = bvpDdFilter;
window.bvpRenderDdList = bvpRenderDdList;
window.bvpDdKey = bvpDdKey;
window.bvpDdAddNew = bvpDdAddNew;
window.bvpDdToggle = bvpDdToggle;
window.bvpChipRm = bvpChipRm;
window.onBulkAiTagBtn = onBulkAiTagBtn;
window.enterBulk = enterBulk;
window.bulkSnapshot = bulkSnapshot;
window.BULK_PICKER_OPTS_BASE = BULK_PICKER_OPTS_BASE;
window.getBulkPickerOpts = getBulkPickerOpts;
window.bulkUndo = bulkUndo;
window.resetBulkPickers = resetBulkPickers;
window.exitBulk = exitBulk;
window.togSel = togSel;
window.orgRowClick = orgRowClick;
window.orgTogSel = orgTogSel;
window.orgTogSelAll = orgTogSelAll;
window.updBulk = updBulk;
window.selAll = selAll;
window.selNone = selNone;
window.bulkSetPrio = bulkSetPrio;
window.bulkSetProg = bulkSetProg;
window.bulkTogTag = bulkTogTag;
window.openBulkPlOp = openBulkPlOp;
window.bulkPlConfirm = bulkPlConfirm;
window.bulkPlConfirmNew = bulkPlConfirmNew;
window.bulkPlRemove = bulkPlRemove;
window.resetVpPlModal = resetVpPlModal;
window.bulkDo = bulkDo;
window.bulkChipDo = bulkChipDo;
window.bulkChipSingle = bulkChipSingle;
window.bulkChipToggle = bulkChipToggle;
window.buildBbPosRow = buildBbPosRow;
window.buildBbTechRow = buildBbTechRow;
window.toggleBbPanel = toggleBbPanel;
window.bulkPanelToggle = bulkPanelToggle;
window.updateBbPanelPreview = updateBbPanelPreview;
Object.defineProperty(window, 'activeBulkPicker', {
  get() { return activeBulkPicker; },
  set(v) { activeBulkPicker = v; },
  configurable: true
});
Object.defineProperty(window, '_bulkPlMode', {
  get() { return _bulkPlMode; },
  set(v) { _bulkPlMode = v; },
  configurable: true
});
