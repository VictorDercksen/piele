import { Injectable, computed, inject, signal } from '@angular/core';
import { Competition, CompetitionRound, FixtureLocation } from './competition.models';
import { LeagueTime } from './league-time';
import { DEFAULT_COMPETITION_ID, competition } from './registry';

/** `2026/27` becomes `26/27`, or `26 / 27` with a spaced separator. */
export function shortSeason(season: string, separator = '/'): string {
  return season
    .split('/')
    .map((part) => part.slice(-2))
    .join(separator);
}

/**
 * The current league's competition. A thin facade over `current`, which the league context
 * sets; until a league names one it is the URC. Every property reads `current` (and the
 * display zone for rounds), so templates and computeds follow a change of competition.
 */
@Injectable({ providedIn: 'root' })
export class CompetitionService {
  private readonly time = inject(LeagueTime);
  readonly current = signal<Competition>(competition(DEFAULT_COMPETITION_ID));
  private readonly currentRound = computed(() => this.current().currentRoundId());
  private readonly schedule = computed(() =>
    this.current().buildRounds(this.currentRound(), this.time.zone()),
  );

  get id(): string {
    return this.current().id;
  }

  get name(): string {
    return this.current().name;
  }

  get shortName(): string {
    return this.current().shortName;
  }

  /** `2026/27`. */
  get season(): string {
    return this.current().season;
  }

  get source(): string {
    return this.current().source;
  }

  get retrievedAt(): string {
    return this.current().retrievedAt;
  }

  get regularRounds(): number {
    return this.current().regularRounds;
  }

  /** The round in play or next up when the competition was selected. */
  get currentRoundId(): number {
    return this.currentRound();
  }

  /** Every round, displayed in the league's zone. */
  get rounds(): readonly CompetitionRound[] {
    return this.schedule();
  }

  /** Regular-season fixtures in the schedule. */
  get fixtureCount(): number {
    return this.current().fixtureCount;
  }

  /** Playoff fixtures in the schedule. */
  get playoffSlots(): number {
    return this.current().playoffSlots;
  }

  round(id: number): CompetitionRound | undefined {
    return this.rounds[id - 1];
  }

  /** The fixture with this ID and the round it belongs to. */
  locate(fixtureId: string): FixtureLocation | undefined {
    return this.current().locate(fixtureId, this.rounds);
  }
}
