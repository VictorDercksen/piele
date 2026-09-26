"""URC 2026/27 provider wiring: teamsheets and live scores from the URC GraphQL feed, with
ESPN's public URC scoreboard as the scores fallback. The provider code stays in
app/matchcentre/providers; this module only binds it to the configured URLs."""

from datetime import datetime

import httpx

from app.config import Settings
from app.matchcentre.cache import Fetched
from app.matchcentre.providers import espn, scores, teamsheets
from app.matchcentre.schedule import Fixture

SOURCE = "URC match centre"


class UrcScores:
    source = SOURCE

    def fetch_scores(self, client: httpx.Client, settings: Settings, fixtures: list[Fixture], now: datetime) -> Fetched:
        return scores.fetch_scores(client, settings.urc_graphql_url, fixtures, now)


class UrcTeamsheets:
    source = SOURCE

    def fetch_teamsheets(self, client: httpx.Client, settings: Settings, fixture: Fixture) -> Fetched:
        return teamsheets.fetch_teamsheets(client, settings.urc_graphql_url, fixture.id)


class EspnScores:
    source = espn.SOURCE

    def fetch_scores(self, client: httpx.Client, settings: Settings, fixtures: list[Fixture], now: datetime) -> Fetched:
        return espn.fetch_scores(client, settings.espn_scoreboard_url, fixtures, now)
