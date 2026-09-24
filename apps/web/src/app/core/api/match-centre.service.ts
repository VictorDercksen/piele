import { HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MatchCentre } from './match-centre.models';

/** Loads teamsheets and the kickoff forecast for one fixture from the Python API. */
@Injectable({ providedIn: 'root' })
export class MatchCentreService {
  readonly configured = !!environment.apiUrl;

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
}
