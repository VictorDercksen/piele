import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { CompetitionService } from './competition.service';

/** The round every page is scoped to, kept in the `round` query parameter. */
@Injectable({ providedIn: 'root' })
export class SelectedRoundService {
  private readonly router = inject(Router);
  private readonly competition = inject(CompetitionService);
  private readonly param = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.queryParamMap.get('round')),
    ),
    { initialValue: this.router.routerState.snapshot.root.queryParamMap.get('round') },
  );
  readonly id = computed(() => {
    const value = Number(this.param());
    return Number.isInteger(value) && value >= 1 && value <= this.competition.rounds.length
      ? value
      : this.competition.currentRoundId;
  });
  readonly round = computed(() => this.competition.round(this.id())!);

  select(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > this.competition.rounds.length) return;
    void this.router.navigate([], {
      queryParams: { round: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
