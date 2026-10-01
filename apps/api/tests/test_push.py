"""Push notifications (app/push): Web Push encryption and VAPID, the subscription and
preference routes, league events queued with their feed entries, competition events, pick
reminders and sending. The database tests need PIELE_TEST_DATABASE_URL like
tests/test_league.py, whose fixtures and helpers they use."""

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import text

from app.config import Settings
from app.db import get_engine
from app.main import create_app
from app.matchcentre.schedule import Fixture
from app.push import job
from app.push.webpush import (
    Outcome,
    Subscription,
    WebPushSender,
    allowed_endpoint,
    b64url_decode,
    b64url_encode,
    encrypt,
    private_key_from,
    public_bytes,
    vapid_header,
)
from tests.test_league import (  # noqa: F401 (fixtures)
    DATABASE_URL,
    captain_headers,
    client,
    invite,
    league_settings,
    lp,
    mo_headers,
    open_duty,
    second_league,
    signed_in,
    storage,
    upload_and_submit,
)

# RFC 8291 appendix A.
RFC_SERVER_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
RFC_UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
RFC_AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
RFC_SALT = "DGv6ra1nlYgDCS1FRnbzlw"
RFC_BODY = (
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A"
    "_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
)
needs_db = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")


def browser_keys() -> dict[str, str]:
    """The keys a browser's PushSubscription would carry."""
    key = ec.generate_private_key(ec.SECP256R1())
    return {"p256dh": b64url_encode(public_bytes(key.public_key())), "auth": b64url_encode(uuid4().bytes)}


@dataclass
class FakeSender:
    public_key: str = "BFakePublicKey"
    sent: list[tuple[str, dict, int, str]] = field(default_factory=list)
    gone: set[str] = field(default_factory=set)

    def send(self, subscription: Subscription, payload: bytes, *, ttl: int, urgency: str) -> Outcome:
        if subscription.endpoint in self.gone:
            return Outcome(False, True, 410)
        self.sent.append((subscription.endpoint, json.loads(payload), ttl, urgency))
        return Outcome(True, False, 201)


# Encryption and VAPID -----------------------------------------------------------------------


def test_encryption_matches_the_rfc_8291_example() -> None:
    body = encrypt(
        b"When I grow up, I want to be a watermelon",
        b64url_decode(RFC_UA_PUBLIC),
        b64url_decode(RFC_AUTH),
        server_key=private_key_from(RFC_SERVER_PRIVATE),
        salt=b64url_decode(RFC_SALT),
    )
    assert b64url_encode(body) == RFC_BODY


def test_the_vapid_header_signs_for_the_push_service_origin() -> None:
    key = private_key_from(RFC_SERVER_PRIVATE)
    header = vapid_header("https://fcm.googleapis.com/fcm/send/abc", key, "mailto:ops@example.com", now=1_000_000)
    token = header.split("t=")[1].split(",")[0]
    public = header.split("k=")[1]
    assert public == b64url_encode(public_bytes(key.public_key()))
    claims = jwt.decode(token, key.public_key(), algorithms=["ES256"], audience="https://fcm.googleapis.com", options={"verify_exp": False})
    assert claims == {"aud": "https://fcm.googleapis.com", "exp": 1_000_000 + 12 * 3600, "sub": "mailto:ops@example.com"}


def test_the_sender_posts_encrypted_messages_and_reports_gone_subscriptions() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(410 if request.url.path.endswith("/old") else 201)

    sender = WebPushSender(RFC_SERVER_PRIVATE, "mailto:ops@example.com", 5, transport=httpx.MockTransport(handler))
    keys = browser_keys()
    ok = sender.send(Subscription("https://fcm.googleapis.com/fcm/send/new", keys["p256dh"], keys["auth"]), b'{"title":"Hi"}', ttl=60, urgency="high")
    assert ok == Outcome(True, False, 201)
    request = seen[0]
    assert request.headers["Content-Encoding"] == "aes128gcm" and request.headers["TTL"] == "60" and request.headers["Urgency"] == "high"
    assert request.headers["Authorization"].startswith("vapid t=")
    assert b"Hi" not in request.content and len(request.content) > 86
    gone = sender.send(Subscription("https://fcm.googleapis.com/fcm/send/old", keys["p256dh"], keys["auth"]), b"{}")
    assert (gone.delivered, gone.gone, gone.status) == (False, True, 410)
    broken = sender.send(Subscription("https://fcm.googleapis.com/fcm/send/new", "AAAA", keys["auth"]), b"{}")
    assert broken.gone is True
    # Only browsers' push services are ever posted to.
    elsewhere = sender.send(Subscription("https://internal.example/hook", keys["p256dh"], keys["auth"]), b"{}")
    assert elsewhere.gone is True and len(seen) == 2


def test_endpoints_must_be_on_a_browser_push_service() -> None:
    for endpoint in (
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/QGdx",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ):
        assert allowed_endpoint(endpoint), endpoint
    for endpoint in (
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://fcm.googleapis.com.evil.example/x",
        "https://evilfcm.googleapis.com.example/x",
        "https://fcm.googleapis.com:8443/x",
        "https://localhost/x",
        "https://169.254.169.254/latest",
    ):
        assert not allowed_endpoint(endpoint), endpoint


def test_production_refuses_a_malformed_vapid_key_or_a_short_cron_secret() -> None:
    base = {"_env_file": None, "environment": "production", "ALLOWED_ORIGINS": "https://app.example", "database_url": "postgresql://x"}
    with pytest.raises(ValueError, match="PIELE_VAPID_PRIVATE_KEY"):
        Settings(**base, piele_vapid_private_key="not-a-key", piele_vapid_subject="mailto:ops@example.com")
    with pytest.raises(ValueError, match="PIELE_VAPID_SUBJECT"):
        Settings(**base, piele_vapid_private_key=RFC_SERVER_PRIVATE)
    with pytest.raises(ValueError, match="CRON_SECRET"):
        Settings(**base, cron_secret="short")
    assert Settings(**base, piele_vapid_private_key=RFC_SERVER_PRIVATE, piele_vapid_subject="mailto:ops@example.com").is_production


# Reminder timing and wording ----------------------------------------------------------------

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def test_reminders_fall_due_a_day_and_an_hour_before_kickoff() -> None:
    assert job.lead_for(NOW + timedelta(hours=25), NOW) is None
    assert job.lead_for(NOW + timedelta(hours=24), NOW) == "24h"
    assert job.lead_for(NOW + timedelta(hours=2), NOW) == "24h"
    assert job.lead_for(NOW + timedelta(hours=1), NOW) == "1h"
    assert job.lead_for(NOW + timedelta(minutes=1), NOW) == "1h"
    assert job.lead_for(NOW, NOW) is None


# Routes and the database --------------------------------------------------------------------


@pytest.fixture
def sender() -> FakeSender:
    return FakeSender()


@pytest.fixture
def push_client(client: TestClient, storage, sender: FakeSender) -> TestClient:
    """The league test client, with a fake push sender and a cron secret."""
    settings = league_settings().model_copy(update={"cron_secret": SecretStr("c" * 40)})
    push = TestClient(create_app(settings, storage=storage, push_sender=sender))
    for name in ("league_id", "captain_email", "subjects", "mo_email"):
        setattr(push, name, getattr(client, name))
    return push


def subscribe(client: TestClient, headers: dict) -> str:
    endpoint = f"https://fcm.googleapis.com/fcm/send/{uuid4().hex}"
    response = client.put("/v1/me/push-subscriptions", json={"endpoint": endpoint, "keys": browser_keys()}, headers=headers)
    assert response.status_code == 204, response.text
    return endpoint


def queued(user_endpoint_owner_headers: dict, client: TestClient) -> list[dict]:
    """The pending messages of the account behind the headers, read as the job."""
    user_id = client.get("/v1/me", headers=user_endpoint_owner_headers).json()["userId"]
    with job.begin(get_engine(league_settings())) as connection:
        rows = connection.execute(
            text("select kind, title, body, url, tag, status from piele.push_outbox where user_id = :u order by created_at"),
            {"u": user_id},
        ).all()
    return [row._asdict() for row in rows]


def drain(sender: FakeSender) -> job.Summary:
    """Sends everything queued; the shared test database holds other tests' messages too."""
    summary = job.Summary()
    while job.drain(get_engine(league_settings()), sender, datetime.now(timezone.utc), summary):
        pass
    return summary


@needs_db
def test_the_public_key_route_needs_push_configured(push_client: TestClient, client: TestClient) -> None:
    assert push_client.get("/v1/push/key").json() == {"publicKey": "BFakePublicKey"}
    assert client.get("/v1/push/key").json()["detail"]["code"] == "push_unconfigured"


@needs_db
def test_an_account_stores_and_forgets_its_browsers(push_client: TestClient) -> None:
    mo = mo_headers(push_client)
    assert push_client.put("/v1/me/push-subscriptions", json={"endpoint": "https://x", "keys": {"p256dh": "a" * 88, "auth": "b" * 22}}, headers=mo).status_code == 422
    assert push_client.put("/v1/me/push-subscriptions", json={"endpoint": "http://x", "keys": browser_keys()}, headers=mo).status_code == 422
    assert push_client.put("/v1/me/push-subscriptions", json={"endpoint": "https://internal.example/hook", "keys": browser_keys()}, headers=mo).status_code == 422
    endpoint = subscribe(push_client, mo)
    # Subscribing again refreshes the keys rather than adding a row.
    assert push_client.put("/v1/me/push-subscriptions", json={"endpoint": endpoint, "keys": browser_keys()}, headers=mo).status_code == 204
    with job.begin(get_engine(league_settings())) as connection:
        count = lambda: connection.execute(text("select count(*) from piele.push_subscriptions where endpoint = :e"), {"e": endpoint}).scalar_one()  # noqa: E731
        assert count() == 1
    # Another account cannot remove it.
    assert push_client.request("DELETE", "/v1/me/push-subscriptions", json={"endpoint": endpoint}, headers=captain_headers(push_client)).status_code == 204
    with job.begin(get_engine(league_settings())) as connection:
        assert connection.execute(text("select count(*) from piele.push_subscriptions where endpoint = :e"), {"e": endpoint}).scalar_one() == 1
    assert push_client.request("DELETE", "/v1/me/push-subscriptions", json={"endpoint": endpoint}, headers=mo).status_code == 204
    with job.begin(get_engine(league_settings())) as connection:
        assert connection.execute(text("select count(*) from piele.push_subscriptions where endpoint = :e"), {"e": endpoint}).scalar_one() == 0


@needs_db
def test_an_account_keeps_its_ten_newest_browsers(push_client: TestClient) -> None:
    mo = mo_headers(push_client)
    endpoints = [subscribe(push_client, mo) for _ in range(12)]
    user_id = push_client.get("/v1/me", headers=mo).json()["userId"]
    with job.begin(get_engine(league_settings())) as connection:
        kept = set(connection.execute(text("select endpoint from piele.push_subscriptions where user_id = :u"), {"u": user_id}).scalars())
    assert kept == set(endpoints[2:])


@needs_db
def test_members_turn_kinds_off_per_league(push_client: TestClient) -> None:
    mo = mo_headers(push_client)
    assert push_client.get(lp(push_client, "/me/push"), headers=mo).json() == {"muted": []}
    saved = push_client.put(lp(push_client, "/me/push"), json={"muted": ["matches", "duties", "duties"]}, headers=mo)
    assert saved.json() == {"muted": ["duties", "matches"]}
    assert push_client.put(lp(push_client, "/me/push"), json={"muted": ["weather"]}, headers=mo).status_code == 422
    assert push_client.get(lp(push_client, "/me/push"), headers=mo).json() == {"muted": ["duties", "matches"]}


@needs_db
def test_a_new_duty_reaches_its_member_and_is_sent(push_client: TestClient, sender: FakeSender) -> None:
    mo = mo_headers(push_client)
    endpoint = subscribe(push_client, mo)
    mo_id = push_client.get(lp(push_client, "/me"), headers=mo).json()["memberId"]
    duty = open_duty(push_client, UUID(mo_id), round_number=2)
    [message] = queued(mo, push_client)
    assert (message["kind"], message["title"], message["status"]) == ("duty_created", "A duty for you", "pending")
    assert message["body"].startswith("Round 02 Spoon duty.") and message["url"].endswith("/duties")
    assert message["tag"] == f"duty:{duty['id']}"
    # The captain created it: the captain hears nothing.
    assert queued(captain_headers(push_client), push_client) == []
    drain(sender)
    assert [(e, p["title"], p["url"]) for e, p, _, _ in sender.sent if e == endpoint] == [(endpoint, "A duty for you", message["url"])]
    assert queued(mo, push_client)[0]["status"] == "sent"


@needs_db
def test_muted_kinds_and_members_without_a_browser_get_nothing_sent(push_client: TestClient, sender: FakeSender) -> None:
    mo = mo_headers(push_client)
    mo_id = push_client.get(lp(push_client, "/me"), headers=mo).json()["memberId"]
    push_client.put(lp(push_client, "/me/push"), json={"muted": ["duties"]}, headers=mo)
    open_duty(push_client, UUID(mo_id), round_number=2)
    assert queued(mo, push_client) == []
    push_client.put(lp(push_client, "/me/push"), json={"muted": []}, headers=mo)
    open_duty(push_client, UUID(mo_id), round_number=3)
    drain(sender)
    assert [m["status"] for m in queued(mo, push_client)] == ["dropped"]


@needs_db
def test_a_gone_browser_is_forgotten(push_client: TestClient, sender: FakeSender) -> None:
    mo = mo_headers(push_client)
    endpoint = subscribe(push_client, mo)
    sender.gone.add(endpoint)
    mo_id = push_client.get(lp(push_client, "/me"), headers=mo).json()["memberId"]
    open_duty(push_client, UUID(mo_id), round_number=2)
    drain(sender)
    assert queued(mo, push_client)[0]["status"] == "dropped"
    with job.begin(get_engine(league_settings())) as connection:
        assert connection.execute(text("select count(*) from piele.push_subscriptions where endpoint = :e"), {"e": endpoint}).scalar_one() == 0


def member(client: TestClient, name: str) -> dict[str, str]:
    from tests.test_cases import member as case_member

    return case_member(client, name)


@needs_db
def test_evidence_asks_the_voters_and_a_veto_asks_the_reviewer(push_client: TestClient, storage) -> None:
    captain = captain_headers(push_client)
    mo, ola = member(push_client, "Mo"), member(push_client, "Ola")
    mo_id = push_client.get(lp(push_client, "/me"), headers=mo).json()["memberId"]
    duty = open_duty(push_client, UUID(mo_id), round_number=2)
    upload_and_submit(push_client, storage, mo, [duty["id"]])
    for headers in (captain, ola):
        [vote] = [m for m in queued(headers, push_client) if m["kind"] == "case_vote"]
        assert vote["title"] == "Evidence to review" and vote["body"].startswith("Mo: Round 02 Spoon duty.")
        assert vote["url"].endswith("/decisions")
    assert [m["kind"] for m in queued(mo, push_client)] == ["duty_created"]
    case = push_client.get(lp(push_client, "/evidence/cases"), params={"round": 2}, headers=ola).json()[0]
    vetoed = push_client.post(lp(push_client, f"/evidence/cases/{case['id']}/response"), json={"choice": "veto", "reason": "Fork"}, headers=ola)
    assert vetoed.status_code == 200, vetoed.text
    [ruling] = [m for m in queued(captain, push_client) if m["kind"] == "case_review"]
    assert ruling["title"] == "A veto needs your ruling" and ruling["url"].endswith("/captain") and "Fork" not in ruling["body"]
    upheld = push_client.post(
        lp(push_client, f"/evidence/cases/{case['id']}/review"),
        json={"ruling": "upheld", "reason": "Not the spoon", "version": case["version"] + 1},
        headers=captain,
    )
    assert upheld.status_code == 200, upheld.text
    [decided] = [m for m in queued(mo, push_client) if m["kind"] == "evidence_decided"]
    assert decided["title"] == "Evidence rejected" and "Not the spoon" in decided["body"]


@dataclass(frozen=True)
class StubClub:
    name: str


class StubCompetition:
    """A competition with its own id, so announcements from other runs never collide."""

    def __init__(self, fixtures: list[Fixture]) -> None:
        self.id = f"test-{uuid4().hex[:12]}"
        self._fixtures = tuple(fixtures)

    def schedule(self):
        from app.matchcentre.schedule import Schedule

        return Schedule("2026/27", "test", "now", self._fixtures)

    def club(self, club_id: str | None):
        return StubClub(club_id.title()) if club_id else None


def fixture(fixture_id: str, kickoff: datetime) -> Fixture:
    return Fixture(fixture_id, 2, "leinster", "munster", kickoff, "Aviva Stadium")


def league_of(client: TestClient, competition, league_id: str | None = None) -> job.League:
    league_id = league_id or client.league_id
    with job.begin(get_engine(league_settings())) as connection:
        row = connection.execute(
            text("select id, slug, name, timezone from piele.leagues where id = :l"), {"l": league_id}
        ).one()
        connection.execute(text("select set_config('piele.league_id', :l, true)"), {"l": league_id})
        season_id = connection.execute(
            text("select id from piele.seasons where league_id = :l and status = 'active'"), {"l": league_id}
        ).scalar_one()
    return job.League(row.id, row.slug, row.name, row.timezone, season_id, competition)


@needs_db
def test_competition_events_are_announced_once_per_account(push_client: TestClient) -> None:
    mo = mo_headers(push_client)
    now = datetime.now(timezone.utc)
    first, second = fixture(f"t{uuid4().hex[:8]}", now + timedelta(days=1)), fixture(f"t{uuid4().hex[:8]}", now + timedelta(days=1, hours=2))
    competition = StubCompetition([first, second])
    league = league_of(push_client, competition)
    engine = get_engine(league_settings())
    with job.begin(engine) as connection:
        for f in (first, second):
            connection.execute(
                text("insert into piele.fixture_milestones (competition_id, fixture_id, kind, observed_at) values (:c, :f, 'teamsheets_published', :t)"),
                {"c": competition.id, "f": f.id, "t": now},
            )
        members = {league.id: job.league_members(connection, league)}
        assert job.announce(connection, competition, [league], members, now) >= 1
        # Seen once: a second run announces nothing.
        assert job.announce(connection, competition, [league], members, now) == 0
    [sheets] = [m for m in queued(mo, push_client) if m["kind"] == "teamsheets_published"]
    assert sheets["title"] == "Teamsheets are out for 2 matches"
    assert sheets["body"] == "Leinster v Munster and Leinster v Munster." and sheets["url"] == f"/{league.slug}"


@needs_db
def test_old_events_and_kicked_off_fixtures_are_not_announced(push_client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    # fixture_milestones keeps a legacy unique index on (fixture_id, kind): ids are unique per run.
    stale, started = fixture(f"s{uuid4().hex[:8]}", now + timedelta(days=1)), fixture(f"k{uuid4().hex[:8]}", now - timedelta(minutes=5))
    competition = StubCompetition([stale, started])
    with job.begin(get_engine(league_settings())) as connection:
        connection.execute(
            text(
                "insert into piele.fixture_milestones (competition_id, fixture_id, kind, observed_at)"
                " values (:c, :s, 'teamsheets_published', :t), (:c, :k, 'teamsheets_published', :n)"
            ),
            {"c": competition.id, "s": stale.id, "k": started.id, "t": now - timedelta(hours=7), "n": now},
        )
        assert job.new_events(connection, competition, now) == {}


def account_pick(connection, competition, fixture_id: str, user_id: UUID) -> None:
    """The account's pick of the fixture, as the job sees it: it names no league."""
    connection.execute(
        text(
            "insert into piele.picks (competition_id, fixture_id, user_id, side, margin, recorded_by_user_id)"
            " values (:c, :f, :u, 'home', 5, :u)"
        ),
        {"c": competition.id, "f": fixture_id, "u": str(user_id)},
    )


@needs_db
def test_members_without_a_pick_are_reminded_a_day_and_an_hour_before(push_client: TestClient) -> None:
    mo = mo_headers(push_client)
    now = datetime.now(timezone.utc)
    soon, later = fixture(f"r{uuid4().hex[:8]}", now + timedelta(hours=20)), fixture(f"r{uuid4().hex[:8]}", now + timedelta(hours=22))
    competition = StubCompetition([soon, later])
    league = league_of(push_client, competition)
    engine = get_engine(league_settings())
    mo_id = UUID(push_client.get(lp(push_client, "/me"), headers=mo).json()["memberId"])
    with job.begin(engine) as connection:
        members = job.league_members(connection, league)
        assert {m.id for m in members} >= {mo_id}
        mo_member = [m for m in members if m.id == mo_id]
        assert job.remind(connection, league, mo_member, set(), now) == 1
        assert job.remind(connection, league, mo_member, set(), now) == 0
    [day] = queued(mo, push_client)
    assert day["title"] == "2 picks are due" and day["url"] == f"/{league.slug}/match/{soon.id}" and day["tag"] == f"picks:{league.id}"
    # Mo picks the later match; an hour before the first, only it is left.
    with job.begin(engine) as connection:
        account_pick(connection, competition, later.id, mo_member[0].user_id)
        hour = now + timedelta(hours=19, minutes=30)
        assert job.remind(connection, league, mo_member, {mo_member[0].user_id}, hour) == 1
    last = queued(mo, push_client)[-1]
    assert last["title"] == f"{league.name}: One hour to kickoff" and last["body"] == "No pick yet for Leinster v Munster."
    # Matches before the season's starting round (round 2 here) get no reminder.
    fresh = StubCompetition([fixture(f"r{uuid4().hex[:8]}", now + timedelta(hours=10))])
    for starting_round, expected in ((3, 0), (2, 1)):
        started_later = job.League(league.id, league.slug, league.name, league.timezone, league.season_id, fresh, starting_round)
        with job.begin(engine) as connection:
            assert job.remind(connection, started_later, mo_member, set(), now) == expected
    # Muted picks: nothing more.
    push_client.put(lp(push_client, "/me/push"), json={"muted": ["picks"]}, headers=mo)
    with job.begin(engine) as connection:
        muted = [m for m in job.league_members(connection, league) if m.id == mo_id]
        assert job.remind(connection, league, muted, set(), now + timedelta(hours=21, minutes=30)) == 0


@needs_db
def test_a_pick_made_in_another_league_on_the_competition_stops_the_reminders(push_client: TestClient) -> None:
    """Mo is a member here and captain of Zulu, both on the competition. Mo's pick, made in
    Zulu, is Mo's pick here too: neither league reminds Mo, while the captain here, who has
    not picked, is reminded."""
    captain, mo = captain_headers(push_client), mo_headers(push_client)
    zulu = second_league(push_client, push_client.mo_email)
    assert push_client.get("/v1/me", headers=mo).status_code == 200  # claims the Zulu captain name
    now = datetime.now(timezone.utc)
    soon = fixture(f"r{uuid4().hex[:8]}", now + timedelta(hours=20))
    competition = StubCompetition([soon])
    here, there = league_of(push_client, competition), league_of(push_client, competition, zulu)
    mo_user = UUID(push_client.get("/v1/me", headers=mo).json()["userId"])
    engine = get_engine(league_settings())
    with job.begin(engine) as connection:
        connection.execute(text("select set_config('piele.league_id', :l, true)"), {"l": zulu})
        account_pick(connection, competition, soon.id, mo_user)
        connection.execute(text("select set_config('piele.league_id', '', true)"))
        members = {league.id: job.league_members(connection, league) for league in (here, there)}
        assert mo_user in {m.user_id for m in members[here.id]} and [m.user_id for m in members[there.id]] == [mo_user]
        assert job.remind(connection, there, members[there.id], {mo_user}, now) == 0
        assert job.remind(connection, here, members[here.id], {mo_user}, now) == 1
    assert [m for m in queued(mo, push_client) if m["kind"] == "pick_reminder"] == []
    [reminder] = [m for m in queued(captain, push_client) if m["kind"] == "pick_reminder"]
    assert reminder["url"] == f"/{here.slug}/match/{soon.id}"


@needs_db
def test_the_cron_route_needs_its_secret(push_client: TestClient, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.get("/v1/cron/push").json()["detail"]["code"] == "cron_unconfigured"
    assert push_client.get("/v1/cron/push").status_code == 401
    assert push_client.get("/v1/cron/push", headers={"Authorization": "Bearer wrong"}).status_code == 401
    monkeypatch.setattr(job, "run", lambda *args: job.Summary(sent=2))
    ran = push_client.get("/v1/cron/push", headers={"Authorization": f"Bearer {'c' * 40}"})
    assert ran.status_code == 200 and ran.json()["sent"] == 2
