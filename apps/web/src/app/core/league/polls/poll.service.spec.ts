import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FixtureService } from '../../competition/fixture.service';
import { LeagueData } from '../data/league-data';
import { Poll } from '../league.models';
import { PollService } from './poll.service';

const poll = (id: string, roundId: number, change: Partial<Poll> = {}): Poll => ({
  id,
  roundId,
  question: 'Which kit?',
  description: '',
  options: ['Home', 'Away'],
  closes: '2026-09-30T10:00:00Z',
  status: 'Open',
  participants: 1,
  eligible: 6,
  ...change,
});

function setup() {
  const polls = signal<readonly Poll[]>([poll('p-1', 1), poll('p-2', 2, { myChoice: 'Home' })]);
  const round = signal({ id: 1 });
  TestBed.configureTestingModule({
    providers: [
      { provide: LeagueData, useValue: { polls } },
      { provide: FixtureService, useValue: { round } },
    ],
  });
  return { service: TestBed.inject(PollService), polls, round };
}

describe('PollService', () => {
  it('finds the selected round’s poll and whether the member still has to vote', () => {
    const { service, polls, round } = setup();
    expect(service.poll()?.id).toBe('p-1');
    expect(service.pollNeedsVote()).toBe(true);
    round.set({ id: 2 });
    expect(service.poll()?.id).toBe('p-2');
    expect(service.pollNeedsVote()).toBe(false);
    polls.set([poll('p-1', 1, { status: 'Closed' })]);
    round.set({ id: 1 });
    expect(service.pollNeedsVote()).toBe(false);
    round.set({ id: 3 });
    expect(service.poll()).toBeUndefined();
    expect(service.pollNeedsVote()).toBe(false);
  });
});
