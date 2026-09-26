import { FeedItem } from './league.models';

/** How each feed kind is shown, shared by the home feed and the notifications panel. */
export const FEED_ICONS: Record<string, string> = {
  season_opened: 'rounds',
  member_joined: 'shield',
  member_added: 'shield',
  member_left: 'close',
  member_returned: 'shield',
  emblem_updated: 'shield',
  captain_appointed: 'shield',
  league_restored: 'rounds',
  duty_created: 'duties',
  duty_voided: 'duties',
  duty_clock_reset: 'clock',
  evidence_submitted: 'upload',
  evidence_accepted: 'check',
  evidence_rejected: 'close',
  standings_recorded: 'standings',
  match_result: 'standings',
  poll_opened: 'decisions',
  poll_closed: 'decisions',
  captain_note: 'book',
};

export const FEED_LABELS: Record<string, string> = {
  season_opened: 'SEASON',
  member_joined: 'NEW MEMBER',
  member_added: 'MEMBERSHIP',
  member_left: 'MEMBER REMOVED',
  member_returned: 'MEMBER BACK',
  emblem_updated: 'NEW EMBLEM',
  captain_appointed: 'NEW CAPTAIN',
  league_restored: 'LEAGUE REOPENED',
  duty_created: 'NEW DUTY',
  duty_voided: 'DUTY VOIDED',
  duty_clock_reset: 'CHALLENGE UPHELD',
  evidence_submitted: 'EVIDENCE',
  evidence_accepted: 'DUTY COMPLETED',
  evidence_rejected: 'EVIDENCE REJECTED',
  standings_recorded: 'SUPERBRU TABLE',
  match_result: 'RESULT',
  poll_opened: 'YOUR VOICE COUNTS',
  poll_closed: 'DECISION RECORDED',
  captain_note: 'FROM THE CAPTAIN',
};

export function feedIcon(kind: string): string {
  return FEED_ICONS[kind] ?? 'rounds';
}

export function feedLabel(kind: string): string {
  return FEED_LABELS[kind] ?? kind.replace(/_/g, ' ').toUpperCase();
}

/** The page a feed item leads to, or null for items that are only news. */
export function feedPath(item: Pick<FeedItem, 'kind'>): string | null {
  if (item.kind.startsWith('duty') || item.kind.startsWith('evidence')) return '/duties';
  if (item.kind.startsWith('poll')) return '/decisions';
  if (item.kind === 'match_result' || item.kind === 'standings_recorded') return '/standings';
  return null;
}
