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
- Render ping endpoint: `/api/v1/ping`
- Frontend表示でhealth JSONを取得できるか
- Render freeのコールドスタート遅延を許容

## Push通知（BL-038 / BL-040）
1. Render 側に以下の環境変数を設定する
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_SUBJECT`（例: `mailto:you@example.com`）
   - `PUSH_DISPATCH_TOKEN`
2. Frontend 側に `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` を設定する
3. GitHub Actions secret を設定する
   - `PUSH_DISPATCH_URL`（`https://<backend-domain>/api/v1/ops/push-dispatch`）
   - `PUSH_DISPATCH_TOKEN`（Render の `PUSH_DISPATCH_TOKEN` と同値）
4. `.github/workflows/push-dispatch.yml` の schedule（5分、`2-59/5`）で dispatch が実行されることを確認する
5. dispatch は `curl --retry` と `--max-time 90` を使い、Render Free のコールドスタートを許容する
6. GitHub Actions のログで dispatch API 応答JSON（`checked_sessions` / `sent_notifications`）を確認する
7. 無料運用では通知遅延（最大5分）を許容する
