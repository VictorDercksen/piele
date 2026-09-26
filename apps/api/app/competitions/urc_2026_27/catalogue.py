"""URC 2026/27 catalogues: the clubs and the stadiums in the published schedule.

The club list mirrors apps/web/src/app/core/competition/teams.ts. Stadium coordinates
are approximate pitch locations used only for weather forecasts. Countries are rugby
unions (Ulster and Belfast are Ireland), used to classify travel for match previews.
"""

from app.competitions.base import Club, Stadium

CLUBS: tuple[Club, ...] = (
    Club("benetton-rugby", 2019, "Benetton Rugby", "Benetton", "Italy"),
    Club("vodacom-bulls", 5586, "Vodacom Bulls", "Bulls", "South Africa"),
    Club("cardiff-rugby", 4471, "Cardiff Rugby", "Cardiff", "Wales"),
    Club("connacht-rugby", 5483, "Connacht Rugby", "Connacht", "Ireland"),
    Club("dragons-rfc", 3533, "Dragons RFC", "Dragons", "Wales"),
    Club("edinburgh-rugby", 1641, "Edinburgh Rugby", "Edinburgh", "Scotland"),
    Club("glasgow-warriors", 3098, "Glasgow Warriors", "Glasgow", "Scotland"),
    Club("leinster-rugby", 5356, "Leinster Rugby", "Leinster", "Ireland"),
    Club("10bet-lions", 5092, "Lions", "Lions", "South Africa"),
    Club("munster-rugby", 4377, "Munster Rugby", "Munster", "Ireland"),
    Club("ospreys", 5057, "Ospreys", "Ospreys", "Wales"),
    Club("scarlets", 3514, "Scarlets", "Scarlets", "Wales"),
    Club("hollywoodbets-sharks", 1527, "Hollywoodbets Sharks", "Sharks", "South Africa"),
    Club("dhl-stormers", 3994, "DHL Stormers", "Stormers", "South Africa"),
    Club("ulster-rugby", 2129, "Ulster Rugby", "Ulster", "Ireland"),
    Club("zebre-parma", 4474, "Zebre Parma", "Zebre", "Italy"),
)

STADIUMS: tuple[Stadium, ...] = (
    Stadium("10bet Ellis Park", "Johannesburg", "South Africa", -26.1978, 28.0606),
    Stadium("Affidea Stadium", "Belfast", "Ireland", 54.5806, -5.9139),
    Stadium("Aviva Stadium", "Dublin", "Ireland", 53.3352, -6.2285),
    Stadium("Cardiff Arms Park", "Cardiff", "Wales", 51.4794, -3.1839),
    Stadium("DHL Stadium", "Cape Town", "South Africa", -33.9036, 18.4113),
    Stadium("Dexcom Stadium", "Galway", "Ireland", 53.2769, -9.0355),
    Stadium("Hampden Park", "Glasgow", "Scotland", 55.8256, -4.2520),
    Stadium("Hive Stadium", "Edinburgh", "Scotland", 55.9422, -3.2408),
    Stadium("Hollywoodbets Kings Park", "Durban", "South Africa", -29.8286, 31.0303),
    Stadium("Laya Arena", "Dublin", "Ireland", 53.3268, -6.2287),
    Stadium("Loftus Versfeld", "Pretoria", "South Africa", -25.7533, 28.2225),
    Stadium("Parc y Scarlets", "Llanelli", "Wales", 51.6806, -4.1272),
    Stadium("Rodney Parade", "Newport", "Wales", 51.5883, -2.9878),
    Stadium("Scotstoun Stadium", "Glasgow", "Scotland", 55.8836, -4.3395),
    Stadium("Scottish Gas Murrayfield", "Edinburgh", "Scotland", 55.9422, -3.2409),
    Stadium("Stadio Monigo", "Treviso", "Italy", 45.6864, 12.2126),
    Stadium("Stadio Sergio Lanfranchi", "Parma", "Italy", 44.8228, 10.3116),
    Stadium("St Helen's", "Swansea", "Wales", 51.6104, -3.9633),
    Stadium("Thomond Park", "Limerick", "Ireland", 52.6742, -8.6428),
    Stadium("Virgin Media Park", "Cork", "Ireland", 51.8836, -8.4877),
)
