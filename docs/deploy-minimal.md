# 最小構成デプロイ手順（動作確認まで）

最終更新: 2026-02-26

対象構成:
- Frontend: Cloudflare Pages Free
- Backend: Render Free Web Service
- DB/Auth: Supabase Free（この最小版では未接続でも起動確認可）

## 1. 事前準備
- GitHubにこのリポジトリをpush済み
- Supabaseプロジェクト作成済み（URL/Keys取得）

## 2. BackendをRenderへデプロイ
1. Renderで `New +` → `Blueprint` を選択
2. このリポジトリを接続
3. `render.yaml` を読み込んで作成
4. `mylife-api` サービスの環境変数を設定
- `CORS_ALLOW_ORIGINS`: 後で発行されるFrontend URL
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

5. デプロイ完了後、以下を確認
- `https://<render-app>.onrender.com/api/v1/health` が 200

## 3. FrontendをCloudflare Pagesへデプロイ
1. Cloudflare Pagesで `Create a project` → Git連携
2. Build設定:
- Framework preset: Vite
- Root directory: `apps/frontend`
- Build command: `pnpm install --frozen-lockfile && pnpm --filter mylife-frontend build`
- Build output directory: `apps/frontend/dist`

3. 環境変数を設定
- `VITE_API_BASE_URL=https://<render-app>.onrender.com`

4. デプロイ後、ページ表示を確認
- `Backend health` に `status: ok` が表示される

## 4. CORS仕上げ
- Render側 `CORS_ALLOW_ORIGINS` を Cloudflare Pages の本番URLに更新
- 再デプロイ後、Frontendからhealth取得できることを確認

## 5. 最小動作確認チェック
- [ ] Frontend本番URLが表示される
- [ ] Backend `/api/v1/health` が200
- [ ] Frontend上でhealth JSONが表示される

## 6. トラブルシュート
1. FrontendでCORSエラー
- Render `CORS_ALLOW_ORIGINS` に Frontend URL が一致しているか確認

2. Renderでビルド失敗
- `apps/backend/uv.lock` がコミットされているか確認
- `buildCommand`/`startCommand` を `render.yaml` と一致させる

3. Cloudflareでビルド失敗
- Nodeバージョンを20以上に設定
- `pnpm-lock.yaml` が存在するか確認
