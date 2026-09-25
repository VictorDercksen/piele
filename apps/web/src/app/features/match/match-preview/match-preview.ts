import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideExternalLink,
  lucideQuote,
  lucideRotateCcw,
} from '@ng-icons/lucide';
import { MatchCentreService } from '../../../core/api/match-centre.service';
import { previewView } from './preview-view';

/** South African Standard Time has no daylight saving, so a fixed offset is exact. */
const SAST = '+0200';

// TEMP design exploration: pick a variant with localStorage 'piele-preview-variant'.
const VARIANTS = ['broadcast', 'programme', 'momentum', 'tape', 'poster'] as const;
function storedVariant(): string {
  try {
    const v = localStorage.getItem('piele-preview-variant') ?? '';
    return (VARIANTS as readonly string[]).includes(v) ? v : 'broadcast';
  } catch {
    return 'broadcast';
  }
}

/**
 * The Piele preview for one fixture: summary, key factors and mood per side, and the
 * sources they cite. Agent text is bound as plain text only.
 */
@Component({
  selector: 'app-match-preview',
  templateUrl: './match-preview.html',
  styleUrl: './match-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    'aria-labelledby': 'preview-title',
    '[attr.data-variant]': 'variant',
    '[style.--home-accent]': 'view()?.sides?.[0]?.accent',
    '[style.--away-accent]': 'view()?.sides?.[1]?.accent',
  },
  imports: [DatePipe, NgIcon, NgTemplateOutlet],
  viewProviders: [
    provideIcons({ lucideChevronDown, lucideExternalLink, lucideQuote, lucideRotateCcw }),
  ],
})
export class MatchPreview {
  private readonly matchCentre = inject(MatchCentreService);
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();
  /** Club ids for colours and crests. */
  readonly homeClub = input('');
  readonly awayClub = input('');
  readonly sast = SAST;
  readonly variant = storedVariant();
  readonly steps = [1, 2, 3, 4, 5] as const;

  private readonly resource = this.matchCentre.preview(() => this.fixtureId());
  readonly loading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  readonly failed = computed(() => this.resource.status() === 'error');
  readonly view = computed(() => {
    const preview = this.resource.hasValue() ? this.resource.value()?.preview : null;
    return preview
      ? previewView(preview, this.home(), this.away(), this.homeClub(), this.awayClub())
      : null;
  });
  /** Mood balance from -4 (away far happier) to 4 (home far happier). */
  readonly balance = computed(() => {
    const sides = this.view()?.sides;
    return sides ? sides[0].mood.step - sides[1].mood.step : 0;
  });
  /** Factors paired by position for the side-by-side comparison. */
  readonly pairs = computed(() => {
    const sides = this.view()?.sides;
    if (!sides) return [];
    const count = Math.max(sides[0].factors.length, sides[1].factors.length);
    return Array.from({ length: count }, (_, i) => ({
      home: sides[0].factors[i] ?? null,
      away: sides[1].factors[i] ?? null,
    }));
  });

  reload(): void {
    this.resource.reload();
  }
}
