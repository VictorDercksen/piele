import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/feedback/alert.service';
import { LeagueContext } from '../../core/league/league-context';
import { NoLeaguePage } from './no-league.page';

describe('NoLeaguePage', () => {
  it('warns about a code that does not parse, then opens a pasted join link', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { configured: false, email: signal(null) } },
        {
          provide: LeagueContext,
          useValue: {
            accountError: signal(null),
            account: signal(null),
            home: () => null,
            ensureAccount: () => Promise.resolve(null),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(NoLeaguePage);
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>('#join-code')!;
    const submit = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      root.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      await fixture.whenStable();
    };

    await submit('not a code');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('not a join link or code');
    expect(warn.mock.calls[0][1]).toEqual({ key: 'join-code' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(input);
    expect(root.querySelector('[role=alert]')).toBeNull();

    await submit('https://pavilion.example/join/abc123def456');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(navigate).toHaveBeenCalledWith(['/join', 'abc123def456']);
    expect(alerts.alerts()).toEqual([]);
  });
});
