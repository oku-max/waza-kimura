// ═══ WAZA KIMURA — AI タグ提案 API ═══
// Vercel Serverless Function
// POST /api/ai-tag
// Body: { title, channel, playlist, flexibility, presets }
// Returns: { tb, action, position, tech }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const TB_TAGS   = ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'];
const AC_TAGS   = ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'];
const POS_TAGS  = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
const TECH_TAGS = ['十字絞め','RNC','ギロチン','アナコンダ','ダースチョーク','ノースサウスチョーク','ボウアンドアロー','アームバー','キムラ','アメリカーナ','オモプラッタ','ヒールフック','インサイドヒールフック','アウトサイドヒールフック','ニーバー','トーホールド','アンクルロック','カーフスライサー','シザースイープ','フラワースイープ','ヒップバンプスイープ','バタフライスイープ','SLXスイープ','バックテイク','ダブルレッグ','シングルレッグ','ベリンボロ','トレアンダー','ニーカット','トレアンダーパス','ブルファイターパス','レッグドラッグ','スタックパス','スマッシュパス','バックステップ','X-パス','ディープハーフエントリー','クレーンロール','ガスペダル','カウンター'];

function buildSystemPrompt(presets, flexibility) {
  const tbList   = (presets?.tb   || TB_TAGS).join(' / ');
  const acList   = (presets?.ac   || AC_TAGS).join(' / ');
  const posList  = (presets?.pos  || POS_TAGS).join(' / ');
  const techList = (presets?.tech || TECH_TAGS).join(' / ');

  const flexNote = {
    strict:   `- 各カテゴリは必ず上記リストの言葉のみ使う。リスト外の単語は絶対に使わない。`,
    standard: `- TOP/BOTTOM・ACTION・POSITIONは上記リストから選ぶ。
- TECHNIQUEはリストを優先しつつ、タイトルに明確に含まれるBJJ技術名は新規追加可（カタカナ・日本語）。`,
    flexible: `- TOP/BOTTOM・ACTION・POSITIONは上記リストを優先しつつ、関連用語があれば新規追加可。
- TECHNIQUEはタイトルから技術名を積極的に抽出し新規追加可。BJJ用語として妥当なものを提案すること。`,
  }[flexibility || 'standard'];

  return `あなたはブラジリアン柔術（BJJ）の専門知識を持つタグ付けアシスタントです。
動画タイトル・チャンネル名・プレイリスト名を分析し、最適なタグをJSONで返してください。

【TOP/BOTTOM】ユーザー設定リスト：
${tbList}

【ACTION】ユーザー設定リスト：
${acList}

【POSITION】ユーザー設定リスト：
${posList}

【TECHNIQUE】ユーザー設定リスト（参考）：
${techList}

ルール：
${flexNote}
- 確信が持てないカテゴリは空配列にする
- JSONのみを返す（説明文・コードブロック不要）

返却形式（例）：
{"tb":["ボトム"],"action":["スイープ"],"position":["ハーフガード"],"tech":["キスオブザドラゴン"]}`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { title, channel, playlist, flexibility, presets } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });

  const systemPrompt = buildSystemPrompt(presets, flexibility);

  const userMessage = [
    `タイトル：${title}`,
    channel  ? `チャンネル：${channel}`   : null,
    playlist ? `プレイリスト：${playlist}` : null,
  ].filter(Boolean).join('\n');

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
        max_tokens: 300,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
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
    const tags = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // tb / action / position はプリセットリストでフィルター
    const safe = (arr, allowed) =>
      (Array.isArray(arr) ? arr : []).filter(v => allowed.includes(v));

    // tech はタイトルから自由抽出（長さ上限のみ）
    const safeTech = Array.isArray(tags.tech)
      ? tags.tech.filter(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 40)
      : [];

    return res.status(200).json({
      tb:       safe(tags.tb,       presets?.tb  || TB_TAGS),
      action:   safe(tags.action,   presets?.ac  || AC_TAGS),
      position: safe(tags.position, presets?.pos || POS_TAGS),
      tech:     safeTech,
    });

  } catch (e) {
    console.error('ai-tag error:', e);
    return res.status(500).json({ error: e.message });
  }
}
