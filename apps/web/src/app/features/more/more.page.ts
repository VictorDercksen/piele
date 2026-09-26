import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompetitionService } from '../../core/competition/competition.service';
import { LeagueTime } from '../../core/competition/league-time';
import { LeagueContext } from '../../core/league/league-context';
import { LeaguePathPipe } from '../../core/league/league-path.pipe';
import { RoundViewService } from '../../core/league/round-view.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';

/** Secondary destinations and the schedule source. */
@Component({
  selector: 'app-more-page',
  templateUrl: './more.page.html',
  styleUrl: './more.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LeaguePathPipe, Icon, NgIcon],
  viewProviders: [provideIcons({ lucideExternalLink })],
})
export class MorePage {
  readonly view = inject(RoundViewService);
  readonly competition = inject(CompetitionService);
  readonly league = inject(LeagueContext).current;
  readonly zoneName = inject(LeagueTime).abbreviation;
}
