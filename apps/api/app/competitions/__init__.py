"""The competitions the API knows. A season names one by id (`piele.seasons.competition_id`);
shared competition data (previews, dispatches, fixture milestones, provider snapshots) is
keyed by it too. See app/competitions/base.py for what a competition provides."""

from app.competitions.base import Competition
from app.competitions.urc_2026_27 import COMPETITION as URC_2026_27

# The competition of the agent routes when a request does not name one.
DEFAULT_COMPETITION_ID = URC_2026_27.id

ALL: dict[str, Competition] = {competition.id: competition for competition in (URC_2026_27,)}


def get(competition_id: str) -> Competition:
    """The competition with this id. Raises KeyError for an unknown id."""
    return ALL[competition_id]


__all__ = ["ALL", "DEFAULT_COMPETITION_ID", "Competition", "get"]
