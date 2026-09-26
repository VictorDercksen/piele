import { NewLeagueMember } from '../../core/league/admin.models';

/** One usable line of the pasted team sheet. */
export interface ParsedMember extends NewLeagueMember {
  /** 1-based line number in the pasted text. */
  readonly line: number;
}

/** A line that cannot be used, and why. */
export interface MemberLineError {
  readonly line: number;
  readonly text: string;
  readonly message: string;
}

export interface ParsedMembers {
  readonly members: readonly ParsedMember[];
  readonly errors: readonly MemberLineError[];
}

/** "Full name, Superbru name", split at the last comma, with spaces tidied. */
function split(content: string): NewLeagueMember {
  const comma = content.lastIndexOf(',');
  const tidy = (part: string) => part.trim().replace(/\s+/g, ' ');
  return { fullName: tidy(content.slice(0, comma)), displayName: tidy(content.slice(comma + 1)) };
}

/** Why a line cannot be a member, or null. */
function lineProblem(content: string, seen: ReadonlyMap<string, number>): string | null {
  if (!content.includes(',')) return 'Write it as “Full name, Superbru name”.';
  const { fullName, displayName } = split(content);
  if (!fullName) return 'The full name is missing before the comma.';
  if (!displayName) return 'The Superbru name is missing after the comma.';
  if (fullName.length > MAX_FULL_NAME) return `Keep the full name to ${MAX_FULL_NAME} characters.`;
  if (displayName.length > MAX_DISPLAY_NAME)
    return `Keep the Superbru name to ${MAX_DISPLAY_NAME} characters.`;
  const first = seen.get(displayName.toLocaleLowerCase());
  return first === undefined ? null : `${displayName} is already on line ${first}.`;
}

/** The API's limits (`NewLeagueMember`, `NewLeague.members`). */
export const MAX_MEMBERS = 200;
const MAX_FULL_NAME = 120;
const MAX_DISPLAY_NAME = 50;

/**
 * The team sheet pasted one member per line as "Full name, Superbru name". The Superbru name
 * follows the last comma, so a full name written "Pretorius, Johan" still works. Blank lines
 * are skipped; every other line is either a member or an error with its line number. Display
 * names must differ (ignoring case), as they do on the team sheet.
 */
export function parseMembers(text: string): ParsedMembers {
  const members: ParsedMember[] = [];
  const errors: MemberLineError[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const content = raw.trim();
    if (!content) continue;
    const problem = lineProblem(content, seen);
    if (problem) {
      errors.push({ line, text: content, message: problem });
      continue;
    }
    const { fullName, displayName } = split(content);
    seen.set(displayName.toLocaleLowerCase(), line);
    members.push({ line, fullName, displayName });
  }
  if (members.length > MAX_MEMBERS)
    for (const member of members.slice(MAX_MEMBERS))
      errors.push({
        line: member.line,
        text: `${member.fullName}, ${member.displayName}`,
        message: `A league can start with at most ${MAX_MEMBERS} members.`,
      });
  return {
    members: members.slice(0, MAX_MEMBERS),
    errors: errors.sort((a, b) => a.line - b.line),
  };
}
