import { Service, computed, inject } from '@angular/core';
import { CompetitionService } from '../../competition/competition.service';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';

/** The selected round's note and its activity line. */
@Service()
export class NoteService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);
  private readonly competition = inject(CompetitionService);

  readonly note = computed(() =>
    this.data.notes().find((n) => n.roundId === this.fixtures.round().id),
  );
  readonly activity = computed(
    () =>
      this.note()?.activity ??
      (this.fixtures.round().id <= this.competition.regularRounds
        ? `${this.fixtures.fixtures().length} published fixtures. League results, duties and decisions have not been recorded.`
        : 'Playoff window published. Teams, venues and kickoffs are to be confirmed.'),
  );
}
