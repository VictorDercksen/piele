import { RoundRowView, SeasonRowView } from '../../core/league/standings/standing.models';
import { PointsRow, StandingsMeasure } from './standings.page.models';

const MEASURES: readonly StandingsMeasure[] = ['round', 'season', 'marks'];

/** The tab a `table` query parameter names, else the round. */
export function measureFrom(value: string | null): StandingsMeasure {
  return MEASURES.find((measure) => measure === value) ?? 'round';
}

/**
 * The round or season table as the page draws it, with each breakdown bar's segment widths in
 * percent of the table's top total.
 */
export function pointsRows(
  rows: readonly RoundRowView[] | readonly SeasonRowView[],
): readonly PointsRow[] {
  const top = Math.max(
    0,
    ...rows.map((row) => Math.max(row.points, row.wp + row.mp + row.gsp + row.bp)),
  );
  const share = (value: number) => (top > 0 ? (Math.max(0, value) / top) * 100 : 0);
  return rows.map((row) => ({
    memberId: row.memberId,
    rank: row.rank,
    name: row.name,
    photo: row.photo,
    teamId: row.teamId,
    you: row.you,
    points: row.points,
    wp: row.wp,
    mp: row.mp,
    gsp: row.gsp,
    bp: row.bp,
    cap: row.cap,
    spoon: row.spoon,
    crown: 'crown' in row ? row.crown : false,
    rounds: 'rounds' in row ? row.rounds : null,
    override: 'override' in row ? row.override : null,
    bar: { wp: share(row.wp), mp: share(row.mp), gsp: share(row.gsp), bp: share(row.bp) },
  }));
}
