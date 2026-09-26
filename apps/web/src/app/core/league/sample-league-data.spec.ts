import { TestBed } from '@angular/core/testing';
import { SampleLeagueData } from './sample-league-data';
import { SAMPLE_ACCOUNT, SAMPLE_LEAGUES } from './sample-leagues';

function sample(): SampleLeagueData {
  return TestBed.runInInjectionContext(() => new SampleLeagueData());
}

const FILE = new File([], 'a.mp4');

describe('sample league data', () => {
  it('moves only the current member’s open duty to review', async () => {
    const data = sample();
    await data.submitEvidence({ dutyIds: ['duty-2'], file: FILE, note: '' });
    await expect(data.submitEvidence({ dutyIds: ['duty-1'], file: FILE, note: '' })).rejects.toThrow();
    const display = Object.fromEntries(data.duties().map((d) => [d.id, d.display]));
    expect(display['duty-2']).toBe('under_review');
    expect(display['duty-1']).toBe('completed');
    expect(data.feed()[0].kind).toBe('evidence_submitted');
  });

  it('creates spoon duties due at the next round’s first kickoff and refuses duplicates', async () => {
    const data = sample();
    await data.createDuty({ memberId: 'member-jp', type: 'spoon', roundId: 3, deadlineAt: null, reason: '' });
    const duty = data.duties().find((d) => d.memberId === 'member-jp' && d.roundId === 3)!;
    expect(duty.deadlineAt).toBe('2026-10-23T18:45:00.000Z');
    expect(duty.title).toBe('Round 03 Spoon duty');
    expect(duty.status).toBe('open');
    await expect(
      data.createDuty({ memberId: 'member-jp', type: 'spoon', roundId: 3, deadlineAt: null, reason: '' }),
    ).rejects.toThrow(/already has a live duty/);
    await data.createDuty({ memberId: 'member-jp', type: 'spoon', roundId: 18, deadlineAt: null, reason: '' });
    expect(data.duties().find((d) => d.roundId === 18)?.status).toBe('pending_deadline');
  });

  it('accrues one mark per full week overdue and totals them per member', () => {
    const data = sample();
    const overdue = data.duties().find((d) => d.id === 'duty-4')!;
    expect(overdue.display).toBe('overdue');
    expect(overdue.marks.marks).toBeGreaterThanOrEqual(3);
    expect(overdue.marks.nextMarkAt).not.toBeNull();
    expect(data.marks().find((m) => m.memberId === 'member-as')?.marks).toBe(overdue.marks.marks);
    expect(data.duties().find((d) => d.id === 'duty-1')?.marks.marks).toBe(0);
  });

  it('accepts another member’s evidence from submission time and blocks self-review', async () => {
    const data = sample();
    await expect(data.decideEvidence('missing', 'accepted', '')).rejects.toThrow();
    await data.decideEvidence('link-3', 'accepted', 'Fine');
    const duty = data.duties().find((d) => d.id === 'duty-3')!;
    expect(duty.status).toBe('completed');
    expect(duty.completedAt).toBe('2026-10-04T10:30:00Z');
    await data.submitEvidence({ dutyIds: ['duty-2'], file: FILE, note: '' });
    const own = data.duties().find((d) => d.id === 'duty-2')!.evidence[0];
    await expect(data.decideEvidence(own.id, 'accepted', '')).rejects.toThrow(/uninvolved/);
  });

  it('voids a live duty with a reason and supersedes its pending evidence', async () => {
    const data = sample();
    await data.voidDuty('duty-3', 'Picks were found');
    const duty = data.duties().find((d) => d.id === 'duty-3')!;
    expect(duty.status).toBe('voided');
    expect(duty.evidence[0].decision).toBe('superseded');
    expect(duty.marks.marks).toBe(0);
    await expect(data.voidDuty('duty-1', 'x')).rejects.toThrow();
  });

  it('keeps marks through a challenge and resets the clock only when it is upheld', async () => {
    const data = sample();
    const before = data.duties().find((d) => d.id === 'duty-4')!;
    expect(before.marks.marks).toBeGreaterThanOrEqual(3);
    await data.resetClock('duty-4', 'Challenge upheld');
    const after = data.duties().find((d) => d.id === 'duty-4')!;
    expect(after.marks.marks).toBe(0);
    expect(after.clockResetAt).not.toBeNull();
    expect(after.display).toBe('overdue');
    expect(data.feed()[0].kind).toBe('duty_clock_reset');
    await expect(data.resetClock('duty-2', 'x')).rejects.toThrow(/uninvolved/);
    await expect(data.resetClock('duty-1', 'x')).rejects.toThrow(/open/);
  });

  it('releases a claimed name except the captain’s own', async () => {
    const data = sample();
    await data.releaseMember('member-lm');
    expect(data.members().find((m) => m.id === 'member-lm')?.claimed).toBe(false);
    await expect(data.releaseMember('member-me')).rejects.toThrow();
  });

  it('counts a revised ballot once and rejects closed polls', async () => {
    const data = sample();
    await data.castVote('poll-2', 'Accept correction');
    await data.castVote('poll-2', 'Abstain');
    const poll = data.polls().find((p) => p.id === 'poll-2')!;
    expect(poll.myChoice).toBe('Abstain');
    expect(poll.participants).toBe(8);
    await expect(data.castVote('poll-1', 'Accept correction')).rejects.toThrow();
    await expect(data.castVote('poll-2', 'Invented option')).rejects.toThrow();
  });

  it('switches every record to the chosen sample league and keeps each league’s changes', async () => {
    const data = sample();
    const [piele, pofadder] = SAMPLE_ACCOUNT.leagues;
    expect(SAMPLE_ACCOUNT.isAdmin).toBe(true);
    expect(piele.isCaptain).toBe(true);
    expect(pofadder.isCaptain).toBe(false);
    await data.releaseMember('member-lm');

    data.selectLeague(pofadder);
    expect(data.slug()).toBe('pofadder-bowl');
    expect(data.captainMemberId()).toBe('member-ds');
    expect(data.members().map((m) => m.name)).toContain('Doempie');
    expect(data.feed().at(-1)?.detail).toContain('Doempie is captain');
    expect(data.standings()).not.toEqual(SAMPLE_LEAGUES[0].standings);
    expect(data.duties().map((d) => d.id)).toEqual(['duty-pb-1', 'duty-pb-2']);

    data.selectLeague(piele);
    expect(data.captainMemberId()).toBe('member-me');
    expect(data.members().find((m) => m.id === 'member-lm')?.claimed).toBe(false);
  });
});
