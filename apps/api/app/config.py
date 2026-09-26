"""Application settings loaded from environment variables (and a local .env)."""

from functools import lru_cache

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_AGENT_TOKEN_LENGTH = 32


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
    # Profile photos share the bucket under avatars/. The browser uploads a 384 px JPEG.
    profile_photo_max_bytes: int = 512 * 1024
    profile_photo_url_ttl_seconds: int = 5 * 60
    # League emblems share the bucket under emblems/<league id>/. The browser uploads a
    # 512 px image; the signed URL lasts a day because the league list shows every emblem.
    league_emblem_max_bytes: int = 1024 * 1024
    league_emblem_url_ttl_seconds: int = 24 * 60 * 60

    # Match centre providers.
    urc_graphql_url: str = "https://www.unitedrugby.com/graphql"
    weather_api_url: str = "https://api.open-meteo.com/v1/forecast"
    # Fallback live scores when the URC feed fails.
    espn_scoreboard_url: str = "https://site.api.espn.com/apis/site/v2/sports/rugby/270557/scoreboard"
    external_timeout_seconds: float = 6.0

    # Bearer token for the preview agent's /v1/agent routes. Unset turns those routes off.
    piele_agent_token: SecretStr | None = None

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
        token = self.piele_agent_token.get_secret_value() if self.piele_agent_token else ""
        if token and len(token) < MIN_AGENT_TOKEN_LENGTH:
            problems.append(f"PIELE_AGENT_TOKEN must be at least {MIN_AGENT_TOKEN_LENGTH} characters")
        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
