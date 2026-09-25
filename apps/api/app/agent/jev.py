"""The Jev request for a fixture: a compact view of the fixture state and the fixed question.

Jev (TypeSafe AI, https://docs.typesafe.ai/api) answers typed questions about a `state`
with a probability per option: `POST /v1/systemone` with `model`, `state` and a map of
questions, authorised by a bearer API key. The Machine asks one Choice question,
`result_band`: the winning side and margin in 13 bands. pick.py turns the answer into a
Superbru pick.

The API builds the request so that production and the backtest (backtest/README.md) send
identical payloads. The state is filtered to what the question needs and phrased in
words where the numbers would be comparisons (Jev's documented weak spots are
arithmetic, dates and large irrelevant state): no dates, hashes or feed metadata.
"""

import time
from dataclasses import dataclass
from typing import Any, Literal, Mapping

import httpx

from app.agent.state import digest

URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
QUESTION_ID = "result_band"
COMPETITION = "United Rugby Championship"
PLAYOFF_ROUNDS = {19: "quarter-final", 20: "semi-final", 21: "final"}
# The open 31+ band is treated as 31 to OPEN_BAND_TOP points when a margin is picked.
OPEN_BAND_TOP = 45
# Jev's probabilities sum to 1; rounded responses may be off by a little.
SUM_TOLERANCE = 0.02
RETRY_STATUSES = {429, 500, 502, 503, 504, 529}


@dataclass(frozen=True)
class Band:
    key: str
    side: Literal["home", "draw", "away"]
    low: int
    high: int | None  # None: open-ended

    @property
    def description(self) -> str:
        if self.side == "draw":
            return "The match ends in a draw"
        points = f"{self.low} points or more" if self.high is None else f"{self.low} to {self.high} points"
        return f"`{self.side}` wins by {points}"


MARGINS = ((1, 5), (6, 10), (11, 15), (16, 20), (21, 30), (31, None))


def _key(side: str, low: int, high: int | None) -> str:
    return f"{side}_{low}_plus" if high is None else f"{side}_{low}_{high}"


# Ordered from the largest away win to the largest home win, for ranked probability scores.
BANDS: tuple[Band, ...] = (
    *(Band(_key("away", low, high), "away", low, high) for low, high in reversed(MARGINS)),
    Band("draw", "draw", 0, 0),
    *(Band(_key("home", low, high), "home", low, high) for low, high in MARGINS),
)
BAND_KEYS = tuple(band.key for band in BANDS)

QUESTIONS: dict[str, Any] = {
    QUESTION_ID: {
        "type": "choice",
        "instructions": {
            "question": "Which side will win this rugby union match, and by how many points?",
            "sides": "`home` is the home side and `away` is the away side. A draw is a level final score.",
        },
        "criteria": {band.key: band.description for band in BANDS},
    }
}

TRAVEL = {
    "home": "playing at home",
    "domestic": "away, within its own country",
    "cross_border": "away, in another European country",
    "intercontinental": "away, on another continent",
}


def band_for(home_score: int, away_score: int) -> str:
    margin = home_score - away_score
    for band in BANDS:
        if band.side == "draw" and margin == 0:
            return band.key
        size = abs(margin)
        if band.side == ("home" if margin > 0 else "away") and band.low <= size and (band.high is None or size <= band.high):
            return band.key
    raise AssertionError("every margin has a band")


def signed_margins(band: Band) -> list[int]:
    """The home-minus-away margins a band covers, the open band capped at OPEN_BAND_TOP."""
    if band.side == "draw":
        return [0]
    margins = range(band.low, (band.high or OPEN_BAND_TOP) + 1)
    return [m if band.side == "home" else -m for m in margins]


def normalise(distribution: Mapping[str, float]) -> dict[str, float]:
    """The distribution over exactly the 13 bands, rescaled to sum to 1."""
    if set(distribution) != set(BAND_KEYS):
        raise ValueError(f"expected the bands {BAND_KEYS}, got {sorted(distribution)}")
    values = {key: float(distribution[key]) for key in BAND_KEYS}
    if any(v < 0 or v > 1 for v in values.values()):
        raise ValueError("probabilities must be between 0 and 1")
    total = sum(values.values())
    if abs(total - 1) > SUM_TOLERANCE:
        raise ValueError(f"probabilities sum to {total:.4f}")
    return {key: value / total for key, value in values.items()}


# Request ------------------------------------------------------------------------------


def build_request(state: Mapping[str, Any], model: str = MODEL) -> dict[str, Any]:
    return {"model": model, "state": jev_state(state), "questions": QUESTIONS}


def request_hash(request: Mapping[str, Any]) -> str:
    return digest(request)


def question_hash() -> str:
    return digest(QUESTIONS)


def jev_state(state: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "match": {
            "competition": COMPETITION,
            "stage": stage(state["round"]),
            "venue": state.get("venue"),
            "city": state.get("city"),
            "country": state.get("country"),
            "kickoffForecast": weather_view(state.get("weather") or {}),
        },
        "home": side_view(state, "home"),
        "away": side_view(state, "away"),
    }


def stage(round_number: int) -> str:
    return PLAYOFF_ROUNDS.get(round_number, f"regular season, round {round_number} of 18")


def weather_view(section: Mapping[str, Any]) -> dict[str, Any] | str:
    if section.get("status") != "ok":
        return "not available"
    view = {
        "conditions": section.get("condition"),
        "temperatureC": _rounded(section.get("temperatureC")),
        "windKmh": _rounded(section.get("windKmh")),
        "gustsKmh": _rounded(section.get("gustKmh")),
        "rainMm": section.get("precipitationMm"),
        "rainChancePercent": section.get("rainChancePercent"),
    }
    return {k: v for k, v in view.items() if v is not None}


def side_view(state: Mapping[str, Any], side: str) -> dict[str, Any]:
    team = state[side]
    features = team["features"]
    rest = features.get("restDays")
    return {
        "club": team["club"].get("name") or team["club"]["id"],
        "country": team.get("clubCountry"),
        "travel": TRAVEL.get(features.get("travel") or "", "not known"),
        "daysSinceLastMatch": rest if rest is not None else "no earlier match this season",
        "form": form_view(state.get("form") or {}, side),
        "lineup": lineup_view(team.get("teamsheet")),
        "selection": selection_view(features),
    }


def form_view(section: Mapping[str, Any], side: str) -> dict[str, Any] | str:
    if section.get("status") != "ok":
        return "not available"
    form = section[side]
    season = form.get("season")
    if not season:
        return "no matches played yet this season"
    recent = [
        f"{r['result']} {r['for']}-{r['against']} {'at home against' if r['atHome'] else 'away against'} "
        f"{r.get('opponentName') or r['opponentId']}"
        for r in form["recent"]
    ]
    return {
        "recentResults": recent,
        "season": (
            f"played {season['played']}, won {season['won']}, drawn {season['drawn']}, lost {season['lost']}, "
            f"points for {season['pointsFor']}, points against {season['pointsAgainst']}"
        ),
        "tablePosition": f"{_ordinal(season['position'])} of {form['tableSize']}",
    }


def lineup_view(sheet: Mapping[str, Any] | None) -> dict[str, Any] | str:
    if not sheet:
        return "not published"

    def line(player: Mapping[str, Any]) -> str:
        position = player.get("position") or ""
        named = position and not position.lower().startswith("sub")
        return f"{player['number']} {player['name']}" + (f", {position}" if named else "")

    return {
        "startingXV": [line(p) for p in sheet["starters"]],
        "replacements": [line(p) for p in sheet["replacements"]],
    }


def selection_view(features: Mapping[str, Any]) -> dict[str, Any]:
    view: dict[str, Any] = {}
    changes = features.get("changesFromPrevious")
    if changes is None:
        view["changesFromPreviousMatch"] = "no earlier teamsheet to compare"
    else:
        view["changesFromPreviousMatch"] = {
            "newStarters": changes["startersIn"],
            "droppedStarters": changes["startersOut"],
            "shirtChanges": [f"{c['name']} from {c['from']} to {c['to']}" for c in changes["shirtChanges"]],
        }
    missing = features.get("regularStartersMissing")
    if missing is not None:
        view["regularStartersNotStarting"] = [
            f"{m['name']} ({'on the bench' if m['onBench'] else 'not in the matchday squad'})" for m in missing
        ]
    ages = features.get("ages") or {}
    if ages.get("starters") is not None:
        view["averageAgeOfStarters"] = ages["starters"]
    bench = features.get("bench") or {}
    if bench and not bench.get("unknown"):
        view["bench"] = f"{bench['forwards']} forwards, {bench['backs']} backs"
    return view


def _rounded(value: Any) -> Any:
    return round(value) if isinstance(value, (int, float)) else value


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


# Call ---------------------------------------------------------------------------------


def ask(client: httpx.Client, request: Mapping[str, Any], api_key: str, url: str = URL, attempts: int = 5) -> dict[str, Any]:
    """Jev's response, retrying rate limits, overload and transport errors with backoff."""
    for attempt in range(attempts):
        try:
            response = client.post(url, json=request, headers={"Authorization": f"Bearer {api_key}"})
        except httpx.TransportError:
            if attempt == attempts - 1:
                raise
            time.sleep(2**attempt)
            continue
        if response.status_code in RETRY_STATUSES and attempt < attempts - 1:
            time.sleep(_retry_after(response) or 2**attempt)
            continue
        response.raise_for_status()
        return response.json()
    raise AssertionError("unreachable")


def distribution(response: Mapping[str, Any]) -> dict[str, float]:
    """The validated result-band distribution from a Jev response."""
    answer = (response.get("answers") or {}).get(QUESTION_ID) or {}
    if answer.get("type") != "choice":
        raise ValueError("the response has no result_band choice answer")
    return normalise(answer.get("probabilities") or {})


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return min(float(response.headers.get("retry-after", "")), 60.0)
    except ValueError:
        return None
