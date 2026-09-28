import { CaseView } from '../../../core/league/cases/case.models';

/** The viewer's own part in a case, in words. Nobody else's response is ever shown. */
export function myResponseText(
  c: Pick<CaseView, 'isVoter' | 'mine' | 'myResponse' | 'myVetoReason' | 'status'>,
): string {
  if (!c.isVoter) return c.mine ? 'Your own duty: you do not vote' : 'You are not voting on this';
  if (c.myResponse === 'accept') return 'You accepted';
  if (c.myResponse === 'veto')
    return c.myVetoReason ? `You vetoed: “${c.myVetoReason}”` : 'You vetoed';
  return c.status === 'open' ? 'Not yet' : 'No response';
}
