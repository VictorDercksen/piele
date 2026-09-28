import { Service, computed, inject } from '@angular/core';
import { LiveScoresService } from '../../api/live-scores.service';
import { CompetitionService } from '../../competition/competition.service';
import { FixtureService, liveResult } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { FixturePicks, MemberPick } from '../league.models';
import { MemberService } from '../members/member.service';
import { RulesService } from '../rules/rules.service';
import {
  isFinal,
  isScored,
  isVoided,
  orderPicks,
  roundType,
  sameTotal,
  scoreFixture,
  sway,
} from '../superbru';
import { FixturePicksView, PickRowView } from './pick.models';

/** Superbru picks by fixture, as the match page and the standings read them. */
@Service()
export class PickService {
  private readonly data = inject(LeagueData);
  private readonly fixtures = inject(FixtureService);
  private readonly members = inject(MemberService);
  private readonly rules = inject(RulesService);
  private readonly live = inject(LiveScoresService);
  private readonly competition = inject(CompetitionService);

  /** The stored picks and result of every scored fixture, by fixture id. */
  readonly byFixture = computed(
    () => new Map(this.data.picks().map((fixture) => [fixture.fixtureId, fixture])),
  );

  /** The member's own pick for a fixture, or null. Reads signals: call it in a computed. */
  myPickFor(fixtureId: string): MemberPick | null {
    return this.byFixture().get(fixtureId)?.myPick ?? null;
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
    const inRound = located.round.id === this.fixtures.round().id;
    const fixture = inRound
      ? (this.fixtures.fixtures().find((f) => f.id === fixtureId) ?? located.fixture)
      : located.fixture;
    const stored = this.byFixture().get(fixtureId);
    const result = (inRound ? liveResult(fixture) : null) ?? stored?.result ?? null;
    const kickoff = fixture.kickoffUtc;
    const locked =
      (stored?.locked ?? false) || (!!kickoff && Date.parse(kickoff) <= this.live.clock());
    const myPick = stored?.myPick ?? null;
    const hidden = !locked && !myPick && !!this.data.currentMemberId();
    const picks = hidden ? [] : visiblePicks(stored);
    const competition = this.competition.current();
    const scores = new Map(
      scoreFixture(picks, result, this.rules.rules(), roundType(located.round.id, competition)).map(
        (score) => [score.memberId, score],
      ),
    );
    const rows = orderPicks(picks).map((pick): PickRowView => {
      const score = scores.get(pick.memberId)!;
      const clubId =
        pick.side === 'home' ? fixture.homeAsset : pick.side === 'away' ? fixture.awayAsset : null;
      const club = competition.team(clubId);
      return {
        ...pick,
        ...this.members.look(pick.memberId, pick.memberName),
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
}

/** The picks a record shows: all of them, or only the member's own while the rest are hidden. */
export function visiblePicks(record: FixturePicks | undefined): readonly MemberPick[] {
  if (!record) return [];
  return record.picks.length ? record.picks : record.myPick ? [record.myPick] : [];
}
