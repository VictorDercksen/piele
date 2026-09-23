export interface ClubTeam {
  readonly id: string;
  readonly sourceId: number;
  readonly name: string;
  readonly shortName: string;
  readonly colour: string;
  readonly accent: string;
  readonly jersey: string;
  readonly illustrated: boolean;
}

export const TEAMS: readonly ClubTeam[] = [
  team('benetton-rugby', 2019, 'Benetton Rugby', 'Benetton', '#176c43', '#73d8a0'),
  team('vodacom-bulls', 5586, 'Vodacom Bulls', 'Bulls', '#22589c', '#83bfff'),
  team('cardiff-rugby', 4471, 'Cardiff Rugby', 'Cardiff', '#263b50', '#80c9ee'),
  team('connacht-rugby', 5483, 'Connacht Rugby', 'Connacht', '#17694f', '#77dfaa'),
  team('dragons-rfc', 3533, 'Dragons RFC', 'Dragons', '#971e31', '#ff8c91'),
  team('edinburgh-rugby', 1641, 'Edinburgh Rugby', 'Edinburgh', '#15375e', '#ff9876', true),
  team('glasgow-warriors', 3098, 'Glasgow Warriors', 'Glasgow', '#193d55', '#86cceb'),
  team('leinster-rugby', 5356, 'Leinster Rugby', 'Leinster', '#154baf', '#80baff', true),
  team('10bet-lions', 5092, 'Lions', 'Lions', '#a92432', '#ff9199', true),
  team('munster-rugby', 4377, 'Munster Rugby', 'Munster', '#a41e32', '#ff8d9b'),
  team('ospreys', 5057, 'Ospreys', 'Ospreys', '#252d38', '#c3cddc', true),
  team('scarlets', 3514, 'Scarlets', 'Scarlets', '#a92631', '#ff8d94'),
  team('hollywoodbets-sharks', 1527, 'Hollywoodbets Sharks', 'Sharks', '#252d36', '#c9d3df'),
  team('dhl-stormers', 3994, 'DHL Stormers', 'Stormers', '#174da0', '#87baff'),
  team('ulster-rugby', 2129, 'Ulster Rugby', 'Ulster', '#9b2832', '#f9a1a1'),
  team('zebre-parma', 4474, 'Zebre Parma', 'Zebre', '#263544', '#ffe378'),
];

function team(
  id: string,
  sourceId: number,
  name: string,
  shortName: string,
  colour: string,
  accent: string,
  illustrated = false,
): ClubTeam {
  return {
    id,
    sourceId,
    name,
    shortName,
    colour,
    accent,
    illustrated,
    jersey: `assets/images/jerseys/${id}.${illustrated ? 'svg' : 'png'}`,
  };
}

export function club(id: string): ClubTeam | undefined {
  return TEAMS.find((team) => team.id === id);
}

export function jersey(id: string): string {
  return club(id)?.jersey ?? 'assets/images/jerseys/tbc.svg';
}
