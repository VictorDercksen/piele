import type { ConstitutionHeader, ConstitutionSection } from './constitution.models';

/** The adopted constitution of Piele URC 26/27, with Amendment 1 approved. Wording is the document's; `**` marks bold. */
export const CONSTITUTION_HEADER: ConstitutionHeader = {
  pool: 'Piele URC 26/27',
  adopted: 'Adopted by the league on 25 September 2026',
  amendment: 'Amendment 1 of 1 October 2026 approved by the league on 2 October 2026',
};

export const CONSTITUTION_SECTIONS: readonly ConstitutionSection[] = [
  {
    id: 'article-1',
    label: 'Article 1',
    title: 'Name, authority and status',
    blocks: [
      {
        kind: 'clause',
        number: '1.1',
        text: 'The pool is **Piele URC 26/27**, competing in the Superbru United Rugby Championship Predictor for the 2026/27 season. **Victor Dercksen** serves as Pool Captain.',
      },
      {
        kind: 'clause',
        number: '1.2',
        text: "This is a voluntary agreement among friends. Superbru determines game scores and rankings. This Constitution governs the pool's additional duties, ceremonies and disputes. Picks, duties, videos and votes are recorded in **The Pavilion**, the league's private app (“the app”). No pool sanction changes a Superbru score.",
      },
      {
        kind: 'clause',
        number: '1.3',
        text: 'This Constitution was **adopted by decision of the league on 25 September 2026** and is in force from that date. It may only be amended under Article 9.',
      },
    ],
    intro:
      'We, the members of Piele URC 26/27, establish these rules to preserve fair competition, dependable picks and a proportionate amount of public embarrassment.',
  },
  {
    id: 'article-2',
    label: 'Article 2',
    title: 'Terms of the pool',
    blocks: [
      {
        kind: 'terms',
        terms: [
          {
            name: 'Pool / Pool Captain',
            text: 'Our private competition and its administrator. Members are also called brus in this document.',
          },
          {
            name: 'Round',
            text: 'The Superbru round used for the pool. This is the “game week” referred to in our rules.',
          },
          {
            name: 'Pick',
            text: 'A submitted prediction of the match outcome and winning margin, or a draw.',
          },
          {
            name: 'Leaderboard',
            text: 'The pool standings. Round performance and the cumulative season total are distinct.',
          },
          {
            name: 'Yellow Cap',
            text: "Superbru's award for the top eligible performer in a pool for a round.",
          },
          {
            name: 'Wooden Spoon',
            text: 'Our title for last place in a round, with the physical spoon duty in Article 4.',
          },
        ],
      },
    ],
  },
  {
    id: 'article-3',
    label: 'Article 3',
    title: 'The kick-off rule',
    blocks: [
      {
        kind: 'clause',
        number: '3.1',
        text: 'Every member shall record **a pick for each match before that match kicks off**. The app locks each pick at the scheduled kick-off. Picks made on Superbru must also be recorded in the app.',
      },
      {
        kind: 'clause',
        number: '3.2',
        text: 'A pick missing when its match kicks off is a breach, and a pick Superbru made for the member counts as missing. Missing picks in a round form one breach. A pick the Captain records afterwards does not cure it. Apply **Addendum A, A1**.',
      },
      {
        kind: 'clause',
        number: '3.3',
        text: 'Each member is responsible for checking that every pick has saved. “I was about to do it” shall be received as commentary, not as a submitted pick.',
      },
      {
        kind: 'clause',
        number: '3.4',
        text: "All deadlines are in **SAST (UTC+2)** and follow Superbru's round grouping; the app shows the official URC kick-off times. Submitted picks stand if a match is postponed. A rescheduled, added or reopened fixture requires a pick before its own kick-off. Nobody is penalised for a pick the app did not make available.",
      },
      {
        kind: 'clause',
        number: '3.5',
        text: 'Pick completeness and the Wooden Spoon are **separate duties**. Missing picks and finishing last in the same round attract two ceremonies under Addendum A.',
      },
    ],
  },
  {
    id: 'article-4',
    label: 'Article 4',
    title: 'The Wooden Spoon ceremony',
    blocks: [
      {
        kind: 'clause',
        number: '4.1',
        text: 'The member finishing **last in the pool for a completed round** shall hold the Wooden Spoon title for that round. This is based on round performance, not the cumulative season position. Ties are resolved under 4.5.',
      },
      {
        kind: 'clause',
        number: '4.2',
        text: 'The Spoon Holder shall upload a video of the required ceremony to the app **before the first match of the next round kicks off**. The ceremony is defined in **Addendum A, A1-A2**. For the final round, the Captain sets the deadline when the duty is recorded.',
      },
      {
        kind: 'clause',
        number: '4.3',
        text: "A **real wooden spoon must be visibly held in the Spoon Holder's hand throughout the drinking portion** of the video. A spoon on a table, an off-camera spoon or a spoon emoji does not satisfy this clause.",
      },
      {
        kind: 'clause',
        number: '4.4',
        text: "A missing, late or non-compliant video is referred to **Addendum A, A3-A4**. The spoon duty remains outstanding until a video is accepted under Article 5 or the Captain records completion on the member's behalf.",
      },
      {
        kind: 'clause',
        number: '4.5',
        text: "Round points as shown in the app decide the weekly Wooden Spoon once every match of the round is settled. Every member on the round's lowest points **shares the title and the duty**; if all members finish level, nobody holds the spoon. No retrospective tiebreak is applied.",
      },
      {
        kind: 'panel',
        title: 'The official position on cutlery',
        text: 'Possession is insufficient. Visibility is mandatory. Stainless steel has no standing in these proceedings.',
      },
    ],
  },
  {
    id: 'article-5',
    label: 'Article 5',
    title: 'Video review and conduct',
    blocks: [
      {
        kind: 'clause',
        number: '5.1',
        text: "Every ceremony video uploaded to the app is put to the league's vote for **24 hours** from its upload. The eligible voters are the league's active members other than the subject and the uploader, fixed at upload. Each may accept the video or veto it with a reason, and may still veto after accepting until the vote closes. Ballots are private.",
      },
      {
        kind: 'clause',
        number: '5.2',
        text: 'The video is accepted when **more than half of the eligible voters accept it**, or when 24 hours pass without a veto. With nobody eligible to vote it is accepted at once. An accepted video completes the duty from the time of upload, or from the completion time the Captain entered when recording it for a member.',
      },
      {
        kind: 'clause',
        number: '5.3',
        text: "A veto stops the vote and refers the video to the Captain, or to the league's named stand-in when the duty or the veto is the Captain's, or otherwise to the app's administrator. Upholding the veto rejects the video and the duty stays open under **Addendum A**. Dismissing it reopens the vote on the original clock. The Captain may also accept or reject any video directly, never their own.",
      },
      {
        kind: 'note',
        text: '**House terminology:** A video vote is called a “TMO review”. This is a rugby joke used by this pool, not a Superbru dispute process.',
      },
    ],
  },
  {
    id: 'article-6',
    label: 'Article 6',
    title: 'Season champion and season loser',
    blocks: [
      {
        kind: 'clause',
        number: '6.1',
        text: "The member finishing first on the pool's final season leaderboard shall be declared **Season Champion of Piele URC 26/27** and receives the Champion's award, presented at the end-of-season function.",
      },
      {
        kind: 'panel',
        title: "The Champion's award",
        text: 'A bottle of **KWV XX 20 Year Old brandy**, custody of the **floating trophy** for the season, and a **Superbru certificate**. Any contribution towards the award or the function is agreed separately by the league.',
      },
      {
        kind: 'clause',
        number: '6.2',
        text: "The member finishing last on the pool's final season leaderboard shall be declared the **Season Wooden Spoon Holder**, also referred to as the overall loser. A tie on the lowest season points is shared in the same way as 4.5.",
      },
      {
        kind: 'clause',
        number: '6.3',
        text: 'The overall loser shall **travel by bus to a destination selected by the league**, wearing a **uniform selected by the league**, to attend the end-of-season function. The destination and uniform are chosen by the league.',
      },
      {
        kind: 'clause',
        number: '6.4',
        text: "The league shall determine the function's date, venue and budget, and shall give members **at least 14 days' notice** of the function, the journey and the uniform. Return transport for the Season Wooden Spoon Holder is arranged with the league.",
      },
      {
        kind: 'subsection',
        title: '6.5 The brandy mile',
        paragraphs: [
          "The Season Wooden Spoon Holder **shall participate in a brandy mile** at the end-of-season function, in the league's presence, wearing the approved uniform and carrying the wooden spoon.",
          'Alcohol-free substitutes, declining, or stopping are not permitted. Neither the Captain nor a league vote may override this requirement.',
        ],
      },
      {
        kind: 'subsection',
        title: '6.6 Final settlement',
        paragraphs: [
          'The season closes when the final ends; default marks stop at that moment (A3). Outstanding duties shall be settled under Addendum A at the end-of-season function, after which the sanctions record closes. If the Season Wooden Spoon Holder cannot attend, the league shall agree a substitute ceremony. The season trophy does not confer disciplinary immunity.',
        ],
      },
      {
        kind: 'quote',
        lines: ['The champion drinks the brandy.', 'The loser takes the bus.'],
      },
    ],
  },
  {
    id: 'addendum-a',
    label: 'Addendum A',
    title: 'The sanctions register',
    blocks: [
      {
        kind: 'subsection',
        title: 'A1. The standard sanction',
        paragraphs: [
          'A confirmed breach attracts one **accountability ceremony**. The member shall drink a beer. Alcohol-free drinks, non-alcoholic substitutes, and spoken admissions without drinking are not permitted. There is no required volume, speed or finishing requirement. Declining alcohol is not an available option under this Constitution.',
        ],
      },
      {
        kind: 'subsection',
        title: 'A2. Completion and evidence',
        paragraphs: [
          'Every ceremony shall be on camera and uploaded to the app against its duty: the member shall drink beer on camera, and a Wooden Spoon video shall also satisfy Article 4. Alcohol-free substitutes and spoken alternatives are not permitted. **Each duty requires its own ceremony and its own video.** A missed-pick duty and a Wooden Spoon duty are distinct and are not combined in one video. No additional beers are required for a single duty. Videos are reviewed under Article 5.',
        ],
      },
      {
        kind: 'table',
        headers: ['Trigger', 'Action and deadline'],
        rows: [
          {
            trigger: 'Missing or partial picks',
            article: 'Article 3',
            action:
              "One ceremony on camera, separate from any Wooden Spoon duty for the same round, before the following round's first kick-off.",
          },
          {
            trigger: 'Weekly Wooden Spoon',
            article: 'Article 4',
            action:
              "Video ceremony with the spoon visibly in hand and beer consumed on camera, before the next round's first kick-off (the Captain sets the final round's deadline). Alcohol-free substitutes are not permitted.",
          },
          {
            trigger: 'Video rejected on review',
            article: 'Article 5',
            action:
              'Upload a corrected video. The duty stays open and default marks continue until a video is accepted. No additional beer beyond the corrected ceremony.',
          },
          {
            trigger: 'Conduct finding',
            article: 'Articles 5 and 7',
            action:
              'The vote specifies a proportionate action and completion date, such as a beer ceremony or other action accepted by the member. Alcohol-free substitutes for a required ceremony are not permitted.',
          },
        ],
      },
      {
        kind: 'subsection',
        title: 'A3. Weekly default marks',
        paragraphs: [
          'After a duty becomes overdue, one **symbolic default mark** is added for each full seven-day period it remains unresolved. Marks accrue until the duty is completed or the season closes at the end of the final, and are never drinks, money owed or automatic additional tasks. A duty without a confirmed deadline earns nothing. The record closes at the final function.',
        ],
      },
      {
        kind: 'subsection',
        title: 'A4. Fair administration',
        paragraphs: [
          "The app records the member, duty, evidence, decision, deadline and completion status. A veto or review does not pause default marks. When a decision is reversed in the member's favour, the Captain resets the duty's overdue clock from that moment and the marks accrued meanwhile fall away. Penalties are never backdated. No ceremony may be imposed through threats or coercion.",
        ],
      },
    ],
    intro:
      'One common procedure for missed picks, overdue spoon duties, invalid videos and conduct findings.',
  },
  {
    id: 'article-7',
    label: 'Article 7',
    title: 'Conduct reports and the hearing',
    blocks: [
      {
        kind: 'clause',
        number: '7.1',
        text: 'Conduct violations may be brought to **Victor Dercksen**, stating the conduct, available evidence and requested action. The member concerned has **24 hours** to respond. The Captain then opens a **48-hour poll** in the league group.',
      },
      {
        kind: 'clause',
        number: '7.2',
        text: 'Each uninvolved member has one vote. The complainant and the subject abstain.',
      },
      {
        kind: 'clause',
        number: '7.3',
        text: 'More than half of the eligible voters must take part, and a **simple majority of votes cast** decides. A tie or a failed quorum imposes no new sanction.',
      },
      {
        kind: 'clause',
        number: '7.4',
        text: 'If fewer than two members are eligible to vote, the parties seek a mutually agreed resolution.',
      },
      {
        kind: 'clause',
        number: '7.5',
        text: 'A Captain who is the complainant or the subject **recuses**, and the eligible members choose a chair for that hearing.',
      },
      {
        kind: 'clause',
        number: '7.6',
        text: 'An approved sanction is recorded and enforced under **Addendum A**. Videos are reviewed under Article 5, not under this Article. Addendum A, A4 applies throughout.',
      },
    ],
  },
  {
    id: 'article-8',
    label: 'Article 8',
    title: 'Evidence and privacy',
    blocks: [
      {
        kind: 'clause',
        number: '8.1',
        text: "Ceremony videos are shared **within the app, to the league's members only**.",
      },
      {
        kind: 'clause',
        number: '8.2',
        text: 'A video may not be reposted elsewhere without the permission of the member in it.',
      },
      {
        kind: 'clause',
        number: '8.3',
        text: 'Enough evidence is retained for the review processes in Articles 5 and 7. Deletion is agreed by the league at season-end.',
      },
    ],
  },
  {
    id: 'article-9',
    label: 'Article 9',
    title: 'Membership and amendments',
    blocks: [
      {
        kind: 'clause',
        number: '9.1',
        text: "The Captain confirms the starting member list and each member's acceptance of this Constitution.",
      },
      {
        kind: 'clause',
        number: '9.2',
        text: 'An amendment is published before it takes effect and requires approval from **two-thirds of the full membership**.',
      },
      {
        kind: 'clause',
        number: '9.3',
        text: 'No rule is applied retrospectively.',
      },
      {
        kind: 'clause',
        number: '9.4',
        text: 'Late-entry eligibility is agreed by the league before a new member is admitted.',
      },
      {
        kind: 'quote',
        lines: ['One bru, one vote.', 'The subject of the vote keeps quiet.'],
      },
    ],
  },
];
