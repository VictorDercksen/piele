import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink, lucideRotateCcw } from '@ng-icons/lucide';
import { MatchCentreService } from '../../../core/api/match-centre.service';
import { previewView } from './preview-view';

/** South African Standard Time has no daylight saving, so a fixed offset is exact. */
const SAST = '+0200';

/**
 * The Piele preview for one fixture: summary, key factors and mood per side, and the
 * sources they cite. Agent text is bound as plain text only.
 */
@Component({
  selector: 'app-match-preview',
  templateUrl: './match-preview.html',
  styleUrl: './match-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-labelledby': 'preview-title' },
  imports: [DatePipe, NgIcon],
  viewProviders: [provideIcons({ lucideExternalLink, lucideRotateCcw })],
})
export class MatchPreview {
  private readonly matchCentre = inject(MatchCentreService);
  readonly fixtureId = input.required<string>();
  readonly home = input.required<string>();
  readonly away = input.required<string>();
  readonly sast = SAST;

  private readonly resource = this.matchCentre.preview(() => this.fixtureId());
  readonly loading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  readonly failed = computed(() => this.resource.status() === 'error');
  readonly view = computed(() => {
    const preview = this.resource.hasValue() ? this.resource.value()?.preview : null;
    return preview ? previewView(preview, this.home(), this.away()) : null;
  });

  reload(): void {
    this.resource.reload();
  }
}
