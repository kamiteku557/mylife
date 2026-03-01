"""Web Push を使ったポモドーロ背景通知のサービス層。"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any, TypeVar

from pydantic import BaseModel, Field
from pywebpush import WebPushException, webpush
from supabase import Client, create_client

from app.config import get_settings
from app.memo_logs import DEMO_USER_ID

OVERDUE_NOTIFY_STEP_SECONDS = 15 * 60
T = TypeVar("T")
logger = logging.getLogger(__name__)


class PushSubscriptionKeys(BaseModel):
    """Push subscription の鍵情報。"""

    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class PushSubscriptionUpsert(BaseModel):
    """Push subscription 登録 payload。"""

    endpoint: str = Field(min_length=1)
    keys: PushSubscriptionKeys


class PushSubscriptionDelete(BaseModel):
    """Push subscription 解除 payload。"""

    endpoint: str = Field(min_length=1)


class PushDispatchResult(BaseModel):
    """dispatch API の実行結果。"""

    checked_sessions: int
    sent_notifications: int
    deactivated_subscriptions: int


class PushNotificationService:
    """Push subscription 管理と通知 dispatch を提供するサービス。"""

    def register_subscription(self, payload: PushSubscriptionUpsert) -> None:
        """Push subscription を登録または更新する。"""

        register_push_subscription(payload)

    def unregister_subscription(self, payload: PushSubscriptionDelete) -> None:
        """Push subscription を無効化する。"""

        unregister_push_subscription(payload)

    def dispatch_due_notifications(self) -> PushDispatchResult:
        """通知期限に達したセッションに Push を送信する。"""

        return dispatch_due_notifications()


def get_push_notification_service() -> PushNotificationService:
    """依存性注入用の Push 通知サービスを返す。"""

    return PushNotificationService()


@lru_cache(maxsize=1)
def _get_client() -> Client:
    """Supabase クライアントを 1 件キャッシュして再利用する。"""

    settings = get_settings()
    api_key = settings.supabase_service_role_key or settings.supabase_anon_key
    if not settings.supabase_url or not api_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required"
        )
    return create_client(settings.supabase_url, api_key)


@lru_cache(maxsize=1)
def _ensure_demo_user_once() -> None:
    """固定デモユーザー作成を 1 回に抑える。"""

    _get_client().table("users").upsert(
        {"id": DEMO_USER_ID, "display_name": "Demo User"},
        on_conflict="id",
    ).execute()


def _run_with_disconnect_retry(operation: Callable[[], T]) -> T:
    """Supabase 一時切断時のみ 1 回だけ再試行する。"""

    try:
        return operation()
    except Exception as exc:
        if "Server disconnected" not in str(exc):
            raise
        # 一時切断時のみクライアントを再生成して再試行する。
        _get_client.cache_clear()
        return operation()


def _parse_datetime(value: str | None) -> datetime:
    """Supabase のタイムスタンプ文字列を UTC datetime へ変換する。"""

    if not value:
        return datetime.now(tz=UTC)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def compute_notification_step(planned_end_at: datetime, now: datetime) -> int:
    """予定終了時刻基準の通知ステップを返す。"""

    elapsed_sec = int((now - planned_end_at).total_seconds())
    if elapsed_sec < 0:
        return -1
    return elapsed_sec // OVERDUE_NOTIFY_STEP_SECONDS


def build_notification_payload(step: int, session_type: str) -> tuple[str, str]:
    """通知ステップに応じたタイトルと本文を返す。"""

    phase_label = "作業" if session_type == "focus" else "休憩"
    if step <= 0:
        return (
            "ポモドーロ時間に到達しました",
            f"{phase_label}セッションが 00:00 になりました。",
        )
    overrun_minutes = step * 15
    return (
        "ポモドーロ超過時間のお知らせ",
        f"計画時間を {overrun_minutes} 分超過しています。",
    )


def _assert_vapid_settings() -> tuple[str, str, str]:
    """Push 送信に必要な VAPID 設定を検証して返す。"""

    settings = get_settings()
    public_key = settings.web_push_vapid_public_key.strip()
    private_key = settings.web_push_vapid_private_key.strip()
    subject = settings.web_push_subject.strip()
    if not public_key or not private_key or not subject:
        raise ValueError(
            "WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_SUBJECT are required"
        )
    return public_key, private_key, subject


def register_push_subscription(payload: PushSubscriptionUpsert) -> None:
    """Push subscription を upsert する。"""

    client = _get_client()
    _ensure_demo_user_once()

    now_iso = datetime.now(tz=UTC).isoformat()
    client.table("web_push_subscriptions").upsert(
        {
            "user_id": DEMO_USER_ID,
            "endpoint": payload.endpoint,
            "p256dh": payload.keys.p256dh,
            "auth": payload.keys.auth,
            "is_active": True,
            "updated_at": now_iso,
        },
        on_conflict="user_id,endpoint",
    ).execute()


def unregister_push_subscription(payload: PushSubscriptionDelete) -> None:
    """Push subscription を無効化する。"""

    client = _get_client()
    _ensure_demo_user_once()

    client.table("web_push_subscriptions").update(
        {
            "is_active": False,
            "updated_at": datetime.now(tz=UTC).isoformat(),
        }
    ).eq("user_id", DEMO_USER_ID).eq("endpoint", payload.endpoint).execute()


def _load_active_subscriptions(client: Client) -> list[dict[str, Any]]:
    """有効な Push subscription 一覧を返す。"""

    response = (
        client.table("web_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", DEMO_USER_ID)
        .eq("is_active", True)
        .execute()
    )
    return response.data or []


def _load_running_sessions(client: Client) -> list[dict[str, Any]]:
    """通知判定対象の running セッション一覧を返す。"""

    response = (
        client.table("pomodoro_sessions")
        .select("id, title, session_type, planned_end_at, last_notified_step")
        .eq("user_id", DEMO_USER_ID)
        .eq("status", "running")
        .execute()
    )
    return response.data or []


def _deactivate_subscription(client: Client, subscription_id: str) -> None:
    """送信不能になった subscription を無効化する。"""

    client.table("web_push_subscriptions").update(
        {
            "is_active": False,
            "updated_at": datetime.now(tz=UTC).isoformat(),
        }
    ).eq("id", subscription_id).eq("user_id", DEMO_USER_ID).execute()


def _mark_session_notified(client: Client, session_id: str, step: int) -> None:
    """指定ステップの通知送信済み状態をセッションへ記録する。"""

    client.table("pomodoro_sessions").update({"last_notified_step": step}).eq("id", session_id).eq(
        "user_id", DEMO_USER_ID
    ).execute()


def dispatch_due_notifications(now: datetime | None = None) -> PushDispatchResult:
    """通知期限到達セッションに Push を送信する。"""

    def _dispatch() -> PushDispatchResult:
        _public_key, private_key, subject = _assert_vapid_settings()
        client = _get_client()
        _ensure_demo_user_once()

        current = now or datetime.now(tz=UTC)
        subscriptions = _load_active_subscriptions(client)
        sessions = _load_running_sessions(client)
        if not subscriptions or not sessions:
            return PushDispatchResult(
                checked_sessions=len(sessions),
                sent_notifications=0,
                deactivated_subscriptions=0,
            )

        sent_notifications = 0
        deactivated_subscriptions = 0
        deactivated_ids: set[str] = set()

        for session in sessions:
            planned_end_raw = session.get("planned_end_at")
            if not isinstance(planned_end_raw, str) or not planned_end_raw:
                continue
            planned_end_at = _parse_datetime(planned_end_raw)
            step = compute_notification_step(planned_end_at, current)
            if step < 0:
                continue

            last_step = int(session.get("last_notified_step") or -1)
            if step <= last_step:
                continue

            title, body = build_notification_payload(
                step,
                str(session.get("session_type") or "focus"),
            )
            payload = json.dumps(
                {
                    "title": title,
                    "body": body,
                    "tag": f"pomodoro-{session['id']}-step-{step}",
                }
            )

            sent_in_this_step = False
            for subscription in subscriptions:
                subscription_id = str(subscription["id"])
                if subscription_id in deactivated_ids:
                    continue

                subscription_info = {
                    "endpoint": subscription["endpoint"],
                    "keys": {
                        "p256dh": subscription["p256dh"],
                        "auth": subscription["auth"],
                    },
                }
                try:
                    webpush(
                        subscription_info=subscription_info,
                        data=payload,
                        vapid_private_key=private_key,
                        vapid_claims={"sub": subject},
                    )
                    sent_notifications += 1
                    sent_in_this_step = True
                except WebPushException as exc:
                    status_code = getattr(getattr(exc, "response", None), "status_code", None)
                    if status_code in {404, 410}:
                        _deactivate_subscription(client, subscription_id)
                        deactivated_ids.add(subscription_id)
                        deactivated_subscriptions += 1
                        continue
                    logger.warning(
                        "web push send failed: subscription_id=%s status=%s",
                        subscription_id,
                        status_code,
                    )
                except Exception as exc:  # noqa: BLE001
                    # 個別送信失敗で dispatch 全体を落とさない。
                    logger.warning(
                        "web push send raised unexpected error: subscription_id=%s error=%s",
                        subscription_id,
                        exc,
                    )

            if sent_in_this_step:
                _mark_session_notified(client, str(session["id"]), step)

        return PushDispatchResult(
            checked_sessions=len(sessions),
            sent_notifications=sent_notifications,
            deactivated_subscriptions=deactivated_subscriptions,
        )

    return _run_with_disconnect_retry(_dispatch)
