import { timeZoneGroups } from './time-zones';

describe('timeZoneGroups', () => {
  it('groups the browser’s IANA zones by region, with UTC last', () => {
    const groups = timeZoneGroups();
    const africa = groups.find((g) => g.region === 'Africa');
    expect(africa?.zones.find((z) => z.id === 'Africa/Johannesburg')?.label).toBe(
      'Johannesburg (GMT+2)',
    );
    expect(groups.at(-1)).toMatchObject({ region: 'Other', zones: [{ id: 'UTC' }] });
    expect(groups.map((g) => g.region)).toContain('Europe');
  });

  it('names nested zones by their place', () => {
    const america = timeZoneGroups().find((g) => g.region === 'America');
    expect(america?.zones.find((z) => z.id === 'America/Argentina/San_Juan')?.label).toMatch(
      /^Argentina \/ San Juan \(GMT-3\)$/,
    );
  });

  it('keeps a saved zone that the list lacks', () => {
    const groups = timeZoneGroups('Europe/Kiev');
    const listed = groups.some((g) => g.zones.some((z) => z.id === 'Europe/Kiev'));
    expect(listed).toBe(true);
  });
});
