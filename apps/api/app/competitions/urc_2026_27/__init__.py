"""United Rugby Championship 2026/27: 18 regular rounds, then quarter-finals, semi-finals
and the final (rounds 19 to 21)."""

from pathlib import Path

from app.competitions.base import Competition
from app.competitions.urc_2026_27.catalogue import CLUBS, STADIUMS
from app.competitions.urc_2026_27.providers import EspnScores, UrcScores, UrcTeamsheets

COMPETITION = Competition(
    id="urc-2026-27",
    name="United Rugby Championship 2026/27",
    short_name="URC",
    timezone="Africa/Johannesburg",
    regular_rounds=18,
    last_round=21,
    playoff_labels={19: "QF", 20: "SF", 21: "F"},
    schedule_file=Path(__file__).resolve().parent / "schedule.json",
    clubs=CLUBS,
    stadiums=STADIUMS,
    scores=UrcScores(),
    teamsheets=UrcTeamsheets(),
    fallback_scores=EspnScores(),
)
