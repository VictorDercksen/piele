import { SectionStatus } from '../../core/api/match-centre.models';

/** The colour family of a status pill (`.status-pill[data-tone]`). */
export type StatusTone = 'live' | 'done' | 'pending' | 'warn' | 'muted';

export interface StatusPill {
  readonly label: string;
  readonly tone: StatusTone;
}

const SECTION_PILLS: Record<Exclude<SectionStatus, 'ok'>, StatusPill> = {
  not_published: { label: 'Not published', tone: 'muted' },
  too_early: { label: 'Too early', tone: 'muted' },
  past: { label: 'Played', tone: 'muted' },
  unavailable: { label: 'Unavailable', tone: 'warn' },
};

/** A match centre section's status as a pill; `ready` names the section's data when it is in. */
export function sectionPill(status: SectionStatus, ready: string): StatusPill {
  return status === 'ok'
    ? { label: ready, tone: 'done' }
    : (SECTION_PILLS[status] ?? { label: status.replace('_', ' '), tone: 'muted' });
}
