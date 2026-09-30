import { sectionPill } from './section-status';

describe('sectionPill', () => {
  it('names a section that is in by its data, never as "ok"', () => {
    expect(sectionPill('ok', 'Published')).toEqual({ label: 'Published', tone: 'done' });
  });

  it('labels the other states in words', () => {
    expect(sectionPill('not_published', 'Published')).toEqual({
      label: 'Not published',
      tone: 'muted',
    });
    expect(sectionPill('too_early', 'Available').label).toBe('Too early');
    expect(sectionPill('past', 'Available').label).toBe('Played');
    expect(sectionPill('unavailable', 'Published')).toEqual({ label: 'Unavailable', tone: 'warn' });
  });
});
