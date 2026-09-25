import { defineChannel, GET } from 'eve/channels';

/** One fixture claimed through the API's POST /v1/agent/dispatches. */
export interface PreviewTarget {
  readonly fixtureId: string;
  readonly attempt: number;
}

/**
 * Where the prepare-previews schedule hands each claimed fixture. Sessions start only from
 * the schedule, one per claim, so a retry after a failed session starts fresh instead of
 * resuming it. eve registers a channel only when it has a route, so it answers one empty
 * health check and nothing else.
 */
export default defineChannel<undefined, void, PreviewTarget>({
  routes: [GET('/previews/health', async () => new Response(null, { status: 204 }))],
  receive: ({ message, target, auth }, { from }) =>
    from(`fixture-${target.fixtureId}-attempt-${target.attempt}`).send(message, { auth }),
});
