"""House marks (plan section 6, "Duties and marks").

marks = floor(max(0, elapsed - paused) / 168 hours), where elapsed runs from the deadline
until completion, actual season closure or now, whichever comes first. Unknown deadlines
and voided duties earn nothing. Pause intervals (from cases, not yet built) are subtracted
and fractional progress survives a pause. UTC arithmetic on server time; the client only
formats these values.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import floor

THRESHOLD = timedelta(hours=168)


@dataclass(frozen=True)
class Pause:
    start: datetime
    end: datetime | None


@dataclass(frozen=True)
class MarkCalculation:
    marks: int
    overdue_hours: float
    as_of: datetime
    next_mark_at: datetime | None
    explanation: str


def calculate(
    *,
    deadline_at: datetime | None,
    completed_at: datetime | None,
    voided: bool,
    now: datetime,
    closure_at: datetime | None = None,
    pauses: tuple[Pause, ...] = (),
) -> MarkCalculation:
    if voided:
        return MarkCalculation(0, 0.0, now, None, "Voided duties earn no marks.")
    if deadline_at is None:
        return MarkCalculation(0, 0.0, now, None, "No confirmed deadline, so no marks accrue.")
    end = min(t for t in (completed_at, closure_at, now) if t is not None)
    if end <= deadline_at:
        pending = None if completed_at else deadline_at + THRESHOLD
        return MarkCalculation(0, 0.0, now, pending, "Not overdue.")
    paused = sum((_overlap(p, deadline_at, end) for p in pauses), timedelta())
    counted = max(timedelta(), end - deadline_at - paused)
    marks = floor(counted / THRESHOLD)
    stopped = completed_at is not None and completed_at <= end or closure_at is not None and closure_at <= end
    next_mark_at = None if stopped else end + ((marks + 1) * THRESHOLD - counted)
    detail = f"{counted / timedelta(hours=1):.0f} overdue hours counted"
    if paused:
        detail += f", {paused / timedelta(hours=1):.0f} paused hours excluded"
    if completed_at is not None and completed_at <= end:
        detail += "; accrual stopped at completion"
    elif closure_at is not None and closure_at <= end:
        detail += "; accrual stopped at season closure"
    return MarkCalculation(marks, counted / timedelta(hours=1), now, next_mark_at, detail + ".")


def _overlap(pause: Pause, start: datetime, end: datetime) -> timedelta:
    lo = max(pause.start, start)
    hi = min(pause.end or end, end)
    return max(timedelta(), hi - lo)
