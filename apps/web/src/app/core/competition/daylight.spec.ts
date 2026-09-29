import { sunIsUp } from './daylight';

const EDINBURGH = [55.9422, -3.2408] as const;
const PRETORIA = [-25.7533, 28.2225] as const;
const CARDIFF = [51.4794, -3.1839] as const;
const CAPE_TOWN = [-33.9036, 18.4113] as const;

describe('sunIsUp', () => {
  it('is dark in Edinburgh at 17:00 in December and light in April', () => {
    expect(sunIsUp(...EDINBURGH, Date.UTC(2026, 11, 20, 17))).toBe(false);
    // 18:00 BST.
    expect(sunIsUp(...EDINBURGH, Date.UTC(2026, 3, 20, 17))).toBe(true);
  });

  it('is light at Loftus Versfeld for a 15:00 SAST kickoff', () => {
    expect(sunIsUp(...PRETORIA, Date.UTC(2026, 9, 3, 13))).toBe(true);
  });

  it('is dark at Cardiff Arms Park for a 19:35 BST kickoff in October', () => {
    expect(sunIsUp(...CARDIFF, Date.UTC(2026, 9, 10, 18, 35))).toBe(false);
  });

  it('is light at the DHL Stadium for a 13:00 SAST kickoff in winter', () => {
    expect(sunIsUp(...CAPE_TOWN, Date.UTC(2027, 5, 19, 11))).toBe(true);
  });

  it('turns over around sunrise and sunset', () => {
    // Cape Town midwinter: sunrise about 05:50 UTC, sunset about 15:45 UTC.
    expect(sunIsUp(...CAPE_TOWN, Date.UTC(2027, 5, 21, 5, 30))).toBe(false);
    expect(sunIsUp(...CAPE_TOWN, Date.UTC(2027, 5, 21, 6, 15))).toBe(true);
    expect(sunIsUp(...CAPE_TOWN, Date.UTC(2027, 5, 21, 15, 30))).toBe(true);
    expect(sunIsUp(...CAPE_TOWN, Date.UTC(2027, 5, 21, 16))).toBe(false);
  });
});
