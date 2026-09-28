import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LeagueTime } from '../../core/competition/league-time';
import { AlertService } from '../../core/feedback/alert.service';
import { CreateDutyDialog } from '../duties/create-duty-dialog/create-duty-dialog';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { AppearanceCard } from './appearance-card/appearance-card';
import { EvidenceReview } from './evidence-review/evidence-review';
import { JoinLinkCard } from './join-link-card/join-link-card';
import { MembersCard } from './members-card/members-card';
import { PicksCard } from './picks-card/picks-card';
import { RulesCard } from './rules-card/rules-card';
/** Composes the steward's round reviews and league administration sections. */
@Component({
  selector: 'app-captain-page',
  templateUrl: './captain.page.html',
  styleUrl: './captain.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EvidenceReview,
    MembersCard,
    ReasonDialog,
    CreateDutyDialog,
    PicksCard,
    JoinLinkCard,
    AppearanceCard,
    RulesCard,
  ],
})
export class CaptainPage {
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  private readonly injector = inject(Injector);
  readonly reasonDialog = viewChild.required(ReasonDialog);
  readonly dutyDialog = viewChild.required(CreateDutyDialog);
  constructor() {
    // `/captain#picks` opens at a card: the router does not scroll to fragments by itself.
    inject(ActivatedRoute)
      .fragment.pipe(takeUntilDestroyed())
      .subscribe({
        next: (fragment) => {
          if (!fragment) return;
          afterNextRender(() => document.getElementById(fragment)?.scrollIntoView(), {
            injector: this.injector,
          });
        },
      });
  }

  dutyCreated(duty: { title: string; memberName: string; deadlineAt: string | null }): void {
    this.alerts.success(
      `${duty.title} created for ${duty.memberName}. Due ${this.time.format(duty.deadlineAt)}.`,
    );
  }
}
