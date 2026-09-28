import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('API token boundary', () => {
  const originalUrl = environment.apiUrl;
  const token = vi.fn(() => Promise.resolve('test-access-token'));

  beforeEach(() => {
    environment.apiUrl = 'https://api.example.test/service';
    token.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true, accessToken: token } },
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    environment.apiUrl = originalUrl;
  });

  it.each([
    'https://api.example.test/service/v1/me',
    'https://api.example.test/service/v1/leagues/one/members?include=withdrawn',
  ])('authenticates an API request: %s', async (url) => {
    TestBed.inject(HttpClient)
      .get(url)
      .subscribe({ next: () => undefined });
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    request.flush({});
  });

  it.each([
    'https://api.example.test.attacker.invalid/service/v1/me',
    'https://api.example.test@attacker.invalid/service/v1/me',
    'http://api.example.test/service/v1/me',
    'https://api.example.test:444/service/v1/me',
    'https://api.example.test/service-other/v1/me',
    'https://api.example.test/service/v10/me',
    'https://api.example.test/service/v1/../../private',
    'https://storage.example.test/signed-photo',
  ])('does not read or attach the token outside the API: %s', (url) => {
    TestBed.inject(HttpClient)
      .get(url)
      .subscribe({ next: () => undefined });
    const request = TestBed.inject(HttpTestingController).expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(token).not.toHaveBeenCalled();
    request.flush({});
  });

  it('supports a same-origin relative API base', async () => {
    environment.apiUrl = '/api/';
    TestBed.inject(HttpClient)
      .get('/api/v1/me')
      .subscribe({ next: () => undefined });
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    request.flush({});
  });
});
