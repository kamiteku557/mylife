"""FastAPI 依存性オーバーライドを使ったメモログ CRUD API テスト。"""

from datetime import UTC, date, datetime

import pytest
from app.main import app
from app.memo_logs import MemoLogNotFoundError, get_memo_log_service
from fastapi.testclient import TestClient

client = TestClient(app)


class FakeMemoLogService:
    """テストケースごとにハンドラー挙動を制御する小さなテストダブル。"""

    def list(self, limit: int = 100) -> list[dict]:
        """一覧レスポンスを返す。"""

        _ = limit
        return [_sample_memo()]

    def get(self, _memo_id: str) -> dict:
        """単一メモレスポンスを返す。"""

        return _sample_memo()

    def create(self, _payload: object) -> dict:
        """作成後メモレスポンスを返す。"""

        return _sample_memo()

    def update(self, _memo_id: str, _payload: object) -> dict:
        """更新後メモレスポンスを返す。"""

        return _sample_memo()

    def delete(self, _memo_id: str) -> None:
        """削除成功を模擬する。"""


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """FastAPI 依存性オーバーライドをクリアし、テスト間の影響を遮断する。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _sample_memo(memo_id: str = "11111111-1111-1111-1111-111111111111") -> dict:
    """エンドポイント応答検証で使う安定したサンプル payload を返す。"""

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
    """GET /memo-logs はサービス成功時に一覧 payload を返す。"""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.get("/api/v1/memo-logs")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "memo title"


def test_list_memo_logs_passes_limit_query():
    """GET /memo-logs は query の limit をサービス層へ伝播する。"""

    class CaptureLimitService(FakeMemoLogService):
        received_limit: int | None = None

        def list(self, limit: int = 100) -> list[dict]:
            self.received_limit = limit
            return super().list(limit=limit)

    service = CaptureLimitService()
    app.dependency_overrides[get_memo_log_service] = lambda: service

    response = client.get("/api/v1/memo-logs?limit=7")

    assert response.status_code == 200
    assert service.received_limit == 7


def test_get_memo_log_not_found():
    """GET /memo-logs/{id} は未存在レコードを HTTP 404 に変換する。"""

    class NotFoundService(FakeMemoLogService):
        def get(self, _memo_id: str) -> dict:
            raise MemoLogNotFoundError("memo log not found")

    app.dependency_overrides[get_memo_log_service] = NotFoundService

    response = client.get("/api/v1/memo-logs/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "memo log not found"}


def test_create_memo_log():
    """POST /memo-logs は作成済みメモ payload と HTTP 201 を返す。"""

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
    """PUT /memo-logs/{id} は更新後メモ payload を返す。"""

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
    """DELETE /memo-logs/{id} は削除成功時に HTTP 204 を返す。"""

    app.dependency_overrides[get_memo_log_service] = FakeMemoLogService

    response = client.delete("/api/v1/memo-logs/11111111-1111-1111-1111-111111111111")

    assert response.status_code == 204
