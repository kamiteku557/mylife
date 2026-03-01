"""Push 通知 API のハンドラーテスト。"""

from __future__ import annotations

import pytest
from app import main as main_module
from app.main import app
from app.push_notifications import get_push_notification_service
from fastapi.testclient import TestClient

client = TestClient(app)


class FakePushNotificationService:
    """Push 通知依存を差し替えるテストダブル。"""

    def __init__(self) -> None:
        self.registered_endpoints: list[str] = []
        self.unregistered_endpoints: list[str] = []

    def register_subscription(self, payload: object) -> None:
        endpoint = getattr(payload, "endpoint", "")
        self.registered_endpoints.append(str(endpoint))

    def unregister_subscription(self, payload: object) -> None:
        endpoint = getattr(payload, "endpoint", "")
        self.unregistered_endpoints.append(str(endpoint))

    def dispatch_due_notifications(self) -> dict[str, int]:
        return {
            "checked_sessions": 2,
            "sent_notifications": 1,
            "deactivated_subscriptions": 0,
        }


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """依存性オーバーライドを毎テスト前後で初期化する。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def dispatch_token() -> str:
    """dispatch API 用トークンを一時設定する。"""

    token = "test-dispatch-token"
    original = main_module.settings.push_dispatch_token
    main_module.settings.push_dispatch_token = token
    try:
        yield token
    finally:
        main_module.settings.push_dispatch_token = original


def test_register_push_subscription_returns_no_content() -> None:
    """POST /push/subscriptions は 204 を返す。"""

    fake = FakePushNotificationService()
    app.dependency_overrides[get_push_notification_service] = lambda: fake

    response = client.post(
        "/api/v1/push/subscriptions",
        json={
            "endpoint": "https://example.com/push/endpoint",
            "keys": {
                "p256dh": "p256dh-key",
                "auth": "auth-key",
            },
        },
    )

    assert response.status_code == 204
    assert fake.registered_endpoints == ["https://example.com/push/endpoint"]


def test_unregister_push_subscription_returns_no_content() -> None:
    """DELETE /push/subscriptions は 204 を返す。"""

    fake = FakePushNotificationService()
    app.dependency_overrides[get_push_notification_service] = lambda: fake

    response = client.request(
        "DELETE",
        "/api/v1/push/subscriptions",
        json={"endpoint": "https://example.com/push/endpoint"},
    )

    assert response.status_code == 204
    assert fake.unregistered_endpoints == ["https://example.com/push/endpoint"]


def test_push_dispatch_requires_valid_token(dispatch_token: str) -> None:
    """POST /ops/push-dispatch はトークン不一致で 401 を返す。"""

    fake = FakePushNotificationService()
    app.dependency_overrides[get_push_notification_service] = lambda: fake

    response = client.post(
        "/api/v1/ops/push-dispatch",
        headers={"X-Dispatch-Token": "wrong-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "unauthorized dispatch token"}


def test_push_dispatch_returns_summary_with_valid_token(dispatch_token: str) -> None:
    """POST /ops/push-dispatch は集計結果を返す。"""

    fake = FakePushNotificationService()
    app.dependency_overrides[get_push_notification_service] = lambda: fake

    response = client.post(
        "/api/v1/ops/push-dispatch",
        headers={"X-Dispatch-Token": dispatch_token},
    )

    assert response.status_code == 200
    assert response.json() == {
        "checked_sessions": 2,
        "sent_notifications": 1,
        "deactivated_subscriptions": 0,
    }
