import { LeagueMember, StandInReviewer } from '../../../core/league/league.models';
import { SelectOption } from '../../../shared/search-select/search-select.models';

/**
 * The stand-in choices: "No stand-in", then the active members who have claimed their name,
 * other than the captain. A saved stand-in stays listed even if it no longer qualifies.
 */
export function standInOptions(
  members: readonly LeagueMember[],
  captainId: string | null,
  saved: StandInReviewer,
): SelectOption[] {
  const eligible = members
    .filter((m) => m.claimed && m.id !== captainId)
    .map((m) => ({ value: m.id, label: m.name }));
  const kept =
    saved.memberId && !eligible.some((o) => o.value === saved.memberId)
      ? [{ value: saved.memberId, label: saved.memberName ?? 'Former stand-in' }]
      : [];
  return [
    { value: '', label: 'No stand-in' },
    ...[...eligible, ...kept].sort((a, b) => a.label.localeCompare(b.label)),
  ];
}
