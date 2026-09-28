import { HlmCollapsibleTrigger } from '@spartan-ng/helm/collapsible';
import { HlmCollapsible } from '@spartan-ng/helm/collapsible';
import { HlmCollapsibleContent } from '@spartan-ng/helm/collapsible';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideChevronDown, lucidePlus, lucideRotateCcw } from '@ng-icons/lucide';
import { AlertService } from '../../core/feedback/alert.service';
import { AdminService } from '../../core/league/admin.service';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { CreateLeagueForm } from './create-league-form/create-league-form';
import { LeagueCard, LeagueChange } from './league-card/league-card';

/**
 * `/manage`, the management centre (the admin only; the API decides): every league as a card
 * that opens to its details and actions, archived ones in a collapsed group, and the form that
 * starts a new league behind "Start a league" (kept while closed, so a draft survives). A full
 * page outside the shell, like the profile page.
 */
@Component({
  selector: 'app-manage-page',
  templateUrl: './manage.page.html',
  styleUrl: './manage.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    RouterLink,
    NgIcon,
    BallLoader,
    ReasonDialog,
    CreateLeagueForm,
    LeagueCard,
    HlmButton,
    HlmCollapsibleTrigger,
    HlmCollapsible,
    HlmCollapsibleContent,
  ],
  viewProviders: [
    provideIcons({ lucideArrowRight, lucideChevronDown, lucidePlus, lucideRotateCcw }),
  ],
})
export class ManagePage {
  private readonly admin = inject(AdminService);
  private readonly alerts = inject(AlertService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly archivedGroup = viewChild<ElementRef<HTMLElement>>('archivedGroup');
  readonly dialog = viewChild.required(ReasonDialog);

  readonly leagues = this.admin.leagues;
  readonly loading = this.admin.loading;
  readonly error = this.admin.error;
  readonly active = computed(() => this.leagues().filter((l) => l.status === 'active'));
  readonly archived = computed(() => this.leagues().filter((l) => l.status === 'archived'));
  /** Whether the new-league form is open. */
  readonly creating = signal(false);

  constructor() {
    void this.admin.load();
  }

  toggleCreate(): void {
    this.creating.update((open) => !open);
  }

  retry(): void {
    void this.admin.load();
  }

  /** Announces a change on a success card; a league that moved group keeps the focus with it. */
  onChanged(change: LeagueChange): void {
    this.alerts.success(change.message);
    if (!change.moved) return;
    afterNextRender(
      () => {
        if (change.moved === 'archived') {
          this.archivedGroup()
            ?.nativeElement.querySelector<HTMLButtonElement>('.disclosure-trigger')
            ?.focus();
        } else {
          this.host.nativeElement
            .querySelector<HTMLElement>(`#${CSS.escape(`league-${change.id}-name`)}`)
            ?.focus();
        }
      },
      { injector: this.injector },
    );
  }
}
