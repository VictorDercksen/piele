import { HlmCollapsibleTrigger } from '@spartan-ng/helm/collapsible';
import { HlmCollapsible } from '@spartan-ng/helm/collapsible';
import { HlmCollapsibleContent } from '@spartan-ng/helm/collapsible';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import {
  lucidePencil,
  lucideRotateCcw,
  lucideTrash2,
  lucideUnlink,
  lucideX,
} from '@ng-icons/lucide';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  input,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { LeagueData } from '../../../core/league/league-data';
import { LeagueMember } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Loader } from '../../../shared/loader/loader';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
const ALERT_KEYS = {
  email: 'captain-member-email',
  reinstate: 'captain-reinstate',
  addMember: 'captain-add-member',
} as const;
/** League membership, reservations, removal and reinstatement, with its own form state. */
@Component({
  selector: 'app-members-card',
  templateUrl: './members-card.html',
  styleUrl: './members-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({ lucidePencil, lucideRotateCcw, lucideTrash2, lucideUnlink, lucideX }),
  ],
  /* prettier-ignore */
  imports: [
    NgIcon,
    ReactiveFormsModule,
    Dropdown,
    Loader,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmCollapsibleTrigger,
    HlmCollapsible,
    HlmCollapsibleContent,
  ],
})
export class MembersCard {
  private readonly league = inject(LeagueData);
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  readonly view = inject(RoundViewService);
  private readonly injector = inject(Injector);
  readonly reasonDialog = input.required<ReasonDialog>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly withdrawnGroup = viewChild<ElementRef<HTMLElement>>('withdrawnGroup');
  /** Whether the add-member form's last attempt was refused, so its bad fields show. */
  readonly addAttempted = signal(false);
  /** Whether the email being edited was refused, so its input shows it. */
  readonly emailAttempted = signal(false);
  readonly memberBusy = signal<string | null>(null);
  readonly editing = signal<string | null>(null);
  readonly emailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email, Validators.maxLength(320)],
  });
  readonly newMember = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50), Validators.pattern(/\S/)],
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(320)],
    }),
  });
  readonly addingMember = signal(false);

  edit(member: LeagueMember): void {
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.emailAttempted.set(false);
    this.editing.set(member.id);
    this.emailControl.setValue(member.email ?? '');
  }

  cancelEdit(): void {
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.editing.set(null);
  }

  async saveEmail(member: LeagueMember): Promise<void> {
    if (this.emailControl.invalid) {
      this.emailAttempted.set(true);
      this.alerts.warn('Enter a valid email address.', { key: ALERT_KEYS.email });
      this.highlight(`email-${member.id}`);
      return;
    }
    this.emailAttempted.set(false);
    this.alerts.dismissKey(ALERT_KEYS.email);
    this.memberBusy.set(member.id);
    try {
      await this.league.updateMember(member.id, this.emailControl.value.trim() || null);
      this.editing.set(null);
      this.alerts.success(
        this.emailControl.value.trim()
          ? `${member.name} is reserved for ${this.emailControl.value.trim()}.`
          : `${member.name} is open for any member to claim.`,
      );
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The email could not be saved.', {
        key: ALERT_KEYS.email,
      });
    } finally {
      this.memberBusy.set(null);
    }
  }

  release(member: LeagueMember): void {
    this.reasonDialog().open({
      title: `Release ${member.name}?`,
      description: `The account that claimed ${member.name} loses access to the clubhouse and the name becomes claimable again. Duties and marks stay with ${member.name}.`,
      submitLabel: 'Release name',
      required: false,
      action: () => this.league.releaseMember(member.id),
      done: () => this.alerts.success(`${member.name} can be claimed again.`),
    });
  }

  /** Every row but the league captain's and the steward's own. The API decides the rest. */
  removable(member: LeagueMember): boolean {
    return member.id !== this.view.captainId() && member.id !== this.view.memberId();
  }

  remove(member: LeagueMember): void {
    const deleted = !member.claimed && !this.view.hasRecords(member.id);
    this.reasonDialog().open({
      title: `Remove ${member.name}?`,
      description: deleted
        ? `${member.name} comes off the team sheet. This name has no records yet and will be deleted.`
        : `${member.name} comes off the team sheet and the standings, and their open duties are voided. Their marks and past records stay, and you can reinstate them later.`,
      submitLabel: 'Remove',
      required: true,
      action: async (reason) => {
        this.memberBusy.set(member.id);
        try {
          await this.league.withdrawMember(member.id, reason);
        } finally {
          this.memberBusy.set(null);
        }
      },
      done: () => {
        this.alerts.success(
          deleted
            ? `${member.name} was deleted.`
            : `${member.name} was removed from the team sheet.`,
        );
        // The row is gone; focus moves to the withdrawn group (or the heading) instead.
        afterNextRender(
          () =>
            (
              this.withdrawnGroup()?.nativeElement.querySelector<HTMLButtonElement>(
                '.disclosure-trigger',
              ) ?? document.getElementById('members-heading')
            )?.focus(),
          { injector: this.injector },
        );
      },
    });
  }

  async reinstate(member: LeagueMember): Promise<void> {
    this.memberBusy.set(member.id);
    try {
      await this.league.reinstateMember(member.id);
      this.alerts.success(`${member.name} is back on the team sheet.`, {
        key: ALERT_KEYS.reinstate,
      });
    } catch (error) {
      this.alerts.error(
        error instanceof Error ? error.message : `${member.name} could not be reinstated.`,
        { key: ALERT_KEYS.reinstate },
      );
    } finally {
      this.memberBusy.set(null);
    }
  }

  removedOn(member: LeagueMember): string {
    return this.time.formatDate(member.leftAt, '');
  }

  async addMember(): Promise<void> {
    if (this.addingMember()) return;
    const { controls } = this.newMember;
    const problems = [
      ...(controls.name.invalid || controls.fullName.invalid
        ? [
            {
              field: controls.name.invalid ? 'name' : 'fullName',
              message: 'Give the member a nickname and full name.',
            },
          ]
        : []),
      ...(controls.email.invalid
        ? [{ field: 'email', message: 'Enter a valid email address.' }]
        : []),
    ];
    if (problems.length) {
      const [first, ...rest] = problems;
      this.addAttempted.set(true);
      this.alerts.warn(first.message, {
        key: ALERT_KEYS.addMember,
        details: rest.map((problem) => problem.message),
      });
      this.highlight(`new-member-${first.field}`);
      return;
    }
    this.addAttempted.set(false);
    this.alerts.dismissKey(ALERT_KEYS.addMember);
    const { name, fullName, email } = this.newMember.getRawValue();
    this.addingMember.set(true);
    try {
      await this.league.addMember({
        name: name.trim(),
        fullName: fullName.trim(),
        email: email.trim() || null,
      });
      this.newMember.reset();
      this.alerts.success(`${name.trim()} added to the league.`, { key: ALERT_KEYS.addMember });
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The member could not be added.', {
        key: ALERT_KEYS.addMember,
      });
    } finally {
      this.addingMember.set(false);
    }
  }

  /** Highlights an input by id once its `aria-invalid` has rendered, without moving focus. */
  private highlight(id: string): void {
    afterNextRender(
      () => highlightProblem(this.host.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`)),
      { injector: this.injector },
    );
  }
}
