import { Service, inject } from '@angular/core';
import { LiveScoresService } from '../api/live-scores.service';
import { RoundWeatherService } from '../api/round-weather.service';
import { ClubTeam, Fixture } from './competition.models';
import { CompetitionService } from './competition.service';
import { sunIsUp } from './daylight';
import { SelectedRoundService } from './selected-round.service';
import { skyScene } from './sky-scene';
import { StadiumBackgrounds, pickBackground } from './stadium-weather';

/**
 * Chooses stadium artwork for the weather at kickoff. A fixture's forecast sets the scene;
 * without one it is the clear scene, by day or night as the sun stands at the venue at
 * kickoff, or now when there is no fixture.
 */
@Service()
export class StadiumSceneService {
  private readonly competition = inject(CompetitionService);
  private readonly selected = inject(SelectedRoundService);
  private readonly weather = inject(RoundWeatherService);
  private readonly clock = inject(LiveScoresService).clock;

  /** The fixture's venue in its kickoff weather. Venues without artwork have none. */
  fixtureBackground(fixture: Fixture | undefined): string | undefined {
    const backgrounds = fixture && this.stadiums().backgrounds(fixture.venue);
    return backgrounds && this.scene(backgrounds, fixture, fixture.venue);
  }

  /**
   * The team's fixture of the selected round at its venue, or the team's home ground in
   * that fixture's weather when the venue has no artwork. On a bye, the home ground now.
   */
  favouriteBackground(team: ClubTeam | undefined): string | undefined {
    if (!team) return undefined;
    const fixture = this.fixtureOf(team);
    if (!fixture)
      return this.scene(team.stadiumBackgrounds, undefined, this.stadiums().home(team.id));
    return (
      this.fixtureBackground(fixture) ?? this.scene(team.stadiumBackgrounds, fixture, fixture.venue)
    );
  }

  /**
   * The team's home ground. It shows the forecast only when the team's fixture of the
   * selected round is played there; otherwise the clear scene at the fixture's kickoff,
   * or now on a bye.
   */
  homeGroundBackground(team: ClubTeam | undefined): string | undefined {
    if (!team) return undefined;
    const home = this.stadiums().home(team.id);
    const fixture = this.fixtureOf(team);
    const atHome = !!home && !!fixture && sameVenue(fixture.venue, home);
    return this.scene(team.stadiumBackgrounds, fixture, home, atHome);
  }

  private stadiums() {
    return this.competition.current().stadiums;
  }

  private fixtureOf(team: ClubTeam): Fixture | undefined {
    return this.selected
      .round()
      .fixtures.find((f) => f.homeAsset === team.id || f.awayAsset === team.id);
  }

  /** The artwork for the fixture's forecast, else for daylight at the venue at kickoff. */
  private scene(
    backgrounds: StadiumBackgrounds,
    fixture: Fixture | undefined,
    venue: string | undefined,
    useForecast = true,
  ): string | undefined {
    const forecast = useForecast && fixture ? this.weather.forecast(fixture.id) : undefined;
    const day = forecast?.isDay ?? this.daylight(venue, fixture?.kickoffUtc);
    return pickBackground(backgrounds, forecast ? skyScene(forecast.weatherCode) : null, day);
  }

  /** Whether the sun is up at the venue at kickoff, or now without a known kickoff. */
  private daylight(venue: string | undefined, kickoffUtc: string | null | undefined): boolean {
    const position = this.stadiums().position(venue);
    if (!position) return true;
    const kickoff = kickoffUtc ? Date.parse(kickoffUtc) : NaN;
    const instant = Number.isNaN(kickoff) ? this.clock() : kickoff;
    return sunIsUp(position.latitude, position.longitude, instant);
  }
}

function sameVenue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
