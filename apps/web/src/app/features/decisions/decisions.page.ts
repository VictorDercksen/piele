import { HlmButton } from '@spartan-ng/helm/button';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { FixtureService } from '../../core/competition/fixture.service';
import { CaseService } from '../../core/league/cases/case.service';
import { LeagueRecordsService } from '../../core/league/league-records.service';
import { PollService } from '../../core/league/polls/poll.service';
import { Icon } from '../../shared/icon/icon';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { CaseCard } from './case-card/case-card';
import { VoteDialog } from './vote-dialog/vote-dialog';

/**
 * League decisions for the selected round: its poll and the evidence under the league's
 * vote. Only participation is shown while a vote is open, never who voted how.
 */
@Component({
  selector: 'app-decisions-page',
  templateUrl: './decisions.page.html',
  styleUrl: './decisions.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    Icon,
    VoteDialog,
    ReasonDialog,
    CaseCard,
    HlmButton,
  ],
})
export class DecisionsPage {
  readonly polls = inject(PollService);
  readonly cases = inject(CaseService);
  readonly fixtures = inject(FixtureService);
  readonly records = inject(LeagueRecordsService);
  readonly voteDialog = viewChild.required(VoteDialog);
  readonly reasonDialog = viewChild.required(ReasonDialog);
  readonly turnout = computed(() => {
    const poll = this.polls.poll();
    return poll ? Math.min(100, (poll.participants / poll.eligible) * 100) : 0;
  });
}
