import { ClubBanner, ClubTeam } from '../../../core/competition/competition.models';
import { ChatClub } from './match-chat.models';

/** The chat's club styling for a favourite team; null without one, which keeps the Pavilion's teal. */
export function chatClub(
  team: ClubTeam | undefined,
  banners: Readonly<Record<string, ClubBanner>>,
): ChatClub | null {
  if (!team) return null;
  const banner = banners[team.id];
  return {
    colour: team.colour,
    accent: team.accent,
    bannerColour: banner?.colour ?? null,
    pattern: banner?.pattern ?? null,
  };
}
