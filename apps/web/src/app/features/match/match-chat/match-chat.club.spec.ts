import { competition } from '../../../core/competition/registry';
import { chatClub } from './match-chat.club';

describe('chatClub', () => {
  const urc = competition('urc-2026-27');

  it('takes the colours from the team and the pattern from its banner', () => {
    expect(chatClub(urc.team('dhl-stormers'), urc.banners)).toEqual({
      colour: '#174da0',
      accent: '#87baff',
      bannerColour: '#001847',
      pattern: 'assets/images/club-banners/dhl-stormers-pattern.jpeg',
    });
  });

  it('keeps the colours of a team without a banner', () => {
    expect(chatClub(urc.team('scarlets'), {})).toEqual({
      colour: '#a92631',
      accent: '#ff8d94',
      bannerColour: null,
      pattern: null,
    });
  });

  it('is null without a favourite team', () => {
    expect(chatClub(undefined, urc.banners)).toBeNull();
  });
});
