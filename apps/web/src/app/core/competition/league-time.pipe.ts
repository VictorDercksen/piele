import { Pipe, PipeTransform } from '@angular/core';
import { formatInZone } from './league-time';

/**
 * Formats an instant on a zone's clock, in place of `DatePipe` with a fixed offset:
 * `{{ at | leagueTime: 'd MMM HH:mm z' : zone() }}`. Pass the zone so a change re-renders.
 */
@Pipe({ name: 'leagueTime' })
export class LeagueTimePipe implements PipeTransform {
  transform(value: string | null | undefined, pattern: string, zone: string): string {
    return formatInZone(value, pattern, zone);
  }
}
