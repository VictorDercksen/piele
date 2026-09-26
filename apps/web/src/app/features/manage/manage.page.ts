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
import { lucideArrowRight } from '@ng-icons/lucide';
import { AdminService } from '../../core/league/admin.service';
import { BallLoader } from '../../shared/ball-loader/ball-loader';
import { ReasonDialog } from '../duties/reason-dialog/reason-dialog';
import { CreateLeagueForm } from './create-league-form/create-league-form';
import { LeagueCard, LeagueChange } from './league-card/league-card';

/**
 * `/manage`, the management centre (the admin only; the API decides): every league with its
 * actions, archived ones in a collapsed group, and the form that starts a new league. A full
 * page outside the shell, like the profile page.
 */
@Component({
  selector: 'app-manage-page',
  templateUrl: './manage.page.html',
  styleUrl: './manage.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, BallLoader, ReasonDialog, CreateLeagueForm, LeagueCard],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class ManagePage {
  private readonly admin = inject(AdminService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly archivedGroup = viewChild<ElementRef<HTMLDetailsElement>>('archivedGroup');
  readonly dialog = viewChild.required(ReasonDialog);

  readonly leagues = this.admin.leagues;
  readonly loading = this.admin.loading;
  readonly error = this.admin.error;
  readonly active = computed(() => this.leagues().filter((l) => l.status === 'active'));
  readonly archived = computed(() => this.leagues().filter((l) => l.status === 'archived'));
  /** The last change, announced politely. */
  readonly status = signal('');

  constructor() {
    void this.admin.load();
  }

  retry(): void {
    void this.admin.load();
  }

  /** Announces a change; a league that moved group keeps the focus with it. */
  onChanged(change: LeagueChange): void {
    this.status.set(change.message);
    if (!change.moved) return;
    afterNextRender(
      () => {
        if (change.moved === 'archived') {
          this.archivedGroup()?.nativeElement.querySelector('summary')?.focus();
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
