import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiError, toApiError } from '../../api/api-error';
import { HttpLeagueData } from '../data/http-league-data';
import { LeagueData } from '../data/league-data';
import { JoinPreview } from '../league.models';
import { SampleLeagueData } from '../data/sample-league-data';

/**
 * Join links (`/join/{code}`): the league a code belongs to and its unclaimed names. The
 * sample build answers from its sample leagues' current join codes.
 */
@Service()
export class JoinService {
  private readonly http = inject(HttpClient);
  private readonly data = inject(LeagueData);

  async preview(code: string): Promise<JoinPreview> {
    if (this.data instanceof SampleLeagueData) return this.data.preview(code);
    if (!(this.data instanceof HttpLeagueData))
      throw new ApiError(0, 'unavailable', 'Joining a league needs the league API.');
    try {
      return await firstValueFrom(this.http.get<JoinPreview>(joinUrl(code)));
    } catch (error) {
      throw toApiError(error);
    }
  }
}

export function joinUrl(code: string): string {
  return `${environment.apiUrl}/v1/join/${encodeURIComponent(code)}`;
}

/**
 * The join code in what someone pasted: a whole join link or the bare code. Null when it
 * does not look like a code.
 */
export function joinCodeFrom(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/\/join\/([^/?#\s]+)/)?.[1];
  const code = fromLink ?? text;
  return /^[A-Za-z0-9_-]{4,64}$/.test(code) ? code : null;
}
