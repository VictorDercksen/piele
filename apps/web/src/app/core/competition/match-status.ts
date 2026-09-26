import { Fixture } from './competition.models';
import { DEFAULT_ZONE, zoneAbbreviation } from './league-time';

/** What the score bug shows for a fixture: before kickoff, in play or after the whistle. */
export interface ScoreBug {
  /** Replaces the hero heading, or null to keep the page's own label. */
  readonly heading: string | null;
  readonly caption: string;
  readonly value: string;
  readonly note: string;
  readonly live: boolean;
}

/** The score bug, with a kickoff time labelled in the display zone. */
export function scoreBug(fixture: Fixture, zone = DEFAULT_ZONE): ScoreBug {
  const score = fixture.score ?? '';
  switch (fixture.state) {
    case 'live':
      return {
        heading: 'LIVE',
        caption: 'LIVE',
        value: score || fixture.time,
        note:
          fixture.minute !== null && fixture.minute !== undefined
            ? `${fixture.minute}'`
            : 'IN PLAY',
        live: true,
      };
    case 'half_time':
      return { heading: 'HALF TIME', caption: 'LIVE', value: score, note: 'HALF TIME', live: true };
    case 'full_time':
      return {
        heading: 'FULL TIME',
        caption: 'RESULT',
        value: score,
        note: 'FULL TIME',
        live: false,
      };
    case 'postponed':
    case 'cancelled': {
      const label = fixture.state.toUpperCase();
      return { heading: label, caption: 'KICKOFF', value: fixture.time, note: label, live: false };
    }
    default:
      return {
        heading: null,
        caption: 'KICKOFF',
        value: fixture.time,
        note: fixture.kickoffUtc ? zoneAbbreviation(zone, fixture.kickoffUtc) : 'TIME TBC',
        live: false,
      };
  }
}

/** Short ribbon status: the minute while live, HT, FT, else the fixture's day. */
export function ribbonStatus(fixture: Fixture): string {
  switch (fixture.state) {
    case 'live':
      return fixture.minute !== null && fixture.minute !== undefined
        ? `LIVE ${fixture.minute}'`
        : 'LIVE';
    case 'half_time':
      return 'HALF TIME';
    case 'full_time':
      return 'FULL TIME';
    case 'postponed':
      return 'POSTPONED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return fixture.day;
  }
}
