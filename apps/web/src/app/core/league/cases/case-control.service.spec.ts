import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { CaseControlService } from './case-control.service';

function setup() {
  const data = {
    respondToCase: vi.fn().mockResolvedValue(undefined),
    reviewCase: vi.fn().mockResolvedValue(undefined),
    setStandInReviewer: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(CaseControlService), data };
}

describe('CaseControlService', () => {
  it('accepts with no reason and vetoes with one', async () => {
    const { service, data } = setup();
    await service.accept('c-1');
    await service.veto('c-1', 'Wrong round');
    expect(data.respondToCase.mock.calls).toEqual([
      ['c-1', 'accept', ''],
      ['c-1', 'veto', 'Wrong round'],
    ]);
  });

  it('rules on a veto and names or clears the stand-in reviewer', async () => {
    const { service, data } = setup();
    await service.review('c-1', 'dismissed', 'Visible at 0:40');
    expect(data.reviewCase).toHaveBeenCalledWith('c-1', 'dismissed', 'Visible at 0:40');
    await service.setStandIn('m-2');
    await service.setStandIn(null);
    expect(data.setStandInReviewer.mock.calls).toEqual([['m-2'], [null]]);
  });

  it('passes the league’s refusal on', async () => {
    const { service, data } = setup();
    data.respondToCase.mockRejectedValueOnce(new Error('Voting on this evidence has closed.'));
    await expect(service.accept('c-1')).rejects.toThrow('closed');
  });
});
