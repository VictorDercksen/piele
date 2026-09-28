import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { PollControlService } from './poll-control.service';

function setup() {
  const data = {
    castVote: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(PollControlService), data };
}

describe('PollControlService', () => {
  it('castVote passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.castVote('p-1', 'Home')).resolves.toEqual(undefined);
    expect(data.castVote).toHaveBeenCalledWith('p-1', 'Home');
  });
});
