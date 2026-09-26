import { competition } from './registry';

const URC = competition('urc-2026-27');
const stadiumCountry = URC.stadiums.country;
const stadiumIcon = URC.stadiums.icon;
const stadiumBackground = URC.stadiums.background;

describe('stadiums', () => {
  const venues = new Set(URC.fixtures.flatMap((m) => (m.venue ? [m.venue] : [])));

  it('names a country for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumCountry(venue), venue).toBeDefined();
  });

  it('ships an icon for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumIcon(venue), venue).toBeDefined();
  });

  it('maps one primary stadium background to every club', () => {
    const backgrounds = new Set(
      [...venues].map((venue) => stadiumBackground(venue)).filter(Boolean),
    );
    expect(backgrounds.size).toBe(16);
    for (const team of URC.teams) {
      expect(backgrounds.has(`assets/images/match-nights/${team.id}.webp`), team.name).toBe(true);
    }
  });

  it('uses venue artwork rather than substituting the home club’s primary ground', () => {
    expect(stadiumBackground('  dhl stadium  ')).toBe(
      'assets/images/match-nights/dhl-stormers.webp',
    );
    expect(stadiumBackground('Laya Arena')).toBe('assets/images/match-nights/leinster-rugby.webp');
    for (const venue of ['Aviva Stadium', 'Hampden Park', 'Venue to be confirmed', null]) {
      expect(stadiumBackground(venue)).toBeUndefined();
    }
  });

  it('matches venues regardless of case and ignores unknown ones', () => {
    expect(stadiumCountry('thomond park')?.name).toBe('Ireland');
    expect(stadiumIcon('thomond park')).toBe('assets/images/stadiums/thomond-park.webp');
    expect(stadiumCountry('Venue to be confirmed')).toBeUndefined();
    expect(stadiumIcon('Venue to be confirmed')).toBeUndefined();
    expect(stadiumCountry(null)).toBeUndefined();
  });
});
