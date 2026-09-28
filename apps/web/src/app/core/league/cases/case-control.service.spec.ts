import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../api/api-error';
import { LeagueData } from '../data/league-data';
import { CaseControlService } from './case-control.service';

function setup() {
  const data = {
    respondToCase: vi.fn().mockResolvedValue(undefined),
    reviewCase: vi.fn().mockResolvedValue(undefined),
    setStandInReviewer: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
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

  it('rules on the case as seen, and names or clears the stand-in reviewer', async () => {
    const { service, data } = setup();
    await service.review({ id: 'c-1', version: 4 }, 'dismissed', 'Visible at 0:40');
    expect(data.reviewCase).toHaveBeenCalledWith('c-1', 'dismissed', 'Visible at 0:40', 4);
    await service.setStandIn('m-2');
    await service.setStandIn(null);
    expect(data.setStandInReviewer.mock.calls).toEqual([['m-2'], [null]]);
    expect(data.reload).not.toHaveBeenCalled();
  });

  it('reloads the records when the case moved on, and passes the refusal on', async () => {
    const { service, data } = setup();
    data.reviewCase.mockRejectedValueOnce(new ApiError(409, 'stale_case', 'Changed.'));
    await expect(service.review({ id: 'c-1', version: 1 }, 'upheld', 'x')).rejects.toMatchObject({
      code: 'stale_case',
    });
    expect(data.reload).toHaveBeenCalledOnce();
    data.respondToCase.mockRejectedValueOnce(new ApiError(409, 'voting_closed', 'Closed.'));
    await expect(service.accept('c-1')).rejects.toThrow('Closed.');
    expect(data.reload).toHaveBeenCalledTimes(2);
    // Anything else is a failure to retry, with nothing to reload.
    data.respondToCase.mockRejectedValueOnce(new ApiError(0, 'offline', 'Unreachable.'));
    await expect(service.accept('c-1')).rejects.toThrow('Unreachable.');
    expect(data.reload).toHaveBeenCalledTimes(2);
  });
});
