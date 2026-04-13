// ═══ WAZA KIMURA — AI タグ提案 API (4層タグ体系) ═══
// Vercel Serverless Function
// POST /api/ai-tag
// Body: {
//   title, channel, playlist, chapters,
//   tbValues:   ['トップ','ボトム','スタンディング'],
//   categories: [{ id, name, desc, aliases }],
//   positions:  [{ id, ja, en, aliases }],
//   tagBlocklist: string[],
//   bjjRules:   string[],
//   flexibility: 'strict'|'standard'|'flexible',
//   model: 'haiku'|'sonnet',
//   feedbackExamples: [{ title, channel?, playlist?, tags:{tb,cat,pos,tags} }]
// }
// Returns: { tb:[], cat:[], pos:[], tags:[] }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const MODEL_MAP = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250514',
};

// フォールバック (リクエストに含まれない場合)
const DEFAULT_TB = ['トップ','ボトム','スタンディング'];

function buildSystemPrompt({ tbValues, categories, positions, bjjRules, tagBlocklist, flexibility }) {
  const tbList = (tbValues || DEFAULT_TB).join(' / ');

  const catSection = (categories || []).map(c => {
    const aliases = (c.aliases && c.aliases.length) ? `  別名: ${c.aliases.join(', ')}` : '';
    return `- ${c.name}: ${c.desc || ''}${aliases ? '\n' + aliases : ''}`;
  }).join('\n');

  const posSection = (positions || []).map(p => {
    const aliases = (p.aliases && p.aliases.length) ? p.aliases.join(', ') : '';
    return `- ${p.ja} (${p.en || ''}${aliases ? ' / ' + aliases : ''})`;
  }).join('\n');

  const flexNote = {
    strict:   '- カテゴリー・ポジションは必ず上記リストの「正式名」のみを使う。リスト外の語は絶対に出力しない。',
    standard: '- カテゴリー・ポジションは上記リストの「正式名」のみを使う。曖昧な語は無理に当てはめず空配列にする。',
    flexible: '- カテゴリー・ポジションは上記リストの「正式名」を優先。新しいポジションが明確に判別できる場合のみ #タグへ追加する。',
  }[flexibility || 'standard'];

  const rulesSection = (bjjRules && bjjRules.length)
    ? `\n【BJJ判定ルール — 必ず従うこと】\n${bjjRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`
    : '';

  const blockSection = (tagBlocklist && tagBlocklist.length)
    ? `\n【禁止リスト — 絶対に出力禁止】\n${tagBlocklist.join(' / ')}\n`
    : '';

  return `あなたはブラジリアン柔術 (BJJ) の専門知識を持つタグ付けアシスタントです。
動画タイトル・チャンネル名・プレイリスト名・チャプター情報を分析し、4層タグ体系で最適なタグをJSONで返してください。

【Layer 1: TB (TOP/BOTTOM)】複数可
${tbList}

TB 判定ルール:
- ガードを取る側 (相手の上に乗る前 / 立位 / バックを取る攻撃側) → トップ
- ガードを取られている側 / ボトムからのスイープ / サブミッション → ボトム
- 立ち技・テイクダウン入り口 → スタンディング
- ハーフガード・ニーシールドなど明確にボトム視点 → ボトム
- 1動画に複数 TB が混在しても可 (例: スイープ → ボトム + トップ)

【Layer 2: Category】固定リスト・名前は完全一致で返すこと
${catSection}

カテゴリー判定ルール:
- desc (説明文) を読み、動画内容に最も近いカテゴリーを 1〜3 個選ぶ
- 確信が持てない場合は空配列 (推測で埋めない)
- 「name」フィールドの正式名のみ返す。aliases や英語名は返さない

【Layer 3: Position】固定リスト・必ず「ja」(日本語名) で返すこと
${posSection}

ポジション正規化ルール:
- 入力テキストが英語名・別名・カタカナ表記ゆれでも、対応する「ja」名に正規化して返す
  例: "De La Riva" / "DLR" / "デラヒバ" → "デラヒーバ"
  例: "Z Guard" → "ニーシールド"
  例: "Honey Hole" / "411" → "サドル"
- リストにないポジションは pos に入れず、tags (#タグ) に元の語を入れる
- 明確に判定できないなら空配列
${rulesSection}${blockSection}
【重要：BJJ知識による推論】
- タイトルに直接書かれていない情報でも、BJJの専門知識から推論して判定せよ
- 技名からカテゴリ・ポジション・TB を因果関係で導き出すこと
- 例: "Berimbolo" → スイープ系でバックテイクに繋がる → cat に両方入れる
- 例: "Knee Cut" → トップからのパスガード → TB=トップ, cat=パスガード
- 例: "Collar Sleeve to Omoplata" → ボトムからサブミッション → TB=ボトム, cat=フィニッシュ, pos=片襟片袖
- マウント・サイドコントロール・ニーオンベリー等はPOSITIONSリストにないので tags に入れる

ルール:
${flexNote}
- タイトル・チャンネル・プレイリスト・チャプターの語を拾い、さらにBJJ知識で推論を加える
- tags (#タグ) は技名・固有名など自由欄。長さは 30 文字以内
- JSON のみ返す (説明文・コードブロック不要)

返却形式 (例):
{"tb":["ボトム"],"cat":["スイープ"],"pos":["デラヒーバ"],"tags":["ベリンボロ"]}`;
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

  const {
    title, channel, playlist, chapters,
    tbValues, categories, positions, tagBlocklist,
    bjjRules, flexibility, model, feedbackExamples,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });

  const blockSet = new Set(Array.isArray(tagBlocklist) ? tagBlocklist : []);
  const systemPrompt = buildSystemPrompt({ tbValues, categories, positions, bjjRules, tagBlocklist, flexibility });
  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku;

  const userMessage = [
    `タイトル:${title}`,
    channel  ? `チャンネル:${channel}`   : null,
    playlist ? `プレイリスト:${playlist}` : null,
    chapters?.length ? `チャプター:${chapters.join(' / ')}` : null,
  ].filter(Boolean).join('\n');

  const messages = [];

  // Few-shot 例 (新スキーマ {tb, cat, pos, tags} を期待)
  if (Array.isArray(feedbackExamples) && feedbackExamples.length) {
    for (const ex of feedbackExamples.slice(-15)) {
      if (!ex.title || !ex.tags) continue;
      const exUser = [
        `タイトル:${ex.title}`,
        ex.channel  ? `チャンネル:${ex.channel}`   : null,
        ex.playlist ? `プレイリスト:${ex.playlist}` : null,
      ].filter(Boolean).join('\n');
      messages.push({ role: 'user',      content: exUser });
      messages.push({ role: 'assistant', content: JSON.stringify(ex.tags) });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      modelId,
        max_tokens: 400,
        system:     systemPrompt,
        messages,
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

    // 妥当性フィルタ
    const tbAllowed  = new Set(tbValues || DEFAULT_TB);
    const catAllowed = new Set((categories || []).map(c => c.name));
    const posAllowed = new Set((positions || []).map(p => p.ja));

    const safeArr  = (arr, allowed) => (Array.isArray(arr) ? arr : [])
      .filter(v => typeof v === 'string' && allowed.has(v) && !blockSet.has(v));
    const safeFree = (arr) => (Array.isArray(arr) ? arr : [])
      .filter(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 40 && !blockSet.has(v));

    return res.status(200).json({
      tb:   safeArr(parsed.tb,  tbAllowed),
      cat:  safeArr(parsed.cat, catAllowed),
      pos:  safeArr(parsed.pos, posAllowed),
      tags: safeFree(parsed.tags),
    });

  } catch (e) {
    console.error('ai-tag error:', e);
    return res.status(500).json({ error: e.message });
  }
}
