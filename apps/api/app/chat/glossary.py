"""Names the chat may need to resolve: national sides by nickname, and clubs by their other names.

Reference text for the `names` document (app/chat/context.py), not sourced facts. Only
widely used nicknames are listed; do not add one that is not. A union's key is the country
name as the Pavilion writes it. A player's test team is the union the player has played for,
which is not always the country of birth or the club's country.
"""

from typing import Mapping

from app.competitions.base import Club, Competition

# Test union -> widely used nicknames (empty when there is no common one).
UNIONS: Mapping[str, tuple[str, ...]] = {
    "South Africa": ("Springboks", "Boks", "Bokke"),
    "New Zealand": ("All Blacks",),
    "Australia": ("Wallabies",),
    "Argentina": ("Pumas", "Los Pumas"),
    "France": ("Les Bleus",),
    "Italy": ("Azzurri",),
    "Ireland": (),
    "Wales": (),
    "Scotland": (),
    "England": ("Red Rose",),
    "Georgia": ("Lelos",),
    "Fiji": ("Flying Fijians",),
    "Samoa": ("Manu Samoa",),
    "Tonga": ("ʻIkale Tahi", "Sea Eagles"),
    "Japan": ("Brave Blossoms",),
    "United States": ("Eagles",),
    "Canada": ("Canucks",),
    "Uruguay": ("Los Teros",),
    "Portugal": ("Os Lobos",),
    "Spain": ("Leones",),
    "Romania": ("Oaks",),
    "Namibia": ("Welwitschias",),
    "Chile": ("Cóndores",),
    "Germany": (),
    "Netherlands": (),
    "Hong Kong China": (),
    "Zimbabwe": ("Sables",),
    "Kenya": ("Simbas",),
}


def club_aliases(competition: Competition, club: Club) -> list[str]:
    """The names a member may use for a club besides `club.name`: its short name, then every
    other name the results feed has used for it. Case-insensitive duplicates are dropped."""
    seen = {club.name.casefold()}
    aliases: list[str] = []
    for name in (club.short_name, *competition.history().club_names.get(club.id, ())):
        if name.casefold() not in seen:
            seen.add(name.casefold())
            aliases.append(name)
    return aliases
