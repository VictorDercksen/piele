import { defineChannel, GET, POST } from 'eve/channels';
import type { SessionAuthContext } from 'eve/context';
import { claimFixtures, sessionAddress, sessionPrompt } from '../lib/dispatch';
import { PieleApiError } from '../lib/piele-api';
import { hasAgentToken, parseRunRequest } from '../lib/run-request';

/** One fixture claimed through the API's POST /v1/agent/dispatches. */
export interface PreviewTarget {
  readonly fixtureId: string;
  readonly attempt: number;
}

// Principal of sessions started by hand through POST /previews/run.
const RUN_AUTH: SessionAuthContext = {
  attributes: {},
  authenticator: 'piele-agent-token',
  principalId: 'piele:run',
  principalType: 'service',
};

/**
 * Where writing sessions start: one per claimed fixture and attempt, so a retry after a
 * failed session starts fresh instead of resuming it. The prepare-previews schedule hands
 * claims in through `receive`. POST /previews/run does the same on demand, behind the
 * agent token: with no body it claims whatever is due; with `{ fixtureId }` only that
 * fixture; with `{ fixtureId, force: true }` that fixture even if it already has a preview,
 * is inside a lease or has used its attempts.
 */
export default defineChannel<undefined, void, PreviewTarget>({
  routes: [
    GET('/previews/health', async () => new Response(null, { status: 204 })),
    POST('/previews/run', async (request, { from }) => {
      if (!hasAgentToken(request.headers.get('authorization'), process.env.PIELE_AGENT_TOKEN)) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      const options = parseRunRequest(await request.text());
      if (!options) {
        return Response.json(
          { error: 'Body must be empty or { "fixtureId": "<digits>", "force"?: boolean }; force needs a fixtureId.' },
          { status: 422 },
        );
      }
      let claimed;
      try {
        claimed = await claimFixtures(options);
      } catch (error) {
        if (error instanceof PieleApiError && error.status < 500) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
      const started = await Promise.all(
        claimed.map(async (dispatch) => {
          const session = await from(sessionAddress(dispatch)).send(sessionPrompt(dispatch), { auth: RUN_AUTH });
          return { fixtureId: dispatch.fixtureId, attempt: dispatch.attempt, reason: dispatch.reason, sessionId: session.id };
        }),
      );
      return Response.json({ started }, { status: started.length ? 202 : 200 });
    }),
  ],
  receive: ({ message, target, auth }, { from }) => from(sessionAddress(target)).send(message, { auth }),
});
