import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatRelative } from '../../../core/competition/league-time';
import { feedIcon, feedLabel, feedPath } from '../../../core/league/feed-presentation';
import { FeedItem } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** One stream of league events, shown for the selected round or the whole season. */
@Component({
  selector: 'app-feed',
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
})
export class Feed {
  readonly view = inject(RoundViewService);
  readonly scope = signal<'round' | 'season'>('round');
  readonly items = computed(() =>
    (this.scope() === 'round' ? this.view.feed() : this.view.seasonFeed()).map((item) => ({
      ...item,
      icon: feedIcon(item.kind),
      label: feedLabel(item.kind),
      when: formatRelative(item.occurredAt),
      path: feedPath(item),
      roundLabel: this.roundLabel(item),
    })),
  );

  private roundLabel(item: FeedItem): string | null {
    if (item.roundId === null || this.scope() === 'round') return null;
    return `R${this.view.round().id === item.roundId ? this.view.round().code : String(item.roundId).padStart(2, '0')}`;
  }
}
