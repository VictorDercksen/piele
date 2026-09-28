import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { PickControlService } from './pick-control.service';

function setup() {
  const data = {
    savePick: vi.fn().mockResolvedValue(undefined),
    recordPicks: vi.fn().mockResolvedValue(undefined),
    removePick: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(PickControlService), data };
}

describe('PickControlService', () => {
  it('savePick passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.savePick('f-1', { side: 'home', margin: 7 })).resolves.toEqual(undefined);
    expect(data.savePick).toHaveBeenCalledWith('f-1', { side: 'home', margin: 7 });
  });

  it('recordPicks passes through to the league', async () => {
    const { service, data } = setup();
    await expect(
      service.recordPicks('f-1', [{ memberId: 'm-1', side: 'away', margin: 3 }]),
    ).resolves.toEqual(undefined);
    expect(data.recordPicks).toHaveBeenCalledWith('f-1', [
      { memberId: 'm-1', side: 'away', margin: 3 },
    ]);
  });

  it('removePick passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.removePick('f-1', 'm-1')).resolves.toEqual(undefined);
    expect(data.removePick).toHaveBeenCalledWith('f-1', 'm-1');
  });
});
