import { Route, Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { PageData } from './core/layout/shell/page-data';
import { signedIn, signedOut } from './core/auth/auth.guards';
import { adminOnly, leagueHome, leagueRequired, legacyLeaguePath } from './core/league/league.guards';
import { profileMissing, profileRequired } from './core/profile/profile.guards';
import { captainOnly } from './features/captain/captain.guard';

const page = (data: PageData) => data;

/** A page from before leagues had slugs, sent on to the same page in the account's league. */
const legacy = (path: string): Route => ({
  path,
  canActivate: [signedIn, legacyLeaguePath],
  children: [],
});

/**
 * Account routes are bare; every league page sits under the league's slug (`/piele/duties`).
 * The words used here (`sign-in`, `join`, `no-league`, `manage` and the legacy page names)
 * cannot be league slugs (`core/league/league-slugs.ts`).
 */
export const routes: Routes = [
  {
    path: 'sign-in',
    title: 'Sign in · The Pavilion',
    canActivate: [signedOut],
    loadComponent: () => import('./features/sign-in/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: 'join/:code',
    title: 'Join a league · The Pavilion',
    canActivate: [signedIn],
    loadComponent: () => import('./features/join/join.page').then((m) => m.JoinPage),
  },
  {
    path: 'no-league',
    title: 'No league yet · The Pavilion',
    canActivate: [signedIn],
    loadComponent: () => import('./features/no-league/no-league.page').then((m) => m.NoLeaguePage),
  },
  {
    path: 'manage',
    title: 'Manage leagues · The Pavilion',
    canActivate: [signedIn, adminOnly],
    loadComponent: () => import('./features/manage/manage.page').then((m) => m.ManagePage),
  },
  { path: '', pathMatch: 'full', canActivate: [signedIn, leagueHome], children: [] },
  ...[
    'standings',
    'duties',
    'decisions',
    'constitution',
    'captain',
    'more',
    'profile',
    'welcome',
    'match/:fixtureId',
  ].map(legacy),
  {
    path: ':league',
    canActivate: [signedIn, leagueRequired],
    children: [
      {
        path: 'welcome',
        title: 'Welcome · The Pavilion',
        canActivate: [profileMissing],
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'profile',
        title: 'Your profile · The Pavilion',
        canActivate: [profileRequired],
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: '',
        component: Shell,
        canActivate: [profileRequired],
        children: [
          {
            path: '',
            title: 'The Pavilion',
            data: page({ eyebrow: 'OVERVIEW', title: 'Your clubhouse.' }),
            loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
          },
          {
            path: 'match/:fixtureId',
            title: 'Match centre · The Pavilion',
            data: page({
              eyebrow: 'MATCH CENTRE',
              title: 'The match centre.',
              parent: { label: 'Home', path: '/' },
            }),
            loadComponent: () => import('./features/match/match.page').then((m) => m.MatchPage),
          },
          {
            path: 'standings',
            title: 'Standings · The Pavilion',
            data: page({
              eyebrow: 'STANDINGS',
              title: 'The pecking order.',
              underMore: true,
            }),
            loadComponent: () =>
              import('./features/standings/standings.page').then((m) => m.StandingsPage),
          },
          {
            path: 'duties',
            title: 'Duties · The Pavilion',
            data: page({ eyebrow: 'DUTIES', title: 'The duty register.' }),
            loadComponent: () => import('./features/duties/duties.page').then((m) => m.DutiesPage),
          },
          {
            path: 'decisions',
            title: 'Decisions · The Pavilion',
            data: page({ eyebrow: 'DECISIONS', title: 'Have your say.' }),
            loadComponent: () =>
              import('./features/decisions/decisions.page').then((m) => m.DecisionsPage),
          },
          {
            path: 'more',
            title: 'More · The Pavilion',
            data: page({ eyebrow: 'MORE', title: 'Around the club.' }),
            loadComponent: () => import('./features/more/more.page').then((m) => m.MorePage),
          },
          {
            path: 'constitution',
            title: 'Constitution · The Pavilion',
            data: page({
              eyebrow: 'SEASON DOCUMENT',
              title: 'Same club. Shared rules.',
              seasonWide: true,
              underMore: true,
            }),
            loadComponent: () =>
              import('./features/constitution/constitution.page').then((m) => m.ConstitutionPage),
          },
          {
            path: 'captain',
            title: "Captain's desk · The Pavilion",
            canActivate: [captainOnly],
            data: page({
              eyebrow: "CAPTAIN'S DESK",
              title: "The captain's desk.",
              underMore: true,
            }),
            loadComponent: () =>
              import('./features/captain/captain.page').then((m) => m.CaptainPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
