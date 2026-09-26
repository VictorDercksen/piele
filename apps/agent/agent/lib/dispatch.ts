import { pavilionApi } from './pavilion-api';

/** One fixture claimed through the API's POST /v1/agent/dispatches. */
export interface Dispatch {
  fixtureId: string;
  round: number;
  kickoffUtc: string;
  homeId: string;
  awayId: string;
  reason: 'first_preview' | 'retry' | 'forced';
  attempt: number;
}

/** Optional body of POST /v1/agent/dispatches; the API validates it. */
export interface DispatchOptions {
  fixtureId?: string;
  force?: boolean;
}

/** Claims the due fixtures (or one fixture) in the API; each claim gets one writing session. */
export async function claimFixtures(options?: DispatchOptions): Promise<Dispatch[]> {
  const { dispatches } = await pavilionApi<{ dispatches: Dispatch[] }>('/dispatches', {
    method: 'POST',
    body: options,
  });
  return dispatches;
}

/** Channel address of a claim: one session per fixture and attempt, so a retry starts fresh. */
export function sessionAddress({ fixtureId, attempt }: Pick<Dispatch, 'fixtureId' | 'attempt'>): string {
  return `fixture-${fixtureId}-attempt-${attempt}`;
}

/** The message that starts a writing session. */
export function sessionPrompt({ fixtureId, round, kickoffUtc }: Dispatch): string {
  return `Write the Pavilion preview for fixture ${fixtureId} (round ${round}, kickoff ${kickoffUtc} UTC).`;
}
