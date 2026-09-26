import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LeagueContext } from '../../core/league/league-context';
import { RoundViewService } from '../../core/league/round-view.service';

/**
 * Opens the captain's desk to the league's steward (its captain, or the admin) and hides it
 * from plain members. Navigation only: the API authorises every action.
 */
export const captainOnly: CanActivateFn = () =>
  inject(RoundViewService).administers() ||
  inject(Router).createUrlTree([inject(LeagueContext).url()]);
