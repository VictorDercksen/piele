import { ApiError } from '../../../core/api/api-error';
import { pickRefusal } from './picks-panel.refusals';

describe('pickRefusal', () => {
  it('warns of the kickoff lock, naming the kickoff when known', () => {
    const locked = new ApiError(422, 'picks_locked', 'Locked.');
    expect(pickRefusal(locked, '26 Sep 18:45 SAST')).toEqual({
      level: 'warn',
      message: 'Picks for this match closed at kickoff, 26 Sep 18:45 SAST.',
    });
    expect(pickRefusal(locked, '')).toEqual({
      level: 'warn',
      message: 'Picks for this match closed at kickoff.',
    });
  });

  it('fails with the error message, else a retry prompt', () => {
    expect(pickRefusal(new Error('Network down.'), '')).toEqual({
      level: 'error',
      message: 'Network down.',
    });
    expect(pickRefusal('nope', '')).toEqual({
      level: 'error',
      message: 'The pick could not be saved. Try again.',
    });
  });
});
