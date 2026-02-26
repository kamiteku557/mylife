.PHONY: backend-sync backend-dev frontend-sync frontend-dev

backend-sync:
	cd apps/backend && uv sync

backend-dev:
	cd apps/backend && uv run fastapi dev app/main.py --port 8000

frontend-sync:
	pnpm install

frontend-dev:
	pnpm --filter mylife-frontend dev
