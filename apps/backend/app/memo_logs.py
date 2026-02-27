"""Memo log service layer for Supabase-backed CRUD operations.

This module currently uses a fixed demo user until authenticated user context
is available via RQ-OPS-004.
"""

from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from supabase import Client, create_client

from app.config import get_settings

# Temporary until RQ-OPS-004 auth is implemented: all memo APIs operate on a fixed demo user.
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


class MemoLogCreate(BaseModel):
    """Payload for creating a memo log."""

    title: str = ""
    body_md: str = Field(min_length=1)
    log_date: date
    tags: list[str] = Field(default_factory=list)
    related_session_id: UUID | None = None


class MemoLogUpdate(BaseModel):
    """Payload for updating a memo log."""

    title: str = ""
    body_md: str = Field(min_length=1)
    log_date: date
    tags: list[str] = Field(default_factory=list)
    related_session_id: UUID | None = None


class MemoLogOut(BaseModel):
    """Serialized memo log response shape."""

    id: UUID
    user_id: UUID
    title: str
    body_md: str
    log_date: date
    related_session_id: UUID | None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MemoLogNotFoundError(ValueError):
    """Raised when a memo log record does not exist for the current user scope."""

    pass


class MemoLogService:
    """Service object exposed to FastAPI dependency injection for memo-log use cases."""

    def list(self) -> list[MemoLogOut]:
        """List memo logs for the current user scope."""

        return list_memo_logs()

    def get(self, memo_id: str) -> MemoLogOut:
        """Fetch one memo log by ID."""

        return get_memo_log(memo_id)

    def create(self, payload: MemoLogCreate) -> MemoLogOut:
        """Create a memo log."""

        return create_memo_log(payload)

    def update(self, memo_id: str, payload: MemoLogUpdate) -> MemoLogOut:
        """Update a memo log."""

        return update_memo_log(memo_id, payload)

    def delete(self, memo_id: str) -> None:
        """Delete a memo log."""

        delete_memo_log(memo_id)


def get_memo_log_service() -> MemoLogService:
    """Return memo-log service instance for dependency injection."""

    return MemoLogService()


def _normalize_tags(tags: list[str]) -> list[str]:
    """Return unique, trimmed tags while preserving input order."""

    seen: set[str] = set()
    normalized: list[str] = []
    for raw in tags:
        value = raw.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _parse_datetime(value: str | None) -> datetime:
    """Parse Supabase timestamp text and fallback to current UTC time when absent."""

    if not value:
        return datetime.now(tz=UTC)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@lru_cache(maxsize=1)
def _get_client() -> Client:
    """Create and reuse a Supabase client using service-role key when available."""

    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not api_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required"
        )
    return create_client(settings.supabase_url, api_key)


def _ensure_demo_user(client: Client, user_id: str) -> None:
    # Keep local/dev API calls functional without a signup step by ensuring the fixed user exists.
    client.table("users").upsert(
        {"id": user_id, "display_name": "Demo User"},
        on_conflict="id",
    ).execute()


@lru_cache(maxsize=1)
def _ensure_demo_user_once() -> None:
    """Ensure the fixed demo user once per process to avoid per-request upsert latency."""

    _ensure_demo_user(_get_client(), DEMO_USER_ID)


def _memo_to_out(row: Mapping[str, Any], tags: list[str]) -> MemoLogOut:
    """Convert raw table row data into the API response model."""

    return MemoLogOut(
        id=row["id"],
        user_id=row["user_id"],
        title=row.get("title", ""),
        body_md=row["body_md"],
        log_date=row["log_date"],
        related_session_id=row.get("related_session_id"),
        tags=tags,
        created_at=_parse_datetime(row.get("created_at")),
        updated_at=_parse_datetime(row.get("updated_at")),
    )


def _load_tags_for_memo_ids(client: Client, memo_ids: list[str]) -> dict[str, list[str]]:
    """Load memo->tag names mapping for a batch of memo IDs."""

    if not memo_ids:
        return {}

    mapping: dict[str, list[str]] = defaultdict(list)
    relation_response = (
        client.table("memo_log_tags")
        .select("memo_log_id, tags(name)")
        .in_("memo_log_id", memo_ids)
        .execute()
    )

    for row in relation_response.data or []:
        tag_info = row.get("tags")
        if not isinstance(tag_info, Mapping):
            continue
        name = tag_info.get("name")
        memo_log_id = row.get("memo_log_id")
        if isinstance(name, str) and isinstance(memo_log_id, str):
            mapping[memo_log_id].append(name)

    return mapping


def _sync_memo_tags(client: Client, user_id: str, memo_id: str, tags: list[str]) -> list[str]:
    """Replace all tags for a memo and return the normalized persisted tag names."""

    normalized_tags = _normalize_tags(tags)
    client.table("memo_log_tags").delete().eq("memo_log_id", memo_id).execute()

    if not normalized_tags:
        return []

    client.table("tags").upsert(
        [{"user_id": user_id, "name": tag_name} for tag_name in normalized_tags],
        on_conflict="user_id,name",
    ).execute()

    tags_response = (
        client.table("tags")
        .select("id, name")
        .eq("user_id", user_id)
        .in_("name", normalized_tags)
        .execute()
    )
    tag_rows = tags_response.data or []

    client.table("memo_log_tags").insert(
        [{"memo_log_id": memo_id, "tag_id": row["id"]} for row in tag_rows]
    ).execute()
    return [row["name"] for row in tag_rows]


def list_memo_logs() -> list[MemoLogOut]:
    """List all memo logs for the current user scope in descending date order."""

    client = _get_client()
    _ensure_demo_user_once()

    response = (
        client.table("memo_logs")
        .select("id, user_id, title, body_md, log_date, related_session_id, created_at, updated_at")
        .eq("user_id", DEMO_USER_ID)
        .order("log_date", desc=True)
        .order("created_at", desc=True)
        .execute()
    )

    rows = response.data or []
    memo_ids = [row["id"] for row in rows if isinstance(row.get("id"), str)]
    tags_by_memo = _load_tags_for_memo_ids(client, memo_ids)

    return [_memo_to_out(row, tags_by_memo.get(row["id"], [])) for row in rows]


def get_memo_log(memo_id: str) -> MemoLogOut:
    """Get one memo log by ID or raise ``MemoLogNotFoundError``."""

    client = _get_client()
    _ensure_demo_user_once()

    response = (
        client.table("memo_logs")
        .select("id, user_id, title, body_md, log_date, related_session_id, created_at, updated_at")
        .eq("id", memo_id)
        .eq("user_id", DEMO_USER_ID)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise MemoLogNotFoundError("memo log not found")

    tags_by_memo = _load_tags_for_memo_ids(client, [memo_id])
    return _memo_to_out(rows[0], tags_by_memo.get(memo_id, []))


def create_memo_log(payload: MemoLogCreate) -> MemoLogOut:
    """Create a memo log row and attach tag relations."""

    client = _get_client()
    _ensure_demo_user_once()

    insert_payload = {
        "user_id": DEMO_USER_ID,
        "title": payload.title.strip(),
        "body_md": payload.body_md,
        "log_date": payload.log_date.isoformat(),
        "related_session_id": (
            str(payload.related_session_id) if payload.related_session_id else None
        ),
    }

    insert_response = client.table("memo_logs").insert(insert_payload).execute()
    created_rows = insert_response.data or []
    if not created_rows:
        raise ValueError("failed to create memo log")

    memo_row = created_rows[0]
    memo_id = memo_row["id"]
    tags = _sync_memo_tags(client, DEMO_USER_ID, memo_id, payload.tags)
    return _memo_to_out(memo_row, tags)


def update_memo_log(memo_id: str, payload: MemoLogUpdate) -> MemoLogOut:
    """Update a memo log and fully replace its tag relations."""

    client = _get_client()
    _ensure_demo_user_once()

    update_payload = {
        "title": payload.title.strip(),
        "body_md": payload.body_md,
        "log_date": payload.log_date.isoformat(),
        "related_session_id": (
            str(payload.related_session_id) if payload.related_session_id else None
        ),
    }
    update_response = (
        client.table("memo_logs")
        .update(update_payload)
        .eq("id", memo_id)
        .eq("user_id", DEMO_USER_ID)
        .execute()
    )
    updated_rows = update_response.data or []
    if not updated_rows:
        raise MemoLogNotFoundError("memo log not found")

    memo_row = updated_rows[0]
    tags = _sync_memo_tags(client, DEMO_USER_ID, memo_id, payload.tags)
    return _memo_to_out(memo_row, tags)


def delete_memo_log(memo_id: str) -> None:
    """Delete a memo log by ID or raise ``MemoLogNotFoundError`` when missing."""

    client = _get_client()
    _ensure_demo_user_once()

    delete_response = (
        client.table("memo_logs").delete().eq("id", memo_id).eq("user_id", DEMO_USER_ID).execute()
    )
    if not (delete_response.data or []):
        raise MemoLogNotFoundError("memo log not found")
