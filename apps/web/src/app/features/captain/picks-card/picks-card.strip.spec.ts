import { competition } from '../../../core/competition/registry';
import { shortName, stripItem } from './picks-card.strip';

const FIXTURE = competition('urc-2026-27')
  .buildRounds(1)
  .find((r) => r.id === 1)!.fixtures[0];
const CLUBS = { home: undefined, away: undefined };
const lockTime = () => '1 Oct 19:00';

function picks(options: { locked?: boolean; ids?: string[]; final?: boolean; void?: boolean }) {
  return {
    locked: options.locked ?? false,
    void: options.void ?? false,
    final: options.final ?? false,
    provisional: false,
    rows: (options.ids ?? []).map((memberId) => ({ memberId })),
  } as unknown as Parameters<typeof stripItem>[1];
}

describe('picks card strip', () => {
  it('shows the lock time before kickoff', () => {
    const item = stripItem(
      { ...FIXTURE, kickoffUtc: FIXTURE.kickoffUtc ?? '2026-10-01T17:00:00Z' },
      picks({}),
      ['a'],
      CLUBS,
      lockTime,
    );
    expect(item.locked).toBe(false);
    expect(item.awaiting).toBe(false);
    expect(item.status).toBe('Locks 1 Oct 19:00');
  });

  it('flags a locked fixture with members still to pick', () => {
    const item = stripItem(
      FIXTURE,
      picks({ locked: true, ids: ['a'] }),
      ['a', 'b'],
      CLUBS,
      lockTime,
    );
    expect(item.awaiting).toBe(true);
    expect(item.status).toBe('Awaiting picks');
    expect(
      stripItem(FIXTURE, picks({ locked: true, ids: ['a', 'b'] }), ['a', 'b'], CLUBS, lockTime)
        .status,
    ).toBe('Recorded');
  });

  it('names void and final fixtures', () => {
    expect(
      stripItem(FIXTURE, picks({ locked: true, void: true }), [], CLUBS, lockTime).status,
    ).toBe('Void');
    expect(
      stripItem(FIXTURE, picks({ locked: true, final: true }), [], CLUBS, lockTime).status,
    ).toBe('Final');
  });

  it('shortens a club name missing from the catalogue', () => {
    expect(shortName('Hollywoodbets Sharks')).toBe('Sharks');
    expect(shortName('To be confirmed')).toBe('TBC');
  });
});
