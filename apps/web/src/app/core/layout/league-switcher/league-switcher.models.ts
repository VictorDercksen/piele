import { Params } from '@angular/router';
import { LeagueSummary } from '../../league/league.models';

/** A titled group of leagues in the switcher's list. */
export interface LeagueGroup {
  readonly title: string | null;
  readonly leagues: readonly LeagueSummary[];
}

/** Where choosing a league goes: its path and the query parameters kept. */
export interface LeagueTarget {
  readonly path: string;
  readonly queryParams: Params;
}
