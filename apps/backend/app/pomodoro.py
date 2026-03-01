"""Supabase を利用したポモドーロ設定/セッション制御のサービス層。"""

from collections import defaultdict
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import Any, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field
from supabase import Client, create_client

from app.config import get_settings
from app.memo_logs import DEMO_USER_ID

SessionType = Literal["focus", "short_break", "long_break"]
SessionStatus = Literal["running", "paused", "completed", "cancelled"]
SummaryGroupBy = Literal["day", "week", "month"]
T = TypeVar("T")
SESSION_SELECT = (
    "id, user_id, title, session_type, planned_seconds, actual_seconds, "
    "started_at, ended_at, status, cycle_index, created_at, planned_end_at, last_notified_step"
)
SETTINGS_SELECT = (
    "user_id, focus_minutes, short_break_minutes, long_break_minutes, long_break_every, updated_at"
)


class PomodoroSettingsOut(BaseModel):
    """ポモドーロ設定 API 応答。"""

    user_id: UUID
    focus_minutes: int
    short_break_minutes: int
    long_break_minutes: int
    long_break_every: int
    updated_at: datetime


class PomodoroSettingsUpdate(BaseModel):
    """ポモドーロ設定更新 payload。"""

    focus_minutes: int = Field(ge=1, le=180)
    short_break_minutes: int = Field(ge=1, le=60)
    long_break_minutes: int = Field(ge=1, le=120)
    long_break_every: int = Field(ge=2, le=12)


class PomodoroSessionStart(BaseModel):
    """ポモドーロ開始 payload。"""

    title: str = ""
    session_type: SessionType = "focus"
    planned_seconds: int | None = Field(default=None, ge=1, le=24 * 60 * 60)
    cycle_index: int = Field(default=1, ge=1, le=999)
    tags: list[str] = Field(default_factory=list)


class PomodoroSessionUpdate(BaseModel):
    """ポモドーロセッション編集中 payload。"""

    title: str | None = None
    tags: list[str] | None = None


class PomodoroSessionOut(BaseModel):
    """ポモドーロセッション API 応答。"""

    id: UUID
    user_id: UUID
    title: str
    session_type: SessionType
    planned_seconds: int
    actual_seconds: int
    started_at: datetime
    ended_at: datetime | None
    status: SessionStatus
    cycle_index: int
    created_at: datetime
    tags: list[str] = Field(default_factory=list)
    remaining_seconds: int


class PomodoroSummaryOut(BaseModel):
    """ポモドーロ集計 API 応答。"""

    period_start: date
    focus_sessions: int
    focus_seconds: int


class PomodoroSessionNotFoundError(ValueError):
    """現在のユーザースコープでセッションが見つからない場合に送出する。"""

    pass


class PomodoroSessionStateError(ValueError):
    """状態遷移の前提が満たされない場合に送出する。"""

    pass


class PomodoroService:
    """ポモドーロ関連ユースケース向けのサービスオブジェクト。"""

    def get_settings(self) -> PomodoroSettingsOut:
        """現在ユーザーのポモドーロ設定を返す。"""

        return get_pomodoro_settings()

    def update_settings(self, payload: PomodoroSettingsUpdate) -> PomodoroSettingsOut:
        """現在ユーザーのポモドーロ設定を更新する。"""

        return update_pomodoro_settings(payload)

    def get_current(self) -> PomodoroSessionOut | None:
        """実行中または一時停止中のセッションを返す。"""

        return get_current_pomodoro_session()

    def start(self, payload: PomodoroSessionStart) -> PomodoroSessionOut:
        """新しいセッションを開始する。"""

        return start_pomodoro_session(payload)

    def update_session(self, session_id: str, payload: PomodoroSessionUpdate) -> PomodoroSessionOut:
        """実行中または一時停止中セッションのタイトル/タグを更新する。"""

        return update_pomodoro_session(session_id, payload)

    def pause(self, session_id: str) -> PomodoroSessionOut:
        """実行中セッションを一時停止する。"""

        return pause_pomodoro_session(session_id)

    def resume(self, session_id: str) -> PomodoroSessionOut:
        """一時停止中セッションを再開する。"""

        return resume_pomodoro_session(session_id)

    def finish(self, session_id: str) -> PomodoroSessionOut:
        """セッションを完了状態にする。"""

        return finish_pomodoro_session(session_id)

    def cancel(self, session_id: str) -> PomodoroSessionOut:
        """セッションをキャンセル状態にする。"""

        return cancel_pomodoro_session(session_id)

    def list_sessions(self, limit: int = 100) -> list[PomodoroSessionOut]:
        """セッション履歴を返す。"""

        return list_pomodoro_sessions(limit)

    def summary(self, group_by: SummaryGroupBy) -> list[PomodoroSummaryOut]:
        """完了済みセッションの集計を返す。"""

        return get_pomodoro_summary(group_by)


def get_pomodoro_service() -> PomodoroService:
    """依存性注入用のポモドーロサービスを返す。"""

    return PomodoroService()


@lru_cache(maxsize=1)
def _get_client_cached() -> Client:
    """Supabase クライアントを 1 件キャッシュして再利用する。"""

    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not api_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required"
        )
    return create_client(settings.supabase_url, api_key)


def _get_client() -> Client:
    """Supabase クライアントを返す。"""

    return _get_client_cached()


def _reset_client_cache() -> None:
    """切断エラー時の再接続に備えてクライアントキャッシュを破棄する。"""

    _get_client_cached.cache_clear()


def _run_with_disconnect_retry(operation: Callable[[], T]) -> T:
    """接続切断時のみ 1 回だけリトライして結果を返す。"""

    try:
        return operation()
    except Exception as exc:
        if "Server disconnected" not in str(exc):
            raise
        # 一時切断時はクライアントを作り直して再試行する。
        _reset_client_cache()
        return operation()


def _parse_datetime(value: str | None) -> datetime:
    """Supabase のタイムスタンプ文字列を UTC datetime へ変換する。"""

    if not value:
        return datetime.now(tz=UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _normalize_tags(tags: list[str]) -> list[str]:
    """タグを空白除去・重複除去して返す。"""

    unique: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = raw.strip()
        if not tag or tag in seen:
            continue
        unique.append(tag)
        seen.add(tag)
    return unique


def _ensure_demo_user(client: Client) -> None:
    """固定デモユーザーを事前に作成する。"""

    client.table("users").upsert(
        {"id": DEMO_USER_ID, "display_name": "Demo User"},
        on_conflict="id",
    ).execute()


@lru_cache(maxsize=1)
def _ensure_demo_user_once() -> None:
    """固定デモユーザー作成を 1 回に抑える。"""

    _ensure_demo_user(_get_client())


def _get_default_planned_seconds(session_type: SessionType) -> int:
    """設定テーブルに基づいてセッション種別ごとの規定秒数を返す。"""

    settings = get_pomodoro_settings()
    if session_type == "focus":
        return settings.focus_minutes * 60
    if session_type == "short_break":
        return settings.short_break_minutes * 60
    return settings.long_break_minutes * 60


def _compute_planned_end_at(started_at: datetime, remaining_seconds: int) -> datetime:
    """通知判定に使う予定終了時刻を返す。"""

    safe_remaining = max(0, int(remaining_seconds))
    return started_at + timedelta(seconds=safe_remaining)


def _compute_elapsed_seconds(row: Mapping[str, Any], now: datetime) -> int:
    """累積実績秒と現在実行区間を合算した実績秒を返す。"""

    base_actual = int(row.get("actual_seconds") or 0)
    if row.get("status") != "running":
        return max(0, base_actual)

    started_at = _parse_datetime(row.get("started_at"))
    running_elapsed = int(max(0.0, (now - started_at).total_seconds()))
    return max(0, base_actual + running_elapsed)


def _remaining_seconds(row: Mapping[str, Any], now: datetime) -> int:
    """現在の残り秒数を返す。"""

    planned = int(row.get("planned_seconds") or 0)
    elapsed = _compute_elapsed_seconds(row, now)
    return max(0, planned - elapsed)


def _to_session_out(row: Mapping[str, Any], tags: list[str]) -> PomodoroSessionOut:
    """セッション行データを API 応答モデルへ変換する。"""

    now = datetime.now(tz=UTC)
    elapsed = _compute_elapsed_seconds(row, now)
    planned = int(row.get("planned_seconds") or 0)

    return PomodoroSessionOut(
        id=row["id"],
        user_id=row["user_id"],
        title=row.get("title") or "",
        session_type=row["session_type"],
        planned_seconds=planned,
        actual_seconds=min(planned, elapsed),
        started_at=_parse_datetime(row.get("started_at")),
        ended_at=_parse_datetime(row.get("ended_at")) if row.get("ended_at") else None,
        status=row["status"],
        cycle_index=int(row.get("cycle_index") or 1),
        created_at=_parse_datetime(row.get("created_at")),
        tags=tags,
        remaining_seconds=_remaining_seconds(row, now),
    )


def _load_tags_for_session_ids(client: Client, session_ids: list[str]) -> dict[str, list[str]]:
    """セッション ID 群に紐づくタグ名の対応表を返す。"""

    if not session_ids:
        return {}

    response = (
        client.table("pomodoro_session_tags")
        .select("session_id, tags(name)")
        .in_("session_id", session_ids)
        .execute()
    )

    mapping: dict[str, list[str]] = defaultdict(list)
    for row in response.data or []:
        tag_info = row.get("tags")
        if not isinstance(tag_info, Mapping):
            continue
        tag_name = tag_info.get("name")
        session_id = row.get("session_id")
        if isinstance(tag_name, str) and isinstance(session_id, str):
            mapping[session_id].append(tag_name)
    return mapping


def _sync_session_tags(client: Client, session_id: str, tags: list[str]) -> list[str]:
    """セッションとタグの関連を全置換する。"""

    normalized = _normalize_tags(tags)
    client.table("pomodoro_session_tags").delete().eq("session_id", session_id).execute()
    if not normalized:
        return []

    client.table("tags").upsert(
        [{"user_id": DEMO_USER_ID, "name": tag} for tag in normalized],
        on_conflict="user_id,name",
    ).execute()

    tags_response = (
        client.table("tags")
        .select("id, name")
        .eq("user_id", DEMO_USER_ID)
        .in_("name", normalized)
        .execute()
    )
    tag_rows = tags_response.data or []

    client.table("pomodoro_session_tags").insert(
        [{"session_id": session_id, "tag_id": row["id"]} for row in tag_rows]
    ).execute()
    return [str(row["name"]) for row in tag_rows]


def _get_session_row_or_error(client: Client, session_id: str) -> Mapping[str, Any]:
    """ユーザースコープ内セッションを 1 件取得し、未存在時は例外を送出する。"""

    response = (
        client.table("pomodoro_sessions")
        .select(SESSION_SELECT)
        .eq("id", session_id)
        .eq("user_id", DEMO_USER_ID)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise PomodoroSessionNotFoundError("pomodoro session not found")
    return rows[0]


def _get_active_session_row(client: Client) -> Mapping[str, Any] | None:
    """実行中または一時停止中の最新セッション行を返す。"""

    response = (
        client.table("pomodoro_sessions")
        .select(SESSION_SELECT)
        .eq("user_id", DEMO_USER_ID)
        .in_("status", ["running", "paused"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    return rows[0]


def get_pomodoro_settings() -> PomodoroSettingsOut:
    """ポモドーロ設定を取得し、未作成時は既定値行を作成して返す。"""

    client = _get_client()
    _ensure_demo_user_once()

    response = (
        client.table("pomodoro_settings")
        .select(SETTINGS_SELECT)
        .eq("user_id", DEMO_USER_ID)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        insert_response = (
            client.table("pomodoro_settings").insert({"user_id": DEMO_USER_ID}).execute()
        )
        rows = insert_response.data or []

    if not rows:
        raise ValueError("failed to load pomodoro settings")

    row = rows[0]
    return PomodoroSettingsOut(
        user_id=row["user_id"],
        focus_minutes=int(row.get("focus_minutes") or 25),
        short_break_minutes=int(row.get("short_break_minutes") or 5),
        long_break_minutes=int(row.get("long_break_minutes") or 20),
        long_break_every=int(row.get("long_break_every") or 4),
        updated_at=_parse_datetime(row.get("updated_at")),
    )


def update_pomodoro_settings(payload: PomodoroSettingsUpdate) -> PomodoroSettingsOut:
    """ポモドーロ設定を更新する。"""

    client = _get_client()
    _ensure_demo_user_once()

    response = (
        client.table("pomodoro_settings")
        .upsert(
            {
                "user_id": DEMO_USER_ID,
                "focus_minutes": payload.focus_minutes,
                "short_break_minutes": payload.short_break_minutes,
                "long_break_minutes": payload.long_break_minutes,
                "long_break_every": payload.long_break_every,
                "updated_at": datetime.now(tz=UTC).isoformat(),
            },
            on_conflict="user_id",
        )
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise ValueError("failed to update pomodoro settings")

    row = rows[0]
    return PomodoroSettingsOut(
        user_id=row["user_id"],
        focus_minutes=int(row.get("focus_minutes") or payload.focus_minutes),
        short_break_minutes=int(row.get("short_break_minutes") or payload.short_break_minutes),
        long_break_minutes=int(row.get("long_break_minutes") or payload.long_break_minutes),
        long_break_every=int(row.get("long_break_every") or payload.long_break_every),
        updated_at=_parse_datetime(row.get("updated_at")),
    )


def get_current_pomodoro_session() -> PomodoroSessionOut | None:
    """実行中または一時停止中のセッションを返す。"""

    def _load() -> PomodoroSessionOut | None:
        client = _get_client()
        _ensure_demo_user_once()
        row = _get_active_session_row(client)
        if not row:
            return None

        session_id = str(row["id"])
        tags_by_session = _load_tags_for_session_ids(client, [session_id])
        return _to_session_out(row, tags_by_session.get(session_id, []))

    return _run_with_disconnect_retry(_load)


def start_pomodoro_session(payload: PomodoroSessionStart) -> PomodoroSessionOut:
    """新しいセッションを開始する。"""

    client = _get_client()
    _ensure_demo_user_once()

    if _get_active_session_row(client) is not None:
        raise PomodoroSessionStateError("active session already exists")

    planned_seconds = payload.planned_seconds or _get_default_planned_seconds(payload.session_type)
    now = datetime.now(tz=UTC)
    insert_response = (
        client.table("pomodoro_sessions")
        .insert(
            {
                "user_id": DEMO_USER_ID,
                "title": payload.title.strip(),
                "session_type": payload.session_type,
                "planned_seconds": planned_seconds,
                "actual_seconds": 0,
                "started_at": now.isoformat(),
                "planned_end_at": _compute_planned_end_at(now, planned_seconds).isoformat(),
                "last_notified_step": -1,
                "status": "running",
                "cycle_index": payload.cycle_index,
            }
        )
        .execute()
    )

    rows = insert_response.data or []
    if not rows:
        raise ValueError("failed to start pomodoro session")

    row = rows[0]
    session_id = str(row["id"])
    tags = _sync_session_tags(client, session_id, payload.tags)
    return _to_session_out(row, tags)


def update_pomodoro_session(
    session_id: str,
    payload: PomodoroSessionUpdate,
) -> PomodoroSessionOut:
    """実行中または一時停止中セッションのタイトル/タグを更新する。"""

    client = _get_client()
    _ensure_demo_user_once()

    row = _get_session_row_or_error(client, session_id)
    status = row.get("status")
    if status not in {"running", "paused"}:
        raise PomodoroSessionStateError("session is already finished")

    update_response = (
        client.table("pomodoro_sessions")
        .update(
            {
                "title": (payload.title or row.get("title") or "").strip(),
            }
        )
        .eq("id", session_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    updated_rows = update_response.data or []
    if not updated_rows:
        raise PomodoroSessionNotFoundError("pomodoro session not found")

    updated_row = updated_rows[0]
    tags = _sync_session_tags(client, session_id, payload.tags or [])
    return _to_session_out(updated_row, tags)


def pause_pomodoro_session(session_id: str) -> PomodoroSessionOut:
    """実行中セッションを一時停止する。"""

    client = _get_client()
    _ensure_demo_user_once()

    row = _get_session_row_or_error(client, session_id)
    if row.get("status") != "running":
        raise PomodoroSessionStateError("session is not running")

    now = datetime.now(tz=UTC)
    planned_seconds = int(row.get("planned_seconds") or 0)
    elapsed_seconds = min(planned_seconds, _compute_elapsed_seconds(row, now))

    update_response = (
        client.table("pomodoro_sessions")
        .update(
            {
                "actual_seconds": elapsed_seconds,
                "planned_end_at": None,
                "status": "paused",
            }
        )
        .eq("id", session_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    updated_rows = update_response.data or []
    if not updated_rows:
        raise PomodoroSessionNotFoundError("pomodoro session not found")

    updated_row = updated_rows[0]
    tags_by_session = _load_tags_for_session_ids(client, [session_id])
    return _to_session_out(updated_row, tags_by_session.get(session_id, []))


def resume_pomodoro_session(session_id: str) -> PomodoroSessionOut:
    """一時停止中セッションを再開する。"""

    client = _get_client()
    _ensure_demo_user_once()

    row = _get_session_row_or_error(client, session_id)
    if row.get("status") != "paused":
        raise PomodoroSessionStateError("session is not paused")

    now = datetime.now(tz=UTC)
    planned_seconds = int(row.get("planned_seconds") or 0)
    actual_seconds = int(row.get("actual_seconds") or 0)
    remaining_seconds = max(0, planned_seconds - actual_seconds)

    update_response = (
        client.table("pomodoro_sessions")
        .update(
            {
                # 累積実績は actual_seconds で保持しているため、再開時刻は現在時刻へ更新する。
                "started_at": now.isoformat(),
                "planned_end_at": _compute_planned_end_at(now, remaining_seconds).isoformat(),
                "status": "running",
            }
        )
        .eq("id", session_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    updated_rows = update_response.data or []
    if not updated_rows:
        raise PomodoroSessionNotFoundError("pomodoro session not found")

    updated_row = updated_rows[0]
    tags_by_session = _load_tags_for_session_ids(client, [session_id])
    return _to_session_out(updated_row, tags_by_session.get(session_id, []))


def finish_pomodoro_session(session_id: str) -> PomodoroSessionOut:
    """セッションを completed へ遷移させる。"""

    return _close_pomodoro_session(session_id, "completed")


def cancel_pomodoro_session(session_id: str) -> PomodoroSessionOut:
    """セッションを cancelled へ遷移させる。"""

    return _close_pomodoro_session(session_id, "cancelled")


def _close_pomodoro_session(
    session_id: str, target_status: Literal["completed", "cancelled"]
) -> PomodoroSessionOut:
    """セッション終了系の状態遷移を共通化する。"""

    client = _get_client()
    _ensure_demo_user_once()

    row = _get_session_row_or_error(client, session_id)
    current_status = row.get("status")
    if current_status not in {"running", "paused"}:
        raise PomodoroSessionStateError("session is already finished")

    now = datetime.now(tz=UTC)
    planned_seconds = int(row.get("planned_seconds") or 0)
    elapsed_seconds = min(planned_seconds, _compute_elapsed_seconds(row, now))

    update_response = (
        client.table("pomodoro_sessions")
        .update(
            {
                "actual_seconds": elapsed_seconds,
                "ended_at": now.isoformat(),
                "planned_end_at": None,
                "status": target_status,
            }
        )
        .eq("id", session_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    updated_rows = update_response.data or []
    if not updated_rows:
        raise PomodoroSessionNotFoundError("pomodoro session not found")

    updated_row = updated_rows[0]
    tags_by_session = _load_tags_for_session_ids(client, [session_id])
    return _to_session_out(updated_row, tags_by_session.get(session_id, []))


def list_pomodoro_sessions(limit: int = 100) -> list[PomodoroSessionOut]:
    """ポモドーロセッション履歴を新しい順で返す。"""

    def _load() -> list[PomodoroSessionOut]:
        client = _get_client()
        _ensure_demo_user_once()

        safe_limit = max(1, min(500, limit))
        response = (
            client.table("pomodoro_sessions")
            .select(SESSION_SELECT)
            .eq("user_id", DEMO_USER_ID)
            .order("created_at", desc=True)
            .limit(safe_limit)
            .execute()
        )
        rows = response.data or []
        session_ids = [str(row["id"]) for row in rows]
        tags_by_session = _load_tags_for_session_ids(client, session_ids)

        return [_to_session_out(row, tags_by_session.get(str(row["id"]), [])) for row in rows]

    return _run_with_disconnect_retry(_load)


def get_pomodoro_summary(group_by: SummaryGroupBy) -> list[PomodoroSummaryOut]:
    """完了済み focus セッションを日/週/月で集計して返す。"""

    sessions = [
        item
        for item in list_pomodoro_sessions(limit=500)
        if item.status == "completed" and item.session_type == "focus" and item.ended_at is not None
    ]

    bucket: dict[date, PomodoroSummaryOut] = {}

    for session in sessions:
        assert session.ended_at is not None
        ended = session.ended_at.date()
        if group_by == "week":
            period_start = ended - timedelta(days=ended.weekday())
        elif group_by == "month":
            period_start = ended.replace(day=1)
        else:
            period_start = ended

        if period_start not in bucket:
            bucket[period_start] = PomodoroSummaryOut(
                period_start=period_start,
                focus_sessions=0,
                focus_seconds=0,
            )

        current = bucket[period_start]
        bucket[period_start] = PomodoroSummaryOut(
            period_start=current.period_start,
            focus_sessions=current.focus_sessions + 1,
            focus_seconds=current.focus_seconds + session.actual_seconds,
        )

    return [bucket[key] for key in sorted(bucket.keys(), reverse=True)]
