"""Static competition catalogues: URC clubs and the stadiums in the published schedule.

The club list mirrors apps/web/src/app/core/competition/teams.ts. Odds aliases are the
words bookmakers use for the same club, without sponsor prefixes. Stadium coordinates
are approximate pitch locations used only for weather forecasts.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Club:
    id: str
    source_id: int
    name: str
    short_name: str
    odds_aliases: tuple[str, ...] = field(default_factory=tuple)

    def matches(self, label: str) -> bool:
        """True when a bookmaker's team label refers to this club."""
        text = _normalise(label)
        return any(alias in text for alias in (self.short_name.lower(), *self.odds_aliases))


CLUBS: tuple[Club, ...] = (
    Club("benetton-rugby", 2019, "Benetton Rugby", "Benetton", ("treviso",)),
    Club("vodacom-bulls", 5586, "Vodacom Bulls", "Bulls"),
    Club("cardiff-rugby", 4471, "Cardiff Rugby", "Cardiff", ("blues",)),
    Club("connacht-rugby", 5483, "Connacht Rugby", "Connacht"),
    Club("dragons-rfc", 3533, "Dragons RFC", "Dragons"),
    Club("edinburgh-rugby", 1641, "Edinburgh Rugby", "Edinburgh"),
    Club("glasgow-warriors", 3098, "Glasgow Warriors", "Glasgow"),
    Club("leinster-rugby", 5356, "Leinster Rugby", "Leinster"),
    Club("10bet-lions", 5092, "Lions", "Lions", ("golden lions",)),
    Club("munster-rugby", 4377, "Munster Rugby", "Munster"),
    Club("ospreys", 5057, "Ospreys", "Ospreys"),
    Club("scarlets", 3514, "Scarlets", "Scarlets", ("llanelli",)),
    Club("hollywoodbets-sharks", 1527, "Hollywoodbets Sharks", "Sharks"),
    Club("dhl-stormers", 3994, "DHL Stormers", "Stormers", ("western province",)),
    Club("ulster-rugby", 2129, "Ulster Rugby", "Ulster"),
    Club("zebre-parma", 4474, "Zebre Parma", "Zebre"),
)

_BY_ID = {club.id: club for club in CLUBS}


def club(club_id: str | None) -> Club | None:
    return _BY_ID.get(club_id or "")


def _normalise(label: str) -> str:
    return " ".join(label.lower().replace("-", " ").split())


@dataclass(frozen=True)
class Stadium:
    name: str
    city: str
    latitude: float
    longitude: float


STADIUMS: tuple[Stadium, ...] = (
    Stadium("10bet Ellis Park", "Johannesburg", -26.1978, 28.0606),
    Stadium("Affidea Stadium", "Belfast", 54.5806, -5.9139),
    Stadium("Aviva Stadium", "Dublin", 53.3352, -6.2285),
    Stadium("Cardiff Arms Park", "Cardiff", 51.4794, -3.1839),
    Stadium("DHL Stadium", "Cape Town", -33.9036, 18.4113),
    Stadium("Dexcom Stadium", "Galway", 53.2769, -9.0355),
    Stadium("Hampden Park", "Glasgow", 55.8256, -4.2520),
    Stadium("Hive Stadium", "Edinburgh", 55.9422, -3.2408),
    Stadium("Hollywoodbets Kings Park", "Durban", -29.8286, 31.0303),
    Stadium("Laya Arena", "Dublin", 53.3268, -6.2287),
    Stadium("Loftus Versfeld", "Pretoria", -25.7533, 28.2225),
    Stadium("Parc y Scarlets", "Llanelli", 51.6806, -4.1272),
    Stadium("Rodney Parade", "Newport", 51.5883, -2.9878),
    Stadium("Scotstoun Stadium", "Glasgow", 55.8836, -4.3395),
    Stadium("Scottish Gas Murrayfield", "Edinburgh", 55.9422, -3.2409),
    Stadium("Stadio Monigo", "Treviso", 45.6864, 12.2126),
    Stadium("Stadio Sergio Lanfranchi", "Parma", 44.8228, 10.3116),
    Stadium("St Helen's", "Swansea", 51.6104, -3.9633),
    Stadium("Thomond Park", "Limerick", 52.6742, -8.6428),
    Stadium("Virgin Media Park", "Cork", 51.8836, -8.4877),
)

_STADIUM_BY_NAME = {stadium.name.lower(): stadium for stadium in STADIUMS}


def stadium(venue: str | None) -> Stadium | None:
    return _STADIUM_BY_NAME.get((venue or "").lower())
