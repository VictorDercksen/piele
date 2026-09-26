import { NewLeagueMember } from '../../core/league/admin.models';

/** One row of the team sheet as typed. */
export interface MemberRow {
  readonly name: string;
  readonly surname: string;
  readonly superbru: string;
}

/** A usable row. */
export interface CheckedMember extends NewLeagueMember {
  /** 0-based row index. */
  readonly row: number;
}

/** A row that cannot be used: which input to fix, and why. */
export interface MemberRowError {
  readonly row: number;
  readonly field: keyof MemberRow;
  readonly message: string;
  /** The Superbru name repeats an earlier row's, which is worth saying while typing. */
  readonly duplicate?: true;
}

export interface CheckedMembers {
  readonly members: readonly CheckedMember[];
  readonly errors: readonly MemberRowError[];
}

/** The API's limits (`NewLeagueMember`, `NewLeague.members`). */
export const MAX_MEMBERS = 200;
const MAX_FULL_NAME = 120;
const MAX_DISPLAY_NAME = 50;

const tidy = (part: string) => part.trim().replace(/\s+/g, ' ');

/** Why a row cannot be a member, or null. */
function rowProblem(
  row: MemberRow,
  seen: ReadonlyMap<string, number>,
): Omit<MemberRowError, 'row'> | null {
  const name = tidy(row.name);
  const superbru = tidy(row.superbru);
  if (!name) return { field: 'name', message: 'Add the name.' };
  if (!superbru) return { field: 'superbru', message: 'Add the Superbru name.' };
  if (tidy(`${name} ${row.surname}`).length > MAX_FULL_NAME)
    return {
      field: 'surname',
      message: `Keep the name and surname to ${MAX_FULL_NAME} characters.`,
    };
  if (superbru.length > MAX_DISPLAY_NAME)
    return {
      field: 'superbru',
      message: `Keep the Superbru name to ${MAX_DISPLAY_NAME} characters.`,
    };
  const first = seen.get(superbru.toLocaleLowerCase());
  return first === undefined
    ? null
    : {
        field: 'superbru',
        message: `${superbru} is already member ${first + 1}.`,
        duplicate: true,
      };
}

/**
 * The team sheet typed as rows of name, surname and Superbru name. The full name is the name
 * and surname (the surname may be left out); the Superbru name is how the league shows the
 * member. Blank rows are skipped; every other row is either a member or an error for the
 * input to fix. Superbru names must differ (ignoring case), as they do on the team sheet.
 */
export function checkMembers(rows: readonly MemberRow[]): CheckedMembers {
  const members: CheckedMember[] = [];
  const errors: MemberRowError[] = [];
  const seen = new Map<string, number>();
  for (const [index, row] of rows.entries()) {
    if (!tidy(row.name) && !tidy(row.surname) && !tidy(row.superbru)) continue;
    const problem = rowProblem(row, seen);
    if (problem) {
      errors.push({ row: index, ...problem });
      continue;
    }
    const displayName = tidy(row.superbru);
    seen.set(displayName.toLocaleLowerCase(), index);
    members.push({ row: index, fullName: tidy(`${row.name} ${row.surname}`), displayName });
  }
  for (const member of members.slice(MAX_MEMBERS))
    errors.push({
      row: member.row,
      field: 'name',
      message: `A league can start with at most ${MAX_MEMBERS} members.`,
    });
  return { members: members.slice(0, MAX_MEMBERS), errors };
}
