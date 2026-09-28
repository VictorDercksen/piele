import { caseOutcome, timeLeft } from './case-wording';

describe('case wording', () => {
  it('says how a closed case ended, and nothing while it is live', () => {
    expect(caseOutcome('open', null)).toBeNull();
    expect(caseOutcome('in_review', null)).toBeNull();
    expect(caseOutcome('accepted', 'majority')).toBe('Accepted by a majority of members');
    expect(caseOutcome('accepted', 'auto')).toBe('Accepted automatically: no veto within 24 hours');
    expect(caseOutcome('accepted', 'no_voters')).toBe('Accepted: no other member could vote');
    expect(caseOutcome('rejected', 'veto_upheld')).toBe('Rejected: the veto was upheld');
    expect(caseOutcome('accepted', 'captain')).toBe('Accepted by the captain');
    expect(caseOutcome('rejected', 'captain')).toBe('Rejected by the captain');
    expect(caseOutcome('superseded', null)).toContain('Superseded');
  });

  it('counts down the time left to vote', () => {
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(timeLeft('2026-10-05T09:30:00Z', now)).toBe('23 h 30 min left');
    expect(timeLeft('2026-10-04T10:12:30Z', now)).toBe('12 min left');
    expect(timeLeft('2026-10-04T10:00:30Z', now)).toBe('Closing now');
    expect(timeLeft('2026-10-04T09:00:00Z', now)).toBe('Closing now');
  });
});
