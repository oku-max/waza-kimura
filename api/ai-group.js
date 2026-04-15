// ═══ WAZA KIMURA — AI グルーピング提案 API ═══
// Vercel Serverless Function
// POST /api/ai-group
// Body: { tags: string[] }
// Returns: { groups: [{ name, desc, tags[] }] }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { tags } = req.body || {};
  if (!Array.isArray(tags) || !tags.length) {
    return res.status(400).json({ error: 'tags array is required' });
  }

  const systemPrompt = `あなたはブラジリアン柔術 (BJJ) の専門知識を持つアシスタントです。
与えられたタグ一覧（技名・ムーブ名など）を、BJJの観点から意味のあるグループに分類してください。

ルール:
- グループ数は 2〜8 個が目安（タグ数によって調整）
- 1グループに最低2つのタグを入れること（1つしか該当しない場合はその他グループへ）
- グループ名は日本語で、簡潔に（〜系、〜技、〜ムーブ など）
- desc（説明）は20文字以内
- すべてのタグをいずれかのグループに必ず含める
- JSONのみ返す（説明文・コードブロック不要）

返却形式:
{"groups":[{"name":"グループ名","desc":"説明","tags":["タグ1","タグ2"]}]}`;

  const userMessage = `以下のタグをグルーピングしてください:\n${tags.join(', ')}`;

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

    // 全タグが含まれているか検証・補完
    const tagSet = new Set(tags);
    const covered = new Set((parsed.groups||[]).flatMap(g => g.tags||[]));
    const missed = tags.filter(t => !covered.has(t));
    if (missed.length) {
      parsed.groups = parsed.groups || [];
      parsed.groups.push({ name: 'その他のテクニック', desc: '未分類', tags: missed });
    }

    return res.status(200).json({ groups: parsed.groups || [] });

  } catch (e) {
    console.error('ai-group error:', e);
    return res.status(500).json({ error: e.message });
  }
}
