import { CompetitionRound } from '../../competition/competition.models';
import { CaseView } from '../../league/cases/case.models';
import { RoundDutyView } from '../../league/duties/duty.models';
import { Poll } from '../../league/league.models';
import { RoundActivity, TimelineDutyState } from './season-timeline.models';

type ActivityDuty = Pick<RoundDutyView, 'roundId' | 'mine' | 'status' | 'evidence'>;
type ActivityCase = Pick<CaseView, 'roundNumber' | 'live'>;
type ActivityPoll = Pick<Poll, 'roundId' | 'status'>;

export const DUTY_STATE_LABELS: Record<TimelineDutyState, string> = {
  done: 'Done',
  rejected: 'Rejected',
  open: 'Open',
};

/** A rejected duty needs the member most, then an open one. */
const PRIORITY: readonly TimelineDutyState[] = ['rejected', 'open', 'done'];

/**
 * The member's duty and the unresolved decisions of each round, keyed by round id. Rounds with
 * neither are left out. Voided duties and season-wide duties and cases (no round) are ignored.
 */
export function roundActivity(
  duties: readonly ActivityDuty[],
  cases: readonly ActivityCase[],
  polls: readonly ActivityPoll[],
): ReadonlyMap<number, RoundActivity> {
  const activity = new Map<number, RoundActivity>();
  const entry = (roundId: number) => activity.get(roundId) ?? { duty: null, decisions: 0 };
  for (const duty of duties) {
    if (!duty.mine || duty.roundId === null || duty.status === 'voided') continue;
    const current = entry(duty.roundId);
    const state = dutyState(duty);
    const worst =
      current.duty && PRIORITY.indexOf(current.duty) < PRIORITY.indexOf(state)
        ? current.duty
        : state;
    activity.set(duty.roundId, { ...current, duty: worst });
  }
  const openRounds = [
    ...cases.flatMap((c) => (c.live && c.roundNumber !== null ? [c.roundNumber] : [])),
    ...polls.filter((p) => p.status === 'Open').map((p) => p.roundId),
  ];
  for (const roundId of openRounds) {
    const current = entry(roundId);
    activity.set(roundId, { ...current, decisions: current.decisions + 1 });
  }
  return activity;
}

/** The stop's accessible name, such as `Round 02, Current, your duty open, 2 decisions open`. */
export function roundLabel(
  round: Pick<CompetitionRound, 'title' | 'status'>,
  activity: RoundActivity | undefined,
): string {
  const parts = [round.title, round.status];
  if (activity?.duty) parts.push(`your duty ${DUTY_STATE_LABELS[activity.duty].toLowerCase()}`);
  if (activity?.decisions) {
    parts.push(`${activity.decisions} decision${activity.decisions === 1 ? '' : 's'} open`);
  }
  return parts.join(', ');
}

function dutyState(duty: ActivityDuty): TimelineDutyState {
  if (duty.status === 'completed') return 'done';
  const latest = duty.evidence.reduce<ActivityDuty['evidence'][number] | null>(
    (last, e) => (!last || Date.parse(e.submittedAt) > Date.parse(last.submittedAt) ? e : last),
    null,
  );
  return latest?.decision === 'rejected' ? 'rejected' : 'open';
}
