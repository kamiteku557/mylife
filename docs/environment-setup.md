# 開発環境セットアップ統合ガイド

最終更新: 2026-02-25

## 1. 採用方針
- Frontend: `pnpm workspace + React + Vite + TypeScript`
- Backend: `uv + FastAPI`
- 理由: 依存管理の再現性とセットアップ速度を優先したモダン構成

## 2. 必要ツール
- Node.js `20.19+`
- pnpm `10.x`
- Python `3.11+`（uvが不足時は自動取得可）
- uv `0.5+`

## 3. 初回セットアップ
### 3.1 Frontend
```bash
# repo root
pnpm install
cp apps/frontend/.env.example apps/frontend/.env
```

### 3.2 Backend
```bash
cd apps/backend
cp .env.example .env
UV_CACHE_DIR=/Users/kamiteku/Documents/my_app/mylife/.cache/uv uv sync
```

## 4. 開発サーバー起動
### 4.1 Backend
```bash
cd apps/backend
UV_CACHE_DIR=/Users/kamiteku/Documents/my_app/mylife/.cache/uv uv run fastapi dev app/main.py --port 8000
```

### 4.2 Frontend
```bash
# repo root
pnpm --filter mylife-frontend dev
```

## 5. 動作確認
- Backend health: `http://localhost:8000/api/v1/health`
- Frontend: `http://localhost:5173`

確認コマンド:
```bash
curl http://localhost:8000/api/v1/health
pnpm --filter mylife-frontend build
```

## 6. 環境変数
### 6.1 Backend (`apps/backend/.env`)
- `APP_ENV`
- `APP_NAME`
- `APP_PORT`
- `CORS_ALLOW_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

### 6.2 Frontend (`apps/frontend/.env`)
- `VITE_API_BASE_URL`

## 7. トラブルシュート
1. `pnpm: command not found`
- `npm install -g pnpm@10.18.3`

2. `uv sync` が権限エラー
- `UV_CACHE_DIR` をワークスペース内に指定して実行する

3. npm registry のDNS失敗（ENOTFOUND）
- ネットワーク制限下では依存取得に失敗するため、許可されたネットワークで再実行する

## 8. 参照ドキュメント
- `docs/dev-env-best-practices-2026-02-25.md`
- `docs/setup.md`
- `docs/deploy-minimal.md`
- `docs/deployment-runbook.md`
- `README.md`
