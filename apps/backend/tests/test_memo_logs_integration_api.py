"""メモログ API の主要導線を検証する結合テスト。"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from app.main import app
from app.memo_logs import MemoLogCreate, MemoLogNotFoundError, MemoLogUpdate, get_memo_log_service
from fastapi.testclient import TestClient

client = TestClient(app)


class InMemoryMemoLogService:
    """メモログ導線確認用のインメモリ実装。"""

    def __init__(self) -> None:
        self._rows: dict[str, dict] = {}

    def list(self, limit: int = 100) -> list[dict]:
        rows = sorted(
            self._rows.values(),
            key=lambda row: row["created_at"],
            reverse=True,
        )
        return rows[: max(1, limit)]

    def get(self, memo_id: str) -> dict:
        row = self._rows.get(memo_id)
        if row is None:
            raise MemoLogNotFoundError("memo log not found")
        return row

    def create(self, payload: MemoLogCreate) -> dict:
        now = datetime.now(tz=UTC)
        memo_id = str(uuid4())
        body_md = payload.body_md
        title = payload.title.strip()
        log_date = payload.log_date or date.today()
        tags = self._normalize_tags(payload.tags)
        row = {
            "id": memo_id,
            "user_id": "00000000-0000-0000-0000-000000000001",
            "title": title,
            "body_md": body_md,
            "log_date": log_date,
            "related_session_id": None,
            "tags": tags,
            "created_at": now,
            "updated_at": now,
        }
        self._rows[memo_id] = row
        return row

    def update(self, memo_id: str, payload: MemoLogUpdate) -> dict:
        source = self._rows.get(memo_id)
        if source is None:
            raise MemoLogNotFoundError("memo log not found")

        updated = {
            **source,
            "title": payload.title.strip(),
            "body_md": payload.body_md,
            "log_date": payload.log_date,
            "tags": self._normalize_tags(payload.tags),
            "updated_at": datetime.now(tz=UTC),
        }
        self._rows[memo_id] = updated
        return updated

    def delete(self, memo_id: str) -> None:
        if memo_id not in self._rows:
            raise MemoLogNotFoundError("memo log not found")
        del self._rows[memo_id]

    @staticmethod
    def _normalize_tags(tags: list[str]) -> list[str]:
        seen: set[str] = set()
        normalized: list[str] = []
        for tag in tags:
            value = tag.strip()
            if not value or value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        return normalized


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """依存性オーバーライドをテストごとに初期化する。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_memo_logs_crud_flow() -> None:
    """作成・取得・更新・削除の導線が API 経由で完結する。"""

    service = InMemoryMemoLogService()
    app.dependency_overrides[get_memo_log_service] = lambda: service

    create_response = client.post(
        "/api/v1/memo-logs",
        json={
            "title": "初回",
            "body_md": "最初の本文",
            "log_date": "2026-03-01",
            "tags": ["work", "work", "idea"],
            "related_session_id": None,
        },
    )
    assert create_response.status_code == 201

    memo_id = create_response.json()["id"]
    assert create_response.json()["tags"] == ["work", "idea"]

    list_response = client.get("/api/v1/memo-logs?limit=10")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    get_response = client.get(f"/api/v1/memo-logs/{memo_id}")
    assert get_response.status_code == 200
    assert get_response.json()["body_md"] == "最初の本文"

    update_response = client.put(
        f"/api/v1/memo-logs/{memo_id}",
        json={
            "title": "更新",
            "body_md": "更新後本文",
            "log_date": "2026-03-01",
            "tags": ["deep"],
            "related_session_id": None,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "更新"
    assert update_response.json()["tags"] == ["deep"]

    delete_response = client.delete(f"/api/v1/memo-logs/{memo_id}")
    assert delete_response.status_code == 204

    not_found_response = client.get(f"/api/v1/memo-logs/{memo_id}")
    assert not_found_response.status_code == 404
    assert not_found_response.json() == {"detail": "memo log not found"}
