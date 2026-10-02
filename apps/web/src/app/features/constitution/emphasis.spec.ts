import { emphasisSegments } from './emphasis';

describe('emphasisSegments', () => {
  it('returns one plain segment when there are no markers', () => {
    expect(emphasisSegments('Plain text.')).toEqual([{ text: 'Plain text.', strong: false }]);
  });

  it('marks the text between paired markers as strong', () => {
    expect(emphasisSegments('A **bold** word and **two more**.')).toEqual([
      { text: 'A ', strong: false },
      { text: 'bold', strong: true },
      { text: ' word and ', strong: false },
      { text: 'two more', strong: true },
      { text: '.', strong: false },
    ]);
  });

  it('handles strong text at the start and end', () => {
    expect(emphasisSegments('**Start** middle **end**')).toEqual([
      { text: 'Start', strong: true },
      { text: ' middle ', strong: false },
      { text: 'end', strong: true },
    ]);
  });

  it('keeps an unpaired marker as plain text', () => {
    expect(emphasisSegments('One **open')).toEqual([
      { text: 'One ', strong: false },
      { text: 'open', strong: false },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(emphasisSegments('')).toEqual([]);
  });
});
