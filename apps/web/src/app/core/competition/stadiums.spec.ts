import { stadiumCountry } from './stadiums';
import { URC_SCHEDULE } from './urc-fixtures';

describe('stadium countries', () => {
  it('names a country for every scheduled venue', () => {
    const venues = new Set(URC_SCHEDULE.fixtures.flatMap((m) => (m.venue ? [m.venue] : [])));
    for (const venue of venues) expect(stadiumCountry(venue), venue).toBeDefined();
  });

  it('matches venues regardless of case and ignores unknown ones', () => {
    expect(stadiumCountry('thomond park')?.name).toBe('Ireland');
    expect(stadiumCountry('Venue to be confirmed')).toBeUndefined();
    expect(stadiumCountry(null)).toBeUndefined();
  });
});
