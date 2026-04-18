// ═══ WAZA KIMURA — YouTube検索 API ═══
// Vercel Serverless Function
// GET /api/yt-search?q={query}&type={video|playlist}&pageToken={token}&maxResults={n}
// Env: YOUTUBE_API_KEY

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY が設定されていません。Vercel環境変数を確認してください。' });
  }

  const { q, type = 'video', pageToken = '', maxResults = '25', videoDuration = 'any' } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'q (検索クエリ) が必要です' });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type,
      q,
      maxResults: String(Math.min(Number(maxResults), 50)),
      key: apiKey,
      relevanceLanguage: 'ja',
      safeSearch: 'moderate',
    });
    if (pageToken) params.set('pageToken', pageToken);
    // ショート除外・長さフィルタ（video のみ）
    if (type === 'video' && videoDuration !== 'any') {
      params.set('videoDuration', videoDuration);
    }

    const ytRes = await fetch(`${YT_SEARCH_URL}?${params}`);
    const data  = await ytRes.json();

    // YouTube API エラーをそのまま転送
    if (data.error) {
      return res.status(ytRes.status).json({ error: data.error.message, ytError: data.error });
    }

    // 1分キャッシュ
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: '検索リクエスト失敗: ' + e.message });
  }
}
