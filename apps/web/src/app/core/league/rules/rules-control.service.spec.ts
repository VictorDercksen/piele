import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { RulesControlService } from './rules-control.service';

function setup() {
  const data = {
    saveRules: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(RulesControlService), data };
}

describe('RulesControlService', () => {
  it('saveRules passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.saveRules({ startingRound: 2 })).resolves.toEqual(undefined);
    expect(data.saveRules).toHaveBeenCalledWith({ startingRound: 2 });
  });
});
