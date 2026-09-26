import { URC_CLUB_BANNERS } from './club-banners';
import { URC_COUNTRIES } from './countries';
import { defineCompetition } from './define-competition';
import { URC_STADIUMS } from './stadiums';
import { URC_TEAMS } from './teams';
import { URC_SCHEDULE } from './urc-fixtures';

/** The United Rugby Championship 2026/27, from the local official snapshot. */
export const URC_2026_27 = defineCompetition({
  id: 'urc-2026-27',
  name: 'United Rugby Championship 2026/27',
  shortName: 'URC',
  timezone: 'Africa/Johannesburg',
  schedule: URC_SCHEDULE,
  regularRounds: 18,
  playoffs: [
    { code: 'QF', title: 'Quarter-finals', dates: '28–29 May 2027' },
    { code: 'SF', title: 'Semi-finals', dates: '05 Jun 2027' },
    { code: 'F', title: 'Grand final', dates: '19 Jun 2027' },
  ],
  teams: URC_TEAMS,
  stadiums: URC_STADIUMS,
  banners: URC_CLUB_BANNERS,
  countries: URC_COUNTRIES,
  ball: 'assets/images/urc-ball.webp',
  emblem: 'assets/images/urc-emblem.svg',
  placeholderJersey: 'assets/images/jerseys/tbc.svg',
});
