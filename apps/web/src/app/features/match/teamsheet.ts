import { Teamsheet, TeamsheetPlayer } from '../../core/api/match-centre.models';
import { ClubBanner, Competition, Country } from '../../core/competition/competition.models';

/** One side of the teamsheet panel, styled with its club's banner artwork. */
export interface SheetView {
  readonly label: string;
  readonly banner: ClubBanner | undefined;
  readonly accent: string | undefined;
  readonly starters: readonly PlayerView[];
  readonly replacements: readonly PlayerView[];
  readonly startersAverageAge: number | null;
  readonly replacementsAverageAge: number | null;
}

export interface PlayerView {
  readonly number: number;
  readonly name: string;
  readonly position: string | null;
  readonly captain: boolean;
  /** Whole years at kickoff. */
  readonly age: number | null;
  /** Country of birth, which the feed offers in place of nationality. */
  readonly country: Country | undefined;
}

const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000;

/** The feed's bench slots ("sub 1" to "sub 8") say nothing a shirt number does not. */
const BENCH_SLOT = /^sub \d+$/i;

export function sheetView(
  competition: Competition,
  label: string,
  clubId: string,
  sheet: Teamsheet,
  kickoffUtc: string | null,
): SheetView {
  const kickoff = kickoffUtc ? new Date(kickoffUtc) : null;
  const player = (p: TeamsheetPlayer): PlayerView => ({
    number: p.number,
    name: p.name,
    position: p.position && !BENCH_SLOT.test(p.position) ? p.position : null,
    captain: p.captain,
    age: kickoff ? ageOn(p.dateOfBirth, kickoff) : null,
    country: competition.countries.named(p.birthCountry),
  });
  return {
    label,
    banner: competition.banners[clubId],
    accent: competition.team(clubId)?.accent,
    starters: sheet.starters.map(player),
    replacements: sheet.replacements.map(player),
    startersAverageAge: kickoff ? averageAge(sheet.starters, kickoff) : null,
    replacementsAverageAge: kickoff ? averageAge(sheet.replacements, kickoff) : null,
  };
}

/** Whole years between a `YYYY-MM-DD` birth date and the moment, or null when unknown. */
export function ageOn(dateOfBirth: string | null | undefined, moment: Date): number | null {
  const birth = parseDate(dateOfBirth);
  if (!birth) {
    return null;
  }
  let age = moment.getUTCFullYear() - birth.getUTCFullYear();
  const month = moment.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && moment.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

/** Mean exact age of the players with a known birth date, or null when none has one. */
export function averageAge(players: readonly TeamsheetPlayer[], moment: Date): number | null {
  const years = players
    .map((p) => parseDate(p.dateOfBirth))
    .filter((birth): birth is Date => birth !== null)
    .map((birth) => (moment.getTime() - birth.getTime()) / YEAR_MS);
  return years.length ? years.reduce((sum, y) => sum + y, 0) / years.length : null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
