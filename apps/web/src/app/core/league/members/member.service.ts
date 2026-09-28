import { Service, computed, inject } from '@angular/core';
import { ProfileService } from '../../profile/profile.service';
import { LeagueData } from '../data/league-data';
import { MemberLook } from './member.models';

/** The team sheet, the current member and the captain in the loaded league. */
@Service()
export class MemberService {
  private readonly data = inject(LeagueData);
  private readonly profile = inject(ProfileService);

  readonly memberId = this.data.currentMemberId;
  /** The league's nickname for the member, or null when the league has none for them. */
  readonly leagueMemberName = this.data.currentMemberName;
  /** The league's name for the member, else the browser profile's. */
  readonly memberName = computed(
    () => this.leagueMemberName() ?? this.profile.profile()?.displayName ?? 'You',
  );
  readonly isCaptain = computed(
    () =>
      !!this.data.currentMemberId() && this.data.captainMemberId() === this.data.currentMemberId(),
  );
  /** Captain or admin: the captain's desk and captain actions. The API decides each one. */
  readonly administers = this.data.administers;
  /** The admin in a league it holds no membership in: attributed actions need a membership. */
  readonly adminView = computed(() => !this.data.currentMemberId());
  readonly members = this.data.members;
  /** Members the steward removed this season, newest first. */
  readonly withdrawn = this.data.withdrawnMembers;
  readonly captainId = this.data.captainMemberId;
  /** The league captain's Superbru name, when the team sheet has loaded. */
  readonly captainName = computed(() => {
    const id = this.data.captainMemberId();
    return id === this.data.currentMemberId()
      ? this.memberName()
      : (this.data.members().find((m) => m.id === id)?.name ?? null);
  });

  /**
   * How a member shows: the current member first-person with their own photo and team.
   * Reads signals: call it in a computed.
   */
  look(memberId: string, fallbackName: string): MemberLook {
    const you = memberId === this.data.currentMemberId();
    const member = this.data.members().find((m) => m.id === memberId);
    const me = this.profile.profile();
    return {
      you,
      name: you ? this.memberName() : (member?.name ?? fallbackName),
      photo: you ? (me?.photo ?? null) : null,
      teamId: you ? (me?.teamId ?? member?.teamId ?? '') : (member?.teamId ?? ''),
    };
  }

  /** Whether a member has duties, picks or round standings on record in the loaded league. */
  hasRecords(memberId: string): boolean {
    return (
      this.data.duties().some((d) => d.memberId === memberId) ||
      this.data.standings().some((s) => s.memberId === memberId) ||
      this.data.picks().some((f) => f.picks.some((p) => p.memberId === memberId))
    );
  }
}
