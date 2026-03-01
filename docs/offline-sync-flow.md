# Offline Sync Flow (Memo)

Last updated: 2026-03-01

## Purpose
- Keep memo UX responsive by showing local data first.
- Persist unsent memo creates in localStorage and retry sync later.
- Reuse the same queue pattern for future features (e.g. pomodoro).

## Source of truth (implementation)
- `apps/frontend/src/offlineSync/createQueue.ts`
- `apps/frontend/src/memoOfflineSync.ts`
- `apps/frontend/src/App.tsx`

## End-to-end sequence
1. App boot:
- Load `memoCache` and `pendingQueue` from localStorage.
- Render cached memos immediately.

2. Background refresh:
- Fetch latest memos from `/api/v1/memo-logs`.
- Merge server memos with pending previews.
- Save synced memos back to `memoCache`.

3. On Save click:
- Build memo create payload.
- Enqueue to `pendingQueue` with minimal metadata (`meta.queued_at`) and create local preview (`local:<client_id>`).
- Render preview immediately.

4. Background sync:
- Consume `pendingQueue` in order, POST each payload.
- On success, replace preview with synced server memo.
- On failure, keep remaining queue for retry.

## Data stores
- `mylife.memo-cache.v1`: synced memo cache for fast initial render.
- `mylife.memo-pending-create.v1`: unsent create queue for retry.
  - Current shape: `{ client_id, payload, meta: { queued_at } }`
  - Legacy shape with `preview` is still accepted and normalized on load.

## Maintenance rule
- If offline-sync logic changes in the source files above, update this document in the same commit.
