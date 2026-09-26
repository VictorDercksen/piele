import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CompetitionService } from '../competition/competition.service';
import { RoundEvent, RoundUpdates } from './match-centre.models';

/**
 * Competition events (teamsheets, previews, kick-offs, full time) for the rounds the
 * notifications panel follows. One request per round; a failed refresh keeps the last
 * events. Members only, like previews, so it also needs Supabase sign-in.
 */
@Injectable({ providedIn: 'root' })
export class RoundUpdatesService {
  private readonly http = inject(HttpClient);
  private readonly competition = inject(CompetitionService);
  readonly configured = !!environment.apiUrl && inject(AuthService).configured;
  private readonly byRound = signal<ReadonlyMap<number, readonly RoundEvent[]>>(new Map());
  readonly events = computed<readonly RoundEvent[]>(() => [...this.byRound().values()].flat());
  private readonly failed = signal(false);
  /** True when the last refresh could not reach the API for any followed round. */
  readonly stale = this.failed.asReadonly();

  /** Fetches the given rounds and forgets rounds no longer followed. */
  async load(rounds: readonly number[]): Promise<void> {
    if (!this.configured) return;
    const base = `${environment.apiUrl}/v1/competitions/${this.competition.current().id}`;
    const results = await Promise.allSettled(
      rounds.map((round) =>
        firstValueFrom(this.http.get<RoundUpdates>(`${base}/rounds/${round}/updates`)),
      ),
    );
    this.byRound.update((previous) => {
      const next = new Map([...previous].filter(([round]) => rounds.includes(round)));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next.set(rounds[index], result.value.events);
      });
      return next;
    });
    this.failed.set(results.some((result) => result.status === 'rejected'));
  }
}
