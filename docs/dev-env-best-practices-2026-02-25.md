# 開発環境ベストプラクティス調査（2026-02-25）

## 結論
- Frontend は `pnpm workspace + Vite + React + TypeScript` を採用
- Backend は `uv + FastAPI` を採用
- 理由: 公式ドキュメント上の推奨フローに沿い、依存解決と開発体験が軽量で再現性が高い

## 採用方針
1. Frontend
- Vite公式の React + TS テンプレート系を前提
- Node.js は Vite要件に合わせて 20.19+ を最低ライン
- パッケージ管理は pnpm（Corepack管理）

2. Backend
- Python依存管理は uv (`uv sync`) を利用
- FastAPI開発サーバーは `fastapi dev` を利用
- 依存は `pyproject.toml` に集約

## 参照（一次情報）
- Vite Getting Started
  - https://vite.dev/guide/
- React (Vite利用の案内)
  - https://react.dev/learn/creating-a-react-app
- pnpm Workspaces
  - https://pnpm.io/workspaces
- uv Concepts / Projects
  - https://docs.astral.sh/uv/concepts/projects/layout/
- uv Getting Started
  - https://docs.astral.sh/uv/getting-started/
- FastAPI (first steps, fastapi dev)
  - https://fastapi.tiangolo.com/tutorial/first-steps/
