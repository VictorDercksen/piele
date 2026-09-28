import { Service, computed, inject } from '@angular/core';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';

/** The league feed: the whole season's and the selected round's. */
@Service()
export class FeedService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);

  readonly feed = computed(() =>
    this.data.feed().filter((item) => item.roundId === this.fixtures.round().id),
  );
  readonly seasonFeed = this.data.feed;
}
