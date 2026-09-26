import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError, HttpLeagueData, toApiError } from './http-league-data';
import { LeagueData } from './league-data';
import { JoinPreview } from './league.models';
import { SAMPLE_LEAGUES } from './sample-leagues';
import { SampleLeagueData } from './sample-league-data';

/**
 * Join links (`/join/{code}`): the league a code belongs to, its unclaimed names and the
 * claim itself. The API decides who may claim what. The sample build answers from its sample
 * leagues, where the sample account is already a member.
 */
@Injectable({ providedIn: 'root' })
export class JoinService {
  private readonly http = inject(HttpClient);
  private readonly data = inject(LeagueData);
  private readonly api = this.data instanceof HttpLeagueData;

  async preview(code: string): Promise<JoinPreview> {
    if (this.data instanceof SampleLeagueData) return samplePreview(code);
    if (!this.api) throw new ApiError(0, 'unavailable', 'Joining a league needs the league API.');
    try {
      return await firstValueFrom(this.http.get<JoinPreview>(joinUrl(code)));
    } catch (error) {
      throw toApiError(error);
    }
  }

  /** Claims a name in the code's league for this account. */
  async claim(code: string, membershipId: string): Promise<void> {
    if (!this.api)
      throw new ApiError(409, 'already_member', 'The sample account is already in this league.');
    try {
      await firstValueFrom(this.http.post(joinUrl(code), { membershipId }));
    } catch (error) {
      throw toApiError(error);
    }
  }
}

function joinUrl(code: string): string {
  return `${environment.apiUrl}/v1/join/${encodeURIComponent(code)}`;
}

function samplePreview(code: string): JoinPreview {
  const seed = SAMPLE_LEAGUES.find((league) => league.joinCode === code);
  if (!seed)
    throw new ApiError(
      404,
      'unknown_join_code',
      'That join link is not valid. Ask the captain for a new one.',
    );
  const { id, slug, name, timezone, emblemUrl, accentColour, competition, seasonName } =
    seed.summary;
  return {
    league: { id, slug, name, timezone, emblemUrl, accentColour, competition, seasonName },
    alreadyMember: true,
    unclaimed: seed.members
      .filter((member) => !member.claimed)
      .map((member) => ({ id: member.id, displayName: member.name })),
  };
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
