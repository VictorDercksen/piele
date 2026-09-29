/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

  it('ships every weather artwork of every club', () => {
    const urls = URC.teams.flatMap((team) => Object.values(team.stadiumBackgrounds));
    expect(urls.length).toBe(78);
    for (const url of urls) expect(existsSync(join(process.cwd(), 'public', url)), url).toBe(true);
  });

  it('has no snow scene at the Sharks and Stormers grounds', () => {
    for (const team of URC.teams) {
      const snowless = team.id === 'hollywoodbets-sharks' || team.id === 'dhl-stormers';
      expect(team.stadiumBackgrounds['snow-day'] === undefined, team.name).toBe(snowless);
    }
  });

  it('gives club grounds their weather artwork and every venue a position', () => {
    expect(URC.stadiums.backgrounds(' hollywoodbets kings park ')).toBe(
      URC.team('hollywoodbets-sharks')?.stadiumBackgrounds,
    );
    expect(URC.stadiums.backgrounds('Aviva Stadium')).toBeUndefined();
    expect(URC.stadiums.position('dhl stadium')).toEqual({
      latitude: -33.9036,
      longitude: 18.4113,
    });
    for (const venue of venues) expect(URC.stadiums.position(venue), venue).toBeDefined();
    expect(URC.stadiums.position('Venue to be confirmed')).toBeUndefined();
  });

  it('matches venues regardless of case and ignores unknown ones', () => {
    expect(stadiumCountry('thomond park')?.name).toBe('Ireland');
    expect(stadiumIcon('thomond park')).toBe('assets/images/stadiums/thomond-park.webp');
    expect(stadiumCountry('Venue to be confirmed')).toBeUndefined();
    expect(stadiumIcon('Venue to be confirmed')).toBeUndefined();
    expect(stadiumCountry(null)).toBeUndefined();
  });
});
