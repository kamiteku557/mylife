# mylife 実行バックログ

最終更新: 2026-02-27

このファイルは「次に実装するタスク」の管理用。  
要件の正本は `docs/requirements.md`。

## 運用ルール
1. 新機能/修正は、先に `docs/requirements.md` とこの `docs/backlog.md` を更新する。
2. 実装着手時にタスクを `Ready` から `In Progress` に移動する。
3. 完了時は受け入れ条件を確認し、`Done` に移動する。
4. `Done` に移したら、対応する要件IDを `docs/requirements.md` で `[x]` にする。
5. 最後に `main` へマージし、残タスクと新タスクをこのファイルへ反映する。

## Ready
- [ ] BL-002 (RQ-OPS-004): Supabase Auth によるAPI保護を実装する
  - 受け入れ条件: 未認証で主要APIにアクセスできない
- [ ] BL-003 (RQ-POM-001): ポモドーロ設定API（GET/PUT）を実装する
  - 受け入れ条件: 設定値を保存・取得できる
- [ ] BL-004 (RQ-POM-002): ポモドーロセッション制御APIを実装する
  - 受け入れ条件: start/pause/resume/finish の状態遷移が永続化される
- [ ] BL-005 (RQ-POM-003): タイマーUIを実装する
  - 受け入れ条件: UI操作で状態遷移できる
- [ ] BL-007 (RQ-DIA-001, RQ-DIA-002): 日記API/UIを実装する
  - 受け入れ条件: 日付単位で作成・更新・閲覧が可能
- [ ] BL-008 (RQ-EXP-001, RQ-EXP-002, RQ-EXP-003): エクスポートAPI/UIを実装する
  - 受け入れ条件: 指定期間・種別のMarkdown出力が可能
- [ ] BL-009 (RQ-QLT-001, RQ-QLT-002, RQ-QLT-003): テスト基盤を追加する
  - 受け入れ条件: Backend/Frontend/E2E の最低限テストが通る
- [ ] BL-010 (RQ-QLT-004): モバイル表示の調整と確認を行う
  - 受け入れ条件: iPhone幅で主要画面が崩れない
- [ ] BL-011 (RQ-OPS-007): Supabase公開クライアントキーをpublishable keyへ移行する
  - 受け入れ条件: 公開クライアント向け設定で anon key を使わない
- [ ] BL-015 (RQ-OPS-008): Supabase を含むローカル検証手順を整備する
  - 背景: デザイン確認や機能確認をデプロイ前にローカルで再現できる状態にしたい
  - 受け入れ条件: 必要な環境変数、起動順序、確認ポイント（frontend/backend/api）を docs に明記する
  - 影響範囲: docs/frontend/backend

## In Progress
- [ ] BL-014 (RQ-MEM-006): メモログUIをデザインモック準拠に更新する
  - 背景: メモ機能は実装済みだが、画面体験がデザインモックと乖離している
  - 受け入れ条件: 作成フォーム、タグ入力、時系列一覧、編集/削除操作をモック同等の画面機能で提供する
  - 追加観点: 余白・配色・タイポグラフィ・アイコン操作をモックスクリーンショットと同等に調整する
  - 影響範囲: frontend/docs

## Done
- [x] BL-016 (RQ-OPS-009): Frontend の API ベースURL未設定時にフェイルファストする
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`, `docs/deploy-minimal.md`
- [x] BL-013 (RQ-DOC-001): Docstring とコードコメントの記述ルール整備と既存実装の準拠対応
  - 証跡: `AGENTS.md`, `apps/backend/app/main.py`, `apps/backend/app/memo_logs.py`, `apps/backend/app/supabase_health.py`, `apps/backend/tests/test_memo_logs_api.py`, `apps/backend/tests/test_supabase_connection_api.py`, `apps/frontend/src/App.tsx`
- [x] BL-012 (RQ-MEM-005): メモ保存遅延の改善を行う
  - 証跡: `apps/backend/app/memo_logs.py`, `apps/backend/tests/test_memo_logs_api.py`, `apps/backend/tests/test_supabase_connection_api.py`
- [x] BL-006 (RQ-MEM-001, RQ-MEM-002): メモAPI/UIのCRUDを実装する
  - 証跡: `apps/backend/app/main.py`, `apps/backend/app/memo_logs.py`, `apps/backend/tests/test_memo_logs_api.py`, `apps/backend/tests/test_supabase_connection_api.py`, `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`
- [x] BL-001 (RQ-OPS-002): Supabase接続確認APIを追加し、DB疎通を実証する
  - 証跡: `apps/backend/app/main.py`, `apps/backend/app/supabase_health.py`, `apps/backend/tests/test_supabase_connection_api.py`, `curl /api/v1/ops/supabase-db-health = 200`
- [x] BL-D001 (RQ-OPS-001): Frontend/Backend モノレポ初期化
  - 証跡: `README.md`, `apps/frontend/*`, `apps/backend/app/main.py`
- [x] BL-D002 (RQ-OPS-003): 初期DBスキーマ migration 作成
  - 証跡: `supabase/migrations/0001_init.sql`
- [x] BL-D003 (RQ-OPS-005): Free Tier 構成を仕様に固定
  - 証跡: `docs/spec.md`, `docs/deploy-minimal.md`, `render.yaml`
- [x] BL-D004 (RQ-OPS-006): 環境変数テンプレート整備
  - 証跡: `apps/backend/.env.example`, `apps/frontend/.env.example`
- [x] BL-D005 (RQ-GRD-001): 添付ファイル機能をMVP外で固定
  - 証跡: `docs/spec.md`
- [x] BL-D006 (RQ-GRD-002): 集計オンデマンド方針を固定
  - 証跡: `docs/spec.md`, `docs/free-tier-checklist.md`
- [x] BL-D007 (RQ-GRD-003): 無料枠チェックリスト整備
  - 証跡: `docs/free-tier-checklist.md`

## 新規タスク追加テンプレート
- [ ] BL-XXX (RQ-...): <タスク名>
  - 背景: <なぜ必要か>
  - 受け入れ条件: <完了の定義>
  - 影響範囲: <backend/frontend/db/docs>
