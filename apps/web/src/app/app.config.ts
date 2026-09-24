import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { EmptyLeagueData, LeagueData } from './core/league/league-data';
import { SampleLeagueData } from './core/league/sample-league-data';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    {
      provide: LeagueData,
      useClass: environment.sampleLeagueData ? SampleLeagueData : EmptyLeagueData,
    },
  ],
};
