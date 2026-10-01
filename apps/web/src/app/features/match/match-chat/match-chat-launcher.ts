import { HlmButton } from '@spartan-ng/helm/button';
import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBot } from '@ng-icons/lucide';
import { CompetitionService } from '../../../core/competition/competition.service';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatService } from '../../../core/league/chat/chat.service';
import { ProfileService } from '../../../core/profile/profile.service';
import { MatchChatSheet } from './match-chat-sheet';
import { chatClub } from './match-chat.club';
import { chatOff } from './match-chat.messages';

/**
 * The Pavilion's button, fixed at the bottom right of the match page above the mobile
 * navigation, which opens the chat sheet. It reads the fixture's thread once, and shows once
 * that read has answered that the chat is open (never for `chat_off`, and not once the match
 * has kicked off and picks have locked; a failed read still shows it, so the sheet can explain).
 * The host stays in the page's flow as a spacer, so the end of the page can scroll clear of it.
 * The button and the sheet wear the member's favourite club in this league, if they have one.
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
  private readonly profile = inject(ProfileService);
  private readonly competition = inject(CompetitionService);
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();

  readonly club = computed(() => chatClub(this.profile.team(), this.competition.current().banners));

  /** The fixture's chat is open, or its read failed for a reason the sheet explains. */
  readonly shown = computed(() => {
    if (this.chat.fixtureId() !== this.fixtureId()) return false;
    const error = this.chat.error();
    if (chatOff(error)) return false;
    if (this.chat.loaded()) return this.chat.open();
    return !!error && !this.chat.loading();
  });

  constructor() {
    effect(() => {
      const fixtureId = this.fixtureId();
      untracked(() => void this.control.load(fixtureId));
    });
  }
}
