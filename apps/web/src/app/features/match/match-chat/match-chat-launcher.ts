import { HlmButton } from '@spartan-ng/helm/button';
import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBot } from '@ng-icons/lucide';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatService } from '../../../core/league/chat/chat.service';
import { MatchChatSheet } from './match-chat-sheet';
import { chatOff } from './match-chat.messages';

/**
 * The Pavilion's button, fixed at the bottom right of the match page above the mobile
 * navigation, which opens the chat sheet. It reads the fixture's thread once, and shows once
 * that read has answered anything but `chat_off`. The host stays in the page's flow as a spacer,
 * so the end of the page can scroll clear of the button.
 */
@Component({
  selector: 'app-match-chat-launcher',
  templateUrl: './match-chat-launcher.html',
  styleUrl: './match-chat-launcher.scss',
  host: {
    '[class.shown]': 'shown()',
  },
  /* prettier-ignore */
  imports: [
    NgIcon,
    HlmButton,
    MatchChatSheet,
  ],
  viewProviders: [provideIcons({ lucideBot })],
})
export class MatchChatLauncher {
  private readonly chat = inject(ChatService);
  private readonly control = inject(ChatControlService);
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();

  /** This fixture's thread was read, or its read failed for a reason the sheet explains. */
  readonly shown = computed(() => {
    if (this.chat.fixtureId() !== this.fixtureId()) return false;
    const error = this.chat.error();
    if (chatOff(error)) return false;
    return this.chat.loaded() || (!!error && !this.chat.loading());
  });

  constructor() {
    effect(() => {
      const fixtureId = this.fixtureId();
      untracked(() => void this.control.load(fixtureId));
    });
  }
}
