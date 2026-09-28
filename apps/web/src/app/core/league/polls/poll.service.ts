import { Service, computed, inject } from '@angular/core';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';

/** The season's polls, the selected round's and whether the member still has to vote. */
@Service()
export class PollService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);

  /** Every poll in the season. */
  readonly seasonPolls = this.data.polls;
  readonly poll = computed(() =>
    this.data.polls().find((p) => p.roundId === this.fixtures.round().id),
  );
  readonly pollNeedsVote = computed(() => this.poll()?.status === 'Open' && !this.poll()?.myChoice);
}
