// ═══ WAZA KIMURA — Cloudflare Worker ═══
// /api/* リクエストをハンドル、それ以外は静的ファイルを返す

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // 内部ディレクトリへのアクセスをブロック
    if (path.startsWith('/.git') || path.startsWith('/.claude') || path.startsWith('/.wrangler')) {
      return new Response('Not found', { status: 404 });
    }
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path);
    }

    // 静的ファイルを返す（JS/CSS は no-cache）
    const res = await env.ASSETS.fetch(request);
    if (/\.(js|css)(\?|$)/.test(path)) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'no-cache, must-revalidate');
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
};

// ── ルーティング ──────────────────────────────────────────
async function handleApi(request, env, path) {
  switch (path) {
    case '/api/drive':       return handleDrive(request);
    case '/api/rss-proxy':   return handleRssProxy(request);
    case '/api/thumb-proxy': return handleThumbProxy(request);
    case '/api/yt-search':        return handleYtSearch(request, env);
    case '/api/yt-playlist-items': return handleYtPlaylistItems(request, env);
    case '/api/ai-group':         return handleAiGroup(request, env);
    case '/api/ai-tag':      return handleAiTag(request, env);
    default:                 return new Response('Not found', { status: 404 });
  }
}

// ── /api/drive — Google Drive 動画プロキシ ───────────────
async function handleDrive(request) {
  const url    = new URL(request.url);
  const fileId = url.searchParams.get('fileId');
  const token  = url.searchParams.get('token');

  if (!fileId || !token) {
    return new Response('Missing fileId or token', { status: 400 });
  }

  const driveHeaders = { Authorization: `Bearer ${token}` };
  const range = request.headers.get('range');
  if (range) driveHeaders['Range'] = range;

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: driveHeaders }
  );

  const resHeaders = {
    'Accept-Ranges':               'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  const ct = driveRes.headers.get('content-type');
  if (ct) resHeaders['Content-Type']   = ct;
  const cl = driveRes.headers.get('content-length');
  if (cl) resHeaders['Content-Length'] = cl;
  const cr = driveRes.headers.get('content-range');
  if (cr) resHeaders['Content-Range']  = cr;

  return new Response(driveRes.body, { status: driveRes.status, headers: resHeaders });
}

// ── /api/rss-proxy — YouTube RSS フィード ────────────────
async function handleRssProxy(request) {
  const feedUrl = new URL(request.url).searchParams.get('url');
  if (!feedUrl) return new Response('Missing url param', { status: 400 });

  try {
    const u = new URL(feedUrl);
    if (!u.hostname.endsWith('youtube.com')) {
      return new Response('Only youtube.com feeds allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    const res  = await fetch(feedUrl);
    if (!res.ok) return new Response(`Upstream error: ${res.status}`, { status: res.status });
    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type':                'application/xml; charset=utf-8',
        'Cache-Control':               'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(`Fetch failed: ${e.message}`, { status: 502 });
  }
}

// ── /api/thumb-proxy — Google Drive サムネイル ───────────
async function handleThumbProxy(request) {
  const params   = new URL(request.url).searchParams;
  const thumbUrl = params.get('url');
  const token    = params.get('token');

  if (!thumbUrl) return new Response('Missing url', { status: 400 });

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
    if (!res.ok) return new Response(`Upstream error: ${res.status}`, { status: res.status });
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

// ── /api/yt-search — YouTube 検索 ────────────────────────
async function handleYtSearch(request, env) {
  if (request.method !== 'GET') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonRes({ error: 'YOUTUBE_API_KEY が未設定です' }, 500);

  const sp            = new URL(request.url).searchParams;
  const q             = sp.get('q');
  const type          = sp.get('type')          || 'video';
  const pageToken     = sp.get('pageToken')     || '';
  const maxResults    = sp.get('maxResults')    || '25';
  const videoDuration = sp.get('videoDuration') || 'any';

  if (!q) return jsonRes({ error: 'q が必要です' }, 400);

  try {
    const params = new URLSearchParams({
      part: 'snippet', type, q,
      maxResults:        String(Math.min(Number(maxResults), 50)),
      key:               apiKey,
      relevanceLanguage: 'ja',
      safeSearch:        'moderate',
    });
    if (pageToken) params.set('pageToken', pageToken);
    if (type === 'video' && videoDuration !== 'any') params.set('videoDuration', videoDuration);

    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data  = await ytRes.json();
    if (data.error) return jsonRes({ error: data.error.message, ytError: data.error }, ytRes.status);

    // 動画の場合: contentDetails（duration）を取得してマージ
    if (type === 'video' && Array.isArray(data.items) && data.items.length > 0) {
      const videoIds = data.items.map(item => item.id?.videoId).filter(Boolean).join(',');
      if (videoIds) {
        const dp = new URLSearchParams({ part: 'contentDetails', id: videoIds, key: apiKey });
        const dr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${dp}`);
        const dd = await dr.json();
        if (!dd.error && Array.isArray(dd.items)) {
          const durMap = Object.fromEntries(dd.items.map(v => [v.id, v.contentDetails]));
          for (const item of data.items) {
            const vid = item.id?.videoId;
            if (vid && durMap[vid]) item.contentDetails = durMap[vid];
          }
        }
      }
    }

    return jsonRes(data, 200, { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' });
  } catch (e) {
    return jsonRes({ error: '検索失敗: ' + e.message }, 500);
  }
}

// ── /api/yt-playlist-items — プレイリスト内動画一覧 ────────
async function handleYtPlaylistItems(request, env) {
  if (request.method !== 'GET') return jsonRes({ error: 'Method not allowed' }, 405);
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonRes({ error: 'YOUTUBE_API_KEY 未設定' }, 500);

  const sp         = new URL(request.url).searchParams;
  const playlistId = sp.get('playlistId');
  const pageToken  = sp.get('pageToken') || '';
  const maxResults = sp.get('maxResults') || '50';
  if (!playlistId) return jsonRes({ error: 'playlistId required' }, 400);

  try {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: String(Math.min(Number(maxResults), 50)),
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res  = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    const data = await res.json();
    if (data.error) return jsonRes({ error: data.error.message }, res.status);
    return jsonRes(data, 200, { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

// ── /api/ai-group — AI タググループ割り当て ──────────────
async function handleAiGroup(request, env) {
  if (request.method === 'OPTIONS') return corsOk();
  if (request.method !== 'POST')    return jsonRes({ error: 'Method not allowed' }, 405);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonRes({ error: 'API key not configured' }, 500);

  const { tags, existingGroups } = await request.json().catch(() => ({}));
  if (!Array.isArray(tags) || !tags.length)           return jsonRes({ error: 'tags array is required' }, 400);
  if (!Array.isArray(existingGroups) || !existingGroups.length) return jsonRes({ error: 'existingGroups array is required' }, 400);

  const groupList    = existingGroups.map(g => `- ${g.name}`).join('\n');
  const systemPrompt = `あなたはBJJの専門知識を持つアシスタントです。未分類タグを既存グループのいずれかに割り当ててください。
ルール: 各タグは既存グループから最適な1つに割り当て、明確に合わないタグは除外。グループ名は一字一句正確に。JSONのみ返す。
返却形式: {"assignments":[{"tag":"タグ名","group":"グループ名"}]}`;

  try {
    const res  = await anthropicCall(apiKey, 'claude-haiku-4-5-20251001', 800, systemPrompt,
      [{ role: 'user', content: `既存グループ:\n${groupList}\n\n未分類タグ:\n${tags.join(', ')}` }]);
    if (!res.ok) return jsonRes({ error: 'AI API error', detail: await res.text() }, 502);

    const data       = await res.json();
    const text       = data.content?.[0]?.text || '{}';
    const parsed     = safeJson(text);
    const validNames = new Set(existingGroups.map(g => g.name));
    const assignments = (parsed.assignments || []).filter(a => a.tag && a.group && validNames.has(a.group));
    return jsonRes({ assignments });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

// ── /api/ai-tag — AI 4層タグ提案 ─────────────────────────
const MODEL_MAP     = { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-5-20250514' };
const DEFAULT_TB    = ['トップ', 'ボトム', 'スタンディング'];

async function handleAiTag(request, env) {
  if (request.method === 'OPTIONS') return corsOk();
  if (request.method !== 'POST')    return jsonRes({ error: 'Method not allowed' }, 405);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonRes({ error: 'API key not configured' }, 500);

  const body = await request.json().catch(() => ({}));
  const { title, channel, playlist, chapters, tbValues, categories, positions,
          tagBlocklist, bjjRules, flexibility, model, feedbackExamples } = body;
  if (!title) return jsonRes({ error: 'title is required' }, 400);

  const blockSet     = new Set(Array.isArray(tagBlocklist) ? tagBlocklist : []);
  const systemPrompt = buildAiTagPrompt({ tbValues, categories, positions, bjjRules, tagBlocklist, flexibility });
  const modelId      = MODEL_MAP[model] || MODEL_MAP.haiku;

  const userMsg = [
    `タイトル:${title}`,
    channel  ? `チャンネル:${channel}`   : null,
    playlist ? `プレイリスト:${playlist}` : null,
    chapters?.length ? `チャプター:${chapters.join(' / ')}` : null,
  ].filter(Boolean).join('\n');

  const messages = [];
  if (Array.isArray(feedbackExamples)) {
    for (const ex of feedbackExamples.slice(-15)) {
      if (!ex.title || !ex.tags) continue;
      const exUser = [`タイトル:${ex.title}`,
        ex.channel  ? `チャンネル:${ex.channel}` : null,
        ex.playlist ? `プレイリスト:${ex.playlist}` : null,
      ].filter(Boolean).join('\n');
      messages.push({ role: 'user', content: exUser });
      messages.push({ role: 'assistant', content: JSON.stringify(ex.tags) });
    }
  }
  messages.push({ role: 'user', content: userMsg });

  try {
    const res = await anthropicCall(apiKey, modelId, 400, systemPrompt, messages);
    if (!res.ok) return jsonRes({ error: 'AI API error', detail: await res.text() }, 502);

    const data       = await res.json();
    const text       = data.content?.[0]?.text || '{}';
    const parsed     = safeJson(text);
    const tbAllowed  = new Set(tbValues || DEFAULT_TB);
    const catAllowed = new Set((categories || []).map(c => c.name));
    const posAllowed = new Set((positions  || []).map(p => p.ja));
    const safeArr    = (arr, allowed) => (Array.isArray(arr) ? arr : [])
      .filter(v => typeof v === 'string' && allowed.has(v) && !blockSet.has(v));
    const safeFree   = (arr) => (Array.isArray(arr) ? arr : [])
      .filter(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 40 && !blockSet.has(v));

    return jsonRes({
      tb:   safeArr(parsed.tb,  tbAllowed),
      cat:  safeArr(parsed.cat, catAllowed),
      pos:  safeArr(parsed.pos, posAllowed),
      tags: safeFree(parsed.tags),
    });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

function buildAiTagPrompt({ tbValues, categories, positions, bjjRules, tagBlocklist, flexibility }) {
  const tbList      = (tbValues || DEFAULT_TB).join(' / ');
  const catSection  = (categories || []).map(c => `- ${c.name}: ${c.desc || ''}${c.aliases?.length ? `  別名: ${c.aliases.join(', ')}` : ''}`).join('\n');
  const posSection  = (positions  || []).map(p => `- ${p.ja} (${p.en || ''}${p.aliases?.length ? ' / ' + p.aliases.join(', ') : ''})`).join('\n');
  const flexNote    = ({ strict: '- カテゴリー・ポジションは必ず上記リストの正式名のみ。', standard: '- カテゴリー・ポジションは上記リストの正式名のみ。曖昧なら空配列。', flexible: '- 正式名を優先。新ポジションが明確な場合のみ#タグへ。' })[flexibility || 'standard'];
  const rulesSection = bjjRules?.length ? `\n【BJJ判定ルール】\n${bjjRules.map((r,i) => `${i+1}. ${r}`).join('\n')}\n` : '';
  const blockSection = tagBlocklist?.length ? `\n【禁止リスト】\n${tagBlocklist.join(' / ')}\n` : '';
  return `あなたはBJJ専門のタグ付けアシスタントです。動画タイトル等を分析し4層タグ体系でJSONを返してください。

【Layer 1: TB】${tbList}
【Layer 2: Category】\n${catSection}
【Layer 3: Position】\n${posSection}
${rulesSection}${blockSection}
ルール: ${flexNote}
- tags は技名・固有名など自由欄（30文字以内）
- JSONのみ返す

返却形式: {"tb":[],"cat":[],"pos":[],"tags":[]}`;
}

// ── ユーティリティ ────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonRes(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

function corsOk() {
  return new Response(null, { status: 200, headers: CORS });
}

function safeJson(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch { return {}; }
}

function anthropicCall(apiKey, model, maxTokens, system, messages) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
}
