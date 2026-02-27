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
