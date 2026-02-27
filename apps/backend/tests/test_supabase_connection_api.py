"""依存性オーバーライドを使った Supabase DB ヘルス API テスト。"""

import pytest
from app.main import app
from app.supabase_health import get_supabase_health_service
from fastapi.testclient import TestClient

client = TestClient(app)


class FakeSupabaseHealthService:
    """Supabase ヘルスチェック結果を制御するテストダブル。"""

    def check(self) -> dict:
        """ヘルスチェック成功 payload を返す。"""

        return {"checked_table": "users", "row_count": 0, "total_count": 0}


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """依存性オーバーライドがテスト間で漏れないようにする。"""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_supabase_connection_success():
    """ヘルスエンドポイントは正規化済みの成功レスポンスを返す。"""

    app.dependency_overrides[get_supabase_health_service] = FakeSupabaseHealthService

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "supabase",
        "checked_table": "users",
        "row_count": 0,
        "total_count": 0,
    }


def test_supabase_connection_missing_config():
    """サービスの ValueError は HTTP 503 に変換される。"""

    class MissingConfigService(FakeSupabaseHealthService):
        def check(self) -> dict:
            raise ValueError("missing config")

    app.dependency_overrides[get_supabase_health_service] = MissingConfigService

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 503
    assert response.json() == {"detail": "missing config"}


def test_supabase_connection_failure():
    """予期しないサービスエラーは HTTP 502 に変換される。"""

    class FailingService(FakeSupabaseHealthService):
        def check(self) -> dict:
            raise RuntimeError("network error")

    app.dependency_overrides[get_supabase_health_service] = FailingService

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 502
    assert response.json() == {"detail": "Supabase connection check failed: network error"}
