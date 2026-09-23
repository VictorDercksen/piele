"""Application settings loaded from environment variables (and a local .env)."""

from functools import lru_cache

from pydantic import Field, SecretStr
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

    # Match centre providers.
    urc_graphql_url: str = "https://www.unitedrugby.com/graphql"
    weather_api_url: str = "https://api.open-meteo.com/v1/forecast"
    external_timeout_seconds: float = 6.0

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.allowed_origins_raw.split(",")]
        return [o for o in origins if o and o != "*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
