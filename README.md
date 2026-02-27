# mylife

Single-user full-stack app for Pomodoro, memo logs, and diary.

## Monorepo layout
- `apps/frontend`: React + Vite + TypeScript (pnpm workspace)
- `apps/backend`: FastAPI (uv managed)
- `docs`: specs and planning docs

## Tooling policy (modern baseline)
- Frontend package manager: pnpm (via Corepack)
- Backend Python workflow: uv (`uv sync`, `uv run`)
- Lint/Format: Backend=`ruff`, Frontend=`eslint + prettier`
- Commit hooks: `pre-commit` (run from backend uv environment)

## Quick start

### 0. Prerequisites
- Node.js 20.19+ (Vite requirement)
- Corepack enabled (`corepack enable`)
- uv installed (Astral uv)
- Python 3.11+

### 1. Backend (FastAPI)
```bash
cd apps/backend
cp .env.example .env
uv sync
uv run fastapi dev app/main.py --port 8000
```

Health check:
```bash
curl http://localhost:8000/api/v1/health
```

### 2. Frontend (React)
```bash
cp apps/frontend/.env.example apps/frontend/.env
pnpm install
pnpm --filter mylife-frontend dev
```

Open [http://localhost:5173](http://localhost:5173)

## Lint / Format / Pre-commit

Install frontend and backend dev dependencies:
```bash
pnpm install
cd apps/backend && uv sync
```

Run checks manually:
```bash
pnpm lint
pnpm format
```

Install git pre-commit hook:
```bash
pnpm precommit:install
```

Run hooks for all files:
```bash
pnpm precommit:run
```

## Environment variables
- Backend env template: `apps/backend/.env.example`
- Frontend env template: `apps/frontend/.env.example`
- Setup guide (consolidated): `docs/environment-setup.md`
- Minimal deploy guide: `docs/deploy-minimal.md`
- Deployment runbook: `docs/deployment-runbook.md`
- Supabase setup: `docs/supabase-setup.md`

## Deploy targets (free-tier plan)
- Frontend: Cloudflare Pages Free (or Vercel Hobby)
- Backend: Render Free Web Service
- Database/Auth: Supabase Free
