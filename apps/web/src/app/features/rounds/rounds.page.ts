import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CompetitionService } from '../../core/competition/competition.service';
import { jersey } from '../../core/competition/teams';
import { RoundViewService } from '../../core/league/round-view.service';
import { ProfileStore } from '../../core/profile/profile.store';
import { Icon } from '../../shared/icon/icon';

/** Published fixtures for the selected round and its house pick deadline. */
@Component({
  selector: 'app-rounds-page',
  templateUrl: './rounds.page.html',
  styleUrl: './rounds.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon],
})
export class RoundsPage {
  readonly competition = inject(CompetitionService);
  readonly view = inject(RoundViewService);
  readonly favouriteTeam = inject(ProfileStore).team;
  readonly jersey = jersey;
}
