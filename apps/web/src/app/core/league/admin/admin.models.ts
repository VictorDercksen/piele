import { LeagueRules } from '../league.models';
import type { components } from '../../api/generated';

/** One league as the management centre sees it (`GET /v1/admin/leagues`). */
export type AdminLeague = Omit<components['schemas']['AdminLeague'], 'status'> & {
  readonly status: 'active' | 'archived';
};

/** A competition a new league can play (`GET /v1/competitions`). */
export type CompetitionOption = components['schemas']['CompetitionSummary'];

/** One name on a new league's team sheet. */
export type NewLeagueMember = components['schemas']['NewLeagueMember'];

/** `POST /v1/admin/leagues`: one request, one transaction. */
export type NewLeague = Omit<components['schemas']['NewLeague'], 'rules'> & {
  readonly rules?: Partial<LeagueRules>;
};

/** `PATCH /v1/admin/leagues/{id}`: fields left out stay as they are. */
/** Forms omit untouched values instead of sending null. */
export type LeagueUpdate = {
  readonly [K in keyof Omit<components['schemas']['LeagueUpdate'], 'rules'>]?: NonNullable<
    components['schemas']['LeagueUpdate'][K]
  >;
} & { readonly rules?: Partial<LeagueRules> };

/** The same patch under the contract's name. */
export type LeaguePatch = LeagueUpdate;

/** A member the admin can appoint captain: active and claimed by an account. */
export interface CaptainCandidate {
  readonly id: string;
  readonly displayName: string;
}
