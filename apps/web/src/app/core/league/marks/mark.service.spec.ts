import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Profile } from '../../profile/profile.models';
import { ProfileService } from '../../profile/profile.service';
import { LeagueData } from '../data/league-data';
import { MemberMarks } from '../league.models';
import { MemberService } from '../members/member.service';
import { MarkService } from './mark.service';

function setup(currentMemberId: string | null = 'm-me') {
  const data = {
    currentMemberId: signal(currentMemberId),
    members: signal([{ id: 'm-other', teamId: 'leinster' }]),
    marks: signal<readonly MemberMarks[]>([
      { memberId: 'm-me', memberName: 'Me', marks: 4, openDuties: 0 },
      { memberId: 'm-other', memberName: 'Other', marks: -2, openDuties: 1 },
      { memberId: 'm-left', memberName: 'Left', marks: 1, openDuties: 0 },
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
      { provide: ProfileService, useValue: { profile } },
      { provide: MemberService, useValue: { memberName: signal('Test Member') } },
    ],
  });
  return { marks: TestBed.inject(MarkService), profile };
}

describe('MarkService', () => {
  it('lists house marks with the current member first-person', () => {
    const { marks } = setup();
    expect(marks.marksTable()).toEqual([
      {
        memberId: 'm-me',
        memberName: 'Me',
        marks: 4,
        openDuties: 0,
        you: true,
        name: 'Test Member',
        photo: 'data:image/jpeg;base64,x',
        teamId: 'dhl-stormers',
      },
      {
        memberId: 'm-other',
        memberName: 'Other',
        marks: -2,
        openDuties: 1,
        you: false,
        name: 'Other',
        photo: null,
        teamId: 'leinster',
      },
      expect.objectContaining({ name: 'Left', teamId: '' }),
    ]);
    expect(marks.ownMarks()).toBe(4);
  });

  it('keeps the member’s team empty without a profile and has no marks without a membership', () => {
    const { marks, profile } = setup();
    profile.set(null);
    expect(marks.marksTable()[0]).toEqual(expect.objectContaining({ photo: null, teamId: '' }));
    TestBed.resetTestingModule();
    const admin = setup(null).marks;
    expect(admin.ownMarks()).toBe(0);
    expect(admin.marksTable().some((m) => m.you)).toBe(false);
  });
});
