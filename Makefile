.PHONY: backend-sync backend-dev backend-lint backend-format frontend-sync frontend-dev frontend-lint frontend-format precommit-install precommit-run

backend-sync:
	cd apps/backend && uv sync

backend-dev:
	cd apps/backend && uv run fastapi dev app/main.py --port 8000

backend-lint:
	cd apps/backend && uv run ruff check .

backend-format:
	cd apps/backend && uv run ruff format .

frontend-sync:
	pnpm install

frontend-dev:
	pnpm --filter mylife-frontend dev

frontend-lint:
	pnpm --filter mylife-frontend lint

frontend-format:
	pnpm --filter mylife-frontend format

precommit-install:
	cd apps/backend && uv run pre-commit install

precommit-run:
	cd apps/backend && uv run pre-commit run --all-files
