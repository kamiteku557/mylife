# AGENTS.md

## ドキュメントの正本
- 要件ステータスの正本は `docs/requirements.md` とする。
- 実行バックログ（`Ready` / `In Progress` / `Done`）の正本は `docs/backlog.md` とする。
- 実装ライフサイクルは `docs/development-workflow.md` に従う。

## 必須フロー
1. 実装前に、まずドキュメント（`docs/requirements.md` と `docs/backlog.md`）を更新する。
2. 各タスクは要件ID（`RQ-*`）とバックログID（`BL-*`）に紐づける。
3. タスク用ブランチ（`codex/<BL-ID>-<short-name>`）で実装する（必要に応じて `git worktree` を使う）。
4. ドキュメント化された受け入れ条件を満たした場合のみ完了扱いにする。
5. `main` へマージ後、要件チェックとバックログ状態を更新する。
