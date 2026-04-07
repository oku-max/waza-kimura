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

const YT_PL_CACHE_KEY = 'yt_playlists_cache';
function _saveYtPlCache(playlists) {
  try { localStorage.setItem(YT_PL_CACHE_KEY, JSON.stringify({ at: Date.now(), playlists })); } catch {}
}
function _loadYtPlCache() {
  try { return JSON.parse(localStorage.getItem(YT_PL_CACHE_KEY) || 'null'); } catch { return null; }
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
      const reason = data.error.errors?.[0]?.reason || '';
      const msg = data.error.message || 'unknown';
      const isAuth = res.status === 401 || reason === 'authError' || reason === 'invalidCredentials';
      const isQuota = reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || reason === 'dailyLimitExceeded' || res.status === 403;
      if (isAuth) window._ytToken = null;
      // quota枯渇時はキャッシュにフォールバック
      if (isQuota) {
        const cache = _loadYtPlCache();
        if (cache?.playlists?.length) {
          window._ytQuotaFallback = true;
          showToast('⚠️ quota枯渇中: キャッシュから表示（RSSフィード経由で取込可能）');
          const special = [{ id: 'LL', snippet: { title: '👍 高評価の動画 (Liked Videos)', thumbnails: {} }, contentDetails: { itemCount: '?' } }];
          showPlaylistSelector([...special, ...cache.playlists], token);
          return;
        }
      }
      showToast('⚠️ ' + msg);
      _renderYtRetry(`${reason || 'error'}: ${msg}`);
      return;
    }
    const playlists = data.items || [];
    _saveYtPlCache(playlists);
    window._ytQuotaFallback = false;
    const special = [{
      id: 'LL',
      snippet: { title: '👍 高評価の動画 (Liked Videos)', thumbnails: {} },
      contentDetails: { itemCount: '?' }
    }];
    showPlaylistSelector([...special, ...playlists], token);
  } catch (e) {
    showToast('⚠️ 取得エラー: ' + e.message);
    _renderYtRetry('取得エラー: ' + e.message);
  }
}

// ── RSSフィード経由でプレイリストの動画一覧を取得（quota不要、最新15本のみ）──
const _RSS_PROXY = 'https://api.allorigins.win/raw?url=';
async function _fetchPlaylistViaRss(plId, plTitle) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${plId}`;
  const res = await fetch(_RSS_PROXY + encodeURIComponent(feedUrl));
  if (!res.ok) throw new Error('RSS proxy ' + res.status);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const entries = Array.from(doc.getElementsByTagName('entry'));
  const items = [];
  entries.forEach(e => {
    const vid = e.getElementsByTagName('yt:videoId')[0]?.textContent
             || e.getElementsByTagNameNS('*', 'videoId')[0]?.textContent;
    if (!vid) return;
    const title = e.getElementsByTagName('title')[0]?.textContent || '';
    const author = e.getElementsByTagName('name')[0]?.textContent || '';
    const published = e.getElementsByTagName('published')[0]?.textContent || '';
    const thumb = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
    items.push({ vid, plTitle, title, channel: author, addedAt: published, thumb });
  });
  return items;
}

function _renderYtRetry(msg) {
  const list = document.getElementById('yt-pl-list');
  if (!list) return;
  const cache = _loadYtPlCache();
  const favs = _ytLoadFavs();
  const cacheBtn = cache?.playlists?.length
    ? `<button onclick="ytUseCacheFallback()" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:13px;font-weight:700;cursor:pointer">📦 キャッシュ＋RSSで取込</button>`
    : '';
  const favBtn = favs.length
    ? `<button onclick="ytUseFavFallback()" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--gold);background:var(--gold-soft);color:var(--gold);font-size:13px;font-weight:700;cursor:pointer">★ お気に入り＋RSSで取込 (${favs.length})</button>`
    : '';
  // 任意のプレイリストID/URL入力
  const manualBtn = `<button onclick="ytAddManualPl()" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);font-size:13px;font-weight:700;cursor:pointer">＋ プレイリストID/URLを手入力</button>`;
  list.innerHTML = `<div style="text-align:center;padding:18px 12px">
    <div style="font-size:28px;margin-bottom:10px">🔄</div>
    <div style="font-size:13px;font-weight:700;margin-bottom:4px">YouTube APIエラー</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px;word-break:break-word">${msg}</div>
    <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <button onclick="ytReauth()" style="padding:9px 22px;border-radius:8px;border:none;background:var(--accent);color:var(--bg);font-size:13px;font-weight:700;cursor:pointer">YouTubeを再認証</button>
    </div>
    <div style="font-size:10px;color:var(--text3);margin:14px 0 10px">━━━ quota枯渇時の代替手段 (RSSフィード経由・最新15本まで) ━━━</div>
    <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:8px">
      ${favBtn}
      ${cacheBtn}
      ${manualBtn}
    </div>
  </div>`;
}

export function ytUseCacheFallback() {
  const cache = _loadYtPlCache();
  if (!cache?.playlists?.length) { showToast('キャッシュがありません'); return; }
  window._ytQuotaFallback = true;
  const special = [{ id: 'LL', snippet: { title: '👍 高評価の動画 (Liked Videos)', thumbnails: {} }, contentDetails: { itemCount: '?' } }];
  showPlaylistSelector([...special, ...cache.playlists], _ytImportToken);
  showToast('📦 キャッシュ表示: RSSフィード経由で最新15本まで取込可能');
}
window.ytUseCacheFallback = ytUseCacheFallback;

export function ytUseFavFallback() {
  const favs = _ytLoadFavs();
  if (!favs.length) { showToast('お気に入りプレイリストがありません'); return; }
  window._ytQuotaFallback = true;
  const playlists = favs.map(f => ({
    id: f.id,
    snippet: { title: f.title || f.id, thumbnails: {} },
    contentDetails: { itemCount: '?' }
  }));
  showPlaylistSelector(playlists, _ytImportToken);
  showToast('★ お気に入りからRSS取込モード');
}
window.ytUseFavFallback = ytUseFavFallback;

export function ytAddManualPl() {
  const input = prompt('プレイリストIDまたはURL（例: PLxxxxx または https://www.youtube.com/playlist?list=PLxxxxx）:');
  if (!input) return;
  const m = input.match(/list=([A-Za-z0-9_-]+)/) || input.match(/^([A-Za-z0-9_-]{10,})$/);
  if (!m) { showToast('❌ プレイリストIDを認識できません'); return; }
  const plId = m[1];
  const title = prompt('プレイリスト名（任意）:', plId) || plId;
  // お気に入りに追加して即フォールバックモードに入る
  const favs = _ytLoadFavs();
  if (!favs.some(f => f.id === plId)) {
    favs.unshift({ id: plId, title });
    _ytSaveFavs(favs);
  }
  ytUseFavFallback();
}
window.ytAddManualPl = ytAddManualPl;

export function ytReauth() {
  window._ytToken = null;
  if (window.importYouTubePlaylists) window.importYouTubePlaylists();
}
window.ytReauth = ytReauth;

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

// ── お気に入りプレイリスト（GDriveのお気に入りフォルダと同じパターン）──
const YT_FAV_KEY = 'yt_fav_playlists';
function _ytLoadFavs() {
  try { return JSON.parse(localStorage.getItem(YT_FAV_KEY) || '[]'); } catch { return []; }
}
function _ytSaveFavs(favs) { localStorage.setItem(YT_FAV_KEY, JSON.stringify(favs)); }
export function ytFavToggle(plId, plTitle) {
  const favs = _ytLoadFavs();
  const idx = favs.findIndex(f => f.id === plId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift({ id: plId, title: plTitle });
  _ytSaveFavs(favs);
  if (window._ytLastPlaylists) showPlaylistSelector(window._ytLastPlaylists, _ytImportToken);
}
window.ytFavToggle = ytFavToggle;

// ── 非表示プレイリスト ──
const YT_HIDE_KEY = 'yt_hidden_playlists';
function _ytLoadHidden() { try { return JSON.parse(localStorage.getItem(YT_HIDE_KEY) || '[]'); } catch { return []; } }
function _ytSaveHidden(arr) { localStorage.setItem(YT_HIDE_KEY, JSON.stringify(arr)); }
export function ytHideToggle(plId) {
  const arr = _ytLoadHidden();
  const i = arr.indexOf(plId);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(plId);
  _ytSaveHidden(arr);
  if (window._ytLastPlaylists) showPlaylistSelector(window._ytLastPlaylists, _ytImportToken);
}
window.ytHideToggle = ytHideToggle;

let _ytPlaylistMeta = {}; // plId -> {total, fetched, unimportedCount}

function _renderPlRow(pl, isFav, isHidden) {
  const count = pl.contentDetails?.itemCount || '?';
  const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
  const safeTitle = pl.snippet.title.replace(/"/g,'&quot;');
  const star = isFav ? '★' : '☆';
  const starColor = isFav ? 'var(--gold)' : 'var(--text3)';
  const bg = isFav ? 'background:var(--gold-soft);border-color:var(--gold);' : (isHidden ? 'background:var(--surface2);opacity:.6;' : '');
  const hideIcon = isHidden ? '👁' : '🚫';
  const hideTitle = isHidden ? '非表示を解除' : 'このプレイリストを非表示にする';
  return `<label style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color .15s;${bg}" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='${isFav ? 'var(--gold)' : 'var(--border)'}'">
    <input type="checkbox" value="${pl.id}" data-title="${safeTitle}" data-count="${count}" style="width:18px;height:18px;flex-shrink:0">
    <img src="${thumb}" style="width:52px;height:39px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.snippet.title}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">${count}本 <span id="yt-pl-newcnt-${pl.id}" style="color:var(--accent);font-weight:700"></span></div>
    </div>
    <button type="button" onclick="event.preventDefault();event.stopPropagation();ytFavToggle('${pl.id}','${safeTitle}')" title="${isFav ? 'お気に入りから外す' : 'お気に入りに追加'}" style="background:none;border:none;cursor:pointer;font-size:18px;color:${starColor};padding:2px 4px;line-height:1;flex-shrink:0">${star}</button>
    <button type="button" onclick="event.preventDefault();event.stopPropagation();ytHideToggle('${pl.id}')" title="${hideTitle}" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text3);padding:2px 4px;line-height:1;flex-shrink:0">${hideIcon}</button>
  </label>`;
}

function showPlaylistSelector(playlists, token) {
  _ytImportToken = token;
  window._ytLastPlaylists = playlists;
  const ov   = document.getElementById('yt-import-ov');
  const list = document.getElementById('yt-pl-list');
  if (!ov || !list) return;
  document.getElementById('yt-stage1').style.display = '';
  document.getElementById('yt-stage2').style.display = 'none';

  const hideDone = document.getElementById('yt-hide-allimported')?.checked;
  const showHidden = document.getElementById('yt-show-hidden')?.checked;
  // チェック中のIDを保持して再描画後も復元
  const checkedIds = new Set(Array.from(document.querySelectorAll('#yt-pl-list input:checked')).map(c => c.value));

  const favs = _ytLoadFavs();
  const favIds = new Set(favs.map(f => f.id));
  const hiddenSet = new Set(_ytLoadHidden());
  let visible = playlists;
  if (hideDone) visible = visible.filter(p => {
    const m = _ytPlaylistMeta[p.id];
    return p.id === 'LL' || !m || m.unimported > 0;
  });
  if (!showHidden) visible = visible.filter(p => !hiddenSet.has(p.id));
  const favPls = favs.map(f => visible.find(p => p.id === f.id)).filter(Boolean);
  const restPls = visible.filter(p => !favIds.has(p.id));

  let html = '';
  if (favPls.length) {
    html += `<div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);padding:4px 0 6px;display:flex;align-items:center;gap:6px">★ お気に入り<span style="flex:1;height:1px;background:var(--border);display:block"></span></div>`;
    html += favPls.map(p => _renderPlRow(p, true, hiddenSet.has(p.id))).join('');
    html += `<div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);padding:8px 0 6px;display:flex;align-items:center;gap:6px">全プレイリスト<span style="flex:1;height:1px;background:var(--border);display:block"></span></div>`;
  }
  html += restPls.map(p => _renderPlRow(p, false, hiddenSet.has(p.id))).join('');
  list.innerHTML = html || '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px">該当するプレイリストがありません</div>';
  // チェック状態を復元
  list.querySelectorAll('input[type=checkbox]').forEach(cb => { if (checkedIds.has(cb.value)) cb.checked = true; });

  ov.classList.add('open');
  document.getElementById('yt-import-ok').onclick = () => ytFetchSelectedPlVideos(token);

  // 未取込本数を計算（APIを使わずローカルの videos[] と itemCount の差分）
  _computeUnimportedCountsLocal(playlists);
}

function _computeUnimportedCountsLocal(playlists) {
  // 既存videosをプレイリスト名でグループ化
  const importedByPl = {};
  (window.videos || []).forEach(v => {
    if (v.pt !== 'youtube' || !v.pl) return;
    importedByPl[v.pl] = (importedByPl[v.pl] || 0) + 1;
  });
  playlists.forEach(pl => {
    if (pl.id === 'LL') return;
    const total = parseInt(pl.contentDetails?.itemCount, 10);
    if (isNaN(total)) return;
    const imported = importedByPl[pl.snippet.title] || 0;
    const unimported = Math.max(0, total - imported);
    _ytPlaylistMeta[pl.id] = { unimported };
    const el = document.getElementById('yt-pl-newcnt-' + pl.id);
    if (el) el.textContent = unimported > 0 ? `· 未取込 ${unimported}本` : '· すべて取込済';
  });
}

export function ytTogHideAllImported() {
  if (window._ytLastPlaylists) showPlaylistSelector(window._ytLastPlaylists, _ytImportToken);
}
window.ytTogHideAllImported = ytTogHideAllImported;

// チェック済プレイリストの未取込動画を中身を見ずに一括取込
export async function ytImportUnimportedFromChecked() {
  const checks = document.querySelectorAll('#yt-pl-list input:checked');
  if (!checks.length) { showToast('プレイリストを選択してください'); return; }
  const token = _ytImportToken;
  const useRss = window._ytQuotaFallback === true;
  if (!useRss && !token) { showToast('⚠️ トークンがありません'); return; }
  const btn = document.getElementById('yt-import-bulk-new');
  const okBtn = document.getElementById('yt-import-ok');
  btn.disabled = true; if (okBtn) okBtn.disabled = true;
  btn.textContent = useRss ? 'RSS取得中...' : '取得中...';
  const existing = new Set((window.videos || []).filter(v => v.ytId).map(v => v.ytId));
  const toAdd = [];
  for (const cb of checks) {
    const plId = cb.value; const plTitle = cb.dataset.title;
    if (useRss) {
      try {
        const rssItems = await _fetchPlaylistViaRss(plId, plTitle);
        rssItems.forEach(it => {
          if (existing.has(it.vid)) return;
          existing.add(it.vid);
          toAdd.push(it);
        });
      } catch (e) { showToast('⚠️ RSS取得失敗 (' + plTitle + '): ' + e.message); }
      continue;
    }
    let pageToken = '';
    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${plId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`;
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (data.error) { showToast('⚠️ ' + data.error.message); break; }
      (data.items || []).forEach(item => {
        const s = item.snippet; const vid = s.resourceId?.videoId;
        if (!vid || existing.has(vid)) return;
        existing.add(vid);
        toAdd.push({
          vid, plTitle,
          title: s.title,
          thumb: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
          channel: s.videoOwnerChannelTitle || '',
          addedAt: s.publishedAt || ''
        });
      });
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  }
  if (!toAdd.length) {
    btn.disabled = false; if (okBtn) okBtn.disabled = false;
    btn.textContent = '📥 未取込を一括取込';
    showToast('✅ 未取込の動画はありません');
    return;
  }
  // チャプター/duration補完（quota枯渇中はスキップ）
  btn.textContent = `補完中 (${toAdd.length}本)...`;
  if (!useRss && window.aiSettings?.fetchChaptersOnImport !== false) {
    const descMap = await fetchVideoDescriptions(toAdd.map(t => t.vid), token);
    toAdd.forEach(t => {
      const d = descMap[t.vid] || {};
      t.timestamps = parseYtTimestamps(d.desc || '');
      t.duration = d.duration || 0;
      t.publishedAt = d.publishedAt || '';
    });
  }
  window.videos = window.videos || [];
  const newIds = [];
  toAdd.forEach(t => {
    const newId = 'yt-' + t.vid;
    newIds.push(newId);
    window.videos.push({
      id: newId, ytId: t.vid, pt: 'youtube',
      title: t.title, src: 'youtube',
      url: 'https://www.youtube.com/watch?v=' + t.vid,
      thumb: t.thumb, ch: t.channel, channel: t.channel, pl: t.plTitle,
      addedAt: t.addedAt || t.publishedAt || '',
      duration: t.duration || 0,
      ytChapters: t.timestamps || [],
      watched: false, fav: false, status: '未着手',
      prio: 'そのうち', shared: 0, archived: false, memo: '', ai: '',
      ...(() => { const tt = window.autoTagFromTitle ? window.autoTagFromTitle(t.title) : {tb:[],ac:[],pos:[],tech:[]}; return { tb: tt.tb, ac: tt.ac, pos: tt.pos, tech: tt.tech }; })()
    });
  });
  if (window.AF) window.AF();
  await saveUserData();
  document.getElementById('yt-import-ov').classList.remove('open');
  btn.disabled = false; if (okBtn) okBtn.disabled = false;
  btn.textContent = '📥 未取込を一括取込';
  showToast(`✅ ${toAdd.length}本の未取込動画を追加しました`);
  if (window.aiSettings?.autoTagOnImport && newIds.length > 0) {
    window.autoTagNewVideos?.(newIds);
  }
}
window.ytImportUnimportedFromChecked = ytImportUnimportedFromChecked;

export async function ytFetchSelectedPlVideos(token) {
  const checks = document.querySelectorAll('#yt-pl-list input:checked');
  if (!checks.length) { showToast('プレイリストを選択してください'); return; }
  document.getElementById('yt-import-ok').textContent = '読込中...';
  document.getElementById('yt-import-ok').disabled = true;
  const existingYtIds = new Set((window.videos || []).filter(v => v.ytId).map(v => v.ytId));
  _ytPendingVideos = {};
  const useRss = window._ytQuotaFallback === true;
  for (const cb of checks) {
    const plId = cb.value;
    const plTitle = cb.dataset.title;
    const items = [];
    if (useRss) {
      try {
        const rssItems = await _fetchPlaylistViaRss(plId, plTitle);
        rssItems.forEach(it => items.push({ ...it, plId, already: existingYtIds.has(it.vid) }));
      } catch (e) { showToast('⚠️ RSS取得失敗: ' + e.message); }
    } else {
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
    }
    _ytPendingVideos[plId] = { title: plTitle, items };
  }
  // チャプター（タイムスタンプ）をフェッチ（設定で有効な場合のみ・quota枯渇中はスキップ）
  const allVids = Object.values(_ytPendingVideos).flatMap(pl => pl.items).map(i => i.vid);
  if (allVids.length && !useRss && window.aiSettings?.fetchChaptersOnImport !== false) {
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
