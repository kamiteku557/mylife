# mylife 要件一覧（チェック管理）

最終更新: 2026-02-27

## 使い方
- このファイルを「要件の正本」とする。
- 要件が満たされたら `[x]` にする。
- 受け入れ確認の証跡（PR、URL、ファイル）を `証跡` に残す。

## ステータス凡例
- `[ ]` 未着手
- `[x]` 完了

## A. 基盤・運用要件
- [x] RQ-OPS-001: React/FastAPI のモノレポでローカル起動できる
  - 受け入れ条件: Frontend と Backend がローカルで起動する
  - 証跡: `README.md`, `apps/frontend/*`, `apps/backend/app/main.py`
- [x] RQ-OPS-002: Supabase に接続したAPIでDB疎通確認できる
  - 受け入れ条件: API経由で Supabase DB 接続確認ができる
  - 証跡: `apps/backend/app/main.py`, `apps/backend/app/supabase_health.py`, `apps/backend/tests/test_supabase_connection_api.py`, `curl /api/v1/ops/supabase-db-health = 200`
- [x] RQ-OPS-003: 主要テーブルを作成する migration がある
  - 受け入れ条件: spec 記載の主要テーブル定義が migration に含まれる
  - 証跡: `supabase/migrations/0001_init.sql`
- [ ] RQ-OPS-004: 認証後のみ主要APIを利用できる
  - 受け入れ条件: Supabase Auth（メールリンク）でAPIが保護される
  - 証跡: 未記入
- [x] RQ-OPS-005: Free Tier 構成を固定（CF Pages + Render + Supabase）
  - 受け入れ条件: 構成ドキュメントとデプロイ設定が一致し Railway を使わない
  - 証跡: `docs/spec.md`, `docs/deploy-minimal.md`, `render.yaml`
- [x] RQ-OPS-006: `.env.example` があり、機密値をコミットしない
  - 受け入れ条件: Frontend/Backend に env テンプレートがあり secrets 非コミット
  - 証跡: `apps/backend/.env.example`, `apps/frontend/.env.example`
- [ ] RQ-OPS-007: Supabase 公開クライアントキーを publishable key に移行する
  - 受け入れ条件: 公開クライアント向け設定で anon key を使わず publishable key を利用する
  - 証跡: 未記入

## B. MVP機能要件
- [ ] RQ-POM-001: ポモドーロ設定（取得/更新）ができる
  - 受け入れ条件: focus/short/long/long_break_every を保存・取得できる
  - 証跡: 未記入
- [ ] RQ-POM-002: ポモドーロ開始/停止/再開/終了ができる
  - 受け入れ条件: running/paused/completed/cancelled が正しく永続化される
  - 証跡: 未記入
- [ ] RQ-POM-003: タイマーUIで状態遷移できる
  - 受け入れ条件: 作業/休憩の遷移と開始・一時停止・再開・終了が可能
  - 証跡: 未記入
- [ ] RQ-POM-004: ポモドーロ集計（日/週/月）が見られる
  - 受け入れ条件: APIとUIで期間別集計を表示できる
  - 証跡: 未記入
- [ ] RQ-MEM-001: メモログCRUD APIがある
  - 受け入れ条件: Markdown本文、日付、タグ、関連セッションを保存できる
  - 証跡: 未記入
- [ ] RQ-MEM-002: メモ一覧/詳細/編集UIがある
  - 受け入れ条件: 作成・編集・閲覧・削除ができる
  - 証跡: 未記入
- [ ] RQ-MEM-003: タグでメモをフィルタできる
  - 受け入れ条件: タグ作成/紐づけ/絞り込みが可能
  - 証跡: 未記入
- [ ] RQ-MEM-004: メモ集計（期間/タグ）を表示できる
  - 受け入れ条件: 件数を期間別・タグ別に表示できる
  - 証跡: 未記入
- [ ] RQ-DIA-001: 日記CRUD APIがある
  - 受け入れ条件: 日付キーで1日1件を保存・更新できる
  - 証跡: 未記入
- [ ] RQ-DIA-002: 日記一覧/編集UIがある
  - 受け入れ条件: 日記の作成・編集・閲覧ができる
  - 証跡: 未記入
- [ ] RQ-EXP-001: MarkdownエクスポートAPIがある
  - 受け入れ条件: 期間・種別指定で Markdown または zip を生成できる
  - 証跡: 未記入
- [ ] RQ-EXP-002: UIからエクスポートできる
  - 受け入れ条件: 設定画面の操作でダウンロードできる
  - 証跡: 未記入
- [ ] RQ-EXP-003: 出力品質（UTF-8、日本語、改行、リンク）を満たす
  - 受け入れ条件: 文字化けや構造崩れがない
  - 証跡: 未記入
- [ ] RQ-EXP-004: 週1バックアップ手順が運用ガイドにある
  - 受け入れ条件: docs 内に実施手順が明記される
  - 証跡: 未記入

## C. 品質・ガードレール要件
- [x] RQ-GRD-001: 添付ファイル機能をMVP対象外とする
  - 受け入れ条件: Storage増大につながる要件がMVP外で固定される
  - 証跡: `docs/spec.md`
- [x] RQ-GRD-002: 集計はオンデマンド（定期バッチなし）
  - 受け入れ条件: cron/scheduler が不要な設計である
  - 証跡: `docs/spec.md`, `docs/free-tier-checklist.md`
- [x] RQ-GRD-003: 無料枠チェックリストがある
  - 受け入れ条件: デプロイ前確認項目が文書化されている
  - 証跡: `docs/free-tier-checklist.md`
- [ ] RQ-QLT-001: Backend テストがある
  - 受け入れ条件: 主要APIの正常/異常系をカバーする
  - 証跡: 未記入
- [ ] RQ-QLT-002: Frontend テストがある
  - 受け入れ条件: 主要UI操作を検証する
  - 証跡: 未記入
- [ ] RQ-QLT-003: 最低1本のE2Eがある
  - 受け入れ条件: 主要導線が1本通る
  - 証跡: 未記入
- [ ] RQ-QLT-004: モバイル幅で主要画面が崩れない
  - 受け入れ条件: iPhone幅で主要画面が操作可能
  - 証跡: 未記入

## MVP完了条件
- [ ] ポモドーロ・メモ・日記の主要フローが実行可能
- [ ] データが永続化される
- [ ] Markdownエクスポート可能
- [ ] モバイル幅で操作可能
- [ ] Cloudflare Pages + Render Free + Supabase Free で動作する
- [ ] Railway未使用で運用できる
