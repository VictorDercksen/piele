import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FixtureService } from '../competition/fixture.service';
import { DutyControlService } from './duties/duty-control.service';
import { DutyService } from './duties/duty.service';
import { FeedService } from './feed/feed.service';
import { LeagueContext } from './league-context';
import { LeagueRecordsService } from './league-records.service';
import { MarkService } from './marks/mark.service';
import { MemberService } from './members/member.service';
import { NoteService } from './notes/note.service';
import { PickControlService } from './picks/pick-control.service';
import { PickService } from './picks/pick.service';
import { PollControlService } from './polls/poll-control.service';
import { PollService } from './polls/poll.service';
import { RoundViewService } from './round-view.service';
import { RulesControlService } from './rules/rules-control.service';
import { RulesService } from './rules/rules.service';
import { StandingControlService } from './standings/standing-control.service';
import { StandingService } from './standings/standing.service';

describe('RoundViewService', () => {
  it('delegates its records and actions to the entity services', async () => {
    const standings = signal([]);
    const duties = signal([]);
    const done = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: LeagueRecordsService, useValue: { sample: true, reload: vi.fn() } },
        { provide: LeagueContext, useValue: { name: signal('Piele') } },
        { provide: FixtureService, useValue: { round: signal({ id: 2 }), feature: vi.fn() } },
        {
          provide: MemberService,
          useValue: { memberName: signal('Test Member'), hasRecords: () => true },
        },
        { provide: RulesService, useValue: {} },
        { provide: RulesControlService, useValue: { saveRules: done } },
        { provide: PickService, useValue: { myPickFor: () => null, picksFor: () => null } },
        { provide: PickControlService, useValue: { savePick: done } },
        { provide: StandingService, useValue: { standings } },
        { provide: StandingControlService, useValue: { clearStanding: done } },
        { provide: MarkService, useValue: {} },
        { provide: DutyService, useValue: { duties } },
        { provide: DutyControlService, useValue: { voidDuty: done } },
        { provide: PollService, useValue: {} },
        { provide: PollControlService, useValue: { castVote: done } },
        { provide: NoteService, useValue: {} },
        { provide: FeedService, useValue: {} },
      ],
    });
    const view = TestBed.inject(RoundViewService);
    expect(view.sample).toBe(true);
    expect(view.leagueName()).toBe('Piele');
    expect(view.round()).toEqual({ id: 2 });
    expect(view.memberName()).toBe('Test Member');
    expect(view.standings).toBe(standings);
    expect(view.duties).toBe(duties);
    expect(view.hasRecords('m-1')).toBe(true);
    expect(view.picksFor('f-1')).toBeNull();
    view.feature('f-1');
    expect(TestBed.inject(FixtureService).feature).toHaveBeenCalledWith('f-1');
    view.reload();
    expect(TestBed.inject(LeagueRecordsService).reload).toHaveBeenCalledOnce();
    await view.savePick('f-1', { side: 'home', margin: 7 });
    await view.saveRules({ startingRound: 2 });
    await view.clearStanding(1, 'm-1');
    await view.voidDuty('d-1', 'Wrong member');
    await view.castVote('p-1', 'Home');
    expect(done.mock.calls).toEqual([
      ['f-1', { side: 'home', margin: 7 }],
      [{ startingRound: 2 }],
      [1, 'm-1'],
      ['d-1', 'Wrong member'],
      ['p-1', 'Home'],
    ]);
  });
});
