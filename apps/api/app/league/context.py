"""Per-request actor resolution (API rules 1, 2 and 4).

Every domain request runs in one transaction. The verified token subject and email are
set as transaction-local settings first, which is all the row level security policies
allow through until the caller's league is known; then the league is set and the rest of
the request sees only that league's rows.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.engine import Connection

from app.db import get_engine
from app.league import tables as t
from app.league.auth import Claims, TokenError, TokenVerifier

bearer = HTTPBearer(auto_error=False)


@dataclass
class Actor:
    connection: Connection
    request_id: str
    user_id: UUID
    league_id: UUID
    league_name: str
    membership_id: UUID
    display_name: str
    is_captain: bool
    season_id: UUID
    season_name: str
    season_closed_at: datetime | None
    season_membership_id: UUID | None


def set_context(connection: Connection, name: str, value: str | None) -> None:
    connection.execute(
        text("select set_config(:name, :value, true)"), {"name": f"piele.{name}", "value": value or ""}
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def resolve_actor(connection: Connection, claims: Claims, request_id: str) -> Actor:
    set_context(connection, "auth_subject", str(claims.subject))
    set_context(connection, "auth_email", claims.email if claims.email_verified else None)

    user = connection.execute(select(t.users).where(t.users.c.auth_subject == claims.subject)).first()
    if user is None:
        user = connection.execute(
            insert(t.users).values(auth_subject=claims.subject, email=claims.email).returning(t.users)
        ).one()
    elif claims.email and user.email != claims.email:
        connection.execute(
            update(t.users).where(t.users.c.id == user.id).values(email=claims.email, updated_at=func.now())
        )

    membership = connection.execute(
        select(t.league_memberships).where(
            t.league_memberships.c.user_id == user.id, t.league_memberships.c.status == "active"
        )
    ).first()
    claimed = False
    if membership is None and claims.email and claims.email_verified:
        # A verified sign-in with the invited address claims the membership exactly once.
        membership = connection.execute(
            update(t.league_memberships)
            .where(
                t.league_memberships.c.user_id.is_(None),
                t.league_memberships.c.status == "active",
                func.lower(t.league_memberships.c.invited_email) == claims.email,
            )
            .values(user_id=user.id, updated_at=func.now(), version=t.league_memberships.c.version + 1)
            .returning(t.league_memberships)
        ).first()
        claimed = membership is not None
    if membership is None:
        raise HTTPException(
            status_code=403,
            detail={"code": "not_a_member", "message": "This account is not a member of the league."},
        )

    set_context(connection, "league_id", str(membership.league_id))
    league = connection.execute(select(t.leagues).where(t.leagues.c.id == membership.league_id)).one()
    season = connection.execute(
        select(t.seasons).where(t.seasons.c.league_id == league.id, t.seasons.c.status == "active")
    ).first()
    if season is None:
        raise HTTPException(status_code=409, detail={"code": "no_active_season", "message": "No active season."})
    season_membership = connection.execute(
        select(t.season_memberships.c.id).where(
            t.season_memberships.c.season_id == season.id,
            t.season_memberships.c.membership_id == membership.id,
            t.season_memberships.c.status == "active",
        )
    ).scalar_one_or_none()

    actor = Actor(
        connection=connection,
        request_id=request_id,
        user_id=user.id,
        league_id=league.id,
        league_name=league.name,
        membership_id=membership.id,
        display_name=membership.display_name,
        is_captain=league.captain_membership_id == membership.id,
        season_id=season.id,
        season_name=season.name,
        season_closed_at=season.closed_at,
        season_membership_id=season_membership,
    )
    if claimed:
        from app.league import service  # local import: service depends on Actor

        service.record(
            actor,
            action="membership.claimed",
            entity_type="league_membership",
            entity_id=membership.id,
            feed=service.FeedEntry(kind="member_joined", title=f"{membership.display_name} joined the clubhouse."),
        )
    return actor


def actor_dependency(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> Iterator[Actor]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Sign in to continue."})
    verifier: TokenVerifier = request.app.state.token_verifier
    try:
        claims = verifier.verify(credentials.credentials)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": str(exc)}) from exc
    engine = get_engine(request.app.state.settings)
    if engine is None:
        raise HTTPException(status_code=503, detail={"code": "no_database", "message": "The league database is not configured."})
    with engine.begin() as connection:
        yield resolve_actor(connection, claims, request.state.request_id)


def captain_dependency(actor: Actor = Depends(actor_dependency)) -> Actor:
    if not actor.is_captain:
        raise HTTPException(status_code=403, detail={"code": "captain_only", "message": "Only the captain can do this."})
    return actor
