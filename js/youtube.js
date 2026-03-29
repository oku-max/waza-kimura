// ═══ WAZA KIMURA — YouTube連携 ═══
import { showToast } from './ui.js';
import { currentUser, saveUserData } from './firebase.js';

let tokenClient = null;
let _ytImportToken = null;
let _ytPendingVideos = {};

export function importYouTubePlaylists() {
  if (!currentUser) { showToast('⚠️ 先にGoogleでログインしてください'); return; }
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: '502684957551-bal1rfuj3vanhu1j6p452bsvc6gmcp7u.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      callback: async (tokenResponse) => {
        if (tokenResponse.error) { showToast('⚠️ 認証エラー: ' + tokenResponse.error); return; }
        window._ytToken = tokenResponse.access_token;
        fetchMissingYtDetails(window._ytToken);
        await fetchPlaylists(window._ytToken);
      }
    });
  }
  if (window._ytToken) {
    fetchPlaylists(window._ytToken);
  } else {
    tokenClient.requestAccessToken();
  }
}

async function fetchPlaylists(token) {
  showToast('📥 プレイリストを取得中...');
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    const data = await res.json();
    if (data.error) {
      window._ytToken = null;
      showToast('⚠️ トークン期限切れ。再度「動画取込」を押してください');
      return;
    }
    const playlists = data.items || [];
    // 特別プレイリスト（高評価）を先頭に追加
    // ※「あとで見る(WL)」はYouTube APIの制限でサードパーティからアクセス不可
    const special = [{
      id: 'LL',
      snippet: { title: '👍 高評価の動画 (Liked Videos)', thumbnails: {} },
      contentDetails: { itemCount: '?' }
    }];
    showPlaylistSelector([...special, ...playlists], token);
  } catch (e) { showToast('⚠️ 取得エラー: ' + e.message); }
}

export function parseYtTimestamps(description) {
  if (!description) return [];
  const results = [];
  const re = /(?:^|\n)\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?[\s\-–]+(.+)/g;
  let m;
  while ((m = re.exec(description)) !== null) {
    const parts = m[1].split(':').map(Number);
    const secs = parts.length === 3
      ? parts[0]*3600 + parts[1]*60 + parts[2]
      : parts[0]*60 + parts[1];
    const label = m[2].trim().slice(0, 80);
    if (label) results.push({ t: secs, label });
    if (results.length >= 100) break;
  }
  return results;
}

function _parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
}

export async function fetchMissingYtDetails(token) {
  const missing = (window.videos || []).filter(v =>
    v.pt === 'youtube' && v.ytId && (!v.duration || !v.addedAt)
  );
  if (!missing.length) return;
  const ids = missing.map(v => v.ytId);
  const descMap = await fetchVideoDescriptions(ids, token);
  let updated = 0;
  missing.forEach(v => {
    const info = descMap[v.ytId];
    if (!info) return;
    let changed = false;
    if (!v.duration && info.duration) { v.duration = info.duration; changed = true; }
    if (!v.addedAt && info.publishedAt) { v.addedAt = info.publishedAt; changed = true; }
    if (changed) updated++;
  });
  if (updated > 0) {
    window.debounceSave?.();
    showToast(`✅ ${updated}本の動画情報を補完しました`);
    window.AF?.();
  }
}
window.fetchMissingYtDetails = fetchMissingYtDetails;

async function fetchVideoDescriptions(vids, token) {
  const descMap = {};
  for (let i = 0; i < vids.length; i += 50) {
    const batch = vids.slice(i, i + 50);
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch.join(',')}&maxResults=50`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      (data.items || []).forEach(v => {
        descMap[v.id] = {
          desc:        v.snippet?.description || '',
          duration:    _parseDuration(v.contentDetails?.duration),
          publishedAt: v.snippet?.publishedAt || '',
        };
      });
    } catch (e) { /* ignore */ }
  }
  return descMap;
}

function showPlaylistSelector(playlists, token) {
  _ytImportToken = token;
  const ov   = document.getElementById('yt-import-ov');
  const list = document.getElementById('yt-pl-list');
  if (!ov || !list) return;
  document.getElementById('yt-stage1').style.display = '';
  document.getElementById('yt-stage2').style.display = 'none';
  list.innerHTML = playlists.map(pl => {
    const count = pl.contentDetails?.itemCount || '?';
    const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
    return `<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <input type="checkbox" value="${pl.id}" data-title="${pl.snippet.title.replace(/"/g,'&quot;')}" data-count="${count}" style="width:18px;height:18px;flex-shrink:0">
      <img src="${thumb}" style="width:52px;height:39px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.snippet.title}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${count}本</div>
      </div>
    </label>`;
  }).join('');
  ov.classList.add('open');
  document.getElementById('yt-import-ok').onclick = () => ytFetchSelectedPlVideos(token);
}

export async function ytFetchSelectedPlVideos(token) {
  const checks = document.querySelectorAll('#yt-pl-list input:checked');
  if (!checks.length) { showToast('プレイリストを選択してください'); return; }
  document.getElementById('yt-import-ok').textContent = '読込中...';
  document.getElementById('yt-import-ok').disabled = true;
  const existingYtIds = new Set((window.videos || []).filter(v => v.ytId).map(v => v.ytId));
  _ytPendingVideos = {};
  for (const cb of checks) {
    const plId = cb.value;
    const plTitle = cb.dataset.title;
    const items = [];
    let pageToken = '';
    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${plId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (data.error) { showToast('⚠️ ' + data.error.message); break; }
      (data.items || []).forEach(item => {
        const s = item.snippet;
        const vid = s.resourceId?.videoId;
        if (!vid) return;
        items.push({
          vid, plId, plTitle,
          title: s.title,
          thumb: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
          channel: s.videoOwnerChannelTitle || '',
          addedAt: s.publishedAt || '',
          already: existingYtIds.has(vid)
        });
      });
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    _ytPendingVideos[plId] = { title: plTitle, items };
  }
  // チャプター（タイムスタンプ）をフェッチ（設定で有効な場合のみ）
  const allVids = Object.values(_ytPendingVideos).flatMap(pl => pl.items).map(i => i.vid);
  if (allVids.length && window.aiSettings?.fetchChaptersOnImport !== false) {
    document.getElementById('yt-import-ok').textContent = 'チャプター取得中...';
    const descMap = await fetchVideoDescriptions(allVids, token);
    Object.values(_ytPendingVideos).forEach(pl => {
      pl.items.forEach(item => {
        const d = descMap[item.vid] || {};
        item.timestamps  = parseYtTimestamps(d.desc || '');
        item.duration    = d.duration    || 0;
        item.publishedAt = d.publishedAt || '';
      });
    });
  }
  document.getElementById('yt-import-ok').textContent = '次へ →';
  document.getElementById('yt-import-ok').disabled = false;
  ytShowVideoStage();
}

export function ytShowVideoStage() {
  document.getElementById('yt-stage1').style.display = 'none';
  document.getElementById('yt-stage2').style.display = '';
  const allItems = Object.values(_ytPendingVideos).flatMap(pl => pl.items);
  const total = allItems.length;
  const alreadyCount = allItems.filter(i => i.already).length;
  document.getElementById('yt-stage2-title').textContent = `動画を選択 (${total}本 / 取込済 ${alreadyCount}本)`;
  ytRenderVideoList();
}

export function ytRenderVideoList() {
  const list = document.getElementById('yt-video-list');
  if (!list || !_ytPendingVideos) return;
  const hideImported = document.getElementById('yt-hide-imported')?.checked;
  list.innerHTML = Object.values(_ytPendingVideos).map(pl => {
    const visibleItems = pl.items.filter(item => !(hideImported && item.already));
    if (visibleItems.length === 0) return '';
    return `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);padding:6px 0 4px">${pl.title}</div>
    ${visibleItems.map(item => `
      <label style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:${item.already ? 'var(--surface2)' : 'var(--surface)'};${item.already ? 'opacity:.5;' : 'cursor:pointer;'}">
        <input type="checkbox" class="yt-vid-cb" data-vid="${item.vid}" data-title="${item.title.replace(/"/g, '&quot;')}" data-thumb="${item.thumb}" data-channel="${item.channel.replace(/"/g, '&quot;')}" data-pl="${item.plTitle.replace(/"/g, '&quot;')}" data-addedat="${item.addedAt || ''}" ${item.already ? 'disabled checked' : ''} style="width:16px;height:16px;flex-shrink:0">
        <img src="${item.thumb}" style="width:56px;height:42px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${item.title}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${item.channel}${item.already ? ' · ✅ 取込済み' : ''}</div>
        </div>
      </label>`).join('')}
  `;
  }).join('');
  ytUpdateSelCount();
  list.querySelectorAll('.yt-vid-cb:not([disabled])').forEach(cb => cb.addEventListener('change', ytUpdateSelCount));
  document.getElementById('yt-video-ok').onclick = () => ytImportCheckedVideos();
}

export function ytUpdateSelCount() {
  const checked = document.querySelectorAll('#yt-video-list .yt-vid-cb:not([disabled]):checked').length;
  const total   = document.querySelectorAll('#yt-video-list .yt-vid-cb:not([disabled])').length;
  document.getElementById('yt-sel-count').textContent = `${checked} / ${total}本を選択中`;
}

export function ytSelAllVideos()  { document.querySelectorAll('#yt-video-list .yt-vid-cb:not([disabled])').forEach(c => { c.checked = true;  }); ytUpdateSelCount(); }
export function ytSelNoneVideos() { document.querySelectorAll('#yt-video-list .yt-vid-cb:not([disabled])').forEach(c => { c.checked = false; }); ytUpdateSelCount(); }

export function ytBackToPlaylists() {
  document.getElementById('yt-stage1').style.display = '';
  document.getElementById('yt-stage2').style.display = 'none';
}

export async function ytImportCheckedVideos() {
  const checks = document.querySelectorAll('#yt-video-list .yt-vid-cb:not([disabled]):checked');
  if (!checks.length) { showToast('動画を選択してください'); return; }
  document.getElementById('yt-import-ov').classList.remove('open');
  // タイムスタンプ lookup map（_ytPendingVideos から組み立て）
  const vidTimestampMap   = {};
  const vidDurationMap    = {};
  const vidPublishedAtMap = {};
  Object.values(_ytPendingVideos || {}).forEach(pl => {
    (pl.items || []).forEach(item => {
      vidTimestampMap[item.vid]   = item.timestamps   || [];
      vidDurationMap[item.vid]    = item.duration     || 0;
      vidPublishedAtMap[item.vid] = item.publishedAt  || '';
    });
  });
  let added = 0;
  const newIds = [];
  checks.forEach(cb => {
    const vid = cb.dataset.vid;
    if (window.videos?.find(v => v.ytId === vid)) return;
    window.videos = window.videos || [];
    const newId = 'yt-' + vid;
    newIds.push(newId);
    window.videos.push({
      id: newId, ytId: vid, pt: 'youtube',
      title: cb.dataset.title,
      src: 'youtube',
      url: 'https://www.youtube.com/watch?v=' + vid,
      thumb: cb.dataset.thumb,
      ch: cb.dataset.channel,
      channel: cb.dataset.channel,
      pl: cb.dataset.pl,
      addedAt:    cb.dataset.addedat || vidPublishedAtMap[vid] || '',
      duration:   vidDurationMap[vid] || 0,
      ytChapters: vidTimestampMap[vid] || [],
      watched: false, fav: false, status: '未着手',
      prio: 'そのうち', shared: 0, archived: false, memo: '', ai: '',
      ...(() => { const t = window.autoTagFromTitle ? window.autoTagFromTitle(cb.dataset.title) : {tb:[],ac:[],pos:[],tech:[]}; return { tb: t.tb, ac: t.ac, pos: t.pos, tech: t.tech }; })()
    });
    added++;
  });
  if (window.AF) window.AF();
  await saveUserData();
  showToast(`✅ ${added}本の動画を追加しました`);

  // 自動AIタグ付け
  if (window.aiSettings?.autoTagOnImport && newIds.length > 0) {
    window.autoTagNewVideos?.(newIds);
  }
}
