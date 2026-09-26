import { httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Fixture } from '../competition/competition.models';
import { CompetitionService } from '../competition/competition.service';
import { SelectedRoundService } from '../competition/selected-round.service';
import { MatchScore, MatchState, RoundScores } from './match-centre.models';

/** Polls every 30 seconds while a match in the selected round is in play. */
export const POLL_MS = 30_000;
/** Scores are requested from shortly before kickoff, matching the API. */
const PRE_KICKOFF_MS = 15 * 60_000;
/** A match not finalised by then no longer keeps the round polling. */
const MATCH_WINDOW_MS = 3 * 60 * 60_000;
const FINISHED: ReadonlySet<MatchState> = new Set(['full_time', 'postponed', 'cancelled']);

/** True from shortly before kickoff until the match window closes. */
export function inPlayWindow(fixture: Fixture, now: number): boolean {
  if (!fixture.kickoffUtc) return false;
  const kickoff = Date.parse(fixture.kickoffUtc);
  return kickoff - PRE_KICKOFF_MS <= now && now <= kickoff + MATCH_WINDOW_MS;
}

/** How far the displayed minute may run ahead of the last reported one. */
const MAX_MINUTES_AHEAD = 5;

/**
 * The fixture with its live state and score line, when the API has reported one. While the
 * match clock runs, the minute advances by the time since the score was fetched.
 */
export function withScore(fixture: Fixture, score: MatchScore | undefined, sinceMs = 0): Fixture {
  if (!score) return fixture;
  const { home, away, state } = score;
  const scored =
    (state === 'live' || state === 'half_time' || state === 'full_time') &&
    home.score !== null &&
    away.score !== null;
  return {
    ...fixture,
    state,
    minute:
      state === 'live' && score.clockRunning && score.minute !== null
        ? score.minute + Math.min(MAX_MINUTES_AHEAD, Math.max(0, Math.floor(sinceMs / 60_000)))
        : score.minute,
    score: scored ? `${home.score}–${away.score}` : undefined,
  };
}

/**
 * Scores for the selected round from the league API. Rounds that have not started make
 * no request; a round with a match in play is polled while the page is visible.
 */
@Injectable({ providedIn: 'root' })
export class LiveScoresService {
  private readonly selected = inject(SelectedRoundService);
  private readonly competition = inject(CompetitionService);
  readonly configured = !!environment.apiUrl;
  /** Advanced on every poll tick so kickoff windows open and close. */
  private readonly now = signal(Date.now());
  /** The time of the latest poll, refreshed every 30 seconds whether or not a match is on. */
  readonly clock = this.now.asReadonly();
  /** Increments whenever a live poll fires, so pages can refresh their own live data. */
  readonly tick = signal(0);

  private readonly started = computed(() =>
    this.selected
      .round()
      .fixtures.some(
        (f) => !!f.kickoffUtc && Date.parse(f.kickoffUtc) - PRE_KICKOFF_MS <= this.now(),
      ),
  );
  private readonly resource = httpResource<RoundScores>(() =>
    this.configured && this.started()
      ? `${environment.apiUrl}/v1/competitions/${this.competition.current().id}/rounds/${this.selected.id()}/scores`
      : undefined,
  );
  /** The latest scores for the selected round, kept through a failed refresh. */
  readonly scores = linkedSignal<RoundScores | undefined, RoundScores | undefined>({
    source: () => (this.resource.hasValue() ? this.resource.value() : undefined),
    computation: (next, previous) =>
      next ?? (previous?.value?.round === this.selected.id() ? previous.value : undefined),
  });
  private readonly byFixture = computed(
    () => new Map((this.scores()?.matches ?? []).map((m) => [m.fixtureId, m])),
  );
  /** True while any fixture of the selected round is in play or about to start. */
  readonly polling = computed(
    () =>
      this.configured &&
      this.selected
        .round()
        .fixtures.some(
          (f) =>
            inPlayWindow(f, this.now()) &&
            !FINISHED.has(this.byFixture().get(f.id)?.state ?? 'scheduled'),
        ),
  );

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** The fixture with its live score merged in. */
  merge(fixture: Fixture): Fixture {
    const fetchedAt = this.scores()?.fetchedAt;
    const since = fetchedAt ? this.now() - Date.parse(fetchedAt) : 0;
    return withScore(fixture, this.byFixture().get(fixture.id), since);
  }

  private poll(): void {
    this.now.set(Date.now());
    if (!this.polling() || document.visibilityState === 'hidden') return;
    this.resource.reload();
    this.tick.update((n) => n + 1);
  }
}
