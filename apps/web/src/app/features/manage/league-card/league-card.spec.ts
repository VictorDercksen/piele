import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminLeague, CompetitionOption, LeagueUpdate } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import { DEFAULT_RULES } from '../../../core/league/superbru';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { LeagueCard } from './league-card';

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

/** A competition the web registry does not know, with ten regular rounds. */
const SHORT: CompetitionOption = {
  id: 'short-cup-2027',
  name: 'Short Cup 2027',
  shortName: 'SC',
  timezone: 'Africa/Johannesburg',
  regularRounds: 10,
  lastRound: 12,
};

const LEAGUE: AdminLeague = {
  id: 'l-1',
  slug: 'short',
  name: 'Short League',
  timezone: 'Africa/Johannesburg',
  status: 'active',
  emblemPreset: null,
  emblemUrl: null,
  accentColour: null,
  joinCode: null,
  competition: { id: SHORT.id, name: SHORT.name, shortName: SHORT.shortName },
  season: { id: 's-1', name: 'SC 2027', status: 'active' },
  captain: null,
  counts: { members: 1, claimed: 1, inSeason: 1, withdrawn: 0 },
  myMemberId: 'm-1',
  createdAt: '2026-09-01T00:00:00Z',
  rules: { ...DEFAULT_RULES, startingRound: 2 },
};

describe('LeagueCard', () => {
  function setup() {
    let resolveList: (list: readonly CompetitionOption[]) => void = () => undefined;
    const list = new Promise<readonly CompetitionOption[]>((resolve) => (resolveList = resolve));
    const updates: LeagueUpdate[] = [];
    const admin = {
      competitions: () => list,
      update: (_id: string, patch: LeagueUpdate) => {
        updates.push(patch);
        return Promise.resolve(LEAGUE);
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdminService, useValue: admin },
      ],
    });
    const fixture = TestBed.createComponent(LeagueCard);
    fixture.componentRef.setInput('league', LEAGUE);
    fixture.componentRef.setInput('dialog', {} as ReasonDialog);
    const card = fixture.componentInstance;
    const startingRound = card.renameForm.controls.rules.controls.startingRound;
    return { card, startingRound, resolveList, updates };
  }

  it("bounds the starting round by the competition's regular rounds from the admin list", async () => {
    const { card, startingRound, resolveList, updates } = setup();
    card.expanded.set(true);
    card.startRename();
    await settle();
    // Until the list arrives the bound is the saved starting round: never looser.
    expect(card.lastRound()).toBe(2);
    expect(startingRound.valid).toBe(true);
    startingRound.setValue(3);
    expect(startingRound.valid).toBe(false);

    resolveList([SHORT]);
    await settle();
    expect(card.lastRound()).toBe(10);
    expect(startingRound.valid).toBe(true);
    startingRound.setValue(11);
    expect(startingRound.valid).toBe(false);
    startingRound.setValue(10);
    await card.saveRename();
    expect(updates).toEqual([{ rules: { startingRound: 10 } }]);
  });
});
