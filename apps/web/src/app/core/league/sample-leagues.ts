import { competition } from '../competition/registry';
import {
  Account,
  DutyEvidence,
  Duty,
  FeedItem,
  LeagueMember,
  LeagueSummary,
  Poll,
  RoundNote,
  RoundStanding,
} from './league.models';

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

/** Everything one sample league starts with. */
export interface SampleLeagueSeed {
  readonly summary: LeagueSummary;
  /** The code in the league's join link, `/join/{code}`. */
  readonly joinCode: string;
  readonly captainId: string;
  /** When the league was made; the sample leagues predate the session. */
  readonly createdAt?: string;
  readonly members: readonly LeagueMember[];
  readonly standings: readonly RoundStanding[];
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

interface SummaryOptions {
  readonly emblemPreset?: string | null;
  readonly accentColour?: string | null;
  /** False for a league the sample account only sees as the admin. */
  readonly member?: boolean;
}

function summary(
  id: string,
  slug: string,
  name: string,
  captain: boolean,
  { emblemPreset = null, accentColour = null, member = true }: SummaryOptions = {},
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
  summary: summary('sample-league-piele', 'piele', 'Piele', true),
  joinCode: '5a3b1e0f9c2d',
  captainId: SAMPLE_ME,
  members: PIELE_MEMBERS,
  standings: [
    ...table(PIELE_MEMBERS, 1, [1, 0, 2, 4, 5, 3], [15, 13.5, 12, 10, 8.5, 6]),
    ...table(PIELE_MEMBERS, 2, [0, 3, 1, 5, 4, 2], [16, 14, 12, 10.5, 9, 5.5]),
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
      deadline: '25 Sep 2026 · 19:00 SAST',
      activity: 'Pieter wins Round 1 with 15.0 points. Franco’s evidence was accepted.',
    },
    {
      roundId: 2,
      deadline: '02 Oct 2026 · 18:45 SAST',
      activity:
        'Johan leads Round 2 with 16.0 points. A result correction is awaiting the league’s decision.',
    },
    {
      roundId: 3,
      deadline: '09 Oct 2026 · 18:45 SAST',
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
      'Glasgow Warriors 24–19 DHL Stormers.',
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
    emblemPreset: 'anvil',
    accentColour: '#c8742a',
  }),
  joinCode: 'b0e1d2c3a4f5',
  captainId: 'member-ds',
  members: POFADDER_MEMBERS,
  standings: [
    ...table(POFADDER_MEMBERS, 1, [3, 0, 2, 4, 1], [14, 12.5, 11, 9, 7.5]),
    ...table(POFADDER_MEMBERS, 2, [1, 2, 0, 3, 4], [15.5, 13, 12, 10, 6.5]),
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
      deadline: '25 Sep 2026 · 19:00 SAST',
      activity: 'Sanet wins Round 1 of the Pofadder Bowl with 14.0 points.',
    },
    {
      roundId: 2,
      deadline: '02 Oct 2026 · 18:45 SAST',
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
  standings: [
    ...table(THIRD_MEMBERS, 1, [1, 3, 0, 2], [13, 11.5, 10, 8]),
    ...table(THIRD_MEMBERS, 2, [0, 2, 3, 1], [14.5, 12, 9.5, 7]),
  ],
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
      deadline: '02 Oct 2026 · 18:45 SAST',
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
