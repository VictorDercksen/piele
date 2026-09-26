import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideRefreshCw } from '@ng-icons/lucide';
import { ToastService } from '../../../core/feedback/toast.service';
import { LeagueContext } from '../../../core/league/league-context';
import { LeagueData } from '../../../core/league/league-data';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';

/**
 * The league's join link on the captain's desk: copy it, rotate it (the old link stops
 * working) or close joining. A closed league offers "Open joining", which makes a new link.
 */
@Component({
  selector: 'app-join-link-card',
  templateUrl: './join-link-card.html',
  styleUrl: './join-link-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, NgIcon, Loader],
  viewProviders: [provideIcons({ lucideCopy, lucideRefreshCw })],
})
export class JoinLinkCard {
  private readonly league = inject(LeagueData);
  private readonly toast = inject(ToastService);
  private readonly origin = inject(DOCUMENT).location.origin;
  readonly leagueName = inject(LeagueContext).name;
  /** The captain's desk's confirmation dialog. */
  readonly dialog = input.required<ReasonDialog>();
  readonly code = this.league.joinCode;
  readonly link = computed(() => {
    const code = this.code();
    return code ? `${this.origin}/join/${code}` : null;
  });
  readonly copied = signal(false);
  readonly copyError = signal('');
  readonly opening = signal(false);
  readonly error = signal('');
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  async copy(): Promise<void> {
    const link = this.link();
    if (!link) return;
    this.copyError.set('');
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 4000);
    } catch {
      this.copied.set(false);
      this.copyError.set('This browser did not allow copying. Select the link and copy it.');
    }
  }

  /** Selects the whole link, for copying by hand. */
  select(event: Event): void {
    if (event.target instanceof HTMLInputElement) event.target.select();
  }

  rotate(): void {
    this.dialog().open({
      title: 'Make a new join link?',
      description:
        'The current link stops working straight away. Send the new link to anyone who still has to claim a name.',
      submitLabel: 'Make a new link',
      required: false,
      noReason: true,
      action: async () => {
        this.copied.set(false);
        await this.league.rotateJoinCode();
      },
      done: () => this.toast.show('A new join link is ready. The old one no longer works.'),
    });
  }

  closeJoining(): void {
    this.dialog().open({
      title: 'Close joining?',
      description: `The join link stops working and nobody new can claim a name in ${this.leagueName()} until you open joining again. Members keep their places.`,
      submitLabel: 'Close joining',
      required: false,
      noReason: true,
      action: async () => {
        this.copied.set(false);
        await this.league.closeJoinCode();
      },
      done: () => this.toast.show('Joining is closed.'),
    });
  }

  /** Joining reopens with a new link; the old one stays dead. */
  async openJoining(): Promise<void> {
    this.opening.set(true);
    this.error.set('');
    try {
      await this.league.rotateJoinCode();
      this.toast.show('Joining is open with a new link.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Joining could not be opened.');
    } finally {
      this.opening.set(false);
    }
  }
}
