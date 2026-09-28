import { Service, computed, inject, signal } from '@angular/core';
import { LiveScoresService } from '../api/live-scores.service';
import type { FixtureResult } from '../league/league.models';
import { ProfileStore } from '../profile/profile.store';
import { Fixture } from './competition.models';
import { SelectedRoundService } from './selected-round.service';

/** The selected round's fixtures with live scores, and the fixture the match centre features. */
@Service()
export class FixtureService {
  private readonly selected = inject(SelectedRoundService);
  private readonly live = inject(LiveScoresService);
  private readonly profile = inject(ProfileStore);

  readonly round = this.selected.round;
  /** The round's fixtures with live scores merged in once the round has started. */
  readonly fixtures = computed(() => this.round().fixtures.map((f) => this.live.merge(f)));
  private readonly featuredId = signal<string | null>(null);
  /** The fixture shown in the match centre: the chosen one, else the member's team, else the opener. */
  readonly featured = computed(() => {
    const fixtures = this.fixtures();
    const team = this.profile.profile()?.teamId;
    return (
      fixtures.find((f) => f.id === this.featuredId()) ??
      fixtures.find((f) => f.homeAsset === team || f.awayAsset === team) ??
      fixtures[0]
    );
  });
  /** A fixture of the selected round is live: its points are provisional. */
  readonly roundProvisional = computed(() =>
    this.fixtures().some((f) => f.state === 'live' || f.state === 'half_time'),
  );

  feature(fixtureId: string): void {
    this.featuredId.set(fixtureId);
  }
}

/**
 * A fixture's result from its live-merged state and score line: live, half time or full time
 * with a score; postponed or cancelled (void); else null.
 */
export function liveResult(fixture: Fixture): FixtureResult | null {
  const state = fixture.state;
  if (!state || state === 'scheduled') return null;
  if (state === 'postponed' || state === 'cancelled') return { homeScore: 0, awayScore: 0, state };
  const [home, away] = (fixture.score ?? '').split('–').map(Number);
  return fixture.score && Number.isFinite(home) && Number.isFinite(away)
    ? { homeScore: home, awayScore: away, state }
    : null;
}
