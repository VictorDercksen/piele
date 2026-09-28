import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompetitionService } from '../../competition/competition.service';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { RoundNote } from '../league.models';
import { NoteService } from './note.service';

function setup() {
  const round = signal({ id: 1 });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LeagueData,
        useValue: { notes: signal<readonly RoundNote[]>([{ roundId: 1, activity: 'Round one.' }]) },
      },
      { provide: FixtureService, useValue: { round, fixtures: signal([{}, {}, {}]) } },
      { provide: CompetitionService, useValue: { regularRounds: 18 } },
    ],
  });
  return { notes: TestBed.inject(NoteService), round };
}

describe('NoteService', () => {
  it('shows the round’s note, else what has been published', () => {
    const { notes, round } = setup();
    expect(notes.note()).toEqual({ roundId: 1, activity: 'Round one.' });
    expect(notes.activity()).toBe('Round one.');
    round.set({ id: 2 });
    expect(notes.note()).toBeUndefined();
    expect(notes.activity()).toBe(
      '3 published fixtures. League results, duties and decisions have not been recorded.',
    );
    round.set({ id: 19 });
    expect(notes.activity()).toBe(
      'Playoff window published. Teams, venues and kickoffs are to be confirmed.',
    );
  });
});
