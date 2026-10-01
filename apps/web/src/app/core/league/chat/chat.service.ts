import { Service, computed, inject } from '@angular/core';
import type { ChatStatus, UIMessage } from 'ai';
import { ChatStore } from './chat-store';
import { ChatMessage, ChatReply, ChatSource } from './chat.models';

/**
 * The member's Pavilion chat about one fixture: the stored thread, whether it is open, the
 * questions left, and the answer while it streams.
 */
@Service()
export class ChatService {
  private readonly store = inject(ChatStore);

  /** The fixture the thread below belongs to. */
  readonly fixtureId = this.store.fixtureId.asReadonly();
  readonly loaded = computed(() => this.store.thread() !== null);
  readonly messages = computed<readonly ChatMessage[]>(() => this.store.thread()?.messages ?? []);
  /** From three days before kickoff to two days after it, while the season is open. */
  readonly open = computed(() => this.store.thread()?.open ?? false);
  readonly remainingInThread = computed(() => this.store.thread()?.remainingInThread ?? 0);
  readonly remainingToday = computed(() => this.store.thread()?.remainingToday ?? 0);
  readonly loading = this.store.loading.asReadonly();
  /** An `ApiError` code, such as a `ChatRefusal`, or null. */
  readonly error = this.store.error.asReadonly();
  /** The AI SDK chat status: `submitted` and `streaming` while a question is being answered. */
  readonly status = computed<ChatStatus>(() => this.store.chat()?.status ?? 'ready');
  readonly busy = computed(() => this.status() === 'submitted' || this.status() === 'streaming');
  /** The answer arriving now, or null between questions. */
  readonly streaming = computed<ChatReply | null>(() => {
    const last = this.store.chat()?.messages.at(-1);
    return last?.role === 'assistant' && this.busy() ? replyOf(last) : null;
  });
  readonly streamingText = computed(() => this.streaming()?.text ?? '');
  readonly streamingSources = computed(() => this.streaming()?.sources ?? []);
  /** Open, a question left in the thread and today, and nothing being answered. */
  readonly ready = computed(
    () => this.open() && this.remainingInThread() > 0 && this.remainingToday() > 0 && !this.busy(),
  );

  /** Whether `text` can be sent now. Reads signals: call it in a computed. */
  canSend(text: string): boolean {
    return this.ready() && text.trim().length > 0;
  }
}

/** A streamed message's text and its cited sources, each URL once. */
export function replyOf(message: UIMessage): ChatReply {
  let text = '';
  const sources: ChatSource[] = [];
  for (const part of message.parts) {
    if (part.type === 'text') text += part.text;
    else if (part.type === 'source-url' && !sources.some((s) => s.url === part.url))
      sources.push({ url: part.url, title: part.title?.trim() || hostOf(part.url) });
  }
  return { text, sources };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
