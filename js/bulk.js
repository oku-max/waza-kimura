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
  // パネルを閉じた後に即座にUI反映
  window.AF?.();
  if (window.bulkCtx === 'organize') window.renderOrg?.();
}

// 一括編集VPanel用のDrawerHTML（vパネルスタイル）
export function buildBulkDrawerHTML() {
  const selVids = [...(window.selIds||new Set())].map(id=>(window.videos||[]).find(v=>v.id===id)).filter(Boolean);
  const _esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── マーク section (VPanel counter と同じ構造) ──
  const favCount = selVids.filter(v=>v.fav).length;
  const nextCount = selVids.filter(v=>v.next).length;
  const favOn = favCount > 0;
  const nextOn = nextCount > 0;
  const p = (() => { const vals = selVids.map(v=>v.practice||0); return vals.every(v=>v===vals[0]) ? vals[0]+'回' : '（複数）'; })();
  const subTitle = `font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px`;
  const btnS = `width:24px;height:24px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:13px;font-weight:700;color:var(--text2);padding:0;font-family:inherit`;
  const btnP = `width:24px;height:24px;border-radius:50%;border:none;background:var(--accent);cursor:pointer;font-size:13px;font-weight:700;color:var(--on-accent);padding:0;font-family:inherit`;
  // filterColVis
  const _fcv      = window.filterColVis || {};
  const _showMark   = _fcv.mark   !== false;
  const _showStatus = _fcv.status !== false;
  const _showRank   = _fcv.rank   !== false;

  const _favNextSec = _showMark ? `
      <div style="flex:0 0 auto;padding-right:14px;border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center">
        <div style="${subTitle}">お気に入り</div>
        <span onclick="bvpToggleFav(this)" style="cursor:pointer;font-size:20px;color:${favOn?'#d4a017':'var(--text3)'};font-weight:700" title="お気に入り">★</span>
      </div>
      <div style="flex:0 0 auto;padding-right:14px;${_showRank?'border-right:1px solid var(--border);':''}display:flex;flex-direction:column;align-items:center">
        <div style="${subTitle}">Next</div>
        <span onclick="bvpToggleNext(this)" style="cursor:pointer;font-size:16px;font-weight:700" title="Next">${nextOn?'🎯':'○'}</span>
      </div>` : '';
  const _cntSec = _showRank ? `
      <div style="flex:1;min-width:0">
        <div style="${subTitle}">カウント</div>
        <div style="display:flex;align-items:center;gap:10px">
          <button onclick="bvpBumpCounter(-1)" style="${btnS}">−</button>
          <span id="bvp-counter-label" style="font-size:18px;font-weight:800;color:#e8590c;min-width:28px;text-align:center;font-variant-numeric:tabular-nums">${p}</span>
          <button onclick="bvpBumpCounter(1)" style="${btnP}">＋</button>
          <button onclick="bvpResetCounter()" class="chip" style="cursor:pointer;font-size:10px;color:var(--text3)">0にリセット</button>
        </div>
      </div>` : '';
  const markSec = (_favNextSec || _cntSec) ? `<div class="fsec">
    <div style="display:flex;gap:14px;align-items:flex-start">
      ${_favNextSec}${_cntSec}
    </div>
  </div>` : '';

  // ── 習得度 section ──
  const STATUS_LABELS = window.STATUS_CANON || [];
  const STATUS_MAP    = {'未着手':'s0','理解':'s1','練習中':'s2','マスター':'s3'};
  const _normSt = window.normStatus;
  const commonStatus  = selVids.length && selVids.every(v=>_normSt(v.status)===_normSt(selVids[0]?.status)) ? _normSt(selVids[0]?.status) : null;
  const STATUS_NUM  = {'未着手':'1.','理解':'2.','練習中':'3.','マスター':'4.'};
  const STATUS_ICONS2 = {'未着手':'📋','理解':'📖','練習中':'🔄','マスター':'⭐'};
  const progChips = STATUS_LABELS.map(s => {
    const on = s === commonStatus;
    const sc = STATUS_MAP[s];
    return `<span class="vp-chip${on?' on-'+sc:''}" style="cursor:pointer" onclick="bvpSet('status','${s}',this)">${STATUS_NUM[s]}${STATUS_ICONS2[s]} ${s}</span>`;
  }).join('');
  const progSec = `<div class="fsec">
    <div class="fsec-title">習得度</div>
    <div class="vp-chips" id="bvp-prog">${progChips}</div>
    ${commonStatus===null ? '<div style="font-size:9px;color:var(--text3);margin-top:4px">（複数の値）</div>' : ''}
  </div>`;

  // ── チャンネル・プレイリスト section ──
  const commonCh = selVids.every(v=>(v.ch||v.channel||'')===(selVids[0]?.ch||selVids[0]?.channel||'')) ? (selVids[0]?.ch||selVids[0]?.channel||'未設定') : '（複数）';
  const commonPl = selVids.every(v=>(v.pl||'')===(selVids[0]?.pl||'')) ? (selVids[0]?.pl||'未分類') : '（複数）';

  const srcSec = `<div class="fsec">
    <div class="fsec-title">チャンネル・プレイリスト</div>
    <div class="vp-row">
      <span class="vp-lbl">チャンネル</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="chip active">${_esc(commonCh)}</span>
          <div class="chip" style="border-style:dashed" onclick="bvpTogDd('ch')">✎ 変更</div>
        </div>
        <div class="vp-dd" id="bvp-dd-ch" style="display:none">
          <input class="vp-dd-search" id="bvp-ch-inp" placeholder="検索・新規追加..."
            oninput="bvpChSuggest(this)" onfocus="bvpChSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-ch-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpSetChannel();event.preventDefault();}">
          <div class="vp-dd-list" id="bvp-ch-sug"></div>
          <button class="vp-tags-add-btn" style="width:100%;margin-top:6px" onclick="bvpSetChannel()">✓ 変更する</button>
        </div>
      </div>
    </div>
    <div class="vp-row">
      <span class="vp-lbl">プレイリスト</span>
      <div class="vp-dd-wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <span class="chip active">${_esc(commonPl)}</span>
          <div class="chip" style="border-style:dashed" onclick="bvpTogDd('pl')">✎ 変更・検索</div>
        </div>
        <div class="vp-dd" id="bvp-dd-pl" style="display:none">
          <input class="vp-dd-search" id="bvp-pl-inp" placeholder="検索・新規追加..."
            oninput="bvpPlSuggest(this)" onfocus="bvpPlSuggest(this)"
            onblur="setTimeout(()=>{const s=document.getElementById('bvp-pl-sug');if(s)s.innerHTML='';},200)"
            onkeydown="if(event.key==='Enter'){bvpSetPlaylist();event.preventDefault();}">
          <div class="vp-dd-list" id="bvp-pl-sug"></div>
          <button class="vp-tags-add-btn" style="width:100%;margin-top:6px" onclick="bvpSetPlaylist()">✓ 変更する</button>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="vp-pl-btn" onclick="openBulkPlOp('move')">↪ 移動</button>
          <button class="vp-pl-btn" onclick="openBulkPlOp('copy')">⧉ コピー</button>
          <button class="vp-pl-btn vp-pl-btn-del" onclick="bulkPlRemove()">✕ 削除</button>
        </div>
      </div>
    </div>
  </div>`;

  // ── タグ section（動画パネルと同じ作り・段階2c）──
  // タグ1〜4の枠のグループを並べ、選択肢の数で見せ方を決める（少なければ並べて押す、多ければプルダウン）。
  // 「付いている」＝選んだ動画のすべてに付いている値。押すと、全部に付いていれば全部から外し、そうでなければ全部に付ける。
  // 値は onclick の文字列に埋め込まず data 属性で渡す（' を含む値でボタンが壊れていた）。
  const _TGR = window.tagRegistry;
  const _TGS = _TGR ? _TGR.slots().filter(g => g && (['tb','cat','pos','tags'].includes(g.store) || g.store === 'map'))
    .filter(g => { if (g.store === 'map') return true; const s = (window.tagSettings || []).find(t => t.key === g.store); return s ? s.visible !== false : true; }) : [];
  const _ONC = { tb:'on-tb', cat:'on-cat', pos:'on-pos', tags:'on-tags' };
  const _tagRow = g => {
    const cls = _ONC[g.store] || 'on-tags';
    const common = [...new Set(selVids.flatMap(v => _TGR.valuesOf(v, g.id)))].filter(t => selVids.every(v => _TGR.valuesOf(v, g.id).includes(t)));
    const da = t => `data-gid="${_esc(g.id)}"` + (t != null ? ` data-val="${_esc(t)}"` : '');
    let inner;
    if (_TGR.displayMode(g.options.length) === 'chips') {
      const shown = g.options.concat(common.filter(t => !g.options.includes(t)));
      inner = shown.map(t => `<span class="vp-chip${common.includes(t) ? ' ' + cls : ''}" style="cursor:pointer" ${da(t)} onclick="bvpTagChip(this)">${_esc(t)}</span>`).join('');
      if (g.store === 'tags') inner += _bvpDdHTML(g, da);
    } else {
      inner = common.map(t => `<span class="vp-chip ${cls}" style="cursor:pointer" ${da(t)} onclick="bvpTagRemove(this)">${_esc(t)} ×</span>`).join('') + _bvpDdHTML(g, da);
    }
    return `<div class="vp-row"><span class="vp-lbl" data-user-text="1">${_esc(g.name)}</span><div class="vp-chips">${inner}</div></div>`;
  };
  const tagSec = _TGS.length ? `<div class="fsec">
    <div class="fsec-title">タグ</div>
    ${_TGS.map(_tagRow).join('')}
  </div>` : '';

  // AI一括実行（オーナー限定・Geminiを使うため）
  const _owner = window._firebaseCurrentUser?.()?.email === 'okujournal@gmail.com';
  const _gdCount = selVids.filter(v => v.pt === 'gdrive').length;
  // 一括で走らせるのは字幕生成だけ。AI要約は廃止した（2026-09-20）。
  const _aiBulkSec = _owner ? `<div style="padding:8px 0 4px">
      <button onclick="bulkAiRun()" ${_gdCount ? '' : 'disabled'}
        style="width:100%;padding:9px;border-radius:9px;border:1px dashed var(--border);background:var(--surface2);
               color:var(--text2);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;${_gdCount ? '' : 'opacity:.4;cursor:default'}">
        💬 字幕を一括生成${_gdCount ? `（${_gdCount}本）` : ''}
      </button>
    </div>` : '';

  return markSec + (_showStatus ? progSec : '') + srcSec + tagSec
  + _aiBulkSec
  + `<div style="padding:4px 0;display:flex;gap:8px">
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


export function bvpTogDd(key) {
  window.wkDdToggle(document.getElementById('bvp-dd-' + key), {
    focus: true,
    after: inp => {
      if (key === 'ch') bvpChSuggest(inp);
      else if (key === 'pl') bvpPlSuggest(inp);
    },
  });
}

// ── タグのプルダウン（グループ共通・段階2c）──
function _bvpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _bvpDdHTML(g, da) {
  const ph = g.store === 'tags' ? 'テクニック検索・新規追加（Enterで追加）' : '絞り込み...';
  return `
    <div class="vp-dd-wrap" style="display:inline-block;position:relative">
      <span class="vp-chip" style="border-style:dashed;cursor:pointer" ${da()} onclick="bvpTagOpenDd(this)" data-user-text="1">＋ ${_bvpEsc(g.name)}</span>
      <div class="vp-dd" id="bvp-dd-g-${_bvpEsc(g.id)}" style="display:none">
        <input class="vp-dd-search" placeholder="${ph}" ${da()} oninput="bvpTagDdFilter(this)" onkeydown="bvpTagDdKey(event,this)">
        <div class="vp-dd-list" id="bvp-ddlist-g-${_bvpEsc(g.id)}"></div>
      </div>
    </div>`;
}
function _bvpSel() { return [...(window.selIds || new Set())].map(id => (window.videos || []).find(v => v.id === id)).filter(Boolean); }
function _bvpRenderDd(g, q) {
  const list = document.getElementById('bvp-ddlist-g-' + g.id);
  if (!list) return;
  const R = window.tagRegistry, sel = _bvpSel();
  const common = new Set([...new Set(sel.flatMap(v => R.valuesOf(v, g.id)))].filter(t => sel.every(v => R.valuesOf(v, g.id).includes(t))));
  // 候補 = 選択肢 ＋ ほかの動画に付いている値（動画パネルと同じ）
  const seen = new Set(g.options), extra = new Set();
  (window.videos || []).forEach(x => R.valuesOf(x, g.id).forEach(t => { if (!seen.has(t)) extra.add(t); }));
  const cands = g.options.concat([...extra].sort((a, b) => String(a).localeCompare(String(b), 'ja')));
  const posDict = g.store === 'pos' ? new Map((window.POSITIONS || []).map(p => [p.ja, p.en || ''])) : null;
  const ql = q.trim().toLowerCase();
  const items = cands.filter(t => !common.has(t)).filter(t => !ql || String(t).toLowerCase().includes(ql) || (posDict && (posDict.get(t) || '').toLowerCase().includes(ql)));
  list.innerHTML = items.length
    ? items.map(t => `<div class="vp-dd-item" data-gid="${_bvpEsc(g.id)}" data-val="${_bvpEsc(t)}" onmousedown="bvpTagDdPick(this)">${_bvpEsc(t)}${posDict && posDict.get(t) ? `<span class="vp-dd-cnt">${_bvpEsc(posDict.get(t))}</span>` : ''}</div>`).join('')
    : `<div style="padding:10px 12px;color:var(--text3);font-size:11px">候補なし</div>`;
}
export function bvpTagOpenDd(el) {
  const g = window.tagRegistry?.group(el.dataset.gid); if (!g) return;
  // タグ4はスマホでキーボードが勝手に開かないよう focus しない（今までどおり）
  window.wkDdToggle(document.getElementById('bvp-dd-g-' + g.id), { focus: g.store !== 'tags', clear: g.store !== 'tags', after: () => _bvpRenderDd(g, '') });
}
export function bvpTagDdFilter(inp) {
  const g = window.tagRegistry?.group(inp.dataset.gid); if (g) _bvpRenderDd(g, inp.value);
}
// 選んだ動画すべてに、値を付ける／外す（書き込みは動画パネルと同じ入口 wkSetTagValue）
function _bvpApply(gid, val, on) {
  const sel = _bvpSel();
  if (!sel.length || val == null || val === '') return;
  bulkSnapshot();
  sel.forEach(v => window.wkSetTagValue(v, gid, val, on));
  const body = document.getElementById('bulk-vpanel-body');
  if (body) body.innerHTML = buildBulkDrawerHTML();
  window.toastUndo?.(sel.length + '本' + (on ? 'に「' : 'から「') + val + (on ? '」を追加' : '」を削除'), bulkUndo);
  window.AF?.(); if (window.bulkCtx === 'organize') window.renderOrg?.(); window.debounceSave?.();
}
export function bvpTagChip(el) {
  const gid = el.dataset.gid, val = el.dataset.val, R = window.tagRegistry;
  const sel = _bvpSel();
  const allHave = sel.length && sel.every(v => R.valuesOf(v, gid).includes(val));
  _bvpApply(gid, val, !allHave);
}
export function bvpTagRemove(el) { _bvpApply(el.dataset.gid, el.dataset.val, false); }
export function bvpTagDdPick(el) {
  const dd = document.getElementById('bvp-dd-g-' + el.dataset.gid); if (dd) dd.style.display = 'none';
  _bvpApply(el.dataset.gid, el.dataset.val, true);
}
export function bvpTagDdKey(ev, inp) {
  const g = window.tagRegistry?.group(inp.dataset.gid); if (!g) return;
  if (ev.key === 'Escape') { const dd = document.getElementById('bvp-dd-g-' + g.id); if (dd) dd.style.display = 'none'; return; }
  if (ev.key !== 'Enter' || g.store !== 'tags') return;   // 打ち込めるのはタグ4だけ（今までどおり）
  ev.preventDefault();
  const val = inp.value.trim(); if (!val) return;
  inp.value = '';
  _bvpApply(g.id, val, true);
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
  el.textContent = setTo ? '★ Fav' : '☆ Fav';
  el.classList.toggle('active', setTo);
  el.classList.toggle('c-fav', setTo);
  window.toastUndo?.((window.selIds||new Set()).size+'本をFav'+(setTo?'追加':'解除'), bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpToggleNext(el) {
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  const nextCount=vids.filter(v=>v.next).length;
  const setTo = nextCount < vids.length/2;
  vids.forEach(v=>v.next=setTo);
  el.textContent = setTo ? '🎯' : '○';
  el.classList.toggle('active', setTo);
  window.toastUndo?.((window.selIds||new Set()).size+'本のNextを'+(setTo?'ON':'OFF'), bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpBumpCounter(delta) {
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  vids.forEach(v => {
    v.practice = Math.max(0, (v.practice||0) + delta);
    if(delta > 0) v.lastPracticed = new Date().toISOString().slice(0,10);
  });
  // ラベル更新
  const lbl = document.getElementById('bvp-counter-label');
  if(lbl){
    const vals = vids.map(v=>v.practice||0);
    const allSame = vals.every(v=>v===vals[0]);
    lbl.textContent = allSame ? vals[0]+'回' : '（複数）';
  }
  window.toastUndo?.((window.selIds||new Set()).size+'本の練習回数を'+(delta>0?'+':'')+ delta, bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

export function bvpResetCounter() {
  bulkSnapshot();
  const ids=[...(window.selIds||new Set())];
  const videos = window.videos || [];
  const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  vids.forEach(v => { v.practice = 0; });
  const lbl = document.getElementById('bvp-counter-label');
  if(lbl) lbl.textContent = '0回';
  window.toastUndo?.((window.selIds||new Set()).size+'本の練習回数をリセット', bulkUndo);
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.(); window.debounceSave?.();
}

// ── 一括 V4タグ操作 (VPanel v4と同じ構造) ──


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
  // ── Inline Transform: ツールバーを変形 ──
  const toolbar = ctx==='organize'
    ? document.querySelector('.org-count-bar')
    : document.querySelector('.results-header');
  if(toolbar){
    toolbar.classList.add('bulk-transform');
    const bi = toolbar.querySelector('.bulk-inline');
    if(bi) bi.classList.add('active');
  }
  const sh=document.getElementById('sh');if(sh)sh.style.display='none';
  // PCサイドバー・モバイル全ボタン：一括モード時に外見を変更しない（org-bulk-sel-btnと同様）
  const fsBtn=document.getElementById('fs-bulk-sel-btn');
  if(fsBtn){fsBtn.onclick=exitBulk;}
  const orgFsBtn=document.getElementById('org-fs-bulk-sel-btn');
  if(orgFsBtn){orgFsBtn.onclick=exitBulk;}
  if(ctx==='organize'){
    const orgBtn=document.getElementById('org-bulk-btn');if(orgBtn)orgBtn.style.display='none';
    if(!preserveSel) window.renderOrg?.();
  } else {
    window.AF?.();
  }
  updBulk();
}

export function bulkSnapshot(){
  const videos = window.videos || [];
  // 新しいタググループの値（v.tg）は、持っている動画だけ写す（全動画に項目を書き足さない）
  (window.bulkUndoStack||[]).push(videos.map(v=>{
    const s={id:v.id,prio:v.prio,status:v.status,watched:v.watched,fav:v.fav,tb:[...(v.tb||[])],cat:[...(v.cat||[])],pos:[...(v.pos||[])],tags:[...(v.tags||[])],pl:v.pl,channel:v.channel,archived:v.archived};
    if (v.tg && typeof v.tg === 'object') s.tg = JSON.parse(JSON.stringify(v.tg));
    return s;
  }));
}

// ─── Bulk Picker ───
let activeBulkPicker = null;
let _bulkPlMode = null; // 'move' or 'copy'

export function bulkUndo(){
  if(!(window.bulkUndoStack||[]).length){ window.toast?.('元に戻す履歴がありません'); return; }
  const snap=window.bulkUndoStack.pop();
  const videos = window.videos || [];
  snap.forEach(s=>{
    const v=videos.find(v=>v.id===s.id); if(!v) return;
    Object.assign(v,s);
    // 控えの時点で新しいタググループの値が無かった動画は、操作で足された分を空に戻す（項目は消さない）
    if (!('tg' in s) && v.tg && typeof v.tg === 'object') v.tg = {};
  });
  window.AF?.(); if(window.bulkCtx==='organize') window.renderOrg?.();
  window.toast?.('↩ 元に戻しました');
  window.debounceSave?.();
}

export function exitBulk(){
  window.bulkMode=false; (window.selIds||new Set()).clear();
  document.body.classList.remove('bulk-mode');
  // ── Inline Transform: ツールバーを復元 ──
  document.querySelectorAll('.bulk-transform').forEach(el => {
    el.classList.remove('bulk-transform');
    const bi = el.querySelector('.bulk-inline');
    if(bi) bi.classList.remove('active');
  });
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
  const cnt = (window.selIds||new Set()).size;
  const label = cnt + '本を選択中';
  // ── Inline Transform: カウント更新 ──
  document.querySelectorAll('.bulk-inline-count').forEach(el => el.textContent = label);
  document.querySelectorAll('.bulk-inline-edit').forEach(el => {
    if(cnt > 0) el.classList.add('has-sel'); else el.classList.remove('has-sel');
  });
  // bulk-sel-btnはテーブルビューのorg-bulk-sel-btnと同様、一括モード時に変更しない
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
      // ユーザーが承知のうえで減らす分は保存側のガードに申告する（二重確認を避ける）
      window._wkDeleteIntent?.(ids.length);
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
// 確かめ・バックアップ・取り消しは js/tag-ops.js（動画パネルと共通。段階4）。
// 以前は今の4つだけで、押すとすぐ外れ、取り消しも無かった。
window.bulkTagReset = function() {
  if (!(window.selIds||new Set()).size) { window.toast?.('動画を選択してください'); return; }
  if (!window.wkTagOps) { window.toast?.('タグリセットを読み込めませんでした'); return; }
  window.wkTagOps.openReset([...(window.selIds||new Set())]);
};

// ─── Window registrations ───
window.openBulkVPanel = openBulkVPanel;
window.closeBulkVPanel = closeBulkVPanel;
window.buildBulkDrawerHTML = buildBulkDrawerHTML;
window.bvpSet = bvpSet;
window.bvpToggleWatch = bvpToggleWatch;
window.bvpToggleFav = bvpToggleFav;
window.bvpToggleNext = bvpToggleNext;
window.bvpBumpCounter = bvpBumpCounter;
window.bvpResetCounter = bvpResetCounter;
window.bvpChSuggest = bvpChSuggest;
window.bvpSetChannel = bvpSetChannel;
window.bvpPlSuggest = bvpPlSuggest;
window.bvpSetPlaylist = bvpSetPlaylist;
window.bvpPickChannel = bvpPickChannel;
window.bvpPickPlaylist = bvpPickPlaylist;
window.bvpTogDd = bvpTogDd;
window.bvpTagChip = bvpTagChip;
window.bvpTagRemove = bvpTagRemove;
window.bvpTagOpenDd = bvpTagOpenDd;
window.bvpTagDdFilter = bvpTagDdFilter;
window.bvpTagDdPick = bvpTagDdPick;
window.bvpTagDdKey = bvpTagDdKey;
window.enterBulk = enterBulk;
window.bulkSnapshot = bulkSnapshot;
window.bulkUndo = bulkUndo;
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
window.openBulkPlOp = openBulkPlOp;
window.bulkPlConfirm = bulkPlConfirm;
window.bulkPlConfirmNew = bulkPlConfirmNew;
window.bulkPlRemove = bulkPlRemove;
window.resetVpPlModal = resetVpPlModal;
window.bulkDo = bulkDo;
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

// ═══ AI一括実行（字幕生成 / AI要約）═══════════════════════
// 動画をまるごとGeminiへ送るため1本ずつ順番に処理する（並列にするとレート制限と
// Worker側のタイムアウトを踏む）。開始前に対象本数と概算コストを必ず提示し、
// 実行中はいつでも中断できるようにする。
let _bulkAiAbort = false;

function _bulkAiEligible(vids) {
  // 字幕もYouTubeに対応した（Driveは同じフォルダのSRT、YouTubeは字幕ドキュメントへ保存）
  return vids.filter(v => v.pt === 'gdrive' || (v.pt === 'youtube' && v.ytId));
}

function _bulkAiFmtUsd(n) { return n == null ? '—' : '$' + (n < 0.01 ? n.toFixed(4) : n.toFixed(2)); }

function _bulkAiOverlay(html) {
  let ov = document.getElementById('bulk-ai-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'bulk-ai-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,.5);'
      + 'display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div onclick="event.stopPropagation()" style="background:var(--surface);border:1.5px solid var(--border);
      border-radius:14px;padding:18px 20px;width:min(430px,100%);max-height:82vh;overflow-y:auto;
      box-shadow:0 12px 40px rgba(0,0,0,.35)">${html}</div>`;
  return ov;
}
function _bulkAiClose() { document.getElementById('bulk-ai-ov')?.remove(); }

export async function bulkAiRun() {
  const label = '字幕生成';
  const all   = [...(window.selIds || new Set())]
    .map(id => (window.videos || []).find(v => v.id === id)).filter(Boolean);
  const cands = _bulkAiEligible(all);

  if (!cands.length) {
    window.toast?.('YouTube または Google Drive の動画が選択されていません');
    return;
  }
  // Driveの認証が要るのはDrive動画があるときだけ（YouTubeはDriveを経由しない）
  if (cands.some(v => v.pt === 'gdrive') && !window.getDriveTokenIfAvailable?.()) {
    window.toast?.('Google Drive の認証が必要です。動画を一度再生してください。');
    return;
  }

  const skipped = all.length - cands.length;
  const known   = cands.filter(v => Number(v.duration) > 0);
  const totalSec = known.reduce((s, v) => s + Number(v.duration), 0);
  // 尺が分かっている動画から1本あたりの平均を出し、不明ぶんも同じ尺とみなして概算する
  const avgSec  = known.length ? totalSec / known.length : 0;
  const estSec  = avgSec ? totalSec + avgSec * (cands.length - known.length) : 0;
  const est     = estSec ? window.wkEstimateAiCost?.(estSec) : null;

  const langRow = `
    <div style="margin-top:12px">
      <div style="font-size:11.5px;font-weight:700;margin-bottom:5px">出力言語</div>
      <select id="bulk-ai-lang" style="width:100%;padding:7px 9px;border-radius:8px;border:1.5px solid var(--border);
        background:var(--surface);color:var(--text);font-family:inherit;font-size:12px">
        <option value="ja">日本語</option><option value="orig">原語のまま</option>
      </select>
    </div>`;

  const skipRow = `
    <label style="display:flex;align-items:flex-start;gap:8px;margin-top:12px;cursor:pointer">
      <input type="checkbox" id="bulk-ai-skip" checked style="accent-color:var(--accent);width:15px;height:15px;margin-top:1px">
      <span style="font-size:11.5px;line-height:1.5">すでにその言語の字幕があるものは飛ばす<div style="font-size:10.5px;color:var(--text3)">別の言語の字幕しか無いものは、書き起こしをやり直さず翻訳して作ります（音声認識の料金がかかりません）。外すと既存の字幕を作り直して上書きします</div></span>
    </label>`;

  _bulkAiOverlay(`
    <div style="font-size:14px;font-weight:800;margin-bottom:4px">💬 ${label}を一括実行</div>
    <div style="font-size:11.5px;color:var(--text3);line-height:1.6;margin-bottom:10px">
      1本ずつ順番に処理します。時間がかかるので画面はこのままにしてください。<br>途中でいつでも中止できます。
    </div>
    <div style="background:var(--surface2);border-radius:9px;padding:10px 12px;font-size:12px;line-height:1.9">
      <div>対象: <b>${cands.length}本</b>${skipped ? `<span style="color:var(--text3)">（対象外 ${skipped}本を除外）</span>` : ''}</div>
      <div>合計時間: <b>${estSec ? Math.round(estSec / 60) + '分' : '不明'}</b>${
        known.length < cands.length ? `<span style="color:var(--text3)">（${cands.length - known.length}本は尺不明のため平均で概算）</span>` : ''}</div>
      <div>概算コスト: <b>${_bulkAiFmtUsd(est)}</b><span style="color:var(--text3)"> ※実測は処理後に出ます</span></div>
    </div>
    ${langRow}${skipRow}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button onclick="_bulkAiCloseBtn()" style="padding:7px 16px;border-radius:8px;border:1.5px solid var(--border);
        background:transparent;color:var(--text2);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">キャンセル</button>
      <button onclick="_bulkAiStart()" style="padding:7px 18px;border-radius:8px;border:1.5px solid var(--accent);
        background:var(--accent);color:var(--on-accent);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">開始する</button>
    </div>`);
}

window._bulkAiCloseBtn = () => _bulkAiClose();

window._bulkAiStart = async function() {
  const label    = '字幕生成';
  const subLang  = document.getElementById('bulk-ai-lang')?.value || 'ja';
  const skipDone = document.getElementById('bulk-ai-skip')?.checked !== false;

  const all   = [...(window.selIds || new Set())]
    .map(id => (window.videos || []).find(v => v.id === id)).filter(Boolean);
  const targets = _bulkAiEligible(all);
  // 字幕の既存判定はDrive上のファイルを見ないと分からないので、
  // vpGenSubtitle 側の existing 指定に委ねる（skip なら課金前に抜ける）。

  if (!targets.length) { _bulkAiClose(); window.toast?.('処理対象がありませんでした（すべて完了済み）'); return; }

  _bulkAiAbort = false;
  window.wkAiBusyBegin?.();   // 実行中はページ離脱を警告する（動画と動画の間も含めて）
  let done = 0, ok = 0, skip = 0, ng = 0, cost = 0;
  const errors = [];

  const paint = (curTitle) => {
    _bulkAiOverlay(`
      <div style="font-size:14px;font-weight:800;margin-bottom:8px">💬 ${label}を実行中</div>
      <div style="font-size:12px;margin-bottom:6px"><b>${done}</b> / ${targets.length} 本</div>
      <div style="height:7px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${Math.round(done / targets.length * 100)}%;background:var(--accent);transition:width .3s"></div>
      </div>
      <div style="font-size:11.5px;color:var(--text3);line-height:1.6;word-break:break-all;min-height:34px">
        ${curTitle ? '処理中: ' + curTitle : ''}
      </div>
      <div style="font-size:11.5px;line-height:1.8;margin-top:8px">
        完了 ${ok} ／ スキップ ${skip} ／ 失敗 ${ng}<br>
        実測コスト: <b>${_bulkAiFmtUsd(cost)}</b>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button onclick="_bulkAiCancel()" style="padding:7px 16px;border-radius:8px;border:1.5px solid var(--red,#ef4444);
          background:transparent;color:var(--red,#ef4444);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">中止する</button>
      </div>`);
  };
  paint('');

  try {
  for (const v of targets) {
    if (_bulkAiAbort) break;
    paint(v.title || v.id);
    let r = null;
    try {
      r = await window.vpGenSubtitle?.(v.id, { subLang, silent: true, existing: skipDone ? 'skip' : 'replace' });
    } catch (e) {
      r = { ok: false, error: e?.message || String(e) };
    }
    done++;
    if (r?.ok)           { ok++; cost += Number(r.cost) || 0; }
    else if (r?.skipped) { skip++; }
    else                 { ng++; errors.push(`${v.title || v.id}: ${r?.error || '不明なエラー'}`); }
    paint(v.title || v.id);
  }
  } finally {
    window.wkAiBusyEnd?.();   // 途中で例外が出ても離脱警告を残さない
  }

  const stopped = _bulkAiAbort;
  _bulkAiOverlay(`
    <div style="font-size:14px;font-weight:800;margin-bottom:8px">${stopped ? '⏹ 中止しました' : '✅ 完了しました'}</div>
    <div style="background:var(--surface2);border-radius:9px;padding:10px 12px;font-size:12px;line-height:1.9">
      <div>完了: <b>${ok}本</b></div>
      <div>スキップ: ${skip}本</div>
      <div>失敗: ${ng}本</div>
      <div>実測コスト: <b>${_bulkAiFmtUsd(cost)}</b></div>
    </div>
    ${errors.length ? `<div style="margin-top:10px">
      <div style="font-size:11.5px;font-weight:700;margin-bottom:4px">失敗した動画</div>
      <div style="font-size:10.5px;color:var(--text3);line-height:1.7;max-height:150px;overflow-y:auto;word-break:break-all">
        ${errors.map(e => '・' + String(e).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))).join('<br>')}
      </div></div>` : ''}
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button onclick="_bulkAiCloseBtn()" style="padding:7px 18px;border-radius:8px;border:1.5px solid var(--accent);
        background:var(--accent);color:var(--on-accent);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer">閉じる</button>
    </div>`);
};

window._bulkAiCancel = function() {
  _bulkAiAbort = true;
  window.toast?.('現在の1本が終わったら中止します');
};

window.bulkAiRun = bulkAiRun;
