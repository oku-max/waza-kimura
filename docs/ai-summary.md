# AI動画要約 (Gemini)

VパネルのMemo欄から、動画をAIで要約して追記する機能。

## フェーズ
- **フェーズ1（実装済み）**: YouTube 動画。Gemini に YouTube URL を直接渡して解析（ファイル中継不要）。
- フェーズ2（未）: Google Drive。プロキシで取得→Gemini Files API へストリーミング・アップロード。
- フェーズ3（未）: Vimeo（ダウンロード可否次第）。

## アクセス制限
- **クライアント**: `okujournal@gmail.com` でログイン時のみ「✨ AI要約」ボタンを表示（`js/vpanel.js`）。
- **サーバー**: `/api/ai-summary` が Firebase ID トークンを Identity Toolkit で検証し、メールが一致しなければ 403（`_worker.js` の `verifyOwner`）。クライアントを迂回した直接アクセスでもコストが漏れない。

## エンドポイント
`POST /api/ai-summary`
```json
{ "idToken": "<Firebase IDトークン>", "source": "youtube", "ytId": "xxxx",
  "title": "", "channel": "", "playlist": "" }
```
→ `{ "summary": "..." }`

## 必要な環境変数（Cloudflare）
| 変数 | 必須 | 説明 |
|---|---|---|
| `GEMINI_API_KEY` | ◎ | Google AI Studio で発行（無料・即時）。これが無いと 500 |
| `GEMINI_MODEL` | 任意 | 既定 `gemini-2.5-flash`。変更したい場合のみ |
| `FIREBASE_API_KEY` | 任意 | 既定で公開Webキーを使用。明示したい場合のみ |

### 設定方法
```
npx wrangler secret put GEMINI_API_KEY
```
または Cloudflare ダッシュボード → Workers & Pages → 該当プロジェクト → Settings → Variables。

## 出力
既存 Memo を壊さず、`── ✨ AI要約 (YYYY-MM-DD) ──` の見出し付きで**先頭に追記**。`v.memo` へ保存（Firebase 自動同期）。
