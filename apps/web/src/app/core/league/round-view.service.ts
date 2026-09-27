import { Injectable, computed, inject, signal } from '@angular/core';
import { LiveScoresService } from '../api/live-scores.service';
import { CompetitionRound, Fixture } from '../competition/competition.models';
import { CompetitionService } from '../competition/competition.service';
import { SelectedRoundService } from '../competition/selected-round.service';
import { ProfileStore } from '../profile/profile.store';
import { LeagueContext } from './league-context';
import { LeagueData } from './league-data';
import {
  Duty,
  FixturePicks,
  FixtureResult,
  LeagueRules,
  MemberPick,
  NewPick,
  StandingEntry,
  StewardPick,
} from './league.models';
import {
  RoundBadges,
  RoundRow,
  SeasonRow,
  Sway,
  isFinal,
  isScored,
  isVoided,
  orderPicks,
  roundBadges,
  roundTable,
  roundType,
  sameTotal,
  scoreFixture,
  seasonTable,
  sway,
} from './superbru';

/** League records scoped to the selected round, shared by the shell and every page. */
@Injectable({ providedIn: 'root' })
export class RoundViewService {
  private readonly league = inject(LeagueData);
  private readonly profile = inject(ProfileStore);
  private readonly selected = inject(SelectedRoundService);
  private readonly live = inject(LiveScoresService);
  private readonly competition = inject(CompetitionService);
  private readonly context = inject(LeagueContext);

  readonly sample = this.league.source === 'sample';
  /** The league being shown, e.g. for "PIELE / ROUND 02" eyebrows. */
  readonly leagueName = this.context.name;
  readonly source = this.league.source;
  readonly loading = this.league.loading;
  readonly error = this.league.error;
  readonly round = this.selected.round;
  /** The round's fixtures with live scores merged in once the round has started. */
  readonly fixtures = computed(() => this.round().fixtures.map((f) => this.live.merge(f)));
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
  readonly memberId = this.league.currentMemberId;
  /** The league's name for the member, else the browser profile's. */
  readonly memberName = computed(
    () => this.league.currentMemberName() ?? this.profile.profile()?.displayName ?? 'You',
  );
  readonly isCaptain = computed(
    () =>
      !!this.league.currentMemberId() &&
      this.league.captainMemberId() === this.league.currentMemberId(),
  );
  /** Captain or admin: the captain's desk and captain actions. The API decides each one. */
  readonly administers = this.league.administers;
  /** The admin in a league it holds no membership in: attributed actions need a membership. */
  readonly adminView = computed(() => !this.league.currentMemberId());
  readonly members = this.league.members;
  /** Members the steward removed this season, newest first. */
  readonly withdrawn = this.league.withdrawnMembers;
  readonly captainId = this.league.captainMemberId;
  /** The league captain's Superbru name, when the team sheet has loaded. */
  readonly captainName = computed(() => {
    const id = this.league.captainMemberId();
    return id === this.league.currentMemberId()
      ? this.memberName()
      : (this.league.members().find((m) => m.id === id)?.name ?? null);
  });
  readonly note = computed(() => this.league.notes().find((n) => n.roundId === this.round().id));
  readonly deadline = computed(() => this.note()?.deadline ?? 'Not confirmed by the captain');
  readonly activity = computed(
    () =>
      this.note()?.activity ??
      (this.round().id <= this.competition.regularRounds
        ? `${this.fixtures().length} published fixtures. League results, duties and decisions have not been recorded.`
        : 'Playoff window published. Teams, venues and kickoffs are to be confirmed.'),
  );
  /** The season's Superbru rules. */
  readonly rules = this.league.rules;
  private readonly picksById = computed(
    () => new Map(this.league.picks().map((fixture) => [fixture.fixtureId, fixture])),
  );
  /**
   * Round tables by round id, from the starting round to the selected round: derived from the
   * picks with recorded totals applied. The selected round uses live scores. A round appears
   * once a fixture has a score or a total is recorded.
   */
  private readonly tables = computed(() => {
    const selected = this.round().id;
    const rules = this.league.rules();
    const competition = this.competition.current();
    const members = this.league.members();
    const standings = this.league.standings();
    const stored = this.picksById();
    const live = new Map(this.fixtures().map((f) => [f.id, f]));
    const tables = new Map<number, RoundRow[]>();
    for (const round of this.competition.rounds) {
      if (round.id > selected) break;
      if (round.id < rules.startingRound) continue;
      const overrides = standings.filter((s) => s.roundId === round.id);
      const fixtures = round.fixtures.map((f) => {
        const record = stored.get(f.id);
        const merged = round.id === selected ? live.get(f.id) : undefined;
        return {
          fixtureId: f.id,
          roundId: round.id,
          result: (merged && liveResult(merged)) ?? record?.result ?? null,
          picks: visiblePicks(record),
        };
      });
      if (!overrides.length && !fixtures.some((f) => isScored(f.result))) continue;
      const rows = roundTable(fixtures, members, rules, competition, overrides);
      if (rows.length) tables.set(round.id, rows);
    }
    return tables;
  });
  /**
   * The selected round's table in Superbru's order, with the member's name, photo and team,
   * `you`, the cap and spoon (once the round is complete), `complete` and the recorded
   * `override`. Empty until a fixture of the round has a score or a total is recorded.
   */
  readonly roundTable = computed<readonly RoundRowView[]>(() => {
    const rows = this.tables().get(this.round().id) ?? [];
    const badges = roundBadges(rows);
    return rows.map((row) => ({
      ...row,
      ...this.person(row.memberId, row.memberName),
      cap: badges.cap.includes(row.memberId),
      spoon: badges.spoon.includes(row.memberId),
    }));
  });
  /** The selected round's cap and spoon holders; both empty until the round is complete. */
  readonly roundBadges = computed<RoundBadges>(() =>
    roundBadges(this.tables().get(this.round().id) ?? []),
  );
  /** A fixture of the selected round is live: its points are provisional. */
  readonly roundProvisional = computed(() =>
    this.fixtures().some((f) => f.state === 'live' || f.state === 'half_time'),
  );
  /**
   * The season table up to the selected round in Superbru's order: totals, rounds counted,
   * the cap and spoon of the latest complete round and the crown for last season's champion.
   */
  readonly seasonStandings = computed<readonly SeasonRowView[]>(() =>
    seasonTable(this.tables(), this.league.rules()).map((row) => ({
      ...row,
      ...this.person(row.memberId, row.memberName),
    })),
  );
  /**
   * For the captain's desk: each active member's derived total for the selected round beside
   * the recorded one, and whether they differ (a real override).
   */
  readonly derivedVsRecorded = computed<readonly DerivedVsRecorded[]>(() => {
    const roundId = this.round().id;
    const rows = this.tables().get(roundId) ?? [];
    const recorded = this.league.standings().filter((s) => s.roundId === roundId);
    return this.league
      .members()
      .map((member) => {
        const row = rows.find((r) => r.memberId === member.id);
        const stored = recorded.find((s) => s.memberId === member.id)?.points ?? null;
        const derived = row?.derived ?? 0;
        return {
          memberId: member.id,
          ...this.person(member.id, member.name),
          rank: row?.rank ?? null,
          derived,
          recorded: stored,
          differs: stored !== null && !sameTotal(stored, derived),
        };
      })
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
  });
  /**
   * The selected round's standings as the home board and standings page show them: the
   * derived round table with recorded totals applied, in Superbru's order.
   */
  readonly standings = computed(() =>
    this.roundTable().map(({ roundId, memberId, rank, points, you, name, photo, teamId }) => ({
      roundId,
      memberId,
      rank,
      points,
      you,
      name,
      photo,
      teamId,
    })),
  );
  /** Season house marks per member, with the current member first-person. */
  readonly marksTable = computed(() => {
    const me = this.profile.profile();
    const members = this.league.members();
    return this.league.marks().map((m) => {
      const you = m.memberId === this.league.currentMemberId();
      return {
        ...m,
        you,
        name: you ? this.memberName() : m.memberName,
        photo: you ? (me?.photo ?? null) : null,
        teamId: you
          ? (me?.teamId ?? '')
          : (members.find((member) => member.id === m.memberId)?.teamId ?? ''),
      };
    });
  });
  readonly ownMarks = computed(
    () => this.league.marks().find((m) => m.memberId === this.league.currentMemberId())?.marks ?? 0,
  );
  /** Every duty in the season, decorated for display. */
  readonly seasonDuties = computed(() => this.league.duties().map((d) => this.decorate(d)));
  readonly duties = computed(() =>
    this.seasonDuties().filter((d) => d.roundId === this.round().id),
  );
  readonly myDuty = computed(
    () =>
      this.duties().find((d) => d.mine && d.status !== 'voided' && d.status !== 'completed') ??
      this.duties().find((d) => d.mine),
  );
  readonly poll = computed(() => this.league.polls().find((p) => p.roundId === this.round().id));
  readonly pollNeedsVote = computed(() => this.poll()?.status === 'Open' && !this.poll()?.myChoice);
  /** Evidence in the selected round waiting for the captain, excluding the captain's own. */
  readonly reviews = computed(() =>
    this.duties().flatMap((duty) =>
      duty.evidence
        .filter((e) => e.decision === 'pending')
        .map((evidence) => ({ duty, evidence, selfReview: duty.mine })),
    ),
  );
  readonly reviewCount = computed(() => this.reviews().filter((r) => !r.selfReview).length);
  readonly feed = computed(() =>
    this.league.feed().filter((item) => item.roundId === this.round().id),
  );
  readonly seasonFeed = this.league.feed;

  /** Whether a member has duties, picks or round standings on record in the loaded league. */
  hasRecords(memberId: string): boolean {
    return (
      this.league.duties().some((d) => d.memberId === memberId) ||
      this.league.standings().some((s) => s.memberId === memberId) ||
      this.league.picks().some((f) => f.picks.some((p) => p.memberId === memberId))
    );
  }

  /** The member's own pick for a fixture, or null. Reads signals: call it in a computed. */
  myPickFor(fixtureId: string): MemberPick | null {
    return this.picksById().get(fixtureId)?.myPick ?? null;
  }

  /**
   * One fixture's picks for the match page. `locked` once kickoff has passed; `provisional`
   * while live, `final` at full time; `recorded` once the member's own pick is in; `hidden`
   * when the member must pick before seeing the pool's picks. `rows` are the visible picks
   * from the biggest home margin to the biggest away margin, each with the member, the picked
   * club's colours and short name and its points; `sway` is how the pool leans and `myPlace`
   * the member's rank among the fixture's picks by points once it is scored. A fixture of the
   * selected round uses its live score, any other its stored result. Null for an unknown
   * fixture. Reads signals: call it in a computed.
   */
  picksFor(fixtureId: string): FixturePicksView | null {
    const located = this.competition.locate(fixtureId);
    if (!located) return null;
    const inRound = located.round.id === this.round().id;
    const fixture = inRound
      ? (this.fixtures().find((f) => f.id === fixtureId) ?? located.fixture)
      : located.fixture;
    const stored = this.picksById().get(fixtureId);
    const result = (inRound ? liveResult(fixture) : null) ?? stored?.result ?? null;
    const kickoff = fixture.kickoffUtc;
    const locked =
      (stored?.locked ?? false) || (!!kickoff && Date.parse(kickoff) <= this.live.clock());
    const myPick = stored?.myPick ?? null;
    const hidden = !locked && !myPick && !!this.league.currentMemberId();
    const picks = hidden ? [] : visiblePicks(stored);
    const competition = this.competition.current();
    const scores = new Map(
      scoreFixture(
        picks,
        result,
        this.league.rules(),
        roundType(located.round.id, competition),
      ).map((score) => [score.memberId, score]),
    );
    const rows = orderPicks(picks).map((pick): PickRowView => {
      const score = scores.get(pick.memberId)!;
      const clubId =
        pick.side === 'home' ? fixture.homeAsset : pick.side === 'away' ? fixture.awayAsset : null;
      const club = competition.team(clubId);
      return {
        ...pick,
        ...this.person(pick.memberId, pick.memberName),
        clubId: club?.id ?? null,
        clubShortName: club?.shortName ?? null,
        clubColour: club?.colour ?? null,
        clubAccent: club?.accent ?? null,
        wp: score.wp,
        mp: score.mp,
        bp: score.bp,
        points: score.points,
        distance: score.distance,
        scored: score.scored,
        correct: score.correct,
      };
    });
    const mine = myPick ? scores.get(myPick.memberId) : undefined;
    return {
      fixture,
      round: located.round,
      locked,
      provisional: isScored(result) && !isFinal(result),
      final: isFinal(result),
      void: isVoided(result),
      recorded: !!myPick,
      hidden,
      result,
      myPick,
      rows,
      sway: sway(picks),
      myPlace:
        mine?.scored && myPick?.side !== 'missed'
          ? 1 +
            rows.filter((row) => row.points > mine.points && !sameTotal(row.points, mine.points))
              .length
          : null,
    };
  }

  savePick(fixtureId: string, pick: NewPick): Promise<void> {
    return this.league.savePick(fixtureId, pick);
  }

  recordPicks(fixtureId: string, picks: readonly StewardPick[]): Promise<void> {
    return this.league.recordPicks(fixtureId, picks);
  }

  removePick(fixtureId: string, memberId: string): Promise<void> {
    return this.league.removePick(fixtureId, memberId);
  }

  saveRules(change: Partial<LeagueRules>): Promise<void> {
    return this.league.saveRules(change);
  }

  recordStandings(roundId: number, entries: readonly StandingEntry[]): Promise<void> {
    return this.league.recordStandings(roundId, entries);
  }

  clearStanding(roundId: number, memberId: string): Promise<void> {
    return this.league.clearStanding(roundId, memberId);
  }

  /** How a member shows: the current member first-person with their own photo and team. */
  private person(memberId: string, fallbackName: string): MemberLook {
    const you = memberId === this.league.currentMemberId();
    const member = this.league.members().find((m) => m.id === memberId);
    const me = this.profile.profile();
    return {
      you,
      name: you ? this.memberName() : (member?.name ?? fallbackName),
      photo: you ? (me?.photo ?? null) : null,
      teamId: you ? (me?.teamId ?? member?.teamId ?? '') : (member?.teamId ?? ''),
    };
  }

  feature(fixtureId: string): void {
    this.featuredId.set(fixtureId);
  }

  reload(): void {
    this.league.reload();
  }

  voidDuty(dutyId: string, reason: string): Promise<void> {
    return this.league.voidDuty(dutyId, reason);
  }

  resetClock(dutyId: string, reason: string): Promise<void> {
    return this.league.resetClock(dutyId, reason);
  }

  castVote(pollId: string, choice: string): Promise<void> {
    return this.league.castVote(pollId, choice);
  }

  private decorate(duty: Duty): RoundDutyView {
    const mine = duty.memberId === this.league.currentMemberId();
    return {
      ...duty,
      mine,
      spoon: duty.type === 'spoon',
      memberName: mine ? this.memberName() : duty.memberName,
      statusLabel: STATUS_LABELS[duty.display],
    };
  }
}

const STATUS_LABELS: Record<Duty['display'], string> = {
  pending_deadline: 'Deadline pending',
  open: 'Open',
  overdue: 'Overdue',
  under_review: 'Under review',
  completed: 'Completed',
  voided: 'Voided',
};

/**
 * A fixture's result from its live-merged state and score line: live, half time or full time
 * with a score; postponed or cancelled (void); else null.
 */
export function liveResult(fixture: Fixture): FixtureResult | null {
  const state = fixture.state;
  if (!state || state === 'scheduled') return null;
  if (state === 'postponed' || state === 'cancelled') return { homeScore: 0, awayScore: 0, state };
  const [home, away] = (fixture.score ?? '').split('–').map(Number);
  return fixture.score && Number.isFinite(home) && Number.isFinite(away)
    ? { homeScore: home, awayScore: away, state }
    : null;
}

/** The picks a record shows: all of them, or only the member's own while the rest are hidden. */
function visiblePicks(record: FixturePicks | undefined): readonly MemberPick[] {
  if (!record) return [];
  return record.picks.length ? record.picks : record.myPick ? [record.myPick] : [];
}

/** How a member shows in a table or pick list. */
export interface MemberLook {
  readonly you: boolean;
  readonly name: string;
  readonly photo: string | null;
  readonly teamId: string;
}

/** One pick on the match page: the member, the picked club and the pick's points. */
export interface PickRowView extends MemberPick, MemberLook {
  readonly clubId: string | null;
  readonly clubShortName: string | null;
  readonly clubColour: string | null;
  readonly clubAccent: string | null;
  readonly wp: number;
  readonly mp: number;
  readonly bp: number;
  readonly points: number;
  readonly distance: number | null;
  readonly scored: boolean;
  readonly correct: boolean;
}

/** A fixture's picks as the match page shows them (`RoundViewService.picksFor`). */
export interface FixturePicksView {
  readonly fixture: Fixture;
  readonly round: CompetitionRound;
  readonly locked: boolean;
  readonly provisional: boolean;
  readonly final: boolean;
  /** Postponed or cancelled: not scored. */
  readonly void: boolean;
  /** The member's own pick is in. */
  readonly recorded: boolean;
  /** The member must pick before the pool's picks show. */
  readonly hidden: boolean;
  readonly result: FixtureResult | null;
  readonly myPick: MemberPick | null;
  readonly rows: readonly PickRowView[];
  readonly sway: Sway;
  /** The member's rank among the fixture's picks by points, once scored. */
  readonly myPlace: number | null;
}

export interface RoundRowView extends RoundRow, MemberLook {
  readonly cap: boolean;
  readonly spoon: boolean;
}

export type SeasonRowView = SeasonRow & MemberLook;

/** A member's derived round total beside the recorded one, for the captain's desk. */
export interface DerivedVsRecorded extends MemberLook {
  readonly memberId: string;
  /** Rank in the round table, or null when the member has no line in the round. */
  readonly rank: number | null;
  readonly derived: number;
  /** The recorded total, or null. */
  readonly recorded: number | null;
  /** The recorded total differs from the derived one: an override. */
  readonly differs: boolean;
}

export interface RoundDutyView extends Duty {
  readonly mine: boolean;
  readonly spoon: boolean;
  readonly statusLabel: string;
}
export type RoundStandingView = ReturnType<RoundViewService['standings']>[number];
export type ReviewView = ReturnType<RoundViewService['reviews']>[number];
