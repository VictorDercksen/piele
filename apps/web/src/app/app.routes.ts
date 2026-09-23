import { Routes } from '@angular/router';
import { Shell } from './core/layout/shell/shell';
import { PageData } from './core/layout/shell/page-data';
import { profileMissing, profileRequired } from './core/profile/profile.guards';
import { captainOnly } from './features/captain/captain.guard';

const page = (data: PageData) => data;

export const routes: Routes = [
  {
    path: 'welcome',
    title: 'Welcome · Piele',
    canActivate: [profileMissing],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'profile',
    title: 'Your profile · Piele',
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
        title: 'Piele',
        data: page({ crumb: 'HOME', eyebrow: 'OVERVIEW', title: 'Your clubhouse.' }),
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'rounds',
        title: 'Rounds · Piele',
        data: page({ crumb: 'ROUNDS', eyebrow: 'ROUNDS', title: 'The weekend line-up.' }),
        loadComponent: () => import('./features/rounds/rounds.page').then((m) => m.RoundsPage),
      },
      {
        path: 'standings',
        title: 'Standings · Piele',
        data: page({
          crumb: 'STANDINGS',
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
        data: page({ crumb: 'DUTIES', eyebrow: 'DUTIES', title: 'The duty register.' }),
        loadComponent: () => import('./features/duties/duties.page').then((m) => m.DutiesPage),
      },
      {
        path: 'decisions',
        title: 'Decisions · Piele',
        data: page({ crumb: 'DECISIONS', eyebrow: 'DECISIONS', title: 'Have your say.' }),
        loadComponent: () =>
          import('./features/decisions/decisions.page').then((m) => m.DecisionsPage),
      },
      {
        path: 'more',
        title: 'More · Piele',
        data: page({ crumb: 'MORE', eyebrow: 'MORE', title: 'Around the club.' }),
        loadComponent: () => import('./features/more/more.page').then((m) => m.MorePage),
      },
      {
        path: 'constitution',
        title: 'Constitution · Piele',
        data: page({
          crumb: 'CONSTITUTION',
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
          crumb: "CAPTAIN'S DESK",
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
