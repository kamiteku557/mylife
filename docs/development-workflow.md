# 仕様駆動開発ワークフロー

最終更新: 2026-03-01

## 目的
- ドキュメントを常に最新に保つ
- 要件一覧と実装状況を常に一致させる
- タスク単位で安全に実装し、完了条件を明確化する

## 基本原則
1. 実装より先に仕様を更新する。
2. すべての実装タスクは要件ID（`RQ-*`）に紐づける。
3. 完了判定はコードではなく「受け入れ条件」で行う。
4. `Done` の更新は、マージ後に必ず行う。
5. 各BLで単体/結合/E2Eの追加・更新要否を判定し、必要なテストは同一タスク内で随時追加する。
6. 開発ブランチは `git worktree` を使った作業を基本とし、worktree ごとに依存と hook を初期化する。

## 1サイクルの流れ
1. 要件更新
- 変更要求を `docs/requirements.md` に追記/更新する。
- 新規要件には `RQ-*` ID を付与する。

2. タスク化
- `docs/backlog.md` の `Ready` に `BL-*` を追加する。
- 受け入れ条件を1行で明確にする。

3. ブランチ作成（worktree を基本）
- ブランチ名: `codex/<BL-ID>-<short-name>`
- 例: `codex/BL-003-pomodoro-settings-api`
- worktree 作成例:
```bash
git worktree add ../mylife-BL-003 -b codex/BL-003-pomodoro-settings-api
```
- worktree 作成後は、その worktree で次を実行する:
```bash
pnpm install
cd apps/backend && uv sync
pnpm precommit:install
```
- `pnpm precommit:install` は hook が未導入の worktree で最低1回実行する。
- 既存 worktree と同時起動する場合は frontend/backend の利用ポートを固定し、`lsof -iTCP:<port>` で競合を確認する。

4. 実装
- `In Progress` へ移動して実装する。
- 仕様変更が出たら先にドキュメントを更新してからコードを直す。
- TDD（Red -> Green -> Refactor）で進める。
- 変更差分に対して単体/結合/E2Eのどこで担保するかを明記し、未追加のまま完了扱いにしない。

5. 受け入れ確認
- `lint/test/manual` で受け入れ条件を満たすことを確認する。
- テストは `unit/integration/e2e` の実行結果を確認し、失敗時は原因を解消してから完了判定する。
- `main` へマージする直前に `pnpm test:e2e` を実行し、成功した状態でマージする。
- 満たさない場合は `Done` にしない。

6. 仕上げ
- 変更内容をコミットする（要件ID/タスクIDを含める）。
- `main` にマージする。
- `docs/backlog.md` を更新（`In Progress` -> `Done`）。
- `Done` へ移す際は、`In Progress` に記載した受け入れ条件を `Done` 側にも転記する。
- `docs/requirements.md` の該当要件を `[x]` にする。
- 残タスクと新タスクを `Ready` に追加する。

## 完了時チェックリスト（PR/マージ前）
- [ ] 要件IDとタスクIDが明記されている
- [ ] 受け入れ条件を満たす証跡がある
- [ ] `Done` 側に受け入れ条件が転記されている
- [ ] `docs/requirements.md` の状態が更新済み
- [ ] `docs/backlog.md` の状態が更新済み
- [ ] 追加で発生した新タスクが `Ready` に登録済み
- [ ] 変更した仕様に対応する単体/結合/E2Eテストが追加・更新されている（不要な場合は理由が記録されている）
- [ ] 追加・更新したテスト実行コマンドと結果を確認している
- [ ] worktree で `pnpm install` / `cd apps/backend && uv sync` / `pnpm precommit:install` を実施済み
- [ ] pre-commit 実行で Backend/Frontend テストと Frontend typecheck が通過している
- [ ] `main` マージ直前に `pnpm test:e2e` が成功している

## コミットメッセージ例
- `feat(pomodoro): implement settings API (BL-003, RQ-POM-001)`
- `fix(auth): protect pomodoro endpoints (BL-002, RQ-OPS-004)`
- `docs(backlog): mark BL-003 done and update next tasks`
