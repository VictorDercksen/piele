"""The context document the chat model reads: everything it may say about the fixture.

Pure functions over plain dicts (the service gathers them), so the wording, the source
numbering and the trimming are testable without a database or providers. Nothing reaches
the model that is not written here, and everything here is data the member may already read.

Layout: `<documents>` with one `<document index="n">` per section that has data, each with
`<source>` and `<document_content>`, then a `<sources>` block of `[n] title | publisher | url`
lines that the agent turns into citations. Free text (agent, researcher and member names) is
put on one line and its angle brackets replaced, so it cannot close a tag or forge a source.
"""

from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

MAX_CHARS = 32_000
POOL_HIDDEN = "The other members' picks are hidden until you have made your own pick or the match has kicked off."
# The state sources, as (url, title, publisher).
MATCH_CENTRE = ("https://www.unitedrugby.com/match-centre", "URC match centre", "United Rugby Championship")
OPEN_METEO = ("https://open-meteo.com/", "Open-Meteo forecast", "Open-Meteo")
STATE_WORDS = {
    "scheduled": "not started",
    "live": "live",
    "half_time": "half time",
    "full_time": "full time",
    "postponed": "postponed",
    "cancelled": "cancelled",
}
EVENT_WORDS = {
    "try": "try",
    "penalty_try": "penalty try",
    "conversion": "conversion",
    "penalty_goal": "penalty goal",
    "drop_goal": "drop goal",
    "yellow_card": "yellow card",
    "red_card": "red card",
}


@dataclass(frozen=True)
class Trim:
    """How much of the bulky material to keep. None keeps all of it."""

    research_items: int | None = None
    timeline_events: int | None = None
    bench_names: bool = True
    # Last resort, beyond the contract's three steps: whole sections, then the pool's names.
    drop_sections: frozenset[str] = frozenset()
    pool_names: int | None = None


def build(facts: Mapping[str, Any], limit: int = MAX_CHARS) -> str:
    """The document, under `limit` characters. To fit, research items go first (round robin
    from the end), then the oldest timeline events, then the bench names."""
    trim = Trim()
    document = render(facts, trim)
    research = len(_research_order(facts.get("research")))
    events = len(_events(facts.get("score")))
    while len(document) > limit and research > 0:
        research -= 1
        trim = replace(trim, research_items=research)
        document = render(facts, trim)
    while len(document) > limit and events > 0:
        events -= 1
        trim = replace(trim, timeline_events=events)
        document = render(facts, trim)
    if len(document) > limit:
        trim = replace(trim, bench_names=False)
        document = render(facts, trim)
    for section in ("research", "preview", "teamsheets"):
        if len(document) <= limit:
            break
        trim = replace(trim, drop_sections=trim.drop_sections | {section})
        document = render(facts, trim)
    pool = len((facts.get("member") or {}).get("pool") or [])
    while len(document) > limit and pool > 0:
        pool = max(0, pool - 10)
        trim = replace(trim, pool_names=pool)
        document = render(facts, trim)
    return document


def render(facts: Mapping[str, Any], trim: Trim) -> str:
    tz = facts.get("timezone") or "UTC"
    now = facts["now"]
    fixture = facts["fixture"]
    sources = Sources()
    # Numbering: the preview's sources, then the research items' URLs, then the state sources.
    preview = facts.get("preview") if "preview" not in trim.drop_sections else None
    preview_numbers = [sources.add(s.get("url"), s.get("title"), s.get("publisher")) for s in (preview or {}).get("sources") or []]
    research = facts.get("research") if "research" not in trim.drop_sections else None
    kept = _research_order(research)[: trim.research_items] if trim.research_items is not None else _research_order(research)
    for _, item in kept:
        sources.add(item.get("url"), item.get("title"), item.get("publisher"))
    state = facts.get("state") if "teamsheets" not in trim.drop_sections else None
    published = state is not None and state.get("teamsheetStatus") == "ok"
    weather = facts.get("weather")
    forecast = weather if isinstance(weather, Mapping) and weather.get("status") == "ok" else None
    centre_number = sources.add(*MATCH_CENTRE) if published else None
    meteo_number = sources.add(*OPEN_METEO) if forecast else None

    sections: list[tuple[str, str]] = [("fixture", _fixture(facts, fixture, tz, now))]
    if "teamsheets" not in trim.drop_sections:
        sheets = _teamsheets(state, facts.get("teamsheetStatus"), trim, centre_number)
        if sheets:
            sections.append(("teamsheets", sheets))
    if forecast:
        sections.append(("forecast", _forecast(forecast, tz, meteo_number)))
    if preview:
        sections.append(("preview", _preview(preview, preview_numbers, fixture, tz)))
    if research:
        sections.append(("research", _research(research, kept, sources)))
    match = _match(facts.get("score"), fixture, trim)
    if match:
        sections.append(("match", match))
    sections.append(("member", _member(facts.get("member") or {}, fixture, tz, trim)))

    parts = ["<documents>"]
    for index, (name, content) in enumerate(sections, start=1):
        parts += [
            f'<document index="{index}">',
            f"<source>{name}</source>",
            "<document_content>",
            content,
            "</document_content>",
            "</document>",
        ]
    parts += ["</documents>", "<sources>", *sources.lines(), "</sources>"]
    return "\n".join(parts)


# Sources -------------------------------------------------------------------------------


class Sources:
    """Numbered from 1, one entry per URL."""

    def __init__(self) -> None:
        self._numbers: dict[str, int] = {}
        self._lines: list[str] = []

    def add(self, url: Any, title: Any, publisher: Any) -> int | None:
        if not isinstance(url, str) or urlsplit(url).scheme not in ("http", "https"):
            return None
        if url in self._numbers:
            return self._numbers[url]
        number = len(self._lines) + 1
        self._numbers[url] = number
        host = urlsplit(url).hostname or ""
        label = clean(title) or host
        # The agent reads the line from the right: url, then publisher, then the title.
        self._lines.append(f"[{number}] {label} | {clean(publisher or host).replace('|', '/')} | {url.replace('|', '%7C')}")
        return number

    def number(self, url: Any) -> int | None:
        return self._numbers.get(url) if isinstance(url, str) else None

    def lines(self) -> list[str]:
        return list(self._lines)


def cite(numbers: Sequence[int | None]) -> str:
    marks = "".join(f"[{n}]" for n in dict.fromkeys(n for n in numbers if n is not None))
    return f" {marks}" if marks else ""


# Sections ------------------------------------------------------------------------------


def _fixture(facts: Mapping[str, Any], fixture: Mapping[str, Any], tz: str, now: datetime) -> str:
    kickoff = _dt(fixture.get("kickoffUtc"))
    place = ", ".join(clean(fixture.get(key)) for key in ("venue", "city", "country") if fixture.get(key))
    lines = [
        f"Competition: {clean(facts.get('competition'))}, {clean(fixture.get('roundLabel') or 'Round ' + str(fixture.get('round')))}.",
        f"Match: {clean(fixture.get('home'))} (home) v {clean(fixture.get('away'))} (away).",
        f"Kickoff: {when(kickoff, tz)}." if kickoff else "Kickoff: not known yet.",
        f"Venue: {place}." if place else "Venue: not known.",
        f"Now: {when(now, tz)}.",
        f"Status: {_status(kickoff, facts.get('score'), now)}.",
    ]
    return "\n".join(lines)


def _status(kickoff: datetime | None, score: Any, now: datetime) -> str:
    state = score.get("state") if isinstance(score, Mapping) and score.get("status") == "ok" else None
    if state in ("live", "half_time"):
        return "live" + (" (half time)" if state == "half_time" else "")
    if state == "full_time":
        return "finished"
    if state in ("postponed", "cancelled"):
        return state
    if kickoff is None or now < kickoff:
        return "upcoming"
    return "kicked off (no live score available)"


def _teamsheets(state: Mapping[str, Any] | None, status: Any, trim: Trim, number: int | None) -> str:
    if state is None or state.get("teamsheetStatus") != "ok":
        if status == "not_published" or status == "too_early":
            return "The teamsheets are not published yet."
        if status:
            return "The teamsheets could not be read from the URC match centre just now."
        return ""
    lines = [f"Published teamsheets from the URC match centre.{cite([number])}"]
    for side in ("home", "away"):
        lines += _side(state.get(side) or {}, side, trim)
    return "\n".join(lines)


def _side(side_state: Mapping[str, Any], side: str, trim: Trim) -> list[str]:
    club = clean((side_state.get("club") or {}).get("name") or (side_state.get("club") or {}).get("id"))
    sheet = side_state.get("teamsheet") or {}
    features = side_state.get("features") or {}
    lines = ["", f"{club} ({side}):"]
    lines.append("Starting XV: " + "; ".join(_player(p) for p in sheet.get("starters") or []) + ".")
    bench = features.get("bench") or {}
    split = f"{bench.get('forwards', 0)} forwards, {bench.get('backs', 0)} backs" + (
        f", {bench['unknown']} unknown" if bench.get("unknown") else ""
    )
    if trim.bench_names:
        lines.append(f"Bench ({split}): " + "; ".join(_player(p) for p in sheet.get("replacements") or []) + ".")
    else:
        lines.append(f"Bench split: {split}.")
    changes = features.get("changesFromPrevious")
    if changes:
        moved = [f"{clean(c.get('name'))} {c.get('from')} to {c.get('to')}" for c in changes.get("shirtChanges") or []]
        lines.append(
            "Changes from the previous teamsheet: "
            f"in {_names(changes.get('startersIn'))}; out {_names(changes.get('startersOut'))}; "
            f"shirt changes {', '.join(moved) or 'none'}."
        )
    missing = features.get("regularStartersMissing")
    if missing is not None:
        listed = [
            f"{clean(m.get('name'))} ({m.get('starts')} of {m.get('of')} recent starts{', on the bench' if m.get('onBench') else ''})"
            for m in missing
        ]
        lines.append(f"Regular starters missing: {', '.join(listed) or 'none'}.")
    ages = features.get("ages")
    if ages:
        lines.append(
            f"Average ages: starters {ages.get('starters')}, forwards {ages.get('forwards')}, backs {ages.get('backs')}, "
            f"bench {ages.get('replacements')} (from {ages.get('known')} known birth dates)."
        )
    if features.get("restDays") is not None:
        lines.append(f"Rest days since the previous match: {features['restDays']}.")
    if features.get("travel"):
        lines.append(f"Travel: {str(features['travel']).replace('_', ' ')}.")
    return lines


def _player(player: Mapping[str, Any]) -> str:
    position = f" ({clean(player.get('position'))})" if player.get("position") else ""
    captain = " (captain)" if player.get("captain") else ""
    return f"{player.get('number')} {clean(player.get('name'))}{position}{captain}"


def _names(names: Any) -> str:
    return ", ".join(clean(n) for n in names or []) or "none"


def _forecast(weather: Mapping[str, Any], tz: str, number: int | None) -> str:
    hour = _dt(weather.get("forecastHourUtc"))
    parts = [
        f"Kickoff-hour forecast for {clean(weather.get('stadium'))}, {clean(weather.get('city'))}"
        + (f" ({when(hour, tz)})" if hour else "")
        + f":{cite([number])}",
        f"Conditions: {clean(weather.get('condition')) or 'unknown'}.",
        f"Temperature {weather.get('temperatureC')} °C, feels like {weather.get('feelsLikeC')} °C.",
        f"Chance of rain {weather.get('rainChancePercent')}%, precipitation {weather.get('precipitationMm')} mm.",
        f"Wind {weather.get('windKmh')} km/h, gusts {weather.get('gustKmh')} km/h.",
    ]
    return "\n".join(parts)


def _preview(preview: Mapping[str, Any], numbers: list[int | None], fixture: Mapping[str, Any], tz: str) -> str:
    def refs(indexes: Any) -> str:
        return cite([numbers[i] for i in indexes or [] if isinstance(i, int) and 0 <= i < len(numbers)])

    generated = _dt(preview.get("generatedAt"))
    lines = [
        f"The Pavilion preview, revision {preview.get('revision')}"
        + (f", written {when(generated, tz)}" if generated else "")
        + ".",
        f"Summary: {clean(preview.get('summary'))}",
    ]
    factors = preview.get("keyFactors") or {}
    sentiment = preview.get("sentiment") or {}
    for side in ("home", "away"):
        team = clean(fixture.get(side))
        lines.append(f"Key factors for {team}:")
        lines += [f"- {clean(f.get('text'))}{refs(f.get('sources'))}" for f in factors.get(side) or []] or ["- none"]
        mood = sentiment.get(side) or {}
        if mood:
            lines.append(f"Mood of the {team} camp: {_mood(mood)} {clean(mood.get('note'))}{refs(mood.get('sources'))}")
    return "\n".join(lines)


def _mood(mood: Mapping[str, Any]) -> str:
    score = mood.get("score")
    return f"{score:+d} on a scale of -2 to +2." if isinstance(score, int) else "not scored."


def _research_order(research: Any) -> list[tuple[str, Mapping[str, Any]]]:
    """Research items round robin by side, so trimming from the end takes from both sides."""
    if not isinstance(research, Mapping):
        return []
    home = [("home", i) for i in (research.get("home") or {}).get("items") or [] if isinstance(i, Mapping)]
    away = [("away", i) for i in (research.get("away") or {}).get("items") or [] if isinstance(i, Mapping)]
    order: list[tuple[str, Mapping[str, Any]]] = []
    for index in range(max(len(home), len(away))):
        order += home[index : index + 1] + away[index : index + 1]
    return order


def _research(research: Mapping[str, Any], kept: list[tuple[str, Mapping[str, Any]]], sources: Sources) -> str:
    lines = ["Notes the Pavilion's researchers gathered for the preview, with their sources."]
    for side in ("home", "away"):
        result = research.get(side) or {}
        lines.append(f"{clean(result.get('team')) or side} ({side}):")
        items = [item for item_side, item in kept if item_side == side]
        for item in items:
            lines.append(f"- {clean(item.get('kind'))}: {clean(item.get('text'))}{cite([sources.number(item.get('url'))])}")
        if not items:
            lines.append("- no items kept")
        mood = result.get("mood") or {}
        if mood:
            refs = cite([sources.number(url) for url in mood.get("urls") or []])
            lines.append(f"- mood: {_mood(mood)} {clean(mood.get('note'))}{refs}")
    return "\n".join(lines)


def _events(score: Any) -> list[Mapping[str, Any]]:
    if not isinstance(score, Mapping) or score.get("status") != "ok":
        return []
    return [e for e in score.get("events") or [] if isinstance(e, Mapping)]


def _match(score: Any, fixture: Mapping[str, Any], trim: Trim) -> str:
    if not isinstance(score, Mapping) or score.get("status") != "ok" or score.get("state") in (None, "scheduled"):
        return ""
    home, away = clean(fixture.get("home")), clean(fixture.get("away"))
    state = score["state"]
    minute = f", {score['minute']} minutes played" if score.get("minute") is not None else ""
    lines = [f"State: {STATE_WORDS.get(state, clean(state))}{minute}. Scores from {clean(score.get('source'))}."]
    home_score, away_score = (score.get("home") or {}), (score.get("away") or {})
    if home_score.get("score") is not None and away_score.get("score") is not None:
        lines.append(f"Score: {home} {home_score['score']}, {away} {away_score['score']}.")
    if home_score.get("halfTime") is not None and away_score.get("halfTime") is not None:
        lines.append(f"Half time: {home} {home_score['halfTime']}, {away} {away_score['halfTime']}.")
    events = _events(score)
    dropped = 0
    if trim.timeline_events is not None:
        dropped = len(events) - trim.timeline_events
        events = events[dropped:]
    if events or dropped:
        lines.append(f"Timeline ({dropped} earlier events left out):" if dropped else "Timeline:")
        for event in events:
            team = home if event.get("side") == "home" else away if event.get("side") == "away" else ""
            running = event.get("score")
            after = f", {running[0]}-{running[1]}" if isinstance(running, list) and len(running) == 2 else ""
            player = f" ({clean(event.get('player'))})" if event.get("player") else ""
            lines.append(f"- {clean(event.get('time') or event.get('minute'))}' {EVENT_WORDS.get(event.get('kind'), clean(event.get('kind')))}, {team}{player}{after}")
    elif score.get("timeline") is False:
        lines.append("No timeline: the fallback score feed gives the score only.")
    return "\n".join(lines)


def _member(member: Mapping[str, Any], fixture: Mapping[str, Any], tz: str, trim: Trim) -> str:
    kickoff = _dt(fixture.get("kickoffUtc"))
    favourite = clean(member.get("favouriteTeam"))
    lines = [
        f"You are talking with {clean(member.get('name'))}, a member of this league.",
        f"Their favourite team: {favourite}." if favourite else "They have not chosen a favourite team.",
    ]
    pick = member.get("pick")
    lines.append(f"Their pick: {pick_label(pick, fixture)}." if pick else "Their pick: no pick yet.")
    if kickoff:
        verb = "locked" if member.get("locked") else "lock"
        lines.append(f"Picks {verb} at kickoff, {when(kickoff, tz)}.")
    pool = member.get("pool")
    if pool is None:
        lines.append(POOL_HIDDEN)
    else:
        shown = pool if trim.pool_names is None else pool[: trim.pool_names]
        lines.append("The league's picks:" if pool else "No picks are recorded for this match.")
        lines += [f"- {clean(p.get('memberName'))}: {pick_label(p, fixture)}" for p in shown]
        if len(shown) < len(pool):
            lines.append(f"- and {len(pool) - len(shown)} more")
    return "\n".join(lines)


def pick_label(pick: Mapping[str, Any], fixture: Mapping[str, Any]) -> str:
    side = pick.get("side")
    if side in ("home", "away"):
        label = f"{clean(fixture.get(side))} by {pick.get('margin')}"
    elif side == "draw":
        label = "a draw"
    else:
        label = "missed"
    return f"{label} (Superbru default)" if pick.get("isDefault") else label


# Text ----------------------------------------------------------------------------------


def clean(value: Any) -> str:
    """One line of plain text that cannot open or close a tag."""
    if value is None:
        return ""
    return " ".join(str(value).split()).replace("<", "‹").replace(">", "›")


def when(moment: datetime, tz: str) -> str:
    """'Saturday 10 October 2026, 17:30 BST (Europe/London); 16:30 UTC'."""
    try:
        zone = ZoneInfo(tz)
    except Exception:  # noqa: BLE001 - an unknown zone falls back to UTC only
        zone, tz = ZoneInfo("UTC"), "UTC"
    local = moment.astimezone(zone)
    utc = moment.astimezone(timezone.utc)
    utc_part = f"{utc:%H:%M} UTC" if utc.date() == local.date() else f"{utc:%A} {utc.day} {utc:%B %H:%M} UTC"
    return f"{local:%A} {local.day} {local:%B %Y, %H:%M} {local.tzname()} ({tz}); {utc_part}"


def _dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None
