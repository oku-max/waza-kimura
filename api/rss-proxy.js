// ═══ WAZA KIMURA — RSS プロキシ ═══
// GET /api/rss-proxy?url=<feedUrl>
// allorigins.win が不安定なため自前プロキシで代替
// YouTube RSS フィードなど外部XMLの取得に使用

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const feedUrl = new URL(req.url).searchParams.get('url');
  if (!feedUrl) {
    return new Response('Missing url param', { status: 400 });
  }

  // ドメイン検証: youtube.com のみ許可
  try {
    const u = new URL(feedUrl);
    if (!u.hostname.endsWith('youtube.com')) {
      return new Response('Only youtube.com feeds allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    const res = await fetch(feedUrl);
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: res.status });
    }
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(`Fetch failed: ${e.message}`, { status: 502 });
  }
}
