// ═══ WAZA KIMURA — サムネイルプロキシ ═══
// Cloudflare Pages Function  GET /api/thumb-proxy?url=<thumbnailLink>&token=<driveToken>
// ブラウザからlh3.googleusercontent.comへのfetchはCORSでブロックされるため
// サーバーサイドで画像を取得して返す

export async function onRequest(context) {
  const { request } = context;
  const params   = new URL(request.url).searchParams;
  const thumbUrl = params.get('url');
  const token    = params.get('token');

  if (!thumbUrl) {
    return new Response('Missing url', { status: 400 });
  }

  // サムネイルURLのドメインを検証（lh3 or googleusercontent のみ許可）
  try {
    const u = new URL(thumbUrl);
    if (!u.hostname.endsWith('.googleusercontent.com') && !u.hostname.endsWith('.google.com')) {
      return new Response('Invalid thumbnail domain', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(thumbUrl, { headers });
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: res.status });
    }
    const blob = await res.arrayBuffer();
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type':                res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control':               'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(`Fetch failed: ${e.message}`, { status: 502 });
  }
}
