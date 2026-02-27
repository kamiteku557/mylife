from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()],
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
