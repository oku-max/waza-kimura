// ═══ WAZA KIMURA — AI タグ提案 API ═══
// Vercel Serverless Function
// POST /api/ai-tag
// Body: { title, channel, playlist }
// Returns: { tb, action, position, tech }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const TB_TAGS      = ['トップ','ボトム','スタンディング','バック','ハーフ','ドリル'];
const AC_TAGS      = ['エスケープ・ディフェンス','パスガード','アタック','スイープ','リテンション','コントロール','テイクダウン','フィニッシュ','ドリル','その他'];
const POS_TAGS     = ['クローズドガード','ハーフガード','マウント','サイドコントロール','バック','タートル','Xガード','デラヒーバ','バタフライガード','オープンガード','50/50','スタンディング'];
const TECH_TAGS    = ['十字絞め','RNC','ギロチン','アナコンダ','ダースチョーク','ノースサウスチョーク','ボウアンドアロー','アームバー','キムラ','アメリカーナ','オモプラッタ','ヒールフック','インサイドヒールフック','アウトサイドヒールフック','ニーバー','トーホールド','アンクルロック','カーフスライサー','シザースイープ','フラワースイープ','ヒップバンプスイープ','バタフライスイープ','SLXスイープ','バックテイク','ダブルレッグ','シングルレッグ','ベリンボロ','トレアンダー','ニーカット','トレアンダーパス','ブルファイターパス','レッグドラッグ','スタックパス','スマッシュパス','バックステップ','X-パス','ディープハーフエントリー','クレーンロール','ガスペダル','カウンター'];

const SYSTEM_PROMPT = `あなたはブラジリアン柔術（BJJ）動画のタグ付けアシスタントです。
動画のタイトル・チャンネル名・プレイリスト名を見て、最適なタグをJSONで返してください。

【TOP/BOTTOM】選択肢から選ぶ：
${TB_TAGS.join(' / ')}

【ACTION】選択肢から選ぶ：
${AC_TAGS.join(' / ')}

【POSITION】選択肢から選ぶ：
${POS_TAGS.join(' / ')}

【TECHNIQUE】技術名をタイトルから直接抽出する（リストは参考）：
参考リスト: ${TECH_TAGS.join(' / ')}
★ リストにない技術名でもタイトルに含まれていれば必ず抽出すること
★ 例: 「キスオブザドラゴン」「Kガード」「ニーシールド」「クロスガード」等

ルール：
- TOP/BOTTOM・ACTION・POSITIONは必ず選択肢の言葉をそのまま使う
- TECHNIQUEはタイトルから技術名を積極的に抽出（日本語・英語カタカナ）
- 確信が持てないカテゴリは空配列にする
- JSONのみを返す（説明文・コードブロック不要）

返却形式（例）：
{"tb":["ボトム"],"action":["スイープ"],"position":["ハーフガード"],"tech":["キスオブザドラゴン"]}`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { title, channel, playlist } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

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
        model:      'claude-haiku-4-5',
        max_tokens: 256,
        system:     SYSTEM_PROMPT,
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

    // JSON を安全にパース
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const tags = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // リスト外の値を除去（安全フィルター）
    const safe = (arr, allowed) =>
      (Array.isArray(arr) ? arr : []).filter(v => allowed.includes(v));

    // tech はタイトルから自由抽出するためフィルタなし（長さ上限のみ）
    const safeTech = Array.isArray(tags.tech)
      ? tags.tech.filter(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 40)
      : [];
    return res.status(200).json({
      tb:       safe(tags.tb,       TB_TAGS),
      action:   safe(tags.action,   AC_TAGS),
      position: safe(tags.position, POS_TAGS),
      tech:     safeTech,
    });

  } catch (e) {
    console.error('ai-tag error:', e);
    return res.status(500).json({ error: e.message });
  }
}
