// ═══ WAZA KIMURA — Vimeo oEmbed Proxy ═══
// Cloudflare Pages Function
// GET /api/vimeo-proxy?url=https://vimeo.com/12345[/hash]
// Vimeo oEmbed API をサーバー側で叩く（ブラウザからの直接fetchはCORSでブロックされるため）

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600',
};

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: HEADERS });
  }

  const videoUrl = new URL(request.url).searchParams.get('url');
  if (!videoUrl || !/^https:\/\/vimeo\.com\/\d/.test(videoUrl)) {
    return new Response(JSON.stringify({ error: 'url パラメータが不正です' }), { status: 400, headers: HEADERS });
  }

  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
  try {
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WazaKimura/1.0)' },
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy failed: ' + e.message }), { status: 500, headers: HEADERS });
  }
}
