"""The Machine's Superbru pick from a result-band distribution (plan Phase D).

1. Winner: the side, or the draw, with the highest total probability. Ties go to home,
   then away, then draw.
2. Margin: the whole number of points for that side that maximises the chance of the
   actual margin landing within the scoring window (5 points). Each band's probability is
   spread evenly over its margins, the open 31+ band over 31 to OPEN_BAND_TOP. Ties go to
   the smaller margin.
"""

from typing import Mapping

from app.agent.jev import BANDS, OPEN_BAND_TOP, normalise, signed_margins
from app.agent.scoring import SUPERBRU, Outcome, Pick, ScoringRules


def outcome_probabilities(distribution: Mapping[str, float]) -> dict[Outcome, float]:
    totals: dict[Outcome, float] = {"home": 0.0, "draw": 0.0, "away": 0.0}
    for band in BANDS:
        totals[band.side] += distribution[band.key]
    return totals


def margin_mass(distribution: Mapping[str, float]) -> dict[int, float]:
    """Probability per signed margin (home minus away points)."""
    mass: dict[int, float] = {}
    for band in BANDS:
        margins = signed_margins(band)
        for margin in margins:
            mass[margin] = mass.get(margin, 0.0) + distribution[band.key] / len(margins)
    return mass


def pick(distribution: Mapping[str, float], rules: ScoringRules = SUPERBRU) -> Pick:
    dist = normalise(distribution)
    totals = outcome_probabilities(dist)
    winner = max(("home", "away", "draw"), key=lambda side: totals[side])  # first wins ties
    if winner == "draw":
        return Pick("draw", 0)
    sign = 1 if winner == "home" else -1
    mass = margin_mass(dist)

    def chance(margin: int) -> float:
        target = sign * margin
        return sum(p for m, p in mass.items() if abs(m - target) <= rules.margin_window)

    best = max(range(1, OPEN_BAND_TOP + 1), key=lambda m: (round(chance(m), 12), -m))
    return Pick(winner, best)
