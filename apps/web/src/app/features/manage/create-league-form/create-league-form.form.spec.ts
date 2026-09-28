import { DEFAULT_RULES } from '../../../core/league/superbru';
import { checkMembers } from '../member-rows';
import {
  captainEmailValidators,
  createLeagueGroup,
  createLeagueProblems,
  freshRepeat,
  newLeagueBody,
} from './create-league-form.form';

function valid() {
  const group = createLeagueGroup();
  group.patchValue({
    name: ' Piele ',
    slug: 'piele',
    competitionId: 'urc-2026-27',
    timezone: 'Africa/Johannesburg',
    seasonName: ' URC 2026/27 ',
    members: [{ name: 'Victor', surname: 'Dercksen', superbru: 'Doempie' }],
    captain: 'Doempie',
  });
  return group;
}

describe('create league form', () => {
  it('starts with three blank rows and Piele rules', () => {
    const group = createLeagueGroup();
    expect(group.controls.members.length).toBe(3);
    expect(group.controls.rules.controls.startingRound.value).toBe(DEFAULT_RULES.startingRound);
  });

  it('requires the captain email only for another captain', () => {
    const group = createLeagueGroup();
    const email = group.controls.captainEmail;
    expect(email.valid).toBe(true);
    email.setValidators(captainEmailValidators(false));
    email.updateValueAndValidity();
    expect(email.hasError('required')).toBe(true);
  });

  it('lists the problems in form order', () => {
    const group = createLeagueGroup();
    group.patchValue({ members: [{ name: 'Victor', surname: '', superbru: '' }] });
    const ids = createLeagueProblems(group, 18).map((problem) => problem.id);
    expect(ids).toEqual([
      'new-league-name',
      'new-league-slug',
      'new-league-competitionId',
      'new-league-timezone',
      'new-league-seasonName',
      'new-league-member-0-superbru',
      'new-league-captain',
    ]);
  });

  it('asks for a member when every row is blank', () => {
    const group = valid();
    group.controls.members.at(0).setValue({ name: '', surname: '', superbru: '' });
    expect(createLeagueProblems(group, 18)).toContainEqual({
      id: 'new-league-member-0-name',
      message: 'Add at least one member.',
    });
  });

  it('builds the request with trimmed values and no unchanged rules', () => {
    const group = valid();
    const members = checkMembers(group.controls.members.getRawValue()).members;
    expect(newLeagueBody(group, members)).toEqual({
      name: 'Piele',
      slug: 'piele',
      timezone: 'Africa/Johannesburg',
      competitionId: 'urc-2026-27',
      seasonName: 'URC 2026/27',
      members: [{ fullName: 'Victor Dercksen', displayName: 'Doempie' }],
      captainDisplayName: 'Doempie',
      captainEmail: null,
      emblemPreset: null,
      accentColour: null,
      addMe: false,
    });
  });

  it('sends another captain and the admin membership with changed rules', () => {
    const group = valid();
    group.patchValue({ captainIsMe: false, captainEmail: ' kallie@example.com ', addMe: true });
    group.controls.rules.controls.startingRound.setValue(4);
    const body = newLeagueBody(group, []);
    expect(body.captainEmail).toBe('kallie@example.com');
    expect(body.addMe).toBe(true);
    expect(body.rules).toEqual({ startingRound: 4 });
  });

  it('reports a repeated Superbru name once', () => {
    const error = { row: 1, field: 'superbru' as const, message: 'X is already member 1.', duplicate: true as const };
    const first = freshRepeat([error], new Set());
    expect(first.fresh).toBe(error);
    expect(freshRepeat([error], first.seen).fresh).toBeUndefined();
    expect(freshRepeat([], first.seen).seen.size).toBe(0);
  });
});
