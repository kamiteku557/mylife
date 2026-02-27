"""mylife バックエンドの FastAPI エントリポイントと HTTP ハンドラー。"""

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
from app.pomodoro import (
    PomodoroService,
    PomodoroSessionNotFoundError,
    PomodoroSessionOut,
    PomodoroSessionStart,
    PomodoroSessionStateError,
    PomodoroSessionUpdate,
    PomodoroSettingsOut,
    PomodoroSettingsUpdate,
    PomodoroSummaryOut,
    SummaryGroupBy,
    get_pomodoro_service,
)
from app.supabase_health import SupabaseHealthService, get_supabase_health_service

settings = get_settings()
app = FastAPI(title=settings.app_name)
memo_log_service_dep = Depends(get_memo_log_service)
supabase_health_service_dep = Depends(get_supabase_health_service)
pomodoro_service_dep = Depends(get_pomodoro_service)

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
    """簡易稼働確認向けのアプリケーションヘルス情報を返す。"""

    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


@app.get("/api/v1/ping")
def ping() -> dict[str, str]:
    """ローカル疎通確認で使う軽量な ping 応答を返す。"""

    return {"message": "pong"}


@app.get("/api/v1/ops/supabase-db-health")
def supabase_db_health(
    service: SupabaseHealthService = supabase_health_service_dep,
) -> dict[str, str | int | None]:
    """Supabase テーブル疎通を確認し、最小限の診断情報を返す。"""

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
    """現在のユーザースコープでメモログ一覧を返す。"""

    try:
        return service.list()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to list memo logs: {exc}") from exc


@app.get("/api/v1/memo-logs/{memo_id}", response_model=MemoLogOut)
def memo_logs_get(memo_id: str, service: MemoLogService = memo_log_service_dep) -> MemoLogOut:
    """ID を指定してメモログを 1 件取得する。"""

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
    """リクエスト payload からメモログを 1 件作成する。"""

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
    """メモログを 1 件更新し、タグ紐づけを置き換える。"""

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
    """ID を指定してメモログを 1 件削除する。"""

    try:
        service.delete(memo_id)
    except MemoLogNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete memo log: {exc}") from exc


@app.get("/api/v1/settings/pomodoro", response_model=PomodoroSettingsOut)
def pomodoro_settings_get(
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSettingsOut:
    """現在のユーザースコープでポモドーロ設定を取得する。"""

    try:
        return service.get_settings()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to get pomodoro settings: {exc}",
        ) from exc


@app.put("/api/v1/settings/pomodoro", response_model=PomodoroSettingsOut)
def pomodoro_settings_update(
    payload: PomodoroSettingsUpdate,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSettingsOut:
    """現在のユーザースコープでポモドーロ設定を更新する。"""

    try:
        return service.update_settings(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to update pomodoro settings: {exc}"
        ) from exc


@app.get("/api/v1/pomodoro/current", response_model=PomodoroSessionOut | None)
def pomodoro_current(service: PomodoroService = pomodoro_service_dep) -> PomodoroSessionOut | None:
    """実行中または一時停止中のポモドーロセッションを返す。"""

    try:
        return service.get_current()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to get current pomodoro: {exc}",
        ) from exc


@app.get("/api/v1/pomodoro/sessions", response_model=list[PomodoroSessionOut])
def pomodoro_sessions_list(
    limit: int = 100,
    service: PomodoroService = pomodoro_service_dep,
) -> list[PomodoroSessionOut]:
    """ポモドーロセッション履歴を返す。"""

    try:
        return service.list_sessions(limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to list pomodoro sessions: {exc}",
        ) from exc


@app.get("/api/v1/pomodoro/summary", response_model=list[PomodoroSummaryOut])
def pomodoro_summary(
    group_by: SummaryGroupBy = "day",
    service: PomodoroService = pomodoro_service_dep,
) -> list[PomodoroSummaryOut]:
    """完了済み focus セッション集計を返す。"""

    try:
        return service.summary(group_by=group_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to get pomodoro summary: {exc}",
        ) from exc


@app.post("/api/v1/pomodoro/start", response_model=PomodoroSessionOut, status_code=201)
def pomodoro_start(
    payload: PomodoroSessionStart,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """ポモドーロセッションを開始する。"""

    try:
        return service.start(payload)
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to start pomodoro: {exc}") from exc


@app.post("/api/v1/pomodoro/{session_id}/pause", response_model=PomodoroSessionOut)
def pomodoro_pause(
    session_id: str,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """ポモドーロセッションを一時停止する。"""

    try:
        return service.pause(session_id)
    except PomodoroSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to pause pomodoro: {exc}") from exc


@app.put("/api/v1/pomodoro/{session_id}", response_model=PomodoroSessionOut)
def pomodoro_update(
    session_id: str,
    payload: PomodoroSessionUpdate,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """実行中または一時停止中セッションのタイトル/タグを更新する。"""

    try:
        return service.update_session(session_id, payload)
    except PomodoroSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update pomodoro: {exc}") from exc


@app.post("/api/v1/pomodoro/{session_id}/resume", response_model=PomodoroSessionOut)
def pomodoro_resume(
    session_id: str,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """ポモドーロセッションを再開する。"""

    try:
        return service.resume(session_id)
    except PomodoroSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to resume pomodoro: {exc}") from exc


@app.post("/api/v1/pomodoro/{session_id}/finish", response_model=PomodoroSessionOut)
def pomodoro_finish(
    session_id: str,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """ポモドーロセッションを完了する。"""

    try:
        return service.finish(session_id)
    except PomodoroSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to finish pomodoro: {exc}") from exc


@app.post("/api/v1/pomodoro/{session_id}/cancel", response_model=PomodoroSessionOut)
def pomodoro_cancel(
    session_id: str,
    service: PomodoroService = pomodoro_service_dep,
) -> PomodoroSessionOut:
    """ポモドーロセッションをキャンセルする。"""

    try:
        return service.cancel(session_id)
    except PomodoroSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PomodoroSessionStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to cancel pomodoro: {exc}") from exc
