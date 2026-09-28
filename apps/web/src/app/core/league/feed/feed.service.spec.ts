import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { FeedItem } from '../league.models';
import { FeedService } from './feed.service';

const item = (id: string, roundId: number | null): FeedItem => ({
  id,
  kind: 'captain_note',
  roundId,
  title: id,
  detail: '',
  occurredAt: '2026-09-20T10:00:00Z',
  actorName: null,
  subjectName: null,
  dutyId: null,
});

describe('FeedService', () => {
  it('keeps the whole season’s feed and scopes the round’s to the selected round', () => {
    const feed = signal<readonly FeedItem[]>([item('a', 1), item('b', 2), item('c', null)]);
    const round = signal({ id: 1 });
    TestBed.configureTestingModule({
      providers: [
        { provide: LeagueData, useValue: { feed } },
        { provide: FixtureService, useValue: { round } },
      ],
    });
    const service = TestBed.inject(FeedService);
    expect(service.seasonFeed()).toBe(feed());
    expect(service.feed().map((i) => i.id)).toEqual(['a']);
    round.set({ id: 2 });
    expect(service.feed().map((i) => i.id)).toEqual(['b']);
  });
});
