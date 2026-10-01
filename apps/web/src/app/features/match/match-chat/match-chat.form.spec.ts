import { QUESTION_MAX_LENGTH, questionControl, sendsOnEnter } from './match-chat.form';

describe('match chat form', () => {
  it('limits a question to the API maximum', () => {
    const control = questionControl();
    control.setValue('x'.repeat(QUESTION_MAX_LENGTH));
    expect(control.valid).toBe(true);
    control.setValue('x'.repeat(QUESTION_MAX_LENGTH + 1));
    expect(control.valid).toBe(false);
  });

  it('sends on Enter only', () => {
    expect(sendsOnEnter(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true);
    expect(sendsOnEnter(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))).toBe(
      false,
    );
    expect(sendsOnEnter(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(
      false,
    );
    expect(sendsOnEnter(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });
});
