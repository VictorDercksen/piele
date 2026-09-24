"""League API integration tests: token verification, membership claim, captain authority,
duties, marks, evidence and the feed. They need PIELE_TEST_DATABASE_URL like
tests/test_database.py and run each test in a freshly bootstrapped league."""

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
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
        return f"https://storage.example/{path}?expires={expires_in_seconds}"


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


def subject(client: TestClient, name: str) -> UUID:
    """Auth subjects are per test so accounts never carry over between leagues."""
    return client.subjects.setdefault(name, uuid4())  # type: ignore[attr-defined]


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def client(storage: FakeStorage) -> TestClient:
    settings = Settings(
        _env_file=None,
        environment="test",
        database_url=DATABASE_URL,
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=SECRET,
        supabase_service_role_key="service-key",
    )
    engine = get_engine(settings)
    # Each test gets its own league; the captain's email is unique per run.
    email = f"captain-{uuid4().hex[:8]}@example.com"
    with engine.begin() as connection:
        bootstrap.bootstrap(connection, email, SEED)
    client = TestClient(create_app(settings, storage=storage))
    client.captain_email = email  # type: ignore[attr-defined]
    client.subjects = {}  # type: ignore[attr-defined]
    # Test leagues share one database, so reservations must not collide between tests.
    client.mo_email = f"mo-{uuid4().hex[:8]}@example.com"  # type: ignore[attr-defined]
    return client


def captain_headers(client: TestClient) -> dict[str, str]:
    """Claims the captain membership by its invited email on first use."""
    return auth(subject(client, "CAPTAIN"), _captain_email(client))


def _captain_email(client: TestClient) -> str:
    return client.captain_email  # type: ignore[attr-defined]


def invite(client: TestClient, member_name: str, email: str) -> UUID:
    members = client.get("/v1/members", headers=captain_headers(client)).json()
    member = next(m for m in members if m["displayName"] == member_name)
    response = client.patch(f"/v1/members/{member['id']}", json={"email": email}, headers=captain_headers(client))
    assert response.status_code == 204, response.text
    return UUID(member["id"])


def open_duty(client: TestClient, member_id: UUID, round_number: int = 2, duty_type: str = "spoon", **extra) -> dict:
    body = {"memberId": str(member_id), "type": duty_type, "roundNumber": round_number, **extra}
    response = client.post("/v1/duties", json=body, headers=captain_headers(client))
    assert response.status_code == 201, response.text
    return response.json()


def upload_and_submit(client: TestClient, storage: FakeStorage, headers: dict, duty_ids: list[str], **extra) -> dict:
    grant = client.post(
        "/v1/evidence/uploads",
        json={"filename": "proof.mp4", "contentType": "video/mp4", "sizeBytes": 1024},
        headers=headers,
    )
    assert grant.status_code == 201, grant.text
    storage.objects[grant.json()["path"]] = StoredObject(size_bytes=1024, content_type="video/mp4")
    response = client.post(
        "/v1/evidence", json={"assetId": grant.json()["assetId"], "dutyIds": duty_ids, **extra}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


# Authentication and membership --------------------------------------------------------


def test_requests_without_a_valid_token_are_rejected(client: TestClient) -> None:
    assert client.get("/v1/me").status_code == 401
    assert client.get("/v1/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    forged = jwt.encode({"sub": str(subject(client, "CAPTAIN")), "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1"}, "other", algorithm="HS256")
    assert client.get("/v1/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    wrong_audience = auth(subject(client, "CAPTAIN"), _captain_email(client), aud="anon")
    assert client.get("/v1/me", headers=wrong_audience).status_code == 401
    expired = auth(subject(client, "CAPTAIN"), _captain_email(client), exp=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert client.get("/v1/me", headers=expired).status_code == 401


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
    me = client.get("/v1/me", headers=captain_headers(client))
    assert me.status_code == 200, me.text
    assert me.json()["displayName"] == "Captain" and me.json()["isCaptain"] is True
    # Second sign-in finds the bound account even if the email changes.
    again = client.get("/v1/me", headers=auth(subject(client, "CAPTAIN"), "renamed@example.com"))
    assert again.json()["memberId"] == me.json()["memberId"]
    feed = client.get("/v1/feed", headers=captain_headers(client)).json()
    assert [f["kind"] for f in feed] == ["member_joined", "season_opened"]


def test_strangers_and_unverified_emails_are_not_members(client: TestClient) -> None:
    assert client.get("/v1/me", headers=auth(subject(client, "STRANGER"), "nobody@example.com")).json()["detail"]["code"] == "not_a_member"
    invite(client, "Mo", client.mo_email)
    unverified = client.get("/v1/me", headers=auth(subject(client, "MO"), client.mo_email, verified=False))
    assert unverified.status_code == 403
    verified = client.get("/v1/me", headers=auth(subject(client, "MO"), client.mo_email.upper()))
    assert verified.status_code == 200 and verified.json()["isCaptain"] is False
    # The invitation is single-use: another account with the same email is still a stranger.
    assert client.get("/v1/me", headers=auth(subject(client, "STRANGER"), client.mo_email)).status_code == 403


def test_only_the_captain_manages_members(client: TestClient) -> None:
    invite(client, "Mo", client.mo_email)
    mo = auth(subject(client, "MO"), client.mo_email)
    assert client.get("/v1/me", headers=mo).status_code == 200
    members = client.get("/v1/members", headers=mo).json()
    assert {m["displayName"] for m in members} == {"Captain", "Mo", "Ola"}
    assert all(m["email"] is None for m in members)
    captain_view = client.get("/v1/members", headers=captain_headers(client)).json()
    assert next(m for m in captain_view if m["displayName"] == "Mo")["email"] == client.mo_email
    denied = client.post("/v1/members", json={"displayName": "New", "fullName": "New, Person"}, headers=mo)
    assert denied.status_code == 403
    created = client.post(
        "/v1/members",
        json={"displayName": "Vee", "fullName": "Visser, Vee", "email": "vee@example.com"},
        headers=captain_headers(client),
    )
    assert created.status_code == 201
    duplicate = client.post(
        "/v1/members", json={"displayName": "Dup", "fullName": "Dup, D", "email": "VEE@example.com"}, headers=captain_headers(client)
    )
    assert duplicate.status_code == 409
    assert client.post("/v1/members", json={"displayName": "Bad", "fullName": "B", "email": "nope"}, headers=captain_headers(client)).status_code == 422


# Duties and marks ---------------------------------------------------------------------


def test_captain_creates_spoon_duty_with_next_round_kickoff_deadline(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    assert duty["title"] == "Round 02 Spoon duty"
    assert duty["status"] == "open" and duty["memberName"] == "Mo"
    assert duty["deadlineAt"].startswith("2026-10-09T18:45")
    default = client.get("/v1/duties/default-deadline", params={"type": "spoon", "round": 18}, headers=captain_headers(client))
    assert default.json()["deadlineAt"] is None  # playoff kickoffs are unknown
    pending = open_duty(client, mo_id, round_number=18)
    assert pending["status"] == "pending_deadline" and pending["marks"]["marks"] == 0
    listed = client.get("/v1/duties", params={"round": 2}, headers=auth(subject(client, "MO"), client.mo_email)).json()
    assert [d["id"] for d in listed] == [duty["id"]]
    feed = client.get("/v1/feed", params={"round": 2}, headers=captain_headers(client)).json()
    assert feed[0]["kind"] == "duty_created" and feed[0]["subjectName"] == "Mo"


def test_duty_rules_and_captain_authority(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    mo = auth(subject(client, "MO"), client.mo_email)
    body = {"memberId": str(mo_id), "type": "spoon", "roundNumber": 3}
    assert client.post("/v1/duties", json=body, headers=mo).status_code == 403
    open_duty(client, mo_id, round_number=3)
    duplicate = client.post("/v1/duties", json=body, headers=captain_headers(client))
    assert duplicate.status_code == 409 and duplicate.json()["detail"]["code"] == "duplicate_duty"
    explicit = open_duty(client, mo_id, round_number=3, duty_type="pick_confirmation", deadlineAt="2026-10-20T10:00:00Z", reason="Missing picks")
    assert explicit["deadlineAt"].startswith("2026-10-20T10:00") and explicit["reason"] == "Missing picks"
    unknown = client.post("/v1/duties", json={**body, "memberId": str(uuid4())}, headers=captain_headers(client))
    assert unknown.status_code == 404
    voided = client.post(f"/v1/duties/{explicit['id']}/void", json={"reason": "Picks were found"}, headers=captain_headers(client))
    assert voided.status_code == 200 and voided.json()["status"] == "voided" and voided.json()["voidReason"] == "Picks were found"
    assert client.post(f"/v1/duties/{explicit['id']}/void", json={"reason": "again"}, headers=captain_headers(client)).status_code == 409
    assert client.post(f"/v1/duties/{explicit['id']}/void", json={"reason": "x"}, headers=mo).status_code == 403
    # A member can create nothing, but the same duty for another round is fine.
    open_duty(client, mo_id, round_number=4)


def test_marks_accrue_per_full_week_overdue(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    weeks_ago = (now_utc() - timedelta(hours=168 * 2 + 3)).isoformat()
    duty = open_duty(client, mo_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert duty["display"] == "overdue" and duty["marks"]["marks"] == 2
    assert duty["marks"]["nextMarkAt"] is not None
    totals = client.get("/v1/marks", headers=auth(subject(client, "MO"), client.mo_email)).json()
    assert totals == [{"memberId": str(mo_id), "memberName": "Mo", "marks": 2, "openDuties": 1}]


# Evidence -----------------------------------------------------------------------------


def test_member_evidence_is_reviewed_and_completion_counts_from_submission(client: TestClient, storage: FakeStorage) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    mo = auth(subject(client, "MO"), client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    submission = upload_and_submit(client, storage, mo, [duty["id"]], note="Done on Sunday")
    listed = client.get("/v1/duties", params={"round": 2}, headers=mo).json()[0]
    assert listed["display"] == "under_review"
    link = listed["evidence"][0]
    assert link["decision"] == "pending" and link["note"] == "Done on Sunday" and link["submissionId"] == submission["id"]
    # The member cannot decide their own evidence; the captain can.
    assert client.post(f"/v1/evidence/links/{link['id']}/decision", json={"decision": "accepted"}, headers=mo).status_code == 403
    decided = client.post(
        f"/v1/evidence/links/{link['id']}/decision", json={"decision": "accepted", "reason": "Clear video"}, headers=captain_headers(client)
    )
    assert decided.status_code == 204, decided.text
    done = client.get("/v1/duties", params={"round": 2}, headers=mo).json()[0]
    assert done["status"] == "completed" and done["completedAt"] == done["evidence"][0]["submittedAt"]
    assert done["evidence"][0]["effectiveCompletedAt"] == done["evidence"][0]["submittedAt"]
    assert client.post(f"/v1/evidence/links/{link['id']}/decision", json={"decision": "rejected"}, headers=captain_headers(client)).status_code == 409
    playback = client.get(f"/v1/evidence/assets/{link['assetId']}/playback", headers=captain_headers(client))
    assert playback.status_code == 200 and playback.json()["url"].startswith("https://storage.example/")
    kinds = [f["kind"] for f in client.get("/v1/feed", params={"round": 2}, headers=mo).json()]
    assert kinds == ["evidence_accepted", "evidence_submitted", "duty_created"]


def test_captain_submits_on_behalf_with_claimed_completion_time(client: TestClient, storage: FakeStorage) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    captain = captain_headers(client)
    missing_time = client.post(
        "/v1/evidence",
        json={"assetId": str(uuid4()), "dutyIds": [duty["id"]], "subjectMemberId": str(mo_id)},
        headers=captain,
    )
    assert missing_time.json()["detail"]["code"] == "completion_time_required"
    claimed = "2026-09-20T09:00:00Z"
    upload_and_submit(client, storage, captain, [duty["id"]], subjectMemberId=str(mo_id), claimedCompletedAt=claimed)
    link = client.get("/v1/duties", params={"round": 2}, headers=captain).json()[0]["evidence"][0]
    assert link["submitterName"] == "Captain" and link["claimedCompletedAt"].startswith("2026-09-20T09:00")
    assert client.post(f"/v1/evidence/links/{link['id']}/decision", json={"decision": "accepted"}, headers=captain).status_code == 204
    done = client.get("/v1/duties", params={"round": 2}, headers=captain).json()[0]
    assert done["completedAt"].startswith("2026-09-20T09:00")


def test_captain_cannot_review_own_evidence_and_members_cannot_submit_for_others(client: TestClient, storage: FakeStorage) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    mo = auth(subject(client, "MO"), client.mo_email)
    captain = captain_headers(client)
    captain_id = client.get("/v1/me", headers=captain).json()["memberId"]
    own = open_duty(client, UUID(captain_id), round_number=2)
    upload_and_submit(client, storage, captain, [own["id"]])
    link = client.get("/v1/duties", params={"round": 2}, headers=captain).json()[0]["evidence"][0]
    self_review = client.post(f"/v1/evidence/links/{link['id']}/decision", json={"decision": "accepted"}, headers=captain)
    assert self_review.status_code == 403 and self_review.json()["detail"]["code"] == "self_review"
    others = open_duty(client, mo_id, round_number=3)
    grant = client.post("/v1/evidence/uploads", json={"filename": "p.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).json()
    storage.objects[grant["path"]] = StoredObject(10, "video/mp4")
    for_other = client.post(
        "/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [others["id"]], "subjectMemberId": captain_id, "claimedCompletedAt": "2026-10-01T00:00:00Z"}, headers=mo
    )
    assert for_other.status_code == 403


def test_upload_validation_and_storage_failures(client: TestClient, storage: FakeStorage) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    mo = auth(subject(client, "MO"), client.mo_email)
    duty = open_duty(client, mo_id, round_number=2)
    bad_type = client.post("/v1/evidence/uploads", json={"filename": "a.txt", "contentType": "text/plain", "sizeBytes": 10}, headers=mo)
    assert bad_type.json()["detail"]["code"] == "not_a_video"
    too_big = client.post("/v1/evidence/uploads", json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 60 * 1024 * 1024}, headers=mo)
    assert too_big.json()["detail"]["code"] == "too_large"
    grant = client.post("/v1/evidence/uploads", json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).json()
    not_uploaded = client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert not_uploaded.json()["detail"]["code"] == "upload_missing"
    storage.objects[grant["path"]] = StoredObject(10, "image/png")
    assert client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo).json()["detail"]["code"] == "not_a_video"
    storage.objects[grant["path"]] = StoredObject(10, "video/mp4")
    someone_elses = client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=captain_headers(client))
    assert someone_elses.status_code == 404
    storage.down = True
    assert client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo).status_code == 503
    assert client.post("/v1/evidence/uploads", json={"filename": "a.mp4", "contentType": "video/mp4", "sizeBytes": 10}, headers=mo).status_code == 503
    storage.down = False
    ok = client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert ok.status_code == 201
    reused = client.post("/v1/evidence", json={"assetId": grant["assetId"], "dutyIds": [duty["id"]]}, headers=mo)
    assert reused.json()["detail"]["code"] == "asset_used"


def test_failed_mutation_leaves_no_audit_or_feed_rows(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    before = len(client.get("/v1/feed", headers=captain_headers(client)).json())
    open_duty(client, mo_id, round_number=6)
    duplicate = client.post("/v1/duties", json={"memberId": str(mo_id), "type": "spoon", "roundNumber": 6}, headers=captain_headers(client))
    assert duplicate.status_code == 409
    assert len(client.get("/v1/feed", headers=captain_headers(client)).json()) == before + 1


def test_leagues_are_isolated(client: TestClient) -> None:
    """A second bootstrapped league never sees the first one's rows."""
    mo_id = invite(client, "Mo", client.mo_email)
    open_duty(client, mo_id, round_number=2)
    engine = get_engine(client.app.state.settings)
    email = f"other-{uuid4().hex[:8]}@example.com"
    with engine.begin() as connection:
        bootstrap.bootstrap(connection, email, SEED)
    other = auth(uuid4(), email)
    assert client.get("/v1/duties", headers=other).json() == []
    assert len(client.get("/v1/members", headers=other).json()) == 3
    assert client.get("/v1/feed", headers=other).json()[0]["kind"] == "member_joined"


# Claiming a Superbru name --------------------------------------------------------------


def league_member_id(client: TestClient, name: str) -> str:
    members = client.get("/v1/members", headers=captain_headers(client)).json()
    return next(m["id"] for m in members if m["displayName"] == name)


def test_signed_in_account_claims_an_unclaimed_name_once(client: TestClient) -> None:
    ola_id = league_member_id(client, "Ola")
    ola = auth(subject(client, "OLA"), "ola@example.com")
    assert client.get("/v1/me", headers=ola).json()["detail"]["code"] == "not_a_member"
    names = client.get("/v1/memberships/unclaimed", headers=ola).json()
    assert ola_id in {n["id"] for n in names}
    captain_id = league_member_id(client, "Captain")
    assert captain_id not in {n["id"] for n in names}  # reserved for the captain's email
    claimed = client.post("/v1/memberships/claim", json={"memberId": ola_id}, headers=ola)
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["displayName"] == "Ola" and claimed.json()["isCaptain"] is False
    assert client.get("/v1/me", headers=ola).json()["memberId"] == ola_id
    # Taken names disappear, a second account cannot take it and a member cannot take two.
    assert ola_id not in {n["id"] for n in client.get("/v1/memberships/unclaimed", headers=ola).json()}
    other = auth(subject(client, "OTHER"), "other@example.com")
    assert client.post("/v1/memberships/claim", json={"memberId": ola_id}, headers=other).json()["detail"]["code"] == "name_taken"
    mo_id = league_member_id(client, "Mo")
    assert client.post("/v1/memberships/claim", json={"memberId": mo_id}, headers=ola).json()["detail"]["code"] == "already_member"
    reserved = client.post("/v1/memberships/claim", json={"memberId": captain_id}, headers=other)
    assert reserved.json()["detail"]["code"] == "name_taken"
    assert client.get("/v1/memberships/unclaimed").status_code == 401
    kinds = [f["kind"] for f in client.get("/v1/feed", headers=ola).json()]
    assert kinds[0] == "member_joined"


def test_captain_releases_a_wrong_claim(client: TestClient) -> None:
    ola_id = league_member_id(client, "Ola")
    wrong = auth(subject(client, "WRONG"), "wrong@example.com")
    client.post("/v1/memberships/claim", json={"memberId": ola_id}, headers=wrong)
    assert client.post(f"/v1/members/{ola_id}/release", headers=wrong).status_code == 403
    assert client.post(f"/v1/members/{ola_id}/release", headers=captain_headers(client)).status_code == 204
    assert client.get("/v1/me", headers=wrong).status_code == 403
    right = auth(subject(client, "RIGHT"), "right@example.com")
    assert client.post("/v1/memberships/claim", json={"memberId": ola_id}, headers=right).status_code == 200
    captain_id = league_member_id(client, "Captain")
    assert client.post(f"/v1/members/{captain_id}/release", headers=captain_headers(client)).status_code == 409
    mo_id = league_member_id(client, "Mo")
    assert client.post(f"/v1/members/{mo_id}/release", headers=captain_headers(client)).json()["detail"]["code"] == "not_claimed"


# Challenges and the overdue clock --------------------------------------------------------


def test_a_challenge_upheld_for_the_member_resets_the_overdue_clock(client: TestClient) -> None:
    mo_id = invite(client, "Mo", client.mo_email)
    weeks_ago = (now_utc() - timedelta(hours=168 * 2 + 3)).isoformat()
    duty = open_duty(client, mo_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert duty["marks"]["marks"] == 2
    mo = auth(subject(client, "MO"), client.mo_email)
    assert client.post(f"/v1/duties/{duty['id']}/reset-clock", json={"reason": "x"}, headers=mo).status_code == 403
    reset = client.post(
        f"/v1/duties/{duty['id']}/reset-clock", json={"reason": "Challenge upheld: picks were in"}, headers=captain_headers(client)
    )
    assert reset.status_code == 200, reset.text
    body = reset.json()
    assert body["marks"]["marks"] == 0 and body["clockResetAt"] is not None
    assert body["display"] == "overdue"  # the duty stays open and accrues again from now
    feed = client.get("/v1/feed", params={"round": 5}, headers=mo).json()
    assert feed[0]["kind"] == "duty_clock_reset" and feed[0]["detail"] == "Challenge upheld: picks were in"
    captain_id = UUID(client.get("/v1/me", headers=captain_headers(client)).json()["memberId"])
    own = open_duty(client, captain_id, round_number=5, duty_type="pick_confirmation", deadlineAt=weeks_ago)
    assert client.post(f"/v1/duties/{own['id']}/reset-clock", json={"reason": "x"}, headers=captain_headers(client)).status_code == 403


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
