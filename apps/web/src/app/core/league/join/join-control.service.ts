import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../api/api-error';
import { HttpLeagueData } from '../data/http-league-data';
import { LeagueData } from '../data/league-data';
import { joinUrl } from './join.service';

/** Claiming a name through a join link. The API decides who may claim what. */
@Service()
export class JoinControlService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(LeagueData) instanceof HttpLeagueData;

  /** Claims a name in the code's league for this account. */
  async claim(code: string, membershipId: string): Promise<void> {
    if (!this.api)
      throw new ApiError(
        409,
        'already_member',
        'The sample build cannot claim names. The sample account opens every sample league from the league switcher.',
      );
    try {
      await firstValueFrom(this.http.post(joinUrl(code), { membershipId }));
    } catch (error) {
      throw toApiError(error);
    }
  }
}
