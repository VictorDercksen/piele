import { competition } from '../competition/registry';
import {
  Account,
  DutyEvidence,
  Duty,
  FeedItem,
  FixtureResult,
  LeagueMember,
  LeagueRules,
  LeagueSummary,
  PickSide,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';
import { DEFAULT_RULES } from './superbru';

/**
 * Illustrative leagues for local development only. Names, points, duties and votes are
 * samples, never published competition results. The sample member ("You") captains Piele and
 * plays in the Pofadder Bowl under another captain; the sample account is the admin and also
 * sees the Sample Third XV, which it holds no membership in (the admin view).
 */

/** The sample member's id in every sample league. */
export const SAMPLE_ME = 'member-me';

export interface SampleDutyRecord {
  readonly id: string;
  readonly memberId: string;
  readonly roundId: number | null;
  readonly type: Duty['type'];
  readonly reason: string;
  readonly deadlineAt: string | null;
  readonly status: Duty['status'];
  readonly completedAt: string | null;
  readonly clockResetAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
  readonly evidence: readonly DutyEvidence[];
}

/** A stored pick, as the sample league keeps it; names come from the team sheet. */
export interface SamplePickRecord {
  readonly fixtureId: string;
  readonly memberId: string;
  readonly side: PickSide;
  readonly margin: number | null;
  readonly isDefault: boolean;
  readonly dutyId: string | null;
}

/** Everything one sample league starts with. */
export interface SampleLeagueSeed {
  readonly summary: LeagueSummary;
  /** The code in the league's join link, `/join/{code}`. */
  readonly joinCode: string;
  readonly captainId: string;
  /** When the league was made; the sample leagues predate the session. */
  readonly createdAt?: string;
  readonly members: readonly LeagueMember[];
  /** Recorded round totals: overrides of the totals derived from the picks. */
  readonly standings: readonly RoundStanding[];
  readonly picks: readonly SamplePickRecord[];
  readonly duties: readonly SampleDutyRecord[];
  readonly polls: readonly Poll[];
  readonly notes: readonly RoundNote[];
  readonly feed: readonly FeedItem[];
}

export function memberRecord(
  id: string,
  name: string,
  fullName: string,
  teamId: string,
  claimed = true,
): LeagueMember {
  return {
    id,
    name,
    fullName,
    initials: name.slice(0, 2).toUpperCase(),
    teamId,
    claimed,
    inSeason: true,
  };
}

export function feedItem(
  id: string,
  kind: FeedItem['kind'],
  roundId: number | null,
  title: string,
  detail: string,
  occurredAt: string,
  subjectName: string | null,
): FeedItem {
  return {
    id,
    kind,
    roundId,
    title,
    detail,
    occurredAt,
    actorName: 'You',
    subjectName,
    dutyId: null,
  };
}

function table(
  members: readonly LeagueMember[],
  roundId: number,
  order: number[],
  points: number[],
): RoundStanding[] {
  return order.map((member, index) => ({
    roundId,
    memberId: members[member].id,
    rank: index + 1,
    points: points[index],
  }));
}

const URC = competition('urc-2026-27');

/**
 * SAMPLE RESULTS, for the sample build only: illustrative scores for URC rounds 1 and 2 so
 * the sample picks can be scored. API builds read results from the league API and never
 * use these.
 */
export const sampleResults: Readonly<Record<string, FixtureResult>> = Object.fromEntries(
  (
    [
      // Round 1
      ['292584', 20, 20],
      ['292585', 17, 30],
      ['292586', 20, 26],
      ['292587', 24, 23],
      ['292588', 31, 14],
      ['292589', 20, 26],
      ['292590', 10, 45],
      ['292591', 15, 20],
      // Round 2
      ['292592', 32, 10],
      ['292593', 19, 24],
      ['292594', 21, 21],
      ['292595', 38, 12],
      ['292596', 13, 27],
      ['292597', 22, 25],
      ['292598', 18, 16],
      ['292599', 24, 19],
    ] as const
  ).map(([id, homeScore, awayScore]) => [id, { homeScore, awayScore, state: 'full_time' }]),
);

/** Each round's fixture ids in schedule order, for the pick lines below. */
function roundFixtures(roundId: number): string[] {
  return URC.fixtures
    .filter((f) => f.round === roundId)
    .sort(
      (a, b) => (a.kickoffUtc ?? '').localeCompare(b.kickoffUtc ?? '') || a.id.localeCompare(b.id),
    )
    .map((f) => f.id);
}

/**
 * One member's picks for a round, one token per fixture in schedule order: `H7` home by 7,
 * `A12` away by 12, `D` a draw, `M` missed; a trailing `*` marks a Superbru default pick.
 */
function picksFor(
  memberId: string,
  roundId: number,
  line: string,
  dutyId: string | null = null,
): SamplePickRecord[] {
  const fixtures = roundFixtures(roundId);
  return line.split(' ').map((token, index) => {
    const isDefault = token.endsWith('*');
    const code = token.replace('*', '');
    const side: PickSide =
      code[0] === 'H' ? 'home' : code[0] === 'A' ? 'away' : code[0] === 'D' ? 'draw' : 'missed';
    return {
      fixtureId: fixtures[index],
      memberId,
      side,
      margin: side === 'draw' ? 0 : side === 'missed' ? null : Number(code.slice(1)),
      isDefault,
      dutyId: isDefault || side === 'missed' ? dutyId : null,
    };
  });
}

function rules(change: Partial<LeagueRules> = {}): LeagueRules {
  return { ...DEFAULT_RULES, ...change };
}

interface SummaryOptions {
  readonly emblemPreset?: string | null;
  readonly accentColour?: string | null;
  /** False for a league the sample account only sees as the admin. */
  readonly member?: boolean;
  readonly rules?: LeagueRules;
}

function summary(
  id: string,
  slug: string,
  name: string,
  captain: boolean,
  {
    emblemPreset = null,
    accentColour = null,
    member = true,
    rules = DEFAULT_RULES,
  }: SummaryOptions = {},
): LeagueSummary {
  return {
    id,
    slug,
    name,
    timezone: 'Africa/Johannesburg',
    emblemPreset,
    emblemUrl: null,
    accentColour,
    competition: { id: URC.id, name: URC.name, shortName: URC.shortName },
    seasonName: `${URC.shortName} ${URC.season}`,
    inSeason: true,
    memberId: member ? SAMPLE_ME : null,
    // The sample member's name comes from the browser profile, as before leagues.
    displayName: null,
    isCaptain: captain,
    favouriteTeamId: null,
    rules,
  };
}

const PIELE_MEMBERS: readonly LeagueMember[] = [
  memberRecord('member-jp', 'Johan', 'Pretorius, Johan', 'dhl-stormers'),
  memberRecord('member-pw', 'PieterW', 'Wessels, Pieter', 'vodacom-bulls'),
  memberRecord(SAMPLE_ME, 'You', 'You', 'hollywoodbets-sharks'),
  memberRecord('member-fb', 'Franco', 'Botha, Franco', 'munster-rugby'),
  memberRecord('member-lm', 'Liam', 'Meyer, Liam', 'leinster-rugby'),
  memberRecord('member-as', 'Arno', 'Smit, Arno', '10bet-lions'),
];

const PIELE: SampleLeagueSeed = {
  summary: summary('sample-league-piele', 'piele', 'Piele', true, {
    rules: rules({ previousChampionMemberId: 'member-jp' }),
  }),
  joinCode: '5a3b1e0f9c2d',
  captainId: SAMPLE_ME,
  members: PIELE_MEMBERS,
  // Rounds 1 and 2 are derived from the picks; nothing is recorded over them.
  standings: [],
  picks: [
    ...picksFor('member-pw', 1, 'H3 A12 A5 H2 H15 A4 A30 A6'),
    ...picksFor('member-jp', 1, 'H7 A7 H6 A4 H10 A8 A20 H3'),
    ...picksFor(SAMPLE_ME, 1, 'H10 H5 A10 H8 H20 H3 A25 A4'),
    ...picksFor('member-fb', 1, 'H12 H8 H9 A6 H6 H10 H3 H7'),
    ...picksFor('member-lm', 1, 'A3 A14 H4 A10 H18 A2 A15 H5'),
    // Arno's picks were never made: Superbru defaults, under his pick confirmation duty.
    ...picksFor('member-as', 1, 'H5* H5* H5* H5* H5* H5* H5* H5*', 'duty-4'),
    ...picksFor('member-jp', 2, 'H20 A6 D H24 A12 A4 H3 H6'),
    ...picksFor('member-pw', 2, 'H12 A3 H4 H15 A7 H5 A4 H8'),
    ...picksFor(SAMPLE_ME, 2, 'H5 H7 H9 A3 H6 H12 A10 A5'),
    ...picksFor('member-fb', 2, 'H15 H2 A5 H30 A20 H8 H7 H10'),
    // Two picks missing, under Liam's pick confirmation duty.
    ...picksFor('member-lm', 2, 'M A8 H3 H20 M A9 A2 H4', 'duty-3'),
    ...picksFor('member-as', 2, 'H10 A4 H6 H12 A9 H3 H5 A3'),
  ],
  duties: [
    {
      id: 'duty-1',
      memberId: 'member-fb',
      roundId: 1,
      type: 'spoon',
      reason: 'Last place in Round 01.',
      deadlineAt: '2026-10-02T18:45:00Z',
      status: 'completed',
      completedAt: '2026-09-27T14:10:00Z',
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-09-26T08:00:00Z',
      evidence: [
        {
          id: 'link-1',
          submissionId: 'sub-1',
          assetId: 'asset-1',
          decision: 'accepted',
          submittedAt: '2026-09-27T14:10:00Z',
          claimedCompletedAt: null,
          decidedAt: '2026-09-27T19:00:00Z',
          reason: 'Clear video, spoon and beer both visible.',
          effectiveCompletedAt: '2026-09-27T14:10:00Z',
          note: 'Done at the braai.',
          submitterId: 'member-fb',
          submitterName: 'Franco',
        },
      ],
    },
    {
      id: 'duty-2',
      memberId: SAMPLE_ME,
      roundId: 2,
      type: 'spoon',
      reason: 'Last place in Round 02.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T08:00:00Z',
      evidence: [],
    },
    {
      id: 'duty-3',
      memberId: 'member-lm',
      roundId: 2,
      type: 'pick_confirmation',
      reason: 'Two picks missing on the Superbru round page.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T08:05:00Z',
      evidence: [
        {
          id: 'link-3',
          submissionId: 'sub-3',
          assetId: 'asset-3',
          decision: 'pending',
          submittedAt: '2026-10-04T10:30:00Z',
          claimedCompletedAt: null,
          decidedAt: null,
          reason: null,
          effectiveCompletedAt: null,
          note: 'Picks confirmed on the app, screen recording attached.',
          submitterId: 'member-lm',
          submitterName: 'Liam',
        },
      ],
    },
    {
      id: 'duty-4',
      memberId: 'member-as',
      roundId: 1,
      type: 'pick_confirmation',
      reason: 'No picks recorded for Round 01.',
      deadlineAt: '2026-09-01T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-08-30T08:00:00Z',
      evidence: [],
    },
  ],
  polls: [
    {
      id: 'poll-1',
      roundId: 1,
      question: 'Accept the Round 1 fixture correction?',
      description: 'The corrected Glasgow–Stormers result was reviewed by the league.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '29 Sep 2026 · 21:00 SAST',
      status: 'Closed',
      participants: 10,
      eligible: 12,
      result: 'Correction accepted · 8 for, 1 against, 1 abstention.',
    },
    {
      id: 'poll-2',
      roundId: 2,
      question: 'Accept the Round 2 result correction?',
      description: 'Review the proposed result correction before the round is finalised.',
      options: ['Accept correction', 'Keep original result', 'Abstain'],
      closes: '10 Oct 2026 · 21:00 SAST',
      status: 'Open',
      participants: 7,
      eligible: 12,
    },
    {
      id: 'poll-3',
      roundId: 3,
      question: 'Confirm the Round 3 pick deadline?',
      description: 'Review the proposed 18:45 SAST deadline before the opening fixture.',
      options: ['Confirm 18:45 SAST', 'Request a review', 'Abstain'],
      closes: '08 Oct 2026 · 21:00 SAST',
      status: 'Open',
      participants: 8,
      eligible: 12,
    },
  ],
  notes: [
    {
      roundId: 1,
      activity: 'PieterW takes the Round 1 cap. Franco’s spoon evidence was accepted.',
    },
    {
      roundId: 2,
      activity:
        'Johan takes the Round 2 cap. A result correction is awaiting the league’s decision.',
    },
    {
      roundId: 3,
      activity: 'Round 3 standings and duties will appear after results are recorded.',
    },
  ],
  feed: [
    feedItem(
      'feed-9',
      'evidence_submitted',
      2,
      'Liam submitted evidence for Round 02 Pick confirmation.',
      'Waiting for an uninvolved reviewer.',
      '2026-10-04T10:30:00Z',
      'Liam',
    ),
    feedItem(
      'feed-8',
      'duty_created',
      2,
      'You: Round 02 Spoon duty.',
      'Last place in Round 02.',
      '2026-10-03T08:00:00Z',
      'You',
    ),
    feedItem(
      'feed-7',
      'duty_created',
      2,
      'Liam: Round 02 Pick confirmation.',
      'Two picks missing on the Superbru round page.',
      '2026-10-03T08:05:00Z',
      'Liam',
    ),
    feedItem(
      'feed-6',
      'match_result',
      2,
      'Cardiff Rugby 32–10 Zebre Parma.',
      'Round 02 opener. Johan called it.',
      '2026-10-02T20:40:00Z',
      null,
    ),
    feedItem(
      'feed-5',
      'poll_opened',
      2,
      'Vote: accept the Round 2 result correction?',
      'Closes 10 Oct 2026 · 21:00 SAST.',
      '2026-10-02T09:00:00Z',
      null,
    ),
    feedItem(
      'feed-4',
      'evidence_accepted',
      1,
      'Franco: Round 01 Spoon duty completed.',
      'Clear video, spoon and beer both visible.',
      '2026-09-27T19:00:00Z',
      'Franco',
    ),
    feedItem(
      'feed-3',
      'evidence_submitted',
      1,
      'Franco submitted evidence for Round 01 Spoon duty.',
      'Done at the braai.',
      '2026-09-27T14:10:00Z',
      'Franco',
    ),
    feedItem(
      'feed-2',
      'duty_created',
      1,
      'Franco: Round 01 Spoon duty.',
      'Last place in Round 01.',
      '2026-09-26T08:00:00Z',
      'Franco',
    ),
    feedItem(
      'feed-1',
      'season_opened',
      null,
      'URC 2026/27 is open.',
      '6 members enrolled. You are captain.',
      '2026-09-20T08:00:00Z',
      null,
    ),
  ],
};

const POFADDER_MEMBERS: readonly LeagueMember[] = [
  memberRecord('member-ds', 'Doempie', 'Steyn, Doempie', 'vodacom-bulls'),
  memberRecord('member-kk', 'Kallie', 'Kruger, Kallie', 'hollywoodbets-sharks'),
  memberRecord(SAMPLE_ME, 'You', 'You', 'dhl-stormers'),
  memberRecord('member-sl', 'Sanet', 'Louw, Sanet', 'glasgow-warriors'),
  memberRecord('member-tn', 'Thabo', 'Nkosi, Thabo', '10bet-lions'),
  memberRecord('member-rb', 'Riaan', 'Botes, Riaan', '', false),
];

const POFADDER: SampleLeagueSeed = {
  summary: summary('sample-league-pofadder-bowl', 'pofadder-bowl', 'Pofadder Bowl', false, {
    emblemPreset: 'posts',
    accentColour: '#c8742a',
  }),
  joinCode: 'b0e1d2c3a4f5',
  captainId: 'member-ds',
  members: POFADDER_MEMBERS,
  // Round 1 is derived from the picks; round 2 has only recorded totals (no picks entered).
  standings: [...table(POFADDER_MEMBERS, 2, [1, 2, 0, 3, 4], [15.5, 13, 12, 10, 6.5])],
  picks: [
    ...picksFor('member-sl', 1, 'D A12 A6 A3 H16 A5 A28 A5'),
    ...picksFor('member-ds', 1, 'H5 A5 H3 H7 H12 A10 A18 H4'),
    ...picksFor(SAMPLE_ME, 1, 'H2 A9 A12 A3 H9 H2 A22 A8'),
    ...picksFor('member-tn', 1, 'A4 H6 A2 H12 A3 A3 A10 H2'),
    ...picksFor('member-kk', 1, 'H15 H10 H8 A9 H25 H7 H5 H12'),
  ],
  duties: [
    {
      id: 'duty-pb-1',
      memberId: 'member-kk',
      roundId: 1,
      type: 'spoon',
      reason: 'Last place in Round 01.',
      deadlineAt: '2026-10-02T18:45:00Z',
      status: 'completed',
      completedAt: '2026-09-28T17:20:00Z',
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-09-26T09:00:00Z',
      evidence: [
        {
          id: 'link-pb-1',
          submissionId: 'sub-pb-1',
          assetId: 'asset-pb-1',
          decision: 'accepted',
          submittedAt: '2026-09-28T17:20:00Z',
          claimedCompletedAt: null,
          decidedAt: '2026-09-28T19:30:00Z',
          reason: 'Spoon on the stoep, clearly filmed.',
          effectiveCompletedAt: '2026-09-28T17:20:00Z',
          note: 'Done in Pofadder.',
          submitterId: 'member-kk',
          submitterName: 'Kallie',
        },
      ],
    },
    {
      id: 'duty-pb-2',
      memberId: 'member-tn',
      roundId: 2,
      type: 'spoon',
      reason: 'Last place in Round 02.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T09:00:00Z',
      evidence: [],
    },
  ],
  polls: [],
  notes: [
    {
      roundId: 1,
      activity: 'Sanet takes the Round 1 cap in the Pofadder Bowl.',
    },
    {
      roundId: 2,
      activity: 'Kallie takes Round 2 with 15.5 points. Thabo holds the spoon.',
    },
  ],
  feed: [
    feedItem(
      'feed-pb-4',
      'duty_created',
      2,
      'Thabo: Round 02 Spoon duty.',
      'Last place in Round 02.',
      '2026-10-03T09:00:00Z',
      'Thabo',
    ),
    feedItem(
      'feed-pb-3',
      'evidence_accepted',
      1,
      'Kallie: Round 01 Spoon duty completed.',
      'Spoon on the stoep, clearly filmed.',
      '2026-09-28T19:30:00Z',
      'Kallie',
    ),
    feedItem(
      'feed-pb-2',
      'duty_created',
      1,
      'Kallie: Round 01 Spoon duty.',
      'Last place in Round 01.',
      '2026-09-26T09:00:00Z',
      'Kallie',
    ),
    feedItem(
      'feed-pb-5',
      'emblem_updated',
      null,
      'The Pofadder Bowl emblem was updated.',
      '',
      '2026-09-21T08:00:00Z',
      null,
    ),
    feedItem(
      'feed-pb-1',
      'season_opened',
      null,
      'The Pofadder Bowl is open.',
      '6 members enrolled. Doempie is captain.',
      '2026-09-19T08:00:00Z',
      null,
    ),
  ],
};

const THIRD_MEMBERS: readonly LeagueMember[] = [
  memberRecord('member-hm', 'Hennie', 'Marais, Hennie', 'vodacom-bulls'),
  memberRecord('member-zd', 'Zola', 'Dlamini, Zola', 'hollywoodbets-sharks'),
  memberRecord('member-ck', 'Carel', 'Kotze, Carel', 'dhl-stormers'),
  memberRecord('member-nv', 'Nadia', 'Visser, Nadia', 'leinster-rugby'),
  memberRecord('member-wj', 'Wikus', 'Jansen, Wikus', '', false),
];

/** A league the sample account is not in: the admin sees it without a membership. */
const THIRD: SampleLeagueSeed = {
  summary: summary('sample-league-third', 'sample-third', 'Sample Third XV', false, {
    accentColour: '#3f8f6b',
    member: false,
  }),
  joinCode: 'c7d8e9f0a1b2',
  captainId: 'member-hm',
  members: THIRD_MEMBERS,
  // Recorded totals only: no picks were entered in this league.
  standings: [
    ...table(THIRD_MEMBERS, 1, [1, 3, 0, 2], [13, 11.5, 10, 8]),
    ...table(THIRD_MEMBERS, 2, [0, 2, 3, 1], [14.5, 12, 9.5, 7]),
  ],
  picks: [],
  duties: [
    {
      id: 'duty-st-1',
      memberId: 'member-zd',
      roundId: 2,
      type: 'spoon',
      reason: 'Last place in Round 02.',
      deadlineAt: '2026-10-09T18:45:00Z',
      status: 'open',
      completedAt: null,
      clockResetAt: null,
      voidReason: null,
      createdAt: '2026-10-03T10:00:00Z',
      evidence: [],
    },
  ],
  polls: [],
  notes: [
    {
      roundId: 2,
      activity: 'Hennie takes Round 2. Zola holds the spoon.',
    },
  ],
  feed: [
    feedItem(
      'feed-st-2',
      'duty_created',
      2,
      'Zola: Round 02 Spoon duty.',
      'Last place in Round 02.',
      '2026-10-03T10:00:00Z',
      'Zola',
    ),
    feedItem(
      'feed-st-4',
      'member_returned',
      null,
      'Nadia is back.',
      '',
      '2026-09-24T08:00:00Z',
      'Nadia',
    ),
    feedItem(
      'feed-st-3',
      'member_left',
      null,
      'Nadia left the clubhouse.',
      'Moved to Cape Town for the season.',
      '2026-09-20T08:00:00Z',
      'Nadia',
    ),
    feedItem(
      'feed-st-1',
      'season_opened',
      null,
      'The Sample Third XV is open.',
      '5 members enrolled. Hennie is captain.',
      '2026-09-18T08:00:00Z',
      null,
    ),
  ],
};

/** Every sample league, in the account document's order (by name). */
export const SAMPLE_LEAGUES: readonly SampleLeagueSeed[] = [PIELE, POFADDER, THIRD];

/**
 * The sample account: a member of Piele and the Pofadder Bowl, and the admin, so it also
 * lists the Sample Third XV without a membership.
 */
export const SAMPLE_ACCOUNT: Account = {
  userId: 'sample-user',
  photoUrl: null,
  isAdmin: true,
  lastLeagueId: null,
  leagues: SAMPLE_LEAGUES.map((league) => league.summary),
};
