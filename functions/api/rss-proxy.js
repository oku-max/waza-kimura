// ═══ WAZA KIMURA — RSS / Playlist Proxy ═══
// Cloudflare Pages Function
// GET /api/rss-proxy?url={encodedUrl}
// YouTubeのRSSフィード・プレイリストAPIをCORSなしで取得するプロキシ
// playlist_id パラメータが含まれる場合は YouTube Data API v3 を優先使用

const JSON_HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};
const XML_HEADERS = {
  'Content-Type':                'application/xml; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'url パラメータが必要です' }), { status: 400, headers: JSON_HEADERS });
  }

  // YouTube playlist RSS → YouTube Data API v3 で代替取得（YOUTUBE_API_KEY があれば全件取得）
  const plMatch = targetUrl.match(/youtube\.com\/feeds\/videos\.xml\?playlist_id=([A-Za-z0-9_-]+)/);
  if (plMatch && env.YOUTUBE_API_KEY) {
    const plId = plMatch[1];
    try {
      const vids = [];
      let pageToken = '';
      do {
        const params = new URLSearchParams({
          part: 'snippet',
          playlistId: plId,
          maxResults: '50',
          key: env.YOUTUBE_API_KEY,
        });
        if (pageToken) params.set('pageToken', pageToken);
        const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
        const data = await res.json();
        if (data.error) break;
        for (const item of (data.items || [])) {
          const s = item.snippet;
          const vid = s.resourceId?.videoId;
          if (vid) vids.push({ vid, title: s.title, channel: s.videoOwnerChannelTitle || '', thumb: s.thumbnails?.medium?.url || '' });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      if (vids.length) {
        return new Response(JSON.stringify({ plId, vids }), {
          status: 200,
          headers: { ...JSON_HEADERS, 'X-Source': 'yt-api' },
        });
      }
    } catch (e) {
      console.error('playlist API failed:', e);
    }
  }

  // フォールバック: 対象URLをそのままプロキシ（RSS XML等）
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WazaKimura/1.0)' },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...XML_HEADERS, 'Cache-Control': 's-maxage=300' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'プロキシ失敗: ' + e.message }), { status: 500, headers: JSON_HEADERS });
  }
}
