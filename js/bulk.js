// ═══ WAZA KIMURA — Bulk操作 ═══

function openBulkVPanel() {
  if (!selIds.size) { toast('動画を選択してください'); return; }
  const panel = document.getElementById('bulk-vpanel');
  const body = document.getElementById('bulk-vpanel-body');
  const sub = document.getElementById('bulk-vpanel-subtitle');
  if (!panel || !body) return;
  if (sub) sub.textContent = selIds.size + '本の動画を編集中';
  body.innerHTML = buildBulkDrawerHTML();
  // イベントバインド
  body.querySelectorAll('.vp-tech-rm').forEach(el => { el.onclick = function(){ bvpRemoveTag('tech', this); }; });
  body.querySelectorAll('.vp-pos-rm').forEach(el =>  { el.onclick = function(){ bvpRemoveTag('pos',  this); }; });
  panel.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeBulkVPanel() {
  const panel = document.getElementById('bulk-vpanel');
  if (panel) panel.classList.remove('show');
  document.body.style.overflow = '';
}

// 一括編集VPanel用のDrawerHTML（動画プレビューなし）
function buildBulkDrawerHTML() {
  const TB_OPTS = ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'];
  const AC_OPTS = ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル'];
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const POS_ALL = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  const TECH_ALL = [...new Set(videos.flatMap(v=>v.tech||[]))].sort();

  // 共通タグ（選択中の全動画が持っているタグ）
  const selVids = [...selIds].map(id => videos.find(v=>v.id===id)).filter(Boolean);
  const commonPos  = POS_ALL.filter(p  => selVids.every(v => (v.pos||[]).includes(p)));
  const commonTech = TECH_ALL.filter(t => selVids.every(v => (v.tech||[]).includes(t)));

  const prioChips = ['今すぐ','そのうち','保留'].map(p => {
    const cls = ['on-p1','on-p2','on-p3'][['今すぐ','そのうち','保留'].indexOf(p)];
    const label = ['🔴 今すぐ','🟡 そのうち','⚪ 保留'][['今すぐ','そのうち','保留'].indexOf(p)];
    return `<span class="vp-chip" onclick="bvpSet('prio','${p}',this,'${cls}')">${label}</span>`;
  }).join('');

  const progChips = ['未着手','練習中','マスター'].map(s => {
    const cls = ['on-s0','on-s1','on-s2'][['未着手','練習中','マスター'].indexOf(s)];
    const label = ['📋 未着手','🔵 練習中','✅ マスター'][['未着手','練習中','マスター'].indexOf(s)];
    return `<span class="vp-chip" onclick="bvpSet('status','${s}',this,'${cls}')">${label}</span>`;
  }).join('');

  const tbChips = TB_OPTS.map(t =>
    `<span class="vp-chip" onclick="bvpToggle('tb','${t}',this,'on-tb')">${t}</span>`
  ).join('');

  const acChips = AC_OPTS.map(a =>
    `<span class="vp-chip" onclick="bvpToggle('ac','${a}',this,'on-ac')">${a}</span>`
  ).join('');

  const posChips = commonPos.map(p =>
    `<span class="vp-chip on-pos vp-pos-rm" data-val="${p.replace(/"/g,'&quot;')}">${p} ×</span>`
  ).join('');

  const techChips = commonTech.map(t =>
    `<span class="vp-chip on-tech vp-tech-rm" data-val="${t.replace(/"/g,'&quot;')}">${t} ×</span>`
  ).join('');

  return `
    <div class="vp-row">
      <span class="vp-lbl">Status</span>
      <div class="vp-chips">
        <span class="vp-chip" onclick="bvpToggleWatch(this)">${'👁 視聴済み'}</span>
        <span class="vp-chip" onclick="bvpToggleFav(this)">${'☆ Fav'}</span>
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
      <span class="vp-lbl">トップ/ボトム</span>
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

// ── BVP操作関数 ──

function bvpSet(field, val, el, onClass) {
  bulkSnapshot();
  const ids = [...selIds];
  const fieldMap = { prio:'prio', status:'status' };
  const f = fieldMap[field] || field;
  ids.forEach(id => { const v=videos.find(v=>v.id===id); if(v) v[f]=val; });
  // チップ状態更新
  const rowId = field==='prio' ? 'bvp-prio' : 'bvp-prog';
  document.querySelectorAll('#'+rowId+' .vp-chip').forEach(c=>
    ['on-p1','on-p2','on-p3','on-s0','on-s1','on-s2'].forEach(cl=>c.classList.remove(cl))
  );
  el.classList.add(onClass);
  toast(selIds.size+'本に「'+val+'」を設定');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpToggle(field, val, el, onClass) {
  bulkSnapshot();
  const isOn = el.classList.contains(onClass);
  const ids = [...selIds];
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    const arr = v[field]||[];
    if(isOn) v[field]=arr.filter(x=>x!==val);
    else if(!arr.includes(val)) v[field]=[...arr,val];
  });
  el.classList.toggle(onClass, !isOn);
  toast((isOn?'削除: ':'追加: ')+'「'+val+'」 → '+selIds.size+'本');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpToggleWatch(el) {
  bulkSnapshot();
  // 全動画を「視聴済み」にトグル（過半数が視聴済みなら未視聴に、そうでなければ視聴済みに）
  const ids=[...selIds]; const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  const watchedCount=vids.filter(v=>v.watched).length;
  const setTo = watchedCount < vids.length/2;
  vids.forEach(v=>v.watched=setTo);
  el.textContent = setTo ? '✅ 視聴済み' : '👁 未視聴';
  el.classList.toggle('on-s1', setTo);
  toast(selIds.size+'本を'+(setTo?'視聴済み':'未視聴')+'に設定');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpToggleFav(el) {
  bulkSnapshot();
  const ids=[...selIds]; const vids=ids.map(id=>videos.find(v=>v.id===id)).filter(Boolean);
  const favCount=vids.filter(v=>v.fav).length;
  const setTo = favCount < vids.length/2;
  vids.forEach(v=>v.fav=setTo);
  el.textContent = setTo ? '⭐ Fav' : '☆ Fav';
  el.classList.toggle('on-fav-chip', setTo);
  toast(selIds.size+'本をFav'+(setTo?'追加':'解除'));
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpRemoveTag(field, el) {
  bulkSnapshot();
  const val = el.dataset.val;
  const ids=[...selIds];
  ids.forEach(id => {
    const v=videos.find(v=>v.id===id); if(!v) return;
    v[field]=(v[field]||[]).filter(x=>x!==val);
  });
  el.remove();
  toast(selIds.size+'本から「'+val+'」を削除');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpAddPos() {
  const inp = document.getElementById('bvp-pos-inp');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  bulkSnapshot();
  const ids=[...selIds];
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
  toast(added+'本に「'+val+'」を追加');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpAddTech() {
  const inp = document.getElementById('bvp-tech-inp');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  bulkSnapshot();
  const ids=[...selIds];
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
  toast(added+'本に「'+val+'」を追加');
  AF(); if(bulkCtx==='organize') renderOrg(); debounceSave();
}

function bvpPosSuggest(inp) {
  const q = inp.value.trim().toLowerCase();
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const all = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  const sug = document.getElementById('bvp-pos-sug');
  if (!sug) return;
  const matches = q ? all.filter(p=>p.toLowerCase().includes(q)) : all;
  // mousedownを使うことでinputのblurより先にクリック処理を走らせる
  sug.innerHTML = matches.slice(0,16).map(p =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-pos-inp').value='${p.replace(/'/g,"\'")}';bvpAddPos()">${p}</span>`
  ).join('');
}

function bvpTechSuggest(inp) {
  const q = inp.value.trim().toLowerCase();
  const all = [...new Set(videos.flatMap(v=>v.tech||[]))].sort();
  const sug = document.getElementById('bvp-tech-sug');
  if (!sug) return;
  const matches = q ? all.filter(t=>t.toLowerCase().includes(q)) : all;
  sug.innerHTML = matches.slice(0,16).map(t =>
    `<span class="vp-tech-sug-chip" onmousedown="event.preventDefault();document.getElementById('bvp-tech-inp').value='${t.replace(/'/g,"\'")}';bvpAddTech()">${t}</span>`
  ).join('');
}


function enterBulk(ctx='home', preserveSel=false){
  bulkMode=true;bulkCtx=ctx;
  if(!preserveSel) selIds.clear();
  bulkUndoStack=[];
  document.getElementById('bulkBar').classList.add('show');
  const sh=document.getElementById('sh');if(sh)sh.style.display='none';
  // PCサイドバーの一括ボタンを「終了」に切り替え
  const fsBtn=document.getElementById('fs-bulk-sel-btn');
  if(fsBtn){fsBtn.textContent='✕ 一括終了';fsBtn.onclick=exitBulk;fsBtn.style.color='var(--accent)';}
  if(ctx==='organize'){
    const orgBtn=document.getElementById('org-bulk-btn');if(orgBtn)orgBtn.style.display='none';
    if(!preserveSel) renderOrg();
  } else {
    AF();
  }
  buildBbPosRow();
  buildBbTechRow();
  updBulk();
}
function bulkSnapshot(){bulkUndoStack.push(videos.map(v=>({id:v.id,prio:v.prio,status:v.status,watched:v.watched,fav:v.fav,tb:[...(v.tb||[])],ac:[...(v.ac||[])],pos:[...(v.pos||[])],tech:[...(v.tech||[])],pl:v.pl,archived:v.archived})));}
// ─── Bulk Picker ───
const BULK_PICKER_OPTS_BASE = {
  status: [{val:'watched',label:'視聴済み'},{val:'unwatched',label:'未視聴'},{val:'fav-add',label:'Fav 追加'},{val:'fav-remove',label:'Fav 解除'}],
  prio: [{val:'今すぐ',label:'今すぐ'},{val:'そのうち',label:'そのうち'},{val:'保留',label:'保留'}],
  prog: [{val:'未着手',label:'未着手'},{val:'練習中',label:'練習中'},{val:'マスター',label:'マスター'}],
  tb:   [{val:'トップ',label:'トップ'},{val:'ボトム',label:'ボトム'},{val:'スタンディング',label:'スタンディング'},{val:'バック',label:'バック'},{val:'ハーフ',label:'ハーフ'},{val:'ドリル',label:'ドリル'}],
  ac:   [{val:'エスケープ・ディフェンス',label:'エスケープ・ディフェンス'},{val:'パスガード',label:'パスガード'},{val:'アタック',label:'アタック'},{val:'スイープ',label:'スイープ'},{val:'リテンション',label:'リテンション'},{val:'コントロール',label:'コントロール'},{val:'テイクダウン',label:'テイクダウン'},{val:'フィニッシュ',label:'フィニッシュ'},{val:'ドリル',label:'ドリル'}]
};
function getBulkPickerOpts(type) {
  if(type !== 'pos') return BULK_PICKER_OPTS_BASE[type] || [];
  // Positionはライブラリ既存データ＋固定リストを統合
  const POS_BASE = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
  const all = [...new Set([...POS_BASE, ...videos.flatMap(v=>v.pos||[])])].sort();
  return all.map(p => ({val:p, label:p}));
}
let activeBulkPicker = null;

function bulkUndo(){if(!bulkUndoStack.length){toast('元に戻す履歴がありません');return;}const snap=bulkUndoStack.pop();snap.forEach(s=>{const v=videos.find(v=>v.id===s.id);if(v)Object.assign(v,s);});AF();if(bulkCtx==='organize')renderOrg();resetBulkPickers();toast('↩ 元に戻しました');debounceSave();}
function resetBulkPickers(){
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
function exitBulk(){
  bulkMode=false;selIds.clear();resetBulkPickers();
  document.getElementById('bulkBar').classList.remove('show');
  document.getElementById('sh').style.display='';
  closeBulkVPanel();
  // PCサイドバーの一括ボタンを元に戻す
  const fsBtn=document.getElementById('fs-bulk-sel-btn');
  if(fsBtn){fsBtn.textContent='☑ 一括編集';fsBtn.onclick=()=>enterBulk();fsBtn.style.color='var(--accent)';}
  if(bulkCtx==='organize'){
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=false;
    const orgBtn=document.getElementById('org-bulk-btn');if(orgBtn)orgBtn.style.display='';
    renderOrg();
  } else {
    AF();
  }
}
function togSel(id){selIds.has(id)?selIds.delete(id):selIds.add(id);const c=document.getElementById(`sel-${id}`)?.querySelector('.sel-circle');if(c){c.classList.toggle('chk',selIds.has(id));c.textContent=selIds.has(id)?'✓':'';}updBulk();}

function orgRowClick(event, id) {}
function orgTogSel(id, cb) {
  if (cb.checked && !bulkMode) {
    // 初回チェックで一括編集モードを自動起動（selIdsを保持）
    selIds.add(id); // 先に追加してからpreserveSel=trueで起動
    enterBulk('organize', true);
    const rowCb = document.getElementById('org-cb-' + id);
    if (rowCb) rowCb.checked = true;
    const total = document.querySelectorAll('[id^="org-row-"]').length;
    const selAllCb = document.getElementById('org-sel-all');
    if (selAllCb) selAllCb.checked = selIds.size === total && total > 0;
    updBulk();
    return;
  }
  cb.checked ? selIds.add(id) : selIds.delete(id);
  // 全選択チェックボックスの状態を更新
  const total = document.querySelectorAll('[id^="org-row-"]').length;
  const selAllCb = document.getElementById('org-sel-all');
  if (selAllCb) selAllCb.checked = selIds.size === total && total > 0;
  updBulk();
}
function orgTogSelAll(cb) {
  document.querySelectorAll('[id^="org-row-"]').forEach(tr => {
    const id = tr.id.replace('org-row-', '');
    cb.checked ? selIds.add(id) : selIds.delete(id);
    const rowCb = tr.querySelector('input[type=checkbox]');
    if (rowCb) rowCb.checked = cb.checked;
  });
  if (cb.checked && selIds.size > 0 && !bulkMode) {
    // preserveSel=true でselIdsを保持したままenterBulk
    enterBulk('organize', true);
  } else if (!cb.checked) {
    selIds.clear();
    updBulk();
  } else {
    updBulk();
  }
}
function updBulk(){
  document.getElementById('bulkTit').textContent=selIds.size+'本を選択中';
  const btn=document.getElementById('bulk-sel-btn');
  if(btn)btn.textContent=bulkMode&&selIds.size>0?'☑ '+selIds.size+' 選択中':'☑ Select';
  // 一括編集ボタンの有効/無効
  const editBtn=document.getElementById('bulk-edit-vpanel-btn');
  if(editBtn){
    const hasSelections=selIds.size>0;
    editBtn.style.opacity=hasSelections?'1':'0.4';
    editBtn.style.pointerEvents=hasSelections?'auto':'none';
  }
  // 整理タブ行のハイライト更新
  if(bulkCtx==='organize'){document.querySelectorAll('[id^="org-row-"]').forEach(tr=>{const id=tr.id.replace('org-row-','');tr.style.background=selIds.has(id)?'var(--surface2)':'';}); }
}
function selAll(){
  if(bulkCtx==='organize'){
    // 整理タブ: 現在表示中の行を全選択
    document.querySelectorAll('[id^="org-row-"]').forEach(tr=>{
      const id=tr.id.replace('org-row-','');
      selIds.add(id);
      const cb=tr.querySelector('input[type=checkbox]');if(cb)cb.checked=true;
    });
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=true;
  } else {
    const f=filt(videos);f.forEach(v=>selIds.add(v.id));AF();
  }
  updBulk();
}
function selNone(){
  selIds.clear();
  if(bulkCtx==='organize'){
    document.querySelectorAll('[id^="org-row-"] input[type=checkbox]').forEach(cb=>cb.checked=false);
    const selAllCb=document.getElementById('org-sel-all');if(selAllCb)selAllCb.checked=false;
    updBulk();
  } else {
    AF();updBulk();
  }
}
function bulkSetPrio(val){bulkSnapshot();const ids=[...selIds];ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.prio=val;});AF();toast('✅ '+ids.length+'本 → Priority: '+val);}
function bulkSetProg(val){bulkSnapshot();const ids=[...selIds];ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.status=val;});AF();toast('✅ '+ids.length+'本 → Progress: '+val);}
function bulkTogTag(field,val){bulkSnapshot();const ids=[...selIds];let added=0,removed=0;ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(!v)return;const arr=v[field]||[];if(arr.includes(val)){v[field]=arr.filter(x=>x!==val);removed++;}else{v[field]=[...arr,val];added++;}});toast((added?'＋'+added+'本に追加 ':'')+( removed?'−'+removed+'本から除去 ':'')+val);AF();}
// ═══ BULK PLAYLIST OPERATIONS ═══
let _bulkPlMode = null; // 'move' or 'copy'

function openBulkPlOp(mode) {
  if(!selIds.size){ toast('動画を選択してください'); return; }
  _bulkPlMode = mode;
  _vpPlOp = {id: null, mode: mode}; // モーダルを再利用

  const title = document.getElementById('vpPlOvTitle');
  const desc  = document.getElementById('vpPlOvDesc');
  const list  = document.getElementById('vpPlOvList');
  const inp   = document.getElementById('vpPlOvNew');

  const count = selIds.size;
  title.textContent = mode==='move' ? `↪ プレイリストに移動（${count}本）` : `⧉ プレイリストにコピー（${count}本）`;
  desc.textContent  = mode==='move'
    ? '選択した動画を移動先プレイリストに移動します'
    : '選択した動画を別のプレイリストにコピーします';
  inp.value = '';

  // 既存プレイリスト一覧
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
  document.querySelector('#vpPlOv .btn-save').onclick = ()=>{ closeOv('vpPlOv'); };
  document.getElementById('vpPlOv').classList.add('open');
}

function bulkPlConfirm(targetPl) {
  const ids = [...selIds];
  const mode = _bulkPlMode;
  if(mode==='move'){
    ids.forEach(id=>{ const v=videos.find(v=>v.id===id); if(v) v.pl=targetPl; });
    closeOv('vpPlOv');
    AF();
    toast(`↪ ${ids.length}本を「${targetPl}」に移動しました`);
  } else {
    const copies = ids.map(id=>{
      const v=videos.find(v=>v.id===id); if(!v) return null;
      const copy=JSON.parse(JSON.stringify(v));
      copy.id=v.id+'_copy_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      copy.pl=targetPl;
      return copy;
    }).filter(Boolean);
    copies.forEach(c=>videos.push(c));
    closeOv('vpPlOv');
    AF();
    toast(`⧉ ${copies.length}本を「${targetPl}」にコピーしました`);
  }
}

function bulkPlConfirmNew() {
  const val = document.getElementById('vpPlOvNew').value.trim();
  if(!val){ toast('プレイリスト名を入力してください'); return; }
  bulkPlConfirm(val);
}

function bulkPlRemove() {
  if(!selIds.size){ toast('動画を選択してください'); return; }
  const ids = [...selIds];
  showConf('✕ プレイリストから削除', `${ids.length}本を「未分類」に移動します。`, ()=>{
    ids.forEach(id=>{ const v=videos.find(v=>v.id===id); if(v) v.pl='未分類'; });
    AF();
    toast(`✕ ${ids.length}本を未分類に移動しました`);
  });
}

// 個別動画のvpPlOvConfirmNewをモーダル再利用に合わせてリセット
function resetVpPlModal() {
  const inp = document.getElementById('vpPlOvNew');
  if(inp) inp.onkeydown = function(e){ if(e.key==='Enter') vpPlOvConfirmNew(); };
}

function bulkDo(type){if(!selIds.size){toast('動画を選択してください');return;}const ids=[...selIds];if(type==='watched'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.watched=true;});AF();toast('✅ '+ids.length+'本を視聴済みに');}else if(type==='unwatched'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.watched=false;});AF();toast('👁 '+ids.length+'本を未視聴に戻した');}else if(type==='fav-add'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.fav=true;});AF();toast('⭐ '+ids.length+'本をお気に入りに追加');}else if(type==='fav-remove'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.fav=false;});AF();toast('☆ '+ids.length+'本のお気に入りを解除');}else if(type==='archive'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.archived=true;});AF();toast('📦 '+ids.length+'本をアーカイブ');}else if(type==='share'){ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.shared=2;});AF();toast('🌐 '+ids.length+'本を全体公開にシェア');}else if(type==='remove'){showConf('📋 PL除外',ids.length+'本をプレイリストから除外します。',()=>{ids.forEach(id=>{const v=videos.find(v=>v.id===id);if(v)v.pl='（除外済）';});AF();toast('✂ 除外しました');});}}

// ── 整理タブ ──
// 判断ステータス管理（videoオブジェクトのjudge フィールドを使用）
// judge: undefined/'pending' = 未判断, 'watch' = 見る, 'skip' = 見ない, 'later' = 後で


