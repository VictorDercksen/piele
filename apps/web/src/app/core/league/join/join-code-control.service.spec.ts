import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { JoinCodeControlService } from './join-code-control.service';

function setup() {
  const data = {
    rotateJoinCode: vi.fn().mockResolvedValue('NEWCODE'),
    closeJoinCode: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(JoinCodeControlService), data };
}

describe('JoinCodeControlService', () => {
  it('rotateJoinCode passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.rotateJoinCode()).resolves.toEqual('NEWCODE');
    expect(data.rotateJoinCode).toHaveBeenCalledWith();
  });

  it('closeJoinCode passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.closeJoinCode()).resolves.toEqual(undefined);
    expect(data.closeJoinCode).toHaveBeenCalledWith();
  });
});
