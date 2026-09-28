import { HlmButton } from '@spartan-ng/helm/button';
import { HlmLabel } from '@spartan-ng/helm/label';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertService } from '../../../core/feedback/alert.service';
import { CaseControlService } from '../../../core/league/cases/case-control.service';
import { CaseService } from '../../../core/league/cases/case.service';
import { MemberService } from '../../../core/league/members/member.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Loader } from '../../../shared/loader/loader';
import { SearchSelect } from '../../../shared/search-select/search-select';
import { standInOptions } from './stand-in-card.options';

/** The key of this card's alerts, so a new attempt replaces the last one's. */
const ALERT_KEY = 'captain-stand-in';

/**
 * The stand-in reviewer on the captain's desk: the member who rules on vetoes when the captain
 * is involved (the captain's own duty, or the captain's veto). A claimed member other than the
 * captain; "No stand-in" clears it. Changes wait for "Save".
 */
@Component({
  selector: 'app-stand-in-card',
  templateUrl: './stand-in-card.html',
  styleUrl: './stand-in-card.scss',
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    Dropdown,
    Loader,
    SearchSelect,
    HlmButton,
    HlmLabel,
  ],
})
export class StandInCard {
  private readonly alerts = inject(AlertService);
  private readonly caseControl = inject(CaseControlService);
  private readonly members = inject(MemberService);
  readonly standIn = inject(CaseService).standIn;
  readonly options = computed(() =>
    standInOptions(this.members.members(), this.members.captainId(), this.standIn()),
  );
  /** The saved stand-in's id, or '' for none. */
  readonly saved = computed(() => this.standIn().memberId ?? '');
  readonly choice = new FormControl('', { nonNullable: true });
  private readonly chosen = toSignal(this.choice.valueChanges, { initialValue: this.choice.value });
  readonly changed = computed(() => this.chosen() !== this.saved());
  readonly saving = signal(false);

  constructor() {
    // The form follows the saved stand-in when it loads or changes elsewhere.
    effect(() => {
      const saved = this.saved();
      untracked(() => this.choice.setValue(saved));
    });
  }

  async save(): Promise<void> {
    if (!this.changed() || this.saving()) return;
    const memberId = this.choice.value || null;
    this.saving.set(true);
    try {
      await this.caseControl.setStandIn(memberId);
      const name = this.standIn().memberName;
      this.alerts.success(
        name
          ? `${name} is the stand-in reviewer.`
          : 'No stand-in reviewer. Vetoes that involve the captain wait for the admin.',
        { key: ALERT_KEY },
      );
    } catch (error) {
      this.alerts.error(
        error instanceof Error ? error.message : 'The stand-in reviewer was not saved.',
        { key: ALERT_KEY },
      );
    } finally {
      this.saving.set(false);
    }
  }
}
