"""League API integration tests: token verification, the account and its leagues, claiming
names (reserved emails and join codes), captain and admin authority, duties, marks,
evidence, own profiles and the feed. They need PIELE_TEST_DATABASE_URL like
tests/test_database.py and run each test in a freshly bootstrapped league."""

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from app.config import Settings
from app.db import get_engine
from app.league import bootstrap
from app.league.auth import Claims, TokenError, SecretVerifier
from app.league.context import now_utc
from app.league.storage import SignedUpload, StorageError, StoredObject
from app.main import create_app

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")
SUPABASE_URL = "https://test-project.supabase.co"
SECRET = "test-secret-long-enough-for-hs256-verification"

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")


class FakeStorage:
    bucket = "evidence-test"

    def __init__(self) -> None:
        self.objects: dict[str, StoredObject] = {}
        self.contents: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.down = False

    def create_signed_upload(self, path: str) -> SignedUpload:
        if self.down:
            raise StorageError("Evidence storage is unavailable.")
        return SignedUpload(token=f"token-for-{path[-8:]}")

    def stored_object(self, path: str) -> StoredObject | None:
        if self.down:
            raise StorageError("Evidence storage is unavailable.")
        return self.objects.get(path)

    def signed_url(self, path: str, expires_in_seconds: int) -> str:
        if self.down:
            raise StorageError("Evidence storage is unavailable.")
        return f"https://storage.example/{path}?expires={expires_in_seconds}"

    def read_prefix(self, path: str, length: int) -> bytes:
        if self.down:
            raise StorageError("Evidence storage is unavailable.")
        return self.contents.get(path, b"")[:length]

    def delete_object(self, path: str) -> None:
        if self.down:
            raise StorageError("Evidence storage is unavailable.")
        self.deleted.append(path)
        self.objects.pop(path, None)


def token(subject: UUID, email: str | None, *, verified: bool = True, **overrides) -> str:
    payload = {
        "sub": str(subject),
        "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "user_metadata": {"email_verified": verified},
    }
    if email:
        payload["email"] = email
    payload.update(overrides)
    return jwt.encode(payload, SECRET, algorithm="HS256")


def auth(subject: UUID, email: str | None = None, **kw) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(subject, email, **kw)}"}


SEED = {
    "league": "Test league",
    "season": {"name": "URC 2026/27", "competition": "URC"},
    "captain": "Captain",
    "members": [
        {"fullName": "Captain, Cara", "displayName": "Captain"},
        {"fullName": "Member, Mo", "displayName": "Mo"},
        {"fullName": "Other, Ola", "displayName": "Ola"},
    ],
}
SOME_SUBJECT = uuid4()


def new_league(connection, captain_email: str, seed: dict = SEED, **overrides) -> str:
    """Bootstraps a league with a unique slug; the test database keeps every league."""
    return bootstrap.bootstrap(connection, captain_email, seed, slug=f"test-{uuid4().hex[:12]}", **overrides)


def migration_engine():
    """The migration role, for what the runtime role may not do (setting the admin flag).
    PIELE_TEST_MIGRATION_DATABASE_URL, else the test database as `postgres` with PGPASSWORD."""
    raw = os.environ.get("PIELE_TEST_MIGRATION_DATABASE_URL")
    url = make_url(raw) if raw else make_url(DATABASE_URL).set(username="postgres", password=os.environ.get("PGPASSWORD"))
    if url.drivername in ("postgresql", "postgres"):
        url = url.set(drivername="postgresql+psycopg")
    return create_engine(url, poolclass=NullPool)


def make_admin(subject_id: UUID) -> None:
    with migration_engine().begin() as connection:
        updated = connection.execute(
            text("update piele.users set is_admin = true where auth_subject = :s"), {"s": str(subject_id)}
        ).rowcount
    assert updated == 1


def subject(client: TestClient, name: str) -> UUID:
    """Auth subjects are per test so accounts never carry over between leagues."""
    return client.subjects.setdefault(name, uuid4())  # type: ignore[attr-defined]


def lp(client: TestClient, path: str, league_id: str | None = None) -> str:
    """A league-scoped path: /v1/leagues/{leagueId}{path}, in the test's league by default."""
    return f"/v1/leagues/{league_id or client.league_id}{path}"  # type: ignore[attr-defined]


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


def league_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        database_url=DATABASE_URL,
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=SECRET,
        supabase_service_role_key="service-key",
    )


@pytest.fixture
def client(storage: FakeStorage) -> TestClient:
    settings = league_settings()
    engine = get_engine(settings)
    # Each test gets its own league; the captain's email is unique per run.
    email = f"captain-{uuid4().hex[:8]}@example.com"
    with engine.begin() as connection:
        league_id = new_league(connection, email)
    client = TestClient(create_app(settings, storage=storage))
    client.league_id = league_id  # type: ignore[attr-defined]
    client.captain_email = email  # type: ignore[attr-defined]
    client.subjects = {}  # type: ignore[attr-defined]
    # Test leagues share one database, so reservations must not collide between tests.
    client.mo_email = f"mo-{uuid4().hex[:8]}@example.com"  # type: ignore[attr-defined]
    return client


def signed_in(client: TestClient, name: str, email: str | None, **kw) -> dict[str, str]:
    """Headers for an account after `GET /v1/me`, which claims names reserved for its email."""
    headers = auth(subject(client, name), email, **kw)
    response = client.get("/v1/me", headers=headers)
    assert response.status_code == 200, response.text
    return headers


def captain_headers(client: TestClient) -> dict[str, str]:
    """Claims the captain membership by its invited email on first use."""
    claimed = client.__dict__.setdefault("claimed", set())
    if "CAPTAIN" not in claimed:
        signed_in(client, "CAPTAIN", _captain_email(client))
        claimed.add("CAPTAIN")
    return auth(subject(client, "CAPTAIN"), _captain_email(client))


def mo_headers(client: TestClient) -> dict[str, str]:
    """Reserves Mo for mo_email and signs Mo in, which claims the name."""
    invite(client, "Mo", client.mo_email)  # type: ignore[attr-defined]
    return signed_in(client, "MO", client.mo_email)  # type: ignore[attr-defined]


def _captain_email(client: TestClient) -> str:
    return client.captain_email  # type: ignore[attr-defined]


def invite(client: TestClient, member_name: str, email: str, league_id: str | None = None, headers: dict | None = None) -> UUID:
    headers = headers or captain_headers(client)
    members = client.get(lp(client, "/members", league_id), headers=headers).json()
    member = next(m for m in members if m["displayName"] == member_name)
    response = client.patch(lp(client, f"/members/{member['id']}", league_id), json={"email": email}, headers=headers)
    assert response.status_code == 204, response.text
    return UUID(member["id"])


def open_duty(client: TestClient, member_id: UUID, round_number: int = 2, duty_type: str = "spoon", **extra) -> dict:
    body = {"memberId": str(member_id), "type": duty_type, "roundNumber": round_number, **extra}
    response = client.post(lp(client, "/duties"), json=body, headers=captain_headers(client))
    assert response.status_code == 201, response.text
    return response.json()


def upload_and_submit(client: TestClient, storage: FakeStorage, headers: dict, duty_ids: list[str], **extra) -> dict:
    grant = client.post(
        lp(client, "/evidence/uploads"),
        json={"filename": "proof.mp4", "contentType": "video/mp4", "sizeBytes": 1024},
        headers=headers,
    )
    assert grant.status_code == 201, grant.text
    storage.objects[grant.json()["path"]] = StoredObject(size_bytes=1024, content_type="video/mp4")
    response = client.post(
        lp(client, "/evidence"), json={"assetId": grant.json()["assetId"], "dutyIds": duty_ids, **extra}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


# Authentication and membership --------------------------------------------------------


def test_requests_without_a_valid_token_are_rejected(client: TestClient) -> None:
    for path in ("/v1/me", lp(client, "/me")):
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer nonsense"}).status_code == 401
        forged = jwt.encode({"sub": str(subject(client, "CAPTAIN")), "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1"}, "other", algorithm="HS256")
        assert client.get(path, headers={"Authorization": f"Bearer {forged}"}).status_code == 401
        wrong_audience = auth(subject(client, "CAPTAIN"), _captain_email(client), aud="anon")
        assert client.get(path, headers=wrong_audience).status_code == 401
        expired = auth(subject(client, "CAPTAIN"), _captain_email(client), exp=datetime.now(timezone.utc) - timedelta(minutes=1))
        assert client.get(path, headers=expired).status_code == 401


def test_secret_verifier_reads_claims() -> None:
    verifier = SecretVerifier(SUPABASE_URL, "authenticated", SECRET)
    claims = verifier.verify(token(SOME_SUBJECT, "Mo@Example.com"))
    assert claims == Claims(subject=SOME_SUBJECT, email="mo@example.com", email_verified=True)
    with pytest.raises(TokenError):
        verifier.verify(token(SOME_SUBJECT, None, sub="not-a-uuid"))


def test_jwks_verifier_rejects_unknown_keys() -> None:
    from app.league.auth import JwksVerifier

    verifier = JwksVerifier(SUPABASE_URL, "authenticated")
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    signed = jwt.encode({"sub": str(SOME_SUBJECT), "aud": "authenticated"}, pem, algorithm="ES256", headers={"kid": "nope"})
    verifier._client.fetch_data = lambda: {"keys": []}  # no network in tests
    with pytest.raises(TokenError):
        verifier.verify(signed)


def test_captain_claims_membership_by_verified_email(client: TestClient) -> None:
    headers = auth(subject(client, "CAPTAIN"), _captain_email(client))
    # The league routes do not claim: the account document does.
    assert client.get(lp(client, "/me"), headers=headers).json()["detail"]["code"] == "not_a_member"
    account = client.get("/v1/me", headers=headers)
    assert account.status_code == 200, account.text
    [league] = account.json()["leagues"]
    assert league["id"] == client.league_id and league["displayName"] == "Captain" and league["isCaptain"] is True
    me = client.get(lp(client, "/me"), headers=headers)
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["displayName"] == "Captain" and body["isCaptain"] is True and body["administers"] is True
    assert body["isAdmin"] is False and body["memberId"] == league["memberId"]
    assert body["leagueId"] == client.league_id and body["slug"].startswith("test-") and body["timezone"] == "Africa/Johannesburg"
    assert body["competition"] == {"id": "urc-2026-27", "name": "United Rugby Championship 2026/27", "shortName": "URC"}
    assert body["emblemUrl"] is None and body["emblemPreset"] is None and body["accentColour"] is None and body["inSeason"] is True
    assert body["joinCode"] == join_code(client)
    # Second sign-in finds the bound account even if the email changes.
    again = client.get(lp(client, "/me"), headers=auth(subject(client, "CAPTAIN"), "renamed@example.com"))
    assert again.json()["memberId"] == body["memberId"]
    feed = client.get(lp(client, "/feed"), headers=headers).json()
    assert [f["kind"] for f in feed] == ["member_joined", "season_opened"]
    # Claiming happens once.
    client.get("/v1/me", headers=headers)
    assert len(client.get(lp(client, "/feed"), headers=headers).json()) == 2


def test_strangers_and_unverified_emails_are_not_members(client: TestClient) -> None:
    stranger = auth(subject(client, "STRANGER"), "nobody@example.com")
    assert client.get(lp(client, "/me"), headers=stranger).json()["detail"]["code"] == "not_a_member"
    assert client.get("/v1/me", headers=stranger).json()["leagues"] == []
    invite(client, "Mo", client.mo_email)
    unverified = auth(subject(client, "MO"), client.mo_email, verified=False)
    assert client.get("/v1/me", headers=unverified).json()["leagues"] == []
    assert client.get(lp(client, "/me"), headers=unverified).status_code == 403
    verified = auth(subject(client, "MO"), client.mo_email.upper())
    assert [league["displayName"] for league in client.get("/v1/me", headers=verified).json()["leagues"]] == ["Mo"]
    me = client.get(lp(client, "/me"), headers=verified)
    assert me.status_code == 200 and me.json()["isCaptain"] is False and me.json()["administers"] is False
    # The invitation is single-use: another account with the same email is still a stranger.
    other = auth(subject(client, "STRANGER"), client.mo_email)
    assert client.get("/v1/me", headers=other).json()["leagues"] == []
    assert client.get(lp(client, "/me"), headers=other).status_code == 403


def test_unknown_and_archived_leagues_are_not_found(client: TestClient) -> None:
    captain = captain_headers(client)
    missing = client.get(f"/v1/leagues/{uuid4()}/me", headers=captain)
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "unknown_league"
    engine = get_engine(client.app.state.settings)
    with engine.begin() as connection:
        connection.execute(text("select set_config('piele.league_id', :id, true)"), {"id": client.league_id})  # type: ignore[attr-defined]
        connection.execute(text("update piele.leagues set status = 'archived' where id = :id"), {"id": client.league_id})  # type: ignore[attr-defined]
    archived = client.get(lp(client, "/members"), headers=captain)
    assert archived.status_code == 404 and archived.json()["detail"]["code"] == "unknown_league"
    assert client.get("/v1/me", headers=captain).json()["leagues"] == []


def test_only_the_captain_manages_members(client: TestClient) -> None:
    mo = mo_headers(client)
    members = client.get(lp(client, "/members"), headers=mo).json()
    assert {m["displayName"] for m in members} == {"Captain", "Mo", "Ola"}
    assert all(m["email"] is None for m in members)
    captain_view = client.get(lp(client, "/members"), headers=captain_headers(client)).json()
    assert next(m for m in captain_view if m["displayName"] == "Mo")["email"] == client.mo_email
    denied = client.post(lp(client, "/members"), json={"displayName": "New", "fullName": "New, Person"}, headers=mo)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "captain_only"
    created = client.post(
        lp(client, "/members"),
        json={"displayName": "Vee", "fullName": "Visser, Vee", "email": "vee@example.com"},
        headers=captain_headers(client),
    )
    assert created.status_code == 201
    duplicate = client.post(
        lp(client, "/members"), json={"displayName": "Dup", "fullName": "Dup, D", "email": "VEE@example.com"}, headers=captain_headers(client)
    )
    assert duplicate.status_code == 409
    assert client.post(lp(client, "/members"), json={"displayName": "Bad", "fullName": "B", "email": "nope"}, headers=captain_headers(client)).status_code == 422


def test_members_who_left_are_off_the_team_sheet(client: TestClient) -> None:
    engine = get_engine(client.app.state.settings)
    with engine.begin() as connection:
        connection.execute(
            text("select set_config('piele.league_id', :id, true)"),
            {"id": str(client.league_id)},  # type: ignore[attr-defined]
        )
        connection.execute(
            text(
                "update piele.league_memberships set status = 'withdrawn', left_at = now()"
                " where league_id = :id and display_name = 'Ola'"
            ),
            {"id": str(client.league_id)},  # type: ignore[attr-defined]
        )
    members = client.get(lp(client, "/members"), headers=captain_headers(client)).json()
    assert {m["displayName"] for m in members} == {"Captain", "Mo"}


# Duties and marks ---------------------------------------------------------------------


def test_captain_creates_spoon_duty_with_next_round_kickoff_deadline(client: TestClient) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    duty = open_duty(client, mo_id, round_number=2)
    assert duty["title"] == "Round 02 Spoon duty"
    assert duty["status"] == "open" and duty["memberName"] == "Mo"
    assert duty["deadlineAt"].startswith("2026-10-09T18:45")
    default = client.get(lp(client, "/duties/default-deadline"), params={"type": "spoon", "round": 18}, headers=captain_headers(client))
    assert default.json()["deadlineAt"] is None  # playoff kickoffs are unknown
    pending = open_duty(client, mo_id, round_number=18)
    assert pending["status"] == "pending_deadline" and pending["marks"]["marks"] == 0
    listed = client.get(lp(client, "/duties"), params={"round": 2}, headers=mo).json()
    assert [d["id"] for d in listed] == [duty["id"]]
    feed = client.get(lp(client, "/feed"), params={"round": 2}, headers=captain_headers(client)).json()
    assert feed[0]["kind"] == "duty_created" and feed[0]["subjectName"] == "Mo"


def test_duty_rules_and_captain_authority(client: TestClient) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    body = {"memberId": str(mo_id), "type": "spoon", "roundNumber": 3}
    refused = client.post(lp(client, "/duties"), json=body, headers=mo)
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "captain_only"
    open_duty(client, mo_id, round_number=3)
    duplicate = client.post(lp(client, "/duties"), json=body, headers=captain_headers(client))
    assert duplicate.status_code == 409 and duplicate.json()["detail"]["code"] == "duplicate_duty"
    explicit = open_duty(client, mo_id, round_number=3, duty_type="pick_confirmation", deadlineAt="2026-10-20T10:00:00Z", reason="Missing picks")
    assert explicit["deadlineAt"].startswith("2026-10-20T10:00") and explicit["reason"] == "Missing picks"
    unknown = client.post(lp(client, "/duties"), json={**body, "memberId": str(uuid4())}, headers=captain_headers(client))
    assert unknown.status_code == 404
    voided = client.post(lp(client, f"/duties/{explicit['id']}/void"), json={"reason": "Picks were found"}, headers=captain_headers(client))
    assert voided.status_code == 200 and voided.json()["status"] == "voided" and voided.json()["voidReason"] == "Picks were found"
    assert client.post(lp(client, f"/duties/{explicit['id']}/void"), json={"reason": "again"}, headers=captain_headers(client)).status_code == 409
    assert client.post(lp(client, f"/duties/{explicit['id']}/void"), json={"reason": "x"}, headers=mo).status_code == 403
    # A member can create nothing, but the same duty for another round is fine.
    open_duty(client, mo_id, round_number=4)


def test_marks_accrue_per_full_week_overdue(client: TestClient) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    weeks_ago = (now_utc() - timedelta(hours=168 * 2 + 3)).isoformat()
    duty = open_duty(client, mo_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert duty["display"] == "overdue" and duty["marks"]["marks"] == 2
    assert duty["marks"]["nextMarkAt"] is not None
    totals = client.get(lp(client, "/marks"), headers=mo).json()
    assert totals == [{"memberId": str(mo_id), "memberName": "Mo", "marks": 2, "openDuties": 1}]


# Superbru standings -------------------------------------------------------------------


def put_standings(client: TestClient, round_number: int, points: dict[UUID, float], headers: dict | None = None, league_id: str | None = None):
    body = {"standings": [{"memberId": str(member_id), "points": value} for member_id, value in points.items()]}
    return client.put(lp(client, f"/rounds/{round_number}/standings", league_id), json=body, headers=headers or captain_headers(client))


def test_captain_records_round_standings_and_members_read_them(client: TestClient) -> None:
    mo = mo_headers(client)
    ids = {m["displayName"]: UUID(m["id"]) for m in client.get(lp(client, "/members"), headers=mo).json()}
    mo_id = ids["Mo"]
    assert put_standings(client, 1, {mo_id: 5}, headers=mo).status_code == 403

    recorded = put_standings(client, 1, {ids["Ola"]: 0, ids["Captain"]: 1.5, mo_id: 5})
    assert recorded.status_code == 200, recorded.text
    assert [(s["memberName"], s["rank"], s["points"]) for s in recorded.json()] == [
        ("Mo", 1, 5.0),
        ("Captain", 2, 1.5),
        ("Ola", 3, 0.0),
    ]
    feed = client.get(lp(client, "/feed"), params={"round": 1}, headers=mo).json()
    assert feed[0]["kind"] == "standings_recorded"
    assert feed[0]["title"] == "Round 01 Superbru standings updated."
    assert feed[0]["detail"] == "Mo leads on 5 points."

    # Tied points share a rank; the next rank skips. Ola is left out and loses her row.
    put_standings(client, 1, {mo_id: 1.5, ids["Captain"]: 1.5})
    table = client.get(lp(client, "/standings"), params={"round": 1}, headers=mo).json()
    assert [(s["memberName"], s["rank"]) for s in table] == [("Captain", 1), ("Mo", 1)]
    put_standings(client, 2, {ids["Ola"]: 3, mo_id: 1.5, ids["Captain"]: 1.5})
    table = client.get(lp(client, "/standings"), params={"round": 2}, headers=mo).json()
    assert [(s["memberName"], s["rank"]) for s in table] == [("Ola", 1), ("Captain", 2), ("Mo", 2)]
    assert len(client.get(lp(client, "/standings"), headers=mo).json()) == 5

    # Recording the same table again changes nothing and posts nothing.
    before = len(client.get(lp(client, "/feed"), headers=mo).json())
    assert put_standings(client, 2, {ids["Ola"]: 3, mo_id: 1.5, ids["Captain"]: 1.5}).status_code == 200
    assert len(client.get(lp(client, "/feed"), headers=mo).json()) == before


def test_round_standings_are_validated(client: TestClient) -> None:
    ids = {m["displayName"]: UUID(m["id"]) for m in client.get(lp(client, "/members"), headers=captain_headers(client)).json()}
    unknown = put_standings(client, 1, {uuid4(): 1})
    assert unknown.status_code == 404 and unknown.json()["detail"]["code"] == "unknown_member"
    duplicate = client.put(
        lp(client, "/rounds/1/standings"),
        json={"standings": [{"memberId": str(ids["Mo"]), "points": 1}, {"memberId": str(ids["Mo"]), "points": 2}]},
        headers=captain_headers(client),
    )
    assert duplicate.status_code == 422 and duplicate.json()["detail"]["code"] == "duplicate_member"
    assert put_standings(client, 1, {ids["Mo"]: 1.25}).status_code == 422
    assert put_standings(client, 1, {ids["Mo"]: -1}).status_code == 422
    assert put_standings(client, 22, {ids["Mo"]: 1}).status_code == 422
    assert client.get(lp(client, "/standings"), headers=captain_headers(client)).json() == []


# Evidence -----------------------------------------------------------------------------


def test_member_evidence_is_reviewed_and_completion_counts_from_submission(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    duty = open_duty(client, mo_id, round_number=2)
    submission = upload_and_submit(client, storage, mo, [duty["id"]], note="Done on Sunday")
    listed = client.get(lp(client, "/duties"), params={"round": 2}, headers=mo).json()[0]
    assert listed["display"] == "under_review"
    link = listed["evidence"][0]
    assert link["decision"] == "pending" and link["note"] == "Done on Sunday" and link["submissionId"] == submission["id"]
    # The member cannot decide their own evidence; the captain can.
    assert client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted"}, headers=mo).status_code == 403
    decided = client.post(
        lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted", "reason": "Clear video"}, headers=captain_headers(client)
    )
    assert decided.status_code == 204, decided.text
    done = client.get(lp(client, "/duties"), params={"round": 2}, headers=mo).json()[0]
    assert done["status"] == "completed" and done["completedAt"] == done["evidence"][0]["submittedAt"]
    assert done["evidence"][0]["effectiveCompletedAt"] == done["evidence"][0]["submittedAt"]
    assert client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "rejected"}, headers=captain_headers(client)).status_code == 409
    playback = client.get(lp(client, f"/evidence/assets/{link['assetId']}/playback"), headers=captain_headers(client))
    assert playback.status_code == 200 and playback.json()["url"].startswith("https://storage.example/")
    kinds = [f["kind"] for f in client.get(lp(client, "/feed"), params={"round": 2}, headers=mo).json()]
    assert kinds == ["evidence_accepted", "evidence_submitted", "duty_created"]


def test_captain_submits_on_behalf_with_claimed_completion_time(client: TestClient, storage: FakeStorage) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    captain = captain_headers(client)
    missing_time = client.post(
        lp(client, "/evidence"),
        json={"assetId": str(uuid4()), "dutyIds": [duty["id"]], "subjectMemberId": str(mo_id)},
        headers=captain,
    )
    assert missing_time.json()["detail"]["code"] == "completion_time_required"
    claimed = "2026-09-20T09:00:00Z"
    upload_and_submit(client, storage, captain, [duty["id"]], subjectMemberId=str(mo_id), claimedCompletedAt=claimed)
    link = client.get(lp(client, "/duties"), params={"round": 2}, headers=captain).json()[0]["evidence"][0]
    assert link["submitterName"] == "Captain" and link["claimedCompletedAt"].startswith("2026-09-20T09:00")
    assert client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted"}, headers=captain).status_code == 204
    done = client.get(lp(client, "/duties"), params={"round": 2}, headers=captain).json()[0]
    assert done["completedAt"].startswith("2026-09-20T09:00")


def test_captain_cannot_review_own_evidence_and_members_cannot_submit_for_others(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    captain = captain_headers(client)
    captain_id = client.get(lp(client, "/me"), headers=captain).json()["memberId"]
    own = open_duty(client, UUID(captain_id), round_number=2)
    upload_and_submit(client, storage, captain, [own["id"]])
    link = client.get(lp(client, "/duties"), params={"round": 2}, headers=captain).json()[0]["evidence"][0]
    self_review = client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted"}, headers=captain)
    assert self_review.status_code == 403 and self_review.json()["detail"]["code"] == "self_review"
    others = open_duty(client, mo_id, round_number=3)
    grant = client.post(lp(client, "/evidence/uploads"), json={"filename": "p.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).json()
    storage.objects[grant["path"]] = StoredObject(10, "video/mp4")
    for_other = client.post(
        lp(client, "/evidence"), json={"assetId": grant["assetId"], "dutyIds": [others["id"]], "subjectMemberId": captain_id, "claimedCompletedAt": "2026-10-01T00:00:00Z"}, headers=mo
    )
    assert for_other.status_code == 403


def test_upload_validation_and_storage_failures(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    duty = open_duty(client, mo_id, round_number=2)
    uploads, evidence = lp(client, "/evidence/uploads"), lp(client, "/evidence")
    bad_type = client.post(uploads, json={"filename": "a.txt", "contentType": "text/plain", "sizeBytes": 10}, headers=mo)
    assert bad_type.json()["detail"]["code"] == "not_a_video"
    too_big = client.post(uploads, json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 60 * 1024 * 1024}, headers=mo)
    assert too_big.json()["detail"]["code"] == "too_large"
    grant = client.post(uploads, json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).json()
    not_uploaded = client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert not_uploaded.json()["detail"]["code"] == "upload_missing"
    storage.objects[grant["path"]] = StoredObject(10, "image/png")
    assert client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo).json()["detail"]["code"] == "not_a_video"
    storage.objects[grant["path"]] = StoredObject(10, "video/mp4")
    someone_elses = client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=captain_headers(client))
    assert someone_elses.status_code == 404
    storage.down = True
    assert client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo).status_code == 503
    assert client.post(uploads, json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).status_code == 503
    storage.down = False
    ok = client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert ok.status_code == 201
    reused = client.post(evidence, json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert reused.json()["detail"]["code"] == "asset_used"


def test_failed_mutation_leaves_no_audit_or_feed_rows(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    before = len(client.get(lp(client, "/feed"), headers=captain_headers(client)).json())
    open_duty(client, mo_id, round_number=6)
    duplicate = client.post(lp(client, "/duties"), json={"memberId": str(mo_id), "type": "spoon", "roundNumber": 6}, headers=captain_headers(client))
    assert duplicate.status_code == 409
    assert len(client.get(lp(client, "/feed"), headers=captain_headers(client)).json()) == before + 1


def test_leagues_are_isolated(client: TestClient) -> None:
    """A second bootstrapped league never sees the first one's rows."""
    mo_id = invite(client, "Mo", client.mo_email)
    open_duty(client, mo_id, round_number=2)
    engine = get_engine(client.app.state.settings)
    email = f"other-{uuid4().hex[:8]}@example.com"
    with engine.begin() as connection:
        other_league = new_league(connection, email)
    other = signed_in(client, "OTHER", email)
    assert client.get(lp(client, "/duties", other_league), headers=other).json() == []
    assert len(client.get(lp(client, "/members", other_league), headers=other).json()) == 3
    assert client.get(lp(client, "/feed", other_league), headers=other).json()[0]["kind"] == "member_joined"
    # The other league's captain cannot read or act in the first league.
    assert client.get(lp(client, "/duties"), headers=other).json()["detail"]["code"] == "not_a_member"
    assert client.post(lp(client, "/members"), json={"displayName": "X", "fullName": "X, Y"}, headers=other).status_code == 403


# Several leagues, the admin and joining by code ------------------------------------------


def join_code(client: TestClient, league_id: str | None = None) -> str:
    """The league's join code straight from the database (the captain reads it from `me`)."""
    with get_engine(client.app.state.settings).begin() as connection:
        league_id = league_id or client.league_id  # type: ignore[attr-defined]
        connection.execute(text("select set_config('piele.league_id', :id, true)"), {"id": league_id})
        return connection.execute(text("select join_code from piele.leagues where id = :id"), {"id": league_id}).scalar_one()


def second_league(client: TestClient, captain_email: str, name: str = "Zulu league") -> str:
    with get_engine(client.app.state.settings).begin() as connection:
        return new_league(connection, captain_email, {**SEED, "league": name})


def test_one_account_in_two_leagues_sees_each_league_separately(client: TestClient) -> None:
    # The account is Mo in the first league and captain of a second league on the same email.
    invite(client, "Mo", client.mo_email)
    zulu = second_league(client, client.mo_email)
    headers = auth(subject(client, "MO"), client.mo_email)
    account = client.get("/v1/me", headers=headers).json()
    assert account["isAdmin"] is False and account["lastLeagueId"] is None and account["photoUrl"] is None
    assert [(league["name"], league["displayName"], league["isCaptain"]) for league in account["leagues"]] == [
        ("Test league", "Mo", False),
        ("Zulu league", "Captain", True),
    ]
    first = account["leagues"][0]
    assert first["id"] == client.league_id and first["slug"].startswith("test-") and first["inSeason"] is True
    assert first["competition"]["id"] == "urc-2026-27" and first["seasonName"] == "URC 2026/27"
    assert first["emblemUrl"] is None and first["accentColour"] is None and first["timezone"] == "Africa/Johannesburg"

    here, there = client.get(lp(client, "/me"), headers=headers).json(), client.get(lp(client, "/me", zulu), headers=headers).json()
    assert (here["displayName"], here["isCaptain"], here["leagueName"]) == ("Mo", False, "Test league")
    assert (there["displayName"], there["isCaptain"], there["leagueName"]) == ("Captain", True, "Zulu league")

    # Standings, feed, team and read marks are per league.
    zulu_ids = {m["displayName"]: UUID(m["id"]) for m in client.get(lp(client, "/members", zulu), headers=headers).json()}
    assert put_standings(client, 1, {zulu_ids["Ola"]: 4}, headers=headers, league_id=zulu).status_code == 200
    assert put_standings(client, 1, {zulu_ids["Ola"]: 4}, headers=headers).status_code == 403
    assert client.get(lp(client, "/standings"), headers=headers).json() == []
    assert [s["memberName"] for s in client.get(lp(client, "/standings", zulu), headers=headers).json()] == ["Ola"]
    assert client.get(lp(client, "/feed", zulu), headers=headers).json()[0]["kind"] == "standings_recorded"
    assert client.get(lp(client, "/feed"), headers=headers).json()[0]["kind"] == "member_joined"
    assert client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "dhl-stormers"}, headers=headers).status_code == 200
    client.put(lp(client, "/me/notifications"), json={"readAt": "2026-09-20T08:00:00Z", "readKeys": ["a"]}, headers=headers)
    there = client.get(lp(client, "/me", zulu), headers=headers).json()
    assert there["favouriteTeamId"] is None and there["notificationsReadAt"] is None and there["notificationsReadKeys"] == []
    assert client.get(lp(client, "/me"), headers=headers).json()["favouriteTeamId"] == "dhl-stormers"
    teams = {league["name"]: league["favouriteTeamId"] for league in client.get("/v1/me", headers=headers).json()["leagues"]}
    assert teams == {"Test league": "dhl-stormers", "Zulu league": None}

    # The last league opened is remembered for a fresh device.
    assert client.put(lp(client, "/me/last", zulu), headers=headers).status_code == 204
    assert client.get("/v1/me", headers=headers).json()["lastLeagueId"] == zulu


def test_the_admin_reads_every_league_and_needs_a_membership_to_write(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    admin = signed_in(client, "ADMIN", f"admin-{uuid4().hex[:8]}@example.com")
    assert client.get(lp(client, "/me"), headers=admin).json()["detail"]["code"] == "not_a_member"
    make_admin(subject(client, "ADMIN"))

    me = client.get(lp(client, "/me"), headers=admin)
    assert me.status_code == 200, me.text
    body = me.json()
    assert (body["memberId"], body["displayName"], body["isCaptain"]) == (None, "Admin", False)
    assert body["isAdmin"] is True and body["administers"] is True and body["inSeason"] is False
    assert body["favouriteTeamId"] is None and body["notificationsReadKeys"] == []
    listed = client.get("/v1/me", headers=admin).json()
    assert listed["isAdmin"] is True
    entry = next(league for league in listed["leagues"] if league["id"] == client.league_id)
    assert (entry["memberId"], entry["displayName"], entry["favouriteTeamId"], entry["isCaptain"]) == (None, None, None, False)

    # Reads work; the captain's view of the team sheet includes emails.
    assert len(client.get(lp(client, "/duties"), headers=admin).json()) == 1
    assert next(m for m in client.get(lp(client, "/members"), headers=admin).json() if m["displayName"] == "Mo")["email"] == client.mo_email
    # Writes the schema attributes to a member need a membership.
    for response in (
        client.post(lp(client, "/duties"), json={"memberId": str(mo_id), "type": "spoon", "roundNumber": 3}, headers=admin),
        put_standings(client, 1, {mo_id: 1}, headers=admin),
        client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "dhl-stormers"}, headers=admin),
        client.put(lp(client, "/me/notifications"), json={"readAt": None, "readKeys": []}, headers=admin),
        client.post(lp(client, "/evidence/uploads"), json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=admin),
    ):
        assert response.status_code == 409, response.text
        assert response.json()["detail"] == {
            "code": "admin_not_a_member",
            "message": "Add yourself to this league from the management centre first.",
        }

    # Captain routes accept the admin, and the records name no member.
    mo = signed_in(client, "MO", client.mo_email)
    added = client.post(lp(client, "/members"), json={"displayName": "Vee", "fullName": "Visser, Vee"}, headers=admin)
    assert added.status_code == 201, added.text
    assert client.patch(lp(client, f"/members/{added.json()['id']}"), json={"displayName": "Vee2"}, headers=admin).status_code == 204
    voided = client.post(lp(client, f"/duties/{duty['id']}/void"), json={"reason": "Admin says so"}, headers=admin)
    assert voided.status_code == 200 and voided.json()["status"] == "voided"
    assert client.post(lp(client, f"/members/{mo_id}/release"), headers=admin).status_code == 204
    assert client.get(lp(client, "/me"), headers=mo).status_code == 403
    captain_id = client.get(lp(client, "/me"), headers=captain_headers(client)).json()["memberId"]
    assert client.post(lp(client, f"/members/{captain_id}/release"), headers=admin).json()["detail"]["code"] == "captain_membership"
    feed = client.get(lp(client, "/feed"), headers=admin).json()
    assert feed[0]["kind"] == "duty_voided" and feed[0]["actorName"] is None
    assert feed[1]["kind"] == "member_added" and feed[1]["actorName"] is None
    with migration_engine().begin() as connection:
        labels = connection.execute(
            text(
                "select action, actor_label, actor_membership_id from piele.audit_events"
                " where league_id = :id and action in ('membership.created', 'duty.voided', 'membership.released')"
                " order by occurred_at"
            ),
            {"id": client.league_id},  # type: ignore[attr-defined]
        ).all()
    assert [tuple(row) for row in labels] == [
        ("membership.created", "admin", None),
        ("duty.voided", "admin", None),
        ("membership.released", "admin", None),
    ]

    # Previews are for members of a league on the competition, or the admin.
    stranger = signed_in(client, "STRANGER", "stranger@example.com")
    preview = "/v1/competitions/urc-2026-27/matches/292700/preview"
    assert client.get(preview, headers=stranger).json()["detail"]["code"] == "not_a_member"
    assert client.get(preview, headers=admin).status_code == 200
    assert client.get(preview, headers=captain_headers(client)).status_code == 200


def test_join_by_code_lists_only_that_leagues_names_and_claims_one(client: TestClient) -> None:
    mo = mo_headers(client)
    assert client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "munster-rugby"}, headers=mo).status_code == 200
    zulu_captain = f"zulu-{uuid4().hex[:8]}@example.com"
    zulu = second_league(client, zulu_captain)
    code = join_code(client, zulu)
    first_ids = {m["id"] for m in client.get(lp(client, "/members"), headers=mo).json()}

    invitation = client.get(f"/v1/join/{code}", headers=mo)
    assert invitation.status_code == 200, invitation.text
    body = invitation.json()
    assert body["alreadyMember"] is False
    assert body["league"]["id"] == zulu and body["league"]["name"] == "Zulu league" and body["league"]["seasonName"] == "URC 2026/27"
    assert body["league"]["competition"]["shortName"] == "URC" and body["league"]["emblemUrl"] is None
    names = {n["displayName"]: n for n in body["unclaimed"]}
    assert set(names) == {"Mo", "Ola"}  # the captain's name is reserved for another address
    assert not {n["id"] for n in body["unclaimed"]} & first_ids
    assert names["Ola"]["fullName"] == "Other, Ola"
    assert client.get(f"/v1/join/{code.upper()}", headers=mo).status_code == 200
    assert client.get("/v1/join/not-a-code", headers=mo).json()["detail"]["code"] == "unknown_join_code"
    assert client.get("/v1/join/abcdef123456", headers=mo).json()["detail"]["code"] == "unknown_join_code"
    assert client.get(f"/v1/join/{code}").status_code == 401

    zulu_headers = signed_in(client, "ZULU", zulu_captain)
    zulu_ids = {m["displayName"]: m["id"] for m in client.get(lp(client, "/members", zulu), headers=zulu_headers).json()}
    invite(client, "Mo", f"zulu-mo-{uuid4().hex[:8]}@example.com", league_id=zulu, headers=zulu_headers)
    reserved = client.post(f"/v1/join/{code}", json={"membershipId": zulu_ids["Mo"]}, headers=mo)
    assert reserved.status_code == 403 and reserved.json()["detail"]["code"] == "reserved"
    unknown = client.post(f"/v1/join/{code}", json={"membershipId": str(uuid4())}, headers=mo)
    assert unknown.status_code == 409 and unknown.json()["detail"]["code"] == "name_taken"

    joined = client.post(f"/v1/join/{code}", json={"membershipId": zulu_ids["Ola"]}, headers=mo)
    assert joined.status_code == 200, joined.text
    me = joined.json()
    assert (me["leagueId"], me["displayName"], me["memberId"], me["isCaptain"]) == (zulu, "Ola", zulu_ids["Ola"], False)
    # The team comes along from the first league on the same competition.
    assert me["favouriteTeamId"] == "munster-rugby"
    assert [f["kind"] for f in client.get(lp(client, "/feed", zulu), headers=mo).json()][0] == "member_joined"
    assert [league["id"] for league in client.get("/v1/me", headers=mo).json()["leagues"]] == [client.league_id, zulu]
    assert client.get(f"/v1/join/{code}", headers=mo).json()["alreadyMember"] is True

    again = client.post(f"/v1/join/{code}", json={"membershipId": zulu_ids["Mo"]}, headers=mo)
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_member"
    other = signed_in(client, "OTHER", "other@example.com")
    taken = client.post(f"/v1/join/{code}", json={"membershipId": zulu_ids["Ola"]}, headers=other)
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "name_taken"
    # A code never claims a name in a different league.
    first_ola = next(m["id"] for m in client.get(lp(client, "/members"), headers=mo).json() if m["displayName"] == "Ola")
    assert client.post(f"/v1/join/{code}", json={"membershipId": first_ola}, headers=other).json()["detail"]["code"] == "name_taken"


def test_unclaimed_names_are_not_visible_across_leagues(client: TestClient) -> None:
    stranger = signed_in(client, "STRANGER", "stranger@example.com")
    assert client.get("/v1/memberships/unclaimed", headers=stranger).status_code == 404
    assert client.post("/v1/memberships/claim", json={"memberId": str(uuid4())}, headers=stranger).status_code == 404
    # Row level security: a signed-in account outside every league context sees no unclaimed
    # name except those reserved for its own verified email.
    invite(client, "Mo", client.mo_email)
    with get_engine(client.app.state.settings).begin() as connection:
        connection.execute(text("select set_config('piele.auth_subject', :s, true)"), {"s": str(subject(client, "STRANGER"))})
        connection.execute(text("select set_config('piele.auth_email', :e, true)"), {"e": client.mo_email})
        visible = connection.execute(
            text("select league_id, display_name from piele.league_memberships where user_id is null")
        ).all()
    assert [(str(row.league_id), row.display_name) for row in visible] == [(client.league_id, "Mo")]


def test_create_league_refuses_a_taken_slug(client: TestClient) -> None:
    engine = get_engine(client.app.state.settings)
    slug = f"test-{uuid4().hex[:12]}"
    with engine.begin() as connection:
        bootstrap.bootstrap(connection, f"a-{uuid4().hex[:8]}@example.com", SEED, slug=slug)
    with engine.begin() as connection, pytest.raises(SystemExit, match="refusing to bootstrap twice"):
        bootstrap.bootstrap(connection, f"b-{uuid4().hex[:8]}@example.com", SEED, slug=slug)
    with engine.begin() as connection, pytest.raises(SystemExit, match="slug"):
        bootstrap.bootstrap(connection, "c@example.com", SEED, slug="Not A Slug")
    with engine.begin() as connection, pytest.raises(SystemExit, match="reserved"):
        bootstrap.bootstrap(connection, "c@example.com", SEED, slug="standings")
    with engine.begin() as connection, pytest.raises(SystemExit, match="Unknown time zone"):
        bootstrap.bootstrap(connection, "c@example.com", SEED, slug=f"test-{uuid4().hex[:12]}", timezone="Mars/Olympus")


# Own profile --------------------------------------------------------------------------

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 60


def upload_photo(client: TestClient, storage: FakeStorage, headers: dict, content: bytes = JPEG) -> str:
    grant = client.post(lp(client, "/me/photo/uploads"), json={"contentType": "image/jpeg", "sizeBytes": len(content)}, headers=headers)
    assert grant.status_code == 201, grant.text
    path = grant.json()["path"]
    storage.objects[path] = StoredObject(size_bytes=len(content), content_type="image/jpeg")
    storage.contents[path] = content
    return path


def test_members_save_their_own_team_and_photo(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    me = client.get(lp(client, "/me"), headers=mo).json()
    assert me["favouriteTeamId"] is None and me["photoUrl"] is None
    unknown = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "made-up-fc"}, headers=mo).json()["detail"]
    assert unknown == {"code": "unknown_team", "message": "Choose a team from this competition."}

    saved = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "dhl-stormers"}, headers=mo)
    assert saved.status_code == 200, saved.text
    assert saved.json()["favouriteTeamId"] == "dhl-stormers" and saved.json()["photoUrl"] is None

    first = upload_photo(client, storage, mo)
    with_photo = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "dhl-stormers", "photoPath": first}, headers=mo).json()
    assert with_photo["photoUrl"].startswith(f"https://storage.example/{first}")
    # Another device signs in later and gets the same profile; the photo is account-wide.
    again = client.get(lp(client, "/me"), headers=auth(subject(client, "MO"), client.mo_email)).json()
    assert again["favouriteTeamId"] == "dhl-stormers" and again["photoUrl"].startswith(f"https://storage.example/{first}")
    assert client.get("/v1/me", headers=mo).json()["photoUrl"].startswith(f"https://storage.example/{first}")
    # Changing only the team keeps the photo.
    kept = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "munster-rugby"}, headers=mo).json()
    assert kept["favouriteTeamId"] == "munster-rugby" and kept["photoUrl"].startswith(f"https://storage.example/{first}")

    second = upload_photo(client, storage, mo)
    replaced = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "munster-rugby", "photoPath": second}, headers=mo).json()
    assert replaced["photoUrl"].startswith(f"https://storage.example/{second}")
    assert storage.deleted == [first]
    removed = client.put(lp(client, "/me/profile"), json={"favouriteTeamId": "munster-rugby", "removePhoto": True}, headers=mo).json()
    assert removed["photoUrl"] is None and storage.deleted == [first, second]
    # The captain's profile is untouched by Mo's changes.
    assert client.get(lp(client, "/me"), headers=captain_headers(client)).json()["favouriteTeamId"] is None


def test_profile_photos_are_checked_and_owned(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    captain = captain_headers(client)
    uploads, profile = lp(client, "/me/photo/uploads"), lp(client, "/me/profile")
    bad_type = client.post(uploads, json={"contentType": "image/png", "sizeBytes": 10}, headers=mo)
    assert bad_type.json()["detail"]["code"] == "not_a_jpeg"
    too_big = client.post(uploads, json={"contentType": "image/jpeg", "sizeBytes": 600 * 1024}, headers=mo)
    assert too_big.json()["detail"]["code"] == "too_large"

    captains_photo = upload_photo(client, storage, captain)
    stolen = client.put(profile, json={"favouriteTeamId": "ospreys", "photoPath": captains_photo}, headers=mo)
    assert stolen.json()["detail"]["code"] == "unknown_photo"
    outside = client.put(profile, json={"favouriteTeamId": "ospreys", "photoPath": "https://elsewhere.test/me.jpg"}, headers=mo)
    assert outside.json()["detail"]["code"] == "unknown_photo"

    grant = client.post(uploads, json={"contentType": "image/jpeg", "sizeBytes": 10}, headers=mo).json()
    missing = client.put(profile, json={"favouriteTeamId": "ospreys", "photoPath": grant["path"]}, headers=mo)
    assert missing.json()["detail"]["code"] == "photo_missing"
    # The upload claimed to be a JPEG but is not one.
    fake = upload_photo(client, storage, mo, content=b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    rejected = client.put(profile, json={"favouriteTeamId": "ospreys", "photoPath": fake}, headers=mo)
    assert rejected.json()["detail"]["code"] == "invalid_photo" and fake in storage.deleted
    assert client.get(lp(client, "/me"), headers=mo).json()["favouriteTeamId"] is None

    good = upload_photo(client, storage, mo)
    assert client.put(profile, json={"favouriteTeamId": "ospreys", "photoPath": good}, headers=mo).status_code == 200
    storage.down = True
    assert client.post(uploads, json={"contentType": "image/jpeg", "sizeBytes": 10}, headers=mo).status_code == 503
    # The team still loads when Storage cannot sign the photo.
    me = client.get(lp(client, "/me"), headers=mo).json()
    assert me["favouriteTeamId"] == "ospreys" and me["photoUrl"] is None


# Claiming a Superbru name --------------------------------------------------------------


def league_member_id(client: TestClient, name: str) -> str:
    members = client.get(lp(client, "/members"), headers=captain_headers(client)).json()
    return next(m["id"] for m in members if m["displayName"] == name)


def test_signed_in_account_claims_an_unclaimed_name_once(client: TestClient) -> None:
    ola_id = league_member_id(client, "Ola")
    code = join_code(client)
    ola = signed_in(client, "OLA", "ola@example.com")
    assert client.get(lp(client, "/me"), headers=ola).json()["detail"]["code"] == "not_a_member"
    names = client.get(f"/v1/join/{code}", headers=ola).json()["unclaimed"]
    assert ola_id in {n["id"] for n in names}
    captain_id = league_member_id(client, "Captain")
    assert captain_id not in {n["id"] for n in names}  # reserved for the captain's email
    claimed = client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=ola)
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["displayName"] == "Ola" and claimed.json()["isCaptain"] is False
    assert client.get(lp(client, "/me"), headers=ola).json()["memberId"] == ola_id
    # Taken names disappear, a second account cannot take it and a member cannot take two.
    assert ola_id not in {n["id"] for n in client.get(f"/v1/join/{code}", headers=ola).json()["unclaimed"]}
    other = signed_in(client, "OTHER", "other@example.com")
    assert client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=other).json()["detail"]["code"] == "name_taken"
    mo_id = league_member_id(client, "Mo")
    assert client.post(f"/v1/join/{code}", json={"membershipId": mo_id}, headers=ola).json()["detail"]["code"] == "already_member"
    # The captain's name was claimed by the captain's sign-in; Mo is reserved for an address.
    assert client.post(f"/v1/join/{code}", json={"membershipId": captain_id}, headers=other).json()["detail"]["code"] == "name_taken"
    invite(client, "Mo", client.mo_email)
    reserved = client.post(f"/v1/join/{code}", json={"membershipId": mo_id}, headers=other)
    assert reserved.status_code == 403 and reserved.json()["detail"]["code"] == "reserved"
    kinds = [f["kind"] for f in client.get(lp(client, "/feed"), headers=ola).json()]
    assert kinds[0] == "member_joined"


def test_captain_releases_a_wrong_claim(client: TestClient) -> None:
    ola_id = league_member_id(client, "Ola")
    code = join_code(client)
    wrong = signed_in(client, "WRONG", "wrong@example.com")
    client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=wrong)
    assert client.post(lp(client, f"/members/{ola_id}/release"), headers=wrong).status_code == 403
    assert client.post(lp(client, f"/members/{ola_id}/release"), headers=captain_headers(client)).status_code == 204
    assert client.get(lp(client, "/me"), headers=wrong).status_code == 403
    right = signed_in(client, "RIGHT", "right@example.com")
    assert client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=right).status_code == 200
    captain_id = league_member_id(client, "Captain")
    assert client.post(lp(client, f"/members/{captain_id}/release"), headers=captain_headers(client)).status_code == 409
    mo_id = league_member_id(client, "Mo")
    assert client.post(lp(client, f"/members/{mo_id}/release"), headers=captain_headers(client)).json()["detail"]["code"] == "not_claimed"


# Challenges and the overdue clock --------------------------------------------------------


def test_a_challenge_upheld_for_the_member_resets_the_overdue_clock(client: TestClient) -> None:
    mo = mo_headers(client)
    mo_id = UUID(client.get(lp(client, "/me"), headers=mo).json()["memberId"])
    weeks_ago = (now_utc() - timedelta(hours=168 * 2 + 3)).isoformat()
    duty = open_duty(client, mo_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert duty["marks"]["marks"] == 2
    assert client.post(lp(client, f"/duties/{duty['id']}/reset-clock"), json={"reason": "x"}, headers=mo).status_code == 403
    reset = client.post(
        lp(client, f"/duties/{duty['id']}/reset-clock"), json={"reason": "Challenge upheld: picks were in"}, headers=captain_headers(client)
    )
    assert reset.status_code == 200, reset.text
    body = reset.json()
    assert body["marks"]["marks"] == 0 and body["clockResetAt"] is not None
    assert body["display"] == "overdue"  # the duty stays open and accrues again from now
    feed = client.get(lp(client, "/feed"), params={"round": 5}, headers=mo).json()
    assert feed[0]["kind"] == "duty_clock_reset" and feed[0]["detail"] == "Challenge upheld: picks were in"
    captain_id = UUID(client.get(lp(client, "/me"), headers=captain_headers(client)).json()["memberId"])
    own = open_duty(client, captain_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert client.post(lp(client, f"/duties/{own['id']}/reset-clock"), json={"reason": "x"}, headers=captain_headers(client)).status_code == 403


def test_marks_rule_keeps_accruing_and_resets_from_the_reset_time() -> None:
    from app.league.marks import calculate

    deadline = datetime(2026, 10, 2, 18, 45, tzinfo=timezone.utc)
    now = deadline + timedelta(hours=400)
    assert calculate(deadline_at=deadline, completed_at=None, voided=False, now=now).marks == 2
    reset = calculate(
        deadline_at=deadline, completed_at=None, voided=False, now=now, clock_reset_at=deadline + timedelta(hours=300)
    )
    assert reset.marks == 0 and reset.next_mark_at == deadline + timedelta(hours=468)
    later = calculate(
        deadline_at=deadline, completed_at=None, voided=False, now=deadline + timedelta(hours=480), clock_reset_at=deadline + timedelta(hours=300)
    )
    assert later.marks == 1
    done = calculate(deadline_at=deadline, completed_at=deadline + timedelta(hours=200), voided=False, now=now)
    assert done.marks == 1 and done.next_mark_at is None


# Removing and reinstating members --------------------------------------------------------


def audit_rows(client: TestClient, *actions: str) -> list:
    with migration_engine().begin() as connection:
        return connection.execute(
            text(
                "select action, entity_id, reason, before, after from piele.audit_events"
                " where league_id = :id and action = any(:actions) order by occurred_at, id"
            ),
            {"id": client.league_id, "actions": list(actions)},  # type: ignore[attr-defined]
        ).all()


def season_rows(client: TestClient, member_id: str) -> list:
    with migration_engine().begin() as connection:
        return connection.execute(
            text(
                "select id, status, effective_to from piele.season_memberships"
                " where membership_id = :m order by effective_from, created_at"
            ),
            {"m": member_id},
        ).all()


def withdraw(client: TestClient, member_id, reason: str = "Moved to Perth", headers: dict | None = None):
    return client.post(
        lp(client, f"/members/{member_id}/withdraw"), json={"reason": reason}, headers=headers or captain_headers(client)
    )


def test_withdrawing_a_member_voids_live_duties_and_takes_them_off_every_list(client: TestClient, storage: FakeStorage) -> None:
    mo = mo_headers(client)
    captain = captain_headers(client)
    mo_id = client.get(lp(client, "/me"), headers=mo).json()["memberId"]
    ola_id = league_member_id(client, "Ola")
    weeks_ago = (now_utc() - timedelta(hours=168 + 3)).isoformat()
    overdue = open_duty(client, UUID(mo_id), round_number=2, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert overdue["marks"]["marks"] == 1
    pending = open_duty(client, UUID(mo_id), round_number=18)  # playoff kickoff unknown: pending_deadline
    reviewed = open_duty(client, UUID(mo_id), round_number=3)
    submission = upload_and_submit(client, storage, mo, [reviewed["id"]])
    done = open_duty(client, UUID(mo_id), round_number=4)
    upload_and_submit(client, storage, captain, [done["id"]], subjectMemberId=mo_id, claimedCompletedAt=weeks_ago)
    link = next(d for d in client.get(lp(client, "/duties"), headers=captain).json() if d["id"] == done["id"])["evidence"][0]
    assert client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted"}, headers=captain).status_code == 204
    assert put_standings(client, 1, {UUID(mo_id): 7, UUID(ola_id): 3}).status_code == 200

    # Only the captain or the admin removes members, and a reason is required.
    assert withdraw(client, ola_id, headers=mo).json()["detail"]["code"] == "captain_only"
    assert client.post(lp(client, f"/members/{mo_id}/withdraw"), json={"reason": "  "}, headers=captain).status_code == 422
    assert client.post(lp(client, f"/members/{mo_id}/withdraw"), json={"reason": "x" * 501}, headers=captain).status_code == 422
    response = withdraw(client, mo_id, "Moved to Perth")
    assert response.status_code == 204, response.text

    # The member's next league request is refused and the account no longer lists the league.
    assert client.get(lp(client, "/me"), headers=mo).json()["detail"]["code"] == "not_a_member"
    assert client.get(lp(client, "/standings"), headers=mo).status_code == 403
    assert client.get("/v1/me", headers=mo).json()["leagues"] == []
    code = client.get(lp(client, "/me"), headers=captain).json()["joinCode"]
    rejoin = client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=mo)
    assert rejoin.status_code == 409 and rejoin.json()["detail"]["code"] == "withdrawn_member"

    # Off the team sheet, the standings, the duty register and the marks table.
    assert {m["displayName"] for m in client.get(lp(client, "/members"), headers=captain).json()} == {"Captain", "Ola"}
    assert [s["memberName"] for s in client.get(lp(client, "/standings"), headers=captain).json()] == ["Ola"]
    assert client.get(lp(client, "/standings"), headers=captain).json()[0]["rank"] == 1
    assert client.get(lp(client, "/duties"), headers=captain).json() == []
    assert client.get(lp(client, "/marks"), headers=captain).json() == []
    # The captain can ask for the withdrawn members; everyone else gets active members only.
    listed = {m["displayName"]: m for m in client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=captain).json()}
    assert set(listed) == {"Captain", "Mo", "Ola"}
    gone = listed["Mo"]
    assert gone["status"] == "withdrawn" and gone["withdrawalReason"] == "Moved to Perth" and gone["leftAt"] is not None
    assert gone["inSeason"] is False and gone["claimed"] is True
    assert listed["Ola"]["leftAt"] is None and listed["Ola"]["withdrawalReason"] is None
    ola = signed_in(client, "OLA", "ola@example.com")
    assert client.post(f"/v1/join/{code}", json={"membershipId": ola_id}, headers=ola).status_code == 200
    assert {m["displayName"] for m in client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=ola).json()} == {"Captain", "Ola"}
    # Recording a round without the withdrawn member keeps their row; including them is refused.
    assert put_standings(client, 1, {UUID(ola_id): 5}).status_code == 200
    assert put_standings(client, 1, {UUID(mo_id): 1}).json()["detail"]["code"] == "unknown_member"
    assert client.post(lp(client, "/duties"), json={"memberId": mo_id, "type": "spoon", "roundNumber": 6}, headers=captain).json()["detail"]["code"] == "unknown_member"

    # Live duties are voided; the completed one and the marks stay in the records.
    with migration_engine().begin() as connection:
        duties = {
            str(row.id): row
            for row in connection.execute(
                text("select id, status, void_reason from piele.duties where id = any(:ids)"),
                {"ids": [overdue["id"], pending["id"], reviewed["id"], done["id"]]},
            ).all()
        }
        decision = connection.execute(
            text("select decision from piele.duty_evidence_links where submission_id = :s"), {"s": submission["id"]}
        ).scalar_one()
        standings_rows = connection.execute(
            text("select count(*) from piele.round_standings where season_membership_id = :sm"),
            {"sm": season_rows(client, mo_id)[0].id},
        ).scalar_one()
    for duty in (overdue, pending, reviewed):
        assert (duties[duty["id"]].status, duties[duty["id"]].void_reason) == ("voided", "Member withdrawn")
    assert duties[done["id"]].status == "completed"
    assert decision == "superseded" and standings_rows == 1
    [enrolment] = season_rows(client, mo_id)
    assert enrolment.status == "withdrawn" and enrolment.effective_to is not None

    feed = client.get(lp(client, "/feed"), headers=captain).json()
    left = next(f for f in feed if f["kind"] == "member_left")
    assert left["title"] == "Mo left the clubhouse." and left["subjectName"] == "Mo"
    assert not [f for f in feed if f["kind"] == "duty_voided"]
    [event] = audit_rows(client, "membership.withdrawn")
    assert str(event.entity_id) == mo_id and event.reason == "Moved to Perth"
    assert sorted(event.after["voidedDutyIds"]) == sorted([overdue["id"], pending["id"], reviewed["id"]])
    assert len(audit_rows(client, "duty.voided")) == 3


def test_withdrawal_refusals(client: TestClient) -> None:
    captain = captain_headers(client)
    captain_id = client.get(lp(client, "/me"), headers=captain).json()["memberId"]
    refused = withdraw(client, captain_id)
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "captain_membership"
    unknown = withdraw(client, uuid4())
    assert unknown.status_code == 404 and unknown.json()["detail"]["code"] == "unknown_member"
    mo_id = invite(client, "Mo", client.mo_email)
    open_duty(client, mo_id, round_number=2)  # a record, so Mo is withdrawn rather than deleted
    assert withdraw(client, mo_id).status_code == 204
    again = withdraw(client, mo_id)
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_withdrawn"
    not_withdrawn = client.post(lp(client, f"/members/{captain_id}/reinstate"), headers=captain)
    assert not_withdrawn.status_code == 409 and not_withdrawn.json()["detail"]["code"] == "not_withdrawn"
    assert client.post(lp(client, f"/members/{uuid4()}/reinstate"), headers=captain).json()["detail"]["code"] == "unknown_member"

    # The admin holding a membership cannot remove it; a plain member cannot reinstate.
    ola_id = league_member_id(client, "Ola")
    admin = signed_in(client, "ADMIN", f"admin-{uuid4().hex[:8]}@example.com")
    assert client.post(f"/v1/join/{join_code(client)}", json={"membershipId": ola_id}, headers=admin).status_code == 200
    assert client.post(lp(client, f"/members/{mo_id}/reinstate"), headers=admin).json()["detail"]["code"] == "captain_only"
    make_admin(subject(client, "ADMIN"))
    own = withdraw(client, ola_id, headers=admin)
    assert own.status_code == 409 and own.json()["detail"]["code"] == "own_membership"
    assert withdraw(client, captain_id, headers=admin).json()["detail"]["code"] == "captain_membership"
    assert client.post(lp(client, f"/members/{mo_id}/reinstate"), headers=admin).status_code == 204


def test_an_unclaimed_name_without_records_is_deleted(client: TestClient) -> None:
    captain = captain_headers(client)
    added = client.post(lp(client, "/members"), json={"displayName": "Oops", "fullName": "Typo, Oops"}, headers=captain)
    oops_id = added.json()["id"]
    feed_before = len(client.get(lp(client, "/feed"), headers=captain).json())
    assert withdraw(client, oops_id, "Added by mistake").status_code == 204
    listed = client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=captain).json()
    assert oops_id not in {m["id"] for m in listed}
    assert season_rows(client, oops_id) == []
    assert len(client.get(lp(client, "/feed"), headers=captain).json()) == feed_before
    [event] = audit_rows(client, "membership.deleted")
    assert str(event.entity_id) == oops_id and event.before["displayName"] == "Oops"
    assert audit_rows(client, "membership.withdrawn") == []
    assert client.post(lp(client, f"/members/{oops_id}/reinstate"), headers=captain).json()["detail"]["code"] == "unknown_member"

    # An unclaimed name with a record is withdrawn instead, and leaves the join list.
    ola_id = league_member_id(client, "Ola")
    assert put_standings(client, 1, {UUID(ola_id): 2}).status_code == 200
    assert withdraw(client, ola_id).status_code == 204
    ola = next(m for m in client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=captain).json() if m["id"] == ola_id)
    assert ola["status"] == "withdrawn" and ola["claimed"] is False
    stranger = signed_in(client, "STRANGER", "stranger@example.com")
    assert ola_id not in {n["id"] for n in client.get(f"/v1/join/{join_code(client)}", headers=stranger).json()["unclaimed"]}

    # So is a name that was claimed once and released: the claim's feed entry points at it.
    mo_id = league_member_id(client, "Mo")
    wrong = signed_in(client, "WRONG", "wrong@example.com")
    assert client.post(f"/v1/join/{join_code(client)}", json={"membershipId": mo_id}, headers=wrong).status_code == 200
    assert client.post(lp(client, f"/members/{mo_id}/release"), headers=captain).status_code == 204
    assert withdraw(client, mo_id).status_code == 204
    assert next(m for m in client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=captain).json() if m["id"] == mo_id)["status"] == "withdrawn"


def test_a_reinstated_member_returns_with_a_new_season_membership(client: TestClient) -> None:
    mo = mo_headers(client)
    captain = captain_headers(client)
    mo_id = client.get(lp(client, "/me"), headers=mo).json()["memberId"]
    assert put_standings(client, 1, {UUID(mo_id): 7}).status_code == 200
    assert withdraw(client, mo_id).status_code == 204
    assert client.get(lp(client, "/standings"), headers=captain).json() == []

    response = client.post(lp(client, f"/members/{mo_id}/reinstate"), headers=captain)
    assert response.status_code == 204, response.text
    me = client.get(lp(client, "/me"), headers=mo)
    assert me.status_code == 200 and me.json()["inSeason"] is True
    assert [league["id"] for league in client.get("/v1/me", headers=mo).json()["leagues"]] == [client.league_id]
    old, new = season_rows(client, mo_id)
    assert (old.status, new.status) == ("withdrawn", "active")
    assert old.effective_to is not None and new.effective_to is None
    member = next(m for m in client.get(lp(client, "/members"), params={"include": "withdrawn"}, headers=captain).json() if m["id"] == mo_id)
    assert (member["status"], member["leftAt"], member["withdrawalReason"], member["inSeason"]) == ("active", None, None, True)

    # The earlier standings come back, and correcting that round updates the same row.
    assert [(s["memberName"], s["points"]) for s in client.get(lp(client, "/standings"), headers=captain).json()] == [("Mo", 7.0)]
    assert put_standings(client, 1, {UUID(mo_id): 9}).status_code == 200
    assert [(s["memberName"], s["points"]) for s in client.get(lp(client, "/standings"), params={"round": 1}, headers=captain).json()] == [("Mo", 9.0)]
    # New duties land on the new season membership.
    assert open_duty(client, UUID(mo_id), round_number=2)["memberName"] == "Mo"

    feed = client.get(lp(client, "/feed"), headers=captain).json()
    back = next(f for f in feed if f["kind"] == "member_returned")
    assert back["title"] == "Mo is back." and back["subjectName"] == "Mo"
    [event] = audit_rows(client, "membership.reinstated")
    assert event.before["withdrawalReason"] == "Moved to Perth" and event.after == {"status": "active"}
    # Withdrawn and reinstated again: still one active season membership.
    assert withdraw(client, mo_id).status_code == 204
    assert client.post(lp(client, f"/members/{mo_id}/reinstate"), headers=captain).status_code == 204
    assert [row.status for row in season_rows(client, mo_id)] == ["withdrawn", "withdrawn", "active"]


# Emblem, accent colour and join code ---------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 40
WEBP = b"RIFF\x10\0\0\0WEBPVP8 " + b"\0" * 40


def upload_emblem(client: TestClient, storage: FakeStorage, content: bytes = PNG, content_type: str = "image/png", headers: dict | None = None) -> str:
    grant = client.post(
        lp(client, "/emblem/uploads"), json={"contentType": content_type, "sizeBytes": len(content)}, headers=headers or captain_headers(client)
    )
    assert grant.status_code == 201, grant.text
    path = grant.json()["path"]
    storage.objects[path] = StoredObject(size_bytes=len(content), content_type=content_type)
    storage.contents[path] = content
    return path


def appearance(client: TestClient, body: dict, headers: dict | None = None):
    return client.put(lp(client, "/appearance"), json=body, headers=headers or captain_headers(client))


def test_the_captain_sets_a_preset_emblem_and_accent_colour(client: TestClient) -> None:
    mo = mo_headers(client)
    denied = appearance(client, {"emblemPreset": "oak"}, headers=mo)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "captain_only"
    for bad in ({"emblemPreset": "dragon"}, {"emblemPreset": "OAK"}, {"emblemPreset": "oak", "emblemPath": None}):
        response = appearance(client, bad)
        assert response.status_code == 422 and response.json()["detail"]["code"] == "invalid_emblem", bad
    assert appearance(client, {"accentColour": "orange"}).json()["detail"]["code"] == "invalid_accent_colour"

    saved = appearance(client, {"emblemPreset": "anvil", "accentColour": "#C8742A"})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert (body["emblemPreset"], body["emblemUrl"], body["accentColour"]) == ("anvil", None, "#c8742a")
    assert body["joinCode"] is not None and body["administers"] is True
    # Every league description carries it: the member's me, the account list and the join page.
    me = client.get(lp(client, "/me"), headers=mo).json()
    assert (me["emblemPreset"], me["accentColour"], me["joinCode"]) == ("anvil", "#c8742a", None)
    [entry] = client.get("/v1/me", headers=mo).json()["leagues"]
    assert (entry["emblemPreset"], entry["emblemUrl"], entry["accentColour"]) == ("anvil", None, "#c8742a")
    stranger = signed_in(client, "STRANGER", "stranger@example.com")
    league = client.get(f"/v1/join/{join_code(client)}", headers=stranger).json()["league"]
    assert (league["emblemPreset"], league["emblemUrl"]) == ("anvil", None)

    # Fields left out are untouched; the accent alone writes no feed entry.
    assert appearance(client, {"accentColour": None}).json()["emblemPreset"] == "anvil"
    assert appearance(client, {"emblemPreset": None}).json()["accentColour"] is None
    kinds = [f["kind"] for f in client.get(lp(client, "/feed"), headers=mo).json()]
    assert kinds[:2] == ["emblem_updated", "emblem_updated"]
    assert client.get(lp(client, "/feed"), headers=mo).json()[0]["title"] == "The Test league emblem was updated."
    events = audit_rows(client, "league.appearance_updated")
    assert [(e.before["emblem"], e.after["emblem"]) for e in events] == [(None, "preset:anvil"), ("preset:anvil", "preset:anvil"), ("preset:anvil", None)]
    # Saving what is already there changes nothing.
    assert appearance(client, {"emblemPreset": None}).status_code == 200
    assert len(audit_rows(client, "league.appearance_updated")) == 3


def test_an_uploaded_emblem_is_checked_signed_and_replaced(client: TestClient, storage: FakeStorage) -> None:
    captain = captain_headers(client)
    uploads = lp(client, "/emblem/uploads")
    assert client.post(uploads, json={"contentType": "image/gif", "sizeBytes": 10}, headers=captain).json()["detail"]["code"] == "not_an_image"
    assert client.post(uploads, json={"contentType": "image/png", "sizeBytes": 1024 * 1024 + 1}, headers=captain).json()["detail"]["code"] == "too_large"
    mo = mo_headers(client)
    assert client.post(uploads, json={"contentType": "image/png", "sizeBytes": 10}, headers=mo).status_code == 403

    first = upload_emblem(client, storage)
    assert first.startswith(f"emblems/{client.league_id}/") and first.endswith(".png")
    saved = appearance(client, {"emblemPath": first})
    assert saved.status_code == 200, saved.text
    assert saved.json()["emblemPreset"] is None
    assert saved.json()["emblemUrl"] == f"https://storage.example/{first}?expires=86400"
    [entry] = client.get("/v1/me", headers=mo).json()["leagues"]
    assert entry["emblemUrl"] == f"https://storage.example/{first}?expires=86400"

    # A second upload replaces the first, which is deleted; a preset replaces an upload.
    second = upload_emblem(client, storage, WEBP, "image/webp")
    assert appearance(client, {"emblemPath": second}).json()["emblemUrl"].startswith(f"https://storage.example/{second}")
    assert storage.deleted == [first]
    assert appearance(client, {"emblemPreset": "crown"}).json()["emblemUrl"] is None
    assert storage.deleted == [first, second]
    third = upload_emblem(client, storage)
    assert appearance(client, {"emblemPath": third}).status_code == 200
    assert appearance(client, {"emblemPath": None}).json()["emblemUrl"] is None
    assert storage.deleted == [first, second, third]

    # Only this league's finished uploads, of the type they claim.
    other_league = second_league(client, f"zulu-{uuid4().hex[:8]}@example.com")
    for path in (
        f"emblems/{other_league}/{'a' * 32}.png",
        f"emblems/{client.league_id}/../{other_league}/{'a' * 32}.png",
        f"avatars/{uuid4()}/{uuid4()}-abc.jpg",
        "https://elsewhere.test/crest.png",
        "preset:oak",
        f"emblems/{client.league_id}/{'b' * 32}.png",  # granted shape, never uploaded
    ):
        response = appearance(client, {"emblemPath": path})
        assert response.status_code == 422 and response.json()["detail"]["code"] == "unknown_upload", path
    fake = upload_emblem(client, storage, b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    rejected = appearance(client, {"emblemPath": fake})
    assert rejected.json()["detail"]["code"] == "invalid_emblem" and fake in storage.deleted
    mislabelled = upload_emblem(client, storage, PNG, "image/jpeg")
    assert appearance(client, {"emblemPath": mislabelled}).json()["detail"]["code"] == "invalid_emblem"
    assert client.get(lp(client, "/me"), headers=captain).json()["emblemUrl"] is None

    # Storage trouble: the grant is refused, and the league still loads without the image.
    good = upload_emblem(client, storage)
    assert appearance(client, {"emblemPath": good}).status_code == 200
    storage.down = True
    assert client.post(uploads, json={"contentType": "image/png", "sizeBytes": 10}, headers=captain).status_code == 503
    me = client.get(lp(client, "/me"), headers=captain).json()
    assert me["emblemUrl"] is None and me["emblemPreset"] is None


def test_the_captain_rotates_and_closes_the_join_code(client: TestClient) -> None:
    captain = captain_headers(client)
    mo = mo_headers(client)
    first = client.get(lp(client, "/me"), headers=captain).json()["joinCode"]
    assert first == join_code(client) and len(first) == 12
    assert client.get(lp(client, "/me"), headers=mo).json()["joinCode"] is None
    assert client.post(lp(client, "/join-code/rotate"), headers=mo).json()["detail"]["code"] == "captain_only"
    assert client.delete(lp(client, "/join-code"), headers=mo).status_code == 403

    rotated = client.post(lp(client, "/join-code/rotate"), headers=captain)
    assert rotated.status_code == 200, rotated.text
    second = rotated.json()["joinCode"]
    assert second != first and len(second) == 12 and all(c in "0123456789abcdef" for c in second)
    assert client.get(lp(client, "/me"), headers=captain).json()["joinCode"] == second
    stranger = signed_in(client, "STRANGER", "stranger@example.com")
    assert client.get(f"/v1/join/{first}", headers=stranger).json()["detail"]["code"] == "unknown_join_code"
    assert client.get(f"/v1/join/{second}", headers=stranger).status_code == 200

    assert client.delete(lp(client, "/join-code"), headers=captain).status_code == 204
    assert client.get(lp(client, "/me"), headers=captain).json()["joinCode"] is None
    assert client.get(f"/v1/join/{second}", headers=stranger).status_code == 404
    # Rotating opens joining again.
    third = client.post(lp(client, "/join-code/rotate"), headers=captain).json()["joinCode"]
    assert client.get(f"/v1/join/{third}", headers=stranger).status_code == 200

    events = audit_rows(client, "league.join_code_rotated", "league.join_code_closed")
    assert [(e.action, e.before, e.after) for e in events] == [
        ("league.join_code_rotated", {"open": True}, {"open": True}),
        ("league.join_code_closed", {"open": True}, {"open": False}),
        ("league.join_code_rotated", {"open": False}, {"open": True}),
    ]
    assert not {first, second, third} & {str(value) for e in events for value in (*e.before.values(), *e.after.values())}
    kinds = [f["kind"] for f in client.get(lp(client, "/feed"), headers=captain).json()]
    assert "join_code_rotated" not in kinds and kinds[0] == "member_joined"
    # The admin without a membership sees and manages the code too.
    admin = signed_in(client, "ADMIN", f"admin-{uuid4().hex[:8]}@example.com")
    make_admin(subject(client, "ADMIN"))
    assert client.get(lp(client, "/me"), headers=admin).json()["joinCode"] == third
    assert client.post(lp(client, "/join-code/rotate"), headers=admin).status_code == 200
