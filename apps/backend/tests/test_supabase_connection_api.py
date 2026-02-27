from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_supabase_connection_success(monkeypatch):
    monkeypatch.setattr(
        "app.main.check_supabase_db_connection",
        lambda: {"checked_table": "users", "row_count": 0, "total_count": 0},
    )

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "supabase",
        "checked_table": "users",
        "row_count": 0,
        "total_count": 0,
    }


def test_supabase_connection_missing_config(monkeypatch):
    def raise_missing_config() -> None:
        raise ValueError("missing config")

    monkeypatch.setattr("app.main.check_supabase_db_connection", raise_missing_config)

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 503
    assert response.json() == {"detail": "missing config"}


def test_supabase_connection_failure(monkeypatch):
    def raise_connection_error() -> None:
        raise RuntimeError("network error")

    monkeypatch.setattr("app.main.check_supabase_db_connection", raise_connection_error)

    response = client.get("/api/v1/ops/supabase-db-health")

    assert response.status_code == 502
    assert response.json() == {"detail": "Supabase connection check failed: network error"}
