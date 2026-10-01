import { Service, signal } from '@angular/core';
import type { Chat } from '@ai-sdk/angular';
import { ChatThread } from './chat.models';

/**
 * The match chat's state, written only by `ChatControlService` and read through `ChatService`.
 * One fixture at a time: the thread as last loaded, the refusal or failure code, and the AI SDK
 * `Chat` that streams that fixture's answers (its messages and status are signals).
 */
@Service()
export class ChatStore {
  /** The fixture the state belongs to. */
  readonly fixtureId = signal<string | null>(null);
  readonly thread = signal<ChatThread | null>(null);
  readonly loading = signal(false);
  /** An `ApiError` code, such as a `ChatRefusal`, or null. */
  readonly error = signal<string | null>(null);
  readonly chat = signal<Chat | null>(null);
}
