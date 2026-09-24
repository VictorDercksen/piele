import { Injectable, computed, inject, signal } from '@angular/core';
import { SelectedRoundService } from '../competition/selected-round.service';
import { ProfileStore } from '../profile/profile.store';
import { LeagueData } from './league-data';

/** League records scoped to the selected round, shared by the shell and every page. */
@Injectable({ providedIn: 'root' })
export class RoundViewService {
  private readonly league = inject(LeagueData);
  private readonly profile = inject(ProfileStore);
  private readonly selected = inject(SelectedRoundService);

  readonly sample = this.league.source === 'sample';
  readonly round = this.selected.round;
  readonly fixtures = computed(() => this.round().fixtures);
  private readonly featuredId = signal<string | null>(null);
  /** The fixture shown in the match centre: the chosen one, else the member's team, else the opener. */
  readonly featured = computed(() => {
    const fixtures = this.fixtures();
    const team = this.profile.profile()?.teamId;
    return (
      fixtures.find((f) => f.id === this.featuredId()) ??
      fixtures.find((f) => f.homeAsset === team || f.awayAsset === team) ??
      fixtures[0]
    );
  });
  readonly isCaptain = computed(
    () =>
      !!this.league.currentMemberId &&
      this.league.captainMemberId() === this.league.currentMemberId,
  );
  readonly note = computed(() => this.league.notes().find((n) => n.roundId === this.round().id));
  readonly deadline = computed(() => this.note()?.deadline ?? 'Not confirmed by the captain');
  readonly activity = computed(
    () =>
      this.note()?.activity ??
      (this.round().id <= 18
        ? `${this.fixtures().length} published fixtures. League results, duties and decisions have not been recorded.`
        : 'Playoff window published. Teams, venues and kickoffs are to be confirmed.'),
  );
  readonly standings = computed(() => {
    const members = this.league.members();
    const me = this.profile.profile();
    return this.league
      .standings()
      .filter((s) => s.roundId === this.round().id)
      .map((s) => {
        const member = members.find((m) => m.id === s.memberId);
        const you = s.memberId === this.league.currentMemberId;
        return {
          ...s,
          you,
          name: you ? (me?.displayName ?? 'You') : (member?.name ?? 'Unknown member'),
          photo: you ? (me?.photo ?? null) : null,
          teamId: you ? (me?.teamId ?? member?.teamId ?? '') : (member?.teamId ?? ''),
        };
      })
      .sort((a, b) => a.rank - b.rank);
  });
  readonly ownMarks = computed(() => this.standings().find((s) => s.you)?.marks ?? 0);
  readonly duties = computed(() =>
    this.league
      .duties()
      .filter((d) => d.roundId === this.round().id)
      .map((d) => {
        const mine = d.memberId === this.league.currentMemberId;
        return {
          ...d,
          mine,
          spoon: /\bspoon\b/i.test(d.title),
          memberName: mine
            ? (this.profile.profile()?.displayName ?? 'You')
            : (this.league.members().find((m) => m.id === d.memberId)?.name ?? 'Unknown member'),
        };
      }),
  );
  readonly myDuty = computed(() => this.duties().find((d) => d.mine));
  readonly poll = computed(() => this.league.polls().find((p) => p.roundId === this.round().id));
  readonly pollNeedsVote = computed(() => this.poll()?.status === 'Open' && !this.poll()?.myChoice);
  readonly reviews = computed(() =>
    this.league.reviews().filter((r) => r.roundId === this.round().id),
  );

  feature(fixtureId: string): void {
    this.featuredId.set(fixtureId);
  }

  submitEvidence(dutyId: string, file: File, note: string): Promise<void> {
    return this.league.submitEvidence({ dutyId, file, note });
  }

  castVote(pollId: string, choice: string): Promise<void> {
    return this.league.castVote(pollId, choice);
  }
}

export type RoundDutyView = ReturnType<RoundViewService['duties']>[number];
export type RoundStandingView = ReturnType<RoundViewService['standings']>[number];
