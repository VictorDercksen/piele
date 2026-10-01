"""Players' international records: the submission contract, the name key, the chat's
`internationals` document, and (with PIELE_TEST_DATABASE_URL, like tests/test_database.py) the
table, its upsert, the preview save route and the state route."""

import os
from datetime import date, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text

from app.agent import internationals, previews
from app.agent.models import MAX_INTERNATIONALS, International, PreviewSubmission, ResearchResult
from app.chat import context, service
from app.chat.glossary import UNIONS
from app.competitions.urc_2026_27 import COMPETITION as URC
from app.config import Settings
from app.db import get_engine
from app.matchcentre.service import MatchCentreService
from tests.test_agent import AGENT, DAY_BEFORE, FIXTURE, KICKOFF, agent_client, submission
from tests.test_chat import NOW, Agent, ask, chat_client, clock, facts, mo_headers, research, sources_block  # noqa: F401
from tests.test_league import migration_engine, storage  # noqa: F401

DATABASE_URL = os.environ.get("PIELE_TEST_DATABASE_URL")
needs_database = pytest.mark.skipif(not DATABASE_URL, reason="PIELE_TEST_DATABASE_URL is not set")

HOME, AWAY = "scarlets", "benetton-rugby"
SOURCE = "https://example.org/boks"


def record(name: str = "Piet Veldman", **overrides: Any) -> dict[str, Any]:
    body = {
        "name": name,
        "union": "South Africa",
        "caps": 90,
        "capsAsOf": "2026-09-27",
        "lastTestOn": "2026-09-27",
        "url": SOURCE,
        "title": "Springboks squad",
        "publisher": "SA Rugby",
    }
    body.update(overrides)
    return body


def result(team: str, **overrides: Any) -> dict[str, Any]:
    body = {
        "team": team,
        "items": [{"kind": "other", "text": "Note.", "url": "https://example.org/n", "title": "News"}],
        "mood": {"score": 0, "note": "Steady.", "urls": ["https://example.org/n"]},
    }
    body.update(overrides)
    return body


# The submission contract ----------------------------------------------------------------


def test_research_without_internationals_still_validates() -> None:
    parsed = ResearchResult.model_validate(result("Scarlets"))
    assert parsed.internationals == []
    assert ResearchResult.model_validate(result("Scarlets", internationals=[])).internationals == []


def test_internationals_are_accepted_with_optional_details_only() -> None:
    full = International.model_validate(record())
    assert (full.caps, full.capsAsOf, full.lastTestOn) == (90, date(2026, 9, 27), date(2026, 9, 27))
    minimal = International.model_validate({"name": "A", "union": "Fiji", "url": SOURCE, "title": "t"})
    assert (minimal.caps, minimal.capsAsOf, minimal.lastTestOn, minimal.publisher) == (None, None, None, None)
    assert all(International.model_validate(record(union=union)).union == union for union in UNIONS)


@pytest.mark.parametrize(
    "overrides",
    [
        {"union": "Springboks"},
        {"union": "south africa"},
        {"union": ""},
        {"caps": 0},
        {"caps": 251},
        {"caps": "ninety"},
        {"capsAsOf": "2026-9-27"},
        {"capsAsOf": "27/09/2026"},
        {"capsAsOf": "2026-02-31"},
        {"capsAsOf": "2026-09-27T10:00:00Z"},
        {"capsAsOf": 20260927},
        {"lastTestOn": "yesterday"},
        {"name": "  "},
        {"name": "x" * 101},
        {"title": "x" * 201},
        {"title": ""},
        {"publisher": "x" * 101},
        {"url": "javascript:alert(1)"},
        {"url": "ftp://example.org/x"},
        {"stars": 3},
    ],
)
def test_invalid_internationals_are_rejected(overrides: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        International.model_validate(record(**overrides))


def test_at_most_thirty_internationals_per_side() -> None:
    thirty = [record(f"Player {i}") for i in range(MAX_INTERNATIONALS)]
    assert len(ResearchResult.model_validate(result("Scarlets", internationals=thirty)).internationals) == 30
    with pytest.raises(ValidationError):
        ResearchResult.model_validate(result("Scarlets", internationals=[*thirty, record("One more")]))


def test_a_submission_carries_internationals_inside_the_research() -> None:
    body = submission({"stateHash": "c" * 64, "teamsheetHash": "d" * 64})
    body["research"] = {"home": result("Scarlets", internationals=[record()]), "away": result("Benetton")}
    parsed = PreviewSubmission.model_validate(body)
    assert [i.name for i in parsed.research.home.internationals] == ["Piet Veldman"]  # type: ignore[union-attr]
    # Stored as submitted: dates as ISO text, so the research jsonb reads back unchanged.
    dumped = parsed.research.model_dump(mode="json")  # type: ignore[union-attr]
    assert dumped["home"]["internationals"] == [record()] and dumped["away"]["internationals"] == []


def test_a_bad_international_is_a_422_before_anything_is_stored(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE)
    state = {"stateHash": "c" * 64, "teamsheetHash": "d" * 64}
    for bad in (record(union="Springboks"), record(capsAsOf="2026-13-01")):
        body = submission(state, research={"home": result("Scarlets", internationals=[bad]), "away": result("Benetton")})
        assert client.post("/v1/agent/previews", json=body, headers=AGENT).status_code == 422


# The name key -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, key",
    [
        ("Siya Kolisi", "siya kolisi"),
        ("  Étienne   Oosthuizen ", "etienne oosthuizen"),
        ("JOSÉ  Luis", "jose luis"),
        ("Faf de Klerk", "faf de klerk"),
        ("O'Brien", "o'brien"),
        ("Jean-Luc du Preez", "jean-luc du preez"),
        ("Sébastien Dupré", "sebastien dupre"),
        ("Zürich Müller", "zurich muller"),
        ("Ñandú\tPérez", "nandu perez"),
        ("Jan Serfontein", "jan serfontein"),
        ("Marx　Smith", "marx smith"),
        ("﻿Marx Smith", "marx smith"),
        ("ﬁne Name", "fine name"),
        ("İsmail", "ismail"),
        # No decomposition, so kept as written (the agent's playerKey does the same).
        ("Łukasz Nowak", "łukasz nowak"),
        ("Ælfred Øre", "ælfred øre"),
        ("ʻIkale", "ʻikale"),
        # A decomposed name keys like the composed one.
        ("Renée Dupré", "renee dupre"),
    ],
)
def test_player_key_matches_the_agents_normaliser(name: str, key: str) -> None:
    """The expected values are what playerKey in apps/agent/agent/lib/internationals.ts returns
    for the same names (run under Node 22 when this was written)."""
    assert internationals.player_key(name) == key


def test_player_key_matches_names_across_spelling_differences() -> None:
    assert internationals.player_key("Cobus Reinach") == internationals.player_key("  cobus   REINACH")
    assert internationals.player_key("Andre Esterhuizen") == internationals.player_key("André Esterhuizen")
    assert internationals.player_key("Jean Luc") != internationals.player_key("Jean-Luc")
    assert internationals.player_key("O'Brien") != internationals.player_key("OBrien")


SHEET = {
    "starters": [{"number": n, "name": f"Starter {n}", "position": "Prop"} for n in range(1, 16)],
    "replacements": [{"number": n, "name": f"Bench Player {n}", "position": "Wing"} for n in range(16, 24)],
}


def test_the_matcher_keeps_only_players_in_the_teamsheet() -> None:
    rows = [record("starter 6"), record("BENCH  PLAYER 20"), record("Nobody Here"), record("Starter 6", union="Fiji"), record("   ")]
    kept = internationals.matched(rows, SHEET)
    assert [r["name"] for r in kept] == ["starter 6", "BENCH  PLAYER 20"]  # each player once, the first row
    assert internationals.matched(rows, None) == []
    assert internationals.matched(rows, {"starters": [], "replacements": []}) == []
    assert internationals.matched([], SHEET) == []


# The chat's document ----------------------------------------------------------------------


def side(club: str, names: dict[int, str]) -> dict[str, Any]:
    sheet = {
        "starters": [{"number": n, "name": names.get(n, f"{club} {n}"), "position": "Prop"} for n in range(1, 16)],
        "replacements": [{"number": n, "name": names.get(n, f"{club} {n}"), "position": "Wing"} for n in range(16, 24)],
    }
    return {"club": {"name": club}, "teamsheet": sheet, "features": {"bench": {"forwards": 5, "backs": 3, "unknown": 0}}}


def stored(name: str, **overrides: Any) -> dict[str, Any]:
    row = {
        "name": name,
        "union": "South Africa",
        "caps": 90,
        "capsAsOf": date(2026, 9, 27),
        "lastTestOn": date(2026, 9, 27),
        "checkedAt": NOW,
        "origin": "researcher",
        "url": SOURCE,
        "title": "Springboks squad",
        "publisher": "SA Rugby",
    }
    row.update(overrides)
    return row


def published(**overrides: Any) -> dict[str, Any]:
    base = facts(
        state={
            "teamsheetStatus": "ok",
            "home": side("Scarlets", {6: "Piet Veldman", 19: "Jaco Brandt"}),
            "away": side("Benetton", {}),
        },
        teamsheetStatus="ok",
        internationals={
            "home": [
                stored("Piet Veldman"),
                stored("jaco  BRANDT", union="Tonga", caps=None, capsAsOf=None, lastTestOn=date(2026, 8, 1), url="https://example.org/tonga", title="Tonga squad", publisher=None),
                stored("Not Selected", caps=12),
            ],
            "away": [],
        },
    )
    base.update(overrides)
    return base


def section(document: str, name: str) -> str:
    return document.split(f"<source>{name}</source>\n<document_content>\n")[1].split("\n</document_content>")[0]


def test_internationals_follow_the_teamsheets_with_each_row_citing_its_source() -> None:
    document = context.build(published())
    assert document.index("<source>teamsheets</source>") < document.index("<source>internationals</source>") < document.index("<source>names</source>")
    text_ = section(document, "internationals")
    assert text_.splitlines()[0].endswith("Players not listed have no international record here, which does not mean they are uncapped.")
    assert "- 6 Piet Veldman (starting): South Africa (Springboks), 90 caps as of 2026-09-27, last Test 2026-09-27 [" in text_
    # The teamsheet's spelling is used and a record without caps says nothing about caps.
    assert "- 19 Jaco Brandt (bench): Tonga (ʻIkale Tahi), last Test 2026-08-01 [" in text_
    assert "Not Selected" not in text_ and "12 caps" not in text_
    assert "Benetton (away):\n- none of the selected players has a record" in text_
    numbers = {line.split("]")[0][1:]: line for line in sources_block(document)}
    boks, tonga = [n for n, line in numbers.items() if SOURCE in line or "tonga" in line]
    assert f"[{boks}]" in text_ and f"[{tonga}]" in text_
    assert numbers[boks].endswith(f"Springboks squad | SA Rugby | {SOURCE}")
    assert numbers[tonga].startswith(f"[{tonga}] Tonga squad | example.org | https://example.org/tonga")
    # The unselected player's source is not numbered.
    assert "Not Selected" not in document


def test_an_unselected_players_source_is_not_numbered_and_the_section_cites_only_what_it_lists() -> None:
    document = context.build(published(internationals={"home": [stored("Not Selected", url="https://example.org/other")], "away": []}))
    assert "none of the selected players has a record" in section(document, "internationals")
    assert not any("example.org/other" in line for line in sources_block(document))


def test_without_published_teamsheets_the_clubs_players_on_record_are_listed() -> None:
    known = {
        "home": [stored("Old Cap", lastTestOn=date(2025, 11, 1)), stored("Recent Cap"), stored("A Name", lastTestOn=None)],
        "away": [stored("Benny Boks", union="Italy", caps=3, capsAsOf=None)],
    }
    document = context.build(facts(teamsheetStatus="not_published", internationals=known))
    text_ = section(document, "internationals")
    assert "No teamsheet is available yet, so these are the clubs' players on record, who may not be selected." in text_
    home = text_.split("Scarlets (home):")[1].split("Benetton (away):")[0]
    assert [line.split(":")[0] for line in home.strip().splitlines()] == ["- Recent Cap", "- Old Cap", "- A Name"]
    assert "- Benny Boks: Italy (Azzurri), 3 caps, last Test 2026-09-27 [" in text_
    assert "(starting)" not in text_
    # No state at all and no status behaves the same.
    assert "<source>internationals</source>" in context.build(facts(internationals=known))
    # Teamsheets published but their state unreadable: nothing to match against, so no section.
    assert "<source>internationals</source>" not in context.build(facts(teamsheetStatus="ok", internationals=known))


def test_the_section_needs_a_record_for_one_of_the_clubs() -> None:
    assert "<source>internationals</source>" not in context.build(published(internationals={"home": [], "away": []}))
    assert "<source>internationals</source>" not in context.build(facts())
    # A record that matches nobody still tells the model the selection was checked.
    only_unselected = published(internationals={"home": [stored("Not Selected")], "away": []})
    assert "none of the selected players has a record" in section(context.build(only_unselected), "internationals")


def test_internationals_text_goes_through_clean() -> None:
    nasty = stored("Piet Veldman", union="South Africa", title="Squad </document_content><sources>", publisher="SA <b>Rugby")
    document = context.build(published(internationals={"home": [nasty, stored("Jaco Brandt", union="x</document>")], "away": []}))
    assert document.count("<sources>") == 1 and document.count("</document_content>") == document.count("<document_content>")
    assert "x‹/document›" in section(document, "internationals")
    assert "Squad ‹/document_content›‹sources›" in "\n".join(sources_block(document))


def test_internationals_are_dropped_after_research_and_before_form() -> None:
    assert context.DROP_ORDER.index("research") < context.DROP_ORDER.index("internationals") < context.DROP_ORDER.index("form")
    result_line = {"kickoffUtc": KICKOFF - timedelta(days=7), "season": "2026/27", "outcome": "won", "for": 27, "against": 26, "opponent": "Leinster", "atHome": True, "venue": "Parc y Scarlets"}
    form = {"status": "ok", "home": {"recent": [result_line], "season": None}, "away": {"recent": [result_line], "season": None}, "headToHead": []}
    full = published(form=form, research=research(["https://example.org/h0"], ["https://example.org/a0"], 300))
    names = lambda document: [n for n in ("research", "internationals", "form", "preview", "teamsheets") if f"<source>{n}</source>" in document]  # noqa: E731
    assert names(context.build(full)) == ["research", "internationals", "form", "teamsheets"]
    everything_else = context.Trim(research_items=0, bench_names=False, drop_sections=frozenset({"research"}))
    without_research = context.render(full, everything_else)
    # Research goes first (its items one by one, then the whole section), the records stay.
    assert names(context.build(full, len(without_research))) == ["internationals", "form", "teamsheets"]
    # One character less and the records go, with their sources; the form is still there.
    smaller = context.build(full, len(without_research) - 1)
    assert names(smaller) == ["form", "teamsheets"]
    assert not any(SOURCE in line for line in sources_block(smaller))
    without_records = context.render(full, context.Trim(research_items=0, bench_names=False, drop_sections=frozenset({"research", "internationals"})))
    assert names(context.build(full, len(without_records))) == ["form", "teamsheets"]
    assert names(context.build(full, len(without_records) - 1)) == ["teamsheets"]


# What the chat's first transaction hands over ----------------------------------------------


def test_the_chat_facts_carry_the_stored_records_of_each_club() -> None:
    actor = SimpleNamespace(competition=URC, league_timezone="UTC", favourite_team_id=None, display_name="Mo")
    fixture = URC.schedule().fixture(FIXTURE)
    picks = {"picks": [], "locked": False, "myPick": None}
    known = {HOME: [stored("Piet Veldman")], AWAY: []}
    built = service._facts(actor, fixture, None, picks, known)
    assert built["internationals"] == {"home": [stored("Piet Veldman")], "away": []}
    # Without a read (older callers, a failed read) both sides are empty rather than missing.
    assert service._facts(actor, fixture, None, picks)["internationals"] == {"home": [], "away": []}


# The table ----------------------------------------------------------------------------------


@pytest.fixture
def engine():
    return get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))


def club() -> str:
    return f"test-club-{uuid4().hex[:10]}"


def rows_of(connection, club_id: str) -> dict[str, Any]:
    return {r["name"]: r for r in internationals.for_clubs(connection, [club_id])[club_id]}


def as_operator(club_id: str, name: str, **columns: Any) -> None:
    """An operator row, which only the migration role can write."""
    values = {
        "club_id": club_id, "player_key": internationals.player_key(name), "name": name, "union_name": "Wales", "caps": 50,
        "source_url": "https://example.org/operator", "source_title": "Entered by hand", "origin": "operator", **columns,
    }
    with migration_engine().begin() as connection:
        connection.execute(
            text(f"insert into piele.player_internationals ({', '.join(values)}) values ({', '.join(':' + k for k in values)})"), values
        )


@needs_database
def test_the_runtime_role_reads_inserts_and_updates_but_never_deletes(engine) -> None:
    with engine.connect() as connection:
        enabled, policies = connection.execute(
            text("select relrowsecurity, (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'piele' and tablename = 'player_internationals') from pg_class where oid = 'piele.player_internationals'::regclass")
        ).one()
        assert enabled and policies == ["player_internationals_insert", "player_internationals_read", "player_internationals_update"]
        for privilege, expected in (("select", True), ("insert", True), ("update", True), ("delete", False)):
            assert connection.execute(text("select has_table_privilege(current_user, 'piele.player_internationals', :p)"), {"p": privilege}).scalar_one() is expected
    club_id = club()
    with engine.begin() as connection:
        assert internationals.upsert(connection, club_id, [International.model_validate(record()).model_dump()], DAY_BEFORE) == 1
    with engine.connect() as connection:
        with pytest.raises(Exception, match="permission denied"):
            connection.execute(text("delete from piele.player_internationals where club_id = :c"), {"c": club_id})


@needs_database
def test_the_runtime_role_cannot_write_operator_rows_or_malformed_ones(engine) -> None:
    club_id = club()
    insert = (
        "insert into piele.player_internationals (club_id, player_key, name, union_name, caps, source_url, source_title, origin)"
        " values (:c, :k, 'N', 'Wales', :caps, :url, 't', :origin)"
    )
    base = {"c": club_id, "k": "n", "caps": 5, "url": "https://example.org/x", "origin": "researcher"}
    with engine.connect() as connection:
        for override, message in (
            ({"origin": "operator"}, "row-level security"),
            ({"origin": "somebody"}, "violates"),
            ({"caps": 0}, "violates"),
            ({"caps": 251}, "violates"),
            ({"url": "ftp://example.org/x"}, "violates"),
            ({"url": "example.org/x"}, "violates"),
        ):
            with pytest.raises(Exception, match=message), connection.begin():
                connection.execute(text(insert), {**base, **override})
        with connection.begin():
            connection.execute(text(insert), base)
        with pytest.raises(Exception, match="violates unique|duplicate key"), connection.begin():
            connection.execute(text(insert), base)
        with pytest.raises(Exception, match="row-level security"), connection.begin():
            connection.execute(text("update piele.player_internationals set origin = 'operator' where club_id = :c"), {"c": club_id})


@needs_database
def test_upsert_stores_replaces_and_keeps_caps_when_the_new_record_has_none(engine) -> None:
    club_id = club()
    first = International.model_validate(record("Piet Veldman")).model_dump()
    with engine.begin() as connection:
        assert internationals.upsert(connection, club_id, [first, record("Piet  VELDMAN", union="Fiji") | {"capsAsOf": None, "lastTestOn": None}], DAY_BEFORE) == 1
        stored_row = rows_of(connection, club_id)["Piet Veldman"]
    assert (stored_row["union"], stored_row["caps"], stored_row["capsAsOf"], stored_row["origin"], stored_row["checkedAt"]) == (
        "South Africa", 90, date(2026, 9, 27), "researcher", DAY_BEFORE,
    )  # the second row had the same key: only the first is stored
    later = DAY_BEFORE + timedelta(days=3)
    newer = International.model_validate(record("Piet Veldman", caps=91, capsAsOf="2026-10-01", url="https://example.org/newer", title="Newer", publisher=None)).model_dump()
    with engine.begin() as connection:
        assert internationals.upsert(connection, club_id, [newer], later) == 1
        updated = rows_of(connection, club_id)["Piet Veldman"]
    assert (updated["caps"], updated["capsAsOf"], updated["url"], updated["title"], updated["publisher"], updated["checkedAt"]) == (
        91, date(2026, 10, 1), "https://example.org/newer", "Newer", None, later,
    )
    # A later record without caps (and no date of a Test) keeps what is known.
    bare = International.model_validate({"name": "Piet Veldman", "union": "South Africa", "url": SOURCE, "title": "Bare"}).model_dump()
    with engine.begin() as connection:
        internationals.upsert(connection, club_id, [bare], later + timedelta(days=1))
        kept = rows_of(connection, club_id)["Piet Veldman"]
    assert (kept["caps"], kept["capsAsOf"], kept["lastTestOn"], kept["title"]) == (91, date(2026, 10, 1), date(2026, 9, 27), "Bare")
    with engine.begin() as connection:
        assert internationals.upsert(connection, club_id, [], later) == 0
        assert internationals.upsert(connection, club_id, [record("́")], later) == 0  # a name with no letters keys to nothing


@needs_database
def test_upsert_never_overwrites_an_operator_row(engine) -> None:
    club_id = club()
    as_operator(club_id, "Hand Entered", caps=50, last_test_on="2026-06-01")
    with engine.begin() as connection:
        written = internationals.upsert(
            connection, club_id, [record("hand  entered", caps=1), record("Researched")], DAY_BEFORE
        )
        rows = rows_of(connection, club_id)
    assert written == 1
    operator = rows["Hand Entered"]
    assert (operator["origin"], operator["union"], operator["caps"], operator["lastTestOn"], operator["title"]) == (
        "operator", "Wales", 50, date(2026, 6, 1), "Entered by hand",
    )
    assert rows["Researched"]["origin"] == "researcher"


def put(connection, club_id: str, day: timedelta, **overrides: Any) -> int:
    """Upsert one record for 'Piet Veldman' as the run `day` after DAY_BEFORE."""
    row = International.model_validate(record(**overrides)).model_dump()
    return internationals.upsert(connection, club_id, [row], DAY_BEFORE + day)


@needs_database
def test_upsert_never_moves_last_test_or_caps_backwards(engine) -> None:
    club_id = club()
    with engine.begin() as connection:
        put(connection, club_id, timedelta(0), caps=90, capsAsOf="2026-09-27", lastTestOn="2026-09-27")
        # An older page: an earlier Test, fewer caps as of an earlier date. Neither moves; the
        # union and the source are the newer run's.
        put(connection, club_id, timedelta(days=1), caps=80, capsAsOf="2026-06-01", lastTestOn="2026-06-01", union="Fiji", url="https://example.org/old", title="Old page")
        row = rows_of(connection, club_id)["Piet Veldman"]
    assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (90, date(2026, 9, 27), date(2026, 9, 27))
    assert (row["union"], row["url"], row["title"], row["checkedAt"]) == ("Fiji", "https://example.org/old", "Old page", DAY_BEFORE + timedelta(days=1))
    with engine.begin() as connection:
        # A new caps figure without a date cannot replace a dated one; a later Test still counts.
        put(connection, club_id, timedelta(days=2), caps=95, capsAsOf=None, lastTestOn="2026-10-04")
        row = rows_of(connection, club_id)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (90, date(2026, 9, 27), date(2026, 10, 4))
        # The same date replaces (not older); a later one replaces too.
        put(connection, club_id, timedelta(days=3), caps=91, capsAsOf="2026-09-27", lastTestOn=None)
        row = rows_of(connection, club_id)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (91, date(2026, 9, 27), date(2026, 10, 4))
        put(connection, club_id, timedelta(days=4), caps=92, capsAsOf="2026-10-05", lastTestOn="2026-10-04")
        row = rows_of(connection, club_id)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (92, date(2026, 10, 5), date(2026, 10, 4))
        # A record without caps keeps both caps and their date.
        put(connection, club_id, timedelta(days=5), caps=None, capsAsOf="2026-12-01", lastTestOn=None)
        row = rows_of(connection, club_id)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"]) == (92, date(2026, 10, 5))


@needs_database
def test_upsert_fills_what_the_stored_record_lacks(engine) -> None:
    club_id = club()
    with engine.begin() as connection:
        put(connection, club_id, timedelta(0), caps=None, capsAsOf=None, lastTestOn=None)
        # Nothing stored for caps or the Test date: whatever arrives is taken, whatever its date.
        put(connection, club_id, timedelta(days=1), caps=40, capsAsOf="2026-01-01", lastTestOn="2026-01-01")
        row = rows_of(connection, club_id)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (40, date(2026, 1, 1), date(2026, 1, 1))
    other = club()
    with engine.begin() as connection:
        # Stored caps without a date: a dated figure replaces it.
        put(connection, other, timedelta(0), caps=30, capsAsOf=None, lastTestOn=None)
        put(connection, other, timedelta(days=1), caps=31, capsAsOf="2026-01-01", lastTestOn=None)
        row = rows_of(connection, other)["Piet Veldman"]
        assert (row["caps"], row["capsAsOf"], row["lastTestOn"]) == (31, date(2026, 1, 1), None)


@needs_database
def test_the_runtime_role_cannot_update_an_operator_row(engine) -> None:
    club_id = club()
    as_operator(club_id, "Hand Entered", caps=50)
    as_operator(club_id, "Also Entered", caps=60)
    with engine.begin() as connection:
        # The row is invisible to the role's updates: nothing is affected, and nothing raises.
        for statement in (
            "update piele.player_internationals set origin = 'researcher' where club_id = :c",
            "update piele.player_internationals set caps = 1, union_name = 'Fiji' where club_id = :c and player_key = 'hand entered'",
        ):
            assert connection.execute(text(statement), {"c": club_id}).rowcount == 0
        rows = rows_of(connection, club_id)
    assert {n: (r["origin"], r["union"], r["caps"]) for n, r in rows.items()} == {
        "Hand Entered": ("operator", "Wales", 50),
        "Also Entered": ("operator", "Wales", 60),
    }


@needs_database
def test_the_upsert_skips_operator_rows_without_an_error_and_counts_only_what_it_wrote(engine) -> None:
    club_id = club()
    as_operator(club_id, "Hand Entered", caps=50, last_test_on="2026-06-01")
    with engine.begin() as connection:
        only_operator = internationals.upsert(connection, club_id, [record("hand entered", caps=1)], DAY_BEFORE)
        assert only_operator == 0
        assert put(connection, club_id, timedelta(0), caps=5) == 1  # inserted
        assert put(connection, club_id, timedelta(days=1), caps=6) == 1  # updated
        mixed = [record("Hand Entered", caps=2), record("Piet Veldman", caps=7), record("Brand New")]
        assert internationals.upsert(connection, club_id, mixed, DAY_BEFORE + timedelta(days=2)) == 2
        rows = rows_of(connection, club_id)
    assert (rows["Hand Entered"]["origin"], rows["Hand Entered"]["caps"], rows["Hand Entered"]["lastTestOn"]) == ("operator", 50, date(2026, 6, 1))
    assert rows["Piet Veldman"]["caps"] == 7 and rows["Brand New"]["origin"] == "researcher"


@needs_database
def test_records_are_read_per_club_in_name_order(engine) -> None:
    one, other, empty = club(), club(), club()
    with engine.begin() as connection:
        internationals.upsert(connection, one, [record("Zed"), record("Abe")], DAY_BEFORE)
        internationals.upsert(connection, other, [record("Mid")], DAY_BEFORE)
        found = internationals.for_clubs(connection, [one, other, empty, None])
        assert internationals.for_clubs(connection, []) == {} and internationals.for_clubs(connection, [None]) == {}
    assert {c: [r["name"] for r in rows] for c, rows in found.items()} == {one: ["Abe", "Zed"], other: ["Mid"], empty: []}
    assert set(found[one][0]) == {"name", "union", "caps", "capsAsOf", "lastTestOn", "checkedAt", "origin", "url", "title", "publisher"}


def test_the_state_view_carries_the_source_so_the_writer_can_cite_it() -> None:
    row = {
        "name": "Piet Veldman", "union": "South Africa", "caps": 90, "capsAsOf": date(2026, 9, 27), "lastTestOn": date(2026, 9, 27),
        "checkedAt": DAY_BEFORE, "origin": "researcher", "url": SOURCE, "title": "Springboks squad", "publisher": "SA Rugby", "extra": 1,
    }
    [view] = internationals.state_view([row])
    assert set(view) == {"name", "union", "caps", "capsAsOf", "lastTestOn", "checkedAt", "origin", "url", "title", "publisher"}
    assert (view["url"], view["title"], view["publisher"]) == (SOURCE, "Springboks squad", "SA Rugby")


# The routes ---------------------------------------------------------------------------------


@pytest.fixture
def clean_clubs():
    """The route tests use the real club ids, which the test database keeps between runs."""
    def wipe() -> None:
        with migration_engine().begin() as connection:
            connection.execute(text("delete from piele.player_internationals where club_id in (:h, :a)"), {"h": HOME, "a": AWAY})

    wipe()
    yield
    wipe()


def names_on(client: TestClient) -> dict[str, list[str]]:
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    return {side: [p["name"] for p in state[side]["teamsheet"]["starters"] + state[side]["teamsheet"]["replacements"]] for side in ("home", "away")}


def with_research(state: dict, home: list[dict], away: list[dict]) -> dict:
    return submission(state, research={"home": result("Scarlets", internationals=home), "away": result("Benetton", internationals=away)})


def read_rows(club_id: str) -> dict[str, Any]:
    with get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL)).connect() as connection:
        return rows_of(connection, club_id)


@needs_database
def test_saving_a_preview_stores_internationals_of_players_in_the_teamsheet(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    sheet = names_on(client)
    home_starter, home_bench, away_starter = sheet["home"][5], sheet["home"][18], sheet["away"][8]
    body = with_research(
        state,
        [record(home_starter, caps=40), record(home_bench.upper(), union="Tonga", caps=None, capsAsOf=None), record("Nobody Here")],
        # A Scarlets player named on the Benetton side does not match that side's teamsheet.
        [record(away_starter, union="Italy", caps=3), record(sheet["home"][0], union="Fiji")],
    )
    response = client.post("/v1/agent/previews", json=body, headers=AGENT)
    assert response.status_code == 201, response.text

    home = read_rows(HOME)
    assert sorted(home) == sorted([home_starter, home_bench.upper()])
    assert (home[home_starter]["union"], home[home_starter]["caps"], home[home_starter]["origin"], home[home_starter]["checkedAt"]) == ("South Africa", 40, "researcher", DAY_BEFORE)
    assert (home[home_bench.upper()]["union"], home[home_bench.upper()]["caps"]) == ("Tonga", None)
    away = read_rows(AWAY)
    assert list(away) == [away_starter] and away[away_starter]["union"] == "Italy"
    # The research the preview keeps is exactly as submitted, matched or not.
    with get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL)).connect() as connection:
        research = previews.latest(connection, URC.id, FIXTURE).research
    assert [i["name"] for i in research["home"]["internationals"]] == [home_starter, home_bench.upper(), "Nobody Here"]
    assert len(research["away"]["internationals"]) == 2


@needs_database
def test_a_retried_run_does_not_write_internationals_again(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    starter = names_on(client)["home"][5]
    body = with_research(state, [record(starter, caps=40)], [])
    assert client.post("/v1/agent/previews", json=body, headers=AGENT).status_code == 201
    # The same run id again, a day later with different numbers: the stored preview is returned
    # and nothing is written.
    changed = {**body, "research": {**body["research"], "home": {**body["research"]["home"], "internationals": [record(starter, caps=41)]}}}
    later = agent_client(monkeypatch, DAY_BEFORE + timedelta(hours=5), database_url=DATABASE_URL)
    assert later.post("/v1/agent/previews", json=changed, headers=AGENT).status_code == 200
    kept = read_rows(HOME)[starter]
    assert (kept["caps"], kept["checkedAt"]) == (40, DAY_BEFORE)
    # A new run is a new write.
    assert later.post("/v1/agent/previews", json={**changed, "runId": f"run-{uuid4().hex}"}, headers=AGENT).status_code == 201
    renewed = read_rows(HOME)[starter]
    assert (renewed["caps"], renewed["checkedAt"]) == (41, DAY_BEFORE + timedelta(hours=5))


@needs_database
def test_operator_rows_survive_a_save(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    names = names_on(client)["home"]
    as_operator(HOME, names[0], union_name="Wales", caps=77)
    body = with_research(state, [record(names[0], caps=1), record(names[1])], [])
    assert client.post("/v1/agent/previews", json=body, headers=AGENT).status_code == 201
    rows = read_rows(HOME)
    assert (rows[names[0]]["origin"], rows[names[0]]["union"], rows[names[0]]["caps"]) == ("operator", "Wales", 77)
    assert rows[names[1]]["origin"] == "researcher"


@needs_database
def test_without_a_teamsheet_the_preview_is_saved_and_nothing_else(monkeypatch, clean_clubs) -> None:
    early = agent_client(monkeypatch, KICKOFF - timedelta(days=5), database_url=DATABASE_URL)
    state = {"stateHash": "c" * 64, "teamsheetHash": "d" * 64}
    body = with_research(state, [record("Scarlets 6")], [record("Benetton 6")])
    assert early.post("/v1/agent/previews", json=body, headers=AGENT).status_code == 201
    assert read_rows(HOME) == {} and read_rows(AWAY) == {}


@needs_database
def test_a_teamsheet_that_cannot_be_read_does_not_fail_the_save(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    starter = names_on(client)["home"][5]

    def broken(self, fixture, now):
        raise RuntimeError("feed down")

    monkeypatch.setattr(MatchCentreService, "teamsheets", broken)
    assert client.post("/v1/agent/previews", json=with_research(state, [record(starter)], []), headers=AGENT).status_code == 201
    assert read_rows(HOME) == {}


@needs_database
def test_a_failing_upsert_leaves_the_stored_preview_alone(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    state = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    starter = names_on(client)["home"][5]

    def broken(connection, club_id, rows, now):
        connection.execute(text("select 1 / 0"))  # a database error, which aborts a plain transaction

    monkeypatch.setattr(internationals, "upsert", broken)
    body = with_research(state, [record(starter)], [])
    response = client.post("/v1/agent/previews", json=body, headers=AGENT)
    assert response.status_code == 201, response.text
    assert read_rows(HOME) == {}
    with get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL)).connect() as connection:
        assert previews.latest(connection, URC.id, FIXTURE).run_id == body["runId"]


@needs_database
def test_state_returns_the_stored_records_of_the_selected_players_outside_the_hash(monkeypatch, clean_clubs) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)
    before = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert before["home"]["internationals"] == [] and before["away"]["internationals"] == []
    names = names_on(client)
    club_rows = {HOME: [record(names["home"][5]), record("Left Out Of The Squad")], AWAY: [record(names["away"][17], union="Italy", caps=None, capsAsOf=None, lastTestOn=None)]}
    engine = get_engine(Settings(_env_file=None, environment="test", database_url=DATABASE_URL))
    with engine.begin() as connection:
        for club_id, rows in club_rows.items():
            internationals.upsert(connection, club_id, [International.model_validate(r).model_dump() for r in rows], DAY_BEFORE)

    after = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert after["stateHash"] == before["stateHash"] and after["teamsheetHash"] == before["teamsheetHash"]
    assert after["home"]["internationals"] == [
        {"name": names["home"][5], "union": "South Africa", "caps": 90, "capsAsOf": "2026-09-27", "lastTestOn": "2026-09-27", "checkedAt": DAY_BEFORE.isoformat().replace("+00:00", "Z"), "origin": "researcher", "url": SOURCE, "title": "Springboks squad", "publisher": "SA Rugby"}
    ]
    assert after["away"]["internationals"] == [
        {"name": names["away"][17], "union": "Italy", "caps": None, "capsAsOf": None, "lastTestOn": None, "checkedAt": DAY_BEFORE.isoformat().replace("+00:00", "Z"), "origin": "researcher", "url": SOURCE, "title": "Springboks squad", "publisher": "SA Rugby"}
    ]
    # Records of a club do not show on the other side.
    assert all(i["name"] in names["home"] for i in after["home"]["internationals"])


def test_state_without_a_database_or_teamsheet_has_empty_internationals(monkeypatch) -> None:
    body = agent_client(monkeypatch, DAY_BEFORE).get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert body["home"]["internationals"] == [] and body["away"]["internationals"] == []
    early = agent_client(monkeypatch, KICKOFF - timedelta(days=5)).get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert early["away"]["teamsheet"] is None and early["away"]["internationals"] == []


@needs_database
def test_a_state_that_cannot_read_the_table_still_returns(monkeypatch) -> None:
    client = agent_client(monkeypatch, DAY_BEFORE, database_url=DATABASE_URL)

    def broken(connection, club_ids):
        connection.execute(text("select 1 / 0"))

    monkeypatch.setattr(internationals, "for_clubs", broken)
    body = client.get(f"/v1/agent/fixtures/{FIXTURE}/state", headers=AGENT).json()
    assert body["home"]["internationals"] == [] and body["teamsheetStatus"] == "ok"


# The chat route -------------------------------------------------------------------------------


@needs_database
def test_the_chat_document_lists_the_selected_players_records(storage, clock, clean_clubs) -> None:  # noqa: F811
    agent = Agent()
    chat = chat_client(storage, agent)
    sheet = {s: [p for p in URC_PLAYERS[s]] for s in ("home", "away")}
    engine = get_engine(chat.app.state.settings)
    with engine.begin() as connection:
        internationals.upsert(connection, HOME, [International.model_validate(record(sheet["home"][5])).model_dump(), International.model_validate(record("Not In The Squad")).model_dump()], NOW)
        internationals.upsert(connection, AWAY, [International.model_validate(record(sheet["away"][17], union="Italy", caps=3, capsAsOf=None, url="https://example.org/azzurri", title="Azzurri squad", publisher=None)).model_dump()], NOW)
    assert ask(chat, mo_headers(chat)).status_code == 200
    document = agent.body()["context"]
    records = section(document, "internationals")
    assert f"- 6 {sheet['home'][5]} (starting): South Africa (Springboks), 90 caps as of 2026-09-27" in records
    assert f"- 18 {sheet['away'][17]} (bench): Italy (Azzurri), 3 caps" in records
    assert "Not In The Squad" not in document
    assert any("example.org/azzurri" in line for line in sources_block(document))


# The fake feed names its players "<short name> <shirt>"; the chat test reads them the same way.
URC_PLAYERS = {"home": [f"Scarlets {n}" for n in range(1, 24)], "away": [f"Benetton {n}" for n in range(1, 24)]}
