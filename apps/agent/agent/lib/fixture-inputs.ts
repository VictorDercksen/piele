import { defineState } from 'eve/context';
import { playerKey, type KnownInternational } from './internationals.ts';

export interface FixtureInputs {
  readonly inputsHash: string;
  readonly teamsheetHash: string;
}

/**
 * Hashes of the fixture state each preview is written from, by fixture id. Set by
 * get_fixture_state and read by save_preview, so the model never copies them.
 */
export const fixtureInputs = defineState(
  'pavilion.fixture-inputs',
  (): Record<string, FixtureInputs> => ({}),
);

/** A known international older than this many days is searched for again. */
export const RECHECK_AFTER_DAYS = 30;

interface Player {
  readonly number?: number;
  readonly name: string;
  readonly position?: string | null;
}

interface SideState {
  readonly club?: { readonly name?: string };
  readonly teamsheet?: { readonly starters: Player[]; readonly replacements: Player[] } | null;
  readonly features?: unknown;
  readonly internationals?: KnownInternational[];
}

/** The part of the API's fixture state the researcher's request is built from. */
export interface RequestState {
  readonly kickoffUtc?: string;
  readonly venue?: string | null;
  readonly generatedAt?: string;
  readonly home?: SideState;
  readonly away?: SideState;
}

/**
 * The request for one side's team-researcher, built in code so the known internationals
 * reach it: the team, the opponent, kickoff, venue, the selection, the side's features and,
 * for the Internationals duty, the records already held (each marked `recheck` when checked
 * more than RECHECK_AFTER_DAYS ago) and the selected players with no record yet.
 */
export function researcherRequest(state: RequestState, side: 'home' | 'away', now = new Date()): string {
  const mine = state[side];
  const theirs = state[side === 'home' ? 'away' : 'home'];
  const sheet = mine?.teamsheet;
  const selected = [...(sheet?.starters ?? []), ...(sheet?.replacements ?? [])];
  const selectedKeys = new Set(selected.map((player) => playerKey(player.name)));
  const known = (mine?.internationals ?? []).filter((record) => selectedKeys.has(playerKey(record.name)));
  const knownKeys = new Set(known.map((record) => playerKey(record.name)));
  const asOf = state.generatedAt ? new Date(state.generatedAt) : now;
  const cutoff = (Number.isNaN(asOf.getTime()) ? now : asOf).getTime() - RECHECK_AFTER_DAYS * 86_400_000;
  const request = {
    team: mine?.club?.name ?? null,
    opponent: theirs?.club?.name ?? null,
    kickoffUtc: state.kickoffUtc ?? null,
    venue: state.venue ?? null,
    startingXV: sheet?.starters.map(({ number, name, position }) => ({ number, name, position })) ?? [],
    replacements: sheet?.replacements.map(({ number, name, position }) => ({ number, name, position })) ?? [],
    features: mine?.features ?? null,
    knownInternationals: known.map((record) => ({
      ...record,
      recheck: !(Date.parse(record.checkedAt) >= cutoff),
    })),
    selectedWithoutInternationalRecord: selected
      .filter((player) => !knownKeys.has(playerKey(player.name)))
      .map((player) => player.name),
  };
  return `Research this team for the fixture below.\n${JSON.stringify(request, null, 1)}`;
}
