import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LiveScoresService } from '../api/live-scores.service';
import { Profile, ProfileStore } from '../profile/profile.store';
import { CompetitionRound, Fixture } from './competition.models';
import { FixtureService, liveResult } from './fixture.service';
import { SelectedRoundService } from './selected-round.service';

const fixture = (id: string, homeAsset: string, awayAsset: string): Fixture => ({
  id,
  kickoffUtc: '2026-09-26T13:00:00Z',
  home: homeAsset,
  away: awayAsset,
  homeAsset,
  awayAsset,
  day: 'Sat',
  time: '15:00',
  venue: 'Somewhere',
});

const ROUND: CompetitionRound = {
  id: 1,
  code: '01',
  title: 'Round 1',
  dates: '26-27 Sep',
  status: 'Current',
  fixtures: [
    fixture('f-1', 'benetton-rugby', 'dragons-rfc'),
    fixture('f-2', 'dhl-stormers', 'vodacom-bulls'),
  ],
};

function setup(live: Record<string, Partial<Fixture>> = {}, teamId = 'dhl-stormers') {
  const profile = signal<Profile | null>({ displayName: 'Test Member', teamId, photo: null });
  TestBed.configureTestingModule({
    providers: [
      { provide: SelectedRoundService, useValue: { round: signal(ROUND) } },
      {
        provide: LiveScoresService,
        useValue: { merge: (f: Fixture) => ({ ...f, ...live[f.id] }) },
      },
      { provide: ProfileStore, useValue: { profile } },
    ],
  });
  return { fixtures: TestBed.inject(FixtureService), profile };
}

describe('FixtureService', () => {
  it('merges live scores into the selected round’s fixtures', () => {
    const { fixtures } = setup({ 'f-2': { state: 'live', score: '10–3', minute: 55 } });
    expect(fixtures.round()).toBe(ROUND);
    expect(fixtures.fixtures().map((f) => [f.id, f.score ?? null])).toEqual([
      ['f-1', null],
      ['f-2', '10–3'],
    ]);
    expect(fixtures.roundProvisional()).toBe(true);
  });

  it('is not provisional before kickoff or at full time', () => {
    expect(setup().fixtures.roundProvisional()).toBe(false);
    TestBed.resetTestingModule();
    const { fixtures } = setup({ 'f-1': { state: 'full_time', score: '20–20' } });
    expect(fixtures.roundProvisional()).toBe(false);
  });

  it('features the chosen fixture, else the member’s team, else the opener', () => {
    const { fixtures, profile } = setup();
    expect(fixtures.featured()?.id).toBe('f-2');
    fixtures.feature('f-1');
    expect(fixtures.featured()?.id).toBe('f-1');
    fixtures.feature('unknown');
    profile.set(null);
    expect(fixtures.featured()?.id).toBe('f-1');
  });

  it('reads a result from a live-merged fixture', () => {
    const base = ROUND.fixtures[0];
    expect(liveResult({ ...base, state: 'live', score: '10–3' })).toEqual({
      homeScore: 10,
      awayScore: 3,
      state: 'live',
    });
    expect(liveResult({ ...base, state: 'postponed', score: undefined })).toEqual({
      homeScore: 0,
      awayScore: 0,
      state: 'postponed',
    });
    expect(liveResult({ ...base, state: 'cancelled' })).toEqual({
      homeScore: 0,
      awayScore: 0,
      state: 'cancelled',
    });
    expect(liveResult({ ...base, state: 'scheduled' })).toBeNull();
    expect(liveResult(base)).toBeNull();
    expect(liveResult({ ...base, state: 'live' })).toBeNull();
  });
});
