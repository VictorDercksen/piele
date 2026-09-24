import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { CompetitionService } from '../../core/competition/competition.service';
import { RoundViewService } from '../../core/league/round-view.service';
import { Icon } from '../../shared/icon/icon';
import { Loader } from '../../shared/loader/loader';

/** Secondary destinations, the schedule source and service status. */
@Component({
  selector: 'app-more-page',
  templateUrl: './more.page.html',
  styleUrl: './more.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Icon, Loader],
})
export class MorePage {
  readonly view = inject(RoundViewService);
  readonly competition = inject(CompetitionService);
  readonly apiStatus = signal('');

  constructor() {
    const api = inject(ApiService);
    if (!api.configured) {
      this.apiStatus.set('Not configured');
      return;
    }
    api
      .health()
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({
        next: (health) =>
          this.apiStatus.set(
            health.database === 'ok'
              ? 'Online · database connected'
              : health.database === 'unconfigured'
                ? 'Online · database not configured'
                : 'Online · database unavailable',
          ),
        error: () => this.apiStatus.set('Unreachable'),
      });
  }
}
