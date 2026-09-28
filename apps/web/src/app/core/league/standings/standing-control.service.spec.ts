import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { StandingControlService } from './standing-control.service';

function setup() {
  const data = {
    recordStandings: vi.fn().mockResolvedValue(undefined),
    clearStanding: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(StandingControlService), data };
}

describe('StandingControlService', () => {
  it('recordStandings passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.recordStandings(1, [{ memberId: 'm-1', points: 9 }])).resolves.toEqual(
      undefined,
    );
    expect(data.recordStandings).toHaveBeenCalledWith(1, [{ memberId: 'm-1', points: 9 }]);
  });

  it('clearStanding passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.clearStanding(1, 'm-1')).resolves.toEqual(undefined);
    expect(data.clearStanding).toHaveBeenCalledWith(1, 'm-1');
  });
});
