// ═══ WAZA KIMURA — Google Drive 動画プロキシ ═══
// Vercel Edge Function  GET /api/drive?fileId=xxx&token=yyy
// <video>タグはAuthorizationヘッダーを送れないため、
// このプロキシがDrive APIにBearerトークンを付けてリクエストし動画をストリーミングする

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url    = new URL(req.url);
  const fileId = url.searchParams.get('fileId');
  const token  = url.searchParams.get('token');

  if (!fileId || !token) {
    return new Response('Missing fileId or token', { status: 400 });
  }

  const driveHeaders = {
    Authorization: `Bearer ${token}`,
  };
  // Rangeヘッダーを転送（動画のシーク対応）
  const range = req.headers.get('range');
  if (range) driveHeaders['Range'] = range;

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: driveHeaders }
  );

  const resHeaders = {
    'Accept-Ranges':              'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  const ct = driveRes.headers.get('content-type');
  if (ct)  resHeaders['Content-Type']   = ct;
  const cl = driveRes.headers.get('content-length');
  if (cl)  resHeaders['Content-Length'] = cl;
  const cr = driveRes.headers.get('content-range');
  if (cr)  resHeaders['Content-Range']  = cr;

  return new Response(driveRes.body, {
    status:  driveRes.status,
    headers: resHeaders,
  });
}
