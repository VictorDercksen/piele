import { httpResource } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CompetitionService } from '../competition/competition.service';
import { SelectedRoundService } from '../competition/selected-round.service';
import { FixtureWeather, RoundWeather } from './match-centre.models';

/**
 * Kickoff forecasts for the selected round's fixtures. The match page aligns the selected
 * round with its fixture, so this covers every page. Idle while the API is not configured.
 */
@Service()
export class RoundWeatherService {
  private readonly selected = inject(SelectedRoundService);
  private readonly competition = inject(CompetitionService);
  readonly configured = !!environment.apiUrl;

  private readonly resource = httpResource<RoundWeather>(() =>
    this.configured
      ? `${environment.apiUrl}/v1/competitions/${this.competition.current().id}/rounds/${this.selected.id()}/weather`
      : undefined,
  );
  private readonly byFixture = computed(() => {
    const weather = this.resource.hasValue() ? this.resource.value() : undefined;
    return new Map((weather?.matches ?? []).map((m) => [m.fixtureId, m]));
  });

  /** The fixture's kickoff forecast, when the API has one. */
  forecast(fixtureId: string): FixtureWeather | undefined {
    const weather = this.byFixture().get(fixtureId);
    return weather?.status === 'ok' && weather.weatherCode !== null ? weather : undefined;
  }
}
