import { Fixture } from './competition.models';
import { ribbonStatus, scoreBug } from './match-status';

const FIXTURE: Fixture = {
  id: '1',
  kickoffUtc: '2026-09-25T18:45:00Z',
  home: 'Benetton',
  away: 'Dragons',
  homeAsset: 'benetton-rugby',
  awayAsset: 'dragons-rfc',
  day: 'FRI 25 SEP',
  time: '20:45',
  venue: 'Stadio Monigo',
};

describe('match status', () => {
  it('shows the kickoff before the match', () => {
    expect(scoreBug(FIXTURE)).toEqual({
      heading: null,
      caption: 'KICKOFF',
      value: '20:45',
      note: 'SAST',
      live: false,
    });
    expect(scoreBug({ ...FIXTURE, kickoffUtc: null, time: 'TBC' }).note).toBe('TIME TBC');
    expect(ribbonStatus(FIXTURE)).toBe('FRI 25 SEP');
  });

  it('shows the live score, half time and the result', () => {
    const live = { ...FIXTURE, state: 'live' as const, minute: 54, score: '17–10' };
    expect(scoreBug(live)).toEqual({
      heading: 'LIVE',
      caption: 'LIVE',
      value: '17–10',
      note: "54'",
      live: true,
    });
    expect(ribbonStatus(live)).toBe("LIVE 54'");
    const half = { ...FIXTURE, state: 'half_time' as const, minute: 40, score: '10–3' };
    expect(scoreBug(half).heading).toBe('HALF TIME');
    expect(ribbonStatus(half)).toBe('HALF TIME');
    const result = { ...FIXTURE, state: 'full_time' as const, score: '24–20' };
    expect(scoreBug(result)).toMatchObject({ heading: 'FULL TIME', caption: 'RESULT', value: '24–20' });
    expect(ribbonStatus(result)).toBe('FULL TIME');
    expect(scoreBug({ ...FIXTURE, state: 'postponed' }).value).toBe('20:45');
  });
});
