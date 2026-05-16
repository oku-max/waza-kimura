// ═══ WAZA KIMURA — Vimeo oEmbed Proxy ═══
// Vercel Edge Function
// GET /api/vimeo-proxy?url=https://vimeo.com/12345[/hash]

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const videoUrl = new URL(req.url).searchParams.get('url');
  if (!videoUrl || !/^https:\/\/vimeo\.com\/\d/.test(videoUrl)) {
    return new Response(JSON.stringify({ error: 'url パラメータが不正です' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
  try {
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WazaKimura/1.0)' },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy failed: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
