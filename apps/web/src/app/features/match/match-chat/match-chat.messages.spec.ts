import {
  chatClosed,
  chatNotice,
  chatOff,
  membershipText,
  remainingText,
} from './match-chat.messages';

describe('match chat messages', () => {
  it('maps each refusal to its sentence', () => {
    expect(chatNotice('chat_thread_limit', 5, 19)).toBe(
      'You have used your questions for this match.',
    );
    expect(chatNotice('chat_daily_limit', 5, 19)).toBe(
      "You have used today's questions for this league.",
    );
    expect(chatNotice('chat_busy', 5, 19)).toBe('Your last question is still being answered.');
    expect(chatNotice('chat_capacity', 5, 19)).toBe('The Pavilion is busy; try again later.');
    expect(chatNotice('chat_unavailable', 5, 19)).toBe('The Pavilion could not answer just now.');
    expect(chatNotice('offline', 5, 19)).toBe('The Pavilion could not answer just now.');
  });

  it('leaves the switched-off and closed chat to their own states', () => {
    expect(chatNotice('chat_off', 5, 19)).toBeNull();
    expect(chatNotice('chat_closed', 5, 19)).toBeNull();
    expect(chatOff('chat_off')).toBe(true);
    expect(chatOff(null)).toBe(false);
    expect(chatClosed(true, 'chat_closed')).toBe(true);
    expect(chatClosed(false, null)).toBe(true);
    expect(chatClosed(true, 'chat_busy')).toBe(false);
  });

  it('says when a limit is already reached without a refusal', () => {
    expect(chatNotice(null, 5, 19)).toBeNull();
    expect(chatNotice(null, 0, 19)).toBe('You have used your questions for this match.');
    expect(chatNotice(null, 3, 0)).toBe("You have used today's questions for this league.");
  });

  it('names membership refusals only', () => {
    expect(membershipText('admin_not_a_member')).toBe(
      'Only members of this league can ask the Pavilion.',
    );
    expect(membershipText('not_a_member')).toBe(
      'Only members of this league can ask the Pavilion.',
    );
    expect(membershipText('offline')).toBeNull();
    expect(membershipText(null)).toBeNull();
  });

  it('counts the questions left', () => {
    expect(remainingText(4, 18)).toBe('4 of 6 questions left for this match · 18 left today');
    expect(remainingText(-1, 0)).toBe('0 of 6 questions left for this match · 0 left today');
  });
});
