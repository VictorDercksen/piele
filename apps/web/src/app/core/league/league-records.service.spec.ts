import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeagueData } from './data/league-data';
import { LeagueRecordsService } from './league-records.service';

function setup(source: 'sample' | 'api' | 'none') {
  const data = {
    source,
    loading: signal(true),
    error: signal<string | null>('The league could not be loaded.'),
    reload: vi.fn(),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { records: TestBed.inject(LeagueRecordsService), data };
}

describe('LeagueRecordsService', () => {
  it('labels sample records and passes on the loading state and reloads', () => {
    const { records, data } = setup('sample');
    expect(records.sample).toBe(true);
    expect(records.source).toBe('sample');
    expect(records.loading()).toBe(true);
    expect(records.error()).toBe('The league could not be loaded.');
    records.reload();
    expect(data.reload).toHaveBeenCalledOnce();
  });

  it('does not label API records as sample data', () => {
    const { records } = setup('api');
    expect(records.sample).toBe(false);
    expect(records.source).toBe('api');
  });
});
