"""Evidence cases (app/league/cases.py): the electorate, votes and vetoes, review routing,
lazy settlement, the captain's override and ballot privacy. They need
PIELE_TEST_DATABASE_URL like tests/test_league.py, whose fixtures and helpers they use."""

from datetime import datetime, timedelta
from typing import Callable
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.league.context import now_utc
from tests.test_league import (  # noqa: F401 (fixtures)
    DATABASE_URL,
    rls_connection,
    subject,
    admin_headers,
    audit_rows,
    captain_headers,
    client,
    invite,
    lp,
    migration_engine,
    open_duty,
    second_league,
    signed_in,
    storage,
    upload_and_submit,
    withdraw,
)

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")


@pytest.fixture
def later(monkeypatch: pytest.MonkeyPatch) -> Callable[[float], datetime]:
    """Moves the service clock the given number of hours past the real time."""
    from app.league import service

    real = now_utc

    def advance(hours: float) -> datetime:
        moment = real() + timedelta(hours=hours)
        monkeypatch.setattr(service, "now_utc", lambda: moment)
        return moment

    return advance


def member(client: TestClient, name: str) -> dict[str, str]:
    """Headers for the named member, claimed by a fresh email; added to the league first when
    the seed does not have them."""
    captain = captain_headers(client)
    email = f"{name.lower()}-{uuid4().hex[:8]}@example.com"
    names = {m["displayName"] for m in client.get(lp(client, "/members"), headers=captain).json()}
    if name in names:
        invite(client, name, email)
    else:
        added = client.post(lp(client, "/members"), json={"displayName": name, "fullName": f"{name}, {name}", "email": email}, headers=captain)
        assert added.status_code == 201, added.text
    return signed_in(client, name.upper(), email)


def member_id(client: TestClient, headers: dict) -> str:
    return client.get(lp(client, "/me"), headers=headers).json()["memberId"]


def cases_of(client: TestClient, headers: dict, round_number: int | None = 2) -> list[dict]:
    params = {"round": round_number} if round_number is not None else {}
    response = client.get(lp(client, "/evidence/cases"), params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def respond(client: TestClient, headers: dict, case_id: str, choice: str, reason: str = ""):
    return client.post(lp(client, f"/evidence/cases/{case_id}/response"), json={"choice": choice, "reason": reason}, headers=headers)


def review(client: TestClient, headers: dict, case_id: str, ruling: str, reason: str = "Looked at the video"):
    return client.post(lp(client, f"/evidence/cases/{case_id}/review"), json={"ruling": ruling, "reason": reason}, headers=headers)


def duty_of(client: TestClient, headers: dict, duty_id: str) -> dict:
    return next(d for d in client.get(lp(client, "/duties"), headers=headers).json() if d["id"] == duty_id)


def feed_of(client: TestClient, headers: dict, round_number: int = 2) -> list[dict]:
    return client.get(lp(client, "/feed"), params={"round": round_number}, headers=headers).json()


def at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def set_stand_in(client: TestClient, member: str | None, headers: dict | None = None):
    return client.put(lp(client, "/stand-in-reviewer"), json={"memberId": member}, headers=headers or captain_headers(client))


@pytest.fixture
def league(client: TestClient, storage) -> dict:
    """Captain, Mo, Ola and Pat, all claimed; Mo has an open round 2 spoon duty and has
    submitted evidence for it, so the electorate is Captain, Ola and Pat."""
    heads = {"Captain": captain_headers(client), "Mo": member(client, "Mo"), "Ola": member(client, "Ola"), "Pat": member(client, "Pat")}
    ids = {name: member_id(client, h) for name, h in heads.items()}
    duty = open_duty(client, UUID(ids["Mo"]), round_number=2)
    upload_and_submit(client, storage, heads["Mo"], [duty["id"]], note="Spoon worn to the office")
    case = cases_of(client, heads["Mo"])[0]
    return {"h": heads, "ids": ids, "duty": duty, "case": case}


# Opening and the electorate ---------------------------------------------------------------


def test_submission_opens_a_case_for_the_other_members(client: TestClient, league: dict) -> None:
    h, case = league["h"], league["case"]
    assert case["status"] == "open" and case["resolution"] is None and case["resolvedAt"] is None
    assert case["eligibleCount"] == 3 and case["respondedCount"] == 0
    assert at(case["closesAt"]) - at(case["openedAt"]) == timedelta(hours=24)
    assert case["dutyId"] == league["duty"]["id"] and case["subjectName"] == "Mo" and case["note"] == "Spoon worn to the office"
    # The duty's member is not in the electorate; the others are.
    assert (case["isVoter"], case["canRespond"], case["myResponse"]) == (False, False, None)
    for name in ("Captain", "Ola", "Pat"):
        mine = cases_of(client, h[name])[0]
        assert (mine["isVoter"], mine["canRespond"], mine["myResponse"]) == (True, True, None)
    assert respond(client, h["Mo"], case["id"], "accept").json()["detail"]["code"] == "not_a_voter"
    duty = duty_of(client, h["Mo"], league["duty"]["id"])
    assert duty["display"] == "under_review"
    assert duty["evidence"][0]["evidenceCase"] == {
        "id": case["id"], "status": "open", "resolution": None, "closesAt": case["closesAt"], "resolvedAt": None
    }
    feed = feed_of(client, h["Ola"])[0]
    assert feed["kind"] == "evidence_submitted" and "24 hours" in feed["detail"]


def test_the_electorate_is_frozen_and_excludes_the_submitter(client: TestClient, league: dict, storage) -> None:
    h, ids, case = league["h"], league["ids"], league["case"]
    # A member who joins later cannot vote; one who leaves stays counted.
    quinn = member(client, "Quinn")
    assert cases_of(client, quinn)[0]["isVoter"] is False
    assert respond(client, quinn, case["id"], "accept").json()["detail"]["code"] == "not_a_voter"
    assert withdraw(client, ids["Pat"]).status_code == 204
    assert cases_of(client, h["Ola"])[0]["eligibleCount"] == 3
    # Evidence the captain records for a member leaves out the captain and the member.
    ola_duty = open_duty(client, UUID(ids["Ola"]), round_number=3)
    upload_and_submit(client, storage, h["Captain"], [ola_duty["id"]], subjectMemberId=ids["Ola"], claimedCompletedAt="2026-09-20T09:00:00Z")
    on_behalf = cases_of(client, h["Captain"], 3)[0]
    assert on_behalf["eligibleCount"] == 2 and on_behalf["isVoter"] is False and on_behalf["submitterName"] == "Captain"
    assert cases_of(client, h["Mo"], 3)[0]["isVoter"] is True and cases_of(client, quinn, 3)[0]["isVoter"] is True


def test_no_one_to_vote_accepts_at_once(client: TestClient, storage) -> None:
    captain = captain_headers(client)
    mo_id = invite(client, "Mo", client.mo_email)
    ids = {m["displayName"]: m["id"] for m in client.get(lp(client, "/members"), headers=captain).json()}
    assert withdraw(client, ids["Ola"]).status_code == 204  # unclaimed without records: deleted
    duty = open_duty(client, mo_id, round_number=2)
    upload_and_submit(client, storage, captain, [duty["id"]], subjectMemberId=str(mo_id), claimedCompletedAt="2026-09-20T09:00:00Z")
    case = cases_of(client, captain)[0]
    assert (case["status"], case["resolution"], case["eligibleCount"]) == ("accepted", "no_voters", 0)
    assert case["resolvedAt"] == case["openedAt"]
    done = duty_of(client, captain, duty["id"])
    assert done["status"] == "completed" and done["completedAt"].startswith("2026-09-20T09:00")
    assert feed_of(client, captain)[0]["kind"] == "evidence_accepted"


# Votes -------------------------------------------------------------------------------------


def test_a_majority_of_accepts_accepts_at_once(client: TestClient, league: dict) -> None:
    h, case = league["h"], league["case"]
    first = respond(client, h["Ola"], case["id"], "accept")
    assert first.status_code == 200, first.text
    assert (first.json()["status"], first.json()["myResponse"], first.json()["respondedCount"]) == ("open", "accept", 1)
    # Accepting again changes nothing.
    assert respond(client, h["Ola"], case["id"], "accept").json()["respondedCount"] == 1
    second = respond(client, h["Pat"], case["id"], "accept").json()
    assert (second["status"], second["resolution"], second["canRespond"]) == ("accepted", "majority", False)
    done = duty_of(client, h["Mo"], league["duty"]["id"])
    # Marks are unchanged: completion counts from the submission, not from the vote.
    assert done["status"] == "completed" and done["completedAt"] == done["evidence"][0]["submittedAt"]
    assert done["evidence"][0]["decision"] == "accepted" and done["evidence"][0]["evidenceCase"]["resolution"] == "majority"
    assert respond(client, h["Captain"], case["id"], "accept").json()["detail"]["code"] == "voting_closed"
    entry = feed_of(client, h["Mo"])[0]
    assert (entry["kind"], entry["actorName"], entry["subjectName"]) == ("evidence_accepted", None, "Mo")


def test_a_veto_stops_voting_and_is_final(client: TestClient, league: dict) -> None:
    h, case = league["h"], league["case"]
    assert respond(client, h["Ola"], case["id"], "veto").json()["detail"]["code"] == "reason_required"
    # An accept may become a veto.
    respond(client, h["Ola"], case["id"], "accept")
    vetoed = respond(client, h["Ola"], case["id"], "veto", "That is a fork, not a spoon")
    assert vetoed.status_code == 200, vetoed.text
    body = vetoed.json()
    assert (body["status"], body["myResponse"], body["myVetoReason"], body["canRespond"]) == ("in_review", "veto", "That is a fork, not a spoon", False)
    assert respond(client, h["Ola"], case["id"], "accept").json()["detail"]["code"] == "voting_closed"
    assert respond(client, h["Pat"], case["id"], "accept").json()["detail"]["code"] == "voting_closed"
    assert duty_of(client, h["Mo"], league["duty"]["id"])["display"] == "under_review"
    entry = feed_of(client, h["Mo"])[0]
    assert (entry["kind"], entry["actorName"]) == ("evidence_vetoed", None)
    assert "fork" not in entry["detail"]


def test_an_upheld_veto_rejects_the_evidence_and_the_member_resubmits(client: TestClient, league: dict, storage) -> None:
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Wrong spoon")
    captain_view = cases_of(client, h["Captain"])[0]
    assert (captain_view["canReview"], captain_view["vetoReason"], captain_view["needsReviewer"]) == (True, "Wrong spoon", False)
    for name in ("Mo", "Pat", "Ola"):
        other = cases_of(client, h[name])[0]
        assert other["canReview"] is False and other["vetoReason"] is None and other["needsReviewer"] is False
    assert review(client, h["Pat"], case["id"], "upheld").json()["detail"]["code"] == "not_reviewer"
    assert review(client, h["Captain"], case["id"], "upheld", "").status_code == 422
    upheld = review(client, h["Captain"], case["id"], "upheld", "Not the league spoon")
    assert upheld.status_code == 200, upheld.text
    assert (upheld.json()["status"], upheld.json()["resolution"]) == ("rejected", "veto_upheld")
    duty = duty_of(client, h["Mo"], league["duty"]["id"])
    assert duty["status"] == "open" and duty["display"] == "open"
    assert duty["evidence"][0]["decision"] == "rejected" and duty["evidence"][0]["reason"] == "Not the league spoon"
    entry = feed_of(client, h["Mo"])[0]
    assert (entry["kind"], entry["actorName"], entry["detail"]) == ("evidence_rejected", None, "Not the league spoon")
    assert review(client, h["Captain"], case["id"], "dismissed").json()["detail"]["code"] == "not_in_review"
    # New evidence opens a new case.
    upload_and_submit(client, storage, h["Mo"], [league["duty"]["id"]])
    assert [c["status"] for c in cases_of(client, h["Mo"])] == ["open", "rejected"]


def test_a_dismissed_veto_reopens_voting_on_the_original_timer(client: TestClient, league: dict) -> None:
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Too dark to see")
    dismissed = review(client, h["Captain"], case["id"], "dismissed", "The spoon is visible")
    assert dismissed.status_code == 200, dismissed.text
    body = dismissed.json()
    assert (body["status"], body["closesAt"], body["canRespond"]) == ("open", case["closesAt"], True)
    assert feed_of(client, h["Mo"])[0]["kind"] == "evidence_veto_dismissed"
    # The dismissed vetoer cannot vote again; a later veto sends the case back to review.
    assert respond(client, h["Ola"], case["id"], "accept").json()["detail"]["code"] == "veto_final"
    assert respond(client, h["Pat"], case["id"], "veto", "Still too dark").json()["status"] == "in_review"
    assert cases_of(client, h["Captain"])[0]["vetoReason"] == "Still too dark"
    review(client, h["Captain"], case["id"], "dismissed", "Visible enough")
    # Ola's and Pat's vetoes do not count as accepts: the captain's accept is 1 of 3.
    assert respond(client, h["Captain"], case["id"], "accept").json()["status"] == "open"


def test_a_veto_dismissed_after_the_window_accepts_at_once(client: TestClient, league: dict, later) -> None:
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Too dark")
    later(30)
    # A case in review is not settled when its window closes.
    assert cases_of(client, h["Mo"])[0]["status"] == "in_review"
    assert duty_of(client, h["Mo"], league["duty"]["id"])["display"] == "under_review"
    now = later(31)
    body = review(client, h["Captain"], case["id"], "dismissed", "Fine").json()
    assert (body["status"], body["resolution"]) == ("accepted", "auto")
    assert at(body["resolvedAt"]) == now
    done = duty_of(client, h["Mo"], league["duty"]["id"])
    assert done["completedAt"] == done["evidence"][0]["submittedAt"]
    entry = feed_of(client, h["Mo"])[0]
    assert entry["kind"] == "evidence_accepted" and entry["detail"] == "Veto dismissed: Fine"


def test_a_veto_dismissed_with_a_majority_already_in_accepts_at_once(client: TestClient, league: dict) -> None:
    """Voting stops during review, so this needs accepts recorded while the case was in
    review (a race the API does not allow); the dismissal still settles it."""
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Too dark")
    with migration_engine().begin() as connection:
        connection.execute(
            text(
                "update piele.evidence_case_voters set choice = 'accept', responded_at = now()"
                " where case_id = :c and choice is null"
            ),
            {"c": case["id"]},
        )
    body = review(client, h["Captain"], case["id"], "dismissed", "Fine").json()
    assert (body["status"], body["resolution"]) == ("accepted", "majority")


# Settlement --------------------------------------------------------------------------------


def test_an_open_case_is_accepted_when_its_window_closes(client: TestClient, league: dict, later) -> None:
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "accept")
    later(23.9)
    assert cases_of(client, h["Mo"])[0]["status"] == "open"
    later(25)
    # Any read settles it, dated when the window closed, whatever the time now.
    duty = duty_of(client, h["Mo"], league["duty"]["id"])
    assert duty["status"] == "completed" and duty["completedAt"] == duty["evidence"][0]["submittedAt"]
    settled = cases_of(client, h["Pat"])[0]
    assert (settled["status"], settled["resolution"], settled["resolvedAt"]) == ("accepted", "auto", case["closesAt"])
    assert duty["evidence"][0]["decidedAt"] == case["closesAt"]
    later(90)
    cases_of(client, h["Captain"])
    feed = feed_of(client, h["Mo"])
    accepted = [f for f in feed if f["kind"] == "evidence_accepted"]
    assert len(accepted) == 1 and accepted[0]["occurredAt"] == case["closesAt"] and accepted[0]["actorName"] is None
    events = audit_rows(client, "evidence_case.accepted")
    assert len(events) == 1 and events[0].after["resolution"] == "auto"
    assert respond(client, h["Pat"], case["id"], "veto", "Too late").json()["detail"]["code"] == "voting_closed"


def test_the_window_costs_no_marks(client: TestClient, league: dict, storage, later) -> None:
    """Accepted late, evidence still completes the duty when it was submitted: an hour short
    of the second mark at submission, the duty keeps one mark after the window."""
    h, ids = league["h"], league["ids"]
    deadline = (now_utc() - timedelta(hours=168 * 2 - 1)).isoformat()
    duty = open_duty(client, UUID(ids["Mo"]), round_number=6, deadlineAt=deadline)
    assert duty["marks"]["marks"] == 1
    upload_and_submit(client, storage, h["Mo"], [duty["id"]])
    later(25)
    done = duty_of(client, h["Mo"], duty["id"])
    assert done["status"] == "completed" and done["completedAt"] == done["evidence"][0]["submittedAt"]
    assert done["marks"]["marks"] == 1 and done["marks"]["nextMarkAt"] is None


def test_the_feed_and_marks_settle_too(client: TestClient, league: dict, later) -> None:
    h = league["h"]
    later(25)
    assert feed_of(client, h["Mo"])[0]["kind"] == "evidence_accepted"
    assert client.get(lp(client, "/marks"), headers=h["Mo"]).json()[0]["openDuties"] == 0


def test_a_late_response_settles_first(client: TestClient, league: dict, later) -> None:
    h, case = league["h"], league["case"]
    later(24.5)
    assert respond(client, h["Ola"], case["id"], "veto", "Too late").json()["detail"]["code"] == "voting_closed"
    assert cases_of(client, h["Ola"])[0]["resolution"] == "auto"


def test_newer_evidence_supersedes_the_live_case(client: TestClient, league: dict, storage) -> None:
    h, case = league["h"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Wrong spoon")
    upload_and_submit(client, storage, h["Mo"], [league["duty"]["id"]], note="Better video")
    newer, older = cases_of(client, h["Mo"])
    assert (newer["status"], older["status"], older["resolution"]) == ("open", "superseded", None)
    assert older["resolvedAt"] is not None and newer["eligibleCount"] == 3
    assert [link["decision"] for link in duty_of(client, h["Mo"], league["duty"]["id"])["evidence"]] == ["pending", "superseded"]
    assert review(client, h["Captain"], older["id"], "upheld").json()["detail"]["code"] == "not_in_review"


def test_voiding_the_duty_or_withdrawing_the_member_supersedes_the_case(client: TestClient, league: dict, storage) -> None:
    h, ids = league["h"], league["ids"]
    voided = client.post(lp(client, f"/duties/{league['duty']['id']}/void"), json={"reason": "Wrong round"}, headers=h["Captain"])
    assert voided.status_code == 200
    assert cases_of(client, h["Captain"])[0]["status"] == "superseded"
    other = open_duty(client, UUID(ids["Mo"]), round_number=4)
    upload_and_submit(client, storage, h["Mo"], [other["id"]])
    assert withdraw(client, ids["Mo"]).status_code == 204
    assert cases_of(client, h["Captain"], 4)[0]["status"] == "superseded"


# Review routing ----------------------------------------------------------------------------


def test_the_stand_in_reviews_when_the_captain_is_the_subject(client: TestClient, league: dict, storage) -> None:
    h, ids = league["h"], league["ids"]
    own = open_duty(client, UUID(ids["Captain"]), round_number=3)
    upload_and_submit(client, storage, h["Captain"], [own["id"]])
    case = cases_of(client, h["Captain"], 3)[0]
    assert case["eligibleCount"] == 3 and case["isVoter"] is False
    respond(client, h["Mo"], case["id"], "veto", "Old video")
    captain_view = cases_of(client, h["Captain"], 3)[0]
    assert (captain_view["canReview"], captain_view["vetoReason"], captain_view["needsReviewer"]) == (False, None, True)
    assert review(client, h["Captain"], case["id"], "dismissed").json()["detail"]["code"] == "not_reviewer"
    # The captain's override is refused too: nobody decides their own evidence.
    link = duty_of(client, h["Captain"], own["id"])["evidence"][0]
    assert client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted"}, headers=h["Captain"]).json()["detail"]["code"] == "self_review"

    assert set_stand_in(client, ids["Captain"]).json()["detail"]["code"] == "captain_cannot_stand_in"
    assert set_stand_in(client, str(uuid4())).json()["detail"]["code"] == "unknown_member"
    assert set_stand_in(client, ids["Ola"], headers=h["Mo"]).json()["detail"]["code"] == "captain_only"
    named = set_stand_in(client, ids["Ola"])
    assert named.status_code == 200 and named.json() == {"memberId": ids["Ola"], "memberName": "Ola"}
    assert client.get(lp(client, "/stand-in-reviewer"), headers=h["Pat"]).json()["memberName"] == "Ola"
    ola_view = cases_of(client, h["Ola"], 3)[0]
    assert (ola_view["canReview"], ola_view["vetoReason"], ola_view["needsReviewer"]) == (True, "Old video", False)
    assert cases_of(client, h["Captain"], 3)[0]["needsReviewer"] is False
    assert review(client, h["Pat"], case["id"], "upheld").json()["detail"]["code"] == "not_reviewer"
    upheld = review(client, h["Ola"], case["id"], "upheld", "Filmed last season")
    assert upheld.json()["status"] == "rejected"
    events = audit_rows(client, "evidence_case.rejected")
    assert len(events) == 1 and events[0].reason == "Filmed last season"
    assert set_stand_in(client, None).json() == {"memberId": None, "memberName": None}


def test_the_stand_in_reviews_the_captains_veto_unless_involved(client: TestClient, league: dict, storage) -> None:
    h, ids, case = league["h"], league["ids"], league["case"]
    set_stand_in(client, ids["Ola"])
    respond(client, h["Captain"], case["id"], "veto", "Not convinced")
    assert review(client, h["Captain"], case["id"], "dismissed").json()["detail"]["code"] == "not_reviewer"
    assert cases_of(client, h["Ola"])[0]["canReview"] is True
    assert review(client, h["Ola"], case["id"], "dismissed", "It is fine").json()["status"] == "open"
    # The stand-in's own evidence, vetoed by the captain: nobody in the league may review.
    ola_duty = open_duty(client, UUID(ids["Ola"]), round_number=3)
    upload_and_submit(client, storage, h["Ola"], [ola_duty["id"]])
    ola_case = cases_of(client, h["Ola"], 3)[0]
    respond(client, h["Captain"], ola_case["id"], "veto", "Blurry")
    assert cases_of(client, h["Captain"], 3)[0]["needsReviewer"] is True
    assert cases_of(client, h["Ola"], 3)[0]["needsReviewer"] is True and cases_of(client, h["Ola"], 3)[0]["canReview"] is False
    assert cases_of(client, h["Mo"], 3)[0]["needsReviewer"] is False
    for name in ("Captain", "Ola", "Mo", "Pat"):
        assert review(client, h[name], ola_case["id"], "upheld").status_code == 403
    # The admin without a membership is never involved.
    admin = admin_headers(client)
    admin_view = cases_of(client, admin, 3)[0]
    assert (admin_view["canReview"], admin_view["vetoReason"], admin_view["needsReviewer"], admin_view["isVoter"]) == (True, "Blurry", True, False)
    assert respond(client, admin, ola_case["id"], "accept").json()["detail"]["code"] == "admin_not_a_member"
    ruled = review(client, admin, ola_case["id"], "upheld", "Blurry indeed")
    assert ruled.status_code == 200 and ruled.json()["status"] == "rejected"
    rows = audit_rows(client, "evidence_case.rejected")
    with migration_engine().begin() as connection:
        labels = connection.execute(
            text("select actor_label, actor_membership_id from piele.audit_events where league_id = :l and action = 'evidence_case.rejected'"),
            {"l": client.league_id},
        ).all()
        reviewer = connection.execute(
            text("select reviewed_by_label, reviewed_by_membership_id from piele.evidence_case_voters where case_id = :c and review_status = 'upheld'"),
            {"c": ola_case["id"]},
        ).one()
    assert len(rows) == 1 and labels == [("admin", None)] and tuple(reviewer) == ("admin", None)


def test_withdrawing_or_appointing_the_stand_in_clears_it(client: TestClient, league: dict) -> None:
    ids = league["ids"]
    set_stand_in(client, ids["Ola"])
    assert withdraw(client, ids["Ola"]).status_code == 204
    assert client.get(lp(client, "/stand-in-reviewer"), headers=league["h"]["Mo"]).json()["memberId"] is None
    set_stand_in(client, ids["Pat"])
    assert client.post(lp(client, f"/members/{ids['Pat']}/release"), headers=captain_headers(client)).status_code == 204
    assert client.get(lp(client, "/stand-in-reviewer"), headers=league["h"]["Mo"]).json()["memberId"] is None
    assert set_stand_in(client, ids["Pat"]).json()["detail"]["code"] == "not_claimed"
    set_stand_in(client, ids["Mo"])
    admin = admin_headers(client)
    appointed = client.post(f"/v1/admin/leagues/{client.league_id}/captain", json={"membershipId": ids["Mo"]}, headers=admin)
    assert appointed.status_code in (200, 204), appointed.text
    assert client.get(lp(client, "/stand-in-reviewer"), headers=league["h"]["Mo"]).json()["memberId"] is None


# The captain's override --------------------------------------------------------------------


def test_the_captains_override_closes_the_case(client: TestClient, league: dict, storage) -> None:
    h, ids, case = league["h"], league["ids"], league["case"]
    respond(client, h["Ola"], case["id"], "veto", "Wrong spoon")
    link = duty_of(client, h["Mo"], league["duty"]["id"])["evidence"][0]
    decided = client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "accepted", "reason": "I was there"}, headers=h["Captain"])
    assert decided.status_code == 204, decided.text
    closed = cases_of(client, h["Mo"])[0]
    assert (closed["status"], closed["resolution"], closed["canReview"]) == ("accepted", "captain", False)
    done = duty_of(client, h["Mo"], league["duty"]["id"])
    assert done["completedAt"] == done["evidence"][0]["submittedAt"]
    # A rejection closes it as rejected and leaves the duty open.
    other = open_duty(client, UUID(ids["Mo"]), round_number=3)
    upload_and_submit(client, storage, h["Mo"], [other["id"]])
    link = duty_of(client, h["Mo"], other["id"])["evidence"][0]
    client.post(lp(client, f"/evidence/links/{link['id']}/decision"), json={"decision": "rejected", "reason": "Blank"}, headers=h["Captain"])
    rejected = cases_of(client, h["Mo"], 3)[0]
    assert (rejected["status"], rejected["resolution"]) == ("rejected", "captain")
    assert duty_of(client, h["Mo"], other["id"])["status"] == "open"


# Privacy and leagues -----------------------------------------------------------------------


def test_no_response_says_who_voted(client: TestClient, league: dict) -> None:
    h, ids, case = league["h"], league["ids"], league["case"]
    respond(client, h["Pat"], case["id"], "accept")
    respond(client, h["Ola"], case["id"], "veto", "Not a spoon")
    admin = admin_headers(client)
    for viewer in (h["Mo"], h["Captain"], h["Pat"], admin):
        # The round's feed: joining the league is league news with its actor.
        for path, params in (("/evidence/cases", {}), ("/duties", {}), ("/feed", {"round": 2})):
            body = client.get(lp(client, path), params=params, headers=viewer).text
            assert ids["Ola"] not in body and ids["Pat"] not in body
            assert '"Ola"' not in body and '"Pat"' not in body
    # Only the vetoer's own view carries its reason, besides the reviewer's.
    assert cases_of(client, h["Pat"])[0]["myVetoReason"] is None
    with migration_engine().begin() as connection:
        rows = connection.execute(
            text("select action, actor_label, actor_membership_id from piele.audit_events where league_id = :l and action like 'evidence_case.%'"),
            {"l": client.league_id},
        ).all()
    assert ("evidence_case.vetoed", "anonymous member", None) in [tuple(r) for r in rows]
    assert all(r.actor_membership_id != UUID(ids["Ola"]) and r.actor_membership_id != UUID(ids["Pat"]) for r in rows)


def test_cases_stay_in_their_league(client: TestClient, league: dict) -> None:
    h, case = league["h"], league["case"]
    # The captain also captains a second league: the first league's case is unknown there.
    zulu = second_league(client, client.captain_email)  # type: ignore[attr-defined]
    assert client.get("/v1/me", headers=h["Captain"]).status_code == 200  # claims the captain there
    zulu_path = lp(client, f"/evidence/cases/{case['id']}/response", zulu)
    assert client.post(zulu_path, json={"choice": "accept"}, headers=h["Captain"]).json()["detail"]["code"] == "unknown_case"
    assert client.post(lp(client, f"/evidence/cases/{case['id']}/review", zulu), json={"ruling": "upheld", "reason": "x"}, headers=h["Captain"]).json()["detail"]["code"] == "unknown_case"
    assert client.get(lp(client, "/evidence/cases", zulu), headers=h["Captain"]).json() == []
    zulu_members = {m["displayName"]: m["id"] for m in client.get(lp(client, "/members", zulu), headers=h["Captain"]).json()}
    assert set_stand_in(client, zulu_members["Ola"]).json()["detail"]["code"] == "unknown_member"
    # A stranger is not a member.
    stranger = signed_in(client, "STRANGER", f"stranger-{uuid4().hex[:8]}@example.com")
    assert client.get(lp(client, "/evidence/cases"), headers=stranger).json()["detail"]["code"] == "not_a_member"
    assert respond(client, stranger, case["id"], "accept").json()["detail"]["code"] == "not_a_member"
    assert cases_of(client, h["Mo"], 5) == []


def test_row_level_security_keeps_cases_in_their_league(client: TestClient, league: dict) -> None:
    connection = rls_connection(client, subject(client, "CAPTAIN"))
    try:
        assert connection.execute(text("select count(*) from piele.evidence_cases")).scalar_one() == 0
        assert connection.execute(text("select count(*) from piele.evidence_case_voters")).scalar_one() == 0
    finally:
        connection.close()
    connection = rls_connection(client, subject(client, "CAPTAIN"), client.league_id)  # type: ignore[attr-defined]
    try:
        assert connection.execute(text("select count(*) from piele.evidence_cases")).scalar_one() == 1
        assert connection.execute(text("select count(*) from piele.evidence_case_voters")).scalar_one() == 3
    finally:
        connection.close()
