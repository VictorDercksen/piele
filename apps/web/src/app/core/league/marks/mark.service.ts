import { Service, computed, inject } from '@angular/core';
import { ProfileStore } from '../../profile/profile.store';
import { LeagueData } from '../data/league-data';
import { MemberService } from '../members/member.service';

/** Season house marks from the API, which are authoritative and separate from Superbru points. */
@Service()
export class MarkService {
  private readonly data = inject(LeagueData);
  private readonly members = inject(MemberService);
  private readonly profile = inject(ProfileStore);

  /** Season house marks per member, with the current member first-person. */
  readonly marksTable = computed(() => {
    const me = this.profile.profile();
    const members = this.data.members();
    return this.data.marks().map((m) => {
      const you = m.memberId === this.data.currentMemberId();
      return {
        ...m,
        you,
        name: you ? this.members.memberName() : m.memberName,
        photo: you ? (me?.photo ?? null) : null,
        teamId: you
          ? (me?.teamId ?? '')
          : (members.find((member) => member.id === m.memberId)?.teamId ?? ''),
      };
    });
  });
  readonly ownMarks = computed(
    () => this.data.marks().find((m) => m.memberId === this.data.currentMemberId())?.marks ?? 0,
  );
}
