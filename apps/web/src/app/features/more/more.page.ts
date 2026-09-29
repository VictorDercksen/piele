import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompetitionService } from '../../core/competition/competition.service';
import { FixtureService } from '../../core/competition/fixture.service';
import { LeagueTime } from '../../core/competition/league-time';
import { LeagueContext } from '../../core/league/league-context';
import { LeaguePathPipe } from '../../core/league/league-path.pipe';
import { MemberService } from '../../core/league/members/member.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideExternalLink } from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { PushCard } from './push-card/push-card';

/** Secondary destinations, push notifications for this device and the schedule source. */
@Component({
  selector: 'app-more-page',
  templateUrl: './more.page.html',
  styleUrl: './more.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    DatePipe,
    RouterLink,
    LeaguePathPipe,
    Icon,
    NgIcon,
    PushCard,
  ],
  viewProviders: [provideIcons({ lucideArrowRight, lucideExternalLink })],
})
export class MorePage {
  private readonly context = inject(LeagueContext);
  readonly fixtures = inject(FixtureService);
  readonly members = inject(MemberService);
  readonly competition = inject(CompetitionService);
  readonly league = this.context.current;
  readonly leagueName = this.context.name;
  readonly zoneName = inject(LeagueTime).abbreviation;
}
