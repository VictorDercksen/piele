"""Application settings loaded from environment variables (and a local .env)."""

from functools import lru_cache

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"
    # Comma-separated exact origins, e.g. "http://localhost:4200,https://app.example.com".
    allowed_origins_raw: str = Field(default="", alias="ALLOWED_ORIGINS")
    # SecretStr keeps the credential out of repr() and logs.
    database_url: SecretStr | None = None
    supabase_url: str | None = None
    supabase_jwt_audience: str = "authenticated"
    # Legacy shared JWT secret. Leave unset for projects on asymmetric signing keys (JWKS).
    supabase_jwt_secret: SecretStr | None = None
    # Server-only Storage credential for evidence upload grants and playback URLs.
    supabase_service_role_key: SecretStr | None = None
    supabase_storage_bucket: str = "evidence"
    evidence_max_bytes: int = 50 * 1024 * 1024
    evidence_upload_ttl_seconds: int = 2 * 60 * 60
    evidence_playback_ttl_seconds: int = 10 * 60

    # Match centre providers.
    urc_graphql_url: str = "https://www.unitedrugby.com/graphql"
    weather_api_url: str = "https://api.open-meteo.com/v1/forecast"
    external_timeout_seconds: float = 6.0

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.allowed_origins_raw.split(",")]
        return [o for o in origins if o and o != "*"]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _production_requirements(self) -> "Settings":
        """Fail at startup rather than serve production with a partial configuration."""
        if not self.is_production:
            return self
        problems = []
        if not self.allowed_origins:
            problems.append("ALLOWED_ORIGINS is empty")
        elif any(not o.startswith("https://") for o in self.allowed_origins):
            problems.append("ALLOWED_ORIGINS must use https")
        if self.database_url is None or not self.database_url.get_secret_value():
            problems.append("DATABASE_URL is not set")
        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
