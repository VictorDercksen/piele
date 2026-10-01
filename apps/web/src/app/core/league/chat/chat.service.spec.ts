import { TestBed } from '@angular/core/testing';
import type { Chat } from '@ai-sdk/angular';
import type { ChatStatus, UIMessage } from 'ai';
import { ChatStore } from './chat-store';
import { ChatThread } from './chat.models';
import { ChatService, replyOf } from './chat.service';

const THREAD: ChatThread = {
  fixtureId: '292605',
  open: true,
  remainingInThread: 5,
  remainingToday: 19,
  messages: [
    {
      id: 'm-1',
      role: 'user',
      text: 'Who is missing for Scarlets?',
      sources: [],
      status: 'complete',
      createdAt: '2026-10-08T08:00:00Z',
    },
  ],
};

const ANSWER: UIMessage = {
  id: 'a-1',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Two props are out [1]' },
    {
      type: 'source-url',
      sourceId: '1',
      url: 'https://www.unitedrugby.com/news',
      title: 'Team news',
    },
    { type: 'text', text: ' and the 10 is new [2].' },
    { type: 'source-url', sourceId: '1', url: 'https://www.unitedrugby.com/news', title: 'Again' },
    { type: 'source-url', sourceId: '2', url: 'https://www.example.org/benetton' },
  ],
};

/** The parts of the AI SDK `Chat` the read service looks at. */
function fakeChat(status: ChatStatus, messages: UIMessage[]): Chat {
  return { status, messages } as unknown as Chat;
}

function setup() {
  const service = TestBed.inject(ChatService);
  const store = TestBed.inject(ChatStore);
  return { service, store };
}

describe('ChatService', () => {
  it('has nothing to send before a thread is loaded', () => {
    const { service } = setup();
    expect(service.loaded()).toBe(false);
    expect(service.messages()).toEqual([]);
    expect(service.open()).toBe(false);
    expect(service.status()).toBe('ready');
    expect(service.streaming()).toBeNull();
    expect(service.canSend('Hello')).toBe(false);
  });

  it('reads the loaded thread and its counts', () => {
    const { service, store } = setup();
    store.fixtureId.set('292605');
    store.thread.set(THREAD);
    expect(service.fixtureId()).toBe('292605');
    expect(service.loaded()).toBe(true);
    expect(service.messages()).toEqual(THREAD.messages);
    expect(service.open()).toBe(true);
    expect(service.remainingInThread()).toBe(5);
    expect(service.remainingToday()).toBe(19);
  });

  it('can send text while open, with questions left and nothing being answered', () => {
    const { service, store } = setup();
    store.thread.set(THREAD);
    expect(service.canSend('And the weather?')).toBe(true);
    expect(service.canSend('   ')).toBe(false);

    store.thread.set({ ...THREAD, remainingInThread: 0 });
    expect(service.canSend('And the weather?')).toBe(false);
    store.thread.set({ ...THREAD, remainingToday: 0 });
    expect(service.canSend('And the weather?')).toBe(false);
    store.thread.set({ ...THREAD, open: false });
    expect(service.canSend('And the weather?')).toBe(false);

    store.thread.set(THREAD);
    store.chat.set(fakeChat('submitted', []));
    expect(service.busy()).toBe(true);
    expect(service.canSend('And the weather?')).toBe(false);
    // A failed turn leaves the chat in `error`; the member may ask again.
    store.chat.set(fakeChat('error', []));
    expect(service.canSend('And the weather?')).toBe(true);
  });

  it('shows the answer while it streams, each source once', () => {
    const { service, store } = setup();
    const question: UIMessage = {
      id: 'q-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Who is out?' }],
    };
    store.chat.set(fakeChat('submitted', [question]));
    expect(service.streaming()).toBeNull();

    store.chat.set(fakeChat('streaming', [question, ANSWER]));
    expect(service.status()).toBe('streaming');
    expect(service.streamingText()).toBe('Two props are out [1] and the 10 is new [2].');
    expect(service.streamingSources()).toEqual([
      { url: 'https://www.unitedrugby.com/news', title: 'Team news' },
      { url: 'https://www.example.org/benetton', title: 'www.example.org' },
    ]);

    // Once answered, the reply belongs to the thread, not the stream.
    store.chat.set(fakeChat('ready', [question, ANSWER]));
    expect(service.streaming()).toBeNull();
    expect(service.streamingText()).toBe('');
  });

  it('replyOf joins the text parts and keeps the markers', () => {
    expect(replyOf(ANSWER).text).toBe('Two props are out [1] and the 10 is new [2].');
    expect(replyOf({ id: 'x', role: 'assistant', parts: [] })).toEqual({ text: '', sources: [] });
  });
});
