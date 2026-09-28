import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../api/api-error';
import { LeagueData } from '../data/league-data';
import { DutyControlService } from './duty-control.service';

function setup() {
  const data = {
    createDuty: vi.fn().mockResolvedValue(undefined),
    submitEvidence: vi.fn().mockResolvedValue(undefined),
    decideEvidence: vi.fn().mockResolvedValue(undefined),
    voidDuty: vi.fn().mockResolvedValue(undefined),
    resetClock: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(DutyControlService), data };
}

describe('DutyControlService', () => {
  it('createDuty passes through to the league', async () => {
    const { service, data } = setup();
    await expect(
      service.createDuty({
        memberId: 'm-1',
        type: 'spoon',
        roundId: 1,
        deadlineAt: null,
        reason: 'Spoon',
      }),
    ).resolves.toEqual(undefined);
    expect(data.createDuty).toHaveBeenCalledWith({
      memberId: 'm-1',
      type: 'spoon',
      roundId: 1,
      deadlineAt: null,
      reason: 'Spoon',
    });
  });

  it('submitEvidence passes through to the league', async () => {
    const { service, data } = setup();
    const submission = { dutyIds: ['d-1'], file: new File(['x'], 'clip.mp4'), note: '' };
    await expect(service.submitEvidence(submission)).resolves.toEqual(undefined);
    expect(data.submitEvidence).toHaveBeenCalledWith(submission);
  });

  it('decideEvidence passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.decideEvidence('e-1', 'accepted', '')).resolves.toEqual(undefined);
    expect(data.decideEvidence).toHaveBeenCalledWith('e-1', 'accepted', '');
  });

  it('decideEvidence reloads the records when the evidence was already decided', async () => {
    const { service, data } = setup();
    data.decideEvidence.mockRejectedValueOnce(
      new ApiError(409, 'already_decided', 'This evidence was already decided.'),
    );
    await expect(service.decideEvidence('e-1', 'accepted', '')).rejects.toMatchObject({
      code: 'already_decided',
    });
    expect(data.reload).toHaveBeenCalledOnce();
    data.decideEvidence.mockRejectedValueOnce(new ApiError(0, 'offline', 'Unreachable.'));
    await expect(service.decideEvidence('e-1', 'accepted', '')).rejects.toThrow('Unreachable.');
    expect(data.reload).toHaveBeenCalledOnce();
  });

  it('voidDuty passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.voidDuty('d-1', 'Wrong member')).resolves.toEqual(undefined);
    expect(data.voidDuty).toHaveBeenCalledWith('d-1', 'Wrong member');
  });

  it('resetClock passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.resetClock('d-1', 'Challenge upheld')).resolves.toEqual(undefined);
    expect(data.resetClock).toHaveBeenCalledWith('d-1', 'Challenge upheld');
  });
});
