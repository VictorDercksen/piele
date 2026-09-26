from fastapi import HTTPException, Path, Request

from app.config import Settings
from app.matchcentre.service import MatchCentreService


def settings_dependency(request: Request) -> Settings:
    return request.app.state.settings


def match_centre_for(request: Request, competition_id: str) -> MatchCentreService:
    """The competition's match centre, or 404 `unknown_competition`."""
    centre = request.app.state.match_centres.get(competition_id)
    if centre is None:
        raise HTTPException(
            status_code=404, detail={"code": "unknown_competition", "message": "Unknown competition."}
        )
    return centre


def competition_centre(request: Request, competition_id: str = Path(alias="competitionId")) -> MatchCentreService:
    """The match centre of the `{competitionId}` path segment."""
    return match_centre_for(request, competition_id)
