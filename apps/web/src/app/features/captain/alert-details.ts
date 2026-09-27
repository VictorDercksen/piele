/**
 * The detail lines of a validation card: the problems after the first (which is the card's
 * message), at most two of them, then "and N more." for the rest.
 */
export function alertDetails(problems: readonly string[]): readonly string[] {
  return capDetails(problems.slice(1));
}

/** At most three detail lines: all of them, or two and "and N more.". */
export function capDetails(lines: readonly string[]): readonly string[] {
  if (lines.length <= 3) return lines;
  return [...lines.slice(0, 2), `and ${lines.length - 2} more.`];
}
