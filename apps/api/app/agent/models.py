"""Contract of a match preview: what the agent submits and what members read.

Agent text is rendered as plain text by the web app; these rules keep it bounded,
free of control characters and tied to cited HTTP(S) sources.
"""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from app.chat.glossary import UNIONS
from app.competitions import DEFAULT_COMPETITION_ID

MAX_SOURCES = 20
MAX_FACTORS = 6
# The team researcher's output schema (apps/agent/agent/subagents/team-researcher/agent.ts).
MAX_RESEARCH_ITEMS = 12
# Internationals per side (apps/agent/agent/lib/internationals.ts MAX_INTERNATIONALS).
MAX_INTERNATIONALS = 30
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CONTROL = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")


def _plain(value: str) -> str:
    """Trimmed text without control characters other than line breaks. Rendered as text only."""
    value = value.strip()
    if _CONTROL.search(value):
        raise ValueError("must not contain control characters")
    if not value:
        raise ValueError("must not be blank")
    return value


def _web_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc or any(c.isspace() for c in value):
        raise ValueError("must be an http or https URL")
    return value


WebUrl = Annotated[str, Field(max_length=2000), AfterValidator(_web_url)]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
SourceRefs = Annotated[list[Annotated[int, Field(ge=0)]], Field(min_length=1, max_length=5)]
Summary = Annotated[str, Field(min_length=1, max_length=1500), AfterValidator(_plain)]
Line = Annotated[str, Field(min_length=1, max_length=300), AfterValidator(_plain)]
Title = Annotated[str, Field(min_length=1, max_length=200), AfterValidator(_plain)]
Name = Annotated[str, Field(min_length=1, max_length=100), AfterValidator(_plain)]
# Optional on every agent request that names a fixture, so the deployed agent keeps working.
CompetitionId = Annotated[str, Field(min_length=1, max_length=40)]


def _iso_date(value: Any) -> Any:
    """Only a YYYY-MM-DD string is a date here (not a timestamp, a number or a longer ISO string)."""
    if isinstance(value, str) and not _DATE.match(value):
        raise ValueError("must be a date written YYYY-MM-DD")
    if not isinstance(value, (str, date)) or isinstance(value, datetime):
        raise ValueError("must be a date written YYYY-MM-DD")
    return value


def _union(value: str) -> str:
    if value not in UNIONS:
        raise ValueError("must be one of the test unions: " + ", ".join(UNIONS))
    return value


IsoDate = Annotated[date, BeforeValidator(_iso_date)]
UnionName = Annotated[str, AfterValidator(_union)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(Strict):
    url: WebUrl
    title: Title
    publisher: Name | None = None
    publishedAt: datetime | None = None


class Factor(Strict):
    text: Line
    sources: SourceRefs


class Mood(Strict):
    score: int = Field(ge=-2, le=2)
    note: Line
    sources: SourceRefs


class KeyFactors(Strict):
    home: Annotated[list[Factor], Field(max_length=MAX_FACTORS)]
    away: Annotated[list[Factor], Field(max_length=MAX_FACTORS)]


class Sentiment(Strict):
    home: Mood
    away: Mood


class Models(Strict):
    writer: Name
    researcher: Name | None = None


class Usage(Strict):
    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)
    webSearches: int = Field(default=0, ge=0)


class ResearchItem(Strict):
    kind: Literal["injury", "selection", "coach", "travel", "rest", "other"]
    text: Line
    url: WebUrl
    title: Title
    publisher: Name | None = None
    # Free text in the researcher's schema; kept as given.
    publishedAt: Annotated[str, Field(min_length=1, max_length=40), AfterValidator(_plain)] | None = None


class ResearchMood(Strict):
    score: int = Field(ge=-2, le=2)
    note: Line
    urls: Annotated[list[WebUrl], Field(max_length=MAX_SOURCES)]


class International(Strict):
    """A selected player who has played Test rugby, with the page that says so."""

    name: Name
    union: UnionName
    caps: int | None = Field(default=None, ge=1, le=250)
    capsAsOf: IsoDate | None = None
    lastTestOn: IsoDate | None = None
    url: WebUrl
    title: Title
    publisher: Name | None = None


class ResearchResult(Strict):
    """One team researcher's result, passed through by the writer unchanged."""

    team: Name
    items: Annotated[list[ResearchItem], Field(max_length=MAX_RESEARCH_ITEMS)]
    mood: ResearchMood
    # Optional, so research without it (an agent from before internationals) still validates.
    internationals: Annotated[list[International], Field(max_length=MAX_INTERNATIONALS)] = Field(default_factory=list)


class Research(Strict):
    home: ResearchResult
    away: ResearchResult


class PreviewSubmission(Strict):
    competitionId: CompetitionId = DEFAULT_COMPETITION_ID
    fixtureId: str = Field(min_length=1, max_length=40)
    inputsHash: Hash
    teamsheetHash: Hash
    summary: Summary
    keyFactors: KeyFactors
    sentiment: Sentiment
    sources: Annotated[list[Source], Field(min_length=1, max_length=MAX_SOURCES)]
    models: Models
    usage: Usage | None = None
    runId: Annotated[str, Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9_.:-]+$")] | None = None
    # Stored with the preview for the match chat; not part of the members' preview.
    research: Research | None = None

    @model_validator(mode="after")
    def _sources_exist(self) -> "PreviewSubmission":
        cited = [i for f in self.keyFactors.home + self.keyFactors.away for i in f.sources]
        cited += self.sentiment.home.sources + self.sentiment.away.sources
        if any(i >= len(self.sources) for i in cited):
            raise ValueError("every cited source index must refer to an entry in sources")
        return self


class PreviewView(BaseModel):
    """The latest preview as members read it."""

    revision: int
    generatedAt: datetime
    summary: str
    keyFactors: KeyFactors
    sentiment: Sentiment
    sources: list[Source]


class MatchPreview(BaseModel):
    fixtureId: str
    preview: PreviewView | None


class DispatchRequest(Strict):
    """Optional body of POST /v1/agent/dispatches: the competition, one fixture, and whether
    to force it."""

    competitionId: CompetitionId = DEFAULT_COMPETITION_ID
    fixtureId: str | None = Field(default=None, pattern=r"^\d{1,12}$")
    force: bool = False

    @model_validator(mode="after")
    def force_needs_a_fixture(self) -> "DispatchRequest":
        if self.force and self.fixtureId is None:
            raise ValueError("force needs a fixtureId")
        return self
