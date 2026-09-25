"""Simple baselines Jev has to beat, each giving the same 13-band distribution as Jev.

- home_by_7: the home side by 7.
- table_position: the side higher in the table before the fixture (from the state's form
  section) by 7; the home side when neither has played or they are level.
- elo: an Elo rating with home advantage and a margin-of-victory multiplier; the expected
  margin is proportional to the rating difference. Ratings carry across seasons, pulled a
  quarter of the way back to the mean at each new season.

Each margin is a normal distribution around the baseline's expected margin, cut into the
bands. Every parameter (spreads, Elo K, home advantage and scale) is fitted on 2021/22
alone; later seasons only update the Elo ratings.
"""

import math
from dataclasses import dataclass, field
from typing import Any, Protocol, Sequence

from app.agent.jev import BANDS, band_for

from archive import Match
from score import rps

MARGIN = 7
BASE_RATING = 1500.0
SEASON_CARRY = 0.75
ELO_K = (10, 15, 20, 25, 30, 40, 50)
ELO_HOME = (0, 25, 50, 75, 100, 125)
FLOOR = 1e-6


def normal_bands(mean: float, sd: float) -> dict[str, float]:
    """A normal margin distribution (home minus away points) over the result bands, with
    whole-point margins: the draw is the interval from -0.5 to 0.5."""

    def cdf(x: float) -> float:
        if math.isinf(x):
            return 1.0 if x > 0 else 0.0
        return 0.5 * (1 + math.erf((x - mean) / (sd * math.sqrt(2))))

    out = {}
    for band in BANDS:
        top = math.inf if band.high is None else band.high + 0.5
        if band.side == "draw":
            low, high = -0.5, 0.5
        elif band.side == "home":
            low, high = band.low - 0.5, top
        else:
            low, high = -top, -(band.low - 0.5)
        out[band.key] = max(cdf(high) - cdf(low), FLOOR)
    total = sum(out.values())
    return {k: v / total for k, v in out.items()}


def margin(match: Match) -> int:
    return match.home_score - match.away_score


class Baseline(Protocol):
    name: str

    def predict(self, match: Match, state: dict[str, Any]) -> dict[str, float]: ...

    def update(self, match: Match) -> None: ...

    def params(self) -> dict[str, Any]: ...


@dataclass
class HomeBy:
    sd: float
    points: int = MARGIN
    name: str = "home_by_7"

    def predict(self, match: Match, state: dict[str, Any]) -> dict[str, float]:
        return normal_bands(self.points, self.sd)

    def update(self, match: Match) -> None:
        pass

    def params(self) -> dict[str, Any]:
        return {"points": self.points, "sd": round(self.sd, 3)}


def table_sign(state: dict[str, Any]) -> int:
    """+1 when the home side is higher in the table (or it is level or unknown), else -1."""
    form = state.get("form") or {}
    if form.get("status") != "ok":
        return 1
    home, away = (((form[side].get("season") or {}).get("position")) for side in ("home", "away"))
    if home is None or away is None or home <= away:
        return 1
    return -1


@dataclass
class TablePosition:
    sd: float
    points: int = MARGIN
    name: str = "table_position"

    def predict(self, match: Match, state: dict[str, Any]) -> dict[str, float]:
        return normal_bands(table_sign(state) * self.points, self.sd)

    def update(self, match: Match) -> None:
        pass

    def params(self) -> dict[str, Any]:
        return {"points": self.points, "sd": round(self.sd, 3)}


@dataclass
class Elo:
    k: float
    home_advantage: float
    scale: float = 0.0
    sd: float = 15.0
    carry: float = SEASON_CARRY
    name: str = "elo"
    ratings: dict[str, float] = field(default_factory=dict)
    season: str | None = None

    def _new_season(self, season: str) -> None:
        if self.season is not None and season != self.season:
            self.ratings = {t: BASE_RATING + self.carry * (r - BASE_RATING) for t, r in self.ratings.items()}
        self.season = season

    def difference(self, match: Match) -> float:
        """Home rating plus home advantage minus away rating."""
        self._new_season(match.season)
        f = match.fixture
        home = self.ratings.get(f.home_id or "", BASE_RATING)
        away = self.ratings.get(f.away_id or "", BASE_RATING)
        return home + self.home_advantage - away

    def predict(self, match: Match, state: dict[str, Any]) -> dict[str, float]:
        return normal_bands(self.scale * self.difference(match), self.sd)

    def update(self, match: Match) -> None:
        diff = self.difference(match)
        expected = 1 / (1 + 10 ** (-diff / 400))
        m = margin(match)
        actual = 1.0 if m > 0 else 0.5 if m == 0 else 0.0
        change = self.k * math.log(abs(m) + 1) * (actual - expected)
        f = match.fixture
        self.ratings[f.home_id or ""] = self.ratings.get(f.home_id or "", BASE_RATING) + change
        self.ratings[f.away_id or ""] = self.ratings.get(f.away_id or "", BASE_RATING) - change

    def params(self) -> dict[str, Any]:
        return {"k": self.k, "homeAdvantage": self.home_advantage, "scale": round(self.scale, 5),
                "sd": round(self.sd, 3), "seasonCarry": self.carry}


def _spread(errors: Sequence[float]) -> float:
    return math.sqrt(sum(e * e for e in errors) / len(errors))


def fit_elo(tuning: Sequence[Match], k: float, home_advantage: float) -> tuple[Elo, float]:
    """Elo with the given K and home advantage run over the tuning season, its margin scale
    and spread fitted by least squares, and its mean ranked probability score there."""
    elo = Elo(k, home_advantage)
    pairs = []
    for match in tuning:
        pairs.append((elo.difference(match), margin(match)))
        elo.update(match)
    scale = sum(x * y for x, y in pairs) / (sum(x * x for x, _ in pairs) or 1.0)
    sd = _spread([y - scale * x for x, y in pairs])
    score = sum(rps(normal_bands(scale * x, sd), band_for(y, 0)) for x, y in pairs)
    return Elo(k, home_advantage, scale, sd), score / len(pairs)


def tune(tuning: Sequence[tuple[Match, dict[str, Any]]]) -> list[Baseline]:
    """The three baselines with parameters fitted on the tuning season, fresh ratings."""
    matches = [m for m, _ in tuning]
    home_sd = _spread([margin(m) - MARGIN for m in matches])
    table_sd = _spread([margin(m) - table_sign(state) * MARGIN for m, state in tuning])
    best = min((fit_elo(matches, k, h) for k in ELO_K for h in ELO_HOME), key=lambda pair: pair[1])[0]
    return [HomeBy(home_sd), TablePosition(table_sd), best]
