import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LeagueTime } from '../../core/competition/league-time';
import { ToastService } from '../../core/feedback/toast.service';
import { RoundDutyView, RoundViewService } from '../../core/league/round-view.service';
import { Icon } from '../../shared/icon/icon';
import { CreateDutyDialog } from './create-duty-dialog/create-duty-dialog';
import { DutyCard } from './duty-card/duty-card';
import { EvidenceDialog } from './evidence-dialog/evidence-dialog';
import { ReasonDialog } from './reason-dialog/reason-dialog';

/** The selected round's duty register, filtered to the member's own duties or the league's. */
@Component({
  selector: 'app-duties-page',
  templateUrl: './duties.page.html',
  styleUrl: './duties.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, DutyCard, EvidenceDialog, CreateDutyDialog, ReasonDialog],
})
export class DutiesPage {
  private readonly toast = inject(ToastService);
  private readonly time = inject(LeagueTime);
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly createDialog = viewChild.required(CreateDutyDialog);
  readonly reasonDialog = viewChild.required(ReasonDialog);
  readonly scope = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => (params.get('scope') === 'league' ? 'league' : 'mine')),
    ),
    { initialValue: 'mine' },
  );
  readonly visibleDuties = computed(() =>
    this.scope() === 'mine' ? this.view.duties().filter((duty) => duty.mine) : this.view.duties(),
  );

  voidDuty(duty: RoundDutyView): void {
    this.reasonDialog().open({
      title: 'Void this duty?',
      description: `${duty.title} for ${duty.memberName} will be closed without marks. The register keeps the record.`,
      submitLabel: 'Void duty',
      required: true,
      action: (reason) => this.view.voidDuty(duty.id, reason),
      done: () => this.toast.show(`${duty.title} voided.`),
    });
  }

  resetClock(duty: RoundDutyView): void {
    this.reasonDialog().open({
      title: 'Challenge upheld?',
      description: `Use this only when a challenge about ${duty.title} is resolved in ${duty.memberName}'s favour. The ${duty.marks.marks} ${duty.marks.marks === 1 ? 'mark' : 'marks'} so far are cleared and the overdue clock restarts now. A challenge that fails needs nothing here: the marks kept accruing.`,
      submitLabel: 'Reset the clock',
      required: true,
      spoon: duty.spoon,
      action: (reason) => this.view.resetClock(duty.id, reason),
      done: () => this.toast.show(`${duty.title} clock reset for ${duty.memberName}.`),
    });
  }

  created(duty: { title: string; memberName: string; deadlineAt: string | null }): void {
    this.toast.show(
      `${duty.title} created for ${duty.memberName}. Due ${this.time.format(duty.deadlineAt)}.`,
    );
  }
}
