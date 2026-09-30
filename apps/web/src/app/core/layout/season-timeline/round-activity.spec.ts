import { DutyEvidence } from '../../league/league.models';
import { roundActivity, roundLabel } from './round-activity';

const evidence = (decision: string, submittedAt: string) =>
  ({ decision, submittedAt }) as DutyEvidence;

describe('roundActivity', () => {
  it('keeps the member’s own duty state per round, the most pressing first', () => {
    const activity = roundActivity(
      [
        { roundId: 1, mine: true, status: 'completed', evidence: [] },
        {
          roundId: 2,
          mine: true,
          status: 'open',
          evidence: [
            evidence('accepted', '2026-10-01T10:00:00Z'),
            evidence('rejected', '2026-10-02T10:00:00Z'),
          ],
        },
        { roundId: 3, mine: true, status: 'completed', evidence: [] },
        { roundId: 3, mine: true, status: 'pending_deadline', evidence: [] },
        { roundId: 4, mine: false, status: 'open', evidence: [] },
        { roundId: 5, mine: true, status: 'voided', evidence: [] },
        { roundId: null, mine: true, status: 'open', evidence: [] },
      ],
      [],
      [],
    );
    expect([...activity]).toEqual([
      [1, { duty: 'done', decisions: 0 }],
      [2, { duty: 'rejected', decisions: 0 }],
      [3, { duty: 'open', decisions: 0 }],
    ]);
  });

  it('treats newer evidence after a rejection as open', () => {
    const activity = roundActivity(
      [
        {
          roundId: 2,
          mine: true,
          status: 'open',
          evidence: [
            evidence('pending', '2026-10-03T10:00:00Z'),
            evidence('rejected', '2026-10-02T10:00:00Z'),
          ],
        },
      ],
      [],
      [],
    );
    expect(activity.get(2)?.duty).toBe('open');
  });

  it('counts live cases and open polls per round', () => {
    const activity = roundActivity(
      [{ roundId: 2, mine: true, status: 'open', evidence: [] }],
      [
        { roundNumber: 2, live: true },
        { roundNumber: 2, live: false },
        { roundNumber: 3, live: true },
        { roundNumber: null, live: true },
      ],
      [
        { roundId: 2, status: 'Open' },
        { roundId: 1, status: 'Closed' },
      ],
    );
    expect([...activity]).toEqual([
      [2, { duty: 'open', decisions: 2 }],
      [3, { duty: null, decisions: 1 }],
    ]);
  });
});

describe('roundLabel', () => {
  it('names the duty and open decisions after the status', () => {
    const round = { title: 'Round 02', status: 'Current' } as const;
    expect(roundLabel(round, undefined)).toBe('Round 02, Current');
    expect(roundLabel(round, { duty: 'rejected', decisions: 1 })).toBe(
      'Round 02, Current, your duty rejected, 1 decision open',
    );
    expect(roundLabel(round, { duty: null, decisions: 2 })).toBe(
      'Round 02, Current, 2 decisions open',
    );
  });
});
