// ═══ WAZA KIMURA — 動画カード描画 v2 ═══

export function renderCards(list, cid) {
  const c = document.getElementById(cid);
  if (!list.length) {
    c.innerHTML = '<div class="empty"><div class="e">🔍</div><p>動画が見つかりませんでした</p></div>';
    return;
  }
  const ord = { "今すぐ": 0, "そのうち": 1, "保留": 2 };
  c.innerHTML = [...list].sort((a, b) => ord[a.prio] - ord[b.prio]).map(v => cardHTML(v)).join('');
}

function _tsVisible(key) {
  const s = (window.tagSettings || []).find(t => t.key === key);
  return !s || s.visible;
}

export function cardHTML(v) {
  v.tb = v.tb || []; v.ac = v.ac || []; v.pos = v.pos || []; v.tech = v.tech || [];
  v.pt = v.pt || v.src || 'youtube';
  const isYT  = v.pt === 'youtube';
  const isGD  = v.pt === 'gdrive';
  const ytId  = v.ytId || (isYT ? v.id : '');
  const gdId  = isGD ? (v.id || '').replace('gd-', '') : '';
  const vmId  = (!isYT && !isGD) ? (v.id || '').replace('yt-', '') : '';
  const thumb = isYT ? (v.thumb || `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`)
              : isGD ? (v.thumb || `https://drive.google.com/thumbnail?id=${gdId}&sz=w320-h180`)
              : `https://vumbnail.com/${vmId}.jpg`;
  const emb   = isYT ? `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`
              : isGD ? `https://drive.google.com/file/d/${gdId}/preview`
              : `https://player.vimeo.com/video/${vmId}?autoplay=1`;
  const ext   = isYT ? `https://www.youtube.com/watch?v=${ytId}`
              : isGD ? `https://drive.google.com/file/d/${gdId}/view`
              : `https://vimeo.com/${vmId}`;
  const pc    = v.prio === '今すぐ' ? 'p1' : v.prio === 'そのうち' ? 'p2' : 'p3';
  const pe    = v.prio === '今すぐ' ? '🔴' : v.prio === 'そのうち' ? '🟡' : '⚪';
  const sc    = v.status === '練習中' ? 's1' : v.status === 'マスター' ? 's2' : 's0';
  const se    = v.status === '練習中' ? '🔵' : v.status === 'マスター' ? '✅' : '📋';
  const vid   = v.id;
  const bulkMode = window.bulkMode || false;
  const selIds   = window.selIds   || new Set();
  const memoPreview = v.memo ? `<div class="card-memo-preview" onclick="event.stopPropagation();cardShowMemo('${vid}')">${v.memo}</div>` : '';
  const aiBar = v.ai ? `<div class="ai-bar"><span style="font-size:12px">✨</span><div class="ai-bar-text">${v.ai}</div></div>` : '';
  const chName = v.channel ? `<div class="card-ch">${v.channel}</div>` : '';
  const plName = v.pl ? `<div class="card-pl">📋 ${v.pl}</div>` : '';
  const cardMeta = (chName || plName) ? `<div class="card-meta">${chName}${plName}</div>` : '';
  return `<div class="card-wrap" id="wrap-${vid}"><div class="card" id="card-${vid}" data-id="${vid}" data-emb="${emb.replace(/"/g,'&quot;')}" data-ext="${ext.replace(/"/g,'&quot;')}" data-plat="${isYT?'yt':isGD?'gd':'vm'}"><div class="card-sel-ov ${bulkMode?'vis':''}" id="sel-${vid}"><div class="sel-circle ${selIds.has(vid)?'chk':''}" onclick="event.stopPropagation();togSel('${vid}')">${selIds.has(vid)?'✓':''}</div></div><div class="card-main" id="cm-${vid}"><div class="card-thumb" id="thumb-${vid}" onclick="(window.bulkMode||false)?togSel('${vid}'):openVPanel('${vid}')"><img src="${thumb}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="width:100%;height:100%;display:none;align-items:center;justify-content:center;font-size:26px">▶️</div>${v.watched?'<div class="watched-ov"><span style="font-size:22px">✅</span></div>':''}<div class="play-ov"><div class="play-btn">▶</div></div><div class="pb ${isYT?'pb-yt':isGD?'pb-gd':'pb-vm'}">${isYT?'YT':isGD?'GD':'Vimeo'}</div><div class="dur-badge">${v.dur||''}</div></div><div class="card-body"><div class="card-title" style="${v.watched?'opacity:.6':''}">${v.title}</div>${cardMeta}</div></div>${aiBar}${memoPreview}<div class="card-actions"><button class="ca-btn ca-prio" onclick="event.stopPropagation();cardCyclePrio('${vid}',this)" data-prio="${v.prio}">${pe} ${v.prio}</button><button class="ca-btn" onclick="event.stopPropagation();cardCycleProg('${vid}',this)" data-prog="${v.status}">${se} ${v.status}</button><button class="ca-btn ${v.memo?'ca-memo-on':''}" onclick="event.stopPropagation();cardShowMemo('${vid}')" title="メモ">💬 メモ</button><button class="ca-btn danger" onclick="event.stopPropagation();archOne('${vid}')" title="アーカイブ">📦 アーカイブ</button></div></div></div>`;
}

