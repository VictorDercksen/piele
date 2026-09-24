import { stadiumCountry, stadiumIcon } from './stadiums';
import { URC_SCHEDULE } from './urc-fixtures';

describe('stadiums', () => {
  const venues = new Set(URC_SCHEDULE.fixtures.flatMap((m) => (m.venue ? [m.venue] : [])));

  it('names a country for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumCountry(venue), venue).toBeDefined();
  });

  it('ships an icon for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumIcon(venue), venue).toBeDefined();
  });

  it('matches venues regardless of case and ignores unknown ones', () => {
    expect(stadiumCountry('thomond park')?.name).toBe('Ireland');
    expect(stadiumIcon('thomond park')).toBe('assets/images/stadiums/thomond-park.webp');
    expect(stadiumCountry('Venue to be confirmed')).toBeUndefined();
    expect(stadiumIcon('Venue to be confirmed')).toBeUndefined();
    expect(stadiumCountry(null)).toBeUndefined();
  });
});
