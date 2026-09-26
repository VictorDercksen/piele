import { CompetitionRef } from './league.models';

/** One league as the management centre sees it (`GET /v1/admin/leagues`). */
export interface AdminLeague {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly timezone: string;
  readonly status: 'active' | 'archived';
  readonly emblemPreset: string | null;
  readonly emblemUrl: string | null;
  readonly accentColour: string | null;
  /** Null when joining is closed. */
  readonly joinCode: string | null;
  readonly competition: CompetitionRef;
  /** The active season; null when the league has none. */
  readonly season: { readonly id: string; readonly name: string; readonly status: string } | null;
  readonly captain: {
    readonly memberId: string;
    readonly displayName: string;
    readonly claimed: boolean;
  } | null;
  readonly counts: {
    readonly members: number;
    readonly claimed: number;
    readonly inSeason: number;
    readonly withdrawn: number;
  };
  /** The admin's own active membership, if any. */
  readonly myMemberId: string | null;
  readonly createdAt: string;
}

/** A competition a new league can play (`GET /v1/competitions`). */
export interface CompetitionOption {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly timezone: string;
  readonly regularRounds: number;
  readonly lastRound: number;
}

/** One name on a new league's team sheet. */
export interface NewLeagueMember {
  readonly fullName: string;
  readonly displayName: string;
}

/** `POST /v1/admin/leagues`: one request, one transaction. */
export interface NewLeague {
  readonly name: string;
  readonly slug: string;
  /** Left out: the competition's time zone. */
  readonly timezone?: string;
  readonly competitionId: string;
  readonly seasonName: string;
  readonly members: readonly NewLeagueMember[];
  /** One of the members' display names. */
  readonly captainDisplayName: string;
  /** Null makes the admin the captain. */
  readonly captainEmail: string | null;
  readonly emblemPreset?: string | null;
  readonly accentColour?: string | null;
  /** With another captain: also add the admin as a member outside the season. */
  readonly addMe?: boolean;
}

/** `PATCH /v1/admin/leagues/{id}`: fields left out stay as they are. */
export interface LeagueUpdate {
  readonly name?: string;
  readonly timezone?: string;
  readonly status?: 'active' | 'archived';
}

/** A member the admin can appoint captain: active and claimed by an account. */
export interface CaptainCandidate {
  readonly id: string;
  readonly displayName: string;
}
