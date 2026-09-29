"""Push notification routes:

- `GET /v1/push/key`: the VAPID public key browsers subscribe with (no sign-in).
- `PUT` and `DELETE /v1/me/push-subscriptions`: store or forget this browser's subscription
  for the signed-in account.
- `GET` and `PUT /v1/leagues/{leagueId}/me/push`: the kinds of message the member turned off
  in that league.
- `GET /v1/cron/push`: the push job (app/push/job.py), called by Vercel Cron with the
  CRON_SECRET bearer token.
"""

import hmac
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from app.db import get_engine
from app.league import tables as t
from app.league.context import Account, Actor, account_dependency, actor_dependency, now_utc, require_membership
from app.push import job
from app.push.outbox import CATEGORIES
from app.push.tables import push_subscriptions
from app.push.webpush import WebPushSender, allowed_endpoint, b64url_decode

router = APIRouter(tags=["push"])
bearer = HTTPBearer(auto_error=False)

Category = Literal["duties", "cases", "picks", "matches"]
MAX_BROWSERS = 10


def sender_of(request: Request) -> WebPushSender:
    sender = request.app.state.push_sender
    if sender is None:
        raise HTTPException(
            status_code=503, detail={"code": "push_unconfigured", "message": "Push notifications are not configured."}
        )
    return sender


class PushKey(BaseModel):
    publicKey: str


@router.get("/push/key", response_model=PushKey)
def push_key(request: Request) -> PushKey:
    return PushKey(publicKey=sender_of(request).public_key)


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=80, max_length=200)
    auth: str = Field(min_length=16, max_length=100)

    @field_validator("p256dh")
    @classmethod
    def _point(cls, value: str) -> str:
        if len(_decoded(value)) != 65:
            raise ValueError("p256dh is a 65-byte P-256 public key.")
        return value

    @field_validator("auth")
    @classmethod
    def _secret(cls, value: str) -> str:
        if len(_decoded(value)) != 16:
            raise ValueError("auth is a 16-byte secret.")
        return value


def _decoded(value: str) -> bytes:
    try:
        return b64url_decode(value)
    except ValueError:
        raise ValueError("Not base64url.") from None


class PushSubscriptionBody(BaseModel):
    """The browser's PushSubscription.toJSON(), less expirationTime."""

    endpoint: Annotated[str, Field(pattern=r"^https://", max_length=1000)]
    keys: SubscriptionKeys

    @field_validator("endpoint")
    @classmethod
    def _push_service(cls, value: str) -> str:
        if not allowed_endpoint(value):
            raise ValueError("The endpoint is not a known browser push service.")
        return value


class PushEndpoint(BaseModel):
    endpoint: Annotated[str, Field(max_length=1000)]


@router.put("/me/push-subscriptions", status_code=204)
def save_subscription(body: PushSubscriptionBody, account: Account = Depends(account_dependency)) -> None:
    """Stores this browser's subscription for the account, or refreshes its keys. An account
    keeps its MAX_BROWSERS most recently stored browsers."""
    s = push_subscriptions
    account.connection.execute(
        insert(s)
        .values(user_id=account.user_id, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth)
        .on_conflict_do_update(
            index_elements=[s.c.user_id, s.c.endpoint],
            set_={"p256dh": body.keys.p256dh, "auth": body.keys.auth, "updated_at": func.now()},
        )
    )
    keep = select(s.c.id).where(s.c.user_id == account.user_id).order_by(s.c.updated_at.desc(), s.c.id).limit(MAX_BROWSERS)
    account.connection.execute(delete(s).where(s.c.user_id == account.user_id, s.c.id.not_in(keep)))


@router.delete("/me/push-subscriptions", status_code=204)
def delete_subscription(body: PushEndpoint, account: Account = Depends(account_dependency)) -> None:
    """Forgets this browser for the account: on turning push off and on signing out."""
    s = push_subscriptions
    account.connection.execute(delete(s).where(s.c.user_id == account.user_id, s.c.endpoint == body.endpoint))


class PushPreferences(BaseModel):
    """The categories turned off in this league (app/push/outbox.py): duties, cases, picks,
    matches."""

    muted: list[Category] = Field(max_length=len(CATEGORIES))


@router.get("/leagues/{leagueId}/me/push", response_model=PushPreferences)
def push_preferences(actor: Actor = Depends(actor_dependency)) -> PushPreferences:
    m = t.league_memberships
    muted = actor.connection.execute(select(m.c.push_muted).where(m.c.id == require_membership(actor))).scalar_one()
    return PushPreferences(muted=[c for c in CATEGORIES if c in (muted or [])])


@router.put("/leagues/{leagueId}/me/push", response_model=PushPreferences)
def update_push_preferences(body: PushPreferences, actor: Actor = Depends(actor_dependency)) -> PushPreferences:
    m = t.league_memberships
    muted = [c for c in CATEGORIES if c in body.muted]
    actor.connection.execute(
        update(m).where(m.c.id == require_membership(actor), m.c.league_id == actor.league_id).values(push_muted=muted)
    )
    return PushPreferences(muted=muted)


def cron_dependency(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    configured = request.app.state.settings.cron_secret
    expected = configured.get_secret_value() if configured else ""
    if not expected:
        raise HTTPException(status_code=503, detail={"code": "cron_unconfigured", "message": "Cron access is not configured."})
    presented = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else ""
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail={"code": "invalid_cron_secret", "message": "Invalid cron secret."})


class PushRun(BaseModel):
    teamsheetsObserved: int
    announced: int
    reminders: int
    sent: int
    dropped: int
    failed: int
    gone: int


@router.get("/cron/push", response_model=PushRun, dependencies=[Depends(cron_dependency)])
def run_push(request: Request) -> Any:
    sender = sender_of(request)
    engine = get_engine(request.app.state.settings)
    if engine is None:
        raise HTTPException(status_code=503, detail={"code": "no_database", "message": "The database is not configured."})
    summary = job.run(engine, request.app.state.match_centres, sender, now_utc())
    return PushRun(
        teamsheetsObserved=summary.teamsheets_observed,
        announced=summary.announced,
        reminders=summary.reminders,
        sent=summary.sent,
        dropped=summary.dropped,
        failed=summary.failed,
        gone=summary.gone,
    )
