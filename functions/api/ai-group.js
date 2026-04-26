// ═══ WAZA KIMURA — AI タグ割り当て提案 API ═══
// Cloudflare Pages Function
// POST /api/ai-group
// Body: { tags: string[], existingGroups: [{name}] }
// Returns: { assignments: [{tag, group}] }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: JSON_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const { tags, existingGroups } = body;

  if (!Array.isArray(tags) || !tags.length) {
    return new Response(JSON.stringify({ error: 'tags array is required' }), { status: 400, headers: JSON_HEADERS });
  }
  if (!Array.isArray(existingGroups) || !existingGroups.length) {
    return new Response(JSON.stringify({ error: 'existingGroups array is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const groupList = existingGroups.map(g => `- ${g.name}`).join('\n');

  const systemPrompt = `あなたはブラジリアン柔術 (BJJ) の専門知識を持つアシスタントです。
与えられた未分類タグを、既存グループのいずれかに割り当ててください。

ルール:
- 各タグは既存グループの中から最も適切な1つに割り当てる
- 既存グループに明確に合わないタグは結果から除外する（無理に当てはめない）
- グループ名は提供されたリストの名前を一字一句正確に使う
- JSONのみ返す（説明文・コードブロック不要）

返却形式:
{"assignments":[{"tag":"タグ名","group":"グループ名"}]}`;

  const userMessage = `既存グループ:\n${groupList}\n\n未分類タグ:\n${tags.join(', ')}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: 'AI API error', detail: err }), { status: 502, headers: JSON_HEADERS });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const validGroupNames = new Set(existingGroups.map(g => g.name));
    const assignments = (parsed.assignments || []).filter(
      a => a.tag && a.group && validGroupNames.has(a.group)
    );

    return new Response(JSON.stringify({ assignments }), { status: 200, headers: JSON_HEADERS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: JSON_HEADERS });
  }
}
