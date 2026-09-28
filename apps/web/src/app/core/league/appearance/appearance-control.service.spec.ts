import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { AppearanceControlService } from './appearance-control.service';

function setup() {
  const data = {
    saveAppearance: vi
      .fn()
      .mockResolvedValue({ emblemPreset: null, emblemUrl: null, accentColour: '#123456' }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(AppearanceControlService), data };
}

describe('AppearanceControlService', () => {
  it('saveAppearance passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.saveAppearance({ accentColour: '#123456' })).resolves.toEqual({
      emblemPreset: null,
      emblemUrl: null,
      accentColour: '#123456',
    });
    expect(data.saveAppearance).toHaveBeenCalledWith({ accentColour: '#123456' });
  });
});
