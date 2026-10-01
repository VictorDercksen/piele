import type { components } from '../../api/generated';

/**
 * Contracts of `/v1/leagues/{leagueId}/matches/{fixtureId}/chat`: the member's own thread about
 * one fixture. Assistant text is written by the Pavilion agent; render it as plain text.
 */
export type ChatThread = components['schemas']['ChatThread'];

export type ChatMessage = components['schemas']['ChatMessage'];

export type ChatSource = components['schemas']['ChatSource'];

/** The body of `POST .../chat`: the new question and nothing else. */
export type ChatQuestion = components['schemas']['ChatQuestion'];

/** The `detail.code` of a chat refusal from the API. */
export type ChatRefusal =
  | 'chat_off'
  | 'chat_closed'
  | 'chat_thread_limit'
  | 'chat_daily_limit'
  | 'chat_busy'
  | 'chat_capacity'
  | 'chat_unavailable'
  | 'not_a_member'
  | 'admin_not_a_member';

/** The answer arriving from the stream, `[n]` markers left in the text. */
export interface ChatReply {
  readonly text: string;
  readonly sources: readonly ChatSource[];
}
