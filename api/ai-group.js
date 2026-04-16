// ═══ WAZA KIMURA — AI タグ割り当て提案 API ═══
// Vercel Serverless Function
// POST /api/ai-group
// Body: { tags: string[], existingGroups: [{name}] }
// Returns: { assignments: [{tag, group}] }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { tags, existingGroups } = req.body || {};
  if (!Array.isArray(tags) || !tags.length) {
    return res.status(400).json({ error: 'tags array is required' });
  }
  if (!Array.isArray(existingGroups) || !existingGroups.length) {
    return res.status(400).json({ error: 'existingGroups array is required' });
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
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI API error', detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // 既存グループ名のみ通す
    const validGroupNames = new Set(existingGroups.map(g => g.name));
    const assignments = (parsed.assignments || []).filter(
      a => a.tag && a.group && validGroupNames.has(a.group)
    );

    return res.status(200).json({ assignments });

  } catch (e) {
    console.error('ai-group error:', e);
    return res.status(500).json({ error: e.message });
  }
}
