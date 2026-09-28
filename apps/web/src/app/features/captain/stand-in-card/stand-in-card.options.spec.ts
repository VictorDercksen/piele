import { memberRecord } from '../../../core/league/data/sample-leagues';
import { standInOptions } from './stand-in-card.options';

describe('standInOptions', () => {
  const members = [
    memberRecord('m-cap', 'Captain', 'Captain', ''),
    memberRecord('m-zed', 'Zed', 'Zed', ''),
    memberRecord('m-amy', 'Amy', 'Amy', ''),
    memberRecord('m-open', 'Open', 'Open', '', false),
  ];

  it('offers no stand-in, then claimed members other than the captain by name', () => {
    expect(standInOptions(members, 'm-cap', { memberId: null, memberName: null })).toEqual([
      { value: '', label: 'No stand-in' },
      { value: 'm-amy', label: 'Amy' },
      { value: 'm-zed', label: 'Zed' },
    ]);
  });

  it('keeps the saved stand-in listed when it no longer qualifies', () => {
    const options = standInOptions(members, 'm-cap', { memberId: 'm-gone', memberName: 'Gone' });
    expect(options.map((o) => o.value)).toEqual(['', 'm-amy', 'm-gone', 'm-zed']);
  });
});
