import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { authInterceptor } from './core/auth/auth.interceptor';
import { EmptyLeagueData, LeagueData } from './core/league/league-data';
import { HttpLeagueData } from './core/league/http-league-data';
import { SampleLeagueData } from './core/league/sample-league-data';
import { routes } from './app.routes';

/** Sample records in development, the API when it is configured, otherwise an empty league. */
const leagueData = environment.sampleLeagueData
  ? SampleLeagueData
  : environment.apiUrl && environment.supabaseUrl
    ? HttpLeagueData
    : EmptyLeagueData;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    { provide: LeagueData, useClass: leagueData },
  ],
};
