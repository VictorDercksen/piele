import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { SAMPLE_LEAGUES } from '../data/sample-leagues';
import { JoinService, joinCodeFrom } from './join.service';

describe('JoinService in the sample build', () => {
  it('answers a sample league’s join code with its unclaimed names', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    const joins = TestBed.inject(JoinService);
    const pofadder = SAMPLE_LEAGUES[1];
    const preview = await joins.preview(pofadder.joinCode);
    expect(preview.league.slug).toBe('pofadder-bowl');
    expect(preview.alreadyMember).toBe(true);
    expect(preview.unclaimed.map((n) => n.displayName)).toEqual(['Riaan']);
    await expect(joins.preview('nope')).rejects.toMatchObject({ code: 'unknown_join_code' });
  });
});

describe('joinCodeFrom', () => {
  it('takes the code from a pasted link or a bare code', () => {
    expect(joinCodeFrom('https://pavilion.test/join/abc123def456')).toBe('abc123def456');
    expect(joinCodeFrom('  abc123def456 ')).toBe('abc123def456');
    expect(joinCodeFrom('/join/abc123def456?x=1')).toBe('abc123def456');
    expect(joinCodeFrom('')).toBeNull();
    expect(joinCodeFrom('not a code')).toBeNull();
  });
});
