import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Chat } from '@ai-sdk/angular';
import { ChatOnFinishCallback, DefaultChatTransport, UIMessage } from 'ai';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toApiError } from '../../api/api-error';
import { AuthService } from '../../auth/auth.service';
import { leagueBase } from '../data/http-league-data';
import { LeagueContext } from '../league-context';
import { ChatStore } from './chat-store';
import { ChatMessage, ChatQuestion, ChatThread } from './chat.models';
import { ChatService, replyOf } from './chat.service';

/** Questions left after the turn, counted by the API once it accepts the question. */
export const REMAINING_THREAD_HEADER = 'X-Chat-Remaining-Thread';
export const REMAINING_TODAY_HEADER = 'X-Chat-Remaining-Today';
/** What the API stores for an answer that never came or was stopped before any text. */
const NO_ANSWER = 'No answer was produced.';
const STOPPED = 'The answer was stopped.';

type FinishEvent = Parameters<ChatOnFinishCallback<UIMessage>>[0];

/** The response head of the question in flight, read by the transport's `fetch`. */
interface TurnHead {
  /** The API accepted the question and is streaming the answer. */
  answered: boolean;
  /** The `detail.code` of a refusal before the stream. */
  refusal: string | null;
  remaining: { readonly thread: number; readonly today: number } | null;
}

/**
 * Loads, asks and clears the member's Pavilion chat about one fixture. The only owner of the AI
 * SDK transport: `fetch` bypasses the HTTP interceptor, so the bearer token is set per request
 * from the current session, and the body is the new question alone (the API keeps the history).
 */
@Service()
export class ChatControlService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly context = inject(LeagueContext);
  private readonly store = inject(ChatStore);
  private readonly chat = inject(ChatService);
  /** League and fixture of the current `Chat`; another league's thread is its own. */
  private selected: string | null = null;
  private head: TurnHead | null = null;

  /** Loads the thread, starting a new `Chat` (and stopping the old one) for another fixture. */
  async load(fixtureId: string): Promise<void> {
    this.select(fixtureId);
    this.store.error.set(null);
    await this.fetchThread(fixtureId);
  }

  /**
   * Asks the question and streams the answer. On a refusal before the stream, or a request
   * that never reached the API, the thread is read again: the API stored the question only if
   * it accepted it.
   */
  async send(fixtureId: string, text: string): Promise<void> {
    const chat = this.store.chat();
    const question = text.trim();
    if (!chat || this.store.fixtureId() !== fixtureId || !this.chat.canSend(question)) return;
    const head: TurnHead = { answered: false, refusal: null, remaining: null };
    this.head = head;
    const asked = message(chat.generateId(), 'user', question);
    this.store.error.set(null);
    this.patch(fixtureId, (thread) => ({ ...thread, messages: [...thread.messages, asked] }));
    chat.messages = [];
    await chat.sendMessage({ text: question });
    if (this.store.fixtureId() !== fixtureId) return;
    chat.clearError();
    if (head.answered) return;
    this.patch(fixtureId, (thread) => ({
      ...thread,
      messages: thread.messages.filter((m) => m.id !== asked.id),
    }));
    await this.fetchThread(fixtureId);
  }

  /** Stops the answer being streamed; the API keeps what arrived as a stopped answer. */
  stop(): Promise<void> {
    return this.store.chat()?.stop() ?? Promise.resolve();
  }

  /** Deletes the member's own thread for the fixture, then reads it again. */
  async clear(fixtureId: string): Promise<void> {
    const url = this.url(fixtureId);
    if (!url) return;
    try {
      await firstValueFrom(this.http.delete<void>(url));
    } catch (error) {
      throw toApiError(error);
    }
    await this.fetchThread(fixtureId);
  }

  private select(fixtureId: string): void {
    const key = `${this.context.current()?.id ?? ''}/${fixtureId}`;
    if (this.selected === key) return;
    this.selected = key;
    void this.store.chat()?.stop();
    this.head = null;
    this.store.fixtureId.set(fixtureId);
    this.store.thread.set(null);
    this.store.chat.set(this.createChat(fixtureId));
  }

  private createChat(fixtureId: string): Chat {
    return new Chat({
      transport: new DefaultChatTransport({
        api: this.url(fixtureId) ?? '',
        headers: async (): Promise<Record<string, string>> => {
          const token = await this.auth.accessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // The API takes the new question only and rejects any other field.
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { text: replyOf(messages.at(-1)!).text } satisfies ChatQuestion,
        }),
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);
          if (this.head) await readHead(this.head, response);
          return response;
        },
      }),
      onFinish: (event) => this.finished(fixtureId, event),
    });
  }

  /** Records the answer, or the stopped or broken one, as the API stores it. */
  private finished(fixtureId: string, { message: reply, isAbort, isError }: FinishEvent): void {
    // A stopped `Chat` of the previous fixture finishing late leaves the current turn alone.
    if (this.store.fixtureId() !== fixtureId) return;
    const head = this.head;
    this.head = null;
    const chat = this.store.chat();
    if (!head || !chat) return;
    if (!head.answered) {
      if (!isAbort) this.store.error.set(head.refusal ?? 'chat_unavailable');
      return;
    }
    const { text, sources } = replyOf(reply);
    const status = isError ? 'failed' : isAbort ? 'aborted' : 'complete';
    const answer = {
      ...message(reply.id, 'assistant', text.trim() || (isAbort ? STOPPED : NO_ANSWER)),
      sources,
      status,
    } satisfies ChatMessage;
    if (isError) this.store.error.set('chat_unavailable');
    this.patch(fixtureId, (thread) => ({
      ...thread,
      remainingInThread: head.remaining?.thread ?? thread.remainingInThread,
      remainingToday: head.remaining?.today ?? thread.remainingToday,
      messages: [...thread.messages, answer],
    }));
    chat.messages = [];
  }

  private async fetchThread(fixtureId: string): Promise<void> {
    const url = this.url(fixtureId);
    if (!url) return;
    this.store.loading.set(true);
    try {
      const thread = await firstValueFrom(this.http.get<ChatThread>(url));
      if (this.store.fixtureId() === fixtureId) this.store.thread.set(thread);
    } catch (error) {
      // A refusal from the question just asked outranks a failed read after it.
      if (this.store.fixtureId() === fixtureId)
        this.store.error.update((code) => code ?? toApiError(error).code);
    } finally {
      if (this.store.fixtureId() === fixtureId) this.store.loading.set(false);
    }
  }

  private patch(fixtureId: string, change: (thread: ChatThread) => ChatThread): void {
    if (this.store.fixtureId() !== fixtureId) return;
    this.store.thread.update((thread) => (thread ? change(thread) : thread));
  }

  private url(fixtureId: string): string | null {
    const league = this.context.current();
    if (!environment.apiUrl || !league) return null;
    return `${leagueBase(league.id)}/matches/${encodeURIComponent(fixtureId)}/chat`;
  }
}

function message(id: string, role: ChatMessage['role'], text: string): ChatMessage {
  return { id, role, text, sources: [], status: 'complete', createdAt: new Date().toISOString() };
}

/** Reads the counts from an accepted question, or the refusal code from a refused one. */
async function readHead(head: TurnHead, response: Response): Promise<void> {
  if (response.ok) {
    head.answered = true;
    const thread = Number.parseInt(response.headers.get(REMAINING_THREAD_HEADER) ?? '', 10);
    const today = Number.parseInt(response.headers.get(REMAINING_TODAY_HEADER) ?? '', 10);
    if (Number.isFinite(thread) && Number.isFinite(today)) head.remaining = { thread, today };
    return;
  }
  // Read a copy: the transport reads the body itself for its error.
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = detail && typeof detail === 'object' && 'code' in detail ? detail.code : null;
  head.refusal =
    typeof code === 'string' ? code : response.status === 401 ? 'unauthenticated' : 'error';
}
