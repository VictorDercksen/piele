import { measureFrom } from './standings.page.rows';

describe('standings page rows', () => {
  it('reads the tab from the query parameter, else the round', () => {
    expect(measureFrom('season')).toBe('season');
    expect(measureFrom('marks')).toBe('marks');
    expect(measureFrom('other')).toBe('round');
    expect(measureFrom(null)).toBe('round');
  });
});
