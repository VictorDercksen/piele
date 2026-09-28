import { LeagueRules } from '../../../core/league/league.models';

/** The saved rules and last round the form starts from. */
export interface RulesBaseline {
  readonly rules: LeagueRules;
  readonly lastRound: number;
}
