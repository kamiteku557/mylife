# mylife 実行バックログ

最終更新: 2026-03-01

このファイルは「次に実装するタスク」の管理用。  
要件の正本は `docs/requirements.md`。

## 運用ルール
1. 新機能/修正は、先に `docs/requirements.md` とこの `docs/backlog.md` を更新する。
2. 実装着手時にタスクを `Ready` から `In Progress` に移動する。
3. 完了時は受け入れ条件を確認し、`Done` に移動する。
4. `Done` へ移す際は、`In Progress` に書いた受け入れ条件を `Done` 側にも残す（証跡だけにしない）。
5. `Done` に移したら、対応する要件IDを `docs/requirements.md` で `[x]` にする。
6. 最後に `main` へマージし、残タスクと新タスクをこのファイルへ反映する。

## Ready
- [ ] BL-002 (RQ-OPS-004): Supabase Auth によるAPI保護を実装する
  - 受け入れ条件: 未認証で主要APIにアクセスできない
- [ ] BL-020 (RQ-POM-003): セッションUIの応答性改善（楽観更新 + refresh最小化）を実装する
  - 背景: API往復待ちで操作体感が鈍るケースがあり、連続操作時の安定性も高めたい
  - 受け入れ条件: 主要操作でUI先行反映しつつ、refresh API呼び出し回数を最小化して整合性を維持できる
- [ ] BL-022 (RQ-POM-003): タイマー終了後の超過計測と開始前時間調整を実装する
  - 背景: 終了後も同一セッションで継続作業したいケースと、開始前の時間微調整ニーズがある
  - 受け入れ条件: 00:00 到達後は超過時間を計測し、自動で次セッションへ遷移しない
  - 受け入れ条件: セッション開始前に表示時間をクリックしてそのセッション時間を変更できる
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
- [ ] BL-027 (RQ-OPS-011): worktree 利用時の開発環境セットアップ手順を標準化する
  - 背景: worktree を継続利用する方針のため、依存未初期化（`eslint: command not found`）やポート競合を再発させない運用ルールを残したい
  - 詳細方針:
  - 新規 worktree 作成直後の初期化手順を定義する（`pnpm install` と `cd apps/backend && uv sync` を各 worktree で実行）
  - pre-commit hook 有効化手順（`pnpm precommit:install`）を明文化する
  - ポート割り当てルールを定義する（例: default 5173/8000 と別に検証用 5184/8100 を使い、`lsof` で競合確認する）
  - 作業開始時チェックリストを定義する（`pnpm --filter mylife-frontend exec eslint -v`、`lsof -iTCP:<port>`、env確認）
  - README か `docs/development-workflow.md` に「worktree利用時」節を追加し、コマンド例を記載する
  - 受け入れ条件: 新しい worktree で、手順どおりに実行すると frontend lint とローカル起動確認を再現できる
  - 受け入れ条件: 既存 worktree との同時起動でポート衝突を回避できる
  - 受け入れ条件: 各 worktree の初期化（依存 + hook）を第三者が再現できる記述になっている
  - 影響範囲: docs/frontend/backend

## In Progress
- [ ] BL-039 (RQ-POM-008): iOS PWA 復帰時のタイマー再同期をサーバー基準で強化する
  - 背景: 復帰時のローカル補正のみでは、iOS PWA のライフサイクル差異で表示時刻が追従しないケースが残る
  - 受け入れ条件: `visibilitychange` / `focus` / `pageshow` 復帰時に `/api/v1/pomodoro/current` を再取得して表示時刻を補正できる
  - 受け入れ条件: 復帰イベント連打で API を過剰に叩かないように同期呼び出しを間引ける
  - 受け入れ条件: 復帰時同期を追加しても既存の開始/停止/再開フローとテストが壊れない
  - 影響範囲: frontend/docs
- [ ] BL-040 (RQ-OPS-015): 背景Push dispatch の無料枠運用を安定化する
  - 背景: GitHub Actions から Render Free を叩く際、コールドスタートでタイムアウトして dispatch 失敗が発生する
  - 受け入れ条件: dispatch workflow に retry と十分な timeout を設定し、単発失敗で通知配信が停止しない
  - 受け入れ条件: schedule 実行の偏りを抑えるため cron 分散を行う
  - 受け入れ条件: 単一 subscription の送信失敗で dispatch 全体が 502 にならない
  - 受け入れ条件: workflow ログで dispatch 応答本文を確認できる
  - 影響範囲: ci/docs
- [ ] BL-037 (RQ-POM-006): iOS PWA 復帰時のタイマー追従を実装する
  - 背景: iOS の PWA で別アプリを開くと JS タイマーが停止し、復帰直後の表示時刻が実時間より遅れる
  - 受け入れ条件: 実行中セッションで、復帰直後に経過秒数を反映した時刻へ補正される
  - 受け入れ条件: 00:00 到達後の超過表示も復帰時に連続性を維持して表示できる
  - 受け入れ条件: `visibilitychange` / `pageshow` / `focus` での補正処理を追加し、iOS PWA 復帰で追従できる
  - 影響範囲: frontend/docs
- [ ] BL-038 (RQ-POM-007, RQ-OPS-014): iOS PWA 背景Push通知と無料運用スケジューラを実装する
  - 背景: 復帰時補正だけでは背景中に通知できないため、iOS 16.4+ の Web Push と定期 dispatch が必要
  - 受け入れ条件: Push subscription の登録/解除 API と service worker 受信処理が実装される
  - 受け入れ条件: 00:00 到達通知と 15分超過通知の送信判定をサーバー側で実装できる
  - 受け入れ条件: 取りこぼし復帰時は未送信分を連投せず、最新到達分のみ送信する
  - 受け入れ条件: GitHub Actions の 5分 schedule で dispatch を実行し、無料運用の制約を docs に明記する
  - 影響範囲: frontend/backend/db/docs/ci
- [ ] BL-014 (RQ-MEM-006): メモログUIをデザインモック準拠に更新する
  - 背景: メモ機能は実装済みだが、画面体験がデザインモックと乖離している
  - 受け入れ条件: 作成フォーム、タグ入力、時系列一覧、編集/削除操作をモック同等の画面機能で提供する
  - 受け入れ条件: 一覧カードでは編集/削除アイコンを日付の右隣に横並び配置し、縦方向の占有を削減する
  - 追加観点: 余白・配色・タイポグラフィ・アイコン操作をモックスクリーンショットと同等に調整する
  - 影響範囲: frontend/docs
- [ ] BL-024 (RQ-MEM-008, RQ-QLT-004): モバイルでメモ保存ボタンを横長化し保存補助文言を削除する
  - 背景: スマホ利用時に Save ボタンを押しやすくし、不要なキーボードショートカット案内を取り除いて入力体験を簡潔にしたい
  - 受け入れ条件: iPhone幅でメモ作成フォームの Save ボタンが横長（フォーム幅に追従）で表示される
  - 受け入れ条件: メモ作成フォームから `Ctrl + Enter to save` の文言が表示されない
  - 影響範囲: frontend/docs

## Done
- [x] BL-038 (RQ-QLT-007): pre-commit に frontend typecheck を追加する
  - 受け入れ条件: `.pre-commit-config.yaml` に `pnpm --filter mylife-frontend typecheck` を実行する hook が追加されている
  - 受け入れ条件: 追加した hook を `pre-commit run` で実行すると成功する
  - 受け入れ条件: 既存の frontend/backend テスト hook の挙動を壊さない
  - 証跡: `.pre-commit-config.yaml`, `docs/development-workflow.md`, `docs/requirements.md`, `cd apps/backend && uv run pre-commit run frontend-typecheck --all-files`, `cd apps/backend && uv run pre-commit run frontend-vitest --all-files`, `cd apps/backend && uv run pre-commit run backend-pytest --all-files`
- [x] BL-037 (RQ-QLT-002): Frontend build の TypeScript 互換性エラーを修正する
  - 受け入れ条件: `pnpm --filter mylife-frontend build` が成功する
  - 受け入れ条件: `apps/frontend/src/App.integration.test.tsx` の末尾要素参照が `lib` 設定に依存しない実装である
  - 受け入れ条件: 末尾要素を参照する意図を自動テストで維持できる
  - 証跡: `apps/frontend/src/App.integration.test.tsx`, `docs/backlog.md`, `docs/requirements.md`, `pnpm --filter mylife-frontend test -- src/App.integration.test.tsx`, `pnpm --filter mylife-frontend build`, `pnpm install --frozen-lockfile && pnpm --filter mylife-frontend build`
- [x] BL-036 (RQ-OPS-011, RQ-QLT-007): worktree前提運用とマージ前E2E必須ルールを明文化する
  - 受け入れ条件: 開発フローに worktree を基本運用として明記されている
  - 受け入れ条件: 各 worktree で `pnpm install` と `cd apps/backend && uv sync` を実行する手順が明記されている
  - 受け入れ条件: 各 worktree で hook 有効化（`pnpm precommit:install`）を行う手順が明記されている
  - 受け入れ条件: `main` マージ直前に `pnpm test:e2e` を実行するルールが明記されている
  - 証跡: `docs/requirements.md`, `docs/development-workflow.md`, `docs/backlog.md`
- [x] BL-034 (RQ-OPS-013): pending キュー保存構造の正規化と互換維持リファクタを実装する
  - 証跡: `apps/frontend/src/memoOfflineSync.ts`, `apps/frontend/src/offlineSync/createQueue.ts`, `apps/frontend/src/App.tsx`, `apps/frontend/src/memoOfflineSync.test.ts`, `docs/offline-sync-flow.md`
- [x] BL-033 (RQ-OPS-012, RQ-QLT-006): オフライン同期キューの共通化と網羅テストを実装する
  - 証跡: `apps/frontend/src/offlineSync/createQueue.ts`, `apps/frontend/src/memoOfflineSync.ts`, `apps/frontend/src/App.tsx`, `apps/frontend/src/offlineSync/createQueue.test.ts`, `apps/frontend/src/memoOfflineSync.test.ts`, `apps/frontend/package.json`
- [x] BL-032 (RQ-MEM-010): メモログのローカルキャッシュ + 同期待ちキューを実装する
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`, `docs/requirements.md`
- [x] BL-035 (RQ-QLT-001, RQ-QLT-002, RQ-QLT-003, RQ-QLT-007): 網羅的テストの追加と継続追加ルールを整備する
  - 受け入れ条件: Backend の主要ロジックを対象に単体テスト（境界値・例外・状態遷移）を追加する
  - 受け入れ条件: Frontend の主要導線を対象に結合テスト（メモ作成/編集/削除、設定変更）を追加する
  - 受け入れ条件: 主要導線をユーザー操作で検証するE2Eテスト（Memo と Session を含む）を追加する
  - 受け入れ条件: 開発フローに、各BLで単体/結合/E2Eの追加・更新要否を判定し随時追加するルールを明記する
  - 受け入れ条件: pre-commit 実行時に Backend/Frontend の全テストが自動実行される
  - 証跡: `apps/backend/tests/test_memo_logs_unit.py`, `apps/backend/tests/test_pomodoro_unit.py`, `apps/backend/tests/test_memo_logs_integration_api.py`, `apps/backend/tests/test_pomodoro_integration_api.py`, `apps/frontend/src/App.utils.test.ts`, `apps/frontend/src/useTheme.test.tsx`, `apps/frontend/src/App.integration.test.tsx`, `apps/frontend/e2e/memo-flow.spec.ts`, `apps/frontend/e2e/session-flow.spec.ts`, `playwright.config.ts`, `.pre-commit-config.yaml`, `docs/development-workflow.md`, `pnpm test`, `pnpm precommit:run`
- [x] BL-030 (RQ-MEM-009): メモ一覧の件数表示文言を簡潔化する
  - 受け入れ条件: メモ一覧のステータス文言が「x件を表示」に変更される
  - 受け入れ条件: メモ一覧 API が `limit` 指定で必要件数のみ取得する
  - 受け入れ条件: 既存の表示件数制御（設定画面の表示数）と連動して取得件数が変わる
  - 受け入れ条件: `limit` の境界値（最小値/最大値/範囲外）を API テストで検証する
  - 証跡: `apps/frontend/src/App.tsx`, `apps/backend/app/main.py`, `apps/backend/app/memo_logs.py`, `apps/backend/tests/test_memo_logs_api.py`, `docs/requirements.md`
- [x] BL-031 (RQ-POM-005): ポモドーロのブラウザ通知（00:00到達 + 超過15分ごと）を実装する
  - 受け入れ条件: セッションが `00:00` に到達したタイミングでブラウザ通知が表示される
  - 受け入れ条件: 超過時間中は15分ごとにブラウザ通知が表示される
  - 受け入れ条件: 超過時間中は時計表示が超過経過時間（`00:01`, `10:00`, `15:00` ...）として進む
  - 受け入れ条件: 各通知タイミングで通知音が再生される
  - 受け入れ条件: 通知音ロジックが疎結合で、音声ファイル再生実装へ差し替えやすい
  - 証跡: `apps/frontend/src/SessionView.tsx`, `docs/requirements.md`, `pnpm --filter mylife-frontend build`, `Playwright manual check (timer overrun display)`
- [x] BL-029 (RQ-QLT-005): ダークモード実装のトークン整理とテーマロジック分離を行う
  - 受け入れ条件: CSSの直値色指定をテーマトークンへ統一し、重複トークンを削減できる
  - 受け入れ条件: テーマ状態管理を `App.tsx` から `useTheme` へ切り出し、UIロジックとの責務分離ができる
  - 受け入れ条件: 既存のテーマ切替挙動（OS連動 + 手動上書き + 永続化）を維持できる
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`, `apps/frontend/src/useTheme.ts`, `docs/backlog.md`, `docs/requirements.md`
- [x] BL-028 (RQ-QLT-005): ダークモード切替（OS連動 + 手動上書き）を実装する
  - 受け入れ条件: 初期テーマは `prefers-color-scheme` に従い、ヘッダー操作で Light/Dark を即時切替できる
  - 受け入れ条件: 手動選択テーマはローカル保存され、再訪時に復元される
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`, `docs/backlog.md`, `docs/requirements.md`
- [x] BL-023 (RQ-QLT-004): スマホ表示でヘッダーが見えない不具合を修正する
  - 証跡: `apps/frontend/src/styles.css`, `docs/backlog.md`, `docs/requirements.md`
- [x] BL-019 (RQ-POM-003): セッション遷移と編集中UXの不具合を修正する
  - 証跡: `apps/frontend/src/SessionView.tsx`, `apps/frontend/src/styles.css`, `apps/backend/app/pomodoro.py`, `apps/backend/app/main.py`, `apps/backend/tests/test_pomodoro_api.py`
- [x] BL-004 (RQ-POM-002): ポモドーロセッション制御APIを実装する
  - 証跡: `apps/backend/app/pomodoro.py`, `apps/backend/app/main.py`, `apps/backend/tests/test_pomodoro_api.py`, `apps/frontend/src/SessionView.tsx`, `docs/requirements.md`
- [x] BL-003 (RQ-POM-001): ポモドーロ設定API（GET/PUT）を実装する
  - 証跡: `apps/backend/app/pomodoro.py`, `apps/backend/app/main.py`, `apps/backend/tests/test_pomodoro_api.py`, `apps/frontend/src/App.tsx`, `docs/requirements.md`
- [x] BL-005 (RQ-POM-003): タイマーUIを実装する
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/SessionView.tsx`, `apps/frontend/src/styles.css`, `docs/requirements.md`
- [x] BL-018 (RQ-OPS-010): Frontend/Backend の同時起動コマンドを追加する
  - 証跡: `Makefile`, `package.json`, `README.md`, `docs/requirements.md`
- [x] BL-017 (RQ-MEM-007, RQ-SET-001): 設定画面を追加しメモログ表示設定を実装する
  - 証跡: `apps/frontend/src/App.tsx`, `apps/frontend/src/styles.css`, `docs/requirements.md`
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

## Done記録テンプレート
- [x] BL-XXX (RQ-...): <タスク名>
  - 受け入れ条件: <In Progressで定義した条件を転記>
  - 証跡: <ファイル/URL/ログ>
