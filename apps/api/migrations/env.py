"""Alembic environment.

Migrations use MIGRATION_DATABASE_URL, a Supabase session-pooler or direct
connection. Never point this at the runtime transaction pooler (port 6543).
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.db import normalise_database_url
from app.matchcentre.cache import metadata as snapshot_metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Core tables only. Point this at the declarative Base.metadata once ORM models exist.
target_metadata = snapshot_metadata


def _migration_url() -> str:
    raw = os.environ.get("MIGRATION_DATABASE_URL")
    if not raw:
        raise RuntimeError("MIGRATION_DATABASE_URL is not set.")
    return normalise_database_url(raw)


def run_migrations_offline() -> None:
    context.configure(
        url=_migration_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_migration_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
