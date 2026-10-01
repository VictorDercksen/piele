import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { LeagueContext } from '../league-context';
import { ChatControlService } from './chat-control.service';
import { ChatThread } from './chat.models';
import { ChatService } from './chat.service';

const URL = `${environment.apiUrl}/v1/leagues/league-1/matches/292605/chat`;

const THREAD: ChatThread = {
  fixtureId: '292605',
  open: true,
  remainingInThread: 6,
  remainingToday: 20,
  messages: [],
};

const encoder = new TextEncoder();

/** One server-sent event of the AI SDK UI message stream. */
function event(part: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(part)}\n\n`);
}

const ANSWER = [
  { type: 'start', messageId: 'a-1' },
  { type: 'start-step' },
  { type: 'text-start', id: 't-1' },
  { type: 'text-delta', id: 't-1', delta: 'Two props are out [1].' },
  { type: 'text-end', id: 't-1' },
  {
    type: 'source-url',
    sourceId: '1',
    url: 'https://www.unitedrugby.com/news',
    title: 'Team news',
  },
  { type: 'finish-step' },
  { type: 'finish' },
];

/** A stream the test feeds part by part, and closes when it likes. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    body,
    send: (part: object) => controller.enqueue(event(part)),
    close: () => {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  };
}

function streamResponse(body: ReadableStream<Uint8Array>, thread = 5, today = 19): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
      'X-Chat-Remaining-Thread': String(thread),
      'X-Chat-Remaining-Today': String(today),
    },
  });
}

function answered(parts: readonly object[] = ANSWER): Response {
  const stream = controlledStream();
  for (const part of parts) stream.send(part);
  stream.close();
  return streamResponse(stream.body);
}

function refusal(status: number, code: string): Response {
  return new Response(JSON.stringify({ detail: { code, message: 'Refused.' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  const accessToken = vi.fn().mockResolvedValue('token-1');
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { configured: true, accessToken } },
      { provide: LeagueContext, useValue: { current: signal({ id: 'league-1' }) } },
    ],
  });
  return {
    control: TestBed.inject(ChatControlService),
    chat: TestBed.inject(ChatService),
    http: TestBed.inject(HttpTestingController),
    fetch,
    accessToken,
  };
}

async function loaded(thread: ChatThread = THREAD) {
  const context = setup();
  const loading = context.control.load('292605');
  context.http.expectOne({ method: 'GET', url: URL }).flush(thread);
  await loading;
  return context;
}

describe('ChatControlService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the thread through the API', async () => {
    const { chat } = await loaded({
      ...THREAD,
      remainingInThread: 4,
      messages: [
        {
          id: 'm-1',
          role: 'user',
          text: 'Who is out?',
          sources: [],
          status: 'complete',
          createdAt: '2026-10-08T08:00:00Z',
        },
      ],
    });
    expect(chat.loaded()).toBe(true);
    expect(chat.messages().map((m) => m.text)).toEqual(['Who is out?']);
    expect(chat.remainingInThread()).toBe(4);
    expect(chat.error()).toBeNull();
  });

  it('keeps the refusal code of a read the API refused', async () => {
    const { control, chat, http } = setup();
    const loading = control.load('292605');
    http
      .expectOne(URL)
      .flush({ detail: { code: 'chat_off', message: 'Off.' } }, { status: 404, statusText: 'No' });
    await loading;
    expect(chat.loaded()).toBe(false);
    expect(chat.error()).toBe('chat_off');
  });

  it('ignores the answer of a read for a fixture no longer shown', async () => {
    const { control, chat, http } = setup();
    const first = control.load('292605');
    const second = control.load('292606');
    http.expectOne(URL).flush(THREAD);
    await first;
    expect(chat.loaded()).toBe(false);
    http.expectOne(URL.replace('292605', '292606')).flush({ ...THREAD, fixtureId: '292606' });
    await second;
    expect(chat.fixtureId()).toBe('292606');
    expect(chat.loaded()).toBe(true);
  });

  it('sends only the new question, with the bearer token, and adds the answer', async () => {
    const { control, chat, fetch, accessToken } = await loaded();
    fetch.mockResolvedValue(answered());

    await control.send('292605', '  Who is missing for Scarlets?  ');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(URL);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"text":"Who is missing for Scarlets?"}');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token-1');
    expect([...headers.keys()].sort()).toEqual(['authorization', 'content-type']);
    expect(accessToken).toHaveBeenCalled();

    expect(chat.messages().map((m) => [m.role, m.text, m.status])).toEqual([
      ['user', 'Who is missing for Scarlets?', 'complete'],
      ['assistant', 'Two props are out [1].', 'complete'],
    ]);
    expect(chat.messages()[1].sources).toEqual([
      { url: 'https://www.unitedrugby.com/news', title: 'Team news' },
    ]);
    expect(chat.remainingInThread()).toBe(5);
    expect(chat.remainingToday()).toBe(19);
    expect(chat.status()).toBe('ready');
    expect(chat.streaming()).toBeNull();
    expect(chat.error()).toBeNull();
  });

  it('shows the answer while it streams and keeps a stopped one', async () => {
    const { control, chat, fetch } = await loaded();
    const stream = controlledStream();
    fetch.mockResolvedValue(streamResponse(stream.body, 5, 19));

    const sending = control.send('292605', 'Who is out?');
    expect(chat.messages().map((m) => m.text)).toEqual(['Who is out?']);
    stream.send({ type: 'start', messageId: 'a-1' });
    stream.send({ type: 'text-start', id: 't-1' });
    stream.send({ type: 'text-delta', id: 't-1', delta: 'Two props' });
    await vi.waitFor(() => expect(chat.streamingText()).toBe('Two props'));
    expect(chat.status()).toBe('streaming');
    expect(chat.canSend('Another')).toBe(false);

    await control.stop();
    await sending;
    expect(chat.messages().map((m) => [m.role, m.text, m.status])).toEqual([
      ['user', 'Who is out?', 'complete'],
      ['assistant', 'Two props', 'aborted'],
    ]);
    expect(chat.remainingInThread()).toBe(5);
    expect(chat.status()).toBe('ready');
  });

  it('records an answer that broke off as failed', async () => {
    const { control, chat, fetch } = await loaded();
    fetch.mockResolvedValue(
      answered([
        { type: 'start', messageId: 'a-1' },
        { type: 'error', errorText: 'The answer was cut off.' },
      ]),
    );

    await control.send('292605', 'Who is out?');

    expect(chat.messages().map((m) => [m.role, m.text, m.status])).toEqual([
      ['user', 'Who is out?', 'complete'],
      ['assistant', 'No answer was produced.', 'failed'],
    ]);
    expect(chat.error()).toBe('chat_unavailable');
    expect(chat.remainingInThread()).toBe(5);
    expect(chat.canSend('Again')).toBe(true);
  });

  it('keeps the refusal code and reads the thread again after a refusal', async () => {
    const { control, chat, fetch, http } = await loaded();
    fetch.mockResolvedValue(refusal(429, 'chat_thread_limit'));

    const sending = control.send('292605', 'One more?');
    await vi.waitFor(() => expect(chat.error()).toBe('chat_thread_limit'));
    // The refused question is not in the thread.
    expect(chat.messages()).toEqual([]);
    http.expectOne({ method: 'GET', url: URL }).flush({ ...THREAD, remainingInThread: 0 });
    await sending;

    expect(chat.error()).toBe('chat_thread_limit');
    expect(chat.messages()).toEqual([]);
    expect(chat.remainingInThread()).toBe(0);
  });

  it('treats a request that never reached the API as unavailable', async () => {
    const { control, chat, fetch, http } = await loaded();
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const sending = control.send('292605', 'Who is out?');
    await vi.waitFor(() => http.expectOne(URL).flush(THREAD));
    await sending;

    expect(chat.error()).toBe('chat_unavailable');
    expect(chat.messages()).toEqual([]);
  });

  it('sends nothing without a loaded, open thread with questions left', async () => {
    const { control, fetch } = await loaded({ ...THREAD, remainingInThread: 0 });
    await control.send('292605', 'Who is out?');
    await control.send('292606', 'Who is out?');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears the thread, then reads it again', async () => {
    const { control, chat, http } = await loaded({
      ...THREAD,
      remainingInThread: 5,
      messages: [
        {
          id: 'm-1',
          role: 'user',
          text: 'Who is out?',
          sources: [],
          status: 'complete',
          createdAt: '2026-10-08T08:00:00Z',
        },
      ],
    });
    const clearing = control.clear('292605');
    http.expectOne({ method: 'DELETE', url: URL }).flush(null, { status: 204, statusText: 'No' });
    await vi.waitFor(() =>
      http.expectOne({ method: 'GET', url: URL }).flush({ ...THREAD, remainingInThread: 5 }),
    );
    await clearing;
    expect(chat.messages()).toEqual([]);
    expect(chat.remainingInThread()).toBe(5);
  });

  it('rejects with the API error when the thread cannot be cleared', async () => {
    const { control, http } = await loaded();
    const clearing = control.clear('292605');
    http.expectOne(URL).flush('down', { status: 503, statusText: 'Unavailable' });
    await expect(clearing).rejects.toMatchObject({ status: 503 });
  });
});
