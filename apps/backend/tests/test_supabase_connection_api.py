"""API tests for Supabase DB health handler using dependency overrides."""

import pytest
from app.main import app
from app.supabase_health import get_supabase_health_service
from fastapi.testclient import TestClient

client = TestClient(app)


class FakeSupabaseHealthService:
    """Test double for controlling Supabase health check results."""

    def check(self) -> dict:
        """Return successful health payload."""

        return {"checked_table": "users", "row_count": 0, "total_count": 0}


@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """Ensure dependency overrides do not leak across tests."""

    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_supabase_connection_success():
    """GET health endpoint returns normalized success response."""

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
    """ValueError from service is translated to HTTP 503."""

    class MissingConfigService(FakeSupabaseHealthService):
        def check(self) -> dict:
            raise ValueError("missing config")

    app.dependency_overrides[get_supabase_health_service] = MissingConfigService

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 503
    assert response.json() == {"detail": "missing config"}


def test_supabase_connection_failure():
    """Unexpected service errors are translated to HTTP 502."""

    class FailingService(FakeSupabaseHealthService):
        def check(self) -> dict:
            raise RuntimeError("network error")

    app.dependency_overrides[get_supabase_health_service] = FailingService

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 502
    assert response.json() == {"detail": "Supabase connection check failed: network error"}
