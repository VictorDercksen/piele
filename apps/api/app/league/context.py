"""Per-request actor resolution (API rules 1, 2 and 4).

Every domain request runs in one transaction. The verified token subject and email are
set as transaction-local settings first, which is all the row level security policies
allow through until the caller's league is known (the account's own memberships and
leagues, names reserved for its verified email, every league for the admin); then the
league from the request path is set and the rest of the request sees only that league's
rows.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator
from uuid import UUID

from fastapi import Depends, HTTPException, Path, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.engine import Connection

from app import competitions
from app.competitions import Competition
from app.db import get_engine
from app.league import tables as t
from app.league.auth import Claims, TokenError, TokenVerifier

bearer = HTTPBearer(auto_error=False)

ADMIN_LABEL = "admin"


@dataclass
class Actor:
    connection: Connection
    request_id: str
    user_id: UUID
    league_id: UUID
    league_name: str
    league_slug: str
    league_timezone: str
    league_emblem_path: str | None
    league_accent_colour: str | None
    # Null when joining by code is closed. Shown only to the captain and the admin.
    league_join_code: str | None
    # Null when the admin views a league they hold no membership in. Writes that the schema
    # attributes to a member call `require_membership` first.
    membership_id: UUID | None
    display_name: str
    is_captain: bool
    # Global, from users.is_admin: captain-level rights in every league.
    is_admin: bool
    # The membership's team in this league's competition.
    favourite_team_id: str | None
    captain_membership_id: UUID
    season_id: UUID
    season_name: str
    season_closed_at: datetime | None
    season_membership_id: UUID | None
    # The active season's competition: round bounds and labels, schedule and clubs.
    competition: Competition

    @property
    def administers(self) -> bool:
        """Captain of this league, or the admin."""
        return self.is_captain or self.is_admin


def require_membership(actor: Actor) -> UUID:
    """The actor's membership id, for writes the schema attributes to a member. The admin
    viewing a league they do not belong to gets 409 `admin_not_a_member`."""
    if actor.membership_id is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "admin_not_a_member",
                "message": "Add yourself to this league from the management centre first.",
            },
        )
    return actor.membership_id


def set_context(connection: Connection, name: str, value: str | None) -> None:
    connection.execute(
        text("select set_config(:name, :value, true)"), {"name": f"piele.{name}", "value": value or ""}
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Account:
    """A verified sign-in, whatever leagues it belongs to."""

    connection: Connection
    request_id: str
    claims: Claims
    user_id: UUID
    is_admin: bool

    @property
    def verified_email(self) -> str | None:
        return self.claims.email if self.claims.email and self.claims.email_verified else None


def resolve_account(connection: Connection, claims: Claims, request_id: str) -> Account:
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
    return Account(connection, request_id, claims, user.id, user.is_admin)


def unknown_league() -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "unknown_league", "message": "Unknown league."})


def not_a_member() -> HTTPException:
    return HTTPException(
        status_code=403, detail={"code": "not_a_member", "message": "This account is not a member of the league."}
    )


def active_season(connection: Connection, league_id: UUID):
    """The league's active season row, or None. Needs the league context."""
    return connection.execute(
        select(t.seasons).where(t.seasons.c.league_id == league_id, t.seasons.c.status == "active")
    ).first()


def season_competition(season) -> Competition:
    try:
        return competitions.get(season.competition_id)
    except KeyError:
        raise HTTPException(
            status_code=409,
            detail={"code": "unknown_competition", "message": "This season's competition is not supported."},
        ) from None


def actor_for(account: Account, league_id: UUID) -> Actor:
    """The caller acting in one league: its member, or the admin viewing it."""
    connection, user_id = account.connection, account.user_id
    set_context(connection, "league_id", str(league_id))
    league = connection.execute(
        select(t.leagues).where(t.leagues.c.id == league_id, t.leagues.c.status == "active")
    ).first()
    if league is None:
        raise unknown_league()
    membership = connection.execute(
        select(t.league_memberships).where(
            t.league_memberships.c.league_id == league_id,
            t.league_memberships.c.user_id == user_id,
            t.league_memberships.c.status == "active",
        )
    ).first()
    if membership is None and not account.is_admin:
        raise not_a_member()

    season = active_season(connection, league.id)
    if season is None:
        raise HTTPException(status_code=409, detail={"code": "no_active_season", "message": "No active season."})
    competition = season_competition(season)
    season_membership = None
    if membership is not None:
        season_membership = connection.execute(
            select(t.season_memberships.c.id).where(
                t.season_memberships.c.season_id == season.id,
                t.season_memberships.c.membership_id == membership.id,
                t.season_memberships.c.status == "active",
            )
        ).scalar_one_or_none()

    return Actor(
        connection=connection,
        request_id=account.request_id,
        user_id=user_id,
        league_id=league.id,
        league_name=league.name,
        league_slug=league.slug,
        league_timezone=league.timezone,
        league_emblem_path=league.emblem_path,
        league_accent_colour=league.accent_colour,
        league_join_code=league.join_code,
        membership_id=membership.id if membership is not None else None,
        display_name=membership.display_name if membership is not None else "Admin",
        is_captain=membership is not None and league.captain_membership_id == membership.id,
        is_admin=account.is_admin,
        favourite_team_id=membership.favourite_team_id if membership is not None else None,
        captain_membership_id=league.captain_membership_id,
        season_id=season.id,
        season_name=season.name,
        season_closed_at=season.closed_at,
        season_membership_id=season_membership,
        competition=competition,
    )


def account_on_competition(account: Account, competition_id: str) -> bool:
    """Whether the account belongs to an active league whose active season plays this
    competition. Seasons are visible only inside their league, so each league is checked in
    its own context, which is cleared again afterwards."""
    m, lg = t.league_memberships, t.leagues
    league_ids = account.connection.execute(
        select(m.c.league_id)
        .select_from(m.join(lg, lg.c.id == m.c.league_id))
        .where(m.c.user_id == account.user_id, m.c.status == "active", lg.c.status == "active")
    ).scalars().all()
    try:
        for league_id in league_ids:
            set_context(account.connection, "league_id", str(league_id))
            season = active_season(account.connection, league_id)
            if season is not None and season.competition_id == competition_id:
                return True
        return False
    finally:
        set_context(account.connection, "league_id", None)


def _verified_claims(request: Request, credentials: HTTPAuthorizationCredentials | None) -> Claims:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Sign in to continue."})
    verifier: TokenVerifier = request.app.state.token_verifier
    try:
        return verifier.verify(credentials.credentials)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": str(exc)}) from exc


def _engine(request: Request):
    engine = get_engine(request.app.state.settings)
    if engine is None:
        raise HTTPException(status_code=503, detail={"code": "no_database", "message": "The league database is not configured."})
    return engine


def account_dependency(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> Iterator[Account]:
    """A verified sign-in, in any league or none: the account routes (/v1/me, /v1/join)."""
    claims = _verified_claims(request, credentials)
    with _engine(request).begin() as connection:
        yield resolve_account(connection, claims, request.state.request_id)


def actor_dependency(
    request: Request,
    league_id: UUID = Path(alias="leagueId"),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Iterator[Actor]:
    """The caller in the `{leagueId}` path league: 404 `unknown_league` when it is missing or
    archived, 403 `not_a_member` without an active membership unless the caller is the admin."""
    claims = _verified_claims(request, credentials)
    with _engine(request).begin() as connection:
        yield actor_for(resolve_account(connection, claims, request.state.request_id), league_id)


def steward_dependency(actor: Actor = Depends(actor_dependency)) -> Actor:
    """The league's captain or the admin. Keeps the `captain_only` code the web handles."""
    if not actor.administers:
        raise HTTPException(status_code=403, detail={"code": "captain_only", "message": "Only the captain can do this."})
    return actor


def competition_member_dependency(
    request: Request,
    competition_id: str = Path(alias="competitionId"),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Iterator[Account]:
    """A signed-in member of a league playing the `{competitionId}` path competition, or the
    admin. Used by the member-only competition routes (previews, round updates)."""
    claims = _verified_claims(request, credentials)
    with _engine(request).begin() as connection:
        account = resolve_account(connection, claims, request.state.request_id)
        if not account.is_admin and not account_on_competition(account, competition_id):
            raise not_a_member()
        yield account
