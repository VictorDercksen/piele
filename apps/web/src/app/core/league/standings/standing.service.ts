import { Service, computed, inject } from '@angular/core';
import { CompetitionService } from '../../competition/competition.service';
import { FixtureService, liveResult } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { MemberService } from '../members/member.service';
import { PickService, visiblePicks } from '../picks/pick.service';
import { RulesService } from '../rules/rules.service';
import {
  RoundBadges,
  RoundRow,
  isScored,
  roundBadges,
  roundTable,
  sameTotal,
  seasonTable,
} from '../superbru';
import {
  DerivedVsRecorded,
  RoundRowView,
  RoundStandingView,
  SeasonRowView,
} from './standing.models';

/** Round and season tables derived from the picks, with recorded totals applied. */
@Service()
export class StandingService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);
  private readonly picks = inject(PickService);
  private readonly members = inject(MemberService);
  private readonly rules = inject(RulesService);
  private readonly competition = inject(CompetitionService);

  /**
   * Round tables by round id, from the starting round to the selected round: derived from the
   * picks with recorded totals applied. The selected round uses live scores. A round appears
   * once a fixture has a score or a total is recorded.
   */
  private readonly tables = computed(() => {
    const selected = this.fixtures.round().id;
    const rules = this.rules.rules();
    const competition = this.competition.current();
    const members = this.data.members();
    const standings = this.data.standings();
    const stored = this.picks.byFixture();
    const live = new Map(this.fixtures.fixtures().map((f) => [f.id, f]));
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
    const rows = this.tables().get(this.fixtures.round().id) ?? [];
    const badges = roundBadges(rows);
    return rows.map((row) => ({
      ...row,
      ...this.members.look(row.memberId, row.memberName),
      cap: badges.cap.includes(row.memberId),
      spoon: badges.spoon.includes(row.memberId),
    }));
  });
  /** The selected round's cap and spoon holders; both empty until the round is complete. */
  readonly roundBadges = computed<RoundBadges>(() =>
    roundBadges(this.tables().get(this.fixtures.round().id) ?? []),
  );
  /**
   * The season table up to the selected round in Superbru's order: totals, rounds counted,
   * the cap and spoon of the latest complete round and the crown for last season's champion.
   */
  readonly seasonStandings = computed<readonly SeasonRowView[]>(() =>
    seasonTable(this.tables(), this.rules.rules()).map((row) => ({
      ...row,
      ...this.members.look(row.memberId, row.memberName),
    })),
  );
  /**
   * For the captain's desk: each active member in the season (the only ones the API records
   * totals for) with their derived total for the selected round beside the recorded one, and
   * whether they differ (a real override).
   */
  readonly derivedVsRecorded = computed<readonly DerivedVsRecorded[]>(() => {
    const roundId = this.fixtures.round().id;
    const rows = this.tables().get(roundId) ?? [];
    const recorded = this.data.standings().filter((s) => s.roundId === roundId);
    return this.data
      .members()
      .filter((member) => member.inSeason)
      .map((member) => {
        const row = rows.find((r) => r.memberId === member.id);
        const stored = recorded.find((s) => s.memberId === member.id)?.points ?? null;
        const derived = row?.derived ?? 0;
        return {
          memberId: member.id,
          ...this.members.look(member.id, member.name),
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
  readonly standings = computed<readonly RoundStandingView[]>(() =>
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
}
