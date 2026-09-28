import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TeamsheetsSection } from '../../../core/api/match-centre.models';
import { Fixture } from '../../../core/competition/competition.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueTimePipe } from '../../../core/competition/league-time.pipe';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { PlayerList } from '../player-list/player-list';
import { sheetView } from '../teamsheet';

/** Club teamsheets with ages and artwork, reset whenever the fixture changes. */
@Component({
  selector: 'app-teamsheets-panel',
  templateUrl: './teamsheets-panel.html',
  styleUrl: './teamsheets-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    DecimalPipe,
    LeagueTimePipe,
    Dropdown,
    PlayerList,
  ],
})
export class TeamsheetsPanel {
  private readonly competition = inject(CompetitionService);
  readonly zone = inject(LeagueTime).zone;
  readonly fixture = input.required<Fixture>();
  readonly section = input.required<TeamsheetsSection>();
  readonly kickoff = input<string | null>(null);
  readonly sheets = computed(() => {
    const fixture = this.fixture();
    const section = this.section();
    if (section.status !== 'ok' || !section.home || !section.away) return null;
    const kickoff = this.kickoff() ?? fixture.kickoffUtc;
    return [
      sheetView(this.competition.current(), fixture.home, fixture.homeAsset, section.home, kickoff),
      sheetView(this.competition.current(), fixture.away, fixture.awayAsset, section.away, kickoff),
    ];
  });
  readonly message = computed(() =>
    this.section().status === 'not_published'
      ? 'Teamsheets are usually published about 48 hours before kickoff.'
      : `The ${this.competition.shortName} match centre could not be reached. Try again later.`,
  );
}
