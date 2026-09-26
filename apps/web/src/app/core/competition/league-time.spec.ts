import { TestBed } from '@angular/core/testing';
import {
  LeagueTime,
  formatInZone,
  formatLeagueTime,
  formatRelative,
  fromLocalInput,
  hourIn,
  toLocalInput,
  zoneAbbreviation,
  zoneOffsetMinutes,
} from './league-time';

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
    expect(fromLocalInput('2026-13-09T20:45')).toBeNull();
  });

  it('describes recent instants relatively and older ones by date', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(formatRelative('2026-10-10T11:58:00Z', now)).toBe('2 min ago');
    expect(formatRelative('2026-10-10T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-10-08T12:00:00Z', now)).toBe('2 d ago');
    expect(formatRelative('2026-09-20T12:00:00Z', now)).toMatch(/^20 Sept? 2026$/);
  });

  it('names zones by their abbreviation at the instant', () => {
    expect(zoneAbbreviation()).toBe('SAST');
    expect(zoneAbbreviation('Europe/London', '2026-07-01T12:00:00Z')).toBe('BST');
    expect(zoneAbbreviation('Europe/London', '2026-12-01T12:00:00Z')).toBe('GMT');
    expect(zoneOffsetMinutes(Date.parse('2026-07-01T12:00:00Z'), 'Europe/London')).toBe(60);
    expect(zoneOffsetMinutes(Date.parse('2026-07-01T12:00:00Z'))).toBe(120);
    expect(hourIn(Date.parse('2026-07-01T23:30:00Z'), 'Pacific/Auckland')).toBe(11);
  });

  it('formats small date patterns on the zone clock', () => {
    const at = '2026-09-23T11:30:05Z';
    expect(formatInZone(at, 'HH:mm:ss z')).toBe('13:30:05 SAST');
    expect(formatInZone(at, 'd MMM HH:mm')).toBe('23 Sep 13:30');
    expect(formatInZone('2026-09-03T11:30:05Z', 'd MMM HH:mm z', 'Europe/London')).toBe(
      '3 Sep 12:30 BST',
    );
    expect(formatInZone(null, 'HH:mm', undefined, 'TBC')).toBe('TBC');
  });

  it('converts wall-clock input across daylight saving in Europe/London', () => {
    const zone = 'Europe/London';
    // Summer (BST, UTC+1) and winter (GMT, UTC+0).
    expect(fromLocalInput('2026-07-01T20:00', zone)).toBe('2026-07-01T19:00:00.000Z');
    expect(fromLocalInput('2026-12-01T20:00', zone)).toBe('2026-12-01T20:00:00.000Z');
    // Either side of the spring-forward on 29 March 2026 (01:00 GMT becomes 02:00 BST).
    expect(fromLocalInput('2026-03-29T00:30', zone)).toBe('2026-03-29T00:30:00.000Z');
    expect(fromLocalInput('2026-03-29T02:30', zone)).toBe('2026-03-29T01:30:00.000Z');
    // Either side of the fall-back on 25 October 2026 (02:00 BST becomes 01:00 GMT).
    expect(fromLocalInput('2026-10-25T00:30', zone)).toBe('2026-10-24T23:30:00.000Z');
    expect(fromLocalInput('2026-10-25T02:30', zone)).toBe('2026-10-25T02:30:00.000Z');
    for (const iso of [
      '2026-03-28T23:15:00.000Z',
      '2026-03-29T01:15:00.000Z',
      '2026-07-01T19:00:00.000Z',
      '2026-10-24T23:30:00.000Z',
      '2026-10-25T02:30:00.000Z',
    ]) {
      expect(fromLocalInput(toLocalInput(iso, zone), zone)).toBe(iso);
    }
  });
});

describe('LeagueTime', () => {
  it('formats in Africa/Johannesburg until a league sets its zone', () => {
    const time = TestBed.inject(LeagueTime);
    expect(time.zone()).toBe('Africa/Johannesburg');
    expect(time.abbreviation()).toBe('SAST');
    expect(time.format('2026-10-09T18:45:00Z')).toBe('09 Oct 2026 · 20:45 SAST');

    time.zone.set('Europe/London');
    expect(time.abbreviationAt('2026-10-09T18:45:00Z')).toBe('BST');
    expect(time.format('2026-10-09T18:45:00Z')).toBe('09 Oct 2026 · 19:45 BST');
    expect(time.format('2026-11-09T18:45:00Z')).toBe('09 Nov 2026 · 18:45 GMT');
    expect(time.formatDate(null, 'unknown')).toBe('unknown');
    expect(time.pattern('2026-10-09T18:45:00Z', 'HH:mm z')).toBe('19:45 BST');
    expect(time.toLocalInput('2026-10-09T18:45:00Z')).toBe('2026-10-09T19:45');
    expect(time.fromLocalInput('2026-10-09T19:45')).toBe('2026-10-09T18:45:00.000Z');
    expect(time.fromLocalInput('2026-11-09T19:45')).toBe('2026-11-09T19:45:00.000Z');
  });
});
