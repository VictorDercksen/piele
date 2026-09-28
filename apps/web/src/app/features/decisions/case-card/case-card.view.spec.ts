import { myResponseText } from './case-card.view';

describe('myResponseText', () => {
  const base = {
    isVoter: true,
    mine: false,
    myResponse: null,
    myVetoReason: null,
    status: 'open',
  } as const;

  it('says only the viewer’s own part', () => {
    expect(myResponseText(base)).toBe('Not yet');
    expect(myResponseText({ ...base, status: 'accepted' })).toBe('No response');
    expect(myResponseText({ ...base, myResponse: 'accept' })).toBe('You accepted');
    expect(myResponseText({ ...base, myResponse: 'veto', myVetoReason: 'Blurry' })).toBe(
      'You vetoed: “Blurry”',
    );
    expect(myResponseText({ ...base, isVoter: false, mine: true })).toBe(
      'Your own duty: you do not vote',
    );
    expect(myResponseText({ ...base, isVoter: false })).toBe('You are not voting on this');
  });
});
