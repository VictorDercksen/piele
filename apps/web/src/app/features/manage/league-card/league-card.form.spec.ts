import { AdminLeague } from '../../../core/league/admin/admin.models';
import { DEFAULT_RULES, withDefaultRules } from '../../../core/league/superbru';
import { resetRules, setLastRound } from '../../../shared/rules-fields/rules-form';
import { renameGroup, renamePatch, renameProblems } from './league-card.form';

const LEAGUE = {
  id: 'l-1',
  name: 'Short League',
  timezone: 'Africa/Johannesburg',
  rules: { ...DEFAULT_RULES, startingRound: 2 },
} as AdminLeague;

function filled(name = LEAGUE.name, timezone = LEAGUE.timezone) {
  const group = renameGroup();
  group.reset({ name, timezone });
  // The card moves the bound to the competition's regular rounds.
  setLastRound(group.controls.rules, 10);
  resetRules(group.controls.rules, withDefaultRules(LEAGUE.rules));
  return group;
}

describe('league card rename form', () => {
  it('sends nothing when nothing changed', () => {
    expect(renamePatch(filled(), LEAGUE)).toEqual({});
  });

  it('sends the trimmed name, the time zone and only the rules that differ', () => {
    const group = filled('  New Name ', 'Europe/London');
    group.controls.rules.controls.startingRound.setValue(3);
    expect(renamePatch(group, LEAGUE)).toEqual({
      name: 'New Name',
      timezone: 'Europe/London',
      rules: { startingRound: 3 },
    });
  });

  it('lists the problems in form order under the card id', () => {
    const group = filled('   ', 'Not/AZone');
    const problems = renameProblems(group, 'league-l-1', 10);
    expect(problems.map((problem) => problem.id)).toEqual([
      'league-l-1-rename-name',
      'league-l-1-rename-zone',
    ]);
  });

  it('bounds the starting round by the last round', () => {
    const group = filled();
    group.controls.rules.controls.startingRound.setValue(null);
    expect(renameProblems(group, 'c', 10)).toEqual([
      { id: 'c-rules-startingRound', message: 'Starting round: choose a round from 1 to 10.' },
    ]);
  });
});
