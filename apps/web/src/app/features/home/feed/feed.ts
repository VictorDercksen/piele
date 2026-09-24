import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatRelative } from '../../../core/competition/league-time';
import { FeedItem } from '../../../core/league/league.models';
import { RoundViewService } from '../../../core/league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

const ICONS: Record<string, string> = {
  season_opened: 'rounds',
  member_joined: 'shield',
  member_added: 'shield',
  duty_created: 'duties',
  duty_voided: 'duties',
  evidence_submitted: 'upload',
  evidence_accepted: 'check',
  evidence_rejected: 'close',
  match_result: 'standings',
  poll_opened: 'decisions',
  poll_closed: 'decisions',
  captain_note: 'book',
};

const LABELS: Record<string, string> = {
  season_opened: 'SEASON',
  member_joined: 'NEW MEMBER',
  member_added: 'MEMBERSHIP',
  duty_created: 'NEW DUTY',
  duty_voided: 'DUTY VOIDED',
  evidence_submitted: 'EVIDENCE',
  evidence_accepted: 'DUTY COMPLETED',
  evidence_rejected: 'EVIDENCE REJECTED',
  match_result: 'RESULT',
  poll_opened: 'YOUR VOICE COUNTS',
  poll_closed: 'DECISION RECORDED',
  captain_note: 'FROM THE CAPTAIN',
};

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
      icon: ICONS[item.kind] ?? 'rounds',
      label: LABELS[item.kind] ?? item.kind.replace(/_/g, ' ').toUpperCase(),
      when: formatRelative(item.occurredAt),
      path: pathFor(item),
      roundLabel: this.roundLabel(item),
    })),
  );

  private roundLabel(item: FeedItem): string | null {
    if (item.roundId === null || this.scope() === 'round') return null;
    return `R${this.view.round().id === item.roundId ? this.view.round().code : String(item.roundId).padStart(2, '0')}`;
  }
}

function pathFor(item: FeedItem): string | null {
  if (item.kind.startsWith('duty') || item.kind.startsWith('evidence')) return '/duties';
  if (item.kind.startsWith('poll')) return '/decisions';
  if (item.kind === 'match_result') return '/standings';
  return null;
}
