import { ClubTeam, Fixture } from '../../../core/competition/competition.models';
import { FixturePicksView } from '../../../core/league/picks/pick.models';
import { StripItem } from './picks-card.models';

/**
 * A fixture's strip entry: its clubs, whether it is locked and still awaiting picks from the
 * listed members, and its pick state in words. `lockTime` formats the kickoff in the league's
 * zone.
 */
export function stripItem(
  fixture: Fixture,
  picks: Pick<FixturePicksView, 'rows' | 'locked' | 'void' | 'final' | 'provisional'> | null,
  memberIds: readonly string[],
  clubs: { readonly home: ClubTeam | undefined; readonly away: ClubTeam | undefined },
  lockTime: (kickoffUtc: NonNullable<Fixture['kickoffUtc']>) => string,
): StripItem {
  const picked = new Set(picks?.rows.map((row) => row.memberId) ?? []);
  const missing = memberIds.filter((id) => !picked.has(id)).length;
  const locked = picks?.locked ?? false;
  return {
    fixture,
    home: clubs.home,
    away: clubs.away,
    homeName: clubs.home?.shortName ?? shortName(fixture.home),
    awayName: clubs.away?.shortName ?? shortName(fixture.away),
    locked,
    awaiting: locked && missing > 0,
    status: picks?.void
      ? 'Void'
      : picks?.final
        ? 'Final'
        : picks?.provisional
          ? 'Provisional'
          : !locked
            ? fixture.kickoffUtc
              ? `Locks ${lockTime(fixture.kickoffUtc)}`
              : 'Kickoff to be confirmed'
            : missing
              ? 'Awaiting picks'
              : 'Recorded',
  };
}

/** "Sharks" from "Hollywoodbets Sharks" when the club is not in the catalogue. */
export function shortName(name: string): string {
  return name === 'To be confirmed' ? 'TBC' : (name.split(' ').at(-1) ?? name);
}
