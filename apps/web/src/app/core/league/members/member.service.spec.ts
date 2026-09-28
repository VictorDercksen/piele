import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Profile, ProfileStore } from '../../profile/profile.store';
import { LeagueData } from '../data/league-data';
import { Duty, FixturePicks, LeagueMember, RoundStanding } from '../league.models';
import { MemberService } from './member.service';

const member = (id: string, name: string, teamId: string): LeagueMember => ({
  id,
  name,
  fullName: name,
  initials: name.slice(0, 2).toUpperCase(),
  teamId,
  claimed: true,
  inSeason: true,
});

function setup() {
  const data = {
    currentMemberId: signal<string | null>('m-me'),
    currentMemberName: signal<string | null>('Me in the league'),
    captainMemberId: signal<string | null>('m-cap'),
    administers: signal(false),
    members: signal<readonly LeagueMember[]>([
      member('m-me', 'Me', 'munster'),
      member('m-cap', 'Cap', 'leinster'),
    ]),
    withdrawnMembers: signal<readonly LeagueMember[]>([]),
    duties: signal<readonly Pick<Duty, 'memberId'>[]>([{ memberId: 'm-duty' }]),
    standings: signal<readonly RoundStanding[]>([
      { roundId: 1, memberId: 'm-standing', rank: 1, points: 3 },
    ]),
    picks: signal<readonly Pick<FixturePicks, 'picks'>[]>([
      { picks: [{ memberId: 'm-pick' } as FixturePicks['picks'][number]] },
    ]),
  };
  const profile = signal<Profile | null>({
    displayName: 'Browser name',
    teamId: 'dhl-stormers',
    photo: 'data:image/jpeg;base64,x',
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: LeagueData, useValue: data },
      { provide: ProfileStore, useValue: { profile } },
    ],
  });
  return { members: TestBed.inject(MemberService), data, profile };
}

describe('MemberService', () => {
  it('names the member from the league, else the browser profile, else You', () => {
    const { members, data, profile } = setup();
    expect(members.memberName()).toBe('Me in the league');
    data.currentMemberName.set(null);
    expect(members.memberName()).toBe('Browser name');
    profile.set(null);
    expect(members.memberName()).toBe('You');
  });

  it('knows the captain and the admin without a membership', () => {
    const { members, data } = setup();
    expect(members.isCaptain()).toBe(false);
    expect(members.adminView()).toBe(false);
    expect(members.captainName()).toBe('Cap');
    data.captainMemberId.set('m-me');
    expect(members.isCaptain()).toBe(true);
    expect(members.captainName()).toBe('Me in the league');
    data.currentMemberId.set(null);
    expect(members.isCaptain()).toBe(false);
    expect(members.adminView()).toBe(true);
    data.captainMemberId.set('m-gone');
    expect(members.captainName()).toBeNull();
  });

  it('shows the current member first-person with their own photo and team', () => {
    const { members, profile } = setup();
    expect(members.look('m-me', 'Fallback')).toEqual({
      you: true,
      name: 'Me in the league',
      photo: 'data:image/jpeg;base64,x',
      teamId: 'dhl-stormers',
    });
    expect(members.look('m-cap', 'Fallback')).toEqual({
      you: false,
      name: 'Cap',
      photo: null,
      teamId: 'leinster',
    });
    expect(members.look('m-unknown', 'Fallback')).toEqual({
      you: false,
      name: 'Fallback',
      photo: null,
      teamId: '',
    });
    profile.set(null);
    expect(members.look('m-me', 'Fallback')).toEqual(
      expect.objectContaining({ photo: null, teamId: 'munster' }),
    );
  });

  it('finds duties, standings or picks on record for a member', () => {
    const { members } = setup();
    expect(members.hasRecords('m-duty')).toBe(true);
    expect(members.hasRecords('m-standing')).toBe(true);
    expect(members.hasRecords('m-pick')).toBe(true);
    expect(members.hasRecords('m-cap')).toBe(false);
  });
});
