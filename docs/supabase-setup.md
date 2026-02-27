# Supabase セットアップ（MVP初期）

## 1. プロジェクト作成
- Supabaseで新規プロジェクトを作成
- `Project URL` と `API Keys` を控える

## 2. 初期スキーマ適用
- Supabase Dashboard -> SQL Editor を開く
- `/supabase/migrations/0001_init.sql` の内容を貼り付けて実行

## 3. Backend環境変数
`apps/backend/.env` または Render の Environment に設定:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

## 4. 確認
- SQL Editorで `public.users` などテーブル作成を確認
- エラーがなければ初期化完了

## 5. API経由で実疎通確認（BL-001 / RQ-OPS-002）
1. Backendを起動:
```bash
cd apps/backend
uv run fastapi dev app/main.py --port 8000
```
2. 別ターミナルで接続確認APIを実行:
```bash
curl http://localhost:8000/api/v1/ops/supabase-db-health
```
3. `status=ok` が返れば実疎通確認完了。例:
```json
{
  "status": "ok",
  "database": "supabase",
  "checked_table": "users",
  "row_count": 0,
  "total_count": 0
}
```

### 失敗時の切り分け
- `503`: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（または `SUPABASE_ANON_KEY`）未設定
- `502`: URL/キー不一致、ネットワーク、またはSupabase側設定の問題
