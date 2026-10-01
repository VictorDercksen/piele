/** Questions per member per fixture (the API's `PIELE_CHAT_TURNS_PER_THREAD`). */
export const QUESTIONS_PER_THREAD = 6;

export const INTRO_TEXT =
  'Ask about the teamsheets, the forecast, the preview or your pick. Answers cite their sources.';
export const CLOSED_TEXT = 'The chat opens three days before kickoff and closes at kickoff.';
export const UNAVAILABLE_TEXT = 'The Pavilion could not answer just now.';

const REFUSALS: Readonly<Record<string, string>> = {
  chat_thread_limit: 'You have used your questions for this match.',
  chat_daily_limit: "You have used today's questions for this league.",
  chat_busy: 'Your last question is still being answered.',
  chat_capacity: 'The Pavilion is busy; try again later.',
  not_a_member: 'Only members of this league can ask the Pavilion.',
  admin_not_a_member: 'Only members of this league can ask the Pavilion.',
};

/** Codes that mean this member cannot use the chat in this league at all. */
const MEMBERSHIP = new Set(['not_a_member', 'admin_not_a_member']);

/** The ready questions offered as chips while the thread is empty. */
export function readyQuestions(home: string, away: string): readonly string[] {
  return [
    `Who is missing for ${home}?`,
    `Who is missing for ${away}?`,
    'What is the forecast at kickoff?',
    'Summarise the preview',
  ];
}

/** `chat_off`: the chat is switched off, so the launcher is not shown. */
export function chatOff(code: string | null): boolean {
  return code === 'chat_off';
}

/** `chat_closed` reads as the closed state. */
export function chatClosed(open: boolean, code: string | null): boolean {
  return !open || code === 'chat_closed';
}

/** Why the thread cannot be shown at all, for a refused read; null for one worth retrying. */
export function membershipText(code: string | null): string | null {
  return code && MEMBERSHIP.has(code) ? REFUSALS[code] : null;
}

/**
 * The sentence above the question field: the last refusal or failure, else a limit already reached.
 * Null while there is nothing to say, or for `chat_off` and `chat_closed`, which have their
 * own states. Network and unknown failures read as the agent's.
 */
export function chatNotice(
  code: string | null,
  remainingInThread: number,
  remainingToday: number,
): string | null {
  if (code === 'chat_off' || code === 'chat_closed') return null;
  if (code) return REFUSALS[code] ?? UNAVAILABLE_TEXT;
  if (remainingInThread <= 0) return REFUSALS['chat_thread_limit'];
  if (remainingToday <= 0) return REFUSALS['chat_daily_limit'];
  return null;
}

/** "N of 6 questions left for this match · M left today". */
export function remainingText(remainingInThread: number, remainingToday: number): string {
  const thread = Math.max(0, remainingInThread);
  const today = Math.max(0, remainingToday);
  return `${thread} of ${QUESTIONS_PER_THREAD} questions left for this match · ${today} left today`;
}
