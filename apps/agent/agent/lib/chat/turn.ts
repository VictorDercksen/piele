import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type LanguageModel,
  type UIMessageChunk,
} from 'ai';
import { CHAT_INSTRUCTIONS } from './instructions.ts';
import type { ChatRequest } from './request.ts';
import { citedSources, parseSources } from './sources.ts';

const FAILED = 'The answer could not be completed.';
const TIMED_OUT = 'The answer took too long and was stopped.';

/**
 * One stateless model turn of the match chat as an AI SDK UI message stream: the model's text
 * as it arrives, then one `source-url` part per source the final text cites, then `finish`
 * (with token usage as message metadata). A failure after the stream has started becomes an
 * `error` part with a fixed message, and the stream ends there.
 */
export function chatTurn(
  request: ChatRequest,
  options: { model: LanguageModel; signal?: AbortSignal },
): Response {
  const sources = parseSources(request.context);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: options.model,
        instructions: CHAT_INSTRUCTIONS,
        // The context goes in as the first user message, as the instructions describe it at
        // the start of the conversation. A second system message would need
        // allowSystemInMessages and is handled less evenly across providers.
        messages: [
          {
            role: 'user',
            content: `<context>\n${request.context}\n</context>\n\nThe conversation follows.`,
          },
          ...request.messages,
        ],
        maxOutputTokens: 500,
        temperature: 0.3,
        // DeepSeek thinks before it answers unless told not to, and the thinking counts
        // against maxOutputTokens: a question about a side spent all 500 on reasoning and
        // produced no answer (1 October 2026). A short factual answer needs no thinking.
        providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
        maxRetries: 1,
        abortSignal: options.signal,
        // The default handler logs the whole error, whose request body holds the context.
        onError: ({ error }) => logFailure(error),
      });
      let text = '';
      let finish: UIMessageChunk | undefined;
      for await (const chunk of result.toUIMessageStream({
        sendReasoning: false,
        onError: () => FAILED,
        messageMetadata: ({ part }) =>
          part.type === 'finish'
            ? {
                usage: {
                  inputTokens: part.totalUsage.inputTokens,
                  outputTokens: part.totalUsage.outputTokens,
                  totalTokens: part.totalUsage.totalTokens,
                },
              }
            : undefined,
      })) {
        if (chunk.type === 'error' || chunk.type === 'abort') {
          writer.write(chunk.type === 'error' ? chunk : { type: 'error', errorText: TIMED_OUT });
          return;
        }
        // Held back so the citations land inside the message, before it finishes.
        if (chunk.type === 'finish') {
          finish = chunk;
          continue;
        }
        if (chunk.type === 'text-delta') text += chunk.delta;
        writer.write(chunk);
      }
      for (const source of citedSources(text, sources)) {
        writer.write({
          type: 'source-url',
          sourceId: String(source.n),
          url: source.url,
          title: source.title,
        });
      }
      writer.write(finish ?? { type: 'finish' });
    },
    onError: (error) => {
      logFailure(error);
      return FAILED;
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { 'Cache-Control': 'no-store' } });
}

// Only the error's class and HTTP status: provider errors carry the request body.
function logFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  console.error(`chat turn failed: ${name}${typeof status === 'number' ? ` ${status}` : ''}`);
}
