import { OverlayPositionBuilder } from '@angular/cdk/overlay';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideExternalLink,
  lucideRotateCcw,
  lucideSend,
  lucideSquare,
  lucideX,
} from '@ng-icons/lucide';
import { AlertService } from '../../../core/feedback/alert.service';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatService } from '../../../core/league/chat/chat.service';
import { QUESTION_MAX_LENGTH, questionControl } from './match-chat.form';
import {
  CLOSED_TEXT,
  INTRO_TEXT,
  chatClosed,
  chatNotice,
  membershipText,
  readyQuestions,
  remainingText,
} from './match-chat.messages';
import { ChatClub } from './match-chat.models';

/** The key of the card for a thread that could not be cleared. */
export const CLEAR_FAILURE = 'match-chat-clear';

/**
 * Ask the Pavilion: the member's own questions about the fixture and the agent's answers, in a
 * modal sheet opened from the match page's launcher. A bottom sheet up to 1050 px, a side panel
 * on the right above that, both rendered in the dialog overlay. Answers keep their `[n]` markers
 * and list the sources they cite as external links. Agent text is bound as plain text only.
 * With a club, a scarf stripe runs along the top and the member's questions sit on its banner.
 */
@Component({
  selector: 'app-match-chat-sheet',
  templateUrl: './match-chat-sheet.html',
  styleUrl: './match-chat-sheet.scss',
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmButton,
    HlmDialogImports,
    HlmInput,
    HlmLabel,
  ],
  viewProviders: [
    provideIcons({
      lucideBot,
      lucideExternalLink,
      lucideRotateCcw,
      lucideSend,
      lucideSquare,
      lucideX,
    }),
  ],
})
export class MatchChatSheet {
  private readonly chat = inject(ChatService);
  private readonly control = inject(ChatControlService);
  private readonly alerts = inject(AlertService);
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();
  /** The member's favourite club; null keeps the Pavilion's teal. */
  readonly club = input<ChatClub | null>(null);
  /** Gets focus back when the sheet closes: the launcher, which Safari does not focus on click. */
  readonly returnFocus = input<HTMLElement | null>(null);

  private readonly dialog = viewChild(HlmDialog);
  private readonly questionInput = viewChild<ElementRef<HTMLInputElement>>('questionInput');
  private readonly threadScroll = viewChild<ElementRef<HTMLElement>>('threadScroll');
  /** Anchored bottom right: the bottom sheet spans the width, the side panel hugs the right. */
  readonly position = inject(OverlayPositionBuilder).global().bottom('0').right('0');

  readonly maxLength = QUESTION_MAX_LENGTH;
  readonly introText = INTRO_TEXT;
  readonly closedText = CLOSED_TEXT;
  readonly question = questionControl();
  private readonly text = toSignal(this.question.valueChanges, { initialValue: '' });

  readonly isOpen = computed(() => this.dialog()?.stateComputed() === 'open');
  /** The state below is the shown fixture's, not the previous one's while it loads. */
  private readonly current = computed(() => this.chat.fixtureId() === this.fixtureId());
  readonly loaded = computed(() => this.current() && this.chat.loaded());
  readonly messages = this.chat.messages;
  readonly busy = this.chat.busy;
  readonly streamingText = this.chat.streamingText;
  readonly streamingSources = this.chat.streamingSources;
  readonly error = computed(() => (this.current() ? this.chat.error() : null));
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
  readonly readyQuestions = computed(() => readyQuestions(this.home(), this.away()));
  /** The ready questions, while nothing has been asked and one can be sent. */
  readonly showChips = computed(
    () => !this.messages().length && !this.closed() && this.chat.ready(),
  );

  /** Focus goes to the question field once it renders after opening. */
  private focusPending = false;
  private shownFixture: string | null = null;

  constructor() {
    // Another fixture in the route closes the sheet; the launcher loads the new thread.
    effect(() => {
      const fixtureId = this.fixtureId();
      untracked(() => {
        if (this.shownFixture !== null && this.shownFixture !== fixtureId) this.close();
        this.shownFixture = fixtureId;
      });
    });
    afterRenderEffect(() => {
      const field = this.questionInput()?.nativeElement;
      if (!field || !this.isOpen() || !this.focusPending) return;
      this.focusPending = false;
      field.focus();
    });
    // The thread starts at its end and follows new messages and the streaming answer.
    afterRenderEffect(() => {
      this.messages();
      this.streamingText();
      const scroller = this.threadScroll()?.nativeElement;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  }

  /** Opens the sheet and reads the thread again, unless an answer is still arriving. */
  open(): void {
    if (!this.chat.busy()) void this.control.load(this.fixtureId());
    this.focusPending = true;
    this.dialog()?.open();
  }

  close(): void {
    this.focusPending = false;
    this.dialog()?.close();
  }

  reload(): void {
    void this.control.load(this.fixtureId());
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  /** Sends a ready question as it reads. */
  ask(text: string): void {
    void this.control.send(this.fixtureId(), text);
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
