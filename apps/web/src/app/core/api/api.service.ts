import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiHealth {
  readonly status: string;
  readonly environment: string;
  readonly database: 'ok' | 'unconfigured' | 'error';
}

/** Client for The Pavilion Python API under `/v1`. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly configured = !!environment.apiUrl;

  health(): Observable<ApiHealth> {
    if (!this.configured) return throwError(() => new Error('The API URL is not configured.'));
    return this.http.get<ApiHealth>(`${environment.apiUrl}/v1/health`);
  }
}
