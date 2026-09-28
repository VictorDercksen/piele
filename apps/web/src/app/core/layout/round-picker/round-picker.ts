import { OverlayPositionBuilder } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { CompetitionService, shortSeason } from '../../competition/competition.service';
import { SelectedRoundService } from '../../competition/selected-round.service';
import { LeagueContext } from '../../league/league-context';
import { SeasonTimeline } from '../season-timeline/season-timeline';

/** Mobile round navigation shares the desktop timeline and selected-round state. */
@Component({
  selector: 'app-round-picker',
  templateUrl: './round-picker.html',
  styleUrl: './round-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'closeOnDesktop()' },
  /* prettier-ignore */
  imports: [
    NgIcon,
    HlmButton,
    HlmDialogImports,
    SeasonTimeline,
  ],
  viewProviders: [provideIcons({ lucideChevronDown, lucideX })],
})
export class RoundPicker {
  private readonly competition = inject(CompetitionService);
  private readonly selectedRound = inject(SelectedRoundService);
  readonly leagueName = inject(LeagueContext).name;
  readonly dialog = viewChild.required(HlmDialog);
  readonly position = inject(OverlayPositionBuilder).global().centerHorizontally().bottom('0');
  readonly round = this.selectedRound.round;
  readonly rounds = computed(() => this.competition.rounds);
  readonly currentRound = computed(() => this.competition.currentRoundId);
  readonly season = computed(() => shortSeason(this.competition.season, ' / '));
  readonly emblem = computed(() => this.competition.current().emblem);
  readonly competitionName = computed(() => this.competition.current().name);
  readonly regularRounds = computed(() => this.competition.regularRounds);

  select(id: number): void {
    this.selectedRound.select(id);
  }

  closeOnDesktop(): void {
    if (window.innerWidth > 1050) this.dialog().close();
  }
}
