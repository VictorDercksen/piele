import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import normalise_database_url
from app.main import create_app

ALLOWED = "http://localhost:4200"


def make_client(**overrides) -> TestClient:
    settings = Settings(_env_file=None, environment="test", ALLOWED_ORIGINS=ALLOWED, **overrides)
    return TestClient(create_app(settings))


@pytest.fixture
def client() -> TestClient:
    return make_client()


def test_health_without_database(client: TestClient) -> None:
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "environment": "test",
        "database": "unconfigured",
        "snapshotCache": "memory",
    }
    assert response.headers["cache-control"] == "no-store"


def test_health_database_error_hides_details() -> None:
    client = make_client(database_url="postgresql://user:secret@127.0.0.1:1/postgres?connect_timeout=2")
    response = client.get("/v1/health")
    assert response.status_code == 503
    assert response.json()["database"] == "error"
    assert "secret" not in response.text and "127.0.0.1" not in response.text


def test_cors_allows_configured_origin(client: TestClient) -> None:
    response = client.get("/v1/health", headers={"Origin": ALLOWED})
    assert response.headers["access-control-allow-origin"] == ALLOWED


def test_cors_ignores_other_origin(client: TestClient) -> None:
    response = client.get("/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_rejects_other_origin(client: TestClient) -> None:
    headers = {"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
    assert client.options("/v1/health", headers=headers).status_code == 400
    headers["Origin"] = ALLOWED
    assert client.options("/v1/health", headers=headers).status_code == 200


def test_request_id_generated_and_echoed(client: TestClient) -> None:
    generated = client.get("/v1/health").headers["x-request-id"]
    assert len(generated) == 32
    echoed = client.get("/v1/health", headers={"X-Request-ID": "abc-123"})
    assert echoed.headers["x-request-id"] == "abc-123"
    unsafe = client.get("/v1/health", headers={"X-Request-ID": "bad id\x7f"})
    assert unsafe.headers["x-request-id"] != "bad id\x7f"


def test_database_url_normalisation() -> None:
    assert normalise_database_url("postgresql://u:p@h:6543/postgres") == (
        "postgresql+psycopg://u:p@h:6543/postgres?sslmode=require"
    )
    assert normalise_database_url("postgresql://u:p@h/db?sslmode=verify-full").endswith("sslmode=verify-full")
