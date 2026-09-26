import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CompetitionService } from '../competition/competition.service';
import { MatchCentre, MatchPreviewResponse } from './match-centre.models';

/** Loads teamsheets, the kickoff forecast and the Pavilion preview for one fixture. */
@Injectable({ providedIn: 'root' })
export class MatchCentreService {
  private readonly competition = inject(CompetitionService);
  readonly configured = !!environment.apiUrl;
  /** Previews are for signed-in members, so they also need Supabase sign-in. */
  readonly previewConfigured = this.configured && inject(AuthService).configured;

  /**
   * A resource that follows the fixture ID. It stays idle while the API is not
   * configured or no fixture is selected. Call from an injection context.
   */
  centre(fixtureId: () => string | null): HttpResourceRef<MatchCentre | undefined> {
    return httpResource<MatchCentre>(() => {
      const id = fixtureId();
      return this.configured && id ? this.matchUrl(id) : undefined;
    });
  }

  /** The latest preview for the fixture, or `preview: null` before one is written. */
  preview(fixtureId: () => string | null): HttpResourceRef<MatchPreviewResponse | undefined> {
    return httpResource<MatchPreviewResponse>(() => {
      const id = fixtureId();
      return this.previewConfigured && id ? `${this.matchUrl(id)}/preview` : undefined;
    });
  }

  /** `/v1/competitions/{competitionId}/matches/{fixtureId}` for the current competition. */
  private matchUrl(fixtureId: string): string {
    return `${environment.apiUrl}/v1/competitions/${this.competition.current().id}/matches/${fixtureId}`;
  }
}
