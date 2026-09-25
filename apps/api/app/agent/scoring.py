"""Superbru-style points for a pick against a final score, under a versioned rule set.

The values are Superbru's published Super Rugby Pacific scoring; the URC page is not yet
confirmed (plan decision O4), so SUPERBRU records that in its version. Bonus points depend
on the whole pool and grand slam points vary by round, so neither is added to the points:
grand slams are reported as a count.
"""

from dataclasses import dataclass
from typing import Literal

Outcome = Literal["home", "draw", "away"]


@dataclass(frozen=True)
class ScoringRules:
    version: str
    win_points: float
    margin_points: float
    # The margin point needs the signed margin within this many points of the actual one.
    margin_window: int
    grand_slam_min_matches: int


SUPERBRU = ScoringRules(
    version="superbru-super-rugby-2026-09-unconfirmed-for-urc",
    win_points=1.0,
    margin_points=0.5,
    margin_window=5,
    grand_slam_min_matches=4,
)


@dataclass(frozen=True)
class Pick:
    winner: Outcome
    margin: int  # 0 for a draw

    @property
    def signed_margin(self) -> int:
        """Home points minus away points implied by the pick."""
        return {"home": self.margin, "away": -self.margin, "draw": 0}[self.winner]


def outcome(home_score: int, away_score: int) -> Outcome:
    return "home" if home_score > away_score else "away" if away_score > home_score else "draw"


@dataclass(frozen=True)
class FixturePoints:
    correct_outcome: bool
    win: float
    margin: float

    @property
    def total(self) -> float:
        return self.win + self.margin


def fixture_points(pick: Pick, home_score: int, away_score: int, rules: ScoringRules = SUPERBRU) -> FixturePoints:
    """The win point for the right outcome (a correctly picked draw counts), and the margin
    point when the picked margin is within the window of the actual one, even if the outcome
    is wrong."""
    correct = pick.winner == outcome(home_score, away_score)
    close = abs(pick.signed_margin - (home_score - away_score)) <= rules.margin_window
    return FixturePoints(correct, rules.win_points if correct else 0.0, rules.margin_points if close else 0.0)


def grand_slam(correct_outcomes: list[bool], rules: ScoringRules = SUPERBRU) -> bool:
    """Every outcome in the round correct, in a round of at least the minimum size."""
    return len(correct_outcomes) >= rules.grand_slam_min_matches and all(correct_outcomes)
