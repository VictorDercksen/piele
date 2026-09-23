import { SampleLeagueData } from './sample-league-data';

describe('sample league data', () => {
  it('moves only the current member’s open duty to review', async () => {
    const data = new SampleLeagueData();
    await data.submitEvidence({ dutyId: 'duty-2', file: new File([], 'a.mp4'), note: '' });
    await data.submitEvidence({ dutyId: 'duty-1', file: new File([], 'b.mp4'), note: '' });
    const statuses = Object.fromEntries(data.duties().map((d) => [d.id, d.status]));
    expect(statuses['duty-2']).toBe('Awaiting review');
    expect(statuses['duty-1']).toBe('Completed');
  });

  it('counts a revised ballot once and rejects closed polls', async () => {
    const data = new SampleLeagueData();
    await data.castVote('poll-2', 'Accept correction');
    await data.castVote('poll-2', 'Abstain');
    const poll = data.polls().find((p) => p.id === 'poll-2')!;
    expect(poll.myChoice).toBe('Abstain');
    expect(poll.participants).toBe(8);
    await expect(data.castVote('poll-1', 'Accept correction')).rejects.toThrow();
    await expect(data.castVote('poll-2', 'Invented option')).rejects.toThrow();
  });
});
