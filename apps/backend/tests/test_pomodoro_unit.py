"""pomodoro の純粋ロジックを検証する単体テスト。"""

from datetime import UTC, date, datetime

import pytest
from app import pomodoro


def _make_session(
    session_id: str,
    ended_at: datetime,
    *,
    session_type: str = "focus",
    status: str = "completed",
    actual_seconds: int = 1500,
) -> pomodoro.PomodoroSessionOut:
    """集計テスト用のセッションモデルを生成する。"""

    return pomodoro.PomodoroSessionOut(
        id=session_id,
        user_id="00000000-0000-0000-0000-000000000001",
        title="Focus",
        session_type=session_type,
        planned_seconds=1500,
        actual_seconds=actual_seconds,
        started_at=ended_at,
        ended_at=ended_at,
        status=status,
        cycle_index=1,
        created_at=ended_at,
        tags=[],
        remaining_seconds=0,
    )


def test_normalize_tags_removes_blank_and_duplicate_values() -> None:
    """タグ正規化は空白除去と重複排除を行う。"""

    assert pomodoro._normalize_tags([" work ", "idea", "", "work", "deep"]) == [
        "work",
        "idea",
        "deep",
    ]


def test_compute_elapsed_seconds_includes_running_duration() -> None:
    """running 状態は開始時刻からの経過秒を累積実績に加算する。"""

    row = {
        "actual_seconds": 120,
        "status": "running",
        "started_at": "2026-03-01T09:59:00Z",
    }

    now = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)

    assert pomodoro._compute_elapsed_seconds(row=row, now=now) == 180


def test_remaining_seconds_never_becomes_negative() -> None:
    """残り秒数は 0 未満にならない。"""

    row = {
        "planned_seconds": 300,
        "actual_seconds": 250,
        "status": "running",
        "started_at": "2026-03-01T09:59:00Z",
    }

    now = datetime(2026, 3, 1, 10, 5, tzinfo=UTC)

    assert pomodoro._remaining_seconds(row=row, now=now) == 0


def test_run_with_disconnect_retry_retries_once_on_disconnected_error(monkeypatch) -> None:
    """切断エラーのみ 1 回再試行する。"""

    reset_calls: list[str] = []
    monkeypatch.setattr(pomodoro, "_reset_client_cache", lambda: reset_calls.append("called"))

    attempts = {"count": 0}

    def flaky_operation() -> str:
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("Server disconnected while reading")
        return "ok"

    result = pomodoro._run_with_disconnect_retry(flaky_operation)

    assert result == "ok"
    assert attempts["count"] == 2
    assert reset_calls == ["called"]


def test_run_with_disconnect_retry_does_not_retry_other_errors() -> None:
    """切断以外の例外はそのまま送出する。"""

    def raise_permission_error() -> str:
        raise RuntimeError("permission denied")

    with pytest.raises(RuntimeError, match="permission denied"):
        pomodoro._run_with_disconnect_retry(raise_permission_error)


def test_get_pomodoro_summary_groups_by_week(monkeypatch) -> None:
    """完了済み focus セッションを週単位で集計する。"""

    sessions = [
        _make_session(
            "11111111-1111-1111-1111-111111111111",
            datetime(2026, 3, 2, 10, 0, tzinfo=UTC),
        ),
        _make_session(
            "22222222-2222-2222-2222-222222222222",
            datetime(2026, 3, 3, 10, 0, tzinfo=UTC),
            actual_seconds=1200,
        ),
        _make_session(
            "33333333-3333-3333-3333-333333333333",
            datetime(2026, 3, 1, 10, 0, tzinfo=UTC),
            session_type="short_break",
        ),
    ]
    monkeypatch.setattr(pomodoro, "list_pomodoro_sessions", lambda limit=500: sessions)

    summary = pomodoro.get_pomodoro_summary(group_by="week")

    assert len(summary) == 1
    assert summary[0].period_start == date(2026, 3, 2)
    assert summary[0].focus_sessions == 2
    assert summary[0].focus_seconds == 2700
