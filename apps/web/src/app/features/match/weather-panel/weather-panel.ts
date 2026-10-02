import { HlmBadge } from '@spartan-ng/helm/badge';
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideClock,
  lucideCloud,
  lucideCloudDrizzle,
  lucideCloudFog,
  lucideCloudLightning,
  lucideCloudMoon,
  lucideCloudRain,
  lucideCloudSnow,
  lucideCloudSun,
  lucideMapPin,
  lucideMoon,
  lucideRadar,
  lucideRefreshCw,
  lucideSun,
} from '@ng-icons/lucide';
import { WeatherSection } from '../../../core/api/match-centre.models';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueTimePipe } from '../../../core/competition/league-time.pipe';
import { sectionPill } from '../section-status';
import { weatherSky } from '../weather-sky';

/** The kickoff forecast, its source and sky artwork. Fetching belongs to the host page. */
@Component({
  selector: 'app-weather-panel',
  templateUrl: './weather-panel.html',
  styleUrl: './weather-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  imports: [
    DecimalPipe,
    HlmBadge,
    LeagueTimePipe,
    NgIcon,
  ],
  viewProviders: [
    provideIcons({
      lucideClock,
      lucideCloud,
      lucideCloudDrizzle,
      lucideCloudFog,
      lucideCloudLightning,
      lucideCloudMoon,
      lucideCloudRain,
      lucideCloudSnow,
      lucideCloudSun,
      lucideMapPin,
      lucideMoon,
      lucideRadar,
      lucideRefreshCw,
      lucideSun,
    }),
  ],
})
export class WeatherPanel {
  readonly forecast = input.required<WeatherSection>();
  readonly zone = inject(LeagueTime).zone;
  readonly status = computed(() => sectionPill(this.forecast().status, 'Available'));
  readonly sky = computed(() =>
    this.forecast().status === 'ok' ? weatherSky(this.forecast(), this.zone()) : null,
  );
  readonly message = computed(() =>
    this.forecast().status === 'too_early'
      ? 'The kickoff forecast opens seven days before the match.'
      : 'The forecast could not be loaded.',
  );
}
