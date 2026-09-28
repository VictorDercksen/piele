import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { HttpLeagueData } from '../data/http-league-data';
import { LeagueData } from '../data/league-data';
import { SampleLeagueData } from '../data/sample-league-data';
import { JoinControlService } from './join-control.service';

describe('JoinControlService', () => {
  it('claims the chosen name through the join link', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Only its class matters: claiming needs the league API.
        { provide: LeagueData, useValue: Object.create(HttpLeagueData.prototype) },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const claiming = TestBed.inject(JoinControlService).claim('abc123def456', 'm-2');
    const request = http.expectOne(`${environment.apiUrl}/v1/join/abc123def456`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ membershipId: 'm-2' });
    request.flush(null);
    await expect(claiming).resolves.toBeUndefined();
    http.verify();
  });

  it('passes a refused claim on with its code', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LeagueData, useValue: Object.create(HttpLeagueData.prototype) },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const claiming = TestBed.inject(JoinControlService).claim('abc123def456', 'm-2');
    http
      .expectOne(`${environment.apiUrl}/v1/join/abc123def456`)
      .flush(
        { detail: { code: 'already_claimed', message: 'Someone has claimed that name.' } },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(claiming).rejects.toMatchObject({ status: 409, code: 'already_claimed' });
  });

  it('refuses to claim in the sample build', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
    await expect(
      TestBed.inject(JoinControlService).claim('abc123def456', 'm-2'),
    ).rejects.toMatchObject({ code: 'already_member' });
  });
});
