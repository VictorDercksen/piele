import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { MatchCentre, MatchPreviewResponse } from './match-centre.models';

/** Loads teamsheets, the kickoff forecast and the Piele preview for one fixture. */
@Injectable({ providedIn: 'root' })
export class MatchCentreService {
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
      return this.configured && id ? `${environment.apiUrl}/v1/matches/${id}` : undefined;
    });
  }

  /** The latest preview for the fixture, or `preview: null` before one is written. */
  preview(fixtureId: () => string | null): HttpResourceRef<MatchPreviewResponse | undefined> {
    return httpResource<MatchPreviewResponse>(() => {
      const id = fixtureId();
      return this.previewConfigured && id
        ? `${environment.apiUrl}/v1/matches/${id}/preview`
        : undefined;
    });
  }
}
