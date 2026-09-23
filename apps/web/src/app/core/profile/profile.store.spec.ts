import { isProfile } from './profile.store';

describe('stored profile validation', () => {
  it('accepts only known teams, bounded names and local JPEG photos', () => {
    const good = { displayName: 'Test Member', teamId: 'dhl-stormers', photo: null };
    expect(isProfile(good)).toBe(true);
    for (const value of [
      null,
      {},
      { ...good, teamId: 'fake' },
      { ...good, displayName: '  ' },
      { ...good, displayName: 'a'.repeat(51) },
      { ...good, photo: 'https://external.test/photo' },
      { ...good, photo: 'data:image/svg+xml;base64,abcd' },
    ])
      expect(isProfile(value)).toBe(false);
  });
});
