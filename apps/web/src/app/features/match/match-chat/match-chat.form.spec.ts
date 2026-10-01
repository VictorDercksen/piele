import { QUESTION_MAX_LENGTH, questionControl } from './match-chat.form';

describe('match chat form', () => {
  it('limits a question to the API maximum', () => {
    const control = questionControl();
    control.setValue('x'.repeat(QUESTION_MAX_LENGTH));
    expect(control.valid).toBe(true);
    control.setValue('x'.repeat(QUESTION_MAX_LENGTH + 1));
    expect(control.valid).toBe(false);
  });
});
