"""Runtime database engine for the Supabase transaction pooler."""

from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url

from app.config import Settings

# apps/api. Relative sslrootcert paths resolve here, so certs/ works locally and on Vercel.
API_ROOT = Path(__file__).resolve().parents[1]

_engines: dict[str, Engine] = {}


def normalise_database_url(raw: str) -> str:
    """Use the psycopg 3 driver and require TLS unless sslmode is already given.

    For certificate verification, add `sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt`.
    """
    url = make_url(raw)
    if url.drivername in ("postgresql", "postgres"):
        url = url.set(drivername="postgresql+psycopg")
    if "sslmode" not in url.query:
        url = url.update_query_dict({"sslmode": "require"})
    root_cert = url.query.get("sslrootcert")
    if isinstance(root_cert, str) and root_cert != "system" and not Path(root_cert).is_absolute():
        url = url.update_query_dict({"sslrootcert": str(API_ROOT / root_cert)})
    return url.render_as_string(hide_password=False)


def get_engine(settings: Settings) -> Engine | None:
    """Return a lazily created engine, or None when DATABASE_URL is unset."""
    if settings.database_url is None:
        return None
    raw = settings.database_url.get_secret_value()
    if not raw:
        return None
    engine = _engines.get(raw)
    if engine is None:
        engine = create_engine(
            normalise_database_url(raw),
            # Transaction pooler mode does not support prepared statements.
            connect_args={"prepare_threshold": None},
            pool_size=1,
            max_overflow=0,
            pool_pre_ping=True,
        )
        _engines[raw] = engine
    return engine
