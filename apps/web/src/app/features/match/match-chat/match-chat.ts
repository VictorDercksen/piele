import { HlmButton } from '@spartan-ng/helm/button';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideExternalLink,
  lucideRotateCcw,
  lucideSend,
  lucideSquare,
  lucideTrash2,
} from '@ng-icons/lucide';
import { AlertService } from '../../../core/feedback/alert.service';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatService } from '../../../core/league/chat/chat.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { QUESTION_MAX_LENGTH, questionControl, sendsOnEnter } from './match-chat.form';
import {
  CLOSED_TEXT,
  EMPTY_TEXT,
  chatClosed,
  chatNotice,
  chatOff,
  membershipText,
  remainingText,
} from './match-chat.messages';

/** The key of the card for a thread that could not be cleared. */
export const CLEAR_FAILURE = 'match-chat-clear';

/**
 * Ask the Pavilion: the member's own questions about the fixture and the agent's answers, in a
 * panel dropdown under the preview that is closed by default and for every new fixture. Answers
 * keep their `[n]` markers and list the sources they cite as external links. Agent text is bound
 * as plain text only. Hidden while the API has the chat switched off.
 */
@Component({
  selector: 'app-match-chat',
  templateUrl: './match-chat.html',
  styleUrl: './match-chat.scss',
  host: {
    '[class.off]': 'off()',
  },
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    Dropdown,
    NgIcon,
    HlmButton,
    HlmLabel,
    HlmTextarea,
  ],
  viewProviders: [
    provideIcons({
      lucideBot,
      lucideExternalLink,
      lucideRotateCcw,
      lucideSend,
      lucideSquare,
      lucideTrash2,
    }),
  ],
})
export class MatchChat {
  private readonly chat = inject(ChatService);
  private readonly control = inject(ChatControlService);
  private readonly alerts = inject(AlertService);
  readonly fixtureId = input.required<string>();

  readonly maxLength = QUESTION_MAX_LENGTH;
  readonly emptyText = EMPTY_TEXT;
  readonly closedText = CLOSED_TEXT;
  readonly question = questionControl();
  private readonly text = toSignal(this.question.valueChanges, { initialValue: '' });

  /** The state below is the shown fixture's, not the previous one's while it loads. */
  private readonly current = computed(() => this.chat.fixtureId() === this.fixtureId());
  readonly loaded = computed(() => this.current() && this.chat.loaded());
  readonly messages = this.chat.messages;
  readonly busy = this.chat.busy;
  readonly streamingText = this.chat.streamingText;
  readonly streamingSources = this.chat.streamingSources;
  readonly error = computed(() => (this.current() ? this.chat.error() : null));
  readonly off = computed(() => chatOff(this.error()));
  readonly closed = computed(() => chatClosed(this.chat.open(), this.error()));
  readonly membership = computed(() => membershipText(this.error()));
  readonly loadFailed = computed(() => !this.loaded() && !!this.error() && !this.chat.loading());
  readonly notice = computed(() =>
    chatNotice(this.error(), this.chat.remainingInThread(), this.chat.remainingToday()),
  );
  readonly remaining = computed(() =>
    remainingText(this.chat.remainingInThread(), this.chat.remainingToday()),
  );
  readonly sendable = computed(() => this.chat.canSend(this.text()));

  constructor() {
    effect(() => {
      const fixtureId = this.fixtureId();
      untracked(() => void this.control.load(fixtureId));
    });
  }

  reload(): void {
    void this.control.load(this.fixtureId());
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  /** Enter sends; Shift+Enter starts a new line. */
  onKeydown(event: KeyboardEvent): void {
    if (!sendsOnEnter(event)) return;
    event.preventDefault();
    void this.send();
  }

  async send(): Promise<void> {
    const text = this.question.value;
    if (!this.sendable()) return;
    this.question.setValue('');
    await this.control.send(this.fixtureId(), text);
    // A refused question goes back in the box to be sent again later.
    if (this.error() && !this.question.value) this.question.setValue(text);
  }

  stop(): void {
    void this.control.stop();
  }

  async clear(): Promise<void> {
    try {
      await this.control.clear(this.fixtureId());
      this.alerts.dismissKey(CLEAR_FAILURE);
    } catch (error) {
      this.alerts.error(error instanceof Error ? error.message : 'The chat could not be cleared.', {
        key: CLEAR_FAILURE,
      });
    }
  }
}
