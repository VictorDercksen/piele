import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Attaches the Supabase access token to The Pavilion API requests only. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!auth.configured || !isApiRequest(request.url, environment.apiUrl)) return next(request);
  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request),
    ),
  );
};

/** Match the configured origin and its /v1 path, never a hostname or path prefix lookalike. */
function isApiRequest(requestUrl: string, apiUrl: string): boolean {
  if (!apiUrl) return false;
  try {
    const base = new URL(apiUrl, document.baseURI);
    const request = new URL(requestUrl, document.baseURI);
    const path = `${base.pathname.replace(/\/+$/, '')}/v1`;
    return (
      request.origin === base.origin &&
      !request.username &&
      !request.password &&
      (request.pathname === path || request.pathname.startsWith(`${path}/`))
    );
  } catch {
    return false;
  }
}
