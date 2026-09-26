"""House marks (plan section 6, "Duties and marks", with the league's challenge decision).

marks = floor(elapsed / 168 hours), where elapsed runs from the deadline (or from the last
clock reset) until completion, actual season closure or now, whichever comes first.
Unknown deadlines and voided duties earn nothing, except a duty voided because its member
was withdrawn: it keeps what it accrued until the withdrawal (withdrawn_at), so a removed
and reinstated member's marks survive. A challenge never pauses accrual: if it
is resolved against the member the marks stand; if it is resolved in the member's favour
the clock restarts from that moment (clock_reset_at). UTC arithmetic on server time; the
client only formats these values.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import floor

THRESHOLD = timedelta(hours=168)


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
    clock_reset_at: datetime | None = None,
    withdrawn_at: datetime | None = None,
) -> MarkCalculation:
    if voided:
        return MarkCalculation(0, 0.0, now, None, "Voided duties earn no marks.")
    if deadline_at is None:
        return MarkCalculation(0, 0.0, now, None, "No confirmed deadline, so no marks accrue.")
    start = max(deadline_at, clock_reset_at) if clock_reset_at else deadline_at
    end = min(t for t in (completed_at, closure_at, withdrawn_at, now) if t is not None)
    stopped = any(t is not None and t <= end for t in (completed_at, closure_at, withdrawn_at))
    if end <= start:
        return MarkCalculation(0, 0.0, now, None if stopped else start + THRESHOLD, "Not overdue.")
    counted = end - start
    marks = floor(counted / THRESHOLD)
    next_mark_at = None if stopped else end + ((marks + 1) * THRESHOLD - counted)
    detail = f"{counted / timedelta(hours=1):.0f} overdue hours counted"
    if clock_reset_at and clock_reset_at > deadline_at:
        detail += " since the clock was reset"
    if completed_at is not None and completed_at <= end:
        detail += "; accrual stopped at completion"
    elif closure_at is not None and closure_at <= end:
        detail += "; accrual stopped at season closure"
    elif withdrawn_at is not None and withdrawn_at <= end:
        detail += "; accrual stopped when the member was withdrawn"
    return MarkCalculation(marks, counted / timedelta(hours=1), now, next_mark_at, detail + ".")
