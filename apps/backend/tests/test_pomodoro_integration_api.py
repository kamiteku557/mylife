"""ポモドーロ API の主要導線を検証する結合テスト。"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from app.main import app
from app.pomodoro import (
    PomodoroSessionNotFoundError,
    PomodoroSessionStart,
    PomodoroSessionStateError,
    PomodoroSessionUpdate,
    PomodoroSettingsUpdate,
    get_pomodoro_service,
)
from fastapi.testclient import TestClient

client = TestClient(app)


class InMemoryPomodoroService:
    """状態遷移導線確認用のインメモリ実装。"""

    def __init__(self) -> None:
        now = datetime.now(tz=UTC)
        self._settings = {
            "user_id": "00000000-0000-0000-0000-000000000001",
            "focus_minutes": 25,
            "short_break_minutes": 5,
            "long_break_minutes": 20,
            "long_break_every": 4,
            "updated_at": now,
        }
        self._sessions: dict[str, dict] = {}

    def get_settings(self) -> dict:
        return self._settings

    def update_settings(self, payload: PomodoroSettingsUpdate) -> dict:
        self._settings = {
            **self._settings,
            "focus_minutes": payload.focus_minutes,
            "short_break_minutes": payload.short_break_minutes,
            "long_break_minutes": payload.long_break_minutes,
            "long_break_every": payload.long_break_every,
            "updated_at": datetime.now(tz=UTC),
        }
        return self._settings

    def get_current(self) -> dict | None:
        candidates = [
            session
            for session in self._sessions.values()
            if session["status"] in {"running", "paused"}
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda item: item["created_at"], reverse=True)
        return candidates[0]

    def start(self, payload: PomodoroSessionStart) -> dict:
        if self.get_current() is not None:
            raise PomodoroSessionStateError("active session already exists")

        session_type = payload.session_type
        default_seconds = {
            "focus": self._settings["focus_minutes"] * 60,
            "short_break": self._settings["short_break_minutes"] * 60,
            "long_break": self._settings["long_break_minutes"] * 60,
        }
        planned_seconds = payload.planned_seconds or default_seconds[session_type]
        now = datetime.now(tz=UTC)
        session_id = str(uuid4())

        session = {
            "id": session_id,
            "user_id": "00000000-0000-0000-0000-000000000001",
            "title": payload.title.strip(),
            "session_type": session_type,
            "planned_seconds": planned_seconds,
            "actual_seconds": 0,
            "started_at": now,
            "ended_at": None,
            "status": "running",
            "cycle_index": payload.cycle_index,
            "created_at": now,
            "tags": payload.tags,
            "remaining_seconds": planned_seconds,
        }
        self._sessions[session_id] = session
        return session

    def pause(self, session_id: str) -> dict:
        session = self._get_session_or_error(session_id)
        if session["status"] != "running":
            raise PomodoroSessionStateError("session is not running")

        elapsed = min(session["planned_seconds"], max(session["actual_seconds"], 60))
        updated = {
            **session,
            "actual_seconds": elapsed,
            "status": "paused",
            "remaining_seconds": max(0, session["planned_seconds"] - elapsed),
        }
        self._sessions[session_id] = updated
        return updated

    def resume(self, session_id: str) -> dict:
        session = self._get_session_or_error(session_id)
        if session["status"] != "paused":
            raise PomodoroSessionStateError("session is not paused")

        updated = {
            **session,
            "status": "running",
            "started_at": datetime.now(tz=UTC),
        }
        self._sessions[session_id] = updated
        return updated

    def update_session(self, session_id: str, payload: PomodoroSessionUpdate) -> dict:
        session = self._get_session_or_error(session_id)
        if session["status"] not in {"running", "paused"}:
            raise PomodoroSessionStateError("session is already finished")

        updated = {
            **session,
            "title": (payload.title if payload.title is not None else session["title"]).strip(),
            "tags": payload.tags if payload.tags is not None else session["tags"],
        }
        self._sessions[session_id] = updated
        return updated

    def finish(self, session_id: str) -> dict:
        return self._close(session_id, "completed")

    def cancel(self, session_id: str) -> dict:
        return self._close(session_id, "cancelled")

    def list_sessions(self, limit: int = 100) -> list[dict]:
        rows = sorted(
            self._sessions.values(),
            key=lambda row: row["created_at"],
            reverse=True,
        )
        return rows[: max(1, limit)]

    def summary(self, group_by: str) -> list[dict]:
        bucket: dict[date, dict] = {}
        for session in self._sessions.values():
            if session["status"] != "completed" or session["session_type"] != "focus":
                continue
            ended_at = session["ended_at"]
            if ended_at is None:
                continue
            ended_day = ended_at.date()
            if group_by == "week":
                period_start = ended_day - timedelta(days=ended_day.weekday())
            elif group_by == "month":
                period_start = ended_day.replace(day=1)
            else:
                period_start = ended_day

            current = bucket.setdefault(
                period_start,
                {
                    "period_start": period_start,
                    "focus_sessions": 0,
                    "focus_seconds": 0,
                },
            )
            current["focus_sessions"] += 1
            current["focus_seconds"] += int(session["actual_seconds"])

        return [bucket[key] for key in sorted(bucket.keys(), reverse=True)]

    def _close(self, session_id: str, status: str) -> dict:
        session = self._get_session_or_error(session_id)
        if session["status"] not in {"running", "paused"}:
            raise PomodoroSessionStateError("session is already finished")

        planned = int(session["planned_seconds"])
        actual = min(planned, max(int(session["actual_seconds"]), planned))
        updated = {
            **session,
            "actual_seconds": actual,
            "status": status,
            "ended_at": datetime.now(tz=UTC),
            "remaining_seconds": 0,
        }
        self._sessions[session_id] = updated
        return updated

    def _get_session_or_error(self, session_id: str) -> dict:
        session = self._sessions.get(session_id)
        if session is None:
            raise PomodoroSessionNotFoundError("pomodoro session not found")
        return session


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """依存性オーバーライドをテストごとに初期化する。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_pomodoro_session_state_flow() -> None:
    """開始・一時停止・再開・更新・完了・集計の導線が API 経由で動作する。"""

    service = InMemoryPomodoroService()
    app.dependency_overrides[get_pomodoro_service] = lambda: service

    start_response = client.post(
        "/api/v1/pomodoro/start",
        json={
            "title": "Deep work",
            "session_type": "focus",
            "cycle_index": 1,
            "tags": ["work"],
        },
    )
    assert start_response.status_code == 201
    session_id = start_response.json()["id"]

    current_response = client.get("/api/v1/pomodoro/current")
    assert current_response.status_code == 200
    assert current_response.json()["status"] == "running"

    pause_response = client.post(f"/api/v1/pomodoro/{session_id}/pause")
    assert pause_response.status_code == 200
    assert pause_response.json()["status"] == "paused"

    resume_response = client.post(f"/api/v1/pomodoro/{session_id}/resume")
    assert resume_response.status_code == 200
    assert resume_response.json()["status"] == "running"

    update_response = client.put(
        f"/api/v1/pomodoro/{session_id}",
        json={"title": "Deep work updated", "tags": ["focus"]},
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Deep work updated"

    finish_response = client.post(f"/api/v1/pomodoro/{session_id}/finish")
    assert finish_response.status_code == 200
    assert finish_response.json()["status"] == "completed"

    summary_response = client.get("/api/v1/pomodoro/summary?group_by=day")
    assert summary_response.status_code == 200
    assert summary_response.json()[0]["focus_sessions"] == 1


def test_pomodoro_start_conflicts_when_active_session_exists() -> None:
    """実行中セッションがある場合、2回目の開始は 409 になる。"""

    service = InMemoryPomodoroService()
    app.dependency_overrides[get_pomodoro_service] = lambda: service

    first = client.post(
        "/api/v1/pomodoro/start",
        json={
            "title": "first",
            "session_type": "focus",
            "cycle_index": 1,
            "tags": [],
        },
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/pomodoro/start",
        json={
            "title": "second",
            "session_type": "focus",
            "cycle_index": 1,
            "tags": [],
        },
    )
    assert second.status_code == 409
    assert second.json() == {"detail": "active session already exists"}
