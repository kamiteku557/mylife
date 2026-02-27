"""Supabase を利用したメモログ CRUD のサービス層。

RQ-OPS-004 で認証ユーザー文脈が導入されるまで、固定デモユーザーを利用する。
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

# RQ-OPS-004 の認証実装までの暫定対応として、メモ API は固定デモユーザーで動作する。
DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"


class MemoLogCreate(BaseModel):
    """メモログ作成時の入力 payload。"""

    title: str = ""
    body_md: str = Field(min_length=1)
    log_date: date
    tags: list[str] = Field(default_factory=list)
    related_session_id: UUID | None = None


class MemoLogUpdate(BaseModel):
    """メモログ更新時の入力 payload。"""

    title: str = ""
    body_md: str = Field(min_length=1)
    log_date: date
    tags: list[str] = Field(default_factory=list)
    related_session_id: UUID | None = None


class MemoLogOut(BaseModel):
    """メモログ API 応答のシリアライズ形式。"""

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
    """現在のユーザースコープでメモログが見つからない場合に送出する。"""

    pass


class MemoLogService:
    """メモログユースケース向けに FastAPI DI へ公開するサービスオブジェクト。"""

    def list(self) -> list[MemoLogOut]:
        """現在のユーザースコープでメモログ一覧を返す。"""

        return list_memo_logs()

    def get(self, memo_id: str) -> MemoLogOut:
        """ID を指定してメモログを 1 件取得する。"""

        return get_memo_log(memo_id)

    def create(self, payload: MemoLogCreate) -> MemoLogOut:
        """メモログを作成する。"""

        return create_memo_log(payload)

    def update(self, memo_id: str, payload: MemoLogUpdate) -> MemoLogOut:
        """メモログを更新する。"""

        return update_memo_log(memo_id, payload)

    def delete(self, memo_id: str) -> None:
        """メモログを削除する。"""

        delete_memo_log(memo_id)


def get_memo_log_service() -> MemoLogService:
    """依存性注入用のメモログサービスインスタンスを返す。"""

    return MemoLogService()


def _normalize_tags(tags: list[str]) -> list[str]:
    """入力順を保ったまま、空文字除去・前後空白除去・重複除去したタグ一覧を返す。"""

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
    """Supabase のタイムスタンプ文字列を解析し、未指定時は現在 UTC を返す。"""

    if not value:
        return datetime.now(tz=UTC)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@lru_cache(maxsize=1)
def _get_client() -> Client:
    """可能なら service-role key を使い、再利用可能な Supabase クライアントを返す。"""

    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not api_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required"
        )
    return create_client(settings.supabase_url, api_key)


def _ensure_demo_user(client: Client, user_id: str) -> None:
    # サインアップ手順なしでもローカル開発 API が動くよう、固定ユーザーを事前に用意する。
    client.table("users").upsert(
        {"id": user_id, "display_name": "Demo User"},
        on_conflict="id",
    ).execute()


@lru_cache(maxsize=1)
def _ensure_demo_user_once() -> None:
    """固定デモユーザー作成をプロセスごとに 1 回へ抑え、リクエストごとの遅延を避ける。"""

    _ensure_demo_user(_get_client(), DEMO_USER_ID)


def _memo_to_out(row: Mapping[str, Any], tags: list[str]) -> MemoLogOut:
    """テーブル生データを API 応答モデルへ変換する。"""

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
    """メモ ID 群に紐づくタグ名の対応表をまとめて取得する。"""

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
    """メモのタグを全置換し、正規化後に永続化されたタグ名一覧を返す。"""

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
    """現在のユーザースコープでメモログを日付降順で返す。"""

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
    """ID を指定してメモログを 1 件取得し、なければ ``MemoLogNotFoundError`` を送出する。"""

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
    """メモログを作成し、タグ関連を紐づける。"""

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
    """メモログを更新し、タグ関連を完全に置き換える。"""

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
    """ID を指定してメモログを削除し、未存在なら ``MemoLogNotFoundError`` を送出する。"""

    client = _get_client()
    _ensure_demo_user_once()

    delete_response = (
        client.table("memo_logs").delete().eq("id", memo_id).eq("user_id", DEMO_USER_ID).execute()
    )
    if not (delete_response.data or []):
        raise MemoLogNotFoundError("memo log not found")
