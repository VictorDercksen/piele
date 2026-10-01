import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { CHAT_INSTRUCTIONS } from './instructions.ts';
import type { ChatRequest } from './request.ts';
import { chatTurn } from './turn.ts';

const ANSWER = 'Costelow is out [4]. Lloyd starts [1].';

const REQUEST: ChatRequest = {
  scope: { kind: 'fixture', fixtureId: '292605', round: 3 },
  context: `<documents>
<document index="1"><source>teamsheets</source><document_content>Ioan Lloyd starts at fly-half.</document_content></document>
</documents>
<sources>
[1] URC match centre: Scarlets v Benetton | United Rugby Championship | https://www.unitedrugby.com/match-centre/292605
[2] Forecast | Open-Meteo | https://open-meteo.com/
[4] Costelow out for three weeks | WalesOnline | https://www.walesonline.co.uk/sport/rugby/costelow
</sources>`,
  messages: [
    { role: 'user', content: 'Who plays fly-half?' },
    { role: 'assistant', content: 'Ioan Lloyd [1].' },
    { role: 'user', content: "Why isn't Sam Costelow playing?" },
  ],
};

const USAGE = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 14, text: 14, reasoning: undefined },
};

function answering(...deltas: string[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 't' },
          ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
          { type: 'text-end' as const, id: 't' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: USAGE,
          },
        ],
      }),
    }),
  });
}

/** The JSON parts of an SSE body, without the closing [DONE]. */
async function parts(response: Response): Promise<Array<Record<string, any>>> {
  const events = (await response.text()).split('\n\n').filter(Boolean);
  assert.equal(events.at(-1), 'data: [DONE]');
  return events.slice(0, -1).map((event) => {
    assert.ok(event.startsWith('data: '), event);
    return JSON.parse(event.slice('data: '.length));
  });
}

test('streams the answer, then one source-url part per cited source, then finish', async () => {
  const model = answering('Costelow is out [4]. ', 'Lloyd ', 'starts [1].');
  const response = chatTurn(REQUEST, { model });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const chunks = await parts(response);
  const text = chunks
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.delta)
    .join('');
  assert.equal(text, ANSWER);

  const sources = chunks.filter((chunk) => chunk.type === 'source-url');
  assert.deepEqual(sources, [
    {
      type: 'source-url',
      sourceId: '4',
      url: 'https://www.walesonline.co.uk/sport/rugby/costelow',
      title: 'Costelow out for three weeks',
    },
    {
      type: 'source-url',
      sourceId: '1',
      url: 'https://www.unitedrugby.com/match-centre/292605',
      title: 'URC match centre: Scarlets v Benetton',
    },
  ]);

  const types = chunks.map((chunk) => chunk.type);
  assert.ok(types.indexOf('source-url') > types.indexOf('text-end'));
  assert.equal(types.at(-1), 'finish');
  assert.equal(types.filter((type) => type === 'finish').length, 1);
  assert.deepEqual(chunks.at(-1)?.messageMetadata, {
    usage: { inputTokens: 900, outputTokens: 14, totalTokens: 914 },
  });
  assert.ok(!types.includes('error'));
});

test('sends the instructions, then the context, then the conversation, with the call settings', async () => {
  const model = answering(ANSWER);
  await chatTurn(REQUEST, { model }).text();

  const [call] = model.doStreamCalls;
  assert.equal(call.maxOutputTokens, 500);
  assert.equal(call.temperature, 0.3);
  assert.deepEqual(
    call.prompt.map((message) => message.role),
    ['system', 'user', 'user', 'assistant', 'user'],
  );
  assert.equal(call.prompt[0].content, CHAT_INSTRUCTIONS);
  assert.deepEqual(call.prompt[1].content, [
    {
      type: 'text',
      text: `<context>\n${REQUEST.context}\n</context>\n\nThe conversation follows.`,
    },
  ]);
  assert.deepEqual(call.prompt[4].content, [
    { type: 'text', text: "Why isn't Sam Costelow playing?" },
  ]);
});

test('turns a model failure into a generic error part and logs no details', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const model = new MockLanguageModelV3({
    doStream: async () => {
      throw new Error('upstream said no to Bearer secret-token');
    },
  });
  const response = chatTurn(REQUEST, { model });
  assert.equal(response.status, 200);

  const chunks = await parts(response);
  const errors = chunks.filter((chunk) => chunk.type === 'error');
  assert.deepEqual(errors, [{ type: 'error', errorText: 'The answer could not be completed.' }]);
  assert.ok(!chunks.some((chunk) => chunk.type === 'source-url' || chunk.type === 'finish'));
  const output = logged.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
  assert.doesNotMatch(output, /secret-token|documents/);
});

test('turns a failure part in the middle of the stream into an error part', async (t) => {
  t.mock.method(console, 'error', () => {});
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: 't' },
          { type: 'text-delta' as const, id: 't', delta: 'Costelow is out [4].' },
          { type: 'error' as const, error: new Error('connection reset') },
        ],
      }),
    }),
  });
  const chunks = await parts(chatTurn(REQUEST, { model }));
  const types = chunks.map((chunk) => chunk.type);
  assert.ok(types.includes('text-delta'));
  assert.equal(types.at(-1), 'error');
  assert.equal(chunks.at(-1)?.errorText, 'The answer could not be completed.');
});

test('reports a timeout as an error part', async () => {
  const model = new MockLanguageModelV3({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 't' });
          abortSignal?.addEventListener('abort', () => controller.error(abortSignal.reason));
        },
      }),
    }),
  });
  // AbortSignal.timeout's timer does not keep the test process alive, so time out by hand.
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), 20);
  const chunks = await parts(chatTurn(REQUEST, { model, signal: controller.signal }));
  assert.deepEqual(chunks.at(-1), {
    type: 'error',
    errorText: 'The answer took too long and was stopped.',
  });
});
