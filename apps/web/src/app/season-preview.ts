import type { FixturePreview } from './match-hero';

export interface RoundDuty {
  member: string;
  title: string;
  deadline: string;
  status: 'Open' | 'Awaiting review' | 'Completed';
  marks: number;
}
export interface RoundMember {
  rank: string;
  initials: string;
  name: string;
  team: string;
  points: string;
  marks: number;
}
export interface RoundPoll {
  question: string;
  description: string;
  options: string[];
  closes: string;
  status: 'Open' | 'Closed';
  turnout: number;
  result?: string;
}
export interface SeasonRound {
  id: number;
  title?: string;
  code: string;
  dates: string;
  status: 'Completed' | 'In review' | 'Current' | 'Upcoming';
  deadline: string;
  fixtures: FixturePreview[];
  members: RoundMember[];
  duties: RoundDuty[];
  poll?: RoundPoll;
  activity: string;
  reviews: string[];
}

const teams: Record<string, [string, string]> = {
  Stormers: ['dhl-stormers', 'Cape Town Stadium'],
  Munster: ['munster-rugby', 'Thomond Park'],
  Bulls: ['vodacom-bulls', 'Loftus Versfeld'],
  Leinster: ['leinster-rugby', 'Aviva Stadium'],
  Sharks: ['hollywoodbets-sharks', 'Kings Park'],
  Glasgow: ['glasgow-warriors', 'Scotstoun Stadium'],
  Lions: ['10bet-lions', 'Ellis Park'],
  Ulster: ['ulster-rugby', 'Kingspan Stadium'],
};
function fixture(
  home: string,
  away: string,
  day: string,
  time: string,
  score?: string,
): FixturePreview {
  return {
    home,
    away,
    homeAsset: teams[home][0],
    awayAsset: teams[away][0],
    venue: teams[home][1],
    day,
    time,
    score,
  };
}
const roster = [
  ['JP', 'Johan Pretorius', 'dhl-stormers'],
  ['PW', 'Pieter Wessels', 'vodacom-bulls'],
  ['VD', 'Victor Dercksen', 'hollywoodbets-sharks'],
  ['FB', 'Franco Botha', 'munster-rugby'],
  ['LM', 'Liam Meyer', 'leinster-rugby'],
  ['AS', 'Arno Smit', '10bet-lions'],
];
function table(order: number[], points: number[], marks: number[]): RoundMember[] {
  return order.map((person, index) => ({
    rank: String(index + 1).padStart(2, '0'),
    initials: roster[person][0],
    name: roster[person][1],
    team: roster[person][2],
    points: points[index].toFixed(1),
    marks: marks[index],
  }));
}

export const SEASON_ROUNDS: SeasonRound[] = [
  {
    id: 1,
    code: '01',
    dates: '25–27 Sep 2026',
    status: 'Completed',
    deadline: '25 Sep 2026 · 19:00 SAST',
    fixtures: [
      fixture('Bulls', 'Sharks', 'FRI 25 SEP', '19:00', '24–18'),
      fixture('Munster', 'Lions', 'SAT 26 SEP', '15:00', '31–20'),
      fixture('Glasgow', 'Stormers', 'SAT 26 SEP', '17:15', '19–26'),
    ],
    members: table([1, 0, 2, 4, 5, 3], [15, 13.5, 12, 10, 8.5, 6], [0, 0, 0, 0, 0, 0]),
    duties: [
      {
        member: 'Franco Botha',
        title: 'Round 1 Spoon duty',
        deadline: '02 Oct 2026 · 20:00 SAST',
        status: 'Completed',
        marks: 0,
      },
    ],
    poll: {
      question: 'Accept the Round 1 fixture correction?',
      description: 'The corrected Glasgow–Stormers result was reviewed by the league.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '29 Sep 2026 · 21:00 SAST',
      status: 'Closed',
      turnout: 10,
      result: 'Correction accepted · 8 for, 1 against, 1 abstention.',
    },
    activity: 'Pieter wins Round 1 with 15.0 points. Franco’s evidence was accepted.',
    reviews: [],
  },
  {
    id: 2,
    code: '02',
    dates: '02–04 Oct 2026',
    status: 'In review',
    deadline: '02 Oct 2026 · 18:45 SAST',
    fixtures: [
      fixture('Sharks', 'Munster', 'FRI 02 OCT', '18:45', '28–21'),
      fixture('Stormers', 'Bulls', 'SAT 03 OCT', '15:00', '22–19'),
      fixture('Leinster', 'Lions', 'SAT 03 OCT', '17:15', '35–17'),
      fixture('Ulster', 'Glasgow', 'SAT 03 OCT', '19:30', '16–23'),
    ],
    members: table([0, 3, 1, 5, 4, 2], [16, 14, 12, 10.5, 9, 5.5], [0, 0, 0, 0, 2, 1]),
    duties: [
      {
        member: 'Victor Dercksen',
        title: 'Round 2 Spoon duty',
        deadline: '11 Oct 2026 · 20:00 SAST',
        status: 'Open',
        marks: 1,
      },
      {
        member: 'Liam Meyer',
        title: 'Round 2 pick confirmation',
        deadline: '11 Oct 2026 · 20:00 SAST',
        status: 'Awaiting review',
        marks: 2,
      },
    ],
    poll: {
      question: 'Accept the Round 2 result correction?',
      description: 'Review the proposed result correction before the round is finalised.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '10 Oct 2026 · 21:00 SAST',
      status: 'Open',
      turnout: 7,
    },
    activity:
      'Johan leads Round 2 with 16.0 points. A result correction is awaiting the league’s decision.',
    reviews: ['Liam’s Round 2 evidence', 'Round 2 result import finding'],
  },
  {
    id: 3,
    code: '03',
    dates: '09–11 Oct 2026',
    status: 'Current',
    deadline: '09 Oct 2026 · 18:45 SAST',
    fixtures: [
      fixture('Stormers', 'Munster', 'FRI 09 OCT', '18:45'),
      fixture('Bulls', 'Leinster', 'SAT 10 OCT', '15:00'),
      fixture('Sharks', 'Glasgow', 'SAT 10 OCT', '17:15'),
      fixture('Lions', 'Ulster', 'SAT 10 OCT', '19:30'),
    ],
    members: [],
    duties: [],
    poll: {
      question: 'Confirm the Round 3 pick deadline?',
      description: 'Review the proposed 18:45 SAST deadline before the opening fixture.',
      options: ['Confirm 18:45 SAST', 'Request a review', 'Abstain'],
      closes: '08 Oct 2026 · 21:00 SAST',
      status: 'Open',
      turnout: 8,
    },
    activity:
      'Round 3 fixtures are ready. Standings and duties will appear after results are recorded.',
    reviews: ['Confirm the Round 3 schedule'],
  },
  {
    id: 4,
    code: '04',
    dates: '16–18 Oct 2026',
    status: 'Upcoming',
    deadline: 'Awaiting confirmation',
    fixtures: [
      fixture('Munster', 'Bulls', 'FRI 16 OCT', '19:00'),
      fixture('Lions', 'Stormers', 'SAT 17 OCT', '15:00'),
    ],
    members: [],
    duties: [],
    activity: 'Two sample fixtures have been announced. The pick deadline has not been confirmed.',
    reviews: [],
  },
  ...Array.from({ length: 14 }, (_, index): SeasonRound => ({
    id: index + 5,
    code: String(index + 5).padStart(2, '0'),
    dates: 'Dates to be confirmed',
    status: 'Upcoming',
    deadline: 'Awaiting confirmation',
    fixtures: [],
    members: [],
    duties: [],
    activity:
      'This round has not been scheduled yet. No results, duties or decisions have been recorded.',
    reviews: [],
  })),
];
