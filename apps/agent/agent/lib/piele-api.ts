/**
 * Client for the Piele API's /v1/agent routes. The agent has no database credentials;
 * everything it reads and writes goes through these routes with one bearer token.
 */

const TIMEOUT_MS = 30_000;

export class PieleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PieleApiError';
  }
}

function setting(name: 'PIELE_API_URL' | 'PIELE_AGENT_TOKEN'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set for the agent.`);
  return value;
}

/**
 * Calls `/v1/agent{path}` and returns the parsed JSON body. A non-2xx answer throws with
 * the API's validation detail (never the token), so the model can correct a submission.
 */
export async function pieleApi<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const signals = [AbortSignal.timeout(TIMEOUT_MS), ...(options.signal ? [options.signal] : [])];
  const response = await fetch(new URL(`/v1/agent${path}`, setting('PIELE_API_URL')), {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${setting('PIELE_AGENT_TOKEN')}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.any(signals),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PieleApiError(
      response.status,
      `Piele API ${method} ${path} answered ${response.status}: ${text.slice(0, 1000)}`,
    );
  }
  return JSON.parse(text) as T;
}
