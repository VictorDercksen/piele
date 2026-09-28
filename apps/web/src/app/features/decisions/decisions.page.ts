import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { FixtureService } from '../../core/competition/fixture.service';
import { LeagueRecordsService } from '../../core/league/league-records.service';
import { PollService } from '../../core/league/polls/poll.service';
import { Icon } from '../../shared/icon/icon';
import { VoteDialog } from './vote-dialog/vote-dialog';

/** League decisions for the selected round. Only participation is shown while a vote is open. */
@Component({
  selector: 'app-decisions-page',
  templateUrl: './decisions.page.html',
  styleUrl: './decisions.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    Icon,
    VoteDialog,
    HlmButton,
  ],
})
export class DecisionsPage {
  readonly polls = inject(PollService);
  readonly fixtures = inject(FixtureService);
  readonly records = inject(LeagueRecordsService);
  readonly voteDialog = viewChild.required(VoteDialog);
  readonly turnout = computed(() => {
    const poll = this.polls.poll();
    return poll ? Math.min(100, (poll.participants / poll.eligible) * 100) : 0;
  });
}
