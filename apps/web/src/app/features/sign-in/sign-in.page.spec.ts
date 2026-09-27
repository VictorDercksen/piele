import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AlertService } from '../../core/feedback/alert.service';
import { SignInPage } from './sign-in.page';

describe('SignInPage', () => {
  function setup(auth: Partial<AuthService> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { configured: true, email: signal(null), ...auth },
        },
      ],
    });
    const fixture = TestBed.createComponent(SignInPage);
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    const field = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)!;
    const type = (id: string, value: string) => {
      field(id).value = value;
      field(id).dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      root.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      await fixture.whenStable();
    };
    return { fixture, root, alerts, field, type, submit };
  }

  it('warns once per attempt about every field to fix and focuses the first', async () => {
    const { fixture, root, alerts, field, type, submit } = setup();
    const warn = vi.spyOn(alerts, 'warn');
    await fixture.whenStable();

    type('email', 'not-an-email');
    type('password', 'short');
    await submit();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Enter a valid email address.', {
      key: 'sign-in',
      details: ['Use at least 8 characters.'],
    });
    expect(document.activeElement).toBe(field('email'));
    expect(field('email').getAttribute('aria-invalid')).toBe('true');
    expect(field('password').getAttribute('aria-invalid')).toBe('true');
    expect(field('email').hasAttribute('aria-describedby')).toBe(false);
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(alerts.alerts()).toHaveLength(1);

    type('email', 'member@example.com');
    await submit();
    expect(warn).toHaveBeenLastCalledWith('Use at least 8 characters.', {
      key: 'sign-in',
      details: [],
    });
    expect(document.activeElement).toBe(field('password'));
    expect(field('email').getAttribute('aria-invalid')).toBe('false');
    expect(alerts.alerts()).toHaveLength(1);
  });

  it('shows a refused sign-in as a red card and clears it once signed in', async () => {
    let refuse = true;
    const { fixture, root, alerts, type, submit } = setup({
      signInWithPassword: () =>
        refuse ? Promise.reject(new Error('Invalid login credentials.')) : Promise.resolve(),
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();

    type('email', 'member@example.com');
    type('password', 'long enough');
    await submit();
    expect(alerts.alerts()).toMatchObject([
      { severity: 'error', message: 'Invalid login credentials.', key: 'sign-in', timeout: null },
    ]);
    expect(root.querySelector('[role=alert]')).toBeNull();

    refuse = false;
    await submit();
    expect(navigate).toHaveBeenCalledOnce();
    expect(alerts.alerts()).toEqual([]);
  });

  it('keeps the confirm-email guidance inline', async () => {
    const { fixture, root, alerts, type, submit } = setup({
      signUp: () => Promise.resolve(true),
    });
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('.switch')!.click();
    type('email', 'member@example.com');
    type('password', 'long enough');
    await submit();
    expect(root.querySelector('.notice')?.textContent).toContain('confirm your email address');
    expect(alerts.alerts()).toEqual([]);
  });
});
