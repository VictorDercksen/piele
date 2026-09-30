import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompetitionService } from '../../core/competition/competition.service';
import { FixtureService } from '../../core/competition/fixture.service';
import { LeagueContext } from '../../core/league/league-context';
import { LeaguePathPipe } from '../../core/league/league-path.pipe';
import { MemberService } from '../../core/league/members/member.service';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCalendarDays,
  lucideCrown,
  lucideExternalLink,
} from '@ng-icons/lucide';
import { Icon } from '../../shared/icon/icon';
import { PushCard } from './push-card/push-card';

/**
 * The league's season and captain as pills, then grouped lists: the round's destinations, the
 * season's constitution and schedule source, and push notifications for this device.
 */
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
  viewProviders: [
    provideIcons({ lucideArrowRight, lucideCalendarDays, lucideCrown, lucideExternalLink }),
  ],
})
export class MorePage {
  readonly league = inject(LeagueContext).current;
  readonly fixtures = inject(FixtureService);
  readonly members = inject(MemberService);
  readonly competition = inject(CompetitionService);
}
