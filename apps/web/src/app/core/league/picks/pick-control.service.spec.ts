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

  it('correctPicks records the changes, then removes the cleared picks in order', async () => {
    const { service, data } = setup();
    const calls: string[] = [];
    data.recordPicks.mockImplementation(async () => void calls.push('record'));
    data.removePick.mockImplementation(async (_: string, id: string) => void calls.push(id));
    await service.correctPicks(
      'f-1',
      [{ memberId: 'm-1', side: 'draw', margin: 0 }],
      ['m-2', 'm-3'],
    );
    expect(data.recordPicks).toHaveBeenCalledWith('f-1', [
      { memberId: 'm-1', side: 'draw', margin: 0 },
    ]);
    expect(calls).toEqual(['record', 'm-2', 'm-3']);
  });

  it('correctPicks skips an empty record and stops at the first refusal', async () => {
    const { service, data } = setup();
    data.removePick.mockRejectedValueOnce(new Error('refused'));
    await expect(service.correctPicks('f-1', [], ['m-2', 'm-3'])).rejects.toThrow('refused');
    expect(data.recordPicks).not.toHaveBeenCalled();
    expect(data.removePick).toHaveBeenCalledTimes(1);
  });
});
