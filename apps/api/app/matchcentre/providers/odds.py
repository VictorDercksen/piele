"""Pre-match odds from The Odds API (https://the-odds-api.com), for information only.

Quota: the free tier allows 500 requests a month and each odds call costs one request
per region per market. One sport-wide call returns every upcoming URC event, so the
service caches that list for six hours and matches fixtures against it. The sports list
is free and cached for a day. Odds are requested only inside the week before kickoff.
"""

from datetime import datetime, timedelta
from typing import Any

import httpx

from app.matchcentre.cache import Fetched
from app.matchcentre.catalogue import Club

ODDS_WINDOW = timedelta(days=8)
MATCH_LENGTH = timedelta(hours=2)
SPORTS_TTL = timedelta(hours=24)
EVENTS_TTL = timedelta(hours=6)
MARKETS = "h2h,spreads"
COMMENCE_TOLERANCE = timedelta(hours=12)
CANDIDATE_WINDOW = timedelta(days=3)


def timing_status(kickoff: datetime, now: datetime) -> str | None:
    if now < kickoff - ODDS_WINDOW:
        return "too_early"
    if now > kickoff + MATCH_LENGTH:
        return "past"
    return None


def fetch_sports(client: httpx.Client, url: str, api_key: str) -> Fetched:
    response = client.get(f"{url}/sports/", params={"apiKey": api_key, "all": "true"})
    response.raise_for_status()
    sports = [
        {"key": s.get("key"), "title": s.get("title"), "active": s.get("active")}
        for s in response.json()
        if isinstance(s, dict) and str(s.get("group", "")).lower().startswith("rugby")
    ]
    return Fetched("ok", {"sports": sports}, SPORTS_TTL)


def find_sport_key(sports: list[dict[str, Any]], override: str | None) -> str | None:
    if override:
        return override
    for sport in sports:
        title = str(sport.get("title", "")).lower()
        key = str(sport.get("key", "")).lower()
        if "united rugby" in title or "urc" in title.split() or "united_rugby" in key:
            return sport.get("key")
    return None


def fetch_events(
    client: httpx.Client, url: str, api_key: str, sport_key: str, regions: str
) -> Fetched:
    response = client.get(
        f"{url}/sports/{sport_key}/odds/",
        params={
            "apiKey": api_key,
            "regions": regions,
            "markets": MARKETS,
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        },
    )
    response.raise_for_status()
    events = [
        {
            "id": e.get("id"),
            "commenceTime": e.get("commence_time"),
            "homeTeam": e.get("home_team"),
            "awayTeam": e.get("away_team"),
            "bookmakers": e.get("bookmakers") or [],
        }
        for e in response.json()
        if isinstance(e, dict)
    ]
    remaining = response.headers.get("x-requests-remaining")
    return Fetched("ok", {"events": events, "requestsRemaining": remaining}, EVENTS_TTL)


def select_event(
    events: list[dict[str, Any]], home: Club, away: Club, kickoff: datetime
) -> dict[str, Any] | None:
    for event in events:
        commence = _parse(event.get("commenceTime"))
        if commence is None or abs(commence - kickoff) > COMMENCE_TOLERANCE:
            continue
        labels = (str(event.get("homeTeam") or ""), str(event.get("awayTeam") or ""))
        if any(home.matches(label) for label in labels) and any(
            away.matches(label) for label in labels
        ):
            return event
    return None


def summarise(event: dict[str, Any], home: Club, away: Club) -> dict[str, Any] | None:
    """Pick the most recently updated bookmaker with a head-to-head market."""
    best: dict[str, Any] | None = None
    best_update = ""
    for bookmaker in event.get("bookmakers") or []:
        markets = {m.get("key"): m for m in bookmaker.get("markets") or [] if isinstance(m, dict)}
        h2h = markets.get("h2h")
        if not h2h:
            continue
        update = str(bookmaker.get("last_update") or "")
        if best is not None and update <= best_update:
            continue
        prices = _prices(h2h.get("outcomes") or [], home, away)
        if prices["home"] is None or prices["away"] is None:
            continue
        spread = _spread(markets.get("spreads"), home, away)
        best = {
            "bookmaker": bookmaker.get("title") or bookmaker.get("key"),
            "updatedAt": bookmaker.get("last_update"),
            "home": prices["home"],
            "draw": prices["draw"],
            "away": prices["away"],
            "handicap": spread,
            "bookmakerCount": len(event.get("bookmakers") or []),
        }
        best_update = update
    return best


def _prices(outcomes: list[dict[str, Any]], home: Club, away: Club) -> dict[str, float | None]:
    prices: dict[str, float | None] = {"home": None, "draw": None, "away": None}
    for outcome in outcomes:
        name = str(outcome.get("name") or "")
        price = outcome.get("price")
        if name.lower() == "draw":
            prices["draw"] = price
        elif home.matches(name):
            prices["home"] = price
        elif away.matches(name):
            prices["away"] = price
    return prices


def _spread(market: dict[str, Any] | None, home: Club, away: Club) -> dict[str, Any] | None:
    if not market:
        return None
    result: dict[str, Any] = {}
    for outcome in market.get("outcomes") or []:
        name = str(outcome.get("name") or "")
        side = "home" if home.matches(name) else "away" if away.matches(name) else None
        if side:
            result[side] = {"line": outcome.get("point"), "price": outcome.get("price")}
    return result if "home" in result and "away" in result else None


def _parse(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def nearby_events(events: list[dict[str, Any]], kickoff: datetime) -> list[dict[str, Any]]:
    """Team labels of events around kickoff, reported when no event matched a fixture."""
    found = []
    for event in events:
        commence = _parse(event.get("commenceTime"))
        if commence is None or abs(commence - kickoff) > CANDIDATE_WINDOW:
            continue
        found.append(
            {
                "commenceTime": event.get("commenceTime"),
                "homeTeam": event.get("homeTeam"),
                "awayTeam": event.get("awayTeam"),
            }
        )
    return found[:20]
