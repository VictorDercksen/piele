import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { PageData } from './core/layout/shell/page-data';
import { memberRequired, notYetMember, signedIn, signedOut } from './core/auth/auth.guards';
import { profileMissing, profileRequired } from './core/profile/profile.guards';
import { captainOnly } from './features/captain/captain.guard';

const page = (data: PageData) => data;

export const routes: Routes = [
  {
    path: 'sign-in',
    title: 'Sign in · Piele',
    canActivate: [signedOut],
    loadComponent: () => import('./features/sign-in/sign-in.page').then((m) => m.SignInPage),
  },
  {
    path: 'claim',
    title: 'Claim your name · Piele',
    canActivate: [signedIn, notYetMember],
    loadComponent: () => import('./features/sign-in/claim.page').then((m) => m.ClaimPage),
  },
  {
    path: 'welcome',
    title: 'Welcome · Piele',
    canActivate: [signedIn, memberRequired, profileMissing],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'profile',
    title: 'Your profile · Piele',
    canActivate: [signedIn, memberRequired, profileRequired],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [signedIn, memberRequired, profileRequired],
    children: [
      {
        path: '',
        title: 'Piele',
        data: page({ eyebrow: 'OVERVIEW', title: 'Your clubhouse.' }),
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'match/:fixtureId',
        title: 'Match centre · Piele',
        data: page({
          eyebrow: 'MATCH CENTRE',
          title: 'The match centre.',
          parent: { label: 'Home', path: '/' },
        }),
        loadComponent: () => import('./features/match/match.page').then((m) => m.MatchPage),
      },
      {
        path: 'standings',
        title: 'Standings · Piele',
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
        title: 'Duties · Piele',
        data: page({ eyebrow: 'DUTIES', title: 'The duty register.' }),
        loadComponent: () => import('./features/duties/duties.page').then((m) => m.DutiesPage),
      },
      {
        path: 'decisions',
        title: 'Decisions · Piele',
        data: page({ eyebrow: 'DECISIONS', title: 'Have your say.' }),
        loadComponent: () =>
          import('./features/decisions/decisions.page').then((m) => m.DecisionsPage),
      },
      {
        path: 'more',
        title: 'More · Piele',
        data: page({ eyebrow: 'MORE', title: 'Around the club.' }),
        loadComponent: () => import('./features/more/more.page').then((m) => m.MorePage),
      },
      {
        path: 'constitution',
        title: 'Constitution · Piele',
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
        title: "Captain's desk · Piele",
        canActivate: [captainOnly],
        data: page({
          eyebrow: "CAPTAIN'S DESK",
          title: "The captain's desk.",
          underMore: true,
        }),
        loadComponent: () => import('./features/captain/captain.page').then((m) => m.CaptainPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
