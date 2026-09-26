import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LeagueContext } from '../../core/league/league-context';
import { RoundViewService } from '../../core/league/round-view.service';

/** Hides the captain's desk from members. Navigation only: the API authorises every action. */
export const captainOnly: CanActivateFn = () =>
  inject(RoundViewService).isCaptain() ||
  inject(Router).createUrlTree([inject(LeagueContext).url()]);
