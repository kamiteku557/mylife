"""FastAPI entrypoint and HTTP handlers for mylife backend."""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.memo_logs import (
    MemoLogCreate,
    MemoLogNotFoundError,
    MemoLogOut,
    MemoLogService,
    MemoLogUpdate,
    get_memo_log_service,
)
from app.supabase_health import SupabaseHealthService, get_supabase_health_service

settings = get_settings()
app = FastAPI(title=settings.app_name)
memo_log_service_dep = Depends(get_memo_log_service)
supabase_health_service_dep = Depends(get_supabase_health_service)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Return application health metadata for simple uptime checks."""

    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


@app.get("/api/v1/ping")
def ping() -> dict[str, str]:
    """Return lightweight ping response used in local connectivity checks."""

    return {"message": "pong"}


@app.get("/api/v1/ops/supabase-db-health")
def supabase_db_health(
    service: SupabaseHealthService = supabase_health_service_dep,
) -> dict[str, str | int | None]:
    """Check Supabase table connectivity and expose a minimal diagnostic payload."""

    try:
        result = service.check()
        return {
            "status": "ok",
            "database": "supabase",
            "checked_table": str(result["checked_table"]),
            "row_count": int(result["row_count"]),
            "total_count": (
                int(result["total_count"]) if result["total_count"] is not None else None
            ),
        }
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        error_detail = f"Supabase connection check failed: {exc}"
        raise HTTPException(status_code=502, detail=error_detail) from exc


@app.get("/api/v1/memo-logs", response_model=list[MemoLogOut])
def memo_logs_list(service: MemoLogService = memo_log_service_dep) -> list[MemoLogOut]:
    """List memo logs for the current user scope."""

    try:
        return service.list()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to list memo logs: {exc}") from exc


@app.get("/api/v1/memo-logs/{memo_id}", response_model=MemoLogOut)
def memo_logs_get(memo_id: str, service: MemoLogService = memo_log_service_dep) -> MemoLogOut:
    """Fetch one memo log by ID."""

    try:
        return service.get(memo_id)
    except MemoLogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to get memo log: {exc}") from exc


@app.post("/api/v1/memo-logs", response_model=MemoLogOut, status_code=201)
def memo_logs_create(
    payload: MemoLogCreate, service: MemoLogService = memo_log_service_dep
) -> MemoLogOut:
    """Create one memo log row from request payload."""

    try:
        return service.create(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create memo log: {exc}") from exc


@app.put("/api/v1/memo-logs/{memo_id}", response_model=MemoLogOut)
def memo_logs_update(
    memo_id: str,
    payload: MemoLogUpdate,
    service: MemoLogService = memo_log_service_dep,
) -> MemoLogOut:
    """Update one memo log row and replace tag assignments."""

    try:
        return service.update(memo_id, payload)
    except MemoLogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update memo log: {exc}") from exc


@app.delete("/api/v1/memo-logs/{memo_id}", status_code=204)
def memo_logs_delete(memo_id: str, service: MemoLogService = memo_log_service_dep) -> None:
    """Delete one memo log row by ID."""

    try:
        service.delete(memo_id)
    except MemoLogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete memo log: {exc}") from exc
