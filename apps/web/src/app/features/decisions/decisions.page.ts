import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { RoundViewService } from '../../core/league/round-view.service';
import { Icon } from '../../shared/icon/icon';
import { VoteDialog } from './vote-dialog/vote-dialog';

/** League decisions for the selected round. Only participation is shown while a vote is open. */
@Component({
  selector: 'app-decisions-page',
  templateUrl: './decisions.page.html',
  styleUrl: './decisions.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, VoteDialog],
})
export class DecisionsPage {
  readonly view = inject(RoundViewService);
  readonly voteDialog = viewChild.required(VoteDialog);
  readonly turnout = computed(() => {
    const poll = this.view.poll();
    return poll ? Math.min(100, (poll.participants / poll.eligible) * 100) : 0;
  });
}
