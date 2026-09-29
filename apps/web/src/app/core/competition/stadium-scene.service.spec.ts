import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FixtureWeather } from '../api/match-centre.models';
import { CompetitionService } from './competition.service';
import { StadiumSceneService } from './stadium-scene.service';

const art = (team: string, condition: string) =>
  `assets/images/stadium-weather/${team}/${condition}.webp`;

describe('StadiumSceneService', () => {
  afterEach(() => vi.useRealTimers());

  async function setup(round: number, forecasts: readonly Partial<FixtureWeather>[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '', children: [] }]),
      ],
    });
    await TestBed.inject(Router).navigateByUrl(`/?round=${round}`);
    const scenes = TestBed.inject(StadiumSceneService);
    const competition = TestBed.inject(CompetitionService).current();
    // Reading a scene starts the round's forecast request.
    scenes.fixtureBackground(undefined);
    TestBed.tick();
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith(`/rounds/${round}/weather`))
      .flush({
        round,
        generatedAt: '2026-09-20T10:00:00Z',
        matches: forecasts.map((f) => ({
          status: 'ok',
          weatherCode: null,
          isDay: null,
          forecastHourUtc: null,
          ...f,
        })),
      });
    TestBed.tick();
    const fixture = (id: string) => competition.locate(id)!.fixture;
    const team = (id: string) => competition.team(id)!;
    return { scenes, fixture, team };
  }

  it('shows a venue in clear weather by day or night at kickoff without a forecast', async () => {
    const { scenes, fixture } = await setup(1);
    // 20:45 in Treviso in September; 13:30 at Ellis Park.
    expect(scenes.fixtureBackground(fixture('292584'))).toBe(art('benetton-rugby', 'night-dry'));
    expect(scenes.fixtureBackground(fixture('292587'))).toBe(art('10bet-lions', 'sunny-day'));
    expect(scenes.fixtureBackground(undefined)).toBeUndefined();
  });

  it('follows an available forecast and ignores one without a code', async () => {
    const { scenes, fixture } = await setup(1, [
      { fixtureId: '292584', weatherCode: 61, isDay: false },
      { fixtureId: '292587', weatherCode: 3, isDay: true },
      { fixtureId: '292589', status: 'unavailable' },
      { fixtureId: '292590', weatherCode: null },
    ]);
    expect(scenes.fixtureBackground(fixture('292584'))).toBe(art('benetton-rugby', 'rainy-night'));
    expect(scenes.fixtureBackground(fixture('292587'))).toBe(art('10bet-lions', 'overcast-day'));
    expect(scenes.fixtureBackground(fixture('292589'))).toBe(art('munster-rugby', 'sunny-day'));
    expect(scenes.fixtureBackground(fixture('292590'))).toBe(art('zebre-parma', 'sunny-day'));
  });

  it('shows the favourite team’s fixture, at its home ground when the venue has no artwork', async () => {
    const { scenes, fixture, team } = await setup(4, [
      { fixtureId: '292614', weatherCode: 63, isDay: false },
    ]);
    // Leinster v Munster at the Aviva Stadium, which has no artwork.
    expect(scenes.fixtureBackground(fixture('292614'))).toBeUndefined();
    expect(scenes.favouriteBackground(team('munster-rugby'))).toBe(
      art('munster-rugby', 'rainy-night'),
    );
    expect(scenes.favouriteBackground(undefined)).toBeUndefined();
  });

  it('shows a favourite team’s away fixture at the opponent’s ground', async () => {
    const { scenes, team } = await setup(1);
    expect(scenes.favouriteBackground(team('dhl-stormers'))).toBe(
      art('connacht-rugby', 'night-dry'),
    );
  });

  it('shows the home ground now when the team has no fixture in the round', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2027-05-20T10:00:00Z'));
    const { scenes, team } = await setup(19);
    expect(scenes.favouriteBackground(team('dhl-stormers'))).toBe(art('dhl-stormers', 'sunny-day'));
    expect(scenes.homeGroundBackground(team('dhl-stormers'))).toBe(
      art('dhl-stormers', 'sunny-day'),
    );
  });

  it('keeps the poster at the home ground, with the forecast only for a home fixture', async () => {
    const { scenes, team } = await setup(1, [
      { fixtureId: '292585', weatherCode: 71, isDay: false },
    ]);
    // Connacht host the Stormers in snow at Dexcom Stadium.
    expect(scenes.homeGroundBackground(team('connacht-rugby'))).toBe(
      art('connacht-rugby', 'snow-day'),
    );
    // The Stormers' ground at the away kickoff, 20:45 in Cape Town, without that forecast.
    expect(scenes.homeGroundBackground(team('dhl-stormers'))).toBe(
      art('dhl-stormers', 'night-dry'),
    );
    // Glasgow play at Thomond Park; Scotstoun is still in daylight at 17:30.
    expect(scenes.homeGroundBackground(team('glasgow-warriors'))).toBe(
      art('glasgow-warriors', 'sunny-day'),
    );
    expect(scenes.homeGroundBackground(undefined)).toBeUndefined();
  });
});
