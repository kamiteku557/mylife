"""push_notifications の純粋ロジックを検証する単体テスト。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app import push_notifications


def test_compute_notification_step_returns_minus_one_before_end() -> None:
    """予定終了前は通知対象外（-1）になる。"""

    planned_end = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
    now = planned_end - timedelta(seconds=1)

    assert push_notifications.compute_notification_step(planned_end, now) == -1


def test_compute_notification_step_counts_overrun_in_15min_steps() -> None:
    """予定終了後は15分単位で通知ステップを進める。"""

    planned_end = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)

    assert push_notifications.compute_notification_step(planned_end, planned_end) == 0
    assert (
        push_notifications.compute_notification_step(
            planned_end,
            planned_end + timedelta(minutes=15),
        )
        == 1
    )
    assert (
        push_notifications.compute_notification_step(
            planned_end,
            planned_end + timedelta(minutes=31),
        )
        == 2
    )


def test_build_notification_payload_returns_reached_message_on_step_zero() -> None:
    """ステップ0は00:00到達通知文面になる。"""

    title, body = push_notifications.build_notification_payload(step=0, session_type="focus")

    assert title == "ポモドーロ時間に到達しました"
    assert "00:00" in body


def test_dispatch_due_notifications_marks_latest_step_only(monkeypatch) -> None:
    """dispatch は最新ステップを1回だけ送信し、送信済みステップを更新する。"""

    now = datetime(2026, 3, 1, 12, 31, tzinfo=UTC)
    planned_end = now - timedelta(minutes=31)
    sent_payloads: list[str] = []
    marked_steps: list[int] = []

    monkeypatch.setattr(
        push_notifications,
        "_assert_vapid_settings",
        lambda: ("public-key", "private-key", "mailto:test@example.com"),
    )
    monkeypatch.setattr(push_notifications, "_get_client", lambda: object())
    monkeypatch.setattr(push_notifications, "_ensure_demo_user_once", lambda: None)
    monkeypatch.setattr(
        push_notifications,
        "_load_active_subscriptions",
        lambda _client: [
            {
                "id": "sub-1",
                "endpoint": "https://example.com/push/endpoint",
                "p256dh": "p256dh-key",
                "auth": "auth-key",
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "_load_running_sessions",
        lambda _client: [
            {
                "id": "session-1",
                "title": "Deep work",
                "session_type": "focus",
                "planned_end_at": planned_end.isoformat(),
                "last_notified_step": 1,
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "webpush",
        lambda **kwargs: sent_payloads.append(str(kwargs["data"])),
    )
    monkeypatch.setattr(
        push_notifications,
        "_mark_session_notified",
        lambda _client, _session_id, step: marked_steps.append(step),
    )

    result = push_notifications.dispatch_due_notifications(now=now)

    assert result.checked_sessions == 1
    assert result.sent_notifications == 1
    assert marked_steps == [2]
    assert len(sent_payloads) == 1


def test_dispatch_due_notifications_skips_when_step_already_notified(monkeypatch) -> None:
    """dispatch は既送信ステップ以下の通知を再送しない。"""

    now = datetime(2026, 3, 1, 12, 15, tzinfo=UTC)
    planned_end = now - timedelta(minutes=15)
    send_count = {"value": 0}

    monkeypatch.setattr(
        push_notifications,
        "_assert_vapid_settings",
        lambda: ("public-key", "private-key", "mailto:test@example.com"),
    )
    monkeypatch.setattr(push_notifications, "_get_client", lambda: object())
    monkeypatch.setattr(push_notifications, "_ensure_demo_user_once", lambda: None)
    monkeypatch.setattr(
        push_notifications,
        "_load_active_subscriptions",
        lambda _client: [
            {
                "id": "sub-1",
                "endpoint": "https://example.com/push/endpoint",
                "p256dh": "p256dh-key",
                "auth": "auth-key",
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "_load_running_sessions",
        lambda _client: [
            {
                "id": "session-1",
                "title": "Deep work",
                "session_type": "focus",
                "planned_end_at": planned_end.isoformat(),
                "last_notified_step": 1,
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "webpush",
        lambda **_kwargs: send_count.__setitem__("value", send_count["value"] + 1),
    )

    result = push_notifications.dispatch_due_notifications(now=now)

    assert result.sent_notifications == 0
    assert send_count["value"] == 0


def test_dispatch_due_notifications_skips_session_without_planned_end_at(monkeypatch) -> None:
    """planned_end_at が欠損した running セッションは通知対象にしない。"""

    now = datetime(2026, 3, 1, 12, 15, tzinfo=UTC)
    send_count = {"value": 0}

    monkeypatch.setattr(
        push_notifications,
        "_assert_vapid_settings",
        lambda: ("public-key", "private-key", "mailto:test@example.com"),
    )
    monkeypatch.setattr(push_notifications, "_get_client", lambda: object())
    monkeypatch.setattr(push_notifications, "_ensure_demo_user_once", lambda: None)
    monkeypatch.setattr(
        push_notifications,
        "_load_active_subscriptions",
        lambda _client: [
            {
                "id": "sub-1",
                "endpoint": "https://example.com/push/endpoint",
                "p256dh": "p256dh-key",
                "auth": "auth-key",
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "_load_running_sessions",
        lambda _client: [
            {
                "id": "session-1",
                "title": "Deep work",
                "session_type": "focus",
                "planned_end_at": None,
                "last_notified_step": -1,
            }
        ],
    )
    monkeypatch.setattr(
        push_notifications,
        "webpush",
        lambda **_kwargs: send_count.__setitem__("value", send_count["value"] + 1),
    )

    result = push_notifications.dispatch_due_notifications(now=now)

    assert result.sent_notifications == 0
    assert send_count["value"] == 0
