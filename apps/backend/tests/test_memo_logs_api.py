"""API tests for memo-log CRUD handlers using FastAPI dependency overrides."""

from datetime import UTC, date, datetime

import pytest
from app.main import app
from app.memo_logs import MemoLogNotFoundError, get_memo_log_service
from fastapi.testclient import TestClient

client = TestClient(app)


class FakeMemoLogService:
    """Small test double used to control handler behavior per test case."""

    def list(self) -> list[dict]:
        """Return a list response."""

        return [_sample_memo()]

    def get(self, _memo_id: str) -> dict:
        """Return a single memo response."""

        return _sample_memo()

    def create(self, _payload: object) -> dict:
        """Return a created memo response."""

        return _sample_memo()

    def update(self, _memo_id: str, _payload: object) -> dict:
        """Return an updated memo response."""

        return _sample_memo()

    def delete(self, _memo_id: str) -> None:
        """Simulate successful deletion."""


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """Isolate each test by clearing FastAPI dependency overrides."""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _sample_memo(memo_id: str = "11111111-1111-1111-1111-111111111111") -> dict:
    """Return a stable sample payload for endpoint response assertions."""

    now = datetime(2026, 2, 27, 10, 0, tzinfo=UTC)
    return {
        "id": memo_id,
        "user_id": "00000000-0000-0000-0000-000000000001",
        "title": "memo title",
        "body_md": "memo body",
        "log_date": date(2026, 2, 27),
        "related_session_id": None,
        "tags": ["work", "idea"],
        "created_at": now,
        "updated_at": now,
    }


def test_list_memo_logs():
    """GET /memo-logs returns a list payload when service succeeds."""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.get("/api/v1/memo-logs")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "memo title"


def test_get_memo_log_not_found():
    """GET /memo-logs/{id} maps missing records to HTTP 404."""

    class NotFoundService(FakeMemoLogService):
        def get(self, _memo_id: str) -> dict:
            raise MemoLogNotFoundError("memo log not found")

    app.dependency_overrides[get_memo_log_service] = NotFoundService

    response = client.get("/api/v1/memo-logs/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "memo log not found"}


def test_create_memo_log():
    """POST /memo-logs returns HTTP 201 with created memo payload."""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.post(
        "/api/v1/memo-logs",
        json={
            "title": "memo title",
            "body_md": "memo body",
            "log_date": "2026-02-27",
            "tags": ["work", "idea"],
            "related_session_id": None,
        },
    )

    assert response.status_code == 201
    assert response.json()["tags"] == ["work", "idea"]


def test_update_memo_log():
    """PUT /memo-logs/{id} returns updated memo payload."""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.put(
        "/api/v1/memo-logs/11111111-1111-1111-1111-111111111111",
        json={
            "title": "updated",
            "body_md": "updated body",
            "log_date": "2026-02-27",
            "tags": ["work"],
            "related_session_id": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == "11111111-1111-1111-1111-111111111111"


def test_delete_memo_log():
    """DELETE /memo-logs/{id} returns HTTP 204 on successful deletion."""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.delete("/api/v1/memo-logs/11111111-1111-1111-1111-111111111111")

    assert response.status_code == 204
