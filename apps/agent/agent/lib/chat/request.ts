import { z } from 'zod';

// Limits of POST /chat/turn, shared with the API (apps/api/app/chat/). The API keeps its
// context under 32,000 characters; the extra room here absorbs small drifts between the two.
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_CONTEXT_CHARS = 40_000;
export const MAX_MESSAGES = 11;
export const MAX_USER_CHARS = 1_000;
export const MAX_ASSISTANT_CHARS = 4_000;

const message = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('user'),
    content: z.string().trim().min(1).max(MAX_USER_CHARS),
  }),
  z.strictObject({
    role: z.literal('assistant'),
    content: z.string().trim().min(1).max(MAX_ASSISTANT_CHARS),
  }),
]);

const chatRequest = z.strictObject({
  scope: z.strictObject({
    kind: z.literal('fixture'),
    fixtureId: z.string().regex(/^\d{1,12}$/),
    round: z.number().int().min(1).max(30),
  }),
  context: z.string().min(1).max(MAX_CONTEXT_CHARS),
  messages: z
    .array(message)
    .min(1)
    .max(MAX_MESSAGES)
    .refine(
      // Odd indexes are the assistant's, so a valid thread starts and ends with the member.
      (messages) =>
        messages.length % 2 === 1 &&
        messages.every((entry, index) => entry.role === (index % 2 ? 'assistant' : 'user')),
      'roles must alternate, starting and ending with user',
    ),
});

export type ChatRequest = z.infer<typeof chatRequest>;

/** Reads the body of POST /chat/turn, or names the first thing wrong with it in one line. */
export function parseChatRequest(text: string): ChatRequest | { error: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'Body must be JSON.' };
  }
  const result = chatRequest.safeParse(body);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  const path = issue.path.join('.');
  return { error: `${path ? `${path}: ` : ''}${issue.message}`.replace(/\s+/g, ' ') };
}
