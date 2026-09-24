import { DutyMarks } from './league.models';

/**
 * The plan's house-mark rule, used only by the sample league. The API is the
 * authoritative calculator; the app formats the values it returns.
 */
const THRESHOLD_MS = 168 * 60 * 60 * 1000;

export function sampleMarks(
  deadlineAt: string | null,
  completedAt: string | null,
  voided: boolean,
  now: Date,
): DutyMarks {
  const asOf = now.toISOString();
  if (voided) return { marks: 0, overdueHours: 0, asOf, nextMarkAt: null, explanation: 'Voided duties earn no marks.' };
  if (!deadlineAt)
    return { marks: 0, overdueHours: 0, asOf, nextMarkAt: null, explanation: 'No confirmed deadline, so no marks accrue.' };
  const deadline = new Date(deadlineAt).getTime();
  const end = Math.min(now.getTime(), completedAt ? new Date(completedAt).getTime() : Infinity);
  if (end <= deadline)
    return {
      marks: 0,
      overdueHours: 0,
      asOf,
      nextMarkAt: completedAt ? null : new Date(deadline + THRESHOLD_MS).toISOString(),
      explanation: 'Not overdue.',
    };
  const counted = end - deadline;
  const marks = Math.floor(counted / THRESHOLD_MS);
  const stopped = !!completedAt;
  return {
    marks,
    overdueHours: Math.round(counted / 360000) / 10,
    asOf,
    nextMarkAt: stopped ? null : new Date(end + (marks + 1) * THRESHOLD_MS - counted).toISOString(),
    explanation: `${Math.round(counted / 3600000)} overdue hours counted${stopped ? '; accrual stopped at completion' : ''}.`,
  };
}
