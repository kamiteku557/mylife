"""FastAPI 依存性オーバーライドを使ったポモドーロ API テスト。"""

from datetime import UTC, date, datetime

import pytest
from app.main import app
from app.pomodoro import (
    PomodoroSessionNotFoundError,
    PomodoroSessionStateError,
    get_pomodoro_service,
)
from fastapi.testclient import TestClient

client = TestClient(app)


class FakePomodoroService:
    """テストケースごとにハンドラー挙動を制御するテストダブル。"""

    def get_settings(self) -> dict:
        """設定取得の固定レスポンスを返す。"""

        return _sample_settings()

    def update_settings(self, _payload: object) -> dict:
        """設定更新の固定レスポンスを返す。"""

        return _sample_settings()

    def get_current(self) -> dict | None:
        """現在セッションの固定レスポンスを返す。"""

        return _sample_session()

    def start(self, _payload: object) -> dict:
        """開始時の固定レスポンスを返す。"""

        return _sample_session(status="running")

    def pause(self, _session_id: str) -> dict:
        """一時停止時の固定レスポンスを返す。"""

        return _sample_session(status="paused")

    def update_session(self, _session_id: str, _payload: object) -> dict:
        """編集中更新時の固定レスポンスを返す。"""

        return _sample_session(status="running")

    def resume(self, _session_id: str) -> dict:
        """再開時の固定レスポンスを返す。"""

        return _sample_session(status="running")

    def finish(self, _session_id: str) -> dict:
        """完了時の固定レスポンスを返す。"""

        return _sample_session(status="completed", remaining_seconds=0)

    def cancel(self, _session_id: str) -> dict:
        """キャンセル時の固定レスポンスを返す。"""

        return _sample_session(status="cancelled", remaining_seconds=0)

    def list_sessions(self, limit: int = 100) -> list[dict]:
        """履歴一覧の固定レスポンスを返す。"""

        assert limit >= 1
        return [_sample_session()]

    def summary(self, group_by: str) -> list[dict]:
        """集計の固定レスポンスを返す。"""

        assert group_by in {"day", "week", "month"}
        return [{"period_start": date(2026, 2, 28), "focus_sessions": 2, "focus_seconds": 3000}]


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """依存性オーバーライドを毎テスト前後で初期化する。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _sample_settings() -> dict:
    """ポモドーロ設定レスポンスのサンプルを返す。"""

    return {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "focus_minutes": 25,
        "short_break_minutes": 5,
        "long_break_minutes": 20,
        "long_break_every": 4,
        "updated_at": datetime(2026, 2, 28, 10, 0, tzinfo=UTC),
    }


def _sample_session(
    status: str = "running",
    remaining_seconds: int = 1200,
) -> dict:
    """ポモドーロセッションレスポンスのサンプルを返す。"""

    now = datetime(2026, 2, 28, 10, 0, tzinfo=UTC)
    ended_at = (
        datetime(2026, 2, 28, 10, 25, tzinfo=UTC) if status in {"completed", "cancelled"} else None
    )
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": "00000000-0000-0000-0000-000000000001",
        "title": "Design review",
        "session_type": "focus",
        "planned_seconds": 1500,
        "actual_seconds": 300,
        "started_at": now,
        "ended_at": ended_at,
        "status": status,
        "cycle_index": 1,
        "created_at": now,
        "tags": ["work", "design"],
        "remaining_seconds": remaining_seconds,
    }


def test_get_pomodoro_settings() -> None:
    """GET /settings/pomodoro は設定値を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.get("/api/v1/settings/pomodoro")

    assert response.status_code == 200
    assert response.json()["focus_minutes"] == 25


def test_update_pomodoro_settings() -> None:
    """PUT /settings/pomodoro は更新後設定値を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.put(
        "/api/v1/settings/pomodoro",
        json={
            "focus_minutes": 30,
            "short_break_minutes": 5,
            "long_break_minutes": 20,
            "long_break_every": 4,
        },
    )

    assert response.status_code == 200
    assert response.json()["long_break_every"] == 4


def test_start_pomodoro() -> None:
    """POST /pomodoro/start は開始済みセッションを返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.post(
        "/api/v1/pomodoro/start",
        json={
            "title": "Design review",
            "session_type": "focus",
            "cycle_index": 1,
            "tags": ["work"],
        },
    )

    assert response.status_code == 201
    assert response.json()["status"] == "running"


def test_pause_pomodoro_conflict() -> None:
    """POST /pomodoro/{id}/pause は状態不正時に 409 を返す。"""

    class ConflictService(FakePomodoroService):
        def pause(self, _session_id: str) -> dict:
            raise PomodoroSessionStateError("session is not running")

    app.dependency_overrides[get_pomodoro_service] = ConflictService

    response = client.post("/api/v1/pomodoro/11111111-1111-1111-1111-111111111111/pause")

    assert response.status_code == 409
    assert response.json() == {"detail": "session is not running"}


def test_resume_pomodoro_not_found() -> None:
    """POST /pomodoro/{id}/resume は未存在時に 404 を返す。"""

    class NotFoundService(FakePomodoroService):
        def resume(self, _session_id: str) -> dict:
            raise PomodoroSessionNotFoundError("pomodoro session not found")

    app.dependency_overrides[get_pomodoro_service] = NotFoundService

    response = client.post("/api/v1/pomodoro/11111111-1111-1111-1111-111111111111/resume")

    assert response.status_code == 404
    assert response.json() == {"detail": "pomodoro session not found"}


def test_update_pomodoro() -> None:
    """PUT /pomodoro/{id} は更新後セッションを返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.put(
        "/api/v1/pomodoro/11111111-1111-1111-1111-111111111111",
        json={"title": "Updated title", "tags": ["work"]},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_finish_pomodoro() -> None:
    """POST /pomodoro/{id}/finish は completed を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.post("/api/v1/pomodoro/11111111-1111-1111-1111-111111111111/finish")

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_cancel_pomodoro() -> None:
    """POST /pomodoro/{id}/cancel は cancelled を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.post("/api/v1/pomodoro/11111111-1111-1111-1111-111111111111/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_get_pomodoro_sessions() -> None:
    """GET /pomodoro/sessions は履歴一覧を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.get("/api/v1/pomodoro/sessions?limit=20")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Design review"


def test_get_pomodoro_summary() -> None:
    """GET /pomodoro/summary は集計一覧を返す。"""

    app.dependency_overrides[get_pomodoro_service] = FakePomodoroService

    response = client.get("/api/v1/pomodoro/summary?group_by=week")

    assert response.status_code == 200
    assert response.json()[0]["focus_sessions"] == 2
