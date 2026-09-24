import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db import API_ROOT, describe_db_error, normalise_database_url
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
    assert response.headers["x-content-type-options"] == "nosniff"


def test_health_database_error_hides_details() -> None:
    client = make_client(database_url="postgresql://user:secret@127.0.0.1:1/postgres?connect_timeout=2")
    response = client.get("/v1/health")
    assert response.status_code == 503
    assert response.json()["database"] == "error"
    assert "secret" not in response.text and "127.0.0.1" not in response.text


def test_database_error_logs_reason_without_password(caplog) -> None:
    client = make_client(database_url="postgresql://user:secret@127.0.0.1:1/postgres?connect_timeout=2")
    with caplog.at_level("WARNING", logger="app.routers.health"):
        client.get("/v1/health")
    logged = caplog.text
    assert "Database health check failed: OperationalError: " in logged
    assert "connection" in logged.lower()
    assert "secret" not in logged


def test_describe_db_error_redacts_urls_and_passwords() -> None:
    message = describe_db_error(RuntimeError("bad postgresql://u:pw@h/db password=pw2 end"))
    assert message == "RuntimeError: bad [url] password=[redacted] end"


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


def test_relative_root_certificate_resolves_to_api_directory() -> None:
    url = normalise_database_url(
        "postgresql://u:p@h/db?sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt"
    )
    cert = API_ROOT / "certs" / "supabase-prod-ca-2021.crt"
    assert make_url(url).query["sslrootcert"] == str(cert)
    assert cert.is_file()


PRODUCTION = {
    "environment": "production",
    "ALLOWED_ORIGINS": "https://piele.example",
    "database_url": "postgresql://u:p@h:6543/postgres",
}


def test_production_settings_accept_complete_configuration() -> None:
    assert Settings(_env_file=None, **PRODUCTION).is_production


@pytest.mark.parametrize(
    ("override", "problem"),
    [
        ({"ALLOWED_ORIGINS": ""}, "ALLOWED_ORIGINS is empty"),
        ({"ALLOWED_ORIGINS": "http://piele.example"}, "must use https"),
        ({"database_url": None}, "DATABASE_URL is not set"),
    ],
)
def test_production_settings_reject_partial_configuration(override, problem) -> None:
    with pytest.raises(ValidationError, match=problem):
        Settings(_env_file=None, **{**PRODUCTION, **override})


def test_production_hides_interactive_docs() -> None:
    assert make_client().get("/docs").status_code == 200
    production = TestClient(create_app(Settings(_env_file=None, **PRODUCTION)))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert production.get(path).status_code == 404
