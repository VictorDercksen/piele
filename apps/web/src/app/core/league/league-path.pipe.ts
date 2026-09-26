import { Pipe, PipeTransform, inject } from '@angular/core';
import { LeagueContext } from './league-context';

/**
 * An in-app path in the current league: `'/duties' | leaguePath` is `/piele/duties`.
 * Impure so links follow a change of league; the result is a plain string, so
 * `routerLink` sees no change while the league stays the same.
 */
@Pipe({ name: 'leaguePath', pure: false })
export class LeaguePathPipe implements PipeTransform {
  private readonly context = inject(LeagueContext);

  transform(path: string): string {
    return this.context.url(path);
  }
}
