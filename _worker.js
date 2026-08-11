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
  // 未捕捉の例外でCloudflare既定の500（非JSON）を返さないよう、必ずJSONエラーに変換する
  try {
    switch (path) {
      case '/api/drive':       return await handleDrive(request);
      case '/api/rss-proxy':   return await handleRssProxy(request);
      case '/api/thumb-proxy': return await handleThumbProxy(request);
      case '/api/yt-search':        return await handleYtSearch(request, env);
      case '/api/yt-playlist-items': return await handleYtPlaylistItems(request, env);
      case '/api/yt-videos':        return await handleYtVideos(request, env);
      case '/api/ai-group':         return await handleAiGroup(request, env);
      case '/api/ai-tag':      return await handleAiTag(request, env);
      case '/api/ai-summary':  return await handleAiSummary(request, env);
      case '/api/vimeo-proxy': return await handleVimeoProxy(request);
      // 字幕をASR（AssemblyAI）で作る経路。Geminiの字幕生成とは別系統で、既存には触らない。
      case '/api/asr-src':     return await handleAsrSrc(request, env);
      case '/api/asr-start':   return await handleAsrStart(request, env);
      case '/api/asr-status':  return await handleAsrStatus(request, env);
      case '/api/asr-srt':     return await handleAsrSrt(request, env);
      case '/api/asr-sentences': return await handleAsrSentences(request, env);
      case '/api/translate':   return await handleTranslate(request, env);
      default:                 return new Response('Not found', { status: 404 });
    }
  } catch (e) {
    return jsonRes({ error: 'サーバー内部エラー', detail: String((e && (e.message || e.name)) || e).slice(0, 300) }, 500);
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
  resHeaders['Content-Type'] = ct || 'video/mp4';
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

    // プレイリストの場合: contentDetails（itemCount）を取得してマージ
    if (type === 'playlist' && Array.isArray(data.items) && data.items.length > 0) {
      const plIds = data.items.map(item => item.id?.playlistId).filter(Boolean).join(',');
      if (plIds) {
        const pp = new URLSearchParams({ part: 'contentDetails', id: plIds, key: apiKey });
        const pr = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${pp}`);
        const pd = await pr.json();
        if (!pd.error && Array.isArray(pd.items)) {
          const cntMap = Object.fromEntries(pd.items.map(p => [p.id, p.contentDetails]));
          for (const item of data.items) {
            const pid = item.id?.playlistId;
            if (pid && cntMap[pid]) item.contentDetails = cntMap[pid];
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

// ── /api/yt-videos — 動画IDからタイトル/チャンネル名を取得 ──
//   URL貼り付けでの登録に使う。noembed など第三者プロキシは
//   チャンネル名が実際と食い違うことがあるため、YouTube公式APIを一次情報にする。
async function handleYtVideos(request, env) {
  if (request.method !== 'GET') return jsonRes({ error: 'Method not allowed' }, 405);
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonRes({ error: 'YOUTUBE_API_KEY 未設定' }, 500);

  const raw = new URL(request.url).searchParams.get('ids') || '';
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (!ids.length) return jsonRes({ error: 'ids が必要です' }, 400);

  try {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails', id: ids.join(','), key: apiKey,
    });
    const res  = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
    const data = await res.json();
    if (data.error) return jsonRes({ error: data.error.message }, res.status);

    const th = (t) => t?.medium?.url || t?.high?.url || t?.default?.url || '';
    const items = (data.items || []).map(v => ({
      id:       v.id,
      title:    v.snippet?.title        || '',
      channel:  v.snippet?.channelTitle || '',
      thumb:    th(v.snippet?.thumbnails),
      duration: v.contentDetails?.duration || '',
    }));
    return jsonRes({ items }, 200, { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' });
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

// ── /api/ai-summary — Gemini 動画要約（オーナー限定）──────
// POST { idToken, source:'youtube', ytId, title?, channel?, playlist? }
// Returns: { summary }
const OWNER_EMAIL          = 'okujournal@gmail.com';
const FIREBASE_WEB_API_KEY = 'AIzaSyC1VafF24ys4XdTZe7lqIDAZjSmOUqM6Lw'; // 公開Webキー（クライアント同梱済み）

// Firebase IDトークンを Identity Toolkit で検証し、オーナーのメールか確認する
async function verifyOwner(idToken, env) {
  if (!idToken) return { ok: false, error: 'missing idToken' };
  const key = env.FIREBASE_API_KEY || FIREBASE_WEB_API_KEY;
  try {
    const res  = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ idToken }),
    });
    const data  = await res.json();
    const email = data.users?.[0]?.email;
    if (!res.ok || !email)     return { ok: false, error: 'invalid token' };
    if (email !== OWNER_EMAIL) return { ok: false, error: 'forbidden' };
    return { ok: true, email };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleAiSummary(request, env) {
  if (request.method === 'OPTIONS') return corsOk();
  if (request.method !== 'POST')    return jsonRes({ error: 'Method not allowed' }, 405);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return jsonRes({ error: 'GEMINI_API_KEY が未設定です（Cloudflare環境変数を確認）' }, 500);

  const body = await request.json().catch(() => ({}));
  const { idToken, source, ytId, title, channel, playlist } = body;
  // mode: 'summary'(既定) | 'desc'(一言解説) | 'branch'(分岐抽出JSON) | 'subtitle'(SRT字幕生成)
  //     | 'chapters'(チャプター検出JSON)
  const mode = ['desc','branch','subtitle','chapters'].includes(body.mode) ? body.mode : 'summary';
  // subtitle時の出力言語: 'ja'(日本語に翻訳・既定) | 'orig'(話されている言語のまま)
  const subLang = body.subLang === 'orig' ? 'orig' : 'ja';
  // 生成の細かい指定（文体・逐語/意訳・用語・フィラー・画面内文字・字幕の量）
  const subOpts = (body.subOpts && typeof body.subOpts === 'object') ? body.subOpts : {};
  // チャプター検出の指定（最短の長さ・最大件数）
  const chapOpts = (body.chapOpts && typeof body.chapOpts === 'object') ? body.chapOpts : {};

  const auth = await verifyOwner(idToken, env);
  if (!auth.ok) return jsonRes({ error: 'unauthorized', detail: auth.error }, 403);

  const { gdFileId, accessToken: gdToken } = body;

  // 字幕テキストからチャプターを推定する経路。動画本体を送らないので速く安い。
  if (source === 'transcript') {
    if (mode !== 'chapters') return jsonRes({ error: 'source:transcript は mode:chapters のみ対応しています' }, 400);
    return _aiChaptersFromTranscript(env, body.transcript, title, channel, playlist, chapOpts);
  }

  // 貼り付けられたチャプター一覧（テキスト／スクショ画像）を読み取る経路。
  // 動画も字幕も送らないので最も安い。ここでは表を構造化するだけで、
  // 時刻が書かれていない場合の位置決めは別リクエスト（titles付き）で行う。
  if (source === 'chapterlist') {
    if (mode !== 'chapters') return jsonRes({ error: 'source:chapterlist は mode:chapters のみ対応しています' }, 400);
    return _aiChapterListParse(env, body.listText, body.listImages);
  }

  if (source === 'youtube') {
    if (!ytId || !/^[\w-]{6,20}$/.test(ytId)) {
      return jsonRes({ error: 'ytId が不正です' }, 400);
    }
    return _streamJson(() => _aiSummaryYoutube(env, ytId, title, channel, playlist, mode, subLang, subOpts, chapOpts));
  }
  if (source === 'gdrive') {
    if (!gdFileId || !gdToken) {
      return jsonRes({ error: 'gdFileId と accessToken が必要です' }, 400);
    }
    return _streamJson(() => _aiSummaryGdrive(env, gdFileId, gdToken, title, channel, playlist, mode, subLang, subOpts, chapOpts));
  }
  return jsonRes({ error: 'source は youtube / gdrive / transcript を指定してください' }, 400);
}

// ── 長い処理の応答をストリーミングで返す ─────────────────────
// Cloudflareは応答が始まらないまま約100秒経つと接続を切る（524）。
// 以前ユーザーに届いた「error code: 524」はブラウザ→Worker間が切られた証拠
// （Geminiのサーバーは Cloudflare の後ろにいないので、524が届く経路は他にない）。
// 生成が100秒を超えると動画の長さに関係なく失敗していたのはこれ。
//
// 対策: 先に応答を開始し、処理中は10秒ごとに改行1つを流し続け、
// 終わったら本体のJSONを書いて閉じる。改行はJSONの先頭空白として合法なので、
// クライアントの res.json() はそのまま動く（クライアント変更不要・PWAキャッシュの影響なし）。
// ステータスは常に200になるため、成否は本文の error フィールドで伝える
// （クライアントは元々 d.summary / d.error を見て判定している）。
function _streamJson(run) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const timer = setInterval(() => { writer.write(enc.encode('\n')).catch(() => {}); }, 10000);
  (async () => {
    let out;
    try {
      const res = await run();               // 既存の処理は Response を返すのでそのまま使う
      out = await res.text();
    } catch (e) {
      out = JSON.stringify({ error: 'サーバー内部エラー', detail: String((e && (e.message || e.name)) || e).slice(0, 300) });
    }
    clearInterval(timer);
    try { await writer.write(enc.encode(out)); } catch (e) {}
    try { await writer.close(); } catch (e) {}
  })();
  return new Response(readable, { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ── モード別プロンプト選択 ──────────────────────────────────
function _promptFor(mode, ctx, subLang, subOpts, chapOpts) {
  if (mode === 'desc')     return _aiDescPrompt(ctx);
  if (mode === 'branch')   return _aiBranchPrompt(ctx);
  if (mode === 'subtitle') return _aiSubtitlePrompt(ctx, subLang, subOpts);
  if (mode === 'chapters') return _aiChaptersPrompt(ctx, chapOpts, null);
  return _aiPrompt(ctx);
}

// 生成オプション（mode別）。字幕は本文が長いので出力枠を大きく取り、思考は切って全部本文に回す。
function _genOptsFor(mode) {
  if (mode === 'branch')   return { json: true };
  if (mode === 'subtitle') return { maxOutputTokens: 65536, thinkingBudget: 0, temperature: 0.3, what: '字幕', mediaResolution: 'MEDIA_RESOLUTION_LOW' };
  // チャプターは出力そのものは短いが「どこで話題が変わるか」の判断に思考を使わせたい。
  // 2.5系は思考トークンも maxOutputTokens を食うので、思考ぶんを上乗せした枠を取る。
  if (mode === 'chapters') return { json: true, maxOutputTokens: 16384, thinkingBudget: 4096, temperature: 0.2, what: 'チャプター' };
  return {};
}

// 字幕生成: 動画の音声をSRT形式に文字起こし（必要なら指定言語へ翻訳）
const SUB_LANG_NAMES = { ja:'日本語' };

function _aiSubtitlePrompt(ctx, subLang, subOpts) {
  const o = subOpts || {};
  const langName = SUB_LANG_NAMES[subLang] || null;
  const rules = [];

  if (subLang === 'orig' || !langName) {
    rules.push('話されている言語のまま文字起こしする（翻訳しない）');
  } else {
    rules.push(`音声が${langName}以外なら自然な${langName}に翻訳する。${langName}の音声ならそのまま文字起こしする`);
  }

  if (o.terms === 'english')        rules.push('柔術の専門用語は英語表記のまま残す（guard, sweep, pass 等）');
  else if (o.terms === 'translate') rules.push('柔術の専門用語もできるだけ訳語にする');
  else if (subLang === 'ja')        rules.push('柔術用語（ガード, スイープ, パスガード, マウント, バックテイク, ラペラ 等）は無理に和訳せずカタカナで表記する');

  if (subLang === 'ja') {
    rules.push(o.style === 'dearu' ? '文体は「である調」で統一する' : '文体は「ですます調」で統一する');
  }

  if (o.verbatim === 'verbatim') rules.push('言い回しを省略せず、話した通りに逐語で起こす');
  else                           rules.push('冗長な言い回しは削り、意味を保ったまま字幕として読みやすい長さに整える');

  rules.push(o.fillers === 'keep'
    ? 'フィラー（えーと, you know 等）もそのまま残す'
    : 'フィラー（えーと, あの, you know, like 等）と言い直しは省く');

  if (o.onScreen) rules.push('ホワイトボードやテロップなど画面内の重要な文字も、該当時刻の字幕として補足する');

  // 行の折り返しはクライアント側が決定論的にやり直すので、ここでは指定しない。
  // モデルに任せても字数は守られず、守らせても表示前に上書きされるだけで無意味。
  // 代わりに「表示側では直せないもの」＝キューの区切り方（時間の粒度）だけを指定する。
  const perCue = Math.max(20, (Number(o.maxChars) || 20) * (Number(o.maxLines) || 2));

  return `この動画の音声を最初から最後まで文字起こしし、SRT形式の字幕を作成してください。
${ctx ? '\n【動画情報】\n' + ctx + '\n' : ''}
【厳守】
- 出力はSRT本文のみ。前置き・解説・コードフェンスは一切書かない
- 通し番号は1から連番
- タイムコードは HH:MM:SS,mmm --> HH:MM:SS,mmm 形式（カンマ区切り・ゼロ埋め）
- 実際の発話タイミングに正確に合わせる
- 1つの字幕は1〜6秒を目安に、文や句の切れ目で区切る（長い説明は複数の字幕に分ける）
- 1つの字幕は${perCue}文字程度まで。超えるなら発話タイミングに沿って別の字幕に分ける
- 字幕テキスト内では改行しない。1つの字幕の本文は1行で書く（折り返しは表示側で行う）
- ただしSRTの体裁は厳守する。各字幕は「通し番号 / タイムコード / 本文」の3行で書き、
  字幕と字幕の間には必ず空行を1行入れる（空行を省略しない）
- タイムコードは動画の先頭を 00:00:00,000 として数える（01:00:00 から始めない）
- 無音・発話の無い区間には字幕を作らない
- 「1、2、3…」とレップ（回数）を数えているだけの区間は書き起こさない
${rules.map(r => '- ' + r).join('\n')}

出力例:
1
00:00:02,400 --> 00:00:05,120
クローズドガードから始めます`;
}

// ── チャプター検出 ────────────────────────────────────────
// 1本に複数のテクニックが収録された長尺教則を、話題の切り替わりで区切る。
// transcript が渡された時は字幕テキストだけを根拠に判定する（動画本体は送らない）。
const CHAP_MIN_SEC   = 45;      // これより短い区切りは作らせない（既定）
const CHAP_MAX_COUNT = 40;      // 件数の上限（既定）
const CHAP_TRANSCRIPT_MAX = 400000;  // 送られてくる字幕テキストの上限（文字）

function _aiChaptersPrompt(ctx, chapOpts, transcript) {
  const o = chapOpts || {};
  const minSec = Math.max(10, Math.min(600, Number(o.minSec) || CHAP_MIN_SEC));
  const maxCount = Math.max(2, Math.min(80, Number(o.maxCount) || CHAP_MAX_COUNT));
  const titleLen = Math.max(6, Math.min(40, Number(o.titleLen) || 18));

  // チャプター一覧が渡された時は「位置合わせ」に切り替える。
  // 何が何件あるかは確定しているので、探すのは各章の開始時刻だけ。
  const titles = Array.isArray(o.titles) ? o.titles.filter(t => String(t || '').trim()) : [];
  if (titles.length) return _aiChapterAlignPrompt(ctx, titles, transcript);

  const source = transcript
    ? `以下は、この動画の字幕（発話の文字起こし）です。各行の先頭 [M:SS] はその発話が始まる時刻です。
これだけを根拠に、話題が切り替わる点を判定してください。

【字幕】
${transcript}`
    : 'この動画を最初から最後まで視聴し、話題が切り替わる点を判定してください。';

  return `あなたはブラジリアン柔術(BJJ)に精通したアシスタントです。
1本の長い教則動画に複数のテクニック／トピックが連続して収録されています。その区切り（チャプター）を検出してJSONで出力してください。
${ctx ? `\n【動画情報】\n${ctx}\n` : ''}
${source}

【チャプターの単位】ひとつのテクニック・トピックのまとまりを1チャプターとします。導入の挨拶、コンセプト解説、ドリル、スパー実演、まとめ なども、それぞれ独立した1チャプターとして扱ってよい。
【区切ってよい点】扱うテクニックが変わる／ポジションや状況設定が変わる／解説から実演やスパーに移る、など話の内容が実際に切り替わる点。
【区切ってはいけない点】カメラの切り替わり、言い直し、同じ技の説明の続き、繰り返しのデモ。これらは前のチャプターに含めること。
【start】そのチャプターの話が始まる時刻。「次は〜をやります」のような予告から始まる場合はその予告を含めた時刻にする。動画の先頭を 0:00 として数える。
【最初のチャプター】動画の冒頭（0:00 付近）から必ず1つ目を始めること。
【title】そのチャプターの中身が分かる短い日本語のタイトル。${titleLen}文字程度まで。
  - 通し番号（「1.」「第1章」等）や記号で飾らない。内容だけを書く
  - 柔術用語（ガード, スイープ, パスガード, マウント, バックテイク, ラペラ 等）はカタカナで表記する
  - 「〜について」「〜の解説」のような中身の無い語尾は付けない
  - 良い例: 「デラヒーバから足関節」「ニーカットの膝の入れ方」「クローズドガードのグリップ作り」
【summary】そのチャプターの内容を1文で。省略可。

【厳守】
- 出力は次のJSONのみ。前置き・解説・コードフェンスは書かない
- start は時刻の早い順に並べ、同じ時刻を2回出さない
- 各チャプターは${minSec}秒以上の長さにする（それより細かい切り替わりは前のチャプターに含める）
- チャプターは最大${maxCount}件まで。迷ったら細かく刻まず、大きなまとまりで捉える
- 実際に動画（字幕）に無い内容を推測で足さない

{"items":[{"start":"M:SS または H:MM:SS","title":"短い日本語のタイトル","summary":"1文の補足（省略可）"}]}`;
}

// 位置合わせ: チャプターの顔ぶれと順序は公式の表で確定済み。開始時刻だけを探させる。
// 自由検出より精度が出るうえ、教則の目次と完全に一致した区切りになる。
function _aiChapterAlignPrompt(ctx, titles, transcript) {
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const source = transcript
    ? `以下は、この動画の字幕（発話の文字起こし）です。各行の先頭 [M:SS] はその発話が始まる時刻です。
これを読んで、各チャプターがどこから始まるかを判定してください。

【字幕】
${transcript}`
    : 'この動画を最初から最後まで視聴し、各チャプターがどこから始まるかを判定してください。';

  return `あなたはブラジリアン柔術(BJJ)に精通したアシスタントです。
この動画の公式チャプター一覧はすでに分かっています。あなたの仕事は、各チャプターが動画のどこから始まるかを特定することだけです。
${ctx ? `\n【動画情報】\n${ctx}\n` : ''}
【公式チャプター一覧（これが正解。全${titles.length}件）】
${list}

${source}

【厳守】
- title は上の一覧の文字列を一字一句そのまま返す。翻訳・要約・言い換え・記号の付け足しをしない
- 項目を増やさない・減らさない・並べ替えない。上から順に必ず${titles.length}件返す
- start は動画の先頭を 0:00 として数えた、そのチャプターが始まる時刻
- start は必ず前の項目より後（同じ時刻や逆転はさせない）
- 1つ目は通常 0:00 付近から始まる
- どうしても位置が判断できない項目は start を null にする。推測で埋めない
- 出力は次のJSONのみ。前置き・解説・コードフェンスは書かない

{"items":[{"start":"M:SS または H:MM:SS。不明なら null","title":"一覧のタイトルをそのまま"}]}`;
}

// 貼り付けられたチャプター一覧（テキスト／スクショ画像）を構造化する。
// 表に何が書いてあるかを写すだけで、動画の中身は一切見ない。
function _aiChapterListPrompt(hasImage) {
  return `これはブラジリアン柔術の教則DVD/動画の「公式チャプター一覧（目次）」です。${
    hasImage ? '画像とテキストの' : ''}内容から、チャプターを載っている順にすべて抜き出してJSONで出力してください。

【title】表に書かれているタイトルをそのまま写す。翻訳・要約・言い換えを絶対にしない
  - 英語なら英語のまま、日本語なら日本語のまま写す
  - 行頭の通し番号（"1." "01" "Chapter 3" "第2章" 等）は番号部分だけ取り除き、タイトル本体は原文のまま
【start】その項目に「開始時刻」が書かれていればその値。無ければ null
【duration】その項目に「長さ・尺」が書かれていればその値。無ければ null
  - 時間が1つしか書かれていない表では、値が項目ごとに増え続けるなら開始時刻、
    そうでなければ各章の長さ、と判断して振り分ける
【含めないもの】見出し行、収録時間の合計、価格・購入案内・出演者・解説文・レビューなど、チャプターでないもの

【厳守】
- 出力は次のJSONのみ。前置き・解説・コードフェンスは書かない
- 表に載っている項目を飛ばさない。順序も変えない
- 読み取れない項目があっても、読めた範囲だけを返す

{"items":[{"title":"原文のまま","start":"H:MM:SS / M:SS。無ければ null","duration":"同上。無ければ null"}]}`;
}

const CHAP_LIST_TEXT_MAX  = 60000;   // 貼り付けテキストの上限（文字）
const CHAP_LIST_IMG_MAX   = 6;       // 画像の枚数上限
const CHAP_LIST_IMG_BYTES = 8000000; // 画像1枚あたりのbase64長の上限

async function _aiChapterListParse(env, listText, listImages) {
  const text = String(listText || '').trim().slice(0, CHAP_LIST_TEXT_MAX);
  const imgs = (Array.isArray(listImages) ? listImages : [])
    .filter(im => im && typeof im.data === 'string' && im.data.length <= CHAP_LIST_IMG_BYTES)
    .slice(0, CHAP_LIST_IMG_MAX);
  if (!text && !imgs.length) return jsonRes({ error: 'チャプター名のテキストか画像が必要です' }, 400);

  const parts = [];
  for (const im of imgs) {
    parts.push({ inlineData: { mimeType: im.mimeType || 'image/jpeg', data: im.data } });
  }
  parts.push({ text: _aiChapterListPrompt(imgs.length > 0) + (text ? `\n\n【貼り付けられたテキスト】\n${text}` : '') });

  const result = await _geminiGenerate(env, parts, {
    json: true, maxOutputTokens: 16384, thinkingBudget: 1024, temperature: 0, what: 'チャプター一覧',
  });
  if (result.error) return jsonRes(result, 502);
  return jsonRes({
    summary: result.summary, usage: result.usage, costUsd: result.costUsd, via: 'chapterlist',
  });
}

// 動画から検出する時のフレーム間引き。
// Gemini は既定で毎秒1フレーム（≈258トークン/枚）を見るため、1時間で約100万トークンに達し、
// 長尺だと入力がコンテキスト上限を超えて検出そのものができない。
// チャプターの判断材料は主に音声（「次は〜をやります」等）なので、
// 長い動画はフレームを間引いて全体を1回で読み切れるようにする。
const CHAP_THIN_FROM_SEC    = 1800;    // これを超える動画だけ間引く（短い動画は既存の挙動のまま）
const CHAP_INPUT_BUDGET     = 700000;  // 入力全体のトークン目安（1Mコンテキストに余裕を残す）
const CHAP_TOKENS_PER_FRAME = 258;
const CHAP_TOKENS_PER_SEC_AUDIO = 32;  // 音声は間引けないので先に差し引く

function _chapThinVideo(filePart, durationSec) {
  const dur = Number(durationSec) || 0;
  if (!dur || dur <= CHAP_THIN_FROM_SEC) return filePart;
  // 音声ぶんは削れないため、残りをフレームに割り当てる
  const frameBudget = CHAP_INPUT_BUDGET - (CHAP_TOKENS_PER_SEC_AUDIO * dur);
  const raw = frameBudget / (CHAP_TOKENS_PER_FRAME * dur);
  const fps = Math.max(0.05, Math.min(0.5, Math.floor(raw * 100) / 100));
  return { ...filePart, videoMetadata: { ...(filePart.videoMetadata || {}), fps } };
}

// 音声だけで枠を超える長さは、フレームをいくら間引いても1回では読み切れない。
// 字幕の生成は区間分割できるので、そちら経由を案内する（無駄な課金をしない）。
function _chapTooLongForVideo(durationSec) {
  return (Number(durationSec) || 0) * CHAP_TOKENS_PER_SEC_AUDIO > CHAP_INPUT_BUDGET;
}

// fps 指定がこのAPIバージョンで通らなかった時だけ、間引き無しでもう一度試す。
// 「長すぎる」等の本当の失敗で二重に課金しないよう、フィールド不正のときに限る。
function _chapFpsRejected(r) {
  return /fps|Unknown name|Invalid JSON payload|INVALID_ARGUMENT/i.test(String(r?.detail || r?.error || ''));
}

async function _generateChapters(env, filePart, ctx, chapOpts, durationSec) {
  if (_chapTooLongForVideo(durationSec)) {
    return {
      error:  'この動画は長すぎて動画からの検出ができません',
      detail: '先に字幕を作成し、「字幕から検出」をお使いください',
    };
  }
  const gen    = _genOptsFor('chapters');
  const prompt = { text: _aiChaptersPrompt(ctx, chapOpts, null) };
  const thinned = _chapThinVideo(filePart, durationSec);
  if (thinned !== filePart) {
    const r = await _geminiGenerate(env, [thinned, prompt], gen);
    if (!r.error) return r;
    if (!_chapFpsRejected(r)) return r;
    console.log('[chapters] fps指定が通らなかったため間引き無しで再試行:', r.detail || r.error);
  }
  return _geminiGenerate(env, [filePart, prompt], gen);
}

// 字幕テキストのみでチャプターを検出する（Drive・Gemini Files APIを使わない軽い経路）
async function _aiChaptersFromTranscript(env, transcript, title, channel, playlist, chapOpts) {
  const text = String(transcript || '').trim();
  if (!text) return jsonRes({ error: '字幕テキストが空です' }, 400);
  // 上限を超えるぶんは切る（末尾を落とすとチャプターも欠けるので、その旨を返して知らせる）
  const clipped = text.length > CHAP_TRANSCRIPT_MAX;
  const body = clipped ? text.slice(0, CHAP_TRANSCRIPT_MAX) : text;

  const prompt = _aiChaptersPrompt(_ctxStr(title, channel, playlist), chapOpts, body);
  const result = await _geminiGenerate(env, [{ text: prompt }], _genOptsFor('chapters'));
  if (result.error) return jsonRes(result, 502);
  return jsonRes({
    summary: result.summary, usage: result.usage, costUsd: result.costUsd,
    via: 'transcript', clipped,
  });
}

// 一言解説: 動画を開く前に内容が分かる1〜2文（サムネ下・タイトル横に表示する想定）
function _aiDescPrompt(ctx) {
  return `あなたはブラジリアン柔術(BJJ)に精通したアシスタントです。
この動画を視聴し、「動画を開く前に中身が分かる一言解説」を日本語で1〜2文だけ書いてください。
${ctx ? `\n【動画情報】\n${ctx}\n` : ''}
【必ず含める】どのポジション/状況か・自分はトップかボトムか・相手のどんな動きや反応に対して・何（技/コンセプト/対策）を教える動画か。
例:「デラヒーバ（ボトム）で相手が膝を切ってパスに来た時の、足の組み替えによるリテンションとバックテイクへの分岐を解説。」
【禁止】前置き・記号・改行・箇条書き・タイトルの繰り返し。プレーンテキスト1〜2文のみを出力すること。`;
}

// 分岐抽出: 「シチュエーション → 相手の反応(＝分岐/発生ポイント) → こちらの対応」を構造化JSONで返す。
// 分岐マップの素材。分岐＝相手のリアクションによって、こちらができることが切り替わる点。
function _aiBranchPrompt(ctx) {
  return `あなたはブラジリアン柔術(BJJ)に精通したアシスタントです。
この動画を視聴し、「どの状況で・相手がどういう状態/反応のときに → こちらは何ができるか」を、一言レベルの短い対応として抽出しJSONで出力してください。
${ctx ? `\n【動画情報】\n${ctx}\n` : ''}
【最重要・粒度】各項目は「状況＋相手の状態/反応 → こちらの技」を1行で言い切る短さにすること。良い例:「クォーターポジション（トップ）で相手が膝を閉じてニーカットを防御 → パンツを掴み下半身を固定して横移動するスマッシュパス」。これはマップ上の1ノードに相当する、一言解説と同じ粒度です。
【絶対禁止】手順の羅列を書かないこと。「まず○○を掴み、次に△△を差し込み、□□でフックして…」のような段階的な動作説明は一切書かない（それは分岐ではなく手順であり、ここでは不要）。response は技名＋要点をせいぜい1文にまとめること。
【trigger（分岐）の捉え方】分岐＝相手のリアクション・防御姿勢・状態の違い。相手がどう構える/防ぐ/動くかで、こちらの技が変わる、その切り替わりの点。相手の防御姿勢そのもの（例:「膝を閉じてニーカットを防御」「フレームを作って距離を作る」「アップライトで胸を張る」）を必ず trigger に書くこと。相手側に特筆すべき状態が無い時のみ「基本」。
【出力形式】次のJSONのみを出力（コードフェンス・説明文は禁止）:
{"items":[{"situation":"開始ポジションと自分がトップ/ボトムか（例: クォーターポジション（トップ））","trigger":"相手の状態・反応・防御姿勢（例: 膝を閉じてニーカットを防御）。特筆なければ「基本」","response":"こちらの技を一言で（技名＋ごく短い要点。手順の羅列は禁止。例: パンツを掴み下半身を固定して横移動するスマッシュパス）","timestamp":"その技が映像で実演されている瞬間の M:SS"}]}
【ルール】
- 1本の動画が単一テクニックなら項目は1〜2個で十分。無理に増やさない。逆に複数の相手反応が扱われていれば、その数だけ trigger 違いで並べる。
- trigger は必ず「相手側」の視点。自分の動作を trigger にしない。
- detail や手順フィールドは作らない。response を短く保つこと。
- timestamp は実演が画面に映っている瞬間（数秒後ろ寄り）。
- 動画に無い情報を推測で足さないこと。`;
}

// ── 共通プロンプト生成 ──────────────────────────────────────
function _aiPrompt(ctx) {
  return `あなたはブラジリアン柔術(BJJ)に精通したアシスタントです。
この動画を視聴し、練習メモとして使える日本語の要約を作成してください。
${ctx ? `\n【動画情報】\n${ctx}\n` : ''}
【最重要・シチュエーション（状況設定）】柔術では「自分と相手が今どういう状況にいるか」という前提が技の成否を左右します。相手の反応次第でやれることが変わるため、教則動画もほぼ必ずこの状況説明から始まります。要約でも必ず冒頭に、しかも細かく状況を書き出してください。具体的には次を漏れなく含めること:
- 開始ポジション（例: クローズドガード、ハーフ、サイド、マウント、バックなど）と、自分・相手それぞれが上か下か・どちらを向いているか
- グリップ／コントロール（どこを誰がどう掴んでいるか、足・腕・襟・袖・帯のからみ）
- 体重・プレッシャーの掛かり方、重心、姿勢
- この技を仕掛ける「きっかけ・条件」（相手のどんな動き・反応・防御に対して使うのか）
- 相手の予想される反応と、それに応じた分岐（こう来たらこの技、別の反応なら別の対応）
状況が動画中で変化する場合は、その変化も時系列で記述すること。
【出力フォーマット】該当しない項目は省略可。ただし「シチュエーション（状況設定）」は必須で省略不可。箇条書き中心で。
◾️一言まとめ（1〜2文）
◾️シチュエーション（状況設定）※必須・上記【最重要】の観点で細かく
◾️扱う技術・ポジション
◾️手順とディテール（ステップ順）
◾️ありがちなミス・注意点

【手順とディテール】ステップを順番に並べ、そのステップで効く細部・コツ・力の向き・角度・グリップの詳細は、そのステップの中で続けて書くこと（別の見出しに分けない）。どのステップにも紐づかない全体的なコツだけ、末尾に独立した項目として置いてよい。
【記号ルール】大見出しは ◾️ を使うこと。**大見出しの行には「- 」を付けないこと**（見出しと箇条書きが同じ見た目になり区別できなくなる）。小見出しや特に強調したい語句は **強調したい語** のように ** で囲んでよい（アプリ側で太字表示される）。ただし Markdownの見出し記号 # は使わないこと。箇条書きは行頭に「- 」を付けること。
【タイムスタンプ】手順とディテール・注意点の各項目には、その内容が画面で最もはっきり示されている瞬間の時間を [M:SS] 形式で「- 」の直後に付けること（例: - [1:23] ...）。タイムスタンプは静止画のサムネイルとして使うため、技・体勢・グリップがはっきり映り、解説と一致する瞬間を選ぶこと。各項目のタイムスタンプは互いに数秒以上ずらし、同じ場面を繰り返し指さないこと。特定できない項目は省略可。
【最重要・タイムスタンプの取り方】解説者がその動作を口で言い始めた瞬間ではなく、その動作が実際に映像で実演・完成している瞬間を選ぶこと。教則では「先に言葉で説明 → 数秒後に実演」という順序が大半で、言及した時点ではまだ一つ前の体勢が画面に映っていることが多い。そのため、各項目のタイムスタンプはその動作が実演されて画面に出てから（解説より数秒後ろ寄り）の時間を選び、サムネイルが必ずその項目の内容と一致するようにすること。迷ったら早めではなく遅め（実演が映ってから）を選ぶこと。
専門用語はBJJで一般的な表記を使い、冗長な前置きは書かないこと。`;
}

function _ctxStr(title, channel, playlist) {
  return [
    title    ? `タイトル: ${title}`        : null,
    channel  ? `チャンネル: ${channel}`    : null,
    playlist ? `プレイリスト: ${playlist}` : null,
  ].filter(Boolean).join('\n');
}

// B: streamGenerateContent を使う。
// generateContent は生成完了まで応答が来ないため、長尺だと100秒でCloudflareに切られる（524）。
// ストリーミングなら細切れに届き続けるので接続が切れない。
async function _geminiGenerate(env, parts, opts) {
  const model  = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = env.GEMINI_API_KEY;
  const o = opts || {};
  // 2.5系の思考モデルは思考トークンが出力枠を食い潰し、本文が空になることがある。
  // 思考量を上限付きに固定し、出力枠を広く確保して本文ぶんを必ず残す。
  const generationConfig = {
    temperature:     o.temperature != null ? o.temperature : 0.3,
    maxOutputTokens: o.maxOutputTokens || 8192,
  };
  if (/2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: o.thinkingBudget != null ? o.thinkingBudget : 2048 };
  if (o.json) generationConfig.responseMimeType = 'application/json';
  // responseMimeType だけでは「JSONではあるが構造は自由」になる。形を決めたいときは
  // スキーマまで渡す（渡さずに比較して片方が空になった反省）。
  if (o.schema) generationConfig.responseSchema = o.schema;
  if (o.mediaResolution) generationConfig.mediaResolution = o.mediaResolution;

  let gRes;
  try {
    gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      }
    );
  } catch (e) {
    return { error: 'Gemini への接続に失敗しました', detail: (e && e.message) || String(e) };
  }
  if (!gRes.ok) {
    const r = await _jsonOrErr(gRes, 'Gemini の呼び出し');
    const raw = r.error ? String(r.detail || '') : String(r.data?.error?.message || '');
    // 枠切れ(429)は待たずに再試行しても絶対に成功しない。英語の長文をそのまま出さず、
    // 何が起きていて何をすべきかを日本語で返す。quota フラグで呼び出し側の再試行も止める。
    if (gRes.status === 429 || /free_tier|quota/i.test(raw)) {
      const m = raw.match(/retry in ([\d.]+)s/i);
      return {
        error: 'Gemini APIの利用枠を使い切りました', quota: true,
        detail: '無料枠の上限に達しています。'
          + (m ? `約${Math.ceil(Number(m[1]))}秒後に再試行できますが、` : '')
          + '根本対処は課金の有効化です（Google AI Studio → 該当キーのプロジェクト）',
      };
    }
    if (r.error) return r;
    return { error: 'Gemini API error', detail: raw || _httpErrText(gRes.status) };
  }

  // SSE（data: {...}）を読み進めて本文を繋ぐ
  let text = '', usage = null, finish = '', cut = '';
  try {
    const reader = gRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let j;
        try { j = JSON.parse(payload); } catch (e) { continue; }
        const cand = j.candidates?.[0];
        for (const pt of (cand?.content?.parts || [])) if (pt.text) text += pt.text;
        if (cand?.finishReason) finish = cand.finishReason;
        if (j.usageMetadata) usage = j.usageMetadata;
      }
    }
  } catch (e) {
    // 途中まで取れていればそれを使う（長尺で切れた場合の救済）。
    // ただし「切れた」事実は必ず持ち帰る。黙って途中までを完成品として返すと、
    // 34分の動画に対して5分ぶんしかない字幕がそのまま保存される（実際に起きた）。
    cut = (e && e.message) || String(e);
    if (!text.trim()) return { error: 'Gemini の応答の読み取りに失敗しました', detail: cut };
  }
  // 正常終了なら最後のチャンクに finishReason が来る。何も来ていなければ
  // 応答が途中で終わっている（例外を伴わない切断）。
  if (!finish) cut = cut || '応答が最後まで届きませんでした';

  text = text.trim();
  if (!text) {
    const detail = finish === 'MAX_TOKENS' ? '出力が上限に達しました（動画が長い可能性）'
                 : finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'コンテンツ判定で生成がブロックされました'
                 : finish === 'RECITATION' ? '引用判定でブロックされました'
                 : (finish || '応答が空でした');
    return { error: `${o.what || '要約'}を取得できませんでした`, detail };
  }
  return { summary: text, usage, costUsd: _estimateCostUsd(env, usage), finish, cut };
}

// A: 生の数字ではなく何が起きたかを返す。524はCloudflareのタイムアウト（100秒）。
function _httpErrText(status) {
  if (status === 524) return '処理が100秒を超えたため接続が切られました（動画が長い可能性）';
  if (status === 504) return 'ゲートウェイがタイムアウトしました';
  if (status === 502 || status === 503) return '一時的にサーバーへ到達できませんでした';
  if (status === 429) return 'リクエストが多すぎます（レート制限）。少し待ってから再試行してください';
  if (status === 403) return 'アクセスが拒否されました（APIキーまたは権限）';
  if (status === 400) return 'リクエストが不正です';
  return `HTTP ${status}`;
}

// JSONで返らないことがある（524などは素のテキスト）。パースエラーをそのまま
// 表に出さず、何が起きたかに変換する。
async function _jsonOrErr(res, what) {
  const raw = await res.text();
  try {
    return { data: JSON.parse(raw) };
  } catch (e) {
    const m = raw.match(/error code:\s*(\d+)/i);
    const code = m ? Number(m[1]) : res.status;
    return { error: `${what}に失敗しました`, detail: _httpErrText(code) };
  }
}

// 実測トークン数から概算コスト(USD)を出す。
// 単価はCloudflareの環境変数で上書きできる（Googleの価格改定にコード変更なしで追随するため）。
// 既定値は 2026-07 時点の gemini-2.5-flash 有料枠: 入力$0.30 / 音声入力$1.00 / 出力$2.50 per 1Mトークン。
function _estimateCostUsd(env, usage) {
  if (!usage) return null;
  const pIn    = parseFloat(env.GEMINI_PRICE_IN    || '0.30');
  const pAudio = parseFloat(env.GEMINI_PRICE_AUDIO || '1.00');
  const pOut   = parseFloat(env.GEMINI_PRICE_OUT   || '2.50');
  let audio = 0;
  for (const d of (usage.promptTokensDetails || [])) {
    if (String(d.modality || '').toUpperCase() === 'AUDIO') audio += (d.tokenCount || 0);
  }
  const nonAudio = Math.max(0, (usage.promptTokenCount || 0) - audio);
  // 思考トークンは出力と同じ単価で課金される
  const out = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
  const usd = (nonAudio * pIn + audio * pAudio + out * pOut) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

function _srtTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
  const z = (n, w) => String(n).padStart(w, '0');
  return `${z(h,2)}:${z(m,2)}:${z(ss,2)},${z(ms,3)}`;
}
function _srtSec(tc) {
  const m = String(tc).match(/(\d{1,3}):(\d{2})(?::(\d{2}))?[.,](\d{1,3})/);
  if (!m) return 0;
  const ms = Number((m[4] + '00').slice(0, 3));
  return m[3] != null
    ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000
    : Number(m[1]) * 60 + Number(m[2]) + ms / 1000;
}
// 空行区切りに依存せず、タイムコード行を目印にキューを取り出す
function _srtCues(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const TC = /^\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}(?::\d{2})?[.,]\d{1,3})/;
  const marks = [];
  for (let i = 0; i < lines.length; i++) if (TC.test(lines[i])) marks.push(i);
  const cues = [];
  for (let k = 0; k < marks.length; k++) {
    const m = lines[marks[k]].match(TC);
    const body = lines.slice(marks[k] + 1, k + 1 < marks.length ? marks[k + 1] : lines.length);
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    if (body.length && /^\d{1,5}$/.test(body[body.length - 1].trim())) body.pop();
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    const t = body.join('\n').trim();
    if (!t) continue;
    const start = _srtSec(m[1]), end = _srtSec(m[2]);
    if (!(end > start)) continue;
    cues.push({ start, end, text: t });
  }
  return cues;
}
// 全体が一定量ずれている場合に直す。
// 捨ててから「0件」と言うのではなく、直せるものは直す。
function _repairOffset(cues, durationSec) {
  const dur = Number(durationSec) || 0;
  if (!dur || !cues.length) return cues;
  const inRange = (sh) => cues.reduce((n, c) =>
    n + ((c.start + sh) >= -2 && (c.start + sh) <= dur + 5 ? 1 : 0), 0);
  const now = inRange(0);
  if (now >= cues.length * 0.8) return cues;        // ほぼ収まっているなら触らない

  // 候補は時間・分単位のきれいなズレのみ。
  // 「先頭を0に寄せる」を候補にすると、デタラメな時刻でも必ず範囲内に収まって
  // しまい、壊れた字幕を止められなくなる（検証で発覚したため外した）。
  const cands = [];
  for (let h = 1; h <= 5; h++) cands.push(-3600 * h);
  for (let m = 1; m <= 59; m++) cands.push(-60 * m);
  let bestN = now;
  for (const sh of cands) bestN = Math.max(bestN, inRange(sh));
  if (bestN <= now) return cues;                     // 直しようがない
  // ほぼ同等ならきれいな単位を優先（ファイル本来の構造を壊さない）
  for (const sh of cands) {
    if (inRange(sh) >= bestN * 0.95) {
      return cues.map(c => ({ ...c, start: c.start + sh, end: c.end + sh }));
    }
  }
  return cues;
}

// 繋いだ結果を整える。壊れたキューを混ぜたまま保存しないための最後の砦。
function _cleanupCues(cues, durationSec) {
  const dur = Number(durationSec) || 0;
  const repaired = _repairOffset(cues, dur);          // 捨てる前に直す
  const limit = dur > 0 ? dur + 5 : Infinity;
  let out = repaired
    .filter(c => c.start >= -1 && c.start < limit && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  // 同じ時刻に重なったキューは後ろを詰める（区間の境目で重複しうる）
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.2, out[i + 1].start);
  }
  // まったく同じ内容が連続していたら1つにする
  out = out.filter((c, i) => i === 0 || c.text !== out[i - 1].text || c.start - out[i - 1].start > 0.5);
  return out;
}

function _cuesToSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${_srtTime(c.start)} --> ${_srtTime(c.end)}\n${c.text}`).join('\n\n') + '\n';
}

// 出来上がったSRTが動画に対して妥当か検査する。
// おかしいまま返すとユーザーが「壊れた字幕」を保存してしまうので、
// ここで止めて理由を返す。
function _validateSrt(srt, durationSec) {
  const cues = _srtCues(srt);
  const dur = Number(durationSec) || 0;
  if (!cues.length) return '字幕が1件も取れませんでした';
  if (dur > 0) {
    const outside = cues.filter(c => c.start > dur + 5).length;
    if (outside > cues.length * 0.2) return `字幕の時刻が動画の長さ(${Math.round(dur)}秒)と合っていません`;
  }
  // 「動画の何割を覆っているか」は不正の根拠にならない。
  // 無音や実演だけの区間が長い教則では、発話が一部に偏るのが普通で、
  // これを条件にすると正常な字幕まで弾いてしまう（実際に弾いていた）。
  return null;
}

// ── 字幕生成: 動画1本＝リクエスト1回（全長共通・経路は1本だけ）──
// 区間分割（videoMetadataの窓指定）は本番で窓が守られず、前半30分が丸ごと欠けた
// 二重内容のファイルを$0.365で生成したため廃止した。長尺の成立条件は分割ではなく:
//  - 転送: 応答を最初の1バイトから流す（645秒のリクエスト完走を本番で確認済み）
//  - 入力量: media_resolution LOW（フレーム258→66トークン）で60分でも約35万トークン
async function _generateSubtitle(env, filePart, ctx, subLang, subOpts, durationSec) {
  const dur = Number(durationSec) || 0;
  const t0 = Date.now();
  const r = await _geminiGenerate(env,
    [filePart, { text: _aiSubtitlePrompt(ctx, subLang, subOpts) }], _genOptsFor('subtitle'));
  if (r.error) return r;
  const sec = Math.round((Date.now() - t0) / 1000);

  const cues = _srtCues(r.summary);
  if (!cues.length) {
    return { error: '字幕の生成結果が不正です', detail: '字幕が1件も取れませんでした（作り直してください）' };
  }
  // 大量欠損は「範囲外を捨てた後」では検出できない。捨てる前に先頭位置を見る
  // （前半30分が無いファイルを検証が素通しして保存した反省）。
  const repaired = _repairOffset(cues, dur);
  const first = repaired.reduce((m, c) => Math.min(m, c.start), Infinity);
  if (dur >= 600 && first > dur / 2) {
    return { error: '字幕の生成結果が不正です',
             detail: `字幕が${Math.floor(first / 60)}分以降にしかありません（動画全体を処理できていない可能性）。保存していません` };
  }
  // 生成が途中で終わったのに「完成品」として保存させない。
  // 判定は2条件そろったときだけ（誤検知で正常な字幕を弾いた過去があるため）:
  //   ① 応答が最後まで届いていない（finishReasonなし／読み取り例外／MAX_TOKENS）
  //   ② 最後のキューが動画のかなり手前で終わっている
  // ①だけなら通す＝取りこぼしても壊さない側に倒す。短尺(10分未満)は対象外。
  const last = repaired.reduce((m, c) => Math.max(m, c.start), 0);
  if (dur >= 600 && (r.cut || r.finish === 'MAX_TOKENS') && last < dur * 0.6) {
    const mmss = (s) => `${Math.floor(s / 60)}分${String(Math.floor(s % 60)).padStart(2, '0')}秒`;
    return { error: '字幕の生成が途中で切れました',
             detail: `${mmss(dur)}の動画に対して字幕が${mmss(last)}までしかありません`
               + `（${r.finish === 'MAX_TOKENS' ? '出力が上限に達しました' : r.cut}）。`
               + `途中までのものは保存していません。もう一度生成してください` };
  }
  const fixed = _cuesToSrt(_cleanupCues(cues, dur));
  const bad = _validateSrt(fixed, dur);
  if (bad) return { error: '字幕の生成結果が不正です', detail: bad + '（作り直してください）' };
  return { summary: fixed, usage: r.usage, costUsd: r.costUsd,
           diag: [{ sec, cues: cues.length, first: first === Infinity ? null : Math.round(first),
                    last: Math.round(last), fin: r.finish || (r.cut ? 'CUT' : ''),
                    outTok: r.usage?.candidatesTokenCount || 0 }] };
}

// ── YouTube 要約/一言解説/分岐抽出 ─────────────────────────
async function _aiSummaryYoutube(env, ytId, title, channel, playlist, mode, subLang, subOpts, chapOpts) {
  const videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
  const prompt   = _promptFor(mode, _ctxStr(title, channel, playlist), subLang, subOpts, chapOpts);
  try {
    const result = await _geminiGenerate(env, [
      { fileData: { fileUri: videoUrl } },
      { text: prompt },
    ], _genOptsFor(mode));
    if (result.error) return jsonRes(result, 502);
    return jsonRes({ summary: result.summary, usage: result.usage, costUsd: result.costUsd });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

// ── Google Drive 要約（Drive→Gemini Files APIストリーミング中継）──
async function _aiSummaryGdrive(env, gdFileId, accessToken, title, channel, playlist, mode, subLang, subOpts, chapOpts) {
  const apiKey = env.GEMINI_API_KEY;

  // 1. Drive ファイルメタデータ取得
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdFileId)}?fields=size,mimeType,name,videoMediaMetadata(durationMillis)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) return jsonRes({ error: 'Drive metadata error', detail: (await metaRes.text()).slice(0, 200) }, 502);
  const meta = await metaRes.json();
  const fileSize = parseInt(meta.size || '0');
  const mimeType = meta.mimeType || 'video/mp4';
  const fileName = meta.name || 'video.mp4';
  const durationSec = Number(meta.videoMediaMetadata?.durationMillis || 0) / 1000;
  if (!fileSize) return jsonRes({ error: 'ファイルサイズが取得できませんでした' }, 400);

  // 2. Gemini Files API — resumable upload 開始
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: fileName } }),
    }
  );
  if (!initRes.ok) return jsonRes({ error: 'Gemini upload init failed', detail: (await initRes.text()).slice(0, 200) }, 502);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) return jsonRes({ error: 'Gemini upload URL not returned' }, 502);

  // 3. Drive を Range で分割取得し、Gemini へ分割アップロード（resumable）
  //    一括ストリーム中継は大容量で "Network connection lost" になるため、16MBずつ中継する。
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdFileId)}?alt=media`;
  const CHUNK = 16 * 1024 * 1024;
  let upData = null;
  for (let offset = 0; offset < fileSize; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, fileSize) - 1;
    const isLast = end >= fileSize - 1;
    // Drive から該当バイト範囲を取得（一過性失敗に1回リトライ）
    let buf = null, dlErr = '';
    for (let attempt = 0; attempt < 2 && !buf; attempt++) {
      try {
        const dr = await fetch(driveUrl, { headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=${offset}-${end}` } });
        if (dr.status !== 206 && dr.status !== 200) { dlErr = 'Drive ' + dr.status; continue; }
        buf = await dr.arrayBuffer();
      } catch (e) { dlErr = e.message || String(e); }
    }
    if (!buf) return jsonRes({ error: 'Drive download failed', detail: `offset ${offset}: ${dlErr}` }, 502);
    // Gemini へ該当チャンクをPUT（最後のみ finalize、一過性失敗に1回リトライ）
    let okRes = null, upErr = '';
    for (let attempt = 0; attempt < 2 && !okRes; attempt++) {
      try {
        const r = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(buf.byteLength),
            'X-Goog-Upload-Offset': String(offset),
            'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
          },
          body: buf,
        });
        if (r.ok) okRes = r;
        else upErr = r.status + ': ' + (await r.text()).slice(0, 150);
      } catch (e) { upErr = e.message || String(e); }
    }
    if (!okRes) return jsonRes({ error: 'Gemini upload failed', detail: `chunk@${offset} ${upErr}` }, 502);
    if (isLast) upData = await okRes.json();
  }
  if (!upData) return jsonRes({ error: 'Gemini upload: 最終応答なし' }, 502);
  const fileUri  = upData.file?.uri;
  const geminiName = upData.file?.name;
  if (!fileUri) return jsonRes({ error: 'Gemini file URI not returned', detail: JSON.stringify(upData).slice(0, 200) }, 502);

  // 4. ファイル処理待ち（ACTIVE になるまでポーリング）
  let state = upData.file?.state || 'PROCESSING';
  // 1時間級の動画はGemini側の処理に数分かかる。応答は心拍で維持されるので長めに待つ。
  for (let i = 0; i < 96 && state !== 'ACTIVE'; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiName}?key=${apiKey}`);
    const pd   = await poll.json();
    state = pd.state || state;
    if (pd.state === 'FAILED') {
      _deleteGeminiFile(apiKey, geminiName);
      return jsonRes({ error: 'Gemini ファイル処理失敗' }, 502);
    }
  }
  if (state !== 'ACTIVE') {
    _deleteGeminiFile(apiKey, geminiName);
    return jsonRes({ error: 'Gemini ファイル処理タイムアウト' }, 504);
  }

  // 5. 生成（mode: summary/desc/branch）
  const ctx = _ctxStr(title, channel, playlist);
  let result;
  try {
    result = mode === 'subtitle'
      ? await _generateSubtitle(env, { fileData: { mimeType, fileUri } }, ctx, subLang, subOpts, durationSec)
      : mode === 'chapters'
      ? await _generateChapters(env, { fileData: { mimeType, fileUri } }, ctx, chapOpts, durationSec)
      : await _geminiGenerate(env, [
          { fileData: { mimeType, fileUri } },
          { text: _promptFor(mode, ctx, subLang, subOpts, chapOpts) },
        ], _genOptsFor(mode));
  } finally {
    _deleteGeminiFile(apiKey, geminiName); // 6. Gemini ファイル削除（課金回避）
  }
  if (result.error) return jsonRes(result, 502);
  return jsonRes({
    summary: result.summary, usage: result.usage, costUsd: result.costUsd,
    segments: result.segments || 1, via: 'video', durationSec, diag: result.diag,
  });
}

function _deleteGeminiFile(apiKey, name) {
  if (!name) return;
  fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
}

// ── ユーティリティ ────────────────────────────────────────
// ── /api/vimeo-proxy — Vimeo oEmbed プロキシ ─────────────
async function handleVimeoProxy(request) {
  const videoUrl = new URL(request.url).searchParams.get('url');
  if (!videoUrl || !/^https:\/\/vimeo\.com\/\d/.test(videoUrl)) {
    return jsonRes({ error: 'url パラメータが不正です' }, 400);
  }
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`;
  try {
    const res  = await fetch(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WazaKimura/1.0)' } });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...CORS, 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (e) {
    return jsonRes({ error: 'proxy failed: ' + e.message }, 500);
  }
}

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

// ═══ 字幕をASRで作る（AssemblyAI）════════════════════════════
// 設計の要点:
//  - タイムコードは音声から実測された値をそのまま使う。こちらでは一切作らない・直さない。
//    （LLMに時刻を書かせると60秒グリッドや途中打ち切りになるのが今回の原因だった）
//  - 非同期ジョブなので、Workerは投げて即返す。100秒制限とは無関係になる。
//  - Geminiの字幕生成経路には手を入れていない。並行して置く。

// AssemblyAI は audio_url を自分で取りに来る。Driveの動画を渡すには外から読める
// URLが要るが、ユーザーのGoogleトークンを他社に渡すわけにはいかない。
// そこで {fileId, token, exp} を封筒に入れて暗号化し、開けるのはこのWorkerだけにする。
async function _sealKey(env) {
  const secret = env.URL_SIGNING_KEY || env.ASSEMBLYAI_API_KEY || '';
  if (!secret) throw new Error('署名鍵がありません');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wk-asr-src\n' + secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function _b64uEnc(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64uDec(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function _seal(env, obj, ttlSec) {
  const key = await _sealKey(env);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify({ ...obj, exp: Date.now() + ttlSec * 1000 }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv, 0); all.set(ct, iv.length);
  return _b64uEnc(all);
}
async function _open(env, blob) {
  const key = await _sealKey(env);
  const all = _b64uDec(blob);
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
  const obj = JSON.parse(new TextDecoder().decode(pt));
  if (!obj.exp || Date.now() > obj.exp) throw new Error('期限切れ');
  return obj;
}

// AssemblyAI がここを取りに来る。封筒を開けてDriveの中身を素通しするだけ。
async function handleAsrSrc(request, env) {
  const blob = new URL(request.url).searchParams.get('t');
  if (!blob) return new Response('Missing t', { status: 400 });
  let o;
  try { o = await _open(env, blob); }
  catch (e) { return new Response('Link expired or invalid', { status: 403 }); }

  const h = { Authorization: `Bearer ${o.token}` };
  const range = request.headers.get('range');
  if (range) h['Range'] = range;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(o.fileId)}?alt=media`, { headers: h });

  const out = { 'Accept-Ranges': 'bytes' };
  for (const k of ['content-type', 'content-length', 'content-range']) {
    const v = r.headers.get(k);
    if (v) out[k] = v;
  }
  return new Response(r.body, { status: r.status, headers: out });
}

const AAI = 'https://api.assemblyai.com/v2';
function _aaiHeaders(env) {
  // 認証は authorization にキーをそのまま。Bearer は付けない（AssemblyAIの仕様）
  return { authorization: env.ASSEMBLYAI_API_KEY, 'content-type': 'application/json' };
}
function _aaiGuard(env) {
  if (!env.ASSEMBLYAI_API_KEY) {
    return jsonRes({ error: '字幕の書き起こしサービスが未設定です',
                     detail: 'ASSEMBLYAI_API_KEY が Worker に設定されていません' }, 500);
  }
  return null;
}

// ① 投げる: Driveの動画IDを受け取り、封筒URLを作ってAssemblyAIに渡す
async function handleAsrStart(request, env) {
  const bad = _aaiGuard(env); if (bad) return bad;
  if (request.method !== 'POST') return jsonRes({ error: 'POSTしてください' }, 405);

  let body;
  try { body = await request.json(); } catch { return jsonRes({ error: 'リクエストが不正です' }, 400); }
  const { fileId, token, langCode } = body || {};
  if (!fileId || !token) return jsonRes({ error: 'fileId と token が必要です' }, 400);

  // 30分あれば取り込みは終わる。Driveのアクセストークン自体の寿命より短くする。
  const sealed = await _seal(env, { fileId, token }, 30 * 60);
  const srcUrl = new URL(request.url).origin + '/api/asr-src?t=' + sealed;

  const payload = { audio_url: srcUrl };
  if (langCode) payload.language_code = langCode;   // 未指定なら向こうが自動判定
  else payload.language_detection = true;

  let res;
  try {
    res = await fetch(`${AAI}/transcript`, { method: 'POST', headers: _aaiHeaders(env), body: JSON.stringify(payload) });
  } catch (e) {
    return jsonRes({ error: '書き起こしサービスへの接続に失敗しました', detail: String(e && e.message || e) }, 502);
  }
  const r = await _jsonOrErr(res, '書き起こしの依頼');
  if (r.error) return jsonRes(r, 502);
  if (!res.ok) {
    return jsonRes({ error: '書き起こしを依頼できませんでした',
                     detail: String(r.data?.error || _httpErrText(res.status)) }, 502);
  }
  return jsonRes({ id: r.data.id, status: r.data.status });
}

// ② 待つ: 状態だけ返す。動画の長さも返るので、あとで見積りに使える。
async function handleAsrStatus(request, env) {
  const bad = _aaiGuard(env); if (bad) return bad;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonRes({ error: 'id が必要です' }, 400);

  const res = await fetch(`${AAI}/transcript/${encodeURIComponent(id)}`, { headers: _aaiHeaders(env) });
  const r = await _jsonOrErr(res, '書き起こしの確認');
  if (r.error) return jsonRes(r, 502);
  const d = r.data || {};
  return jsonRes({
    status: d.status,                       // queued / processing / completed / error
    error:  d.error || null,
    sec:    d.audio_duration || null,
    lang:   d.language_code || null,
  });
}

// ③ SRTを取る: 1キューあたりの最大文字数は向こうに任せる（自前で折り返さない）
async function handleAsrSrt(request, env) {
  const bad = _aaiGuard(env); if (bad) return bad;
  const q  = new URL(request.url).searchParams;
  const id = q.get('id');
  if (!id) return jsonRes({ error: 'id が必要です' }, 400);
  const chars = Number(q.get('chars')) || 0;

  const u = `${AAI}/transcript/${encodeURIComponent(id)}/srt`
          + (chars > 0 ? `?chars_per_caption=${Math.min(200, Math.max(8, Math.round(chars)))}` : '');
  const res = await fetch(u, { headers: { authorization: env.ASSEMBLYAI_API_KEY } });
  const text = await res.text();
  if (!res.ok) {
    return jsonRes({ error: '字幕を取得できませんでした', detail: _httpErrText(res.status) }, 502);
  }
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// ── /api/asr-sentences — 文単位の書き起こし（翻訳用）─────────────
// なぜ SRT ではなく文が必要か:
//   SRT のキューは「文字数」で切られるので、文の途中で切れる。
//     1) "We're now going to talk about movements which"
//     2) "are really important for guard retention"
//   これを1行ずつ訳させると、英語と日本語は語順が逆なので 1) だけでは
//   日本語の文にならない。モデルは 2) の内容を引っ張ってきて1文にする。
//   結果、内容が丸ごと1キューぶん前にずれ、そのまま最後まで戻らない。
//   （実データで確認: 日本語字幕が冒頭から約3〜4秒早く出ていた）
// 文単位なら文が完結しているので、次の行から借りる必要がない。
// 時刻も AssemblyAI が単語単位で実測した文の開始・終了をそのまま使える。
async function handleAsrSentences(request, env) {
  const bad = _aaiGuard(env); if (bad) return bad;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonRes({ error: 'id が必要です' }, 400);

  const res = await fetch(`${AAI}/transcript/${encodeURIComponent(id)}/sentences`,
                          { headers: { authorization: env.ASSEMBLYAI_API_KEY } });
  if (!res.ok) {
    return jsonRes({ error: '文の取得に失敗しました', detail: _httpErrText(res.status) }, 502);
  }
  const d = await res.json();
  // start/end はミリ秒。秒に直して返す（クライアントは秒で扱う）
  const sentences = (d.sentences || []).map(s => ({
    text:  String(s.text || '').trim(),
    start: Number(s.start || 0) / 1000,
    end:   Number(s.end   || 0) / 1000,
  })).filter(s => s.text && s.end > s.start);
  return jsonRes({ sentences });
}

// ═══ 字幕の翻訳（Gemini 2.5 Flash）════════════════════════════
// 設計の核心: タイムコードは受け取らない。テキスト行だけを訳す。
// 時刻はASRの実測値としてクライアント側に残るので、翻訳がどう転んでも
// 字幕の時刻は絶対に壊れない。
//
// 出力は「配列の順番」ではなく {"i": 行番号, "ja": 訳文}。順番だけに頼ると
// 1本抜けた瞬間に以降が全部ずれ、別の行に別の訳が入る（検証で実際に発生）。
// 番号で戻せば、抜けた行は空欄として特定でき、呼び出し側が原文で埋められる。

const TR_LANGS = { ja:'日本語', en:'English', zh:'简体中文', ko:'한국어', es:'Español', pt:'Português', fr:'Français' };
const TR_MAX_LINES = 30;   // 1リクエストの上限。多いとモデルが途中で打ち切る

// 読む速度の上限（1秒あたりの文字数）。字幕制作の一般的な基準に合わせる。
//   日本語 … 1秒4文字（映像翻訳の実務基準）
//   英語など … Netflix Timed Text Style Guide の 17〜20 CPS
// これを超える量を入れると、読み終わる前に次へ変わる。
const TR_CPS = { ja:4, zh:5, ko:9, en:17, es:17, pt:17, fr:17 };

function _trMaxChars(sec, lang) {
  const cps = TR_CPS[lang] || TR_CPS.ja;
  return Math.max(10, Math.round((Number(sec) || 0) * cps));
}

// 1つの「文」を、まるごと1つの訳文として返させる。
//
// 設計の経緯（同じ所で2回失敗している）:
//   1) 字幕1枚ずつ訳させた → 語順が逆で断片が文にならず、モデルが次の字幕から
//      内容を借りて訳がまるごと前にずれた
//   2) 文を「元の字幕の枚数」に強制的に割らせた → 日本語は英語よりずっと短いので、
//      英語6枚ぶんの1文が「ガードパスの／様々な種類に／適用される／一般的な／
//      コンセプトについて／解説します」という4〜6文字の破片6枚になった
//   枚数を決めるのは翻訳側の仕事ではない。訳文の長さと表示時間から決まるもの。
//   ここでは文をまるごと訳すだけにして、何枚に分けるかは呼び出し側で決める。
function _trPrompt(items, lang, opts) {
  const o = opts || {};
  const target = TR_LANGS[lang] || TR_LANGS.ja;
  const rules = [`- 出力言語は${target}`];
  if (lang === 'ja') {
    rules.push(o.style === 'dearu' ? '- である調' : '- ですます調');
    if (o.terms === 'english')        rules.push('- 柔術の技術用語は英語のまま残す');
    else if (o.terms === 'translate') rules.push('- 柔術の技術用語も日本語に訳す');
    else                              rules.push('- 柔術の技術用語はカタカナ');
  }
  const body = items.map((it, i) => `${i + 1}. 【${it.cap}文字以内】${it.text}`).join('\n');

  return `あなたはブラジリアン柔術(BJJ)・グラップリングの教則動画の字幕翻訳者です。
英語の文を${target}に訳してください。

【文脈】
講師が技術を実演しながら解説している教則動画です。日常会話ではありません。
次は柔術の技術用語です。一般語として訳さないでください:
guard（ガード。警備ではない） / pass the guard / mount / side control / sweep /
base / frame / grip / drill / hook / underhook / overhook / heel hook /
dead foot, live foot, side foot / heel / pinky / ball of the foot / posture

【出力の決まり】
- 入力の各件に対し {"i": 件番号, "ja": 訳文} を1つずつ返す
- 全${items.length}件ぶんを必ず返す。1件も飛ばさない
- i は入力に振られた番号をそのまま使う
- 訳文は**1つの続いた文章**として返す。字幕用に区切らない（区切りは別で行う）
- 【N文字以内】は表示時間から決まった上限。超えるときは意味の中心を残して
  言い換え・省略して縮める（字幕翻訳では逐語訳より尺に収めることを優先する）
- **上限に収めるために内容を削りすぎない。**上限の7割程度は使ってよい。
  途中で終わる不完全な文にしてはいけない
${rules.join('\n')}
- 音声認識の誤認識（例: "Gitu"→jiu-jitsu, "girls"→drills, "sci-fi"→side foot）は
  文脈から補正してよい

【入力】
${body}`;
}

// Gemini の responseSchema（OpenAPIサブセット。型は大文字、additionalProperties 非対応）
const _TR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    translations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { i: { type: 'INTEGER' }, ja: { type: 'STRING' } },
        required: ['i', 'ja'],
        propertyOrdering: ['i', 'ja'],
      },
    },
  },
  required: ['translations'],
};

// 番号つきの結果を元の並びに戻す。欠けた番号はそのまま報告する。
// 枚数が指定と違って返ってきた件は「訳せなかった」として扱う。無理に詰めると
// 別の字幕に別の内容が入り、いちばん直したかったズレが再発する。
function _trRebuild(items, n) {
  const out = new Array(n).fill('');
  for (const it of (Array.isArray(items) ? items : [])) {
    const i  = Number(it && it.i);
    const ja = String((it && it.ja) || '').trim();
    if (!Number.isFinite(i) || i < 1 || i > n || !ja) continue;
    out[i - 1] = ja;
  }
  const missing = [];
  for (let k = 0; k < n; k++) if (!out[k]) missing.push(k + 1);
  return { lines: out, missing };
}

// POST /api/translate — 行の配列を受け取り、訳した行の配列を返す。
// 時刻は一切扱わない。呼び出し側が分割して順に投げる。
async function handleTranslate(request, env) {
  if (request.method !== 'POST') return jsonRes({ error: 'POSTしてください' }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonRes({ error: 'リクエストが不正です' }, 400); }

  // items: [{ text: 文, sec: その文の長さ(秒) }]
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (!raw.length)               return jsonRes({ error: '翻訳する行がありません' }, 400);
  if (raw.length > TR_MAX_LINES) return jsonRes({ error: `一度に翻訳できるのは${TR_MAX_LINES}件までです` }, 400);
  const lang = TR_LANGS[body?.lang] ? body.lang : 'ja';

  const items = [];
  for (const it of raw) {
    const text = String(it?.text || '').trim();
    if (!text) return jsonRes({ error: 'リクエストが不正です' }, 400);
    items.push({ text, cap: _trMaxChars(it?.sec, lang) });
  }

  const r = await _geminiGenerate(env, [{ text: _trPrompt(items, lang, body?.opts) }], {
    json: true, schema: _TR_SCHEMA,
    maxOutputTokens: 16384, thinkingBudget: 0, temperature: 0.3, what: '翻訳',
  });
  if (r.error) return jsonRes(r, r.quota ? 429 : 502);

  let parsed;
  try { parsed = JSON.parse(r.summary); }
  catch (e) { return jsonRes({ error: '翻訳結果を読み取れませんでした' }, 502); }

  const b = _trRebuild(parsed && parsed.translations, items.length);
  return jsonRes({ ...b, usage: r.usage, costUsd: r.costUsd });
}
