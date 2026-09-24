import { formatLeagueTime, formatRelative, fromLocalInput, toLocalInput } from './league-time';

describe('league time', () => {
  it('formats UTC instants in SAST and keeps unknown instants unknown', () => {
    expect(formatLeagueTime('2026-10-09T18:45:00Z')).toBe('09 Oct 2026 · 20:45 SAST');
    expect(formatLeagueTime(null)).toBe('To be confirmed');
    expect(formatLeagueTime('nonsense', 'unknown')).toBe('unknown');
  });

  it('round-trips datetime-local values entered in league time', () => {
    expect(toLocalInput('2026-10-09T18:45:00Z')).toBe('2026-10-09T20:45');
    expect(fromLocalInput('2026-10-09T20:45')).toBe('2026-10-09T18:45:00.000Z');
    expect(fromLocalInput('')).toBeNull();
  });

  it('describes recent instants relatively and older ones by date', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(formatRelative('2026-10-10T11:58:00Z', now)).toBe('2 min ago');
    expect(formatRelative('2026-10-10T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-10-08T12:00:00Z', now)).toBe('2 d ago');
    expect(formatRelative('2026-09-20T12:00:00Z', now)).toMatch(/^20 Sept? 2026$/);
  });
});
