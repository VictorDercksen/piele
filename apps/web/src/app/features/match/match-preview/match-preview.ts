import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmCollapsible,
  HlmCollapsibleContent,
  HlmCollapsibleTrigger,
} from '@spartan-ng/helm/collapsible';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideExternalLink,
  lucidePenLine,
  lucideRotateCcw,
} from '@ng-icons/lucide';
import { MatchCentreService } from '../../../core/api/match-centre.service';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueTimePipe } from '../../../core/competition/league-time.pipe';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { previewView } from './preview-view';

/**
 * The Pavilion preview for one fixture: summary, key factors and mood per side, and the
 * sources they cite, on a floodlit poster washed in both clubs' colours, in a panel dropdown
 * that is closed by default and for every new fixture. The sources are a plain disclosure, not a
 * nested dropdown: a page section's sticky heading has no place inside another one's body.
 * Agent text is bound as plain text only.
 */
@Component({
  selector: 'app-match-preview',
  templateUrl: './match-preview.html',
  styleUrl: './match-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--home-accent]': 'view()?.sides?.[0]?.accent',
    '[style.--away-accent]': 'view()?.sides?.[1]?.accent',
  },
  /* prettier-ignore */
  imports: [
    Dropdown,
    LeagueTimePipe,
    NgIcon,
    HlmBadge,
    HlmButton,
    HlmCollapsible,
    HlmCollapsibleContent,
    HlmCollapsibleTrigger,
  ],
  viewProviders: [
    provideIcons({ lucideChevronDown, lucideExternalLink, lucidePenLine, lucideRotateCcw }),
  ],
})
export class MatchPreview {
  private readonly matchCentre = inject(MatchCentreService);
  private readonly competition = inject(CompetitionService);
  /** The display zone for the preview's timestamp. */
  readonly zone = inject(LeagueTime).zone;
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();
  /** Club ids for colours. */
  readonly homeClub = input('');
  readonly awayClub = input('');
  /** The sources list, closed by default and for every new fixture. */
  readonly sourcesOpen = linkedSignal({ source: this.fixtureId, computation: () => false });
  /** The five-step mood scale. */
  readonly steps = [1, 2, 3, 4, 5] as const;

  private readonly resource = this.matchCentre.preview(() => this.fixtureId());
  readonly loading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  readonly failed = computed(() => this.resource.status() === 'error');
  readonly view = computed(() => {
    const preview = this.resource.hasValue() ? this.resource.value()?.preview : null;
    return preview
      ? previewView(
          this.competition.current(),
          preview,
          this.home(),
          this.away(),
          this.homeClub(),
          this.awayClub(),
        )
      : null;
  });

  reload(): void {
    this.resource.reload();
  }
}
