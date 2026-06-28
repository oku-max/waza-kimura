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
      case '/api/ai-group':         return await handleAiGroup(request, env);
      case '/api/ai-tag':      return await handleAiTag(request, env);
      case '/api/ai-summary':  return await handleAiSummary(request, env);
      case '/api/vimeo-proxy': return await handleVimeoProxy(request);
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

  const auth = await verifyOwner(idToken, env);
  if (!auth.ok) return jsonRes({ error: 'unauthorized', detail: auth.error }, 403);

  const { gdFileId, accessToken: gdToken } = body;

  if (source === 'youtube') {
    if (!ytId || !/^[\w-]{6,20}$/.test(ytId)) {
      return jsonRes({ error: 'ytId が不正です' }, 400);
    }
    return _aiSummaryYoutube(env, ytId, title, channel, playlist);
  }
  if (source === 'gdrive') {
    if (!gdFileId || !gdToken) {
      return jsonRes({ error: 'gdFileId と accessToken が必要です' }, 400);
    }
    return _aiSummaryGdrive(env, gdFileId, gdToken, title, channel, playlist);
  }
  return jsonRes({ error: 'source は youtube または gdrive を指定してください' }, 400);
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
◾️手順の要点（ステップ順）
◾️重要なディテール／コツ
◾️ありがちなミス・注意点

【記号ルール】見出しは ◾️ のみを使い、Markdownの # や ** といった記号は一切使わないこと。箇条書きは行頭に「- 」を付けること。
【タイムスタンプ】手順・コツ・注意点の各項目には、その内容が画面で最もはっきり示されている瞬間の時間を [M:SS] 形式で「- 」の直後に付けること（例: - [1:23] ...）。タイムスタンプは静止画のサムネイルとして使うため、技・体勢・グリップがはっきり映り、解説と一致する瞬間を選ぶこと。各項目のタイムスタンプは互いに数秒以上ずらし、同じ場面を繰り返し指さないこと。特定できない項目は省略可。
専門用語はBJJで一般的な表記を使い、冗長な前置きは書かないこと。`;
}

function _ctxStr(title, channel, playlist) {
  return [
    title    ? `タイトル: ${title}`        : null,
    channel  ? `チャンネル: ${channel}`    : null,
    playlist ? `プレイリスト: ${playlist}` : null,
  ].filter(Boolean).join('\n');
}

async function _geminiGenerate(env, parts) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = env.GEMINI_API_KEY;
  // 2.5系の思考モデルは思考トークンが出力枠を食い潰し、本文が空（finishReason=MAX_TOKENS）になることがある。
  // 思考量を上限付きに固定し、出力枠を広く確保して要約本文ぶんを必ず残す。
  const generationConfig = { temperature: 0.3, maxOutputTokens: 8192 };
  if (/2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 2048 };
  const gRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    }
  );
  const data = await gRes.json();
  if (!gRes.ok) return { error: 'Gemini API error', detail: data?.error?.message || JSON.stringify(data).slice(0, 300) };
  const cand = data.candidates?.[0];
  const summary = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n').trim();
  if (!summary) {
    const fr = cand?.finishReason || 'no text';
    const detail = fr === 'MAX_TOKENS' ? '出力が上限に達しました（動画が長い可能性）'
                 : fr === 'SAFETY' || fr === 'PROHIBITED_CONTENT' ? 'コンテンツ判定で生成がブロックされました'
                 : fr === 'RECITATION' ? '引用判定でブロックされました'
                 : fr;
    return { error: '要約を取得できませんでした', detail };
  }
  return { summary };
}

// ── YouTube 要約 ───────────────────────────────────────────
async function _aiSummaryYoutube(env, ytId, title, channel, playlist) {
  const videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
  const prompt   = _aiPrompt(_ctxStr(title, channel, playlist));
  try {
    const result = await _geminiGenerate(env, [
      { fileData: { fileUri: videoUrl } },
      { text: prompt },
    ]);
    if (result.error) return jsonRes(result, 502);
    return jsonRes({ summary: result.summary });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

// ── Google Drive 要約（Drive→Gemini Files APIストリーミング中継）──
async function _aiSummaryGdrive(env, gdFileId, accessToken, title, channel, playlist) {
  const apiKey = env.GEMINI_API_KEY;

  // 1. Drive ファイルメタデータ取得
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdFileId)}?fields=size,mimeType,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) return jsonRes({ error: 'Drive metadata error', detail: (await metaRes.text()).slice(0, 200) }, 502);
  const meta = await metaRes.json();
  const fileSize = parseInt(meta.size || '0');
  const mimeType = meta.mimeType || 'video/mp4';
  const fileName = meta.name || 'video.mp4';
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
  for (let i = 0; i < 20 && state !== 'ACTIVE'; i++) {
    await new Promise(r => setTimeout(r, 3000));
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

  // 5. 要約生成
  const prompt = _aiPrompt(_ctxStr(title, channel, playlist));
  let result;
  try {
    result = await _geminiGenerate(env, [
      { fileData: { mimeType, fileUri } },
      { text: prompt },
    ]);
  } finally {
    _deleteGeminiFile(apiKey, geminiName); // 6. Gemini ファイル削除（課金回避）
  }
  if (result.error) return jsonRes(result, 502);
  return jsonRes({ summary: result.summary });
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
