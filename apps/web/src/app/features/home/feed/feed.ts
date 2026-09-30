import { HlmToggleGroup } from '@spartan-ng/helm/toggle-group';
import { HlmToggleGroupItem } from '@spartan-ng/helm/toggle-group';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FixtureService } from '../../../core/competition/fixture.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { feedIcon, feedLabel, feedPath } from '../../../core/league/feed-presentation';
import { FeedService } from '../../../core/league/feed/feed.service';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { FeedItem } from '../../../core/league/league.models';
import { NoteService } from '../../../core/league/notes/note.service';
import { PollService } from '../../../core/league/polls/poll.service';
import { Icon } from '../../../shared/icon/icon';

/**
 * One stream of league events, shown for the selected round or the whole season, in a list of
 * fixed height that scrolls, so switching scope does not resize the section.
 */
@Component({
  selector: 'app-feed',
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    RouterLink,
    LeaguePathPipe,
    Icon,
    HlmButton,
    HlmToggleGroup,
    HlmToggleGroupItem,
  ],
})
export class Feed {
  private readonly feed = inject(FeedService);
  private readonly fixtures = inject(FixtureService);
  readonly polls = inject(PollService);
  readonly notes = inject(NoteService);
  private readonly time = inject(LeagueTime);
  readonly round = this.fixtures.round;
  readonly scope = signal<'round' | 'season'>('round');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  readonly items = computed(() =>
    (this.scope() === 'round' ? this.feed.feed() : this.feed.seasonFeed()).map((item) => ({
      ...item,
      icon: feedIcon(item.kind),
      label: feedLabel(item.kind),
      when: this.time.relative(item.occurredAt),
      path: feedPath(item),
      roundLabel: this.roundLabel(item),
    })),
  );

  selectScope(value: unknown): void {
    if ((value !== 'round' && value !== 'season') || value === this.scope()) return;
    this.scope.set(value);
    this.list().nativeElement.scrollTop = 0;
  }

  private roundLabel(item: FeedItem): string | null {
    if (item.roundId === null || this.scope() === 'round') return null;
    return `R${this.round().id === item.roundId ? this.round().code : String(item.roundId).padStart(2, '0')}`;
  }
}
