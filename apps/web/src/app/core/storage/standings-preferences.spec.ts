import { TestBed } from '@angular/core/testing';
import { AlertService } from '../feedback/alert.service';
import { BREAKDOWN_STORAGE_KEY, StandingsPreferences } from './standings-preferences';

describe('StandingsPreferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('accepts only the stored enabled value', () => {
    const preferences = TestBed.inject(StandingsPreferences);
    for (const value of ['true', '0', '{}', 'invalid']) {
      localStorage.setItem(BREAKDOWN_STORAGE_KEY, value);
      expect(preferences.readBreakdown()).toBe(false);
    }
    preferences.saveBreakdown(true);
    expect(preferences.readBreakdown()).toBe(true);
  });

  it('reports a failed write and clears its error after a successful retry', () => {
    const preferences = TestBed.inject(StandingsPreferences);
    const alerts = TestBed.inject(AlertService);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    preferences.saveBreakdown(true);
    expect(alerts.alerts()[0]).toMatchObject({ severity: 'error', key: 'standings-preferences' });
    write.mockRestore();
    preferences.saveBreakdown(true);
    expect(alerts.alerts()).toEqual([]);
    expect(localStorage.getItem(BREAKDOWN_STORAGE_KEY)).toBe('1');
  });

  it('reports unavailable storage while falling back to the closed breakdown', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(TestBed.inject(StandingsPreferences).readBreakdown()).toBe(false);
    expect(TestBed.inject(AlertService).alerts()[0].severity).toBe('error');
  });
});
