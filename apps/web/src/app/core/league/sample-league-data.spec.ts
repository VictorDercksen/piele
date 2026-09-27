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

  it('withdraws a member off every list, voids open duties, and reinstates them', async () => {
    const data = sample();
    expect(data.administers()).toBe(true);
    await data.withdrawMember('member-lm', 'Moved to Perth');
    expect(data.members().map((m) => m.id)).not.toContain('member-lm');
    expect(data.withdrawnMembers()).toEqual([
      expect.objectContaining({ id: 'member-lm', withdrawalReason: 'Moved to Perth' }),
    ]);
    expect(data.withdrawnMembers()[0].leftAt).toBeTruthy();
    expect(data.picks().some((f) => f.picks.some((p) => p.memberId === 'member-lm'))).toBe(false);
    expect(data.duties().some((d) => d.memberId === 'member-lm')).toBe(false);
    expect(data.feed()[0]).toEqual(
      expect.objectContaining({ kind: 'member_left', title: 'Liam left the clubhouse.' }),
    );
    await expect(data.withdrawMember('member-lm', 'Again')).rejects.toMatchObject({
      code: 'already_withdrawn',
    });

    await data.reinstateMember('member-lm');
    expect(data.withdrawnMembers()).toEqual([]);
    expect(data.members().find((m) => m.id === 'member-lm')?.leftAt).toBeNull();
    expect(data.picks().some((f) => f.picks.some((p) => p.memberId === 'member-lm'))).toBe(true);
    // The open duty stays voided; marks and past records came back with the member.
    const duty = data.duties().find((d) => d.id === 'duty-3')!;
    expect(duty.status).toBe('voided');
    expect(duty.voidReason).toBe('Member withdrawn');
    expect(data.feed()[0].title).toBe('Liam is back.');
    await expect(data.reinstateMember('member-lm')).rejects.toMatchObject({ code: 'not_withdrawn' });
  });

  it('refuses to remove the captain or yourself, and deletes an unclaimed name without records', async () => {
    const data = sample();
    await expect(data.withdrawMember('member-me', 'x')).rejects.toMatchObject({
      code: 'captain_membership',
    });
    await expect(data.withdrawMember('member-lm', ' ')).rejects.toThrow(/reason/);
    data.selectLeague(SAMPLE_ACCOUNT.leagues[1]);
    await expect(data.withdrawMember('member-ds', 'x')).rejects.toMatchObject({
      code: 'captain_membership',
    });
    await expect(data.withdrawMember('member-me', 'x')).rejects.toMatchObject({
      code: 'own_membership',
    });
    await expect(data.withdrawMember('member-nobody', 'x')).rejects.toMatchObject({
      code: 'unknown_member',
    });
    const feed = data.feed().length;
    await data.withdrawMember('member-rb', 'Never joined');
    expect(data.members().some((m) => m.id === 'member-rb')).toBe(false);
    expect(data.withdrawnMembers()).toEqual([]);
    expect(data.feed().length).toBe(feed);
  });

  it('rotates and closes the join code, and the join preview follows it', async () => {
    const data = sample();
    const old = SAMPLE_LEAGUES[0].joinCode;
    expect(data.joinCode()).toBe(old);
    expect(data.preview(old).league.slug).toBe('piele');
    const code = await data.rotateJoinCode();
    expect(code).toMatch(/^[0-9a-f]{12}$/);
    expect(data.joinCode()).toBe(code);
    expect(data.preview(code).league.slug).toBe('piele');
    expect(() => data.preview(old)).toThrow(/not valid/);
    await data.closeJoinCode();
    expect(data.joinCode()).toBeNull();
    expect(() => data.preview(code)).toThrow(/not valid/);
  });

  it('saves a preset or an image and the accent colour, and names the change in the feed', async () => {
    const data = sample();
    expect(data.appearance()).toEqual({ emblemPreset: null, emblemUrl: null, accentColour: null });
    const look = await data.saveAppearance({ emblem: { preset: 'ball' }, accentColour: '#3f8f6b' });
    expect(look).toEqual({ emblemPreset: 'ball', emblemUrl: null, accentColour: '#3f8f6b' });
    expect(data.feed()[0]).toEqual(
      expect.objectContaining({ kind: 'emblem_updated', title: 'The Piele emblem was updated.' }),
    );
    const image = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(await data.saveAppearance({ emblem: { image } })).toEqual({
      emblemPreset: null,
      emblemUrl: image,
      accentColour: '#3f8f6b',
    });
    const feed = data.feed().length;
    await data.saveAppearance({ accentColour: null });
    expect(data.feed().length).toBe(feed);
    await data.saveAppearance({ emblem: null });
    expect(data.appearance()).toEqual({ emblemPreset: null, emblemUrl: null, accentColour: null });
    await expect(data.saveAppearance({ emblem: { preset: 'dragon' } })).rejects.toMatchObject({
      code: 'invalid_emblem',
    });
    await expect(data.saveAppearance({ accentColour: 'red' })).rejects.toThrow();
    // The Pofadder Bowl starts with its posts.
    data.selectLeague(SAMPLE_ACCOUNT.leagues[1]);
    expect(data.appearance()).toEqual({
      emblemPreset: 'posts',
      emblemUrl: null,
      accentColour: '#c8742a',
    });
  });

  it('shows the admin the third league without a membership', async () => {
    const data = sample();
    const third = SAMPLE_ACCOUNT.leagues[2];
    expect(third.slug).toBe('sample-third');
    expect(third.memberId).toBeNull();
    data.selectLeague(third);
    expect(data.currentMemberId()).toBeNull();
    expect(data.administers()).toBe(true);
    expect(data.joinCode()).toBe('c7d8e9f0a1b2');
    expect(data.preview('c7d8e9f0a1b2').alreadyMember).toBe(false);
    await expect(
      data.createDuty({ memberId: 'member-zd', type: 'spoon', roundId: 3, deadlineAt: null, reason: '' }),
    ).rejects.toMatchObject({ code: 'admin_not_a_member' });
    // Stewarding the team sheet needs no membership.
    await data.withdrawMember('member-ck', 'Left the club');
    expect(data.withdrawnMembers().map((m) => m.id)).toEqual(['member-ck']);
  });
  describe('picks, rules and recorded totals', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // Round 2 carries sample results; round 3 has not kicked off.
      vi.setSystemTime(Date.parse('2026-09-27T08:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    const fixture = (data: SampleLeagueData, id: string) =>
      data.picks().find((f) => f.fixtureId === id)!;

    it('lists every scheduled fixture with the sample results and the league’s picks', () => {
      const data = sample();
      const opener = fixture(data, '292584');
      expect(opener).toEqual(
        expect.objectContaining({
          roundId: 1,
          locked: true,
          result: { homeScore: 20, awayScore: 20, state: 'full_time' },
        }),
      );
      expect(opener.picks.length).toBe(6);
      expect(opener.myPick).toEqual(
        expect.objectContaining({ memberId: 'member-me', memberName: 'You', side: 'home', margin: 10 }),
      );
      expect(fixture(data, '292600')).toEqual(
        expect.objectContaining({ roundId: 3, locked: false, result: null, myPick: null, picks: [] }),
      );
      // Pick confirmation duties list the picks they cover.
      const duties = new Map(data.duties().map((d) => [d.id, d.pickFixtureIds]));
      expect(duties.get('duty-4')?.length).toBe(8);
      expect(duties.get('duty-3')).toEqual(['292592', '292596']);
      expect(duties.get('duty-2')).toEqual([]);
      expect(data.rules().previousChampionMemberId).toBe('member-jp');
      expect(data.standings()).toEqual([]);
    });

    it('hides the pool’s picks before kickoff until the member has picked', async () => {
      const data = sample();
      await data.recordPicks('292600', [{ memberId: 'member-jp', side: 'home', margin: 8 }]);
      expect(fixture(data, '292600').picks).toEqual([]);
      await data.savePick('292600', { side: 'away', margin: 3 });
      const after = fixture(data, '292600');
      expect(after.myPick).toEqual(expect.objectContaining({ side: 'away', margin: 3, isDefault: false }));
      expect(after.picks.map((p) => p.memberName).sort()).toEqual(['Johan', 'You']);
      await data.savePick('292600', { side: 'draw', margin: 0 });
      expect(fixture(data, '292600').picks.length).toBe(2);

      await expect(data.savePick('292584', { side: 'home', margin: 3 })).rejects.toMatchObject({
        code: 'picks_locked',
      });
      await expect(data.savePick('292600', { side: 'home', margin: 0 })).rejects.toMatchObject({
        code: 'invalid_pick',
      });
      await expect(data.savePick('nope', { side: 'home', margin: 3 })).rejects.toMatchObject({
        code: 'unknown_fixture',
      });
    });

    it('lets the steward record, correct and remove any pick, and refuses bad ones', async () => {
      const data = sample();
      await data.recordPicks('292584', [
        { memberId: 'member-as', side: 'away', margin: 4, isDefault: true, dutyId: 'duty-4' },
      ]);
      expect(fixture(data, '292584').picks.find((p) => p.memberId === 'member-as')).toEqual(
        expect.objectContaining({ side: 'away', margin: 4, isDefault: true, dutyId: 'duty-4' }),
      );
      const link = () => fixture(data, '292584').picks.find((p) => p.memberId === 'member-as')?.dutyId;
      // Like the API: an omitted dutyId keeps the link, an explicit null clears it.
      await data.recordPicks('292584', [{ memberId: 'member-as', side: 'away', margin: 6, isDefault: true }]);
      expect(link()).toBe('duty-4');
      await data.recordPicks('292584', [
        { memberId: 'member-as', side: 'away', margin: 6, isDefault: true, dutyId: null },
      ]);
      expect(link()).toBeNull();
      await expect(
        data.recordPicks('292584', [
          { memberId: 'member-as', side: 'home', margin: 1 },
          { memberId: 'member-as', side: 'home', margin: 2 },
        ]),
      ).rejects.toMatchObject({ code: 'duplicate_member' });
      await expect(
        data.recordPicks('292584', [{ memberId: 'member-x', side: 'home', margin: 1 }]),
      ).rejects.toMatchObject({ code: 'unknown_member' });
      await expect(
        data.recordPicks('292584', [{ memberId: 'member-as', side: 'draw', margin: 0, isDefault: true }]),
      ).rejects.toMatchObject({ code: 'invalid_pick' });
      await expect(
        data.recordPicks('292584', [{ memberId: 'member-jp', side: 'home', margin: 1, dutyId: 'duty-4' }]),
      ).rejects.toMatchObject({ code: 'unknown_duty' });
      await data.removePick('292584', 'member-as');
      expect(fixture(data, '292584').picks.some((p) => p.memberId === 'member-as')).toBe(false);
    });

    it('links a new pick confirmation duty to its fixtures, recording missed picks', async () => {
      const data = sample();
      await data.createDuty({
        memberId: 'member-jp',
        type: 'pick_confirmation',
        roundId: 3,
        deadlineAt: null,
        reason: 'Picks missing.',
        pickFixtureIds: ['292600'],
      });
      const duty = data.duties().find((d) => d.memberId === 'member-jp' && d.roundId === 3)!;
      expect(duty.pickFixtureIds).toEqual(['292600']);
      await data.savePick('292600', { side: 'home', margin: 2 });
      expect(fixture(data, '292600').picks.find((p) => p.memberId === 'member-jp')).toEqual(
        expect.objectContaining({ side: 'missed', margin: null, dutyId: duty.id }),
      );
    });

    it('saves the rules with a feed item and validates them', async () => {
      const data = sample();
      await data.saveRules({ bonusPointSplit: false, winPoints: { final: 4 } as never });
      expect(data.rules()).toEqual(
        expect.objectContaining({
          bonusPointSplit: false,
          winPoints: { regular: 1, quarterFinal: 1.5, semiFinal: 2, final: 4 },
          previousChampionMemberId: 'member-jp',
        }),
      );
      expect(data.feed()[0]).toEqual(
        expect.objectContaining({ kind: 'rules_updated', title: 'Superbru rules updated.' }),
      );
      expect(data.account().leagues.find((l) => l.slug === 'piele')?.rules.bonusPointSplit).toBe(false);
      await expect(data.saveRules({ marginPoint: -1 })).rejects.toMatchObject({ code: 'validation' });
      await expect(data.saveRules({ startingRound: 99 })).rejects.toMatchObject({ code: 'validation' });
      await expect(data.saveRules({ previousChampionMemberId: 'member-x' })).rejects.toMatchObject({
        code: 'unknown_member',
      });
    });

    it('records a round’s totals over the derived ones and clears one', async () => {
      const data = sample();
      await data.recordStandings(1, [
        { memberId: 'member-pw', points: 15.5 },
        { memberId: 'member-fb', points: 3 },
      ]);
      expect(data.standings()).toEqual([
        { roundId: 1, memberId: 'member-pw', rank: 1, points: 15.5 },
        { roundId: 1, memberId: 'member-fb', rank: 2, points: 3 },
      ]);
      expect(data.feed()[0]).toEqual(
        expect.objectContaining({
          kind: 'standings_recorded',
          title: 'Round 01 Superbru standings updated.',
          detail: 'PieterW leads on 15.5 points.',
        }),
      );
      await data.clearStanding(1, 'member-fb');
      expect(data.standings().map((s) => s.memberId)).toEqual(['member-pw']);
    });

    it('shows the admin every pick in a league it is not in, but takes no pick from it', async () => {
      const data = sample();
      data.selectLeague(SAMPLE_ACCOUNT.leagues[0]);
      await data.recordPicks('292600', [{ memberId: 'member-jp', side: 'home', margin: 8 }]);
      data.selectLeague(SAMPLE_ACCOUNT.leagues[2]);
      expect(data.picks().every((f) => f.picks.length === 0)).toBe(true);
      await expect(data.savePick('292600', { side: 'home', margin: 1 })).rejects.toMatchObject({
        code: 'admin_not_a_member',
      });
      await data.recordPicks('292600', [{ memberId: 'member-hm', side: 'away', margin: 2 }]);
      expect(fixture(data, '292600').picks.map((p) => p.memberName)).toEqual(['Hennie']);
    });
  });
});
