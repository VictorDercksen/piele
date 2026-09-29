/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { competition } from './registry';

const URC = competition('urc-2026-27');
const stadiumCountry = URC.stadiums.country;
const stadiumIcon = URC.stadiums.icon;

describe('stadiums', () => {
  const venues = new Set(URC.fixtures.flatMap((m) => (m.venue ? [m.venue] : [])));

  it('names a country for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumCountry(venue), venue).toBeDefined();
  });

  it('ships an icon for every scheduled venue', () => {
    for (const venue of venues) expect(stadiumIcon(venue), venue).toBeDefined();
  });

  it('names the home ground of every club and no club for an alternate ground', () => {
    for (const team of URC.teams) {
      const home = URC.stadiums.home(team.id);
      expect(home && venues.has(home), team.name).toBe(true);
      expect(URC.stadiums.backgrounds(home), team.name).toBe(team.stadiumBackgrounds);
    }
    expect(URC.stadiums.home('dhl-stormers')).toBe('DHL Stadium');
    expect(URC.stadiums.home('unknown')).toBeUndefined();
    expect(URC.stadiums.home(null)).toBeUndefined();
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
