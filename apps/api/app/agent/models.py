"""Contract of a match preview: what the agent submits and what members read.

Agent text is rendered as plain text by the web app; these rules keep it bounded,
free of control characters and tied to cited HTTP(S) sources.
"""

import re
from datetime import datetime
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.competitions import DEFAULT_COMPETITION_ID

MAX_SOURCES = 20
MAX_FACTORS = 6
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


Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
SourceRefs = Annotated[list[Annotated[int, Field(ge=0)]], Field(min_length=1, max_length=5)]
Summary = Annotated[str, Field(min_length=1, max_length=1500), AfterValidator(_plain)]
Line = Annotated[str, Field(min_length=1, max_length=300), AfterValidator(_plain)]
Title = Annotated[str, Field(min_length=1, max_length=200), AfterValidator(_plain)]
Name = Annotated[str, Field(min_length=1, max_length=100), AfterValidator(_plain)]
# Optional on every agent request that names a fixture, so the deployed agent keeps working.
CompetitionId = Annotated[str, Field(min_length=1, max_length=40)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(Strict):
    url: Annotated[str, Field(max_length=2000), AfterValidator(_web_url)]
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
