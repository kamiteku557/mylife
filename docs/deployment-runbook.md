# デプロイ運用ランブック（最小版）

## リリース手順
1. `main` へマージ
2. Renderデプロイ完了を確認
3. Cloudflare Pagesデプロイ完了を確認
4. 本番画面で `Backend health` を確認

## ロールバック
1. Render: 前回成功デプロイへロールバック
2. Cloudflare Pages: 前回成功デプロイへロールバック
3. フロントでhealthが復旧することを確認

## 監視ポイント
- Render health endpoint: `/api/v1/health`
- Frontend表示でhealth JSONを取得できるか
- Render freeのコールドスタート遅延を許容
