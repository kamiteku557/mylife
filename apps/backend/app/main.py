from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.supabase_health import check_supabase_db_connection

settings = get_settings()
app = FastAPI(title=settings.app_name)

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
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


@app.get("/api/v1/ping")
def ping() -> dict[str, str]:
    return {"message": "pong"}


@app.get("/api/v1/ops/supabase-db-health")
def supabase_db_health() -> dict[str, str | int | None]:
    try:
        result = check_supabase_db_connection()
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
