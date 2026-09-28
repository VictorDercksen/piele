import { Service, inject } from '@angular/core';
import { CompetitionService } from '../competition/competition.service';
import { HttpLeagueData } from '../league/data/http-league-data';
import { LeagueData } from '../league/data/league-data';
import { LeagueContext } from '../league/league-context';
import { clearLegacy, storeLocal } from './profile-storage';
import { Profile, isProfile } from './profile.models';
import { ProfileService } from './profile.service';

/**
 * Saves the member's profile: through the league's `me/profile` route in builds that talk to
 * the API, otherwise in this browser (see `ProfileService.persisted`).
 */
@Service()
export class ProfileControlService {
  private readonly league = inject(LeagueData);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly profiles = inject(ProfileService);
  private readonly api = this.league instanceof HttpLeagueData ? this.league : null;

  async save(profile: Profile): Promise<void> {
    if (!isProfile(profile, this.competition.current()))
      throw new Error('Enter a name and choose a favourite team.');
    if (this.api) {
      await this.api.saveProfile(profile.teamId, profile.photo);
      clearLegacy();
      return;
    }
    const slug = this.context.slug();
    if (!slug) throw new Error('Open a league before choosing a favourite team.');
    storeLocal(profile, slug);
    this.profiles.storedChanged();
  }
}
