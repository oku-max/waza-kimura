// ═══ WAZA KIMURA — YouTube検索 API ═══
// Cloudflare Pages Function
// GET /api/yt-search?q={query}&type={video|playlist}&pageToken={token}&maxResults={n}
// Env: YOUTUBE_API_KEY

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

const JSON_HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY が設定されていません。Cloudflare環境変数を確認してください。' }), { status: 500, headers: JSON_HEADERS });
  }

  const sp = new URL(request.url).searchParams;
  const q             = sp.get('q');
  const type          = sp.get('type')          || 'video';
  const pageToken     = sp.get('pageToken')     || '';
  const maxResults    = sp.get('maxResults')    || '25';
  const videoDuration = sp.get('videoDuration') || 'any';

  if (!q) {
    return new Response(JSON.stringify({ error: 'q (検索クエリ) が必要です' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const params = new URLSearchParams({
      part:              'snippet',
      type,
      q,
      maxResults:        String(Math.min(Number(maxResults), 50)),
      key:               apiKey,
      relevanceLanguage: 'ja',
      safeSearch:        'moderate',
    });
    if (pageToken) params.set('pageToken', pageToken);
    if (type === 'video' && videoDuration !== 'any') {
      params.set('videoDuration', videoDuration);
    }

    const ytRes = await fetch(`${YT_SEARCH_URL}?${params}`);
    const data  = await ytRes.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message, ytError: data.error }), { status: ytRes.status, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '検索リクエスト失敗: ' + e.message }), { status: 500, headers: JSON_HEADERS });
  }
}
