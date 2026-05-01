// flowchart.js — Map ブロック全画面エディタ
// API: window.fcOpenEditor(mapData, onSave)
//      mapData: { name, nodes, edges, abState }
//      onSave:  function(mapData) called on close

(function(){
  // ── Element helper ────────────────────────────────────────────
  function _el(id){ return document.getElementById('fc-'+id); }

  // ── State ─────────────────────────────────────────────────────
  let _nodes=[], _edges=[], _abState={}, _mapName='';
  let _onSave=null;
  let _panX=60, _panY=40, _panning=false, _panSt={x:0,y:0};
  let _dragNode=null, _dragOff={x:0,y:0};
  let _connecting=null;
  let _ctxNodeId=null, _editingEdgeId=null;
  let _edgePopupId=null;
  let _longPressTimer=null;
  let _placing=false, _pendingContent=null;
  let _addBtnCancelling=false;
  let _onVidInsert=null, _onImgInsert=null;
  let _nc=20, _ec=10;
  let _ytPlayers={}, _ytTimers={};
  let _resizeNode=null;
  let _wired=false;

  function _initVidNode(nodeId){
    const nd=_nodes.find(n=>n.id===nodeId); if(!nd?.content?.videoId) return;
    const platform=nd.content.platform||'youtube';
    const rawId=nd.content.videoId;
    const div=document.getElementById('fc-vid-'+nodeId); if(!div) return;
    if(platform==='youtube'){
      if(!window.YT?.Player){ setTimeout(()=>_initVidNode(nodeId),500); return; }
      // fc-vid-X is the inner target; YT.Player replaces it with <iframe>
      // Outer fc-vid-wrap-X (.node-yt-div) stays intact for _reRenderVideoNode
      _ytPlayers[nodeId]=new YT.Player('fc-vid-'+nodeId,{
        videoId:rawId, width:'100%', height:'100%',
        playerVars:{rel:0,modestbranding:1,autoplay:0,playsinline:1},
        events:{onReady:(e)=>{
          const ifr=e.target.getIframe();
          if(ifr){ ifr.style.cssText='width:100%;height:100%;border:none;display:block'; }
          _updateDurLabel(nodeId,e.target.getDuration()); _startNodeTimer(nodeId);
        }}
      });
    } else if(platform==='gdrive'){
      const gdId=rawId.replace(/^gd-/,'');
      div.innerHTML=`<iframe src="https://drive.google.com/file/d/${gdId}/preview" frameborder="0" allow="autoplay;fullscreen" allowfullscreen style="border:none;display:block;width:100%;height:100%"></iframe>`;
    } else {
      const vmId=rawId.replace(/^yt-/,'');
      const hash=nd.content.vmHash?`?h=${nd.content.vmHash}`:'';
      div.innerHTML=`<iframe src="https://player.vimeo.com/video/${vmId}${hash}" frameborder="0" allow="autoplay;fullscreen" allowfullscreen style="border:none;display:block;width:100%;height:100%"></iframe>`;
    }
  }
  function _startNodeTimer(nodeId){
    if(_ytTimers[nodeId]) return;
    _ytTimers[nodeId]=setInterval(()=>{
      const p=_ytPlayers[nodeId]; if(!p?.getCurrentTime) return;
      const t=p.getCurrentTime();
      const sl=document.getElementById('fc-ab-sl-'+nodeId); if(sl) sl.value=t;
      const disp=document.getElementById('fc-ab-disp-'+nodeId);
      const st=_getAb(nodeId);
      if(disp) disp.textContent=_fmt(st.activeTab==='a'?(st.a??t):(st.b??t));
      if(st.looping&&st.a!=null&&st.b!=null&&t>=st.b) p.seekTo(st.a,true);
    },200);
  }
  function _updateDurLabel(nodeId,dur){ const lbl=document.getElementById('fc-ab-dur-'+nodeId); if(lbl) lbl.textContent=_fmt(dur); }
  function _curTime(nodeId){ return _ytPlayers[nodeId]?.getCurrentTime?.()||0; }

  // ── AB state ──────────────────────────────────────────────────
  function _getAb(nid){
    if(!_abState[nid]) _abState[nid]={a:null,b:null,looping:false,activeTab:'a',bookmarks:[],abOpen:false};
    return _abState[nid];
  }

  // ── Library ───────────────────────────────────────────────────
  function _getLib(){
    return (window.videos||[]).map(v=>({
      id: v.id, vid: v.id, title: v.title||v.id,
      cat: v.position||v.cat||'',
      bookmarks: _mapLibBms(v.bookmarks||[])
    }));
  }
  function _mapLibBms(bms){
    // VPanel format: {time, endTime, label, note} → flowchart format: {a, b, label}
    return bms.map(b=>({ label:b.label||'', a:b.time??b.a??0, b:b.endTime??b.b??((b.time??0)+30) }));
  }

  // ── Public API ────────────────────────────────────────────────
  window.fcOpenEditor = function(mapData, onSave){
    _onSave = onSave;
    _mapName  = mapData.name  || '新しいマップ';
    _nodes    = (mapData.nodes||[]).map(n=>({...n}));
    _edges    = (mapData.edges||[]).map(e=>({...e}));
    _abState  = JSON.parse(JSON.stringify(mapData.abState||{}));
    _nc = Math.max(20, ..._nodes.map(n=>parseInt(n.id.replace('n',''))||0));
    _ec = Math.max(10, ..._edges.map(e=>parseInt(e.id.replace('e',''))||0));
    _panX=60; _panY=40; _placing=false; _connecting=null;
    _dragNode=null; _edgePopupId=null;

    _ensureOverlay();
    _el('overlay').classList.add('open');
    _el('tb-title').textContent = _mapName;
    _renderAll();
    _el('canvas').style.transform = `translate(${_panX}px,${_panY}px)`;
    if(!_wired){ _wireGlobal(); _wired=true; }
  };

  function _closeEditor(){
    _el('overlay').classList.remove('open');
    // Stop all timers
    Object.values(_ytTimers).forEach(clearInterval);
    _ytTimers={};
    // Destroy YT players
    Object.values(_ytPlayers).forEach(p=>{ try{ p.destroy(); }catch(e){} });
    _ytPlayers={};
    if(_onSave){
      _onSave({ name:_mapName, nodes:_nodes, edges:_edges, abState:_abState });
    }
  }

  // ── Overlay HTML ──────────────────────────────────────────────
  function _ensureOverlay(){
    if(document.getElementById('fc-overlay')) return;
    const o=document.createElement('div');
    o.id='fc-overlay';
    o.innerHTML=`
<div id="fc-topbar">
  <button class="fc-tb-btn" id="fc-back-btn">← 戻る</button>
  <span class="fc-tb-title" id="fc-tb-title" contenteditable="true" spellcheck="false"></span>
  <button class="fc-tb-btn accent" id="fc-add-btn">＋ ノード追加 ▾</button>
</div>
<div id="fc-type-picker">
  <div class="fc-tp-item" data-fc-type="text">💬 テキスト</div>
  <div class="fc-tp-item" data-fc-type="video">▶ 動画</div>
  <div class="fc-tp-item" data-fc-type="image">🖼 画像</div>
</div>
<div id="fc-wrap">
  <div id="fc-canvas">
    <svg id="fc-svg-layer" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M 0 0 L 8 3 L 0 6 Z" fill="#bbb"/>
        </marker>
      </defs>
      <path id="fc-connect-line" d=""/>
    </svg>
    <div id="fc-label-editor"><input id="fc-label-input" type="text" placeholder="条件を入力…"></div>
  </div>
</div>
<div id="fc-ctx-menu">
  <div class="fc-ctx-item" id="fc-ctx-vid">▶ 動画を追加</div>
  <div class="fc-ctx-item" id="fc-ctx-img">🖼 画像を追加</div>
  <div class="fc-ctx-item" id="fc-ctx-txt">💬 テキストを追加</div>
  <div class="fc-ctx-item" id="fc-ctx-chg" style="display:none">🔄 コンテンツを変更</div>
  <div class="fc-ctx-sep"></div>
  <div class="fc-ctx-item danger" id="fc-ctx-del">🗑 削除</div>
</div>
<div id="fc-edge-popup">
  <button class="fc-ep-btn" id="fc-ep-edit">✏ 編集</button>
  <button class="fc-ep-btn danger" id="fc-ep-del">🗑 削除</button>
</div>
<div id="fc-connect-banner">
  <span>「<span id="fc-connect-banner-src" class="fc-connect-banner-src"></span>」から接続中</span>
  <span style="color:#555">→</span>
  <span>青いノードをクリック</span>
  <button class="connect-cancel-btn" id="fc-cancel-connect-btn">✕ キャンセル</button>
</div>
<div id="fc-hint">ノードをドラッグして移動 / 下の ＋ をクリックまたはドラッグで接続</div>`;
    document.body.appendChild(o);
    _wireStatic();
  }

  // ── Static event wiring (once) ────────────────────────────────
  function _wireStatic(){
    _el('back-btn').addEventListener('click', _closeEditor);

    const tb = _el('tb-title');
    tb.addEventListener('blur', ()=>{ _mapName=tb.textContent.trim()||'マップ'; tb.textContent=_mapName; });
    tb.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); tb.blur(); }});

    _el('add-btn').addEventListener('click', e=>{
      e.stopPropagation();
      if(_addBtnCancelling){ _cancelPlace(); } else { _showTypePicker(e); }
    });

    _el('overlay').querySelectorAll('.fc-tp-item').forEach(item=>{
      item.addEventListener('click', ()=>_startPlace(item.dataset.fcType));
    });

    const li = _el('label-input');
    li.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key==='Escape') _finishLabel(); });
    li.addEventListener('blur', _finishLabel);

    _el('ctx-vid').addEventListener('click', ()=>_ctxAct('vid'));
    _el('ctx-img').addEventListener('click', ()=>_ctxAct('img'));
    _el('ctx-txt').addEventListener('click', ()=>_ctxAct('txt'));
    _el('ctx-chg').addEventListener('click', ()=>_ctxAct('chg'));
    _el('ctx-del').addEventListener('click', ()=>_ctxAct('del'));

    _el('ep-edit').addEventListener('click', _edgePopupEdit);
    _el('ep-del').addEventListener('click', _edgePopupDelete);

    _el('cancel-connect-btn').addEventListener('click', _cancelConnect);

  }

  // ── Global event wiring (once) ────────────────────────────────
  function _wireGlobal(){
    _el('wrap').addEventListener('mousedown', _onWrapDown);
    _el('wrap').addEventListener('touchstart', _onWrapTouch, {passive:false});

    document.addEventListener('mousemove', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      if(_dragNode && !(e.buttons & 1)){ const el=document.getElementById('fc-node-'+_dragNode.id); if(el) el.style.zIndex=''; _dragNode=null; }
      if(_resizeNode && !(e.buttons & 1)){ _resizeNode=null; }
      _applyMove(e.clientX, e.clientY);
    });
    document.addEventListener('touchmove', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      e.preventDefault(); _applyMove(e.touches[0].clientX, e.touches[0].clientY);
    },{passive:false});
    document.addEventListener('mouseup', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      _applyRelease(e.clientX, e.clientY, false);
    });
    document.addEventListener('touchend', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      const t=e.changedTouches[0]; _applyRelease(t.clientX, t.clientY, true);
    },{passive:false});
    document.addEventListener('keydown', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      if(e.key==='Escape'){ _cancelPlace(); _cancelConnect(); }
    });
    document.addEventListener('click', e=>{
      if(!_el('overlay').classList.contains('open')) return;
      if(!e.target.closest('#fc-ctx-menu')) _hideCtx();
      if(!e.target.closest('#fc-type-picker')&&!e.target.closest('#fc-add-btn')) _hidePicker();
      if(!e.target.closest('#fc-edge-popup')) _closeEdgePopup();
    });
  }

  // ── Render ────────────────────────────────────────────────────
  function _renderAll(){ _renderNodes(); _renderEdges(); }

  function _renderNodes(){
    const cv = _el('canvas');
    cv.querySelectorAll('.fc-node').forEach(e=>e.remove());
    _nodes.forEach(nd=>{
      const el=document.createElement('div');
      el.id='fc-node-'+nd.id;
      el.className='fc-node'+(nd.content?.type==='video'?' vid-node':'')+(nd._commentOpen?' cm-open':'');
      el.style.left=nd.x+'px'; el.style.top=nd.y+'px';
      if(nd.w) el.style.width=nd.w+'px';
      el.innerHTML=_nodeHTML(nd);
      cv.appendChild(el);
      _wireNode(el,nd);
      if(nd.content?.type==='video' && nd.content.videoId) setTimeout(()=>_initVidNode(nd.id),100);
    });
  }

  function _nodeHTML(nd){
    return `<div class="node-hdr">
      <span class="node-name" id="fc-nm-${nd.id}">${_esc(nd.name)}</span>
      <span class="node-hdr-btn node-cmt-btn${nd._commentOpen?' open':''}" id="fc-cmt-btn-${nd.id}" title="コメント">💬</span>
      <span class="node-hdr-btn node-menu-btn" data-id="${nd.id}">⋮</span>
    </div>
    ${nd.content?_contentHTML(nd):''}
    <div class="node-comment-area" id="fc-cmt-area-${nd.id}">
      <div class="node-cmt-inner">
        <span class="node-cmt-ico">💬</span>
        <div class="node-cmt-txt" id="fc-cmt-txt-${nd.id}" data-ph="コメントを追加…">${_escNl(nd.comment||'')}</div>
      </div>
    </div>
    <div class="fc-resize-handle" title="ドラッグでサイズ変更"></div>
    <div class="node-port" id="fc-port-${nd.id}" title="クリックまたはドラッグで接続">+</div>`;
  }

  function _contentHTML(nd){
    const c=nd.content;
    if(c.type==='text') return `<div class="node-content"><div class="node-text-area" id="fc-ta-${nd.id}" data-ph="テキストを入力…">${_esc(c.text||'')}</div></div>`;
    if(c.type==='image') return `<div class="node-content"><img class="node-img" src="${_esc(c.src)}" alt=""></div>`;
    if(c.type==='video') return _videoHTML(nd);
    return '';
  }

  function _videoHTML(nd){
    const vid=nd.content.videoId||'';
    if(!vid) return `<div class="node-content node-vid-setup">
      <div class="fc-url-row">
        <input class="fc-url-input" id="fc-url-in-${nd.id}" type="text" placeholder="YouTube URL を入力…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window._fcUrlOk('${nd.id}')}"
          onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
        <button class="fc-url-ok-btn" onclick="event.stopPropagation();window._fcUrlOk('${nd.id}')">▶</button>
      </div>
      <button class="fc-lib-btn" onclick="event.stopPropagation();window._fcLibPick('${nd.id}')">📚 ライブラリから選ぶ</button>
    </div>`;
    const platform=nd.content.platform||'youtube';
    const displayUrl=platform==='gdrive'
      ?`drive.google.com/file/d/${vid.replace(/^gd-/,'')}/view`
      :platform==='vimeo'||platform==='vm'
      ?`vimeo.com/${vid.replace(/^yt-/,'')}`
      :`youtube.com/watch?v=${vid}`;
    const isYT=platform==='youtube';
    const st=_getAb(nd.id);
    const bmOpen=st.bmOpen!==false;
    const bmList=st.bookmarks.length
      ?st.bookmarks.map((bm,i)=>`<div class="bm-item">
        <span class="bm-chip" onclick="window._fcSeekBm('${nd.id}',${i})">${_fmt(bm.a)} → ${_fmt(bm.b)}</span>
        <span class="bm-item-label" data-nid="${nd.id}" data-idx="${i}">${_esc(bm.label||'（ラベルなし）')}</span>
        <button class="bm-del-btn" onclick="window._fcDelBm('${nd.id}',${i})">×</button>
        <button class="bm-edit-btn" onclick="window._fcEditBm('${nd.id}',${i})">編集</button>
      </div>`).join('')
      :`<div class="bm-empty">ブックマークなし</div>`;
    const statusBadge=st.a!=null&&st.b!=null
      ?`<span class="ab-status-badge active">${_fmt(st.a)}〜${_fmt(st.b)}</span>`
      :`<span class="ab-status-badge">未設定</span>`;
    const addBmBtn=isYT
      ?`<button class="bm-add-btn" onclick="event.stopPropagation();window._fcAddBmNow('${nd.id}')">＋ 現在位置</button>`
      :`<button class="bm-add-btn" onclick="event.stopPropagation();window._fcAddBmManual('${nd.id}')">＋ 追加</button>`;
    return `<div class="node-content">
      <div class="node-url-bar">${_esc(displayUrl)}</div>
      <div class="node-yt-div" id="fc-vid-wrap-${nd.id}" data-platform="${platform}"><div id="fc-vid-${nd.id}"></div></div>
      ${isYT?`<div class="ab-section">
        <div class="ab-hdr" onclick="window._fcToggleAb('${nd.id}')">
          <span class="ab-hdr-label">🔁 ループ再生</span>${statusBadge}
          <span class="ab-toggle">${st.abOpen?'∧':'∨'}</span>
        </div>
        ${st.abOpen?_abBodyHTML(nd,st):''}
      </div>`:''}
      <div class="bm-section">
        <div class="bm-hdr" onclick="window._fcToggleBm('${nd.id}')">
          <span class="bm-hdr-label">📌 ブックマーク${st.bookmarks.length?` (${st.bookmarks.length})`:''}</span>
          ${addBmBtn}
          <span class="bm-toggle">${bmOpen?'∧':'∨'}</span>
        </div>
        ${bmOpen?`<div class="bm-list" id="fc-bm-list-${nd.id}">${bmList}</div>`:''}
      </div>
      <div class="vpanel-btns">
        <button class="vpanel-btn" onclick="event.stopPropagation();window._fcVpShow('${nd.id}')">▶ Vパネルで開く</button>
        <button class="vpanel-btn" onclick="event.stopPropagation();window._fcVpJump('${nd.id}')">↗ ライブラリへ</button>
      </div>
    </div>`;
  }

  function _abBodyHTML(nd,st){
    return `<div class="ab-body">
      <div class="ab-times-row">
        <span class="ab-pt-lbl">開始:</span><span class="ab-t" id="fc-ab-a-${nd.id}">${_fmt(st.a)}</span>
        <span class="ab-arrow">↔</span>
        <span class="ab-pt-lbl">終了:</span><span class="ab-t" id="fc-ab-b-${nd.id}">${_fmt(st.b)}</span>
        <button class="ab-clear-btn" onclick="window._fcClearAb('${nd.id}')">× クリア</button>
      </div>
      <div class="ab-pt-tabs">
        <button class="ab-pt-tab${st.activeTab==='a'?' on':''}" id="fc-ab-tab-a-${nd.id}" onclick="window._fcSetAbTab('${nd.id}','a')">▶ 開始</button>
        <button class="ab-pt-tab${st.activeTab==='b'?' on':''}" id="fc-ab-tab-b-${nd.id}" onclick="window._fcSetAbTab('${nd.id}','b')">■ 終了</button>
      </div>
      <div class="ab-time-display" id="fc-ab-disp-${nd.id}">${_fmt(st.activeTab==='a'?st.a:st.b)}</div>
      <div class="ab-slider-outer">
        <span style="font-size:9px;color:#888;font-family:monospace;min-width:26px">0:00</span>
        <input type="range" class="ab-slider" id="fc-ab-sl-${nd.id}" min="0" max="300" value="${st.activeTab==='a'?(st.a||0):(st.b||0)}" oninput="window._fcOnSlider('${nd.id}',this.value)">
        <span id="fc-ab-dur-${nd.id}" style="font-size:9px;color:#888;font-family:monospace;min-width:30px;text-align:right">5:00</span>
      </div>
      <div class="ab-micro-row">
        <span class="ab-micro-lbl">微調整</span>
        ${[-10,-5,-3,-1,1,3,5,10].map(s=>`<button class="ab-micro-btn" onclick="window._fcMicroAdj('${nd.id}',${s})">${s>0?'+':''}${s}s</button>`).join('')}
        <button class="ab-micro-btn cur" onclick="window._fcMicroAdj('${nd.id}',null)">現在地</button>
      </div>
      <div class="ab-save-row"><button class="ab-save-btn" onclick="window._fcSaveAbBm('${nd.id}')">✓ 保存</button></div>
    </div>`;
  }

  // ── Node wiring ───────────────────────────────────────────────
  function _wireNode(el,nd){
    const hdr=el.querySelector('.node-hdr');
    hdr.addEventListener('mousedown',e=>{
      if(e.target.classList.contains('node-menu-btn'))return;
      if(e.target.classList.contains('node-cmt-btn'))return;
      if(e.target.classList.contains('node-name')&&e.target.isContentEditable)return;
      e.stopPropagation();
      _dragNode=nd; _dragOff={x:e.clientX-nd.x-_panX,y:e.clientY-nd.y-_panY};
      el.style.zIndex=10;
    });
    hdr.addEventListener('touchstart',e=>{
      if(e.target.classList.contains('node-menu-btn'))return;
      if(e.target.classList.contains('node-cmt-btn'))return;
      e.stopPropagation(); e.preventDefault();
      const t=e.touches[0];
      _dragNode=nd; _dragOff={x:t.clientX-nd.x-_panX,y:t.clientY-nd.y-_panY};
      el.style.zIndex=10;
    },{passive:false});

    const nm=el.querySelector('.node-name');
    nm.addEventListener('dblclick',e=>{ e.stopPropagation(); nm.contentEditable='true'; nm.classList.add('editing'); nm.focus(); _selAll(nm); });
    nm.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();nm.blur()} if(e.key==='Escape'){nm.textContent=_esc(nd.name);nm.blur()} });
    nm.addEventListener('blur',()=>{ nm.contentEditable='false'; nm.classList.remove('editing'); const v=nm.textContent.trim(); if(v) nd.name=v; nm.textContent=nd.name; });

    const ta=el.querySelector('.node-text-area');
    if(ta){
      ta.addEventListener('focus',()=>{ ta.contentEditable='true'; ta.classList.add('editing'); });
      ta.addEventListener('blur',()=>{ ta.contentEditable='false'; ta.classList.remove('editing'); if(nd.content) nd.content.text=ta.textContent.trim(); });
      ta.addEventListener('click',e=>e.stopPropagation());
    }

    el.querySelector('.node-cmt-btn').addEventListener('click',e=>{
      e.stopPropagation();
      nd._commentOpen=!nd._commentOpen;
      el.classList.toggle('cm-open',nd._commentOpen);
      e.currentTarget.classList.toggle('open',nd._commentOpen);
    });

    const cmtTxt=el.querySelector('.node-cmt-txt');
    if(cmtTxt){
      cmtTxt.addEventListener('click',e=>{ e.stopPropagation(); cmtTxt.contentEditable='true'; cmtTxt.classList.add('editing'); cmtTxt.focus(); });
      cmtTxt.addEventListener('blur',()=>{ cmtTxt.contentEditable='false'; cmtTxt.classList.remove('editing'); nd.comment=cmtTxt.textContent.trim(); });
    }

    el.querySelector('.node-menu-btn').addEventListener('click',e=>{ e.stopPropagation(); _showCtx(nd.id,e.clientX,e.clientY); });

    const rh=el.querySelector('.fc-resize-handle');
    if(rh){
      rh.addEventListener('mousedown',e=>{ e.stopPropagation(); _resizeNode={nd,el,startX:e.clientX,startW:el.offsetWidth}; });
      rh.addEventListener('touchstart',e=>{ e.stopPropagation(); e.preventDefault(); const t=e.touches[0]; _resizeNode={nd,el,startX:t.clientX,startW:el.offsetWidth}; },{passive:false});
    }

    el.addEventListener('mouseenter',()=>{ if(_connecting&&el.classList.contains('connect-target')) el.classList.add('connect-hover'); });
    el.addEventListener('mouseleave',()=>el.classList.remove('connect-hover'));
    el.addEventListener('click',e=>{
      if(_connecting&&el.classList.contains('connect-target')){
        e.stopPropagation(); _createEdge(_connecting.fromId,nd.id); _cancelConnect();
      }
    });

    const port=el.querySelector('.node-port');
    port.addEventListener('mousedown',e=>{ e.stopPropagation(); _startConnect(nd,el,port); });
    port.addEventListener('touchstart',e=>{
      e.stopPropagation(); e.preventDefault();
      if(_connecting&&_connecting.fromId!==nd.id&&el.classList.contains('connect-target')){
        _createEdge(_connecting.fromId,nd.id); _cancelConnect(); return;
      }
      if(!_connecting) _startConnect(nd,el,port);
    },{passive:false});
    port.addEventListener('click',e=>{
      e.stopPropagation();
      if(_connecting&&_connecting.fromId!==nd.id&&el.classList.contains('connect-target')){
        _createEdge(_connecting.fromId,nd.id); _cancelConnect(); return;
      }
      if(!_connecting) _startConnect(nd,el,port);
    });
  }

  function _startConnect(nd,el,port){
    const cx=nd.x+el.offsetWidth/2, cy=nd.y+el.offsetHeight;
    _connecting={fromId:nd.id,fromX:cx,fromY:cy};
    port.classList.add('active'); el.classList.add('connect-src');
    const line=_el('connect-line');
    line.setAttribute('d',`M${cx},${cy} C${cx},${cy+40} ${cx},${cy+40} ${cx},${cy+40}`);
    line.style.display='';
    _el('canvas').querySelectorAll('.fc-node').forEach(n=>{ if(n.id!=='fc-node-'+nd.id) n.classList.add('connect-target'); });
    _showConnectBanner(nd.name);
  }

  // ── Edges ─────────────────────────────────────────────────────
  function _renderEdges(){
    const svg=_el('svg-layer');
    svg.querySelectorAll('.fc-edge,.edge-label-group,.fc-edge-del-group').forEach(e=>e.remove());
    _edges.forEach(_drawEdge);
  }

  function _drawEdge(edge){
    const svg=_el('svg-layer');
    const fEl=document.getElementById('fc-node-'+edge.from);
    const tEl=document.getElementById('fc-node-'+edge.to);
    if(!fEl||!tEl) return;
    const fx=parseFloat(fEl.style.left)+fEl.offsetWidth/2;
    const fy=parseFloat(fEl.style.top)+fEl.offsetHeight;
    const tx=parseFloat(tEl.style.left)+tEl.offsetWidth/2;
    const ty=parseFloat(tEl.style.top);
    const cy=(fy+ty)/2;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('fc-edge');
    path.setAttribute('d',`M${fx},${fy} C${fx},${cy} ${tx},${cy} ${tx},${ty}`);
    svg.appendChild(path);

    const lbl=edge.label||'条件を入力…';
    const mx=(fx+tx)/2, my=(fy+ty)/2;
    const w=Math.max(72,lbl.length*7+16);

    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.classList.add('edge-label-group');
    g.style.cursor='pointer';

    const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
    bg.classList.add('edge-label-bg');
    bg.setAttribute('x',mx-w/2); bg.setAttribute('y',my-9); bg.setAttribute('width',w); bg.setAttribute('height',17); bg.setAttribute('rx',4);
    g.appendChild(bg);

    const txt=document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.classList.add('edge-label-text');
    txt.setAttribute('x',mx); txt.setAttribute('y',my+4); txt.setAttribute('text-anchor','middle');
    txt.textContent=lbl; g.appendChild(txt);

    // Pattern A: click → popup
    g.addEventListener('click',e=>{ e.stopPropagation(); _openEdgePopup(edge.id,e.clientX,e.clientY); });
    g.addEventListener('touchend',e=>{
      e.stopPropagation();
      const t=e.changedTouches[0];
      if(!_longPressTimer) _openEdgePopup(edge.id,t.clientX,t.clientY);
    },{passive:false});

    svg.appendChild(g);
  }

  function _deleteEdge(edgeId){
    _edges=_edges.filter(e=>e.id!==edgeId);
    _renderEdges();
  }

  function _openEdgePopup(edgeId,clientX,clientY){
    _edgePopupId=edgeId;
    const p=_el('edge-popup');
    const pw=120,ph=72;
    const left=Math.min(clientX,window.innerWidth-pw-8);
    const top=Math.min(clientY+6,window.innerHeight-ph-8);
    p.style.left=left+'px'; p.style.top=top+'px';
    p.classList.add('open');
  }
  function _closeEdgePopup(){ _el('edge-popup').classList.remove('open'); _edgePopupId=null; }
  function _edgePopupEdit(){
    if(!_edgePopupId) return;
    const edge=_edges.find(e=>e.id===_edgePopupId);
    _closeEdgePopup();
    if(!edge) return;
    const fEl=document.getElementById('fc-node-'+edge.from), tEl=document.getElementById('fc-node-'+edge.to);
    if(!fEl||!tEl) return;
    const mx=(parseFloat(fEl.style.left)+fEl.offsetWidth/2+parseFloat(tEl.style.left)+tEl.offsetWidth/2)/2;
    const my=(parseFloat(fEl.style.top)+fEl.offsetHeight+parseFloat(tEl.style.top))/2;
    _startLabel(_edgePopupId||edge.id, mx, my);
  }
  function _edgePopupDelete(){ const id=_edgePopupId; _closeEdgePopup(); _deleteEdge(id); }

  // ── Label editor ──────────────────────────────────────────────
  function _startLabel(edgeId,cx,cy){
    const edge=_edges.find(e=>e.id===edgeId); if(!edge) return;
    _editingEdgeId=edgeId;
    const ed=_el('label-editor'), inp=_el('label-input');
    ed.style.left=(cx-52)+'px'; ed.style.top=(cy-14)+'px'; ed.style.display='block';
    inp.value=(edge.label&&edge.label!=='条件を入力…')?edge.label:'';
    inp.focus(); inp.select();
  }
  function _finishLabel(){
    if(!_editingEdgeId) return;
    const edge=_edges.find(e=>e.id===_editingEdgeId);
    if(edge){ edge.label=_el('label-input').value.trim()||'条件を入力…'; _renderEdges(); }
    _el('label-editor').style.display='none';
    _editingEdgeId=null;
  }

  // ── Canvas events ─────────────────────────────────────────────
  function _onWrapDown(e){
    if(e.target.closest('.fc-node')) return;
    _hideCtx();
    if(_placing){ _doPlace(e); return; }
    if(_connecting){ _cancelConnect(); return; }
    _panning=true; _panSt={x:e.clientX-_panX,y:e.clientY-_panY};
    _el('wrap').style.cursor='grabbing';
  }
  function _onWrapTouch(e){
    if(e.target.closest('.fc-node')) return;
    e.preventDefault();
    if(_placing){ _doPlaceTouch(e); return; }
    if(_connecting){ _cancelConnect(); return; }
    const t=e.touches[0];
    _panning=true; _panSt={x:t.clientX-_panX,y:t.clientY-_panY};
  }

  function _applyMove(clientX,clientY){
    if(_resizeNode){
      const dw=clientX-_resizeNode.startX;
      const newW=Math.max(200,_resizeNode.startW+dw);
      _resizeNode.el.style.width=newW+'px';
      _resizeNode.nd.w=newW;
      _renderEdges(); return;
    }
    if(_connecting){
      const wr=_el('wrap').getBoundingClientRect();
      const mx=clientX-wr.left-_panX, my=clientY-wr.top-_panY;
      const cy2=(_connecting.fromY+my)/2;
      _el('connect-line').setAttribute('d',
        `M${_connecting.fromX},${_connecting.fromY} C${_connecting.fromX},${cy2} ${mx},${cy2} ${mx},${my}`);
      return;
    }
    if(_dragNode){
      const wr=_el('wrap').getBoundingClientRect();
      const x=clientX-wr.left-_panX-_dragOff.x, y=clientY-wr.top-_panY-_dragOff.y;
      const el=document.getElementById('fc-node-'+_dragNode.id);
      if(el){ el.style.left=x+'px'; el.style.top=y+'px'; }
      _dragNode.x=x; _dragNode.y=y; _renderEdges(); return;
    }
    if(_panning){
      _panX=clientX-_panSt.x; _panY=clientY-_panSt.y;
      _el('canvas').style.transform=`translate(${_panX}px,${_panY}px)`;
    }
  }

  function _applyRelease(clientX,clientY,isTouch){
    if(_resizeNode){ _resizeNode=null; return; }
    if(_connecting){
      const target=document.elementFromPoint(clientX,clientY)?.closest('.fc-node.connect-target');
      if(target){
        const toId=target.id.replace('fc-node-','');
        if(toId!==_connecting.fromId) _createEdge(_connecting.fromId,toId);
        _cancelConnect();
      }
      if(_dragNode) _dragNode=null;
      return;
    }
    if(_dragNode){ const el=document.getElementById('fc-node-'+_dragNode.id); if(el) el.style.zIndex=''; _dragNode=null; }
    _panning=false;
    _el('wrap').style.cursor=_placing?'crosshair':'default';
  }

  function _createEdge(fromId,toId){
    const ne={id:'e'+(++_ec),from:fromId,to:toId,label:'条件を入力…'};
    _edges.push(ne); _renderEdges();
    const fEl=document.getElementById('fc-node-'+fromId);
    const tEl=document.getElementById('fc-node-'+toId);
    if(fEl&&tEl){
      const mx=(parseFloat(fEl.style.left)+fEl.offsetWidth/2+parseFloat(tEl.style.left)+tEl.offsetWidth/2)/2;
      const my=(parseFloat(fEl.style.top)+fEl.offsetHeight+parseFloat(tEl.style.top))/2;
      setTimeout(()=>_startLabel(ne.id,mx,my),60);
    }
  }

  function _showConnectBanner(srcName){
    _el('connect-banner-src').textContent=srcName;
    _el('connect-banner').classList.add('visible');
    _el('hint').classList.add('hidden');
  }
  function _cancelConnect(){
    _el('connect-line').style.display='none';
    _el('connect-line').setAttribute('d','');
    _el('canvas').querySelectorAll('.connect-target,.connect-src,.connect-hover').forEach(n=>{
      n.classList.remove('connect-target','connect-src','connect-hover');
    });
    _el('overlay').querySelectorAll('.node-port.active').forEach(p=>p.classList.remove('active'));
    _connecting=null;
    _el('connect-banner').classList.remove('visible');
    _el('hint').classList.remove('hidden');
  }

  // ── Placing ───────────────────────────────────────────────────
  function _showTypePicker(e){
    const p=_el('type-picker');
    if(p.style.display==='block'){ _hidePicker(); return; }
    const r=_el('add-btn').getBoundingClientRect();
    p.style.display='block'; p.style.left=r.left+'px'; p.style.top=(r.bottom+4)+'px';
  }
  function _hidePicker(){ _el('type-picker').style.display='none'; }
  function _startPlace(type){
    _hidePicker(); _pendingContent=null;
    if(type==='text'){ _enterPlacingMode(); }
    else if(type==='video'){ _pendingContent={type:'video',videoId:'',platform:'youtube',title:'',channel:''}; _enterPlacingMode(); }
    else if(type==='image'){ _onImgInsert=()=>_enterPlacingMode(); _openFcImgPicker(); }
  }
  function _enterPlacingMode(){
    _placing=true; _addBtnCancelling=true; _el('wrap').classList.add('placing');
    const btn=_el('add-btn');
    btn.classList.add('placing'); btn.textContent='✕ キャンセル';
    _el('hint').textContent='キャンバスをクリックしてノードを配置  /  Esc でキャンセル';
    _el('hint').classList.remove('hidden');
  }
  function _cancelPlace(){
    _placing=false; _addBtnCancelling=false; _pendingContent=null; _el('wrap').classList.remove('placing');
    const btn=_el('add-btn');
    btn.classList.remove('placing'); btn.textContent='＋ ノード追加 ▾';
    _el('hint').textContent='ノードをドラッグして移動 / 下の ＋ をクリックまたはドラッグで接続';
    _el('hint').classList.remove('hidden');
  }
  function _doPlace(e){ _placeAt(e.clientX,e.clientY); }
  function _doPlaceTouch(e){ const t=e.touches[0]; _placeAt(t.clientX,t.clientY); }
  function _placeAt(clientX,clientY){
    const wr=_el('wrap').getBoundingClientRect();
    const x=(clientX-wr.left-_panX-75)|0, y=(clientY-wr.top-_panY-20)|0;
    const nd={id:'n'+(++_nc),x,y,name:'新しい技'};
    if(_pendingContent){
      const{_libBookmarks,...rest}=_pendingContent;
      nd.content=rest;
      if(_libBookmarks?.length) _abState[nd.id]={a:null,b:null,looping:false,activeTab:'a',bookmarks:_libBookmarks,abOpen:false};
    }
    _nodes.push(nd); _cancelPlace(); _renderAll();
    setTimeout(()=>{ const nm=document.getElementById('fc-nm-'+nd.id); if(nm){ nm.contentEditable='true'; nm.classList.add('editing'); nm.focus(); _selAll(nm); }},60);
  }

  // ── Context menu ──────────────────────────────────────────────
  function _showCtx(nodeId,x,y){
    _ctxNodeId=nodeId;
    const nd=_nodes.find(n=>n.id===nodeId), has=!!(nd?.content);
    ['ctx-vid','ctx-img','ctx-txt'].forEach(id=>_el(id).style.display=has?'none':'');
    _el('ctx-chg').style.display=has?'':'none';
    const m=_el('ctx-menu'); m.style.display='block'; m.style.left=x+'px'; m.style.top=y+'px';
  }
  function _hideCtx(){ _el('ctx-menu').style.display='none'; }
  function _ctxAct(action){
    _hideCtx();
    const nd=_nodes.find(n=>n.id===_ctxNodeId); if(!nd) return;
    if(action==='del'){ _nodes=_nodes.filter(n=>n.id!==nd.id); _edges=_edges.filter(e=>e.from!==nd.id&&e.to!==nd.id); _renderAll(); return; }
    if(action==='vid'||action==='chg'){ _onVidInsert=null; if(window._fcLibPick) window._fcLibPick(nd.id); else _openFcVidPicker(); }
    else if(action==='img'){ _onImgInsert=null; _openFcImgPicker(); }
    else if(action==='txt'){ nd.content={type:'text',text:''}; _renderAll(); setTimeout(()=>{ const ta=document.getElementById('fc-ta-'+nd.id); if(ta){ ta.contentEditable='true'; ta.classList.add('editing'); ta.focus(); }},50); }
  }

  // ── Video picker ───────────────────────────────────────────────
  function _openFcVidPicker(){
    window._notesFcVideoCallback = function(vidData) {
      window.uniClose?.();
      const ytId = vidData.ytId || (vidData.platform==='youtube' ? vidData.videoId : null) || vidData.videoId || vidData.id;
      _applyVideo(ytId, vidData);
    };
    window.uniOpenForNote?.('__fc__');
  }
  window._fcUrlOk = function(nid){
    const inp = document.getElementById('fc-url-in-'+nid); if(!inp) return;
    const ytId = _extractVid(inp.value.trim());
    if(!ytId){ inp.style.outline='2px solid red'; setTimeout(()=>inp.style.outline='',1500); return; }
    const nd = _nodes.find(n=>n.id===nid); if(!nd) return;
    nd.content = {type:'video', videoId:ytId, platform:'youtube', title:'', channel:''};
    if(!_abState[nd.id]) _abState[nd.id]={a:null,b:null,looping:false,activeTab:'a',bookmarks:[],abOpen:false};
    _reRenderVideoNode(nid);
  };
  window._fcLibPick = function(nid){
    _ctxNodeId = nid;
    window._notesFcVideoCallback = function(vidData) {
      window.uniClose?.();
      const ytId = vidData.ytId || (vidData.platform==='youtube' ? vidData.videoId : null) || vidData.videoId || vidData.id;
      _applyVideo(ytId, vidData);
    };
    window.uniOpenForNote?.('__fc__');
  };
  function _applyVideo(vid, vidData){
    const rawBms = vidData?.bookmarks || [];
    const mappedBms = _mapLibBms(rawBms);
    const platform = vidData?.platform || 'youtube';
    const storeId = platform==='youtube' ? (vidData?.ytId || vid) : (vidData?.videoId || vid);
    const content = {type:'video', videoId:storeId, platform,
      ytId: vidData?.ytId||undefined, vmHash: vidData?.vmHash||undefined,
      title: vidData?.title||'', channel: vidData?.channel||''};
    if(_onVidInsert){
      _pendingContent = content;
      if(mappedBms.length) _pendingContent._libBookmarks = mappedBms;
      _onVidInsert(); _onVidInsert=null;
    } else {
      const nd=_nodes.find(n=>n.id===_ctxNodeId); if(!nd) return;
      nd.content=content;
      if(!_abState[nd.id]) _abState[nd.id]={a:null,b:null,looping:false,activeTab:'a',bookmarks:[],abOpen:false};
      if(mappedBms.length) _abState[nd.id].bookmarks=mappedBms;
      _renderAll();
    }
  }

  // ── Image picker — notes-style 2-option sheet ────────────────
  function _openFcImgPicker(){
    _removeFcImgSheet();
    const overlay=document.createElement('div');
    overlay.id='fc-img-sheet';
    overlay.className='n-sheet-overlay';
    overlay.innerHTML=`
      <div class="n-sheet n-sheet-sm" onclick="event.stopPropagation()">
        <div class="n-sheet-hdr"><span class="n-sheet-title">📸 画像を追加</span></div>
        <div class="n-src-list">
          <button class="n-src-btn" id="fc-img-upload-btn">
            <span class="n-src-icon">📷</span>
            <div class="n-src-info"><div class="n-src-ttl">ファイルを選択・貼り付け</div><div class="n-src-sub">ローカルの画像ファイルを選択</div></div>
            <span class="n-src-arr">›</span>
          </button>
          <button class="n-src-btn" id="fc-img-snap-btn">
            <span class="n-src-icon">🎬</span>
            <div class="n-src-info"><div class="n-src-ttl">動画のスナップから選ぶ</div><div class="n-src-sub">VPanelに登録済みの画像をインポート</div></div>
            <span class="n-src-arr">›</span>
          </button>
        </div>
        <div class="n-sheet-btns"><button class="n-btn n-btn-ghost" id="fc-img-cancel-btn">キャンセル</button></div>
        <input type="file" id="fc-img-file" accept="image/*" style="display:none">
      </div>`;
    overlay.addEventListener('click',e=>{ if(e.target===overlay) _removeFcImgSheet(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>overlay.classList.add('vis'));
    overlay.querySelector('#fc-img-upload-btn').addEventListener('click',()=>overlay.querySelector('#fc-img-file').click());
    overlay.querySelector('#fc-img-file').addEventListener('change',e=>{
      const file=e.target.files[0]; if(!file) return;
      const reader=new FileReader();
      reader.onload=ev=>{ _applyImage(ev.target.result); _removeFcImgSheet(); };
      reader.readAsDataURL(file);
    });
    overlay.querySelector('#fc-img-snap-btn').addEventListener('click',()=>_openFcSnapPicker(overlay));
    overlay.querySelector('#fc-img-cancel-btn').addEventListener('click',_removeFcImgSheet);
  }
  function _removeFcImgSheet(){ document.getElementById('fc-img-sheet')?.remove(); }
  async function _openFcSnapPicker(overlay){
    const getSnap = window._getSnapshot;
    if(!getSnap){ window.toast?.('スナップ機能が利用できません'); return; }
    const videosWithSnaps=(window.videos||[]).filter(v=>v.snapshots?.length);
    if(!videosWithSnaps.length){ window.toast?.('VPanelにスナップショットが登録されている動画がありません'); return; }
    const sheet=overlay.querySelector('.n-sheet'); if(!sheet) return;
    sheet.innerHTML=`
      <div class="n-sheet-hdr">
        <button class="n-sheet-back" id="fc-snap-back">‹</button>
        <span class="n-sheet-title">🎬 スナップを選ぶ</span>
      </div>
      <div class="n-sheet-body" id="fc-snap-body" style="overflow-y:auto;flex:1"></div>
      <div class="n-sheet-btns"><button class="n-btn n-btn-ghost" id="fc-snap-cancel">キャンセル</button></div>`;
    sheet.querySelector('#fc-snap-back').addEventListener('click',()=>{ _removeFcImgSheet(); _openFcImgPicker(); });
    sheet.querySelector('#fc-snap-cancel').addEventListener('click',_removeFcImgSheet);
    const body=sheet.querySelector('#fc-snap-body');
    for(const v of videosWithSnaps){
      const hdr=document.createElement('div'); hdr.className='n-snap-picker-hdr'; hdr.textContent=v.title||v.id; body.appendChild(hdr);
      const grid=document.createElement('div'); grid.className='n-snap-picker-grid'; body.appendChild(grid);
      for(const ref of v.snapshots){
        const card=document.createElement('div'); card.className='n-snap-picker-card'; card.title=ref.memo||'';
        card.onclick=async()=>{ try{ const snap=await getSnap(ref.id); if(snap?.blob){ _applyImage(URL.createObjectURL(snap.blob)); _removeFcImgSheet(); } }catch(e){ window.toast?.('スナップの取得に失敗しました'); } };
        card.innerHTML=`<span style="font-size:18px">📷</span>`; grid.appendChild(card);
        (async()=>{ try{ const snap=await getSnap(ref.id); if(snap?.blob){ const url=URL.createObjectURL(snap.blob); card.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">`; } }catch(e){} })();
      }
    }
  }
  function _applyImage(src){
    const content={type:'image',src};
    if(_onImgInsert){ _pendingContent=content; _onImgInsert(); _onImgInsert=null; }
    else{ const nd=_nodes.find(n=>n.id===_ctxNodeId); if(!nd) return; nd.content=content; _renderAll(); }
  }

  // ── AB controls (global callbacks) ───────────────────────────
  window._fcToggleAb  = function(nid){ const st=_getAb(nid); st.abOpen=!st.abOpen; _reRenderVideoNode(nid); };
  window._fcSetAbTab  = function(nid,tab){
    const st=_getAb(nid); st.activeTab=tab;
    [document.getElementById('fc-ab-tab-a-'+nid),document.getElementById('fc-ab-tab-b-'+nid)].forEach(b=>b?.classList.remove('on'));
    document.getElementById('fc-ab-tab-'+tab+'-'+nid)?.classList.add('on');
    const sl=document.getElementById('fc-ab-sl-'+nid); if(sl) sl.value=tab==='a'?(st.a||0):(st.b||0);
    _updateAbDisplay(nid);
  };
  window._fcOnSlider  = function(nid,val){
    const t=parseFloat(val), st=_getAb(nid);
    if(st.activeTab==='a') st.a=t; else st.b=t;
    _updateAbDisplay(nid); _updateAbTimeLabels(nid,st);
    const p=_ytPlayers[nid]; if(p?.seekTo) p.seekTo(t,true);
  };
  window._fcMicroAdj  = function(nid,secs){
    const st=_getAb(nid); let base;
    if(secs===null){ base=_curTime(nid); }
    else{ const cur=st.activeTab==='a'?(st.a??_curTime(nid)):(st.b??_curTime(nid)); base=Math.max(0,cur+secs); }
    if(st.activeTab==='a') st.a=base; else st.b=base;
    const sl=document.getElementById('fc-ab-sl-'+nid); if(sl) sl.value=base;
    const p=_ytPlayers[nid]; if(p?.seekTo) p.seekTo(base,true);
    _updateAbDisplay(nid); _updateAbTimeLabels(nid,st);
  };
  window._fcClearAb   = function(nid){ const st=_getAb(nid); st.a=null; st.b=null; st.looping=false; _reRenderVideoNode(nid); };
  window._fcSaveAbBm  = function(nid){
    const st=_getAb(nid);
    if(st.a==null||st.b==null){ window.toast?.('開始と終了を両方設定してください'); return; }
    st.bookmarks.push({label:'',a:st.a,b:st.b});
    _syncBmsToLib(nid);
    _reRenderVideoNode(nid);
    _focusLastBmLabel(nid);
  };
  window._fcSeekBm    = function(nid,idx){
    const st=_getAb(nid); const bm=st.bookmarks[idx]; if(!bm) return;
    const p=_ytPlayers[nid]; if(p?.seekTo){ p.seekTo(bm.a,true); p.playVideo?.(); }
    st.a=bm.a; st.b=bm.b; st.looping=true;
    if(st.abOpen) _reRenderVideoNode(nid);
  };
  window._fcAddBmNow  = function(nid){
    const t=_curTime(nid);
    _getAb(nid).bookmarks.push({label:'',a:t,b:t+30});
    _syncBmsToLib(nid);
    _reRenderVideoNode(nid);
    _focusLastBmLabel(nid);
  };
  window._fcEditBm    = function(nid,idx){
    const el=document.querySelector(`#fc-bm-list-${nid} .bm-item:nth-child(${idx+1}) .bm-item-label`); if(!el) return;
    el.contentEditable='true'; el.classList.add('editing'); el.focus(); _selAll(el);
    el.addEventListener('blur',()=>{ el.contentEditable='false'; el.classList.remove('editing'); const bm=_getAb(nid).bookmarks[idx]; if(bm){ bm.label=el.textContent.trim(); _syncBmsToLib(nid); } },{once:true});
    el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();el.blur();} },{once:true});
  };
  function _focusLastBmLabel(nid){
    setTimeout(()=>{
      const items=document.querySelectorAll(`#fc-bm-list-${nid} .bm-item`);
      const last=items[items.length-1]?.querySelector('.bm-item-label'); if(!last) return;
      last.contentEditable='true'; last.classList.add('editing'); last.focus(); _selAll(last);
      last.addEventListener('blur',()=>{ last.contentEditable='false'; last.classList.remove('editing'); const bms=_getAb(nid).bookmarks; const bm=bms[bms.length-1]; if(bm){ bm.label=last.textContent.trim(); _syncBmsToLib(nid); } },{once:true});
      last.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();last.blur();} },{once:true});
    },60);
  }
  window._fcVpShow = function(nid){
    const nd=_nodes.find(n=>n.id===nid); if(!nd?.content?.videoId) return;
    window.openVPanel?.(nd.content.videoId);
  };
  window._fcVpJump = function(nid){
    const nd=_nodes.find(n=>n.id===nid); if(!nd?.content?.videoId) return;
    _closeEditor();
    window.openVPanel?.(nd.content.videoId);
  };
  window._fcToggleBm = function(nid){
    const st=_getAb(nid); st.bmOpen=!(st.bmOpen!==false); _reRenderVideoNode(nid);
  };
  window._fcAddBmManual = function(nid){
    _getAb(nid).bookmarks.push({label:'',a:0,b:30});
    _syncBmsToLib(nid);
    _reRenderVideoNode(nid);
    _focusLastBmLabel(nid);
  };
  window._fcDelBm = function(nid,idx){
    _getAb(nid).bookmarks.splice(idx,1);
    _syncBmsToLib(nid);
    _reRenderVideoNode(nid);
  };
  function _syncBmsToLib(nid){
    const nd=_nodes.find(n=>n.id===nid); if(!nd?.content?.videoId) return;
    const v=(window.videos||[]).find(v=>v.id===nd.content.videoId||v.ytId===nd.content.videoId);
    if(!v) return;
    const bms=_getAb(nid).bookmarks;
    // Save in VPanel format: {time, endTime, label, note}
    v.bookmarks=bms.map(b=>({time:b.a??0, endTime:b.b??30, label:b.label||'', note:b.note||''}));
    window.debounceSave?.();
  }

  function _updateAbDisplay(nid){ const st=_getAb(nid); const d=document.getElementById('fc-ab-disp-'+nid); if(d) d.textContent=_fmt(st.activeTab==='a'?st.a:st.b); }
  function _updateAbTimeLabels(nid,st){ const ea=document.getElementById('fc-ab-a-'+nid),eb=document.getElementById('fc-ab-b-'+nid); if(ea) ea.textContent=_fmt(st.a); if(eb) eb.textContent=_fmt(st.b); }
  function _reRenderVideoNode(nid){
    const nd=_nodes.find(n=>n.id===nid); if(!nd||nd.content?.type!=='video') return;
    const el=document.getElementById('fc-node-'+nd.id); if(!el) return;
    if(nd.w) el.style.width=nd.w+'px';
    const savedPlayer=_ytPlayers[nid];
    if(nd.w) el.style.width=nd.w+'px';
    el.innerHTML=_nodeHTML(nd); _wireNode(el,nd);
    const wrap=el.querySelector('.node-yt-div');
    if(savedPlayer&&wrap){
      wrap.innerHTML=''; // remove placeholder inner div
      const ifr=savedPlayer.getIframe();
      if(ifr){ ifr.style.cssText='width:100%;height:100%;border:none;display:block'; wrap.appendChild(ifr); }
      _ytPlayers[nid]=savedPlayer; _startNodeTimer(nid);
    } else if(nd.content.videoId) setTimeout(()=>_initVidNode(nid),100);
    _renderEdges();
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _fmt(t){ if(t==null) return'--:--'; t=Math.max(0,t); return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0'); }
  function _extractVid(url){ if(!url) return null; const m=url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/); if(m) return m[1]; if(/^[A-Za-z0-9_-]{11}$/.test(url)) return url; return null; }
  function _esc(s){ return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _escNl(s){ return _esc(s).replace(/\n/g,'<br>'); }
  function _selAll(el){ const r=document.createRange(); r.selectNodeContents(el); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }
})();
