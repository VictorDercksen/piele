"""The anonymised arm: the same state with clubs, players and venues under stable pseudonyms.

Pseudonyms are fixed per season (seeded by the season id), so a club or player keeps one
name across the season and form lines still refer to the right opponent. Countries and
travel are kept; the venue's city is dropped because it names the club. The difference
between the named and anonymised arms estimates how much Jev recalls rather than predicts.
"""

import copy
import json
import random
import re
import string
from typing import Any, Iterable

from app.matchcentre.catalogue import CLUBS, STADIUMS


class Pseudonyms:
    def __init__(self, season: str, club_ids: Iterable[str], venues: Iterable[str], players: Iterable[str]) -> None:
        rng = random.Random(f"piele-backtest-{season}")
        clubs = sorted(set(club_ids))
        letters = list(string.ascii_uppercase[: len(clubs)])
        rng.shuffle(letters)
        self.clubs = {club: f"Team {letter}" for club, letter in zip(clubs, letters)}
        venue_list = sorted(set(venues))
        numbers = list(range(1, len(venue_list) + 1))
        rng.shuffle(numbers)
        self.venues = {venue: f"Stadium {n}" for venue, n in zip(venue_list, numbers)}
        player_list = sorted(set(players))
        ids = list(range(1, len(player_list) + 1))
        rng.shuffle(ids)
        self.players = {name: f"Player {n:04d}" for name, n in zip(player_list, ids)}
        self._real = real_names(player_list, venue_list)

    def player(self, name: str) -> str:
        return self.players.get(name, "Player unknown")

    def state(self, state: dict[str, Any]) -> dict[str, Any]:
        """A copy of a build_state result with every name replaced."""
        out = copy.deepcopy(state)
        out["venue"] = self.venues.get(out.get("venue") or "", "Stadium unknown")
        out["city"] = None
        for side in ("home", "away"):
            team = out[side]
            alias = self.clubs[team["club"]["id"]]
            team["club"] = {"id": alias, "name": alias}
            if team.get("teamsheet"):
                for group in ("starters", "replacements"):
                    for player in team["teamsheet"][group]:
                        player["name"] = self.player(player["name"])
            features = team["features"]
            changes = features.get("changesFromPrevious")
            if changes:
                changes["startersIn"] = [self.player(n) for n in changes["startersIn"]]
                changes["startersOut"] = [self.player(n) for n in changes["startersOut"]]
                for change in changes["shirtChanges"]:
                    change["name"] = self.player(change["name"])
            for missing in features.get("regularStartersMissing") or []:
                missing["name"] = self.player(missing["name"])
            for fixture in team.get("recentFixtures") or []:
                fixture["opponentId"] = self.clubs.get(fixture["opponentId"], "Team unknown")
                fixture["venue"] = self.venues.get(fixture.get("venue") or "", "Stadium unknown")
        form = out.get("form") or {}
        if form.get("status") == "ok":
            for side in ("home", "away"):
                for line in form[side]["recent"]:
                    line["opponentId"] = self.clubs.get(line["opponentId"], "Team unknown")
                    line["opponentName"] = line["opponentId"]
        return out

    def leaks(self, request: dict[str, Any]) -> list[str]:
        """Real club, player, venue or city names found anywhere in a request."""
        text = json.dumps(request, ensure_ascii=False)
        return [name for name, pattern in self._real if pattern.search(text)]


def real_names(players: Iterable[str], venues: Iterable[str]) -> list[tuple[str, re.Pattern[str]]]:
    names = {c.name for c in CLUBS} | {c.short_name for c in CLUBS} | {s.name for s in STADIUMS}
    names |= {s.city for s in STADIUMS} | set(players) | set(venues)
    return [(n, re.compile(rf"(?<!\w){re.escape(n)}(?!\w)")) for n in sorted(names) if len(n) >= 4]
