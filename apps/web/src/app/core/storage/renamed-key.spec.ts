import { readRenamedKey } from './renamed-key';

describe('readRenamedKey', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('reads the current key and leaves an older value alone', () => {
    localStorage.setItem('pavilion-test', 'new');
    localStorage.setItem('piele-test', 'old');
    expect(readRenamedKey('pavilion-test', 'piele-test')).toBe('new');
    expect(localStorage.getItem('piele-test')).toBe('old');
  });

  it('moves a value from the older key once', () => {
    localStorage.setItem('piele-test', 'old');
    expect(readRenamedKey('pavilion-test', 'piele-test')).toBe('old');
    expect(localStorage.getItem('pavilion-test')).toBe('old');
    expect(localStorage.getItem('piele-test')).toBeNull();
  });

  it('returns null when neither key is set', () => {
    expect(readRenamedKey('pavilion-test', 'piele-test')).toBeNull();
    expect(localStorage.getItem('pavilion-test')).toBeNull();
  });
});
