"""The agent project's answer, relayed to the browser as it arrives.

The agent's POST /chat/turn answers with the AI SDK UI message stream (server-sent events,
one JSON part per `data:` line). The bytes go to the browser unchanged; on the way the
parts are read to keep the answer's text, the sources it cites, whether it failed and the
token usage, which are stored once the stream ends (`RelayResponse.__call__`'s finally).
"""

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit

import anyio
import httpx
from starlette.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

REMAINING_THREAD_HEADER = "X-Chat-Remaining-Thread"
REMAINING_TODAY_HEADER = "X-Chat-Remaining-Today"
STREAM_HEADER = "x-vercel-ai-ui-message-stream"
CONNECT_TIMEOUT_SECONDS = 10.0
TOTAL_TIMEOUT_SECONDS = 60.0
MAX_TEXT = 4000
MAX_SOURCES = 20
# A stream that never sends a line break would otherwise grow the buffer without bound.
MAX_LINE_BYTES = 256 * 1024
# Sent after the agent's bytes when its stream breaks off, so the browser's stream ends with
# the protocol's own error part rather than in silence.
BROKEN_PART = b'data: {"type":"error","errorText":"The answer was cut off."}\n\n'

NO_ANSWER = "No answer was produced."
STOPPED = "The answer was stopped."
UNREACHABLE = "The Pavilion agent could not be reached."


class AgentUnavailable(Exception):
    """The agent could not be reached or answered with a non-2xx status. The message names
    the exception type or status only."""


@dataclass
class Outcome:
    text: str
    status: str
    sources: list[dict[str, str]] = field(default_factory=list)
    usage: dict[str, Any] | None = None
    model: str | None = None


class Collector:
    """Reads UI message stream parts from the raw bytes, across chunk boundaries."""

    def __init__(self) -> None:
        self._buffer = b""
        self._text: list[str] = []
        self._length = 0
        self.sources: list[dict[str, str]] = []
        self.errored = False
        self.finished = False
        self.usage: dict[str, Any] | None = None
        self.model: str | None = None

    @property
    def text(self) -> str:
        return "".join(self._text).strip()

    def feed(self, chunk: bytes) -> None:
        self._buffer += chunk
        *lines, self._buffer = self._buffer.split(b"\n")
        for line in lines:
            self._line(line)
        if len(self._buffer) > MAX_LINE_BYTES:
            self._buffer = b""

    def close(self) -> None:
        if self._buffer:
            self._line(self._buffer)
            self._buffer = b""

    def _line(self, line: bytes) -> None:
        line = line.rstrip(b"\r")
        if not line.startswith(b"data:"):
            return
        payload = line[5:].strip()
        if not payload or payload == b"[DONE]":
            return
        try:
            part = json.loads(payload)
        except ValueError:
            return
        if isinstance(part, dict):
            self._part(part)

    def _part(self, part: dict[str, Any]) -> None:
        kind = part.get("type")
        if kind == "text-delta" and isinstance(part.get("delta"), str):
            if self._length < MAX_TEXT:
                self._text.append(part["delta"])
                self._length += len(part["delta"])
        elif kind == "source-url":
            self._source(part.get("url"), part.get("title"))
        elif kind == "error":
            self.errored = True
        elif kind in ("finish", "message-metadata"):
            self.finished = self.finished or kind == "finish"
            metadata = part.get("messageMetadata")
            if isinstance(metadata, dict):
                if isinstance(metadata.get("usage"), dict):
                    self.usage = metadata["usage"]
                if isinstance(metadata.get("model"), str):
                    self.model = metadata["model"]

    def _source(self, url: Any, title: Any) -> None:
        if not isinstance(url, str) or len(url) > 2000 or urlsplit(url).scheme not in ("http", "https"):
            return
        if len(self.sources) >= MAX_SOURCES or any(s["url"] == url for s in self.sources):
            return
        label = " ".join(title.split())[:200] if isinstance(title, str) and title.strip() else urlsplit(url).hostname or url
        self.sources.append({"url": url, "title": label})

    def outcome(self, *, completed: bool, broken: bool) -> Outcome:
        """`completed`: the agent's stream ended. `broken`: it failed or timed out. Neither: the
        browser went away first."""
        text = self.text[:MAX_TEXT]
        if completed and not broken and not self.errored and text:
            status = "complete"
        elif not completed and not broken:
            status = "aborted"
        else:
            status = "failed"
        if not text:
            text = STOPPED if status == "aborted" else NO_ANSWER
        return Outcome(text, status, list(self.sources), self.usage, self.model)


async def open_stream(
    transport: httpx.AsyncBaseTransport | None, url: str, token: str, body: dict[str, Any], deadline: float
) -> tuple[httpx.AsyncClient, httpx.Response]:
    """POST the turn and wait for the response head. Raises AgentUnavailable when the agent
    cannot be reached in time or answers with a non-2xx status."""
    client = httpx.AsyncClient(
        transport=transport, timeout=httpx.Timeout(TOTAL_TIMEOUT_SECONDS, connect=CONNECT_TIMEOUT_SECONDS)
    )
    request = client.build_request(
        "POST", url, json=body, headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"}
    )
    try:
        async with asyncio.timeout_at(deadline):
            response = await client.send(request, stream=True)
    except (httpx.HTTPError, TimeoutError) as exc:
        await client.aclose()
        raise AgentUnavailable(type(exc).__name__) from None
    if not response.is_success:
        await response.aclose()
        await client.aclose()
        raise AgentUnavailable(f"status {response.status_code}")
    return client, response


class RelayResponse(StreamingResponse):
    """Streams the agent's bytes unchanged, then hands the collected outcome to `on_done`
    whether the stream ended, broke or the browser left (status `aborted`)."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        upstream: httpx.Response,
        deadline: float,
        headers: dict[str, str],
        on_done: Callable[[Outcome], Awaitable[None]],
    ) -> None:
        self._client = client
        self._upstream = upstream
        self._deadline = deadline
        self._on_done = on_done
        self._completed = False
        self._broken = False
        self.collector = Collector()
        headers = {
            "content-type": upstream.headers.get("content-type", "text/event-stream"),
            STREAM_HEADER: upstream.headers.get(STREAM_HEADER, "v1"),
            # Proxies must not hold the stream back to buffer it.
            "X-Accel-Buffering": "no",
            **headers,
        }
        super().__init__(self._relay(), status_code=200, headers=headers)

    async def _relay(self):
        chunks = self._upstream.aiter_raw().__aiter__()
        while True:
            try:
                # The timeout wraps each read, never a yield, so it can only cancel the read.
                async with asyncio.timeout_at(self._deadline):
                    chunk = await chunks.__anext__()
            except StopAsyncIteration:
                self.collector.close()
                self._completed = True
                return
            except (httpx.HTTPError, TimeoutError):
                self._broken = True
                yield BROKEN_PART
                return
            self.collector.feed(chunk)
            yield chunk

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Shielded: a browser that disconnects cancels the request, and the answer must
            # still be stored (its question already counts against the limits).
            with anyio.CancelScope(shield=True):
                await self._upstream.aclose()
                await self._client.aclose()
                await self._on_done(self.collector.outcome(completed=self._completed, broken=self._broken))
