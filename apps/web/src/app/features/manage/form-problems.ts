/** A problem a form cannot be sent with: the id of the control to fix, and why. */
export interface FormProblem {
  readonly id: string;
  readonly message: string;
}

/**
 * The detail lines of a validation card: the problems after the first (which is the card's
 * message), at most two of them, then "and N more." for the rest.
 */
export function problemDetails(problems: readonly FormProblem[]): readonly string[] {
  const rest = problems.slice(1).map((problem) => problem.message);
  if (rest.length <= 3) return rest;
  return [...rest.slice(0, 2), `and ${rest.length - 2} more.`];
}
