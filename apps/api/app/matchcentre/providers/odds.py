"""Pre-match prices from the API-Sports Rugby API (https://api-sports.io), for information only.

Quota: the free plan allows 100 requests a day. Three cached calls cover a match day:
the league lookup (24 h), the day's games (6 h) and the day's odds (6 h), so a full
round costs well under the limit while the snapshot cache holds. Prices are requested
only inside the week before kickoff.

Direct API-Sports accounts authenticate with the `x-apisports-key` header against
https://v1.rugby.api-sports.io. RapidAPI accounts use a different host and header and
are not supported here.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.matchcentre.cache import Fetched
from app.matchcentre.catalogue import Club

ODDS_WINDOW = timedelta(days=8)
MATCH_LENGTH = timedelta(hours=2)
LEAGUE_TTL = timedelta(hours=24)
DAY_TTL = timedelta(hours=6)
FAILED_TTL = timedelta(minutes=10)
COMMENCE_TOLERANCE = timedelta(hours=12)
LEAGUE_SEARCH = "United Rugby"
WINNER_BET = re.compile(r"winner|home/away|1x2|full ?time result|match result", re.I)
HANDICAP_BET = re.compile(r"handicap|spread", re.I)
HANDICAP_VALUE = re.compile(r"^(home|away)\s*([+-]?\d+(?:\.\d+)?)$", re.I)


class ProviderError(RuntimeError):
    """The provider answered with an application-level error (quota, key, parameters)."""


def timing_status(kickoff: datetime, now: datetime) -> str | None:
    if now < kickoff - ODDS_WINDOW:
        return "too_early"
    if now > kickoff + MATCH_LENGTH:
        return "past"
    return None


def _get(client: httpx.Client, url: str, api_key: str, path: str, **params: Any) -> Any:
    response = client.get(f"{url}/{path}", params=params, headers={"x-apisports-key": api_key})
    response.raise_for_status()
    body = response.json()
    errors = body.get("errors")
    if errors and (not isinstance(errors, (list, dict)) or len(errors)):
        raise ProviderError(_error_text(errors))
    return body.get("response") or []


def _error_text(errors: Any) -> str:
    if isinstance(errors, dict):
        return "; ".join(f"{k}: {v}" for k, v in list(errors.items())[:3])[:300]
    if isinstance(errors, list):
        return "; ".join(str(e) for e in errors[:3])[:300]
    return str(errors)[:300]


def fetch_league(client: httpx.Client, url: str, api_key: str) -> Fetched:
    """The URC league ID and its current season, or the leagues the search returned."""
    leagues = _get(client, url, api_key, "leagues", search=LEAGUE_SEARCH)
    found = [
        {
            "id": league.get("id"),
            "name": league.get("name"),
            "seasons": [s.get("season") for s in league.get("seasons") or []],
            "current": next(
                (s.get("season") for s in league.get("seasons") or [] if s.get("current")), None
            ),
        }
        for league in leagues
        if isinstance(league, dict)
    ]
    match = next((l for l in found if "united rugby" in str(l["name"]).lower()), None)
    if match is None or match["id"] is None:
        return Fetched(
            "not_covered", {"reason": "league not found", "leagues": found[:10]}, FAILED_TTL
        )
    season = match["current"] or (max(match["seasons"]) if match["seasons"] else None)
    payload = {"leagueId": match["id"], "season": season, "name": match["name"]}
    return Fetched("ok", payload, LEAGUE_TTL)


def fetch_day(
    client: httpx.Client, url: str, api_key: str, league_id: int, season: Any, day: str
) -> Fetched:
    """Games and odds for one UTC date of the league."""
    games = _get(
        client, url, api_key, "games", league=league_id, season=season, date=day, timezone="UTC"
    )
    odds = _get(client, url, api_key, "odds", league=league_id, season=season, date=day)
    game_rows = [
        {
            "id": g.get("id"),
            "date": g.get("date"),
            "timestamp": g.get("timestamp"),
            "home": ((g.get("teams") or {}).get("home") or {}).get("name"),
            "away": ((g.get("teams") or {}).get("away") or {}).get("name"),
        }
        for g in games
        if isinstance(g, dict)
    ]
    odds_rows = [
        {"gameId": (o.get("game") or {}).get("id"), "bookmakers": o.get("bookmakers") or []}
        for o in odds
        if isinstance(o, dict)
    ]
    return Fetched("ok", {"games": game_rows, "odds": odds_rows}, DAY_TTL)


def select_game(
    games: list[dict[str, Any]], home: Club, away: Club, kickoff: datetime
) -> dict[str, Any] | None:
    for game in games:
        moment = _moment(game)
        if moment is not None and abs(moment - kickoff) > COMMENCE_TOLERANCE:
            continue
        labels = (str(game.get("home") or ""), str(game.get("away") or ""))
        if any(home.matches(l) for l in labels) and any(away.matches(l) for l in labels):
            return game
    return None


def summarise(bookmakers: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The first bookmaker with a parseable winner market, plus its handicap if any."""
    for bookmaker in bookmakers:
        bets = [b for b in bookmaker.get("bets") or [] if isinstance(b, dict)]
        winner = next((b for b in bets if WINNER_BET.search(str(b.get("name") or ""))), None)
        if winner is None:
            continue
        prices = _winner_prices(winner.get("values") or [])
        if prices["home"] is None or prices["away"] is None:
            continue
        handicap = next((b for b in bets if HANDICAP_BET.search(str(b.get("name") or ""))), None)
        return {
            "bookmaker": bookmaker.get("name"),
            "updatedAt": bookmaker.get("update") or None,
            "home": prices["home"],
            "draw": prices["draw"],
            "away": prices["away"],
            "handicap": _handicap(handicap.get("values") or []) if handicap else None,
            "bookmakerCount": len(bookmakers),
        }
    return None


def bet_names(bookmakers: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for bookmaker in bookmakers[:5]:
        for bet in bookmaker.get("bets") or []:
            name = str(bet.get("name") or "")
            if name and name not in names:
                names.append(name)
    return names[:30]


def _winner_prices(values: list[dict[str, Any]]) -> dict[str, float | None]:
    prices: dict[str, float | None] = {"home": None, "draw": None, "away": None}
    for value in values:
        label = str(value.get("value") or "").strip().lower()
        if label in prices:
            prices[label] = _float(value.get("odd"))
    return prices


def _handicap(values: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The main line: the home/away pair whose prices are closest to each other."""
    sides: dict[str, dict[float, float]] = {"home": {}, "away": {}}
    for value in values:
        match = HANDICAP_VALUE.match(str(value.get("value") or "").strip())
        odd = _float(value.get("odd"))
        if match and odd is not None:
            sides[match.group(1).lower()][float(match.group(2))] = odd
    best: dict[str, Any] | None = None
    best_gap: float | None = None
    for line, home_odd in sides["home"].items():
        away_odd = sides["away"].get(-line)
        if away_odd is None:
            continue
        gap = abs(home_odd - away_odd)
        if best_gap is None or gap < best_gap:
            best_gap = gap
            best = {
                "home": {"line": line, "price": home_odd},
                "away": {"line": -line, "price": away_odd},
            }
    return best


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _moment(game: dict[str, Any]) -> datetime | None:
    stamp = game.get("timestamp")
    if isinstance(stamp, (int, float)):
        return datetime.fromtimestamp(stamp, tz=timezone.utc)
    raw = game.get("date")
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
