import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { RoundDutyView, RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** The current member's next duty and the steward's review queue. */
@Component({
  selector: 'app-next-actions',
  templateUrl: './next-actions.html',
  styleUrl: './next-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    RouterLink,
    LeaguePathPipe,
    Icon,
    NgIcon,
    HlmButton,
  ],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class NextActions {
  private readonly time = inject(LeagueTime);
  readonly view = inject(RoundViewService);
  readonly upload = output<RoundDutyView>();
  readonly duties = output<void>();
  deadline(duty: RoundDutyView): string {
    return this.time.format(duty.deadlineAt, 'Deadline to be confirmed');
  }
}
